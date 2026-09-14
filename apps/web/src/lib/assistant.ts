import { longDateOf, offeredDays, slots } from './scheduling';
import { recordById } from './records';
import { EXPIRY_WARNING_DAYS } from './vetting';
import { blockedBy, capability, noticeFor } from './capabilities';
import { emergency, numberById } from './sos';

/* What the assistant can say, and the reason it can say so little.

   This is the web half of apps/ios/MyThuso/Features/AssistantView.swift, and it says the same
   things in the same words. It is a conversation in shape only. There is no model behind it, no
   speech and no text box, and all three absences are deliberate:

   No model, because packages/catalog/capabilities.json has no capability for one. Anything that
   generated a reply here would be a clinical-sounding sentence nobody wrote and nobody signed.

   No speech, because `voice` is not connected, and its neverSoften rule forbids drawing a
   microphone affordance of any kind. That rule is honoured in this file by what it does not
   contain, and in features/Assistant.tsx by what it does not draw.

   No free-text box, and this is the refusal worth writing down. A text field on a health screen
   is where somebody types "my chest is tight". Nothing reads it, so the only honest reply is
   silence or a canned deflection. Either way the person has described a symptom to something
   that looked like it was listening. So a person chooses from questions this module can really
   answer, and one of those questions is always the way to an ambulance.

   Every answer is derived. The visit date is the first day packages/catalog/scheduling.json
   offers, so it moves with the calendar. "Laboratory" is the record type's own name from
   records.json. Forty-five is the vetting clock's warning, the point at which a lapsing
   registration starts withdrawing work by arithmetic. The refusal is the voice capability's own
   notice and its blockedBy list. The emergency answer is sos.json's headline, lead and numbers,
   in that order. The four situation sentences are the one exception: they are typed in
   AssistantView.swift, and this file copies them word for word. They belong in a contract — see
   the report that landed this — and until then these two copies are the drift risk. */

export type Depth = 0 | 1 | 2 | 3;

/** One of the four situations the drawing can show. `depth` is how concentrated the sphere draws
    itself; it is never the only thing that says which situation this is. `name` says it in words. */
export type Situation = {
 id: 'settled' | 'visit' | 'result' | 'credential';
 name: string;
 sentence: string;
 figure: string | null;
 figureLabel: string | null;
 depth: Depth;
};

export function situations(from: Date = new Date()): Situation[] {
 const first = offeredDays(from)[0];
 const firstSlot = slots[0] ?? '';
 const laboratory = recordById('laboratory')?.name ?? 'Laboratory';
 return [
  { id: 'settled', name: 'Nothing waiting',
    sentence: 'Nothing needs you. This is the state a well person is in most of the time, and it is the one the drawing is quietest in.',
    figure: null, figureLabel: null, depth: 0 },
  { id: 'visit', name: 'Visit confirmed',
    sentence: `A nurse is expected on ${first ? longDateOf(first.iso) : 'the first day offered'}. You will be told who is coming before they leave.`,
    figure: first?.day ?? null, figureLabel: `${first?.month ?? ''} · ${firstSlot}`, depth: 1 },
  { id: 'result', name: 'Result ready',
    sentence: `${laboratory} results have been released to your record. A doctor reads them before you are asked to do anything about them.`,
    figure: null, figureLabel: null, depth: 2 },
  { id: 'credential', name: 'Credential lapsing',
    sentence: 'A registration on your team is inside its last weeks. When it lapses, the work it carried is withdrawn by arithmetic rather than by anybody remembering to.',
    figure: String(EXPIRY_WARNING_DAYS), figureLabel: 'days before it stops carrying anything', depth: 3 }
 ];
}

/* What the stage under the sphere shows for the reply it is drawing. The two replies that are not
   situations still get a name and, where the contract has one, a figure. For the emergency reply
   that figure is the ambulance number, which is the one number on this screen worth setting large. */
export type Reply =
 | { kind: 'situation'; situation: Situation }
 | { kind: 'cannot-listen'; name: string; notice: string; reasons: string[]; rule: string; depth: Depth }
 | { kind: 'emergency'; name: string; headline: string; lead: string; numbers: { number: string; name: string }[]; notAnAmbulance: string; depth: Depth };

export type Question = { id: string; asks: string; group: 'situations' | 'always'; reply: () => Reply };

/* The questions, in a person's words. Two groups, because they are two different promises. The
   first four are the legend iOS calls "What the drawing can say", and nothing is watching for any
   of them. The last two are what the assistant will always answer, whatever it is showing.

   The listening question is phrased as "why can't you", never "can I talk to you". A button that
   invites speech is a listening affordance made of words, and the build already refuses that on
   iOS. */
export function questions(from: Date = new Date()): Question[] {
 const [settled, visit, result, credential] = situations(from);
 const voice = capability('voice');
 const ambulance = numberById('ambulance');
 const mobile = numberById('mobile');
 return [
  { id: 'settled', asks: 'Does anything need me?', group: 'situations', reply: () => ({ kind: 'situation', situation: settled }) },
  { id: 'visit', asks: 'When is my nurse coming?', group: 'situations', reply: () => ({ kind: 'situation', situation: visit }) },
  { id: 'result', asks: 'Are my results back?', group: 'situations', reply: () => ({ kind: 'situation', situation: result }) },
  { id: 'credential', asks: 'Is everyone on my team registered?', group: 'situations', reply: () => ({ kind: 'situation', situation: credential }) },
  { id: 'cannot-listen', asks: 'Why can’t you listen?', group: 'always', reply: () => ({
    kind: 'cannot-listen', name: voice.name, notice: noticeFor('voice') ?? voice.notice,
    reasons: blockedBy('voice'), rule: voice.neverSoften ?? '', depth: 0 }) },
  { id: 'emergency', asks: 'What if it cannot wait?', group: 'always', reply: () => ({
    kind: 'emergency', name: ambulance.name, headline: emergency.headline, lead: emergency.lead,
    numbers: [ambulance, mobile].map(n => ({ number: n.number, name: n.name })),
    notAnAmbulance: emergency.notAnAmbulance, depth: 3 }) }
 ];
}

/** What the stage says about a reply: a name always, a figure only where the contract has one. */
export function stageOf(reply: Reply): { name: string; figure: string | null; figureLabel: string | null; depth: Depth } {
 if (reply.kind === 'situation') return reply.situation;
 if (reply.kind === 'emergency') return { name: reply.name, figure: reply.numbers[0]?.number ?? null, figureLabel: null, depth: reply.depth };
 return { name: reply.name, figure: null, figureLabel: null, depth: reply.depth };
}

/* The conversation, held in memory and nowhere else. No storage of any kind: apps/web/src may not
   touch any browser storage API (a boundary check greps for them), and a transcript of health questions is the
   last thing that should survive a closed tab on a shared phone. It is capped as well, so a person
   pressing the same question forty times does not grow the page without end. */
export type Turn = { id: number; asked: string | null; reply: Reply };
export const TURN_LIMIT = 24;

export const opening = (from: Date = new Date()): Turn[] =>
 [{ id: 0, asked: null, reply: { kind: 'situation', situation: situations(from)[0] } }];

export function ask(turns: Turn[], question: Question): Turn[] {
 const id = (turns[turns.length - 1]?.id ?? 0) + 1;
 return [...turns, { id, asked: question.asks, reply: question.reply() }].slice(-TURN_LIMIT);
}
