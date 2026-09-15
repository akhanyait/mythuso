/**
 * Group payers and claims on the runtime.
 *
 * A stokvel is opened by a sponsor and holds no money; a member is invited, agrees as herself, and asks the group to pay
 * for a visit she owes, which charges the group's own account through the simulated provider up to the limit in force.
 * Somebody who is not a member is refused, and an employer is told nothing about an employee's health. A claim is drafted
 * by the doctor who signed the visit's review, agreed to by the patient, and stops at "Not submitted: no switching
 * partner is connected"; without an adopted code set it would stop again at the code, whatever the partner. A duplicate
 * replays, and a settings change reaches nothing already started.
 *
 * Care and Clinical are stand-ins that publish what a test queues, through the real bus. Nothing is paid and no scheme
 * is contacted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import groups from '../../../catalog/groups.json' with { type: 'json' };
import claims from '../../../catalog/claims.json' with { type: 'json' };
import moneyContract from '../../../catalog/money.json' with { type: 'json' };
import programmes from '../../../catalog/programmes.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { attempt } from './domain/provider.ts';
import { isRefusal, refusal, serviceById } from './domain/contract.ts';
import { createMoney, memoryTables } from './domain/ledger.ts';
import { moneyBlock } from './domain/settings.ts';
import { addDays } from './domain/claims.ts';

const START = '2026-09-14T09:00:00+02:00';
const DAY = 86_400_000;
const OPEN = 'POST /v1/money/groups@2', INVITE = 'POST /v1/money/group-memberships@1', ACCEPT = 'POST /v1/money/group-memberships/{membershipRef}/accept@1';
const LEAVE = 'POST /v1/money/group-memberships/{membershipRef}/leave@1', GROUP_PAY = 'POST /v1/money/group-payments@1', GROUP = 'GET /v1/money/groups/{groupRef}@1', MINE = 'GET /v1/money/group-memberships@1';
const DRAFT = 'POST /v1/money/claims@3', CONSENT = 'POST /v1/money/claims/{claimRef}/consent@1', SUBMIT = 'POST /v1/money/claims/{claimRef}/submit@1', CLAIMS = 'GET /v1/money/claims@1';
const HELD = 'GET /v1/money/held-cash-payments@1', PAY = 'POST /v1/money/payments@2', CASH = 'POST /v1/money/payments/{paymentRef}/cash-code@2', CHANGE = 'POST /v1/money/setting-changes@1';

type Who = { role: string; ref: string; purpose: string };
const TREASURER: Who = { role: 'sponsor', ref: 'subj-treasurer', purpose: 'billing' };
const EMPLOYER: Who = { role: 'employer', ref: 'party-synthetic-employer', purpose: 'billing' };
const LERATO: Who = { role: 'patient', ref: 'subj-lerato', purpose: 'billing' };
const OTHER: Who = { role: 'patient', ref: 'subj-somebody-else', purpose: 'billing' };
const DOCTOR: Who = { role: 'doctor', ref: 'D-401', purpose: 'billing' };
const ANOTHER_DOCTOR: Who = { role: 'doctor', ref: 'D-402', purpose: 'billing' };
const ADMIN: Who = { role: 'admin', ref: 'party-synthetic-admin', purpose: 'audit' };
const BACK_OFFICE: Who = { ...ADMIN, purpose: 'billing' };
const DESK: Who = { role: 'ops-desk', ref: 'O-801', purpose: 'billing' };
const NURSE: Who = { role: 'nurse', ref: 'N-205', purpose: 'billing' };
const cents = (id: string) => serviceById(id).price * 100;
const setting = (key: string) => moneyBlock.items.find(s => s.key === key)!;
const feeCode = moneyContract.doctorFees[0]!.feeCode;

type Answer = { status: number; body: Record<string, unknown> };
const refused = (answer: Answer, id: string) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const accepted = (answer: Answer) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };

/* Which stand-in publishes what: Care the visit, Clinical the signed review. */
const PUBLISHER: Record<string, string> = { 'appointment.booked@2': 'care', 'visit.billable@1': 'care', 'review.billable@1': 'clinical' };

