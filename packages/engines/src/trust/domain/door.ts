/* The check a patient makes of the person at her door.
 *
 * THE CODE. A nurse shows six digits for the visit she is at. The engine keeps a keyed digest of them bound to the
 * visit, the nurse and the expiry — never the digits, because a table of short codes is a table of the codes —
 * and whoever holds the key decides whether digits typed at a door match. This module does not compute the
 * digest; it is handed whether the digits matched, so the same rules run on the engine, which signs with a key,
 * and in the web preview, which holds the nurse's phone in memory.
 *
 * WHAT A WRONG CODE IS, AND WHAT IT IS NOT. A wrong code is an answer — the tries left — and not a refusal,
 * because a refusal rolls back everything, and the last wrong try must leave the engine as a mismatch the desk is
 * told about. An expired code is refused and is not a try: nothing about the person changed, only the time. A
 * code typed for a visit nobody has shown one for is refused and is not a try either: it is a guess.
 *
 * THE TRIES BELONG TO THE VISIT, NOT THE CODE. A new code carries the tries already used, so a person at the door
 * who cannot give the right digits cannot reset the count by asking for another code.
 *
 * YES NEEDS A CODE; NO NEEDS NOTHING. "She is my nurse" is taken only after a code matched, because a door opened
 * on a name alone is the thing this exists to stop. "This is not my nurse" is taken at any time, with or without a
 * code, and even after a yes, because a patient who sees a stranger should never have to ask one for digits. A
 * no raises the mismatch once: a second no on a check already mismatched says the desk was told and tells it
 * nothing twice.
 *
 * NEVER A SCORE. What a matched code hands the patient is a name and a badge tier, and the type has nowhere to
 * put anything else.
 */
import { answerIds, done, refused, verifyInService, type EmittedEvent, type Result } from './contract.ts';
import { badgeOf, type Standing } from './register.ts';
import type { TrustInForce } from './settings.ts';

export type HeldCode = {
 readonly partyRef: string;
 readonly nurseName: string;
 readonly issuedAt: number;
 readonly expiresAt: number;
 readonly attemptsAllowed: number;
 readonly settingsVersion: number;
 /** The engine's keyed digest and its nonce, or the preview's own marker. Never the digits. */
 readonly digest: string;
 readonly nonce: string;
};
export type Closed = { readonly at: number; readonly how: 'verified' | 'mismatched'; readonly reasonCode: string | null };
export type DoorCheck = {
 readonly appointmentRef: string;
 readonly code: HeldCode | null;
 readonly attemptsUsed: number;
 readonly codeMatched: boolean;
 readonly closed: Closed | null;
};

const mismatched = (appointmentRef: string, reasonCode: string): EmittedEvent =>
 ({ type: 'trust.door.mismatched', version: 1, payload: { appointmentRef, reasonCode } });
const reasonIds = new Set(verifyInService.door.mismatchReasons.map(reason => reason.id));
const reason = (id: string) => {
 if (!reasonIds.has(id)) throw new Error(`packages/catalog/verify-in-service.json has no mismatch reason "${id}".`);
 return id;
};

export function issueCode(
 check: DoorCheck | undefined,
 input: { appointmentRef: string; partyRef: string | null; digest: string; nonce: string },
 standing: Standing | null, settings: TrustInForce, now: number
): Result<DoorCheck> {
 if (!input.partyRef) return refused('door-code-needs-who-you-are');
 if (!standing || !badgeOf(standing)) return refused('no-badge-to-show-at-a-door');
 if (check?.closed) return refused('door-check-already-done');
 const code: HeldCode = {
  partyRef: input.partyRef, nurseName: standing.name, issuedAt: now, expiresAt: now + settings.doorCodeMinutes * 60_000,
  attemptsAllowed: settings.doorCodeAttempts, settingsVersion: settings.settingsVersion, digest: input.digest, nonce: input.nonce
 };
 return done({ appointmentRef: input.appointmentRef, code, attemptsUsed: check?.attemptsUsed ?? 0, codeMatched: false, closed: null });
}

export type TryAnswer = { readonly check: DoorCheck; readonly codeMatched: boolean; readonly attemptsLeft: number; readonly nurseName?: string; readonly badgeTier?: string; readonly incidentRaised: boolean };

/** `matches` is the holder of the key's answer to whether the typed digits are the held code. */
export function tryCode(check: DoorCheck | undefined, matches: boolean, standingNow: Standing | null, now: number): Result<TryAnswer> {
 if (!check?.code) return refused('no-door-code-for-this-visit');
 if (check.closed) return refused('door-check-closed');
 if (now >= check.code.expiresAt) return refused('door-code-expired');
 const left = (used: number) => Math.max(0, check.code!.attemptsAllowed - used);
 if (matches) {
  const badge = badgeOf(standingNow);
  const next: DoorCheck = { ...check, codeMatched: true };
  return done({ check: next, codeMatched: true, attemptsLeft: left(check.attemptsUsed), nurseName: check.code.nurseName, ...(badge ? { badgeTier: badge.badgeTier } : {}), incidentRaised: false });
 }
 const used = check.attemptsUsed + 1;
 if (left(used) > 0) return done({ check: { ...check, attemptsUsed: used, codeMatched: false }, codeMatched: false, attemptsLeft: left(used), incidentRaised: false });
 const closed: DoorCheck = { ...check, attemptsUsed: used, codeMatched: false, closed: { at: now, how: 'mismatched', reasonCode: reason('attempts-used') } };
 return done({ check: closed, codeMatched: false, attemptsLeft: 0, incidentRaised: true }, [mismatched(check.appointmentRef, reason('attempts-used'))]);
}

export type Answered = { readonly check: DoorCheck; readonly verified: boolean; readonly incidentRaised: boolean };

export function answerAtTheDoor(check: DoorCheck | undefined, input: { appointmentRef: string; answer: unknown }, now: number): Result<Answered> {
 if (typeof input.answer !== 'string' || !answerIds.has(input.answer)) return refused('door-answer-unknown');
 const current: DoorCheck = check ?? { appointmentRef: input.appointmentRef, code: null, attemptsUsed: 0, codeMatched: false, closed: null };
 if (input.answer === 'not-my-nurse') {
  if (current.closed?.how === 'mismatched') return done({ check: current, verified: false, incidentRaised: true });
  const closed: DoorCheck = { ...current, closed: { at: now, how: 'mismatched', reasonCode: reason('not-my-nurse') } };
  return done({ check: closed, verified: false, incidentRaised: true }, [mismatched(current.appointmentRef, reason('not-my-nurse'))]);
 }
 if (current.closed) return refused('door-check-closed');
 if (!current.codeMatched || !current.code) return refused('door-answer-before-code');
 const verified: DoorCheck = { ...current, closed: { at: now, how: 'verified', reasonCode: null } };
 return done({ check: verified, verified: true, incidentRaised: false }, [{ type: 'trust.door.verified', version: 1, payload: { partyRef: current.code.partyRef, appointmentRef: current.appointmentRef } }]);
}
