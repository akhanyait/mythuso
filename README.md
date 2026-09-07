# MyThuso

**Help. Health. Home.** A UI-first foundation for home healthcare in South Africa.

Three separate applications: **React/TypeScript web**, **SwiftUI iOS**, and **Kotlin/Jetpack Compose Android**. Mobile screens are fully native; no WebViews or web wrappers. This is a design preview with fictional data, not a functioning clinical platform.

## Run the web preview

Requires Node 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). Use **Preview workspaces** to review patient, nurse, doctor, pharmacy/laboratory partner and Control Tower designs, and **First-run flow** to review sign-up and account recovery. No sign-in is required for this fictional preview — the first-run flow is a design route you enter deliberately, not a gate.

```sh
npm run check
npm run build
npx playwright install chromium
npm test
```

## The landing page

`apps/web/landing.html` is a separate entry, so someone reading about MyThuso does not download the
whole application to do it. In development it is at `/landing.html` with the app at `/`; in
production nginx puts the public page at `/` and the app at `/app/`.

It is deliberately explicit that MyThuso is being built rather than operating — a banner above the
fold, a footer stating no visit can be booked and no payment taken, and a note that the people shown
are illustrative and are not MyThuso nurses or patients.

## Deploying

```sh
./deploy/deploy.sh                        # liqzar-server, mythuso.liqzar.co.za
HOST=mythuso.co.za ./deploy/deploy.sh     # somewhere else
```

It adds `/var/www/mythuso`, one nginx site file and `/opt/mythuso/ops`, tests the whole nginx
configuration before it reloads, and verifies with a `Host:` header against the server's own
loopback — so a deployment can be confirmed before DNS points anywhere. It never edits another
site's configuration.

That server also serves agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and
skillsonwheels.co.za, and none of them are ours to break. So the deploy records what each of them
answers **before it touches anything** and asks them again at the end, and fails if any of them
changed: a deploy that breaks a neighbour should be caught by the deploy, not by that neighbour's
owner. Nothing that looks like a credential, and nothing from `Documentation/`, can be synced.

`deploy/ops/` holds a health check every five minutes — the public page, TLS expiry, the identity
service, disk and backup freshness, alerting only after two consecutive failures — and a nightly
backup of the identity database that is restored and queried before it is called a backup. Both are
installed by every deploy and enabled by hand, once.

The identity service is **not** turned on by a deploy. It signs people in with one-time codes, and
that must not be reachable over plain http. [deploy/README.md](deploy/README.md) has the order: DNS,
then TLS, then an SMS provider, then the service.

## Run the identity service

The app runs without a backend — that is what the design preview is. There is now also a real
identity service, and when it is answering the preview stops pretending: you have to sign in with a
one-time code, and the session is an HttpOnly cookie the page cannot read.

```sh
npm run api          # http://127.0.0.1:8787, reached through the app's own /api proxy
npm run test:live    # the browser sign-in loop end to end, against that service
```

It has no dependencies — `node:http`, `node:crypto` and `node:sqlite` — so there is no supply chain
to audit. In development it prints the one-time code instead of sending an SMS; in production that
is refused outright, along with a weak signing pepper, an `http` origin, or no SMS provider.

**It holds a mobile number, a name if one was given, and — for an account that has set one up — the
encrypted secret its authenticator app shares with it.** That is personal information, not the
special personal information that health data is, which is the only reason it can exist ahead of the
controls in [Privacy and security](docs/PRIVACY-AND-SECURITY.md). `npm run check` fails if a
clinical table appears in it.

`npm test` runs the preview suite with no backend, plus the live sign-in test, which skips unless
the service is up.

## Run iOS

Open `apps/ios/MyThuso.xcodeproj` in Xcode, select the **MyThuso** scheme and an iOS 17+ simulator, and Run. Physical devices require your own signing team. The checked-in project needs no third-party package manager.

