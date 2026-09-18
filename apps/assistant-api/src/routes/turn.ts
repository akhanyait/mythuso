import type { AssistantTurnRequest, AssistantTurnResponse } from '../lib/schema';

const emergencyPatterns = [
  /\b(chest pain|cannot breathe|can't breathe|difficulty breathing|heavy bleeding|unconscious|not breathing|stroke|seizure)\b/i,
];
const handoverPatterns = [/\b(nurse|human|person|someone)\b/i, /\btalk to someone\b/i];
const identityPatterns = [/\b(who are you|what are you|gilbertone)\b/i];
const voicePatterns = [/\b(voice|microphone|mic|speech)\b/i];

const response = (
  route: AssistantTurnResponse['route'],
  classification: AssistantTurnResponse['classification'],
  reply: string,
  style: AssistantTurnResponse['style'],
  suggestedActions: string[] = [],
  requiresConfirmation = false,
): AssistantTurnResponse => ({
  turnId: crypto.randomUUID(),
  route,
  classification,
  reply,
  style,
  requiresConfirmation,
  suggestedActions,
});

export async function handleTurn(req: AssistantTurnRequest): Promise<AssistantTurnResponse> {
  if (!req || typeof req.text !== 'string' || !req.text.trim()) {
    return response('clarify', 'clarify', 'Please tell me what you need help with.', 'clarifying', ['clarify_message']);
  }

  if (!req.userConsent) {
    return response('unknown', 'unknown', 'Please confirm before I process your message.', 'neutral', ['confirm_message'], true);
  }

  const text = req.text.trim();
  if (emergencyPatterns.some(pattern => pattern.test(text))) {
    return response(
      'emergency',
      'emergency',
      'If this may be an emergency, call local emergency services now. Do not wait for this assistant.',
      'supportive',
      ['call_emergency_services'],
    );
  }
  if (handoverPatterns.some(pattern => pattern.test(text))) {
    return response('handover', 'handover', 'I can help prepare a handover to a care team member.', 'supportive', ['request_handover']);
  }
  if (identityPatterns.some(pattern => pattern.test(text))) {
    return response('standard', 'identity', 'I am GilbertOne, a care-navigation assistant. I cannot diagnose or prescribe.', 'neutral', ['understand_information']);
  }
  if (voicePatterns.some(pattern => pattern.test(text))) {
    return response('standard', 'voice', 'Voice input is optional. Review the transcript before sending it.', 'neutral', ['review_transcript']);
  }

  return response('standard', 'care', 'I can help with care navigation and general information.', 'concise', ['arrange_care', 'understand_information']);
}
