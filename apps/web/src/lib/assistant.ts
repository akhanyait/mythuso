import contract from '../../../../packages/catalog/assistant.json';
import terms from '../../../../packages/catalog/gilbert-emergency-terms.json';
import { labels as schedulingLabels, shortWhenText, type Visit } from './scheduling';
import { recordById } from './records';
import { EXPIRY_WARNING_DAYS } from './vetting';
import { conditions, emergency as sosEmergency, numberById } from './sos';

/* Gilbert's reasoning, without a screen attached to it.

   Everything Gilbert says is in packages/catalog/assistant.json, and this module is the arithmetic
   beside it — the same arithmetic as apps/ios/MyThuso/Models/Assistant.swift and
   apps/android/.../model/Assistant.kt, run against the same shared fixtures in the contract, so a
   sentence gets the same answer on every platform. There is no model behind it and nothing it sends.

   THE ORDER THAT MAKES IT SAFE. A message is folded to plain letters and reduced to stems. The
   emergency words are checked first, on stems and with small gaps, so "chest pains", "she bled" and
   "my chest feels tight" all raise; a match ends the matching. Only then is a trigger phrase looked
   for — and a question may answer on its own only if every word of the message is one of its trigger
   words or ordinary filler. Anything left over is said to be unread, with the ambulance numbers
   beside it, because a list of words will always miss a way of saying something frightening, and the
   defect the Wave 1 review found was the calm answer that followed the miss. "Nothing needs you" is
   never said to a message Gilbert did not read all of.

   A TEXT BOX, AND WHY IT IS HONEST. The emergency words read it, the unread rule reads the rest, and
   the unmatched answer says plainly that Gilbert could not assess it and puts the ambulance first. The
   emergency words are a draft nobody clinical has reviewed, which is why the contract's
   silenceIsNotSafety sentence stays beside the conversation.

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
export const fixtures = contract.fixtures;
/* The terms are their own versioned configuration (founder, 14 September 2026); how they match is here. */
export const emergencyGroupsContract = terms.groups;
export const falsePositives = terms.falsePositives;
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

/* The visit is the one the home card shows — the first upcoming visit the person booked, written by the
   same shortWhenText — so Gilbert and the home cannot name two days for one visit. With nothing booked,
   or a nurse still being found, it says scheduling.json's own words for that. */
const scheduled = (text: string) => text.replace(/\{(noUpcoming|noUpcomingDetail|asapPending)\}/g, (token, key: keyof typeof schedulingLabels) => schedulingLabels[key] ?? token);

export function situations(visit: Visit | null = null): Situation[] {
 const values: Record<string, string> = {
  laboratory: recordById('laboratory')?.name ?? contract.situationsFallback.laboratory,
  expiryWarningDays: String(EXPIRY_WARNING_DAYS)
 };
 return contract.situations.map(s => {
  const depth = s.depth as Depth;
  if (s.id === 'visit' && (!visit || visit.kind !== 'scheduled')) {
   const state = visit ? contract.visitStates.pending : contract.visitStates.none;
   return { id: s.id, name: scheduled(state.name), sentence: scheduled(state.sentence), figure: null, figureLabel: null, depth };
  }
  const withVisit = s.id === 'visit' && visit ? { ...values, visitWhen: shortWhenText(visit) } : values;
  return {
   id: s.id, name: s.name, sentence: fill(s.sentence, withVisit),
   figure: s.figure === null ? null : fill(s.figure, withVisit),
   figureLabel: s.figureLabel === null ? null : fill(s.figureLabel, withVisit),
   depth
  };
 });
}

export type Question = typeof contract.questions[number];
export const questions: Question[] = contract.questions;
export type EmergencyGroup = { id: string; name: string };

/* The group's name is the SOS screen's word for the condition it raises, or the contract's own for
   the two groups that raise without one. */
const groupName = (group: typeof emergencyGroupsContract[number]) =>
 group.condition === null ? (group as { name?: string }).name ?? group.id : conditions.find(c => c.id === group.condition)?.name ?? group.id;

/* ---- Words into stems ------------------------------------------------------------------------
   Lower case, the contract's foldings (æ is ae), combining marks removed (é is e), apostrophes
   removed, and anything outside a–z and 0–9 a space. Then the stemming rules, in the contract's order.
   Checked on every platform against fixtures.stems. */
const normalisation = contract.matcher.normalisation;
const irregular: Record<string, string> = contract.matcher.stemming.irregular;

