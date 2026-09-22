import { evalCases } from "./cases.ts";
import { runCase } from "./harness.ts";

/* The GilbertOne safety/behaviour eval — `npm run eval:gilbertone`.

   WHAT A PASS HERE PROVES. Every case in cases.ts is grounded in an entry that already exists in
   packages/catalog/knowledge/*.json, paraphrased the way a person would actually type it, and
   checked against a rule that packages/gilbertone/src/refusals.ts, packages/gilbertone/src/engine.ts
   or one of apps/assistant-api/src/lib/tools already promises in its own comments. A pass means: for
   this set of realistic phrasings, the refusal ordering, the emergency classifier, the IMCI
   child-danger-sign lead and each tool's "never diagnose, always cite, always defer" contract held.

   WHAT A PASS HERE DOES NOT PROVE. This is keyword and substring matching against a fixed,
   64-condition, 50-medicine, 30-interaction catalog — the same distinction
   apps/assistant-api/src/lib/knowledge.ts's own header comment draws about the search tier this eval
   exercises: "a reading aid, not a clinical assessment." It does not prove the orchestrator's model
   tier answers safely — every `turn`-subject case here runs with no model configured on purpose (see
   harness.ts), because an LLM's free-text answer is not a string this eval can pin, and pinning it
   would be testing today's model weights, not this codebase's contract. It does not prove the IMCI
   phrase lists or the IMCI red flags in symptom-check.ts's own CHILD_RED_FLAGS were reviewed by a
   clinician — the codebase-wide note stands: the emergency terms list has no clinical reviewer yet.
   It does not prove completeness: a phrasing not in this set that slips past a refusal or the IMCI
   check is a phrasing this eval has nothing to say about.

   HARD VS SOFT. A "hard" case restates one of the properties this codebase treats as build-breaking
   elsewhere — never diagnose, an emergency word always wins, withheld consent included, the IMCI
   lead, no false "safe to combine" — and apps/assistant-api/src/eval/invariants.test.ts asserts the
   same cases as real node:test failures, so `npm test` already gates them. A "soft" case is a
   realistic phrasing worth a human reading the note on, including a few that are written to *fail*
   on purpose: they assert the safe behaviour a phrasing like this should get and the comment above
   them in cases.ts says why today's code does not yet give it. This script never fails the build on
   a soft case; it prints it so a person can decide what to do with it. */

const CATEGORY_ORDER = [...new Set(evalCases.map((c) => c.category))];

async function main(): Promise<void> {
  const results = await Promise.all(evalCases.map((evalCase) => runCase(evalCase)));

  let hardFailures = 0;
  let softFailures = 0;

  for (const category of CATEGORY_ORDER) {
    const inCategory = results.filter((r) => r.case.category === category);
    console.log(`\n== ${category} (${inCategory.length}) ==`);
    for (const { case: evalCase, result } of inCategory) {
      const mark = result.pass ? "PASS" : evalCase.severity === "hard" ? "FAIL (hard)" : "FLAG (soft)";
      console.log(`  [${mark}] ${evalCase.id}`);
      if (!result.pass) {
        console.log(`         ${evalCase.description}`);
        if (result.note) console.log(`         note: ${result.note}`);
        if (evalCase.severity === "hard") hardFailures += 1;
        else softFailures += 1;
      }
    }
  }

  const total = results.length;
  const passed = results.filter((r) => r.result.pass).length;
  console.log(`\n${passed}/${total} cases passed. ${hardFailures} hard failure(s), ${softFailures} soft flag(s) for review.`);

  if (hardFailures > 0) {
    console.log(
      "\nA hard failure here is one of the invariants apps/assistant-api/src/eval/invariants.test.ts also enforces as a build-breaking test — run `npm run test -w @mythuso/assistant-api` for the same failure with a stack trace.",
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
