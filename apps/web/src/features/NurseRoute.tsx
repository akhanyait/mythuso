import { useEffect, useState } from 'react';
import { BadgeCheck, Clock3, Home, MapPin, Route as RouteIcon } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { LiveMap, type MapLink, type MapMarker } from '../map/LiveMap';
import { zoneByName, type Zone } from '../lib/geography';
import { mayTakeAVisit, nurseById } from '../lib/roster';
import { sentences } from '../lib/care-visit';
import { distanceKm, isRouteMeasured, noRoutingProvider } from '../../../../packages/geo/index.ts';
import { Badge, Button, Card, Tab, TabsList } from '../ui';
import { useVisitQueue } from './VisitQueue';
import { nurseDayStops, type NurseStop } from './Workspaces';
import { WeekBars } from './NurseWeekBars';
import '../surface/nurse-identity.css';

/* The nurse's route map — the Lovable export's "Map view" and "Allocations", drawn from her own day.
 *
 * WHAT IT IS. The three visits the schedule lists, placed at the centre of each one's suburb, numbered in
 * the order of the day, with her base suburb from the roster as the first point, and a dashed straight
 * leg from each point to the next. The list beside the map is the same rows, and choosing a stop on
 * either chooses it on both. Every figure on the screen — how many stops, how many signed, the length of
 * the legs — is counted off that list, so a reader can check any of them by reading down it.
 *
 * WHAT IT WILL NOT DRAW, and each of these is something the export draws:
 *   - A patient's initials on a pin, or a name anywhere on the screen. A pin is at a suburb centre so
 *     that it names nobody; the schedule is where the person is, and it is one tap away.
 *   - A clinic. There is none; her base is a suburb, labelled as one.
 *   - An urgent pin, a travel time, "28 min", a coverage percentage or a stage count. Nothing here
 *     knows how long a drive takes or how urgent a visit is, and a number that sounds like it does is
 *     the one kind of number this product may not show.
 *   - A route or a Directions button. No routing provider is connected — the routing module is asked
 *     and its answer is printed — so the legs are straight, dashed and labelled as measurements.
 *   - Her live position. Nothing here asks the device where it is, and the dispatch notice says so.
 *
 * The map is the shared LiveMap, a staff surface, so streets start on as the founder asked for the nurse
 * and the controller and the disclosure beside the switch is the same sentence it is everywhere else. */

/** A leg's length, to the tenth of a kilometre, because that is as sharp as a suburb centre is. */
const km = (value: number) => `${value.toFixed(1)} km`;

