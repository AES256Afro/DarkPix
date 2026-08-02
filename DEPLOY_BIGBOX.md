# Deploy DarkPix on BigBox

DarkPix runs as a static production build in an unprivileged Nginx container. It joins the existing private Docker network used by the `bigbox-gridless` Cloudflare Tunnel.

## Topology

```text
ne-gro.com
  -> Cloudflare edge
  -> outbound bigbox-gridless tunnel
  -> Docker service darkpix:8080
  -> production DarkPix files
```

The service also binds to `127.0.0.1:8092` for host-only health checks. BigBox ports 80 and 443 remain assigned to Pi-hole.

## Security boundaries

- No router port forwarding
- No public origin record for the BigBox address
- Loopback-only host binding
- Read-only container filesystem with a small temporary filesystem
- All Linux capabilities dropped
- `no-new-privileges` enabled
- Process creation limited to 64 PIDs alongside explicit memory and CPU limits
- Unprivileged Nginx worker on port 8080
- Build and runtime base images pinned to immutable registry digests
- Service-local Docker logs rotated at 10 MB with three retained files
- Strict content, framing, referrer, and browser-permission headers
- All content-hashed production assets cached immutably; missing asset paths return 404 for worker fallback, entry HTML is always revalidated, and release identity is never stored
- Existing Gridless tunnel token stays in the Gridless project and is never copied

## Install

```bash
mkdir -p "$HOME/Projects"
git clone https://github.com/AES256Afro/DarkPix.git "$HOME/Projects/DarkPix"
cd "$HOME/Projects/DarkPix"
chmod +x scripts/deploy-bigbox.sh
./scripts/deploy-bigbox.sh
```

The deploy command waits for both Docker's own `healthy` state and the loopback endpoint before continuing. It then inspects the created container and rejects the rollout unless Docker applied the unprivileged user, read-only root, dropped capabilities, no-new-privileges, PID, memory, CPU, temporary-filesystem, log-rotation, and loopback-port boundaries. An `unhealthy` or incorrectly constrained state fails before public-route verification.

Verify the private origin:

```bash
curl -fsS http://127.0.0.1:8092/healthz
curl -fsS http://127.0.0.1:8092/version.txt
curl -I http://127.0.0.1:8092/
docker compose ps
```

## Live Cloudflare routes

The `bigbox-gridless` tunnel has these published applications:

| Hostname | Service type | Service URL |
| --- | --- | --- |
| `ne-gro.com` | HTTP | `http://darkpix:8080` |
| `www.ne-gro.com` | HTTP | `http://darkpix:8080` |

Both routes and their proxied DNS records were verified over HTTPS. If they ever need to be recreated, open **Networking > Tunnels > bigbox-gridless > Routes** and use the values above. Do not replace the domain's Proton Mail, DMARC, or existing application records.

## Update

```bash
cd "$HOME/Projects/DarkPix"
git status -sb
git pull --ff-only origin main
./scripts/deploy-bigbox.sh
curl -fsS http://127.0.0.1:8092/healthz
curl -fsS http://127.0.0.1:8092/version.txt
curl -I https://ne-gro.com/
```

The Cloudflare connector does not need a restart after an ordinary DarkPix update.

The deploy script refuses tracked or untracked worktree changes before calculating the release identity, so `/version.txt` always names the exact source inside the image. It also rejects a `DARKPIX_RELEASE` override that differs from the checked-out commit, preventing an otherwise clean image from carrying a false marker. It then snapshots the currently running image before rollout. It waits for both `https://ne-gro.com/version.txt` and `https://www.ne-gro.com/version.txt` to return the exact Git release through Cloudflare before it reports success. Each route must expose the same release in its HTML build marker, reject write methods, explicitly exclude both release identity and live health from browser and Cloudflare caching, avoid a Cloudflare cache hit for either probe, return a real `404` for a release-scoped missing asset, serve every HTML-referenced JavaScript and CSS file with its executable MIME type and immutable cache policy, and provide HSTS, no-store service-worker delivery, CSP framing restrictions, MIME hardening, referrer and permissions policies, and same-origin opener/resource policies. A build-start, container-health, runtime-hardening, or public-gate failure automatically recreates the service from the snapshotted image and verifies its loopback health, runtime constraints, release identity, exact restored version, HTML build marker, and read-only public method gate through both hostnames. The rollback image is retained for diagnosis if public recovery cannot be proven. Git remains on the attempted commit for diagnosis. Set `DARKPIX_PUBLIC_URL` only when intentionally replacing the two-route gate with one alternate hostname.

Both supported verification clients, curl and wget, must observe HTTP 405 for a write attempt against the public health route before a rollout or rollback is accepted.

The HTML shell revalidates in browsers and carries `Cloudflare-CDN-Cache-Control: no-store`; deployment rejects a cached edge HIT so a new worker cannot be paired with stale navigation HTML.

## Roll back

Find the prior deploy commit, then switch to it and rebuild:

```bash
cd "$HOME/Projects/DarkPix"
git log --oneline -10
git switch --detach <known-good-commit>
./scripts/deploy-bigbox.sh
```

Return to current `main` after the issue is resolved:

```bash
git switch main
git pull --ff-only origin main
./scripts/deploy-bigbox.sh
```

To stop only DarkPix:

```bash
cd "$HOME/Projects/DarkPix"
docker compose stop darkpix
```

Remove the two DarkPix published application routes in Cloudflare if the public hostnames should also stop resolving.
