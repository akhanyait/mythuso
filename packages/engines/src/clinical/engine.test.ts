/* Clinical Intelligence on the runtime: a review signed by a clinician's own action and every refusal on the way,
 * the consultation's completeness gate, triage and Home Guidance refused without ratification, outcome questions
 * scheduled from the settings in force, and who confirms a review read from a setting. The Phase B hardening adds
 * the same shape to what comes before the clinical work: whether a protocol is ready for the board's ratification,
 * whether a minor's guardian consent stands, and whether a clinician's HPCSA verification is current — each answered
 * from the contracts (protocols.json's governance, consent.json's guardianConsent) and each refusing by default.
 *
 * Care, Trust and the Record are stand-ins that publish what the real ones would, on the next tick, so a handover,
 * a verification and a record's author reach Clinical the way the contract says they do: on the bus. Every sentence
 * is the contract's and every role and day a setting's, read rather than typed. Nothing here is a real service, and
 * nothing here is clinical content: the only rules and scripts are synthetic stand-ins handed to the domain's gates
 * to prove the gates, and none of them is in the registry.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import clinical from '../../../catalog/clinical.json' with { type: 'json' };
import consent from '../../../catalog/consent.json' with { type: 'json' };
import protocols from '../../../catalog/protocols.json' with { type: 'json' };
import { MEMORY, createClock, createRuntime, defineEngine, type EventKey, type RouteKey } from '../runtime/index.ts';
import { engine } from './engine.ts';
import { DAY, OUTSIDE_PROTOCOL, UNDER_PROTOCOL, frame, guidanceOutcomes, refusal, register, requiredHeadings, versionIdOf } from './domain/contract.ts';
import { clinicalByDefault, clinicalSettings } from './domain/settings.ts';
import { gate, triageOn, validateProtocolReadiness, type RuleSet } from './domain/triage.ts';
import { deliver } from './domain/guidance.ts';
import { ageAt, evaluateGuardianConsent, isMinor } from './domain/guardian.ts';
import { isCredentialCurrent, type CredentialStanding } from './domain/standing.ts';
import { refusalOf } from '../settings/shape.ts';

const START = '2026-09-15T09:00:00+02:00';
const UNTIL = '2027-09-15';
const R = {
 inbox: 'GET /v1/clinical/reviews@2', sign: 'POST /v1/clinical/reviews/{reviewRef}/sign@2', consult: 'POST /v1/clinical/consultations@2',
 triage: 'POST /v1/clinical/triage@3', guidance: 'POST /v1/clinical/guidance@1', proms: 'POST /v1/clinical/proms@2', change: 'POST /v1/clinical/setting-changes@1'
} as const;
const DOCTOR = 'party-synthetic-doctor', OTHER_DOCTOR = 'party-synthetic-other-doctor', NURSE = 'party-synthetic-nurse', OTHER_NURSE = 'party-synthetic-other-nurse';
const PATIENT = 'subject-synthetic-patient', OTHER_PATIENT = 'subject-synthetic-other-patient', ADMIN = 'party-synthetic-admin';
const DRAFT = versionIdOf(register.find(p => p.status === 'draft')!);
const ALL_HEADINGS = frame.map(h => h.code);

type Answer = { status: number; body: Record<string, unknown> };
const refused = (answer: Answer, id: string) => {
 assert.equal(answer.body['error'], id, JSON.stringify(answer.body));
 assert.equal(answer.body['message'], refusal(id).statement);
 assert.equal(answer.status, refusal(id).status);
};
const accepted = (answer: Answer) => { assert.equal(answer.status, 200, JSON.stringify(answer.body)); return answer.body; };

function world() {
 const pending: { owner: string; key: EventKey; subjectRef: string; payload: Record<string, unknown>; protocolVersion?: string }[] = [];
 const standIn = (id: string) => defineEngine({
  id, routes: {}, subscriptions: {}, store: { schema: '' },
  tick: ctx => {
   for (const event of pending.filter(e => e.owner === id)) {
    pending.splice(pending.indexOf(event), 1);
    ctx.publish(event.key, event.payload, { subjectRef: event.subjectRef, purposeOfUse: id === 'trust' ? 'audit' : 'treatment', ...(event.protocolVersion ? { protocolVersion: event.protocolVersion } : {}) });
   }
  }
 });
 const runtime = createRuntime({ env: { MYTHUSO_ENGINES: 'synthetic-data-only' }, engines: [engine, standIn('trust'), standIn('care'), standIn('record')], dataDirectory: MEMORY, clock: createClock(START) });
 const says = (owner: string, key: EventKey, subjectRef: string, payload: Record<string, unknown>, protocolVersion?: string) => { pending.push({ owner, key, subjectRef, payload, protocolVersion }); runtime.advance(0); };
 const call = (key: string, role: string, ref: string | null, fields: Record<string, unknown>, purpose = 'treatment'): Answer => runtime.call(key as RouteKey, { role, ref, purpose, fields });
 const published = (key: string) => runtime.trail.all().filter(entry => entry.kind === 'published' && entry.eventKey === key).map(entry => JSON.parse(entry.body) as { payload: Record<string, unknown>; protocolVersion?: string });
 const verified = (ref: string, role: string) => says('trust', 'person.verified@1', ref, { role, badgeTier: 'verified', verifiedUntil: UNTIL });
 /* A nurse writes the visit's consultation, signs it off, and Care hands the visit over. */
 const visit = (n: number, { protocolVersion, sectionsWritten = ALL_HEADINGS, signOff = true, writer = NURSE, subjectRef = PATIENT }: { protocolVersion?: string; sectionsWritten?: readonly string[]; signOff?: boolean; writer?: string; subjectRef?: string } = {}) => {
  const encounterRef = `encounter-synthetic-${n}`;
  says('record', 'passport.entry.written@1', subjectRef, { entryRef: encounterRef, resourceType: 'Encounter', authorRole: 'nurse', authorRef: writer, provenance: 'care' });
  call(R.consult, 'nurse', writer, { subjectRef, encounterRef, consultationEntryRef: `consultation-entry-synthetic-${n}`, sectionsWritten: [...sectionsWritten], signOff });
  says('care', 'visit.handover.submitted@1', subjectRef, { appointmentRef: `TH-SYN-${n}`, encounterRef }, protocolVersion);
  const inbox = accepted(call(R.inbox, 'doctor', DOCTOR, {}));
  const row = (inbox['reviews'] as Record<string, unknown>[]).find(r => r['encounterRef'] === encounterRef)!;
  return { encounterRef, reviewRef: row['reviewRef'] as string, row };
 };
 const signAs = (role: string, ref: string | null, reviewRef: string, encounterRef: string, over: Record<string, unknown> = {}) =>
  call(R.sign, role, ref, { reviewRef, encounterRef, signingModeCode: OUTSIDE_PROTOCOL, ...over });
 return { runtime, call, published, says, verified, visit, signAs };
}

