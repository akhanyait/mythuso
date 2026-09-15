/**
 * The HL7 v2 bridge in the gateway, on synthetic messages from the two registered development partners: an admission
 * and a discharge become one Encounter, a result for an order Record heard placed is filed and handed to Medicines as
 * references, and every message nobody linked is refused into the quarantine with nothing it said. A name or a date of
 * birth matches nobody, a sender nobody registered is refused, the same control ID is the same message once, and a
 * settings change never moves a deletion day already given. Every sentence is the contract's; every identifier,
 * visit number and value is invented and belongs to nobody.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hl7 from '../../../packages/catalog/hl7v2-inbound.json' with { type: 'json' };
import recordApi from '../../../packages/catalog/apis/record.json' with { type: 'json' };
import medicinesApi from '../../../packages/catalog/apis/medicines.json' with { type: 'json' };
import sharing from '../../../packages/catalog/passport-sharing.json' with { type: 'json' };
import { proposeChange, type Change } from '../../../packages/engines/src/settings/shape.ts';
import { inboundInForce, recordSettings } from '../../../packages/engines/src/record/domain/settings.ts';
import { syntheticAdt, syntheticOru, type Facility, type Identifier } from '../../../packages/engines/src/record/domain/hl7.ts';
import type { PlacedOrder } from '../src/gateway.ts';
import { DAY, HOUR, harness, seed, sentence, statementOf } from './harness.ts';

const hospital = hl7.facilities.find(f => f.kind === 'hospital')!;
const laboratory = hl7.facilities.find(f => f.kind === 'laboratory')!;
const NUMBER: Identifier = { authority: hl7.assigningAuthorities[0]!.id, value: 'SYN100200' };
const inbound = recordApi.routes.find(r => r.method === 'POST' && r.path === '/hl7v2/inbound' && r.version === 1)!;
const statusOf = (id: string) => inbound.refusals.find(r => r.id === id)!.status;
const retentionDefault = sharing.settings.items.find(s => s.key === 'hl7-quarantine-retention-days')!.default.value as number;
const intakeFields = medicinesApi.routes.find(r => r.path === '/v1/medicines/lab-results' && r.version === 1)!.request.map(f => f.field).sort();

function world(options: { placed?: Map<string, PlacedOrder>; inbound?: () => ReturnType<typeof inboundInForce>; facilities?: readonly Facility[] } = {}) {
 const h = harness({
  placedOrder: ref => options.placed?.get(ref) ?? null,
  ...(options.inbound ? { inbound: options.inbound } : {}), ...(options.facilities ? { facilities: options.facilities } : {})
 });
 const s = seed(h, { withPrivate: false });
 const linked = h.gateway.linkIdentifier(s.patientSession, { assigningAuthority: NUMBER.authority, identifier: NUMBER.value });
 assert.equal(linked.ok, true, JSON.stringify(linked));
 const send = (message: string) => h.gateway.receiveHl7(h.developer(), { message });
 const admit = (controlId: string, fields: Partial<Parameters<typeof syntheticAdt>[0]> = {}) =>
  syntheticAdt({ facility: hospital, trigger: 'A01', controlId, sentAt: h.at(), identifier: NUMBER, visitNumber: 'SYN-VISIT-01', admittedAt: h.at() - HOUR, ...fields });
 const result = (controlId: string, labOrderRef: string, fields: Partial<Parameters<typeof syntheticOru>[0]> = {}) =>
  syntheticOru({ facility: laboratory, controlId, sentAt: h.at(), identifier: NUMBER, labOrderRef, verifiedBy: hl7.preview.verifiedBy, ...fields });
 const mine = () => { const log = h.gateway.auditMine(s.patientSession); assert.ok(log.ok); return log.entries as { type: { code: string }; outcome: string; outcomeDesc: string; agent: { type: { text: string } }[] }[]; };
 const quarantined = () => { const q = h.gateway.hl7Quarantine(h.developer()); assert.ok(q.ok, JSON.stringify(q)); return q; };
 return { h, s, send, admit, result, mine, quarantined };
}

test('an admission and then a discharge write one Encounter and close it, keeping the version the discharge replaced', () => {
 const { h, s, send, admit } = world();
 const admitted = send(admit('SYN-ADT-0001'));
 assert.equal(admitted.ok, true, JSON.stringify(admitted));
 assert.equal(admitted.acknowledgementCode, 'AA');
 assert.match(admitted.acknowledgement, /\rMSA\|AA\|SYN-ADT-0001\|/);
 assert.ok(admitted.acknowledgement.includes(statementOf('hl7Received')));

 const [row] = h.store.resourcesOf(s.subject, 'Encounter');
 assert.ok(row, 'the admission wrote an Encounter');
 const opened = h.gateway.read(s.me, 'Encounter', row.id);
 assert.ok(opened.ok && opened.resource);
 assert.equal(opened.resource['status'], 'in-progress');
 assert.equal((opened.resource['class'] as { code: string }).code, hl7.encounters.classes.find(c => c.code === 'I')!.fhir);

 /* Inside the patient's development session, which lasts no longer than the identity service's idle limit. */
 h.advance(HOUR / 3);
 const discharged = send(syntheticAdt({ facility: hospital, trigger: 'A03', controlId: 'SYN-ADT-0002', sentAt: h.at(), identifier: NUMBER, visitNumber: 'SYN-VISIT-01', dischargedAt: h.at() - HOUR }));
 assert.equal(discharged.ok, true, JSON.stringify(discharged));
 assert.equal(h.store.resourcesOf(s.subject, 'Encounter').length, 1, 'the discharge closed the admission rather than writing a second encounter');
 const closed = h.gateway.read(s.me, 'Encounter', row.id);
 assert.ok(closed.ok && closed.resource);
 assert.equal(closed.resource['status'], 'finished');
 assert.ok((closed.resource['period'] as { start?: string; end?: string }).start && (closed.resource['period'] as { end?: string }).end);
 assert.equal((closed.resource['meta'] as { versionId: string }).versionId, '2');
 assert.deepEqual(h.store.resourceVersions(row.id).map(v => v.version), [1], 'the version it replaced is kept, sealed');
 assert.equal(closed.provenance.length, 2, 'each message is its own provenance');
 for (const kept of [JSON.stringify(closed.resource), JSON.stringify(h.store.database.prepare('SELECT * FROM hl7_encounters').all())]) {
  assert.ok(!kept.includes(NUMBER.value) && !kept.includes('SYN-VISIT-01'), 'neither the hospital number nor the visit number is kept as itself');
 }
});

