# Runbook — putting mythuso.co.za on the internet

For the person doing this once, at night, who did not build any of it. `README.md` in this directory
explains why each step is the way it is; this file is the order to do them in, what each command
should print, and what to do when one of them does something else.

Read the whole thing first. It is about twenty minutes of work and most of it is waiting.

**The one thing that must not go wrong.** This server also hosts five websites that have nothing to
do with MyThuso — **agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and
skillsonwheels.co.za**. They belong to other people and other projects. Nothing in this runbook
edits their configuration, and step 0 and step 8 are the same check run before and after so that if
one of them stops answering, you find out rather than its owner. Do not skip either. If you only
have time for two commands tonight, make them those two.

**What you need**

- `ssh liqzar-server` works from this machine. (`TARGET=` overrides the name if yours differs.)
- The A record for `mythuso.co.za` and for `www` pointing at **154.66.198.238**. Adding it is not in
  this runbook — `dns/README.md` is. This runbook starts once it is added.
- This repository, on a machine that can run `npm`.

**What this runbook does not do.** It does not turn on the identity service, and it must not. That
is `README.md`'s ordered list, and it needs an SMS provider first. Until then nobody can sign in,
which is the correct state and is what the site says on every screen that could imply otherwise.

---

## 0. Before you touch anything: are the neighbours up?

```sh
for d in agcafrica.com artisanza.co.za bidza.co.za liqzar.co.za skillsonwheels.co.za; do
  printf '%-24s %s\n' "$d" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$d")"
done | tee /tmp/mythuso-cotenants-before.txt
```

Expected: five lines, each ending `200`.

**Write down what you actually get, even if it is not 200.** That file is the baseline. If
`bidza.co.za` is already returning 502 at half past ten tonight, that is not yours and it must not
become yours at the end — but you can only know that if you looked first. `deploy.sh` takes the same
baseline itself and compares against it rather than against 200, for exactly this reason.

If **all five** are unreachable, stop. That is the server or your own connection, and deploying into
it will teach you nothing.

---

## 1. Has the A record propagated?

```sh
dig +short mythuso.co.za
dig +short www.mythuso.co.za
```

Expected: `154.66.198.238` from both.

If you get `169.239.219.58`, that is still the registrar's parking page and the record has not
propagated to your resolver yet. Wait; a TTL of an hour is normal and it is sometimes several. Ask a
resolver that is not yours as a second opinion:

```sh
dig +short @1.1.1.1 mythuso.co.za
```

You do not have to wait for DNS to publish — step 2 verifies itself with a `Host:` header against
the server's own loopback and works before DNS points anywhere. You do have to wait for it before
step 4, because Let's Encrypt resolves the name from outside to issue the certificate.

Also confirm the mail records survived whatever was done to the zone, because the way this goes
wrong is silent and nobody notices for a week:

```sh
dig +short MX mythuso.co.za     # 10 mx1.tld-mx.com
dig +short TXT mythuso.co.za    # the v=spf1 record
```

Then send yourself an email at that domain before you tell anybody the site is live. DNS says the
mail server is reachable. Only a delivered message says the mail still works.

---

## 2. Publish

From the repository root:

```sh
./deploy/deploy.sh
```

It takes a couple of minutes, most of it the build. It prints its steps in bold. In order, and what
each one means:

| It says | What happened |
|---|---|
| `Baseline: the sites on this box that must not change` | It asked the same five sites you asked in step 0, and remembered the answer |
| `Building the site` | `npm run build` — five entries into `apps/web/dist` |
| `Checking the build output carries nothing it should not` | Nothing shaped like a key, an env file or the funding proposal is about to be published |
| `Checking liqzar-server before touching it` | nginx exists, and no other site already claims `mythuso.co.za` or `www.mythuso.co.za` — it looks in `sites-enabled` **and** `conf.d` |
| `Publishing to /var/www/mythuso` | The five entries and their assets |
| `Installing the scheduled jobs to /opt/mythuso/ops` | The health check and backup scripts and their units. Installing a unit does not start it |
| `Installing the nginx site for mythuso.co.za` | One new file. The previous version is kept beside it until `nginx -t` has an opinion |
| `Restoring TLS to the site file, if there is a certificate` | On the first run: `tls  no certificate for mythuso.co.za yet — http only`. That is correct tonight |
| `Testing the whole nginx configuration` | `nginx -t` on **everything**, all six sites. Nothing is reloaded before this passes |
| `Reloading nginx` | A graceful reload. Existing connections to the other five finish; no site restarts |
| `Verifying by Host header` | Five entries, each asked to prove which page it served |
| `Checking the service's key material` | `keys  not checked — the identity service is not enabled`. Correct tonight |
| `Re-checking the sites that must not change` | The five again, compared against the baseline |

