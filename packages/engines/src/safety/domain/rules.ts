/* What the field-safety arithmetic reads, and the one way it says no.
 *
 * Every number here comes from a contract: the grace, the extension steps, the extension ceiling and
 * the panic window from packages/catalog/field-safety.json, a visit's expected minutes from the
 * service's own row in packages/catalog/services.json, and the position precision from
 * packages/catalog/geography.json. Nothing in this directory types a minute.
 *
 * A refusal is looked up by id, never written here. Five of them already belong to a route in
 * packages/catalog/apis/safety.json and are read from there, so the sentence an API would return and
 * the sentence a nurse reads are one string; the rest are the contract's own. An id that is in
 * neither throws, because a refusal with no sentence is a screen that says nothing at the moment it
 * matters most.
 *
 * Zero dependencies and apps/api's type-stripping rules: no enums, no namespaces, no constructor
 * parameter properties. Time is epoch milliseconds passed in by the caller, so a test is a clock.
 */
import contract from '../../../../catalog/field-safety.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import api from '../../../../catalog/apis/safety.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };

export const MINUTE = 60_000;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type Refused = { readonly ok: false; readonly refusal: Refusal };
export type EmittedEvent =
 | { readonly type: 'checkin.overdue'; readonly version: 1; readonly payload: { readonly checkinRef: string; readonly appointmentRef: string; readonly overdueSince: string } }
 | { readonly type: 'panic.raised'; readonly version: 1; readonly payload: { readonly panicRef: string; readonly raisedByRole: string; readonly locationShareEndsAt: string } };
export type Done<T> = { readonly ok: true; readonly value: T; readonly emits: readonly EmittedEvent[] };
export type Result<T> = Done<T> | Refused;

export const fieldSafety = contract;
export const graceMinutes: number = contract.timer.graceMinutes.value;
export const extensionSteps: readonly number[] = contract.timer.extensionMinutes.value;
export const maxExtensionMinutes: number = contract.timer.maxExtensionMinutes.value;
export const panicWindowMinutes: number = contract.panic.windowMinutes.value;
export const positionDecimals: number = geography.precision.decimals;
export const extensionReasons = contract.extensionReasons;
export const silenceReasons = contract.silenceReasons;
export const outcomes = contract.outcomes;
export const deskCarries: readonly string[] = contract.desk.carries;

/** The booked duration of a service, or undefined when the catalogue has no such service. */
export const serviceMinutes = (serviceId: string): number | undefined =>
 services.find(service => service.id === serviceId)?.duration;

/* South African time, whatever machine is reading it. A desk in Johannesburg reading "sharing ended
   at 07:42" from a server in another zone would be told the wrong minute at the wrong moment. */
export const clockOf = (at: number) =>
 new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
export const instant = (at: number) => new Date(at).toISOString();

/** A contract sentence with its {tokens} filled. A token with no value stays visible rather than vanishing. */
export const fill = (sentence: string, values: Readonly<Record<string, string>> = {}) =>
 sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export function refusal(id: string, values?: Readonly<Record<string, string>>): Refusal {
 const own = contract.refusals.find(entry => entry.id === id);
 if (own) return { id, status: own.status, statement: fill(own.statement, values) };
 const named = contract.routeRefusals.find(entry => entry.id === id);
 const route = named && api.routes.find(entry => `${entry.method} ${entry.path}` === named.route);
 const onRoute = route?.refusals.find(entry => entry.id === id);
 if (onRoute) return { id, status: onRoute.status, statement: fill(onRoute.statement, values) };
 throw new Error(`No refusal "${id}" in packages/catalog/field-safety.json or on the route it names in packages/catalog/apis/safety.json`);
}
export const refuse = (id: string, values?: Readonly<Record<string, string>>): Refused => ({ ok: false, refusal: refusal(id, values) });
export const done = <T>(value: T, emits: readonly EmittedEvent[] = []): Done<T> => ({ ok: true, value, emits });
