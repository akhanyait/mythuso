import { useMemo, useState } from 'react';
import { Ban, CalendarClock, Info, Scale } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { SectionTitle } from '../components/UI';
import { money } from '../lib/catalog';
import { doctorFeesFor } from '../lib/money';
import './nurse-kit.css';

/* What a doctor is paid for reviewing a case, which is: not decided.
 *
 * The documents give a range for a doctor's per-case review and no price. A screen like this is
 * where a made-up number would be most tempting and do the most harm — a figure a doctor reads as
 * her rate, which nobody agreed to. So the fee is the contract's null, rendered as the contract's
 * sentence; the range is shown as the range and labelled as one; and the one button on the screen
 * asks the ledger to schedule the payout and shows its refusal, word for word, rather than being
 * disabled with no reason given.
 *
 * The cases carry a reference and a date and nothing else. Money hears review.billable, which
 * names the review, the doctor and a fee code, and never the patient or why the review was needed —
 * so this screen has nobody to name, which is the design rather than a gap in it.
 */
const day = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'long' });

export function DoctorFees({ doctorRef = 'D-401' }: { doctorRef?: string }) {
 const view = useMemo(() => doctorFeesFor(doctorRef), [doctorRef]);
 const [answer, setAnswer] = useState<ReturnType<typeof view.schedule> | null>(null);
 const [low, high] = view.range;
 const decided = view.fee.amount !== null;
 return <div className="doctor-fees">
  <NotConnected of="payouts"/>
  <div className="panel">
   <div className="review-line"><span>{view.fee.name}</span><strong>{decided ? money(view.fee.amount!) : 'Not decided'}</strong></div>
   <div className="review-line"><span>The range the documents give</span><strong>{money(low)} to {money(high)}</strong></div>
   <p className="earn-rule"><Info size={15}/>{view.fee.undecided}</p>
   <p className="helper"><Scale size={13}/><span>{view.fee.source} Who decides it: {view.fee.whoDecides}</span></p>
  </div>

  <SectionTitle title="Cases recorded"/>
  <table className="admin-table">
   <caption className="visually-hidden">Signed reviews recorded for a per-case fee</caption>
   <thead><tr><th scope="col">Review</th><th scope="col">Signed</th><th scope="col">Fee</th></tr></thead>
   <tbody>{view.cases.map(c => <tr key={c.reviewRef}>
    <th scope="row">{c.reviewRef}</th>
    <td>{day.format(new Date(`${c.on}T00:00:00Z`))}</td>
    <td>{decided ? money(view.fee.amount!) : 'Not decided'}</td>
   </tr>)}</tbody>
  </table>
  <p className="helper">{view.casesWords}</p>

  <SectionTitle title="Payout"/>
  <div className="panel">
   <div className="review-line"><span>Owed for {view.cases.length} {view.cases.length === 1 ? 'case' : 'cases'}</span><strong>{decided ? money(view.fee.amount! * view.cases.length) : 'Not worked out'}</strong></div>
   {!answer ? <button className="secondary" onClick={() => setAnswer(view.schedule())}><CalendarClock size={16}/>Schedule this week’s payout</button> : null}
   {answer?.refused !== undefined ? <div className="earn-refusal" role="status"><Ban size={19}/><p>{answer.refused}</p></div> : null}
   {answer && answer.refused === undefined ? <div className="review-line" role="status"><span>Scheduled</span><strong>{money(answer.amount)}</strong></div> : null}
  </div>
 </div>;
}
