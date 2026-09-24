# Full Prompt — Control Tower UI, Back Office, and GilbertOne API Administration

> Committed 24 September 2026 from the text the founder supplied. The supplied text was cut off
> partway through Appendix D, wireframe D.7 (the Clinician Review Queue); everything before that point
> is reproduced as given, and D.7 is marked where it stops. Where a statement here and the tree
> disagree, the tree and `docs/SCOPE-BALANCE.md` are checked first.

Hand this entire document to a fresh Claude Code session in the MyThuso repo. It is self-contained. Read §1 before touching anything.

## §0 — Your role

You are being handed a scoped build phase for MyThuso. Phase 0 (contracts) is closed and committed. Production is live. This phase is screens and administration: improving the two existing admin surfaces — the Control Tower workspace and the back office — and building GilbertOne API Administration, which does not exist today as a category. Your job is to execute the phase's contract work first, then its screen work only when credits permit and only after the entry gates in §9 are green.

Read this document in full. Read CLAUDE.md. Read docs/PROMPT-CONTROL-TOWER.md (the plan of record). Read docs/SCOPE-BALANCE.md (the current state of the world). Do not write a line before you have read all four.

## §1 — Standing rules — never violate

- Do not start a large build near the weekly credit cap. Contracts before screens; gates before code. If you are in a low-credit session, author contracts, boundary checks and tests; do not generate screens.
- The status vocabulary is exact (§2). Use it verbatim in commit messages, docstrings, inline comments and this document.
- The build must fail if an invariant is violated. Every new invariant goes into scripts/check-boundaries.mjs, not into a comment.
- Do not touch the patient-entry bundle budget. Current figure: 283.87 kB across 15 files, measured by the documented method (every script, module preload and stylesheet referenced by apps/web/dist/index.html, gzipped at level 9). Every new measurement compares to that figure and the history in Appendix A.
- The look and feel is fixed. The token palette in packages/design-tokens/tokens.json governs. A token-drift CI check fails the build if a hex literal appears in component code that is not sourced from the tokens.
- The clinical boundary is non-negotiable. The engine never autonomously rewrites clinical rules, triage logic, emergency handling or device thresholds. Any such change flows through the Clinician Review Queue.
- Tenant isolation extends to the inference layer. Per-tenant caches, per-tenant embedding partitions, no cross-tenant fine-tuning, per-tenant provenance.
- API keys never reach the browser in full. The mask/unmask toggle is a display convenience. The vault is the security boundary. If you build a screen that could expose a key, it fails review before it fails the build.
- Default-deny. A user with no assigned role sees nothing.
- If you cannot verify a claim against the tree, say so plainly rather than repeating it as though it were built. This is the discipline that produced the plan.
- Say what is refused, and why. Every screen that could be mistaken for real, every panel that shows a value, every action that could be taken — the refusal is written in the contract and shown on the screen, not hidden.

## §2 — Status vocabulary — use exactly

| Term | Meaning |
|---|---|
| built | In the tree, held by tests. |
| proposed | Declared in a contract, not built. |
| dark | Built but unreachable by default. |
| gated | Built but blocked on a named gate. |
| named-but-absent | A contract the work must author. |

Never write "done" without a test. Never write "working" without a harness. Never write "soon" — name the gate.

## §3 — What exists today (verified 24 September 2026)

### Built and working

- The Control Tower workspace at ?role=control-tower — Dispatch, Incidents, the Vetting queue, Quality, and Audit exports. Real screens, real tabs, real data. Held by tests.
- The back office at ?role=back-office — Overview, Finance, Compliance, Governance, Configuration and more. Real screens. Held by tests.
- The GilbertOne assistant service at apps/assistant-api — live in production on liqzar-server, activated, with Azure OpenAI and Azure Speech configured in the southafricanorth region. Answers /assistant/health with {"ok":true,"azure":true,"speech":true,"production":true,"activated":true}.
- Phase 0 contracts — committed this week. The Clinician Review Queue, clinical tiering, device contracts, inference isolation, corpus split, compliance pack, offboarding, break-glass, session model, regulatory classification, threat model, adversary register, device trust model.
- The tab inventory — docs/control-tower-tab-inventory.md, committed. Every tab in Admin.tsx and every route in StaffShell.tsx, with dispositions.
- The session model — docs/control-tower-session-model.md, committed. Maps the 15 admin layers onto the current RoleId / ?role= mechanism, and states plainly that no session or permission enforcement exists today.
- Seven boundary-check invariants from Phase 0, plus the crisis-line checks — each proved to fire by deliberate breakage.

### What the two surfaces actually are

The role switcher is a preview-dashboard picker, not an authorization system. apps/web/src/Doorway.tsx says so in its own comment: "grants no server permissions and stores no identity in the browser." The ?role= parameter is a dev affordance for looking at different surfaces; it does not authenticate, does not carry a role to the server, and does not restrict anything.

The Control Tower workspace and the back office are two separate surfaces. They serve overlapping purposes. The plan says they consolidate into one portal — the MyThuso Control Tower — with Dispatch & Incidents and GilbertOne API Administration as categories inside it.

### What exists but is not yet in the plan's shape

- The Control Tower workspace does not have a GilbertOne category. There is no admin for the engine at all.
- The back office does not have a GilbertOne category either.
- Neither surface has real permission enforcement. Neither has per-tenant scoping. Neither has the 15 layers.
- The assistant service is live in production, and no screen in either surface can see it, configure it, or switch it off.

### What does not exist — named-but-absent

