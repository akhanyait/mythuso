export * from "./engine.js";
export * from "./conversation.js";
export * from "./phi.js";
export * from "./refusals.js";
export * from "./tools.js";
export { checkEscalation, ESCALATION_RULES } from "./escalation.js";
export type { Severity, EscalationRule, EscalationResult } from "./escalation.js";
export {
  initialSpeechState,
  transition,
  isMicActive,
  canBargeIn,
  PER_UTTERANCE_CAP_MS,
  VAD_SILENCE_THRESHOLD_MS,
  MAX_UTTERANCES_PER_EXCHANGE,
} from "./speech-state.js";
export type {
  SpeechPhase,
  SpeechEvent,
  SpeechEffect,
  SpeechState,
  TransitionResult,
} from "./speech-state.js";
/* The two founder asks of 27 September 2026, answered from contracts: the spoken reading
   explanation and the pre-visit companion, with the medicine list read back beside it. Each is a
   recogniser or an answer builder over a contract, and none of them decides an emergency — the
   caller runs the emergency words first. The stems module is the matcher arithmetic the web's
   lib/assistant.ts now reads from here rather than carrying. */
export {
  askWhichReading,
  readingAnswer,
  readingContract,
  readingIn,
  readingLeavesUnread,
  readingName,
  sideOf,
} from "./readings.ts";
export type {
  ReadingAnswer,
  ReadingFraming,
  ReadingMatch,
  ReadingMeasure,
  ReadingSide,
} from "./readings.ts";
export { preparationContract, preparationFor } from "./preparation.ts";
export type { PreparationAnswer } from "./preparation.ts";
export { medicinesAnswer } from "./medicines.ts";
export type { MedicineLine, MedicinesAnswer } from "./medicines.ts";
export { fillerStems, hasSequence, stem, stems, tokens } from "./stems.ts";
/* Symptom intake (28 September 2026): the set questions a patient answers for the nurse, from
   packages/catalog/symptom-intake.json — not triage, and asked only after the emergency words. */
export { answerIntake, beginIntake, caseWords, currentQuestion, featuresFor, findingsFor, intakeConsent, intakeContract, intakeEmergency, intakeGroupFor, intakeGroupHasPathway, intakeReviewSentence, questionsFor, summaryRows } from "./intake.ts";
export type { IntakeAnswer, IntakeEmergency, IntakeFeature, IntakeFinding, IntakeGroup, IntakeQuestion, IntakeState, IntakeSummaryRow } from "./intake.ts";
/* Show GilbertOne a rash (1 October 2026): the skin check's three outcomes from
   packages/catalog/skin-check.json — typed words asked of the emergency matcher first, then the
   contract's rules, then general information from the knowledge base. Reads no photo. */
export { entryReviewSentence, entrySourceSentence, optionLabel, pressSkinOption, questionOf, skinContract, skinEmergency, skinOutcome, skinReviewSentence, skinSummaryRows } from "./skin-check.ts";
export type { RaisedRule, ShownCondition, ShownFirstAid, SkinAnswers, SkinOutcome, SkinOutcomeKind, SkinQuestion, SkinRule, SkinSummaryRow } from "./skin-check.ts";
