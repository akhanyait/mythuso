import { useMemo, useState } from 'react';
import { Activity, BadgeCheck, Banknote, CalendarClock, CircleAlert, ClipboardList, FileText, Gauge, Landmark, LockKeyhole, Radio, ScrollText, ShieldCheck, Stethoscope, TrendingUp, UserRoundCheck, Users } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { DispatchBoard, IncidentBoard } from './Dispatch';
import { useVettingState, VettingConsole, type VettingState } from './Vetting';
import { summarise, type VettingSubject } from '../lib/vetting';
import { businessModel, money, bigMoney, platformMargin, services, type Service } from '../lib/catalog';
const tabs = ['Overview', 'Vetting', 'Operations', 'Clinical', 'Catalogue', 'Growth', 'Finance', 'Compliance'] as const;
/* One party can be blocking in more than one place, so the console counts parties rather than
   checks: an operator wants to know how many names cannot be used today. */
const blocking = (subjects: VettingSubject[], roleId?: string) =>
 subjects.filter(s => (!roleId || s.roleId === roleId) && !summarise(s).cleared).length;
type Tab = typeof tabs[number];
/* The back office described as "Control Tower" in the proposal. Everything here is fictional and
   held in memory: approving a nurse approves nobody, and releasing a tranche moves no money. */