function world() {
 const queue: { key: EventKey; subjectRef: string; payload: Record<string, unknown> }[] = [];
 const stand = (id: string) => defineEngine({
  id, routes: {}, subscriptions: {}, store: { schema: '' },
  tick: ctx => { for (const e of queue.filter(q => PUBLISHER[q.key] === id)) { queue.splice(queue.indexOf(e), 1); ctx.publish(e.key, e.payload, { subjectRef: e.subjectRef, purposeOfUse: 'treatment' }); } }
 });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [stand('care'), stand('clinical'), engine], dataDirectory: MEMORY, clock: createClock(START) });
 const call = (key: string, who: Who, fields: Record<string, unknown> = {}): Answer => runtime.call(key as RouteKey, { ...who, fields });
 const published = (prefix: string) => runtime.trail.all().filter(e => e.kind === 'published' && (e.eventKey ?? '').startsWith(prefix));
 const scheduledFor = '2026-09-15T09:00:00+02:00';
 /* A visit Care held, which opens a payable at the catalogue's price. */
 const owe = (appointmentRef: string, serviceId = 'vitals', subjectRef = LERATO.ref) => {
  queue.push({ key: 'appointment.booked@2', subjectRef, payload: { appointmentRef, clinicianRef: NURSE.ref, scheduledFor, serviceId } });
  runtime.advance(0);
  return `PB-${appointmentRef}`;
 };
 /* Care says the visit happened, and a doctor signs its review. */
 const finish = (appointmentRef: string, serviceId = 'vitals', subjectRef = LERATO.ref) => {
  queue.push({ key: 'visit.billable@1', subjectRef, payload: { appointmentRef, serviceId, clinicianRef: NURSE.ref } });
  runtime.advance(0);
 };
 const sign = (reviewRef: string, doctorRef = DOCTOR.ref, subjectRef = LERATO.ref) => {
  queue.push({ key: 'review.billable@1', subjectRef, payload: { reviewRef, reviewedByRef: doctorRef, feeCode } });
  runtime.advance(0);
 };
 return { runtime, call, published, owe, finish, sign };
}

/* A payable reference whose first simulated attempt the provider authorises, so a test that needs money to have moved does
   not depend on which way the seed falls. */
const authorisedVisit = (prefix: string, serviceId: string) => {
 for (let i = 0; i < 50; i++) {
  const ref = `${prefix}-${i}`;
  if (attempt(`PB-${ref}`, 1, 'x', cents(serviceId), new Date(START)).outcome === 'authorised') return ref;
 }
 throw new Error('No authorised attempt in fifty; the simulated provider has changed.');
};

function stokvelWithLerato(w: ReturnType<typeof world>) {
 const groupRef = accepted(w.call(OPEN, TREASURER, { idempotencyKey: 'g-1', groupKind: 'stokvel' }))['groupRef'] as string;
 const membershipRef = accepted(w.call(INVITE, TREASURER, { idempotencyKey: 'i-1', groupRef, subjectRef: LERATO.ref }))['membershipRef'] as string;
 return { groupRef, membershipRef };
}

