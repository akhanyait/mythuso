import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, Check, Cpu, HeartPulse, House, Lock, PenLine, Radio, ShieldCheck, Stethoscope, Video } from 'lucide-react';
import { Badge, Button, MyThusoMedicationIcon, MyThusoResultsIcon, MyThusoVisitIcon } from '../ui';
import { useThusoIQ } from '../lib/thusoiq';
import { bounds, label, latestSample, refusal, sampleFreshness, soapKeys, thusoiq, type Appointment, type Assessment, type Command, type Consultation, type MedicationRequest, type Notes, type Patient, type State } from '../../../../packages/thusoiq/index.ts';
/* The four SOAP headings, the sentence under each of them and the one note that says who may
   conclude what, read from the record contract rather than typed onto this form. The consultation
   screen in all three apps already renders this list; a second copy here would be the one that
   drifts, and the sentence that drifted would be the one telling a nurse what a diagnosis is. */
import records from '../../../../packages/catalog/records.json';
import './clinical-workbench.css';

type Tool = 'Appointments' | 'Consultation' | 'Diagnostic review' | 'Dispensary' | 'Wearables';
type Role = 'Nurse' | 'Doctor' | 'Partner';
type Run = (command: Command, message: string) => boolean;
/** What every tool is handed: the kernel's state, the one patient being worked, and the two ways
 *  out — run a command, or move to the tool that can. */
type Work = { role: Role; state: State; patientId: string; patient: Patient; consultation?: Consultation; run: Run; go: (tool: Tool) => void };

/* Three of the five are healthcare actions the MyThuso icon family draws — a visit, a reviewed result, a
   medicine — and wear its icon; the consultation and the wearable keep Lucide's, because the family's
   health icon stands for the patient's whole record and would say something else here. */
const tools = [['Appointments', MyThusoVisitIcon], ['Consultation', Stethoscope], ['Diagnostic review', MyThusoResultsIcon], ['Dispensary', MyThusoMedicationIcon], ['Wearables', HeartPulse]] as const;
const modeIcon: Record<string, typeof House> = { home: House, video: Video };
const visitModes = thusoiq.appointments.modes;
const visitStates = thusoiq.appointments.states;
/* The kernel's Notes keys and the contract's four headings are derived from the same list in the
   same order — packages/thusoiq/contract.ts says so and the generator holds it to four — so the
   heading, its sentence and the field it writes are zipped by index rather than matched by name. */
const soapSteps = records.consultation.soap.map((step, i) => ({ ...step, key: soapKeys[i] }));
const assessmentNote = (records.consultation.sections as { id: string; note?: string }[]).find(section => section.id === 'assessment')?.note ?? '';
const contractRole: Record<Role, string> = { Nurse: 'nurse', Doctor: 'doctor', Partner: 'pharmacist' };
/* A consultation's three states are the kernel's ids. They are written out for a reader here and
   nowhere else — there is no consultation state table in the contract to derive them from, and the
   day there is, this map is what gets deleted. */
const encounterWord: Record<Consultation['status'], string> = { draft: 'Draft', 'awaiting-doctor': 'Awaiting doctor review', signed: 'Signed' };
/* What the workspace is for, in each role's own terms, with a badge set inside the sentence the way
   the instrument deck at the top of the screen sets one. The badge is decoration: every sentence
   below reads correctly with it removed, which is what lets it be hidden from a screen reader
   rather than described. Two of the three are a journey from one act to another and take the arrow;
   a nurse's is about a visit that is joined up, and takes the signal. */
const standing: Record<Role, { before: string; glyph: typeof ArrowRight; after: string }> = {
 Doctor: { before: 'From evidence', glyph: ArrowRight, after: 'to a care decision.' },
 Nurse: { before: 'Your next visit,', glyph: Radio, after: 'fully connected.' },
 Partner: { before: 'From prescription', glyph: ArrowRight, after: 'to handover.' }
};
const freshnessWord = { missing: 'No reading yet', recent: 'Recent', stale: 'Stale' } as const;

const modeName = (id: string) => visitModes.find(m => m.id === id)?.name ?? id;
const stateName = (id: string) => visitStates.find(s => s.id === id)?.name ?? id;
const stateDetail = (id: string) => visitStates.find(s => s.id === id)?.detail ?? '';
const terminal = (id: string) => visitStates.find(s => s.id === id)?.terminal ?? false;
const dateTime = (value: string) => new Date(value).toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const clockOf = (value: string) => new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
const dayOf = (value: string) => new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
const initials = (name: string) => name.split(' ').map(part => part[0]).join('');
const field = (event: FormEvent<HTMLFormElement>, name: string) => String(new FormData(event.currentTarget).get(name) ?? '').trim();
const sampleValues = [72, 74, 73, 76, 75, 72, 71, 73];

/* The one shape an empty tool takes. A clinical workspace spends a good part of its life with
   nothing in it yet — no encounter, no request, no reading — and each of those is a different
   sentence about a different thing that has not happened, with the door out of it where a person
   is already looking. A bare "None." is where an application looks unfinished. */
function Nothing({ title, say, action }: { title: string; say: string; action?: ReactNode }) {
 return <div className="iq-nothing"><strong>{title}</strong><p>{say}</p>{action}</div>;
}

