# Founder access — a sign-in and a guarded key reveal

**Built 24 September 2026 on the founder's instruction. Dark by default: it does nothing on any box
until the founder switches it on by hand.** The contract is `packages/catalog/founder-access.json`;
the service's half is `apps/assistant-api/src/lib/founder-access.ts` and four branches of
`apps/assistant-api/src/server.ts`; the screen's half is
`apps/web/src/features/portal/gilbertone/founder/FounderAccess.tsx` and
`apps/web/src/lib/founder-access.ts`; the credential is written by
`deploy/ops/configure-founder-access.sh`; switching it on is `deploy/RUNBOOK.md`, _Founder access_.

## What it is

One person — the founder — signs in to the assistant service from the Control Tower (GilbertOne →
Model Providers, or the Azure OpenAI and Azure Speech cards on API Registry) with a password and a
six-digit authenticator code. Signed in, the founder sees what may be said about the two Azure keys
the service holds without revealing either: whether each is set, its masked last four characters,
and the first sixteen hex characters of its SHA-256 — the same fingerprint
`configure-assistant-env.sh` printed and the register records. Typing a fresh code reveals one key.
The revealed key is drawn masked until the eye is pressed, can be copied, and is wiped from the
screen after thirty seconds, when the tab is hidden, when the page or the screen is left, and on
sign-out.

That is all it does. It cannot change a key, enter one, switch the service or a provider on or off,
or read anything else the server holds.

## What it amends, and why that is recorded here

`docs/PROMPT-CONTROL-TOWER-UI.md` §1 says "API keys never reach the browser in full" and §12 "Do not
reveal a full key to the browser — masked metadata only". Founder access is a deliberate exception
to both, for exactly one caller and exactly two keys, on the founder's decision recorded in
`packages/catalog/founder-access.json#decision`. Every other administration screen, every other key
and every other person is still held to §1 and §12, and the Phase 4 boundary checks still hold every
other GilbertOne file to drawing no live control and no password field (the one file exempted is
named in `scripts/check-boundaries.mjs`). The portal's own refusal sentence
(`no-key-on-an-admin-screen`) now names the exception rather than claiming no key is ever shown.

The Control Tower has no authentication of its own — its role switcher is a preview picker — so
anything the portal can fetch, anybody on the internet can fetch. Every control below is therefore
in the assistant service, and none of them trusts the page.

## The controls

