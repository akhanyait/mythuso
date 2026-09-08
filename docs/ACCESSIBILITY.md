# Accessibility and language

What MyThuso owes a reader who cannot read the default screen, and how much of it is actually built.
Nothing here is a claim of compliance. Where something is not done, it says so.

The words this document is about are not in it. Every sentence a patient reads about language, the
sign-language accommodation and the clinical language rule lives in
[`packages/catalog/locales.json`](../packages/catalog/locales.json) and is rendered from there on
all three platforms, for the same reason a refusal sentence lives in a contract: a promise quoted in
a document and again in a screen is two promises, and they drift.

## Twelve official languages, eleven of them written

South Africa has eleven written official languages and, since the Constitution Eighteenth Amendment
Act of 2023, South African Sign Language as the twelfth.

The shell — navigation, the tab bar, the greeting, the preview notices and the primary calls to
action — is offered in all eleven written ones. The hero banner and the vetting console are offered
in four. Which sets a locale carries is declared in the contract rather than discovered by a reader
finding an English word in the middle of an isiXhosa screen, and the language dialog says it before
the choice is made.

**Ten of the eleven have not been read by anybody who speaks them.** They were drafted by software.
That is stated on each language's own row in the picker, again as a notice when one is chosen, and
again in full on the *Language & access* screen. The four languages that predate this contract —
isiZulu, Sesotho and Afrikaans — are in exactly the same state as the seven added with it: no review
was ever recorded for them, so none is claimed for them now.

A language may be presented as reviewed only when the contract names the person who read it, the
organisation they read it for, and the day. `scripts/check-boundaries.mjs` fails the build otherwise.
That check is the whole mechanism: without it, "reviewed" is a word anybody can type.

### What a review would involve

A speaker of the language, reading every string in the set, in the screen it appears on rather than
in a spreadsheet — a tab-bar label that is correct and four words long is still wrong. For a health
service the reviewer should be, or should work with, somebody who has explained a diagnosis in that
language. The output is a name, an organisation and a date in the contract, and the state changes
from `machine-drafted` to `human-reviewed`.

## Clinical wording stays in English

A reference range, a dose, an observation label and a refusal sentence out of a clinical contract are
rendered in English in every locale until a clinician who reads the language has reviewed them.

This is structural rather than a rule somebody has to remember:

- There is no clinical key in the locale contract. A translator has nothing to fill in, and a screen
  has nothing to render, so the mistake cannot be made by forgetting.
- `clinicalLocale()` exists on all three platforms — TypeScript, Swift and Kotlin — and returns
  `en-ZA` for every locale whose clinical review is not complete. It is generated, not typed.
- The build fails if any string in the locale contract matches a sentence held in a clinical
  contract, so a refusal sentence cannot be smuggled into the locale table.
- The build fails if a locale claims a completed clinical review without naming the clinician, their
  registration number and the date.

The uncomfortable half is said on the screen too: a health instruction nobody has checked is not made
safer by being in your language.

## South African Sign Language

SASL is an official language and a visual one. It has its own grammar and no written form, so it is
not a language the interface can be translated into — a toggle that changes nothing on the screen
would be a claim of access rather than access. It is offered as a **communication requirement on the
account** instead, and the written language stays a separate choice, because a Deaf South African
reads a written language too and it is not English by default.

What a visit and a call owe a Deaf patient, and the six things that must never happen — a family
member used as the interpreter for a clinical conversation, a patient written to in English and
assumed to have understood, and four others — are in the contract and rendered on the *Language &
access* screen. They are not restated here.

The mechanism is the one the teleconsultation roster already has. An interpreter is a named
participant on that roster, consented to separately, bound by the same confidentiality as the
clinicians and removable mid-call at a stated cost. The accommodation makes that participant
essential rather than inventing a second, quieter way to add somebody who can hear the whole
consultation.

The arrangements are built now, from `packages/catalog/interpreting.json`, on all three platforms.
An interpreter is the thirteenth vetted party and is granted one thing; a roster carries free hours
rather than conclusions; a visit that needs an interpreter and has not got one is held rather than
dispatched; a wait nobody can work out says so instead of showing a number, under the same rule
`packages/catalog/sos.json` holds an ambulance's arrival to; cancelling that wait is free and is
recorded against MyThuso; and withdrawing the interpreter mid-call ends the consultation rather
than continuing it. `scripts/check-boundaries.mjs` fails the build on twenty-two ways of undoing any
of that.

