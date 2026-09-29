import { useState } from 'react';
import { ArrowRight, Check, CircleAlert, Clock3, MapPin, Radio, Route, ShieldCheck, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Select, StatusIndicator, Textarea, type BadgeVariant } from '../ui';
import { OfficeFacts, OfficeFigure, OfficeHead, OfficeNote, OfficeProgress, OfficeSection } from '../surface/Office';
import { NotConnected } from '../components/NotConnected';
import { VettingApplication } from './Vetting';
import { can, type VettingSubject } from '../lib/vetting';
import { seededSubjects } from '../lib/vetting-fixtures';
import { nurseById, placeOf, rosterNurses } from '../lib/roster';
import { etaFromRoute, noEta, provinceFor, routeUnavailable, straightLineEta,
 type Eta, type LatLng, type RouteResult } from '../../../../packages/geo/index.ts';
import { LiveMap, type MapMarker } from '../map/LiveMap';
import { coverage, mapWindow, marks, suburbPin, zones } from '../lib/geography';
import careApi from '../../../../packages/catalog/apis/care.json' with { type: 'json' };
import scheduling from '../../../../packages/catalog/scheduling.json' with { type: 'json' };
import { circuitsFor, shiftsFor } from '../../../../packages/engines/src/care/domain/reads.ts';
type Job = { id: string; service: string; area: string; window: string; at: LatLng; priority: 'Routine' | 'Same day' | 'Urgent' };
/* A nurse who is not sharing a position has none. That is a real state — a phone in a bag, location
   turned off between visits — and the board has to be able to say so rather than hold a number that
   came from nowhere. */
type Nurse = { id: string; name: string; area: string; at: LatLng | null; status: 'Available' | 'On a visit' | 'Off duty'; skills: string[] };

/* The map and the list are drawn from one set of coordinates now. Pixel positions used to be typed
   in beside each row, which meant the picture could stop agreeing with the arrival times and nobody
   would have anything to notice it against; a projection has only one set of numbers to be wrong
   about. packages/geo does the arithmetic, and the same file refuses a coordinate that is not in
   South Africa before it reaches either.

   The positions are fictional and deliberately blunt — three decimal places, about a hundred
   metres. The suburbs are real places; nobody lives at these points, and a preview has no business
   being precise about where a person is standing. */

const initialJobs: Job[] = [
 { id: 'TH-2049', service: 'Wound care', area: 'Soweto', window: '11:00 – 12:00', at: { lat: -26.247, lng: 27.911 }, priority: 'Same day' },
 { id: 'TH-2051', service: 'Vitals & chronic check', area: 'Randburg', window: '13:00 – 14:00', at: { lat: -26.099, lng: 28.004 }, priority: 'Routine' },
 { id: 'TH-2052', service: 'Post-operative check', area: 'Parktown', window: 'As soon as possible', at: { lat: -26.185, lng: 28.036 }, priority: 'Urgent' }
];

/* The board's nurses were five rows typed here with coordinates beside them, and the vetting console
   held nine of the same people with different fields and nothing comparing the two. They are the
   simulated roster now — packages/catalog/roster.json, read by lib/roster.ts — and the position of
   each is arithmetic on the suburb she works in rather than a coordinate somebody chose.

   Which of them has no pin is the roster's business rather than this screen's, and there are three
   different reasons for it: a phone in a bag, a suburb phase one does not reach, and a fix wider
   than the suburb it would be drawn in. All three are geography.json's own sentences, and the row
   carries the one that applies rather than a shared shrug. */
/* A nurse working outside phase one is not on this board at all. She is not hidden — the vetting
   console holds her, with her suburb and the reason she cannot be dispatched — but a dispatch board
   is a picture of one city, and drawing somebody who could never be sent to any address on it would
   make the count above it a count of people who cannot be assigned. */
const onTheBoard = rosterNurses.filter(nurse => nurse.zone).map(nurse => ({ nurse, placement: placeOf(nurse) }));
const nurses: Nurse[] = onTheBoard.map(({ nurse, placement }) => ({
 id: nurse.id,
 name: nurse.name,
 area: nurse.zoneName,
 at: placement.drawn ? placement.at : null,
 status: nurse.onAVisit ? 'On a visit' : 'Available',
 skills: nurse.scope
}));
const noPinBecause = new Map(onTheBoard.filter(entry => !entry.placement.drawn)
 .map(entry => [entry.nurse.id, (entry.placement as { refusal: string }).refusal] as const));
/* A nurse with no pin, for any of the three reasons the roster gives. The map summary a screen
   reader hears carries the reasons rather than the count alone: "two not drawn" is a number a
   controller can do nothing with. */
