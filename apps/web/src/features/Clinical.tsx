import { useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BadgeCheck, Check, CircleAlert, ClipboardList, KeyRound, Radio, Sigma, Stethoscope, ShieldCheck, ShieldX, UserCheck, X } from 'lucide-react';
import { Pill } from '../components/UI';
import { ClinicalChart } from '../components/Chart';
import { CodeInput, StepHead } from '../components/Steps';
import { CalibrationCaveat, CalibrationTag, ProvenanceTag, type Source } from '../components/Provenance';
import { KitCapture } from './KitCapture';
import { rules } from '../lib/capture';
import { can } from '../lib/vetting';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';
import { ConsultationComposer, assessmentFields } from './Consultation';
/* Indicative adult reference ranges, used only to flag a value for the nurse's attention.
   This is not a validated triage or early-warning score and it never decides anything. */
export const observations = [
 { id: 'systolic', label: 'Blood pressure — systolic', unit: 'mmHg', range: [90, 140], step: 1, placeholder: '118' },
 { id: 'diastolic', label: 'Blood pressure — diastolic', unit: 'mmHg', range: [60, 90], step: 1, placeholder: '78' },
 { id: 'pulse', label: 'Pulse', unit: 'bpm', range: [50, 100], step: 1, placeholder: '72' },
 { id: 'respiratory', label: 'Respiratory rate', unit: 'breaths/min', range: [12, 20], step: 1, placeholder: '16' },
 { id: 'temperature', label: 'Temperature', unit: '°C', range: [36.1, 37.5], step: 0.1, placeholder: '36.8' },
 { id: 'oxygen', label: 'Oxygen saturation', unit: '%', range: [95, 100], step: 1, placeholder: '98' },
 { id: 'glucose', label: 'Blood glucose', unit: 'mmol/L', range: [4, 7.8], step: 0.1, placeholder: '5.2' }
] as const;
export type ObsId = typeof observations[number]['id'];
export function flagOf(id: ObsId, raw: string) {
 const spec = observations.find(o => o.id === id)!;
 if (!raw.trim()) return 'empty' as const;
 const value = Number(raw);
 if (Number.isNaN(value)) return 'invalid' as const;
 if (value < spec.range[0]) return 'low' as const;
 if (value > spec.range[1]) return 'high' as const;
 return 'normal' as const;
}
/* One identity check in MyThuso, and this is the number it is demonstrated with. The nurse asks for
   it at the door and the doctor asks for it at the start of a teleconsultation — the same code read
   the same way, so a patient learns one thing rather than two. Exported rather than retyped there. */
