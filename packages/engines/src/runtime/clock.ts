/* The simulated clock. An SLA that escalates after thirty minutes cannot be tested by waiting thirty
   minutes, and a clock read from the machine makes every deadline test a race. So time is a value the
   runtime holds and a test moves, and instants are written with an offset as the event envelope says. */
import type { Clock } from './types.ts';

export const instant = (at: Date): string => at.toISOString().replace('Z', '+00:00');

export function createClock(start: Date | string = new Date()): Clock {
 let ms = new Date(start).getTime();
 if (!Number.isFinite(ms)) throw new Error('The simulated clock was started at something that is not a time.');
 return {
  now: () => new Date(ms),
  iso: () => instant(new Date(ms)),
  advance(by: number) {
   if (!Number.isFinite(by) || by < 0) throw new Error('The simulated clock moves forwards only.');
   ms += by;
  },
  set(at: Date | string) {
   const next = new Date(at).getTime();
   if (!Number.isFinite(next) || next < ms) throw new Error('The simulated clock moves forwards only.');
   ms = next;
  },
 };
}
