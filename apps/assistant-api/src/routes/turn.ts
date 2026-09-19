import { audiences, evaluateMessage, type Audience, type EngineResponse } from '../../../../packages/gilbertone/src/engine.ts';
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

  /* The audience is declared by the caller, never authenticated — the same rule the demo login's
     role parameter follows — and a value the engine does not carry means the patient's, because
     that is what a request without one means. */
  const asked = req.audience;
  const audience: Audience =
    typeof asked === 'string' && (audiences as readonly string[]).includes(asked) ? asked : 'patient';
  return response(evaluateMessage(req.text, audience));
}
