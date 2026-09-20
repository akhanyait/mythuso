# What is left to build

Written 9 September 2026, from `packages/catalog/capabilities.json`, `docs/FLOW-COMPLETENESS.md`
(all 96 journeys walked in a browser), `services.json` and `business-model.json`. Nothing here is
estimated from memory.

Two lists. **Outstanding** is work the product already implies and has not finished. **Recommended**
is work nobody has asked for and I think is worth doing. They are kept apart on purpose — the second
list is opinion and should be read as such.

---

## The one fact that shapes everything

**Fifteen capabilities. None is connected.** Every screen in MyThuso draws real arithmetic over
sample data and says so. That is deliberate and it is the right state for a product seeking funding
rather than patients. But it means "what is left to build" is mostly not screens — it is the eleven
integrations underneath them, and each one is a contract, a vendor or an accreditation before it is
a line of code.

| Capability | What is actually blocking it |
|---|---|
| `accounts` | An SMS provider for one-time codes |
| `booking` | A nurse roster with real availability |
| `payments` | A South African payment provider, contracted |
| `payouts` | The same provider, plus bank verification |
| `credential-verification` | Agreements with thirteen separate authorities |
| `dispatch` | Live positions from nurse devices |
| `clinical-records` | The controls in `docs/PRIVACY-AND-SECURITY.md` |
| `teleconsultation` | A media stack; no camera or microphone is declared on either app |
| `screening` | No model, no vendor, no licence |
| `voice` | The same, plus a POPIA answer for recording a symptom |
| `devices` | No device is contacted; no Bluetooth or eSIM permission declared |
| `dispensing` | A contracted pharmacy network |
| `interpreting` | No interpreter is contacted |
| `messaging` | No SMS, email or push provider |
| `emergency` | No contracted ambulance partner |

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
green, and what is missing is the vendor rather than the code. It should also be a slightly *harder*
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

- ~~The Health Passport has no device permission screen.~~ *Review permission* is **gone**, not
  wired: it sat on the denied block, opened nothing, and flipped the screen's own state to ready. A
  control that appears to grant a permission and grants none is worse than no control. The three
  cards saying what each device would read sit under the notice instead of behind it, so reviewing
  one is a single press. Held by `tests/patient-screens.spec.ts`, which asserts the button is
  absent.
- ~~"Chat to our care team" opens a booking.~~ Closed 9 September, and it was the file's only
  *blocking* row. It is not a chat — `messaging` is not connected and a window with a fictional
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
  Both must keep the clause saying the work is *not* on the disk — `LedgerStorageFailureTests`
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

### 1. Arrival tracking, for the patient
The one thing a person waiting at home actually wants, and the product currently cannot answer:
*where is she now.* `dispatch` already carries real coordinates and arrival estimates; the map
already draws them for the Control Tower. The patient sees none of it. This is mostly plumbing an
existing capability to a second audience, and it is the feature most likely to be described to a
friend.

### 2. ~~A visit summary a patient can act on~~ — built
What was measured, what was in range, what the doctor said, and one button that rebooks with the
same patient chosen. `tests/patient-screens.spec.ts` holds it.

### 3. Offline capture for the nurse
A nurse in a house in Soweto with one bar cannot lose an assessment. The kit capture flow already
has an offline queue; the rest of the clinical capture does not. This is a working-conditions
feature and it is the kind of thing that decides whether nurses stay.

### 4. A sponsor's view
`business-model.json` already has sponsored care and the family screens already show "Sponsored
care" as a state. Nobody can see what they are paying for. This is the second revenue line in the
proposal and it has no screen at all.

### 5. ~~Nurse earnings forecasting~~ — built
*If you take a shift* sits above the nurse's weeks and answers what one is worth before she commits
to it. Kept here struck through rather than deleted, because a recommendation list that quietly
loses the ones somebody took is a list nobody can audit.

### 6. An "explain this to me" layer on the Health Passport
Reference ranges are already rendered — and, since the move into `packages/catalog/records.json`,
rendered from one place on all three platforms. What a reading *means* is not. This is where `screening`
will eventually live, and a written, sourced, non-AI version of it could exist now — and would be
more defensible than the model that replaces it.

### 7. A public status page
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
