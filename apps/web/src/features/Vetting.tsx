import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, Check, CircleAlert, ClipboardList, Clock3, FileText, RotateCcw, ScrollText, ShieldCheck, ShieldX, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { Metric, Metrics } from '../surface/Surface';
import { StepHead } from '../components/Steps';
import { EmptyState } from '../components/States';
import { NotConnected } from '../components/NotConnected';
import { useT } from '../lib/i18n';
import {
 authorityById, capabilityById, checkById, checkStateLabels, daysUntil, decisions, eventLabels, formatDate, formatEventTime, scopeFor,
 inMonths, isoDate, needsSecondReviewer, recordEvent, recordFor, roleById, roles, subjectStatusLabels, summarise, today, validateCredential,
 type CheckRecord, type CheckState, type SubjectStatus, type VettingCheck, type VettingEvent, type VettingEventKind, type VettingSubject
} from '../lib/vetting';
import { seededLog, seededSubjects } from '../lib/vetting-fixtures';

/* Vetting is the gate the whole marketplace rests on, so this is a real queue with real refusals
   rather than a list of names. Every decision recomputes what the party may do, and is written to a
   log this screen can only add to. Nothing is submitted, verified, stored or sent anywhere. */

/* The same three names the fixtures decided with, so seconding a decision that is already on file
   is genuinely a different person rather than a fourth reviewer appearing from nowhere. */
export const reviewers = ['M. Sithole · Clinical Governance', 'T. van Wyk · Compliance', 'P. Mabaso · Clinical Director'];

/* The credential a role actually hangs on — the one a reviewer looks up first. It is written out
   rather than derived, because the order checks appear in is not the order they matter in: a
   pharmacy is registered with CIPC before the SAPC, and only the second decides whether it may
   dispense. */
const anchors: Record<string, string> = {
 nurse: 'sanc-registration', locum: 'sanc-registration', doctor: 'hpcsa-registration',
 pharmacy: 'pharmacy-registration', laboratory: 'iso-15189', courier: 'driving-licence',
 operator: 'identity', admin: 'identity', employer: 'company-registration',
 sponsor: 'identity', guardian: 'identity', corner: 'site-inspection'
};
/* Only some roles are dispatched inside a declared scope. The ones missing here are not narrower
   for being unlisted — an operator has no scope of practice, and pretending otherwise would put a
   clinical word on an office job. */
const anchorFor = (roleId: string) => checkById(roleId, anchors[roleId] ?? '') ?? roleById(roleId)?.checks[0];
/* A lapsed credential reads as lapsed. A countdown that goes negative turns the one state this
   module exists to catch into arithmetic the reader has to do themselves. */
const dueWording = (days: number) => days < 0 ? `lapsed ${-days} day${days === -1 ? '' : 's'} ago`
 : days === 0 ? 'renews today' : `renews in ${days} day${days === 1 ? '' : 's'}`;

/* ---- Held state -------------------------------------------------------------------------
   In memory, for the length of one visit to the console. A reviewer action changes what the
   gated screens are allowed to offer, which is the only way to tell whether the gate works. */
