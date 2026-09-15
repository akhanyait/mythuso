/* The field-safety timings over the shared settings shape: what is refused and in which words, what an
   accepted change records, Safety's own rule between two of its settings, and the rule the feature rests
   on — a timer or a panic that started before a change keeps what it started with. Every minute and bound
   is read from the contract, so a new default or bound moves the test with it rather than making it lie.
   The shared rules on every type are tested in packages/engines/src/settings/shape.test.ts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINUTE, extensionReasons, serviceMinutes } from './rules.ts';
import { changeSetting, defaultTimings, defaultsInForce, inForce, keyOf, panicWindowOf, safetyBlock, sentinelSettingsOf, sosSettingsOf, type SettingsInForce, type TimingId } from './settings.ts';
import type { Bound, Change, ChangeRequest, Result } from '../../settings/shape.ts';
import { extend, startTimer } from './checkins.ts';
import { raisePanic } from './panics.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const shared = json('../../../../catalog/settings.json') as { refusals: { route: string; id: string; statement: string }[] };
const api = json('../../../../catalog/apis/safety.json') as { routes: { path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const routeRefusals = api.routes.find(r => r.path === '/v1/safety/setting-changes' && r.version === 2)!.refusals;
/* The sentence a refusal is rendered in: the shared one, or Safety's own for its rule between settings. */
const statement = (id: string) => shared.refusals.find(r => r.route === 'change' && r.id === id)?.statement ?? routeRefusals.find(r => r.id === id)!.statement;

const T0 = Date.UTC(2026, 8, 15, 6, 0);
const REASON = 'The desk asked for a shorter wait after long visits.';
type Changed = Result<{ readonly change: Change; readonly inForce: SettingsInForce }>;
const setting = (key: string) => safetyBlock.items.find(s => s.key === key)!;
const bounds = (key: string) => setting(key).bounds as { lowest: Bound; highest: Bound };
const ask = (history: readonly Change[], request: Partial<ChangeRequest>, at = T0): Changed =>
 changeSetting(history, { setting: 'grace', value: undefined, reason: REASON, expectedVersion: inForce(history).settingsVersion, byRole: 'admin', byRef: 'A-901', ...request }, at);
const refusedWith = (result: Changed, id: string, why = id) => {
 assert.ok(!result.ok, `expected ${id}: ${why}`);
 assert.equal(result.refusal.id, id, why);
 assert.equal(result.refusal.statement, statement(id), 'the sentence is the contract’s, word for word');
};
const accepted = (result: Changed) => {
 if (!result.ok) assert.fail(`refused: ${result.refusal.id}`);
 return result;
};
/* Bounds set wrongly, for the refusals that must not lean on them. Put back whatever happens. */
const withBounds = (key: string, lowest: number, highest: number, run: () => void) => {
 const b = bounds(key) as { lowest: { value: number }; highest: { value: number } };
 const was = [b.lowest.value, b.highest.value] as const;
 b.lowest.value = lowest; b.highest.value = highest;
 try { run(); } finally { b.lowest.value = was[0]; b.highest.value = was[1]; }
};

test('the defaults are the contract’s, each inside its own bounds, and each setting is the timing its key names', () => {
 assert.deepEqual(inForce([]), defaultsInForce);
 assert.deepEqual(safetyBlock.items.map(s => s.key), ['grace', 'panic-window', 'extension-steps', 'extension-ceiling', 'stale-panic-window-uses-window-in-force', 'settings-changed-by', 'sos-area-window', 'next-of-kin-alert-window', 'next-of-kin-alert-retries', 'sentinel-baseline-window-days', 'sentinel-baseline-minimum-readings']);
 /* Wave 5 added the two a Sentinel baseline is opened under. They wait on a clinical review, and are held to what
    sentinelSettingsOf reads rather than to a timing key. */
 const sentinel = sentinelSettingsOf([]);
 assert.deepEqual([sentinel.windowDays, sentinel.minimumReadings], ['sentinel-baseline-window-days', 'sentinel-baseline-minimum-readings'].map(key => safetyBlock.items.find(s => s.key === key)!.default.value));
 for (const key of ['sentinel-baseline-window-days', 'sentinel-baseline-minimum-readings']) assert.equal(safetyBlock.items.find(s => s.key === key)!.reviewRequired, 'sign-clinical-review', `${key} waits on a clinical review`);
 /* Wave 4 added three settings an SOS is pressed under. They are not timings a visit or a panic is handed, so they are
    held to what sosSettingsOf reads rather than to a timing key. */
 const sos = sosSettingsOf([]);
 assert.deepEqual([sos.areaWindowMinutes, sos.alertWindowMinutes, sos.alertRetries], ['sos-area-window', 'next-of-kin-alert-window', 'next-of-kin-alert-retries'].map(key => safetyBlock.items.find(s => s.key === key)!.default.value));
 for (const s of safetyBlock.items.filter(s => s.bounds && Object.hasOwn(defaultTimings, keyOf(s.key as TimingId) ?? ''))) {
  assert.deepEqual(defaultTimings[keyOf(s.key as TimingId)], s.default.value, `${s.key} is the timing it names`);
  const b = bounds(s.key);
  for (const v of Array.isArray(s.default.value) ? s.default.value as number[] : [s.default.value as number]) assert.ok(v >= b.lowest.value && v <= b.highest.value, `${s.key} default ${v} sits inside ${b.lowest.value}–${b.highest.value}`);
  assert.equal(b.lowest.decidedBy, null, 'a bound is a proposal');
  assert.equal(b.highest.decidedBy, null, 'a bound is a proposal');
  assert.equal(s.owner, 'safety');
 }
});

