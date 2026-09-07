import contract from '../../../../packages/catalog/capture.json';
import { EXPIRY_WARNING_DAYS, daysUntil, formatDate, inMonths, isoDate } from './vetting';

/* Where a reading came from, held as data in packages/catalog/capture.json for the same reason the
   vetting table and the record contract are held as data: three apps that each decide for
   themselves what a device reading is will eventually disagree, and the disagreement will be found
   in a record rather than in a review.

   The contract's first rule is the one everything below is arranged around — every reading carries
   exactly one provenance, there is no default and no unknown. That is not honoured by offering the
   nurse a list to pick from: a list has a first item, and a first item is a default that will be
   accepted a thousand times without being read. It is honoured by making provenance a fact about
   how the value arrived. A number somebody typed was typed. A number read off a paired instrument
   was measured. A number the patient gave is what the patient said. A number this app worked out
   names its inputs. None of the four can be blank, because each of them is the arrival itself.

   Nothing here connects to anything. There is no Web Bluetooth call in this codebase, no native
   bridge to one, and no instrument at the other end. The six instruments are the contract's six,
   read out of the file. */

export type ProvenanceId = 'device' | 'manual' | 'patient-reported' | 'derived';
export type Provenance = typeof contract.provenance[number];
export const provenances = contract.provenance as Provenance[];
export const provenanceById = (id: ProvenanceId) => provenances.find(p => p.id === id)!;
/* The word that goes beside a number, as against the sentence that goes under one. The contract's
   own names are written for a specification — “Measured by a device” is right in a table of four
   and wrong on a chip beside 118 mmHg. */
export const provenanceWord: Record<ProvenanceId, string> = {
 device: 'Instrument', manual: 'Clinician', 'patient-reported': 'Patient said', derived: 'Calculated'
};

export type KitDevice = typeof contract.devices[number];
export const devices = contract.devices as KitDevice[];
export const deviceById = (id: string) => devices.find(d => d.id === id);

export type CaptureStateId = 'captured' | 'queued' | 'sending' | 'stored' | 'conflicted' | 'refused';
export type CaptureStateSpec = { id: CaptureStateId; name: string; detail: string };
export const captureStates = contract.captureStates as CaptureStateSpec[];
export const captureStateById = (id: CaptureStateId) => captureStates.find(s => s.id === id)!;

export type ConflictId = 'duplicate-observation' | 'clock-skew' | 'stale-write' | 'vetting-lapsed';
export type ConflictSpec = { id: ConflictId; name: string; resolution: 'clinician' | 'server'; detail: string };
export const conflicts = contract.conflicts as ConflictSpec[];
export const conflictById = (id: ConflictId) => conflicts.find(c => c.id === id)!;
export const rules = contract.rules;

/* ---- Instruments ---------------------------------------------------------------------------
   The contract says how often each instrument is calibrated. When a particular instrument was last
   calibrated is a fact about a physical object in a nurse's bag, so it is a fixture here rather
   than a claim in the contract. Dates are relative to today, so the preview never goes stale.

   One of the six is deliberately out of calibration and one is close to it, because a rule nobody
   ever sees fire is a rule nobody has reviewed. */
export type Instrument = { deviceId: string; serial: string; calibratedOn: string };
export const kit: Instrument[] = [
 { deviceId: 'bp-cuff', serial: 'MT-BP-4471', calibratedOn: inMonths(-5) },
 { deviceId: 'pulse-oximeter', serial: 'MT-OX-2210', calibratedOn: inMonths(-23) },   // due within the warning window
 { deviceId: 'thermometer', serial: 'MT-TH-0938', calibratedOn: inMonths(-3) },
 { deviceId: 'glucometer', serial: 'MT-GL-1157', calibratedOn: inMonths(-8) },        // overdue: a 6-month cadence, 8 months ago
 { deviceId: 'scale', serial: 'MT-SC-6602', calibratedOn: inMonths(-2) },
 { deviceId: 'ecg', serial: 'MT-EC-3319', calibratedOn: inMonths(-6) }
];
export const instrumentBySerial = (serial: string) => kit.find(i => i.serial === serial);