const unlocated = nurses.filter(n => n.status !== 'Off duty' && !n.at).length;
const province = provinceFor(mapWindow.centre)?.name ?? 'South Africa';

/* No routing provider is connected, and adding one is a decision about a vendor, a key and a
   dependency rather than a line of code. So every request for a road route comes back unavailable —
   which is also what a real provider returns when it is rate-limited, slow or down, so this is the
   path the board has been written against from its first day rather than the one nobody tries.

   packages/geo/routing.ts holds the rule the sibling project learned the hard way: an unavailable
   route is said to be unavailable. It is never quietly redrawn as the straight line between the two
   points, because a line through the buildings looks exactly like a road on a map. Nothing is drawn
   here. What the board does instead is ask a different question, by name, and print the answer with
   its basis attached to it: how far is that in a straight line, at a speed the code can point at. */
const routeFor = (_nurse: Nurse, _job: Job): RouteResult =>
 routeUnavailable('No routing provider is connected, so no road route can be drawn or timed.');
function etaFor(nurse: Nurse, job: Job): Eta {
 const measured = etaFromRoute(routeFor(nurse, job));
 if (measured.minutes !== null) return measured;
 /* A nurse mid-visit has a position, so a straight line would happily produce a number — and the
    number would be a lie, because what decides the arrival is when that visit ends, and nothing
    here knows that. An estimate with no basis is worth less than the word "estimating". */
 if (nurse.status === 'On a visit') return noEta('On a visit. Nothing here knows when that ends, so there is nothing to estimate from.');
 /* The coordinate layer refuses a missing position on its own, but it refuses it in its own words —
    "no coordinate was given" is a sentence for whoever is fixing the feed, not for whoever is
    deciding who to send. Both are true; the row gets the one an operator can act on. */
 if (!nurse.at) return noEta(noPinBecause.get(nurse.id) ?? 'No position is being shared by this nurse’s device, so there is nothing to measure from.');
 return straightLineEta(nurse.at, job.at, { sourceLabel: `dispatch:${nurse.id}` });
}
/* "Estimating" is a word rather than a dash, because an empty cell reads as nothing at all to a
   screen reader and a dash reads as one. The basis follows on the next line in both cases, so a
   number never appears on this board without the thing it was derived from. */
const arrivalLine = (eta: Eta) => eta.minutes === null ? 'Arrival estimating' : `About ${eta.minutes} min away`;
const basisLine = (eta: Eta) =>
 eta.basis === 'straight-line' ? `Straight line over ${(eta.distanceKm ?? 0).toFixed(1)} km at ${eta.speedKmh} km/h — not a road route.`
  : eta.basis === 'last-known-route' ? `Last measured road route, ${Math.round((eta.ageSeconds ?? 0) / 60)} min old.`
   : eta.basis === 'route' ? 'Measured road route.'
    : eta.reason ?? 'Nothing to estimate from.';

/* The board asks the vetting module before it offers anybody. A nurse whose clearance lapsed still
   appears — hiding her would leave an operator wondering where she went — but she cannot be
   assigned, and the refusal is on the row rather than in a tooltip. */
/* `heading` because the board is rendered in two places: as a workspace section, where it is the
   page and heads itself, and inside the back office's Operations tab, where the page is already
   headed "Operations". Two h1 elements on one document is not a heading, it is a reader guessing
   which one is the page — so the console asks for the live count line without the title over it. */
