import { useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Clock3, FlaskConical, MapPin, Package, PackageCheck, Pill as PillIcon, ShieldCheck, Truck } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button } from '../ui';
import { refusal } from '../../../../packages/thusoiq/index.ts';
import medicinesContract from '../../../../packages/catalog/medicines.json' with { type: 'json' };
import { custodyLabel, roundFor, scheduleName, useMedicines } from '../lib/medicines';
import { releaseWithheld } from '../lib/dispensing';
import './doctor-pages.css';

/* What a laboratory order comes back as, in medicines.json's words. The Results board called a result verified by
   the laboratory, and one still out waiting on a pathologist's check, over the laboratory notice: no
   test is run and nobody checks anything, and the synthetic laboratory hands back a reference. So the step, the
   state word and the sentence a result waits on are the contract's, the same ones the order itself and both
   phones draw (2 October 2026), and scripts/check-boundaries.mjs refuses the old words here. */
const words = medicinesContract.screen.results;

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
/* `done` is how many steps of its chain a row has behind it — the same fact as its state word, as a number
   the order's panel can draw a track from. It is not a second opinion: each value is the state beside it. */
type OrderRow = { id: string; what: string; where: string; state: string; here: boolean; icon: typeof PillIcon; done: number };
const prescriptionRows: OrderRow[] = [
 { id: 'RX-0081', what: '2 items', where: 'Rosebank', state: 'Awaiting pharmacist', here: true, icon: PillIcon, done: 1 },
 { id: 'RX-0079', what: '1 item', where: 'Dispensed', state: 'Awaiting courier', here: false, icon: Package, done: 2 }
];
const labRows: OrderRow[] = [
 { id: 'LAB-0023', what: 'Fasting panel', where: 'At the laboratory', state: words.returned, here: false, icon: FlaskConical, done: 4 },
 { id: 'LAB-0019', what: 'Sample in transit', where: 'Seal intact', state: 'With the courier', here: false, icon: Truck, done: 1 }
];
/* The two chains an order moves along. A prescription's is the dispensary's three acts by two registered
   people, in the ThusoIQ kernel's own sentences; a laboratory order's is where the sample is. */
