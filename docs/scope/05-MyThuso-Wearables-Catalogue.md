# MyThuso × GilbertOne — Connected care catalogue

**Presentation pack for founder / procurement**  
**Date:** 22 September 2026  
**Rule:** Cuff and meter first. Watches are companions. Branding is sleeve + box + app unless the OEM allows a logo on the shell.

Prices below are **indicative retail bands in ZAR** for planning, not quotes. Confirm with SA distributors (Clicks, Dis-Chem, Omron SA, Withings partners, Huawei/Samsung retail).

The eight-page designed version of this catalogue (MyThuso-GilbertOne-Wearables-Catalogue.pdf, with product photography) was supplied alongside this file and is not committed; its text matches this file, and its founder notes page is reproduced at the end.

---

## How to read a SKU

| Field | Meaning |
|---|---|
| Sentinel | May this device *page* a clinician? Only cuff / medical ox / glucometer when live |
| Hub | How data enters GilbertOne |
| Brandable | Box / sleeve / logo-on-device / none |

---

## Line A — Clinical kit (ship first)

### MT-CUFF-01 — Care cuff
**Reference hardware:** Omron Bluetooth upper-arm (Evolv / Platinum / 7-series class) or Withings BPM Connect  
**Why:** Clinically validated upper-arm. This is the only BP source Sentinel may treat as live for a doctor page.

| | |
|---|---|
| Measures | Systolic, diastolic, pulse |
| Cuff | ~22–42 cm adult (order XL separately) |
| Link | Bluetooth; Withings also Wi-Fi |
| Hubs | Omron Connect / Withings → Health Connect / HealthKit, or partner SDK |
| Brandable | Sleeve, box, QR cradle. Logo on shell only if OEM programme agrees |
| Sentinel | Yes, if quality=live |
| Indicative | R1 200 – R3 500 |

Partner notes: Omron Connect Create (SDK + device sourcing). Withings Health Mate + BPM Connect / BPM Pro.

### MT-OX-01 — Finger ox
**Reference:** Beurer PO60 class, BerryMed BM1000C OEM, or similar CE/FDA fingertip with BLE.

| | |
|---|---|
| Measures | SpO2, pulse |
| Link | BLE |
| Brandable | Full white-label common (MOQ often ~500) |
| Sentinel | Confirm+; watch for darker-skin bias — pick a unit with published pigment performance |
| Indicative | R400 – R1 800 branded |

### MT-GLU-01 — Meter (mmol/L)
**Reference:** SA-available Bluetooth glucometer whose strips are on local supply (do not import an orphan strip).

| | |
|---|---|
| Measures | Capillary glucose mmol/L |
| Sentinel | Yes (hypo/hyper cards) |
| Brandable | Sleeve + app; meter logo often stays OEM |
| Indicative | R300 – R1 200 + strips |

### MT-SCALE-01 — Step-on scale
**Reference:** Withings Body / similar BLE+Wi-Fi scale.

| | |
|---|---|
| Measures | Weight kg (body comp is wellness only) |
| Sentinel | No |
| Brandable | Mat + box |
| Indicative | R800 – R2 500 |

### MT-PACK-01 — Home care box
App card, plus-code sticker, 10177 foldout, QR to pair cuff, “not an ambulance” insert. No measurement claim.

---

## Line B — Watches people already wear (do not rebrand the chip)

You **cannot** put MyThuso on an Apple Watch faceplate as if you manufactured it. You *can* pair via HealthKit / Health Connect / Huawei Health and sell a **strap + face + box**.

| SKU | Device | Hub | What GilbertOne may use | Brandable | Sentinel page? |
|---|---|---|---|---|---|
| MT-WATCH-APPLE | Apple Watch SE / Series / Ultra | HealthKit | HR, SpO2 estimate, sleep, activity | Strap, complication, sleeve | Nudge only |
| MT-WATCH-GALAXY | Galaxy Watch / Ring | Samsung Health → Health Connect | Same + extra flags via Data SDK later | Strap, watch face, box | Nudge only |
| MT-WATCH-HUAWEI | Huawei Watch / GT / Fit | Health Kit (HMS flavour) | HR, SpO2 estimate, sleep | Strap, face, AppGallery pack | Nudge only |
| MT-BAND-WL | J-STYLE / generic BLE band | Direct BLE or HC | HR, steps | **Full white-label** | Nudge only |

Indicative retail the *customer already paid*: Watch R2 000 – R16 000. Your attach: strap kit R150 – R400.

---

## Line C — White-label / OEM (your logo on the plastic)

| Source | What they sell you | MOQ ballpark | Use |
|---|---|---|---|
| BerryMed | SpO2 OEM, logo + box + SDK | ~500 | MT-OX-01 |
| Lyfeme / cuff OEM factories | Printed cuffs, colours, logo | Factory quote | Spare cuffs, XL |
| J-STYLE | Bands, rings, watches WL/OEM/ODM | Varies | MT-BAND-WL |
| Cardiowell-class cellular RPM | 4G cuff/ox/scale, white label | Programme | Rural, no smartphone pairing |
| SmartFuture-class RPM kits | WL BP + platform | B2B | Clinic discharge packs |
| DeviceLab platforms | Medical watch / ABPM platforms | High | Only if you want to be the legal manufacturer |

Cellular kits cost more per month but skip Bluetooth pairing — strong for older patients and load-shedding if the SIM is provisioned.

---

## Feature matrix (presentation table)

| SKU | BP | SpO2 | HR | Glucose | Weight | BLE | Cellular | HK/HC | Brand on device | Sentinel clinician page |
|---|---|---|---|---|---|---|---|---|---|---|
| MT-CUFF-01 Omron/Withings | ● | | ● | | | ● | Withings Pro / some 4G | ● | Sleeve | ● |
| MT-OX-01 | | ● | ● | | | ● | optional OEM | via app | ● OEM | ● if medical ox |
| MT-GLU-01 | | | | ● | | ● | | ● | sleeve | ● |
| MT-SCALE-01 | | | | | ● | ● | some | ● | mat | — |
| Apple Watch | est. | est. | ● | | | ● | | HK | strap | — |
| Galaxy Watch | est. | est. | ● | | | ● | | HC | face | — |
| Huawei Watch | est. | est. | ● | | | ● | | HMS | face | — |
| WL band | | est. | ● | | | ● | | maybe | ● | — |
| 4G RPM cuff | ● | | ● | | | | ● | cloud | ● | ● |

---

## Founder kit to photograph

1. Woman at a kitchen table, upper-arm cuff, phone open on GilbertOne.  
2. Finger ox on a dark-skinned hand (accuracy story).  
3. Wrist watch as *companion*, not the hero.  
4. Open MT-PACK-01: cuff + foldout + QR.  
5. Nurse inbox screenshot next to the cuff serial.

Copy on every box: **Not an ambulance. Call 10177 or 112.**

---

## From the PDF — who to buy from, and founder notes

**Do not:** print MyThuso on an Apple or Galaxy case and call it a partnership. Do not market watch-BP as diagnosis. Do not ship Google Fit. Do not skip 10177 on the box.

**What to hold up in the room**

1. The kitchen-table cuff photo. That is the product.
2. The matrix: only cuff, medical ox and glucometer page a clinician.
3. InCall is native 10177 first; sponsored nurse minutes second.
4. Sentinel S0 (patient nudge) before any doctor page.
5. Box line, every SKU: Not an ambulance. Call 10177 or 112.

Indicative bands are planning figures, not quotes. Confirm with SA distributors and OEM MOQs before the raise. GilbertOne is not a person and not a doctor.
