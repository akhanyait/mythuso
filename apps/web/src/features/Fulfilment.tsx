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
/* A row is four answers, not one sentence. "2 items · Rosebank · Awaiting pharmacist" put the only
   thing a pharmacist is deciding by — whether this one is hers to move — at the end of a run-on
   string, in the same grey as everything before it, on a row that looked identical to the three
   under it. A partner works this board by asking "which of these is mine, now"; so what it is, where
   it is and what it is waiting on are three columns, aligned down the list, with the wait in the
   last one where the eye already goes. */
type OrderRow = { id: string; what: string; where: string; state: string; here: boolean; icon: typeof PillIcon };
const prescriptionRows: OrderRow[] = [
 { id: 'RX-0081', what: '2 items', where: 'Rosebank', state: 'Awaiting pharmacist', here: true, icon: PillIcon },
 { id: 'RX-0079', what: '1 item', where: 'Dispensed', state: 'Awaiting courier', here: false, icon: Package }
];
const labRows: OrderRow[] = [
 { id: 'LAB-0023', what: 'Fasting panel', where: 'At the laboratory', state: 'Results verified', here: false, icon: FlaskConical },
 { id: 'LAB-0019', what: 'Sample in transit', where: 'Seal intact', state: 'With the courier', here: false, icon: Truck }
];
/* A collection is a window and a place, and the window is the whole of it: a sample drawn outside
   the one its assay allows is a sample that has to be drawn again. */
/* The state is a word and the consequence is a sentence, and they were one field. "Past its window.
   It has to be drawn again" in a column beside three two-word states is not a state — it is a
   paragraph wearing one, and it ran straight over the window beside it. The word goes in the column
   with the others; the consequence goes under the row, where the refusal it is can be read. */
const collections = [
 { id: 'COL-0044', what: 'Fasting panel · two tubes', where: 'Rosebank · at home', window: '07:00 – 09:00', state: 'Inside the window', consequence: '', order: 'LAB-0023', late: false },
 { id: 'COL-0045', what: 'Urine culture · one container', where: 'Soweto · at home', window: '09:30 – 11:30', state: 'Courier en route', consequence: '', order: 'LAB-0019', late: false },
 { id: 'COL-0046', what: 'Full blood count · one tube', where: 'Parktown · at home', window: '08:00 – 10:00', state: 'Past its window', consequence: 'It has to be drawn again.', order: 'LAB-0019', late: true }
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
 here: [...prescriptionRows, ...labRows].filter(row => row.here).length,
 collections: collections.length,
 pastWindow: collections.filter(c => c.late).length,
 nextCollection: collections.find(c => !c.late)?.window.split(' – ')[0] ?? '—',
 readyForRelease: results.filter(r => r.holding.startsWith('Verified')).length
});
/* The first clause of what is holding a result, as the word that goes in the state column. Read off
   the sentence rather than stored beside it: two fields saying the same thing is how a board starts
   telling a partner one state while the paragraph under it says another. */
const holdingState = (holding: string) => holding.startsWith('Verified') ? 'Verified'
 : holding.startsWith('Released') ? 'Released' : 'On the bench';
export function FulfilmentQueue({ section = 'Orders', open }: { section?: 'Orders' | 'Collections' | 'Results'; open: (s: string) => void }) {
 if (section === 'Collections') {
  const late = collections.filter(c => c.late).length;
  return <>
   <div className="shift-head">
    {/* The strip above already counts them and marks the one past its window. What is left to say
        is the rule, which no figure can carry: a window belongs to the assay, not to the round. */}
    <div><h1>Collections</h1><p>{late ? 'One is outside its window. A sample drawn outside the window its assay allows has to be drawn again.' : 'Every collection is inside the window its assay allows.'}</p></div>
   </div>
   <NotConnected of="dispensing"/>
   {/* Late first. A collection round is worked by the clock, and the one that has already missed its
       window is the one somebody has to ring a patient about — putting it third because its
       reference sorts third is the board deciding for the reader in the least useful way. */}
   <ol className="fulfil-list">{[...collections].sort((a, b) => Number(b.late) - Number(a.late)).map(c =>
    <li key={c.id}><button className={`fulfil-row${c.late ? ' is-late' : ''}`} onClick={() => open(`Laboratory order ${c.order}`)}>
     <span className="fulfil-ref">{c.id}</span>
     <span className="fulfil-what"><strong>{c.what}</strong><small><MapPin size={13}/> {c.where}</small>
      {c.consequence && <small className="fulfil-refusal">{c.consequence}</small>}</span>
     <span className="fulfil-state">{c.state}</span>
     <span className="fulfil-when"><Clock3 size={13}/>{c.window}</span>
     <ChevronRight size={18}/>
    </button></li>)}</ol>
   <div className="privacy-note"><CircleAlert size={19}/>A window is not a preference. A fasting panel drawn outside it is a sample that has to be taken again, and nothing on this board can extend one — the assay decides, not the courier and not this screen.</div>
   <div className="privacy-note"><ShieldCheck size={19}/>The seal is checked at every handover and the temperature is logged with it. A seal found broken stops the sample rather than annotating it, and the incident opens on the Control Tower’s board.</div>
  </>;
 }
 if (section === 'Results') {
  const held = results.filter(r => r.ready && r.holding.startsWith('Verified')).length;
  return <>
   <div className="shift-head">
    <div><h1>Results</h1><p>{held ? 'Verified is not released. A result reaches a patient when a clinician sends it with an explanation, and this partner cannot do that for them.' : 'Nothing is waiting on a clinician.'}</p></div>
   </div>
   <NotConnected of="dispensing"/>
   {/* The state is the sentence's first clause, so it is lifted out of the sentence and set in a
       column of its own. "Verified", "On the bench", "Released" read down the list; the paragraph
       underneath still says the whole of it, because what is holding a result is not a word. */}
   <ol className="fulfil-list">{results.map(r =>
    <li key={r.id}><button className="fulfil-row is-wide" onClick={() => open(`Laboratory order ${r.id}`)}>
     <span className="fulfil-ref">{r.id}</span>
     <span className="fulfil-what"><strong>{r.what}</strong><small>{r.holding}</small></span>
     <span className="fulfil-state">{holdingState(r.holding)}</span>
     <ChevronRight size={18}/>
    </button></li>)}</ol>
   <div className="privacy-note"><CircleAlert size={19}/>Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification, and this partner cannot perform it on a doctor’s behalf.</div>
  </>;
 }
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
   {/* Not "the last column": on a phone there are no columns, and a sentence that describes the
       layout it happens to be sitting in is wrong on half the devices this is opened on. */}
   <div><h1>Orders</h1><p>Prescriptions and laboratory orders routed here. Every row says whether the next move is yours or somebody else’s.</p></div>
  </div>
  <NotConnected of="dispensing"/>
  {groups.map(group => <section key={group.title}>
   <SectionTitle title={`${group.title} · ${group.rows.length}`}/>
   <ol className="fulfil-list">{group.rows.map(r =>
    <li key={r.id}><button className={`fulfil-row${r.here ? ' is-here' : ''}`} onClick={() => open(`${group.kind} ${r.id}`)}>
     <span className="fulfil-ref">{r.id}</span>
     <span className="fulfil-what"><strong>{r.what}</strong><small><r.icon size={13}/> {r.where}</small></span>
     <span className="fulfil-state">{r.state}</span>
     <span className="fulfil-when">{r.here ? 'Yours' : 'Elsewhere'}</span>
     <ChevronRight size={18}/>
    </button></li>)}</ol>
  </section>)}
 </>;
}
