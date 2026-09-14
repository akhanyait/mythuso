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
export type MethodId = 'card' | 'eft' | 'debit-order' | 'cash-otp' | 'wallet';
export type PayableKind = 'visit' | 'plan';
export type Method = { id: MethodId; name: string; detail: string; for: PayableKind[]; offered: boolean; settledBy?: string; notOfferedBecause?: string };
export type PaymentStateId = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type DoorOutcome = 'authorised' | 'declined' | 'reversed' | 'settled';
export type DoctorFee = {
 feeCode: string; name: string; amount: number | null; decidedBy: string | null; decidedOn: string | null;
 rangeFrom: { file: string; path: string }; source: string; undecided: string; whoDecides: string;
};

export const money = moneyContract;
export const catalogue = services as Service[];
export const earningsContract = earnings;
export const currency = moneyContract.currency;
export const methods = moneyContract.methods as Method[];
export const doctorFees = moneyContract.doctorFees as DoctorFee[];

export function serviceById(id: string): Service {
 const found = catalogue.find(s => s.id === id);
 /* Loud: a payable for a service nobody sells has an amount that came from somewhere else. */
 if (!found) throw new Error(`No service "${id}" in packages/catalog/services.json.`);
 return found;
}

export function methodById(id: string): Method | undefined {
 return methods.find(m => m.id === id);
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

/** The cited range for a fee, read from the file the contract names — never typed beside it. */
export function rangeOf(fee: DoctorFee): [number, number] {
 const root: Record<string, unknown> = fee.rangeFrom.file === 'packages/catalog/business-model.json' ? businessModel as Record<string, unknown> : {};
 const value = fee.rangeFrom.path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], root);
 if (!Array.isArray(value) || value.length !== 2 || !value.every(n => typeof n === 'number')) {
  throw new Error(`The fee "${fee.feeCode}" cites ${fee.rangeFrom.file}#${fee.rangeFrom.path}, which is not a range of two numbers.`);
 }
 return [value[0] as number, value[1] as number];
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
export const hearing = events.moneyHears;
export const heardTypes = new Set(hearing.events.map(e => e.type));
const neverReferences = new Set<string>(hearing.neverReferences);

/** A live event Money subscribes to at this version, or undefined. */
export function heardEvent(type: string, version: number): RawEvent | undefined {
 if (!heardTypes.has(type)) return undefined;
 return declared.find(e => e.type === type && e.version === version && !e.withdrawn && e.subscribers.includes('money'));
}

/** Whether a field name is a reference into the record, which Money never holds. */
export const isRecordReference = (field: string) =>
 neverReferences.has(field) || field.endsWith(hearing.neverReferencesSuffix);

/** The events Money publishes, each checked live and owned by Money when this module loads. */
export const PUBLISHES = ['payment.succeeded@1', 'payment.failed@1', 'payout.scheduled@1', 'payout.paid@1'] as const;
export type Published = typeof PUBLISHES[number];
for (const key of PUBLISHES) {
 const [type, version] = key.split('@');
 const found = declared.find(e => e.type === type && e.version === Number(version));
 if (!found || found.withdrawn || found.owner !== 'money') throw new Error(`Money publishes ${key}, which packages/catalog/events.json does not declare live and owned by Money.`);
}

/* ---- The two doors -------------------------------------------------------------------------- */

type RawFeed = { id: string; accepts: { field: string; required: boolean }[]; neverAccepts: { field: string; refusal: string; also: string[] }[]; beforeSwitchOn: { met: boolean }[] };
export const doorOf = (id: 'payment-result' | 'payout-advice'): RawFeed => {
 const found = (feeds.feeds as RawFeed[]).find(f => f.id === id);
 if (!found) throw new Error(`packages/catalog/feeds.json has no door "${id}".`);
 return found;
};

/** A door opens only when every one of its switch-on conditions is met with evidence. None is. */
export const doorIsLocked = (id: 'payment-result' | 'payout-advice') => doorOf(id).beforeSwitchOn.some(c => !c.met);

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
