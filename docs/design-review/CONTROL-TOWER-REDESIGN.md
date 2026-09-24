# Control Tower Redesign — Design Spec & Execution Plan

Written 24 September 2026. Founder-approved design direction for the MyThuso Control Tower screen redesign. This document is the durable spec: any session can pick it up cold and execute the next batch without re-exploration.

## Status

- **Designs approved**: 8 screens (see Screen inventory below).
- **Ruling 1 — Auth**: TOTP-only gate for now (password + authenticator code). Full identity service / SMS OTP deferred until the founder chooses an SMS provider. The `?role=` preview picker stays behind `MYTHUSO_AUTH_MODE=demo`; production mode removes it.
- **Ruling 2 — CI**: The shipped `packages/design-tokens/tokens.json` teal-navy-lime palette governs (`brandInk #0F3B4A`, `indigo #1E3A8A`, `brandGreen #1D9E75`, `brandLime #D9FF1A`) on the mist/charcoal/sage surface language from `docs/DESIGN-LANGUAGE.md`. GilbertOne's brand is an accent within the token system, never a replacement. This overrides the stale "no indigo" comment in `apps/web/src/features/portal/portal.css`.

## Information architecture — 14 categories → 9

The current 14 categories / 27 tabs are dense and hard to follow. Collapse to 9 clear pill-nav rows. Naming locked per the founder's 23 Sep decision (`docs/ROADMAP.md`): "MyThuso Control Tower", "Dispatch & Incidents", "GilbertOne API Administration".

| #   | Category                      | Absorbs from current                          | Notes                                                                             |
| --- | ----------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Overview                      | overview                                      | Home: metrics, service status, gates, activity                                    |
| 2   | Dispatch & Incidents          | operations + StaffShell Control Tower figures | Field safety live map, roster, alerts, deployment-mode switcher                   |
| 3   | Clinical                      | clinician-review-queue + clinical tabs        | Review queue, vetting, sign-off, dispensing                                       |
| 4   | Devices & IoT                 | devices                                       | Fleet, allowlist, provisioning, readings                                          |
| 5   | GilbertOne API Administration | gilbertone-api-administration (8 sub-screens) | Engine, Voice, Model providers, Intelligence, Knowledge, Compliance, API registry |
| 6   | Commerce                      | money/earnings/shop tabs                      | Money, earnings, marketplace, vouchers, claims                                    |
| 7   | Configuration                 | configuration                                 | 11 settings engines, review-then-confirm                                          |
| 8   | Governance                    | governance/compliance tabs                    | Gates register, DPIA, audit trail, roles & access                                 |
| 9   | Founder                       | founder-access panel                          | Super User: key reveal, break-glass, system health, deploy status                 |

Legacy `AdminShell` / `StaffShell` Control Tower stay reachable at `?legacy=1` until gate G15 closes (`docs/control-tower-cutover.md`).

## Component vocabulary

All controls: 44px target floor, two-ring focus (`--focus` mango inner / `--focus-edge` charcoal outer), token-only colors, contract-driven values, `role`/`aria` per `docs/control-tower-accessibility.md`.

| Component              | Anatomy                                                                                     | Tokens                                                              | A11y                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| Slider                 | stone track · charcoal fill · circular thumb w/ white ring · floating mango-soft value chip | `--stone` `--charcoal` `--mango-soft`                               | 44px thumb, `aria-valuenow`, two-ring focus                  |
| Toggle switch          | rounded pill track · white circular thumb                                                   | ON `--brand-green` · OFF `--stone`                                  | 44×44, `role=switch`, `aria-checked`                         |
| Segmented control      | pill segments · active filled charcoal                                                      | `--charcoal` / hairline outline                                     | `role=radiogroup`, roving tabindex                           |
| Progress ring          | stone track arc · charcoal filled arc · center numeral                                      | `--stone` `--charcoal`                                              | `role=img` + spoken summary                                  |
| Numeric stepper        | rounded field · large light numeral · circular ± buttons                                    | `--charcoal` `--stone` hairline                                     | 44px buttons, `aria-valuenow`                                |
| Status chip            | fully-rounded pill · six-word vocabulary                                                    | teal-soft / mango-soft / pale-sage / cloud / charcoal / danger-soft | text always present, never color-only                        |
| Sparkline / area chart | sage fill fading to transparent · dotted trend · floating chip                              | `--pale-sage` `--stone`                                             | `role=img`, table fallback per `Chart.tsx`                   |
| Vault panel            | dark charcoal inner panel · masked values · reveal pills                                    | `--charcoal` ground, white text                                     | two-ring focus, 30s wipe, fresh TOTP per reveal              |
| Pill nav row           | icon + label + arrow · active = filled charcoal pill                                        | `--charcoal` / `--surface`                                          | `role=tab`, `aria-selected`, roving tabindex, Home/End, wrap |

## Screen inventory

### Approved (8 mockups generated 24 Sep 2026)

