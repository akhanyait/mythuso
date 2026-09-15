/**
 * MyThuso for Mom Essential, end to end, across the three engines that each own a part of it: Money takes the plan,
 * the parent's agreement and the first month's payment through its simulated provider; Access books the visit the
 * month includes through the booking rules; Medicines authorises the collector the parent chooses and hands the bag
 * over against her PIN. Care is a stand-in that publishes the appointment a nurse's acceptance would, and Trust one that
 * clears the doctor and the pharmacy, both through the real bus. The Wave 4 exit test is here: Mom Essential delivered
 * with medicine in hand. It sits beside the engines because it binds three, and an engine's own directory reaches no
 * other engine. Nothing here is a real service: no plan is sold, no nurse is sent and no medicine is collected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import essential from '../../catalog/mom-essential.json' with { type: 'json' };
import momPlans from '../../catalog/mom-plans.json' with { type: 'json' };
import cancellation from '../../catalog/cancellation.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from './runtime/index.ts';
import { engine as money } from './money/engine.ts';
import { engine as access } from './access/engine.ts';
import { engine as medicines } from './medicines/engine.ts';
import { offeredDays } from './access/domain/booking.ts';
import { refusal } from './money/domain/contract.ts';
import { refusal as medicinesRefusal } from './medicines/domain/contract.ts';

const START = '2026-09-15T09:00:00+02:00';
const SPONSOR = 'subject-synthetic-thabo', PARENT = 'subject-synthetic-nomsa', STRANGER = 'subject-synthetic-stranger';
const DOCTOR = 'party-synthetic-doctor', PHARMACIST = 'party-synthetic-pharmacist', PHARMACY = 'party-synthetic-pharmacy', NURSE = 'party-synthetic-nurse';
const R = {
 ask: 'POST /v1/money/plan-subscriptions@1', agree: 'POST /v1/money/plan-subscriptions/{subscriptionRef}/accept@1', read: 'GET /v1/money/plan-subscriptions/{subscriptionRef}@1',
 pay: 'POST /v1/money/payments@2', book: 'POST /v1/access/bookings@2',
 check: 'POST /v1/medicines/interaction-checks@2', prescribe: 'POST /v1/medicines/prescriptions@2', verify: 'POST /v1/medicines/prescriptions/{prescriptionRef}/verify@2',
 dispense: 'POST /v1/medicines/prescriptions/{prescriptionRef}/dispense@2', authorise: 'POST /v1/medicines/collection-authorisations@1',
 collect: 'POST /v1/medicines/collections@2', handover: 'POST /v1/medicines/collections/{collectionRef}/handover@2'
} as const;
const tier = momPlans.tiers.find(t => t.id === essential.planCode)!;
const visit = essential.included.find(i => i.inclusionId === 'monthly-visit')!;

type Who = { role: string; ref: string; purpose: string };
const sponsor: Who = { role: 'sponsor', ref: SPONSOR, purpose: 'billing' };
const parent: Who = { role: 'patient', ref: PARENT, purpose: 'billing' };
type Answer = { status: number; body: Record<string, unknown> };
const accepted = (answer: Answer) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };
const refused = (answer: Answer, id: string, sentence: { status: number; statement: string } = refusal(id)) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], sentence.statement);
 assert.equal(answer.status, sentence.status);
};

function world() {
 const queues: Record<string, { key: EventKey; subjectRef: string; payload: Record<string, unknown> }[]> = { care: [], trust: [] };
 const standIn = (id: 'care' | 'trust') => defineEngine({ id, routes: {}, subscriptions: {}, store: { schema: '' }, tick: ctx => { for (const e of queues[id]!.splice(0)) ctx.publish(e.key, e.payload, { subjectRef: e.subjectRef, purposeOfUse: id === 'care' ? 'treatment' : 'audit' }); } });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [money, access, medicines, standIn('care'), standIn('trust')], dataDirectory: MEMORY, clock: createClock(START) });
 const call = (key: string, who: Who, fields: Record<string, unknown>): Answer => runtime.call(key as RouteKey, { ...who, fields });
 const says = (engine: 'care' | 'trust', key: EventKey, subjectRef: string, payload: Record<string, unknown>) => { queues[engine]!.push({ key, subjectRef, payload }); runtime.advance(0); };
 const published = (key: string) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === key);
 const read = (subscriptionRef: string, who: Who) => accepted(call(R.read, who, { subscriptionRef }));

 /* The first month, paid by the sponsor through the simulated provider, which declines about one attempt in five. */
 const payMonth = (payableRef: string, amountCents: number) => {
  for (let attempt = 1; attempt <= 12; attempt++) {
   const paid = accepted(call(R.pay, sponsor, { idempotencyKey: `month-${attempt}`, payableRef, method: 'card', amountCents }));
   if (paid['stateCode'] === 'succeeded') return paid;
  }
  return assert.fail('the simulated provider declined the first month twelve times running');
 };
 /* Asked for by the sponsor, agreed to by the parent, and paid: the plan in force. */
 const activePlan = (lineDetail = 'amount-only') => {
  const subscriptionRef = accepted(call(R.ask, sponsor, { idempotencyKey: 'ask-1', subjectRef: PARENT, planCode: essential.planCode }))['subscriptionRef'] as string;
  const agreed = accepted(call(R.agree, parent, { idempotencyKey: 'agree-1', subscriptionRef, lineDetail }));
  payMonth(agreed['payableRef'] as string, tier.price * 100);
  return subscriptionRef;
 };
 const appointment = (appointmentRef: string, serviceId = visit.serviceId) =>
  says('care', 'appointment.booked@2', PARENT, { appointmentRef, clinicianRef: 'N-205', scheduledFor: '2026-09-16T09:00:00+02:00', serviceId });
 return { runtime, call, says, published, read, payMonth, activePlan, appointment };
}

