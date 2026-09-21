import { useSyncExternalStore } from 'react';
import contract from '../../../../packages/catalog/governance-status.json' with { type: 'json' };

/* The governance register in the web preview: what has been signed, appointed and decided, and who wrote it down.
 *
 * WHY THIS IS NOT A SETTING. packages/catalog/settings.json is the house pattern for an audited, admin-changed
 * value, and this file keeps its habits — a blank default with provenance, one append-only history replayed in
 * version order, a reason on every change, a stale version refused, and every refusal sentence rendered from the
 * contract. What it deliberately does not take is the rest of the settings machinery: bounds, units, guardrails,
 * clinical review, an engine, a route. Those exist because an operational number reaches a running engine and
 * decides how it treats somebody. A governance record reaches nothing. It is the office writing down what an
 * accountable person signed somewhere else, so the rules it needs are about evidence and attribution, not range.
 *
 * WHY IT REACHES NOTHING. docs/governance/README.md: "Signing a document here changes no code." The Health
 * Passport goes on refusing to start without its development flag, the build goes on failing if deploy/ names it,
 * and the identity service goes on refusing production without an Information Officer — each changed deliberately,
 * by a developer, in a commit that cites the signed document. If this module were ever read by the Passport, by
 * deploy/, by an engine or by either phone, a date typed in a preview would have become a production decision;
 * scripts/check-boundaries.mjs refuses any file outside this feature's own list to read the contract at all.
 *
 * HELD IN THIS TAB'S MEMORY AND NOWHERE ELSE, like every other preview store here: this app may not persist
 * anything, so a reload puts the blank state back, and the screen says so in the contract's sentence.
 *
 * WHO IS WRITING is handed in rather than read here. The screen knows which party the back office opened as;
 * the register only knows what a recorder must be for a row to be worth anything. Keeping the two apart is
 * also what lets scripts/check-boundaries.mjs load this module and run every rule through it, which is how
 * each refusal below is proved rather than asserted.
 */
export type FieldType = 'enum' | 'boolean' | 'text' | 'day';
export type Choice = { readonly value: string | boolean; readonly label: string; readonly means: string };
export type Field = {
 readonly key: string; readonly label: string; readonly type: FieldType; readonly help: string;
 readonly blank: string | boolean | null; readonly evidence: boolean; readonly allowed?: readonly Choice[];
};
export type GovernanceRecord = {
 readonly key: string; readonly label: string; readonly question: string; readonly document: string;
 readonly decidedBy: string; readonly blockedUntil: string; readonly refusedToday: string;
 readonly refusalLives: readonly string[]; readonly done: { readonly field: string; readonly is: string | boolean };
 readonly fields: readonly Field[];
};
export type FieldValue = string | boolean | null;
export type Values = Readonly<Record<string, FieldValue>>;
export type Refusal = { readonly id: string; readonly status: number; readonly statement: string; readonly why: string };
/** One accepted change: the whole record before and after, because a record's fields only make sense together. */
export type Entry = {
 readonly version: number; readonly record: string; readonly from: Values; readonly to: Values;
 readonly reason: string; readonly byRole: string; readonly byRef: string; readonly at: number;
};

/* One cast at the boundary. The contract's arrays mix an enum's string choices with a boolean's, which a JSON
   import widens into a shape no narrower than this and reads worse everywhere it is used. */
export const governanceContract = contract as unknown as {
 readonly version: number;
 readonly documents: string;
 readonly recording: { readonly role: string; readonly roleWhy: string; readonly clearedWhy: string; readonly attribution: string };
 readonly records: readonly GovernanceRecord[];
 readonly changesNothing: { readonly statement: string; readonly why: string; readonly readBy: readonly string[]; readonly neverReadBy: readonly { readonly tree: string; readonly why: string }[] };
 readonly rules: readonly { readonly id: string; readonly refusal: string | null; readonly statement: string }[];
 readonly refusals: readonly Refusal[];
 readonly screen: Readonly<Record<string, string>>;
};
export const governanceRecords = governanceContract.records;
export const governanceScreen = governanceContract.screen;

export function refusalOf(id: string): Refusal {
 const found = governanceContract.refusals.find(refusal => refusal.id === id);
 if (!found) throw new Error(`packages/catalog/governance-status.json declares no refusal "${id}". A refusal with no sentence is a screen that says nothing when somebody needs to know why.`);
 return found;
}
export function recordOf(key: string): GovernanceRecord {
 const found = governanceRecords.find(record => record.key === key);
 if (!found) throw new Error(`There is no governance record "${key}".`);
 return found;
}
/** The state every record starts in: every sign-off field blank, which is what the documents say today. */
export const blankOf = (record: GovernanceRecord): Values =>
 Object.freeze(Object.fromEntries(record.fields.map(field => [field.key, field.blank])));
