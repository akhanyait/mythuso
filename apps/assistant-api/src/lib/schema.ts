import type { Audience } from '../../../../packages/gilbertone/src/engine.ts';

export type AssistantTurnRequest = {
  sessionId?: string;
  /* The turn this one follows, when the caller keeps its own chain. Left out, the server links
     the turn to the previous one in the session it holds. */
  parentTurnId?: string;
  text: string;
  visitId?: string;
  /* Declared by the caller, never authenticated — the audience decision of 19 September 2026. */
  audience?: Audience;
  userConsent: boolean;
};

export type AssistantTurnResponse = {
  turnId: string;
  /* Minted by the server when the request carried none, so every response names the conversation
     it belongs to and a caller can continue it. */
  sessionId: string;
  route: 'emergency' | 'handover' | 'standard' | 'clarify' | 'unknown';
  classification: 'emergency' | 'handover' | 'identity' | 'voice' | 'care' | 'clarify' | 'unknown';
  reply: string;
  style: 'supportive' | 'neutral' | 'clarifying' | 'concise';
  /* The classifier's own weight behind the classification, 0 to 1. */
  confidence: number;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  /* Present only when a refusal policy answered instead of the classifier — the id of the
     policy in packages/catalog/assistant.json's refusalPolicies. */
  refusalId?: string;
};
