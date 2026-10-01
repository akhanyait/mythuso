import contract from "../../../../packages/catalog/assistant.json";
import terms from "../../../../packages/catalog/gilbert-emergency-terms.json";
import {
  labels as schedulingLabels,
  shortWhenText,
  type Visit,
} from "./scheduling";
import { recordById } from "./records";
import { EXPIRY_WARNING_DAYS } from "./vetting";
import { conditions, emergency as sosEmergency, numberById } from "./sos";
import { crisisLines, showsCrisisLines } from "./crisis-lines";
import {
  summarise,
  urgencyWords,
  type ConversationTurn,
  type HandoverSummary,
} from "../../../../packages/engines/src/access/domain/handover.ts";
import scheduling from "../../../../packages/catalog/scheduling.json";
import booking from "../../../../packages/catalog/booking.json";
import vetting from "../../../../packages/catalog/vetting.json";
import { accessSettingsNow, rotaAt } from "./settings";
import {
  fillerStems,
  hasSequence,
  stem,
  stems,
  tokens,
} from "../../../../packages/gilbertone/src/stems.ts";
import {
  askWhichReading,
  readingAnswer,
  readingIn,
  readingLeavesUnread,
  readingContract,
  type ReadingAnswer,
  type ReadingMatch,
} from "../../../../packages/gilbertone/src/readings.ts";
import {
  preparationFor,
  type PreparationAnswer,
} from "../../../../packages/gilbertone/src/preparation.ts";
import {
  medicinesAnswer,
  type MedicinesAnswer,
} from "../../../../packages/gilbertone/src/medicines.ts";
import {
  answerIntake,
  beginIntake,
  currentQuestion,
  intakeConsent,
  intakeContract,
  intakeGroupFor,
  intakeGroupHasPathway,
  intakeReviewSentence,
  summaryRows,
  type IntakeGroup,
  type IntakeQuestion,
  type IntakeState,
  type IntakeSummaryRow,
} from "../../../../packages/gilbertone/src/intake.ts";
import { checkEscalation } from "../../../../packages/gilbertone/src/escalation.ts";
import { foldCharacters } from "../../../../packages/gilbertone/src/fold.ts";
import {
  answeredWithEmergency,
  latestCaseFor,
  markSentence,
  openCase,
  patientView,
  readingFrom,
  sourceLabel,
  unit as readingUnit,
  whoHas,
  words as caseWords,
  type CaseReading,
  type PatientCase,
  type SourceId,
} from "./case";
import { evaluateRefusals } from "../../../../packages/gilbertone/src/refusals.ts";
import { accountHolderMedicines } from "./records";

/* GilbertOne's reasoning, without a screen attached to it.

   Everything GilbertOne says is in packages/catalog/assistant.json, and this module is the arithmetic
   beside it — the same arithmetic as apps/ios/MyThuso/Models/Assistant.swift and
   apps/android/.../model/Assistant.kt, run against the same shared fixtures in the contract, so a
   sentence gets the same answer on every platform. There is no model behind it and nothing it sends.

   THE ORDER THAT MAKES IT SAFE. A message is folded to plain letters and reduced to stems. The
   emergency words are checked first, on stems and with small gaps, so "chest pains", "she bled" and
   "my chest feels tight" all raise; a match ends the matching. Only then is a trigger phrase looked
   for — and a question may answer on its own only if every word of the message is one of its trigger
   words or ordinary filler. Anything left over is said to be unread, with the ambulance numbers
   beside it, because a list of words will always miss a way of saying something frightening, and the
   defect the Wave 1 review found was the calm answer that followed the miss. "Nothing needs you" is
   never said to a message GilbertOne did not read all of.

   A TEXT BOX, AND WHY IT IS HONEST. The emergency words read it, the unread rule reads the rest, and
   the unmatched answer says plainly that GilbertOne could not assess it and puts the ambulance first. The
   emergency words are a draft nobody clinical has reviewed, which is why the contract's
   silenceIsNotSafety sentence is never left unsaid: its first half is the last of the consent
   gate's prohibitions, its second half — the numbers — is the composer's own strip, which stays on
   the screen the whole conversation, and the public assistant surface renders it whole.

   A MICROPHONE IN THE BOX, AND NO LISTENING SPHERE. Since the founder's decision of 18 September 2026
   the composer carries a push-to-talk button, and the words are the browser's own recognition of them —
   the reason the disclosure is on the screen before the first tap rather than after it. What it catches is
   a draft in the text box: nothing sends it, stores it or answers it until she presses Send, and no audio
   is taken or kept on any path, which the build still refuses across the whole of apps/web/src. The sphere
   is not driven by any of it. Listening and Thinking are native states; the web moves between Idle,
   Guiding, Escalate and Handover only, and never adds a pause to look considered. */

export type Depth = 0 | 1 | 2 | 3;
/* The states the web may be in. Listening and Thinking are the phones' alone; see the contract's statesWhy. */
export type PulseId = "idle" | "guiding" | "escalate" | "handover";

export const identity = contract.identity;
export const states = contract.states;
export const questionGroups = contract.questionGroups;
export const refusals = contract.refusals;
export const conversation = contract.conversation;
/* The consent gate's own words, since 20 September 2026: the screen a patient meets before her
   first interaction. Everything the gate shows is read from here — the intro, the two chip
   groups, the privacy and refusal notes, the two boxes and the two buttons — so a sentence on
   that screen can be reworded where every other approved sentence is, and never in the panel. */
export const consent = contract.consent;
/* Web-only layout copy for the three restyled GilbertOne surfaces (welcome, consent gate, public
   sheet). Short headings, labels and framing lines the layout needs; every clinical sentence and
   number still comes from its own section and from sos.json. Not emitted to the phones. */
export const screens = contract.screens;
export const voice = contract.voice;
export const answers = contract.answers;
export const fixtures = contract.fixtures;
/* The terms are their own versioned configuration (founder, 14 September 2026); how they match is here. */
export const emergencyGroupsContract = terms.groups;
export const falsePositives = terms.falsePositives;
export const stateSpec = (id: PulseId) => states.find((s) => s.id === id)!;
export const refusal = (id: string) => refusals.find((r) => r.id === id)!;

/* {ambulance}, {mobile} and {seconds} are the contract's own tokens and are filled from sos.json and
   the voice policy; nothing here types an emergency number. */
const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{([a-zA-Z]+)\}/g, (token, key) => values[key] ?? token);
const lineValues = {
  ambulance: numberById("ambulance").number,
  mobile: numberById("mobile").number,
  seconds: String(contract.voice.maxListeningSeconds),
};
export const say = (text: string) => fill(text, lineValues);
export const silenceIsNotSafety = say(contract.silenceIsNotSafety);
export const lines = (ids: string[]) =>
  ids.map((id) => {
    const n = numberById(id);
    return { number: n.number, name: n.name };
  });
