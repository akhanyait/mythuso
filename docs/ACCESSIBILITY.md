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
  beside the web's. Three kinds of row — a navigation-bar item, whose height is the bar's rather
  than its own; a Toggle, which publishes the switch's row height and ignores its label; and a
  segmented control, whose 32 points are intrinsic to `UISegmentedControl` — and every one of them
  is a fact about UIKit rather than about this design. They belong in the contract, with a field
  saying which platform each is about. The segmented one has no second route to the four sections
  it switches between, which is a reason to replace the control rather than to keep exempting it.

### Android — partly tested

`:app:lintDebug` runs on every build and is configured to fail on the accessibility checks it can
make statically. Touch targets and content descriptions on the newest screens were read by hand. No
instrumented accessibility test runs, and no test has been run on a low-end device.

### Not done at all

Real hardware. A screen reader driven by somebody who uses one. TalkBack, VoiceOver and a
low-end Android device on a slow connection are all still in "Next UI increments", and the
measurements above are not a substitute for any of them. iOS is measured now, which is a different
claim from "VoiceOver has been used on it": nothing in this repository has ever been listened to.
