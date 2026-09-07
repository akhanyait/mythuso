import { useState } from 'react';
import { Ban, Building2, EyeOff, HandCoins, Info, LogOut, ShieldX, UserRoundCheck, Users } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { money } from '../lib/catalog';
import {
 employer as employerContract, floor, formatDay, percent, programmes, refusalById, refusals,
 remaining, ruleById, spent, sponsor as sponsorContract, startedOn, statement, suppress,
 suppressionReasonById, type ReportedCohort
} from '../lib/programmes';
import { can } from '../lib/vetting';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';

/* Employer and sponsor programme administration.
 *
 * Both parties are already on the vetting register with a hard refusal attached, and the refusals
 * are the feature. An employer may pay for care and still never see who used it. A sponsorship is a
 * payment, not a permission. This screen is what those two sentences look like when they have to
 * survive somebody actually wanting a report.
 *
 * The employer's report is the part worth reading. Every figure on it is a count of people, and a
 * count of people is a disclosure about each of them, so the table is built by asking which counts
 * may be published at all — a floor of twelve, a dominance rule for the group where thirteen of
 * fourteen answered the same way, secondary suppression so that nothing can be had by subtracting,
 * and rounding so that two reports laid side by side do not name whoever changed their mind. The
 * groups shown deliberately do not add up to the total, and the screen says why rather than leaving
 * a reader to think it is a bug.
 *
 * A suppressed row says why it is suppressed. A blank with no explanation reads as an error and
 * invites somebody to go and ask for it; a blank that says "fewer than twelve people" is an answer.
 *
 * The sponsor's side is shorter and harder. They see that care happened, when, and what it cost.
 * They do not see what it was for, and whether the service is even named is the recipient's switch
 * rather than the sponsor's request — because a line reading "sexual health screening" discloses
 * more than most diagnoses do.
 *
 * Nothing here reports anything. No employer is contacted, no payment is taken, and every company,
 * cohort and person is fictional. */

const employers = subjectsByRole('employer');
const sponsors = subjectsByRole('sponsor');

function Row({ row }: { row: ReportedCohort }) {
 if (row.suppressedBy) {
  const reason = suppressionReasonById(row.suppressedBy);
  return <tr className="prog-suppressed">
   <th scope="row">{row.cohort.name}<small>Not reported</small></th>
   <td colSpan={3}><EyeOff size={15}/>{reason.sentence}</td>
  </tr>;
 }
 return <tr>
  <th scope="row">{row.cohort.name}</th>
  <td>{row.eligible}</td>
  <td>{row.tookPart} <small>{percent(row.uptake)}</small></td>
  <td>{row.advisedToSeeADoctor}</td>
 </tr>;
}

