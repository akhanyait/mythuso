import type { ConversationContext } from "./conversation.ts";
import assistant from "../../catalog/assistant.json" with { type: "json" };

export type MessageClassification =
  | "emergency"
  | "handover"
  | "identity"
  | "voice"
  | "care"
  | "greeting"
  | "clarify"
  | "unknown";

export type ResponseStyle = "supportive" | "neutral" | "clarifying" | "concise";

export type MessageRoute =
  | "emergency"
  | "handover"
  | "standard"
  | "clarify"
  | "unknown";

export type EngineResponse = {
  classification: MessageClassification;
  route: MessageRoute;
  reply: string;
  style: ResponseStyle;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  /* How sure the classifier is of the classification beside it, from 0 (nothing matched) to 1
     (one thing matched, or a match the conversation has been about). Existing callers that read
     only the fields above see exactly what they saw before this field existed. */
  confidence: number;
};

/* What classifyWithConfidence answers: the classification the engine has always returned, plus
   the weight behind it. */
export type ClassificationResult = {
  classification: MessageClassification;
  confidence: number;
};

/* Who a message is from, as the demo login chose it — the same six ids as the RoleIds in
   apps/web/src/lib/roles.ts and the audiences section of packages/catalog/assistant.json, and
   scripts/check-boundaries.mjs fails the build if the three lists disagree. The audience is
   declared, never authenticated, so the engine draws only one line with it: the patient, and a
   staff preview. The per-audience wording a person reads is the contract's business; the route
   is this engine's. */
export type Audience =
  | "patient"
  | "nurse"
  | "doctor"
  | "partner"
  | "control-tower"
  | "back-office";

export const audiences: readonly Audience[] = [
  "patient",
  "nurse",
  "doctor",
  "partner",
  "control-tower",
  "back-office",
];

const isStaff = (audience: Audience) => audience !== "patient";

const emergencyTerms = [
  "hurt myself",
  "hurt myself",
  "suicide",
  "kill myself",
  "end my life",
  "self harm",
  "self-harm",
  "cant breathe",
  "can't breathe",
  "short of breath",
  "severe bleeding",
  "bleeding heavily",
  "chest pain",
  "heart pain",
  "unconscious",
  "fainting",
  "seizure",
  "overdose",
  "not breathing",
  "trouble breathing",
  "pass out",
];

const handoverTerms = [
  "talk to a nurse",
  "speak to a nurse",
  "can i talk to a nurse",
  "real person",
  "human",
  "call a nurse",
  "need a nurse",
  "talk to someone",
  "speak to someone",
];

const identityTerms = [
  "who are you",
  "what are you",
  "are you a doctor",
  "are you human",
  "are you a person",
  "what is gilbertone",
  "who is gilbertone",
  "are you real",
];

const voiceTerms = [
  "what happens to what i say",
  "can you hear me",
  "can you listen",
  "are you listening",
  "record my voice",
  "record me",
  "microphone",
  "my voice",
];

const careTerms = [
  "when is my nurse coming",
  "nurse coming",
  "next visit",
  "my visit",
  "results back",
  "lab results",
  "blood results",
  "are my results back",
  "book a nurse",
  "book nurse",
  "booking",
  "care",
  "help arranging care",
  "my team registered",
  "registered",
];

/* The words people open with before they ask anything, in the languages this product greets in.
   The list is matched word by word rather than as pieces of the text — see the `whole` note below —
   because "hi" lives inside "this" and "hey" inside "they", and a greeting fired by an ordinary
   word would answer the wrong message. The engine does not translate a greeting the way a person
   would; it recognises the word so that the reply can be warm in English, which is the only
   language every sentence in this build is written in. */
const greetingTerms = [
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "howzit",
  "sawubona",
  "dumelang",
  "molweni",
  "dumela",
  "hallo",
  "molo",
  "sanibonani",
  "lotjhani",
];

