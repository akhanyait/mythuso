# Claude Prompt — MyThuso Control Tower & GilbertOne Commercialization

> Committed 24 September 2026 from the text the founder supplied, so that the session opener at the
> end of this file names a file that exists. Every section is as supplied except Appendix E, whose
> nine indicative Phase 3 wireframes are listed by title rather than reproduced. Where this plan and
> the tree disagreed, the disagreement is recorded in `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`
> (dated flags, 24 September) and in `docs/SCOPE-BALANCE.md`, not silently resolved here.

Hand this document to a fresh Claude session (Claude Code, or Claude with project access). It is self-contained. It assumes no prior conversation and no memory of the tree beyond what it states. Read §1 before touching anything.

## 0. Your role, in one paragraph

You are being handed a resolved plan for a large expansion to MyThuso: consolidating the two admin surfaces into one Control Tower, commercializing the GilbertOne engine (apps/assistant-api) as a licensable multi-tenant clinical-assistant API, adding an IoT device lifecycle across patient, family, staff and admin audiences, and shipping fifteen supporting modules behind a gate register. Your job in this session is to execute the phase you are told to execute, and only that phase. Most of what follows is queued work that must not be built yet. Read §1 before you write a line.

## 1. Standing rules — never violate

- Do not start a large build near the weekly credit cap. Contracts before screens; gates before code. If you are in a low-credit session, author contracts, tests and boundary checks; do not generate screens.
- Nothing in this plan has been built. Every module, contract and file path below is named-but-absent unless §4 says otherwise. Do not assume a file exists because it is named.
- The status vocabulary is exact (§2). Use it verbatim in commit messages, docstrings and inline comments.
- The build must fail if an invariant is violated. Every new invariant goes into scripts/check-boundaries.mjs, not into a comment.
- Do not touch the patient-entry bundle budget. The current figure is 283.93 kB across 15 files, measured by the documented method (every script, module preload and stylesheet referenced by apps/web/dist/index.html, gzipped at level 9). Every new measurement compares to the history in §15.
- The look and feel is fixed. The token palette in packages/design-tokens/tokens.json governs. A token-drift CI check (§17) fails the build if a hex literal appears in component code that is not sourced from the tokens.
- The clinical boundary is non-negotiable. The engine never autonomously rewrites clinical rules, triage logic, emergency handling or device thresholds. Any such change flows through the Clinician Review Queue (§11, Module 1).
- Tenant isolation extends to the inference layer, not just the database. Per-tenant caches, per-tenant embedding partitions, no cross-tenant fine-tuning, per-tenant provenance.
- Device proximity is not identity. No pairing completes without a physical-possession proof (§10.3).
- A device class cannot be enabled at a site until the DPIA covers it. Currently 0 devices on the allowlist, DPIA not-done.
- Default-deny. A user with no assigned role sees nothing.
- If you cannot verify a claim against the tree, say so plainly rather than repeating it as though it were built. This is the discipline that produced this plan.

## 2. Status vocabulary — use exactly

| Term | Meaning |
|---|---|
| built | In the tree, held by tests. |
| proposed | Declared in a contract, not built. |
| dark | Built but unreachable by default. |
| gated | Built but blocked on a named gate. |
| named-but-absent | A contract the work must author. |

Never write "done" without a test. Never write "working" without a harness. Never write "soon" — name the gate.

## 3. The mission, expanded

You are:

- Consolidating apps/web/src/features/Admin.tsx and apps/web/src/shells/StaffShell.tsx into one portal named MyThuso Control Tower, with Dispatch & Incidents and GilbertOne API Administration as categories inside it.
- Turning apps/assistant-api into a licensable, multi-tenant clinical-assistant engine with scoped per-institution API keys, white-label theming, and a bounded, human-gated self-learning loop.
- Adding an IoT device lifecycle — discovery, compatibility, pairing, assignment, health, telemetry, revocation — across four audiences: patient, family, staff, admin.
- Shipping fifteen modules (§11) and fifteen admin layers (§9).
- Honouring a gate register (§12) that says what must be true before anything else may be built.

You are not building screens in this session unless the phase explicitly says so.

## 4. What exists in the tree (verified 23 September 2026)

Do not re-discover these. They are real.

- packages/catalog/devices.json, packages/catalog/apis/devices.json, packages/catalog/devices/simulator-presets.json — exist. Real-device allowlist holds 0 devices; DPIA not-done.
- scripts/ingest-knowledge-embeddings.mjs (with .test.ts) — exists. The retrieval-refresh path Module 4 splits.
- packages/catalog/knowledge/federation.json — exists. Dark by default; every source "active": false.
- tests/simulated-care.spec.ts — exists. Seed of Module 5.
- packages/catalog/field-safety.json, sentinel.json, sos.json, sos-press.json — exist. The field-safety engine.
- packages/catalog/scheduling.json, booking.json — exist.
- packages/gilbertone/src/escalation.ts — exists. The deterministic pre-model escalation ruleset.
- packages/catalog/apis/assistant.json — exists. The thirteenth engine file; twelve addresses built over twenty-six route versions.
- scripts/api-locks.mjs — exists. Reports 350 route versions over thirteen engine files; assistant 12.
- apps/web/src/features/Admin.tsx, apps/web/src/shells/StaffShell.tsx — exist. The two surfaces §9 consolidates.
- packages/catalog/feeds.json — exists. Eleven feed seams, one per supplier.
- packages/catalog/capabilities.json — exists. Fifteen capabilities, none connected.
- packages/catalog/gilbert-emergency-terms.json — exists, version 2.
- packages/design-tokens/tokens.json — exists. The governing palette.
- docs/ROADMAP.md, docs/FLOW-COMPLETENESS.md, docs/PROPOSAL-COVERAGE.md, docs/ARCHITECTURE.md, docs/PRIVACY-AND-SECURITY.md, docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md — exist.

