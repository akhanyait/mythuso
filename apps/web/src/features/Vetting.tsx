import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CircleAlert, ClipboardList, RotateCcw, ScrollText, ShieldCheck, ShieldX, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Select, Tab, TabsList, Textarea, type BadgeVariant } from '../ui';
import { OfficeFacts, OfficeFigure, OfficeHead, OfficeNote, OfficeProgress, OfficeSection } from '../surface/Office';
import { StepHead } from '../components/Steps';
import { EmptyState } from '../components/States';
import { NotConnected } from '../components/NotConnected';
import { useT } from '../lib/i18n';
import {
 authorityById, capabilityById, checkById, checkStateLabels, daysUntil, decisions, eventLabels, formatDate, formatEventTime, gateProgress, scopeFor,
 inMonths, isoDate, needsSecondReviewer, recordEvent, recordFor, roleById, roles, subjectStatusLabels, summarise, today, validateCredential,
 type CheckRecord, type CheckState, type SubjectStatus, type VettingCheck, type VettingEvent, type VettingEventKind, type VettingSubject
} from '../lib/vetting';
import { seededLog, seededSubjects, subjectById } from '../lib/vetting-fixtures';
import { ComplaintsQueue, ShiftStartsBoard, complaintsHeading } from './VerifyInService';

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
/* A vetting figure is the office figure: the number, what it is, and the sentence saying what it is
   measured against — "4" means nothing beside "Suspended or declined", and everything about whether it
   is a problem is in "lapsed automatically, or declined with a reason". */
const Figure = OfficeFigure;

/* ---- One arc per party ---------------------------------------------------------------------
 *
 * The register, drawn from the register. Every arc on the ring below is one of the parties in the
 * list under it and the lit ones are the ones the figure counts, so a reader who distrusts the
 * drawing can count the rows and a reader who distrusts the numeral can count the arcs. Nothing
 * here introduces a number. Lit is the progress colour, which is what aqua is for in this identity.
 *
 * Turns rather than degrees, clockwise from twelve, because every arc in here is "this many of that
 * many" and a fraction of a circle is what that means.
 */