1. **Sign-In** — password + 6-digit TOTP, two-ring focus, lockout sentence, "Secure · TOTP" chip. Dark by default until enabled.
2. **Overview** — 9-category pill nav, 4 metric cards (chip-above-large-light-numeral), sage area chart "Visits this week", stacked segment bar, service-status grid (six-word vocabulary), open-gates list with refusal sentences.
3. **Dispatch & Incidents** — schematic precinct map (sage fills, stone hairlines, zero tile requests), nurse position markers, mango missed-check-in warnings, red escalation, translucent load-shedding overlay; right column: live roster w/ risk chips, danger-soft alert card, deployment-mode segmented switcher (Physical/Online/Deferred) + risk-trend sparkline.
4. **GilbertOne Intelligence** — 0–4 level slider (tick marks, charcoal thumb, mango-soft value chip, two-ring focus), conversation-ceilings table w/ lock-icon chips on gated rows, "Why this is gated" refusal card (G31), segmented platform-maximum track.
5. **Voice configurator** — Rate & Pitch sliders, 3 toggle switches (Speak replies / Auto-play / Clinical voice rows w/ lock), voice selection chips (Luke en-ZA / Adri af-ZA / Willem af-ZA), Play all / Stop pills, latency + cost chips, mango-soft refusal notice.
6. **Settings configurator** — 4 control types across setting rows (slider, toggles, segmented, numeric stepper), provenance lines, review-then-confirm bar (Preview change / Cancel), "reaches the next visit" note.
7. **Intelligence slider (enhanced)** — full-width slider w/ 5 ticks, conversation-ceilings table, gated refusal card, segmented progress track.
8. **Founder / Super User** — 3 progress rings (systems nominal / open gates / keys configured), dark vault panel w/ masked key values + Reveal pills + 30s-wipe note, break-glass toggle (OFF, danger-soft "audited" chip), system-health status rows, deploy sparkline w/ "live · mythuso.co.za" chip.

### Still to design (generate mockups before building each)

- Devices & IoT fleet view
- Governance gates register
- Commerce dashboard
- Clinical review queue
- Model Providers (Azure OpenAI + Azure Speech configured; others not-configured)

## Motion rules

All motion runs through the existing system (`apps/web/src/lib/motion.ts`, `apps/web/src/surface/motion.css`, `apps/web/src/components/ChartMotion.tsx`):

- Only `transform` and `opacity` animate.
- Decorative motion gated on `[data-decor='on']`; global pause via `<MotionPause/>`.
- Reduced motion **removes** animations entirely, never shortens them.
- No `cubic-bezier(...)` literals in any stylesheet (`check-boundaries.mjs` fails those); JS `animate()` calls are the escape hatch (see `ChartMotion.tsx`).
- Token durations only: `--t-quick` 160ms, `--t-settle` 280ms, `--t-enter` 420ms, curve `--ease-soft`.
- Chart draws: stroke-dashoffset on lines, staggered fades on areas, `scaleY/scaleX(0→1)` on bars — finite, gated, removed under reduced motion.
- Skeletons stay still (no pulse) per `portal.css`.
- `portal.css` is currently excluded from the cubic-bezier and sage-fill boundary checks — adding motion there won't be caught by the script, so self-enforce the rules.

## Hard constraints (must not change)

- No router library; keep query-parameter addresses (`?role=&category=&tab=`). Every category/tab addressable. `tests/nav.ts` + `tests/control-tower-portal.spec.ts` assert this.
- No `localStorage` / `sessionStorage` / IndexedDB anywhere in `apps/web/src` (`check-boundaries.mjs` throws). In-memory sessions only.
- Every label, blurb, status word, empty state, refusal from `packages/catalog/*.json`; components `throw` on a missing id.
- Six-word status vocabulary: `connected / degraded / disconnected / dark / not-configured / gated`. Five-word build vocabulary: `built / proposed / dark / gated / named-but-absent`.
- WAI-ARIA tabs (automatic activation, roving tabindex, Home/End, wrap), 44×44 targets, two-ring `:focus-visible`, 13px type floor, no horizontal overflow at 320px or 200% zoom.
- Patient entry budget ≤ **282.16 kB** measured the documented way. Control Tower stays behind dynamic imports (`Doorway.tsx` lazy-loads `PortalShell`); the 13-name `CARRIED_BY_THE_ONE_ENTRY` ratchet in `tests/states.spec.ts` must not grow.
- No key, endpoint, or region on any admin screen (`readServiceBooleans` coerces to booleans only).
- Gated controls draw the refusal sentence as **text**, always (`Controls.tsx`).
- Legacy shells stay at `?legacy=1` until G15 closes.
- en-ZA wording; all admin/clinical copy awaits clinician sign-off.
- Appendix D wireframes in `docs/PROMPT-CONTROL-TOWER-UI.md` "must not be built as shown" — they display values the tree does not hold. Real screens render contract-driven values and written empty states.

## Phased execution plan

Each phase is independently verifiable and committable. Run `node scripts/check-boundaries.mjs` + `npm run check` + the relevant Playwright spec after each.

