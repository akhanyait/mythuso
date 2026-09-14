import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Ambulance, ArrowRight, RotateCcw, X } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { MotionPause } from '../components/MotionPause';
import { AssistantSphere, type Level } from './AssistantSphere';
import { ask, opening, questions, stageOf, type Question, type Reply, type Turn } from '../lib/assistant';
import { capability } from '../lib/capabilities';
import { useReducedMotion } from '../lib/motion';
import './assistant.css';

/* The assistant's panel. A drawing of an assistant, and a conversation in shape only.

   It opens from the floating orb (components/AssistantLauncher.tsx) and arrives on a dynamic
   import. Nothing in the patient entry may import this file statically, nor AssistantSphere.tsx
   or lib/assistant.ts.

   A modal dialog, deliberately. On a desktop it is a panel anchored bottom right that grows out of
   the orb. On a phone it is a sheet from the bottom edge. Either way the rest of the page is inert
   while it is open: focus stays inside, Escape closes it, and focus goes back to the orb. It stays
   mounted once opened, so closing it and opening it again keeps the conversation. It is still held
   in memory only, and a reload ends it.

   The composition follows iOS. The sphere comes first, at the top of the panel, and stays there
   while the conversation scrolls under it. The contract's notice is the first thing in the
   conversation, on the light panel it has everywhere else in the app.

   What is deliberately not here. No microphone, waveform, listening state or speech API (`voice`
   is not connected, and its neverSoften rule is the rule this panel is drawn to). No text box:
   see lib/assistant.ts for why a free-text field on a health screen is a symptom typed into
   nothing. No fake typing delay: the reply arrives at once and the sphere gathers instead.

   Colour. The panel is brand ink. Computed with the WCAG formula: white on ink 12.04:1 and mint on
   ink 8.09:1 (both declared pairs in packages/design-tokens/tokens.json); on the reply bubble, 7%
   white over ink, white 9.76:1 and mint 6.55:1; brand ink on the white user bubble and SOS button
   12.04:1. The chip edge (mint mixed 62% into ink) measures 4.14:1 and the orange edge of the
   emergency question 4.24:1, over the 3:1 a control boundary needs. The bubble's hairline is 1.71:1
   and is decoration, not a boundary. Lime is only the drawing's spark and never text. */

export type PanelProps = { open: boolean; dismiss: () => void; openModal: (modal: string) => void };

