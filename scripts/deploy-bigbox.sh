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
darkpix_public_url="${DARKPIX_PUBLIC_URL:-https://www.ne-gro.com}"
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

for attempt in {1..30}; do
  if check_darkpix_health; then
    echo "DarkPix health check passed on http://127.0.0.1:8092/healthz"
    break
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
  local observed_release
  if command -v curl >/dev/null 2>&1; then
    observed_release="$(curl -fsS --max-time 8 "$darkpix_public_url/version.txt" 2>/dev/null)" || return 1
  elif command -v wget >/dev/null 2>&1; then
    observed_release="$(wget -q -T 8 -O - "$darkpix_public_url/version.txt" 2>/dev/null)" || return 1
  else
    echo "curl or wget is required to verify the public release." >&2
    return 1
  fi
  [[ "$observed_release" == "$darkpix_release" ]]
}

for attempt in {1..20}; do
  if check_public_release; then
    echo "Public release verified: $darkpix_public_url/version.txt -> $darkpix_release"
    exit 0
  fi
  if [[ "$attempt" -eq 20 ]]; then
    echo "The public route did not serve release $darkpix_release from $darkpix_public_url/version.txt." >&2
    exit 1
  fi
  sleep 1
done
