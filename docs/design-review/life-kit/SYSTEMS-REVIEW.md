# Design systems review — MyThuso / GilbertOne / Control Tower

25 September 2026. Proposed direction: **Life, considered**.

## Verdict on the supplied inspiration

The screenshots make sense as a shared moodboard. They are strongest when treated as references for hierarchy, rhythm and emotional tone, rather than as a single ready-made design system.

Muzli describes itself as a curated design inspiration platform and also operates an asset store. It is not one universal kit. Sources checked for this review: [About Muzli](https://muz.li/about/) and [Muzli Creative Store](https://store.muz.li/). The screenshots alone do not establish their original authors or whether any particular kit is licensed for reuse. No third-party design asset was copied into the prototype.

| Supplied reference | Useful direction | MyThuso translation | Avoid carrying across |
|---|---|---|---|
| White NFT/blue dashboard | Modular cards, strong focal image, clear chart | Confident card composition and one strong accent | Speculative-market language, ornamental curves as operational data |
| Green team/call dashboard | Dark summary card, visible next task, quiet data panels | Control Tower focus card, next-action rows, explanation beside status | Sentiment or empathy scores as clinical urgency |
| Surf forecast phone screens | Friendly mobile rhythm, clear time sequence, selective colour | Care steps, readable cards, generous touch areas | Unvalidated health gauges or colour-only severity |
| Warm yellow HR dashboard | Warmth, personal context, varied card sizes | Existing care imagery, paper ground, lilac journal invitation | Employee-style productivity scoring for patients |
| Flat CRM dashboard | Information clarity and readable comparison | Tables with clear headers and exact chart values | Full desktop density compressed onto a phone |
| Teal file dashboard | A visual anchor and grouped secondary actions | Mint assistant invitation and intentional grouping | Floating layers or decorative rings without a purpose |
| Coral operations dashboard | Clear primary banner, repeated row grammar | One next-step invitation and consistent action rows | A rainbow of unrelated accents or fictional rewards |
| Payment/finance dashboards | Large numerals, whitespace and selective emphasis | One sourced sample metric and restrained chart styling | Invented financial/health totals or smooth curves that imply measurements |

## What was actually inspected

- Read `CLAUDE.md`, current founder decisions in `docs/ROADMAP.md`, `docs/DESIGN-LANGUAGE.md`, the existing Control Tower redesign specification and local UI/UX instructions.
- Read the shared token catalogue and generated CSS; the portal category and overview contracts; the existing overview demo series.
- Ran the local web app and visually inspected patient home and the default Control Tower Dispatch view at 1440 × 1100. Captures: `screenshots/current-patient.png` and `screenshots/current-control-tower.png`.
- Read web Dashboard, PortalShell, Frame, Overview and GilbertOne asset/rig references.
- Inspected the native Surface design-system sources and iOS CareStudio accessibility/motion references. This was source review, not simulator/emulator validation.
- Rendered the new six-view kit on desktop and mobile. Automated layout verification also covers 320px and 720px.

This is a cross-system design assessment with directly inspected representative screens. It is not a claim that every existing patient, nurse, doctor, partner, founder or administrative flow was exercised. No production service or access control was tested.

## Findings and priorities

| Priority | Finding and evidence | Design response | Implementation constraint |
|---|---|---|---|
| High | Control Tower's current Dispatch view puts the first substantive heading around 615px down a 1100px capture. Context explanations, preview notices and migration copy dominate the opening. | Compact header, a short visible preview notice and contextual disclosures, then the work. | Exact contract refusal text remains authoritative. Any product change to presentation must preserve discoverability and required wording. |
| High | Fourteen navigation entries and multiple tab levels compete for attention. The latest founder ruling retains those fourteen categories. | Keep contract order, simplify inactive navigation, strengthen selected state, offer a mobile category selector. | Do not silently collapse to nine categories or orphan deep links. |
| High | Static status panels can look live when dressed with green dots or charts. The current overview already has an explicit demonstration series. | Label the sample period and source; show “not checked” for a prototype that has not observed service health. | Connected status must come from a current response, not a static illustration. |
| Medium | Patient home already contains strong imagery and warmth. The top next-action panel and photographic hero both ask the user to explore care. | Let a single hero invitation lead. Follow with next visit, wellbeing and assistant cards. | An actual upcoming visit should take priority over discovery content. The prototype shows the no-visit case only. |
| Medium | The brand has multiple documented palette generations: indigo/slate, sage/charcoal, Care Studio and brand accents. Older comments and numeric rules can conflict with current tokens. | Use current token values; define which colours have which jobs, rather than add another palette. | Shared token source and latest dated founder decisions take precedence over stale prose. |
| Medium | GilbertOne's identity and safety behaviour are already established; adding “life” by replacing them would create drift. | Reuse the existing smiling hero asset, more space, clearer prompts and explicit connection context. | This is presentation exploration. Rig, deterministic safety priority, emergency text and client/engine split remain intact. |
| Medium | Small type and icon-only menus in the references would be difficult on phones and for unfamiliar users. | Visible labels, minimum 13px rendered text, 44px targets and readable error messages. | Native screen-reader and large-text checks still need device validation. |
| Medium | Dashboard-like gauges invite users to read a score as a health judgement. | No synthetic health score. A chart has exact values and provenance; progress needs a legitimate denominator. | Any clinical thresholds stay in the catalogue and require the existing review gates. |
| Medium | Large illustrations and blur-heavy cards can make a metered-data experience expensive. Native Android source already explains why blur was rejected. | Reuse assets, static surfaces, no new fonts or chart dependency, no decorative animation loops. | Before any production rollout, compare patient-entry gzip figures using the documented identical method. Image transfer budget needs separate measurement. |

## System specification

**Colour roles.** Brand ink anchors navigation, headings and dark focal panels. Paper is the ground. White is the main reading surface. Mint is a warm supporting panel; lilac a wellbeing or explanatory panel. Lime is reserved for a principal invitation. Mango, red and semantic status words remain tied to their actual meanings. Brand green is shown in the palette, not used as small text on white.

**Type.** Existing Inter and the shared type scale. Light large numerals for metrics; headings use size and space before heavy weight. Narrative copy is short but complete. Prices, readings, counts and refusals are sourced, not retyped for visual balance.

**Layout.** Desktop shell with a stable category rail and compact context row. One primary focal region. Contextual information is secondary, not absent. Wide data panels stack on mobile; filters wrap; action rows reflow rather than clipping or shrinking the font. Category navigation remains available on mobile.

**Controls.** Explicit verbs, visible labels, 44px minimum touch targets, consistent rounded controls and two-ring keyboard focus. Disabled actions need a visible reason and an available next step where one exists. Confirmation screens name what will happen and to whom. Success waits for a confirmed response.

**Charts.** Trace only real samples or clearly marked demonstration data. The kit deliberately uses a piecewise line instead of smoothing to avoid implying unsampled values. A date range, unit and table accompany the chart. A zero is not used for missing data.

**Motion.** Use the shared quick/settle/enter durations. Entrance and deliberate feedback only in this kit. No pulsating availability dots, autoplay carousels or moving targets. Reduced motion means none. In the real assistant, safety interrupts all decorative affect.

**Identity and access.** A role selector is never styled as evidence of authentication. The proposed shell is not an access-control implementation. Founder authentication, session gates and permissions remain separate from a visual review. Never put secrets in a design sample.

**Language and content.** English copy here is a review sample. Product rollout must use existing locale contracts and be checked with expanded translations. A static “English” context label here is not a working language selector. Emergency access must remain persistent when this composition is integrated with the product shell.

## Broader screen inventory and handoff

| Surface family | Pattern from this kit | Required states to carry into implementation |
|---|---|---|
| Public landing and service discovery | Brand hero, journey cards, one invitation | Available region, outside coverage, service preview, unavailable booking |
| Patient home / family | Context + primary care action + supporting cards | No visit, requested visit, upcoming visit, wrong household, restricted record |
| Booking / payment | Labelled form, persistent error, review step | Validation, unavailable slot, refusal, processing, confirmed receipt |
| Passport / readings | Sourced data panel, exact table, provenance | Missing reading, stale reading, consent withheld, unavailable store, conflicting value |
| Wellbeing | Lilac invitation, quiet reading space | Empty, memory-only draft, unavailable persistence, explicit discard |
| GilbertOne | Character introduction, prompts, readable composer | Idle, thinking, reply, unavailable engine, text fallback, listening, stopped, error, refusal, emergency |
| Nurse and doctor workspaces | Queue + selected record + permitted next action | Eligibility blocked, no assigned work, interrupted visit, review required, signed record |
| Control Tower overview | Focal metric + service truth + next-action list | Unknown, connected, degraded, disconnected, dark, gated |
| Dispatch / incidents | Queue + context map + decision sequence | Empty queue, filtered empty, missing feed, eligible assignment, refusal, escalation |
| Vetting / quality / audit | Action rows and evidence tables | Missing evidence, lapsed credential, unresolved exception, no matching events |
| Devices / clinical oversight | Registry table + selected evidence | No device, untrusted device, stale reading, absent governance approval |
| GilbertOne administration | Service state + source + gated settings | No provider, unknown health, dark feature, locked voice, no permission |
| Configuration / finance / catalogue | Labelled settings, review, table | Unavailable integration, invalid input, pending action, refused action, verified success |
| Compliance / governance / growth | Evidence-led status and action rows | Missing owner, missing evidence, blocked gate, no approved metric source |
| Founder | Focused authenticated action and explicit boundary | Signed out, authenticator required, session expiry, denied reveal, timed secret clearing |

The kit supplies a shared visual vocabulary and representative screens, not finished implementations of every row. No feature-map row is marked shipped for those workflows.

## Measured contrast in the proposed palette

Calculated from the actual token values using sRGB relative luminance in this session:

| Foreground / background | Ratio |
|---|---:|
| brandInk / studioPaper | 10.93:1 |
| surface / brandInk | 12.04:1 |
| body / brandMint | 5.09:1 |
| brandInk / brandMint | 8.09:1 |
| body / studioLilac | 5.93:1 |
| brandInk / brandLime | 10.47:1 |
| mangoInk / mangoSoft | 6.52:1 |
| tealInk / tealSoft | 5.05:1 |
| danger / dangerSoft | 6.05:1 |
| body / surface | 7.58:1 |

These are token-pair calculations, not an exhaustive automated accessibility audit. Photography never carries essential body text directly; the hero copy sits on an opaque dark panel.

## Delivery and limits

The six concepts and component kit are reviewable now. Verification details are in `verification.txt` and the README. No production app file was changed, no native client was rebuilt, no production bundle was measured and no deployment was performed. Full application tests and native builds remain requirements for an implementation pass. The visual review does not establish clinical safety, production readiness or legal compliance.