export default function Assistant({ open, dismiss, openModal }: PanelProps) {
 const dialog = useRef<HTMLDialogElement>(null);
 const close = useRef<HTMLButtonElement>(null);
 const latest = useRef<HTMLLIElement>(null);
 const all = useMemo(() => questions(), []);
 const [turns, setTurns] = useState<Turn[]>(() => opening());
 const [gatheredAt, setGatheredAt] = useState<number | null>(null);
 const reduced = useReducedMotion();
 const voice = capability('voice');
 const stage = stageOf(turns[turns.length - 1].reply);
 const asked = turns.length > 1;

 /* The dialog follows `open` rather than owning it, so the orb's aria-expanded and the panel can
    never disagree. Close is focused first. The sphere gathers on every opening, as iOS does when
    its screen appears; it ignores that under reduced motion. */
 useEffect(() => {
  const element = dialog.current;
  if (!element) return;
  if (open && !element.open) { element.showModal(); close.current?.focus(); setGatheredAt(performance.now()); }
  if (!open && element.open) element.close();
 }, [open]);
 /* The native close event arrives after the fact, and it is only news if the dialog is still shut
    when it lands. React's development double-mount closes and reopens the dialog in one pass, and a
    handler that trusted the event dismissed the panel the instant it opened. The browser can also
    close a modal on its own (a second Escape it will not let a page refuse), and that one is real. */
 useEffect(() => { const element = dialog.current; return () => element?.close(); }, []);
 /* Development only: `?sphere-level=synthetic` drives the sphere from a made-up speech envelope, so
    the reactive drawing can be designed before anything can hear. The whole block, and the module
    it imports, is removed from a production build, where import.meta.env.DEV is false. Nothing in
    it touches a microphone, and nothing on the screen changes to say anything is listening. */
 const [level, setLevel] = useState<Level>();
 useEffect(() => {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('sphere-level') === 'synthetic') {
   let live = true;
   void import('./syntheticLevel.dev').then(module => { if (live) setLevel(() => module.syntheticLevel); });
   return () => { live = false; };
  }
  return undefined;
 }, []);
 /* The new reply, brought into view without taking focus off the question that was pressed. */
 useEffect(() => {
  if (!asked) return;
  latest.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
 }, [turns, asked, reduced]);

 /* A modal dialog already makes the page behind it inert. This closes the one gap that leaves:
    tabbing past the last control would otherwise leave the document for the browser's own
    toolbar, and on a phone with a keyboard attached that is a trap with no way back. */
 const keepFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
  if (event.key !== 'Tab' || !dialog.current) return;
  const stops = [...dialog.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')];
  const first = stops[0], last = stops[stops.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
 };

 const put = (question: Question) => { setTurns(current => ask(current, question)); setGatheredAt(performance.now()); };
 const again = () => { setTurns(opening()); setGatheredAt(performance.now()); };
 const chip = (question: Question) => <button type="button" key={question.id}
  className={`as-ask${question.id === 'emergency' ? ' urgent' : ''}`} onClick={() => put(question)}>
  {question.id === 'emergency' && <Ambulance size={17} aria-hidden="true"/>}{question.asks}</button>;

 return <dialog ref={dialog} id="assistant-panel" className="as-panel patient-surface" aria-labelledby="as-title"
  onCancel={event => { event.preventDefault(); dismiss(); }}
  onClose={() => { if (open && !dialog.current?.open) dismiss(); }}
  onKeyDown={keepFocus}
  onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
  <div className="as-frame">
   <header className="as-head">
    <div className="as-bar">
     <h2 id="as-title">Assistant</h2>
     <MotionPause className="as-pause"/>
     <button ref={close} type="button" className="as-close" aria-label="Close the assistant" onClick={dismiss}><X size={20} aria-hidden="true"/></button>
    </div>
    <AssistantSphere depth={stage.depth} gatheredAt={gatheredAt} level={level}/>
    {/* What the drawing is showing, in words. The colour and the shape are never the only
        difference between two situations. */}
    <div className="as-caption">
     <p className="as-name">{stage.name}</p>
     {stage.figure && <p className="as-figure">{stage.figure}{stage.figureLabel && <span>{stage.figureLabel}</span>}</p>}
    </div>
   </header>

   <div className="as-scroll">
    <NotConnected of="voice"/>
    <div className="as-log" role="log" aria-label="Conversation with the assistant">
     <ol>{turns.map((turn, index) =>
      <li key={turn.id} className="as-turn" ref={index === turns.length - 1 ? latest : undefined}>
       {turn.asked && <p className="as-said"><span className="as-sr">You asked: </span>{turn.asked}</p>}
       <div className="as-reply"><span className="as-who">Assistant</span><ReplyBody reply={turn.reply} openModal={openModal}/></div>
      </li>)}
     </ol>
    </div>

    <div className="as-asks">
     <section aria-labelledby="as-situations">
      <h3 id="as-situations">What the drawing can say</h3>
      <p>Four situations, and the shape each one takes. Nothing on this screen is watching for them yet — you are choosing which to look at.</p>
      <div className="as-chips">{all.filter(q => q.group === 'situations').map(chip)}</div>
     </section>
     <section aria-labelledby="as-always">
      <h3 id="as-always">What it will always answer</h3>
      <div className="as-chips">{all.filter(q => q.group === 'always').map(chip)}</div>
     </section>
     {asked && <button type="button" className="as-again" onClick={again}><RotateCcw size={16} aria-hidden="true"/>Start again</button>}
    </div>

    {/* The rule, on the screen rather than only in a file, as iOS has it. */}
    <section className="as-rule">
     <h3>The rule this screen is built to</h3>
     <p>{voice.neverSoften}</p>
    </section>
   </div>
  </div>
 </dialog>;
}

function ReplyBody({ reply, openModal }: { reply: Reply; openModal: (modal: string) => void }) {
 if (reply.kind === 'situation') return <p>{reply.situation.sentence}</p>;
 /* The notice again, inside the answer. It is also at the head of the panel, but the log is what a
    screen reader follows, and an answer to "why can't you listen" that leaves out "it cannot" is
    not an answer. */
 if (reply.kind === 'cannot-listen') return <>
  <p>{reply.notice}</p>
  <ul className="as-reasons">{reply.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
 </>;
 /* The ambulance first, in the emergency contract's own order. Printed rather than linked, because
    the SOS screen says nothing here dials. The door to Thuso SOS comes last, and it closes the
    panel before the SOS dialog opens, so two modal layers never stack. */
 return <>
  <p className="as-headline">{reply.headline}</p>
  <p>{reply.lead}</p>
  <ul className="as-numbers">{reply.numbers.map(n => <li key={n.number}><strong>{n.number}</strong><span>{n.name}</span></li>)}</ul>
  <p className="as-quiet">{reply.notAnAmbulance}</p>
  <button type="button" className="as-go" onClick={() => openModal('Emergency & urgent care')}>
   <Ambulance size={17} aria-hidden="true"/>Open Thuso SOS<ArrowRight size={16} aria-hidden="true"/></button>
 </>;
}
