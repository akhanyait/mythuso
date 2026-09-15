/* The badge cache: what Care may learn from Verify, and what it refuses to. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careContract } from './contract.ts';
import { HEARD, TrustCache } from './trust.ts';

test('a person never heard about has no badge, not a default one', () => {
 assert.deepEqual(new TrustCache(careContract.badgeTiers).standing('nobody'), { current: false, why: 'never-heard' });
});

test('the latest event wins, and a redelivered older one cannot restore a withdrawn badge', () => {
 const cache = new TrustCache(careContract.badgeTiers);
 assert.ok(cache.learn({ ...HEARD, subjectRef: 'n', occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } }));
 assert.ok(cache.learn({ ...HEARD, subjectRef: 'n', occurredAt: '2026-09-14T07:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: false } }));
 assert.equal(cache.learn({ ...HEARD, subjectRef: 'n', occurredAt: '2026-09-14T06:30:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } }), false);
 assert.deepEqual(cache.standing('n'), { current: false, why: 'hard-gates-failed' });
});

test('only the version Care is built against is heard, and nothing but the badge and the gates is kept', () => {
 const cache = new TrustCache(careContract.badgeTiers);
 assert.equal(cache.learn({ type: HEARD.type, version: HEARD.version + 1, subjectRef: 'n', occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } }), false);
 assert.equal(cache.learn({ type: 'person.verified', version: HEARD.version, subjectRef: 'n', occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true } }), false);
 /* A publisher that sends more than the event may carry finds nowhere to put it. */
 const loud = { ...HEARD, subjectRef: 'n', occurredAt: '2026-09-14T06:00:00+02:00', payload: { badgeTier: 'verified', hardGatesPassed: true, score: 88 } };
 assert.ok(cache.learn(loud));
 assert.deepEqual(cache.standing('n'), { current: true, badgeTier: 'verified' });
 assert.equal(JSON.stringify(cache.standing('n')).includes('88'), false);
});
