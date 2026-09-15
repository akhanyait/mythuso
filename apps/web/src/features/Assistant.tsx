import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Ambulance, ArrowRight, RotateCcw, Send, UserRound, X } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { MotionPause } from '../components/MotionPause';
import { AssistantSphere } from './AssistantSphere';
import {
 answers, choose, conversation, depthOf, emergencyAnswer, emergencyIn, handOver, identity, lines, opening, outcomeOf, pulseOf, questionGroups,
 questions, refusals, say, send, silenceIsNotSafety, stateSpec, voice, type Question, type Reply, type Turn
} from '../lib/assistant';
import { refusal } from '../lib/assistant';
import { emptyQueue, handOver as handToQueue, type Handover, type Queue } from '../../../../packages/engines/src/access/domain/handover.ts';
import { useReducedMotion } from '../lib/motion';
import type { Visit } from '../lib/scheduling';
import './assistant.css';

/* Gilbert's panel on the web.

   It opens from the floating orb (components/AssistantLauncher.tsx) and arrives on a dynamic import.
   Nothing in the patient entry may import this file statically, nor AssistantSphere.tsx,
   lib/assistant.ts or the contract behind it.

   A modal dialog, deliberately. On a desktop it is a panel anchored bottom right that grows out of
   the orb; on a phone it is a sheet from the bottom edge. The page behind is inert while it is open,
   focus stays inside, Escape closes it and focus goes back to the orb. It stays mounted once opened,
   so closing and reopening keeps the conversation, which is held in memory and ends with a reload.

   WHAT A PERSON OPENED IT FOR decides the order. The sphere and the state it is in, in words. Then
   the conversation. Then the composer, pinned to the foot of the panel where a thumb is, carrying
   the one sentence that must never scroll away: Gilbert not recognising an emergency does not mean
   there is not one. The suggested questions and the refusals sit under the conversation, because
   they are what somebody reads before they ask and not while they wait.

   A TEXT BOX AND NO MICROPHONE. The founder's decision of 14 September gives the web a text field and
   the same deterministic matcher as the phones, and no listening of any kind: a browser's speech
   recognition sends a voice to the browser's maker. So there is no microphone glyph, no waveform, no
   level driving the sphere and no Listening or Thinking state here, and the build refuses the audio
   APIs anywhere in apps/web/src. The answer arrives at once; nothing adds a pause to look considered.

   THE HANDOVER (Wave 3). Asking for a nurse shows the structured summary first — how the person asked,
   what Gilbert matched, and an urgency — and what does not go with it: their words and which emergency
   words fired. Nothing goes until they press the button, and then it goes to a simulated nurse queue
   through packages/engines/src/access/domain/handover.ts, the same function the Access engine would run.
   The confirmation says it reached no nurse and puts the ambulance numbers after it, because a handover
   to a queue nobody reads must never be the last thing an urgent person is shown. The urgency only
   rises: the panel remembers that an emergency was answered even after the conversation's cap has
   dropped that turn, and a second handover sends nothing new unless the urgency has risen.

   Colour. The panel is brand ink. White on ink 12.04:1 and mint on ink 8.09:1 (declared pairs in
   packages/design-tokens/tokens.json); on the reply bubble, 7% white over ink, white 9.76:1 and mint
   6.55:1; brand ink on the white bubbles, field and buttons 12.04:1. Control edges (mint mixed 62%
   into ink) measure 4.14:1, over the 3:1 a boundary needs. Orange marks the emergency question and
   the escalated sphere as a fill and an edge only — never as text. */

/* `visit` is the patient's next booked visit — the one the home card shows — so Gilbert's answer to
   "When is my nurse coming?" is the same day the home names. */
export type PanelProps = { open: boolean; dismiss: () => void; openModal: (modal: string) => void; visit: Visit | null };

/* The panel has no identity of its own to put on a handover. The token names this browser session
   rather than a person, which is all a preview without an identity service can honestly say. */
const SESSION_SUBJECT = 'subject-this-session';
type Sent = { handover: Handover; sentNow: boolean };

