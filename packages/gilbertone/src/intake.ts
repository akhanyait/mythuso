import contract from "../../catalog/symptom-intake.json" with { type: "json" };
import { classifyMessage } from "./engine.ts";
import { checkEscalation } from "./escalation.ts";
import { hasSequence, stems } from "./stems.ts";

/* Symptom intake — the founder's ask of 28 September 2026, answered from
   packages/catalog/symptom-intake.json and nothing else.

   WHAT THIS IS. A patient says what is wrong — "I have a headache" — and GilbertOne, which until now
   could only answer that with the navigation sentence, offers to take notes for the nurse: the
   contract's set questions for the group her words fall into, one per turn, the answers kept as a
   card she shows or reads to the nurse at the visit. Every sentence is the contract's. The group is
   found the way the reading recogniser finds a measure: the longest trigger whose stems appear in
   order and adjacent, a tie going to the group listed first.

   WHAT IT IS NOT. Triage. It sets no priority, names no cause, chooses no care setting and gives no
   advice; a red-flag rule is a ratified triage protocol's job (clinical.json's triage stages) and
   none exists, so none is carried here. What stands in front of every answer instead is the
   emergency matcher this package already has: answerIntake asks the engine's classifier and the
   escalation ruleset about each answer before it records it, and an emergency ends the intake with
   the caller rendering the emergency answer. The intake can never be the thing that was listening
   when an emergency was said.

   The state is immutable — every function returns a new object and never writes into the one it was
   given — because the web renders from state it holds, and a mutated state is a screen and a
   conversation that disagree. No network, no model, no environment variable. */

export type IntakeQuestion = {
  id: string;
  ask: string;
  kind: "chips" | "text";
  options?: readonly string[];
};

export type IntakeGroup = (typeof contract.groups)[number];

export type IntakeAnswer = { questionId: string; ask: string; answer: string };

export type IntakeState = {
  kind: "intake";
  groupId: string;
  /* Index into questionsFor(groupId) of the question being asked; equals its length when done. */
  step: number;
  answers: readonly IntakeAnswer[];
  done: boolean;
  /* True when the patient said the stop word rather than answering every question. */
  stopped: boolean;
};

/* answerIntake's other answer: the emergency words matched, the caller renders the emergency
   answer, and the intake is over. It carries no state on purpose — nothing said in an emergency is
   a note for later. */
export type IntakeEmergency = { kind: "emergency" };

export type IntakeSummaryRow = { label: string; value: string; line: string };

const fill = (sentence: string, values: Record<string, string>) =>
  sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

const groupOf = (groupId: string): IntakeGroup => {
  const group = contract.groups.find((g) => g.id === groupId);
  /* Loud rather than blank: a group id nothing declares is a caller reading a stale contract. */
  if (!group)
    throw new Error(
      `packages/catalog/symptom-intake.json has no group "${groupId}". The intake asks only the questions the contract declares.`,
    );
  return group;
};

/* The questions a group asks, common ones first, exactly as the contract orders them. */
export const questionsFor = (groupId: string): readonly IntakeQuestion[] => [
  ...(contract.common.questions as IntakeQuestion[]),
  ...(groupOf(groupId).questions as IntakeQuestion[]),
];

/* The group a message opens, by the longest trigger found — stems, adjacent — or null when no
   trigger is in the message. Never asked about an emergency: the caller runs the emergency words
   first, and this recogniser has no opinion about them. */
export function intakeGroupFor(text: string): IntakeGroup | null {
  const said = stems(text);
  let found: IntakeGroup | null = null;
  let matchedWords = 0;
  for (const group of contract.groups)
    for (const trigger of group.triggers) {
      const term = stems(trigger);
      if (term.length > matchedWords && hasSequence(said, term, 0)) {
        found = group;
        matchedWords = term.length;
      }
    }
  return found;
}

/* Whether a message is one the emergency answer takes before anything else reads it: the engine's
   emergency classification, then the escalation ruleset's emergency severity — the same two asks,
   in the same order, that refusals.ts puts in front of consent. */
export const intakeEmergency = (text: string): boolean =>
  classifyMessage(text) === "emergency" ||
  checkEscalation(text)?.rule.severity === "emergency";

export function beginIntake(groupId: string): IntakeState {
  groupOf(groupId);
  return { kind: "intake", groupId, step: 0, answers: [], done: false, stopped: false };
}

export function currentQuestion(state: IntakeState): IntakeQuestion | null {
  if (state.done) return null;
  return questionsFor(state.groupId)[state.step] ?? null;
}

const stopStem = stems(contract.answer.stop.word).join(" ");

/* Records an answer and moves to the next question. An empty answer returns the very same state
   object, unadvanced, so a caller can tell nothing was recorded and read answer.unmatchedInside. A
   message that is only the stop word ends the intake with stopped set. An emergency ends it with no
   state at all. A chips question records the option's own text when the answer is one of them, so
   the nurse reads the contract's word and not a spelling of it; anything else is kept as typed. */
export function answerIntake(
  state: IntakeState,
  text: string,
): IntakeState | IntakeEmergency {
  if (state.done) return state;
  const typed = text.trim();
  if (!typed) return state;
  if (intakeEmergency(typed)) return { kind: "emergency" };
  if (stems(typed).join(" ") === stopStem)
    return { ...state, done: true, stopped: true };
  const question = currentQuestion(state);
  if (!question) return { ...state, done: true };
  const option = question.options?.find(
    (o) => stems(o).join(" ") === stems(typed).join(" "),
  );
  const answers = [
    ...state.answers,
    { questionId: question.id, ask: question.ask, answer: option ?? typed },
  ];
  const step = state.step + 1;
  const done = step >= questionsFor(state.groupId).length;
  return { ...state, step, answers, done };
}

/* Whether a message is the patient agreeing to start, declining, or neither — by the contract's
   own words, whole message. */
export function intakeConsent(text: string): "yes" | "no" | null {
  const said = stems(text).join(" ");
  if (contract.answer.consent.yesWords.some((w) => stems(w).join(" ") === said)) return "yes";
  if (contract.answer.consent.noWords.some((w) => stems(w).join(" ") === said)) return "no";
  return null;
}

/* The notes card: one row per answer, each line filled from the contract's format. */
export function summaryRows(state: IntakeState): IntakeSummaryRow[] {
  return state.answers.map((a) => ({
    label: a.ask,
    value: a.answer,
    line: fill(contract.summary.line, { question: a.ask, answer: a.answer }),
  }));
}

/* The reviewed sentence with the registration in it, or the unreviewed one. */
export function intakeReviewSentence(): string {
  const reviewedBy = contract.review.reviewedBy as string | null;
  return reviewedBy === null
    ? contract.review.unreviewed
    : fill(contract.review.reviewed, { reviewedBy });
}

export const intakeContract = contract;
