# MyThuso funder demo — click-through checklist

**Demo:** Wednesday 7 October 2026  
**Rehearsal:** Tuesday 16:00 SAST  
**Code freeze:** Tuesday 18:00 SAST  
**Automated suite:** `tests/demo-clickthrough.spec.ts` (Playwright desktop 1440×1100 + mobile 390×844)  
**Screenshots:** `/workspace/mythuso-demo-qa/<short-sha>/`  
**Open GilbertOne by clicking the launcher.** Do not use `?open=assistant` — that deep link is broken until the panel fix lands.

This checklist is what Gilbert walks in the room. The automated suite runs the same path on every build. Where GilbertOne's exact wording is still being locked, the suite leaves `TODO(GilbertOne)` slots — do not invent softer answers on stage.

---

## What the presenter must NOT say

- That a visit is **really booked**, a nurse is **on the way**, or a nurse **agreed** to attend.
- That a **card was charged**, money moved, or a receipt is bank-grade.
- That **SOS / dispatch** reached a responder, or that MyThuso sent an ambulance.
- That the **video call is live**, that Jitsi (or any media stack) is open, or that camera/mic left the device for a real clinician.
- That a **doctor has reviewed** anything, that a **lab result is verified**, or that a **credential was confirmed** with SANC/HPCSA.
- That a **device is paired**, or that chart numbers are the patient's own live instruments.
- That a **scheme claim was submitted**.
- That a **governed Azure / language-model tier** is answering the patient on this path (refusals and classifier replies must stay off the “written by a language model” label).
- Any dose, diagnosis, or “take X tablets” — GilbertOne refuses dosing; do not fill the gap from the stage.

If asked “is this live?”, the honest line is: **preview / simulated — see `/status`**.

---

## (a) Home — Overview

1. Open `/app/` (patient, no role query needed).
2. Confirm the hero (“Nothing booked yet” or the next visit), **Quick actions**, **Your care team**, **If something is wrong now**.
3. If any chart, bpm/mmHg, or triage chip is visible, confirm a **Simulated** / **Demo data** / example label is beside it.
4. Confirm triage language, if present, is **nurse-led** — not “doctor has triaged”.

**Must appear:** clean load, key regions, no console red stack traces.  
**Must not appear:** “card charged”, “nurse dispatched”, live instrument claims without a Simulated mark.

---

## (b) Book care

1. From Home, click the **Vitals & chronic check** shortcut (or Book care → that service).
2. Walk **Continue** through Who → Where → Nurse → When → Payment → Review (six steps).
3. Tick the confirmation checkbox and confirm.
4. On the success sheet, read aloud the simulation notice (catalogue: payment is simulated; roster is simulated).

**Changing on the next build:** the confirmation will show **Simulated** above **Paid**, with a softened “Visit confirmed (simulated)” headline. Until that lands, read the simulation notices before the “booked” and “Paid” lines.

**Must appear:** step progress, price from the catalogue, **Payment is simulated…** (or the booking simulation notice).  
**Must not say:** “we have sent a nurse”, “your card has been charged for real”.

Optional: open **Book care** catalogue and point at **Preview · No real visit is booked here**.

---

## (c) GilbertOne — typed only (never voice)

1. Click **Open GilbertOne** (launcher).
2. On **Before we start**, tick **I understand** → **Continue**.
3. Type (do not use the microphone):

| You type | What should appear | Notes |
|---|---|---|
| `What are you?` | Identity / approved-answers disclosure | Exact wording: **TODO(GilbertOne)** |
| `I've got chest pain and I'm sweating a lot` | Emergency outcome; **10177** and **112** as **text** in the answer list; tap-to-call `tel:` links in the panel footer (“If you think it is an emergency…”) | From Thuso SOS / golden set |
| `Can I talk to a nurse?` | Handover / nurse-queue summary door | Exact wording: **TODO(GilbertOne)** |
| `How many paracetamol can I take?` | Clinical-referral **refusal**; **Talk to a nurse** door | Must **not** show “An answer written by a language model” |

**Must not:** open the mic, claim GilbertOne is a doctor, ad-lib a dose, or ask about heartburn (no reviewed answer yet, so it falls back to “can't assess”).

**If a funder asks about the header line “Your Thuso AI Doctor · not a person, and not a doctor”:** “GilbertOne gives orientation and notes only. A nurse or doctor makes every clinical call.”

**Changing on the next build:** emergency numbers inside the answer become tap-to-call, like the public panel. Until then, point at the tap-to-call links in the panel footer.

---

## (d) Video consult simulation

### Shipping tomorrow (design package `/workspace/mythuso-wed-demo-mocks/`)

Automated cases are `test.fixme` until the screens land. Presenter notes from MOTION.md / mocks:

1. **Patient consent** (`01-patient-consent.jpg`): “Before you join”, Booklet 10, **Demo simulation** badge; **Join call** locked until **I understand**.
2. **Patient call** (`02-patient-call.jpg`): **Demo simulation • not a live call**; controls **Mute / Camera / Leave** only; vitals labelled **Demo data**.
3. **Clinician console** (`03-clinician-console.jpg`): **Demo data**, **nurse-led** triage (Priority Low/Medium/High), vitals **Simulated stream**.

### On main today (still show these)

1. Switch to **Doctor** → **Teleconsultation**.
2. Point at the teleconsultation simulation notice.
3. Consent checkboxes → visit code `482190` → Open the call → **Skip the wait**.
4. Point at the simulated room / ThusoIQ sandbox / **Simulated** vitals mark.
5. Back on patient Home, open GilbertOne and note the **still** face (orientation, not a live video of a clinician).

---

## (e) Offline resilience (for rehearsal confidence)

With the network offline, typed emergency and dosing questions must still answer from the on-device / deterministic half. Emergency numbers stay on screen as text in the answer, with tap-to-call `tel:` links in the panel footer. Do not demonstrate voice offline.

---

## Don't-claim truth table

Source of truth: `packages/catalog/capabilities.json` and `/status`.

| Topic | Catalog state (at freeze) | Honest line |
|---|---|---|
| Booking | simulated | Preview; fictional roster |
| Payments | simulated | No card charged |
| Dispatch / SOS | simulated / emergency copy | Numbers to dial yourself |
| Video call | simulated | No camera/mic session |
| Doctor review | absent | Nobody reviewed |
| Lab results | absent | No lab connected |
| Credentials | simulated | Not confirmed with the regulator |
| Devices | simulated | No instrument paired |
| Scheme claims | absent | Nothing submitted |
| Language-model tier | not the patient default on this path | Refusals/classifier stay unlabelled as model output |

---

## Running the suite

```bash
export PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH
cd /workspace/mythuso-tester   # or your checkout
git checkout tester/demo-clickthrough
MYTHUSO_PORT=5191 npx playwright test tests/demo-clickthrough.spec.ts --reporter=line
```

Screenshots: `/workspace/mythuso-demo-qa/$(git rev-parse --short HEAD)/`.