export type CalibrationState = 'in-date' | 'due' | 'overdue';
export type Calibration = { state: CalibrationState; dueOn: string; days: number; text: string };
/* Resolved from the last calibration and the contract's cadence rather than stored, for the same
   reason vetting resolves a stored “verified” against its expiry date: a state written down once is
   only true until the date it was written against.

   The warning window is the vetting module's own 45 days rather than a second number. A window that
   is 45 days in one module and 30 in another is two different warnings wearing one word. */
export function calibrationOf(instrument: Instrument): Calibration {
 const device = deviceById(instrument.deviceId)!;
 const due = new Date(`${instrument.calibratedOn}T00:00:00Z`);
 due.setMonth(due.getMonth() + device.calibrateEveryMonths);
 const dueOn = isoDate(due);
 const days = daysUntil(dueOn)!;
 const state: CalibrationState = days < 0 ? 'overdue' : days <= EXPIRY_WARNING_DAYS ? 'due' : 'in-date';
 const text = state === 'overdue'
  ? `Calibration ran out ${-days} days ago, on ${formatDate(dueOn)}.`
  : state === 'due'
   ? `Calibration is due in ${days} days, on ${formatDate(dueOn)}.`
   : `Calibrated ${formatDate(instrument.calibratedOn)}. Next due ${formatDate(dueOn)}.`;
 return { state, dueOn, days, text };
}
/* The whole of calibrationNeverRefuses, in one sentence that has to travel with the number. The
   nurse in the home with one glucometer still needs the reading; what she must not have is the
   reading on its own. */
export function calibrationCaveat(instrument: Instrument, calibration: Calibration): string | undefined {
 if (calibration.state === 'in-date') return undefined;
 const name = deviceById(instrument.deviceId)!.name.toLowerCase();
 return calibration.state === 'overdue'
  ? `This ${name} is ${-calibration.days} days past its calibration date. The reading is taken, kept and filed — and every screen it appears on says this, because a number without the caveat is the only thing worse than no number.`
  : `This ${name} is due for calibration in ${calibration.days} days. The reading stands; the instrument needs booking in.`;
}

/* ---- What the instrument cannot know -------------------------------------------------------
   Each device in the contract carries a note naming a real clinical limitation, and every one of
   those notes ends in the same place: something the instrument cannot record about itself and the
   person holding it must. The cuff, the site, the strip lot, the position. So the note is not
   printed as advice next to a finished reading — it is asked, before the reading is taken, by the
   person who can still answer it.

   There is no default option here either, and for the same reason as provenance. */
export type ContextPrompt = { label: string; question: string; options: string[] };
export const contextFor: Record<string, ContextPrompt> = {
 'bp-cuff': { label: 'Cuff used', question: 'Which cuff is on the arm?', options: ['Small adult · 22–26 cm', 'Standard adult · 27–34 cm', 'Large adult · 35–44 cm', 'Thigh cuff · 45–52 cm'] },
 'pulse-oximeter': { label: 'Site and perfusion', question: 'Where is the probe, and how is the trace?', options: ['Index finger · warm hands, steady trace', 'Index finger · cold hands, weak trace', 'Earlobe · after a poor finger trace', 'Toe · finger unusable'] },
 thermometer: { label: 'Site', question: 'Where was the temperature taken?', options: ['Forehead', 'Temporal artery', 'Ear', 'Oral', 'Axillary'] },
 glucometer: { label: 'Strip lot', question: 'Which strip lot, and when does it expire?', options: ['Lot 24C118 · expires Mar 2027', 'Lot 24F440 · expires Nov 2026', 'Lot 23K902 · expired Jun 2026'] },
 scale: { label: 'Position', question: 'How was the patient weighed?', options: ['Standing, unaided', 'Standing, supported', 'Seated', 'Weighed in bed'] },
 ecg: { label: 'Lead placement', question: 'How was the single lead placed?', options: ['Lead I · both hands', 'Lead II · left knee', 'Chest position'] }
};