test('a group holds no money, and a member added without her own agreement is refused', () => {
 const w = world();
 refused(w.call(OPEN, TREASURER, { idempotencyKey: 'g-pool', groupKind: 'stokvel', poolBalanceCents: 100 }), 'group-holds-money');
 refused(w.call(OPEN, TREASURER, { idempotencyKey: 'g-wallet', groupKind: 'wallet' }), 'group-holds-money');
 refused(w.call(OPEN, TREASURER, { idempotencyKey: 'g-club', groupKind: 'club' }), 'group-kind-not-offered');
 refused(w.call(OPEN, EMPLOYER, { idempotencyKey: 'g-emp-stokvel', groupKind: 'stokvel' }), 'group-kind-not-yours');
 refused(w.call(OPEN, TREASURER, { idempotencyKey: 'g-sp-employer', groupKind: 'employer' }), 'group-kind-not-yours');
 const { groupRef } = stokvelWithLerato(w);
 refused(w.call(INVITE, TREASURER, { idempotencyKey: 'i-agreed', groupRef, subjectRef: OTHER.ref, agreedOnHerBehalf: true }), 'member-added-without-agreement');
 refused(w.call(INVITE, TREASURER, { idempotencyKey: 'i-deposit', groupRef, subjectRef: OTHER.ref, depositCents: 5000 }), 'group-holds-money');
 refused(w.call(INVITE, TREASURER, { idempotencyKey: 'i-again', groupRef, subjectRef: LERATO.ref }), 'already-invited');
 refused(w.call(INVITE, { ...TREASURER, ref: 'subj-another-treasurer' }, { idempotencyKey: 'i-not-yours', groupRef, subjectRef: OTHER.ref }), 'group-not-found');
});

test('a member agrees as herself, and her group pays for her visit from its own account; a non-member is refused', () => {
 const w = world();
 const { groupRef, membershipRef } = stokvelWithLerato(w);
 const payable = w.owe(authorisedVisit('APT-G', 'vitals'));
 const charge = (who: Who, key: string, extra: Record<string, unknown> = {}) => w.call(GROUP_PAY, who, { idempotencyKey: key, groupRef, payableRef: payable, method: 'card', amountCents: cents('vitals'), ...extra });

 /* Invited is not agreed: the group pays for nothing of hers yet, and the treasurer cannot agree for her. */
 refused(charge(LERATO, 'p-early'), 'group-pays-only-members');
 refused(w.call(ACCEPT, TREASURER, { idempotencyKey: 'a-for-her', membershipRef, lineDetail: 'amount-and-day' }), 'only-the-member-agrees');
 refused(w.call(ACCEPT, OTHER, { idempotencyKey: 'a-other', membershipRef, lineDetail: 'amount-and-day' }), 'membership-not-found');
 refused(w.call(ACCEPT, LERATO, { idempotencyKey: 'a-bad', membershipRef, lineDetail: 'everything' }), 'group-line-detail-not-offered');
 assert.equal(accepted(w.call(ACCEPT, LERATO, { idempotencyKey: 'a-1', membershipRef, lineDetail: 'amount-and-day' }))['stateCode'], 'member');

 refused(charge(LERATO, 'p-cash', { method: 'cash-otp' }), 'method-not-offered');
 refused(charge(LERATO, 'p-short', { amountCents: cents('vitals') - 1 }), 'amount-mismatch');
 refused(charge(LERATO, 'p-card', { cardNumber: '4111111111111111' }), 'card-number-sent');
 refused(charge(LERATO, 'p-float', { floatCents: 1 }), 'group-holds-money');
 /* Somebody never invited, asking the group to pay for her own visit and for Lerato's. */
 const hers = w.owe(authorisedVisit('APT-O', 'vitals'), 'vitals', OTHER.ref);
 refused(w.call(GROUP_PAY, OTHER, { idempotencyKey: 'p-other', groupRef, payableRef: hers, method: 'card', amountCents: cents('vitals') }), 'group-pays-only-members');
 refused(charge(OTHER, 'p-other-2'), 'group-pays-only-members');

 const paid = accepted(charge(LERATO, 'p-1'));
 assert.equal(paid['stateCode'], 'succeeded');
 assert.deepEqual(accepted(charge(LERATO, 'p-1')), paid, 'the same key is the same charge once');
 assert.equal(w.published('payment.succeeded@1').length, 1);
 refused(charge(LERATO, 'p-again'), 'already-paid');
 /* The payment Money publishes names the payable and the amount, and never the group. */
 assert.ok(!/GRP-|groupRef|GMB-|membership/.test(JSON.stringify(w.published('payment.'))), 'no group or membership on the bus');

 const view = accepted(w.call(GROUP, TREASURER, { groupRef }));
 assert.equal(view['monthTotalCents'], cents('vitals'));
 const members = view['members'] as { membershipRef: string; lines: { on: string; amountCents: number }[] }[];
 assert.deepEqual(members.find(m => m.membershipRef === membershipRef)!.lines.map(l => l.amountCents), [cents('vitals')]);
 assert.ok(!/serviceId|vitals|appointment|APT-/.test(JSON.stringify(view)), 'the group is never told what the visit was');
 const mine = accepted(w.call(MINE, LERATO))['memberships'] as { stateCode: string; paidThisMonthCents: number }[];
 assert.deepEqual(mine.map(m => [m.stateCode, m.paidThisMonthCents]), [['member', cents('vitals')]]);
 refused(w.call(MINE, LERATO, { subjectRef: OTHER.ref }), 'group-memberships-are-your-own');

 /* She leaves: the group pays for nothing new, and what it paid stays in its total. */
 assert.equal(accepted(w.call(LEAVE, LERATO, { idempotencyKey: 'l-1', membershipRef }))['stateCode'], 'left');
 refused(w.call(LEAVE, LERATO, { idempotencyKey: 'l-2', membershipRef }), 'not-a-group-member');
 refused(w.call(GROUP_PAY, LERATO, { idempotencyKey: 'p-after', groupRef, payableRef: w.owe(authorisedVisit('APT-L', 'vitals')), method: 'card', amountCents: cents('vitals') }), 'group-pays-only-members');
 assert.equal(accepted(w.call(GROUP, TREASURER, { groupRef }))['monthTotalCents'], cents('vitals'));
});

