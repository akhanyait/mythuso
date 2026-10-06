# What is left to build

Written 9 September 2026, from `packages/catalog/capabilities.json`, `docs/FLOW-COMPLETENESS.md`
(all 96 journeys walked in a browser), `services.json` and `business-model.json`. Nothing here is
estimated from memory.

Two lists. **Outstanding** is work the product already implies and has not finished. **Recommended**
is work nobody has asked for and I think is worth doing. They are kept apart on purpose — the second
list is opinion and should be read as such.

---

## The one fact that shapes everything

**Twenty-three capabilities. None is connected.** Every screen in MyThuso draws real arithmetic over
sample data and says so. That is deliberate and it is the right state for a product seeking funding
rather than patients. But it means "what is left to build" is mostly not screens — it is the
integrations underneath them, and each one is a contract, a vendor or an accreditation before it is
a line of code.

| Capability                | What is actually blocking it                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `accounts`                | An SMS provider for one-time codes                               |
| `booking`                 | A nurse roster with real availability                            |
| `payments`                | A South African payment provider, contracted                     |
| `payouts`                 | The same provider, plus bank verification                        |
| `credential-verification` | Agreements with thirteen separate authorities                    |
| `dispatch`                | Live positions from nurse devices                                |
| `clinical-records`        | The controls in `docs/PRIVACY-AND-SECURITY.md`                   |
| `teleconsultation`        | A media stack; no camera or microphone is declared on either app |
| `screening`               | No model, no vendor, no licence                                  |
| `voice`                   | The same, plus a POPIA answer for recording a symptom            |
| `devices`                 | No device is contacted; no Bluetooth or eSIM permission declared |
| `dispensing`              | A contracted pharmacy network                                    |
| `interpreting`            | No interpreter is contacted                                      |
| `messaging`               | No SMS, email or push provider                                   |
| `emergency`               | No contracted ambulance partner                                  |

**The cheapest three to connect, in order:** `messaging` and `accounts` share one provider and one
decision. `payments` is a single South African integration and unlocks `payouts`. Those three turn
the most screens from drawings into a product.

### The seams are built. The suppliers are not

Written 10 September 2026. Nobody can sign a contract from inside a repository, so none of the above
moved. What did land is the shape of each hole: `packages/catalog/feeds.json` describes **eleven
feed seams**, one per supplier that would have to be signed, and `apps/api/src/feeds/**` serves a
route for each of them that **refuses every payload, including a well-formed one**, answering with the
capability's own not-connected sentence. Every capability is either served by a seam or carries a
written reason there is none — `voice`, `devices` and `clinical-records`, each for a different reason.

What that changes about the table above is the size of the job. Connecting a supplier should now be a
data change and a small adapter: the schema is agreed, the refusals are written down, the tests are
green, and what is missing is the vendor rather than the code. It should also be a slightly _harder_
decision than it was, and deliberately — a capability may no longer be marked `connected` while any
of the conditions its seam wrote down is unmet, which for `dispatch` means a position feed carrying
the accuracy the device reported, and for `credential-verification` means an authority's answer
naming which check it answers.

The three things it is worth reading before signing anybody: **what each feed must never accept**,
which is the half of the work that will matter on the day a vendor sends more than was asked for;
**what must be true before the switch is thrown**, which is the specific list somebody would
otherwise satisfy in their head; and the **section 72 determination** each supplier will owe, which
is recorded against each of the eleven as undetermined and which no code can answer.

---

## Outstanding — work the product already implies

### 1. Blocking, and visible in the first five minutes

**One is left of the seven.** The other six are closed and held by tests, and this section said
otherwise until 10 September, which is the drift it exists to prevent: a past visit opens and
rebooks, a cancelled one shows its reason and which side of the window it fell on, the trends screen
draws every reading against the contract's ranges, a family member's profile shows their visits and
books for them, and the two rows below had been fixed and left written down as open.

- **`emergency` has no partner and the SOS screen says so** — but the escalation path from a nurse
  in a house to an ambulance is the single most consequential unfinished journey in the product, and
  it is the only one of the seven still open.

Closed, and named here so they are not built twice:

- ~~The Health Passport has no device permission screen.~~ _Review permission_ is **gone**, not
  wired: it sat on the denied block, opened nothing, and flipped the screen's own state to ready. A
  control that appears to grant a permission and grants none is worse than no control. The three
  cards saying what each device would read sit under the notice instead of behind it, so reviewing
  one is a single press. Held by `tests/patient-screens.spec.ts`, which asserts the button is
  absent.
- ~~"Chat to our care team" opens a booking.~~ Closed 9 September, and it was the file's only
  _blocking_ row. It is not a chat — `messaging` is not connected and a window with a fictional
  agent in it is the same defect in better clothes. It is a screen that says what a care team would
  do and hands over to the three things that exist. Held by `tests/flow-closures.spec.ts`.

### 2. Structural, and invisible until it bites

- **The native apps have not had the glass pass.** iOS and Android build green and carry the new
  palette, but not the shapes. Three apps that look like relatives rather than one product. Six iOS
  clinical screens came off `Form` and `List` on 10 September and were looked at, at both the default
  content size and AccessibilityXXXL, from the test run's own attachments — so those six are the
  shapes, not the palette. The rest of both apps is not.
- **The quarantines are down to two, and both of them retire themselves.** Four iOS copies and two
  Android ones adopted their contracts on 10 September; what is left is `CaptureQueue.kt` and the
  web's `VisitQueue.tsx`. The figure ratchet is down from twenty-four typed figures to four, all of
  them blessed with a reason, because the Android workspace strip now counts every one of its twenty
  from the rows underneath it. Three of the four lies that check was written for lived in that one
  function.
- **`FileBook.refusalFor()` in `CaptureQueue.kt` still hand-writes two disk-full sentences.** They
  belong in `capture.json` under `durability`, beside `stores`, as a `refusals` list: one for a phone
  with no room, which is the nurse's to fix and worth telling her how, and one for a disk that
  refused and did not say why, which is not hers and must not send her looking for space she has.
  Both must keep the clause saying the work is _not_ on the disk — `LedgerStorageFailureTests`
  asserts on those words and that assertion is the point. The quarantine sentence has three callers
  and three wordings on one platform already, and iOS has the same seam with no sentences at all,
  which is the second reason it wants a contract rather than a third copy.
- **A cleared typed reading leaves an orphan on Android.** Type a value, record the findings, go back
  and clear the field: the reading stays `CAPTURED`, is no longer named by the part, and still counts
  in "readings waiting". It is visible on the kit queue and can be withdrawn there. Inventing a
  delete in a module whose whole ethic is that nothing deletes a reading was the wrong reflex, but a
  nurse would notice the count.
- **Three money formatters in `apps/android`, one currency.** `EarningsScreens.rand`,
  `ProgrammeScreens.randAmount` and `Records.rands` disagree about spacing. `ThusoSpacing` also has
  no width scale, so a metric card's minimum width is currently a viewport floor doing a component's
  job.
- **The web's doctor strip is still literal** — `apps/web/src/shells/StaffShell.tsx` types three
  figures and the nurse row's earnings. Android derives all four now and the web does not.
- **The controls in `docs/PRIVACY-AND-SECURITY.md` are more of them than they were.** The document
  audits its own twenty-seven rows: twelve are now implemented, five partial and six absent, up from
  six, four and twelve — and the remaining four are none of the three and say so in their own rows.
  This paragraph said twenty-six and eleven until 10 September, one revision behind the document it
  is summarising, which is the reason a summary should name its source and be checked against it. The gate and the vetting vault are no longer libraries with test suites —
  nine routes reach them, and the actor comes off the session rather than off the request, which was
  the reason they had none. Export, correction, the section 24 queue and a security compromise
  register landed with them, and the unlimited write routes now carry a caller limit whose number is
  labelled a proposal — and which can now actually be measured, from a table of five integers per
  fifteen minutes with nobody in it. Two of the six absent controls were looked at again on 10
  September: **HSM or KMS stays absent on purpose** (split custody on a single box is a longer way of
  not splitting a key), and **publishing the chain head stays absent** while the half of it that is
  not an agreement — taking a published head back and asking whether this is still that chain — is
  built and tested. **What is left needs a person or a contract, not a programmer:** the clinical
  access log's `open()` is waiting for a record to open, offline capture for a device this service
  can identify rather than be told about, and the remaining nine absent controls each name a vendor,
  a key ceremony, an agreement, or a fact about a person that no code can establish.

### 3. Recorded gaps that need a person, not a programmer

These are in `docs/` already and are listed here so they are not lost:

- Ten of the eleven languages are machine-drafted and unreviewed by a speaker.
- The SASL accreditation route is drafted against SATI and unconfirmed.
- Substitution classes need a pharmacist to sign them off.
- The employer suppression floor needs an Information Officer.
- **The late-cancellation charge is undecided** and `cancellation.json` refuses to state one.
- No VoiceOver or real-hardware testing has been done on either native app. XCUITest's snapshot
  reports five loose SF Symbols on the iOS screens swept on 10 September; folding a symbol into the
  label beside it does not remove it from that tree, so only VoiceOver can settle whether they are
  read out. `ThusoSwitchStyle` may also have moved the identity switch's trait from switch to button,
  which is the same question and the same answer.
- **HSTS is live at `max-age=300`, and raising it is a decision nobody has taken.** The header was
  verified on 10 September arriving on both `mythuso.co.za` and `www.`, in the block certbot writes,
  with plain http still redirecting. Five minutes is HSTS with the irreversibility removed, which is
  what made it safe to switch on unattended; it is not yet HSTS doing anything. Raising it to two
  years is one line in `deploy/nginx/mythuso.conf` and a redeploy, and it cannot be taken back from a
  browser that heard it, which is why it is on this list rather than done.

---

## Recommended — not asked for, worth doing

Ordered by what I would build first.

> **Annotated 6 October 2026 — all seven of the recommendations below have since been built.** Two
> of them (2 and 5) were already struck through by whoever built them; the other five are annotated
> here, each with what was checked and where. Nothing is deleted, because a recommendation list that
> quietly loses the ones somebody took is a list nobody can audit — that is the reason item 5 gives
> for keeping itself struck through, and the same reason applies to the five. Where a thing is built
> on some platforms and not others the annotation says so rather than rounding it up to "built": item
> 3 is the clearest case, and its web queue is genuinely weaker than the two phones'. What is *not*
> annotated is whether any of it is accepted — gate G15 and the rest of the open gates are recorded in
> their own sections, and a screen existing is not a control being signed off.

### 1. ~~Arrival tracking, for the patient~~ — built

> **Built, and checked on 6 October 2026.** `apps/web/src/features/Arrival.tsx` opens with the same
> sentence this recommendation was written around — *"Where is she now"* — and says what it refuses:
> the figure is labelled "Straight line" before the reader reaches it, the map draws the same dashed
> line rather than a road, and the arithmetic comes from `apps/web/src/lib/arrival.ts` with its own
> `arrivalRefusals()` and precision sentence. The reason it is honest rather than merely built is
> that it is mostly a screen with nothing to show: on most days there is no arrival to track, and
> that state was designed for rather than fallen into.

The one thing a person waiting at home actually wants, and the product currently cannot answer:
_where is she now._ `dispatch` already carries real coordinates and arrival estimates; the map
already draws them for the Control Tower. The patient sees none of it. This is mostly plumbing an
existing capability to a second audience, and it is the feature most likely to be described to a
friend.

### 2. ~~A visit summary a patient can act on~~ — built

What was measured, what was in range, what the doctor said, and one button that rebooks with the
same patient chosen. `tests/patient-screens.spec.ts` holds it.

### 3. ~~Offline capture for the nurse~~ — built on both phones; the web queue is memory-only, and that is a rule, not an omission

> **Checked on 6 October 2026, and the honest answer is three answers rather than one.** The
> readings always had a queue; what was missing was the rest of the visit, and that is what was
> built. `apps/ios/MyThuso/Features/VisitQueueView.swift` holds the whole visit — the code checked at
> the door, the consent read aloud, what she found, her signature — in a JSON file in Application
> Support, and `apps/android/.../model/VisitQueue.kt` holds the same in the app's own private
> storage, its header naming the case this recommendation was written for: a nurse in a house in
> Ivory Park with one bar, whose assessment lived in `remember {}` and therefore nowhere.
> `packages/catalog/capture.json`'s `durability.stores` is where the three platforms are finally
> compared against each other rather than described three times in prose, and `rules.queuedIsNotLost`
> is the promise it holds them to.
>
> **The web queue is genuinely weaker and must not be counted as built.** Its store is
> `web-in-memory`: a module-level array in the open tab, which survives navigation and is lost to a
> reload, a crash, a sign-out and everything after. That is not a gap somebody missed —
> `scripts/check-boundaries.mjs` forbids `localStorage`, `sessionStorage` and IndexedDB across
> `apps/web/src`, because a preview must not leave a patient's readings on a borrowed machine. The
> contract holds both the behaviour and what the screen says about it, so the limit is on the screen
> rather than discovered by the nurse. **The recommendation as written — a nurse in Soweto with one
> bar cannot lose an assessment — is met by the two phones, which is what the nurse carries.**

A nurse in a house in Soweto with one bar cannot lose an assessment. The kit capture flow already
has an offline queue; the rest of the clinical capture does not. This is a working-conditions
feature and it is the kind of thing that decides whether nurses stay.

### 4. ~~A sponsor's view~~ — built

> **Built, and checked on 6 October 2026.** `apps/web/src/features/Sponsor.tsx` exists, and the
> part of it worth noting is that it did not simply render the sponsor's statement: it puts what you
> see and what you never see in two columns of equal weight, because a screen that lists four things
> a sponsor is shown and then mentions in grey that the clinical record is off limits has ordered
> those two facts by how comfortable they are. The recipient's switch on whether the statement names
> the service appears as a fact and not as a control — it is hers to set from her own account, and a
> disabled toggle would have been worse than none, since it says she can change something she cannot.
> `apps/web/src/features/Programmes.tsx` carries the sponsor's statement beside it. The second
> revenue line in the proposal has a screen.

