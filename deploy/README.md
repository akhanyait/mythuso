# Deploying MyThuso

`./deploy/deploy.sh` publishes the landing page and the app preview. It adds `/var/www/mythuso`, one
nginx site file and `/opt/mythuso/ops`, tests the configuration before reloading, and touches
nothing else on the host.

```sh
./deploy/deploy.sh                        # liqzar-server, mythuso.liqzar.co.za
HOST=mythuso.co.za ./deploy/deploy.sh     # somewhere else
```

Verification runs with a `Host:` header against the server's own loopback, so a deployment can be
confirmed before DNS is pointed anywhere.

## The five sites this box also serves

agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and skillsonwheels.co.za are on the same
machine and none of them are ours to break. Three things stand between a MyThuso deploy and one of
their owners finding out first:

- **A baseline.** Before it builds anything, the deploy asks each of the five what it answers over
  https and remembers it. At the end it asks again, and **exits non-zero if any of them changed**.
  The comparison is against the baseline, not against 200 — a neighbour that was already down stays
  already down and is not ours to have broken — and a single difference is looked at twice, twenty
  seconds apart, because a deploy that cries wolf is a deploy somebody starts finishing by hand.
- **`nginx -t` before any reload**, on the whole configuration, so a mistake in our site file is a
  refused deploy rather than five refused websites.
- **Nothing of theirs is ever edited.** MyThuso adds its own site file and nothing more, and the
  deploy refuses outright if some other site already claims our host name.

That check is the point of the script. Do not skip it by running the steps by hand.

## What is deployed

| Path | What |
|---|---|
| `/` | The public landing page |
| `/app/` | The app preview — runs with no backend, exactly as it does locally |
| `/assets/` | Hashed bundles, cached for a year; HTML is never cached |
| `/opt/mythuso/ops` | The scheduled jobs and their systemd units, reinstalled on every deploy |
| `/etc/mythuso/host.env` | The host the health check should be asking about, written by the deploy |

### What may never be deployed

`deploy/.deployignore` is passed to every rsync, and the deploy also looks at what is actually in the
build output before sending it: an env file, anything shaped like a key or a database, or anything
named like the proposal stops the deploy. The proposal in `Documentation/` is confidential and no
publication is authorised, so the reliable control is that it can never be synced.

Two of those patterns are BidZA's, learned the expensive way on this same box: a developer's
`.env.local` was once synced to production and baked a localhost URL into the client bundle, and
`rsync --delete` removed the server's own `.env.production` in the same pass. The pattern is every
env file now. Do not narrow it.

## What runs on a timer

Both units are installed by every deploy and **enabled by hand, once**. Installing is not starting:
the repository stays the truth about what the jobs do, and turning one on stays a decision.

| Unit | When | What it does |
|---|---|---|
| `mythuso-healthcheck.timer` | every 5 min | Asks the questions a patient's browser asks |
| `mythuso-backup.timer` | 02:40 SAST | Snapshots the identity database and restores it to check |

```sh
ssh <target> "systemctl enable --now mythuso-healthcheck.timer"
ssh <target> "systemctl enable --now mythuso-backup.timer"   # only once the service exists
```

The address alerts go to lives in `/etc/mythuso/ops.env` as `MYTHUSO_ALERT_TO`. The deploy never
writes that file, because a deploy that overwrote it would silence every alert and look successful
doing it.

### The health check

`Restart=` covers a process that dies. It does not cover a process alive but wedged, a database
refusing connections, nginx serving a stale upstream, or a certificate about to expire — all of
which leave every unit `active` while the person trying to book a nurse sees nothing. So the check
asks, from the box: does the public page answer, is the certificate still valid, is the identity
service healthy, is there disk left, and did last night's backup happen.

It **alerts on the second consecutive failure, and once**. A single timed-out curl at 3am is a blip,
and an alert that cries wolf is one nobody reads. It says so again when things recover.

It also only asks about what is actually turned on. MyThuso is deployed in stages on purpose — the
landing page, then TLS, then the identity service — and a check that complained every five minutes
about a service nobody has enabled yet would be switched off within a day, taking the checks that
matter with it. Before there is a certificate it checks the page over the loopback with a `Host:`
header, exactly as the deploy does.

### The backups, and what they are not

BidZA is PostgreSQL and takes a `pg_dump`. The identity service is SQLite in WAL mode, where
`cp identity.db` is **not** a backup: the committed truth is spread across the main file and the
`-wal` file, so a copy taken mid-write is missing every transaction since the last checkpoint, and
copying the files one after another gets three different instants — which is worse, because the
result opens. The snapshot is taken by SQLite itself with `VACUUM INTO`, inside a read transaction,
which sees one consistent instant and does not block the service from writing.