test('a result for an order Record heard placed is filed, and handed to Medicines as references in the shape its intake takes', () => {
 const placed = new Map<string, PlacedOrder>();
 const { h, s, send, result } = world({ placed });
 placed.set('lab-order-synthetic-0101', { subjectRef: s.subject });
 placed.set('lab-order-synthetic-0202', { subjectRef: 'pp_00000000000000000000000000000000' });

 const filed = send(result('SYN-ORU-0001', 'lab-order-synthetic-0101'));
 assert.equal(filed.ok, true, JSON.stringify(filed));
 const [report] = h.store.resourcesOf(s.subject, 'DiagnosticReport');
 assert.ok(report);
 const [handOff] = h.gateway.hl7HandOffs();
 assert.deepEqual(Object.keys(handOff!).sort(), intakeFields, 'the hand-off carries exactly what POST /v1/medicines/lab-results@1 takes');
 assert.deepEqual([handOff!.labOrderRef, handOff!.resultEntryRef, handOff!.labPartyRef, handOff!.verifiedByRegistration], ['lab-order-synthetic-0101', report.id, laboratory.laboratory, hl7.preview.verifiedBy]);
 const said = JSON.stringify(handOff);
 for (const never of ['5.4', 'Synthetic glucose', 'mmol/L', NUMBER.value]) assert.ok(!said.includes(never), `the hand-off carries ${never}`);
 const opened = h.gateway.read(s.me, 'DiagnosticReport', report.id);
 assert.ok(opened.ok && opened.resource);
 assert.equal(((opened.resource['contained'] as { valueQuantity: { value: number } }[])[0]!).valueQuantity.value, 5.4, 'the value is in the record, where the grant decides who reads it');

 for (const [controlId, ref] of [['SYN-ORU-0002', 'lab-order-nobody-placed'], ['SYN-ORU-0003', 'lab-order-synthetic-0202']] as const) {
  const refused = send(result(controlId, ref));
  assert.equal(refused.ok, false);
  assert.deepEqual([refused.ok ? 0 : refused.status, refused.ok ? '' : refused.reason, refused.acknowledgementCode], [statusOf('hl7-lab-order-not-placed'), sentence('hl7-lab-order-not-placed'), 'AE']);
 }
 const unverified = send(result('SYN-ORU-0004', 'lab-order-synthetic-0101', { verifiedBy: '' }));
 assert.equal(unverified.ok ? '' : unverified.reason, sentence('hl7-result-without-verifier'));
 assert.equal(h.store.resourcesOf(s.subject, 'DiagnosticReport').length, 1, 'nothing refused was filed');
});

