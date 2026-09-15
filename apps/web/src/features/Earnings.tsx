import { useState } from 'react';
import { ArrowRight, Ban, BadgeCheck, Building2, CalendarClock, CircleAlert, Info, Landmark, Lock, Receipt, RotateCcw, ShieldAlert, TrendingUp, Undo2, Wallet } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { Metric } from '../surface/Surface';
import { ClinicalDeck, type DeckFigure } from './ClinicalDeck';
import { NotConnected } from '../components/NotConnected';
import { blockedBy } from '../lib/capabilities';
import { liveServices, money, type Service } from '../lib/catalog';
import {
 account, currentWeek, cycle, lineKindById, owedNotYetPaid, paidThisTaxYear, refusalById, refusals,
 ruleById, shareRange, splitOf, stateById, taxYear, weeks, type EarningWeek
} from '../lib/earnings';
import { days, forecast, hoursOffered, typicalOver, typicalShare } from '../lib/forecast';
import { can, type VettingSubject } from '../lib/vetting';
/* No payment provider is contracted, so the payment run on this screen is a simulated bank behind
   Thuso Money's locked payout-advice door. It pays nobody, verifies no account and reverses nothing —
   and within that, it answers a week's run with the same three states earnings.json already draws,
   in the same sentences, for the amount the ledger worked out from the week's lines. */
import { askToVerifyAccount } from '../lib/simulation';
import { runWeek, type PayoutAdvice } from '../lib/money';
import { nurseShareSentenceNow } from '../lib/settings';
import { subjectById } from '../lib/vetting-fixtures';
import './nurse-kit.css';
import './nurse-tools.css';

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
/* An amount, split so the rand sign can be set small beside a large thin figure. Intl gives one
   string; the design needs the symbol and the digits apart, and finding the first digit is the only
   way to do that which survives a locale putting the symbol on the other side. */
/* A rand amount split where the numeral starts, so a Metric can set the sign small and the figure
   large. Exported because the clinical shell's strip shows this screen's week above the nurse's
   schedule, and a second formatter for the same amount is a second place it can be wrong. */
export const rand = (n: number) => { const s = money(n); const i = s.search(/\d/); return { prefix: s.slice(0, i), value: s.slice(i) }; };

/* Two nurses, one cleared and one whose police clearance lapsed nine days ago. Switching between
   them changes the standing banner and nothing else on the screen, which is the rule made visible:
   the suspension moves, the money does not. */
const shownNurses = ['N-205', 'N-204'];

/* ---- The week, and the weeks behind it ---------------------------------------------------------
 *
 * The deck at the top of this screen is the only live instrument on it: everything on the sheet
 * below is a record of something that has already happened. Every figure on it is `lib/earnings.ts`
 * arithmetic over `packages/catalog/earnings.json` — nothing here types a rand — and the deck itself
 * is the clinical portal's own, so the count-up, the line and the bars are the ones the nurse's day
 * already draws rather than a second set drawn here.
 *
 * The line under the lead is the weeks that are closed, oldest first by their own end dates. This
 * week is not on it: a week still accruing drawn beside finished ones would be a figure falling every
 * Monday morning and a nurse reading a decline that is only the calendar.
 */
const weeksBehind = weeks.filter(w => w.state !== 'accruing').sort((a, b) => a.ends.localeCompare(b.ends)).map(w => w.total);
/* The closed weeks that have not reached her account, oldest first. Their totals ARE the owed figure —
   owedNotYetPaid is the sum of exactly these — so the bars under that numeral are the numeral taken
   apart, each one a week listed on the sheet below (one on its way, one a bank sent back), and not a
   drawing of anything else. */
const owedWeeks = weeks.filter(w => !stateById(w.state).settled && w.state !== 'accruing').sort((a, b) => a.ends.localeCompare(b.ends));

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
  {/* The rule opens with what the share is, in the words in force: Money's setting, which never states a
      fraction, because the share beside it is not the same part of every visit. */}
  <p className="earn-rule" data-rule="share-is-not-reduced"><Info size={15}/>{nurseShareSentenceNow()} {rule.sentence}</p>
  <p className="helper">Across the nine services at launch that is {money(shareRange.low)} to {money(shareRange.high)} a visit — the same range the public page advertises, read from the same catalogue.</p>
 </div>;
}

