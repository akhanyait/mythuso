import type { AssistantTurnRequest, AssistantTurnResponse } from '../lib/schema';

export async function handleTurn(req: AssistantTurnRequest): Promise<AssistantTurnResponse> {
  if (!req.userConsent) {
    return {
      turnId: crypto.randomUUID(),
      route: 'unknown',
      classification: 'unknown',
      reply: 'Please confirm before I process your message.',
      style: 'neutral',
      requiresConfirmation: true,
      suggestedActions: ['confirm_message'],
    };
  }

  return {
    turnId: crypto.randomUUID(),
    route: 'standard',
    classification: 'care',
    reply: 'I can help with care navigation and general information.',
    style: 'concise',
    requiresConfirmation: false,
    suggestedActions: ['arrange_care', 'understand_information'],
  };
}