test('a sponsor asks, the parent agrees as herself, the first month is paid through the simulated provider, and the plan starts', () => {
 const { call, read, payMonth, published } = world();
 refused(call(R.ask, sponsor, { idempotencyKey: 'plus', subjectRef: PARENT, planCode: 'plus' }), 'plan-not-offered');
 refused(call(R.ask, sponsor, { idempotencyKey: 'ahead', subjectRef: PARENT, planCode: essential.planCode, priority: 'first' }), 'no-plan-buys-a-place-ahead');
 refused(call(R.ask, sponsor, { idempotencyKey: 'for-her', subjectRef: PARENT, planCode: essential.planCode, parentConsent: true }), 'sponsor-agrees-for-the-parent');
 assert.equal(call(R.ask, { role: 'guardian', ref: SPONSOR, purpose: 'billing' }, { idempotencyKey: 'g', subjectRef: PARENT, planCode: essential.planCode }).body['error'], 'caller-not-allowed', 'no guardian authority is proven');

 const asked = accepted(call(R.ask, sponsor, { idempotencyKey: 'ask-1', subjectRef: PARENT, planCode: essential.planCode }));
 assert.deepEqual([asked['stateCode'], asked['amountCents']], ['awaiting-parent', tier.price * 100]);
 const subscriptionRef = asked['subscriptionRef'] as string;
 const waiting = read(subscriptionRef, sponsor);
 assert.equal(waiting['stateCode'], 'awaiting-parent');
 assert.ok(!('payableRef' in waiting), 'nothing is owed before she agrees');

 refused(call(R.agree, sponsor, { idempotencyKey: 'agree-for-her', subscriptionRef, lineDetail: 'service-named' }), 'only-the-parent-agrees');
 refused(call(R.agree, { role: 'patient', ref: STRANGER, purpose: 'billing' }, { idempotencyKey: 'stranger', subscriptionRef, lineDetail: 'amount-only' }), 'subscription-not-found');
 refused(call(R.agree, parent, { idempotencyKey: 'agree-odd', subscriptionRef, lineDetail: 'everything' }), 'line-detail-not-offered');
 const agreed = accepted(call(R.agree, parent, { idempotencyKey: 'agree-1', subscriptionRef, lineDetail: 'amount-only' }));
 assert.equal(agreed['stateCode'], 'awaiting-payment');

 payMonth(agreed['payableRef'] as string, tier.price * 100);
 assert.ok(published('payment.succeeded@1').length >= 1);
 const started = read(subscriptionRef, sponsor);
 assert.deepEqual([started['stateCode'], started['startedOn'], started['monthEndsOn']], ['active', '2026-09-15', '2026-10-14']);
 assert.ok(!Object.keys(started).some(key => /priority|rank|queue/i.test(key)), 'a plan carries nothing that could rank anybody');
 refused(call(R.ask, sponsor, { idempotencyKey: 'ask-2', subjectRef: PARENT, planCode: essential.planCode }), 'plan-already-held');
});

