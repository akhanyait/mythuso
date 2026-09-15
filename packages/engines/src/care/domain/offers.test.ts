/* Offers: expiry, accept and decline, the cascade, and the same key twice. And the rule the offer-expiry
   setting rests on: an offer keeps the expiry it was made with, and only the next offer reads a change. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { careContract } from './contract.ts';
import { addMinutes } from './clock.ts';
import { OfferDesk } from './offers.ts';
import { careByDefault, type CareInForce } from './settings.ts';
import { HEARD, TrustCache } from './trust.ts';
import type { Candidate } from './matching.ts';

const at = (id: string) => geography.zones.find(z => z.id === id)!.at;
const NOW = new Date('2026-09-14T09:00:00+02:00');
const EXPIRY = careByDefault.offerExpiryMinutes;

function desk(people: Candidate[], withBadges = people.map(p => p.clinicianRef), settings: () => CareInForce = () => careByDefault, serviceId = 'wound') {
 const trust = new TrustCache(careContract.badgeTiers);
 for (const ref of withBadges) trust.learn({ ...HEARD, subjectRef: ref, occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } });
 const offers = new OfferDesk({ contract: careContract, trust, candidates: () => people, settings });
 offers.register({ appointmentRef: 'TH-9', subjectRef: 'sub-9', serviceId, zone: at('parktown'), scheduledFor: '2026-09-14T16:00:00+02:00', previousClinicianRefs: [] });
 return offers;
}
const nurse = (clinicianRef: string, zone: string): Candidate => ({ clinicianRef, roleId: 'nurse', scope: ['Wound care'], base: at(zone) });

test('an offer goes to the first eligible nurse, expires when the setting in force says, and emits appointment.offered without the patient’s place', () => {
 const offers = desk([nurse('far', 'soweto'), nurse('near', 'parktown')]);
 const made = offers.offer({ idempotencyKey: 'k1', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 assert.equal(made.value.offerExpiresAt, addMinutes(NOW, EXPIRY).toISOString());
 assert.deepEqual(made.events.map(e => [e.type, e.version]), [['appointment.offered', 1]]);
 assert.deepEqual(Object.keys(made.events[0]!.payload).sort(), ['appointmentRef', 'clinicianRef', 'offerExpiresAt']);
 assert.equal(made.events[0]!.payload.clinicianRef, 'near');
});

test('an offer made before the expiry changes keeps the expiry it was made with, and the next offer reads the change', () => {
 let inForce: CareInForce = careByDefault;
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')], undefined, () => inForce);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const longer = EXPIRY * 2;
 inForce = { ...careByDefault, offerExpiryMinutes: longer, settingsVersion: careByDefault.settingsVersion + 1 };

 const first = offers.offerRef(made.value.offerRef)!;
 assert.equal(first.expiresAt, addMinutes(NOW, EXPIRY).toISOString(), 'the offer she is reading still lapses when it said it would');
 assert.equal(first.settingsVersion, careByDefault.settingsVersion);
 assert.equal(offers.lapse(addMinutes(NOW, EXPIRY - 1)).length, 0);
 const lapsed = offers.lapse(addMinutes(NOW, EXPIRY));
 assert.equal(lapsed.length, 1, 'it lapses at its own expiry, not at the longer one now in force');

 const next = lapsed[0]!.next;
 assert.ok(next.ok);
 if (!next.ok) return;
 assert.equal(next.value.offerExpiresAt, addMinutes(addMinutes(NOW, EXPIRY), longer).toISOString(), 'the next offer is made with the expiry in force');
 assert.equal(offers.offerRef(next.value.offerRef)!.settingsVersion, inForce.settingsVersion);
});

test('the same idempotency key twice is one offer and no second event', () => {
 const offers = desk([nurse('near', 'parktown')]);
 const first = offers.offer({ idempotencyKey: 'same', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 const again = offers.offer({ idempotencyKey: 'same', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(first.ok && again.ok);
 if (!first.ok || !again.ok) return;
 assert.equal(again.value.offerRef, first.value.offerRef);
 assert.equal(again.events.length, 0);
 assert.equal(offers.offersFor('TH-9').length, 1);
});

test('a decline cascades to the next eligible nurse; a nurse is never asked twice', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank'), nurse('last', 'soweto')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const declined = offers.decline({ idempotencyKey: 'd1', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, NOW);
 assert.ok(declined.ok);
 if (!declined.ok) return;
 assert.equal(declined.events.length, 0, 'decline emits nothing of its own');
 const next = declined.value.next;
 assert.ok(next?.ok);
 if (!next?.ok) return;
 assert.equal(next.events[0]!.payload.clinicianRef, 'next');
 const third = offers.decline({ idempotencyKey: 'd2', offerRef: next.value.offerRef }, { clinicianRef: 'next' }, NOW);
 const afterThird = third.ok ? third.value.next : null;
 assert.ok(afterThird?.ok);
 if (!afterThird?.ok) return;
 assert.equal(afterThird.events[0]!.payload.clinicianRef, 'last');
 const out = offers.decline({ idempotencyKey: 'd3', offerRef: afterThird.value.offerRef }, { clinicianRef: 'last' }, NOW);
 assert.ok(out.ok);
 if (out.ok) assert.deepEqual(out.value.next && !out.value.next.ok ? out.value.next.id : null, 'no-eligible-clinician');
});

test('a decline that does not pass on leaves the visit for passOnDeclined, which asks the next nurse once', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const declined = offers.decline({ idempotencyKey: 'd', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, NOW, { passOn: false });
 assert.ok(declined.ok && declined.value.next === null);
 const passed = offers.passOnDeclined(NOW);
 assert.equal(passed.length, 1);
 assert.equal(passed[0]!.next.ok && passed[0]!.next.events[0]!.payload.clinicianRef, 'next');
 assert.equal(offers.passOnDeclined(NOW).length, 0, 'an open offer is not passed on again');
});

test('a desk restored from its own state answers as the one it was taken from', () => {
 const first = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')]);
 const made = first.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const trust = new TrustCache(careContract.badgeTiers);
 for (const ref of ['near', 'next']) trust.learn({ ...HEARD, subjectRef: ref, occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } });
 const again = new OfferDesk({ contract: careContract, trust, candidates: () => [nurse('near', 'parktown'), nurse('next', 'rosebank')], settings: () => careByDefault, book: first.state() });
 const stranger = again.accept({ idempotencyKey: 'x', offerRef: made.value.offerRef }, { clinicianRef: 'next' }, NOW);
 assert.equal(stranger.ok ? null : stranger.id, 'not-your-offer');
 assert.ok(again.accept({ idempotencyKey: 'a', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, NOW).ok);
});

test('an unanswered offer lapses at its expiry, cannot then be accepted, and passes on', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const justBefore = addMinutes(NOW, EXPIRY - 1);
 assert.equal(offers.lapse(justBefore).length, 0);
 const atExpiry = addMinutes(NOW, EXPIRY);
 const late = offers.accept({ idempotencyKey: 'a1', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, atExpiry);
 assert.equal(late.ok ? null : late.id, 'offer-expired');
 assert.equal(late.ok ? null : late.status, 410);
 const lapsed = offers.lapse(atExpiry);
 assert.equal(lapsed.length, 1);
 assert.ok(lapsed[0]!.next.ok);
 if (lapsed[0]!.next.ok) assert.equal(lapsed[0]!.next.events[0]!.payload.clinicianRef, 'next');
 assert.equal(offers.offerRef(made.value.offerRef)!.state, 'lapsed');
});

test('an offer is personal: somebody else cannot accept or decline it, and an unknown one says the same', () => {
 const offers = desk([nurse('near', 'parktown')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const stranger = offers.accept({ idempotencyKey: 'x', offerRef: made.value.offerRef }, { clinicianRef: 'someone' }, NOW);
 const unknown = offers.accept({ idempotencyKey: 'y', offerRef: 'ofr-nope' }, { clinicianRef: 'near' }, NOW);
 assert.deepEqual([stranger.ok ? null : stranger.id, unknown.ok ? null : unknown.id], ['not-your-offer', 'not-your-offer']);
 const declineStranger = offers.decline({ idempotencyKey: 'z', offerRef: made.value.offerRef }, { clinicianRef: 'someone' }, NOW);
 assert.equal(declineStranger.ok ? null : declineStranger.id, 'not-your-offer');
});

test('accepting books the visit, emits appointment.booked, and holds it against a second offer', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')]);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 const accepted = offers.accept({ idempotencyKey: 'a', offerRef: made.value.offerRef }, { clinicianRef: 'near' }, NOW);
 assert.ok(accepted.ok);
 if (!accepted.ok) return;
 assert.deepEqual(accepted.events.map(e => e.type), ['appointment.booked']);
 assert.equal(offers.booking('TH-9')!.clinicianRef, 'near');
 const again = offers.offer({ idempotencyKey: 'k2', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.equal(again.ok ? null : again.id, 'no-eligible-clinician');
});

test('when every otherwise eligible nurse lacks a badge, the refusal is the Trust Score one', () => {
 const offers = desk([nurse('near', 'parktown'), nurse('next', 'rosebank')], []);
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'wound' }, NOW);
 assert.equal(made.ok ? null : made.id, 'no-current-trust-score');
 assert.equal(made.ok ? null : made.status, 409);
 assert.equal(offers.withheldFor('TH-9').length, 2);
});

test('an offer made before who may be offered a service changes keeps the roles it was made under, and the next offer reads the change', () => {
 const locum: Candidate = { clinicianRef: 'locum', roleId: 'locum', scope: [], base: at('parktown') };
 const registered: Candidate = { clinicianRef: 'registered', roleId: 'nurse', scope: [], base: at('rosebank') };
 const nursesOnly = (): CareInForce => ({ ...careByDefault, settingsVersion: careByDefault.settingsVersion + 1, roles: { ...careByDefault.roles, 'injection-roles': ['nurse'] } });
 assert.deepEqual(careByDefault.roles['injection-roles'], ['nurse', 'locum'], 'the default is what Care did before the setting existed');

 /* She accepts what she was offered, whatever an admin narrowed afterwards. */
 let inForce: CareInForce = careByDefault;
 const offers = desk([locum, registered], undefined, () => inForce, 'injection');
 const made = offers.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'injection' }, NOW);
 assert.ok(made.ok);
 if (!made.ok) return;
 assert.equal(made.events[0]!.payload.clinicianRef, 'locum', 'the nearest eligible clinician is asked first');
 inForce = nursesOnly();
 assert.deepEqual(offers.offerRef(made.value.offerRef)!.roles, ['nurse', 'locum'], 'the offer keeps the roles it was made under');
 assert.ok(offers.accept({ idempotencyKey: 'a', offerRef: made.value.offerRef }, { clinicianRef: 'locum' }, NOW).ok, 'a narrower list reaches the next offer, never the one she is reading');

 /* The next offer is made under the list in force. */
 let later: CareInForce = careByDefault;
 const again = desk([locum, registered], undefined, () => later, 'injection');
 const first = again.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'injection' }, NOW);
 assert.ok(first.ok);
 if (!first.ok) return;
 later = nursesOnly();
 const declined = again.decline({ idempotencyKey: 'd', offerRef: first.value.offerRef }, { clinicianRef: 'locum' }, NOW);
 const next = declined.ok ? declined.value.next : null;
 assert.ok(next?.ok);
 if (!next?.ok) return;
 assert.equal(next.events[0]!.payload.clinicianRef, 'registered');
 assert.deepEqual([again.offerRef(next.value.offerRef)!.roles, again.offerRef(next.value.offerRef)!.settingsVersion], [['nurse'], later.settingsVersion]);

 /* And a locum alone, under the narrower list, is withheld as outside scope rather than offered it last. */
 const alone = desk([locum], undefined, nursesOnly, 'injection');
 const none = alone.offer({ idempotencyKey: 'k', appointmentRef: 'TH-9', serviceId: 'injection' }, NOW);
 assert.equal(none.ok ? null : none.id, 'no-eligible-clinician');
 assert.deepEqual(alone.withheldFor('TH-9').map(w => w.reason), ['outside-scope']);
});
