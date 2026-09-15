/* Money's settings, over the shared settings shape: what MyThuso for Mom is called and brings, the
 * doctor's per-case fee and whether it is confirmed, and how a nurse is told what her share is.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings. Money owns
 * these because a plan is what Money bills and a fee and a share are what Money pays; the reasoning is
 * packages/catalog/money.json's _settingsNote. Every rule a change obeys is
 * packages/engines/src/settings/shape.ts's. This file adds what only Money knows:
 *
 *   - Its own rules on wording, from money.json's wordingRules: a nurse's share is never worded as a
 *     fraction or a percentage, because services.json does not pay the same part of every visit, and a
 *     plan's name never sounds like medical aid. They are asked after the shared rules and refused in the
 *     sentences POST /v1/money/setting-changes@1 declares.
 *   - Which setting is the doctor's fee and which says it is confirmed, read into the fee in force that
 *     ./fees.ts pays by. A proposal in force pays nobody.
 *   - How the plan settings are read into mom-plans.json's words: the tier names, "Everything in
 *     Essential" when tiers stack, "One urgent nurse call-out a month" from a number and a period, the
 *     visit report's wording for the WhatsApp choice, and priority SOS's sentence. A screen never types
 *     one of them; it is handed a plan already read.
 *
 * WHATEVER STARTS KEEPS WHAT IT READ. A case keeps the fee in force when it was signed (./fees.ts). A
 * plan screen reads the plan once when it is drawn, and a change reaches the next one drawn; no plan can
 * be bought yet, so there is no subscription for a change to reach back into.
 */