/* What the kernel will refuse if it is asked now, in the kernel's own words. These are the same
   sentences packages/catalog/thusoiq.json gives the engine, resolved by the same refusal(id), and
   they are shown before the button rather than after it — a person who can see what is outstanding
   does not have to press something to be told. Nothing here decides anything: the kernel checks
   again and is the only authority on whether an act may happen. */
function Outstanding({ reasons }: { reasons: string[] }) {
 if (!reasons.length) return null;
 return <ul className="iq-outstanding">{reasons.map(reason => <li key={reason}><AlertTriangle size={15} aria-hidden="true"/><span>{reason}</span></li>)}</ul>;
}

/* ---- The person -------------------------------------------------------------------------------
   The identity of a human being, and the two facts a clinician must not have to go looking for:
   what they are allergic to and whether anybody has reconciled that record. The allergy line is a
   panel of its own rather than a caption, and when it has not been reconciled it says so in words
   and in a mark as well as in a colour — the pharmacist's verification is refused on exactly that
   flag, so this is the screen where the refusal becomes legible in advance. */
function PatientIdentity({ patient, consultation }: { patient: Patient; consultation?: Consultation }) {
 return <header className="iq-identity">
  <div className="iq-identity-top">
   <span className="iq-identity-disc" aria-hidden="true">{initials(patient.name)}</span>
   <div className="iq-identity-say">
    <span className="iq-eyebrow">PATIENT CONTEXT</span>
    <h3>{patient.name}</h3>
    <p>{patient.reason}</p>
   </div>
   <span className={`iq-chip ${patient.consent ? '' : 'attention'}`}>
    {patient.consent ? <ShieldCheck size={15} aria-hidden="true"/> : <AlertTriangle size={15} aria-hidden="true"/>}
    {patient.consent ? 'Care consent recorded' : 'Consent required'}
   </span>
  </div>
  <dl className="iq-facts">
   <div className={`iq-fact allergy ${patient.allergiesReviewed ? '' : 'attention'}`}>
    <dt>Allergy record</dt>
    <dd>{patient.allergies}</dd>
    <p>{patient.allergiesReviewed
     ? <><Check size={14} aria-hidden="true"/>Reconciled</>
     : <><AlertTriangle size={14} aria-hidden="true"/>Reconciliation outstanding</>}</p>
   </div>
   <div className="iq-fact">
    <dt>Open encounter</dt>
    <dd>{consultation ? encounterWord[consultation.status] : 'None open'}</dd>
    <p>{consultation ? consultation.id : 'Opened from an arrived visit'}</p>
   </div>
  </dl>
 </header>;
}

/* ---- Appointments -----------------------------------------------------------------------------
   A patient's visits as a line down the day rather than a stack of cards: the time in its own
   gutter, a mark on the rail whose shape says what has happened to that visit, and the record
   beside it. One visit leads — the next one that is not finished — and it is the only one carrying
   the state's own sentence and the buttons that move it. */
function AppointmentsTool({ work }: { work: Work }) {
 const { role, state, patientId, run } = work;
 const list = state.appointments.filter(a => a.patientId === patientId).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
 const lead = list.find(a => !terminal(a.status));
 return <>
  <div className="iq-section-head"><h3>The visits on this record</h3><span>{list.length} {list.length === 1 ? 'visit' : 'visits'}</span></div>
  {list.length === 0
   ? <Nothing title="No visit is on this record" say="A follow-up arranged below is the first thing this patient's record will carry."/>
   : <ol className="iq-visits">{list.map(visit => <VisitRow key={visit.id} visit={visit} lead={visit.id === lead?.id} work={work}/>)}</ol>}
  {role !== 'Partner' && <ComposeVisit role={role} patientId={patientId} run={run}/>}
 </>;
}

function VisitRow({ visit, lead, work }: { visit: Appointment; lead: boolean; work: Work }) {
 const { state, patientId, run, go } = work;
 const opened = state.consultations.find(c => c.appointmentId === visit.id);
 const Icon = modeIcon[visit.mode] ?? House;
 return <li className={`iq-visit is-${visit.status}${lead ? ' lead' : ''}`}>
  <div className="iq-visit-when"><strong>{clockOf(visit.startsAt)}</strong><small>{dayOf(visit.startsAt)}</small></div>
  <span className="iq-visit-mark" aria-hidden="true"/>
  <div className="iq-visit-card">
   <div className="iq-visit-head">
    <h4><Icon size={16} aria-hidden="true"/>{modeName(visit.mode)}</h4>
    <span className={`iq-state is-${visit.status}`}>{stateName(visit.status)}</span>
   </div>
   <p className="iq-visit-line">{visit.minutes} minutes · {visit.clinicianId} · {visit.id}</p>
   {lead && <p className="iq-visit-detail">{stateDetail(visit.status)}</p>}
   {visit.reason && <p className="iq-visit-detail">{visit.reason}</p>}
   {lead && <div className="button-row">
    {visit.status === 'scheduled' && <Button variant="secondary" onClick={() => run({ type: 'appointment.transition', patientId, appointmentId: visit.id, status: 'arrived' }, 'Patient checked in.')}>Check in</Button>}
    {visit.status === 'arrived' && !opened && <Button variant="primary" onClick={() => { if (run({ type: 'consultation.open', patientId, appointmentId: visit.id }, 'Consultation opened.')) go('Consultation'); }}>Open consultation</Button>}
    {visit.status === 'arrived' && opened && opened.status !== 'signed' && <Button variant="secondary" onClick={() => go('Consultation')}>Open the record<ArrowUpRight size={15} aria-hidden="true"/></Button>}
    {visit.status === 'arrived' && opened?.status === 'signed' && <Button variant="secondary" onClick={() => run({ type: 'appointment.transition', patientId, appointmentId: visit.id, status: 'completed' }, 'Appointment completed.')}>Complete visit</Button>}
   </div>}
  </div>
 </li>;
}