**What has not happened is the part that matters most here.** No Deaf South African and no qualified
interpreter has read any of it. The accreditation route — SATI's accreditation examination — is
drafted and unconfirmed with SATI, DeafSA or PanSALB, and if it is the wrong body then the check
hanging off it is the wrong check; the app says so on the screen rather than only in this file. The
three modes and their scarcity are an engineer's guess at how SASL interpreting is actually arranged
in South Africa. And nothing contacts an interpreter, holds a real visit or books anybody's time.

## Large text, screen readers and low-end devices

### Web — tested

`tests/accessibility.spec.ts` runs the patient shell, the emergency pathway, the nurse assessment and
the language screens on both Playwright viewports and asserts, by measurement rather than by eye:

- no horizontal overflow at a 320 px viewport, which is narrower than any phone still sold and is
  what a 390 px phone at 125 % text size behaves like;
- no horizontal overflow with the layout viewport halved, which is what 200 % browser zoom does to a
  page;
- no interactive control smaller than 44×44 CSS pixels;
- no rendered text below the minimum body size in `packages/design-tokens/tokens.json`.

### Colour — tested

`scripts/check-boundaries.mjs` computes the WCAG 2.2 contrast ratio for every foreground/background
pair the design actually uses, from `packages/design-tokens/tokens.json`, and fails the build below
the threshold each pair declares. Computed, not eyeballed. The pairs and their thresholds are in the
token file, so adding a colour combination to the design means declaring what it has to clear.

### iOS — tested

`apps/ios/MyThusoUITests` is an XCUITest target in `MyThuso.xcodeproj`, and

```
xcodebuild test -project apps/ios/MyThuso.xcodeproj -scheme MyThuso \
  -destination 'platform=iOS Simulator,name=iPhone 16e'
```

runs it — add `,OS=<version>` or use the simulator's udid if the model you name exists only on an
older runtime, because a destination without one means "latest" and fails to find a device before it
reaches the project. The `ios` job in `.github/workflows/ui-quality.yml` runs it on every push as
well, on whichever iPhone simulator the macOS runner happens to have, because a test target nobody
runs is the same gap one level up. XCTest and XCUITest are Apple's own; no dependency was added.

Five tests. What each measures, and where each is the question the web spec already asks:

- **Three screens at both ends of the content-size scale.** The home, the booking flow and the
  Health Passport are driven at the default content size and again at
  `UICTContentSizeCategoryAccessibilityXXXL` — the largest iOS offers, a little over three times the
  default body size — and each is walked to the bottom of its own content, measured at every resting
  position on the way. Both sizes, and neither is optional: the largest is where text runs off the
  side of a phone, the default is where a control is at its smallest, and the first version of this
  suite ran only at the top of the scale and passed a fifteen-point tap target because at three
  times the type it had grown into a legal one. It is the same reason `accessibility.spec.ts` runs
  at 320 px *and* at the configured viewport.
- **No control under 44×44 points**, which is Apple's own floor and, as it happens, the number
  `packages/design-tokens/tokens.json` holds for the web. Two controls cannot reach it and are
  declared in `Audit.knownUndersized` with what they measure and why — and, exactly as on the web,
  an exemption is never permission to go under the 24×24 that WCAG 2.2 SC 2.5.8 requires at AA.
- **A label on every control**, and nothing decorative announced: no image reaching the tree under
  its own asset file name, and no SF Symbol sitting outside every control as an element of its own.
- **Nothing pushed past the trailing edge** of the window, and every control laid out clear of the
  bars actually tappable rather than merely positioned there.
- **Content reachable by scrolling.** At the largest content size the home is nine screenfuls long;
  the test asserts the last control on it was reached and could be tapped.
- **Every string answers the setting.** The same screen measured at both sizes, and any string that
  came back the same height ignored Dynamic Type — with a floor at the top of the scale as well, for
  strings that truncate at one size and so cannot be paired across the two.
- **The booking journey end to end**, which is the one with real arithmetic behind it. It picks a
  date and a time, confirms, and reads back what came out: each chip's weekday is checked against
  the date it names by asking Foundation's calendar rather than the app, the chips are consecutive
  days and all of them in the future, the visit ends its own service's length after it starts rather
  than a flat hour, and the date, the hours and the length all survive from the picker to the review
  to the visit list and to the visit's own screen. That defect was real, was fixed in `f0b34df` on
  all three platforms, and this is what stops it coming back on iOS.

#### What the tests found that reading the screens had not

