import contract from "../../catalog/skin-check.json" with { type: "json" };
import assistant from "../../catalog/assistant.json" with { type: "json" };
import emergencyTerms from "../../catalog/gilbert-emergency-terms.json" with { type: "json" };
import conditions from "../../catalog/knowledge/conditions.json" with { type: "json" };
import firstAid from "../../catalog/knowledge/first-aid.json" with { type: "json" };
import { intakeEmergency } from "./intake.ts";
import { hasSequence, stems } from "./stems.ts";

/* Show GilbertOne a rash — the founder's ask of 1 October 2026, answered from
   packages/catalog/skin-check.json and the knowledge entries it names, and from nothing else.

   WHAT THIS IS. The arithmetic behind the check: which outcome a set of answers reaches, which
   knowledge entries that outcome shows, and the notes a patient carries to the visit. Three
   outcomes, decided only by the contract's rules — the conversation's emergency answer, a sign that
   public first-aid guidance says should be seen today, or general information about rashes that
   look like hers. The photo and the clip are not here and never could be: this package has no way to
   read either, and each lives with the screen on its platform until the check ends.

   THE ORDER IS THE SAFETY PROPERTY, as it is for the intake. Words she typed are asked of the
   emergency matcher before anything else reads them — the emergency terms by the conversation's own
   stem-and-gap rule, and then the escalation ruleset by way of intakeEmergency, so "my lips are
   swelling" reaches the emergency answer even though no emergency term carries it. The emergency
   rules come next, before the check asks whether the required questions are answered: a ticked
   "trouble breathing" is an emergency whatever else is blank. Then the rules for a sign to be seen
   today, and general information last.

   WHAT IT IS NOT. A diagnosis or a triage. No outcome names her rash: general information lists the
   entries rashes like this are often, never fewer than two when she described anything (the build
   refuses an option that names fewer), each with the entry's own when-to-ask-a-sister line, and the
   contract's sentence that only a nurse or doctor who sees it can say. A rule for today reads the
   knowledge base's own guidance back to her; it sets no priority and chooses no care setting.

   Pure and immutable, like the intake: no network, no model, no environment variable, no storage. */

export type SkinQuestion = (typeof contract.questions)[number];
export type SkinRule = (typeof contract.rules)[number];
export type SkinOutcomeKind = "emergency" | "sister-today" | "general-information" | "incomplete";

/* Answers by question id: the option ids chosen (one for a chips question, any number for a multi
   question). The free-text answer is carried beside them, never inside, because it is the one
   answer that has to pass the emergency matcher before anything reads it. */
export type SkinAnswers = Readonly<Record<string, readonly string[]>>;

export type ConditionEntry = (typeof conditions)[number];
export type FirstAidEntry = (typeof firstAid)[number];
type Review = { reviewedBy: string | null } | undefined;

export type ShownCondition = {
  id: string;
  title: string;
  /* How the entry says it often looks, in its own words. */
  looks: readonly string[];
  /* The entry's own line on when to see somebody, read under "When to ask a sister". */
  when: string;
  source: string;
  reviewedBy: string | null;
};
export type ShownFirstAid = {
  id: string;
  title: string;
  steps: readonly string[];
  warnings: readonly string[];
  whenToCall: string;
  source: string;
  reviewedBy: string | null;
};
export type RaisedRule = {
  id: string;
  says: string;
  /* The guidance the rule draws on: each entry's title and the line in it that says when to be
     seen — a condition's whenToSeeDoctor, a first-aid entry's whenToCall. */
  guidance: readonly { id: string; title: string; line: string; source: string; reviewedBy: string | null }[];
  keptBecause: string | null;
};

export type SkinOutcome =
  /* The conversation renders it: `says` is what is handed over as the asked words. */
  | { kind: "emergency"; says: string; rules: readonly string[]; from: "typed" | "rule" }
  | { kind: "incomplete"; missing: readonly string[] }
  | { kind: "sister-today"; rules: readonly RaisedRule[] }
  | {
      kind: "general-information";
      conditions: readonly ShownCondition[];
      checkFirst: readonly ShownFirstAid[];
      selfCare: readonly ShownFirstAid[];
    };

export type SkinSummaryRow = { label: string; value: string; line: string };

