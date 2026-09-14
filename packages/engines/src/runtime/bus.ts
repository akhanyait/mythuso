/**
 * The in-process bus: what may be published, what may be subscribed to, and who hears what.
 *
 * The event contract is enforced at build time by scripts/check-boundaries.mjs — every declared shape
 * is clean. That says nothing about what an engine actually sends at runtime, where a payload is a
 * JavaScript object anybody can add a key to. So every publish is held to the contract again, as sent:
 * the type is declared and live, the publisher is its owner, every key is a declared field of the frozen
 * shape and of its declared type, and a key the shape does not declare is refused by name — as a field
 * the bus refuses when its name is on a never-list, and as the wrong shape otherwise.
 *
 * Delivery is narrower than subscription. A subscriber must be declared on the event to register at
 * all; a grant event is then delivered only to the engine consent.json says serves its recipientRole;
 * and Money hears only the events moneyHears lists, which the build already guarantees and the bus
 * checks again because a guarantee nobody re-reads is how the first exception gets in.
 */
import { randomUUID } from 'node:crypto';
import { namedLike, type ContractEvent, type RuntimeContract } from './contract.ts';
import type { BusEvent, ClockReading, PublishOptions } from './types.ts';

type AnyRefusal = { id: string; status?: number; statement: string; why?: string };

/** A publish the contract refuses. The detail names fields, never their values. */
export class BusRefused extends Error {
 readonly refusal: string;
 readonly status: number;
 readonly statement: string;
 readonly fields: readonly string[];
 constructor(refusal: AnyRefusal, detail: string, fields: readonly string[] = []) {
  super(`${refusal.statement} ${detail}`);
  this.name = 'BusRefused';
  this.refusal = refusal.id;
  this.status = refusal.status ?? 422;
  this.statement = refusal.statement;
  this.fields = fields;
 }
}

/** A route or subscription the contract does not let this engine register. */
export class BindingRefused extends Error {
 readonly refusal: string;
 constructor(refusal: AnyRefusal, detail: string) {
  super(`${refusal.statement} ${detail}`);
  this.name = 'BindingRefused';
  this.refusal = refusal.id;
 }
}

