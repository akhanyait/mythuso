import { ArrowRight, CalendarClock, Clock3, MapPin, Radio, Route, ShieldCheck } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { EmptyState } from '../components/States';
import { Metric, Metrics } from '../surface/Surface';
import { LiveMap, type MapMarker } from '../map/LiveMap';
import { capability } from '../lib/capabilities';
import { coverage } from '../lib/geography';
import { longDateOf, visitEnds } from '../lib/scheduling';
import {
 addressRule, arrivalFor, arrivalRefusals, assignedNurse, basisSentence, historyRule,
 precisionSentence
} from '../lib/arrival';
import type { VisitRow } from './Pages';

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
 * Nothing here is connected. dispatch is one of fifteen capabilities and none of them is; no nurse
 * device is read, no position is requested from this browser, and every coordinate on the screen is
 * a suburb centre out of packages/catalog/geography.json. */

const key = (kind: MapMarker['kind'], label: string) =>
 <span key={label}><i className={`key-${kind}`}/>{label}</span>;

export function Arrival({ row, navigate, view }: {
 row?: VisitRow;
 navigate: (page: string) => void;
 view: (id: string) => void;
}) {
 if (!row) return <>
  <div className="page-intro"><div className="eyebrow">YOUR VISIT</div><h1>Where is your nurse?</h1></div>
  <EmptyState title="Nothing to follow" body="When you book a visit, this is where you will see who is coming and how far away they are on the day." action="Book a nurse" onAction={() => navigate('Book a nurse')}/>
 </>;

 const visit = row.visit;
 const arrival = arrivalFor(visit, row.group);
 const ends = visitEnds(visit);
 const watching = arrival.state === 'on-the-day';
 const eta = arrival.state === 'on-the-day' ? arrival.eta : null;
 const to = 'to' in arrival ? arrival.to : undefined;
 const from = arrival.state === 'on-the-day' ? arrival.from : undefined;

 /* Two marks and no more. A controller's board carries five kinds because a controller is choosing
    between people; a patient is watching one nurse come to one address, and every extra pin on this
    map would be somebody else's nurse going to somebody else's house. */
 const markers: MapMarker[] = [
  ...(from ? [{ id: 'nurse', at: from.at, kind: 'nurse-free' as const, label: `${assignedNurse.name}, working in ${from.name}` }] : []),
  ...(to ? [{ id: 'visit', at: to.at, kind: 'visit-assigned' as const, label: `Your visit, in ${to.name}` }] : [])
 ];
 const summary = to
  ? `Schematic map of ${coverage.city}. Your visit is drawn at the centre of ${to.name}.${from ? ` ${assignedNurse.name} is drawn at the centre of ${from.name}, and a dashed straight line joins the two.` : ' No nurse is drawn, because nobody is on the way yet.'}`
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
     <span className="avatar nurse-avatar">{assignedNurse.initials}</span>
     <div><strong>{assignedNurse.name}</strong><small>{assignedNurse.role}</small></div>
    </div>
    <Pill tone={watching ? 'teal' : ''}>{watching ? 'Coming today' : arrival.state === 'another-day' ? `In ${arrival.days} ${arrival.days === 1 ? 'day' : 'days'}` : 'Not yet'}</Pill>
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
    <LiveMap markers={markers} summary={summary} height={320} link={from ? { from: from.at, to: to.at } : null}/>
    <div className="map-key">
     {from && key('nurse-free', `${assignedNurse.name} · ${from.name}`)}
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
    </dl></div>
    <div className="privacy-note"><Radio size={19}/>{arrivalRefusals.nothingIsMeasured}</div>
    <p className="helper"><ShieldCheck size={14}/>{coverage.sentence}</p>
   </div>
  </div>

  <button className="primary full" onClick={() => view(row.id)}><CalendarClock size={17}/>Open this visit</button>
  <button className="secondary full" onClick={() => navigate('My visits')}>Back to your visits<ArrowRight size={17}/></button>
 </>;
}
