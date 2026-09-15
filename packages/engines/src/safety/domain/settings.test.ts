/* The field-safety settings an admin changes: what is refused and in which words, what an accepted change
   records, and the rule the feature rests on — a timer or a panic that started before a change keeps what
   it started with. Every minute and range is read from the contract, so a new default or range moves the
   test with it rather than making it lie. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINUTE, extensionReasons, fieldSafety, serviceMinutes, type Result } from './rules.ts';
import { changeSetting, defaultTimings, defaultsInForce, inForce, keyOf, panicWindowOf, timingRows, type ChangeRequest, type SettingsChange, type SettingsInForce } from './settings.ts';
import { extend, startTimer } from './checkins.ts';
import { raisePanic } from './panics.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const api = json('../../../../catalog/apis/safety.json') as { routes: { path: string; refusals: { id: string; statement: string }[] }[] };
const statement = (id: string) => api.routes.find(r => r.path === '/v1/safety/setting-changes')!.refusals.find(r => r.id === id)!.statement;

const T0 = Date.UTC(2026, 8, 15, 6, 0);
const REASON = 'The desk asked for a shorter wait after long visits.';
type Changed = Result<{ readonly change: SettingsChange; readonly inForce: SettingsInForce }>;
const row = (id: string) => timingRows.find(r => r.id === id)!;
const ask = (history: readonly SettingsChange[], request: Partial<ChangeRequest>, at = T0): Changed =>
 changeSetting(history, { timing: 'grace', reason: REASON, expectedVersion: inForce(history).settingsVersion, byRole: 'admin', byRef: 'A-901', ...request }, at);
const refusedWith = (result: Changed, id: string, why = id) => {
 assert.ok(!result.ok, `expected ${id}: ${why}`);
 assert.equal(result.refusal.id, id, why);
 assert.equal(result.refusal.statement, statement(id), 'the sentence is the route’s, word for word');
};
const accepted = (result: Changed) => {
 if (!result.ok) assert.fail(`refused: ${result.refusal.id}`);
 return result;
};
/* A range set wrongly, for the refusals that must not lean on the range. Put back whatever happens. */
const withRange = (id: string, lowest: number, highest: number, run: () => void) => {
 const bounds = row(id) as unknown as { lowest: { value: number }; highest: { value: number } };
 const was = [bounds.lowest.value, bounds.highest.value] as const;
 bounds.lowest.value = lowest; bounds.highest.value = highest;
 try { run(); } finally { bounds.lowest.value = was[0]; bounds.highest.value = was[1]; }
};

test('the defaults are the contract’s, each inside its own range, and each id reads the default its row names', () => {
 assert.deepEqual(inForce([]), defaultsInForce);
 const blocks = fieldSafety as unknown as Record<string, Record<string, { value: number | number[] }>>;
 for (const r of timingRows) {
  const [block, key] = r.defaultFrom.split('.');
  const fromContract = blocks[block!]![key!]!.value;
  assert.deepEqual(defaultTimings[keyOf(r.id)], fromContract, `${r.id} reads ${r.defaultFrom}`);
  for (const v of Array.isArray(fromContract) ? fromContract : [fromContract]) assert.ok(v >= r.lowest.value && v <= r.highest.value, `${r.id} default ${v} sits inside ${r.lowest.value}–${r.highest.value}`);
  assert.equal(r.lowest.decidedBy, null, 'a range is a proposal');
  assert.equal(r.highest.decidedBy, null, 'a range is a proposal');
 }
});

test('only an admin, named, changes a setting, and only one that exists', () => {
 refusedWith(ask([], { byRole: 'nurse', minutes: 45 }), 'setting-change-not-permitted', 'a nurse');
 refusedWith(ask([], { byRole: 'ops-desk', minutes: 45 }), 'setting-change-not-permitted', 'the desk');
 refusedWith(ask([], { byRef: null, minutes: 45 }), 'setting-change-not-permitted', 'an admin nobody can name');
 refusedWith(ask([], { timing: 'offer-expiry', minutes: 45 }), 'setting-not-known');
});

