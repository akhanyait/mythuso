# 04 — MyThuso InCall, branded wearables & custom products

**Audience:** Founder pack + developer brief  
**Product:** MyThuso / GilbertOne  
**Date:** 22 September 2026  
**Status:** Scope for investment and build. Not a telecoms licence application.

GilbertOne stays not-a-doctor. InCall does not replace 112/10177 on the handset. Branded wearables are wellness hardware unless a certified device and SAHPRA path say otherwise.

---

## 0. What you are asking for

1. People in the app tap **Call police / ambulance / hospital / my nurse / my doctor** and the call is **free to them**.  
2. Backend may be Asterisk (or better).  
3. Founder story: MyThuso-branded watches, cuffs, packaging, and other custom products.  
4. Developers get a buildable scope, not a slogan.

---

## 1. Tell the founder the truth about “free calls”

In South Africa:

- **112** from a mobile is already an emergency route and must keep working even if our app is closed or data is dead.  
- **10177 / 10111** are public emergency numbers. Many VoIP providers are **not** a reliable way to reach them. Do not make InCall the *only* way to get an ambulance.  
- “Free for the user” means **MyThuso pays** origination + termination (or buys an 0800). That is a unit-cost business, not a software feature.  
- If you originate every call from your PBX to a mobile doctor, you pay per minute. Fraud (stolen accounts calling Nigeria) can bankrupt a startup in a weekend.

**Positioning that is fundable**

> “InCall: tap-to-call care and emergency numbers from the app. Public emergency numbers always fall back to the phone dialler (112 / 10177 / 10111). MyThuso-sponsored calls to our nurse line and allowlisted hospitals. 0800 MyThuso for people with no data.”

Do not promise “call any number in the world free.”

---

## 2. InCall — product scope

### 2.1 What the user sees

Screen: **Need to talk to a person**

Buttons (examples):

| Button | Destination type | Who pays |
|---|---|---|
| Ambulance | Native `tel:10177` and `tel:112` | Network / already free emergency |
| Police | Native `tel:10111` | Same |
| GBV / SADAG / Childline | Native `tel:` to those numbers | Usually toll-free already |
| MyThuso nurse | InCall bridge to roster queue | MyThuso |
| My nominated doctor | InCall only if number is verified on file | MyThuso or capped minutes |
| Closest public hospital switchboard | Allowlist only | MyThuso, rate-limited |
| Poison information | Native or allowlist | Check if 0861 is free to caller |

**Hard rule:** Emergency buttons use the **device dialler first**. InCall is a second path when data works. Vodacom-style 112 apps still need coverage; we do not compete with that for life-threat. LiveKit video stays for “nurse can see,” InCall is for “nurse can hear on a PSTN phone.”

### 2.2 Call types

| Code | Flow |
|---|---|
| `NATIVE_EMERGENCY` | Open native dialler. No PBX. Log the tap. |
| `INCALL_CLICK` | App WebRTC → our switch → SIP trunk → allowlisted number |
| `INCALL_0800` | User dials 0800-xxx from any phone → IVR → nurse / GilbertOne voice / emergency info |
| `CALLBACK` | User requests “call me on this MSISDN”; we originate to them then bridge (costs more, useful if they have no data) |

### 2.3 GilbertOne on the call (optional phase)

- User taps nurse.  
- While ringing: Coach can stay on screen.  
- When answered: human takes audio; bot becomes the handover whisper to the nurse (“BP 182/114 cuff, FAST no”).  
- Do **not** put the LLM on a live emergency call as the only voice.

---

## 3. Telephony architecture (what to tell developers)

### 3.1 Recommendation

| Layer | Choice | Why |
|---|---|---|
| App media | **LiveKit** (already in video scope) or SIP.js | Same room stack |
| Programmable voice / PSTN | **Licensed SA CPaaS / SIP trunk** first (e.g. a local ECS holder) | Numbers, 0800, emergency routing, invoices |
| Self-hosted switch | **FreeSWITCH** if you must own media at scale + WebRTC; **Asterisk + ARI** if the team already knows dialplans | Asterisk is fine under a few hundred concurrent; FreeSWITCH is stronger for WebRTC↔PSTN |
| SBC | Kamailio or the trunk provider’s SBC | Don’t expose Asterisk on 5060 to the internet |
| Recording | Off by default. If on: separate consent, POPIA | Health call |