test('a doctor signs a nurse\'s visit under a draft protocol only as reviewed outside any protocol, once, and nothing on the bus says a draft was followed', () => {
 const { runtime, published, verified, visit, signAs } = world();
 verified(DOCTOR, 'doctor');
 const { reviewRef, encounterRef, row } = visit(1, { protocolVersion: DRAFT });
 assert.equal(row['protocolVersionId'], DRAFT);
 assert.equal(row['protocolRatified'], false);
 assert.equal(row['recordComplete'], true);
 assert.equal(row['stateCode'], clinical.reviews.states[0]!.code);

 refused(signAs('doctor', DOCTOR, reviewRef, encounterRef, { signingModeCode: UNDER_PROTOCOL, protocolVersionId: DRAFT }), 'protocol-not-ratified');
 const signed = accepted(signAs('doctor', DOCTOR, reviewRef, encounterRef));
 assert.equal(signed['signingModeCode'], OUTSIDE_PROTOCOL);
 assert.equal(signed['protocolVersionId'], undefined, 'a signature outside any protocol cites none');
 assert.ok(String(signed['episodeRef']).startsWith('episode-'));
 const [event] = published('review.signed@1');
 assert.deepEqual(event!.payload, { reviewRef, encounterRef, signedByRef: DOCTOR });
 assert.equal(event!.protocolVersion, undefined, 'the envelope names no protocol for a review signed outside one');
 refused(signAs('doctor', DOCTOR, reviewRef, encounterRef), 'review-already-signed');
 refused(signAs('doctor', DOCTOR, 'review-nobody-opened', encounterRef), 'no-such-review');

 /* A visit that named no protocol is signed the same way, and cannot be signed as following one. */
 const none = visit(2);
 assert.equal(none.row['protocolVersionId'], null);
 refused(signAs('doctor', DOCTOR, none.reviewRef, none.encounterRef, { signingModeCode: UNDER_PROTOCOL }), 'protocol-not-ratified');
 refused(signAs('doctor', DOCTOR, none.reviewRef, none.encounterRef, { signingModeCode: 'signed-by-default' }), 'signing-mode-not-declared');
 accepted(signAs('doctor', DOCTOR, none.reviewRef, none.encounterRef));
 assert.deepEqual(runtime.faults(), []);
});

