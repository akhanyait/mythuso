import { useState } from 'react';
import { VisitSafety } from './FieldSafety';
import { startVisit, visitSigned } from '../lib/field-safety';
import { serviceIdFor } from './Workspaces';
import { Activity, ArrowLeft, ArrowRight, BadgeCheck, Ban, Building2, CalendarClock, Check, CircleAlert, ClipboardList, CloudOff, FlaskConical, Inbox, KeyRound, Pill as PillIcon, Radio, Repeat, Sigma, Stethoscope, ShieldCheck, ShieldX, Undo2, UserCheck, Video, X } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { ClinicalChart } from '../components/Chart';
import { CodeInput } from '../components/Steps';
import { CalibrationCaveat, CalibrationTag, ProvenanceTag, type Source } from '../components/Provenance';
import { KitCapture } from './KitCapture';
import { CaptureStanding, WaitingToSend, useSeededQueue, useSignal, useVisitQueue, useWaitingCount } from './VisitQueue';
import { nextCaptureId, rules, type Capture } from '../lib/capture';
import { hold, isPending, seal } from '../lib/visit-queue';
import { can } from '../lib/vetting';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';
import { ConsultationComposer, assessmentFields } from './Consultation';
import { documentById, refusedDocuments } from '../lib/teleconsult';
import { ClinicalDeck, type DeckFigure } from './ClinicalDeck';
import './clinical-records.css';
/* Indicative adult reference ranges, used only to flag a value for the nurse's attention.
   This is not a validated triage or early-warning score and it never decides anything.

   Not one of the seven is typed here any more. They were, and two native apps were checked against
   this file for it — a number that decides whether a reading is put in front of a doctor, declared
   on a screen. They are in packages/catalog/records.json now and read through lib/observations.ts,
   which is also what the emitter writes into Swift and Kotlin. Re-exported so the screens that
   already import them from here keep one import, and so nothing is tempted into a second copy. */
import { observations, flagOf, observationsNote } from '../lib/observations';
export { observations, flagOf, observationsNote, type ObsId } from '../lib/observations';
/* One identity check in MyThuso, and this is the number it is demonstrated with. The nurse asks for
   it at the door and the doctor asks for it at the start of a teleconsultation — the same code read
   the same way, so a patient learns one thing rather than two. Exported rather than retyped there. */
export const demoVisitCode = '482190';
const stages = ['Identity', 'Consent', 'Observations', 'Findings', 'Sign-off'] as const;
/* WHERE A READING SITS AGAINST ITS OWN RANGE, DRAWN.
   The band is the contract's own low and high, and the ruler runs one band-width either side of it,
   so an in-range reading falls in the middle third and one a little outside is still on the ruler
   rather than pinned to its end. The position concludes nothing that the sentence under the field
   does not already say in words — it is the same arithmetic as flagOf, drawn — and it never moves:
   a mark that slid into place would be a reading being animated, which is the one thing a clinical
   value may never do. */
