# Ecosystem Wiring Audit

**Audited:** 1 October 2026, on a clean tree at `ba37ee5b`.
**Author:** an agent session, read-only. The only file written is this one.
**Question put by the founder:** is the systems ecosystem wired — are the engines, events, contracts and
screens connected to each other end to end the way an integrated business system would be, or are there
seams declared and never joined?

---

## 1. An honest lead: what was audited, how, and what was not

Everything in this report was obtained by running a command in this repository and reading its output.
Where a number appears, the command that produced it appears beside it. Nothing here is estimated, and
nothing is carried over from another session's summary.

**What was audited.**

- The thirteen engine API contracts in `packages/catalog/apis/*.json` and the four locks beside them,
  route by route and status by status.
- The evidence each `built` route names, and whether that evidence actually binds the route at runtime.
  This was done by importing `packages/engines/src/server.ts`'s `discoverEngines()` in a real Node
  process with `MYTHUSO_ENGINES=synthetic-data-only` and reading the keys of each engine's `routes`
  object — the runtime's own answer, not a guess from a grep.
- The event bus: all four declared sources, the 141 lock lines, the 52 subscriptions the runtime
  actually registers, and the emitters the built routes declare.
- Every `fetch()` in `apps/web/src` — all sixteen call sites — and the Vite proxy that decides which of
  them can reach anything.
- The nginx configuration in `deploy/nginx/mythuso.conf`, to establish what production actually fronts.
- GilbertOne's reach: which engine directories `apps/assistant-api/src` imports, and the three
  conditions `apps/assistant-api/src/lib/triage-gate.ts` reads.
- `npm run check` and all six node:test suites.
- The bundle-budget script, the accessibility spec and its audit helpers, and the design-token surface.

**What was not audited, and why.**

- **No browser was launched.** Playwright cannot run in this environment: Chromium segfaults with
  `signal 11 SEGV_ACCERR`, and `os.cpus()` returns empty so Playwright misdetects this arm64 machine as
  mac-x64. Every claim about a rendered screen in this report is therefore a claim about *code*, read
  from source. **No accessibility test result is reported here, because none was obtained.** Section 8
  reports what `tests/accessibility.spec.ts` asserts by reading it, and says plainly that it was not run.
- **The bundle was not re-measured.** `node scripts/check-bundle-budget.mjs` was run against the
  `apps/web/dist` already on disk, and that build is stale: `apps/web/dist/index.html` has mtime
  `2026-10-01T05:57:36Z` while `HEAD` was committed at `2026-10-01T15:21:55+0200`. The figure reported
  in Section 8 is the stale build's, labelled as such. `npm run build -w @mythuso/web` was not run.
- **No native build was compiled.** The iOS and Android claims come from reading Swift and Kotlin source
  and the generated files, not from `xcodebuild` or `gradlew`.
- **Nothing on `liqzar-server` was touched.** No deploy, no nginx reload, no certificate file. The
  statements about production come from `deploy/nginx/mythuso.conf` and `deploy/RUNBOOK.md` in the tree.
- **No network call was made to any live endpoint.** The claim that `/assistant/` is live in production
  is a claim about what the committed nginx configuration and the governance record say, not an
  observation of the running service.

---

## 2. The engine inventory

`packages/engines/src/` holds fifteen directories: twelve engine modules, plus `runtime`, `scenarios`
and `settings`, which are shared machinery rather than engines.

Command: `ls -d packages/engines/src/*/`

| Engine | Contract file | Routes declared | `built` | `proposed` | `withdrawn` | Bound at runtime | Runtime subscriptions |
|---|---|---:|---:|---:|---:|---:|---:|
| access | `apis/access.json` | 55 | 50 | 5 | 0 | 17 | 3 |
| assistant | `apis/assistant.json` | 44 | 27 | 10 | 7 | 2 | 0 |
| care | `apis/care.json` | 22 | 21 | 1 | 0 | 16 | 6 |
| clinical | `apis/clinical.json` | 28 | 14 | 14 | 0 | 11 | 8 |
| core | `apis/core.json` | 20 | 19 | 1 | 0 | 13 | 8 |
| devices | `apis/devices.json` | 25 | 13 | 12 | 0 | 12 | 0 |
| medicines | `apis/medicines.json` | 26 | 17 | 9 | 0 | 15 | 7 |
| money | `apis/money.json` | 33 | 26 | 7 | 0 | 26 | 8 |
| movement | `apis/movement.json` | 28 | 17 | 11 | 0 | 17 | 6 |
| pulse | `apis/pulse.json` | **0** | 0 | 0 | 0 | — | — |
| record | `apis/record.json` | 23 | 21 | 2 | 0 | 2 | 1 |
| safety | `apis/safety.json` | 47 | 38 | 9 | 0 | 26 | 5 |
| trust | `apis/trust.json` | 28 | 25 | 3 | 0 | 14 | 0 |
| **Total** | 13 files | **379** | **288** | **84** | **7** | **171** | **52** |

Commands: the route counts come from a `node -e` walk of `packages/catalog/apis/*.json` reading each
file's top-level `routes` array and tallying `status`. The bound-route and subscription counts come from
`MYTHUSO_ENGINES=synthetic-data-only node -e "import('./packages/engines/src/server.ts')…"`, calling
`discoverEngines()` and taking `Object.keys(e.routes).length` and `Object.keys(e.subscriptions).length`
per engine.

**`pulse` declares no routes at all.** `packages/catalog/apis/pulse.json` exists and is counted among the
thirteen files, but its `routes` array is empty. Its ten events are declared in
`packages/catalog/assistant.json` and locked — eight `pulse.*` versions appear in `events.lock` — and
nothing under `packages/engines/src` implements a pulse engine. The speech conversation mode described
in `CLAUDE.md`'s founder amendment of 21 September 2026 has a contract and a lock, and no engine.

**Every one of the twelve engines has a contract, and every contract has events with lock lines.**
That part of the architecture is complete and is held by the build.

---

## 3. The route inventory, and its honesty

### 3.1 What the evidence actually says

Every `built` route in these contracts names an evidence handler. The build enforces this: a route may
not be marked `built` without one. Grouping the 372 live routes by where their evidence file lives:

Command: a `node -e` walk of `packages/catalog/apis/*.json` reading `route.evidence.file` for every
non-withdrawn route.

| Evidence location | Live routes | Served by a running process? |
|---|---:|---|
| `packages/engines/**` | 197 | Development only. Not deployed. |
| `apps/api/**` (identity) | 47 | Built, and **switched off in production**. |
| `apps/assistant-api/**` (GilbertOne) | 25 | **Live in production** since 21 September 2026. |
| `apps/passport/**` | 19 | Development only. Refuses to start without its flag. |
| *(no evidence file named)* | 84 | No. These are the `proposed` routes. |

