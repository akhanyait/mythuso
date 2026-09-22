# MyThuso

Nurse-led home healthcare for South Africa. A patient books a visit; a SANC-registered nurse comes
to the house; a registered doctor reviews what the nurse found. Built by Akhanya IT Innovations,
Johannesburg. `Documentation/` holds the funding proposal this is built from.

Three native apps and three services:

- `apps/web` — React 19 + TypeScript + Vite. **Three entries**, and the split is about who is
  reading rather than who is working: the public page (`landing.html`, served at `/`), the whole
  product (`index.html`, served at `/app/`), and the status page (`status.html`), which renders
  `packages/catalog/capabilities.json` and carries no framework at all.

  The product was four applications behind four addresses until 12 September, when the founder asked
  for one address and a role you pick — `/app/?role=nurse` and the rest, with no role meaning the
  patient. `staff.html` and `admin.html` are gone and their paths redirect. The reason the split
  existed is still true, so it moved rather than went: a patient on a mid-range phone on metered
  data must not download a dispatch board, and the workspaces are behind dynamic imports that fetch
  when a role is opened. The patient entry was measured before and after, 287.2 kB against 286.6 —
  if that figure ever rises, the convenience has been paid for by the people this is built for.
  Re-measured on 16 September at `ec21f33`, on the tree that merges Waves 4 and 5 — Medicines & Labs,
  Trust, Safety SOS, Record P1, Devices, Access, the HL7 bridge, Clinical, Sentinel, Movement and Money:
  **295.49 kB** — every script, module preload and stylesheet `apps/web/dist/index.html` references,
  each gzipped at level 9 after `npm run build -w @mythuso/web`. It is below the 319.97 kB measured on
  14 September at `c62961c` because every workspace and every engine's screens added since sit behind a
  dynamic import, so eleven engines of product across two waves cost the patient's first view nothing.
  Measured again on 16 September at `8bf3e48`, the Wave 6 tree — Care's reads, Core's structural routes,
  Record's Encounter status, Money's gifts and market orders, Access's households: **282.16 kB** across
  13 files, the same way. Lower still, because Access moved the household record, the health summary
  and the sponsor's statement behind dynamic imports in the same change that added its three screens;
  Money's three wallet shortcuts cost 0.47 kB, the only thing added. Compare a new figure
  only against one taken the same way; a screen that is not on the patient's first view belongs behind a
  dynamic import.

- `apps/ios` — SwiftUI, iOS 17+.
- `apps/android` — Jetpack Compose + Material 3, API 26+.
- `apps/api` — the identity service. Zero dependencies: `node:http`, `node:crypto`, `node:sqlite`,
  `node:test`. Holds identity only, never health information.
- `apps/passport` — the Health Passport P0, a separate zero-dependency service with its own SQLite
  file and its own master key, a consent gateway in front of every read and a hash-chained audit the
  patient reads. **Development only, synthetic data only**: it refuses to start without
  `MYTHUSO_PASSPORT_DEVELOPMENT=synthetic-data-only`, binds to loopback, and a boundary check fails if
  anything in `deploy/` names it — because the controls it needs (a signed DPIA, an Information
  Officer, a residency decision, KMS/HSM custody) do not exist yet.
- `apps/assistant-api` — **GilbertOne, the assistant's API engine**: a separate service rather than a
  feature of any one app, with its own process on `127.0.0.1:8791`, its own address family authored in
  `packages/catalog/apis/assistant.json`, and the web, iOS and Android applications as its clients.
  `node:http` with no web framework; the LangChain tier and the catalog it reads are the only
  dependencies it carries, which is why `npm run assistant-runtime` bundles it into one self-contained
  file before a deploy touches the box. **Installed dark by every deploy** — loopback only, nginx's
  `location /assistant/` the sole way in, and the model tier refusing to serve in production without
  `MYTHUSO_ASSISTANT_PRODUCTION=acknowledged` written by hand. Built is not live: triage, the
  vital-sign reading and the handover submission are each gated on a contract that does not exist
  yet, and the three allowlisted external knowledge sources all ship `"active": false`.
