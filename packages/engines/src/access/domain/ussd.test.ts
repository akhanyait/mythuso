/* A USSD booking session: the menu walked to a booking through the same rules the booking route answers with, every
   refusal in packages/catalog/ussd.json's words, nothing typed kept, and the session's wait read from Access's setting
   in force when it was dialled. Every screen the menu can show fits the contract's maximum. Nothing here is dialled. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ussd from '../../../../catalog/ussd.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { emptyLedger, offeredDays, requestBooking } from './booking.ts';
import { accessBlock, accessInForce } from './settings.ts';
import { proposeChange } from '../../settings/shape.ts';
import { accessSettings } from './settings.ts';
import { MAX_CHARACTERS, channelSentence, classifyReply, dayLabel, everyScreen, reply, startSession, type Session } from './ussd.ts';

const NOW = new Date('2026-09-15T09:00:00+02:00');
const PATIENT = 'subject-synthetic-lerato';
const IN_FORCE = accessInForce([]);
const FALLBACK = IN_FORCE.namedNurseFallback;
const SECOND = 1000;
const ctx = (at: Date = NOW) => ({ now: at, ledger: emptyLedger, namedNurseFallback: FALLBACK });
const later = (seconds: number) => new Date(NOW.getTime() + seconds * SECOND);
const setting = accessBlock.items.find(s => s.key === ussd.session.timeoutSetting)!;

function dial(timeoutSeconds = IN_FORCE.ussdSessionSeconds) {
 return startSession({ sessionRef: 'ussd-synthetic-1', subjectRef: PATIENT, now: NOW, timeoutSeconds, namedNurseFallback: FALLBACK });
}
/* Replies sent a second apart, so no reply is late. */
function walk(session: Session, replies: string[]) {
 let step = { session, screen: '', booked: null as ReturnType<typeof reply>['booked'] };
 replies.forEach((typed, i) => { step = reply(step.session, typed, ctx(later(i + 1))); });
 return step;
}

test('a session walks the menu to a booking the booking rules made, for whoever is nearest, and nothing is paid on it', () => {
 const opened = dial();
 assert.ok(opened.screen.startsWith(ussd.menu.nodes[0]!.text!));
 const serviceIndex = services.filter(s => s.phase === 1).findIndex(s => s.id === 'vitals') + 1;
 const zoneIndex = geography.zones.findIndex(z => z.id === 'melville') + 1;
 const step = walk(opened.session, ['1', String(serviceIndex), String(zoneIndex), '1', '1', '1']);
 assert.ok(step.booked, step.screen);
 const firstDay = offeredDays(later(5))[0]!;
 assert.deepEqual([step.booked.booking.serviceId, step.booked.booking.zoneId, step.booked.booking.slot.date, step.booked.booking.slot.nurseRef], ['vitals', 'melville', firstDay, null]);
 assert.equal(step.booked.events[0]!.type, 'booking.requested');
 assert.equal(step.booked.events[0]!.actorRole, ussd.booking.actorRole);
 assert.ok(step.screen.includes(step.booked.booking.bookingRef), 'the reference is on the screen');
 /* The same request through the rules directly gives the same booking, because the session is its idempotency key. */
 const direct = requestBooking(step.booked.ledger, { idempotencyKey: `ussd:${opened.session.sessionRef}`, subjectRef: PATIENT, serviceId: 'vitals', mode: 'home', slotRef: step.booked.booking.slot.slotRef, zoneId: 'melville', actorRole: 'patient' }, { now: later(6), candidates: [], namedNurseFallback: FALLBACK });
 assert.ok(!direct.refused && direct.value.booking.bookingRef === step.booked.booking.bookingRef && direct.events.length === 0, 'a reply sent twice books once');
});