/* ---- If you take a shift ---------------------------------------------------------------------
 *
 * The rest of this screen is a record. This is the one part of it that helps somebody decide
 * something, and the decision is always the same one: is Saturday worth it. A total cannot answer
 * that — R598 is not an answer to "how much more" — so everything here is a difference, and the
 * difference is bounded rather than predicted. Nothing in MyThuso knows what dispatch will fill;
 * there is no roster, and the capability contract says so in the words below.
 *
 * The three stops are arithmetic on two contracts: the scheduling contract's nine hourly slots, and
 * the services catalogue's nurse share. The one in the middle is not an estimate either — it is the
 * mean of the visits she has actually been paid for, counted off her own weeks.
 */
function Shift() {
 const offered = days();
 const [dayIso, setDayIso] = useState(offered[0].iso);
 const [hours, setHours] = useState<string[]>([]);
 const day = offered.find(d => d.iso === dayIso)!;
 const view = forecast({ day, hours });
 const toggle = (hour: string) => setHours(current => current.includes(hour) ? current.filter(h => h !== hour) : [...current, hour].sort());
 const added = rand(view.typical);
 /* The tick sits where her own mix falls between nothing and every hour at the highest share. It is
    a position on a track and carries no text, because a marker with a word on it becomes a label
    that has to stay legible at every width it can land at. */
 const at = view.highest ? Math.round((view.typical / view.highest) * 100) : 0;
 return <div className="panel form-stack fc">
  <div className="date-strip" role="group" aria-label="Which day you could work">
   {offered.map(entry => <button key={entry.iso} type="button" aria-pressed={dayIso === entry.iso}
    aria-label={`${entry.weekday} ${entry.day} ${entry.month}`}
    className={`date-chip ${dayIso === entry.iso ? 'selected' : ''}`} onClick={() => { setDayIso(entry.iso); }}>
    <span>{entry.weekday}</span><strong>{entry.day}</strong><span>{entry.month}</span>
   </button>)}
  </div>
  <div className="time-grid" role="group" aria-label="Which hours you could work">
   {hoursOffered.map(hour => <button key={hour} type="button" aria-pressed={hours.includes(hour)}
    className={`time-chip ${hours.includes(hour) ? 'selected' : ''}`} onClick={() => toggle(hour)}>{hour}</button>)}
  </div>
  <p className="helper">Hourly, and the hour after twelve is missing because a nurse eats. One visit fits an hour whether it is a twenty-minute injection or an hour of elderly care, so the hours you offer are the visits that can reach you.</p>

  {!hours.length
   ? <div className="fc-empty" role="status"><CalendarClock size={22}/><div><strong>No hours offered yet</strong>
     <p>Tap the hours you could work on {day.weekday} {day.day} {day.month} and this says what they would add — not what you would have, what would be different.</p></div></div>
   : <>
    <div className="fc-lead">
     <Metric prefix={`+ ${added.prefix}`} value={added.value} chip={`${view.hours} ${view.hours === 1 ? 'hour' : 'hours'} · ${view.hours} ${view.hours === 1 ? 'visit' : 'visits'} at most`}
      label={`Added ${view.inThisWeek ? 'to this week' : 'to next week'}, on the mix you have been doing`}/>
     <div className="fc-range">
      <div className="fc-track" role="img" aria-label={`Between nothing and ${money(view.highest)}, with your own mix at ${money(view.typical)}`}>
       <i style={{ width: `${at}%` }}/><b style={{ left: `${at}%` }}/>
      </div>
      <div className="fc-stops">
       <div><strong>{money(view.nothing)}</strong><small>If nothing is booked into them</small></div>
       <div className="fc-stop-typical"><strong>{money(view.typical)}</strong><small>Your own mix, across {typicalOver} visits — about {money(Math.round(typicalShare))} each</small></div>
       <div><strong>{money(view.highest)}</strong><small>Every hour filled, at the highest share</small></div>
      </div>
     </div>
    </div>

    {/* Which week it lands in, which is the fact a person deciding on a Tuesday actually needs and
        the one nothing on this screen used to answer. It is arithmetic on the payout cycle. */}
    <div className="fc-week">
     {view.inThisWeek
      ? <><div className="review-line"><span>This week so far</span><strong>{money(view.weekSoFar)}</strong></div>
        <div className="review-line"><span>With that shift, on your own mix</span><strong>{money(view.weekWithIt)}</strong></div>
        <p className="helper"><CalendarClock size={13}/><span>It would reach your account on {view.paysText}, if it fills that way.</span></p></>
      : <><div className="review-line"><span>This week so far</span><strong>{money(currentWeek.total)}</strong></div>
        <div className="review-line"><span>{day.weekday} {day.day} {day.month}</span><strong>Next week</strong></div>
        <p className="helper"><CalendarClock size={13}/><span>That day falls after this week ends on {view.endsText}, so it changes this week’s figure by nothing at all. It would reach your account a week later, on {view.paysText}.</span></p></>}
    </div>
   </>}

  {/* The refusal that matters most on a screen about money that has not been earned. It is the
      contract's own sentence, not a paraphrase — a forecast is exactly where somebody would think
      of borrowing against it. */}
  <div className="earn-refusal"><Ban size={19}/><p>{refusalById('lend-against-earnings').sentence}</p></div>
  <p className="earn-rule"><Info size={15}/>{ruleById('accrued-is-not-paid').sentence}</p>
  <p className="helper"><CircleAlert size={13}/><span>Offering an hour does not book a visit into it. What would make this a plan rather than arithmetic is the thing booking is still waiting for: {blockedBy('booking')[0].toLowerCase()}</span></p>
 </div>;
}

