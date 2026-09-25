# Control Tower Redesign — Design Spec & Execution Plan

Written 24 September 2026. Founder-approved design direction for the MyThuso Control Tower screen redesign. This document is the durable spec: any session can pick it up cold and execute the next batch without re-exploration.

## Status

- **Designs approved**: 8 screens (see Screen inventory below).
- **Ruling 1 — Auth**: TOTP-only gate for now (password + authenticator code). Full identity service / SMS OTP deferred until the founder chooses an SMS provider. The `?role=` preview picker stays behind `MYTHUSO_AUTH_MODE=demo`; production mode removes it.
- **Ruling 2 — CI**: The shipped `packages/design-tokens/tokens.json` teal-navy-lime palette governs (`brandInk #0F3B4A`, `indigo #1E3A8A`, `brandGreen #1D9E75`, `brandLime #D9FF1A`) on the mist/charcoal/sage surface language from `docs/DESIGN-LANGUAGE.md`. GilbertOne's brand is an accent within the token system, never a replacement. This overrides the stale "no indigo" comment in `apps/web/src/features/portal/portal.css`.

## Information architecture — 14 categories → 9

The current 14 categories / 27 tabs are dense and hard to follow. Collapse to 9 clear pill-nav rows. Naming locked per the founder's 23 Sep decision (`docs/ROADMAP.md`): "MyThuso Control Tower", "Dispatch & Incidents", "GilbertOne API Administration".

> **Correction, 24 Sep 2026 (found during Phase 2).** The 9-group IA is **not** a visual layer that can sit on top of the current contract. `scripts/check-boundaries.mjs` holds the first 11 categories to plan §5.1's order, and `tests/control-tower-portal.spec.ts` (lines 50–74) walks all 14 tabs **in contract order** through the single `Categories` tablist. The contract order interleaves the proposed groups (`audit` sits between `quality` and `devices`; `clinical` is far from `vetting`/`quality`; `compliance`/`governance` are split from `audit`), so drawing 9 contiguous groups means **reordering the categories** — which breaks both the boundary check and the keyboard-walk test, and orphans the 19 `legacyAddresses`. A literal 14→9 collapse is therefore a **contract migration** (contract + `check-boundaries.mjs` + `control-tower-portal.spec.ts` + `nav.ts` + every spec that calls `goPortal` by category label), not a shell tweak. **This is a founder decision, not a tidy-up** — handed back rather than decided. The table below stays as the target grouping *if* that migration is approved; until then the nav keeps 14 categories in §5.1 order and the "make it make sense" work is delivered through the screen rebuilds (Phases 3–8), not through reordering the nav.
>
> **Ruled, 24 Sep 2026.** The founder chose **keep the 14 categories**; there is no contract migration. The table below is therefore **not** a build target — it is retained only as the reasoning behind the grouping. The "make it make sense" work is delivered entirely through the screen rebuilds (Phases 3–8) and the motion system, inside the existing §5.1 category order.

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
| **2 — Shell + motion**       | **Done (motion half).** `useDecor` + `MotionPause` in the topbar, `useChapter` + `.rise` chapter entrance on the category panel, one token settle on `.pt-tab`/`.pt-node`/`.pt-row`/`.g1-card` with a reduced-motion removal, and the `portal.css` header corrected to the 24 Sep CI ruling. **Deferred (IA half):** the 9-category collapse is a contract migration, not a shell tweak — see the correction above; it waits on a founder decision. | `apps/web/src/shells/PortalShell.tsx`, `apps/web/src/features/portal/portal.css`                                                                                                                            | `tests/control-tower-portal.spec.ts` passes (38, desktop + mobile) — **green**                     | 1 (done) + IA TBD |
| **3 — Overview + charts**    | Metric cards, sage area charts, service-status grid, gates register. Build reusable `MetricCard`, `AreaChart`, `StatusGrid`, `GatesList` components in `features/portal/`.                                                                                                                | new components under `apps/web/src/features/portal/`, `Overview.tsx` rebuild                                                                                                                                | charts animate via `ChartMotion.tsx`; reduced-motion removes; `tests/chart-motion.spec.ts` pattern | 2            |
| **4 — Dispatch & Incidents** | Schematic live map, roster, alerts, deployment-mode switcher. Absorbs StaffShell Control Tower figures.                                                                                                                                                                                   | `apps/web/src/features/portal/Dispatch.tsx` (new), map component                                                                                                                                            | field-safety engine contract; `tests/field-safety.spec.ts`                                         | 2            |
| **5 — GilbertOne Admin**     | Sub-tab strip, Intelligence level slider, Voice configurator (sliders + toggles), Model Providers, Knowledge, Compliance, API Registry. Gated controls drawing refusals.                                                                                                                  | `apps/web/src/features/portal/gilbertone/*.tsx` rebuilds                                                                                                                                                    | `tests/gilbertone-admin.spec.ts` passes (keyboard walk, per-screen "acts on nothing", a11y floor)  | 3            |
| **6 — Configuration**        | Settings-engine configurator: 4 control types (slider, toggle, segmented, stepper), review-then-confirm, provenance.                                                                                                                                                                      | `apps/web/src/features/Configuration.tsx` rebuild                                                                                                                                                           | `tests/configuration.spec.ts` passes (10 tests)                                                    | 2            |
| **7 — Founder**              | Super User dashboard: progress rings, vault panel (reuses FounderAccess), break-glass toggle, system health, deploy sparkline.                                                                                                                                                            | `apps/web/src/features/portal/Founder.tsx` (new), `founder/FounderAccess.tsx` integration                                                                                                                   | `tests/founder-access.spec.ts` passes                                                              | 1–2          |
| **8 — Remaining screens**    | Devices & IoT, Governance, Commerce, Clinical review queue. Design mockups first, then build.                                                                                                                                                                                             | new `features/portal/*.tsx`                                                                                                                                                                                 | per-screen specs                                                                                   | 3–4          |

