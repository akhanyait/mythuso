/* Facts already on file for the signed-in patient.
   signedInPatientContext is the packet. guidanceFromRecord is the chat reply:
   a short answer to what was just said, then at most two record facts that
   change the advice. It does not read the chart back. The public page must
   not import this. Nothing here is invented. */

import { sandboxState } from "../../../../packages/thusoiq/fixtures.ts";
import {
  documents,
  flagFor,
  formatValue,
  holder,
  labelOf,
  lastReview,
  latestSet,
  measureSpec,
  onRecord,
  readingSets,
} from "./passport";
import { numberById } from "./sos";
import { formatReading, markedFor, readingsFor } from "./triage-markers";
import { connectorsUsedFor } from "./gilbertone-sources";
import { referencesUsedFor } from "./gilbertone-reference-scout";

const PATIENT_ID = "demo-lerato";

export type ContextPacket = {
  patient: string;
  lines: string[];
  missing: string[];
};

const flagWord = (id: string, value: number) => {
  const flag = flagFor(id as never, value);
  if (flag === "high") return "above the indicative range";
  if (flag === "low") return "below the indicative range";
  if (flag === "normal") return "inside the indicative range";
  return "not compared with a range";
};

export function signedInPatientContext(): ContextPacket {
  const lines: string[] = [];
  const missing: string[] = [];
  const patient = sandboxState().patients.find((row) => row.id === PATIENT_ID);

  if (holder?.name) lines.push(`Health Passport holder: ${holder.name} (${holder.passportId}).`);
  else missing.push("The Health Passport holder is not loaded.");

  if (readingSets.length && latestSet) {
    const bits = Object.entries(latestSet.values).flatMap(([id, value]) => {
      if (value === undefined) return [];
      const spec = measureSpec(id as never);
      return [`${spec.label} ${formatValue(id as never, value)} ${spec.unit} (${flagWord(id, value)})`];
    });
    lines.push(
      `Health Passport vitals, sample home readings, latest on ${labelOf(latestSet.dayOffset)}: ${bits.join("; ")}. ${onRecord}`,
    );
    const noted = readingSets.filter((set) => set.note);
    for (const set of noted) {
      lines.push(`Reading note on ${labelOf(set.dayOffset)}: ${set.note}.`);
    }
  } else missing.push("Health Passport vitals are not on file.");

  const door = readingsFor(PATIENT_ID);
  if (door) {
    const bits = markedFor(PATIENT_ID)
      .filter((row) => row.value !== undefined)
      .map((row) => `${row.spec.label} ${formatReading(row.spec, row.value!)} ${row.spec.unit} (triage marker: ${row.marker})`);
    lines.push(
      `Triage vitals for ${PATIENT_ID}, taken at the door ${door.minutesAgo} minutes ago by ${door.by}: ${bits.join("; ")}. These are the preview series, not a live monitor.`,
    );
  } else missing.push("Triage vitals for the signed-in patient are not on file.");

  if (documents.length) {
    const docs = documents.map((doc) => {
      const reviewed = doc.reviewed ? "a doctor has reviewed it" : "it is awaiting review";
      return `${doc.name} (${doc.kind}, issued ${labelOf(doc.dayOffset)}, ${reviewed})`;
    });
    lines.push(`Documents on the Health Passport: ${docs.join("; ")}.`);
  } else missing.push("No test documents are on the Health Passport.");

  const lab = documents.find((doc) => /laborator|patholog/i.test(`${doc.name} ${doc.kind}`));
  if (lab) missing.push("The pathology document does not include laboratory numbers in this app, so none are stated.");
  else missing.push("No laboratory report is on file.");

  if (lastReview?.assessment) {
    lines.push(
      `Last clinical review on ${labelOf(lastReview.reviewedDayOffset)}: ${lastReview.assessment} Plan on record: ${lastReview.plan} Next on record: ${lastReview.next}`,
    );
  } else missing.push("There is no clinical review summary on the Health Passport.");

  if (patient) {
    lines.push(`Allergy line on the sandbox record: ${patient.allergies}.`);
    if (!patient.allergiesReviewed) missing.push("Allergy reconciliation is not marked reviewed.");
    const consult = sandboxState().consultations.find((row) => row.patientId === PATIENT_ID);
    if (consult) {
      const notes = consult.notes;
      if (notes.subjective) lines.push(`Current consultation, subjective, as written: ${notes.subjective}`);
      if (notes.objective) lines.push(`Current consultation, objective, as written: ${notes.objective}`);
      if (!notes.assessment?.trim()) missing.push("The current consultation has no assessment written.");
      else lines.push(`Current consultation assessment: ${notes.assessment}`);
      if (!notes.plan?.trim()) missing.push("The current consultation has no plan written.");
      else lines.push(`Current consultation plan: ${notes.plan}`);
    } else missing.push("There is no consultation note for this patient.");
    const wearable = sandboxState().wearableConnections.find((row) => row.patientId === PATIENT_ID);
    if (!wearable?.enabled) missing.push("No wearable readings are connected.");
  } else missing.push("The sandbox patient record for the signed-in person is not loaded.");

  return { patient: holder?.name ?? PATIENT_ID, lines, missing };
}

