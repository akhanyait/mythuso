import { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Clock3, MapPin, Navigation, Radio, Route, ShieldCheck } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { EmptyState } from '../components/States';
import { Metric, Metrics } from '../surface/Surface';
import { LiveMap, type MapMarker } from '../map/LiveMap';
import type { Leg } from '../lib/roster';
import { capability, simulationOf } from '../lib/capabilities';
import { coverage } from '../lib/geography';
import { longDateOf, visitEnds } from '../lib/scheduling';
import {
 addressRule, arrivalFor, arrivalRefusals, basisSentence, historyRule, nurseFor,
 precisionSentence
} from '../lib/arrival';
import type { VisitRow } from './Pages';
const DoorCheckEntry = lazy(() => import('./VerifyInService').then(m => ({ default: m.DoorCheckEntry })));

/* Where is she now.
 *
 * The question this product could answer for a Control Tower and not for the person sitting at home
 * with the door on the latch. The coordinates, the zones and the arrival arithmetic have all been
 * here since the dispatch board was written; a patient saw none of it, and "arrival updates will be
 * connected in the functionality phase" was the whole of what she got.
 *
 * The composition is an argument. The largest thing on the screen is the number of minutes and the
 * chip above it says "Straight line" before the reader has got to the figure, because a figure that
 * has to be qualified underneath is a figure that will be quoted without the qualification. The map
 * draws that same straight line, dashed, through the buildings between two suburbs — the picture and
 * the caveat saying one thing rather than the picture saying "she is coming down that road".
 *
 * And on most days there is nothing to show, which is the state this screen was designed around
 * first. A patient can open it a fortnight before her visit; what she gets then is her suburb, the
 * name of the nurse who is coming, and a sentence saying why there is no position on it. An empty
 * map with a spinner would have been the easier thing to build and it would have taught her that
 * the screen is broken.
 *
 * WHAT MOVES, AND WHAT IS DOING THE MOVING. dispatch is simulated rather than connected: the
 * position on this screen is generated on this machine, and the notice above the fold says so in
 * the contract's own words. What the simulator does is the honest version of what a supplier would
 * do — she sets off from her own suburb so as to reach yours at the start of the window, and how far
 * along she is is arithmetic on the clock. So the figure changes while the screen is open, and the
 * sentence beside it says that what is being watched is that arithmetic and not her phone. Nobody's
 * device is read, no position is requested from this browser, and every coordinate on the screen is
 * a suburb centre out of packages/catalog/geography.json. */

const key = (kind: MapMarker['kind'], label: string) =>
 <span key={label}><i className={`key-${kind}`}/>{label}</span>;

/* The three states of a leg, in the words a person waiting at home would use. None of them is a
   promise: the departure is worked out backwards from the window at the speed printed above it, and
   it is said to be worked out rather than announced. */
const clockOf = (at: Date) => at.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
function legSentence(leg: Leg, from: string, to: string, window?: string) {
 if (leg.minutesIn >= leg.legMinutes) return `She is in ${to} now.`;
 if (!leg.departAt) return `She is working in ${from}. Nothing here says when she sets off.`;
 return leg.onTheWay
  ? `She set off from ${from} at ${clockOf(leg.departAt)} and is ${Math.round(leg.minutesIn)} of ${leg.legMinutes} minutes along that straight line. What is moving is the arithmetic above, not her phone.`
  : `She is in ${from}. To be with you by ${window ?? 'your window'} she would set off at ${clockOf(leg.departAt)} — that is the ${leg.legMinutes}-minute straight line above worked backwards, and it is not a departure anybody has promised.`;
}

/* The screen re-reads the clock every fifteen seconds so the figure under it is live rather than
   frozen at whatever it was when the page opened. Fifteen because that is roughly how long it takes
   a nurse in Johannesburg traffic to cover the 110 metres this map is allowed to distinguish —
   ticking faster would redraw a pin that has not moved. */
const TICK_SECONDS = 15;

