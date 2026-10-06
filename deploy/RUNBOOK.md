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
It does not turn on the assistant service either — that is _Activating the assistant service_
below, it waits for an Azure credential, and the credential is typed by hand at a terminal on the
box rather than sent through a deploy.

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

| It says                                                      | What happened                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Baseline: the sites on this box that must not change`       | It asked the same five sites you asked in step 0, and remembered the answer                                                                                                                                                                             |
| `Building the site`                                          | `npm run build` — four entries into `apps/web/dist`                                                                                                                                                                                                     |
| `Building the assistant runtime`                             | The GilbertOne engine (`apps/assistant-api`), bundled into one self-contained JavaScript file — no `node_modules`, nothing to install on the box. It happens **before** anything on the server is touched, so a bundle that will not build is a deploy that changed nothing |
| `Checking the build output carries nothing it should not`    | Nothing shaped like a key, an env file or the funding proposal is about to be published — the web entries and the assistant bundle both                                                                                                                 |
| `Checking liqzar-server before touching it`                  | nginx exists, and no other site already claims `mythuso.co.za` or `www.mythuso.co.za` — it looks in `sites-enabled` **and** `conf.d`                                                                                                                    |
| `Publishing to /var/www/mythuso`                             | The four entries and their assets                                                                                                                                                                                                                       |
| `Publishing the assistant runtime to /opt/mythuso/assistant` | One file, outside the web root, and only if the server's Node can run it — its sha256 is compared across the wire before it is moved into place                                                                                                         |
| `Installing the scheduled jobs to /opt/mythuso/ops`          | The health check and backup scripts, their units, the assistant's unit and its credential script. Installing a unit does not start it                                                                                                                   |
| `Installing the nginx site for mythuso.co.za`                | One new file. The previous version is kept beside it until `nginx -t` has an opinion                                                                                                                                                                    |
| `Restoring TLS to the site file, if there is a certificate`  | On the first run: `tls  no certificate for mythuso.co.za yet — http only`. That is correct tonight                                                                                                                                                      |
| `Testing the whole nginx configuration`                      | `nginx -t` on **everything**, all six sites. Nothing is reloaded before this passes                                                                                                                                                                     |
| `Reloading nginx`                                            | A graceful reload. Existing connections to the other five finish; no site restarts                                                                                                                                                                      |
| `Verifying by Host header`                                   | Four entries, each asked to prove which page it served, then the `identity`, `assistant` and key lines                                                                                                                                                  |
| `Checking the service's key material`                        | `keys  not checked — the identity service is not enabled`. Correct tonight                                                                                                                                                                              |
| `Re-checking the sites that must not change`                 | The five again, compared against the baseline                                                                                                                                                                                                           |

The last block you want to see:

```
landing  200  landing.html
app      200  index.html
status   200  status.html
shop     200  shop.html
/status  301 (expected 301 to /status/)
identity  not enabled (see deploy/README.md)
assistant not enabled (see deploy/RUNBOOK.md — activate it only after the credentials ceremony)
keys      not checked — the identity service is not enabled (deploy/README.md)
```

and then the five co-tenant lines matching your baseline, and
`Published to mythuso.co.za on liqzar-server. Co-hosted sites unchanged.`

**If it stops, it stopped on purpose.** Every refusal in that script exists because of something
that can go wrong on a shared box. Go to _When it fails_ at the bottom of this file; do not work
around it by running the steps by hand. The co-tenant check is the entire point of the script and
running the steps by hand is how it gets skipped.

---

## 3. Look at all five entries yourself

The deploy checked these from the server. Check them from outside, because that is a different
question — it involves DNS, the public internet and, later, TLS.

```sh
for p in / /app/ /shop/ /staff/ /admin/ /status/ /status; do
  printf '%-10s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://mythuso.co.za$p")"
done
```

Expected: `200` for `/`, `/app/`, `/shop/` and `/status/`; `301` for `/staff/` and `/admin/`
(they were applications of their own once — they send a reader to `/app/` now) and for `/status`.

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
this host for as long as the header says, and there is no way to take it back from the browsers that
already heard it. Turning it on before https is confirmed working is a way to make a site unreachable
that you cannot undo by editing anything — and turning it on at two years is a way to make any
mistake in it last two years.

