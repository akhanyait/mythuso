/**
 * Vouchers on the runtime: issued by a corner shop at the catalogue's price with its code shown once, redeemed in part
 * and in whole against something owed, and refused — over its balance, past what is owed, after it expires, as cash,
 * tied to a medicine, towards the other kind of thing — in packages/catalog/apis/money.json's words. The expiry is
 * Money's setting in force when a voucher is issued, never less than the three years packages/catalog/vouchers.json
 * records from the Consumer Protection Act, and a replayed key is the same act once. Care is a stand-in that publishes
 * the visits and cancellations a test queues, through the real bus. Nothing is sold and no value is held.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vouchers from '../../../catalog/vouchers.json' with { type: 'json' };
import cancellation from '../../../catalog/cancellation.json' with { type: 'json' };
import moneyApi from '../../../catalog/apis/money.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { refusal, serviceById } from './domain/contract.ts';
import { moneyBlock } from './domain/settings.ts';

const START = '2026-09-15T09:00:00+02:00';
const ISSUE = 'POST /v1/money/vouchers@2', REDEEM = 'POST /v1/money/voucher-redemptions@1', PAY = 'POST /v1/money/payments@2', CHANGE = 'POST /v1/money/setting-changes@1';
const CORNER = { role: 'corner', ref: 'party-synthetic-corner', purpose: 'billing' };
const LERATO = { role: 'patient', ref: 'subj-lerato', purpose: 'billing' };
const OTHER = { role: 'patient', ref: 'subj-somebody-else', purpose: 'billing' };
const ADMIN = { role: 'admin', ref: 'party-synthetic-admin', purpose: 'audit' };
const cents = (id: string) => serviceById(id).price * 100;
const expirySetting = moneyBlock.items.find(s => s.key === vouchers.expiry.setting)!;
const shownOnce = moneyApi.routes.find(r => r.path === '/v1/money/vouchers' && r.version === 2)!.secretResponseFields!.find(f => f.field === 'voucherCode')!.shownOnce;

type Answer = { status: number; body: Record<string, unknown> };
const refused = (answer: Answer, id: string) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const accepted = (answer: Answer) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };

function world() {
 const queue: { key: EventKey; subjectRef: string; payload: Record<string, unknown> }[] = [];
 const care = defineEngine({ id: 'care', routes: {}, subscriptions: {}, store: { schema: '' }, tick: ctx => { for (const e of queue.splice(0)) ctx.publish(e.key, e.payload, { subjectRef: e.subjectRef, purposeOfUse: 'treatment' }); } });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [care, engine], dataDirectory: MEMORY, clock: createClock(START) });
 const call = (key: string, who: { role: string; ref: string; purpose: string }, fields: Record<string, unknown>): Answer => runtime.call(key as RouteKey, { ...who, fields });
 const published = (key: string) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === key);
 const scheduledFor = '2026-09-16T09:00:00+02:00';
 /* A visit Care held for Lerato, which opens a payable at the catalogue's price. */
 const owe = (appointmentRef: string, serviceId = 'vitals') => {
  queue.push({ key: 'appointment.booked@2', subjectRef: LERATO.ref, payload: { appointmentRef, clinicianRef: 'N-205', scheduledFor, serviceId } });
  runtime.advance(0);
  return `PB-${appointmentRef}`;
 };
 const cancel = (appointmentRef: string) => {
  queue.push({ key: 'appointment.cancelled@1', subjectRef: LERATO.ref, payload: { appointmentRef, cancelledByRole: 'patient', reasonCode: cancellation.reasons[0]!.id, scheduledFor } });
  runtime.advance(0);
 };
 const issue = (key: string, fields: Record<string, unknown> = { towardsKind: 'service', serviceId: 'vitals' }) => call(ISSUE, CORNER, { idempotencyKey: key, ...fields });
 return { runtime, call, published, owe, cancel, issue };
}

