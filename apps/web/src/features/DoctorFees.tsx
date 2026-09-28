import { useMemo, useState } from 'react';
import { Ban, CalendarClock, Info, Scale } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { SectionTitle } from '../components/UI';
import { doctorFeesFor, randCents } from '../lib/money';
import { doctorFeeNow, useSettingsHistories } from '../lib/settings';
import './nurse-kit.css';
import { Button } from '../ui';

/* What a doctor is paid for reviewing a case, and whether it may be paid yet.
 *
 * The documents give a range for a doctor's per-case review and no price. The fee is Money's setting,
 * whose default is a proposal inside that range, and a proposal pays nobody: a figure a doctor reads as
 * her rate must be one somebody answers for. So the screen shows the fee in force and says, in the
 * contract's sentence, whether an admin has confirmed it; the range is shown as the range and labelled as
 * one; and the one button asks the ledger to schedule the payout and shows its answer — the refusal word
 * for word while the fee is unconfirmed, rather than a button disabled with no reason given.
 *
 * Every figure is the settings' in force, from lib/settings.ts, and each case shows the fee it was signed
 * under. An admin's change on the back office reaches this screen the next time it is opened.
 *
 * The cases carry a reference and a date and nothing else. Money hears review.billable, which
 * names the review, the doctor and a fee code, and never the patient or why the review was needed —
 * so this screen has nobody to name, which is the design rather than a gap in it.
 */
const day = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'long' });

export function DoctorFees({ doctorRef = 'D-401' }: { doctorRef?: string }) {
 const histories = useSettingsHistories();
 const view = useMemo(() => doctorFeesFor(doctorRef, doctorFeeNow), [doctorRef, histories]);
 const [answer, setAnswer] = useState<ReturnType<typeof view.schedule> | null>(null);
 const fee = view.inForce;
 return <div className="doctor-fees">
  <NotConnected of="payouts"/>
  <div className="panel">
   <div className="review-line"><span>{view.fee.name}</span><strong>{randCents(fee.amountCents)}</strong></div>
   <div className="review-line"><span>The range the documents give</span><strong>{randCents(fee.lowestCents)} to {randCents(fee.highestCents)}</strong></div>
   <p className="earn-rule" data-fee={fee.confirmed ? 'confirmed' : 'unconfirmed'}><Info size={15}/>{fee.confirmed ? view.fee.confirmed : view.fee.unconfirmed}</p>
   <p className="helper"><Scale size={13}/><span>{view.fee.source} {view.fee.whoSets}</span></p>
  </div>

  <SectionTitle title="Cases recorded"/>
  <table className="admin-table">
   <caption className="visually-hidden">Signed reviews recorded for a per-case fee</caption>
   <thead><tr><th scope="col">Review</th><th scope="col">Signed</th><th scope="col">Fee</th></tr></thead>
   <tbody>{view.cases.map(c => <tr key={c.reviewRef}>
    <th scope="row">{c.reviewRef}</th>
    <td>{day.format(new Date(`${c.on}T00:00:00Z`))}</td>
    <td>{randCents(c.amountCents)}{c.confirmed ? null : <small> · not confirmed</small>}</td>
   </tr>)}</tbody>
  </table>
  <p className="helper">{view.casesWords}</p>

  <SectionTitle title="Payout"/>
  <div className="panel">
   <div className="review-line"><span>Owed for {view.cases.length} {view.cases.length === 1 ? 'case' : 'cases'}</span><strong>{view.owedCents === null ? 'Not worked out' : randCents(view.owedCents)}</strong></div>
   {!answer ? <Button variant="secondary" leadingIcon={<CalendarClock aria-hidden="true"/>} onClick={() => setAnswer(view.schedule())}>Schedule this week’s payout</Button> : null}
   {answer?.refused !== undefined ? <div className="earn-refusal" role="status"><Ban size={19}/><p>{answer.refused}</p></div> : null}
   {answer && answer.refused === undefined ? <div className="review-line" role="status"><span>Scheduled</span><strong>{randCents(answer.amountCents)}</strong></div> : null}
  </div>
 </div>;
}
