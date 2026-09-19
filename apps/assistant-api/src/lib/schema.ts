import type { Audience } from '../../../../packages/gilbertone/src/engine.ts';

export type AssistantTurnRequest = {
  sessionId?: string;
  text: string;
  visitId?: string;
  /* Declared by the caller, never authenticated — the audience decision of 19 September 2026. */
  audience?: Audience;
  userConsent: boolean;
};

export type AssistantTurnResponse = {
  turnId: string;
  route: 'emergency' | 'handover' | 'standard' | 'clarify' | 'unknown';
  classification: 'emergency' | 'handover' | 'identity' | 'voice' | 'care' | 'clarify' | 'unknown';
  reply: string;
  style: 'supportive' | 'neutral' | 'clarifying' | 'concise';
  requiresConfirmation: boolean;
  suggestedActions: string[];
};
