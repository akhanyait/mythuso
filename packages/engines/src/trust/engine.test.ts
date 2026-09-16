/* Verify in service on the runtime, held to what it refuses.

   The badge is a tier and nothing else, for somebody current, and the same refusal for somebody lapsed or unknown.
   A shift start with no provider is recorded as not matched, publishes that and never a match, and the dispatch
   rule in force decides whether she is offered work — a change reaching the next shift and never one already
   started. A door code expires without costing a try, runs out of tries into a mismatch that tells the desk
   through the incident register in the contract's words, takes "not my nurse" at any time and "she is my nurse"
   only after a match. A complaint is reviewed against the window it arrived under, ages on the queue, is shown to
   the nurse without its complainant, and changes no badge and publishes nothing when it is decided. And nobody
   acts on their own file through any of it.

   Every number is read from the settings in force and every sentence from the contract, so a default an admin
   changes moves these tests rather than breaking them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY, createClock, createRuntime, defineEngine, ok, type EngineModule } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { HOUR, MINUTE, refusal, verifyInService } from './domain/contract.ts';
import { doorAnswers, askFaceMatchDoor } from './domain/face-match.ts';
import { trustInForce } from './domain/settings.ts';

const START = '2026-09-15T08:00:00+02:00';
const defaults = trustInForce([]);
const runtimeWith = (extra: EngineModule[] = []) =>
 createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, ...extra], dataDirectory: MEMORY, clock: createClock(START) });
type Runtime = ReturnType<typeof runtimeWith>;
const as = (role: string, ref: string | null, purpose: string, fields: Record<string, unknown> = {}) => ({ role, ref, purpose, fields });
const published = (runtime: Runtime, key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key);
const refused = (answer: { status: number; body: Record<string, unknown> }, id: string) => {
 assert.equal(answer.body.error, id, JSON.stringify(answer.body));
 assert.equal(answer.body.message, refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const noNumberAbout = (body: unknown) => assert.doesNotMatch(JSON.stringify(body), /score|points|rank|rating|weight|percentile/i);

/* A Safety that records the reports it is sent, so the incident's words are checked where they arrive. */
function incidentDesk() {
 const reports: Record<string, unknown>[] = [];
 const safety = defineEngine({ id: 'safety', store: { schema: '' }, subscriptions: {},
  routes: { 'POST /v1/safety/incidents@3': request => { reports.push({ ...request.fields }); return ok({ incidentId: `incident-${reports.length}`, notificationOwed: false }); } } });
 return { safety, reports };
}

const BADGE = 'GET /v1/trust/parties/{partyId}/badge@1';
const GATES = 'GET /v1/trust/parties/{partyId}/gates@1';
const SHIFT = 'POST /v1/trust/shift-starts@2';
const BOARD = 'GET /v1/trust/shift-starts@1';
const CODE = 'POST /v1/trust/door-codes@1';
const TRY = 'POST /v1/trust/door-verifications@2';
const ANSWER = 'POST /v1/trust/door-verifications/{appointmentRef}/answer@1';
const COMPLAIN = 'POST /v1/trust/complaints@2';
const QUEUE = 'GET /v1/trust/complaints@1';
const OPEN = 'GET /v1/trust/complaints/{complaintRef}@1';
const DECIDE = 'POST /v1/trust/complaints/{complaintRef}/decide@1';
const NOTICES = 'GET /v1/trust/complaint-notices@1';
const CHANGE = 'POST /v1/trust/setting-changes@2';

const change = (runtime: Runtime, setting: string, value: Record<string, unknown>, expectedVersion: number, key: string) =>
 runtime.call(CHANGE, as('admin', 'A-901', 'audit', { idempotencyKey: key, setting, ...value, reason: 'The office decided.', expectedVersion }));