test('the visit the month includes books through the booking rules and owes nothing, and a sponsor sees only the day unless the parent names the service', () => {
 const { call, read, activePlan, appointment, says, published } = world();
 const subscriptionRef = activePlan();
 const day = offeredDays(new Date(START))[0]!;
 const booked = accepted(call(R.book, { role: 'patient', ref: PARENT, purpose: 'dispatch' }, { idempotencyKey: 'b-1', subjectRef: PARENT, serviceId: visit.serviceId, mode: 'home', slotRef: `${day}T09:00~nearest`, zoneId: 'melville' }));
 assert.equal(booked['stateCode'], 'requested');
 assert.equal(published('booking.requested@2').length, 1, 'booked through the booking rules, on the bus');

 /* A nurse accepts, and Care holds the appointment. */
 const appointmentRef = `apt-${String(booked['bookingRef'])}`;
 appointment(appointmentRef);
 const asParent = read(subscriptionRef, parent);
 assert.deepEqual(asParent['included'], [{ inclusionCode: 'monthly-visit', allowed: visit.perPeriod, used: 1 }, { inclusionCode: 'medicine-collection', allowed: 1, used: 0 }]);
 assert.deepEqual(asParent['lines'], [{ on: '2026-09-15', kindCode: 'visit', serviceId: visit.serviceId }]);
 assert.deepEqual(read(subscriptionRef, sponsor)['lines'], [{ on: '2026-09-15', kindCode: null, serviceId: null }], 'amount-only: a sponsor sees the day');
 refused(call(R.pay, parent, { idempotencyKey: 'p-included', payableRef: `PB-${appointmentRef}`, method: 'card', amountCents: 0 }), 'already-paid');

 /* A second one that month is an ordinary visit at its own price. */
 appointment('apt-second');
 const second = call(R.pay, parent, { idempotencyKey: 'p-second', payableRef: 'PB-apt-second', method: 'card', amountCents: 0 });
 refused(second, 'amount-mismatch');

 /* She names the service for him; he sees it from then. */
 accepted(call(R.agree, parent, { idempotencyKey: 'agree-named', subscriptionRef, lineDetail: 'service-named' }));
 assert.deepEqual(read(subscriptionRef, sponsor)['lines'], [{ on: '2026-09-15', kindCode: 'visit', serviceId: visit.serviceId }]);

 /* The included visit is cancelled, and the month may include another. */
 says('care', 'appointment.cancelled@1', PARENT, { appointmentRef, cancelledByRole: 'patient', reasonCode: cancellation.reasons[0]!.id, scheduledFor: '2026-09-16T09:00:00+02:00' });
 assert.equal((read(subscriptionRef, parent)['included'] as { used: number }[])[0]!.used, 0);
 appointment('apt-third');
 refused(call(R.pay, parent, { idempotencyKey: 'p-third', payableRef: 'PB-apt-third', method: 'card', amountCents: 0 }), 'already-paid');
});

