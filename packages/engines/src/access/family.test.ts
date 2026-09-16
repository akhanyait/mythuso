/* The three family arrangements on the runtime: a household that grants nothing, a sponsorship that reads
   nothing about the care, and a split whose shares have to add up and be accepted one at a time.

   Every refusal is asserted by the sentence the contract declares rather than by a status code, because the
   sentence is what a person is shown and a status is what a client logs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../catalog/apis/access.json' with { type: 'json' };
import household from '../../../catalog/household.json' with { type: 'json' };
import programmes from '../../../catalog/programmes.json' with { type: 'json' };
import services from '../../../catalog/services.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EngineContext, type RouteKey } from '../runtime/index.ts';
import { payableShares, proposeSplit, sharesFromParts, splitState } from './domain/bill-split.ts';
import { SERVICE_NAMED, statementFor, type Sponsorship } from './domain/sponsorship.ts';
import { engine } from './engine.ts';

const START = '2026-09-16T09:00:00+02:00';
const OPEN: RouteKey = 'POST /v1/access/households@1';
const ADD: RouteKey = 'POST /v1/access/household-memberships@1';
const ROSTER: RouteKey = 'GET /v1/access/households@1';
const OFFER: RouteKey = 'POST /v1/access/sponsors@2';
const ANSWER: RouteKey = 'POST /v1/access/sponsors/{sponsorshipRef}/answer@1';
const STATEMENT: RouteKey = 'GET /v1/access/sponsors@1';
const SPLIT: RouteKey = 'POST /v1/access/bill-splits@2';
const ACCEPT: RouteKey = 'POST /v1/access/bill-splits/{splitRef}/accept@1';

const statement = (route: string, id: string) =>
 access.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;

/* Money, standing in: a tick that publishes what a test queued, so a payment reaches Access over the real bus
   and is held to payment.succeeded@1's frozen shape on the way. */
function world(at = START) {
 const queue: Record<string, unknown>[] = [];
 const money = defineEngine({
  id: 'money', routes: {}, subscriptions: {}, store: { schema: '' },
  tick: (ctx: EngineContext) => { for (const sent of queue.splice(0)) ctx.publish('payment.succeeded@1', sent.payload as Record<string, unknown>, { subjectRef: String(sent.subjectRef), actorRole: 'sponsor', purposeOfUse: 'billing' }); }
 });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, money], dataDirectory: MEMORY, clock: createClock(at) });
 const pay = (subjectRef: string, payload: Record<string, unknown>) => { queue.push({ subjectRef, payload }); runtime.advance(1); };
 return { runtime, pay };
}
type Runtime = ReturnType<typeof world>['runtime'];

const thando = { role: 'patient', ref: 'subj-thando' };
const sipho = { role: 'patient', ref: 'subj-sipho' };
const lebo = { role: 'patient', ref: 'subj-lebo' };
const zodwa = { role: 'sponsor', ref: 'subj-zodwa' };
const subjects = { subjectAccess: 'subject-access', billing: 'billing' } as const;

const openHouse = (runtime: Runtime, fields: Record<string, unknown> = { memberSubjectRefs: [sipho.ref, lebo.ref] }) =>
 runtime.call(OPEN, { ...thando, purpose: subjects.subjectAccess, fields });