Each night's archive is then **restored and queried** before it is called a backup — decompressed
into a scratch directory, checked with `integrity_check`, and asked for the tables and rows that
matter. A backup nobody has restored is a belief.

What they are not:

- **Not encrypted.** BidZA's are not either, and for tender documents that is a defensible call. It
  is a thinner one here and it is worth stating plainly. The database holds a name, a mobile number
  and a second-factor secret, and **no health information** — which is the only reason the service
  exists ahead of the controls in [Privacy and security](../docs/PRIVACY-AND-SECURITY.md). Names and
  second-factor secrets are sealed inside the database itself, so those survive being carried away;
  mobile numbers are the lookup key and are in the file in the clear. A list of South African mobile
  numbers is personal information under POPIA even though it is not special personal information.
  What stands in for encryption today is that the file never leaves the machine and only root can
  read it — `0700` on the directory, `0600` on every archive. That is thin, and it is enough only
  for as long as the sentence above is true. **The backup script refuses to run at all if a clinical
  table appears in the database**, rather than trusting anybody to remember, in the same way
  `npm run check` refuses on the source.
- **Not off-site.** They sit on the same disk as the database, which protects against corruption and
  not at all against losing the server.
- **Not the encryption key.** `MYTHUSO_ENCRYPTION_KEY` lives in `/etc/mythuso/api.env`, deliberately
  nowhere near the database it protects — so restoring an archive without it gives back sealed values
  nobody can open. Keep a copy of the key somewhere that is not this server. Nothing here can do that
  for you.
- **Not "forgotten".** Erasure runs on a seven-day grace and archives are kept fourteen days, so
  somebody erased today is still in the oldest archive for a fortnight afterwards. That is a
  proportionate retention period and it is a fortnight, not gone.

## The identity service is not turned on

`deploy/ops/mythuso-api.service` is the unit for it, and `deploy/nginx/mythuso.conf` has its proxy
block written but commented out. Both are deliberate. The service signs people in with a one-time
code, and a one-time-code endpoint reachable over plain http is a way to hand out accounts. It also
refuses to start in production without an SMS provider, because a code nobody receives is not a
sign-in method.

To turn it on, in this order:

1. **DNS** — point the host at the server.
2. **TLS** — `certbot --nginx -d <host>`.
3. **A number to send from** — an SMS provider account.
4. **Install it**

   ```sh
   ssh <target> 'adduser --system --group --home /opt/mythuso mythuso && mkdir -p /var/lib/mythuso /etc/mythuso'
   rsync -az --exclude-from=deploy/.deployignore apps/api/ <target>:/opt/mythuso/api/
   ```

   The unit itself is not copied by hand — every deploy installs it, along with the timers, from
   `deploy/ops/`. BidZA learned that one: its scheduled jobs lived outside the synced directory and
   quietly drifted from the repository, and a committed change to the backup had simply never taken
   effect on the box. `systemctl daemon-reload` runs as part of the install, but a unit that changed
   while the service was running still needs `systemctl restart mythuso-api` to take effect, and the
   deploy says so when that happens.

5. **Configure it** — `/etc/mythuso/api.env`, readable only by root:

   ```
   MYTHUSO_ENV=production
   MYTHUSO_AUTH_PEPPER=<64 random characters, never committed>
   MYTHUSO_ENCRYPTION_KEY=<32 bytes: openssl rand -hex 32 — losing it loses every sealed value>
   MYTHUSO_SMS_PROVIDER=<provider>
   MYTHUSO_ALLOWED_ORIGINS=https://<host>
   MYTHUSO_DB=/var/lib/mythuso/identity.db
   MYTHUSO_PORT=8787
   ```

   A weak pepper, an `http` origin, a missing provider, or the development setting that returns
   codes in the response will each stop the service from starting. That is the point of them.

6. **Uncomment the `/api/` block** in the nginx site, `nginx -t`, reload.
7. `systemctl enable --now mythuso-api`
8. `systemctl enable --now mythuso-backup.timer` — there is now something worth backing up, and the
   health check starts asking whether it happened.

Rotating the pepper signs everyone out, because every stored session digest stops matching. That is
the intended behaviour, not a side effect.

## What this host already runs

agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and skillsonwheels.co.za, plus PostgreSQL
and two node applications on loopback ports 3000 and 4000, and BidZA's own timers — its backup at
01:10 and its OCR job hourly under a CPU cap. MyThuso adds a site file, two timers and, later, a
service on 8787. The backup is at 02:40 so the two never share the disk. Nothing here modifies any
of them, `nginx -t` gates every reload, and the deploy checks all five afterwards.