## 5. What does not exist (named-but-absent)

Do not act as though these exist.

- escalation.json / escalation-policy.json — the intended ladder-policy contracts.
- gilbertone-api-keys.json / gilbertone-api-versioning.json — the intended scoped-key and per-tenant-versioning contracts.
- Navy #0C2340 / blue #2563EB / violet #7C3AED — not in the tokens. The real palette is teal-navy-and-lime.
- The Clinician Review Queue contract — referenced in the scope but never specified; Module 1 authors it.
- The clinical / non-clinical corpus split — the embedding script currently has no such split.
- Per-tenant scoped API keys — no artifact exists.
- The device pairing, health, trust and telemetry contracts — Modules 12–15 author them.
- The firmware/OTA module — out of scope in this plan; named separately.

## 6. The four architectural decisions — LOCKED

These are resolved. Do not re-litigate them. Implement them.

### 6.1 Clinical configuration is tiered

Tier 1 — locked global core. packages/gilbertone/src/escalation.ts, packages/catalog/gilbert-emergency-terms.json, the red-flag symptom set, the escalation semantics. No tenant may add to, subtract from, reorder or suppress Tier 1.

Tier 2 — per-tenant additive clinical layer. A tenant may add site-specific protocol steps, formulary exclusions, extra escalation rungs, subject to its own Clinician Review Queue sign-off. Tier 2 may add; it may never subtract from Tier 1.

### 6.2 The knowledge corpus is split

Clinical corpus — locked. Refreshed only through the Clinician Review Queue, versioned, rolled back through the same path.

Non-clinical corpus — self-improving. Refreshed autonomously through scripts/ingest-knowledge-embeddings.mjs.

The build fails if the clinical corpus is refreshed outside the Review Queue path.

### 6.3 Tenant isolation extends to the inference layer

| Channel | Rule |
|---|---|
| Prompt / context cache | No cross-tenant reuse. Cache keys namespaced by tenant. |
| Embedding index | Per-tenant partitions. No cross-partition retrieval. |
| Model fine-tuning | No cross-tenant fine-tuning without recorded consent and a legal basis. |
| Retrieval provenance | Per-tenant. |
| Timing / latency | Constant-time where a record's existence could be inferred. Hardening target. |

A test proves tenant A's prompt cannot retrieve tenant B's data through the model, not just through the database.

### 6.4 Field-safety scoring is advisory-with-documented-override

The pre-visit risk score recommends; it does not block. The clinician decides. The override reason is captured. The system may require a reason and notify a manager; it does not prevent the visit. The engine never refuses a visit on its own.

## 7. Naming — LOCKED

| Thing | Locked name |
|---|---|
| The admin portal as a whole | MyThuso Control Tower |
| The ops/dispatch workspace | Dispatch & Incidents (a module inside the Tower) |
| GilbertOne's administration | GilbertOne API Administration (top-level category, carrying the G1 mark) |
| The device fleet module inside the Control Tower | Devices & Fleet |
| The user-facing device screen | My Devices |

Reconcile before building, not after: author docs/control-tower-tab-inventory.md with every tab in Admin.tsx and every route in StaffShell.tsx, a disposition column (moved, merged, retired-with-reason), and a one-line rationale for any retirement. No tab is retired without a reason.

## 8. CI palette governance — LOCKED

The shipped packages/design-tokens/tokens.json palette governs every Control Tower and device screen:

- brandInk #0F3B4A — deep teal-navy
- indigo #1E3A8A — blue
- brandGreen #1D9E75 — teal-green
- brandLime #D9FF1A — lime

GilbertOne's brand is an accent within that token system, never a replacement for it. The navy/blue/violet palette is not the CI and must not be used. A token-drift CI check fails the build if a hex literal in component code is not sourced from design-tokens.json.

## 9. The fifteen admin layers

Each layer is scoped by site/region · module · data-class · read/write · time-bound break-glass. Break-glass elevation is granted, logged, second-party-notified, and expires.

