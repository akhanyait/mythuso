/* What the field-safety arithmetic reads, and the one way it says no.
 *
 * Every number here comes from a contract: a visit's expected minutes from the service's own row in
 * packages/catalog/services.json, the position precision from packages/catalog/geography.json, and the
 * emergency numbers a panic sentence names from packages/catalog/sos.json. Nothing in this directory
 * types a minute or a phone number.
 *
 * THE TIMINGS ARE NOT EXPORTED FROM HERE. The grace, the extension steps and ceiling and the panic window
 * are settings an admin changes (settings.ts), so a timer or a panic is handed the settings in force when
 * it starts and keeps them. A constant exported here would be a default that code could reach for instead,
 * and the first place a running timer quietly started reading a number nobody set for it.
 *
 * A refusal is looked up by id, never written here. Some of them already belong to a route in
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
import sos from '../../../../catalog/sos.json' with { type: 'json' };

export const MINUTE = 60_000;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type Refused = { readonly ok: false; readonly refusal: Refusal };
export type EmittedEvent =
 | { readonly type: 'checkin.overdue'; readonly version: 1; readonly payload: { readonly checkinRef: string; readonly appointmentRef: string; readonly overdueSince: string } }
 | { readonly type: 'panic.raised'; readonly version: 1; readonly payload: { readonly panicRef: string; readonly raisedByRole: string; readonly locationShareEndsAt: string } }
 | { readonly type: 'panic.resolved'; readonly version: 1; readonly payload: { readonly panicRef: string; readonly outcomeCode: string; readonly sharingEndedAt: string } };
export type Done<T> = { readonly ok: true; readonly value: T; readonly emits: readonly EmittedEvent[] };
export type Result<T> = Done<T> | Refused;

export const fieldSafety = contract;
export const positionDecimals: number = geography.precision.decimals;
export const extensionReasons = contract.extensionReasons;
export const silenceReasons = contract.silenceReasons;
export const outcomes = contract.outcomes;
export const deskCarries: readonly string[] = contract.desk.carries;

/* The two numbers the panic confirmation tells a nurse to dial herself. Thrown for rather than
   defaulted: a sentence that says "call  for the police" is worse than a screen that fails to build. */
const numberOf = (id: string) => {
 const found = sos.emergency.numbers.find(entry => entry.id === id);
 if (!found) throw new Error(`packages/catalog/sos.json has no emergency number "${id}", so the panic confirmation cannot say who to call.`);
 return found.number;
};
export const emergencyNumbers: Readonly<Record<string, string>> = { police: numberOf('police'), ambulance: numberOf('ambulance') };

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

/** What pressing panic does not do, with the real numbers from sos.json in it. */
export const whatPanicDoesNotDo = () => fill(contract.panic.whatDoesNotHappen, emergencyNumbers);

/* A route named with its version is that version and no other. Extend and close are declared at two versions,
   and the withdrawn one keeps the sentences it was frozen with, so a name without a version would find whichever
   was declared first. A name without one is allowed only for a path answered at one version. */
type NamedRoute = { readonly method: string; readonly path: string; readonly version: number; readonly callers: readonly string[]; readonly refusals: readonly { readonly id: string; readonly status: number; readonly statement: string }[] };
export const routeNamed = (name: string): NamedRoute | undefined => (api.routes as readonly NamedRoute[]).find(entry =>
 name.includes('@') ? `${entry.method} ${entry.path}@${entry.version}` === name : `${entry.method} ${entry.path}` === name);

export function refusal(id: string, values?: Readonly<Record<string, string>>): Refusal {
 const own = contract.refusals.find(entry => entry.id === id);
 if (own) return { id, status: own.status, statement: fill(own.statement, values) };
 const named = contract.routeRefusals.find(entry => entry.id === id);
 const onRoute = named && routeNamed(named.route)?.refusals.find(entry => entry.id === id);
 if (onRoute) return { id, status: onRoute.status, statement: fill(onRoute.statement, values) };
 const engineWide = contract.engineRefusals.includes(id) ? api.refusals.find(entry => entry.id === id) : undefined;
 if (engineWide) return { id, status: engineWide.status, statement: fill(engineWide.statement, values) };
 throw new Error(`No refusal "${id}" in packages/catalog/field-safety.json, on the route it names or among the engine's refusals in packages/catalog/apis/safety.json`);
}

/* Who the desk is: the callers of the desk's own panic routes, read from the contract. A person the runtime
   admits to pick a panic up and a person the domain lets pick one up are then one list, and a role the register
   gains for the desk reaches both in one change. */
export const deskRoles: readonly string[] = [...new Set(['POST /v1/safety/panics/{panicRef}/pick-up@1', 'POST /v1/safety/panics/{panicRef}/resolve@1'].flatMap(name => {
 const route = routeNamed(name);
 if (!route?.callers.length) throw new Error(`packages/catalog/apis/safety.json has lost ${name} or its callers, so nobody could be the desk.`);
 return route.callers;
}))];
export const refuse = (id: string, values?: Readonly<Record<string, string>>): Refused => ({ ok: false, refusal: refusal(id, values) });
export const done = <T>(value: T, emits: readonly EmittedEvent[] = []): Done<T> => ({ ok: true, value, emits });