const fill = (sentence: string, values: Record<string, string>) =>
  sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

const reviewOf = (entry: object): string | null =>
  ((entry as { review?: Review }).review?.reviewedBy as string | null | undefined) ?? null;

const conditionById = (id: string): ConditionEntry => {
  const entry = conditions.find((c) => c.id === id);
  /* Loud rather than blank: an id nothing declares is a contract that names an entry the knowledge
     base does not have, and the build refuses it before this could run. */
  if (!entry) throw new Error(`packages/catalog/skin-check.json names ${id}, which packages/catalog/knowledge/conditions.json does not have.`);
  return entry;
};
const firstAidById = (id: string): FirstAidEntry => {
  const entry = firstAid.find((f) => f.id === id);
  if (!entry) throw new Error(`packages/catalog/skin-check.json names ${id}, which packages/catalog/knowledge/first-aid.json does not have.`);
  return entry;
};

const shownCondition = (id: string): ShownCondition => {
  const c = conditionById(id);
  return { id, title: c.title, looks: c.symptoms, when: c.whenToSeeDoctor, source: c.source.authority, reviewedBy: reviewOf(c) };
};
const shownFirstAid = (id: string): ShownFirstAid => {
  const f = firstAidById(id);
  return { id, title: f.title, steps: f.steps, warnings: f.warnings, whenToCall: f.whenToCall, source: f.source.authority, reviewedBy: reviewOf(f) };
};

export const questionOf = (id: string): SkinQuestion => {
  const question = contract.questions.find((q) => q.id === id);
  if (!question) throw new Error(`packages/catalog/skin-check.json has no question "${id}".`);
  return question;
};

type Option = { id: string; label: string; oftenSeenIn?: string[]; checkFirst?: string[] };
const optionsOf = (question: SkinQuestion): readonly Option[] =>
  ("options" in question ? question.options : []) as readonly Option[];
export const optionLabel = (questionId: string, optionId: string): string =>
  optionsOf(questionOf(questionId)).find((o) => o.id === optionId)?.label ?? optionId;

/* Whether typed words are an emergency, asked the way every free answer in GilbertOne is: the
   emergency terms by the conversation's stem-and-gap rule (assistant.json matcher.maxGap), then the
   engine's classifier and the escalation ruleset through the intake's own question. Either says yes
   and it is one. */
export function skinEmergency(text: string): boolean {
  const words = text.trim();
  if (!words) return false;
  const said = stems(words);
  const termed = emergencyTerms.groups.some((group) =>
    group.words.some((w) => hasSequence(said, stems(w), assistant.matcher.maxGap)),
  );
  return termed || intakeEmergency(words);
}

/* A rule holds when every one of its conditions does: the answer to that question includes one of
   the options named. Read identically on all three platforms. */
const holds = (rule: SkinRule, answers: SkinAnswers) =>
  rule.when.every((w) => (answers[w.question] ?? []).some((option) => w.anyOf.includes(option)));

const raised = (rule: SkinRule): RaisedRule => ({
  id: rule.id,
  says: ("says" in rule && rule.says) || "",
  guidance: rule.drawsOn.map((id) => {
    if (id.startsWith("fa-")) {
      const f = firstAidById(id);
      return { id, title: f.title, line: f.whenToCall, source: f.source.authority, reviewedBy: reviewOf(f) };
    }
    const c = conditionById(id);
    return { id, title: c.title, line: c.whenToSeeDoctor, source: c.source.authority, reviewedBy: reviewOf(c) };
  }),
  keptBecause: ("keptBecause" in rule && (rule.keptBecause as string)) || null,
});

/* The entries rashes like this are often: every chosen option's oftenSeenIn, scored by how many of
   the chosen options name the entry, highest first, a tie going to the lower entry id so every
   platform orders them alike; at most maxShown of them. */
function shownConditions(answers: SkinAnswers): ShownCondition[] {
  const score = new Map<string, number>();
  for (const question of contract.questions)
    for (const option of optionsOf(question))
      if ((answers[question.id] ?? []).includes(option.id))
        for (const id of option.oftenSeenIn ?? []) score.set(id, (score.get(id) ?? 0) + 1);
  return [...score.entries()]
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, contract.outcomes["general-information"].maxShown)
    .map(([id]) => shownCondition(id));
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

