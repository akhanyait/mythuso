/* Sentinel tiers one to three, and safeguarding reports, on the Safety engine: the arithmetic, with no store, no bus and
 * no clock of its own. Every word is packages/catalog/sentinel.json's, and every refusal is the route's own sentence in
 * packages/catalog/apis/safety.json, read by sentinelRefusal().
 *
 * NOTHING HERE DECIDES WHETHER A READING IS CONCERNING. Baseline rules, deviation thresholds and what a deviation is come
 * only from the clinical governance board, and none is ratified. So evaluate() answers not-evaluated, with the reason as
 * a sentence, whatever it is asked about: its answer has no rung in it, and no branch of it can return one. A tier is
 * raised only by raiseByHand(), at the tier a named clinician chose, and this file never picks one. No reading's value,
 * no baseline's value and no reference range is read or kept here.
 *
 * A CONSUMER READING NEVER FORMS A BASELINE OR RAISES A TIER, AND IT IS ARITHMETIC. An engine may not import another
 * engine's code, so Sentinel cannot call Devices' carriesWeight(), and it does not need to: Devices publishes
 * reading.ingested@1 only when packages/engines/src/devices/domain/readings.ts carriesWeight() says a reading carries
 * clinical weight — a certified registered device, not simulated, an adequate sample, not recalled, meant for the
 * record — and heard() below, which takes nothing but that event's payload, is the only way a reading enters Sentinel.
 * A reading Sentinel never heard is in no baseline, and raiseByHand() refuses a tier on it. scripts/check-boundaries.mjs
 * runs Devices' ask() and link() with this file to hold the chain, and packages/engines/src/safety/sentinel.test.ts runs
 * both engines on one bus.
 *
 * A BASELINE KEEPS ITS SETTINGS. openBaseline() is handed the window and the minimum in force and keeps them with the
 * settings version, and baselineOf() reads only what the baseline kept, so an admin's change reaches the next baseline
 * and never rewrites one already open.
 *
 * STALE SUSPENDS, RECALLED REMOVES. device.stale@1 suspends every baseline a reading from the device is counted in:
 * suspended means shown as suspended and counting towards nothing, whatever it holds, until that device sends a newer
 * reading with clinical weight. The stale interval is Devices' setting, applied by Devices when it announces; nothing
 * here knows how long a device may be silent. device.recalled@1 carries no moment the recall took effect from, so every
 * reading from the device leaves every baseline, kept by reference with when it left, and a recalled device's suspension
 * is lifted with it, because it will never sync again to lift it.
 *
 * SAFEGUARDING. A report holds who it is about, the group and the kind of concern chosen from the contract, who recorded
 * it, and nothing typed. It is open for good: nothing here moves a report out of open, because no safeguarding officer
 * role exists to close one. It is never sent: the statutory code is the contract's not-sent, and the module refuses to
 * load if the contract ever says a connection exists. The desk's rows carry neither the kind, the patient nor the
 * reporter, and a guardian is refused before anything is read.
 *
 * Zero dependencies and apps/api's type-stripping rules. Nothing here is a real service. */
import contract from '../../../../catalog/sentinel.json' with { type: 'json' };
import api from '../../../../catalog/apis/safety.json' with { type: 'json' };
import protocols from '../../../../catalog/protocols.json' with { type: 'json' };
import records from '../../../../catalog/records.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import { MINUTE, type Refusal, type Refused } from './rules.ts';
import type { SentinelSettings } from './settings.ts';

export const sentinelContract = contract;
/* A day in milliseconds: a unit, spelt as Devices' contract spells it, so that no number here could be read as a
   setting — neither Devices' stale interval in minutes nor any Safety timing. */
const DAY = 86_400_000;

export const SENTINEL_ROUTES = {
 raise: 'POST /v1/safety/sentinel-deviations@2',
 baselines: 'GET /v1/safety/sentinel-baselines@1',
 report: 'POST /v1/safety/safeguarding-reports@2',
 reports: 'GET /v1/safety/safeguarding-reports@1'
} as const;
export type SentinelRoute = keyof typeof SENTINEL_ROUTES;

