import { useEffect, useState, useSyncExternalStore } from 'react';
import { Ban, Check, ChevronDown, CircleAlert, Cloud, CloudOff, GitMerge, History, Inbox, Send, ShieldX, Undo2 } from 'lucide-react';
import { Pill } from '../components/UI';
import { useOffline } from '../components/States';
import { ageText, captureStateById, conflictById, rules } from '../lib/capture';
import {
 beginSend, inMemoryAdmission, instrumentQueueCount, interruptSend, isPending, isSealed,
 partNames, partWhileHeld, seedQueue, settleSend, snapshot, subscribe, type Part
} from '../lib/visit-queue';
import { can } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';

/* What a nurse has done that has not left her phone.
 *
 * The readings had a queue. The rest of the visit — the code checked at the door, the consent read
 * aloud, what she found, her signature — lived in a screen's memory, which meant that the last
 * thing that happens in a house was the least protected thing in the product. A nurse who loses an
 * assessment writes it again in the car from memory, and a record written from memory an hour later
 * is a different record. That is a clinical safety problem before it is an inconvenience, and it is
 * the whole reason this surface exists.
 *
 * Three things it has to say, and they are the three a queue usually gets wrong:
 *
 *   WHAT IS HELD, in her words rather than in states. "Consent" and "What you found", not four rows
 *   of an enum. The contract's six states are underneath and are shown; they are not the headline.
 *
 *   WHAT SHE CAN STILL DO. A screen that only says "no connection" has told a nurse standing in a
 *   kitchen that she is stuck, which is untrue and is the reason people start writing on paper. She
 *   can finish, sign, and start the next visit. What she cannot do is rely on anybody else having
 *   seen it, and that is said in the same breath rather than left to be assumed.
 *
 *   WHAT IT CANNOT SURVIVE. This queue is in memory. Nothing in this repository may leave a patient
 *   reading on the machine it was opened on, so a reload loses it, and the screen says so in the
 *   contract's own words instead of implying a durability it does not have.
 */

/** One store, subscribed to rather than copied, so every surface counts the same work. */
export function useVisitQueue(): Part[] {
 return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Kept in step with the instrument surface's own list, so "what is waiting" is one number. */
export const useWaitingCount = (parts: Part[]) => parts.filter(isPending).length + instrumentQueueCount();

/* A connection, honestly. navigator.onLine answers for real and is authoritative when it says no —
   a browser that knows it is offline is not overruled by a switch. Where it says yes, the switch is
   how a reviewer sitting on a desk with fibre sees the thing this feature is about.

   Held once by the screen and handed to both the strip and the panel: two components each asking
   for their own would be a screen whose header and whose queue disagree about whether there is a
   connection, which is worse than either answer. */
export type Signal = { online: boolean; reallyOffline: boolean; acting: boolean; setActing: (on: boolean) => void };
export function useSignal(): Signal {
 const reallyOffline = useOffline();
 const [acting, setActing] = useState(false);
 return { online: acting && !reallyOffline, reallyOffline, acting, setActing };
}

const stateTone: Record<string, string> = { captured: 'sky', queued: 'sky', sending: 'sky', stored: '', conflicted: 'amber', refused: 'danger' };

/* ---- The strip ------------------------------------------------------------------------------
   One line, above the work, on every stage of the assessment. It is the answer to "has any of this
   left the phone", which is a question a nurse asks by looking rather than by opening something. */
export function CaptureStanding({ online, waiting, open, onToggle }:
 { online: boolean; waiting: number; open: boolean; onToggle: () => void }) {
 return <button type="button" className={`vq-strip${online ? '' : ' offline'}`} aria-expanded={open} onClick={onToggle}>
  {online ? <Cloud size={18}/> : <CloudOff size={18}/>}
  <span><strong>{online ? 'Connected' : 'No signal'}</strong>
   <small>{waiting
    ? `${waiting} ${waiting === 1 ? 'piece' : 'pieces'} of work held on this phone`
    : 'Nothing is waiting. Everything you have done has reached the record.'}</small></span>
  <i aria-hidden="true"><ChevronDown size={18}/></i>
 </button>;
}

/* ---- The panel ------------------------------------------------------------------------------ */
export function WaitingToSend({ visit, signal, capturerId = 'N-205' }: { visit: string; signal: Signal; capturerId?: string }) {
 const parts = useVisitQueue();
 const { online, reallyOffline, acting, setActing } = signal;
 const [signed, setSigned] = useState(false);
 const [sending, setSending] = useState(false);
 const [notice, setNotice] = useState('');
 const capturer = subjectById(capturerId)!;

 const held = parts.filter(p => p.state === 'captured');
 const sealed = parts.filter(isSealed);
 const conflicted = parts.filter(p => p.state === 'conflicted');
 const stored = parts.filter(p => p.state === 'stored');
 const queued = parts.filter(p => p.state === 'queued');

 const send = () => {
  setSending(true);
  beginSend();
  const decision = can(capturer, 'write-clinical-note');
  window.setTimeout(() => {
   settleSend({
    now: new Date().toISOString(),
    capturerAllowed: decision.allowed, capturerReason: decision.reason,
    recordMovedOn: signed,
    movedOnNote: 'A doctor signed this visit while the work was waiting to send. It is never applied silently after the fact, and a signed record is not edited behind the signature.'
   });
   setSending(false);
   setNotice('The queue was answered. Anything that could not be filed is still here, with the reason against it.');
  }, 1100);
 };

 return <div className="panel form-stack vq-panel">
  <div className="kit-switches">
   <button type="button" className={online ? 'secondary' : 'secondary offline'} onClick={() => setActing(!acting)} aria-pressed={online} disabled={reallyOffline}>
    {online ? <><Cloud size={16}/>Connection: on</> : <><CloudOff size={16}/>Connection: off</>}
   </button>
   <label className="checkbox"><input type="checkbox" checked={signed} onChange={e => setSigned(e.target.checked)}/><span>A doctor has signed this visit</span></label>
  </div>
  <p className="helper">{reallyOffline
   ? 'This device is genuinely offline. The switch is not asking you to pretend, so it is off.'
   : online
    ? 'A connection is available, so what has been sealed can be sent.'
    : 'No connection. Sealed work goes nowhere, and you have done everything you can do about it.'}</p>

  {/* The count, and it is the whole count rather than this screen's share of it. */}
  <div className="vq-counts">
   {[['Held, not sealed', held.length], ['Waiting to send', sealed.length], ['Needs a decision', conflicted.length], ['In the record', stored.length]].map(([label, n]) =>
    <div key={label as string}><strong>{n}</strong><small>{label}</small></div>)}
  </div>

  {held.length > 0 && <>
   <h3>Held on this phone</h3>
   <p className="helper">Not sealed yet, because the visit is not finished. Signing the assessment seals everything it holds at once.</p>
   {held.map(part => <PartRow key={part.id} part={part} thisVisit={part.visit === visit}/>)}
  </>}

  {sealed.length > 0 ? <>
   <h3>Sealed, waiting for a connection</h3>
   {sealed.map(part => <PartRow key={part.id} part={part} thisVisit={part.visit === visit}/>)}
   <div className="button-row">
    {sending
     ? <button className="secondary" onClick={() => { interruptSend(); setSending(false); setNotice('The send was interrupted. Everything went back to the queue rather than anywhere else.'); }}><Undo2 size={16}/>Interrupt the send</button>
     : <button className="primary" disabled={!online || !queued.length} onClick={send}><Send size={16}/>Send {queued.length} {queued.length === 1 ? 'piece' : 'pieces'}</button>}
   </div>
   {!online && <p className="helper">Sending needs a connection. Nothing is dropped to make a send succeed and nothing is retried behind your back.</p>}
  </> : held.length ? null : <p className="helper">Nothing is sealed. An empty queue means every piece of this visit has been answered for.</p>}

  {conflicted.length > 0 && <>
   <h3>Needs a decision</h3>
   <div className="privacy-note"><GitMerge size={19}/>{rules.conflictsAreNotMerged}</div>
   {conflicted.map(part => <PartRow key={part.id} part={part} thisVisit={part.visit === visit}/>)}
   <p className="helper"><ShieldX size={13}/><span>Nothing here is filed and nothing is thrown away. A reading that two clinicians disagree about is settled on the Thuso Kit surface, where both versions can be put side by side; a whole assessment that arrives against a signed record goes to the Control Tower.</span></p>
  </>}

  {/* What she can still do, said beside what she cannot. A screen that only says "no connection"
      has told somebody standing in a kitchen that she is stuck, which is not true and is how people
      end up writing on paper. */}
  {!online && <div className="vq-meanwhile">
   <div>
    <h4><Check size={16}/>You can still</h4>
    <ul>
     <li>Finish this visit and sign it off. The signature is real work and it is kept.</li>
     <li>Take readings from a paired instrument, which queue the same way.</li>
     <li>Start the next visit on your list. Two visits queue separately and never answer for each other.</li>
     <li>Open the consultation record this visit produced and write it up.</li>
    </ul>
   </div>
   <div>
    <h4><Ban size={16}/>Until it sends, nobody else has it</h4>
    <ul>
     <li>None of it is in the patient’s Health Passport.</li>
     <li>No doctor can read it, so no prescription, sick note or referral can follow from it.</li>
     <li>The Control Tower does not know this visit is done.</li>
     <li>Closing this tab loses it. Nothing in this app may leave a patient’s readings on the machine it was opened on.</li>
    </ul>
   </div>
  </div>}

  {stored.length > 0 && <>
   <h3>This device’s copy of the record</h3>
   {stored.map(part => <PartRow key={part.id} part={part} thisVisit={part.visit === visit}/>)}
  </>}

  {/* Last, deliberately. The panel is opened to find out what is held, so the work comes first and
      the caveat about the mechanism comes after it — an amber block above the list was the loudest
      thing on a screen whose subject is underneath it. Written once in lib/visit-queue.ts and
      rendered here and on the Thuso Kit surface, because two screens each wording their own
      admission is how two admissions start disagreeing about what is being admitted. */}
  <div className="privacy-note alert"><Inbox size={19}/><span><strong>{inMemoryAdmission.headline}</strong> {inMemoryAdmission.before} <code>{inMemoryAdmission.script}</code> {inMemoryAdmission.after} “{inMemoryAdmission.owed}” — {inMemoryAdmission.close}</span></div>
  <p className="helper" role="status">{notice}</p>
 </div>;
}

/* ---- One part -------------------------------------------------------------------------------
   Two clocks, always both. The phone's is labelled as what the phone believed; the receipt is what
   everything is ordered by, and where there is none the row says nothing has ordered it yet rather
   than showing the first time as if it were the second. */
function PartRow({ part, thisVisit }: { part: Part; thisVisit: boolean }) {
 const spec = captureStateById(part.state);
 const conflict = part.conflictId ? conflictById(part.conflictId) : undefined;
 return <div className="panel vq-part">
  <div className="vq-part-head">
   <div><strong>{partNames[part.kind]}</strong><small>{part.summary}</small></div>
   <Pill tone={stateTone[part.state]}>{spec.name}</Pill>
  </div>
  {!thisVisit && <p className="helper"><History size={13}/><span>From {part.visit} · {part.patient} — another visit, queued on its own.</span></p>}
  {part.detail.map(([label, value]) => <div className="review-line" key={label}><span>{label}</span><strong>{value}</strong></div>)}
  <p className="helper"><History size={13}/><span>On this phone, {ageText(part.capturedAt)}.</span></p>
  {isPending(part) && <p className="helper vq-while"><CircleAlert size={13}/><span>{partWhileHeld[part.kind]}</span></p>}
  {conflict && <p className="helper" role="status"><GitMerge size={13}/><span><strong>{conflict.name}.</strong> {conflict.detail}</span></p>}
  {part.note && <p className="helper" role="status">{part.note}</p>}
  {part.receivedAt && <div className="review-line"><span>Server receipt · what this is ordered by</span><strong>{new Date(part.receivedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></div>}
 </div>;
}

/** Seeded once, on first mount, so the count on opening is what a queue actually looks like at the
    start of a shift rather than an empty box nobody can judge. */
export function useSeededQueue() {
 useEffect(() => { seedQueue(); }, []);
}