The 84 routes with no evidence file are exactly the 84 `proposed` routes. **No route is marked `built`
without naming a handler file.** That invariant holds, and it is the single most reassuring thing in
this audit: the contract does not lie about what has been written.

### 3.2 Reconciling 288 `built` against 171 bound

The engine runtime binds 171 route keys, but 197 live routes claim `packages/engines` evidence. The
gap of 26 was chased route by route, and it is **entirely benign**:

Command: `MYTHUSO_ENGINES=synthetic-data-only node -e …`, comparing each built engine route's
`method + path + @version` against the runtime's bound keys, then checking whether a *different version
of the same path* is bound.

- built engine-evidence routes not bound, but with a bound successor version: **26**
- built engine-evidence routes with no bound version of their path at all: **0**

Examples: `GET /v1/core/loops@1` is not bound; `GET /v1/core/loops@2` is. `POST /v1/safety/setting-changes@1`
is not bound; `@2` is. `GET /v1/safety/settings@1`, `@2` and `@3` are not bound; `@4` is.

This is the versioning rule working as written: a changed route is a new version, the old version keeps
its lock line and its evidence, and the runtime serves the current one. **The arithmetic closes
exactly**: 171 bound + 26 superseded = 197 engine routes, and 197 + 47 + 25 + 19 = 288 `built`.

### 3.3 The count that matters: what no service serves

> **A declared route that no service serves is the single most important thing to count here.**

| Category | Count |
|---|---:|
| Live routes declared | 372 |
| Served by *some* process that can be started | 262 |
| **Declared and served by nothing at all** (the 84 `proposed`) | **84** |
| **Reachable from a browser in production today** | **25** |

The last row is the honest one, and it is the answer to the founder's question.

- **In production, 25 of 372 live routes are reachable** — the `assistant` engine's, fronted by
  `location /assistant/` at `deploy/nginx/mythuso.conf:155`, which proxies to `http://127.0.0.1:8791`.
  The identity service's `location /api/` block is **commented out** at `deploy/nginx/mythuso.conf:204`,
  with the reason written above it: *"Commented out until TLS and an SMS provider exist: a one-time-code
  service must not be reachable over plain http."* So its 47 built routes serve nobody outside
  development.
- **The engine runtime is not deployed and cannot be reached from a browser even in development.** Two
  independent facts establish this:
  1. Nothing in `apps/web/src` fetches an `/engines` path. The command
     `git grep -n "fetch(\`*[\"'\`]/engines\|'/engines/" -- apps/web/src apps/ios apps/android apps/assistant-api/src apps/api/src`
     returns **nothing**.
  2. The Vite dev server proxies only two paths — `apps/web/vite.config.ts:132` declares `/api` →
     `127.0.0.1:8787` and `/assistant` → `127.0.0.1:8791`. **There is no `/engines` proxy.** Even with
     `npm run engines` running on the loopback, a page served by `npm run dev` has no route to it.
  3. The deploy never publishes it. `git grep -n "engines" -- deploy/` returns six hits and **every one
     is `package.json`'s `engines.node` field** — the Node version floor — not the engines package. The
     build check at `scripts/check-boundaries.mjs:19066` states the rule outright: the runtime
     *"answers on loopback to a loopback Host only, and nothing in deploy/ names it."*

**So: 171 routes are genuinely implemented and genuinely bind, in a process that no client is wired to
and no deploy publishes.** That is not a defect in the engines. It is a missing join above them, and it
is the single largest unwired seam in this repository. Section 12 ranks it first.

### 3.4 The four locks

All four locks are present and are held by the build:

- `apis.lock` — 379 route lines plus the header.
- `apis.refusals.lock`, `apis.callers.lock`, `apis.shapes.lock` — present beside it.
- `events.lock` — **141 non-comment lines**, matching 141 declared event versions exactly.

Commands: `grep -v '^#' packages/catalog/events.lock | wc -l` → 141; and a `node -e` cross-check that
found **0 live events missing a lock line, 0 withdrawn events missing a lock line, and 0 lock keys not
declared in any source**. The lock is complete and bidirectional.

One caution about the locks, because it is the failure mode the founder's question is really about:
**a lock line proves a contract was frozen, not that anything answers it.** `apis.lock` holds all 379
routes including the 84 that no service serves. Being locked is necessary and not sufficient.

---

## 4. The event bus

### 4.1 What is declared

Events are declared across four sources, listed in `packages/catalog/events.json` under `sources`:
`events.json` itself (120), `assistant.json` (10), `trust.json` (7), `case.json` (4).

| | Count |
|---|---:|
| Declared event versions | 141 |
| Live | 123 |
| Withdrawn | 18 |
| `events.lock` lines | 141 |
| Live versions missing a lock line | 0 |
| Withdrawn versions missing a lock line | 0 |
| Lock lines not declared anywhere | 0 |

Command: a `node -e` walk of the four sources reading each `events[].type + '@' + version` and
`withdrawn` flag, cross-referenced against the parsed lock keys.

*An earlier pass in this audit read only `events.json` and reported 120 events and 21 orphan lock lines.
That was wrong, and the cause is worth recording: `scripts/check-boundaries.mjs:3587` states that events
are read from every file `events.json` lists under `sources`, "because the assistant and trust contracts
declare their own events in the same shape." Counting one file instead of four produces a false alarm
about 21 undeclared events. The correct figure is zero.*

### 4.2 What is actually joined

The runtime registers **52 subscriptions** across eleven engines. The contracts declare **280
subscriber pairs** (an event version × an engine that says it hears it). Comparing the two:

Command: `MYTHUSO_ENGINES=synthetic-data-only node -e …`, taking each engine's
`Object.keys(e.subscriptions)` as the wired set and each contract event's `subscribers` as the declared
set.

| | Count |
|---|---:|
| Declared subscriber pairs | 280 |
| **Wired at runtime** | **52** |
| Declared but not wired | 228 |
| Runtime subscriptions not declared in any contract | **0** |
| Live event versions with at least one runtime subscriber | 37 |
| Live event versions with no runtime subscriber | 86 |

**Zero undeclared subscriptions is a strong result.** Every wire that exists is a wire the contract
asked for; nothing is joined secretly. The asymmetry runs the other way: 228 declared relationships have
no code behind them.

Adding the emitter side — which event versions a `built` route declares in its `emits` array — gives the
joined core:

Command: a `node -e` walk collecting every `route.emits` across the thirteen contracts, filtered to
live versions and to `built` routes, intersected with the runtime's subscribed keys.

