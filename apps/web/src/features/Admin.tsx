import { useMemo, useState } from 'react';
import { BadgeCheck, Banknote, CalendarClock, CircleAlert, FileText, Gauge, Landmark, LockKeyhole, Radio, ScrollText, ShieldCheck, Stethoscope, TimerReset, Users } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { ReadOnly } from '../components/ReadOnly';
import { Metric, Metrics } from '../surface/Surface';
import { DispatchBoard, IncidentBoard, controlTowerCounts } from './Dispatch';
import { useVettingState, VettingConsole, type VettingState } from './Vetting';
import { summarise, type VettingSubject } from '../lib/vetting';
import { businessModel, money, bigMoney, platformMargin, services, type Service } from '../lib/catalog';
import { momPlan, subscriptionLines } from '../lib/mom-plans';
import { escalationRotaNow, momPlanNow } from '../lib/settings';
import { Configuration } from './Configuration';
import { GovernanceReadiness } from './GovernanceReadiness';
import { governanceScreen } from '../lib/governance';
import { settingsScreen } from '../../../../packages/engines/src/settings/shape.ts';
/* How long the desk has to acknowledge an incident before it moves up the rota: the first rung of Core's
   setting escalation-minutes, in force. The console used to type five minutes in three places, which is a
   number an admin's change on the Configuration tab would never have reached. Read when a tab draws. */
const acknowledgeWithinMinutes = () => Math.round(escalationRotaNow().stepsMs[0]! / 60_000);

export const adminTabs = ['Overview', 'Vetting', 'Operations', 'Clinical', 'Catalogue', 'Growth', 'Finance', 'Compliance', 'Governance', 'Configuration'] as const;
export type AdminTab = typeof adminTabs[number];
/* What each tab is for, in one line, in the words somebody in this office would use. It replaces the
   one sentence that listed all eight and therefore described none of them. */
const tabBlurb: Record<AdminTab, string> = {
 Overview: 'Today against the month-9 checkpoint in the funding proposal.',
 Vetting: 'Who may work, who may not, and the written reason for each.',
 Operations: 'The live board, who is kept off it, what has gone wrong today, and how long the safety desk waits.',
 Clinical: 'What is waiting for a doctor, and how often decision support and the doctor disagreed.',
 Catalogue: 'What a visit costs, what the nurse takes, and what is left to run the service on.',
 Growth: 'Subscriptions, screening packages and the contracted lines in the proposal.',
 Finance: 'The round, what each tranche is gated on, and what a visit actually leaves.',
 Compliance: 'What has to exist before real patient information touches this platform, and what does not yet.',
 Governance: governanceScreen.blurb,
 Configuration: settingsScreen.blurb
};
/* One party can be blocking in more than one place, so the console counts parties rather than
   checks: an operator wants to know how many names cannot be used today. */
const blocking = (subjects: VettingSubject[], roleId?: string) =>
 subjects.filter(s => (!roleId || s.roleId === roleId) && !summarise(s).cleared).length;
/* The back office described as "Control Tower" in the proposal. Everything here is sample data and
   held in memory: approving a nurse approves nobody, and releasing a tranche moves no money. */
/* The tab is the shell's state now, not this component's. From 1000px up the back office has a
   sidebar and the sidebar draws these eight as pill rows, which is where a workspace's navigation
   belongs; below that the sidebar is gone and the strip below is the only way through, so both
   drive one value rather than each holding their own idea of where the reader is. */