export function DispatchBoard({ subjects = seededSubjects, heading = true }: { subjects?: VettingSubject[]; heading?: boolean } = {}) {
 const [selected, setSelected] = useState<string>(initialJobs[0].id);
 const [assigned, setAssigned] = useState<Record<string, string>>({});
 /* Assigning used to change a word on a row and nothing else: the visit stayed in "Awaiting
    assignment", the counts stayed the same, and nothing anywhere on the screen said what would
    happen to it next. A board is a thing that moves.
    It moves in three places now, and the confirmation stays where the operator's hand already is:
    the row they pressed still reads "Assigned" and the status line above it still names the nurse,
    because a confirmation that jumps somewhere else is a confirmation nobody reads. What is added
    is the tab marked done, the count in the heading, and the list below with what would happen to
    the visit next — and a deliberate way on to the next one still waiting, rather than the screen
    deciding for them. */
 const waiting = initialJobs.filter(j => !assigned[j.id]);
 const dispatched = initialJobs.filter(j => assigned[j.id]);
 const job = initialJobs.find(j => j.id === selected)!;
 const nextWaiting = initialJobs.find(j => j.id !== job.id && !assigned[j.id]);
 const send = (id: string, nurse: string) =>
  setAssigned(current => ({ ...current, [id]: current[id] === nurse ? '' : nurse }));
 const recall = (id: string) => {
  setAssigned(current => { const rest = { ...current }; delete rest[id]; return rest; });
  setSelected(id);
 };
 const gate = (name: string) => {
  const subject = subjects.find(s => s.name === name);
  return subject ? can(subject, 'take-visit') : { allowed: false, reason: 'No vetting record. Nobody without one is offered a visit.', blockedBy: [] };
 };
 /* Nearest first, and a nurse with no estimate sorts last rather than sorting as though she were
    nought minutes away. She is still on the board and still assignable — an operator who knows she
    is around the corner knows more than this screen does. */
 const candidates = nurses.filter(n => n.status !== 'Off duty').map(n => ({ nurse: n, decision: gate(n.name), eta: etaFor(n, job) }))
  .sort((a, b) => Number(b.decision.allowed) - Number(a.decision.allowed) || (a.eta.minutes ?? Infinity) - (b.eta.minutes ?? Infinity));
 const dispatchable = candidates.filter(c => c.decision.allowed && c.nurse.status === 'Available').length;
 const refused = candidates.filter(c => !c.decision.allowed).length;
 const estimating = candidates.filter(c => c.eta.minutes === null).length;
 /* The map and the list are the same information, so the marks are built here beside the counts
    rather than inside the map. A visit is plotted at the centre of the suburb it is in and never at
    the coordinate the job carries: a home address beside a health service is not a location, it is
    a diagnosis with a doorstep, and the controller assigning this needs the suburb. The nurse going
    there gets the address inside the visit, where it belongs. */
 const markers: MapMarker[] = [
  ...nurses.filter(n => n.status !== 'Off duty').map(n => ({
   id: n.id,
   at: n.at,
   kind: (!gate(n.name).allowed ? 'nurse-blocked' : n.status === 'Available' ? 'nurse-free' : 'nurse-busy') as MapMarker['kind'],
   label: `${n.name}, ${n.area} — ${!gate(n.name).allowed ? 'blocked by vetting' : n.status.toLowerCase()}`
  })),
  ...initialJobs.map(j => ({
   id: j.id,
   at: suburbPin(j.area) ?? null,
   kind: (assigned[j.id] ? 'visit-assigned' : 'visit-waiting') as MapMarker['kind'],
   label: `${j.id}, ${j.service} in ${j.area} — ${assigned[j.id] ? `assigned to ${assigned[j.id]}` : 'awaiting a nurse'}`,
   selected: j.id === selected,
   onSelect: () => setSelected(j.id)
  }))
 ];
 const summary = `Dispatch map of ${coverage.city}, ${province}. ${waiting.length} visits awaiting assignment across ${zones.map(z => z.name).join(', ')}. ${dispatchable} nurses available and cleared by vetting, ${refused} blocked by vetting${unlocated ? `, ${unlocated} not drawn — ${[...new Set(noPinBecause.values())].join(' ')}` : ''}.`;
 const standing = `${waiting.length ? `${waiting.length} visits awaiting a nurse` : 'Every visit has a nurse'} · ${dispatchable} cleared for dispatch${refused ? ` · ${refused} refused by vetting` : ''}${dispatched.length ? ` · ${dispatched.length} sent` : ''}`;
 const assignedTo = assigned[job.id];
 return <div className="oi-screen oi-dispatch">
  {heading
   ? <OfficeHead title="Dispatch" lead={standing}/>
   : <div className="oi-section-head board-title"><h2 className="oi-section-title">Live dispatch</h2><p className="oi-section-note">{standing}</p></div>}
  <NotConnected of="dispatch"/>
  <div className="oi-split dispatch-grid">
   <Card className="oi-map-card">
    <CardHeader><CardTitle>{coverage.city}</CardTitle><CardDescription>{province}</CardDescription></CardHeader>
    <CardContent className="oi-card-body">
     <LiveMap markers={markers} summary={summary} height={340} surface="staff"/>
     {/* The key is the contract's list of marks, not a second list typed beside the map. The two
         used to be written separately, and when the pins started reading the contract the key went
         on describing colours that were no longer on the board. */}
     <ul className="oi-map-key" aria-label="Map key">{marks.filter(m => m.id !== 'zone').map(m =>
      <li key={m.id}><i aria-hidden="true" className={`key-${m.id}`}/>{m.name}</li>)}</ul>
     <p className="oi-help">The map is a picture of the same information in the list beside it — every pin is projected from the coordinates the arrival estimates are measured from, so the two cannot drift apart. Everything can be dispatched from the list alone, with a keyboard.</p>
     {/* One line per reason rather than one count over all of them. "Two nurses have no pin" tells a
         controller nothing they can act on; "her phone is telling us nothing" and "her device is
         reporting a position wider than Melville" are different problems with different answers. */}
     {[...noPinBecause.values()].filter((sentence, index, all) => all.indexOf(sentence) === index)
       .map(sentence => <OfficeNote key={sentence} icon={<MapPin aria-hidden="true"/>}>{sentence} They are in the list with the reason given, and can still be assigned from it.</OfficeNote>)}
    </CardContent>
   </Card>
   <Card className="oi-assign-card">
    <CardHeader>
     <CardTitle>{waiting.length ? `Awaiting assignment · ${waiting.length}` : 'Nothing waiting'}</CardTitle>
     {/* A visit that has been sent stays on the strip with a tick rather than vanishing from it. An
         operator working a board needs to see what they have already done as well as what is left,
         and a row that disappears the moment it is pressed is how a double assignment happens. */}
     <div className="ui-tabs oi-segment" role="group" aria-label="Visits on the board">{initialJobs.map(j =>
      <button key={j.id} type="button" className={`ui-tab${selected === j.id ? ' ui-tab--active' : ''}`} aria-pressed={selected === j.id} onClick={() => setSelected(j.id)}>
       {assigned[j.id] && <Check aria-hidden="true"/>}{j.id}
      </button>)}</div>
    </CardHeader>
    <CardContent className="oi-card-body">
     <OfficeFacts facts={[
      ['Service', job.service],
      ['Area', <><MapPin aria-hidden="true"/>{job.area}</>],
      ['Window', <><Clock3 aria-hidden="true"/>{job.window}</>],
      ['Priority', job.priority === 'Urgent' ? <Badge variant="danger" dot>Urgent</Badge> : job.priority],
      ['Status', assignedTo ? <><Check aria-hidden="true"/>Assigned to {assignedTo}</> : 'Unassigned']
     ]}/>
     {assignedTo && <p className="oi-help">Assigning somebody else moves the visit rather than adding a second nurse to it, and <em>Unassign</em> puts it back on the board with nothing recorded against her.</p>}
     {assignedTo && <Alert variant="success" title={`${job.id} is with ${assignedTo}.`} className="next-step">
      <p>{nextWaiting ? `${waiting.length} still waiting on this board.` : 'Nothing else on this board is waiting.'} What would happen to this one next is in the list at the foot of the screen.</p>
      {nextWaiting && <Button variant="primary" className="oi-alert-action" onClick={() => setSelected(nextWaiting.id)} trailingIcon={<ArrowRight aria-hidden="true"/>}>Next visit waiting</Button>}
     </Alert>}
     <div className="oi-stack">
      <h3 className="oi-subtitle">Nearest available nurses</h3>
      <p className="oi-help" role="status">{dispatchable} cleared for dispatch{refused ? `, ${refused} refused by vetting` : ''}{estimating ? `, ${estimating} with no arrival estimate` : ''}.</p>
     </div>
    </CardContent>
    {/* `record-row static` stays on each candidate as a name the journeys find her by; office-identity.css
        takes its old look back off it, so what is drawn is the compact row and nothing else. */}
    <ul className="oi-rows oi-candidates">{candidates.map(({ nurse: n, decision, eta }) => <li key={n.id}><div className="oi-row record-row static">
     <div className="oi-row__body">
      <p className="oi-row__title">{n.name}</p>
      <span className="oi-row__meta">{n.area} · {arrivalLine(eta)}</span>
      <span className="oi-row__meta">{basisLine(eta)}</span>
      <span className="oi-row__meta">{n.skills.join(' · ')}</span>
      {!decision.allowed && <span className="oi-row__meta oi-row__meta--refusal">{decision.reason}</span>}
     </div>
     <div className="oi-row__aside">
      <StatusIndicator status={!decision.allowed ? 'offline' : n.status === 'Available' ? 'online' : 'busy'} label={decision.allowed ? n.status : 'Blocked by vetting'}/>
      {/* The assigned nurse's control says what pressing it does. It was a button reading "Assigned"
          that un-assigned her — a state label with an action hidden inside it, which is why the
          audit found no way back from an assignment: there was one, and nothing on the screen said
          so. The state is now the tick beside the name and the button is the verb. */}
      {decision.allowed
       ? assignedTo === n.name
        ? <Button variant="ghost" aria-label={`Unassign ${n.name} from ${job.id}`} onClick={() => send(job.id, n.name)} leadingIcon={<Undo2 aria-hidden="true"/>}>Unassign</Button>
        : <Button variant="secondary" disabled={n.status !== 'Available'} onClick={() => send(job.id, n.name)}>{assignedTo ? 'Assign instead' : 'Assign'}</Button>
       : <Button variant="secondary" disabled aria-label={`Cannot be assigned — ${n.name}. ${decision.reason}`}>Cannot be assigned</Button>}
     </div>
    </div></li>)}</ul>
    <CardContent className="oi-notes">
     <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>Vetting is asked before a name is offered, not after. The Control Tower has no override for a lapsed clearance — there is no button here that would let one be granted.</OfficeNote>
     <OfficeNote icon={<Radio aria-hidden="true"/>}>Estimated arrival is a straight-line distance, not a road route. Assignment weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse — none of which a straight line knows.</OfficeNote>
     <OfficeNote icon={<Route aria-hidden="true"/>}>No routing provider is connected, so no road route is drawn and no arrival time is claimed from one. When one is added, a route it cannot give will be shown as unavailable rather than replaced by the straight line above.</OfficeNote>
    </CardContent>
   </Card>
  </div>
  {/* Where an assigned visit goes, and what would happen to it next if any of this were connected.
      A board that only ever shows what is waiting cannot tell an operator whether the thing they
      just did worked — and "worked" here means a specific sequence of five things, none of which
      MyThuso can do yet. Saying them in order is what makes the gap legible rather than invisible. */}
  {dispatched.length > 0 && <OfficeSection title={`Sent · ${dispatched.length}`}>
   <Card className="dispatch-sent"><ul className="oi-rows">{dispatched.map(j => <li key={j.id}><div className="oi-row">
    <div className="oi-row__body"><p className="oi-row__title">{j.id} · {j.service}</p><span className="oi-row__meta">{assigned[j.id]} · {j.area} · {j.window}</span>
     <span className="oi-row__meta">Next: the nurse is offered the visit and accepts it, the patient is told who is coming, a six-digit visit code is issued to the patient for the doorstep, the nurse's arrival is tracked against the window, and the visit opens as an assessment when she is there.</span></div>
    <div className="oi-row__aside"><Badge variant="success" dot>Assigned</Badge><Button variant="secondary" onClick={() => recall(j.id)} leadingIcon={<Undo2 aria-hidden="true"/>}>Recall</Button></div>
   </div></li>)}</ul></Card>
   <OfficeNote refusal icon={<Radio aria-hidden="true"/>}>Nothing above has been sent. No nurse is notified, no patient is told, no code is issued and no visit is opened — dispatch is not connected, and an assignment here moves a row on this screen and nothing else.</OfficeNote>
  </OfficeSection>}
 </div>;
}
/* GET /v1/care/shifts@1 and GET /v1/care/circuits@1, closed in Wave 6: drawn thinly from the same
 * arithmetic the engine runs (packages/engines/src/care/domain/reads.ts), never a second copy of a
 * shift or a circuit typed on this screen. A dispatcher reads every nurse's day here — the arithmetic
 * in engine.ts is what refuses a nurse or a locum everybody else's; this board is the dispatcher's own
 * view and has nothing to refuse. The circuit list answers the contract's own sentence, word for word,
 * because every circuit packages/catalog/care.json names is still draft: nobody has agreed to run one. */