`business-model.json` already has sponsored care and the family screens already show "Sponsored
care" as a state. Nobody can see what they are paying for. This is the second revenue line in the
proposal and it has no screen at all.

### 5. ~~Nurse earnings forecasting~~ — built

_If you take a shift_ sits above the nurse's weeks and answers what one is worth before she commits
to it. Kept here struck through rather than deleted, because a recommendation list that quietly
loses the ones somebody took is a list nobody can audit.

### 6. ~~An "explain this to me" layer on the Health Passport~~ — built, as prose, and reviewed by nobody yet

> **Built, and checked on 6 October 2026 — including the part that must not be overstated.** The
> seven explanations (systolic, diastolic, pulse, respiratory, temperature, oxygen, glucose) live in
> `packages/catalog/records.json` under `explanations`, generated into `RecordsData.swift` and
> `RecordsData.kt`, and `scripts/check-boundaries.mjs` refuses any of those sentences as a literal in
> hand-written source on any of the three platforms — the three typed copies this recommendation
> predate were the reason the words moved into the contract. `apps/web/src/lib/explain.ts` keeps only
> the reasoning, and its own header says why the layer is prose and not a model: a written
> explanation cannot see your record, cannot personalise itself, cannot be confidently wrong in a new
> way for each reader, and can be read in full by a clinician before it ships. **That last clause is
> the gap.** The header says the words are "reviewed by nobody yet", and nothing here changes that:
> the layer exists, is sourced, is non-AI exactly as recommended, and is awaiting the clinical review
> that would let anybody say it is safe rather than merely written.

Reference ranges are already rendered — and, since the move into `packages/catalog/records.json`,
rendered from one place on all three platforms. What a reading _means_ is not. This is where `screening`
will eventually live, and a written, sourced, non-AI version of it could exist now — and would be
more defensible than the model that replaces it.

### 7. ~~A public status page~~ — built, and it says none of them are running

> **Built, and checked on 6 October 2026.** `apps/web/status.html` is its own entry, served at
> `/status/`, drawing `packages/catalog/capabilities.json` through `src/status.ts` with no framework
> behind it at all — which was the point of keeping it separate, since it is the page somebody opens
> when they suspect nothing works, as likely on a metered connection in a car park as at a desk. The
> recommendation's condition was "when the identity service, payments and dispatch do come up"; the
> page did not wait for them and instead answers the question in the negative today: **23
> capabilities, and `connected: true` on none of them**, each with what stands in its way and the
> sentence a person is shown while it is not. That is the honest reading of this recommendation being
> struck through — the page exists, and what it says is that there is nothing yet to report as
> running.

When the identity service, payments and dispatch do come up, something should say which are
running. The capability contract is already exactly this data.

---

## Founder-requested — one GilbertOne, decided 19 September 2026

The founder asked for the sphere to be replaced by the robot rig as **one assistant across the
product**, behaving differently for a patient, a nurse and a doctor according to their scopes, and
answering general MyThuso questions when nobody is signed in. He asked for it to be expressive and
interactive.

Three decisions were taken the same day, and they are what makes this buildable inside the contract
rather than around it:

- **Affect is deterministic, derived from the answer kind.** No model, no network. This keeps the
  work inside the refusal about anything AI-facing below, rather than needing that refusal lifted.
- **Roles are demo-scoped and labelled simulated**, because the `?role=` parameter authenticates
  nobody — `capabilities.json`'s `accounts` entry says so verbatim — and the identity service is off
  in production.
- **Speech is built behind a contract flag, off**, so the decision to let GilbertOne speak to a
  patient is taken after hearing it rather than in hope.

### Phase 1 — the rig on the live assistant

Supersedes draft PR #5, which is conflicting and touches four files that commit `425fa45` also
touched. PR #5 deletes `AssistantSphere.tsx` and about 200 lines of `.orb` CSS but does not update
`tests/assistant.spec.ts`, which carries 28 assertions on the orb across 18 `locator('.orb')` calls.
Those have to be re-expressed against the rig's DOM, not deleted to make the suite pass.

Built and merely unwired: `GilbertAvatar.tsx` (254 lines) with a ten-channel pose
(`lib/gilbertone.ts:53-72`), nine mouth shapes, 220ms blending, reduced-motion that applies a cue's
still frame and refuses blink and yawn outright (`gilbertone.ts:666-668`), and `RigBoundary`
(`GilbertWidget.tsx:67-82`) which renders `GilbertStill` rather than a blank circle when the rig
throws. Priority and cancellation are real: safety outranks error, interrupt, activity, gesture and
idle in that order (`gilbertone.ts:95`), and a stale turn id is refused before anything draws (`:655`).

The work is the seam, not the character. The live assistant speaks `depth` and `pulse`
(`AssistantSphere.tsx:121`, `PulseId` at `lib/assistant.ts:44`); the rig speaks cues. `depth` is only
a rim-light gradient (`assistant.css:26-28`) and can go; `gatheredAt` maps to A09's nod. The rig
needs a readable state surface — a `data-affect` or `data-cue` attribute — so tests assert what the
face means instead of measuring pixels.

The risk item is the phone layout. The identity sphere came down to 100px specifically to pay for the
pre-tap voice disclosure, and the conversation floors in `tests/assistant.spec.ts` are 220, 50, 210
and 130px. The rig's head is a different height, so those numbers are unknown until it is on the
screen. They may pass with room or fail outright, and the disclosure must not be what gets cut.

Two registers stay separate: `voice.webSentences` for a patient and `voice.webPoc.sentences` for the
demonstrator. One character is not one script, because a page that says this is a demonstration to a
patient is describing the wrong thing.

### Phase 2 — affect

There is no affect channel today. `Pose` and `RigState` carry no emotion, mood or affect field, and
`gilbertone.ts:22` states the reason: no model, no network, no conversation state. The warm and flat
mouth shapes exist only inside whole cues, and channels cannot be set independently because the
reducer is the sole writer (`:17-19`).

Seventeen cues exist, A01 to A17, and A07 was never built. The widget consumes six of them
(`GilbertWidget.tsx:104,137,153,165,209,273`). A02, A03, A06 and A08 to A14 and A16 are reachable
only from the demonstrator's control panel (`GilbertOneDemo.tsx:147-163`), which makes them demo
furniture rather than product behaviour. A16 is urgent support and nothing derives it from an actual
emergency.

So: a dated affect section in `packages/catalog/assistant.json` mapping each answer kind to a cue and
a posture — emergency to A16, refusal to flat, routine to warm, unmatched to concerned — and the
dormant cues wired to conversation state.

The invariant that outranks the rest, and belongs in `scripts/check-boundaries.mjs`: **affect may
never soften a refusal or an emergency.** A warm mouth on a chest-pain answer is precisely the
failure `capabilities.json`'s `neverSoften` was written to prevent, and on a health product it is the
kind of wrong that gets believed. The cue priority already refuses to let a gesture displace a safety
track; it simply has nothing to order yet.

### Phase 3 — audience

Nothing is role-aware anywhere. `evaluateMessage(input: string)` takes one string
(`packages/gilbertone/src/engine.ts:203`); `PanelProps` is `{ open, dismiss, openModal, visit }` with
no role (`Assistant.tsx:26`); the subject is the literal `subject-this-session` (`:28`) and the
handover hardcodes `actorRole: 'patient'` (`:87`); `assistant.json` has zero role, audience or
recipient keys and its nine refusals are audience-blind; the gate's GilbertOne block
(`check-boundaries.mjs:6237-6402`) has zero role checks. The assistant mounts in the patient shell
only, and `App.tsx:210-213` withholds it from the clinical workspaces until the assistant's scope
says what a nurse or a doctor could ask it.

`RoleId` already has six values including doctor (`lib/roles.ts:37,68-69`), so the vocabulary exists.
What is needed is an audience parameter through the engine and `lib/assistant.ts`'s `send()`,
audience-tagged questions and per-audience refusals in the contract — a nurse asking for a dose and a
patient asking for one are different refusals — the launcher mounted in `StaffShell.tsx` and
`AdminShell.tsx`, and the simulated label rendered from the contract rather than typed onto a layout.

The hidden cost is parity: the three-platform matcher lists at `check-boundaries.mjs:6367-6369` and
`:6386-6393` must carry the audience dimension, or iOS and Android diverge silently. That is the same
shape of drift that let a microphone reach a patient page ahead of its paperwork.

Blocked externally, and no code fixes it: a truthful signed-in role. `auth.ts:44` returns id, phone
and name and no role even when the identity service runs, the `/api/` block is commented out at
`deploy/nginx/mythuso.conf:118`, and the service will not start without an SMS provider.

### Phase 4 — general queries for a signed-out visitor

**19 September 2026 update:** The founder reaffirmed a MyThuso-only signed-out assistant. Implemented a website-only surface with the shared robot rig and emergency detector, six approved FAQ topics and same-site source links. Unknown or mixed questions are refused, with no paid model call. Native patient scopes and simulated role workspaces are unchanged. Deploy remains a separate approval. Suggested follow-ups: approved FAQ aliases from user feedback, translated approved answers, and a verified contact route when available.

Verification for this public-guide change: `npm run check`, `node scripts/check-boundaries.mjs`, `npm test`, all four public-assistant Playwright cases, the web production build, iOS simulator build, and Android assemble/lint passed. The browser checks cover scope refusals, mixed requests, emergency precedence, source links, memory-only conversation behaviour, no POST requests, and 320px layout.

Release measurement: the combined chat-layout, robot-colour and public-guide tree builds to **283.07 kB across 14 files**, counting every script, module preload and stylesheet referenced by `apps/web/dist/index.html`, gzipped at level 9. This is **0.91 kB above the recorded 282.16 kB budget** and requires the founder’s decision before deployment.

The following was the pre-implementation gap assessment:

`assistant.json` holds 8 questions in 2 groups and 4 situations; everything else returns
`answers.unmatched`. `features/Landing.tsx` has no assistant reference at all, so there is nowhere to
mount one. This phase is cheap in code and expensive in authoring, because the sentences have to be
written and approved by somebody accountable for them. The signed-out audience is the widest and the
least trusted, so it gets the narrowest answers: no price, no clinical claim, no capability the
contract says is not connected. It points at `/status` rather than restating fifteen capability states
in a second place for them to drift.

### Phase 5 — speech, off

`speechSynthesis` has exactly one call site in the whole web app, `GilbertOneDemo.tsx:184`;
`AssistantVoiceButton.tsx` uses start, stop and transcript only. Lip-sync already works two ways —
browser word-boundary events, falling back to the timed caption track at `gilbertone.ts:597-608`,
with `boundariesSeen` reporting which clock ran. What is missing is a dated flag defaulting to false,
captions that are mandatory and not switchable per §07, a mouth that closes on Stop, on cancel, on
failure, under reduced motion and on a hidden tab, and §07's V03 refusal standing: no voice selection
and no promise of a South African voice, because the contract says not to guarantee one is installed.

### What proper still lacks

The rig is an engineer's SVG of primitives — rect, circle, ellipse, path — and
`GilbertAvatar.tsx:10-16` says a designer's artwork replaces those paths and nothing else. §09 asked
for a character designer's rig with named groups and a static fallback. The control layer is ready for
real artwork; the artwork is not drawn.

---

## What I would not build yet

- **Anything AI-facing.** `screening` and `voice` are both blocked on a model, a vendor and a
  licence, and both are the easiest things in this product to overstate. The capability contract
  already refuses them by name.
- **A second city.** Geography is contracted and the arithmetic generalises, but every operational
  assumption in the product is Johannesburg's.
- **Wearables.** Three device integrations are already offered and none is connected. A fourth
  would be a fourth thing that does not work.

### Founder-requested presentation polish — 19 September 2026

Transparent robot launchers, blinking, a one-time dismissible hello, and simpler chat/voice controls implemented on both web surfaces. No model calls or new dependencies. The app launcher remains CSS-only to avoid eagerly loading the animated rig. Web-only presentation words and greeting timing live in `packages/catalog/assistant-ui.json`. Deployment is a separate run awaiting approval.

Verification: typechecks, full boundary checks, package tests, iOS simulator build and Android assemble/lint passed. Twenty-two focused browser cases passed, followed by both conversation-layout cases after correcting the narrow-phone grid. Motion pause/reduced motion, microphone disclosure and draft-before-send behaviour remain covered.

Production build passed. Patient entry: 284.08 kB across 15 files, gzip level 9 using the documented method; +1.01 kB versus the approved 283.07 kB deployment. This new increase and this deployment run await founder approval.

### Reference robot update — 19 September 2026

The founder supplied a white/chrome, black-visor, teal-lit robot reference. One transparent 256px WebP (12,516 bytes) is shared by both 88px launchers and the animated panel rig, with eyes animated in code and safety poses retaining neutral eyes. The one-time greeting is retained and raised above the larger launcher.

Concurrent sessions changed clinical contracts and engine code while this artwork was being checked. The deployable web-only snapshot is `/tmp/mythuso-robot-release`, based on commit `4dbe04b0549f4a705cc40627236fa2e9eb73eb21` plus the previous approved web changes and this robot update; `RELEASE-SCOPE.txt` lists the overlays. Do not deploy the shared checkout for this visual request. Use Node 22 for the isolated snapshot. A specific deployment approval is still required.

Robot release verification: 284.01 kB patient entry across 15 files (gzip level 9), plus a separately cached 12516-byte image. Isolated web build, boundary checks, 13 focused browser checks and two neutral-expression checks passed; one desktop-only inapplicable phone test skipped.

