/* A shift start, with no face match, and what the dispatch rule in force does with it.
 *
 * WHAT IS REFUSED FIRST. Anything a phone sends beside the start. A shift start takes no field at all, so a
 * photograph, a template, an embedding or a capture reference arriving with one is refused before the register
 * is so much as read — refused rather than ignored, because a field that is ignored has still been received.
 *
 * NO MATCH IS PERFORMED, AND THE RECORD SAYS SO. The face-match door is asked and answers not-integrated, and that
 * answer is what the shift keeps. There is no matched here to record: the outcome's type is the one literal.
 *
 * THE DISPATCH RULE, AND WHY IT IS A SETTING. The conservative answer to "may somebody nobody matched be offered
 * work?" is no: account sharing is the fraud a shift-start match exists to catch (§11), and with no provider
 * nothing is caught. But with no provider that answer withholds every shift there is, so it is the setting
 * unmatched-shift-start-dispatch with withhold as its proposed default, and the office may choose to offer work
 * with the desk told instead. Either way the shift is on the desk's board saying no match was performed, and
 * online is worked out from the rule in force when the shift started, which the shift keeps.
 *
 * WHO. The party is the caller the runtime identified, never a field, so nobody starts a shift for somebody else,
 * and somebody with no current verification does not start one at all: no Trust Score, no dispatch.
 */
import { askFaceMatchDoor, type FaceMatchOutcome } from './face-match.ts';
import { done, refused, verifyInService, type Result } from './contract.ts';
import { badgeOf, type Standing } from './register.ts';
import type { DispatchRule, TrustInForce } from './settings.ts';

export type ShiftStart = {
 readonly shiftStartRef: string;
 readonly partyRef: string;
 readonly matchOutcome: FaceMatchOutcome;
 readonly online: boolean;
 readonly dispatchRule: DispatchRule;
 readonly settingsVersion: number;
 readonly startedAt: number;
};

export function startShift(input: { shiftStartRef: string; partyRef: string | null; undeclared: readonly string[] }, standing: Standing | null, settings: TrustInForce, now: number): Result<ShiftStart> {
 if (input.undeclared.length) return refused('shift-start-carries-no-face');
 if (!input.partyRef) return refused('shift-start-needs-who-you-are');
 if (!standing) return refused('not-on-the-vetting-register');
 if (!badgeOf(standing)) return refused('no-current-verification-to-start');
 const { outcome } = askFaceMatchDoor();
 const shift: ShiftStart = {
  shiftStartRef: input.shiftStartRef, partyRef: input.partyRef, matchOutcome: outcome,
  online: settings.dispatchRule === 'offer-with-desk-flag', dispatchRule: settings.dispatchRule,
  settingsVersion: settings.settingsVersion, startedAt: now
 };
 return done(shift, [{ type: 'trust.shift_start.unmatched', version: 1, payload: { shiftStartRef: shift.shiftStartRef, matchOutcome: shift.matchOutcome, dispatchRule: shift.dispatchRule, online: shift.online } }]);
}

/* The sentences a nurse and the desk read about a shift, by the rule it started under. */
const ruleOf = (id: DispatchRule) => {
 const rule = verifyInService.shiftStart.dispatchRules.find(entry => entry.id === id);
 if (!rule) throw new Error(`packages/catalog/verify-in-service.json has no sentence for the dispatch rule "${id}".`);
 return rule;
};
export const nurseLine = (shift: Pick<ShiftStart, 'dispatchRule'>): string => ruleOf(shift.dispatchRule).nurse;
export const deskLine = (shift: Pick<ShiftStart, 'dispatchRule'>): string => ruleOf(shift.dispatchRule).desk;