/* The outcome a set of answers reaches, in the contract's order. */
export function skinOutcome(answers: SkinAnswers, typed = ""): SkinOutcome {
  if (skinEmergency(typed)) return { kind: "emergency", says: typed.trim(), rules: [], from: "typed" };
  for (const rule of contract.rules)
    if (rule.outcome === "emergency" && holds(rule, answers)) {
      /* The option's own label is what is handed over — the words the emergency terms raise. */
      const [first] = rule.when;
      return { kind: "emergency", says: optionLabel(first.question, first.anyOf[0]), rules: [rule.id], from: "rule" };
    }
  const missing = contract.required.filter((id) => !(answers[id] ?? []).length);
  if (missing.length) return { kind: "incomplete", missing };
  const today = contract.rules.filter((rule) => rule.outcome === "sister-today" && holds(rule, answers));
  if (today.length) return { kind: "sister-today", rules: today.map(raised) };
  const shown = shownConditions(answers);
  const chosen = contract.questions.flatMap((q) => optionsOf(q).filter((o) => (answers[q.id] ?? []).includes(o.id)));
  const checkFirst = unique(chosen.flatMap((o) => o.checkFirst ?? []));
  const forCondition = contract.selfCare.forCondition as Record<string, string>;
  const selfCare = unique([
    ...shown.map((c) => forCondition[c.id]).filter((id): id is string => Boolean(id)),
    ...contract.selfCare.always,
  ]).filter((id) => !checkFirst.includes(id));
  return {
    kind: "general-information",
    conditions: shown,
    checkFirst: checkFirst.map(shownFirstAid),
    selfCare: selfCare.map(shownFirstAid),
  };
}

/* Pressing an option, as every platform presses it: a chips question holds one answer and a second
   press of the same option clears it; a multi question toggles, and its exclusive option ("None of
   these") clears the others and is cleared by them. Returns new answers, never edits the old. */
export function pressSkinOption(answers: SkinAnswers, questionId: string, optionId: string): SkinAnswers {
  const question = questionOf(questionId);
  const now = answers[questionId] ?? [];
  let next: string[];
  if (question.kind === "chips") next = now.includes(optionId) ? [] : [optionId];
  else {
    const exclusive = ("exclusive" in question && (question.exclusive as string)) || null;
    if (now.includes(optionId)) next = now.filter((o) => o !== optionId);
    else if (optionId === exclusive) next = [optionId];
    else next = [...now.filter((o) => o !== exclusive), optionId];
  }
  return { ...answers, [questionId]: next };
}

/* The notes for the sister: one row per answered question in the contract's order, the options'
   labels joined, the typed answer as typed, and the photo line when a photo is held and the clip line
   when a clip is — never the photo or the clip. */
export function skinSummaryRows(answers: SkinAnswers, typed = "", photoHeld = false, clipHeld = false): SkinSummaryRow[] {
  const rows: SkinSummaryRow[] = [];
  for (const question of contract.questions) {
    const value =
      question.kind === "text"
        ? typed.trim()
        : (answers[question.id] ?? []).map((id) => optionLabel(question.id, id)).join(", ");
    if (value) rows.push({ label: question.ask, value, line: fill(contract.summary.line, { question: question.ask, answer: value }) });
  }
  if (photoHeld) rows.push({ label: "", value: contract.summary.photoLine, line: contract.summary.photoLine });
  if (clipHeld) rows.push({ label: "", value: contract.summary.clipLine, line: contract.summary.clipLine });
  return rows;
}

/* The check's own review sentence, and each entry's. */
export const skinReviewSentence = (): string => {
  const reviewedBy = contract.review.reviewedBy as string | null;
  return reviewedBy === null ? contract.review.unreviewed : fill(contract.review.reviewed, { reviewedBy });
};
export const entryReviewSentence = (reviewedBy: string | null): string =>
  reviewedBy === null ? contract.knowledge.unreviewed : fill(contract.knowledge.reviewed, { reviewedBy });
export const entrySourceSentence = (authority: string): string => fill(contract.knowledge.label, { authority });

export const skinContract = contract;
