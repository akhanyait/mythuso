# Deploying MyThuso

`./deploy/deploy.sh` publishes the landing page and the app preview. It adds `/var/www/mythuso` and
one nginx site file, tests the configuration before reloading, and touches nothing else on the host.

```sh
./deploy/deploy.sh                        # liqzar-server, mythuso.liqzar.co.za
HOST=mythuso.co.za ./deploy/deploy.sh     # somewhere else
```

Verification runs with a `Host:` header against the server's own loopback, so a deployment can be
confirmed before DNS is pointed anywhere.

## What is deployed

| Path | What |
|---|---|
| `/` | The public landing page |
| `/app/` | The app preview — runs with no backend, exactly as it does locally |
| `/assets/` | Hashed bundles, cached for a year; HTML is never cached |

## The identity service is not turned on

`deploy/mythuso-api.service` is the unit for it, and `deploy/nginx/mythuso.conf` has its proxy block
written but commented out. Both are deliberate. The service signs people in with a one-time code,
and a one-time-code endpoint reachable over plain http is a way to hand out accounts. It also
refuses to start in production without an SMS provider, because a code nobody receives is not a
sign-in method.

To turn it on, in this order:

1. **DNS** — point the host at the server.
2. **TLS** — `certbot --nginx -d <host>`.
3. **A number to send from** — an SMS provider account.
4. **Install it**

   ```sh
   ssh <target> 'adduser --system --group --home /opt/mythuso mythuso && mkdir -p /var/lib/mythuso /etc/mythuso'
   rsync -az apps/api/ <target>:/opt/mythuso/api/
   scp deploy/mythuso-api.service <target>:/etc/systemd/system/
   ```

5. **Configure it** — `/etc/mythuso/api.env`, readable only by root:

   ```
   MYTHUSO_ENV=production
   MYTHUSO_AUTH_PEPPER=<64 random characters, never committed>
   MYTHUSO_SMS_PROVIDER=<provider>
   MYTHUSO_ALLOWED_ORIGINS=https://<host>
   MYTHUSO_DB=/var/lib/mythuso/identity.db
   MYTHUSO_PORT=8787
   ```

   A weak pepper, an `http` origin, a missing provider, or the development setting that returns
   codes in the response will each stop the service from starting. That is the point of them.

6. **Uncomment the `/api/` block** in the nginx site, `nginx -t`, reload.
7. `systemctl enable --now mythuso-api`

Rotating the pepper signs everyone out, because every stored session digest stops matching. That is
the intended behaviour, not a side effect.

## What this host already runs

agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and skillsonwheels.co.za, plus PostgreSQL
and two node applications on loopback ports 3000 and 4000. MyThuso adds a site file and, later, a
service on 8787. Nothing here modifies any of them, and `nginx -t` gates every reload.
