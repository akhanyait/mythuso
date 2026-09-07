import { useState } from 'react';
import { ArrowRight, Check, CircleAlert, Clock3, MapPin, Radio, Route, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Pill } from '../components/UI';
import { StateBlock, StatePicker, type LoadState } from '../components/States';
import { VettingApplication } from './Vetting';
import { can, type VettingSubject } from '../lib/vetting';
import { seededSubjects } from '../lib/vetting-fixtures';
import { etaFromRoute, kmToBoxUnits, noEta, projectToSquare, provinceFor, routeUnavailable, straightLineEta,
 type Eta, type LatLng, type MapWindow, type RouteResult } from '../../../../packages/geo/index.ts';
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
const mapWindow: MapWindow = { centre: { lat: -26.172, lng: 27.992 }, spanKm: 28 };
const plot = (p: LatLng) => projectToSquare(p, mapWindow);
const zones = [
 { name: 'Randburg', at: { lat: -26.094, lng: 27.999 }, radiusKm: 3.0 }, { name: 'Rosebank', at: { lat: -26.146, lng: 28.042 }, radiusKm: 2.4 },
 { name: 'Parktown', at: { lat: -26.184, lng: 28.040 }, radiusKm: 2.2 }, { name: 'Melville', at: { lat: -26.175, lng: 27.999 }, radiusKm: 2.2 },
 { name: 'Soweto', at: { lat: -26.249, lng: 27.908 }, radiusKm: 4.0 }
].map(z => ({ ...z, point: plot(z.at), r: kmToBoxUnits(z.radiusKm, mapWindow) }));
const initialJobs: Job[] = [
 { id: 'TH-2049', service: 'Wound care', area: 'Soweto', window: '11:00 – 12:00', at: { lat: -26.247, lng: 27.911 }, priority: 'Same day' },
 { id: 'TH-2051', service: 'Vitals & chronic check', area: 'Randburg', window: '13:00 – 14:00', at: { lat: -26.099, lng: 28.004 }, priority: 'Routine' },
 { id: 'TH-2052', service: 'Post-operative check', area: 'Parktown', window: 'As soon as possible', at: { lat: -26.185, lng: 28.036 }, priority: 'Urgent' }
];
const nurses: Nurse[] = [
 { id: 'N-114', name: 'Sister Naledi Mokoena', area: 'Rosebank', at: { lat: -26.150, lng: 28.046 }, status: 'Available', skills: ['Wound care', 'Chronic care'] },
 { id: 'N-108', name: 'Sister Palesa Khumalo', area: 'Soweto', at: { lat: -26.253, lng: 27.904 }, status: 'Available', skills: ['Wound care', 'Maternal'] },
 { id: 'N-121', name: 'Brother Sipho Ndlovu', area: 'Melville', at: { lat: -26.171, lng: 27.995 }, status: 'On a visit', skills: ['Post-operative', 'Chronic care'] },
 { id: 'N-133', name: 'Sister Refilwe Sithole', area: 'Randburg', at: null, status: 'Available', skills: ['Chronic care', 'Paediatric'] },
 { id: 'N-204', name: 'Sister Ayanda Dube', area: 'Soweto', at: { lat: -26.240, lng: 27.916 }, status: 'Available', skills: ['Elderly care', 'Chronic care'] }
];
const located = nurses.flatMap(n => n.at ? [{ ...n, point: plot(n.at) }] : []);
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
 routeUnavailable('No routing provider is connected in this preview.');
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
 if (!nurse.at) return noEta('No position is being shared by this nurse’s device, so there is nothing to measure from.');
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
export function DispatchBoard({ subjects = seededSubjects }: { subjects?: VettingSubject[] } = {}) {
 const [state, setState] = useState<LoadState>('ready');
 const [selected, setSelected] = useState(initialJobs[0].id);
 const [assigned, setAssigned] = useState<Record<string, string>>({});
 const job = initialJobs.find(j => j.id === selected)!;
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
 const summary = `Demonstration dispatch map of northern Johannesburg, ${province}. ${initialJobs.length} visits awaiting assignment across ${zones.map(z => z.name).join(', ')}. ${dispatchable} nurses available and cleared by vetting, ${refused} blocked by vetting${unlocated ? `, ${unlocated} not drawn because no position is being shared` : ''}. All positions are fictional.`;
 return <>
  <StatePicker label="Preview the dispatch feed state" value={state} onChange={setState}/>
  <StateBlock state={state} subject="The live dispatch feed" permission="location sharing from nurse devices" onRetry={() => setState('ready')}>
   <div className="dispatch-grid">
    <div className="panel map-panel">
     <div className="section-title"><h2>Live dispatch · Demo</h2><Pill><span className="status-dot"/>Fictional positions</Pill></div>
     <svg className="dispatch-map" viewBox="0 0 100 100" role="img" aria-label={summary}>
      <rect width="100" height="100" className="map-ground"/>
      {[20, 40, 60, 80].map(n => <g key={n}><line x1="0" y1={n} x2="100" y2={n} className="map-grid"/><line x1={n} y1="0" x2={n} y2="100" className="map-grid"/></g>)}
      {zones.map(z => <circle key={z.name} cx={z.point.x} cy={z.point.y} r={z.r} className="map-zone"/>)}
      {located.map(n => <g key={n.id} className={`map-pin nurse ${!gate(n.name).allowed ? 'blocked' : n.status === 'Available' ? 'free' : 'busy'}`}><circle cx={n.point.x} cy={n.point.y} r="2.4"/><circle cx={n.point.x} cy={n.point.y} r="4.6" className="map-halo"/></g>)}
      {initialJobs.map(j => { const p = plot(j.at); return <g key={j.id} className={`map-pin job ${j.id === selected ? 'selected' : ''} ${assigned[j.id] ? 'assigned' : ''}`}><rect x={p.x - 2.2} y={p.y - 2.2} width="4.4" height="4.4" rx="1.2"/>{j.id === selected && <circle cx={p.x} cy={p.y} r="7" className="map-focus"/>}</g>; })}
      {zones.map(z => <text key={z.name} x={z.point.x} y={z.point.y - z.r + 4.4} className="map-label">{z.name}</text>)}
     </svg>
     <div className="map-key"><span><i className="key-free"/>Nurse available</span><span><i className="key-busy"/>Nurse on a visit</span><span><i className="key-blocked"/>Blocked by vetting</span><span><i className="key-job"/>Visit awaiting a nurse</span><span><i className="key-assigned"/>Assigned</span></div>
     <p className="helper">The map is a picture of the same information in the list beside it — every pin is projected from the coordinates the arrival estimates are measured from, so the two cannot drift apart. Everything can be dispatched from the list alone, with a keyboard.</p>
     {unlocated > 0 && <p className="helper">{unlocated === 1 ? 'One nurse has no pin, because that device is not sharing a position.' : `${unlocated} nurses have no pin, because those devices are not sharing a position.`} They are in the list with the reason given, and can still be assigned from it.</p>}
    </div>
    <div className="panel">
     <div className="section-title"><h2>Awaiting assignment</h2></div>
     <div className="tabs" role="group" aria-label="Visits awaiting assignment">{initialJobs.map(j => <button key={j.id} className={selected === j.id ? 'selected' : ''} aria-pressed={selected === j.id} onClick={() => setSelected(j.id)}>{j.id}</button>)}</div>
     <div className="review-line"><span>Service</span><strong>{job.service}</strong></div>
     <div className="review-line"><span>Area</span><strong><MapPin size={14}/> {job.area}</strong></div>
     <div className="review-line"><span>Window</span><strong><Clock3 size={14}/> {job.window}</strong></div>
     <div className="review-line"><span>Priority</span><strong className={job.priority === 'Urgent' ? 'flagged' : ''}>{job.priority}</strong></div>
     <div className="review-line"><span>Status</span><strong>{assigned[job.id] ? `Assigned to ${assigned[job.id]}` : 'Unassigned'}</strong></div>
     <h3 className="space-top">Nearest available nurses</h3>
     <p className="helper" role="status">{dispatchable} cleared for dispatch{refused ? `, ${refused} refused by vetting` : ''}{estimating ? `, ${estimating} with no arrival estimate` : ''}.</p>
     {candidates.map(({ nurse: n, decision, eta }) => <div className="record-row static" key={n.id}>
      <span className={`status-dot ${n.status === 'Available' && decision.allowed ? '' : 'offline'}`}/>
      <span><strong>{n.name}</strong><small>{n.area} · {n.status} · {arrivalLine(eta)}</small><small>{basisLine(eta)}</small><small>{n.skills.join(' · ')}</small>
       {!decision.allowed && <small className="flagged">{decision.reason}</small>}</span>
      {decision.allowed
       ? <button className={assigned[job.id] === n.name ? 'secondary' : 'primary'} disabled={n.status !== 'Available'} onClick={() => setAssigned({ ...assigned, [job.id]: assigned[job.id] === n.name ? '' : n.name })}>{assigned[job.id] === n.name ? <><Check size={15}/>Assigned</> : 'Assign'}</button>
       : <button className="secondary" disabled aria-label={`Cannot be assigned — ${n.name}. ${decision.reason}`}>Cannot be assigned</button>}
     </div>)}
     <div className="privacy-note"><ShieldCheck size={19}/>Vetting is asked before a name is offered, not after. The Control Tower has no override for a lapsed clearance — there is no button here that would let one be granted.</div>
     <div className="privacy-note"><Radio size={19}/>Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.</div>
     <div className="privacy-note"><Route size={19}/>No routing provider is connected, so no road route is drawn and no arrival time is claimed from one. When one is added, a route it cannot give will be shown as unavailable rather than replaced by the straight line above.</div>
    </div>
   </div>
  </StateBlock>
 </>;
}
const incidents = [
 { id: 'INC-014', title: 'Nurse could not gain access at the address', severity: 'Medium', area: 'Soweto', opened: '09:52', status: 'Triage' },
 { id: 'INC-015', title: 'Patient reported chest pain during a routine visit', severity: 'Critical', area: 'Parktown', opened: '10:31', status: 'Escalated' },
 { id: 'INC-016', title: 'Sample seal found damaged on courier handover', severity: 'High', area: 'Rosebank', opened: '11:04', status: 'Open' }
];
export function IncidentBoard({ open }: { open: (s: string) => void }) {
 return <div className="panel">{incidents.map(i => <button className="record-row" key={i.id} onClick={() => open(`Incident ${i.id}`)}>
  <span className={`service-icon severity-${i.severity.toLowerCase()}`}>{i.severity === 'Critical' ? <ShieldAlert size={21}/> : <TriangleAlert size={21}/>}</span>
  <span><strong>{i.id} · {i.title}</strong><small>{i.severity} · {i.area} · Opened {i.opened} · {i.status}</small></span>
  <ArrowRight size={17}/>
 </button>)}<p className="helper">Sample incidents. No live escalation, paging or emergency dispatch is connected.</p></div>;
}
export function IncidentDetail({ reference = 'INC-015', onClose }: { reference?: string; onClose: () => void }) {
 const incident = incidents.find(i => i.id === reference) ?? incidents[1];
 const [severity, setSeverity] = useState(incident.severity);
 const [action, setAction] = useState('');
 const [notes, setNotes] = useState('');
 const [logged, setLogged] = useState<string[]>([]);
 return <div className="form-stack">
  <Pill tone="plain">Incident management preview</Pill>
  <h3>{incident.id} · {incident.title}</h3>
  <div className="review-line"><span>Opened</span><strong>{incident.opened} · {incident.area}</strong></div>
  <div className="review-line"><span>Reported by</span><strong>Sister Palesa Khumalo · N-108</strong></div>
  <label>Severity<select value={severity} onChange={e => setSeverity(e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
  {severity === 'Critical' && <div className="privacy-note alert"><CircleAlert size={19}/>A critical incident pages the on-call clinical lead immediately. The form is never a prerequisite for calling emergency services.</div>}
  <label>Immediate action<select value={action} onChange={e => setAction(e.target.value)}><option value="">Choose an action…</option>
   <option>Call the nurse now</option><option>Advise nurse to call emergency services</option><option>Escalate to the on-call clinical lead</option><option>Notify the patient’s emergency contact</option><option>Reassign the visit</option><option>Stand down — no further action</option></select></label>
  <label>Handover note<textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 600))} placeholder="What happened, what you did, what the next shift must know…"/></label>
  <button className="secondary" disabled={!action} onClick={() => { setLogged([...logged, `${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} · ${action}`]); setAction(''); }}><Check size={16}/>Add demo action to the log</button>
  {logged.length > 0 && <ol className="timeline" aria-label="Demo incident log">{logged.map(l => <li className="done" key={l}><span className="timeline-dot"><Check size={12}/></span><div><strong>{l.split(' · ')[1]}</strong><em>{l.split(' · ')[0]} · Demo entry</em></div></li>)}</ol>}
  <div className="privacy-note"><ShieldCheck size={19}/>Incident logs are append-only and reviewed weekly. Nothing here is recorded, paged or sent.</div>
  <button className="primary full" onClick={onClose}>Close demo incident<ArrowRight size={16}/></button>
 </div>;
}
/* Nurse vetting is one role in a twelve-role module now, so this is the same flow with the role
   already chosen. The wiring in App.tsx keeps working, and there is only one applicant flow to
   keep in step with packages/catalog/vetting.json. */
export function NurseVetting({ onClose }: { onClose: () => void }) {
 return <VettingApplication roleId="nurse" onClose={onClose}/>;
}
