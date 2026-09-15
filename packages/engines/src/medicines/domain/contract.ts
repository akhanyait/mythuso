/* What Medicines & Labs reads, and the one way it says no.
 *
 * Every rule here is read from a contract: the schedules and which roles drive from
 * packages/catalog/dispensing.json, who may prescribe and dispense from packages/catalog/vetting.json, the
 * formulary, the check outcomes, the collector roles and the synthetic laboratory from
 * packages/catalog/medicines.json, and the laboratory's notice from packages/catalog/capabilities.json.
 * Nothing in this directory names a schedule, a role that may carry one or a minute a PIN lasts.
 *
 * A refusal is looked up by id, never written here. Its sentence is the one packages/catalog/apis/medicines.json
 * declares on a live route or for the engine, so the sentence the runtime answers with and the sentence the web
 * preview shows are one string. An id declared nowhere throws, because a refusal with no sentence is a screen
 * that says nothing at the moment it matters.
 *
 * The web preview runs this directory in the browser, so it holds no store, no clock and no node: time is epoch
 * milliseconds passed in, and a PIN's digest is worked out by whoever holds the PIN.
 */
import medicines from '../../../../catalog/medicines.json' with { type: 'json' };
import dispensing from '../../../../catalog/dispensing.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import capabilities from '../../../../catalog/capabilities.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import api from '../../../../catalog/apis/medicines.json' with { type: 'json' };

export const contract = medicines;
/** A unit, not a policy. */
export const MINUTE = 60_000;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type Emitted = { readonly key: `${string}@${number}`; readonly payload: Readonly<Record<string, unknown>> };
export type Done<T> = { readonly ok: true; readonly value: T; readonly emits: readonly Emitted[] };
export type Refused = { readonly ok: false; readonly refusal: Refusal };
export type Result<T> = Done<T> | Refused;

type Declared = { id: string; status: number; statement: string };
const declared = new Map<string, Refusal>();
for (const r of [
 ...(api.refusals as Declared[]),
 ...(api.routes as { refusals: Declared[]; withdrawn?: unknown }[]).filter(route => !route.withdrawn).flatMap(route => route.refusals)
]) if (!declared.has(r.id)) declared.set(r.id, { id: r.id, status: r.status, statement: r.statement });

export function refusal(id: string): Refusal {
 const found = declared.get(id);
 if (!found) throw new Error(`packages/catalog/apis/medicines.json declares no live refusal "${id}", so there is no sentence to refuse with.`);
 return found;
}
export const refused = (id: string): Refused => ({ ok: false, refusal: refusal(id) });
export const done = <T>(value: T, emits: readonly Emitted[] = []): Done<T> => ({ ok: true, value, emits });

/* ---- Schedules, and who drives ---------------------------------------------------------------------- */

type Schedule = { readonly id: string; readonly name: string; readonly driverMayCarry: boolean };
export const schedules: readonly Schedule[] = dispensing.schedules.items;
export const scheduleOf = (code: string): Schedule | undefined => schedules.find(s => s.id === code);
export const driverRoles: readonly string[] = dispensing.schedules.drivers.roles;
/** Whether somebody in this role may hold a bag of this schedule. A schedule the contract does not list is held by nobody. */
export const mayCarry = (role: string, scheduleCode: string): boolean => {
 const schedule = scheduleOf(scheduleCode);
 return !!schedule && (schedule.driverMayCarry || !driverRoles.includes(role));
};
export const collectorRoles: readonly string[] = medicines.custody.collectorRoles;
export const pinDigits: number = medicines.custody.pinDigits.value;

/* ---- Who may prescribe, verify and dispense ----------------------------------------------------------- */

type Act = 'prescribe' | 'verify' | 'dispense';
const capabilityFor: Readonly<Record<Act, string>> = medicines.prescriptions.capabilities;
type RoleRow = { readonly id: string; readonly grants?: readonly { readonly capability: string }[] };
/** The roles packages/catalog/vetting.json grants the capability an act asks for. */
export const rolesGrantedFor = (act: Act): string[] =>
 (vetting.roles as readonly RoleRow[]).filter(role => (role.grants ?? []).some(grant => grant.capability === capabilityFor[act])).map(role => role.id);
/** The role a caller acts under when the register vets them through a partner rather than as themselves, or null. */
export const actsUnder = (role: string): string | null => medicines.prescriptions.actsFor.find(row => row.role === role)?.underRole ?? null;

/* ---- The formulary and the check ----------------------------------------------------------------------- */

export const formulary = medicines.formulary;
export type FormularyEntry = { readonly entryCode: string; readonly label: string; readonly scheduleCode: string };
export function searchFormulary(query: string): Result<{ readonly listStatus: string; readonly notice: string; readonly entries: readonly FormularyEntry[] }> {
 const asked = query.trim().toLowerCase();
 if (!asked) return refused('blank-query');
 const entries = formulary.entries.filter(entry => entry.label.toLowerCase().includes(asked) || entry.entryCode.toLowerCase().includes(asked));
 return done({ listStatus: formulary.listStatus, notice: formulary.notice, entries });
}

export const stages: readonly string[] = medicines.interactionChecks.stages;
type Outcome = { readonly code: string; readonly label: string; readonly reason: string };
export const outcomes: readonly Outcome[] = medicines.interactionChecks.outcomes;
/* The outcome that says nothing was compared. While packages/catalog/medicines.json names no licensed source it is
   the only outcome a check can have, and scripts/check-boundaries.mjs fails the build if another is declared. */
const unrun = outcomes.find(outcome => outcome.code === 'not-checked');
if (!unrun) throw new Error('packages/catalog/medicines.json has lost the not-checked outcome, so a check with nothing to check against would have no honest answer.');
export const NOT_CHECKED: Outcome = unrun;
export const outcomeOf = (code: string): Outcome | undefined => outcomes.find(outcome => outcome.code === code);

/* ---- Laboratories ---------------------------------------------------------------------------------------- */

export const labModes = medicines.labs.collectionModes;
export const syntheticLab = medicines.labs.syntheticLab;
export const resultAlert = medicines.labs.resultAlert;
const labCapability = (capabilities.capabilities as readonly { id: string; notice: string }[]).find(c => c.id === 'laboratory-results');
if (!labCapability) throw new Error('packages/catalog/capabilities.json has no laboratory-results capability, so a synthetic result would be shown without saying so.');
/** The sentence every screen shows beside a synthetic order or result. */
export const labNotice: string = labCapability.notice;

/* ---- The day, where the register's dates are days ------------------------------------------------------ */

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: scheduling.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
/** The calendar day in the timezone packages/catalog/scheduling.json names, as yyyy-mm-dd, which a verifiedUntil is compared with. */
export const dayOf = (at: number): string => DAY.format(new Date(at));
