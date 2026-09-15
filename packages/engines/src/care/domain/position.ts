/* Whether a nurse's whereabouts may be shown to the patient she is visiting, right now.
 *
 * On the visit's own day, and only until the visit is complete. Before the day there is nothing a
 * patient needs to watch; after completion the nurse is on her way to somebody else's house, and a
 * patient who could still see where she was would be watching the next patient's visit. The window
 * closes on completion rather than at the end of the shift, because the shift is the nurse's and the
 * visit is the only thing this patient and this nurse share.
 *
 * What is shown inside the window is packages/catalog/geography.json's business — a suburb and never a
 * street. This module answers the one question before that: whether anything may be shown at all. It
 * reads no position; it has none to read.
 *
 * The refusal is the engine's, declared at the top of packages/catalog/apis/care.json rather than on a
 * route: no care route hands out a position, and none ever may outside the visit. */
import { answer, type Answer } from './outcome.ts';
import { sameDay } from './clock.ts';
import type { CareContract } from './contract.ts';
import type { Visit } from './visits.ts';

export function locationShare(contract: CareContract, visit: Visit | null, now: Date): Answer<{ until: 'completion' }> {
 const shared = visit !== null && visit.state !== 'completed' && sameDay(new Date(visit.scheduledFor), now, contract.timezone);
 if (shared) return answer({ until: 'completion' as const });
 const refusal = contract.engineRefusals.find(r => r.id === 'location-beyond-the-visit');
 if (!refusal) throw new Error('packages/catalog/apis/care.json has lost the refusal "location-beyond-the-visit".');
 return { ok: false, route: 'care', id: refusal.id, status: refusal.status, statement: refusal.statement };
}
