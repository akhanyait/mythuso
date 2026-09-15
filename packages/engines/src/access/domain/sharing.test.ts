/* A sponsor reads a parent's visit summaries only under a grant she made, for no longer than the caregiver role
   allows, and nothing once it ends or she stops it. Every ceiling is read from packages/catalog/consent.json. */
import test from 'node:test';
import assert from 'node:assert/strict';
import consent from '../../../../catalog/consent.json' with { type: 'json' };
import { SUMMARY_DAYS_ALLOWED, grantSummaries, stopGrant, summariesShared } from './sharing.ts';

const NOW = new Date('2026-09-15T09:00:00+02:00');
const PARENT = 'subject-synthetic-nomsa', SPONSOR = 'subject-synthetic-thabo';
const DAY = 86_400_000;

test('without a grant a sponsor shares nothing, and with the parent\'s grant shares until the day she chose', () => {
 assert.deepEqual(summariesShared([], PARENT, SPONSOR, NOW), { shared: false });
 const given = grantSummaries({ byRef: PARENT, parentRef: PARENT, sponsorRef: SPONSOR, days: 30, now: NOW });
 assert.ok(given.ok);
 assert.equal(given.grant.recipientRole, 'caregiver');
 assert.equal(given.grant.sealedIncluded, false);
 assert.deepEqual(summariesShared([given.grant], PARENT, SPONSOR, NOW), { shared: true, until: given.grant.expiresAt });
 assert.deepEqual(summariesShared([given.grant], PARENT, 'subject-synthetic-somebody-else', NOW), { shared: false }, 'a grant is to one person');
 assert.deepEqual(summariesShared([given.grant], PARENT, SPONSOR, new Date(NOW.getTime() + 31 * DAY)), { shared: false }, 'it ends when she said');
 assert.deepEqual(summariesShared([stopGrant(given.grant, NOW)], PARENT, SPONSOR, NOW), { shared: false }, 'she stops it at once');
});

test('only the parent grants, and never for longer than the caregiver role and the founder\'s ceiling allow', () => {
 const caregiver = consent.grants.recipientRoles.find(r => r.id === 'caregiver')!;
 assert.equal(SUMMARY_DAYS_ALLOWED, Math.min(caregiver.maxExpiryDays, consent.grants.maximumExpiryDays));
 assert.deepEqual(grantSummaries({ byRef: SPONSOR, parentRef: PARENT, sponsorRef: SPONSOR, days: 30, now: NOW }), { ok: false, reason: 'only-the-parent-grants' }, 'a sponsor cannot give themselves one');
 assert.deepEqual(grantSummaries({ byRef: PARENT, parentRef: PARENT, sponsorRef: SPONSOR, days: SUMMARY_DAYS_ALLOWED + 1, now: NOW }), { ok: false, reason: 'longer-than-allowed' });
 assert.deepEqual(grantSummaries({ byRef: PARENT, parentRef: PARENT, sponsorRef: SPONSOR, days: 0, now: NOW }), { ok: false, reason: 'no-days' });
 assert.ok(grantSummaries({ byRef: PARENT, parentRef: PARENT, sponsorRef: SPONSOR, days: SUMMARY_DAYS_ALLOWED, now: NOW }).ok);
});
