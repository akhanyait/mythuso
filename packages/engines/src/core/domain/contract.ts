/* What Core reads, and from where. Nothing in this directory types a deadline, a reason code, a
 * severity, a role, a post or a refusal sentence: the rungs, codes, severities and the panic rule are
 * packages/catalog/closed-loop.json's, the rota and its minutes are the settings in force (./settings.ts),
 * the roles are the vetting register's and the API contract's, the engines are the event contract's, and
 * every sentence is packages/catalog/apis/core.json's, rendered by the runtime from the id a handler
 * refuses with.
 *
 * WHY A MINUTE IS THE ONLY NUMBER HERE. It is a unit, not a policy. Every policy number is a proposal
 * in the contract with nobody's name beside it yet, and the build fails if this directory types one. */
import closedLoop from '../../../../catalog/closed-loop.json' with { type: 'json' };
import apis from '../../../../catalog/apis.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import events from '../../../../catalog/events.json' with { type: 'json' };
import type { EventKey } from '../../runtime/index.ts';
import { MINUTE_MS } from './loops.ts';

export const contract = closedLoop;

const spans = new Map(closedLoop.ladder.rungs.map(r => [r.rung, r.acknowledgeWithinMinutes.value * MINUTE_MS]));
/** How long an owner has to acknowledge a concern on this rung, or undefined for a rung the ladder does not hold. */
export const spanForRung = (rung: number): number | undefined => spans.get(rung);

/* The highest severity the contract allows is the last it lists, so adding a worse one moves the
   announcement of an exhausted concern with it rather than leaving it one short. */
export const highestSeverity: string = closedLoop.severities.ids[closedLoop.severities.ids.length - 1]!;

/** The event Core announces an exhausted concern with. It may not be declared yet; see closed-loop.json. */
export const EXHAUSTED = closedLoop.exhaustion.event as EventKey;

/** The panic Core hears, and how long the posts it alerts have to take it on: the time of the ladder rung the contract names for it. */
export const PANIC = closedLoop.panic.hears as EventKey;
const panicSpan = spanForRung(closedLoop.panic.ladderRung.value);
if (panicSpan === undefined) throw new Error('packages/catalog/closed-loop.json gives a panic a ladder rung the ladder does not hold, so a panic would have no time anybody chose.');
export const panicSpanMs: number = panicSpan;

export const reasons = {
 deadlinePassed: closedLoop.escalationReasons.deadlinePassed,
 raisedAgainHigher: closedLoop.escalationReasons.raisedAgainHigher,
 byCaller: new Set(closedLoop.escalationReasons.byCaller.value.map(r => r.id)),
 snooze: new Set(closedLoop.snooze.reasons.value.map(r => r.id)),
};

/** The outcomes a concern may be closed with. A close names one of these or is refused. */
export const outcomes: ReadonlySet<string> = new Set(closedLoop.outcomes.value.map(o => o.id));

/* A panic resolved at Safety's desk: the event Core hears, and which of the outcomes above it closes the concern
   opened for that panic as, by the code of what happened. The panic's outcomes are Safety's; which outcome of the
   closed loop each one is belongs here, so Core reads no Safety contract and closes through the same rule the
   close route asks. */
export const PANIC_RESOLVED = closedLoop.panicResolved.hears as EventKey;
export const panicOutcomes: ReadonlyMap<string, string> = new Map(Object.entries(closedLoop.panicResolved.closesAs.value));

/* A lab result acknowledged by its clinician: the event Core hears, the one engine whose alert for the result it
   stands down, and the outcome it closes that alert as. Named in closed-loop.json, so Core reads no Medicines or
   Clinical contract. */
export const RESULT_ACKNOWLEDGED = closedLoop.resultAcknowledged.hears as EventKey;
export const resultAlertsFrom: string = closedLoop.resultAcknowledged.alertsFrom;
export const resultClosesAs: string = closedLoop.resultAcknowledged.closesAs.value;

/* Who may own a concern: somebody on the vetting register or a caller the API contract names, and
   never a caller the binder cannot tell apart from anybody — nobody is waiting on "anonymous". */
const cannotOwn = new Set<string>(apis.engineRuntime.binderCannotAdmit);
export const ownerRoles = new Set<string>([...vetting.roles.map(r => r.id), ...apis.callers.map(c => c.id)].filter(id => !cannotOwn.has(id)));

export const engineIds = new Set<string>(events.engines.map(e => e.id));