type ApiRefusal = { readonly id: string; readonly status: number; readonly statement: string; readonly answeredBy?: readonly string[] };
type ApiRoute = { readonly method: string; readonly path: string; readonly version: number; readonly refusals: readonly ApiRefusal[] };

/** The sentence a route refuses with: its own, or an engine refusal that names it. Throws for anything else. */
export function sentinelRefusal(route: SentinelRoute, id: string): Refusal {
 const key = SENTINEL_ROUTES[route];
 const declared = (api.routes as readonly ApiRoute[]).find(r => `${r.method} ${r.path}@${r.version}` === key);
 if (!declared) throw new Error(`packages/catalog/apis/safety.json does not declare ${key}.`);
 const found = declared.refusals.find(r => r.id === id) ?? (api.refusals as readonly ApiRefusal[]).find(r => r.id === id && (r.answeredBy ?? []).includes(key));
 if (!found) throw new Error(`${key} cannot answer the refusal "${id}": neither the route nor an engine refusal naming it declares one.`);
 return { id, status: found.status, statement: found.statement };
}
const refuseOn = (route: SentinelRoute, id: string): Refused => ({ ok: false, refusal: sentinelRefusal(route, id) });

export type SentinelEmit =
 | { readonly type: 'sentinel.rung_raised'; readonly version: 1; readonly payload: { readonly concernRef: string; readonly rung: number; readonly recordEntryRef: string } }
 | { readonly type: 'safeguarding.reported'; readonly version: 2; readonly payload: { readonly reportRef: string } };
export type Done<T> = { readonly ok: true; readonly value: T; readonly emits: readonly SentinelEmit[] };
export type Result<T> = Done<T> | Refused;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/* ── The tiers ──────────────────────────────────────────────────────────────────────────────────────── */

export type Rung = { readonly rung: number; readonly id: string; readonly label: string; readonly means: string; readonly toldCode: string; readonly whoIsTold: string };
export const rungs = contract.rungs as readonly Rung[];
export const rungOf = (rung: unknown): Rung | undefined => rungs.find(r => r.rung === rung);
/* The highest tier this build offers is the last the contract lists. Anything above it is tier four or beyond, which is
   refused in its own sentence rather than recorded as the highest one there is. */
const highestRung = Math.max(...rungs.map(r => r.rung));
export const tierFour = contract.tierFour;

/* ── A reading heard ────────────────────────────────────────────────────────────────────────────────── */

export type HeardReading = {
 readonly readingRef: string;
 readonly subjectRef: string;
 readonly deviceRef: string;
 readonly metric: string;
 /** The Health Passport entry the value was written to. Sentinel names a reading by this and never holds the value. */
 readonly recordEntryRef: string;
 /** When it reached the record, by the event's own clock. */
 readonly heardAt: number;
 /** When its device's recall took it out of every baseline, or null. */
 readonly leftByRecallAt: number | null;
};

const measures = new Set((records.observations.measures as { id: string }[]).map(m => m.id));

/** reading.ingested@1, and nothing else, is how a reading enters Sentinel. A payload missing what it declares, or naming a measure the record does not hold, is not heard. */
export function heard(payload: Readonly<Record<string, unknown>>, subjectRef: string, heardAt: number): HeardReading | null {
 const readingRef = text(payload['readingRef']);
 const deviceRef = text(payload['deviceRef']);
 const metric = text(payload['metric']);
 const recordEntryRef = text(payload['observationRef']);
 if (!readingRef || !deviceRef || !metric || !recordEntryRef || !measures.has(metric) || !text(subjectRef)) return null;
 return { readingRef, subjectRef, deviceRef, metric, recordEntryRef, heardAt, leftByRecallAt: null };
}

/* ── A baseline ─────────────────────────────────────────────────────────────────────────────────────── */

export type Baseline = {
 readonly subjectRef: string;
 readonly metric: string;
 readonly openedAt: number;
 readonly settingsVersion: number;
 readonly windowDays: number;
 readonly minimumReadings: number;
 /** Each device announced stale while a reading from it was counted here, and when. Empty while none is. */
 readonly suspendedBy: readonly { readonly deviceRef: string; readonly since: number }[];
};