### GilbertOne's speech switched on — 20 September 2026

The founder switched `voice.webSpeech` on in `packages/catalog/assistant.json` — the flag built on 19 September — and the same sitting wired the two faces the contract now records under `affect.voiceMoments`: A07 attends a genuinely open microphone, dispatched from the adapter's own state and displaced by safety and error by rank, and A10 is the mouth against the reply's own words, fired from the utterance's own start, word-boundary and end events — never a timer — with a held safety face refusing it outright. `voice.browserNotice` names the browsers that work beside the state line a browser with no speech recognition already shows. The caption rule (the written words stay on the screen in full, unswitchable) and §07's V03 refusal are unchanged and still checked.

Verification: `npm run check`, `node scripts/check-boundaries.mjs`, the full package test suite, and focused browser runs over the assistant, polish, public-assistant, GilbertOne, landing and motion specs — 136 passed, 4 skipped, both viewports — on the shared checkout. The assistant emitter writes no change: native data carries none of the web-only voice fields, and no native file changed.

Release measurement: **284.00 kB patient entry across 15 files**, gzip level 9 the documented way — 0.01 kB below the 284.01 kB robot release deployed on the morning of 20 September, and above the 282.16 kB figure recorded on 16 September, which the founder's approvals of the 283.07 kB and 284.01 kB deployments already accepted. The speech increment costs the entry nothing: it lives in the assistant's lazy chunk. Deployment: founder-approved run on 20 September 2026.

### GilbertOne reference robot — 20 September 2026

Applied the founder’s white-and-teal bust with lime antenna to the web app launcher, shared
GilbertOne rig and signed-out website guide. Transparent 14,442-byte WebP; GilbertOne is rendered
as chest text from assistant-ui.json. The 104px launcher keeps the dismissible hello greeting;
blinking and gentle float respect reduced motion, pause and hidden tabs. Refusal and emergency
eyes remain neutral. No assistant permissions or native functionality changed.

Validation: npm run check, npm test, iOS simulator build, Android assembleDebug/lintDebug passed.
Ten focused desktop/mobile checks passed in the workspace; eight polish checks passed against
the isolated release. Its web build and boundary checks passed. Patient entry: 283.85 kB across
15 referenced JS/CSS files, gzip level 9, versus the previous 284.01 kB; the robot image is a
separate 14.44 kB request. Prepared /tmp/mythuso-robot-v2-release from HEAD plus only the visual
files listed in RELEASE-SCOPE.txt, excluding unrelated unfinished clinical/API changes.
Publication awaits separate approval for this run under AGENTS.md.

Publication verified, 20 September 2026: founder approved this run with “apply to mythuso.co.za”. Ran /tmp/mythuso-robot-v2-release/deploy/deploy.sh successfully. External HTTPS checks passed for /, /app/, /staff/, /admin/, /status/, /shop/ and www; six required headers and HSTS max-age=300 confirmed. Certificate SAN covers apex and www. All five co-tenant statuses unchanged. Live mobile browser verified the exact new WebP, 104px launcher, GilbertOne chest text and hello greeting. Screenshot: /tmp/gilbert-v2-live-mobile.png; deploy log: /tmp/gilbert-v2-deploy.log.

---

## Gated — the twenty-feature roadmap, recorded 21 September 2026

The founder described twenty features. On 21 September 2026 each was read back against what exists, and the answer for most of them is a gate rather than a date: a thing that must be true — a contract, a signature, a ceremony, a person — before the feature may be built as more than documentation. **Nothing below was implemented or connected by that pass**, and none of the gates has been satisfied. Each is written with its obstacle, because a gate without its obstacle is a to-do item and this is not a to-do list.

**The assistant's second tier, and its model.** The service is now delivered by every deploy as one bundled file and installed dark; the bridge is live in the panel and falls back to the on-device answers while the service is off. _Read this line as the model tier of the engine described below_: GilbertOne is its own service — `apps/assistant-api` — and the web, iOS and Android applications are its clients, not its carriers.

- **The local fallback model is `llama3.1:8b`** — the tag this machine's Ollama actually carries, and the default in `apps/assistant-api/src/lib/llm-adapter.ts` that runs when no `OLLAMA_MODEL` is set. It is a general-purpose model at the fallback tier, not a clinical one.
- **MedGemma is not the current default and must not be described as one.** It is a future, clinically reviewed evaluation-only model: Google's own model card says its outputs are not intended to guide clinical decisions and it is not optimised for multi-turn use, and `docs/GilbertOne_Developer_Scope_v1.md` records the same. The order is evaluation on a pinned checkpoint, then a clinical and privacy review, then anything else.
- **Provider configured and production operational are states an operator reaches by hand** — a credential through the ops script and the acknowledgement line — and the Azure data-processing and residency questions must be answered before real patient text is acceptable.

**The rest of the list, gated as written:**

| Item                                                                             | What must exist first                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web offline storage for the nurse toolkit**                                    | A signed DPIA and an explicit founder decision that change the web storage ban. Until then offline capture is **native-only**, its queues' encrypted storage is the only form, and no IndexedDB appears in `apps/web/src` — held by the build, not by a sentence. |
| **Real payments**                                                                | A contracted South African payment provider, financial controls, reconciliation design, and a privacy review.                                                                                                                                                     |
| **PHI, FHIR, Medplum, sharing tokens, coding**                                   | A signed DPIA, a registered Information Officer, a data-residency decision, KMS or HSM custody, a retention policy, and interoperability governance. The Passport stays development-only until then, at its own refusal.                                          |
| **SMS identity**                                                                 | A provider contract, DNS, TLS, rate limiting, fraud controls — and the complete existing activation sequence in `deploy/README.md`, step for step.                                                                                                                |
| **Triage, MedGemma, ICD, SNOMED, PHQ, GAD, drug, chronic, allergy intelligence** | Evaluation-only until clinical board review, protocol ratification, pharmacist sign-off where applicable, safety cases, versioned sources, and human review before anything is surfaced. Suggest; never decide.                                                   |
| **Every clinical feature**                                                       | The repository's eight-step path, with no step skipped: catalog contract, generator, web, iOS, Android, boundary rule, journey test, feature-map update.                                                                                                          |
| **Qdrant, Ollama, PostgreSQL, Whisper, Piper, Medplum**                          | A new, isolated server of their own. **Never `liqzar-server`** — five production sites share that box, and this repository's deploy is built around never disturbing them.                                                                                        |
| **The CHW workspace**                                                            | Truthful identity, which does not exist yet. Role-gated and lazy-loaded when it does.                                                                                                                                                                             |
| **Hardware reference work**                                                      | May proceed as documentation only, without activating a patient service.                                                                                                                                                                                          |

### The foundation under one GilbertOne — 22 September 2026

The founder recorded the direction before any of it was built, and it is now the target the whole programme reads: **GilbertOne becomes MyThuso's single intelligent gateway** — one server-side API engine for conversation, knowledge retrieval, structured clinical decision support, IoT-enriched triage, escalation and clinician handover. The web, iOS and Android applications remain thin consumers, and a small deterministic GilbertOne package stays on every client for instant emergency recognition, essential refusals and safe offline fallback. GilbertOne does not diagnose, prescribe or replace a clinician: it collects, structures, correlates, ranks urgency, explains its evidence and escalates to a nurse or doctor who makes and records the decision. The same record fixed the voice direction: conversational like a premium phone assistant while remaining **explicitly push-to-talk rather than always listening** — tap or hold to speak with an obvious listening state, partial transcription, barge-in, captions, replay and text fallback — and **no wake word, passive recording or background listening in this scope**.

This pass built the foundation and nothing above it: no deployment, no activation, no model connected, no database, no FHIR store, no Qdrant service, no voice provider, no clinician routing. The service remains dark and `deploy/` was not touched.

- **The assistant has a catalog-authored, versioned contract.** `packages/catalog/apis/assistant.json` is the thirteenth engine file: twelve routes, two built — `GET /assistant/health` and `POST /assistant/turn`, captured from `apps/assistant-api/src/server.ts` as it answers them today, with their callers, request and response shapes and refusals — and ten declared dark: the `/v1/turn`, `/v1/listen`, `/v1/speak`, `/v1/triage/start`, `/v1/triage/answer`, `/v1/vitals`, `/v1/handover/prepare`, `/v1/handover/submit`, `/v1/knowledge/search` and `/v1/status` family the plan names under `/assistant`, carried by the generated clients as proposals like every engine's. The proposed routes refuse what they must not become: none decides a clinical question, a model tier needs its acknowledgement, listen keeps the push-to-talk rule in the contract itself, and a handover submit that reaches no reader is answered as failed, never as done. The append-only locks carry all twelve route versions — fingerprints, callers and refusals — appended by the repository's own seeding command, and the boundary check now reports 335 route versions over thirteen engine files. _Superseded later the same day, and the record is kept here rather than rewritten_: all **twelve** addresses are built now, not two, and the check reports **350** route versions over thirteen engine files. What was declared dark in this bullet is answered in _GilbertOne, one engine and three clients_ below — built, and gated, which is a different thing from dark.
- **One emergency list, raised by three terms and lowering nothing.** Version 2 of `packages/catalog/gilbert-emergency-terms.json` added "heart pain", "pass out" and "self harm" — three words the classifier's own typed list had carried since it was built — on the day `packages/gilbertone`'s classifier stopped keeping that list and began reading the shared one, so the web, the classifier, iOS and Android now read one version with one changelog. Two characterization tests hold it: the engine's matched words must equal the contract's, flattened, and every word the service matched before the unification must still raise. The list still only ever raises, and it is still not clinician-reviewed — the file says so.
- **The session store is a seam now.** `apps/assistant-api/src/lib/session-store.ts` holds the same map, the same two numbers — half an hour idle, a thousand sessions, oldest first out — and the same read-prunes/write-refreshes behaviour behind a `SessionStore` interface the route reads through; `session-store.test.ts` holds any implementation to that policy through the interface alone.
- **The unreachable model door was removed, proven first.** A caller-and-test sweep proved nothing live called `askModel` or the providers' `complete()` paths, and both were removed from `llm-adapter.ts` on 22 September 2026; the chat tier remains the orchestrator, and the availability flags remain the decision the health route reports.
- **The build holds the new invariants.** `scripts/check-boundaries.mjs` fails if anything under `packages/gilbertone/src` calls `fetch()`, imports a network or model module or reads an environment variable — and if the turn route grows a second model door, loses the gate, or reads the session map instead of the store; a behavioural test proves that an emergency never touches the network, configured or not.

Verification: `npm run check` passes end to end and `node scripts/check-boundaries.mjs` exits 0; the assistant service's 128 tests, GilbertOne's 59, the engines' 500 and the contract mock's 755 all pass; and the web production build, the iOS simulator build and the Android debug build all succeed on this tree. The patient entry, measured by the documented method, is 283.93 kB across 15 files — this pass adds nothing to it, since no web file reaches the assistant routes' new constants — and deployment remains a separate approval.

---

## GilbertOne, one engine and three clients — 22 September 2026

**This pass changed documents and nothing else.** No deploy ran, no service was switched on, no provider was configured, no clinical gate moved, no contract sentence was reworded, no lock line was touched and no generated file was regenerated. The GilbertOne look and feel is fixed and was not restyled in any way. What was corrected is that the authoritative documents still described GilbertOne as the web app's assistant — as a feature, or as "the second tier" of one — rather than as what it is: a **separate API engine with three clients**.

> **Annotation, 6 October 2026 — two figures and one statement in this record are stale here.**
> This is a dated record of the 22 September pass and has not been rewritten; the numbers it states
> were true of the tree that day. Two of them no longer describe the contract, and the convention
> this section itself sets out — _dated records were annotated rather than rewritten, so a reader can
> still see what was true when it was written_ — is what this note follows.
>
> - **The route count.** _One engine, three clients_ says "twelve addresses over twenty-six route
>   versions, every one of them built", and the Verification paragraph reports "assistant **12**".
>   Counted from `packages/catalog/apis/assistant.json` on 6 October 2026: **46 route objects**, of
>   which **28 are live** — every live one `status: built` — and **18 carry a `withdrawn` record**
>   (10 proposed and superseded, 7 frozen and withdrawn, and `POST /v1/speak@3` built and then
>   superseded by version four on 28 September). The 28 live versions occupy **28 distinct
>   method-and-path addresses** and **25 distinct URL paths**; no live address carries two versions.
>   The engine has grown since the 22nd — the founder's settings and provider routes, the photo
>   reading, `listen@3` and `speak@4` — and withdrawn versions keep their lock lines, so the object
>   count rises faster than the live one.
> - **The external-source count.** _Nothing external is reachable_ says "**3** allowlisted external
>   knowledge sources", as does the Verification paragraph. That was right on 22 September:
>   `packages/catalog/knowledge/federation.json` held three sources — icd11-who, openfda,
>   pubmed-europepmc — until 2 October 2026 (`7cec153d`), when eleven more were recorded dark.
>   Counted today: **14 entries in `sources`**, with a further 12 under `assessedNotAdmitted` that
>   are not allowlisted at all, and `scripts/check-boundaries.mjs` holds the floor — _the allowlist
>   may not shrink below fourteen_. All 14 still ship `"active": false`; that part of the sentence
>   holds and is unchanged.
> - **One statement of fact, not a figure.** _Which documents were aligned_ ends by saying that
>   `docs/governance/DPIA-DRAFT.md` "was left exactly as it was … which pins itself to the commit
>   it was written against". That was true on 22 September and is not true now: on 6 October 2026
>   the draft was re-scoped to bring the founder's 21 September speech-conversation amendment into
>   scope, which is what that amendment's own caution asks for. Its section 1.1 is new, its pin
>   names `d91bea10` beside the original `3294e1a`, and its status is unchanged — still a draft,
>   still unsigned, with the section 12 blanks still blank. Recorded here because this bullet
>   tells a reader which documents to trust as untouched, and one of them has been touched.
>
> **The surrounding claim was not checked in this pass, and must not be read as though it had been.**
> Only the count was re-derived. The assertion that _nothing external is reachable_ — and with it the
> dark guards, the single importing file and the imported-by-nothing property that sentence rests on
> — is under review, and its correction is owned by a separate change that lands together with the
> code fix that makes it true. Two independent reads of the tree have disagreed with it. It is
> recorded here as unresolved, not as verified.