const rulerMark = (low: number, high: number, raw: string, flag: string) => {
 if (flag === 'empty' || flag === 'invalid') return null;
 const span = high - low;
 return Math.min(100, Math.max(0, ((Number(raw) - (low - span)) / (span * 3)) * 100));
};
export function VisitAssessment({ reference = 'TH-2048', patient = 'Lerato Molefe', onClose }: { reference?: string; patient?: string; onClose: () => void }) {
 const [stage, setStage] = useState(0);
 /* The connection, and what has not left this phone. Held here rather than inside the queue panel
    so the strip at the top of every stage and the panel it opens can never disagree. */
 const signal = useSignal();
 const [queueOpen, setQueueOpen] = useState(false);
 useSeededQueue();
 const queue = useVisitQueue();
 const waiting = useWaitingCount(queue);
 const [otp, setOtp] = useState('');
 const [otpError, setOtpError] = useState('');
 const [idSeen, setIdSeen] = useState(false);
 const [consent, setConsent] = useState({ assessment: false, record: false });
 const [values, setValues] = useState<Record<string, string>>({});
 /* One origin per value, and it is never chosen from a menu. A menu has a first item, a first item
    is a default, and a default is accepted a thousand times without being read — which is exactly
    the “unknown” the capture contract refuses to have. So the origin is a fact about how the number
    arrived: typing it is a clinician measuring and typing, and the kit below is an instrument
    measuring. Re-attributing a typed value to the patient is the one thing a nurse says out loud,
    so it is the one thing there is a control for. */
 const [sources, setSources] = useState<Record<string, Source>>({});
 const [kit, setKit] = useState(false);
 const [symptoms, setSymptoms] = useState<string[]>([]);
 const [notes, setNotes] = useState('');
 const [escalation, setEscalation] = useState('No escalation — routine visit');
 const [signed, setSigned] = useState(false);
 /* A visit assessment is not a second kind of record. It is what a consultation looks like while a
    nurse is still standing in the house, and it produces one — the same twelve sections, seeded
    with what was actually captured, rather than typed out again from memory afterwards. */
 const [consultation, setConsultation] = useState(false);
 const flags = observations.map(o => ({ ...o, value: values[o.id] ?? '', flag: flagOf(o.id, values[o.id] ?? ''), source: sources[o.id] }));
 /* A reading is only carried forward if the record can say where it came from. In this flow that
    can never fail, because every route in sets an origin as it sets the value — which is the point
    of doing it that way rather than asking afterwards. */
 const captured = flags.filter(f => f.flag !== 'empty' && f.flag !== 'invalid' && f.source);
 const abnormal = flags.filter(f => f.flag === 'low' || f.flag === 'high');
 const invalid = flags.some(f => f.flag === 'invalid');
 const set = (id: string, v: string) => {
  setValues({ ...values, [id]: v });
  /* Editing a device reading makes it a typed one, because that is what it now is. An empty field
     loses its origin with its value: there is nothing left to attribute. */
  setSources(current => v.trim()
   ? { ...current, [id]: { provenance: current[id]?.provenance === 'patient-reported' ? 'patient-reported' : 'manual', by: signingNurse.reference, saidBy: `${patient.split(' ')[0]}, at this visit` } }
   : Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
 };
 const attribute = (id: string, provenance: Source['provenance']) => setSources(current => ({ ...current, [id]: { ...current[id], provenance } }));
 /* Calculated, and it names its inputs. It is not in the seven and it is not typed: it appears when
    both of its inputs are there and disappears with either of them, because a derived value whose
    inputs are unknown is not a value. */
 const systolic = Number(values.systolic), diastolic = Number(values.diastolic);
 const meanArterial = values.systolic && values.diastolic && !Number.isNaN(systolic) && !Number.isNaN(diastolic) && systolic > diastolic
  ? Math.round(diastolic + (systolic - diastolic) / 3) : null;
 const derivedSource: Source = { provenance: 'derived', inputs: ['the systolic reading', 'the diastolic reading'] };

 /* ---- Nothing here reaches a record, so everything here is held ------------------------------
    Each stage, on being finished, is put on the queue in lib/visit-queue.ts. Not on being started
    and not on being typed into: what is held is work that is done, so a nurse reading the queue
    reads back the visit rather than a form's autosave. The queue outlives this component, which is
    the point — walking from the bedroom to the car used to lose the assessment. */
 const sealedHere = queue.filter(p => p.visit === reference && isPending(p));
 const holdPart = (kind: Parameters<typeof hold>[0]['kind'], summary: string, detail: [string, string][], readings?: Capture[]) =>
  hold({ kind, visit: reference, patient, summary, detail, readings, by: signingNurse.id, byName: signingNurse.name });
 /* A reading leaves this screen as the same Capture the instrument surface produces, so it is
    answered on arrival by capture.ts's own receive() rather than by a second set of rules. */
 const asCaptures = (): Capture[] => captured.map(o => ({
  id: nextCaptureId(), observationId: o.id, label: o.label, unit: o.unit, value: o.value,
  provenance: o.source!.provenance, serial: o.source!.serial, calibration: o.source!.calibration,
  context: o.source!.context, inputs: o.source!.inputs, saidBy: o.source!.saidBy,
  by: signingNurse.id, byName: signingNurse.name, deviceAt: new Date().toISOString(), state: 'captured'
 }));

 /* Once the visit is signed off, the step counter has nothing left to count: what follows is the
    consultation record the visit produced, in the standard structure, not a sixth step. */
 if (signed && consultation) return <ConsultationComposer reference={reference} patient={patient} writer="N-205" onClose={onClose}
  readings={[...captured.map(o => ({ id: o.id as string, label: o.label as string, unit: o.unit as string, value: o.value, flagged: o.flag !== 'normal', source: o.source! })),
             ...(meanArterial ? [{ id: 'mean-arterial', label: 'Mean arterial pressure', unit: 'mmHg', value: String(meanArterial), flagged: false, source: derivedSource }] : [])]}
  seed={{ reason: `Home visit · ${reference}`, history: symptoms.length ? `Reported: ${symptoms.join(', ')}.` : '', plan: escalation, notes }}/>;
 /* The deck's two figures are the visit counting itself: how many of the five stages are behind her,
    and how many of the seven readings hold a number. The ring has one arc per stage and the gauge is
    the same seven the fields below are, so neither drawing says anything the screen does not. */
 const figures: DeckFigure[] = [
  { label: 'Stages finished', value: String(stage), unit: `of ${stages.length}`, flagged: false, chip: `Now: ${stages[stage]}`,
    shape: { kind: 'ring', segments: stages.map((_, i) => i < stage) } },
  { label: 'Readings recorded', value: String(captured.length), unit: `of ${observations.length}`, flagged: abnormal.length > 0,
    chip: abnormal.length ? `${abnormal.length} outside the indicative range` : 'None outside the indicative range',
    shape: { kind: 'gauge', part: captured.length, whole: observations.length } }
 ];
 return <div className="cr c-page">
  {/* Above the deck, on every stage, because "has any of this left the phone" is a question a nurse
      answers by looking rather than by opening something. */}
  <CaptureStanding online={signal.online} waiting={waiting} open={queueOpen} onToggle={() => setQueueOpen(!queueOpen)}/>
  {queueOpen && <WaitingToSend visit={reference} signal={signal}/>}
  {/* The visit, and where in it she is. The five stages are the deck's pale panel — named, the ones
      behind her filled, the one she is on heavier — because a nurse standing in somebody's kitchen is
      reading "what have I done and what is left", and a row of identical dots answers neither. */}
  <ClinicalDeck role={`Visit ${reference}`} title="Assessments" eyebrow={`Visit ${reference}`} figures={figures}
   headline={[`${patient},`, { glyph: 'clipboard' }, `step ${stage + 1} of ${stages.length}: ${stages[stage].toLowerCase()}.`]}
   note="A stage is held on this phone the moment it is finished, and not before."
   panel={<>
    <span className="c-panel-eyebrow">The visit, stage by stage</span>
    <ol className="cr-rail" aria-label="Stages of this visit">{stages.map((s, i) => <li key={s} className={i < stage ? 'done' : i === stage ? 'now' : ''} aria-current={i === stage ? 'step' : undefined}>
     <span className="cr-rail-mark" aria-hidden="true">{i < stage ? <Check size={15}/> : i + 1}</span>
     <span className="cr-rail-label">{s}{i < stage && <span className="cr-vh">, done</span>}</span>
    </li>)}</ol>
   </>}/>
  <VisitSafety reference={reference}/>
  <div className="c-sheet cr cr-visit">
  {stage === 0 ? <div className="form-stack cr-stage">
   <h3>Confirm you’re at the right door.</h3>
   <p className="muted">Ask {patient.split(' ')[0]} for the six-digit code in the MyThuso app.</p>
   <NotConnected of="clinical-records"/>
   <label id="otp-label">Visit code</label>
   <CodeInput value={otp} onChange={v => { setOtp(v); setOtpError(''); }} label="Visit code" describedBy="otp-help" invalid={!!otpError} autoFocus/>
   <p className="helper" id="otp-help" role="status">{otpError || 'The code changes for every visit and expires when the visit ends.'}</p>
   <label className="checkbox"><input type="checkbox" checked={idSeen} onChange={e => setIdSeen(e.target.checked)}/><span>I have seen the patient’s identity document or a household member has confirmed identity.</span></label>
   <div className="privacy-note"><KeyRound size={19}/>If the code fails, the visit does not start. The nurse contacts the Control Tower instead of proceeding.</div>
   <div className="button-row"><button className="secondary" onClick={onClose}><ArrowLeft size={16}/>Leave</button><button className="primary" disabled={otp.length < 6 || !idSeen} onClick={() => {
     if (otp !== demoVisitCode) { setOtpError('That code doesn’t match this visit. Call the Control Tower before continuing.'); return; }
     holdPart('identity', `Code confirmed at the door for ${patient.split(' ')[0]}`,
      [['Visit code', 'Six digits, matched'], ['Identity', 'Document seen, or a household member confirmed it']]);
     /* appointment.in_progress, as the preview has it: the code matched, so the visit has started and
        so has its timer. */
     startVisit(reference, serviceIdFor(reference), true);
     setStage(1);
    }}>Confirm identity<ArrowRight size={16}/></button></div>
   {/* The code is checked against the visit this phone already had. With no signal there is nothing
       else to check it against, and saying so is better than a tick that means less than it looks. */}
   {!signal.online && <p className="helper" role="status"><CloudOff size={13}/><span>With no signal the code is checked against the visit already on this phone, and checked again by the server when the visit sends. A code that fails then stops the record being filed; it does not undo a visit that has already happened.</span></p>}
  </div> : stage === 1 ? <div className="form-stack cr-stage">
   <h3>Consent, in plain words.</h3>
   <p className="muted">Read these aloud. {patient.split(' ')[0]} can decline any part and still receive the rest of the visit.</p>
   <label className="checkbox"><input type="checkbox" checked={consent.assessment} onChange={e => setConsent({ ...consent, assessment: e.target.checked })}/><span>“May I check your blood pressure, pulse, temperature and other basic readings today?”</span></label>
   <label className="checkbox"><input type="checkbox" checked={consent.record} onChange={e => setConsent({ ...consent, record: e.target.checked })}/><span>“May I add today’s readings to your Health Passport, where a doctor can review them?”</span></label>
   <div className="privacy-note"><ShieldCheck size={19}/>Refusal is recorded as a valid outcome, not a failed visit. A guardian consents for a child or where authority is verified.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStage(0)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!consent.assessment} onClick={() => {
    holdPart('consent', consent.record ? 'Agreed to the assessment and to it reaching a doctor' : 'Agreed to the assessment; declined the Health Passport',
     [['Today’s readings', 'Agreed'], ['Into her Health Passport', consent.record ? 'Agreed' : 'Declined — recorded as a valid outcome']]);
    setStage(2);
   }}>Start observations<ArrowRight size={16}/></button></div>
  </div> : stage === 2 ? <div className="form-stack cr-stage">
   <div className="cr-stage-head">
    <div><h3>Today’s readings</h3>
     <p className="muted">Leave anything you did not measure blank. A number you type is a clinician’s reading; a number the kit takes is an instrument’s. The record keeps them apart because they are different facts, not because one is better.</p></div>
    {/* Two counts, and the second is only drawn when there is something to count. Neither concludes
        anything: one is how many fields hold a number, the other how many of those sit outside the
        range printed under them. */}
    <p className="cr-tally"><strong>{captured.length}</strong><small>of {observations.length} recorded{abnormal.length ? ` · ${abnormal.length} outside range` : ''}</small></p>
   </div>
   <div className="obs-grid cr-obs">{flags.map(o => {
    const mark = rulerMark(o.low, o.high, o.value, o.flag);
    return <div key={o.id} className={`obs-field ${o.flag}`}>
     <label><span>{o.label}<em>{o.unit}</em></span>
      <input inputMode="decimal" step={o.step} value={o.value} placeholder={o.placeholder} onChange={e => set(o.id, e.target.value.replace(/[^\d.]/g, ''))} aria-describedby={`${o.id}-flag`} aria-invalid={o.flag === 'invalid'}/>
     </label>
     {/* The range, drawn. It is the same arithmetic the sentence under it states in words — the
         band is packages/catalog/records.json's own low and high, and the mark is where the typed
         number falls against it. Nothing here moves and nothing here concludes: a reading outside
         the band is drawn outside the band, said in the sentence and never called anything. */}
     <span className={`cr-ruler ${o.flag}`} aria-hidden="true">
      <i className="cr-ruler-band"/>
      {mark !== null && <i className="cr-ruler-at" style={{ left: `${mark}%` }}/>}
     </span>
     <small id={`${o.id}-flag`} role={o.flag === 'low' || o.flag === 'high' ? 'status' : undefined}>{o.flag === 'invalid' ? 'Enter a number.' : o.flag === 'low' ? `Below the indicative range (${o.low}–${o.high})` : o.flag === 'high' ? `Above the indicative range (${o.low}–${o.high})` : `Indicative range ${o.low}–${o.high}`}</small>
     {o.source && <div className="prov-row">
      <ProvenanceTag source={o.source}/>
      <CalibrationTag source={o.source}/>
      {o.source.provenance !== 'device' && <button type="button" className="text-button" onClick={() => attribute(o.id, o.source!.provenance === 'manual' ? 'patient-reported' : 'manual')}>
       {o.source.provenance === 'manual' ? 'She told me this' : 'No — I measured it'}
      </button>}
     </div>}
     <CalibrationCaveat source={o.source}/>
    </div>;
   })}</div>
   {meanArterial && <div className="cr-derived">
    <div className="cr-derived-say"><span>Mean arterial pressure</span><ProvenanceTag source={derivedSource}/></div>
    <strong>{meanArterial}<small>mmHg</small></strong>
    <p className="helper"><Sigma size={13}/><span>Worked out from the two blood-pressure readings, not measured and not typed. It appears when both of them are there and goes when either of them does — a calculated value whose inputs are unknown is not a value.</span></p>
   </div>}
   {/* Collapsed by default, because most readings on most visits are taken by hand and a kit panel
       open over the fields would say otherwise. */}
   <button type="button" className="secondary full" onClick={() => setKit(!kit)}>{kit ? <><X size={16}/>Close the kit</> : <><Radio size={16}/>Take a reading from a paired instrument</>}</button>
   {kit && <KitCapture fields={observations.map(o => ({ id: o.id as string, label: o.label as string, unit: o.unit as string }))} capturer={subjectById('N-205')!}
    onCapture={c => { setValues(current => ({ ...current, [c.observationId]: c.value })); setSources(current => ({ ...current, [c.observationId]: { provenance: 'device', serial: c.serial, calibration: c.calibration, context: c.context } })); }}/>}
   <div className={abnormal.length ? 'privacy-note alert' : 'privacy-note'}><CircleAlert size={19}/>{abnormal.length ? `${abnormal.length} reading${abnormal.length > 1 ? 's are' : ' is'} outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient.` : 'Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you.'}</div>
   <div className="privacy-note"><CircleAlert size={19}/>{rules.provenanceIsRequired} A field you clear loses its origin along with its number, because there is nothing left to attribute.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStage(1)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!captured.length || invalid} onClick={() => {
    holdPart('observations', `${captured.length} ${captured.length === 1 ? 'reading' : 'readings'}, each with where it came from`,
     captured.map(o => [o.label, `${o.value} ${o.unit}`] as [string, string]), asCaptures());
    setStage(3);
   }}>Record findings<ArrowRight size={16}/></button></div>
  </div> : stage === 3 ? <div className="form-stack cr-stage">
   <h3>What did you find?</h3>
   <fieldset className="chip-set"><legend>Reported symptoms</legend>{['Headache', 'Dizziness', 'Shortness of breath', 'Chest pain', 'Swelling', 'Fatigue', 'Nausea', 'None reported'].map(s =>
    <label key={s} className={symptoms.includes(s) ? 'chip selected' : 'chip'}><input type="checkbox" checked={symptoms.includes(s)} onChange={e => setSymptoms(e.target.checked ? [...symptoms.filter(x => x !== 'None reported' || s === 'None reported'), s] : symptoms.filter(x => x !== s))}/>{s}</label>)}</fieldset>
   <label>Visit notes<textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 1200))} placeholder="Observations, medication adherence, home circumstances…" maxLength={1200}/></label>
   <p className="helper">{1200 - notes.length} characters left. Write what the next clinician needs, not everything you noticed.</p>
   <label>Next step<select value={escalation} onChange={e => setEscalation(e.target.value)}>
    <option>No escalation — routine visit</option><option>Refer for doctor review within 24 hours</option><option>Refer for doctor review today</option><option>Advise clinic or emergency department now</option><option>Emergency services called from the home</option>
   </select></label>
   {/* What she has just chosen, in the protocol's own words. The doctor's Protocols screen draws
       this same array; a nurse choosing an escalation should not have to open another screen to
       read what it commits somebody to. */}
   {escalations.filter(([step]) => step === escalation).map(([step, meaning]) => <p className="cr-meaning" key={step}><ArrowRight size={15}/><span>{meaning}</span></p>)}
   {escalation.includes('Emergency') && <div className="privacy-note alert"><CircleAlert size={19}/>Choosing this opens the emergency pathway immediately and alerts the Control Tower before the form is finished. It never waits for the rest of the form.</div>}
   <div className="button-row"><button className="secondary" onClick={() => setStage(2)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => {
    holdPart('findings', symptoms.length ? `${symptoms.join(', ')} · ${escalation.toLowerCase()}` : escalation,
     [['Symptoms', symptoms.length ? symptoms.join(', ') : 'None recorded'], ['Next step', escalation],
      ['Visit notes', notes.trim() ? `${notes.trim().split(/\s+/).length} words` : 'None written']]);
    setStage(4);
   }}>Review sign-off<ArrowRight size={16}/></button></div>
  </div> : <div className="form-stack cr-stage">
   {/* Signed, and what that did depends on whether anything can leave the phone. A closing screen
       that says "this becomes an entry in her Health Passport" while five sealed pieces sit on a
       handset in Ivory Park is the one sentence on this flow that must never be printed wrongly:
       everything downstream — the doctor, the prescription, the referral — is a person believing
       it. So the outcome is written from the queue rather than from the button that was pressed. */}
   {signed ? <><div className="cr-sealed">
    <span className="success-icon"><BadgeCheck size={30}/></span>
    <h3>{sealedHere.length ? 'Assessment sealed.' : 'Assessment closed.'}</h3>
    <p className="muted">{sealedHere.length
     ? `Signed, and held on this phone. ${sealedHere.length} ${sealedHere.length === 1 ? 'piece' : 'pieces'} of this visit are sealed and waiting for a connection: you have done everything that can be done about them. Nothing is in ${patient.split(' ')[0]}’s Health Passport yet and no doctor can read it, so nothing may be relied on downstream until it sends.`
     : 'This becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration. It can be corrected by a later entry and never by editing this one.'}</p>
   </div>
    {/* The queue lives once, above the step counter, and this opens it there rather than drawing a
        second copy of it here. The scroll is instant: a smooth one ignores a reader who has asked
        for stillness, and there is nothing to see on the way. */}
    {sealedHere.length > 0 && <button type="button" className="secondary full" onClick={() => {
     setQueueOpen(true);
     document.querySelector('.vq-strip')?.scrollIntoView({ block: 'start' });
    }}><Inbox size={17}/>See what is waiting, and send it when you have signal</button>}
    <button className="secondary full" onClick={() => setConsultation(true)}><ClipboardList size={17}/>Open the consultation record this produced</button>
    <p className="helper">The readings, the symptoms and the next step are carried across as they were captured. The structure is the same one a doctor writes into, so nobody re-types a visit into a second shape.</p>
    <button className="primary full" onClick={onClose}>Back to the workspace<ArrowRight size={17}/></button></> : <>
    <div className="cr-stage-head"><div><h3>{patient} · {reference}</h3>
     <p className="muted">Everything this visit produced, in the order a doctor reads it.</p></div>
     <p className="cr-tally"><strong>{captured.length}</strong><small>{captured.length === 1 ? 'reading' : 'readings'} carried{abnormal.length ? ` · ${abnormal.length} flagged` : ''}</small></p></div>
    <div className="cr-ledger">
     {captured.map(o => <div className="review-line" key={o.id}>
      <span>{o.label}<span className="prov-row">{o.source && <ProvenanceTag source={o.source}/>}<CalibrationTag source={o.source}/></span></span>
      <strong className={o.flag === 'normal' ? '' : 'flagged'}>{o.value} {o.unit}{o.flag !== 'normal' && ' ⚠'}</strong>
     </div>)}
     {meanArterial && <div className="review-line"><span>Mean arterial pressure <ProvenanceTag source={derivedSource}/></span><strong>{meanArterial} mmHg</strong></div>}
    </div>
    {captured.map(o => <CalibrationCaveat key={o.id} source={o.source}/>)}
    <div className="cr-ledger">
     <div className="review-line"><span>Symptoms</span><strong>{symptoms.length ? symptoms.join(', ') : 'None recorded'}</strong></div>
     <div className="review-line"><span>Next step</span><strong>{escalation}</strong></div>
     <div className="review-line"><span>Recorded by</span><strong>{signingNurse.name} · {signingNurse.reference}</strong></div>
    </div>
    <div className="privacy-note"><UserCheck size={19}/>A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.</div>
    {/* Sealing is the contract's own word for the state she leaves it in: "the nurse has done
        everything they can do". Signing is what does it — one action, not a second button asking
        her to confirm that she has finished the thing she just finished. */}
    <div className="button-row"><button className="secondary" onClick={() => setStage(3)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => {
     holdPart('sign-off', `Signed by ${signingNurse.name}`,
      [['Recorded by', `${signingNurse.name} · ${signingNurse.reference}`], ['Readings carried', `${captured.length}`], ['Next step', escalation]]);
     seal(reference);
     visitSigned(reference);
     setSigned(true);
    }}><Check size={16}/>Sign assessment</button></div>
   </>}
  </div>}
  </div>
 </div>;
}