function withRecord(subject: VettingSubject, checkId: string, patch: Partial<CheckRecord>): VettingSubject {
 const existing = subject.records.find(r => r.checkId === checkId) ?? { checkId, state: 'outstanding' as CheckState };
 const next = { ...existing, ...patch };
 return { ...subject, records: subject.records.some(r => r.checkId === checkId) ? subject.records.map(r => r.checkId === checkId ? next : r) : [...subject.records, next] };
}
const decided = (roleId: string, checkId: string, by: string): Partial<CheckRecord> => ({
 state: 'verified', decidedBy: by, decidedOn: isoDate(today()), secondedBy: undefined, note: undefined,
 evidence: checkById(roleId, checkId)?.evidence,
 expiresOn: checkById(roleId, checkId)?.renewMonths ? inMonths(checkById(roleId, checkId)!.renewMonths!) : undefined
});
export function useVettingState() {
 const [subjects, setSubjects] = useState<VettingSubject[]>(seededSubjects);
 const [log, setLog] = useState<VettingEvent[]>(seededLog);
 const [reviewer, setReviewer] = useState(reviewers[0]);
 const write = (subject: VettingSubject, kind: VettingEventKind, checkId?: string, note?: string, actor?: string) =>
  setLog(l => recordEvent(l, {
   subjectId: subject.id, subjectName: subject.name, roleId: subject.roleId, checkId, kind,
   actor: actor ?? reviewer, evidence: checkId ? checkById(subject.roleId, checkId)?.evidence : undefined, note
  }));
 const replace = (subject: VettingSubject, next: VettingSubject) => setSubjects(list => list.map(s => s.id === subject.id ? next : s));
 return {
  subjects, log, reviewer, setReviewer,
  verify(subject: VettingSubject, checkId: string) {
   replace(subject, withRecord(subject, checkId, decided(subject.roleId, checkId, reviewer)));
   write(subject, 'verified', checkId, checkById(subject.roleId, checkId)?.risk === 'high'
    ? 'High risk. Recorded, but it does not count as passed until a second reviewer agrees.' : undefined);
  },
  second(subject: VettingSubject, checkId: string) {
   replace(subject, withRecord(subject, checkId, { secondedBy: reviewer }));
   write(subject, 'seconded', checkId, `Agreed with ${recordFor(subject, checkId).decidedBy ?? 'the first reviewer'}.`);
  },
  decline(subject: VettingSubject, checkId: string, reason: string) {
   replace(subject, withRecord(subject, checkId, { state: 'declined', decidedBy: reviewer, decidedOn: isoDate(today()), secondedBy: undefined, note: reason }));
   write(subject, 'declined', checkId, reason);
  },
  /* Renewal is the other half of automatic suspension: a lapse removes the party without anyone
     acting, so putting them back has to be a decision somebody's name is on. */
  renew(subject: VettingSubject, checkId: string) {
   const next = withRecord(subject, checkId, decided(subject.roleId, checkId, reviewer));
   replace(subject, next);
   write(subject, 'renewed', checkId, `New expiry ${formatDate(recordFor(next, checkId).expiresOn)}.`);
   if (summarise(subject).lapsed.length && !summarise(next).lapsed.length && !next.suspended)
    write(next, 'restored', undefined, 'Last lapsed check renewed. The party is back on the work it is vetted for.');
  },
  suspend(subject: VettingSubject, reason: string) {
   replace(subject, { ...subject, suspended: true, suspendedReason: reason });
   write(subject, 'suspended', undefined, reason);
  },
  restore(subject: VettingSubject) {
   replace(subject, { ...subject, suspended: false, suspendedReason: undefined });
   write(subject, 'restored', undefined, 'Suspension lifted by a reviewer.');
  },
  appeal(subject: VettingSubject, note: string) {
   replace(subject, { ...subject, appealed: true });
   write(subject, 'appealed', undefined, note, `${subject.name} · recorded by ${reviewer}`);
  }
 };
}
export type VettingState = ReturnType<typeof useVettingState>;

/* ---- Small shared pieces ----------------------------------------------------------------- */
/* A figure in the dashboard language: the number set large and thin, what it is underneath it, and
   — where the console has one — the sentence saying what it is measured against under that.
   A vetting console cannot lose those sentences: "4" means nothing beside "Suspended or declined",
   and everything about whether it is a problem is in "lapsed automatically, or declined with a
   reason". They are too long to be the chip a Metric floats above the figure, so they sit below the
   label, and the chip carries the one word that says whether the number is a problem.
   The wrapper keeps `panel metric` as well as its own name: the console journeys assert against
   `.panel.metric`, and a class is part of the contract with them as much as any export is. */
function Figure({ label, value, note, flagged }: { label: string; value: string; note: string; flagged?: boolean }) {
 return <div className="c-figure panel metric">
  <Metric label={label} value={value} chip={flagged ? 'Needs attention' : undefined} flagged={flagged}/>
  <small>{note}</small>
 </div>;
}
const stateTone = (state: CheckState) => state === 'verified' ? 'check-verified' : state === 'expiring' ? 'check-in-review'
 : state === 'lapsed' || state === 'declined' ? 'check-declined' : state === 'in-review' || state === 'submitted' ? 'check-in-review' : 'check-outstanding';
const statusTone = (status: SubjectStatus) => status === 'cleared' ? 'teal' : status === 'suspended' || status === 'declined' ? 'danger' : 'amber';
function Progress({ passed, total }: { passed: number; total: number }) {
 return <div className="vetting-progress" role="img" aria-label={`${passed} of ${total} checks passing`}>
  <div style={{ width: `${total ? (passed / total) * 100 : 0}%` }}/>
 </div>;
}
/* A countdown, not a date somebody typed. This is the sentence that makes scheduled re-vetting
   true in the preview rather than a claim in a paragraph of copy. */
