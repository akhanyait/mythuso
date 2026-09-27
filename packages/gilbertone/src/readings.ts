import contract from "../../catalog/reading-questions.json" with { type: "json" };
import records from "../../catalog/records.json" with { type: "json" };
import { fillerStems, hasSequence, stem, stems, tokens } from "./stems.ts";

/* The spoken reading explanation — the founder's ask of 27 September 2026, answered from contracts
   and never from a fresh clinical judgement.

   WHAT THIS RECOGNISES. A measure a person names, in the words of packages/catalog/reading-questions.json
   — "blood pressure", "bp", "sugar", "SpO2" — matched on stems the way a trigger phrase is, so
   "sugars" and "readings" match; or, with no measure named, a pair of numbers written the way a cuff
   writes them, which is blood pressure whether or not anybody said so. And the numbers themselves,
   read from the message as typed rather than from the folded stems, because the matcher turns 136/85
   and 7.2 into four unrelated tokens.

   WHAT IT DOES WITH A NUMBER, AND WHAT IT WILL NOT. A number is set against the observations range in
   packages/catalog/records.json for one purpose: to choose which of the written paragraphs applies —
   the one written for a reading above the range, the one written for below, or neither. The range is
   never spoken, the number is never graded, and the words "high", "low" and "normal" are never said
   about it: the classification in this file is which paragraph to read, and every paragraph was
   written in advance by a person and can be read by a doctor before it ships. The answer ends where
   records.json's provenance ends — a doctor decides what a reading means for a particular person —
   and the small print says no clinician has reviewed the wording yet.

   WHAT IT DOES NOT DECIDE. Whether a message is an emergency. The caller runs the emergency words
   first, and a match ends the matching; this module is only ever asked afterwards. It also does not
   decide whether the reading question wins over another question in the same message — the caller's
   longest-trigger rule does, with `matchedWords` as this recogniser's length. No network, no model,
   no environment variable. */

export type ReadingMeasure = (typeof contract.measures)[number];
export type ReadingSide = "above" | "below" | "inside";
export type ReadingFraming =
  | "readValue"
  | "noValue"
  | "pairNeeded"
  | "tooManyNumbers";

export type ReadingMatch = {
  measure: ReadingMeasure;
  /* How many stems the longest matching alias has — the reading question's trigger length in the
     caller's longest-wins rule — or 0 when only a pair of numbers found the measure. */
  matchedWords: number;
  /* The person's numbers, by the records.json entry each belongs to; null when none could be read. */
  values: Record<string, number> | null;
  /* Which framing sentence the answer opens with. */
  framing: ReadingFraming;
  /* The number as she typed it, for {value}: "136/85", "150 over 95", "7,2". */
  said: string | null;
};

type Explanation = (typeof records.explanations.entries)[number];
type Observation = (typeof records.observations.measures)[number];

const explanationOf = (id: string): Explanation => {
  const found = records.explanations.entries.find((e) => e.id === id);
  if (!found)
    throw new Error(
      `packages/catalog/reading-questions.json explains "${id}", which packages/catalog/records.json has no explanation for.`,
    );
  return found;
};
const observationOf = (id: string): Observation => {
  const found = records.observations.measures.find((m) => m.id === id);
  if (!found)
    throw new Error(
      `packages/catalog/reading-questions.json explains "${id}", which packages/catalog/records.json has no observation for.`,
    );
  return found;
};

/* The patterns are the contract's own, compiled once. The pair carries two capture groups; the
   single is read with /g over the whole message. */
const pairPattern = new RegExp(contract.numbers.pairPattern, "i");
const singlePattern = new RegExp(contract.numbers.singlePattern, "gi");
const pairMeasure = contract.measures.find((m) => m.pairOfNumbers);

/* The measure a message names, by the longest alias found (stems, adjacent); or the pair measure
   when a pair of numbers is written and no measure is named; or nothing. */