test('an hour no longer offered is refused in the booking route\'s own words, and nothing is booked', () => {
 const opened = dial();
 let step = walk(opened.session, ['1', '1', '1', '1', '1']);
 /* A day later the first offered day has moved on, so the hour chosen is not offered any more. */
 const dayLater = new Date(NOW.getTime() + 86_400_000);
 step = reply({ ...step.session, lastAt: dayLater.getTime() - SECOND }, '1', ctx(dayLater));
 assert.equal(step.booked, null);
 assert.equal(step.session.nodeId, 'refused');
 assert.ok(step.screen.startsWith('That time was not offered'), step.screen);
});

test('a reply that is not a choice is refused as what it looks like, and what was typed is never kept', () => {
 const opened = dial();
 const cases: [string, string][] = [['8001015009087', 'no-identity-number'], ['4111 1111 1111 1111', 'no-card-details'], ['chest pain since Monday', 'no-clinical-detail'], ['7', 'not-a-choice']];
 for (const [typed, id] of cases) {
  assert.equal(classifyReply(typed), id, typed);
  const step = reply(opened.session, typed, ctx(later(1)));
  assert.equal(step.session.refusal, id);
  assert.ok(step.screen.startsWith(channelSentence(id as never)), step.screen);
  /* The session holds which refusal was said and nothing of what was typed: no field carries the reply, and its fields
     are exactly the ones a session always has. */
  assert.ok(Object.values(step.session).every(value => value !== typed && value !== typed.trim()), `the session kept "${typed}"`);
  assert.deepEqual(Object.keys(step.session).sort(), Object.keys(opened.session).sort());
  if (typed.length > 3) assert.ok(!JSON.stringify(step.session).includes(typed), `the session kept "${typed}"`);
  assert.equal(reply(step.session, '0', ctx(later(2))).session.refusal, null, 'back returns to the menu');
 }
});

test('a session ends with nothing booked when a reply comes after the wait it was dialled with, and a changed setting reaches only the next session', () => {
 const opened = dial();
 assert.equal(opened.session.timeoutSeconds, setting.default.value);
 assert.equal(reply(opened.session, '1', ctx(later(IN_FORCE.ussdSessionSeconds))).session.ended, null, 'a reply on the last second is in time');
 const late = reply(opened.session, '1', ctx(later(IN_FORCE.ussdSessionSeconds + 1)));
 assert.equal(late.session.ended, 'timed-out');
 assert.equal(late.screen, ussd.session.timedOut);
 assert.equal(reply(late.session, '1', ctx(later(IN_FORCE.ussdSessionSeconds + 2))).booked, null, 'nothing books after it ended');

 const lowest = setting.bounds!.lowest.value;
 const changed = proposeChange(accessSettings, [], { setting: setting.key, value: lowest, reason: 'Synthetic, for the USSD test.', expectedVersion: 1, byRole: 'admin', byRef: 'party-synthetic-admin' }, NOW.getTime());
 assert.ok(changed.ok, JSON.stringify(changed));
 const shorter = accessInForce([changed.value.change]).ussdSessionSeconds;
 assert.equal(shorter, lowest);
 assert.equal(reply(opened.session, '1', ctx(later(lowest + 1))).session.ended, null, 'the open session keeps the wait it was dialled with');
 const next = dial(shorter);
 assert.equal(reply(next.session, '1', ctx(later(lowest + 1))).session.ended, 'timed-out');
 const tooShort = proposeChange(accessSettings, [], { setting: setting.key, value: lowest - 1, reason: 'Synthetic.', expectedVersion: 1, byRole: 'admin', byRef: 'party-synthetic-admin' }, NOW.getTime());
 assert.equal(tooShort.ok ? null : tooShort.refusal.id, 'setting-out-of-range');
});

test('every screen the menu can show fits the handset, across a year of days', () => {
 for (let d = 0; d < 366; d += 29) {
  for (const { where, text } of everyScreen(new Date(NOW.getTime() + d * 86_400_000), FALLBACK)) assert.ok(text.length <= MAX_CHARACTERS, `${where} is ${text.length} characters: ${JSON.stringify(text)}`);
 }
 assert.ok(dayLabel('2026-09-16').length > 0);
});
