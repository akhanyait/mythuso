/**
 * Whose clock decides, and how the other one is shown.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────────────────────
 *
 * `deviceClockIsNotTruth`: the device's own time is recorded as what the device believed, and
 * ordering uses the server's receipt time. A phone that has been off the network for two days may
 * have drifted, may have been set by hand, may have come back from a factory reset believing it is
 * 2015. None of that is unusual and none of it is dishonest; what would be dishonest is printing
 * that number under the heading "taken at" and letting a clinician read it as a fact.
 *
 * ── Two different numbers that look like one ─────────────────────────────────────────────────
 *
 * Skew and queue age are constantly confused, and confusing them produces exactly the wrong alarm.
 *
 *  · **Queue age** is how long an entry sat before it reached the server: receipt time minus what the
 *    device believed the capture time was. A nurse in a valley with no signal produces six-hour queue
 *    ages all morning and there is nothing wrong with her, her phone or her work.
 *  · **Skew** is how wrong the clock is: the device's own *now*, sent with the batch, against the
 *    server's now at the moment it arrived. It is measured on the batch and not on the entry, because
 *    the entry is legitimately old and the clock is not.
 *
 * Measuring the second on the first is how an offline-first platform ends up flagging everybody who
 * is actually offline.
 *
 * ── The tolerance ────────────────────────────────────────────────────────────────────────────
 *
 * Five minutes, and it is MyThuso's own setting rather than anything a standard says — the same
 * distinction personalData.ts makes about every retention period. It is wide enough that an unsynced
 * phone drifting a few seconds a day is not a daily conflict, and narrow enough that a clock set by
 * hand to the wrong hour is caught the first time it syncs. A skew inside it is still recorded on
 * every entry, because "we only wrote it down when it was bad" makes the number useless for ever
 * answering how bad it usually is.
 *
 * Pure: numbers in, numbers and sentences out. No clock of its own, which is what lets a test pin
 * down a device that thinks it is next Tuesday.
 */

/** Beyond this, the device's clock is a conflict in its own right. MyThuso's setting, not a standard. */
export const DEVICE_CLOCK_TOLERANCE_MS = 5 * 60_000;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Whole units, largest two, in words. "4 hours 12 minutes", not "4.2h" and not 15_120_000. */
export function describeDuration(ms: number): string {
 const total = Math.abs(Math.round(ms));
 if (total < SECOND) return 'less than a second';
 const parts: [number, string][] = [
  [Math.floor(total / DAY), 'day'],
  [Math.floor((total % DAY) / HOUR), 'hour'],
  [Math.floor((total % HOUR) / MINUTE), 'minute'],
  [Math.floor((total % MINUTE) / SECOND), 'second']
 ];
 const said = parts.filter(([count]) => count > 0).slice(0, 2)
  .map(([count, unit]) => `${count} ${unit}${count === 1 ? '' : 's'}`);
 return said.join(' ');
}

const moment = (at: number): string => new Date(at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export type Skew = {
 /** Positive where the device believes it is later than the server does. Null where it did not say. */
 ms: number | null;
 beyondTolerance: boolean;
 /** Said the same way whether or not it is beyond tolerance. */
 sentence: string;
};

/**
 * How far out the device's clock was at the moment of contact.
 *
 * A batch that does not say what time the device thought it was gets no skew at all and a sentence
 * saying so, rather than a zero — because a zero reads as a device in perfect agreement with the
 * server. "It did not say" and "it agreed exactly" are opposite facts and must not share a number.
 */
export function skewOf(believedSentAt: number | null | undefined, receivedAt: number): Skew {
 if (believedSentAt === null || believedSentAt === undefined || !Number.isFinite(believedSentAt)) {
  return {
   ms: null,
   beyondTolerance: false,
   sentence: 'The device did not say what time it thought it was when it synced, so its clock could not be compared with the server\'s. Ordering is by the server\'s receipt time, as it always is.'
  };
 }
 const ms = believedSentAt - receivedAt;
 const beyondTolerance = Math.abs(ms) > DEVICE_CLOCK_TOLERANCE_MS;
 const magnitude = describeDuration(ms);
 const sentence = Math.abs(ms) < SECOND
  ? 'The device\'s clock agreed with the server\'s to within a second when it synced.'
  : `The device's clock was ${magnitude} ${ms > 0 ? 'ahead of' : 'behind'} the server's when it synced${beyondTolerance ? ', which is beyond the five minutes MyThuso treats as ordinary drift' : ''}.`;
 return { ms, beyondTolerance, sentence };
}

export type Ordering = {
 seq: number;
 receivedAt: number;
 believedCapturedAt: number;
 /** Receipt time minus what the device believed. Negative means the device claims the future. */
 queuedForMs: number;
};

/**
 * The two times, in the one order they may be shown in.
 *
 * The server's receipt time leads, because it is the one that is true. The device's time follows it,
 * attributed to the device in the same breath, and the skew is given beside it so that a reader can
 * judge the claim rather than being asked to trust or ignore it. A surface that wants to show only
 * one of these should show the first.
 */
export function describeOrdering(ordering: Ordering, skew: Skew): string {
 const queued = ordering.queuedForMs >= 0
  ? `It waited ${describeDuration(ordering.queuedForMs)} on the device before it could be sent.`
  : `The device dated it ${describeDuration(ordering.queuedForMs)} after the moment it arrived here, which cannot be right and is why the clock is in question.`;
 return `Received ${moment(ordering.receivedAt)}, ${ordering.seq} in the server's order, which is what orders it. `
  + `The device said it was taken at ${moment(ordering.believedCapturedAt)} — that is what the device believed, not when it happened. `
  + `${skew.sentence} ${queued}`;
}
