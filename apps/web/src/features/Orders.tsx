import { useState } from 'react';
import { ArrowRight, BadgeCheck, Check, CircleAlert, FlaskConical, Pill as PillIcon, Repeat, ShieldCheck, ShieldX } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { crossReference } from '../lib/dispensing';
import { can } from '../lib/vetting';
import { subjectsByRole } from '../lib/vetting-fixtures';
/* A partner is a vetted party like any other. Routing a prescription and releasing a result are
   both capabilities in packages/catalog/vetting.json, so the two screens ask the same module the
   dispatch board asks rather than trusting that a partner on the list is a partner in good standing. */
const pharmacies = subjectsByRole('pharmacy');
const laboratories = subjectsByRole('laboratory');
/* Both screens attribute the order to a doctor, and the attribution line is where a reader is shown
   what accountability looks like — so the registration is the one on the vetting record rather than
   a row of zeros. A placeholder there is the one place a preview should not be fictional twice
   over: fictional doctor, real-looking number, nothing behind either. */
const prescriber = subjectsByRole('doctor').find(d => d.id === 'D-401')!;
type Step = { label: string; detail: string; at?: string; state: 'done' | 'active' | 'waiting' };
function Timeline({ steps }: { steps: Step[] }) {
 return <ol className="timeline">{steps.map(s => <li key={s.label} className={s.state}>
  <span className="timeline-dot">{s.state === 'done' ? <Check size={12}/> : null}</span>
  <div><strong>{s.label}</strong><small>{s.detail}</small>{s.at && <em>{s.at}</em>}</div>
 </li>)}</ol>;
}
const medicines = [
 { name: 'Amlodipine 5 mg', form: 'Tablet', dose: 'One tablet each morning', quantity: '30 tablets', repeats: '5 repeats', note: 'Take with or without food. Report ankle swelling.' },
 { name: 'Hydrochlorothiazide 12.5 mg', form: 'Tablet', dose: 'One tablet each morning', quantity: '30 tablets', repeats: '5 repeats', note: 'Take early in the day.' }
];
export function PrescriptionDetail({ reference = 'RX-0081', open }: { reference?: string; open?: (m: string) => void }) {
 const [checked, setChecked] = useState<string[]>([]);
 /* The script ended at "Pharmacist check · 0 of 2 items checked" and stopped. Checking both items
    left the timeline exactly where it was: dispensed, sealed and handed over all stayed grey, and
    there was no control anywhere on the screen that would have moved them. A partner's whole job is
    the three steps that were missing. They are here, in order, each one refusing to happen until
    the one before it has — and the seal is the thing that makes a handover checkable, so it is
    entered rather than assumed. */
 const [sealed, setSealed] = useState(false);
 const [handover, setHandover] = useState('');
 const [chosen, setChosen] = useState(pharmacies[0].id);
 const pharmacy = pharmacies.find(p => p.id === chosen)!;
 const mayDispense = can(pharmacy, 'dispense');
 const allChecked = checked.length === medicines.length;
 /* Derived from the reference rather than typed beside it: a seal number that does not follow the
    script it seals is a number that can be right about the wrong parcel. */
 const seal = `SEAL-${reference.replace(/\D/g, '')}`;
 return <div className="form-stack">
  {/* The chip is the state, not a label. It read "Awaiting pharmacist" through the whole journey —
      through both items being checked, through the seal being entered and through the handover
      being chosen — so the one element on the screen whose entire job is to say where the script
      has got to was the one element that never moved. */}
  <div className="order-head"><span className="service-icon"><PillIcon size={22}/></span><div><h3>{reference}</h3><p className="muted">Issued 4 September · Valid for 6 months</p></div>
   <Pill tone={handover ? 'teal' : 'plain'}>{!mayDispense.allowed ? 'Held' : handover ? 'Handed over' : sealed ? 'Sealed' : allChecked ? 'Checked' : 'Awaiting pharmacist'}</Pill></div>
  <div className="review-line"><span>Patient</span><strong>Lerato Molefe · 01/01/1980</strong></div>
  <div className="review-line"><span>Prescriber</span><strong>{prescriber.name} · {prescriber.reference}</strong></div>
  <label>Dispensing pharmacy<select value={chosen} onChange={e => { setChosen(e.target.value); setChecked([]); setSealed(false); setHandover(''); }}>
   {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} · {p.reference}</option>)}
  </select></label>
  {!mayDispense.allowed && <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayDispense.reason}</div>}
  <NotConnected of="dispensing"/>
  <div className="panel">{medicines.map(m => <div className="medicine-row" key={m.name}>
    <label className="checkbox"><input type="checkbox" disabled={!mayDispense.allowed} checked={checked.includes(m.name)} onChange={e => setChecked(e.target.checked ? [...checked, m.name] : checked.filter(x => x !== m.name))} aria-label={`Mark ${m.name} checked by pharmacist`}/><span/></label>
    <div><strong>{m.name}</strong><small>{m.form} · {m.dose}</small><small>{m.quantity} · {m.repeats}</small><em>{m.note}</em></div>
  </div>)}</div>
  {/* Substitution is the one decision on this screen that is not the pharmacist's to make freely,
      and it is a screen of its own — section 22F, the four statutory exceptions, and the words said
      to the patient. A partner who cannot get to it from the script they are filling will make the
      decision here instead, without any of that in front of them. */}
  {open && <button className="secondary full" onClick={() => open('Substitution & repeats')}><Repeat size={16}/>Check what may be substituted, and what may not</button>}
  <Timeline steps={[
    { label: 'Prescribed', detail: 'Signed by the reviewing doctor', at: '4 September, 11:41', state: 'done' },
    { label: 'Sent to pharmacy', detail: mayDispense.allowed ? 'Encrypted transfer to the dispensing partner' : 'Held. The script is not routed to a pharmacy that cannot lawfully fill it', at: mayDispense.allowed ? '4 September, 11:42' : undefined, state: mayDispense.allowed ? 'done' : 'waiting' },
    { label: 'Pharmacist check', detail: `${checked.length} of ${medicines.length} items checked by the pharmacist`, state: allChecked ? 'done' : mayDispense.allowed ? 'active' : 'waiting' },
    { label: 'Dispensed and sealed', detail: sealed ? `Sealed under ${seal}. The number travels with the parcel and is read back at the door` : 'Tamper-evident seal number recorded', state: sealed ? 'done' : allChecked ? 'active' : 'waiting' },
    { label: handover === 'Collected at the pharmacy' ? 'Collected by the patient' : 'Delivered to the patient', detail: handover ? `${handover}. Identity confirmed before anything changes hands` : 'Signature or visit-code handover', state: handover ? 'done' : sealed ? 'active' : 'waiting' }
  ]}/>
  {/* Each control appears when the step before it is done, rather than sitting greyed out from the
      start. A row of four disabled buttons is a screen telling a pharmacist what they cannot do. */}
  {mayDispense.allowed && !sealed && <>
   <button className="primary" disabled={!allChecked} onClick={() => setSealed(true)}><Check size={16}/>Dispense and seal</button>
   {!allChecked && <p className="helper" role="status">Every item is checked by the pharmacist before anything is sealed. {medicines.length - checked.length} still to check.</p>}
  </>}
  {sealed && !handover && <>
   <div className="review-line"><span>Seal number</span><strong>{seal}</strong></div>
   <label>How it reaches the patient<select value={handover} onChange={e => setHandover(e.target.value)}>
    <option value="">Choose a handover…</option><option>Collected at the pharmacy</option><option>Delivered by courier</option><option>Handed over at the next nurse visit</option>
   </select></label>
   <p className="helper">A courier carries the parcel and never the reason for it. What is on the outside is the seal number and the patient’s name — never the medicine, the condition or the prescriber.</p>
  </>}
  {handover && <div className="panel next-step">
   <span className="service-icon check-verified"><BadgeCheck size={22}/></span>
   <div><h3>This script is finished.</h3><p>{handover}, under seal {seal}, checked by the pharmacist and attributed to {pharmacy.name}. What happens next is the patient’s: the repeats stay against this script and the next one is due in a month.</p></div>
  </div>}
  <div className="privacy-note"><ShieldCheck size={19}/>{crossReference}</div>
  <div className="privacy-note"><CircleAlert size={19}/>Nothing here dispenses anything. No medicine is reserved, no seal is issued, no courier is booked and no patient is told — dispensing is not connected, and the steps above move a picture of a script rather than a script.</div>
 </div>;
}
const panel = [
 { test: 'Haemoglobin', result: 13.9, unit: 'g/dL', range: '12.0 – 15.5' },
 { test: 'Fasting glucose', result: 6.4, unit: 'mmol/L', range: '3.9 – 5.6', flag: 'High' },
 { test: 'Creatinine', result: 74, unit: 'µmol/L', range: '49 – 90' },
 { test: 'Total cholesterol', result: 5.8, unit: 'mmol/L', range: '< 5.0', flag: 'High' }
];
export function LabOrderDetail({ reference = 'LAB-0023' }: { reference?: string }) {
 const [released, setReleased] = useState(false);
 const [chosen, setChosen] = useState(laboratories[0].id);
 const laboratory = laboratories.find(l => l.id === chosen)!;
 const mayRelease = can(laboratory, 'release-lab-result');
 return <div className="form-stack">
  <div className="order-head"><span className="service-icon"><FlaskConical size={22}/></span><div><h3>{reference}</h3><p className="muted">Requested 4 September · Fasting panel</p></div><Pill tone="plain">{released ? 'Released to patient' : 'Awaiting release'}</Pill></div>
  <div className="review-line"><span>Requested by</span><strong>{prescriber.name} · {prescriber.reference}</strong></div>
  <div className="review-line"><span>Collected by</span><strong>Sister Naledi Mokoena · At home, Rosebank</strong></div>
  <div className="review-line"><span>Sample seal</span><strong>SEAL-77341 · Intact on receipt</strong></div>
  <label>Testing laboratory<select value={chosen} onChange={e => { setChosen(e.target.value); setReleased(false); }}>
   {laboratories.map(l => <option key={l.id} value={l.id}>{l.name} · {l.reference}</option>)}
  </select></label>
  {!mayRelease.allowed && <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayRelease.reason}</div>}
  <Timeline steps={[
   { label: 'Ordered', detail: 'Doctor requested a fasting panel', at: '4 September, 08:10', state: 'done' },
   { label: 'Collected at home', detail: 'Two tubes drawn, sealed and labelled at the bedside', at: '4 September, 09:05', state: 'done' },
   { label: 'Courier handover', detail: 'Seal scanned by courier · Temperature logged', at: '4 September, 09:40', state: 'done' },
   { label: 'Received by the laboratory', detail: 'Seal verified intact · Accessioned', at: '4 September, 12:15', state: 'done' },
   { label: 'Results verified', detail: 'Checked by the laboratory’s reviewing pathologist', at: '5 September, 07:30', state: 'done' },
   { label: 'Released to the patient', detail: released ? 'Visible in the Health Passport with an explanation' : mayRelease.allowed ? 'Held until the requesting doctor releases them' : 'Held. Accreditation lapsed, and a held result stays held', state: released ? 'done' : 'active' }
  ]}/>
  <NotConnected of="dispensing"/>
  <table className="result-table">
   <caption>Reference ranges are indicative and vary by laboratory, age and sex.</caption>
   <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Reference range</th><th scope="col">Flag</th></tr></thead>
   <tbody>{panel.map(r => <tr key={r.test} className={r.flag ? 'flagged-row' : ''}><th scope="row">{r.test}</th><td>{r.result} {r.unit}</td><td>{r.range} {r.unit}</td><td>{r.flag ?? 'Within range'}</td></tr>)}</tbody>
  </table>
  <div className="privacy-note"><CircleAlert size={19}/>Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.</div>
  <button className={released ? 'secondary' : 'primary'} disabled={!mayRelease.allowed} aria-describedby={mayRelease.allowed ? undefined : 'release-refusal'} onClick={() => setReleased(!released)}>{released ? 'Withdraw the release' : <>Release with an explanation<ArrowRight size={16}/></>}</button>
  {!mayRelease.allowed && <p className="helper" id="release-refusal" role="status">Accreditation is not a badge on a partner page. It is the thing that decides whether this button does anything.</p>}
 </div>;
}