export const demoVisitCode = '482190';
const stages = ['Identity', 'Consent', 'Observations', 'Findings', 'Sign-off'] as const;
export function VisitAssessment({ reference = 'TH-2048', patient = 'Lerato Molefe', onClose }: { reference?: string; patient?: string; onClose: () => void }) {
 const [stage, setStage] = useState(0);
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
 /* Once the visit is signed off, the step counter has nothing left to count: what follows is the
    consultation record the visit produced, in the standard structure, not a sixth step. */
 if (signed && consultation) return <ConsultationComposer reference={reference} patient={patient} writer="N-205" onClose={onClose}
  readings={[...captured.map(o => ({ id: o.id as string, label: o.label as string, unit: o.unit as string, value: o.value, flagged: o.flag !== 'normal', source: o.source! })),
             ...(meanArterial ? [{ id: 'mean-arterial', label: 'Mean arterial pressure', unit: 'mmHg', value: String(meanArterial), flagged: false, source: derivedSource }] : [])]}
  seed={{ reason: `Home visit · ${reference}`, history: symptoms.length ? `Reported: ${symptoms.join(', ')}.` : '', plan: escalation, notes }}/>;
 return <div className="assessment">
  <StepHead step={stage + 1} total={stages.length} label={stages[stage]}/>
  <div className="review-line"><span>Visit</span><strong>{reference} · {patient}</strong></div>
  {stage === 0 ? <div className="form-stack">
   <h3>Confirm you’re at the right door.</h3>
   <p className="muted">Ask {patient.split(' ')[0]} for the six-digit code in the MyThuso app. In this preview the code is <strong>4821</strong>90.</p>
   <label id="otp-label">Visit code</label>
   <CodeInput value={otp} onChange={v => { setOtp(v); setOtpError(''); }} label="Visit code" describedBy="otp-help" invalid={!!otpError} autoFocus/>
   <p className="helper" id="otp-help" role="status">{otpError || 'The code changes for every visit and expires when the visit ends.'}</p>
   <label className="checkbox"><input type="checkbox" checked={idSeen} onChange={e => setIdSeen(e.target.checked)}/><span>I have seen the patient’s identity document or a household member has confirmed identity.</span></label>
   <div className="privacy-note"><KeyRound size={19}/>If the code fails, the visit does not start. The nurse contacts the Control Tower instead of proceeding.</div>
   <div className="button-row"><button className="secondary" onClick={onClose}><ArrowLeft size={16}/>Leave</button><button className="primary" disabled={otp.length < 6 || !idSeen} onClick={() => otp === demoVisitCode ? setStage(1) : setOtpError('That code doesn’t match this visit. Call the Control Tower before continuing.')}>Confirm identity<ArrowRight size={16}/></button></div>
  </div> : stage === 1 ? <div className="form-stack">
   <h3>Consent, in plain words.</h3>
   <p className="muted">Read these aloud. {patient.split(' ')[0]} can decline any part and still receive the rest of the visit.</p>
   <label className="checkbox"><input type="checkbox" checked={consent.assessment} onChange={e => setConsent({ ...consent, assessment: e.target.checked })}/><span>“May I check your blood pressure, pulse, temperature and other basic readings today?”</span></label>
   <label className="checkbox"><input type="checkbox" checked={consent.record} onChange={e => setConsent({ ...consent, record: e.target.checked })}/><span>“May I add today’s readings to your Health Passport, where a doctor can review them?”</span></label>
   <div className="privacy-note"><ShieldCheck size={19}/>Refusal is recorded as a valid outcome, not a failed visit. A guardian consents for a child or where authority is verified.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStage(0)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!consent.assessment} onClick={() => setStage(2)}>Start observations<ArrowRight size={16}/></button></div>
  </div> : stage === 2 ? <div className="form-stack">
   <h3>Today’s readings</h3>
   <p className="muted">Leave anything you did not measure blank. A number you type is a clinician’s reading; a number the kit takes is an instrument’s. The record keeps them apart because they are different facts, not because one is better.</p>
   <div className="obs-grid">{flags.map(o => <div key={o.id} className={`obs-field ${o.flag}`}>
    <label><span>{o.label}<em>{o.unit}</em></span>
     <input inputMode="decimal" step={o.step} value={o.value} placeholder={o.placeholder} onChange={e => set(o.id, e.target.value.replace(/[^\d.]/g, ''))} aria-describedby={`${o.id}-flag`} aria-invalid={o.flag === 'invalid'}/>
    </label>
    <small id={`${o.id}-flag`} role={o.flag === 'low' || o.flag === 'high' ? 'status' : undefined}>{o.flag === 'invalid' ? 'Enter a number.' : o.flag === 'low' ? `Below the indicative range (${o.range[0]}–${o.range[1]})` : o.flag === 'high' ? `Above the indicative range (${o.range[0]}–${o.range[1]})` : `Indicative range ${o.range[0]}–${o.range[1]}`}</small>
    {o.source && <div className="prov-row">
     <ProvenanceTag source={o.source}/>
     <CalibrationTag source={o.source}/>
     {o.source.provenance !== 'device' && <button type="button" className="text-button" onClick={() => attribute(o.id, o.source!.provenance === 'manual' ? 'patient-reported' : 'manual')}>
      {o.source.provenance === 'manual' ? 'She told me this' : 'No — I measured it'}
     </button>}
    </div>}
    <CalibrationCaveat source={o.source}/>
   </div>)}</div>
   {meanArterial && <div className="panel prov-derived">
    <div className="review-line"><span>Mean arterial pressure <ProvenanceTag source={derivedSource}/></span><strong>{meanArterial} mmHg</strong></div>
    <p className="helper"><Sigma size={13}/><span>Worked out from the two blood-pressure readings, not measured and not typed. It appears when both of them are there and goes when either of them does — a calculated value whose inputs are unknown is not a value.</span></p>
   </div>}
   {/* Collapsed by default, because most readings on most visits are taken by hand and a kit panel
       open over the fields would say otherwise. */}
   <button type="button" className="secondary full" onClick={() => setKit(!kit)}>{kit ? <><X size={16}/>Close the kit</> : <><Radio size={16}/>Take a reading from a paired instrument</>}</button>
   {kit && <KitCapture fields={observations.map(o => ({ id: o.id as string, label: o.label as string, unit: o.unit as string }))} capturer={subjectById('N-205')!}
    onCapture={c => { setValues(current => ({ ...current, [c.observationId]: c.value })); setSources(current => ({ ...current, [c.observationId]: { provenance: 'device', serial: c.serial, calibration: c.calibration, context: c.context } })); }}/>}
   <div className={abnormal.length ? 'privacy-note alert' : 'privacy-note'}><CircleAlert size={19}/>{abnormal.length ? `${abnormal.length} reading${abnormal.length > 1 ? 's are' : ' is'} outside the indicative range. Flagging is a prompt for your judgement — it is not a validated early-warning score and it does not triage the patient.` : 'Readings are compared against indicative adult reference ranges only. Clinical judgement stays with you.'}</div>
   <div className="privacy-note"><CircleAlert size={19}/>{rules.provenanceIsRequired} A field you clear loses its origin along with its number, because there is nothing left to attribute.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStage(1)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!captured.length || invalid} onClick={() => setStage(3)}>Record findings<ArrowRight size={16}/></button></div>
  </div> : stage === 3 ? <div className="form-stack">
   <h3>What did you find?</h3>
   <fieldset className="chip-set"><legend>Reported symptoms</legend>{['Headache', 'Dizziness', 'Shortness of breath', 'Chest pain', 'Swelling', 'Fatigue', 'Nausea', 'None reported'].map(s =>
    <label key={s} className={symptoms.includes(s) ? 'chip selected' : 'chip'}><input type="checkbox" checked={symptoms.includes(s)} onChange={e => setSymptoms(e.target.checked ? [...symptoms.filter(x => x !== 'None reported' || s === 'None reported'), s] : symptoms.filter(x => x !== s))}/>{s}</label>)}</fieldset>
   <label>Visit notes<textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 1200))} placeholder="Observations, medication adherence, home circumstances…" maxLength={1200}/></label>
   <p className="helper">{1200 - notes.length} characters left. Write what the next clinician needs, not everything you noticed.</p>
   <label>Next step<select value={escalation} onChange={e => setEscalation(e.target.value)}>
    <option>No escalation — routine visit</option><option>Refer for doctor review within 24 hours</option><option>Refer for doctor review today</option><option>Advise clinic or emergency department now</option><option>Emergency services called from the home</option>
   </select></label>
   {escalation.includes('Emergency') && <div className="privacy-note alert"><CircleAlert size={19}/>In production this opens the emergency pathway immediately and alerts the Control Tower before the form is finished.</div>}
   <div className="button-row"><button className="secondary" onClick={() => setStage(2)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStage(4)}>Review sign-off<ArrowRight size={16}/></button></div>
  </div> : <div className="form-stack">
   {signed ? <><div className="success-icon"><BadgeCheck size={30}/></div><h3>Demo assessment closed.</h3><p className="muted">Nothing was transmitted, no record was written and no clinician was notified. In production this becomes an append-only entry in the patient’s Health Passport, attributed to your SANC registration.</p>
    <button className="secondary full" onClick={() => setConsultation(true)}><ClipboardList size={17}/>Open the consultation record this produced</button>
    <p className="helper">The readings, the symptoms and the next step are carried across as they were captured. The structure is the same one a doctor writes into, so nobody re-types a visit into a second shape.</p>
    <button className="primary full" onClick={onClose}>Back to the workspace<ArrowRight size={17}/></button></> : <>
    <Pill>Sign-off preview</Pill>
    <h3>{patient} · {reference}</h3>
    {captured.map(o => <div className="review-line" key={o.id}>
     <span>{o.label}<span className="prov-row">{o.source && <ProvenanceTag source={o.source}/>}<CalibrationTag source={o.source}/></span></span>
     <strong className={o.flag === 'normal' ? '' : 'flagged'}>{o.value} {o.unit}{o.flag !== 'normal' && ' ⚠'}</strong>
    </div>)}
    {captured.map(o => <CalibrationCaveat key={o.id} source={o.source}/>)}
    {meanArterial && <div className="review-line"><span>Mean arterial pressure <ProvenanceTag source={derivedSource}/></span><strong>{meanArterial} mmHg</strong></div>}
    <div className="review-line"><span>Symptoms</span><strong>{symptoms.length ? symptoms.join(', ') : 'None recorded'}</strong></div>
    <div className="review-line"><span>Next step</span><strong>{escalation}</strong></div>
    <div className="review-line"><span>Recorded by</span><strong>{signingNurse.name} · {signingNurse.reference}</strong></div>
    <div className="privacy-note"><UserCheck size={19}/>A nurse assessment is not a diagnosis. Prescriptions, sick notes and referrals need a registered doctor to review and sign.</div>
    <div className="button-row"><button className="secondary" onClick={() => setStage(3)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setSigned(true)}><Check size={16}/>Sign demo assessment</button></div>
   </>}
  </div>}
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
export function DoctorReview({ reference = 'TH-2048', onClose }: { reference?: string; onClose: () => void }) {
 const [decision, setDecision] = useState('');
 const [rationale, setRationale] = useState('');
 const [done, setDone] = useState(false);
 const [signing, setSigning] = useState(doctors[0].id);
 const [consultation, setConsultation] = useState(false);
 const doctor = doctors.find(d => d.id === signing)!;
 const maySign = can(doctor, 'sign-clinical-review');
 const mayPrescribe = can(doctor, 'prescribe');
 /* The decision and the record are the same encounter. The doctor's outcome and rationale open the
    consultation already filled in, under the registration that made them — retyping a decision into
    a record is how the two come to say different things. */
 if (consultation) return <ConsultationComposer reference={reference} writer={signing} onClose={onClose}
  /* One of each, on purpose. The blood pressure was taken by hand with a stethoscope and the pulse
     came off the oximeter, and a doctor reading this record can tell which without either of them
     looking like the poor relation. */
  readings={[{ id: 'systolic', label: 'Blood pressure — systolic', unit: 'mmHg', value: '146', flagged: true, source: { provenance: 'manual', by: signingNurse.reference } },
             { id: 'pulse', label: 'Pulse', unit: 'bpm', value: '88', flagged: false, source: { provenance: 'device', serial: 'MT-OX-2210' } }]}
  seed={{ reason: `Nurse referral after a home visit · ${reference}`, history: 'Headache and fatigue reported at the home visit. Systolic trending up over four readings.', plan: decision, [assessmentFields.impression]: rationale }}/>;
 return <div className="form-stack">
  <Pill>Clinical review preview</Pill>
  <h3>{reference} · Lerato Molefe</h3>
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
   <option>Request laboratory tests</option><option>Book a teleconsultation with the patient</option><option>Refer to a facility</option></select></label>
  {!mayPrescribe.allowed && <p className="helper" role="status">{mayPrescribe.reason}</p>}
  <label>Clinical rationale<textarea value={rationale} onChange={e => setRationale(e.target.value.slice(0, 800))} placeholder="Why this decision, for the record and the next clinician…"/></label>
  <div className="privacy-note"><Stethoscope size={19}/>Decision support may summarise or highlight. It never selects the outcome, and every entry is attributed to the signing doctor’s HPCSA registration — which is exactly why an expired one stops the signature rather than annotating it.</div>
  {done ? <><p role="status" className="helper"><Activity size={14}/> Demo decision held in this dialog only, attributed to {doctor.name}. Nothing was issued, prescribed or sent.</p>
   <button className="secondary full" onClick={() => setConsultation(true)}><ClipboardList size={17}/>Write this up as a consultation</button></>
   : <div className="button-row"><button className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={!maySign.allowed || !decision || rationale.trim().length < 10} onClick={() => setDone(true)}><Check size={16}/>Sign demo decision</button></div>}
 </div>;
}
