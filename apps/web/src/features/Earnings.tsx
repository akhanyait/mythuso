import { useState } from 'react';
import { ArrowRight, Ban, BadgeCheck, Building2, CalendarClock, CircleAlert, Info, Landmark, Lock, Receipt, RotateCcw, ShieldAlert, TrendingUp, Undo2, Wallet } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { liveServices, money, type Service } from '../lib/catalog';
import {
 account, currentWeek, cycle, lineKindById, owedNotYetPaid, paidThisTaxYear, refusalById, refusals,
 ruleById, shareRange, splitOf, stateById, taxYear, weeks, type EarningWeek
} from '../lib/earnings';
import { can, type VettingSubject } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';

/* What a nurse is paid.
 *
 * The landing page tells the public that a nurse keeps three quarters of every visit and is paid
 * weekly. Until this screen existed that promise had nowhere to be true. It is the kind of feature
 * that is easy to build as four numbers in a card, and the four numbers are the least of it — what
 * matters is the handful of things a payout screen must refuse to do:
 *
 *   Nothing is deducted from the nurse's share. The card fee and the doctor's review come out of
 *   the platform's quarter. A nurse can see the whole split of a visit, including what MyThuso
 *   keeps, because a marketplace that hides its own cut is asking to be guessed at.
 *
 *   A suspension is not a confiscation. A lapsed clearance stops new visits reaching her; the money
 *   for work already done goes out on its normal day. The banner at the top of this screen is
 *   driven by the same vetting record that stops dispatch, so the two can never disagree.
 *
 *   Nothing is money until it says paid, and a payout can fail. One of the four weeks below did.
 *
 *   No tax is withheld, and MyThuso does not advise on it. Both of those are said out loud.
 *
 *   Changing where you are paid waits, because account takeover is how a stolen sign-in becomes a
 *   stolen payout — and a payout already in flight goes to the account it was authorised against.
 *
 */

const day = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'long' });
const on = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const fully = (iso: string) => longDay.format(new Date(`${iso}T00:00:00Z`));
const percent = (n: number) => `${Math.round(n * 100)}%`;

/* Two nurses, one cleared and one whose police clearance lapsed nine days ago. Switching between
   them changes the standing banner and nothing else on the screen, which is the rule made visible:
   the suspension moves, the money does not. */
const shownNurses = ['N-205', 'N-204'];

function Standing({ nurse }: { nurse: VettingSubject }) {
 const dispatchable = can(nurse, 'take-visit');
 const rule = ruleById('suspension-is-not-confiscation');
 if (dispatchable.allowed) return <div className="earn-standing ok"><BadgeCheck size={20}/>
  <div><strong>Cleared for visits</strong><small>Every check is verified and in date. Visits can be sent to you.</small></div></div>;
 return <div className="earn-standing held"><ShieldAlert size={20}/>
  <div><strong>You will not be sent new visits</strong>
   <small>{dispatchable.reason}</small>
   <p className="earn-rule">{rule.sentence}</p></div></div>;
}

/* One visit, taken apart. The nurse's share, the card fee and what MyThuso keeps, from the same
   catalogue row the patient is quoted from. */