/* Two decisions and a time, in that order, because that is the order a person makes them in: what
   kind of visit this is, then when it is, then how long it needs. It was three inputs in a row
   under one heading, which is a form asking for a record rather than a clinician arranging a
   visit. The duration's rule is the kernel's own sentence — the one it will refuse with. */
function ComposeVisit({ role, patientId, run }: { role: Role; patientId: string; run: Run }) {
 return <form className="iq-compose" onSubmit={event => {
  event.preventDefault();
  const raw = field(event, 'startsAt');
  if (!raw) return;
  run({ type: 'appointment.schedule', patientId, clinicianId: role === 'Doctor' ? 'D-401' : 'N-205', startsAt: new Date(raw).toISOString(), minutes: Number(field(event, 'minutes')), mode: field(event, 'mode') as Appointment['mode'] }, 'Appointment added to this care queue.');
 }}>
  <div className="iq-compose-head"><h4>Arrange a follow-up</h4><p>Checks patient and clinician conflicts before accepting the slot.</p></div>
  <fieldset className="iq-choice">
   <legend>Where this visit happens</legend>
   <div className="iq-choice-row">{visitModes.map((mode, i) => {
    const Icon = modeIcon[mode.id] ?? House;
    return <label className="iq-choice-card" key={mode.id}>
     <input type="radio" name="mode" value={mode.id} defaultChecked={i === 0}/>
     <Icon size={20} aria-hidden="true"/>
     <strong>{mode.name}</strong>
    </label>;
   })}</div>
  </fieldset>
  <div className="iq-compose-when">
   <label><span>Date and time</span><input type="datetime-local" name="startsAt" required/></label>
   <label><span>Minutes</span><input type="number" name="minutes" min={bounds.appointmentMinutes.min} max={bounds.appointmentMinutes.max} defaultValue={30} required/></label>
  </div>
  <p className="iq-hint">{refusal('duration-out-of-bounds', { min: bounds.appointmentMinutes.min, max: bounds.appointmentMinutes.max })}</p>
  <Button variant="primary" type="submit">Schedule appointment</Button>
 </form>;
}

/* ---- The consultation -------------------------------------------------------------------------
   Four textareas of equal weight is not a clinical record; it is a form that happens to have four
   fields. Subjective, Objective, Assessment and Plan are four different acts — what a person told
   you, what you found, what you make of it, what happens next — so each pane carries its letter on
   a spine down the left, its own sentence out of records.json, and a mark that fills when that act
   has been written. The spine is the document: a reader can see how far through it they are
   without counting boxes.

   What is typed and what is saved are deliberately two different things here. The marks follow the
   draft in front of you; the sentences under the actions follow what the kernel has, because those
   are what it will check. A screen showing four filled marks over a refusal to sign is a screen
   arguing with itself. */
function ConsultationTool({ work }: { work: Work }) {
 const { role, state, patientId, consultation, run, go } = work;
 const assessment = state.assessments.filter(a => a.consultationId === consultation?.id).at(-1);
 const [draft, setDraft] = useState<Notes>(() => ({ ...(consultation?.notes ?? { subjective: '', objective: '', assessment: '', plan: '' }) }));
 if (!consultation) return <>
  <div className="iq-section-head"><h3>Consultation record</h3><span>No open encounter</span></div>
  <Nothing title="No encounter is open for this patient"
   say="A consultation hangs off a visit somebody has arrived at, so the record can never describe a visit that had not started."
   action={<Button variant="secondary" onClick={() => go('Appointments')}>Go to the visits<ArrowUpRight size={15} aria-hidden="true"/></Button>}/>
 </>;
 const locked = consultation.status === 'signed' || role === 'Partner';
 const written = soapSteps.filter(step => draft[step.key].trim()).length;
 const dirty = soapSteps.some(step => draft[step.key] !== consultation.notes[step.key]);
 const savedComplete = soapSteps.every(step => consultation.notes[step.key].trim());
 /* The earlier of the two gates, never both: "before requesting review" and "before signing" are
    two sentences about one unfinished note, and printing them together reads as two problems. */
 const blocks = [...(savedComplete ? [] : [refusal('incomplete-soap-submit')]), ...(role === 'Doctor' && assessment?.status !== 'confirmed' ? [refusal('unconfirmed-assessment')] : [])];
 return <>
  <div className="iq-section-head"><h3>Consultation record</h3><span>{encounterWord[consultation.status]} · {consultation.id}</span></div>
  <div className={`iq-doc${locked ? ' locked' : ''}`}>
   {soapSteps.map(step => {
    const value = locked ? consultation.notes[step.key] : draft[step.key];
    return <article className={`iq-pane${value.trim() ? ' written' : ''}`} key={step.key}>
     <span className="iq-pane-mark" aria-hidden="true">{step.id}</span>
     <div className="iq-pane-body">
      <div className="iq-pane-head"><h4>{step.name}</h4><p>{step.detail}</p></div>
      {locked
       ? <p className="iq-pane-text">{value || 'Nothing was written in this section.'}</p>
       : <textarea aria-label={step.name} value={value} rows={step.key === 'subjective' || step.key === 'objective' ? 4 : 3} maxLength={bounds.noteCharacters.max}
          onChange={event => setDraft({ ...draft, [step.key]: event.target.value })}/>}
      {step.key === 'assessment' && assessmentNote && <p className="iq-pane-note">{assessmentNote}</p>}
     </div>
    </article>;
   })}
  </div>
  <footer className="iq-doc-foot">
   <div className="iq-doc-progress">
    <span className="iq-doc-count">{written} of {soapSteps.length} sections written</span>
    {dirty && !locked && <span className="iq-doc-dirty"><PenLine size={14} aria-hidden="true"/>This draft has changes that are not saved</span>}
   </div>
   {consultation.signedAt
    ? <p className="iq-signed"><Lock size={15} aria-hidden="true"/>Signed by {consultation.signedBy} · {dateTime(consultation.signedAt)}. {refusal('signed-is-immutable')}</p>
    : role === 'Partner'
     ? <p className="iq-hint">{thusoiq.clinicalRoles.find(r => r.id === 'pharmacist')?.mayNot}</p>
     : <>
      <Outstanding reasons={blocks}/>
      <div className="button-row">
       <Button variant="primary" disabled={!dirty} onClick={() => run({ type: 'consultation.save', patientId, consultationId: consultation.id, notes: draft }, 'Consultation draft saved in this sandbox session.')}>Save clinical draft</Button>
       <Button variant="secondary" onClick={() => run({ type: 'consultation.submit', patientId, consultationId: consultation.id }, 'Sent for doctor review in the sandbox.')}>Request doctor review</Button>
       {role === 'Doctor' && <Button variant="secondary" onClick={() => run({ type: 'consultation.sign', patientId, consultationId: consultation.id }, 'Consultation signed. Its notes are now locked.')}>Sign consultation</Button>}
      </div>
     </>}
  </footer>
 </>;
}