Step 5 passed, so the line in `deploy/nginx/mythuso.conf` is now uncommented — at **five minutes**,
not at two years:

```nginx
add_header Strict-Transport-Security "max-age=300; includeSubDomains" always;
```

Two years was the wrong first value and the reason is the same one this whole step exists for: the
header cannot be taken back from a browser that already heard it. A five-minute max-age is the same
header with the irreversibility removed — if it lands in the wrong block, or a subdomain turns out
not to serve https, the damage expires while you are still looking at it.

`includeSubDomains` binds every subdomain, so both were checked before the line was written:

| Name                    | https                  | http         |
| ----------------------- | ---------------------- | ------------ |
| `mail.mythuso.co.za`    | 404, valid certificate | 404          |
| `webmail.mythuso.co.za` | 200, valid certificate | 301 to https |

Neither is broken by it, and SMTP and IMAP never see an http header at all — mail is unaffected.

Redeploy (`./deploy/deploy.sh`), which is safe to run as often as you like: it rewrites the site file
from that template and then has certbot re-apply the TLS lines on top, so the header lands in the
block that serves https. Then check both halves:

```sh
curl -sI https://mythuso.co.za/ | grep -i strict-transport   # the header is there
curl -sI http://mythuso.co.za/  | head -1                    # plain http still redirects
```

If the header does not appear, look at where certbot put the `listen 443` line — the header has to
be inside the same `server` block. Comment it out again rather than leaving it half-applied.

**Then, and only then, raise it.** Once the header has been seen on https and every subdomain above
still answers, change `max-age=300` to `max-age=63072000` and redeploy again. That second edit is the
one that cannot be undone, and it is deliberately a separate decision taken with evidence in hand
rather than a value typed in hope.

No `preload`. A preload entry is a submission to a list this project cannot withdraw itself from,
which is the same mistake as a two-year max-age with the ink still wet.

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
to take ours out and see whether that fixes it — go to _Backing it out_ below. Do that before you
spend twenty minutes diagnosing, and tell whoever owns the site either way.

And check the certificate you asked for in step 4 did not disturb theirs. Certbot's nginx installer
edits the block it was pointed at, but it is worth one look:

```sh
ssh liqzar-server "certbot certificates" | grep -E 'Certificate Name|Domains|Expiry'
```

---

## Activating the assistant service

Not part of tonight, and activation is not part of any deploy. GilbertOne is its own service —
`apps/assistant-api`, one process bound to this box's loopback, with an address family authored in
`packages/catalog/apis/assistant.json` and the three applications as its clients — and the tier of
it that answers when the on-device contract cannot place what the patient asked is installed by
every deploy and left dark, the same deliberate state the identity service is in. It is turned on
by hand, once, only when an Azure OpenAI resource exists. The sequence lives here rather than in
`README.md` because it involves typing a credential, which is a thing done at a terminal on the
box and nowhere else in this project.

There are four states between "the code exists" and "the public can reach the model", and they
have four different names, because each is a different answer to "is it working?":

| State                           | What proves it                                                                                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bridge shipped**              | The panel in `/app/` and the `location /assistant/` in nginx. True after every deploy; the panel asks the bridge and falls back silently until the rest of this is done.                                                                                         |
| **Runtime installed, disabled** | `server.mjs` and the unit sit at `/opt/mythuso/assistant`; `systemctl is-enabled assistant-api` says `disabled`. The state every deploy leaves behind.                                                                                                           |
| **Provider configured**         | `/etc/mythuso/assistant.env` holds an endpoint, a key and a deployment name; where the service is running, `/assistant/health` reports `"azure":true`. In production this alone does not serve — the service refuses to start without the acknowledgement below. |
| **Production operational**      | The acknowledgement line is written and the unit is enabled. `/assistant/health` reports `"production":true,"activated":true`, and a question the on-device contract cannot place can reach the model.                                                           |

**Never put the key anywhere but the prompt below.** Not into a chat — with an assistant, a
colleague or a support agent — not into a commit or a branch, not onto a shell command line,
not into a log, a ticket or a file in this repository. Each of those is a copy with a different
owner, and the key opens a paid account. The script is the only sanctioned path: it takes the
key with the terminal echo off, keeps it in the shell's own memory, writes it to one root-only
file, and prints a fingerprint instead of the value.