test('a member chose the month total only: the group sees her state and not a single day or amount of hers', () => {
 const w = world();
 const { groupRef, membershipRef } = stokvelWithLerato(w);
 accepted(w.call(ACCEPT, LERATO, { idempotencyKey: 'a-1', membershipRef, lineDetail: 'month-total-only' }));
 accepted(w.call(GROUP_PAY, LERATO, { idempotencyKey: 'p-1', groupRef, payableRef: w.owe(authorisedVisit('APT-T', 'wound'), 'wound'), method: 'eft', amountCents: cents('wound') }));
 const view = accepted(w.call(GROUP, TREASURER, { groupRef }));
 const mine = (view['members'] as { membershipRef: string; lines: unknown[] }[]).find(m => m.membershipRef === membershipRef)!;
 assert.deepEqual(mine.lines, []);
});

test('the limit in force stops a charge, and a settings change reaches only charges asked for after it', () => {
 const w = world();
 const { groupRef, membershipRef } = stokvelWithLerato(w);
 accepted(w.call(ACCEPT, LERATO, { idempotencyKey: 'a-1', membershipRef, lineDetail: 'amount-and-day' }));
 const limit = setting(groups.settings.monthlyLimit);
 const lowest = limit.bounds!.lowest.value;
 const first = accepted(w.call(GROUP_PAY, LERATO, { idempotencyKey: 'p-1', groupRef, payableRef: w.owe(authorisedVisit('APT-M', 'senior'), 'senior'), method: 'card', amountCents: cents('senior') }));
 assert.equal(first['stateCode'], 'succeeded');
 accepted(w.call(CHANGE, ADMIN, { idempotencyKey: 's-1', setting: limit.key, wholeNumber: lowest, reason: 'Synthetic, for the group limit test.', expectedVersion: 1 }));
 /* What was paid stays paid; the next charge is held to the lower limit, counting what was already paid this month. */
 assert.ok(cents('senior') + cents('mother') > lowest, 'the test\'s two visits pass the lowest limit together');
 refused(w.call(GROUP_PAY, LERATO, { idempotencyKey: 'p-2', groupRef, payableRef: w.owe(authorisedVisit('APT-N', 'mother'), 'mother'), method: 'card', amountCents: cents('mother') }), 'group-limit-reached');
 assert.equal(accepted(w.call(GROUP, TREASURER, { groupRef }))['monthTotalCents'], cents('senior'));
 const mine = (accepted(w.call(MINE, LERATO))['memberships'] as { limitCents: number; paidThisMonthCents: number }[])[0]!;
 assert.deepEqual([mine.limitCents, mine.paidThisMonthCents], [lowest, cents('senior')]);
});