test('only an admin, named, changes a setting, and only one Safety holds', () => {
 refusedWith(ask([], { byRole: 'nurse', value: 45 }), 'setting-change-not-permitted', 'a nurse');
 refusedWith(ask([], { byRole: 'operator', value: 45 }), 'setting-change-not-permitted', 'the operator, until settings-changed-by names her');
 refusedWith(ask([], { byRef: null, value: 45 }), 'setting-change-not-permitted', 'an admin nobody can name');
 refusedWith(ask([], { setting: 'offer-expiry', value: 45 }), 'setting-not-known', 'Care’s offer expiry is Care’s, not Safety’s');
});

test('a change without a reason, or against a version no longer in force, is refused', () => {
 refusedWith(ask([], { reason: undefined, value: 45 }), 'setting-change-without-reason', 'no reason');
 refusedWith(ask([], { reason: '   ', value: 45 }), 'setting-change-without-reason', 'a blank reason');
 const first = accepted(ask([], { value: 45 })).value.change;
 refusedWith(ask([first], { value: 90, expectedVersion: 1 }), 'settings-version-stale', 'a second admin who opened the screen before the first change');
 assert.ok(ask([first], { value: 90, expectedVersion: 2 }).ok, 'and the same change against the version in force is allowed');
});

test('nought or less is refused before the bounds are asked, even when the bounds are set wrongly', () => {
 refusedWith(ask([], { value: 0 }), 'setting-not-above-zero');
 refusedWith(ask([], { value: -15 }), 'setting-not-above-zero');
 refusedWith(ask([], { setting: 'extension-steps', value: [0, 10] }), 'setting-not-above-zero');
 withBounds('grace', 0, 120, () => refusedWith(ask([], { value: 0 }), 'setting-not-above-zero', 'a grace whose bounds start at nought'));
 withBounds('panic-window', -30, 60, () => refusedWith(ask([], { setting: 'panic-window', value: -1 }), 'setting-not-above-zero', 'a window whose bounds start below nought'));
});

test('the wrong kind of value, outside the bounds, out of order, a step the ceiling never allows, or no change at all, is refused', () => {
 const grace = bounds('grace');
 refusedWith(ask([], { value: grace.lowest.value - 1 }), 'setting-out-of-range', 'below the lowest');
 refusedWith(ask([], { value: grace.highest.value + 1 }), 'setting-out-of-range', 'above the highest');
 refusedWith(ask([], { value: 45.5 }), 'setting-value-wrong-type', 'not whole minutes');
 refusedWith(ask([], {}), 'setting-value-wrong-type', 'no value at all');
 refusedWith(ask([], { value: [45] }), 'setting-value-wrong-type', 'a list for one number');
 refusedWith(ask([], { setting: 'extension-steps', value: 10 }), 'setting-value-wrong-type', 'one number for a list');
 refusedWith(ask([], { setting: 'extension-steps', value: [] }), 'setting-out-of-range', 'no steps at all');
 refusedWith(ask([], { setting: 'extension-steps', value: [5, 10, 15, 20] }), 'setting-out-of-range', 'more steps than a nurse can press at a door');
 refusedWith(ask([], { setting: 'extension-steps', value: [20, 10] }), 'extension-steps-not-rising');
 refusedWith(ask([], { setting: 'extension-steps', value: [10, 10] }), 'extension-steps-not-rising');
 withBounds('extension-steps', bounds('extension-steps').lowest.value, 90, () =>
  refusedWith(ask([], { setting: 'extension-steps', value: [10, 90] }), 'extension-step-above-the-ceiling', 'a step larger than the ceiling in force'));
 withBounds('extension-ceiling', 5, bounds('extension-ceiling').highest.value, () =>
  refusedWith(ask([], { setting: 'extension-ceiling', value: Math.max(...defaultTimings.extensionSteps) - 1 }), 'extension-step-above-the-ceiling', 'a ceiling below the largest step in force'));
 refusedWith(ask([], { value: defaultTimings.graceMinutes }), 'setting-unchanged');
});

