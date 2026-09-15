/**
 * Passport P1 over a real socket on the loopback: a link made in the patient's session, opened with its secret
 * on the Authorization header, revoked, and the export — each answered in the contract's words and each in the
 * patient's own log.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import sharing from '../../../packages/catalog/passport-sharing.json' with { type: 'json' };
import { mintDeveloperCredential } from '../src/operator.ts';
import { createPassport } from '../src/server.ts';
import { developmentEnv, sentence } from './harness.ts';

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

const call = async (path: string, init: { body?: unknown; auth?: string; method?: string } = {}) => {
 const response = await fetch(`${base}${path}`, {
  method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
  headers: { 'content-type': 'application/json', ...(init.auth ? { authorization: init.auth } : {}) },
  ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
 });
 return { status: response.status, body: await response.json() as Record<string, unknown> };
};

describe('share links and the export over HTTP', () => {
 test('made, opened with the secret on the header, refused in the address, revoked, exported, and all in /audit/mine', async () => {
  const created = await call('/dev/subjects', { body: {}, auth: `Developer ${mintDeveloperCredential(passport.config)}` });
  const { subject, patientSession } = created.body as { subject: string; patientSession: string };
  const patient = `Patient ${patientSession}`;
  assert.equal((await call('/fhir/AllergyIntolerance', { auth: patient, body: { subject, category: 'allergy', resource: { code: { text: 'Synthetic allergen H' } }, provenance: { activity: 'self-reported', sourceSystem: 'synthetic-http-test' } } })).status, 201);
  const granted = await call('/consent/grant', { auth: patient, body: { subject, recipientRole: 'next-of-kin', scope: ['emergency-card'], purpose: 'emergency', expiresAt: new Date(Date.now() + 86_400_000).toISOString() } });
  assert.equal(granted.status, 201, JSON.stringify(granted.body));

  const payer = await call('/share/link', { auth: patient, body: { grantId: granted.body.grantId, recipientRole: 'scheme-aggregate', kindCode: 'share-link' } });
  assert.equal(payer.status, 403);
  assert.equal(payer.body.message, sentence('link-to-a-payer'));

  const made = await call('/share/link', { auth: patient, body: { grantId: granted.body.grantId, recipientRole: 'next-of-kin', kindCode: 'emergency-card' } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const secret = made.body.linkSecret as string;

  const noHeader = await call('/share/link/open', { body: { idempotencyKey: 'k1', linkSecret: secret } });
  assert.equal(noHeader.status, 401, 'a secret in the body opened a link');
  assert.equal(noHeader.body.message, sentence('link-not-recognised'));

  const opened = await call('/share/link/open', { auth: `Link ${secret}`, body: { idempotencyKey: 'k1' } });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  const resources = ((opened.body.opened as { resources: { code: { text: string } }[] }[])[0]!).resources;
  assert.deepEqual(resources.map(r => r.code.text), ['Synthetic allergen H']);

  const revoked = await call('/share/link/revoke', { auth: patient, body: { linkRef: made.body.linkRef } });
  assert.equal(revoked.status, 200);
  const afterRevocation = await call('/share/link/open', { auth: `Link ${secret}`, body: { idempotencyKey: 'k2' } });
  assert.equal(afterRevocation.status, 403);
  assert.equal(afterRevocation.body.message, sentence('link-revoked'));

  const exported = await call('/export', { auth: patient, body: { format: 'fhir-bundle' } });
  assert.equal(exported.status, 200, JSON.stringify(exported.body));
  assert.equal((exported.body.bundle as { resourceType: string }).resourceType, 'Bundle');
  assert.equal(exported.body.stepUp, sharing.export.stepUp.sentence);
  const pdf = await call('/export', { auth: patient, body: { format: 'pdf' } });
  assert.equal(pdf.status, 422);
  assert.equal(pdf.body.message, sentence('export-format-not-built'));

  const log = await call('/audit/mine', { auth: patient });
  const codes = (log.body.entries as { type: { code: string }; outcome: string }[]).map(e => `${e.type.code}:${e.outcome}`);
  for (const expected of ['share.link.create:0', 'share.link.create:4', 'share.link.use:0', 'share.link.use:4', 'share.link.revoke:0', 'export:0', 'export:4']) assert.ok(codes.includes(expected), `${expected} is not in the patient's log`);
 });
});