- **One engine, three clients.** GilbertOne is `apps/assistant-api`: its own process, bound to `127.0.0.1:8791` and reachable from outside the box only through the nginx `location /assistant/`, with its address family authored in `packages/catalog/apis/assistant.json` — the thirteenth engine file, twelve addresses over twenty-six route versions, every one of them built. The web reaches it through its own proxy; iOS and Android each carry a typed client generated from that same contract. **Neither phone asks it anything yet**: `capabilities.json`'s `unifiedApi` flag is `enabled: false`, generated as `false` into Swift and Kotlin, so a phone answers on-device with no network at all and flipping the flag is a decision nobody has taken.
- **What stays on the device is not a compromise.** `packages/gilbertone` — no dependencies, no network, no environment variable — is compiled into all three platforms and answers the emergency from the message and the contract alone. The build fails if anything under it calls `fetch()`, imports a network or model module, or reads an environment variable, and a behavioural test proves an emergency never touches the network whether a provider is configured or not. The engine being separate is what lets that promise hold: the deterministic half does not depend on the half that can be dark.
- **Built is not the same as live, and five of the twelve are gated on a contract rather than a flag.** Triage's two steps wait on a protocol register that designates **0 of 12** protocols as triage protocols, under a board that is not-formed and a Medical Director who is not-appointed, with a second lock in the source that is `false`; the vital-sign reading waits on a data protection impact assessment, so the real-device allowlist holds **0 devices** against an assessment reading "not-done"; the handover prepares and stores a pack and reaches no network, while its submission is **one unconditional 503** that reads no body, touches no store and answers no 200, because the identity, roster and destination contracts it would need do not exist. The boundary check reads all five from their branches and fails if any of them is ungated.
- **Nothing external is reachable.** The **3** allowlisted external knowledge sources all ship `"active": false` with endpoint, licence, rate limit, residency and use boundaries recorded, each adapter's dark guard sits before its fetch, and `apps/assistant-api/src/lib/knowledge-federation.ts` is the only file that reaches them and is imported by nothing. The model tier stays dark until an operator configures a provider **and** writes `MYTHUSO_ASSISTANT_PRODUCTION=acknowledged` by hand; the sequence is `deploy/RUNBOOK.md`'s _Activating the assistant service_, and activation is not part of any deploy.
- **Which documents were aligned.** `README.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY-AND-SECURITY.md`, `docs/FEATURE-MAP.md`, `deploy/README.md`, `deploy/RUNBOOK.md`, `CLAUDE.md` and `AGENTS.md` now name GilbertOne as its own service and the three applications as its consumers, and two stale addresses were corrected in the prose — the turn is `POST /assistant/v1/turn`, with the unversioned `/assistant/turn` asked only where a deployment older than the versioned surface answers that 404. Dated records were annotated rather than rewritten, so a reader can still see what was true when it was written. `docs/GilbertOne_Developer_Scope_v1.md` is a supplied source document with its own document-control block and was left exactly as it was, as was `docs/governance/DPIA-DRAFT.md`, which pins itself to the commit it was written against.

Verification: `node scripts/check-boundaries.mjs` exits 0 and reports **350** route versions over thirteen engine files — assistant **12** — with **245** built and **105** proposed, **5** gated built assistant routes read from their own branches, **0 of 12** protocols designated as triage protocols, **0** devices in the real-device allowlist and **3** external sources reading `"active": false`. Because the change is markdown-only and touches no source, contract, lock or generated file, the boundary check — the one check that reads these documents and fails on drift — is the relevant one and it is the one that was run; the patient entry is unchanged, since not one file under `apps/web` was touched.

---

## Founder-scoped — GilbertOne commercialization & Control Tower expansion, 23 September 2026

The founder scoped a large expansion and asked for it to be written down rather than built: **queued
pending credits**, under this file's own standing rule _do not start a large build near the weekly
credit cap_. The full scope, with every flag and every artifact checked against the tree, lives in
[`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`](COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md). **Nothing was
built, generated or connected by the pass that wrote it — it changed markdown and nothing else.**

- **Naming is locked.** The admin portal is **MyThuso Control Tower**; the ops/dispatch workspace
  becomes its **Dispatch & Incidents** module; **GilbertOne API Administration** is its own top-level
  category carrying the G1 mark. The two current surfaces — `apps/web/src/features/Admin.tsx` and the
  `StaffShell.tsx` Control Tower — consolidate into one portal.
- **GilbertOne becomes a licensable product line** — a standalone clinical-assistant API a hospital
  deploys itself, sold multi-tenant or self-hosted, priced per-bed / per-clinician-seat / per-API-call,
  white-labelled and scoped per institution. Eight new engine modules are scoped (multi-tenancy, model
  registry, per-hospital knowledge federation, eval harness, metering/billing, theming, webhooks,
  compliance export). It **must not bloat the patient app or the 282.16 kB patient-entry budget**.
- **The self-learning loop is bounded and human-gated — the hard flag.** The engine may self-improve
  retrieval, phrasing, language coverage and non-clinical knowledge; **anything touching clinical
  decisioning is LOCKED** to a Clinician Review Queue, ships only after sign-off with a version and
  instant rollback. A synthetic-patient **simulation harness** scores every change before it goes
  live. Feedback feeds the retrieval layer, **never the safety layer**.
- **Control Tower gains IoT, admin layers, onboarding, beds and safety.** A device fleet per ward/bed
  whose threshold breach auto-raises a Dispatch & Incident (MQTT gateway beside the HL7 inbound);
  **fourteen scoped admin layers** (Super User ≤2 with hardware-key MFA down to time-limited Support
  Agent), each scoped by site/region, module, data-class, read/write and break-glass; a draft
  tenant-onboarding wizard; bed booking and admissions; and panic buttons.
- **Field safety for lone workers is a founder deal-breaker.** Built on the existing field-safety
  engine: pre-visit risk scoring against SAPS/crime data with red-zone lone-visit blocking, the
  two-person rule, live GPS with store-and-forward, timed check-ins that auto-escalate, silent panic
  plus a spoken duress word and hardware fob, and armed-response / CPF / SAPS 10111 integration.
  **Three external gates need founder green-light and pricing:** a real SAPS/crime-data source, an
  armed-response partner agreement, and a hardware-fob decision.
- **Three references in the note were checked and corrected rather than repeated.** `escalation.json`,
  `escalation-policy.json`, `gilbertone-api-keys.json` and `gilbertone-api-versioning.json` **do not
  exist** — the real escalation logic is `packages/gilbertone/src/escalation.ts` and the real
  versioning is `packages/catalog/apis/assistant.json` with `scripts/api-locks.mjs`. The stated CI
  hexes (navy `#0C2340` / blue `#2563EB` / violet `#7C3AED`) **are not in `packages/design-tokens/tokens.json`**,
  whose palette is teal-navy-and-lime; because the look and feel is fixed, these must be reconciled
  before any screen is built. All admin/clinical wording stays en-ZA until clinician sign-off.
- **CI palette governance (decided 23 September 2026).** The shipped `packages/design-tokens/tokens.json` palette — teal-navy-and-lime (`brandInk` #0F3B4A, `indigo` #1E3A8A, `brandGreen` #1D9E75, `brandLime` #D9FF1A) — **governs** all Control Tower and future screens. GilbertOne's brand is an accent _within_ that token system, never a replacement for it. The navy/blue/violet palette (#0C2340/#2563EB/#7C3AED) mentioned during scoping is not in the tokens and must not be used as the CI.

## The voice that reads a reply follows the reply's own language, and emergency numbers are read as telephone numbers — 23 September 2026

**Asked for by the founder after live testing on mythuso.co.za**, where two things were heard: a reply the service had written in isiZulu was read aloud by an English voice, and 10111 — Ten Triple One — was read as "one thousand and one something". Both are now contract decisions with dates and reasons, and neither moved the microphone's English-only rule, which stands exactly as the founder decided it on 14 September 2026.

- **The reading follows the words.** `voice.spokenLanguages` in `packages/catalog/assistant.json` names the languages a reply may be read in — isiZulu today, with its own `localeOrder` (zu-ZA first) and a `detectWords` list drawn from the contract itself. A reply is tested only when the service wrote it (`kind: "service"`), because every approved sentence in the contract is English and a detector over them could only ever find nothing; two of the words must appear, so one loanword in an English answer changes nothing. Detection happens where the reply is decided — `spokenLanguageOf()` on the web, `Gilbert.spokenLanguage(in:)` on iOS, `Gilbert.spokenLanguage()` on Android — and the language is handed to the one file per platform that is allowed a speech API, which asks for a voice in that language's order first and falls back to the English preference behind it. A quiet preference, never a promise: where no Zulu voice is installed the reading still happens, in whatever voice the device offers, and the words on the screen never depend on which voice takes them.
- **The system prompt answers in the writer's language.** This branch's own wording for `llm.systemPrompt` was not taken when it was merged on 24 September 2026: `main` already answered "in the same language the user wrote in" (8e59ee76, which detects en/zu/xh/af/st), with later concision and disclosure rules this branch predates. The rules around it — never diagnosing, never prescribing, always deferring to a professional — did not move.
- **A telephone number is read as a telephone number.** Each entry in `sos.json`'s `emergency.numbers` gained a `spoken` field — "one zero one seven seven" for the ambulance, "one one two" for the mobile, "one zero one one one" for the police — recorded as `emergency.spokenNumbers`, the founder's decision with `decidedBy`, `on` and `why`. The words travel to the phones through the same generator that carries the numbers (`GilbertLine` gained a `spoken` member in Swift and Kotlin, emitted by `scripts/emit-assistant.mjs`, which now fails if a line has no spoken form), and every reading seam uses them: `spokenOf()` on the web and `coreWords()`/`spokenAloud()` on both phones say the digits' words instead of the digits. The digits stay what is dialled and what is printed; only what is said changes.
- **What did not move.** Recognition stays English-only on every platform — the boundary check that pins `voice.languages` to one entry and `voicePreference.order` to the exact array is untouched. The matcher, the emergency precedence, the approved sentences and the refusals are unchanged. VoiceOver and TalkBack read the same words the synthesiser reads, because both come from the same one function per platform.

Verification: `node scripts/check-boundaries.mjs` exits 0 — including a new check that each emergency number's `spoken` field spells that number's own digits word for word, and that the founder's `spokenNumbers` decision record stands in the contract. `npm run check -w @mythuso/assistant-api` passes; the assistant-api suite passes 238 with 0 failures; the assistant Playwright spec passes 95 of 100 with 4 skipped and one pre-existing flake at `assistant.spec.ts:2051` (the A10 speech-cue attribute, documented in the feature map as an in-suite timing flake that passes deterministically in isolation — it was run five times in isolation after this change and passed every time). Native iOS and Android code compiles against the same contract via the generators but was not built in this sandbox: no Xcode exists here and the sandbox's Java is 21, so the iOS build and the Android Gradle build must be run on the machines that have them.

## Founder-requested — Control Tower screen redesign, decided 24 September 2026

**Asked for by the founder**: the Control Tower's 14 categories / 27 tabs are dense and difficult to follow. Redesign them to make sense, with animations, charts, switchers, level switchers and modern configurators, for admins, Control Tower admin and the founder. Access to the Control Tower requires login + authenticator code. Eight screen designs were generated and approved; the full spec is `docs/design-review/CONTROL-TOWER-REDESIGN.md`.

- **Auth ruling**: TOTP-only gate for now (password + authenticator code, reusing the existing scrypt + RFC 6238 machinery from `apps/assistant-api/src/lib/founder-access.ts` and `apps/api/src/totp.ts`). Full identity service / SMS OTP deferred until the founder chooses an SMS provider. The `?role=` preview picker stays behind `MYTHUSO_AUTH_MODE=demo`; production mode removes it. This is Tier 1 of the extended-scope auth ladder, not Tier 3.
- **CI ruling**: the shipped `packages/design-tokens/tokens.json` teal-navy-and-lime palette governs (`brandInk` #0F3B4A, `indigo` #1E3A8A, `brandGreen` #1D9E75, `brandLime` #D9FF1A) on the mist/charcoal/sage surface language from `docs/DESIGN-LANGUAGE.md`. GilbertOne's brand is an accent within the token system, never a replacement. This overrides the stale "no indigo" comment in `apps/web/src/features/portal/portal.css` and reconciles the 8 Sep DESIGN-LANGUAGE direction with the 23 Sep CI palette governance.
- **IA approach**: the contract's 14 categories stay intact (so `check-boundaries.mjs` and `tests/control-tower-portal.spec.ts` pass unchanged); the shell presents them as 9 visual nav groups — Overview · Dispatch & Incidents · Clinical · Devices & IoT · GilbertOne API Administration · Commerce · Configuration · Governance · Founder. Every category address (`?category=X&tab=Y`) keeps working; the group is resolved from the category.
- **Component vocabulary**: sliders (stone track, charcoal fill, circular thumb, floating mango-soft value chip), toggle switches (brandGreen ON / stone OFF), segmented controls, progress rings, numeric steppers, status chips (six-word vocabulary), sage area sparklines, dark vault panel — all 44px targets, two-ring focus, token-only colors, contract-driven values.
- **Motion**: runs through the existing system (`lib/motion.ts`, `surface/motion.css`, `components/ChartMotion.tsx`) — only `transform`/`opacity`, gated on `[data-decor='on']`, removed under reduced motion, no `cubic-bezier` literals in stylesheets, token durations only. `portal.css` is excluded from the cubic-bezier and sage-fill boundary checks, so the rules are self-enforced there.
- **Phased plan** (8 phases, ~16–20 batches, each independently verifiable and committable): Phase 0 spec (done) → Phase 1 auth gate → Phase 2 shell + IA + CSS → Phase 3 Overview + charts → Phase 4 Dispatch & Incidents → Phase 5 GilbertOne Admin → Phase 6 Configuration → Phase 7 Founder → Phase 8 remaining screens. Legacy shells stay at `?legacy=1` until G15 closes. Patient entry budget ≤ 282.16 kB; Control Tower stays behind dynamic imports.


## Founder-requested — extended scope captured, and what gates each part, 25 September 2026

**Handed over by the founder** as a DeepThink planning pass and captured verbatim in
`docs/scope/06-Extended-Scope-2026-09.md` (eight domains: the security ladder, the online consultation
screen, nurse/doctor field safety, IoT devices and triage scoring, the device marketplace and the free
band, load-shedding/crime deployment intelligence, the Control Tower's five new capabilities, and the
cost/build order). **It is a proposal, not a ratified contract.** Nothing in it has been written into
`packages/catalog`, and no figure in it — triage weight, crime threshold, device price, margin, fee
percentage, session lifetime — is a decided number. Each is a founder, clinical-lead or commercial
ruling that has to be taken before it can become a contract value, because the rule here is that a
number lives in one place and is decided, never typed by whoever is building. This entry is the gating
analysis: what already exists, what each part waits on, and the honest order.

**Where it already agrees with what is decided.** The ladder's Tier 1 (founder: password + TOTP, dark by
default) is built. The Control Tower authenticator gate started tonight — `26594a9a`, the dark
`control-tower-access` contract + lib + tests — is that same Tier 1 extended to Control Tower
administrators, and §1.6's `MYTHUSO_AUTH_MODE=demo|production` cutover is exactly the live pass (Phase
1c) already designed in `docs/design-review/CONTROL-TOWER-REDESIGN.md`. The consumer-device advisory
boundary (§4.3), the advisory-with-documented-override rule (§3.3, §5.3) and GilbertOne's
summarise-suggest-flag-but-never-decide role (§5.5) all restate boundaries already in the contracts and
in the 23 September self-learning decision.

