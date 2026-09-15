/* Money's settings, over the shared shape.
 *
 * What is held: every default is a value its own limits accept, and every value a guardrail forbids is
 * refused — by the shared rules, or by Money's own rules on wording, in the sentence the change route
 * declares; a nurse's share is never worded as a fraction or a percentage and a plan's name never sounds
 * like cover; the plan is read into mom-plans.json's words under whatever is in force, so a change to a
 * name, to stacking, to Plus's call-outs, to the WhatsApp choice or to the SOS wording reaches the next
 * plan read; and the doctor's fee is unconfirmed until an admin confirms it. Every expected word is read
 * from the contracts, so a changed default moves these tests with it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import api from '../../../../catalog/apis/money.json' with { type: 'json' };
import momPlans from '../../../../catalog/mom-plans.json' with { type: 'json' };
import { proposeChange, refusalOf, snapshotOf, type Change, type SettingValue } from '../../settings/shape.ts';
import {
 callOutsText, doctorFeeOf, moneyBlock, moneyDefaults, moneySettings, nurseShareSentenceOf, planSettingKeys, planTermsOf, wordingRefusalOf
} from './settings.ts';

const T0 = Date.UTC(2026, 8, 15, 8, 0);
/* The contract's tiers, typed once: each tier's inclusions are a different JSON shape, so the union the
   import gives cannot be searched without saying what an inclusion is. */
const TIERS = momPlans.tiers as unknown as { id: string; nameFrom: string; price: number; includes: { id: string; textBy?: { values: Record<string, string> } }[] }[];
const setting = (key: string) => moneyBlock.items.find(s => s.key === key)!;
const statement = (id: string) => api.routes.find(r => r.path === '/v1/money/setting-changes')!.refusals.find(r => r.id === id)!.statement;
const change = (history: readonly Change[], key: string, value: SettingValue) =>
 proposeChange(moneySettings, history, { setting: key, value, reason: 'A synthetic reason.', expectedVersion: snapshotOf(moneyBlock, history).settingsVersion, byRole: 'admin', byRef: 'A-901' }, T0);
const accepted = (history: readonly Change[], key: string, value: SettingValue): Change[] => {
 const result = change(history, key, value);
 if (!result.ok) assert.fail(`${key} refused: ${result.refusal.id}`);
 return [...history, result.value.change];
};

test('every default is accepted, every forbidden value is refused, and every setting is owned by Money', () => {
 for (const s of moneyBlock.items) {
  assert.equal(s.owner, 'money');
  assert.equal(refusalOf(s, s.default.value), null, `${s.key}'s default`);
  assert.equal(wordingRefusalOf(s.key, s.default.value), null, `${s.key}'s default breaks Money's own wording rules`);
  for (const forbidden of s.guardrail?.forbids ?? []) {
   const result = change([], s.key, forbidden as SettingValue);
   assert.ok(!result.ok, `${s.key} accepted ${JSON.stringify(forbidden)}`);
  }
 }
});

test('a nurse\'s share is never worded as a fraction or a percentage, and says so in the route\'s sentence', () => {
 for (const wording of ['Your share is 75% of the price.', 'You keep three quarters.', 'Half of it is yours.', 'Your share is 3/4 of the fee.', 'You keep 3 in 4 rand.', 'Three out of four rand are yours.', 'Your share is seventy-five per cent.', 'Your share is ¾ of the price.', 'Your percentage is fixed.']) {
  const result = change([], 'nurse-share-sentence', wording);
  assert.ok(!result.ok, wording);
  if (result.ok) continue;
  assert.deepEqual([result.refusal.id, result.refusal.statement], ['share-wording-states-a-fraction', statement('share-wording-states-a-fraction')], wording);
 }
 const reworded = accepted([], 'nurse-share-sentence', 'Most of the visit\'s price is yours, and each visit shows it to the rand.');
 assert.equal(nurseShareSentenceOf(snapshotOf(moneyBlock, reworded)), 'Most of the visit\'s price is yours, and each visit shows it to the rand.');
});

test('a plan\'s name never sounds like medical aid, a scheme or cover, and the rule is asked only of names', () => {
 for (const key of ['plan-family-name', 'tier-name-plus']) {
  const result = change([], key, 'Family Cover');
  assert.ok(!result.ok && result.refusal.id === 'plan-name-claims-cover' && result.refusal.statement === statement('plan-name-claims-cover'), key);
 }
 assert.equal(wordingRefusalOf('priority-sos-wording', 'cover'), null, 'a rule is asked of the settings it names and no others');
});

