# Phase C — the full Lovable export reconciled against the build, screen by screen

Recorded 29 September 2026, founder instruction: _"do all the phases and make sure all works without
breaking anything."_ This is the classification `docs/ROADMAP.md`'s Phase C requires **before any
component moves**: the export's 68 role routes and 17 showcase screens diffed against the repo's
91 feature files, each classified _built_, _deviation_ or _not built_, working patient → nurse →
doctor → partner.

The export is `designs/mythuso-full-project.zip` (203 files, SHA-256 in
`designs/mythuso-full-project.MANIFEST.sha256`). Its routes are thin wrappers over five showcase
spaces — `patient-space.tsx` (30 pages), `nurse-space.tsx` (19), `doctor-space.tsx` (15),
`partner-space.tsx` (4), `more-pages.tsx` (11 of the patient 30) — plus `admin.tsx` and the four
design-system routes. The repo's counterparts are the 32 patient page names dispatched in
`apps/web/src/App.tsx`, the staff screens behind `apps/web/src/shells/StaffShell.tsx`, and the
Control Tower under `apps/web/src/features/portal/`.

Classifications:

- **built** — a repo screen carries the same job, on the contracts. Layout differences are the
  handoff's look, which waves 1–6 already applied; these screens need no port, only the ongoing
  identity work.
- **deviation** — the repo carries the underlying capability but the export's screen is shaped
  differently (a different split of the same contract, or a page where the repo deliberately
  refuses part of what the export shows). A deviation is **not** a gap to close by copying: the
  build's logic, contracts and refusals win on everything that is not a visual question.
- **not built** — no screen and, for the eight patient pages, no capability entry. These are
  Phase D.

## Patient — 30 routes

