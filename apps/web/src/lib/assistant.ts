import contract from '../../../../packages/catalog/assistant.json';
import { longDateOf, offeredDays, slots } from './scheduling';
import { recordById } from './records';
import { EXPIRY_WARNING_DAYS } from './vetting';
import { conditions, emergency as sosEmergency, numberById } from './sos';

/* Gilbert's reasoning, without a screen attached to it.

   Everything Gilbert says is in packages/catalog/assistant.json, and this module is the arithmetic
   beside it — the same arithmetic as apps/ios/MyThuso/Models/Assistant.swift and
   apps/android/.../model/Assistant.kt, over the same generated words, so a sentence gets the same
   answer on every platform. There is no model behind it and nothing it sends anywhere.

   THE MATCHER, AND THE ORDER THAT MAKES IT SAFE. A message is normalised, then checked against the
   emergency words, and a match ends the matching: the answer is the emergency answer whatever else
   was said. Only then is the longest trigger phrase looked for. Anything that matches nothing gets
   the unmatched answer — "I can't assess that", the ambulance numbers, Thuso SOS and a way to a nurse
   — and that is the answer to every question nobody wrote an answer for. There is no fallback that
   guesses.

   A TEXT BOX, AND WHY IT IS HONEST NOW. This file used to refuse one: a text field on a health screen
   is where somebody types "my chest is tight", and with nothing reading it the only replies were
   silence or a deflection. Both of those are answered now. The emergency words read it, and the
   unmatched answer says plainly that Gilbert could not assess it and puts the ambulance first. The
   emergency words are a draft nobody clinical has reviewed, which is why the contract's
   silenceIsNotSafety sentence stays beside the conversation rather than appearing after a match.

   NO MICROPHONE. The web does not listen in this release, because a browser's speech recognition
   sends a voice to the browser's maker. Nothing here reaches for audio, and the build refuses it in
   the whole of apps/web/src. Listening and Thinking are native states; the web moves between Idle,
   Guiding, Escalate and Handover only, and never adds a pause to look considered. */

export type Depth = 0 | 1 | 2 | 3;
/* The states the web may be in. Listening and Thinking are the phones' alone; see the contract's statesWhy. */
export type PulseId = 'idle' | 'guiding' | 'escalate' | 'handover';

export const identity = contract.identity;
export const states = contract.states;
export const questionGroups = contract.questionGroups;
export const refusals = contract.refusals;
export const conversation = contract.conversation;
export const voice = contract.voice;
export const answers = contract.answers;
export const emergencyGroupsContract = contract.matcher.emergencyWords.groups;
export const stateSpec = (id: PulseId) => states.find(s => s.id === id)!;
export const refusal = (id: string) => refusals.find(r => r.id === id)!;

/* {ambulance}, {mobile} and {seconds} are the contract's own tokens and are filled from sos.json and
   the voice policy; nothing here types an emergency number. */
const fill = (text: string, values: Record<string, string>) => text.replace(/\{([a-zA-Z]+)\}/g, (token, key) => values[key] ?? token);
const lineValues = { ambulance: numberById('ambulance').number, mobile: numberById('mobile').number, seconds: String(contract.voice.maxListeningSeconds) };
export const say = (text: string) => fill(text, lineValues);
export const silenceIsNotSafety = say(contract.silenceIsNotSafety);
export const lines = (ids: string[]) => ids.map(id => { const n = numberById(id); return { number: n.number, name: n.name }; });

export type Situation = { id: string; name: string; sentence: string; figure: string | null; figureLabel: string | null; depth: Depth };

export function situations(from: Date = new Date()): Situation[] {
 const first = offeredDays(from)[0];
 const values: Record<string, string> = {
  firstDay: first ? longDateOf(first.iso) : contract.situationsFallback.firstDay,
  day: first?.day ?? '', month: first?.month ?? '', slot: slots[0] ?? '',
  laboratory: recordById('laboratory')?.name ?? contract.situationsFallback.laboratory,
  expiryWarningDays: String(EXPIRY_WARNING_DAYS)
 };
 return contract.situations.map(s => ({
  id: s.id, name: s.name, sentence: fill(s.sentence, values),
  figure: s.figure === null ? null : fill(s.figure, values),
  figureLabel: s.figureLabel === null ? null : fill(s.figureLabel, values),
  depth: s.depth as Depth
 }));
}

export type Question = typeof contract.questions[number];
export const questions: Question[] = contract.questions;
export type EmergencyGroup = { id: string; name: string };

/* The group's name is the SOS screen's word for the condition it raises, or the contract's own for
   the two groups that raise without one. */
const groupName = (group: typeof emergencyGroupsContract[number]) =>
 group.condition === null ? (group as { name?: string }).name ?? group.id : conditions.find(c => c.id === group.condition)?.name ?? group.id;

/* Lower case, apostrophes removed, everything outside a–z and 0–9 a space, padded so a phrase is a
   whole-word match. The same rule on all three platforms, ASCII on purpose. */
