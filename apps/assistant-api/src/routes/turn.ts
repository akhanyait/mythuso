import { evaluateMessage, type EngineResponse } from '../../../../packages/gilbertone/src/engine.ts';
import type { AssistantTurnRequest, AssistantTurnResponse } from '../lib/schema';

const response = (turn: EngineResponse): AssistantTurnResponse => ({
  turnId: crypto.randomUUID(),
  route: turn.route,
  classification: turn.classification,
  reply: turn.reply,
  style: turn.style,
  requiresConfirmation: turn.requiresConfirmation,
  suggestedActions: turn.suggestedActions,
});

export async function handleTurn(req: AssistantTurnRequest): Promise<AssistantTurnResponse> {
  if (!req || typeof req.text !== 'string' || !req.text.trim()) {
    return response(evaluateMessage(''));
  }

  if (req.userConsent !== true) {
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

  return response(evaluateMessage(req.text));
}
