import { referralFallbackRole, referralOwnerRole, referralSpanMs } from '../../../../packages/engines/src/core/domain/contract.ts';
import type { Loop } from '../../../../packages/engines/src/core/domain/loops.ts';
import { openConcern } from './closed-loop';

/* A written referral, handed to the closed loop (the TIA care loop, 29 October 2026).
 *
 * The 28 October TIA decks promise that every referral has an owner, a reason and a documented outcome. The letter was
 * the reason; this is the owner. Writing a referral opens the follow-up concern Core would open on hearing
 * appointment.follow_up_required@1 with a followUpKind of referral: owned, fallen back to and timed as
 * packages/engines/src/core/domain/contract.ts reads them from closed-loop.json, so nothing here types a role or a minute.
 *
 * THE CONCERN CARRIES THE REFERENCE AND NOTHING ELSE. Why the patient was referred stays in the letter, as the event's
 * neverCarries says of a clinical reason: the loop needs an owner and a deadline, not the diagnosis. One reference is one
 * concern while it is open, however often the letter is written, because openConcern dedupes on it. */
let serial = 0;
export function openReferralFollowUp(reference: string): Loop {
 return openConcern({
  loopRef: `LOOP-REF-${String(++serial).padStart(4, '0')}`, sourceEngine: 'care', purpose: 'treatment',
  ownerRole: referralOwnerRole, fallbackRole: referralFallbackRole, spanMs: referralSpanMs, dedupeKey: reference
 });
}