- **Every point size in the iOS design system ignored Dynamic Type.** `Font.system(size:)` is that
  many points at every content size, including the one somebody chose because they cannot read the
  default. At the largest size the headings had tripled and the status pills, the menu rows, the
  step counter, the card titles and the review rows were still eleven, fifteen and seventeen points.
  Fifty-seven of them — in `Theme.swift`, `ClinicalChart.swift`, `SystemStates.swift`,
  `BookingView.swift` and `PassportView.swift` — now go through `thusoFont`, which multiplies the
  point size from the type scale by the reader's own scale factor and is exactly one at the default
  size, so nothing about the design moved. This is the finding that mattered most and it is exactly
  the kind reading cannot make: a screen where half the type grew and half did not looks like a
  layout decision.
- **Ten controls under 44 points**, eight fixed and two written down. Nine of the ten were visible
  only at the **default** content size, where a control is at its smallest and the first version of
  this suite was not looking: the "see all" links in the home's section headers, the first-run link
  at the foot of it, the search field inside its own 52-point capsule (286×22 — and a tap that
  landed in the capsule rather than on the letters used to do nothing at all), the *Change* link on
  the last screen before a booking is confirmed (48×15), the disclosure that opens a chart's
  readings as a table (318×22), and the switch beside the preview consent (354×34). The last of
  those and the notification bell in the toolbar (43×35) are the two that could not be fixed: a
  navigation-bar item is the height of the bar's content rather than the height its view asks for,
  and a Toggle publishes the switch's own row height whatever is done to its label. Both are
  declared, with what they measure and why, and both clear the AA floor.
- **Decorative symbols announced as elements of their own** — a chart's icon, the tile icon that is
  the repeating unit of the whole design, the chevrons, and the magnifying glass beside a field
  already labelled "Search for care". Each is a picture of what the row beside it already says, and
  they are hidden from VoiceOver now rather than read out. In fairness, the magnifying glass came
  out of reading the element tree the test collects rather than out of a failure: the check only
  looked for symbol names with a dot in them, and `magnifyingglass` has none. It looks for any
  system symbol outside a control now, and would catch it.

#### What is still not measured on iOS

- **Truncation.** A SwiftUI `Text` clipped on screen still hands its whole string to the
  accessibility tree, so no test can see the ellipsis. What is asserted instead is that nothing is
  pushed past the edge of the window; text visually clipped inside its own row, with its label
  intact, would pass. This is a real hole and it is the one a screenshot would catch.
- **Three screens.** The nurse assessment, the vetting console, the dispensing and programme screens
  and the four workspaces are not audited, and between them they hold most of the roughly 330 fixed
  point sizes that were left alone.
- **One simulator, one size.** iPhone 16e at 390×844. No iPad, no smaller phone, no real device.
- **VoiceOver itself.** XCUITest reads a tree close to VoiceOver's and not the same as it: it sees
  elements a screen reader never reaches, and it cannot hear reading order, rotor behaviour, or
  whether a sentence makes sense out loud.
- **The exemption list lives in the test file** rather than in `packages/design-tokens/tokens.json`
  beside the web's. Two kinds of row — a navigation-bar item, whose height is the bar's rather than
  its own, and a Toggle, which publishes the switch's row height and ignores its label — and both
  are facts about UIKit rather than about this design. They belong in the contract, with a field
  saying which platform each is about. The third kind is gone: the Health Passport's four sections
  were a segmented control whose 32 points are intrinsic to `UISegmentedControl`, and with no second
  route to what they switch between the exemption was standing in front of the only way in, so the
  control was replaced with pills built out of buttons that measure 44 and the four rows were
  deleted rather than kept green.

### Android — measured

`:app:lintDebug` runs on every build and is configured to fail on the accessibility checks it can
make statically, which is not many: most of these screens are Compose and Compose accessibility is
largely beyond what static analysis sees. Everything else used to be read by hand. It is measured
now, by `:app:connectedDebugAndroidTest` — five instrumented tests in
`apps/android/app/src/androidTest/`, the Android half of what
`apps/ios/MyThusoUITests/` does on iOS and asking deliberately the same questions.

#### What is asserted

- **Every control is at least 48dp**, which is Material's minimum and the number `ui/Theme.kt`
  already holds in `TouchTarget` — four larger than Apple's 44, because it is the platform's own
  figure rather than a copy of a token. A target is the larger of two measurements: the box the
  control drew, and the space its layout node reserved. That distinction is the whole check.
  `Modifier.minimumInteractiveComponentSize()` genuinely reserves 48dp around a Checkbox that draws
  24, so the reserved size is the honest number for a Material control; a bare `Modifier.clickable`
  reserves nothing, so the drawn size is the honest number for that. Compose's own
  `touchBoundsInRoot` is *not* used and the reason is worth writing down: Compose applies 48dp of
  hit slop to every pointer node, so a 20dp clickable Box reports touch bounds of 48x48 and a check
  written on it can never fail.