/* Signing is where vetting has to bite rather than warn. A doctor whose HPCSA registration has
   lapsed is not asked to be careful — the queue refuses the signature, and says which check refused
   it. The switcher exists so both answers can actually be seen in a design review. */
/* The sign-off carries a registration number, so it carries the real one from the vetting record
   rather than a placeholder. A demo number in an attribution line is the one place a preview should
   not be fictional twice over: the reader is being shown what accountability looks like. */
const signingNurse = subjectsByRole('nurse').find(n => n.id === 'N-205')!;
const doctors = subjectsByRole('doctor');
/* What each outcome actually is, once it has been signed.
 *
 * A decision used to end at the word for it. The doctor chose "Adjust medication and issue a
 * prescription", pressed Sign, and the screen offered to write the encounter up — which is a
 * different thing from issuing the prescription, and nowhere in the product could you get from one
 * to the other. Five outcomes, five dead ends, on the screen the whole clinical workflow converges
 * on. There are seven now: the repeat and the return are the two the five were missing.
 *
 * So every outcome names the screen it produces and the door to it is here. Nothing is issued by
 * pressing any of these: each destination carries its own not-connected notice from the contract,
 * and the sentence under the door says what would have to happen for it to be real. The value is
 * that a doctor can walk the whole journey and always see what comes next.
 *
 * Where an outcome produces one of the documents packages/catalog/teleconsult.json governs, it
 * names it rather than describing it: the `condition` and the `limit` are rendered from the
 * contract word for word, because those are the sharpest refusals in the module and a limit a
 * screen paraphrases is a limit that drifts. */
