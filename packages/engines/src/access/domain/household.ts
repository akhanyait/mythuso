/* A household as Access holds it: a roster of references, and nothing that could be mistaken for a permission.

   ── Why a membership holds references and nothing else ───────────────────────────────────────────

   packages/catalog/records.json calls a household a FHIR Group and says what it is not — membership is not
   consent, each member's record stays their own — and the two routes here answer with that sentence as their
   refusal. The shape is what makes the sentence true rather than reassuring: a membership is a household
   reference, a member reference, who added them and the day. There is no field for a scope, a purpose, an
   expiry or a relationship, because each of those is half of a consent grant, and a roster that could carry
   one would be a grant with a friendlier name. Devices and Medicines hold references to readings and
   prescriptions rather than the things themselves, for the same reason and with the same result: what leaks
   out of a table that holds only references is a set of opaque strings.

   And no name. The people on a preview roster are named in packages/catalog/household.json's preview, where
   a screen reads them; the roster this file holds never learns one, so a household stolen whole is a list of
   account references that opens nothing.

   ── Why an attempt to attach a grant is refused rather than ignored ──────────────────────────────

   The routes declare no field for a scope, so the binder never hands one to a handler — it hands over the
   *names* of everything undeclared that was sent. A request that adds a member and carries "scope" or
   "grantedUntil" beside them is somebody expecting the roster to open a record, and dropping the field
   silently would leave them believing it worked. So the words are read from packages/catalog/household.json
   and the request is refused in the route's own sentence.

   ── Why anybody on the roster may add to it, and nobody off it may read it ───────────────────────

   Adding somebody grants nothing, so there is nothing to guard on the way in beyond being on the roster
   yourself. Reading one is different: who lives with whom is a fact about all of them, so a household is
   listed only to the people in it. That asymmetry is deliberate and is the whole of the access rule here.

   Zero dependencies, so the web preview runs this as the tests do. */
import contract from '../../../../catalog/household.json' with { type: 'json' };
import { accept, isoIn, routeRefusal, simulatedRef, type Outcome } from './contract.ts';

export const householdContract = contract;

export const HOUSEHOLD_ROUTES = {
 open: 'POST /v1/access/households@1',
 read: 'GET /v1/access/households@1',
 add: 'POST /v1/access/household-memberships@1'
} as const;

/** One line of a roster: who, put there by whom, on which day. Never a name, a relationship or a scope. */
export type Membership = {
 readonly householdRef: string;
 readonly memberSubjectRef: string;
 readonly addedBySubjectRef: string;
 readonly addedOnDay: string;
};
export type Household = {
 readonly householdRef: string;
 readonly openedBySubjectRef: string;
 readonly openedOnDay: string;
 readonly members: readonly Membership[];
};
export type HouseholdLedger = { readonly households: readonly Household[] };

/* ---- Words in what a request sends ------------------------------------------------------------ */
const wordsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Whether a request carries a field that would make a roster line a permission. */
export const namesAGrant = (sent: readonly string[]): boolean =>
 sent.some(name => wordsOf(name).some(word => (contract.membership.grantFieldWords as readonly string[]).includes(word)));

/* ---- Reading ---------------------------------------------------------------------------------- */
export const householdByRef = (ledger: HouseholdLedger, householdRef: string): Household | undefined =>
 ledger.households.find(h => h.householdRef === householdRef);
export const isMember = (household: Household | undefined, subjectRef: string): boolean =>
 !!household && !!subjectRef && household.members.some(m => m.memberSubjectRef === subjectRef);
/** Every household this person is on the roster of, in the order they were opened. */
export const householdsOf = (ledger: HouseholdLedger, subjectRef: string): readonly Household[] =>
 subjectRef ? ledger.households.filter(h => isMember(h, subjectRef)) : [];

/**
 * A household is opened with a roster. The person opening it is on it, whether or not they named
 * themselves: somebody has to be able to read the list they just made, and the alternative is a roster
 * whose author cannot see it.
 */
export function openHousehold(
 ledger: HouseholdLedger,
 input: { readonly idempotencyKey: string; readonly openedBySubjectRef: string; readonly memberSubjectRefs: readonly string[]; readonly sent: readonly string[]; readonly now: Date }
): Outcome<{ readonly household: Household }> {
 if (namesAGrant(input.sent)) return routeRefusal(HOUSEHOLD_ROUTES.open, 'membership-is-not-consent');
 const named = input.memberSubjectRefs.filter(ref => typeof ref === 'string' && ref.trim());
 if (!named.length || !input.openedBySubjectRef) return routeRefusal(HOUSEHOLD_ROUTES.open, 'required-field-missing');
 const householdRef = simulatedRef('HH', input.idempotencyKey);
 if (householdByRef(ledger, householdRef)) return accept({ household: householdByRef(ledger, householdRef)! });
 const addedOnDay = isoIn(input.now);
 const refs = [...new Set([input.openedBySubjectRef, ...named])];
 return accept({
  household: {
   householdRef, openedBySubjectRef: input.openedBySubjectRef, openedOnDay: addedOnDay,
   members: refs.map(memberSubjectRef => ({ householdRef, memberSubjectRef, addedBySubjectRef: input.openedBySubjectRef, addedOnDay }))
  }
 });
}

/**
 * One more line on a roster somebody is already on. Adding a person who is already there changes nothing
 * and answers as the first add did, so a second press is not a second line.
 */
export function addMember(
 ledger: HouseholdLedger,
 input: { readonly householdRef: string; readonly memberSubjectRef: string; readonly addedBySubjectRef: string; readonly sent: readonly string[]; readonly now: Date }
): Outcome<{ readonly household: Household; readonly membership: Membership }> {
 if (namesAGrant(input.sent)) return routeRefusal(HOUSEHOLD_ROUTES.add, 'membership-is-not-consent');
 const household = householdByRef(ledger, input.householdRef);
 if (!isMember(household, input.addedBySubjectRef)) return routeRefusal(HOUSEHOLD_ROUTES.add, 'not-in-this-household');
 if (!input.memberSubjectRef.trim()) return routeRefusal(HOUSEHOLD_ROUTES.add, 'required-field-missing');
 const standing = household!.members.find(m => m.memberSubjectRef === input.memberSubjectRef);
 if (standing) return accept({ household: household!, membership: standing });
 const membership: Membership = {
  householdRef: household!.householdRef, memberSubjectRef: input.memberSubjectRef,
  addedBySubjectRef: input.addedBySubjectRef, addedOnDay: isoIn(input.now)
 };
 return accept({ household: { ...household!, members: [...household!.members, membership] }, membership });
}

/** The roster, to somebody on it. A person who is not is refused rather than answered with an empty list. */
export function readHousehold(ledger: HouseholdLedger, householdRef: string, subjectRef: string): Outcome<{ readonly household: Household }> {
 const household = householdByRef(ledger, householdRef);
 if (!isMember(household, subjectRef)) return routeRefusal(HOUSEHOLD_ROUTES.read, 'not-in-this-household');
 return accept({ household: household! });
}
