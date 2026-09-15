/**
 * Who confirms a clinical review is Clinical's review-confirmer setting in force, on Clinical's own review route and
 * on every other engine's, which asks Clinical rather than the vetting register.
 *
 * With the setting at its default a nurse is refused a confirmation on Clinical and on Care, and refused a read of the
 * settings she would confirm. An admin names her beside the doctor, with a reason, and the change is in Clinical's
 * history like any other: who, when, from, to and why. After it she confirms on both engines, and the review is
 * recorded against her. An engine that cannot hear Clinical confirms nobody, rather than falling back to a list.
 * This file sits beside the engines because it binds two, and an engine's own directory reaches no other engine.
 * Nothing here is a real service.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import settingsContract from '../../catalog/settings.json' with { type: 'json' };
import clinicalContract from '../../catalog/clinical.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, type RouteKey } from './runtime/index.ts';
import { engine as clinical } from './clinical/engine.ts';
import { engine as care } from './care/engine.ts';
import { clinicalByDefault } from './clinical/domain/settings.ts';

const START = '2026-09-16T09:00:00+02:00';
const ADMIN = { role: 'admin', ref: 'party-synthetic-admin', purpose: 'audit' };
const NURSE = { role: 'nurse', ref: 'party-synthetic-nurse', purpose: 'audit' };
const DOCTOR = { role: 'doctor', ref: 'party-synthetic-doctor', purpose: 'audit' };
const R = {
 clinicalRead: 'GET /v1/clinical/settings@2', clinicalChange: 'POST /v1/clinical/setting-changes@1', clinicalReview: 'POST /v1/clinical/setting-reviews@2',
 careRead: 'GET /v1/care/settings@2', careReview: 'POST /v1/care/setting-reviews@2'
} as const;
const CONFIRMER = clinicalContract.reviews.confirmerSetting;
const REASON = 'A senior nurse confirms reviews overnight, when no doctor is on the panel.';

type Caller = { role: string; ref: string | null; purpose: string };
type Answer = { status: number; body: Record<string, unknown> };
const sentence = (kind: string, id: string) => settingsContract.refusals.find(r => r.route === kind && r.id === id)!.statement;
const refusedAs = (answer: Answer, kind: string, id: string) => assert.deepEqual([answer.status, answer.body['error'], answer.body['message']], [403, id, sentence(kind, id)], JSON.stringify(answer.body));

function world(engines = [clinical, care]) {
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines, dataDirectory: MEMORY, clock: createClock(START) });
 const call = (key: string, caller: Caller, fields: Record<string, unknown>): Answer => runtime.call(key as RouteKey, { ...caller, fields });
 const confirm = (key: string, caller: Caller, setting: string, idempotencyKey: string, settingsVersion = 1) =>
  call(key, caller, { idempotencyKey, setting, settingsVersion, reason: 'Synthetic, for the test.' });
 return { runtime, call, confirm };
}

test('with review-confirmer at the doctor alone a nurse is refused on every engine; named beside the doctor, with the change audited, she confirms on every engine', () => {
 const { runtime, call, confirm } = world();
 assert.deepEqual(clinicalByDefault.confirmers, clinicalContract.settings.items.find(s => s.key === CONFIRMER)!.default.value);
 assert.ok(!clinicalByDefault.confirmers.includes('nurse'), 'the default does not name a nurse');

 refusedAs(confirm(R.clinicalReview, NURSE, 'prom-days', 'n-1'), 'review', 'setting-review-not-permitted');
 refusedAs(confirm(R.careReview, NURSE, 'injection-roles', 'n-2'), 'review', 'setting-review-not-permitted');
 refusedAs(call(R.careRead, NURSE, {}), 'read', 'settings-read-not-permitted');
 assert.equal(call(R.careRead, DOCTOR, {}).status, 200, 'the doctor the setting names reads Care\'s settings');

 const changed = call(R.clinicalChange, ADMIN, { idempotencyKey: 'c-1', setting: CONFIRMER, roles: ['doctor', 'nurse'], reason: REASON, expectedVersion: 1 });
 assert.equal(changed.status, 200, JSON.stringify(changed.body));
 const history = call(R.clinicalRead, ADMIN, {}).body['history'] as { settingsVersion: number; setting: string; from: unknown; to: unknown; reason: string; byRole: string; byRef: string; at: string }[];
 assert.deepEqual(history.map(h => [h.settingsVersion, h.setting, h.from, h.to, h.reason, h.byRole, h.byRef, h.at]),
  [[2, CONFIRMER, ['doctor'], ['doctor', 'nurse'], REASON, ADMIN.role, ADMIN.ref, new Date(START).toISOString()]], 'audited like any setting change');
 const row = (call(R.clinicalRead, ADMIN, {}).body['settings'] as { setting: string; inForce: unknown; setAtVersion: number; reviewed: unknown }[]).find(s => s.setting === CONFIRMER)!;
 assert.deepEqual([row.inForce, row.setAtVersion, row.reviewed], [['doctor', 'nurse'], 2, null], 'in force at once, and not clinically reviewed');

 assert.equal(confirm(R.clinicalReview, NURSE, 'prom-days', 'n-3').status, 200);
 assert.equal(confirm(R.careReview, NURSE, 'injection-roles', 'n-4').status, 200);
 const careRow = (call(R.careRead, NURSE, {}).body['settings'] as { setting: string; reviewed: { byRef: string } | null }[]).find(s => s.setting === 'injection-roles')!;
 assert.equal(careRow.reviewed?.byRef, NURSE.ref, 'recorded against the nurse who confirmed it');

 /* The change to who confirms waits on a review of its own, by whoever it names now, and never by the admin who made it. */
 refusedAs(confirm(R.clinicalReview, { ...DOCTOR, ref: ADMIN.ref }, CONFIRMER, 'self', 2), 'review', 'setting-review-own-change');
 assert.equal(confirm(R.clinicalReview, DOCTOR, CONFIRMER, 'd-1', 2).status, 200);
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an engine that cannot hear Clinical confirms nobody, rather than a list somebody typed', () => {
 const { runtime, call, confirm } = world([care]);
 refusedAs(confirm(R.careReview, DOCTOR, 'injection-roles', 'd-1'), 'review', 'setting-review-not-permitted');
 refusedAs(call(R.careRead, DOCTOR, {}), 'read', 'settings-read-not-permitted');
 assert.equal(call(R.careRead, ADMIN, {}).status, 200, 'the admin who changes them still reads them');
 runtime.close();
});