/* ---- Diagnosis --------------------------------------------------------------------------------
   Two acts by two people, so two stages on a chain: somebody records what they found, and somebody
   entitled to decide answers it. The role's own "may not" comes out of the contract rather than
   being implied by a hidden button — a nurse can see that confirming is not hers before she writes
   anything, which is the difference between a form that refuses her and a form that explains. */
function DiagnosisTool({ work }: { work: Work }) {
 const { role, state, patientId, consultation, run, go } = work;
 const assessment = state.assessments.filter(a => a.consultationId === consultation?.id).at(-1);
 const standing = thusoiq.clinicalRoles.find(r => r.id === contractRole[role]);
 const mayPropose = consultation && consultation.status !== 'signed' && (!assessment || assessment.status === 'rejected') && role !== 'Partner';
 return <>
  <div className="iq-section-head"><h3>Assessment and review</h3><span>Clinician-led</span></div>
  <p className="helper">Record findings and their evidence. A doctor reviews the assessment. No diagnostic model is connected and wearable samples never create a diagnosis.</p>
  <ol className="iq-chain">
   <li className={`iq-link${assessment ? ' done' : ' now'}`}>
    <span className="iq-link-no" aria-hidden="true">1</span>
    <div><strong>Recorded</strong><p>{assessment ? `Findings and evidence on ${consultation?.id}` : 'A nurse or a doctor records what was found.'}</p></div>
   </li>
   <li className={`iq-link${assessment?.status === 'confirmed' || assessment?.status === 'rejected' ? ' done' : assessment ? ' now' : ''}`}>
    <span className="iq-link-no" aria-hidden="true">2</span>
    <div><strong>Reviewed</strong><p>{assessment?.reviewedBy ? `${assessment.status === 'confirmed' ? 'Confirmed' : 'Returned'} by ${assessment.reviewedBy}` : 'Only a doctor confirms an assessment.'}</p></div>
   </li>
  </ol>
  {standing && <p className="iq-hint"><strong>{role} may not:</strong> {standing.mayNot}</p>}
  {assessment && <AssessmentRecord assessment={assessment}/>}
  {!consultation && <Nothing title="No encounter is open for this patient"
   say="An assessment is recorded against an encounter, so that what was concluded and what it was concluded from stay on one record."
   action={<Button variant="secondary" onClick={() => go('Appointments')}>Go to the visits<ArrowUpRight size={15} aria-hidden="true"/></Button>}/>}
  {mayPropose && <form className="iq-compose" onSubmit={event => {
   event.preventDefault();
   run({ type: 'diagnosis.propose', patientId, consultationId: consultation.id, impression: field(event, 'impression'), evidence: field(event, 'evidence') }, 'Assessment recorded for doctor review.');
  }}>
   <div className="iq-compose-head"><h4>Record an assessment</h4><p>Both fields travel to the doctor together. The second is what the first is based on.</p></div>
   <label><span>{label('clinical-impression')}</span><textarea name="impression" required maxLength={bounds.noteCharacters.max} rows={3}/></label>
   <label><span>{label('supporting-evidence')}</span><textarea name="evidence" required maxLength={bounds.noteCharacters.max} rows={3}/></label>
   <Button variant="primary" type="submit">Submit assessment for review</Button>
  </form>}
  {assessment?.status === 'proposed' && role === 'Doctor' && <form className="iq-compose" onSubmit={event => {
   event.preventDefault();
   run({ type: 'diagnosis.review', patientId, assessmentId: assessment.id, decision: field(event, 'decision') as 'confirmed' | 'rejected', rationale: field(event, 'rationale') }, 'Doctor review recorded.');
  }}>
   <div className="iq-compose-head"><h4>Your review</h4><p>{refusal('decision-required')}</p></div>
   <fieldset className="iq-choice">
    <legend>Decision</legend>
    <div className="iq-choice-row">
     <label className="iq-choice-card"><input type="radio" name="decision" value="confirmed" defaultChecked/><Check size={20} aria-hidden="true"/><strong>Confirm assessment</strong></label>
     <label className="iq-choice-card"><input type="radio" name="decision" value="rejected"/><ArrowUpRight size={20} aria-hidden="true"/><strong>Return for reassessment</strong></label>
    </div>
   </fieldset>
   <label><span>{label('review-rationale')}</span><textarea name="rationale" required maxLength={bounds.noteCharacters.max} rows={3}/></label>
   <Button variant="primary" type="submit">Record doctor decision</Button>
  </form>}
 </>;
}

