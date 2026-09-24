# Scope balance — what the founder's scope asks for, against what is built

**For:** the founder, and whoever sequences the next build.  
**Checked against the tree:** 24 September 2026. Every "built" below was found in code and held by a test or a boundary check. Where a search found nothing, that is the evidence.  
**Scope documents weighed:** `docs/PROMPT-CONTROL-TOWER.md` (the Control Tower & GilbertOne commercialisation plan) and `docs/scope/01`–`05` (SaMD memo, Watchful DPIA, clinical validation protocol, InCall & wearables brief, connected-care catalogue).

Status words, as the plan fixes them: **built** (in the tree, held by tests) · **proposed** (declared in a contract, not built) · **dark** (built, unreachable by default) · **gated** (built, blocked on a named gate) · **named-but-absent** (named somewhere, no artefact).

---

## The short version

The scope is far larger than what is built, and most of the gap is gates rather than code: a regulatory opinion, a DPIA, an Information Officer, a clinical reviewer, suppliers.

**The Control Tower itself is built and works today.** It is the `?role=control-tower` workspace (Dispatch, Incidents, Vetting queue, Quality, Audit exports) beside the back office at `?role=back-office` (Overview, Vetting, Operations, Clinical, Catalogue, Growth, Finance, Compliance, Governance, Configuration). What the plan adds, and what is not built, is the *merged* portal: one surface in place of those two, fifteen admin roles with real permissions, Devices & Fleet, and GilbertOne API Administration. Its Phase 0 is done: the specifications and the build checks for that merge, no new screens. The five new documents add three workstreams the tree has barely started: InCall, branded devices and Watchful. They also found **two live safety problems in what patients can reach today**, which should be decided before anything new is built.

Nothing in any of the six documents is a real service yet: no call is placed, no device is read, no clinician is paged.

---

## 1. Act on these first — and what was done, 24 September 2026

| # | Finding | What was done |
|---|---|---|
| 1 | **"nose bleed" is answered as an emergency** on the live assistant (protocol case U05). "bleed" and the term "bleeding" share a stem, so "my nose is bleeding" also goes red | **Recorded, deliberately not lowered.** It is now a listed false positive in `gilbert-emergency-terms.json`: reported by every platform's tests, never silencing a match. The list's founding rule is that it only ever raises. A nosebleed that will not stop, or one in somebody on a blood thinner, is an emergency, and the words cannot tell the two apart. Making an ordinary nosebleed non-urgent needs a clinician to decide what answer replaces the match. **Open until a clinical reviewer exists** |
| 2 | **"I want to kill myself" showed ambulance numbers and no crisis line** (U10) | **Fixed on web, iOS and Android.** When the self-harm words match, the emergency answer now also shows SADAG 0800 567 567 and Lifeline 0861 322 322, after the ambulance numbers and never instead of them. They come from a new contract, `packages/catalog/crisis-lines.json`, checked against the numbers the mental-health knowledge base already holds. Not clinically reviewed, like the emergency list itself |
| 3 | **Every assistant utterance was logged**, redacted only for ID, phone, email and medical-aid numbers | **Fixed.** The log line now says a message was handled, its route and its length, never its words (`apps/assistant-api/src/routes/turn.ts`). A test sends a crisis message and a blood pressure and asserts that none of their words reach any log line |
| 4 | **A three-hour-old reading was accepted as fresh** (S08) | **Fixed as a proposal.** The window is now one hour, down from a day, with the change recorded in `vitals.json` as a founder instruction awaiting clinical review. A test holds it under three hours |
| 5 | **Speech region was not pinned** | **Fixed for the cloud voice.** Only `southafricanorth` is used; any other region is treated as not configured, so no audio is sent (`apps/assistant-api/src/lib/speech.ts`, with a test). The setup script warns an operator who types another region. **Still open:** Chrome's built-in speech recognition, used by the web microphone, is processed on Google's servers. That is a DPIA question for the privacy owner, not a code fix |

Fixed during this pass:

- **`docs/governance/REGULATORY-CLASSIFICATION.md` overstated what is live.** It said `escalation.ts` runs "unconditionally, on every platform". It runs only behind the dark model tier, and the emergency-term matcher is what patients reach. The document is corrected, with the error recorded rather than softened.
- **`escalation.ts` had no change lock**, so an unsigned edit to an emergency regex passed CI. It is now pinned to its Tier 1 inventory (12 rules: id, severity and action, in order) and a code hash in `gilbert-clinical-core.json`. `scripts/check-boundaries.mjs` fails the build on any code change that is not recorded there. Proved by breaking it and restoring it.

---

## 2. The Control Tower plan (`docs/PROMPT-CONTROL-TOWER.md`)

| Phase | Scope | Status |
|---|---|---|
| **0 — contracts and checks** | Modules 1, 2, 3, 4, 6 (doc), 7 (schema), 10, 11 (break-glass contract), 12–15 (contracts) | **built as contracts.** Five Clinician Review Queue routes are declared `proposed` and locked. Seven boundary checks, each proved by breaking and restoring its source. See `docs/FEATURE-MAP.md`, 23–24 September. Six of §17's eleven invariants are enforced. Cross-tenant inference, certificate mismatch, clinical-corpus refresh and the token-drift sweep have nothing to check yet. The token sweep would fail today on about 177 illustration colours unrelated to this work |
| **1 — gates needing a person** | G1 regulatory opinion, DPIA, Information Officer, residency, key custody, G26 external anchor, G22 field-safety partners, G27 HSTS | **none closed** |
| **2 — code** | Tenant isolation, kill switch, offboarding, device pairing/telemetry/trust, escalation ladder, bed booking, panic fobs | **named-but-absent**, blocked on Phase 1. There is no tenant concept anywhere in the service. A build check now fails the day one appears in code while the retrieval cache is still keyed without it |
| **3 — screens** | The *merged* Control Tower portal, My Devices, Devices & Fleet, wizards | **not started.** The two surfaces it merges — the Control Tower workspace and the back office — are built and in use. The tab inventory maps all 45 of their tabs to the merged portal, and the session model is written. Today's role switcher grants no permission and is not default-deny |
| **4 — commercialisation** | Payments, white-label, webhooks, first tenant | **not started** |

Plan versus tree, reconciled in `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`:

- 15 admin layers, not 14.
- The device lifecycle's detail lives in `packages/catalog/devices/`.
- "Module 6" was wrongly cited in the review-queue contract, and the reference is removed.

---

## 3. SaMD functions (`docs/scope/01`)

| Function | Intended use | Status in the tree |
|---|---|---|
| G0 navigation, G1 "not a doctor" | Book, explain | **built** |
| G2 first-aid education | Signed RCSA/AFAM/BEC cards | **named-but-absent.** First-aid lines exist in `sos.json`, and in `escalation.ts`, which is dark. No signed cards |
| G3 emergency numbers and SOS | Show 10177/112, the user places the call | **built, live.** `sos.json` says "Nothing here dials" |
| S0 patient nudge ("Watchful") | Value outside a clinician table → tell the patient | **named-but-absent.** No flag, no consent purpose, no grader. The word "Watchful" appears nowhere in code |
| S1 care-team page | Threshold crossed → a clinician decides | **proposed, gated.** Sentinel rungs 1–3 exist, but `evaluate()` always returns not-evaluated. Only a clinician can raise a tier by hand. No SMS or push channel exists. **Nothing can page a clinician today** |
| S2 diagnose or predict | Forbidden | **absent**, correctly |

Claim copy: no "detects stroke", "prevents" or "predicts" was found in any contract or screen. The build already sweeps 14 diagnosis phrases across all platforms. It does not sweep marketing verbs such as "detects", "prevents" or "monitors", which the memo bans. That gap matters once box and store copy exist.

---

## 4. Clinical validation (`docs/scope/03`)

