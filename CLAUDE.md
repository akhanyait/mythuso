# MyThuso

Nurse-led home healthcare for South Africa. A patient books a visit; a SANC-registered nurse comes
to the house; a registered doctor reviews what the nurse found. Built by Akhanya IT Innovations,
Johannesburg. `Documentation/` holds the funding proposal this is built from.

Three native apps and one service:

- `apps/web` — React 19 + TypeScript + Vite. Two entries: the app (`index.html`) and the public
  landing page (`landing.html`).
- `apps/ios` — SwiftUI, iOS 17+.
- `apps/android` — Jetpack Compose + Material 3, API 26+.
- `apps/api` — the identity service. Zero dependencies: `node:http`, `node:crypto`, `node:sqlite`,
  `node:test`. Holds identity only, never health information.
- `packages/catalog` — the contracts everything else derives from, as JSON.

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

## Working here

```
npm run dev        # Vite on :5173 — app at /, landing at /landing.html
npm run check      # typecheck all three workspaces + scripts/check-boundaries.mjs
npm test           # api node:test + Playwright (desktop 1440×1100, mobile 390×844)
npm run generate   # re-emit tokens, vetting, records and earnings into Swift/Kotlin/CSS
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
   restating it. Dates are day offsets from today so the preview never goes stale.
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

`./deploy/deploy.sh` builds and publishes to `mythuso.liqzar.co.za` on `liqzar-server`, which also
hosts five unrelated production sites. Never edit another site's config; `nginx -t` before any
reload. The identity service is installed but deliberately switched off until DNS, TLS and an SMS
provider exist — a one-time-code endpoint over plain http hands out accounts. See `deploy/README.md`.
