/* Movement's contracts, read from where they live and typed nowhere else.
 *
 * The priorities, states, directory, packet rules and words are packages/catalog/movement.json's; every refusal
 * sentence is packages/catalog/apis/movement.json's, so the sentence a route answers with and the sentence a
 * screen shows are one string; the zones and the precision a position is rounded to are
 * packages/catalog/geography.json's. The engine runtime, the web preview and the build read all of it through
 * this file.
 *
 * WHAT IS NOT READ. Nothing from packages/catalog/records.json, passport-gateway.json or anything else that
 * describes what a record holds. Movement keeps references and states, and a module that imports the record's
 * contract is one step from holding what it describes. The two contracts the packet's bound comes from —
 * consent.json and passport-sharing.json — are handed to packet.ts by its caller, because on the web they
 * would otherwise be pulled into the patient's first load.
 *
 * Zero dependencies and apps/api's type-stripping rules: no enums, no namespaces, no constructor parameter
 * properties.
 */
import movement from '../../../../catalog/movement.json' with { type: 'json' };
import api from '../../../../catalog/apis/movement.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };

export const movementContract = movement;
export const SECOND = 1_000;
export const MINUTE = 60_000;
export const DAY = 86_400_000;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: Refusal };

type Declared = { id: string; status: number; statement: string };
/* Every refusal the engine or a live route declares, once by id. A refusal two routes share — the admission
   nobody has, the facility that is not connected — is declared on each in the same words, and the build holds
   each route to its own line in apis.refusals.lock. Two sentences for one id is a contract that says two things. */
const declared = new Map<string, Refusal>();
for (const r of [...(api.refusals as Declared[]), ...(api.routes as { withdrawn?: unknown; refusals: Declared[] }[]).filter(r => !r.withdrawn).flatMap(r => r.refusals)]) {
 const seen = declared.get(r.id);
 if (seen && seen.statement !== r.statement) throw new Error(`packages/catalog/apis/movement.json declares "${r.id}" in two different sentences. One refusal is one sentence.`);
 declared.set(r.id, { id: r.id, status: r.status, statement: r.statement });
}
export function refusal(id: string): Refusal {
 const found = declared.get(id);
 if (!found) throw new Error(`packages/catalog/apis/movement.json declares no refusal "${id}".`);
 return found;
}
export const refuse = <T>(id: string): Result<T> => ({ ok: false, refusal: refusal(id) });
export const accept = <T>(value: T): Result<T> => ({ ok: true, value });

export type Choice = { readonly id: string; readonly label: string };
export type PrioritySpec = Choice & {
 readonly takenByThusoRide: boolean; readonly routedTo: string | null; readonly setBy: readonly string[] | null; readonly needsReason: boolean; readonly sentence: string;
};
export type AdmissionStateSpec = Choice & { readonly pending: boolean; readonly destinationConfirmed: boolean; readonly sentence: string };
export type Facility = { readonly ref: string; readonly name: string; readonly zoneId: string; readonly bedCategories: readonly string[]; readonly hours: string };

export const priorities = movement.priorities as PrioritySpec[];
export const priorityOf = (id: unknown): PrioritySpec | undefined => priorities.find(p => p.id === id);
/* The priorities Thuso Ride takes. A P1 is not among them, and nothing below can make it one. */
export const takenPriorities = priorities.filter(p => p.takenByThusoRide).map(p => p.id);
export const p2Reasons = movement.p2Reasons as Choice[];
export const tripStates = movement.trips.states as Choice[];
export const receivingRoles = movement.trips.receivingRoles as Choice[];
export const checklist = movement.trips.checklist as string[];
export const admissionStates = movement.admissions.states as AdmissionStateSpec[];
export const bedCategories = movement.admissions.bedCategories as Choice[];
export const decisions = movement.admissions.decisions as Choice[];
export const declineReasons = movement.admissions.declineReasons as Choice[];
export const informationAsked = movement.admissions.informationAsked as Choice[];
export const receivingPoints = movement.admissions.receivingPoints as Choice[];
export const pendingNeverSays = movement.admissions.pendingNeverSays as string[];
export const facilities = movement.facilities.entries as Facility[];

export const facilityOf = (ref: unknown): Facility | undefined => facilities.find(f => f.ref === ref);
export const isDeclared = (list: readonly Choice[], id: unknown): id is string => list.some(c => c.id === id);
export const labelIn = (list: readonly Choice[], id: string | null): string => list.find(c => c.id === id)?.label ?? (id ?? '');

/* Where Thuso Ride picks up, and how finely a position is kept: geography.json's zones and its precision. */
export const zones = (geography.zones as { id: string; name: string }[]).map(z => ({ id: z.id, label: z.name }));
export const isZone = (id: unknown): id is string => zones.some(z => z.id === id);
export const positionDecimals: number = geography.precision.decimals;
const scale = 10 ** positionDecimals;
/** A coordinate as Movement keeps it: rounded to geography.json's precision, which is a suburb and never a door. */
export const roundCoordinate = (value: number): number => Math.round(value * scale) / scale;

export const instantOf = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) : Number.NaN);
export const isoDayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);