| Control | What it is | Where it is enforced |
|---|---|---|
| **Dark by default** | Every founder route answers `founder-access-dark` (503) unless the service's environment carries **both** `MYTHUSO_FOUNDER_ACCESS=enabled`, exactly, **and** a well-formed credential. The script writes the credential and never the enable line; no deploy writes either, or runs the script. | `founderAccessEnabled()`, `gate()`; boundary check: every branch asks the gate first, nothing under `deploy/` writes the line |
| **Two factors** | A password (at least fourteen characters) checked against an scrypt hash — N = 2^17, r = 8, p = 1, 64-byte key, 16-byte random salt, `node:crypto` — and an RFC 6238 code (SHA-1, 30-second step, six digits, ±1 step), through `apps/api/src/totp.ts`, the one TOTP implementation in the repository. | `signIn()`; tests: the RFC's vectors, scrypt verify |
| **One refusal for both factors** | A wrong password, a wrong code and a reused code are all refused with `founder-credentials-refused`, which never says which was wrong. | `signIn()`; test |
| **Every code is burned** | An accepted code's step, and every step before it, is refused afterwards — at sign-in and at a reveal. | `lastUsedStep`; tests: replay refused |
| **A fresh code for every reveal** | A live session is not enough to reveal: each reveal needs a code that has not been used. A stolen cookie reads metadata and reveals nothing. | reveal branch + `reveal()`; boundary check; test |
| **Lockout** | Five consecutive failures — sign-in or reveal — lock the whole account for fifteen minutes and end every session. The lock is checked before any password is hashed. | `fail()`, `locked()`; boundary check; tests |
| **The session** | A random 256-bit id in the cookie `__Host-mythuso_founder` — `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`, no Domain. Held in memory only, hashed, compared in constant time, one at a time (a new sign-in ends the old one), two hours (fifteen minutes until the founder's amendment of 28 September 2026, when the same sign-in came to unlock the Control Tower's settings) from sign-in with no renewal. A restart signs the founder out. | `sessionCookie()`, `sessionFrom()`; boundary check; test |
| **Cross-site refused** | Every founder route refuses (`founder-request-cross-site`, 403) a request without the `X-MyThuso-Founder: 1` header or whose `Sec-Fetch-Site` is present and not `same-origin`. The origin policy grants that header to no origin, so a page on another site cannot even send it; the existing origin policy still refuses any browser origin but the site's own first. | `crossSite()`; test |
| **Two names, exactly** | Only `AZURE_OPENAI_KEY` and `AZURE_SPEECH_KEY` can be revealed. Any other name is refused (`founder-name-not-allowed`) before the environment is read — never the password hash, the authenticator secret, an endpoint, or anything a future line in an env file might hold. | `REVEAL_ALLOWLIST`, `reveal()`; boundary check; test |
| **The response** | The key travels in one response body with `Cache-Control: no-store` and `Pragma: no-cache`, and in nothing else — no header, no log, no URL. | reveal branch; test |
| **Audit** | One JSON line per sign-in attempt, sign-out, metadata read and reveal: the event, the outcome and — for a reveal — the key's name and fingerprint. Never a password, a code, a cookie or a key: the line is built by one function whose parameters cannot carry them, and the lib itself writes nothing. | `founderLine()`; boundary check; test reads every line back |
| **In the browser** | The revealed key lives only in one component's state (`RevealKey`), set only from the reveal route's answer; it is never stored (the repository forbids browser storage outright), logged or put in a URL, and the forms say `method="post"` so a form that fell back to a plain submit would still put nothing in an address. Wiped after 30 seconds, on tab hide, page hide, history move, sign-out and navigation. The panel arrives on its own dynamic import. | `FounderAccess.tsx`; boundary check; Playwright on both viewports |
| **Native apps** | Neither phone app can reach founder access; the native-clients boundary check refuses the addresses. | `scripts/check-boundaries.mjs` |

## Switching it on, off, and rotating

`deploy/RUNBOOK.md`, _Founder access_, has the exact commands. In short:

1. After a deploy carrying this build, on the box: `sudo /opt/mythuso/ops/configure-founder-access.sh`
   — the password twice, then the `otpauth://` line (and a QR code if `qrencode` is installed) shown
   once for the authenticator app. Clear the scrollback afterwards.
2. By hand: `sudo sh -c "printf 'MYTHUSO_FOUNDER_ACCESS=enabled\n' >> /etc/mythuso/founder.env"`.
3. `sudo systemctl restart assistant-api.service`.
4. `curl … /assistant/v1/founder/keys` with the header answers 401 (on, no session), not 503 (dark).

Off: delete the enable line and restart. Now, whatever the file says: restart (it ends every
session). New password or a lost phone: run the script again (the enable line is kept; the old
factors stop working at the next restart). There is no recovery code and no email reset: the way
back in is root on the box, on purpose.

## What an attacker can and cannot do