/* What a voice reads where it would otherwise have read the digits. sos.json's spokenNumbers decision
   of 23 September 2026: an emergency number is a telephone number, not a quantity, and "10111" said
   aloud as one thousand one hundred and eleven is a number nobody can dial in a hurry. The spoken
   form is the contract's own field — derived nowhere, typed nowhere — and the boundary check holds it
   to the digits beside it. The screen still shows the digits; only the reading changes. */
export const spokenNumber = (id: string): string => {
  const n = numberById(id) as { number: string; spoken?: string };
  return n.spoken ?? n.number;
};
export const spokenLines = (ids: string[]) =>
  ids.map((id) => {
    const n = numberById(id);
    return { number: n.number, name: n.name, spoken: spokenNumber(id) };
  });

export type Situation = {
  id: string;
  name: string;
  sentence: string;
  figure: string | null;
  figureLabel: string | null;
  depth: Depth;
};

/* The visit is the one the home card shows — the first upcoming visit the person booked, written by the
   same shortWhenText — so GilbertOne and the home cannot name two days for one visit. With nothing booked,
   or a nurse still being found, it says scheduling.json's own words for that. */
const scheduled = (text: string) =>
  text.replace(
    /\{(noUpcoming|noUpcomingDetail|asapPending)\}/g,
    (token, key: keyof typeof schedulingLabels) =>
      schedulingLabels[key] ?? token,
  );

export function situations(visit: Visit | null = null): Situation[] {
  const values: Record<string, string> = {
    laboratory:
      recordById("laboratory")?.name ?? contract.situationsFallback.laboratory,
    expiryWarningDays: String(EXPIRY_WARNING_DAYS),
  };
  return contract.situations.map((s) => {
    const depth = s.depth as Depth;
    if (s.id === "visit" && (!visit || visit.kind !== "scheduled")) {
      const state = visit
        ? contract.visitStates.pending
        : contract.visitStates.none;
      return {
        id: s.id,
        name: scheduled(state.name),
        sentence: scheduled(state.sentence),
        figure: null,
        figureLabel: null,
        depth,
      };
    }
    const withVisit =
      s.id === "visit" && visit
        ? { ...values, visitWhen: shortWhenText(visit) }
        : values;
    return {
      id: s.id,
      name: s.name,
      sentence: fill(s.sentence, withVisit),
      figure: s.figure === null ? null : fill(s.figure, withVisit),
      figureLabel:
        s.figureLabel === null ? null : fill(s.figureLabel, withVisit),
      depth,
    };
  });
}

export type Question = (typeof contract.questions)[number];
export const questions: Question[] = contract.questions;

/* ---- The audience a conversation serves ---------------------------------------------------
 * The founder's decision of 19 September 2026: one GilbertOne across the product, with what
 * differs between audiences written in the contract's audiences section rather than in any
 * component. The ids are the RoleIds in lib/roles.ts and the engine's Audience, and the gate
 * holds the three lists together. A question carries the audiences it is offered to as a tag,
 * so the scope is authored where the question is. */
export type AudienceId =
  | "patient"
  | "nurse"
  | "doctor"
  | "partner"
  | "control-tower"
  | "back-office";
export type AudienceEntry = (typeof contract.audiences.list)[number];

/* Loud rather than blank: a panel asked to serve an audience the contract does not carry would
   otherwise draw a session with no questions, no label and no buttons, and nothing would say so. */
export function audienceOf(id: AudienceId): AudienceEntry {
  const found = contract.audiences.list.find((a) => a.id === id);
  if (!found)
    throw new Error(
      `packages/catalog/assistant.json has no audience "${id}". Every audience a panel can serve is in its audiences list.`,
    );
  return found;
}

/** The questions an audience is offered — the tags on each question, read one way. */
export const questionsFor = (audience: AudienceId): Question[] =>
  questions.filter((q) => q.audiences.includes(audience));

/* A refusal's own words for the audience asking. Most refusals are one truth for everybody; the
   two that differ — what GilbertOne will not name, and whose doses it will not carry — carry an
   `audiences` map in the contract, and a nurse asking for a dose and a patient asking for one
   are different refusals in exactly that map. */
export type RefusalWords = { statement: string; why: string };
export function refusalFor(
  entry: (typeof contract.refusals)[number],
  audience: AudienceId,
): RefusalWords {
  const variant = (entry as { audiences?: Record<string, RefusalWords> })
    .audiences?.[audience];
  return variant ?? { statement: entry.statement, why: entry.why };
}

/* The unmatched answer's own words for an audience. The patient's are the section's own; each
   staff audience's names the three questions its session answers and what is not GilbertOne's
   to read — which is the refusal half of the answer, because "I can't assess that" to a nurse
   is a scope, not a shrug. */
export function unmatchedDetail(audience: AudienceId): string {
  const variants = (
    contract.answers.unmatched as {
      audiences?: Record<string, { detail: string }>;
    }
  ).audiences;
  return variants?.[audience]?.detail ?? contract.answers.unmatched.detail;
}

export type EmergencyGroup = { id: string; name: string };

/* The group's name is the SOS screen's word for the condition it raises, or the contract's own for
   the two groups that raise without one. */
const groupName = (group: (typeof emergencyGroupsContract)[number]) =>
  group.condition === null
    ? ((group as { name?: string }).name ?? group.id)
    : (conditions.find((c) => c.id === group.condition)?.name ?? group.id);

/* ---- Words into stems ------------------------------------------------------------------------
   The arithmetic — lower case, the contract's foldings, apostrophes removed, the stemming rules in
   the contract's order, and a term's words in sequence within a gap — lives in
   packages/gilbertone/src/stems.ts since 27 September 2026, so that the reading recogniser beside it
   folds a message exactly as this matcher does. Re-exported here because every caller of this module
   (the specs, the public sheet) reads them from it; checked on every platform against fixtures.stems. */
export { stem, stems, tokens };

export function emergencyGroupsIn(text: string): EmergencyGroup[] {
  const said = stems(text);
  return emergencyGroupsContract
    .filter((g) =>
      g.words.some((w) => hasSequence(said, stems(w), contract.matcher.maxGap)),
    )
    .map((g) => ({ id: g.id, name: groupName(g) }));
}

/** The escalation ruleset's emergency, as the groups the emergency answer names — or null when the
 *  ruleset found none. Until 1 October 2026 this panel asked only the terms list, so "my throat is
 *  swelling", "sudden weakness on one side" or "I don’t want to live anymore" — presentations no term
 *  names — met the intake's questions or "I can't assess that". The answer is the terms' own
 *  emergency answer, numbers and Thuso SOS, never the rule's sentence typed onto a second screen. It
 *  names no condition (the rule's id is not a terms group, and escalation.ts is a locked Tier 1 file
 *  this change does not edit), except that a rule crisis-lines.json lists under
 *  showsWhen.escalationRules carries the crisis group, so a crisis the terms missed is shown the
 *  crisis lines a crisis they caught is shown. The ruleset reads the folded text (fold.ts), as
 *  refusals.ts gives it. The urgent severity is not an emergency and is not answered here. */