test('nothing signs automatically, nobody but a cleared confirmer signs, nobody signs their own record, and an incomplete record is not signed', () => {
 const { call, says, verified, visit, signAs } = world();
 verified(DOCTOR, 'doctor');
 verified(NURSE, 'nurse');
 verified(OTHER_NURSE, 'nurse');
 const { reviewRef, encounterRef } = visit(1);

 refused(signAs('doctor', null, reviewRef, encounterRef), 'auto-signed-note');
 refused(signAs('nurse', OTHER_NURSE, reviewRef, encounterRef), 'not-a-confirmer');
 refused(call(R.inbox, 'nurse', OTHER_NURSE, {}), 'not-a-confirmer');
 refused(signAs('doctor', OTHER_DOCTOR, reviewRef, encounterRef), 'not-a-confirmer');
 refused(call(R.inbox, 'doctor', OTHER_DOCTOR, {}), 'not-a-confirmer');
 refused(signAs('doctor', DOCTOR, reviewRef, 'encounter-somebody-else'), 'no-such-review');

 /* A doctor who wrote a consultation for the encounter wrote its record. */
 const written = visit(2);
 call(R.consult, 'doctor', DOCTOR, { subjectRef: PATIENT, encounterRef: written.encounterRef, consultationEntryRef: 'consultation-entry-by-the-doctor', sectionsWritten: ['S'] });
 refused(signAs('doctor', DOCTOR, written.reviewRef, written.encounterRef), 'own-record');

 const incomplete = visit(3, { sectionsWritten: requiredHeadings.slice(0, 1), signOff: false });
 refused(signAs('doctor', DOCTOR, incomplete.reviewRef, incomplete.encounterRef), 'record-incomplete');

 /* A suspension reaches the next signature. */
 says('trust', 'person.suspended@1', DOCTOR, { role: 'doctor', reasonCode: 'credential-lapsed' });
 refused(signAs('doctor', DOCTOR, reviewRef, encounterRef), 'not-a-confirmer');
 says('trust', 'person.reinstated@1', DOCTOR, { role: 'doctor', badgeTier: 'verified' });
 accepted(signAs('doctor', DOCTOR, reviewRef, encounterRef));
});