test('a household is opened, read by the people on it, and refused to anybody else', () => {
 const { runtime } = world();
 const opened = openHouse(runtime);
 assert.equal(opened.status, 200);
 const householdRef = String(opened.body.householdRef);

 const mine = runtime.call(ROSTER, { ...thando, purpose: subjects.subjectAccess, fields: { householdRef } });
 assert.equal(mine.status, 200);
 const [only] = mine.body.households as { householdRef: string; members: Record<string, unknown>[] }[];
 assert.equal(only!.householdRef, householdRef);
 /* The opener is on the roster she made, whether or not she named herself. */
 assert.deepEqual(only!.members.map(m => m.memberSubjectRef).sort(), [lebo.ref, sipho.ref, thando.ref].sort());
 /* Nothing in a roster line is a permission, a name or a relationship. Asserted on the keys that came back,
    because a field nobody declared is exactly how a roster starts becoming a grant. */
 for (const member of only!.members) assert.deepEqual(Object.keys(member).sort(), ['addedBySubjectRef', 'addedOnDay', 'memberSubjectRef']);

 const stranger = runtime.call(ROSTER, { role: 'patient', ref: 'subj-stranger', purpose: subjects.subjectAccess, fields: { householdRef } });
 assert.equal(stranger.status, 403);
 assert.equal(stranger.body.message, statement(ROSTER, 'not-in-this-household'));
 /* And somebody on no roster at all is answered with an empty list rather than a refusal: there is no
    household they were kept out of. */
 assert.deepEqual(runtime.call(ROSTER, { role: 'patient', ref: 'subj-stranger', purpose: subjects.subjectAccess, fields: {} }).body.households, []);
 runtime.close();
});

test('a request that tries to attach a scope or a grant to a membership is refused in the route\'s own words', () => {
 const { runtime } = world();
 for (const attached of ['scope', 'grantedUntil', 'recordAccess', 'sharedCategories', 'permission']) {
  const refused = openHouse(runtime, { memberSubjectRefs: [sipho.ref], [attached]: 'clinical' });
  assert.equal(refused.status, 422, attached);
  assert.equal(refused.body.message, statement(OPEN, 'membership-is-not-consent'), attached);
 }
 const householdRef = String(openHouse(runtime).body.householdRef);
 const refusedAdd = runtime.call(ADD, { ...thando, purpose: subjects.subjectAccess, fields: { idempotencyKey: 'k-add-1', householdRef, memberSubjectRef: 'subj-amahle', scope: 'clinical' } });
 assert.equal(refusedAdd.status, 422);
 assert.equal(refusedAdd.body.message, statement(ADD, 'membership-is-not-consent'));
 /* Nothing was written by the refused request: the roster is what it was. */
 const roster = runtime.call(ROSTER, { ...thando, purpose: subjects.subjectAccess, fields: { householdRef } });
 assert.equal((roster.body.households as { members: unknown[] }[])[0]!.members.length, 3);
 runtime.close();
});

test('only somebody on a roster adds to it, and adding the same person twice adds one line', () => {
 const { runtime } = world();
 const householdRef = String(openHouse(runtime).body.householdRef);
 const outsider = runtime.call(ADD, { role: 'patient', ref: 'subj-stranger', purpose: subjects.subjectAccess, fields: { idempotencyKey: 'k-out', householdRef, memberSubjectRef: 'subj-amahle' } });
 assert.equal(outsider.status, 403);
 assert.equal(outsider.body.message, statement(ADD, 'not-in-this-household'));

 const added = runtime.call(ADD, { ...sipho, purpose: subjects.subjectAccess, fields: { idempotencyKey: 'k-add-1', householdRef, memberSubjectRef: 'subj-amahle' } });
 assert.equal(added.status, 200);
 assert.equal(added.body.memberSubjectRef, 'subj-amahle');
 runtime.call(ADD, { ...sipho, purpose: subjects.subjectAccess, fields: { idempotencyKey: 'k-add-2', householdRef, memberSubjectRef: 'subj-amahle' } });
 const roster = runtime.call(ROSTER, { ...thando, purpose: subjects.subjectAccess, fields: { householdRef } });
 assert.equal((roster.body.households as { members: unknown[] }[])[0]!.members.length, 4);
 runtime.close();
});

