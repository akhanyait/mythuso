# Integration notes — the native apps brought in line with f0b34df

`f0b34df` restructured the web patient home and gave the professional workspaces their own
navigation. iOS and Android were left where they were. This closes that gap. Nothing under
`apps/web` and nothing in `packages/catalog` was touched: every string and number this needed
already existed as a contract, and the two apps now read the same ones the web reads.

## What changed, file by file

### iOS

**`apps/ios/MyThuso/Features/HomeView.swift`** — rewritten. The `HeroTexture` behind the header is
210pt rather than 470, and the auto-rotating `HeroCarousel` is gone from this screen entirely. The
order is now: a compact greeting; a care-area chip and the patient chip, side by side (they wrap to
a line each under `ViewThatFits` at accessibility text sizes); the next visit, or the scheduling
contract's own empty state (`Scheduling.Label.noUpcoming` / `noUpcomingDetail`) with a booking
button; the search field and a prominent **Book a nurse** button; four service shortcuts as **rows**
— icon, name, description, `service.price` and `service.duration` from the catalogue, chevron;
recent results; a care-plan reminder; the circle of care with the "booking opens their booking,
never their record" line; and one promotional card, last. Fixed point sizes were replaced with
semantic fonts (`.title2`, `.headline`, `.subheadline`, `.footnote`, `.caption`) and the shortcut,
visit and result rows switch to a vertical `AnyLayout` when `dynamicTypeSize.isAccessibilitySize`,
so nothing clips at the largest sizes. Tap targets carry `minHeight: 44`. The search still writes to
`store.careQuery` and submits into the catalogue — the fix from `f0b34df` is untouched, as is the
visit card, which reads a real `BookedVisit` and shows `service.duration` rather than an arrival
estimate for a scheduled visit.

**`apps/ios/MyThuso/Features/PassportView.swift`** — three changes.
- `RoadmapView` (Explore) now opens with `HeroCarousel`, with `navigationDestination`s for the two
  places its slides lead. It keeps its pause control and its reduced-motion refusal, and it still
  renders all three slides' translated CTAs from `heroSlides()`, which is what
  `scripts/check-boundaries.mjs` holds in step across the three platforms.
- `WorkspaceView` was replaced by `WorkspaceSection`, `WorkspaceNavigation`, `WorkspaceShell`,
  `WorkspaceUrgency` and `WorkspaceSectionView`. A role now opens its own `TabView` — one
  `NavigationStack` per section — with the same sections in the same order as `roleNavigation` in
  the web `App.tsx`: Nurse (Schedule, Assessments, Thuso Kit, Earnings & payouts, Vetting), Doctor
  (Review queue, Teleconsultation, Patient context, Protocols), Partner (Orders, Collections,
  Results), Control Tower (Dispatch, Incidents, Vetting queue, Quality). Each landing section opens
  with the urgency strip — what is waiting and how long it has waited — matching the web's `metrics`
  table. Every existing destination is preserved unchanged: the vetting status, role and application
  views under their same subject and role ids, `VisitAssessmentView`, `DoctorReviewView`,
  `PatientFileView(viewerId:)`, `ConsultationRecordView(writerId:)`, `CaptureQueueView`,
  `ThusoKitView`, `EarningsView`, `DispatchBoardView`, `VettingConsoleView`, `VettingRenewalsView`,
  `VettingDirectoryView`, `IncidentDetailView`, `SosView`, `TeleconsultView`. The nurse's "waiting
  to send" row is still the first thing on her landing section. The "AI is decision support" line is
  now at the foot of **every** section rather than of one long list.
- `MoreView` opens each workspace with `fullScreenCover(item:)` rather than pushing it under the
  patient's tab bar; `WorkspaceEntry` is the `Identifiable` wrapper for that. Partner now goes
  through the same shell as the other three.

**`apps/ios/MyThuso/Features/OrdersView.swift`** — `FulfilmentQueueView` deleted. Its rows are the
Partner workspace's Orders, Collections and Results sections now; leaving a second copy behind is
how two lists that should agree stop agreeing.

