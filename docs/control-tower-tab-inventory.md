# Control Tower tab inventory

Phase 0 of the Control Tower consolidation (MyThuso Control Tower & GilbertOne
Commercialization — Full Plan, Revision 2): before `apps/web/src/features/Admin.tsx` and
`apps/web/src/shells/StaffShell.tsx` are merged into one portal, this is every tab, section
and secondary route either file draws today, what it does, and where it goes. Nothing here is
built or changed — this is the reconciliation the plan asks for before building starts.

Both files are reached from `apps/web/src/Doorway.tsx`, which is the actual router: the role in
`?role=` (`nurse`, `doctor`, `partner`, `control-tower`, `back-office`) selects a lazy import of
either `shells/StaffShell.tsx` (four clinical workspaces sharing one chunk, `Doorway.tsx:14`) or
`shells/AdminShell.tsx` (the back office, `Doorway.tsx:15`), never `App.tsx`, which only mounts
the patient entry. `AdminShell.tsx` is a thin sidebar wrapper around `AdminConsole` from
`features/Admin.tsx`; `StaffShell.tsx` both wraps and draws four role workspaces itself. No other
file under `apps/web/src/features/` duplicates either surface — `grep`-ing for
`admin|staff|dispatch|control.?tower` under `features/` turns up `Dispatch.tsx` (the board
component both surfaces embed), `Admin.tsx` and the modal-router pieces of `StaffShell.tsx`
itself; there is no third console.

`StaffShell.tsx` is one file but four audiences: Nurse, Doctor, Partner and Control Tower share
navigation chrome (`StaffShell.tsx:103-135`) but not purpose. Only Control Tower is an
operations/back-office audience — Nurse, Doctor and Partner are clinicians and a pharmacy partner
doing their own work, not overseeing anyone else's. The Control Tower plan is a back-office
consolidation, so this inventory treats Control Tower's five sections and its "More tools" as in
scope, and the other three workspaces as out of scope by audience — see the rationale on each row
rather than assuming deletion; "retired" below means retired **from this consolidation**, not
removed from the product. `StaffShell.tsx` keeps drawing them exactly as it does today.

## Admin.tsx — the back office console (in scope, 10 tabs)

`adminTabs`, `apps/web/src/features/Admin.tsx:20`. All ten are back-office functions with no
clinician-facing equivalent, so all ten are in scope for the consolidated portal.