- Live event versions declared as emitted by some route: 78
- Live event versions declared as emitted by a **built** route: 68
- **Emitted by a built route AND subscribed at runtime: 28**
- Emitted by a built route but with no runtime subscriber: 40
- With neither a built emitting route nor a runtime subscriber: 46

**The 28 that are joined end to end** — these are the real nervous system of the product:

```
appointment.booked@2      appointment.completed@2   appointment.in_progress@2
booking.cancelled@1       booking.requested@2       delivery.handed_over@1
device.recalled@1         lab.order.placed@1        lab.result.received@1
panic.raised@1            panic.resolved@1          passport.admission.detected@1
passport.discharge.received@1  passport.entry.written@1
passport.share.link_created@1  passport.share.link_used@1
payment.succeeded@1       person.reinstated@1       person.suspended@1
person.verified@1         reading.ingested@1        result.acknowledged@1
safeguarding.reported@2   sentinel.rung_raised@1    sos.raised@2
sos.stood_down@1          visit.billable@1          visit.handover.submitted@1
```

That is a genuine, working spine: a booking moves through Care, triggers Money's `visit.billable@1`,
starts Safety's visit timer via `appointment.in_progress@2`, closes it via `appointment.completed@2`,
and a panic or an SOS reaches Core, Care and Safety. **The visit lifecycle is wired.** What is not wired
is everything around it — admissions, alerts, claims, cases, loops, transport, triage — 46 live versions
with neither an emitter nor a subscriber, and 40 more with an emitter and nobody listening.

### 4.3 Withdrawn versions

All 18 withdrawn versions keep their lock line and are superseded correctly. Spot-checked by grep:
`appointment.booked@1` is withdrawn, and every source that names the type pins **version 2** —
`apps/web/src/lib/claims.ts:41`, `apps/web/src/lib/mom-essential.ts:128`,
`apps/ios/MyThuso/Models/EventsData.swift:48` (`appointmentBookedV2`),
`apps/android/.../model/EventsData.kt:24` (`APPOINTMENT_BOOKED_V2`).

The full withdrawn list: `appointment.booked@1`, `appointment.in_progress@1`, `appointment.completed@1`,
`person.trust_updated@1`, `passport.consent.granted@1`, `passport.consent.granted@2`,
`passport.consent.revoked@1`, `passport.consent.revoked@2`, `booking.requested@1`, `booking.confirmed@1`,
`triage.completed@1`, `sos.raised@1`, `sentinel.tier_raised@1`, `safeguarding.reported@1`,
`claim.submitted@1`, `pulse.utterance.finalised@1`, `pulse.escalation.started@1`, `trust.weight.decided@1`.

A naive `git grep` for the withdrawn *type names* finds hits in source — `sos.raised` appears in three
files, `booking.confirmed` in five — because the type is shared with its live successor. That is not a
leak. What matters is the version, and the versions are clean. **Withdrawal is being done properly.**

---

## 5. The Control Tower: what it controls today, and what it merely displays

`packages/catalog/control-tower-portal.json` declares **14 categories and 28 tabs** (command: a `node -e`
tally of `categories[].tabs.length`): Overview 3, Dispatch & Incidents 2, Vetting 1, Quality 1, Audit 1,
Devices & Fleet 3, GilbertOne API Administration 7, Configuration 1, Finance 2, Compliance 2,
Governance 2, Clinical oversight 1, Catalogue 1, Growth 1.

The portal's own contract is candid about its standing:

```
status: built
_statusWhy: "The portal is in the tree and held by tests/control-tower-portal.spec.ts on both viewports.
             Built is not accepted: gate G15 stays open until whoever runs the cutover signs
             docs/control-tower-cutover.md, and nothing here is a real service."
gate: G15
```

### 5.1 What it reads from a running service

**One thing.** `apps/web/src/lib/portal.ts:194` fetches `${base}/assistant/health`, and lines 197–199
reduce the answer to booleans only:

```ts
/* Only the fields the contract names, and only as booleans. Anything else the route might grow is
   not drawn, so a field added to the health answer cannot reach this screen by accident. */
const fields = Object.fromEntries(wanted.map(f => [f, body[f] === true]));
```

That narrowing is deliberate and correct — it stops a new health field from reaching an operator's
screen unaudited. But it also means the Control Tower's only live contact with any service yields a
handful of true/false values about whether GilbertOne is up and activated.

### 5.2 What it displays instead

Every other board renders in-memory preview state computed by importing engine domain modules directly
into the browser bundle. `apps/web/src/lib/settings.ts` imports from **eleven** engine directories at
once — `safety`, `care`, `money`, `core`, `access`, `medicines`, `trust`, `record`, `devices`,
`clinical`, `movement`, `assistant` — and holds its own history:

```
apps/web/src/lib/settings.ts:102:export const historyOf = (engine: string): readonly Change[] => histories[engine] ?? [];
```

`apps/web/src/features/Configuration.tsx` states the consequence in its own header comment: *"Held in
memory by lib/settings.ts and nowhere else. The preview sentence at the top says what that means: no
phone, desk or patient is told, and a reload puts the defaults back."*

### 5.3 The specific missing join, file by file

This is the clearest single seam in the repository, and it is worth stating precisely because it is
*almost* joined:

| Side | File | What it does |
|---|---|---|
| **Write path exists, served, tested** | `packages/engines/src/settings/routes.ts:3` | *"Every engine with settings answers `GET /v1/<engine>/settings` and `POST /v1/<engine>/setting-changes`"* — bound on the runtime, SQLite-backed `settings_history`. |
| **Write path exists, client-side** | `apps/web/src/lib/settings.ts:211` | Calls `proposeChange(engineOf(engine), historyOf(engine), …)` — the *domain function*, in-process, against a local `histories` object. |
| **Screen** | `apps/web/src/features/Configuration.tsx` | Draws all eleven engines' settings, proposes a change, previews it, routes a clinical review. |
| **The join that does not exist** | — | Nothing converts that in-process `proposeChange` result into `POST /v1/<engine>/setting-changes`. No client anywhere fetches an `/engines` path (verified in §3.3). |

**The two settings histories do not synchronise, and cannot.** An operator who changes the panic window
on the Configuration screen changes it in the browser tab. The engine runtime's SQLite
`settings_history` table never hears about it. On reload, the defaults come back.

This is not a bug in either side. Both sides are built and tested. It is a missing join — and it is the
join that would make the founder's statement true. Today:

**The Control Tower controls exactly one thing: nothing.** It displays the state of twelve engines,
computed correctly by real domain code, from a preview store that evaporates on reload. Its single live
read is a health check. The word "controls" is not yet accurate for any of its 28 tabs.

To be fair to the portal, it does not claim otherwise. `docs/FEATURE-MAP.md:1277` records that the
protocol-registry lookup and the audit-export desk *"neither calls a server, both are dynamic imports"*.
The honesty is in the documents; it is the founder's expectation of the word "control" that has run
ahead of the build.

