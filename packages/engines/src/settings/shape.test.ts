/* The shared settings shape, on every type it holds.
 *
 * The block below is synthetic. It is not a contract and no screen reads it: it is the settings the
 * other leads were asked to add — a Mom plan's tiers stacking, a Plus urgent call-out quota, the SOS
 * wording and its guardrail, WhatsApp reports, the doctor's per-case fee, the visit thread, the scope
 * roles for an injection, the Core rota by post, the escalation minutes per rung and who may change
 * Safety's settings — written in the shape to prove the shape can hold each of them before anybody
 * builds one. Each engine's real numbers go in its own contract when its lead adds them.
 *
 * What is held: every default is a value its own limits accept and every value a guardrail forbids is
 * refused; each shared refusal is answered in its contract sentence and in its order; who may change a
 * setting is a role, a capability's holders, or another setting; the history replays and a gap is a
 * fault; a clinical review belongs to the value in force and is never confirmed by the person who
 * changed it; and a change route's fields carry each type's value. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import contract from '../../../catalog/settings.json' with { type: 'json' };
import {
 changeFromFields, confirmReview, proposeChange, refusalFor, refusalOf, reviewStateOf, rolesGranting, rolesThatChange, snapshotOf,
 type Change, type ChangeRequest, type Result, type Review, type ReviewRequest, type SettingsBlock, type SettingsEngine
} from './shape.ts';
import { safetyBlock } from '../safety/domain/settings.ts';

const T0 = Date.UTC(2026, 8, 15, 8, 0);
const WEEK = [...contract.days];
const proposal = (because: string) => ({ decidedBy: null, proposedBy: 'Platform Settings lead (Wave 3), for the lead who owns it', proposedBecause: because });
const bound = (value: number) => ({ value, ...proposal('Synthetic, to prove the shape holds a bound.') });
const MUST_KEEP = 'It never means being seen ahead of someone more unwell.';
const SOS_WORDING = `When you press SOS, a person at our desk picks up first among calls of the same urgency, and we tell your family straight away. ${MUST_KEEP}`;
const APPLIES = 'A change applies only to what starts after it.';

const example: SettingsBlock = {
 engine: 'example',
 heading: 'Every type',
 intro: 'The settings the other leads will add, in the shared shape.',
 defaults: { version: 1, changelog: [] },
 items: [
  { key: 'callback-within', label: 'Call a family back within', help: 'How long the desk has to call a family back after they ask.', owner: 'example', type: 'minutes', unit: 'minutes',
    default: { value: 15, ...proposal('A quarter of an hour.') }, bounds: { lowest: bound(5), highest: bound(60) }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'tiers-stack', label: 'Plan tiers stack', help: 'Whether a household on two tiers gets both tiers’ benefits.', owner: 'example', type: 'boolean', unit: null,
    default: { value: true, ...proposal('A family that pays for two tiers expects both.') }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'thread-photos', label: 'Photos in the visit thread', help: 'Whether a patient may send a photo in the visit thread.', owner: 'example', type: 'boolean', unit: null,
    default: { value: false, ...proposal('A photo is health information in a channel nobody has reviewed.') },
    allowed: [{ value: false, label: 'No photos', ...proposal('The default.') }, { value: true, label: 'Photos allowed', ...proposal('Once a clinician has reviewed it.') }],
    reviewRequired: 'sign-clinical-review', changedBy: 'admin', appliesTo: APPLIES },
  { key: 'thread-characters', label: 'Visit thread message length', help: 'The most characters one message in the visit thread may hold.', owner: 'example', type: 'count', unit: 'characters', positive: true,
    default: { value: 500, ...proposal('Long enough for a question, short enough to read at a door.') }, bounds: { lowest: bound(100), highest: bound(2000) }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'doctor-review-fee', label: 'Doctor’s fee per case', help: 'What a doctor is paid for one signed review.', owner: 'example', type: 'moneyCents', unit: 'cents',
    default: { value: 4500, ...proposal('Inside the cited range.') }, bounds: { lowest: bound(3500), highest: bound(6000), citedFrom: { file: 'packages/catalog/business-model.json', path: 'unitEconomics.doctorReviewFee' } },
    changedBy: 'admin', appliesTo: 'A change applies to cases signed after it. A case already signed is paid at the fee in force when it was signed.' },
  { key: 'plus-discount', label: 'Plus discount', help: 'How much a Plus member saves on an extra visit.', owner: 'example', type: 'percentage', unit: 'percent', positive: false,
    default: { value: 0, ...proposal('No discount until somebody decides one.') }, bounds: { lowest: bound(0), highest: bound(50) }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'whatsapp-reports', label: 'WhatsApp reports', help: 'What a family is sent on WhatsApp after a visit.', owner: 'example', type: 'enum', unit: null,
    default: { value: 'off', ...proposal('WhatsApp is not a channel health information has been reviewed for.') },
    allowed: [{ value: 'off', label: 'Nothing', ...proposal('The default.') }, { value: 'notify-only', label: 'A notice that a report is ready, with no health content', ...proposal('Tells a family to open the app.') }],
    guardrail: { statement: 'No health content ever leaves through WhatsApp.', forbids: ['full-report', 'summary'] }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'sos-wording', label: 'Priority SOS wording', help: 'What a Plus member reads about pressing SOS.', owner: 'example', type: 'text', unit: 'characters',
    default: { value: SOS_WORDING, ...proposal('The founder’s words, with the promise that protects everybody else.') },
    maxLength: bound(280), mustKeep: [{ words: MUST_KEEP, why: 'Priority is never priority over somebody more unwell.' }],
    guardrail: { statement: 'The wording never claims a Plus member is seen ahead of somebody more unwell.', forbids: ['When you press SOS, you are seen before anybody else.'] }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'injection-roles', label: 'Who may give an injection', help: 'The roles that may be offered an injection visit.', owner: 'example', type: 'roleList', unit: null,
    default: { value: ['nurse', 'locum'], ...proposal('A registered nurse’s general scope.') },
    allowedRoles: { roles: ['nurse', 'locum', 'doctor'], ...proposal('Only registered clinicians.') },
    guardrail: { statement: 'Nobody outside a registered clinical role is ever sent to give an injection.', forbids: [['courier'], ['nurse', 'carer']] },
    reviewRequired: 'sign-clinical-review', changedBy: 'admin', appliesTo: APPLIES },
  { key: 'rota', label: 'The desk rota', help: 'Which post answers an alert, and when.', owner: 'example', type: 'schedule', unit: null,
    posts: [{ id: 'desk-operator', label: 'Desk operator', role: 'operator' }, { id: 'nurse-lead-on-call', label: 'On-call nurse lead', role: 'nurse' }, { id: 'head-of-operations', label: 'Head of Operations', role: 'admin' }],
    mustCover: [{ post: 'desk-operator', days: WEEK, from: '06:00', to: '22:00', why: 'The desk is staffed from six to ten, every day.' }, { post: 'nurse-lead-on-call', days: WEEK, from: '00:00', to: '24:00', why: 'A nurse lead is always on call.' }],
    default: { value: [
     { post: 'desk-operator', days: WEEK, from: '06:00', to: '14:00' }, { post: 'desk-operator', days: WEEK, from: '14:00', to: '22:00' },
     { post: 'nurse-lead-on-call', days: WEEK, from: '00:00', to: '24:00' }, { post: 'head-of-operations', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '17:00' }
    ], ...proposal('Two desk shifts, a nurse lead on call around the clock, and the Head of Operations in office hours.') },
    guardrail: { statement: 'The desk is never left unstaffed between six and ten.', forbids: [[{ post: 'nurse-lead-on-call', days: WEEK, from: '00:00', to: '24:00' }]] },
    changedBy: 'admin', appliesTo: 'A change applies to alerts raised after it. An alert already raised keeps the rung it was sent to.' },
  { key: 'escalation-minutes', label: 'Minutes before each rung', help: 'How long each rung has before an alert goes to the next.', owner: 'example', type: 'list', of: 'minutes', unit: 'minutes',
    default: { value: [5, 10], ...proposal('Five minutes for the desk, then ten for the nurse lead.') }, bounds: { lowest: bound(1), highest: bound(60) }, items: { lowest: bound(2), highest: bound(2) },
    changedBy: 'admin', appliesTo: APPLIES },
  { key: 'plus-urgent-callouts', label: 'Plus urgent call-outs', help: 'How many urgent call-outs a Plus plan includes, and the period they are counted over.', owner: 'example', type: 'record', unit: null,
    parts: [
     { key: 'count', label: 'Call-outs', type: 'count', unit: 'call-outs', positive: false, bounds: { lowest: bound(0), highest: bound(4) } },
     { key: 'period', label: 'Counted per', type: 'enum', allowed: [{ value: 'month', label: 'Month', ...proposal('The plan is paid monthly.') }, { value: 'year', label: 'Year', ...proposal('An annual allowance.') }] }
    ],
    default: { value: { count: 1, period: 'month' }, ...proposal('One a month.') }, changedBy: 'admin', appliesTo: APPLIES },
  { key: 'vetting-note-length', label: 'Vetting note length', help: 'How long a reviewer’s note may be.', owner: 'example', type: 'count', unit: 'characters', positive: true,
    default: { value: 400, ...proposal('Synthetic.') }, bounds: { lowest: bound(100), highest: bound(1000) }, changedBy: 'review-vetting', appliesTo: APPLIES },
  { key: 'settings-changers', label: 'Who may change the stale-window rule', help: 'The roles that may change the stale-window rule.', owner: 'example', type: 'roleList', unit: null,
    default: { value: ['admin'], ...proposal('The admin until somebody decides otherwise.') }, allowedRoles: { roles: ['admin', 'operator'], ...proposal('Somebody who answers for the desk.') }, items: { lowest: bound(1), highest: bound(2) },
    changedBy: 'admin', appliesTo: APPLIES },
  { key: 'stale-window-in-force', label: 'A stale panic window gets the window in force', help: 'Whether a phone that read an old window is given the one in force.', owner: 'example', type: 'boolean', unit: null,
    default: { value: true, ...proposal('A panic is never refused over bookkeeping.') }, allowed: [{ value: true, label: 'Yes', ...proposal('Never refuse a panic.') }],
    guardrail: { statement: 'A panic is never refused because a phone read an old window.', forbids: [false] },
    changedBy: { fromSetting: 'settings-changers' }, appliesTo: APPLIES },
  { key: 'scope-note', label: 'Clinical scope note', help: 'A doctor’s note on the scope settings.', owner: 'example', type: 'text', unit: 'characters',
    default: { value: 'Reviewed.', ...proposal('Synthetic.'), reviewedBy: 'Clinical Governance Lead', reviewedOn: '2026-09-15' }, maxLength: bound(200),
    reviewRequired: 'sign-clinical-review', changedBy: 'sign-clinical-review', appliesTo: APPLIES }
 ]
};
const engine: SettingsEngine = { block: example };
const setting = (key: string) => example.items.find(s => s.key === key)!;
const REASON = 'A synthetic reason.';
const ask = (history: readonly Change[], request: Partial<ChangeRequest>, at = T0) =>
 proposeChange(engine, history, { setting: 'thread-characters', value: undefined, reason: REASON, expectedVersion: snapshotOf(example, history).settingsVersion, byRole: 'admin', byRef: 'A-901', ...request }, at);
const sentence = (kind: string, id: string) => contract.refusals.find(r => r.route === kind && r.id === id)!.statement;
const refusedWith = (result: Result<unknown>, id: string, why = id, kind = 'change') => {
 assert.ok(!result.ok, `expected ${id}: ${why}`);
 if (result.ok) return;
 assert.equal(result.refusal.id, id, why);
 assert.equal(result.refusal.statement, sentence(kind, id), 'the sentence is the contract’s, word for word');
};
const accepted = <T>(result: Result<T>): T => {
 if (!result.ok) assert.fail(`refused: ${result.refusal.id}`);
 return result.value;
};

test('every type the other leads need is in the shape, every default is a value its limits accept, and every value a guardrail forbids is refused', () => {
 assert.deepEqual([...new Set(example.items.map(s => s.type))].sort(), contract.types.map(t => t.id).sort());
 for (const s of example.items) {
  assert.equal(refusalOf(s, s.default.value), null, `${s.key}'s default`);
  for (const forbidden of s.guardrail?.forbids ?? []) assert.notEqual(refusalOf(s, forbidden), null, `${s.key} must refuse ${JSON.stringify(forbidden)}`);
 }
});

test('a value of the wrong kind is refused before anything else is asked of it', () => {
 const cases: [string, unknown][] = [
  ['thread-characters', '500'], ['thread-characters', undefined], ['doctor-review-fee', 45.5], ['tiers-stack', 'true'], ['whatsapp-reports', true],
  ['sos-wording', 12], ['injection-roles', 'nurse'], ['escalation-minutes', 5], ['escalation-minutes', ['5', '10']],
  ['plus-urgent-callouts', { count: 1 }], ['plus-urgent-callouts', { count: 1, period: 'month', household: 'H-1' }], ['plus-urgent-callouts', [1, 'month']],
  ['rota', [{ post: 'desk-operator', days: WEEK, from: '06:00', to: '22:00', nurseName: 'Naledi Mokoena' }]],
  ['rota', [{ post: 'N-205', days: WEEK, from: '06:00', to: '22:00' }]],
  ['rota', [{ post: 'desk-operator', days: WEEK, from: '22:00', to: '06:00' }]],
  ['rota', [{ post: 'desk-operator', days: ['someday'], from: '06:00', to: '22:00' }]],
  ['rota', [{ post: 'desk-operator', days: WEEK, from: '06:00', to: '24:30' }]]
 ];
 for (const [key, value] of cases) refusedWith(ask([], { setting: key, value }), 'setting-value-wrong-type', `${key} = ${JSON.stringify(value)}`);
});

test('nought is refused before the bounds wherever the type demands above nought, and only there', () => {
 refusedWith(ask([], { setting: 'doctor-review-fee', value: 0 }), 'setting-not-above-zero', 'money is never nought');
 refusedWith(ask([], { setting: 'thread-characters', value: 0 }), 'setting-not-above-zero', 'a count the setting says is above nought');
 refusedWith(ask([], { setting: 'escalation-minutes', value: [0, 10] }), 'setting-not-above-zero', 'a list of minutes');
 refusedWith(ask([], { setting: 'plus-discount', value: -5 }), 'setting-out-of-range', 'a percentage that may be nought is not refused as nought when below it');
 assert.ok(ask([], { setting: 'plus-urgent-callouts', value: { count: 0, period: 'month' } }).ok, 'a count that may be nought accepts nought');
});

test('a role the register does not hold is refused, and one it holds that the setting does not allow is out of range', () => {
 refusedWith(ask([], { setting: 'injection-roles', value: ['nurse', 'pharmacist'] }), 'setting-role-not-on-register');
 refusedWith(ask([], { setting: 'injection-roles', value: ['nurse', 'courier'] }), 'setting-out-of-range');
 refusedWith(ask([], { setting: 'injection-roles', value: ['nurse', 'nurse'] }), 'setting-out-of-range', 'a role named twice');
 refusedWith(ask([], { setting: 'settings-changers', value: [] }), 'setting-out-of-range', 'a list of roles that must name somebody, naming nobody');
 assert.ok(ask([], { setting: 'injection-roles', value: ['nurse'] }).ok);
});

test('wording over its maximum, without the sentence it must keep, or empty, is refused', () => {
 refusedWith(ask([], { setting: 'sos-wording', value: `${'Longer than it may be. '.repeat(12)}${MUST_KEEP}` }), 'setting-text-too-long');
 refusedWith(ask([], { setting: 'sos-wording', value: 'When you press SOS, you are seen before anybody else.' }), 'setting-text-loses-a-guardrail');
 refusedWith(ask([], { setting: 'scope-note', value: '   ', byRole: 'doctor', byRef: 'D-301' }), 'setting-out-of-range', 'wording of nothing');
 assert.ok(ask([], { setting: 'sos-wording', value: `Pressing SOS reaches a person at our desk first among calls of the same urgency. ${MUST_KEEP}` }).ok, 'reworded around the sentence it keeps');
});

test('a rota that leaves hours it must cover uncovered is refused, however the windows are laid', () => {
 const rota = setting('rota').default.value as { post: string; days: string[]; from: string; to: string }[];
 const lead = rota.filter(w => w.post === 'nurse-lead-on-call');
 const desk = (from: string, to: string, days = WEEK) => ({ post: 'desk-operator', days, from, to });
 refusedWith(ask([], { setting: 'rota', value: [desk('06:00', '14:00'), ...lead] }), 'setting-schedule-leaves-a-gap', 'no afternoon shift');
 refusedWith(ask([], { setting: 'rota', value: [desk('06:00', '13:00'), desk('14:00', '22:00'), ...lead] }), 'setting-schedule-leaves-a-gap', 'an hour between shifts');
 refusedWith(ask([], { setting: 'rota', value: [desk('06:00', '14:00'), desk('14:00', '22:00', WEEK.filter(d => d !== 'sun')), ...lead] }), 'setting-schedule-leaves-a-gap', 'Sunday afternoon');
 refusedWith(ask([], { setting: 'rota', value: [desk('06:00', '22:00')] }), 'setting-schedule-leaves-a-gap', 'nobody on call overnight');
 assert.ok(ask([], { setting: 'rota', value: [desk('14:00', '22:00'), desk('06:00', '15:00'), ...lead] }).ok, 'overlapping shifts, in any order, cover the day');
});

test('bounds and allowed values hold for one value, each item of a list and each part of a record', () => {
 refusedWith(ask([], { setting: 'doctor-review-fee', value: 3499 }), 'setting-out-of-range', 'a cent under the cited range');
 refusedWith(ask([], { setting: 'doctor-review-fee', value: 6001 }), 'setting-out-of-range', 'a cent over it');
 refusedWith(ask([], { setting: 'plus-discount', value: 51 }), 'setting-out-of-range');
 refusedWith(ask([], { setting: 'whatsapp-reports', value: 'full-report' }), 'setting-out-of-range');
 refusedWith(ask([], { setting: 'stale-window-in-force', value: false }), 'setting-out-of-range', 'a boolean whose forbidden side is left out of allowed');
 refusedWith(ask([], { setting: 'escalation-minutes', value: [5] }), 'setting-out-of-range', 'fewer rungs than the list holds');
 refusedWith(ask([], { setting: 'escalation-minutes', value: [5, 61] }), 'setting-out-of-range', 'an item over its bound');
 refusedWith(ask([], { setting: 'plus-urgent-callouts', value: { count: 5, period: 'month' } }), 'setting-out-of-range');
 refusedWith(ask([], { setting: 'plus-urgent-callouts', value: { count: 1, period: 'week' } }), 'setting-out-of-range');
 assert.ok(ask([], { setting: 'tiers-stack', value: false }).ok, 'a boolean with no allowed list may be either');
 refusedWith(ask([], { setting: 'plus-urgent-callouts', value: { count: 12, period: 'year' } }), 'setting-out-of-range', 'more call-outs than a plan may hold');
 const quota = accepted(ask([], { setting: 'plus-urgent-callouts', value: { count: 4, period: 'year' } }));
 assert.deepEqual(quota.change.to, { count: 4, period: 'year' }, 'both parts change in one version');
 refusedWith(ask([quota.change], { setting: 'plus-urgent-callouts', value: { period: 'year', count: 4 } }), 'setting-unchanged', 'the same record whatever order its keys arrive in');
});

test('who may change a setting is its role, the holders of its capability, or the roles another setting names', () => {
 refusedWith(ask([], { byRole: 'nurse', value: 600 }), 'setting-change-not-permitted');
 refusedWith(ask([], { byRef: null, value: 600 }), 'setting-change-not-permitted', 'an admin nobody can name');
 refusedWith(ask([], { byRole: 'nurse', setting: 'no-such-setting', value: 1 }), 'setting-change-not-permitted', 'somebody who can change nothing learns nothing about what exists');
 refusedWith(ask([], { setting: 'no-such-setting', value: 1 }), 'setting-not-known');

 assert.deepEqual(rolesThatChange(example, setting('vetting-note-length')), rolesGranting('review-vetting'));
 assert.ok(ask([], { setting: 'vetting-note-length', value: 500 }).ok, 'the admin holds review-vetting');
 refusedWith(ask([], { setting: 'vetting-note-length', value: 500, byRole: 'operator' }), 'setting-change-not-permitted');

 refusedWith(ask([], { setting: 'stale-window-in-force', value: true, byRole: 'operator' }), 'setting-change-not-permitted', 'the operator is not named yet');
 const widened = accepted(ask([], { setting: 'settings-changers', value: ['admin', 'operator'] })).change;
 refusedWith(ask([widened], { setting: 'stale-window-in-force', value: true, byRole: 'operator' }), 'setting-unchanged', 'the operator is now named, and asked the next question');
});

test('a change says why, is made against the version in force and changes something; the history replays and a gap is a fault', () => {
 refusedWith(ask([], { value: 600, reason: '  ' }), 'setting-change-without-reason');
 refusedWith(ask([], { value: 600, expectedVersion: 7 }), 'settings-version-stale');
 refusedWith(ask([], { value: 500 }), 'setting-unchanged');
 const first = accepted(ask([], { value: 600 }, T0 + 1)).change;
 assert.deepEqual(first, { settingsVersion: 2, setting: 'thread-characters', from: 500, to: 600, reason: REASON, byRole: 'admin', byRef: 'A-901', at: T0 + 1 });
 const second = accepted(ask([first], { setting: 'tiers-stack', value: false })).change;
 const now = snapshotOf(example, [second, first]);
 assert.deepEqual([now.settingsVersion, now.values['thread-characters'], now.values['tiers-stack'], now.setAt['thread-characters'], now.setAt['tiers-stack'], now.setAt['rota']], [3, 600, false, 2, 3, 1]);
 assert.throws(() => snapshotOf(example, [second]), /never edited/);
 assert.throws(() => snapshotOf(example, [first, { ...second, settingsVersion: 2 }]), /never edited/);
 assert.throws(() => snapshotOf(example, [{ ...first, setting: 'grace' }]), /never edited/);
 assert.ok(Object.isFrozen(now.values['rota']), 'a value in force cannot be changed by whoever reads it');
});

test('a clinical review belongs to the value in force, is confirmed by a holder of the capability, never by the person who changed it, and once', () => {
 const review = (history: readonly Change[], reviews: readonly Review[], request: Partial<ReviewRequest> = {}, at = T0) =>
  confirmReview(engine, history, reviews, { setting: 'injection-roles', settingsVersion: 1, reason: 'Inside a registered nurse’s general scope.', byRole: 'doctor', byRef: 'D-301', confirmers: ['doctor'], ...request }, at);
 const state = (history: readonly Change[], reviews: readonly Review[], key = 'injection-roles') => reviewStateOf(setting(key), snapshotOf(example, history), reviews);
 assert.deepEqual(rolesGranting('sign-clinical-review'), ['doctor']);
 assert.deepEqual(state([], []), { required: 'sign-clinical-review', reviewed: null }, 'not clinically reviewed until somebody confirms it');
 assert.deepEqual(state([], [], 'tiers-stack'), { required: null, reviewed: null });
 assert.deepEqual(state([], [], 'scope-note').reviewed, { byRef: 'Clinical Governance Lead', at: null, on: '2026-09-15' }, 'a default reviewed before it shipped says who and when');

 refusedWith(review([], [], { byRole: 'admin', byRef: 'A-901' }), 'setting-review-not-permitted', 'an admin', 'review');
 refusedWith(review([], [], { byRef: null }), 'setting-review-not-permitted', 'a doctor nobody can name', 'review');
 refusedWith(review([], [], { setting: 'tiers-stack' }), 'setting-review-not-needed', 'tiers-stack', 'review');
 refusedWith(review([], [], { setting: 'no-such-setting' }), 'setting-not-known', 'unknown', 'review');
 refusedWith(review([], [], { reason: '' }), 'setting-review-without-reason', 'no reason', 'review');
 refusedWith(review([], [], { settingsVersion: 2 }), 'setting-review-not-in-force', 'a version that never set it', 'review');

 const confirmed = accepted(review([], []));
 assert.deepEqual(confirmed, { settingsVersion: 1, setting: 'injection-roles', reason: 'Inside a registered nurse’s general scope.', byRole: 'doctor', byRef: 'D-301', at: T0 });
 assert.equal(state([], [confirmed]).reviewed?.byRef, 'D-301');
 refusedWith(review([], [confirmed], { byRef: 'D-302' }), 'setting-review-already-confirmed', 'twice', 'review');

 const narrowed = accepted(ask([], { setting: 'injection-roles', value: ['nurse'] })).change;
 assert.equal(state([narrowed], [confirmed]).reviewed, null, 'a new value is not reviewed because the old one was');
 refusedWith(review([narrowed], [confirmed]), 'setting-review-not-in-force', 'the old value', 'review');
 assert.ok(review([narrowed], [confirmed], { settingsVersion: narrowed.settingsVersion }).ok);

 const byDoctor = accepted(ask([], { setting: 'scope-note', value: 'Reviewed again.', byRole: 'doctor', byRef: 'D-301' })).change;
 refusedWith(review([byDoctor], [], { setting: 'scope-note', settingsVersion: byDoctor.settingsVersion }), 'setting-review-own-change', 'her own change', 'review');
 assert.ok(review([byDoctor], [], { setting: 'scope-note', settingsVersion: byDoctor.settingsVersion, byRef: 'D-302' }).ok, 'another doctor confirms it');
});

test('a change route’s fields carry the value its type travels in, and nothing reads a field outside the shape', () => {
 assert.deepEqual(changeFromFields(example, { setting: 'tiers-stack', switchedOn: false }), { setting: 'tiers-stack', value: false });
 assert.deepEqual(changeFromFields(example, { setting: 'tiers-stack', wholeNumber: 0 }), { setting: 'tiers-stack', value: undefined }, 'a value in the wrong field is no value');
 assert.deepEqual(changeFromFields(example, { setting: 'rota', windows: [] }), { setting: 'rota', value: [] });
 assert.deepEqual(changeFromFields(example, { setting: 'plus-urgent-callouts', parts: { count: 1, period: 'year' } }), { setting: 'plus-urgent-callouts', value: { count: 1, period: 'year' } });
 for (const t of contract.types) assert.ok(contract.routes.change.request.some(f => f.field === t.valueField), `the change route carries ${t.id} in ${t.valueField}`);

 assert.deepEqual(changeFromFields(safetyBlock, { setting: 'extension-steps', items: [5, 10] }), { setting: 'extension-steps', value: [5, 10] });
 assert.deepEqual(changeFromFields(safetyBlock, { timing: 'grace', minutes: 45 }), { setting: undefined, value: undefined }, 'the withdrawn version one\'s field names are read by nothing');
});

test('every refusal a settings route answers with is the contract’s sentence, and an id no contract declares is a fault', () => {
 for (const r of contract.refusals) assert.deepEqual(refusalFor(r.route as 'read' | 'change' | 'review', r.id), { id: r.id, status: r.status, statement: r.statement });
 assert.throws(() => refusalFor('change', 'no-such-refusal'), /No refusal/);
});
