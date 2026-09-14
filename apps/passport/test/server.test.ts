/**
 * The endpoints of §26 at the minimum needed, over a real socket on the loopback.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createPassport } from '../src/server.ts';
import { sentence } from './harness.ts';

let server: Server;
let base: string;
let passport: ReturnType<typeof createPassport>;

before(async () => {
 passport = createPassport({ databasePath: ':memory:', masterKey: randomBytes(32) });
 server = createServer(passport.handle);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(() => { server.close(); passport.close(); });

const call = async (path: string, init: { method?: string; body?: unknown; auth?: string; purpose?: string } = {}) => {
 const response = await fetch(`${base}${path}`, {
  method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
  headers: {
   'content-type': 'application/json',
   ...(init.auth ? { authorization: init.auth } : {}),
   ...(init.purpose ? { 'x-purpose-of-use': init.purpose } : {})
  },
  ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
 });
 return { status: response.status, body: await response.json() as Record<string, unknown> };
};

describe('the Passport over HTTP', () => {
 test('no grant, no read', async () => {
  const { subject } = (await call('/dev/subjects', { body: {} })).body as { subject: string };
  const refused = await call(`/fhir/AllergyIntolerance?subject=${subject}`);
  assert.equal(refused.status, 401);
  assert.equal(refused.body.message, sentence('no-grant'));
 });

 test('subject, write, grant, read, consent check, emergency summary, break-glass and the patient\'s audit', async () => {
  const created = await call('/dev/subjects', { body: {} });
  assert.equal(created.status, 201);
  const { subject, patientSession } = created.body as { subject: string; patientSession: string };
  const patient = `Patient ${patientSession}`;

  const written = await call('/fhir/AllergyIntolerance', {
   auth: patient,
   body: { subject, category: 'allergy', resource: { code: { text: 'Synthetic allergen C' } }, provenance: { activity: 'self-reported', sourceSystem: 'synthetic-http-test' } }
  });
  assert.equal(written.status, 201, JSON.stringify(written.body));
  const id = written.body.id as string;

  const granted = await call('/consent/grant', {
   auth: patient,
   body: { subject, recipientRole: 'nurse-assigned', scope: ['allergy'], purpose: 'treatment', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
  });
  assert.equal(granted.status, 201, JSON.stringify(granted.body));
  const grant = `Grant ${granted.body.artefact as string}`;

  const read = await call(`/fhir/AllergyIntolerance/${id}`, { auth: grant, purpose: 'treatment' });
  assert.equal(read.status, 200);
  assert.equal(((read.body.resource as { code: { text: string } }).code).text, 'Synthetic allergen C');

  const wrongPurpose = await call(`/fhir/AllergyIntolerance/${id}`, { auth: grant, purpose: 'marketing' });
  assert.equal(wrongPurpose.status, 403);
  assert.equal(wrongPurpose.body.message, sentence('wrong-purpose'));

  const checked = await call('/consent/check', { auth: grant, purpose: 'treatment', body: { category: 'vitals' } });
  assert.equal(checked.status, 403);
  assert.equal(checked.body.message, sentence('out-of-scope'));

  const summary = await call(`/summary/emergency?subject=${subject}`, { auth: grant, purpose: 'treatment' });
  assert.equal(summary.status, 403);
  assert.equal(summary.body.message, sentence('out-of-scope'));

  const glass = await call('/breakglass', { body: { subject, justification: 'Unresponsive on arrival, no phone and nobody home', requesterRole: 'dispatch-desk', requesterRef: 'synthetic-desk-http' } });
  assert.equal(glass.status, 200, JSON.stringify(glass.body));
  assert.equal(((glass.body.summary as Record<string, unknown[]>).allergy ?? []).length, 1);

  const history = await call('/audit/mine', { auth: patient });
  assert.equal(history.status, 200);
  const entries = history.body.entries as { breakGlass: boolean; outcome: string }[];
  assert.ok(entries.some(entry => entry.breakGlass));
  assert.ok(entries.some(entry => entry.outcome === '4'));
  assert.equal((history.body.chain as { intact: boolean }).intact, true);

  const notMine = await call('/audit/mine', { auth: grant });
  assert.equal(notMine.status, 401);
  assert.equal(notMine.body.message, sentence('patient-session-required'));
 });
});
