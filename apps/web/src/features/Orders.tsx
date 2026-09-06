import { useState } from 'react';
import { ArrowRight, Check, CircleAlert, ClipboardList, FlaskConical, Package, Pill as PillIcon, ShieldCheck, Truck } from 'lucide-react';
import { Pill } from '../components/UI';
import { StateBlock, StatePicker, type LoadState } from '../components/States';
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
export function PrescriptionDetail({ reference = 'RX-0081' }: { reference?: string }) {
 const [state, setState] = useState<LoadState>('ready');
 const [checked, setChecked] = useState<string[]>([]);
 return <div className="form-stack">
  <Pill>Fictional prescription</Pill>
  <div className="order-head"><span className="service-icon"><PillIcon size={22}/></span><div><h3>{reference}</h3><p className="muted">Issued 4 September · Valid for 6 months</p></div><Pill tone="plain">Awaiting pharmacist</Pill></div>
  <div className="review-line"><span>Patient</span><strong>Lerato Molefe · 01/01/1980</strong></div>
  <div className="review-line"><span>Prescriber</span><strong>Dr. A. Dlamini · HPCSA 0000000 (demo)</strong></div>
  <div className="review-line"><span>Dispensing pharmacy</span><strong>Rosebank community pharmacy · Demo partner</strong></div>
  <StatePicker label="Preview the pharmacy connection state" value={state} onChange={setState}/>
  <StateBlock state={state} subject="The dispensing partner’s order feed" permission="partner data sharing" onRetry={() => setState('ready')}>
   <div className="panel">{medicines.map(m => <div className="medicine-row" key={m.name}>
    <label className="checkbox"><input type="checkbox" checked={checked.includes(m.name)} onChange={e => setChecked(e.target.checked ? [...checked, m.name] : checked.filter(x => x !== m.name))} aria-label={`Mark ${m.name} checked by pharmacist`}/><span/></label>
    <div><strong>{m.name}</strong><small>{m.form} · {m.dose}</small><small>{m.quantity} · {m.repeats}</small><em>{m.note}</em></div>
   </div>)}</div>
   <Timeline steps={[
    { label: 'Prescribed', detail: 'Signed by the reviewing doctor', at: '4 September, 11:41', state: 'done' },
    { label: 'Sent to pharmacy', detail: 'Encrypted transfer to the dispensing partner', at: '4 September, 11:42', state: 'done' },
    { label: 'Pharmacist check', detail: `${checked.length} of ${medicines.length} items checked in this preview`, state: 'active' },
    { label: 'Dispensed and sealed', detail: 'Tamper-evident seal number recorded', state: 'waiting' },
    { label: 'Delivered to the patient', detail: 'Signature or visit-code handover', state: 'waiting' }
   ]}/>
  </StateBlock>
  <div className="privacy-note"><ShieldCheck size={19}/>Schedule 5 and above, chronic authorisations and substitution rules are not modelled here. Dispensing requires a registered pharmacist and a valid original script.</div>
 </div>;
}
const panel = [
 { test: 'Haemoglobin', result: 13.9, unit: 'g/dL', range: '12.0 – 15.5' },
 { test: 'Fasting glucose', result: 6.4, unit: 'mmol/L', range: '3.9 – 5.6', flag: 'High' },
 { test: 'Creatinine', result: 74, unit: 'µmol/L', range: '49 – 90' },
 { test: 'Total cholesterol', result: 5.8, unit: 'mmol/L', range: '< 5.0', flag: 'High' }
];
export function LabOrderDetail({ reference = 'LAB-0023' }: { reference?: string }) {
 const [state, setState] = useState<LoadState>('ready');
 const [released, setReleased] = useState(false);
 return <div className="form-stack">
  <Pill>Fictional laboratory order</Pill>
  <div className="order-head"><span className="service-icon"><FlaskConical size={22}/></span><div><h3>{reference}</h3><p className="muted">Requested 4 September · Fasting panel</p></div><Pill tone="plain">{released ? 'Released to patient' : 'Awaiting release'}</Pill></div>
  <div className="review-line"><span>Requested by</span><strong>Dr. A. Dlamini · HPCSA 0000000 (demo)</strong></div>
  <div className="review-line"><span>Collected by</span><strong>Sister Naledi Mokoena · At home, Rosebank</strong></div>
  <div className="review-line"><span>Sample seal</span><strong>SEAL-77341 · Intact on receipt</strong></div>
  <Timeline steps={[
   { label: 'Ordered', detail: 'Doctor requested a fasting panel', at: '4 September, 08:10', state: 'done' },
   { label: 'Collected at home', detail: 'Two tubes drawn, sealed and labelled at the bedside', at: '4 September, 09:05', state: 'done' },
   { label: 'Courier handover', detail: 'Seal scanned by courier · Temperature logged', at: '4 September, 09:40', state: 'done' },
   { label: 'Received by the laboratory', detail: 'Seal verified intact · Accessioned', at: '4 September, 12:15', state: 'done' },
   { label: 'Results verified', detail: 'Checked by the laboratory’s reviewing pathologist', at: '5 September, 07:30', state: 'done' },
   { label: 'Released to the patient', detail: released ? 'Visible in the Health Passport with an explanation' : 'Held until the requesting doctor releases them', state: released ? 'done' : 'active' }
  ]}/>
  <StatePicker label="Preview the laboratory connection state" value={state} onChange={setState}/>
  <StateBlock state={state} subject="The laboratory result feed" permission="partner data sharing" onRetry={() => setState('ready')}>
   <table className="result-table">
    <caption>Fictional results. Reference ranges are illustrative and vary by laboratory, age and sex.</caption>
    <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Reference range</th><th scope="col">Flag</th></tr></thead>
    <tbody>{panel.map(r => <tr key={r.test} className={r.flag ? 'flagged-row' : ''}><th scope="row">{r.test}</th><td>{r.result} {r.unit}</td><td>{r.range} {r.unit}</td><td>{r.flag ?? 'Within range'}</td></tr>)}</tbody>
   </table>
  </StateBlock>
  <div className="privacy-note"><CircleAlert size={19}/>Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.</div>
  <button className={released ? 'secondary' : 'primary'} onClick={() => setReleased(!released)}>{released ? 'Withdraw demo release' : <>Release with an explanation<ArrowRight size={16}/></>}</button>
 </div>;
}
export function FulfilmentQueue({ open }: { open: (s: string) => void }) {
 const rows = [
  { id: 'RX-0081', kind: 'Prescription', detail: '2 items · Rosebank · Awaiting pharmacist', icon: PillIcon },
  { id: 'RX-0079', kind: 'Prescription', detail: '1 item · Dispensed, awaiting courier', icon: Package },
  { id: 'LAB-0023', kind: 'Laboratory', detail: 'Fasting panel · Results verified', icon: FlaskConical },
  { id: 'LAB-0019', kind: 'Laboratory', detail: 'Sample in transit · Seal intact', icon: Truck }
 ];
 return <div className="panel">{rows.map(r => <button className="record-row" key={r.id} onClick={() => open(r.kind === 'Prescription' ? `Prescription ${r.id}` : `Laboratory order ${r.id}`)}>
  <span className="service-icon"><r.icon size={21}/></span>
  <span><strong>{r.id} · {r.kind}</strong><small>{r.detail}</small></span>
  <ClipboardList size={18}/>
 </button>)}</div>;
}