- `packages/gilbertone` — the deterministic half of GilbertOne, compiled into all three platforms:
  emergency recognition, essential refusals and safe offline fallback, answered from the message and
  the contract alone. **No dependencies, no network, no environment variable**, and the build fails if
  anything under `src/` calls `fetch()`, imports a network or model module, or reads one. This is what
  answers while the engine above is dark, which — today — it always is.
- `packages/catalog` — the contracts everything else derives from, as JSON. `apis.json` and
  `apis/<engine>.json` hold every engine's frozen API contract (who may call each route, for which
  purpose, what it refuses and what it emits), locked in `apis.lock` beside `events.lock`, with each
  route's refusals, callers and inner shapes in `apis.refusals.lock`, `apis.callers.lock` and
  `apis.shapes.lock`.
- `packages/mock-api` — a development mock that answers every contract route from fixtures and refuses
  exactly as each route declares. Loopback only, refuses to start without
  `MYTHUSO_MOCK=synthetic-data-only`, and nothing in `deploy/` may name it.

## The rules that are not negotiable

**Nothing here is a real service.** No visit is booked, no payment taken, no clinical decision
issued, no device contacted. Every screen that could be mistaken for the real thing says so. A
health service that overstates its readiness is not a marketing problem.

**A number lives in one place.** A price, a nurse's share, a reference range, a refusal sentence.
Everything else derives from it. `scripts/check-boundaries.mjs` fails the build when two copies
disagree, and where a copy is unavoidable — native apps cannot read JSON at runtime — the copy is
*generated* by `scripts/emit-*.mjs` rather than typed, so drift has nowhere to come from.

**Say what is refused, and why.** This codebase is built out of refusals: a failed visit code stops
the visit, a lapsed credential withdraws dispatch by arithmetic, a suspension never touches money
already earned, a protected category is never a header chip. When you add a feature, the valuable
part is what it will not do. Write those sentences into the contract JSON so all three platforms
render them word for word, and write the reasoning into a comment above the code that enforces it.

**Health data is special personal information under POPIA.** Identity is not. That distinction is
why `apps/api` may exist ahead of the controls in `docs/PRIVACY-AND-SECURITY.md`, and a boundary
check fails the build if a clinical table appears there.

**No `localStorage`, `sessionStorage` or `indexedDB` in `apps/web/src`.** The preview must not
persist patient data. Checked.

**No WebViews in the native apps.** Each app is genuinely native. Checked.

**Gilbert's emergency terms are a versioned configuration.** Change them only in
`packages/catalog/gilbert-emergency-terms.json`: raise `version`, add a changelog entry (day, role,
terms added and removed as "group: term", why, the new `termsHash`), and keep the shared fixtures
passing on all three platforms — `npm run check` replays the changelog and fails otherwise. The list
has no clinical reviewer yet, and needs one before real patients. The 30-second listening cap and
"Your Thuso AI Doctor · not a person, and not a doctor" are founder decisions, not edits.

## Working here

```
npm run dev        # Vite on :5173 — app at /, landing at /landing.html
npm run check      # typecheck every workspace (incl. apps/passport) + scripts/check-boundaries.mjs
npm test           # package, api and passport node:test + Playwright (desktop 1440×1100, mobile 390×844)
npm run passport-p0  # the Passport P0 service on loopback — development flag required, synthetic data only
npm run apis       # re-emit the API contracts into TypeScript, Swift and Kotlin (also part of generate)
npm run mock-api   # the contract mock on loopback — MYTHUSO_MOCK=synthetic-data-only required
npm run generate   # re-emit tokens, vetting, records, earnings, locales, events, consent grants and protocols
npm run api        # the identity service on :8787
```

Native builds:

```
xcodebuild -project apps/ios/MyThuso.xcodeproj -scheme MyThuso -sdk iphonesimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
JAVA_HOME=/opt/homebrew/opt/openjdk@17 apps/android/gradlew -p apps/android \
  :app:assembleDebug :app:lintDebug
```

A change is not done until `npm run check`, `npm test` and both native builds pass.

## Adding a feature — the shape it takes

