/* The booking state machine and every refusal it answers with, against the contracts themselves.

   The assertions compare with packages/catalog rather than with sentences typed here, so a reworded
   refusal breaks the domain loudly — routeRefusal throws — rather than leaving a test that agrees with
   a copy. The clock is fixed and passed in: 10:00 in Johannesburg on 14 September 2026, so tomorrow is
   the first offered day. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import access from '../../../../catalog/apis/access.json' with { type: 'json' };
import cancellation from '../../../../catalog/cancellation.json' with { type: 'json' };
import contract from '../../../../catalog/booking.json' with { type: 'json' };
import events from '../../../../catalog/events.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import {
 cancelBooking, confirmBooking, emptyLedger, holdsOf, offeredDays, offeredSlots, personOptions, readBooking, requestBooking,
 stateFromEvents, windowOf, type Candidate, type Ledger
} from './booking.ts';
import type { AccessEvent, Outcome } from './contract.ts';

const now = new Date('2026-09-14T10:00:00+02:00');
const statement = (route: string, id: string) =>
 access.routes.find(r => `${r.method} ${r.path}@${r.version}` === route)!.refusals.find(r => r.id === id)!.statement;
const BOOK = 'POST /v1/access/bookings@1';
const CANCEL = 'POST /v1/access/bookings/{bookingRef}/cancel@1';

const nurse = (nurseRef: string, over: Partial<Candidate>): Candidate =>
 ({ nurseRef, name: nurseRef, zone: 'Rosebank', covered: true, badgeCurrent: true, notOfferedBecause: null, distanceKm: 3, ...over });
const candidates: Candidate[] = [
 nurse('N-201', { zone: 'Soweto', distanceKm: 14 }),
 nurse('N-203', { zone: 'Tembisa', covered: false, badgeCurrent: false, notOfferedBecause: 'Book outside a zone dispatch can reach.', distanceKm: null }),
 nurse('N-204', { zone: 'Soweto', badgeCurrent: false, notOfferedBecause: 'Offer a nurse whose simulated vetting has lapsed.', distanceKm: 14 }),
 nurse('N-205', { distanceKm: 2.9 })
];
const context = { now, candidates, visitCovered: true };
const ask = (ledger: Ledger, slotRef: string, key = 'k-1', subjectRef = 'subject-lerato', serviceId = 'wound') =>
 requestBooking(ledger, { idempotencyKey: key, subjectRef, serviceId, mode: 'home', slotRef, actorRole: 'patient' }, context);
function ok<T>(outcome: Outcome<T>) {
 if (outcome.refused) assert.fail(`refused: ${outcome.id} — ${outcome.statement}`);
 return outcome;
}
const firstDay = offeredDays(now)[0]!;

test('the days on offer start tomorrow in Johannesburg and there are as many as scheduling.json offers', () => {
 const days = offeredDays(now);
 assert.equal(days.length, scheduling.offer.days);
 assert.equal(days[0], '2026-09-15');
 // Just before midnight UTC is already the next day in Johannesburg, and the offer moves with it.
 assert.equal(offeredDays(new Date('2026-09-14T22:30:00Z'))[0], '2026-09-16');
});

test('only nurses with a current badge in covered suburbs are offered, nearest first, and the rest keep their reasons', () => {
 const options = personOptions(candidates, 'N-204');
 assert.deepEqual(options.offered.map(c => c.nurseRef), ['N-205', 'N-201']);
 assert.deepEqual(options.notOffered.map(c => c.nurseRef).sort(), ['N-203', 'N-204']);
 assert.ok(options.notOffered.every(c => c.notOfferedBecause));
 // The nurse this patient saw last has lapsed: she is named, and not offered.
 assert.deepEqual(options.previous && { ref: options.previous.candidate.nurseRef, offered: options.previous.offered }, { ref: 'N-204', offered: false });
 assert.equal(personOptions(candidates, null).previous, null);
});

test('the offer is every day and hour scheduling.json gives, and as soon as possible belongs to whoever is nearest', () => {
 const nearest = offeredSlots({ now, serviceId: 'wound', kind: 'scheduled', choice: { kind: 'nearest' }, holds: [] });
 assert.equal(nearest.length, scheduling.offer.days * scheduling.offer.slots.length);
 assert.ok(nearest.every(s => s.nurseRef === null && scheduling.offer.slots.includes(s.start!)));
 assert.equal(offeredSlots({ now, serviceId: 'wound', kind: 'asap', choice: { kind: 'nearest' }, holds: [] }).length, 1);
 assert.deepEqual(offeredSlots({ now, serviceId: 'wound', kind: 'asap', choice: { kind: 'named', nurseRef: 'N-205' }, holds: [] }), []);
});

test('a booking is requested against an offered hour and publishes booking.requested with exactly the frozen payload', () => {
 const outcome = ok(ask(emptyLedger, `${firstDay}T09:00~N-205`));
 const { booking } = outcome.value;
 assert.equal(booking.state, 'requested');
 assert.match(booking.bookingRef, /^SIM-BKG-/);
 assert.equal(booking.requestedFor, `${firstDay}T09:00:00+02:00`);
 assert.equal(outcome.events.length, 1);
 const [event] = outcome.events as AccessEvent[];
 const frozen = events.events.find(e => e.type === 'booking.requested' && e.version === 1)!;
 assert.equal(event!.type, 'booking.requested');
 assert.deepEqual(Object.keys(event!.payload).sort(), frozen.payload.map(f => f.field).sort());
 for (const never of [...frozen.neverCarries.map(n => n.field), ...events.neverInEnvelope.map(n => n.field)]) {
  assert.ok(!(never in event!.payload) && !(never in event!), `booking.requested carries ${never}`);
 }
});

test('a slot that was never offered is refused in the route’s own words', () => {
 for (const invented of [`${firstDay}T13:00~nearest`, '2026-09-14T09:00~nearest', 'tomorrow at nine', `${firstDay}T09:00~N-999`]) {
  const refused = ask(emptyLedger, invented);
  assert.ok(refused.refused, invented);
  assert.equal(refused.id, 'slot-not-offered');
  assert.equal(refused.status, 409);
  assert.equal(refused.statement, statement(BOOK, 'slot-not-offered'));
 }
});

test('asking for a nurse whose badge is not current is refused, however the slot reference was built', () => {
 const refused = ask(emptyLedger, `${firstDay}T09:00~N-204`);
 assert.ok(refused.refused);
 assert.equal(refused.id, 'nurse-badge-not-current');
 assert.equal(refused.statement, contract.refusals.find(r => r.id === 'nurse-badge-not-current')!.sentence);
});

test('an hour already held against a named nurse is no longer offered for her, and still is for whoever is nearest', () => {
 const first = ok(ask(emptyLedger, `${firstDay}T09:00~N-205`)).value.ledger;
 assert.deepEqual(holdsOf(first), [{ nurseRef: 'N-205', date: firstDay, start: '09:00', minutes: 40 }]);
 const again = ask(first, `${firstDay}T09:00~N-205`, 'k-2', 'subject-nomsa');
 assert.ok(again.refused);
 assert.equal(again.id, 'slot-not-offered');
 assert.equal(offeredSlots({ now, serviceId: 'wound', kind: 'scheduled', choice: { kind: 'named', nurseRef: 'N-205' }, holds: holdsOf(first) }).length, scheduling.offer.days * scheduling.offer.slots.length - 1);
 ok(ask(first, `${firstDay}T09:00~nearest`, 'k-3', 'subject-nomsa'));
 ok(ask(first, `${firstDay}T10:00~N-205`, 'k-4', 'subject-nomsa'));
});

test('a service not offered where the visit would be is refused', () => {
 const later = ask(emptyLedger, `${firstDay}T09:00~nearest`, 'k-1', 'subject-lerato', 'screening');
 assert.ok(later.refused);
 assert.equal(later.id, 'service-not-here');
 assert.equal(later.statement, statement(BOOK, 'service-not-here'));
 const uncovered = requestBooking(emptyLedger, { idempotencyKey: 'k', subjectRef: 's', serviceId: 'wound', mode: 'home', slotRef: `${firstDay}T09:00~nearest`, actorRole: 'patient' }, { ...context, visitCovered: false });
 assert.ok(uncovered.refused);
 assert.equal(uncovered.id, 'service-not-here');
});

test('the same idempotency key is the same act once, and never another family’s booking', () => {
 const first = ok(ask(emptyLedger, `${firstDay}T09:00~N-205`));
 const replay = ok(ask(first.value.ledger, `${firstDay}T09:00~N-205`));
 assert.equal(replay.value.booking.bookingRef, first.value.booking.bookingRef);
 assert.equal(replay.events.length, 0);
 assert.equal(replay.value.ledger.bookings.length, 1);
 const stranger = ok(ask(first.value.ledger, `${firstDay}T11:00~nearest`, 'k-1', 'subject-somebody-else'));
 assert.notEqual(stranger.value.booking.bookingRef, first.value.booking.bookingRef);
 const keyless = requestBooking(emptyLedger, { idempotencyKey: '', subjectRef: 's', serviceId: 'wound', mode: 'home', slotRef: `${firstDay}T09:00~nearest`, actorRole: 'patient' }, context);
 assert.ok(keyless.refused);
 assert.equal(keyless.id, 'idempotency-key-required');
});

test('requested becomes confirmed once, with the hour held, and nothing moves backwards', () => {
 const booked = ok(ask(emptyLedger, `${firstDay}T09:00~N-205`)).value;
 const confirmed = ok(confirmBooking(booked.ledger, booked.booking.bookingRef, now));
 assert.equal(confirmed.value.booking.state, 'confirmed');
 assert.deepEqual(confirmed.events.map(e => e.type), ['booking.confirmed']);
 assert.deepEqual(confirmed.events[0]!.payload, { bookingRef: booked.booking.bookingRef, scheduledFor: booked.booking.requestedFor });
 assert.equal(ok(confirmBooking(confirmed.value.ledger, booked.booking.bookingRef, now)).events.length, 0);

 const cancelled = ok(cancelBooking(booked.ledger, { idempotencyKey: 'c-1', bookingRef: booked.booking.bookingRef, subjectRef: 'subject-lerato', reasonCode: 'unstated', actorRole: 'patient' }, now));
 const late = confirmBooking(cancelled.value.ledger, booked.booking.bookingRef, now);
 assert.ok(late.refused);
 assert.equal(late.id, 'confirm-after-cancel');

 const asap = ok(ask(emptyLedger, 'asap~nearest')).value;
 const noHour = confirmBooking(asap.ledger, asap.booking.bookingRef, now);
 assert.ok(noHour.refused);
 assert.equal(noHour.id, 'confirm-without-a-time');
});

test('a cancellation records which side of the window it fell on, and a visit that has started is refused', () => {
 const booked = ok(ask(emptyLedger, `${firstDay}T09:00~N-205`)).value;
 const cancel = (at: Date, reasonCode = 'no-longer-needed') =>
  cancelBooking(booked.ledger, { idempotencyKey: 'c-1', bookingRef: booked.booking.bookingRef, subjectRef: 'subject-lerato', reasonCode, actorRole: 'patient' }, at);
 const early = ok(cancel(now));
 assert.equal(early.value.booking.cancellation!.windowCode, 'before-window');
 assert.deepEqual(early.events[0]!.payload, { bookingRef: booked.booking.bookingRef, cancelledByRole: 'patient', reasonCode: 'no-longer-needed' });

 const hourBefore = new Date(Date.parse(booked.booking.requestedFor) - 3_600_000);
 assert.equal(ok(cancel(hourBefore)).value.booking.cancellation!.windowCode, 'inside-window');

 const started = cancel(new Date(Date.parse(booked.booking.requestedFor) + 60_000));
 assert.ok(started.refused);
 assert.equal(started.id, 'cancel-after-arrival');
 assert.equal(started.statement, statement(CANCEL, 'cancel-after-arrival'));
 assert.equal(started.statement, cancellation.refusals.find(r => r.id === 'cancel-after-arrival')!.sentence);

 const freeText = cancel(now, 'my knee got better');
 assert.ok(freeText.refused);
 assert.equal(freeText.id, 'reason-not-listed');

 const twice = ok(cancelBooking(early.value.ledger, { idempotencyKey: 'c-2', bookingRef: booked.booking.bookingRef, subjectRef: 'subject-lerato', reasonCode: 'unstated', actorRole: 'patient' }, now));
 assert.equal(twice.events.length, 0);
 assert.equal(windowOf(null, now), 'before-window');
});

test('reading a booking never says whether it exists for somebody else', () => {
 const booked = ok(ask(emptyLedger, `${firstDay}T09:00~N-205`)).value;
 assert.equal(ok(readBooking(booked.ledger, booked.booking.bookingRef, 'subject-lerato')).value.stateCode, 'requested');
 const other = readBooking(booked.ledger, booked.booking.bookingRef, 'subject-somebody-else');
 const nothing = readBooking(booked.ledger, 'SIM-BKG-NOTHING0', 'subject-somebody-else');
 assert.ok(other.refused && nothing.refused);
 assert.deepEqual([other.id, other.statement], [nothing.id, nothing.statement]);
});

test('state is folded from events, and an arrow the contract does not draw is ignored', () => {
 const ref = 'SIM-BKG-00000000';
 const at = '2026-09-14T10:00:00+02:00';
 const e = (type: 'booking.requested' | 'booking.confirmed' | 'booking.cancelled'): AccessEvent =>
  type === 'booking.requested' ? { type, version: 1, actorRole: 'patient', subjectRef: 's', occurredAt: at, payload: { bookingRef: ref, serviceId: 'wound', mode: 'home', requestedFor: at } }
   : type === 'booking.confirmed' ? { type, version: 1, actorRole: 'system', subjectRef: 's', occurredAt: at, payload: { bookingRef: ref, scheduledFor: at } }
    : { type, version: 1, actorRole: 'patient', subjectRef: 's', occurredAt: at, payload: { bookingRef: ref, cancelledByRole: 'patient', reasonCode: 'unstated' } };
 assert.equal(stateFromEvents([e('booking.requested'), e('booking.confirmed')], ref), 'confirmed');
 assert.equal(stateFromEvents([e('booking.requested'), e('booking.cancelled'), e('booking.confirmed')], ref), 'cancelled');
 assert.equal(stateFromEvents([e('booking.confirmed')], ref), null);
 assert.ok(!contract.transitions.some(t => t.from === 'cancelled'));
});

test('every event this domain publishes is live, owned by access and declared in booking.json', () => {
 for (const published of contract.publishes) {
  const [type, version] = published.split('@');
  const declared = events.events.find(e => e.type === type && e.version === Number(version));
  assert.ok(declared && !('withdrawn' in declared), published);
  assert.equal(declared!.owner, 'access');
 }
});