export function refusalFrom(contract: RuntimeContract, id: string): AnyRefusal {
 const found = contract.busRefusals.find(r => r.id === id) ?? contract.settings.refusals.find(r => r.id === id);
 if (!found) throw new Error(`The runtime needs the refusal "${id}", and neither packages/catalog/apis/core.json, events.json nor apis.json#engineRuntime declares it.`);
 return found;
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function valueOfType(type: string, value: unknown, object = false): boolean {
 if (object) return type === 'list' ? Array.isArray(value) : typeof value === 'object' && value !== null && !Array.isArray(value);
 switch (type) {
  case 'integer': return Number.isInteger(value);
  case 'number': case 'coordinate': return typeof value === 'number' && Number.isFinite(value);
  case 'boolean': return typeof value === 'boolean';
  case 'list': return Array.isArray(value);
  case 'instant': return typeof value === 'string' && INSTANT.test(value) && Number.isFinite(Date.parse(value));
  case 'iso-date': return typeof value === 'string' && ISO_DATE.test(value) && Number.isFinite(Date.parse(value));
  default: return typeof value === 'string';
 }
}

/* The South African identity number is thirteen digits. An opaque subject token never is, so a subject
   that looks like one is refused as the field it is, whatever it was called. */
const LOOKS_LIKE_AN_ID_NUMBER = /^\d{13}$/;

export function validatePublish(contract: RuntimeContract, publisher: string, key: string, payload: Record<string, unknown>, options: Required<Pick<PublishOptions, 'subjectRef' | 'actorRole' | 'purposeOfUse'>> & PublishOptions, clock: ClockReading): BusEvent {
 const refusal = (id: string) => refusalFrom(contract, id);
 const event = contract.events.get(key);
 const sent = payload && typeof payload === 'object' ? Object.keys(payload) : [];
 if (!event) throw new BusRefused(refusal('undeclared-event'), `${key} is not declared in any source packages/catalog/events.json lists.`, sent);
 if (event.withdrawn) throw new BusRefused(refusal('withdrawn-version'), `${key} is withdrawn.`, sent);
 if (event.owner !== publisher) throw new BusRefused(refusal('not-the-owner'), `${key} is owned by ${event.owner}, and ${publisher} published it.`, sent);
 const declared = new Map(event.payload.map(f => [f.field, f]));
 for (const name of sent) {
  if (declared.has(name)) continue;
  const never = contract.neverOnBus.flatMap(b => b.names.filter(n => namedLike(name, n, b.match)))[0]
   ?? (event.neverCarries ?? []).find(n => namedLike(name, n.field))?.field;
  if (never) throw new BusRefused(refusal('refused-field'), `${key} was sent with "${name}", which the bus refuses as "${never}".`, sent);
  throw new BusRefused(refusal('not-the-frozen-shape'), `${key} does not declare "${name}".`, sent);
 }
 for (const f of event.payload) {
  const value = payload[f.field];
  if (value === undefined || value === null) {
   if (f.required) throw new BusRefused(refusal('not-the-frozen-shape'), `${key} needs "${f.field}".`, sent);
   continue;
  }
  if (!valueOfType(f.type, value)) throw new BusRefused(refusal('not-the-frozen-shape'), `${key} declares "${f.field}" as ${f.type}.`, sent);
 }
 if (typeof options.subjectRef !== 'string' || !options.subjectRef) throw new BusRefused(refusal('not-the-frozen-shape'), `${key} has no subjectRef on its envelope.`, sent);
 if (LOOKS_LIKE_AN_ID_NUMBER.test(options.subjectRef)) throw new BusRefused(refusal('refused-field'), `${key}'s subjectRef has the shape of an identity number, which the bus refuses as "idNumber".`, sent);
 if (typeof options.actorRole !== 'string' || !options.actorRole) throw new BusRefused(refusal('not-the-frozen-shape'), `${key} has no actorRole on its envelope.`, sent);
 if (!contract.purposes.has(options.purposeOfUse)) throw new BusRefused(refusal('not-the-frozen-shape'), `${key}'s purposeOfUse is not a purpose in the gate's Purpose union.`, sent);
 for (const optional of ['causationId', 'protocolVersion'] as const) {
  if (options[optional] !== undefined && typeof options[optional] !== 'string') throw new BusRefused(refusal('not-the-frozen-shape'), `${key}'s ${optional} is not a string.`, sent);
 }
 return {
  eventId: randomUUID(), type: event.type, version: event.version, occurredAt: clock.iso(), owner: event.owner,
  actorRole: options.actorRole, subjectRef: options.subjectRef, purposeOfUse: options.purposeOfUse,
  ...(options.causationId ? { causationId: options.causationId } : {}),
  ...(options.protocolVersion ? { protocolVersion: options.protocolVersion } : {}),
  payload: Object.freeze({ ...payload }),
 };
}

export function validateSubscription(contract: RuntimeContract, engine: string, key: string): ContractEvent {
 const refusal = (id: string) => refusalFrom(contract, id);
 const event = contract.events.get(key);
 if (!event) throw new BindingRefused(refusal('undeclared-event'), `${engine} subscribed to ${key}.`);
 if (event.withdrawn) throw new BindingRefused(refusal('no-subscription-to-a-withdrawn-version'), `${engine} subscribed to ${key}.`);
 if (event.owner === engine) throw new BindingRefused(refusal('no-subscribing-to-yourself'), `${engine} subscribed to its own ${key}.`);
 if (!event.subscribers.includes(engine)) throw new BindingRefused(refusal('subscription-not-declared'), `${key} does not list ${engine} among its subscribers.`);
 if (engine === contract.moneyEngine && !contract.moneyHears.has(event.type)) throw new BindingRefused(refusal('money-hears-billing-not-care'), `${key} is not among the events moneyHears lets Money hear.`);
 return event;
}

/** Who hears an event: registered, declared, routed by recipientRole where the event says so, and Money only on its list. */
export function recipientsOf(contract: RuntimeContract, event: BusEvent, registered: readonly string[]): { to: string[]; withheld: { engine: string; because: string }[] } {
 const declared = contract.events.get(`${event.type}@${event.version}`)!;
 const to: string[] = [];
 const withheld: { engine: string; because: string }[] = [];
 for (const engine of registered) {
  if (!declared.subscribers.includes(engine) || declared.withdrawn) { withheld.push({ engine, because: 'subscription-not-declared' }); continue; }
  if (declared.routing) {
   const serving = contract.servingEngine.get(String(event.payload[declared.routing.by]));
   if (serving !== engine) { withheld.push({ engine, because: 'a-grant-reaches-only-its-recipients-engine' }); continue; }
  }
  if (engine === contract.moneyEngine && !contract.moneyHears.has(event.type)) { withheld.push({ engine, because: 'money-hears-billing-not-care' }); continue; }
  to.push(engine);
 }
 return { to, withheld };
}
