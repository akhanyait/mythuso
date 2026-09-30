# Lovable full design alignment — the assessment and gap register

Recorded 30 September 2026, founder instruction: _"Adjust the look and feel to the Lovable one, the
layout and the elements on all screens … all Lovable features must be added if they do not exist but
be in scope … have a unified UI/UX … the animations must be pulled and be made smooth. Please scope
this and let me know."_

This is the Wave 0 assessment the approved plan requires before any component moves. It builds on
`LOVABLE-EXPORT-RECONCILIATION.md` (which classified the export's 68 routes and 17 showcase screens
_built / deviation / not built_) and answers a different question: **screen by screen and element by
element, what does the export carry that the live app does not, and what class of work is each gap?**

Two decisions were taken before this assessment and govern every wave:

- **GilbertOne stays settled.** Its face and animation are not redesigned; only the chrome around it
  is aligned. This honours the recorded invariant that the assistant's look and feel is fixed and a
  newer export does not reopen it.
- **Refusal screens keep honest and wear the new look.** The export's simulated staff login, its raw
  patient test-results inbox, and its doctor prescribing screen are not built as drawn. Login stays
  the authenticator/demo door, results stay Passport-mediated, prescribing stays a pathway. Nothing
  is simulated and no number is invented (the 25 September ruling: structural and visual polish with
  written empty states wherever a figure would go).

Delta classes used below:

- **aligned** — already live from waves 1–6; verify only, no work.
- **adopt-visual** — tokens, spacing, type, colour and radius on an existing screen; no restructure.
- **adopt-layout** — restructure an existing screen to the export's arrangement, on the same contract.
- **new-capability** — a screen or element with no counterpart; needs a contract, generator, gate,
  tests and a FEATURE-MAP row.
- **gated** — deliberately refused (safety, governance, or a settled invariant); takes the look, not
  the behaviour.

## Headline finding — the identity is already aligned; the gaps are layout, elements and motion

The export's design system and the live app's design system were compared directly and are the same
system:

| Layer | Export source | Live app | State |
| --- | --- | --- | --- |
| Semantic colour roles | `styles/theme.css` — 19 roles (`background`, `foreground`, `surface`, `surface-raised`, `primary`, `primary-foreground`, `accent`, `accent-foreground`, `muted`, `muted-foreground`, `success`, `warning`, `danger`, `info`, `highlight`, `coral`, `border`, `input`, `ring`) | `packages/design-tokens/tokens.json#semantic` — the same 19 roles including `surfaceRaised`, light and dark | **aligned** |
| Radii / shadows / type scale | `theme.css` `--radius-sm/md/lg`, `--shadow-sm/md`, `--font-display`/`--font-body` | tokens.json radii 6/8/12, two shadows, Outfit (display) + Figtree (body), self-hosted | **aligned** |
| Component library | `.lovable/design-system.json` — 18 components (Button, IconButton, Badge, StatusIndicator, Input, Textarea, Select, Checkbox, Field, Card, MetricCard, Alert, Avatar, Tabs, NavigationItem, Divider, Spinner, GilbertOne) | `apps/web/src/ui/*` — all 18 present as `.ui-*` primitives (`ui.css` carries `.ui-button`, `.ui-badge`, `.ui-status`, `.ui-metric`, `.ui-nav-item`, `.ui-field`, `.ui-card`, `.ui-alert`, `.ui-avatar`, `.ui-tab`, `.ui-divider`, `.ui-spinner`, `.ui-checkbox`, `.ui-select`, `.ui-control`) | **aligned** |
| Branded icon family | `components/mythuso-icons.tsx` — 10 `MyThuso*Icon` (Dashboard, Health, Visit, Quick, Results, Medication, Mind, Messages, Family, Settings) | `apps/web/src/ui/icons/MyThusoIcons.generated.tsx` — the same 10, generated to TSX/Swift/Kotlin | **aligned (identical set)** |

**Consequence for scope:** Wave 1 is a reconciliation and gap-fill, not a rebuild. The tokens, the
`.ui-*` library, the icon family and the fonts are live and match. What the export carries that the
app does not is (1) the **layout and element arrangement of each screen**, (2) the **named motion
set**, (3) the **map layouts**, (4) a **grouped-navigation pattern** the app's shells do not yet use
uniformly, and (5) **six staff-surface capabilities** that were deliberately out of Phase D's scope.