test('a consultation is not signed off until every required heading is written, and a signed one is not rewritten', () => {
 const { call } = world();
 const fields = { subjectRef: PATIENT, encounterRef: 'encounter-synthetic-9', consultationEntryRef: 'consultation-entry-synthetic-9' };
 assert.ok(requiredHeadings.length > 0, 'the frame requires something, worked out from records.json');
 const partial = requiredHeadings.slice(0, requiredHeadings.length - 1);
 refused(call(R.consult, 'nurse', NURSE, { ...fields, sectionsWritten: partial, signOff: true }), 'required-sections-missing');
 const draft = accepted(call(R.consult, 'nurse', NURSE, { ...fields, sectionsWritten: partial }));
 assert.equal(draft['signable'], false);
 assert.deepEqual(draft['missingSections'], requiredHeadings.slice(-1));
 assert.equal(draft['signedOffAt'], undefined);
 refused(call(R.consult, 'nurse', NURSE, { ...fields, sectionsWritten: ['S', 'free-text'] }), 'section-not-in-the-frame');
 refused(call(R.consult, 'nurse', null, { ...fields, sectionsWritten: ALL_HEADINGS, signOff: true }), 'auto-signed-note');
 const signedOff = accepted(call(R.consult, 'nurse', NURSE, { ...fields, sectionsWritten: ALL_HEADINGS, signOff: true }));
 assert.equal(signedOff['consultationRef'], draft['consultationRef'], 'the same entry is the same consultation');
 assert.equal(signedOff['signable'], true);
 assert.ok(signedOff['signedOffAt']);
 refused(call(R.consult, 'nurse', NURSE, { ...fields, sectionsWritten: ALL_HEADINGS }), 'consultation-already-signed-off');
});

test('nothing is triaged without a ratified triage protocol, and no model lowers a priority the rules set', () => {
 const { runtime, call, published } = world();
 for (const protocolVersionId of [undefined, ...register.map(versionIdOf), 'triage-invented@1']) {
  refused(call(R.triage, 'nurse', NURSE, { subjectRef: PATIENT, intakeEntryRef: 'intake-synthetic-1', ...(protocolVersionId ? { protocolVersionId } : {}), explanationPriorityCode: 'whatever-a-model-said' }), 'triage-without-ratified-protocol');
 }
 assert.equal(published('triage.completed@2').length, 0, 'nothing was triaged, so nothing was published');
 assert.deepEqual(runtime.faults(), []);

 /* The gates, proved against a synthetic register and synthetic rules that are in no contract. */
 const synthetic = [{ id: 'synthetic-triage', name: 'Synthetic', engine: 'clinical', version: 1, status: 'ratified' }];
 const context = { triageRef: 'triage-synthetic', register: synthetic, triageProtocols: ['synthetic-triage'] };
 const noRules = triageOn({ intakeEntryRef: 'i', protocolVersionId: 'synthetic-triage@1' }, context);
 assert.equal(!noRules.ok && noRules.refusal.id, 'protocol-content-not-in-this-build');
 const rules = (fired: boolean, reasonCodes: string[] = ['rule-a']): RuleSet => ({
  priorityScale: ['first', 'second', 'third'], redFlagPriority: 'first',
  run: () => ({ priorityCode: 'second', careSetting: 'setting-synthetic', reasonCodes, redFlagFired: fired, triageEntryRef: 'triage-entry-synthetic' })
 });
 const asked = (set: RuleSet, explanation?: string) => gate(set, set.run('i'), explanation, 'triage-synthetic', 'synthetic-triage@1');
 const lowered = asked(rules(false), 'third');
 assert.equal(!lowered.ok && lowered.refusal.id, 'model-lowers-priority');
 const unknown = asked(rules(false), 'not-on-the-scale');
 assert.equal(!unknown.ok && unknown.refusal.id, 'model-lowers-priority', 'a priority the scale does not hold cannot be shown not to be lower');
 const raised = asked(rules(false), 'first');
 assert.ok(raised.ok && raised.value.priorityCode === 'second', 'a model may name a more urgent priority, and the rules\' priority stands');
 const redFlag = asked(rules(true), 'second');
 assert.equal(!redFlag.ok && redFlag.refusal.id, 'model-lowers-priority', 'a red flag sets the most urgent priority, and nothing lowers it');
 const flagged = asked(rules(true));
 assert.ok(flagged.ok && flagged.value.priorityCode === 'first');
 const noReasons = asked(rules(false, []));
 assert.equal(!noReasons.ok && noReasons.refusal.id, 'priority-without-reason-codes');
 assert.ok(flagged.ok && flagged.emits.every(e => !Object.keys(e.payload).some(k => /reason|flag|symptom|note|diagnos/i.test(k))), 'reason codes and red flags stay off the bus');
});