type Continuation = { icon: typeof PillIcon; title: string; body: string; document?: string; action?: string; modal?: string; returns?: boolean };
const continuations: Record<string, Continuation> = {
 'Continue current management, review in one month': {
  icon: CalendarClock, title: 'A review, in one month',
  body: 'Nothing changes today. The patient keeps the medication she is on and a chronic review is due in a month. Scheduling is not connected, so no visit has been booked and nobody has been told — the review is a line in this decision, not an appointment.'
 },
 'Adjust medication and issue a prescription': {
  icon: PillIcon, title: 'The prescription this decision produces', document: 'prescription',
  body: 'Your signature is what makes it a prescription. Open it to set the items, choose the dispensing pharmacy and see what the pharmacist is asked to check — and what a pharmacy that cannot lawfully fill it is refused.',
  action: 'Open the prescription', modal: 'Prescription RX-0081'
 },
 'Repeat the chronic authorisation': {
  icon: Repeat, title: 'The repeat this decision authorises', document: 'repeat',
  body: 'The authorisation is boxed by a period and a quantity and it ends in a review. This decision is that review, so what follows is the pharmacist’s: what may be substituted, what may never be, and how many repeats are left.',
  action: 'Open the authorisation', modal: 'Substitution & repeats'
 },
 'Request laboratory tests': {
  icon: FlaskConical, title: 'The laboratory order this decision produces',
  body: 'The order carries the sample, the seal and the laboratory it is routed to. An abnormal result is never pushed to a patient without a clinician’s explanation, so releasing it is a second, deliberate act of yours — not an automatic notification.',
  action: 'Open the laboratory order', modal: 'Laboratory order LAB-0023'
 },
 'Book a teleconsultation with the patient': {
  icon: Video, title: 'The consultation this decision books',
  body: 'The patient reads the same six-digit visit code at the start of the call that a nurse asks for at the door. Nothing here touches a camera or a microphone, and an encounter that never becomes a consultation may not write an assessment, a plan or a charge.',
  action: 'Open the teleconsultation', modal: 'Teleconsultation call'
 },
 'Refer to a facility': {
  icon: Building2, title: 'The referral letter this decision produces', document: 'referral',
  body: 'What the receiving clinician gets is the reason, the readings behind it and your registration — and nothing else from the patient’s file, because a referral is not a reason to hand over a record.',
  action: 'Write the referral letter'
 },
 'Return it to the nurse with a question': {
  icon: Undo2, title: 'The question this sends back',
  body: 'The case goes back to the nurse who submitted it rather than forward to anybody else. It stays in the queue, marked returned, because a case a doctor could not finish is still a case somebody is waiting on.',
  action: 'Write the question', returns: true
 }
};
/* The two documents no decision here may produce are read from that same contract — a medical
   certificate and an extension of one — and drawn on every signed decision rather than only on the
   ones that came near them. "Can the doctor give me a sick note" is the question a patient asks,
   and the answer must not depend on somebody having remembered it. */