test('a change without a reason, or against a version no longer in force, is refused', () => {
 refusedWith(ask([], { reason: undefined, minutes: 45 }), 'setting-change-without-reason', 'no reason');
 refusedWith(ask([], { reason: '   ', minutes: 45 }), 'setting-change-without-reason', 'a blank reason');
 const first = accepted(ask([], { minutes: 45 })).value.change;
 refusedWith(ask([first], { minutes: 90, expectedVersion: 1 }), 'settings-version-stale', 'a second admin who opened the screen before the first change');
 assert.ok(ask([first], { minutes: 90, expectedVersion: 2 }).ok, 'and the same change against the version in force is allowed');
});

test('zero or less is refused before the range is asked, even when the range is set wrongly', () => {
 refusedWith(ask([], { minutes: 0 }), 'setting-not-above-zero');
 refusedWith(ask([], { minutes: -15 }), 'setting-not-above-zero');
 refusedWith(ask([], { timing: 'extension-steps', stepMinutes: [0, 10] }), 'setting-not-above-zero');
 withRange('grace', 0, 120, () => refusedWith(ask([], { minutes: 0 }), 'setting-not-above-zero', 'a grace range that starts at nought'));
 withRange('panic-window', -30, 60, () => refusedWith(ask([], { timing: 'panic-window', minutes: -1 }), 'setting-not-above-zero', 'a window range that starts below nought'));
});

test('outside the range, out of order, a step the ceiling never allows, or no change at all, is refused', () => {
 const grace = row('grace');
 refusedWith(ask([], { minutes: grace.lowest.value - 1 }), 'setting-out-of-range', 'below the lowest');
 refusedWith(ask([], { minutes: grace.highest.value + 1 }), 'setting-out-of-range', 'above the highest');
 refusedWith(ask([], { minutes: 45.5 }), 'setting-out-of-range', 'not whole minutes');
 refusedWith(ask([], {}), 'setting-out-of-range', 'no value at all');
 refusedWith(ask([], { timing: 'extension-steps', stepMinutes: [20, 10] }), 'extension-steps-not-rising');
 refusedWith(ask([], { timing: 'extension-steps', stepMinutes: [10, 10] }), 'extension-steps-not-rising');
 withRange('extension-steps', row('extension-steps').lowest.value, 90, () =>
  refusedWith(ask([], { timing: 'extension-steps', stepMinutes: [10, 90] }), 'extension-step-above-the-ceiling', 'a step larger than the ceiling in force'));
 withRange('extension-ceiling', 5, row('extension-ceiling').highest.value, () =>
  refusedWith(ask([], { timing: 'extension-ceiling', minutes: Math.max(...defaultTimings.extensionSteps) - 1 }), 'extension-step-above-the-ceiling', 'a ceiling below the largest step in force'));
 refusedWith(ask([], { minutes: defaultTimings.graceMinutes }), 'setting-unchanged');
});

test('an accepted change records who, when, from, to and why, and publishes nothing', () => {
 const { value, emits } = accepted(ask([], { minutes: 45 }, T0 + 5 * MINUTE));
 assert.deepEqual(value.change, { settingsVersion: 2, timing: 'grace', from: defaultTimings.graceMinutes, to: 45, reason: REASON, byRole: 'admin', byRef: 'A-901', at: T0 + 5 * MINUTE });
 assert.deepEqual(value.inForce, inForce([value.change]), 'what is in force is the history replayed');
 assert.equal(value.inForce.timings.graceMinutes, 45);
 assert.deepEqual(emits, [], 'no engine acts on a settings change, and the event contract refuses an event nobody subscribes to');
 const steps = accepted(ask([value.change], { timing: 'extension-steps', stepMinutes: [5, 15, 25] })).value;
 assert.deepEqual(steps.inForce.timings.extensionSteps, [5, 15, 25]);
 assert.equal(steps.inForce.timings.graceMinutes, 45, 'a later change keeps the earlier one');
});

