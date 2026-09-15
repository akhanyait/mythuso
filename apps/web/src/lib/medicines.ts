import { useSyncExternalStore } from 'react';
import apis from '../../../../packages/catalog/apis.json' with { type: 'json' };
import clinicalApi from '../../../../packages/catalog/apis/clinical.json' with { type: 'json' };
import care from '../../../../packages/catalog/care.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };
import {
 contract, formulary, labModes, pinDigits, collectorRoles, refusal, scheduleOf, searchFormulary, type FormularyEntry, type Refusal, type Result
} from '../../../../packages/engines/src/medicines/domain/contract.ts';
import { clearedOn, mayAct, type Standing, type StandingReader } from '../../../../packages/engines/src/medicines/domain/standing.ts';
import { dispense, prescribe, queueFor, runCheck, stateOf, verify, type Check, type Prescription } from '../../../../packages/engines/src/medicines/domain/prescriptions.ts';
import { attemptsLeft, authorise, collect, handOver, voidedBy, type Attempt, type Authorisation, type Collection } from '../../../../packages/engines/src/medicines/domain/collections.ts';
import { acknowledged, close, labStateOf, placeOrder, receiveResult, syntheticResultDue, type LabOrder } from '../../../../packages/engines/src/medicines/domain/labs.ts';
import { randomDigits, randomSalt, sha256Hex } from '../../../../packages/engines/src/money/domain/secrets.ts';
import { roleOf } from './roles';
import { can, roleById } from './vetting';
import { subjectById, subjectsByRole } from './vetting-fixtures';
import { collectionTermsNow, resultRungNow } from './settings';

/* Medicines & Labs in the web preview: one store for the tab, and every rule the engine's.
 *
 * This file holds checks, prescriptions, authorisations, collections, the attempts at the door and lab orders,
 * in memory and nowhere else, and hands every act to packages/engines/src/medicines/domain — the same functions
 * the Medicines engine binds to its routes. A reload forgets all of it, which is right for a preview that may
 * not persist anything about a patient.
 *
 * WHO ACTS. Each workspace acts as the party lib/roles.ts opens it as: the doctor prescribes and orders, the
 * pharmacy partner's responsible pharmacist verifies and dispenses under the pharmacy's grant (medicines.json
 * actsFor), the nurse collects and hands over, and the patient authorises. Standing is what Trust would say about
 * them, read from the vetting register's fixtures: a party the register lets act today is verified, and one whose
 * checks have lapsed is not, so the same arithmetic that refuses a lapsed doctor on the engine refuses her here.
 *
 * WHAT IS NEVER HERE. A medicine's name, a dose or a result's value: the preview has none to hold, as the engine
 * has none. The PIN is kept as a salted digest, and the one copy of it the patient is shown lives in the answer to
 * that authorisation and is dropped when the dialog is closed. The collection settings are read once, when the
 * patient authorises, and kept on the authorisation; a result's rung is read once, when the result arrives.
 *
 * THE SYNTHETIC LABORATORY answers on the page's own clock, after the contract's turnaround, with a reference to a
 * result that does not exist. Clinical's rule is applied to the acknowledgement: only the clinician who ordered
 * the test acknowledges, once, and anybody else — or a reference nobody received — is told the result is another
 * clinician's, in the route's own sentence.
 */

export const DOCTOR = roleOf('doctor').subjectId ?? '';
export const PHARMACY = roleOf('partner').subjectId ?? '';
/* A pharmacist is not a party of her own on the register; she acts as the pharmacy's responsible pharmacist, and
   her reference is never the prescriber's. */
export const PHARMACIST = `${PHARMACY}-responsible-pharmacist`;
export const NURSE = roleOf('nurse').subjectId ?? '';
/* The patient the preview's care visit is about, as Care's contract names her: a reference, never a name, as the
   engine holds one. */
export const PATIENT: string = care.preview.subjectRef;
const COLLECTOR_REFS: Readonly<Record<string, string>> = { nurse: NURSE, courier: subjectsByRole('courier')[0]?.id ?? 'courier-synthetic', responder: 'responder-synthetic' };

