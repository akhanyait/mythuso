/* engine.ts alone, not the package barrel: index.ts also re-exports the Phase A modules
   (conversation, phi, refusals, tools) with their catalog imports, and the patient entry must
   not carry any of that — the bridge reads only a route name from the engine. */
import {
  evaluateMessage,
  type Audience,
} from '../../../../packages/gilbertone/src/engine.ts';
import {
  emergencyGroupsIn,
  greet,
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
 * case always returns groups: []), the words it echoes back as "You asked" are the synthetic
 * phrase, not what the person actually typed, and it records the phrase's own question as what
 * was matched — which the nurse handover's summary then repeats back as if it had been asked.
 * All three are corrected below, using the real text against the real detector purely for what
 * is shown, never for whether the emergency presentation appears at all — the engine's route
 * decision is never second-guessed once made. The matched question is cleared rather than
 * re-derived because send()'s own emergency branch names no question at all: the groups carry
 * the condition, and the handover says whether an emergency was raised, never which one. A
 * better long-term design is for the engine itself to return enough structured emergency
 * information for this bridge to build the reply directly, rather than reaching back into a
 * second matcher for it; tracked in the parity work this bridge is a first step toward.
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
    /* matched: null, the way the real detector's own emergency turn leaves it — a forced match
       names no question, and the handover's summary row reads this field back as its answer. */
    const corrected: Turn = {
      ...last,
      asked: text,
      reply: { ...last.reply, groups },
      groups,
      matched: null,
    };
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

  /* The greeting, since the fix of 20 September 2026 and widened on 21 September: a greeting
     classification consumes the whole message. The engine's hello used to be answered with the
     unread rule measured against the greeting terms alone, so "Hello World" drew the greeting and
     then "I can't assess the rest of what you said" with the ambulance numbers beside it — a
     refusal handed to somebody who had only said hello. There is nothing to measure a remainder
     against: every category that can answer sits above the greeting in the engine's own order, so
     "hello, when is my nurse coming?" arrives here as a care question and never as a hello with
     words left over — a greeting classification is the engine's decision that nothing else in the
     message is something it recognises.

     One thing still reads the whole message before the hello is answered, and it is not the
     engine's own narrow emergency list: the web's versioned detector — the founder's configured
     words, with stems and gaps — runs first, and words it catches are an emergency whatever the
     engine thought of them, routed through send() so the answer is the real emergency presentation
     on the person's own words. A hello in front of frightening words the engine's list missed used
     to meet the unread block by accident; it now meets the emergency answer on purpose. */
  if (result.classification === 'greeting') {
    if (emergencyGroupsIn(text).length)
      return send(turns, text, visit, raised, audience);
    return greet(turns, text);
  }

  return send(turns, text, visit, raised, audience);
}

/* ---- The service tier, since 20 September 2026 ------------------------------------------------
 * sendWithGilbertEngine above stays exactly what it was: the contract's own answers, computed on
 * this phone with no network, and the path every message takes whether or not anything is
 * listening on the other end. This second function is the bridge's one door to the assistant API.
 * After the local reply for a message the matcher could not place, the panel may ask the service
 * for a sentence a language model wrote — and only a reply the service itself marks as written by
 * a tier above the keyword classifier ('model', or 'orchestrator' since 21 September 2026)
 * replaces what is on the screen. Everything else (a service that is not running, one
 * that answered with a refusal or an emergency, a slow one, a wrong one) leaves the local answer
 * standing, so the panel behaves identically with the API up, down or unreachable, except that
 * the panel shows a waiting message until this request settles. A usable service reply is shown
 * under answers.service; otherwise the local fallback is displayed once. Emergencies and
 * approved local answers do not wait for this request. */
declare const __ASSISTANT_API_URL__: string;

const REFINE_TIMEOUT_MS = 12_000;

/* The URL the service is reached at: the vite define in development ('' by default, so the
   request goes to the dev server's /assistant proxy on this page's own origin), and the
   deployment's own value when one is set at build time. */
const serviceUrl = (path: string): string => {
  const base = typeof __ASSISTANT_API_URL__ === 'string' ? __ASSISTANT_API_URL__ : '';
  return `${base}${path}`;
};

/* The plan's versioned turn address, and the unversioned one it supersedes. The versioned path is
   asked first; a service that predates it answers 404 — the one answer that means "no such route
   here", not "no" in any of its meanings — and the same request goes once more to the old path,
   sharing the one 12-second budget below. The fallback exists for deployments older than the
   versioned surface, and it retires when none such exists rather than on a date. */
const TURN_PATHS = ['/assistant/v1/turn', '/assistant/turn'] as const;

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
    const ask = (path: string) =>
      fetch(serviceUrl(path), {
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
    let response = await ask(TURN_PATHS[0]);
    /* Only a 404 from the versioned path is retried, and only onto the unversioned one: every
       other refusal — the origin's 403, the body limits' 400/413, the 501 family — is an answer
       about this request or this deployment, and asking again would not change it. */
    if (response.status === 404) response = await ask(TURN_PATHS[1]);
    if (!response.ok) return null;
    const body = (await response.json()) as { source?: string; reply?: string };
    /* One shape is accepted and everything else is quietly the local answer: a reply the
       service's own field marks as written by a tier above the keyword classifier. The route,
       the classification and the confidence beside it are the classifier's own and go unused
       here — this function returns a turn, not a decision.

       Both of the service's model tiers are named, and that is the fix of 21 September 2026
       rather than tidiness. The second tier was a plain model call marked source 'model' until
       the LangChain orchestrator replaced it and renamed the field's value to 'orchestrator';
       this comparison was not renamed with it, so every real answer the orchestrator wrote
       failed it and was dropped, and every unmatched question in production fell back to "I
       can't assess that" — a refusal shown to somebody the service had already answered. A name
       nobody has written yet is still refused, because a sentence from a tier this file has
       never heard of is not a sentence to put on a patient's screen; what changed is that both
       live names are here, and that a third one has to be added here on purpose rather than
       discovered in production. 'classifier' stays refused for its own reason: those words are
       the local contract's, and they are already on the screen. */
    if (body.source !== 'model' && body.source !== 'orchestrator') return null;
    if (typeof body.reply !== 'string' || !body.reply.trim()) return null;
    const refined: Turn = { ...last, reply: { kind: 'service', text: body.reply.trim() } };
    return [...turns.slice(0, -1), refined];
  } catch {
    /* Unreachable, blocked, timed out, or answered with something that is not JSON — every one
       of these is one fact to this function: use the contract's fallback after waiting. */
    return null;
  } finally {
    clearTimeout(timer);
  }
}
