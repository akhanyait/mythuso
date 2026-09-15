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

/* A patient's SOS, heard from Safety: who owns the concern, who it falls back to, and how long the desk has to take it on
   — the ladder rung closed-loop.json proposes rather than a second number for the same urgency — and the stand-down that
   closes it, by the outcome each stand-down reason maps to. Core reads no Safety contract and no plan. */
export const SOS = closedLoop.sos.hears as EventKey;
export const SOS_STOOD_DOWN = closedLoop.sosStoodDown.hears as EventKey;
export const sosOwnerRole: string = closedLoop.sos.ownerRole.value;
export const sosFallbackRole: string = closedLoop.sos.fallbackRole.value;
if (!ownerRoles.has(sosOwnerRole) || !ownerRoles.has(sosFallbackRole) || sosOwnerRole === sosFallbackRole) throw new Error('packages/catalog/closed-loop.json gives an SOS an owner or a fallback nobody can be, or the same role twice, so a patient\'s press would reach nobody or have no fallback.');
const sosSpan = spanForRung(closedLoop.sos.ladderRung.value);
if (sosSpan === undefined) throw new Error('packages/catalog/closed-loop.json gives an SOS a ladder rung the ladder does not hold, so the desk would have no time anybody chose.');
export const sosSpanMs: number = sosSpan;
export const sosOutcomes: ReadonlyMap<string, string> = new Map(Object.entries(closedLoop.sosStoodDown.closesAs.value));

/* A hospital discharge, heard from Record (Wave 5): who owns the follow-up concern, who it falls back to, and how long its
   owner has to take it on — the rung closed-loop.json proposes. Core reads no Record contract. */
export const DISCHARGE = closedLoop.dischargeReceived.hears as EventKey;
export const dischargeOwnerRole: string = closedLoop.dischargeReceived.ownerRole.value;
export const dischargeFallbackRole: string = closedLoop.dischargeReceived.fallbackRole.value;
if (!ownerRoles.has(dischargeOwnerRole) || !ownerRoles.has(dischargeFallbackRole) || dischargeOwnerRole === dischargeFallbackRole) throw new Error('packages/catalog/closed-loop.json gives a discharge follow-up an owner or a fallback nobody can be, or the same role twice, so a patient home from hospital would be followed up by nobody.');
const dischargeSpan = spanForRung(closedLoop.dischargeReceived.ladderRung.value);
if (dischargeSpan === undefined) throw new Error('packages/catalog/closed-loop.json gives a discharge follow-up a ladder rung the ladder does not hold, so its owner would have no time anybody chose.');
export const dischargeSpanMs: number = dischargeSpan;

/* A Sentinel tier raised by a clinician, heard from Safety: the rung from which Core opens a concern at all, who owns it
   and who it falls back to. The time to acknowledge it is the ladder's for the rung Sentinel raised, so no second number
   is kept for it. Core reads no Safety contract, and nothing Sentinel sends chooses the owner, the fallback or the time. */
export const SENTINEL = closedLoop.sentinel.hears as EventKey;
export const sentinelOpensAtRung: number = closedLoop.sentinel.opensAtRung.value;
export const sentinelOwnerRole: string = closedLoop.sentinel.ownerRole.value;
export const sentinelFallbackRole: string = closedLoop.sentinel.fallbackRole.value;
if (spanForRung(sentinelOpensAtRung) === undefined) throw new Error('packages/catalog/closed-loop.json opens a Sentinel concern from a rung the ladder does not hold, so no tier Sentinel raises would reach anybody.');
if (!ownerRoles.has(sentinelOwnerRole) || !ownerRoles.has(sentinelFallbackRole) || sentinelOwnerRole === sentinelFallbackRole) throw new Error('packages/catalog/closed-loop.json gives a Sentinel concern an owner or a fallback nobody can be, or the same role twice, so a tier three would reach nobody or have no fallback.');

/* A safeguarding concern recorded at Safety: who owns the concern Core opens, who it falls back to, and the ladder rung whose
   time the desk has. Closing that concern never closes the report, which Safety keeps open for a safeguarding officer. */
export const SAFEGUARDING = closedLoop.safeguarding.hears as EventKey;
export const safeguardingOwnerRole: string = closedLoop.safeguarding.ownerRole.value;
export const safeguardingFallbackRole: string = closedLoop.safeguarding.fallbackRole.value;
if (!ownerRoles.has(safeguardingOwnerRole) || !ownerRoles.has(safeguardingFallbackRole) || safeguardingOwnerRole === safeguardingFallbackRole) throw new Error('packages/catalog/closed-loop.json gives a safeguarding concern an owner or a fallback nobody can be, or the same role twice, so a report would reach nobody or have no fallback.');
const safeguardingSpan = spanForRung(closedLoop.safeguarding.ladderRung.value);
if (safeguardingSpan === undefined) throw new Error('packages/catalog/closed-loop.json gives a safeguarding concern a ladder rung the ladder does not hold, so the desk would have no time anybody chose.');
export const safeguardingSpanMs: number = safeguardingSpan;
