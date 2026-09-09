/**
 * When a second factor is asked for again, and the one rule that is never bent.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────────────────────
 *
 * Never demand a second factor from an account that has none enrolled.
 *
 * That is not a preference. A sibling service demanded step-up from an account with nothing that
 * could answer it — a session fingerprint changed because the web tier called the API with its own
 * user-agent — and the account bricked itself a tenth of a second after a successful sign-in. The
 * password was right every time. There was simply no way to say so. An unanswerable demand is not
 * a strict security control; it is an outage with a lock icon on it, and it fails closed against
 * the only person who is definitely not the attacker.
 *
 * So `demand` is false whenever `enrolled` is false, in every branch below, and the reason says
 * what should happen instead: enrol, then the demand becomes answerable.
 *
 * ── Which roles must carry one ───────────────────────────────────────────────────────────────
 *
 * Not an account setting. Somebody who can sign a clinical decision does not get to decide whether
 * signing one needs proof it was them, any more than they get to decide whether their SANC
 * registration is checked. The requirement follows the capability, and the capabilities are data:
 * they are the ids in packages/catalog/vetting.json, which is where the twelve vetted parties and
 * everything each is refused already live. A role that is granted one of these five is a role whose
 * sign-in has to carry a second factor.
 *
 * The five are the acts that are attributed to a named professional or that open somebody's record.
 * The ids are repeated here rather than imported because this service does not read the catalogue —
 * it does not yet know about roles at all, and building a compile-time dependency on a file it does
 * not use would be pretending otherwise. The test checks them against the catalogue on disk, so a
 * capability renamed there fails the build here.
 *
 * Nothing in this service assigns a role today. This is the rule, written and tested, waiting for
 * the thing that knows who is a doctor.
 *
 * Pure: decides and explains, touches no database.
 */

/** Capabilities whose holder must carry a second factor. Ids from packages/catalog/vetting.json. */
export const SECOND_FACTOR_CAPABILITIES = [
 'prescribe',
 'sign-clinical-review',
 'dispense',
 'release-lab-result',
 'view-clinical-record',
 'view-protected-record',
 /* An operator opens no clinical record at all — that is the design. They can send a named nurse to
    a named address, which packages/catalog/vetting.json calls the most sensitive thing this platform
    does, and that is reason enough on its own. */
 'dispatch-nurses'
] as const;

/** Why each one, in the words that would be given to the person it applies to. */
export const SECOND_FACTOR_REASONS: Record<string, string> = {
 'prescribe': 'A prescription is issued in your name and can be dispensed by a pharmacy that has never met you.',
 'sign-clinical-review': 'A signed decision is attributed to you and to your registration number. It has to be provable that it was you.',
 'dispense': 'Handing over a scheduled medicine is recorded against your pharmacy.',
 'release-lab-result': 'Releasing a result sends somebody their own health information, and there is no taking it back.',
 'view-clinical-record': 'Opening a clinical record is reading another person\'s health information.',
 'dispatch-nurses': 'Assigning a nurse sends a real person to a real home. Somebody using your account could choose both.',
 'view-protected-record': 'A protected category is released by the patient one entry at a time. Reading one is the single act on this platform most likely to cause harm if it were not you.'
};

export const requiresSecondFactor = (grants: readonly string[]): boolean =>
 grants.some(grant => (SECOND_FACTOR_CAPABILITIES as readonly string[]).includes(grant));

export const capabilitiesNeedingSecondFactor = (grants: readonly string[]): string[] =>
 SECOND_FACTOR_CAPABILITIES.filter(capability => grants.includes(capability));

/**
 * The occasions this service can actually step up on.
 *
 * `capability` is the clinical case above and is decided by the grants. Since apps/api/src/actor.ts
 * resolves a session to its vetted role, that branch is reached by the routes that reach the vault
 * rather than only by a test: a nurse's account is granted work that carries a second factor, so the
 * demand follows her sign-in whatever she is doing with it.
 *
 * The other three are account actions this service performs itself: turning the second factor off,
 * asking to be erased, and taking a copy of everything. The first two are irreversible in the way
 * that matters; the third is not irreversible at all and is here for the opposite reason — it is the
 * one request on this service that assembles a person's whole record into a single answer, which
 * makes it exactly what somebody holding an unlocked phone would ask for.
 */
export type StepUpAction = 'capability' | 'second-factor.disable' | 'account.erasure' | 'account.export';

export type StepUpDecision = {
 /** Ask for a code now. Never true when nothing is enrolled to answer with. */
 demand: boolean;
 /** True when the account should be carrying a second factor and is not. A prompt, not a block. */
 enrolmentOwed: boolean;
 /** Said to the person, so written for them. */
 because: string;
};

export function decideStepUp(input: { action: StepUpAction; enrolled: boolean; grants?: readonly string[] }): StepUpDecision {
 const owed = input.action === 'capability' && requiresSecondFactor(input.grants ?? []);
 if (!input.enrolled) {
  return {
   demand: false,
   enrolmentOwed: owed,
   because: owed
    ? 'This account is granted work that has to carry a second factor, and none is set up yet. It is asked to enrol; it is not locked out, because there is nothing it could answer a demand with.'
    : 'No second factor is set up for this account, so none is asked for.'
  };
 }
 if (input.action === 'capability') {
  return owed
   ? { demand: true, enrolmentOwed: false, because: 'This work is attributed to you by name, so the sign-in that does it carries a code from your authenticator app.' }
   : { demand: false, enrolmentOwed: false, because: 'Nothing in this account\'s work needs a code beyond signing in.' };
 }
 return {
  demand: true,
  enrolmentOwed: false,
  because: input.action === 'second-factor.disable'
   ? 'Turning off your second factor is asked for with your second factor, so somebody holding your unlocked phone cannot quietly remove it.'
   : input.action === 'account.export'
    ? 'A copy of everything MyThuso holds about you is the one answer on this service that puts your whole record in one place, so it is asked for with a code rather than with a session somebody could be borrowing.'
    : 'Asking for your account to be erased is asked for with a code, so it cannot be done by somebody who has picked up your signed-in phone.'
 };
}
