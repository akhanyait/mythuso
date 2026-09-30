import { useState } from 'react';
import { BadgeCheck, DoorOpen, KeyRound, MessageSquareWarning, ShieldAlert, ShieldX, UserRound } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { fill, labelOf, policeNumber, tierName, verifyInService as words, type Refusal } from '../../../../packages/engines/src/trust/domain/contract.ts';
import { deskLine } from '../../../../packages/engines/src/trust/domain/shift-starts.ts';
import { nurseOfVisit } from '../lib/arrival';
import { trustSettingsNow } from '../lib/settings';
import {
 answerDoor, checkDoorCode, complaintQueueNow, decideAsReviewer, nameOf, noticesAbout, openComplaintAsReviewer,
 sendComplaint, shiftStartsNow, showDoorCode, useVerifyInService
} from '../lib/verify-in-service';
import { sampleVisitRows, type VisitRow } from './Pages';
import { Button, Card } from '../ui';
import './verify-in-service.css';

/* Verify in service on the web: the patient's check of the person at her door, her complaint about a visit, the
 * reviewer's complaints queue, the desk's board of shift starts and the nurse's door code.
 *
 * Every sentence is packages/catalog/verify-in-service.json's, through the Trust engine's domain; every refusal is
 * the route's own statement; every number — the tries, the hours, a code's expiry — is the settings in force or
 * the engine's arithmetic over them. Nothing here is on the patient's first load: each patient screen arrives on
 * a dynamic import when it is opened.
 *
 * A BADGE, NEVER A NUMBER. A matched code shows a name, the initials where a photograph would be, and a tier name.
 * There is no score to show, and the page says so.
 *
 * NO MATCH IS SHOWN AS A MATCH. The desk's board says no face match was performed for every shift, in the
 * contract's words, because the face-match door answers not-integrated and nothing can say otherwise.
 */
const time = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
const initialsOf = (name: string) => name.split(' ').filter(part => /^[A-Z]/.test(part)).slice(-2).map(part => part[0]).join('');
const Refused = ({ refusal }: { refusal: Refusal | null }) => refusal ? <p className="vis-refusal" role="alert"><ShieldX size={16}/>{refusal.statement}</p> : null;

/* ── The patient ──────────────────────────────────────────────────────────────────────────────────── */

export function DoorCheckEntry({ onOpen }: { onOpen: () => void }) {
 return <button className="secondary full" onClick={onOpen}><DoorOpen size={17}/>{words.door.patient.open}</button>;
}

type Outcome = { kind: 'wrong'; attemptsLeft: number } | { kind: 'matched'; name: string; tier: string | null } | { kind: 'mismatch' } | { kind: 'verified' };

