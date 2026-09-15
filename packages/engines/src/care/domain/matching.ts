/* Who a visit may be offered to, and in what order.
 *
 * FOUR GATES, AND A GATE WITHHOLDS RATHER THAN RANKS. A candidate who fails any of them is returned
 * in `withheld` with the sentence that says why, and never appears in `ranked` — not at the bottom,
 * not after everybody else has declined. A list with the ineligible at the end is a list somebody
 * works to the end of on a short-staffed morning, so the arithmetic that orders the eligible never
 * sees the others at all.
 *
 * The gates are asked in the order that makes the later ones moot, the same argument the roster
 * simulator makes for coverage before vetting:
 *
 *   1. Scope of practice. The service's roles and named scope against the candidate's vetted role
 *      and scope. Nothing about a person's badge changes whether she is registered to do the work,
 *      and the vetting register's own sentence says the Control Tower cannot override it.
 *   2. Supervision. A role the contract marks as supervised is matched only beside the registered
 *      nurse who holds the same appointment. There is no carer on the register yet, so today this
 *      gate refuses the whole offer rather than any one person — and it is written now, before the
 *      role exists, because a supervision rule added after the first carer is dispatched is added
 *      after the first unsupervised visit.
 *   3. A place to measure from. A candidate whose base the map cannot place is not given an
 *      invented distance to be ranked by.
 *   4. A current Trust Score badge, as the last person.trust_updated this engine heard said. Care
 *      holds the badge and never the number, so the number ranks nobody here; Verify's own ranking
 *      stays inside Verify.
 *
 * THE ORDER OF THE ELIGIBLE. The patient's named nurse, then the nurses who saw her before (most
 * recent first), then everybody else nearest first, by the straight line between suburb centres —
 * packages/geo's arithmetic, ported beside this file as geo.ts — and labelled as a straight line
 * wherever it is shown. Ties are broken by the clinician reference so that the same roster produces
 * the same order on every machine. */
import { distanceKm, isInsideSouthAfrica, MAX_REALISTIC_DISPATCH_KM, type LatLng } from './geo.ts';
import { requirementFor, serviceFor, type CareContract, type Requirement } from './contract.ts';
import type { TrustReader } from './trust.ts';

export type Candidate = {
 readonly clinicianRef: string;
 /** A role id from packages/catalog/vetting.json, as Verify registered her. */
 readonly roleId: string;
 readonly scope: readonly string[];
 /** Where distance is measured from: her working suburb's centre, never a live position. */
 readonly base: LatLng | null;
 /** For a supervised role: the registered nurse she works under. */
 readonly supervisorRef?: string | null;
};

export type AppointmentToFill = {
 readonly appointmentRef: string;
 readonly subjectRef: string;
 readonly serviceId: string;
 /** The centre of the suburb the visit is in. Never the address; null until somebody has told Care. */
 readonly zone: LatLng | null;
 readonly scheduledFor: string;
 readonly namedClinicianRef?: string | null;
 /** Most recent first. */
 readonly previousClinicianRefs?: readonly string[];
 /** For a supervised service: the registered nurse who already holds this appointment. */
 readonly supervisorRef?: string | null;
};

export type Continuity = 'named' | 'previous' | null;
export type Ranked = { readonly candidate: Candidate; readonly continuity: Continuity; readonly distanceKm: number };
export type WithheldReason = 'outside-scope' | 'carer-without-rn' | 'no-base-to-measure-from' | 'no-current-trust-score';
export type Withheld = { readonly candidate: Candidate; readonly reason: WithheldReason; readonly statement: string };

export type Match =
 | { readonly kind: 'matched'; readonly requirement: Requirement; readonly roles: readonly string[]; readonly ranked: readonly Ranked[]; readonly withheld: readonly Withheld[] }
 | { readonly kind: 'service-not-offered' }
 | { readonly kind: 'carer-without-rn' }
 | { readonly kind: 'visit-zone-unknown' };

const trustStatement = (contract: CareContract) =>
 contract.routes.find(r => r.path === '/v1/care/offers')!.refusals.find(r => r.id === 'no-current-trust-score')!.statement;
const carerStatement = (contract: CareContract) =>
 contract.routes.find(r => r.path === '/v1/care/offers')!.refusals.find(r => r.id === 'carer-without-rn')!.statement;

