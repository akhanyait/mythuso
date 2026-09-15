import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { CodeInput } from '../components/Steps';
import type { Refusal } from '../../../../packages/engines/src/medicines/domain/contract.ts';
import {
 PHARMACY, acknowledgeResult, acknowledgement, authoriseCollector, clockOf, closeOrder, collectBag, collectorChoices, custodyLabel, fillHl7, hl7Laboratory, hl7Words, receiveHl7Result,
 dispensePrescription, fill, formulary, handOverBag, labModes, labStateLabel, labStateOf, newSealRef, orderTest, outcomeLabel, outcomeReason,
 patientPrescriptions, pinDigits, queue, roundFor, runDispenseCheck, runPrescribeCheck, scheduleName, search, stateLabel, stateOf, useMedicines,
 verifyPrescription, words, writePrescription, type Round
} from '../lib/medicines';
import { subjectById } from '../lib/vetting-fixtures';
import './medicines.css';

/* Medicines & Labs, on the four screens the people in the chain work from.
 *
 * The doctor prescribes and acknowledges results; the pharmacy's responsible pharmacist verifies and dispenses from
 * a queue that carries no patient; the patient chooses who collects and is shown a PIN once; the nurse collects the
 * sealed bag and hands it over. Every rule is packages/engines/src/medicines/domain's through lib/medicines.ts, every
 * word is packages/catalog/medicines.json's, and every refusal is rendered as the domain returned it, so the sentence
 * here is the sentence the route answers with.
 *
 * NOT CHECKED IS SHOWN AS NOT CHECKED. The check's reason is drawn in full, beside the box the prescriber or the
 * pharmacist ticks to say they read it, and nothing on these screens is worded as a clean check.
 *
 * None of this is on the patient's first load. The staff screens travel in the clinical workspace's dynamic import,
 * and the patient's dialog is its own lazy import from App.tsx. Nothing is prescribed, dispensed, collected or
 * tested, and the capability notices say so in the contract's words.
 */

/* A refusal is announced when it arrives, as an alert: it is the answer to what the person just pressed. */
function Refused({ refusal }: { refusal: Refusal | null }) {
 return refusal ? <p className="md-refused" role="alert">{refusal.statement}</p> : null;
}
/* A state is a word in a chip with a rule beside it, so waiting, done and stopped differ in shape as well as colour. */
const State = ({ label, tone }: { label: string; tone: 'waiting' | 'done' | 'stopped' | '' }) => <span className={`md-state ${tone ? `is-${tone}` : ''}`}>{label}</span>;

/* The check's answer and the box that says it was read, at prescribe and at dispense alike. */
function CheckAnswer({ outcomeCode, read, setRead }: { outcomeCode: string; read: boolean; setRead: (v: boolean) => void }) {
 return <div className="md-check">
  <strong>{fill(words.prescribe.checkResult, { outcome: outcomeLabel(outcomeCode) })}</strong>
  <p>{outcomeReason(outcomeCode)}</p>
  <label className="md-tick"><input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)}/>{acknowledgement}</label>
 </div>;
}

/* The staff screens open in a dialog the shell titles with the same contract heading, so they draw only the
   sentence; a second heading with the same words is a reader told twice where they are. The patient's dialog is
   titled by the capability, so it keeps its own heading. */
const Head = ({ title, intro }: { title?: string; intro: string }) => <div className="md-head">{title && <h2>{title}</h2>}<p>{intro}</p></div>;

/* ---- The doctor ---------------------------------------------------------------------------------------- */

