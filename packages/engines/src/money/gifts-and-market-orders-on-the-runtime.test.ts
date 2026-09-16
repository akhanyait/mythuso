/**
 * Gifts and Thuso Market orders, closed in Wave 6: two routes declared since Wave 2 and never built.
 *
 * Gift issue is on the runtime, through POST /v1/money/gifts@1, exactly as a caller would reach it. Booking a
 * gifted visit is not — Money's contract carries no route for it, because booking is Care's act, and this file's
 * header explains why bookGiftedVisit stands in for it directly (packages/engines/src/money/domain/gifts.ts and
 * ledger.ts). So the beneficiary's half of this test drives a plain ledger the same way the domain tests beside
 * this file do, on a fresh createMoney() rather than the runtime's SQLite store — the two are proved consistent
 * because giftAVisit's own refusal, gift-books-for-them, is one function used both places.
 *
 * Thuso Market orders are on the runtime end to end: placing one prices the shop's catalogue plus delivery,
 * refuses medicine-in-shop on a scheduled formulary entry and on a listed word, and is paid through the existing
 * payments route like a visit is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { createMoney } from './domain/ledger.ts';
import { isRefusal, refusal } from './domain/contract.ts';
import shop from '../../../catalog/shop.json' with { type: 'json' };

const START = '2026-09-15T09:00:00+02:00';
const GIFT = 'POST /v1/money/gifts@1', ORDER = 'POST /v1/money/market-orders@1', PAY = 'POST /v1/money/payments@2';
const UNCLE = { role: 'sponsor', ref: 'party-uncle-sipho', purpose: 'billing' };
const LERATO = { role: 'patient', ref: 'subj-lerato', purpose: 'billing' };

type Answer = { status: number; body: Record<string, unknown> };
const refused = (answer: Answer, id: string) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const accepted = (answer: Answer) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };

function world() {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine], dataDirectory: MEMORY, clock: createClock(START) });
 const call = (key: string, who: { role: string; ref: string; purpose: string }, fields: Record<string, unknown>): Answer => runtime.call(key as RouteKey, { ...who, fields });
 const give = (key: string, fields: Record<string, unknown> = { beneficiarySubjectRef: LERATO.ref, serviceId: 'vitals' }) => call(GIFT, UNCLE, { idempotencyKey: key, ...fields });
 const place = (key: string, fields: Record<string, unknown>) => call(ORDER, LERATO, { idempotencyKey: key, ...fields });
 return { runtime, call, give, place };
}

/* ---- Gifts ------------------------------------------------------------------------------------------- */

test('a gift is issued at the catalogue\'s price for the person named, and the same key is the same gift once', () => {
 const { give } = world();
 const first = accepted(give('g-1'));
 assert.ok(typeof first['giftRef'] === 'string' && first['giftRef']);
 const replay = accepted(give('g-1'));
 assert.equal(replay['giftRef'], first['giftRef']);
});

test('a gift refuses an appointment, a booking or the beneficiary\'s agreement sent with it, and only a caregiver or a sponsor may give one', () => {
 const { give, call } = world();
 refused(give('g-appt', { beneficiarySubjectRef: LERATO.ref, serviceId: 'vitals', appointmentRef: 'APT-1' }), 'gift-books-for-them');
 refused(give('g-agree', { beneficiarySubjectRef: LERATO.ref, serviceId: 'vitals', beneficiaryAgreed: true }), 'gift-books-for-them');
 refused(give('g-book', { beneficiarySubjectRef: LERATO.ref, serviceId: 'vitals', bookingRef: 'BK-1' }), 'gift-books-for-them');
 refused(call(GIFT, LERATO, { idempotencyKey: 'g-self', beneficiarySubjectRef: LERATO.ref, serviceId: 'vitals' }), 'caller-not-allowed');
});