test('an employer sees nothing about an employee\'s health: no member rows, no day, and no total below the floor', () => {
 const w = world();
 const groupRef = accepted(w.call(OPEN, EMPLOYER, { idempotencyKey: 'g-e', groupKind: 'employer' }))['groupRef'] as string;
 const invite = (i: number) => accepted(w.call(INVITE, EMPLOYER, { idempotencyKey: `i-${i}`, groupRef, subjectRef: `subj-employee-${i}` }))['membershipRef'] as string;
 const employee = (i: number): Who => ({ role: 'patient', ref: `subj-employee-${i}`, purpose: 'billing' });
 const first = invite(0);
 refused(w.call(ACCEPT, employee(0), { idempotencyKey: 'a-day', membershipRef: first, lineDetail: 'amount-and-day' }), 'employer-sees-health');
 accepted(w.call(ACCEPT, employee(0), { idempotencyKey: 'a-total', membershipRef: first, lineDetail: 'month-total-only' }));
 const below = accepted(w.call(GROUP, EMPLOYER, { groupRef }));
 assert.deepEqual(below['members'], []);
 assert.ok(!('membersAgreed' in below) && !('monthTotalCents' in below) && !('invitationsWaiting' in below), JSON.stringify(below));
 refused(w.call(GROUP, EMPLOYER, { groupRef, members: 'all' }), 'employer-sees-health');

 const floor = programmes.floor.minimumCohort;
 for (let i = 1; i < floor; i++) accepted(w.call(ACCEPT, employee(i), { idempotencyKey: `a-${i}`, membershipRef: invite(i), lineDetail: 'month-total-only' }));
 const above = accepted(w.call(GROUP, EMPLOYER, { groupRef }));
 assert.equal(above['membersAgreed'], floor);
 assert.deepEqual(above['members'], [], 'an employer is never handed member rows, however many agreed');
});