export function DoctorPrescribe() {
 const s = useMedicines();
 const [query, setQuery] = useState('');
 const [chosen, setChosen] = useState('');
 const [checkRef, setCheckRef] = useState<string | null>(null);
 const [read, setRead] = useState(false);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const [written, setWritten] = useState(false);
 const found = query.trim() ? search(query) : null;
 const check = s.checks.find(c => c.checkRef === checkRef);
 const pharmacy = subjectById(PHARMACY);
 return <div className="md-screen"><section className="md-panel">
  <Head intro={words.prescribe.intro}/>
  <NotConnected of="dispensing" tone="inline"/>
  <p className="md-notice" role="note">{formulary.notice}</p>
  <div className="md-search"><label htmlFor="md-query">{words.prescribe.search}</label>
   <div className="md-search-row"><input id="md-query" value={query} onChange={e => { setQuery(e.target.value); setWritten(false); }}/></div></div>
  {found?.ok && <fieldset className="md-choices"><legend className="md-visually-hidden">{words.prescribe.search}</legend>{found.value.entries.map(entry =>
   <label key={entry.entryCode} className="md-choice">
    <input type="radio" name="md-entry" checked={chosen === entry.entryCode} onChange={() => setChosen(entry.entryCode)}/>
    <span><strong>{entry.label}</strong><small>{entry.entryCode}</small></span>
    <span className="md-schedule">{scheduleName(entry.scheduleCode)}</span>
   </label>)}</fieldset>}
  {found && !found.ok && <Refused refusal={found.refusal}/>}
  <p className="md-carried">{words.prescribe.pharmacy}: {pharmacy ? `${pharmacy.name} · ${pharmacy.reference}` : PHARMACY}</p>
  <div className="md-actions">
   <button className="secondary" disabled={!chosen} onClick={() => { const ran = runPrescribeCheck(); setCheckRef(ran.value?.checkRef ?? null); setRead(false); setRefusal(ran.refusal); }}>{words.prescribe.check}</button>
  </div>
  {check && <CheckAnswer outcomeCode={check.outcomeCode} read={read} setRead={setRead}/>}
  <div className="md-actions">
   <button className="primary" disabled={!chosen || !checkRef} onClick={() => {
    const entry = formulary.entries.find(e => e.entryCode === chosen)!;
    const done = writePrescription({ scheduleCode: entry.scheduleCode, checkRef: checkRef ?? '', notCheckedRead: read });
    setRefusal(done.refusal);
    if (!done.refusal) { setWritten(true); setCheckRef(null); setRead(false); }
   }}>{words.prescribe.prescribe}</button>
  </div>
  <Refused refusal={refusal}/>
  {written && <p className="md-done" role="status">{words.prescribe.prescribed}</p>}
 </section></div>;
}

export function LabResults() {
 const s = useMedicines();
 const [mode, setMode] = useState(labModes[0]!.id);
 const [refusals, setRefusals] = useState<Record<string, Refusal | null>>({});
 const [ordered, setOrdered] = useState<{ refusal: Refusal | null } | null>(null);
 return <div className="md-screen"><section className="md-panel">
  <Head intro={words.results.intro}/>
  <NotConnected of="laboratory-results" tone="inline"/>
  <p className="md-notice" role="note">{hl7Words.results.preview}</p>
  <div className="md-order">
   <fieldset className="md-choices is-pair"><legend>{words.results.mode}</legend>{labModes.map(m =>
    <label key={m.id} className="md-choice"><input type="radio" name="md-mode" checked={mode === m.id} onChange={() => setMode(m.id)}/><span><strong>{m.label}</strong></span></label>)}</fieldset>
   <button className="secondary" onClick={() => setOrdered({ refusal: orderTest(mode).refusal })}>{words.results.order}</button>
  </div>
  {ordered && !ordered.refusal && <p className="md-done" role="status">{words.results.ordered}</p>}
  <Refused refusal={ordered?.refusal ?? null}/>
  {!s.orders.length && <p className="md-empty">{words.results.empty}</p>}
  {s.orders.length > 0 && <ol className="md-rows">{s.orders.map(order => {
   const result = s.results.find(r => r.labOrderRef === order.labOrderRef);
   const state = labStateOf(order);
   return <li key={order.labOrderRef} className="md-row" data-order={order.labOrderRef}>
    <div className="md-row-line">
     <span className="md-ref">{order.labOrderRef}</span>
     <span className="md-row-what"><strong>{labModes.find(m => m.id === order.collectionMode)?.label}</strong>{result && <small>{result.resultRef}</small>}
      {result?.arrivedBy && <small>{fillHl7(hl7Words.results.arrivedBy, result.arrivedBy)}</small>}</span>
     <State label={labStateLabel(state)} tone={state === 'result-received' ? 'waiting' : state === 'ordered' ? '' : 'done'}/>
    </div>
    {state === 'result-received' && result?.arrivedBy && <p className="md-empty">{hl7Words.results.notComplete}</p>}
    {state !== 'closed' && <div className="md-row-act">
     {state === 'ordered' && <button className="secondary" onClick={() => setRefusals({ ...refusals, [order.labOrderRef]: receiveHl7Result(order.labOrderRef) })}>{fillHl7(hl7Words.results.receiveHl7, { facility: hl7Laboratory.label })}</button>}
     <button className="secondary" disabled={!result || result.acknowledgedAt !== null} onClick={() => setRefusals({ ...refusals, [order.labOrderRef]: result ? acknowledgeResult(result.resultRef) : null })}>{words.results.acknowledge}</button>
     <button className="secondary" onClick={() => setRefusals({ ...refusals, [order.labOrderRef]: closeOrder(order.labOrderRef).refusal })}>{words.results.close}</button>
    </div>}
    {state === 'acknowledged' && <p className="md-done" role="status">{words.results.acknowledged}</p>}
    {state === 'closed' && <p className="md-done" role="status">{words.results.closed}</p>}
    <Refused refusal={refusals[order.labOrderRef] ?? null}/>
   </li>;
  })}</ol>}
 </section></div>;
}