const careRouteRefusal = (path: string, version: number, id: string): string => {
 const route = careApi.routes.find(r => r.method === 'GET' && r.path === path && r.version === version);
 const found = route?.refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/apis/care.json's GET ${path}@${version} declares no refusal "${id}".`);
 return found.statement;
};
const clockOf = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: scheduling.timezone });

export function ShiftBoard() {
 const shifts = shiftsFor(new Date());
 const firstDay = shifts[0]?.date;
 const today = shifts.filter(s => s.date === firstDay);
 const published = circuitsFor().filter(c => c.published);
 return <div className="oi-screen">
  <OfficeSection title={`Shifts · ${firstDay}`} note={`${today.length} nurses rostered, from the hours the product actually offers rather than two times typed here.`}>
   {/* A distinct row from the dispatch list's candidates: the "Nearest available nurses" list above
       already carries every one of these names, and a shared selector would resolve to two rows for
       the same nurse rather than one. */}
   <Card className="shift-board-panel"><ul className="oi-rows">{today.map(s => <li key={s.shiftRef}><div className="oi-row shift-row">
    <div className="oi-row__body"><p className="oi-row__title">{nurseById(s.clinicianRef)?.name ?? s.clinicianRef}</p><span className="oi-row__meta">{s.zone}</span></div>
    <span className="oi-row__figure">{clockOf(s.startsAt)} – {clockOf(s.endsAt)}</span>
   </div></li>)}</ul></Card>
  </OfficeSection>
  <OfficeSection title="Rural circuits">
   {published.length
    ? <Card className="circuit-board-panel"><ul className="oi-rows">{published.map(c => <li key={c.circuitId}><div className="oi-row shift-row"><div className="oi-row__body"><p className="oi-row__title">{c.name}</p><span className="oi-row__meta">{c.zone}</span></div></div></li>)}</ul></Card>
    : <OfficeNote icon={<Route aria-hidden="true"/>} role="status">{careRouteRefusal('/v1/care/circuits', 1, 'circuit-not-published')}</OfficeNote>}
  </OfficeSection>
 </div>;
}

