import { Component, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CircleSlash, Minus, RotateCcw, Send, Square, X } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { GilbertAvatar, GilbertStill, type Rig } from './GilbertAvatar';

/* GilbertOne's widget shell — §08's GilbertWidget.tsx, and nothing behind it.
 *
 * §02 gives this surface five modes and this file draws all five: the collapsed launcher, the welcome
 * card, the conversation state, the mobile sheet and the unavailable state. What it deliberately does
 * not have is a conversation controller, a knowledge adapter, a model or a voice adapter — §08's
 * other six modules are phases 2 to 4. So the shell is real and the answers are absent, and the
 * absence is drawn rather than hidden: a message you send is shown back to you and answered by a
 * notice saying nothing is connected, which is exactly §02's unavailable rule — "do not invent an
 * answer or show Connected".
 *
 * NO MICROPHONE, AND NOT AS A DISABLED CONTROL EITHER. §02's conversation row asks for the microphone
 * state to stay visible. On MyThuso's web the honest value of that state is that there is none, and
 * packages/catalog/capabilities.json says so in words the whole product renders word for word — so
 * the widget renders those words through <NotConnected of="voice"/> rather than drawing a control
 * that could be mistaken for one, which the same contract forbids in every state a control has.
 *
 * WHAT A PERSON READS AND WHAT A SCREEN READER READS ARE THE SAME THING. The character is aria-hidden
 * throughout; the state is a sentence in a live region; every control has a written label and a
 * 44×44 target. §10 asks that nothing be said by colour or motion alone, and the way to keep that
 * true is for the motion never to be the only place a thing is said. */

export type WidgetMode = 'collapsed' | 'welcome' | 'conversation';

/* §02's three dashboard chips. They are labels on a demonstrator, not routes: this widget is being
   reviewed on its own, ahead of any connection to the application, and a chip that navigated
   somewhere would be the first live-service claim on the page. */
const CHIPS = ['Book a nurse', 'My visits', 'Ask a question'] as const;

type Turn = { readonly id: number; readonly who: 'person' | 'shell'; readonly text: string };

export type WidgetProps = {
 readonly rig: Rig;
 readonly open: boolean;
 readonly setOpen: (open: boolean) => void;
 /** §02's unavailable / offline mode, switched from the demonstrator's own controls. */
 readonly unavailable: boolean;
 /** Whether somebody is typing, which is one of §04's yawn suppressors. */
 readonly onTyping: (typing: boolean) => void;
 /** AT12: make the rig throw, and watch the surface around it carry on. */
 readonly failRig: boolean;
 /** The words A10's mouth shapes are running against, shown as a caption because there is no audio. */
 readonly caption: readonly string[] | null;
};

/* AT12 asks that a failed avatar does not break the surface around it. A boundary is the only way to
   promise that in React: without one, a rig that throws takes the whole tree with it, and the text —
   the part that must keep working — goes with the drawing. */
class RigBoundary extends Component<{ size: number; children: ReactNode }, { failed: boolean }> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 render() {
  if (!this.state.failed) return this.props.children;
  return <div className="go-rig-failed">
   <GilbertStill size={this.props.size}/>
   <p className="helper">The character stopped drawing. Everything else on this widget still works, which is the point of the test.</p>
  </div>;
 }
 componentDidUpdate(previous: { size: number; children: ReactNode }) {
  /* Recover when the demonstrator switches the failure back off, rather than staying broken until
     the page is reloaded — a boundary that cannot be reset can only be tested once. */
  if (previous.children !== this.props.children && this.state.failed) this.setState({ failed: false });
 }
}