function expiryLine(check: VettingCheck, record: CheckRecord) {
 const days = daysUntil(record.expiresOn);
 if (days === null) return check.renewMonths ? 'No expiry recorded yet' : 'Does not renew';
 if (days < 0) return `Lapsed ${-days} day${days === -1 ? '' : 's'} ago · removed automatically, without a reviewer acting`;
 return `In date until ${formatDate(record.expiresOn)} · ${days} day${days === 1 ? '' : 's'} left`;
}
function ReasonForm({ label, hint, confirm, onConfirm, onCancel }: { label: string; hint: string; confirm: string; onConfirm: (reason: string) => void; onCancel: () => void }) {
 const [reason, setReason] = useState('');
 return <div className="reason-form">
  <label>{label}<textarea autoFocus value={reason} onChange={e => setReason(e.target.value.slice(0, 400))} placeholder="In your own words, for the party and for the record…"/></label>
  <p className="helper">{hint}</p>
  <div className="button-row">
   <button className="secondary" onClick={onCancel}>Cancel</button>
   <button className="primary" disabled={reason.trim().length < 10} onClick={() => onConfirm(reason.trim())}><Check size={15}/>{confirm}</button>
  </div>
 </div>;
}

/* The console, with its state held for it.
 *
 * The Control Tower's "Vetting queue" section was rendering the applicant's own five-step
 * application — the form a nurse fills in about herself — under a heading that promised "every
 * applicant, the state of each check, and the decision that either clears somebody for dispatch or
 * refuses it in writing". A controller opening it got a blank SANC field and no way to reach a
 * single one of the twelve parties whose clearance they are responsible for. That is the console,
 * and the console already existed; the only thing missing was somewhere for its state to live
 * outside the back office. */
export function VettingQueue({ open }: { open: (s: string) => void }) {
 const vetting = useVettingState();
 return <>
  <div className="page-intro"><div><div className="eyebrow">CONTROL TOWER</div>
   <h1>Vetting queue</h1>
   <p>Every applicant, the state of each check, and the decision that either clears somebody for dispatch or refuses it in writing.</p></div></div>
  <VettingConsole vetting={vetting} open={open}/>
 </>;
}

