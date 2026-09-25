<!--
Provenance: pasted by the founder on 25 September 2026 and captured here verbatim so it is not lost
when the scratch file goes. It is a DeepThink planning pass, AI-generated and marked "for reference
only" in its own last line. It is a PROPOSAL, not a ratified contract: nothing in it has been written
into packages/catalog, and no number in it (triage weights, crime thresholds, device prices, margins,
fee percentages, session lifetimes) is a decided fact yet. Each of those is a founder, clinical-lead or
commercial ruling that has to be taken before it becomes a contract number. The gating analysis — what
is already built, what needs which ruling, and the honest build order — is the ROADMAP entry
"Founder-requested — extended scope, captured 25 September 2026". Do not read a figure below as decided.
-->

# MyThuso Extended Scope (founder's DeepThink pass, 24 September 2026)

MyThuso Extended Scope — Security, Safety, Video Consultation, IoT, Marketplace, and Deployment Intelligence
Written 24 September 2026. This is a DeepThink pass on the full extended scope. It covers eight domains: (1) security protocols, (2) the online consultation screen, (3) nurse and doctor safety, (4) IoT device integration and triage scoring, (5) the device marketplace and onboarding incentive, (6) load-shedding and crime-data deployment intelligence, (7) the Control Tower's expanded safety and deployment power, and (8) the free band rule. Every recommendation is costed against what a pre-revenue South African product can actually afford.