const incidents = [
 { id: 'INC-014', title: 'Nurse could not gain access at the address', severity: 'Medium', area: 'Soweto', opened: '09:52', status: 'Triage' },
 { id: 'INC-015', title: 'Patient reported chest pain during a routine visit', severity: 'Critical', area: 'Parktown', opened: '10:31', status: 'Escalated' },
 { id: 'INC-016', title: 'Sample seal found damaged on courier handover', severity: 'High', area: 'Rosebank', opened: '11:04', status: 'Open' }
];
/* Counted from the same arrays the boards draw, for the same reason: the strip above a dispatch
   board said "3 open incidents · 1 severity high" while the board under it listed one critical and
   one high. Both were typed, and they disagreed. */
export const controlTowerCounts = () => ({
 waiting: initialJobs.length,
 nurses: nurses.filter(n => n.status !== 'Off duty').length,
 offDuty: nurses.filter(n => n.status === 'Off duty').length,
 incidents: incidents.length,
 critical: incidents.filter(i => i.severity === 'Critical').length,
 high: incidents.filter(i => i.severity === 'High').length
});
/* The Control Tower's strip, in one place. It was the Control Tower branch of the staff shell's
   metricsOf, and the merged portal draws the same three figures over the same two boards — so the
   strip moved here, beside the counts it is made of, and both shells read it rather than each keeping
   a copy that could start to disagree. scripts/check-boundaries.mjs scans this block for a typed
   figure exactly as it scans the shell's. */