| With… | They can | They cannot |
|---|---|---|
| **Nothing** (an external attacker on the internet) | See whether founder access is on (401 against 503). Guess at sign-in, at most five times per fifteen minutes before the lock, behind nginx's 60 requests a minute. Keep the founder locked out by failing on purpose. | Reveal or read anything. Get a password hashed while the lock holds. Reach the service except through nginx. |
| **The password alone** | Nothing more than the stranger above: sign-in needs the code too, and the refusal does not tell them the password was right. Their failures still count toward the lock. | Sign in; learn that the password is correct; reveal anything. |
| **The password and one code they watched being typed** | Nothing, once the founder has used it: it is burned. Within the ninety seconds of its window, if the founder has not used it yet, sign in — and then still need a *further* fresh code to reveal. | Reveal a key without a second code nobody has used. |
| **A stolen session cookie** (malware in the founder's browser could not read it — it is HttpOnly — but a copy from the founder's disk could) | Read the two keys' metadata (present, last four, fingerprint) until the session's two hours run out. | Reveal a key (each reveal needs a fresh code). Extend the session. Use it after a restart or a new sign-in. |
| **The authenticator secret** (the phone, or a copy of the URI from the scrollback) | Mint codes forever — the second factor is gone. Still needs the password. | Sign in without the password. |
| **The founder's unlocked, compromised browser** | Everything the founder can do while signed in, including watching a reveal. This is the residual risk no server-side control removes. | Anything after sign-out or a restart without the founder's next code. |
| **Root on the box** | Read `/etc/mythuso/assistant.env` and the keys directly, whether founder access exists or not; read or replace the founder credential. | — founder access neither adds to nor subtracts from root. |
| **A curious admin** (anybody using the Control Tower with a staff role) | See the founder panel and its sign-in form, and nothing behind it. The role picker grants nothing here. | Sign in without the founder's password and authenticator. |
| **A compromised tenant key** | Nothing: no tenant key exists, and founder access is not a tenant mechanism. When tenant keys are built, they must never be revealable through this route — the allowlist is two Azure names and the boundary check holds it there. | Reach founder access by any key. |

## Residual risk