| Tab | Lines | What it does today | Disposition | Rationale |
| --- | --- | --- | --- | --- |
| Overview | 94-134 | KPIs (visits/day, subscribers, revenue, dispatchable nurses, reviews awaiting a doctor, open incidents) against the funding proposal's month-9 trajectory table. | moved | Unique executive view; nothing in `StaffShell.tsx` reports against the funding plan. |
| Vetting | 205 (delegates to `VettingConsole`, `features/Vetting.tsx:205`) | Renders `VettingConsole` directly: the reviewer console — queue, renewals, audit, complaints views, role/status filters, per-party decision panel. | merged → Control Tower's **Vetting queue** | `StaffShell.tsx`'s Control Tower "Vetting queue" section (`features/Vetting.tsx:191-201`) renders the identical `VettingConsole` plus `ShiftStartsBoard`. Admin's Vetting tab is a strict subset of the same component under a different chrome — one console, kept where the operational audience already reads it. |
| Operations | 135-155 | KPI strip (parties blocking work, nurses blocked, open incidents) over `DispatchBoard` and `IncidentBoard`, plus a link into Configuration's field-safety group. | merged → split across Control Tower's **Dispatch** and **Incidents** | `DispatchBoard` here duplicates Control Tower's Dispatch section (`StaffShell.tsx:516`, which also adds `ShiftBoard` and Thuso Ride); `IncidentBoard` here duplicates Control Tower's Incidents section (`StaffShell.tsx:517`), which is a superset — it also carries `SafetyDesk`, `SosDesk`, `SafeguardingDesk`, `ConcernBoard`, `HeldCashPayments` and `DeviceRegistryDesk`. Admin's Operations tab has nothing the two Control Tower sections do not already draw more fully. The Configuration deep-link (field-safety settings) has no home yet once the tab it hangs off is gone — see Not yet decided. |
| Clinical | 156-180 | KPIs on the doctor review queue (awaiting review, doctors who cannot sign, AI/doctor agreement, AI miss rate) over a hand-typed 4-row review queue. | moved | Administrative oversight of clinical throughput, for a different reader than the Doctor workspace's own Review queue (`StaffShell.tsx` Doctor role) — no Control Tower section covers it. The queue it draws (`Admin.tsx:156-161`) and the queue the Doctor workspace's dashboard counts off (`features/Workspaces.tsx:89-93`) are two separately hand-typed lists that already disagree — see Not yet decided. |
| Catalogue | 183-216 | Editable service pricing table with live platform-margin arithmetic per `lib/catalog.ts`. | moved | Unique; no clinical or Control Tower screen touches pricing. |
| Growth | 217-257 | Subscription lines (MyThuso for Mom), screening packages, network/B2B lines. | moved | Unique. |
| Finance | 258-311 | Funding round, milestone-gated tranches, unit-economics modeller. | moved | Unique. |
| Compliance | 312-336 | POPIA/regulatory control checklist (SANC, HPCSA, consent versioning, audit log, hosting, Information Officer, SAHPRA). | moved | Unique; distinct from Governance below, which tracks DPIA/IO/residency sign-off rather than a general control checklist. |
| Governance | delegates to the governance-readiness screen under `features/` | DPIA, Information Officer and residency-decision status, each with who did it, when, and what stays refused either way (named in that screen's own top comment; this inventory deliberately does not name the file, because the build keeps the list of files that name the governance register short and argued for, and an inventory is not a reader). | moved | Unique; this is what `apps/passport`'s boundary check is waiting on. |
| Configuration | delegates to `features/Configuration.tsx` | Every engine's settings (`packages/catalog/settings.json`) in one shape, with search, engine filter, per-setting history and clinical-review status. | moved | Unique; becomes the consolidated portal's settings tab. Field-safety's deep-link from Operations needs a new anchor once Operations is gone — see Not yet decided. |

## StaffShell.tsx — Control Tower workspace (in scope)

`workspaces['Control Tower'].sections`, `StaffShell.tsx:124-134`. Reached at `?role=control-tower`.

| Section | Lines | What it does today | Disposition | Rationale |
| --- | --- | --- | --- | --- |
| Dispatch | `sectionBody`, `StaffShell.tsx:516` | `DispatchBoard` (unassigned visits, nurses ranked by ETA, assignment), `ShiftBoard`, and Thuso Ride for the desk. | moved | Absorbs Admin's Operations tab's dispatch half (see above); becomes the portal's Dispatch tab. |
| Incidents | `StaffShell.tsx:517` | `SafetyDesk`, `SosDesk`, `SafeguardingDesk`, `SafeguardingReport`, `ConcernBoard`, `IncidentBoard`, `HeldCashPayments`, `DeviceRegistryDesk` — every open incident, panic, SOS, safeguarding and held-cash item the desk owns. | moved | Absorbs Admin's Operations tab's incident half (see above); already the superset. |
| Vetting queue | `features/Vetting.tsx:191-201` | `VettingConsole` plus `ShiftStartsBoard` (who started a shift today, and whether their face was matched). | moved | Absorbs Admin's Vetting tab (see above); the richer of the two identical consoles. |
| Quality | `Dispatch.tsx:377` (`QualityBoard`) | Complaints, incidents, arrival times and the revenue they move. | moved | Unique; no Admin.tsx equivalent. |
| Audit exports | `features/AuditExports.tsx:19` | Checks a requested date range against `audit-export-max-days` before it would call `GET /v1/core/audit-exports@1`; the route's own caller, per the comment at `StaffShell.tsx:132`, is the operator and nobody else. | moved | Unique; no Admin.tsx equivalent. |

### Control Tower's "More tools" (in scope)

`roleExtras['Control Tower']`, `features/Workspaces.tsx:57`. Reached as modals from the section
above, not as top-level nav.

| Item | Opens | Disposition | Rationale |
| --- | --- | --- | --- |
| Nurse onboarding & vetting | `NurseVetting`, `Dispatch.tsx:351` — a single applicant's decision screen (verify / second / decline) | moved | Already shared: `AdminShell.tsx`'s own modal router (`AdminShell.tsx:115`) wires the identical string to the identical component, so both surfaces already agree on this door without having merged yet. |
| Employer programmes | `Programmes`, `features/Programmes.tsx` | moved | Unique; the comment at `StaffShell.tsx:128-130` notes it is deliberately not a sixth top-level section. |
| HL7 quarantine (development) | `Hl7Quarantine`, lazy-loaded, `StaffShell.tsx:55` | moved | Unique. Named a development operator's view in its own comment (`StaffShell.tsx:54`) — flagged in Not yet decided rather than assumed production-ready. |
| Device Lab | `DeviceLab`, lazy-loaded, `StaffShell.tsx:57` | moved | Unique. Synthetic vital-sign simulator, staff-only per its own comment (`StaffShell.tsx:56`) — same flag as HL7 quarantine. |

## StaffShell.tsx — Nurse, Doctor and Partner workspaces (out of scope)

`workspaces['Nurse']`, `['Doctor']`, `['Partner']`, `StaffShell.tsx:104-123`. These are the three
clinician/partner audiences, not oversight — retired from this consolidation on audience grounds,
not deleted: `StaffShell.tsx` keeps drawing every one of them exactly as today, at `?role=nurse`,
`?role=doctor` and `?role=partner`.

| Role | Section | Disposition | Rationale |
| --- | --- | --- | --- |
| Nurse | Schedule | retired-with-reason: out of scope | Clinician's own day, not an oversight surface. |
| Nurse | Assessments | retired-with-reason: out of scope | Same. |
| Nurse | Thuso Kit | retired-with-reason: out of scope | Same. |
| Nurse | Earnings & payouts | retired-with-reason: out of scope | Same. |
| Nurse | Vetting (her own application) | retired-with-reason: out of scope | The applicant's own five-step form, not the reviewer console — distinct from Control Tower's Vetting queue above. |
| Doctor | Review queue | retired-with-reason: out of scope | Clinician's own worklist, not the oversight metrics on Admin's Clinical tab. |
| Doctor | Teleconsultation | retired-with-reason: out of scope | Same. |
| Doctor | Patient context | retired-with-reason: out of scope | Same. |
| Doctor | Consultation records | retired-with-reason: out of scope | Same. |
| Doctor | Protocols | retired-with-reason: out of scope | Same. |
| Partner | Orders | retired-with-reason: out of scope | Pharmacy/lab partner's own worklist. |
| Partner | Substitution & repeats | retired-with-reason: out of scope | Same. |
| Partner | Collections | retired-with-reason: out of scope | Same. |
| Partner | Results | retired-with-reason: out of scope | Same. |

### Nurse, Doctor and Partner "More tools" (out of scope)

`roleExtras['Nurse']`, `['Doctor']`, `['Partner']`, `features/Workspaces.tsx:53-55`. Listed for
completeness; each is retired from this consolidation for the same reason as its parent section.

| Role | Item |
| --- | --- |
| Nurse | Locum shifts |
| Nurse | Academy |
| Nurse | Hand over a sealed bag (`medicines.json` `handover.heading`) |
| Doctor | Clinical protocols |
| Doctor | Referral pathway |
| Doctor | Per-case fees |
| Doctor | Claim draft |
| Doctor | Write a prescription (`medicines.json` `prescribe.heading`) |
| Doctor | Results waiting for you (`medicines.json` `results.heading`) |
| Partner | Prescription RX-0081 |
| Partner | Laboratory order LAB-0023 |
| Partner | Verify and dispense (`medicines.json` `pharmacy.heading`) |

## Totals

45 tabs/sections/routes catalogued across the two files: 10 in `Admin.tsx`, 19 top-level sections
in `StaffShell.tsx` across its four workspaces, plus 16 "More tools" modal routes (4 Control
Tower, 12 Nurse/Doctor/Partner).

- **Moved as-is:** 17 — 8 Admin.tsx tabs (Overview, Clinical, Catalogue, Growth, Finance,
  Compliance, Governance, Configuration) + 5 Control Tower sections (Dispatch, Incidents, Vetting
  queue, Quality, Audit exports) + 4 Control Tower "More tools" items.
- **Merged:** 2 — Admin.tsx's Vetting tab into Control Tower's Vetting queue; Admin.tsx's
  Operations tab, split across Control Tower's Dispatch and Incidents sections.
- **Retired-with-reason (out of scope, not deleted):** 26 — the 14 Nurse/Doctor/Partner sections
  and their 12 "More tools" items. `StaffShell.tsx` keeps every one of them unchanged; they are
  simply not part of the Control Tower portal.

## Not yet decided

- **Where the Configuration deep-link lands.** Admin's Operations tab opens Configuration
  pre-scoped to the field-safety settings group (`Admin.tsx:150-153`, `openSettings`). Once
  Operations is gone, nothing in `StaffShell.tsx`'s Dispatch or Incidents sections offers an
  equivalent way into Configuration — the consolidated portal needs to decide which merged section
  carries that link forward, and this inventory does not propose one. _Phase 3, 24 September 2026:
  the portal carries it under Incidents, recorded in `packages/catalog/control-tower-portal.json`
  `#decisions` for whoever signs the cutover to accept or change._
- **Whether Admin's Clinical tab (oversight of the doctor review queue) gets a real home or stays
  a standalone tab.** It is genuinely unique — no Control Tower section reports on doctor
  throughput or AI/doctor agreement — but it is also the one Admin tab with no natural neighbour
  among Control Tower's five operational sections. Marked "moved" above for lack of a better fit,
  not because a fit was found.
- **The two hand-typed, disagreeing review-queue mock lists.** `Admin.tsx:156-161` and
  `features/Workspaces.tsx:89-93` are two separately typed 3-4 row lists of doctor review cases
  that do not match each other (different reference numbers, different flags). Consolidating the
  Clinical tab does not fix this by itself; whichever screen survives needs to read one list, not
  invent a third.
- **Whether the two development-only Control Tower "More tools" items belong in a portal meant for
  production back-office use.** HL7 quarantine and Device Lab are both explicitly named
  development/staff-only surfaces in their own source comments (`StaffShell.tsx:54,56`). This
  inventory records them as "moved" because nothing indicates otherwise, not because their fitness
  for the consolidated portal was assessed.
- **Whether "Nurse onboarding & vetting" (the single-applicant decision screen) should be a
  separate door at all, or a row reached from inside the merged Vetting queue console.** Both
  shells already route the identical modal string to the identical component without having
  reconciled with each other first — that agreement looks incidental rather than designed, and
  nothing in either file explains why the single-applicant view is a separate entry point from the
  console that already lists every applicant.