export function DoctorReview({ reference = 'TH-2048', open, onClose }: { reference?: string; open?: (modal: string) => void; onClose: () => void }) {
 const [decision, setDecision] = useState('');
 const [rationale, setRationale] = useState('');
 const [done, setDone] = useState(false);
 const [signing, setSigning] = useState(doctors[0].id);
 const [consultation, setConsultation] = useState(false);
 const [referral, setReferral] = useState(false);
 const [returned, setReturned] = useState(false);
 const doctor = doctors.find(d => d.id === signing)!;
 const maySign = can(doctor, 'sign-clinical-review');
 const mayPrescribe = can(doctor, 'prescribe');
 /* The decision and the record are the same encounter. The doctor's outcome and rationale open the
    consultation already filled in, under the registration that made them — retyping a decision into
    a record is how the two come to say different things. */
 if (returned) return <ReturnToNurse reference={reference} doctor={doctor.name} registration={doctor.reference} onBack={() => setReturned(false)} onClose={onClose}/>;
 if (referral) return <ReferralLetter reference={reference} doctor={doctor.name} registration={doctor.reference} reason={rationale} onBack={() => setReferral(false)} onClose={onClose}/>;
 if (consultation) return <ConsultationComposer reference={reference} writer={signing} onClose={onClose}
  /* One of each, on purpose. The blood pressure was taken by hand with a stethoscope and the pulse
     came off the oximeter, and a doctor reading this record can tell which without either of them
     looking like the poor relation. */
  readings={[{ id: 'systolic', label: 'Blood pressure — systolic', unit: 'mmHg', value: '146', flagged: true, source: { provenance: 'manual', by: signingNurse.reference } },
             { id: 'pulse', label: 'Pulse', unit: 'bpm', value: '88', flagged: false, source: { provenance: 'device', serial: 'MT-OX-2210' } }]}
  seed={{ reason: `Nurse referral after a home visit · ${reference}`, history: 'Headache and fatigue reported at the home visit. Systolic trending up over four readings.', plan: decision, [assessmentFields.impression]: rationale }}/>;
 return <div className="form-stack">
  <h3>{reference} · Lerato Molefe</h3>
  <NotConnected of="screening"/>
  <p className="muted">Submitted by Sister Naledi Mokoena, 4 September 11:24. Two readings were flagged by the nurse.</p>
  <label>Signing doctor<select value={signing} onChange={e => { setSigning(e.target.value); setDone(false); }}>
   {doctors.map(d => <option key={d.id} value={d.id}>{d.name} · {d.reference}</option>)}
  </select></label>
  {!maySign.allowed && <div className="privacy-note alert" role="status"><ShieldX size={19}/>{maySign.reason}</div>}
  <ClinicalChart title="Blood pressure — systolic" unit="mmHg" normal={[90, 140]} readings={[{ label: '12 Aug', value: 128 }, { label: '19 Aug', value: 134 }, { label: '28 Aug', value: 141, note: 'Missed medication' }, { label: '4 Sep', value: 146, note: 'Nurse flagged' }]}/>
  <div className="review-line"><span>Pulse</span><strong>88 bpm</strong></div>
  <div className="review-line"><span>Reported symptoms</span><strong>Headache, fatigue</strong></div>
  <div className="review-line"><span>Nurse’s next step</span><strong>Refer for doctor review within 24 hours</strong></div>
  <label>Your decision<select value={decision} onChange={e => setDecision(e.target.value)} disabled={!maySign.allowed}><option value="">Choose an outcome…</option><option>Continue current management, review in one month</option>
   <option disabled={!mayPrescribe.allowed}>Adjust medication and issue a prescription{mayPrescribe.allowed ? '' : ' — prescribing not verified'}</option>
   <option disabled={!mayPrescribe.allowed}>Repeat the chronic authorisation{mayPrescribe.allowed ? '' : ' — prescribing not verified'}</option>
   <option>Request laboratory tests</option><option>Book a teleconsultation with the patient</option><option>Refer to a facility</option><option>Return it to the nurse with a question</option></select></label>
  {!mayPrescribe.allowed && <p className="helper" role="status">{mayPrescribe.reason}</p>}
  <label>Clinical rationale<textarea value={rationale} onChange={e => setRationale(e.target.value.slice(0, 800))} placeholder="Why this decision, for the record and the next clinician…"/></label>
  <div className="privacy-note"><Stethoscope size={19}/>Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration — which is exactly why an expired one stops the signature rather than annotating it.</div>
  {done ? <><p role="status" className="helper"><Activity size={14}/> Signed by {doctor.name} · {doctor.reference}. A decision is attributed to the registration that made it.</p>
   {/* The decision, and then the thing the decision is. A signed outcome that offers only "write
       this up" leaves the patient exactly where she was: the prescription, the laboratory order,
       the consultation and the referral are what the review was for. */}
   {(() => { const next = continuations[decision]; if (!next) return null; const Icon = next.icon;
    const doc = next.document ? documentById(next.document) : null;
    return <><div className="panel next-step">
     <span className="service-icon"><Icon size={22}/></span>
     <div><h3>{next.title}</h3><p>{next.body}</p>
      {/* When it may be issued at all — the contract's sentence, not a paraphrase of it. */}
      {doc && <p><strong>When it may be issued: </strong>{doc.condition}</p>}</div>
     {next.action && (next.modal
      ? open && <button className="primary" onClick={() => open(next.modal!)}>{next.action}<ArrowRight size={16}/></button>
      : <button className="primary" onClick={() => next.returns ? setReturned(true) : setReferral(true)}>{next.action}<ArrowRight size={16}/></button>)}
    </div>
    {/* And the limit on it, which is the sharpest sentence in the module and is rendered word for
        word: a limit a screen paraphrases is a limit that drifts. */}
    {doc && <div className="privacy-note"><CircleAlert size={19}/>{doc.limit}</div>}</>; })()}
   {/* And what no decision on this screen may produce, whichever one was taken. */}
   <div className="panel">
    <h3>What this decision may not produce</h3>
    {refusedDocuments.map(d => <div className="record-row static" key={d.id}>
     <span className="service-icon check-declined"><Ban size={20}/></span>
     <span><strong>{d.name}</strong><small>{d.condition}</small><small>{d.limit}</small></span>
    </div>)}
   </div>
   <button className="secondary full" onClick={() => setConsultation(true)}><ClipboardList size={17}/>Write this up as a consultation</button>
   <button className="secondary full" onClick={onClose}>Back to the queue<ArrowRight size={16}/></button></>
   : <div className="button-row"><button className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={!maySign.allowed || !decision || rationale.trim().length < 10} onClick={() => setDone(true)}><Check size={16}/>Sign decision</button></div>}
 </div>;
}

