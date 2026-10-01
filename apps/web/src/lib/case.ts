import { useSyncExternalStore } from 'react';
import caseContract from '../../../../packages/catalog/case.json' with { type: 'json' };
import { devicesContract } from '../../../../packages/engines/src/devices/domain/contract.ts';
import { clinicalUseOf, type ClinicalUseCode } from '../../../../packages/engines/src/devices/domain/readings.ts';
import { isRatified, protocolName, refusal, type Refusal } from '../../../../packages/engines/src/clinical/domain/contract.ts';
import { featuresFor, findingsFor, intakeGroupHasPathway, type IntakeAnswer, type IntakeFeature, type IntakeFinding, type IntakeState } from '../../../../packages/gilbertone/src/intake.ts';
import { pathwayConditions, veryHighLine } from './case-pathway.generated';
import { observations } from './observations';
import { openCaseReview } from './clinical';
import { roleOf } from './roles';
import { subjectById } from './vetting-fixtures';

/* The Case in the web preview: one store for the tab, every rule a contract's.
 *
 * WHAT THIS IS. The founder's pathway of 28–29 September 2026, wired end to end so it can be demonstrated:
 * GilbertOne gathers a headache intake and a home-cuff reading; the preview pathway in
 * packages/catalog/case.json suggests where the patient is seen; a nurse takes the case, confirms or
 * overrides with a reason, repeats the reading on a kit instrument and asks a doctor; the doctor writes the
 * consultation and closes the case; the patient reads the plan in the doctor's words. Everything here is
 * held in this tab's memory and nowhere else — no storage of any kind, so a reload forgets every case,
 * which is right for a preview that may not persist anything about a patient.
 *
 * WHAT IT IS NOT. Triage. No priority, no time to treatment, no ratified protocol: the pathway is a draft
 * in packages/catalog/protocols.json, the banner says so on every screen that shows it, and the suggestion
 * is made once, when the case opens, and never remade — a nurse's decision stands against the suggestion
 * she was shown. Nothing decides for her: decideSetting() is called from her press and from nowhere else.
 * That holds for the emergency suggestion too: a case the pathway answers with the emergency setting opens
 * in `opened`, like any other, with the emergency answer already given to the patient, so a nurse takes
 * it, reads it and confirms or overrides — a case opened straight into `emergency` could never be taken.
 *
 * NUMBERS. None typed. The indicative ranges are records.json's through lib/observations; the very-high
 * line is the knowledge base's own sentence, read out of it by scripts/emit-case.mjs; whether a reading
 * carries clinical weight is the Devices domain's arithmetic, asked with the class, source, quality and
 * intended use packages/catalog/devices.json gives each source. A home cuff and a simulator never carry
 * weight, by that rule and not by a flag here.
 *
 * WHAT THE PATIENT MAY READ. patientView() hands the assistant a case with its findings and its suggestion
 * removed, and the panel renders from that shape alone — the same rule the proposed GET route declares
 * with its findings-are-a-clinicians refusal. */

type Words = typeof caseContract;
export const words: Words = caseContract;
export type CaseStateCode = (typeof caseContract.states)[number]['code'];
export type SettingCode = (typeof caseContract.settings.kinds)[number]['code'];
export type BandCode = 'in-range' | 'above' | 'below' | 'very-high' | 'none';
export type SourceId = (typeof devicesContract.sources)[number]['id'];
export type RoleCode = 'patient' | 'nurse' | 'doctor';

