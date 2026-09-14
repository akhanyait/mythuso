/* Panic on a simulated clock: the window, the position stopping at whichever end comes first, and
   nothing kept afterwards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINUTE, clockOf, outcomes, panicWindowMinutes, positionDecimals } from './rules.ts';
import { acknowledge, isSharing, positionFor, raisePanic, receivePosition, resolve, sharingEndsAt, stretchWindow, sweep, type DeskActor, type Panic } from './panics.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const events = json('../../../../catalog/events.json') as { events: { type: string; version: number; payload: { field: string }[]; neverCarries: { field: string }[] }[] };
const T0 = Date.UTC(2026, 8, 14, 9, 30);
const desk: DeskActor = { kind: 'person', role: 'ops-desk', ref: 'O-801' };
const raised = (): Panic => {
 const result = raisePanic({ panicRef: 'PNC-1', raisedByRole: 'nurse', nurseRef: 'N-205', appointmentRef: 'APT-1', locationShareMinutes: panicWindowMinutes }, T0);
 assert.ok(result.ok);
 return result.value;
};
const value = <T>(result: { ok: true; value: T } | { ok: false; refusal: { id: string } }): T => {
 if (!result.ok) assert.fail(`refused: ${result.refusal.id}`);
 return result.value;
};

test('pressing panic opens the declared window and emits panic.raised without a position', () => {
 const result = raisePanic({ panicRef: 'PNC-1', raisedByRole: 'nurse', nurseRef: 'N-205', locationShareMinutes: panicWindowMinutes }, T0);
 assert.ok(result.ok);
 assert.equal(result.value.locationShareEndsAt, T0 + panicWindowMinutes * MINUTE);
 const [emitted] = result.emits;
 const declared = events.events.find(e => e.type === 'panic.raised' && e.version === emitted.version)!;
 assert.deepEqual(Object.keys(emitted.payload).sort(), declared.payload.map(p => p.field).sort());
 for (const never of declared.neverCarries) assert.ok(!(never.field in emitted.payload), `panic.raised never carries ${never.field}`);
});

test('a window with no end, or one the phone chose, is refused', () => {
 for (const minutes of [undefined, null, 0, -5, Number.POSITIVE_INFINITY]) {
  const r = raisePanic({ panicRef: 'P', raisedByRole: 'nurse', nurseRef: 'N', locationShareMinutes: minutes }, T0);
  assert.equal(!r.ok && r.refusal.id, 'share-without-end', `window ${minutes}`);
 }
 const longer = raisePanic({ panicRef: 'P', raisedByRole: 'nurse', nurseRef: 'N', locationShareMinutes: panicWindowMinutes * 24 }, T0);
 assert.equal(!longer.ok && longer.refusal.id, 'window-not-the-declared-one');
 assert.equal(stretchWindow().refusal.id, 'window-does-not-stretch');
});

test('during the window the desk sees the latest position, rounded to the declared precision', () => {
 let panic = raised();
 assert.equal(value(positionFor(panic, T0)), null, 'nothing has arrived yet, and that is said rather than guessed');
 panic = value(receivePosition(panic, { lat: -26.2471234, lng: 27.9119876 }, T0 + 15_000));
 panic = value(receivePosition(panic, { lat: -26.2489999, lng: 27.9130001 }, T0 + 30_000));
 const seen = value(positionFor(panic, T0 + 31_000))!;
 assert.equal(seen.lat, Number((-26.2489999).toFixed(positionDecimals)));
 assert.equal(seen.at, T0 + 30_000);
 assert.ok(!Array.isArray((panic as unknown as Record<string, unknown>).positions), 'only the latest position is held');
});

test('the window running out stops sharing, refuses the position with when it ended, and keeps nothing', () => {
 let panic = value(receivePosition(raised(), { lat: -26.247, lng: 27.911 }, T0 + MINUTE));
 const end = panic.locationShareEndsAt;
 assert.ok(isSharing(panic, end - 1));
 assert.ok(!isSharing(panic, end));
 const after = positionFor(panic, end);
 assert.ok(!after.ok);
 assert.equal(after.refusal.id, 'position-after-the-window');
 assert.ok(after.refusal.statement.includes(clockOf(end)), after.refusal.statement);
 const late = receivePosition(panic, { lat: -26.25, lng: 27.92 }, end + 1);
 assert.equal(!late.ok && late.refusal.id, 'position-after-the-window');
 panic = sweep(panic, end);
 assert.equal(panic.position, null, 'no location is retained beyond the window');
 assert.equal(sweep(raised(), T0 + MINUTE).locationShareEndsAt, raised().locationShareEndsAt, 'a sweep inside the window changes nothing');
});

test('resolving stops sharing at once, before the window, and needs a person, a pick-up and an outcome', () => {
 const panic = value(receivePosition(raised(), { lat: -26.247, lng: 27.911 }, T0 + MINUTE));
 const engine = acknowledge(panic, { kind: 'engine', engine: 'core' }, T0 + 2 * MINUTE);
 assert.equal(!engine.ok && engine.refusal.id, 'dispatch-from-a-panic-without-a-person');
 const early = resolve(panic, { outcomeId: outcomes[0].id, actor: desk }, T0 + 2 * MINUTE);
 assert.equal(!early.ok && early.refusal.id, 'panic-resolved-before-acknowledged');
 const picked = value(acknowledge(panic, desk, T0 + 2 * MINUTE));
 const noOutcome = resolve(picked, { actor: desk }, T0 + 3 * MINUTE);
 assert.equal(!noOutcome.ok && noOutcome.refusal.id, 'panic-resolved-without-outcome');
 const byEngine = resolve(picked, { outcomeId: outcomes[0].id, actor: { kind: 'engine', engine: 'movement' } }, T0 + 3 * MINUTE);
 assert.equal(!byEngine.ok && byEngine.refusal.id, 'dispatch-from-a-panic-without-a-person');
 const at = T0 + 4 * MINUTE;
 const done = value(resolve(picked, { outcomeId: outcomes[0].id, actor: desk }, at));
 assert.equal(sharingEndsAt(done), at, 'whichever comes first');
 assert.equal(done.position, null);
 assert.ok(!positionFor(done, at).ok);
 const again = resolve(done, { outcomeId: outcomes[0].id, actor: desk }, at + MINUTE);
 assert.equal(!again.ok && again.refusal.id, 'panic-already-resolved');
});
