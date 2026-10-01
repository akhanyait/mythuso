# "Lema" — a scope proposal for an API this repository does not contain

> **A scope for the founder's decision, written 1 October 2026.** Asked for as: *"Can you factor this
> API as well its used by lema app on mythuso, and wire it to the control panel as well and
> GilbertOne will have access to it. Please define scope for it."*
>
> **Nothing called "lema" exists in this repository.** That was established by search, not by
> impression, and §1 gives every command and every answer. This document therefore does not scope an
> integration. It does three things instead: it proves the absence, it identifies which of the five
> services that *do* exist here the ask most likely means, and it writes down what each reading would
> cost and refuse — so that whichever answer the founder gives, the next step is a decision rather
> than another search.
>
> Nothing in this document is built by the writing of it. No contract, lock, generator, screen or
> test was touched. It is the only file written.

---

## 1. What was searched, and what was not found

`CLAUDE.md` states the rule that governs this section: **a health service that overstates its
readiness is not a marketing problem.** An invented integration is worse than a missing one, so the
absence is proved first and at length. Every command below was run in this working tree at
`943be51e` on 1 October 2026, and every result was read off its own output.

### 1.1 The searches, and their answers

| # | Command | Returned |
|---|---|---|
| 1 | `git grep -ilwE "lema"` | **nothing**, exit 1 |
| 2 | `git grep -ilw --untracked -E "lema"` | **nothing**, exit 1 (untracked files included) |
| 3 | `rg -il --no-ignore --hidden -g '!.git' '\blema\b' .` | **nothing**, exit 1, 0 files (ignored and hidden files included) |
| 4 | `git grep -il "lema"` | **29 files** — every one a substring, classified in §1.2 |
| 5 | `git log --all --pickaxe-regex -i -S'\blema\b' --oneline` | **no commits** — the word has never been added to or removed from any file in the repository's whole history |
| 6 | `git log --all -S'lema' -i --oneline` | 11 commits, **all substring**; spot-checked `adf9896c` → the matching bytes are `a fleet or telematics supplier` |
| 7 | `unzip` each of the 7 real `.docx`/`.pptx` files under `Documentation/`, then `grep -rilw lema` over the extracted XML | **word=0, substring=0** in all seven |
| 8 | `rg -il '\blema\b'` over the agent transcripts | 2 files — **both are this task's own prompt and its subagent instruction**, not a prior decision |
| 9 | `git grep -il "lema" -- deploy/` | **nothing**, exit 1 |
| 10 | `git grep -oh -E "[a-z0-9-]+\.(co\.za\|com)" -- deploy/ \| sort -u` | the co-tenants: `agcafrica.com`, `artisanza.co.za`, `bidza.co.za`, `liqzar.co.za`, `skillsonwheels.co.za`, plus `mythuso.co.za`. **No site called lema.** |

The repository holds 1,951 tracked files (`git ls-files | wc -l`). Searches 1–3 cover every tracked,
untracked, ignored and hidden text file in it; search 7 covers the Office documents that a text
grep cannot read; search 5 covers every revision that has ever existed.

### 1.2 Every substring hit, classified

29 files contain the four bytes `lema` inside a longer word. All of them, with the word that
actually matched (`git grep -oh -i -E "[A-Za-z@/._]*lema[A-Za-z@/._]*" -- <file> | sort -u`):

| The word | Files | What it is |
|---|---|---|
| `TileMap` / `tileMap` / `./TileMap` | `apps/web/src/map/TileMap.tsx`, `LiveMap.tsx`, `map.css`, `lib/geography.ts`, `packages/catalog/map-providers.json`, `docs/FEATURE-MAP.md`, `docs/ROADMAP.md`, both `LOVABLE-*.md`, `tests/map.spec.ts`, `tests/arrival.spec.ts`, `tests/states.spec.ts`, `scripts/check-boundaries.mjs` | The map tile component and the bundle-budget rules about its dynamic import |
| `FileManager` | 7 Swift files, `apps/android/.../CaptureData.kt`, `packages/catalog/capture.json` | Apple's and Kotlin's file APIs |
| `MutableMap` / `mutableMapOf` | `apps/android/.../Assistant.kt`, `CareModels.kt`, `ConsultationScreens.kt` | Kotlin's standard map literal |
| `scalemass` | `apps/ios/.../PatientFileView.swift`, `Capture.swift` | A design-token symbol |
| `telematics` | `packages/catalog/feeds.json:2441`, `:2562` | The `responder-position` door's supplier sentence |
| `@googlemaps` | `packages/catalog/api-registry.json:435` | One `codeNames` entry on the Google Maps card |
| `elema` / `lemab` | `docs/design/MyThuso_Design_Flow_v2.pdf` | **Compressed-stream byte noise in a binary PDF**, not text |

Six distinct sources of noise and one binary artefact. None is a name, an identifier, a path, a
service or a product.

### 1.3 The other terms, checked the same way

The ask arrived in a batch of four messages at 16:56 on 1 October. The next one said *"see if the
systems ecosystem is wired from ecosyste,=m **just like ERP**. And also **ROI to all the small scale
farmers**."* Those words were checked too, and one of them is **not** absent:

| Term | `git grep -Iilw` (text files only, `-I` skips binary) | Verdict |
|---|---|---|
| `farmer` | 0 | absent |
| `agriculture` | 0 | absent |
| `Lema`, `LEMA` | 0 | absent |
| `ROI` | 1 — `docs/design/MyThuso_Design_Flow_v2.pdf` | **binary byte noise**, as with `lema` |
| `ERP` | 2 — the same PDF, **and `docs/governance/OPEN-SOURCE-INTEGRATION-SURVEY.md:240`** | **A real hit.** Line 240 is the Bahmni row of the open-source survey: *"Core OpenMRS modules for Bahmni, including ERP and ELIS Atom Feed clients."* It is a description of somebody else's module, not a MyThuso component. |

So: **there is no ERP in this product**, but the word is not pure noise — it appears once in prose,
describing Bahmni. That matters, because it is the one place in the tree where an enterprise-system
integration is discussed at all, and it is discussed as an *open-source survey finding*, not as
something wired.

### 1.4 What could not be searched, stated plainly

- **No external source was checked.** `WebSearch` was attempted twice — for an agriculture/farming
  product called Lema in South Africa, and for a Lema ERP with a public API — and both were refused:
  *"Interaction not available to subagent."* **Whether a product called Lema exists outside this
  repository is therefore unknown to this document and is not inferred.** If the founder's answer is
  "it is another product of mine", the first task is to obtain its address; nothing here can supply
  one.
- **The three PDFs under `Documentation/` were searched only as raw bytes.** Their text streams are
  compressed, so a word inside them would not be found by `grep`. `pdftotext` is not installed in
  this environment. The `.docx` and `.pptx` files, by contrast, *were* properly unzipped and
  searched (§1.1, row 7), and a `.pptx` is a ZIP of XML, so that result is sound.
- **Nothing on `liqzar-server` was touched.** No deploy, no nginx reload, no certificate file, no
  SSH. The statement in §1.1 row 10 that no co-tenant site is called lema is a statement about the
  domain names written in `deploy/`, **not** an observation of the running box. A lema app could be
  hosted there under a name this repository never records. Only the founder can rule that out.

### 1.5 What the message itself says

The transcript was read rather than assumed. Four user messages share the timestamp
**Thursday, 1 October 2026, 4:56 PM**, and the lema ask is the second of them. Reading the raw
message objects for all four showed **one `content` block of `type: "text"` each, and no attachment,
no image and no file reference on any of them.**

That is the most important structural fact in this section. The ask says *"factor **this** API"* —
and there is no antecedent. The preceding message in the transcript is a question about clinical
staff screens and the life-kit concept view, which names no API. **"This API" points at nothing the
session could see.** Combined with the absence of "lema" from the tree, the two readings that remain
are: the referent was on the founder's screen and not in the message, or it belongs to another
product entirely.

---

## 2. The candidate interpretations, with the evidence for and against each

Three clauses of the ask are the test. Each candidate is scored against all three:

1. **"factor this API"** — something that already exists and would be given a contract;
2. **"its used by lema app on mythuso"** — some app consumes it today;
3. **"wire it to the control panel"** — it is *not* currently wired to the Control Tower;
4. **"GilbertOne will have access to it"** — future tense, so GilbertOne does *not* have access now,
   and by the sentence's own grammar **it cannot be GilbertOne itself.**

That fourth clause eliminates one candidate immediately, and the third eliminates another. Both
eliminations are worth stating because they are logic rather than judgement.

### 2.1 `apps/assistant-api` — GilbertOne itself. **Ruled out by the sentence.**

| | |
|---|---|
| What it is | The assistant's API engine: `node:http`, no framework, `127.0.0.1:8791`, loopback only. Its contract is `packages/catalog/apis/assistant.json` — 44 routes, of which **27 `built`, 10 `proposed`, 7 `withdrawn`**. It serves **18 URL paths** (`git grep -oh 'req.url === "[^"]*"' -- apps/assistant-api/src/server.ts \| sort -u \| wc -l` → 18). |
| Reachable from a client today? | **Yes, and it is the only thing that is.** nginx `location /assistant/` at `deploy/nginx/mythuso.conf:155` proxies to `http://127.0.0.1:8791`, and `apps/web/vite.config.ts:139` proxies the same path in development. Live in production since 21 September 2026; `docs/governance/ASSISTANT-ACTIVATION.md` is the record, and it also records that **who activated it and under what approval are unknown**. |
| Match | **Contradicted.** "GilbertOne *will have* access to it" cannot describe GilbertOne. Also "wire it to the control panel" is already partly done: the Control Tower's whole *GilbertOne API Administration* category — 7 of the 28 tabs — is about this service. |
| Verdict | Not the referent. But it **is** the engine through which any answer to this ask would have to pass, so §3 is about its seams. |

### 2.2 The engine runtime — 171 routes no client can reach. **The strongest in-repo candidate.**

