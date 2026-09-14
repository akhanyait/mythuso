import { useState } from 'react';
import { BadgeCheck, Check, ClipboardList, Lock, NotebookPen, PenLine, ShieldX, Stethoscope, UserCheck } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { CalibrationCaveat, CalibrationTag, ProvenanceTag, type Source } from '../components/Provenance';
import { can, formatEventTime, roleById, type VettingSubject } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';
import schema from '../../../../packages/catalog/records.json';
import { ClinicalDeck, type DeckFigure } from './ClinicalDeck';
import './clinical-records.css';

/* One shape for every encounter. The sections, which of them are required, which capability each
   hangs on and the four SOAP headings all live in packages/catalog/records.json, because a
   structure retyped into a component is a structure that holds only until somebody edits the
   component. Everything below renders whatever it finds in that file.

   Nothing here is written, transmitted or acted on. The patients, the clinicians and their council
   registrations come from the vetting record rather than a placeholder. */
type SectionSpec = { id: string; name: string; required: boolean; note?: string; gatedBy?: string };
type SoapSpec = { id: string; name: string; detail: string };
const spec = schema.consultation;
export const consultationSections = spec.sections as SectionSpec[];
export const soapHeadings = spec.soap as SoapSpec[];
/* Which sections each SOAP heading covers, read off the headings' own descriptions in the data:
   Subjective is what the patient reports, Objective is vitals and examination, Assessment is the
   assessment, Plan is treatment, medicine, tests, referral and follow-up. A section no heading
   claims — the free clinical note — is shown after the four rather than swept under Plan, because
   a heading that means “everything else” has stopped meaning anything. */
const soapCovers: Record<string, string[]> = {
 S: ['reason', 'history'], O: ['observations', 'examination'], A: ['assessment'],
 P: ['plan', 'medication', 'tests', 'referral', 'followup']
};
const claimed = new Set(Object.values(soapCovers).flat());
const outsideSoap = consultationSections.filter(s => s.id !== 'clinician' && !claimed.has(s.id));

/* ---- Fields ------------------------------------------------------------------------------
   A section is one field, so the record's shape is the standard's shape. The assessment is the one
   exception, and it is the exception on purpose — see mayDiagnose. */
export type Field = { id: string; sectionId: string; label: string; placeholder?: string };
export const assessmentFields = { nursing: 'assessment-nursing', impression: 'assessment-impression', diagnosis: 'diagnosis' };
const placeholders: Record<string, string> = {
 reason: 'Why the patient asked to be seen, in their words where it matters…',
 history: 'Onset, duration, what makes it better or worse, medicine already taken…',
 observations: 'Anything measured that the readings above do not carry…',
 examination: 'What you examined, and what you found…',
 plan: 'What is being done about it, by whom, and by when…',
 medication: 'Medicine, dose, frequency, duration and repeats…',
 tests: 'The test, the specimen, and the question it answers…',
 referral: 'To whom, why, and how urgently…',
 followup: 'When, with whom, and what would bring the patient back sooner…',
 notes: 'What the next clinician needs that the sections above do not hold…'
};
function fieldsFor(section: SectionSpec, mayDiagnose: boolean): Field[] {
 if (section.id === 'clinician') return [];                        // the signature block, not something typed
 if (section.id === 'assessment') return mayDiagnose
  ? [{ id: assessmentFields.impression, sectionId: section.id, label: 'Assessment — clinical impression', placeholder: 'What you make of the findings…' },
     { id: assessmentFields.diagnosis, sectionId: section.id, label: 'Diagnosis', placeholder: 'The diagnosis you are accountable for…' }]
  : [{ id: assessmentFields.nursing, sectionId: section.id, label: 'Assessment — recorded by a nurse', placeholder: 'What you found, and what concerns you…' }];
 return [{ id: section.id, sectionId: section.id, label: section.name, placeholder: placeholders[section.id] }];
}
/* Every field the standard can produce, whoever is writing. Used to show a reader what the record
   already holds in fields their own form does not offer. */