| # | Layer | Notes |
|---|---|---|
| 1 | Super User / Platform Owner | ≤ 2 people, hardware-key MFA, external governance anchor (Module 11). Owns the device class allowlist. |
| 2 | System Administrator | Owns gateway configuration, certificates, network policy. |
| 3 | Security & Compliance Officer | POPIA accountable. Owns device trust and revocation (Module 15). |
| 4 | Clinical Administrator / Medical Director | Sign-off authority for the Clinician Review Queue — including device threshold rules. |
| 5 | Nursing / Ward Manager | Sees every device in their ward; may assign a ward device to a bed or patient. |
| 6 | Operations & Dispatch Manager | Owns Dispatch & Incidents; receives device-raised incidents. |
| 7 | Facilities / Bed Manager | Owns bed inventory and the ward/bed device map. |
| 8 | Finance / Billing Officer | Sees device cost allocation (per-bed, per-seat). |
| 9 | Data & Analytics Officer | Sees device telemetry aggregates; not raw clinical readings without a recorded purpose. |
| 10 | GilbertOne Engine Administrator | Administers the engine under GilbertOne API Administration. Cannot self-approve a clinical change, including a device threshold. |
| 11 | Content & Knowledge Officer | Steward of the knowledge federation. |
| 12 | Regional / Site Admin | Scoped to one hospital; sees the site's full device fleet. |
| 13 | Auditor | Read-only, to a separate append-only store. Sees every device event. |
| 14 | Support Agent | Narrow, time-limited, session-bound. May view a device's health; may not change assignment without a ticket reference. |
| 15 | Device Fleet Administrator | New. Owns provisioning, decommissioning, firmware-cohort tracking, the per-site device register. Does not own clinical thresholds (layer 4) or trust/revocation (layer 3). |

Separation of duties. Layer 15 cannot approve a device threshold. Layer 4 cannot provision a device without layer 15's register entry. Layer 10 cannot self-approve a clinical change. Layer 13 audits the people who appointed it — which is why Module 11 provides an external anchor. Default-deny: a user with no assigned role sees nothing.

## 10. The IoT device lifecycle

A device is a first-class entity with identity, credentials, health, assignment and history — and a security boundary, because a device that reports a reading is a device that can be spoofed.

### 10.1 The four device tiers

| Tier | Examples | Who pairs it | Escalation weight |
|---|---|---|---|
| Medical-grade, site-owned | Ward BP cuff, pulse ox, glucometer, thermometer | Facilities or Ward Manager | May auto-create a Dispatch & Incident. |
| Medical-grade, personally-owned by a clinician | A doctor's own stethoscope-digitizer | The clinician, approved by Facilities | May auto-create an incident on the clinician's own patients. |
| Consumer, personally-owned by a patient or family | Home BP cuff, fitness wearable | The patient, self-service, with disclosure | Advisory only. Never auto-escalates. Disclosed as "not medical-grade" on every screen. |
| Infrastructure | MQTT gateway, ward cellular router | System Administrator | Not a clinical device; carries the other devices' traffic. |

A device cannot be paired into a tier the model is not approved for.

### 10.2 Discovery

One shared discovery flow across user self-portal, staff app and admin console — differing only in which device classes each shows.

Transport layers, in priority order:

1. BLE GATT scanning against a MyThuso service UUID and allowlisted vendor profiles — the default.
2. WiFi mDNS / Bonjour for network devices (_mythuso._tcp).
3. WiFi Easy Connect (DPP) / QR provisioning — the highest-trust path.
4. NFC tap — physical-possession proof via tag UID.
5. Cellular (4G/5G) registration by IMEI/eSIM and a printed provisioning code — the app verifies, it does not pair.

The compatibility check classifies every candidate as: Supported, Supported elsewhere ("not enabled at your site" + request-enablement), Recognised, not supported (greyed, with reason), or Unknown ("not a MyThuso-compatible device").

Proximity is not identity. The discovery list is a candidate list. Nothing is trusted until §10.3 completes.

### 10.3 Pairing — physical-possession proof required

No "just works" pairing for any clinical device.

| Path | Proof |
|---|---|
| Pairing code match | Device shows a 6-digit code; user types it; verified against the device's authenticated channel. Default for BLE medical-grade. |
| QR / DPP scan | The QR on the device carries its public key; scanning it is the proof. Default for WiFi/network devices. |
| NFC tap | The NFC tag's UID is registered to the device's certificate. |
| Numeric comparison | Both show the same code; user confirms on both. Fallback for BLE without a display. |
| Provisioning code (cellular) | Printed on the device's label, entered once. |

Under the hood:

1. Device presents its certificate (or a pre-shared key provisioned at manufacture, for consumer devices).
2. The app verifies the chain to a MyThuso-approved root for that model.
3. Key agreement; the app stores the device credential in the platform keystore (iOS Keychain with kSecAttrAccessibleWhenUnlockedThisDeviceOnly; Android Keystore with StrongBox where available) — never in app storage.
4. Device is registered to tenant, site, ward/bed, tier.
5. First reading taken and validated against a physiological range. Out-of-range → the device is marked "verification pending" and the user is told what to do.

Consumer devices are disclosed, always. The consumer-tier pairing screen says in plain language that the device is advisory and not medical-grade, and that readings will not automatically raise an incident. This is a flag, not a footnote.

### 10.4 The user self-portal — My Devices

Every signed-in user has a My Devices screen. Its contents depend on who they are.