export type CaseReading = {
 readonly readingRef: string;
 readonly systolic: number;
 readonly diastolic: number;
 readonly said: string;
 readonly source: SourceId;
 readonly deviceClass: string;
 readonly quality: string;
 readonly intendedUse: string;
 readonly simulated: boolean;
 readonly marks: readonly string[];
 readonly weight: ClinicalUseCode;
 readonly band: BandCode;
 readonly takenAt: number;
 readonly byRole: RoleCode;
};
export type CaseDecision = {
 readonly roleCode: RoleCode;
 readonly actionCode: 'opened' | 'took' | 'confirmed' | 'overrode' | 'repeated-reading' | 'handed-over' | 'closed';
 readonly settingCode?: SettingCode;
 readonly reason?: string;
 readonly at: number;
};
export type Suggestion = {
 readonly settingCode: SettingCode;
 readonly ruleId: string;
 /** The rule's reason, filled with the features' own words and the reading's source. */
 readonly reason: string;
 readonly band: BandCode;
};
export type Case = {
 readonly caseRef: string;
 readonly subjectRef: string;
 readonly groupId: string;
 readonly stateCode: CaseStateCode;
 readonly answers: readonly IntakeAnswer[];
 readonly features: readonly IntakeFeature[];
 readonly findings: readonly IntakeFinding[];
 readonly readings: readonly CaseReading[];
 readonly suggestion: Suggestion;
 readonly protocolVersionId: string;
 readonly decisions: readonly CaseDecision[];
 readonly nurseRef: string | null;
 readonly doctorRef: string | null;
 readonly reviewRef: string | null;
 readonly consultationRef: string | null;
 readonly outcomeCode: string | null;
 /** The plan in the doctor's own words, once signed. */
 readonly plan: string | null;
 readonly openedAt: number;
 /** The events the engine would publish, by type@version, in order. Nothing here is a bus. */
 readonly wouldPublish: readonly string[];
};
/** A case as the patient may read it: no findings, no features, no suggestion. */
export type PatientCase = Omit<Case, 'findings' | 'features' | 'suggestion'>;

type Store = { readonly cases: readonly Case[] };
let store: Store = { cases: [] };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => store;
const set = (next: Store) => { store = next; for (const listener of listeners) listener(); };
export const useCases = () => useSyncExternalStore(subscribe, current, current);
export const casesNow = () => store.cases;
export const caseById = (caseRef: string) => store.cases.find(c => c.caseRef === caseRef);

export const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const listOf = (items: readonly string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(items);
const ZONE = 'Africa/Johannesburg';
export const timeOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });

/* ---- The contract, read ------------------------------------------------------------------------------ */

export const settingKinds = caseContract.settings.kinds;
export const settingOf = (code: string) => settingKinds.find(k => k.code === code);
export const settingLabel = (code: string) => settingOf(code)?.label ?? code;
export const stateLabel = (code: string) => caseContract.states.find(s => s.code === code)?.label ?? code;
export const sourceOf = (id: string) => devicesContract.sources.find(s => s.id === id);
export const sourceLabel = (id: string) => sourceOf(id)?.label ?? id;
export const markSentence = (id: string) => devicesContract.marks.find(m => m.id === id)?.sentence ?? '';
export const conditionTitle = (id: string) => pathwayConditions[id] ?? id;
export const protocolVersionId = caseContract.pathway.protocolVersionId;
/** The draft banner, with the register's own name and version. False for ratified would hide it; it is not ratified. */
export const draftBanner = (): string | null => isRatified(protocolVersionId) ? null
 : fill(caseContract.banner.draft, { protocol: `${protocolName(protocolVersionId)} (${protocolVersionId})` });
export const nurseName = () => subjectById(roleOf('nurse').subjectId ?? '')?.name ?? '';
export const doctorName = () => subjectById(roleOf('doctor').subjectId ?? '')?.name ?? '';
const NURSE = roleOf('nurse').subjectId ?? '';
const DOCTOR = roleOf('doctor').subjectId ?? '';

/* ---- Bands and weight -------------------------------------------------------------------------------- */

const range = (id: string) => {
 const found = observations.find(o => o.id === id);
 if (!found) throw new Error(`packages/catalog/records.json has no observation "${id}", which packages/catalog/case.json readings.measureIds names.`);
 return found;
};
/** Which band a pair sits in: the very-high line first (the knowledge base's), then records.json's indicative ranges. */
export function bandOf(systolic: number, diastolic: number): BandCode {
 const [top, bottom] = caseContract.readings.measureIds.map(range);
 if (systolic >= veryHighLine.systolic || diastolic >= veryHighLine.diastolic) return 'very-high';
 if (systolic > top.high || diastolic > bottom.high) return 'above';
 if (systolic < top.low || diastolic < bottom.low) return 'below';
 return 'in-range';
}
/** The unit both measures share, read from the record contract. */
export const unit = () => range(caseContract.readings.measureIds[0]).unit;