const everyField = consultationSections.flatMap(s => {
 const both = [...fieldsFor(s, true), ...fieldsFor(s, false)];
 return both.filter((f, i) => both.findIndex(o => o.id === f.id) === i);
});

/* ---- The record --------------------------------------------------------------------------
   One flat store, keyed by field. SOAP and the long form are two orderings of these same keys, so
   there is nothing for a second set of note boxes to drift away from: switching view rearranges
   the screen and touches no value. */
export type ConsultationDraft = Record<string, string>;
/* A reading arrives here with the origin it was captured under, never without one. The record's
   observations section is the one place in a consultation where a number and a claim about a
   number sit next to each other, so it is the one place the difference has to be legible. */
export type SeededObservation = { id: string; label: string; unit: string; value: string; flagged: boolean; source: Source };
type Signature = { name: string; reference: string; role: string; at: string; diagnosis: boolean };

/* A nurse and a doctor hold different grants in the vetting table, so they are offered different
   forms. These three writers are the three answers a design review needs to see side by side. */
const writers = ['N-205', 'D-401', 'D-402'].map(subjectById).filter((s): s is VettingSubject => !!s);
/* Shape follows the role's grants; permission to write today follows the live vetting decision.
   Keeping those apart matters: a doctor whose registration lapsed is still a doctor, and their
   record is refused outright rather than quietly re-shaped into a nurse's. */
const roleGrants = (subject: VettingSubject, capability: string) =>
 (roleById(subject.roleId)?.grants ?? []).some(g => g.capability === capability);
