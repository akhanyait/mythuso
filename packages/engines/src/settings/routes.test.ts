/* The shared settings routes on the runtime, for what Safety and Care cannot show yet: a clinical review
 * confirmed through its route, a rota travelling as a list of windows and a record as one object.
 *
 * No engine has a setting that waits on a clinical review, a schedule or a record today, so the routes are
 * synthetic: the three shapes in packages/catalog/settings.json, with their shared refusals, added to a copy
 * of the loaded contract under Core's name and bound through settingsRoutes() exactly as an engine binds
 * them. Nothing here is written into packages/catalog/apis. Every binder rule still applies — callers,
 * purpose, the idempotency key, field types — so what is tested is the route a lead gets when they add one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import settings from '../../../catalog/settings.json' with { type: 'json' };
import { loadRuntimeContract, type ContractRoute, type RuntimeContract } from '../runtime/contract.ts';
import { MEMORY, createClock, createRuntime, defineEngine, type RouteKey } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsRoutes } from './routes.ts';
import type { SettingsBlock } from './shape.ts';

const START = '2026-09-15T08:00:00+02:00';
const WHY = 'Synthetic, for the settings route tests.';
const WEEK = [...settings.days];
const proposal = { decidedBy: null, proposedBy: 'Platform Settings lead (Wave 3)', proposedBecause: WHY };
const bound = (value: number) => ({ value, ...proposal });

const key = (kind: 'read' | 'change' | 'review') => {
 const t = settings.routes[kind];
 return `${t.method} /v1/core/test-${t.resource}@${t.version}` as RouteKey;
};
const READ = key('read');
const CHANGE = key('change');
const REVIEW = key('review');

function contract(): RuntimeContract {
 const base = loadRuntimeContract();
 const callers = { read: ['admin', 'doctor'], change: ['admin'], review: ['doctor'] };
 const added: ContractRoute[] = (['read', 'change', 'review'] as const).map(kind => {
  const t = settings.routes[kind];
  const path = `/v1/core/test-${t.resource}`;
  return {
   method: t.method, path, version: t.version, summary: WHY, status: 'proposed', callers: callers[kind], purpose: t.purpose,
   request: t.request, response: t.response, refusals: settings.refusals.filter(r => r.route === kind), idempotent: t.idempotent,
   engine: 'core', file: 'packages/engines/src/settings/routes.test.ts', mountedPath: path, key: key(kind)
  };
 });
 return { ...base, routes: [...base.routes, ...added], byKey: new Map([...base.byKey, ...added.map(route => [route.key, route] as const)]) };
}

const block: SettingsBlock = {
 engine: 'core', heading: 'Synthetic', intro: WHY, defaults: { version: 1, changelog: [] },
 items: [
  { key: 'injection-roles', label: 'Who may give an injection', help: 'The roles an injection visit may be offered to.', owner: 'core', type: 'roleList', unit: null,
    default: { value: ['nurse', 'locum'], ...proposal }, allowedRoles: { roles: ['nurse', 'locum', 'doctor'], ...proposal },
    reviewRequired: 'sign-clinical-review', changedBy: 'admin', appliesTo: WHY },
  { key: 'rota', label: 'Desk rota', help: 'Which post is on the desk, and when.', owner: 'core', type: 'schedule', unit: null,
    posts: [{ id: 'desk-operator', label: 'Desk operator', role: 'operator' }],
    mustCover: [{ post: 'desk-operator', days: WEEK, from: '06:00', to: '22:00', why: WHY }],
    default: { value: [{ post: 'desk-operator', days: WEEK, from: '06:00', to: '22:00' }], ...proposal }, changedBy: 'admin', appliesTo: WHY },
  { key: 'callouts', label: 'Urgent call-outs', help: 'How many, and per what.', owner: 'core', type: 'record', unit: null,
    parts: [{ key: 'count', label: 'Call-outs', type: 'count', positive: false, bounds: { lowest: bound(0), highest: bound(4) } },
     { key: 'period', label: 'Per', type: 'enum', allowed: [{ value: 'month', label: 'Month', ...proposal }, { value: 'year', label: 'Year', ...proposal }] }],
    default: { value: { count: 1, period: 'month' }, ...proposal }, changedBy: 'admin', appliesTo: WHY }
 ]
};

function runtime() {
 const engine = defineEngine({ id: 'core', store: { schema: SETTINGS_SCHEMA }, subscriptions: {}, routes: settingsRoutes({ block }, { read: READ, change: CHANGE, review: REVIEW }, { confirmers: () => ['doctor'] }) });
 return createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine], dataDirectory: MEMORY, clock: createClock(START), contract: contract() });
}
const ADMIN = { role: 'admin', ref: 'A-901', purpose: 'audit' };
const DOCTOR = { role: 'doctor', ref: 'D-301', purpose: 'audit' };
const sentence = (kind: string, id: string) => settings.refusals.find(r => r.route === kind && r.id === id)!.statement;
const REASON = 'Inside a registered nurse’s general scope, awaiting the Clinical Governance Lead.';

test('a clinical review is confirmed through its route, against the value in force, by a doctor, once, and replayed under its key', () => {
 const rt = runtime();
 const changed = rt.call(CHANGE, { ...ADMIN, fields: { idempotencyKey: 'c-1', setting: 'injection-roles', roles: ['nurse'], reason: 'Locums are not yet covered for injections.', expectedVersion: 1 } });
 assert.deepEqual([changed.status, changed.body.settingsVersion], [200, 2], JSON.stringify(changed.body));

 const row = () => (rt.call(READ, { ...ADMIN, fields: {} }).body.settings as { setting: string; inForce: unknown; reviewRequired: string | null; reviewed: { byRef: string } | null }[]).find(s => s.setting === 'injection-roles')!;
 assert.deepEqual([row().inForce, row().reviewRequired, row().reviewed], [['nurse'], 'sign-clinical-review', null], 'in force, and not clinically reviewed');

 const refused = (answer: { body: Record<string, unknown> }, id: string) => assert.deepEqual([answer.body.error, answer.body.message], [id, sentence('review', id)], JSON.stringify(answer.body));
 refused(rt.call(REVIEW, { ...DOCTOR, fields: { idempotencyKey: 'r-old', setting: 'injection-roles', settingsVersion: 1, reason: REASON } }), 'setting-review-not-in-force');
 refused(rt.call(REVIEW, { ...DOCTOR, fields: { idempotencyKey: 'r-none', setting: 'injection-roles', settingsVersion: 2 } }), 'setting-review-without-reason');
 refused(rt.call(REVIEW, { ...DOCTOR, fields: { idempotencyKey: 'r-rota', setting: 'rota', settingsVersion: 1, reason: REASON } }), 'setting-review-not-needed');
 assert.equal(rt.call(REVIEW, { ...ADMIN, fields: { idempotencyKey: 'r-admin', setting: 'injection-roles', settingsVersion: 2, reason: REASON } }).body.error, 'caller-not-allowed', 'the binder admits the capability’s holders and nobody else');

 const reviewed = rt.call(REVIEW, { ...DOCTOR, fields: { idempotencyKey: 'r-1', setting: 'injection-roles', settingsVersion: 2, reason: REASON } });
 assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
 assert.deepEqual(reviewed.body, { settingsVersion: 2, reviewedAt: new Date(START).toISOString() });
 assert.deepEqual(rt.call(REVIEW, { ...DOCTOR, fields: { idempotencyKey: 'r-1', setting: 'injection-roles', settingsVersion: 2, reason: REASON } }).body, reviewed.body, 'the same key is the same confirmation once');
 refused(rt.call(REVIEW, { role: 'doctor', ref: 'D-302', purpose: 'audit', fields: { idempotencyKey: 'r-2', setting: 'injection-roles', settingsVersion: 2, reason: REASON } }), 'setting-review-already-confirmed');
 assert.equal(row().reviewed?.byRef, 'D-301');
 assert.deepEqual(rt.faults(), []);
 rt.close();
});

test('a rota travels as windows of a post and hours, a record as one object, and the binder refuses them in the wrong shape', () => {
 const rt = runtime();
 const change = (fields: Record<string, unknown>) => rt.call(CHANGE, { ...ADMIN, fields: { reason: WHY, ...fields } });
 const shifts = [{ post: 'desk-operator', days: WEEK, from: '06:00', to: '14:00' }, { post: 'desk-operator', days: WEEK, from: '14:00', to: '22:00' }];
 assert.equal(change({ idempotencyKey: 'rota', setting: 'rota', windows: shifts, expectedVersion: 1 }).status, 200);
 const named = change({ idempotencyKey: 'named', setting: 'rota', windows: [{ ...shifts[0], nurse: 'Naledi Mokoena' }, shifts[1]], expectedVersion: 2 });
 assert.deepEqual([named.body.error, named.body.message], ['setting-value-wrong-type', sentence('change', 'setting-value-wrong-type')], 'a rota names posts, never people');
 assert.equal(change({ idempotencyKey: 'gap', setting: 'rota', windows: [shifts[0]], expectedVersion: 2 }).body.error, 'setting-schedule-leaves-a-gap');
 assert.equal(change({ idempotencyKey: 'record', setting: 'callouts', parts: { count: 4, period: 'year' }, expectedVersion: 2 }).status, 200);
 assert.equal(change({ idempotencyKey: 'record-text', setting: 'callouts', parts: '4 a year', expectedVersion: 3 }).body.error, 'field-of-the-wrong-type');
 const read = rt.call(READ, { ...DOCTOR, fields: {} }).body;
 assert.equal(read.settingsVersion, 3);
 assert.deepEqual((read.history as { setting: string; to: unknown }[]).map(h => [h.setting, h.to]), [['rota', shifts], ['callouts', { count: 4, period: 'year' }]]);
 assert.deepEqual(rt.faults(), []);
 rt.close();
});