type TowerFigure = { label: string; value: string; chip: string; flagged: boolean };
export const controlTowerFigures = (): TowerFigure[] => {
 const c = controlTowerCounts();
 return [{ label: 'Visits on the board', value: String(c.waiting), chip: 'Awaiting a nurse', flagged: false },
         { label: 'Nurses on duty', value: String(c.nurses), chip: `${c.offDuty} off duty`, flagged: false },
         { label: 'Open incidents', value: String(c.incidents), chip: c.critical ? `${c.critical} critical` : `${c.high} high`, flagged: c.critical > 0 }];
};
/* Severity is what a controller picks the next incident by, so it decides the order of the board and
   it is a column rather than the first word of a sentence. Written down here because a board that
   sorts by reference sorts by the order somebody happened to open things in: INC-015 is the chest
   pain, and it was sitting under a nurse who could not get through a gate. */
const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];
const bySeverity = (a: { severity: string; opened: string }, b: { severity: string; opened: string }) =>
 SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.opened.localeCompare(b.opened);
export function IncidentBoard({ open, notice = true }: { open: (s: string) => void; notice?: boolean }) {
 return <Card className="incident-panel">
  {/* The severity word stays on the row as a Badge. Colour is never the only thing separating a
      critical incident from a medium one: the word is what a reader who cannot see the colour gets. */}
  <ol className="oi-rows incident-list">{[...incidents].sort(bySeverity).map(i =>
   <li key={i.id}><button type="button" className={`oi-row oi-incident sev-${i.severity.toLowerCase()}`} onClick={() => open(`Incident ${i.id}`)}>
    <span className="oi-row__body">
     <span className="oi-row__title">{i.title}</span>
     <span className="oi-row__meta">{i.id} · {i.area} · {i.status} · opened {i.opened}</span>
    </span>
    <span className="oi-row__aside"><Badge variant={severityBadge(i.severity)} dot={i.severity === 'Critical'}>{i.severity}</Badge><ArrowRight aria-hidden="true" className="oi-row__go"/></span>
   </button></li>)}</ol>
  {/* Off only where the field-safety queue stands above this board and already carries the same
      notice: one sentence a screen, not the same one twice. */}
  {notice && <CardContent><NotConnected of="dispatch" tone="inline"/></CardContent>}
 </Card>;
}
/* Critical is the one filled word; high is the warning tint; the rest are neutral. Two filled words on
   one board would be two things shouting. */