/* Section names are read from the data, so they arrive cased for a label rather than for a
   sentence. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function ConsultationComposer({ reference = 'TH-2048', patient = 'Lerato Molefe', seed, readings = [], writer: initialWriter, title = 'Consultation record', onClose }:
 { reference?: string; patient?: string; seed?: ConsultationDraft; readings?: SeededObservation[]; writer?: string; title?: string; onClose?: () => void }) {
 const [writerId, setWriterId] = useState(initialWriter ?? writers[0].id);
 const [view, setView] = useState<'record' | 'soap' | 'read'>('record');
 const [record, setRecord] = useState<ConsultationDraft>(seed ?? {});
 const [signature, setSignature] = useState<Signature | null>(null);
 const writer = writers.find(w => w.id === writerId) ?? writers[0];
 const role = roleById(writer.roleId);
 /* There is no “diagnose” capability in the vetting table. The one it grants a doctor and never a
    nurse is signing a clinical decision, so that is what the form asks about. If a narrower
    capability is ever added, this line is the only place that has to change. */
 const mayDiagnose = roleGrants(writer, 'sign-clinical-review');
 const mayWrite = can(writer, 'write-clinical-note');
 const value = (id: string) => (record[id] ?? '').trim();
 const set = (id: string, next: string) => setRecord(current => ({ ...current, [id]: next.slice(0, 1200) }));
 /* Two different refusals, kept apart. A section the role is never granted is not on the form at
    all; a section the role holds but this party's clearance does not currently allow is on the
    form, locked, saying which check took it away. */
 const offered = consultationSections.filter(s => !s.gatedBy || roleGrants(writer, s.gatedBy));
 const neverGranted = consultationSections.filter(s => s.gatedBy && !roleGrants(writer, s.gatedBy));
 const fields = (s: SectionSpec) => fieldsFor(s, mayDiagnose);
 const offeredFields = offered.flatMap(fields);
 const decisionFor = (s: SectionSpec) => s.gatedBy ? can(writer, s.gatedBy) : mayWrite;
 const outstanding = offered.filter(s => s.required && s.id !== 'clinician' && !fields(s).some(f => value(f.id)));
 const filled = offeredFields.filter(f => value(f.id)).length;
 /* Anything the record already holds that this writer is not offered — a nurse's assessment read
    by a doctor, a doctor's prescription read by a nurse. It stays visible and read-only, because
    the point of one structure is that the record does not change when the reader does. */
 const carried = everyField.filter(f => value(f.id) && !offeredFields.some(o => o.id === f.id));

 const field = (f: Field, hideLabel = false) => <label key={f.id}>
  <span className={hideLabel ? 'cr-vh' : 'cr-field-label'}>{f.label}</span>
  <textarea value={record[f.id] ?? ''} disabled={!!signature} placeholder={f.placeholder} maxLength={1200} onChange={e => set(f.id, e.target.value)}/>
 </label>;
 /* Written, for the mark on the spine. A section is written when any field under it holds
    something, which is the same test `outstanding` signs against — one definition, so the mark on
    the document and the refusal at the foot of it can never disagree. */
 const isWritten = (s: SectionSpec) => fields(s).some(f => value(f.id));
 /* Rendered as a call rather than a nested component, so a keystroke re-renders the textarea
    instead of replacing it and taking the caret with it. */
 const body = (s: SectionSpec) => {
  const decision = decisionFor(s);
  const own = fields(s);
  /* One field whose label is the section's own name would print the name twice — once as the
     pane's heading and once over the box. The label stays in the accessibility tree and leaves
     the page, because a heading a sighted reader has already read is not a second instruction. */
  const duplicated = own.length === 1 && own[0].label === s.name;
  return <>
   {s.id === 'observations' && readings.length > 0 && <div className="cr-readings">
    {readings.map(r => <div className="review-line" key={r.id}>
     <span>{r.label}<span className="prov-row"><ProvenanceTag source={r.source}/><CalibrationTag source={r.source}/></span></span>
     <strong className={r.flagged ? 'flagged' : ''}>{r.value} {r.unit}{r.flagged ? ' ⚠' : ''}</strong>
    </div>)}
    {readings.map(r => <CalibrationCaveat key={r.id} source={r.source}/>)}
   </div>}
   {decision.allowed ? own.map(f => field(f, duplicated))
    : <><div className="cr-locked"><Lock size={15}/><span>{s.name} — locked</span></div>
       {/* The reason is worth repeating only where it is this section's own. A form the writer may
           not use at all says so once, at the top, rather than twelve times down the page. */}
       {s.gatedBy && <p className="helper" role="status"><ShieldX size={13}/>{decision.reason}</p>}</>}
   {s.note && <p className="cr-note">{s.note}</p>}
   {s.id === 'assessment' && !mayDiagnose && <>
    <div className="cr-locked"><Lock size={15}/><span>Diagnosis — not recorded. A doctor’s.</span></div>
    <div className="privacy-note"><UserCheck size={19}/>A nurse’s assessment is a different field from a diagnosis, not the same field written by somebody else. {can(writer, 'sign-clinical-review').reason} This record carries no diagnosis until a doctor writes one under their own HPCSA registration.</div>
   </>}
  </>;
 };
 /* A pane is one act of writing: its place in the document, its name, and what is under it. The
    mark fills when the section is written, so how far through the record a clinician is, is a shape
    down the left of it rather than a count they have to make for themselves. */
 const pane = (s: SectionSpec, index: number) => {
  const decision = decisionFor(s);
  const done = isWritten(s);
  return <section className={`cr-pane${done ? ' written' : ''}${decision.allowed ? '' : ' locked'}`} key={s.id}>
   <span className="cr-pane-mark" aria-hidden="true">{!decision.allowed ? <Lock size={15}/> : done ? <Check size={17}/> : index}</span>
   <div className="cr-pane-body">
    <div className="cr-pane-head">
     <h4>{s.name}</h4>
     <span className={s.required ? 'cr-tag required' : 'cr-tag'}>{s.required ? 'Required' : 'Optional'}</span>
    </div>
    {body(s)}
   </div>
  </section>;
 };

 /* The record counting itself. The ring has one arc per field this writer is offered, lit where the
    field holds something — the same test the spine's marks and the refusal at the foot are drawn
    from, so the three can never disagree. Nothing on it moves as somebody types: a mark that filled
    itself under a clinician's hand would be the record animating her own words back at her. */
 const figures: DeckFigure[] = [
  { label: 'Fields written', value: String(filled), unit: `of ${offeredFields.length}`, flagged: false,
    chip: signature ? 'Signed' : 'Draft — not signed',
    shape: { kind: 'ring', segments: offeredFields.map(f => !!value(f.id)) } },
  { label: 'Required sections still to write', value: String(outstanding.length), flagged: false,
    chip: outstanding.length ? 'Before this can be signed' : 'Ready to sign' }
 ];
 return <div className="cr c-page">
  {/* What a reader wants from a record before they read it is whose it is, who is writing it and
      whether it has been signed. Whose is the pale panel; the count and the signature are the glass;
      the sentence under the headline is the record contract's own reason for having one shape. */}
  <ClinicalDeck role="Consultation record" title={title} figures={figures}
   headline={['What this record holds,', { glyph: 'file' }, 'and who may sign it.']}
   note={spec.why}
   panel={<>
    <span className="c-panel-eyebrow">{reference}</span>
    <strong className="c-panel-name">{patient}</strong>
    {/* Who is writing is a fact about whose record this is, so the choice of writer stands beside the
        patient's name rather than floating on the sheet above the first section. */}
    <label className="cr-writer"><span>Writing as</span><select value={writerId} disabled={!!signature} onChange={e => { setWriterId(e.target.value); setSignature(null); }}>
     {writers.map(w => <option key={w.id} value={w.id}>{w.name} · {w.reference}</option>)}
    </select></label>
    <p className="c-panel-line">{role?.name ?? writer.reference}</p>
   </>}>
   <NotConnected of="clinical-records"/>
  </ClinicalDeck>
  <div className="c-sheet cr cr-doc">
  {!mayWrite.allowed && <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayWrite.reason} The form is read-only rather than merely unsignable: an entry nobody may put their registration against is not a record, it is a note that looks like one.</div>}

  {/* One rail, lifted, rather than three underlined words: the same shape the workspace uses for
      its tools, because these are three readings of one record and not three tabs of three. */}
  <div className="cr-views" role="group" aria-label="How to read this record">{([['record', 'Full record'], ['soap', 'SOAP'], ['read', 'As it reads']] as const).map(([id, label]) =>
   <button key={id} aria-pressed={view === id} className={view === id ? 'selected' : ''} onClick={() => setView(id)}>{label}</button>)}</div>
  <p className="helper"><NotebookPen size={13}/>One record, {filled} of {offeredFields.length} fields written. SOAP and the long form are two arrangements of those same fields — switching loses nothing, because there is no second copy of the note to keep in step.</p>

  {view === 'record' ? <div className="cr-panes">{offered.filter(s => s.id !== 'clinician').map((s, i) => pane(s, i + 1))}</div>
   : view === 'soap' ? <div className="cr-panes soap">
    {soapHeadings.map(h => {
     const covered = offered.filter(s => (soapCovers[h.id] ?? []).includes(s.id));
     return <section className="cr-pane soap" key={h.id}>
      <span className="cr-pane-mark letter" aria-hidden="true">{h.id}</span>
      <div className="cr-pane-body">
       <div className="cr-pane-head"><h4>{h.name}</h4></div>
       <p className="cr-note">{h.detail}</p>
       {covered.length ? covered.map(s => <div className="cr-sub" key={s.id}><h5>{s.name}</h5>{body(s)}</div>)
        : <p className="helper"><Lock size={13}/>Nothing under this heading is offered to a {role?.name.toLowerCase()}.</p>}
      </div>
     </section>;
    })}
    {outsideSoap.filter(s => offered.includes(s)).map(s => <section className="cr-pane soap" key={s.id}>
     <span className="cr-pane-mark letter" aria-hidden="true">—</span>
     <div className="cr-pane-body">
      <div className="cr-pane-head"><h4>{s.name}</h4><span className="cr-tag">No SOAP heading claims this</span></div>
      {body(s)}
     </div>
    </section>)}
   </div> : <div className="cr-read">
    {soapHeadings.map(h => {
     const lines = offered.filter(s => (soapCovers[h.id] ?? []).includes(s.id)).flatMap(fields).filter(f => value(f.id));
     return <section className="cr-read-block" key={h.id}>
      <div className="cr-read-head"><span className="cr-pane-mark letter" aria-hidden="true">{h.id}</span><h4>{h.name}</h4></div>
      {lines.length ? lines.map(f => <div className="cr-read-line" key={f.id}><dt>{f.label}</dt><dd>{value(f.id)}</dd></div>)
       : <p className="helper">Nothing written under {h.name.toLowerCase()} yet.</p>}
     </section>;
    })}
    <div className="privacy-note"><ClipboardList size={19}/>Assembled from the fields above every time this view opens. It is a reading of the record rather than a copy of it, so there is nothing here to save and nothing to fall out of step.</div>
   </div>}

  {carried.length > 0 && <div className="cr-appendix">
   <div className="cr-appendix-head"><h4>Already in this record</h4><span className="cr-tag">Read-only</span></div>
   {carried.map(f => <div className="review-line" key={f.id}><span>{f.label}</span><strong>{value(f.id)}</strong></div>)}
   <p className="helper"><Lock size={13}/>Written on another clinician’s form and read-only here. The record does not change shape because the reader did.</p>
  </div>}
  {neverGranted.length > 0 && <div className="privacy-note"><Stethoscope size={19}/>{sentence(neverGranted.map(s => s.name.toLowerCase()).join(', '))} {neverGranted.length > 1 ? 'are' : 'is'} not on this form at all. A {role?.name.toLowerCase()} is never granted {neverGranted.length > 1 ? 'those capabilities' : 'that capability'}, so the section is absent rather than offered and refused after it has been written.</div>}

  {signature ? <div className="cr-signed">
   <div className="cr-signed-head"><span className="success-icon"><BadgeCheck size={28}/></span>
    <div><h4>Consultation signed.</h4><p>This is an append-only entry attributed to that registration. An encounter nobody signs stays a draft rather than quietly counting as a consultation.</p></div>
   </div>
   <div className="review-line"><span>Clinician</span><strong>{signature.name}</strong></div>
   <div className="review-line"><span>Council registration</span><strong>{signature.reference}</strong></div>
   <div className="review-line"><span>Role</span><strong>{signature.role}</strong></div>
   <div className="review-line"><span>Signed</span><strong>{formatEventTime(signature.at)}</strong></div>
   <div className="review-line"><span>Diagnosis</span><strong>{signature.diagnosis ? 'Recorded by the signing doctor' : 'Not recorded — a nurse’s assessment is not a diagnosis'}</strong></div>
   {onClose && <button className="primary full" onClick={onClose}>Close<Check size={17}/></button>}
  </div> : <div className="cr-foot">
   <div className="cr-foot-say">
    <p className="cr-foot-line"><PenLine size={15}/>Draft — {writer.name} has not signed</p>
    <p className="helper" role="status">{outstanding.length
     ? `Outstanding before this can be signed: ${outstanding.map(s => s.name.toLowerCase()).join(', ')}.`
     : 'Every required section is written. Signing attaches the name, the council registration and the moment of signing.'}</p>
   </div>
   <div className="button-row">
    {onClose && <button className="secondary" onClick={onClose}>Close</button>}
    <button className="primary" disabled={!mayWrite.allowed || outstanding.length > 0}
     onClick={() => setSignature({ name: writer.name, reference: writer.reference, role: role?.name ?? '—', at: new Date().toISOString(), diagnosis: mayDiagnose && !!value(assessmentFields.diagnosis) })}>
     <Check size={16}/>Sign consultation
    </button>
   </div>
  </div>}
  </div>
 </div>;
}

/* The structure on its own, for a review that wants the record rather than the flow that produces
   one. */
export function ConsultationRecord({ title, onClose }: { title?: string; onClose?: () => void }) {
 return <ConsultationComposer title={title} onClose={onClose}/>;
}