const callerName = (id: string) => roleById(id)?.name ?? apis.callers.find(caller => caller.id === id)?.name ?? id;
export const collectorChoices = collectorRoles.map(id => ({ id, name: callerName(id) }));
export const words = contract.screen;
/** The sentence a prescriber or a pharmacist ticks to say they read why a check was not run. */
export const acknowledgement = contract.interactionChecks.acknowledgement;
export { formulary, pinDigits, labModes };
export const stateLabel = (code: string) => contract.prescriptions.states.find(s => s.code === code)?.label ?? code;
export const custodyLabel = (code: string) => contract.custody.states.find(s => s.code === code)?.label ?? code;
export const labStateLabel = (code: string) => contract.labs.states.find(s => s.code === code)?.label ?? code;
export const outcomeLabel = (code: string) => contract.interactionChecks.outcomes.find(o => o.code === code)?.label ?? code;
export const outcomeReason = (code: string) => contract.interactionChecks.outcomes.find(o => o.code === code)?.reason ?? '';
export const scheduleName = (code: string) => scheduleOf(code)?.name ?? code;
export const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const clockOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: scheduling.timezone });

/* ---- Standing, as the register's fixtures say Trust would ------------------------------------------ */

const CAPABILITY_OF_ROLE: Readonly<Record<string, string>> = { doctor: 'prescribe', pharmacy: 'dispense' };
const standing: StandingReader = {
 of: (subjectRef, role) => {
  const subject = subjectById(subjectRef);
  const capability = CAPABILITY_OF_ROLE[role];
  if (!subject || subject.roleId !== role || !capability) return undefined;
  /* Verified until a day that is never the question here: the register's own arithmetic has already said whether
     the party may act today, and a lapsed one is heard as stopped. */
  const allowed = can(subject, capability).allowed;
  return { subjectRef, role, verifiedUntil: allowed ? '9999-12-31' : null, stopped: !allowed, ended: false, heardAt: new Date(0).toISOString() } satisfies Standing;
 },
 all: subjectRef => {
  const subject = subjectById(subjectRef);
  const held = subject ? standing.of(subjectRef, subject.roleId) : undefined;
  return held ? [held] : [];
 }
};
const today = () => new Date().toISOString().slice(0, 10);
export const doctorCleared = () => clearedOn(standing.of(DOCTOR, 'doctor'), today());

/* ---- The store ---------------------------------------------------------------------------------------- */

type ResultRecord = { readonly resultRef: string; readonly labOrderRef: string; readonly responsibleRef: string; readonly acknowledgedAt: number | null };
export type MedicinesState = {
 readonly checks: readonly Check[];
 readonly prescriptions: readonly Prescription[];
 readonly authorisations: readonly Authorisation[];
 readonly collections: readonly Collection[];
 readonly attempts: Readonly<Record<string, readonly Attempt[]>>;
 readonly orders: readonly LabOrder[];
 readonly results: readonly ResultRecord[];
 readonly now: number;
};
let state: MedicinesState = { checks: [], prescriptions: [], authorisations: [], collections: [], attempts: {}, orders: [], results: [], now: Date.now() };
let serial = 100;
const reference = (prefix: string) => `${prefix}-${String(++serial).padStart(4, '0')}`;
const listeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;

/* The synthetic laboratory's clock: every order whose turnaround has passed receives its reference, on the rung in
   force at that moment, and the clinician who ordered it becomes the one who may acknowledge it. */