const prescriptionChain = [
 { step: 'Requested', says: 'A doctor, against a signed consultation.' },
 { step: 'Verified', says: refusal('checks-outstanding') },
 { step: 'Handed over', says: refusal('recipient-unchecked') }
];
const labChain = [
 { step: 'Collected', says: 'Drawn inside the window its assay allows.' },
 { step: 'In transit', says: 'Sealed, with the temperature logged at every handover.' },
 { step: 'At the laboratory', says: words.releaseWaits },
 { step: words.returned, says: 'Held for the requesting doctor to release with an explanation.' }
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
/* No patient is named on this board. It named three, while the same pharmacy's Orders board carries nobody and
   packages/catalog/medicines.json#partnerQueue says why in so many words: a pharmacy's screen, printout or log
   holds no patient. A result is worked here by its reference and what is holding it, which is all a partner
   needs to chase it (fixed 30 September 2026, S3). */
const results = [
 { id: 'LAB-0023', what: 'Fasting panel', holding: `${words.returned}. Waiting for the requesting doctor to release it with an explanation.`, ready: true },
 { id: 'LAB-0019', what: 'Urine culture', holding: `Still on the bench. ${words.releaseWaits}`, ready: false },
 { id: 'LAB-0014', what: 'Full blood count', holding: 'Released 3 September, with the doctor’s note, and visible in the patient’s Health Passport.', ready: true }
];
/* The board's track: where a result has got to, as three steps drawn off the same first clause. */
const resultSteps = ['On the bench', words.returned, 'Released'] as const;
/* The counts the shell's strip shows above these boards. Exported rather than typed there, because
   a header saying "8 open orders" over a board listing four is the exact drift the one-number rule
   exists to stop — and it was saying eight. */
export const partnerCounts = () => ({
 open: prescriptionRows.length + labRows.length,
 here: [...prescriptionRows, ...labRows].filter(row => row.here).length,
 collections: collections.length,
 pastWindow: collections.filter(c => c.late).length,
 nextCollection: collections.find(c => !c.late)?.window.split(' – ')[0] ?? '—',
 readyForRelease: results.filter(r => r.holding.startsWith(words.returned)).length
});
/* The first clause of what is holding a result, as the word that goes in the state column. Read off
   the sentence rather than stored beside it: two fields saying the same thing is how a board starts
   telling a partner one state while the paragraph under it says another. */
const holdingState = (holding: string) => holding.startsWith(words.returned) ? words.returned
 : holding.startsWith('Released') ? 'Released' : 'On the bench';
export function FulfilmentQueue({ section = 'Orders', open }: { section?: 'Orders' | 'Collections' | 'Results'; open: (s: string) => void }) {
 if (section === 'Collections') return <CollectionsBoard open={open}/>;
 if (section === 'Results') {
  const held = results.filter(r => r.ready && r.holding.startsWith(words.returned)).length;
  return <>
   <div className="shift-head">
    <div><h1>Results</h1><p>{held ? `A reference returned is not a result released. ${releaseWithheld}` : 'Nothing is waiting on a clinician.'}</p></div>
   </div>
   <NotConnected of="dispensing"/>
   {/* The state is the sentence's first clause, so it is lifted out of the sentence and set in a
       column of its own. On the bench, a reference returned, released: the states read down the list; the paragraph
       underneath still says the whole of it, because what is holding a result is not a word.
       The track under each row is the export's progress bar drawn off that same word — three steps, lit
       to the one the result is at, with the step named in words beside it so it is never colour alone. */}
   <ol className="fulfil-list">{results.map(r => { const at = resultSteps.indexOf(holdingState(r.holding) as typeof resultSteps[number]);
    return <li key={r.id}><button className="fulfil-row is-wide" onClick={() => open(`Laboratory order ${r.id}`)}>
     <span className="fulfil-ref">{r.id}</span>
     <span className="fulfil-what"><strong>{r.what}</strong><small>{r.holding}</small>
      {/* role="img": the steps are a picture of where the order is, drawn hidden, and the label says it in one
          line. A label on a bare span names a generic element, which ARIA does not allow and a reader skips. */}
      <span className="fo-track" role="img" aria-label={`Step ${at + 1} of ${resultSteps.length}: ${resultSteps[at]}`}>{resultSteps.map((step, n) =>
       <span key={step} className={n <= at ? 'is-lit' : ''} aria-hidden="true"><i/>{step}</span>)}</span></span>
     <span className="fulfil-state">{holdingState(r.holding)}</span>
     <ChevronRight size={18}/>
    </button></li>; })}</ol>
   <div className="privacy-note"><CircleAlert size={19}/>Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification, and this partner cannot perform it on a doctor’s behalf.</div>
  </>;
 }
 return <OrdersBoard open={open}/>;
}

/* ---- Orders, as the export's master and detail -------------------------------------------------------
 * Two queues, not one list of four. A pharmacist filling scripts and a courier chasing samples are
 * different people doing different work, and a single undivided list made the reader sort it themselves on
 * every visit to the screen. The waiting count leads each group because that is the number the partner is
 * measured on.
 *
 * A row chooses the order and the order stands beside the list (30 September 2026): what it is, whose move
 * it is, and the chain it is on, drawn as a track. The prescription itself — the checks a pharmacist ticks
 * under her own registration, the hold and its reason, the batch and the recipient — is still the dialog
 * the panel opens, because those are acts, and a second, lighter way to perform them beside the dialog would
 * be two places a registered act could be half-done. No patient is named on a row or in the panel. */
function OrdersBoard({ open }: { open: (s: string) => void }) {
 const groups = [
  { title: 'Prescriptions', rows: prescriptionRows, kind: 'Prescription' },
  { title: 'Laboratory', rows: labRows, kind: 'Laboratory order' }
 ];
 const [chosen, setChosen] = useState(prescriptionRows[0].id);
 const panel = useRef<HTMLElement>(null);
 const choose = (id: string) => {
  setChosen(id);
  if (window.matchMedia('(max-width: 1279px)').matches)
   requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
 };
 const group = groups.find(g => g.rows.some(r => r.id === chosen))!;
 const row = group.rows.find(r => r.id === chosen)!;
 const chain = group.kind === 'Prescription' ? prescriptionChain : labChain;
 return <>
  <div className="shift-head">
   {/* Not "the last column": on a phone there are no columns, and a sentence that describes the
       layout it happens to be sitting in is wrong on half the devices this is opened on. */}
   <div><h1>Orders</h1><p>Prescriptions and laboratory orders routed here. Every row says whether the next move is yours or somebody else’s.</p></div>
  </div>
  <NotConnected of="dispensing"/>
  <div className="dp-split is-wide-detail">
   <div className="dp-master">{groups.map(g => <section key={g.title} className="fulfil-group">
    <SectionTitle title={`${g.title} · ${g.rows.length}`}/>
    <ol className="fulfil-list">{g.rows.map(r =>
     <li key={r.id}><button className={`fulfil-row${r.here ? ' is-here' : ''}${r.id === chosen ? ' is-chosen' : ''}`} aria-pressed={r.id === chosen} onClick={() => choose(r.id)}>
      <span className="fulfil-ref">{r.id}</span>
      <span className="fulfil-what"><strong>{r.what}</strong><small><r.icon size={13}/> {r.where}</small></span>
      <span className="fulfil-state">{r.state}</span>
      <span className="fulfil-when">{r.here ? 'Yours' : 'Elsewhere'}</span>
      <ChevronRight size={18}/>
     </button></li>)}</ol>
   </section>)}</div>
   <aside ref={panel} className="rq-case" aria-labelledby="fo-order" tabIndex={-1}>
    <div className="rq-case-head">
     <span className="rq-case-ref">{group.kind}</span>
     <h2 id="fo-order">{row.id} · {row.what}</h2>
     <div className="rq-case-standing"><Badge variant={row.here ? 'primary' : 'neutral'}>{row.here ? 'Yours to act on' : 'Elsewhere'}</Badge><span>{row.state}</span></div>
    </div>
    <ol className="fo-chain" aria-label={`Where ${row.id} is`}>{chain.map((link, n) => {
     const done = n < row.done, now = n === row.done;
     return <li key={link.step} className={done ? 'is-done' : now ? 'is-now' : ''}>
      <span className="fo-chain-no" aria-hidden="true">{done ? <Check size={14}/> : n + 1}</span>
      <div><strong>{link.step}{done ? <span className="visually-hidden"> — done</span> : now ? <span className="visually-hidden"> — next</span> : null}</strong><p>{link.says}</p></div>
     </li>;
    })}</ol>
    <Button variant="primary" className="rq-case-open" trailingIcon={<ArrowUpRight aria-hidden="true"/>} onClick={() => open(`${group.kind} ${row.id}`)}>
     {group.kind === 'Prescription' ? 'Open the prescription to act on it' : 'Open the laboratory order'}</Button>
    <p className="rq-case-note">{medicinesContract.partnerQueue.why.split('. ')[0]}.</p>
   </aside>
  </div>
 </>;
}

/* ---- Collections ---------------------------------------------------------------------------------------
 * Two kinds of collection leave a partner, and the export drew only the first: a sealed bag of medicine,
 * handed to whoever the patient authorised, and a laboratory sample, drawn inside its assay's window. The
 * bags are the Medicines store's, in the custody states packages/catalog/medicines.json names — nothing
 * typed, no time invented and no patient: a bag is its prescription reference, its seal and who may carry
 * it. The windows below are the board this section always was. */
function CollectionsBoard({ open }: { open: (s: string) => void }) {
 const s = useMedicines();
 const bags = [...new Set(s.authorisations.map(a => a.collectorRef))].flatMap(ref => roundFor(s, ref));
 const late = collections.filter(c => c.late).length;
 const states = medicinesContract.custody.states;
 return <>
  <div className="shift-head">
   {/* The strip above already counts them and marks the one past its window. What is left to say
       is the rule, which no figure can carry: a window belongs to the assay, not to the round. */}
   <div><h1>Collections</h1><p>{late ? 'One is outside its window. A sample drawn outside the window its assay allows has to be drawn again.' : 'Every collection is inside the window its assay allows.'}</p></div>
  </div>
  <NotConnected of="dispensing"/>
  <section className="dp-panel" aria-labelledby="fo-bags">
   <div className="dp-panel-head"><h2 id="fo-bags">Sealed bags to hand over</h2><span>{bags.length}</span></div>
   <NotConnected of="medicine-collection" tone="inline"/>
   {bags.length ? <ol className="dp-list">{bags.map(b => <li key={b.authorisation.authorisationRef} className="dp-row">
    <span className="dp-row-mark" aria-hidden="true"><PackageCheck size={18}/></span>
    <span className="dp-row-what"><span className="dp-row-ref">{b.prescription.prescriptionRef}{b.prescription.sealRef ? ` · ${b.prescription.sealRef}` : ''}</span>
     <strong>{scheduleName(b.prescription.scheduleCode)}</strong><small>Collected by the authorised {b.authorisation.collectorRole}</small></span>
    <span className="dp-row-state"><Badge variant={b.state === 'handed-over' ? 'success' : b.state === 'voided' ? 'danger' : 'warning'}>{custodyLabel(b.state)}</Badge></span>
   </li>)}</ol>
    : <p className="dp-empty"><strong>No sealed bag is waiting</strong>A bag is listed here once it has been dispensed and sealed and the patient has authorised who collects it. It moves through {states.filter(st => st.code !== 'voided').map(st => st.label.toLowerCase()).join(', then ')}.</p>}
  </section>
  <SectionTitle title={`Sample collections · ${collections.length}`}/>
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
