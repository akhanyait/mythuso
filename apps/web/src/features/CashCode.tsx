import { useEffect, useId, useState } from 'react';
import { Banknote, Smartphone } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { CodeInput } from '../components/Steps';
import { money } from '../lib/catalog';
import { codeLength, deskWords, enterCashCode, nurseWords, releaseHeld, releaseReasons, useHeldCash, useNurseCash, visitBillable, type HeldRow } from '../lib/cash-codes';
import './cash-code.css';

/* The cash code, on the two screens that handle it: the nurse's at the door, and the operations desk's panel of
 * payments held for too many wrong codes.
 *
 * WHAT THE NURSE'S SCREEN WILL NOT DO. Record cash before Care says the visit is complete — it is drawn only on a
 * completed visit — or count attempts of its own, or say anything about a wrong code but the route's sentence.
 * The amount is the ledger's payable, never a figure typed here, and the patient's code is shown on the patient's
 * simulated screen once and then gone.
 *
 * WHAT THE DESK'S PANEL WILL NOT DO. Release a hold without one of the reasons money.json gives, or release a
 * payment that is not held. A release pays nothing and changes no code, and the row says so beside who released
 * it, when and why. Every refusal is the route's own sentence, from the ledger. */

const timeOf = (instant: string) =>
 new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));

/** On a completed visit: what the patient owes at the door, and the nurse entering their code. */
export function CashAtTheDoor() {
 useEffect(() => visitBillable(), []);
 const view = useNurseCash();
 const [code, setCode] = useState('');
 return <section className="cash-door" aria-labelledby="cash-door-title">
  <h4 id="cash-door-title"><Banknote size={17} aria-hidden="true"/>{nurseWords.heading}</h4>
  <div className="review-line cash-door-owed"><span>{view.stateName}</span><strong>{money(view.amount)}</strong></div>
  <div className="cash-phone" role="group" aria-label={nurseWords.patientPhone}>
   <span className="cash-phone-label"><Smartphone size={15} aria-hidden="true"/>{nurseWords.patientPhone}</span>
   {view.patientCode && <strong className="cash-phone-code">{view.patientCode}</strong>}
   <small>{view.patientCode ? nurseWords.shownOnce : nurseWords.shownAlready}</small>
  </div>
  {view.recorded
   ? <p className="care-fact cash-door-recorded" role="status">{nurseWords.recorded}</p>
   : <>
    <p className="care-note" id="cash-door-ask">{nurseWords.ask}</p>
    <CodeInput value={code} onChange={v => setCode(v)} label={nurseWords.codeLabel} describedBy="cash-door-ask cash-door-said" invalid={Boolean(view.refusal)}/>
    <p className="care-refusal-line cash-door-said" id="cash-door-said" role="status">{view.refusal ?? ''}</p>
    <div className="button-row care-actions">
     <button className="primary" disabled={code.length < codeLength} onClick={() => { enterCashCode(code); setCode(''); }}>{nurseWords.enter}</button>
    </div>
   </>}
  <NotConnected of="payments" tone="inline"/>
 </section>;
}

/** The operations desk's panel: cash payments the ledger held, and the release that needs a reason. */
export function HeldCashPayments() {
 const rows = useHeldCash();
 return <section className="cash-desk" aria-labelledby="cash-desk-title">
  <div className="cash-desk-head">
   <h2 id="cash-desk-title">{deskWords.heading}</h2>
   <p>{deskWords.intro}</p>
  </div>
  {rows.every(row => !row.held) && <p className="cash-desk-empty">{deskWords.empty}</p>}
  <ol className="cash-desk-list">{rows.map(row => <HeldCashRow key={row.paymentRef} row={row}/>)}</ol>
  <NotConnected of="payments" tone="inline"/>
 </section>;
}

function HeldCashRow({ row }: { row: HeldRow }) {
 const name = useId();
 const [reason, setReason] = useState('');
 return <li className={`cash-desk-row${row.released && !row.held ? ' is-released' : ''}`} data-payment={row.paymentRef}>
  <div className="cash-desk-line">
   <span className="cash-desk-ref">{row.paymentRef}</span>
   <strong>{row.serviceName}</strong>
   <span className="cash-desk-amount">{money(row.amount)}</span>
   <span className="cash-desk-nurse">{row.nurseRef}</span>
   <span className="cash-desk-count">{deskWords.wrongCodes.replace('{count}', String(row.wrongCodes))}</span>
  </div>
  {row.released && !row.held
   ? <p className="cash-desk-released" role="status">{deskWords.released}<small>{row.released.actorRef} · {timeOf(row.released.at)} · {row.released.reason}</small></p>
   : <>
    <fieldset className="cash-desk-reasons">
     <legend>{deskWords.reasonLabel}</legend>
     {releaseReasons.map(r => <label key={r.id}><input type="radio" name={name} value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)}/>{r.text}</label>)}
    </fieldset>
    <p className="cash-desk-refusal" role="status">{row.refusal ?? ''}</p>
    <div className="button-row"><button className="secondary" onClick={() => releaseHeld(row.paymentRef, reason)}>{deskWords.release}</button></div>
   </>}
 </li>;
}