| | |
|---|---|
| What it is | `packages/engines/src/` — twelve engine modules plus `runtime`, `scenarios` and `settings`. Measured afresh for this document rather than carried over: `MYTHUSO_ENGINES=synthetic-data-only node --input-type=module -e "import {discoverEngines} from './packages/engines/src/server.ts'; …"` returns **12 engines, 171 bound route keys, 52 subscriptions**. (First attempt returned 0 because `discoverEngines()` is `async` at `packages/engines/src/server.ts:27` and was not awaited; the awaited figure is the one reported.) |
| Reachable from a client today? | **No — from nothing, in development or in production.** Three independent checks, all re-run here: `grep -n engines apps/web/vite.config.ts` → **exit 1**, no `/engines` proxy; the proxy block at line 132 holds exactly two entries, `/api` and `/assistant`. `git grep -n -E "['\"\`]/engines"` across `apps/web/src`, `apps/ios`, `apps/android`, `apps/assistant-api/src`, `apps/api/src`, `packages/mock-api/src` → **exit 1**, no HTTP path. (`git grep -n "/engines/"` alone returns ~150 hits, but every one is an *import* path such as `packages/engines/src/settings/shape.ts`, not a URL — that distinction was checked, because it is exactly the noise that produces a false finding here.) And `git grep -n engines -- deploy/` → 6 hits, **all `package.json`'s `engines.node` version floor**. |
| Match | **Clause 3 fits perfectly** — it is the one large thing in this repository that is *not* wired to the control panel. **Clause 4 fits** — `apps/assistant-api` imports from exactly two engine directories (`git grep -oh "packages/engines/src/[a-z]*" -- apps/assistant-api/src \| sort \| uniq -c` → `assistant` 12, `settings` 3), so GilbertOne reaches 2 of 12 engines and would indeed "get access" to the rest. **Clause 2 does not fit** — no app uses it; that is the whole problem. |
| Verdict | **If "lema" is a name for something in this tree, this is the most likely thing.** `docs/governance/ECOSYSTEM-WIRING-AUDIT.md` §3.3 reaches the same conclusion independently: *"171 routes are genuinely implemented and genuinely bind, in a process that no client is wired to and no deploy publishes… it is the single largest unwired seam in this repository."* Its §12 ranks the join second of six. |

### 2.3 A new external provider card in the API Registry. **The best structural fit for "factor this API".**

| | |
|---|---|
| What it is | `packages/catalog/api-registry.json` — Module 19 of `docs/PROMPT-CONTROL-TOWER-UI.md`, **`status: proposed`, `gate: G32`, `engine: assistant`**. It holds **27 provider cards** across ten categories (`llm`, `speech`, `payments`, `sms`, `maps`, `push`, `email`, `device-gateway`, `vector-store`, `knowledge-source`). Measured: **3 `configured`** — `azure-openai`, `azure-speech`, `openfreemap-tiles` — **3 `dark`**, **21 `not-configured`**. Also 8 card statuses, 6 card actions, 10 declared data flows, and an `addProvider` form with 7 fields. |
| Reachable from a client today? | The **screen** is: `apps/web/src/features/portal/gilbertone/ApiRegistry.tsx` draws the cards, and five of the six card actions are live through the founder's routes. The **registry's own actions have no handlers**: its `_gateWhy` says so — *"the secret vault built, the health-check runner tested, enable and disable tested, balance tracking tested. None is built."* |
| Match | **Clause 1 fits best of all** — "factor this API" is precisely what adding a card does: the API is declared as data, with its category, its `codeNames`, its residency tier and its gate, and nothing calls it until the build is satisfied. Clause 3 fits if the card is new. Clause 4 fits through a seam that already exists — see §2.7. |
| Verdict | **The most likely shape of the work if "lema" is a product outside this repository.** A provider card is how this codebase receives the instruction "there is an API, it is used by another app, give it a place in the control panel" — and it is the only one of these candidates where *adding a name that nothing calls yet* is the normal, expected act rather than a defect. |

Note honestly: the registry's `_note` says *"No screen reads it"* and names three files that
*"do not exist"*. That note is dated 24 September and is **now partly stale** — `ApiRegistry.tsx`
reads it, and `apps/assistant-api/src/lib/founder-access.ts` exists and serves the vault routes.
The three files it names by path genuinely are absent (`ls` → `secret-vault.ts`, `key-registry.ts`,
`provider-health.ts` all "No such file"); the routes are served from `server.ts` instead. A stale
note in a contract is a small thing, but it is recorded here because this proposal recommends
extending that contract and the note would need correcting in the same change.

### 2.4 `apps/api` — the identity service. **Deliberately switched off.**