**`apps/ios/MyThuso/Models/CareService.swift`** — `PreviewStore.careArea` and
`PreviewStore.careAreas`. The care area is a preview choice, not a location permission; nothing asks
the device where it is.

### Android

**`apps/android/.../ui/CareScreens.kt`** — `HomeScreen` rewritten to the same shape and the same
order as iOS, split into `HomeGreeting`, `HomeNextVisit`, `HomeBooking`, `HomeShortcuts`,
`HomeResults`, `HomeCarePlan`, `HomeFamily` and `PassportPromo`, with `ContextChip` and `SectionRow`
as the two new shared pieces. The 2-up service grid is gone; the four shortcuts are rows carrying
`service.price` and `service.duration`. The context chips sit in a `FlowRow` so they take a line
each rather than truncating at large font scales, every row is `heightIn(min = 48.dp)`, and every
size is `sp` with an explicit `lineHeight`. The empty state uses `SchedulingData.noUpcoming` /
`noUpcomingDetail`. The search field still writes `store.careQuery` and the shortcut callback still
carries the service — both fixes from `f0b34df` are intact.

**`apps/android/.../ui/AccountScreens.kt`** — `RoadmapScreen` now takes the store and opens with
`HeroCarousel` (pause control and reduced-motion behaviour unchanged, three slides intact).
`WorkspaceScreen` was replaced: `WorkspaceSection`, `workspaceRoles`, `workspaceSections(role)`,
`workspaceUrgency(role)` and `WorkspaceUrgency`, then `WorkspaceScreen(role, section, store, open)`
rendering one section at a time and leading with the urgency strip. The section names and order
match the web's `roleNavigation` and the iOS shell. Every route the old screen opened is still
opened, including all the `Vetting: <id>` and `Apply for vetting: <role>` routes and the label
function that names a party rather than its reference. The two `DetailScreen` branches that used to
render a workspace (`"Partner workspace"` and `title.endsWith("workspace")`) were removed, because
a workspace is now navigation rather than a detail page.

**`apps/android/.../MainActivity.kt`** — holds `workspace` and `section`. While a workspace is open
the bottom bar is that role's sections rather than the patient's tabs, the top bar names the
workspace and offers a labelled way out, and back leaves the workspace. `go()` routes a
`"<Role> workspace"` target into the workspace rather than into a detail page. The home `HeroTexture`
band is 210dp rather than 470dp.

**`apps/android/.../ui/OrderScreens.kt`** — `FulfilmentQueueScreen` deleted, for the same reason as
its iOS counterpart.

**`apps/android/.../model/CareModels.kt`** — `careAreas` and `PreviewStore.careArea`, mirroring iOS.

## What was deliberately not done

- No contract changed, so no generator ran and no generated file moved. The four service shortcuts
  read `price` and `duration` out of the native catalogue, the empty state reads the scheduling
  contract, and the hero slides still read the locale contract — the three things a boundary check
  would otherwise catch.
- `apps/web` is untouched.
- The booking work from `f0b34df` was not revisited: real dates from the device clock, the weekday
  derived from its own date, the duration from the catalogue and the whole choice carried into the
  visit are all as they were.

## Gate

- `npm run check` — pass.
- `MYTHUSO_PORT=5181 npm test` — 152 passed, 2 skipped, exit 0. (`admin-and-session.spec.ts` failed
  once on the first run and passed on two subsequent full runs; it is a web spec on a branch this
  change does not touch.)
- `xcodebuild ... -sdk iphonesimulator build` — BUILD SUCCEEDED.
- `:app:assembleDebug :app:lintDebug` — BUILD SUCCESSFUL, with no new warnings.

I could not capture a simulator or emulator screenshot. `xcrun simctl launch` on the iOS 26.1
iPhone 16e blocked without ever returning, and the Android emulator that was free would not finish
booting; both machines were busy with the other agents' work at the time. The layouts were reasoned
about rather than looked at, which is a weaker check and is worth someone's eyes before this ships.
