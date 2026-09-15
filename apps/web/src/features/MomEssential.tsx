import { useReducer, useRef, useState } from 'react';
import { NotConnected } from '../components/NotConnected';
import { capability } from '../lib/capabilities';
import { money, services } from '../lib/catalog';
import { refusal as momRefusal } from '../lib/mom-plans';
import { accessSettingsNow, momPlanNow, voucherExpiryYearsNow } from '../lib/settings';
import { subjectRefOf } from '../lib/names';
import { longDateOf } from '../lib/scheduling';
import { HOME_SUBURB } from '../lib/arrival';
import { amountOnlyDetail, namedDetail, sponsorContract } from '../lib/sponsorship';
import {
 agree, ask, bookIncludedVisit, essential, fill, newJourney, payMonth, payWithPlanVoucher, planMethods, planVoucher, routeSentence,
 stateWords, summariesFor, summaryDays, view, type Journey, type MonthPaid
} from '../lib/mom-essential';
import { voucherWords } from '../lib/vouchers';
import './mom-essential.css';

/* MyThuso for Mom Essential, from asking to a month that has started, as the two people it is between.
 *
 * The reader here is the son or daughter far away, and the thing they opened this for is a yes: can a nurse start
 * going to their mother. So the journey leads with the state of that yes, in the contract's words, and everything
 * below it is what the next step is — never a list of every step at once. The parent's side is a different
 * perspective, not a different page: the same panel, headed by who the reader is acting as, because the preview has
 * no second phone and a reader who lost track of whose screen this is could agree to a plan as the wrong person.
 *
 * WHAT A SPONSOR IS NOT SHOWN A CONTROL FOR. Agreeing. The route refuses a sponsor who agrees, in words, and the screen
 * says that sentence where the button would have been rather than drawing a disabled one: a greyed-out "Agree for her"
 * says that agreeing for her is a thing that exists and is merely not allowed yet.
 *
 * WHAT A SPONSOR SEES. The plan's state, the month's included visits used, and a line for each thing that happened —
 * a day and "Care was given", unless she chose to name the service — and whether she has shared her visit summaries,
 * with the date it ends. Never a summary: a summary is read in her Health Passport under her grant, and Money's plan,
 * which this panel reads, never holds one.
 *
 * Every word is packages/catalog/mom-essential.json's, programmes.json's, mom-plans.json's, vouchers.json's or a route's;
 * every figure is the catalogue's or a setting's in force. Arrives on its own dynamic import from the Mom plan panel.
 */
const first = (name: string) => name.split(' ')[0] ?? name;
const screen = essential.screen;

