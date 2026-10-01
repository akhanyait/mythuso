import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Ban, Check, ChevronDown, CircleAlert, ClipboardList, Cloud, CloudOff, FileSignature, GitMerge, History, Inbox, KeyRound, Send, ShieldX, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, MyThusoHealthIcon, MyThusoVisitIcon, type BadgeVariant } from '../ui';
import '../surface/nurse-identity.css';
import { useOffline } from '../components/States';
import { ageText, captureStateById, conflictById, rules } from '../lib/capture';
import {
 beginSend, inMemoryAdmission, instrumentQueueCount, interruptSend, isPending, isSealed,
 partNames, partWhileHeld, seedQueue, settleSend, snapshot, subscribe, webStoreLostTo, type Part
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

/* The six capture states as the shared Badge's variants. The words on the badge are the contract's
   state name, so the tint is never the only thing telling two rows apart. */
const stateBadge: Record<string, BadgeVariant> = { captured: 'neutral', queued: 'primary', sending: 'accent', stored: 'success', conflicted: 'warning', refused: 'danger' };
/* A part's kind drawn with the family's own mark where the family has one — the readings are the
   patient's health, the visit is a visit — and Lucide for the rest, which are paperwork rather than
   healthcare destinations. One icon per concept, never both. */
const kindIcon: Record<Part['kind'], ReactNode> = {
 identity: <KeyRound aria-hidden="true"/>, consent: <FileSignature aria-hidden="true"/>, observations: <MyThusoHealthIcon/>,
 findings: <ClipboardList aria-hidden="true"/>, 'sign-off': <MyThusoVisitIcon/>
};

/* ---- The strip ------------------------------------------------------------------------------
   One line, above the work, on every stage of the assessment. It is the answer to "has any of this
   left the phone", which is a question a nurse asks by looking rather than by opening something.
   Offline is said three ways — the word, the struck cloud and the solid edge — so no reader has to
   tell it from connected by colour. */
export function CaptureStanding({ online, waiting, open, onToggle }:
 { online: boolean; waiting: number; open: boolean; onToggle: () => void }) {
 return <button type="button" className={`vq-strip nurse-strip${online ? '' : ' offline'}`} aria-expanded={open} onClick={onToggle}>
  <span className="nurse-strip__disc" aria-hidden="true">{online ? <Cloud/> : <CloudOff/>}</span>
  <span className="nurse-strip__say"><strong>{online ? 'Connected' : 'No signal'}</strong>
   <small>{waiting
    ? `${waiting} ${waiting === 1 ? 'piece' : 'pieces'} of work held on this phone`
    : 'Nothing is waiting. Everything you have done has reached the record.'}</small></span>
  <i aria-hidden="true"><ChevronDown/></i>
 </button>;
}

/* ---- The panel ------------------------------------------------------------------------------
   The handoff's command view, drawn from this queue and nothing else: four workload bars, each a
   count of the parts in one standing and scaled against the largest of the four, then the rows. A bar
   is never the only rendering of its number — the numeral sits beside it — and an empty standing is
   an empty track rather than a sliver pretending to be one. */
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

 /* The count, and it is the whole count rather than this screen's share of it. */
 const load: [string, number, string][] = [['Held, not sealed', held.length, 'held'], ['Waiting to send', sealed.length, 'waiting'], ['Needs a decision', conflicted.length, 'decision'], ['In the record', stored.length, 'stored']];
 const most = Math.max(1, ...load.map(([, n]) => n));
 const rows = (list: Part[]) => <ul className="nurse-queue-list">{list.map(part => <PartRow key={part.id} part={part} thisVisit={part.visit === visit}/>)}</ul>;

 return <Card className="vq-panel nurse-queue nurse-ui">
  <div className="nurse-queue__head">
   <div className="nurse-queue__say">
    <p className="nurse-eyebrow">Waiting to send</p>
    <p className="nurse-queue__standing">{reallyOffline
     ? 'This device is genuinely offline. The switch is not asking you to pretend, so it is off.'
     : online
      ? 'A connection is available, so what has been sealed can be sent.'
      : 'No connection. Sealed work goes nowhere, and you have done everything you can do about it.'}</p>
   </div>
   <div className="nurse-queue__controls">
    <Button variant="secondary" className={online ? '' : 'offline'} onClick={() => setActing(!acting)} aria-pressed={online} disabled={reallyOffline}
     leadingIcon={online ? <Cloud aria-hidden="true"/> : <CloudOff aria-hidden="true"/>}>{online ? 'Connection: on' : 'Connection: off'}</Button>
    <Checkbox checked={signed} onChange={e => setSigned(e.target.checked)} label={<span>A doctor has signed this visit</span>}/>
   </div>
  </div>

  <ol className="vq-counts nurse-workload" aria-label="What this phone holds">
   {load.map(([label, n, kind]) =>
    <li key={label} className={`nurse-workload__row is-${kind}`}>
     <span className="nurse-workload__label">{label}</span>
     <span className="nurse-workload__track" aria-hidden="true"><i style={{ '--share': n / most } as CSSProperties}/></span>
     <strong className="nurse-workload__count">{n}</strong>
    </li>)}
  </ol>

  <div className="nurse-queue__body">
  {held.length > 0 && <section className="nurse-queue__group">
   <h3>Held on this phone</h3>
   <p className="helper">Not sealed yet, because the visit is not finished. Signing the assessment seals everything it holds at once.</p>
   {rows(held)}
  </section>}

  {sealed.length > 0 ? <section className="nurse-queue__group">
   <h3>Sealed, waiting for a connection</h3>
   {rows(sealed)}
   <div className="button-row">
    {sending
     ? <Button variant="secondary" leadingIcon={<Undo2 aria-hidden="true"/>} onClick={() => { interruptSend(); setSending(false); setNotice('The send was interrupted. Everything went back to the queue rather than anywhere else.'); }}>Interrupt the send</Button>
     : <Button variant="primary" leadingIcon={<Send aria-hidden="true"/>} disabled={!online || !queued.length} onClick={send}>Send {queued.length} {queued.length === 1 ? 'piece' : 'pieces'}</Button>}
   </div>
   {!online && <p className="helper">Sending needs a connection. Nothing is dropped to make a send succeed and nothing is retried behind your back.</p>}
  </section> : held.length ? null : <p className="helper nurse-queue__empty">Nothing is sealed. An empty queue means every piece of this visit has been answered for.</p>}

  {conflicted.length > 0 && <section className="nurse-queue__group">
   <h3>Needs a decision</h3>
   <Alert variant="warning" title={rules.conflictsAreNotMerged} icon={<GitMerge aria-hidden="true"/>}/>
   {rows(conflicted)}
   <p className="helper"><ShieldX size={13}/><span>Nothing here is filed and nothing is thrown away. A reading that two clinicians disagree about is settled on the Thuso Kit surface, where both versions can be put side by side; a whole assessment that arrives against a signed record goes to the Control Tower.</span></p>
  </section>}

  {/* What she can still do, said beside what she cannot. A screen that only says "no connection"
      has told somebody standing in a kitchen that she is stuck, which is not true and is how people
      end up writing on paper. */}
  {!online && <div className="vq-meanwhile nurse-meanwhile">
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
     {webStoreLostTo.map(sentence => <li key={sentence}>{sentence}</li>)}
    </ul>
   </div>
  </div>}

  {stored.length > 0 && <section className="nurse-queue__group">
   <h3>This device’s copy of the record</h3>
   {rows(stored)}
  </section>}

  {/* Last, deliberately. The panel is opened to find out what is held, so the work comes first and
      the caveat about the mechanism comes after it — an amber block above the list was the loudest
      thing on a screen whose subject is underneath it. Written once in lib/visit-queue.ts and
      rendered here and on the Thuso Kit surface, because two screens each wording their own
      admission is how two admissions start disagreeing about what is being admitted. */}
  <Alert variant="warning" title={inMemoryAdmission.headline} icon={<Inbox aria-hidden="true"/>}>{inMemoryAdmission.before} <code>{inMemoryAdmission.script}</code> {inMemoryAdmission.after} “{inMemoryAdmission.owed}” — {inMemoryAdmission.close}</Alert>
  <p className="helper" role="status">{notice}</p>
  </div>
 </Card>;
}

