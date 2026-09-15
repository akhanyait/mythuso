/**
 * The HL7 v2 bridge over a real socket on the loopback: a patient links a hospital number in their own session, a
 * developer sends the synthetic hospital's admission and discharge and the synthetic laboratory's result, every answer
 * carries its acknowledgement, the quarantine is read with a developer credential and refused without one, and every
 * message is in the patient's own /audit/mine under the partner that sent it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import hl7 from '../../../packages/catalog/hl7v2-inbound.json' with { type: 'json' };
import { syntheticAdt, syntheticOru } from '../../../packages/engines/src/record/domain/hl7.ts';
import { mintDeveloperCredential } from '../src/operator.ts';
import { createPassport } from '../src/server.ts';
import { developmentEnv, sentence, statementOf } from './harness.ts';

let server: Server;
let base: string;
let passport: ReturnType<typeof createPassport>;

before(async () => {
 passport = createPassport(developmentEnv());
 server = createServer(passport.handle);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(() => { server.close(); passport.close(); });

const call = async (path: string, init: { body?: unknown; auth?: string } = {}) => {
 const response = await fetch(`${base}${path}`, {
  method: init.body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...(init.auth ? { authorization: init.auth } : {}) },
  ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
 });
 return { status: response.status, body: await response.json() as Record<string, unknown> };
};

test('linked, admitted, discharged, a result refused for an order the process never heard of, the quarantine read, and every message in /audit/mine', async () => {
 const developer = `Developer ${mintDeveloperCredential(passport.config)}`;
 const hospital = hl7.facilities.find(f => f.kind === 'hospital')!;
 const laboratory = hl7.facilities.find(f => f.kind === 'laboratory')!;
 const identifier = { authority: hl7.assigningAuthorities[0]!.id, value: 'SYN300400' };
 const created = await call('/dev/subjects', { body: {}, auth: developer });
 const patient = `Patient ${(created.body as { patientSession: string }).patientSession}`;

 const linked = await call('/identifiers/link', { auth: patient, body: { assigningAuthority: identifier.authority, identifier: identifier.value } });
 assert.equal(linked.status, 201, JSON.stringify(linked.body));

 const now = Date.now();
 const admitted = await call('/hl7v2/inbound', { auth: developer, body: { message: syntheticAdt({ facility: hospital, trigger: 'A01', controlId: 'SYN-HTTP-1', sentAt: now, identifier, visitNumber: 'SYN-VISIT-H1', admittedAt: now - 3_600_000 }) } });
 assert.equal(admitted.status, 200, JSON.stringify(admitted.body));
 assert.equal(admitted.body.acknowledgementCode, 'AA');
 const discharged = await call('/hl7v2/inbound', { auth: developer, body: { message: syntheticAdt({ facility: hospital, trigger: 'A03', controlId: 'SYN-HTTP-2', sentAt: now, identifier, visitNumber: 'SYN-VISIT-H1', dischargedAt: now }) } });
 assert.equal(discharged.status, 200, JSON.stringify(discharged.body));

 /* The process is handed no placed order, so a result for any order is refused, with its acknowledgement beside the sentence. */
 const result = await call('/hl7v2/inbound', { auth: developer, body: { message: syntheticOru({ facility: laboratory, controlId: 'SYN-HTTP-3', sentAt: now, identifier, labOrderRef: 'lab-order-synthetic-h1', verifiedBy: hl7.preview.verifiedBy }) } });
 assert.equal(result.status, 422);
 assert.equal(result.body.message, sentence('hl7-lab-order-not-placed'));
 assert.equal(result.body.acknowledgementCode, 'AE');
 assert.match(String(result.body.acknowledgement), /\rMSA\|AE\|SYN-HTTP-3\|/);

 const unmatched = await call('/hl7v2/inbound', { auth: developer, body: { message: syntheticAdt({ facility: hospital, trigger: 'A01', controlId: 'SYN-HTTP-4', sentAt: now, identifier: { ...identifier, value: 'SYN000001' }, visitNumber: 'SYN-VISIT-H2', admittedAt: now }) } });
 assert.equal(unmatched.body.message, sentence('hl7-patient-not-matched'));
 const withoutCredential = await call('/hl7v2/inbound', { body: { message: 'MSH|^~\\&|x' } });
 assert.deepEqual([withoutCredential.status, withoutCredential.body.message, withoutCredential.body.acknowledgementCode], [401, sentence('hl7-developer-credential-required'), 'AR']);

 const quarantine = await call('/hl7v2/quarantine', { auth: developer });
 assert.equal(quarantine.status, 200, JSON.stringify(quarantine.body));
 assert.deepEqual((quarantine.body.quarantined as { reasonCode: string }[]).map(q => q.reasonCode), ['hl7-patient-not-matched']);
 assert.equal((await call('/hl7v2/quarantine', { auth: patient })).status, 401);

 const log = await call('/audit/mine', { auth: patient });
 const entries = log.body.entries as { type: { code: string }; outcome: string; outcomeDesc: string; agent: { type: { text: string } }[] }[];
 const seen = entries.map(e => `${e.type.code}:${e.outcome}:${e.agent[0]!.type.text}`);
 for (const expected of ['identifier.link:0:patient', `hl7v2.adt.admit:0:${hospital.id}`, `hl7v2.adt.discharge:0:${hospital.id}`, `hl7v2.oru.result:4:${laboratory.id}`]) assert.ok(seen.includes(expected), `${expected} is not in the patient's log: ${seen.join(', ')}`);
 assert.ok(entries.filter(e => e.type.code.startsWith('hl7v2.adt')).every(e => e.outcomeDesc === statementOf('hl7Received')));
 assert.ok(!JSON.stringify(entries).includes('SYN000001'), 'the unmatched message reached nobody\'s log');
});