/* ---- The pharmacy -------------------------------------------------------------------------------------- */

export function PharmacyQueue() {
 const s = useMedicines();
 const rows = queue(s);
 return <div className="md-screen"><section className="md-panel is-queue">
  <Head intro={words.pharmacy.intro}/>
  <NotConnected of="dispensing" tone="inline"/>
  {!rows.length && <p className="md-empty">{words.pharmacy.empty}</p>}
  {rows.length > 0 && <ol className="md-rows">{rows.map(row => <QueueRow key={row.prescriptionRef} row={row}/>)}</ol>}
 </section></div>;
}

function QueueRow({ row }: { row: ReturnType<typeof queue>[number] }) {
 const s = useMedicines();
 const [checkRef, setCheckRef] = useState<string | null>(null);
 const [read, setRead] = useState(false);
 const [seal] = useState(newSealRef);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const [said, setSaid] = useState('');
 const check = s.checks.find(c => c.checkRef === checkRef);
 return <li className="md-row" data-prescription={row.prescriptionRef}>
  <div className="md-row-line">
   <span className="md-ref">{row.prescriptionRef}</span>
   <span className="md-row-what"><strong>{scheduleName(row.scheduleCode)}</strong><small>{row.medicationRequestRef}</small></span>
   <State label={stateLabel(row.stateCode)} tone={row.stateCode === 'dispensed' ? 'done' : 'waiting'}/>
  </div>
  <p className="md-carried">{fill(words.pharmacy.checkedAtPrescribe, { outcome: outcomeLabel(row.prescribeCheckOutcomeCode) })}</p>
  {row.stateCode === 'prescribed' && <div className="md-row-act">
   <button className="primary" onClick={() => { const done = verifyPrescription(row.prescriptionRef); setRefusal(done.refusal); if (!done.refusal) setSaid(words.pharmacy.verified); }}>{words.pharmacy.verify}</button>
  </div>}
  {row.stateCode === 'verified' && <div className="md-dispense">
   <div className="md-actions"><button className="secondary" onClick={() => { const ran = runDispenseCheck(); setCheckRef(ran.value?.checkRef ?? null); setRead(false); setRefusal(ran.refusal); }}>{words.pharmacy.dispenseCheck}</button></div>
   {check && <CheckAnswer outcomeCode={check.outcomeCode} read={read} setRead={setRead}/>}
   <p className="md-carried">{words.pharmacy.seal}: {seal}</p>
   <div className="md-actions"><button className="primary" disabled={!checkRef} onClick={() => { const done = dispensePrescription(row.prescriptionRef, { checkRef: checkRef ?? '', sealRef: seal, notCheckedRead: read }); setRefusal(done.refusal); if (!done.refusal) setSaid(words.pharmacy.dispensed); }}>{words.pharmacy.dispense}</button></div>
  </div>}
  {said && <p className="md-done" role="status">{said}</p>}
  <Refused refusal={refusal}/>
 </li>;
}

/* ---- The patient --------------------------------------------------------------------------------------- */