test('a timer that started before a change keeps its deadline, its steps and its ceiling', () => {
 const visit = { event: { appointmentRef: 'APT-1', visitCodeMatched: true }, serviceId: 'wound', nurseRef: 'N-205' };
 const before = startTimer({ ...visit, checkinRef: 'CHK-1' }, T0, defaultsInForce);
 assert.ok(before.ok);
 const shorter = accepted(ask([], { minutes: row('grace').lowest.value }, T0 + 5 * MINUTE)).value.change;
 const lowerCeiling = accepted(ask([shorter], { timing: 'extension-ceiling', minutes: Math.max(...defaultTimings.extensionSteps) }, T0 + 6 * MINUTE)).value.change;
 const now = inForce([shorter, lowerCeiling]);

 assert.equal(before.value.settingsVersion, 1);
 assert.equal(before.value.dueAt, T0 + (serviceMinutes('wound')! + defaultTimings.graceMinutes) * MINUTE, 'the running visit’s deadline did not move');
 const after = startTimer({ ...visit, checkinRef: 'CHK-2', event: { ...visit.event, appointmentRef: 'APT-2' } }, T0 + 10 * MINUTE, now);
 assert.ok(after.ok);
 assert.equal(after.value.settingsVersion, 3);
 assert.equal(after.value.dueAt, T0 + 10 * MINUTE + (serviceMinutes('wound')! + row('grace').lowest.value) * MINUTE, 'the next visit reads the change');

 /* The running timer still has the ceiling it was given; the next one has the lower ceiling. */
 const reasonId = extensionReasons[0]!.id;
 const biggest = Math.max(...defaultTimings.extensionSteps);
 const once = extend(before.value, { minutes: biggest, reasonId }, T0 + 20 * MINUTE);
 assert.ok(once.ok);
 assert.ok(extend(once.value, { minutes: biggest, reasonId }, T0 + 21 * MINUTE).ok === (biggest * 2 <= defaultTimings.maxExtensionMinutes));
 const next = extend(after.value, { minutes: biggest, reasonId }, T0 + 20 * MINUTE);
 assert.ok(next.ok);
 const nextAgain = extend(next.value, { minutes: biggest, reasonId }, T0 + 21 * MINUTE);
 assert.equal(!nextAgain.ok && nextAgain.refusal.id, 'extension-limit');
});

test('a panic open before a change keeps its end, and a phone that read the old window is given the one in force', () => {
 const pressed = raisePanic({ panicRef: 'PNC-1', raisedByRole: 'nurse', nurseRef: 'N-205', appointmentRef: 'APT-1', locationShareMinutes: defaultTimings.panicWindowMinutes }, T0, panicWindowOf([]));
 assert.ok(pressed.ok);
 const end = pressed.value.locationShareEndsAt;
 const longer = accepted(ask([], { timing: 'panic-window', minutes: row('panic-window').highest.value }, T0 + MINUTE)).value.change;
 const window = panicWindowOf([longer]);
 assert.equal(pressed.value.locationShareEndsAt, end);
 assert.equal(pressed.value.settingsVersion, 1);
 assert.deepEqual([...window.accepts].sort((a, b) => a - b), [defaultTimings.panicWindowMinutes, row('panic-window').highest.value].sort((a, b) => a - b));

 const stale = raisePanic({ panicRef: 'PNC-2', raisedByRole: 'nurse', nurseRef: 'N-206', locationShareMinutes: defaultTimings.panicWindowMinutes }, T0 + 2 * MINUTE, window);
 assert.ok(stale.ok, 'a panic is never refused because an admin changed a setting');
 assert.equal(stale.value.locationShareEndsAt, T0 + 2 * MINUTE + window.minutes * MINUTE, 'and it opens the window in force, not the one the phone sent');
 assert.equal(stale.value.settingsVersion, 2);
 const chosen = raisePanic({ panicRef: 'PNC-3', raisedByRole: 'nurse', nurseRef: 'N-206', locationShareMinutes: window.minutes * 24 }, T0 + 2 * MINUTE, window);
 assert.equal(!chosen.ok && chosen.refusal.id, 'window-not-the-declared-one', 'a window no version ever held is still refused');
});

test('a history that skips a version is refused rather than read around', () => {
 const change = accepted(ask([], { minutes: 45 })).value.change;
 assert.throws(() => inForce([{ ...change, settingsVersion: 3 }]), /never edited/);
});