const marksFor = (source: SourceId, intendedUse: string): string[] => [
 ...(source === 'simulator' ? ['simulated'] : []),
 ...(source === 'own-device' ? ['consumer-device'] : []),
 ...(intendedUse === 'guidance' ? ['guidance-only'] : [])
];
let readingCount = 0;
/** A reading, with the class, sample and intended use devices.json gives its source, and the weight the Devices domain works out. */
export function readingFrom(input: { systolic: number; diastolic: number; said?: string; source: SourceId; byRole: RoleCode }, now = Date.now()): CaseReading {
 const classes = caseContract.readings.classBySource as Record<string, string>;
 const qualities = caseContract.readings.qualityBySource as Record<string, string>;
 const uses = caseContract.readings.intendedUseBySource as Record<string, string>;
 const deviceClass = classes[input.source]; const quality = qualities[input.source]; const intendedUse = uses[input.source];
 if (!deviceClass || !quality || !intendedUse) throw new Error(`packages/catalog/case.json readings gives no class, quality or use for the source "${input.source}".`);
 const marks = marksFor(input.source, intendedUse);
 return {
  readingRef: `RD-CASE-${++readingCount}`, systolic: input.systolic, diastolic: input.diastolic, said: input.said ?? `${input.systolic}/${input.diastolic}`,
  source: input.source, deviceClass, quality, intendedUse, simulated: sourceOf(input.source)?.simulated === true, marks,
  weight: clinicalUseOf({ deviceClass: deviceClass as 'certified' | 'consumer' | 'simulator', source: input.source, quality, intendedUse, marks: marks as never }),
  band: bandOf(input.systolic, input.diastolic), takenAt: now, byRole: input.byRole
 };
}
export const carriesWeight = (reading: CaseReading) => reading.weight === 'clinical';

/* ---- The suggestion ---------------------------------------------------------------------------------- */

type Rule = (typeof caseContract.pathway.rules.order)[number];
type When = { emergency?: boolean; band?: readonly string[]; anyFeatureKind?: string | readonly string[]; allFeatures?: readonly string[]; weightless?: boolean };
/* A rule may read one kind or several (the fever rule reads at-the-door and fever, as its reason says). */
const ofKind = (features: readonly IntakeFeature[], kind: string | readonly string[]) => {
 const kinds: readonly string[] = typeof kind === 'string' ? [kind] : kind;
 return features.filter(f => (f.kinds as readonly string[]).some(k => kinds.includes(k)));
};

/** The pathway's suggestion, worked out once from the features and the latest reading. First rule that matches; the contract's fallback otherwise. */
export function suggestFor(features: readonly IntakeFeature[], readings: readonly CaseReading[], emergency: boolean): Suggestion {
 const latest = readings[readings.length - 1];
 const band: BandCode = latest ? latest.band : 'none';
 const matches = (when: When): { ok: boolean; features: readonly IntakeFeature[] } => {
  if (when.emergency !== undefined && when.emergency !== emergency) return { ok: false, features: [] };
  if (when.band && !when.band.includes(band)) return { ok: false, features: [] };
  if (when.weightless && (!latest || carriesWeight(latest))) return { ok: false, features: [] };
  const named = when.anyFeatureKind ? ofKind(features, when.anyFeatureKind) : [];
  if (when.anyFeatureKind && !named.length) return { ok: false, features: [] };
  if (when.allFeatures && !when.allFeatures.every(id => features.some(f => f.id === id))) return { ok: false, features: [] };
  return { ok: true, features: named };
 };
 for (const rule of caseContract.pathway.rules.order as readonly Rule[]) {
  const m = matches(rule.when as When);
  if (!m.ok) continue;
  return {
   settingCode: rule.settingCode as SettingCode, ruleId: rule.id, band,
   reason: fill(rule.reason, { features: listOf(m.features.map(f => f.label)), source: latest ? sourceLabel(latest.source).toLowerCase() : '' })
  };
 }
 const fallback = caseContract.pathway.rules.fallback;
 return { settingCode: fallback.settingCode as SettingCode, ruleId: fallback.id, reason: fallback.reason, band };
}

/* ---- Acts ---------------------------------------------------------------------------------------------- */

type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: Refusal };
const refused = <T,>(id: string): Result<T> => ({ ok: false, refusal: refusal(id) });
/* The case's own refusals, for acts no route declares yet (case.json refusals): the repeat is a Devices
   capture against a case, and no case route takes a reading, so its sentence is the case contract's. */
