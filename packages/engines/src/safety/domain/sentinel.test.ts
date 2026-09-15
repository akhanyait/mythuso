/* Sentinel and safeguarding, as arithmetic: what enters a baseline, what suspends and removes, what an evaluation answers,
 * how a tier raised by hand is refused, and what a safeguarding report is and is not. Every sentence is the contract's,
 * and every clock is a number handed in. The engines together are packages/engines/src/sentinel-and-safeguarding.test.ts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE } from './rules.ts';
import {
 baselineOf, categories, evaluate, groups, guardianRefused, heard, leaveByRecall, openBaseline, raiseByHand, recordReport, reportsForDesk, resumeFor,
 rungs, sentinelContract, sentinelRefusal, stateFor, suspendFor, type HeardReading
} from './sentinel.ts';
import { sentinelSettingsOf } from './settings.ts';

const AT = Date.parse('2026-09-15T09:00:00+02:00');
const DAY = 1440 * MINUTE;
const settings = sentinelSettingsOf([]);
const PATIENT = 'subject-synthetic-7';

const payload = (n: number, deviceRef = 'device-ox') => ({ readingRef: `reading-${n}`, deviceRef, metric: 'pulse', qualityCode: 'good', observationRef: `Observation/${n}` });
const readingsOf = (count: number, deviceRef = 'device-ox', from = AT) => Array.from({ length: count }, (_, i) => heard(payload(i + 1, deviceRef), PATIENT, from + i * MINUTE)!);
const refusedWith = (answer: { ok: boolean; refusal?: { id: string; statement: string } }, route: Parameters<typeof sentinelRefusal>[0], id: string) => {
 assert.equal(answer.ok, false, `expected ${id}`);
 assert.equal(answer.refusal!.id, id);
 assert.equal(answer.refusal!.statement, sentinelRefusal(route, id).statement);
};

test('a reading is heard only from what reading.ingested@1 carries, and keeps no value', () => {
 const reading = heard(payload(1), PATIENT, AT)!;
 assert.deepEqual(Object.keys(reading).sort(), ['deviceRef', 'heardAt', 'leftByRecallAt', 'metric', 'readingRef', 'recordEntryRef', 'subjectRef']);
 assert.equal(heard({ ...payload(2), observationRef: undefined }, PATIENT, AT), null, 'no place in the record, nothing heard');
 assert.equal(heard({ ...payload(3), metric: 'mood' }, PATIENT, AT), null, 'a measure the record does not hold');
});

test('a baseline counts what it heard inside the window it kept, and forms at the minimum it kept', () => {
 const baseline = openBaseline(PATIENT, 'pulse', settings, AT);
 const almost = readingsOf(settings.minimumReadings - 1);
 assert.equal(baselineOf(baseline, almost, AT).stateCode, 'forming');
 const enough = readingsOf(settings.minimumReadings);
 const formed = baselineOf(baseline, enough, AT + DAY);
 assert.deepEqual([formed.stateCode, formed.countedSoFar, formed.neededToForm, formed.windowDays], ['formed', settings.minimumReadings, settings.minimumReadings, settings.windowDays]);
 assert.equal(baselineOf(baseline, enough, AT + (settings.windowDays + 1) * DAY).countedSoFar, 0, 'outside the window it kept, nothing counts');
});

test('a settings change never rewrites a baseline already open', () => {
 const kept = openBaseline(PATIENT, 'pulse', settings, AT);
 const changed = { settingsVersion: settings.settingsVersion + 1, windowDays: settings.windowDays + 1, minimumReadings: settings.minimumReadings - 1 };
 const view = baselineOf(kept, readingsOf(settings.minimumReadings - 1), AT);
 assert.deepEqual([view.neededToForm, view.windowDays, view.settingsVersion, view.stateCode], [settings.minimumReadings, settings.windowDays, settings.settingsVersion, 'forming']);
 const next = baselineOf(openBaseline('subject-synthetic-8', 'pulse', changed, AT), readingsOf(settings.minimumReadings - 1).map(r => ({ ...r, subjectRef: 'subject-synthetic-8' })), AT);
 assert.deepEqual([next.neededToForm, next.settingsVersion, next.stateCode], [changed.minimumReadings, changed.settingsVersion, 'formed']);
});

test('a stale device suspends every baseline it gave a reading to, a newer reading lifts it, and a recall takes its readings out', () => {
 const baseline = openBaseline(PATIENT, 'pulse', settings, AT);
 const readings: HeardReading[] = readingsOf(settings.minimumReadings);
 const [suspended] = suspendFor([baseline], readings, 'device-ox', AT + DAY);
 assert.equal(baselineOf(suspended!, readings, AT + DAY).stateCode, 'suspended', 'suspended counts towards nothing, whatever it holds');
 assert.deepEqual(suspendFor([baseline], readings, 'device-other', AT + DAY), [], 'a device that gave it nothing suspends nothing');
 const [lifted] = resumeFor([suspended!], 'device-ox', AT + 2 * DAY);
 assert.equal(baselineOf(lifted!, readings, AT + 2 * DAY).stateCode, 'formed');

 const left = leaveByRecall(readings, [suspended!], 'device-ox', AT + 3 * DAY);
 assert.equal(left.readings.length, readings.length, 'every reading from the device, because the event names no moment the recall took effect');
 const after = readings.map(r => left.readings.find(l => l.readingRef === r.readingRef) ?? r);
 const view = baselineOf(left.baselines[0]!, after, AT + 3 * DAY);
 assert.deepEqual([view.countedSoFar, view.leftByRecall, view.stateCode], [0, readings.length, 'forming']);
 assert.equal(after.length, readings.length, 'nothing is deleted');
});

test('an evaluation answers not evaluated, with the reason as the contract\'s sentence, and never a tier', () => {
 const answer = evaluate();
 assert.deepEqual(answer, { code: 'not-evaluated', reasonCode: 'no-ratified-rule', sentence: sentinelContract.evaluation.reasons.find(r => r.id === 'no-ratified-rule')!.sentence });
 assert.deepEqual(sentinelContract.evaluation.ratifiedRules, []);
 const state = stateFor(PATIENT, [openBaseline(PATIENT, 'pulse', settings, AT)], readingsOf(settings.minimumReadings), [], AT);
 assert.equal(state!.evaluation.code, 'not-evaluated', 'a formed baseline is still not evaluated');
 assert.equal(stateFor('subject-nobody', [], [], [], AT), null);
});

test('a tier is raised by a named clinician, on a reading Sentinel heard, one to three, and tier four is refused', () => {
 const readings = readingsOf(1);
 const base = { deviationRef: 'deviation-1', subjectRef: PATIENT, recordEntryRef: 'Observation/1', rung: 3, byRole: 'doctor', byRef: 'party-synthetic-401', undeclared: [] as string[] };
 refusedWith(raiseByHand({ ...base, undeclared: ['value'] }, readings, AT), 'raise', 'deviation-carries-nothing-else');
 refusedWith(raiseByHand({ ...base, byRef: null }, readings, AT), 'raise', 'raised-by-nobody');
 for (const rung of [4, 5]) refusedWith(raiseByHand({ ...base, rung }, readings, AT), 'raise', 'tier-four-not-in-this-build');
 for (const rung of [0, -1, 2.5, '3']) refusedWith(raiseByHand({ ...base, rung }, readings, AT), 'raise', 'rung-not-on-the-sentinel-ladder');
 refusedWith(raiseByHand({ ...base, recordEntryRef: 'Observation/from-a-watch' }, readings, AT), 'raise', 'no-clinical-weight-behind-it');
 refusedWith(raiseByHand({ ...base, subjectRef: 'subject-synthetic-8' }, readings, AT), 'raise', 'not-this-patients-reading');
 refusedWith(raiseByHand(base, leaveByRecall(readings, [], 'device-ox', AT).readings, AT), 'raise', 'reading-left-by-recall');

 assert.deepEqual(rungs.map(r => r.rung), [1, 2, 3]);
 const raised = raiseByHand(base, readings, AT);
 assert.ok(raised.ok);
 assert.equal(raised.value.toldCode, rungs.find(r => r.rung === 3)!.toldCode);
 assert.deepEqual(raised.emits, [{ type: 'sentinel.rung_raised', version: 1, payload: { concernRef: 'deviation-1', rung: 3, recordEntryRef: 'Observation/1' } }]);
});

test('a safeguarding report is recorded open, held for the officer and not sent, carries nothing typed, and the desk sees no kind, patient or reporter', () => {
 const base = { reportRef: 'safeguarding-1', subjectRef: PATIENT, groupCode: groups[0]!.id, categoryCode: categories[0]!.id, byRole: 'nurse', byRef: 'party-synthetic-205', undeclared: [] as string[] };
 refusedWith(recordReport({ ...base, byRef: null }, AT), 'report', 'report-without-reporter');
 refusedWith(recordReport({ ...base, undeclared: ['whatWasSeen'] }, AT), 'report', 'safeguarding-keeps-no-narrative');
 refusedWith(recordReport({ ...base, groupCode: 'teenager' }, AT), 'report', 'safeguarding-group-not-declared');
 refusedWith(recordReport({ ...base, categoryCode: 'bruising' }, AT), 'report', 'safeguarding-category-not-declared');

 const recorded = recordReport(base, AT);
 assert.ok(recorded.ok);
 assert.deepEqual([recorded.value.stateCode, recorded.value.statutoryCode, recorded.value.statutoryReasonCode, recorded.value.heldForCode],
  ['open', 'not-sent', 'not-integrated', sentinelContract.safeguarding.officer.heldForCode]);
 assert.deepEqual(recorded.emits, [{ type: 'safeguarding.reported', version: 2, payload: { reportRef: 'safeguarding-1' } }]);

 const [row] = reportsForDesk([recorded.value], AT + 30 * DAY);
 assert.deepEqual(Object.keys(row!).sort(), ['ageMinutes', 'groupCode', 'heldForCode', 'recordedAt', 'reportRef', 'stateCode', 'statutoryCode', 'statutoryReasonCode']);
 assert.equal(row!.stateCode, 'open', 'a month later, still open');
 assert.equal(guardianRefused('guardian')?.refusal.id, 'guardian-told-nothing-of-safeguarding');
 assert.equal(guardianRefused('operator'), null);
});