---

## 6. GilbertOne's reach, and what it is gated from

### 6.1 What it can reach

`apps/assistant-api` imports from exactly **two** engine directories:

Command: `git grep -oh "packages/engines/src/[a-z]*" -- apps/assistant-api/src | sort -u`
→ `assistant`, `settings`.

It serves **18 URL paths** (command: `git grep -oh 'req.url === "[^"]*"' -- apps/assistant-api/src/server.ts | sort -u`):
`/assistant/health`, `/assistant/turn`, `/assistant/v1/turn`, `/assistant/v1/listen`, `/assistant/v1/speak`,
`/assistant/v1/status`, `/assistant/v1/triage/start`, `/assistant/v1/triage/answer`, `/assistant/v1/vitals`,
`/assistant/v1/handover/prepare`, `/assistant/v1/handover/submit`, `/assistant/v1/knowledge/search`, and
the six founder-control paths.

So GilbertOne is **live in production and reaches 2 of 12 engines**. It cannot read a booking, a
payment, a nurse's credential, a device, a medicine, a record or a movement. It answers from the
message, its own assistant-domain settings, and the deterministic half compiled into every device.

### 6.2 What it is gated from, and why the gate is shut

`apps/assistant-api/src/lib/triage-gate.ts:26`: *"The gate is open only when all three hold. Because it
reads the register rather than a flag in this service… then every triage call is answered with the
contract's own refusal, not a 501 and not a guess."*

Current register state (command: `node -e` against `packages/catalog/protocols.json` and
`packages/catalog/clinical.json`):

| Condition | Value |
|---|---|
| `protocols.governance.board.status` | **`not-formed`** |
| `protocols.governance.medicalDirector.status` | **`not-appointed`** |
| `clinical.triage.triageProtocols.ids` | **`[]`** |

All three are shut, so `/assistant/v1/triage/start` and `/assistant/v1/triage/answer` refuse. The build
proves the refusal rather than trusting the flag — `npm run check` prints: *"15 triage requests refused
without a ratified triage protocol and 30 orders of rule, red flag and model answered without lowering
a priority"*.

The three allowlisted external knowledge sources are all dark:

> **Annotation, 6 October 2026 — this audit is pinned to `ba37ee5b` and its count was right there.**
> `federation.json` at that commit held three sources, and the command below reproduces what the
> auditor read. On 2 October 2026 (`7cec153d`) eleven more were recorded dark, so the allowlist now
> holds **14**, every one still `"active": false`, with a further 12 entries under
> `assessedNotAdmitted` that are not allowlisted at all and a build check holding the floor at
> fourteen. Row 4 of the table in Section 12 carries the same stale three. Neither is corrected in
> place, because this is a dated record of what an auditor found on a named tree.
> **The darkness itself was not re-tested in this pass.** The count was re-derived and that is all:
> the claim that these sources are unreachable from a request is under review in a separate change
> and must not be read as re-verified here.

Command: `node -e` against `packages/catalog/knowledge/federation.json`
→ `icd11-who active=false`, `openfda active=false`, `pubmed-europepmc active=false`.

So `/assistant/v1/knowledge/search` has nothing to search.

### 6.3 The deterministic half — correct, not a gap

`packages/gilbertone` has no dependencies, no network and no environment variable, and its build fails
if anything under `src/` calls `fetch()` or imports a network or model module. **This is the design,
and it is what answers while the engine above is dark.** It is not an unwired seam and must not be
reported as one.

### 6.4 The generated clients the phones do not call

`unifiedApi` is `enabled: false` in `packages/catalog/capabilities.json`, and its own `why` explains the
reasoning: *"The service is real and is not deployed: it answers on loopback, and a phone in somebody's
hand cannot reach that… the flag is for the natives, whose releases outlive a deploy."*

Both phones generate a full typed route table and then guard every use of it behind that false constant:

- `apps/ios/MyThuso/Features/AssistantView.swift:204` — `guard Capabilities.unifiedApi else { return }`
  against `CapabilitiesData.swift:426` — `static let unifiedApi = false`.
- `apps/android/.../ui/GilbertScreens.kt:221` — `if (unifiedApi && asked != null && …)` against
  `CapabilitiesData.kt:428` — `const val unifiedApi = false`.

`git grep -ln "ApisData" -- apps/ios/MyThuso` returns **only `Models/ApisData.swift` itself** — no other
Swift file references it. On Android it is referenced by one file, `model/Teleconsult.kt`.

The generated clients are, on both phones, effectively dead code by design. **Switching `unifiedApi` on
is a founder decision, not a tidy-up**, and it is recorded here as such rather than as a gap.

### 6.5 Capability status

Command: `node -e` against `packages/catalog/capabilities.json`.

**23 capabilities declared. 0 with `connected: true`. 0 with `simulation.reachableFromTheNetwork: true`.**

The `/status` page renders these, so the public-facing honesty is intact. But it also means that by the
catalogue's own accounting, **no capability in the product is connected to anything**.

---

## 7. Cross-platform drift

| | Web | iOS | Android |
|---|---:|---:|---:|
| Screen files | 110 features + 15 portal | 52 `Features/*.swift` | 43 `ui/*Screens.kt` |
| Live HTTP targets reached | `/api/*`, `/assistant/*` | none (`unifiedApi` false) | none (`unifiedApi` false) |
| Generated typed route client | `lib/apis.generated.ts` (used for wording) | `Models/ApisData.swift` (unreferenced) | `model/ApisData.kt` (1 reference) |

Command: `ls apps/web/src/features/*.tsx | wc -l` → 110; `ls apps/ios/MyThuso/Features/*.swift | wc -l`
→ 52; `ls apps/android/app/src/main/java/za/co/mythuso/ui/*Screens.kt | wc -l` → 43.

`docs/FEATURE-MAP.md` records **54 rows** saying "all three" and **10** rows indicating web-only. The
web-only set includes the Admin console / Control Tower itself and, per line 1137, the Sentinel
tier-three concern board: *"On a phone a tier three is recorded and says who would be told; no phone has
the Control Tower's board."*

The drift is **structural, not accidental**: the Control Tower's 28 tabs exist only on the web, and the
phones carry no network path to any engine at all. That is consistent with `unifiedApi: false` and with
the identity service being off — there is nothing for a phone to call. It also means the three platforms
are not three clients of one system today. They are one connected client (web, to two services) and two
self-contained offline renderers of generated contract wording.

---

## 8. UI/UX review

### 8.1 The design-system story — this part is proper

The design system is genuinely single-sourced, and it is enforced rather than aspirational.