export function escalationEmergencyIn(text: string): EmergencyGroup[] | null {
  const rule = checkEscalation(foldCharacters(text))?.rule;
  if (rule?.severity !== "emergency") return null;
  return crisisLines.showsWhen.escalationRules.includes(rule.id)
    ? emergencyGroupsContract
        .filter((g) => g.id === crisisLines.showsWhen.group)
        .map((g) => ({ id: g.id, name: groupName(g) }))
    : [];
}

/** The longest trigger (in words, adjacent) wins; a tie goes to the question listed first.
 *  Only the questions the audience is offered are in the running, because the tags are the
 *  assistant's scope — and the emergency words are matched before any of this, in send(), so
 *  scoping a question out can never scope an emergency out. */
export function questionFor(
  text: string,
  audience: AudienceId = "patient",
): Question | null {
  const said = stems(text);
  let best: Question | null = null;
  let length = 0;
  for (const question of questionsFor(audience))
    for (const trigger of question.triggers) {
      const term = stems(trigger);
      if (term.length > length && hasSequence(said, term, 0)) {
        best = question;
        length = term.length;
      }
    }
  /* The reading question, since 27 September 2026, has two more ways in than its trigger phrases:
     a measure named in the words of packages/catalog/reading-questions.json — "sugar", "bp",
     "SpO2" — which competes on length like any trigger, so "when is my nurse coming, my bp was
     150/95" is still the visit question with words left over; and a pair of numbers written the way
     a cuff writes them, which is blood pressure only when nothing else in the message matched at
     all. The measure is read again by the reply builder; this only decides which question won. */
  const reading = readingQuestionFor(audience);
  if (reading) {
    const found = readingIn(text);
    if (
      found &&
      (found.matchedWords > length || (!best && found.matchedWords === 0))
    )
      best = reading;
  }
  return best;
}

const readingQuestionFor = (audience: AudienceId): Question | null =>
  questionsFor(audience).find((q) => q.answer === "reading") ?? null;

/* Reading everything: a word that is neither one of the question's own trigger words nor filler is a
   word GilbertOne did not read, and it is said so. Only a matched question is measured — a greeting
   consumes its whole message in the bridge, so no other trigger set reaches this rule. */
export function leavesUnread(text: string, question: Question): boolean {
  /* A reading question reads its measure's aliases, the contract's own read words and — for this
     question alone — the numbers, because a number is the question. packages/gilbertone/src/readings.ts
     holds that rule beside the recogniser, so the package's tests and this matcher agree. */
  if (question.answer === "reading") {
    const found = readingIn(text);
    if (found) return readingLeavesUnread(text, found, question.triggers);
  }
  const covered = new Set([
    ...fillerStems,
    ...question.triggers.flatMap(stems),
  ]);
  return stems(text).some((word) => !covered.has(word));
}

export type SummaryRow = { label: string; value: string };
export type Channel = "typed" | "chosen";

/* The symptom intake — the founder's ask of 28 September 2026, read from
   packages/catalog/symptom-intake.json through packages/gilbertone/src/intake.ts. A patient who says
   what is wrong is offered the set questions for it (offer), answers them one per turn (question),
   and is shown the card of her answers to show the nurse (notes); or she declines (declined). Not
   triage: the reply carries no priority, no cause and no advice, and the words on it are the
   contract's. The phase says which of the four turns this is; the state is the package's own,
   immutable, and the panel holds it nowhere but in the turn. */
/* Since 29 September 2026 the notes on a group with a pathway (symptom-intake.json questionsFrom)
   go on: "reading" asks for the pair a home cuff shows, "reading-source" asks where it came from,
   "case" is the card once she asked for a nurse, and "case-declined" is her not-now. Every sentence
   is packages/catalog/case.json's. The card renders from patientView() — the case with its findings
   and its suggestion removed — so nothing this reply holds could show her either. */
export type IntakePhase =
  | "offer"
  | "declined"
  | "question"
  | "notes"
  | "reading"
  | "reading-source"
  | "case"
  | "case-declined";
export type PendingPair = { systolic: number; diastolic: number; said: string };
export type IntakeReply = {
  kind: "intake";
  phase: IntakePhase;
  group: IntakeGroup;
  state: IntakeState | null;
  question: IntakeQuestion | null;
  rows: IntakeSummaryRow[];
  /* The pair she typed, waiting for its source; then the reading with its source and its marks. */
  pending: PendingPair | null;
  reading: CaseReading | null;
  caseRef: string | null;
  /* The contract's sentence for a pair that could not be read, shown once on the reading step. */
  note: string | null;
};
export const caseScreens = caseWords.screens.patient;
export const SESSION_SUBJECT = "subject-this-session";
/* The sources a patient may name for her own reading, by devices.json's own labels. */
export const patientReadingSources = (): { id: SourceId; label: string }[] =>
  (caseWords.readings.sources.patient as SourceId[]).map((id) => ({ id, label: sourceLabel(id) }));
/* The reading's line on the card: the pair as she typed it, the unit, the source, and the mark
   devices.json gives that source. */
export const readingLine = (reading: CaseReading): string =>
  fill(caseScreens.readingLine, { value: reading.said, unit: readingUnit(), source: sourceLabel(reading.source).toLowerCase() });
export const readingMarks = (reading: CaseReading): string[] => reading.marks.map(markSentence).filter(Boolean);
export const hasPathway = (group: IntakeGroup) => intakeGroupHasPathway(group.id);
export const caseView = (caseRef: string | null): PatientCase | null => (caseRef ? patientView(caseRef) : null);
export { whoHas };
export const intakeWords = intakeContract;
export const intakeReview = intakeReviewSentence;
const intakeChipGroup = (): IntakeGroup => {
  const group = intakeContract.groups.find((g) => g.id === intakeContract.chip.group);
  if (!group)
    throw new Error(
      `packages/catalog/symptom-intake.json's chip names the group "${intakeContract.chip.group}", which it does not declare.`,
    );
  return group;
};
const blank = { pending: null, reading: null, caseRef: null, note: null } as const;
const intakeOffer = (group: IntakeGroup): IntakeReply => ({
  kind: "intake",
  phase: "offer",
  group,
  state: null,
  question: null,
  rows: [],
  ...blank,
});
const intakeStep = (group: IntakeGroup, state: IntakeState): IntakeReply =>
  state.done
    ? { kind: "intake", phase: "notes", group, state, question: null, rows: summaryRows(state), ...blank }
    : { kind: "intake", phase: "question", group, state, question: currentQuestion(state), rows: [], ...blank };
