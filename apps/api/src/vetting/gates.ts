/**
 * The seven gates, as arithmetic over the checks a party already has.
 *
 * ── Why a gate is computed and never stored ──────────────────────────────────────────────────
 *
 * The master document puts every person through seven onboarding gates — apply, identity,
 * credentials, background, assess, train, activate — and it is tempting to give a party a column
 * that says which one they are at. That column would be wrong the night a police clearance lapses,
 * without a single byte of the row changing, which is exactly the failure the vetting module was
 * built around: a stored "verified" is a claim about a date. So the gate is resolved from the checks
 * on every read, the same way `resolveState` resolves an expiry, and scripts/check-boundaries.mjs
 * fails the build if a gate column appears in the vetting store.
 *
 * ── What a gate refuses ──────────────────────────────────────────────────────────────────────
 *
 * Every check in packages/catalog/vetting.json names its gate. A gate passes when every check at it
 * passes — verified or expiring, and seconded where the check is high-risk — or when the role says,
 * in a sentence, why no check sits there. Nothing else passes it.
 *
 *   · A declined check at a **hard-stop** gate (apply, identity, background) stops the party there,
 *     and it wins over everything: a Child Protection Register listing found at gate 4 is not
 *     outranked by an identity check still pending at gate 2. Nothing after a failed hard stop is
 *     reached, however green it is.
 *   · A declined check at any other gate fails that gate with its own rule — retest once, not
 *     activated — and the party is held there.
 *   · A lapsed check holds the party at its gate. Nothing was decided against them; the date passed,
 *     and the sentence says so rather than borrowing the gate's fail rule. A lapsed police clearance
 *     is not a listing on a sex offenders register, and a status that read as one would be a lie
 *     told to the person most entitled to the truth about their own file.
 *   · Gate 7 passes only when 1 to 6 have, and never while the party is suspended or declined.
 *
 * Every sentence returned comes out of the contract. None is typed here.
 */
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { resolveState, type ActorVetting, type CheckState } from '../protection/gate.ts';

type ContractGate = {
 id: string; order: number; name: string; hardStop: boolean; evidencedBy?: string;
 happens: string; failRule: string; statement: string;
};
type GateNote = { kind: 'does-not-apply' | 'not-yet-a-check'; sentence: string };
type ContractCheck = { id: string; name: string; risk: string; gate: string };
type ContractRole = { id: string; checks: readonly ContractCheck[]; gateNotes: Record<string, GateNote> };

export const GATES = [...(vetting.gates as readonly ContractGate[])].sort((a, b) => a.order - b.order);
export const GATE_RULES = vetting.gateRules as {
 lapse: string; suspended: string; declined: string; notActivated: string; status: string;
};
const ROLES = new Map((vetting.roles as unknown as readonly ContractRole[]).map(role => [role.id, role] as const));

export type GateState = 'passed' | 'not-checked' | 'pending' | 'held' | 'failed' | 'not-reached';
export type GateOutcome = 'activated' | 'in-progress' | 'held' | 'failed' | 'stopped' | 'suspended' | 'declined';

export type GateStanding = {
 id: string;
 order: number;
 name: string;
 state: GateState;
 hardStop: boolean;
 /** The names of the checks at this gate that are not yet passing, in the role's order. */
 outstanding: string[];
 /** Where no check sits at this gate, the role's own sentence saying why. */
 note: GateNote | null;
};

export type GateProgress = {
 gates: GateStanding[];
 /** The gate the party is at: the first one not passed, or the earliest failed hard stop. */
 at: { id: string; order: number; name: string };
 /** "Gate 3 of 7 — Credentials", built from the contract's own template. */
 status: string;
 outcome: GateOutcome;
 /** The sentence the person reads about where they are stuck, or null where nothing is wrong. */
 sentence: string | null;
 activated: boolean;
};

const PASSING: readonly CheckState[] = ['verified', 'expiring'];