- `apps/web/src/surface/` holds **19 stylesheets totalling 619.0 kB of source bytes** (command:
  `node -e` summing `statSync().size` over the `.css` files), plus two `.tsx` files (`Office.tsx`,
  `Surface.tsx`). The largest are `clinical.css` (105 kB), `app.css` (89 kB), `clinical-screens.css`
  (82 kB) and `nurse-identity.css` (70 kB).
- `apps/web/src/tokens.generated.css` is **132 lines, generated** from
  `packages/design-tokens/tokens.json` by `npm run typography`.
- `docs/brand/CI.md` is a **generated brand book**, produced by `scripts/emit-ci.mjs` from 24 sources
  listed in `CI_SOURCES` — the tokens, the contracts, the brand masters and the component CSS.
- `scripts/check-boundaries.mjs:38351` reads it back and compares byte for byte, and separately refuses
  a brand book that prints a colour the tokens do not hold: *"Every six-digit hex in CI.md must be a
  value in tokens.json — a flat colour nobody can trace to a token."*

**Verified this session:** `node -e` importing `emit-ci.mjs` and calling `emitCi()` produced
**93,061 bytes, identical to the 93,061 bytes on disk**. The brand book has not drifted.

That is a design system with a number living in one place and a build that fails when a copy disagrees
— exactly what `CLAUDE.md` demands, applied to colour and type rather than to prices.

### 8.2 Accessibility: what the spec asserts

`tests/accessibility.spec.ts` contains **14 tests** (command: `git grep -c "^\s*test(" -- tests/accessibility.spec.ts`).
Its own header explains the reasoning for the viewport choices: a **320px viewport**, *"which is
narrower than any phone still sold and is also what a 390px phone does at 125% text"*, and **the layout
viewport halved, "which is what 200% browser zoom does to a page"**. Both run on both project viewports
(1440×1100 desktop, 390×844 mobile), *"so a desktop regression and a phone regression are two
different failures"*.

The assertions live in `tests/audit.ts`, and they are substantive rather than decorative:

| Check | Where | What it holds |
|---|---|---|
| Horizontal overflow | `audit.ts:86` | `pixels ≤ 1`, with the offending widest children named in the failure message |
| Touch targets | `audit.ts:90` | Controls under 44×44 must be listed in `tokens.json`'s `targets.knownUndersized`, with a reason |
| Absolute floor | `audit.ts:93` | *"An exemption is permission to be under 44, never permission to be under the AA floor"* — a listed exemption under 24×24 fails as *"a defect with paperwork"* |
| Minimum text | `audit.ts:95` | No rendered text under `tokens.typography.minimumRendered` |
| Control sweep | `audit.ts:105` | Every button, link, input, select, textarea, summary, tab and treeitem has an accessible name; nothing has a positive `tabindex`; `document.getAnimations()` reports nothing `running` when reduced motion is asked for |
| Contrast | `audit.ts:127` | Every visible text node against its **composited** background — each ancestor's background laid over the one beneath, translucent washes measured over what they wash, any colour read back as sRGB through a canvas so `color-mix()` and other colour spaces are handled. Floor is WCAG 2.2 AA: 4.5, or 3 for text ≥24px or bold ≥18.66px. Hidden, `aria-hidden`, zero-sized and disabled nodes are skipped |

**This is a real accessibility journey, not a checkbox.** Compositing ancestor backgrounds through a
canvas to measure contrast is considerably more rigorous than comparing two declared colours, and the
24px absolute floor behind a documented exemption is the right shape.

**What it does not cover** — reported honestly, since the founder asked what is proper and what is not:

1. **No screen-reader testing.** Nothing exercises VoiceOver or TalkBack. The sweep checks that an
   accessible *name* exists; it cannot tell you whether an announcement is intelligible, whether focus
   lands where a blind user expects, or whether a live region fires at the right moment. This is
   recorded as open gate **G35** in `docs/control-tower-accessibility.md:211`.
2. **No focus-order or keyboard-traversal journey.** The sweep asserts no positive `tabindex`, which
   prevents the worst abuse, but nothing walks a Tab sequence end to end or asserts a visible focus ring.
3. **No native accessibility testing at all.** The iOS and Android apps are unmeasured.
4. **Background images are not composited.** `audit.ts` says so itself: *"a word on a photograph is
   measured on the colour under it."* Text over photography is therefore unverified.
5. **None of it was run in this audit.** With no browser available, this section reports what the code
   asserts. **No pass/fail result is claimed.**

### 8.3 The patient's first-load budget

`scripts/check-bundle-budget.mjs:38` sets `CEILING_KB = 282.16`, with the derivation recorded at lines
19–27: *"It is the figure in CLAUDE.md and AGENTS.md, measured on 16 September… against this ceiling.
If the definition below changes, the ceiling has to be re-derived, not carried over."* Line 39 converts
with `282.16 * 1024`, explicitly *"Not kB-times-1000 and not kB-times-1024 by guesswork."*

Running it against the `dist` already on disk:

```
$ node scripts/check-bundle-budget.mjs
    251.24 kB  total
    282.16 kB  ceiling (CLAUDE.md)
     30.92 kB  headroom

Within budget.
```

**This figure is not a current measurement.** `apps/web/dist/index.html` has mtime
`2026-10-01T05:57:36Z`; `HEAD` (`ba37ee5b`) was committed at `2026-10-01T15:21:55+0200`. The build on
disk predates the checked-out source by roughly nine and a half hours. **`npm run build -w @mythuso/web`
was not run in this audit**, so no claim is made about what the current tree would measure. The most
recent figure recorded in `docs/FEATURE-MAP.md` is **257.27 kB (30 September)**, which is 24.89 kB under
the ceiling.

What can be said with confidence: the architectural discipline that keeps this number down is intact.
Every workspace and every engine's screens sit behind dynamic imports — `Configuration.tsx` lazily
loads its founder gate, `AssistantLauncher.tsx:43` builds its panel through `lazy()` with a `prefetch()`
on pointer-enter, and `docs/FEATURE-MAP.md:1277` records the Control Tower's desks as *"both are dynamic
imports and neither is on the patient's first load."* The 30 kB of headroom exists because the product
grew eleven engines without growing the patient's first view.

### 8.4 UI/UX gaps, reported honestly

- **The Configuration screen is the clearest half-migrated surface in the product.** It is a complete,
  careful, contract-driven settings editor with proposal, preview, clinical review and provenance — and
  its writes go to a browser-local object. The screen's own header says so, which is honest, but an
  operator using it will experience it as working. `AGENTS.md`'s rule about not half-migrating a
  patient-facing surface exists for exactly this shape of problem; here it is an *operator*-facing
  surface, and the mitigation is a preview sentence rather than a refusal.