export type Reply =
  | { kind: "situation"; situation: Situation }
  | { kind: "identity" }
  | { kind: "voice" }
  /* The greeting, since the greeting fix of 20 September 2026: "hello" on its own is not a question
     the matcher has a trigger for, and it used to answer "I can't assess that" — the one reply that
     reads as a refusal to somebody who only said hello. Its sentence, its state and its face are the
     contract's (answers.greeting, affect.answers.greeting), read like every other reply kind's. */
  | { kind: "greeting" }
  | { kind: "emergency"; groups: EmergencyGroup[] }
  | { kind: "unmatched" }
  /* A refusal the deterministic policy engine made — packages/gilbertone/src/refusals.ts, the same
     four rules the assistant service asks before it classifies anything. Since 28 September 2026 the
     web asks them too, for a message no contract question matched: "how much Panado can I give my
     child" used to land on "I can't assess that", while the service's own refusal for it was dropped
     at the bridge for carrying no source. The sentence is the contract's (refusalPolicies), read by
     the package and never typed here; the id says which rule spoke. */
  | {
      kind: "refusal";
      refusalId: string;
      sentence: string;
      severity: "hard" | "soft";
    }
  /* The second-tier answer, since 20 September 2026: words a language model wrote, shown under the
     answers.service heading only when the assistant API answered with a source above its keyword
     classifier — 'model', or 'orchestrator' since the LangChain tier of 21 September. It lives here
     so the panel treats it like every other reply — face, pulse, speech, outcome — without knowing
     or caring where the sentence came from. */
  | { kind: "service"; text: string }
  /* The three answers of 27 September 2026, each read from a contract and never composed. A
     reading: the measure a person named or the pair of numbers she wrote, and records.json's own
     explanation for it, framed by packages/catalog/reading-questions.json — or, pressed as a chip
     with nothing to read a measure from, the sentence asking which. A preparation: the list in
     packages/catalog/visit-preparation.json for the service that is booked, or the sentence for
     nothing booked. Medicines: the account holder's list read back line by line, protected entries
     never among them. */
  | { kind: "reading"; match: ReadingMatch | null; answer: ReadingAnswer | null; ask: string | null }
  | { kind: "preparation"; answer: PreparationAnswer }
  | { kind: "medicines"; answer: MedicinesAnswer }
  | IntakeReply
  /* "What did the doctor say?" (29 September 2026): the session's latest case as the patient may
     read it, or null for none. The plan is the doctor's own words, read from the record. */
  | { kind: "case"; view: PatientCase | null }
  | {
      kind: "handover";
      rows: SummaryRow[];
      summary: HandoverSummary;
      desk: DeskWords;
    };

/** `unread` is true when the answer came with words GilbertOne could not read; the unread answer follows it. */
export type Turn = {
  id: number;
  asked: string | null;
  channel: Channel | null;
  reply: Reply;
  matched: Question | null;
  groups: EmergencyGroup[];
  unread: boolean;
};

export function replyTo(question: Question, visit: Visit | null = null): Reply {
  switch (question.answer) {
    case "situation": {
      const situation = situations(visit).find((s) => s.id === question.id);
      return situation
        ? { kind: "situation", situation }
        : { kind: "unmatched" };
    }
    case "identity":
      return { kind: "identity" };
    case "voice":
      return { kind: "voice" };
    case "emergency":
      return { kind: "emergency", groups: [] };
    case "preparation":
      return {
        kind: "preparation",
        answer: preparationFor(visit?.service.id ?? null),
      };
    case "medicines":
      return { kind: "medicines", answer: medicinesAnswer(accountHolderMedicines()) };
    case "reading":
      return { kind: "reading", match: null, answer: null, ask: askWhichReading() };
    /* The chip names no complaint, so the offer opens the contract's general group. */
    case "intake":
      return intakeOffer(intakeChipGroup());
    case "case":
      return { kind: "case", view: latestCaseFor(SESSION_SUBJECT) };
    default:
      return { kind: "unmatched" };
  }
}

/* The reading reply for a message with words in it: the recogniser's match and the contract's
   answer for it. A reading question that won on a trigger phrase alone — "what does my reading
   mean" with no measure and no number — gets the chip's own ask-which sentence. */
export function readingReply(text: string): Reply {
  const match = readingIn(text);
  return match
    ? { kind: "reading", match, answer: readingAnswer(match), ask: null }
    : { kind: "reading", match: null, answer: null, ask: askWhichReading() };
}

export function pulseOf(reply: Reply): PulseId {
  switch (reply.kind) {
    case "situation":
      return "guiding";
    case "identity":
      return answers.identity.state as PulseId;
    case "voice":
      return answers.voice.state as PulseId;
    case "greeting":
      return answers.greeting.state as PulseId;
    case "emergency":
      return answers.emergency.state as PulseId;
    case "unmatched":
      return answers.unmatched.state as PulseId;
    case "refusal":
      return answers.refusal.state as PulseId;
    case "service":
      return answers.service.state as PulseId;
    case "handover":
      return answers.handover.state as PulseId;
    /* A number past the far-outside bounds pulses as the emergency answer does — the words put the
       ambulance numbers first, and a guiding colour would tell her the opposite
       (reading-questions.json farOutside.stateWhy). */
    case "reading":
      return (reply.answer?.urgent ? readingContract.farOutside.state : answers.reading.state) as PulseId;
    case "preparation":
      return answers.preparation.state as PulseId;
    case "medicines":
      return answers.medicines.state as PulseId;
    case "intake":
      return answers.intake.state as PulseId;
    case "case":
      return answers.case.state as PulseId;
  }
}

/* ---- The face an answer wears ------------------------------------------------------------------
 * The founder's decision of 19 September 2026: affect is deterministic, derived from the answer kind
 * alone — no model, no network — and written in the contract's affect section, where each kind's cue,
 * the posture that cue means and the reason it is that one are on file beside the dated decision.
 * `cueOf` is the affect seam's read half, the way `pulseOf` is the state's: the panel asks what face
 * a reply wears and the answer comes from the contract, not from a ternary in the component.
 *
 * A turn with unread words wears the refusal's face whatever it matched, because the unread block in
 * that same turn is itself a refusal — the rest was not read — and affect may never soften a refusal. */
export const affect = contract.affect;
export function cueOf(reply: Reply, unread = false): string {
  const mapped = unread ? affect.answers.unread : affect.answers[reply.kind];
  return mapped.cue;
}
/* The register an answer is read aloud in — the voice's map, the way `cueOf` is the face's, and
   decided the same way: from the answer kind alone, in the contract's spokenRegister section of
   27 September 2026. The answer is a class id in packages/catalog/voice.json; whether that class's
   voice may be set by anybody is voice.json's zones' to say, and lib/voice.ts reads it there. A turn
   with unread words reads in the refusal's register whatever it matched, for the reason it wears the
   refusal's face: the unread block in that turn is itself a refusal. */