function advance(s: MedicinesState, now: number): MedicinesState {
 let next = { ...s, now };
 for (const order of s.orders) {
  if (!syntheticResultDue(order, now)) continue;
  const { rung, settingsVersion } = resultRungNow();
  const received = receiveResult(order, { resultEntryRef: `synthetic-result-${randomSalt(4)}`, rung, settingsVersion }, now);
  if (!received.ok) continue;
  next = {
   ...next,
   orders: next.orders.map(o => o.labOrderRef === order.labOrderRef ? received.value : o),
   results: [...next.results, { resultRef: received.value.resultEntryRef!, labOrderRef: order.labOrderRef, responsibleRef: order.orderedByRef, acknowledgedAt: null }]
  };
 }
 return next;
}
function commit(next: MedicinesState) {
 state = next;
 for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
 listeners.add(listener);
 if (!clock) clock = setInterval(() => { const next = advance(state, Date.now()); if (next.orders !== state.orders || next.results !== state.results) commit(next); }, 1000);
 queueMicrotask(() => commit(advance(state, Date.now())));
 return () => {
  listeners.delete(listener);
  if (!listeners.size && clock) { clearInterval(clock); clock = undefined; }
 };
}
const snapshot = () => state;
export const useMedicines = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/* One shape for every act: bring the laboratory up to now, ask the domain, keep what it answered or hand its
   refusal back for the screen to render word for word. */
type Acted<T> = { readonly value: T; readonly refusal: null } | { readonly value: null; readonly refusal: Refusal };
function act<T>(run: (s: MedicinesState, now: number) => Result<T>, keep: (s: MedicinesState, value: T) => MedicinesState): Acted<T> {
 const now = Date.now();
 const s = advance(state, now);
 const result = run(s, now);
 commit(result.ok ? keep(s, result.value) : s);
 return result.ok ? { value: result.value, refusal: null } : { value: null, refusal: result.refusal };
}
const refused = (id: string) => ({ ok: false as const, refusal: refusal(id) });
const replace = <T,>(list: readonly T[], match: (item: T) => boolean, item: T) => list.map(existing => match(existing) ? item : existing);

/* ---- The doctor ---------------------------------------------------------------------------------------- */

export const search = (query: string): Result<{ readonly listStatus: string; readonly notice: string; readonly entries: readonly FormularyEntry[] }> => searchFormulary(query);

export const runPrescribeCheck = () => act((_, now) => runCheck({ checkRef: reference('CHK'), subjectRef: PATIENT, stageCode: 'prescribe', byRef: DOCTOR }, now), (s, check) => ({ ...s, checks: [...s.checks, check] }));

export function writePrescription(input: { scheduleCode: string; checkRef: string; notCheckedRead: boolean }) {
 return act((s, now) => prescribe({
  prescriptionRef: reference('RX'), subjectRef: PATIENT, medicationRequestRef: reference('MR'), checkRef: input.checkRef,
  scheduleCode: input.scheduleCode, pharmacyRef: PHARMACY, notCheckedRead: input.notCheckedRead
 }, {
  ref: DOCTOR, cleared: mayAct('prescribe', { role: 'doctor', ref: DOCTOR }, PHARMACY, standing, today()),
  pharmacyCleared: mayAct('dispense', { role: 'pharmacy', ref: PHARMACY }, PHARMACY, standing, today()),
  check: s.checks.find(c => c.checkRef === input.checkRef)
 }, now), (s, { prescription, check }) => ({ ...s, prescriptions: [...s.prescriptions, prescription], checks: replace(s.checks, c => c.checkRef === check.checkRef, check) }));
}

export const orderTest = (collectionMode: string) => act((_, now) => placeOrder({ labOrderRef: reference('LAB'), subjectRef: PATIENT, serviceRequestRef: reference('SR'), collectionMode, orderedByRef: DOCTOR }, now),
 (s, order) => ({ ...s, orders: [...s.orders, order] }));