- **`pulse` is a contract with no engine and no screen.** Ten locked events, an empty route array, and
  nothing implementing it. The 45-second utterance cap and the on-device audio pipeline from the
  21 September founder amendment have no engine home yet.
- **The Control Tower's status vocabulary is real but its data is not.** Fourteen categories, one
  shared status vocabulary from `control-tower-overview.json#statusVocabulary`, and one live boolean
  read. The visual language of an operational system is in place ahead of the operations.

---

## 9. Deliberately unwired: decisions, with dates and sources

**These are not defects.** Each one is a decision somebody took and wrote down, and conflating them with
the gaps in Sections 5 and 12 is the failure mode this audit exists to avoid.

| # | What is unwired | The decision | Date | Source |
|---|---|---|---|---|
| 1 | **`apps/api` identity service** — 47 built routes, switched off; `location /api/` commented out in nginx | No SMS provider, no DNS/TLS decision. *"a one-time-code endpoint over plain http hands out accounts"* | Standing, restated | `deploy/nginx/mythuso.conf:204`; `deploy/RUNBOOK.md:686`; `CLAUDE.md` *Deployment*; `docs/PRIVACY-AND-SECURITY.md:19` |
| 2 | **`apps/passport`** — 19 built routes, development only | Refuses to start without `MYTHUSO_PASSPORT_DEVELOPMENT=synthetic-data-only`; binds loopback; nothing in `deploy/` may name it. The controls it needs — a signed DPIA, a registered Information Officer, a data-residency decision, KMS/HSM custody — do not exist | Standing | `apps/passport/src/config.ts:7–12`; `apps/passport/src/server.ts:7–24`; `CLAUDE.md`; `docs/governance/DPIA-DRAFT.md`, `INFORMATION-OFFICER.md`, `DATA-RESIDENCY-OPTIONS.md`, `KEY-CUSTODY-OPTIONS.md` all present as drafts |
| 3 | **Clinical intelligence** — triage routes refuse | No formed Clinical Governance Board, no appointed Medical Director, no ratified triage protocol. The gate reads the register, not a flag, so it cannot be switched on by an edit here | Gate added 22 September 2026 | `apps/assistant-api/src/lib/triage-gate.ts:4,26`; `packages/catalog/protocols.json`; `packages/catalog/clinical.json` |
| 4 | **External knowledge federation** — three sources allowlisted, all `active: false` *(annotation, 6 October 2026: the allowlist held **14** as of 2 October, every one still `"active": false` — see the annotation in Section 6.2; this row is a dated record of the tree at `ba37ee5b` and the darkness claim is under review, not re-verified)* | icd11-who, openfda, pubmed-europepmc are dark | Standing | `packages/catalog/knowledge/federation.json` |
| 5 | **`unifiedApi`** — the phones' generated clients are not called | *"a phone in somebody's hand cannot reach that"* — the service answers on loopback only. Switching it on is a **founder decision, not a tidy-up** | Flag authored with the 20 September two-tier upgrade | `packages/catalog/capabilities.json` `flags[].unifiedApi`; `AGENTS.md` |
| 6 | **The engine runtime and the mock** — not deployed | Both refuse to start without their synthetic-data flags, bind loopback, check the `Host` header as well as the address, and **nothing in `deploy/` may name them**. Verified: the only `engines` hits in `deploy/` are `package.json`'s Node version floor | Standing | `packages/engines/src/server.ts:1–11`; `packages/mock-api/src/server.ts:1–12`; `scripts/check-boundaries.mjs:19066` |
| 7 | **`packages/gilbertone`** — no network, no dependency, no env var | By design. It is what answers when the engine is dark, and it answers first on every message either way. The build fails if `src/` calls `fetch()` | Standing | `CLAUDE.md`; `AGENTS.md` |
| 8 | **GilbertOne's speech conversation mode** — on-device only, cloud voice APIs prohibited | Founder amendment: all audio on-device (Porcupine, Silero, faster-whisper, Piper), ring buffer, no retention, visible mic indicator, hardware kill switch, 30s cap raised to 45s per utterance | **21 September 2026** | `CLAUDE.md`, *Founder Decision Amendment* |
| 9 | **All 23 capabilities** — `connected: false` | The `/status` page renders these so the public sees capability by capability what is connected. Nothing here is a real service | Standing | `packages/catalog/capabilities.json`; `CLAUDE.md` *rules that are not negotiable* |
| 10 | **Control Tower cutover** — gate **G15** open | *"Built is not accepted: gate G15 stays open until whoever runs the cutover signs `docs/control-tower-cutover.md`"* | Phase 3 merged 24 September 2026 | `packages/catalog/control-tower-portal.json`; `docs/control-tower-cutover.md` |

`docs/FEATURE-MAP.md:1587` summarises the gate position as of the last phase: *"Every gate the phase
names — G29 to G35, G15, G16 — is still open."* Nine gates are named in the catalogue
(command: a `node -e` scan for `"gate": "G\d+"` across `packages/catalog/*.json`): G10, G14, G15, G29,
G30, G31, G32, G33, G35.

---

## 10. Build and test status, as actually observed

### 10.1 `npm run check` — **fails**, on a clean tree

```
$ npm run check
…
> @mythuso/assistant-api@0.1.0 check
> tsc

Clinical Intelligence: 15 triage requests refused without a ratified triage protocol and 30 orders of
rule, red flag and model answered without lowering a priority; …
file:///…/scripts/check-boundaries.mjs:3149
      throw new Error(`${file.path} is older than ${source}. Run: ${command}`);
Error: docs/brand/CI.md is older than docs/FEATURE-MAP.md. Run: npm run ci
```

**Every TypeScript workspace passes** — `gilbertone`, `thusoiq`, `commerce`, `geo`, `web`, `api`,
`mock-api`, `passport`, `engines`, `assistant-api`. The failure is a **generator freshness check**, not
a content mismatch, and this was verified three ways:

1. `git status --porcelain` returns clean for both files (and for the whole tree, apart from one
   untracked survey document from another session).
2. `emitCi()` produces **93,061 bytes, byte-identical** to `docs/brand/CI.md` on disk.
3. Of the 24 `CI_SOURCES`, exactly **one** has an mtime newer than `CI.md`:

```
docs/brand/CI.md            2026-10-01T10:20:54.345Z
sources NEWER than CI.md:   1
   docs/FEATURE-MAP.md      2026-10-01T15:20:52.208Z
```

`docs/FEATURE-MAP.md` is listed in `CI_SOURCES` (`scripts/emit-ci.mjs:36` onward) and the checker at
`scripts/check-boundaries.mjs:3149` refuses a generated file older than any of its sources. FEATURE-MAP
was edited by the commit `ba37ee5b` at 17:21 +0200; `CI.md` was generated earlier the same day.

