# 🚇 Numberverse tunnel failover (#302)

> The box serves `kids.munna-khan.xyz` through ONE Cloudflare named tunnel
> (`7d5273d2-31dc-41ca-94b0-d36c1ad2d5a0`), run as systemd `cloudflared`, which
> also routes the family's other domains. A single tunnel is a single point of
> failure: if it hangs, the site is down until someone notices.

## Two failure modes, two defenses

| Failure | What it looks like | Defense |
|---|---|---|
| **Tunnel process hang / edge drop** | `cloudflared` still running, but no traffic flows | ✅ **`tunnel-watch.sh`** — restarts `cloudflared` after N consecutive public-hostname failures. **Deployed now.** |
| **Box down / ISP outage / box loss** | No process to restart | ⏳ **Standby tunnel** — a second Cloudflare tunnel + DNS repoint. **Needs one operator step** (create tunnel #2). Ready-to-run unit provided. |

## ① Tunnel watchdog (DEPLOYED)

`infra/tunnel/tunnel-watch.sh` probes the **public** hostname
(`https://kids.munna-khan.xyz/?nvtun=<random>`) — the whole path: box tunnel →
Cloudflare edge → origin. A cache-busting query means a dead tunnel can't hide
behind a cached 200. After `TUNNEL_WATCH_THRESHOLD` (default 4) **consecutive**
failures it restarts `cloudflared` and resets. Fail-open: transient blips and
any uncertainty never restart a healthy tunnel (false restarts = real downtime).

**Arm (on the box, one time):**

```bash
ssh munna@192.168.0.104
# crontab -e
* * * * *  bash /home/munna/numberverse-demo/infra/tunnel/tunnel-watch.sh
```

Tunables via env: `TUNNEL_WATCH_URL`, `TUNNEL_WATCH_SERVICE`, `TUNNEL_WATCH_THRESHOLD`, `TUNNEL_WATCH_MAX_TIME`.

**Test:** `TUNNEL_WATCH_THRESHOLD=1 bash .../tunnel-watch.sh` with the box healthy → exits 0, no restart. Force-fail by pointing `TUNNEL_WATCH_URL` at a dead host → after N probes it restarts the service.

## ② Standby tunnel (OPERATOR STEP — needs Cloudflare dashboard/API)

This covers a whole-box outage, which the watchdog can't. It needs one
one-time action from the account owner because it lives in the **Cloudflare
dashboard**: create a second named tunnel.

1. **Dashboard** → Zero Trust → Networks → Tunnels → **Create a tunnel**
   (name e.g. `numberverse-standby`), deploy method "cloudflared". Copy its
   **token** (starts `eyJhIjoi…`).
2. **On the box**, drop the token into the provided unit and enable it:
   ```bash
   sudo cp infra/tunnel/cloudflared-standby.service /etc/systemd/system/
   sudo sed -i 's#REPLACE_WITH_TUNNEL2_TOKEN#<TOKEN2>#' /etc/systemd/system/cloudflared-standby.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now cloudflared-standby
   ```
3. **Route the hostname.** A hostname routes through ONE tunnel, so to cut
   over to the standby during a box outage, repoint `kids.munna-khan.xyz`'s
   CNAME to the standby tunnel's UUID in the dashboard (Tunnels → DNS tab), or
   via the Cloudflare API (needs a Zone.DNS edit token):
   ```bash
   curl -X PATCH "https://api.cloudflare.com/client/v4/zones/<ZONE>/dns_records/<REC>" \
     -H "Authorization: Bearer <CF_API_TOKEN>" -H "Content-Type: application/json" \
     -d '{"content":"<STANDBY_TUNNEL_UUID>.cfargotunnel.com","proxied":true}'
   ```

**What the standby carries:** `docs/ARCHITECTURE.md` — the same `web:8080`
origin, so `kids.munna-khan.xyz` (and siblings) serve identically through the
second path. No rebuild; the origin is host-local.

**Test procedure (when configured):** stop the primary (`sudo systemctl stop
cloudflared`), repoint DNS, verify `https://kids.munna-khan.xyz/?nvt=test`
serves the stamp; then restore. Full failover test is an operator action.

## Why not a Load Balancer / automatic multi-tunnel?

Cloudflare's free tier has no load balancing; a hostname resolves to one
tunnel. Auto-DNS-repoint via API (watchdog) is possible but needs a
Zone.DNS-edit token on the box — an account-credential decision. The docs
above make the cutover a documented 1-command job rather than a mystery.
