import { useState } from 'react';
import { ArrowRight, Check, CircleAlert, Clock3, MapPin, Radio, ShieldAlert, ShieldCheck, TriangleAlert, UserRoundCheck } from 'lucide-react';
import { Pill } from '../components/UI';
import { StateBlock, StatePicker, type LoadState } from '../components/States';
type Job = { id: string; service: string; area: string; window: string; x: number; y: number; priority: 'Routine' | 'Same day' | 'Urgent' };
type Nurse = { id: string; name: string; area: string; x: number; y: number; status: 'Available' | 'On a visit' | 'Off duty'; eta: number; skills: string[] };
const zones = [
 { name: 'Randburg', x: 17, y: 19, r: 13 }, { name: 'Rosebank', x: 76, y: 19, r: 13 },
 { name: 'Parktown', x: 68, y: 50, r: 12 }, { name: 'Melville', x: 25, y: 50, r: 12 }, { name: 'Soweto', x: 38, y: 81, r: 14 }
];
const initialJobs: Job[] = [
 { id: 'TH-2049', service: 'Wound care', area: 'Soweto', window: '11:00 – 12:00', x: 41, y: 79, priority: 'Same day' },
 { id: 'TH-2051', service: 'Vitals & chronic check', area: 'Randburg', window: '13:00 – 14:00', x: 21, y: 24, priority: 'Routine' },
 { id: 'TH-2052', service: 'Post-operative check', area: 'Parktown', window: 'As soon as possible', x: 70, y: 52, priority: 'Urgent' }
];
const nurses: Nurse[] = [
 { id: 'N-114', name: 'Sister Naledi Mokoena', area: 'Rosebank', x: 76, y: 21, status: 'Available', eta: 18, skills: ['Wound care', 'Chronic care'] },
 { id: 'N-108', name: 'Sister Palesa Khumalo', area: 'Soweto', x: 35, y: 83, status: 'Available', eta: 9, skills: ['Wound care', 'Maternal'] },
 { id: 'N-121', name: 'Brother Sipho Ndlovu', area: 'Melville', x: 24, y: 51, status: 'On a visit', eta: 46, skills: ['Post-operative', 'Chronic care'] },
 { id: 'N-133', name: 'Sister Refilwe Sithole', area: 'Randburg', x: 15, y: 20, status: 'Available', eta: 24, skills: ['Chronic care', 'Paediatric'] }
];
export function DispatchBoard() {
 const [state, setState] = useState<LoadState>('ready');
 const [selected, setSelected] = useState(initialJobs[0].id);
 const [assigned, setAssigned] = useState<Record<string, string>>({});
 const job = initialJobs.find(j => j.id === selected)!;
 const candidates = [...nurses].filter(n => n.status !== 'Off duty').sort((a, b) => a.eta - b.eta);
 const summary = `Demonstration dispatch map of northern Johannesburg. ${initialJobs.length} visits awaiting assignment across ${zones.map(z => z.name).join(', ')}. ${nurses.filter(n => n.status === 'Available').length} nurses available. All positions are fictional.`;
 return <>
  <StatePicker label="Preview the dispatch feed state" value={state} onChange={setState}/>
  <StateBlock state={state} subject="The live dispatch feed" permission="location sharing from nurse devices" onRetry={() => setState('ready')}>
   <div className="dispatch-grid">
    <div className="panel map-panel">
     <div className="section-title"><h2>Live dispatch · Demo</h2><Pill><span className="status-dot"/>Fictional positions</Pill></div>
     <svg className="dispatch-map" viewBox="0 0 100 100" role="img" aria-label={summary}>
      <rect width="100" height="100" className="map-ground"/>
      {[20, 40, 60, 80].map(n => <g key={n}><line x1="0" y1={n} x2="100" y2={n} className="map-grid"/><line x1={n} y1="0" x2={n} y2="100" className="map-grid"/></g>)}
      {zones.map(z => <circle key={z.name} cx={z.x} cy={z.y} r={z.r} className="map-zone"/>)}
      {nurses.map(n => <g key={n.id} className={`map-pin nurse ${n.status === 'Available' ? 'free' : 'busy'}`}><circle cx={n.x} cy={n.y} r="2.4"/><circle cx={n.x} cy={n.y} r="4.6" className="map-halo"/></g>)}
      {initialJobs.map(j => <g key={j.id} className={`map-pin job ${j.id === selected ? 'selected' : ''} ${assigned[j.id] ? 'assigned' : ''}`}><rect x={j.x - 2.2} y={j.y - 2.2} width="4.4" height="4.4" rx="1.2"/>{j.id === selected && <circle cx={j.x} cy={j.y} r="7" className="map-focus"/>}</g>)}
      {zones.map(z => <text key={z.name} x={z.x} y={z.y - z.r + 4.4} className="map-label">{z.name}</text>)}
     </svg>
     <div className="map-key"><span><i className="key-free"/>Nurse available</span><span><i className="key-busy"/>Nurse on a visit</span><span><i className="key-job"/>Visit awaiting a nurse</span><span><i className="key-assigned"/>Assigned</span></div>
     <p className="helper">The map is a picture of the same information in the list beside it. Everything can be dispatched from the list alone, with a keyboard.</p>
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
     {candidates.map(n => <div className="record-row static" key={n.id}>
      <span className={`status-dot ${n.status === 'Available' ? '' : 'offline'}`}/>
      <span><strong>{n.name}</strong><small>{n.area} · {n.status} · ETA {n.eta} min</small><small>{n.skills.join(' · ')}</small></span>
      <button className={assigned[job.id] === n.name ? 'secondary' : 'primary'} disabled={n.status !== 'Available'} onClick={() => setAssigned({ ...assigned, [job.id]: assigned[job.id] === n.name ? '' : n.name })}>{assigned[job.id] === n.name ? <><Check size={15}/>Assigned</> : 'Assign'}</button>
     </div>)}
     <div className="privacy-note"><Radio size={19}/>Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.</div>
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
const vettingChecks = [
 { name: 'SANC registration', detail: 'Verified against the South African Nursing Council register', status: 'Verified' },
 { name: 'Identity', detail: 'Home Affairs verification through an accredited provider', status: 'Verified' },
 { name: 'Qualifications', detail: 'Certified copies checked against the issuing institution', status: 'Verified' },
 { name: 'Police clearance', detail: 'SAPS clearance, renewed every two years', status: 'In review' },
 { name: 'Professional indemnity', detail: 'Cover in force for the scope of practice', status: 'In review' },
 { name: 'Two clinical references', detail: 'Contacted directly, never through the applicant', status: 'Outstanding' },
 { name: 'Thuso Kit training', detail: 'Device handling, infection control and escalation drill', status: 'Outstanding' }
];
export function NurseVetting({ onClose }: { onClose: () => void }) {
 const [stage, setStage] = useState(0);
 const [sanc, setSanc] = useState('');
 const [scope, setScope] = useState<string[]>([]);
 const [attested, setAttested] = useState(false);
 const verified = vettingChecks.filter(c => c.status === 'Verified').length;
 return <div className="form-stack">
  <Pill>Nurse onboarding preview</Pill>
  {stage === 0 ? <>
   <h3>Join the MyThuso nurse network.</h3>
   <p className="muted">Vetting protects patients and it protects you. Nothing is submitted in this preview.</p>
   <label>SANC registration number<input inputMode="numeric" value={sanc} onChange={e => setSanc(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 digits" aria-describedby="sanc-help"/></label>
   <p className="helper" id="sanc-help">{sanc && sanc.length < 8 ? 'A SANC number has 8 digits.' : 'Use a fictional number, for example 20012345.'}</p>
   <fieldset className="chip-set"><legend>Scope of practice you are applying for</legend>{['Chronic care', 'Wound care', 'Maternal & child', 'Post-operative', 'Phlebotomy', 'Paediatric', 'Elderly care'].map(s =>
    <label key={s} className={scope.includes(s) ? 'chip selected' : 'chip'}><input type="checkbox" checked={scope.includes(s)} onChange={e => setScope(e.target.checked ? [...scope, s] : scope.filter(x => x !== s))}/>{s}</label>)}</fieldset>
   <div className="privacy-note"><ShieldCheck size={19}/>You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.</div>
   <div className="button-row"><button className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={sanc.length < 8 || !scope.length} onClick={() => setStage(1)}>Continue<ArrowRight size={16}/></button></div>
  </> : <>
   <h3>Your vetting status</h3>
   <div className="vetting-progress"><div style={{ width: `${(verified / vettingChecks.length) * 100}%` }}/></div>
   <p className="helper" role="status">{verified} of {vettingChecks.length} checks complete in this sample. You cannot take visits until every check passes.</p>
   {vettingChecks.map(c => <div className="record-row static" key={c.name}>
    <span className={`service-icon check-${c.status.toLowerCase().replace(' ', '-')}`}>{c.status === 'Verified' ? <UserRoundCheck size={20}/> : <Clock3 size={20}/>}</span>
    <span><strong>{c.name}</strong><small>{c.detail}</small></span><Pill tone={c.status === 'Verified' ? 'teal' : 'plain'}>{c.status}</Pill>
   </div>)}
   <label className="checkbox"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)}/><span>I confirm the information above is true and I will report any change to my registration, clearance or health status.</span></label>
   <div className="privacy-note"><ShieldCheck size={19}/>Re-vetting runs on a schedule, not once at sign-up. A lapsed registration removes a nurse from dispatch automatically.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStage(0)}>Back</button><button className="primary" disabled={!attested} onClick={onClose}><Check size={16}/>Submit demo application</button></div>
  </>}
 </div>;
}