### What you need first

- An Azure OpenAI **resource**, and inside it a **model deployment** — in the portal:
  Deployments, Create. The service talks to the deployment, and the name you gave it is what
  gets typed below. That name does not have to resemble the model: a deployment of gpt-4.1-mini
  can be called anything, and a deployment called gpt-4.1-mini might be running something else.
  Pressing Enter at the prompt accepts `gpt-4.1-mini`, which is what the deployment is called
  when it is created with the portal's defaults.
- The resource's endpoint, of the form `https://<resource-name>.openai.azure.com` — exactly
  that, with nothing after the host name.
- One of the resource's two API keys. Either one; they are equivalent.

### The sequence, on the box

```sh
ssh liqzar-server
sudo /opt/mythuso/ops/configure-assistant-env.sh
```

Three prompts. The endpoint is echoed as you type it — it is not a secret, and seeing it is how
you catch the paste that went wrong. The key is not echoed at all. The deployment name defaults
to `gpt-4.1-mini` on Enter.

The script refuses an endpoint that is not `https`, or that carries a path, a query or a port,
and refuses a key that is empty or not shaped like one. It writes `/etc/mythuso/assistant.env`
atomically at `0600 root:root` — the new file is assembled beside the old one and moved over it
only after every check has passed, so a run that fails, or one you interrupt with Ctrl-C, leaves
the previous file untouched. Anything else you have put in that file by hand stays; only the
three Azure lines are replaced. It prints the key's fingerprint — sixteen characters, the same
ceremony the identity service's keys use — and never the key.

The key and the decision are two separate acts on purpose. The service refuses the model tier in
production until the production decision is written into the same file by hand — the script
deliberately does not write it, so that a credential that arrives alone (pasted early, left
behind by a test, restored from a backup) cannot put a public model in front of patients by
itself:

```sh
sudo sh -c "printf 'MYTHUSO_ASSISTANT_PRODUCTION=acknowledged\n' >> /etc/mythuso/assistant.env"
```

Without that line the service does not half-start: it prints `Refusing to start: … but
MYTHUSO_ASSISTANT_PRODUCTION is not set to "acknowledged" …` and exits, systemd tries again
every five seconds, and the journal repeats the same refusal. With it, both halves of the
switch are in place. Removing the line later, on purpose, is the decision reversed — the next
restart turns the model tier off and leaves the credential where it is.

Then, still on the box:

```sh
sudo systemctl enable --now assistant-api.service
```

### Proving it worked, with commands that reveal no secrets

```sh
curl -s http://127.0.0.1:8791/assistant/health
```

Expected: `{"ok":true,"mode":"phase-2-safe","azure":true,"ollama":false,"production":true,"activated":true}` —
the health route answers in booleans, never the endpoint, never the key. `"azure":true` is the
line that says the service found the credentials and read them; `"production"` and `"activated"`
are the service's own account of the decision — in production, `activated` stays `false` until
the acknowledgement line above is in the env file. Then through nginx, which is a different question —
it proves the `location /assistant/` block and the headers it redeclares:

```sh
curl -s https://mythuso.co.za/assistant/health
curl -sI https://mythuso.co.za/assistant/health | grep -iE 'x-frame|content-security|strict-transport'
```

Expected from the second: the same headers every page of the site carries — an
`X-Frame-Options: DENY`, a `Content-Security-Policy: frame-ancestors 'none'` and a
`Strict-Transport-Security` at `max-age=300`. And the service's own account of itself, which is
safe to read and safe to paste:

```sh
systemctl status assistant-api.service
journalctl -u assistant-api.service -n 30 --no-pager
```

Neither prints the key: `systemctl status` does not show environment files, and the service does
not log it.

If `azure` is still `false`, the service did not read the env file — `ls -l
/etc/mythuso/assistant.env` should say `root root` and `-rw-------`. If the service will not
start, the journal names the reason and never the key; the three ordinary ones are a deployment
name that does not match what the portal has (Azure answers 404), an env file that was
edited by hand instead of by the script, and the acknowledgement line not yet written — that
last one repeats every five seconds and means the step above was skipped. Fix the first two by
running the script again, then `sudo systemctl restart assistant-api.service`; fix the third by
writing the acknowledgement line, which the service's own retry picks up within seconds.