const CLINICAL = /\b(pain|ache|hurt|heartburn|burn|reflux|indigestion|nausea|fever|cough|dizzy|dizziness|sick|symptom|blood|pressure|glucose|sugar|result|test|lab|laboratory|unwell|headache|vomit|diarrhoea|diarrhea|rash|breath|chest|stomach|belly|sore|swelling|bleed|reading|vital|record|history|allerg|medicine|medication|feel)\b/i;
const HEARTBURN = /\b(heartburn|heart burn|reflux|indigestion)\b/i;
const BARE_GREETING = /^(hi|hello|hey|howzit|sawubona|good morning|good afternoon|good evening)[.!\s]*$/i;

export const messageUsesRecord = (text: string) => CLINICAL.test(text) && !BARE_GREETING.test(text.trim());

/* Greetings and anything the approved list cannot place are answered here, for the
   signed-in patient. Emergencies and refusals stay on the deterministic path.
   Passport, results, notes, and vitals are not read until a one-fact tool exists. */
export function prefersLocalConversation(text: string, replyKind: string): boolean {
  if (replyKind === "emergency" || replyKind === "refusal") return false;
  if (BARE_GREETING.test(text.trim())) return true;
  return replyKind === "unmatched";
}

const SCOPE = "I can share general health information, or help you decide when to speak to a nurse. I can't diagnose, prescribe, or explain what a result means.";
const NOT_A_DIAGNOSIS = "A nurse or a doctor makes those decisions.";

const urgentLine = () => {
  const ambulance = numberById("ambulance").number;
  const mobile = numberById("mobile").number;
  return `If it might be urgent — chest pain or tightness, pain into the arm or jaw, trouble breathing, vomiting blood, or black stools — call ${ambulance} or ${mobile}. Do not wait on this chat.`;
};

function earlierLine(earlier: readonly string[]): string | null {
  const prior = earlier.map((line) => line.trim()).filter(Boolean);
  if (!prior.length) return null;
  const last = prior[prior.length - 1].replace(/\s+/g, " ");
  const clip = last.length > 120 ? `${last.slice(0, 117)}…` : last;
  return `Earlier you said “${clip}”.`;
}

function heartburnReply(earlier: readonly string[]): string {
  const parts = [
    "I am sorry you have heartburn. Smaller meals, staying upright after you eat, and not lying flat are common things people try while they arrange care. I will not name a dose or a cause.",
    "Get care the same day if it keeps coming back, swallowing is painful, or you are worried.",
  ];
  const prior = earlierLine(earlier);
  if (prior) parts.push(prior);
  parts.push(urgentLine(), NOT_A_DIAGNOSIS);
  return parts.join("\n\n");
}

function conversationalReply(message: string, earlier: readonly string[]): string {
  const said = message.trim().replace(/\s+/g, " ");
  const clip = said.length > 160 ? `${said.slice(0, 157)}…` : said;
  const prior = earlierLine(earlier);
  if (!CLINICAL.test(said)) {
    const parts = [`I'm here. ${SCOPE}`];
    if (prior) parts.push(prior);
    return parts.join("\n\n");
  }
  const parts = [
    `I hear you: “${clip}”. I can talk that through with you. I cannot tell you what it is from here.`,
    "If it is mild, note when it started and what makes it better or worse, and rest. If it is severe, sudden, or you are frightened by it, do not wait on this chat.",
  ];
  if (prior) parts.push(prior);
  parts.push(urgentLine(), NOT_A_DIAGNOSIS);
  return parts.join("\n\n");
}

export function guidanceFromRecord(
  message: string,
  earlier: readonly string[],
): { text: string; sources: readonly string[] } {
  const trimmed = message.trim();
  const body = BARE_GREETING.test(trimmed)
    ? `Hello. Tell me what you need, in your own words. ${SCOPE}`
    : HEARTBURN.test(trimmed)
      ? heartburnReply(earlier)
      : conversationalReply(trimmed, earlier);
  /* Names only. Approved public references whose topics are in this message,
     then any connector whose card shares a word with it. No connector sentence
     and no page text is added to the reply. A greeting names nothing. */
  if (BARE_GREETING.test(trimmed)) return { text: body, sources: [] };
  const references = referencesUsedFor(trimmed).map((source) => source.name);
  const used = connectorsUsedFor(trimmed);
  return {
    text: body,
    sources: [...references, ...used.map((card) => card.name)],
  };
}
