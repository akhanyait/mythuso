/**
 * Simulated answers from the thirteen authorities.
 *
 * ── What this stands in for, and what it must never become ───────────────────────────────────
 *
 * All thirteen adapters in apps/api/src/vetting/authority.ts answer `not-integrated` today, and
 * that is the true state: SANC publishes no API, SAPS answers on fingerprints through a bureau,
 * Home Affairs is reached only through an accredited provider under a priced contract. This module
 * is what an agreement with each of them would produce, so that the vetting layer can be walked end
 * to end before any of those exist.
 *
 * That makes it the most dangerous of the four simulators, because its output is a word — and the
 * word is `confirmed`. A person who has watched a nurse's SANC registration come back confirmed on
 * this screen is one edit away from believing the SANC register said so. Three things hold that
 * apart, and all three are refusals rather than reassurances.
 *
 *   **It answers only for the simulated register.** A party outside packages/catalog/roster.json is
 *   somebody this process knows nothing about, and an answer about them would be an answer about a
 *   real person's credential invented by a fixture.
 *
 *   **It never returns cleared for a lapsed check.** The vetting register is the authority on what
 *   has lapsed and the arithmetic is the gate's own — `resolveState`, resolved on every read, the
 *   same subtraction that suspends Sister Ayanda Dube's dispatch nine days after her police
 *   clearance ran out. A caller asking for a confirmation of a lapsed check is refused in the
 *   capability's own words, because that request is the one that gets made at half past four on a
 *   Friday with somebody waiting to be dispatched. The outcome for a lapsed check is `expired`, and
 *   `expired` is not a synonym anybody can collapse.
 *
 *   **It refuses to be the thing that grants anything.** A caller that asks this module whether an
 *   answer opens a capability is asking the wrong module: the gate decides, from stored evidence,
 *   over the whole role. Nothing here returns a boolean about a person, and there is deliberately no
 *   function in this file whose name a tired reader could mistake for one.
 *
 * ── Unreachable is never agreement ───────────────────────────────────────────────────────────
 *
 * Roughly one enquiry in eight comes back `unavailable`, seeded so the same enquiry answers the same
 * way twice. It is inconvenient in exactly the case where it matters, which is the point:
 * authority.ts already argues that treating an unreachable register as agreement is how a lapsed
 * registration survives a re-verification sweep. A simulator where every call succeeded would teach
 * the product that registers always answer, and the first real integration would be written against
 * a supplier that does not exist.
 */
import roster from '../../../../packages/catalog/roster.json' with { type: 'json' };
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import { AUTHORITY_OUTCOMES, type AuthorityOutcome } from '../vetting/authority.ts';
import { refusalSaying, simulationOf } from './contract.ts';
import { NURSE_ROLE, SIMULATED_NURSES, checkStateFor, nurseById, type SimulatedNurse } from './roster.ts';
import {
 isRefusal, produced, refuse, register, seeded,
 type SimulatedEvent, type SimulationRequest, type Simulator, type SimulatorAnswer
} from './index.ts';

const CAPABILITY = 'credential-verification';
const NOT_IN_THE_REGISTER = refusalSaying(CAPABILITY, /simulated register/);
const CLEARED_FOR_A_LAPSED_CHECK = refusalSaying(CAPABILITY, /lapsed check/);
const READ_AS_A_GRANT = refusalSaying(CAPABILITY, /a capability/);

type CatalogueCheck = { id: string; name: string; authority: string; renewMonths: number | null };
const CHECKS = new Map<string, CatalogueCheck>(
 (vetting.roles.find(role => role.id === NURSE_ROLE)!.checks as readonly CatalogueCheck[])
  .map(check => [check.id, check] as const)
);
const BODIES = new Map(vetting.authorities.map(authority => [authority.id, authority.name] as const));
const SAYS = roster.authorities.says as Record<string, string>;

/* The words a person reads, composed out of the contract's own sentence for the outcome. Never a
   credential value and never a provider's error: the adapter interface refuses both, and a
   simulator passing a stack trace through is how that rule stops being true in the half nobody
   reviews. */
const detailFor = (outcome: AuthorityOutcome, check: CatalogueCheck): string =>
 SAYS[outcome]!.replace('{check}', check.name).replace('{body}', BODIES.get(check.authority) ?? check.authority);

/**
 * The enquiry's own identity, deterministic.
 *
 * authority.ts mints one as `${authority}:${randomUUID()}` and this keeps the shape and drops the
 * randomness, because a reference that differs on every run is a reference no test can assert and
 * no demonstration can be repeated with. It is the enquiry that is identified here and never the
 * credential — the verification layer deliberately writes no credential value down anywhere.
 */