### What changes when it is on

Nothing on the site. The panel in `/app/` asks the engine's `POST /assistant/v1/turn` — falling
back to the unversioned `/assistant/turn` only where a deployment older than the versioned surface
answers that with a 404 — and asks it only after an answer the on-device matcher could not place,
and falls back to the on-device answer while the service is dark, which is what it has been doing
all along and is why no deploy ever needed this to succeed.
**Neither phone app asks the engine anything at all**: each carries a typed client generated from
the same contract, and `capabilities.json`'s `unifiedApi` flag is `enabled: false`, so switching
this on changes no behaviour on iOS or Android and switching it off breaks nothing there.

What the public can ask the model is bounded twice: nginx answers more than 60 requests
a minute from one address with `429` (a burst of ten is let through first), and a request body
over 768 KB is refused before the service sees it — the same 768 KB the service enforces itself,
sized for push-to-talk's base64 capture rather than a typed sentence.
Rotating the key is the script again with the new one, then
`sudo systemctl restart assistant-api.service` — and nothing else, because the acknowledgement
line survives a rotation: the script replaces only the three Azure lines. Taking the service
back out is in _Backing it out_ below.

### Choosing a speech provider

Since 28 September 2026 the service can hear through OpenAI Whisper (hosted) or Alibaba Qwen-ASR
and speak through Alibaba Qwen-TTS, beside Azure Speech, which is the default in both directions.
The credentials go in through the same script (`OPENAI_API_KEY`, `DASHSCOPE_API_KEY` with
`DASHSCOPE_REGION`); the choice is two lines written by hand in `/etc/mythuso/assistant.env`, one per
direction, each a card id from `packages/catalog/api-registry.json`:
`MYTHUSO_STT_PROVIDER=openai-whisper` (or `alibaba-qwen-asr`) and
`MYTHUSO_TTS_PROVIDER=alibaba-qwen-tts`, then `sudo systemctl restart assistant-api.service`. An id
that is not a built speech card for that direction stops the service from starting, and the line it
prints names the cards it could have been. **In production the service refuses either of these
providers for patient audio until the residency decision is signed:** neither has a South African
region, a capture and a spoken answer are health information, and
`docs/governance/DATA-RESIDENCY-OPTIONS.md` §7 — the decision the responsible party and the
Information Officer sign — is blank. The service starts, prints the refusal in the registry's own
words (`journalctl -u assistant-api.service` shows it), and carries on with Azure Speech for that
direction, or with the speech-not-configured refusal where Azure too is unconfigured. There is no
variable that overrides this, on purpose. On a development box the selection is honoured, which is
how the adapters are tried at all — and nobody had tried them against the live APIs when they were
built; each adapter's header says so.

Since 28 September 2026 a fourth speaking provider, ElevenLabs, is built the same way
(`apps/assistant-api/src/lib/providers/elevenlabs.ts`), and the same script takes its five lines:
`ELEVENLABS_REGION` (united-states, european-union, india or singapore — nowhere in South Africa),
`ELEVENLABS_API_KEY`, and the account's own voice identifiers `ELEVENLABS_VOICE_FEMALE`,
`ELEVENLABS_VOICE_MALE` and, for the administrator's own recorded voice, `ELEVENLABS_VOICE_OWN`. The
identifiers are typed with echo off and live in the env file only: one of them identifies a person's
voice, and no route returns any of them. Two things choose ElevenLabs: `MYTHUSO_TTS_PROVIDER=elevenlabs`
written by hand, as above, for the platform default; or an administrator's setting in the Control
Tower (GilbertOne → Speech settings, or Configuration → GilbertOne voice and speech settings) naming it
for a presentation register — routine answers, navigation, the signed-out visitor or the
administrator — with the speed, stability, model, encoding and the rest beside it. **In production
both are refused for a patient's voice until the residency decision is signed**, in the same registry
sentence, and the register is read by Azure Speech instead; the service prints one line at start-up
saying so for the settings, beside the line for the env selection. The emergency, refusal and
escalation registers never read through a chosen provider whatever either says. And the settings
themselves: the service reads them from `packages/catalog/voice.json`'s defaults, because it keeps no
settings history yet — the Speech settings screen says so — so a change made in the Control Tower
reaches the web preview and not this box until the service holds the history too.

