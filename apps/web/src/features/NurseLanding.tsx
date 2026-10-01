import type { ComponentType } from 'react';
import { ArrowRight, BookOpen, Briefcase, CalendarCheck, FolderOpen, GraduationCap, MapPin, MessageSquare, PackageCheck, ShieldAlert, Send, Users, Wallet, BellRing } from 'lucide-react';
import { Card } from '../ui';
import { useCareVisit } from '../lib/care-visit';
import { useCases } from '../lib/case';
import { cycle } from '../lib/earnings';
import { money } from '../lib/catalog';
import { words as medicinesWords } from '../lib/medicines';
import { useVisitQueue, useWaitingCount } from './VisitQueue';
import { nurseDayCounts } from './Workspaces';
import { earningsSummary } from './Earnings';
import { Readiness } from './KitDeck';
import '../surface/nurse-identity.css';

/* The nurse's landing, as the Lovable export's dashboard — honestly.
 *
 * The export opens a nurse's day on a hero with a live pill, the weather, a greeting by name and a
 * "Clinic readiness 92%" ring, then six stat tiles (8 appointments, 12 active patients, 3 new messages,
 * 2 urgent alerts, 12 results to review), a clinic-flow chart and a list of "care attention" rows with
 * blood pressures nobody measured. The live deck above this already says where she is going and when she
 * can leave; what this adds is the export's row of tiles and its shift actions, with every figure counted
 * from a list somewhere in her workspace that she can open and count again:
 *
 *   - her visits today and how many are signed off, from the same rows the schedule draws;
 *   - whether a visit is being offered to her now, from the Care engine's own offer;
 *   - how many parts of a visit are still on the phone, from the visit queue Thuso Kit lists;
 *   - how many cases GilbertOne gathered are with her, from the case list on Cases;
 *   - what she has earned this week, from the earnings register.
 *
 * And the readiness ring is the kit's own — two counts, the register's checks and the instruments in
 * calibration, never a percentage. No weather, no greeting, no message count, no alert that is not a row
 * somewhere. Nothing here moves on its own. */

function Tile({ icon: Icon, label, value, note, go, to }: { icon: ComponentType<{ 'aria-hidden'?: boolean }>; label: string; value: string; note: string; go: (id: string) => void; to?: string }) {
 const body = <>
  <span className="nurse-tile__icon" aria-hidden="true"><Icon aria-hidden/></span>
  <span className="nurse-tile__value">{value}</span>
  <span className="nurse-tile__label">{label}</span>
  <span className="nurse-tile__note">{note}</span>
 </>;
 return to
  ? <button type="button" className="nurse-tile is-link" onClick={() => go(to)} aria-label={`${label}: ${value}. ${note}. Open ${to}`}>{body}</button>
  : <div className="nurse-tile">{body}</div>;
}

export function NurseDayTiles({ go, nurseId }: { go: (id: string) => void; nurseId: string }) {
 const queue = useVisitQueue();
 const day = nurseDayCounts(queue);
 const waiting = useWaitingCount(queue);
 const offer = useCareVisit().offer;
 const cases = useCases().cases;
 /* A case waits on a nurse from the moment it opens until she decides where the patient is seen. */
 const withHer = cases.filter(c => c.stateCode === 'opened' || c.stateCode === 'with-nurse').length;
 const open = cases.filter(c => c.stateCode !== 'closed').length;
 const week = earningsSummary();
 return <section className="nurse-landing nurse-ui" aria-labelledby="nurse-landing-title">
  <h2 id="nurse-landing-title" className="visually-hidden">Your day, counted</h2>
  <div className="nurse-landing__grid">
   <div className="nurse-tiles">
    <Tile icon={CalendarCheck} label="Visits today" value={String(day.visits)} go={go}
          note={day.signed ? `${day.signed} signed off, ${day.left} to go` : 'None signed off yet'}/>
    <Tile icon={BellRing} label="Offer" value={offer?.state === 'open' ? '1' : '0'} go={go}
          note={offer?.state === 'open' ? 'A visit is offered to you now' : 'Nothing offered right now'}/>
    <Tile icon={Send} label="Waiting to send" value={String(waiting)} go={go} to="Thuso Kit"
          note={waiting ? 'Still on this phone' : 'Everything has reached the record'}/>
    <Tile icon={FolderOpen} label="Cases to decide" value={String(withHer)} go={go} to="Cases"
          note={`${open} open on your list`}/>
    <Tile icon={Wallet} label="This week" value={money(week.thisWeek)} go={go} to="Earnings & payouts"
          note={`${week.visits} visits · pays ${cycle.paysOn}`}/>
   </div>
   <Readiness capturerId={nurseId}/>
  </div>
 </section>;
}

/* The export's "shift actions": an icon tile, a title, one line and an arrow, in place of the text pills.
   Each goes to its destination in the workspace. The line under each title says what is behind it now,
   including where the answer is that nothing is — a card that promised an inbox would be the export's
   fiction with a nicer border. The `tool-link` class stays so the journeys that find these by it still do.
   Each id is the name of a section on her rail, because `has` drops any card that is not one, silently;
   scripts/check-boundaries.mjs holds the list to the rail's names. */
const actions: { id: string; icon: ComponentType<{ 'aria-hidden'?: boolean }>; note: string }[] = [
 { id: 'Route map', icon: MapPin, note: 'Today’s stops, numbered, at suburb centres' },
 { id: 'Safety & alerts', icon: ShieldAlert, note: 'Your timer, Sentinel and the kit in one place' },
 { id: medicinesWords.handover.heading, icon: PackageCheck, note: 'The medicines hand-over at the door' },
 { id: 'Team', icon: Users, note: 'The simulated roster, read only' },
 { id: 'Messages', icon: MessageSquare, note: 'Not connected. Nothing here sends' },
 { id: 'Locum shifts', icon: Briefcase, note: 'A register of its own, not open yet' },
 { id: 'Academy', icon: GraduationCap, note: 'Not drawn yet, and never a vetting check' },
 { id: 'Clinical resources', icon: BookOpen, note: 'Protocols and the published library' }
];

export function NurseShiftActions({ go, has }: { go: (id: string) => void; has: (id: string) => boolean }) {
 const shown = actions.filter(action => has(action.id));
 if (!shown.length) return null;
 return <section className="nurse-actions-panel nurse-ui" aria-labelledby="nurse-actions-title">
  <div className="nurse-actions-panel__head"><h2 id="nurse-actions-title">Shift actions</h2><p>The rest of your workspace, one tap from your day.</p></div>
  <div className="nurse-shift-actions">{shown.map(({ id, icon: Icon, note }) =>
   <Card key={id} variant="interactive" className="nurse-shift-action">
    <button type="button" className="tool-link" onClick={() => go(id)}>
     <span className="nurse-shift-action__icon" aria-hidden="true"><Icon aria-hidden/></span>
     <span className="nurse-shift-action__say"><strong>{id}</strong><small>{note}</small></span>
     <ArrowRight aria-hidden="true" className="nurse-shift-action__go"/>
    </button>
   </Card>)}</div>
 </section>;
}