| | |
|---|---|
| What it is | The identity service: zero dependencies, `node:http` + `node:crypto` + `node:sqlite` + `node:test`, port 8787. Holds identity only, never health information — a boundary check fails the build if a clinical table appears there. **47 `built` routes.** |
| Reachable from a client today? | **In development yes; in production no.** `deploy/nginx/mythuso.conf:204` is `# location /api/ {` — commented out — with the reason on the two lines above it: *"Commented out until TLS and an SMS provider exist: a one-time-code service must not be reachable over plain http."* `apps/web/src/lib/auth.ts` and `lib/consent.ts` fetch `/api/*` (8 of the 16 web fetch call sites) and `vite.config.ts:133` proxies it, so the screen is built against a service production does not front. |
| Match | Clause 2 partly — an app does consume it, in development. Clause 3 fits. But its 47 routes are **identity**, and "GilbertOne will have access to it" would mean giving a model-tier service access to identity data, which cuts against the POPIA distinction `CLAUDE.md` draws. |
| Verdict | Unlikely. And switching it on is not a wiring task: it needs an SMS provider and TLS, which `AGENTS.md` records as **explicitly out of scope during any deploy** — *"The identity service is off because there is no SMS provider… That is the intended state, not a bug to fix."* |

### 2.5 `apps/passport` — the Health Passport P0. **Development only, by refusal.**

| | |
|---|---|
| What it is | A separate zero-dependency service, its own SQLite file and its own master key, a consent gateway in front of every read and a hash-chained audit the patient reads. **19 `built` routes.** |
| Reachable from a client today? | **No, and it refuses to be.** `apps/passport/src/config.ts:7` states the first refusal happens *"before a socket opens or a file is created"*: it will not start without `MYTHUSO_PASSPORT_DEVELOPMENT=synthetic-data-only`, and never where `MYTHUSO_ENV` or `NODE_ENV` names any production word — *"`Production` and `prod` are refused as surely as `production`"*. It binds loopback, and a boundary check fails if anything in `deploy/` names it. |
| Match | Poor. It is gated on controls that do not exist: no signed DPIA, no registered Information Officer, no residency decision, no KMS/HSM custody — all four are open, per `docs/governance/README.md` and `ASSISTANT-ACTIVATION.md`. |
| Verdict | Not the referent, and not a candidate for any option in §4. Whatever lema is, **it may not become a second path into health data around the Passport's consent gateway.** |

### 2.6 `packages/mock-api` — the contract mock. **A development fixture.**

| | |
|---|---|
| What it is | Answers every contract route from fixtures and refuses exactly as each route declares. 833 tests pass. |
| Reachable? | **No.** `packages/mock-api/src/server.ts:1` explains why in its own words: *"A mock that answers every route of a health platform with plausible data is, from outside, a fake health service with a real address."* It refuses to start without `MYTHUSO_MOCK=synthetic-data-only`, binds `127.0.0.1`, **and checks the `Host` header as well as the address** — because *"a page that has rebound its own hostname to 127.0.0.1 connects from the loopback address with Host: evil.example, so the address alone let it in."* Every answer carries a header saying it is synthetic. |
| Match | None. It is a test double, not an API anybody uses. |
| Verdict | Ruled out. Included here only so the founder can see all five services were considered. |

### 2.7 The seam the fourth clause names, which already exists

There is one declared mechanism in this repository whose entire purpose is *"GilbertOne will have
access to it"*, and it is already written down. `packages/catalog/apis.json#gateways` holds exactly
two entries:

```
passport-gateway   engine: record    "The one synchronous door to clinical data: consent, purpose
                                      and scope checked and logged on every call."
tool-gateway       engine: access    "GilbertOne's allow-listed tool calls (§15D). A tool reaches
                   path: /v1/access/tools/{tool}
                                      another engine's action only by name from the allow-list,
                                      never a generic call."
```

The route is declared in `packages/catalog/apis/access.json`: **`POST /v1/access/tools/{tool}@1`,
status `proposed`, callers `["patient","caregiver"]**, purpose `["treatment","dispatch","dispensing",
"subject-access"]`, `idempotent: true`, taking `idempotencyKey`, `tool` and `arguments`. Its two
refusals are the valuable part, and they are already frozen:

- **`tool-not-allowed`** (403) — *"That tool is not on Gilbert's allow-list."* Why: *"A
  patient-facing model reaches only named actions (§15D)."*
- **`generic-record-tool`** (403) — *"Gilbert never gets a general-purpose record tool."* Why: *"A
  generic FHIR tool in front of a model is unrestricted access with a conversation in front of it."*

**This is the door any lema access would walk through, and it is already declared, already refused
and not yet built.** Whichever candidate the founder means, §4 routes through this rather than
inventing a new one.

---

## 3. What the two halves of the ask would concretely require

Written for the most likely interpretation — **an external API declared as a provider card, reached
by GilbertOne through the tool-gateway, drawn by the Control Tower's API Registry tab** — with the
engine-tier reading covered in §4 Option 3.

### 3.1 The state of the control panel today, verified rather than assumed

`packages/catalog/control-tower-portal.json` declares **14 categories and 28 tabs** (`node -e` tally
of `categories[].tabs.length` → `categories: 14 | tabs: 28`): Overview 3, Dispatch 2, Vetting 1,
Quality 1, Audit 1, Devices & Fleet 3, **GilbertOne API Administration 7**, Configuration 1,
Finance 2, Compliance 2, Governance 2, Clinical oversight 1, Catalogue 1, Growth 1. Its own contract
records `status: built`, **`gate: G15`**, and *"Built is not accepted."*

**A correction to a figure this ask was framed on.** The wiring audit says the Control Tower has
*"one live read"*. That is accurate for the portal's **Overview** — `apps/web/src/lib/portal.ts:194`
fetches `${base}/assistant/health`, and line 199 narrows it:

```ts
/* Only the fields the contract names, and only as booleans. Anything else the route might grow is
   not drawn, so a field added to the health answer cannot reach this screen by accident. */
