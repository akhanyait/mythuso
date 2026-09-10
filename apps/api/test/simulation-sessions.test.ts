/**
 * The simulated session broker: a consultation that connects, and opens nothing.
 *
 * A session is a session object — who joined, when, on which rung, and when it ended. The tests that
 * matter here are about the two things it is not. It is not media: no field of any event is a
 * stream, a recording, a transcript or a join link, and a caller who asks for one is refused in the
 * capability's own words rather than quietly given a session anyway. And it is not a better line
 * than the design admits: every connection an event names is a rung of the ladder in
 * packages/catalog/teleconsult.json, because a simulated call held on a line the real one would
 * never have permitted is a doctor being shown a set of conclusions they may not draw.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import teleconsult from '../../../packages/catalog/teleconsult.json' with { type: 'json' };
import { canonical, decide, feedById } from '../src/feeds/index.ts';
import { forbiddenIndex } from '../src/feeds/contract.ts';
import { refusalsOf } from '../src/simulation/contract.ts';
import { isRefusal } from '../src/simulation/index.ts';
import { MEDIA_EVENTS, mediaSession, scriptFor, sessionFor } from '../src/simulation/care.ts';

const FEED = feedById('media-session')!;
const FORBIDDEN = forbiddenIndex(FEED);
const NOW = new Date();
const LADDER = new Map(teleconsult.connection.map(rung => [rung.id, rung] as const));
const TOP_RUNG = Math.max(...teleconsult.connection.map(rung => rung.fidelity));
/* Enough references to walk every branch the script has, including the one call in four that drops. */
const REFERENCES = Array.from({ length: 60 }, (_, index) => `TH-${2000 + index}`);
const answer = (subject: string, detail: Record<string, unknown>) => mediaSession.produce({ subject, at: NOW, detail });

describe('a session is the shape the feed declares', () => {
 test('every event of a call passes the ingestion boundary as well-formed', () => {
  for (const produced of sessionFor('TH-2048', NOW)) {
   const refusal = decide(FEED, produced.payload);
   assert.equal(refusal.kind, 'not-connected', JSON.stringify(produced.payload));
   assert.equal(refusal.unknownFields, 0);
   assert.deepEqual(refusal.missing, []);
   assert.deepEqual(refusal.wrongType, []);
  }
 });

 test('no event carries a recording, a transcript, a join link or a diagnosis', () => {
  for (const reference of REFERENCES) {
   for (const produced of sessionFor(reference, NOW)) {
    for (const key of Object.keys(produced.payload)) {
     assert.ok(!FORBIDDEN.has(canonical(key)), `${reference} produced "${key}"`);
    }
   }
  }
 });

 test('the six events are the six the feed says it carries', () => {
  const why = FEED.accepts.find(accepted => accepted.field === 'event')!.why;
  for (const event of MEDIA_EVENTS) assert.ok(why.includes(event), `feeds.json no longer names "${event}"`);
 });

 test('a participant is named by role and never by name', () => {
  const roles = new Set(teleconsult.participants.map(participant => participant.id));
  for (const reference of REFERENCES) {
   for (const produced of sessionFor(reference, NOW)) {
    assert.ok(roles.has(produced.payload.participantRole as string), `${produced.payload.participantRole}`);
   }
  }
 });
});

describe('the call connects, and it connects on a line the ladder has', () => {
 test('a doctor joins and the encounter ends', () => {
  const events = sessionFor('TH-2048', NOW).map(produced => produced.payload.event);
  assert.ok(events.includes('waiting'));
  assert.ok(events.includes('joining'));
  assert.ok(events.includes('joined'));
  assert.equal(events[events.length - 1], 'ended');
 });

 test('no event ever names a line better than the ladder’s top rung', () => {
  for (const reference of REFERENCES) {
   for (const produced of sessionFor(reference, NOW)) {
    const id = produced.payload.connectionId;
    if (id === undefined) continue;
    const rung = LADDER.get(id as string);
    assert.ok(rung, `"${id}" is not a rung of the ladder`);
    assert.ok(rung.fidelity <= TOP_RUNG);
   }
  }
 });

 test('sound only is the ordinary case rather than the failure', () => {
  const opened = REFERENCES.map(reference => scriptFor(reference).find(step => step.event === 'joined')!.connectionId);
  const audio = opened.filter(id => id === 'audio').length;
  const video = opened.filter(id => id === 'video').length;
  assert.ok(audio > video, 'a simulator that opens every call on video is a product that works in Sandton');
 });

 test('a dropped line is held for the contract’s ninety seconds and the doctor calls back', () => {
  const dropping = REFERENCES.map(scriptFor).find(steps => steps.some(step => step.event === 'dropped'));
  assert.ok(dropping, 'no call in sixty dropped, so the state this screen exists for is never simulated');
  const droppedAt = dropping.findIndex(step => step.event === 'dropped');
  const back = dropping[droppedAt + 1]!;
  assert.equal(back.event, 'joined');
  assert.equal(back.secondsIn - dropping[droppedAt]!.secondsIn, teleconsult.reconnect.holdSeconds);
  assert.equal(dropping[dropping.length - 1]!.event, 'ended', 'the encounter is closed by somebody rather than left open');
 });

 test('the same reference produces the same call on every run', () => {
  assert.deepEqual(scriptFor('TH-2048'), scriptFor('TH-2048'));
  assert.notDeepEqual(scriptFor('TH-2048'), scriptFor('TH-2049'));
 });
});

describe('nothing here opens a camera, and nothing here declares a permission', () => {
 test('asking for media is refused rather than ignored', () => {
  for (const asked of ['camera', 'microphone', 'mediaStream', 'getUserMedia', 'recorder', 'videoTrack']) {
   const produced = answer('TH-2048', { [asked]: true });
   assert.ok(isRefusal(produced), `${asked} was not refused`);
   assert.ok(produced.refused.includes('camera'));
  }
 });

 test('a recording, a transcript or a join link in the request is the same refusal', () => {
  for (const asked of ['recordingUrl', 'transcript', 'joinUrl', 'roomToken', 'diagnosis']) {
   assert.ok(isRefusal(answer('TH-2048', { [asked]: 'x' })), `${asked} was not refused`);
  }
 });

 test('asking for a permission to be declared is refused in its own words', () => {
  const produced = answer('TH-2048', { permission: 'NSCameraUsageDescription' });
  assert.ok(isRefusal(produced));
  assert.ok(produced.refused.includes('permission'));
 });

 test('a line the ladder does not have is refused', () => {
  for (const detail of [{ connectionId: 'hd' }, { connectionId: 'ultra' }, { fidelity: TOP_RUNG + 1 }]) {
   const produced = answer('TH-2048', detail);
   assert.ok(isRefusal(produced), `${JSON.stringify(detail)} was not refused`);
   assert.ok(produced.refused.includes('ladder'));
  }
 });

 test('all three of the capability’s refusals fire, and none is typed in this file', () => {
  const fired = new Set<string>();
  for (const detail of [{ camera: true }, { permission: 'x' }, { connectionId: 'hd' }]) {
   const produced = answer('TH-2048', detail);
   if (isRefusal(produced)) fired.add(produced.refused);
  }
  assert.deepEqual([...fired].sort(), [...refusalsOf('teleconsultation')].sort());
 });
});
