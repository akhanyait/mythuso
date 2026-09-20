/* engine.ts alone, not the package barrel: index.ts also re-exports the Phase A modules
   (conversation, phi, refusals, tools) with their catalog imports, and the patient entry must
   not carry any of that — the bridge reads only a route name from the engine. */
import {
  evaluateMessage,
  greetingTerms,
  type Audience,
} from '../../../../packages/gilbertone/src/engine.ts';
import {
  emergencyGroupsIn,
  greet,
  leavesUnread,
  send,
  type Turn,
} from './assistant.ts';
import type { Visit } from './scheduling.ts';

/**
 * Phase 1 bridge: the English engine owns the first safety and intent decision,
 * while the existing assistant renderer remains the source of approved copy and
 * emergency/handover presentation. No browser storage is introduced here, and the
 * engine's own answer below is still computed on this phone with no network: since
 * 20 September 2026 the bridge carries a second, optional function,
 * refineWithAssistantService, which may ask the assistant API for a model-written sentence
 * after an answer the matcher could not place — its own comment says why, and what the panel
 * shows when nothing is listening.
 *
 * The audience travels with the message since the founder's audience decision of 19 September
 * 2026: the engine scopes its patient-voiced routes with it, and send() answers in that
 * audience's own words — the same tags on every platform.
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
  raised = false,
  audience: Audience = 'patient',
): Turn[] {
  const result = evaluateMessage(text, audience);

  if (result.route === 'emergency') {
    const withEmergency = send(turns, 'What if it cannot wait?', visit, raised, audience);
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
    const withHandover = send(turns, 'Can I talk to a nurse?', visit, raised, audience);
    const last = withHandover[withHandover.length - 1];
    if (last.reply.kind !== 'handover') return withHandover;
    const corrected: Turn = { ...last, asked: text };
    return [...withHandover.slice(0, -1), corrected];
  }

  /* The greeting, since the fix of 20 September 2026. The engine has classified "hello" as a
     greeting since the greeting sentence arrived, but this bridge intercepted only the emergency
     and handover routes — a greeting travels route 'standard' — so a hello fell through to send(),
     where the matcher has no trigger for one, and answered "I can't assess that". That is the one
     reply that reads as a refusal to somebody who only said hello, and it was the defect this
     branch exists to fix. The engine's own terms are the unread rule's trigger set — never a
     second copy of the list — so "hello, my knee aches" answers with the hello and the unread
     block beside it rather than claiming more than it read. */
  if (result.classification === 'greeting') {
    return greet(turns, text, leavesUnread(text, { triggers: greetingTerms }));
  }

  return send(turns, text, visit, raised, audience);
}

/* ---- The service tier, since 20 September 2026 ------------------------------------------------
 * sendWithGilbertEngine above stays exactly what it was: the contract's own answers, computed on
 * this phone with no network, and the path every message takes whether or not anything is
 * listening on the other end. This second function is the bridge's one door to the assistant API.
 * After the local reply for a message the matcher could not place, the panel may ask the service
 * for a sentence a language model wrote — and only a reply the service itself marks source
 * 'model' replaces what is on the screen. Everything else (a service that is not running, one
 * that answered with a refusal or an emergency, a slow one, a wrong one) leaves the local answer
 * standing, so the panel behaves identically with the API up, down or unreachable, except that
 * an unmatched answer may be followed a moment later by a model-written one under the
 * answers.service heading. Nothing adds a pause to make an answer look considered: the local
 * answer is already on the screen when this runs, and this one arrives when it arrives. */
declare const __ASSISTANT_API_URL__: string;

const REFINE_TIMEOUT_MS = 12_000;

/* The URL the service is reached at: the vite define in development ('' by default, so the
   request goes to the dev server's /assistant proxy on this page's own origin), and the
   deployment's own value when one is set at build time. */
const serviceUrl = (): string => {
  const base = typeof __ASSISTANT_API_URL__ === 'string' ? __ASSISTANT_API_URL__ : '';
  return `${base}/assistant/turn`;
};

export async function refineWithAssistantService(
  turns: Turn[],
  text: string,
  audience: Audience = 'patient',
  sessionId?: string,
): Promise<Turn[] | null> {
  const last = turns[turns.length - 1];
  /* Only a message the matcher itself could not place is ever refined. A matched answer, an
     emergency's numbers or a handover summary is the contract's own decision, and nothing a
     model writes may displace one. */
  if (!last || last.reply.kind !== 'unmatched') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFINE_TIMEOUT_MS);
  try {
    const response = await fetch(serviceUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        audience,
        sessionId,
        /* The confirmation refusals.ts asks for, and it is not a formality: the message this
           request carries is the person's own message, typed and sent from this panel — pressing
           Send is the confirmation. Nothing runs here without it. */
        userConsent: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { source?: string; reply?: string };
    /* One shape is accepted and everything else is quietly the local answer: a reply the
       service's own field marks as model-written. The route, the classification and the
       confidence beside it are the classifier's own and go unused here — this function returns
       a turn, not a decision. */
    if (body.source !== 'model' || typeof body.reply !== 'string' || !body.reply.trim()) return null;
    const refined: Turn = { ...last, reply: { kind: 'service', text: body.reply.trim() } };
    return [...turns.slice(0, -1), refined];
  } catch {
    /* Unreachable, blocked, timed out, or answered with something that is not JSON — every one
       of these is one fact to this function: keep what the contract already said. */
    return null;
  } finally {
    clearTimeout(timer);
  }
}