export function enquiryReference(authorityId: string, partyId: string, checkId: string): string {
 const rand = seeded(`credential-answer:${authorityId}:${partyId}:${checkId}`);
 const hex = Array.from({ length: 4 }, () => Math.floor(rand() * 65536).toString(16).padStart(4, '0')).join('');
 return `${authorityId}:${hex}`;
}

/**
 * What the authority would say about one check, today.
 *
 * The mapping is not a table of preferences. Each arm is the answer a register would actually give
 * about evidence in that state, and the one that matters is the first: a check the gate resolves as
 * lapsed produces `expired`, which is a different word from `confirmed` in a closed set of six that
 * no caller may collapse.
 */
export function outcomeFor(nurse: SimulatedNurse, checkId: string, at: Date = new Date()): AuthorityOutcome {
 const state = checkStateFor(nurse, checkId, at);
 if (state === 'lapsed') return 'expired';
 if (state === 'declined') return 'mismatch';
 if (state !== 'verified' && state !== 'expiring') return 'not-found';
 const rand = seeded(`credential-unavailable:${nurse.id}:${checkId}`);
 return rand() < roster.authorities.unavailableShare ? 'unavailable' : 'confirmed';
}

export const credentialAnswer: Simulator = {
 id: 'credential-answer',
 feed: 'credential-answer',
 capability: CAPABILITY,
 supplier: simulationOf(CAPABILITY).supplier,
 produce(request: SimulationRequest): SimulatorAnswer {
  const detail = request.detail ?? {};
  /* Asked before anything is looked up. A caller who has told this module which capability it is
     about to open has already decided that the answer is what grants it — and the answer is one
     authority's word about one check, while the thing that grants is the gate's arithmetic over the
     whole role, resolved from stored evidence on every read. Refusing the question is the only way
     to keep a simulated confirmation from becoming a simulated clearance. */
  if (typeof detail.grants !== 'undefined') return refuse(credentialAnswer, request, READ_AS_A_GRANT);
  const nurse = nurseById(request.subject);
  const checkId = typeof detail.checkId === 'string' ? detail.checkId : '';
  const check = CHECKS.get(checkId);
  /* The register holds the person and the checks they carry. An answer naming a check nobody in it
     has is an answer about somebody else's credential, which is the same failure as an answer about
     somebody else — so it is the same sentence rather than a second one nobody would read. */
  if (!nurse || !check) return refuse(credentialAnswer, request, NOT_IN_THE_REGISTER);
  const at = request.at ?? new Date();
  /* The Friday-afternoon request, in its own field: "give me a confirmation for this one so she can
     go out today". It is refused only where the check has actually lapsed, because that is the only
     case this sentence describes — an enquiry that comes back unavailable is answered unavailable
     rather than refused, and the caller learns the distinction that matters instead of a louder one
     that does not. */
  if (detail.confirm === true && checkStateFor(nurse, checkId, at) === 'lapsed') return refuse(credentialAnswer, request, CLEARED_FOR_A_LAPSED_CHECK);
  const outcome = outcomeFor(nurse, checkId, at);
  const payload: Record<string, unknown> = {
   reference: enquiryReference(check.authority, nurse.id, check.id),
   checkId: check.id,
   authority: check.authority,
   outcome,
   checkedAt: at.toISOString(),
   detail: detailFor(outcome, check)
  };
  /* Only where the authority states its own validity date, which is usually not — which is why the
     feed makes it optional and why the expiry arithmetic has a fallback. Here it is stated exactly
     where packages/catalog/roster.json wrote one down and nowhere else. */
  const expiresOn = nurse.vetting.records.find(record => record.checkId === check.id)?.expiresOn;
  if (expiresOn) payload.expiresOn = expiresOn;
  return produced(credentialAnswer, request, payload);
 }
};
register(credentialAnswer);

/** Every check a party carries, answered. Read by the re-verification sweep and by the tests. */
export function answersFor(partyId: string, at: Date = new Date()): { answered: SimulatedEvent[]; refused: SimulatorAnswer[] } {
 const answers = [...CHECKS.keys()].map(checkId => credentialAnswer.produce({ subject: partyId, at, detail: { checkId } }));
 return {
  answered: answers.filter((answer): answer is SimulatedEvent => !isRefusal(answer)),
  refused: answers.filter(isRefusal)
 };
}

/** The whole register, so a screen can show what the thirteen would say without asking one by one. */
export const registeredParties = (): readonly string[] => SIMULATED_NURSES.map(nurse => nurse.id);

/* The closed set, re-exported so a caller reading this module never has to go and find out for
   itself whether there is a seventh outcome. There is not, and `unavailable` and `not-integrated`
   remain distinct values in it. */
export { AUTHORITY_OUTCOMES };
