/**
 * What Money reads, and from where. Nothing in this directory types a price, a share, a fee, a
 * refusal sentence or an event name that one of these files already holds.
 *
 * ── Why every sentence is looked up by id and thrown on ──────────────────────────────────────
 *
 * A refusal that quietly renders as undefined is a no with no reason, which is the thing this
 * engine exists not to produce. So `refusal()` throws when the contract has lost an id, and the
 * build finds out before a patient does.
 *
 * ── Why this imports JSON and not apps/api ───────────────────────────────────────────────────
 *
 * The simulated provider in apps/api answers the same doors, and its logic is reused here by
 * contract rather than by import: the same feed in packages/catalog/feeds.json, the same seed, the
 * same decline sentences out of packages/catalog/money.json. An engine that imported the identity
 * service would be deployed with it, and scripts/check-boundaries.mjs proves the two simulators
 * agree instead.
 */
import services from '../../../../catalog/services.json' with { type: 'json' };
import earnings from '../../../../catalog/earnings.json' with { type: 'json' };
import businessModel from '../../../../catalog/business-model.json' with { type: 'json' };
import momPlans from '../../../../catalog/mom-plans.json' with { type: 'json' };
import moneyContract from '../../../../catalog/money.json' with { type: 'json' };
import moneyApi from '../../../../catalog/apis/money.json' with { type: 'json' };
import apiContract from '../../../../catalog/apis.json' with { type: 'json' };
import events from '../../../../catalog/events.json' with { type: 'json' };
import feeds from '../../../../catalog/feeds.json' with { type: 'json' };

export type Service = { id: string; name: string; price: number; nurseShare: number; phase: number };
import { methodById, methods, type Method, type MethodId, type PayableKind, type PaymentStateId } from './methods.ts';
export { methodById, methods, type Method, type MethodId, type PayableKind, type PaymentStateId };
export type DoorOutcome = 'authorised' | 'declined' | 'reversed' | 'settled';
/* A fee names the two settings that hold its amount and whether it is confirmed, and never a number:
   the amount, its range and the confirmation are Money's settings, read through ./settings.ts. */
export type DoctorFee = {
 feeCode: string; name: string; amountSetting: string; confirmedSetting: string;
 source: string; unconfirmed: string; confirmed: string; whoSets: string;
};

export const money = moneyContract;
export const catalogue = services as Service[];
export const earningsContract = earnings;
export const currency = moneyContract.currency;
export const doctorFees = moneyContract.doctorFees as DoctorFee[];

export function serviceById(id: string): Service {
 const found = catalogue.find(s => s.id === id);
 /* Loud: a payable for a service nobody sells has an amount that came from somewhere else. */
 if (!found) throw new Error(`No service "${id}" in packages/catalog/services.json.`);
 return found;
}

export function stateOf(id: PaymentStateId) {
 const found = moneyContract.states.find(s => s.id === id);
 if (!found) throw new Error(`No payment state "${id}" in packages/catalog/money.json.`);
 return found;
}

export function outcomeOf(outcome: string) {
 return moneyContract.outcomes.find(o => o.outcome === outcome);
}

/* A plan's monthly price, from wherever the plan is priced. MyThuso for Mom's three tiers live in
   mom-plans.json and nowhere else; the other subscriptions carry their own price in business-model.json,
   and one whose price is null cannot be paid for at all. */
export function planPriceRand(planId: string, tierId?: string): number | null {
 if (planId === momPlans.id) {
  const tier = momPlans.tiers.find(t => t.id === tierId);
  return tier ? tier.price : null;
 }
 const plan = businessModel.subscriptions.find(s => s.id === planId);
 return plan && typeof plan.price === 'number' ? plan.price : null;
}

export function feeByCode(code: string): DoctorFee | undefined {
 return doctorFees.find(f => f.feeCode === code);
}

export const platformShare = businessModel.unitEconomics.platformShare;

/* ---- Refusals ------------------------------------------------------------------------------- */

export type Refusal = { refused: true; id: string; status: number; statement: string };

type RawRefusal = { id: string; status: number; statement: string };
const engineRefusals = moneyApi.refusals as RawRefusal[];
const routeRefusals = (moneyApi.routes as { refusals: RawRefusal[] }[]).flatMap(r => r.refusals);
const sharedRefusals = apiContract.sharedRefusals as RawRefusal[];

/** A refusal in the contract's own words: the engine's, then any route's, then the shared ones. */
export function refusal(id: string): Refusal {
 const found = engineRefusals.find(r => r.id === id) ?? routeRefusals.find(r => r.id === id) ?? sharedRefusals.find(r => r.id === id);
 if (!found) throw new Error(`No refusal "${id}" in packages/catalog/apis/money.json or the shared refusals in packages/catalog/apis.json.`);
 return { refused: true, id: found.id, status: found.status, statement: found.statement };
}

