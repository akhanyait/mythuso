import { ChevronRight, CircleAlert, Clock3, FlaskConical, MapPin, Package, Pill as PillIcon, ShieldCheck, Truck } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';

/* The pharmacy partner's three boards. They were in features/Orders.tsx beside the prescription and
   the laboratory order themselves — and those two *are* shared, because the document a pharmacist
   verifies is the same document a patient reads in the Health Passport. The boards are not: no
   patient works a collection round. Keeping them in one file put a courier's temperature windows
   into the bundle of everybody who ever opened a prescription. */
/* Three boards, not one list rendered three times.
 *
 * Orders, Collections and Results were the same component under three names: a partner clicking
 * "Collections" got a screen headed "Orders" listing prescriptions, and "Results" got the same
 * screen again. Three sections, one of which was true. They are different work done by different
 * people against different clocks — a pharmacist filling scripts, a courier inside a temperature
 * window, and a laboratory holding a result until a clinician releases it — so they are three
 * boards, and each one leads with the number that partner is actually measured on.
 */
const prescriptionRows = [
 { id: 'RX-0081', detail: '2 items · Rosebank · Awaiting pharmacist', icon: PillIcon },
 { id: 'RX-0079', detail: '1 item · Dispensed, awaiting courier', icon: Package }
];
const labRows = [
 { id: 'LAB-0023', detail: 'Fasting panel · Results verified', icon: FlaskConical },
 { id: 'LAB-0019', detail: 'Sample in transit · Seal intact', icon: Truck }
];
/* A collection is a window and a place, and the window is the whole of it: a sample drawn outside
   the one its assay allows is a sample that has to be drawn again. */
const collections = [
 { id: 'COL-0044', what: 'Fasting panel · two tubes', where: 'Rosebank · at home', window: '07:00 – 09:00', state: 'Inside the window', order: 'LAB-0023', late: false },
 { id: 'COL-0045', what: 'Urine culture · one container', where: 'Soweto · at home', window: '09:30 – 11:30', state: 'Courier en route', order: 'LAB-0019', late: false },
 { id: 'COL-0046', what: 'Full blood count · one tube', where: 'Parktown · at home', window: '08:00 – 10:00', state: 'Past its window. It has to be drawn again', order: 'LAB-0019', late: true }
];
/* And a result is a thing being held. What is worth reading is never the result — it is what is
   standing between it and the patient, which is a different sentence for each one. */
const results = [
 { id: 'LAB-0023', what: 'Fasting panel · Lerato Molefe', holding: 'Verified by the laboratory. Waiting for the requesting doctor to release it with an explanation.', ready: true },
 { id: 'LAB-0019', what: 'Urine culture · Thabo Molefe', holding: 'Still on the bench. Nothing is released before the laboratory’s own reviewing pathologist has checked it.', ready: false },
 { id: 'LAB-0014', what: 'Full blood count · Nomsa Molefe', holding: 'Released 3 September, with the doctor’s note, and visible in her Health Passport.', ready: true }
];
/* The counts the shell's strip shows above these boards. Exported rather than typed there, because
   a header saying "8 open orders" over a board listing four is the exact drift the one-number rule
   exists to stop — and it was saying eight. */
export const partnerCounts = () => ({
 open: prescriptionRows.length + labRows.length,
 collections: collections.length,
 pastWindow: collections.filter(c => c.late).length,
 nextCollection: collections.find(c => !c.late)?.window.split(' – ')[0] ?? '—',
 readyForRelease: results.filter(r => r.holding.startsWith('Verified')).length
});
export function FulfilmentQueue({ section = 'Orders', open }: { section?: 'Orders' | 'Collections' | 'Results'; open: (s: string) => void }) {
 if (section === 'Collections') {
  const late = collections.filter(c => c.late).length;
  return <>
   <div className="shift-head">
    <div><h1>Collections</h1><p>{collections.length} booked today · {late ? `${late} outside its window and has to be drawn again` : 'all inside their windows'}</p></div>
   </div>
   <NotConnected of="dispensing"/>
   <div className="panel">{collections.map(c => <button className="record-row" key={c.id} onClick={() => open(`Laboratory order ${c.order}`)}>
    <span className={`service-icon ${c.late ? 'severity-high' : ''}`}><Truck size={21}/></span>
    <span><strong>{c.id} · {c.what}</strong><small><MapPin size={13}/> {c.where}</small><small><Clock3 size={13}/> {c.window} · {c.state}</small></span>
    <ChevronRight size={18}/>
   </button>)}</div>
   <div className="privacy-note"><CircleAlert size={19}/>A window is not a preference. A fasting panel drawn outside it is a sample that has to be taken again, and nothing on this board can extend one — the assay decides, not the courier and not this screen.</div>
   <div className="privacy-note"><ShieldCheck size={19}/>The seal is checked at every handover and the temperature is logged with it. A seal found broken stops the sample rather than annotating it, and the incident opens on the Control Tower’s board.</div>
  </>;
 }
 if (section === 'Results') {
  const held = results.filter(r => r.ready && r.holding.startsWith('Verified')).length;
  return <>
   <div className="shift-head">
    <div><h1>Results</h1><p>{results.length} produced · {held} verified and waiting on a clinician to release</p></div>
   </div>
   <NotConnected of="dispensing"/>
   <div className="panel">{results.map(r => <button className="record-row" key={r.id} onClick={() => open(`Laboratory order ${r.id}`)}>
    <span className={`service-icon ${r.ready ? 'check-verified' : 'check-outstanding'}`}><FlaskConical size={21}/></span>
    <span><strong>{r.id} · {r.what}</strong><small>{r.holding}</small></span>
    <ChevronRight size={18}/>
   </button>)}</div>
   <div className="privacy-note"><CircleAlert size={19}/>Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification, and this partner cannot perform it on a doctor’s behalf.</div>
  </>;
 }
 const rows = [...prescriptionRows, ...labRows];
 /* Two queues, not one list of four. A pharmacist filling scripts and a courier chasing samples
    are different people doing different work, and a single undivided list made the reader sort it
    themselves on every visit to the screen. The waiting count leads each group because that is the
    number the partner is measured on. */
 const groups = [
  { title: 'Prescriptions', rows: prescriptionRows, kind: 'Prescription' },
  { title: 'Laboratory', rows: labRows, kind: 'Laboratory order' }
 ];
 return <>
  <div className="shift-head">
   <div><h1>Orders</h1><p>{rows.length} open · {rows.filter(r => r.detail.includes('Awaiting')).length} of them waiting on somebody in this building</p></div>
  </div>
  <NotConnected of="dispensing"/>
  {groups.map(group => <section key={group.title}>
   <SectionTitle title={`${group.title} · ${group.rows.length}`}/>
   <div className="panel">{group.rows.map(r => <button className="record-row" key={r.id} onClick={() => open(`${group.kind} ${r.id}`)}>
    <span className="service-icon"><r.icon size={21}/></span>
    <span><strong>{r.id}</strong><small>{r.detail}</small></span>
    <ChevronRight size={18}/>
   </button>)}</div>
  </section>)}
 </>;
}
