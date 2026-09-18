import { evaluateMessage } from '../../../../packages/gilbertone/src/index.ts';
import { handOver, send, type Turn } from './assistant.ts';
import type { Visit } from './scheduling.ts';

/**
 * Phase 1 bridge: the English engine owns the first safety and intent decision,
 * while the existing assistant renderer remains the source of approved copy and
 * emergency/handover presentation. No model, network request, or browser storage
 * is introduced here.
 */
export function sendWithGilbertEngine(
  turns: Turn[],
  text: string,
  visit: Visit | null = null,
  raised = false
): Turn[] {
  const result = evaluateMessage(text);

  if (result.route === 'emergency') {
    return send(turns, 'What if it cannot wait?', visit, raised);
  }

  if (result.route === 'handover') {
    return handOver(turns, raised);
  }

  return send(turns, text, visit, raised);
}