**Total: ~16–20 batches.** At a credit-smart pace (no re-exploration, reuse existing primitives from `Surface.tsx` / `Chart.tsx` / `ChartMotion.tsx` / `motion.ts` / `Controls.tsx`), this is multi-session work. Each batch ends with checks green + a commit, so any session resumes cold.

### Phase 5 progress — 24 Sep 2026

**Shipped:** the Intelligence level selector, as `GatedSlider` in `gilbertone/Controls.tsx` — a `role="slider"` div (not an `<input>`, which the boundary check forbids a value on and which would rest at its midpoint) whose ends are `intelligence-levels.json`'s own, resting at the locked level, `aria-disabled` and described by G31. The thumb is placed by a `--pt-ratio` the sheet turns into a percentage, so no GilbertOne screen types a digit but a 0 or a 1. Committed `361840ba`; `gilbertone-admin.spec.ts` (24) and `control-tower-portal.spec.ts` (38) green.

**Blocked — the Voice configurator (sliders + toggles) cannot be drawn honestly yet.** `voice.json#parameters.tts` points rate and pitch at `user-preferences.json#axes`, and both axes hold `bounds: null` with `_boundsWhy: "Not decided… a range written here before anybody has listened at the edges is a number nobody tested"` and `builtToday: false`. A slider needs ends; inventing them would type a number the contract deliberately refuses to hold. The toggles are refused too: the `captions` axis says `userMayTurnOff: false` and "Listed so nobody builds a toggle for it", and `mute` is the device's and the playback switch's, not a tenant setting. So the Voice screen correctly renders its parameters as text with their reasons. **Drawing Voice sliders/toggles is a contract change** (add bounds to the axes, decide the toggles) — a founder decision that also triggers regeneration of the derived artifacts. Until then the Voice screen stays as it is.

## Phase 1 — auth gate design (decision-complete, 24 Sep 2026)

The founder ruled: **authenticator only** (password + 6-digit TOTP), no SMS; the identity service stays
off. Mirror `apps/assistant-api/src/lib/founder-access.ts` — it is the one hardened sign-in in the repo
and the Control Tower gate is the same shape minus the key reveal.

- **Contract** `packages/catalog/control-tower-access.json`, mirroring `founder-access.json`'s blocks:
  `credential` (scrypt floor + `passwordHashVariable` + `totpSecretVariable` + `totpSecretBytes`),
  `enable` (exact-value variable), `request` (Sec-Fetch-Site + custom header), `session` (cookie name,
  attributes, `idBytes`, `lifetimeSeconds`), `lockout` (5 failures / 15 min), `refusals`, `audit.events`.
  **No reveal allowlist** — this session grants the portal, not keys, so there is no per-reveal code.
- **Lib** `apps/assistant-api/src/lib/control-tower-access.ts`: reuse `parsePasswordHash`/`verifyPassword`/
  `crossSite`/session-digest logic and `verifyTotp` from `apps/api/src/totp.ts`. Dark by default (enable
  line AND a well-formed credential, both read once at construction). Expose `gate`, `signIn`,
  `sessionFrom`, `signOut`. No logging in the lib; an audit-line helper whose parameters cannot carry a
  secret, written by `server.ts`.
- **Server** `apps/assistant-api/src/server.ts`: control-tower sign-in / sign-out / session routes beside
  the founder routes, same gate-first ordering (cross-site, then dark).
- **Web** `apps/web/src/features/portal/SignIn.tsx` (password + code, refusal that never says which factor
  failed) shown when `MYTHUSO_AUTH_MODE=production` and no live session; `demo` keeps the `?role=` picker.
  `PortalShell`/`BackOffice` gate on the session. This is the only live-surface change — do it last and
  finish it in one pass (never half-migrate).
- **Boundaries**: add a control-tower-access block to `scripts/check-boundaries.mjs` mirroring the founder
  one (the contract holds every number; the lib reads them; dark by default; nothing under `deploy/`
  writes the enable line or the credential; no secret in any log line).
- **Tests**: `control-tower-access.test.ts` (mirror `founder-access.test.ts`) + a Playwright sign-in spec.

**Safe incremental order** (each ends green + committed, so any session resumes cold):
1a contract + lib + unit tests (dark, no live change) → 1b server routes (dark) → 1c web SignIn +
`MYTHUSO_AUTH_MODE` + portal gate (the live surface, last, in one pass).

## Credit-smart notes

- The full codebase picture is in this spec + the research report from 24 Sep. **Do not re-explore** — read this file, read the named source file, edit, verify, commit.
- Reuse: `Surface.tsx` primitives (`Metric`, `NavRow`, `Panel`, `Segments`), `Chart.tsx` (`ClinicalChart`), `ChartMotion.tsx`, `motion.ts` hooks, `Controls.tsx` gated wrappers, `States.tsx` (`StateBlock`, `EmptyState`, `Skeleton`).
- Control Tower is lazy-loaded — it does not touch the 282.16 kB patient entry budget. Verify with the documented gzip measurement after each phase that touches `Doorway.tsx` or `PortalShell.tsx`.
- `portal.css` ships with the portal chunk, not the entry. Motion additions there are excluded from two boundary checks — self-enforce the cubic-bezier ban and the sage-fill+charcoal-text rule.
- Run `node scripts/check-boundaries.mjs` and `npm run check` after every batch. Run the relevant Playwright spec (`npx playwright test tests/control-tower-portal.spec.ts` etc.) before committing each phase.