test('a sponsorship names a member of a household, starts offered, and is answered only by the person being paid for', () => {
 const { runtime } = world();
 const householdRef = String(openHouse(runtime).body.householdRef);
 const stranger = runtime.call(OFFER, { ...zodwa, purpose: subjects.billing, fields: { idempotencyKey: 'sp-0', householdRef, sponsoredSubjectRef: 'subj-nobody' } });
 assert.equal(stranger.status, 422);
 assert.equal(stranger.body.message, statement(OFFER, 'not-a-household-member'));

 const offered = runtime.call(OFFER, { ...zodwa, purpose: subjects.billing, fields: { idempotencyKey: 'sp-1', householdRef, sponsoredSubjectRef: thando.ref } });
 assert.equal(offered.status, 200);
 assert.equal(offered.body.stateCode, 'offered');
 /* It starts at the default, which is programmes.json's and not this engine's. */
 assert.equal(offered.body.lineDetailId, programmes.sponsor.lineDetail.find(d => d.isDefault)!.id);
 const sponsorshipRef = String(offered.body.sponsorshipRef);

 /* The sponsor's role is not on this route at all, so the binder turns them away before the handler runs. */
 assert.equal(runtime.call(ANSWER, { ...zodwa, purpose: subjects.billing, fields: { idempotencyKey: 'an-0', sponsorshipRef, answerCode: 'agree' } }).status, 403);
 /* And a patient who is not the one being paid for meets the route's own refusal. */
 const byAnother = runtime.call(ANSWER, { ...sipho, purpose: subjects.billing, fields: { idempotencyKey: 'an-0b', sponsorshipRef, answerCode: 'agree' } });
 assert.equal(byAnother.status, 403);
 assert.equal(byAnother.body.message, statement(ANSWER, 'only-the-recipient-answers'));

 const nonsense = runtime.call(ANSWER, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'an-1', sponsorshipRef, answerCode: 'maybe' } });
 assert.equal(nonsense.status, 422);
 assert.equal(nonsense.body.message, statement(ANSWER, 'answer-not-offered'));

 assert.equal(runtime.call(ANSWER, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'an-2', sponsorshipRef, answerCode: 'agree' } }).body.stateCode, 'agreed');
 assert.equal(runtime.call(ANSWER, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'an-3', sponsorshipRef, answerCode: 'stop' } }).body.stateCode, 'stopped');
 runtime.close();
});

test('a sponsor is refused for asking what the care was, and is answered with billing and nothing else', () => {
 const { runtime, pay } = world();
 const householdRef = String(openHouse(runtime).body.householdRef);
 for (const asked of ['serviceId', 'diagnosis', 'visitSummary', 'findings']) {
  const refused = runtime.call(OFFER, { ...zodwa, purpose: subjects.billing, fields: { idempotencyKey: `sp-${asked}`, householdRef, sponsoredSubjectRef: thando.ref, [asked]: 'anything' } });
  assert.equal(refused.status, 403, asked);
  assert.equal(refused.body.message, statement(OFFER, 'sponsor-reads-nothing'), asked);
 }
 const sponsorshipRef = String(runtime.call(OFFER, { ...zodwa, purpose: subjects.billing, fields: { idempotencyKey: 'sp-1', householdRef, sponsoredSubjectRef: thando.ref } }).body.sponsorshipRef);
 runtime.call(ANSWER, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'an-1', sponsorshipRef, answerCode: 'agree' } });

 pay(thando.ref, { paymentRef: 'SIM-PAY-1', payableRef: 'SIM-PAYABLE-1', amountCents: 85_000, method: 'card' });
 const read = runtime.call(STATEMENT, { ...zodwa, purpose: subjects.billing, fields: { sponsorshipRef } });
 assert.equal(read.status, 200);
 const [one] = read.body.sponsorships as { paidCents: number; lines: Record<string, unknown>[] }[];
 assert.equal(one!.paidCents, 85_000);
 /* A day and an amount. The bus carries no service, so the statement names none — and could not. */
 assert.deepEqual(one!.lines.map(line => Object.keys(line).sort()), [['amountCents', 'paidOnDay']]);

 const refusedRead = runtime.call(STATEMENT, { ...zodwa, purpose: subjects.billing, fields: { sponsorshipRef, diagnosis: 'anything' } });
 assert.equal(refusedRead.body.message, statement(STATEMENT, 'sponsor-reads-nothing'));
 const notTheirs = runtime.call(STATEMENT, { role: 'sponsor', ref: 'subj-someone-else', purpose: subjects.billing, fields: { sponsorshipRef } });
 assert.equal(notTheirs.status, 403);
 assert.equal(notTheirs.body.message, statement(STATEMENT, 'sponsorship-not-yours'));
 runtime.close();
});