/* ---- A referral, and the file it does not send ---------------------------------------------------
 *
 * "Refer to a facility" was one of five outcomes with nothing behind it. What a referral actually
 * is, is a short letter: who is being sent, why, what was measured, and who is accountable for
 * saying so. What it is not is a copy of the record — a facility that needs the patient's history
 * asks the patient, or asks MyThuso with the patient's consent, and the difference between those
 * two is the whole of why a referral is drawn as a letter here rather than as a share button.
 *
 * Nothing is sent. There is no directory of facilities to send it to, no secure channel to send it
 * over and no consent captured for it, and the screen says all three rather than one of them. */
const referralUnits = ['Emergency department', 'Hypertension clinic', 'Cardiology outpatients', 'Antenatal clinic', 'Wound care clinic'];
/* Exported because the patient file's Referral action produces this same letter for whoever the
   file is open on. One referral screen, two doors: a doctor who signs "refer to a facility" on a
   review and a doctor who presses Referral on a file are writing the same document, and two copies
   of it would drift the moment somebody edited one. */
export function ReferralLetter({ reference, patient = 'Lerato Molefe', doctor, registration, reason, onBack, onClose }:
 { reference: string; patient?: string; doctor: string; registration: string; reason: string; onBack?: () => void; onClose: () => void }) {
 const [unit, setUnit] = useState('');
 const [urgency, setUrgency] = useState('Within 24 hours');
 const [note, setNote] = useState(reason);
 const [written, setWritten] = useState(false);
 if (written) return <div className="form-stack">
  <div className="success-icon"><BadgeCheck size={30}/></div>
  <h3>The referral is written.</h3>
  <p className="muted">It is attributed to {doctor} · {registration}, it names the readings behind it, and it asks for {urgency.toLowerCase()}. It has not left this screen.</p>
  <div className="privacy-note"><ShieldCheck size={19}/>Nothing was transmitted. There is no facility directory to address it to, no secure channel to carry it and no consent recorded for sending clinical information to a third party — and a referral needs all three before it is anything but a document.</div>
  <div className="privacy-note"><UserCheck size={19}/>What the receiving clinician would get is this letter. The patient’s Health Passport does not travel with it: a referral is not a reason to hand over a record.</div>
  {onBack && <button className="secondary full" onClick={onBack}><ArrowLeft size={16}/>Back to the decision</button>}
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
 return <div className="form-stack">
  <h3>Referral · {reference} · {patient}</h3>
  <NotConnected of="clinical-records"/>
  <label>Refer to<select value={unit} onChange={e => setUnit(e.target.value)}><option value="">Choose a unit…</option>{referralUnits.map(u => <option key={u}>{u}</option>)}</select></label>
  <p className="helper">These are unit types, not named facilities. No hospital, practice or organisation is named anywhere in this preview.</p>
  <label>How soon<select value={urgency} onChange={e => setUrgency(e.target.value)}><option>Same day</option><option>Within 24 hours</option><option>Within a week</option><option>Routine</option></select></label>
  <label>What the receiving clinician needs to know<textarea value={note} onChange={e => setNote(e.target.value.slice(0, 900))} placeholder="Why you are referring, and what you have already done…"/></label>
  <div className="panel">
   <div className="review-line"><span>Readings enclosed</span><strong>Blood pressure 146/94 · Pulse 88 bpm</strong></div>
   <div className="review-line"><span>Taken by</span><strong>{signingNurse.name} · {signingNurse.reference}</strong></div>
   <div className="review-line"><span>Referred by</span><strong>{doctor} · {registration}</strong></div>
  </div>
  <div className="privacy-note"><CircleAlert size={19}/>A referral does not discharge the patient from MyThuso and it does not close the visit. Somebody here still has to find out whether she went.</div>
  <div className="button-row"><button className="secondary" onClick={onBack ?? onClose}><ArrowLeft size={16}/>Back</button>
   <button className="primary" disabled={!unit || note.trim().length < 10} onClick={() => setWritten(true)}><Check size={16}/>Write the referral</button></div>
 </div>;
}

