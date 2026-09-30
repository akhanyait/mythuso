import { ArrowRight, ShieldX, Users } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import '../surface/nurse-identity.css';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button, Card } from '../ui';
import { rosterNurses, rosterRefusals } from '../lib/roster';

/* The nurse's "Team", and the reason it is a directory of people who do not exist.
 *
 * The full Lovable export draws the nurse a team screen: her colleagues, who is on shift, who is
 * nearby and who she can reach. None of that can be drawn honestly here. There is no workforce —
 * `booking` is blocked on a nurse roster with real availability, and what stands in for one is
 * packages/catalog/roster.json, a list of fictional nurses whose own `_note` says nobody on it is
 * real, no credential on it is valid anywhere and nobody on it has agreed to attend anything. So
 * this screen does not invent a team. It reads that roster through lib/roster.ts — the one canonical
 * reader, the same list the dispatch board and the vetting console are drawn from — and shows it
 * plainly as the fiction it is, wearing the look of a directory.
 *
 * What it shows is what a peer may legitimately see of a colleague: a name, a registration, the
 * suburb she is based in and the care she is scoped for, all of it read from the contract rather
 * than typed here a second time. What it does not show is the part that is not a peer's to see — a
 * colleague's vetting standing, which is decided on the Control Tower's console and answered for
 * there, never read off another nurse's phone. And it draws no presence, books nobody and reaches
 * nobody: there is no position to draw (every one dispatch shows is simulated), no shift to hold,
 * and no channel to write down — the Messages tool beside this one delivers nothing either.
 *
 * It is a More tool rather than a section for the reason Messages and Medicines & Labs are: a
 * nurse's bar already carries six sections, and a directory of fictional colleagues is the last
 * thing that should push the work she opened the app for off it. */

export function StaffTeam({ onClose }: { onClose: () => void }) {
 return <div className="form-stack">
  <NotConnected of="booking"/>
  <p className="muted">There is no team behind this preview. The names below are the simulated roster — the same fictional nurses the Control Tower's dispatch board and its vetting console read out of one contract. It is a directory of people who do not exist, wearing the look of one.</p>

  {/* The roster itself, read rather than retyped: every name, registration, suburb and scope is
      lib/roster.ts's, so the day the contract changes this list changes with it and cannot drift
      into a second copy of a person. A peer sees a colleague's professional facts and nothing more
      — no clearance, no position, no availability — which is the whole of what this screen is. */}
  <SectionTitle title="Who the roster carries"/>
  {/* The export's card grid (30 September 2026): initials where its photograph was, the registration and
      suburb under the name, and the scope as badges. Its presence pill and its message and call buttons are
      not here — there is no presence to show and no channel to reach anybody by. */}
  <ul className="staff-team-grid">{rosterNurses.map(nurse => <li key={nurse.id}>
   <Card padding="md" className="staff-team-card">
    <div className="staff-team-card__head">
     <span className="staff-team-card__initials" aria-hidden="true">{nurse.initials}</span>
     <span><strong>{nurse.name}</strong><small>{nurse.reference} · {nurse.zoneName}</small></span>
    </div>
    <ul className="staff-team-card__scope" aria-label={`${nurse.name}'s scope`}>{nurse.scope.map(scope => <li key={scope}><Badge size="sm" variant="neutral">{scope}</Badge></li>)}</ul>
   </Card>
  </li>)}</ul>

  {/* The refusal is the feature, and it runs in the four directions a directory of fictional people
      could otherwise be mistaken for a real one. The booking line is the contract's own sentence,
      looked up through lib/roster.ts rather than written down here a second time. */}
  <SectionTitle title="What it will not do"/>
  <div className="panel"><dl className="stated">
   <div><dt>Say where anybody is</dt><dd>No device reports a position to this screen. Whether a colleague is on a visit, off duty or across town is the dispatch board's business, and every position it draws is simulated — so a directory that showed one would be showing a guess as a fact.</dd></div>
   <div><dt>Show a colleague's standing</dt><dd>What has lapsed, what is still in review and what was declined is on the Control Tower's vetting console, where the decision is made and the person can answer for it. A peer directory carries a name, a registration and a suburb, and stops there.</dd></div>
   <div><dt>Book or assign anybody</dt><dd>{rosterRefusals.notAPerson}</dd></div>
   <div><dt>Reach anybody</dt><dd>You cannot write to a colleague from here. The Messages tool beside this one is a simulated channel that delivers nothing, and a directory with no way to reach the people on it is the honest version of both.</dd></div>
  </dl></div>

  {/* The registration numbers are shown, so the screen owes the reader the truth about them: they
      are part of the same fiction, and the standing behind them is decided somewhere else. */}
  <div className="privacy-note alert"><ShieldX size={19}/>The SANC numbers above are as fictional as the names beside them. This screen confirms nothing about anybody, and a colleague's clearance is decided on the Control Tower's vetting console — not read off a peer's directory.</div>
  <div className="privacy-note"><Users size={19}/>When a real workforce roster exists — nurses under contract, with availability each of them keeps and a position each shares — this becomes a directory of colleagues a nurse can actually reach and the Control Tower can actually staff from. Until it does, it lists the fiction the dispatch board runs on, and it does not dress that fiction up as a team.</div>
  <Button variant="primary" className="full" onClick={onClose} trailingIcon={<ArrowRight aria-hidden="true"/>}>Close</Button>
 </div>;
}