test('an accepted change records which setting, from, to, who, when and why', () => {
 const { value } = accepted(ask([], { value: 45 }, T0 + 5 * MINUTE));
 assert.deepEqual(value.change, { settingsVersion: 2, setting: 'grace', from: defaultTimings.graceMinutes, to: 45, reason: REASON, byRole: 'admin', byRef: 'A-901', at: T0 + 5 * MINUTE });
 assert.deepEqual(value.inForce, inForce([value.change]), 'what is in force is the history replayed');
 assert.equal(value.inForce.timings.graceMinutes, 45);
 const steps = accepted(ask([value.change], { setting: 'extension-steps', value: [5, 15, 25] })).value;
 assert.deepEqual(steps.inForce.timings.extensionSteps, [5, 15, 25]);
 assert.equal(steps.inForce.timings.graceMinutes, 45, 'a later change keeps the earlier one');
});

test('a timer that started before a change keeps its deadline, its steps and its ceiling', () => {
 const visit = { event: { appointmentRef: 'APT-1', visitCodeMatched: true }, serviceId: 'wound', nurseRef: 'N-205' };
 const before = startTimer({ ...visit, checkinRef: 'CHK-1' }, T0, defaultsInForce);
 assert.ok(before.ok);
 const shorter = accepted(ask([], { value: bounds('grace').lowest.value }, T0 + 5 * MINUTE)).value.change;
 const lowerCeiling = accepted(ask([shorter], { setting: 'extension-ceiling', value: Math.max(...defaultTimings.extensionSteps) }, T0 + 6 * MINUTE)).value.change;
 const now = inForce([shorter, lowerCeiling]);

 assert.equal(before.value.settingsVersion, 1);
 assert.equal(before.value.dueAt, T0 + (serviceMinutes('wound')! + defaultTimings.graceMinutes) * MINUTE, 'the running visit’s deadline did not move');
 const after = startTimer({ ...visit, checkinRef: 'CHK-2', event: { ...visit.event, appointmentRef: 'APT-2' } }, T0 + 10 * MINUTE, now);
 assert.ok(after.ok);
 assert.equal(after.value.settingsVersion, 3);
 assert.equal(after.value.dueAt, T0 + 10 * MINUTE + (serviceMinutes('wound')! + bounds('grace').lowest.value) * MINUTE, 'the next visit reads the change');

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
 const longer = accepted(ask([], { setting: 'panic-window', value: bounds('panic-window').highest.value }, T0 + MINUTE)).value.change;
 const window = panicWindowOf([longer]);
 assert.equal(pressed.value.locationShareEndsAt, end);
 assert.equal(pressed.value.settingsVersion, 1);
 assert.deepEqual([...window.accepts].sort((a, b) => a - b), [defaultTimings.panicWindowMinutes, bounds('panic-window').highest.value].sort((a, b) => a - b));

 const stale = raisePanic({ panicRef: 'PNC-2', raisedByRole: 'nurse', nurseRef: 'N-206', locationShareMinutes: defaultTimings.panicWindowMinutes }, T0 + 2 * MINUTE, window);
 assert.ok(stale.ok, 'a panic is never refused because an admin changed a setting');
 assert.equal(stale.value.locationShareEndsAt, T0 + 2 * MINUTE + window.minutes * MINUTE, 'and it opens the window in force, not the one the phone sent');
 assert.equal(stale.value.settingsVersion, 2);
 const chosen = raisePanic({ panicRef: 'PNC-3', raisedByRole: 'nurse', nurseRef: 'N-206', locationShareMinutes: window.minutes * 24 }, T0 + 2 * MINUTE, window);
 assert.equal(!chosen.ok && chosen.refusal.id, 'window-not-the-declared-one', 'a window no version ever held is still refused');
});

test('a history that skips a version is refused rather than read around', () => {
 const change = accepted(ask([], { value: 45 })).value.change;
 assert.throws(() => inForce([{ ...change, settingsVersion: 3 }]), /never edited/);
});