**The fix is `npm run ci`, which is a one-command regeneration.** This audit did not run it, because the
only permitted write is this file. It is reported as a **live build breakage on the default branch**,
and it is a *defect of process*, not of architecture: a generated document whose source list includes a
frequently-edited Markdown file will go stale on every edit to that file. That is worth a look — either
`docs/FEATURE-MAP.md` should not be a CI source, or `npm run ci` belongs in the same commit as any
FEATURE-MAP edit. **Whoever reads this next: `npm run check` will fail until somebody regenerates.**

### 10.2 node:test suites — **all pass**

| Workspace | tests | pass | fail |
|---|---:|---:|---:|
| `@mythuso/engines` | 513 | 513 | 0 |
| `@mythuso/api` | 757 | 757 | 0 |
| `@mythuso/mock-api` | 833 | 833 | 0 |
| `@mythuso/assistant-api` | 390 | 390 | 0 |
| `@mythuso/gilbertone` | 130 | 130 | 0 |
| `@mythuso/passport` | 100 | 100 | 0 |
| **Total** | **2,723** | **2,723** | **0** |

Command: `npm run test -w @mythuso/<name>` for each, reading the `# tests / # pass / # fail` trailer.

**2,723 tests pass and zero fail.** The domain logic is real and is held. Whatever else is true of this
repository, its engines are not stubs.

### 10.3 Not run

`playwright test` (the final step of `npm test`) — no browser available. `xcodebuild` and `gradlew` — not
attempted. `npm run build -w @mythuso/web` — not run, so no fresh bundle figure.

---

## 11. The answer to the founder's question

**No. The ecosystem is not wired end to end. It is wired in one place and unwired in a way that is
consistent, documented and mostly deliberate everywhere else.**

Stated as precisely as the evidence allows:

**What is genuinely wired, end to end.** A visit lifecycle, inside one process. Twenty-eight event
versions are emitted by a built route and heard by an engine subscription in the same runtime: a
booking is requested, offered, booked, paid, started, completed, handed over and billed; a panic or an
SOS is raised, seen by Core, Care and Safety, and resolved; a lab is ordered, received and
acknowledged; a device reading is ingested, goes stale and is recalled; a person is verified, suspended
and reinstated and eleven engines hear it. That is a real integrated spine, held by 513 engine tests,
and it is the most important thing in the product.

**Where it stops — the specific missing joins, file by file.**

1. **No client can reach the runtime.** The 171 bound routes live in a process that nothing calls.
   `apps/web/vite.config.ts:132` proxies only `/api` and `/assistant`; there is no `/engines` proxy. No
   file in `apps/web/src`, `apps/ios`, `apps/android`, `apps/assistant-api/src` or `apps/api/src`
   fetches an `/engines` path. `deploy/` never publishes it. **The engines are wired to each other and
   to nothing else.**
2. **The web app computes instead of calling.** `apps/web/src/lib/settings.ts` imports eleven engines'
   domain modules directly into the browser bundle and calls `proposeChange()` in-process at line 211,
   against a `histories` object at line 102. The served write route
   `POST /v1/<engine>/setting-changes` (`packages/engines/src/settings/routes.ts:3`) exists, is bound
   and is tested, and **has no client**. Two settings histories, one in the browser and one in SQLite,
   that never meet.
3. **The Control Tower controls nothing.** Fourteen categories, 28 tabs, one live read —
   `GET /assistant/health` at `apps/web/src/lib/portal.ts:194`, narrowed to booleans at line 199.
   Everything else is preview state that a reload discards.
4. **The event bus is 52 wires against 280 declared relationships.** 86 of 123 live event versions have
   no subscriber in any engine. 46 have neither an emitter nor a subscriber. The declared
   nervous system is roughly five times larger than the one that exists.
5. **The phones call nothing.** `unifiedApi = false` on both; the generated `ApisData.swift` is
   referenced by no other Swift file. They are offline renderers of generated contract wording.
6. **84 routes are served by no process at all**, and `pulse` is a contract with ten locked events,
   zero routes and no engine.

**And the honest framing.** In production today, of 372 live declared routes, **25 are reachable** —
GilbertOne's, through `location /assistant/`. Of 23 capabilities, **0 are `connected`**. That is not a
repository pretending otherwise: `capabilities.json` says so, `/status` renders it, the portal's own
contract names its open gate, and the Configuration screen prints a preview sentence. **The gap is
between the founder's mental model — "everything controlled by the control tower" — and a build that is
honest about controlling nothing yet.** The documentation is not lying. The expectation is ahead of the
join.

---

## 12. The smallest safe next joins, ranked

Ordered by how little each costs and how much each would refuse. Each is a join, not a feature: none of
them requires a supplier, a person, a credit or a governance decision, and every one of them can be
proved by a boundary check that fires when broken.

| # | The join | What it costs | What it would refuse | Why it is safe |
|---|---|---|---|---|
| **1** | **Regenerate the brand book and keep it regenerated.** Run `npm run ci` so `docs/brand/CI.md` is newer than `docs/FEATURE-MAP.md`. Then either drop `docs/FEATURE-MAP.md` from `CI_SOURCES` or add `npm run ci` to the routine that edits it. | Minutes. No architecture touched. | Nothing new — it restores a build that already refuses a drifted brand book. | The content is already byte-identical (§10.1). This is the only item here that fixes a **currently failing** `npm run check` on the default branch. |
| **2** | **Add an `/engines` proxy to `apps/web/vite.config.ts`, development only.** One entry beside the two that exist, pointing at the runtime's loopback port, with the same `changeOrigin`. | A handful of lines in a dev-server config. | The runtime itself refuses without `MYTHUSO_ENGINES=synthetic-data-only`, refuses any request that did not arrive on the loopback address **and** name a loopback host, and answers nothing in production because `deploy/` may not name the package. The proxy would add no reachable surface. | It converts "no client can reach the runtime" into "one dev client can", without touching a deploy, a contract or a lock. It makes every later join testable. |
| **3** | **Point `apps/web/src/lib/settings.ts:211` at `POST /v1/<engine>/setting-changes` instead of the in-process `proposeChange`, behind the existing preview sentence.** One engine first — `safety` — with the in-memory path kept as the fallback when the runtime is not running. | One call site, one engine. The route is built, bound and tested; the screen already renders proposals, previews, provenance and clinical review. | The route's own refusals, which the screen already draws: a value outside its limits, a missing reason, a stale version — and a clinical review that an admin may **not** confirm, because the back office opens as an admin. | It is the narrowest possible version of the Control Tower's first real control, and it fails closed: no runtime, no change, defaults on reload, exactly as today. |
| **4** | **Join one declared-but-unwired subscriber pair.** 228 exist; pick one whose emitter is already built and whose handler is already written as a domain function — `care <- booking.cancelled@1` or `safety <- device.stale@1` are the shape to look for. | One key in one engine's `subscriptions` object, plus a test. | The bus re-validates every publish against the contract: the type must be declared and live, the publisher must be its owner, every key must be a declared field of the frozen shape. A mis-joined subscription cannot receive an event its contract does not allow. | 52 wires become 53, and the mechanism is already proven by the 28 joined versions. |
| **5** | **Give `pulse` either an engine or a withdrawal.** Ten locked events, zero routes, no directory. Either implement `packages/engines/src/pulse/` behind the runtime, or mark the contract's emptiness explicitly the way the withdrawn events are marked. | A decision and, if built, one engine directory. | Everything: an engine that does not exist answers nothing, and the build already refuses a route marked `built` without a handler file. | It removes the one place where a lock line exists for something with no contract behind it at all. |
| **6** | **Publish the wiring state itself.** A generated `docs/governance/WIRING-STATE.md` holding the four numbers from this audit — bound routes, wired subscriber pairs, joined event versions, reachable capabilities — emitted by a script and checked by `check-boundaries.mjs` the way `CI.md` is. | One generator, registered in `package.json` and in the `generated` list. | Nothing. It is a report. | It makes drift visible without a human re-running this audit, and it follows a pattern the repository already uses successfully for tokens, the brand book and the API contracts. |

