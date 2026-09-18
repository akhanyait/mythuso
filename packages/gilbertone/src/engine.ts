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

export function classifyMessage(input: string): MessageClassification {
  const text = normalizeText(input);
  if (!text) return 'unknown';
  if (containsAny(text, emergencyTerms)) return 'emergency';
  if (containsAny(text, handoverTerms)) return 'handover';
  if (containsAny(text, identityTerms)) return 'identity';
  if (containsAny(text, voiceTerms)) return 'voice';
  if (containsAny(text, careTerms)) return 'care';
  if (/\b(i do ?not understand|i dont understand|confused|unclear|what does this mean|help me understand)\b/.test(text)) return 'clarify';
  return 'unknown';
}

export function buildResponse(input: string): EngineResponse {
  const classification = classifyMessage(input);

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
      return {
        classification,
        route: 'clarify',
        style: 'clarifying',
        reply: 'I can help, but I need one clear next step. Are you trying to arrange care, understand information you received, or speak to a nurse?',
        requiresConfirmation: false,
        suggestedActions: ['arrange_care', 'understand_information', 'speak_to_nurse']
      };

    case 'unknown':
    default:
      return {
        classification: 'unknown',
        route: 'unknown',
        style: 'neutral',
        reply: 'I can help with care navigation, approved general information, and next steps. Please tell me whether you need help arranging care, understanding information, or speaking to a nurse.',
        requiresConfirmation: false,
        suggestedActions: ['arrange_care', 'understand_information', 'speak_to_nurse']
      };
  }
}

export function evaluateMessage(input: string): EngineResponse {
  return buildResponse(input);
}