import contract from '../../../../catalog/money.json' with { type: 'json' };
import momPlans from '../../../../catalog/mom-plans.json' with { type: 'json' };
import api from '../../../../catalog/apis/money.json' with { type: 'json' };
import { snapshotOf, type Check, type Refusal, type SettingValue, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';
import type { FeeInForce } from './fees.ts';

export const moneyBlock = { engine: 'money', ...contract.settings } as unknown as SettingsBlock;
type Values = Snapshot['values'];

/* ---- Money's own rules on wording ---------------------------------------------------------------- */

type WordingRule = { id: string; settings: string[]; pattern: string; flags: string; refusal: string };
const RULES = (contract.wordingRules as WordingRule[]).map(rule => ({ ...rule, breaks: new RegExp(rule.pattern, rule.flags) }));

/** The refusal Money's own wording rules answer a value with, or null. Asked only of the settings a rule names. */
export const wordingRefusalOf = (key: string, value: unknown): string | null =>
 RULES.find(rule => rule.settings.includes(key) && typeof value === 'string' && rule.breaks.test(value))?.refusal ?? null;

const check: Check = (next, setting) => wordingRefusalOf(setting.key, next[setting.key]);
const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/money/setting-changes' && route.version === 1);
if (!changeRoute) throw new Error('packages/catalog/apis/money.json has lost POST /v1/money/setting-changes@1, whose refusals Money\'s own wording rules answer with.');
for (const rule of RULES) if (!changeRoute.refusals.some(r => r.id === rule.refusal)) throw new Error(`packages/catalog/money.json's wording rule "${rule.id}" refuses with "${rule.refusal}", which POST /v1/money/setting-changes@1 does not declare.`);

export const moneySettings: SettingsEngine = Object.freeze({ block: moneyBlock, refusals: changeRoute.refusals as readonly Refusal[], check });

/** The settings nobody has changed: for a test, a native generator, or a ledger with no history yet. */
export const moneyDefaults: Snapshot = snapshotOf(moneyBlock, []);

const valueOf = (values: Values, key: string): SettingValue => {
 if (!(key in values)) throw new Error(`Money has no setting "${key}", which a contract reads.`);
 return values[key]!;
};

/* ---- The doctor's fee ---------------------------------------------------------------------------- */

const FEE = contract.doctorFees[0]!;
const feeSetting = moneyBlock.items.find(s => s.key === FEE.amountSetting);
if (!feeSetting?.bounds) throw new Error(`packages/catalog/money.json's fee "${FEE.feeCode}" names the setting "${FEE.amountSetting}", which is not a moneyCents setting with bounds.`);

/** What the range an admin may set the fee within is, in cents: the setting's bounds, which cite the documents. */
export const doctorFeeRangeCents = Object.freeze({ lowest: feeSetting.bounds.lowest.value, highest: feeSetting.bounds.highest.value });
export type DoctorFeeInForce = FeeInForce & { readonly lowestCents: number; readonly highestCents: number };

/** The doctor's fee in force, and whether an admin has confirmed it. Read once for each case heard and each payout asked for. */
export const doctorFeeOf = (snapshot: Snapshot): DoctorFeeInForce => Object.freeze({
 feeCode: FEE.feeCode,
 amountCents: valueOf(snapshot.values, FEE.amountSetting) as number,
 confirmed: valueOf(snapshot.values, FEE.confirmedSetting) === true,
 settingsVersion: snapshot.settingsVersion,
 lowestCents: doctorFeeRangeCents.lowest,
 highestCents: doctorFeeRangeCents.highest
});

/* ---- A nurse's share ----------------------------------------------------------------------------- */

/** The sentence a nurse reads about her share. The figure beside it is services.json's, never this. */
export const nurseShareSentenceOf = (snapshot: Snapshot): string => valueOf(snapshot.values, contract.nurseShareSetting) as string;

/* ---- MyThuso for Mom, read into its words -------------------------------------------------------- */

type RawInclusion = {
 id: string; capability: string; device?: string; text?: string; textFrom?: string; detailFrom?: string;
 textBy?: { setting: string; values: Readonly<Record<string, string>> };
};
export type PlanInclusion = { readonly id: string; readonly text: string; readonly capability: string; readonly device: string | null; readonly detail: string | null };
export type PlanTier = {
 readonly id: string; readonly name: string; readonly price: number; readonly phase: number; readonly cadence: string;
 /** "Everything in Essential", when tiers stack and there is a tier below; otherwise null. */
 readonly inherits: string | null;
 readonly includes: readonly PlanInclusion[];
};
export type PlanTerms = { readonly settingsVersion: number; readonly name: string; readonly tiers: readonly PlanTier[] };

const fill = (sentence: string, values: Readonly<Record<string, string>>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const CALL_OUTS = momPlans.callOuts as { setting: string; counts: string[]; one: string; many: string; per: Readonly<Record<string, string>> };

/** "One urgent nurse call-out a month", from a number and a period; null for nought, which lists no line. */
export function callOutsText(value: SettingValue): string | null {
 const { count, period } = value as { count: number; period: string };
 if (count === 0) return null;
 const number = CALL_OUTS.counts[count - 1];
 const per = CALL_OUTS.per[period];
 if (!number || !per) throw new Error(`packages/catalog/mom-plans.json has no words for ${count} call-outs a ${period}.`);
 return `${number} ${count === 1 ? CALL_OUTS.one : CALL_OUTS.many} ${per}`;
}

function textOf(item: RawInclusion, values: Values): string | null {
 if (item.text !== undefined) return item.text;
 if (item.textFrom === CALL_OUTS.setting) return callOutsText(valueOf(values, item.textFrom));
 if (item.textBy) {
  const chosen = String(valueOf(values, item.textBy.setting));
  const words = item.textBy.values[chosen];
  if (!words) throw new Error(`packages/catalog/mom-plans.json has no words for "${item.id}" when ${item.textBy.setting} is "${chosen}".`);
  return words;
 }
 throw new Error(`packages/catalog/mom-plans.json gives "${item.id}" no text and no setting to read it from.`);
}

const TIERS = momPlans.tiers as unknown as readonly { id: string; nameFrom: string; price: number; phase: number; cadence: string; includes: RawInclusion[] }[];

/** The plan as a family reads it under these values. A native generator hands it the defaults; a screen, the values in force. */
export function planTermsFrom(values: Values, settingsVersion: number): PlanTerms {
 const stacks = valueOf(values, momPlans.stacking.setting) === true;
 const names = TIERS.map(tier => valueOf(values, tier.nameFrom) as string);
 return Object.freeze({
  settingsVersion,
  name: valueOf(values, momPlans.nameFrom) as string,
  tiers: TIERS.map((tier, i) => Object.freeze({
   id: tier.id, name: names[i]!, price: tier.price, phase: tier.phase, cadence: tier.cadence,
   inherits: stacks && i > 0 ? fill(momPlans.stacking.inherits, { tier: names[i - 1]! }) : null,
   includes: tier.includes.flatMap(item => {
    const text = textOf(item, values);
    return text === null ? [] : [Object.freeze({ id: item.id, text, capability: item.capability, device: item.device ?? null, detail: item.detailFrom ? valueOf(values, item.detailFrom) as string : null })];
   })
  }))
 });
}

export const planTermsOf = (snapshot: Snapshot): PlanTerms => planTermsFrom(snapshot.values, snapshot.settingsVersion);

/** Every setting mom-plans.json reads, so a native generator asks for exactly these defaults. */
export const planSettingKeys = (): string[] => [...new Set([
 momPlans.nameFrom, momPlans.stacking.setting, CALL_OUTS.setting,
 ...TIERS.flatMap(tier => [tier.nameFrom, ...tier.includes.flatMap(item => [item.textFrom, item.textBy?.setting, item.detailFrom])])
].filter((key): key is string => typeof key === 'string'))];
