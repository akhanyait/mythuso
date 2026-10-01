import test from "node:test";
import assert from "node:assert/strict";
import {
  pressSkinOption,
  skinContract,
  skinEmergency,
  skinOutcome,
  skinReviewSentence,
  skinSummaryRows,
  type SkinAnswers,
} from "./skin-check.ts";
import { hasSequence, stems } from "./stems.ts";
import terms from "../../catalog/gilbert-emergency-terms.json" with { type: "json" };
import assistant from "../../catalog/assistant.json" with { type: "json" };

/* The shared fixtures in packages/catalog/skin-check.json, run against this package's reading of the
   rules — never a typed copy of them. The phones run the same list in their own arithmetic; a fixture
   marked web is decided by the escalation ruleset, which only this package carries, and runs here. */
test("every skin-check fixture reaches the outcome, the rules and the entries the contract expects", () => {
  const disagreements: string[] = [];
  for (const fixture of skinContract.fixtures.cases) {
    const outcome = skinOutcome(fixture.answers as unknown as SkinAnswers, ("typed" in fixture && fixture.typed) || "");
    if (outcome.kind !== fixture.expect) {
      disagreements.push(`${fixture.name}: ${outcome.kind}, expected ${fixture.expect}`);
      continue;
    }
    if ("rules" in fixture && fixture.rules) {
      const rules = outcome.kind === "emergency" ? outcome.rules : outcome.kind === "sister-today" ? outcome.rules.map((r) => r.id) : [];
      if (JSON.stringify(rules) !== JSON.stringify(fixture.rules)) disagreements.push(`${fixture.name}: rules ${rules}, expected ${fixture.rules}`);
    }
    if ("conditions" in fixture && fixture.conditions && outcome.kind === "general-information") {
      const ids = outcome.conditions.map((c) => c.id);
      if (JSON.stringify(ids) !== JSON.stringify(fixture.conditions)) disagreements.push(`${fixture.name}: conditions ${ids}, expected ${fixture.conditions}`);
    }
    if ("checkFirst" in fixture && fixture.checkFirst && outcome.kind === "general-information") {
      const ids = outcome.checkFirst.map((f) => f.id);
      if (JSON.stringify(ids) !== JSON.stringify(fixture.checkFirst)) disagreements.push(`${fixture.name}: checkFirst ${ids}, expected ${fixture.checkFirst}`);
    }
  }
  assert.deepEqual(disagreements, []);
});

/* The coordinator's case of 1 October 2026: a rash with swelling lips is an emergency before it is
   anything else, through the escalation ruleset, though no emergency term carries it. */
test("a rash with swelling lips typed into the notes is an emergency, whatever the chips say", () => {
  const outcome = skinOutcome({ who: ["self"], looks: ["welts"], signs: ["none"] }, "I have a rash and my lips are swelling");
  assert.equal(outcome.kind, "emergency");
  assert.equal(skinEmergency("my rash is itchy"), false);
});

/* An emergency rule hands over words the conversation's own matcher raises — the emergency terms by
   the same stem-and-gap rule the panel and both phones use — so the emergency answer is the
   conversation's, never one the check composed. */
test("an emergency rule hands over an option label the emergency terms already raise", () => {
  for (const rule of skinContract.rules.filter((r) => r.outcome === "emergency")) {
    const outcome = skinOutcome({ [rule.when[0].question]: [rule.when[0].anyOf[0]] });
    assert.equal(outcome.kind, "emergency", rule.id);
    if (outcome.kind !== "emergency") continue;
    const said = stems(outcome.says);
    const raised = terms.groups.some((g) => g.words.some((w) => hasSequence(said, stems(w), assistant.matcher.maxGap)));
    assert.ok(raised, `${rule.id} hands over "${outcome.says}", which no emergency term raises`);
  }
});

test("general information never names a single entry when anything was described", () => {
  const looks = skinContract.questions.find((q) => q.id === "looks")!;
  for (const option of ("options" in looks ? looks.options : []) as { id: string; oftenSeenIn?: string[] }[]) {
    if (!option.oftenSeenIn) continue;
    const outcome = skinOutcome({ who: ["self"], signs: ["none"], looks: [option.id] });
    assert.equal(outcome.kind, "general-information");
    if (outcome.kind === "general-information") assert.ok(outcome.conditions.length >= 2, option.id);
  }
});

test("None of these clears the signs and a sign clears None of these; a chip pressed twice clears", () => {
  let answers: SkinAnswers = {};
  answers = pressSkinOption(answers, "signs", "burn");
  answers = pressSkinOption(answers, "signs", "none");
  assert.deepEqual(answers.signs, ["none"]);
  answers = pressSkinOption(answers, "signs", "burn");
  assert.deepEqual(answers.signs, ["burn"]);
  answers = pressSkinOption(answers, "who", "self");
  answers = pressSkinOption(answers, "who", "self");
  assert.deepEqual(answers.who, []);
});

test("the notes carry each answer beside its question and the photo line, never the photo", () => {
  const rows = skinSummaryRows({ who: ["self"], looks: ["welts", "dots"], signs: ["none"] }, "a new soap", true);
  assert.deepEqual(rows.map((r) => r.value), ["On me", "Raised bumps or welts, Small dots or pin-pricks", "None of these", "a new soap", skinContract.summary.photoLine]);
  assert.equal(skinReviewSentence(), skinContract.review.unreviewed);
});
