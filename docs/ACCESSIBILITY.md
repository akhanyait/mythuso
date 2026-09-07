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

**None of it is built.** There is no interpreter roster, no vetting row for an interpreter — and an
interpreter hears an entire consultation, so there should be one — and no scheduling that can hold a
visit until one is free.

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

### iOS — **not tested**

The screens were read for Dynamic Type hazards — fixed heights on text containers, `lineLimit(1)` on
a label that grows, `.frame(height:)` where `.frame(minHeight:)` belongs — and the ones found were
fixed. No `xcodebuild test` was run: there is no test target in the project, and the accessibility
audit APIs need one. This section says "not tested" rather than "verified" on purpose.

### Android — partly tested

`:app:lintDebug` runs on every build and is configured to fail on the accessibility checks it can
make statically. Touch targets and content descriptions on the newest screens were read by hand. No
instrumented accessibility test runs, and no test has been run on a low-end device.

### Not done at all

Real hardware. A screen reader driven by somebody who uses one. TalkBack, VoiceOver and a
low-end Android device on a slow connection are all still in "Next UI increments", and the
measurements above are not a substitute for any of them.