test('a message nobody linked is refused, quarantined with nothing it said, and matched to nobody', () => {
 const { h, s, send, admit, mine, quarantined } = world();
 const before = mine().length;
 const refused = send(admit('SYN-ADT-0009', { identifier: { authority: NUMBER.authority, value: 'SYN999999' }, visitNumber: 'SYN-VISIT-99' }));
 assert.equal(refused.ok, false);
 assert.deepEqual([refused.ok ? 0 : refused.status, refused.ok ? '' : refused.reason, refused.acknowledgementCode], [statusOf('hl7-patient-not-matched'), sentence('hl7-patient-not-matched'), 'AR']);
 assert.equal(h.store.resourcesOf(s.subject, 'Encounter').length, 0);

 const q = quarantined();
 assert.equal(q.quarantined.length, 1);
 const [item] = q.quarantined as { sendingFacility: string; messageType: string; reasonCode: string; reason: string; receivedAt: string; purgeAfter: string }[];
 assert.deepEqual([item!.sendingFacility, item!.messageType, item!.reasonCode, item!.reason], [hospital.id, 'ADT^A01', 'hl7-patient-not-matched', sentence('hl7-patient-not-matched')]);
 assert.equal(Date.parse(item!.purgeAfter) - Date.parse(item!.receivedAt), retentionDefault * DAY);
 const columns = Object.keys((h.store.database.prepare('SELECT * FROM hl7_quarantine').all() as Record<string, unknown>[])[0]!).sort();
 assert.deepEqual(columns, ['facility', 'message_type', 'purge_after', 'received_at', 'ref', 'refusal', 'settings_version']);
 const heldText = JSON.stringify([q, h.store.database.prepare('SELECT * FROM hl7_quarantine').all()]);
 for (const never of ['SYN999999', 'SYN-VISIT-99', 'SYN-ADT-0009']) assert.ok(!heldText.includes(never), `the quarantine holds ${never}`);
 assert.equal(mine().length, before + 1, 'the patient\'s log gains only their own reading of it: the message was matched to nobody');
});

test('a name and a date of birth match nobody, and a matched message that carries them is refused in the patient\'s own log', () => {
 const { h, s, send, admit, mine, quarantined } = world();
 const nameOnly = send(admit('SYN-ADT-0101', { identifier: null, pid: { 5: 'SYNTHETIC^PATIENT', 7: '19800101' } }));
 assert.equal(nameOnly.ok ? '' : nameOnly.reason, sentence('hl7-patient-not-matched'));
 assert.equal(quarantined().quarantined.length, 1);

 const carried = send(admit('SYN-ADT-0102', { pid: { 5: 'SYNTHETIC^PATIENT', 7: '19800101' } }));
 assert.equal(carried.ok, false);
 assert.deepEqual([carried.ok ? 0 : carried.status, carried.ok ? '' : carried.reason, carried.acknowledgementCode], [statusOf('hl7-pid-field-without-consent-basis'), sentence('hl7-pid-field-without-consent-basis'), 'AE']);
 assert.equal(h.store.resourcesOf(s.subject, 'Encounter').length, 0, 'nothing from it was stored');
 assert.equal(quarantined().quarantined.length, 1, 'a matched message is refused in the patient\'s chain, not quarantined');
 const refusal = mine().find(e => e.type.code === 'hl7v2.adt.admit');
 assert.ok(refusal && refusal.outcome === '4' && refusal.outcomeDesc === sentence('hl7-pid-field-without-consent-basis') && refusal.agent[0]!.type.text === hospital.id);
 const everything = JSON.stringify(h.store.database.prepare('SELECT * FROM audit_events').all());
 assert.ok(!everything.includes('SYNTHETIC^PATIENT') && !everything.includes('19800101'));
});