export const openBaseline = (subjectRef: string, metric: string, settings: SentinelSettings, now: number): Baseline => ({
 subjectRef, metric, openedAt: now, settingsVersion: settings.settingsVersion, windowDays: settings.windowDays, minimumReadings: settings.minimumReadings, suspendedBy: []
});

export type BaselineStateId = 'forming' | 'formed' | 'suspended';
export type BaselineView = {
 readonly metric: string;
 readonly stateCode: BaselineStateId;
 readonly countedSoFar: number;
 readonly neededToForm: number;
 readonly windowDays: number;
 readonly settingsVersion: number;
 readonly openedAt: number;
 readonly suspendedSince: number | null;
 readonly leftByRecall: number;
};

/* What a baseline holds now, from what it kept when it was opened: never the settings in force. A reading counts when it
   is this patient's, of this measure, inside the window the baseline kept, and has not left by a recall. Suspended is
   asked first, because a suspended baseline counts towards nothing whatever it holds. */
export function baselineOf(baseline: Baseline, readings: readonly HeardReading[], now: number): BaselineView {
 const mine = readings.filter(r => r.subjectRef === baseline.subjectRef && r.metric === baseline.metric);
 const countedSoFar = mine.filter(r => r.leftByRecallAt === null && now - r.heardAt <= baseline.windowDays * DAY).length;
 const suspendedSince = baseline.suspendedBy.length ? Math.min(...baseline.suspendedBy.map(s => s.since)) : null;
 const stateCode: BaselineStateId = suspendedSince !== null ? 'suspended' : countedSoFar >= baseline.minimumReadings ? 'formed' : 'forming';
 return {
  metric: baseline.metric, stateCode, countedSoFar, neededToForm: baseline.minimumReadings, windowDays: baseline.windowDays,
  settingsVersion: baseline.settingsVersion, openedAt: baseline.openedAt, suspendedSince, leftByRecall: mine.filter(r => r.leftByRecallAt !== null).length
 };
}

const pairOf = (r: { subjectRef: string; metric: string }) => `${r.subjectRef} ${r.metric}`;

/** device.stale@1: every baseline a counted reading from the device is in, suspended from the moment of the announcement. Returns the baselines it changed. */
export function suspendFor(baselines: readonly Baseline[], readings: readonly HeardReading[], deviceRef: string, at: number): Baseline[] {
 const touched = new Set(readings.filter(r => r.deviceRef === deviceRef && r.leftByRecallAt === null).map(pairOf));
 return baselines.filter(b => touched.has(pairOf(b)) && !b.suspendedBy.some(s => s.deviceRef === deviceRef))
  .map(b => ({ ...b, suspendedBy: [...b.suspendedBy, { deviceRef, since: at }] }));
}

/** A newer reading heard from a device lifts the suspension that device's silence put on any baseline. Returns the baselines it changed. */
export function resumeFor(baselines: readonly Baseline[], deviceRef: string, at: number): Baseline[] {
 return baselines.filter(b => b.suspendedBy.some(s => s.deviceRef === deviceRef && s.since <= at))
  .map(b => ({ ...b, suspendedBy: b.suspendedBy.filter(s => s.deviceRef !== deviceRef) }));
}

/** device.recalled@1: every reading from the device leaves every baseline, and the device's suspensions go with it. */
export function leaveByRecall(readings: readonly HeardReading[], baselines: readonly Baseline[], deviceRef: string, at: number): { readonly readings: HeardReading[]; readonly baselines: Baseline[] } {
 return {
  readings: readings.filter(r => r.deviceRef === deviceRef && r.leftByRecallAt === null).map(r => ({ ...r, leftByRecallAt: at })),
  baselines: baselines.filter(b => b.suspendedBy.some(s => s.deviceRef === deviceRef)).map(b => ({ ...b, suspendedBy: b.suspendedBy.filter(s => s.deviceRef !== deviceRef) }))
 };
}

/* ── Evaluation ─────────────────────────────────────────────────────────────────────────────────────── */