function AssessmentRecord({ assessment }: { assessment: Assessment }) {
 return <article className={`iq-record is-${assessment.status}`}>
  <div className="iq-record-head">
   <h4>{assessment.impression}</h4>
   <span className={`iq-state is-${assessment.status}`}>{assessment.status === 'proposed' ? 'Awaiting review' : assessment.status === 'confirmed' ? 'Confirmed' : 'Returned'}</span>
  </div>
  <dl className="iq-record-body">
   <div><dt>Evidence and uncertainties</dt><dd>{assessment.evidence}</dd></div>
   {assessment.rationale && <div><dt>Doctor's rationale · {assessment.reviewedBy}</dt><dd>{assessment.rationale}</dd></div>}
  </dl>
 </article>;
}

/* ---- Dispensary -------------------------------------------------------------------------------
   Three acts by two registered people, drawn as the chain it is. The two ticks are not form
   furniture: each is a statement a pharmacist makes under their own registration, so each gets a
   row of its own and the stage says, in the kernel's words, what it will refuse without them. The
   hold is on the screen for the same reason — a chain with no way to stop it is a chain that gets
   completed to get rid of it. */
function DispensaryTool({ work }: { work: Work }) {
 const { role, state, patientId, consultation, run } = work;
 const requests = state.medicationRequests.filter(r => r.patientId === patientId);
 const standing = thusoiq.clinicalRoles.find(r => r.id === 'pharmacist');
 const items = [...new Set(state.stock.map(batch => batch.item))];
 return <>
  <div className="iq-section-head"><h3>Prescription to handover</h3><span>{requests.length} {requests.length === 1 ? 'request' : 'requests'}</span></div>
  {standing && <p className="iq-hint"><strong>A pharmacy partner:</strong> {standing.may}</p>}
  {requests.length === 0 && <>
   <ol className="iq-chain">
    <li className="iq-link"><span className="iq-link-no" aria-hidden="true">1</span><div><strong>Requested</strong><p>A doctor, against a signed consultation.</p></div></li>
    <li className="iq-link"><span className="iq-link-no" aria-hidden="true">2</span><div><strong>Verified</strong><p>{refusal('checks-outstanding')}</p></div></li>
    <li className="iq-link"><span className="iq-link-no" aria-hidden="true">3</span><div><strong>Handed over</strong><p>{refusal('recipient-unchecked')}</p></div></li>
   </ol>
   <Nothing title="No medication requests for this patient"
    say="Three acts by two registered people, and nobody may perform two of them. Nothing here is dispensed."/>
  </>}
  {requests.map(request => <RequestChain key={request.id} request={request} role={role} state={state} patientId={patientId} run={run}/>)}
  {role === 'Doctor' && <form className="iq-compose" onSubmit={event => {
   event.preventDefault();
   if (!consultation) return;
   run({ type: 'dispensary.request', patientId, consultationId: consultation.id, item: field(event, 'item'), directions: field(event, 'directions'), quantity: Number(field(event, 'quantity')) }, 'Medication request added for pharmacist verification.');
  }}>
   <div className="iq-compose-head"><h4>Sandbox medication request</h4><p>Uses a fictional stock item to exercise the workflow. Requires a signed consultation; this does not issue a legal prescription.</p></div>
   <Outstanding reasons={consultation?.status === 'signed' ? [] : [refusal('unsigned-consultation-on-request')]}/>
   <label><span>{label('prescription-item')}</span><select name="item">{items.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
   <label><span>{label('prescriber-directions')}</span><textarea name="directions" required maxLength={bounds.noteCharacters.max} rows={3}/></label>
   <label className="narrow"><span>Quantity</span><input name="quantity" type="number" min={bounds.quantity.min} max={bounds.quantity.max} defaultValue={10} required/></label>
   <Button variant="primary" type="submit">Send to dispensary</Button>
  </form>}
  {role !== 'Partner' && <p className="helper">A pharmacy partner verifies the prescription and records the handover.</p>}
 </>;
}

function RequestChain({ request, role, state, patientId, run }: { request: MedicationRequest; role: Role; state: State; patientId: string; run: Run }) {
 const verified = request.status === 'verified' || request.status === 'dispensed';
 const batches = state.stock.filter(batch => batch.item === request.item);
 return <article className={`iq-record is-${request.status}`}>
  <div className="iq-record-head">
   <h4>{request.item}</h4>
   <span className={`iq-state is-${request.status}`}>{request.status === 'requested' ? 'Awaiting verification' : request.status === 'verified' ? 'Verified' : request.status === 'held' ? 'Held' : 'Dispensed'}</span>
  </div>
  <p className="iq-record-line">{request.directions} · {request.quantity} units · {request.id}</p>
  <ol className="iq-chain">
   <li className="iq-link done">
    <span className="iq-link-no" aria-hidden="true">1</span>
    <div><strong>Requested</strong><p>Prescriber {request.prescriberId}</p></div>
   </li>
   <li className={`iq-link${verified ? ' done' : ' now'}`}>
    <span className="iq-link-no" aria-hidden="true">2</span>
    <div>
     <strong>Verified</strong>
     <p>{verified ? `${request.pharmacistId} · batch ${request.batchId}` : refusal('checks-outstanding')}</p>
     {request.status === 'held' && request.reason && <p className="iq-held">Held: {request.reason}</p>}
    </div>
   </li>
   <li className={`iq-link${request.status === 'dispensed' ? ' done' : verified ? ' now' : ''}`}>
    <span className="iq-link-no" aria-hidden="true">3</span>
    <div><strong>Handed over</strong><p>{request.status === 'dispensed' ? `Released by ${request.pharmacistId}` : refusal('recipient-unchecked')}</p></div>
   </li>
  </ol>
  {role === 'Partner' && !verified && request.status !== 'dispensed' && <form className="iq-compose inset" onSubmit={event => {
   event.preventDefault();
   run({ type: 'dispensary.verify', patientId, requestId: request.id, batchId: field(event, 'batch'), originalChecked: field(event, 'original') === 'on', allergyChecked: field(event, 'allergies') === 'on' }, 'Pharmacist verification recorded.');
  }}>
   <div className="iq-compose-head"><h4>Verify this request</h4><p>Two attestations, each made under your own registration.</p></div>
   <label><span>Stock batch</span><select name="batch">{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.id} · {batch.quantity} available · expires {dayOf(batch.expiresAt)}</option>)}</select></label>
   <label className="iq-attest"><input type="checkbox" name="original" required/><span>Original prescription checked</span></label>
   <label className="iq-attest"><input type="checkbox" name="allergies" required/><span>Allergy record reconciled</span></label>
   <Button variant="secondary" type="submit">Verify prescription</Button>
  </form>}
  {role === 'Partner' && !verified && request.status !== 'dispensed' && <form className="iq-compose inset quiet" onSubmit={event => {
   event.preventDefault();
   run({ type: 'dispensary.hold', patientId, requestId: request.id, reason: field(event, 'reason') }, 'Request held. Nothing leaves the shelf.');
  }}>
   <div className="iq-compose-head"><h4>Or hold it</h4><p>A held request keeps its place and carries the reason it was stopped.</p></div>
   <label><span>{label('hold-reason')}</span><textarea name="reason" required maxLength={bounds.noteCharacters.max} rows={2}/></label>
   <Button variant="secondary" type="submit">Hold this request</Button>
  </form>}
  {role === 'Partner' && request.status === 'verified' && <form className="iq-compose inset" onSubmit={event => {
   event.preventDefault();
   run({ type: 'dispensary.release', patientId, requestId: request.id, recipientChecked: field(event, 'recipient') === 'on' }, 'Sandbox stock released once; handover recorded.');
  }}>
   <div className="iq-compose-head"><h4>Hand it over</h4><p>The last check before the medicine leaves the counter is the only one about who is standing there.</p></div>
   <label className="iq-attest"><input type="checkbox" name="recipient" required/><span>Recipient identity checked</span></label>
   <Button variant="primary" type="submit">Record handover</Button>
  </form>}
 </article>;
}

