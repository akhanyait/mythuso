import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Ambulance, ArrowRight, RotateCcw, Send, UserRound, X } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { MotionPause } from '../components/MotionPause';
import { AssistantVoiceButton } from '../components/AssistantVoiceButton';
import { AssistantSphere } from './AssistantSphere';
import {
  answers, choose, conversation, depthOf, emergencyAnswer, emergencyIn, handOver, identity, lines, opening, outcomeOf, pulseOf, questionGroups,
  questions, refusals, say, silenceIsNotSafety, stateSpec, voice, type Question, type Reply, type Turn
} from '../lib/assistant';
import { handoverDeskWords as bookingHandover, refusal } from '../lib/assistant';
import { sendWithGilbertEngine } from '../lib/gilbertone-bridge';
import { emptyQueue, handOver as handToQueue, type Handover, type Queue } from '../../../../packages/engines/src/access/domain/handover.ts';
import { useReducedMotion } from '../lib/motion';
import type { Visit } from '../lib/scheduling';
import './assistant.css';

/* GilbertOne's panel on the web.

   It opens from the floating orb (components/AssistantLauncher.tsx) and arrives on a dynamic import.
   Nothing in the patient entry may import this file statically, nor AssistantSphere.tsx,
   lib/assistant.ts or the contract behind it.

    ...
*/
export type PanelProps = { open: boolean; dismiss: () => void; openModal: (modal: string) => void; visit: Visit | null };

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

  useEffect(() => {
   const element = dialog.current;
   if (!element) return;
   if (open && !element.open) { element.showModal(); close.current?.focus(); setGatheredAt(performance.now()); }
   if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => { const element = dialog.current; return () => element?.close(); }, []);
  useEffect(() => {
   if (!asked) return;
   latest.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [turns, asked, reduced]);

  const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
   if (event.key !== 'Tab' || !dialog.current) return;
   const stops = [...dialog.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')];
   const first = stops[0], last = stops[stops.length - 1];
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const moved = (next: Turn[]) => { setTurns(next); setGatheredAt(performance.now()); };
  const put = (question: Question) => moved(choose(turns, question, visit, everRaised));
  const onVoiceTranscript = (text: string) => {
    setDraft(current => (current ? `${current} ${text}`.trim() : text));
    field.current?.focus();
  };
  const submit = (event: FormEvent) => {
   event.preventDefault();
   if (!draft.trim()) { field.current?.focus(); return; }
   moved(sendWithGilbertEngine(turns, draft, visit, everRaised));
   setDraft('');
  };
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
      <button ref={close} type="button" className="as-close" aria-label="Close GilbertOne" onClick={dismiss}><X size={20} aria-hidden="true"/></button>
     </div>
     <AssistantSphere depth={depthOf(reply)} pulse={pulse} gatheredAt={gatheredAt}/>
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
      <input ref={field} id="as-input" type="text" value={draft} onChange={event => setDraft(event.target.value)}
       placeholder={conversation.inputHint} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
       enterKeyHint="send" maxLength={500} aria-describedby="as-keyboard"/>
      <AssistantVoiceButton onTranscript={onVoiceTranscript} />
      <button type="submit" className="as-send"><Send size={17} aria-hidden="true"/>{conversation.sendLabel}</button>
     </div>
     <p id="as-keyboard" className="as-keyboard">{conversation.webKeyboardNote}</p>
     <p className="as-silence">{silenceIsNotSafety}</p>
    </form>
   </div>
  </dialog>;
}

function stageOf(reply: Reply, asked: boolean): { name: string; figure: string | null; figureLabel: string | null } {
  if (reply.kind === 'situation') return reply.situation;
  if (reply.kind === 'emergency') { const [ambulance] = lines(emergencyAnswer.numbers); return { name: ambulance.name, figure: ambulance.number, figureLabel: null }; }
  return { name: asked ? '' : identity.callToAction, figure: null, figureLabel: null };
}

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
   case 'emergency': return <>
    {reply.groups.length > 0 && <div className="as-noticed"><p>{emergencyAnswer.noticed}</p>
     <ul>{reply.groups.map(g => <li key={g.id}>{g.name}</li>)}</ul></div>}
    <p className="as-headline">{emergencyAnswer.headline}</p>
    <p>{emergencyAnswer.lead}</p>
    <Lines ids={emergencyAnswer.numbers}/>
    <p className="as-quiet">{emergencyAnswer.notAnAmbulance}</p>
    <button type="button" className="as-go" onClick={sos}><Ambulance size={17} aria-hidden="true"/>{emergencyAnswer.sosLabel}<ArrowRight size={16} aria-hidden="true"/></button>
   </>;
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
   case 'handover': {
    const h = answers.handover;
    const desk = reply.desk;
    return <>
     <p className="as-headline">{h.title}</p>
     {desk.outOfHours && <div className="as-desk" role="status">
      <p className="as-desk-nobody">{desk.outOfHours.nobody}</p>
      <p className="as-desk-numbers">{desk.outOfHours.numbers}</p>
      {desk.outOfHours.callback && <p className="as-desk-callback">{desk.outOfHours.callback}</p>}
     </div>}
     <p>{h.lead}</p>
     <dl className="as-summary">{reply.rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
     <p className="as-answered-by"><strong>{bookingHandover.answeredByLabel}</strong> {desk.answeredBy}</p>
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