export function DoorCheck({ row, back }: { row?: VisitRow; back: () => void }) {
 useVerifyInService();
 const [typed, setTyped] = useState('');
 const [outcome, setOutcome] = useState<Outcome | null>(null);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 if (!row) return <EmptyNote>{words.door.patient.anyTime}</EmptyNote>;
 const expected = nurseOfVisit(row.visit);
 const say = words.door.patient;
 const check = () => {
  const tried = checkDoorCode(row.id, typed);
  setTyped('');
  if (!tried.ok) { setRefusal(tried.refusal); return; }
  setRefusal(null);
  const { codeMatched, attemptsLeft, nurseName, badgeTier, incidentRaised } = tried.value;
  setOutcome(incidentRaised ? { kind: 'mismatch' } : codeMatched ? { kind: 'matched', name: nurseName ?? '', tier: badgeTier ? tierName(badgeTier) : null } : { kind: 'wrong', attemptsLeft });
 };
 const answer = (id: string) => {
  const answered = answerDoor(row.id, id);
  if (!answered.ok) { setRefusal(answered.refusal); return; }
  setRefusal(null);
  setOutcome(answered.incidentRaised ? { kind: 'mismatch' } : { kind: 'verified' });
 };
 const closed = outcome?.kind === 'mismatch' || outcome?.kind === 'verified';
 return <>
  <div className="page-intro"><div className="eyebrow">YOUR VISIT</div><h1>{say.heading}</h1><p>{say.intro}</p></div>
  <NotConnected of="credential-verification"/>
  <section className="panel glass lead vis-door" aria-label={say.heading}>
   <div className="vis-expected">
    <span className="avatar nurse-avatar" aria-hidden="true">{expected.initials}</span>
    <div><strong>{expected.name}</strong><small>{row.visit.service.name} · {row.visit.person}</small></div>
   </div>
   <p className="helper"><UserRound size={14}/>{words.door.photo.sentence}</p>
   {!closed && <form className="vis-code" onSubmit={event => { event.preventDefault(); check(); }}>
    <label htmlFor="door-code">{say.codeLabel}</label>
    <div className="code-input"><input id="door-code" inputMode="numeric" autoComplete="off" maxLength={words.door.digits} value={typed} onChange={event => setTyped(event.target.value.replace(/\D/g, ''))}/></div>
    <button className="primary" type="submit" disabled={typed.length !== words.door.digits}><KeyRound size={16}/>{say.check}</button>
   </form>}
   <Refused refusal={refusal}/>
   {outcome?.kind === 'wrong' && <p className="vis-refusal" role="status">{fill(say.wrong, { attempts: outcome.attemptsLeft })}</p>}
   {outcome?.kind === 'matched' && <div className="vis-matched" role="status">
    <p><BadgeCheck size={16}/>{say.matched}</p>
    <dl className="vis-facts">
     <div><dt>{say.name}</dt><dd>{outcome.name}</dd></div>
     <div><dt>{say.badge}</dt><dd>{outcome.tier ?? say.noBadge}</dd></div>
    </dl>
    <p className="helper">{words.badge.sentence}</p>
    <p><strong>{say.question}</strong></p>
    {outcome.tier && <button className="primary" onClick={() => answer('she-is-my-nurse')}>{labelOf(words.door.answers, 'she-is-my-nurse')}</button>}
   </div>}
   {outcome?.kind === 'verified' && <p className="vis-ok" role="status"><BadgeCheck size={16}/>{say.verified}</p>}
   {outcome?.kind === 'mismatch' && <div className="vis-alarm" role="alert"><p><ShieldAlert size={16}/>{say.mismatch}</p><p>{fill(say.danger, { police: policeNumber })}</p></div>}
   {outcome?.kind !== 'mismatch' && <>
    <p className="helper">{say.anyTime}</p>
    <button className="danger-outline" onClick={() => answer('not-my-nurse')}><ShieldAlert size={16}/>{labelOf(words.door.answers, 'not-my-nurse')}</button>
   </>}
  </section>
  <button className="secondary full" onClick={back}>Back to where your nurse is</button>
 </>;
}

export function ComplaintEntry({ onOpen }: { onOpen: () => void }) {
 return <button className="secondary full" onClick={onOpen}><MessageSquareWarning size={17}/>{words.complaints.patient.open}</button>;
}