| Phase                        | What                                                                                                                                                                                                                                                                                      | Files                                                                                                                                                                                                       | Gate                                                                                               | Est. batches |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| **0 — Spec**                 | This document + ROADMAP entry.                                                                                                                                                                                                                                                            | `docs/design-review/CONTROL-TOWER-REDESIGN.md`, `docs/ROADMAP.md`                                                                                                                                           | Written                                                                                            | 1 (done)     |
| **1 — Auth gate**            | TOTP login screen (password + 6-digit code) wired to a Control Tower session module in `apps/assistant-api` (extends the founder-access scrypt+TOTP pattern to a portal session, dark by default). `MYTHUSO_AUTH_MODE=demo\|production` flag; demo keeps `?role=`, production removes it. | new `apps/web/src/features/portal/SignIn.tsx`, new `apps/assistant-api/src/lib/control-tower-access.ts`, `apps/assistant-api/src/server.ts` branches, `packages/catalog/control-tower-access.json` contract | `tests/founder-access.spec.ts` pattern extended; dark-by-default 503                               | 2–3          |
| **2 — Shell + IA**           | Rebuild `PortalShell.tsx` to 9 categories; new `portal.css` with motion system wired in; pill nav, topbar, context bar; legacy shells untouched at `?legacy=1`.                                                                                                                           | `apps/web/src/shells/PortalShell.tsx`, `apps/web/src/features/portal/portal.css`, `packages/catalog/control-tower-portal.json` (category list)                                                              | `tests/control-tower-portal.spec.ts` passes (addresses, ARIA tabs, sidebar/strip breakpoint)       | 2–3          |
| **3 — Overview + charts**    | Metric cards, sage area charts, service-status grid, gates register. Build reusable `MetricCard`, `AreaChart`, `StatusGrid`, `GatesList` components in `features/portal/`.                                                                                                                | new components under `apps/web/src/features/portal/`, `Overview.tsx` rebuild                                                                                                                                | charts animate via `ChartMotion.tsx`; reduced-motion removes; `tests/chart-motion.spec.ts` pattern | 2            |
| **4 — Dispatch & Incidents** | Schematic live map, roster, alerts, deployment-mode switcher. Absorbs StaffShell Control Tower figures.                                                                                                                                                                                   | `apps/web/src/features/portal/Dispatch.tsx` (new), map component                                                                                                                                            | field-safety engine contract; `tests/field-safety.spec.ts`                                         | 2            |
| **5 — GilbertOne Admin**     | Sub-tab strip, Intelligence level slider, Voice configurator (sliders + toggles), Model Providers, Knowledge, Compliance, API Registry. Gated controls drawing refusals.                                                                                                                  | `apps/web/src/features/portal/gilbertone/*.tsx` rebuilds                                                                                                                                                    | `tests/gilbertone-admin.spec.ts` passes (keyboard walk, per-screen "acts on nothing", a11y floor)  | 3            |
| **6 — Configuration**        | Settings-engine configurator: 4 control types (slider, toggle, segmented, stepper), review-then-confirm, provenance.                                                                                                                                                                      | `apps/web/src/features/Configuration.tsx` rebuild                                                                                                                                                           | `tests/configuration.spec.ts` passes (10 tests)                                                    | 2            |
| **7 — Founder**              | Super User dashboard: progress rings, vault panel (reuses FounderAccess), break-glass toggle, system health, deploy sparkline.                                                                                                                                                            | `apps/web/src/features/portal/Founder.tsx` (new), `founder/FounderAccess.tsx` integration                                                                                                                   | `tests/founder-access.spec.ts` passes                                                              | 1–2          |
| **8 — Remaining screens**    | Devices & IoT, Governance, Commerce, Clinical review queue. Design mockups first, then build.                                                                                                                                                                                             | new `features/portal/*.tsx`                                                                                                                                                                                 | per-screen specs                                                                                   | 3–4          |

**Total: ~16–20 batches.** At a credit-smart pace (no re-exploration, reuse existing primitives from `Surface.tsx` / `Chart.tsx` / `ChartMotion.tsx` / `motion.ts` / `Controls.tsx`), this is multi-session work. Each batch ends with checks green + a commit, so any session resumes cold.

## Credit-smart notes

- The full codebase picture is in this spec + the research report from 24 Sep. **Do not re-explore** — read this file, read the named source file, edit, verify, commit.
- Reuse: `Surface.tsx` primitives (`Metric`, `NavRow`, `Panel`, `Segments`), `Chart.tsx` (`ClinicalChart`), `ChartMotion.tsx`, `motion.ts` hooks, `Controls.tsx` gated wrappers, `States.tsx` (`StateBlock`, `EmptyState`, `Skeleton`).
- Control Tower is lazy-loaded — it does not touch the 282.16 kB patient entry budget. Verify with the documented gzip measurement after each phase that touches `Doorway.tsx` or `PortalShell.tsx`.
- `portal.css` ships with the portal chunk, not the entry. Motion additions there are excluded from two boundary checks — self-enforce the cubic-bezier ban and the sage-fill+charcoal-text rule.
- Run `node scripts/check-boundaries.mjs` and `npm run check` after every batch. Run the relevant Playwright spec (`npx playwright test tests/control-tower-portal.spec.ts` etc.) before committing each phase.
