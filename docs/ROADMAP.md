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

Four of the five that were here are closed, and `docs/FLOW-COMPLETENESS.md` names the commit for
each: a past visit opens and rebooks, a cancelled one shows its reason and which side of the window
it fell on, the trends screen draws every reading against the contract's ranges, and a family
member's profile shows their visits and books for them.

- **The Health Passport still has no device permission screen.** Three device integrations are
  offered and the More tab now says plainly that none is connected — but *Review permission* does
  not open anything.
- **`emergency` has no partner and the SOS screen says so** — but the escalation path from a nurse
  in a house to an ambulance is the single most consequential unfinished journey in the product.
- **"Chat to our care team", at the foot of the booking catalogue, opens a booking.** There is no
  care team chat. It is the one journey still marked *blocking* in the flow audit, and the fix is
  either a screen or removing the control.

### 2. Structural, and invisible until it bites

- **The native apps have not had the glass pass.** iOS and Android build green and carry the new
  palette, but not the shapes. Three apps that look like relatives rather than one product.
- **The controls in `docs/PRIVACY-AND-SECURITY.md` are more of them than they were.** The document
  audits its own twenty-six rows: eleven are now implemented, five partial and six absent, up from
  six, four and twelve. The gate and the vetting vault are no longer libraries with test suites —
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
- No VoiceOver or real-hardware testing has been done on either native app.

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

## What I would not build yet

- **Anything AI-facing.** `screening` and `voice` are both blocked on a model, a vendor and a
  licence, and both are the easiest things in this product to overstate. The capability contract
  already refuses them by name.
- **A second city.** Geography is contracted and the arithmetic generalises, but every operational
  assumption in the product is Johannesburg's.
- **Wearables.** Three device integrations are already offered and none is connected. A fourth
  would be a fourth thing that does not work.
