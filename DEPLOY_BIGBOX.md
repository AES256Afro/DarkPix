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
- Unprivileged Nginx worker on port 8080
- Strict content, framing, referrer, and browser-permission headers
- Hashed JavaScript and CSS cached immutably; entry HTML always revalidated
- Existing Gridless tunnel token stays in the Gridless project and is never copied

## Install

```bash
mkdir -p "$HOME/Projects"
git clone https://github.com/AES256Afro/DarkPix.git "$HOME/Projects/DarkPix"
cd "$HOME/Projects/DarkPix"
chmod +x scripts/deploy-bigbox.sh
./scripts/deploy-bigbox.sh
```

Verify the private origin:

```bash
curl -fsS http://127.0.0.1:8092/healthz
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
curl -I https://ne-gro.com/
```

The Cloudflare connector does not need a restart after an ordinary DarkPix update.

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