test('Mom Essential delivered with medicine in hand: the parent authorises, the nurse hands over against her PIN, and Money counts the month\'s collection', () => {
 const { call, says, read, activePlan, published } = world();
 const subscriptionRef = activePlan();
 says('trust', 'person.verified@1', DOCTOR, { role: 'doctor', badgeTier: 'verified', verifiedUntil: '2027-09-15' });
 says('trust', 'partner.verified@1', PHARMACY, { partnerKind: 'pharmacy', verifiedUntil: '2027-09-15' });
 const check = (role: string, ref: string, stageCode: string) => accepted(call(R.check, { role, ref, purpose: stageCode === 'prescribe' ? 'treatment' : 'dispensing' }, { subjectRef: PARENT, stageCode }))['checkRef'];
 const prescriptionRef = accepted(call(R.prescribe, { role: 'doctor', ref: DOCTOR, purpose: 'treatment' }, { subjectRef: PARENT, medicationRequestRef: 'medication-request-synthetic-1', checkRef: check('doctor', DOCTOR, 'prescribe'), scheduleCode: 'S2', pharmacyRef: PHARMACY, notCheckedRead: true }))['prescriptionRef'];
 accepted(call(R.verify, { role: 'pharmacist', ref: PHARMACIST, purpose: 'dispensing' }, { prescriptionRef }));
 accepted(call(R.dispense, { role: 'pharmacist', ref: PHARMACIST, purpose: 'dispensing' }, { prescriptionRef, dispenseEntryRef: 'dispense-entry-synthetic-1', checkRef: check('pharmacist', PHARMACIST, 'dispense'), sealRef: 'seal-synthetic-1', notCheckedRead: true }));

 /* Paying for the plan authorises nobody: the sponsor is not a caller of the authorisation. */
 assert.equal(call(R.authorise, { role: 'sponsor', ref: SPONSOR, purpose: 'dispensing' }, { prescriptionRef, collectorRef: NURSE, collectorRole: 'nurse' }).body['error'], 'caller-not-allowed');
 const given = accepted(call(R.authorise, { role: 'patient', ref: PARENT, purpose: 'dispensing' }, { prescriptionRef, collectorRef: NURSE, collectorRole: 'nurse' }));
 const collectionRef = accepted(call(R.collect, { role: 'nurse', ref: NURSE, purpose: 'dispensing' }, { prescriptionRef, authorisationRef: given['authorisationRef'], sealRef: 'seal-synthetic-1' }))['collectionRef'];
 const pin = String(given['handoverPin']);
 const wrong = pin.replace(/\d$/, d => String((Number(d) + 1) % 10));
 refused(call(R.handover, { role: 'nurse', ref: NURSE, purpose: 'dispensing' }, { collectionRef, handoverPin: wrong, sealIntact: true }), 'wrong-pin', medicinesRefusal('wrong-pin'));
 assert.equal((read(subscriptionRef, parent)['included'] as { used: number }[])[1]!.used, 0, 'nothing is counted before the bag is in her hands');
 accepted(call(R.handover, { role: 'nurse', ref: NURSE, purpose: 'dispensing' }, { collectionRef, handoverPin: pin, sealIntact: true }));
 assert.equal(published('delivery.handed_over@1').length, 1);

 const asParent = read(subscriptionRef, parent);
 assert.deepEqual((asParent['included'] as { inclusionCode: string; used: number }[]).map(i => [i.inclusionCode, i.used]), [['monthly-visit', 0], ['medicine-collection', 1]]);
 assert.deepEqual(asParent['lines'], [{ on: '2026-09-15', kindCode: 'collection', serviceId: null }]);
 assert.deepEqual(read(subscriptionRef, sponsor)['lines'], [{ on: '2026-09-15', kindCode: null, serviceId: null }], 'a sponsor is told care was given, and not that it was medicine');
 for (const body of [asParent, read(subscriptionRef, sponsor)]) assert.ok(!/medication|schedule|dose|pin|seal/i.test(JSON.stringify(body)), 'nothing about the medicine reaches the plan');
});