const TAU = Math.PI * 2;
const at = (r: number, turn: number): [number, number] => [50 + r * Math.sin(turn * TAU), 50 - r * Math.cos(turn * TAU)];
const arc = (r: number, from: number, to: number) => {
 const [x1, y1] = at(r, from), [x2, y2] = at(r, to);
 return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
function Ring({ segments }: { segments: readonly boolean[] }) {
 const count = Math.max(segments.length, 1);
 const step = 1 / count;
 /* Wide enough to count the arcs across and never wider than a third of one — a ring of thirty-two
    parties must not dissolve into a dotted line. Butt caps, because a round cap grows half a stroke
    past each end of its arc and closes the gap it was drawn beside. */
 const gap = Math.min(0.02, step / 3);
 return <svg className="oi-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <circle className="oi-ring__track" cx="50" cy="50" r="39"/>
  {segments.map((on, i) => <path key={i} className={`oi-ring__arc${on ? ' is-on' : ''}`} d={arc(39, i * step + gap / 2, (i + 1) * step - gap / 2)}/>)}
 </svg>;
}
/* A state is a Badge in words. Verified is the success tint, lapsed and declined the danger one, and
   everything still moving the warning tint — never colour alone, because the word is on the badge. */
const stateBadge = (state: CheckState): BadgeVariant => state === 'verified' ? 'success' : state === 'lapsed' || state === 'declined' ? 'danger' : state === 'outstanding' ? 'neutral' : 'warning';
const statusBadge = (status: SubjectStatus): BadgeVariant => status === 'cleared' ? 'success' : status === 'suspended' || status === 'declined' ? 'danger' : 'warning';
function Progress({ passed, total }: { passed: number; total: number }) {
 return <OfficeProgress part={passed} whole={total} label={`${passed} of ${total} checks passing`}/>;
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
 const id = useId();
 return <div className="oi-stack reason-form">
  <Field label={label} htmlFor={id} hint={hint}><Textarea id={id} autoFocus value={reason} onChange={e => setReason(e.target.value.slice(0, 400))} placeholder="In your own words, for the party and for the record…"/></Field>
  <div className="oi-actions">
   <Button variant="secondary" onClick={onCancel}>Cancel</Button>
   <Button variant="primary" disabled={reason.trim().length < 10} onClick={() => onConfirm(reason.trim())} leadingIcon={<Check aria-hidden="true"/>}>{confirm}</Button>
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
/* `vetting` is optional so the merged portal can hand in the state it holds above every category — a
   nurse suspended here has to be refused on the Dispatch board the portal draws in another category,
   exactly as the back office held it above its tabs. The Control Tower workspace keeps its own. */
export function VettingQueue({ open, vetting: shared }: { open: (s: string) => void; vetting?: VettingState }) {
 const own = useVettingState();
 const vetting = shared ?? own;
 return <>
  <OfficeHead eyebrow="Control Tower" title="Vetting queue" lead="Every applicant, the state of each check, and the decision that either clears somebody for dispatch or refuses it in writing."/>
  <VettingConsole vetting={vetting} open={open}/>
  {/* Who started a shift today, and that nobody's face was matched. The desk reads it here beside the register. */}
  <ShiftStartsBoard/>
 </>;
}

/* ---- The reviewer console ---------------------------------------------------------------- */
type View = 'queue' | 'renewals' | 'audit' | 'complaints';
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
 const views: [View, string][] = [['queue', t('vetting.queue')], ['renewals', t('vetting.renewals')], ['audit', t('vetting.audit')], ['complaints', complaintsHeading]];
 /* One arc per party on the register, lit for the ones that are cleared today. It is the same list
    the column below draws, in the same order, so the ring cannot drift from the rows. */
 const clearedArcs = subjects.map(s => { const status = summarise(s).status; return status === 'cleared' || status === 'expiring'; });
 return <div className="oi-screen oi-vetting">
  {/* The state of the register, on white. It used to be one night-coloured deck above paperwork; the
      handoff draws a console as figures on cards, and the figures are the same counts of the same rows. */}
  <section className="oi-section" aria-label="The register, and what it owes today">
   <div className="oi-section-head"><p className="oi-eyebrow">The register</p>
    <p className="oi-section-note">{subjects.length} parties, {roles.length} roles. Every figure is a count of the rows below it.</p></div>
   <NotConnected of="credential-verification"/>
   <div className="oi-figures">
    <Figure lead label="Cleared" value={String((counts.cleared ?? 0) + (counts.expiring ?? 0))} note={`${counts.expiring ?? 0} of them with a renewal due`}
     visual={<Ring segments={clearedArcs}/>}/>
    <Figure label="In progress" value={String(counts['in-progress'] ?? 0)} note="Refused the work of the role until every check passes"/>
    <Figure label="Awaiting a second reviewer" value={String(counts.awaiting ?? 0)} note="One reviewer is never enough on a high-risk check" flagged={!!(counts.awaiting)}/>
    {/* Not flagged, and the one beside it is. A flag means "this one", so two of them on one row of
        figures point at nothing: a party awaiting a second reviewer is work this console owes today,
        and a suspension is a settled state that the register is already refusing on. */}
    <Figure label="Suspended or declined" value={String((counts.suspended ?? 0) + (counts.declined ?? 0))} note="Lapsed automatically, or declined with a reason"/>
   </div>
  </section>
  <div className="oi-vetting-bar">
   <TabsList aria-label={t('vetting.views')}>
    {views.map(([id, label]) => <Tab key={id} active={view === id} onClick={() => setView(id)}>{label}</Tab>)}
   </TabsList>
   <Field label={t('vetting.reviewer')} htmlFor="vetting-reviewer" className="oi-inline-field">
    <Select id="vetting-reviewer" value={reviewer} onChange={e => setReviewer(e.target.value)}>{reviewers.map(r => <option key={r}>{r}</option>)}</Select>
   </Field>
   <Button variant="secondary" onClick={() => open('Vetting application')} leadingIcon={<ClipboardList aria-hidden="true"/>}>{t('vetting.apply')}</Button>
  </div>
  <p className="oi-help" role="status">Acting as {reviewer}. Decisions are attributed to this name, and a high-risk check needs a second one.</p>
  {view === 'queue' ? <>
   <div className="oi-form-row">
    <Field label={t('vetting.role')} htmlFor="vetting-role"><Select id="vetting-role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
     <option value="all">{t('vetting.allRoles')}</option>
     {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </Select></Field>
    <Field label={t('vetting.status')} htmlFor="vetting-status"><Select id="vetting-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | SubjectStatus)}>
     <option value="all">{t('vetting.allStatuses')}</option>
     {(Object.keys(subjectStatusLabels) as SubjectStatus[]).map(s => <option key={s} value={s}>{subjectStatusLabels[s]}</option>)}
    </Select></Field>
   </div>
   {rows.length ? <div className="oi-split vetting-grid">
     <Card className="oi-register">
      <CardHeader className="oi-card-head"><CardTitle>{t('vetting.parties')}</CardTitle><Badge>{rows.length} of {subjects.length}</Badge></CardHeader>
      <div className="oi-rows">{rows.map(({ subject, summary }) => <button type="button" className="oi-row vetting-party" key={subject.id} aria-pressed={shown?.subject.id === subject.id} onClick={() => setSelected(subject.id)}>
       <span className="oi-row__body">
        <span className="oi-row__title">{subject.name}</span>
        <span className="oi-row__meta">{roleById(subject.roleId)?.name} · {subject.reference}{subject.zone ? ` · ${subject.zone}` : ''}</span>
        <Progress passed={summary.passed} total={summary.total}/>
        <span className="oi-row__meta">{summary.passed} of {summary.total} checks passing{summary.nextDue ? ` · ${summary.nextDue.check.name} ${dueWording(summary.nextDue.days)}` : ''}</span>
       </span>
       <span className="oi-row__aside"><Badge variant={statusBadge(summary.status)}>{subjectStatusLabels[summary.status]}</Badge></span>
      </button>)}</div>
     </Card>
     {shown && <SubjectDetail key={shown.subject.id} subject={shown.subject} vetting={vetting}/>}
    </div> : <EmptyState title="Nobody matches those filters" body="Widen the role or the status to see the rest of the queue. Nothing has been hidden from you."/>}
  </> : view === 'renewals' ? <RenewalsDue subjects={subjects} onOpen={id => { setSelected(id); setView('queue'); setRoleFilter('all'); setStatusFilter('all'); }}/> : view === 'complaints' ? <ComplaintsQueue/> : <AuditTrail log={log}/>}
 </div>;
}

function SubjectDetail({ subject, vetting }: { subject: VettingSubject; vetting: VettingState }) {
 const [declining, setDeclining] = useState('');
 const [action, setAction] = useState<'' | 'suspend' | 'appeal'>('');
 const summary = summarise(subject);
 const progress = gateProgress(subject);
 const role = roleById(subject.roleId)!;
 const anchor = anchorFor(subject.roleId);
 /* The party's name at the size of a name, the role as its eyebrow, and the standing as a chip that
    carries its own word. Nothing else is a header chip — a scope of practice is a fact about what
    somebody may do and belongs in the record below, and a protected category is never a chip on
    anybody's header at all: it appears once, in the table of what the checks refuse, where it is a
    capability being decided rather than a label somebody reads first. */
 return <Card className="oi-subject">
  <CardHeader className="oi-card-head">
   <div><p className="oi-eyebrow">{role.name}</p><h2 className="oi-title oi-subject__name">{subject.name}</h2></div>
   <Badge variant={statusBadge(summary.status)}>{subjectStatusLabels[summary.status]}</Badge>
  </CardHeader>
  <CardContent className="oi-card-body">
   <div className="oi-stack">
    <p className="oi-meter"><strong>{summary.passed}</strong> of {summary.total} checks passing</p>
    <Progress passed={summary.passed} total={summary.total}/>
   </div>
   <dl className="oi-facts">
    <div><dt>Credential</dt><dd>{subject.reference}</dd></div>
    {subject.zone ? <div><dt>Area</dt><dd>{subject.zone}</dd></div> : null}
    {subject.scope?.length ? <div><dt>Scope</dt><dd>{subject.scope.join(' · ')}</dd></div> : null}
    {/* Where the party stands among the seven gates, computed from the checks below rather than
        stored. A fail rule is shown in the contract's own words; a suspension or a decline is already
        said in the line under this and is not said twice. */}
    <div className="gate-progress" data-gate={progress.at.id}><dt>Onboarding</dt><dd className={progress.activated ? '' : 'is-refused'}>{progress.status}</dd></div>
   </dl>
   <p className="oi-help" role="status">
    {summary.lapsed.length ? `${summary.lapsed.map(l => l.check.name).join(' and ')} lapsed. This party was removed from the work of the role automatically.`
     : summary.awaitingSecond.length ? `${summary.awaitingSecond.map(a => a.check.name).join(' and ')} is waiting on a second reviewer.`
      : summary.status === 'declined' ? subject.declinedReason ?? 'A check was declined with a reason.'
       : summary.status === 'suspended' ? subject.suspendedReason ?? 'Suspended by a reviewer.'
        : summary.blocking.length ? `${summary.blocking.length} check${summary.blocking.length === 1 ? '' : 's'} outstanding.`
         : summary.expiring.length ? `Cleared, with ${summary.expiring.length} renewal${summary.expiring.length === 1 ? '' : 's'} due.` : 'Every check passed and in date.'}
   </p>
   {(progress.outcome === 'stopped' || progress.outcome === 'failed' || progress.outcome === 'held') && <p className="oi-refusal gate-rule">{progress.sentence}</p>}
   <div className="oi-actions">
    {subject.suspended ? <Button variant="secondary" onClick={() => vetting.restore(subject)} leadingIcon={<RotateCcw aria-hidden="true"/>}>Lift the suspension</Button>
     : <Button variant="secondary" onClick={() => setAction(action === 'suspend' ? '' : 'suspend')} leadingIcon={<ShieldX aria-hidden="true"/>}>Suspend</Button>}
    <Button variant="secondary" onClick={() => setAction(action === 'appeal' ? '' : 'appeal')} disabled={subject.appealed} leadingIcon={<ScrollText aria-hidden="true"/>}>{subject.appealed ? 'Appeal recorded' : 'Record an appeal'}</Button>
   </div>
   {action === 'suspend' && <ReasonForm label="Why this party is suspended" hint="A suspension without a written reason is not reviewable, and cannot be appealed. Ten characters at least." confirm="Suspend"
    onConfirm={reason => { vetting.suspend(subject, reason); setAction(''); }} onCancel={() => setAction('')}/>}
   {action === 'appeal' && <ReasonForm label="What the party says" hint="Recorded in their words, not yours. It changes nothing on its own — a check still has to be decided again." confirm="Record the appeal"
    onConfirm={note => { vetting.appeal(subject, note); setAction(''); }} onCancel={() => setAction('')}/>}
   <h3 className="oi-subtitle">Checks</h3>
  </CardContent>
  <div className="oi-rows">{summary.states.map(({ check, state }) => {
   const record = recordFor(subject, check.id);
   const authority = authorityById(check.authority)!;
   const second = needsSecondReviewer(subject, check.id);
   const ownDecision = record.decidedBy === vetting.reviewer;
   const lapsed = daysUntil(record.expiresOn) !== null && daysUntil(record.expiresOn)! < 0;
   return <div className={`oi-row vetting-check${anchor?.id === check.id ? ' is-anchor' : ''}`} key={check.id}>
    <div className="oi-row__body">
     <p className="oi-row__title">{check.name}{check.risk === 'high' && <> <Badge size="sm" variant="neutral">High risk</Badge></>}</p>
     <span className="oi-row__meta">{check.detail}</span>
     <span className="oi-row__meta">{authority.name} ({authority.short}) · {check.evidence} · {check.renewMonths ? `renews every ${check.renewMonths} months` : 'does not renew'}</span>
     <span className="oi-row__meta">{record.decidedBy ? `Decided by ${record.decidedBy} on ${formatDate(record.decidedOn)}` : 'No decision recorded'}{record.secondedBy ? ` · seconded by ${record.secondedBy}` : ''}</span>
     <span className={`oi-row__meta${lapsed ? ' oi-row__meta--refusal' : ''}`}>{expiryLine(check, record)}</span>
     {second && <span className="oi-row__meta oi-row__meta--refusal" role="status">Verified by {record.decidedBy}. It does not count until a different reviewer agrees.</span>}
     {record.note && <span className="oi-row__meta">“{record.note}”</span>}
    </div>
    <div className="oi-row__aside"><Badge variant={second ? 'warning' : stateBadge(state)}>{second ? 'Awaiting a second reviewer' : checkStateLabels[state]}</Badge></div>
    <div className="oi-row__actions">
     {second ? <Button variant="primary" disabled={ownDecision} onClick={() => vetting.second(subject, check.id)} title={ownDecision ? 'You took the first decision on this check.' : undefined} leadingIcon={<UserRoundCheck aria-hidden="true"/>}>
      {ownDecision ? 'You decided this' : 'Second it'}</Button>
      : state === 'lapsed' || state === 'expiring' ? <Button variant="primary" onClick={() => vetting.renew(subject, check.id)} leadingIcon={<RotateCcw aria-hidden="true"/>}>Record a renewal</Button>
       : state !== 'verified' && <Button variant="primary" onClick={() => vetting.verify(subject, check.id)} leadingIcon={<Check aria-hidden="true"/>}>Verify</Button>}
     <Button variant="ghost" onClick={() => setDeclining(declining === check.id ? '' : check.id)} leadingIcon={<UserRoundX aria-hidden="true"/>}>Decline</Button>
    </div>
    {declining === check.id && <div className="oi-row__actions"><ReasonForm label={`Why ${check.name} is declined`} hint="The party is told this sentence. Write it for them, not for the file. Ten characters at least." confirm="Decline this check"
     onConfirm={reason => { vetting.decline(subject, check.id, reason); setDeclining(''); }} onCancel={() => setDeclining('')}/></div>}
   </div>;
  })}</div>
  <CardContent className="oi-card-body">
   {summary.awaitingSecond.length > 0 && <OfficeNote icon={<Users aria-hidden="true"/>}>A high-risk check verified by one person is not verified. Switch the reviewer above and second it as somebody else — the console refuses to let one name do both.</OfficeNote>}
   <h3 className="oi-subtitle">What this party is refused</h3>
  </CardContent>
  <div className="oi-table-wrap"><table className="oi-table">
   <caption>Driven by the checks above. Change a decision and this table changes with it.</caption>
   <thead><tr><th scope="col">Capability</th><th scope="col">Answer</th><th scope="col">Reason</th></tr></thead>
   <tbody>{decisions(subject).map(d => <tr key={d.capability.id} className={d.decision.allowed ? '' : 'is-flagged'}>
    <th scope="row">{d.capability.name}</th>
    <td className={d.decision.allowed ? '' : 'is-refused'}>{d.decision.allowed ? 'Allowed' : 'Refused'}</td>
    <td>{d.decision.allowed ? d.capability.detail : d.decision.reason}</td>
   </tr>)}</tbody>
  </table></div>
 </Card>;
}

/* ---- Renewals ----------------------------------------------------------------------------- */
function RenewalsDue({ subjects, onOpen }: { subjects: VettingSubject[]; onOpen: (id: string) => void }) {
 const due = subjects
  .map(s => ({ subject: s, summary: summarise(s) }))
  .filter(r => r.summary.nextDue)
  .sort((a, b) => a.summary.nextDue!.days - b.summary.nextDue!.days);
 const lapsed = due.filter(r => r.summary.nextDue!.days < 0);
 return <div className="oi-screen">
  <div className="oi-figures">
   <Figure label="Already lapsed" value={String(lapsed.length)} note="Suspended without anyone here having to notice" flagged={!!(lapsed.length)}/>
   <Figure label="Due within 45 days" value={String(due.filter(r => r.summary.nextDue!.days >= 0 && r.summary.nextDue!.days <= 45).length)} note="Still working today, and told about it"/>
   <Figure label="On the renewal schedule" value={String(due.length)} note="Every check with a renewal cadence"/>
  </div>
  <OfficeSection title="Sorted by what expires first">
   <Card>
    {due.length ? <div className="oi-rows">{due.map(({ subject, summary }) => <button type="button" className="oi-row" key={subject.id} onClick={() => onOpen(subject.id)}>
     <span className="oi-row__body">
      <span className="oi-row__title">{subject.name}</span>
      <span className="oi-row__meta">{roleById(subject.roleId)?.name} · {summary.nextDue!.check.name} · renews every {summary.nextDue!.check.renewMonths} months</span>
      <span className="oi-row__meta cap-first">{dueWording(summary.nextDue!.days)} · {formatDate(recordFor(subject, summary.nextDue!.check.id).expiresOn)}</span>
     </span>
     <span className="oi-row__aside"><Badge variant={summary.nextDue!.days < 0 ? 'danger' : summary.nextDue!.days <= 45 ? 'warning' : 'success'}>{summary.nextDue!.days < 0 ? 'Lapsed' : `${summary.nextDue!.days} days`}</Badge></span>
    </button>)}</div>
    : <CardContent><EmptyState title="Nothing on the renewal schedule" body="Every check held for these parties is one that does not expire."/></CardContent>}
   </Card>
   <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>Re-vetting runs on a schedule, not once at sign-up. A lapsed SANC registration or police clearance removes a nurse from dispatch automatically, without anyone here having to notice. Nothing on this screen runs on a timer — a lapse is arithmetic against the expiry date, recomputed every time the screen is drawn, which is why it cannot be missed.</OfficeNote>
  </OfficeSection>
 </div>;
}

/* ---- The append-only audit ---------------------------------------------------------------- */
function AuditTrail({ log }: { log: VettingEvent[] }) {
 const [kind, setKind] = useState<'all' | VettingEventKind>('all');
 const shown = log.filter(e => kind === 'all' || e.kind === kind);
 return <div className="oi-screen">
  <div className="oi-vetting-bar">
   <Field label="Event" htmlFor="vetting-event-kind" className="oi-inline-field">
    <Select id="vetting-event-kind" value={kind} onChange={e => setKind(e.target.value as 'all' | VettingEventKind)}>
     <option value="all">Every event</option>
     {(Object.keys(eventLabels) as VettingEventKind[]).map(k => <option key={k} value={k}>{eventLabels[k]}</option>)}
    </Select>
   </Field>
   <Badge>{log.length} entries</Badge>
  </div>
  <Card>
   {shown.length ? <ol className="oi-rows">{shown.map(event => <li key={event.id}><div className="oi-row vetting-event">
    <div className="oi-row__body">
     <p className="oi-row__title">{eventLabels[event.kind]} · {event.subjectName}</p>
     <span className="oi-row__meta">{event.id} · {formatEventTime(event.at)} · {roleById(event.roleId)?.name}{event.checkId ? ` · ${checkById(event.roleId, event.checkId)?.name}` : ''}</span>
     <span className="oi-row__meta">By {event.actor}{event.evidence ? ` · evidence: ${event.evidence}` : ''}</span>
     {event.note && <span className="oi-row__meta">“{event.note}”</span>}
    </div>
    <div className="oi-row__aside"><Badge variant={eventBadge(event.kind)}>{eventLabels[event.kind]}</Badge></div>
   </div></li>)}</ol>
   : <CardContent><EmptyState title="No entries of that kind" body="The log holds every decision taken in this console since it was opened, plus the history it started with."/></CardContent>}
  </Card>
  <OfficeNote icon={<ScrollText aria-hidden="true"/>}>Entries are only ever added to the top of this list. Nothing in this console edits one, deletes one or reorders them — there is no button for it, because a decision log you can tidy up is not a decision log. What is missing is the part that matters: a server-side record with integrity protection that a person with database access still cannot rewrite.</OfficeNote>
 </div>;
}
const eventBadge = (kind: VettingEventKind): BadgeVariant => kind === 'verified' || kind === 'seconded' || kind === 'renewed' || kind === 'restored' ? 'success'
 : kind === 'declined' || kind === 'suspended' || kind === 'lapsed' ? 'danger' : 'neutral';

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
 /* The fictional applicant whose checks this preview shows the state of. The nurse the workspace is
    signed in as, so an applicant reading it recognises the record as hers rather than somebody
    else's; any other role falls back to the first party on that role's register. */
 const standingSubject = chosen === 'nurse' ? 'N-205' : seededSubjects.find(s => s.roleId === chosen)?.id ?? 'N-205';
 /* Submitting used to end here, on one sentence and a Close button, and coming back to this screen
    started the five steps again from the beginning — so an applicant had no way to find out where
    anything stood. The honesty stays exactly as it was; what follows it is the state of the same
    fictional applicant's checks, which the Control Tower could already see and she could not. */
 if (sent) return <div className="oi-screen">
  <div className="oi-stack">
   <h3 className="oi-section-title oi-with-mark"><BadgeCheck aria-hidden="true"/>Nothing was submitted.</h3>
   <p className="oi-help">The shape of the real thing: {role?.checks.length} checks, each with an issuing authority, an evidence requirement and a renewal date, decided by a named reviewer and — where the risk is high — a second one.</p>
  </div>
  <ApplicationStanding subjectId={standingSubject}/>
  <div className="oi-actions"><Button variant="secondary" onClick={() => { setSent(false); setStep(0); }} leadingIcon={<ArrowLeft aria-hidden="true"/>}>Walk it again</Button>
   <Button variant="primary" onClick={onClose} trailingIcon={<ArrowRight aria-hidden="true"/>}>Close</Button></div>
 </div>;
 /* Three facts the contract already holds, and the applicant is the party with the most at stake and
    the least information — so they are the first thing on the screen rather than something found on
    step four. The ring has one arc per check and lights the ones she has marked a document ready
    for, which is the only thing on this screen she can move. */
 const highRisk = role ? role.checks.filter(c => c.risk === 'high').length : 0;
 const back = () => step > 0 ? setStep(step - 1) : onClose();
 const next = () => setStep(step + 1);
 const nav = (ready: boolean, last = false) => <div className="oi-actions">
  <Button variant="secondary" onClick={back} leadingIcon={<ArrowLeft aria-hidden="true"/>}>Back</Button>
  {/* `primary` is the name the applicant walk in tests/flow-closures.spec.ts finds the way on by; the office
      sheet takes the legacy look it carries back off it. */}
  {last ? <Button variant="primary" className="primary" disabled={!ready} onClick={() => setSent(true)} leadingIcon={<Check aria-hidden="true"/>}>Submit application</Button>
   : <Button variant="primary" className="primary" disabled={!ready} onClick={next} trailingIcon={<ArrowRight aria-hidden="true"/>}>Continue</Button>}
 </div>;
 return <div className="oi-screen oi-apply">
  <OfficeHead eyebrow={role ? `Applying as ${role.name}` : 'Applying'} title="Vetting"
   lead={role ? `${role.checks.length} checks stand between this form and a patient’s front door. ${role.summary}` : 'Thirteen parties are vetted here, and not one of them is only a nurse. Each one is refused something specific until its own checks pass.'}/>
  <NotConnected of="credential-verification"/>
  {role && <div className="oi-figures">
   <Figure label="Checks to pass" value={String(role.checks.length)} note={`${ready.length} of ${role.checks.length} documents marked ready`} visual={<Ring segments={role.checks.map(c => ready.includes(c.id))}/>}/>
   <Figure label="Decided by two reviewers" value={String(highRisk)} note="Where one judgement is not enough"/>
   <Figure label="Refused until they pass" value={String(role.grants.length)} note={`${role.grants.length === 1 ? 'One thing' : 'Things'} this role cannot do until every check is verified`}/>
  </div>}
  <p className="oi-help">Nothing on this screen is submitted, uploaded or sent. Passing is not something you can do for yourself.</p>
  {steps.length > 1 && <StepHead step={Math.min(step, steps.length - 1) + 1} total={steps.length} label={stepLabels[now]}/>}
  <Card padding="md" className="oi-card-body">{now === 'role' ? <>
   <h3 className="oi-section-title">Who is applying?</h3>
   <p className="oi-help">Thirteen parties are vetted, not only nurses. Each one is refused something specific until its checks pass.</p>
   <div className="oi-rows oi-rows--flush">{roles.map(r => <button type="button" className="oi-row" key={r.id} aria-pressed={chosen === r.id} onClick={() => { setChosen(r.id); setCredential(''); setTouched(false); setScope([]); setReady([]); setStep(1); }}>
    <span className="oi-row__body"><span className="oi-row__title">{r.name}</span><span className="oi-row__meta">{r.summary}</span><span className="oi-row__meta">{r.checks.length} checks · {r.grants.length} thing{r.grants.length === 1 ? '' : 's'} it is refused until they pass</span></span>
    <span className="oi-row__aside"><ArrowRight aria-hidden="true" className="oi-row__go"/></span>
   </button>)}</div>
   <Button variant="secondary" className="oi-full" onClick={onClose}>Close</Button>
  </> : now === 'credential' && role && anchor && authority ? <>
   <h3 className="oi-section-title">The credential this role hangs on.</h3>
   <p className="oi-help">{anchor.detail}. It is checked here for shape only — the format the issuing body actually uses — and never sent anywhere.</p>
   {authority.pattern
    ? <Field label={`${anchor.name} number`} htmlFor="credential" hint={`${authority.name} · ${authority.format}. For example ${authority.example}.`} error={touched && !result.ok ? result.reason : undefined}>
       <Input id="credential" value={credential} onChange={e => { setCredential(e.target.value.toUpperCase()); setTouched(true); }} onBlur={() => setTouched(true)} placeholder={authority.format}/>
      </Field>
    : <OfficeNote icon={<ClipboardList aria-hidden="true"/>}>{authority.hint} There is nothing for you to type at this step.</OfficeNote>}
   <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>{role.grants[0].refusal}</OfficeNote>
   {nav(!authority.pattern || result.ok)}
  </> : now === 'scope' && role ? <>
   <h3 className="oi-section-title">What are you applying to do?</h3>
   <fieldset className="oi-choices"><legend>{scopeFor(role.id)!.label} you are applying for</legend>{scopeFor(role.id)!.options.map(s =>
    <Checkbox key={s} label={s} checked={scope.includes(s)} onChange={e => setScope(e.target.checked ? [...scope, s] : scope.filter(x => x !== s))}/>)}</fieldset>
   <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>{scopeFor(role.id)!.note}</OfficeNote>
   {nav(scope.length > 0)}
  </> : now === 'evidence' && role ? <>
   <h3 className="oi-section-title">What we will ask for.</h3>
   <Progress passed={ready.length} total={role.checks.length}/>
   <p className="oi-help" role="status">{ready.length} of {role.checks.length} documents marked ready. You cannot start until every check passes, and passing is not something you can do for yourself.</p>
   <div className="oi-rows oi-rows--flush">{role.checks.map(check => {
    const issuer = authorityById(check.authority)!;
    return <div className="oi-row" key={check.id}>
     <div className="oi-row__body">
      <p className="oi-row__title">{check.name}{check.risk === 'high' && <> <Badge size="sm">Two reviewers</Badge></>}</p>
      <span className="oi-row__meta">{check.detail}</span>
      <span className="oi-row__meta">Bring: {check.evidence} · verified with {issuer.name} · {check.renewMonths ? `renewed every ${check.renewMonths} months` : 'checked once'}</span>
     </div>
     <div className="oi-row__aside"><Checkbox checked={ready.includes(check.id)} onChange={e => setReady(e.target.checked ? [...ready, check.id] : ready.filter(x => x !== check.id))} aria-label={`I have ${check.evidence} to hand`}/></div>
    </div>;
   })}</div>
   <OfficeNote icon={<CircleAlert aria-hidden="true"/>}>Nothing is uploaded from this screen. A certified copy of your identity document is not something to leave sitting in a browser.</OfficeNote>
   {nav(true)}
  </> : now === 'declarations' && role ? <>
   <h3 className="oi-section-title">Three things to declare.</h3>
   <p className="oi-help">A declaration is not a check. Each of these is verified independently, and a declaration that turns out to be untrue ends the application on its own.</p>
   <div className="oi-choices">{declarations.map(d => <Checkbox key={d} label={d} checked={agreed.includes(d)} onChange={e => setAgreed(e.target.checked ? [...agreed, d] : agreed.filter(x => x !== d))}/>)}</div>
   {nav(agreed.length >= declarations.length)}
  </> : role ? <>
   <h3 className="oi-section-title">Before you send it.</h3>
   <OfficeFacts facts={[
    ['Applying as', role.name],
    [anchor?.name, credential || 'Held by MyThuso'],
    scopeFor(role.id) ? ['Scope', scope.join(' · ')] : null,
    ['Checks to pass', role.checks.length]
   ]}/>
   <h4 className="oi-subtitle">What you are refused until they do</h4>
   <div className="oi-rows oi-rows--flush">{role.grants.map(g => <div className="oi-row" key={g.capability}>
    <div className="oi-row__body"><p className="oi-row__title">{capabilityById(g.capability)?.name}</p><span className="oi-row__meta">{g.refusal}</span></div>
    <div className="oi-row__aside"><Badge variant="danger">Refused</Badge></div>
   </div>)}</div>
   <Checkbox checked={attested} onChange={e => setAttested(e.target.checked)} label="I confirm the information above is true and I will report any change to my registration, clearance or health status."/>
   <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>{role.id === 'nurse' || role.id === 'locum'
    ? 'Re-vetting runs on a schedule, not once at sign-up. A lapsed SANC registration or police clearance removes a nurse from dispatch automatically, without anyone here having to notice.'
    : 'Re-vetting runs on a schedule, not once at sign-up. A lapsed registration, licence or clearance withdraws this role’s permissions automatically, without anyone here having to notice.'}</OfficeNote>
   {nav(attested, true)}
  </> : null}</Card>
 </div>;
}

/* ---- Where an application stands ---------------------------------------------------------------
 *
 * The five-step application ended at "Nothing was submitted" and stopped, and the audit's row was
 * that an applicant has nowhere to go back to: only the Control Tower and the back office could see
 * the state of a set of checks, and the person the checks are about could not. That asymmetry is
 * the ordinary shape of vetting and it is worth refusing on purpose — somebody waiting to be
 * cleared for work is the party with the most at stake and the least information.
 *
 * Nothing new is invented for it. The state comes from the same lib/vetting summary the queue reads,
 * for the same fictional applicant the workspace is signed in as, so the applicant's view and the
 * reviewer's view cannot say different things about one check. What is added is the half a reviewer
 * does not need and an applicant does: who decides each one, and what it stops until it passes. */
export function ApplicationStanding({ subjectId = 'N-205', onClose }: { subjectId?: string; onClose?: () => void }) {
 const subject = subjectById(subjectId)!;
 const role = roleById(subject.roleId)!;
 const summary = summarise(subject);
 const progress = gateProgress(subject);
 return <OfficeSection title="Where this application stands">
  <NotConnected of="credential-verification"/>
  <Card padding="md" className="oi-card-body">
   <dl className="oi-facts">
    <div><dt>Applicant</dt><dd>{subject.name} · {subject.reference}</dd></div>
    <div><dt>State</dt><dd className={summary.cleared ? '' : 'is-refused'}>{subjectStatusLabels[summary.status]}</dd></div>
    <div><dt>Checks passing</dt><dd>{summary.passed} of {summary.total}</dd></div>
    <div className="gate-progress" data-gate={progress.at.id}><dt>Onboarding</dt><dd className={progress.activated ? '' : 'is-refused'}>{progress.status}</dd></div>
    {summary.nextDue && <div><dt>Next renewal</dt><dd>{summary.nextDue.check.name} · {dueWording(summary.nextDue.days)}</dd></div>}
   </dl>
   {progress.sentence && <p className="oi-refusal gate-rule">{progress.sentence}</p>}
  </Card>

  {/* Every check, in the order the role lists them, with the three things an applicant is owed
      about each: where it stands, who issues it, and who may move it. */}
  <Card><div className="oi-rows">{summary.states.map(({ check, state }) => <div className="oi-row" key={check.id}>
   <div className="oi-row__body"><p className="oi-row__title">{check.name}</p>
    <span className="oi-row__meta">Issued by {authorityById(check.authority)?.name ?? check.authority}</span>
    <span className="oi-row__meta">{check.evidence}</span>
    {check.risk === 'high' && <span className="oi-row__meta">Decided by two reviewers, not one. A high-risk check is the kind where one person’s judgement is not enough.</span>}
   </div>
   <div className="oi-row__aside"><Badge variant={stateBadge(state)}>{checkStateLabels[state]}</Badge></div>
  </div>)}</div></Card>

  {/* And the refusal, which is the reason this screen is read-only. An applicant who could move a
      check is an applicant vetting themselves. */}
  <OfficeNote refusal icon={<ShieldX aria-hidden="true"/>}>Nothing on this screen can be changed from here, and no button on it asks a reviewer to hurry. A check moves when a named reviewer decides it — and where the risk is high, when a second one agrees — which is the whole of what makes it worth anything to the patient whose door you will knock on.</OfficeNote>
  <OfficeNote icon={<ShieldCheck aria-hidden="true"/>}>{role.grants[0].refusal}</OfficeNote>
  {onClose && <Button variant="secondary" className="oi-full" onClick={onClose} trailingIcon={<ArrowRight aria-hidden="true"/>}>Close</Button>}
 </OfficeSection>;
}
