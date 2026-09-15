/* The face-match door, as Verify asks it at a shift start.
 *
 * WHY IT ANSWERS NOT-INTEGRATED AND NOTHING ELSE. A match result may come only from a KYC or AFIS supplier
 * through the face-match-result door in packages/catalog/feeds.json. No supplier is contracted, the operator's
 * section 72 question is undetermined, and whether a face match is biometric information is the Information
 * Officer's undecided D-3. So the door has no adapter, and the one answer it gives is the contract's
 * not-integrated, the same first-class outcome apps/api/src/vetting/authority.ts gives for thirteen authorities.
 * The type of that answer is the single literal: there is no code path here that can return matched, and a
 * shift start built on it cannot be recorded as matched without this file changing first.
 *
 * WHAT A SUPPLIER WOULD BE TOLD. doorAnswers is the door's refusal of a payload, following feeds.json's own rules:
 * a forbidden field — a template, a photograph, an embedding, a similarity score — is refused by the name this
 * contract gives it, matched on its canonical form at any depth, before the shape is looked at; everything else,
 * however well formed, is refused as not connected. There is no condition under which it accepts.
 *
 * And the day a supplier is contracted and every switch-on condition is met, askFaceMatchDoor throws rather than
 * inventing an answer, because an adapter nobody wrote is not a match.
 */
import feeds from '../../../../catalog/feeds.json' with { type: 'json' };
import capabilities from '../../../../catalog/capabilities.json' with { type: 'json' };
import { verifyInService } from './contract.ts';

type Forbidden = { field: string; also?: string[] };
type Feed = { id: string; capabilities: string[]; beforeSwitchOn: { met: boolean }[]; neverAccepts: Forbidden[]; operator: { determined: boolean } };

export const FACE_MATCH_DOOR: string = verifyInService.shiftStart.door;
const feed = (feeds.feeds as unknown as Feed[]).find(entry => entry.id === FACE_MATCH_DOOR);
if (!feed) throw new Error(`packages/catalog/feeds.json has no "${FACE_MATCH_DOOR}" door, so a shift start has nowhere to ask about a face.`);
const door: Feed = feed;

export type FaceMatchOutcome = 'not-integrated';
const OUTCOME = verifyInService.shiftStart.outcome;
if (OUTCOME !== 'not-integrated' || verifyInService.shiftStart.matchPerformed !== false) throw new Error('packages/catalog/verify-in-service.json says a shift start is matched. Nothing can match a face: no supplier is contracted and D-3 is undecided.');

const switchedOn = () => door.operator.determined && door.beforeSwitchOn.every(condition => condition.met)
 && door.capabilities.every(id => capabilities.capabilities.find(capability => capability.id === id)?.connected === true);

/** What the door says about a shift start today. */
export function askFaceMatchDoor(): { readonly outcome: FaceMatchOutcome } {
 if (switchedOn()) throw new Error(`The ${FACE_MATCH_DOOR} door's switch-on conditions are all met and no adapter has been written. A match nobody's code produced is not a match.`);
 return { outcome: 'not-integrated' };
}

const canonical = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const forbiddenNames = new Map(door.neverAccepts.flatMap(entry => [entry.field, ...(entry.also ?? [])].map(name => [canonical(name), entry.field] as const)));
function forbiddenIn(value: unknown): string | null {
 if (Array.isArray(value)) { for (const item of value) { const found = forbiddenIn(item); if (found) return found; } return null; }
 if (!value || typeof value !== 'object') return null;
 for (const [key, inner] of Object.entries(value)) {
  const named = forbiddenNames.get(canonical(key));
  if (named) return named;
  const found = forbiddenIn(inner);
  if (found) return found;
 }
 return null;
}

/** The door's answer to any payload a supplier sends: a refusal, always. */
export function doorAnswers(payload: unknown): { readonly refused: 'forbidden-field'; readonly field: string } | { readonly refused: 'not-connected' } {
 const field = forbiddenIn(payload);
 return field ? { refused: 'forbidden-field', field } : { refused: 'not-connected' };
}