```sh
xcodebuild -project apps/ios/MyThuso.xcodeproj -scheme MyThuso \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

If Swift source files are added, regenerate the project with `python3 scripts/generate-xcode-project.py`.

## Run Android

Open `apps/android` in Android Studio, select a JDK 17+ Gradle runtime (Android Studio’s bundled JDK works), allow SDK 35 installation and run **app** on API 26+. Configure your SDK path through Android Studio or `ANDROID_HOME`; no developer-specific SDK path is committed.

```sh
cd apps/android
./gradlew :app:assembleDebug :app:lintDebug
```

APK output: `apps/android/app/build/outputs/apk/debug/app-debug.apk`. The Gradle wrapper is included. This preview has no internet, location, camera, microphone, Bluetooth or health permissions.

## Design

The landing screen is one green field behind the header, greeting and hero, with an auto-rotating banner — three slides, each with its own call to action, trust marks and a person who rises above the top edge of the banner, over a softly animated background. It pauses on hover or focus, can be stopped outright, and does not rotate at all when the system asks for reduced motion.

The photography lives in `packages/banners` and is prepared by `python3 scripts/prepare-banners.py`, then distributed to all three apps by `node scripts/render-illustrations.mjs`. Each slide falls back from a cut-out to a plain photograph to an illustration, so the banner never breaks — see the [README there](apps/web/public/banners/README.md) for framing and the model-release requirements.

One mobile-first design language across all three apps: soft tinted icon tiles, white cards on a pale canvas, capsule status pills and a teal primary action, with a five-item bottom tab bar on phones and a sidebar on wide screens. Tokens live in `packages/design-tokens/tokens.json`.

Illustrations have a single source in `packages/illustrations`. The web imports the SVGs directly; the native bundles hold bitmaps rendered from the same files:

```sh
node scripts/render-illustrations.mjs
```

`npm run check` fails if a native bitmap is missing or older than its SVG. Every illustration marks a photography slot — the preview uses no real patient or staff photos.

## Included UI

- Patient home, nine-service catalogue, and a four-step booking flow with date and time selection, payment choice and review.
- First run and account recovery: language, one-time code, South African ID check-digit validation, recovery setup and separated consent.
- Health Passport with accessible trend charts — every chart is also a table — documents, limited-sharing preview and export.
- Family profiles, guardian invitations with explicit scope, duration and verification, care plans, wallet, notifications and privacy choices.
- Nurse visit assessment: visit-code identity check, spoken consent, seven observations with indicative-range flagging, escalation and attributed sign-off.
- Doctor clinical review, prescription and laboratory order detail with chain of custody, and Control Tower dispatch and incident triage.
- Vetting for all twelve vetted parties — nurse, locum, doctor, pharmacy, laboratory, sample courier, Control Tower operator, admin staff, employer, sponsor, guardian and Thuso Corner site. Credentials are checked against the format the issuing body actually uses, a high-risk check needs a second reviewer, a lapsed one suspends the party by arithmetic rather than by somebody noticing, and each party is told exactly what it is refused until its checks pass.
- A clinician-facing patient file: a permanent summary header, eight tabs over forty-two record types each mapped to its FHIR resource, a visual overview and a filterable timeline — with every tab and action gated on the vetting module, so the same file read by a nurse, a pharmacy, a guardian and an operator shows four different things and says why.
- One consultation structure for every encounter, in long form or SOAP, and a household record where membership is deliberately not consent.
- Shared loading, service-error, offline, permission-denied and empty states, collected in a state gallery.
- English, isiZulu, Sesotho and Afrikaans across the shell, navigation and primary actions.
- Roadmap entries for all 21 platform modules in the proposal.
- An **admin console** (the proposal's Control Tower): reporting against the funding plan, a vetting queue for every role that gates dispatch, clinical sign-off, dispensing and result release, dispatch and incidents, the doctor review queue with AI-versus-clinician agreement, a pricing catalogue that shows what the platform is left with after the nurse and payment costs, subscriptions and B2B lines, the seed round with milestone-gated tranches, and a compliance checklist that says plainly what is designed and what is not built.
- A real session: **Log out** closes the account from the profile menu or the More hub, and nothing about it is reachable until you sign back in.

The patient journey and the flows above are interactive on all three platforms. Later-phase modules remain navigation/detail previews. The precise scope, and what these flows deliberately refuse to do, is in [Feature map](docs/FEATURE-MAP.md).

## Architecture and security

[Architecture decisions](docs/ARCHITECTURE.md) explain the native stack, modular boundaries, planned backend, API contracts and integration gates. [Privacy and security](docs/PRIVACY-AND-SECURITY.md) separates implemented preview protections from POPIA, clinical and security work required before a pilot.

CI checks web types/build/journeys, source boundaries, dependency advisories and native builds. Design tokens and the vetting table are not written out three times: `npm run generate` emits them into CSS, Swift and Kotlin, and the boundary check re-runs the generators and byte-compares, so a refusal sentence cannot say one thing on iOS and another on Android. What is still written by hand — clinical reference ranges, locale sets, demo verification codes — is checked for drift the older way. UI state resets on reload/restart. There is no authentication, real payment, dispatch, diagnosis, prescription or connected device, and no credential is verified with any issuing body — the formats are real, the numbers are fictional, and nothing is sent anywhere. Security and POPIA compliance are not established merely by this UI.

## Layout

| Path | Contents |
|---|---|
| `apps/web` | Responsive React application |
| `apps/ios` | Native SwiftUI Xcode application |
| `apps/android` | Native Compose Android application |
| `packages/catalog` | Service definitions, the commercial model from the proposal, and the vetting table every app reads |
| `packages/design-tokens` | Cross-platform design reference |
| `docs` | Architecture, privacy controls and feature scope |
| `tests` | Desktop and mobile browser journeys, including the clinical, guardian and dispatch flows |
| `Documentation` | Original private proposal and brand assets |

## The business case

`packages/catalog/business-model.json` holds the proposal's commercial model — visit prices and nurse shares, subscriptions, network and B2B lines, screening packages, kit and own-device costs, the indicative trajectory, and the R9.7m seed round with its milestone gates. The admin console reads that file rather than repeating the numbers, and `npm run check` fails if the allocation or the tranches stop adding up to the round.

Only phase-one services are bookable. Later-phase services appear in the catalogue marked with their phase, so the plan is visible without implying a nurse can be sent today.

**This remains a preview with no backend.** There is no server, no stored record and no real account; approving a nurse approves nobody, suspending a laboratory suspends nobody, and releasing a tranche moves no money. What a working product additionally needs is listed in [Privacy and security](docs/PRIVACY-AND-SECURITY.md) and summarised in the console's Compliance tab.

The proposal is confidential. No deployment or publication is included.

Akhanya IT Innovations (Pty) Ltd · Johannesburg
