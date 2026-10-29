# mythuso.co.za on Ngwempisi (102.202.45.201)

The founder decided on 29 October 2026 to move mythuso.co.za off liqzar-server onto Ngwempisi: a
move, not a copy, so once traffic has switched the site comes off liqzar (deploy/RUNBOOK.md,
_Backing it out_). MpumiWorks and BidZA are planned to leave 102.202.45.201 separately.

## Why the box is shaped differently

liqzar-server has a host nginx that MyThuso adds one site file to. Ngwempisi has none: ports 80 and
443 belong to `lima-gateway-1`, a container that also serves MpumiWorks, Lima, golima.co.za,
g1.mythuso.co.za and the Woodpecker CI. So here MyThuso is:

| Piece | Where |
| --- | --- |
| `mythuso-site` | nginx container running `deploy/nginx/mythuso.conf`, rewritten only for root, logs, listen and the real client address |
| `mythuso-assistant` | Node 22 container in the site's network namespace, so the service keeps `127.0.0.1:8791` and is reachable only through `/assistant/` |
| `/opt/mythuso/current` | the live release, a symlink swapped in one rename, as `/var/www/mythuso` is on liqzar |
| gateway `conf.d/mythuso.conf` | TLS for both names and a proxy to `mythuso-site`; nothing else (`gateway.conf`) |
| `/etc/mythuso/*.env` | root-only, read by Docker when the assistant starts |
| `/var/lib/mythuso-assistant` | the assistant's state (settings history, vault, founder audit, speech ceiling), 0700, uid 61791 |

`compose.yaml` explains why a deploy never recreates the containers and never restarts the
assistant. `deploy.sh` builds through `deploy/deploy.sh` (`MYTHUSO_BUILD_ONLY=1`), so the build and
every refusal about what it may carry stay in one file.

## The move, in order

Nothing below changes what a visitor gets until step 5. Until then liqzar answers for
mythuso.co.za and Ngwempisi is tested by name with `--resolve`.

1. **The certificate.** Copy liqzar's current certificate into the gateway's store as
   `~/lima/deploy/certs/migrated/mythuso.co.za/{fullchain,privkey}.pem` (0644 and 0600, owner
   wtgbyasz). It is not under `live/`, so certbot can still issue `live/mythuso.co.za` here later.
2. **The secrets and the state, by the founder's decision of 29 October 2026.** `/etc/mythuso/assistant.env`
   and `/etc/mythuso/founder.env` are copied server to server from liqzar (root 0600 at both ends,
   through ssh and never onto a disk in between), and so is `/var/lib/private/mythuso-assistant/`
   into `/var/lib/mythuso-assistant/` (owner 61791, 0700, files 0600). This departs from the rule that
   these lines are typed by hand on the box; it was the founder's call, to avoid re-pairing the
   authenticator and re-entering the vault key, which would make the vault unreadable. The vault key
   moves with founder.env, so stored provider keys keep working.
3. **Deploy.** `CERT_DIR=migrated/mythuso.co.za ./deploy/ngwempisi/deploy.sh`. The first run creates
   the two containers, so the assistant starts reading the copied files.
4. **Prove it before anyone sees it**, from your machine:
   `for p in / /app/ /shop/ /status/ /status /staff/ /assistant/health; do curl -s -o /dev/null -w "$p %{http_code}\n" --resolve mythuso.co.za:443:102.202.45.201 https://mythuso.co.za$p; done`
   and the founder door:
   `curl -s -o /dev/null -w '%{http_code}\n' --resolve mythuso.co.za:443:102.202.45.201 -H 'X-MyThuso-Founder: 1' https://mythuso.co.za/assistant/v1/founder/keys` → `401`.
5. **DNS.** The A records for `mythuso.co.za` and `www` (nameservers at tld-ns) to 102.202.45.201.
   Keep liqzar serving until the old record's TTL has passed: both boxes answer correctly meanwhile.

## After the switch

- Issue a certificate on this box (the gateway's catch-all already serves the ACME challenge):
  `docker run --rm -v ~/lima/deploy/certs:/etc/letsencrypt -v /var/www/certbot:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot -d mythuso.co.za -d www.mythuso.co.za --cert-name mythuso.co.za`,
  add `mythuso.co.za` to `/usr/local/bin/g1-cert-renew.sh`, then deploy again with the default
  `CERT_DIR` and delete `certs/migrated/`.
- `sudo systemctl enable --now mythuso-healthcheck.timer`, then
  `sudo systemctl start mythuso-healthcheck.service && journalctl -u mythuso-healthcheck -n 20 --no-pager`
  should end in `ok`.
- After a quiet day, take the site off liqzar (deploy/RUNBOOK.md, _Backing it out_), stop and
  disable `assistant-api.service` and `mythuso-healthcheck.timer` there, and remove `/etc/mythuso`'s
  two secret files from liqzar so they live in one place.

## Rolling back

- A bad release: `./deploy/ngwempisi/rollback.sh` lists, `./deploy/ngwempisi/rollback.sh <release>` moves.
- The assistant: `server.mjs.prev` beside `server.mjs` in `/opt/mythuso/assistant`, then
  `docker restart mythuso-assistant`, as on liqzar.
- The whole move, before DNS: `docker exec lima-gateway-1 rm -f /etc/nginx/conf.d/mythuso.conf && docker exec lima-gateway-1 nginx -t && docker exec lima-gateway-1 nginx -s reload`, then
  `docker compose -f /opt/mythuso/compose.yaml down`. After DNS: point the records back at
  154.66.198.238, which is still serving until the backing out above.
