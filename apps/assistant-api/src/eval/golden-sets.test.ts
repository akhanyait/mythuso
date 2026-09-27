import test from "node:test";
import assert from "node:assert/strict";
import { isKnownRoute, runAll, sets, tableLines } from "./golden-sets.ts";

/* The golden sets as node:test — see golden-sets.ts for what is run and why the set, not the
   case, decides whether a failure breaks the build. Everything is run once, up front, so the
   table can be printed whole and each set's assertions read the same results. */

const reports = await runAll();

/* A contract that lost its sets, or a set that lost its cases, would print a clean table of
   zeros; this guards the guard, the way invariants.test.ts guards the hard set. */
test("the golden sets carry the founder's four languages, each with cases", () => {
  for (const language of ["en", "zu", "xh", "af"]) {
    const set = sets.find((s) => s.language === language);
    assert.ok(set, `no golden set for ${language}`);
    assert.ok(set.cases.length > 0, `the ${language} golden set is empty`);
  }
  for (const set of sets)
    for (const golden of set.cases)
      assert.ok(isKnownRoute(golden.expect.route), `${golden.id} expects a route this harness does not know: ${golden.expect.route}`);
});

test("golden sets: the per-language table", (t) => {
  for (const line of tableLines(reports)) t.diagnostic(line);
});

for (const report of reports) {
  const { set } = report;
  test(`golden set (${set.language}, ${set.name}): ${report.reviewed ? "reviewed, required" : "unreviewed, reported"}`, (t) => {
    t.diagnostic(
      `${set.language}: ${report.passed}/${report.results.length} passed, ${report.failed.length} failed, ${report.languageDetected}/${report.results.length} read as ${set.language} by the language detector`,
    );
    /* The emergency exception: a listed term was in the message and the service did not raise.
       That is the matcher's miss whatever a reviewer says about the words around it. */
    assert.equal(
      report.emergencyMissesWithListedTerm.length,
      0,
      `the service missed an emergency whose message carries a term gilbert-emergency-terms.json lists: ${report.emergencyMissesWithListedTerm
        .map((f) => `${f.case.id} (lists "${f.listedTerm}", ${f.note})`)
        .join("; ")}`,
    );
    if (!report.reviewed) return;
    assert.equal(
      report.failed.length,
      0,
      `the ${set.language} golden set is reviewed by ${set.reviewedBy} and the service fails: ${report.failed
        .map((f) => `${f.case.id} expected ${f.case.expect.route}, ${f.note}`)
        .join("; ")}`,
    );
  });
}
