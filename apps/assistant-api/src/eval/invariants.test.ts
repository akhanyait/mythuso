import test from "node:test";
import assert from "node:assert/strict";
import { evalCases } from "./cases.ts";
import { runCase } from "./harness.ts";

/* The subset of the GilbertOne eval set (cases.ts) marked severity: "hard" — never diagnose, an
   emergency word always wins except over withheld consent, the IMCI danger-sign lead, a "no record"
   answer never reading as "safe to combine" — run here as ordinary node:test assertions, so `npm
   test` already fails the build on any of them the same way scripts/check-boundaries.mjs fails it on
   an arithmetic or contract invariant elsewhere in this codebase. The full set, including the "soft"
   close calls this file does not gate on, runs via `npm run eval:gilbertone` (run-eval.ts) — see
   that file's header for what a pass here does and does not prove. */

const hardCases = evalCases.filter((evalCase) => evalCase.severity === "hard");

/* A build that ever drops every hard case to zero would still show "0 tests failed" — this guards
   the guard, the same reason a boundary check proves its own trigger by breaking the source first. */
test("the hard eval set is not empty", () => {
  assert.ok(hardCases.length > 0, "cases.ts should carry at least one severity: \"hard\" case");
});

for (const evalCase of hardCases) {
  test(`eval (hard): ${evalCase.id} — ${evalCase.description}`, async () => {
    const { result, outcome } = await runCase(evalCase);
    assert.ok(
      result.pass,
      `${result.note ?? "no note"} — reply was: ${JSON.stringify(outcome.reply).slice(0, 400)}`,
    );
  });
}