- packages/catalog/voice.json — the query-to-voice mapping contract.
- packages/catalog/model-providers.json — the provider registry.
- packages/catalog/intelligence-levels.json — the intelligence level contract.
- packages/catalog/api-registry.json — the API registry contract.
- packages/catalog/user-preferences.json — the user voice and accessibility preference contract.
- apps/assistant-api/src/lib/secret-vault.ts — the KMS-backed secret vault.
- apps/assistant-api/src/lib/key-registry.ts — the metadata store.
- apps/assistant-api/src/lib/provider-health.ts — the health-check runner.
- apps/assistant-api/src/lib/voice-config.ts, intelligence-level.ts, provider-registry.ts, clinical-config.ts — the services the screens would call.
- The GilbertOne API Administration category — the screen itself, and every sub-screen inside it.
- The Devices & Fleet category — the device fleet admin screen.
- Real permission enforcement for the 15 admin layers.

## §4 — The mission for this phase, expanded

You are:

- Improving the two existing admin surfaces — the Control Tower workspace and the back office — so they consolidate into one portal with the plan's categories, and so the tab inventory's verdicts are realised.
- Building GilbertOne API Administration — the top-level category that carries the G1 mark, with sub-screens for Overview, Voice, Model Providers, Intelligence, Knowledge, Compliance, and API Registry.
- Authoring the five missing contracts that the GilbertOne admin screens would read from — Modules 16 through 20 — each with its boundary check.
- Not building the secret vault, the provider registry, or any runtime service yet unless the phase explicitly says so. Those are Phase 2 work. The screens can be built against contracts and stub services; the vault is separate and gated.

You are not building the patient-facing app, the device pairing flow, the field-safety engine, or the InCall scope. Those are separate phases.

## §5 — The Control Tower UI — improvements to scope

### §5.1 — Consolidate the two surfaces

The plan says the two surfaces consolidate into one portal. The tab inventory is committed; the session model is committed. What remains is the merge itself.

Scope.

- Build the consolidated shell. The role switcher remains a preview picker for now — do not attempt real authentication in this phase.
- Preserve or 301-redirect existing admin deep-links for one release cycle. A bookmarked staff URL that silently 404s on cutover is a support-ticket wave.
- Parallel-run period: both surfaces live, the legacy one read-only. Documented in a new docs/control-tower-cutover.md.
- Rollback plan if a critical workflow breaks on cutover.
- Training and communication step as part of the cutover — not an afterthought.

What the merged portal looks like.

```text
MyThuso Control Tower
├── Overview            ← health, active tenants, current state, what changed
├── Dispatch & Incidents
├── Vetting
├── Quality
├── Audit
├── Devices & Fleet     ← new
├── GilbertOne API Administration    ← new, carries the G1 mark
├── Configuration
├── Finance
├── Compliance
└── Governance
```

The merge is bounded by the tab inventory. Every tab in Admin.tsx and every route in StaffShell.tsx has a disposition in docs/control-tower-tab-inventory.md. No tab is retired without a reason, and the disposition is honoured in the merged shell.

### §5.2 — Fix the surface-level problems

These are the UI-level problems that the two surfaces share today.

- **No consistent navigation.** The Control Tower workspace and the back office use different nav patterns, different headers, different breadcrumbs. The merged portal uses one.
- **No consistent empty states.** A few screens have written empty states; most have nothing. Every list, every panel, every device card and every admin section needs a written empty state — not a blank region.
- **No consistent status indicator.** A service is "green" on one screen and "operational" on another. The merged portal defines one vocabulary of status: connected / degraded / disconnected / dark / not-configured / gated.
- **No persistent context.** Which site, which tenant, which period — a user has to set these on every screen. The merged portal carries them in the URL, and the URL is bookmarkable.
- **No keyboard navigation.** Tabs, lists and actions are mouse-only. The merged portal adds arrow-key navigation for tabs and lists, and visible focus rings.
- **No accessibility floor.** The token palette is fixed, but contrast, focus, ARIA labels and reduced-motion are not consistent. The merged portal meets WCAG 2.1 AA and is tested with a keyboard.
- **No loading states.** Panels appear empty for a second before they fill. Every panel has a skeleton or a spinner, not a blank region.

### §5.3 — The Overview screen

The merged portal's landing screen. Read-only, at-a-glance, honest about state.

What it shows.

- **Service state.** Every MyThuso service: identity (dark), assistant (live, activated), devices (gated), payments (dark), messaging (dark). Each with a status and a one-line reason.
- **Active tenants.** Count, names, current state. If zero, a written empty state explaining what a tenant is and how one is created.
- **What changed since you last looked.** New contracts, new boundary checks, gates resolved, gates opened — the digest from Part E of the previous scope.
- **Recent activity.** A short, unfiltered log of what the Control Tower has done today: sign-offs, deploys, break-glass grants.
- **Gates that are open.** A short list of the gate register's unresolved items, with the owner and the reason.

Why. This session spent effort discovering that production was live and nothing recorded it. The Overview screen makes that discovery instant.

### §5.4 — The Devices & Fleet category

The plan's device contracts exist; the admin screen does not.

Three views.

- **View 1 — Fleet overview** (Facilities, Ward Manager, Regional Admin, Device Fleet Administrator). Devices by ward, bed, class, status. Needs-attention list: low battery, offline > threshold, calibration overdue, firmware behind, verification pending. Cohort view by model and firmware. Bulk actions.
- **View 2 — Provisioning wizard.** Four steps: Discover → Pair → Assign → Verify.
- **View 3 — Device class allowlist** (Super User). Adding a class requires: vendor and model; supported tier; pairing path; physiological range per reading type; escalation weight; firmware baseline; security review confirming the credential model; POPIA note.

What must show as empty, honestly. The real-device allowlist holds 0 devices; the DPIA is not done. Every screen in this category has a written empty state that says so, not a blank region.

