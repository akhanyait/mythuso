# Commercialization and Control Tower expansion

Written 23 September 2026, from the founder's own scoping session and read back against the tree —
`packages/catalog/**`, `packages/gilbertone/src/**`, `apps/assistant-api/src/**`,
`apps/web/src/features/Admin.tsx`, `apps/web/src/shells/StaffShell.tsx` and
`packages/design-tokens/tokens.json`. Nothing here is estimated from memory, and where the founder's
note named an artifact that the tree does not carry, that is said plainly rather than repeated as
though it were built. This is the same discipline `docs/ROADMAP.md` keeps between _built_, _proposed_,
_dark_ and _gated_.

**Status: scoped, queued — not yet built.** No screen was generated, no source, contract, catalog or
generated file was touched, and no git command was run to produce this document. It is a durable
scope so the next session can pick it up cold. Screens wait on the founder loading credits (see
`docs/ROADMAP.md`'s standing rule: _do not start a large build near the weekly credit cap_).

Two terms are used the way the founder uses them and are not reopened here:

- **Control Tower** — the admin console. `docs/ARCHITECTURE.md` already names it "the proposal's
  Control Tower as a web-only back office … not a phone surface and not built for the native apps."
  This document expands that console; it does not invent a second one.
- **GilbertOne** — a standalone, versioned API engine (`apps/assistant-api`, contract in
  `packages/catalog/apis/assistant.json`) with three thin clients: web, iOS and Android. The
  deterministic half in `packages/gilbertone` stays on every device — no dependency, no network, no
  environment variable — and is what answers while the engine is dark. The look and feel is fixed.

---

## 1. Naming (locked)

These names are decided and are not a matter for a later tidy-up.

| Thing                               | Locked name                       | Note                                                                                                |
| ----------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| The admin portal as a whole         | **MyThuso Control Tower**         | The single portal the two current surfaces consolidate into.                                        |
| The existing ops/dispatch workspace | **Dispatch & Incidents**          | Becomes a _module inside_ the Control Tower, not a separate shell.                                  |
| GilbertOne's administration         | **GilbertOne API Administration** | Its own **top-level category**, carrying the **G1 mark** icon. Not a tab buried in the back office. |

**One portal, not two.** Today the admin surface is split across two places —
`apps/web/src/features/Admin.tsx` (the back-office console, whose tabs `docs/PROPOSAL-COVERAGE.md`
records as _eight_ and `docs/FLOW-COMPLETENESS.md` walks as _ten of ten_ Control Tower journeys) and
the `StaffShell.tsx` Control Tower workspace. The decision is to **consolidate both into one portal**
under the Control Tower name, with Dispatch & Incidents and GilbertOne API Administration as
categories inside it.

> **Reconcile before building, not after.** The founder's note describes the back office as "10
> tabs"; `docs/PROPOSAL-COVERAGE.md:76` describes `Admin.tsx` as _eight tabs_. The count is not
> load-bearing for the naming decision, but the consolidation must start from the real current tab
> list read off `Admin.tsx` on the day it is built, so no tab is silently dropped in the merge. A
> half-migrated admin surface is the same failure `AGENTS.md` warns against on patient-facing screens.

---

## 2. GilbertOne as a commercializable AI engine

GilbertOne is already a **separate engine**, so the commercial question is not "can it be split out"
— it is "what does it take to license it to a hospital that deploys it itself." The framing: a
**standalone, licensable clinical-assistant API that hospitals deploy themselves.**

### Why it is sellable

Each of these is a property the engine already has or already contracts for, not a promise:

- **Eleven South African languages understood, voice in four** — `en`, `zu`, `xh`, `af`, `st`. (The
  understanding is the wide surface; spoken voice is the narrower one, and §07's V03 refusal still
  stands: no voice selection and no guarantee a South African voice is installed.)
- **Deterministic offline fallback** — `packages/gilbertone` answers the emergency from the message
  and the contract alone, with no network, which is what makes it survivable under **load-shedding
  and low-signal** conditions. The build fails if anything under it calls `fetch()`, imports a
  network or model module, or reads an environment variable.
- **POPIA-shaped auditability** — the controls in `docs/PRIVACY-AND-SECURITY.md` and the governance
  pack in `docs/governance/` (DPIA draft, Information Officer, data-residency options, key custody).
- **Hard clinical guardrails** — the engine collects, structures, correlates, ranks urgency, explains
  its evidence and escalates. It does **not diagnose, prescribe or replace a clinician**.
- **Versioning and rollback** — see the flag below: the _contract_ is versioned and append-only
  today; _per-institution scoped API keys_ are not built.

> **Flag — the versioning artifact names do not exist yet.** The founder's note cites
> `gilbertone-api-keys.json` and `gilbertone-api-versioning.json` as evidence of "versioning +
> rollback." **Neither file is in the tree on 23 September 2026.** What genuinely exists is route
> versioning in `packages/catalog/apis/assistant.json` — every route carries a `version`, and a
> withdrawn version keeps its `withdrawn.on`, `supersededBy` and `why` — held by the append-only
> locks in `scripts/api-locks.mjs` (`docs/ROADMAP.md` reports 350 route versions over thirteen
> engine files). That is real versioning-and-rollback **for the contract**. There is **no
> scoped-API-key or per-tenant-key artifact** yet; those two files would have to be authored, and
> they are named here as the intended contracts rather than described as existing ones.

### The commercial model

- **Deployment:** multi-tenant SaaS **or** self-hosted licence — a hospital may run its own instance.
- **Pricing axes:** per-bed, per-clinician-seat, per-API-call. (Three axes, not one; a hospital
  chooses the shape that matches how it buys.)
- **White-label per hospital:** logo and corporate identity applied per tenant.
- **Scoped API keys per institution:** each hospital's key carries only its own scope.

### The self-learning loop — with a hard safety flag

**This is the non-negotiable.** The engine must **NEVER** autonomously rewrite clinical rules,
triage logic, or emergency handling. Doing so is a **regulated clinical act** under the South
African Health Professions Act, and carries both liability and patient-safety risk. Learning is
therefore **bounded and human-gated**, and the boundary is the whole design:

| Layer                                           | May the engine change it itself? | Where it goes                                                                                                 |
| ----------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Retrieval quality (knowledge-embedding refresh) | **Yes — MAY self-improve**       | Via the existing `scripts/ingest-knowledge-embeddings.mjs`.                                                   |
| Phrasing and clarity                            | **Yes — MAY self-improve**       | Non-clinical wording only.                                                                                    |
| Language coverage                               | **Yes — MAY self-improve**       | Extends understanding, never decisioning.                                                                     |
| Non-clinical knowledge                          | **Yes — MAY self-improve**       | Service navigation, directory, programme info.                                                                |
| **Anything touching clinical decisioning**      | **LOCKED — never autonomously**  | Goes to a **Clinician Review Queue**; ships **only after sign-off**, with a version and **instant rollback**. |

- **"Self-simulating."** A **synthetic-patient simulation harness** runs generated cases and scores
  the engine **before any change goes live**. This is the safe, measurable way to increase
  intelligence — the engine is graded against simulated patients, never against real ones, and a
  regression is caught before it ships. The existing `tests/simulated-care.spec.ts` is the seed of
  this; a full scoring harness is scoped work, not a built one.
- **Feedback capture feeds the retrieval layer, never the safety layer.** Nurse overrides, thumbs
  and corrections may improve _what the engine finds and how it phrases it_. They may **not** touch
  the guardrails, the emergency list, or the escalation ruleset.
- **Alignment with the existing clinical scope decision.** This is the same line already recorded:
  GilbertOne is an **intelligent gate doing structured triage, never diagnosis** — a
  severity-scored assessment handed to a clinician who **confirms or overrides**. The self-learning
  boundary is that decision restated for the model-improvement loop.

### New engine modules for commercialization

Scoped additions to the engine so it can be licensed rather than merely run:

1. **Multi-tenancy and tenant isolation** — one deployment, many hospitals, no cross-tenant read.
2. **Model registry and routing** — a model chosen per tenant and per cost.
3. **Knowledge-base federation per hospital** — extends the governed federation already in
   `packages/catalog/knowledge/federation.json`, which is **dark by default** (`"active": false` on
   every source) and stays gated on a recorded licence + POPIA s72 cross-border decision.
4. **Eval and regression harness** — the scoring half of "self-simulating," above.
5. **Usage metering and billing** — the measurement behind per-bed / per-seat / per-call pricing.
6. **White-label theming** — per-tenant logo and CI.
7. **Webhook / event streaming** — pushing engine events to a hospital's own systems.
8. **Compliance export pack** — the auditability a hospital's Information Officer asks for.

---

## 3. IoT control in the Control Tower

A **device fleet per ward and per bed** becomes a first-class Control Tower concern.

- **Telemetry ingestion, thresholds, and alerting.** A device reading outside its threshold
  **auto-creates a Dispatch & Incident** — the alert is not a badge to look at, it is work raised.
- **A device gateway alongside the existing HL7 inbound.** Add **MQTT / device-gateway** ingestion
  next to the HL7v2 inbound path the repository already has (`tests/hl7v2-inbound.spec.ts`).
- **Admin scopes which device classes are in scope per site.** Not every hospital runs every device;
  the admin decides the classes live at each site.
- **Ties to the agreed IoT vitals enrichment** — pulse oximeter, BP cuff, glucometer, thermometer,
  wearables — **validated against physiological ranges**. **Consumer devices are disclosed as
  advisory, not medical-grade.** This disclosure is a flag, not a footnote.

> **Flag — devices are contracted but none is contacted.** `packages/catalog/devices.json`,
> `packages/catalog/apis/devices.json` and `packages/catalog/devices/simulator-presets.json` exist,
> and `docs/ROADMAP.md` records that the real-device allowlist holds **0 devices** against a data
> protection impact assessment reading "not-done." `docs/ROADMAP.md` also lists **wearables** under
> "What I would not build yet." IoT control is therefore scoped against a seam that is built and a
> supplier/DPIA gate that is not satisfied.

> **Flag — expanded 24 September 2026.** This section's telemetry/threshold/alerting bullets above
> are the full extent of what reached this tracked document through 23 September. A fuller device-
> lifecycle specification received from the founder on 24 September — discovery over BLE/mDNS/QR-DPP/
> NFC/cellular, mandatory physical-possession proof before any pairing completes, an 11-indicator
> device-health panel with per-audience visibility, and a certificate/trust/revocation model — is
> **not** an edit to this section's bullets; it is now authored as its own contract layer:
> `packages/catalog/devices/pairing-paths.json`, `health-indicators.json`, `thresholds.json` and
> `trust-model.json`, plus `docs/security/DEVICE-TRUST-MODEL.md`. Read those, not an expansion of the
> three bullets above, for the fuller shape — they were written against this codebase's actual device
> contract and adversary register (`docs/security/ADVERSARY-REGISTER.md`), not restated here a second
> time. Nothing in any of them is built: `thresholds.json` carries no live number, every pairing path
> is a proposal gated on device binding not existing yet, and the real-device allowlist this flag
> already named is still at 0.

---

## 4. Admin layers (sub-roles → super users)

Fifteen layers. **Each is scoped by site/region, module, data-class, read/write, and time-bound
break-glass.** The scoping dimensions are the point: a role is not just "what module" but "which
site, which data class, may it write, and does elevated access expire."

> **Flag — reconciled 24 September 2026.** This section read "fourteen layers" through 23 September,
> without a Device Fleet Administrator. A fuller revision of the founder's plan, received 24
> September, adds layer 15 below and this section's separation-of-duties rule, so that the device
> contracts §3 flags as "contracted but none is contacted" — now expanded into
> `packages/catalog/devices/{pairing-paths,health-indicators,thresholds,trust-model}.json` and
> `docs/security/DEVICE-TRUST-MODEL.md` — have an owner distinct from Facilities (layer 7, which
> owns bed inventory, not the device register) and from the Security & Compliance Officer (layer 3,
> which owns trust and revocation, not provisioning). Nothing below is built; the layer is added
> here because the contracts it would own already are.

| #   | Layer                                         | Notes                                                         |
| --- | --------------------------------------------- | ------------------------------------------------------------- |
| 1   | **Super User / Platform Owner**               | **≤ 2 people**, **hardware-key MFA**. Owns the device-class allowlist. |
| 2   | **System Administrator**                      |                                                               |
| 3   | **Security & Compliance Officer**             | POPIA accountable. Owns device trust and revocation (layer 15 provisions; this layer trusts and revokes). |
| 4   | **Clinical Administrator / Medical Director** | The sign-off authority for the Clinician Review Queue in §2, including a device threshold rule. Cannot provision a device without layer 15's register entry. |
| 5   | **Nursing / Ward Manager**                    |                                                               |
| 6   | **Operations & Dispatch Manager**             | Owns the Dispatch & Incidents module.                         |
| 7   | **Facilities / Bed Manager**                  | Owns bed inventory (§7).                                      |
| 8   | **Finance / Billing Officer**                 |                                                               |
| 9   | **Data & Analytics Officer**                  |                                                               |
| 10  | **GilbertOne Engine Administrator**           | Administers the engine under "GilbertOne API Administration." Cannot self-approve a clinical change, including a device threshold. |
| 11  | **Content & Knowledge Officer**               | Steward of the knowledge federation.                          |
| 12  | **Regional / Site Admin**                     | Scoped to **one hospital**.                                   |
| 13  | **Auditor**                                   | **Read-only.** Audits the people who appointed it, which is why §11's external anchor matters. |
| 14  | **Support Agent**                             | **Narrow, time-limited.**                                     |
| 15  | **Device Fleet Administrator**                | Added 24 September 2026. Owns provisioning, decommissioning, firmware-cohort tracking and the per-site device register. Does not own clinical thresholds (layer 4) or trust/revocation (layer 3). |

The scoping axes, restated so they are not lost: **site/region · module · data-class · read/write ·
time-bound break-glass.** Break-glass elevation is granted, logged and **expires**.

Separation of duties, named because layer 15 makes it possible to violate for the first time: layer
15 cannot approve a device threshold; layer 4 cannot provision a device without layer 15's register
entry; layer 10 cannot self-approve a clinical change; layer 13 audits the people who appointed it.
Default-deny holds across all fifteen — a user with no assigned role sees nothing. None of this is
enforced today: `docs/control-tower-session-model.md`, authored 24 September 2026, found that the
live `?role=` switcher in `apps/web/src/Doorway.tsx` "grants no server permissions and stores no
identity in the browser," and an unrecognised role falls through to the patient app — the opposite
of default-deny. The table above is the target shape, not the current one.

---

## 5. Hospital onboarding (draft)

A **tenant-provisioning wizard**, in this order. Marked draft because the sequence is agreed in
shape but not yet authored into a contract:

1. **Facility details**
2. **Wards / beds / departments**
3. **Staff bulk-import + vetting** — vetting runs through the existing pipeline; approving a nurse
   still approves nobody until the vetting gates are real (`docs/ROADMAP.md`'s
   `credential-verification` needs agreements with thirteen separate authorities).
4. **Role assignment** — the fifteen layers of §4.
5. **Branding / CI upload** — the white-label step.
6. **Integrations (HL7 / IoT)** — the seams of §3.
7. **Language selection**
8. **Consent templates**
9. **Go-live checklist**
10. **Training / competency gate** — the last step, and a gate rather than a tick-box.

---

## 6. Dispatch and escalations

An **auto-escalation ladder**: nurse → ward → doctor → on-call → emergency services.

- **Triggers:** panic / SOS, device alerts (§3), or overdue check-ins (§9).
- The escalation is **automatic and ordered** — each rung raises only when the one below does not
  answer inside its window.

> **Flag — the two named escalation contracts do not exist.** The founder's note cites
> `escalation.json` and `escalation-policy.json` as existing. **Neither file is in the tree on
> 23 September 2026.** What exists is the **deterministic escalation ruleset** in
> `packages/gilbertone/src/escalation.ts` — "the deterministic layer that runs BEFORE the model,"
> a fixed, ordered list of symptom patterns with a severity and an approved message, never
> diagnostic, never networked, never reorderable by accident — plus escalation concepts spread
> across `packages/catalog/apis/safety.json`, `closed-loop.json`, `events.json` and others. The
> **ladder policy** (who is paged, in what order, on what timer) would have to be authored as the
> two named contracts. They are recorded here as the intended contract names, not as built files.

---

## 7. Bed booking and admissions

- **Bed inventory by ward and type**, with **live availability**.
- **Admit / transfer / discharge** movements.
- **Waitlist** when no bed of the right type is free.
- **Capacity dashboard** for the Facilities / Bed Manager (§4, layer 7).
- **Wired to scheduling** — the existing `packages/catalog/scheduling.json` and
  `packages/catalog/booking.json`, so a bed and a clinician are booked against the same reality.

---

## 8. Panic buttons

- **Staff panic on site visits** — **one-tap** plus a **hardware fob**, **silent**, **GPS-stamped**.
  On trigger it raises **Dispatch + the nearest responder + SAPS**.
- **Patient SOS exists** — `packages/catalog/sos.json` and `sos-press.json` are already in the tree.
- **Duress codes** — a code that looks like compliance and quietly raises an alarm.
- **Missed check-in auto-escalates** — the same timer logic as §9's check-ins.

---

## 9. Field safety for nurses and doctors on home/site visits — South African context

**Flagged by the founder as a deal-breaker.** Build on the **existing field-safety engine** —
`packages/catalog/field-safety.json` and `packages/catalog/sentinel.json` are in the tree, with
nurse visit timers, panic/SOS, sentinel baselines and door-code verification
(`tests/field-safety.spec.ts`). This section extends that engine; it does not replace it.

The scoped capabilities:

- **Pre-visit risk scoring** against **SAPS precinct / SA Crime Stats** plus **geofenced high-risk
  zones**; **block or upgrade lone visits in red zones.**
- **Two-person rule** for high-risk areas; **no lone visits after dark.**
- **Live GPS trip tracking** to the Control Tower, with **store-and-forward for dead zones.**
- **Scheduled check-ins** — arrival, departure, interval; a **missed check-in auto-escalates on a
  timer.**
- **Silent panic + spoken duress word** — triggers **without the patient or attacker noticing** —
  plus the **hardware fob.**
- **Armed-response & Community Policing Forum (CPF) + SAPS 10111 integration**, with **live GPS to
  the responder.**
- **Escort / buddy and safe-arrival protocol**; **verified parking**; **eyes-on arrival
  confirmation.**
- **Next-of-kin / manager trip-window sharing.**
- **Battery and device-health monitoring** for lone field workers.
- **Load-shedding and severe-weather routing** — extends the existing load-shedding routing.
- **Post-incident care**: mandatory debrief, trauma support, incident report, insurance/liability
  logging.
- **CHW-specific**: known-community risk profiles, local-authority liaison, community vetting.

### External dependencies (founder green-light + pricing needed)

These are gates, not code. Each needs a person, a contract or a decision before the feature above
can be more than documentation:

| Dependency                                  | What is needed                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **(a) A real SAPS / crime-data source**     | A licensed, authoritative feed for pre-visit risk scoring. No such source is contracted. |
| **(b) An armed-response partner agreement** | A signed partner agreement; the responder the panic button actually reaches.             |
| **(c) A hardware fob decision**             | Whether to procure a physical fob, from whom, at what unit cost.                         |

`docs/ROADMAP.md` already records the same shape of gate for `emergency`: "No contracted ambulance
partner," and calls the escalation path from a nurse in a house to an ambulance "the single most
consequential unfinished journey in the product."

---

## 10. Flags and deferrals

These bound the whole scope and are the reason it is queued rather than started:

- **GilbertOne commercialization is a separate product line.** It **must not bloat the patient web
  app** or the **282.16 kB patient-entry bundle budget**. Compare any new figure only against one
  taken the same documented way (`docs/ROADMAP.md`'s release-measurement method: every script,
  module preload and stylesheet referenced by `apps/web/dist/index.html`, gzipped at level 9). The
  engine work lives server-side in `apps/assistant-api` and in the lazy assistant chunk; it does not
  reach the patient entry.
- **All admin and clinical wording stays en-ZA** until clinician sign-off. The **patient app is the
  multi-language surface**; the Control Tower is not.
- **Screens are deferred until the founder loads credits.** Per `docs/ROADMAP.md`'s standing rule,
  _do not start a large build near the weekly credit cap_ — write the plan into the docs instead,
  which is exactly what this file is.
- **Screens must use the real CI** — the G1 mark, the Gilbert mascot, and the brand palette. See the
  reconciliation flag below.

> **Flag — the CI hex values in the founder's note do not match the repository's design tokens.**
> The note names navy `#0C2340`, blue `#2563EB` and violet `#7C3AED`. **None of those three hex
> values appears in `packages/design-tokens/tokens.json` or anywhere under `packages/`, `apps/` or
> `docs/` on 23 September 2026.** The tokens the product actually carries are a navy/teal-and-lime
> palette — deep teal-navy `#0F3B4A`, ink `#0F172A`, blue `#1E3A8A`, teal-green `#1D9E75`, lime
> `#D9FF1A`, orange `#FF6B35`, amber `#FFB347`, mint `#9FE1CB`. Because `AGENTS.md` and
> `docs/ROADMAP.md` both record that **the look and feel is fixed**, the founder's stated values and
> the shipped tokens **must be reconciled before any screen is built** — building to
> `#7C3AED` violet would introduce a colour the fixed identity does not contain. The values are
> recorded here exactly as the founder gave them, with this discrepancy flagged rather than silently
> resolved either way.

---

## Appendix — artifact references, verified against the tree on 23 September 2026

So the next session does not re-discover this, the founder's named artifacts are checked against
what exists. "Exists" means the file is in the tree today.

| Referenced in the note                                                                    | Status on 23 September 2026                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/catalog/devices.json` (+ `apis/devices.json`, `devices/simulator-presets.json`) | **Exists.** Real-device allowlist holds 0 devices; DPIA not-done.                                                                                               |
| `scripts/ingest-knowledge-embeddings.mjs`                                                 | **Exists** (with `.test.ts`). The retrieval-refresh path §2 relies on.                                                                                          |
| `packages/catalog/knowledge/federation.json`                                              | **Exists.** Dark by default; every source `"active": false`.                                                                                                    |
| `tests/simulated-care.spec.ts`                                                            | **Exists.** Seed of the "self-simulating" harness; a full scoring harness is scoped, not built.                                                                 |
| `packages/catalog/field-safety.json`, `sentinel.json`, `sos.json`, `sos-press.json`       | **Exist.** The field-safety engine §9 extends.                                                                                                                  |
| `packages/catalog/scheduling.json`, `booking.json`                                        | **Exist.** What §7 wires bed booking to.                                                                                                                        |
| `packages/gilbertone/src/escalation.ts`                                                   | **Exists.** The deterministic pre-model escalation ruleset.                                                                                                     |
| `escalation.json` / `escalation-policy.json`                                              | **Do not exist.** Named as the intended ladder-policy contracts; would have to be authored (§6).                                                                |
| `gilbertone-api-keys.json` / `gilbertone-api-versioning.json`                             | **Do not exist.** Contract versioning lives in `packages/catalog/apis/assistant.json` + `scripts/api-locks.mjs`; no per-tenant scoped-key artifact exists (§2). |
| `apps/web/src/features/Admin.tsx`, `apps/web/src/shells/StaffShell.tsx`                   | **Exist.** The two surfaces §1 consolidates; tab count to be read off `Admin.tsx` on the build day.                                                             |
| Navy `#0C2340` / blue `#2563EB` / violet `#7C3AED`                                        | **Not present** in the tree. Real tokens differ — reconcile before building (§10).                                                                              |

Nothing in this appendix changes the founder's substance or flags; it records which named artifacts
are already in the tree and which are contracts the work would have to author, so a cold session
queues the right first step instead of assuming a file is there.

---

### Founder decisions applied — 23 September 2026

**(a) CI palette governance.** The shipped `packages/design-tokens/tokens.json` palette —
teal-navy-and-lime (`brandInk` #0F3B4A, `indigo` #1E3A8A, `brandGreen` #1D9E75, `brandLime` #D9FF1A)
— **governs** all Control Tower and future screens. GilbertOne’s brand is an accent _within_ that
token system, never a replacement for it. The navy/blue/violet palette (#0C2340 / #2563EB / #7C3AED)
mentioned during scoping is not in `design-tokens.json` and must not be used as the CI.

**(b) GilbertOne surface restyle is queued, not done now.** Reconciling the already-implemented
GilbertOne surfaces (welcome/consent gate, public assistant sheet) to the token palette is a queued
restyle. It waits on the Control Tower build and is not part of this pass.