/* ---- Wearables --------------------------------------------------------------------------------
   A live signal deserves presence, so the reading stands on the same night ground the instrument
   deck at the top of the screen stands on and is read the same way: the figure, the moment it was
   measured, and how old that makes it. Nothing on it is interpreted. There is no reference band
   behind the line and no word about whether the number is good, because no engine here reads a
   sample and concludes anything — packages/catalog/thusoiq.json says so under wearables, and a
   band drawn behind this line would be the screen quietly disagreeing with the kernel. */
function WearablesTool({ work, streaming, setStreaming, now }: { work: Work; streaming: boolean; setStreaming: (on: boolean) => void; now: string }) {
 const { role, state, patientId, patient, run } = work;
 const connection = state.wearableConnections.find(c => c.patientId === patientId)!;
 const samples = state.samples.filter(s => s.patientId === patientId && s.quality === 'accepted');
 const latest = latestSample(state.samples, patientId, 'heart-rate');
 const recent = samples.slice(-24);
 /* The line is scaled to the readings it actually holds, with no floor and no ceiling of its own.
    A fixed scale here would be a reference range drawn behind a wearable sample, and no engine in
    this kernel reads a sample and concludes anything about it. */
 const low = Math.min(...recent.map(s => s.value)), high = Math.max(...recent.map(s => s.value));
 /* The window never closes tighter than ten units around the middle of what arrived. Scaled to its
    own extremes, two samples one beat apart are drawn as a cliff across the panel — a picture of a
    change that did not happen, which is the one thing a line beside a clinical figure must not be. */
 const span = Math.max(high - low, 10), floor = (high + low) / 2 - span / 2;
  const path = recent.map((sample, i, all) => `${all.length === 1 ? 50 : i * 100 / (all.length - 1)},${36 - (sample.value - floor) / span * 32}`).join(' ');
 return <>
  <div className="iq-section-head"><h3>Wearable readings</h3><span>{streaming ? 'Simulator running' : 'Stream paused'}</span></div>
  <div className="iq-signal">
   <div className="iq-signal-say">
    <span className="iq-eyebrow">HEART RATE · SIMULATOR</span>
    <strong className={`iq-signal-value${latest ? '' : ' empty'}`}>{latest?.value ?? '—'}<small>bpm</small></strong>
    <p>{latest ? `Measured ${dateTime(latest.measuredAt)}` : 'Nothing has been received for this patient.'}</p>
   </div>
   <div className="iq-signal-plot">
    {recent.length > 1
     ? <svg className="c-plot iq-spark" viewBox="0 0 100 40" role="img" aria-label={`The last ${recent.length} fictional heart rate samples`} preserveAspectRatio="none">
        <polyline className="c-mark" points={path} vectorEffect="non-scaling-stroke"/>
       </svg>
     : <p className="iq-signal-blank">The line is drawn from the samples this session has received. It needs two before there is anything to draw.</p>}
   </div>
   <dl className="iq-signal-foot">
    <div><dt>Freshness</dt><dd>{freshnessWord[sampleFreshness(latest, now)]}</dd></div>
    <div><dt>Samples held</dt><dd>{samples.length}</dd></div>
    <div><dt>Device</dt><dd>DEMO-WATCH-01</dd></div>
   </dl>
  </div>
  <p className="helper">DEMO-WATCH-01 · Samples every three seconds while this screen is active. No wearable is connected. Device/provider sync determines actual delivery frequency.</p>
  {role !== 'Partner' && <div className="iq-consent">
   <label className="iq-attest">
    <input type="checkbox" checked={connection.consent} onChange={event => {
     setStreaming(false);
     run({ type: 'wearable.connection', patientId, enabled: event.target.checked, consent: event.target.checked }, event.target.checked ? 'Fictional wearable sharing consent recorded.' : 'Sharing revoked and sandbox samples removed.');
    }}/>
    <span>Preview patient consent to share wearable readings</span>
   </label>
   <Outstanding reasons={[...(patient.consent ? [] : [refusal('consent-required')]), ...(connection.consent ? [] : [refusal('wearable-consent-required')])]}/>
   <div className="button-row">
    <Button variant="primary" disabled={!connection.consent || !patient.consent} onClick={() => setStreaming(!streaming)}><Radio size={16} aria-hidden="true"/>{streaming ? 'Pause simulator' : 'Start simulator'}</Button>
   </div>
  </div>}
  <details className="iq-provenance">
   <summary>Readings and provenance · {samples.length}</summary>
   {samples.length === 0
    ? <Nothing title="No readings have been received" say="Withdrawing sharing deletes the samples already received rather than merely closing the tap, so an empty table is what a withdrawal leaves behind."/>
    : <div className="iq-table-wrap"><table>
     <thead><tr><th>Measured</th><th>Received</th><th>Value</th><th>Source</th></tr></thead>
     <tbody>{samples.slice(-20).reverse().map(sample => <tr key={sample.id}>
      <td>{dateTime(sample.measuredAt)}</td><td>{dateTime(sample.receivedAt)}</td><td>{sample.value} {sample.unit}</td><td>{sample.source} · {sample.deviceId}</td>
     </tr>)}</tbody>
    </table></div>}
  </details>
 </>;
}

