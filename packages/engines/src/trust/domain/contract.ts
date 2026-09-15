/* What Verify in service reads, and the one way it says no.
 *
 * Every sentence a screen shows is packages/catalog/verify-in-service.json's, and every refusal is a route's
 * or the engine's in packages/catalog/apis/trust.json, looked up by id so the sentence a route answers with and
 * the sentence a patient reads are one string. An id that is in neither throws: a refusal with no sentence is a
 * door check that says nothing to somebody deciding whether to open a door.
 *
 * THE FOUR EVENTS VERIFY PUBLISHES FROM HERE, AND NO OTHER. The union below is closed on purpose. It has no
 * person.trust_updated, no person.suspended and no person.under_review: nothing a shift, a door or a complaint
 * does moves a Trust Score or a standing, and a publisher that cannot name those events cannot send one by
 * accident. trust.shift_start.matched@1 is absent too, because no provider exists to match a face.
 *
 * Zero dependencies and apps/api's type-stripping rules: no enums, no namespaces, no constructor parameter
 * properties. Time is epoch milliseconds passed in by the caller, so a test is a clock.
 */
import contract from '../../../../catalog/verify-in-service.json' with { type: 'json' };
import trust from '../../../../catalog/trust.json' with { type: 'json' };
import api from '../../../../catalog/apis/trust.json' with { type: 'json' };
import sos from '../../../../catalog/sos.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type EmittedEvent =
 | { readonly type: 'trust.shift_start.unmatched'; readonly version: 1; readonly payload: { readonly shiftStartRef: string; readonly matchOutcome: string; readonly dispatchRule: string; readonly online: boolean } }
 | { readonly type: 'trust.door.verified'; readonly version: 1; readonly payload: { readonly partyRef: string; readonly appointmentRef: string } }
 | { readonly type: 'trust.door.mismatched'; readonly version: 1; readonly payload: { readonly appointmentRef: string; readonly reasonCode: string } }
 | { readonly type: 'trust.complaint.received'; readonly version: 1; readonly payload: { readonly complaintRef: string; readonly reviewBy: string } };
export type Done<T> = { readonly ok: true; readonly value: T; readonly emits: readonly EmittedEvent[] };
export type Refused = { readonly ok: false; readonly refusal: Refusal };
export type Result<T> = Done<T> | Refused;

export const verifyInService = contract;

type Declared = { id: string; status: number; statement: string };
const declared: readonly Declared[] = [
 ...api.routes.filter(route => !('withdrawn' in route)).flatMap(route => route.refusals as Declared[]),
 ...(api.refusals as Declared[])
];
export function refusal(id: string): Refusal {
 const found = declared.find(entry => entry.id === id);
 if (!found) throw new Error(`packages/catalog/apis/trust.json declares no refusal "${id}", so Verify has no sentence to refuse with.`);
 return { id: found.id, status: found.status, statement: found.statement };
}
export const refused = (id: string): Refused => ({ ok: false, refusal: refusal(id) });
export const done = <T>(value: T, emits: readonly EmittedEvent[] = []): Done<T> => ({ ok: true, value, emits });

export const instant = (at: number): string => new Date(at).toISOString().replace('Z', '+00:00');
export const fill = (sentence: string, values: Readonly<Record<string, string | number>>): string =>
 sentence.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

/* The police number a patient in danger at her door is told to call, filled from packages/catalog/sos.json rather
   than typed beside the sentence that names it. */
const police = sos.emergency.numbers.find(entry => entry.id === 'police');
if (!police) throw new Error('packages/catalog/sos.json has no police number, so the door check cannot tell a patient in danger who to call.');
export const policeNumber: string = police.number;

/* A tier by its id, as packages/catalog/trust.json names it. The badge on a route is the id; a screen shows the name. */
export const tierName = (id: string): string => {
 const tier = trust.tiers.find(entry => entry.id === id);
 if (!tier) throw new Error(`packages/catalog/trust.json has no tier "${id}".`);
 return tier.name;
};

/* The day an instant falls on, in the timezone the scheduling contract names, so "today's shift starts" is the
   office's day and never the server's. */
export const dayOf = (at: number): string =>
 new Intl.DateTimeFormat('en-CA', { timeZone: scheduling.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));

export const categoryIds: ReadonlySet<string> = new Set(contract.complaints.categories.map(category => category.id));
export const outcomeIds: ReadonlySet<string> = new Set(contract.complaints.outcomes.map(outcome => outcome.id));
export const answerIds: ReadonlySet<string> = new Set(contract.door.answers.map(answer => answer.id));
export const complaintMaxCharacters: number = contract.complaints.maxCharacters;
export const doorDigits: number = contract.door.digits;
export const labelOf = (list: readonly { id: string; label: string }[], id: string): string => list.find(entry => entry.id === id)?.label ?? id;
