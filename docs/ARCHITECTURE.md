# MyThuso architecture decision — UI first

Status: implemented UI preview, September 2026. The funding proposal is product context, not authority to register companies, contact partners, purchase services or launch clinical operations. All preview people, readings, visits and transactions are fictional. No backend is deployed.

## Platform decision

| Platform | Selected stack | Reason |
|---|---|---|
| Web | React 19, strict TypeScript, Vite | Fast private application UI, small deployment surface, no server rendering of clinical records. Feature-specific components can move behind an authenticated BFF later. |
| iOS / iPadOS | Swift + SwiftUI; minimum iOS 17 | Native navigation, forms, accessibility and system sharing; direct future HealthKit, CoreBluetooth, Keychain and AVFoundation access. |
| Android | Kotlin + Jetpack Compose + Material 3; minimum Android 8 / API 26 | Native controls, accessibility, system sharing and direct future Health Connect, Bluetooth and Keystore access. |
| Identity service, built | TypeScript on Node's own primitives — `node:http`, `node:crypto`, `node:sqlite` — with storage behind an interface | The first backend slice needs no framework and no dependencies, which means no supply chain to audit for an authentication service. Storage is one interface so PostgreSQL is a file change, not a rewrite. |
| Rest of the backend, proposed | TypeScript modular monolith, PostgreSQL, private object storage, managed queue | Clear domain boundaries and transactions without premature distributed service complexity. Not scaffolded in this phase. |
| Contracts, proposed | OpenAPI with generated Swift, Kotlin and TypeScript clients | Share schemas and error semantics; retain independent native presentation code. Version at API boundaries. |

These are deliberate choices, not a promise of a permanently “best” or future-proof stack. Maintainability comes from boundaries, standards, tests, dependency updates and replaceable adapters. Native mobile has no web renderer or bundled web UI. Web is a separate application. Browsers/system identity sessions for future OAuth would be an explicit identity decision, never a WebView used to implement app features.