**Do not start by building a carrier.** Resell a licensed ECS trunk. MyThuso is the app; the trunk holder is the licensee. Confirm in writing you are a reseller, not an unlicensed ECS provider.

### 3.2 Reference flow

```
[App]  tap “Call nurse”
   → POST /incall/v1/session  { patient_id, dest_id, purpose }
   → policy: allowlist + wallet + fraud score
   → LiveKit SIP egress  OR  FreeSWITCH originate
   → SIP trunk (ZA licensed)
   → nurse DID / queue
   → CDR + AuditEvent
   → optional whisper of handover text to nurse agent
```

Emergency tap:

```
[App] tap 10177
   → log
   → window.location / Intent ACTION_CALL tel:10177
   → if no GSM: show “no signal — try 112 / go to casualty” + plus-code
```

### 3.3 Asterisk vs FreeSWITCH vs “don’t host”

- **Asterisk:** good if one engineer knows `extensions.conf` / ARI, low concurrent nurse calls, queues, IVR. WebRTC is extra work.  
- **FreeSWITCH:** better if InCall + browser audio + later high volume.  
- **Buy CPaaS (recommended for founder pitch year 1):** faster, licensed numbers, 0800, less fraud surface. Revisit self-host when minutes are the P&L line.

LiveKit already speaks SIP. That is the least-new-moving-parts path: LiveKit room → SIP outbound via a ZA trunk.

### 3.4 Allowlist (non-negotiable)

```json
{
  "destinations": [
    { "id": "za.ambulance", "tel": "10177", "mode": "NATIVE_EMERGENCY" },
    { "id": "za.police", "tel": "10111", "mode": "NATIVE_EMERGENCY" },
    { "id": "za.112", "tel": "112", "mode": "NATIVE_EMERGENCY" },
    { "id": "mythuso.nurse", "sip": "queue/nurse-za", "mode": "INCALL_CLICK", "cap_min": 20 },
    { "id": "patient.nominated_clinician", "mode": "INCALL_CLICK", "verify": "otp_plus_roster" }
  ]
}
```

No free-text dial pad in v1.

### 3.5 Fraud and cost controls

- Auth + device attestation  
- Per-user daily minute cap (e.g. 15 min sponsored)  
- Velocity: max 3 outbound/hour except emergency taps  
- Geo: ZA numbers only in v1  
- Alert if one account burns >R50/day  
- CLI / caller-ID: show MyThuso nurse line, not the patient’s number, unless the clinician needs to call back  

### 3.6 Cost model (founder slide)

Use placeholders; replace with a real quote.

| Item | Order-of-magnitude |
|---|---|
| SIP trunk / CPaaS | Setup + R/min mobile terminate (~R0.40–R1.00+; get a quote) |
| 0800 number | Monthly + higher per-minute (you pay both legs) |
| FreeSWITCH/Asterisk VM | Modest unless you scale media |
| LiveKit + TURN | Already in video budget |
| Fraud reserve | Budget 10–20% of minutes year 1 |
| Support / IVR | Human roster — this dwarfs SIP cost |

**Investment line:** “We subsidise care calls; we never subsidise random PSTN.” Emergency stays on GSM so we do not hold someone’s life behind our prepaid trunk.

---

## 4. Branded wearables & custom products

### 4.1 Story for the founder

MyThuso is a **care system**, not only software. A cuff that says GilbertOne on the bezel feeds Sentinel, opens Coach, and can tap InCall to the nurse. Hardware is a distribution and trust object. It is also a SAHPRA object if you claim it measures for diagnosis.

### 4.2 SKU ladder

