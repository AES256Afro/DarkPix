#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

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

echo "Building and starting DarkPix release $darkpix_release on the loopback-only web service..."
docker compose up -d --build darkpix

check_darkpix_health() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8092/healthz >/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null http://127.0.0.1:8092/healthz
  else
    docker compose exec -T darkpix wget -q -O /dev/null http://127.0.0.1:8080/healthz
  fi
}

darkpix_container_id="$(docker compose ps -q darkpix)"
if [[ -z "$darkpix_container_id" ]]; then
  echo "DarkPix container was not created." >&2
  exit 1
fi

docker_health_status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$darkpix_container_id"
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
    exit 1
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "DarkPix did not become healthy. Inspect: docker compose logs darkpix" >&2
    exit 1
  fi
  sleep 1
done

docker compose ps
echo "Deployed release: $(docker compose exec -T darkpix wget -q -O - http://127.0.0.1:8080/version.txt)"
echo "Cloudflare service target: http://darkpix:8080"

check_public_release() {
  local public_url="$1"
  local observed_release
  local public_headers
  local health_body
  local health_headers
  local missing_asset_status
  if command -v curl >/dev/null 2>&1; then
    observed_release="$(curl -fsS --max-time 8 "$public_url/version.txt" 2>/dev/null)" || return 1
    public_headers="$(curl -fsSI --max-time 8 "$public_url/" 2>/dev/null)" || return 1
    health_body="$(curl -fsS --max-time 8 "$public_url/healthz" 2>/dev/null)" || return 1
    health_headers="$(curl -fsSI --max-time 8 "$public_url/healthz" 2>/dev/null)" || return 1
    missing_asset_status="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$public_url/assets/missing-$darkpix_release.js" 2>/dev/null)" || return 1
    curl -fsSI --max-time 8 "$public_url/sw.js?v=$darkpix_release" 2>/dev/null | grep -qi '^cache-control:.*no-store' || return 1
  elif command -v wget >/dev/null 2>&1; then
    observed_release="$(wget -q -T 8 -O - "$public_url/version.txt" 2>/dev/null)" || return 1
    public_headers="$(wget -q -T 8 --server-response --spider "$public_url/" 2>&1)" || return 1
    health_body="$(wget -q -T 8 -O - "$public_url/healthz" 2>/dev/null)" || return 1
    health_headers="$(wget -q -T 8 --server-response --spider "$public_url/healthz" 2>&1)" || return 1
    missing_asset_status="$(wget -T 8 --server-response --spider "$public_url/assets/missing-$darkpix_release.js" 2>&1 || true)"
    grep -Eq 'HTTP/[0-9.]+ 404' <<<"$missing_asset_status" || return 1
    wget -q -T 8 --server-response --spider "$public_url/sw.js?v=$darkpix_release" 2>&1 | grep -qi 'cache-control:.*no-store' || return 1
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
  [[ "$health_body" == "ok" ]] || return 1
  if command -v curl >/dev/null 2>&1; then [[ "$missing_asset_status" == "404" ]] || return 1; fi
  grep -qi 'cache-control:.*no-store' <<<"$health_headers" || return 1
  if grep -qi 'cf-cache-status: *HIT' <<<"$health_headers"; then return 1; fi
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
    exit 1
  fi
done