function Split({ service, onPick }: { service: Service; onPick: (id: string) => void }) {
 const split = splitOf(service);
 const rule = ruleById('share-is-not-reduced');
 return <div className="panel earn-split">
  <label>Show the split for<select value={service.id} onChange={e => onPick(e.target.value)}>
   {liveServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <div className="earn-bar" role="img" aria-label={`Of ${money(split.price)}, ${money(split.nurse)} is yours, ${money(split.payment)} is the card fee and ${money(split.platform)} is what MyThuso keeps`}>
   <i className="yours" style={{ flexGrow: split.nurse }}/>
   <i className="fee" style={{ flexGrow: split.payment }}/>
   <i className="platform" style={{ flexGrow: split.platform }}/>
  </div>
  <div className="earn-legend">
   <div><span className="key yours"/><strong>{money(split.nurse)}</strong><small>Yours · {percent(split.nurseShareOfPrice)} of the price</small></div>
   <div><span className="key fee"/><strong>{money(split.payment)}</strong><small>The card fee, paid by MyThuso</small></div>
   <div><span className="key platform"/><strong>{money(split.platform)}</strong><small>What MyThuso keeps</small></div>
  </div>
  <p className="earn-rule"><Info size={15}/>{rule.sentence}</p>
  <p className="helper">Across the nine services at launch that is {money(shareRange.low)} to {money(shareRange.high)} a visit — the same range the public page advertises, read from the same catalogue.</p>
 </div>;
}

function Week({ week, open, toggle }: { week: EarningWeek; open: boolean; toggle: () => void }) {
 const state = stateById(week.state);
 const tone = week.state === 'paid' ? 'teal' : week.state === 'failed' ? 'danger' : week.state === 'in-transit' ? 'sky' : 'amber';
 return <div className={`earn-week${open ? ' is-open' : ''}${week.state === 'failed' ? ' failed' : ''}`}>
  <button aria-expanded={open} onClick={toggle}>
   <span className="earn-week-head">
    <strong>{money(week.total)}</strong>
    <small>Week to {on(week.ends)} · {week.visits} {week.visits === 1 ? 'visit' : 'visits'}</small>
   </span>
   <Pill tone={tone}>{state.name}</Pill>
  </button>
  <div className="earn-week-body" inert={!open}><div>
   <p className="helper">{state.detail}</p>
   {week.state === 'paid' && week.paidOn ? <p className="helper"><Landmark size={14}/>Paid into {account.maskedNumber} on {fully(week.paidOn)}.</p> : null}
   {week.state === 'in-transit' ? <p className="helper"><CalendarClock size={14}/>Sent on {fully(week.pays)}. Banks take {cycle.clearsInDays[0]}–{cycle.clearsInDays[1]} business days.</p> : null}
   {week.failure ? <div className="earn-failure"><CircleAlert size={19}/><p>{week.failure}</p></div> : null}
   <table className="admin-table earn-lines">
    <caption className="visually-hidden">Every line in the week to {on(week.ends)}</caption>
    <thead><tr><th scope="col">Visit</th><th scope="col">What</th><th scope="col">When</th><th scope="col">Amount</th></tr></thead>
    <tbody>{week.lines.map(line => <tr key={line.reference + line.kind} className={line.amount < 0 ? 'negative' : ''}>
     <th scope="row">{line.reference}<small>{line.patient}{line.area ? ` · ${line.area}` : ''}</small></th>
     <td>{line.service ? line.service.name : lineKindById(line.kind).name}
      {line.plan ? <small><Receipt size={12}/>{line.plan}</small> : null}
      {line.reason ? <small className="earn-reason">{line.kind === 'reversal' ? <Undo2 size={12}/> : <RotateCcw size={12}/>}{line.reason}</small> : null}</td>
     <td>{on(line.on)}</td>
     <td className="earn-amount">{line.amount < 0 ? `− ${money(-line.amount)}` : money(line.amount)}</td>
    </tr>)}</tbody>
    <tfoot><tr><th scope="row" colSpan={3}>Total for the week</th><td className="earn-amount">{money(week.total)}</td></tr></tfoot>
   </table>
   {week.lines.some(l => l.amount < 0) ? <p className="earn-rule"><Info size={15}/>{ruleById('every-deduction-is-named').sentence}</p> : null}
  </div></div>
 </div>;
}

/* Changing the account is the one destructive action on this screen, so it is the one that waits.
   Three states: as it is, being re-verified, and pending until the cooling-off period is up. */
function PayoutAccount() {
 const [stage, setStage] = useState<'settled' | 'verifying' | 'pending'>('settled');
 const [code, setCode] = useState('');
 const rule = ruleById('account-change-waits');
 return <div className="panel earn-account">
  <div className="record-row plain">
   <span className="service-icon"><Building2 size={21}/></span>
   <span><strong>{account.bank} · {account.maskedNumber}</strong><small>{account.holder} · {account.note}</small></span>
   {stage === 'settled' ? <button className="secondary" onClick={() => setStage('verifying')}>Change account</button> : null}
  </div>
  {stage === 'verifying' ? <form className="form-stack space-top" onSubmit={e => { e.preventDefault(); setStage('pending'); }}>
   <p className="muted">Before anything changes, we check it is you. Nothing here is sent.</p>
   <ul className="landing-list">{account.reverify.map(step => <li key={step}><Lock size={16}/>{step}</li>)}</ul>
   <label>One-time code<input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="240924"/></label>
   <div className="button-row">
    <button type="button" className="secondary" onClick={() => { setStage('settled'); setCode(''); }}>Cancel</button>
    <button className="primary" disabled={code.length !== 6}>Verify and start the wait<ArrowRight size={16}/></button>
   </div>
  </form> : null}
  {stage === 'pending' ? <div className="earn-pending space-top" role="status">
   <CalendarClock size={20}/>
   <div><strong>Waiting {account.coolingOffHours} hours</strong>
    <p>{rule.sentence}</p>
    <button className="text-button" onClick={() => { setStage('settled'); setCode(''); }}><Undo2 size={15}/>Cancel the change</button></div>
  </div> : null}
  {stage !== 'pending' ? <p className="earn-rule"><Info size={15}/>{rule.sentence}</p> : null}
 </div>;
}

export function Earnings() {
 const [nurseId, setNurseId] = useState(shownNurses[0]);
 const [serviceId, setServiceId] = useState(liveServices[1].id);
 const [openWeek, setOpenWeek] = useState<string | null>(weeks[1].id);
 const nurse = subjectById(nurseId)!;
 const service = liveServices.find(s => s.id === serviceId)!;
 return <div className="earnings">
  <NotConnected of="payouts"/>
  <Standing nurse={nurse}/>
  <fieldset className="earn-preview-switch">
   <legend className="visually-hidden">Whose earnings to show</legend>
   {shownNurses.map(id => { const n = subjectById(id)!; return <label key={id} className={nurseId === id ? 'selected' : ''}>
    <input type="radio" name="earn-nurse" checked={nurseId === id} onChange={() => setNurseId(id)}/>
    <span>{n.name}</span></label>; })}
   <p className="helper">The same earnings, seen by a cleared nurse and by one whose police clearance lapsed nine days ago. Only the banner changes — which is the rule.</p>
  </fieldset>

  <div className="metric-grid space-top">
   <div className="panel metric"><span>This week so far</span><strong>{money(currentWeek.total)}</strong><small>{currentWeek.visits} visits · closes {cycle.closesOn}, pays {cycle.paysOn}</small></div>
   <div className="panel metric"><span>Owed, not yet in your account</span><strong>{money(owedNotYetPaid)}</strong><small>On its way, or waiting on a bank</small></div>
   <div className="panel metric"><span>Reached your account this tax year</span><strong>{money(paidThisTaxYear)}</strong><small>Since {taxYear.startsOn} · {taxYear.label}</small></div>
  </div>
  <p className="earn-rule"><Info size={15}/>{ruleById('accrued-is-not-paid').sentence}</p>

  <SectionTitle title="Where the money goes"/>
  <Split service={service} onPick={setServiceId}/>

  <SectionTitle title="Your weeks"/>
  <p className="muted">{cycle.note}</p>
  <div className="earn-weeks space-top">
   {weeks.map(week => <Week key={week.id} week={week} open={openWeek === week.id} toggle={() => setOpenWeek(openWeek === week.id ? null : week.id)}/>)}
  </div>

  <SectionTitle title="Tax"/>
  <div className="panel earn-tax">
   <div className="review-line"><span>Reached your account since {taxYear.startsOn}</span><strong>{money(paidThisTaxYear)}</strong></div>
   <div className="review-line"><span>Tax withheld by MyThuso</span><strong>{money(0)}</strong></div>
   <p className="helper">{taxYear.note}</p>
   <p className="earn-rule"><Info size={15}/>{ruleById('no-tax-withheld').sentence}</p>
   <div className="earn-refusal"><Ban size={19}/><p>{refusalById('advise-on-tax').sentence}</p></div>
  </div>

  <SectionTitle title="Where you are paid"/>
  <PayoutAccount/>

  <SectionTitle title="What this screen will not do"/>
  <div className="earn-refusals">{refusals.filter(r => r.id !== 'advise-on-tax').map(r =>
   <div className="earn-refusal" key={r.id}><Ban size={19}/><p>{r.sentence}</p></div>)}</div>
  <EmptyNote>Payment runs, bank verification and the ledger itself arrive with the payment provider. Every amount above is the catalogue's own arithmetic, and none of it has been rounded to look better.</EmptyNote>
 </div>;
}

/* The nurse's own summary of the week, for the workspace tile that opens this screen. */
export function earningsSummary() {
 return { thisWeek: currentWeek.total, visits: currentWeek.visits, owed: owedNotYetPaid };
}
export const earningsIcons = { Wallet, TrendingUp };
