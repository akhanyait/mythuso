# MyThuso editorial redesign

[Ten care-experience refinements: implementation and latest validation](CARE-EXPERIENCE.md)

[Chart animation coverage and verification](CHART-MOTION.md)

The website, patient dashboard and native home/journal screens have been reworked around the supplied references: oversized editorial typography, original South African lifestyle imagery, warm paper, botanical greens and a sculpted lavender wellbeing surface. The current MyThuso logo is preserved.

The website now opens with a typographic composition above a wide photograph and separate pricing panel. The dashboard groups a photographic care cover, dated readings, appointments, services and trends in an asymmetric layout. iOS and Android implement the direction with SwiftUI and Jetpack Compose, including native navigation, scalable text and native artwork.

[Art direction, source references and the original image prompt](ART-DIRECTION.md)

[Native moon, mini-bar and clinical-chart motion details and validation](NATIVE-MOTION.md)

The safety section now uses a formal, static verification register with explicit review schedules, a mandatory-verification notice and separate access/clinical boundaries. It describes planned requirements rather than completed clinician checks. All eight nurse requirements, verification details, renewal periods and refusal statements retain their existing data sources. [Desktop safety section](website-safety.png) · [Phone safety section](website-safety-phone.png).

The how-it-works cards now use original photographic portraits with animated orbit rings and explain that a doctor may decide to make a home visit. [Desktop care team](website-care-team.png) · [Phone care team](website-care-team-phone.png) · [Portrait asset paths and generation prompts](STEP-PORTRAITS.md). All 38 landing tests, the web build and visual checks at five widths passed for this update.

The public figures section now pairs larger numerals with smaller currency/percent symbols, clearer supporting labels and a brief digit entrance. It uses two columns on phones and retains the dark navigation strip. Values remain sourced from the existing contracts. The page's Pause motion control and reduced-motion settings govern both the digits and the care-orbit artwork. [Desktop figures](website-figures.png) · [Phone figures](website-figures-phone.png).

The follow-up hero correction replaces the family, wellbeing and nursing portrait crops with original landscape images. Captions sit below the photographs; on narrow screens the location label sits above them. [Assets and exact generation prompts](HERO-IMAGES.md).

Corrected heroes: [Family](hero-2-1440.png), [Wellbeing](hero-3-1440.png), [Nursing](hero-4-1440.png), [Nursing on a phone](hero-4-390.png).

Hero correction validation: all 38 landing-page browser tests passed, followed by focused responsive/carousel checks after adjusting the location label. All four slides were checked at 320, 390, 1024 and 1440px, including image loading, horizontal overflow and separation between photos and captions. Repository checks and the production build passed. The native app was opened in the iPhone 17 Pro Max simulator.

## Open the local preview

- [Website](http://localhost:5184/)
- [Patient dashboard](http://localhost:5184/app/)

The review server uses the labelled fictional-data preview. Normal development still uses sign-in when its identity service is reachable.

## Review screenshots

- [Website](website.png) · [Website on a phone](website-phone.png)
- [Dashboard](web-dashboard.png) · [Dashboard on a phone](web-dashboard-phone.png) · [Phone readings](web-readings-phone.png)
- [Trends and services](web-dashboard-trends.png) · [Web journal](web-journal.png)
- [Native iOS home](ios-home.png) · [Native Android home](android-home.png)
- [Native Android journal invitation](android-wellbeing-card.png) · [Native Android journal](android-journal.png)

Native screenshots come from compiled apps in iOS Simulator and Android Emulator. The responsive website is a separate implementation.

## Validation

- TypeScript and repository boundary checks passed, including generated-token consistency, 92 declared contrast pairs and the prohibition on WebViews across 164 native source files.
- Web production build passed; the existing large-chunk advisory remains.
- Full regression suite passed: 70 geography tests, 707 API tests and 448 browser tests. Fourteen live-service browser checks were skipped because the review server intentionally runs without the identity service.
- Focused browser verification passed after refinements: 24 checks covering the new actions, carousel content, 320px layouts and 200% zoom.
- iOS simulator build passed. Booking journey and home usability at default and maximum Dynamic Type sizes passed (2 tests).
- Android debug build and lint passed. Booking journey and home usability at both tested font scales passed (2 tests).
- Visual review covered all four website stories, desktop and phone web layouts, native home screens and the Android journal. Corrections included preserving faces in wide photo crops and maintaining contrast on selected journal topics.

The readings, prices and existing actions retain their original data sources. The decorative moon is not a health score. The new illustrative image and its generation prompt are recorded in the art-direction document.

`git diff --check` also passed.

This is a local implementation. Production deployment, physical-device testing and live-service integration are not claimed.

- [Main-site login and map styling](CENTRAL-LOGIN-AND-MAPS.md)
