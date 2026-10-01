import test from "node:test";
import assert from "node:assert/strict";
import {
  askWhichReading,
  farSideOf,
  isFarOutside,
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
import sos from "../../catalog/sos.json" with { type: "json" };

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
    if ("far" in fixture && isFarOutside(match) !== fixture.far)
      disagreements.push(`"${fixture.says}" far should be ${fixture.far}`);
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

/* The far-outside answer of 1 October 2026: 240/140 was answered with the paragraph about coffee, and
   an oxygen of 80 with the one about cold hands. Past each bound in farOutside.bounds the answer is
   the urgent one, built from the emergency answer's numbers, and none of the everyday sentences is in
   it — for every entry and every side that has a bound, at the bound itself when it is inclusive. */
const everyday = [
  ...records.explanations.entries.flatMap((e) => [e.above, e.below, e.whatToDo]),
  readingContract.answer.insideRange,
  readingContract.answer.outsideRange,
];
const sentencesOf = (answer: ReturnType<typeof readingAnswer>) => [
  ...answer.paragraphs,
  ...(answer.urgent ? [answer.urgent.ifUnwell, ...answer.urgent.signs] : []),
  ...answer.after,
];

test("past every far-outside bound the answer is urgent, and no everyday sentence is read", () => {
  const bounds = readingContract.farOutside.bounds as Record<
    string,
    Record<"below" | "above", { value: number | null; inclusive?: boolean }>
  >;
  for (const measure of readingContract.measures)
    for (const entry of measure.explains)
      for (const side of ["below", "above"] as const) {
        const bound = bounds[entry][side];
        if (bound.value === null) continue;
        const step = side === "below" ? -1 : 1;
        const value = bound.inclusive ? bound.value : bound.value + step;
        assert.equal(farSideOf(entry, value), side, `${entry} ${value}`);
        const values = Object.fromEntries(
          measure.explains.map((id) => {
            const spec = records.observations.measures.find((m) => m.id === id)!;
            return [id, id === entry ? value : (spec.low + spec.high) / 2];
          }),
        );
        const answer = readingAnswer({ measure, matchedWords: 1, values, framing: "readValue", said: String(value) });
        assert.ok(answer.urgent, `${entry} ${value} has no urgent block`);
        assert.deepEqual(answer.urgent.numbers, assistant.answers.emergency.numbers);
        assert.equal(answer.urgent.ifUnwell, readingContract.answer.farIfUnwell);
        for (const sentence of sentencesOf(answer))
          assert.ok(!everyday.includes(sentence), `${entry} ${value} read "${sentence.slice(0, 50)}…"`);
        assert.ok(!answer.paragraphs.some((p) => p.startsWith(readingContract.answer.readValue.slice(0, 20))));
        assert.equal(answer.after.at(-1), records.explanations.provenance.whoDecides);
        assert.ok(answer.smallPrint.includes(readingContract.answer.farUnreviewed));
      }
});

test("240/140 and oxygen 80 are answered urgently, with the red flags records.json names for them", () => {
  const pressure = readingAnswer(readingIn("my bp is 240/140")!);
  assert.ok(pressure.paragraphs[0].includes("240/140"));
  const named = (id: string) => sos.redFlags.conditions.find((c) => c.id === id)!.name;
  assert.deepEqual(pressure.urgent?.signs, ["chest-pain", "stroke"].map(named));
  const systolic = records.explanations.entries.find((e) => e.id === "systolic")!;
  assert.ok(!sentencesOf(pressure).includes(systolic.above));
  const oxygen = readingAnswer(readingIn("oxygen 80")!);
  const ox = records.explanations.entries.find((e) => e.id === "oxygen")!;
  assert.ok(oxygen.urgent);
  assert.ok(!sentencesOf(oxygen).includes(ox.below));
  /* 185/95: one number past its bound makes the pair far, and the diastolic's own everyday
     paragraph is not read either. */
  const one = readingAnswer(readingIn("185/95")!);
  const diastolic = records.explanations.entries.find((e) => e.id === "diastolic")!;
  assert.ok(one.urgent);
  assert.ok(!sentencesOf(one).includes(diastolic.above));
});

test("a number inside the range or a little outside it is answered as before, with no urgent block", () => {
  for (const says of ["what does 120/80 mean", "What does 150 over 95 mean", "is a pulse of 110 too high"]) {
    const answer = readingAnswer(readingIn(says)!);
    assert.equal(answer.urgent, null, says);
    assert.deepEqual(answer.after, [], says);
  }
});

test("a date is not a blood pressure: an implausible bare pair is not read, and a named measure prefers the plausible pair", () => {
  for (const says of ["20/09", "15/10", "see you on 30/06", "12/10/2026"])
    assert.equal(readingIn(says), null, says);
  assert.deepEqual(readingIn("my bp on 20/09 was 150/95")?.values, { systolic: 150, diastolic: 95 });
  /* Named, and nothing plausible beside it: read, and past the bound, so urgent rather than ignored. */
  const named = readingIn("my bp is 20/09")!;
  assert.ok(isFarOutside(named));
});

test("the readValue opening no longer says it does not grade beside a sentence that places the number", () => {
  assert.ok(!/do not grade/i.test(readingContract.answer.readValue));
});

/* The intake's reading step (2 October 2026) reads the pair a patient types off her cuff with this
   recogniser and answers a far-outside one with this answer, then hands the pair to the case pathway.
   The two must agree on where "far" starts at the top, or the panel would send her to an ambulance for
   a pair the pathway calls merely above — or reassure her with silence for one it calls very high. The
   pathway's very-high line is the one pair cond-008's sentence gives (case.json cites it); the
   far-outside bounds are reading-questions.json's. Each is inclusive, so the line itself is far. */
test("a pair typed at the intake's cuff step is far exactly where the case pathway's very-high line starts", async () => {
  const caseContract = (await import("../../catalog/case.json", { with: { type: "json" } })).default;
  const conditions = (await import("../../catalog/knowledge/conditions.json", { with: { type: "json" } })).default as { id: string; [field: string]: unknown }[];
  const [file, path] = caseContract.pathway.bands["very-high"].from.split("#");
  assert.equal(file, "packages/catalog/knowledge/conditions.json");
  const [conditionId, field] = path.split(".");
  const sentence = conditions.find((c) => c.id === conditionId)?.[field] as string;
  const pairs = [...sentence.matchAll(/(?<![a-z0-9])(\d{2,3})\s*\/\s*(\d{2,3})(?![a-z0-9])/gi)];
  assert.equal(pairs.length, 1);
  const line = { systolic: Number(pairs[0][1]), diastolic: Number(pairs[0][2]) };
  assert.equal(farSideOf("systolic", line.systolic), "above");
  assert.equal(farSideOf("systolic", line.systolic - 1), null);
  assert.equal(farSideOf("diastolic", line.diastolic), "above");
  assert.equal(farSideOf("diastolic", line.diastolic - 1), null);
  /* As she types it at the cuff step: a slash or "over", bare, no measure named. */
  for (const says of ["240/140", "240 over 140", `${line.systolic}/90`, `150 over ${line.diastolic}`, "85/50"]) {
    const match = readingIn(says);
    assert.ok(match?.measure.pairOfNumbers, says);
    assert.ok(isFarOutside(match!), says);
    assert.ok(readingAnswer(match!).urgent, says);
  }
  for (const says of ["168 over 104", `${line.systolic - 1}/${line.diastolic - 1}`, "120/80"])
    assert.equal(readingAnswer(readingIn(says)!).urgent, null, says);
});