The export's stack stays out: Tailwind 4.3.3, `@tanstack/react-router` + `react-query`, Supabase,
`mapbox-gl`, Radix primitives and `lucide-react@1.48` are all absent from `apps/web` by decision. The
look is rebuilt on `.ui-*` + tokens; maps translate onto `apps/web/src/map/TileMap.tsx` (maplibre)
over `packages/catalog/geography.json`; icons stay on the repo's `lucide-react@^0.468`.

## The overlay-kit gap (Radix `components/ui/`)

The export ships a Radix-backed overlay kit the `.ui-*` library does not yet mirror: `command`,
`dialog`, `dropdown-menu`, `hover-card`, `input-group`, `button-group`, `tooltip`, plus `separator`
and `spinner` (the last two already exist as `.ui-divider` and `.ui-spinner`). These are **patterns,
not features**. They are built as `.ui-*` classes only where a ported screen genuinely needs one —
no Radix dependency, and the repo's existing `<dialog>`/`showModal()` machinery is reused rather than
duplicated. Classified **new-capability (conditional)**; each is pulled in by the wave that first
needs it, not speculatively.

## Screen-by-screen delta

### Patient — 30 routes (13 built, 9 deviation, 8 shipped in Phase D)

| Export route | Repo counterpart | Layout/element delta | Class |
| --- | --- | --- | --- |
| `/patient` dashboard | Overview / dashboard | export uses grouped nav + a page-intro header (eyebrow / title / description) + metric-card grid; repo dashboard has its own arrangement | adopt-layout |
| `/patient/health` | trends folded into overview + wellbeing | export splits a health home | gated (deviation — the fold is a contract decision) + adopt-visual |
| `/patient/wellness` | Live well | element/spacing polish | adopt-visual |
| `/patient/activity` | readings + Thuso Kit | export's activity cards | adopt-visual |
| `/patient/appointments` | My visits | list/card arrangement | adopt-layout |
| `/patient/book-appointment` | Book a nurse | booking flow header + steps | adopt-visual |
| `/patient/quick-booking` | booking express path | no separate screen in repo | gated (deviation — same `booking.json`) |
| `/patient/visit-tracker` | Arrival / care timeline | tracker element styling | adopt-visual |
| `/patient/consultation` | Teleconsult / Consultation | call-screen chrome (not the GilbertOne face) | adopt-visual |
| `/patient/devices` | Devices / Device Lab | device-card grid, device photography | adopt-layout |
| `/patient/wearables` | `devices.json` wearable links | folded into devices | gated (deviation) |
| `/patient/emergency-info` | Your emergency card | card styling | adopt-visual |
| `/patient/family` | My family | member-card arrangement | adopt-visual |
| `/patient/health-tips` | Care tips | tip-card grid | adopt-visual |
| `/patient/mental-health` | wellbeing mental-health material | resource-card styling | adopt-visual |
| `/patient/messages` | rendered inside visits | export draws a patient inbox | gated (deviation — no patient inbox surface) |
| `/patient/prescriptions` | prescription pathway | pathway styling | adopt-visual |
| `/patient/records` | Health Passport | record-list arrangement | adopt-layout |
| `/patient/share-records` | Share part of your record | share-flow styling | adopt-visual |
| `/patient/settings` | Privacy & settings / Language & access | settings-row styling | adopt-visual |
| `/patient/test-results` | results via Passport | export draws a raw results inbox | **gated (refusal — stays Passport-mediated)** |
| `/patient/symptom-checker` … `/patient/reminders` (8) | Phase D `PatientPages` screens | already shipped on the identity; layout already matches the export's card/aside shape | aligned (verify) |

Patient net: the eight Phase D pages are **aligned**; the remaining work is adopt-visual on most
built screens, adopt-layout on the four card/list-heavy screens (dashboard, appointments, devices,
records), and three gated deviations plus the gated results refusal.

### Nurse — 19 routes (8 built, 7 deviation, 4 not built)

Built screens (dashboard, visits, vetting, assessments, kit, map, patients, earnings) take
adopt-visual/adopt-layout. The export's nurse space adds an **alarm banner**, a **security step-up**
panel on vetting, and a **clinician-verify + field-safety** split on visits — the repo carries these
as the safety engine's own words (`Sentinel`, `ConcernBoard`, `FieldSafety`), so they are
adopt-visual on the existing surfaces, not new screens. Deviations (alarms, allocations,
appointments, login, reports, settings, training) keep repo behaviour. **Login stays the
authenticator/demo door — gated.** The four **not-built staff screens** are new-capability:

| Export route | Class | Note |
| --- | --- | --- |
| `/nurse/messages` | new-capability | `messaging` is contracted; no staff inbox screen |
| `/nurse/resources` | new-capability | no counterpart |
| `/nurse/schedule` | new-capability | shift patterns live in `roster.json`/dispatch; no nurse-facing schedule screen |
| `/nurse/team` | new-capability | no counterpart |

### Doctor — 15 routes (9 built, 4 deviation, 2 not built)

Built screens (triage, teleconsultations, patients, protocols, clinical-notes, records, referrals,
reports, test-results) take adopt-visual/adopt-layout. **Prescribing stays a pathway — gated.**
`/doctor/messages` and `/doctor/resources` are new-capability (shared with the nurse surfaces).

### Partner — 4 routes (2 built, 2 deviation)

Orders and collections take adopt-visual; repeats and results are gated deviations that ride the
orders contract.

### Admin and design-system routes

`/admin` → the Control Tower (`features/portal/`): adopt-visual **within the pinned §5.1 category
order** — screen rebuilds inside each category, never a nav regroup. `/components`, `/colors`,
`/typography`, `/iconography` → the repo's `UiGallery` / `IconGallery` / tokens gallery: aligned.

## Feature register — Lovable features not present today

| Feature | Where the export shows it | In scope | Lands in | Contract it reads |
| --- | --- | --- | --- | --- |
| Grouped navigation rail (`navGroups`) | every space's sidebar | adopt — unify the shells' nav pattern | shells (`PatientShell`, `StaffShell`, `PortalShell`) | `roles.ts` sections + locale nav keys |
| Page-intro header (eyebrow / title / description) | `shell.tsx` `PageIntro`, most spaces | adopt — one shared header pattern | shared surface CSS + a `.ui-*` header | screen contracts (words already catalog-held) |
| Metric-card with trend | dashboards, admin | aligned (`.ui-metric` exists) — apply where used | features | engine/catalog figures only, never invented |
| Status indicator (online/busy/offline) | nurse dashboards | aligned (`.ui-status`) — apply | features | `capabilities.json` / engine state |
| Mapbox nurse/patient maps (route draw, pin arrive, location pulse, patient markers) | `nurse-mapbox`, nurse space | adopt — **translate to maplibre `TileMap`** | map surface (staff chunk) | `geography.json` |
| Chart language (draw, reveal, point-arrive, range-arrive, halo-pulse) | `charts.tsx`, case pathway, portal widgets | adopt — motion on existing charts | chart surfaces | readings/portal contracts |
| AI-element conversation styling (message, prompt-input, shimmer, conversation) | `components/ai-elements/` | adopt **around** the assistant, not inside the settled GilbertOne face | assistant chrome | `assistant.json` |
| Overlay kit (command, dialog, dropdown-menu, hover-card, input-group, button-group, tooltip) | Radix `components/ui/` | conditional new-capability — only where a ported screen needs it | `.ui-*` | n/a (patterns) |
| Staff messages / resources / schedule / team (nurse + doctor) | nurse/doctor spaces | new-capability (6 screens) | staff chunk | new top-level catalog contracts |
| Alarm banner / security step-up / clinician-verify panels | nurse space | adopt-visual on existing safety surfaces | staff features | `sentinel.json`, `vetting.json` |

## Motion reconciliation — 33 named movements, 2 shared, 31 unported

`theme.css` names 33 `@keyframes`. The live product CSS carries 53 movements of its own; exactly two
names are shared (`mythuso-signal`, `impact-halo-pulse`). The 31 unported theme movements are
classified by the surface that would play them. Each that is adopted gets a **real player on a real
element and a test**, expressed on `--t-quick`/`--t-settle`/`--t-enter` + `--ease-soft`, removed under
`prefers-reduced-motion`, and recorded in `docs/brand/CI.md` chapter 7 (regenerated via
`scripts/emit-ci.mjs`, never hand-edited). No orphan keyframes.