export const isRefusal = (value: unknown): value is Refusal =>
 typeof value === 'object' && value !== null && (value as { refused?: unknown }).refused === true;

/* ---- What Money hears, and what it may publish ---------------------------------------------- */

type RawEvent = { type: string; version: number; owner: string; subscribers: string[]; withdrawn?: unknown; payload: { field: string }[] };
const declared = events.events as RawEvent[];
export type Hearing = { engine: string; events: { type: string; why: string }[]; mayReference: { field: string; why: string }[] };

/**
 * Money's hearing list, read loudly. It used to be a list of references Money may never hold, and when
 * that list was replaced by an allow-list the old names read as undefined: the set was empty, a suffix
 * test compared against the word "undefined", and every record reference passed while every test still
 * did. So a missing or empty list now stops the module from loading rather than meaning "nothing is
 * refused".
 */
export function hearingFrom(raw: unknown): Hearing {
 const h = raw as Partial<Hearing> | undefined;
 const listed = (value: unknown, key: 'type' | 'field') =>
  Array.isArray(value) && value.length > 0 && value.every(entry => typeof entry?.[key] === 'string' && entry[key] && typeof entry?.why === 'string' && entry.why.trim());
 if (!h || h.engine !== 'money' || !listed(h.events, 'type') || !listed(h.mayReference, 'field')) {
  throw new Error('packages/catalog/events.json#moneyHears no longer gives Money a list of events, each with why, and a mayReference allow-list, each with why. Without both, nothing Money hears could be held to anything.');
 }
 return h as Hearing;
}

export const hearing = hearingFrom(events.moneyHears);
export const heardTypes = new Set(hearing.events.map(e => e.type));
const mayReference = new Set(hearing.mayReference.map(r => r.field));

/** A live event Money subscribes to at this version, or undefined. */
export function heardEvent(type: string, version: number): RawEvent | undefined {
 if (!heardTypes.has(type)) return undefined;
 return declared.find(e => e.type === type && e.version === version && !e.withdrawn && e.subscribers.includes('money'));
}

/* A field shaped like a reference — ending Ref, Refs, Id or Ids — points at something another engine
   stores or a contract names. Money may hold the ones on its allow-list, each with the reason it needs
   it, and no other: an encounter, a reading entry or an assessment is refused by being absent, so a new
   kind of record reference is refused on the day it is invented rather than the day somebody lists it. */
const REFERENCE_SHAPE = /(Ref|Refs|Id|Ids)$/;
export const isRecordReference = (field: string) => REFERENCE_SHAPE.test(field) && !mayReference.has(field);

/** The events Money publishes, each checked live and owned by Money when this module loads. */
export const PUBLISHES = ['payment.succeeded@1', 'payment.failed@1', 'payment.refunded@1', 'payout.scheduled@1', 'payout.paid@1'] as const;
export type Published = typeof PUBLISHES[number];
for (const key of PUBLISHES) {
 const [type, version] = key.split('@');
 const found = declared.find(e => e.type === type && e.version === Number(version));
 if (!found || found.withdrawn || found.owner !== 'money') throw new Error(`Money publishes ${key}, which packages/catalog/events.json does not declare live and owned by Money.`);
}

/* ---- The two doors -------------------------------------------------------------------------- */

type RawFeed = { id: string; accepts: { field: string; required: boolean }[]; neverAccepts: { field: string; refusal: string; also: string[] }[]; beforeSwitchOn: { met: boolean }[] };
/* The claim-response door is the switching partner's: a claim is sent only when it is open, and it is not. */
export type MoneyDoor = 'payment-result' | 'payout-advice' | 'claim-response';
export const doorOf = (id: MoneyDoor): RawFeed => {
 const found = (feeds.feeds as RawFeed[]).find(f => f.id === id);
 if (!found) throw new Error(`packages/catalog/feeds.json has no door "${id}".`);
 return found;
};

/** A door opens only when every one of its switch-on conditions is met with evidence. None is. */
export const doorIsLocked = (id: MoneyDoor) => doorOf(id).beforeSwitchOn.some(c => !c.met);

const canonical = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The first field a door refuses that this payload carries, with the door's own sentence. */
export function refusedFieldIn(id: 'payment-result' | 'payout-advice', payload: Record<string, unknown>): { field: string; sentence: string } | null {
 const keys = Object.keys(payload).map(canonical);
 for (const never of doorOf(id).neverAccepts) {
  const spellings = [never.field, ...never.also].map(canonical);
  const hit = keys.find(k => spellings.includes(k));
  if (hit) return { field: never.field, sentence: never.refusal };
 }
 return null;
}

/* Every spelling of a card number or a security code, from the payment-result door's refusals. */
export const cardSpellings = new Set(
 doorOf('payment-result').neverAccepts.filter(n => n.field === 'cardNumber' || n.field === 'cvv').flatMap(n => [n.field, ...n.also]).map(canonical)
);
export { canonical };