export const spokenRegister = contract.spokenRegister;
export function voiceClassOf(reply: Reply, unread = false): string {
  return unread
    ? spokenRegister.answers.unread
    : spokenRegister.answers[reply.kind];
}
/* What the cue that owns the face means, for the readable surface the tests key on. Reversed from
   the affect mapping: the greeting cues are conversation rather than answers, so a face they own has
   no posture on record — which is honest, a greeting is not an answer. */
export function postureOf(cue: string | null | undefined): string | undefined {
  if (!cue) return undefined;
  return Object.values(affect.answers).find((entry) => entry.cue === cue)
    ?.posture;
}

/* The conversation, held in memory and nowhere else, and capped. No browser storage of any kind: a
   transcript of health questions is the last thing that should survive a closed tab on a shared
   phone, and the build refuses those APIs in apps/web/src. */
/* What the panel opens with is the audience's own decision on file: the patient's first message
   is her current situation, and a staff preview opens with what GilbertOne is, because a nurse's
   first question is not "does anything need me" and the answer to it here would be about somebody
   else's chart. */
export const opening = (audience: AudienceId = "patient"): Turn[] => [
  {
    id: 0,
    asked: null,
    channel: null,
    reply:
      audienceOf(audience).opensWith === "identity"
        ? { kind: "identity" }
        : { kind: "situation", situation: situations()[0] },
    matched: null,
    groups: [],
    unread: false,
  },
];

const append = (turns: Turn[], make: (id: number) => Turn) =>
  [...turns, make((turns[turns.length - 1]?.id ?? 0) + 1)].slice(
    -conversation.turnLimit,
  );

/* What the nurse queue is handed, as the Access domain summarises it: how the last thing was asked, what
   it matched, and an urgency. Never the person's words and never which emergency words fired —
   conversation.handover@1 refuses both, and a group can be a crisis, which joined to a person is a record
   of it. A request for a nurse is not itself what a nurse needs to read, so it is skipped.

   `raised` is the panel's memory that an emergency was answered in a turn the conversation's cap has since
   dropped. An emergency at the first message and a calm question at the thirtieth is still an emergency,
   and scrolling out of the window must not be what lowers it. */
const conversationOf = (turns: Turn[]): ConversationTurn[] =>
  turns.map((t) => ({
    channel: t.channel,
    matchedQuestionId: t.matched?.id ?? null,
    askedForNurse: t.reply.kind === "handover",
    emergency: t.reply.kind === "emergency",
  }));
export const emergencyIn = (turns: Turn[]) =>
  turns.some((t) => t.reply.kind === "emergency");

/* Who answers a handover and whether anybody is there now: Access's settings handover-answered-by and
   handover-hours in force, asked once when the handover is shown and kept on the reply, so somebody told
   when the desk opens is not told something different a minute later. Out of hours the words are, in
   order, that nobody is on the desk, the emergency numbers from sos.json, and a call back when it next
   opens — and nothing here can leave out the first two, because neither is a setting: an admin changes
   the hours, never whether the numbers are given. */
export type DeskWords = {
  readonly answeredBy: string;
  readonly outOfHours: {
    readonly nobody: string;
    readonly numbers: string;
    readonly callback: string | null;
  } | null;
};
const fillWords = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const handoverDeskWords = booking.handover;
/* When the handover desk answers, by the one rule for a rota: a post is on duty when one of its windows covers
   the day and the time in scheduling.json's timezone. rotaAt and the onDuty beneath it are the shared settings
   code's, which Core's escalation rota and the Access engine's handover route also ask, so the preview, the
   engine and the rota can never disagree about whether six in the morning has begun or when a shut desk opens.
   A screen's lib reaches that code through lib/settings.ts alone, so it is imported from there. */
export function handoverDesk(now: Date): DeskWords {
  const inForce = accessSettingsNow();
  const words = booking.handover;
  const answeredBy = inForce.handoverAnsweredBy
    .map((id) => vetting.roles.find((role) => role.id === id)?.name ?? id)
    .join(", ");
  const desk = rotaAt(inForce.handoverHours, now.getTime());
  if (desk.open) return { answeredBy, outOfHours: null };
  const opens = desk.opens;
  const when = !opens
    ? null
    : fillWords(
        opens.daysAhead === 0
          ? words.opensToday
          : opens.daysAhead === 1
            ? words.opensTomorrow
            : words.opensOn,
        {
          time: opens.from,
          day: new Date(opens.at).toLocaleDateString("en-ZA", {
            weekday: "long",
            timeZone: scheduling.timezone,
          }),
        },
      );
  return {
    answeredBy,
    outOfHours: {
      nobody: words.outOfHours,
      numbers: fillWords(words.outOfHoursNumbers, {
        ambulance: numberById("ambulance").number,
        mobile: numberById("mobile").number,
      }),
      callback: when === null ? null : fillWords(words.callback, { when }),
    },
  };
}

export function handoverReply(turns: Turn[], raised = false): Reply {
  const h = answers.handover;
  const label = (id: string) => h.fields.find((f) => f.id === id)?.label ?? id;
  const found = summarise(conversationOf(turns));
  const summary: HandoverSummary = raised
    ? { ...found, urgencyCode: "emergency" }
    : found;
  const last = [...turns]
    .reverse()
    .find((t) => t.asked !== null && t.reply.kind !== "handover");
  const channel = !last
    ? h.nothingAsked
    : last.channel === "chosen"
      ? h.channelChosen
      : h.channelTyped;
  const matched = !last
    ? h.nothingMatched
    : (last.matched?.asks ??
      (last.groups.length ? h.matchedEmergency : h.nothingMatched));
  return {
    kind: "handover",
    summary,
    rows: [
      { label: label("channel"), value: channel },
      { label: label("matched"), value: matched },
      {
        label: label("urgency"),
        value: urgencyWords(summary.urgencyCode).name,
      },
    ],
    desk: handoverDesk(new Date()),
  };
}

