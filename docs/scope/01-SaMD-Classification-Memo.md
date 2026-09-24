# 01 — SaMD / AI-ML classification memo

**Product:** MyThuso GilbertOne, including Vitals Sentinel  
**Document:** Internal classification and intended-use memo for counsel and SAHPRA engagement  
**Version:** 0.1 draft — not filed  
**Date:** 22 September 2026  
**Not legal advice.** Regulatory counsel must own the filed version.

---

## 1. Purpose

Record the *intended use* of each software function so we do not accidentally place a wellness nudge and a deterioration alarm in the same regulatory bucket. SAHPRA MD08-2025/2026 treats AI/ML that analyses biosignals and alerts to abnormalities as an AI-enabled medical device. Classification follows the Medicines Act definition of medical device plus SAHPRA Class A–D and, as a cross-walk, IMDRF SaMD N12 categories I–IV.

## 2. Split the product (do not classify “the app” as one blob)

| Function | Intended use (plain language) | Medical device? | Proposed posture |
|---|---|---|---|
| **G0 Navigation** | Book a nurse, find results, explain MyThuso | No | Out of device scope |
| **G1 Identity / disclaimer** | “Not a doctor” | No | Out of scope |
| **G2 First-aid education** | Show RCSA/AFAM/WHO BEC steps after the user already knows they need help | Borderline wellness / education if it does not triage | Keep wording educational |
| **G3 Emergency numbers + SOS UI** | Show 10177/112; user places the call | No (information) | Out of scope |
| **S0 Sentinel nudge** | Tell the *patient* a device value is outside a published table; ask them to repeat / consider calling | **Likely device** if we claim monitoring of a disease state | Lowest-claim wording; still file a memo |
| **S1 Care-team page** | Notify a rostered nurse/doctor that a threshold was crossed so *they* decide | **Yes — CDS informing/driving management** | Do not enable until classification + QMS |
| **S2 Diagnose / predict stroke, deterioration** | Forbidden in current roadmap | Would be high-class SaMD | Not built |

If marketing, App Store text, or a nurse script says “detects stroke” or “prevents crisis,” you have moved the whole Sentinel into treat/diagnose-critical (IMDRF IV / SAHPRA high class). Ban that copy.

## 3. IMDRF SaMD cross-walk (N12)

Significance × condition:

| | Inform management | Drive management | Treat / diagnose |
|---|---|---|---|
| Critical | II | III | IV |
| Serious | I | II | III |
| Non-serious | I | I | II |

**S0 proposed:** Inform + serious (hypertensive crisis is serious) → **Category I–II**.  
**S1 proposed:** Drive management + serious/critical (page a clinician about possible crisis) → **Category II–III**.  
**S2 if ever built:** Treat/diagnose + critical → **Category IV**. Do not build.

SAHPRA Class A–D is not identical to IMDRF I–IV. Software that *drives clinical decisions with significant harm if wrong* is described in MD08 as likely **Class C or D**. Treat S1 as **Class C until counsel says otherwise**.

## 4. Intended-use statements (lock these)

**S0 — allowed on the box**

> GilbertOne Watchful (nudge) informs the user when a measurement from a device they already use falls outside a clinician-authored table. It does not diagnose. It does not recommend a medicine. It shows first-aid information and public emergency numbers. The user decides whether to call 10177 or a clinician.

**S1 — only after gates**

> GilbertOne Watchful (care-team) sends the same measurement, time, device type and the user’s symptom answers to a clinician who has accepted Watchful for that patient. The clinician remains responsible for assessment and treatment. GilbertOne does not diagnose or prescribe.

**S2 — not intended**

> GilbertOne is not intended to detect, predict, diagnose or treat stroke, myocardial infarction, sepsis or any other condition from wearable signals.

## 5. What is “AI/ML” here

- Threshold compare: **deterministic rules**, not a learned model. Still software with a medical purpose if S0/S1 claims monitoring.  
- Language model: **not** used to set grade or urgency. If the writer only recites a signed card, argue it is not the SaMD core.  
- Do not let a future “smarter Sentinel” sneak an ML risk score into S0 without a new memo.

MD08 still lists predictive algorithms and wearable alerting. A rules engine that alerts on biosignals can be in scope even without a neural net. Classify on *intended use*, not on whether you used PyTorch.

## 6. Manufacturer duties if S1 is a device

1. SAHPRA medical-device **establishment licence** (s22C) for manufacture/distribution as applicable.  
2. Person responsible / authorised representative.  
3. QMS aligned to device software (IEC 62304 lifecycle; ISO 14971 risk).  
4. Clinical evaluation thinking per SAHPGL-MD-16 when claiming performance.  
5. Change control: editing `sentinel-thresholds.json` is a device change.  
6. Post-market: false-negative crisis and false-positive flood are reportable events once it is a device (SAHPGL-MD-03).  
7. Cybersecurity and data integrity (MD08 themes).  
8. Label: protocol version, “not a diagnostic,” wearable ≠ cuff.

## 7. Recommendation

| Phase | Ship? | Regulatory action |
|---|---|---|
| G0–G3 + first-aid cards | Yes, with educational copy | Counsel letter that these are not devices |
| S0 nudge, flag `sentinel.nudge` | Staff pilot only until memo signed | File internal memo; consider informal SAHPRA query |
| S1 clinician page | Dark | Establishment licence path + Class C working assumption + validation (§03) |
| S2 | Never in this roadmap | — |

## 8. Sign-off block

- Founder:  
- Regulatory counsel:  
- Clinical reviewer:  
- Date of next review:
