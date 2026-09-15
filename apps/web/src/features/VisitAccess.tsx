import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Ambulance, ArrowLeft, ArrowRight, Check, Lock, MessageSquare, Send } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { MAX_CHARACTERS, closeThread, closedSentence, postMessage, type Thread } from '../../../../packages/engines/src/access/domain/thread.ts';
import { nurseOfVisit } from '../lib/arrival';
import { thread as words } from '../lib/booking';
import { subjectRefOf } from '../lib/names';
import { BookingStatus } from './BookingStatus';
import type { VisitRow } from './Pages';
import './booking-access.css';

/* One visit's booking status and its thread with the nurse, fetched only when a visit is opened.

   The thread is its own view inside the visit rather than a second dialog on top of it. A person reading
   what they wrote to a nurse wants the way back to the visit, not a stack of layers to close, and the dialog
   keeps one heading and one focus order.

   What the thread says before anything can be typed is the order of importance. The messaging capability's
   notice, because nothing typed here reaches anybody. That it is not a health record. And, directly above the
   field rather than after a silence, that nobody watches it for emergencies, with the numbers in the sentence.
   Words only: there is no attachment control at all, because the route refuses one and a control that is
   always refused is a control that teaches people to try.

   A visit that has happened or was cancelled has a closed thread, and what was said stays readable. The
   refusals are the domain's (packages/engines/src/access/domain/thread.ts), in the route's own words. */

const timeOf = (instant: string) =>
 new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));

/** The thread a visit row has, or the one it starts with. A visit that is behind us closes whatever it held. */
export function threadForRow(row: VisitRow, held?: Thread): Thread {
 const closedBecause = row.group === 'past' ? 'visit-completed' as const : row.group === 'cancelled' ? 'booking-cancelled' as const : null;
 if (held) return closedBecause ? closeThread(held, closedBecause) : held;
 return {
  bookingRef: row.visit.booking?.bookingRef ?? row.id,
  subjectRef: subjectRefOf(row.visit.person),
  nurseRef: nurseOfVisit(row.visit).id,
  state: closedBecause ? 'closed' : 'open',
  closedBecause,
  messages: [],
  keys: []
 };
}

type ThreadProps = { thread: Thread; nurseName: string; onChange: (next: Thread) => void; onBack: () => void };

export function VisitThread({ thread, nurseName, onChange, onBack }: ThreadProps) {
 const [draft, setDraft] = useState('');
 const [refusal, setRefusal] = useState<string | null>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 /* Focus moves to the thread's own heading when it opens, so a screen reader starts where the view does. */
 useEffect(() => {
  heading.current?.focus({ preventScroll: true });
  const dialog = heading.current?.closest('dialog');
  if (dialog) dialog.scrollTop = 0;
 }, []);
 const length = [...draft.trim()].length;
 const send = (event: FormEvent) => {
  event.preventDefault();
  const outcome = postMessage(thread, { idempotencyKey: crypto.randomUUID(), actor: { role: 'patient', ref: thread.subjectRef }, message: draft, now: new Date() });
  if (outcome.refused) { setRefusal(outcome.statement); return; }
  setRefusal(null);
  setDraft('');
  onChange(outcome.value.thread);
 };
 return <div className="form-stack visit-thread">
  <button type="button" className="text-button thread-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>Back to the visit</button>
  <header className="thread-head">
   <h3 ref={heading} tabIndex={-1}>{words.title}</h3>
   <p className="muted">{words.lead}</p>
  </header>
  <NotConnected of="messaging"/>
  <p className="thread-record-note">{words.notARecord}</p>
  {/* "Anything you write stays with this visit" is an invitation, and a closed thread has no field to
      write in. An empty closed thread draws no log at all; the closed sentence below says why. */}
  {(thread.messages.length > 0 || thread.state === 'open') && <ol className="thread-log" aria-label={words.title}>
   {thread.messages.length === 0
    ? <li className="thread-empty">{words.empty}</li>
    : thread.messages.map(message => <li key={message.messageRef} className={`thread-message ${message.fromRole === 'nurse' ? 'theirs' : 'mine'}`}>
     <p className="thread-who">{message.fromRole === 'nurse' ? nurseName : words.you}<time dateTime={message.at}>{timeOf(message.at)}</time></p>
     <p className="thread-text">{message.message}</p>
     <p className="thread-kept"><Check size={13} aria-hidden="true"/>{words.kept}</p>
    </li>)}
  </ol>}
  {thread.state === 'closed' && thread.closedBecause
   ? <p className="thread-closed" role="status"><Lock size={18} aria-hidden="true"/>{closedSentence(thread.closedBecause)}</p>
   : <form className="thread-compose" onSubmit={send}>
    <p className="thread-urgent" id="thread-urgent"><Ambulance size={18} aria-hidden="true"/>{words.nobodyWatches}</p>
    <label htmlFor="thread-input">{words.inputLabel}</label>
    <textarea id="thread-input" rows={3} value={draft} autoComplete="off" spellCheck={false}
     aria-describedby="thread-urgent thread-count" onChange={event => { setDraft(event.target.value); setRefusal(null); }}/>
    <div className="thread-send-row">
     <span id="thread-count" className={`thread-count${length > MAX_CHARACTERS ? ' over' : ''}`}>{length} / {MAX_CHARACTERS}</span>
     <button type="submit" className="primary" disabled={!draft.trim()}><Send size={16} aria-hidden="true"/>{words.sendLabel}</button>
    </div>
    {refusal && <p className="thread-refused" role="alert">{refusal}</p>}
   </form>}
 </div>;
}

type AccessProps = { row: VisitRow; held?: Thread; onThread: (next: Thread) => void; talking: boolean; setTalking: (open: boolean) => void };

/** The visit's booking status and the door to its thread; or, once opened, the thread itself. */
export default function VisitAccess({ row, held, onThread, talking, setTalking }: AccessProps) {
 const thread = threadForRow(row, held);
 if (talking) return <VisitThread thread={thread} nurseName={nurseOfVisit(row.visit).name} onChange={onThread} onBack={() => setTalking(false)}/>;
 const last = thread.messages[thread.messages.length - 1];
 return <div className="visit-access">
  {row.visit.booking && row.group === 'upcoming' && <BookingStatus history={row.visit.booking.history} asap={row.visit.booking.asap}/>}
  <button type="button" className="thread-door" onClick={() => setTalking(true)}>
   <span className="service-icon"><MessageSquare size={20} aria-hidden="true"/></span>
   <span><strong>{words.openLabel}</strong>
    <small>{thread.state === 'closed' && thread.closedBecause ? closedSentence(thread.closedBecause) : last ? last.message : words.empty}</small></span>
   <ArrowRight size={18} aria-hidden="true"/>
  </button>
 </div>;
}