/* ---- Where one value came from --------------------------------------------------------------
   The smallest honest description of a reading's origin, and the thing every screen that shows a
   number is handed alongside it. It lives here rather than in the component that draws it because
   fixtures, the queue and the assessment all have to be able to state one, and a type that only
   the renderer knows is a type the data can quietly omit.

   Two ways of carrying a calibration, deliberately. A reading taken in this session carries the
   whole resolved calibration; a reading in a fixture carries only the state it was in *at the
   time*. Looking the state up again later would be wrong in the one direction that matters: an
   instrument that goes out of calibration next week did not take last week's reading out of
   calibration. */
export type Source = {
 provenance: ProvenanceId;
 serial?: string;
 calibration?: Calibration;
 calibrationAtCapture?: CalibrationState;
 context?: string;
 by?: string;                       // the registration a typed reading is attributed to
 inputs?: string[];                 // a calculated reading names what it was calculated from
 saidBy?: string;
};
export const calibrationState = (source: Source) => source.calibration?.state ?? source.calibrationAtCapture;

/* ---- A reading ------------------------------------------------------------------------------ */
export type Capture = {
 id: string;
 observationId: string;
 label: string;
 unit: string;
 value: string;
 provenance: ProvenanceId;
 /* Device readings only. Held as they stood at capture, not looked up again later: an instrument
    that goes out of calibration next week did not take last week's reading out of calibration. */
 serial?: string;
 calibration?: Calibration;
 context?: string;
 /* Derived readings name their inputs, because a derived value whose inputs are unknown is not a
    value. Patient-reported readings name who said it. */
 inputs?: string[];
 saidBy?: string;
 by: string;                        // the vetting subject who captured it
 byName: string;
 /* Two times, never one. The device's is what the device believed; the server's is what everything
    is ordered by. */
 deviceAt: string;
 receivedAt?: string;
 state: CaptureStateId;
 conflictId?: ConflictId;
 note?: string;
 /* A superseded reading is kept and marked, never deleted. */
 supersededBy?: string;
 countersignedBy?: string;
};

let sequence = 0;
export const nextCaptureId = () => `CAP-${String(++sequence).padStart(4, '0')}`;

/* ---- Time, in words -------------------------------------------------------------------------
   offlineNeverServesStaleSilently: a value read from the device's own store carries when it was
   written, on screen, in words. The sibling project's rule is the one worth keeping — the age
   travels *with* the data rather than instead of a request for fresh data, and it is never left as
   a bare timestamp for somebody standing in a kitchen to do arithmetic on. */
export function ageText(iso: string, now = Date.now()): string {
 const clock = new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
 const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
 if (minutes < 1) return `written just now, at ${clock}`;
 if (minutes === 1) return `written a minute ago, at ${clock}`;
 if (minutes < 60) return `written ${minutes} minutes ago, at ${clock}`;
 const hours = Math.round(minutes / 60);
 if (hours < 24) return `written ${hours} ${hours === 1 ? 'hour' : 'hours'} ago, at ${clock}`;
 const days = Math.round(hours / 24);
 if (days === 1) return `written yesterday at ${clock}`;
 return `written ${days} days ago, on ${new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} at ${clock}`;
}
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
/* Anything above this and the two clocks are not describing the same moment. Five minutes is
   generous for a device that has been in a bag for a week; anything tighter would call a rounding
   difference a conflict. */