const caseRefused = <T,>(id: string): Result<T> => {
 const found = caseContract.refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/case.json declares no refusal "${id}", so there is no sentence to refuse with.`);
 return { ok: false, refusal: { id: found.id, status: found.status, statement: found.statement } };
};
/** Whether the contract's transitions let a case move from where it is to where an act would put it. */
const mayMove = (from: string, to: string) => (caseContract.transitions.find(t => t.from === from)?.to as readonly string[] | undefined)?.includes(to) === true;
let caseCount = 0;
const update = (caseRef: string, next: (c: Case) => Case) => set({ cases: store.cases.map(c => c.caseRef === caseRef ? next(c) : c) });

/** The patient asked for a nurse to look at the notes. Opens in `opened` — whatever the pathway suggests, so a nurse
 *  can take it — or in `emergency` only when the intake itself ended on an emergency word (the route's emergencyEnded). */
export function openCase(state: IntakeState, subjectRef: string, readings: readonly CaseReading[], emergency = false, now = Date.now()): Result<Case> {
 if (!intakeGroupHasPathway(state.groupId)) return refused('group-has-no-pathway');
 if (!state.done || state.stopped) return refused('intake-not-complete');
 const features = featuresFor(state);
 const suggestion = suggestFor(features, readings, emergency);
 const opened: Case = {
  caseRef: `CASE-${String(++caseCount).padStart(4, '0')}`, subjectRef, groupId: state.groupId, stateCode: emergency ? 'emergency' : 'opened',
  answers: state.answers, features, findings: findingsFor(state), readings, suggestion, protocolVersionId,
  decisions: [{ roleCode: 'patient', actionCode: 'opened', at: now }], nurseRef: null, doctorRef: null, reviewRef: null, consultationRef: null, outcomeCode: null, plan: null,
  openedAt: now, wouldPublish: ['case.opened@1']
 };
 set({ cases: [...store.cases, opened] });
 return { ok: true, value: opened };
}

/** Whether the patient is answered with the emergency words when the case opens: the intake ended on one, or the
 *  pathway suggests the emergency setting. The answer is the emergency answer, never the suggestion itself. */
export const answeredWithEmergency = (c: Case) => c.stateCode === 'emergency' || c.suggestion.settingCode === 'emergency';

/** A nurse takes the case: it is hers to decide from here. */
export function takeCase(caseRef: string, now = Date.now()): Result<Case> {
 const c = caseById(caseRef);
 if (!c) return refused('no-such-case');
 if (c.stateCode !== 'opened') return refused('case-not-with-a-nurse');
 update(caseRef, k => ({ ...k, stateCode: 'with-nurse', nurseRef: NURSE, decisions: [...k.decisions, { roleCode: 'nurse', actionCode: 'took', at: now }] }));
 return { ok: true, value: caseById(caseRef)! };
}

/** The nurse decides where the patient is seen. Anything but the suggestion needs her reason; the refusals are the route's. */
export function decideSetting(caseRef: string, settingCode: string, reason = '', now = Date.now()): Result<Case> {
 const c = caseById(caseRef);
 if (!c) return refused('no-such-case');
 if (c.stateCode !== 'with-nurse') return refused('case-not-with-a-nurse');
 if (!settingOf(settingCode)) return refused('setting-not-declared');
 const overrode = settingCode !== c.suggestion.settingCode;
 if (overrode && !reason.trim()) return refused('override-without-reason');
 update(caseRef, k => ({
  ...k, stateCode: settingCode as CaseStateCode,
  decisions: [...k.decisions, { roleCode: 'nurse', actionCode: overrode ? 'overrode' : 'confirmed', settingCode: settingCode as SettingCode, ...(overrode ? { reason: reason.trim() } : {}), at: now }],
  wouldPublish: [...k.wouldPublish, 'case.setting_decided@1']
 }));
 return { ok: true, value: caseById(caseRef)! };
}

/** Whether a nurse may repeat the reading: she has taken the case, and it is with her — undecided, or decided and not
 *  yet handed to a doctor. Before she takes it nobody has read it; once a doctor has it the file is the doctor's. */
export const repeatable = (c: Case) => c.nurseRef !== null && (c.stateCode === 'with-nurse' || settingOf(c.stateCode) !== undefined);

/** The nurse repeats the reading on an instrument she names. Its weight is the Devices domain's answer, never hers. */
export function repeatReading(caseRef: string, input: { systolic: number; diastolic: number; source: SourceId }, now = Date.now()): Result<CaseReading> {
 const c = caseById(caseRef);
 if (!c) return refused('no-such-case');
 if (!repeatable(c)) return caseRefused('reading-not-with-a-nurse');
 if (!(caseContract.readings.sources.nurse as readonly string[]).includes(input.source)) return refused('reading-not-asked');
 const reading = readingFrom({ ...input, byRole: 'nurse' }, now);
 update(caseRef, k => ({ ...k, readings: [...k.readings, reading], decisions: [...k.decisions, { roleCode: 'nurse', actionCode: 'repeated-reading', at: now }] }));
 return { ok: true, value: reading };
}

export const decided = (c: Case) => c.decisions.some(d => d.actionCode === 'confirmed' || d.actionCode === 'overrode');
export const encounterRefOf = (caseRef: string) => `encounter-${caseRef.toLowerCase()}`;

/** The nurse asks a doctor: a review opens in the clinical inbox by reference, named under the draft pathway. */
export function askDoctor(caseRef: string, now = Date.now()): Result<Case> {
 const c = caseById(caseRef);
 if (!c) return refused('no-such-case');
 if (!decided(c) || !mayMove(c.stateCode, 'with-doctor')) return refused('case-not-with-a-nurse');
 const reviewRef = openCaseReview({ caseRef, encounterRef: encounterRefOf(caseRef), subjectRef: c.subjectRef, protocolVersionId }, now);
 update(caseRef, k => ({ ...k, stateCode: 'with-doctor', reviewRef, decisions: [...k.decisions, { roleCode: 'nurse', actionCode: 'handed-over', at: now }], wouldPublish: [...k.wouldPublish, 'case.handed_over@1'] }));
 return { ok: true, value: caseById(caseRef)! };
}

/** Whether a doctor may close the case: it was handed to the inbox and is not closed. Once, so one signature
 *  publishes one case.closed@1 however often the button is pressed. */
export const closable = (c: Case) => c.stateCode === 'with-doctor';
/** The case contract's sentence for a refusal the screens show before an act is attempted. */
export const caseRefusalStatement = (id: string): string => {
 const r = caseRefused<never>(id);
 return r.ok ? '' : r.refusal.statement;
};

/** The doctor signed the consultation and recorded the outcome: the case closes, and the plan is what the patient reads. */
export function closeCase(caseRef: string, input: { consultationRef: string; outcomeCode: string; plan: string }, now = Date.now()): Result<Case> {
 const c = caseById(caseRef);
 if (!c) return refused('no-such-case');
 if (!closable(c)) return caseRefused('case-not-with-a-doctor');
 update(caseRef, k => ({
  ...k, stateCode: 'closed', doctorRef: DOCTOR, consultationRef: input.consultationRef, outcomeCode: input.outcomeCode, plan: input.plan,
  decisions: [...k.decisions, { roleCode: 'doctor', actionCode: 'closed', at: now }], wouldPublish: [...k.wouldPublish, 'case.closed@1']
 }));
 return { ok: true, value: caseById(caseRef)! };
}

/* ---- What the patient reads --------------------------------------------------------------------------- */

/** The case without its findings, its features or its suggestion — the only shape the assistant is handed. */
export function patientView(caseRef: string): PatientCase | null {
 const c = caseById(caseRef);
 if (!c) return null;
 const { findings: _findings, features: _features, suggestion: _suggestion, ...rest } = c;
 return rest;
}
/** The sentence saying who has the case, in the contract's words, with the clinicians' names from the register. */
export const whoHas = (c: PatientCase): string => {
 const sentences = caseContract.screens.patient.who as Record<string, string>;
 return fill(sentences[c.stateCode] ?? '', { nurse: nurseName(), doctor: doctorName() });
};
/** The session's latest case, for the assistant's "what did the doctor say". */
export const latestCaseFor = (subjectRef: string): PatientCase | null => {
 const found = [...store.cases].reverse().find(c => c.subjectRef === subjectRef);
 return found ? patientView(found.caseRef) : null;
};