test('the beneficiary books her gifted visit in her own account, and nobody else may: money.ts\'s stand-in for the booking Care would otherwise cause', () => {
 const money = createMoney({ simulation: true, voucherExpiryYears: () => 3 });
 /* This ledger is driven directly, not through the runtime, so its actors are its own {role, subjectRef} shape
    rather than the runtime caller shape {role, ref, purpose} the routed tests above use. */
 const uncle = { role: 'sponsor', subjectRef: 'party-uncle-sipho' };
 const lerato = { role: 'patient', subjectRef: 'subj-lerato' };
 const other = { role: 'patient', subjectRef: 'subj-somebody-else' };
 const gift = money.giftAVisit(uncle, { idempotencyKey: 'g-1', beneficiarySubjectRef: lerato.subjectRef, serviceId: 'vitals' });
 if (isRefusal(gift)) throw new Error(gift.statement);

 /* The giver may not book it, and neither may anybody it was not given to. */
 assert.deepEqual(money.bookGiftedVisit(uncle, { idempotencyKey: 'b-giver', giftRef: gift.giftRef }), refusal('gift-books-for-them'));
 assert.deepEqual(money.bookGiftedVisit(other, { idempotencyKey: 'b-other', giftRef: gift.giftRef }), refusal('gift-books-for-them'));

 const booked = money.bookGiftedVisit(lerato, { idempotencyKey: 'b-1', giftRef: gift.giftRef });
 if (isRefusal(booked)) throw new Error(booked.statement);
 assert.equal(booked.stateCode, 'booked');
 assert.equal(money.owed(booked.payableRef), 0, 'the gift settled the visit it was given for in full');

 /* The same key replays the same booking; a different key against an already-booked gift is refused. */
 const replay = money.bookGiftedVisit(lerato, { idempotencyKey: 'b-1', giftRef: gift.giftRef });
 assert.deepEqual(replay, { ...booked, replayed: true });
 assert.deepEqual(money.bookGiftedVisit(lerato, { idempotencyKey: 'b-2', giftRef: gift.giftRef }), refusal('gift-already-booked'));
});

/* ---- Thuso Market orders ------------------------------------------------------------------------------ */

test('a market order prices the shop\'s catalogue plus delivery, and the same key is the same order once', () => {
 const { place } = world();
 const one = shop.products[0]!;
 const first = accepted(place('o-1', { productIds: [one.id], deliveryZone: 'Rosebank' }));
 const belowFree = one.price * 100 < shop.delivery.freeAbove * 100;
 assert.equal(first['totalCents'], one.price * 100 + (belowFree ? shop.delivery.fee * 100 : 0));
 const replay = accepted(place('o-1', { productIds: [one.id], deliveryZone: 'Rosebank' }));
 assert.equal(replay['marketOrderRef'], first['marketOrderRef']);
 assert.equal(replay['totalCents'], first['totalCents']);
});

test('a market order refuses a scheduled medicine by its formulary code and a listed one by its words, and only a patient or a caregiver may place one', () => {
 const { place, call } = world();
 /* SYN-0001 is Schedule 1 in packages/catalog/medicines.json's formulary — a code with no word a scanner would
    catch, refused only because its schedule is read. */
 refused(place('o-med', { productIds: ['SYN-0001'], deliveryZone: 'Rosebank' }), 'medicine-in-shop');
 /* A made-up id that reads, by shop.json's own neverSold vocabulary, as a medicine. */
 refused(place('o-named', { productIds: ['paracetamol-tablet'], deliveryZone: 'Rosebank' }), 'medicine-in-shop');
 refused(call(ORDER, { role: 'sponsor', ref: 'party-uncle-sipho', purpose: 'billing' }, { idempotencyKey: 'o-caller', productIds: [shop.products[0]!.id], deliveryZone: 'Rosebank' }), 'caller-not-allowed');
});

test('a market order is paid through the existing payments route, exactly as a visit is', () => {
 const { place, call } = world();
 const two = shop.products.slice(0, 2).map(p => p.id);
 const placed = accepted(place('o-pay', { productIds: two, deliveryZone: 'Rosebank' }));
 const paid = call(PAY, LERATO, { idempotencyKey: 'p-1', payableRef: `PB-${placed['marketOrderRef']}`, method: 'card', amountCents: placed['totalCents'] });
 assert.ok(['succeeded', 'failed'].includes(String((paid.body as Record<string, unknown>)['stateCode'])), JSON.stringify(paid.body));
});
