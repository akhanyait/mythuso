# Regulatory classification — Module 6, the question this document does not answer

Phase 0 documentation only. This exists to make one question precise enough for a lawyer to answer
it, not to answer it. Nothing here is a legal opinion, and nothing in the build changes because of
this document.

## The question, as posed

Quoting the founder-supplied plan's Module 6 exactly:

> **What.** A legal/regulatory workstream. Does the combination of structured triage, severity
> scoring, escalation, clinical knowledge retrieval, emergency pattern recognition, and now
> medical-grade device thresholds, constitute a medical device or CDS tool requiring SAHPRA
> registration?
>
> **Why.** Treats "does not diagnose" as if it resolves the question. It doesn't. Gates the entire
> commercialization track.
>
> **Gates on.** A legal/regulatory opinion. First thing to resolve.

A note on numbering, for anyone reconciling this against other documents in the tree: the string
"Module 6" already appears once in this codebase, in `packages/catalog/clinical-review-queue.json`'s
`no-auto-promotion-without-a-signature` refusal, where it labels the *self-learning boundary*
("the engine improves its own phrasing and its own retrieval freely, and it may never improve its
own idea of what counts as an emergency") — a different question from the one above, which
`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` discusses under its own unnumbered §2 rather than as a
numbered module. This document uses "Module 6" only as the plan text handed to it uses it: the
regulatory-classification question quoted above. See
`docs/control-tower-session-model.md`'s companion note for the same discrepancy read from the admin-
layer side.

## Why "does not diagnose" is an incomplete answer

`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` states the engine's guardrail as "the engine collects,
structures, correlates, ranks urgency, explains its evidence and escalates. It does **not** diagnose,
prescribe or replace a clinician." That sentence is true of what the engine is built to refuse, and
it is also not the test SAHPRA or comparable regulators apply. Software-as-a-medical-device and
clinical-decision-support classification typically turn on what the software's *output* does for a
clinician's decision — whether it merely informs, or whether it drives a clinical action without
adequate opportunity for independent clinical judgement — not on whether the vendor's own copy uses
the word "diagnose." A tool that never utters a diagnosis can still be the thing regulators mean by
"software intended to... provide decision support in clinical management," if what it computes
(a severity score, an escalation instruction, a device-threshold-triggered alert) is what a nurse or
doctor actually acts on without re-deriving it themselves. Six capabilities, taken together rather
than singly, are the actual candidate for that classification:

1. **Structured triage** — a guided assessment that walks a patient through fixed questions and
   arrives at a priority.
2. **Severity scoring** — ranking how urgent a presentation is.
3. **Escalation** — instructing a specific next action (call emergency services, be seen today, see
   a clinician soon) rather than only surfacing information.
4. **Clinical knowledge retrieval** — answering from a governed clinical knowledge base and, when
   configured, external clinical sources.
5. **Emergency pattern recognition** — deterministic detection of a specific dangerous presentation
   (chest pain radiating to the arm, a blood pressure over 180/120) from free text.
6. **Medical-grade device thresholds** — a numeric bound on a vital-sign reading whose breach is
   meant to mean something clinically, as distinct from a consumer device's advisory-only reading.

No one of these, alone, obviously crosses into medical-device territory — a symptom checker that
only retrieves information is a different thing from one that also scores severity and escalates.
The Module 6 question is precisely that these six are not being built one at a time in isolation;
they are being built as one connected system in one engine, and a regulator reading the combination
rather than any single piece is the reading "does not diagnose" does not defend against.

## What evidence exists in the tree for each capability, checked honestly

Per `CLAUDE.md`'s own rule that nothing here overstates its readiness, each capability below is
checked against what `apps/assistant-api` and `packages/gilbertone` actually do today, not what the
commercialization plan describes them as eventually doing. The short version: most of the six are
**built and gated**, not live, and one of the fourteen (the emergency pattern recognition layer) is
the one piece that is live everywhere, on every platform, with no gate at all — which is itself a
regulatory-relevant fact, not a reassuring one.

**1. Structured triage — built, gated shut, unconditionally.**
`apps/assistant-api/src/routes` carries `/assistant/v1/triage/start` and `/assistant/v1/triage/answer`
handlers. Whether they act is decided by `apps/assistant-api/src/lib/triage-gate.ts`, which reads
`packages/catalog/clinical.json#triage.triageProtocols.ids` (empty — **0 of 12** launch protocols are
designated triage protocols) and `packages/catalog/protocols.json#governance` (board `status`
not `"formed"`, Medical Director `status` not `"appointed"`). The gate's own comment states the
reasoning plainly: "taking a person through triage questions and setting a priority for them is a
clinical act," so it runs "only under a triage protocol the clinical governance board has ratified."
Until all three conditions hold, every triage call receives the contract's refusal, not a guess and
not a diagnosis-shaped answer. This is the strongest single piece of evidence in the tree that the
people who built it already treated triage as the regulated act Module 6 is asking about — the gate
predates this document by two days (added 22 September 2026).

**2. Severity scoring — exists as a concept inside triage and inside escalation, gated the same two
ways.** Triage's severity output is behind the same `triageGate()` as (1). The deterministic
escalation layer (5, below) independently carries a `Severity` type (`"emergency" | "urgent" |
"routine"`) that is live regardless of the triage gate, because it is not itself framed as triage —
it is framed as pattern matching over free text, discussed under (5).

**3. Escalation — two deterministic layers, and only one of them reaches a patient.**
`packages/gilbertone/src/escalation.ts` runs an ordered, regex-based ruleset that returns one of
three actions (`call_emergency`, `urgent_care`, `clinician_soon`) with an approved message. Its header
comment says it is not diagnostic, not networked and not reorderable by accident. **It is not live.**
Corrected 24 September 2026 against the code: outside its own package it is imported only by
`apps/assistant-api/src/lib/orchestrator.ts`, where `checkEscalation` runs in the `escalate` node
that follows `check_activation` (`orchestrator.ts:586-587`). The model tier is dark, so the node never
runs. No web, iOS or Android file imports the ruleset. What does answer a patient today is the
emergency-term matcher: `evaluateMessage` in `packages/gilbertone/src/engine.ts` and its stemmed
counterparts on the three platforms, reading `packages/catalog/gilbert-emergency-terms.json`. The first
draft of this document said the reverse, that `escalation.ts` was "live today, unconditionally, on
every platform". That was wrong, and it is struck rather than softened.

**4. Clinical knowledge retrieval — built, layered, and today functionally local-only.**
`apps/assistant-api/src/lib/knowledge-federation.ts` is a governed layer above a local knowledge base:
it checks a deny-list of out-of-scope questions (diagnosis, prescribing, dose changes, anything
needing a licence) before searching at all, answers from the local base first, and would ask the
external sources allowlisted in `federation.json` — fourteen of them counted on 6 October 2026,
three when this paragraph was written, and six of the fourteen with an adapter in `src/lib/sources/`
today (ICD-11, OpenFDA, PubMed, MedlinePlus, CDC and Wikidata) — only when each source's
`federation.json` row is `"active": true`. All fourteen ship `"active": false` today. <!-- Only the
counts were re-derived here, from `packages/catalog/knowledge/federation.json` and from the adapter
files beside it; eight of the fourteen have no adapter at all, which is a gap in the opposite
direction from the one this sentence was written about. The wider claim that the module is
unreachable from a request — restated in the next sentence from the module's own comment — is under
review in a separate change and was not verified by this pass. --> The
module is also, by its own comment, "not imported by any route yet" — built, wired to nothing that a
request can reach, and its abstention discipline (no-evidence, expired-evidence, conflicting-evidence)
is itself a clinical-safety design already present in code, whether or not the module is switched on.

**5. Emergency pattern recognition — the one capability that is live, everywhere, with no gate.**
The emergency-term matcher (`packages/gilbertone/src/engine.ts` `evaluateMessage`, fed by the ten
term groups of `packages/catalog/gilbert-emergency-terms.json`, and mirrored with the same stemming
contract on all three platforms) runs whenever GilbertOne is reachable at all, because it is the
deterministic fallback the rest of the plan is built to fall back to. (It is the matcher, not
`escalation.ts`, that is live; see (3). A run of the validation protocol's gold utterances on 24
September found that this matcher answers "nose bleed" with the emergency presentation, and
`docs/SCOPE-BALANCE.md` records that finding.) It has no
environment flag, no governance-board dependency, and no `MYTHUSO_ASSISTANT_PRODUCTION` gate,
because — per `CLAUDE.md` — "this is what answers while the engine above is dark, which — today — it
always is." That makes it, of the six, the capability with the least ambiguity about being live
today, and the one a regulatory opinion should weigh most carefully: it already recognises a
specific dangerous presentation from unstructured patient text and issues a specific instruction, on
a production-capable code path, in a build that ships.

**6. Medical-grade device thresholds — contracted, not contacted, gated on an unmet DPIA and an
empty allowlist.** `packages/catalog/devices.json`, `packages/catalog/apis/devices.json` and
`packages/catalog/devices/simulator-presets.json` exist and are read by a development engine runtime
in `packages/engines/src/devices` — a simulated clock and an in-process bus, per
`docs/security/THREAT-MODEL.md`, not a runtime that speaks to a real device. `apps/assistant-api/src/
lib/vitals.ts` validates a reading's *shape* against `packages/catalog/vitals.json` (accepted types,
LOINC codes, UCUM units, plausibility bounds, staleness, device allowlist) and is explicit that this
is "validation, not interpretation... it never says what the number means for a patient, never
scores and never triages" — that judgement is deferred to Clinical, under a ratified protocol, "and
there is none." `devices.json` already distinguishes a consumer device (`carriesClinicalWeight:
false`, "never raises an alert and never sends anybody, whatever the reading says") from a
certified one, and the real-device allowlist holds **0 devices** against a data protection impact
assessment `docs/ROADMAP.md` records as "not-done." Nothing here has ever read a real threshold
breach and acted on it.

## The combination, not the parts, is the candidate

Read singly, five of the six capabilities above are either gated shut by an unformed governance board
and an empty triage-protocol list, or contracted-but-unreached (knowledge federation's dark sources,
the device allowlist's zero entries). Read together with the sixth — the always-on, ungated emergency
pattern recognition every platform ships — the shape of the system is: a deterministic layer that
already makes a real-time escalation call on unstructured patient input in production-capable code,
sitting beneath a model-mediated layer that, the day its gates open (a board formed, a Medical
Director appointed, protocols ratified, a provider configured and `MYTHUSO_ASSISTANT_PRODUCTION=
acknowledged` written by hand), adds structured triage, severity scoring, governed knowledge
retrieval and device-threshold-aware vital-sign handling on top of it. That combined system —
not any one gated piece of it — is what Module 6 is asking a regulator to classify, and "it does not
diagnose" answers a question about the model layer's vocabulary, not about what the deterministic
layer beneath it already does, or what the whole stack will do the day every gate presently holding
it shut is opened by an operator's hand rather than by code.

## What this document is for, and is not for

This document exists to state the six capabilities precisely, show what evidence for each actually
exists in the tree today (built, gated, or dark — not assumed), and put the combination question in
front of a lawyer in the same terms the founder's plan poses it. **It is gated on an external
legal/regulatory opinion this document cannot itself provide.** No engineering decision, boundary
check, or contract change follows from anything written here; per the plan's own words, this is
"the first thing to resolve," and resolving it is not an engineering act.
