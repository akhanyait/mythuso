/* Who the Access engine may offer, worked out from packages/catalog/roster.json on the engine's own
   side of the boundary.

   roster.json writes down only the exceptions: every check a nurse's role carries and the roster does
   not name is verified and in date. apps/web/src/lib/vetting-fixtures.ts does that arithmetic for the
   screens and apps/api/src/simulation/roster.ts does it for the identity service; an engine may import
   neither, so this is the third reader of the same list, and it is deliberately the least clever of the
   three. A badge is current when nothing on the list says otherwise: no check outside verified, no
   verification past its renewal day, no high-risk check still waiting on its second reviewer, and no
   declined application — an appeal keeps a nurse on the register, not on a patient's doorstep.

   The sentence a nurse is refused with is the booking capability's, found by the slug of its own words
   exactly as the web finds it, so the engine and the screen refuse her in the same words. Distance is
   not worked out here: the engine may not import packages/geo, and a nurse's nearness orders a list on a
   screen rather than deciding whether she may be booked. */
import capabilities from '../../../../catalog/capabilities.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import roster from '../../../../catalog/roster.json' with { type: 'json' };
import type { Candidate } from './booking.ts';

type Exception = { state?: string; expiresInDays?: number; secondedBy?: string | null };
type Row = { id: string; name: string; zone: string; declined?: boolean; checks?: Record<string, Exception> };

const slug = (sentence: string) => sentence.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const refuses: string[] = capabilities.capabilities.find(c => c.id === 'booking')?.simulation?.refuses ?? [];
const sentence = (id: string) => {
 const found = refuses.find(s => slug(s) === id);
 if (!found) throw new Error(`The booking capability no longer refuses "${id}" in packages/catalog/capabilities.json.`);
 return found;
};

export function rosterCandidates(): Candidate[] {
 return (roster.nurses as Row[]).map(row => {
  const covered = geography.zones.some(z => z.name === row.zone);
  const exceptions = Object.values(row.checks ?? {});
  const lapsed = exceptions.some(e => e.expiresInDays !== undefined && e.expiresInDays < 0);
  const unfinished = Boolean(row.declined) || exceptions.some(e => (e.state !== undefined && e.state !== 'verified') || e.secondedBy === null);
  const badgeCurrent = !lapsed && !unfinished;
  const notOfferedBecause = !covered ? sentence('book-outside-a-zone-dispatch-can-reach')
   : lapsed ? sentence('offer-a-nurse-whose-simulated-vetting-has-lapsed')
    : unfinished ? sentence('offer-a-nurse-whose-vetting-has-not-finished') : null;
  return { nurseRef: row.id, name: row.name, zone: row.zone, covered, badgeCurrent, notOfferedBecause, distanceKm: null };
 });
}
