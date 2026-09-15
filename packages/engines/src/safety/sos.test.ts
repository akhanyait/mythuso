/* Patient SOS and next of kin on the runtime, through the routes, with the refusals the contract renders and the
   events the bus actually carried.

   A press routes by the answers and never by anything else; a band alone and a fall nobody pressed are refused before
   anything is recorded, and so is a plan asking to go first; no partner is connected, and the response says so. A
   stand-down needs one of the reasons on the screen, closes the area at once and cannot be made twice. The area is
   read only inside the window the SOS was pressed under. Next of kin are nominated with consent to the wording's
   version, recorded as not sent at the press, tried again by the desk inside the window and the tries, never told
   anything clinical, and refused through a withdrawn nomination. A guardian is refused on every next-of-kin route.
   And an admin changing the windows or the tries reaches the next SOS, never a live one.

   Every sentence is read from packages/catalog/apis/safety.json and every number from the settings, so a reworded
   refusal or a changed default moves these tests with it. Nothing here is a real service. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEMORY, createClock, createRuntime, type Runtime } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { sosSettingsOf } from './domain/settings.ts';
import { SOS_ROUTES, sosRefusal } from './domain/sos.ts';

type Body = Record<string, unknown>;
const DAY_TIME = '2026-09-15T09:00:00+02:00';
const NIGHT = '2026-09-15T02:10:00+02:00';
const MINUTE = 60_000;
const sos = JSON.parse(readFileSync(new URL('../../../catalog/sos.json', import.meta.url), 'utf8')) as {
 redFlags: { conditions: { name: string }[] }; standDown: { reasons: { id: string }[] };
};
const sosPress = JSON.parse(readFileSync(new URL('../../../catalog/sos-press.json', import.meta.url), 'utf8')) as {
 nextOfKin: { consent: { version: number }; statuses: { id: string }[]; notSent: { id: string }[] };
};
const defaults = sosSettingsOf([]);
const PATIENT = { role: 'patient', ref: 'subject-synthetic-301', purpose: 'emergency' };
const SOMEBODY_ELSE = { role: 'patient', ref: 'subject-synthetic-302', purpose: 'emergency' };
const DESK = { role: 'operator', ref: 'party-synthetic-801', purpose: 'emergency' };
const GUARDIAN = { role: 'guardian', ref: 'party-synthetic-601', purpose: 'emergency' };
const ADMIN = { role: 'admin', ref: 'party-synthetic-901', purpose: 'audit' };

const runtimeAt = (start = DAY_TIME) => createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine], dataDirectory: MEMORY, clock: createClock(start) });
const press = (runtime: Runtime, fields: Body = {}, who = PATIENT) => runtime.call(SOS_ROUTES.raise, {
 ...who, fields: { idempotencyKey: `press-${Object.entries(fields).map(([k, v]) => `${k}=${String(v)}`).join("&")}`, channel: 'app', conditionTicked: false, zoneId: 'rosebank', callbackAvailable: true, ...fields }
});
const nominate = (runtime: Runtime, fields: Body = {}, who = PATIENT) => runtime.call(SOS_ROUTES.nominate, {
 ...who, fields: { idempotencyKey: `nominate-${JSON.stringify(fields)}`, contactRef: 'contact-synthetic-1', purpose: 'emergency', consentVersion: sosPress.nextOfKin.consent.version, consentGiven: true, ...fields }
});
const alert = (runtime: Runtime, nominationRef: unknown, sosRef: unknown, key: string, extra: Body = {}, who = DESK) =>
 runtime.call(SOS_ROUTES.alert, { ...who, fields: { idempotencyKey: key, nominationRef, sosRef, ...extra } });
const area = (runtime: Runtime, sosRef: unknown) => runtime.call(SOS_ROUTES.area, { ...DESK, fields: { sosRef } });
const published = (runtime: Runtime, key: string) => runtime.trail.all().filter(e => e.kind === 'published' && e.eventKey === key).map(e => (JSON.parse(e.body) as { payload: Body }).payload);
const refused = (answer: { status: number; body: Body }, route: keyof typeof SOS_ROUTES, id: string) => {
 const expected = sosRefusal(route, id);
 assert.deepEqual([answer.status, answer.body['error'], answer.body['message']], [expected.status, id, expected.statement], JSON.stringify(answer.body));
};

test('a press routes by the answers, sends nothing it was not pressed for, and says no ambulance partner is connected', () => {
 const runtime = runtimeAt();
 const visit = press(runtime);
 assert.equal(visit.status, 200, JSON.stringify(visit.body));
 assert.deepEqual([visit.body['routedTo'], visit.body['partnerConnected'], visit.body['stateCode']], ['urgent-visit', false, 'raised']);
 assert.equal(Date.parse(String(visit.body['areaSharedUntil'])) - Date.parse(DAY_TIME), defaults.areaWindowMinutes * MINUTE, 'the area window in force, read from the settings');

 const emergency = press(runtime, { conditionTicked: true });
 assert.equal(emergency.body['routedTo'], 'emergency-services', 'one tick ends the questions, whatever the area and the callback say');
 const nowhere = press(runtime, { zoneId: undefined });
 assert.deepEqual([nowhere.body['routedTo'], nowhere.body['failureCode'], nowhere.body['areaSharedUntil']], ['cannot-help', 'outside-coverage', undefined]);
 assert.deepEqual([press(runtime, { callbackAvailable: false }).body['failureCode']], ['no-callback']);

 const said = published(runtime, 'sos.raised@2');
 assert.deepEqual(said.map(p => Object.keys(p).sort()), [['channel', 'routedTo', 'sosRef', 'zoneId'], ['channel', 'routedTo', 'sosRef'], ['channel', 'routedTo', 'sosRef'], ['channel', 'routedTo', 'sosRef']],
  'the area is on the bus only for a door that sends somebody, and nothing about what was ticked ever is');

 /* Refused before anything is recorded or published. */
 const before = said.length;
 refused(press(runtime, { channel: 'band' }), 'raise', 'wearable-alone');
 refused(press(runtime, { channel: 'detected' }), 'raise', 'dispatch-without-a-human');
 refused(press(runtime, { channel: 'pager' }), 'raise', 'sos-channel-unknown');
 refused(press(runtime, { zoneId: 'atlantis' }), 'raise', 'sos-area-not-on-the-list');
 refused(press(runtime, { priorityPlan: 'premium' }), 'raise', 'no-priority-by-plan');
 refused(press(runtime, { symptoms: 'anything' }), 'raise', 'sos-carries-nothing-else');
 refused(press(runtime, { latitude: -26.1 }), 'raise', 'sos-carries-nothing-else');
 assert.equal(published(runtime, 'sos.raised@2').length, before, 'a refused press is not on the bus');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();

 const night = runtimeAt(NIGHT);
 assert.deepEqual([press(night).body['routedTo'], press(night).body['failureCode']], ['cannot-help', 'outside-hours'], 'outside the urgent-visit hours nobody is offered, and the screen says so');
 night.close();
});

