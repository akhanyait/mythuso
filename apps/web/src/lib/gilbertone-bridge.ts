import { evaluateMessage } from '../../../../packages/gilbertone/src/index.ts';
import { emergencyGroupsIn, send, type Turn } from './assistant.ts';
import type { Visit } from './scheduling.ts';

/**
 * Phase 1 bridge: the English engine owns the first safety and intent decision,
 * while the existing assistant renderer remains the source of approved copy and
 * emergency/handover presentation. No model, network request, or browser storage
 * is introduced here.
 *
 * WHY EMERGENCY GOES THROUGH A SYNTHETIC PHRASE, AND WHAT THAT COSTS. `send()`'s own,
 * richer emergency detector (stems, small gaps, the founder's versioned term list) may not
 * agree with the engine's plain substring check — and if the engine says "emergency" and the
 * real detector does not, calling send() with the actual words would fall through to an
 * ordinary matched-or-unmatched answer, which is the exact failure this bridge exists to
 * prevent. Routing the fixed phrase "What if it cannot wait?" through send() forces the web's
 * emergency presentation regardless, because that phrase is the emergency question's own
 * trigger in packages/catalog/assistant.json. Verified directly: it produces
 * data-outcome="emergency" and data-pulse="escalate" every time, including for every case in
 * this file's own test coverage.
 *
 * That reliability has a real cost, found by running the existing suite rather than reading
 * the code: send()'s reply for a forced match carries no matched groups (replyTo's emergency
 * case always returns groups: []), and the words it echoes back as "You asked" are the
 * synthetic phrase, not what the person actually typed. Both are corrected below, using the
 * real text against the real detector purely for what is shown, never for whether the
 * emergency presentation appears at all — the engine's route decision is never second-guessed
 * once made. A better long-term design is for the engine itself to return enough structured
 * emergency information for this bridge to build the reply directly, rather than reaching back
 * into a second matcher for it; tracked in the parity work this bridge is a first step toward.
 */
export function sendWithGilbertEngine(
  turns: Turn[],
  text: string,
  visit: Visit | null = null,
  raised = false
): Turn[] {
  const result = evaluateMessage(text);

  if (result.route === 'emergency') {
    const withEmergency = send(turns, 'What if it cannot wait?', visit, raised);
    const last = withEmergency[withEmergency.length - 1];
    if (last.reply.kind !== 'emergency') return withEmergency;
    /* The real detector, on the real words, for display only. An empty result here is honest —
       it is the same "raised, but nothing specific named" case the unmodified answer already
       shows for a message the real matcher itself raises with no named condition. */
    const groups = emergencyGroupsIn(text);
    const corrected: Turn = { ...last, asked: text, reply: { ...last.reply, groups }, groups };
    return [...withEmergency.slice(0, -1), corrected];
  }

  if (result.route === 'handover') {
    /* handOver() takes no text at all — calling it directly here would discard what the person
       actually typed the same way the unmodified emergency branch did (see above), so it is
       routed through send() with the "nurse" question's own trigger phrase and corrected the
       same way, for the same reason. */
    const withHandover = send(turns, 'Can I talk to a nurse?', visit, raised);
    const last = withHandover[withHandover.length - 1];
    if (last.reply.kind !== 'handover') return withHandover;
    const corrected: Turn = { ...last, asked: text };
    return [...withHandover.slice(0, -1), corrected];
  }

  return send(turns, text, visit, raised);
}