/** A message in a person's own words, for the audience the conversation serves. */
export function send(
  turns: Turn[],
  text: string,
  visit: Visit | null = null,
  raised = false,
  audience: AudienceId = "patient",
): Turn[] {
  const words = text.trim();
  if (!words) return turns;
  /* The emergency words first, then the escalation ruleset's emergencies, and a match ends it. */
  const named = emergencyGroupsIn(words);
  const groups = named.length ? named : escalationEmergencyIn(words);
  if (groups)
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply: { kind: "emergency", groups },
      matched: null,
      groups,
      unread: false,
    }));
  const question = questionFor(words, audience);
  if (!question) {
    /* Refused before it is unmatched, and only then. A contract question that matched is the
       contract's own answer; the four policies are asked of what nothing matched — the order the
       service keeps too, a refusal ahead of any model, which is also why the bridge never refines a
       refused turn. Consent is true here because the panel's gate is the confirmation refusals.ts
       asks for. An escalation the result may carry is the service's to act on and is not read. */
    const refused = evaluateRefusals(words, audience, true);
    /* The intake, since 28 September 2026, and only now: after the emergency words and after the
       refusals, before anything is unmatched. "I have a headache" used to be the one message this
       matcher answered with "I can't assess that" and then handed to the service; it is a
       complaint the intake's groups know by name, and the answer is the offer to take notes for the
       nurse. A refused message is never offered notes — a question about a dose is answered by the
       refusal alone — and a message no group knows stays unmatched, which is the only reply the
       panel waits on the service for. */
    const group = refused.refused ? null : intakeGroupFor(words);
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply:
        refused.refused && refused.refusalId && refused.sentence
          ? {
              kind: "refusal",
              refusalId: refused.refusalId,
              sentence: refused.sentence,
              severity: refused.severity ?? "hard",
            }
          : group
            ? intakeOffer(group)
            : { kind: "unmatched" },
      matched: null,
      groups: [],
      unread: false,
    }));
  }
  /* The intake question consumes its whole message, the way the greeting does: "I don't feel well,
     my head hurts" is the offer for the headache group, not an offer with words left unread beside
     the ambulance numbers. The group is the complaint the words name, or the chip's general one. */
  if (question.answer === "intake")
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply: intakeOffer(intakeGroupFor(words) ?? intakeChipGroup()),
      matched: question,
      groups: [],
      unread: false,
    }));
  const unread =
    question.answer !== "emergency" && leavesUnread(words, question);
  /* A claim about everything is not made to a message GilbertOne did not read all of. */
  if (
    unread &&
    contract.matcher.readEverything.neverWithUnread.includes(question.id)
  ) {
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply: { kind: "unmatched" },
      matched: null,
      groups: [],
      unread: false,
    }));
  }
  const reply: Reply =
    question.answer === "handover"
      ? handoverReply(turns, raised)
      : question.answer === "reading"
        ? readingReply(words)
        : replyTo(question, visit);
  return append(turns, (id) => ({
    id,
    asked: words,
    channel: "typed",
    reply,
    matched: question,
    groups: [],
    unread,
  }));
}

/** One of the suggested questions, pressed. Its own words, so nothing is unread. */
export function choose(
  turns: Turn[],
  question: Question,
  visit: Visit | null = null,
  raised = false,
): Turn[] {
  const reply: Reply =
    question.answer === "handover"
      ? handoverReply(turns, raised)
      : replyTo(question, visit);
  return append(turns, (id) => ({
    id,
    asked: question.asks,
    channel: "chosen",
    reply,
    matched: question,
    groups: [],
    unread: false,
  }));
}

/** "Talk to a nurse", pressed from the unmatched or unread answer. */
export const handOver = (turns: Turn[], raised = false): Turn[] =>
  append(turns, (id) => ({
    id,
    asked: null,
    channel: null,
    reply: handoverReply(turns, raised),
    matched: null,
    groups: [],
    unread: false,
  }));

/** A message the engine greeted on, since the greeting fix of 20 September 2026. The engine
 *  classifies "hello" as a greeting, and the matcher has no trigger for one — so without this the
 *  bridge's own fallback answered "I can't assess that" to somebody who had only said hello. The
 *  words are kept exactly as asked, the way every other turn keeps them; the reply is the
 *  contract's own sentence, worn with the greeting's state and face.
 *
 *  Since 21 September 2026 the greeting consumes the whole message: the classification is the
 *  engine's decision that nothing else in the message is something it recognises — every category
 *  that can answer sits above the greeting in its order — so there is no remainder to measure and
 *  no unread flag to carry. The split reply the unread rule used to produce here, a hello and then
 *  "I can't assess the rest of what you said" with the ambulance numbers, answered a plain
 *  "Hello World" with a refusal. Words the web's own emergency list catches never reach this turn:
 *  the bridge runs that detector first and answers the emergency. */
export function greet(turns: Turn[], text: string): Turn[] {
  const words = text.trim();
  if (!words) return turns;
  return append(turns, (id) => ({
    id,
    asked: words,
    channel: "typed",
    reply: { kind: "greeting" },
    matched: null,
    groups: [],
    unread: false,
  }));
}

/** How a turn came out, in the words the shared fixtures use. An intake offer on a message no
 *  question matched is the matcher's "unmatched" — nothing in the contract's questions matched it,
 *  which is what the phones, which have no intake yet, say for the same fixture — and the offer is
 *  what the web does with such a message instead of asking the service. The panel waits on the
 *  service by the reply's kind, never by this word, so the two cannot be confused there. */
export const outcomeOf = (turn: Turn): string =>
  turn.reply.kind === "emergency"
    ? "emergency"
    : turn.reply.kind === "refusal"
      ? "refusal"
    : (turn.reply.kind === "unmatched" ||
          (turn.reply.kind === "intake" && turn.reply.phase === "offer")) &&
        !turn.matched
      ? "unmatched"
      : turn.unread
        ? "answer-and-unread"
        : "answer";

/* ---- The intake under way ------------------------------------------------------------------------
 * The last turn says whether an intake is open: an offer waiting for yes or no, or a question
 * waiting for its answer. Nothing else holds it — no store, no ref — so Start again, which empties the
 * turns, ends it, and a conversation that has moved on has no intake to answer into. */
export function activeIntake(turns: Turn[]): IntakeReply | null {
  const last = turns[turns.length - 1]?.reply;
  if (last?.kind !== "intake") return null;
  if (last.phase === "offer" || last.phase === "question") return last;
  /* The notes on a group with a pathway wait for one of three chips — a reading, a nurse, not now —
     and the two reading steps wait for the pair and its source. Nothing else is open. */
  if (last.phase === "reading" || last.phase === "reading-source") return last;
  if (last.phase === "notes" && hasPathway(last.group) && last.state && !last.state.stopped) return last;
  return null;
}

/* A message while an intake is open, in the order the contract's `order` rule gives: the emergency
 * words first, on the person's own words, and a match is the emergency answer with the intake over;
 * then, for an offer, the contract's yes and no words — anything else falls through (null) to the
 * ordinary matcher, because a question asked in the middle of an offer is a question; then, for a
 * question, the package's answerIntake, which reads the stop word, asks the engine's emergency
 * classifier and the escalation ruleset itself, and records the answer. Every sentence the reply
 * carries is the contract's. */
