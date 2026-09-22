/* The rate gate every external adapter passes through, added on 22 September 2026 with the governed
   federation work.

   WHAT THIS IS. One small rolling-window limiter: at most `requestsPerMinute` calls in the last
   sixty seconds, and — where the source's config records one — at most `requestsPerDay` in the
   current UTC day. An adapter asks the gate before every outgoing request; when the gate says no,
   the adapter returns a "rate-limited" outcome carrying the wait, and nothing leaves the process.
   The gate exists because the limits in federation.json are part of what the licence review signed
   off, and a limit that lives only in a comment is a limit nobody holds.

   WHY A WINDOW, NOT A TOKEN BUCKET. A rolling window is the shape the sources themselves publish
   their limits in (240 per minute, 30 per minute), so what this code enforces is literally what the
   config says — nothing smoothed, nothing banked. A burst the source would refuse is a burst this
   gate refuses first.

   GATES ARE SHARED PER SOURCE. rateGateFor() hands out one gate per source id for the life of the
   process, because the published limits are per-caller, not per-call-site: two callers of the
   ICD-11 adapter must share one ceiling. Tests wire their own gates through AdapterDeps, so a test
   never spends a real source's budget or another test's. */

const WINDOW_MS = 60_000;

export class RateGate {
  private readonly hits: number[] = [];
  private readonly requestsPerMinute: number;
  private readonly requestsPerDay: number | undefined;
  private dayStamp = "";
  private dayCount = 0;

  constructor(requestsPerMinute: number, requestsPerDay?: number) {
    this.requestsPerMinute = requestsPerMinute;
    this.requestsPerDay = requestsPerDay;
  }

  /* Roll the window and the day forward to `nowMs` without consuming anything. */
  private roll(nowMs: number): void {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    if (day !== this.dayStamp) {
      this.dayStamp = day;
      this.dayCount = 0;
    }
    const cutoff = nowMs - WINDOW_MS;
    while (this.hits.length && this.hits[0] <= cutoff) this.hits.shift();
  }

  /* 0 when a call may go now; otherwise the milliseconds until it may. Day ceiling first: when a
     daily budget is spent, waiting out the minute changes nothing, so the wait runs to the next UTC
     midnight — the boundary the sources' own daily counters reset on. */
  waitMsUntilAllowed(nowMs: number): number {
    this.roll(nowMs);
    if (this.requestsPerDay !== undefined && this.dayCount >= this.requestsPerDay) {
      const nextMidnight = Date.UTC(
        new Date(nowMs).getUTCFullYear(),
        new Date(nowMs).getUTCMonth(),
        new Date(nowMs).getUTCDate() + 1,
      );
      return Math.max(1, nextMidnight - nowMs);
    }
    if (this.hits.length >= this.requestsPerMinute)
      return Math.max(1, this.hits[0] + WINDOW_MS - nowMs);
    return 0;
  }

  /* Consume one unit when allowed; false (and nothing consumed) when not. */
  take(nowMs: number): boolean {
    if (this.waitMsUntilAllowed(nowMs) > 0) return false;
    this.hits.push(nowMs);
    this.dayCount += 1;
    return true;
  }

  /* For the audit-minded and the tests: how many calls this gate has admitted in the window. */
  get admittedInWindow(): number {
    return this.hits.length;
  }
}

/* One gate per source, for the life of the process. A caller that needs an isolated gate (a test, a
   future dry-run tool) constructs its own RateGate and passes it through AdapterDeps. */
const gates = new Map<string, RateGate>();

export function rateGateFor(
  sourceId: string,
  requestsPerMinute: number,
  requestsPerDay?: number,
): RateGate {
  let gate = gates.get(sourceId);
  if (!gate) {
    gate = new RateGate(requestsPerMinute, requestsPerDay);
    gates.set(sourceId, gate);
  }
  return gate;
}