export function acknowledgeResult(resultRef: string, byRef: string = DOCTOR) {
 const route = clinicalApi.routes.find(r => r.path === '/v1/clinical/results/{resultRef}/acknowledge' && r.version === 1)!;
 const sentence = (id: string): Refusal => { const r = route.refusals.find(x => x.id === id)!; return { id: r.id, status: r.status, statement: r.statement }; };
 const now = Date.now();
 const s = advance(state, now);
 const result = s.results.find(r => r.resultRef === resultRef);
 /* Clinical's rule, as its engine applies it: not yours and not received read the same, so no reference can be walked. */
 if (!result || result.responsibleRef !== byRef) { commit(s); return sentence('result-not-yours'); }
 if (result.acknowledgedAt !== null) { commit(s); return sentence('already-acknowledged'); }
 const order = s.orders.find(o => o.labOrderRef === result.labOrderRef)!;
 commit({ ...s, results: replace(s.results, r => r.resultRef === resultRef, { ...result, acknowledgedAt: now }), orders: replace(s.orders, o => o.labOrderRef === order.labOrderRef, acknowledged(order, byRef, now)) });
 return null;
}

export const closeOrder = (labOrderRef: string) => act((s, now) => { const order = s.orders.find(o => o.labOrderRef === labOrderRef); return order ? close(order, now) : refused('no-such-lab-order'); },
 (s, order) => ({ ...s, orders: replace(s.orders, o => o.labOrderRef === order.labOrderRef, order) }));

export { labStateOf };

/* ---- The pharmacy -------------------------------------------------------------------------------------- */

export const queue = (s: MedicinesState) => queueFor(s.prescriptions, PHARMACY);

export const verifyPrescription = (prescriptionRef: string, asRef: string = PHARMACIST) => act((s, now) => {
 const p = s.prescriptions.find(x => x.prescriptionRef === prescriptionRef);
 return p ? verify(p, { ref: asRef, cleared: mayAct('verify', { role: 'pharmacist', ref: asRef }, p.pharmacyRef, standing, today()) }, now) : refused('no-such-prescription');
}, (s, p) => ({ ...s, prescriptions: replace(s.prescriptions, x => x.prescriptionRef === p.prescriptionRef, p) }));

export const runDispenseCheck = () => act((_, now) => runCheck({ checkRef: reference('CHK'), subjectRef: PATIENT, stageCode: 'dispense', byRef: PHARMACIST }, now), (s, check) => ({ ...s, checks: [...s.checks, check] }));

export const dispensePrescription = (prescriptionRef: string, input: { checkRef: string; sealRef: string; notCheckedRead: boolean }) => act((s, now) => {
 const p = s.prescriptions.find(x => x.prescriptionRef === prescriptionRef);
 if (!p) return refused('no-such-prescription');
 return dispense(p, { dispenseEntryRef: reference('DSP'), checkRef: input.checkRef, sealRef: input.sealRef, notCheckedRead: input.notCheckedRead }, {
  ref: PHARMACIST, cleared: mayAct('dispense', { role: 'pharmacist', ref: PHARMACIST }, p.pharmacyRef, standing, today()),
  pharmacyCleared: mayAct('dispense', { role: 'pharmacy', ref: p.pharmacyRef }, p.pharmacyRef, standing, today()),
  check: s.checks.find(c => c.checkRef === input.checkRef)
 }, now);
}, (s, { prescription, check }) => ({ ...s, prescriptions: replace(s.prescriptions, x => x.prescriptionRef === prescription.prescriptionRef, prescription), checks: replace(s.checks, c => c.checkRef === check.checkRef, check) }));

export const newSealRef = () => `SEAL-${randomSalt(3).toUpperCase()}`;

/* ---- The patient --------------------------------------------------------------------------------------- */

export const patientPrescriptions = (s: MedicinesState) => s.prescriptions.filter(p => p.subjectRef === PATIENT && p.deliveredAt === null);