/** The badge the two dark bands on a clinical screen share. Pale rather than ink: the ink of this
    family measures 1.28 on the night and a disc nobody can see is not a badge. */
const Say = ({ of: Icon }: { of: typeof ArrowRight }) =>
 <span className="iq-glyph" aria-hidden="true"><Icon size={20} strokeWidth={2.1}/></span>;

/* `worklist` is the role's own board — a nurse's day, a doctor's queue, a partner's orders — folded
   into the top of this card rather than stacked above or below it. The three clinical roles used to
   land on the workbench *and* a second screen underneath it: the same person's work, drawn twice,
   with a strip of summary figures between them. A clinician opens this to work a queue, so the queue
   is the first thing in the card and the per-patient workspace is what opens beneath it. */
export function ClinicalWorkbench({ role, worklist }: { role: Role; worklist?: ReactNode }) {
 const { state, execute } = useThusoIQ();
 const [patientId, setPatient] = useState(state.patients[0].id);
 const [tool, setTool] = useState<Tool>(role === 'Partner' ? 'Dispensary' : 'Appointments');
 const [notice, setNotice] = useState('');
 const [error, setError] = useState('');
 const [streaming, setStreaming] = useState(false);
 const [now, setNow] = useState(new Date().toISOString());
 const patient = state.patients.find(p => p.id === patientId)!;
 const consultation = state.consultations.filter(c => c.patientId === patientId).at(-1);
 const connection = state.wearableConnections.find(c => c.patientId === patientId)!;
 const run: Run = (command, message) => {
  try { execute(command); setError(''); setNotice(message); return true; }
  catch (e) { setNotice(''); setError(e instanceof Error ? e.message : 'This action could not be completed.'); return false; }
 };
 useEffect(() => {
  if (!streaming || !connection.enabled || !connection.consent) return;
  const timer = window.setInterval(() => {
   if (document.hidden) return;
   const measuredAt = new Date().toISOString();
   setNow(measuredAt);
   run({ type: 'wearable.ingest', patientId, sample: { id: crypto.randomUUID(), patientId, deviceId: 'DEMO-WATCH-01', metric: 'heart-rate', value: sampleValues[state.samples.length % sampleValues.length], unit: 'bpm', measuredAt, source: 'simulator', quality: 'accepted' } }, 'Simulator sample received.');
  }, 3000);
  return () => clearInterval(timer);
 }, [streaming, connection.enabled, connection.consent, patientId, state.revision]);
 useEffect(() => { const timer = window.setInterval(() => setNow(new Date().toISOString()), 15_000); return () => clearInterval(timer); }, []);
 const choosePatient = (id: string) => { setPatient(id); setStreaming(false); setError(''); setNotice(''); };
 const go = (next: Tool) => { setTool(next); setNotice(''); setError(''); setStreaming(false); };
 const work: Work = { role, state, patientId, patient, consultation, run, go };
 /* The count beside a tool is the number of rows waiting inside it, so the rail says where the work
    is before a person opens all five to find out. A tool with nothing in it shows nothing rather
    than a nought: an empty badge is a mark that has to be read to learn that it means nothing. */
 const counts: Partial<Record<Tool, number>> = {
  Appointments: state.appointments.filter(a => a.patientId === patientId).length,
  Dispensary: state.medicationRequests.filter(r => r.patientId === patientId).length
 };
 return <section className="iq-workbench" aria-label="ThusoIQ clinical workspace">
  {/* The board keeps its own <h1>: it is what the section is, and the dark band below it introduces
      the workspace rather than the page. Two h1 elements on one screen is a reader guessing which
      one they are on, and the heading order this way round is h1 then h2. */}
  {worklist && <div className="iq-worklist">{worklist}</div>}
  {/* The same head the instrument deck at the top of the screen wears: the eyebrow on the left, the
      standing on the right, a hairline under both, and then what the band is for. The two dark
      bands on a clinical screen bracket the work between them, and a reader should be able to see
      that they are the same object twice rather than two dark rectangles that share a colour.
      "Fictional sandbox" is the contract's own standing for this workspace and stays visible on
      every one of them, at every width. */}
  <header className="iq-heading">
   <div className="iq-heading-top">
    <span className="iq-eyebrow"><Cpu size={16} aria-hidden="true"/> THUSOIQ · CLINICAL WORKSPACE</span>
    <Badge variant="neutral" dot className="iq-status">Fictional sandbox</Badge>
   </div>
   <div className="iq-heading-say">
    <h2>{standing[role].before} <Say of={standing[role].glyph}/> {standing[role].after}</h2>
    <p>One patient. Their appointments, clinical record and next action.</p>
   </div>
  </header>
  <div className="iq-layout">
   <aside className="iq-patients" aria-label="Clinical patients">
    <p className="iq-eyebrow">CARE QUEUE</p>
    {state.patients.map(p => <button key={p.id} className={patientId === p.id ? 'selected' : ''} aria-pressed={patientId === p.id} onClick={() => choosePatient(p.id)}>
     <span className="avatar small">{initials(p.name)}</span>
     <span><strong>{p.name}</strong><small>{p.reason}</small><em>{p.consent ? 'Ready for review' : 'Consent outstanding'}</em></span>
     <ArrowUpRight size={15}/>
    </button>)}
    <p className="helper">These patients belong to a separate, in-memory workflow sandbox. No clinical service is delivered here.</p>
   </aside>
   <div className="iq-patient-work">
    <PatientIdentity patient={patient} consultation={consultation}/>
    <div className="iq-tools" role="group" aria-label="Clinical tools">{tools.map(([name, Icon]) =>
     <button key={name} aria-pressed={tool === name} onClick={() => go(name)}>
      <Icon width={18} height={18} aria-hidden="true"/>{name}
      {!!counts[name] && <span className="iq-tool-count">{counts[name]}</span>}
     </button>)}
    </div>
    <div className="iq-tool-body" key={`${patientId}:${tool}`}>
     {tool === 'Appointments' && <AppointmentsTool work={work}/>}
     {tool === 'Consultation' && <ConsultationTool work={work}/>}
     {tool === 'Diagnostic review' && <DiagnosisTool work={work}/>}
     {tool === 'Dispensary' && <DispensaryTool work={work}/>}
     {tool === 'Wearables' && <WearablesTool work={work} streaming={streaming} setStreaming={setStreaming} now={now}/>}
    </div>
    {error && <p className="iq-message error" role="alert"><AlertTriangle size={16} aria-hidden="true"/><span>{error}</span></p>}
    {notice && <p className="iq-message" role="status"><Check size={16} aria-hidden="true"/><span>{notice}</span></p>}
   </div>
  </div>
  <footer className="iq-audit">
   <span><Activity size={15}/> ThusoIQ connection: sandbox adapter</span>
   <details>
    <summary>Activity trail · {state.events.filter(e => e.patientId === patientId).length} events</summary>
    <ol>{state.events.filter(e => e.patientId === patientId).slice(-12).reverse().map(e => <li key={e.sequence}>{e.action.replaceAll('.', ' · ')} — {e.actorId} · {dateTime(e.at)}</li>)}</ol>
   </details>
  </footer>
 </section>;
}
