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
- Doctor clinical review, prescription and laboratory order detail with chain of custody, Control Tower dispatch and incident triage, and nurse onboarding and vetting.
- Shared loading, service-error, offline, permission-denied and empty states, collected in a state gallery.
- English, isiZulu, Sesotho and Afrikaans across the shell, navigation and primary actions.
- Roadmap entries for all 21 platform modules in the proposal.
- An **admin console** (the proposal's Control Tower): reporting against the funding plan, a nurse vetting pipeline that gates dispatch, dispatch and incidents, the doctor review queue with AI-versus-clinician agreement, a pricing catalogue that shows what the platform is left with after the nurse and payment costs, subscriptions and B2B lines, the seed round with milestone-gated tranches, and a compliance checklist that says plainly what is designed and what is not built.
- A real session: **Log out** closes the account from the profile menu or the More hub, and nothing about it is reachable until you sign back in.

The patient journey and the flows above are interactive on all three platforms. Later-phase modules remain navigation/detail previews. The precise scope, and what these flows deliberately refuse to do, is in [Feature map](docs/FEATURE-MAP.md).

## Architecture and security

[Architecture decisions](docs/ARCHITECTURE.md) explain the native stack, modular boundaries, planned backend, API contracts and integration gates. [Privacy and security](docs/PRIVACY-AND-SECURITY.md) separates implemented preview protections from POPIA, clinical and security work required before a pilot.

CI checks web types/build/journeys, source boundaries, dependency advisories and native builds. The boundary check also fails the build if clinical reference ranges, locale sets or demo verification codes drift apart between web, iOS and Android. UI state resets on reload/restart. There is no authentication, real payment, dispatch, diagnosis, prescription or connected device. Security and POPIA compliance are not established merely by this UI.

## Layout

| Path | Contents |
|---|---|
| `apps/web` | Responsive React application |
| `apps/ios` | Native SwiftUI Xcode application |
| `apps/android` | Native Compose Android application |
| `packages/catalog` | Service definitions and the commercial model from the proposal |
| `packages/design-tokens` | Cross-platform design reference |
| `docs` | Architecture, privacy controls and feature scope |
| `tests` | Desktop and mobile browser journeys, including the clinical, guardian and dispatch flows |
| `Documentation` | Original private proposal and brand assets |

## The business case

`packages/catalog/business-model.json` holds the proposal's commercial model — visit prices and nurse shares, subscriptions, network and B2B lines, screening packages, kit and own-device costs, the indicative trajectory, and the R9.7m seed round with its milestone gates. The admin console reads that file rather than repeating the numbers, and `npm run check` fails if the allocation or the tranches stop adding up to the round.

Only phase-one services are bookable. Later-phase services appear in the catalogue marked with their phase, so the plan is visible without implying a nurse can be sent today.

**This remains a preview with no backend.** There is no server, no stored record and no real account; approving a nurse approves nobody and releasing a tranche moves no money. What a working product additionally needs is listed in [Privacy and security](docs/PRIVACY-AND-SECURITY.md) and summarised in the console's Compliance tab.

The proposal is confidential. No deployment or publication is included.

Akhanya IT Innovations (Pty) Ltd · Johannesburg