export function AdminConsole({ open, tab, setTab, readOnly = false }: { open: (s: string) => void; tab: AdminTab; setTab: (t: AdminTab) => void; readOnly?: boolean }) {
 /* Held above the tabs on purpose: a decision taken in Vetting has to still be true when the
    Operations board is opened, or the gate is a screenshot of a gate. */
 const vetting = useVettingState();
 /* Which engine's settings Configuration opens on. Held here so the link on the Operations tab can open
    Configuration on the field-safety settings rather than on everything. */
 const [settingsEngine, setSettingsEngine] = useState('');
 const body = tab === 'Overview' ? <Overview vetting={vetting}/> : tab === 'Vetting' ? <VettingConsole vetting={vetting} open={open}/> : tab === 'Operations' ? <Operations open={open} vetting={vetting} openSettings={() => { setSettingsEngine('safety'); setTab('Configuration'); }}/>
   : tab === 'Clinical' ? <Clinical open={open} vetting={vetting}/> : tab === 'Catalogue' ? <Catalogue/> : tab === 'Growth' ? <Growth/>
   : tab === 'Finance' ? <Finance/> : tab === 'Compliance' ? <Compliance/> : tab === 'Governance' ? <GovernanceReadiness/>
    : <Configuration engine={settingsEngine} onEngine={setSettingsEngine}/>;
 return <>
  {/* The name of the console is the eyebrow and the name of the section is the heading, which is
      the way round it was not. Eight tabs each opened on "Operations console" set at the largest
      size on the screen, above a sentence listing all eight, above the one word that said which of
      them you were actually looking at — set smaller, and on the Operations tab set twice. The
      constant is chrome; the variable is the page. */}
  <div className="page-intro">
   <div className="eyebrow">MyThuso back office</div>
   <h1>{tab}</h1>
   <p>{tabBlurb[tab]}</p>
  </div>
  <div className="underline-tabs console-tabs" role="group" aria-label="Console sections">
   {adminTabs.map(t => <button key={t} className={tab === t ? 'selected' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
  </div>
  {/* Read-only is the parallel run's: the tab strip above still moves, and everything inside a tab is
      disabled, because the portal is the screen of record now (docs/control-tower-cutover.md). */}
  {readOnly ? <ReadOnly>{body}</ReadOnly> : body}
 </>;
}
/* A figure in the dashboard language: large, thin, tabular, with what it is underneath it. The icon
   each of these used to carry is gone — twenty-four indigo-tinted glyphs across eight tabs is the
   defect this design brief names, where a colour on everything has stopped carrying information.
   The sentence under the label stays, because a console reports against a plan and "84" without
   "63% of the month-9 plan" is a number nobody can act on. `flagged` fills the chip charcoal, which
   is the one mark that says a figure is a problem.
   The wrapper keeps `panel metric` as well as its own name: the console journeys in
   tests/admin-and-session.spec.ts assert against `.panel.metric`, and a class is part of the
   contract with them as much as any exported function is. clinical.css takes the card look back
   off it, so what it draws is a Metric on the ground and nothing else. */
function Kpi({ label, value, note, flagged, lead }: { label: string; value: string; note: string; flagged?: boolean; lead?: boolean }) {
 /* `lead` is on the wrapper rather than on the Metric inside it, because a console figure is the
    number *and* the line saying what it is against — "84" without "84% of the month-9 plan" is a
    number nobody can act on, and a tile that took the first and left the second outside it would
    have split the one thing this screen reports. */
 return <div className={`c-figure panel metric${lead ? ' lead' : ''}`}>
  <Metric label={label} value={value} chip={flagged ? 'Needs attention' : undefined} flagged={flagged}/>
  <small>{note}</small>
 </div>;
}
/* Where the business is against the plan in the proposal, rather than against nothing. */
function Overview({ vetting }: { vetting: VettingState }) {
 const plan = businessModel.trajectory[1];               // Month 9 is the checkpoint we report against
 const nurses = vetting.subjects.filter(s => s.roleId === 'nurse');
 const actual = { visitsPerDay: 84, subscribers: 1620, revenue: 298000, costs: 271000 };
 /* Counted off the board the Operations tab draws rather than typed here. The console said three
    open incidents and one critical beside a board that could have been saying anything. */
 const tower = controlTowerCounts();
 const pace = (a: number, p: number) => Math.round((a / p) * 100);
 return <>
  <div className="c-figures"><Metrics>
   {/* Visits a day is the figure this console is against — the sentence under the heading says so,
       and it is the first line of the trajectory table below. Nothing here is typed that was not
       typed before it. */}
   <Kpi label="Visits yesterday" value="84" note={`${pace(actual.visitsPerDay, plan.visitsPerDay)}% of the month-9 plan (${plan.visitsPerDay})`} lead/>
   <Kpi label="Active subscribers" value="1,620" note={`${pace(actual.subscribers, plan.subscribers)}% of the month-9 plan (${plan.subscribers.toLocaleString()})`}/>
   <Kpi label="Revenue this month" value={bigMoney(actual.revenue)} note={`Plan ${bigMoney(plan.revenue)} · costs ${bigMoney(actual.costs)}`}/>
   <Kpi label="Nurses dispatchable" value={String(nurses.length - blocking(vetting.subjects, 'nurse'))} note={`Of ${nurses.length} in the vetting pipeline · read from the vetting module, not typed here`}/>
   <Kpi label="Reviews awaiting a doctor" value="12" note="2 flagged urgent · target 15 minutes"/>
   <Kpi label="Open incidents" value={String(tower.incidents)} note={`${tower.critical} critical · SLA acknowledged within ${acknowledgeWithinMinutes()} minutes`} flagged={tower.critical > 0}/>
  </Metrics></div>
  <SectionTitle title="Against the funding plan"/>
  {/* Five columns of figures cannot be squeezed into 320 pixels, and they were not: the table sat
      four hundred and thirty wide inside a panel that could not hold it, so the last two columns
      were cut off with nothing on the screen saying so. It scrolls now, which is the pattern the
      patient file and the vetting register already use for the same problem. */}
  <div className="panel table-scroll">
   {/* Every column after the first is a figure, and the point of the table is reading one down
       against the one under it. Left-aligned they could not be: 30, 100, 300, 600, 1000 all began
       at the same pixel and ended five apart. */}
   <table className="result-table figures">
    <caption>The proposal's indicative trajectory. These are targets, not results.</caption>
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
function Operations({ open, vetting, openSettings }: { open: (s: string) => void; vetting: VettingState; openSettings: () => void }) {
 const stopped = blocking(vetting.subjects);
 const tower = controlTowerCounts();
 return <>
  {/* One filled chip on a strip, not two. `flagged` means "this one" — a strip with two of them has
      two things shouting and has stopped pointing at either. A party blocked by vetting is a
      standing state the Vetting tab holds; a critical incident is happening now. */}
  <div className="c-figures"><Metrics>
   <Kpi label="Parties blocking work" value={String(stopped)} note={`Of ${vetting.subjects.length} vetted parties · decided in the Vetting tab`}/>
   <Kpi label="Nurses blocked" value={String(blocking(vetting.subjects, 'nurse'))} note="Not offered on the board below, with the reason shown"/>
   <Kpi label="Open incidents" value={String(tower.incidents)} note={`${tower.critical} critical · SLA acknowledged within ${acknowledgeWithinMinutes()} minutes`} flagged={tower.critical > 0}/>
  </Metrics></div>
  <DispatchBoard subjects={vetting.subjects} heading={false}/>
  <SectionTitle title="Open incidents"/>
  <IncidentBoard open={open}/>
  {/* The timings the desk works to are changed on the Configuration tab, with every other engine's settings,
      so there is one place to change them and one history. The way there stays here, under the board and
      the incidents, where somebody on the desk looks for it. */}
  <div className="privacy-note space-top cf-link"><TimerReset size={19}/><span>{settingsScreen.operationsNote}</span><button className="secondary" onClick={openSettings}>{settingsScreen.operationsOpen}</button></div>
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
  <div className="c-figures"><Metrics>
   <Kpi label="Awaiting review" value={String(reviewQueue.length)} note="Urgent target 15 minutes · routine 4 hours"/>
   <Kpi label="Doctors who cannot sign" value={`${blocked} of ${doctors.length}`} note="The queue refuses the signature rather than warning about it" flagged={!!(blocked)}/>
   <Kpi label="AI agreed with the doctor" value="91%" note="Sample of 1,240 reviewed cases"/>
   <Kpi label="AI missed a finding" value="0.8%" note="Every miss is reviewed by the Medical Director" flagged/>
  </Metrics></div>
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
 /* The nurse's share is each service's own figure in the catalogue, not a rate typed here. The launch
    services all pay the same share; some later ones pay less, and the caption says which. */
 const shareOf = (s: { nurseShare: number; price: number }) => Math.round((s.nurseShare / s.price) * 100);
 const launchShares = [...new Set(services.filter(s => s.phase === 1).map(shareOf))];
 const lowest = [...services].sort((a, b) => a.nurseShare / a.price - b.nurseShare / b.price)[0]!;
 return <>
  <div className="c-figures"><Metrics>
   <Kpi label="Services" value={String(services.length)} note={`${services.filter(s => s.phase === 1).length} live, the rest by phase`}/>
   <Kpi label="Average platform margin" value={money(Math.round(rows.reduce((t, s) => t + platformMargin(s), 0) / rows.length))} note="After the nurse and payment costs"/>
   <Kpi label="Below R40 a visit" value={String(thin.length)} note="Too thin to carry support, insurance and review" flagged={!!(thin.length)}/>
  </Metrics></div>
  <div className="panel table-scroll">
   <table className="result-table admin-table">
    <caption>Change a price to see what the platform is left with. The nurse’s share is each service’s own figure in the catalogue: {launchShares.join(' or ')}% of the price for every launch service, and as little as {shareOf(lowest)}% for {lowest.name}.</caption>
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
 /* One line per price a person could pay each month. MyThuso for Mom is three lines, because a range
    cannot be multiplied by a subscriber count; its 120 sample subscribers are divided across the
    tiers here, and like every count on this tab they are illustrative rather than anybody's. The plan's
    and tiers' names are the ones in force, so a name changed on the Configuration tab is the name here. */
 const plan = momPlanNow();
 const subs = subscriptionLines(plan);
 const active: Record<string, number> = { chronic: 980, planning: 410, 'mom-essential': 84, 'mom-plus': 28, 'mom-premium': 8, senior: 74, recover: 26, alert: 10, cover: 0 };
 const mrr = subs.reduce((t, s) => t + (s.price ?? 0) * (active[s.id] ?? 0), 0);
 const [retainLow, retainHigh] = momPlan.economics.retainsPerParentMonthly;
 return <>
  <div className="c-figures"><Metrics>
   <Kpi label="Subscribers" value={Object.values(active).reduce((a, b) => a + b, 0).toLocaleString()} note="Across every plan"/>
   <Kpi label="Monthly recurring" value={bigMoney(mrr)} note="Before nurse and delivery costs"/>
   <Kpi label="B2B lines" value={String(businessModel.network.length)} note="Contracted revenue in the proposal"/>
  </Metrics></div>
  <SectionTitle title="Subscriptions"/>
  <div className="panel table-scroll"><table className="result-table admin-table">
   <thead><tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">Active</th><th scope="col">Monthly</th><th scope="col">Phase</th></tr></thead>
   <tbody>{subs.map(s => <tr key={s.id}>
    <th scope="row">{s.name}</th><td>{s.price ? `${money(s.price)}/m` : 'Per package'}</td>
    <td>{(active[s.id] ?? 0).toLocaleString()}</td><td>{s.price ? bigMoney(s.price * (active[s.id] ?? 0)) : '—'}</td>
    <td>Phase {s.phase}</td>
   </tr>)}</tbody>
  </table></div>
  <div className="privacy-note space-top"><Banknote size={19}/>{plan.name} retains {money(retainLow)} to {money(retainHigh)} per parent per month in the Blueprint’s own model. It is an indicative figure rather than a trading result, and no visit cost is worked out from it.</div>
  <SectionTitle title="Thuso Screen packages"/>
  <div className="panel">{businessModel.screening.map(p => <div className="record-row static" key={p.id}>
   <span className="service-icon"><ShieldCheck size={20}/></span>
   <span><strong>{p.name}</strong><small>{p.includes}</small></span>
   <strong>{p.price ? money(p.price) : 'Sponsored'}</strong>
  </div>)}</div>
  <SectionTitle title="Network and B2B"/>
  <div className="panel table-scroll"><table className="result-table admin-table">
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
  <div className="c-figures"><Metrics>
   <Kpi label="Seed round" value={bigMoney(funding.round)} note={`Over ${funding.months} months`}/>
   <Kpi label="Released" value={bigMoney(released)} note={`${Math.round(released / funding.round * 100)}% of the round, gated on milestones`}/>
   <Kpi label="Modelled monthly margin" value={bigMoney(projection.total)} note={`${visitsPerDay} visits/day and ${subscribers.toLocaleString()} subscribers`}/>
  </Metrics></div>
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
  { name: `Incident escalation within ${acknowledgeWithinMinutes()} minutes`, detail: 'Acknowledged, then Clinical Lead review within 24 hours', state: 'Designed', icon: Radio },
  { name: 'SAHPRA registration for devices and diagnostic software', detail: 'Required before any device or model ships', state: 'Not built', icon: CircleAlert }
 ];
 return <>
  <div className="c-figures"><Metrics>
   <Kpi label="Designed in the UI" value={String(controls.filter(c => c.state === 'Designed').length)} note="Drawn on a screen, not enforced anywhere"/>
   <Kpi label="Not built" value={String(controls.filter(c => c.state === 'Not built').length)} note="Needs a backend, a regulator or both" flagged/>
  </Metrics></div>
  <div className="panel">{controls.map(c => <div className="record-row static" key={c.name}>
   <span className={`service-icon ${c.state === 'Designed' ? 'check-in-review' : 'check-outstanding'}`}><c.icon size={20}/></span>
   <span><strong>{c.name}</strong><small>{c.detail}</small></span>
   <Pill tone={c.state === 'Designed' ? 'amber' : 'plain'}>{c.state}</Pill>
  </div>)}</div>
  <div className="privacy-note alert space-top"><CircleAlert size={19}/>Nothing on this screen is a compliance status. It is a checklist of what must exist before real patient information touches this platform, and no patient information is held on it today.</div>
 </>;
}
/* The merged Control Tower draws these panels unchanged, under its own navigation
   (docs/control-tower-tab-inventory.md: each of them "moved"). They are exported rather than copied so
   that the parallel run compares one component in two places, never two components that happen to
   agree. The documents register is re-exported from here rather than imported by the portal: this file
   is one of the few the build lets name it. */
export { Overview as FundingOverview, Clinical as ClinicalOversight, Catalogue, Growth, Finance, Compliance as ControlChecklist, GovernanceReadiness as GovernanceDocuments, tabBlurb as adminTabBlurb };
