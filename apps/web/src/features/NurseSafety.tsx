import { Suspense, lazy, type CSSProperties } from 'react';
import { Ban, ShieldCheck } from 'lucide-react';
import { Card } from '../ui';
import { MINUTE, clockOf, fieldSafety } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { minutesLeft, standingOf } from '../../../../packages/engines/src/safety/domain/checkins.ts';
import { NURSE_ON_SHIFT, useFieldSafety } from '../lib/field-safety';
import { VisitSafety } from './FieldSafety';
import { nurseDayStops } from './Workspaces';
import { useVisitQueue } from './VisitQueue';
import '../surface/nurse-identity.css';

/* Sentinel and the kit's registry carry the Safety, Core and Devices domains and every engine's settings,
   so they arrive when she opens this screen, as they do on Thuso Kit. */
const SentinelState = lazy(() => import('./Sentinel').then(m => ({ default: m.SentinelState })));
const KitHealth = lazy(() => import('./Devices').then(m => ({ default: m.KitHealth })));

/* "Safety & alerts" — the Lovable export's "Alarms & readings", gathered from what exists.
 *
 * The export's page is an alarm centre: live vital-sign tiles and a chart, severity alarms with recommended
 * responses, a three-layer triage, a dispatch-an-ambulance button and an area-risk map. None of that exists
 * here, and drawing it would be drawing a monitoring service this product does not run. What does exist is
 * three things a nurse in the field needs in one place, and this is where they are gathered:
 *
 *   - her field-safety timer, drawn as a ring of the minutes left against the minutes the visit was timed
 *     for — arithmetic on the timer the engine keeps, drawn once and resting — with the same strip, the
 *     same three presses and the same panic confirmation the visit carries;
 *   - Sentinel's state and the tiers she may raise, the same component Thuso Kit ends on;
 *   - the kit's health, the same registry the kit reads.
 *
 * What it will not show is written on the screen rather than left out silently, because a nurse who has
 * seen the export will look for the alarm list. Nothing here moves on its own. */

export function NurseSafety() {
 const s = useFieldSafety();
 const queue = useVisitQueue();
 const references = new Set(nurseDayStops(queue).map(stop => stop.reference));
 /* Her timers for today's visits, open ones first, newest first within each. */
 const timers = s.timers
  .filter(timer => references.has(timer.appointmentRef) && (timer.nurseRef === null || timer.nurseRef === NURSE_ON_SHIFT))
  .slice().sort((a, b) => Number(standingOf(a, s.now) === 'closed') - Number(standingOf(b, s.now) === 'closed') || b.startedAt - a.startedAt);
 const live = timers.find(timer => standingOf(timer, s.now) !== 'closed');
 return <div className="nurse-safety-page nurse-ui">
  <p className="nurse-route__lead">Your field-safety timer, Sentinel and the state of your kit, in one place. Each is the same control it is on the visit and on Thuso Kit; opening it here changes nothing about it.</p>

  <div className="nurse-safety-page__grid">
   <Card padding="md" className="nurse-safety-page__timer">
    <h2>{fieldSafety.nurse.heading}</h2>
    {live ? <>
     <TimerRing started={live.startedAt} due={live.dueAt} left={minutesLeft(live, s.now)} overdue={standingOf(live, s.now) === 'overdue'}/>
     <VisitSafety reference={live.appointmentRef}/>
    </> : <div className="nurse-safety-page__empty">
     <ShieldCheck aria-hidden="true"/>
     <p><strong>No timer is running.</strong> A visit's timer starts when the patient's visit code matches at the door, and stops when the visit is signed off or you check out. Until then there is nothing to time and nothing for the desk to be told.</p>
    </div>}
    {timers.filter(timer => timer !== live).length > 0 && <ul className="nurse-safety-page__past" aria-label="Earlier timers today">
     {timers.filter(timer => timer !== live).map(timer => <li key={timer.checkinRef}>
      <span>{timer.appointmentRef}</span>
      <span>{timer.closedAt ? `Closed at ${clockOf(timer.closedAt)}` : `Due at ${clockOf(timer.dueAt)}`}</span>
     </li>)}
    </ul>}
   </Card>

   <Card padding="md" className="nurse-safety-page__refused">
    <h2>What this screen will not show</h2>
    <ul>
     {['Live vital signs. No device streams a reading to this screen, and a reading reaches a record only through a visit.',
       'Alarms by severity, or a response somebody recommends. Nothing here reads a number and decides how worried to be.',
       'A button that sends an ambulance or dispatches anybody. Panic tells the desk; a person there decides what happens.',
       'A map of risky areas. Nobody has decided what would put a street on it, or who could be harmed by it being there.'].map(line =>
      <li key={line}><Ban aria-hidden="true"/><span>{line}</span></li>)}
    </ul>
   </Card>
  </div>

  <Suspense fallback={null}>
   <SentinelState workspace="nurse"/>
   <KitHealth/>
  </Suspense>
 </div>;
}

/* The minutes left against the minutes the visit was timed for, as one ring: the arc is what is left, the
   track is what has gone, the numeral is the same minutesLeft the strip prints. Drawn once as it arrives and
   then only when the clock the store keeps moves it — never a pulse, never a countdown animation. Overdue is
   the danger ink and the word under the numeral, never the colour alone. */
function TimerRing({ started, due, left, overdue }: { started: number; due: number; left: number; overdue: boolean }) {
 const total = Math.max(1, Math.round((due - started) / MINUTE));
 const share = Math.min(1, left / total);
 return <div className={`nurse-timer${overdue ? ' is-overdue' : ''}`} aria-hidden="true">
  <svg viewBox="0 0 100 100">
   <circle cx="50" cy="50" r="42" className="nurse-timer__track"/>
   <circle cx="50" cy="50" r="42" className="nurse-timer__arc" pathLength={1} style={{ '--share': share } as CSSProperties}/>
  </svg>
  <span className="nurse-timer__figure"><strong>{left}</strong><small>{overdue ? 'min, overdue' : `of ${total} min left`}</small></span>
 </div>;
}