export function NurseRoute({ nurseId }: { nurseId: string }) {
 const queue = useVisitQueue();
 const stops = nurseDayStops(queue);
 const nurse = nurseById(nurseId);
 const base = nurse?.zone;
 /* The stop she is on the way to, which is the first not yet signed off; the last stop once every one is. */
 const next = stops.find(stop => !stop.signed);
 const [chosen, setChosen] = useState<number>((next ?? stops[stops.length - 1]).number);
 const [legsOn, setLegsOn] = useState(true);
 const [range, setRange] = useState<'Day' | 'Week'>('Day');
 /* Asked of the routing module rather than written here, so the day a provider is connected this
    sentence stops being true in the one place that decides it. */
 const [noRoute, setNoRoute] = useState('');
 useEffect(() => {
  let live = true;
  if (base) void noRoutingProvider.route({ from: base.at, to: base.at }).then(answer => { if (live && !isRouteMeasured(answer)) setNoRoute(answer.reason); });
  return () => { live = false; };
 }, [base]);

 const placed = stops.map(stop => ({ stop, zone: zoneByName(stop.suburb) }))
  .filter((row): row is { stop: NurseStop; zone: Zone } => Boolean(row.zone));
 /* Base first, then every stop in order: each leg is the straight line between two suburb centres,
    measured by packages/geo and drawn dashed. */
 const points = [...(base ? [{ name: base.name, zone: base }] : []), ...placed.map(row => ({ name: row.stop.suburb, zone: row.zone }))];
 const legs = points.slice(1).map((to, i) => ({ from: points[i], to, km: distanceKm(points[i].zone.at, to.zone.at) }));
 /* A leg inside one suburb is nought kilometres between one centre and itself: it is said in words
    on the list and not drawn, because a dashed line of no length is a dot that means nothing. */
 const links: MapLink[] = legs.filter(leg => leg.km >= 0.05).map(leg => ({ from: leg.from.zone.at, to: leg.to.zone.at }));
 const legWords = (leg: typeof legs[number]) => leg.km >= 0.05 ? `${km(leg.km)} straight line · ${leg.from.name} to ${leg.to.name}`
  : leg === legs[0] && base ? `In your base suburb, ${leg.to.name}` : `Same suburb as the stop before · ${leg.to.name}`;
 const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
 const signed = stops.filter(stop => stop.signed).length;
 const cleared = nurse ? mayTakeAVisit(nurse).allowed : false;

 const markers: MapMarker[] = [
  ...(base ? [{ id: 'base', at: base.at, kind: (cleared ? 'nurse-free' : 'nurse-blocked') as MapMarker['kind'], label: `Your base, ${base.name}` }] : []),
  ...placed.map(({ stop, zone }) => ({
   id: `stop-${stop.number}`, at: zone.at, kind: 'visit-assigned' as const, badge: String(stop.number),
   label: `Stop ${stop.number}, ${stop.service.name} in ${stop.suburb} at ${stop.start}${stop.signed ? ', signed off' : ''}`,
   selected: stop.number === chosen, onSelect: () => setChosen(stop.number)
  }))
 ];
 const summary = `Map of your day. ${base ? `Your base is drawn at the centre of ${base.name}. ` : ''}${placed.map(({ stop }) => `Stop ${stop.number} at the centre of ${stop.suburb}`).join(', ')}.${legsOn && legs.length ? ` Dashed straight lines join them in order, ${km(totalKm)} in all; they are not a road route.` : ''}`;
 const selected = stops.find(stop => stop.number === chosen) ?? stops[0];
 /* The leg into a stop: with a base, leg k ends at stop k; without one, the first stop has no leg in. */
 const legInto = (index: number) => legs[index + (base ? 0 : -1)];
 const legTo = legInto(stops.indexOf(selected));

 const card = <article className="nurse-route__card" aria-live="polite">
  <span className="nurse-route__num" aria-hidden="true">{selected.number}</span>
  <div className="nurse-route__card-say">
   <p className="nurse-eyebrow">Stop {selected.number} of {stops.length}</p>
   <h3>{selected.service.name}</h3>
   <p className="nurse-route__card-facts">
    <span><Clock3 aria-hidden="true"/>{selected.start} to {selected.end}</span>
    <span><MapPin aria-hidden="true"/>{selected.suburb}</span>
    {legTo && <span><RouteIcon aria-hidden="true"/>{legTo.km < 0.05 ? (legTo === legs[0] && base ? `In your base suburb` : `In the same suburb as the stop before`) : `${km(legTo.km)} from ${legTo.from.name}`}</span>}
   </p>
  </div>
  {selected.signed ? <Badge variant="success" size="sm"><BadgeCheck aria-hidden="true"/>Signed off</Badge>
   : next?.number === selected.number ? <Badge variant="primary" size="sm">Next</Badge> : null}
 </article>;

 return <div className="nurse-route nurse-ui">
  <p className="nurse-route__lead">Your day's stops at the centre of each suburb, in the order you visit them, with the straight line from each to the next. The list beside the map is the same day: choose a stop on either.</p>
  <NotConnected of="dispatch"/>

  {/* Counted off the list, and each one says so by being the list's own arithmetic. */}
  <dl className="nurse-route__counts">
   <div><dt>Stops today</dt><dd>{stops.length}</dd></div>
   <div><dt>Signed off</dt><dd>{signed}</dd></div>
   <div><dt>Still to go</dt><dd>{stops.length - signed}</dd></div>
   <div><dt>In straight legs</dt><dd>{km(totalKm)}</dd><small>{sentences.distanceBasis}. Not a road route.</small></div>
  </dl>

  <div className="nurse-route__grid">
   <Card padding="md" className="nurse-route__map nurse-map-panel">
    <div className="nurse-route__map-head">
     <div><h2>Today's map</h2><p>Your base and {stops.length} stops</p></div>
     <Button variant="secondary" size="sm" aria-pressed={legsOn} onClick={() => setLegsOn(!legsOn)} leadingIcon={<RouteIcon aria-hidden="true"/>}>
      {legsOn ? 'Hide the straight legs' : 'Show the straight legs'}
     </Button>
    </div>
    <LiveMap markers={markers} summary={summary} surface="staff" title="" links={legsOn ? links : []}
             fit="markers" follow layers tall overlay={card}/>
    <p className="nurse-route__refusal"><RouteIcon aria-hidden="true"/>{noRoute ? `${noRoute} ` : ''}There is no Directions button for that reason, and no travel time: the legs are measurements between suburb centres.</p>
   </Card>

   <Card padding="md" className="nurse-route__list">
    <div className="nurse-route__list-head">
     <div><h2>Today's route</h2><p>{stops.length} stops · {signed} signed off · {km(totalKm)} in straight legs</p></div>
     <TabsList aria-label="Route range">
      {(['Day', 'Week'] as const).map(r => <Tab key={r} active={range === r} aria-controls="nurse-route-range" onClick={() => setRange(r)}>{r}</Tab>)}
     </TabsList>
    </div>
    <div id="nurse-route-range" role="tabpanel" aria-label={range === 'Day' ? 'Your day' : 'Your weeks'}>
     {range === 'Day' ? <ol className="nurse-route__stops">
      {base && <li className="nurse-route__base"><span className="nurse-route__num is-base" aria-hidden="true"><Home/></span>
       <span><strong>Your base</strong><small>{base.name} · where the day's first leg is measured from</small></span></li>}
      {stops.map((stop, i) => {
       const leg = legInto(i);
       return <li key={stop.number}>
        {leg && <p className="nurse-route__leg"><span aria-hidden="true"/>{legWords(leg)}</p>}
        <button type="button" className={`nurse-route__stop${stop.number === chosen ? ' is-chosen' : ''}${stop.signed ? ' is-signed' : ''}`}
                aria-pressed={stop.number === chosen} onClick={() => setChosen(stop.number)}>
         <span className="nurse-route__num" aria-hidden="true">{stop.number}</span>
         <span className="nurse-route__stop-say">
          <strong>{stop.start} · {stop.service.name}</strong>
          <small><MapPin aria-hidden="true"/>{stop.suburb} · {stop.service.duration} min</small>
         </span>
         {stop.signed ? <Badge variant="success" size="sm">Signed</Badge> : next?.number === stop.number ? <Badge variant="primary" size="sm">Next</Badge> : null}
        </button>
       </li>;
      })}
     </ol> : <WeekBars/>}
    </div>
   </Card>
  </div>
 </div>;
}