export function Arrival({ row, navigate, view }: {
 row?: VisitRow;
 navigate: (page: string) => void;
 view: (id: string) => void;
}) {
 const [now, setNow] = useState(() => new Date());
 useEffect(() => {
  const tick = setInterval(() => setNow(new Date()), TICK_SECONDS * 1000);
  return () => clearInterval(tick);
 }, []);

 if (!row) return <>
  <div className="page-intro"><div className="eyebrow">YOUR VISIT</div><h1>Where is your nurse?</h1></div>
  <EmptyState title="Nothing to follow" body="When you book a visit, this is where you will see who is coming and how far away they are on the day." action="Book a nurse" onAction={() => navigate('Book a nurse')}/>
 </>;

 const visit = row.visit;
 const arrival = arrivalFor(visit, row.group, now);
 /* Who is coming, out of the simulated roster and gated by the same vetting the console decides
    with. On the day the arrival already knows; before it, the roster is asked directly. */
 const nurse = arrival.state === 'on-the-day' ? arrival.nurse : nurseFor(visit.address);
 const ends = visitEnds(visit);
 const watching = arrival.state === 'on-the-day';
 const eta = arrival.state === 'on-the-day' ? arrival.eta : null;
 const to = 'to' in arrival ? arrival.to : undefined;
 const from = arrival.state === 'on-the-day' ? arrival.from : undefined;

 /* Two marks and no more. A controller's board carries five kinds because a controller is choosing
    between people; a patient is watching one nurse come to one address, and every extra pin on this
    map would be somebody else's nurse going to somebody else's house. */
 const markers: MapMarker[] = [
  ...(arrival.state === 'on-the-day'
   ? [{ id: 'nurse', at: arrival.at, kind: 'nurse-free' as const, label: `${nurse.name}, ${arrival.leg?.onTheWay ? `on her way from ${arrival.from.name}` : `working in ${arrival.from.name}`}` }]
   : []),
  ...(to ? [{ id: 'visit', at: to.at, kind: 'visit-assigned' as const, label: `Your visit, in ${to.name}` }] : [])
 ];
 const summary = to
  ? `Schematic map of ${coverage.city}. Your visit is drawn at the centre of ${to.name}.${from ? ` ${nurse.name} is drawn on a straight line from the centre of ${from.name}, and a dashed line joins the two.` : ' No nurse is drawn, because nobody is on the way yet.'}`
  : `Schematic map of ${coverage.city}.`;

 return <>
  <div className="page-intro"><div className="eyebrow">YOUR VISIT</div>
   <h1>Where is your nurse?</h1>
   <p>{visit.service.name} for {visit.person}{visit.date ? ` · ${longDateOf(visit.date)}` : ''}</p></div>
  <NotConnected of="dispatch"/>

  {/* The lead, and it is the only panel on the screen that takes the solid glass. What a person came
      for is one figure; everything under it is the reason that figure is allowed to be shown. */}
  <section className="panel glass lead arrival-lead rise-2">
   <div className="lead-head">
    <div className="arrival-who">
     <span className="avatar nurse-avatar">{nurse.initials}</span>
     <div><strong>{nurse.name}</strong><small>{nurse.role}</small></div>
    </div>
    <Pill tone={watching ? 'teal' : ''}>{arrival.state === 'on-the-day' && arrival.leg?.onTheWay ? 'On her way' : watching ? 'Coming today' : arrival.state === 'another-day' ? `In ${arrival.days} ${arrival.days === 1 ? 'day' : 'days'}` : 'Not yet'}</Pill>
   </div>

   {arrival.state === 'on-the-day' ? <>
    <Metrics>
     {/* Minutes first and the chip says what they are before the reader reaches them. When there is
         nothing to divide, the word is "Estimating" — never a dash, which reads as a number to
         nobody, and never nought, which reads as "she is at the gate". */}
     {eta && eta.minutes !== null
      ? <Metric chip="Straight line" value={String(eta.minutes)} unit="min" label={`${arrival.from.name} to ${arrival.to.name}`}/>
      : <Metric chip="No distance to measure" value="Estimating" label={`${arrival.to.name}`}/>}
     {eta && eta.distanceKm !== null && <Metric chip="Suburb centres" value={eta.distanceKm.toFixed(1)} unit="km" label="Distance measured"/>}
     {visit.start && <Metric chip="What you were told" value={visit.start} label={ends ? `Your window, until ${ends}` : 'Your window'}/>}
    </Metrics>
    <p className="helper"><Route size={14}/>{eta ? basisSentence(eta) : ''}</p>
    {/* What is actually moving, said out loud. A figure that changes while somebody watches it is
        read as a device reporting, and no device is: she is on a straight line between two suburb
        centres, timed to reach yours at the start of your window, and the sentence carrying the
        figure says which of those two things is happening. */}
    {arrival.state === 'on-the-day' && arrival.leg && <p className="helper" role="status"><Navigation size={14}/>{legSentence(arrival.leg, arrival.from.name, arrival.to.name, visit.start)}</p>}
   </> : <>
    <Metrics>
     {arrival.state === 'another-day' && <Metric chip="Your visit" value={String(arrival.days)} unit={arrival.days === 1 ? 'day' : 'days'} label="Until the day"/>}
     {visit.start && <Metric chip="What you were told" value={visit.start} label={ends ? `Your window, until ${ends}` : 'Your window'}/>}
     {to && <Metric chip="Where" value={to.name} label="The suburb your visit is in"/>}
    </Metrics>
    <p className="helper"><Clock3 size={14}/>{'refusal' in arrival ? arrival.refusal : ''}</p>
   </>}
  </section>

  {arrival.state === 'outside-coverage' && <div className="privacy-note alert" role="status">
   <MapPin size={19}/>{arrival.refusal} {arrival.why}</div>}

  {/* The picture and the four things it is not, side by side above 960px. The map is context rather
      than subject — a plain panel on the ground and not a second lead — and the column beside it is
      the half of this screen that matters most and the half a tracking feature normally leaves out.
      Each of the four is something a reader could otherwise reasonably assume the opposite of. */}
  <div className="arrival-columns">
   {to && <section className="panel arrival-map">
    <div className="section-title"><h2>{from ? `${from.name} to ${to.name}` : to.name}</h2></div>
    <LiveMap markers={markers} summary={summary} height={320} surface="patient" link={from ? { from: from.at, to: to.at } : null}/>
    <div className="map-key">
     {from && key('nurse-free', `${nurse.name} · ${from.name}`)}
     {key('visit-assigned', `Your visit · ${to.name}`)}
    </div>
    <p className="helper">{precisionSentence}</p>
   </section>}
   <div className="arrival-facts">
    <SectionTitle title="What this is, and what it is not"/>
    <div className="panel"><dl className="stated">
     <div><dt>It is not an arrival time</dt><dd>{arrivalRefusals.notAnArrivalTime}</dd>
      <small>{capability('dispatch').blockedBy.join(' ')}</small></div>
     <div><dt>Neither pin is a house</dt><dd>{arrivalRefusals.noDoorstep}</dd>
      <small>{addressRule.why}</small></div>
     <div><dt>Nowhere she has been</dt><dd>{historyRule.statement}</dd>
      <small>{historyRule.why}</small></div>
     <div><dt>You see this on the day and not before</dt><dd>{arrivalRefusals.onlyOnTheDay}</dd></div>
     {/* And what the simulation standing in for a supplier will not do, in its own words. A screen
         is never quieter for being simulated than it was for being absent: the notice at the top
         says the movement is generated on this machine, and this says what generating it refuses. */}
     <div><dt>What the simulation will not do</dt><dd>{simulationOf('dispatch')!.refuses.join(' ')}</dd>
      <small>{simulationOf('dispatch')!.supplier}</small></div>
    </dl></div>
    <div className="privacy-note"><Radio size={19}/>{arrivalRefusals.nothingIsMeasured}</div>
    <p className="helper"><ShieldCheck size={14}/>{coverage.sentence}</p>
   </div>
  </div>

  {/* Checking who is at the door, from Verify. Its words arrive with its own chunk, so this screen does not carry them. */}
  <Suspense fallback={null}><DoorCheckEntry onOpen={() => navigate('Door check')}/></Suspense>
  <button className="primary full" onClick={() => view(row.id)}><CalendarClock size={17}/>Open this visit</button>
  <button className="secondary full" onClick={() => navigate('My visits')}>Back to your visits<ArrowRight size={17}/></button>
 </>;
}
