/**
 * The endpoints of §26 at the minimum needed, over a real socket on the loopback.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { mintOperatorCredential } from '../src/operator.ts';
import { createPassport } from '../src/server.ts';
import { developmentEnv, sentence } from './harness.ts';

let server: Server;
let base: string;
let port: number;
let passport: ReturnType<typeof createPassport>;

before(async () => {
 passport = createPassport(developmentEnv());
 server = createServer(passport.handle);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 port = typeof address === 'object' && address ? address.port : 0;
 base = `http://127.0.0.1:${port}`;
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
/* fetch will not send a Host header of the caller's choosing, which is exactly what a rebound page does. */
const withHost = (host: string, path: string, method = 'POST') => new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
 const req = request({ host: '127.0.0.1', port, path, method, headers: { host, 'content-type': 'application/json' } }, res => {
  let text = '';
  res.on('data', chunk => { text += String(chunk); });
  res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }));
 });
 req.on('error', reject);
 req.end(method === 'POST' ? '{}' : undefined);
});
const auditRows = () => passport.store.database.prepare('SELECT * FROM audit_events ORDER BY seq').all() as Record<string, unknown>[];

describe('the Passport over HTTP', () => {
 test('finding 4: a request whose Host is not a loopback name is refused, and the refusal is audited', async () => {
  const before = auditRows().length;
  for (const host of ['evil.example', `evil.example:${port}`, '127.0.0.1.evil.example']) {
   const refused = await withHost(host, '/dev/subjects');
   assert.equal(refused.status, 403, host);
   assert.equal(refused.body.message, sentence('not-loopback'));
  }
  const rows = auditRows();
  assert.equal(rows.length, before + 3);
  assert.ok(rows.slice(before).every(row => row.requester_role === 'unauthenticated' && row.action === 'POST /dev/subjects' && row.outcome === 'refused'));
  assert.equal((await withHost(`localhost:${port}`, '/dev/subjects')).status, 201);
 });

 test('finding 6: no grant, an unreadable body and no such route are all refused into the chain', async () => {
  const before = auditRows().length;
  const { subject } = (await call('/dev/subjects', { body: {} })).body as { subject: string };
  const noGrant = await call(`/fhir/AllergyIntolerance?subject=${subject}`);
  assert.equal(noGrant.status, 401);
  assert.equal(noGrant.body.message, sentence('no-grant'));
  const unreadable = await fetch(`${base}/consent/grant`, { method: 'POST', body: '{not json' });
  assert.equal(unreadable.status, 400);
  const noRoute = await call('/admin/everything');
  assert.equal(noRoute.status, 404);
  const reasons = auditRows().slice(before).map(row => row.reason);
  for (const id of ['no-grant', 'unreadable-body', 'no-route']) assert.ok(reasons.includes(sentence(id)), id);
  assert.equal(JSON.stringify(auditRows().slice(before)).includes(subject), false, 'a query string is never written into the chain');
 });

 test('subject, write, grant, read, consent check, emergency summary, break-glass, the patient\'s audit and the end of a session', async () => {
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

  const wrongPurpose = await call(`/fhir/AllergyIntolerance/${id}`, { auth: grant, purpose: 'billing' });
  assert.equal(wrongPurpose.status, 403);
  assert.equal(wrongPurpose.body.message, sentence('wrong-purpose'));

  const checked = await call('/consent/check', { auth: grant, purpose: 'treatment', body: { category: 'vitals' } });
  assert.equal(checked.status, 403);
  assert.equal(checked.body.message, sentence('out-of-scope'));

  const summary = await call(`/summary/emergency?subject=${subject}`, { auth: grant, purpose: 'treatment' });
  assert.equal(summary.status, 403);
  assert.equal(summary.body.message, sentence('out-of-scope'));

  const glassBody = { subject, reasonCode: 'unresponsive', note: 'Unresponsive on arrival with nobody home to consent', requesterRole: 'registered-clinician', requesterRef: 'claimed-in-the-body' };
  const claimed = await call('/breakglass', { body: glassBody });
  assert.equal(claimed.status, 401, 'a role claimed in the body is no credential');
  assert.equal(claimed.body.message, sentence('breakglass-role'));
  const glass = await call('/breakglass', { auth: `Operator ${mintOperatorCredential(passport.config, 'dispatch-desk')}`, body: glassBody });
  assert.equal(glass.status, 200, JSON.stringify(glass.body));
  assert.equal(((glass.body.summary as Record<string, unknown[]>).allergy ?? []).length, 1);
  assert.equal(JSON.stringify(auditRows()).includes('claimed-in-the-body'), false);

  const history = await call('/audit/mine', { auth: patient });
  assert.equal(history.status, 200);
  const entries = history.body.entries as { breakGlass: boolean; outcome: string }[];
  assert.ok(entries.some(entry => entry.breakGlass));
  assert.ok(entries.some(entry => entry.outcome === '4'));
  assert.equal((history.body.chain as { intact: boolean }).intact, true);

  const notMine = await call('/audit/mine', { auth: grant });
  assert.equal(notMine.status, 401);
  assert.equal(notMine.body.message, sentence('patient-session-required'));

  assert.equal((await call('/session/end', { auth: patient, body: {} })).status, 200);
  const ended = await call('/audit/mine', { auth: patient });
  assert.equal(ended.status, 401);
  assert.equal(ended.body.message, sentence('session-ended'));
 });
});