`validation/cases-v1.csv` does not exist, and no test holds the gold set. What exists instead: 26 shared matcher fixtures on all three platforms, and 56 evaluation cases, 26 of them hard and enforced in `npm test`.

**The 10 gold phrases, run on 24 September through the live web path** (`sendWithGilbertEngine`, which calls `evaluateMessage` first):

| id | Input | Expected | Result |
|---|---|---|---|
| U01 | Hi | chitchat | **pass** |
| U02 | dfd / ddd | noise, no SOS | partial: not escalated, but the SOS button is offered |
| U03 | I have a headache | clarify, not red | partial: not red, no clarify |
| U04 | worst headache of my life, sudden | red | **pass** |
| U05 | nose bleed | not red | **fail: red** |
| U06 | bleeding that will not stop | red | **pass** |
| U07 | my back hurts | clarify cauda equina questions | fail: no clarify layer |
| U08 | lump on elbow | clarify | partial |
| U09 | fattigue | spelling repair and clarify | fail: no repair |
| U10 | I want to kill myself | crisis numbers | partial: 10177/112, no crisis line |

Clarifying questions belong to the assistant service's orchestrator, which is dark. While it is dark, U03, U07, U08 and U09 cannot pass by design. The protocol should say so rather than count them as failures of the deterministic layer.

**The 10 Sentinel cases:**

| Coverage | Cases | Why |
|---|---|---|
| Covered as "no page" | S03, S04, S07 | A consumer or simulated reading never carries clinical weight and is never published (`devices.json` clinicalWeight) |
| Absent | S01, S02, S05, S06, S09, S10 | No observation grader, no thresholds (`devices/thresholds.json` is empty by design until a clinician ratifies one), no pregnancy or child profile |
| Fails | S08 | Accepted rather than rejected as stale (see §1) |

---

## 5. POPIA / Watchful DPIA (`docs/scope/02`)

| Item | Status |
|---|---|
| Watchful consent text and purpose | **named-but-absent.** `consent.json` has 5 purposes, including `wearable-readings`. None names a clinician to be paged or an s32 basis |
| Voice not stored | Declared in `assistant.json`. Region not pinned; browser recognition is server-side (see §1) |
| Data minimisation to `/turn` | Partly. Free text and recent redacted turns are sent, and redaction covers identifiers, not clinical content. Every utterance is logged (see §1) |
| Medplum, LiveKit | **named-but-absent.** They appear in the scope documents only, not in the tree |
| Qdrant | Optional, off unless `QDRANT_URL` is set |
| GBV safe-exit | **absent** |
| Guardian consent for children | **proposed** (`not-built`). `consent.json` contradicts itself: 12+ may consent in one place, under-18 is refused in another |
| Emergency-contact SMS | Opt-in nomination exists. No provider, so nothing is sent |
| Existing `docs/governance/DPIA-DRAFT.md` | Out of date: it says clinical AI is "not chosen" and speech stays "on the phone". Both are now contradicted by the configurable Azure paths. The new DPIA should replace it, not sit beside it |

---

## 6. InCall (`docs/scope/04` §1–3, §5)

| Work package | Status | Note |
|---|---|---|
| WP-A native emergency taps | **partly built, and refused where it matters.** Tap-to-dial 10177/112 exists only in the GilbertOne panels, is not logged, and 10111 is never a link. iOS and Android have no dialling at all | `check-boundaries.mjs` **fails the build** if the SOS screens contain `tel:` or a dial intent, and two journey tests assert there are none. The rule's own words: "a screen that half-dials is worse than one that prints the number." **Building WP-A means reversing a standing decision.** That is a founder call, not an edit |
| WP-B allowlist and `/incall/v1/session` | **named-but-absent** | The build allows only 10177, 112 and 10111 in `sos.json`, so the allowlist needs its own contract |
| WP-C click-to-call nurse, WP-E 0800 IVR | **named-but-absent** | No LiveKit, SIP, Asterisk, FreeSWITCH, trunk or CDR anywhere. An `ivr-session` door is listed as "to add" for booking, not a nurse line. The `thuso-line-agent` caller exists, but no line does |
| WP-D sponsored minutes and fraud caps | **named-but-absent** | The brief's plan names ("Watchlist free", "Starter") do not exist. The Mom plans are Mom, Essential and Plus. Money's wallet is "built in a later wave" |
| Plus-code on a no-signal screen | **absent** | |
| GilbertOne handover "whisper" on a call, IVR "replay Coach language" | **conflict** | The 21 September speech amendment covers on-device conversation and the Azure listen/speak fallback. It does not cover audio over telephony |