A device class cannot be enabled at a site until the DPIA covers it. This is a gate, not a delay.

### §5.5 — Accessibility and inclusivity

These are not optional. The South African Constitution's equality clause, the UN CRPD (ratified 2007), and the SA digital accessibility framework built on WCAG 2.1 AA all point the same way: a person who relies on spoken output or keyboard navigation must be able to use the admin surface.

Scope.

- Keyboard navigation for every tab, list and action.
- Visible focus rings in the token palette.
- ARIA labels for every interactive element.
- Reduced-motion support for every animation.
- Contrast ratios at AA or better.
- Screen-reader-tested on at least one real device.

Held by tests. The Playwright suite gains an accessibility check on each new screen. Manual screen-reader testing is documented in docs/control-tower-accessibility.md.

## §6 — The back office — improvements to scope

The back office is the tenant-facing admin surface. It shares the portal's shell, but its categories differ.

### §6.1 — The seven back-office categories

- Overview — the tenant's own state.
- Finance — payments, refunds, reconciliation, cost allocation.
- Compliance — the compliance pack (Module 7), the audit extract, the residency map.
- Governance — the Clinician Review Queue, the DPIA status, the Information Officer's register, the break-glass audit.
- Configuration — per-tenant settings: sites, wards, beds, staff roles, branding, integrations.
- Reports — usage, cost, incidents, audit.
- Support — tickets, escalation, the support-agent narrow view.

### §6.2 — What changes

- **The Configuration tab becomes the tenant-admin home.** Today it is a flat list. It becomes the tree: sites, wards, beds, staff, roles, branding, integrations — each with its own sub-screen and its own empty state.
- **The Governance tab gains the Clinician Review Queue.** The queue's contract is committed. The screen that reads it does not exist. It is authored now, built in this phase.
- **The Finance tab gains cost allocation.** Per-bed, per-seat, per-call — three axes. Today there is no per-axis view.
- **The Compliance tab gains the compliance pack preview.** The pack is a schema (Module 7). The screen shows the schema with the gates that block each section, and the exact governance document that would unblock it.

### §6.3 — What does not change

- The dispatch, incidents, vetting, quality and audit screens do not change in this phase. They move into the merged portal unchanged.
- The role switcher remains a preview picker. Real enforcement is a separate phase.

## §7 — GilbertOne API Administration — the new category

This is the largest single deliverable in this phase. It does not exist today.

### §7.1 — What it is

A top-level category in the Control Tower, carrying the G1 mark, with seven sub-screens. Each sub-screen is scoped below. Each is authored as a contract first; built as a screen when credits permit and gates are green.

### §7.2 — Sub-screen 1: Overview

What it shows.

- Service state: /assistant/health and /assistant/v1/status values, refreshed on load.
- Version: the current bundle hash, the last deploy date, the last restart.
- Active tenants: count, names, current mode (dark / live).
- Model tier: configured provider, model, region, whether the acknowledgement is written.
- Speech tier: configured TTS, STT, voice, region.
- Knowledge: clinical corpus size, non-clinical corpus size, last refresh.
- Today's usage: turns, tokens in, tokens out, cost estimate.
- A dark-mode button — per-tenant revert to the deterministic layer without taking down other tenants. This is the operational safety valve (Module 8).

What it must not do. Show any key, any endpoint, any secret. Only presence, only booleans, only counts.

### §7.3 — Sub-screen 2: Voice

The query-to-voice mapping. This is the most important screen in the category because it is where the clinical boundary is enforced.

Two zones, clearly marked.

- **Clinical delivery (Emergency, Refusal, Escalation) — LOCKED.** Neutral, clear, unambiguous. Rate and pitch are adjustable (accessibility axes); voice is not. The clinical register is reviewed by layer 4 (Clinical Administrator) via the Clinician Review Queue. §07's V03 refusal stands: no voice selection and no guarantee a South African voice is installed.
- **Presentation (Routine, Navigation, Signed-out visitor, Admin)** — free to configure per tenant.
- **Clinical assist** — clinician-signed-in only.

The Voice screen contains.

- Query-to-voice mapping table. Each class with its voice, its configurable status, and a preview button.
- TTS provider selector. Azure Speech (best SA coverage), Google Cloud TTS, ElevenLabs, Alibaba Qwen-TTS (no SA languages yet).
- TTS voice selector. Filtered by locale. Available voices for en-ZA, af-ZA, and marked-not-available for zu-ZA, xh-ZA, st-ZA, etc. per §07's refusal.
- TTS parameters. Rate, pitch, volume.
- STT provider selector. Deepgram Nova-3 (Afrikaans added Nov 2025), OpenAI Whisper, Azure Speech STT, Alibaba Qwen-ASR.
- STT parameters. Language hints, silence threshold, interim results.
- Voice preview panel (§7.3.1).
- **Push-to-talk constraint.** Shown as a locked setting, not a toggle. Tap or hold to speak; no wake word, no passive recording, no background listening. This is the 22 September founder direction and the contract enforces it.
- **The caption rule.** The written words stay on screen in full, unswitchable. Shown as a locked setting.

#### §7.3.1 — The voice preview panel

A single "Speak" button is not a preview. The panel answers five questions.

1. What does this voice sound like? — the sample itself.
2. How does it sound on my content? — the admin types their own sentence, including one in a South African language.
3. How does it sound on the queries that matter? — the same sentence in the emergency register, the refusal register, the routine register. The admin hears the boundary, not just the voice.
4. How does it compare to the alternatives? — side-by-side playback of 2–3 voices on the same sentence.
5. What does it cost and how fast is it? — latency in milliseconds and cost per utterance.

