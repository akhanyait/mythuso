# 02 — POPIA processing record and DPIA (Watchful / Sentinel / wearables)

**Responsible party:** MyThuso (legal entity to be named)  
**Process:** Watchful vitals, wearable hubs, clinician page, voice/video  
**Version:** 0.1 draft  
**Date:** 22 September 2026  
**Not legal advice.** Privacy owner files the live DPIA.

---

## 1. Purpose of processing (lock)

Primary: *provide care navigation and, if Watchful is on, notify the patient and a nominated clinician about threshold events so a human can act.*

Not permitted: marketing, scheme underwriting, employer wellness scoring, sale of vitals, training a public model on identifiable traces.

## 2. Lawful basis (POPIA)

Health vitals = **special personal information** (s26–32).

| Activity | Proposed basis | Notes |
|---|---|---|
| Account + visits | Contract + consent | Ordinary MyThuso |
| Health record in Health Passport | s32: healthcare institution / professional, confidentiality, treatment and care | Confirm MyThuso is a “healthcare institution or facility” or process only under consent + operator of a registered practice |
| Wearable read (HealthKit / HC / Huawei) | **Explicit consent** + OS permission | Purpose string must match |
| S0 nudge to patient | Consent to Watchful | Can withdraw; care continues |
| S1 page to nurse/doctor | Consent + s32 treatment | Clinician must have accepted; name them in the consent text |
| Emergency contact SMS | Separate consent | Off by default |
| Voice audio | **Not stored** by default. Transcript after redaction only if needed for the turn | Browser/Azure operators |
| Device Lab | Synthetic only | No real PHI |

If MyThuso is *not* a health establishment, do not lean on s32 alone — use informed consent and a clinician entity that is.

2026 health-information regulations: if you behave like a medical scheme or managed-care organisation, map those extra duties.

## 3. Data minimisation

Send to `/turn` and to the LLM **only**:

- the one Observation (value, unit, time, quality, device class)  
- answers to the two symptom questions  
- jurisdiction and age-band / pregnancy flag if given  

Never: full Health dump, GPS trail, address book, raw PPG, raw audio.

## 4. Data map

| Data | Source | Store | Recipients | Retention |
|---|---|---|---|---|
| Hub vitals | Apple / Samsung-HC / Huawei | On device until a turn; then Observation in Medplum | Graph, rostered clinician | Session + record policy (e.g. 6 years if a health record) |
| Threshold grade | Sentinel | AuditEvent | Ops, clinician | Same |
| Symptom answers | User | Handover Composition | Roster | Same |
| Voice | Mic | None by default | Azure Speech ZA North as operator if cloud STT | Zero retention config |
| Video room | LiveKit | Off by default | Joined nurse | None unless separate consent |
| SIM lab | Fake | Flag simulated | Nobody clinical | Dev only |

## 5. Operators (list and contract)

Azure Speech · LiveKit · push/SMS vendor · cloud host (ZA) · Qdrant/Medplum host.  
Each: operator agreement, no use for their own models, breach 24–72h notice, ZA or adequacy.

## 6. Rights

Access, correction, deletion (with health-record exceptions), objection, withdraw Watchful.  
Refuse-AI path: Booklet 20 — still book a nurse without Sentinel.

## 7. Security

- Encryption in transit and at rest  
- Separate FHIR store from the public web host  
- Role-based page access  
- No clinician page to a number that is not on the roster  
- GBV safe-exit: never SMS “home” contact if that mode is on  
- Children’s Watchful: guardian consent only  

## 8. DPIA risks (summary)

| Risk | Mitigation |
|---|---|
| Wrong page / missed page | Two-step confirm; cuff > watch; freshness; human still decides |
| PHI in a language-model log | Redaction; no raw utterance in routine logs |
| Wearable false alarm flood | Dedupe; quiet hours; source ranking |
| Cross-border speech | Azure `southafricanorth` or local STT |
| Family phone shared | Quiet mode; PIN; no auto-speak of readings |
| Vendor training on audio | Contractual ban + zero retain |

## 9. Watchful consent text (draft)

> Watchful looks at measurements you allow from Apple Health, Health Connect or Huawei Health, or from a cuff or meter in this app. If a value is outside a table written by our clinical team, GilbertOne will notify you. If you choose, we will also notify the MyThuso nurse or doctor you name. GilbertOne is not a doctor and does not diagnose a stroke or heart attack. If you feel very unwell, call 10177 or 112. You can turn Watchful off and still use MyThuso.

Show protocol version and “who will see this.”

## 10. Sign-off

Information officer · Deputy · Clinical · Security · Date of review.
