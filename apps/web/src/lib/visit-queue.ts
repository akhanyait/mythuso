import contract from '../../../../packages/catalog/capture.json';
import {
 ageText, nextCaptureId, receive, rules, type Capture, type CaptureStateId, type ConflictId
} from './capture';

/* The whole visit, held on the phone — not just the readings.
 *
 * lib/capture.ts already answers this question for one reading: six states, four conflicts, two
 * clocks, and a receive() that asks the questions in an order somebody argued about. What it does
 * not do is cover the rest of a visit. A nurse in a house in Ivory Park with one bar checks a visit
 * code, reads consent aloud, types seven observations, writes what she found and signs. Only the
 * readings had anywhere to wait. Everything else lived in React state on a screen, which is to say
 * it lived nowhere: closing the tab, or being handed the phone by a toddler, lost an assessment
 * that a nurse would then rewrite in the car from memory. That is a clinical safety problem before
 * it is an inconvenience, and it is what this module exists to stop.
 *
 * So this is not a second queue. It is the same queue, one level up: a part is a piece of a visit
 * that has been finished, it carries the contract's own six states, and an observations part
 * carries real Capture values that go through capture.ts's own receive() when they land. The
 * questions asked on arrival are that function's questions, in that function's order, because two
 * modules that decide differently what a lapsed clearance means is exactly the drift the contract
 * files exist to prevent.
 *
 * WHAT IT ADMITS. This store is a module-level array. It survives navigating between screens, which
 * is the thing that mattered and did not work; it does not survive a reload, and nothing in this
 * repository can make it, because scripts/check-boundaries.mjs fails the build on the browser’s
 * local storage, session storage and IndexedDB across the whole web app so that a preview cannot leave patient
 * readings on a borrowed machine. The contract asks for more than that and does not get it here.
 * The screen says so rather than implying otherwise, which is the only honest version of a queue
 * that cannot yet keep its promise. */

/* One sentence about that, in one place. The Thuso Kit surface said it first and said it well; a
   second screen writing its own version is how two admissions start disagreeing about what is
   admitted. Both render this. */
/* Broken at the filename rather than written as one string, so both screens can set the path in a
   <code> and neither has to know how the other did it. */
export const inMemoryAdmission = {
 headline: 'This queue is held in memory and nothing else.',
 before: 'Reload the page and every entry in it is gone. That is deliberate:',
 script: 'scripts/check-boundaries.mjs',
 after: 'fails the build on the browser’s local storage, session storage and IndexedDB across the whole web app, so this app cannot leave patient readings on the machine it was opened on. What a real implementation owes is the contract’s own sentence —',
 owed: rules.queuedIsNotLost,
 close: 'and this one does not meet it. It is owed, not met.'
};

/* What this store loses, in packages/catalog/capture.json's words for the web store rather than a list
   item of the queue screen's own (1 October 2026). The screen typed the sentence beside the contract
   that holds it, and scripts/check-boundaries.mjs kept the two identical by quarantine; reading it here
   is the same words with one author. */
const webStore = contract.durability.stores.find(s => s.id === 'web-in-memory');
if (!webStore) throw new Error('packages/catalog/capture.json has lost the store "web-in-memory", whose loss the visit queue says out loud.');
export const webStoreLostTo: readonly string[] = webStore.says.lostTo;

/* ---- What a piece of a visit is --------------------------------------------------------------
   Five parts, because those are the five things a nurse does in a house and each one is separately
   losable. They are not stages of a form: a form is a shape on a screen, and what is held here is
   work that has been done. The names are the assessment's own, so a nurse reading the queue reads
   the visit back rather than reading a data model. */
export type PartKind = 'identity' | 'consent' | 'observations' | 'findings' | 'sign-off';
export const partNames: Record<PartKind, string> = {
 identity: 'Identity check',
 consent: 'Consent',
 observations: 'Readings',
 findings: 'What you found',
 'sign-off': 'Your sign-off'
};
/* What each part cannot do while it is still on the phone. A queue that only counts is a queue that
   lets a nurse assume the doctor has already seen it. */
export const partWhileHeld: Record<PartKind, string> = {
 identity: 'The code was checked against the visit this phone already had. It is checked again by the server when it lands, and a code that fails then stops the visit being filed rather than stopping the visit that already happened.',
 consent: 'What she agreed to is recorded here. It is not in her consent record yet, so nothing downstream may rely on it.',
 observations: 'The numbers are here with where each one came from. No doctor can see them, and nothing has been compared against her history.',
 findings: 'Written and kept. Nothing has been read by anybody else, and no referral has been raised.',
 'sign-off': 'Signed on this phone, and not yet filed. A signature that has not reached the record cannot be relied on by anybody who was not in the room.'
};