test('by default the plan reads as the contract words it, with the names, the stacking, one call-out a month, no WhatsApp and the SOS sentence', () => {
 const plan = planTermsOf(moneyDefaults);
 const name = (key: string) => setting(key).default.value as string;
 assert.equal(plan.name, name('plan-family-name'));
 assert.deepEqual(plan.tiers.map(t => t.name), TIERS.map(t => name(t.nameFrom)));
 assert.deepEqual(plan.tiers.map(t => t.price), TIERS.map(t => t.price), 'the founder\'s prices are not settings and pass through unchanged');
 assert.deepEqual(plan.tiers.map(t => t.inherits), [null, momPlans.stacking.inherits.replace('{tier}', plan.tiers[0]!.name), momPlans.stacking.inherits.replace('{tier}', plan.tiers[1]!.name)]);
 const plus = plan.tiers.find(t => t.id === 'plus')!;
 const callOuts = setting('plus-urgent-callouts').default.value as { count: number; period: keyof typeof momPlans.callOuts.per };
 assert.equal(plus.includes.find(i => i.id === 'urgent-call-out')!.text, `${momPlans.callOuts.counts[callOuts.count - 1]} ${callOuts.count === 1 ? momPlans.callOuts.one : momPlans.callOuts.many} ${momPlans.callOuts.per[callOuts.period]}`);
 const essential = plan.tiers.find(t => t.id === 'essential')!;
 const report = TIERS[0]!.includes.find(i => i.id === 'visit-report')!;
 assert.equal(essential.includes.find(i => i.id === 'visit-report')!.text, report.textBy!.values[setting('visit-reports-whatsapp').default.value as string]);
 const sos = plan.tiers.find(t => t.id === 'premium')!.includes.find(i => i.id === 'priority-sos')!;
 assert.equal(sos.detail, setting('priority-sos-wording').default.value);
 assert.ok(!/whatsapp/i.test(essential.includes.map(i => i.text).join(' ')), 'with WhatsApp off, no inclusion mentions it');
});

test('a change to a name, the stacking, the call-outs, the WhatsApp choice or the SOS wording reaches the next plan read', () => {
 let history = accepted([], 'tier-name-essential', 'Monthly');
 history = accepted(history, 'tiers-stack', false);
 history = accepted(history, 'plus-urgent-callouts', { count: 2, period: 'year' });
 history = accepted(history, 'visit-reports-whatsapp', 'notify-only');
 const sos = `Pressing SOS reaches a person at our desk first among calls of the same urgency. ${setting('priority-sos-wording').mustKeep![0]!.words}`;
 history = accepted(history, 'priority-sos-wording', sos);
 const plan = planTermsOf(snapshotOf(moneyBlock, history));
 assert.equal(plan.settingsVersion, 6);
 assert.equal(plan.tiers[0]!.name, 'Monthly');
 assert.deepEqual(plan.tiers.map(t => t.inherits), [null, null, null], 'tiers that do not stack list only their own');
 assert.equal(plan.tiers[1]!.includes.find(i => i.id === 'urgent-call-out')!.text, callOutsText({ count: 2, period: 'year' }));
 assert.match(callOutsText({ count: 2, period: 'year' })!, new RegExp(`^${momPlans.callOuts.counts[1]} ${momPlans.callOuts.many} ${momPlans.callOuts.per.year}$`));
 assert.match(plan.tiers[0]!.includes.find(i => i.id === 'visit-report')!.text, /WhatsApp/);
 assert.equal(plan.tiers[2]!.includes.find(i => i.id === 'priority-sos')!.detail, sos);

 const none = planTermsOf(snapshotOf(moneyBlock, accepted(history, 'plus-urgent-callouts', { count: 0, period: 'month' })));
 assert.equal(none.tiers[1]!.includes.some(i => i.id === 'urgent-call-out'), false, 'nought call-outs lists no line rather than one that promises nothing');
 assert.equal(callOutsText({ count: 0, period: 'month' }), null);
});

test('the doctor\'s fee is a proposal nobody has confirmed until an admin confirms it, and a changed amount alone confirms nothing', () => {
 assert.equal(doctorFeeOf(moneyDefaults).confirmed, false);
 const bounds = setting('doctor-case-fee').bounds!;
 const moved = accepted([], 'doctor-case-fee', bounds.highest.value);
 assert.deepEqual([doctorFeeOf(snapshotOf(moneyBlock, moved)).amountCents, doctorFeeOf(snapshotOf(moneyBlock, moved)).confirmed], [bounds.highest.value, false]);
 const confirmed = accepted(moved, 'doctor-fee-confirmed', true);
 assert.deepEqual(doctorFeeOf(snapshotOf(moneyBlock, confirmed)), { feeCode: 'review-per-case', amountCents: bounds.highest.value, confirmed: true, settingsVersion: 3, lowestCents: bounds.lowest.value, highestCents: bounds.highest.value });
 const refused = change([], 'doctor-case-fee', bounds.lowest.value - 1);
 assert.ok(!refused.ok && refused.refusal.id === 'setting-out-of-range');
});

test('every setting mom-plans.json reads is one of Money\'s, and every one Money holds for the plan is read', () => {
 const keys = planSettingKeys();
 for (const key of keys) assert.ok(moneyBlock.items.some(s => s.key === key), key);
 const planKeys = ['plan-family-name', 'tier-name-essential', 'tier-name-plus', 'tier-name-premium', 'tiers-stack', 'plus-urgent-callouts', 'priority-sos-wording', 'visit-reports-whatsapp'];
 assert.deepEqual([...keys].sort(), [...planKeys].sort());
});