The last block you want to see:

```
landing  200  landing.html
app      200  index.html
staff    200  staff.html
admin    200  admin.html
status   200  status.html
/status  301 (expected 301 to /status/)
identity  not enabled (see deploy/README.md)
keys      not checked — the identity service is not enabled (deploy/README.md)
```

and then the five co-tenant lines matching your baseline, and
`Published to mythuso.co.za on liqzar-server. Co-hosted sites unchanged.`

**If it stops, it stopped on purpose.** Every refusal in that script exists because of something
that can go wrong on a shared box. Go to *When it fails* at the bottom of this file; do not work
around it by running the steps by hand. The co-tenant check is the entire point of the script and
running the steps by hand is how it gets skipped.

---

## 3. Look at all five entries yourself

The deploy checked these from the server. Check them from outside, because that is a different
question — it involves DNS, the public internet and, later, TLS.

```sh
for p in / /app/ /staff/ /admin/ /status/ /status; do
  printf '%-10s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://mythuso.co.za$p")"
done
```

Expected: `200` for the first five, `301` for `/status`.

Then open `http://mythuso.co.za/status` in a browser and read it. It is the page that says what is
connected and what is not, and if it is showing you the landing page instead, something is wrong
that a status code did not catch.

---

## 4. The certificate

Only once step 1 answers `154.66.198.238` from a resolver that is not yours. Let's Encrypt has to
resolve the name from the outside.

```sh
ssh liqzar-server "certbot --nginx -d mythuso.co.za -d www.mythuso.co.za"
```

**Both names.** They are both in `server_name`, and a certificate covering only the apex is a
full-page browser warning for everybody who typed `www` — which is most people, and it is the first
link the founder sends anybody. It is not an edit afterwards; it is a reissue. `deploy.sh` prints
this exact command at the end of every run, built from `$HOST` and `$ALIASES`, so the certificate
and the site file cannot drift apart.

Certbot will ask whether to redirect http to https. **Say yes.**

Certbot edits `/etc/nginx/sites-available/mythuso.conf` in place rather than writing a file of its
own. `deploy.sh` knows: every later deploy overwrites that file from the template and then re-runs
`certbot install` to put the TLS lines back, and refuses to reload if it cannot. You do not have to
remember this. It is written down because the failure it prevents — a redeploy silently returning a
health service to plain http — is invisible from the outside for as long as nobody looks.

---

## 5. Is it actually https?

```sh
curl -sI https://mythuso.co.za/            | head -1     # HTTP/1.1 200 OK
curl -sI https://www.mythuso.co.za/        | head -1     # HTTP/1.1 200 OK
curl -sI http://mythuso.co.za/status       | head -1     # 301, to the https URL
curl -s -o /dev/null -w '%{http_code}\n' https://mythuso.co.za/status/
```

And confirm the certificate really carries both names, rather than trusting that certbot heard you:

```sh
echo | openssl s_client -connect mythuso.co.za:443 -servername mythuso.co.za 2>/dev/null \
  | openssl x509 -noout -subject -dates -ext subjectAltName
```

Expected: a `subjectAltName` listing **both** `DNS:mythuso.co.za` and `DNS:www.mythuso.co.za`, and a
`notAfter` about ninety days out. If `www` is missing, re-run step 4 with both `-d` flags — it will
reissue and replace.

Check the headers arrived too. Every page should carry all of these:

```sh
curl -sI https://mythuso.co.za/status/ | grep -iE 'x-frame|content-security|referrer|permissions|x-content|cache-control'
```

Expected: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and a
`Permissions-Policy`. If a page is missing them, say so — it means a `location` in the site file has
grown an `add_header` of its own, which in nginx silently discards the whole inherited set.

---

## 6. HSTS — a separate step, on purpose

Not before now. `Strict-Transport-Security` tells every browser that visits to refuse plain http for
this host for two years, and there is no way to take it back from the browsers that already heard
it. Turning it on before https is confirmed working is a way to make a site unreachable that you
cannot undo by editing anything.