/* ---- The reference a doctor reviews against -------------------------------------------------------
 *
 * "Protocols" was a card with one button on it that opened a dialog saying the workflow is not
 * drawn yet. It is the one section in the doctor's workspace that needs no service behind it to be
 * real: the reference ranges are already in the record contract, the line at which decision support
 * stops is already in the vetting contract, and the escalation ladder is already the select on the
 * nurse's findings step. Nothing here is new information. What was missing was a screen that says it
 * in one place, which is what a protocol is.
 *
 * Every figure below is read from the thing that enforces it. If a range moves in records.json the
 * table moves with it, and a protocol that can disagree with the software is worse than none.
 */
const escalations = [
 ['No escalation — routine visit', 'The readings are inside their indicative ranges and nothing the nurse saw contradicts them. The record still goes to a doctor; the patient is not waiting on it.'],
 ['Refer for doctor review within 24 hours', 'One or more readings are outside range, or the trend is. The case joins the review queue with its flag and its waiting time.'],
 ['Refer for doctor review today', 'The nurse wants a doctor on it before the end of the day. It goes to the top of the queue by waiting time, not by anybody overriding the order.'],
 ['Advise clinic or emergency department now', 'MyThuso is not the right place for this. The nurse says so at the house and does not wait for a review to agree with her.'],
 ['Emergency services called from the home', 'The pathway opens immediately and the Control Tower is alerted before the form is finished. It never waits for the rest of the form.']
] as const;
/* Who may do what, and the two rows where the answer is nobody. It was five lines of a label and a
   bolded value, which drew "nobody but a doctor" in the same shape as "a doctor whose registration
   is verified" — a refusal and a permission told apart by a colour. The mark says which kind of row
   it is before the sentence does. */