const toneFor = (state: string) => state === 'paid' ? 'teal' : state === 'failed' ? 'danger' : state === 'in-transit' ? 'sky' : 'amber';

function Week({ week, nurseId, open, toggle }: { week: EarningWeek; nurseId: string; open: boolean; toggle: () => void }) {
 const state = stateById(week.state);
 const tone = toneFor(week.state);
 /* What the simulated bank said when this week's run went out. Held per week rather than per
    screen, because it is a fact about one payment run and a nurse looking at four of them should be
    able to see that they did not all do the same thing. */
 const [advice, setAdvice] = useState<PayoutAdvice | null>(null);
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
   {/* The one thing this screen had no way to show: a payout that moved. Every state above was
       drawn from the contract and nothing had ever answered for one. A simulated bank does now —
       it will not pay anybody, it will not verify an account and it will not reverse a payout that
       never left, and within those three refusals it says what happened to a week's run. */}
   {week.state === 'accruing' ? null : <div className="earn-run">
    {!advice ? <button className="secondary" onClick={() => setAdvice(runWeek(week.id, nurseId, week.ends))}>
     <Landmark size={16}/>Run the {cycle.paysOn} payment run</button> : null}
    {advice?.refused !== undefined ? <div className="earn-refusal"><Ban size={19}/><p>{advice.refused}</p></div> : null}
    {advice && advice.refused === undefined ? <div className="earn-advice" role="status">
     <div className="review-line"><span>The bank came back</span><Pill tone={toneFor(advice.outcome)}>{stateById(advice.outcome).name}</Pill></div>
     <div className="review-line"><span>Amount in the run</span><strong>{money(advice.amount)}</strong></div>
     <p className="helper">{advice.failureReason ?? stateById(advice.outcome).detail}</p>
    </div> : null}
   </div>}
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
function PayoutAccount({ nurseId }: { nurseId: string }) {
 const [stage, setStage] = useState<'settled' | 'verifying' | 'pending'>('settled');
 const [code, setCode] = useState('');
 /* The wait is real and the check is not. Asking the simulated channel to confirm an account gets a
    refusal in the capability's own words, and it is shown beside the cooling-off note rather than
    swallowed — a screen that moved quietly to "pending" would read as though a bank had said yes. */
 const [checked, setChecked] = useState('');
 const rule = ruleById('account-change-waits');
 return <div className="panel earn-account">
  <div className="record-row plain">
   <span className="service-icon"><Building2 size={21}/></span>
   <span><strong>{account.bank} · {account.maskedNumber}</strong><small>{account.holder} · {account.note}</small></span>
   {stage === 'settled' ? <button className="secondary" onClick={() => setStage('verifying')}>Change account</button> : null}
  </div>
  {stage === 'verifying' ? <form className="form-stack space-top" onSubmit={e => { e.preventDefault(); setChecked(askToVerifyAccount(nurseId)); setStage('pending'); }}>
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
  {stage === 'pending' && checked ? <div className="earn-refusal"><Ban size={19}/><p>{checked}</p></div> : null}
  {stage !== 'pending' ? <p className="earn-rule"><Info size={15}/>{rule.sentence}</p> : null}
 </div>;
}

export function Earnings() {
 const [nurseId, setNurseId] = useState(shownNurses[0]);
 const [serviceId, setServiceId] = useState(liveServices[1].id);
 const [openWeek, setOpenWeek] = useState<string | null>(weeks[1].id);
 const nurse = subjectById(nurseId)!;
 const service = liveServices.find(s => s.id === serviceId)!;
 const week = rand(currentWeek.total);
 const figures: DeckFigure[] = [
  { label: 'This week so far', value: week.value, prefix: week.prefix, flagged: false,
    chip: `${currentWeek.visits} ${currentWeek.visits === 1 ? 'visit' : 'visits'} · pays ${cycle.paysOn}`,
    shape: weeksBehind.length > 1 ? { kind: 'spark', values: weeksBehind, countTo: currentWeek.total } : undefined },
  { label: 'Reached your account this tax year', ...rand(paidThisTaxYear), chip: `Since ${taxYear.startsOn}`, flagged: false },
  { label: 'Owed, not yet in your account', ...rand(owedNotYetPaid), chip: 'On its way, or waiting on a bank', flagged: false,
    shape: owedWeeks.length ? { kind: 'bars', values: owedWeeks.map(w => w.total), labels: owedWeeks.map(w => `to ${on(w.ends)}`),
                                label: `${owedWeeks.length} ${owedWeeks.length === 1 ? 'week' : 'weeks'} owed and not yet in your account, oldest first: ${owedWeeks.map(w => money(w.total)).join(', ')}` } : undefined }
 ];
 return <div className="nt-screen c-page">
  {/* The three figures a nurse opened this screen for, on the portal's own deck, with the payout
      capability's sentence on it rather than under it. Everything under it is a record — a split,
      the weeks, a tax note, a bank account — and records belong on the sheet. */}
  <ClinicalDeck role="Earnings & payouts" title="Earnings & payouts" eyebrow="This week" figures={figures}
   headline={['What you have earned,', { glyph: 'wallet' }, 'and what has reached you.']}
   note={ruleById('accrued-is-not-paid').sentence}>
   <NotConnected of="payouts"/>
   <p className="c-deck-aside">{cycle.note}</p>
  </ClinicalDeck>
  <div className="c-sheet earnings">
  <Standing nurse={nurse}/>
  <fieldset className="earn-preview-switch">
   <legend className="visually-hidden">Whose earnings to show</legend>
   {shownNurses.map(id => { const n = subjectById(id)!; return <label key={id} className={nurseId === id ? 'selected' : ''}>
    <input type="radio" name="earn-nurse" checked={nurseId === id} onChange={() => setNurseId(id)}/>
    <span>{n.name}</span></label>; })}
   <p className="helper">The same earnings, seen by a cleared nurse and by one whose police clearance lapsed nine days ago. Only the banner changes — which is the rule.</p>
  </fieldset>

  {/* Directly under the three figures, because the question a nurse asks straight after "what have
      I earned" is "what would another shift be worth", and every other section on this screen is a
      record of something that has already happened. */}
  <SectionTitle title="If you take a shift"/>
  <Shift/>

  <SectionTitle title="Where the money goes"/>
  <Split service={service} onPick={setServiceId}/>

  <SectionTitle title="Your weeks"/>
  <div className="earn-weeks">
   {weeks.map(week => <Week key={week.id} week={week} nurseId={nurseId} open={openWeek === week.id} toggle={() => setOpenWeek(openWeek === week.id ? null : week.id)}/>)}
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
  <PayoutAccount nurseId={nurseId}/>

  <SectionTitle title="What this screen will not do"/>
  <div className="earn-refusals">{refusals.filter(r => r.id !== 'advise-on-tax').map(r =>
   <div className="earn-refusal" key={r.id}><Ban size={19}/><p>{r.sentence}</p></div>)}</div>
  <EmptyNote>Payment runs, bank verification and the ledger itself arrive with the payment provider. Every amount above is the catalogue's own arithmetic, and none of it has been rounded to look better.</EmptyNote>
  </div>
 </div>;
}

/* The nurse's own summary of the week, for the workspace tile that opens this screen. */
export function earningsSummary() {
 return { thisWeek: currentWeek.total, visits: currentWeek.visits, owed: owedNotYetPaid };
}
export const earningsIcons = { Wallet, TrendingUp };