/* ---- The reviewer console ---------------------------------------------------------------- */
type View = 'queue' | 'renewals' | 'audit';
export function VettingConsole({ vetting, open }: { vetting: VettingState; open: (s: string) => void }) {
 const t = useT();
 const { subjects, log, reviewer, setReviewer } = vetting;
 const [view, setView] = useState<View>('queue');
 const [roleFilter, setRoleFilter] = useState('all');
 const [statusFilter, setStatusFilter] = useState<'all' | SubjectStatus>('all');
 const [selected, setSelected] = useState(subjects[0].id);
 const rows = useMemo(() => subjects
  .map(s => ({ subject: s, summary: summarise(s) }))
  .filter(r => roleFilter === 'all' || r.subject.roleId === roleFilter)
  .filter(r => statusFilter === 'all' || r.summary.status === statusFilter), [subjects, roleFilter, statusFilter]);
 const counts = useMemo(() => subjects.reduce((tally, s) => {
  const summary = summarise(s);
  tally[summary.status] = (tally[summary.status] ?? 0) + 1;
  if (summary.awaitingSecond.length) tally.awaiting = (tally.awaiting ?? 0) + 1;
  return tally;
 }, {} as Record<string, number>), [subjects]);
 const shown = rows.find(r => r.subject.id === selected) ?? rows[0];
 const views: [View, string][] = [['queue', t('vetting.queue')], ['renewals', t('vetting.renewals')], ['audit', t('vetting.audit')]];
 return <>
  <NotConnected of="credential-verification"/>
  <div className="c-figures"><Metrics>
   <Figure label="Cleared" value={String((counts.cleared ?? 0) + (counts.expiring ?? 0))} note={`${counts.expiring ?? 0} of them with a renewal due`}/>
   <Figure label="In progress" value={String(counts['in-progress'] ?? 0)} note="Refused the work of the role until every check passes"/>
   <Figure label="Awaiting a second reviewer" value={String(counts.awaiting ?? 0)} note="One reviewer is never enough on a high-risk check" flagged={!!(counts.awaiting)}/>
   <Figure label="Suspended or declined" value={String((counts.suspended ?? 0) + (counts.declined ?? 0))} note="Lapsed automatically, or declined with a reason" flagged={!!((counts.suspended ?? 0) + (counts.declined ?? 0))}/>
  </Metrics></div>
  <div className="vetting-bar">
   <div className="tabs" role="group" aria-label={t('vetting.views')}>
    {views.map(([id, label]) => <button key={id} className={view === id ? 'selected' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
   </div>
   <label className="inline-field">{t('vetting.reviewer')}
    <select value={reviewer} onChange={e => setReviewer(e.target.value)}>{reviewers.map(r => <option key={r}>{r}</option>)}</select>
   </label>
   <button className="secondary" onClick={() => open('Vetting application')}><ClipboardList size={15}/>{t('vetting.apply')}</button>
  </div>
  <p className="helper" role="status">Acting as {reviewer}. Decisions are attributed to this name, and a high-risk check needs a second one.</p>
  {view === 'queue' ? <>
   <div className="vetting-filters">
    <label className="inline-field">{t('vetting.role')}
     <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
      <option value="all">{t('vetting.allRoles')}</option>
      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
     </select>
    </label>
    <label className="inline-field">{t('vetting.status')}
     <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | SubjectStatus)}>
      <option value="all">{t('vetting.allStatuses')}</option>
      {(Object.keys(subjectStatusLabels) as SubjectStatus[]).map(s => <option key={s} value={s}>{subjectStatusLabels[s]}</option>)}
     </select>
    </label>
   </div>
   {rows.length ? <div className="vetting-grid">
     <div className="panel">
      <div className="section-title"><h2>{t('vetting.parties')}</h2><Pill tone="plain">{rows.length} of {subjects.length}</Pill></div>
      {rows.map(({ subject, summary }) => <button className="record-row" key={subject.id} aria-pressed={shown?.subject.id === subject.id} onClick={() => setSelected(subject.id)}>
       <span className={`service-icon ${summary.cleared ? 'check-verified' : summary.status === 'in-progress' ? 'check-in-review' : 'check-declined'}`}>
        {summary.cleared ? <BadgeCheck size={20}/> : summary.status === 'in-progress' ? <ClipboardList size={20}/> : <ShieldX size={20}/>}
       </span>
       <span>
        <strong>{subject.name}</strong>
        <small>{roleById(subject.roleId)?.name} · {subject.reference}{subject.zone ? ` · ${subject.zone}` : ''}</small>
        <Progress passed={summary.passed} total={summary.total}/>
        <small>{summary.passed} of {summary.total} checks passing{summary.nextDue ? ` · ${summary.nextDue.check.name} ${dueWording(summary.nextDue.days)}` : ''}</small>
       </span>
       <Pill tone={statusTone(summary.status)}>{subjectStatusLabels[summary.status]}</Pill>
      </button>)}
     </div>
     {shown && <SubjectDetail key={shown.subject.id} subject={shown.subject} vetting={vetting}/>}
    </div> : <EmptyState title="Nobody matches those filters" body="Widen the role or the status to see the rest of the queue. Nothing has been hidden from you."/>}
  </> : view === 'renewals' ? <RenewalsDue subjects={subjects} onOpen={id => { setSelected(id); setView('queue'); setRoleFilter('all'); setStatusFilter('all'); }}/> : <AuditTrail log={log}/>}
 </>;
}

function SubjectDetail({ subject, vetting }: { subject: VettingSubject; vetting: VettingState }) {
 const [declining, setDeclining] = useState('');
 const [action, setAction] = useState<'' | 'suspend' | 'appeal'>('');
 const summary = summarise(subject);
 const role = roleById(subject.roleId)!;
 return <div className="panel">
  <div className="section-title"><h2>{subject.name}</h2><Pill tone={statusTone(summary.status)}>{subjectStatusLabels[summary.status]}</Pill></div>
  <div className="review-line"><span>Role</span><strong>{role.name}</strong></div>
  <div className="review-line"><span>Credential</span><strong>{subject.reference}</strong></div>
  {subject.zone && <div className="review-line"><span>Area</span><strong>{subject.zone}</strong></div>}
  {subject.scope?.length ? <div className="review-line"><span>Scope</span><strong>{subject.scope.join(' · ')}</strong></div> : null}
  <div className="review-line"><span>Checks passing</span><strong>{summary.passed} of {summary.total}</strong></div>
  <Progress passed={summary.passed} total={summary.total}/>
  <p className="helper" role="status">
   {summary.lapsed.length ? `${summary.lapsed.map(l => l.check.name).join(' and ')} lapsed. This party was removed from the work of the role automatically.`
    : summary.awaitingSecond.length ? `${summary.awaitingSecond.map(a => a.check.name).join(' and ')} is waiting on a second reviewer.`
     : summary.status === 'declined' ? subject.declinedReason ?? 'A check was declined with a reason.'
      : summary.status === 'suspended' ? subject.suspendedReason ?? 'Suspended by a reviewer.'
       : summary.blocking.length ? `${summary.blocking.length} check${summary.blocking.length === 1 ? '' : 's'} outstanding.`
        : summary.expiring.length ? `Cleared, with ${summary.expiring.length} renewal${summary.expiring.length === 1 ? '' : 's'} due.` : 'Every check passed and in date.'}
  </p>
  <div className="admin-actions space-top">
   {subject.suspended ? <button className="secondary" onClick={() => vetting.restore(subject)}><RotateCcw size={15}/>Lift the suspension</button>
    : <button className="secondary" onClick={() => setAction(action === 'suspend' ? '' : 'suspend')}><ShieldX size={15}/>Suspend</button>}
   <button className="secondary" onClick={() => setAction(action === 'appeal' ? '' : 'appeal')} disabled={subject.appealed}><ScrollText size={15}/>{subject.appealed ? 'Appeal recorded' : 'Record an appeal'}</button>
  </div>
  {action === 'suspend' && <ReasonForm label="Why this party is suspended" hint="A suspension without a written reason is not reviewable, and cannot be appealed. Ten characters at least." confirm="Suspend"
   onConfirm={reason => { vetting.suspend(subject, reason); setAction(''); }} onCancel={() => setAction('')}/>}
  {action === 'appeal' && <ReasonForm label="What the party says" hint="Recorded in their words, not yours. It changes nothing on its own — a check still has to be decided again." confirm="Record the appeal"
   onConfirm={note => { vetting.appeal(subject, note); setAction(''); }} onCancel={() => setAction('')}/>}
  <SectionTitle title="Checks"/>
  {summary.states.map(({ check, state }) => {
   const record = recordFor(subject, check.id);
   const authority = authorityById(check.authority)!;
   const second = needsSecondReviewer(subject, check.id);
   const ownDecision = record.decidedBy === vetting.reviewer;
   return <div className="record-row static admin-row" key={check.id}>
    <span className={`service-icon ${stateTone(state)}`}>{state === 'verified' ? <BadgeCheck size={20}/> : state === 'declined' || state === 'lapsed' ? <CircleAlert size={20}/> : <Clock3 size={20}/>}</span>
    <span>
     <strong>{check.name}{check.risk === 'high' && <span className="required-mark">High risk</span>}</strong>
     <small>{check.detail}</small>
     <small>{authority.name} ({authority.short}) · {check.evidence} · {check.renewMonths ? `renews every ${check.renewMonths} months` : 'does not renew'}</small>
     <small>{record.decidedBy ? `Decided by ${record.decidedBy} on ${formatDate(record.decidedOn)}` : 'No decision recorded'}{record.secondedBy ? ` · seconded by ${record.secondedBy}` : ''}</small>
     <small className={daysUntil(record.expiresOn) !== null && daysUntil(record.expiresOn)! < 0 ? 'flagged' : ''}>{expiryLine(check, record)}</small>
     {second && <small className="flagged" role="status">Verified by {record.decidedBy}. It does not count until a different reviewer agrees.</small>}
     {record.note && <small>“{record.note}”</small>}
     {declining === check.id && <ReasonForm label={`Why ${check.name} is declined`} hint="The party is told this sentence. Write it for them, not for the file. Ten characters at least." confirm="Decline this check"
      onConfirm={reason => { vetting.decline(subject, check.id, reason); setDeclining(''); }} onCancel={() => setDeclining('')}/>}
    </span>
    <Pill tone={state === 'verified' ? 'teal' : state === 'lapsed' || state === 'declined' ? 'danger' : 'amber'}>{second ? 'Awaiting a second reviewer' : checkStateLabels[state]}</Pill>
    <div className="admin-actions">
     {second ? <button className="primary" disabled={ownDecision} onClick={() => vetting.second(subject, check.id)} title={ownDecision ? 'You took the first decision on this check.' : undefined}>
      <UserRoundCheck size={15}/>{ownDecision ? 'You decided this' : 'Second it'}</button>
      : state === 'lapsed' || state === 'expiring' ? <button className="primary" onClick={() => vetting.renew(subject, check.id)}><RotateCcw size={15}/>Record a renewal</button>
       : state !== 'verified' && <button className="primary" onClick={() => vetting.verify(subject, check.id)}><Check size={15}/>Verify</button>}
     <button className="secondary" onClick={() => setDeclining(declining === check.id ? '' : check.id)}><UserRoundX size={15}/>Decline</button>
    </div>
   </div>;
  })}
  {summary.awaitingSecond.length > 0 && <div className="privacy-note space-top"><Users size={19}/>A high-risk check verified by one person is not verified. Switch the reviewer above and second it as somebody else — the console refuses to let one name do both.</div>}
  <SectionTitle title="What this party is refused"/>
  <div className="table-scroll"><table className="result-table">
   <caption>Driven by the checks above. Change a decision and this table changes with it.</caption>
   <thead><tr><th scope="col">Capability</th><th scope="col">Answer</th><th scope="col">Reason</th></tr></thead>
   <tbody>{decisions(subject).map(d => <tr key={d.capability.id} className={d.decision.allowed ? '' : 'flagged-row'}>
    <th scope="row">{d.capability.name}</th>
    <td>{d.decision.allowed ? 'Allowed' : 'Refused'}</td>
    <td>{d.decision.allowed ? d.capability.detail : d.decision.reason}</td>
   </tr>)}</tbody>
  </table></div>
 </div>;
}

/* ---- Renewals ----------------------------------------------------------------------------- */
function RenewalsDue({ subjects, onOpen }: { subjects: VettingSubject[]; onOpen: (id: string) => void }) {
 const due = subjects
  .map(s => ({ subject: s, summary: summarise(s) }))
  .filter(r => r.summary.nextDue)
  .sort((a, b) => a.summary.nextDue!.days - b.summary.nextDue!.days);
 const lapsed = due.filter(r => r.summary.nextDue!.days < 0);
 return <>
  <div className="c-figures"><Metrics>
   <Figure label="Already lapsed" value={String(lapsed.length)} note="Suspended without anyone here having to notice" flagged={!!(lapsed.length)}/>
   <Figure label="Due within 45 days" value={String(due.filter(r => r.summary.nextDue!.days >= 0 && r.summary.nextDue!.days <= 45).length)} note="Still working today, and told about it"/>
   <Figure label="On the renewal schedule" value={String(due.length)} note="Every check with a renewal cadence"/>
  </Metrics></div>
  <SectionTitle title="Sorted by what expires first"/>
  <div className="panel">
   {due.map(({ subject, summary }) => <button className="record-row" key={subject.id} onClick={() => onOpen(subject.id)}>
    <span className={`service-icon ${summary.nextDue!.days < 0 ? 'check-declined' : summary.nextDue!.days <= 45 ? 'check-in-review' : 'check-verified'}`}><CalendarClock size={20}/></span>
    <span>
     <strong>{subject.name}</strong>
     <small>{roleById(subject.roleId)?.name} · {summary.nextDue!.check.name} · renews every {summary.nextDue!.check.renewMonths} months</small>
     <small className="cap-first">{dueWording(summary.nextDue!.days)} · {formatDate(recordFor(subject, summary.nextDue!.check.id).expiresOn)}</small>
    </span>
    <Pill tone={summary.nextDue!.days < 0 ? 'danger' : summary.nextDue!.days <= 45 ? 'amber' : 'teal'}>{summary.nextDue!.days < 0 ? 'Lapsed' : `${summary.nextDue!.days} days`}</Pill>
   </button>)}
   {!due.length && <EmptyState title="Nothing on the renewal schedule" body="Every check held for these parties is one that does not expire."/>}
  </div>
  <div className="privacy-note space-top"><ShieldCheck size={19}/>Re-vetting runs on a schedule, not once at sign-up. A lapsed SANC registration or police clearance removes a nurse from dispatch automatically, without anyone here having to notice. Nothing on this screen runs on a timer — a lapse is arithmetic against the expiry date, recomputed every time the screen is drawn, which is why it cannot be missed.</div>
 </>;
}

/* ---- The append-only audit ---------------------------------------------------------------- */
function AuditTrail({ log }: { log: VettingEvent[] }) {
 const [kind, setKind] = useState<'all' | VettingEventKind>('all');
 const shown = log.filter(e => kind === 'all' || e.kind === kind);
 return <>
  <div className="vetting-bar">
   <label className="inline-field">Event
    <select value={kind} onChange={e => setKind(e.target.value as 'all' | VettingEventKind)}>
     <option value="all">Every event</option>
     {(Object.keys(eventLabels) as VettingEventKind[]).map(k => <option key={k} value={k}>{eventLabels[k]}</option>)}
    </select>
   </label>
   <Pill tone="plain">{log.length} entries</Pill>
  </div>
  <div className="panel">
   {shown.map(event => <div className="record-row static" key={event.id}>
    <span className={`service-icon ${event.kind === 'verified' || event.kind === 'seconded' || event.kind === 'renewed' || event.kind === 'restored' ? 'check-verified' : event.kind === 'declined' || event.kind === 'suspended' || event.kind === 'lapsed' ? 'check-declined' : 'check-in-review'}`}><FileText size={20}/></span>
    <span>
     <strong>{eventLabels[event.kind]} · {event.subjectName}</strong>
     <small>{event.id} · {formatEventTime(event.at)} · {roleById(event.roleId)?.name}{event.checkId ? ` · ${checkById(event.roleId, event.checkId)?.name}` : ''}</small>
     <small>By {event.actor}{event.evidence ? ` · evidence: ${event.evidence}` : ''}</small>
     {event.note && <small>“{event.note}”</small>}
    </span>
   </div>)}
   {!shown.length && <EmptyState title="No entries of that kind" body="The log holds every decision taken in this console since it was opened, plus the history it started with."/>}
  </div>
  <div className="privacy-note space-top"><ScrollText size={19}/>Entries are only ever added to the top of this list. Nothing in this console edits one, deletes one or reorders them — there is no button for it, because a decision log you can tidy up is not a decision log. What is missing is the part that matters: a server-side record with integrity protection that a person with database access still cannot rewrite.</div>
 </>;
}

/* ---- The applicant flow -------------------------------------------------------------------
   One flow for thirteen roles, because the checks, the issuing authorities and the renewal cadences
   are data. A separate screen per role would drift from the console that has to decide it. */
type Step = 'role' | 'credential' | 'scope' | 'evidence' | 'declarations' | 'attestation';
const stepLabels: Record<Step, string> = {
 role: 'Who is applying', credential: 'Your credential', scope: 'Scope of practice',
 evidence: 'Evidence', declarations: 'Declarations', attestation: 'Attestation'
};
const declarations = [
 'I have never been struck off, suspended or found guilty of misconduct by a professional council or a regulator.',
 'I have declared any other work or hours that could affect what I can safely take on here.',
 'I will report any change to my registration, clearance, cover or health status without waiting to be asked.'
];
export function VettingApplication({ roleId, onClose }: { roleId?: string; onClose: () => void }) {
 const [chosen, setChosen] = useState(roleId ?? '');
 const [step, setStep] = useState(0);
 const [credential, setCredential] = useState('');
 const [touched, setTouched] = useState(false);
 const [scope, setScope] = useState<string[]>([]);
 const [ready, setReady] = useState<string[]>([]);
 const [agreed, setAgreed] = useState<string[]>([]);
 const [attested, setAttested] = useState(false);
 const [sent, setSent] = useState(false);
 const role = roleById(chosen);
 const steps: Step[] = [...(roleId ? [] : ['role' as Step]), ...(role ? ['credential' as Step, ...(scopeFor(role.id) ? ['scope' as Step] : []), 'evidence' as Step, 'declarations' as Step, 'attestation' as Step] : [])];
 const now = steps[Math.min(step, steps.length - 1)];
 const anchor = role ? anchorFor(role.id) : undefined;
 const authority = anchor ? authorityById(anchor.authority) : undefined;
 const result = anchor ? validateCredential(anchor.authority, credential) : { ok: false };
 const back = () => step > 0 ? setStep(step - 1) : onClose();
 const next = () => setStep(step + 1);
 if (sent) return <div className="form-stack">
  <div className="success-icon"><BadgeCheck size={30}/></div>
  <h3>Nothing was submitted.</h3>
  <p className="muted">The shape of the real thing: {role?.checks.length} checks, each with an issuing authority, an evidence requirement and a renewal date, decided by a named reviewer and — where the risk is high — a second one.</p>
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
 return <div className="form-stack">
  {steps.length > 1 && <StepHead step={Math.min(step, steps.length - 1) + 1} total={steps.length} label={stepLabels[now]}/>}
  <NotConnected of="credential-verification"/>
  {now === 'role' ? <>
   <h3>Who is applying?</h3>
   <p className="muted">Thirteen parties are vetted, not only nurses. Each one is refused something specific until its checks pass.</p>
   {roles.map(r => <button className="record-row" key={r.id} aria-pressed={chosen === r.id} onClick={() => { setChosen(r.id); setCredential(''); setTouched(false); setScope([]); setReady([]); setStep(1); }}>
    <span className="service-icon"><Users size={20}/></span>
    <span><strong>{r.name}</strong><small>{r.summary}</small><small>{r.checks.length} checks · {r.grants.length} thing{r.grants.length === 1 ? '' : 's'} it is refused until they pass</small></span>
    <ArrowRight size={17}/>
   </button>)}
   <button className="secondary full" onClick={onClose}>Close</button>
  </> : now === 'credential' && role && anchor && authority ? <>
   <h3>The credential this role hangs on.</h3>
   <p className="muted">{anchor.detail}. It is checked here for shape only — the format the issuing body actually uses — and never sent anywhere.</p>
   {authority.pattern ? <>
    <label>{anchor.name} number
     <input value={credential} onChange={e => { setCredential(e.target.value.toUpperCase()); setTouched(true); }} onBlur={() => setTouched(true)} placeholder={authority.format} aria-describedby="credential-help" aria-invalid={touched && !result.ok}/>
    </label>
    <p className="helper" id="credential-help" role="status">{touched && !result.ok ? result.reason : `${authority.name} · ${authority.format}. For example ${authority.example}.`}</p>
   </> : <EmptyNote>{authority.hint} There is nothing for you to type at this step.</EmptyNote>}
   <div className="privacy-note"><ShieldCheck size={19}/>{role.grants[0].refusal}</div>
   <div className="button-row"><button className="secondary" onClick={back}><ArrowLeft size={16}/>Back</button>
    <button className="primary" disabled={!!authority.pattern && !result.ok} onClick={next}>Continue<ArrowRight size={16}/></button></div>
  </> : now === 'scope' && role ? <>
   <h3>What are you applying to do?</h3>
   <fieldset className="chip-set"><legend>{scopeFor(role.id)!.label} you are applying for</legend>{scopeFor(role.id)!.options.map(s =>
    <label key={s} className={scope.includes(s) ? 'chip selected' : 'chip'}><input type="checkbox" checked={scope.includes(s)} onChange={e => setScope(e.target.checked ? [...scope, s] : scope.filter(x => x !== s))}/>{s}</label>)}</fieldset>
   <div className="privacy-note"><ShieldCheck size={19}/>{scopeFor(role.id)!.note}</div>
   <div className="button-row"><button className="secondary" onClick={back}><ArrowLeft size={16}/>Back</button>
    <button className="primary" disabled={!scope.length} onClick={next}>Continue<ArrowRight size={16}/></button></div>
  </> : now === 'evidence' && role ? <>
   <h3>What we will ask for.</h3>
   <Progress passed={ready.length} total={role.checks.length}/>
   <p className="helper" role="status">{ready.length} of {role.checks.length} documents marked ready. You cannot start until every check passes, and passing is not something you can do for yourself.</p>
   {role.checks.map(check => {
    const issuer = authorityById(check.authority)!;
    return <div className="record-row static" key={check.id}>
     <span className={`service-icon ${ready.includes(check.id) ? 'check-verified' : 'check-outstanding'}`}><ClipboardList size={20}/></span>
     <span>
      <strong>{check.name}{check.risk === 'high' && <span className="required-mark">Two reviewers</span>}</strong>
      <small>{check.detail}</small>
      <small>Bring: {check.evidence} · verified with {issuer.name} · {check.renewMonths ? `renewed every ${check.renewMonths} months` : 'checked once'}</small>
     </span>
     <label className="checkbox"><input type="checkbox" checked={ready.includes(check.id)} onChange={e => setReady(e.target.checked ? [...ready, check.id] : ready.filter(x => x !== check.id))} aria-label={`I have ${check.evidence} to hand`}/><span/></label>
    </div>;
   })}
   <div className="privacy-note"><CircleAlert size={19}/>Nothing is uploaded from this screen. A certified copy of your identity document is not something to leave sitting in a browser.</div>
   <div className="button-row"><button className="secondary" onClick={back}><ArrowLeft size={16}/>Back</button>
    <button className="primary" onClick={next}>Continue<ArrowRight size={16}/></button></div>
  </> : now === 'declarations' && role ? <>
   <h3>Three things to declare.</h3>
   <p className="muted">A declaration is not a check. Each of these is verified independently, and a declaration that turns out to be untrue ends the application on its own.</p>
   {declarations.map(d => <label className="checkbox" key={d}><input type="checkbox" checked={agreed.includes(d)} onChange={e => setAgreed(e.target.checked ? [...agreed, d] : agreed.filter(x => x !== d))}/><span>{d}</span></label>)}
   <div className="button-row"><button className="secondary" onClick={back}><ArrowLeft size={16}/>Back</button>
    <button className="primary" disabled={agreed.length < declarations.length} onClick={next}>Continue<ArrowRight size={16}/></button></div>
  </> : role ? <>
   <h3>Before you send it.</h3>
   <div className="review-line"><span>Applying as</span><strong>{role.name}</strong></div>
   <div className="review-line"><span>{anchor?.name}</span><strong>{credential || 'Held by MyThuso'}</strong></div>
   {scopeFor(role.id) && <div className="review-line"><span>Scope</span><strong>{scope.join(' · ')}</strong></div>}
   <div className="review-line"><span>Checks to pass</span><strong>{role.checks.length}</strong></div>
   <SectionTitle title="What you are refused until they do"/>
   {role.grants.map(g => <div className="record-row static" key={g.capability}>
    <span className="service-icon check-outstanding"><ShieldX size={20}/></span>
    <span><strong>{capabilityById(g.capability)?.name}</strong><small>{g.refusal}</small></span>
   </div>)}
   <label className="checkbox"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)}/><span>I confirm the information above is true and I will report any change to my registration, clearance or health status.</span></label>
   <div className="privacy-note"><ShieldCheck size={19}/>{role.id === 'nurse' || role.id === 'locum'
    ? 'Re-vetting runs on a schedule, not once at sign-up. A lapsed SANC registration or police clearance removes a nurse from dispatch automatically, without anyone here having to notice.'
    : 'Re-vetting runs on a schedule, not once at sign-up. A lapsed registration, licence or clearance withdraws this role’s permissions automatically, without anyone here having to notice.'}</div>
   <div className="button-row"><button className="secondary" onClick={back}><ArrowLeft size={16}/>Back</button>
    <button className="primary" disabled={!attested} onClick={() => setSent(true)}><Check size={16}/>Submit application</button></div>
  </> : null}
 </div>;
}