| User | Sees | Can do |
|---|---|---|
| Patient | Own consumer devices; any medical-grade device currently assigned to them. | Add a consumer device; view health; take a reading; unpair their own; share with a linked family member. |
| Family member (linked) | Devices of the person they are linked to, with recorded consent. | View health; take a reading on their behalf; not add or remove. |
| Nurse | Personal clinical kit devices; ward devices assigned for this shift. | Add a personal device (approved tier); view health; take a reading; report a fault; request a swap. |
| Doctor | Devices assigned to their current patients; their own personal clinical devices. | View health; take a reading; flag a device suspect. |
| Ward Manager | Every device in their ward, grouped by bed and status. | Assign, reassign, decommission (with reason), request a replacement. |
| Facilities / Bed Manager | Every device at their site, grouped by ward and class. | Assign, reassign, decommission, provision a new device. |

Every device card shows: model and friendly name; health indicators (§10.6); current assignment; tier badge; and actions (take reading, view history, reassign if permitted, unpair if permitted, report a fault).

The empty state is written, not blank. A user with no devices sees an explanation, a link to the compatible-models list, and one primary action: Add a device.

### 10.5 Admin device management — Devices & Fleet

Three views, one per job.

View 1 — Fleet overview (Facilities, Ward Manager, Regional Admin, Device Fleet Administrator). Devices by ward, bed, class, status. Needs-attention list: low battery, offline > threshold, calibration overdue, firmware behind, verification pending. Cohort view by model and firmware. Bulk actions.

View 2 — Provisioning (Device Fleet Administrator, Facilities). Four-step wizard: Discover → Pair → Assign → Verify.

View 3 — Device class allowlist (Super User, layer 1). Adding a class requires: vendor and model; supported tier; pairing path; physiological range per reading type; escalation weight; firmware baseline; security review (layer 3) confirming the credential model; POPIA note on what the device emits and where it goes.

A class cannot be enabled at a site until the DPIA covers it. Currently 0 devices, DPIA not-done.

### 10.6 Device health indicators

| Indicator | Answers | Threshold behaviour |
|---|---|---|
| Battery | Will it last the shift? | Warn 30%, critical 15%. Critical battery on a lone-worker's device alerts the Tower before the worker goes dark. |
| Signal / connectivity | Can it reach the gateway now? | Warn 5 min offline; incident 30 min (medical-grade) or display-only 24 h (consumer). |
| Last seen | Is the device alive? | Distinct from last reading. |
| Last reading | Is data flowing? | Distinct from last seen. |
| Reading freshness | Is it in the expected cadence for its class? | Not "on time" — "as expected for this class." |
| Calibration status | Is the reading trustworthy? | Overdue → flagged advisory regardless of tier. |
| Firmware version | On a supported baseline? | Behind → amber; below minimum → red, readings flagged. |
| Data integrity | Every reading arrived, in order, no gaps? | Surface the gap; do not silently interpolate. |
| Credential validity | Certificate still trusted? | Expiring 30 d → amber; expired → refused at gateway. |
| Physiological plausibility | In a range a human body can produce? | Out-of-range → reading rejected, not displayed, device flagged. Replay/spoofing defence. |
| Physical state (if reported) | Cuff wear, sensor contamination, self-test | Surface to owner; do not decide. |

Who sees what. Patient / family: battery, signal, last reading, plain-language status — not firmware, not credential validity. Nurse / doctor: full panel. Ward Manager / Facilities / Device Fleet Admin: full panel plus cohort and history. Security Officer: credential validity, expiry, trust view. Auditor: everything, read-only, to the append-only store.

### 10.7 Telemetry, thresholds, alert path

Ingestion. MQTT over TLS with per-device client certificates; broker ACLs scoped to the device's own topic namespace; no wildcard subscriptions for devices, alongside the existing HL7v2 inbound.

Admission control. Every device presents a credential at the gateway. Unregistered devices are rejected at the gateway, logged and surfaced.

Threshold rules are clinical and LOCKED — they flow through the Clinician Review Queue, versioned with the same instant rollback as any clinical rule.

Tiered escalation. Medical-grade crossing a threshold may auto-create a Dispatch & Incident. Consumer crossing the same numeric threshold raises an advisory and never auto-creates. The tier determines the path, not the number alone.

Replay / spoofing defence. Timestamp freshness windows; monotonic sequence numbers per device; anomaly detection on impossible physiologies; refusal of a reading whose certificate does not match the registered device for that topic.

Firmware/OTA is out of scope in this plan. A separate module will scope it. Saying so is better than silence.

### 10.8 Revocation, decommissioning, lost devices

Remote revocation. Lost phone or device is revoked; credential added to the gateway deny list; rejection enforced within a documented latency SLO.

Unpair vs decommission. Unpair removes the assignment; decommission removes the register entry. Both logged. A decommissioned device's historical readings remain; the device can never be paired again without explicit re-commissioning.

Rogue-device detection. A credential valid but mis-matched to topic, ward or class is quarantined and surfaced to layer 3.

Store-and-forward. What is buffered, for how long, encrypted at rest, and what happens if the device is seized — specified per class.

## 11. The fifteen modules

Each names its what, why, gates, and touches.

