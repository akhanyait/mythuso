# The Clinician Review Queue — the human process

> **Draft prepared for review. Not an adopted procedure.** Written 24 September 2026, Phase 2 of
> `docs/PROMPT-CONTROL-TOWER-UI.md` (§10). It describes what people do; the queue's shape, states and
> refusals are in `packages/catalog/clinical-review-queue.json` and are not restated here. Nothing in
> this document is built: the queue's five routes are declared `proposed` in
> `packages/catalog/apis/clinical.json` with no handler, no screen reads the queue, and no entry has
> ever been proposed. It takes effect when the Medical Director signs it (_Sign-off_, at the end).

## What the queue is for

The Clinician Review Queue is the one door through which anything that could change clinical behaviour
may move: a change to the global escalation ruleset or the emergency terms (Tier 1), a hospital's own
additive protocol steps (Tier 2), or a rule that would let a device reading raise an incident. Since
24 September 2026 two more things are named as moving through it: the clinical-delivery voice register
(`packages/catalog/voice.json`) and a refresh of the clinical knowledge corpus
(`packages/catalog/knowledge-corpus-tiers.json`, which records that the queue has no entry shape for a
bulk refresh yet).

The engine may improve its own phrasing and its own retrieval of non-clinical information. It may never
improve its own idea of what counts as an emergency. This process is how a person — never the engine —
changes that.

## Who takes part

| Role | Who, today | What they do here |
| --- | --- | --- |
| **Proposer** | Any clinician, or the founder recording an instruction | Writes the change where that kind of change lives, and opens an entry pointing at it |
| **Reviewer** | A clinician named on the entry, who did not propose it | Reads the change and its evidence, asks questions, recommends |
| **Clinical governance board** | **Not formed** (`packages/catalog/protocols.json#governance`) | Decides ratify or reject |
| **Medical Director** | **Not appointed** (same place) | Signs the ratification by name, role and day |
| **Signing capability** | `sign-clinical-review`, confirmed for the roles `packages/catalog/clinical.json`'s review-confirmer setting names | The permission the sign route will check; no new signing authority is invented for the queue |
| **Engineer** | Whoever lands the change | Makes the ratified change in the file, records the ratification where that file records it, and moves the entry to live |

**Because the board is not formed and no Medical Director is appointed, no entry can be ratified
today.** This process can be followed up to _in review_ and no further. That is not a gap in the
process; it is the process working.

## The steps

Each step is a transition the contract allows (`transitions.allowed`), and each is a new row in the
entry's history — nothing is edited or removed.

### 1. Write the change where it lives

Before any entry exists, the proposed change is written in the place that kind of change is written,
and nowhere else:

- an escalation rule: a pull request editing `packages/gilbertone/src/escalation.ts` (not merged);
- an emergency term: a pull request editing `packages/catalog/gilbert-emergency-terms.json` (not merged);
- a tenant's additive step: a Tier 2 layer file under `packages/catalog/tenant-clinical-layers/`;
- a device threshold: a row proposed for `packages/catalog/devices/thresholds.json`, carrying no number
  until ratified;
- the clinical-delivery voice register: a pull request editing `packages/catalog/voice.json`.

The entry never carries the change itself — no wording, no number, no code.

### 2. Propose (→ _proposed_)

The proposer opens an entry with the tier, the reference to where the change is written, the basis
(a guideline, an incident, a founder instruction — an entry with nothing behind it is refused), and
their own name. A Tier 2 entry that removes, weakens or overrides anything in Tier 1 is refused here,
at proposal, not at review. A proposed entry decides nothing.

### 3. Assign a reviewer (→ _in review_)

A reviewer is named. **The reviewer is never the proposer.** The reviewer reads the change in its own
file, the evidence, and what else would be affected — for an escalation rule, the shared fixtures on
all three platforms; for an emergency term, the listed false positives in
`gilbert-emergency-terms.json`; for a device threshold, the device class and its pairing tier. They write
their questions and recommendation on the entry. An entry in review still decides nothing.