export type Evaluation = { readonly code: 'not-evaluated'; readonly reasonCode: string; readonly sentence: string };
const reasons = contract.evaluation.reasons as readonly { id: string; sentence: string }[];
const reasonSentence = (id: string): string => {
 const found = reasons.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/sentinel.json evaluation has no reason "${id}".`);
 return found.sentence;
};

/* Not evaluated, always. A rule the contract names is only a reason to say so differently: it must be a Safety protocol
   the register lists as ratified, and even then nothing here is built to apply it. */
export function evaluate(): Evaluation {
 const ratified = new Set((protocols.protocols as { id: string; engine: string; status: string }[]).filter(p => p.engine === 'safety' && p.status === 'ratified').map(p => p.id));
 const named = contract.evaluation.ratifiedRules as readonly string[];
 const reasonCode = named.length && named.every(id => ratified.has(id)) ? 'ratified-rule-not-built' : 'no-ratified-rule';
 return { code: 'not-evaluated', reasonCode, sentence: reasonSentence(reasonCode) };
}

/* ── A tier raised by hand ──────────────────────────────────────────────────────────────────────────── */

export type Deviation = {
 readonly deviationRef: string;
 readonly subjectRef: string;
 readonly recordEntryRef: string;
 readonly readingRef: string;
 readonly rung: number;
 readonly toldCode: string;
 readonly raisedAt: number;
 readonly raisedByRole: string;
 readonly raisedByRef: string;
};
export type RaiseInput = {
 readonly deviationRef: string; readonly subjectRef: unknown; readonly recordEntryRef: unknown; readonly rung: unknown;
 readonly byRole: string; readonly byRef: string | null; readonly undeclared: readonly string[];
};

/* The order a tier is refused in, and why. Anything sent beside the three fields first, because a value under any name is
   refused before anything else is read. Then who, because a tier nobody can be asked about pages a doctor for nothing.
   Then the tier itself — beyond the ladder is tier four, refused in its own words, and anything else off the ladder is
   refused as that. Then the reading: one Sentinel never heard carries no clinical weight, one of somebody else's is
   refused, and one whose device was recalled has left. */
export function raiseByHand(input: RaiseInput, readings: readonly HeardReading[], now: number): Result<Deviation> {
 if (input.undeclared.length) return refuseOn('raise', 'deviation-carries-nothing-else');
 if (!text(input.byRef)) return refuseOn('raise', 'raised-by-nobody');
 const rung = input.rung;
 if (typeof rung !== 'number' || !Number.isInteger(rung)) return refuseOn('raise', 'rung-not-on-the-sentinel-ladder');
 if (rung > highestRung) return refuseOn('raise', 'tier-four-not-in-this-build');
 const chosen = rungOf(rung);
 if (!chosen) return refuseOn('raise', 'rung-not-on-the-sentinel-ladder');
 const reading = readings.find(r => r.recordEntryRef === input.recordEntryRef);
 if (!reading) return refuseOn('raise', 'no-clinical-weight-behind-it');
 if (reading.subjectRef !== input.subjectRef) return refuseOn('raise', 'not-this-patients-reading');
 if (reading.leftByRecallAt !== null) return refuseOn('raise', 'reading-left-by-recall');
 const deviation: Deviation = {
  deviationRef: input.deviationRef, subjectRef: reading.subjectRef, recordEntryRef: reading.recordEntryRef, readingRef: reading.readingRef,
  rung: chosen.rung, toldCode: chosen.toldCode, raisedAt: now, raisedByRole: input.byRole, raisedByRef: input.byRef as string
 };
 return { ok: true, value: deviation, emits: [{ type: 'sentinel.rung_raised', version: 1, payload: { concernRef: deviation.deviationRef, rung: deviation.rung, recordEntryRef: deviation.recordEntryRef } }] };
}

/** A patient's Sentinel state, or null when Sentinel has heard nothing with clinical weight for them. */
export function stateFor(subjectRef: string, baselines: readonly Baseline[], readings: readonly HeardReading[], deviations: readonly Deviation[], now: number) {
 const theirs = baselines.filter(b => b.subjectRef === subjectRef);
 if (!theirs.length) return null;
 return {
  evaluation: evaluate(),
  baselines: theirs.map(b => baselineOf(b, readings, now)),
  /* Newest first. Two tiers raised in the same instant keep the later one first, so the store's own order is reversed
     before the stable sort rather than left to decide a tie the wrong way round. */
  raised: deviations.filter(d => d.subjectRef === subjectRef).reverse().sort((a, b) => b.raisedAt - a.raisedAt)
 };
}

/* ── Safeguarding ───────────────────────────────────────────────────────────────────────────────────── */

const safeguarding = contract.safeguarding;
if (safeguarding.statutory.integrated !== false || safeguarding.statutory.statusCode !== 'not-sent') {
 throw new Error('packages/catalog/sentinel.json says a connection to the South African Police Service or the Department of Social Development exists, or records a report as other than not sent. Nothing here sends a report, so nothing may say one was.');
}
export const groups = safeguarding.groups as readonly { id: string; label: string }[];
export const categories = safeguarding.categories as readonly { id: string; label: string }[];
const OPEN = safeguarding.states[0]!.id;
const GUARDIAN = vetting.roles.find(role => role.id === 'guardian')?.id;
if (!GUARDIAN) throw new Error('packages/catalog/vetting.json has lost the guardian role, whom the safeguarding list refuses by name.');

export type Report = {
 readonly reportRef: string;
 readonly subjectRef: string;
 readonly groupCode: string;
 readonly categoryCode: string;
 readonly recordedAt: number;
 readonly recordedByRole: string;
 readonly recordedByRef: string;
 readonly stateCode: string;
 readonly heldForCode: string;
 readonly statutoryCode: string;
 readonly statutoryReasonCode: string;
};
export type ReportInput = {
 readonly reportRef: string; readonly subjectRef: string; readonly groupCode: unknown; readonly categoryCode: unknown;
 readonly byRole: string; readonly byRef: string | null; readonly undeclared: readonly string[];
};

/* Who first, because a report nobody can be asked about is one the officer cannot act on; then anything typed, before the
   choices are read; then the group and the kind. The report is open, held for the officer and not sent, from the moment it
   is recorded and for good. */
export function recordReport(input: ReportInput, now: number): Result<Report> {
 if (!text(input.byRef)) return refuseOn('report', 'report-without-reporter');
 if (input.undeclared.length) return refuseOn('report', 'safeguarding-keeps-no-narrative');
 const group = groups.find(g => g.id === input.groupCode);
 if (!group) return refuseOn('report', 'safeguarding-group-not-declared');
 const category = categories.find(c => c.id === input.categoryCode);
 if (!category) return refuseOn('report', 'safeguarding-category-not-declared');
 const report: Report = {
  reportRef: input.reportRef, subjectRef: input.subjectRef, groupCode: group.id, categoryCode: category.id,
  recordedAt: now, recordedByRole: input.byRole, recordedByRef: input.byRef as string,
  stateCode: OPEN, heldForCode: safeguarding.officer.heldForCode, statutoryCode: safeguarding.statutory.statusCode, statutoryReasonCode: safeguarding.statutory.reasonCode
 };
 return { ok: true, value: report, emits: [{ type: 'safeguarding.reported', version: 2, payload: { reportRef: report.reportRef } }] };
}

/** A guardian is refused before the list is read. Anybody else the route admits reads the desk's rows. */
export const guardianRefused = (role: string): Refused | null => (role === GUARDIAN ? refuseOn('reports', 'guardian-told-nothing-of-safeguarding') : null);

export type ReportRow = {
 readonly reportRef: string; readonly recordedAt: number; readonly ageMinutes: number; readonly groupCode: string;
 readonly stateCode: string; readonly heldForCode: string; readonly statutoryCode: string; readonly statutoryReasonCode: string;
};
/* The desk's rows, written out field by field, so the kind of concern, the patient and the reporter have no way onto them. */
export const reportsForDesk = (reports: readonly Report[], now: number): ReportRow[] => [...reports].sort((a, b) => b.recordedAt - a.recordedAt).map(r => ({
 reportRef: r.reportRef, recordedAt: r.recordedAt, ageMinutes: Math.max(0, Math.floor((now - r.recordedAt) / MINUTE)), groupCode: r.groupCode,
 stateCode: r.stateCode, heldForCode: r.heldForCode, statutoryCode: r.statutoryCode, statutoryReasonCode: r.statutoryReasonCode
}));