export function readingIn(text: string): ReadingMatch | null {
  const said = stems(text);
  let measure: ReadingMeasure | null = null;
  let matchedWords = 0;
  for (const candidate of contract.measures)
    for (const alias of candidate.aliases) {
      const term = stems(alias);
      if (term.length > matchedWords && hasSequence(said, term, 0)) {
        measure = candidate;
        matchedWords = term.length;
      }
    }
  const pair = pairPattern.exec(text);
  if (!measure) {
    if (!pair || !pairMeasure) return null;
    measure = pairMeasure;
  }
  if (measure.pairOfNumbers) {
    if (pair) {
      const [systolic, diastolic] = measure.explains;
      return {
        measure,
        matchedWords,
        values: { [systolic]: Number(pair[1]), [diastolic]: Number(pair[2]) },
        framing: "readValue",
        said: pair[0].trim(),
      };
    }
    const singles = text.match(singlePattern) ?? [];
    return {
      measure,
      matchedWords,
      values: null,
      framing: singles.length ? "pairNeeded" : "noValue",
      said: null,
    };
  }
  const singles = text.match(singlePattern) ?? [];
  if (singles.length === 1) {
    const [entry] = measure.explains;
    return {
      measure,
      matchedWords,
      values: { [entry]: Number(singles[0].replace(",", ".")) },
      framing: "readValue",
      said: singles[0],
    };
  }
  return {
    measure,
    matchedWords,
    values: null,
    framing: singles.length ? "tooManyNumbers" : "noValue",
    said: null,
  };
}

/* Which side of the indicative range a number sits, by records.json's own inclusive low and high.
   The only arithmetic in this module, and it chooses a paragraph rather than a word. */
export function sideOf(entryId: string, value: number): ReadingSide {
  const spec = observationOf(entryId);
  if (value < spec.low) return "below";
  if (value > spec.high) return "above";
  return "inside";
}

const fill = (sentence: string, values: Record<string, string>) =>
  sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/* A measure's name for a heading: the pair's own, or the observations label of its one entry. */
export const readingName = (measure: ReadingMeasure): string =>
  (measure as { name?: string }).name ?? observationOf(measure.explains[0]).label;

const measureNames = () => {
  const names = contract.measures.map(readingName);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
    : (names[0] ?? "");
};

export type ReadingAnswer = {
  heading: string;
  paragraphs: string[];
  smallPrint: string[];
};

const provenance = records.explanations.provenance as Record<string, string>;

/* The answer, in the order it is read: the framing sentence, what each entry measures, then — with
   a number — for each entry the paragraph the range points to or the sentence saying neither
   applies, what to do if anything sat outside, and the contract's closing. */
export function readingAnswer(match: ReadingMatch): ReadingAnswer {
  const words = contract.answer;
  const entries = match.measure.explains.map(explanationOf);
  const paragraphs: string[] = [];
  paragraphs.push(fill(words[match.framing], { value: match.said ?? "" }));
  for (const entry of entries) paragraphs.push(entry.measures);
  const outside: Explanation[] = [];
  if (match.values) {
    for (const entry of entries) {
      const value = match.values[entry.id];
      if (value === undefined) continue;
      const side = sideOf(entry.id, value);
      const tokensFor = {
        label: observationOf(entry.id).label,
        value: String(value),
      };
      if (side === "inside") paragraphs.push(fill(words.insideRange, tokensFor));
      else {
        paragraphs.push(fill(words.outsideRange, tokensFor), entry[side]);
        outside.push(entry);
      }
    }
    for (const entry of outside) paragraphs.push(entry.whatToDo);
  }
  paragraphs.push(provenance[words.closingFrom]);
  const smallPrint = words.smallPrintFrom.map((key) => provenance[key]);
  if (match.values) smallPrint.push(provenance[words.smallPrintWithValueFrom]);
  return { heading: readingName(match.measure), paragraphs, smallPrint };
}

/* The answer to the reading question pressed as a chip, with no words to read a measure from. */
export const askWhichReading = (): string =>
  fill(contract.answer.askWhich, { measures: measureNames() });

/* The unread rule for a reading question: a token is read when it is filler, one of the reading
   question's own trigger words, one of the measure's alias words, one of the contract's readWords,
   or — for this question alone — a number. */
const readWordStems = new Set(contract.readWords.map(stem));
export function readingLeavesUnread(
  text: string,
  match: ReadingMatch,
  triggers: readonly string[],
): boolean {
  const covered = new Set<string>([
    ...fillerStems,
    ...readWordStems,
    ...match.measure.aliases.flatMap(stems),
    ...triggers.flatMap(stems),
  ]);
  return tokens(text).some(
    (word) =>
      !(contract.numbers.countedAsRead && /^\d+$/.test(word)) &&
      !covered.has(stem(word)),
  );
}

export const readingContract = contract;
