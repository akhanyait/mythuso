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

---

## Outstanding — work the product already implies

### 1. Blocking, and visible in the first five minutes

- **A past visit cannot be opened.** A completed visit has no summary, no "what the nurse found",
  no rebook. It is the screen a returning patient wants most, and the clinical data behind it
  already exists in `records.json`.
- **A cancelled visit shows no reason and no refund state**, though both are now in
  `cancellation.json` and the cancel flow records them.
- **The Health Passport has no trends screen and no device permission screen.** Three device
  integrations are offered and none can be opened.
- **A family member's profile does not exist.** You cannot book for them from there, nor see or
  change what you have shared.
- **`emergency` has no partner and the SOS screen says so** — but the escalation path from a nurse
  in a house to an ambulance is the single most consequential unfinished journey in the product.

### 2. Structural, and invisible until it bites

- **Per-entry stylesheets.** Every entry ships ~140 kB of CSS including screens it never renders —
  a patient downloads the dispatch board's rules and the admin console's tables. The same defect as
  the map bundle, one layer down, and the fix is the same shape.
- **A 300 weight in the Inter subset.** The design language calls for hairline numerals; the subset
  starts at 400 and `font-synthesis` is off, so the reference's thinnest figures cannot be drawn.
- **The native apps have not had the glass pass.** iOS and Android build green and carry the new
  palette, but not the shapes. Three apps that look like relatives rather than one product.
- **`docs/FLOW-COMPLETENESS.md` is a snapshot, not a check.** It was true when written and several
  of its rows are now closed. A walked-journey audit that runs in CI would keep it honest.

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

### 2. A visit summary a patient can act on
After a visit: what was measured, what was in range, what the doctor said, what happens next, and
one button to rebook. Every part of that already exists in the clinical record; nothing assembles
it for the person it is about.

### 3. Offline capture for the nurse
A nurse in a house in Soweto with one bar cannot lose an assessment. The kit capture flow already
has an offline queue; the rest of the clinical capture does not. This is a working-conditions
feature and it is the kind of thing that decides whether nurses stay.

### 4. A sponsor's view
`business-model.json` already has sponsored care and the family screens already show "Sponsored
care" as a state. Nobody can see what they are paying for. This is the second revenue line in the
proposal and it has no screen at all.

### 5. Nurse earnings forecasting
Earnings shows what has been earned. A nurse deciding whether to take a shift wants to know what a
week looks like if she does. The arithmetic is already in `earnings.json`.

### 6. An "explain this to me" layer on the Health Passport
Reference ranges are already rendered; what a reading *means* is not. This is where `screening`
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