/* A service's roles are the row's own, or — for the three visits no named scope covers — the roles in force
   in the setting the row names, as the caller read them when it started this match. A row naming a setting
   the caller did not hand over is a fault rather than a service offered to nobody, because nobody would be
   told why. Whether that value was clinically reviewed is not asked: it is in force either way, and
   ./settings.ts says why care is not stopped for a review nobody has done yet. */
export function rolesFor(requirement: Requirement, rolesInForce: Readonly<Record<string, readonly string[]>>): readonly string[] {
 if (requirement.rolesFromSetting === undefined) return requirement.roles ?? [];
 const inForce = rolesInForce[requirement.rolesFromSetting];
 if (!inForce) throw new Error(`${requirement.serviceId} takes its roles from the setting "${requirement.rolesFromSetting}", and the settings in force handed to the matcher do not hold it.`);
 return inForce;
}

export function match(
 appointment: AppointmentToFill,
 candidates: readonly Candidate[],
 trust: TrustReader,
 contract: CareContract,
 /** The scope settings' roles in force, by setting key, as read once when this offer is being made. */
 rolesInForce: Readonly<Record<string, readonly string[]>>,
 /** Everybody already asked for this appointment. They are neither ranked nor withheld: they were asked. */
 asked: ReadonlySet<string> = new Set()
): Match {
 const requirement = requirementFor(contract, appointment.serviceId);
 const service = serviceFor(contract, appointment.serviceId);
 if (!requirement || !service || service.phase > contract.seedPhase) return { kind: 'service-not-offered' };
 const roles = rolesFor(requirement, rolesInForce);
 /* A supervised service with nobody supervising it is refused as a whole. Matching anybody first
    and checking supervision afterwards is how a carer is offered a house on her own. */
 if (requirement.supervisedBy && !appointment.supervisorRef) return { kind: 'carer-without-rn' };
 /* A distance to nowhere ranks nobody honestly. Until Care knows the suburb the visit waits, rather
    than going to whoever happens to sort first. */
 const zone = appointment.zone;
 if (!isInsideSouthAfrica(zone)) return { kind: 'visit-zone-unknown' };

 const ranked: Ranked[] = [];
 const withheld: Withheld[] = [];
 const previous = appointment.previousClinicianRefs ?? [];
 for (const candidate of candidates) {
  if (asked.has(candidate.clinicianRef)) continue;
  const inScope = roles.includes(candidate.roleId)
   && (requirement.scope === null || candidate.scope.includes(requirement.scope));
  if (!inScope) { withheld.push({ candidate, reason: 'outside-scope', statement: contract.sentences.outsideScope }); continue; }
  if (requirement.supervisedBy && candidate.supervisorRef !== appointment.supervisorRef) {
   withheld.push({ candidate, reason: 'carer-without-rn', statement: carerStatement(contract) }); continue;
  }
  const km = isInsideSouthAfrica(candidate.base) ? distanceKm(candidate.base, zone) : null;
  if (km === null || !Number.isFinite(km) || km > MAX_REALISTIC_DISPATCH_KM) {
   withheld.push({ candidate, reason: 'no-base-to-measure-from', statement: contract.sentences.noBase }); continue;
  }
  if (!trust.standing(candidate.clinicianRef).current) {
   withheld.push({ candidate, reason: 'no-current-trust-score', statement: trustStatement(contract) }); continue;
  }
  const continuity: Continuity = candidate.clinicianRef === appointment.namedClinicianRef ? 'named'
   : previous.includes(candidate.clinicianRef) ? 'previous' : null;
  ranked.push({ candidate, continuity, distanceKm: km });
 }

 const tier = (r: Ranked) => r.continuity === 'named' ? 0 : r.continuity === 'previous' ? 1 : 2;
 ranked.sort((a, b) =>
  tier(a) - tier(b)
  || (tier(a) === 1 ? previous.indexOf(a.candidate.clinicianRef) - previous.indexOf(b.candidate.clinicianRef) : 0)
  || a.distanceKm - b.distanceKm
  || a.candidate.clinicianRef.localeCompare(b.candidate.clinicianRef));
 return { kind: 'matched', requirement, roles, ranked, withheld };
}