**What is explicitly not on this list**, because each needs a decision rather than a join: switching
`unifiedApi` on (founder decision); enabling the identity service (needs an SMS provider and TLS);
activating the Passport (needs a signed DPIA, an Information Officer, a residency decision and
KMS/HSM custody); opening the triage gate (needs a formed board, an appointed Medical Director and a
ratified protocol); accepting the Control Tower cutover (needs somebody to sign
`docs/control-tower-cutover.md` and close G15); and raising HSTS above `max-age=300` (deliberately
deferred and irreversible).

---

## Appendix: the commands run, and what they returned

| Command | Returned |
|---|---|
| `ls -d packages/engines/src/*/` | 15 directories: 12 engines + `runtime`, `scenarios`, `settings` |
| `node -e` walk of `packages/catalog/apis/*.json` tallying `routes[].status` | 379 declared; 288 built, 84 proposed, 7 withdrawn; 372 live |
| `node -e` grouping live routes by `evidence.file` prefix | 197 engines, 47 `apps/api`, 25 `apps/assistant-api`, 19 `apps/passport`, 84 with no evidence file (= the 84 proposed) |
| `MYTHUSO_ENGINES=synthetic-data-only node -e "import('./packages/engines/src/server.ts')"` → `discoverEngines()` | 12 engines; 171 bound route keys; 52 subscriptions |
| Same, classifying the 26 unbound built engine routes | 26 have a bound successor version; **0** have no bound version of their path |
| `git grep -n "fetch(\`*[\"'\`]/engines\|'/engines/"` across all clients | **no matches** |
| `git grep -oh "fetch(\`*[\"'\`][^\"'\`]*" -- apps/web/src \| sort \| uniq -c` | 16 call sites, 12 distinct targets, all `/api/*` or `/assistant/*` |
| `node -e` across the four event sources | 141 declared, 123 live, 18 withdrawn; `events.lock` 141 lines; 0 missing either way; 0 undeclared lock keys |
| `node -e` comparing contract `subscribers` with runtime `Object.keys(e.subscriptions)` | 280 declared pairs, 52 wired, 228 unwired, 0 undeclared wires; 37 live versions subscribed, 86 not |
| `node -e` collecting `routes[].emits` from the contracts | 108 routes declare emits; 78 live versions emitted by some route, 68 by a built route; **28** emitted-by-built **and** subscribed |
| `node -e` against `packages/catalog/capabilities.json` | 23 capabilities, 0 `connected`, 0 `reachableFromTheNetwork`; `unifiedApi` `enabled: false` |
| `node -e` against `protocols.json` and `clinical.json` | board `not-formed`, medicalDirector `not-appointed`, `triageProtocols.ids` `[]` |
| `node -e` against `knowledge/federation.json` | `icd11-who`, `openfda`, `pubmed-europepmc` all `active: false` |
| `git grep -oh "packages/engines/src/[a-z]*" -- apps/assistant-api/src \| sort -u` | `assistant`, `settings` — 2 of 12 engines |
| `git grep -oh 'req.url === "[^"]*"' -- apps/assistant-api/src/server.ts \| sort -u` | 18 URL paths |
| `node -e` against `control-tower-portal.json` | 14 categories, 28 tabs; `status: built`; `gate: G15` |
| `git grep -n "engines" -- deploy/` | 6 hits, all `package.json`'s `engines.node` version floor — the runtime is never deployed |
| `sed -n '200,215p' deploy/nginx/mythuso.conf` | `location /api/` commented out; `location /assistant/` → `127.0.0.1:8791` live at line 155 |
| `npm run check` | **fails** at `scripts/check-boundaries.mjs:3149`: `docs/brand/CI.md is older than docs/FEATURE-MAP.md`. All ten `tsc` workspaces pass |
| `node -e` importing `emit-ci.mjs` and calling `emitCi()` | 93,061 bytes generated, **identical** to the 93,061 bytes on disk |
| `node -e` comparing `CI_SOURCES` mtimes with `CI.md` | exactly 1 source newer: `docs/FEATURE-MAP.md` |
| `npm run test -w @mythuso/{engines,api,mock-api,assistant-api,gilbertone,passport}` | 513 + 757 + 833 + 390 + 130 + 100 = **2,723 pass, 0 fail** |
| `node scripts/check-bundle-budget.mjs` | 251.24 kB total against a 282.16 kB ceiling, 30.92 kB headroom — **on a stale `dist`**; the build was not run |
| `git grep -c "^\s*test(" -- tests/accessibility.spec.ts` | 14 tests |
| `ls apps/web/src/surface/` and a `node -e` size sum | 19 stylesheets, 619.0 kB of source bytes, + 2 `.tsx`; `tokens.generated.css` 132 lines |
| `node -e` splitting live routes by status × presence of `evidence` | proposed with no evidence **84**, proposed with evidence **0**, built with no evidence **0** |
| `git grep -ln "ApisData" -- apps/ios/MyThuso` | only `Models/ApisData.swift` itself — unreferenced |
| `node -e` scanning `packages/catalog/*.json` for `"gate"` | G10, G14, G15, G29, G30, G31, G32, G33, G35 |

**Not run, and therefore not claimed:** `playwright test`; `npm run build -w @mythuso/web`;
`xcodebuild`; `gradlew`; any request to a live endpoint; anything touching `liqzar-server`.