export type Part = {
 id: string;
 kind: PartKind;
 /** Which visit this belongs to, so two visits queued on one phone never answer for each other. */
 visit: string;
 patient: string;
 /** One line, in the nurse's own terms, saying what this part holds. */
 summary: string;
 /** The detail behind that line, as label/value pairs. */
 detail: [string, string][];
 /** Observations only. Real captures, so they land through capture.ts's own receive(). */
 readings?: Capture[];
 by: string;
 byName: string;
 /** This device's clock. Never presented as when it happened — that is the server's receipt. */
 capturedAt: string;
 receivedAt?: string;
 state: CaptureStateId;
 conflictId?: ConflictId;
 note?: string;
};

export const isPending = (part: Part) => part.state === 'captured' || part.state === 'queued' || part.state === 'sending';
/** Sealed and waiting on a connection: everything the nurse can do has been done. */
export const isSealed = (part: Part) => part.state === 'queued' || part.state === 'sending';

/* ---- The store -------------------------------------------------------------------------------
   Module-level rather than component state, and that is the whole feature. An assessment that lives
   in a screen's useState is lost by walking to the next screen, which is what a nurse does between
   the bedroom and the car. Every surface subscribes to this one array. */
let entries: Part[] = [];
const listeners = new Set<() => void>();
const publish = (next: Part[]) => { entries = next; listeners.forEach(l => l()); };
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const snapshot = () => entries;

let sequence = 0;
const nextPartId = () => `VQ-${String(++sequence).padStart(3, '0')}`;

/** Hold a finished part on the device. Nothing is sent, and the state says exactly that. */
export function hold(part: Omit<Part, 'id' | 'state' | 'capturedAt'> & { capturedAt?: string }): Part {
 /* One part per kind per visit. A nurse who steps back to correct the readings and comes forward
    again has corrected them, not taken a second set — so the held part is replaced rather than
    stacked. Anything already sealed or stored is left alone: that is no longer hers to overwrite. */
 const held: Part = { ...part, id: nextPartId(), state: 'captured', capturedAt: part.capturedAt ?? new Date().toISOString() };
 const replaces = entries.find(e => e.visit === part.visit && e.kind === part.kind && e.state === 'captured');
 publish(replaces ? entries.map(e => e === replaces ? { ...held, id: replaces.id } : e) : [...entries, held]);
 return held;
}

/** Sealing is the nurse saying she is done. The contract's own word for the state she leaves it in. */
export function seal(visit: string) {
 publish(entries.map(e => e.visit === visit && e.state === 'captured' ? { ...e, state: 'queued' } : e));
}

/* Whether a visit has been signed off, asked of the queue rather than of a flag beside the day list.
   A nurse signed an assessment and went back to her schedule to find the same visit still reading
   NEXT with "Start this visit" on it — the one screen in the workspace that should have known was
   the one that did not. It is derived rather than recorded because the sign-off already exists here:
   a second boolean saying the same thing is a second thing that can be wrong. */
export const signOffFor = (list: Part[], visit: string) =>
 list.find(part => part.visit === visit && part.kind === 'sign-off');

/* ---- Arriving --------------------------------------------------------------------------------
   The same four questions capture.ts asks of a reading, in the same order and for the same reasons:
   whether the person who did the work may still file it, whether the record moved on underneath it,
   and — for readings only — whether the record already holds this observation for this visit. The
   clocks are last and never a refusal.

   Readings are not re-implemented. Each one goes through receive(), handed only the stored readings
   of its own visit: two visits on one phone both holding a pulse is two pulses, not a duplicate. */
export type ArrivalContext = {
 now: string;
 capturerAllowed: boolean;
 capturerReason?: string;
 /** A doctor signed, or the visit was cancelled, while the part was waiting. */
 recordMovedOn: boolean;
 movedOnNote?: string;
};
export function receivePart(part: Part, context: ArrivalContext, stored: Part[]): Part {
 const received = { ...part, receivedAt: context.now };
 if (!context.capturerAllowed) return {
  ...received, state: 'conflicted', conflictId: 'vetting-lapsed',
  note: `${part.byName} was cleared when she did this and is not cleared now. ${context.capturerReason ?? ''} It is kept — it was validly done — and it is not filed on her authority alone.`.trim()
 };
 if (context.recordMovedOn) return {
  ...received, state: 'conflicted', conflictId: 'stale-write',
  note: context.movedOnNote ?? 'The record changed while this was waiting to send. It is never applied silently after the fact.'
 };
 if (part.readings?.length) {
  const alreadyStored = stored
   .filter(s => s.visit === part.visit && s.state === 'stored')
   .flatMap(s => s.readings ?? []);
  const answered = part.readings.map(reading => receive(reading, {
   now: context.now, stored: alreadyStored, capturerAllowed: true, recordSigned: false
  }));
  const clash = answered.find(r => r.state === 'conflicted');
  if (clash) return {
   ...received, readings: answered, state: 'conflicted', conflictId: clash.conflictId,
   note: clash.note
  };
  return { ...received, readings: answered, state: 'stored' };
 }
 return { ...received, state: 'stored' };
}

