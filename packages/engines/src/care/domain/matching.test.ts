/* Who is offered a visit, in what order, and who is withheld — against the real contracts, with
   candidates written here because the roster is a fixture and this is the rule. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { careContract, type CareContract } from './contract.ts';
import { match, type AppointmentToFill, type Candidate } from './matching.ts';
import { HEARD, TrustCache } from './trust.ts';
import { careByDefault } from './settings.ts';

const at = (id: string) => geography.zones.find(z => z.id === id)!.at;
const badge = (cache: TrustCache, ref: string, hardGatesPassed = true, occurredAt = '2026-09-14T06:00:00+02:00', badgeTier = 'verified') =>
 cache.learn({ ...HEARD, subjectRef: ref, occurredAt, payload: { badgeTier, hardGatesPassed } });

const visit: AppointmentToFill = {
 appointmentRef: 'TH-1', subjectRef: 'sub-1', serviceId: 'wound', zone: at('parktown'),
 scheduledFor: '2026-09-14T16:00:00+02:00', previousClinicianRefs: []
};
const nurse = (clinicianRef: string, zone: string | null, scope = ['Wound care'], roleId = 'nurse'): Candidate =>
 ({ clinicianRef, roleId, scope, base: zone ? at(zone) : null });

test('continuity comes first: the named nurse, then the most recent previous nurse, then nearest', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 const people = [nurse('near', 'parktown'), nurse('far', 'soweto'), nurse('before', 'randburg'), nurse('earlier', 'melville'), nurse('asked-for', 'soweto')];
 for (const p of people) badge(trust, p.clinicianRef);
 const found = match({ ...visit, namedClinicianRef: 'asked-for', previousClinicianRefs: ['before', 'earlier'] }, people, trust, careContract, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind !== 'matched') return;
 assert.deepEqual(found.ranked.map(r => r.candidate.clinicianRef), ['asked-for', 'before', 'earlier', 'near', 'far']);
 assert.deepEqual(found.ranked.map(r => r.continuity), ['named', 'previous', 'previous', null, null]);
 assert.ok(found.ranked[3]!.distanceKm < found.ranked[4]!.distanceKm, 'the unmatched tail is nearest first');
});

test('a nurse with no current badge is withheld with the contract sentence, never ranked last', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 const people = [nurse('cleared', 'soweto'), nurse('never-heard', 'parktown'), nurse('gates-failed', 'parktown'), nurse('odd-tier', 'parktown')];
 badge(trust, 'cleared');
 badge(trust, 'gates-failed', false);
 badge(trust, 'odd-tier', true, undefined, 'platinum');
 const found = match({ ...visit, previousClinicianRefs: ['never-heard'] }, people, trust, careContract, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind !== 'matched') return;
 assert.deepEqual(found.ranked.map(r => r.candidate.clinicianRef), ['cleared']);
 const statement = careContract.routes.find(r => r.path === '/v1/care/offers')!.refusals.find(r => r.id === 'no-current-trust-score')!.statement;
 assert.deepEqual(found.withheld.map(w => [w.candidate.clinicianRef, w.reason, w.statement]), [
  ['never-heard', 'no-current-trust-score', statement],
  ['gates-failed', 'no-current-trust-score', statement],
  ['odd-tier', 'no-current-trust-score', statement]
 ]);
});

test('scope of practice is asked before the badge, and in the vetting register’s own words', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 const people = [nurse('chronic-only', 'parktown', ['Chronic care']), nurse('a-doctor', 'parktown', ['Wound care'], 'doctor')];
 const found = match(visit, people, trust, careContract, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind !== 'matched') return;
 assert.equal(found.ranked.length, 0);
 assert.ok(found.withheld.every(w => w.reason === 'outside-scope' && w.statement === careContract.sentences.outsideScope));
});

test('a service with no named scope is open to any registered nurse or locum, and to nobody else', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 const people = [nurse('paeds', 'parktown', ['Paediatric']), nurse('locum', 'rosebank', ['Elderly care'], 'locum'), nurse('courier', 'parktown', [], 'courier')];
 for (const p of people) badge(trust, p.clinicianRef);
 const found = match({ ...visit, serviceId: 'injection' }, people, trust, careContract, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind !== 'matched') return;
 assert.deepEqual(found.ranked.map(r => r.candidate.clinicianRef), ['paeds', 'locum']);
 assert.deepEqual(found.withheld.map(w => w.reason), ['outside-scope']);
});

test('nobody is given an invented distance: no base, or a base outside South Africa, is withheld', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 const cupertino: Candidate = { clinicianRef: 'simulator', roleId: 'nurse', scope: ['Wound care'], base: { lat: 37.33, lng: -122.03 } };
 const people = [nurse('tembisa', null), cupertino];
 for (const p of people) badge(trust, p.clinicianRef);
 const found = match(visit, people, trust, careContract, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind !== 'matched') return;
 assert.equal(found.ranked.length, 0);
 assert.ok(found.withheld.every(w => w.reason === 'no-base-to-measure-from'));
});

test('a visit whose suburb Care has not been told is offered to nobody, rather than to whoever sorts first', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 badge(trust, 'n');
 assert.equal(match({ ...visit, zone: null }, [nurse('n', 'parktown')], trust, careContract, careByDefault.roles).kind, 'visit-zone-unknown');
 assert.equal(match({ ...visit, zone: { lat: 37.33, lng: -122.03 } }, [nurse('n', 'parktown')], trust, careContract, careByDefault.roles).kind, 'visit-zone-unknown');
});

test('a later-phase service is not offered to anybody, however eligible', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 badge(trust, 'n');
 assert.equal(match({ ...visit, serviceId: 'screening' }, [nurse('n', 'parktown')], trust, careContract, careByDefault.roles).kind, 'service-not-offered');
 assert.equal(match({ ...visit, serviceId: 'no-such-service' }, [nurse('n', 'parktown')], trust, careContract, careByDefault.roles).kind, 'service-not-offered');
});

/* The carer is on the vetting register, and the carer row in packages/catalog/care.json names her, so the
   roles are the contract's own. Only the phase is moved: the carer service is later than the seed phase, and a
   rule that is only ever run on the day the phase opens is first run on a patient. */