**What gates each domain — and none of it is code that can be fabricated:**

- **Part 1, the security ladder.** Tier 3 (real staff IAM) and Tier 4 (patient phone + OTP) wait on the
  identity service (`apps/api`, deliberately dark) and an **SMS provider** — the founder's standing
  deferral. Before the *first real patient*, §1.7's four governance gates must close: a **signed DPIA**
  (`docs/governance/DPIA-DRAFT.md` is a draft), an **appointed Information Officer**
  (`docs/governance/INFORMATION-OFFICER.md`), a **unified audit trail**, and a **tested breach drill**.
  All four are governance, not code, and all four are unowned today. §1.5's field-level encryption gap —
  `apps/api/src/sensitive.ts` is a single unversioned key — needs the versioned key ring the protection
  module already supports before real identity or medical-aid numbers are stored.
- **Part 2, the consultation screen.** A teleconsult *preview* surface exists; the **consultation
  service, the WebRTC/DTLS-SRTP stack and the live per-consultation IoT reading pipeline do not** (the
  document says so). This is a Phase-2 build in its own right and cannot start before the service is
  scoped and the DPIA covers live video plus real-time device data.
- **Part 3, field safety.** The field-safety **engine is built**; the gap is the Control Tower's live
  map, check-in/escalation screens and the analytics. Three external dependencies already recorded here
  need **founder green-light and pricing**: a real SAPS/crime-data source, an armed-response partner
  agreement, and a hardware-fob decision. The pre-visit risk *score* is a clinical-adjacent threshold
  and is not to be invented.
- **Part 4, IoT devices and triage scoring.** Device contracts and the consumer/medical tiering exist;
  triage stays gated behind **clinical ratification + a wired seam + the DPIA** (the governance model
  that keeps the clinical flows dark). The "adapted SATS" scoring engine and every clinical weight in
  §4.1–§4.2 are **Clinical Safety lead decisions** — writing them into a contract unratified would break
  the hardest rule in the repo.
- **Parts 4.3–4.4, the free band and the marketplace.** The commerce kernel and shop exist. The free-band
  rule, the device prices (R300 band, R500 cuff…), the 10–20% margin and the kit economics are
  **commercial decisions**, not yet taken. The band's clinical boundary (tier-3 consumer, advisory, never
  auto-creates an incident) is consistent with what the device contracts already draw.
- **Part 5, deployment intelligence.** Needs **external data contracts** — Eskom/EskomSePush and
  SAPS/StreetSignal — each with an access decision and a cost, plus the risk / load-shedding / logistics
  thresholds, which are decisions. The three deployment modes and the fee model (online at 60% of
  standard) are **commercial rulings**. None of this can be authored as a contract until the sources and
  the numbers are chosen.
- **Part 6, the Control Tower's five new capabilities.** Each is gated exactly as the document's own
  table says: Deployment Intelligence on the Eskom/SAPS data contracts; Field Safety Live on the engine
  (built) plus a screen; Device Fleet on the device contracts plus the DPIA; Consultation Monitor on the
  consultation service (not built); Safety Analytics on an analytics layer (not built).
- **Part 7, the ten additions** (consent receipt, AI decision audit trail, explainability, device-recall
  register, safety training, second-opinion request, band-limits screen, load-shedding scheduler, CPF
  integration, safe-return confirmation) are good proposals and each needs its own scoping before it is
  more than a line here.

**Decisions the founder has to take before any of this becomes code** (each is a ruling, not a build):
1. an SMS provider (unblocks Tier 3/4); 2. a SAPS/crime-data source and its pricing; 3. an
armed-response partner agreement; 4. the hardware-fob and founder hardware-key decisions; 5. Eskom data
access and tier; 6. the commercial numbers — device prices, margin, free-band cost, the mode fee
percentages; 7. the clinical numbers — triage scoring model and per-device clinical weights, which route
to the Clinical Safety lead and the DPIA and may not be fabricated; 8. appoint the Information Officer
and sign the DPIA before the first real patient; 9. whether to proceed to Control Tower Phase 1b (the
routes), which pulls in the `assistant.json` append-only lock and native client regeneration.

**What was done tonight, and what was deliberately not.** Phase 1a of the Control Tower gate (the dark
`control-tower-access` contract, lib and 12 tests, `26594a9a`) — the one piece of this scope that is
pure Tier-1 machinery, needs no ruling and touches no live surface — was built, verified and committed.
This document was preserved and gated. **No contract numbers were invented and no live surface was
half-migrated.** The build order the document ends with — IAM first, then the data contracts, then the
screens — is the right one, and every step after Phase 1a waits on a decision above rather than on
effort.




### Phase 4 data sources — decided, 25 September 2026

The founder has named the two data sources that gate Phase 4 (Dispatch & Incidents, deployment intelligence):

