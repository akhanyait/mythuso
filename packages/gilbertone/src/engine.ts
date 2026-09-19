export type MessageClassification =
  | 'emergency'
  | 'handover'
  | 'identity'
  | 'voice'
  | 'care'
  | 'clarify'
  | 'unknown';

export type ResponseStyle = 'supportive' | 'neutral' | 'clarifying' | 'concise';

export type MessageRoute = 'emergency' | 'handover' | 'standard' | 'clarify' | 'unknown';

export type EngineResponse = {
  classification: MessageClassification;
  route: MessageRoute;
  reply: string;
  style: ResponseStyle;
  requiresConfirmation: boolean;
  suggestedActions: string[];
};

/* Who a message is from, as the demo login chose it — the same six ids as the RoleIds in
   apps/web/src/lib/roles.ts and the audiences section of packages/catalog/assistant.json, and
   scripts/check-boundaries.mjs fails the build if the three lists disagree. The audience is
   declared, never authenticated, so the engine draws only one line with it: the patient, and a
   staff preview. The per-audience wording a person reads is the contract's business; the route
   is this engine's. */
export type Audience = 'patient' | 'nurse' | 'doctor' | 'partner' | 'control-tower' | 'back-office';

export const audiences: readonly Audience[] = ['patient', 'nurse', 'doctor', 'partner', 'control-tower', 'back-office'];

const isStaff = (audience: Audience) => audience !== 'patient';

const emergencyTerms = [
  'hurt myself',
  'hurt myself',
  'suicide',
  'kill myself',
  'end my life',
  'self harm',
  'self-harm',
  'cant breathe',
  'can\'t breathe',
  'short of breath',
  'severe bleeding',
  'bleeding heavily',
  'chest pain',
  'heart pain',
  'unconscious',
  'fainting',
  'seizure',
  'overdose',
  'not breathing',
  'trouble breathing',
  'pass out'
];

const handoverTerms = [
  'talk to a nurse',
  'speak to a nurse',
  'can i talk to a nurse',
  'real person',
  'human',
  'call a nurse',
  'need a nurse',
  'talk to someone',
  'speak to someone'
];

const identityTerms = [
  'who are you',
  'what are you',
  'are you a doctor',
  'are you human',
  'are you a person',
  'what is gilbertone',
  'who is gilbertone',
  'are you real'
];

const voiceTerms = [
  'what happens to what i say',
  'can you hear me',
  'can you listen',
  'are you listening',
  'record my voice',
  'record me',
  'microphone',
  'my voice'
];

const careTerms = [
  'when is my nurse coming',
  'nurse coming',
  'next visit',
  'my visit',
  'results back',
  'lab results',
  'blood results',
  'are my results back',
  'book a nurse',
  'book nurse',
  'booking',
  'care',
  'help arranging care',
  'my team registered',
  'registered'
];

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some(term => text.includes(term));
}

export function classifyMessage(input: string, audience: Audience = 'patient'): MessageClassification {
  const text = normalizeText(input);
  if (!text) return 'unknown';
  if (containsAny(text, emergencyTerms)) return 'emergency';
  /* The handover route and the care terms are a patient's words: the nurse queue a handover
     offers belongs to a patient's conversation, and the care terms ask about the patient's own
     visit. Behind a staff preview the same words are not that request, so they fall through to
     unknown and the caller's matcher answers in that audience's own words. The emergency terms
     sit above the scoping on purpose: an emergency word does not stop being one because a nurse
     or an operator is saying it. */
  if (audience === 'patient' && containsAny(text, handoverTerms)) return 'handover';
  if (containsAny(text, identityTerms)) return 'identity';
  if (containsAny(text, voiceTerms)) return 'voice';
  if (audience === 'patient' && containsAny(text, careTerms)) return 'care';
  if (/\b(i do ?not understand|i dont understand|confused|unclear|what does this mean|help me understand)\b/.test(text)) return 'clarify';
  return 'unknown';
}

export function buildResponse(input: string, audience: Audience = 'patient'): EngineResponse {
  const classification = classifyMessage(input, audience);

  switch (classification) {
    case 'emergency':
      return {
        classification,
        route: 'emergency',
        style: 'supportive',
        reply: 'This may be an emergency. Please seek urgent medical help now or contact emergency services right away. If you are in immediate danger, call emergency services without delay.',
        requiresConfirmation: false,
        suggestedActions: ['call_emergency_services', 'seek_urgent_help']
      };

    case 'handover':
      return {
        classification,
        route: 'handover',
        style: 'neutral',
        reply: 'I can help you with the next step. I can guide you toward arranging care or speaking with a nurse, but I am not a clinician.',
        requiresConfirmation: true,
        suggestedActions: ['open_care_navigation', 'request_nurse_support']
      };

    case 'identity':
      return {
        classification,
        route: 'standard',
        style: 'neutral',
        reply: 'I am GilbertOne, your MyThuso agent. I am not a person or a clinician, and I do not diagnose or prescribe.',
        requiresConfirmation: false,
        suggestedActions: ['continue']
      };

    case 'voice':
      return {
        classification,
        route: 'standard',
        style: 'clarifying',
        reply: 'I do not keep audio recordings by default. If you are using speech on a browser or phone, that service may handle the audio outside this app. You can type instead.',
        requiresConfirmation: false,
        suggestedActions: ['type_message']
      };

    case 'care':
      return {
        classification,
        route: 'standard',
        style: 'concise',
        reply: 'I can help with care navigation and general information. If this is about arranging care, understanding information, or a visit, tell me what you need in one sentence.',
        requiresConfirmation: false,
        suggestedActions: ['arrange_care', 'understand_information']
      };

    case 'clarify':
      /* A staff preview is offered the three universal questions and nothing else, so the one
         clear next step it is asked for is one of those. */
      return isStaff(audience)
        ? {
            classification,
            route: 'clarify',
            style: 'clarifying',
            reply: 'I need one clear next step. In this simulated session I answer what I am, what happens to what is said, and emergencies.',
            requiresConfirmation: false,
            suggestedActions: ['identity', 'voice', 'emergency']
          }
        : {
            classification,
            route: 'clarify',
            style: 'clarifying',
            reply: 'I can help, but I need one clear next step. Are you trying to arrange care, understand information you received, or speak to a nurse?',
            requiresConfirmation: false,
            suggestedActions: ['arrange_care', 'understand_information', 'speak_to_nurse']
          };

    case 'unknown':
    default:
      /* A staff preview is outside its scope, and the reply says the scope rather than offering the
         patient's doors: the stock levels a partner asks about are real work in a real workspace, and
         "arrange care or speak to a nurse" would be a patient's answer pasted onto somebody else's. */
      return isStaff(audience)
        ? {
            classification: 'unknown',
            route: 'unknown',
            style: 'neutral',
            reply: 'I can help with what I am, what happens to what is said, and emergencies. This is a simulated session, and what your workspace holds is not mine to read.',
            requiresConfirmation: false,
            suggestedActions: ['identity', 'voice', 'emergency']
          }
        : {
            classification: 'unknown',
            route: 'unknown',
            style: 'neutral',
            reply: 'I can help with care navigation, approved general information, and next steps. Please tell me whether you need help arranging care, understanding information, or speaking to a nurse.',
            requiresConfirmation: false,
            suggestedActions: ['arrange_care', 'understand_information', 'speak_to_nurse']
          };
  }
}

export function evaluateMessage(input: string, audience: Audience = 'patient'): EngineResponse {
  return buildResponse(input, audience);
}