test('the badge is a tier and nothing it was worked out from, and the same refusal answers somebody lapsed and somebody unknown', () => {
 const runtime = runtimeWith();
 const current = runtime.call(BADGE, as('patient', 'subject-synthetic-1', 'dispatch', { partyId: 'N-205' }));
 assert.equal(current.status, 200);
 assert.deepEqual(Object.keys(current.body).sort(), ['badgeTier', 'verified']);
 assert.equal(current.body.badgeTier, 'verified');
 assert.equal(current.body.verified, true);
 assert.ok(Object.values(current.body).every(value => typeof value !== 'number'), 'A badge carries no number.');
 noNumberAbout(current.body);
 refused(runtime.call(BADGE, as('patient', 'subject-synthetic-1', 'dispatch', { partyId: 'N-204' })), 'no-current-verification');
 refused(runtime.call(BADGE, as('patient', 'subject-synthetic-1', 'dispatch', { partyId: 'N-999' })), 'no-current-verification');

 /* The reviewer's gates are worked out on read: a lapsed clearance holds background, a declined reference stops the file. */
 const lapsed = runtime.call(GATES, as('admin', 'A-901', 'vetting', { partyId: 'N-204' }));
 assert.equal(lapsed.status, 200);
 assert.equal((lapsed.body.gates as { gate: string; state: string }[]).find(g => g.gate === 'background')?.state, 'held');
 assert.equal(lapsed.body.currentGate, 'background');
 noNumberAbout(lapsed.body);
 const declined = runtime.call(GATES, as('admin', 'A-901', 'vetting', { partyId: 'N-209' }));
 assert.equal((declined.body.gates as { gate: string; state: string }[]).find(g => g.gate === 'train')?.state, 'not-reached');
 refused(runtime.call(GATES, as('admin', 'A-901', 'vetting', { partyId: 'N-999' })), 'no-such-party');
 assert.equal(runtime.call(GATES, as('nurse', 'N-205', 'vetting', { partyId: 'N-205' })).status, 403, 'The engine runtime admits no self, so a nurse reads her own gates through her own standing.');
 runtime.close();
});

test('a shift start with no provider is recorded as not matched, and the dispatch rule in force decides whether she is offered work', () => {
 const runtime = runtimeWith();
 assert.equal(askFaceMatchDoor().outcome, 'not-integrated');
 const first = runtime.call(SHIFT, as('nurse', 'N-205', 'vetting'));
 assert.equal(first.status, 200, JSON.stringify(first.body));
 assert.equal(first.body.matchOutcome, 'not-integrated');
 assert.equal(first.body.dispatchRule, defaults.dispatchRule);
 assert.equal(first.body.online, defaults.dispatchRule === 'offer-with-desk-flag');
 assert.equal(defaults.dispatchRule, 'withhold', 'The proposed default is the conservative one.');
 const unmatched = published(runtime, 'trust.shift_start.unmatched@1');
 assert.equal(unmatched.length, 1);
 assert.equal(published(runtime, 'trust.shift_start.matched@1').length, 0, 'Nothing publishes a match without a provider.');
 const body = JSON.parse(unmatched[0]!.body) as { payload: Record<string, unknown> };
 assert.deepEqual(Object.keys(body.payload).sort(), ['dispatchRule', 'matchOutcome', 'online', 'shiftStartRef']);

 /* The office offers work with the desk told. The next shift is online; the first keeps the rule it started under. */
 assert.equal(change(runtime, 'unmatched-shift-start-dispatch', { choice: 'offer-with-desk-flag' }, 1, 'rule-1').status, 200);
 const second = runtime.call(SHIFT, as('nurse', 'N-206', 'vetting'));
 assert.equal(second.body.online, true);
 const board = runtime.call(BOARD, as('operator', 'O-801', 'dispatch'));
 const rows = board.body.items as { partyRef: string; online: boolean; dispatchRule: string; matchOutcome: string }[];
 assert.deepEqual(rows.map(r => [r.partyRef, r.online, r.dispatchRule, r.matchOutcome]), [['N-206', true, 'offer-with-desk-flag', 'not-integrated'], ['N-205', false, 'withhold', 'not-integrated']]);

 /* Nothing about a face is taken, and nobody without a current verification starts. */
 refused(runtime.call(SHIFT, as('nurse', 'N-207', 'vetting', { faceTemplate: 'AAAA' })), 'shift-start-carries-no-face');
 refused(runtime.call(SHIFT, as('nurse', 'N-207', 'vetting', { partyRef: 'N-201' })), 'shift-start-carries-no-face');
 refused(runtime.call(SHIFT, as('nurse', 'N-204', 'vetting')), 'no-current-verification-to-start');
 refused(runtime.call(SHIFT, as('nurse', null, 'vetting')), 'shift-start-needs-who-you-are');
 refused(runtime.call(SHIFT, as('courier', 'C-701', 'vetting')), 'not-on-the-vetting-register');
 assert.equal((runtime.call(BOARD, as('operator', 'O-801', 'dispatch')).body.items as unknown[]).length, 2);
 refused(runtime.call(BOARD, as('operator', 'O-801', 'dispatch', { partyRef: 'N-205' })), 'shift-start-board-takes-no-filter');

 /* The door itself refuses every payload a supplier could send, a template by the contract's own name. */
 assert.deepEqual(doorAnswers({ shiftStartRef: 'shift-1', outcome: 'matched', decidedAt: '2026-09-15T08:00:00+02:00' }), { refused: 'not-connected' });
 assert.deepEqual(doorAnswers({ result: { Face_Template: 'x' } }), { refused: 'forbidden-field', field: 'faceTemplate' });
 assert.deepEqual(doorAnswers({ similarity: 0.99 }), { refused: 'forbidden-field', field: 'matchScore' });
 runtime.close();
});