test('a payment is kept for a statement only where the person has agreed to a sponsorship', () => {
 const { runtime, pay } = world();
 const householdRef = String(openHouse(runtime).body.householdRef);
 const sponsorshipRef = String(runtime.call(OFFER, { ...zodwa, purpose: subjects.billing, fields: { idempotencyKey: 'sp-1', householdRef, sponsoredSubjectRef: thando.ref } }).body.sponsorshipRef);
 /* Offered and not yet agreed: nothing is kept, so agreeing later does not hand over what came before. */
 pay(thando.ref, { paymentRef: 'SIM-PAY-EARLY', payableRef: 'SIM-PAYABLE-0', amountCents: 40_000, method: 'card' });
 runtime.call(ANSWER, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'an-1', sponsorshipRef, answerCode: 'agree' } });
 pay(thando.ref, { paymentRef: 'SIM-PAY-1', payableRef: 'SIM-PAYABLE-1', amountCents: 85_000, method: 'card' });
 /* Somebody else's payment is never kept at all. */
 pay(sipho.ref, { paymentRef: 'SIM-PAY-2', payableRef: 'SIM-PAYABLE-2', amountCents: 99_000, method: 'card' });
 const [one] = runtime.call(STATEMENT, { ...zodwa, purpose: subjects.billing, fields: { sponsorshipRef } }).body.sponsorships as { paidCents: number }[];
 assert.equal(one!.paidCents, 85_000);
 runtime.close();
});

test('the service is on a statement line only where the recipient\'s own line detail names it', () => {
 const base: Sponsorship = {
  sponsorshipRef: 'SIM-SP-1', householdRef: 'SIM-HH-1', sponsoredSubjectRef: thando.ref, payerSubjectRef: zodwa.ref,
  stateCode: 'agreed', lineDetailId: programmes.sponsor.lineDetail.find(d => d.isDefault)!.id, offeredOnDay: '2026-09-01', answeredOnDay: '2026-09-01'
 };
 const lines = [{ paidOnDay: '2026-09-10', amountCents: 85_000, serviceId: 'senior' }];
 assert.deepEqual(statementFor(base, lines), [{ paidOnDay: '2026-09-10', amountCents: 85_000 }]);
 assert.deepEqual(statementFor({ ...base, lineDetailId: SERVICE_NAMED }, lines), lines);
 /* The switch is hers, and it is read from programmes.json rather than declared here. */
 assert.equal(household.sponsorship.billingLine.serviceNamedBy, SERVICE_NAMED);
 assert.ok(programmes.sponsor.lineDetail.some(d => d.id === SERVICE_NAMED && !d.isDefault));
});