/** Two steps with a pause between them, because "sending" is a state a nurse can watch fail. */
export function beginSend(visit?: string) {
 publish(entries.map(e => e.state === 'queued' && (!visit || e.visit === visit) ? { ...e, state: 'sending' } : e));
}
/** An interrupted send puts the work back in the queue, and nowhere else. */
export function interruptSend() {
 publish(entries.map(e => e.state === 'sending'
  ? { ...e, state: 'queued', note: 'The send was interrupted. It went back to the queue rather than anywhere else.' }
  : e));
}
export function settleSend(context: ArrivalContext) {
 if (!entries.some(e => e.state === 'sending')) return;         // interrupted while in flight
 const settled: Part[] = [];
 const already = entries.filter(e => e.state !== 'sending');
 for (const part of entries.filter(e => e.state === 'sending')) {
  settled.push(receivePart(part, context, [...already, ...settled]));
 }
 publish(entries.map(e => settled.find(s => s.id === e.id) ?? e));
}

/* ---- What the Thuso Kit surface is holding ---------------------------------------------------
   A nurse does not have two queues, so she must not be shown two counts. The kit screen keeps its
   own reading-level list, because its subject is one instrument and one reading at a time; what it
   publishes here is how many of those have not left the phone, so that "what is waiting" is one
   number wherever she reads it. */
let instrumentPending = 0;
export function reportInstrumentQueue(count: number) {
 if (count === instrumentPending) return;
 instrumentPending = count;
 /* Republished rather than only announced. Subscribers read the parts array as their snapshot, and
    a snapshot that is referentially the same is a re-render React is entitled to skip — so a count
    that changed with no part changing would not reach the strip. */
 publish([...entries]);
}
export const instrumentQueueCount = () => instrumentPending;

/* ---- What is found on opening ----------------------------------------------------------------
   One part from the last house, sealed and never sent, and one that reached the record two days
   ago. Not staging: the first is what an offline queue looks like at the start of a shift, and the
   second is what gives the duplicate check something to answer against. */
const HOURS = 3_600_000;
const opened = Date.now();
export const seedVisit = 'TH-2041';
export function seedQueue() {
 if (entries.length) return;
 publish([
  {
   id: nextPartId(), kind: 'observations', visit: seedVisit, patient: 'R. Sithole',
   summary: 'Three readings from yesterday’s visit in Parktown',
   detail: [['Blood pressure — systolic', '138 mmHg'], ['Pulse', '78 bpm'], ['Temperature', '36.9 °C']],
   readings: [
    { id: nextCaptureId(), observationId: 'systolic', label: 'Blood pressure — systolic', unit: 'mmHg', value: '138', provenance: 'manual', by: 'N-205', byName: 'Sister Naledi Mokoena', deviceAt: new Date(opened - 20 * HOURS).toISOString(), state: 'queued' },
    { id: nextCaptureId(), observationId: 'pulse', label: 'Pulse', unit: 'bpm', value: '78', provenance: 'manual', by: 'N-205', byName: 'Sister Naledi Mokoena', deviceAt: new Date(opened - 20 * HOURS).toISOString(), state: 'queued' },
    { id: nextCaptureId(), observationId: 'temperature', label: 'Temperature', unit: '°C', value: '36.9', provenance: 'manual', by: 'N-205', byName: 'Sister Naledi Mokoena', deviceAt: new Date(opened - 20 * HOURS).toISOString(), state: 'queued' }
   ],
   by: 'N-205', byName: 'Sister Naledi Mokoena',
   capturedAt: new Date(opened - 20 * HOURS).toISOString(), state: 'queued'
  },
  {
   id: nextPartId(), kind: 'identity', visit: seedVisit, patient: 'R. Sithole',
   summary: 'Visit code confirmed at the door, and identity seen',
   detail: [['Visit code', 'Six digits, matched'], ['Identity', 'Document seen by the nurse']],
   by: 'N-205', byName: 'Sister Naledi Mokoena',
   capturedAt: new Date(opened - 20.2 * HOURS).toISOString(),
   receivedAt: new Date(opened - 19.9 * HOURS).toISOString(), state: 'stored'
  }
 ]);
}

/** The age of the oldest thing still on the phone, in words. Nothing here is a bare timestamp. */
export function oldestPendingText(list: Part[]): string | null {
 const pending = list.filter(isPending);
 if (!pending.length) return null;
 const oldest = pending.reduce((a, b) => new Date(a.capturedAt) < new Date(b.capturedAt) ? a : b);
 return ageText(oldest.capturedAt);
}