const fields = Object.fromEntries(wanted.map(f => [f, body[f] === true]));
```

But the **GilbertOne category reads more than that**, and a scope built on "one read" would be built
on a wrong number. Verified call sites:

| Live read | Where | What it yields |
|---|---|---|
| Portal Overview health | `lib/portal.ts:194` | 6 booleans → `connected` / `degraded` / `disconnected` |
| Per-route service booleans | `lib/gilbertone-admin.ts:141` `readServiceBooleans()`, called by `features/portal/gilbertone/EngineOverview.tsx:39` | `ok, activated, production, azure, speech, ollama` — narrowed to `=== true`, the same discipline |
| Speech preview | `lib/gilbertone-admin.ts:219` | one `POST` to the contract's own speak route |
| **The founder's routes** | `lib/founder-access.ts:52` — one `fetch` inside `call()` at line 48, used by **4** call sites in that file and **8** `call<>` sites in `lib/founder-settings.ts` | session, keys, reveal, settings, settings/changes, providers, provider key/enabled/test/logs |

So the Control Tower's *GilbertOne* tab does reach the live service, through the founder's session.
**What it does not reach is any of the twelve engines.** That is the gap, and it is narrower and more
precise than "the control panel controls nothing".

### 3.2 The specific missing join, which this ask would either fix or duplicate

`apps/web/src/lib/settings.ts:211` proposes a change **in-process**:

```ts
const ask = (engine: string, request: Proposal, now: number) =>
  proposeChange(engineOf(engine), historyOf(engine), { ...request, byRole: adminRole(), byRef: adminOnDuty() }, now);
