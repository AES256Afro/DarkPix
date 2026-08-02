#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Refusing to deploy a dirty DarkPix worktree because its release identity would be false." >&2
  echo "Commit, stash, or remove the reported changes before deploying." >&2
  git status --short >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}
docker compose version >/dev/null

if ! docker network inspect gridless_gridless >/dev/null 2>&1; then
  echo "The existing BigBox Cloudflare network gridless_gridless was not found." >&2
  echo "Start the Gridless tunnel stack before deploying DarkPix." >&2
  exit 1
fi

darkpix_release="${DARKPIX_RELEASE:-$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')}"
darkpix_public_urls=("https://ne-gro.com" "https://www.ne-gro.com")
if [[ -n "${DARKPIX_PUBLIC_URL:-}" ]]; then
  darkpix_public_urls=("$DARKPIX_PUBLIC_URL")
fi
export DARKPIX_RELEASE="$darkpix_release"

check_darkpix_health() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8092/healthz >/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null http://127.0.0.1:8092/healthz
  else
    docker compose exec -T darkpix wget -q -O /dev/null http://127.0.0.1:8080/healthz
  fi
}

check_container_hardening() {
  local container_id="$1"
  local core_limits
  core_limits="$(docker inspect --format '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.Privileged}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.Memory}}|{{.HostConfig.NanoCpus}}' "$container_id" 2>/dev/null)" || return 1
  [[ "$core_limits" == "nginx|true|false|64|402653184|1500000000" ]] || return 1
  [[ "$(docker inspect --format '{{json .HostConfig.CapDrop}}' "$container_id" 2>/dev/null)" == '["ALL"]' ]] || return 1
  [[ "$(docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$container_id" 2>/dev/null)" == '["no-new-privileges:true"]' ]] || return 1
  [[ "$(docker inspect --format '{{index .HostConfig.Tmpfs "/tmp"}}' "$container_id" 2>/dev/null)" == "rw,noexec,nosuid,size=32m" ]] || return 1
  [[ "$(docker inspect --format '{{index .HostConfig.LogConfig.Config "max-size"}}|{{index .HostConfig.LogConfig.Config "max-file"}}' "$container_id" 2>/dev/null)" == "10m|3" ]] || return 1
  docker inspect --format '{{json .HostConfig.PortBindings}}' "$container_id" 2>/dev/null | grep -Fq '"HostIp":"127.0.0.1","HostPort":"8092"'
}

previous_container_id="$(docker compose ps -q darkpix 2>/dev/null || true)"
previous_image_id=""
previous_release=""
if [[ -n "$previous_container_id" ]]; then
  previous_image_id="$(docker inspect --format '{{.Image}}' "$previous_container_id" 2>/dev/null || true)"
  previous_release="$(docker compose exec -T darkpix wget -q -O - http://127.0.0.1:8080/version.txt 2>/dev/null || true)"
  if [[ -n "$previous_image_id" ]]; then docker image tag "$previous_image_id" darkpix-web:rollback; fi
fi

check_restored_public_routes() {
  [[ -n "$previous_release" ]] || return 0
  local public_url
  local restored_release
  for public_url in "${darkpix_public_urls[@]}"; do
    if command -v curl >/dev/null 2>&1; then
      restored_release="$(curl -fsS --max-time 8 "$public_url/version.txt?rollback=$previous_release" 2>/dev/null)" || return 1
      curl -fsS --max-time 8 "$public_url/healthz?rollback=$previous_release" >/dev/null 2>&1 || return 1
    elif command -v wget >/dev/null 2>&1; then
      restored_release="$(wget -q -T 8 -O - "$public_url/version.txt?rollback=$previous_release" 2>/dev/null)" || return 1
      wget -q -T 8 -O /dev/null "$public_url/healthz?rollback=$previous_release" 2>/dev/null || return 1
    else
      return 1
    fi
    [[ "$restored_release" == "$previous_release" ]] || return 1
  done
}

rollback_previous_release() {
  if [[ -z "$previous_image_id" ]]; then
    echo "No previous DarkPix image was available for automatic rollback." >&2
    return 1
  fi
  echo "Restoring previously running DarkPix release ${previous_release:-unknown}..." >&2
  docker image tag darkpix-web:rollback darkpix-web:local
  docker compose up -d --no-build --force-recreate darkpix >/dev/null
  local rollback_container_id
  for attempt in {1..20}; do
    rollback_container_id="$(docker compose ps -q darkpix)"
    if [[ -n "$rollback_container_id" ]] &&
      [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$rollback_container_id")" == "healthy" ]] &&
      check_darkpix_health &&
      check_container_hardening "$rollback_container_id"; then
      local restored_release
      restored_release="$(docker compose exec -T darkpix wget -q -O - http://127.0.0.1:8080/version.txt)"
      if [[ -n "$previous_release" && "$restored_release" != "$previous_release" ]]; then
        echo "Rollback health passed but release identity was $restored_release instead of $previous_release." >&2
        return 1
      fi
      for public_attempt in {1..20}; do
        if check_restored_public_routes; then
          echo "Automatic rollback restored loopback and public release $restored_release." >&2
          docker image rm darkpix-web:rollback >/dev/null 2>&1 || true
          return 0
        fi
        sleep 1
      done
      echo "Rollback restored loopback release $restored_release but public route recovery was not verified." >&2
      return 1
    fi
    sleep 1
  done
  echo "Automatic rollback did not restore a healthy DarkPix container." >&2
  return 1
}