**1. Eskom load-shedding data — EskomSePush API (https://eskomsepush.gumroad.com/l/api)**
- REST API with JSON responses; free tier available via Gumroad, Business API (esp.info/business-api) for commercial use.
- Endpoints: `/business/3.1/reports` (area-level outage intelligence), loadshedding schedules, area lookup, GPS coordinate lookup.
- Real-time electricity, water, internet signals from community reports.
- **Integration path**: straightforward REST client; the free tier is sufficient for internal Control Tower use. *(6 October 2026: this clause is contradicted by `packages/catalog/feeds.json`, which holds the free tier to be a licence breach for a service rather than a sufficiency. See the flagged contradiction under "Consequence for Phase 4" below — it is unresolved and is the founder's to decide.)*

**2. SAPS crime statistics — no public REST API; quarterly downloads or DataFirst research data**
- Official portal: saps.gov.za/services/crimestats.php (quarterly PDF/Excel downloads, detailed stats available).
- DataFirst (UCT): clean research-ready CSV spanning 2005-2026, aggregated by police station, local municipality, and geographic coordinates (https://www.datafirst.uct.ac.za/dataportal/index.php/catalog/1012).
- Third-party aggregators: Crime Stats SA, ISS Crime Hub Wizard (crimehub.org), SafeSuburb — all process SAPS quarterly releases.
- Stats SA publishes the Governance, Public Safety, and Justice Survey (GPSJS) — accounts for unreported crimes via household victimization surveys.
- **Integration path**: batch import from DataFirst CSV (cleanest) or manual quarterly update from SAPS portal; no real-time API.

**Consequence for Phase 4**: the deployment intelligence screen can now be scoped against real sources. The Eskom feed is a straightforward REST integration; the SAPS feed is a batch import (quarterly refresh from DataFirst or manual SAPS portal download). Both are internal Control Tower use, so the Eskom free tier suffices.

> **UNRESOLVED CONTRADICTION, flagged 6 October 2026 — this sentence and the contract disagree, and
> the contract is the later word.** The line above says the Eskom free tier suffices for internal
> Control Tower use. `packages/catalog/feeds.json` says the opposite, in the `load-shedding-stage`
> feed's own `supplier` field (line 2956): *"The free tier is licensed per person for non-commercial
> use, so a health service polling it is a breach rather than a bargain, and no key has been bought."*
> The same feed carries that as a gate rather than a comment — `beforeSwitchOn` holds
> `a-key-is-licensed-for-a-health-service`, whose `must` is *"A paid EskomSePush key, or a written
> agreement with Eskom, covers commercial use by a health service, and the rate limit it comes with
> is recorded beside it"*, with `met: false` and `evidence: null`, and whose `why` names the failure
> mode: *"Polling it from a service is a licence breach dressed as a free integration, and the day it
> matters is the day the supplier notices — which is also the day a dispatch board loses the figure it
> was built around."* Line 3000 and line 3109 of the same file carry the POPIA section 72 position as
> not determined.
>
> **These cannot both be true, and the difference is not a wording one.** "Internal Control Tower use"
> is the reasoning the sentence rests on, and it is exactly what the contract rejects: the licence is
> per person for non-commercial use, and a health service polling an API from a server is a
> commercial use by a service, not a person reading a page. One of the two documents is wrong about
> the licence, and which one is a question about EskomSePush's own terms rather than about this
> repository.
>
> **Dates, because they are the only thing here that is not a judgement.** This roadmap line was
> written on 25 September 2026 (`e6cae0b9`). The feed that contradicts it was authored on 1 October
> 2026 (`f741f87f`, *the twenty-second door*), six days later, as part of a pass that wrote down what
> each supplier door needs before it may be switched on. The later document is not thereby the
> correct one, but it is the one that asked the question deliberately, and it is the one the build
> reads.
>
> **Nothing has been resolved here, and nothing should be built on either reading.** `packages/catalog/`
> is out of scope for the pass that wrote this note, so the contract was left exactly as it is; and
> picking a side is a licence question for the founder and counsel, not a documentation edit. Until
> it is answered: the free tier is not to be treated as available, the feed's gate stays unmet, and
> the dispatch board keeps doing what the contract's `whileAbsent` already says it does — dispatching
> on roster, position and distance and saying nothing about power, with a dispatcher who needs to
> know whether a zone is dark opening EskomSePush on her own phone, which is what she does today.
> **The decision needed from the founder is which licence MyThuso would be operating under, and it is
> needed before any Phase 4 work touches the Eskom feed.**

### What remains unnamed — the data sources Phases 3 and 7 still wait on

**Phase 3 (Overview + charts)**: the "Visits this week" area chart and metric cards need a time-series source. **CONFIRMED (25 Sep 2026): the care visit log** (`apps/web/src/features/CareVisit.tsx`) — the care engine already tracks every visit started by a nurse (timestamp, nurse identity, visit code, duration). The chart would show visits started by nurses, aggregated by day, for the last 7 days. No invented numbers — the data exists. Alternatives: offer log, panic activations, or a new metric service (all less natural).

**Phase 7 (Founder)**: the deploy sparkline and system health panel need a deploy/health history source. **CONFIRMED (25 Sep 2026): modify `deploy.sh` to log each deploy to a JSON-lines file** (`deploy/log.jsonl`) — timestamp, commit hash, who ran it, exit code, what changed. The Founder screen would show the last 10 deploys. No invented numbers — the data exists. Alternatives: new deploy log service, systemd journald (open G36 gate), or git log of deployed commits (all less practical).

**Founder confirmed (25 Sep 2026)**: the care visit log for Phase 3 and deploy.sh logging for Phase 7 are approved as the data sources. These phases can now be scoped against real sources. Until then, those phases remain blocked by the same hard constraint: "must not be built as shown — they display values the tree does not hold."


## Decided — Control Tower data-viz ruling and remaining sources, 25 September 2026

Working the approved redesign overnight reached the same wall twice: **Phase 5's Voice sliders** and now
**Phase 3's Overview metric cards + "Visits this week" chart** both ask for a number the contracts
deliberately refuse to hold. The redesign's own hard constraint says the Appendix-D-derived wireframes
*"must not be built as shown — they display values the tree does not hold,"* `control-tower-overview.json`
carries four refusals (`no-status-typed`, `no-invented-tenant`, `no-secret-on-the-overview`,
`no-per-viewer-memory-without-a-session`) and holds no metrics or time-series, and two
`control-tower-portal.spec.ts` pins keep services a `list` and gates a `table`. The same shape gates
Phase 4 (needs a real crime/Eskom feed, G22 open), Phase 6 (real bounds live per-engine and only where
provenance is `decided`, not `proposal`) and Phase 7 (no deploy/health history is recorded anywhere a
screen can read).

**Founder ruling (25 Sep 2026): option B — structural/visual polish only, no invented numerals.** The full analysis and the three options were in
`docs/design-review/CONTROL-TOWER-REDESIGN.md`, "Phase 3 finding, and the pattern across the data-viz
phases — 25 Sep 2026". In short: **(A)** authorise clearly-marked non-live preview figures per contract
(makes the mockups buildable, but each invented number needs your provenance sign-off); **(B, recommended)**
treat the redesign as structural/visual polish — layout, hierarchy, motion, status chips, gated controls,
refusal sentences — with written empty states wherever a number would go, which is what Phase 5 shipped and
needs no ruling to continue; **(C)** sequence the real data sources first and draw each chart only behind
its live feed. **Nothing was fabricated and no pinned live surface was restructured unattended while this
waits.** The safe overnight work stayed self-contained: Phase 1a's dark auth lib (`26594a9a`), the
extended-scope capture (`5bb98742`) and this gating analysis.

## Environment problem — IDE formatter contamination, recorded 25 September 2026

**Recurring issue**: the IDE auto-formats on save with a non-project Prettier config (double quotes, expanded imports, exploded compact arrays/objects to multi-line, trailing commas in function params). This re-flows files after they're committed, creating phantom diffs that must be restored to HEAD before each commit.

**Observed behavior**:
- Files committed with single quotes, compact arrays, no trailing commas in function params.
- After commit, the IDE re-formats them: double quotes, multi-line arrays, trailing commas in function params.
- `git status` shows the files as modified immediately after commit.
- Must `git restore` the files to HEAD before the next commit to avoid contaminating the diff.

**Affected files** (observed this session):
- `packages/catalog/control-tower-access.json` (compact array exploded to multi-line)
- `apps/assistant-api/src/lib/control-tower-access.ts` (line wrapping, trailing commas)
- `apps/assistant-api/src/control-tower-access.test.ts` (same)
- `docs/design-review/CONTROL-TOWER-REDESIGN.md` (markdown tables re-padded, emphasis `*x*` → `_x_`)

**Workaround used**: python shell writes bypass the IDE formatter, so semantic changes are applied via python heredocs rather than SearchReplace/Write tools. This is credit-inefficient and error-prone.

**Fix options** (founder decision needed):
1. **Add a project `.prettierrc`** that locks the code style (single quotes, `trailingComma: 'es5'`, `printWidth: 120`, `tabWidth: 1`, `semi: true`). This is a project-wide change but prevents the contamination.
2. **Disable format-on-save in the IDE** (user setting). No repo change, but requires the founder to adjust their IDE.
3. **Configure the IDE to use the project's formatter** (if one exists). No repo change, but requires the founder to adjust their IDE.

**Recommendation**: option 1 (add `.prettierrc`). It's a small, safe change that prevents the issue going forward, and it makes the code style explicit rather than implicit. The observed code style is: single quotes, no trailing commas in function params, single-space indentation, semicolons, print width ~120.

## Founder-requested — the full Lovable export and the phased port, recorded 29 September 2026

The founder asked why the fresh Lovable design does not appear on `mythuso.co.za`. The answer is not a
cache, a service worker or a missed deploy. **There are two Lovable exports, and only the smaller one was
ever implemented.**

| | `mythuso-claude-handoff.zip` | `mythuso-full-project.zip` |
| --- | --- | --- |
| Root folder | `mythuso-design-system/` | `mythuso-export/` |
| Files | 35 | 203 |
| Uncompressed | — | 3,702,477 bytes |
| Downloaded | 28 September 18:56 | **29 September 12:07:41** |
| Internal stamp | 2026-09-28 18:54 | **2026-09-29 11:59** |
| Carries | `theme.css`, 11 components, 2 logos, 2 illustrations, 12 photographs, the guidelines | all of that, plus 68 role routes, 17 showcase screens, the AI-element set, a Radix-backed `ui/` kit, `.lovable/design-system.json` and `.lovable/system.md` |
| Status | **implemented — FEATURE-MAP waves 1–6, live** | **never opened by any session** |

The ordering is the whole explanation. The last commit is `61310305` at 10:57:15 +0200 and the deployed
bundle carries `Last-Modified: Tue, 29 Sep 2026 08:58:09 GMT` (10:58 SAST). The full export's internal
stamp is 11:59 and it landed in `~/Downloads` at 12:07:41 — **an hour after the work was committed and
deployed.** No earlier session could have built from a file that did not yet exist.

The share link does not close the gap either. `lovable.dev/projects/6f59c904-…` returns a 48 kB
JavaScript shell whose entire static text is "Lovable · Skip to chat input · Loading…". Reading the
project needs an authenticated browser session, not a fetch.

One thing was measured and found sound, so it is not re-litigated here: `theme.css` is **byte-identical**
across both exports (SHA-256 prefix `9ecaa125efa3bc61258c`) and identical to the copy committed at
`packages/brand/lovable-handoff/handoff/src/styles/theme.css`. The Careline design language really was
received and really is live. What was never received is the layouts, and what was received but never used
is the motion.

### Gap 1 — the animations were delivered and never wired in

`theme.css` defines **33 `@keyframes`**. The deployed stylesheet contains **one** of them,
`mythuso-signal`. The other **32 are absent from production**: `gilbert-blink`, `gilbert-look`,
`gilbert-turn`, `hero-float`, `hero-pulse`, `hero-drift`, `patient-rise`, `chart-draw`, `chart-reveal`,
`chart-point-arrive`, `chart-halo-pulse`, `chart-range-arrive`, `status-breathe`, `nurse-route-draw`,
`nurse-pin-arrive`, `nurse-location-pulse`, `nurse-orbit`, `nurse-readiness`, `nurse-bar-rise`,
`nurse-field-enter`, `nurse-schedule-fill`, `notification-ring`, `ring-fill`, `metric-progress`,
`health-goal-fill`, `health-tab-enter`, `consultation-enter`, `doctor-page-enter`, `impact-rise`,
`impact-halo-pulse`, `impact-map-float`, `nurse-patient-image`.

The handoff's own README gives the reason: *"Nothing on any screen loads a file from this folder."*
`theme.css` is a reference master. Wave 1 extracted its **tokens** into `packages/design-tokens/tokens.json`
and left its **animations** in the reference copy. `docs/brand/CI.md` mentions `@keyframes` zero times —
chapter 7 records the three durations (quick 160 ms, settle 280 ms, enter 420 ms), the single `easeSoft`
curve and the older `durationMs` 180 ms, and stops. The brand document therefore logs the *timing* of the
motion system and not one of its *movements*.

This is not a claim that the product is static. The built CSS carries 51 keyframes of its own from earlier
work. It is that Careline's named movements were specified and never built, and that `theme.css` already
carries three `prefers-reduced-motion` blocks whose accessibility handling was specified alongside them
and never applied.


### Gap 2 — the page layouts were never delivered to the build

The full export carries **68 role routes** — patient 30, nurse 19, doctor 15, partner 4 — totalling
1,148 lines, and **17 showcase screens** totalling 2,651 lines, of which `src/showcase/patient-space.tsx`
alone is 108,391 bytes. Across `src/` the export holds **10,470 lines** of `.tsx`/`.ts`/`.css`. The repo
has 91 files under `apps/web/src/features/`. These are not like-for-like counts, and the difference is not
the finding; the finding is which screens exist on one side only.

Checked against `apps/web/src/features/` and `packages/catalog/`, **five patient pages in the export have
no counterpart anywhere in the repo** — `health-library`, `health-timeline`, `risk-assessment`,
`vaccinations`, `symptom-checker`. A further **three have the underlying content but no screen**:
`community` (material in `Onboarding.tsx`, `Household.tsx`, `vetting.json`, `geography.json`,
`knowledge/mental-health.json`), `nutrition` (`knowledge/prevention.json`, `maternal.json`,
`chronic.json`) and `reminders` (`Dashboard.tsx`, `Dispensing.tsx`, `events.json`). None of the eight
appears in `packages/catalog/capabilities.json`, which holds 23 entries.

These are the "new functionalities and new layout of all pages" the founder asked for. They are not
partially built and hidden; they are absent.

### Gap 3 — the export's stack is not this repo's stack, so this is a port

`apps/web/package.json` declares four runtime dependencies: `lucide-react ^0.468.0`,
`maplibre-gl ^6.9.0`, `react ^19.2.0`, `react-dom ^19.2.0`. The export declares thirty-eight. Verified
absent from every `package.json` in the tree: `tailwindcss`, `motion`, `recharts`, `mapbox-gl`,
`@supabase/supabase-js`, `@tanstack/react-router`, `@tanstack/react-start`, `@radix-ui/react-dialog`,
`cmdk`, `zod`.

Three of these deserve naming because they look like near-misses:

- **Tailwind.** The export is Tailwind 4.3.3 throughout. Wave 2b deliberately rebuilt the handoff's
  component library as `.ui-*` classes *without* Tailwind. Copying a showcase screen would reintroduce
  the framework the build removed on purpose.
- **Maps.** The export uses `mapbox-gl 3.9.4`; the repo uses `maplibre-gl ^6.9.0` — the open fork, a
  different package with a divergent API — behind a hand-rolled `apps/web/src/map/TileMap.tsx` and
  `mapboxRequests.ts`, over `packages/catalog/geography.json`. Map screens translate; they do not lift.
- **Icons.** `lucide-react` is the one shared dependency, and even it differs by a major version
  (`^0.468.0` against `1.48.0`), so icon names are not guaranteed to resolve.

The export also assumes Supabase for data and TanStack Start's file-based routing. Neither exists here:
truth lives in `packages/catalog/*.json`, routing is the repo's own, and `check-boundaries.mjs` fails the
build on drift. The governing instruction is already recorded and applies unchanged — *the handoff's look
wins on every visual question; the build's logic, contracts and refusals win on everything else.*


### What is already live, and must not be redone

FEATURE-MAP waves 1–6 (1, 2, 2a, 2b, 3, 3a, 3b, 4, 4a–4e, 5, 5a, 5b, 6) shipped and were verified in
production: the Careline tokens (radii 20/28/16/16 → 6/8/12, two shadows, three durations), Outfit and
Figtree self-hosted and serving 200, the 18-component `.ui-*` library byte-identical live, the ten-icon
family generated to TSX/Swift/Kotlin and wired into `PatientShell` and `PortalShell`, the logos and
re-encoded WebP photography under `/lovable/`, patient, nurse, doctor, Control Tower, shell, landing and
GilbertOne restyled, and both native apps on the identity. A port that starts from the export's source
instead of from this build would throw all of that away.

### The phased plan

**Phase A — preserve the export.** Storage and documentation only; no code. Commit
`mythuso-full-project.zip` beside the handoff it supersedes, record its SHA-256 and a 203-file manifest the
way `packages/brand/lovable-handoff/MANIFEST.sha256` does, and note in `docs/FEATURE-MAP.md` that waves
1–6 were built from the smaller export. Without this the file lives only in `~/Downloads` and the next
session loses it — which has already happened once.

**Phase B — the motion set.** Port the 32 missing `@keyframes` into the product's own CSS, expressed
through the existing `--t-quick`/`--t-settle`/`--t-enter` durations and `--ease-soft` rather than through
hardcoded milliseconds, and carry `theme.css`'s three `prefers-reduced-motion` blocks with them. Then
record the movements in `docs/brand/CI.md` chapter 7, which documents the timing and none of the motions.
Smallest phase, most visible, and it touches no contract and no refusal. **Gate:** the patient entry
budget, **282.16 kB**, measured the same way — animation CSS is not free, and a rise is a founder decision
rather than a tidy-up.

**Phase B, first slice delivered — the map's lines, 29 September 2026.** The verbatim port above is the
wrong shape, and the first attempt at it proved why. `scripts/check-boundaries.mjs` refuses a keyframe
nothing plays, refuses an endless animation the pause control cannot stop, and — wave 3a — holds the
landing page's ambient budget at exactly two loops, `hero-particle-drift` and `hero-signal-pulse`, with
`tests/motion.spec.ts` walking the page to its foot to catch a third. The product already speaks the
handoff's motion language (one curve, three durations, entrances on `data-reveal`, ambient loops gated
on `data-decor`), so 32 orphan keyframes would have been a second motion system wearing the first one's
clothes. What was genuinely missing was the impact map: a brand master whose routes are pixels and
therefore cannot move. It now carries an overlay measured from the master itself — seven node centres
and ten cubic routes least-squares-fitted against `south-africa-network-640.webp`'s own pixels, every
route within about a pixel of the line the picture drew — and a light travels each route once, in turn,
as the section arrives, then rests: finite, reveal-gated, composited properties only, inside the walk
test's `motion.enterMs × 7` window. An eleventh route the first trace believed in turned out to be a
phantom (31% pixel coverage) and was dropped. The rest of Phase B stands, restated: port the movements
the product does not yet have — each with a real player and a test — rather than the handoff's keyframe
names, and record them in `docs/brand/CI.md` chapter 7.

**Full-gate run before the 29 September deploy.** `npm run check` green; full `npm test` 1155 passed,
1 failed — `[mobile] tests/control-tower-portal.spec.ts:307`, the accessibility floor's sweep on the
portal's Finance screen counting two animations running with reduced motion asked for. It is not the
map slice's: that slice touches only the landing entry, and the portal's code is byte-identical
between the deployed `61310305` and `8e048357`. The test passes 2/2 re-run in isolation on mobile,
and the identical assertion failed with the identical message in `test-results-w34b/` — artefacts of
another session's worktree run on a different code state. It is a load-dependent timing flake in the
portal's Finance sweep, on the portal's side of the motion work, and it does not gate this deploy.
Native builds were not re-run: no native input changed — no catalog, no generated client, no
`apps/ios` or `apps/android` file — and no native artefact is published from the shared box.


**Phase C — layout reconciliation.** Diff the 68 routes and 17 showcase screens against the 91 features,
screen by screen, and classify each as *built*, *deviation* or *not built*, working patient → nurse →
doctor → partner. Written into `docs/design-review/` before any component moves. **Gate:** the standing
rule against half-migrating a live patient-facing surface. A screen is ported whole or not at all; where
one cannot be finished in a single pass it stops, states its blast radius, and comes back to the founder.

**Phase D — the new patient capabilities.** The eight pages from Gap 2. Each is a feature rather than a
reskinning, so each walks the eight steps in `CLAUDE.md:126` and ends at `docs/FEATURE-MAP.md`: a contract
in `packages/catalog/`, a capability entry, and the boundary checks passing. **Gate:** none of the eight
may display a number the contracts do not hold. The 25 September ruling — option B, structural and visual
polish only, no invented numerals, written empty states wherever a number would go — applies to these
pages exactly as it applies to the Control Tower. `symptom-checker` and `risk-assessment` additionally
inherit the `screening` capability's block: *no model, no vendor, no licence.*

### Invariants holding over all four phases

- The deterministic half of GilbertOne in `packages/gilbertone` stays on every device — no dependency, no
  network, no environment variable. The export's `ai-elements/` set (`conversation`, `message`,
  `prompt-input`, `shimmer`) presents over `motion` and the AI SDK; adopting its look must not make the
  offline answer depend on either.
- Affect may never soften a refusal or an emergency. Restyling a refusal is permitted. Making it warmer at
  the cost of making it less clear is not.
- `.lovable/system.md`'s hard constraints are compatible with this build and should be adopted as review
  criteria: no raw colour literals, no gradients, orbs, glass or purple-dominant palettes, compact corners
  with pills reserved for badges, statuses and compact controls, Lucide only for universal utility
  actions, and motion short, purposeful and disabled under a reduced-motion preference.
- GilbertOne's look and feel is settled, and a newer export does not reopen it.

### Phases C, D and B delivered — 29 September 2026

Phase C was written into `docs/design-review/LOVABLE-EXPORT-RECONCILIATION.md`: the 68 role routes and 17
showcase screens classified screen by screen against the 91 features, patient → nurse → doctor → partner,
confirming the eight patient **not built** rows by finding rather than by count.

Phase D built them. `packages/catalog/patient-pages.json` carries the hub's and eight screens' every word,
the shared aside and seven derivations; `scripts/emit-patient-pages.mjs` writes the router's two strings per
page and the words as data for both phones; `apps/web/src/features/PatientPages.tsx` over
`apps/web/src/lib/patient-pages.ts` renders them behind one `lazy(() => import(...))` in `App.tsx`; the More
hub's first group gains the "Your health" row and `?open=your-health` is the door everywhere. A new
patient-pages block in `scripts/check-boundaries.mjs` holds the review gate, the eight screens and hub
shortcuts, no invented digit but the emergency numbers, the derivations, no typed sentence, no restated
emergency number, the single dynamic import and the motion rules; `tests/patient-pages.spec.ts` walks eight
journeys on both viewports, 16/16 green. `symptom-checker` and `risk-assessment` inherit `screening`'s block
and the checker escalates through `packages/gilbertone`'s intake without diagnosing. No screen shows a number
the contracts do not hold, and the review notice sits beside every screen until a clinician signs
(`review.status: awaiting-clinical-review`). The patient entry measured **253.06 kB** gzip -9 across the 15
files `apps/web/dist/index.html` references — below the 282.16 kB gate, because the entry carries only the
generated route file and the screens, the contract and the six knowledge JSONs all ride the dynamic import.

Phase B's restated deliverable landed with it. The 32 handoff keyframe names were **not** ported verbatim —
that would be the second motion system the first slice refused. Instead `docs/brand/CI.md` chapter 7 now
records "The movements, named": the product's 53 named movements across 21 stylesheets, derived from the CSS
by `scripts/emit-ci.mjs` so the record cannot drift, beside the handoff master's 33 names and why they were
left. Phase D's own movement, the cards' `pp-in` entrance, is finite, reveal-gated, transform and opacity
only, removed under reduced motion and walked by a test; the impact-map slice of 29 September stands.

Verified this session: `npm run check` green and `scripts/check-boundaries.mjs` green including the new
blocks; the full Playwright suite 1167 passed with 5 failures — `configuration.spec.ts:99` (desktop and
mobile) and `control-tower-portal.spec.ts:142` (desktop) reproduce at HEAD with none of this work stashed
away, and `access-settings.spec.ts:85` and `assistant.spec.ts:1604` pass in isolation, so none is a
regression. No native input changed, so no native build was re-run and nothing is deployed: the standing
rule holds that a deploy is its own explicitly approved step.

## Founder-requested — the full Lovable design alignment, scoped 30 September 2026

The founder asked to _"adjust the look and feel to the Lovable one, the layout and the elements on all
screens … all Lovable features must be added if they do not exist but be in scope … have a unified
UI/UX … the animations must be pulled and be made smooth,"_ and to scope it before building. The
assessment is `docs/design-review/LOVABLE-FULL-ALIGNMENT.md`; it is the governing document every wave
reads. Two decisions were taken up front and are not reopened by a later wave: **GilbertOne's own
look and animation stay settled** (only the chrome around it aligns), and **the export's refusal
screens keep honest** — the simulated staff login, the raw patient results inbox and the prescribing
screen take the new look but not the behaviour, and no number is invented.

The assessment's headline finding narrows the work: the identity is already aligned. The export's
19 semantic colour roles, its radii/shadow/type scale, its 18-component `design-system.json` library
and its 10-icon `MyThuso*Icon` family are all live from waves 1–6 and match the export byte for byte
where it matters. What the export carries that the app does not is **layout and element arrangement
per screen, the named motion set (31 of theme.css's 33 movements unported), the mapbox map layouts, a
grouped-navigation pattern, and six staff-surface capabilities** (nurse/doctor messages, resources,
schedule, team). The export's stack — Tailwind, TanStack, Supabase, mapbox-gl, Radix, lucide@1.48 —
never enters `apps/web`; the look is translated onto `.ui-*` + tokens and maplibre, not lifted.

The wave order, each independently gated and committed by name so a session can stop at any commit
boundary and resume cold:

- **Wave 0** (this pass) — the assessment and gap register; scope recorded here. No production code.
- **Wave 1** — design-system reconciliation: verify tokens/components/icons against the export and
  build only the overlay-kit patterns a later wave first needs. No speculative components.
- **Wave 2** — motion: port the adopted movements, each with a real player and a test, on the motion
  tokens, removed under reduced motion, recorded by regenerating `docs/brand/CI.md` chapter 7.
- **Wave 3** — patient surfaces: adopt-visual across the built screens, adopt-layout on the
  dashboard/appointments/devices/records, the shared page-intro header, and the "Your health" desktop
  sidebar door (a tenth navigation row plus a nav key in all eleven locales, "Explore MyThuso" last).
- **Wave 4** — staff surfaces: concept-kit preview and founder approval first for clinical screens;
  adopt-visual/layout on the built nurse/doctor/partner screens; build the six new staff screens as
  contract-driven capabilities. Login and prescribing stay gated.
- **Wave 5** — maps and remaining gaps: translate the map layouts onto maplibre `TileMap`, wire chart
  and landing-hero motion, and style the AI-element conversation chrome around the settled assistant.
- **Wave 6** — Control Tower / admin: adopt-visual within the pinned §5.1 category order (screen
  rebuilds inside each category, never a nav regroup); impact motion on overview widgets.
- **Wave 7** — verification, docs, preview, ship: fresh build, patient-entry budget re-measured
  against 282.16 kB, `npm run check` and `check-boundaries` green under Node 22, the full Playwright
  suite attributed, FEATURE-MAP and ROADMAP updated, a local preview for founder sign-off, then push
  (L3 gate first) and deploy each on their own explicit confirmation.

This is a large multi-wave build. Per the standing rule it is written here rather than started near a
credit cap, so the next session picks it up cold at the next wave boundary. Nothing in Wave 0 touches
production code, the bundle, or the live site.

### The alignment built in one pass — 30 September 2026, afternoon

The wave order above was overtaken the same day. Audits of the live app against the export found the
assessment had classified as _built_ screens a role could not reach, and the founder asked for all of the
export's changes in the current theme. Seven builders closed the buildable gaps in one change: grouped
navigation in the patient and staff shells, the staff tools as destinations, the nurse's route map and her
landing, the doctor's and partner's list-beside-detail screens, the patient's tabbed health home, dashboard and
six new pages, the landing's layout pieces, the Control Tower's field alert and the assistant's composer chrome.
`docs/FEATURE-MAP.md` holds the record; `docs/design-review/LOVABLE-FULL-ALIGNMENT.md` holds the correction.

What is left, in the order it should be taken:

1. **The founder's gate on the clinical staff screens** — answered on 30 September: publish, the Vetting
   card reworded to the live screen's words, the composer's title accepted, and everything below in this list
   to be built. The patient's name on the partner's Orders workbench comes off with it.
2. **Dark theme on the legacy sheets.** `surface/clinical.css` and the patient surface colour headings,
   panels and the not-connected notice with `--charcoal`, `--body` and white, which have no dark values. It was
   already so; the new pages make it show in more places. Move them onto the `--color-*` roles.
3. **`Wordmark.tsx` follows the operating system's scheme**, not the app's theme, and draws the wrong lockup
   when the two differ.
4. **The patient's "Thuso Kit" card opens the nurse's capture tool.** Connected devices is now the right
   destination; `tests/kit-capture.spec.ts` drives the tool through that door and moves to the nurse's
   workspace with it.
5. **`OrderDetails.tsx` types its laboratory values and ranges** where a contract should hold them.
6. **Not built from this pass:** the nurse's shell-level panic (the confirm block is tied to a visit), the
   Kit screen's "reached the record" ring, the assistant's auto-growing composer, the phone's More hub in the
   sidebar's groups, the remaining legacy furniture on the patient's Privacy, Family and Live well screens.
7. **Words nobody has written:** the patient sidebar's group labels render in English in every locale.
8. **The phones.** None of this is on iOS or Android. `PatientPagesData` is regenerated for both and read by
   neither.

### What was left, built — 30 September 2026, evening

The founder's answer to the list above was "build all these", and six builders did the same afternoon:
the patient's name off the partner's screens, the nurse's panic from any page, the kit's ring, the dark
theme on the older sheets, the wordmark on the app's theme, the More hub in the sidebar's groups, the
patient's Thuso Kit card onto Connected devices, the laboratory order without typed results, the shared
components on Privacy, My family and Live well, the assistant's growing composer, and Mental health and
Activity as native screens on both phones. `docs/FEATURE-MAP.md`'s last section is the record.

What is left now, in the order it should be taken:

1. **The deploy.** `./deploy/deploy.sh` was refused to the session and is the founder's to run.
   `mythuso.co.za` serves the morning's build until then, and that build names a patient on two of the
   partner's screens. The assistant's runtime is not changed by this work; the composer is web only.
2. **Look at the phones.** On Android only the top of Mental health was seen and the instrumented tests
   were not run; on iOS the dark appearance and the final layout at accessibility sizes were not seen. The
   machine's disk was full. Boot each with space to spare and walk both pages in both appearances.
3. **The phones' words for Mental health** are new and on a page awaiting clinical review
   (`patient-pages.json` `drawnOn.<platform>.words`): the founder has been told, a clinician has not read them.
4. **The rest of "Your health" on the phones:** the hub and the other eight pages; native screens for the
   health library and community helplines, which is what the two missing doors wait on.
5. **The laboratory.** The order's timeline says "Results verified" above a panel that says no test is run;
   `lib/records.ts` and the HL7 bridge type laboratory ranges in fixtures. A laboratory reference range
   needs a contract and a clinician before any screen draws a value or a flag.
6. **The phones against today's rules:** no shell-level panic, partner workbench or kit ring natively, and
   the native order and dispensing screens were not checked for a typed panel or a patient's name.
7. **Dark theme, the remainder:** tabs inside screens, the booking steps and the back office's inner tabs
   were not walked; the category tints are bright on the dark ground and want a design decision.
8. **Words nobody has written:** the patient sidebar's group labels in the other ten languages.
9. **Small:** the guardians' invitation list is still the old furniture; the composer has not been tried on
   a real Android keyboard; comments in four files still say the Thuso Kit is on the patient's entry.

---

## What ratifying a triage protocol and appointing a Medical Director actually require — 1 October 2026

**Written, not built.** The founder asked what these two things require. The answer is in the
contracts and in the build, and four parts of it were proved by breaking the source deliberately and
reading the failure rather than by reading the check that would produce it. Nothing in this section
moves a gate; it says what the gates are, what opens them, and in what order.

### 1. Appointing the Medical Director is four fields and one cross-check

`packages/catalog/protocols.json#governance.medicalDirector` holds `name`, `hpcsaRef`, `signedOn` and
`status`, and `apps/assistant-api/src/lib/triage-gate.ts` reads `status === "appointed"`. The build
holds the reference honest: a registration number written anywhere under `packages/catalog` must
already be one the vetting register issued. **Proved** — setting `hpcsaRef` to a number nobody issued
failed the build with _"the vetting register has never issued it. A clinician carrying a number no
authority gave them is exactly what vetting exists to catch."_ A Medical Director the register does
not know is not appointable in this repository, which is the check working rather than obstructing.

The consequence is uncomfortable and should be decided before it is met. The register is two files —
`apps/web/src/lib/vetting-fixtures.ts` and `packages/catalog/roster.json` — and the doctors in it are
fixtures. Appointing a real Medical Director means putting a real person's real HPCSA number into a
file that is otherwise preview data, in a public repository. **That is a
`docs/PRIVACY-AND-SECURITY.md` question before it is a code question**, and it is not answered today.

### 2. Forming the board is the same shape, and neither is on the governance register

`governance.board` holds `name`, `chairRef`, `quorum`, `meetingCadence` and `status`, read as
`status === "formed"`. Neither the board nor the Medical Director is a record in
`packages/catalog/governance-status.json`, which holds the DPIA, the Information Officer and data
residency and nothing else. So the back office's Governance Readiness screen cannot answer _"has a
Medical Director been appointed"_ — the question a funder or a regulator asks first — and appointing
one is an edit to a catalog file rather than a form an accountable person fills in. Adding both as
records there is small, and belongs before the board sits rather than after.

**Done, 1 October 2026:** both are records in `governance-status.json` now — `medical-director`
(not appointed) and `governance-board` (not formed), with no person and no number — so the back office
answers the question out loud. Recording one there still changes no gate: the triage gate reads
`protocols.json`, not the register.

### 3. Neither appointment ratifies anything by itself

`protocols.json` says no protocol advances beyond `draft` until the board is formed and a Medical
Director is appointed. A row is ratified only with `status: "ratified"`, a `ratifiedBy` carrying both
a role and a name, and a `ratifiedOn`. And a draft carries nothing: the five governance fields —
`reviewHistory`, `safetyCase`, `clinicalEvidence`, `applicableConditions`, `contraindications` — are
the frame the board fills when it signs, and the build fails a draft holding any of them, or holding
any digit outside its own version and the one it supersedes. The frame existing is not the content
arriving, and the check keeps the two apart.

### 4. There is no thirteenth launch protocol, and that is enforced twice over

The build holds the launch scope at the twelve the Master Blueprint Part F names. **Proved twice:**
adding a new draft row failed with _"registers 13 launch protocols … a launch scope nobody agreed"_,
and promoting the preview pathway (`headache-raised-blood-pressure-pathway`) to `ratified` failed with
the same sentence — because `previewPathwayOf` recognises a preview pathway by its being a draft, so
ratifying it makes it a thirteenth launch protocol.

So a triage protocol is one of the twelve, or the twelve becomes thirteen by a deliberate edit to the
check that holds it, citing the board's decision. `clinical.json#triage.triageProtocols` already says
which of the registered protocols are triage protocols is the board's to say, and that none is today.
The board's first clinical act is probably that designation, and it is a choice among rows that
already exist.

### 5. The content has nowhere to live, and that is the work

Ratifying fills the five governance fields and names who signed. It does not create the protocol's
rules. `packages/engines/src/clinical/domain/triage.ts` loads them through a `RuleLoader`, and this
build's loader is `noRulesInThisBuild`, which loads none — so a ratified protocol whose rules cannot
be read is still answered `protocol-content-not-in-this-build`. There is no triage content contract
anywhere under `packages/catalog`: `clinical.json` holds frames, gates, registries and refusals and
not one clinical word, by its own `_note`.

The protocol's questions, their order, its priority scale, its red flags, its reason codes and its
dispositions are a **new contract authored by clinicians**. That is the part measured in months. The
signature is measured in a day, and the signature is the small one.

### 6. The seam must be wired before the designation is written

**Proved:** with the board formed, a Medical Director appointed and a ratified protocol designated in
`clinical.json`, the build failed with _"the live seam still refuses to ask a question. The gate is
open, so both triage routes would answer a 500 to a person told they would be assessed."_ The order is
held by the check in both directions — unratified questions in a live seam fail it too — so it cannot
be got wrong by accident. Content first, designation second.

### 7. The safety case is a test, not a gate

`validateProtocolReadiness` names three things a triage protocol must carry — a signer, a ratification
date and a safety case — and it is called from `packages/engines/src/clinical/engine.test.ts` and from
nowhere else. **Neither runtime gate reads `safetyCase`**: `triage-gate.ts` reads status, signature and
date, and `triage.ts` reads the register and the loader. A protocol ratified with `safetyCase: null`
would open both gates in a running service and be caught only by the test suite reading the register.
That is a real gap, and a cheap one to close — a single call in the gate — but closing it is a code
change and this section is not one.

**Closed, 1 October 2026:** `triage-gate.ts` now asks `validateProtocolReadiness` of every designated
protocol, so a row ratified with `safetyCase: null` (or a blank one) keeps the gate shut, and
`triage-gate.test.ts` proves it with synthetic rows. Stricter only — no protocol is ratified.

### 8. What opens when all of it is done, and what does not

When the board is formed, a Medical Director appointed, a protocol ratified with its content, the seam
wired and the designation written, the two triage addresses in `apps/assistant-api` answer on the next
start **with no edit to a handler**, because the gate reads the register rather than a flag. The
Clinician Review Queue's screen steps aside on its own: the check holding
`apps/web/src/features/portal/ReviewQueue.tsx` to no action runs only while the board is not formed, so
forming it is what lets the screen grow a sign control.

What does not open is anything else. The queue's five routes are still `proposed` with no handler. And
`clinical.json#whereContentLives` means the consultation's words, the reason codes a triage sets and a
patient's answers go to the Health Passport under its consent gateway — which refuses to start outside
development until a signed DPIA, a registered Information Officer, a residency decision and KMS or HSM
custody exist. **A ratified triage protocol with no Passport behind it has nowhere to write what it
decided.** The clinical track and the privacy track meet here, and `docs/governance/README.md`'s order
— residency and key custody, then the DPIA, then the Information Officer, with the clinical review
running in parallel — is the order that stops them meeting too late.

### The order, if it is done

1. Decide who the board is and who the Medical Director is. Both are people; the repository can only
   record them.
2. Decide whether a real clinician's registration number may sit in a public repository
   (`docs/PRIVACY-AND-SECURITY.md`), and only then add the Medical Director to the vetting register.
3. Write `governance.board` and `governance.medicalDirector` in `protocols.json`, and add both as
   records in `governance-status.json` so the back office can answer the question out loud.
4. The board designates which registered protocols are triage protocols
   (`clinical.json#triage.triageProtocols.ids`), and decides whether the launch scope grows past
   twelve — which is an edit to the check holding it, citing the decision.
5. The board authors the protocol's content as a new contract; its five governance fields are filled
   on ratification and not before.
6. The seam in `apps/assistant-api` is wired to that content.
7. The designation is written and the status set to `ratified` with its signature. Step 6 before 7 is
   enforced, not remembered.
8. Close the safety-case gap in the gate, and put a Passport behind the record the triage writes.

Steps 1 to 4 are a decision and a day. Step 5 is the work, and steps 6 to 8 are not formalities.


## Founder-requested — animated triage readings, 2 October 2026

The founder asked for patients, nurses and doctors to see animated organ illustrations with their
triage readings, and for clinician consultation screens to keep readings and patient/medication context
close to the video. This supersedes the live board’s earlier choice to animate nothing.

Built: decorative heart and oxygen/lung illustrations on the shared web, iOS and Android readings
views; patient access on web devices and consultation pages and both native Health Passports; the
web consultation’s video placeholder beside the live simulated panel, with expandable patient details,
allergies and medication requests. The nurse’s call-doctor tool has the same honest video placeholder.
An unknown patient is never replaced with another patient’s record; medication requests are explicitly
not a reconciled list of medicines currently taken.

No device or media connection was activated and no clinical gate changed. Organ rhythm is decorative,
never a measured heartbeat or breathing rate, and stops for Pause, stale or missing readings and
reduced motion. The patient entry measures **256.10 kB** versus the same-tree **256.12 kB** baseline,
both measured with the documented gzip-level-9 method. Screens remain deferred behind dynamic imports;
repeated patient loading notices share one render helper. No deployment was requested or run.
See [the feature map](FEATURE-MAP.md#animated-triage-readings--2-october-2026) for the contract,
generator, native views, boundary proofs and browser journeys.

Verification obtained on this tree: `npm run check`, the web production build, iOS simulator build,
Android `assembleDebug`/`lintDebug`, and the live-vitals boundary proofs passed. The full `npm test`
run passed every Node suite and finished its browser run with 1,494 passed, 27 skipped and three
failures. The reduced-motion specificity and duplicate media notice were corrected; all three
failed browser tests passed on recheck, including the unrelated Control Tower navigation timeout.


## Founder-requested — Jitsi for a two-way call with GilbertOne, assessed 4 October 2026

The founder asked for Jitsi on GilbertOne, "for a two way call with gilbertone bot similar to what
chatgpt dot bot works". The ask is a hands-free spoken conversation with the assistant: you talk, it
answers by voice, you interrupt, it stops and listens. That is the right thing to want, and it is
already built — so this section records what was assessed, what was found, and why adding Jitsi to
GilbertOne would take a working thing away rather than give something new.

**The two-way voice call with GilbertOne exists.** It is `packages/catalog/conversation-mode.json`,
driven by `packages/gilbertone/src/speech-state.ts` and `apps/web/src/lib/voice.ts`, and decided by
the founder on 21 September 2026 (amended, numbers moved into the contract on 28 September). One tap
starts it; from there it is hands-free. The person speaks, pauses, GilbertOne answers, and the
microphone reopens on its own for the next turn. Barge-in works: GilbertOne stops speaking the moment
the person starts talking and never talks over them. The per-utterance cap is 45 seconds, after which
GilbertOne prompts the person to continue. Verified on this tree at `8aaeedc9`:
`tests/conversation-mode.spec.ts` **24 passed (43.3s)** on both viewports, including "speak, pause, and
GilbertOne answers by itself", "starting to talk while GilbertOne reads stops the voice", and "an
emergency answer closes the microphone, and the numbers still show"; and
`packages/gilbertone/src/speech-state.test.ts` **37 passed, 0 failed**.

**Jitsi is not a licence or a maintenance problem.** Checked against the primary source on 4 October
2026: `jitsi/jitsi-meet` is Apache-2.0, not archived, 30,041 stars, last pushed 3 October 2026;
`jitsi/jitsi-videobridge` is Apache-2.0. Both would pass the licence gate outright. That is not where
this stops.

**Five enforced invariants block it, and the first four are load-bearing.**

1. **A Jitsi call would put the microphone where the contract says it is not.** The amendment keeps
   all audio processing on the device: wake word, VAD, transcription and voice synthesis, with no
   audio or transcript ever leaving the machine and no retention. Jitsi is a media server —
   jitsi-videobridge receives, mixes and forwards RTP streams. Putting GilbertOne behind one means a
   patient's voice leaves the device and is handled by a server, which is exactly what
   `conversation-mode.json`'s `whatItIsNot` refuses: "It is not a recording. No audio is captured,
   buffered or kept, and no cloud speech service hears the person for the on-device conversation."
2. **The web microphone exists on exactly two surfaces, by name.** The build asserts this in its
   summary sentence: "on the web a microphone exists on exactly two surfaces — the live assistant's
   button and the labelled demonstrator — each under its own dated founder decision, each behind a
   disclosure shown before the first tap, and nowhere else in the build". A Jitsi widget is a third
   surface. Adding it is a founder decision with its own dated disclosure, not a wiring change.
3. **The camera is refused in production, and Jitsi's default room wants both.**
   `deploy/nginx/mythuso.conf` sends `Permissions-Policy "camera=(), microphone=(self), geolocation=()"`
   at server level and again on `/assistant/`, and `check-boundaries.mjs` fails the build if either
   declaration stops carrying `microphone=(self)` or if `camera=()` goes. A video-capable conference
   client cannot use a camera the browser is told it may not have.
4. **Jitsi's standard integration is an external script, and `script-src` is `'self'` alone.** The
   usual embed loads `external_api.js` from the Jitsi origin. The build asserts
   "apps/web/index.html's script-src is no longer 'self' alone" as a failure. Only `connect-src` and
   `img-src` may name a provider origin, and the reason is written in the check: script and worker
   stay self. Self-hosting Jitsi to satisfy this would still leave the media flow, the camera and the
   third microphone surface standing.
5. **Teleconsultation deliberately connects nothing, and the contract says so on its own face.**
   `teleconsult.json` carries `media.declared: false`, `media.state: "never-asked"`, and "Nothing in
   this file opens a camera, a microphone or a connection." The build fails if
   "The teleconsultation contract offers recording in a build that declares no microphone", and its
   summary asserts "No teleconsultation screen touches a camera or a microphone". `Teleconsult.tsx`
   and `lib/teleconsult.ts` both state: "no WebRTC, no camera, no microphone, no permission requested
   and none needed". Jitsi is precisely the thing these screens are written to not be. Turning that
   on is the real media milestone — it needs the DPIA, the Information Officer, the residency
   determination and the consent the Passport does not have yet, and it belongs to the clinical
   consultation, not to the assistant.

**Where Jitsi would actually fit, when the controls exist.** Not GilbertOne. The clinical
teleconsultation — a patient, a nurse and a doctor in one room, which `teleconsult.json` already
designs in full across four connection fidelities, a waiting room, recording consent and encounter
outcomes — is the surface a conference bridge serves. That is a separate, larger decision gated on
the same missing controls as `apps/passport`, and it is not started here.

**Nothing was changed in this assessment.** No contract, no code, no dependency, no deploy. Jitsi was
not recorded as a component in `packages/catalog/open-source.json` either: that register is
`verifiedOn 2026-09-14` and its `DECLINED` entries are declines *by the specification* (§45), which
has not ruled on video conferencing. Inventing a specification decline for Jitsi would put a sentence
in the register that its source document does not contain. If the founder wants this parked in the
register rather than only here, the honest entry is a new `PROPOSED`-style component with its own
`verifiedOn`, and that is a decision for him.

**What to do instead, if the ask is a better spoken conversation.** Improve the thing that already
runs. The candidates, none of which touch a media server or widen a microphone surface: a fuller
South African English acoustic path on-device; lowering first-token latency in
`apps/assistant-api`; or making conversation mode reachable from more of the product's surfaces than
the two it has today — each of which needs its own dated founder disclosure, because the build counts
them.