Part 1 — Security protocols
1.1 The honest starting position
The Control Tower has no login. The ?role= switcher is a preview picker. Anyone who types the URL sees what you see. The founder access (PR #9) is a single-account login, dark by default. Production holds the Azure OpenAI key, the Azure Speech key, and live patient utterances from before today's redaction fix.

This is not a security posture. It is a demo. And the demo is fine — for the demo. The question is what comes after, and the answer has to be specific.

1.2 The authentication ladder
Five tiers, each triggered by a real-world event.

Tier	When	What	Cost
Tier 0 — Demo	Now	?role= switcher. No auth. No real data.	R0
Tier 1 — Founder	Now (PR #9)	Password + TOTP. Dark by default.	R0
Tier 2 — Staff demo	First staff demo	Shared demo accounts, short-lived, one per role. No real patient data.	R0
Tier 3 — Staff production	First paying tenant	Real IAM: email + password + TOTP, session management, RBAC, SCIM for bulk staff import.	R0–R5k/month (identity service is self-hosted)
Tier 4 — Patient	First patient using the app	Phone + OTP (SMS). Biometric on device. Session management.	R0.15–R0.50 per OTP
Tier 3 is the gate. Nothing commercial works without it. The identity service exists as a dark module (apps/api). Wiring it is Phase 2 work, and it is the single highest-priority item on the entire roadmap.

1.3 The three factors, and which to use where
POPIA does not mandate 2FA. But the Information Regulator's enforcement trend, and every serious health platform's own risk assessment, points the same way: health data is special personal information, and special personal information demands the highest safeguards. The practical reading:

Something you know — password. Minimum 14 characters, scrypt-hashed, never reusable across services.

Something you have — TOTP authenticator app. Free, works offline, works on feature phones with a QR code printed once. Not SMS (SIM-swap is a real South African attack).

Something you are — biometric on the device. Platform-native (Face ID, fingerprint). Never stored by MyThuso.

For clinical staff: password + TOTP mandatory. Biometric on device is encouraged but not required (a nurse's phone may be shared).

For patients: phone + OTP (SMS). Biometric optional. A patient who cannot or will not use a smartphone must still be able to book and receive care — the fallback is a phone call to the Thuso line, which the plan already declares.

For the founder: password + TOTP + hardware key (YubiKey or equivalent). The hardware key is the anchor for the external governance Module 11 describes. Cost: R1,200 once.

1.4 Session management
Absolute lifetime: 15 minutes for the founder, 8 hours for clinical staff on shift, 30 days for patients with a refresh token.

Idle timeout: 5 minutes for the founder, 15 minutes for clinical staff, 7 days for patients.

Revocation: every session revocable from the Control Tower. Revocation latency SLO: 60 seconds (a token that takes an hour to revoke is not revoked).

Concurrent sessions: one per device, three devices maximum per user. A new sign-in on a fourth device revokes the oldest.

Refresh tokens: rotated on every use. A reused refresh token revokes the entire family.

1.5 Encryption
Layer	Standard	Where
At rest	AES-256	Every database, every file, every backup
In transit	TLS 1.3	Every connection. TLS 1.2 accepted only for legacy clients, never for clinical data
End-to-end	For video consultations	WebRTC with DTLS-SRTP. The server relays, it does not decode
Field-level	For identity numbers, medical aid numbers	Sealed with a key held by apps/api/src/sensitive.ts. The database never sees plaintext
Key custody	KMS-wrapped, split custody	The plan's HSM/KMS gate (G14). Until it closes, keys are in the platform keystore with a documented rotation
The one gap that must close before the first real patient: the apps/api/src/sensitive.ts encryption key is a single key with no versions. A rotation requires the old key present or the old records do not open. The plan records this. It needs the versioned key ring the protection module already supports.

1.6 The demo-to-production cutover
The demo uses ?role=. Production uses real sessions. The cutover is a hard line, and the plan's control-tower-cutover.md is the document that describes it. What it must add:

Feature flag: MYTHUSO_AUTH_MODE=demo|production. In demo, the switcher works and every screen shows a banner: "Demo mode — no real patient data." In production, the switcher is gone and the banner is gone.

Data separation: the demo and production stores are different. A demo tenant never touches a production database. The plan's multi-tenancy (G7) is the mechanism.

No mixed mode. A session is either demo or production. Never both.

1.7 What the first real patient changes
The moment a real patient's data enters the system, four things become true:

The DPIA must be signed. Not "in draft." Signed by the Information Officer.

The Information Officer must be appointed. POPIA requires it. There is no workaround.

The audit trail must be unified. Every access to that patient's data must be one query away.

The breach notification process must be tested. A drill, not a document.

These are the four gates between demo and production. They are all governance, not code. They are all cheap. They are all unowned today.

Part 2 — The online consultation screen
2.1 What a consultation actually is
A consultation is not a video call. It is a clinical encounter with a structure: prepare, connect, assess, decide, document, follow up. The screen must serve all six phases, and it must do so on a South African network, on a phone, with load-shedding possible at any moment.

2.2 The screen, in full
text
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Thandi M. · 34F · Visit #12 · 14:32 SAST          [ 🔴 Live ] [ ⏹ ] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────┐  ┌───────────────────┐  │
│  │                                            │  │ Patient context   │  │
│  │                                            │  │                   │  │
│  │         [ PATIENT VIDEO ]                  │  │ Age 34 · Female   │  │
│  │                                            │  │                   │  │
│  │         ┌──────────┐                       │  │ Conditions:       │  │
│  │         │ [ YOU ]  │                       │  │ · Hypertension    │  │
│  │         └──────────┘                       │  │ · Type 2 diabetes │  │
│  │                                            │  │                   │  │
│  │                                            │  │ Meds:             │  │
│  │                                            │  │ · Amlodipine 5mg  │  │
│  │                                            │  │ · Metformin 500mg │  │
│  │                                            │  │                   │  │
│  │                                            │  │ Allergies:        │  │
│  │                                            │  │ · Penicillin      │  │
│  │                                            │  │                   │  │
│  │                                            │  │ Last visit:       │  │
│  │                                            │  │ 12 Sep · BP 148/92│  │
│  └────────────────────────────────────────────┘  └───────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Live readings (from patient's devices)                             │  │
│  │                                                                    │  │
│  │  BP       148/92 mmHg    ● 2 min ago    [ BP-200 ]  ⚠ 148/92      │  │
│  │  HR       78 bpm         ● 2 min ago    [ P-12 ]    ✓             │  │
│  │  SpO₂     97%            ● 2 min ago    [ P-12 ]    ✓             │  │
│  │  Glucose  6.2 mmol/L     ● 14 min ago   [ G-7 ]     ✓             │  │
│  │  Temp     36.8°C         ● 2 min ago    [ T-4 ]     ✓             │  │
│  │                                                                    │  │
│  │  ⚠ BP above the patient's usual range. Confirm the cuff is on the  │  │
│  │    upper arm, at heart level, and the patient has been seated       │  │
│  │    for 5 minutes.                                                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Note                                                               │  │
│  │                                                                    │  │
│  │ [                                                            ]     │  │
│  │ [                                                            ]     │  │
│  │                                                                    │  │
│  │ [ 🎤 Dictate ]  [ 📎 Attach ]  [ 📋 Template ▾ ]                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Actions                                                            │  │
│  │                                                                    │  │
│  │ [ Prescribe ]  [ Order test ]  [ Refer ]  [ Book follow-up ]       │  │
│  │ [ Escalate ]  [ End consultation ]                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
2.3 What each panel does
Patient context (right column). Age, sex, conditions, medications, allergies, last visit. Read from the health passport. A clinician does not have to ask what is already known. The panel is collapsible; on a narrow phone it becomes a swipe-up sheet.

Live readings (middle panel). The patient's connected devices, real-time. Each reading shows: the value, the age of the reading, the device that produced it, and a plausibility flag. A consumer device is marked advisory. A medical-grade device is marked trusted. The doctor sees the difference, because the tier matters.

The note (bottom panel). Dictation via the browser's speech recognition or the on-device microphone. Templates for the common consultation types (chronic follow-up, acute complaint, mental health, maternal). The note is not a free-text field. It is a structured document that feeds the record.

Actions. Prescribe, order a test, refer, book a follow-up, escalate, end. Escalate is always available, and it does not end the consultation — it raises a dispatcher's attention while the call continues.

2.4 What the screen does not do
It does not record. The plan's speech amendment is explicit: no passive recording. A consultation can be recorded only with explicit, recorded, two-party consent, and the recording is stored with the same protections as the record itself. The default is off.

It does not diarise. No automatic transcription in this scope. The doctor writes or dictates.

It does not run a second AI. GilbertOne can suggest a differential or flag a red flag, but only if the doctor asks, and only with the clinical-assist level and a clinician signed in. The consultation screen is not a chatbot.

2.5 The connection resilience
A South African video consultation must survive:

A 3G connection. WebRTC adapts. The screen shows the current quality and a "reduce video, keep audio" button. Audio is the priority.

Load-shedding at the patient's end. The call drops. The screen shows "Patient offline — last seen 14:35" and offers an immediate SMS or a callback. The consultation is not lost; it is paused.

Load-shedding at the doctor's end. The same, reversed. The system knows which end dropped, because it is the server's job to know.

A dropped call. The consultation can be resumed within 15 minutes without losing the note. After 15 minutes, it is marked "abandoned" with the reason.

2.6 The mobile layout
The consultation screen is used on a phone as often as a desktop. The mobile layout is:

text
┌─────────────────────────┐
│  Thandi M. · 34F   🔴   │
├─────────────────────────┤
│                         │
│   [ PATIENT VIDEO ]     │
│                         │
│   [ YOU ]  (small)      │
│                         │
├─────────────────────────┤
│  BP 148/92 ⚠            │
│  HR 78 ✓  SpO₂ 97% ✓    │
│  [ more readings ▲ ]    │
├─────────────────────────┤
│  [ Note ] [ Actions ]   │
│  (tabbed, not stacked)  │
└─────────────────────────┘
The context panel is a swipe-up sheet. The note and actions are tabs, not stacked panels, because a phone cannot show both.

2.7 The real-time IoT connection
This is the part that makes the consultation screen different from every other telemedicine product.

When the patient pairs a device, the reading flows to the consultation screen in real time. A doctor asking "take your blood pressure now" sees the reading appear on screen as the cuff inflates. A glucometer reading taken during the call is on the screen before the patient has finished speaking. A wearable's heart rate is a live number, not a report.

The technical shape: the device gateway (MQTT over TLS) publishes to a per-consultation topic. The consultation service subscribes. The doctor's screen receives the reading via WebSocket. Latency target: under 2 seconds from device to screen.

What the doctor sees that a nurse does not: the doctor sees the live stream. The nurse, on a home visit, sees the reading on their own device and records it. The control tower sees both, in the fleet view.

Part 3 — Nurse and doctor safety
The plan's field-safety section is the founder's stated deal-breaker. What it does not yet have is the full feature set.

3.1 The nurse's safety toolkit
Feature	What it does	Cost
Pre-visit risk score	Scores the visit against SAPS precinct data, time of day, and the nurse's own history. Advisory, not gating.	Free (data from SAPS/StreetSignal)
Two-person rule flag	Flags a visit that should have two people. Requires an override reason.	R0
No-lone-visits-after-dark	Flags any visit after sunset in a high-risk zone.	R0
Scheduled check-ins	Arrival, interval, departure. A missed check-in escalates on a timer.	R0
Silent panic	A button, a hardware fob, and a spoken duress word. All silent.	Fob: R500–R1,500
Live GPS trip tracking	The control tower sees the nurse's position, with store-and-forward for dead zones.	R0 (phone GPS)
Escort / buddy protocol	A safe-arrival confirmation.	R0
Verified parking	A map of safe parking near the visit.	Free (Google Maps)
Next-of-kin trip-window sharing	The nurse's nominated contact sees the visit window.	R0
Battery monitoring	Alerts the tower when a lone worker's device drops below 30%.	R0
Load-shedding routing	Avoids areas with active load-shedding during the visit window.	Free (Eskom API)
Post-incident care	A mandatory debrief, trauma support, incident report.	R0–R2k/month (counsellor retainer)
3.2 The doctor's safety
A doctor on a home visit has the same risks as a nurse, plus two more: the doctor is more likely to be alone, and the doctor is more likely to carry expensive equipment.

The doctor's toolkit is the nurse's toolkit, plus:

Equipment tracking. The doctor's bag is registered. A missing device is a flag.

Discretion mode. A consultation can be marked "discreet" — no location sharing with the patient, no visible app icon, a plain notification.

GBV-aware visits. A visit flagged for gender-based violence has a specific protocol: no visible arrival, a code word, a pre-agreed exit.

3.3 What the Control Tower sees
The tower's safety view is a live map, one row per field worker:

text
┌──────────────────────────────────────────────────────────────────────────┐
│  Control Tower · Field Safety                                            │
├──────────────────────────────────────────────────────────────────────────┤
│  Live now · 12                                                          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Nurse      │ Visit           │ Status      │ Risk  │ Since        │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Thandi M.  │ Milpark · 14:00 │ ● On site   │ 🟢 Low│ 14:02        │  │
│  │ Sipho K.   │ Soweto · 14:30  │ ● En route  │ 🟠 Med│ 14:28        │  │
│  │ Nomsa D.   │ Alex · 14:15    │ ⚠ No check-in│ 🔴 High│ 14:15       │  │
│  │ ...                                                              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Alerts · 1                                                         │  │
│  │                                                                    │  │
│  │ ⚠ Nomsa D. missed her 14:30 check-in. Escalation started at 14:35.│  │
│  │    Nearest responder: 4.2 km. SAPS 10111 notified.                 │  │
│  │    [ View on map ]  [ Call nurse ]  [ Escalate to emergency ]      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Map                                                                │  │
│  │                                                                    │  │
│  │    [ live map with nurse positions, risk zones, load-shedding     │  │
│  │      overlay, and the nearest responders ]                         │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
The risk score is not a number the nurse sees and obeys. It is a recommendation. The nurse can override. The override is recorded. The manager sees overrides in aggregate and intervenes on patterns. This is the plan's advisory-with-documented-override decision, applied to the field.

Part 4 — IoT devices, triage scoring, and the marketplace
4.1 The device capability matrix
Every device has a set of measurements it can produce. The triage scope is the union of those measurements, filtered by what the record actually accepts.

Device	Measures	Triage contribution	Cost
BP cuff	Systolic, diastolic, pulse	Cardiovascular risk, hypertension staging	R300–R800
Pulse oximeter	SpO₂, pulse	Respiratory risk, hypoxia	R200–R500
Glucometer	Blood glucose	Diabetes management, hypo/hyperglycaemia	R400–R900
Thermometer	Temperature	Fever, infection	R100–R300
Scale	Weight, BMI	Chronic disease, fluid retention	R200–R600
Wearable band	HR, SpO₂, sleep, steps	Trend, not diagnosis. Advisory only.	R300–R800
Peak flow meter	Peak expiratory flow	Asthma, COPD	R200–R400
ECG patch	Single-lead ECG	Arrhythmia (advisory)	R1,500–R3,000
4.2 The triage score from each device combination
The score is not a number. It is a set of available measurements, each with its own clinical weight, and the engine computes a composite only for the measurements it has.

Combination	Triage scope
Band only	Trend data. No clinical decisioning. The band's heart rate and SpO₂ are advisory.
Band + cuff	Cardiovascular screening. Blood pressure staging.
Band + cuff + pulse ox	Cardiovascular + respiratory screening.
Full kit (cuff, pulse ox, glucometer, thermometer, scale)	Comprehensive chronic disease monitoring.
Full kit + ECG patch	Cardiac monitoring (advisory).
The key insight: the triage scope is a function of the device set, and the device set is a function of the patient's willingness to buy. The marketplace's job is to make the next device's marginal value visible.

4.3 The free band rule
Every patient who signs up gets a free MyThuso Band.

What it measures:

Heart rate (continuous, optical)

SpO₂ (on-demand and periodic)

Sleep quality (accelerometer-derived)

Steps (accelerometer)

Skin temperature (periodic)

What it does not measure: blood pressure, glucose, ECG. Those require the cuff, the glucometer, the patch.

Why this works:

It is cheap. A Xiaomi Smart Band 11 Active is R649 retail; at volume, a private-label band with the same sensors is R250–R400. At R300, the band pays for itself in one consultation.

It creates the habit. A patient who wears a band opens the app. A patient who opens the app books consultations. A patient who books consultations buys the next device.

It is the on-ramp to the marketplace. The band is free; the cuff is R500; the glucometer is R600; the full kit is R2,000. Each step is a conversation about what the patient needs.

The band's clinical boundary: the band is a consumer device, tier 3 in the plan's device tiers. It is advisory. It never auto-creates an incident. Its readings are trend data, not diagnosis. This is the same boundary the plan already draws for consumer devices, applied to the band.

4.4 The marketplace
What it is. A section of the MyThuso app where a patient can buy devices, with the clinical justification for each.

The shape:

Recommended for you. Based on the patient's conditions, the devices that would expand their triage scope.

Your current coverage. A visual of what the patient's current devices can and cannot measure.

Add a device. Each device card shows: what it measures, how it expands the triage scope, the price, and the clinical justification.

The economics:

MyThuso takes a margin on each sale (10–20%).

The band is free; the margin on the cuff, glucometer, and scale funds it.

A patient who buys the full kit generates R400–R600 in margin across the kit, which covers the free band and the onboarding cost.

The marketplace's clinical gate: a device cannot be sold unless its model is on the allowlist, its DPIA is recorded, and its physiological ranges are declared. The same gate the plan already requires for pairing.

4.5 What the doctor and nurse see
The doctor sees the patient's connected devices in the consultation screen (§2.2): each device, its last reading, its age, its tier. The doctor knows instantly what data is available and what is not.

The nurse sees the patient's devices in the visit screen, before the visit:

text
┌──────────────────────────────────────────────────────────────────────────┐
│  Visit · Thandi M. · 14:00                                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Devices used by this patient                                            │
│                                                                          │
│  ● BP-200       Last reading: 148/92   ● 2 h ago   [ Trusted ]          │
│  ● P-12         Last reading: 97%      ● 2 h ago   [ Advisory ]         │
│  ● G-7          Last reading: 6.2      ● 14 h ago  [ Trusted ]          │
│  ○ T-4          Not paired yet                                       │
│                                                                          │
│  ⚠ BP above the patient's usual range. Check technique and confirm the   │
│    cuff position before recording.                                      │
│                                                                          │
│  [ Open the reading history ]  [ Request a new reading ]                │
└──────────────────────────────────────────────────────────────────────────┘
The nurse sees what the patient's devices have produced, not just what the nurse's own kit produces. This is the change that matters. The nurse arrives knowing the patient's recent history, not starting from zero.

The Control Tower sees the fleet across every patient, grouped by ward, by device class, by status. The fleet view is the aggregate; the per-patient view is the visit screen.

Part 5 — Load-shedding and crime-data deployment intelligence
5.1 The data sources
Source	What it gives	Cost	Access
Eskom national status API	The current stage	Free (via Apify, $0.20/1,000 calls)	Public JSON endpoint
EskomSePush	Area-level schedules and current status	Free tier, then paid	API
SAPS precinct data	Crime rates by precinct	Free (DataFirst, StreetSignal)	CSV, ArcGIS REST
StreetSignal	Aggregated SAPS data, safety scores	Free tier	API
SafetyBrief	Safety scores across 1,350+ precincts	Commercial	API
5.2 The deployment decision engine
For every visit request, the engine computes three scores:

1. Risk score (from SAPS precinct data).

The precinct's crime rate for the relevant category (violent crime, property crime).

The time of day. A visit at 14:00 scores lower than a visit at 19:00.

The nurse's own history in that precinct.

2. Load-shedding score.

The current stage.

The area's schedule during the visit window.

The patient's device status: if the patient's phone is the only device and the power is off, the visit's data collection is limited.

3. Logistics score.

Distance from the nearest nurse.

Travel time.

Transport availability.

5.3 The three deployment modes
Mode	When	What it is	Fee
Physical visit	Low risk, good logistics	A nurse visits.	Standard rate
Online consultation only	High risk, good connectivity	A video consultation. No nurse on site.	Lower rate
Hybrid	Medium risk	A video consultation first, a nurse visit only if needed.	Standard rate
Deferred	Very high risk, poor logistics	The visit is deferred to a safer time or a safer mode.	No charge
The engine's recommendation is advisory. The founder's decision (the plan's advisory-with-documented-override) applies: the dispatcher can override. The override is recorded.

5.4 The Control Tower's deployment view
text
┌──────────────────────────────────────────────────────────────────────────┐
│  Control Tower · Deployment Intelligence                                  │
├──────────────────────────────────────────────────────────────────────────┤
│  Today · 47 visits requested · 38 physical · 7 online · 2 deferred       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Risk map                                                           │  │
│  │                                                                    │  │
│  │  [ heat map: crime rates by precinct, with nurse positions,        │  │
│  │    load-shedding zones, and visit destinations ]                   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ High-risk requests · 3                                             │  │
│  │                                                                    │  │
│  │ ⚠ Soweto · 18:00 · 2 visits requested                              │  │
│  │    Crime rate: high · Load-shedding: stage 4 · No nurse nearby     │  │
│  │    Recommendation: online only, or defer to 07:00                  │  │
│  │    [ Accept ]  [ Override with reason ]                            │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ ⚠ Alex · 19:00 · 1 visit requested                                │  │
│  │    Crime rate: very high · Load-shedding: stage 6 · No lighting    │  │
│  │    Recommendation: defer to tomorrow 08:00                         │  │
│  │    [ Accept ]  [ Override with reason ]                            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Online-only zones · 4                                              │  │
│  │                                                                    │  │
│  │ Soweto · Alexandra · Hillbrow · Nyanga                              │  │
│  │ These zones are online-consultation-only after 18:00.              │  │
│  │ [ Edit zones ]                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
5.5 The AI flagging
GilbertOne's role in the deployment engine is narrow and bounded:

Summarise the risk. "This request is in Soweto at 18:00, stage 4 load-shedding, no nurse within 5 km. The nearest three visits today were all successful. The risk score is 7.2 out of 10."

Suggest alternatives. "Defer to 07:00, or offer an online consultation."

Flag patterns. "Alexandra has had three deferred visits this week. The pattern suggests the zone should be online-only after 17:00."

GilbertOne does not decide. It summarises, suggests, and flags. The dispatcher decides. This is the same boundary as every other clinical-adjacent decision.

5.6 The fee model
Mode	Fee	Rationale
Physical visit	Standard	A nurse travels, examines, documents.
Online consultation	60% of standard	No travel. The doctor's time is the cost.
Hybrid	Standard	A video call plus a possible visit.
Deferred	No charge	The visit did not happen.
The online consultation is cheaper because it costs less to deliver. The patient saves transport. The platform saves the nurse's travel time. The doctor's time is the same. The 40% saving is real, and it can be passed on.

Part 6 — What the Control Tower needs that it does not have
6.1 The five new Control Tower capabilities
Capability	What it does	Gate
Deployment Intelligence	The risk map, the load-shedding overlay, the three-mode recommendation.	Data contracts for Eskom and SAPS.
Field Safety Live	The live nurse map, the check-in status, the escalation.	Field-safety engine (already built) + a screen.
Device Fleet	The fleet overview, the provisioning wizard, the allowlist.	The device contracts (Phase 0) + the DPIA.
Consultation Monitor	A view of live and recent video consultations.	The consultation service (not built).
Safety Analytics	Override patterns, escalation patterns, zone risk trends.	The analytics layer (not built).
6.2 The safety analytics view
text
┌──────────────────────────────────────────────────────────────────────────┐
│  Control Tower · Safety Analytics                                        │
├──────────────────────────────────────────────────────────────────────────┤
│  This week                                                               │
│                                                                          │
│  Visits · 312 · Physical 248 · Online 58 · Deferred 6                    │
│  Overrides · 14 (4.5%) · By reason: logistics 6 · preference 5 · other 3 │
│  Escalations · 3 · All resolved within 12 minutes                       │
│  Missed check-ins · 2 · Both resolved by the nurse                      │
│  Panic triggers · 0                                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Zone risk trend                                                    │  │
│  │                                                                    │  │
│  │  Soweto    ▲ 12%   (crime data updated 3 days ago)                │  │
│  │  Alex      ▲ 8%                                                    │  │
│  │  Hillbrow  ▬ 0%                                                    │  │
│  │  Milpark   ▼ 4%                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Recommendation                                                     │  │
│  │                                                                    │  │
│  │  Consider moving Alexandra to online-only after 17:00.             │  │
│  │  The last three deferred visits in the zone were all after 18:00.   │  │
│  │  [ Accept ]  [ Dismiss ]                                           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
Part 7 — What I would add that you have not asked for
These are the features I would build that are not in the scope above, and why.

7.1 A consent receipt for every patient
Every patient sees, in the app, exactly what they have consented to, when, and why. The receipt is a record they can check. This is a POPIA obligation and an honesty mechanism.

7.2 A clinical decision audit trail for every AI-assisted decision
When GilbertOne suggests a differential, the suggestion is recorded with: the model, the prompt, the evidence, the doctor's decision, and the outcome. This is the artifact the medical director reads before signing a Tier 1 change.

7.3 A "why this recommendation" explainability layer
Every deployment recommendation (physical, online, deferred) shows its reasoning: the crime rate, the load-shedding stage, the nurse's distance, the patient's history. A recommendation the dispatcher cannot interrogate is a recommendation the dispatcher will not trust.

7.4 A device-recall and firmware-safety register
When a device model has a firmware vulnerability, every paired device of that model is flagged. The register is the fleet view's security overlay.

7.5 A nurse-safety training module
The safety features are only as good as the training. A short module — 20 minutes — on the check-in protocol, the duress word, the escalation ladder, and what to do if the app fails.

7.6 A doctor's "second opinion" request
A doctor in a consultation can request a specialist's opinion asynchronously. The specialist sees the note, the readings, the context, and responds. This is not a live consultation; it is a secure message with a clinical payload.

7.7 A patient-facing "what my band can and cannot do" screen
The free band is the entry point. The patient must understand its limits: it measures heart rate and SpO₂, not blood pressure and glucose. The screen is honest, and it is the first step in the marketplace conversation.

7.8 A load-shedding-aware appointment scheduler
When a patient books a visit, the scheduler checks the load-shedding schedule for the patient's area and the nurse's area. If both are off during the visit window, the scheduler suggests an alternative time. The patient is not left waiting for a nurse who cannot arrive.

7.9 A community-policing-forum integration
The plan mentions CPF integration. The feature is a per-zone contact list: the local CPF, the SAPS station, the armed-response partner. When a nurse is in a zone, the tower has the contacts at hand.

7.10 A "safe return" confirmation
The nurse's last check-in is the departure from the patient's home. The safe return is a second check-in when the nurse is back at a safe location. A missed safe return escalates.

Part 8 — What this costs, and what order to build it in
8.1 The cost profile
Item	Once-off	Monthly
Free band (per patient)	R300	—
Hardware fob (per field worker)	R500–R1,500	—
Hardware security key (founder)	R1,200	—
Eskom API	—	R100–R500
SAPS/StreetSignal data	—	R0–R2,000
SMS OTP (per patient/month)	—	R0.15–R0.50 per OTP
TOTP authenticator	R0	R0
Counsellor retainer	—	R2,000–R5,000
The band is the only item with a per-patient cost, and it is the one that generates revenue. At R300 cost and R400–R600 margin across the device kit, it pays for itself in the first kit sale.

8.2 The build order
Phase 0 (now): Contracts for everything in this document. The device capability matrix, the triage score model, the deployment decision engine, the free band rule, the band's clinical boundary.

Phase 1 (first tenant): Real IAM, the deployment intelligence data contracts, the field safety live view, the device fleet view, the consultation screen's contract.

Phase 2 (first video consultation): The consultation service, the WebRTC stack, the live reading pipeline, the mobile consultation screen.

Phase 3 (first marketplace sale): The marketplace, the band distribution flow, the patient-facing band explanation.

Phase 4 (commercial): The safety analytics, the deployment AI flagging, the CPF integration, the second-opinion request.

Part 9 — The one-paragraph version
The security posture moves from demo to production the moment a real patient's data enters the system, and that moment triggers four governance gates (DPIA, Information Officer, unified audit, breach drill) that are all cheap and all unowned. The consultation screen is a clinical workspace, not a video call — patient context, live device readings, structured notes, and actions in one screen. The free band is the on-ramp to the marketplace: it measures heart rate and SpO₂, it creates the app habit, and it funds itself through the device kit. The deployment engine combines SAPS crime data, Eskom load-shedding schedules, and logistics to recommend physical, online, or deferred — and the recommendation is advisory. The Control Tower's new power is the live safety map, the deployment intelligence, and the fleet view. None of it is built. All of it is scoped. The order is: IAM first, then the data contracts, then the screens.

This response is AI-generated, for reference only.