export function AdminConsole({ open }: { open: (s: string) => void }) {
 const [tab, setTab] = useState<Tab>('Overview');
 /* Held above the tabs on purpose: a decision taken in Vetting has to still be true when the
    Operations board is opened, or the gate is a screenshot of a gate. */
 const vetting = useVettingState();
 return <>
  <div className="page-intro">
   <div className="eyebrow">Control Tower · Demo</div>
   <h1>Operations console</h1>
   <p>Dispatch, vetting, clinical review, catalogue, growth and the funding plan in one place. Fictional data; no action here reaches a nurse, a patient or a bank.</p>
  </div>
  <div className="underline-tabs" role="group" aria-label="Console sections">
   {tabs.map(t => <button key={t} className={tab === t ? 'selected' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
  </div>
  {tab === 'Overview' ? <Overview vetting={vetting}/> : tab === 'Vetting' ? <VettingConsole vetting={vetting} open={open}/> : tab === 'Operations' ? <Operations open={open} vetting={vetting}/>
   : tab === 'Clinical' ? <Clinical open={open} vetting={vetting}/> : tab === 'Catalogue' ? <Catalogue/> : tab === 'Growth' ? <Growth/>
   : tab === 'Finance' ? <Finance/> : <Compliance/>}
 </>;
}
function Kpi({ icon: Icon, label, value, note, tone }: { icon: typeof Users; label: string; value: string; note: string; tone?: string }) {
 return <div className="panel metric">
  <span><Icon size={16}/>{label}</span>
  <strong className={tone}>{value}</strong>
  <small>{note}</small>
 </div>;
}
/* Where the business is against the plan in the proposal, rather than against nothing. */
function Overview({ vetting }: { vetting: VettingState }) {
 const plan = businessModel.trajectory[1];               // Month 9 is the checkpoint we report against
 const nurses = vetting.subjects.filter(s => s.roleId === 'nurse');
 const actual = { visitsPerDay: 84, subscribers: 1620, revenue: 298000, costs: 271000 };
 const pace = (a: number, p: number) => Math.round((a / p) * 100);
 return <>
  <div className="metric-grid">
   <Kpi icon={CalendarClock} label="Visits yesterday" value="84" note={`${pace(actual.visitsPerDay, plan.visitsPerDay)}% of the month-9 plan (${plan.visitsPerDay})`}/>
   <Kpi icon={Users} label="Active subscribers" value="1,620" note={`${pace(actual.subscribers, plan.subscribers)}% of the month-9 plan (${plan.subscribers.toLocaleString()})`}/>
   <Kpi icon={Banknote} label="Revenue this month" value={bigMoney(actual.revenue)} note={`Plan ${bigMoney(plan.revenue)} · costs ${bigMoney(actual.costs)}`}/>
   <Kpi icon={UserRoundCheck} label="Nurses dispatchable" value={String(nurses.length - blocking(vetting.subjects, 'nurse'))} note={`Of ${nurses.length} in the vetting pipeline · read from the vetting module, not typed here`}/>
   <Kpi icon={Stethoscope} label="Reviews awaiting a doctor" value="12" note="2 flagged urgent · target 15 minutes"/>
   <Kpi icon={CircleAlert} label="Open incidents" value="3" note="1 critical · SLA acknowledged within 5 minutes" tone="flagged"/>
  </div>
  <SectionTitle title="Against the funding plan"/>
  <div className="panel">
   <table className="result-table">
    <caption>The proposal's indicative trajectory. Reported figures are fictional.</caption>
    <thead><tr><th scope="col">Point</th><th scope="col">Visits/day</th><th scope="col">Subscribers</th><th scope="col">Revenue</th><th scope="col">Net</th></tr></thead>
    <tbody>{businessModel.trajectory.map(row => <tr key={row.point}>
     <th scope="row">{row.point}</th><td>{row.visitsPerDay}</td><td>{row.subscribers ? row.subscribers.toLocaleString() : '—'}</td>
     <td>{bigMoney(row.revenue)}</td><td className={row.revenue - row.costs < 0 ? 'flagged' : ''}>{row.revenue - row.costs < 0 ? '−' : '+'}{bigMoney(Math.abs(row.revenue - row.costs))}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="privacy-note space-top"><Gauge size={19}/>Reporting against the plan is the point of this screen. A console that only shows today's numbers cannot tell an investor or a board whether the round is on track.</div>
 </>;
}
function Operations({ open, vetting }: { open: (s: string) => void; vetting: VettingState }) {
 const stopped = blocking(vetting.subjects);
 return <>
  <div className="metric-grid">
   <Kpi icon={ShieldCheck} label="Parties blocking work" value={String(stopped)} note={`Of ${vetting.subjects.length} vetted parties · decided in the Vetting tab`} tone={stopped ? 'flagged' : ''}/>
   <Kpi icon={UserRoundCheck} label="Nurses blocked" value={String(blocking(vetting.subjects, 'nurse'))} note="Not offered on the board below, with the reason shown"/>
   <Kpi icon={CircleAlert} label="Open incidents" value="3" note="1 critical · SLA acknowledged within 5 minutes" tone="flagged"/>
  </div>
  <SectionTitle title="Live dispatch"/>
  <DispatchBoard subjects={vetting.subjects}/>
  <SectionTitle title="Open incidents"/>
  <IncidentBoard open={open}/>
 </>;
}
const reviewQueue = [
 { id: 'TH-2048', patient: 'Lerato Molefe', flag: 'Systolic 146, headache', waited: '4 min', urgent: true },
 { id: 'TH-2045', patient: 'Nomsa Molefe', flag: 'Wound area increased 12%', waited: '38 min', urgent: false },
 { id: 'TH-2041', patient: 'Sipho Radebe', flag: 'Prescription request', waited: '1 h 12 min', urgent: false },
 { id: 'TH-2039', patient: 'Ayanda Khoza', flag: 'ECG: possible atrial fibrillation', waited: '2 min', urgent: true }
];
function Clinical({ open, vetting }: { open: (s: string) => void; vetting: VettingState }) {
 const doctors = vetting.subjects.filter(s => s.roleId === 'doctor');
 const blocked = blocking(vetting.subjects, 'doctor');
 return <>
  <div className="metric-grid">
   <Kpi icon={Stethoscope} label="Awaiting review" value={String(reviewQueue.length)} note="Urgent target 15 minutes · routine 4 hours"/>
   <Kpi icon={UserRoundCheck} label="Doctors who cannot sign" value={`${blocked} of ${doctors.length}`} note="The queue refuses the signature rather than warning about it" tone={blocked ? 'flagged' : ''}/>
   <Kpi icon={Activity} label="AI agreed with the doctor" value="91%" note="Sample of 1,240 reviewed cases"/>
   <Kpi icon={CircleAlert} label="AI missed a finding" value="0.8%" note="Every miss is reviewed by the Medical Director" tone="flagged"/>
  </div>
  <SectionTitle title="Doctor review queue"/>
  <div className="panel">{reviewQueue.map(c => <button className="record-row" key={c.id} onClick={() => open(`Doctor review: ${c.id}`)}>
   <span className={`service-icon ${c.urgent ? 'severity-critical' : ''}`}><FileText size={20}/></span>
   <span><strong>{c.id} · {c.patient}</strong><small>{c.flag}</small></span>
   <Pill tone={c.urgent ? 'amber' : 'plain'}>{c.urgent ? `Urgent · ${c.waited}` : c.waited}</Pill>
  </button>)}</div>
  <div className="privacy-note space-top"><ShieldCheck size={19}/>The agreement figures are the reason this screen exists. Decision support that is never audited against the clinician who signed the case is a claim, not a control.</div>
 </>;
}
/* Pricing is where the marketplace works or does not. Editing a price recalculates what is left for
   the platform after the nurse and the payment provider, which is the number that actually matters. */
function Catalogue() {
 const [prices, setPrices] = useState<Record<string, number>>({});
 const priced = (s: Service) => ({ ...s, price: prices[s.id] ?? s.price });
 const rows = services.map(priced);
 const thin = rows.filter(s => platformMargin(s) < 40);
 return <>
  <div className="metric-grid">
   <Kpi icon={ClipboardList} label="Services" value={String(services.length)} note={`${services.filter(s => s.phase === 1).length} live, the rest by phase`}/>
   <Kpi icon={TrendingUp} label="Average platform margin" value={money(Math.round(rows.reduce((t, s) => t + platformMargin(s), 0) / rows.length))} note="After the nurse and payment costs"/>
   <Kpi icon={CircleAlert} label="Below R40 a visit" value={String(thin.length)} note="Too thin to carry support, insurance and review" tone={thin.length ? 'flagged' : ''}/>
  </div>
  <div className="panel">
   <table className="result-table admin-table">
    <caption>Change a price to see what the platform is left with. Nurse share follows the proposal's 75%.</caption>
    <thead><tr><th scope="col">Service</th><th scope="col">Phase</th><th scope="col">Price</th><th scope="col">Nurse</th><th scope="col">Platform keeps</th></tr></thead>
    <tbody>{rows.map(s => <tr key={s.id} className={platformMargin(s) < 40 ? 'flagged-row' : ''}>
     <th scope="row">{s.name}</th>
     <td><Pill tone="plain">Phase {s.phase}</Pill></td>
     <td><label className="cell-input"><span className="visually-hidden">{s.name} price in rand</span>
      <input inputMode="numeric" value={s.price} onChange={e => setPrices({ ...prices, [s.id]: Number(e.target.value.replace(/\D/g, '')) || 0 })}/>
     </label></td>
     <td>{money(s.nurseShare)}</td>
     <td>{money(platformMargin(s))}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="privacy-note space-top"><Banknote size={19}/>Prices here change nothing a patient sees. In production a price change is a versioned, dated record — a patient must be charged what they were quoted, not what the catalogue says later.</div>
 </>;
}
function Growth() {
 const subs = businessModel.subscriptions;
 const active: Record<string, number> = { chronic: 980, planning: 410, mom: 120, senior: 74, recover: 26, alert: 10, cover: 0 };
 const mrr = subs.reduce((t, s) => t + (s.price ?? 0) * (active[s.id] ?? 0), 0);
 return <>
  <div className="metric-grid">
   <Kpi icon={Users} label="Subscribers" value={Object.values(active).reduce((a, b) => a + b, 0).toLocaleString()} note="Across every plan"/>
   <Kpi icon={Banknote} label="Monthly recurring" value={bigMoney(mrr)} note="Before nurse and delivery costs"/>
   <Kpi icon={Landmark} label="B2B lines" value={String(businessModel.network.length)} note="Contracted revenue in the proposal"/>
  </div>
  <SectionTitle title="Subscriptions"/>
  <div className="panel"><table className="result-table admin-table">
   <thead><tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">Active</th><th scope="col">Monthly</th><th scope="col">Phase</th></tr></thead>
   <tbody>{subs.map(s => <tr key={s.id}>
    <th scope="row">{s.name}</th><td>{s.price ? `${money(s.price)}/m` : 'Per package'}</td>
    <td>{(active[s.id] ?? 0).toLocaleString()}</td><td>{s.price ? bigMoney(s.price * (active[s.id] ?? 0)) : '—'}</td>
    <td>Phase {s.phase}</td>
   </tr>)}</tbody>
  </table></div>
  <SectionTitle title="Thuso Screen packages"/>
  <div className="panel">{businessModel.screening.map(p => <div className="record-row static" key={p.id}>
   <span className="service-icon"><ShieldCheck size={20}/></span>
   <span><strong>{p.name}</strong><small>{p.includes}</small></span>
   <strong>{p.price ? money(p.price) : 'Sponsored'}</strong>
  </div>)}</div>
  <SectionTitle title="Network and B2B"/>
  <div className="panel"><table className="result-table admin-table">
   <thead><tr><th scope="col">Product</th><th scope="col">Buyer</th><th scope="col">Revenue</th><th scope="col">Phase</th></tr></thead>
   <tbody>{businessModel.network.map(n => <tr key={n.id}>
    <th scope="row">{n.product}</th><td>{n.buyer}</td><td>{n.revenue}</td><td>Phase {n.phase}</td>
   </tr>)}</tbody>
  </table></div>
 </>;
}
/* The round, what it buys and what has to be true before the next tranche is drawn. */
function Finance() {
 const { funding, unitEconomics } = businessModel;
 const [achieved, setAchieved] = useState<string[]>(['M1', 'M2']);
 const [visitsPerDay, setVisits] = useState(100);
 const [subscribers, setSubscribers] = useState(2000);
 const released = funding.milestones.filter(m => achieved.includes(m.id)).reduce((t, m) => t + (m.releases ?? 0), 0);
 const projection = useMemo(() => {
  const visitMargin = unitEconomics.worked.platformRetains * visitsPerDay * 30;
  const subscriptionMargin = subscribers * 60;              // indicative margin per subscriber per month
  return { visitMargin, subscriptionMargin, total: visitMargin + subscriptionMargin };
 }, [visitsPerDay, subscribers, unitEconomics]);
 return <>
  <div className="metric-grid">
   <Kpi icon={Landmark} label="Seed round" value={bigMoney(funding.round)} note={`Over ${funding.months} months`}/>
   <Kpi icon={Banknote} label="Released" value={bigMoney(released)} note={`${Math.round(released / funding.round * 100)}% of the round, gated on milestones`}/>
   <Kpi icon={TrendingUp} label="Modelled monthly margin" value={bigMoney(projection.total)} note={`${visitsPerDay} visits/day and ${subscribers.toLocaleString()} subscribers`}/>
  </div>
  <SectionTitle title="What a visit actually leaves"/>
  <div className="panel">
   <div className="review-line"><span>{unitEconomics.worked.service} — patient pays</span><strong>{money(unitEconomics.worked.price)}</strong></div>
   <div className="review-line"><span>Nurse receives ({Math.round(unitEconomics.worked.nurseShare / unitEconomics.worked.price * 100)}%)</span><strong>−{money(unitEconomics.worked.nurseShare)}</strong></div>
   <div className="review-line"><span>Payment processing</span><strong>−{money(unitEconomics.worked.paymentCost)}</strong></div>
   <div className="review-line"><span>Platform retains</span><strong>{money(unitEconomics.worked.platformRetains)}</strong></div>
   <p className="helper">Doctor review is paid per case at {money(unitEconomics.doctorReviewFee[0])}–{money(unitEconomics.doctorReviewFee[1])} out of screening-bundle and subscription margin, not out of a standard visit.</p>
  </div>
  <SectionTitle title="Model it"/>
  <div className="panel two-column">
   <label>Visits per day<input inputMode="numeric" value={visitsPerDay} onChange={e => setVisits(Number(e.target.value.replace(/\D/g, '')) || 0)}/></label>
   <label>Subscribers<input inputMode="numeric" value={subscribers} onChange={e => setSubscribers(Number(e.target.value.replace(/\D/g, '')) || 0)}/></label>
  </div>
  <div className="panel space-top">
   <div className="review-line"><span>Visit margin</span><strong>{bigMoney(projection.visitMargin)}</strong></div>
   <div className="review-line"><span>Subscription margin</span><strong>{bigMoney(projection.subscriptionMargin)}</strong></div>
   <div className="review-line"><span>Monthly total</span><strong>{bigMoney(projection.total)}</strong></div>
  </div>
  <SectionTitle title="Where the round goes"/>
  <div className="panel">{funding.allocation.map(line => <div className="alloc-row" key={line.category}>
   <span>{line.category}</span>
   <div className="alloc-bar"><div style={{ width: `${line.amount / funding.round * 100}%` }}/></div>
   <strong>{bigMoney(line.amount)}</strong>
  </div>)}</div>
  <SectionTitle title="Milestones that gate spending"/>
  <div className="panel">{funding.milestones.map(m => <div className="record-row static" key={m.id}>
   <span className={`service-icon ${achieved.includes(m.id) ? 'check-verified' : 'check-outstanding'}`}>{achieved.includes(m.id) ? <BadgeCheck size={20}/> : <CalendarClock size={20}/>}</span>
   <span><strong>{m.id}</strong><small>{m.target}</small></span>
   {m.releases ? <Pill tone={achieved.includes(m.id) ? 'teal' : 'plain'}>Releases {bigMoney(m.releases)}</Pill> : <Pill tone="plain">No tranche</Pill>}
   <button className="secondary" onClick={() => setAchieved(a => a.includes(m.id) ? a.filter(x => x !== m.id) : [...a, m.id])}>
    {achieved.includes(m.id) ? 'Mark not met' : 'Mark met'}
   </button>
  </div>)}</div>
  <div className="privacy-note space-top"><Landmark size={19}/>Tranches are gated because a healthcare marketplace that scales before its vetting, review and incident handling hold is the failure mode that ends the company.</div>
 </>;
}
function Compliance() {
 const controls = [
  { name: 'SANC registration verified', detail: 'Checked at onboarding and re-checked annually', state: 'Designed', icon: BadgeCheck },
  { name: 'HPCSA registration for the doctor panel', detail: 'Every signed decision is attributed', state: 'Designed', icon: Stethoscope },
  { name: 'Consent recorded with version and wording', detail: 'Withdrawable, and shown back to the patient', state: 'Designed', icon: ShieldCheck },
  { name: 'Append-only vetting decision log', detail: 'Designed: every verify, second, decline, suspension, appeal and renewal is added to a log this console cannot edit, delete or reorder', state: 'Designed', icon: ScrollText },
  { name: 'Append-only access and decision audit', detail: 'Not built: the vetting log lives in memory and dies on reload. A server-side record with integrity protection, that a person with database access still cannot rewrite, does not exist', state: 'Not built', icon: FileText },
  { name: 'SA hosting, encryption at rest and in transit', detail: 'Needs a backend before it can be true', state: 'Not built', icon: LockKeyhole },
  { name: 'Information Officer and POPIA request handling', detail: 'Correction, deletion and access requests', state: 'Not built', icon: Users },
  { name: 'Incident escalation within 5 minutes', detail: 'Acknowledged, then Clinical Lead review within 24 hours', state: 'Designed', icon: Radio },
  { name: 'SAHPRA registration for devices and diagnostic software', detail: 'Required before any device or model ships', state: 'Not built', icon: CircleAlert }
 ];
 return <>
  <div className="metric-grid">
   <Kpi icon={ShieldCheck} label="Designed in the UI" value={String(controls.filter(c => c.state === 'Designed').length)} note="Visible in the preview, not enforced anywhere"/>
   <Kpi icon={CircleAlert} label="Not built" value={String(controls.filter(c => c.state === 'Not built').length)} note="Needs a backend, a regulator or both" tone="flagged"/>
  </div>
  <div className="panel">{controls.map(c => <div className="record-row static" key={c.name}>
   <span className={`service-icon ${c.state === 'Designed' ? 'check-in-review' : 'check-outstanding'}`}><c.icon size={20}/></span>
   <span><strong>{c.name}</strong><small>{c.detail}</small></span>
   <Pill tone={c.state === 'Designed' ? 'amber' : 'plain'}>{c.state}</Pill>
  </div>)}</div>
  <div className="privacy-note alert space-top"><CircleAlert size={19}/>Nothing on this screen is a compliance status. It is a checklist of what must exist before real patient information touches this platform — the preview stores none, which is the only reason it is safe to run today.</div>
 </>;
}
