import { evaluateMessage, type EngineResponse } from '../../../../packages/gilbertone/src/engine.ts';
import type { AssistantTurnRequest, AssistantTurnResponse } from '../lib/schema.ts';

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
  /* The engine's own classification of '' is 'unknown', which is right for a low-level classifier
     with nothing to go on. At this boundary "nothing was said" is not the same fact as "the
     message could not be classified", and a caller who typed or spoke nothing deserves to be asked
     for one, not told the assistant is uncertain about a message it never received. */
  if (!req || typeof req.text !== 'string' || !req.text.trim()) {
    return {
      turnId: crypto.randomUUID(),
      route: 'clarify',
      classification: 'clarify',
      reply: 'Please tell me what you need help with.',
      style: 'clarifying',
      requiresConfirmation: false,
      suggestedActions: ['clarify_message'],
    };
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
