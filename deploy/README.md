# Deploying MyThuso

`./deploy/deploy.sh` publishes the landing page and the app preview. It adds `/var/www/mythuso`, one
nginx site file and `/opt/mythuso/ops`, tests the configuration before reloading, and touches
nothing else on the host.

```sh
./deploy/deploy.sh                        # liqzar-server, mythuso.co.za
HOST=mythuso.co.za ./deploy/deploy.sh     # somewhere else
```

Verification runs with a `Host:` header against the server's own loopback, so a deployment can be
confirmed before DNS is pointed anywhere.

This file is why each step is the way it is. **[RUNBOOK.md](RUNBOOK.md) is the order to do them in,
written for somebody doing it once, at night, who did not build any of this** — including how to
check the five co-tenant sites before and after, which is the risk that matters most here and the
one nobody remembers.

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
  refused deploy rather than five refused websites — **and the site file is rolled back when it
  fails.** Refusing to reload is not enough on its own: the running nginx keeps serving the
  configuration it already loaded, so nothing looks wrong, and a broken file left in
  `sites-enabled` takes nginx down at the next *start* — a reboot, a package upgrade, somebody
  else's deploy — hours later, for a reason nobody will connect back to this. The output is read as
  well as its exit status, because `conflicting server name` is a warning: `nginx -t` exits 0 while
  one of two blocks claiming a name is silently ignored, and on this box the block that loses could
  be theirs.
- **Nothing of theirs is ever edited.** MyThuso adds its own site file and nothing more, and the
  deploy refuses outright if some other site already claims our host name — looking in
  `/etc/nginx/conf.d/` as well as `/etc/nginx/sites-enabled/`, because Debian's `nginx.conf`
  includes both and a co-tenant configured in the first was invisible to that check.
- **`$HOST` and `$ALIASES` are validated as host names before anything else runs.** They are
  interpolated into a command a remote root shell executes, into an nginx directive, and into a
  `sed` replacement. A single quote in `$HOST` closes the quoting and runs the rest as root; a `;`
  and a `}` survive into the site file and nginx accepts them, `default_server` included, which is
  how MyThuso would start answering for every name on the machine nobody else claimed. Both were
  reproduced against a sandbox before the check was written. Neither is reachable now.

That check is the point of the script. Do not skip it by running the steps by hand.

## What is deployed

| Path | What |
|---|---|
| `/` | The public landing page |
| `/app/` | The product — runs with no backend, exactly as it does locally. Patients and families with no role on the address; the clinical workspaces and the back office behind `?role=`, from the demo login in the bar at the top of every screen |
| `/staff/`, `/admin/` | 301s to `/app/`. They were applications of their own until 12 September; an old bookmark lands on the one door rather than on a 404 |
| `/status/` | What is connected and what is not. Fifteen capabilities, none of them live. The page a funder or a clinician is sent to when they want to know whether any of this is real |
| `/assets/` | Hashed bundles, cached for a year; HTML is never cached |
| `/opt/mythuso/ops` | The scheduled jobs and their systemd units, reinstalled on every deploy |
| `/etc/mythuso/host.env` | The host the health check should be asking about, written by the deploy |
| `/etc/mythuso/key.fingerprint` | One `name fingerprint` line per key this host holds. Not the keys, and not secret — it is how a key that changed without anybody rotating it becomes visible |

### Three entries on one host, and the one-line change when DNS moves

There are three builds — `index.html`, `landing.html` and `status.html`, declared in
`apps/web/vite.config.ts`. **Every one of them needs a `location` in `deploy/nginx/mythuso.conf` and
a line in `deploy.sh`'s verification, or the entry is a build nobody can open.** `status.html` was
added, built, published and unreachable, and every check the deploy ran came back green, because
without a block of its own `/status` fell through to the catch-all and answered with the landing page
and a 200. That is why the verification now asks each path to prove which entry it served rather than
only that it answered, and why `scripts/check-boundaries.mjs` reads the entry list out of the Vite
config and holds nginx, the deploy script *and the dev server's own path map* to it. A fourth entry
means a `location`, a `verify_entry` line, a path in the dev map and a row in the table above.

There were five. `staff.html` and `admin.html` were the clinical workspaces and the back office, each
with a sign-in screen that said there was no account to sign in to and then asked which workspace you
wanted. The founder replaced all of that with one demo login inside `/app/`, so those two are 301s
here and lazily-loaded chunks in the bundle. What the split was for survives it: a patient's first
load is 286.3 kB gzipped, and nothing of a dispatch board is in it.