---

## Founder access

> **Since 28 September 2026 the Control Tower itself is behind this door.** In production
> (`/app/?role=control-tower` and `?role=back-office`) nothing of the portal is drawn until the
> founder has signed in with the password and an authenticator code, and the door fails closed: a
> box where founder access is dark, or where the assistant service does not answer, shows a door
> nobody can open. So before a deploy that carries this build is useful, founder access must be
> switched on (below) and the service running; a restart shows the door to everyone again. Check:
> `curl -s -o /dev/null -w '%{http_code}\n' -H 'X-MyThuso-Founder: 1' https://mythuso.co.za/assistant/v1/founder/keys`
> answers `401` (on, no session), never `503` (dark). To reset the password or re-pair the
> authenticator: `sudo /opt/mythuso/ops/configure-founder-access.sh`, then
> `sudo systemctl restart assistant-api.service`.


Not part of any deploy, and off on every box until the founder switches it on here, by hand.
Founder access lets the founder — and nobody else — sign in to the assistant service from the
Control Tower (GilbertOne → Model Providers, or the Azure OpenAI and Azure Speech cards on API
Registry) with a password and an authenticator code, and reveal the Azure OpenAI key or the Azure
Speech key, one at a time, with a fresh code each time. Since 28 September 2026 the session lasts
two hours and the same sign-in unlocks the settings editors in the Control Tower — Configuration,
GilbertOne's Voice and Speech settings — where founder access is switched on; where it is off, the
editors stay a preview held in the tab's memory and say so. `docs/governance/FOUNDER-ACCESS.md` is the
account of what it is, what it refuses and what it cannot protect against; read it first.

Two lines in `/etc/mythuso/founder.env` switch it on, and they are two separate acts: the
credential, which the script writes, and the enable line, which only the founder writes. Every
founder route answers "Founder access is switched off on this server" until both are there and the
service has been restarted to read them. A deploy writes neither, and installs the script without
running it.

### Switching it on

After a deploy that carried this build (it installs the script, the runtime and the unit that reads
the file, and restarts nothing):

```sh
ssh liqzar-server
sudo /opt/mythuso/ops/configure-founder-access.sh
```

The password is typed twice with the echo off, at least fourteen characters, and stored only as an
scrypt hash. The script then prints an `otpauth://` line — and a QR code, if `qrencode` is installed
(`sudo apt install qrencode`) — **once**. Add it to the founder's authenticator app there and then,
and clear the terminal's scrollback afterwards: that line is the second factor. The script prints a
sixteen-character credential fingerprint for the register, never the password or the hash.

Then the decision, by hand, and a restart so the service reads both lines:

```sh
sudo sh -c "printf 'MYTHUSO_FOUNDER_ACCESS=enabled\n' >> /etc/mythuso/founder.env"
sudo systemctl restart assistant-api.service
```

A restart ends every session — founder access keeps sessions in memory only — and briefly
interrupts the assistant for patients; the web panel falls back to the on-device answer while it
restarts, as it always has.

