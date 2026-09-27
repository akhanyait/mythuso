import test from "node:test";
import assert from "node:assert/strict";
import {
  askWhichReading,
  readingAnswer,
  readingContract,
  readingIn,
  readingLeavesUnread,
  readingName,
  sideOf,
} from "./readings.ts";
import { evaluateMessage } from "./engine.ts";
import { fillerStems, stems } from "./stems.ts";
import assistant from "../../catalog/assistant.json" with { type: "json" };
import records from "../../catalog/records.json" with { type: "json" };
import terms from "../../catalog/gilbert-emergency-terms.json" with { type: "json" };

/* The shared fixtures in packages/catalog/reading-questions.json, run against this package's own
   recogniser the way assistant.json's fixtures are run against every platform's matcher. The web
   runs the same list in Playwright. An "emergency" fixture is asserted through the engine, which
   checks the emergency words before anything else — the recogniser is never asked about a message
   the emergency words already answered, and the fixture says so by never reaching it. */
const readingQuestion = assistant.questions.find((q) => q.answer === "reading");
if (!readingQuestion)
  throw new Error("assistant.json has no question answering with 'reading'");
const triggers = readingQuestion.triggers;

test("every reading fixture in the contract gets the recogniser's expected answer", () => {
  const disagreements: string[] = [];
  for (const fixture of readingContract.fixtures.messages) {
    if (fixture.expect === "emergency") {
      if (evaluateMessage(fixture.says).route !== "emergency")
        disagreements.push(`"${fixture.says}" was not an emergency`);
      continue;
    }
    const match = readingIn(fixture.says);
    if (fixture.expect === "none") {
      if (match) disagreements.push(`"${fixture.says}" matched ${match.measure.id}`);
      continue;
    }
    if (!match) {
      disagreements.push(`"${fixture.says}" matched nothing`);
      continue;
    }
    if (match.measure.id !== fixture.measure)
      disagreements.push(`"${fixture.says}" matched ${match.measure.id}, not ${fixture.measure}`);
    if (match.framing !== fixture.framing)
      disagreements.push(`"${fixture.says}" framed as ${match.framing}, not ${fixture.framing}`);
    if (JSON.stringify(match.values) !== JSON.stringify(fixture.values ?? null))
      disagreements.push(`"${fixture.says}" read ${JSON.stringify(match.values)}`);
    for (const [entry, side] of Object.entries(fixture.sides ?? {}))
      if (sideOf(entry, match.values?.[entry] ?? Number.NaN) !== side)
        disagreements.push(`"${fixture.says}": ${entry} is not ${side}`);
    if (readingLeavesUnread(fixture.says, match, triggers) !== fixture.unread)
      disagreements.push(`"${fixture.says}" unread should be ${fixture.unread}`);
  }
  assert.deepEqual(disagreements, []);
});

test("the answer is the contract's sentences and nothing typed: measures, the paragraph the range points to, the closing", () => {
  const match = readingIn("What does 150 over 95 mean")!;
  const answer = readingAnswer(match);
  const systolic = records.explanations.entries.find((e) => e.id === "systolic")!;
  const diastolic = records.explanations.entries.find((e) => e.id === "diastolic")!;
  assert.equal(answer.heading, "Blood pressure");
  assert.ok(answer.paragraphs[0].includes("150 over 95"));
  assert.ok(answer.paragraphs.includes(systolic.measures));
  assert.ok(answer.paragraphs.includes(diastolic.measures));
  assert.ok(answer.paragraphs.includes(systolic.above));
  assert.ok(answer.paragraphs.includes(diastolic.above));
  assert.ok(answer.paragraphs.includes(systolic.whatToDo));
  /* The other side is never read for a number on this side. */
  assert.ok(!answer.paragraphs.includes(systolic.below));
  assert.equal(
    answer.paragraphs[answer.paragraphs.length - 1],
    records.explanations.provenance.whoDecides,
  );
  assert.deepEqual(answer.smallPrint, [
    records.explanations.provenance.written,
    records.explanations.provenance.unreviewed,
    records.explanations.provenance.ranges,
  ]);
});

test("a number inside the range reads neither paragraph and says so, without grading it", () => {
  const answer = readingAnswer(readingIn("is my sugar of 7.2 okay?")!);
  const glucose = records.explanations.entries.find((e) => e.id === "glucose")!;
  assert.ok(answer.paragraphs.includes(glucose.measures));
  assert.ok(!answer.paragraphs.includes(glucose.above));
  assert.ok(!answer.paragraphs.includes(glucose.below));
  assert.ok(!answer.paragraphs.includes(glucose.whatToDo));
  const inside = answer.paragraphs.find((p) => p.includes("7.2") && p.includes("Blood glucose"));
  assert.ok(inside, "the inside-range sentence names the label and her own number");
  for (const paragraph of answer.paragraphs)
    assert.ok(!/\b(normal|abnormal)\b/i.test(paragraph), paragraph);
});

test("with no number the answer says so and asks for one, and the ranges small print is left out", () => {
  const answer = readingAnswer(readingIn("what is SpO2?")!);
  assert.equal(answer.heading, "Oxygen saturation");
  assert.equal(answer.paragraphs[0], readingContract.answer.noValue);
  assert.deepEqual(answer.smallPrint, [
    records.explanations.provenance.written,
    records.explanations.provenance.unreviewed,
  ]);
});

test("the chip with no words asks which reading, naming every measure from the contract", () => {
  const sentence = askWhichReading();
  for (const measure of readingContract.measures)
    assert.ok(sentence.includes(readingName(measure)), readingName(measure));
});

test("no alias and no read word is an emergency word, and no answer sentence carries a digit", () => {
  const emergency = new Set(terms.groups.flatMap((g) => g.words.map((w) => stems(w).join(" "))));
  for (const measure of readingContract.measures)
    for (const alias of measure.aliases)
      assert.ok(!emergency.has(stems(alias).join(" ")), alias);
  for (const word of readingContract.readWords)
    assert.ok(!emergency.has(stems(word).join(" ")), word);
  for (const [key, sentence] of Object.entries(readingContract.answer))
    if (typeof sentence === "string" && !key.endsWith("From") && key !== "why")
      assert.ok(!/\d/.test(sentence), `${key} carries a digit`);
});

test("the contract's stem fixtures pass this package's stemmer too", () => {
  for (const fixture of assistant.fixtures.stems)
    assert.deepEqual(stems(fixture.says), fixture.stems, fixture.says);
  assert.ok(fillerStems.has("pleas"));
});