test('a voucher is issued at the catalogue\'s price, lasting the years in force, with its code shown once', () => {
 const { issue } = world();
 const first = accepted(issue('v-1'));
 assert.equal(first['issuedCents'], cents('vitals'));
 assert.equal(first['expiresOn'], `${2026 + (expirySetting.default.value as number)}-09-15`);
 assert.match(String(first['voucherCode']), /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
 /* The same key is the same voucher, and its code is not shown again: the replay says so in the route's words. */
 const replay = accepted(issue('v-1'));
 assert.equal(replay['voucherRef'], first['voucherRef']);
 assert.equal(replay['voucherCode'], shownOnce);
 const plan = accepted(issue('v-plan', { towardsKind: 'plan', planCode: 'essential' }));
 assert.ok(Number(plan['issuedCents']) > 0);
});

test('a voucher is never cash, never tied to a medicine, and never towards something the catalogue does not sell today', () => {
 const { issue, call } = world();
 refused(issue('v-cash', { towardsKind: 'cash' }), 'voucher-cashes-out');
 refused(issue('v-wallet', { towardsKind: 'service', serviceId: 'vitals', cashOut: true }), 'voucher-cashes-out');
 refused(issue('v-medicine', { towardsKind: 'medicine' }), 'voucher-tied-to-a-medicine');
 refused(issue('v-adherence', { towardsKind: 'service', serviceId: 'vitals', adherenceReward: true }), 'voucher-tied-to-a-medicine');
 refused(issue('v-later', { towardsKind: 'service', serviceId: 'screening' }), 'voucher-towards-not-sold');
 refused(issue('v-tier', { towardsKind: 'plan', planCode: 'gold' }), 'voucher-towards-not-sold');
 assert.equal(call(ISSUE, LERATO, { idempotencyKey: 'v-self', towardsKind: 'service', serviceId: 'vitals' }).body['error'], 'caller-not-allowed', 'a patient does not issue vouchers');
});

test('redeemed in part and then in whole, never past its balance or what is owed, and what is still owed is paid in the ordinary way', () => {
 const { issue, call, owe } = world();
 const code = accepted(issue('v-1'))['voucherCode'] as string;
 const wound = owe('APT-W', 'wound');
 const part = 10_000;
 /* Typed as a till would print it, or as somebody would say it: case and dashes do not matter. */
 const first = accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-1', voucherCode: code.toLowerCase().replace(/-/g, ' '), payableRef: wound, amountCents: part }));
 assert.deepEqual([first['redeemedCents'], first['remainingCents'], first['owedCents']], [part, cents('vitals') - part, cents('wound') - part]);
 /* The same key is the same redemption: the voucher is drawn on once. */
 assert.equal(accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-1', voucherCode: code, payableRef: wound, amountCents: part }))['remainingCents'], cents('vitals') - part);
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-over', voucherCode: code, payableRef: wound, amountCents: cents('vitals') - part + 1 }), 'voucher-over-redeemed');
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-nought', voucherCode: code, payableRef: wound, amountCents: 0 }), 'voucher-cashes-out');
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-bank', voucherCode: code, payableRef: wound, amountCents: 100, bankAccount: 'synthetic' }), 'voucher-cashes-out');
 refused(call(REDEEM, OTHER, { idempotencyKey: 'r-other', voucherCode: code, payableRef: wound, amountCents: 100 }), 'someone-elses-payable');
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-unknown', voucherCode: 'ABCD-EFGH-JKLM', payableRef: wound, amountCents: 100 }), 'voucher-not-found');
 /* What is still owed is paid through the payment route, at what is owed and not the whole price. */
 refused(call(PAY, LERATO, { idempotencyKey: 'p-whole', payableRef: wound, method: 'card', amountCents: cents('wound') }), 'amount-mismatch');
 const paid = accepted(call(PAY, LERATO, { idempotencyKey: 'p-rest', payableRef: wound, method: 'card', amountCents: cents('wound') - part }));
 assert.ok(['succeeded', 'failed'].includes(String(paid['stateCode'])), JSON.stringify(paid));

 /* A voucher larger than the bill pays the bill and no more. */
 const senior = accepted(issue('v-senior', { towardsKind: 'service', serviceId: 'senior' }))['voucherCode'];
 const injection = owe('APT-I', 'injection');
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-past-owed', voucherCode: senior, payableRef: injection, amountCents: cents('injection') + 1 }), 'voucher-more-than-owed');
 assert.equal(accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-whole', voucherCode: senior, payableRef: injection, amountCents: cents('injection') }))['owedCents'], 0);
 refused(call(PAY, LERATO, { idempotencyKey: 'p-covered', payableRef: injection, method: 'card', amountCents: 0 }), 'already-paid');

 /* The rest of the first voucher, used up, leaves nothing to draw on. */
 accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-rest', voucherCode: code, payableRef: owe('APT-V'), amountCents: cents('vitals') - part }));
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-spent', voucherCode: code, payableRef: owe('APT-V2'), amountCents: 1 }), 'voucher-spent');
});

test('a voucher towards a visit does not pay for a plan, and a redemption tied to a medicine is refused', () => {
 const { issue, call, owe } = world();
 const planCode = accepted(issue('v-plan', { towardsKind: 'plan', planCode: 'essential' }))['voucherCode'];
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-kind', voucherCode: planCode, payableRef: owe('APT-K'), amountCents: 100 }), 'voucher-not-for-this');
 const code = accepted(issue('v-1'))['voucherCode'];
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-med', voucherCode: code, payableRef: owe('APT-M'), amountCents: 100, prescriptionRef: 'synthetic' }), 'voucher-tied-to-a-medicine');
});

test('an expired voucher pays nothing, and the expiry is the setting in force when it was issued, never below the law\'s three years', () => {
 const { runtime, issue, call, owe } = world();
 const years = expirySetting.default.value as number;
 assert.equal(expirySetting.bounds!.lowest.value, vouchers.expiry.law.minimumYears, 'the lowest an admin may set is the law entry');
 const old = accepted(issue('v-old'));
 /* An admin lengthens the expiry. A voucher already issued keeps its own, and one issued after it gets the new one. */
 const change = call(CHANGE, ADMIN, { idempotencyKey: 's-1', setting: expirySetting.key, wholeNumber: years + 1, reason: 'Synthetic, for the voucher test.', expectedVersion: 1 });
 assert.equal(change.status, 200, JSON.stringify(change.body));
 const newer = accepted(issue('v-new'));
 assert.equal(newer['expiresOn'], `${2026 + years + 1}-09-15`);
 assert.equal(old['expiresOn'], `${2026 + years}-09-15`);
 const tooShort = call(CHANGE, ADMIN, { idempotencyKey: 's-2', setting: expirySetting.key, wholeNumber: vouchers.expiry.law.minimumYears - 1, reason: 'Synthetic.', expectedVersion: 2 });
 assert.equal(tooShort.body['error'], 'setting-out-of-range');

 runtime.advance(Date.parse(`${2026 + years}-09-16T09:00:00+02:00`) - Date.parse(START));
 const late = owe('APT-LATE');
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-late', voucherCode: old['voucherCode'], payableRef: late, amountCents: 100 }), 'voucher-expired');
 assert.equal(accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-in-time', voucherCode: newer['voucherCode'], payableRef: late, amountCents: 100 }))['redeemedCents'], 100);
});

test('what a voucher paid towards a cancelled visit goes back onto the voucher with the expiry it had, and never to a card', () => {
 const { issue, call, owe, cancel, published } = world();
 const issued = accepted(issue('v-1'));
 const first = owe('APT-C');
 accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-1', voucherCode: issued['voucherCode'], payableRef: first, amountCents: cents('vitals') }));
 const second = owe('APT-D');
 refused(call(REDEEM, LERATO, { idempotencyKey: 'r-2', voucherCode: issued['voucherCode'], payableRef: second, amountCents: 100 }), 'voucher-spent');
 cancel('APT-C');
 const back = accepted(call(REDEEM, LERATO, { idempotencyKey: 'r-3', voucherCode: issued['voucherCode'], payableRef: second, amountCents: cents('vitals') }));
 assert.equal(back['expiresOn'], issued['expiresOn']);
 assert.equal(published('payment.refunded@1').length, 0, 'nothing went back to a card, because nothing came from one');
});