export function tokens(text: string): string[] {
 let folded = text.toLowerCase();
 for (const [from, to] of Object.entries(normalisation.foldings)) folded = folded.split(from).join(to);
 folded = folded.normalize('NFD').replace(/\p{M}+/gu, '');
 for (const mark of normalisation.apostrophes) folded = folded.split(mark).join('');
 return folded.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

const undouble = (word: string) =>
 word.length >= 3 && word[word.length - 1] === word[word.length - 2] && !'aeiouslz'.includes(word[word.length - 1]) ? word.slice(0, -1) : word;

export function stem(word: string): string {
 let t = irregular[word] ?? word;
 if (t.length >= 5 && t.endsWith('ing')) t = undouble(t.slice(0, -3));
 else if (t.length >= 4 && (t.endsWith('ied') || t.endsWith('ies'))) t = `${t.slice(0, -3)}y`;
 else if (t.length >= 4 && t.endsWith('ed') && !t.endsWith('eed')) t = undouble(t.slice(0, -2));
 else if (t.length >= 4 && /(s|x|z|ch|sh)es$/.test(t)) t = t.slice(0, -2);
 else if (t.length >= 4 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
 if (t.length >= 4 && t.endsWith('e')) t = t.slice(0, -1);
 return t;
}

export const stems = (text: string) => tokens(text).map(stem);

/* A term's words in order, each within maxGap words of the one before. Greedy from each start, which
   is deterministic and is exactly what the other two platforms do. */
function hasSequence(said: string[], term: string[], gap: number): boolean {
 for (let start = 0; start < said.length; start++) {
  if (said[start] !== term[0]) continue;
  let at = start;
  let whole = true;
  for (let k = 1; k < term.length && whole; k++) {
   let found = -1;
   for (let j = at + 1; j < said.length && j <= at + 1 + gap; j++) if (said[j] === term[k]) { found = j; break; }
   if (found < 0) whole = false; else at = found;
  }
  if (whole) return true;
 }
 return false;
}

export function emergencyGroupsIn(text: string): EmergencyGroup[] {
 const said = stems(text);
 return emergencyGroupsContract
  .filter(g => g.words.some(w => hasSequence(said, stems(w), contract.matcher.maxGap)))
  .map(g => ({ id: g.id, name: groupName(g) }));
}

/** The longest trigger (in words, adjacent) wins; a tie goes to the question listed first. */
export function questionFor(text: string): Question | null {
 const said = stems(text);
 let best: Question | null = null;
 let length = 0;
 for (const question of questions) for (const trigger of question.triggers) {
  const term = stems(trigger);
  if (term.length > length && hasSequence(said, term, 0)) { best = question; length = term.length; }
 }
 return best;
}

/* Reading everything: a word that is neither one of the question's own trigger words nor filler is a
   word Gilbert did not read, and it is said so. */
const fillerStems = new Set(contract.matcher.readEverything.filler.map(stem));
export function leavesUnread(text: string, question: Question): boolean {
 const covered = new Set([...fillerStems, ...question.triggers.flatMap(stems)]);
 return stems(text).some(word => !covered.has(word));
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

/** `unread` is true when the answer came with words Gilbert could not read; the unread answer follows it. */
export type Turn = { id: number; asked: string | null; channel: Channel | null; reply: Reply; matched: Question | null; groups: EmergencyGroup[]; unread: boolean };

export function replyTo(question: Question, visit: Visit | null = null): Reply {
 switch (question.answer) {
  case 'situation': { const situation = situations(visit).find(s => s.id === question.id); return situation ? { kind: 'situation', situation } : { kind: 'unmatched' }; }
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

/* The conversation, held in memory and nowhere else, and capped. No browser storage of any kind: a
   transcript of health questions is the last thing that should survive a closed tab on a shared
   phone, and the build refuses those APIs in apps/web/src. */
export const opening = (): Turn[] =>
 [{ id: 0, asked: null, channel: null, reply: { kind: 'situation', situation: situations()[0] }, matched: null, groups: [], unread: false }];

const append = (turns: Turn[], make: (id: number) => Turn) =>
 [...turns, make((turns[turns.length - 1]?.id ?? 0) + 1)].slice(-conversation.turnLimit);

/* What a nurse would be handed: the last thing asked, in the person's words, how it arrived, what it
   matched and which emergency words were in it. A request for a nurse is skipped when looking back. */
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

/** A message in a person's own words. */
export function send(turns: Turn[], text: string, visit: Visit | null = null): Turn[] {
 const words = text.trim();
 if (!words) return turns;
 const groups = emergencyGroupsIn(words);
 /* The emergency words first, and a match ends it. */
 if (groups.length) return append(turns, id => ({ id, asked: words, channel: 'typed', reply: { kind: 'emergency', groups }, matched: null, groups, unread: false }));
 const question = questionFor(words);
 if (!question) return append(turns, id => ({ id, asked: words, channel: 'typed', reply: { kind: 'unmatched' }, matched: null, groups: [], unread: false }));
 const unread = question.answer !== 'emergency' && leavesUnread(words, question);
 /* A claim about everything is not made to a message Gilbert did not read all of. */
 if (unread && contract.matcher.readEverything.neverWithUnread.includes(question.id)) {
  return append(turns, id => ({ id, asked: words, channel: 'typed', reply: { kind: 'unmatched' }, matched: null, groups: [], unread: false }));
 }
 const reply: Reply = question.answer === 'handover' ? { kind: 'handover', rows: summary(turns) } : replyTo(question, visit);
 return append(turns, id => ({ id, asked: words, channel: 'typed', reply, matched: question, groups: [], unread }));
}

/** One of the suggested questions, pressed. Its own words, so nothing is unread. */
export function choose(turns: Turn[], question: Question, visit: Visit | null = null): Turn[] {
 const reply: Reply = question.answer === 'handover' ? { kind: 'handover', rows: summary(turns) } : replyTo(question, visit);
 return append(turns, id => ({ id, asked: question.asks, channel: 'chosen', reply, matched: question, groups: [], unread: false }));
}

/** "Talk to a nurse", pressed from the unmatched or unread answer. */
export const handOver = (turns: Turn[]): Turn[] =>
 append(turns, id => ({ id, asked: null, channel: null, reply: { kind: 'handover', rows: summary(turns) }, matched: null, groups: [], unread: false }));

/** How a turn came out, in the words the shared fixtures use. */
export const outcomeOf = (turn: Turn): string =>
 turn.reply.kind === 'emergency' ? 'emergency' : turn.reply.kind === 'unmatched' && !turn.matched ? 'unmatched' : turn.unread ? 'answer-and-unread' : 'answer';

export const emergencyAnswer = { ...answers.emergency, headline: sosEmergency.headline, lead: sosEmergency.lead, notAnAmbulance: sosEmergency.notAnAmbulance };