test('a door code expires without costing a try, and its last wrong try tells the desk through the incident register', () => {
 const { safety, reports } = incidentDesk();
 const runtime = runtimeWith([safety]);
 const code = runtime.call(CODE, as('nurse', 'N-205', 'vetting', { appointmentRef: 'appt-1' }));
 assert.equal(code.status, 200, JSON.stringify(code.body));
 const digits = String(code.body.doorCode);
 assert.match(digits, new RegExp(`^\\d{${verifyInService.door.digits}}$`));
 assert.equal(code.body.attemptsAllowed, defaults.doorCodeAttempts);
 assert.equal(Date.parse(String(code.body.expiresAt)) - Date.parse(START), defaults.doorCodeMinutes * MINUTE);
 const wrong = digits === '000000' ? '111111' : '000000';

 const miss = runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-1', doorCode: wrong }));
 assert.deepEqual(miss.body, { codeMatched: false, attemptsLeft: defaults.doorCodeAttempts - 1, incidentRaised: false });
 const hit = runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-1', doorCode: digits }));
 assert.deepEqual(hit.body, { codeMatched: true, attemptsLeft: defaults.doorCodeAttempts - 1, incidentRaised: false, nurseName: 'Sister Naledi Mokoena', badgeTier: 'verified' });
 noNumberAbout(hit.body);
 const yes = runtime.call(ANSWER, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-1', answer: 'she-is-my-nurse' }));
 assert.deepEqual(yes.body, { verified: true, incidentRaised: false });
 assert.equal(published(runtime, 'trust.door.verified@1').length, 1);
 refused(runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-1', doorCode: digits })), 'door-check-closed');
 refused(runtime.call(CODE, as('nurse', 'N-205', 'vetting', { appointmentRef: 'appt-1' })), 'door-check-already-done');

 /* Expired: refused, and the try is not counted — a new code has every try. */
 const late = runtime.call(CODE, as('nurse', 'N-205', 'vetting', { appointmentRef: 'appt-2' }));
 runtime.advance(defaults.doorCodeMinutes * MINUTE);
 refused(runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-2', doorCode: String(late.body.doorCode) })), 'door-code-expired');
 const again = runtime.call(CODE, as('nurse', 'N-205', 'vetting', { appointmentRef: 'appt-2' }));
 const fresh = runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-2', doorCode: String(again.body.doorCode) }));
 assert.equal(fresh.body.attemptsLeft, defaults.doorCodeAttempts);
 refused(runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-9', doorCode: '123456' })), 'no-door-code-for-this-visit');

 /* Every try used: the last one is a mismatch, published once and reported in the contract's words. */
 const shown = runtime.call(CODE, as('nurse', 'N-205', 'vetting', { appointmentRef: 'appt-3' }));
 const other = String(shown.body.doorCode) === '000000' ? '111111' : '000000';
 let last: { status: number; body: Record<string, unknown> } | undefined;
 for (let i = 0; i < defaults.doorCodeAttempts; i++) last = runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-3', doorCode: other }));
 assert.deepEqual(last!.body, { codeMatched: false, attemptsLeft: 0, incidentRaised: true });
 const mismatches = published(runtime, 'trust.door.mismatched@1');
 assert.equal(mismatches.length, 1);
 assert.equal((JSON.parse(mismatches[0]!.body) as { payload: { reasonCode: string } }).payload.reasonCode, 'attempts-used');
 const { kind, whatHappened, informationReached } = verifyInService.door.incident;
 assert.deepEqual(reports, [{ kind, whatHappened, informationReached }]);
 refused(runtime.call(TRY, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-3', doorCode: String(shown.body.doorCode) })), 'door-check-closed');
 /* A code asked for again cannot reset the tries: the check is closed. */
 refused(runtime.call(CODE, as('nurse', 'N-205', 'vetting', { appointmentRef: 'appt-3' })), 'door-check-already-done');

 /* Not my nurse needs no code and is taken once; yes needs a match. */
 refused(runtime.call(ANSWER, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-4', answer: 'she-is-my-nurse' })), 'door-answer-before-code');
 refused(runtime.call(ANSWER, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-4', answer: 'maybe' })), 'door-answer-unknown');
 const no = runtime.call(ANSWER, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-4', answer: 'not-my-nurse' }));
 assert.deepEqual(no.body, { verified: false, incidentRaised: true });
 runtime.call(ANSWER, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-4', answer: 'not-my-nurse' }));
 assert.equal(published(runtime, 'trust.door.mismatched@1').length, 2);
 assert.equal(reports.length, 2);

 /* A nurse without a current verification has no code to show; a change to the tries reaches the next code only. */
 refused(runtime.call(CODE, as('nurse', 'N-204', 'vetting', { appointmentRef: 'appt-5' })), 'no-badge-to-show-at-a-door');
 const before = runtime.call(CODE, as('nurse', 'N-206', 'vetting', { appointmentRef: 'appt-6' }));
 assert.equal(change(runtime, 'door-code-attempts', { wholeNumber: defaults.doorCodeAttempts + 1 }, 1, 'tries-1').status, 200);
 assert.equal(before.body.attemptsAllowed, defaults.doorCodeAttempts);
 assert.equal(runtime.call(CODE, as('nurse', 'N-206', 'vetting', { appointmentRef: 'appt-7' })).body.attemptsAllowed, defaults.doorCodeAttempts + 1);
 runtime.close();
});

test('the incident register Verify calls is the live version; the one Wave 6 withdrew answers as no route at all', () => {
 const { safety } = incidentDesk();
 const runtime = runtimeWith([safety]);
 /* trust/engine.ts's INCIDENTS constant names @3, the version Wave 6 widened to admit engine:trust; the
    withdrawn @2 it replaced is not a route this or any runtime can still be asked for. */
 const dead = runtime.call('POST /v1/safety/incidents@2', as('engine:trust', null, 'audit'));
 assert.equal(dead.status, 404);
 assert.equal(dead.body.error, 'no-route');
 runtime.close();
});

test('a door mismatch the incident register does not record is rolled back rather than told to the patient as reported', () => {
 const failing = defineEngine({ id: 'safety', store: { schema: '' }, subscriptions: {}, routes: { 'POST /v1/safety/incidents@3': () => ({ refuse: 'incident-refused' }) } });
 const runtime = runtimeWith([failing]);
 const answer = runtime.call(ANSWER, as('patient', 'subject-synthetic-1', 'vetting', { appointmentRef: 'appt-1', answer: 'not-my-nurse' }));
 assert.equal(answer.status, 500);
 assert.equal(published(runtime, 'trust.door.mismatched@1').length, 0);
 runtime.close();
});

test('a complaint is reviewed within the window it arrived under, ages on the queue, reaches the nurse without its complainant, and changes no badge', () => {
 const runtime = runtimeWith();
 const badge = () => runtime.call(BADGE, as('patient', 'subject-synthetic-1', 'dispatch', { partyId: 'N-205' })).body;
 const before = badge();
 const made = runtime.call(COMPLAIN, as('patient', 'subject-synthetic-1', 'vetting', { partyRef: 'N-205', appointmentRef: 'appt-1', categoryCode: 'conduct', whatHappened: 'She was short with my mother.' }));
 assert.equal(made.status, 200, JSON.stringify(made.body));
 assert.equal(made.body.reviewWithinHours, defaults.complaintReviewHours);
 assert.equal(Date.parse(String(made.body.reviewBy)) - Date.parse(START), defaults.complaintReviewHours * HOUR);
 const received = published(runtime, 'trust.complaint.received@1');
 assert.equal(received.length, 1);
 assert.deepEqual(Object.keys((JSON.parse(received[0]!.body) as { payload: object }).payload).sort(), ['complaintRef', 'reviewBy']);
 assert.deepEqual(badge(), before, 'A complaint arriving changes no badge.');

 /* The window is changed; the complaint keeps the one it arrived under, and ages against it. */
 assert.equal(change(runtime, 'complaint-review-hours', { wholeNumber: defaults.complaintReviewHours * 2 }, 1, 'window-1').status, 200);
 runtime.advance((defaults.complaintReviewHours + 1) * HOUR);
 const [row] = runtime.call(QUEUE, as('admin', 'A-901', 'vetting')).body.items as Record<string, unknown>[];
 assert.deepEqual(Object.keys(row!).sort(), ['ageHours', 'categoryCode', 'complaintRef', 'overdue', 'partyRef', 'receivedAt', 'reviewBy', 'reviewWithinHours', 'settingsVersion', 'state']);
 assert.equal(row!.ageHours, defaults.complaintReviewHours + 1);
 assert.equal(row!.reviewWithinHours, defaults.complaintReviewHours);
 assert.equal(row!.overdue, true);
 assert.doesNotMatch(JSON.stringify(row), /short with my mother|subject-synthetic-1/);
 refused(runtime.call(QUEUE, as('admin', 'A-901', 'vetting', { categoryCode: 'conduct' })), 'complaint-queue-takes-no-filter');

 const notices = runtime.call(NOTICES, as('nurse', 'N-205', 'vetting')).body.items as Record<string, unknown>[];
 assert.deepEqual(notices, [{ complaintRef: made.body.complaintRef, categoryCode: 'conduct', state: 'awaiting-review', outcomeCode: null }]);
 assert.deepEqual(runtime.call(NOTICES, as('nurse', 'N-206', 'vetting')).body.items, []);

 const opened = runtime.call(OPEN, as('admin', 'A-901', 'vetting', { complaintRef: made.body.complaintRef }));
 assert.equal(opened.body.whatHappened, 'She was short with my mother.');
 const eventsBefore = runtime.trail.all().filter(entry => entry.kind === 'published').length;
 refused(runtime.call(DECIDE, as('admin', 'A-901', 'vetting', { complaintRef: made.body.complaintRef, outcomeCode: 'upheld', reason: 'Two accounts agree.', scoreChange: -10 })), 'complaint-decision-carries-no-weight');
 refused(runtime.call(DECIDE, as('admin', 'A-901', 'vetting', { complaintRef: made.body.complaintRef, outcomeCode: 'struck-off', reason: 'No.' })), 'complaint-outcome-unknown');
 refused(runtime.call(DECIDE, as('admin', 'A-901', 'vetting', { complaintRef: made.body.complaintRef, outcomeCode: 'upheld', reason: '  ' })), 'complaint-decision-without-reason');
 const decided = runtime.call(DECIDE, as('admin', 'A-901', 'vetting', { complaintRef: made.body.complaintRef, outcomeCode: 'upheld', reason: 'Two accounts agree.' }));
 assert.equal(decided.status, 200);
 assert.equal(runtime.trail.all().filter(entry => entry.kind === 'published').length, eventsBefore, 'Deciding a complaint publishes nothing.');
 assert.deepEqual(badge(), before, 'An upheld complaint changes no badge.');
 refused(runtime.call(DECIDE, as('admin', 'A-901', 'vetting', { complaintRef: made.body.complaintRef, outcomeCode: 'not-upheld', reason: 'Changed my mind.' })), 'complaint-already-decided');
 assert.deepEqual(runtime.call(NOTICES, as('nurse', 'N-205', 'vetting')).body.items, [{ complaintRef: made.body.complaintRef, categoryCode: 'conduct', state: 'decided', outcomeCode: 'upheld' }]);

 refused(runtime.call(COMPLAIN, as('patient', 'subject-synthetic-1', 'vetting', { partyRef: 'N-205', appointmentRef: 'appt-1', categoryCode: 'conduct', whatHappened: 'Again.', lowerScore: true })), 'complaint-carries-no-weight');
 refused(runtime.call(COMPLAIN, as('patient', 'subject-synthetic-1', 'vetting', { partyRef: 'N-205', appointmentRef: 'appt-1', categoryCode: 'hiv', whatHappened: 'Again.' })), 'complaint-category-unknown');
 refused(runtime.call(COMPLAIN, as('patient', 'subject-synthetic-1', 'vetting', { partyRef: 'N-205', appointmentRef: 'appt-1', categoryCode: 'conduct', whatHappened: 'x'.repeat(verifyInService.complaints.maxCharacters + 1) })), 'complaint-account-empty-or-long');
 refused(runtime.call(COMPLAIN, as('patient', 'subject-synthetic-1', 'vetting', { partyRef: 'N-999', appointmentRef: 'appt-1', categoryCode: 'conduct', whatHappened: 'Who?' })), 'unknown-party');
 refused(runtime.call(OPEN, as('admin', 'A-901', 'vetting', { complaintRef: 'complaint-nobody' })), 'no-such-complaint');
 runtime.close();
});

test('nobody acts on their own file: a complaint about yourself, and a reviewer reading or deciding one about themselves, are refused', () => {
 const runtime = runtimeWith();
 refused(runtime.call(COMPLAIN, as('caregiver', 'N-205', 'vetting', { partyRef: 'N-205', appointmentRef: 'appt-1', categoryCode: 'conduct', whatHappened: 'About me.' })), 'complaint-about-yourself');
 const made = runtime.call(COMPLAIN, as('patient', 'subject-synthetic-1', 'vetting', { partyRef: 'N-208', appointmentRef: 'appt-2', categoryCode: 'late-or-missed', whatHappened: 'He was an hour late.' }));
 refused(runtime.call(OPEN, as('admin', 'N-208', 'vetting', { complaintRef: made.body.complaintRef })), 'complaint-about-you');
 refused(runtime.call(DECIDE, as('admin', 'N-208', 'vetting', { complaintRef: made.body.complaintRef, outcomeCode: 'not-upheld', reason: 'I was not late.' })), 'complaint-about-you');
 /* A nurse cannot name somebody else's shift or code: neither route takes a party, and the undeclared field is refused. */
 refused(runtime.call(SHIFT, as('nurse', 'N-205', 'vetting', { partyRef: 'N-204' })), 'shift-start-carries-no-face');
 assert.equal(runtime.call(CODE, as('nurse', 'N-204', 'vetting', { appointmentRef: 'appt-3', partyRef: 'N-205' })).status, 409, 'The code is the caller\'s, and N-204 has no badge whoever she names.');
 runtime.close();
});