Sources checked: [Apple SwiftUI](https://developer.apple.com/documentation/SwiftUI), [Android Compose](https://developer.android.com/develop/ui/compose/first), [Vite requirements](https://vite.dev/guide/), [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes), [Kotlin 2.1.20](https://kotlinlang.org/docs/whatsnew2120.html). Android pins a compatible baseline (AGP 8.9.2, Gradle 8.13, Kotlin 2.1.20, SDK 35); update the toolchain and target SDK against store requirements before release. It is not claimed to be the latest version of every dependency.

## Current boundaries

- `apps/web/src/features`: dashboard, booking, patient screens, onboarding and recovery, clinical assessment and doctor review, pharmacy/laboratory orders, dispatch and incidents, guardian invitations, care-team previews. Shared UI primitives, the accessible chart and the system-state components live in `components`; catalogue and localisation in `lib`.
- `apps/ios/MyThuso`: app composition root, `Features`, `DesignSystem`, `Models`. Native state is owned by an in-memory `PreviewStore` injected through the environment. The chart and system-state components sit in `DesignSystem` so feature screens cannot each invent their own error state.
- `apps/android/app`: native composition root, `ui` and `model`; an in-memory preview store is injected into screens. `ui/SystemStates.kt`, `ui/ClinicalChart.kt` and `ui/Components.kt` are the shared primitives.
- `packages/catalog/services.json`: the visit menu with prices, nurse shares and the phase each service belongs to. Only phase one is held in step with the native fixtures, because only phase one is what launches; later-phase services are shown in the catalogue marked as not yet bookable.
- `packages/catalog/business-model.json`: the proposal's commercial model — subscriptions, network and B2B lines, screening packages, kit and own-device costs, the indicative trajectory and the seed round with its milestone gates. The admin console reads this rather than restating the numbers, and `scripts/check-boundaries.mjs` fails the build if the funding allocation or the tranches stop summing to the round, or if a service pays the nurse more than the patient pays.
- `packages/design-tokens/tokens.json`: reference palette, radii, spacing and motion specification. Native and CSS implementations currently map these manually; they are not generated packages yet.

Clinical reference ranges, the locale set, the identity check-digit rule and the demo verification codes are duplicated across the three codebases rather than shared, because each app is genuinely native and there is no shared runtime. That duplication is a real risk — a reference range that differs between iOS and Android is a clinical-safety problem — so `scripts/check-boundaries.mjs` parses all three and fails the build on drift. When the backend arrives, these constants should come from a versioned contract rather than from three source files kept in step by a script.

These are source-level boundaries in the preview, not independent compiled feature modules. Split native domain/design-system/features into Swift packages and Gradle library modules when repositories and API adapters arrive. Split the web `Pages` collection into domain packages at that point. Avoid a generic shared mobile UI abstraction that erases platform behaviour.

## Planned domain modules

Identity and access; patient/household/guardian authority; consent and privacy; service catalogue; bookings and dispatch; clinical encounters; devices and observations; doctor review; Health Passport and documents; pharmacy/lab orders; subscriptions; wallet and payment ledger; workforce vetting and earnings; partner programmes; notifications; incidents; audit.

Only the owning module writes its records. Other modules use application interfaces or versioned events. Separate person identity from clinical record identifiers. Clinical observations carry patient, encounter, clinician/device, unit, timestamp, provenance and review state. AI outputs are separate from signed clinical decisions. Match a FHIR interoperability profile after partner discovery; do not build an unbounded generic FHIR server first.

Use a transaction outbox for reliable events. External payments use provider references, signed webhooks, replay protection and idempotency keys. The wallet is an immutable double-entry ledger, never a mutable balance in the client. No money movement exists in this preview.

## The identity service

`apps/api` is the first backend slice, and it does one thing: it establishes who someone is. It
holds a name and a mobile number. It holds no health information, and `scripts/check-boundaries.mjs`
fails the build if a clinical table appears in it — because the moment one does, this service is
handling special personal information and everything in `docs/PRIVACY-AND-SECURITY.md` applies.

The web app reaches it through its own origin at `/api`, proxied in development and expected behind
the same host in production. That is the back-end-for-front-end the trust-boundary section calls
for: the session cookie stays first-party, `HttpOnly` and `SameSite=Strict`, the page's `connect-src`
stays `'self'`, and there is no CORS configuration to get wrong.

What it actually implements, rather than plans:

- Sign-in by one-time code. No password exists, so none can be stored, reused or leaked.
- Codes and session tokens are hashed with a server-side pepper. Reading the database yields neither
  a working code nor a working session.
- Codes expire in ten minutes and burn after five attempts; comparison is constant-time.
- Rate limits per number and per address, so neither one number nor one address can be walked.
- `/auth/start` answers identically for a known and an unknown number: an endpoint that says "no such
  account" tells an attacker which numbers to keep.
- Sessions have an idle window that slides and an absolute limit that does not.
- An append-only audit row for every attempt, success, refusal and sign-out, with the address kept
  and the user agent hashed.
- Production refuses to start with a weak pepper, an `http` origin, no SMS provider, or the
  development setting that returns codes in the response.

Still required before real information: PostgreSQL rather than SQLite, an SMS provider, SA hosting,
encryption at rest, key rotation, step-up authentication before records and export, and an
Information Officer. The console's Compliance tab lists these as not built, because they are not.

## Session and the admin console

The web app has a real session: signing out clears the role, closes every dialog and replaces the shell with a sign-in screen, and nothing about the account is reachable until you sign back in. With no identity service running, nothing is stored — a reload returns to the signed-in preview, the same memory-only rule that applies to every other piece of state here. With one running, the session is the service's cookie and survives a reload because it is real. That is deliberate: a session flag would be harmless to persist, but the guard that keeps browser storage out of this app is worth more than the convenience, and `scripts/check-boundaries.mjs` enforces it.

The admin console is the proposal's Control Tower as a web-only back office — it is not a phone surface and is not built for the native apps. It reports against the funding plan rather than against nothing, gates dispatch behind a vetting pipeline, shows what a price change actually leaves the platform, and gates funding tranches behind milestones. Every action is in-memory and fictional. Its Compliance tab is deliberately a checklist of what is designed versus what is not built, not a status.

## Client/server trust boundary

Clients render allowed actions; the server authorises every action and object. UI role selection is only a demonstration and must be removed from production builds. Record access combines role, organisation, assigned care relationship, purpose, patient/guardian authority and time-limited consent where applicable. Roles alone are insufficient. Sponsor permission and clinical-record permission are independent.

Web sessions use a BFF with Secure, HttpOnly, appropriately SameSite cookies, CSRF defences and strict origin checks. No tokens in browser storage. Native uses standards-based OIDC with PKCE and short-lived credentials in Keychain/Keystore. Evaluate phishing-resistant MFA/passkeys, step-up authentication for sharing/export, session revocation and device loss. No secrets or privileged API keys ship in clients.

## Native integrations, later

| Capability | iOS | Android | Gate |
|---|---|---|---|
| Diagnostic devices | CoreBluetooth | Android Bluetooth APIs | Supported certified device, identity binding, per-purpose permission, calibrated data validation |
| Wellness trends | HealthKit | Health Connect | Granular consent and data-type permission; consumer data is not a diagnosis |
| Camera and audio | AVFoundation | CameraX / audio APIs | Just-in-time purpose, minimum capture, no general photo-library upload |
| Teleconsultation | Native media/WebRTC SDK | Native media/WebRTC SDK | Verified participant, clinical consent, no recording by default |
| Location | CoreLocation | Android location APIs | Foreground first; background access only for justified active nurse dispatch |
| Notifications | APNs | FCM | Generic messages, no medical details in push payloads |
| Secure offline care | Data Protection + Keychain | Encrypted app-private storage + Keystore | Minimise cached scope, expiry, revocation, conflict policy and recovery testing |

No health, Bluetooth, location, camera or microphone permission is requested by the UI preview. Android has no INTERNET permission. Native share actions only export a fixed fictional record through the system share sheet.

## Delivery gates

Implemented now: strict web type checking, production bundle build, native compile workflows, no-WebView source check, no web patient-storage/dynamic HTML check, catalogue consistency check, desktop/mobile journey tests, npm high/critical advisory gate. These are baseline checks, not a security certification.

Before backend integration: threat model, data-flow inventory, access policy tests (including cross-patient/tenant negatives), secret scanning, SAST/SCA, migration rollback drills, API contract tests, upload malware scanning and content limits, rate limits and abuse controls.

Before any pilot: independent penetration test, information/clinical governance approval, device and clinician verification, tested incident response, encrypted backup restore test, retention enforcement, partner/operator agreements, production monitoring with PHI redaction and a documented release acceptance sign-off. CI should pin third-party actions to reviewed commit SHAs and use short-lived OIDC deployment credentials before deployment is introduced.

## Design choices

The interface follows a single mobile-first design language, defined in `packages/design-tokens/tokens.json` and implemented three times — CSS custom properties, a SwiftUI `ThusoTheme`, and a Compose `ThusoTheme`. Its repeating units are a soft tinted icon tile, an 18px white card on a pale canvas, a capsule status pill, and a teal primary action. Phones get a five-item bottom tab bar; from 1000px the web widens into a sidebar rather than stretching the phone layout. Long flows share one pattern: `Step N of M`, a label, and a dot indicator, with one box per digit wherever a code is entered.

The web shell is a fixed-height app shell with its own scrolling region rather than a scrolling document, so the header and tab bar behave the way they do on the native apps.

The landing screen is one green field: the header, the greeting and the hero all sit on the same softly textured gradient, and the hero is a translucent card floating on it with the person rising clear of the card's top edge. The persistent demo label lives as a single pill in the header rather than a strip above the content, and the design-review entries — first-run flow, workspace previews, system states — are gathered behind it, so the patient screens read as the product rather than as a demo harness.

The banner itself auto-rotates: three slides, each with a headline, a call to action, three trust marks and a person who rises above the top edge of the banner rather than sitting inside it. Behind them, drifting bubbles and two slow currents give the surface texture. All of that motion is decorative — it is hidden from assistive technology, it uses only transform and opacity, it stops completely under `prefers-reduced-motion` (and under Android's animator scale of 0), and a viewer can stop the rotation at any time, which WCAG 2.2.2 requires of anything that moves on its own.

Illustration is a single source: `packages/illustrations/*.svg`, and the wordmark is one of them — the vector is served directly to the web and rasterised into both native bundles, so the logo has a real transparent background wherever it sits on colour. The web imports those files directly and `scripts/render-illustrations.mjs` rasterises the same files into the iOS asset catalogue and Android drawables, so the three apps cannot drift apart visually. `scripts/check-boundaries.mjs` fails the build if a derived bitmap is missing or older than its source.

Patient-first navigation, calm teal/sage surfaces, ivory accents, small mango highlights, clear prices and a persistent demo label. The supplied logo is retained. System typography is used for native legibility and no third-party font requests; the proposal’s Poppins face can be added as a licensed, self-hosted web asset after typography approval. No real patient or staff photos are used. The design calls for photography throughout — the home hero, service cards, avatars and promotional panels — and every one of those slots is filled with a local flat illustration instead. Each is a deliberate drop-in point: replacing an illustration with licensed, consented photography changes no layout. The hero banner goes further — each slide asks for a cut-out on transparency first, then a photograph with its own background, then its illustration, and uses whichever loads. Only a cut-out is free to cross the banner's top edge; a photograph carrying its own scene is held inside the frame instead. Real cut-outs are supplied for all three slides, so that is what every platform renders today. `apps/web/public/banners/README.md` gives the filenames and the framing the design needs. Until such photography exists, with releases from the people in it, the preview must not imply that these are real nurses or real patients.

Support responsive widths, visible focus, semantic controls, native Dynamic Type/Android font scaling, reduced-motion preference and at least 44-point native interaction targets. Data visualisation follows the same rule as the rest of the UI: a chart is drawn for people who can see it and exposed as a spoken summary and a real table for everyone else, so no reading is available only as a picture. The dispatch map is decorative for the same reason — every dispatch action is reachable from the list beside it, with a keyboard.

The shell, navigation and primary actions are translated into English, isiZulu, Sesotho and Afrikaans; clinical wording is deliberately left in English until a South African clinical language panel has reviewed it, because a mistranslated instruction is a safety problem rather than a polish problem. Prices remain in ZAR. The remaining official languages, South African Sign Language guidance, right-to-left layouts where needed, screen-reader audits and large-text device testing on real hardware remain release work. No clinical claims or delivery SLAs from the proposal should be advertised as operational guarantees without validation.