test('a split is refused unless the shares add up, and each payer accepts their own before it is payable', () => {
 const { runtime } = world();
 const visit = services.find(s => s.id === 'vitals')!;
 const amountCents = visit.price * 100;
 const halves = sharesFromParts(amountCents, [{ payerSubjectRef: thando.ref, parts: 1 }, { payerSubjectRef: sipho.ref, parts: 1 }]);
 const propose = (fields: Record<string, unknown>) => runtime.call(SPLIT, { ...thando, purpose: subjects.billing, fields });

 const short = propose({ idempotencyKey: 'bs-0', payableRef: 'SIM-PAYABLE-1', amountCents, shares: halves.map(s => ({ ...s, amountCents: s.amountCents - 1 })) });
 assert.equal(short.status, 422);
 assert.equal(short.body.message, statement(SPLIT, 'shares-must-total'));

 const twice = propose({ idempotencyKey: 'bs-1', payableRef: 'SIM-PAYABLE-1', amountCents, shares: [{ payerSubjectRef: thando.ref, amountCents: amountCents - 100 }, { payerSubjectRef: thando.ref, amountCents: 100 }] });
 assert.equal(twice.status, 422);
 assert.equal(twice.body.message, statement(SPLIT, 'one-share-each'));

 const asked = propose({ idempotencyKey: 'bs-2', payableRef: 'SIM-PAYABLE-1', amountCents, shares: halves, serviceId: 'vitals' });
 assert.equal(asked.status, 403);
 assert.equal(asked.body.message, statement(SPLIT, 'split-shows-no-care'));

 const proposed = propose({ idempotencyKey: 'bs-3', payableRef: 'SIM-PAYABLE-1', amountCents, shares: halves });
 assert.equal(proposed.status, 200);
 assert.equal(proposed.body.stateCode, 'proposed');
 /* A share carries who owes it, what they owe and where it stands. Nothing about the visit is in the shape. */
 for (const share of proposed.body.shares as Record<string, unknown>[]) assert.deepEqual(Object.keys(share).sort(), ['amountCents', 'payerSubjectRef', 'stateCode']);
 const splitRef = String(proposed.body.splitRef);

 const stranger = runtime.call(ACCEPT, { role: 'patient', ref: 'subj-stranger', purpose: subjects.billing, fields: { idempotencyKey: 'ac-0', splitRef, amountCents: halves[0]!.amountCents } });
 assert.equal(stranger.status, 403);
 assert.equal(stranger.body.message, statement(ACCEPT, 'not-your-share'));

 const wrong = runtime.call(ACCEPT, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'ac-1', splitRef, amountCents: 1 } });
 assert.equal(wrong.status, 409);
 assert.equal(wrong.body.message, statement(ACCEPT, 'share-amount-differs'));

 const first = runtime.call(ACCEPT, { ...thando, purpose: subjects.billing, fields: { idempotencyKey: 'ac-2', splitRef, amountCents: halves.find(s => s.payerSubjectRef === thando.ref)!.amountCents } });
 assert.equal(first.body.stateCode, 'proposed');
 assert.equal(first.body.acceptedCount, 1);
 const second = runtime.call(ACCEPT, { ...sipho, purpose: subjects.billing, fields: { idempotencyKey: 'ac-3', splitRef, amountCents: halves.find(s => s.payerSubjectRef === sipho.ref)!.amountCents } });
 assert.equal(second.body.stateCode, 'payable');
 assert.equal(second.body.acceptedCount, second.body.shareCount);
 runtime.close();
});

test('the shares of a split come out of the payable, and only an accepted share is offered for payment', () => {
 const visit = services.find(s => s.id === 'senior')!;
 const amountCents = visit.price * 100;
 /* Three parts of an odd amount still total the whole: the remainder goes to the first share. */
 const thirds = sharesFromParts(amountCents + 2, [{ payerSubjectRef: 'a', parts: 1 }, { payerSubjectRef: 'b', parts: 1 }, { payerSubjectRef: 'c', parts: 1 }]);
 assert.equal(thirds.reduce((total, s) => total + s.amountCents, 0), amountCents + 2);

 const halves = sharesFromParts(amountCents, [{ payerSubjectRef: 'a', parts: 1 }, { payerSubjectRef: 'b', parts: 1 }]);
 const outcome = proposeSplit({ splits: [] }, { idempotencyKey: 'k', payableRef: 'SIM-PAYABLE-9', amountCents, shares: halves, proposedBySubjectRef: 'a', sent: [], now: new Date(START) });
 assert.equal(outcome.refused, false);
 const split = (outcome as { value: { split: import('./domain/bill-split.ts').Split } }).value.split;
 assert.deepEqual(payableShares(split), []);
 assert.equal(splitState(split), 'proposed');
 const accepted = { ...split, shares: split.shares.map(s => ({ ...s, stateCode: 'accepted' as const, acceptedOnDay: '2026-09-16' })) };
 assert.equal(payableShares(accepted).length, 2);
 assert.equal(splitState(accepted), 'payable');
});