export function continueIntake(
  turns: Turn[],
  text: string,
  visit: Visit | null = null,
  raised = false,
  audience: AudienceId = "patient",
  channel: Channel = "typed",
): Turn[] | null {
  const active = activeIntake(turns);
  const words = text.trim();
  if (!active || !words) return null;
  const groups = emergencyGroupsIn(words);
  if (groups.length) return send(turns, words, visit, raised, audience);
  /* And the escalation ruleset's emergencies, which send() answers the same way: an offer, a reading
     step or the notes are not where "my lips are swelling" should be read as a reply to a chip. */
  if (escalationEmergencyIn(words)) return send(turns, words, visit, raised, audience);
  const turn = (reply: Reply): Turn[] =>
    append(turns, (id) => ({
      id,
      asked: words,
      channel,
      reply,
      matched: null,
      groups: [],
      unread: false,
    }));
  if (active.phase === "offer") {
    const decision = intakeConsent(words);
    if (decision === null) return null;
    return turn(
      decision === "yes"
        ? intakeStep(active.group, beginIntake(active.group.id))
        : { ...active, phase: "declined" },
    );
  }
  if (!active.state) return null;
  /* The notes, on a group with a pathway: three chips, by their contract labels. A reading opens the
     reading step; asking for a nurse opens the case, and a case the pathway answers with the
     emergency setting is the emergency answer, the case kept; anything else is a question. */
  if (active.phase === "notes") {
    const said = stems(words).join(" ");
    if (said === stems(caseScreens.readingOffer).join(" ") && !active.reading)
      return turn({ ...active, phase: "reading", note: null });
    if (said === stems(caseScreens.notNow).join(" ")) return turn({ ...active, phase: "case-declined" });
    if (said === stems(caseScreens.askNurse).join(" ")) {
      const opened = openCase(active.state, SESSION_SUBJECT, active.reading ? [active.reading] : []);
      if (!opened.ok) return null;
      /* The emergency answer, as before; the case itself waits in `opened` for a nurse to take. */
      if (answeredWithEmergency(opened.value)) return turn({ kind: "emergency", groups: [] });
      return turn({ ...active, phase: "case", caseRef: opened.value.caseRef });
    }
    return null;
  }
  /* The pair a home cuff shows, read by the same recogniser that explains a reading — a slash or
     "over" — and nothing else read into it. The skip word steps back to the notes. */
  if (active.phase === "reading") {
    if (stems(words).join(" ") === stems(caseScreens.skipWord).join(" "))
      return turn({ ...active, phase: "notes", note: null });
    const found = readingIn(words);
    const values = found?.measure.pairOfNumbers ? found.values : null;
    if (!values || !found?.said)
      return turn({ ...active, phase: "reading", note: caseScreens.readingUnread });
    const [top, bottom] = found.measure.explains;
    return turn({
      ...active,
      phase: "reading-source",
      note: null,
      pending: { systolic: values[top]!, diastolic: values[bottom]!, said: found.said },
    });
  }
  /* Where the pair came from, by devices.json's own label for each source a patient may name. The
     reading's class, sample, use and marks are the contract's for that source, and its weight is
     the Devices domain's arithmetic — never carried by a home cuff. */
  if (active.phase === "reading-source") {
    const source = patientReadingSources().find((s) => stems(s.label).join(" ") === stems(words).join(" "));
    if (!source || !active.pending) return null;
    const reading = readingFrom({ ...active.pending, source: source.id, byRole: "patient" });
    return turn({ ...active, phase: "notes", pending: null, reading, note: null });
  }
  const next = answerIntake(active.state, words);
  if (next.kind === "emergency") return turn({ kind: "emergency", groups: [] });
  return turn(intakeStep(active.group, next));
}

/* The notes as text for the clipboard: the card's title and its lines, each the contract's format
 * filled with her own answer. The clipboard is the person's own; the app stores nothing. */
export const notesText = (reply: IntakeReply): string =>
  [intakeContract.summary.title, ...reply.rows.map((row) => row.line)].join("\n");

export const emergencyAnswer = {
  ...answers.emergency,
  headline: sosEmergency.headline,
  lead: sosEmergency.lead,
  notAnAmbulance: sosEmergency.notAnAmbulance,
};

/* ---- What a reply says out loud ------------------------------------------------------------------
 * The speech seam's read half, the way `cueOf` is the affect seam's. The founder's decision of
 * 19 September 2026 (`voice.webSpeech`) was switched on the next day, and the panel hands every
 * reply's own words to the adapter — so every sentence a patient hears is read from the reply
 * itself, with nothing left to decide, no sentence to find and no number to fetch.
 *
 * The words are the reply's own, exactly as ReplyBody writes them on the panel: every paragraph
 * and list the reply carries, in the order the screen shows them, and nothing it does not carry
 * — no invented summary and no shortened form, because the caption rule the decision writes is
 * that the voice is another reading of the words and never a replacement for them, and a reading
 * that skipped the ambulance numbers or the refusals would be a different answer. Two things
 * beside those words are deliberately not said: a button label is a thing to press rather than a
 * sentence, and the handover's send state is true the moment the reply lands and false the moment
 * she presses Send, so speech that said "not sent" would be stale before it finished. The unread
 * block is part of the turn's answer on the screen, so it is read in its place — and it is a
 * refusal, which is the last thing a spoken reading may be softened by leaving out. */