export default function Assistant({ open, dismiss, openModal, visit }: PanelProps) {
 const dialog = useRef<HTMLDialogElement>(null);
 const close = useRef<HTMLButtonElement>(null);
 const latest = useRef<HTMLLIElement>(null);
 const field = useRef<HTMLInputElement>(null);
 const [turns, setTurns] = useState<Turn[]>(() => opening());
 const [draft, setDraft] = useState('');
 const [gatheredAt, setGatheredAt] = useState<number | null>(null);
 const [raised, setRaised] = useState(false);
 const [queue, setQueue] = useState<Queue>(emptyQueue);
 const [sent, setSent] = useState<Record<number, Sent>>({});
 const conversationRef = useRef(crypto.randomUUID());
 const reduced = useReducedMotion();
 const reply = turns[turns.length - 1].reply;
 const asked = turns.length > 1;
 const pulse = asked ? pulseOf(reply) : 'idle';
 const stage = useMemo(() => stageOf(reply, asked), [reply, asked]);
 const everRaised = raised || emergencyIn(turns);
 useEffect(() => { if (emergencyIn(turns)) setRaised(true); }, [turns]);

 /* The dialog follows `open` rather than owning it, so the orb's aria-expanded and the panel can
    never disagree. Close is focused first. The sphere gathers on every opening. */
 useEffect(() => {
  const element = dialog.current;
  if (!element) return;
  if (open && !element.open) { element.showModal(); close.current?.focus(); setGatheredAt(performance.now()); }
  if (!open && element.open) element.close();
 }, [open]);
 /* React's development double-mount closes and reopens the dialog in one pass; only a close that is
    still shut when its event lands is news. See onClose below. */
 useEffect(() => { const element = dialog.current; return () => element?.close(); }, []);
 /* The new reply brought into view without taking focus off what was pressed or typed. */
 useEffect(() => {
  if (!asked) return;
  /* The top of the new exchange rather than its nearest edge: a long answer brought in by its foot
     hides the question it answers. The log is a live region, so a screen reader hears it either way. */
  latest.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
 }, [turns, asked, reduced]);

 /* A modal dialog already makes the page inert; this closes the one gap left, tabbing past the last
    control into the browser's own toolbar, which on a phone with a keyboard is a trap. */
 const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
  if (event.key !== 'Tab' || !dialog.current) return;
  const stops = [...dialog.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')];
  const first = stops[0], last = stops[stops.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
 };

 const moved = (next: Turn[]) => { setTurns(next); setGatheredAt(performance.now()); };
 const put = (question: Question) => moved(choose(turns, question, visit, everRaised));
 const submit = (event: FormEvent) => {
  event.preventDefault();
  if (!draft.trim()) { field.current?.focus(); return; }
  moved(send(turns, draft, visit, everRaised));
  setDraft('');
 };
 /* Starting again is a new conversation: a new reference in the queue and nothing remembered about the old one. */
 const again = () => { moved(opening()); setRaised(false); setSent({}); conversationRef.current = crypto.randomUUID(); };
 const nurse = () => moved(handOver(turns, everRaised));
 const handTo = (turn: Turn) => {
  if (turn.reply.kind !== 'handover') return;
  const result = handToQueue(queue, { conversationRef: conversationRef.current, summary: turn.reply.summary, actorRole: 'patient', subjectRef: SESSION_SUBJECT, now: new Date() });
  if (result.refused) return;
  setQueue(result.value.queue);
  setSent({ ...sent, [turn.id]: { handover: result.value.handover, sentNow: result.value.sentNow } });
 };
 const chip = (question: Question) => <button type="button" key={question.id}
  className={`as-ask${question.answer === 'emergency' ? ' urgent' : ''}`} onClick={() => put(question)}>
  {question.answer === 'emergency' && <Ambulance size={17} aria-hidden="true"/>}{question.asks}</button>;
 const sos = () => openModal('Emergency & urgent care');

 return <dialog ref={dialog} id="assistant-panel" className="as-panel patient-surface" aria-labelledby="as-title"
  onCancel={event => { event.preventDefault(); dismiss(); }}
  onClose={() => { if (open && !dialog.current?.open) dismiss(); }}
  onKeyDown={keepFocus}
  onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
  <div className="as-frame">
   <header className="as-head" data-asked={asked || undefined}>
    <div className="as-bar">
     <div className="as-titles">
      <h2 id="as-title">{identity.name}</h2>
      <p className="as-descriptor">{identity.descriptorLine}</p>
     </div>
     <MotionPause className="as-pause"/>
     <button ref={close} type="button" className="as-close" aria-label="Close Gilbert" onClick={dismiss}><X size={20} aria-hidden="true"/></button>
    </div>
    <AssistantSphere depth={depthOf(reply)} pulse={pulse} gatheredAt={gatheredAt}/>
    {/* What the drawing is showing, in words. The colour and the shape are never the only
        difference between two states. */}
    <div className="as-caption">
     <p className="as-state" data-pulse={pulse}>{stateSpec(pulse).cue}</p>
     {stage.name && <p className="as-name">{stage.name}</p>}
     {stage.figure && <p className="as-figure">{stage.figure}{stage.figureLabel && <span>{stage.figureLabel}</span>}</p>}
    </div>
   </header>

   <div className="as-scroll">
    <NotConnected of="voice"/>
    <div className="as-log" role="log" aria-label={conversation.logLabel}>
     <ol>{turns.map((turn, index) =>
      <li key={turn.id} className="as-turn" ref={index === turns.length - 1 ? latest : undefined}>
       {turn.asked && <p className="as-said"><span className="as-sr">{conversation.youAsked}: </span>{turn.asked}</p>}
       <div className={`as-reply as-reply-${turn.reply.kind}`} data-outcome={outcomeOf(turn)} data-question={turn.matched?.id} data-groups={turn.groups.map(g => g.id).join(' ') || undefined}>
        <span className="as-who">{identity.name}</span>
        <ReplyBody reply={turn.reply} sos={sos} handOver={nurse} sent={sent[turn.id]} onSend={() => handTo(turn)}/>
        {/* Words Gilbert did not read are said to be unread, with the numbers beside them, rather than
            answered around. See readEverything in the contract. */}
        {turn.unread && <Unread sos={sos} handOver={nurse}/>}
       </div>
      </li>)}
     </ol>
    </div>

    <div className="as-asks">
     {questionGroups.map(group => <section key={group.id} aria-labelledby={`as-${group.id}`}>
      <h3 id={`as-${group.id}`}>{group.heading}</h3>
      {group.lead && <p>{group.lead}</p>}
      <div className="as-chips">{questions.filter(q => q.group === group.id).map(chip)}</div>
     </section>)}
     {asked && <button type="button" className="as-again" onClick={again}><RotateCcw size={16} aria-hidden="true"/>{conversation.startAgainLabel}</button>}
    </div>

    <section className="as-rule" aria-labelledby="as-refusals">
     <h3 id="as-refusals">{conversation.refusalsHeading}</h3>
     <ul>{refusals.map(r => <li key={r.id}>{r.statement}</li>)}</ul>
     <p className="as-powered">{identity.poweredBy}. {identity.poweredByMeans}</p>
    </section>
   </div>

   <form className="as-compose" onSubmit={submit}>
    <label htmlFor="as-input">{conversation.inputLabel}</label>
    <div className="as-field">
     {/* Nothing the browser offers to do with what is typed: no spell-check, which some browsers send to
         a server, no autocorrect, no autocomplete history. The keyboard's own dictation is the
         keyboard's, and the note below says so rather than claiming what a page cannot control. */}
     <input ref={field} id="as-input" type="text" value={draft} onChange={event => setDraft(event.target.value)}
      placeholder={conversation.inputHint} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      enterKeyHint="send" maxLength={500} aria-describedby="as-keyboard"/>
     <button type="submit" className="as-send"><Send size={17} aria-hidden="true"/>{conversation.sendLabel}</button>
    </div>
    <p id="as-keyboard" className="as-keyboard">{conversation.webKeyboardNote}</p>
    <p className="as-silence">{silenceIsNotSafety}</p>
   </form>
  </div>
 </dialog>;
}

/* What the stage under the sphere says about the latest reply: a name always, a figure only where
   the contract has one. For the emergency answer that figure is the ambulance number, the one
   number on this screen worth setting large. */
function stageOf(reply: Reply, asked: boolean): { name: string; figure: string | null; figureLabel: string | null } {
 if (reply.kind === 'situation') return reply.situation;
 if (reply.kind === 'emergency') { const [ambulance] = lines(emergencyAnswer.numbers); return { name: ambulance.name, figure: ambulance.number, figureLabel: null }; }
 /* Anything else is named by the state pill above it; a second label saying "Gilbert Pulse" under
    every answer was a word with nothing to say. */
 return { name: asked ? '' : identity.callToAction, figure: null, figureLabel: null };
}

/* The unread answer, after an answer that left words unread. Guiding, never a calm Idle: the words
   Gilbert could not read may be the ones that mattered. */
function Unread({ sos, handOver }: { sos: () => void; handOver: () => void }) {
 return <div className="as-unread">
  <p className="as-headline">{answers.unread.sentence}</p>
  <p>{answers.unread.detail}</p>
  <p>{say(answers.unread.ifUrgent)}</p>
  <Lines ids={answers.unread.numbers}/>
  <div className="as-actions">
   <button type="button" className="as-go" onClick={handOver}><UserRound size={17} aria-hidden="true"/>{answers.unread.handoverLabel}</button>
   <button type="button" className="as-ask urgent" onClick={sos}><Ambulance size={17} aria-hidden="true"/>{answers.unread.sosLabel}</button>
  </div>
 </div>;
}

function Lines({ ids }: { ids: string[] }) {
 return <ul className="as-numbers">{lines(ids).map(n => <li key={n.number}><strong>{n.number}</strong><span>{n.name}</span></li>)}</ul>;
}

type ReplyProps = { reply: Reply; sos: () => void; handOver: () => void; sent?: Sent; onSend: () => void };

function ReplyBody({ reply, sos, handOver, sent, onSend }: ReplyProps) {
 switch (reply.kind) {
  case 'situation': return <p>{reply.situation.sentence}</p>;
  case 'identity': return <><p>{identity.whatItIs}</p><p>{identity.whatItIsNot}</p></>;
  case 'voice': return <><p>{voice.sentences.web}</p><p>{refusal('no-audio-kept').statement}</p></>;
  /* The ambulance first, in the emergency contract's own order. Printed rather than linked, because
     the SOS screen says nothing here dials. The door to Thuso SOS closes the panel before the SOS
     dialog opens, so two modal layers never stack. */
  case 'emergency': return <>
   {reply.groups.length > 0 && <div className="as-noticed"><p>{emergencyAnswer.noticed}</p>
    <ul>{reply.groups.map(g => <li key={g.id}>{g.name}</li>)}</ul></div>}
   <p className="as-headline">{emergencyAnswer.headline}</p>
   <p>{emergencyAnswer.lead}</p>
   <Lines ids={emergencyAnswer.numbers}/>
   <p className="as-quiet">{emergencyAnswer.notAnAmbulance}</p>
   <button type="button" className="as-go" onClick={sos}><Ambulance size={17} aria-hidden="true"/>{emergencyAnswer.sosLabel}<ArrowRight size={16} aria-hidden="true"/></button>
  </>;
  /* The one answer to everything nobody wrote an answer for. It says it cannot assess, it puts the
     numbers where they cannot be missed, and it offers a person rather than a guess. */
  case 'unmatched': return <>
   <p className="as-headline">{answers.unmatched.sentence}</p>
   <p>{answers.unmatched.detail}</p>
   <p>{say(answers.unmatched.ifUrgent)}</p>
   <Lines ids={answers.unmatched.numbers}/>
   <div className="as-actions">
    <button type="button" className="as-go" onClick={handOver}><UserRound size={17} aria-hidden="true"/>{answers.unmatched.handoverLabel}</button>
    <button type="button" className="as-ask urgent" onClick={sos}><Ambulance size={17} aria-hidden="true"/>{answers.unmatched.sosLabel}</button>
   </div>
  </>;
  /* What goes, what does not, and the one button that sends it. After the button: what happened, the
     reference, and the ambulance numbers. */
  case 'handover': {
   const h = answers.handover;
   return <>
    <p className="as-headline">{h.title}</p>
    <p>{h.lead}</p>
    <dl className="as-summary">{reply.rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    {reply.summary.urgencyCode === 'emergency' && <p className="as-lowered">{h.neverLowered}</p>}
    <div className="as-notcarried">
     <p className="as-subhead">{h.notCarriedHeading}</p>
     <ul>{h.notCarried.map(item => <li key={item.id}>{item.sentence}</li>)}</ul>
    </div>
    {sent ? <div className="as-sent" role="status">
     <p className="as-headline">{sent.sentNow ? h.sentTitle : h.alreadySent}</p>
     {sent.sentNow && <p>{h.sent}</p>}
     <dl className="as-summary"><div><dt>{h.sentReference}</dt><dd className="as-ref">{sent.handover.handoverRef}</dd></div></dl>
     <p>{h.stillUrgent}</p>
     <Lines ids={h.numbers}/>
    </div> : <>
     <p className="as-notsent">{h.notSent}</p>
     <button type="button" className="as-go as-handto" onClick={onSend}><Send size={17} aria-hidden="true"/>{h.sendLabel}</button>
    </>}
   </>;
  }
 }
}