test('every Home Guidance outcome is refused without a ratified script, and a script that tells a patient what they have is refused too', () => {
 const { call } = world();
 for (const outcome of guidanceOutcomes) {
  refused(call(R.guidance, 'nurse', NURSE, { triageRef: 'triage-synthetic', scriptRef: outcome.scriptRef ?? `${outcome.code}-script` }), 'script-not-ratified');
 }
 const ratified = [{ id: 'synthetic-guidance', name: 'Synthetic', engine: 'clinical', version: 1, status: 'ratified' }];
 const script = { scriptRef: 'script-synthetic', outcomeCode: guidanceOutcomes[0]!.code, protocolVersionId: 'synthetic-guidance@1', contentRef: 'content-synthetic' };
 const noWords = deliver({ triageRef: 't', scriptRef: script.scriptRef }, { guidanceRef: 'g', scripts: [script], register: ratified });
 assert.equal(!noWords.ok && noWords.refusal.id, 'script-not-ratified', 'a script whose words are not in the build is not given');
 const told = deliver({ triageRef: 't', scriptRef: script.scriptRef }, { guidanceRef: 'g', scripts: [script], register: ratified, read: () => `${clinical.wording.patientDiagnosis.phrases[0]} synthetic condition.` });
 assert.equal(!told.ok && told.refusal.id, 'tells-a-diagnosis');
 const draft = deliver({ triageRef: 't', scriptRef: script.scriptRef }, { guidanceRef: 'g', scripts: [{ ...script, protocolVersionId: DRAFT }], read: () => 'Synthetic words.' });
 assert.equal(!draft.ok && draft.refusal.id, 'script-not-ratified', 'a script under a draft protocol is not given');
});

test('outcome questions are scheduled from the days in force when the review is signed, kept by the episode, and refused until the board chooses an instrument', () => {
 const { runtime, call, verified, visit, signAs } = world();
 verified(DOCTOR, 'doctor');
 const first = visit(1);
 const before = accepted(signAs('doctor', DOCTOR, first.reviewRef, first.encounterRef))['episodeRef'] as string;
 const [earliest] = clinicalByDefault.promDays;

 /* An admin changes the days; the episode already scheduled keeps the days it was scheduled with. */
 const changed = [earliest! + 1, clinicalByDefault.promDays.at(-1)! + 1];
 accepted(call(R.change, 'admin', ADMIN, { idempotencyKey: 'change-1', setting: clinical.proms.scheduleSetting, items: changed, reason: 'Synthetic change for the test.', expectedVersion: 1 }, 'audit'));
 refused(call(R.change, 'admin', ADMIN, { idempotencyKey: 'change-2', setting: clinical.proms.scheduleSetting, items: [...changed].reverse(), reason: 'Out of order.', expectedVersion: 2 }, 'audit'), 'prom-days-out-of-order');
 const second = visit(2);
 const after = accepted(signAs('doctor', DOCTOR, second.reviewRef, second.encounterRef))['episodeRef'] as string;

 const answer = (episodeRef: string, dayMark: number, ref: string = PATIENT) => call(R.proms, 'patient', ref, { episodeRef, dayMark, answers: [{ questionCode: 'q-synthetic', answerCode: 'a-synthetic' }] });
 refused(answer(before, earliest!), 'prom-not-due');
 refused(answer(after, changed[0]!), 'prom-not-due');
 runtime.advance(earliest! * DAY);
 refused(answer(before, earliest!), 'no-prom-instrument');
 /* The later episode was scheduled with the changed days, not the default. */
 refused(answer(after, earliest!), 'prom-not-due');
 runtime.advance(DAY);
 refused(answer(after, changed[0]!), 'no-prom-instrument');
 refused(answer(before, earliest!, OTHER_PATIENT), 'no-such-episode');
 refused(answer('episode-nobody-started', earliest!), 'no-such-episode');
 assert.deepEqual(runtime.faults(), []);
});