**Module 1 — Clinician Review Queue.** What: a governed queue of proposed clinical-behaviour changes — Tier 1 global core, Tier 2 per-tenant additive, and device threshold rules. Each carries evidence, reviewer, sign-off, version, rollback reference. Shape: { proposedChange, evidence, reviewer, signOff, version, rollbackRef, tier: 1|2|device, tenantId? } with an append-only log of every state transition. Why: every clinical-affecting change flows through it. Without a data shape, "ships only after sign-off" has no contract and the boundary check has nothing to check against. Gates on: nothing external — authorable now. Layer 4 signs off; layer 10 cannot self-approve. Touches: packages/catalog/clinical-review-queue.json (new), scripts/api-locks.mjs, scripts/check-boundaries.mjs, references in packages/catalog/apis/assistant.json.

**Module 2 — Clinical Configuration Tiering.** What: Decision 6.1 in code: the locked Tier 1 set, the per-tenant Tier 2 layers, the service that reads them. Why: resolves the largest open architectural question. Shapes every downstream contract. Gates on: nothing external — authorable now. Touches: packages/catalog/gilbert-clinical-core.json, packages/catalog/tenant-clinical-layers/**, apps/assistant-api/src/lib/clinical-config.ts, scripts/check-boundaries.mjs (fails if Tier 2 subtracts from Tier 1).

**Module 3 — Multi-Tenant Inference Isolation Layer.** What: Decision 6.3 in code: per-tenant caches, per-tenant embedding partitions, no cross-tenant fine-tuning, per-tenant provenance, the cross-tenant inference test. Why: "no cross-tenant read" is a database claim; the inference layer has its own channels. Gates on: nothing external — authorable now. Touches: apps/assistant-api/src/lib/tenant-isolation.ts, session store, embedding index, model adapter, scripts/check-boundaries.mjs.

**Module 4 — Clinical / Non-Clinical Knowledge Corpus Split.** What: Decision 6.2 in code: two embedding corpora, the clinical one refreshed only via Module 1. Why: retrieval is clinical behaviour below the emergency backstop. Gates on: nothing external — authorable now. Touches: scripts/ingest-knowledge-embeddings.mjs (two paths), packages/catalog/knowledge/federation.json (corpus tagging), boundary check.

**Module 5 — Synthetic-Patient Simulation & Regression Harness.** What: the full harness behind "self-simulating": case generator, scoring rubric, regression thresholds, rollback drill, CI integration. Why: the safe way to increase intelligence. The artifact a medical director reads before signing a Tier 1 change. Gates on: nothing external — authorable now; the case library grows with clinical review. Touches: tests/simulated-care.spec.ts, packages/catalog/simulation-cases/**, scripts/run-simulation-harness.mjs, boundary check.

**Module 6 — Regulatory Classification & Medical Device Pathway.** What: a legal/regulatory workstream. Does the combination of structured triage, severity scoring, escalation, clinical knowledge retrieval, emergency pattern recognition, and now medical-grade device thresholds, constitute a medical device or CDS tool requiring SAHPRA registration? Why: treats "does not diagnose" as if it resolves the question. It doesn't. Gates the entire commercialization track. Gates on: a legal/regulatory opinion. First thing to resolve. Touches: docs/governance/REGULATORY-CLASSIFICATION.md, licence agreement, sales materials.

**Module 7 — Compliance Pack Generator.** What: the inputs a hospital's procurement and Information Officer require: retention and deletion schedule per data class, DPA template, model card, incident response plan, per-tenant kill-switch doc, audit extract. Why: the scope named the output and not the inputs. Without these, a hospital cannot buy. Gates on: DPIA, Information Officer, residency decision, KMS/HSM custody. Touches: packages/catalog/compliance-pack.json, apps/assistant-api/src/lib/compliance-export.ts, docs/governance/**.

**Module 8 — Per-Tenant Kill Switch & Dark-Mode Operation.** What: per-tenant revert to the deterministic on-device layer without taking down other tenants. Why: the operational safety valve when the engine gives wrong advice. Gates on: nothing external — authorable now. Touches: packages/catalog/apis/assistant.json (a per-tenant dark-mode route), apps/assistant-api/src/lib/kill-switch.ts, Control Tower surface, boundary check.

**Module 9 — Tenant Offboarding & Data Portability.** What: the exit path: data export, deletion, key revocation, device de-registration, audit-log retention per contract. Why: a commercial product without an offboarding path is one procurement teams won't sign; also a POPIA obligation. Gates on: retention policy, DPA template, Information Officer. Touches: packages/catalog/offboarding.json, apps/assistant-api/src/lib/tenant-offboarding.ts, Control Tower surface.

**Module 10 — Threat Model & Adversary Register.** What: a living document and a test suite. Adversaries: malicious insider, compromised device, compromised tenant key, spoofed device, replayed reading, rogue BLE advertiser, stolen field device with buffered data, external attacker, curious admin, lost field device. Why: the scope is strong on capability and clinical safety, light on adversary model. Naming the adversaries makes the security work tractable. Gates on: nothing external — authorable now. Touches: docs/security/THREAT-MODEL.md, docs/security/ADVERSARY-REGISTER.md, boundary-check tests per adversary.

**Module 11 — Break-Glass Governance & External Anchor.** What: resolution of the governance circularity at layer 1: sealed-physical-key escrow or board-level approval for layer-1 actions above a threshold. Plus the break-glass audit contract: time-boxed (≤ 4 h), reason at grant, second-party notification on grant and use, separate append-only tamper-evident log, periodic access review. Why: layer 1 appoints 2, layer 2 appoints the rest, layers 1 and 2 appoint the auditor. "≤ 2 people with hardware-key MFA" is a statement about authentication, not governance. Gates on: a founder/board decision on the external anchor. The break-glass contract is authorable now. Touches: docs/governance/SUPER-USER-GOVERNANCE.md, packages/catalog/break-glass.json, Control Tower surface, audit store.

**Module 12 — Device Discovery & Pairing (new).** What: the shared discovery and pairing service of §10.2–10.3. BLE GATT, mDNS, QR/DPP, NFC, cellular registration. Compatibility classification against the tenant allowlist. Physical-possession proof enforced. Credentials in the platform keystore, never app storage. Why: discovery is where the user decides whether the product works. The scope described a fleet but no way to add a device to it. Gates on: G18a: at least one supported model on the allowlist; a pairing-path contract; a physiological range per reading type. Touches: apps/web/src/features/devices/**, iOS and Android clients, apps/assistant-api/src/lib/device-pairing.ts, packages/catalog/devices/pairing-paths.json, packages/catalog/apis/devices.json, boundary check.

**Module 13 — Device Health & Fleet Telemetry (new).** What: the health-indicator panel of §10.6, the telemetry intake of §10.7, the fleet views of §10.5. Every indicator has a threshold behaviour, a source, a defined audience. Why: a fleet without health is a fleet of unknowns. The product cannot ask a nurse to trust a reading from a device at 4% battery with six-month-overdue calibration. Gates on: G18b: the device-class allowlist, the DPIA, the telemetry intake built. Touches: apps/assistant-api/src/lib/device-telemetry.ts, packages/catalog/devices/health-indicators.json, packages/catalog/devices/thresholds.json (locked, Module 1), Control Tower Devices & Fleet views, boundary check.

**Module 14 — User Self-Portal Device Management (new).** What: the My Devices screen of §10.4 across three platforms and every user type — patient, family, nurse, doctor, ward manager, facilities. Content is audience-scoped. Why: the fleet is only half the story. The person who owns or uses the device needs to add it, see that it works, know when it doesn't. Gates on: G18c: discovery and pairing built; patient-facing language approved; consumer disclosure on every consumer pairing screen. Touches: apps/web/src/features/MyDevices.tsx, iOS and Android clients, packages/catalog/assistant-ui.json (plain-language status strings), boundary check.

**Module 15 — Device Trust & Revocation (new).** What: device attestation where available; certificate lifecycle; the gateway deny list with a revocation-latency SLO; rogue-device detection; quarantine; the lost-device path; store-and-forward per class. Owned by layer 3. Why: a device that reports a reading can be spoofed, replayed, stolen. The scope named telemetry but not trust. Without this, a compromised BLE advertiser can impersonate a ward BP cuff and nothing would notice. Gates on: G18d: a security review per class; a credential model per model; the revocation-latency SLO agreed. Touches: apps/assistant-api/src/lib/device-trust.ts, packages/catalog/devices/trust-model.json, gateway admission-control path, boundary-check spoofing/replay tests, Control Tower trust view.

## 12. The gate register

Every gate, in one place. Nothing below has been implemented or connected by the pass that wrote the plan.

| # | Gate | What must exist first | Owner |
|---|---|---|---|
| G1 | Regulatory classification (Module 6) | A legal/regulatory opinion on SAHPRA/medical-device status. | Founder + legal |
| G2 | Clinical configuration tiering (Module 2) | Nothing external — authorable now. | Session |
| G3 | Clinician Review Queue (Module 1) | Nothing external — authorable now. | Session |
| G4 | Knowledge corpus split (Module 4) | Nothing external — authorable now. | Session |
| G5 | Inference isolation (Module 3) | Nothing external — authorable now. | Session |
| G6 | Synthetic-patient harness (Module 5) | Nothing external — authorable now. | Session |
| G7 | Multi-tenancy | The isolation test passes; the key-lifecycle contract authored. | Session |
| G8 | Scoped API keys | gilbertone-api-keys.json authored, with rotation, revocation, latency SLO. | Session |
| G9 | Model registry & routing | Per-tenant residency decision recorded. | Session + founder |
| G10 | Knowledge federation per hospital | Recorded licence + POPIA s72 cross-border decision per tenant. | Founder + Info Officer |
| G11 | Usage metering & billing | A contracted SA payment provider, financial controls, reconciliation, privacy review. | Founder + Finance |
| G12 | White-label theming | Token-override schema against the locked base palette. | Session |
| G13 | Webhook / event streaming | HMAC signing, per-tenant secrets, allowlist, redaction layer. | Session |
| G14 | Compliance pack (Module 7) | DPIA, Information Officer, residency decision, KMS/HSM custody, retention policy. | Founder + Info Officer |
| G15 | Control Tower consolidation | Tab inventory + session model authored; parallel-run plan; rollback plan. | Session |
| G16 | Admin layers (15) | Session model unified; data-class register authored. | Session |
| G17 | Hospital onboarding | The eight-step path's clinical features gated on G1–G14. | Session + founder |
| G18 | IoT control | Device-class allowlist ≥ 1; DPIA done; device admission control built. | Founder + Info Officer |
| G18a | Device discovery & pairing (Module 12) | A supported device model on the allowlist; a pairing-path contract; a physiological range per reading type. | Session + founder |
| G18b | Device health & telemetry (Module 13) | The device class allowlist; the DPIA; the telemetry intake built. | Session + Info Officer |
| G18c | User self-portal devices (Module 14) | Discovery and pairing built; patient-facing language approved; consumer disclosure on every consumer pairing screen. | Session |
| G18d | Device trust & revocation (Module 15) | A security review per class; a credential model per model; the revocation-latency SLO agreed. | Session + layer 3 |
| G18e | Firmware/OTA | A separate module, explicitly out of scope in this plan. | Founder |
| G19 | Dispatch & escalations | escalation.json / escalation-policy.json authored; terminal state designed; rosters integrated. | Session + ops |
| G20 | Bed booking | Concurrency model decided; conflict UX designed; scheduling wired. | Session |
| G21 | Panic buttons | Fob pairing/revocation; duress rate-limiting; GPS retention policy. | Session + founder |
| G22 | Field safety | (a) SAPS/crime-data source, (b) armed-response partner, (c) fob decision, (d) legal review of armed dispatch. | Founder + legal |
| G23 | Per-tenant kill switch (Module 8) | Nothing external — authorable now. | Session |
| G24 | Tenant offboarding (Module 9) | Retention policy; DPA template; Information Officer. | Founder + Info Officer |
| G25 | Threat model (Module 10) | Nothing external — authorable now. | Session |
| G26 | Break-glass governance (Module 11) | External anchor decision (sealed escrow or board approval). | Founder |
| G27 | HSTS raise | A founder decision to raise max-age from 300 s to two years. | Founder |
| G28 | All clinical features | The repository's eight-step path, no step skipped. | Session |

## 13. Sequencing

**Phase 0 — Authorable now, no credits, no gates (low-credit session).** Modules 1, 2, 3, 4, 6 (document), 7 (schema), 10, 11 (break-glass contract); Modules 12, 13, 14, 15 (contracts and tests); docs/control-tower-tab-inventory.md; docs/control-tower-session-model.md; docs/security/DEVICE-TRUST-MODEL.md; the packages/catalog/devices/** additions; the packages/catalog/apis/assistant.json additions for per-tenant routes; the scripts/check-boundaries.mjs extensions for every new invariant — including the spoofing, replay and cross-tenant inference tests.

**Phase 1 — Gates that need a person (founder-led).** G1 (regulatory opinion); G22(a–d) (SAPS source, armed-response partner, fob, legal review); G27 (HSTS); Module 11's external anchor; G10, G14, G24, G18b (DPIA, Information Officer); G18a and G18d (a supported device model on the allowlist, and the security review per class).

**Phase 2 — Buildable once Phase 0 contracts are committed and Phase 1 gates are green.** Modules 5, 8, 9; Modules 12, 13, 14, 15 (the code); G7–G9; G18–G18e; G19; G20; G21.

**Phase 3 — Screens, deferred on credits.** Control Tower consolidation (G15); the 15 admin layers' UI (G16); the onboarding wizard (G17); the Devices & Fleet views; the My Devices screen on all three platforms; the four-step provisioning wizard; the bed-booking dashboard; the panic-button UI; the field-safety Control Tower surfaces.

**Phase 4 — Commercialization.** G11 (payments); G12 (white-label); G13 (webhooks); the first sellable tenant definition.

## 14. The eight-step clinical path — no step skipped

Catalog contract · Generator · Web · iOS · Android · Boundary rule · Journey test · Feature-map update.

## 15. Deferrals and bounds

- The patient-entry bundle budget governs. Current figure: 283.93 kB across 15 files, measured by the documented method. History: 282.16 → 283.07 → 284.01 → 283.85 → 283.93 kB. Only comparisons taken the same way are legitimate.
- The admin bundle has its own budget. The Control Tower's growth must not silently bloat the patient entry through shared chunks.
- Admin and clinical wording stays en-ZA until clinician sign-off. The patient app is the multi-language surface.
- Screens are deferred until the founder loads credits.
- Screens use the real CI — the G1 mark, the Gilbert mascot, the token palette.
- A new service gets its own box. Never liqzar-server.
- Voice is push-to-talk. No wake word, no passive recording.
- Firmware/OTA is out of scope in this plan and named as a separate future module.
- The first sellable tenant is a subset: multi-tenancy + scoped keys + eval harness + compliance pack + kill switch + device discovery/pairing/health for one medical-grade class. Model routing, federation, metering, white-label, webhooks and the full device catalogue follow the first sale.

## 16. File and contract conventions

- New catalog contracts go under packages/catalog/** and are added to scripts/api-locks.mjs where they carry routes.
- New engine routes go into packages/catalog/apis/assistant.json first, then the implementation in apps/assistant-api/src/**.
- New invariants go into scripts/check-boundaries.mjs. The check reads documents and fails on drift.
- New tests go alongside the code they test, .spec.ts for the repo's conventions.
- The token-drift check reads component sources under apps/web/src/** and fails on any hex literal not in design-tokens.json.
- Any new measurement of the patient entry is taken only by the documented method: every script, module preload and stylesheet referenced by apps/web/dist/index.html, gzipped at level 9.

## 17. Boundary-check expectations

Extend scripts/check-boundaries.mjs so that it fails if:

1. Anything under packages/gilbertone/src calls fetch(), imports a network or model module, or reads an environment variable. (Already in place — do not weaken.)
2. The turn route grows a second model door, loses the gate, or reads the session map instead of the store. (Already in place — do not weaken.)
3. Any auto-promotion path can write to escalation.ts, the emergency list, the triage ruleset, or a device threshold rule, without a signed Clinician Review Queue record.
4. The clinical embedding corpus is refreshed outside the Review Queue path.
5. Tier 2 clinical configuration subtracts from Tier 1.
6. A cross-tenant inference test can reach across partitions.
7. A device can be paired without completing a physical-possession proof.
8. A consumer-tier device can auto-create a Dispatch & Incident.
9. A reading can be accepted whose certificate does not match the registered device for the topic.
10. A device class can be enabled at a site without a recorded DPIA.
11. A hex literal appears in component code that is not sourced from design-tokens.json.

## 18. Output format for this session

When you finish a phase, report in this exact shape:

```text
PHASE EXECUTED: <0|1|2|3|4>
MODULES TOUCHED: <list>
CONTRACTS AUTHORED: <file> — <one-line shape>
INVARIANTS ADDED: <check-boundaries line> — <one-line what-it-fails-on>
TESTS ADDED: <file> — <one-line what-it-proves>
BUNDLE MEASUREMENT: <kB> across <n> files (method: documented; delta vs 283.93)
GATES RESOLVED: <G-numbers> — <what moved them>
GATES STILL BLOCKING THIS PHASE: <G-numbers> — <what would resolve each>
NOTHING BUILT: <list of everything the phase did not build>
```

Never claim done without the test. Never claim working without the harness. Never claim soon.

## 19. What to do first, in order

If you are executing Phase 0 in a low-credit session:

1. Read this prompt fully. Read §1 aloud to yourself.
2. Read docs/ROADMAP.md's standing rule and scripts/check-boundaries.mjs's current shape.
3. Author docs/control-tower-tab-inventory.md first — it is the merge gate and the cheapest artifact.
4. Author the Clinician Review Queue contract (packages/catalog/clinical-review-queue.json).
5. Author the clinical-configuration tiering (packages/catalog/gilbert-clinical-core.json, packages/catalog/tenant-clinical-layers/_template.json).
6. Author the device contracts: packages/catalog/devices/pairing-paths.json, health-indicators.json, thresholds.json (locked), trust-model.json.
7. Author the routes into packages/catalog/apis/assistant.json and packages/catalog/apis/devices.json.
8. Extend scripts/check-boundaries.mjs with the eleven invariants of §17.
9. Author the tests: the cross-tenant inference test, the pairing-without-proof test, the consumer-tier-non-escalation test, the certificate-mismatch test, the token-drift test.
10. Report per §18.

If you are executing Phase 1, 2, 3 or 4, the phase's entry conditions are in §13 and the gate register in §12. Do not begin a phase whose entry gates are not green.

## 20. What never to do

- Do not generate screens in a low-credit session.
- Do not assume a file exists because it is named. Check the tree.
- Do not silently resolve a discrepancy. Record it, flag it, name the reconciliation.
- Do not add a clinical rule, threshold or emergency pattern outside the Clinician Review Queue.
- Do not weaken a boundary check to make a suite pass.
- Do not introduce a hex literal that is not in design-tokens.json.
- Do not let a consumer device auto-create an incident.
- Do not accept a reading whose certificate does not match the topic.
- Do not enable a device class at a site without a DPIA.
- Do not cross-tenant read, cross-tenant cache, cross-tenant retrieve, or cross-tenant fine-tune.
- Do not start a large build near the weekly credit cap.
- Do not describe a thing as built when it is named-but-absent.
- Do not use the navy/blue/violet palette.

## Appendix E — Indicative wireframes (Phase 3 only)

Indicative of layout and state, not final design; the locked token palette governs the real screens. Supplied as ASCII wireframes, listed here by title: E.1 device discovery (mobile, self-portal) · E.2 pairing confirmation (physical-possession proof, six-digit code) · E.3 consumer-tier disclosure ("advisory, not medical-grade, will not raise an emergency response") · E.4 My Devices · E.5 device health detail (staff) · E.6 admin fleet overview with needs-attention list · E.7 provisioning wizard, step 3 of 4 · E.8 device-class allowlist (Super User), showing a class that cannot be enabled while its DPIA is not-done · E.9 device trust and revocation (Security Officer).

## Session opener — the exact line to say when starting

"Read docs/PROMPT-CONTROL-TOWER.md. Execute Phase 0 only. Do not generate screens. When done, report per §18 of the prompt."