test('a supervised carer is never matched without her registered nurse', () => {
 const withCarers: CareContract = { ...careContract, seedPhase: 3 };
 const carerRow = withCarers.requirements.find(r => r.serviceId === 'carer')!;
 assert.equal(carerRow.supervisedBy, 'nurse', 'the carer row is supervised by a registered nurse');
 const [carerRole] = carerRow.roles ?? [];
 assert.equal(carerRole, 'carer', 'the carer row names the register’s carer, not a stand-in');
 const trust = new TrustCache(withCarers.badgeTiers);
 const carer = (ref: string, supervisorRef: string | null): Candidate => ({ clinicianRef: ref, roleId: carerRole!, scope: [], base: at('soweto'), supervisorRef });
 const people = [carer('with-rn', 'rn-1'), carer('other-rn', 'rn-2'), carer('alone', null)];
 for (const p of people) badge(trust, p.clinicianRef);
 const carerVisit = { ...visit, serviceId: 'carer' };
 assert.equal(match(carerVisit, people, trust, withCarers, careByDefault.roles).kind, 'carer-without-rn');
 const found = match({ ...carerVisit, supervisorRef: 'rn-1' }, people, trust, withCarers, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind !== 'matched') return;
 assert.deepEqual(found.ranked.map(r => r.candidate.clinicianRef), ['with-rn']);
 assert.deepEqual(found.withheld.map(w => [w.candidate.clinicianRef, w.reason]), [['other-rn', 'carer-without-rn'], ['alone', 'carer-without-rn']]);
});

test('the same roster gives the same order on every run', () => {
 const trust = new TrustCache(careContract.badgeTiers);
 const people = [nurse('b', 'rosebank'), nurse('a', 'rosebank'), nurse('c', 'rosebank')];
 for (const p of people) badge(trust, p.clinicianRef);
 const found = match(visit, people, trust, careContract, careByDefault.roles);
 assert.equal(found.kind, 'matched');
 if (found.kind === 'matched') assert.deepEqual(found.ranked.map(r => r.candidate.clinicianRef), ['a', 'b', 'c']);
});
