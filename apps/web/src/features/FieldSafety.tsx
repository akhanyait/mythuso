import { useId, useState } from 'react';
import { Clock3, LogOut, MapPin, ShieldCheck, Siren, TimerReset } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { MINUTE, clockOf, fieldSafety, fill, positionDecimals, refusal, whatPanicDoesNotDo, type Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { extensionLeft, minutesLeft, standingOf, stepsOffered } from '../../../../packages/engines/src/safety/domain/checkins.ts';
import { isSharing, sharingEndsAt, standingOf as panicStandingOf } from '../../../../packages/engines/src/safety/domain/panics.ts';
import { deskCounts, type DeskItem } from '../../../../packages/engines/src/safety/domain/desk.ts';
import { checkInSafe, checkOut, closeOverdue, deskRows, extendVisit, panicFor, pickUp, positionOf, pressPanic, resolvePanic, timerFor, useFieldSafety } from '../lib/field-safety';
import { panicWindowNow, useSettingsHistories } from '../lib/settings';

/* The nurse safety suite's two screens: the strip a nurse keeps on the visit she is in, and the queue
 * the desk works.
 *
 * THE STRIP IS SMALL ON PURPOSE, AND PANIC IS NOT. A nurse is in somebody's kitchen doing the visit;
 * the assessment is what she opened the screen for and it keeps the page. What the strip owes her is
 * one line she can read at a glance, when she should be out and how long that is, three things she
 * can press without reading, and a panic control that is findable without looking for it: its own
 * colour, its own word, the same corner every time.
 *
 * PANIC ASKS ONCE, AND SAYS WHAT PRESSING DOES AND DOES NOT DO. A panic pressed by a pocket is a desk
 * phoning a nurse who is fine; a panic behind three screens is a nurse who did not get to press it. So
 * there is one confirmation, and it is the only place the window is stated before it starts, beside
 * the sentence that a person at the desk decides whether anybody is sent — with the real numbers from
 * sos.json in it. Every word is packages/catalog/field-safety.json's, and every refusal is rendered as
 * the engine returned it.
 *
 * THE DESK SEES A NURSE AND A SUBURB. Never the service, never the person being visited: the queue is
 * worked with other people standing behind the operator. A position is drawn only while its window is
 * open, and a row whose window has closed says when it closed rather than showing where she last was.
 */
const say = fieldSafety.nurse;
const panicSay = fieldSafety.panic;
const deskSay = fieldSafety.desk;
const labelOf = (list: readonly { id: string; label: string }[], id: string) => list.find(item => item.id === id)?.label ?? id;

export function VisitSafety({ reference }: { reference: string }) {
 const s = useFieldSafety();
 /* Subscribed so the window the confirmation states is the one in force the moment it is drawn. The
    timer and a panic already pressed keep their own; only the sentence about the next press moves. */
 useSettingsHistories();
 const id = useId();
 const [extending, setExtending] = useState(false);
 const [reasonId, setReasonId] = useState('');
 const [confirming, setConfirming] = useState(false);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const timer = timerFor(s, reference);
 const panic = panicFor(s, reference);
 /* No timer, no strip: the timer starts when the visit code matches, and before that she is on the
    doorstep rather than in the visit. */
 if (!timer) return null;
 const standing = standingOf(timer, s.now);
 const episode = timer.overdue && !timer.overdue.silenced ? timer.overdue : null;
 const act = (outcome: Refusal | null, after?: () => void) => { setRefused(outcome); if (!outcome) after?.(); };
 const offered = stepsOffered(timer);
 const sharing = panic ? isSharing(panic, s.now) : false;
 const detail = standing === 'overdue' ? fill(say.overdue, { since: clockOf(timer.dueAt) })
  : fill(say.left, { minutes: String(minutesLeft(timer, s.now)) });
 const answered = episode?.answeredAt ? ' ' + fill(say.answered, { at: clockOf(episode.answeredAt) }) : '';
 return <section className={'fs-visit is-' + standing + (sharing ? ' is-sharing' : '')} aria-labelledby={id + '-head'}>
  <div className="fs-visit-bar">
   <span className="fs-rule" aria-hidden="true"/>
   <div className="fs-visit-say">
    <span className="fs-kicker" id={id + '-head'}>{say.heading} · {labelOf(fieldSafety.states.timer, standing)}</span>
    <strong role="status">{standing === 'closed'
     ? fill(timer.closedBy === 'visit-completed' ? say.closedBySigning : say.closedByNurse, { at: clockOf(timer.closedAt!) })
     : fill(say.due, { due: clockOf(timer.dueAt) })}</strong>
    {standing !== 'closed' && <small>{detail}{answered}</small>}
   </div>
   <div className="fs-visit-actions">
    {standing !== 'closed' && <>
     <button className="secondary" onClick={() => act(checkInSafe(reference))}><ShieldCheck size={16} aria-hidden="true"/>{say.checkIn}</button>
     <button className="secondary" aria-expanded={extending} aria-controls={id + '-extend'} onClick={() => { setExtending(!extending); setRefused(null); }}><TimerReset size={16} aria-hidden="true"/>{say.extend}</button>
     <button className="secondary" onClick={() => act(checkOut(reference), () => setExtending(false))}><LogOut size={16} aria-hidden="true"/>{say.checkOut}</button>
    </>}
    <button className="fs-panic" aria-expanded={confirming} aria-controls={id + '-panic'} onClick={() => { setConfirming(true); setRefused(null); }}><Siren size={17} aria-hidden="true"/>{panicSay.press}</button>
   </div>
  </div>

  {extending && standing !== 'closed' && <fieldset className="fs-extend" id={id + '-extend'}>
   <legend>{say.extendQuestion}</legend>
   <div className="fs-reasons">{fieldSafety.extensionReasons.map(reason =>
    <label key={reason.id} className="fs-choice">
     <input type="radio" name={id + '-reason'} value={reason.id} checked={reasonId === reason.id} onChange={() => setReasonId(reason.id)}/>
     <span>{reason.label}</span>
    </label>)}</div>
   {offered.length ? <div className="fs-steps">{offered.map(step =>
    <button key={step} className="secondary" onClick={() => act(extendVisit(reference, step, reasonId), () => { setExtending(false); setReasonId(''); })}>{fill(say.extendStep, { minutes: String(step) })}</button>)}</div>
    : null}
   {/* When nothing is left to offer, the ceiling says so in the sentence on the route rather than
       as three greyed-out buttons a nurse has to work out the meaning of. */}
   <p className="helper">{offered.length ? fill(say.extendLeft, { minutes: String(extensionLeft(timer)) }) : refusal('extension-limit').statement}</p>
  </fieldset>}

  {confirming && <div className="fs-confirm" id={id + '-panic'} role="group" aria-labelledby={id + '-confirm'}>
   <strong id={id + '-confirm'}>{panicSay.confirmQuestion}</strong>
   <p>{fill(panicSay.whatHappens, { ends: clockOf(s.now + panicWindowNow().minutes * MINUTE) })}</p>
   <p>{whatPanicDoesNotDo()}</p>
   <NotConnected of="emergency" tone="inline"/>
   <div className="fs-confirm-actions">
    <button className="secondary" onClick={() => setConfirming(false)}>{panicSay.cancel}</button>
    <button className="fs-panic is-solid" autoFocus onClick={() => act(pressPanic(reference), () => setConfirming(false))}><Siren size={17} aria-hidden="true"/>{panicSay.confirm}</button>
   </div>
  </div>}

  {panic && !confirming && <div className="fs-pressed" role="status">
   <strong>{labelOf(fieldSafety.states.panic, panicStandingOf(panic))} · {fill(panicSay.pressedAt, { at: clockOf(panic.raisedAt) })}</strong>
   <p>{sharing ? fill(panicSay.sharingUntil, { ends: clockOf(sharingEndsAt(panic)) }) : fill(panicSay.sharingStopped, { ended: clockOf(sharingEndsAt(panic)) })}</p>
   {!sharing && !panic.resolved && <p>{panicSay.pressAgain}</p>}
  </div>}

  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
 </section>;
}

export function SafetyDesk() {
 const s = useFieldSafety();
 const rows = deskRows(s);
 const counts = deskCounts(rows);
 return <section className="fs-desk" aria-labelledby="fs-desk-title">
  <div className="fs-desk-head">
   <h2 id="fs-desk-title">{deskSay.heading}</h2>
   <p>{fill(deskSay.waiting, { waiting: String(counts.waiting), open: String(counts.open) })}</p>
  </div>
  {counts.open === 0 && <p className="fs-desk-empty">{deskSay.empty}</p>}
  <ol className="fs-desk-list">{rows.map(row => <DeskRow key={row.reference} row={row}/>)}</ol>
  {/* The two capabilities this queue stands on, once each: nobody is contacted when the desk acts,
      and no device is reporting the positions. Under the queue rather than above it: on a phone the
      two sentences above pushed the panic nobody has picked up below the fold, and the panic is what
      the desk opened this screen for. The incident register under it leaves its own dispatch notice
      off for that reason. */}
  <NotConnected of="emergency" tone="inline"/>
  <NotConnected of="dispatch" tone="inline"/>
 </section>;
}

function DeskRow({ row }: { row: DeskItem }) {
 const s = useFieldSafety();
 const id = useId();
 const [choice, setChoice] = useState('');
 const [refused, setRefused] = useState<Refusal | null>(null);
 const tone = !row.open ? 'closed' : row.acknowledgement ? 'held' : row.kind;
 const position = row.kind === 'panic' ? positionOf(s, row.reference) : null;
 const options = row.kind === 'panic' ? fieldSafety.outcomes : fieldSafety.silenceReasons;
 const state = !row.open ? fill(deskSay.closedLine, { outcome: row.outcome ?? '' })
  : row.acknowledgement ? fill(deskSay.pickedUp, { at: clockOf(row.acknowledgement.at) }) : deskSay.notPickedUp;
 return <li className={'fs-row is-' + tone}>
  <div className="fs-row-line">
   <span className="fs-row-kind"><i aria-hidden="true"/>{row.kind === 'panic' ? deskSay.kinds.panic : deskSay.kinds.overdue}</span>
   <span className="fs-row-ref">{row.reference}</span>
   <span className="fs-row-who">
    <strong>{row.nurse}</strong>
    <small><MapPin size={13} aria-hidden="true"/>{row.suburb} · {fill(deskSay.raisedAt, { at: clockOf(row.raisedAt) })}</small>
   </span>
   <span className="fs-row-age"><Clock3 size={13} aria-hidden="true"/>{fill(deskSay.age, { minutes: String(row.ageMinutes) })}</span>
   <span className="fs-row-state">{state}</span>
  </div>

  {row.open && row.answeredAt !== null && <p className="fs-row-note">{fill(deskSay.answered, { at: clockOf(row.answeredAt) })}</p>}

  {position && (position.ok
   ? <div className="fs-position">
     <span className="fs-position-label">{deskSay.position}</span>
     {position.value
      ? <span className="fs-position-at">{row.suburb} · {position.value.lat.toFixed(positionDecimals)}, {position.value.lng.toFixed(positionDecimals)}
         <small>{fill(deskSay.positionUpdated, { seconds: String(Math.max(0, Math.round((s.now - position.value.at) / 1000))) })} · {fill(deskSay.sharingUntil, { ends: clockOf(row.sharingEndsAt!) })}</small></span>
      : <span className="fs-position-at">{deskSay.positionNotYet}</span>}
    </div>
   : <p className="fs-row-note fs-position-gone">{position.refusal.statement}</p>)}

  {row.open && <div className="fs-row-act">
   {!row.acknowledgement
    ? <button className="primary" onClick={() => setRefused(pickUp(row))}>{deskSay.pickUp}</button>
    : <>
     <label className="fs-row-choose" htmlFor={id + '-choice'}>{row.kind === 'panic' ? deskSay.outcomeQuestion : deskSay.reasonQuestion}</label>
     <select id={id + '-choice'} value={choice} onChange={event => { setChoice(event.target.value); setRefused(null); }}>
      <option value="">{deskSay.choose}</option>
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
     </select>
     <button className="primary" onClick={() => setRefused(row.kind === 'panic' ? resolvePanic(row.reference, choice) : closeOverdue(row.reference, choice))}>
      {row.kind === 'panic' ? deskSay.resolve : deskSay.close}
     </button>
    </>}
  </div>}
  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
 </li>;
}