```

against `historyOf` at line 102 — a browser-local object. Meanwhile
`packages/engines/src/settings/routes.ts:3` declares the served half: *"Every engine with settings
answers `GET /v1/<engine>/settings` and `POST /v1/<engine>/setting-changes`"*. **That route is built,
bound and tested, and has no client.** Two settings histories — one in a browser tab, one in SQLite —
that cannot meet. An operator who changes the panic window changes it in the tab; a reload restores
the defaults.

This matters for the ask because **"wire it to the control panel" is the same sentence that would
fix this**, and any lema wiring that skips it adds a third history rather than joining the two.

### 3.3 Where GilbertOne's access must live — the boundary that may not break

`packages/gilbertone` is the deterministic half: **no dependencies, no network, no environment
variable**, compiled into all three platforms, and the build fails if anything under its `src/`
calls `fetch()`, imports a network or model module, or reads one. `AGENTS.md` records this as
settled and not to be reopened.

**So: lema access lives entirely on the `apps/assistant-api` side of that boundary, and never in
`packages/gilbertone`.** Concretely:

- A lema call is a **server-side** act, inside `apps/assistant-api`, reached only through
  `POST /v1/access/tools/{tool}` with `tool` naming lema on an allow-list.
- `packages/gilbertone` never learns lema exists. It keeps answering emergencies, essential refusals
  and the offline fallback from the message and the contract alone — which is what answers while the
  engine above is dark, and **first on every message either way**.
- The consequence, and it must be stated to the founder rather than buried: **if lema is down, the
  deterministic half still answers, and it will not mention lema.** A lema outage must degrade to a
  refusal the deterministic half can already render, never to a silence that looks like consent.
- **`AGENTS.md`'s safety invariant holds:** *affect may never soften a refusal or an emergency*.
  Nothing lema returns may lower a priority. `open-source.json`'s `model-gateway` door already states
  the same rule for models: *"nothing a model returns lowers an urgency."*

**Every change to `apps/assistant-api` is a production change.** It is live, nginx's
`location /assistant/` is the sole way in, and `ASSISTANT-ACTIVATION.md` records that **a deploy
publishes its runtime but never restarts it** — the restart is a person's act. Any lema work here
ships dark until somebody restarts the service by hand and reads `/assistant/health`.

### 3.4 The build check that makes an undeclared provider impossible

This is the most useful fact in §3 for costing the work. `scripts/check-boundaries.mjs:33300–33352`
enforces the registry, and for every `proposed` card it **sweeps the entire source tree and every
`package.json`** for that card's `codeNames`:

```js
for (const name of card.codeNames.map((n) => n.toLowerCase())) {
  for (const [f, text] of code)
    if (text.includes(name))
      throw new Error(
        `${f} names "${name}", and packages/catalog/api-registry.json records ${card.name} as
         proposed — not configured, not contracted, no adapter. A call to a provider the registry
         says is off is the one thing its a-disabled-provider-is-never-called refusal exists to
         stop. Record the adapter on the card, with its gate, in the same change.`,
      );
```

The swept set is `apps/assistant-api/src`, `apps/api/src`, `apps/passport/src`, `apps/web/src`,
`packages/gilbertone/src`, `packages/mock-api/src`, `packages/engines/src`, `apps/ios/MyThuso` and
`apps/android/app/src/main`, comments lifted out, generated files excluded — plus every workspace
manifest's dependencies.

**The consequence for this scope: a lema card declared `proposed` fails the build the moment any
code names lema, and the failure message tells the developer exactly what to do.** That is the
repository's own answer to "factor this API": the card comes first, the code cannot precede it, and
the build proves the order. It also means declaring a card is cheap and safe — it cannot silently
become a call.

Three further registry refusals bind any lema card, and they are the ones to write into the
contract JSON so all three platforms render them word for word:

- **`no-health-information-to-a-tier-3-provider`** — a field that may carry health information is
  never sent to a provider whose residency tier is contractual.
- **`no-offshore-speech-for-health-information-without-a-residency-decision`** — already live:
  `ASSISTANT-ACTIVATION.md` records that the Whisper and Qwen adapters built on 28 September
  **refuse to be selected in production** for health-information routes because
  `DATA-RESIDENCY-OPTIONS.md` §7 is still blank, and *"there is deliberately no variable that
  overrides this."*
- **`no-key-reaches-the-browser`** — never beyond the last four characters and a fingerprint prefix.

And the founder's vault, which a lema key would join: `packages/catalog/founder-access.json#vault`
already declares **six card slots** — `azure-openai`, `azure-speech`, `elevenlabs`,
`alibaba-qwen-tts`, `alibaba-qwen-asr`, `openai-whisper` — of which only **two** are revealable
(`#keys`: the two Azure cards). The vault is `aes-256-gcm` under `MYTHUSO_VAULT_KEY`, 32 bytes, in
`/etc/mythuso/founder.env`, and its `keyShape` refuses anything under 16 or over 512 characters
*because a 140-character key with spaces in it was once stored and health said `speech:true` while
every request failed*. **The founder's routes are dark by default**: every one refuses unless
`MYTHUSO_FOUNDER_ACCESS=enabled` is in `/etc/mythuso/founder.env` **and** a well-formed credential
is, and `configure-founder-access.sh` writes the credential and never the enable line — *"A
credential typed and a feature switched on are two decisions, taken as two acts."*

### 3.5 The eight steps, applied

`CLAUDE.md`'s *Adding a feature — the shape it takes*. What each step means for a lema card:

1. **The contract.** A card in `packages/catalog/api-registry.json` — id, one of the ten categories,
   `detailsFrom`, `buildStatus: proposed`, `statusToday: not-configured`, `codeNames` (the strings
   its code would have to use, so the §3.4 sweep can prove none exists), a `capabilityRef` or
   `feedRef`, and a `gate`. **Plus** a route in `packages/catalog/apis/<engine>.json` with callers,
   purpose, at least one refusal, the events it emits, `idempotencyKey` on any money or dispatch
   write, and the inside of every object as `fields` — never prose. Then
   `npm run apis -- --seed-new` appends its lines to `apis.lock` and the three locks beside it.
   **A number lives in one place:** every figure derives from an existing contract — residency tiers
   from `model-providers.json#residencyTiers`, not-connected sentences from `capabilities.json`,
   field types from `feeds.json#fieldTypes`. Nothing is restated. **A changed route is a new version,
   never an edit**, and changed includes a refusal added, removed or reworded. No lock line is ever
   edited or removed; the build compares every lock with its git history.
2. **A generator** `scripts/emit-<name>.mjs` into Swift and Kotlin, registered in `package.json` and
   in `check-boundaries.mjs`'s `generated` list. Swift escapes quotes; Kotlin escapes backslash,
   quote **and** `$`. *If lema is only a registry card and a tool, no new generator is needed —
   `npm run apis` already emits the route table into `ApisData.swift` and `ApisData.kt`.*
3. **Web** — `apps/web/src/lib/<name>.ts` and `features/<Name>.tsx`. *For a card, this is an edit to
   the existing `ApiRegistry.tsx` data, not a new screen; the screen draws whatever cards the
   contract holds.*
4. **iOS** and 5. **Android** — types beside the generated data, views and screens registered in
   `project.pbxproj` / the `when` block. *Note the honest constraint: both phones' generated route
   clients are effectively dead code today, because `unifiedApi.enabled` is `false` in
   `capabilities.json` and switching it on is **a founder decision, not a tidy-up**.*
6. **Boundary checks** in `scripts/check-boundaries.mjs`, each **proved to fire by breaking the
   source deliberately, then restored.**
7. **A journey** in `tests/<name>.spec.ts` on both viewports.
8. **`docs/FEATURE-MAP.md`** — a row for what landed and the refusals it adds.

**`apps/passport` is gated unchanged by any of this**, and the 21 September speech amendment does
not alter that.

---

## 4. Ranked scope options, smallest safe first

Each states what it builds, the seam it attaches to, the cost, **what it refuses**, and what it
needs before production. Options 1 and 2 cost nothing to build and are worth doing whichever way the
question in §5 is answered.

### Option 1 — **Do nothing but record.** *(Recommended first, and it is not a dodge.)*

- **Builds:** this document, plus one row in `docs/governance/README.md`'s table when the founder
  answers. No code, no contract, no lock.
- **Seam:** none needed.
- **Cost:** zero. Already paid.
- **Refuses:** **an invented integration.** This is the option that holds the line
  `CLAUDE.md` draws — a service that overstates its readiness is not a marketing problem. Building
  a lema card on a guess would be the codebase's first untrue sentence about a live production
  service.
- **Before production:** the answer to §5.

### Option 2 — **Answer the question, and correct two stale numbers while waiting.**

- **Builds:** (a) the `api-registry.json` `_note` corrected — it still says *"No screen reads it"*
  and names three files as the vault's home, while `ApiRegistry.tsx` reads it and
  `founder-access.ts` serves it (§2.3); (b) a generated wiring-state figure so
  "the Control Tower's live reads" is a number the build holds rather than prose that drifts —
  which is exactly the failure `a-door-count-lives-in-the-contract` was written to stop, after
  "eleven doors" stayed true in prose through ten feeds added.
- **Seam:** the registry's own contract; `check-boundaries.mjs`'s existing generated-file discipline.
- **Cost:** hours. No architecture touched.
- **Refuses:** a count in prose. Nothing new is called; nothing becomes reachable.
- **Before production:** nothing — it is documentation and a check. *(Note: this option requires
  editing files, so it is **not** part of this pass. It is scoped for the next one.)*

### Option 3 — **Join the engine tier to the control panel, for one engine.** *(The best value if "lema" is in-repo.)*

- **Builds:** the join `ECOSYSTEM-WIRING-AUDIT.md` §12 ranks second and third — an `/engines` proxy
  in `apps/web/vite.config.ts` beside the two that exist, **development only**; then point
  `apps/web/src/lib/settings.ts:211` at the already-built `POST /v1/<engine>/setting-changes` for
  **one** engine first (`safety`), keeping the in-memory path as the fallback when the runtime is
  not running.
- **Seam:** `packages/engines/src/settings/routes.ts` — built, bound, tested, and clientless today.
  No new door is invented; an existing declared one is finally used.
- **Cost:** a handful of lines in a dev-server config, then one call site for one engine.
- **Refuses:** the route's own refusals, which the Configuration screen already draws — a value
  outside its limits, a missing reason, a stale version, **and a clinical review that an admin may
  not confirm**, because the back office opens as an admin. And the runtime keeps refusing without
  `MYTHUSO_ENGINES=synthetic-data-only`, refuses a request that did not arrive on loopback **and**
  name a loopback host, and stays out of production because nothing in `deploy/` may name it. **The
  proxy adds no reachable production surface at all.**
- **Before production:** nothing — and that is the point. It fails closed: no runtime, no change,
  defaults on reload, exactly as today.
- **Why it is here rather than Option 4:** it converts *"no client can reach the 171"* into *"one dev
  client can"*, which makes every later join — including any lema join — testable. It is the
  prerequisite, not the prize.

### Option 4 — **Declare lema as a `proposed` provider card, with no code.** *(The answer if lema is external.)*

- **Builds:** one card in `api-registry.json` — `buildStatus: proposed`, `statusToday:
  not-configured`, its `codeNames`, its category, a `gate`, and a `capabilityRef` **only if** it
  genuinely serves one. The API Registry tab draws it as *not configured*, in the capability's own
  not-connected sentence. **No adapter, no key slot, no route.**
- **Seam:** the 27-card registry, which is already wired to the Control Tower's API Registry tab.
  Prefer this over a new door: `feeds.json` already holds **23 doors, and all 23 are linked from an
  engine contract** (verified — `referenced but NOT in feeds.json: []` and `declared in feeds.json
  but referenced by no contract: (none)`), so the door vocabulary is complete and held by the build
  at `check-boundaries.mjs:5411–5464`. A new door needs a reason; a new card needs a category.
- **Cost:** one contract edit, one `npm run generate`, one FEATURE-MAP row. Hours.
- **Refuses:** **everything, and provably.** The §3.4 sweep means the card's mere existence fails the
  build if any file in nine source trees or any `package.json` names lema — so declaring the card
  *is* the enforcement. `a-disabled-provider-is-never-called`: every route that depends on it
  answers the capability's own not-connected sentence. `no-key-reaches-the-browser`.
  `a-region-is-not-a-section-72-determination`: *"A dropdown cannot make a legal determination; it
  can record which question has been answered and which has not."*
- **Before production:** its gate closes — a contracted supplier, a residency tier from
  `model-providers.json#residencyTiers` (null until `DATA-RESIDENCY-OPTIONS.md` §7 is signed), a DPA
  reference for Tier 2 or 3, and an adapter recorded on the card **in the same change** as any code
  that names it.
- **Also corrects:** the stale `_note` from Option 2, in the same edit.

### Option 5 — **Give GilbertOne allow-listed access to lema, through the tool-gateway.** *(Only after 4.)*

- **Builds:** `POST /v1/access/tools/{tool}` — already declared at version 1, `proposed` — with
  `lema` as **one named tool on the allow-list**, its `arguments` in the named route's own request
  shape. GilbertOne calls it from `apps/assistant-api`, server-side.
- **Seam:** `apis.json#gateways` → `tool-gateway`, engine `access`. **This is the declared door for
  exactly this sentence**, and it is preferable to the other two `proposedDoors` in
  `open-source.json` — `hl7v2-inbound` (a partner's HL7 v2, needs mutual TLS and FHIR mapping with
  Provenance), `nhie-exchange` (needs the National DoH to publish a profile that, as
  `open-source.json` records, *"could not be found on 14 September 2026"*), and `model-gateway`
  (GilbertOne's own model tier, a different question).
- **Cost:** one handler, one contract version bump if any field changes, the generator, three
  platforms, a boundary check, a Playwright journey on both viewports, a FEATURE-MAP row. **Days,
  and every hour of it in a production service.**
- **Refuses:** `tool-not-allowed` — *"That tool is not on Gilbert's allow-list."*
  `generic-record-tool` — *"Gilbert never gets a general-purpose record tool… a generic FHIR tool in
  front of a model is unrestricted access with a conversation in front of it."* Plus: **no lema
  response may lower a priority** (§3.3); `packages/gilbertone` never learns lema exists; a lema
  outage degrades to a refusal the deterministic half can already render; and the tool reaches only
  what the allow-list names, never a generic call.
- **Before production:** Option 4 complete; the founder's vault extended if lema needs a key
  (`vault.cards` grows from six to seven, and `#keys` stays at two unless a reveal is separately
  decided); **`MYTHUSO_FOUNDER_ACCESS=enabled` written by hand** if the card is to be controlled
  from the tower; a **manual service restart** after deploy, because a deploy does not restart it;
  and — if lema carries health information — the residency decision that
  `no-offshore-speech-for-health-information-without-a-residency-decision` exists to demand, since
  **a region is not a section 72 determination**.

### Option 6 — **Build the lema integration.** *(Not scoped, and deliberately so.)*

This option is listed only to say why it is not listed. **Its endpoints, data model, purpose,
supplier and residency are all unknown, and inventing them is the one act this repository's rules
forbid.** If the answer to §5 is "lema is external", the correct next document is written *after*
the founder supplies the address or the contract — and at that point Option 4 and then Option 5 are
the path, not a sixth thing.

---

## 5. The single question

> **Which is lema — a product outside this repository (in which case: what is its address or repo?),
> or one of the five things already here: the 171-route engine tier no client can reach, the API
> Registry's provider cards, the identity service, the Passport, or the mock?**

One line answers it. If the answer is *"outside"*, Option 4 then Option 5, and the first task is to
obtain the contract. If it is *"the engine tier"*, Option 3. If it is anything else, this document
has already said what that thing is and what it refuses.

**What is not needed to answer it:** a decision about SMS providers, TLS, the DPIA, the Information
Officer, the residency determination, the clinical governance board, the Medical Director, `unifiedApi`,
gate G15 or HSTS. Every one of those is deliberately deferred and recorded as such, and none of them
blocks a one-line answer here.

---

## Appendix: what this pass did and did not touch

**Written:** this file, and nothing else. No contract, lock, generator, screen, test, config or
source file was modified. No `emit-*` generator was run. Nothing was staged or committed
(`git status --short` was clean at `943be51e` before this file and holds only it after). No deploy,
no SSH, no nginx reload, no certificate file, nothing touching `liqzar-server`. No Playwright run —
a headless browser cannot launch reliably in this environment, and the load would risk flake for
other work in progress.

**Run:** the searches in §1; `discoverEngines()` for the 171/52 figures; `node -e` reads of
`api-registry.json`, `apis.json`, `apis/access.json`, `apis/assistant.json`, `apis/pulse.json`,
`feeds.json`, `open-source.json`, `control-tower-portal.json`, `control-tower-overview.json`,
`founder-access.json`, `capabilities.json`; `ls` for the three absent vault files; `sed -n` to
confirm every cited line number; and `unzip` into a temporary directory for the Office documents.
`npm run check` was **not** run — `ECOSYSTEM-WIRING-AUDIT.md` §10.1 records that it currently fails
on a generator-freshness check (`docs/brand/CI.md` older than `docs/FEATURE-MAP.md`, fixed by
`npm run ci`), which is unrelated to this document and which this pass had no mandate to touch.

**Not verified, and therefore not claimed:** whether a product called Lema exists anywhere outside
this repository (`WebSearch` was refused for this session, §1.4); anything about the running box;
anything inside the three `Documentation/` PDFs, whose text streams are compressed and for which
`pdftotext` is unavailable.