/** The one answer that carries the PIN. The screen shows it once; the store keeps only its digest. */
export function authoriseCollector(prescriptionRef: string, collectorRole: string) {
 const pin = randomDigits(pinDigits);
 const salt = randomSalt();
 const answer = act((s, now) => {
  const p = s.prescriptions.find(x => x.prescriptionRef === prescriptionRef);
  if (!p) return refused('no-such-prescription');
  const previous = [...s.authorisations].reverse().find(a => a.prescriptionRef === prescriptionRef);
  const previousCollection = previous && s.collections.find(c => c.authorisationRef === previous.authorisationRef);
  return authorise(p, { authorisationRef: reference('AUTH'), collectorRef: COLLECTOR_REFS[collectorRole] ?? '', collectorRole, pinSalt: salt, pinDigest: sha256Hex(`${salt}:${pin}`) },
   { ref: PATIENT }, { authorisation: previous, voided: !!(previous && previousCollection && voidedBy(s.attempts[previousCollection.collectionRef] ?? [], previous)) }, collectionTermsNow(), now);
 }, (s, authorisation) => ({ ...s, authorisations: [...s.authorisations, authorisation] }));
 return answer.refusal ? { refusal: answer.refusal, shown: null } : { refusal: null, shown: { pin, authorisation: answer.value } };
}

/* ---- The collector ------------------------------------------------------------------------------------- */

export type Round = { readonly authorisation: Authorisation; readonly prescription: Prescription; readonly collection: Collection | undefined; readonly attempts: readonly Attempt[]; readonly state: string; readonly left: number };
export const roundFor = (s: MedicinesState, collectorRef: string = NURSE): Round[] => s.authorisations
 .filter(a => a.collectorRef === collectorRef)
 .map(authorisation => {
  const prescription = s.prescriptions.find(p => p.prescriptionRef === authorisation.prescriptionRef)!;
  const collection = s.collections.find(c => c.authorisationRef === authorisation.authorisationRef);
  const attempts = collection ? s.attempts[collection.collectionRef] ?? [] : [];
  const state = collection?.handedOverAt ? 'handed-over' : collection && voidedBy(attempts, authorisation) ? 'voided' : collection ? 'collected' : 'authorised';
  return { authorisation, prescription, collection, attempts, state, left: attemptsLeft(attempts, authorisation) };
 });

export const collectBag = (authorisationRef: string, sealRef: string) => act((s, now) => {
 const authorisation = s.authorisations.find(a => a.authorisationRef === authorisationRef);
 const p = authorisation && s.prescriptions.find(x => x.prescriptionRef === authorisation.prescriptionRef);
 if (!p) return refused('no-such-prescription');
 return collect(p, authorisation, s.collections.find(c => c.authorisationRef === authorisationRef), { collectionRef: reference('COL'), sealRef }, { ref: NURSE, role: 'nurse' }, now);
}, (s, { collection, prescription }) => ({ ...s, collections: [...s.collections, collection], prescriptions: replace(s.prescriptions, p => p.prescriptionRef === prescription.prescriptionRef, prescription) }));

/* A wrong PIN and a broken seal are refused and still counted, as the engine keeps them on refusal. */
export function handOverBag(collectionRef: string, pin: string, sealIntact: boolean): Refusal | null {
 const now = Date.now();
 const s = advance(state, now);
 const c = s.collections.find(x => x.collectionRef === collectionRef);
 if (!c) { commit(s); return refusal('no-such-collection'); }
 const authorisation = s.authorisations.find(a => a.authorisationRef === c.authorisationRef)!;
 const p = s.prescriptions.find(x => x.prescriptionRef === c.prescriptionRef)!;
 const attempts = s.attempts[collectionRef] ?? [];
 const handed = handOver(c, p, authorisation, attempts, { pinMatches: sha256Hex(`${authorisation.pinSalt}:${pin}`) === authorisation.pinDigest, sealIntact }, { ref: NURSE }, now);
 const kept = handed.keep ? { ...s.attempts, [collectionRef]: [...attempts, handed.keep] } : s.attempts;
 if (!handed.result.ok) { commit({ ...s, attempts: kept }); return handed.result.refusal; }
 const { collection, prescription } = handed.result.value;
 commit({ ...s, attempts: kept, collections: replace(s.collections, x => x.collectionRef === collectionRef, collection), prescriptions: replace(s.prescriptions, x => x.prescriptionRef === prescription.prescriptionRef, prescription) });
 return null;
}

export { stateOf };