test('a sender nobody registered, a production message, a kind a facility does not send, a clock far off and a laboratory nobody contracted are each refused before any patient is found', () => {
 const stranger: Facility = { ...hospital, id: 'synthetic-unregistered', sendingFacility: 'ELSEWHERE' };
 const uncontracted: Facility = { ...laboratory, id: 'synthetic-uncontracted-laboratory', sendingFacility: 'SYNREF', laboratory: 'synthetic-reference-laboratory' };
 const { h, send, admit, result, quarantined } = world({ facilities: [...hl7.facilities, uncontracted] });
 const cases: [string, string][] = [
  [syntheticAdt({ facility: stranger, trigger: 'A01', controlId: 'SYN-X-1', sentAt: h.at(), identifier: NUMBER, visitNumber: 'SYN-VISIT-02', admittedAt: h.at() }), 'hl7-facility-not-registered'],
  [admit('SYN-X-2', { processingId: 'P' }), 'hl7-not-synthetic'],
  [syntheticOru({ facility: hospital, controlId: 'SYN-X-3', sentAt: h.at(), identifier: NUMBER, labOrderRef: 'lab-order-synthetic-0101', verifiedBy: hl7.preview.verifiedBy }), 'hl7-message-type-not-built'],
  [admit('SYN-X-4', { sentAt: h.at() - DAY }), 'hl7-clock-skew'],
  [syntheticOru({ facility: uncontracted, controlId: 'SYN-X-5', sentAt: h.at(), identifier: NUMBER, labOrderRef: 'lab-order-synthetic-0101', verifiedBy: hl7.preview.verifiedBy }), 'hl7-laboratory-not-contracted'],
  ['this is not an HL7 message', 'hl7-message-unreadable']
 ];
 for (const [message, id] of cases) {
  const answer = send(message);
  assert.equal(answer.ok, false, id);
  assert.deepEqual([answer.ok ? 0 : answer.status, answer.ok ? '' : answer.reason], [statusOf(id), sentence(id)], id);
  assert.equal(answer.acknowledgementCode, hl7.acknowledgements.refusals.find(r => r.refusal === id)!.code, id);
 }
 const items = quarantined().quarantined as { sendingFacility: string | null; reasonCode: string }[];
 assert.deepEqual(items.map(i => i.reasonCode), cases.map(([, id]) => id));
 assert.equal(items[0]!.sendingFacility, null, 'a sender nobody registered is recorded under no facility');
 assert.equal(result('SYN-X-6', 'x').length > 0, true);
 const noCredential = h.gateway.receiveHl7('Developer forged', { message: admit('SYN-X-7') });
 assert.equal(noCredential.ok ? '' : noCredential.reason, sentence('hl7-developer-credential-required'));
 assert.equal(quarantined().quarantined.length, cases.length, 'a request with no credential sent no message to quarantine');
});

test('the same control ID is the same message once: its first acknowledgement again, word for word, and nothing written twice', () => {
 const { h, s, send, admit, mine, quarantined } = world();
 const message = admit('SYN-ADT-0201');
 const first = send(message);
 const again = send(message);
 assert.equal(again.ok, true);
 assert.equal(again.replayed, true);
 assert.equal(again.acknowledgement, first.acknowledgement);
 assert.equal(h.store.resourcesOf(s.subject, 'Encounter').length, 1);
 assert.ok(mine().some(e => e.type.code === 'hl7v2.replay' && e.outcomeDesc === statementOf('hl7Replayed')));

 const different = send(admit('SYN-ADT-0201', { visitNumber: 'SYN-VISIT-03' }));
 assert.deepEqual([different.ok ? 0 : different.status, different.ok ? '' : different.reason], [statusOf('hl7-control-id-reused'), sentence('hl7-control-id-reused')]);

 const nobody = admit('SYN-ADT-0202', { identifier: { authority: NUMBER.authority, value: 'SYN777777' } });
 const refusedOnce = send(nobody);
 const refusedAgain = send(nobody);
 assert.deepEqual([refusedAgain.ok, refusedAgain.replayed, refusedAgain.acknowledgement], [false, true, refusedOnce.acknowledgement]);
 assert.equal(quarantined().quarantined.filter(i => (i as { reasonCode: string }).reasonCode === 'hl7-patient-not-matched').length, 1, 'a retry of a refused message is not quarantined twice');
});