export function Programmes() {
 const [employerId, setEmployerId] = useState(employers[1].id);
 const [programmeId, setProgrammeId] = useState(programmes[0].id);
 const [sponsorId, setSponsorId] = useState(sponsors[1].id);
 /* The switch belongs to the recipient, in her own account. It is on this screen so that a reader
    can see what it does to the sponsor's statement — not because a sponsor could reach it. */
 const [serviceNamed, setServiceNamed] = useState(true);

 const employerSubject = employers.find(e => e.id === employerId)!;
 const sponsorSubject = sponsors.find(s => s.id === sponsorId)!;
 const mayRunProgramme = can(employerSubject, 'run-programme');
 const maySponsor = can(sponsorSubject, 'sponsor-care');
 const report = suppress(programmes.find(p => p.id === programmeId)!);
 const statementSponsor = subjectById(statement.sponsor)!;

 return <div className="programmes">
  <Pill>Design preview · fictional companies, fictional cohorts, nothing reported</Pill>

  <SectionTitle title="The floor"/>
  <div className="panel prog-floor">
   <div className="prog-floor-grid">
    <div><strong>{floor.minimumCohort}</strong><span>people, minimum</span><p>{floor.whyTwelve}</p></div>
    <div><strong>{percent(floor.dominanceCeiling)}</strong><span>dominance ceiling</span><p>{floor.whyDominance}</p></div>
    <div><strong>{floor.roundTo}</strong><span>rounded to the nearest</span><p>{floor.whyRounding}</p></div>
    <div><strong>{floor.minimumSuppressed}</strong><span>rows hidden, minimum</span><p>{floor.whySecondary}</p></div>
   </div>
   <p className="helper"><Info size={15}/>This floor is a judgement, not a standard. Nothing in POPIA names a number, and no Information Officer has signed this one off. It is written down so that it can be argued with.</p>
  </div>

  <SectionTitle title="What the employer is sent"/>
  <fieldset className="disp-switch">
   <legend className="visually-hidden">Preview this report as</legend>
   <label>Employer<select value={employerId} onChange={e => setEmployerId(e.target.value)}>
    {employers.map(e => <option key={e.id} value={e.id}>{e.name} · {e.reference}</option>)}
   </select></label>
   <label>Programme<select value={programmeId} onChange={e => setProgrammeId(e.target.value)}>
    {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
  </fieldset>
  {!mayRunProgramme.allowed ? <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayRunProgramme.reason}</div> : null}

  {mayRunProgramme.allowed ? <div className="panel prog-report">
   <div className="order-head plain">
    <span className="service-icon"><Building2 size={21}/></span>
    <div><h3>{report.programme.name}</h3>
     <p className="muted">{employerSubject.name} · running since {formatDay(startedOn(report.programme))}</p></div>
    <Pill tone="plain">{report.suppressed.length} of {report.rows.length} groups not reported</Pill>
   </div>
   <table className="admin-table prog-table">
    <caption className="visually-hidden">Uptake and outcomes by group, with every suppressed group named and explained</caption>
    <thead><tr><th scope="col">Group</th><th scope="col">Eligible</th><th scope="col">Took part</th><th scope="col">Advised to see a doctor</th></tr></thead>
    <tbody>{report.rows.map(row => <Row key={row.cohort.id} row={row}/>)}</tbody>
    <tfoot><tr>
     <th scope="row">Everybody</th>
     <td>{report.total.eligible}</td>
     <td>{report.total.tookPart} <small>{percent(report.total.uptake)}</small></td>
     <td>{report.total.advisedToSeeADoctor}</td>
    </tr></tfoot>
   </table>
   <p className="prog-reconcile" role="status">
    <Info size={15}/>
    The groups shown add up to {report.publishedTookPart}, and the total says {report.total.tookPart}. That is not an error.
    {' '}{ruleById('figures-do-not-reconcile').sentence}
   </p>
   <p className="helper">{report.programme.note}</p>
   <p className="disp-rule"><Info size={15}/>{ruleById('rounded-not-exact').sentence}</p>
  </div> : null}

  <div className="disp-columns space-top">
   <div className="panel"><h4>What an employer sees</h4>
    <ul className="prog-list">{employerContract.sees.map(s => <li key={s.what}><strong>{s.what}</strong>{s.why}</li>)}</ul></div>
   <div className="panel prog-never"><h4>What an employer never sees</h4>
    <ul className="prog-list">{employerContract.neverSees.map(s => <li key={s.what}><strong>{s.what}</strong>{s.why}</li>)}</ul></div>
  </div>
  <div className="disp-refusal"><Ban size={19}/><p>{refusalById('named-result').sentence}</p></div>

  <SectionTitle title="Saying no"/>
  <div className="panel prog-declining">
   <div className="record-row plain">
    <span className="service-icon"><EyeOff size={21}/></span>
    <span><strong>{employerContract.declining.headline}</strong><small>{employerContract.declining.note}</small></span>
   </div>
   <p>{employerContract.declining.detail}</p>
   <p className="disp-rule"><Info size={15}/>{ruleById('taking-part-is-the-employees').sentence}</p>
   <div className="disp-refusal"><Ban size={19}/><p>{refusalById('learn-who-declined').sentence}</p></div>
   <div className="disp-refusal"><Ban size={19}/><p>{refusalById('condition-employment').sentence}</p></div>
  </div>

  <SectionTitle title="Joining, and leaving"/>
  <div className="disp-columns">
   <div className="panel"><h4>How somebody joins</h4>
    <ol className="prog-steps">{employerContract.enrolment.map(s => <li key={s.step}><strong>{s.step}</strong>{s.detail}</li>)}</ol></div>
   <div className="panel"><h4>What happens when they leave</h4>
    <ul className="prog-list">{employerContract.leaving.map(s => <li key={s.what}><LogOut size={14}/><strong>{s.what}</strong>{s.detail}</li>)}</ul></div>
  </div>
  <p className="disp-rule"><Info size={15}/>{ruleById('leaving-does-not-unpublish').sentence}</p>

  <SectionTitle title="Somebody paying for somebody else"/>
  <fieldset className="disp-switch">
   <legend className="visually-hidden">Preview this statement as</legend>
   <label>Sponsor<select value={sponsorId} onChange={e => setSponsorId(e.target.value)}>
    {sponsors.map(s => <option key={s.id} value={s.id}>{s.name} · {s.reference}</option>)}
   </select></label>
  </fieldset>
  {!maySponsor.allowed ? <div className="privacy-note alert" role="status"><ShieldX size={19}/>{maySponsor.reason}</div> : null}
  <div className="panel prog-sponsor">
   <div className="record-row plain">
    <span className="service-icon"><HandCoins size={21}/></span>
    <span><strong>{statementSponsor.name} is paying for {statement.recipient}</strong>
     <small>{statement.relationship} · {money(statement.setAside)} set aside · {money(remaining)} left</small></span>
   </div>
   <div className="record-row plain">
    <span className="service-icon"><UserRoundCheck size={21}/></span>
    <span><strong>{sponsorContract.consent.headline}</strong><small>{sponsorContract.consent.detail}</small></span>
   </div>
   <p className="helper">{sponsorContract.consent.withdrawal}</p>

   <label className="checkbox prog-naming">
    <input type="checkbox" checked={serviceNamed} onChange={() => setServiceNamed(!serviceNamed)}
     aria-label="Name the service on this sponsor’s statement"/>
    <span/>
    <em>{statement.recipient} lets this sponsor see which visit it was</em>
   </label>
   <p className="helper">{sponsorContract.lineDetail.find(c => c.id === (serviceNamed ? 'service-named' : 'amount-only'))!.detail}</p>

   <table className="admin-table prog-statement">
    <caption className="visually-hidden">What this sponsor has paid for</caption>
    <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Amount</th></tr></thead>
    <tbody>{statement.lines.map(line => <tr key={line.on + line.service}>
     <td>{formatDay(line.on)}</td>
     <td>{serviceNamed ? line.service : 'Care was given'}</td>
     <td>{money(line.amount)}</td>
    </tr>)}</tbody>
    <tfoot><tr><th scope="row" colSpan={2}>Drawn from what was set aside</th><td>{money(spent)}</td></tr></tfoot>
   </table>
   {serviceNamed ? <p className="helper">{statement.note}</p> : null}

   <div className="disp-columns">
    <div><h4>What a sponsor sees</h4>
     <ul className="prog-list">{sponsorContract.sees.map(s => <li key={s.what}><strong>{s.what}</strong>{s.why}</li>)}</ul></div>
    <div><h4>What a sponsor never sees</h4>
     <ul className="prog-list">{sponsorContract.neverSees.map(s => <li key={s.what}><strong>{s.what}</strong>{s.why}</li>)}</ul></div>
   </div>
   <p className="disp-rule"><Info size={15}/>{ruleById('paying-is-not-permission').sentence}</p>
   <div className="disp-refusal"><Ban size={19}/><p>{refusalById('require-the-detail').sentence}</p></div>
  </div>

  <SectionTitle title="What this screen will not do"/>
  <div className="disp-refusals">{refusals.map(r => <div className="disp-refusal" key={r.id}><Ban size={19}/><p>{r.sentence}</p></div>)}</div>
  <EmptyNote>No report is produced, no invitation is sent and no payment is taken. Every count above is fictional, the suppression is arithmetic on it, and the floor itself still needs an Information Officer to agree with it.</EmptyNote>
 </div>;
}

/* What the vetting console and the admin queue need in one line: how many groups this programme
   cannot report on. Derived, so it cannot say two while the table hides three. */
export function programmeSummary() {
 return programmes.map(p => ({ id: p.id, name: p.name, suppressed: suppress(p).suppressed.length }));
}
export const programmeIcons = { Users };