export const isBlank = (field: Field, value: FieldValue) => value === field.blank;
export const isDone = (record: GovernanceRecord, values: Values) => values[record.done.field] === record.done.is;
export const labelOf = (field: Field, value: FieldValue): string =>
 field.allowed?.find(choice => choice.value === value)?.label ?? (value === null || value === '' ? governanceScreen.blank : String(value));

/* ---- The register, replayed --------------------------------------------------------------------- */

export type Register = {
 readonly version: number;
 readonly values: Readonly<Record<string, Values>>;
 /** The version that last wrote each record, 1 for the blank state it was born in. */
 readonly setAt: Readonly<Record<string, number>>;
};
export function registerOf(history: readonly Entry[]): Register {
 const values: Record<string, Values> = Object.fromEntries(governanceRecords.map(record => [record.key, blankOf(record)]));
 const setAt: Record<string, number> = Object.fromEntries(governanceRecords.map(record => [record.key, governanceContract.version]));
 for (const entry of history) { values[entry.record] = entry.to; setAt[entry.record] = entry.version; }
 return { version: governanceContract.version + history.length, values, setAt };
}

/* ---- Whether a change may be recorded ------------------------------------------------------------- */

export type ChangeRequest = {
 readonly record: string; readonly values: Values; readonly reason: string; readonly expectedVersion: number;
};
/** Who is writing the row down: their role on the vetting register, their reference, and whether the register
    lets them work today. The screen knows this; the register only knows what it must be. */
export type Recorder = { readonly roleId: string; readonly ref: string; readonly cleared: boolean };
export type Proposed = { readonly ok: true; readonly entry: Entry } | { readonly ok: false; readonly refusal: Refusal };
const refused = (id: string): Proposed => ({ ok: false, refusal: refusalOf(id) });
const same = (a: Values, b: Values, record: GovernanceRecord) => record.fields.every(field => a[field.key] === b[field.key]);

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const dayNow = (now: number) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

/* The order the questions are asked in, and it is the order somebody would ask them. Who you are, then whether the
   record exists, then whether the values are the kind this record holds, then whether the evidence and the decision
   agree, then whether anything changed, then the reason, then the version. A value nobody may write is refused for
   that before it is told its date is wrong, and a wrong date is said before "you did not write why", so a recorder
   is never asked to justify a change that was never going to be accepted. */
export function proposeChange(request: ChangeRequest, who: Recorder, history: readonly Entry[], now: number): Proposed {
 if (who.roleId !== governanceContract.recording.role || !who.ref) return refused('governance-record-not-permitted');
 if (!who.cleared) return refused('governance-recorder-not-cleared');
 const record = governanceRecords.find(entry => entry.key === request.record);
 if (!record) return refused('governance-record-not-known');
 const today = dayNow(now);
 for (const field of record.fields) {
  const value = request.values[field.key];
  if (field.allowed) { if (!field.allowed.some(choice => choice.value === value)) return refused('governance-value-not-allowed'); continue; }
  if (field.type === 'text') { if (typeof value !== 'string') return refused('governance-value-not-allowed'); continue; }
  if (value === null || value === '') continue;
  if (typeof value !== 'string' || !isDay(value)) return refused('governance-day-not-a-day');
  if (value > today) return refused('governance-dated-ahead');
 }
 const done = isDone(record, request.values);
 for (const field of record.fields.filter(field => field.evidence)) {
  const blank = isBlank(field, request.values[field.key]) || request.values[field.key] === null || request.values[field.key] === '';
  if (done && blank) return refused('governance-done-without-evidence');
  if (!done && !blank) return refused('governance-evidence-without-the-decision');
 }
 const register = registerOf(history);
 const from = register.values[record.key]!;
 if (same(from, request.values, record)) return refused('governance-unchanged');
 if (!request.reason.trim()) return refused('governance-change-without-reason');
 if (request.expectedVersion !== register.version) return refused('governance-version-stale');
 const to = Object.freeze(Object.fromEntries(record.fields.map(field => [field.key, request.values[field.key]!])));
 return { ok: true, entry: { version: register.version + 1, record: record.key, from, to, reason: request.reason.trim(), byRole: who.roleId, byRef: who.ref, at: now } };
}

/* ---- The preview's own history -------------------------------------------------------------------- */

let history: readonly Entry[] = Object.freeze([]);
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => history;
export const useGovernanceHistory = () => useSyncExternalStore(subscribe, current, current);

/* Reviewing a change asks the same question recording it does, so a refusal is shown before anybody is asked to
   confirm anything — and nothing is written down, because reviewing a change is not making it. */
export const previewChange = (request: ChangeRequest, who: Recorder, now = Date.now()): Proposed =>
 proposeChange(request, who, history, now);

export function applyChange(request: ChangeRequest, who: Recorder, now = Date.now()): Proposed {
 const result = proposeChange(request, who, history, now);
 if (!result.ok) return result;
 history = Object.freeze([...history, result.entry]);
 for (const listener of listeners) listener();
 return result;
}