test('a change to the quarantine retention reaches the next message and moves no deletion day already given', () => {
 let history: Change[] = [];
 const { h, send, admit, quarantined } = world({ inbound: () => inboundInForce(history) });
 const nobody = (controlId: string) => admit(controlId, { identifier: { authority: NUMBER.authority, value: 'SYN555555' } });
 send(nobody('SYN-ADT-0301'));
 const defaults = inboundInForce([]);
 const shorter = hl7Bound('lowest');
 const changed = proposeChange(recordSettings, history, { setting: 'hl7-quarantine-retention-days', value: shorter, reason: 'Synthetic, for the HL7 quarantine test.', expectedVersion: defaults.settingsVersion, byRole: 'admin', byRef: 'party-admin-test' }, h.at());
 assert.ok(changed.ok, JSON.stringify(changed));
 history = [...history, changed.value.change];
 send(nobody('SYN-ADT-0302'));

 const [first, second] = quarantined().quarantined as { receivedAt: string; purgeAfter: string; settingsVersion: number }[];
 assert.deepEqual([Date.parse(first!.purgeAfter) - Date.parse(first!.receivedAt), first!.settingsVersion], [retentionDefault * DAY, defaults.settingsVersion], 'the first keeps what it was given');
 assert.deepEqual([Date.parse(second!.purgeAfter) - Date.parse(second!.receivedAt), second!.settingsVersion], [shorter * DAY, defaults.settingsVersion + 1]);

 h.advance((shorter + 1) * DAY);
 const left = quarantined().quarantined as { settingsVersion: number }[];
 assert.deepEqual(left.map(i => i.settingsVersion), [defaults.settingsVersion], 'retention carried itself out for the second, and the first keeps its own day');
});

test('a hospital number is linked in the patient\'s own session, never as an identity number, and never to two people', () => {
 const { h, s } = world();
 const refusedAs = (answer: { ok: boolean; reason?: string }, id: string) => assert.equal(answer.ok ? '' : answer.reason, sentence(id), id);
 /* Thirteen digits shaped like an identity number and invalid as one — month thirteen — so no fixture here is anybody's. */
 refusedAs(h.gateway.linkIdentifier(s.patientSession, { assigningAuthority: NUMBER.authority, identifier: '0013320000000' }), 'identifier-is-an-identity-number');
 refusedAs(h.gateway.linkIdentifier(s.patientSession, { assigningAuthority: NUMBER.authority, identifier: 'ABC' }), 'identifier-not-for-this-authority');
 refusedAs(h.gateway.linkIdentifier(s.patientSession, { assigningAuthority: 'SOMEWHERE', identifier: NUMBER.value }), 'identifier-authority-not-registered');
 refusedAs(h.gateway.linkIdentifier('not-a-session', { assigningAuthority: NUMBER.authority, identifier: NUMBER.value }), 'patient-session-required');
 assert.equal(h.gateway.linkIdentifier(s.patientSession, { assigningAuthority: NUMBER.authority, identifier: NUMBER.value }).ok, true, 'linking one\'s own number again changes nothing');

 const other = seed(h, { withPrivate: false });
 refusedAs(h.gateway.linkIdentifier(other.patientSession, { assigningAuthority: NUMBER.authority, identifier: NUMBER.value }), 'identifier-already-linked');
 const owner = h.gateway.auditMine(s.patientSession);
 assert.ok(owner.ok && (owner.entries as { type: { code: string } }[]).some(e => e.type.code === 'identifier.link.contested'), 'the patient the number is linked to sees that somebody tried');
 assert.ok(!JSON.stringify(h.store.database.prepare('SELECT * FROM identifier_links').all()).includes(NUMBER.value));
});

/* A bound of the retention setting, read from the contract rather than typed. */
function hl7Bound(which: 'lowest' | 'highest'): number {
 return sharing.settings.items.find(s => s.key === 'hl7-quarantine-retention-days')!.bounds![which].value;
}
