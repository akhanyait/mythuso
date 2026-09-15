/* Who Verify has on its development register, and where each of them stands, worked out on read.
 *
 * packages/catalog/roster.json writes down only the exceptions: every check a nurse's role carries in
 * packages/catalog/vetting.json that the roster does not name is verified, in date and, where it is high-risk,
 * seconded. apps/api/src/vetting/gates.ts is the identity service's gate arithmetic and an engine may import
 * neither it nor the web's fixtures, so this is the Trust engine's own reading of the same list. It is held to
 * the identity service's answer for every one of the nine by scripts/check-boundaries.mjs, which runs both and
 * fails when a gate state, the activation or the badge disagrees — two readers of one list are allowed only
 * while the build proves they are one answer.
 *
 * WHY A GATE IS NEVER STORED. A gate somebody wrote down is a claim about a person that stops being true the
 * night a clearance lapses without anything in the row changing (vetting.json gateRules). The roster's expiry
 * is a day offset from today, so it is read against today every time, and nothing here keeps a gate.
 *
 * THE BADGE IS TIER ONLY. badgeOf answers { badgeTier, verified } or nothing. There is no number in it to leak,
 * because the only tier anybody can hold while the Trust Score's weights are null is Verified, and Verified is
 * the hard gates passing and activation — never a figure. The day a weight is decided this throws
 * weighted-not-built rather than quietly ranking anybody, as the identity service does.
 */
import roster from '../../../../catalog/roster.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import trust from '../../../../catalog/trust.json' with { type: 'json' };

export type GateState = 'passed' | 'not-checked' | 'pending' | 'held' | 'failed' | 'not-reached';
export type GateRow = { readonly gate: string; readonly order: number; readonly name: string; readonly state: GateState; readonly hardStop: boolean };
export type Outcome = 'activated' | 'in-progress' | 'held' | 'failed' | 'stopped' | 'declined';
export type Standing = {
 readonly partyRef: string;
 readonly name: string;
 readonly roleId: string;
 readonly gates: readonly GateRow[];
 readonly currentGate: string;
 readonly outcome: Outcome;
 readonly activated: boolean;
 readonly hardGatesPassed: boolean;
};
export type Badge = { readonly badgeTier: string; readonly verified: true };

type Exception = { state?: string; expiresInDays?: number; secondedBy?: string | null };
type Row = { id: string; name: string; declined?: boolean; checks?: Record<string, Exception> };
type Check = { id: string; risk: string; gate: string };
type Gate = { id: string; order: number; name: string; hardStop: boolean; evidencedBy?: string };

const NURSE = 'nurse';
const GATES = [...(vetting.gates as Gate[])].sort((a, b) => a.order - b.order);
const roleChecks = (roleId: string): readonly Check[] => (vetting.roles.find(role => role.id === roleId)?.checks ?? []) as Check[];
const PASSING = new Set(['verified', 'expiring']);
const FAILING = new Set<GateState>(['failed', 'held']);

/* A check's state today: the roster's state, or verified; lapsed when a verified check's day has passed. */
function stateOf(exception: Exception | undefined): { state: string; seconded: boolean } {
 const written = exception?.state ?? 'verified';
 const state = written === 'verified' && exception?.expiresInDays !== undefined && exception.expiresInDays < 0 ? 'lapsed' : written;
 return { state, seconded: exception?.secondedBy !== null };
}

function standingFor(row: Row): Standing {
 const checks = roleChecks(NURSE);
 const rows: { gate: string; order: number; name: string; state: GateState; hardStop: boolean }[] = GATES.map(gate => {
  const base = { gate: gate.id, order: gate.order, name: gate.name, hardStop: gate.hardStop };
  if (gate.evidencedBy === 'enrolment') return { ...base, state: 'passed' };
  if (gate.evidencedBy === 'gates') return { ...base, state: 'pending' };
  const here = checks.filter(check => check.gate === gate.id);
  if (!here.length) return { ...base, state: 'not-checked' };
  let declined = false, lapsed = false, outstanding = false;
  for (const check of here) {
   const { state, seconded } = stateOf(row.checks?.[check.id]);
   if (state === 'declined') declined = true;
   else if (state === 'lapsed') lapsed = true;
   if (!(PASSING.has(state) && (check.risk !== 'high' || seconded))) outstanding = true;
  }
  return { ...base, state: declined ? 'failed' : lapsed ? 'held' : outstanding ? 'pending' : 'passed' };
 });
 const through = (g: { state: GateState }) => g.state === 'passed' || g.state === 'not-checked';
 const activate = rows.find(g => g.gate === 'activate')!;
 const stop = rows.find(g => g.hardStop && g.state === 'failed');
 let currentGate: string, outcome: Outcome;
 if (stop) {
  for (const g of rows) if (g.order > stop.order) g.state = 'not-reached';
  currentGate = stop.gate; outcome = 'stopped';
 } else {
  const first = rows.filter(g => g.gate !== 'activate').find(g => !through(g));
  if (first) { currentGate = first.gate; outcome = first.state === 'failed' ? 'failed' : first.state === 'held' ? 'held' : 'in-progress'; }
  else if (row.declined) { currentGate = activate.gate; outcome = 'declined'; }
  else { activate.state = 'passed'; currentGate = activate.gate; outcome = 'activated'; }
 }
 const hardGatesPassed = trust.hardGates.every(hard => !rows.some(g => hard.gates.includes(g.gate) && FAILING.has(g.state)));
 return { partyRef: row.id, name: row.name, roleId: NURSE, gates: rows, currentGate, outcome, activated: outcome === 'activated', hardGatesPassed };
}

/* Worked out afresh on every call, never cached: a standing kept between calls is a gate written down. */
export const standingOf = (partyRef: string): Standing | null => {
 const row = (roster.nurses as Row[]).find(nurse => nurse.id === partyRef);
 return row ? standingFor(row) : null;
};
export const partyRefs = (): readonly string[] => (roster.nurses as Row[]).map(nurse => nurse.id);

const weightsUndecided = () => trust.softInputs.every(input => input.weight === null);

/** The outward view: a tier and nothing it was worked out from, or nothing at all. */
export function badgeOf(standing: Standing | null): Badge | null {
 if (!standing || !standing.activated || !standing.hardGatesPassed || standing.outcome === 'declined') return null;
 if (!weightsUndecided()) throw new Error(trust.refusals.find(entry => entry.id === 'weighted-not-built')!.sentence);
 const verified = trust.tiers.find(tier => tier.needs === 'hard-gates');
 if (!verified) throw new Error('packages/catalog/trust.json has no tier the hard gates alone earn.');
 return { badgeTier: verified.id, verified: true };
}