1. **The contract** in `packages/catalog/<name>.json`: the states, the kinds, the rules and the
   refusal sentences, as data. Derive every number you can from an existing contract rather than
   restating it. Dates are day offsets from today so the preview never goes stale. If the feature
   publishes or consumes an event, declare it in an `events` array to the shape in
   `packages/catalog/events.json` and append `type@version` to `packages/catalog/events.lock` in the
   same change. Events are frozen: a changed shape is a new version, never an edit, and a frozen
   version found to be wrong is marked `withdrawn` (with the day, the reason and its replacement) —
   it keeps its lock line, loses every subscriber and may not be named in code, but it is not deleted.
   A feature that exposes or calls a route declares it in `packages/catalog/apis/<engine>.json` —
   callers, purpose, at least one refusal, the events it emits, an idempotency key on money and
   dispatch writes, and the inside of every object it carries as `fields` (or `shapeFrom` the contract
   section that decides it), never prose — and runs `npm run apis -- --seed-new`, which appends its
   lines to `apis.lock` and the three locks beside it. A changed route is a new version, as with
   events, and changed includes a refusal added, removed or reworded, a caller, purpose or engine
   justification added, and a field changed at any depth; a narrowing needs no version and is recorded
   with `npm run apis -- --record-narrowing`. An engine-wide refusal is answered only by the routes its
   `answeredBy` names, and a shared refusal's words are a new id, never an edit. No lock line is ever
   edited or removed: the build compares every lock with its git history.
   Mark it `built` only with the handler file as evidence. `endpointNamed` is for paths the
   documents actually give (today only the Passport's §26); anything else is `capabilityNamed` or ours.
2. **A generator** `scripts/emit-<name>.mjs` writing the contract into Swift and Kotlin, registered
   in `package.json` and in the `generated` list in `scripts/check-boundaries.mjs`. Swift escapes
   quotes; Kotlin escapes backslash, quote **and** `$`.
3. **Web** — `apps/web/src/lib/<name>.ts` (the reasoning) and `apps/web/src/features/<Name>.tsx`
   (the screen), routed from `apps/web/src/App.tsx`, styled in an appended section of `styles.css`.
4. **iOS** — `Models/<Name>.swift` (types and arithmetic, hand-written) beside the generated
   `Models/<Name>Data.swift`, and `Features/<Name>View.swift`. New files must be registered in
   `apps/ios/MyThuso.xcodeproj/project.pbxproj`: a `PBXFileReference`, a `PBXBuildFile`, an entry
   in the group's `children`, and one in the `PBXSourcesBuildPhase` `files` list.
5. **Android** — `model/<Name>.kt` beside generated `model/<Name>Data.kt`, and `ui/<Name>Screens.kt`,
   routed from the `when` block in `ui/AccountScreens.kt`.
6. **Boundary checks** in `scripts/check-boundaries.mjs` for the arithmetic and the invariants.
   Prove each new check fires by breaking the source deliberately, then restore.
7. **A journey** in `tests/<name>.spec.ts`, running on both viewports.
8. **`docs/FEATURE-MAP.md`** — a row for what landed, the refusals it adds, and remove it from
   "Next UI increments".

## Style

Comments explain *why*, at the top of a file or above a decision — not what the next line does.
Dense but readable code, matching what is already there. British spelling. Real sentences in user
copy: "Your bank sent it back. It is still owed to you", not "Payment failed".

`apps/api` runs on Node's type-stripping: **no constructor parameter properties, no enums, no
namespaces.** Use `#private` fields.

## Deployment

`./deploy/deploy.sh` builds and publishes to `mythuso.co.za` on `liqzar-server`, which also
hosts five unrelated production sites. Never edit another site's config; `nginx -t` before any
reload. The identity service is installed but deliberately switched off until DNS, TLS and an SMS
provider exist — a one-time-code endpoint over plain http hands out accounts. The GilbertOne engine
is installed the same way and left dark for a different reason: no model provider is configured, and
activation is a sequence done by hand at a terminal on the box (`deploy/RUNBOOK.md`, _Activating the
assistant service_). See `deploy/README.md`.