They are served from paths on one host rather
than from `staff.mythuso.co.za` and `admin.mythuso.co.za` for two reasons that are both temporary:
`mythuso.co.za` is still being pointed at this box (see `deploy/dns/`), and a second name needs its
own certificate before anything is served on it. Nothing in the applications assumes a path.

When the apex is resolving here and certificates exist, the split is a change to
`deploy/nginx/mythuso.conf` and nothing else. Copy the **`server` block** — not the `map` above it,
which belongs to the file rather than to any one site and which nginx refuses to see twice — and in
the copy replace

```nginx
server_name __HOST__;
...
location = /app   { return 301 /app/; }
location /app/    { try_files /index.html =404; }
```

with

```nginx
server_name app.mythuso.co.za;
...
location / { try_files /index.html =404; }
```

and add the name to `ALIASES` in `deploy/deploy.sh` and to `deploy/dns/mythuso.co.za.zone`. The
`location = /` block stays where it is. There is no longer a separate name to give the clinical
workspaces or the back office: they are roles inside the one application, so a second name would be
the same build served twice.

### The headers, and who sets what

The identity service sets its own transport headers in `apps/api/src/server.ts`, for the reason
written above them: a control that only exists in a particular nginx is a control that vanishes the
first time the service runs anywhere else, and this nginx is not ours to rely on. So nginx does not
need to set them *for the API* — and must be stopped from trying, because add_header does not
replace a header the upstream already sent, it appends a second one. Two `X-Frame-Options` headers
is not twice the protection; a browser handed `DENY, DENY` is entitled to make nothing of either.
The commented `/api/` block therefore carries an `add_header` of its own, which is what severs the
inheritance: nginx passes the server-level set down only to a level that declares none.

The static entries are the other half, and they do need nginx. Each HTML file carries its own CSP in
a `<meta http-equiv>`, but a meta tag cannot express `frame-ancestors`, so the only place that
refusal can be stated for a page is a header. Hence `X-Frame-Options: DENY` and
`Content-Security-Policy: frame-ancestors 'none'` at the server level of the site file — the same
pair, and the same values, the API sends.

The same inheritance rule was quietly costing us those headers. `/assets/`, `/fonts/` and a
`~* \.html$` block each set their own `Cache-Control` with `add_header`, and every one of them
therefore dropped all four security headers — so `/status.html`, `/landing.html` and every asset were
served with no `X-Frame-Options` at all, with the pages rendering exactly as before. The cache
lifetimes are now decided by one `map` at the top of the file and added once at the server level, so
no location declares an `add_header` and none of them can drop part of the set.

HSTS is in the site file now, and it is in it at `max-age=300`. It was held out until a certificate
existed, because a browser told to refuse plain http by a host that cannot serve https is a browser
that cannot reach the site and cannot be told otherwise. The certificate exists, so the header is on
— but at five minutes rather than two years, because that is the version of this header that can be
withdrawn. Raising it is a second decision, taken in `RUNBOOK.md` once the header has been seen
arriving on https and every subdomain `includeSubDomains` binds has been checked.

**A path is not access control, and neither is a subdomain, and neither is a query string.**
`/staff/` and `/admin/` used to be unlisted paths carrying `noindex`, which kept them out of a search
result and out of nobody's way. They are `?role=` on the one application now, one press from a
patient's home screen, and that is a change in how findable they are and in nothing else: there was
never an account behind either, and there still is not. The demo login says so in the contract's own
words, from `packages/catalog/capabilities.json` — the `accounts` notice and the refusal that
choosing a role grants none. Until there are accounts, the honest description of all of it is
"open", never "restricted", and the `noindex` that went with the old paths is worth knowing about:
the clinical workspaces are now reachable from an entry that is not `noindex`. If keeping them out of
a search index matters before accounts exist, that is an `X-Robots-Tag` decision on `/app/` and it
has not been taken.

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
service healthy, is there disk left, did last night's backup happen, and does the audit chain still
verify.

That last one is not an availability question and it is on this list anyway. The access log is
append-only by grant, which means somebody with database access can rewrite it; the hash chain is
what makes that discoverable, because an edited or deleted entry breaks the chain from that point
and `verify()` names the first entry that no longer follows. A broken chain is either corruption or
somebody editing the record of who read what, it is invisible to anybody reading rows, and it is
exactly the thing worth waking a person for. The check asks the service's own endpoint over the
loopback rather than opening the database itself — root opening a WAL database leaves root-owned
sidecar files the service then cannot write, which is how a health check causes the outage it was
installed to catch.