| SKU | What it is | Claim you may make | Claim you may not |
|---|---|---|---|
| **MT-PACK-01** | Box: app card, plus-code sticker, first-aid foldout, 10177 | Brand / education | Medical device |
| **MT-CUFF-01** | White-label validated BP cuff, Bluetooth, MyThuso firmware/app pair | “Works with MyThuso Watchful” if the cuff itself is a registered/licensed device from the OEM | “Prevents stroke” |
| **MT-OX-01** | Pulse ox, same rules | Wellness + app pair | Diagnose COPD |
| **MT-BAND-01** | Fashion/wellness band, HR only | Steps / HR in the app | Medical BP |
| **MT-WATCH-FACE** | Watch face / complication “tap GilbertOne” | Navigation | Clinical measurement if the watch is not a device |
| **MT-SIM / APN** | Later: zero-rate data APN with an MNO | Product | “Free internet forever” |
| **MT-0800** | National care number on the box | Care access | EMS replacement |

Start with **pack + cuff from an OEM who already has a device licence**. You brand the sleeve and the app pairing. You do not design a cuff in a WeWork.

### 4.3 Wearable decoration scope (developers + ops)

- Colour: MyThuso navy / sage / gold caret  
- Laser/print: `mythuso.` + GilbertOne robot mark  
- QR on the cradle → pair flow + Watchful consent  
- Box insert: “Not an ambulance. Call 10177.”  
- Serial → asset registry → Observation.device  

### 4.4 Hardware engineering (what developers actually do)

- BLE GATT profiles already in the IoT spec  
- Pairing screen, SIM watermark until live  
- OEM SDK if they require it  
- Firmware updates are the OEM’s problem in v1  
- Type approval sits with the OEM; your establishment licence if you *manufacture or import* as the legal manufacturer — counsel  

### 4.5 Retail / clinic channel

- Ideal Clinic / private practice starter kit  
- Family pack (helper card + cuff)  
- Corporate wellness later (POPIA employer trap — don’t lead with that)

---

## 5. Developer work packages

### WP-A  Native emergency taps (week 1)
`tel:112` `tel:10177` `tel:10111` + log + plus-code on screen. No PBX.

### WP-B  Allowlist service
`packages/catalog/incall-destinations.json` + `/incall/v1/session`.

### WP-C  Click-to-call nurse
LiveKit SIP or CPaaS call out to nurse queue. CDR in Medplum AuditEvent.

### WP-D  Caps, fraud, billing events
Wallet of sponsored minutes per plan (Watchlist free = 0 sponsored PSTN; Starter = N minutes).

### WP-E  0800 IVR (after WP-C)
“Press 1 nurse, 2 emergency numbers spoken, 3 replay Coach language.”

### WP-F  Hardware pairing
MT-CUFF-01 Device Lab + one real OEM cuff.

### WP-G  Brand pack
Assets, QR, serial admin.

**Do not start WP-E/F until WP-A is in production.** People must be able to leave the app and dial.

---

## 6. Legal / compliance add-on

- ICASA: use a licensed trunk; don’t sell “MyThuso Telkom.”  
- RICA if you assign numbers to users — avoid assigning numbers in v1.  
- POPIA: call metadata is personal; recordings are health-adjacent — default off.  
- HPCSA: a doctor answering InCall is telehealth (Booklet 10).  
- SAHPRA: branded cuff claims.  
- CPA: “free calls” advertising must say what is free (nurse line) and what is not (any number).

---

## 7. Founder narrative (short)

Today GilbertOne talks. Next it **connects**.  
- Tap 10177 even with no data (phone dialler).  
- Tap nurse and we pay the bridge.  
- A MyThuso cuff on the table feeds Sentinel so the nurse already knows the number.  
- The box in the clinic is how the brand leaves the phone.

Investment buys: trunk + 0800 + minute subsidy + OEM cuff MOQ + design, not a fantasy telco.

---

## 8. Out of scope

- Free calls to any MSISDN  
- Replacing GSM emergency  
- Building an MNO  
- Uncertified “MyThuso medical watch” that diagnoses  
- Recording every InCall  
- Putting GilbertOne on the live 10177 call as the ambulance dispatcher  

---

## 9. Sign-off

Founder (budget for minutes + 0800) · Counsel (ECS reseller + advertising) · Clinical (which numbers on the button row) · Privacy · Dev lead.