const severityBadge = (severity: string): BadgeVariant => severity === 'Critical' ? 'danger' : severity === 'High' ? 'warning' : 'neutral';
export function IncidentDetail({ reference = 'INC-015', onClose }: { reference?: string; onClose: () => void }) {
 const incident = incidents.find(i => i.id === reference) ?? incidents[1];
 /* Whoever is working the suburb the incident is in. It was a name typed beside a party id, which
    is two copies of a person on a screen that already reads the roster three lines above. */
 const reporter = rosterNurses.find(nurse => nurse.zoneName === incident.area) ?? rosterNurses[0];
 const [severity, setSeverity] = useState(incident.severity);
 const [action, setAction] = useState('');
 const [notes, setNotes] = useState('');
 const [logged, setLogged] = useState<string[]>([]);
 const time = () => new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
 return <div className="oi-screen oi-incident-detail">
  <div className="oi-card-head"><div><p className="oi-eyebrow">{incident.id}</p><h3 className="oi-section-title">{incident.title}</h3></div><Badge variant={severityBadge(severity)}>{severity}</Badge></div>
  <NotConnected of="dispatch"/>
  <OfficeFacts facts={[['Opened', `${incident.opened} · ${incident.area}`], ['Reported by', `${reporter.name} · ${reporter.id}`]]}/>
  <Field label="Severity" htmlFor="incident-severity"><Select id="incident-severity" value={severity} onChange={e => setSeverity(e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></Select></Field>
  {severity === 'Critical' && <Alert variant="danger" title="A critical incident pages the on-call clinical lead immediately.">The form is never a prerequisite for calling emergency services.</Alert>}
  <Field label="Immediate action" htmlFor="incident-action"><Select id="incident-action" value={action} onChange={e => setAction(e.target.value)}><option value="">Choose an action…</option>
   <option>Call the nurse now</option><option>Advise nurse to call emergency services</option><option>Escalate to the on-call clinical lead</option><option>Notify the patient’s emergency contact</option><option>Reassign the visit</option><option>Stand down — no further action</option></Select></Field>
  <Field label="Handover note" htmlFor="incident-note"><Textarea id="incident-note" value={notes} onChange={e => setNotes(e.target.value.slice(0, 600))} placeholder="What happened, what you did, what the next shift must know…"/></Field>
  <div className="oi-actions"><Button variant="secondary" disabled={!action} onClick={() => { setLogged([...logged, `${time()} · ${action}`]); setAction(''); }} leadingIcon={<Check aria-hidden="true"/>}>Add this action to the log</Button></div>
  {logged.length > 0 && <Card><ol className="oi-rows" aria-label="Incident log">{logged.map(l => <li key={l}><div className="oi-row"><div className="oi-row__body"><p className="oi-row__title">{l.split(' · ')[1]}</p><span className="oi-row__meta">{l.split(' · ')[0]} · You, as duty controller</span></div></div></li>)}</ol></Card>}
  <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>An incident log is append-only. An entry may be corrected by a later entry and never by editing the one before it.</OfficeNote>
  <Button variant="primary" className="oi-full" onClick={onClose} trailingIcon={<ArrowRight aria-hidden="true"/>}>Close this incident</Button>
 </div>;
}
/* Nurse vetting is one role in a twelve-role module now, so this is the same flow with the role
   already chosen. The wiring in App.tsx keeps working, and there is only one applicant flow to
   keep in step with packages/catalog/vetting.json. */
export function NurseVetting({ onClose }: { onClose: () => void }) {
 return <VettingApplication roleId="nurse" onClose={onClose}/>;
}

/* ---- The board a board asks for -----------------------------------------------------------------
 *
 * "Quality" was a card with a button that opened a dialog saying nothing happens. It is the section
 * the Control Tower is measured on, and the four things in it are not a mystery: what went wrong,
 * how long people waited, what patients said afterwards, and what any of that is worth.
 *
 * The incident figures are counted from the same array the incident board draws, so this screen and
 * that one cannot disagree. The arrival, complaint and revenue figures are sample data and are
 * marked as such — a quality board that quietly mixes counted numbers with invented ones is the
 * worst of the two, so the ones that are counted say so and the ones that are not say that.
 */
const arrivals = [
 { window: 'Inside the booked window', visits: 71, of: 84 },
 { window: 'Up to 15 minutes late', visits: 9, of: 84 },
 { window: 'More than 15 minutes late', visits: 3, of: 84 },
 { window: 'Did not arrive', visits: 1, of: 84 }
];
const complaints = [
 { id: 'CX-0031', what: 'Nurse arrived without the dressing pack the visit needed', state: 'Upheld · kit list changed for wound care', severity: 'Medium' },
 { id: 'CX-0032', what: 'Patient was not told the visit had been reassigned', state: 'Upheld · notification is a gap, not a mistake', severity: 'Medium' },
 { id: 'CX-0033', what: 'Charged for a visit the patient says did not happen', state: 'Open · with finance and the Control Tower', severity: 'High' }
];
export function QualityBoard({ open }: { open: (s: string) => void }) {
 const critical = incidents.filter(i => i.severity === 'Critical').length;
 const high = incidents.filter(i => i.severity === 'High').length;
 const onTime = arrivals[0];
 const upheld = complaints.filter(c => c.state.startsWith('Upheld')).length;
 return <div className="oi-screen">
  <OfficeHead eyebrow="Control Tower" title="Quality" lead="Complaints, incidents, arrival times and what they move — the numbers a board asks for before it asks for anything else."/>
  {/* One flagged figure on the screen, and it is the incident with a critical on it. Two flagged
      figures is two things shouting, and the whole of what `flagged` means is "this one". */}
  <div className="oi-figures">
   <OfficeFigure label="Arrived inside the window" value={`${Math.round(onTime.visits / onTime.of * 100)}%`} note={`${onTime.visits} of ${onTime.of} visits · sample data`}/>
   <OfficeFigure label="Open incidents" value={String(incidents.length)} note={critical ? `${critical} critical` : `${high} high`} flagged={critical > 0}/>
   <OfficeFigure label="Complaints this week" value={String(complaints.length)} note={`${upheld} upheld · sample data`}/>
   <OfficeFigure label="Visits not arrived" value={String(arrivals[3].visits)} note="Each one is an incident"/>
  </div>
  <NotConnected of="dispatch"/>
  <OfficeSection title="Arrival against the booked window">
   <Card className="oi-table-wrap">
    {/* The two numeric columns are read down rather than along, right-aligned and tabular. The share
        carries a bar in the progress colour as well as a percentage — four numbers between 1 and 85
        are a distribution, and a distribution is the one thing a bar says faster than a figure. */}
    <table className="oi-table arrival-table">
     <caption>Sample data. Nothing in this build measures an arrival, because no visit is dispatched and no nurse’s position is being read.</caption>
     <thead><tr><th scope="col">Arrival</th><th scope="col" className="is-figure">Visits</th><th scope="col">Share</th></tr></thead>
     <tbody>{arrivals.map(a => { const share = Math.round(a.visits / a.of * 100); return <tr key={a.window} className={a.window === 'Did not arrive' ? 'is-flagged' : ''}>
      <th scope="row">{a.window}</th><td className="is-figure">{a.visits}</td>
      <td><span className="oi-share"><span className="is-figure">{share}%</span><OfficeProgress part={a.visits} whole={a.of} label={`${share}% of visits`}/></span></td>
     </tr>; })}</tbody>
    </table>
   </Card>
   <OfficeNote icon={<Clock3 aria-hidden="true"/>}>A window is what the patient was told, so it is what lateness is measured against — never the time the visit was assigned, which is a number the Control Tower controls and could improve by moving.</OfficeNote>
  </OfficeSection>
  <OfficeSection title="Complaints">
   <Card><ul className="oi-rows">{complaints.map(c => <li key={c.id}><div className="oi-row">
    <div className="oi-row__body"><p className="oi-row__title">{c.id} · {c.what}</p><span className="oi-row__meta">{c.state}</span></div>
    <div className="oi-row__aside"><Badge variant={severityBadge(c.severity)}>{c.severity}</Badge></div>
   </div></li>)}</ul></Card>
   <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>A complaint upheld against a nurse never touches money she has already earned. Suspension stops what is sent to her next; it does not reach backwards into a payout.</OfficeNote>
  </OfficeSection>
  <OfficeSection title="Incidents behind these numbers">
   <IncidentBoard open={open}/>
   <OfficeNote icon={<CircleAlert aria-hidden="true"/>}>These counts are read from the same incidents the board above draws, so this screen and that one cannot come to disagree. The arrival, complaint and revenue figures are sample data and are marked where they appear.</OfficeNote>
  </OfficeSection>
 </div>;
}