echo "Building and starting DarkPix release $darkpix_release on the loopback-only web service..."
if ! docker compose up -d --build darkpix; then
  rollback_previous_release || true
  exit 1
fi

darkpix_container_id="$(docker compose ps -q darkpix)"
if [[ -z "$darkpix_container_id" ]]; then
  echo "DarkPix container was not created." >&2
  rollback_previous_release || true
  exit 1
fi

docker_health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$darkpix_container_id" 2>/dev/null || printf 'missing\n'
}

for attempt in {1..30}; do
  health_status="$(docker_health_status)"
  if [[ "$health_status" == "healthy" ]] && check_darkpix_health; then
    echo "DarkPix container and host health checks passed on http://127.0.0.1:8092/healthz"
    break
  fi
  if [[ "$health_status" == "unhealthy" ]]; then
    echo "DarkPix container reported unhealthy. Inspect: docker compose logs darkpix" >&2
    docker compose logs --tail=40 darkpix >&2
    rollback_previous_release || true
    exit 1
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "DarkPix did not become healthy. Inspect: docker compose logs darkpix" >&2
    rollback_previous_release || true
    exit 1
  fi
  sleep 1
done

if ! check_container_hardening "$darkpix_container_id"; then
  echo "DarkPix became healthy without the required unprivileged, read-only, loopback-only resource limits." >&2
  rollback_previous_release || true
  exit 1
fi
echo "DarkPix container hardening and resource limits verified from Docker runtime state."

docker compose ps
echo "Deployed release: $(docker compose exec -T darkpix wget -q -O - http://127.0.0.1:8080/version.txt)"
echo "Cloudflare service target: http://darkpix:8080"