export function ComplaintForm({ row, back }: { row?: VisitRow; back: () => void }) {
 const [category, setCategory] = useState('');
 const [account, setAccount] = useState('');
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const [sentBy, setSentBy] = useState<number | null>(null);
 const say = words.complaints.patient;
 if (!row) return <EmptyNote>{say.intro}</EmptyNote>;
 const hours = trustSettingsNow().complaintReviewHours;
 const submit = () => {
  const sent = sendComplaint({ partyRef: nurseOfVisit(row.visit).id, appointmentRef: row.id, categoryCode: category, whatHappened: account });
  if (!sent.ok) { setRefusal(sent.refusal); return; }
  setRefusal(null);
  setSentBy(sent.complaint.reviewBy);
 };
 return <>
  <div className="page-intro"><div className="eyebrow">YOUR VISIT</div><h1>{say.heading}</h1><p>{fill(say.intro, { hours })}</p></div>
  <NotConnected of="credential-verification"/>
  <section className="panel vis-complaint" aria-label={say.heading}>
   <p className="helper">{row.visit.service.name} · {row.visit.person} · {row.id}</p>
   {sentBy === null ? <form className="form-stack" onSubmit={event => { event.preventDefault(); submit(); }}>
    <label>{say.category}
     <select value={category} onChange={event => setCategory(event.target.value)}>
      <option value="">—</option>
      {words.complaints.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
     </select>
    </label>
    <label>{say.account}
     <textarea value={account} maxLength={words.complaints.maxCharacters} onChange={event => setAccount(event.target.value)}/>
    </label>
    <p className="helper">{fill(say.accountHelp, { characters: words.complaints.maxCharacters })}</p>
    <p className="helper">{say.nurseNotTold}</p>
    <p className="helper">{words.complaints.scoreRule.sentence}</p>
    <Refused refusal={refusal}/>
    <button className="primary" type="submit">{say.submit}</button>
   </form> : <p className="vis-ok" role="status"><BadgeCheck size={16}/>{fill(say.sent, { at: `${new Date(sentBy).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })} ${time(sentBy)}` })}</p>}
  </section>
  <button className="secondary full" onClick={back}>Back to your visits</button>
 </>;
}

/* ── The reviewer ─────────────────────────────────────────────────────────────────────────────────── */

export function ComplaintsQueue() {
 useVerifyInService();
 const say = words.complaints.reviewer;
 const [open, setOpen] = useState<string | null>(null);
 const rows = complaintQueueNow();
 return <section className="panel vis-queue" aria-label={say.heading}>
  <div className="section-title"><h2>{say.heading}</h2><Pill tone="plain">{rows.filter(r => r.state === 'awaiting-review').length}</Pill></div>
  <p className="helper">{say.intro}</p>
  <p className="helper">{say.noScore}</p>
  {rows.length ? rows.map(row => <div key={row.complaintRef} className="vis-row">
   <button className="record-row" aria-expanded={open === row.complaintRef} onClick={() => setOpen(open === row.complaintRef ? null : row.complaintRef)}>
    <span className={`service-icon ${row.overdue ? 'check-declined' : 'check-in-review'}`}><MessageSquareWarning size={20}/></span>
    <span>
     <strong>{nameOf(row.partyRef)}</strong>
     <small>{labelOf(words.complaints.categories, row.categoryCode)}</small>
     <small className="vis-age">{row.overdue ? fill(say.overdue, { hours: row.reviewWithinHours }) : fill(say.age, { age: row.ageHours, hours: row.reviewWithinHours })}</small>
    </span>
    <Pill tone={row.overdue ? 'danger' : row.state === 'decided' ? 'plain' : 'amber'}>{labelOf(words.complaints.states, row.state)}</Pill>
   </button>
   {open === row.complaintRef && <ComplaintDetail complaintRef={row.complaintRef}/>}
  </div>) : <EmptyNote>{say.empty}</EmptyNote>}
 </section>;
}

function ComplaintDetail({ complaintRef }: { complaintRef: string }) {
 const say = words.complaints.reviewer;
 const [outcome, setOutcome] = useState('');
 const [reason, setReason] = useState('');
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const opened = openComplaintAsReviewer(complaintRef);
 if (!opened.ok) return <Refused refusal={opened.refusal}/>;
 const c = opened.complaint;
 if (c.decision) return <p className="vis-ok">{fill(say.decided, { outcome: labelOf(words.complaints.outcomes, c.decision.outcomeCode) })}</p>;
 return <form className="form-stack vis-detail" onSubmit={event => { event.preventDefault(); const decided = decideAsReviewer(complaintRef, outcome, reason); setRefusal(decided.ok ? null : decided.refusal); }}>
  <blockquote>{c.whatHappened}</blockquote>
  <label>{say.decide}
   <select value={outcome} onChange={event => setOutcome(event.target.value)}>
    <option value="">—</option>
    {words.complaints.outcomes.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
   </select>
  </label>
  <label>{say.reason}<textarea value={reason} onChange={event => setReason(event.target.value)}/></label>
  <Refused refusal={refusal}/>
  <button className="primary" type="submit">{say.decide}</button>
 </form>;
}

/* ── The desk ─────────────────────────────────────────────────────────────────────────────────────── */

export function ShiftStartsBoard() {
 useVerifyInService();
 const say = words.shiftStart;
 const shifts = shiftStartsNow();
 return <section className="panel vis-board" aria-label={say.deskHeading}>
  <div className="section-title"><h2>{say.deskHeading}</h2></div>
  <p className="helper">{say.deskIntro}</p>
  <NotConnected of="credential-verification" tone="inline"/>
  {shifts.length ? shifts.map(shift => <div className="record-row static" key={shift.shiftStartRef}>
   <span className="service-icon check-in-review"><ShieldX size={20}/></span>
   <span><strong>{nameOf(shift.partyRef)} · {time(shift.startedAt)}</strong><small>{deskLine(shift)}</small></span>
  </div>) : <EmptyNote>{say.deskEmpty}</EmptyNote>}
 </section>;
}
/** The reviewer's view name, for the vetting console's tabs. */
export const complaintsHeading: string = words.complaints.reviewer.heading;

/* ── The nurse ────────────────────────────────────────────────────────────────────────────────────── */

/* The code for the patient's next visit, shown as the nurse that visit is assigned to, so the patient's door check in
   this same tab has something to check. The panel says so in the contract's words. */
export function NurseDoorCode() {
 useVerifyInService();
 const say = words.door.nurse;
 const row = sampleVisitRows().find(r => r.group === 'upcoming');
 const [shown, setShown] = useState<{ digits: string; expiresAt: number; attemptsAllowed: number } | null>(null);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 /* Hidden is hers to choose: a code read across a doorway is also a code read over her shoulder in a taxi. */
 const [hidden, setHidden] = useState(false);
 if (!row) return null;
 const nurse = nurseOfVisit(row.visit);
 const show = () => {
  const result = showDoorCode(row.id, nurse.id, words.door.digits);
  if (!result.ok) { setRefusal(result.refusal); return; }
  setRefusal(null);
  setShown({ digits: result.digits, expiresAt: result.expiresAt, attemptsAllowed: result.attemptsAllowed });
 };
 /* On the identity (wave 4b): a white Card on her day, the initials where a photograph would be, and the code
    itself in the display face, large and spaced, because it is read aloud across a doorway. Showing it is the
    one aqua action; showing it again is quieter, because the first press is the decision. */
 return <Card role="region" padding="md" className="vis-nurse-code nurse-ui" aria-label={say.heading}>
  <div className="vis-nurse-head">
   <span className="vis-initials" aria-hidden="true">{initialsOf(nurse.name)}</span>
   <div><h2>{say.heading}</h2><p>{say.intro}</p></div>
  </div>
  <p className="helper">{say.preview} {row.id} · {nurse.name}</p>
  {shown && <div className="vis-shown">
   {/* One cell per digit, as the export draws it, so a digit read aloud is found by its place; the output's
       text is still the whole code, and hidden it is no code at all rather than a code drawn in bullets. */}
   <output className="vis-digits" aria-label={say.heading}>{hidden
    ? <><span className="visually-hidden">Hidden</span>{[...shown.digits].map((_, i) => <span key={i} className="vis-cell" aria-hidden="true">•</span>)}</>
    : [...shown.digits].map((digit, i) => <span key={i} className="vis-cell">{digit}</span>)}</output>
   <Button variant="ghost" size="sm" className="vis-hide" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>{hidden ? 'Show the digits' : 'Hide the digits'}</Button>
   <p className="helper">{fill(say.expires, { at: time(shown.expiresAt) })} {fill(say.tries, { attempts: shown.attemptsAllowed })}</p>
  </div>}
  <Refused refusal={refusal}/>
  <div className="nurse-actions vis-nurse-actions"><Button variant={shown ? 'secondary' : 'accent'} leadingIcon={<KeyRound aria-hidden="true"/>} onClick={show}>{shown ? say.again : say.button}</Button></div>
 </Card>;
}

/* What a nurse is told about complaints about her: that they exist, their kind, their state and their outcome. */
export function ComplaintNotices({ partyRef }: { partyRef: string }) {
 useVerifyInService();
 const say = words.complaints.nurse;
 const notices = noticesAbout(partyRef);
 return <section className="panel vis-notices" aria-label={say.heading}>
  <SectionTitle title={say.heading}/>
  <p className="helper">{say.intro}</p>
  {notices.length ? notices.map(n => <div className="record-row static" key={n.complaintRef}>
   <span className="service-icon"><MessageSquareWarning size={20}/></span>
   <span><strong>{labelOf(words.complaints.categories, n.categoryCode)}</strong>
    <small>{n.outcomeCode ? words.complaints.outcomes.find(o => o.id === n.outcomeCode)?.nurse : labelOf(words.complaints.states, n.state)}</small></span>
  </div>) : <EmptyNote>{say.empty}</EmptyNote>}
 </section>;
}
