# Control Tower session model — the fifteen admin layers against what exists

Phase 0 continuation. `docs/control-tower-tab-inventory.md` answered *what* moves into the
consolidated portal — ten `Admin.tsx` tabs and five `StaffShell.tsx` Control Tower sections, two of
the ten merged into two of the five. This document does not revisit that list; it takes every
"moved" and "merged" verdict as settled and asks the question the inventory deliberately left open:
*who* is allowed to see and act on each surface once it is one portal, against the founder plan's
fifteen admin layers (§9) and gate register (G15/G16).

**Status: reconciliation only. No session, permission or role-layer code exists, and nothing here
authorises writing any.** Every sentence below that describes a control as absent is a statement
about the tree on 24 September 2026, not a gap this document closes.

## The plan's fifteen layers do not match what is already written down in this repo

Before mapping anything, a discrepancy has to be recorded rather than smoothed over. The plan text
supplied for this task lists **fifteen** layers, ending in a fifteenth — **Device Fleet
Administrator** — with a separation-of-duties rule that names it explicitly ("Layer 15 cannot
approve a device threshold"). `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` §4, written 23 September
2026 from the founder's own scoping session and checked against the tree, lists **fourteen** layers
and has no Device Fleet Administrator row; `docs/ROADMAP.md`'s summary of that document also says
"fourteen scoped admin layers." Neither of those two files carries a "G15" or "G16" gate label, and
neither uses the string "Module 6" the way this task's plan text does — the one place "Module 6"
already appears in the tree, `packages/catalog/clinical-review-queue.json`'s `no-auto-promotion-
without-a-signature` refusal, uses it for the *self-learning boundary* (never autonomously rewriting
clinical rules), which `COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` itself discusses under §2, not a
numbered "Module 6."

So there are, on the record, at least two versions of this plan's numbering in circulation: the
23-September scope document in this tree (fourteen layers, no device layer, no G-numbered gates,
"Module 6" meaning the self-learning lock) and the plan text this task was given (fifteen layers
with a Device Fleet Administrator, G15/G16 gates, "Module 6" meaning the SAHPRA/CDS question). This
document maps the fifteen-layer version it was asked to map, because that is the version whose
separation-of-duties rule names a fifteenth layer by number — but a reader reconciling this against
`COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` should not conclude the tree's own fourteen-layer table was
wrong; it should conclude the two documents have not been reconciled with each other yet, and that
reconciliation is not something this document can do on its own authority. It is listed under Open
questions below.

## What actually exists today: `RoleId`, not a permission layer

`apps/web/src/lib/roles.ts` is, in its own words, "the only place a role's identity is written
down," and `apps/web/src/Doorway.tsx` is "the actual router" (`docs/control-tower-tab-inventory.md`
line 9). Read together, they define one mechanism, and it is not fifteen admin layers or anything
resembling them:

- **`RoleId`** is a closed union of six strings: `'patient' | 'nurse' | 'doctor' | 'partner' |
  'control-tower' | 'back-office'` (`lib/roles.ts:38`). Two of those six — `control-tower` and
  `back-office` — are the two surfaces this consolidation is about; the other four are the clinical
  and patient audiences the tab inventory ruled out of scope by audience, not by permission.
- **The role lives in the URL and nowhere else.** `roleFromSearch` reads `?role=` and falls back to
  `'patient'` for anything it does not recognise (`lib/roles.ts:144-147`); `Doorway.tsx`'s own
  comment states plainly that "this switcher grants no server permissions and stores no identity in
  the browser" (`Doorway.tsx:9`). There is no session token, no cookie, no server-side check, and no
  `localStorage`/`sessionStorage`/`indexedDB` write — consistent with the codebase-wide rule against
  persisting anything in `apps/web/src`. Anyone who edits the address bar becomes that role's viewer
  of the preview instantly, with nothing behind it to refuse them.
- **`surface`** is coarser than `id`: `'patient' | 'clinical' | 'back-office'` (`lib/roles.ts:32`),
  used only to decide which lazy bundle loads (`App`, `StaffShell`, or `AdminShell`) — a bundling
  decision, not an authorisation boundary.
- **`workspace`** picks a tab set inside the clinical bundle (`'Nurse' | 'Doctor' | 'Partner' |
  'Control Tower'`, `lib/roles.ts:37`) — again, which screen renders, not who may act on it.
- **`subjectId`** (`lib/roles.ts:47`, e.g. `'O-801'` for Control Tower, `'A-901'` for back office)
  is cosmetic: it looks the role up in the vetting register (`vetting-fixtures.ts` via `subjectById`)
  purely so the door can show a name, a register and a credential countdown under the role picker
  (`whoIs`, `lib/roles.ts:123-133`). It is a *display* lookup against fixture data, not a grant. A
  role with a lapsed-looking `subjectId` still opens every screen its `workspace` draws; nothing in
  `Doorway.tsx` reads `whoIs`'s output to gate the render.

In short: **today's role switcher is a preview-dashboard picker, not an authorisation system.**
It answers "which screens does this address show me" and nothing else. There is no default-deny
(§9's rule), because there is no allow to invert — the six roles are six routes, all of them equally
reachable to whoever types the URL, and a seventh string in `?role=` falls through to the patient
app rather than to nothing, which is the opposite of default-deny.

## `vetting.json`'s `roles` array is a different kind of role — say so plainly

`packages/catalog/vetting.json` does have a `roles` array (from line 337: `nurse`, and by the same
shape presumably `doctor`, `partner`, `control-tower` entries alongside it, each with `grants` such
as `take-visit`, `view-patient-summary`, `view-clinical-record`, `view-protected-record`,
`write-clinical-note`, each carrying its own refusal sentence). This is **clinical vetting standing**
— whether a person cleared MyThuso's own onboarding gates (background check, SANC/HPCSA registration,
training, activation) to be dispatched and to touch a patient's record at all. It answers "has this
specific person, N-205, been vetted to work as a nurse," gated by seven ordered checks
(`vetting.json`'s gate list) with lapse, suspension and decline rules of its own.

That is not the same question §9's fifteen admin layers ask. The plan's layers are **administrative
permission scopes inside the back office** — who may read Finance, who may approve a device
threshold, who may see one region's data and not another's — a question about *portal access*, not
about *fitness to treat a patient*. `vetting.json`'s `roles` describes four parties (nurse, doctor,
partner, control-tower) at the granularity Doorway's `RoleId` already mirrors; it has no concept of
"Security & Compliance Officer" or "Finance/Billing Officer" inside the back-office audience, because
today the back office is one undifferentiated `RoleId` (`'back-office'`, subject `A-901`) with no
further subdivision at all. Conflating the two would be a category error the codebase itself already
avoids: `vetting.json`'s own `selfActionRefusals` block is about a vetted party acting on their own
register entry, which is a POPIA/clinical-governance concern, not an RBAC concern. Any future
data-class register for the fifteen layers should sit beside `vetting.json`, not inside it.

## Mapping the fifteen layers onto the ten in-scope tabs/sections

The tab inventory's ten in-scope items (eight moved Admin.tsx tabs, plus Dispatch and Incidents —
themselves the two Control Tower sections that absorbed the two merged Admin.tsx tabs) are read here
against which of the fifteen layers would plausibly hold read or write on each, under §9's scoping
axes (site/region · module · data-class · read/write · time-bound break-glass). This is a first-pass
plausibility mapping for reconciliation, not a specification — no data-class register exists yet to
make it precise (next section), and nothing here is a claim that any of it is implemented.

| Tab/section (post-consolidation) | Plausible primary layer(s) | Plausible secondary/read-only | Layers with no business here |
| --- | --- | --- | --- |
| Overview | 1 Super User, 2 System Administrator | 9 Data & Analytics Officer, 13 Auditor | 7 Facilities, 14 Support Agent |
| Vetting queue (merged) | 5 Nursing/Ward Manager, 4 Clinical Administrator | 3 Security & Compliance Officer, 13 Auditor | 8 Finance, 11 Content & Knowledge |
| Dispatch (merged from Operations) | 6 Operations & Dispatch Manager | 5 Nursing/Ward Manager, 12 Regional/Site Admin | 8 Finance, 11 Content & Knowledge |
| Incidents (merged from Operations) | 6 Operations & Dispatch Manager, 3 Security & Compliance Officer | 4 Clinical Administrator, 13 Auditor | 8 Finance, 9 Data & Analytics |
| Clinical (oversight) | 4 Clinical Administrator/Medical Director | 13 Auditor, 9 Data & Analytics Officer | 7 Facilities, 8 Finance, 14 Support Agent |
| Catalogue (pricing) | 8 Finance/Billing Officer | 1 Super User | everyone else |
| Growth (subscriptions/packages) | 8 Finance/Billing Officer | 9 Data & Analytics Officer | clinical layers (4, 5) |
| Finance (funding, tranches) | 8 Finance/Billing Officer, 1 Super User | 13 Auditor | clinical and operational layers |
| Compliance (POPIA/SANC/HPCSA checklist) | 3 Security & Compliance Officer | 13 Auditor, 1 Super User | 8 Finance, 6 Operations |
| Governance (DPIA/IO/residency) | 3 Security & Compliance Officer | 1 Super User, 13 Auditor | 8 Finance, 11 Content & Knowledge |
| Configuration (all engine settings) | 2 System Administrator | 10 GilbertOne Engine Administrator (its own settings only), 3 Security & Compliance Officer | 14 Support Agent (narrow, time-limited — the opposite of unscoped settings access) |

Three of the fifteen layers — **7 Facilities/Bed Manager, 11 Content & Knowledge Officer, 12
Regional/Site Admin** — have no clear landing spot among the ten in-scope items at all, because bed
booking (§7 of the plan), knowledge federation stewardship, and multi-site scoping are none of them
built or represented in `Admin.tsx`/`StaffShell.tsx` today; they would need their own tabs before
they need a layer mapped to them. **10 GilbertOne Engine Administrator** likewise has no home yet:
Configuration (`features/Configuration.tsx`) reads every engine's settings including the assistant
engine's, undifferentiated from any other engine's — there is no narrower "GilbertOne API
Administration" category inside it today, only the plan's naming decision (§1) that one should exist.
**Quality** and **Audit exports**, the tab inventory's other two moved Control Tower sections, are
left out of the table above because the inventory records them as unique with no Admin.tsx
counterpart; by the same reasoning as the rows above, Quality reads as 6 Operations & Dispatch
Manager / 13 Auditor, and Audit exports — whose own comment restricts its caller to "the operator and
nobody else" (`docs/control-tower-tab-inventory.md` line 57) — reads as 13 Auditor primarily, which
is itself informative: `AuditExports.tsx` already has an *implicit* single-caller model in its own
source comment, the closest thing in the codebase today to a layer-scoped route, and it is enforced
by nothing more than a comment.

## The data-class register this needs

§9 scopes every layer by "site/region · module · data-class · read/write · time-bound break-glass."
**No data-class register exists in this codebase.** The closest existing things, and why neither is
it:

- **The identity/health split in `CLAUDE.md`** ("Health data is special personal information under
  POPIA. Identity is not.") is a two-way architectural boundary between `apps/api` and everything
  clinical — enforced by `scripts/check-boundaries.mjs` failing if a clinical table appears in
  `apps/api`'s docs. It is binary and service-level, not a taxonomy a permission layer could be
  scoped against tab-by-tab (Finance's revenue figures and Clinical's AI-miss-rate KPI are both
  "not health data, not identity data" under this split, yet §9 would presumably want them in
  different data classes).
- **`packages/passport-gateway`'s "protected category" / "sealed category" concept**
  (`docs/PRIVACY-AND-SECURITY.md`, `packages/catalog/vetting.json`'s `view-protected-record` grant) is
  a *patient-consent* mechanism — a category of the patient's own record that only the patient's own
  release opens, checked per read against `packages/catalog/consent.json`. It classifies *content a
  patient holds*, not *data an admin layer may or may not see*, and it has no notion of "Finance"
  or "Operations" as a scope at all.
- **`packages/catalog/settings.json`** (Configuration's source) groups settings by *engine*
  (field-safety, clinical, devices, and so on), which is §9's "module" axis, not its "data-class"
  axis — an engine grouping says which subsystem a setting belongs to, not what kind of data it
  exposes (financial, clinical, operational, PII-adjacent, aggregate/statistical).

So: the module axis has a real analogue (engine grouping in `settings.json`, and the tab-level
groupings in the table above); site/region, read/write and time-bound break-glass have no analogue
at all (there is exactly one site implied everywhere, no distinction between reading a screen and
acting on it beyond what each screen's own buttons happen to do, and no expiry concept anywhere in
`apps/web`); and data-class specifically would have to be authored from nothing, as a new contract
(`packages/catalog/data-classes.json` or similar, in the shape every other contract in this repo
takes — states, refusals, as data) before G16's "data-class register authored" gate could be
considered met.

## Separation of duties, written as refusals

§9's separation-of-duties rule, in the register-and-refusal shape the rest of this codebase already
uses for the same kind of thing (`vetting.json`'s `selfActionRefusals`, above, is the closest sibling
— a party's own record is theirs to read, never theirs to change):

- **`device-threshold-approval-outside-layer-15`** — *"A device threshold is set by the Device Fleet
  Administrator's register entry alone. No other layer, however senior, approves one directly."*
  Layer 15 (Device Fleet Administrator) holds this; Layer 1 (Super User) does not inherit it by
  seniority, because §9 states the rule as an exclusion, not a hierarchy.
- **`device-provisioning-without-a-register-entry`** — *"The Clinical Administrator/Medical Director
  (layer 4) does not provision a device. A device is provisioned only against an entry the Device
  Fleet Administrator (layer 15) has already written to the register; provisioning ahead of that
  entry is refused."*
- **`clinical-change-self-approval`** — *"The GilbertOne Engine Administrator (layer 10) does not
  sign off a change to clinical decisioning. That signature is the Clinical Administrator/Medical
  Director's (layer 4) alone, through the Clinician Review Queue — the same board and the same
  Medical Director `packages/catalog/protocols.json#governance` already names as not-formed and
  not-appointed, so today this refusal fires universally, for everyone, because there is no
  signature to give."* This is not a new invention: it is §9's rule pointed at the mechanism
  `packages/catalog/clinical-review-queue.json` already describes — "the one door through which
  anything that could change clinical behaviour... is allowed to move" — which is itself proposed
  and unbuilt, no route, no handler, no runtime queue.
- **`auditor-audits-own-appointer`** — *"The Auditor (layer 13) reviews the actions of whoever
  appointed them, not only the actions of everyone else. An audit scope that excludes the appointer
  is not independent."*
- **`default-deny-unassigned`** — *"A user with no assigned layer sees nothing. The absence of a
  role is not the patient role, the back-office role, or any role at all — it is no screen."* This
  is the one furthest from what exists: today, an unrecognised `?role=` value falls through to
  `'patient'` (`roleFromSearch`, `lib/roles.ts:146`), the opposite of nothing — it is a working
  preview of a real audience's screens, not an empty state.

Each of these is written in the refusal-sentence shape `CLAUDE.md` asks every feature contract to
carry, and each is unenforceable today for the same one reason: there is no session, no identity
check and no per-layer scoping anywhere in `apps/web`, `apps/api` or the Control Tower surfaces —
only the six-way `RoleId` router described above. Writing the sentence is not writing the control,
the same distinction `docs/security/THREAT-MODEL.md` insists on for its own adversary rows.

## What this document does not decide

Per G15's own text ("Tab inventory + session model authored; parallel-run plan; rollback plan"),
this document is the session-model piece only. Two more pieces G15 names are still open and this
document does not propose either:

- **A parallel-run plan** — how the two current surfaces (`Admin.tsx`, `StaffShell.tsx`'s Control
  Tower workspace) would run alongside a consolidated portal during a migration, and for how long.
- **A rollback plan** — what reverts, and how, if the consolidated portal needs to be pulled back
  after going live.

## Open questions this document surfaces rather than settles

- **Which layer count is authoritative** — the tree's own fourteen-layer §4 in
  `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`, or the fifteen-layer version (with Device Fleet
  Administrator) this task's plan text supplied. Until the founder reconciles the two, any G16
  "session model unified" claim is unified against one version and silent about the other.
- **Where the "Module 6" label actually belongs.** Three different meanings are now on record: this
  task's SAHPRA/CDS classification question (see the companion document,
  `docs/governance/REGULATORY-CLASSIFICATION.md`), `clinical-review-queue.json`'s self-learning lock,
  and `COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`'s own unnumbered §2 discussion of the same self-learning
  boundary. A module numbering scheme that means three different things depending on which document
  is open is not yet a numbering scheme a gate register can safely cite.
- **Whether the data-class register is authored before or after the fifteen (or fourteen) layers are
  wired to real authorisation.** This document takes no position; it only establishes that neither
  exists yet.
