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

echo "Building and starting the loopback-only DarkPix web service..."
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
echo "Cloudflare service target: http://darkpix:8080"
