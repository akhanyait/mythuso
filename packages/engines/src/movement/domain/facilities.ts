/* The facility directory at level zero: synthetic facilities by zone and bed category, and never a free bed.
 *
 * There is no South African bed availability interface (§15C), so the directory lists what a facility offers and
 * how it takes admissions, and nothing about what is free today. A search that asks for availability is refused in
 * the contract's sentence rather than answered with a list that could be read as one. Every facility is fictional,
 * and none carries a telephone number, because a fictional number is somebody's real one.
 */
import { accept, bedCategories, facilities, isDeclared, isZone, refuse, type Facility, type Result } from './contract.ts';

/* A question about availability, under any of the names people give it. The binder never hands an undeclared
   field to a handler, so its name is all there is to refuse it by. */
const ASKS_FOR_AVAILABILITY = /(avail|free|vacan|open\s*bed|beds?(count|left|now)|occupan)/i;

export function searchFacilities(input: { readonly zoneId?: unknown; readonly bedCategory?: unknown; readonly undeclared?: readonly string[] }): Result<readonly Facility[]> {
 if ((input.undeclared ?? []).some(name => ASKS_FOR_AVAILABILITY.test(name))) return refuse('no-availability-claim');
 if (input.zoneId !== undefined && !isZone(input.zoneId)) return refuse('zone-not-covered');
 if (input.bedCategory !== undefined && !isDeclared(bedCategories, input.bedCategory)) return refuse('bed-category-not-declared');
 return accept(facilities.filter(f => (input.zoneId === undefined || f.zoneId === input.zoneId) && (input.bedCategory === undefined || f.bedCategories.includes(input.bedCategory as string))));
}