Now that step 5 passed, uncomment the line in `deploy/nginx/mythuso.conf`:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

and redeploy (`./deploy/deploy.sh`), which is safe to run as often as you like — it rewrites the
site file from that template and then has certbot re-apply the TLS lines on top, so the header lands
in the block that serves https. Then check both halves:

```sh
curl -sI https://mythuso.co.za/ | grep -i strict-transport   # the header is there
curl -sI http://mythuso.co.za/  | head -1                    # plain http still redirects
```

If the header does not appear, look at where certbot put the `listen 443` line — the header has to
be inside the same `server` block. Comment it out again rather than leaving it half-applied.

No `preload`. A preload entry is a submission to a list this project cannot withdraw itself from.

This step is optional tonight. Nothing breaks if you leave it for another day.

---

## 7. The health check

```sh
ssh liqzar-server "systemctl enable --now mythuso-healthcheck.timer"
ssh liqzar-server "systemctl list-timers mythuso-*"
```

It runs every five minutes and asks the questions a patient's browser asks. It alerts on the
**second** consecutive failure and once, not every five minutes.

It needs somewhere to send an alert. That file is hand-managed and the deploy never writes it,
because a deploy that overwrote it would silence every alert and look successful doing so:

```sh
ssh liqzar-server "printf 'MYTHUSO_ALERT_TO=%s\n' 'you@example.com' > /etc/mythuso/ops.env"
ssh liqzar-server "chmod 0600 /etc/mythuso/ops.env"
```

**Do not enable `mythuso-backup.timer` tonight.** It backs up the identity service's database, and
there is no identity service and no database. It waits for step 4 of `README.md`.

Watch one run before you walk away:

```sh
ssh liqzar-server "systemctl start mythuso-healthcheck.service && journalctl -u mythuso-healthcheck -n 30 --no-pager"
```

Expected: `ok`, with notes saying the identity service and the backup timer are not enabled. Those
notes are correct, not warnings.

---

## 8. The neighbours, again

The same command as step 0, compared against the same file.

```sh
for d in agcafrica.com artisanza.co.za bidza.co.za liqzar.co.za skillsonwheels.co.za; do
  printf '%-24s %s\n' "$d" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$d")"
done | diff /tmp/mythuso-cotenants-before.txt - && echo "unchanged"
```

Expected: `unchanged`.

**If it is not unchanged**, ask again in twenty seconds before doing anything — a site behind
Cloudflare returns the occasional 5xx for reasons that have nothing to do with you. If it is still
different:

```sh
ssh liqzar-server "nginx -t"                      # is the whole configuration still valid?
ssh liqzar-server "systemctl status nginx"        # is nginx running?
ssh liqzar-server "ls -l /etc/nginx/sites-enabled/"
```

MyThuso adds exactly one file, `mythuso.conf`. If a neighbour is down, the fastest honest answer is
to take ours out and see whether that fixes it — go to *Backing it out* below. Do that before you
spend twenty minutes diagnosing, and tell whoever owns the site either way.

And check the certificate you asked for in step 4 did not disturb theirs. Certbot's nginx installer
edits the block it was pointed at, but it is worth one look:

```sh
ssh liqzar-server "certbot certificates" | grep -E 'Certificate Name|Domains|Expiry'
```

---

## What the site does, and what it does not, on day one

Somebody will open this link tonight and some of them will be deciding whether to fund it. What they
find has to be the same honesty the app carries everywhere else.

**It does not do anything yet.** Nothing is connected. `packages/catalog/capabilities.json` declares
fifteen capabilities — accounts, booking, payments, payouts, credential verification, dispatch,
clinical records, teleconsultation, screening, voice, devices, dispensing, interpreting, messaging,
emergency — and **not one of them is live**. No visit can be booked, no payment taken, no clinical
decision issued, no device contacted, and nobody can sign in. Every screen that could be mistaken
for the real thing renders its notice from that contract rather than from a sentence somebody typed
onto a layout, so the disclaimers cannot be tidied off a screen at eleven at night.

**`https://mythuso.co.za/status` is the page that says so**, capability by capability: what each one
is, whether it is connected, what is standing in the way, and the sentence a person is shown while
it is not. Send that link alongside the main one. It is the most useful page on the site to anyone
deciding whether to trust it, and it costs nothing to be the one who points at it first.