export const statusFor = (gate: { order: number; name: string }): string =>
 GATE_RULES.status.replace('{order}', String(gate.order)).replace('{total}', String(GATES.length)).replace('{name}', gate.name);

/**
 * Where a party stands among the seven gates, resolved at `now`.
 *
 * The input is the same `ActorVetting` the access gate reads, so the two cannot come apart: a party
 * this function calls activated is a party `standingOf` calls cleared, and a test holds them to it.
 * A party with an `ActorVetting` at all has applied — gate 1 is evidenced by the enrolment.
 */
export function gateProgress(actor: ActorVetting, now: number): GateProgress {
 const role = ROLES.get(actor.roleId);
 const checks = role?.checks ?? [];
 const gates: GateStanding[] = GATES.map(gate => {
  const base = { id: gate.id, order: gate.order, name: gate.name, hardStop: gate.hardStop, outstanding: [] as string[], note: null as GateNote | null };
  if (gate.evidencedBy === 'enrolment') return { ...base, state: role ? 'passed' : 'pending' };
  if (gate.evidencedBy === 'gates') return { ...base, state: 'pending' };
  const here = checks.filter(check => check.gate === gate.id);
  if (!here.length) return { ...base, state: 'not-checked', note: role?.gateNotes[gate.id] ?? null };
  let declined = false;
  let lapsed = false;
  for (const check of here) {
   const record = actor.records.find(candidate => candidate.checkId === check.id) ?? { checkId: check.id, state: 'outstanding' as CheckState };
   const state = resolveState(record, now);
   if (state === 'declined') declined = true;
   else if (state === 'lapsed') lapsed = true;
   const passing = PASSING.includes(state) && (check.risk !== 'high' || Boolean(record.secondedBy));
   if (!passing) base.outstanding.push(check.name);
  }
  return { ...base, state: declined ? 'failed' : lapsed ? 'held' : base.outstanding.length ? 'pending' : 'passed' };
 });

 const through = (gate: GateStanding) => gate.state === 'passed' || gate.state === 'not-checked';
 const beforeActivation = gates.filter(gate => gate.id !== 'activate');
 const activate = gates.find(gate => gate.id === 'activate')!;
 const stop = gates.find(gate => gate.hardStop && gate.state === 'failed');

 if (stop) {
  for (const gate of gates) if (gate.order > stop.order) gate.state = 'not-reached';
  return finish(gates, stop, 'stopped', contractGate(stop.id).failRule, actor);
 }
 const first = beforeActivation.find(gate => !through(gate));
 if (first) {
  const outcome: GateOutcome = first.state === 'failed' ? 'failed' : first.state === 'held' ? 'held' : 'in-progress';
  const sentence = outcome === 'failed' ? contractGate(first.id).failRule : outcome === 'held' ? GATE_RULES.lapse : null;
  return finish(gates, first, outcome, sentence, actor);
 }
 if (actor.declined) return finish(gates, activate, 'declined', actor.declinedReason ?? GATE_RULES.declined, actor);
 if (actor.suspended) return finish(gates, activate, 'suspended', actor.suspendedReason ?? GATE_RULES.suspended, actor);
 activate.state = 'passed';
 return finish(gates, activate, 'activated', null, actor);
}

function finish(gates: GateStanding[], at: GateStanding, outcome: GateOutcome, sentence: string | null, actor: ActorVetting): GateProgress {
 /* A suspension outranks a gate still in progress in what the person is told, because it is the
    thing a reviewer did rather than a thing the paperwork has not reached yet. It never changes
    which gate they are at. */
 const suspended = actor.suspended && outcome === 'in-progress';
 return {
  gates,
  at: { id: at.id, order: at.order, name: at.name },
  status: statusFor(at),
  outcome: suspended ? 'suspended' : outcome,
  sentence: suspended ? actor.suspendedReason ?? GATE_RULES.suspended : sentence,
  activated: outcome === 'activated'
 };
}

const contractGate = (id: string): ContractGate => GATES.find(gate => gate.id === id)!;