test('who confirms a clinical review is a setting of clinical roles only, and the inbox and the signature read it', () => {
 const { call, verified, visit, signAs } = world();
 verified(DOCTOR, 'doctor');
 verified(NURSE, 'nurse');
 verified(OTHER_NURSE, 'nurse');
 assert.deepEqual(clinicalByDefault.confirmers, clinical.settings.items[0]!.default.value);
 const setting = clinicalSettings.block.items.find(s => s.key === clinical.reviews.confirmerSetting)!;
 for (const forbidden of setting.guardrail!.forbids) assert.ok(refusalOf(setting, forbidden), `the confirmer setting accepts ${JSON.stringify(forbidden)}`);
 const change = (roles: string[], expectedVersion: number, key: string) => call(R.change, 'admin', ADMIN, { idempotencyKey: key, setting: setting.key, roles, reason: 'Synthetic change for the test.', expectedVersion }, 'audit');
 refused(change(['pharmacy'], 1, 'c-1'), 'setting-out-of-range');
 refused(change(['nurse', 'admin'], 1, 'c-2'), 'setting-out-of-range');

 const { reviewRef, encounterRef } = visit(1, { writer: NURSE });
 refused(signAs('nurse', OTHER_NURSE, reviewRef, encounterRef), 'not-a-confirmer');
 accepted(change(['nurse'], 1, 'c-3'));
 accepted(call(R.inbox, 'nurse', OTHER_NURSE, {}));
 refused(call(R.inbox, 'doctor', DOCTOR, {}), 'not-a-confirmer');
 refused(signAs('doctor', DOCTOR, reviewRef, encounterRef), 'not-a-confirmer');
 refused(signAs('nurse', NURSE, reviewRef, encounterRef), 'own-record');
 accepted(signAs('nurse', OTHER_NURSE, reviewRef, encounterRef));
});

/* ---- Phase B: protocol governance, guardian consent and credential standing -------------------------- */

describe('protocol governance validation', () => {
 it('missing board returns specific refusal', () => {
  /* No board is formed and no Medical Director is appointed, so nothing in the register may move past draft. */
  assert.equal(protocols.governance.board.status, 'not-formed');
  assert.equal(protocols.governance.medicalDirector.status, 'not-appointed');
  assert.equal(protocols.governance.ratificationProcess.currentStep, 'draft');

  const unsigned = validateProtocolReadiness({ protocolId: 'wound-care', version: 1, ratifiedBy: null, ratifiedAt: '2026-09-01', safetyCase: 'Synthetic safety case.' });
  assert.equal(unsigned.ready, false);
  assert.deepEqual(unsigned.missingSteps, ['medical-director-sign']);
  assert.equal(unsigned.refusalDetail, 'Triage protocol wound-care cannot be used: missing medical-director-sign.');

  /* Every protocol in the register is a draft, so every one names all three missing steps. */
  for (const p of protocols.protocols) {
   const readiness = validateProtocolReadiness({ protocolId: p.id, version: p.version, ratifiedBy: p.ratifiedBy, ratifiedAt: p.ratifiedOn, safetyCase: p.safetyCase });
   assert.equal(readiness.ready, false, `${p.id} is a draft, so it cannot be ready`);
   assert.deepEqual(readiness.missingSteps, ['medical-director-sign', 'ratification-date', 'safety-case']);
   assert.equal(readiness.refusalDetail, `Triage protocol ${p.id} cannot be used: missing medical-director-sign, ratification-date, safety-case.`);
  }
 });

 it('missing safety case returns specific refusal', () => {
  const readiness = validateProtocolReadiness({ protocolId: 'wound-care', version: 1, ratifiedBy: 'Dr Synthetic', ratifiedAt: '2026-09-01', safetyCase: null });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missingSteps, ['safety-case']);
  assert.equal(readiness.refusalDetail, 'Triage protocol wound-care cannot be used: missing safety-case.');
 });

 it('fully ratified protocol passes readiness', () => {
  const readiness = validateProtocolReadiness({ protocolId: 'wound-care', version: 1, ratifiedBy: 'Dr Synthetic', ratifiedAt: '2026-09-01', safetyCase: 'Synthetic safety case.' });
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missingSteps, []);
  assert.equal(readiness.refusalDetail, '');
 });
});