### Proving it worked, with commands that reveal no secrets

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-MyThuso-Founder: 1' https://mythuso.co.za/assistant/v1/founder/keys
```

Expected: `401` — founder access is on and asks for a session. `503` means it is still dark: the
enable line is missing or mistyped (it is exact: `enabled`), the credential did not parse, or the
service was not restarted. `403` means the header was left off. Then sign in from the Control
Tower. Every attempt, sign-out, metadata read and reveal writes one line to the journal, carrying
the event, the outcome and — for a reveal — the key's name and fingerprint, and never a password,
a code, a cookie or a key:

```sh
journalctl -u assistant-api.service --no-pager | grep '"event":"founder.'
```

### Switching it off, rotating, and a lost phone

- **Off:** `sudo sed -i '/^MYTHUSO_FOUNDER_ACCESS=/d' /etc/mythuso/founder.env` then
  `sudo systemctl restart assistant-api.service`. The credential stays; every route is dark again.
- **Right now, whatever the file says:** `sudo systemctl restart assistant-api.service` ends every
  founder session at once.
- **New password, or a lost or replaced phone:** run the script again. It writes a new hash and a
  new authenticator secret, keeps the enable line as it was, and the old password and the old
  authenticator stop working at the next restart. There is no recovery code and no reset by email:
  the way back in is root on this box, on purpose.
- **Locked out after five failures:** wait fifteen minutes, or restart the service. If the lock
  keeps coming back when the founder is not trying, somebody else is — switch founder access off
  and read the journal.
- **A key was revealed somewhere it should not have been:** rotate it in the Azure portal and run
  `configure-assistant-env.sh` with the new one. Founder access cannot un-show a key.

### The settings history and the provider vault, 28 September 2026

> **Adding only the vault key, without re-pairing the authenticator.** `configure-founder-access.sh`
> writes a new password and a new authenticator secret every time it runs; run it when that is what
> you want. If founder access is already set up and only `MYTHUSO_VAULT_KEY` is missing, append it
> alone, once, and restart — the line is generated on the box and never shown:
>
> ```
> sudo sh -c 'grep -q "^MYTHUSO_VAULT_KEY=" /etc/mythuso/founder.env || printf "MYTHUSO_VAULT_KEY=%s\n" "$(node -e "process.stdout.write(require(\"node:crypto\").randomBytes(32).toString(\"base64\"))")" >> /etc/mythuso/founder.env'
> sudo systemctl daemon-reload && sudo systemctl restart assistant-api.service
> ```

Since 28 September 2026 the founder's session also reaches the assistant's settings in force and a
provider key vault (`docs/governance/FOUNDER-ACCESS.md`, _The founder's settings history and the
provider vault_). Three things on the box make them work, and none is done by a deploy:

- **The vault key.** `configure-founder-access.sh` now writes a third line into
  `/etc/mythuso/founder.env` the first time it runs on a box — `MYTHUSO_VAULT_KEY=…`, thirty-two random
  bytes in base64 — and leaves it exactly as it is on every later run. It is never printed. Without it
  the vault is locked: storing or removing a provider key from the Control Tower answers "This server
  has no vault key" (503) and nothing is stored in the clear. A box configured before this build has
  the line added by running the script again (a new password and authenticator come with it), then a
  restart. Never edit or rotate that line by hand: a rotated vault key is a vault nobody can read, and
  every stored provider key would have to be entered again.
- **The state directory.** The unit now declares `StateDirectory=mythuso-assistant`, so systemd creates
  `/var/lib/mythuso-assistant` (0700, owned for the dynamic user) and hands its path to the process in
  `MYTHUSO_ASSISTANT_STATE_DIR`. It holds `settings-history.jsonl`, `vault.json`,
  `founder-audit.jsonl` and, since 1 October 2026, `speech-ceiling.json` (the month and the number of
  characters the cloud voice has read in it, so the monthly ceiling survives a restart), each 0600,
  and nothing else — never anything a patient said. Without it the
  service answers every founder read with `persisted: false` and refuses every founder write (503,
  "This server has no state directory"). Back it up with the box; a backup of it alone reveals nothing,
  since the vault key is in `founder.env`.
- **A restart.** A deploy publishes the runtime and the unit and restarts nothing. The first deploy
  carrying this build therefore needs, by hand:

```sh
sudo systemctl daemon-reload
sudo systemctl restart assistant-api.service
```

Check, with commands that reveal no secrets:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-MyThuso-Founder: 1' https://mythuso.co.za/assistant/v1/founder/settings
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-MyThuso-Founder: 1' https://mythuso.co.za/assistant/v1/founder/providers
sudo ls -la /var/lib/mythuso-assistant/
journalctl -u assistant-api.service --no-pager | grep '"event":"founder.provider\.\|"event":"founder.settings'
```

Expected: `401` from both routes (on, no session — `503` is dark, `404` is the old runtime still
running); the directory present with any files in it mode `-rw-------`; and one journal line per
founder act, carrying the event, the outcome, the card or the setting and — for a key stored — its
fingerprint prefix, never a value. Then sign in from the Control Tower: the Speech settings and Voice
saves reach the service, and the voice test reads what was saved. The reveal is unchanged and reads the
environment's two Azure keys; a key stored in the vault is never shown to anybody again.

---

## What the site does, and what it does not, on day one