- **A key shown is a key that can be copied.** The screen wipes it; it cannot un-show it. Screenshots,
  screen-sharing, the clipboard (and clipboard history on the founder's device), and a shoulder are all
  outside any control here. If a key may have been seen by anybody else, rotate it in the Azure portal.
- **Lockout is a denial-of-service lever.** Anybody can keep the founder locked out by failing five
  times every fifteen minutes. That is the right way round — a stranger locks the door rather than
  opening it — and the fallback is the terminal on the box, which is what the founder had before.
- **One password, one authenticator, no recovery.** Losing the phone means running the script again as
  root. There is no second founder and no break-glass, on purpose.
- **The keys are still in an env file.** Founder access is not a vault or key custody
  (`docs/governance/KEY-CUSTODY-OPTIONS.md` is still open); it is a read path onto what the file
  already holds.
- **The audit is the service's journal**, which the box's journald settings cap (and which a co-tenant's
  file currently sets — `docs/governance/ASSISTANT-ACTIVATION.md`). It is not hash-chained like the
  identity service's audit, and root can edit it.
- **The session is in one process's memory**, so a restart signs the founder out and a second process
  (there is none today) would not share it.
- **No DPIA covers this.** It touches no health information and no personal information but the
  founder's own sign-in; when the assistant's DPIA is written it should still name founder access, as
  the speech amendment in `CLAUDE.md` asks for the microphone.

## The settings gate, 28 September 2026

The founder's amendment: one sign-in, for two hours, also unlocks the settings editors in the
Control Tower — the Configuration tab, GilbertOne's Voice saves and Speech settings — because the
founder is the only person with access today. The gate is `apps/web/src/lib/founder-gate.ts`, in the
browser: it opens an editor only when the service says the founder is signed in. Where founder access
is switched off, or the service does not answer, the editors stay a preview and say so, since every
setting in the web preview lives in the tab's memory and reaches no patient. That means the gate is a
gate on a preview: the day the service keeps a settings history, the settings routes take the session
cookie and enforce it themselves, and the browser's gate stops being the only one. A reveal of a key
still needs a fresh code each time; the longer session does not change that.

## The Control Tower's door, 28 September 2026

The founder's instruction: "When you click on Control Tower it must bring logins with 2FA." So in
production, opening the Control Tower or the back office — `/app/?role=control-tower`,
`/app/?role=back-office`, or either role's button on the demo login — draws the founder's two-factor
sign-in first, and the portal is drawn only while the assistant service says the founder's session is
live. It is the same sign-in as the panel above: the same password and authenticator code, the same
four routes, the same `__Host-mythuso_founder` cookie for two hours, the same lock and burned codes,
and the same form — `apps/web/src/shells/FounderGate.tsx` draws the reveal panel's `SignIn` through a
dynamic import, so the product has one sign-in form and one file that draws a password field. The
contract is `packages/catalog/founder-access.json#door`; the door holds on exactly
`import.meta.env.PROD || gate=founder` in the address, and `scripts/check-boundaries.mjs` holds that
line to that condition.

What it refuses, in the order that matters:

- **It fails closed.** Where the service says founder access is dark on the box, or does not answer at
  all, the door stays a door and says so in the contract's own sentence, with no form drawn. It never
  falls through to the portal: one line draws the portal, under one condition — the service said the
  founder is signed in — and the build holds it there. Sign-out puts the door back, and so does the
  session's own end: the door asks the service again a second after `expiresAt` and whenever the tab
  comes back into view, and a service restart shows the door to everyone at once.
- **It is not an admin login system.** It admits one person, the founder, and says on its face that no
  other account exists yet. The fifteen administration layers behind gate G16 still do not exist, and
  the demo login still says so on every workspace. The patient, nurse, doctor and partner previews are
  not behind it: they are demonstrations on synthetic data, with nothing to protect and nothing to grant.
- **It grants nothing.** Every factor is checked by the service; the door asks and draws the answer.
  Nothing is stored anywhere in the browser, nothing typed reaches an address, the forms are
  `method="post"` with their own handler, and the door's file may not name a password, a code, a
  reveal or a request of its own.
- **It costs the patient nothing.** The door lives behind the portal's dynamic import: every asset
  `apps/web/dist/index.html` references, gzipped at level 9, measured 274.57 kB across 15 files before
  and 274.55 kB across 15 files after, the same way.

Outside production the door is drawn only when the address carries `gate=founder` — which is how
`tests/founder-gate.spec.ts` covers it against the dev server with the founder routes mocked as
`tests/founder-access.spec.ts` mocks them, and how every other Control Tower journey stays untouched.
The demo login's buttons open the same door the address does, and that is proved against the built app
rather than by carrying the parameter through the role switcher, which is on the patient's first load.

**What is honest but undone.**

- **A door in the browser protects what is drawn, not what is served.** The portal's own reads — the
  contracts, the assistant's health and status routes — are the same reads anybody could make, as the
  paragraph under _What it amends_ says; the door keeps the Control Tower off the screen of anybody who
  is not the founder, and the founder routes keep the keys. Nothing else behind the door is enforced by
  a server yet, and the settings gate section above says when that changes.
- **Switching founder access on is now on the production checklist.** A deploy of this build to a box
  where founder access is dark puts a door in front of the Control Tower that nobody can open — the
  right failure, and one that has to be planned for: `deploy/RUNBOOK.md`, _Founder access_, before the
  Control Tower is opened on `mythuso.co.za`. The runbook does not yet say so in its checklist.
- **One session, one process.** The session lives in the assistant service's memory; a restart, a lock
  or a second sign-in ends it, and the door is what the founder sees next. There is still no second
  founder and no break-glass, on purpose.
- **In development only**, a navigation inside the portal rewrites the address without the parameter,
  so a reload after it opens the portal directly; the door is read once when it mounts and holds until
  the role changes. Production reads `import.meta.env.PROD` and needs no parameter.

## When this file is updated

When founder access is switched on or off on a box (the date and who), when the credential is
rotated (the date and the new fingerprint), when a key is rotated because of a reveal, and whenever
the allowlist, the lock or the session change — which is a change to the contract and a new version
of the routes, never an edit.