const supportLines = [
 ['May summarise a case, highlight a reading, and order a queue', 'Decision support', true],
 ['May select the outcome', 'Nobody but a doctor', false],
 ['May sign a clinical review', 'A doctor whose HPCSA registration is verified', true],
 ['May issue a prescription', 'A doctor whose prescribing is separately verified', true],
 ['May diagnose from a nurse assessment', 'Nobody. An assessment is not a diagnosis', false]
] as const;
export function ClinicalProtocols() {
 /* The rows where the answer is nobody — the two the list below draws with a struck mark rather than a
    tick. The ring is those five rows, lit where the answer is nobody, so it counts nothing the list
    does not; the seven arcs on the lead are the seven rows of the table. */
 const nobody = supportLines.filter(([, , held]) => !held).length;
 const figures: DeckFigure[] = [
  { label: 'Readings, each flagged against its own range', value: String(observations.length), chip: 'Indicative adult ranges', flagged: false,
    shape: { kind: 'ring', segments: observations.map(() => false) } },
  { label: 'Steps a nurse may escalate to', value: String(escalations.length), chip: 'Chosen by the nurse, never for her', flagged: false },
  { label: 'Acts where the answer is nobody', value: String(nobody), chip: `Of the ${supportLines.length} on this page`, flagged: false,
    shape: { kind: 'ring', segments: supportLines.map(([, , held]) => !held) } }
 ];
 return <div className="cr c-page">
  {/* The one sentence that qualifies every range on this screen is the deck's own note, rendered from
      the consultation standard rather than written here. */}
  <ClinicalDeck role="Protocols" title="Protocols" figures={figures}
   headline={['Where a reading is flagged,', { glyph: 'ruler' }, 'and where a doctor takes over.']}
   note={observationsNote}>
   <NotConnected of="screening"/>
   <p className="c-deck-aside">The reference a case is read against, and the line at which decision support stops and a registered doctor starts.</p>
  </ClinicalDeck>
  <div className="c-sheet cr cr-protocols">
  <div className="cr-panel">
   <table className="cr-ranges">
    <caption>Indicative adult ranges only. They flag a value for a clinician’s attention. They are not a validated triage or early-warning score, they are not adjusted for age, pregnancy or comorbidity, and nothing in MyThuso decides anything from them.</caption>
    <thead><tr><th scope="col">Observation</th><th scope="col">Where a reading is flagged</th><th scope="col">Low</th><th scope="col">High</th><th scope="col">Unit</th></tr></thead>
    <tbody>{observations.map(o => <tr key={o.id}>
     <th scope="row">{o.label}</th>
     {/* The drawing and the sentence are one cell, and the sentence is what a screen reader is
         given: a band with no numbers on it is a picture of a range rather than a range. The three
         columns after it carry the same figures again, because a chart in this product is always
         also a table. */}
     <td className="cr-ranges-plot">
      <span className="cr-ruler protocol" aria-hidden="true">
       <i className="cr-ruler-band"/>
       <em className="cr-ruler-zone low">Low</em>
       <b className="cr-ruler-figure">{o.low}–{o.high}</b>
       <em className="cr-ruler-zone high">High</em>
      </span>
      <span className="cr-vh">Below {o.low} {o.unit} is flagged low, {o.low} to {o.high} is inside the indicative range, above {o.high} is flagged high.</span>
     </td>
     <td>{o.low}</td><td>{o.high}</td><td>{o.unit}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <p className="helper">This table is the same array the nurse’s observation fields flag against and the same one the patient file draws its trend bands from. There is one copy of a reference range in this product. The band above each row is the same ruler drawn under the nurse’s own fields, so a doctor and a nurse are reading one shape.</p>

  <SectionTitle title="Where decision support stops"/>
  <ul className="cr-rules">{supportLines.map(([may, who, held]) => <li key={may} className={held ? '' : 'refused'}>
   <span className="cr-rules-mark" aria-hidden="true">{held ? <Check size={17}/> : <Ban size={17}/>}</span>
   {/* The holder is labelled only where there is one. "Held by nobody" over "Nobody but a doctor"
       was the same word twice, and the row already says which kind it is in the mark and the
       ground it sits on. */}
   <div><strong>{may}</strong><small>{held && 'Held by'}<em>{who}</em></small></div>
  </li>)}</ul>
  <div className="privacy-note"><Stethoscope size={19}/>Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration — which is exactly why an expired one stops the signature rather than annotating it.</div>
  <div className="privacy-note"><CircleAlert size={19}/>{rules.provenanceIsRequired}</div>

  <SectionTitle title="What a nurse may escalate to, and what each one means"/>
  {/* A ladder rather than five cards: the order is the whole of the information, and five boxes of
      equal weight in a column hid it. The rung is the step, and the sentence under it is what that
      step commits somebody else to. */}
  <ol className="cr-ladder">{escalations.map(([step, meaning], i) => <li key={step}>
   <span className="cr-ladder-no" aria-hidden="true">{i + 1}</span>
   <div><strong>{step}</strong><p>{meaning}</p></div>
  </li>)}</ol>
  <div className="privacy-note"><ShieldCheck size={19}/>A nurse chooses the escalation. Nothing in this product raises or lowers one on her behalf, and the Control Tower has no control that would let it.</div>
  </div>
 </div>;
}

/* ---- Where a case can go, and who may send it there ---------------------------------------------
 *
 * "Referral pathway" was a name in the doctor's More tools with the roadmap fallback behind it. It
 * is not a workflow that needs building — it is the one question a doctor asks about a case they
 * cannot finish, and every answer to it already exists somewhere in this product. Putting the five
 * of them on one screen, with who may take each one and what it produces, is the whole of it.
 *
 * The ladder is the same array the protocols screen draws, because a nurse's escalation and a
 * doctor's referral are two ends of one pathway and two copies of it would drift. */
const pathway = [
 { to: 'Back to the patient, with a plan', who: 'The reviewing doctor', makes: 'A consultation record and, if the medication changes, a prescription.' },
 { to: 'A teleconsultation', who: 'The reviewing doctor', makes: 'A booked call the patient joins with the same six-digit code a nurse asks for at the door.' },
 { to: 'Another home visit', who: 'The Control Tower, on the doctor’s instruction', makes: 'A visit on the dispatch board, offered only to a nurse vetting has cleared.' },
 { to: 'A facility, by letter', who: 'The reviewing doctor', makes: 'A referral letter carrying the reason, the readings and the registration — and nothing else from the file.' },
 { to: 'Emergency services', who: 'Anybody, at any point', makes: 'A call. It never waits for a review, a form or a decision on this screen.' }
];
export function ReferralPathway() {
 return <>
  <h3>Where a case can go from here</h3>
  <NotConnected of="screening"/>
  <p className="muted">Five destinations, and who may send a case to each. Nothing on this screen sends anything: it is the map a doctor reads before they choose an outcome on the review.</p>
  <div className="panel">{pathway.map(step => <div className="record-row static" key={step.to}>
   <span className="service-icon"><ArrowRight size={20}/></span>
   <span><strong>{step.to}</strong><small>{step.who}</small><small>{step.makes}</small></span>
  </div>)}</div>
  <SectionTitle title="And what a nurse may escalate to, from the house"/>
  <div className="panel">{escalations.map(([step, meaning]) => <div className="record-row static" key={step}>
   <span className="service-icon"><ArrowRight size={20}/></span>
   <span><strong>{step}</strong><small>{meaning}</small></span>
  </div>)}</div>
  <div className="privacy-note"><ShieldCheck size={19}/>A referral leaves MyThuso and the patient’s record does not go with it. What the receiving clinician gets is a letter — the reason, the readings behind it and the registration that wrote it.</div>
  <div className="privacy-note"><CircleAlert size={19}/>A referral does not discharge the patient from MyThuso and it does not close the visit. Somebody here still has to find out whether she went.</div>
 </>;
}

/* ---- Returning a case, which is not the same as finishing one -------------------------------------
 *
 * Five outcomes, and every one of them sent the case onward. There was nothing a doctor could do
 * with a case they could not read — a photograph that shows nothing, a reading that cannot be
 * right, a history that contradicts itself — except sign a decision they did not believe or leave
 * the case in the queue with no sign anybody had looked at it.
 *
 * So a case can go back. It goes back to the nurse who submitted it and to nobody else, it stays in
 * the queue rather than leaving it, and it carries a question rather than a rejection: the nurse is
 * the only person who was in the room, and what a doctor needs from her is an answer. */
const nurseQuestions = [
 'Was the blood pressure taken on the same arm as the previous readings?',
 'Was the cuff the right size for this patient?',
 'Had she taken her medication before you measured?',
 'Can you describe what the wound looked like, in your own words?',
 'Is there anybody in the house who can confirm the history?'
];
function ReturnToNurse({ reference, doctor, registration, onBack, onClose }:
 { reference: string; doctor: string; registration: string; onBack: () => void; onClose: () => void }) {
 const [question, setQuestion] = useState('');
 const [note, setNote] = useState('');
 const [sent, setSent] = useState(false);
 if (sent) return <div className="form-stack">
  <div className="success-icon"><Undo2 size={30}/></div>
  <h3>The case is back with {signingNurse.name}.</h3>
  <p className="muted">It is attributed to {doctor} · {registration} and it stays in the review queue, marked returned, until she answers. Returning a case does not close it and does not stop the clock on it.</p>
  <div className="review-line"><span>What you asked</span><strong>{question}</strong></div>
  <div className="privacy-note"><ShieldCheck size={19}/>Nothing was sent. Messaging is not connected, so the nurse has not been told, and a question nobody can deliver is a question the queue is still holding.</div>
  <div className="privacy-note"><UserCheck size={19}/>A returned case is not a rejected one. Nothing about it is recorded against the nurse, and it is not a finding on her record — she was the only person in the room, and asking her is what a review is for.</div>
  {onBack && <button className="secondary full" onClick={onBack}><ArrowLeft size={16}/>Back to the decision</button>}
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
 return <div className="form-stack">
  <h3>Return {reference} to {signingNurse.name}</h3>
  <NotConnected of="messaging"/>
  <label>What you need to know<select value={question} onChange={e => setQuestion(e.target.value)}>
   <option value="">Choose a question…</option>{nurseQuestions.map(q => <option key={q}>{q}</option>)}
  </select></label>
  <label>Anything else she should know<textarea value={note} onChange={e => setNote(e.target.value.slice(0, 600))} placeholder="Context for the question, not an instruction…"/></label>
  <div className="privacy-note"><CircleAlert size={19}/>A returned case stays in the queue and keeps its waiting time. It is not sent to the back of the line, and nothing here marks it as the nurse’s fault.</div>
  <div className="button-row"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>Back</button>
   <button className="primary" disabled={!question} onClick={() => setSent(true)}><Undo2 size={16}/>Return it with this question</button></div>
 </div>;
}