Somebody will open this link tonight and some of them will be deciding whether to fund it. What they
find has to be the same honesty the app carries everywhere else.

**It does not do anything yet.** Nothing is connected. `packages/catalog/capabilities.json` declares
the capabilities — accounts, booking, payments, payouts, credential verification, dispatch,
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
The deploy already asked twice, twenty seconds apart. Go to step 8 and then to _Backing it out_.
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

**`Building the assistant runtime` stopped the deploy**
The assistant bundle would not build, and nothing on the server was touched — that step runs
before the first `ssh`, so a bundle that will not build is a deploy that changed nothing. The
web entries were not published either. Read the error above it: it is a build error in
`apps/assistant-api`, and `npm run assistant-runtime` reproduces it locally.

**`not publishing the assistant runtime: …`**
The server's Node is older than the bundle is built for — the floor is `engines.node` in
`package.json`. The rest of the deploy completed and is unaffected; the assistant is skipped
loudly rather than failed over, because the public site must not become unpublishable over it.
Upgrade Node on the box and run the deploy again; the unit stays dark until then, which is the
state it was in anyway.

**`the assistant runtime arrived altered (sha256 …)`**
The file that landed is not the file that was sent. Nothing was published — the half-transferred
copy was deleted and the previous runtime is where it was. A wire that does that once usually
does it twice; look at the network before retrying.

**`assistant-api.service` will not start after activation**
`ssh liqzar-server "journalctl -u assistant-api.service -n 30 --no-pager"` names the reason and
never the key. The first thing to look for is the acknowledgement refusal — `Refusing to start:
… MYTHUSO_ASSISTANT_PRODUCTION is not set to "acknowledged"` — which is not a fault but the
production gate: the step in _Activating the assistant service_ was skipped, the service's own
five-second retry picks the line up the moment it is written, and no restart is needed. The two
ordinary causes after that are a deployment name that does not match what the Azure portal has
— the deployment's name, not the model's — and an env file edited by hand rather than by the
script. Fix both the same way: run `sudo /opt/mythuso/ops/configure-assistant-env.sh`
again, then `sudo systemctl restart assistant-api.service`.

---

## Rolling back a bad release

A deploy that published the wrong tree does not need rebuilding. The publish is a symlink swap onto
a directory under `/opt/mythuso/releases`, and the last few releases are kept there
(`KEEP_RELEASES` in `deploy/deploy.sh`, five by default), so going back is moving that symlink:

```sh
./deploy/rollback.sh                 # what is on the box, and which one is live
./deploy/rollback.sh <release>       # move the live symlink onto it, then verify
```

It needs no build, no rsync and no nginx reload, and it touches nothing else on the box — which is
the difference between a rollback you can do calmly while the site is broken on a machine that also
serves five other people's websites, and one that means rebuilding from an older commit first.

This is the reason the publish changed at all. It used to be `rsync -az --delete` straight into the
directory nginx serves, which destroyed the previous version as it wrote the new one and was not
atomic: a patient refreshing mid-deploy could be served the new `index.html` before the hashed assets
it names had arrived. The deploy still reported success, because every check in it runs afterwards,
against the finished tree.

What it does **not** roll back: the assistant runtime, the ops scripts, the nginx site file and the
systemd units. Each has its own mechanism — `deploy.sh` copies the runtime's previous bundle to
`/opt/mythuso/assistant/server.mjs.prev` before it moves the new one into place, and keeps the site
file's previous version at `/etc/nginx/sites-available/.mythuso.conf.prev` — and one symlink over the
web root does not cover them. `rollback.sh` moves neither copy back, and that is deliberate. The site
file's copy is not yours to move: the deploy that wrote the file is the one that puts it back, in its
own `roll_back_site`, whenever `nginx -t` refuses — the copy exists for that moment and is deleted
straight after a successful reload. The runtime's copy is yours, because the act that needs it is a
restart of a service that answers patients, and in this project a restart is a person's act and never
a script's. That sequence is below; taking the whole site off the box is under "Backing it out".

### The assistant runtime, from the copy the deploy kept

The copy is taken on every publish, before the `mv -f` that replaces the live file, and it is kept at
`0644 root:root` — the same posture as the bundle it is a copy of, because the service reads that
directory as a systemd `DynamicUser` and a previous bundle only root could read would be a file rather
than a rollback. The deploy says which generation it kept, and prints that bundle's sha256 beside the
new one's, so you can tell what you are about to go back to:

```
assistant runtime  /opt/mythuso/assistant/server.mjs  sha256 9f2c1a7b40de8e31…
   previous bundle kept at /opt/mythuso/assistant/server.mjs.prev  sha256 4b7e0d5c11a9f6e2…
```

Putting it back is a rename, not a copy over the live file, and the restart is what actually changes
what patients are answered — publishing a file does not change a running process, which is the same
reason the deploy warns when the service is behind:

```sh
ssh liqzar-server "ls -l /opt/mythuso/assistant/server.mjs.prev"
ssh liqzar-server "cd /opt/mythuso/assistant \
  && cp -p server.mjs.prev server.mjs.rollback \
  && chmod 0644 server.mjs.rollback && chown root:root server.mjs.rollback \
  && mv -f server.mjs.rollback server.mjs"
ssh liqzar-server "systemctl restart assistant-api.service"
ssh liqzar-server "curl -s http://127.0.0.1:8791/assistant/health"
```

Beside, then over, for the reason the deploy publishes `server.mjs.next` the same way: the unit has
`Restart=on-failure` and retries every five seconds, so a start that lands while the live file is
being written gets a half-written bundle — a syntax error wearing a rollback's success. The rename is
one step and cannot be read half-way through, and the mode and owner are restated so the restored
file's posture is what this sequence says rather than whatever the copy inherited.

The copy is left in place by design: a restore that consumed its own rollback would leave you with
nothing to try next. Know what that costs, though — after this, `server.mjs` and `server.mjs.prev`
hold the same bytes, so **the one generation is spent**. Going forward again means deploying the
commit that fixes it, not another move of these two files.

Two limits worth knowing before you need them. It is **one generation deep** — the bundle this box ran
before the last publish, and no further back; anything older means building and deploying from that
commit. And **the first publish to a box has nothing to copy**, so the `.prev` will not exist there and
the deploy says so rather than leaving a stale one behind to be mistaken for a way back. Neither case
is an outage: while the service is down or dark the panel in `/app/` falls back to the on-device
answers, which is what it does during any assistant outage. If the runtime is the wrong thing to have
on the box at all, remove it instead — that is under "Backing it out".

## Backing it out

MyThuso adds one nginx file, one web root, one directory of scheduled jobs and one directory of
superseded releases. Removing all of it leaves the other five sites exactly as they were:

```sh
ssh liqzar-server "rm -f /etc/nginx/sites-enabled/mythuso.conf && nginx -t && systemctl reload nginx"
```

That is the whole rollback, and it is the first thing to do if a neighbour is down. `nginx -t` runs
before the reload for the same reason it does everywhere else in this project. The web root, the
certificate and the timers can stay — none of them serves anything once that symlink is gone. If you
want them gone too:

```sh
ssh liqzar-server "systemctl disable --now mythuso-healthcheck.timer"
ssh liqzar-server "rm -rf /var/www/mythuso /opt/mythuso/ops /opt/mythuso/releases"
```

`/opt/mythuso/releases` is in that list because the publish is a symlink swap: the web root has been
a symlink since the atomic deploy, and the trees it points at live there. Removing only the web root
leaves the releases behind — a directory of superseded builds nobody looks at again, on a box five
other sites share.

Leave `/etc/letsencrypt` alone. Deleting a certificate you may reinstall in an hour is how you meet
the rate limit.

The assistant has its own, smaller rollback, and the site does not notice it — the panel falls
back to the on-device answers, which is what it does while the service is dark anyway:

```sh
ssh liqzar-server "systemctl disable --now assistant-api.service"
ssh liqzar-server "rm -rf /opt/mythuso/assistant"      # a later deploy reinstalls it
```

`/etc/mythuso/assistant.env` can go too, but know what you are removing: it is the only copy of
the Azure key on this box, and deleting it here does not disable the key — that is done in the
Azure portal, or the key still opens the account from anywhere that holds it. Removing the file
means the next activation is the full sequence in _Activating the assistant service_ above, with
a key pasted from the portal:

```sh
ssh liqzar-server "rm -f /etc/mythuso/assistant.env"
```