/* ---- One part -------------------------------------------------------------------------------
   Two clocks, always both. The phone's is labelled as what the phone believed; the receipt is what
   everything is ordered by, and where there is none the row says nothing has ordered it yet rather
   than showing the first time as if it were the second. The detail is a real two-column list so the
   values line up under one another, numbers under numbers. */
function PartRow({ part, thisVisit }: { part: Part; thisVisit: boolean }) {
 const spec = captureStateById(part.state);
 const conflict = part.conflictId ? conflictById(part.conflictId) : undefined;
 return <li className="vq-part nurse-queue-row" data-state={part.state}>
  <div className="nurse-queue-row__head">
   <span className="nurse-queue-row__icon" aria-hidden="true">{kindIcon[part.kind]}</span>
   <div className="nurse-queue-row__name"><strong>{partNames[part.kind]}</strong><small>{part.summary}</small></div>
   <Badge variant={stateBadge[part.state]} size="sm">{spec.name}</Badge>
  </div>
  {!thisVisit && <p className="helper"><History size={13}/><span>From {part.visit} · {part.patient} — another visit, queued on its own.</span></p>}
  {(part.detail.length > 0 || part.receivedAt) && <dl className="nurse-facts">{part.detail.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
   {part.receivedAt && <div><dt>Server receipt · what this is ordered by</dt><dd>{new Date(part.receivedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd></div>}
  </dl>}
  <p className="helper"><History size={13}/><span>On this phone, {ageText(part.capturedAt)}.</span></p>
  {isPending(part) && <p className="helper vq-while nurse-queue-row__while"><CircleAlert size={13}/><span>{partWhileHeld[part.kind]}</span></p>}
  {conflict && <p className="helper" role="status"><GitMerge size={13}/><span><strong>{conflict.name}.</strong> {conflict.detail}</span></p>}
  {part.note && <p className="helper" role="status">{part.note}</p>}
 </li>;
}

/** Seeded once, on first mount, so the count on opening is what a queue actually looks like at the
    start of a shift rather than an empty box nobody can judge. */
export function useSeededQueue() {
 useEffect(() => { seedQueue(); }, []);
}
