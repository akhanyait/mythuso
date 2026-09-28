import { useState } from 'react';
import { ArrowRight, BadgeCheck, Check, CircleAlert, FlaskConical, Pill as PillIcon, Repeat, ShieldCheck, ShieldX } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Alert, Badge, Button, Card, Checkbox, Field, Select } from '../ui';
import { OfficeFacts, OfficeNote } from '../surface/Office';
import { crossReference } from '../lib/dispensing';
import { can } from '../lib/vetting';
import { subjectsByRole } from '../lib/vetting-fixtures';
/* The prescription and the lab order a partner fills, on the identity of 28 September 2026 (wave 4d). They
   were in Orders.tsx, which App.tsx imports statically, so every line here and every component it wears was
   on the patient's first load for a screen a patient reaches only by opening an order. Orders.tsx is now the
   two names the shells import, each a lazy door to this file, and what a partner fetches when she opens a
   script is this and nothing more.

   A partner is a vetted party like any other. Routing a prescription and releasing a result are
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
/* The steps of an order, in order. Done is a filled mark with a tick, the step in hand a ring, and one
   still waiting a hollow ring — three shapes, so the state survives a screen with no colour on it. */
function Timeline({ steps }: { steps: Step[] }) {
 return <ol className="oi-steps">{steps.map(s => <li key={s.label} className={`oi-step is-${s.state}`}>
  <span className="oi-step__mark" aria-hidden="true">{s.state === 'done' ? <Check/> : null}</span>
  <div className="oi-step__body"><p className="oi-row__title">{s.label}<span className="visually-hidden"> · {s.state === 'done' ? 'done' : s.state === 'active' ? 'in hand' : 'waiting'}</span></p><span className="oi-row__meta">{s.detail}</span>{s.at && <span className="oi-row__meta">{s.at}</span>}</div>
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
 return <div className="oi-screen oi-order">
  {/* The chip is the state, not a label. It read "Awaiting pharmacist" through the whole journey —
      through both items being checked, through the seal being entered and through the handover
      being chosen — so the one element on the screen whose entire job is to say where the script
      has got to was the one element that never moved. `pill` is kept on it as the name journeys read
      it by; the Badge's own sheet arrives after the legacy one and draws it. */}
  <div className="oi-card-head order-head"><div><p className="oi-eyebrow oi-with-icon"><PillIcon aria-hidden="true"/>Prescription</p><h3 className="oi-section-title">{reference}</h3><p className="oi-help">Issued 4 September · Valid for 6 months</p></div>
   <Badge className="pill" variant={!mayDispense.allowed ? 'danger' : handover ? 'success' : 'neutral'}>{!mayDispense.allowed ? 'Held' : handover ? 'Handed over' : sealed ? 'Sealed' : allChecked ? 'Checked' : 'Awaiting pharmacist'}</Badge></div>
  <OfficeFacts facts={[['Patient', 'Lerato Molefe · 01/01/1980'], ['Prescriber', `${prescriber.name} · ${prescriber.reference}`]]}/>
  <Field label="Dispensing pharmacy" htmlFor="order-pharmacy"><Select id="order-pharmacy" value={chosen} onChange={e => { setChosen(e.target.value); setChecked([]); setSealed(false); setHandover(''); }}>
   {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} · {p.reference}</option>)}
  </Select></Field>
  {!mayDispense.allowed && <OfficeNote refusal role="status" icon={<ShieldX aria-hidden="true"/>}>{mayDispense.reason}</OfficeNote>}
  <NotConnected of="dispensing"/>
  <Card><ul className="oi-rows">{medicines.map(m => <li key={m.name}><div className="oi-row medicine-row">
    <div className="oi-row__body"><p className="oi-row__title">{m.name}</p><span className="oi-row__meta">{m.form} · {m.dose}</span><span className="oi-row__meta">{m.quantity} · {m.repeats}</span><span className="oi-row__meta">{m.note}</span></div>
    <div className="oi-row__aside"><Checkbox disabled={!mayDispense.allowed} checked={checked.includes(m.name)} onChange={e => setChecked(e.target.checked ? [...checked, m.name] : checked.filter(x => x !== m.name))} aria-label={`Mark ${m.name} checked by pharmacist`}/></div>
  </div></li>)}</ul></Card>
  {/* Substitution is the one decision on this screen that is not the pharmacist's to make freely,
      and it is a screen of its own — section 22F, the four statutory exceptions, and the words said
      to the patient. A partner who cannot get to it from the script they are filling will make the
      decision here instead, without any of that in front of them. */}
  {open && <Button variant="secondary" className="oi-full" onClick={() => open('Substitution & repeats')} leadingIcon={<Repeat aria-hidden="true"/>}>Check what may be substituted, and what may not</Button>}
  <Timeline steps={[
    { label: 'Prescribed', detail: 'Signed by the reviewing doctor', at: '4 September, 11:41', state: 'done' },
    { label: 'Sent to pharmacy', detail: mayDispense.allowed ? 'Encrypted transfer to the dispensing partner' : 'Held. The script is not routed to a pharmacy that cannot lawfully fill it', at: mayDispense.allowed ? '4 September, 11:42' : undefined, state: mayDispense.allowed ? 'done' : 'waiting' },
    { label: 'Pharmacist check', detail: `${checked.length} of ${medicines.length} items checked by the pharmacist`, state: allChecked ? 'done' : mayDispense.allowed ? 'active' : 'waiting' },
    { label: 'Dispensed and sealed', detail: sealed ? `Sealed under ${seal}. The number travels with the parcel and is read back at the door` : 'Tamper-evident seal number recorded', state: sealed ? 'done' : allChecked ? 'active' : 'waiting' },
    { label: handover === 'Collected at the pharmacy' ? 'Collected by the patient' : 'Delivered to the patient', detail: handover ? `${handover}. Identity confirmed before anything changes hands` : 'Signature or visit-code handover', state: handover ? 'done' : sealed ? 'active' : 'waiting' }
  ]}/>
  {/* Each control appears when the step before it is done, rather than sitting greyed out from the
      start. A row of four disabled buttons is a screen telling a pharmacist what they cannot do. */}
  {mayDispense.allowed && !sealed && <div className="oi-stack">
   <div className="oi-actions"><Button variant="primary" disabled={!allChecked} onClick={() => setSealed(true)} leadingIcon={<Check aria-hidden="true"/>}>Dispense and seal</Button></div>
   {!allChecked && <p className="oi-help" role="status">Every item is checked by the pharmacist before anything is sealed. {medicines.length - checked.length} still to check.</p>}
  </div>}
  {sealed && !handover && <div className="oi-stack">
   <OfficeFacts facts={[['Seal number', seal]]}/>
   <Field label="How it reaches the patient" htmlFor="order-handover" hint="A courier carries the parcel and never the reason for it. What is on the outside is the seal number and the patient’s name — never the medicine, the condition or the prescriber.">
    <Select id="order-handover" value={handover} onChange={e => setHandover(e.target.value)}>
     <option value="">Choose a handover…</option><option>Collected at the pharmacy</option><option>Delivered by courier</option><option>Handed over at the next nurse visit</option>
    </Select></Field>
  </div>}
  {handover && <Alert variant="success" title="This script is finished." icon={<BadgeCheck aria-hidden="true"/>} className="next-step">
   <p>{handover}, under seal {seal}, checked by the pharmacist and attributed to {pharmacy.name}. What happens next is the patient’s: the repeats stay against this script and the next one is due in a month.</p>
  </Alert>}
  <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>{crossReference}</OfficeNote>
  <OfficeNote refusal icon={<CircleAlert aria-hidden="true"/>}>Nothing here dispenses anything. No medicine is reserved, no seal is issued, no courier is booked and no patient is told — dispensing is not connected, and the steps above move a picture of a script rather than a script.</OfficeNote>
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
 return <div className="oi-screen oi-order">
  <div className="oi-card-head order-head"><div><p className="oi-eyebrow oi-with-icon"><FlaskConical aria-hidden="true"/>Laboratory order</p><h3 className="oi-section-title">{reference}</h3><p className="oi-help">Requested 4 September · Fasting panel</p></div><Badge className="pill" variant={released ? 'success' : 'neutral'}>{released ? 'Released to patient' : 'Awaiting release'}</Badge></div>
  <OfficeFacts facts={[
   ['Requested by', `${prescriber.name} · ${prescriber.reference}`],
   ['Collected by', 'Sister Naledi Mokoena · At home, Rosebank'],
   ['Sample seal', 'SEAL-77341 · Intact on receipt']
  ]}/>
  <Field label="Testing laboratory" htmlFor="order-laboratory"><Select id="order-laboratory" value={chosen} onChange={e => { setChosen(e.target.value); setReleased(false); }}>
   {laboratories.map(l => <option key={l.id} value={l.id}>{l.name} · {l.reference}</option>)}
  </Select></Field>
  {!mayRelease.allowed && <OfficeNote refusal role="status" icon={<ShieldX aria-hidden="true"/>}>{mayRelease.reason}</OfficeNote>}
  <Timeline steps={[
   { label: 'Ordered', detail: 'Doctor requested a fasting panel', at: '4 September, 08:10', state: 'done' },
   { label: 'Collected at home', detail: 'Two tubes drawn, sealed and labelled at the bedside', at: '4 September, 09:05', state: 'done' },
   { label: 'Courier handover', detail: 'Seal scanned by courier · Temperature logged', at: '4 September, 09:40', state: 'done' },
   { label: 'Received by the laboratory', detail: 'Seal verified intact · Accessioned', at: '4 September, 12:15', state: 'done' },
   { label: 'Results verified', detail: 'Checked by the laboratory’s reviewing pathologist', at: '5 September, 07:30', state: 'done' },
   { label: 'Released to the patient', detail: released ? 'Visible in the Health Passport with an explanation' : mayRelease.allowed ? 'Held until the requesting doctor releases them' : 'Held. Accreditation lapsed, and a held result stays held', state: released ? 'done' : 'active' }
  ]}/>
  <NotConnected of="dispensing"/>
  <Card className="oi-table-wrap"><table className="oi-table">
   <caption>Reference ranges are indicative and vary by laboratory, age and sex.</caption>
   <thead><tr><th scope="col">Test</th><th scope="col" className="is-figure">Result</th><th scope="col">Reference range</th><th scope="col">Flag</th></tr></thead>
   <tbody>{panel.map(r => <tr key={r.test} className={r.flag ? 'is-flagged' : ''}><th scope="row">{r.test}</th><td className="is-figure">{r.result} {r.unit}</td><td>{r.range} {r.unit}</td><td className={r.flag ? 'is-refused' : ''}>{r.flag ?? 'Within range'}</td></tr>)}</tbody>
  </table></Card>
  <OfficeNote icon={<CircleAlert aria-hidden="true"/>}>Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.</OfficeNote>
  <div className="oi-actions"><Button variant={released ? 'secondary' : 'primary'} disabled={!mayRelease.allowed} aria-describedby={mayRelease.allowed ? undefined : 'release-refusal'} onClick={() => setReleased(!released)} trailingIcon={released ? undefined : <ArrowRight aria-hidden="true"/>}>{released ? 'Withdraw the release' : 'Release with an explanation'}</Button></div>
  {!mayRelease.allowed && <p className="oi-help" id="release-refusal" role="status">Accreditation is not a badge on a partner page. It is the thing that decides whether this button does anything.</p>}
 </div>;
}
