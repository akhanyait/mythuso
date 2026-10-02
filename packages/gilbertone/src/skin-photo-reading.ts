import contract from "../../catalog/skin-check.json" with { type: "json" };
import type { SkinAnswers } from "./skin-check.ts";

/* The skin check's photo reader, the part every side of it must agree on — 2 October 2026, under the
   founder's demonstration override. The assistant service (its lib/photo-reading.ts) checks the
   model's answer with it, and the web screen asks it what to refuse before anything leaves the phone and
   how a confirmed word becomes an answer. One reading of packages/catalog/skin-check.json#photoReading, so
   the vocabulary the model is held to and the vocabulary the patient confirms cannot drift apart.

   THE MODEL DESCRIBES AND THE RULES DECIDE. A reading is an outcome and two lists of option ids the
   check already asks her about — what the skin looks like, and where on the body — and nothing else: no
   word of the model's own, no condition, no outcome of the check. validateReading() throws away anything
   that is not exactly that, whole, rather than trimming it to fit: a model that wrote outside the list
   once has told us nothing we can trust. The ids reach her answers only through confirmReading(), with
   the ones she confirmed, and the skin check's own rules (./skin-check.ts) read her answers as they
   always did. The signs question is never in the vocabulary, so a reading can never raise, lower or
   stand in for an emergency rule or a rule for today.

   WHAT IS REFUSED BEFORE ANYTHING LEAVES. Who the rash is on, answered first, because a picture of a baby
   younger than three months is never sent — the check's own rule sends that rash to a sister today
   whatever it looks like; and where it is, because a picture of the face, the groin or the nappy area is
   refused rather than described.

   Pure and immutable, like the rest of this package: no network, no model, no environment, no storage. */

export const photoReading = contract.photoReading;

export type ReadingOutcome = "described" | "unclear" | "not-skin" | "private-or-face";
export type PhotoReading = {
  readonly outcome: ReadingOutcome;
  readonly looks: readonly string[];
  readonly where: readonly string[];
};
export type Suggested = { readonly looks: readonly string[]; readonly where: readonly string[] };

const optionsOf = (question: string, except: readonly string[]): readonly string[] =>
  (contract.questions.find((q) => q.id === question)?.options ?? []).map((o) => o.id).filter((id) => !except.includes(id));

/* The ids the model may answer with, in the contract's own order. */
export const readingVocabulary = {
  looks: optionsOf(photoReading.vocabulary.looks.question, photoReading.vocabulary.looks.except),
  where: optionsOf(photoReading.vocabulary.where.question, photoReading.vocabulary.where.except),
  outcomes: photoReading.vocabulary.outcomes as readonly ReadingOutcome[],
} as const;

/* The contract's own label for an option, the only way a suggested word is ever shown. */
export const optionLabel = (question: "looks" | "where", id: string): string =>
  contract.questions.find((q) => q.id === question)?.options?.find((o) => o.id === id)?.label ?? "";

/* The model's whole brief, its two lists filled from the vocabulary — id and label, so it can tell what
   each id means — and nothing added. */
export const readingInstructions = (): string =>
  photoReading.instructions
    .replace("{looks}", readingVocabulary.looks.map((id) => `${id} (${optionLabel("looks", id)})`).join(", "))
    .replace("{where}", readingVocabulary.where.map((id) => `${id} (${optionLabel("where", id)})`).join(", "));

const idList = (value: unknown, allowed: readonly string[], max: number): string[] | null => {
  if (!Array.isArray(value) || value.length > max) return null;
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !allowed.includes(id) || seen.has(id)) return null;
    seen.add(id);
  }
  return [...seen];
};

/* One JSON object with exactly the three keys, every value from the contract, a described outcome seeing
   at least one thing and any other outcome seeing nothing — or null, and the whole answer is dropped. */
export function validateReading(value: unknown): PhotoReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join() !== "looks,outcome,where") return null;
  const record = value as Record<string, unknown>;
  const outcome = record.outcome;
  if (typeof outcome !== "string" || !readingVocabulary.outcomes.includes(outcome as ReadingOutcome)) return null;
  const looks = idList(record.looks, readingVocabulary.looks, photoReading.vocabulary.maxLooks);
  const where = idList(record.where, readingVocabulary.where, readingVocabulary.where.length);
  if (!looks || !where) return null;
  if (outcome === "described" ? looks.length === 0 : looks.length + where.length > 0) return null;
  return { outcome: outcome as ReadingOutcome, looks, where };
}

/* The model's text, parsed and held to the contract, or null. */
export function readingFromText(text: string): PhotoReading | null {
  try {
    return validateReading(JSON.parse(text));
  } catch {
    return null;
  }
}

/* Why the look is refused on the phone before anything is sent, in the contract's words, or null. */
export function askRefusedLocally(answers: SkinAnswers): string | null {
  const who = answers.who ?? [];
  if (!who.length) return photoReading.local.whoFirst;
  if (who.includes("young-baby")) return photoReading.local.youngBaby;
  if ((answers.where ?? []).some((id) => photoReading.vocabulary.where.except.includes(id))) return photoReading.local.privateArea;
  return null;
}

/* Her answers with the words she confirmed added to the looks and where she had already chosen. Only ids
   the vocabulary lists survive, so nothing else can be carried into the rules this way. */
export function confirmReading(answers: SkinAnswers, confirmed: Suggested): SkinAnswers {
  const merge = (question: "looks" | "where", allowed: readonly string[], ids: readonly string[]) => {
    const kept = (answers[question] ?? []).slice();
    for (const id of ids) if (allowed.includes(id) && !kept.includes(id)) kept.push(id);
    return kept;
  };
  return {
    ...answers,
    looks: merge("looks", readingVocabulary.looks, confirmed.looks),
    where: merge("where", readingVocabulary.where, confirmed.where),
  };
}

/* The sentence saying where the picture goes, with the processor and region the status route named. */
export const lookGoes = (processor: string, region: string): string =>
  photoReading.words.goes.replaceAll("{processor}", processor).replaceAll("{region}", region);

/* What the check says it is not, with the first sentence — that nothing looks at the photo — replaced
   while the reader is offered, because it would no longer be true. */
export const whatItIsNotShown = (offered: boolean): readonly string[] =>
  offered ? contract.whatItIsNot.map((sentence, i) => (i === 0 ? photoReading.offered.whatItIsNot : sentence)) : contract.whatItIsNot;