/* The categories the classifier asks, in the order it has always asked them. Emergency first,
   whatever else the message said; then a patient's own words — the nurse queue a handover offers
   belongs to a patient's conversation, and the care terms ask about the patient's own visit, so
   behind a staff preview those two fall through and the caller's matcher answers in that
   audience's own words. A greeting comes after every question the engine has a real answer for —
   "hello, when is my nurse coming?" is a care question with a greeting in front of it — and before
   the ask for one clear next step, because "hello" on its own is not something to restate. Like
   the handover and the care terms, the greeting words are a patient's opening, so behind a staff
   preview they fall through too. The emergency terms sit above the scoping on purpose: an
   emergency word does not stop being one because a nurse or an operator is saying it. */
type CategoryMatch = {
  classification: MessageClassification;
  terms?: readonly string[];
  pattern?: RegExp;
  patientOnly?: boolean;
  /* Some terms are whole words that live inside longer ones — "hi" is inside "this", "hey" inside
     "they" — so a category marked `whole` matches its terms between word edges instead of anywhere
     in the text. Without it, "I do not understand this" would classify as a greeting and never
     reach the clarify ask it belongs to. */
  whole?: boolean;
};

const categories: readonly CategoryMatch[] = [
  { classification: "emergency", terms: emergencyTerms },
  { classification: "handover", terms: handoverTerms, patientOnly: true },
  { classification: "identity", terms: identityTerms },
  { classification: "voice", terms: voiceTerms },
  { classification: "care", terms: careTerms, patientOnly: true },
  { classification: "greeting", terms: greetingTerms, patientOnly: true, whole: true },
  {
    classification: "clarify",
    pattern:
      /\b(i do ?not understand|i dont understand|confused|unclear|what does this mean|help me understand)\b/,
  },
];

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/* A category marked `whole` matches its terms between word edges instead of anywhere in the text —
   see the note on CategoryMatch. The text is padded with one space either side so that a term at
   the very start or end of the message has the same edges to match as one in the middle. */
function containsWhole(text: string, terms: readonly string[]): boolean {
  const edged = ` ${text} `;
  return terms.some((term) => edged.includes(` ${term} `));
}

const matchesCategory = (
  text: string,
  category: CategoryMatch,
  audience: Audience,
): boolean => {
  if (category.patientOnly && audience !== "patient") return false;
  if (category.terms)
    return category.whole
      ? containsWhole(text, category.terms)
      : containsAny(text, category.terms);
  return category.pattern ? category.pattern.test(text) : false;
};

/* The classifier, with its confidence. A message that matched exactly one category is fully that
   category — 1.0. A message that is several things at once is divided among them, and the
   strongest (the first in the list above) wins, so "who are you, can you hear me" answers as
   identity at half confidence rather than picking whichever was checked last. Nothing matched is
   'unknown' at 0. Context lifts a match the last two turns already were — a conversation about
   visits that asks another visit question is more certain about it — by 0.15, never past 1. */
export function classifyWithConfidence(
  input: string,
  audience: Audience = "patient",
  context?: ConversationContext,
): ClassificationResult {
  const text = normalizeText(input);
  if (!text) return { classification: "unknown", confidence: 0 };
  const matched = categories.filter((category) =>
    matchesCategory(text, category, audience),
  );
  if (!matched.length) return { classification: "unknown", confidence: 0 };
  const classification = matched[0].classification;
  const base = matched.length === 1 ? 1 : 1 / matched.length;
  const lastTwo = (context?.recentClassifications ?? []).slice(-2);
  const agreed =
    lastTwo.length === 2 && lastTwo.every((prior) => prior === classification);
  return {
    classification,
    confidence: Math.min(1, base + (agreed ? 0.15 : 0)),
  };
}

/* The classification alone, exactly as every caller before the confidence field received it. */
export function classifyMessage(
  input: string,
  audience: Audience = "patient",
): MessageClassification {
  return classifyWithConfidence(input, audience).classification;
}

export function buildResponse(
  input: string,
  audience: Audience = "patient",
): EngineResponse {
  const { classification, confidence } = classifyWithConfidence(
    input,
    audience,
  );
  return { ...responseFor(classification, audience), confidence };
}

/* The reply for a classification, byte for byte the replies this engine has always given. The
   confidence never travels in here: the words are the contract's, and only the weight beside
   them is the classifier's. */