export const normalise = (text: string) =>
 ` ${text.toLowerCase().replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

export function emergencyGroupsIn(text: string): EmergencyGroup[] {
 const said = normalise(text);
 return emergencyGroupsContract.filter(g => g.words.some(w => said.includes(normalise(w)))).map(g => ({ id: g.id, name: groupName(g) }));
}

/** The longest trigger phrase wins; a tie goes to the question listed first. */
export function questionFor(text: string): Question | null {
 const said = normalise(text);
 let best: Question | null = null;
 let length = -1;
 for (const question of questions) for (const trigger of question.triggers) {
  const phrase = normalise(trigger);
  if (said.includes(phrase) && phrase.length > length) { best = question; length = phrase.length; }
 }
 return best;
}

export type SummaryRow = { label: string; value: string };
export type Channel = 'typed' | 'chosen';
export type Reply =
 | { kind: 'situation'; situation: Situation }
 | { kind: 'identity' }
 | { kind: 'voice' }
 | { kind: 'emergency'; groups: EmergencyGroup[] }
 | { kind: 'unmatched' }
 | { kind: 'handover'; rows: SummaryRow[] };

export type Turn = { id: number; asked: string | null; channel: Channel | null; reply: Reply; matched: Question | null; groups: EmergencyGroup[] };

export function replyTo(question: Question, from: Date = new Date()): Reply {
 switch (question.answer) {
  case 'situation': { const situation = situations(from).find(s => s.id === question.id); return situation ? { kind: 'situation', situation } : { kind: 'unmatched' }; }
  case 'identity': return { kind: 'identity' };
  case 'voice': return { kind: 'voice' };
  case 'emergency': return { kind: 'emergency', groups: [] };
  default: return { kind: 'unmatched' };
 }
}

export function pulseOf(reply: Reply): PulseId {
 switch (reply.kind) {
  case 'situation': return 'guiding';
  case 'identity': return answers.identity.state as PulseId;
  case 'voice': return answers.voice.state as PulseId;
  case 'emergency': return answers.emergency.state as PulseId;
  case 'unmatched': return answers.unmatched.state as PulseId;
  case 'handover': return answers.handover.state as PulseId;
 }
}

export const depthOf = (reply: Reply): Depth =>
 reply.kind === 'situation' ? reply.situation.depth : reply.kind === 'emergency' ? 3 : reply.kind === 'handover' ? 1 : 0;

/* The conversation, held in memory and nowhere else, and capped so a person pressing the same
   question forty times does not grow the page without end. No browser storage of any kind: a
   transcript of health questions is the last thing that should survive a closed tab on a shared
   phone, and the build refuses those APIs in apps/web/src. */
export const opening = (from: Date = new Date()): Turn[] =>
 [{ id: 0, asked: null, channel: null, reply: { kind: 'situation', situation: situations(from)[0] }, matched: null, groups: [] }];

const append = (turns: Turn[], make: (id: number) => Turn) =>
 [...turns, make((turns[turns.length - 1]?.id ?? 0) + 1)].slice(-conversation.turnLimit);

/* What a nurse would be handed: the last thing asked, in the person's words, how it arrived, what it
   matched and which emergency words were in it. A request for a nurse is skipped when looking back,
   because it is not itself what a nurse needs to read. */
export function summary(turns: Turn[]): SummaryRow[] {
 const h = answers.handover;
 const label = (id: string) => h.fields.find(f => f.id === id)?.label ?? id;
 const last = [...turns].reverse().find(t => t.asked !== null && t.matched?.answer !== 'handover');
 if (!last?.asked) return [{ label: label('words'), value: h.nothingAsked }];
 return [
  { label: label('words'), value: last.asked },
  { label: label('channel'), value: last.channel === 'chosen' ? h.channelChosen : h.channelTyped },
  { label: label('matched'), value: last.matched?.asks ?? (last.groups.length ? h.matchedEmergency : h.nothingMatched) },
  { label: label('flags'), value: last.groups.length ? last.groups.map(g => g.name).join('; ') : h.noFlags }
 ];
}

const handingOver = (turns: Turn[], asked: string, channel: Channel, matched: Question) =>
 append(turns, id => ({ id, asked, channel, reply: { kind: 'handover', rows: summary(turns) }, matched, groups: [] }));

/** A message in a person's own words. */
export function send(turns: Turn[], text: string, from: Date = new Date()): Turn[] {
 const words = text.trim();
 if (!words) return turns;
 const groups = emergencyGroupsIn(words);
 /* The emergency words first, and a match ends it. */
 if (groups.length) return append(turns, id => ({ id, asked: words, channel: 'typed', reply: { kind: 'emergency', groups }, matched: null, groups }));
 const question = questionFor(words);
 if (question?.answer === 'handover') return handingOver(turns, words, 'typed', question);
 if (question) return append(turns, id => ({ id, asked: words, channel: 'typed', reply: replyTo(question, from), matched: question, groups: [] }));
 return append(turns, id => ({ id, asked: words, channel: 'typed', reply: { kind: 'unmatched' }, matched: null, groups: [] }));
}

/** One of the suggested questions, pressed. */
export function choose(turns: Turn[], question: Question, from: Date = new Date()): Turn[] {
 if (question.answer === 'handover') return handingOver(turns, question.asks, 'chosen', question);
 return append(turns, id => ({ id, asked: question.asks, channel: 'chosen', reply: replyTo(question, from), matched: question, groups: [] }));
}

/** "Talk to a nurse", pressed from the unmatched answer. */
export const handOver = (turns: Turn[]): Turn[] =>
 append(turns, id => ({ id, asked: null, channel: null, reply: { kind: 'handover', rows: summary(turns) }, matched: null, groups: [] }));

export const emergencyAnswer = { ...answers.emergency, headline: sosEmergency.headline, lead: sosEmergency.lead, notAnAmbulance: sosEmergency.notAnAmbulance };
