import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import { conversation, type Turn } from "./assistant";

export const patientQuestions = ui.patientQuestions;
export type PatientQuestion = typeof patientQuestions[number];
/* Only a complete approved question takes this shortcut. Added symptoms or other words go through
   the existing classifier, including its emergency and refusal checks. This is web navigation
   guidance, not a claim that a patient's records or booking have been read. */
export function patientQuestionFor(text: string): PatientQuestion | undefined {
  const normalise = (s: string) => s.trim().toLowerCase().replace(/[?]+$/, "");
  return patientQuestions.find(q => normalise(q.asks) === normalise(text));
}
export function choosePatientHelp(turns: Turn[], question: PatientQuestion, typed?: string): Turn[] {
  const next: Turn = {
    id: (turns.at(-1)?.id ?? 0) + 1,
    asked: typed ?? question.asks,
    channel: typed === undefined ? "chosen" : "typed",
    reply: { kind: "situation", situation: {
      id: question.id, name: question.asks, sentence: question.answer,
      figure: null, figureLabel: null, depth: 1,
    } },
    matched: null, groups: [], unread: false,
  };
  return [...turns, next].slice(-conversation.turnLimit);
}