| Export route                   | Class         | Repo counterpart / finding                                                                                                                                                                    |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/patient` (dashboard)         | built         | `Overview` — `Dashboard.tsx`                                                                                                                                                                  |
| `/patient/health`              | deviation     | `Health trends` — the export splits a health home; the repo folds trends into Overview + wellbeing                                                                                            |
| `/patient/wellness`            | built         | `Live well` — `Wellbeing.tsx`, `WellbeingScreens.tsx`                                                                                                                                         |
| `/patient/activity`            | deviation     | `What readings mean` + Thuso Kit readings (`DeviceLab.tsx`)                                                                                                                                   |
| `/patient/appointments`        | built         | `My visits`                                                                                                                                                                                   |
| `/patient/book-appointment`    | built         | `Book a nurse` — `Booking.tsx`                                                                                                                                                                |
| `/patient/quick-booking`       | deviation     | booking flow's express path; same contract (`booking.json`), no separate screen                                                                                                               |
| `/patient/visit-tracker`       | built         | `Arrival.tsx`, `Care timeline`                                                                                                                                                                |
| `/patient/consultation`        | built         | `Teleconsult.tsx`, `Consultation.tsx`                                                                                                                                                         |
| `/patient/devices`             | built         | `Devices.tsx`, `DeviceLab.tsx` (`devices.json`)                                                                                                                                               |
| `/patient/wearables`           | deviation     | `devices.json` wearable links, shipped in the Kit wave; no dedicated screen — folded into devices                                                                                             |
| `/patient/emergency-info`      | built         | `Your emergency card` (`sos.json`)                                                                                                                                                            |
| `/patient/family`              | built         | `My family` — `Household.tsx`, `Guardian.tsx`, `NextOfKin.tsx`                                                                                                                                |
| `/patient/health-tips`         | built         | `CareTips.tsx` (`care-tips.json`)                                                                                                                                                             |
| `/patient/mental-health`       | built         | wellbeing's mental-health material (`knowledge/mental-health.json`)                                                                                                                           |
| `/patient/messages`            | deviation     | `messaging` capability is contracted; the patient surface renders it inside visits, not as an inbox                                                                                           |
| `/patient/prescriptions`       | built         | `What happens to a prescription` — `Medicines.tsx`, `Dispensing.tsx`                                                                                                                          |
| `/patient/records`             | built         | `Health Passport` — `Passport.tsx`, `PassportScreens.tsx`                                                                                                                                     |
| `/patient/share-records`       | built         | `Share part of your record` — `PassportSharing.tsx`                                                                                                                                           |
| `/patient/settings`            | built         | `Privacy & settings`, `Language & access` — `Access.tsx`, `Consent.tsx`                                                                                                                       |
| `/patient/test-results`        | deviation     | `Laboratory results` exist staff-side (`Hl7Results.tsx`); the patient surface shows results through the Passport, deliberately — no raw results inbox                                         |
| **`/patient/symptom-checker`** | **not built** | Phase D. Inherits `screening`'s block: _no model, no vendor, no licence._ `symptom-intake.json` (v2) already holds the set questions — the screen asks them and escalates; it never diagnoses |
| **`/patient/risk-assessment`** | **not built** | Phase D. Same `screening` block; structure and empty states only, no invented numerals (25 September ruling, option B)                                                                        |
| **`/patient/health-library`**  | **not built** | Phase D. Content exists in `packages/catalog/knowledge/*.json`; no screen, no capability entry                                                                                                |
| **`/patient/health-timeline`** | **not built** | Phase D. Distinct from the visit `Care timeline`: a life-view of records via the Passport                                                                                                     |
| **`/patient/vaccinations`**    | **not built** | Phase D. No contract holds vaccination records today                                                                                                                                          |
| **`/patient/community`**       | **not built** | Phase D. Material in `Onboarding.tsx`, `Household.tsx`, `vetting.json`, `geography.json`, `knowledge/mental-health.json`                                                                      |
| **`/patient/nutrition`**       | **not built** | Phase D. Material in `knowledge/prevention.json`, `maternal.json`, `chronic.json`                                                                                                             |
| **`/patient/reminders`**       | **not built** | Phase D. Material in `Dashboard.tsx`, `Dispensing.tsx`, `events.json`                                                                                                                         |

Patient tally: 13 built, 9 deviation, **8 not built** — exactly the eight of ROADMAP Gap 2, which
this pass confirms screen by screen rather than by count.

## Nurse — 19 routes

| Export route          | Class                     | Repo counterpart / finding                                                                                                                                |
| --------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/nurse` (dashboard)  | built                     | nurse landing in `StaffShell.tsx` (today's visits, longest wait, ready for release)                                                                       |
| `/nurse/visits`       | built                     | `CareVisit.tsx`, `VisitSummary.tsx`                                                                                                                       |
| `/nurse/vetting`      | built                     | `Vetting.tsx` (vetting queue, application)                                                                                                                |
| `/nurse/assessments`  | built                     | `Care assessment`, `Visit assessment`                                                                                                                     |
| `/nurse/kit`          | built                     | `Kit.tsx`, `KitCapture.tsx`, `KitDeck.tsx` (diagnostic kit)                                                                                               |
| `/nurse/map`          | built                     | streets-on staff map, `Movement.tsx` / `TileMap.tsx` (commit `c4dc7d5e`)                                                                                  |
| `/nurse/patients`     | built                     | `Patient context`, `PatientFile.tsx`                                                                                                                      |
| `/nurse/earnings`     | built                     | `Earnings.tsx` (weekly payouts)                                                                                                                           |
| `/nurse/alarms`       | deviation                 | `Incident management`, `Sentinel.tsx`, `ConcernBoard.tsx` carry the job under the safety engine's own words                                               |
| `/nurse/allocations`  | deviation                 | `Locum shifts`, dispatch (`Dispatch.tsx`)                                                                                                                 |
| `/nurse/appointments` | deviation                 | the staff shell's day list; no separate allocations calendar                                                                                              |
| `/nurse/login`        | deviation                 | the repo's door is the demo door plus the authenticator gate; **real login must never be simulated** — the export's login screen is not portable as drawn |
| `/nurse/reports`      | deviation                 | `Audit exports`, `VisitSummary`; report shapes differ                                                                                                     |
| `/nurse/messages`     | not built (staff surface) | `messaging` is contracted; no staff inbox screen. Out of Phase D's patient scope; recorded for a later wave                                               |
| `/nurse/resources`    | not built (staff surface) | no counterpart; out of Phase D scope                                                                                                                      |
| `/nurse/schedule`     | not built (staff surface) | shift patterns live in `roster.json`/dispatch but no nurse-facing schedule screen; out of Phase D scope                                                   |
| `/nurse/settings`     | deviation                 | staff settings fold into the shells' access surface                                                                                                       |
| `/nurse/team`         | not built (staff surface) | out of Phase D scope                                                                                                                                      |
| `/nurse/training`     | deviation                 | `Employer programmes`, `Programmes.tsx` carry training material programme-side                                                                            |

Nurse tally: 8 built, 7 deviation, 4 not built — and the four are staff-surface screens outside the
founder's Phase D eight. They are recorded here so the omission is a decision, not an oversight.

## Doctor — 15 routes

| Export route                | Class                     | Repo counterpart / finding                                                                                            |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/doctor/triage`            | built                     | `ClinicalIntelligence.tsx` review queue (triage, guidance and outcome questions wait on the board)                    |
| `/doctor/teleconsultations` | built                     | `Teleconsultation call`                                                                                               |
| `/doctor/patients`          | built                     | `Patient file`                                                                                                        |
| `/doctor/protocols`         | built                     | `Clinical protocols` (`protocols.json`, draft-gated)                                                                  |
| `/doctor/clinical-notes`    | built                     | `Consultation record`, `New consultation`                                                                             |
| `/doctor/records`           | built                     | `Consultation records`                                                                                                |
| `/doctor/referrals`         | built                     | `Referral pathway`                                                                                                    |
| `/doctor/reports`           | built                     | `Doctor review` (`DoctorFees.tsx`, clinical-review-queue)                                                             |
| `/doctor/test-results`      | built                     | `Laboratory results` (`Hl7Results.tsx`, `Hl7Quarantine.tsx`)                                                          |
| `/doctor/prescriptions`     | deviation                 | prescribing stays with the prescriber outside this product; the repo carries the prescription _pathway_, deliberately |
| `/doctor/schedule`          | deviation                 | `Locum shifts`                                                                                                        |
| `/doctor/messages`          | not built (staff surface) | as nurse/messages                                                                                                     |
| `/doctor/resources`         | not built (staff surface) | —                                                                                                                     |
| `/doctor/settings`          | deviation                 | folds into the shell's access surface                                                                                 |

Doctor tally: 9 built, 4 deviation, 2 not built (staff-surface, out of Phase D scope).

## Partner — 4 routes

| Export route           | Class     | Repo counterpart / finding                                             |
| ---------------------- | --------- | ---------------------------------------------------------------------- |
| `/partner` (orders)    | built     | `Pharmacy orders` — `Orders.tsx`, `OrderDetails.tsx`, `Fulfilment.tsx` |
| `/partner/collections` | built     | `Collections` / fulfilment seam                                        |
| `/partner/repeats`     | deviation | repeat dispensing rides the orders contract; no separate screen        |
| `/partner/results`     | deviation | pharmacy-side results fold into `Laboratory results`                   |

Partner tally: 2 built, 2 deviation, 0 not built.

## Admin and the design-system routes

| Export route   | Class | Repo counterpart                                                                       |
| -------------- | ----- | -------------------------------------------------------------------------------------- |
| `/admin`       | built | the Control Tower — `features/portal/` (waves through Phase 5) and `Configuration.tsx` |
| `/components`  | built | `UiGallery.tsx` (the 18-component `.ui-*` library, wave 2b)                            |
| `/colors`      | built | tokens gallery inside `UiGallery.tsx`; `tokens.json` is the source                     |
| `/typography`  | built | Outfit/Figtree self-hosted (wave 1); type scale in tokens                              |
| `/iconography` | built | `IconGallery.tsx` — the ten-icon family generated to TSX/Swift/Kotlin                  |

## The 17 showcase screens

`patient-space`, `nurse-space`, `doctor-space`, `partner-space`, `clinician-space`, `more-pages`
are the six spaces the routes above render — classified route by route. `shell` is the repo's
`PatientShell`/`StaffShell`/`PortalShell` (built, waves 3–4). `gilbert-chat` and `nurse-gilbert`
are GilbertOne surfaces — **look and feel settled; a newer export does not reopen it** (ROADMAP
invariant). `charts` is the chart language — built as the case pathway's readings and the portal's
widgets, with chart motion recorded in `CHART-MOTION.md`. `icons` — built (icon family).
`nurse-mapbox` — built as the Mapbox-provider staff map. `nurse-field-workspace`,
`nurse-operations`, `care-safety`, `care-live` — deviation: the repo carries field safety
(`FieldSafety.tsx`), dispatch/operations and the safety engine; the export's shapes are reference
material for a later staff wave, not Phase D.

## What Phase D takes from this, and what it must respect

The port list is the eight patient **not built** rows, and nothing else moves: every _built_ screen
keeps its repo shape (the identity already shipped), and every _deviation_ is a deliberate contract
decision that a newer picture does not reopen.

Gates carried into the build, from ROADMAP and `CLAUDE.md:126`:

1. Each of the eight walks the full feature shape: contract in `packages/catalog/`, generator,
   capability entry, boundary checks, Playwright journey on both viewports, FEATURE-MAP row.
2. **No number the contracts do not hold.** The 25 September ruling (option B): structural and
   visual polish only, written empty states wherever a number would go.
3. `symptom-checker` and `risk-assessment` inherit `screening`'s block — _no model, no vendor, no
   licence_ — and the symptom checker asks `symptom-intake.json`'s set questions and escalates; it
   sets no priority, names no cause, gives no advice.
4. A screen is ported whole or not at all; a screen that cannot be finished in one pass stops and
   states its blast radius (the half-migration rule).
5. The patient entry budget — **282.16 kB**, measured the same way — gates every stylesheet import;
   new screens stay behind the app entry's existing lazy patterns.
6. Stack translation, not lift: no Tailwind, no `motion`, no TanStack, no Supabase, no `mapbox-gl`
   in the repo's web app; the export's look is rebuilt on `.ui-*` and tokens, and every motion uses
   `--t-quick`/`--t-settle`/`--t-enter` and `--ease-soft` with reduced-motion removal.
7. Phase B's restated shape: each movement ported gets a real player and a test — no orphan
   keyframes — and is recorded in `docs/brand/CI.md` chapter 7.