What the preview must not do.

- **Preview the emergency voice as if it were configurable.** The row plays the locked register so the admin can hear it, but the "Save as default" button is absent on that row.
- **Send real patient text.** The panel rejects anything that looks like a patient identifier (a name + number, an ID number, a phone number).
- **Make a billed call without warning.** Every preview shows the estimated cost per utterance before the Play button, and the panel shows a running total for the session.

Where it lives. Embedded in the Voice screen and reused on the API Registry card for any TTS provider, so the admin can preview a voice before configuring the provider at all. One component, two placements.

### §7.4 — Sub-screen 3: Model Providers

The provider registry, the API keys, the model version selector, the local-agent endpoint.

What the screen contains.

- **Provider list.** Every configured provider — Alibaba Qwen, DeepSeek, Anthropic Claude, Local Ollama — with: status (configured / not configured / failing health check), the model IDs available, the cost tier, the last health-check result, the residency tier (onshore / adequate / contractual).
- **Model version selector.** Per provider, the list of available models. A default model per tenant, a fallback model per tenant, and a clinical-evaluation model (for the review queue's simulation harness).
- **API key entry.** A form per provider. The key is submitted once over TLS, stored server-side, never shown again. The UI displays: provider name, key fingerprint (SHA-256, first 8 chars), last four characters, created date, last rotated date, last used date, scopes, rate limit, expiry, status.
- **The mask/unmask toggle.** The ☐ Show metadata checkbox controls whether the panel shows ••••a3f2 (masked) or sk-...a3f2 (SHA-256: 7f3a...) (unmasked metadata). It never reveals the full key. The full key exists only in the secret vault. This is a display convenience, not a security feature.
- **Local agent configuration.** The endpoint URL (e.g. http://127.0.0.1:11434/v1 for Ollama, http://127.0.0.1:8000/v1 for vLLM), the model ID, and a test button that makes a minimal call and reports latency.
- **Health check panel.** A button that tests every configured provider and reports pass/fail, latency, and the model's response to a fixed prompt.
- **Token usage panel.** Per provider, per tenant: tokens in, tokens out, cost estimate, over the last 24 hours, 7 days, 30 days.
- **Balance panel.** For paid APIs, the remaining credit, the estimated days at current burn rate, the last top-up date.
- **Audit log.** Every key creation, rotation, revocation, use and health-check failure.

What it gates on. G30 — the key vault built; per-tenant scoping tested; the residency decision per provider; the DPIA per provider.

What it must not do. Store a key in a database column, in a browser storage, in a log line, or in a URL.

### §7.5 — Sub-screen 4: Intelligence

The reasoning-level selector.

The five levels.

| Level | Name | Clinical boundary |
|---|---|---|
| 0 | Deterministic only | Emergency, refusal, escalation always run here |
| 1 | Minimal | Non-clinical only |
| 2 | Standard | Non-clinical only |
| 3 | Thorough | Clinical-assist only with a clinician signed in |
| 4 | Deep reasoning | Clinical-assist only with a clinician and a recorded purpose |

What the screen contains.

- The slider. Five levels, labelled with what each changes.
- Per-conversation-type mapping. Patient-facing general, patient-facing clinical-assist, nurse-facing, doctor-facing, admin-facing, signed-out visitor. Each maps to a default level.
- Cost estimator. "At level 2, a 500-turn day costs approximately R X with provider Y."
- Latency estimator. "At level 4, median response time is approximately X ms."
- The hard ceiling. Set by the Super User (layer 1). A tenant cannot set a level above its ceiling.
- The clinical lock indicator. Levels available for clinical-assist turns are constrained by whether a clinician is signed in.

The invariants.

- Level 0 is the emergency level. No tenant can set a level that changes emergency handling.
- A patient-facing clinical-assist turn cannot run above level 2 without a clinician in the loop.
- A signed-out visitor turn cannot run above level 1.
- The level is recorded per turn in the audit log, alongside the provider, the model, the token count and the cost.

### §7.6 — Sub-screen 5: Knowledge

The clinical / non-clinical corpus split.

What the screen shows.

- **Clinical corpus.** Size, last refresh, last review, the review queue entries that touched it.
- **Non-clinical corpus.** Size, last refresh, the last autonomous update.
- **Federation sources.** Every source — the three allowlisted external sources, all currently "active": false — with: name, endpoint, licence, rate limit, residency, use boundaries, active status.
- **Refresh history.** When the corpus was last refreshed, what changed, whether the change was clinical (goes through the queue) or non-clinical (autonomous).
- **The clinical-corpus lock.** Shown as a locked setting. A refresh of the clinical corpus only happens through a ratified Clinician Review Queue entry.

What it gates on. G10 — the recorded licence and POPIA s72 cross-border decision per tenant.

### §7.7 — Sub-screen 6: Compliance

The compliance pack, the audit extract, the kill switch, the residency map.

What the screen shows.

- **The compliance pack.** Six sections — retention and deletion schedule per data class, DPA template, model card, incident response plan, per-tenant kill-switch doc, audit extract. Each section shows: the schema, the gate that blocks it, the exact governance document that would unblock it, and the status.
- **The audit extract.** A read-only view of the append-only audit store, filtered by date range, tenant, and event type. Available to layer 13 (Auditor) only.
- **The kill switch.** A per-tenant button to revert that tenant's engine to the deterministic on-device layer. Time-boxed, reason required, second-party notification. Logged to the append-only store.
- **The residency map.** The three-tier map — onshore, adequate, contractual. Which data classes go where, the routing rules, the POPIA s72 determinations recorded per provider.

What it gates on. G14 — DPIA, Information Officer, residency decision, KMS/HSM custody, retention policy.

### §7.8 — Sub-screen 7: API Registry

This is the screen that lists every external API the platform talks to. The user has asked for this explicitly. It is where the entire commercial track is administrated.

Every external API as a card.

- LLM providers — Alibaba Qwen, DeepSeek, Anthropic Claude, Local Ollama.
- TTS providers — Azure Speech, Google Cloud TTS, ElevenLabs, Alibaba Qwen-TTS.
- STT providers — Deepgram Nova-3, OpenAI Whisper, Azure Speech STT, Alibaba Qwen-ASR.
- Payment gateways — PayFast, Peach Payments, Yoco (all dark).
- SMS providers — BulkSMS, Clickatell, SMSPortal (all dark).
- Maps — Google Maps, Mapbox (all dark).
- Push — Firebase Cloud Messaging (dark).
- Email — SendGrid, Mailgun (dark).
- Device gateway — MQTT broker (self-hosted, dark).

Every card shows.

- Provider name and logo.
- Status. connected / disconnected / error / rate-limited / key-expiring / dark.
- Health check. Last test result, latency, timestamp.
- Usage. Requests today, tokens consumed, cost estimate.
- Balance (for paid APIs). Remaining credit, estimated days at current burn rate, last top-up date.
- Actions. Enable, disable, rotate key, test, view logs, configure scopes.

Switching an API off is a first-class control. When a provider is disabled, every route that depends on it returns the capability's own not-connected sentence — the same discipline packages/catalog/feeds.json already carries for the eleven feed seams. The build fails if a disabled provider is called.

Adding a provider.

- Provider selector. Name, region, residency tier (onshore / adequate / contractual).
- Residency selector. For Alibaba, the choice between Singapore (Tier 3), Johannesburg BCX ALP Cloud (Tier 1 — onshore), Frankfurt (Tier 2 — adequate). The residency selection auto-populates the POPIA s72 determination for Tier 1, and requires a DPA reference for Tier 2/3.
- API key entry. Password-type field. Submitted once. Never shown again.
- Scopes. Checkboxes for the endpoints the provider is authorised to serve.
- Rate limit. Configurable window.
- Expiry. Configurable, default one year.

The mask/unmask toggle is on every key card, same as §7.4.

What it gates on. G32 — the secret vault built; the health-check runner tested; enable/disable tested; balance tracking tested.

## §8 — The five missing contracts to author first

These have no external gate. They are authorable now, in one low-credit session, and they unblock the screens above.

| Module | Contract | Shape |
|---|---|---|
| 16 | packages/catalog/voice.json | The query-to-voice mapping (Emergency / Refusal / Escalation locked; Routine / Navigation / Signed-out / Admin configurable; Clinical-assist clinician-only); TTS/STT provider selection per tenant; voice preview rules; the push-to-talk locked constraint; the caption rule |
| 17 | packages/catalog/model-providers.json | The provider registry (Alibaba, DeepSeek, Anthropic, Ollama); per-provider model lists; defaults, fallbacks, clinical-evaluation model; residency per provider |
| 18 | packages/catalog/intelligence-levels.json | The five levels; per-conversation-type mapping; the hard ceiling; the clinical-assist lock; the cost and latency estimator shapes |
| 19 | packages/catalog/api-registry.json | Every external API as a card; the key-metadata shape; enable / disable / rotate / test; balance and usage tracking; the residency selector |
| 20 | packages/catalog/user-preferences.json | The three-tier voice model (clinical register locked; tenant presentation overridable; user preference); accessibility axes (rate, pitch, captions); the platform-accessibility-respect rule |

Each needs its boundary check the same day. Authoring a contract without its check is the discipline the plan explicitly forbids.

The checks.

- **Voice** — fails if the push-to-talk constraint is disabled; fails if the clinical-delivery voice is changed outside the Clinician Review Queue; fails if a signed-out visitor can run above level 1 (cross-check with Module 18).
- **Model providers** — fails if a key is stored in the catalog; fails if a provider's residency does not match its data-residency contract; fails if the clinical-evaluation model is the default routing target.
- **Intelligence levels** — fails if a patient-facing clinical-assist turn runs above level 2 without a clinician; fails if a signed-out visitor turn runs above level 1; fails if any level changes the emergency path.
- **API registry** — fails if a disabled provider is called; fails if a PHI-tagged field is sent to a Tier 3 provider; fails if a key reaches the browser in full.
- **User preferences** — fails if a user preference can change the Emergency, Refusal or Escalation voice (rate and pitch excepted); fails if the platform's VoiceOver/TalkBack voice is overridden without explicit consent.

## §9 — The gate register for this phase

Every gate, in one place. Nothing in this phase is built as more than documentation until its gate is green.

| # | Gate | What must exist first | Owner |
|---|---|---|---|
| G36 | Production truth reconciled | docs/governance/ASSISTANT-ACTIVATION.md written; CLAUDE.md, deploy/README.md, docs/governance/DPIA-DRAFT.md corrected to say the service is live; the journald retention decision recorded | Founder + Session |
| G15 | Control Tower consolidation | Tab inventory + session model authored ✓; parallel-run plan; rollback plan | Session |
| G16 | Admin layers (15) | Session model unified ✓; data-class register authored | Session |
| G29 | Voice settings (Module 16) | Clinical-delivery register reviewed by layer 4; §07 V03 unchanged; push-to-talk constraint in contract | Session + layer 4 |
| G30 | Model providers & API keys (Module 17) | Key vault built; per-tenant scoping tested; residency decision per provider; DPIA per provider | Session + Info Officer |
| G31 | Intelligence level selector (Module 18) | Hard ceiling per tenant; per-conversation-type mapping; clinical-assist lock tested | Founder + layer 1 |
| G32 | API registry (Module 19) | Secret vault built; health-check runner tested; enable/disable tested; balance tracking tested | Session |
| G35 | User voice preferences (Module 20) | Three-tier model enforced by the boundary check; platform accessibility integration tested | Session |
| G33 | Alibaba Cloud integration | BCX ALP Cloud contract signed; POPIA s72 register updated; DPA executed; residency decision recorded | Founder + Info Officer |
| G34 | SAHPRA determination | Regulatory affairs professional's opinion on medical-device classification | Founder + legal |

What this phase can do without a gate. Author the five contracts and their boundary checks. Build the consolidated shell's skeleton. Write the empty states. Author the Overview screen's contract. Author docs/control-tower-cutover.md.

What this phase cannot do without a gate. Build any sub-screen of GilbertOne API Administration against a live vault. Wire any provider. Enable any device class. Approve any clinical voice.

## §10 — Sequencing

### Phase 0 (already closed) — do not repeat

Contracts, boundary checks, safety fixes, deployment. Committed this week.

### Phase 1 — Production truth (this week, before any new build)

- Write docs/governance/ASSISTANT-ACTIVATION.md — the record that should have existed.
- Correct CLAUDE.md, deploy/README.md, docs/governance/DPIA-DRAFT.md with dated, in-place corrections.
- Make the journald retention decision — delete, retain under a recorded basis, or accept-with-recorded-risk. Anything but unowned.
- Fix the deploy gap — warn loudly (or restart) when the assistant bundle changes and the service is running.
- Push the six Phase 0 commits to GitHub.

### Phase 2 — Author the five contracts (low-credit session)

- Author voice.json, model-providers.json, intelligence-levels.json, api-registry.json, user-preferences.json.
- Author their boundary checks.
- Author the Overview screen's contract (the state-of-the-world schema).
- Author docs/control-tower-cutover.md — the parallel-run and rollback plan.
- Author docs/control-tower-accessibility.md — the WCAG 2.1 AA floor and the keyboard-navigation rules.
- Author docs/governance/CLINICAL-REVIEW-PROCESS.md — the human workflow for the queue.
- Author docs/CLINICAL-CHANGE-CHECKLIST.md — the seven-step pattern the crisis-line fix established.

### Phase 3 — Build the consolidated shell (credits required)

- Build the merged portal shell.
- Move the existing Control Tower workspace and back office tabs into it, honouring the tab inventory.
- Build the Overview screen.
- Build the Devices & Fleet category (with honest empty states).
- Build the seven back-office categories with their updated content.

### Phase 4 — Build GilbertOne API Administration (credits required, gates green)

- Build the Overview sub-screen.
- Build the Voice sub-screen with the query-to-voice mapping and the preview panel.
- Build the Model Providers sub-screen with the key entry, the mask/unmask toggle, and the health checks. Requires the vault (G30) for the live path; the screen can be built against a stub.
- Build the Intelligence sub-screen.
- Build the Knowledge sub-screen.
- Build the Compliance sub-screen.
- Build the API Registry sub-screen with the provider cards and the residency selector.

### Phase 5 — Commercialization (founder-led)

- G33 — Alibaba BCX ALP Cloud contract.
- G34 — SAHPRA determination.
- The first sellable tenant definition.

## §11 — Output format for this session

When you finish a phase, report in this exact shape:

```text
PHASE EXECUTED: <0|1|2|3|4|5>
MODULES TOUCHED: <list>
CONTRACTS AUTHORED: <file> — <one-line shape>
INVARIANTS ADDED: <check-boundaries line> — <one-line what-it-fails-on>
TESTS ADDED: <file> — <one-line what-it-proves>
SCREENS BUILT: <screen> — <one-line what it shows and what it refuses>
BUNDLE MEASUREMENT: <kB> across <n> files (method: documented; delta vs 283.87)
ACCESSIBILITY: <what was tested; what passed; what is outstanding>
GATES RESOLVED: <G-numbers> — <what moved them>
GATES STILL BLOCKING THIS PHASE: <G-numbers> — <what would resolve each>
NOTHING BUILT: <list of everything the phase did not build>
```

Never claim done without the test. Never claim working without the harness. Never claim soon.

## §12 — What never to do

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
- Do not store a key in a database column, browser storage, log line or URL.
- Do not reveal a full key to the browser — masked metadata only.
- Do not preview an emergency voice as if it were configurable.
- Do not allow a patient-facing clinical-assist turn above level 2 without a clinician.
- Do not allow a signed-out visitor turn above level 1.
- Do not start a large build near the weekly credit cap.
- Do not describe a thing as built when it is named-but-absent.
- Do not use the navy/blue/violet palette.
- Do not forget that production is live. The assistant service is answering patients today. Every change you make to it is a production change.

## Appendix A — The patient-entry bundle budget history

| Date | Figure | Note |
|---|---|---|
| 16 Sep 2026 | 282.16 kB | Recorded budget |
| 19 Sep 2026 | 283.07 kB | Chat-layout / robot-colour / public-guide |
| 19 Sep 2026 | 284.08 kB | Presentation polish |
| 20 Sep 2026 | 284.01 kB | Reference robot |
| 20 Sep 2026 | 284.00 kB | Speech on (lazy chunk) |
| 20 Sep 2026 | 283.85 kB | Reference robot v2 |
| 22 Sep 2026 | 283.93 kB | One-engine, three-clients pass |
| 24 Sep 2026 | 283.87 kB | Phase 0 contracts + safety fixes + voice honesty |

Only comparisons taken the same way are legitimate: every script, module preload and stylesheet referenced by apps/web/dist/index.html, gzipped at level 9.

This phase adds nothing to the patient entry. The admin surfaces are route-chunked; the GilbertOne admin screens are lazy-loaded; the API Registry is fetched.

## Appendix B — The eight-step clinical path — no step skipped

Catalog contract · Generator · Web · iOS · Android · Boundary rule · Journey test · Feature-map update.

Every screen in this phase that touches clinical behaviour follows the eight-step path. The Voice screen, the Intelligence screen, the Knowledge screen, and the Clinical Review Queue screen all qualify. The Model Providers, API Registry, Compliance and Overview screens do not, because they do not touch clinical decisioning.

## Appendix C — The token palette — for every screen

The shipped packages/design-tokens/tokens.json palette governs every Control Tower and GilbertOne API Administration screen.

- brandInk #0F3B4A — deep teal-navy
- indigo #1E3A8A — blue
- brandGreen #1D9E75 — teal-green
- brandLime #D9FF1A — lime
- brandOrange #FF6B35 — orange
- brandMint #9FE1CB — mint
- teal-soft #E6FAF6 — soft teal, for visor plates and empty states

GilbertOne's brand is an accent within that token system, never a replacement for it. The navy/blue/violet palette (#0C2340 / #2563EB / #7C3AED) mentioned during scoping is not the CI and must not be used.

A token-drift CI check fails the build if any hex literal appears in component code that is not sourced from design-tokens.json.

## Appendix D — Wireframes for the new screens

These are indicative of layout and state, not final design. The locked token palette governs the real screens.

### D.1 — The merged portal shell

```text
┌──────────────────────────────────────────────────────────────┐
│  MyThuso Control Tower                    [tenant ▾]  [🔔]   │
├──────────────┬───────────────────────────────────────────────┤
│  Overview    │                                               │
│  Dispatch    │                                               │
│  Vetting     │              (screen content)                 │
│  Quality     │                                               │
│  Audit       │                                               │
│  Devices     │                                               │
│  GilbertOne  │                                               │
│  Config      │                                               │
│  Finance     │                                               │
│  Compliance  │                                               │
│  Governance  │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

### D.2 — Overview

```text
┌──────────────────────────────────────────────────────────────┐
│  Control Tower · Overview                                    │
├──────────────────────────────────────────────────────────────┤
│  Services                                                    │
│  ● Assistant       live · activated · azure · speech         │
│  ○ Identity        dark (no provider)                        │
│  ○ Devices         gated (DPIA not-done)                     │
│  ○ Payments        dark (no provider)                        │
│  ○ Messaging       dark (no provider)                        │
│                                                              │
│  Active tenants · 1                                          │
│  ● Milpark Hospital (demo)                                    │
│                                                              │
│  What changed since you last looked · 8 items                │
│  · Phase 0 contracts committed                               │
│  · Crisis lines added (SADAG + Lifeline)                     │
│  · Cloud voice pinned to southafricanorth                    │
│  · 915 browser tests passing                                 │
│                                                              │
│  Open gates · 5                                              │
│  · G1  SAHPRA determination       (founder + legal)          │
│  · G14 Compliance pack            (Info Officer)             │
│  · G22 Field safety               (founder + legal)          │
│  · G26 Break-glass anchor         (founder)                  │
│  · G34 SAHPRA determination       (founder + legal)          │
└──────────────────────────────────────────────────────────────┘
```

### D.3 — Voice settings

```text
┌──────────────────────────────────────────────────────────────┐
│  GilbertOne · Voice                                          │
├──────────────────────────────────────────────────────────────┤
│  Query-to-voice mapping                                      │
│  Class              Voice              Configurable?         │
│  Emergency          Neutral · clear    🔒 Locked             │
│  Refusal            Neutral · clear    🔒 Locked             │
│  Escalation         Neutral · clear    🔒 Locked             │
│  Clinical assist    Professional       ⚕ Clinician-only     │
│  Routine            [en-ZA · Thandi ▾]   ✓ Free              │
│  Navigation         [en-ZA · Thandi ▾]   ✓ Free              │
│  Signed-out         [en-ZA · Thandi ▾]   ✓ Free              │
│  Admin              [en-ZA · Luke ▾]     ✓ Free              │
│                                                              │
│  TTS · Azure Speech · en-ZA · Thandi (Neural)                │
│  Rate:  ────●──── 1.0×   Pitch: ────●──── +0                 │
│  STT · Deepgram Nova-3 · [en-ZA, af, zu, xh]                 │
│                                                              │
│  Voice preview                                               │
│  Class: [Emergency ▾]                                        │
│  Text:  [Chest pain radiating to the left arm.    ]          │
│  ☑ Azure · en-ZA · Thandi  Latency 340 ms · $0.016/1K        │
│  ☑ Azure · en-ZA · Luke    Latency 320 ms · $0.016/1K        │
│  ☑ Google · en-ZA · Std-A  Latency 210 ms · $0.004/1K        │
│  [ ▶ Play all ]  [ ⏸ Stop ]                                  │
│                                                              │
│  ⓘ §07 V03: no guarantee a South African voice is            │
│     installed. Text fallback shown where voice is not.       │
│  ⓘ Emergency, refusal and escalation voices are locked to    │
│     a neutral register. Request a change via the Clinician   │
│     Review Queue.                                            │
└──────────────────────────────────────────────────────────────┘
```

### D.4 — Model providers

```text
┌──────────────────────────────────────────────────────────────┐
│  GilbertOne · Model Providers                                │
├──────────────────────────────────────────────────────────────┤
│  ● Alibaba Qwen          Active    Key: ••••a3f2             │
│    Region: Johannesburg (BCX ALP) · Tier 1 — onshore         │
│    Health: ● 340 ms   Balance: 987,660 / 1M tokens           │
│    Usage (24h): 12,340 in · 4,210 out · ~R0.40               │
│    [ Test ] [ Rotate ] [ Disable ] [ Logs ]                  │
│    [ ☑ Show metadata ]                                       │
│                                                              │
│  ● DeepSeek              Fallback  Key: ••••b7c1             │
│    Region: Singapore · Tier 3 — contractual                  │
│    Health: ● 280 ms   Balance: pay-as-you-go                 │
│    [ Test ] [ Rotate ] [ Disable ] [ Logs ]                  │
│                                                              │
│  ○ Claude                Not configured                      │
│    [ Configure ]                                             │
│                                                              │
│  ● Local (Ollama)        Configured                          │
│    Endpoint: http://127.0.0.1:11434/v1                       │
│    Model: llama3.1:8b                                        │
│    Health: ● reachable · 120 ms                              │
│                                                              │
│  ┌ Add a provider ────────────────────────────────────────┐  │
│  │ Provider:  [ Alibaba Qwen          ▾ ]                 │  │
│  │ Region:    [ Johannesburg (BCX)    ▾ ]                 │  │
│  │ API key:   [ •••••••••••••••• ]                        │  │
│  │            (submitted once; never shown again)          │  │
│  │ Scopes:    [ ☑ chat.completions  ☑ embeddings ]        │  │
│  │ Rate limit:[ 1000 req/hour ]                           │  │
│  │ Expiry:    [ 1 year ]                                  │  │
│  │ [ Save & test ]                                        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### D.5 — Intelligence levels

```text
┌──────────────────────────────────────────────────────────────┐
│  GilbertOne · Intelligence                                   │
├──────────────────────────────────────────────────────────────┤
│  Reasoning level                                             │
│   0 ────── 1 ────── 2 ────── 3 ────── 4                      │
│   Det.    Min.    Std.    Thor.   Deep                       │
│                                                              │
│  Level 2 — Standard                                          │
│  Normal model call, moderate token budget.                   │
│  Est. cost: ~R0.40 per 100 turns (Qwen Flash)                │
│  Est. latency: ~850 ms median                                │
│                                                              │
│  Ceiling set by Super User: Level 3                          │
│  You cannot set a level above the ceiling.                   │
│                                                              │
│  Per conversation type                                       │
│  Patient · general          [ Level 2 ▾ ]                    │
│  Patient · clinical assist  [ Level 1 ▾ ]  🔒                │
│  Nurse-facing               [ Level 3 ▾ ]                    │
│  Doctor-facing              [ Level 3 ▾ ]                    │
│  Admin-facing               [ Level 2 ▾ ]                    │
│  Signed-out visitor         [ Level 1 ▾ ]  🔒                │
│                                                              │
│  ⓘ Emergency, refusal and escalation always run at            │
│     Level 0 — the deterministic layer.                       │
└──────────────────────────────────────────────────────────────┘
```

### D.6 — API Registry

```text
┌──────────────────────────────────────────────────────────────┐
│  GilbertOne · API Registry                                   │
├──────────────────────────────────────────────────────────────┤
│  [ + Add a provider ]           Filter: [ All ▾ ]  🔍        │
├──────────────────────────────────────────────────────────────┤
│  LLM Providers                                               │
│  ● Alibaba Qwen      Active   Key: ••••a3f2                  │
│    Health: ● 340 ms  Balance: 987,660/1M                     │
│    [ Test ] [ Rotate ] [ Disable ] [ Logs ]                  │
│  ● DeepSeek          Fallback Key: ••••b7c1                  │
│  ○ Claude            Not configured                          │
│                                                              │
│  TTS Providers                                               │
│  ● Azure Speech      Active   Key: ••••d4e5                  │
│    Balance: 487K/500K chars                                  │
│  ○ ElevenLabs        Not configured                          │
│                                                              │
│  STT Providers                                               │
│  ● Deepgram Nova-3   Active   Key: ••••f6a7                  │
│    Balance: $187.40 / $200 credit                            │
│                                                              │
│  Payments                                                    │
│  ○ PayFast           Not configured                          │
│  ○ Peach Payments    Not configured                          │
│                                                              │
│  SMS                                                         │
│  ○ BulkSMS           Not configured                          │
│                                                              │
│  Maps                                                        │
│  ○ Google Maps       Not configured                          │
│                                                              │
│  Push                                                        │
│  ○ Firebase FCM      Not configured                          │
│                                                              │
│  Email                                                       │
│  ○ SendGrid          Not configured                          │
│                                                              │
│  Device Gateway                                              │
│  ○ MQTT broker       Not configured                          │
└──────────────────────────────────────────────────────────────┘
```

### D.7 — Clinical Review Queue

```text
┌──────────────────────────────────────────────────────────────┐
│  Control Tower · Governance · Clinician Review Queue         │
├──────────────────────────────────────────────────────────────┤
│  Pending · 2
```

> The supplied text ends here. The rest of D.7, and anything after it, did not arrive.

## A note on the wireframes, added on commit

The wireframes show values the tree does not hold. They must not be built as shown.

- **Providers.** Alibaba Qwen, DeepSeek and Deepgram appear as "Active", with keys, balances and usage. None is configured: the only live providers are Azure OpenAI and Azure Speech.
- **Tenant.** "Milpark Hospital (demo)" is named. No tenant exists.
- **Voices.** Thandi and Luke are named. Voice names come from `packages/catalog/assistant.json`.

The screens render what the contracts and the service actually report, and show a written empty state or "not configured" where the wireframe shows a value.