describe('guardian consent framework', () => {
 const declared = (id: string): { id: string; statement: string; status: number } => {
  const found = consent.guardianConsent.refusals.find(r => r.id === id);
  assert.ok(found, `packages/catalog/consent.json declares no guardian refusal "${id}", so there is no sentence to refuse with`);
  return found;
 };

 it('adult does not need guardian consent', () => {
  assert.equal(consent.guardianConsent.ageThreshold, 18, 'the threshold the domain reads is the contract\'s');
  assert.deepEqual(evaluateGuardianConsent(consent.guardianConsent.ageThreshold, null), { allowed: true });
  assert.deepEqual(evaluateGuardianConsent(65, null), { allowed: true });
 });

 it('minor without guardian is refused', () => {
  const evaluation = evaluateGuardianConsent(12, null);
  assert.equal(evaluation.allowed, false);
  assert.equal(evaluation.refusalId, 'minor-without-guardian');
  assert.equal(declared('minor-without-guardian').status, 403);
 });

 it('minor with unverified proof is refused', () => {
  const evaluation = evaluateGuardianConsent(12, { minorRef: PATIENT, guardianRef: 'party-synthetic-guardian', proofType: 'birth-certificate', proofVerifiedAt: null, expiresAt: null });
  assert.equal(evaluation.allowed, false);
  assert.equal(evaluation.refusalId, 'no-proof-of-authority');
  assert.equal(declared('no-proof-of-authority').status, 422);
 });

 it('minor with expired authority is refused', () => {
  const evaluation = evaluateGuardianConsent(12, { minorRef: PATIENT, guardianRef: 'party-synthetic-guardian', proofType: 'court-order', proofVerifiedAt: '2024-01-01', expiresAt: '2025-01-01' }, START);
  assert.equal(evaluation.allowed, false);
  assert.equal(evaluation.refusalId, 'expired-authority-document');
  assert.equal(declared('expired-authority-document').status, 403);
 });

 it('minor with valid guardian consent is allowed', () => {
  const evaluation = evaluateGuardianConsent(12, { minorRef: PATIENT, guardianRef: 'party-synthetic-guardian', proofType: 'legal-guardianship', proofVerifiedAt: '2026-06-01', expiresAt: '2027-06-01' }, START);
  assert.deepEqual(evaluation, { allowed: true });
 });

 it('age calculation handles birthday edge case', () => {
  assert.equal(isMinor('2008-09-15', '2026-09-15'), false, 'on the eighteenth birthday itself the person is not a minor');
  assert.equal(isMinor('2008-09-16', '2026-09-15'), true, 'the day before the eighteenth birthday the person still is one');
  assert.equal(ageAt('2008-09-15', '2026-09-15'), 18);
  assert.equal(ageAt('2008-09-16', '2026-09-15'), 17);
 });
});

describe('credential standing', () => {
 const credentialed = (hpcsaVerifiedAt?: string): CredentialStanding => ({
  subjectRef: DOCTOR, role: 'doctor', verifiedUntil: UNTIL, stopped: false, ended: false, heardAt: START, hpcsaVerifiedAt
 });

 it('missing HPCSA verification is not current', () => {
  assert.equal(isCredentialCurrent(credentialed(), '2026-09-15'), false, 'a clinician never verified with the HPCSA is not current');
 });

 it('expired HPCSA verification is not current', () => {
  assert.equal(isCredentialCurrent(credentialed('2024-09-14'), '2026-09-15'), false);
  assert.equal(isCredentialCurrent(credentialed('2025-09-14'), '2026-09-15'), false, 'the day before the twelve-month window opens is not current');
 });

 it('recent HPCSA verification is current', () => {
  assert.equal(isCredentialCurrent(credentialed('2026-03-15'), '2026-09-15'), true);
  assert.equal(isCredentialCurrent(credentialed('2025-09-15'), '2026-09-15'), true, 'exactly twelve months is still current');
 });
});
