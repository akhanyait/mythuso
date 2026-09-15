/* The Record engine bound to the runtime: its five settings read and changed through the shared settings code,
   in the shared words, by an admin alone — and the link arithmetic the Passport P0 and the web preview share,
   held to the settings in force when a link is made and to the grant it rides on. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import consent from '../../../catalog/consent.json' with { type: 'json' };
import sharing from '../../../catalog/passport-sharing.json' with { type: 'json' };
import settingsContract from '../../../catalog/settings.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, type RouteKey, type Runtime } from '../runtime/index.ts';
import { EMERGENCY_SCOPE, LINK_CEILING_DAYS, linkTermsFor, payerRefusal, useRefusal, type GrantTerms } from './domain/links.ts';
import { sharingInForce } from './domain/settings.ts';
import { engine } from './engine.ts';

const START = '2026-09-15T09:00:00+02:00';
const DAY = 86_400_000;
const SETTINGS: RouteKey = 'GET /v1/record/settings@1';
const CHANGE: RouteKey = 'POST /v1/record/setting-changes@1';
const ADMIN = { role: 'admin', ref: 'party-admin-1', purpose: 'audit' };
const start = (): Runtime => createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine], dataDirectory: MEMORY, clock: createClock(START) });
const shared = (id: string) => settingsContract.refusals.find(r => r.route === 'change' && r.id === id)!.statement;

test('an admin reads the Record engine’s five settings with their proposals, and a patient or a nurse cannot', () => {
 const runtime = start();
 const read = runtime.call(SETTINGS, { ...ADMIN, fields: {} });
 assert.equal(read.status, 200, JSON.stringify(read.body));
 const rows = read.body.settings as { setting: string; provenance: { decidedBy: string | null } }[];
 assert.deepEqual(rows.map(r => r.setting), sharing.settings.items.map(s => s.key));
 assert.ok(rows.every(r => r.provenance.decidedBy === null), 'a Record default says somebody decided it');
 for (const role of ['patient', 'nurse']) assert.equal(runtime.call(SETTINGS, { role, ref: `party-${role}`, purpose: 'audit', fields: {} }).body.error, 'caller-not-allowed');
});

test('a change applies from the next version, is refused past the grant ceiling in the shared words, and a link made before keeps what it read', () => {
 const runtime = start();
 const defaults = sharingInForce([]);
 const past = runtime.call(CHANGE, { ...ADMIN, fields: { idempotencyKey: 'c-0', setting: 'share-link-lifetime-days', wholeNumber: LINK_CEILING_DAYS + 1, reason: 'Synthetic, past the ceiling.', expectedVersion: 1 } });
 assert.equal(past.body.message, shared('setting-out-of-range'));
 const longer = runtime.call(CHANGE, { ...ADMIN, fields: { idempotencyKey: 'c-1', setting: 'share-link-lifetime-days', wholeNumber: defaults.linkLifetimeDays + 1, reason: 'Synthetic, for the Record engine test.', expectedVersion: 1 } });
 assert.equal(longer.status, 200, JSON.stringify(longer.body));
 assert.equal(longer.body.settingsVersion, 2);
 const stale = runtime.call(CHANGE, { ...ADMIN, fields: { idempotencyKey: 'c-2', setting: 'share-link-max-uses', wholeNumber: defaults.linkMaxUses + 1, reason: 'Synthetic.', expectedVersion: 1 } });
 assert.equal(stale.body.message, shared('settings-version-stale'));
});

test('the link arithmetic: the ceiling from consent.json, never a payer, never wider than the grant, and a use counted once', () => {
 const now = Date.parse(START);
 const defaults = sharingInForce([]);
 assert.equal(LINK_CEILING_DAYS, consent.grants.maximumExpiryDays);
 const grant: GrantTerms = { recipientRole: 'doctor-assigned', scope: ['allergy', 'emergency-card'], purpose: 'treatment', sealedIncluded: false, expiresAt: now + 14 * DAY, revokedAt: null };
 for (const payer of sharing.links.neverTo) assert.equal(payerRefusal(payer.id), 'link-to-a-payer');
 const made = linkTermsFor({ recipientRole: 'doctor-assigned', kindCode: 'share-link' }, grant, defaults, now);
 assert.ok(made.ok);
 assert.deepEqual(made.value.scope, EMERGENCY_SCOPE);
 assert.equal(made.value.expiresAt, now + defaults.linkLifetimeDays * DAY);
 const wide = linkTermsFor({ recipientRole: 'doctor-assigned', kindCode: 'share-link', scope: ['allergy', 'vitals'] }, grant, defaults, now);
 assert.deepEqual(wide, { ok: false, refusal: 'link-wider-than-grant' });
 /* A lifetime past the ceiling in force — which the settings rules refuse — is still held to the ceiling here. */
 const drifted = linkTermsFor({ recipientRole: 'doctor-assigned', kindCode: 'share-link' }, { ...grant, expiresAt: now + 400 * DAY }, { ...defaults, linkLifetimeDays: 400 }, now);
 assert.ok(drifted.ok);
 assert.equal(drifted.value.expiresAt, now + LINK_CEILING_DAYS * DAY);
 const link = { revokedAt: null, expiresAt: now + DAY, usesAllowed: 1 };
 assert.equal(useRefusal(link, 0, grant, now), null);
 assert.equal(useRefusal(link, 1, grant, now), 'link-used-up');
 assert.equal(useRefusal(link, 1, grant, now, true), null);
 assert.equal(useRefusal(link, 0, { ...grant, revokedAt: now }, now), 'revoked');
});