export const CLOCK_SKEW_TOLERANCE_MINUTES = 5;
export function skewMinutes(deviceAt: string, receivedAt: string) {
 return Math.round((new Date(receivedAt).getTime() - new Date(deviceAt).getTime()) / 60_000);
}
export function skewText(deviceAt: string, receivedAt: string): string {
 const minutes = skewMinutes(deviceAt, receivedAt);
 const size = Math.abs(minutes);
 const span = size >= 60 ? `${Math.floor(size / 60)} h ${size % 60} min` : `${size} min`;
 return `The instrument's own clock is ${span} ${minutes > 0 ? 'behind' : 'ahead of'} the server. Ordering uses the server's receipt time; the instrument's time is kept beside it as what the instrument believed, not as when this happened.`;
}

/* ---- A fictional number ---------------------------------------------------------------------
   No instrument is read. A plausible value is invented so the flow can be walked, and every screen
   that shows one says it is invented. */
const sampleRanges: Record<string, [number, number, number]> = {
 systolic: [108, 152, 0], diastolic: [64, 96, 0], pulse: [58, 96, 0], respiratory: [12, 22, 0],
 temperature: [36.2, 38.1, 1], oxygen: [91, 99, 0], glucose: [4.1, 9.4, 1], weight: [58, 94, 1]
};
/* A single-lead trace is not a number, so it does not get one. What it gets is a phrase and the
   contract's warning that the phrase is screening rather than a diagnosis. */
const traces = ['Sinus rhythm, 74 bpm', 'Sinus rhythm, 88 bpm', 'Possible atrial fibrillation, 102 bpm', 'Trace too noisy to interpret'];
export function inventReading(measure: string): string {
 if (measure === 'ecg') return traces[Math.floor(Math.random() * traces.length)];
 const [low, high, decimals] = sampleRanges[measure] ?? [1, 100, 0];
 return (low + Math.random() * (high - low)).toFixed(decimals);
}

/* ---- Receiving an entry ---------------------------------------------------------------------
   The server side of a sync, written as one function so the order of the questions is visible and
   arguable rather than scattered through a component. The order is the argument:

   1. Whether the person who took it may still file it, because that decides whether anything else
      is worth asking.
   2. Whether the record moved on underneath it.
   3. Whether the record already holds this observation for this visit.
   4. The clocks — last, and never as a refusal. A disagreeing clock is resolved by the server, on
      its own, because ordering is the server's to decide. It is the only one of the four the
      contract does not send to a clinician, and the only thing it changes is the order.

   Nothing here merges and nothing here discards. Every answer that is not “stored” leaves the entry
   in the queue with a reason attached to it. */
export type ReceiveContext = {
 now: string;
 stored: Capture[];
 capturerAllowed: boolean;
 capturerReason?: string;
 recordSigned: boolean;
};
export function receive(entry: Capture, context: ReceiveContext): Capture {
 const received = { ...entry, receivedAt: context.now };
 if (!context.capturerAllowed) return {
  ...received, state: 'conflicted', conflictId: 'vetting-lapsed',
  note: `${entry.byName} was cleared when this reading was taken and is not cleared now. ${context.capturerReason ?? ''} The reading is kept — it was validly taken — and it is not filed on her authority alone.`.trim()
 };
 if (context.recordSigned) return {
  ...received, state: 'conflicted', conflictId: 'stale-write',
  note: 'A doctor signed this visit while the entry was waiting to send. It is never applied silently after the fact, and a signed record is not edited behind the signature.'
 };
 const clash = context.stored.find(s => s.observationId === entry.observationId && s.state === 'stored' && !s.supersededBy);
 if (clash) return {
  ...received, state: 'conflicted', conflictId: 'duplicate-observation',
  note: `The record already holds a ${entry.label.toLowerCase()} for this visit — ${clash.value} ${clash.unit}, ${provenanceWord[clash.provenance].toLowerCase()}. Both are kept until a clinician says which stands.`
 };
 const skew = Math.abs(skewMinutes(entry.deviceAt, context.now));
 return skew > CLOCK_SKEW_TOLERANCE_MINUTES
  ? { ...received, state: 'stored', conflictId: 'clock-skew', note: skewText(entry.deviceAt, context.now) }
  : { ...received, state: 'stored' };
}