**`/staff` and `/admin` are unlisted, not restricted.** They are `noindex` and nothing links to
them, which keeps them out of search results. That is not access control and must never be
described as any. There is no account behind either of them; the sign-in screen on each says so.

**The identity service is switched off and its nginx block is commented out.** It signs people in
with a one-time code, and a one-time-code endpoint reachable over plain http is a way to hand out
accounts. It also refuses to start without an SMS provider, because a code nobody receives is not a
sign-in method. Turning it on is `README.md`'s ordered list, and the keys are their own step in it,
each with a second copy made before the service ever runs.

**No health information is on this server.** None is collected, and the identity service that would
one day hold names and mobile numbers is not running. Health data is special personal information
under POPIA and the controls for it are not built yet; `docs/PRIVACY-AND-SECURITY.md` is honest
about which of them exist. Nothing about tonight changes that, and nothing about tonight should be
described as making it so.

---

## When it fails

**`another nginx site already claims mythuso.co.za`**
Something on the box already answers for that name. Do not force it — find it:
`ssh liqzar-server "grep -rl 'mythuso' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/"`. If it is a
stale MyThuso file from an earlier attempt in `conf.d`, remove that one and rerun. If it belongs to
another site, stop and ask its owner.

**`HOST is not a host name`**
You set `HOST=` to something that is not one — with a space, a quote or a semicolon in it. That is
refused rather than passed on, because every one of those characters means something to the shell on
the far end, to nginx, or to `sed`. Set it to a single host name, or leave it unset to get
`mythuso.co.za`.

**`nginx config test failed — nothing reloaded`**
Nothing was reloaded and our site file was put back the way it was; the script says so on the next
line, and the box is as you found it. Read the `nginx -t` output above it — it names the file and
the line. If the message instead says `ROLLED BACK AND nginx -t STILL FAILS`, the fault was already
on the box before you arrived: **do not restart nginx.** A reload leaves the five co-tenants
serving; a restart with a broken configuration will not start at all.

**`nginx says a server name is claimed twice`**
Two `server` blocks want the same host name. nginx calls that a warning and carries on, silently
serving one of them, and the one it drops could be somebody else's site. Our file was rolled back
and nothing was reloaded. Find the other block before trying again.

**`status: /status/ answered 200 but did not serve status.html`** (or any entry)
The `location` block for that entry is missing from `deploy/nginx/mythuso.conf`, so the path is
falling through to the catch-all and returning the landing page with a 200. This is the check that
exists because that is exactly what `/status` did for a day. Compare the `location` blocks against
the `input` list in `apps/web/vite.config.ts`; every entry needs one.

**`A co-hosted site changed status`**
The deploy already asked twice, twenty seconds apart. Go to step 8 and then to *Backing it out*.
This is the failure worth stopping for.

**`the build output contains …` / `mentions a secret by name`**
Something is in `apps/web/dist` that must not be published. Do not narrow the pattern. Find out what
put it there. `.deployignore` explains which two of those rules were learned the expensive way on
this same box.

**certbot: `Timeout during connect` or `DNS problem`**
The name does not resolve to this server from the outside yet. Go back to step 1 and wait. Do not
retry in a loop — Let's Encrypt rate-limits failed validations and you can lock yourself out of
issuing for an hour.

**The site loads but every stylesheet is missing**
`/assets/` is not being served. Check the files arrived:
`ssh liqzar-server "ls /var/www/mythuso/assets | head"`.

---

## Backing it out

MyThuso adds one nginx file, one web root and one directory of scheduled jobs. Removing all of it
leaves the other five sites exactly as they were:

```sh
ssh liqzar-server "rm -f /etc/nginx/sites-enabled/mythuso.conf && nginx -t && systemctl reload nginx"
```

That is the whole rollback, and it is the first thing to do if a neighbour is down. `nginx -t` runs
before the reload for the same reason it does everywhere else in this project. The web root, the
certificate and the timers can stay — none of them serves anything once that symlink is gone. If you
want them gone too:

```sh
ssh liqzar-server "systemctl disable --now mythuso-healthcheck.timer"
ssh liqzar-server "rm -rf /var/www/mythuso /opt/mythuso/ops"
```

Leave `/etc/letsencrypt` alone. Deleting a certificate you may reinstall in an hour is how you meet
the rate limit.