test('a claim from a signed review, with the patient\'s agreement, stops at "Not submitted: no switching partner is connected"', () => {
 const w = world();
 const payableRef = w.owe('APT-C1');
 w.finish('APT-C1');
 w.sign('RV-C1');
 const drafted = accepted(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-1', payableRef }));
 assert.deepEqual([drafted['stateCode'], drafted['codeSetAdopted']], ['drafted', false]);
 const claimRef = drafted['claimRef'] as string;
 refused(w.call(SUBMIT, DOCTOR, { idempotencyKey: 's-early', claimRef }), 'claim-without-consent');
 refused(w.call(CONSENT, OTHER, { idempotencyKey: 'k-other', claimRef }), 'claim-not-found');
 refused(w.call(CONSENT, LERATO, { idempotencyKey: 'k-grant', claimRef, grantRef: 'synthetic' }), 'scheme-told-about-a-grant');
 const agreed = accepted(w.call(CONSENT, LERATO, { idempotencyKey: 'k-1', claimRef }));
 assert.equal(agreed['consentExpiresOn'], addDays('2026-09-14', setting(claims.consent.setting).default.value as number));
 refused(w.call(CONSENT, LERATO, { idempotencyKey: 'k-2', claimRef }), 'claim-consented-already');

 const stopped = w.call(SUBMIT, DOCTOR, { idempotencyKey: 's-1', claimRef });
 refused(stopped, claims.stop.refusal);
 assert.equal(stopped.body['message'], claims.stop.words);
 refused(w.call(SUBMIT, BACK_OFFICE, { idempotencyKey: 's-2', claimRef }), claims.stop.refusal);
 refused(w.call(SUBMIT, ANOTHER_DOCTOR, { idempotencyKey: 's-3', claimRef }), 'claim-not-found');

 const mine = (accepted(w.call(CLAIMS, LERATO))['claims'] as Record<string, unknown>[])[0]!;
 assert.deepEqual([mine['stateCode'], mine['notSubmittedBecause'], mine['codeSetAdopted']], ['consented', claims.stop.refusal, false]);
 refused(w.call(CLAIMS, LERATO, { subjectRef: OTHER.ref }), 'claims-are-your-own');
 assert.equal(w.published('claim.').length, 0, 'nothing about a claim is published: nothing was sent');
});

test('a claim is refused for a visit that did not happen, a review nobody signed, another doctor\'s review, a typed code and a diagnosis', () => {
 const w = world();
 const unfinished = w.owe('APT-U');
 refused(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-u', payableRef: unfinished }), 'claim-visit-not-finished');
 const unsigned = w.owe('APT-S');
 w.finish('APT-S');
 refused(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-s', payableRef: unsigned }), 'claim-review-not-signed');
 w.sign('RV-S', ANOTHER_DOCTOR.ref);
 refused(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-o', payableRef: unsigned }), 'claim-review-not-yours');
 refused(w.call(DRAFT, ANOTHER_DOCTOR, { idempotencyKey: 'c-t', payableRef: unsigned, tariffCode: 'typed' }), 'claim-code-typed');
 refused(w.call(DRAFT, ANOTHER_DOCTOR, { idempotencyKey: 'c-d', payableRef: unsigned, diagnosis: 'typed' }), 'diagnosis-sent-to-money');
 refused(w.call(DRAFT, ANOTHER_DOCTOR, { idempotencyKey: 'c-n', payableRef: 'PB-NOTHING' }), 'payable-not-found');
 assert.equal(w.call(DRAFT, LERATO, { idempotencyKey: 'c-p', payableRef: unsigned }).body['error'], 'caller-not-allowed');
 /* A review about somebody else, by the calling doctor, does not sign this visit. */
 w.sign('RV-ELSE', DOCTOR.ref, OTHER.ref);
 refused(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-e', payableRef: unsigned }), 'claim-review-not-yours');
});

test('a duplicate claim replays under its key, and a second key for the same visit drafts nothing', () => {
 const w = world();
 const payableRef = w.owe('APT-D');
 w.finish('APT-D');
 w.sign('RV-D');
 const first = accepted(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-1', payableRef }));
 assert.deepEqual(accepted(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-1', payableRef })), first);
 refused(w.call(DRAFT, DOCTOR, { idempotencyKey: 'c-2', payableRef }), 'claim-already-drafted');
 assert.equal((accepted(w.call(CLAIMS, DOCTOR))['claims'] as unknown[]).length, 1);
});

test('a settings change does not move an agreement already given, and an agreement that ran out stops a claim', () => {
 const w = world();
 const draftAndAgree = (apt: string, key: string) => {
  const payableRef = w.owe(apt);
  w.finish(apt);
  w.sign(`RV-${apt}`);
  const claimRef = accepted(w.call(DRAFT, DOCTOR, { idempotencyKey: `c-${key}`, payableRef }))['claimRef'] as string;
  return { claimRef, agreed: accepted(w.call(CONSENT, LERATO, { idempotencyKey: `k-${key}`, claimRef })) };
 };
 const days = setting(claims.consent.setting);
 const lowest = days.bounds!.lowest.value;
 const before = draftAndAgree('APT-K1', '1');
 refused(w.call(SUBMIT, DOCTOR, { idempotencyKey: 's-0', claimRef: before.claimRef }), claims.stop.refusal);
 accepted(w.call(CHANGE, ADMIN, { idempotencyKey: 's-1', setting: days.key, wholeNumber: lowest, reason: 'Synthetic, for the claim agreement test.', expectedVersion: 1 }));
 const after = draftAndAgree('APT-K2', '2');
 assert.equal(after.agreed['consentExpiresOn'], addDays('2026-09-14', lowest));
 const listed = accepted(w.call(CLAIMS, LERATO))['claims'] as { claimRef: string; consentExpiresOn: string; stateCode: string }[];
 const kept = listed.find(c => c.claimRef === before.claimRef)!;
 assert.deepEqual([kept.consentExpiresOn, kept.stateCode], [before.agreed['consentExpiresOn'], 'consented'], 'the claim asked to be sent before the change keeps its day and its state');
 refused(w.call(SUBMIT, DOCTOR, { idempotencyKey: 's-a', claimRef: before.claimRef }), claims.stop.refusal);

 w.runtime.advance(DAY * (lowest + 1));
 refused(w.call(SUBMIT, DOCTOR, { idempotencyKey: 's-b', claimRef: after.claimRef }), 'claim-consent-expired');
 refused(w.call(SUBMIT, DOCTOR, { idempotencyKey: 's-c', claimRef: before.claimRef }), claims.stop.refusal);
});

test('without an adopted code set a claim is refused at the code, even past a switching partner, and nothing marks it sent', () => {
 /* The ledger alone, told for this test only that a partner stands behind the door, so the gate after it answers. */
 const tables = memoryTables();
 const money = createMoney({ tables, simulation: true, clock: () => new Date(START), claimConsentDays: () => 30, claimSwitchConnected: () => true });
 money.hear({ type: 'appointment.booked', version: 2, subjectRef: LERATO.ref, payload: { appointmentRef: 'APT-X', clinicianRef: NURSE.ref, scheduledFor: START, serviceId: 'vitals' } });
 money.hear({ type: 'visit.billable', version: 1, subjectRef: LERATO.ref, payload: { appointmentRef: 'APT-X', serviceId: 'vitals', clinicianRef: NURSE.ref } });
 money.hear({ type: 'review.billable', version: 1, subjectRef: LERATO.ref, payload: { reviewRef: 'RV-X', reviewedByRef: DOCTOR.ref, feeCode } });
 const drafted = money.draftClaim({ role: 'doctor', subjectRef: DOCTOR.ref }, { idempotencyKey: 'c', payableRef: 'PB-APT-X' });
 if (isRefusal(drafted)) throw new Error(drafted.statement);
 const agreed = money.consentToClaim({ role: 'patient', subjectRef: LERATO.ref }, { idempotencyKey: 'k', claimRef: drafted.claimRef });
 if (isRefusal(agreed)) throw new Error(agreed.statement);
 assert.equal(money.submitClaim({ role: 'doctor', subjectRef: DOCTOR.ref }, { idempotencyKey: 's', claimRef: drafted.claimRef }).id, 'claim-without-an-adopted-code');
 assert.deepEqual(tables.claims.all().map(c => c.stateCode), ['consented']);
});

test('the desk lists held cash payments by payment and wrong codes, and names nobody', () => {
 const w = world();
 const payableRef = w.owe('APT-H');
 const cash = accepted(w.call(PAY, LERATO, { idempotencyKey: 'cash-1', payableRef, method: 'cash-otp', amountCents: cents('vitals') }));
 w.finish('APT-H');
 const code = String(cash['cashCode']);
 const wrong = code.split('').map(d => String((Number(d) + 1) % 10)).join('');
 for (let i = 0; i < moneyContract.cash.attemptLimit; i++) w.call(CASH, NURSE, { idempotencyKey: `w-${i}`, paymentRef: cash['paymentRef'], code: wrong });
 const held = accepted(w.call(HELD, DESK))['payments'] as { paymentRef: string; wrongAttempts: number; heldAt: string }[];
 assert.deepEqual(held.map(h => [h.paymentRef, h.wrongAttempts]), [[cash['paymentRef'], moneyContract.cash.attemptLimit]]);
 assert.ok(Number.isFinite(Date.parse(held[0]!.heldAt)));
 refused(w.call(HELD, DESK, { subjectRef: LERATO.ref }), 'held-cash-list-names-nobody');
 assert.equal(w.call(HELD, NURSE).body['error'], 'caller-not-allowed');
});