### 4. Decide (→ _ratified_ or _rejected_)

The board decides, and the Medical Director signs the ratification with name, role and day, in the
same shape `protocols.json` uses for a protocol — never a second signature format. A rejection is kept,
with its reason: a change proposed and refused is worth knowing happened.

### 5. Land it (→ _live_)

Ratified and live are different states because a board's signature and a code change landing are two
events. The engineer:

1. merges the change in its own file;
2. records the ratification where that file records one — `gilbert-emergency-terms.json`'s changelog and
   `termsHash` and its `clinicalReview` fields; `gilbert-clinical-core.json`'s `codeHash` and `ruleOrder`
   for `escalation.ts`; `voice.json`'s register version, `ratifiedEntryRef` and `pinnedHash`;
3. follows `docs/CLINICAL-CHANGE-CHECKLIST.md` end to end — contract, generator, web, iOS, Android,
   boundary rule, journey test, feature map — so the change reaches every platform the same day;
4. moves the entry to live, naming the commit.

`npm run check` fails if any of those files changes without its pin moving with it, so step 2 cannot be
skipped by accident.

### 6. Roll back (a new entry)

A live entry is never edited or removed. Reverting one is a new entry, proposed, reviewed and ratified
like any other, naming the entry it reverts. What was true on the day a clinician acted on a rule stays
readable afterwards.

## What happens in an emergency

If a live rule is found to be causing harm — an emergency not recognised, or a harmful answer given —
the first act is not a queue entry. It is to take the model tier out of the path: today that means an
operator at a terminal on the server stopping the assistant service, or removing
`MYTHUSO_ASSISTANT_PRODUCTION=acknowledged` so that it refuses to start in production
(`deploy/RUNBOOK.md`). With the service unreachable, the apps answer from the deterministic layer in
`packages/gilbertone`, which is what answers whenever the service is dark or cannot be reached. The per-tenant kill switch the plan names
(Module 8) does not exist. The deterministic layer itself cannot be switched off, by design; a defect in
it is fixed through an entry proposed the same day, with the incident as its basis, and nothing about
the urgency exempts the fix from review — it shortens the wait for one.

Until the board exists there is nobody to ratify even an urgent fix. The founder's decisions on 24
September 2026 — the crisis lines, and the nosebleed recorded as a known false positive rather than
tuned out (`docs/SCOPE-BALANCE.md` §1) — were made directly, unreviewed, and are recorded as such in
their own files. That is the honest state until a reviewer exists, not a precedent for skipping one.

## What this process will not do

- **Let the engine propose to itself.** No script, model or scheduled job opens an entry. Proposals are
  made by people. `scripts/check-boundaries.mjs` already fails the build if a script writes to the
  escalation ruleset or the emergency terms.
- **Let a proposer review their own change**, or confirm the clinical review of a change they made.
- **Treat "locked" as "reviewed".** A locked file is one only this process changes; whether anyone
  clinical has ever read it is a separate fact, recorded in its own `clinicalReview` field. Today the
  emergency terms, the crisis lines and the escalation ruleset are all unreviewed.
- **Carry clinical content in the queue.** The entry points at the change; the change lives in one place.

## What is not decided here

- The board's membership, quorum and meeting cadence (`protocols.json#governance`, all null).
- How long an entry may sit in review before somebody is told.
- The entry shape for a bulk clinical-corpus refresh (`knowledge-corpus-tiers.json#queueFitFlag`).
- Whether a Clinical Administrator (layer 4 in `docs/control-tower-session-model.md`) is the same person
  as the Medical Director or a separate post.

## Sign-off

| Field | Entry |
| --- | --- |
| Adopted by (Medical Director, name and HPCSA number) | |
| Board that approved it (name and date) | |
| Changes agreed at adoption | |
| Date in force | |