export function AuthoriseCollector() {
 const s = useMedicines();
 const mine = patientPrescriptions(s);
 const [role, setRole] = useState(collectorChoices[0]!.id);
 const [shown, setShown] = useState<{ pin: string; pinExpiresAt: number; windowEndsAt: number } | null>(null);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 return <div className="md-authorise">
  <Head title={words.authorise.heading} intro={words.authorise.intro}/>
  <NotConnected of="medicine-collection" tone="inline"/>
  {!mine.length && <p className="md-empty">{words.authorise.empty}</p>}
  {mine.length > 0 && <>
   <fieldset className="md-choices"><legend>{words.authorise.collector}</legend>{collectorChoices.map(c =>
    <label key={c.id} className="md-choice"><input type="radio" name="md-collector" checked={role === c.id} onChange={() => setRole(c.id)}/><span><strong>{c.name}</strong></span></label>)}</fieldset>
   <ol className="md-rows">{mine.map(p => <li key={p.prescriptionRef} className="md-row">
    <div className="md-row-line">
     <span className="md-ref">{p.prescriptionRef}</span>
     <span className="md-row-what"><strong>{scheduleName(p.scheduleCode)}</strong></span>
     <State label={stateLabel(stateOf(p))} tone={p.dispensedAt !== null ? 'done' : 'waiting'}/>
    </div>
    <div className="md-row-act"><button className="primary" onClick={() => {
     const answer = authoriseCollector(p.prescriptionRef, role);
     setRefusal(answer.refusal);
     setShown(answer.shown ? { pin: answer.shown.pin, pinExpiresAt: answer.shown.authorisation.pinExpiresAt, windowEndsAt: answer.shown.authorisation.windowEndsAt } : null);
    }}>{words.authorise.authorise}</button></div>
   </li>)}</ol>
  </>}
  <Refused refusal={refusal}/>
  {/* The only large figure here, because it is the only thing the patient opened this for. It is shown once: the
      store keeps its digest, and closing the dialog drops the only copy. */}
  {shown && <div className="md-pin-sheet" role="group" aria-labelledby="md-pin-heading">
   <h3 id="md-pin-heading"><Smartphone size={16} aria-hidden="true"/> {words.authorise.pinHeading}</h3>
   <p className="md-pin" data-testid="medicines-pin">{shown.pin}</p>
   <p className="md-pin-once">{words.authorise.pinShownOnce}</p>
   <p>{fill(words.authorise.pinExpires, { at: clockOf(shown.pinExpiresAt) })}</p>
   <p>{fill(words.authorise.windowEnds, { at: clockOf(shown.windowEndsAt) })}</p>
  </div>}
 </div>;
}

/* ---- The collector ------------------------------------------------------------------------------------- */

export function CollectionHandover() {
 const s = useMedicines();
 const round = roundFor(s);
 return <div className="md-screen"><section className="md-panel">
  <Head intro={words.handover.intro}/>
  <NotConnected of="medicine-collection" tone="inline"/>
  {!round.length && <p className="md-empty">{words.handover.empty}</p>}
  {round.length > 0 && <ol className="md-rows">{round.map(r => <HandoverRow key={r.authorisation.authorisationRef} round={r}/>)}</ol>}
 </section></div>;
}

function HandoverRow({ round }: { round: Round }) {
 const [pin, setPin] = useState('');
 const [sealIntact, setSealIntact] = useState<boolean | null>(null);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const name = `md-seal-${round.authorisation.authorisationRef}`;
 return <li className="md-row" data-authorisation={round.authorisation.authorisationRef}>
  <div className="md-row-line">
   <span className="md-ref">{round.prescription.prescriptionRef}</span>
   <span className="md-row-what"><strong>{scheduleName(round.prescription.scheduleCode)}</strong>{round.prescription.sealRef && <small>{round.prescription.sealRef}</small>}</span>
   <State label={custodyLabel(round.state)} tone={round.state === 'voided' ? 'stopped' : round.state === 'handed-over' ? 'done' : 'waiting'}/>
  </div>
  {round.state === 'authorised' && <div className="md-row-act">
   <button className="primary" onClick={() => setRefusal(collectBag(round.authorisation.authorisationRef, round.prescription.sealRef ?? '').refusal)}>{words.handover.collect}</button>
  </div>}
  {round.state === 'collected' && round.collection && <div className="md-dispense">
   <fieldset className="md-choices is-pair"><legend className="md-visually-hidden">{words.handover.sealIntact}</legend>
    <label className="md-choice"><input type="radio" name={name} checked={sealIntact === true} onChange={() => setSealIntact(true)}/><span><strong>{words.handover.sealIntact}</strong></span></label>
    <label className="md-choice"><input type="radio" name={name} checked={sealIntact === false} onChange={() => setSealIntact(false)}/><span><strong>{words.handover.sealBroken}</strong></span></label>
   </fieldset>
   <CodeInput value={pin} onChange={setPin} length={pinDigits} label={words.handover.pin} invalid={!!refusal}/>
   <p className="md-carried">{fill(words.handover.attemptsLeft, { left: String(round.left) })}</p>
   <div className="md-actions"><button className="primary" disabled={pin.length < pinDigits || sealIntact === null} onClick={() => { setRefusal(handOverBag(round.collection!.collectionRef, pin, sealIntact === true)); setPin(''); }}>{words.handover.handOver}</button></div>
  </div>}
  {round.state === 'handed-over' && <p className="md-done" role="status">{words.handover.handedOver}</p>}
  <Refused refusal={refusal}/>
 </li>;
}