function responseFor(
  classification: MessageClassification,
  audience: Audience,
): Omit<EngineResponse, "confidence"> {
  switch (classification) {
    case "emergency":
      return {
        classification,
        route: "emergency",
        style: "supportive",
        reply:
          "This may be an emergency. Please seek urgent medical help now or contact emergency services right away. If you are in immediate danger, call emergency services without delay.",
        requiresConfirmation: false,
        suggestedActions: ["call_emergency_services", "seek_urgent_help"],
      };

    case "handover":
      return {
        classification,
        route: "handover",
        style: "neutral",
        reply:
          "I can help you with the next step. I can guide you toward arranging care or speaking with a nurse, but I am not a clinician.",
        requiresConfirmation: true,
        suggestedActions: ["open_care_navigation", "request_nurse_support"],
      };

    case "identity":
      return {
        classification,
        route: "standard",
        style: "neutral",
        reply:
          "I am GilbertOne, your MyThuso agent. I am not a person or a clinician, and I do not diagnose or prescribe.",
        requiresConfirmation: false,
        suggestedActions: ["continue"],
      };

    case "voice":
      return {
        classification,
        route: "standard",
        style: "clarifying",
        reply:
          "I do not keep audio recordings by default. If you are using speech on a browser or phone, that service may handle the audio outside this app. You can type instead.",
        requiresConfirmation: false,
        suggestedActions: ["type_message"],
      };

    case "care":
      return {
        classification,
        route: "standard",
        style: "concise",
        reply:
          "I can help with care navigation and general information. If this is about arranging care, understanding information, or a visit, tell me what you need in one sentence.",
        requiresConfirmation: false,
        suggestedActions: ["arrange_care", "understand_information"],
      };

    case "greeting":
      /* The greeting sits below care, so this case is reached only when the hello is everything the
         engine recognises: a greeting in front of a real question answers as the question. The
         words beside a hello that matched nothing else are the greeting's to consume — a greeting
         classification is a decision about the whole message, so no caller renders an unread
         remainder beside it (the web's rule since 21 September 2026). Its sentence is read from
         the contract — answers.greeting.sentence in packages/catalog/assistant.json — where a warm
         hello can be reworded by the people accountable for it rather than typed into this file. */
      return {
        classification,
        route: "standard",
        style: "supportive",
        reply: assistant.answers.greeting.sentence,
        requiresConfirmation: false,
        suggestedActions: [
          "arrange_care",
          "understand_information",
          "speak_to_nurse",
        ],
      };

    case "clarify":
      /* A staff preview is offered the three universal questions and nothing else, so the one
         clear next step it is asked for is one of those. */
      return isStaff(audience)
        ? {
            classification,
            route: "clarify",
            style: "clarifying",
            reply:
              "I need one clear next step. In this simulated session I answer what I am, what happens to what is said, and emergencies.",
            requiresConfirmation: false,
            suggestedActions: ["identity", "voice", "emergency"],
          }
        : {
            classification,
            route: "clarify",
            style: "clarifying",
            reply:
              "I can help, but I need one clear next step. Are you trying to arrange care, understand information you received, or speak to a nurse?",
            requiresConfirmation: false,
            suggestedActions: [
              "arrange_care",
              "understand_information",
              "speak_to_nurse",
            ],
          };

    case "unknown":
    default:
      /* A staff preview is outside its scope, and the reply says the scope rather than offering the
         patient's doors: the stock levels a partner asks about are real work in a real workspace, and
         "arrange care or speak to a nurse" would be a patient's answer pasted onto somebody else's. */
      return isStaff(audience)
        ? {
            classification: "unknown",
            route: "unknown",
            style: "neutral",
            reply:
              "I can help with what I am, what happens to what is said, and emergencies. This is a simulated session, and what your workspace holds is not mine to read.",
            requiresConfirmation: false,
            suggestedActions: ["identity", "voice", "emergency"],
          }
        : {
            classification: "unknown",
            route: "unknown",
            style: "neutral",
            reply:
              "I can help with care navigation, approved general information, and next steps. Please tell me whether you need help arranging care, understanding information, or speaking to a nurse.",
            requiresConfirmation: false,
            suggestedActions: [
              "arrange_care",
              "understand_information",
              "speak_to_nurse",
            ],
          };
  }
}

export function evaluateMessage(
  input: string,
  audience: Audience = "patient",
): EngineResponse {
  return buildResponse(input, audience);
}