export function spokenOf(turn: Turn, audience: AudienceId): string {
  const words: string[] = [];
  const add = (...items: string[]) => {
    for (const item of items) if (item) words.push(item);
  };
  /* The numbers are read as they are spoken, number first: a person hearing "one zero one seven
     seven, Ambulance" hears the call-taker's own reading of a telephone number rather than a
     quantity — sos.json's spokenNumbers decision of 23 September 2026 — and the order is the one
     she would read, which is why this function exists at all. The digits stay on the screen beside
     the voice; the reading and the print are two readings of one number, from the same file. */
  const numbers = (ids: string[]) => {
    for (const n of spokenLines(ids)) words.push(`${n.spoken}, ${n.name}.`);
  };
  switch (turn.reply.kind) {
    case "situation":
      add(turn.reply.situation.sentence);
      break;
    case "identity":
      add(identity.whatItIs, identity.whatItIsNot);
      break;
    case "voice":
      add(voice.sentences.web, refusal("no-audio-kept").statement);
      break;
    case "greeting":
      add(answers.greeting.sentence);
      break;
    case "emergency":
      if (turn.reply.groups.length)
        add(
          emergencyAnswer.noticed,
          ...turn.reply.groups.map((g) => `${g.name}.`),
        );
      add(emergencyAnswer.headline, emergencyAnswer.lead);
      numbers(emergencyAnswer.numbers);
      add(emergencyAnswer.notAnAmbulance);
      /* The crisis lines after the ambulance numbers, in the order the screen shows them, and only
         when the crisis words raised this answer — packages/catalog/crisis-lines.json. */
      if (showsCrisisLines(turn.reply.groups)) {
        add(crisisLines.heading);
        /* Read as a telephone number, digit by digit — the spoken form beside each number in
           crisis-lines.json, as sos.json's emergency numbers are — never as a quantity. */
        for (const line of crisisLines.lines)
          words.push(`${line.spoken}, ${line.name}.`);
      }
      break;
    case "unmatched":
      add(
        answers.unmatched.sentence,
        unmatchedDetail(audience),
        answers.unmatched.ifUrgent,
      );
      numbers(answers.unmatched.numbers);
      break;
    case "refusal":
      /* The policy's sentence, whole. It names its own door — a nurse — and no number, because the
         emergency words were asked before this reply existed. */
      add(turn.reply.sentence);
      break;
    case "service":
      /* The heading first, because it is what the screen says first: these words were written by a
         language model rather than read from an approved sentence, and the disclosure beside them
         is read in full — the one spoken reading this contract may never soften by omission. */
      add(
        answers.service.heading,
        turn.reply.text,
        answers.service.disclosure,
        answers.service.ifUrgent,
      );
      numbers(answers.service.numbers);
      break;
    case "reading":
      /* The heading first, as the screen reads it, then every paragraph and the small print in
         the order the screen shows them — the small print is the provenance, and provenance read
         aloud is the one thing a spoken explanation may not leave out. */
      if (turn.reply.answer) {
        add(turn.reply.answer.heading, ...turn.reply.answer.paragraphs);
        /* A far-outside number: the urgent sentence, the red flags and the emergency answer's own
           numbers, read number first as the emergency answer reads them, before anything else. */
        const urgent = turn.reply.answer.urgent;
        if (urgent) {
          add(urgent.ifUnwell, ...urgent.signs.map((s) => `${s}.`));
          numbers(urgent.numbers);
        }
        add(...turn.reply.answer.after);
        add(...turn.reply.answer.smallPrint);
      } else if (turn.reply.ask) add(turn.reply.ask);
      break;
    case "preparation": {
      const p = turn.reply.answer;
      if (p.kind === "none") add(p.sentence);
      else add(p.lead, ...p.items, p.review, p.neverInstructs);
      break;
    }
    case "medicines": {
      const m = turn.reply.answer;
      add(m.heading, m.lead);
      if (m.noMedicines) add(m.noMedicines);
      else add(...m.lines);
      add(m.protectedNotRead, m.neverChanges, m.preview);
      break;
    }
    case "intake": {
      /* In the order the screen shows them: the offer and the stop rule; a question and, for chips,
         its options; the card's title, its lines, the closing or the stopped sentence, the review
         disclosure and the way to a nurse. */
      const w = intakeContract.answer;
      const r = turn.reply;
      if (r.phase === "offer") add(r.group.name, w.opening, w.stop.sentence);
      else if (r.phase === "declined") add(w.consent.declined);
      else if (r.phase === "question" && r.question) {
        add(r.question.ask);
        if (r.question.options) add(`${r.question.options.join(", ")}.`);
      } else if (r.phase === "notes") {
        add(intakeContract.summary.title, ...r.rows.map((row) => `${row.line}.`));
        if (r.reading) add(readingLine(r.reading), ...readingMarks(r.reading));
        add(r.state?.stopped ? w.stop.stopped : w.closing, intakeReviewSentence(), w.arrangeCare);
        if (hasPathway(r.group) && !r.state?.stopped) add(caseScreens.readingLead, caseScreens.askNurseLead);
      } else if (r.phase === "reading") add(r.note ?? caseScreens.readingAsk);
      else if (r.phase === "reading-source") add(caseScreens.readingSourceAsk);
      else if (r.phase === "case-declined") add(caseScreens.notNowSaid);
      else if (r.phase === "case") {
        const view = caseView(r.caseRef);
        add(caseScreens.heading, caseScreens.opened);
        if (view) {
          add(whoHas(view), caseScreens.preview);
          if (view.plan) add(caseScreens.planHeading, caseScreens.planLead, view.plan, caseScreens.planClose);
        }
        add(caseScreens.neverShown);
      }
      break;
    }
    case "case": {
      const view = turn.reply.view;
      add(caseScreens.planHeading);
      if (!view) add(caseScreens.planNoCase);
      else if (!view.plan) add(caseScreens.planNone);
      else add(caseScreens.planLead, view.plan, caseScreens.planClose);
      break;
    }
    case "handover": {
      const h = answers.handover;
      const out = turn.reply.desk.outOfHours;
      add(h.title);
      if (out) {
        add(out.nobody, out.numbers);
        if (out.callback) add(out.callback);
      }
      add(h.lead);
      for (const row of turn.reply.rows)
        words.push(`${row.label}: ${row.value}.`);
      add(
        `${handoverDeskWords.answeredByLabel} ${turn.reply.desk.answeredBy}.`,
      );
      if (turn.reply.summary.urgencyCode === "emergency") add(h.neverLowered);
      add(h.notCarriedHeading, ...h.notCarried.map((item) => item.sentence));
      break;
    }
  }
  if (turn.unread) {
    add(
      answers.unread.sentence,
      answers.unread.detail,
      answers.unread.ifUrgent,
    );
    numbers(answers.unread.numbers);
  }
  /* The tokens are filled once, at the end, with the same values the written words are filled
     with — so a number somebody hears cannot drift from the number she reads beside it. */
  return say(words.join(" "));
}

/* ---- Which language a reply is written in ---------------------------------------------------
 * voice.spokenLanguages, since 23 September 2026: a person may write to GilbertOne in isiZulu and
 * the service may answer in her language, and the voice that reads the reply follows the words
 * rather than the microphone's English-only rule — which stands, because hearing is the founder's
 * decision of 14 September 2026 and the recogniser still hears English only.
 *
 * Only a reply a language model wrote is ever tested, because every approved sentence in the
 * contract is English and a detector run over them could only ever find nothing. The words are
 * counted against the contract's own list — a short list of isiZulu words no English sentence
 * contains — and two must appear, so one loanword in an English answer changes nothing. Detection
 * is a fact about the reply, decided before any voice is asked for, so the seam stays where it
 * always was: lib/voice.ts chooses the voice, this file decides what language the words are. */
export type SpokenLanguage = (typeof voice.spokenLanguages)[number];

export function spokenLanguageOf(reply: Reply): SpokenLanguage | null {
  if (reply.kind !== "service") return null;
  const text = reply.text.toLowerCase();
  for (const language of voice.spokenLanguages) {
    let found = 0;
    for (const word of language.detectWords)
      if (text.includes(word)) found += 1;
    if (found >= 2) return language;
  }
  return null;
}