check_public_build_assets() {
  local public_url="$1"
  local public_html
  local references
  local asset_path
  local asset_url
  local asset_headers
  local verified_assets=0
  if command -v curl >/dev/null 2>&1; then
    public_html="$(curl -fsS --max-time 8 "$public_url/" 2>/dev/null)" || return 1
  elif command -v wget >/dev/null 2>&1; then
    public_html="$(wget -q -T 8 -O - "$public_url/" 2>/dev/null)" || return 1
  else
    return 1
  fi
  references="$(grep -oE '(src|href)="[^"]+\.(js|css)"' <<<"$public_html" | sed -E 's/^(src|href)="([^"]+)"$/\2/' | sort -u || true)"
  [[ -n "$references" ]] || return 1
  while IFS= read -r asset_path; do
    [[ -n "$asset_path" ]] || continue
    if [[ "$asset_path" == /* ]]; then
      asset_url="${public_url}${asset_path}"
    else
      asset_url="${public_url}/${asset_path#./}"
    fi
    if command -v curl >/dev/null 2>&1; then
      asset_headers="$(curl -fsSI --max-time 8 "$asset_url" 2>/dev/null)" || return 1
    else
      asset_headers="$(wget -q -T 8 --server-response --spider "$asset_url" 2>&1)" || return 1
    fi
    grep -qi 'cache-control:.*max-age=31536000.*immutable' <<<"$asset_headers" || return 1
    case "$asset_path" in
      *.js) grep -qi 'content-type:.*javascript' <<<"$asset_headers" || return 1 ;;
      *.css) grep -qi 'content-type:.*text/css' <<<"$asset_headers" || return 1 ;;
      *) return 1 ;;
    esac
    verified_assets=$((verified_assets + 1))
  done <<<"$references"
  [[ "$verified_assets" -ge 2 ]]
}

check_public_release() {
  local public_url="$1"
  local observed_release
  local release_headers
  local public_headers
  local health_body
  local health_headers
  local manifest_headers
  local icon_headers
  local title_headers
  local worker_headers
  local missing_asset_status
  if command -v curl >/dev/null 2>&1; then
    observed_release="$(curl -fsS --max-time 8 "$public_url/version.txt" 2>/dev/null)" || return 1
    release_headers="$(curl -fsSI --max-time 8 "$public_url/version.txt" 2>/dev/null)" || return 1
    public_headers="$(curl -fsSI --max-time 8 "$public_url/" 2>/dev/null)" || return 1
    health_body="$(curl -fsS --max-time 8 "$public_url/healthz" 2>/dev/null)" || return 1
    health_headers="$(curl -fsSI --max-time 8 "$public_url/healthz" 2>/dev/null)" || return 1
    manifest_headers="$(curl -fsSI --max-time 8 "$public_url/manifest.webmanifest?v=$darkpix_release" 2>/dev/null)" || return 1
    icon_headers="$(curl -fsSI --max-time 8 "$public_url/darkpix-icon.svg?v=$darkpix_release" 2>/dev/null)" || return 1
    title_headers="$(curl -fsSI --max-time 8 "$public_url/assets/darkpix-title.jpg?v=$darkpix_release" 2>/dev/null)" || return 1
    worker_headers="$(curl -fsSI --max-time 8 "$public_url/sw.js?v=$darkpix_release" 2>/dev/null)" || return 1
    missing_asset_status="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$public_url/assets/missing-$darkpix_release.js" 2>/dev/null)" || return 1
  elif command -v wget >/dev/null 2>&1; then
    observed_release="$(wget -q -T 8 -O - "$public_url/version.txt" 2>/dev/null)" || return 1
    release_headers="$(wget -q -T 8 --server-response --spider "$public_url/version.txt" 2>&1)" || return 1
    public_headers="$(wget -q -T 8 --server-response --spider "$public_url/" 2>&1)" || return 1
    health_body="$(wget -q -T 8 -O - "$public_url/healthz" 2>/dev/null)" || return 1
    health_headers="$(wget -q -T 8 --server-response --spider "$public_url/healthz" 2>&1)" || return 1
    manifest_headers="$(wget -q -T 8 --server-response --spider "$public_url/manifest.webmanifest?v=$darkpix_release" 2>&1)" || return 1
    icon_headers="$(wget -q -T 8 --server-response --spider "$public_url/darkpix-icon.svg?v=$darkpix_release" 2>&1)" || return 1
    title_headers="$(wget -q -T 8 --server-response --spider "$public_url/assets/darkpix-title.jpg?v=$darkpix_release" 2>&1)" || return 1
    worker_headers="$(wget -q -T 8 --server-response --spider "$public_url/sw.js?v=$darkpix_release" 2>&1)" || return 1
    missing_asset_status="$(wget -T 8 --server-response --spider "$public_url/assets/missing-$darkpix_release.js" 2>&1 || true)"
    grep -Eq 'HTTP/[0-9.]+ 404' <<<"$missing_asset_status" || return 1
  else
    echo "curl or wget is required to verify the public release." >&2
    return 1
  fi
  grep -qi 'strict-transport-security: max-age=31536000' <<<"$public_headers" || return 1
  grep -qi 'x-content-type-options: nosniff' <<<"$public_headers" || return 1
  grep -qi 'x-frame-options: DENY' <<<"$public_headers" || return 1
  grep -qi 'referrer-policy: strict-origin-when-cross-origin' <<<"$public_headers" || return 1
  grep -qi 'permissions-policy: camera=(), microphone=(), geolocation=(), payment=()' <<<"$public_headers" || return 1
  grep -qi "content-security-policy:.*default-src 'self'.*frame-ancestors 'none'" <<<"$public_headers" || return 1
  grep -qi 'cross-origin-opener-policy: same-origin' <<<"$public_headers" || return 1
  grep -qi 'cross-origin-resource-policy: same-origin' <<<"$public_headers" || return 1
  grep -qi 'cache-control:.*no-store' <<<"$release_headers" || return 1
  if grep -qi 'cf-cache-status: *HIT' <<<"$release_headers"; then return 1; fi
  [[ "$health_body" == "ok" ]] || return 1
  if command -v curl >/dev/null 2>&1; then [[ "$missing_asset_status" == "404" ]] || return 1; fi
  grep -qi 'cache-control:.*no-store' <<<"$health_headers" || return 1
  if grep -qi 'cf-cache-status: *HIT' <<<"$health_headers"; then return 1; fi
  grep -qi 'content-type:.*json' <<<"$manifest_headers" || return 1
  grep -qi 'cache-control:.*no-store' <<<"$manifest_headers" || return 1
  grep -qi 'content-type:.*image/svg+xml' <<<"$icon_headers" || return 1
  grep -qi 'cache-control:.*no-store' <<<"$icon_headers" || return 1
  grep -qi 'content-type:.*image/jpeg' <<<"$title_headers" || return 1
  grep -qi 'cache-control:.*no-cache' <<<"$title_headers" || return 1
  grep -qi 'content-type:.*javascript' <<<"$worker_headers" || return 1
  grep -qi 'cache-control:.*no-store' <<<"$worker_headers" || return 1
  for fixed_headers in "$manifest_headers" "$icon_headers" "$title_headers" "$worker_headers"; do
    if grep -qi 'cf-cache-status: *HIT' <<<"$fixed_headers"; then return 1; fi
  done
  check_public_build_assets "$public_url" || return 1
  [[ "$observed_release" == "$darkpix_release" ]]
}

for darkpix_public_url in "${darkpix_public_urls[@]}"; do
  public_verified=false
  for attempt in {1..20}; do
    if check_public_release "$darkpix_public_url"; then
      echo "Public release and live health verified: $darkpix_public_url -> $darkpix_release"
      public_verified=true
      break
    fi
    sleep 1
  done
  if [[ "$public_verified" != true ]]; then
    echo "The public route did not serve release $darkpix_release from $darkpix_public_url/version.txt." >&2
    rollback_previous_release || true
    exit 1
  fi
done

if [[ -n "$previous_image_id" ]]; then docker image rm darkpix-web:rollback >/dev/null 2>&1 || true; fi