export function MomEssential({ sponsorName, parentOptions }: { sponsorName: string; parentOptions: readonly string[] }) {
 const plan = momPlanNow();
 const tier = plan.tiers.find(t => t.id === essential.planCode)!;
 const planName = `${plan.name} ${tier.name}`;
 const [inForce] = useState(() => accessSettingsNow());
 const journey = useRef<Journey | null>(null);
 journey.current ??= newJourney(voucherExpiryYearsNow);
 const j = journey.current;
 const [, redraw] = useReducer((n: number) => n + 1, 0);
 const [parentName, setParentName] = useState(parentOptions[0] ?? sponsorName);
 const [actingAs, setActingAs] = useState<'sponsor' | 'parent'>('sponsor');
 const [lineDetail, setLineDetail] = useState<'amount-only' | 'service-named'>('amount-only');
 const [share, setShare] = useState(false);
 const [payWith, setPayWith] = useState<string>(planMethods[0]!.id);
 const [said, setSaid] = useState<{ refused: boolean; text: string } | null>(null);
 const [booked, setBooked] = useState<string | null>(null);

 const sponsorRef = subjectRefOf(sponsorName), parentRef = subjectRefOf(parentName);
 const words = { plan: planName, parent: first(parentName), sponsor: first(sponsorName) };
 const say = (text: string, extra: Record<string, string> = {}) => fill(text, { ...words, ...extra });
 const current = view(j, actingAs === 'parent' ? { role: 'patient', ref: parentRef } : { role: 'sponsor', ref: sponsorRef });
 const state = current ? stateWords(current.stateCode) : null;
 const shared = summariesFor(j, parentRef, sponsorRef);
 const until = longDateOf(new Date(Date.now() + summaryDays * 86_400_000).toISOString().slice(0, 10));
 const address = `Home visit · ${HOME_SUBURB}`;

 /* Every act ends the same way: what the ledger said, in its words, and the panel drawn again from the ledger. */
 const answered = (result: { refused?: string }, ok: string | null = null) => {
  setSaid(result.refused !== undefined ? { refused: true, text: result.refused } : ok ? { refused: false, text: ok } : null);
  redraw();
 };
 const switchTo = (who: 'sponsor' | 'parent') => { setActingAs(who); setSaid(null); };

 const visitLine = (kindCode: string | null, serviceId: string | null) =>
  kindCode === null ? screen.sponsor.careGiven : kindCode === 'collection' ? capability('medicine-collection').name : services.find(s => s.id === serviceId)?.name ?? screen.sponsor.careGiven;

 return <section className="panel me" aria-labelledby="me-title">
  <header className="me-head">
   <h3 id="me-title">{say(screen.sponsor.heading)}</h3>
   <p className="me-acting" data-acting={actingAs}>{actingAs === 'sponsor' ? say(screen.actingSponsor) : say(screen.actingParent)}</p>
   <p className="me-note">{screen.previewNote}</p>
  </header>

  {/* The yes this panel is about, said first and in the contract's words for whoever is reading. */}
  {state && current && <div className="me-state" role="status">
   <span className="me-state-name">{state.name}</span>
   <p>{say(actingAs === 'sponsor' ? state.sponsorWords : state.parentWords, { day: current.startedOn ? longDateOf(current.startedOn) : '', end: current.monthEndsOn ? longDateOf(current.monthEndsOn) : '' })}</p>
  </div>}
  {said && <p className={said.refused ? 'me-refused' : 'me-said'} role={said.refused ? 'alert' : 'status'}>{said.text}</p>}

  {/* ---- The sponsor asks ---- */}
  {!current && actingAs === 'sponsor' && <div className="me-step">
   <label className="me-field">{screen.sponsor.who}
    <select value={parentName} onChange={e => setParentName(e.target.value)}>{parentOptions.map(p => <option key={p}>{p}</option>)}</select>
   </label>
   <div className="me-tier">
    <div><strong>{planName}</strong><small>{tier.cadence}</small></div>
    <strong className="me-price">{money(tier.price)}<small>a month</small></strong>
   </div>
   <ul className="me-includes">{tier.includes.map(i => <li key={i.id}>{i.text}</li>)}</ul>
   <NotConnected of="payments" tone="inline"/>
   <ul className="me-rules">
    <li>{momRefusal('paying-is-not-seeing')}</li>
    <li>{essential.agreement.guardian.sentence}</li>
   </ul>
   <button className="primary" onClick={() => answered(ask(j, sponsorRef, parentRef), say(screen.sponsor.asked))}>{say(screen.sponsor.ask)}</button>
  </div>}

  {/* ---- Waiting for her: the sponsor has nothing to press but her screen ---- */}
  {current?.stateCode === 'awaiting-parent' && actingAs === 'sponsor' && <div className="me-step">
   <p className="me-why">{routeSentence('POST /v1/money/plan-subscriptions/{subscriptionRef}/accept@1', 'only-the-parent-agrees')}</p>
   <button className="secondary" onClick={() => switchTo('parent')}>{say(screen.sponsor.openAsParent)}</button>
  </div>}

  {/* ---- She agrees, as herself ---- */}
  {current?.stateCode === 'awaiting-parent' && actingAs === 'parent' && <div className="me-step">
   <h4>{say(screen.parent.heading)}</h4>
   <fieldset className="me-choices"><legend>{say(screen.parent.lineDetailLegend)}</legend>
    {[amountOnlyDetail, namedDetail].map(d => <label key={d.id} className="me-choice">
     <input type="radio" name="me-line-detail" checked={lineDetail === d.id} onChange={() => setLineDetail(d.id as 'amount-only' | 'service-named')}/>
     <span><strong>{d.name}</strong><small>{d.detail}</small></span>
    </label>)}
   </fieldset>
   <label className="me-choice me-share">
    <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)}/>
    <span><strong>{say(essential.sharing.summaries.label)}</strong><small>{say(essential.sharing.summaries.detail, { until })}</small></span>
   </label>
   <div className="me-actions">
    <button className="primary" onClick={() => answered(agree(j, { parentRef, sponsorRef, lineDetail, shareSummaries: share }))}>{say(screen.parent.agree)}</button>
    <button className="secondary" onClick={() => switchTo('sponsor')}>{say(screen.parent.backToSponsor)}</button>
   </div>
  </div>}

  {/* ---- The first month ---- */}
  {current?.stateCode === 'awaiting-payment' && actingAs === 'sponsor' && <div className="me-step">
   <fieldset className="me-choices"><legend>{screen.sponsor.payWith}</legend>
    {planMethods.map(m => <label key={m.id} className="me-choice">
     <input type="radio" name="me-pay" checked={payWith === m.id} onChange={() => setPayWith(m.id)}/>
     <span><strong>{m.name}</strong><small>{m.detail}</small></span>
    </label>)}
    <label className="me-choice">
     <input type="radio" name="me-pay" checked={payWith === 'voucher'} onChange={() => { setPayWith('voucher'); planVoucher(j); redraw(); }}/>
     <span><strong>{say(screen.sponsor.voucher)}</strong><small>{voucherWords.never}</small></span>
    </label>
   </fieldset>
   {payWith === 'voucher' && j.planVoucher && <p className="me-voucher">{fill(voucherWords.issuedInPreview, { code: j.planVoucher, service: `${planName} month`, expires: longDateOf(j.ledger.voucherHeld(j.planVoucher)?.expiresOn ?? '') })}</p>}
   <div className="me-owed"><span>{voucherWords.owed}</span><strong>{money((j.ledger.owed(current.payableRef ?? '') ?? current.amountCents) / 100)}</strong></div>
   <NotConnected of="payments" tone="inline"/>
   <button className="primary" onClick={() => {
    if (payWith === 'voucher') { const r = payWithPlanVoucher(j, sponsorRef); answered(r, r.refused === undefined && r.owedCents === 0 ? voucherWords.covered : null); return; }
    const paid: MonthPaid = payMonth(j, sponsorRef, payWith);
    answered(paid, paid.refused === undefined ? [paid.declineReason, paid.words].filter(Boolean).join(' ') : null);
   }}>{screen.sponsor.pay}</button>
  </div>}
  {current?.stateCode === 'awaiting-payment' && actingAs === 'parent' && <div className="me-step">
   <button className="secondary" onClick={() => switchTo('sponsor')}>{say(screen.parent.backToSponsor)}</button>
  </div>}

  {/* ---- Started: what the sponsor sees, and never sees ---- */}
  {current?.stateCode === 'active' && actingAs === 'sponsor' && <div className="me-step">
   <h4>{say(screen.sponsor.view)}</h4>
   <p className="me-count">{say(screen.sponsor.included, { used: String(current.included[0]!.used), allowed: String(current.included[0]!.allowed) })}</p>
   <div className="table-scroll">
    <table className="me-lines">
     <caption>{screen.sponsor.lines}</caption>
     <tbody>{current.lines.length ? current.lines.map((l, i) => <tr key={`${l.on}-${i}`}><th scope="row">{longDateOf(l.on)}</th><td>{visitLine(l.kindCode, l.serviceId)}</td></tr>)
      : <tr><td colSpan={2}>{screen.sponsor.noLines}</td></tr>}</tbody>
    </table>
   </div>
   <p className="me-summaries">{shared.shared ? say(essential.sharing.summaries.shared, { until: longDateOf(shared.until.slice(0, 10)) }) : say(essential.sharing.summaries.none)}</p>
   <div className="me-columns">
    <div><h5>{screen.seesHeading}</h5><ul>{essential.sharing.sponsorSees.map(s => <li key={s.what}>{s.what}</li>)}</ul></div>
    <div><h5>{screen.neverSeesHeading}</h5><ul>{sponsorContract.neverSees.map(s => <li key={s.what}>{s.what}</li>)}</ul></div>
   </div>
   <p className="me-why">{essential.notBuilt}</p>
   <button className="secondary" onClick={() => switchTo('parent')}>{say(screen.sponsor.openAsParent)}</button>
  </div>}

  {/* ---- Started: her visit and her medicine ---- */}
  {current?.stateCode === 'active' && actingAs === 'parent' && <div className="me-step">
   <p className="me-count">{say(screen.sponsor.included, { used: String(current.included[0]!.used), allowed: String(current.included[0]!.allowed) })}</p>
   {current.included[0]!.used < current.included[0]!.allowed && <button className="primary" onClick={() => {
    const r = bookIncludedVisit(j, { parentRef, address, namedNurseFallback: inForce.namedNurseFallback });
    if (r.refused === undefined) setBooked(say(screen.parent.booked, { day: longDateOf(r.date), hour: r.start }));
    answered(r);
   }}>{screen.parent.book}</button>}
   {booked && <p className="me-said" role="status">{booked}</p>}
   <h4>{screen.parent.medicine}</h4>
   <p>{say(essential.medicine.sentence)}</p>
   <p className="me-why">{essential.medicine.delegate}</p>
   <NotConnected of={essential.medicine.capability} tone="inline"/>
   <p className="me-why">{essential.notBuilt}</p>
   <button className="secondary" onClick={() => switchTo('sponsor')}>{say(screen.parent.backToSponsor)}</button>
  </div>}
 </section>;
}
