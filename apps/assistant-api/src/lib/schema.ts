export type AssistantTurnRequest = {
  sessionId?: string;
  text: string;
  visitId?: string;
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
