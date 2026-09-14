import contract from '../../../../packages/catalog/mom-plans.json' with { type: 'json' };
import { businessModel } from './catalog';
/* MyThuso for Mom, and the arithmetic every screen that mentions a plan price goes through.
 *
 * Three monthly prices replaced the single R249 Thuso Mom on 14 September 2026, and they live in
 * packages/catalog/mom-plans.json. The business model's `mom` row deliberately has no price of its
 * own: it names that file instead. So anything that used to read `subscription.price` — the care-plans
 * screen, the public page's "from" figure, the console's recurring revenue — asks here, and a plan
 * with tiers answers with the tiers rather than with a number somebody would otherwise have to
 * choose between R399 and R1 299 and type.
 *
 * Nothing in this module decides whether anything is real. Each inclusion names a capability and the
 * screen asks packages/catalog/capabilities.json, which is the only place that knows. */

export const momPlan = contract;
export type Tier = typeof contract.tiers[number];
export type Inclusion = Tier['includes'][number];
export const tiers = contract.tiers;
export const momPrices = tiers.map(t => t.price);

export const tier = (id: string): Tier => {
 const found = tiers.find(t => t.id === id);
 if (!found) throw new Error(`No tier "${id}" in packages/catalog/mom-plans.json`);
 return found;
};

export const refusal = (id: string): string => {
 const found = contract.refusals.find(r => r.id === id);
 /* Thrown rather than rendered as nothing: a refusal that quietly vanishes is a sentence of
    accountability that has left the page, and nobody notices an absence. */
 if (!found) throw new Error(`No refusal "${id}" in packages/catalog/mom-plans.json`);
 return found.sentence;
};

/* Neighbouring inclusions that depend on the same capability are one group, and the group carries
   that capability's notice once. Plus names two visits and a screening that all wait on booking; three
   copies of the roster's sentence stacked down one column is the three-notices-on-one-screen defect
   the capabilities contract was written to end, and one copy beside the three is the same disclosure. */
export function groupsOf(t: Tier): { capability: string; items: Inclusion[] }[] {
 const groups: { capability: string; items: Inclusion[] }[] = [];
 for (const item of t.includes) {
  const last = groups[groups.length - 1];
  if (last && last.capability === item.capability) last.items.push(item);
  else groups.push({ capability: item.capability, items: [item] });
 }
 return groups;
}

type Subscription = typeof businessModel.subscriptions[number];
const tiered = (s: Subscription) => 'tiersIn' in s && Boolean(s.tiersIn);
/* A row may point at a tier file, and this is the only tier file there is. A second one named in the
   business model and never read would be a plan with prices nobody renders. */
for (const s of businessModel.subscriptions) {
 if ('tiersIn' in s && s.tiersIn && s.tiersIn !== 'mom-plans.json') throw new Error(`Subscription "${s.id}" names tiers in ${s.tiersIn}, which nothing reads.`);
}

/** Every monthly price a subscription can be bought at: its tiers, its one price, or none. */
export const monthlyPrices = (s: Subscription): number[] => tiered(s) ? momPrices : s.price === null ? [] : [s.price];

export const isTiered = tiered;

/* One line per thing a person could pay for each month, which is what the console's revenue table is
   about. A tiered plan is three lines rather than one line with a range, because a range cannot be
   multiplied by a subscriber count. */
export type SubscriptionLine = { id: string; name: string; price: number | null; phase: number };
export const subscriptionLines = (): SubscriptionLine[] => businessModel.subscriptions.flatMap(s =>
 tiered(s)
  ? tiers.map(t => ({ id: `${s.id}-${t.id}`, name: `${s.name} · ${t.name}`, price: t.price, phase: t.phase }))
  : [{ id: s.id, name: s.name, price: s.price, phase: s.phase }]);
