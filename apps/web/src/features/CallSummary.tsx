import { Suspense, lazy } from 'react';
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import { Badge } from '../ui';
import { useThusoIQ } from '../lib/thusoiq';
import { thusoiq } from '../../../../packages/thusoiq/index.ts';
import { initialsOf } from '../lib/names';
import './doctor-pages.css';
/* The patient's devices arrive with the call room, not with the workspace. */
const LiveVitalsPanel = lazy(() => import('./LiveVitals').then(m => ({ default: m.LiveVitalsPanel })));

/* The patient beside the call (30 September 2026, the Lovable export's teleconsultation room).
 *
 * The export put a video stage in the middle of the screen with a patient summary card beside it — the
 * patient's condition, a medicine, an allergy and four vital signs — and a notes box with Save draft under
 * that. The video stage is not drawn (no media in this build: the line instrument is what stands in the
 * middle). The vital signs were not drawn either, because four numerals beside a call are readings without
 * their source or their range; since 1 October 2026 (the founder asked for the patient's devices on the
 * consultation) they are the live panel from features/LiveVitals.tsx, where every reading carries both and
 * says it is simulated. The notes box is not drawn, because a
 * teleconsultation is written up after the call in the consultation record and an interrupted encounter
 * writes no assessment — the sentence under this card is the contract's own.
 *
 * What is drawn is what the ThusoIQ sandbox holds about the person on the call: why they are being seen,
 * whether consent is recorded, the allergy record and whether anybody reconciled it, their visit today and
 * what has been requested for them. It is the sandbox's, labelled as such, and it says so when the person
 * on the call is not in it. */
export function CallSummary({ patient, rule, readings = true }: { patient: string; rule: string; readings?: boolean }) {
 const { state } = useThusoIQ();
 const person = state.patients.find(p => p.name === patient);
 const visits = person ? state.appointments.filter(a => a.patientId === person.id).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : [];
 const visit = visits.find(a => a.mode === 'video') ?? visits[0];
 const requests = person ? state.medicationRequests.filter(r => r.patientId === person.id) : [];
 const modeName = (id: string) => thusoiq.appointments.modes.find(m => m.id === id)?.name ?? id;
 const stateName = (id: string) => thusoiq.appointments.states.find(s => s.id === id)?.name ?? id;
 return <aside className="rq-case tcx-aside" aria-labelledby="tcx-aside-title">
  <div className="rq-case-head">
   <span className="rq-case-ref">Patient summary · ThusoIQ sandbox</span>
   <div className="tcx-aside-who">
    <span className="dp-row-mark" aria-hidden="true">{initialsOf(patient)}</span>
    <h3 id="tcx-aside-title">{patient}</h3>
   </div>
  </div>
  {person && <p className="rq-case-note">{person.reason}</p>}
  <details className="tcx-context" open={readings ? undefined : true}>
   <summary>Patient details &amp; medication</summary>
  {person ? <>
   <dl className="rq-case-facts">
    <div><dt>Seen for</dt><dd>{person.reason}</dd></div>
    <div><dt>Allergy record</dt><dd>{person.allergies}</dd>
     <dd className="tcx-aside-mark">{person.allergiesReviewed ? <><Check size={14} aria-hidden="true"/>Reconciled</> : <><AlertTriangle size={14} aria-hidden="true"/>Reconciliation outstanding</>}</dd></div>
    <div><dt>Care consent</dt><dd className="tcx-aside-mark">{person.consent ? <><ShieldCheck size={14} aria-hidden="true"/>Recorded</> : <><AlertTriangle size={14} aria-hidden="true"/>Not recorded</>}</dd></div>
    {visit && <div><dt>This visit</dt><dd>{modeName(visit.mode)} · {visit.minutes} minutes · {visit.id} <Badge size="sm" variant="neutral">{stateName(visit.status)}</Badge></dd></div>}
    <div><dt>Medication requests</dt><dd>{requests.length ? <ul className="tcx-medications">{requests.map(r => <li key={r.id}>{r.item}</li>)}</ul> : 'No medication requests are recorded in this sandbox.'}</dd><dd className="rq-case-note">Requests are not a reconciled list of medicines currently taken.</dd></div>
   </dl>
  </> : <p className="rq-case-note">{patient} is not a patient in the ThusoIQ sandbox, so nothing more is shown about them here.</p>}
  </details>
  {readings && <Suspense fallback={null}><LiveVitalsPanel subject={patient} level="h4"/></Suspense>}
  {rule && <p className="rq-case-note">{rule}</p>}
 </aside>;
}