test('a stand-down takes one of the reasons on the screen, ends the area at once, and is made once', () => {
 const runtime = runtimeAt();
 const sosRef = String(press(runtime).body['sosRef']);
 const standDown = (fields: Body, who = PATIENT, key = JSON.stringify(fields)) => runtime.call(SOS_ROUTES.standDown, { ...who, fields: { idempotencyKey: key, sosRef, ...fields } });

 refused(standDown({}), 'standDown', 'stand-down-without-reason');
 refused(standDown({ reasonCode: 'because' }), 'standDown', 'stand-down-without-reason');
 refused(standDown({ reasonCode: sos.standDown.reasons[0]!.id }, SOMEBODY_ELSE), 'standDown', 'no-sos-of-yours');
 assert.equal(published(runtime, 'sos.stood_down@1').length, 0);
 assert.equal(area(runtime, sosRef).status, 200, 'the area is shared while the SOS stands');

 runtime.advance(4 * MINUTE);
 const stood = standDown({ reasonCode: sos.standDown.reasons[0]!.id });
 assert.equal(stood.status, 200, JSON.stringify(stood.body));
 assert.equal(stood.body['areaSharingEndedAt'], stood.body['stoodDownAt']);
 assert.deepEqual(published(runtime, 'sos.stood_down@1'), [{ sosRef, reasonCode: sos.standDown.reasons[0]!.id, stoodDownAt: stood.body['stoodDownAt'] }]);
 refused(area(runtime, sosRef), 'area', 'location-kept-after-the-window');
 refused(standDown({ reasonCode: sos.standDown.reasons[1]!.id }), 'standDown', 'sos-already-stood-down');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('the area is read only inside the window it was pressed under, and never when none was chosen', () => {
 const runtime = runtimeAt();
 const sosRef = String(press(runtime).body['sosRef']);
 const seen = area(runtime, sosRef);
 assert.deepEqual(seen.body['zoneId'], 'rosebank');
 runtime.advance(defaults.areaWindowMinutes * MINUTE - MINUTE);
 assert.equal(area(runtime, sosRef).status, 200, 'a minute before the window closes');
 runtime.advance(MINUTE);
 refused(area(runtime, sosRef), 'area', 'location-kept-after-the-window');
 const row = (runtime.call(SOS_ROUTES.list, { ...DESK, fields: {} }).body['items'] as Body[]).find(r => r['sosRef'] === sosRef)!;
 assert.equal(row['areaShared'], false);
 assert.ok(!('zoneId' in row) && !('conditionTicked' in row) && !('patientRef' in row), 'the desk list never carries the area, the answers or the patient');

 refused(area(runtime, press(runtime, { zoneId: undefined }).body['sosRef']), 'area', 'area-not-chosen');
 refused(area(runtime, 'sos-nobody-pressed'), 'area', 'no-such-sos');
 refused(runtime.call(SOS_ROUTES.list, { ...DESK, fields: { plan: 'premium' } }), 'list', 'sos-list-takes-no-filter');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('nominate with consent, recorded as not sent at the press, tried again inside the tries, and refused through a withdrawn nomination', () => {
 const runtime = runtimeAt();
 refused(nominate(runtime, { consentGiven: false }), 'nominate', 'nomination-without-consent');
 refused(nominate(runtime, { consentVersion: sosPress.nextOfKin.consent.version + 1 }), 'nominate', 'nomination-without-consent');
 refused(nominate(runtime, { purpose: 'treatment' }), 'nominate', 'nomination-purpose-not-allowed');
 const made = nominate(runtime);
 assert.equal(made.status, 200, JSON.stringify(made.body));
 const nominationRef = made.body['nominationRef'];

 const pressed = press(runtime);
 const rows = pressed.body['nextOfKin'] as Body[];
 assert.deepEqual(rows.map(r => [r['nominationRef'], r['statusCode'], r['reasonCode']]), [[nominationRef, sosPress.nextOfKin.statuses[0]!.id, sosPress.nextOfKin.notSent[0]!.id]]);
 const sosRef = pressed.body['sosRef'];

 refused(alert(runtime, nominationRef, sosRef, 'with-a-note', { note: 'chest pain' }), 'alert', 'next-of-kin-see-clinical-detail');
 refused(alert(runtime, 'nomination-nobody-made', sosRef, 'nobody'), 'alert', 'no-such-nomination');
 refused(alert(runtime, nominationRef, 'sos-nobody-pressed', 'no-sos'), 'alert', 'no-such-sos');
 const somebodyElses = press(runtime, {}, SOMEBODY_ELSE).body['sosRef'];
 refused(alert(runtime, nominationRef, somebodyElses, 'stranger'), 'alert', 'nomination-not-for-this-sos');

 for (let attempt = 2; attempt <= defaults.alertRetries + 1; attempt++) {
  const again = alert(runtime, nominationRef, sosRef, `again-${attempt}`);
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.deepEqual([again.body['attempt'], again.body['attemptsAllowed'], again.body['statusCode']], [attempt, defaults.alertRetries + 1, sosPress.nextOfKin.statuses[0]!.id]);
  for (const condition of sos.redFlags.conditions) assert.ok(!String(again.body['wouldSay']).includes(condition.name), 'what they would be told names no condition');
 }
 refused(alert(runtime, nominationRef, sosRef, 'one-too-many'), 'alert', 'alert-tries-used');

 const withdrawn = runtime.call(SOS_ROUTES.withdraw, { ...PATIENT, fields: { idempotencyKey: 'withdraw', nominationRef } });
 assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
 refused(runtime.call(SOS_ROUTES.withdraw, { ...SOMEBODY_ELSE, fields: { idempotencyKey: 'not-mine', nominationRef } }), 'withdraw', 'no-nomination-of-yours');
 const second = press(runtime, { callbackAvailable: false });
 assert.deepEqual(second.body['nextOfKin'], [], 'a withdrawn nomination is tried by nobody at the next press');
 refused(alert(runtime, nominationRef, second.body['sosRef'], 'after-withdrawal'), 'alert', 'nomination-withdrawn');
 const listed = runtime.call(SOS_ROUTES.nominations, { ...PATIENT, fields: {} }).body['nominations'] as Body[];
 assert.deepEqual(listed.map(n => n['stateCode']), ['withdrawn']);

 /* Nothing anywhere says anybody was reached. */
 assert.equal(published(runtime, 'nok.notified@1').length, 0, 'nok.notified@1 says next of kin were told, and nobody was');
 assert.ok(!/"(sent|delivered|notified)"/.test(JSON.stringify(runtime.trail.all())), 'no status that claims a delivery is recorded anywhere');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});

test('an alert closes with the window and with the stand-down', () => {
 const runtime = runtimeAt();
 const nominationRef = nominate(runtime).body['nominationRef'];
 const late = press(runtime).body['sosRef'];
 runtime.advance(defaults.alertWindowMinutes * MINUTE);
 refused(alert(runtime, nominationRef, late, 'too-late'), 'alert', 'alert-window-closed');
 const stopped = press(runtime).body['sosRef'];
 runtime.call(SOS_ROUTES.standDown, { ...PATIENT, fields: { idempotencyKey: 'stop', sosRef: stopped, reasonCode: sos.standDown.reasons[0]!.id } });
 refused(alert(runtime, nominationRef, stopped, 'after-stand-down'), 'alert', 'alert-after-stand-down');
 runtime.close();
});

test('a guardian is refused on every next-of-kin route before anything else is asked', () => {
 const runtime = runtimeAt();
 refused(nominate(runtime, {}, GUARDIAN), 'nominate', 'guardian-authority-not-proven');
 refused(nominate(runtime, { consentGiven: false }, GUARDIAN), 'nominate', 'guardian-authority-not-proven');
 const nominationRef = nominate(runtime).body['nominationRef'];
 refused(runtime.call(SOS_ROUTES.withdraw, { ...GUARDIAN, fields: { idempotencyKey: 'guardian-withdraws', nominationRef } }), 'withdraw', 'guardian-authority-not-proven');
 refused(alert(runtime, nominationRef, press(runtime).body['sosRef'], 'guardian-alerts', {}, GUARDIAN), 'alert', 'guardian-authority-not-proven');
 assert.equal((runtime.call(SOS_ROUTES.nominations, { ...PATIENT, fields: {} }).body['nominations'] as Body[])[0]!['stateCode'], 'in-force', 'the guardian withdrew nothing');
 runtime.close();
});

test('an admin changing the windows and the tries reaches the next SOS and never a live one', () => {
 const runtime = runtimeAt();
 const nominationRef = nominate(runtime).body['nominationRef'];
 const live = press(runtime);
 const liveRef = live.body['sosRef'];
 const change = (setting: string, wholeNumber: number, expectedVersion: number) => runtime.call('POST /v1/safety/setting-changes@2', {
  ...ADMIN, fields: { idempotencyKey: `change-${setting}`, setting, wholeNumber, reason: 'Seeing whether a live SOS moves with the settings.', expectedVersion }
 });
 const safety = JSON.parse(readFileSync(new URL('../../../catalog/field-safety.json', import.meta.url), 'utf8')) as { settings: { items: { key: string; bounds: { lowest: { value: number } } }[] } };
 const lowest = (key: string) => safety.settings.items.find(s => s.key === key)!.bounds.lowest.value;
 const first = change('sos-area-window', lowest('sos-area-window'), defaults.settingsVersion);
 assert.equal(first.status, 200, JSON.stringify(first.body));
 const second = change('next-of-kin-alert-retries', lowest('next-of-kin-alert-retries'), Number(first.body['settingsVersion']));
 assert.equal(second.status, 200, JSON.stringify(second.body));

 assert.equal(alert(runtime, nominationRef, liveRef, 'live-retry').body['attemptsAllowed'], defaults.alertRetries + 1, 'the live SOS keeps the tries it was pressed under');
 runtime.advance(lowest('sos-area-window') * MINUTE);
 assert.equal(area(runtime, liveRef).status, 200, 'and the area window');

 const next = press(runtime, { callbackAvailable: false });
 assert.equal(next.body['settingsVersion'], second.body['settingsVersion']);
 assert.equal(Date.parse(String(next.body['areaSharedUntil'])) - runtime.clock.now().getTime(), lowest('sos-area-window') * MINUTE, 'the next SOS is pressed under the change');
 refused(alert(runtime, nominationRef, next.body['sosRef'], 'next-retry'), 'alert', 'alert-tries-used');
 assert.deepEqual(runtime.faults(), []);
 runtime.close();
});