- **Every string answers the font-size setting**, asked twice and of two different things. The
  letters: `SemanticsActions.GetTextLayoutResult` hands back the resolved `TextStyle` and the
  density it was resolved against, so the size the text was actually set in is read in dp rather
  than inferred. The box: its laid-out height, for a `Modifier.height` that will not let willing
  text grow. Neither question finds the other's failure and the app was broken both ways in turn to
  prove it. The threshold is 1.2 rather than iOS's 1.5, because Android's font-scale curve is
  non-linear — at 2.0 a 13sp caption grows about 1.85 times and a 28sp headline about 1.33.
- **No string is squeezed out of its row.** This is the shape of failure that belongs to this
  platform the way clipped-but-labelled text belongs to iOS. A `Row` measures its unweighted
  children against the whole width and gives the weighted one what is left, so at the largest font
  scale a weighted label can be handed nothing at all: zero dp wide, not truncated, not ellipsised,
  simply not drawn.
- **No control is nameless and no description is a file name.** Every drawable the app ships is read
  off the generated `R` class rather than typed, so a picture added tomorrow is covered without
  anybody remembering to add it.
- **The booking journey end to end**, which is the one with real arithmetic behind it. It reads each
  date chip's label, parses it with `java.time` and asks the calendar whether the weekday it claims
  is the weekday its own date falls on; that the days are consecutive and all in the future; that
  the visit ends its own service's length after it starts rather than a flat hour; and that the
  date, the hours and the length survive from the picker to the review to the visit list and to the
  card the home leads with. That defect was real, was fixed in `f0b34df` on all three platforms, and
  this is what stops it coming back on Android.

The font scale is set through the shell — `settings put system font_scale` — with the activity
relaunched around it, and the device's own setting read first and put back after. Providing
`LocalDensity` over the composition was tried and is wrong in a way that matters: a CompositionLocal
cannot cross a window, `AlertDialog` opens one, and the whole booking flow is a dialog. The screen
with the arithmetic and the consent on it was the one screen the cheap technique could not measure,
and it reported sixteen frozen strings that were a hole in the harness rather than a defect.

#### What the tests found that reading the screens had not

- **A unit that disappears.** `ClinicalChart` drew the latest reading, its unit and the change since
  the first reading in one `Row`, with the unit carrying `Modifier.weight(1f)`. At the largest font
  scale the other two took the row and the unit was given zero dp: "136" with no `mmHg` after it, on
  the screen that holds a person's blood pressure. A reading without its unit is not a smaller
  version of the reading, it is a different claim. It is a `FlowRow` now, with the number and its
  unit held together inside it and the change-since line the thing that drops to its own line.
- **A field name that disappears.** `ReviewLine` had the weight on the label and not on the value,
  so on the last screen before a visit is booked "Wednesday, 9 September 2026" took the whole row
  and the word "Date" was not drawn. The weight is on the value now; at the default scale the row
  looks exactly as it did.
- **A consent checkbox with no name.** The review's "I understand this is a UI preview using
  fictional information." was a bare `Checkbox` beside a separate `Text`, which TalkBack reads as
  "not checked, checkbox" with nothing to say what is being agreed to — and what is being agreed to
  here is that none of this is real. The row owns the toggle semantics now and the sentence is its
  name, which is the shape `Setting` in `Components.kt` already used.
- **A 42dp disclosure.** The "Preview states" row that opens the loading, empty, offline and denied
  states measured 42dp collapsed, under both Material's floor and this project's own `TouchTarget`.
  Nothing else on those screens duplicates it.

No control needed an exemption: `Audit.knownUndersized` exists, with the same shape as the iOS
list — a name, a measured number and a sentence saying what was tried — and it is empty.

#### What is still not measured on Android

- **Four screens.** The home, the booking review, the visit list and the Health Passport. The nurse
  assessment, the vetting console, the capture queue and the four workspaces are not audited.
- **One emulator, one size.** A Pixel 3a at 1080x2220, API 32. No tablet, no small phone, no real
  device, and nothing on a low-end one.
- **Reading order and focus.** The Compose semantics tree is what TalkBack is built from and is not
  what TalkBack reads. Nothing here can hear the order things are announced in, whether a merged
  card's sentence makes sense out loud, or how focus moves.
- **TalkBack itself.** Nothing in this repository has ever been listened to.

### Not done at all

Real hardware. A screen reader driven by somebody who uses one. TalkBack, VoiceOver and a
low-end Android device on a slow connection are all still in "Next UI increments", and the
measurements above are not a substitute for any of them. iOS and Android are both measured now,
which is a different claim from "a screen reader has been used on them": nothing in this repository
has ever been listened to.