export function GilbertWidget({ rig, open, setOpen, unavailable, onTyping, failRig, caption }: WidgetProps) {
 const [mode, setMode] = useState<WidgetMode>('welcome');
 const [turns, setTurns] = useState<Turn[]>([]);
 const [draft, setDraft] = useState('');
 const launcher = useRef<HTMLButtonElement>(null);
 const heading = useId();
 const next = useRef(0);

 /* Opening the widget is A01's trigger, word for word from §03. It greets once and once only: a
    widget re-opened onto a conversation already in progress reads its last message instead, because
    §03 asks for no repeated introduction. The ref is what makes "once" true across re-renders. */
 const greeted = useRef(false);
 const play = rig.play;
 useEffect(() => {
  if (!open) return;
  play(greeted.current ? 'A05' : 'A01');
  greeted.current = true;
 }, [open, play]);

 /* Escape closes, and focus goes back to the control that opened it. The widget is not a modal: §02
    asks that app content stay reachable, so focus is not trapped and the page behind stays live. */
 useEffect(() => {
  if (!open) return;
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); launcher.current?.focus(); } };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [open, setOpen]);

 const say = (text: string) => setTurns(list => [...list, { id: ++next.current, who: 'shell', text }]);

 const send = (event: FormEvent) => {
  event.preventDefault();
  const text = draft.trim();
  if (!text) return;
  setTurns(list => [...list, { id: ++next.current, who: 'person', text }]);
  setDraft('');
  onTyping(false);
  setMode('conversation');
  /* A05's trigger is a submitted message appearing, and that is all that happens: the message is
     read, and then the shell says what it cannot do. Nothing is sent, so nothing is processed. */
  rig.play('A05');
  say(unavailable
   ? 'GilbertOne is unavailable. Nothing was sent, because there is nowhere for it to go in this phase.'
   : 'No answering engine is connected. This is the widget shell on its own: your words stayed in this browser, went nowhere, and are gone when you close the page.');
 };

 const chip = (label: string) => {
  setMode('conversation');
  rig.play('A06R');
  say(`“${label}” is a label on a demonstrator, not a route. The widget is being reviewed before it is connected to anything, so nothing was opened, booked or looked up.`);
 };

 if (!open) {
  /* §02's collapsed launcher: 56–64 px, lower-right, and it neither speaks nor solicits. */
  return <div className="go-widget go-collapsed">
   <button ref={launcher} type="button" className="go-launcher" aria-label="Open GilbertOne" aria-expanded={false} onClick={() => setOpen(true)}>
    <RigBoundary size={44}><GilbertAvatar pose={rig.pose} size={44} blend={rig.blend} fail={failRig}/></RigBoundary>
   </button>
  </div>;
 }

 return <div className="go-widget" data-mode={mode}>
  <div className="go-panel" role="region" aria-labelledby={heading}>
   {/* The controls come first in the DOM as well as at the top of the panel, so the way out is the
       first thing a keyboard reaches rather than the last. §02 asks that stop and close/minimise stay
       visible in every mode, and they do — on their own row, because three 44px targets and a name
       cannot share 316 pixels with a head. */}
   <header className="go-panel-head">
    <div className="go-panel-controls">
     <button type="button" className="go-icon" aria-label="Stop GilbertOne moving" onClick={rig.stop}><Square size={16}/></button>
     <button type="button" className="go-icon" aria-label={mode === 'conversation' ? 'Minimise to the welcome card' : 'Open the transcript'} onClick={() => setMode(mode === 'conversation' ? 'welcome' : 'conversation')}><Minus size={16}/></button>
     <button type="button" className="go-icon" aria-label="Close GilbertOne" onClick={() => { setOpen(false); launcher.current?.focus(); }}><X size={16}/></button>
    </div>
    <div className="go-identity">
     {/* §02: 56–72 px in a conversation header, and the larger head belongs in the welcome card
         rather than in this row. */}
     {mode === 'conversation' && <RigBoundary size={64}><GilbertAvatar pose={rig.pose} size={64} blend={rig.blend} fail={failRig}/></RigBoundary>}
     <div className="go-titles">
      <strong id={heading}>GilbertOne</strong>
      <small>Your MyThuso Agent</small>
     </div>
    </div>
    {/* Never “Connected”. The state line says what is true of this widget in every mode it has. */}
    <p className="go-state" role="status">{unavailable ? 'Unavailable. There is nothing to connect to in this phase.' : rig.note}</p>
   </header>

   {unavailable
    ? <div className="go-body go-unavailable">
       {/* §02's unavailable row: a plain message, the navigation that still works, and a retry that
           says what it tried. No invented answer and no claim of a connection. */}
       <p className="go-plain"><CircleSlash size={17} aria-hidden="true"/><span>GilbertOne is not available. You can still read and use everything else on this page.</span></p>
       <p className="helper">There is nothing behind this widget yet to reconnect to — no server, no model and no speech. Retry is here so the state can be reviewed, and it will say the same thing.</p>
       <button type="button" className="secondary" onClick={() => { rig.play('A17'); say('Retried, and there is still nothing connected. That is the whole of the failure: nothing was reached, so nothing timed out.'); }}>
        <RotateCcw size={16}/>Retry
       </button>
      </div>
    : <div className="go-body">
       {mode === 'welcome' && <>
        {/* §02's welcome head, at the bottom of its 100–140 range so the greeting, three chips and the
            field are all above the fold of a 340-wide card rather than one scroll below it. */}
        <div className="go-head-art"><RigBoundary size={100}><GilbertAvatar pose={rig.pose} size={100} blend={rig.blend} fail={failRig}/></RigBoundary></div>
        <p className="go-greeting">Hello. GilbertOne is a character and a widget shell, being reviewed before anything is connected behind it.</p>
        <ul className="go-chips">{CHIPS.map(label =>
         <li key={label}><button type="button" className="chip" onClick={() => chip(label)}>{label}</button></li>)}</ul>
       </>}

       {(mode === 'conversation' || turns.length > 0) && <ol className="go-transcript" aria-label="Demonstration transcript">
        {turns.length === 0 && <li className="go-turn go-shell-turn">Nothing has been said yet.</li>}
        {turns.map(turn => <li key={turn.id} className={`go-turn ${turn.who === 'person' ? 'go-person-turn' : 'go-shell-turn'}`}>
         <span className="go-who">{turn.who === 'person' ? 'You typed' : 'Widget shell'}</span>
         <span>{turn.text}</span>
        </li>)}
       </ol>}

       {caption && <p className="go-caption" role="status">
        <span className="go-caption-label">Demonstration caption · no audio is played</span>
        <span>{caption.join(' ')}</span>
       </p>}
      </div>}

   <form className="go-composer" onSubmit={send}>
    <label className="visually-hidden" htmlFor={`${heading}-field`}>Type a message to GilbertOne. Nothing is sent anywhere.</label>
    <input id={`${heading}-field`} value={draft} autoComplete="off"
           placeholder="Type a message"
           onFocus={() => rig.play('A04')}
           onBlur={() => { onTyping(false); rig.rest(); }}
           onChange={event => { setDraft(event.target.value); onTyping(event.target.value.length > 0); }}/>
    <button type="submit" className="go-send" aria-label="Send this message into the demonstration transcript"><Send size={17}/></button>
   </form>
   {/* The voice capability's own words, rendered word for word by the same component every other
       screen uses. It is the widget's microphone state, and it is the true one. */}
   <NotConnected of="voice" tone="inline"/>
  </div>
 </div>;
}