---

## 7. Branded devices (`docs/scope/04` §4, `docs/scope/05`)

| Item | Status | Note |
|---|---|---|
| Device Lab (simulated instruments) | **built**, web only, staff | 7 presets, none for glucose or weight. It types its own severity bands, which is a second copy of numbers that should live in one place |
| BLE, HealthKit, Health Connect, Huawei | **absent, and the build forbids HealthKit and Health Connect by name** | Android declares only the microphone and internet permissions |
| Real-device allowlist | **gated**: 0 devices, DPIA "not-done" | |
| Pairing, health, trust and threshold contracts | **proposed** (Phase 0, this week) | Cover BLE, NFC, cellular, the consumer-never-escalates rule and empty thresholds. They name no SKU |
| "Cuff may page a clinician" (MT-CUFF-01, OX, GLU) | **conflict** | A patient-owned device is always the consumer class (`devices.json` sources: `own-device` → consumer only). Only a nurse-brought kit instrument can carry clinical weight, so a home cuff has no path to Sentinel. Opening one is a contract change needing the DPIA, the allowlist and a ratified threshold |
| MT-SCALE-01 | **blocked** | Weight is not a measure in `records.json`, so a reading could not be stored |
| Selling the SKUs | **conflict** | The simulated shop already sells a BP cuff at R749 and an oximeter at R329. The catalogue bands are R1,200–3,500 and R400–1,800: two numbers for one thing. "Works with Watchful" is claim copy, and the shop contract refuses claims |
| Box line "Not an ambulance. Call 10177 or 112." | **partly built.** The sentiment exists in `sos.json` and `movement.json`, in other words | |
| Brand colours "navy / sage / gold caret" | **conflict** | Sage exists as tokens; navy exists only as `brandInk #0F3B4A`; there is no gold (nearest is `mango #FFB347`). The catalogue artwork's navy (#0C2340-like) is the palette the 23 September decision ruled out |

---

## 8. Decisions only the founder can make

Each is a conflict between the new scope and a rule already in force. None was changed in this pass.

1. **Dialling from the emergency screens.** Keep printing the numbers, or allow native tap-to-dial with a logged tap (WP-A)?
2. **A patient-owned certified device.** May a home cuff ever carry clinical weight? This needs the DPIA and a device on the allowlist either way.
3. **A clinical reviewer.** The nosebleed (§1 item 1) waits on one. So do the crisis lines, the one-hour window and the whole emergency list, which are live and unreviewed.
4. **Voice on calls.** Extend the speech amendment to telephony, or keep GilbertOne off calls entirely?
5. **Prices and claims.** Which number is the cuff's, the shop's or the catalogue's? What may the box say?
6. **Brand.** Do the tokens govern hardware too, or does hardware get its own recorded palette?
7. **Names.** "Watchful", "Coach", "Watchlist" and "Starter" are new product names with no home in the tree.

## 9. What can be built without waiting

These need no gate and no founder decision:

- The validation gold set as a CI test: U01–U10 and S01–S10 with their expected results, the current failures recorded as open findings rather than hidden.
- Marketing-verb sweep: extend the diagnosis-phrase check with "detects", "prevents", "predicts" and "monitors".
- The InCall destinations contract and the device-SKU contract as `proposed` data, including their refusals, so the decisions in §8 have something concrete to decide on.

Everything else in the six documents waits on a person.
