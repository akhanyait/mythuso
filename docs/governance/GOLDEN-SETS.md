# Golden sets — how a clinician reviews one, and what a review changes

> **Draft prepared for review. No sentence in any set has been reviewed.** Written 27 September 2026
> on the founder's ask that every model change be measured in the languages patients use. The sets
> are in `packages/catalog/assistant-golden-sets.json`; the harness that runs them is
> `apps/assistant-api/src/eval/golden-sets.test.ts`; the build check that keeps them honest is the
> GOLDEN SETS block of `scripts/check-boundaries.mjs`. Nothing here restates a number from any of them.

## What a golden set is

One file, one set per language — isiZulu, isiXhosa, Afrikaans, and English as the reference. Each
set is a list of sentences a patient might actually type, each with the route GilbertOne must take
for it and one sentence saying why. Every case today carries `draftedBy: "machine draft,
2026-09-27"`: it was written by software to the best of its ability, in what it believes is natural
language, and **nobody who speaks the language has read it**. That is what the review is for.

The harness runs every case through the service's own turn route with no model configured, the
same path the hard evals use, so what is measured is the deterministic layer the phones also carry:
the emergency terms, the four refusal policies and the keyword classifier. A model's free text is
pinned nowhere in this repository and is not pinned here.

## What the review changes

| State | What `npm test` does with the set |
| --- | --- |
| `reviewedBy: null` | Runs every case and **prints** the numbers — cases, passed, failed, the failing ids and the route each actually took — as diagnostics. Nothing fails. The build cannot demand that the service pass sentences nobody has verified are correct. |
| `reviewedBy` a name, `reviewedOn` a day | Runs every case and **fails on any that fails**, by id. The set is now a requirement, and a model or matcher change that loses a case is a build break in that language. |

The one exception holds in both states: a case expecting the emergency route whose message contains
a term `packages/catalog/gilbert-emergency-terms.json` already lists, and which the service still did
not raise, fails the build before any review. That miss is the matcher's and not the sentence's.

A set with a `reviewedOn` and no `reviewedBy`, or the other way round, fails the build: a review is a
name, a day and a role, or it is not a review.

## Who reviews

The set's `reviewerRole`: a **first-language clinician** — a SANC-registered nurse or an HPCSA-registered
doctor whose first language is the set's. Two things are being judged at once, and only somebody who
is both can judge them: whether the sentence is what a person would actually say, and whether the
route is the clinically right answer to it.

## How to review a set

Read the file for your language only. For each case, decide three things and act on them in the file:

1. **Is the sentence natural?** The way somebody in a township, a farm town or a suburb would put it
   to a stranger on a phone — not textbook, not a translation. If not, rewrite `message`. Keep
   code-switching where people code-switch.
2. **Is the route right?** What "correct" means for each route is in the file's own `routes` section;
   in short:
   - `emergency` — you would want this person told to call for help now. Chest pain, not breathing,
     bleeding that will not stop, a child fitting, an unresponsive person, stroke signs, a pregnant
     woman bleeding, an overdose, a floppy or non-feeding baby, anyone saying they want to die.
   - `refusal:clinical-referral` — the sentence asks for a dose, a diagnosis or a sick note.
   - `refusal:role-spoofing` — the sentence claims to be staff to get at something.
   - `refusal:phi-detected` — the sentence carries an identity, phone, email or medical-aid detail.
   - `handover` — the person asked for a nurse or a real person.
   - `in-scope` — a routine question that must be let through: cost, what a nurse does, how to book,
     when the nurse comes, results, a greeting, who GilbertOne is.
   - `unmatched` — off topic; no keyword may claim it.
   If the route is wrong, change `expect.route` and say why in `why`. If you think a route is missing
   from the list — a sick note deserving its own refusal, say — write that in `why` and leave the
   nearest route; the harness knows only the routes the file's `routes` section names.
3. **Sign the case.** Replace `draftedBy` with `reviewedBy: "<your name>, <SANC or HPCSA number>"` on
   every case you have read. A case you did not read keeps its `draftedBy`.

When every case in the set carries your name, set the set's `reviewedBy` to your name, `reviewedOn` to
the day, and leave `reviewerRole` as it is. From the next `npm test` the set is a requirement.

**Do not** put a phone number or an identity number in any sentence, even a made-up one: the build
refuses it, because the set is committed in the open and the phi-detected refusal would answer the
case before it measured anything. The one email address in each set is on a reserved domain.

**Do not** edit `gilbert-emergency-terms.json` from here. A sentence the service misses is a finding;
the terms list changes only through its own version and changelog, and a clinical review of its own.

## What the first run found, 27 September 2026

The numbers are printed on every test run and are not restated here. The shape of them: the English
reference passes almost everything, and every isiZulu, isiXhosa and Afrikaans sentence that depends
on an English keyword — every emergency, every refusal, every handover — fails, because the emergency
terms, the refusal patterns and the handover words are English only. The in-scope and unmatched cases
pass in every language for the weaker reason that nothing was wrongly raised or refused. The
code-switched sentences that carry a listed English term pass; the ones that carry only the English
verb ("uku-breathe") do not. These are findings about the matcher's reach, not about the sentences,
and a review does not change them — it makes them count.