| Group | Movements | Disposition |
| --- | --- | --- |
| GilbertOne face | `gilbert-blink`, `gilbert-look`, `gilbert-turn` | **gated — settled.** The repo's own face rig governs; these are not re-ported |
| Charts | `chart-draw`, `chart-reveal`, `chart-point-arrive`, `chart-range-arrive`, `chart-halo-pulse` | adopt on the case-pathway readings and portal widgets (Wave 2 + Wave 5) |
| Patient surfaces | `patient-rise`, `health-tab-enter`, `health-goal-fill`, `metric-progress`, `consultation-enter`, `status-breathe` | adopt where a real element plays them (Wave 3) |
| Notification / progress rings | `notification-ring`, `ring-fill` | adopt on the notification bell and any ring progress (Wave 3) |
| Nurse / staff | `nurse-bar-rise`, `nurse-field-enter`, `nurse-location-pulse`, `nurse-orbit`, `nurse-pin-arrive`, `nurse-readiness`, `nurse-route-draw`, `nurse-schedule-fill`, `nurse-patient-image` | adopt on the staff map, schedule and earnings (Wave 4 + Wave 5) |
| Doctor | `doctor-page-enter` | adopt as the doctor screen entrance (Wave 4) |
| Impact / portal | `impact-rise`, `impact-map-float` | adopt on portal overview widgets (Wave 6) |
| Landing hero (public entry) | `hero-float`, `hero-pulse`, `hero-drift` | adopt on the landing hero if it uses them; public entry, not the patient budget (Wave 5) |

## The waves this assessment feeds

- **Wave 1 — design-system reconciliation.** Verify tokens/components/icons against the export (all
  aligned); build only the overlay-kit patterns a later wave first needs. No speculative components.
- **Wave 2 — motion.** Port the adopted movements above, each with a real player and a test;
  regenerate CI.md ch.7. This restates Phase B per the founder's instruction to actually wire them.
- **Wave 3 — patient surfaces.** adopt-visual across the built patient screens, adopt-layout on the
  dashboard/appointments/devices/records, the shared page-intro header, and the **"Your health"
  sidebar door** (a 10th `navigation` row in `PatientShell.tsx` + a `nav.Your health` key in all 11
  locales, keeping "Explore MyThuso" last for the position-based deep-journey test). Results inbox
  stays a gated refusal.
- **Wave 4 — staff surfaces.** Concept-kit preview + founder approval first for clinical screens;
  adopt-visual/layout on built nurse/doctor/partner screens; build the six new staff screens
  (messages, resources, schedule, team) as contract-driven capabilities. Login and prescribing stay
  gated.
- **Wave 5 — maps and remaining gaps.** Translate the mapbox map layouts onto maplibre `TileMap`;
  wire chart and landing-hero motion; AI-element conversation styling around the settled assistant.
- **Wave 6 — Control Tower / admin.** adopt-visual within the pinned §5.1 category order; impact
  motion on overview widgets; concept-kit approval for clinical-category visuals.
- **Wave 7 — verification, docs, preview, ship.** Fresh build, patient-entry budget re-measured
  against 282.16 kB, `npm run check` + `check-boundaries` green under Node 22, full Playwright suite
  attributed, FEATURE-MAP/ROADMAP updated, local preview for sign-off, then push (L3 gate) and deploy
  each on their own explicit confirmation.

## Budget and edit-hygiene notes carried into every wave

- The patient entry is 253.06 kB against the 282.16 kB gate. Any new patient-facing stylesheet is
  paid for by relocating public-only rules off the entry (the `public-revamp.css` precedent); heavy
  new screens ride existing lazy chunks. Measured only from a fresh build.
- A new production stylesheet that carries motion must be appended to check-boundaries' explicit
  motion-allowlist in the same change, and the guard proven by a deliberate literal — a guard that
  follows a rename by narrowing its own scope stops guarding.
- Boundary-scanned or very large tracked files are edited through shell/python writers that bypass
  format-on-save, with `git diff --numstat` proving scope; `check-boundaries.mjs` runs under Node 22.
- Control Tower nav cannot be cosmetically regrouped — the 14 categories are pinned to §5.1 order in
  the contract, the boundary check, `tests/nav.ts` and the portal spec.

## Out of scope / gated (recorded, not silently dropped)

- Real sign-in (no SMS/identity provider), the raw patient results inbox, the prescribing screen, and
  any invented clinical number — honest refusals wearing the new look.
- GilbertOne's own face and animation — settled invariant.
- Control Tower nav regrouping — blocked by the pinned category order.
- The export's stack (Tailwind, TanStack, Supabase, mapbox-gl, Radix, lucide@1.48) — never enters
  `apps/web`; the look is translated, not lifted.
- Native iOS/Android re-layout — generated word/icon data only where a wave already emits it.
