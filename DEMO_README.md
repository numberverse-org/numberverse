# Numberverse — Demo Deployment

One command puts a live demo on **munna@192.168.0.104**, exposed to the world
through a free **Cloudflare quick tunnel** (HTTPS, works anywhere, no port
forwarding, no static IP).

**One origin** = the tunnel host. The kid app and API share a domain, so there
are zero CORS calls and the PWA works offline.

---

## Stack

| Service     | Runs on the box | What it does                       | Served at        |
|-------------|-----------------|-------------------------------------|------------------|
| `web`       | nginx           | kid PWA (static) + `/api` proxy     | `/`, `/api/*`    |
| `api`       | FastAPI         | auth / kids / progress              | `/api/v1/*`      |
| `postgres`  | PostgreSQL 16   | data (persisted in a volume)        | internal         |
| `cloudflared`| Cloudflare     | quick tunnel → `web:80`             | the tunnel URL   |

Parent portal + admin console are intentionally **not** in the demo — the kid
app is the showroom. They build separately for production.

---

## Deploy (one command, from this machine)

```bash
./infra/deploy/scripts/deploy.sh
```

It rsyncs the repo, then builds + boots **on the box** (npm/vite/docker all run
there, not on your laptop), then prints the tunnel URL.

### First run only
The script copies `infra/deploy/.env.production` from the example on the box.
Edit the secrets there if you want non-defaults:
```bash
ssh munna@192.168.0.104
cd ~/numberverse-demo/infra/deploy
nano .env.production        # NV_JWT_SECRET, NV_ADMIN_PASSWORD
./deploy.sh                 # or: docker compose --env-file .env.production up -d --build
```

Secrets never leave the box (rsync excludes `.env*`, and `.env.production` is
git-ignored).

---

## The live URL

Every deploy prints it. Or any time:
```bash
./infra/deploy/scripts/get-tunnel-url.sh
```
Or: `ssh munna@192.168.0.104` then
`docker compose -f ~/numberverse-demo/infra/deploy/docker-compose.prod.yml logs -f cloudflared`

Look for `https://<random>.trycloudflare.com` in the logs.

> Quick tunnels are **ephemeral** — the hostname changes each restart. For a
> stable link, set up a Cloudflare *named* tunnel and change the `cloudflared`
> command in `docker-compose.prod.yml` to `tunnel --no-autoupdate run --token <TOKEN>`.

---

## Demo accounts

| App   | URL          | Login                            |
|-------|--------------|----------------------------------|
| Kid   | `/`          | no login — tap and play          |
| API   | `/api/v1`    | `demo@numberverse.dev` / `demo1234` |

On first boot the API seeds: admin (from env), demo parent `demo@…/demo1234`,
and a demo kid (Aria 🦊, born 2021). The PWA is fully offline — gameplay works
with the network off; progress syncs when a parent logs in.

---

## Manual ops (on the box)

```bash
cd ~/numberverse-demo/infra/deploy
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build   # deploy
docker compose -f docker-compose.prod.yml logs -f cloudflared                        # tunnel URL
docker compose -f docker-compose.prod.yml logs -f api                                # API logs
docker compose -f docker-compose.prod.yml restart cloudflared                        # fresh URL
docker compose -f docker-compose.prod.yml down                                       # stop (keep data)
docker compose -f docker-compose.prod.yml down -v                                    # wipe DB too
```

---

## Why it's simple

- **No GitHub Actions** — cloud runners can't reach a private LAN IP anyway; the
  deploy script IS the CI/CD. Add a self-hosted runner on the box later if you
  want push-triggered deploys.
- **No installs on your laptop** — the box builds everything.
- **One origin** — the kid app bakes `VITE_API_URL=/api/v1` at build time and
  nginx proxies `/api` to FastAPI. HTTPS → same-origin, always.
- **Slow npm registry on the box is handled** — `.npmrc` raises fetch timeouts.
