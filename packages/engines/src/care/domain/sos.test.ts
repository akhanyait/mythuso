/* The urgent visit an SOS opens, on Care's own offer desk.

   On the real contracts the desk refuses the service, because services.json places Thuso SOS in a later phase than
   Care's seed phase. With the phase moved to where the service is, the same desk offers the visit to a cleared nurse
   who can reach the area, with every gate still asked — which is the offer Care would make the day Thuso SOS joins
   the seed. And a stand-down withdraws only what nobody accepted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import roster from '../../../../catalog/roster.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { careByDefault } from './settings.ts';
import { careContract, serviceFor } from './contract.ts';
import { OfferDesk } from './offers.ts';
import { TrustCache } from './trust.ts';
import { SOS_SERVICE_ID, opensAnUrgentVisit, urgentAppointmentRef, urgentVisitFor, withdrawnOnStandDown } from './sos.ts';

const NOW = new Date('2026-09-15T09:00:00+02:00');
const zone = (name: string) => geography.zones.find(z => z.id === name || z.name === name)?.at ?? null;
const candidates = roster.nurses.map(n => ({ clinicianRef: n.id, roleId: 'nurse', scope: n.scope, base: zone(n.zone) }));
const badges = candidates.map(c => ({ subjectRef: c.clinicianRef, badgeTier: 'verified', hardGatesPassed: true, occurredAt: '2026-09-15T08:00:00+02:00' }));
const deskFor = (seedPhase: number) => {
 const contract = { ...careContract, seedPhase };
 const visit = urgentVisitFor({ sosRef: 'sos-synthetic-1', subjectRef: 'subject-synthetic-301', zone: zone('rosebank') }, NOW);
 const desk = new OfferDesk({ contract, trust: new TrustCache(contract.badgeTiers, badges), candidates: () => candidates, settings: () => careByDefault, book: { appointments: [visit], offers: [], bookings: [] } });
 return { desk, visit };
};

test('only a door that sends somebody opens an urgent visit', () => {
 assert.deepEqual(['emergency-services', 'urgent-visit', 'cannot-help', 'anything'].map(opensAnUrgentVisit), [false, true, false, false]);
});

test('on the seed phase the offer desk refuses Thuso SOS, and with the phase moved it offers a cleared nurse who can reach the area', () => {
 const sosPhase = serviceFor(careContract, SOS_SERVICE_ID)!.phase;
 const seed = deskFor(careContract.seedPhase);
 const refused = seed.desk.offer({ idempotencyKey: 'sos-1', appointmentRef: seed.visit.appointmentRef, serviceId: SOS_SERVICE_ID }, NOW);
 if (sosPhase > careContract.seedPhase) assert.equal(refused.ok ? 'offered' : refused.id, 'service-not-offered');

 const later = deskFor(sosPhase);
 const offered = later.desk.offer({ idempotencyKey: 'sos-1', appointmentRef: later.visit.appointmentRef, serviceId: SOS_SERVICE_ID }, NOW);
 assert.ok(offered.ok, JSON.stringify(offered));
 const [event] = offered.events;
 assert.equal(event!.type, 'appointment.offered');
 assert.ok(!('patientLocation' in event!.payload), 'the offer carries who and until when, never where');
 const offer = later.desk.offerRef(offered.value.offerRef)!;
 assert.equal(offer.appointmentRef, urgentAppointmentRef('sos-synthetic-1'));
 assert.ok(candidates.some(c => c.clinicianRef === offer.clinicianRef));

 assert.deepEqual(withdrawnOnStandDown(later.desk.offersFor(offer.appointmentRef), 'sos-synthetic-1').map(o => o.offerRef), [offer.offerRef]);
 assert.deepEqual(withdrawnOnStandDown(later.desk.offersFor(offer.appointmentRef), 'sos-somebody-else'), []);
 offer.state = 'accepted';
 assert.deepEqual(withdrawnOnStandDown(later.desk.offersFor(offer.appointmentRef), 'sos-synthetic-1'), [], 'an accepted visit is a person\'s to call off');
});