It also keeps a ratchet. A chain can verify perfectly after tampering, if whoever did it recomputed
every hash forward from the point they edited; what that cannot do is make the log longer again. So
the entry count is remembered in `/var/lib/mythuso/health/audit-length` and is never allowed to go
down. It catches the operator who did not think of it and not the one who edits that file too, and
[Data protection](../docs/DATA-PROTECTION.md#the-threat-model) says so rather than implying more.
The endpoint does not exist yet, and a 404 is reported as a note rather than an alert — a check that
complained every five minutes about a module nobody has merged would be switched off, taking the
rest of the file with it.

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
- **Not the keys.** `MYTHUSO_ENCRYPTION_KEY` and `MYTHUSO_PROTECTION_KEYS` live in
  `/etc/mythuso/api.env`, deliberately nowhere near the database they protect — so restoring an
  archive without them gives back sealed values nobody can open. Keep a copy of the key somewhere that is not this server;
  [Data protection](../docs/DATA-PROTECTION.md#the-key-ceremony) is how. Nothing here can do that for
  you, and nothing here will notice that you did not. The converse *is* checked: before it compresses
  anything, the backup searches the fresh snapshot for each key's own characters — every protection
  key version separately — and deletes the snapshot rather than keeping it if any of them is there. A backup containing the key that opens it is a
  backup with no encryption at all, and configuration finding its way into a table is the ordinary
  way that happens.
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
2. **TLS** — `certbot --nginx -d mythuso.co.za -d www.mythuso.co.za`. **Every name in `server_name`
   goes in that command.** A certificate for the apex alone is a full-page browser warning for
   anybody who typed `www`, which is most people, and it is not an edit afterwards — it is a
   reissue. `deploy.sh` prints the list for you at the end of a run, built from `$HOST` and
   `$ALIASES`, so the certificate and the site file cannot drift apart.
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

5. **The keys, before anything is configured to use them.** They are their own step, and they come
   before the service runs, because a key generated in a hurry at step eight is a key with no second
   copy — and a key with no second copy is a platform one lost server away from losing every sealed
   value permanently. There are two, and they must be different values:

   - `MYTHUSO_ENCRYPTION_KEY` is the identity service's own, sealing a name and a second-factor
     secret in `apps/api/src/sensitive.ts`. One key, no versions.
   - `MYTHUSO_PROTECTION_KEYS` is the data protection module's root keys, written as
     `1:<key>,2:<key>` and read by `apps/api/src/protection/crypto.ts`. More than one version is the
     normal state during a rotation, not an exception.

   The full procedure — who is present, how the second copy is made and where it is kept — is
   [Data protection](../docs/DATA-PROTECTION.md#the-key-ceremony). The short version, on the box, in
   the room, with a second person watching:

   ```sh
   umask 077
   touch /etc/mythuso/api.env && chown root:root /etc/mythuso/api.env && chmod 0600 /etc/mythuso/api.env
   printf 'MYTHUSO_ENCRYPTION_KEY=%s\n'    "$(openssl rand -hex 32)" >> /etc/mythuso/api.env
   printf 'MYTHUSO_PROTECTION_KEYS=1:%s\n' "$(openssl rand -hex 32)" >> /etc/mythuso/api.env
   ```

   Neither key is ever typed and neither is ever printed, so neither is in shell history, on the
   screen, or in a command line anybody can read with `ps`. `printf` is a builtin, which is the whole
   reason it is written this way.

   Then take the fingerprints — sixteen characters that identify a key without disclosing it, and the
   thing you write in the register and read out over a phone call:

   ```sh
   sed -n 's/^MYTHUSO_ENCRYPTION_KEY=//p' /etc/mythuso/api.env | tail -1 | tr -d "\"' \n" \
     | sha256sum | cut -c1-16
   ```

   [Data protection](../docs/DATA-PROTECTION.md#where-the-keys-live-and-where-they-must-never-live)
   has the equivalent for each protection key version. Then make the second copies. Nothing on this
   server, and nothing in this repository, can do that part for you or tell you afterwards that you
   skipped it.

6. **Configure the rest of it** — the same `/etc/mythuso/api.env`, still `0600 root:root`:

   ```
   MYTHUSO_ENV=production
   MYTHUSO_AUTH_PEPPER=<64 random characters, never committed>
   MYTHUSO_ENCRYPTION_KEY=<already there, from step 5 — do not retype it>
   MYTHUSO_PROTECTION_KEYS=<already there, from step 5 — do not retype it>
   MYTHUSO_SMS_PROVIDER=<provider>
   MYTHUSO_ALLOWED_ORIGINS=https://<host>
   MYTHUSO_DB=/var/lib/mythuso/identity.db
   MYTHUSO_PORT=8787
   ```

   A weak pepper, an `http` origin, a missing provider, or the development setting that returns
   codes in the response will each stop the service from starting. That is the point of them. A
   malformed encryption key does the same. A *missing* one does not — the service starts and refuses
   the writes that need sealing, which is why the deploy checks for it separately.

7. **Uncomment the `/api/` block** in the nginx site, `nginx -t`, reload.
8. `systemctl enable --now mythuso-api`
9. `systemctl enable --now mythuso-backup.timer` — there is now something worth backing up, and the
   health check starts asking whether it happened.
10. **Deploy again**, and read the `identity` and `protection` lines. Only once the unit is enabled
    does the deploy check the keys at all; that run is the confirmation that they are present, thirty-
    two bytes, in a file only root can read, and nowhere they should not be.

Rotating the pepper signs everyone out, because every stored session digest stops matching. That is
the intended behaviour, not a side effect. Rotating a protection key is a different and much more
careful operation, and it is [written up separately](../docs/DATA-PROTECTION.md#rotation) — the two
rules worth carrying here are that a rotation only ever *adds* a key version, and that no key is
ever removed on the same day one is added.

### What the deploy checks about the keys

Once `mythuso-api` is enabled, every deploy asks the server about the keys and refuses to finish if
the answer is wrong. About `/etc/mythuso/api.env`: that it exists and is `0600 root:root`. About
`MYTHUSO_ENCRYPTION_KEY`: that it is set, thirty-two bytes, not still the placeholder above, and not
the same value as the pepper. About `MYTHUSO_PROTECTION_KEYS`: that every version is thirty-two
bytes, that no version is listed twice, that no two versions hold the same material — a rotation to
the same secret rotates nothing — that none of them is the identity service's key, and that
`MYTHUSO_PROTECTION_KEY_CURRENT` and `MYTHUSO_PROTECTION_INDEX_VERSION` each name a version this
server actually holds. And about both: that the key material does not appear anywhere under
`/var/www/mythuso`, which nginx serves to the public internet, or `/var/backups/mythuso`, which is
the database those keys open.

Two of them are advice rather than refusals, because they have legitimate causes. A fingerprint that
has changed since the last deploy is reported loudly and not failed — a rotation you performed is a
line to update in `/etc/mythuso/key.fingerprint`, and a change nobody performed is exactly the thing
you wanted to be told about. And more than one protection key version with no
`MYTHUSO_PROTECTION_INDEX_VERSION` pinned is a warning, because blind indexes default to the *lowest*
version configured: retiring the oldest key would silently move them and every index would stop
matching, which is a search that returns nothing rather than an error.

The protection keys are required only when the source actually deployed under `/opt/mythuso/api`
mentions them. The module is not wired into `config.ts` yet, and a deploy that demanded keys for
something nobody has enabled is a deploy that gets worked around; binding the requirement to the
deployed code means it starts being enforced on the deploy after that wiring lands, with nobody
having to remember.

None of it prints a key. Patterns go to the server over stdin so key material is never in a process
list, and what comes back is a verdict, a byte count and a fingerprint. The check runs after the
co-tenant re-check, so a key problem of ours never skips the check that protects the other five
sites.

The missing-key case is why this exists as a separate check rather than being left to the service.
A production service with no `MYTHUSO_ENCRYPTION_KEY` starts cleanly and answers `/health`; it then
refuses every write that needs sealing, with a 503 that reads like an application bug. That is a
failure discovered by the first person trying to enrol a second factor, days later. The deploy finds
it while somebody is still looking at the output.

## What this host already runs

agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and skillsonwheels.co.za, plus PostgreSQL
and two node applications on loopback ports 3000 and 4000, and BidZA's own timers — its backup at
01:10 and its OCR job hourly under a CPU cap. MyThuso adds a site file, two timers and, later, a
service on 8787. The backup is at 02:40 so the two never share the disk. Nothing here modifies any
of them, `nginx -t` gates every reload, and the deploy checks all five afterwards.
