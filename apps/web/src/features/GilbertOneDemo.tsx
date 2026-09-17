import { useEffect, useMemo, useRef, useState } from 'react';
import { Contrast, Pause, Play, ShieldX, Sparkles, TriangleAlert } from 'lucide-react';
import { GilbertAvatar, useGilbertRig } from './GilbertAvatar';
import { GilbertWidget } from './GilbertWidget';
import { NotConnected } from '../components/NotConnected';
import { Pill } from '../components/UI';
import { useReducedMotion } from '../lib/motion';
import { t } from '../lib/i18n';
import {
 CUES, REFUSED, TRACK_WORDS, YAWN_COOLDOWN_MS, YAWN_IDLE_MS, YAWN_SUPPRESSORS, durationOf, mayYawn, type Cue
} from '../lib/gilbertone';
import './gilbertone.css';

/* GilbertOne, phase 1: the character demonstrator.
 *
 * Reached at /app/?preview=gilbertone and from nowhere else — see src/Doorway.tsx. It is behind a
 * dynamic import and off every navigation in the product, because a patient opening her own visits
 * on metered data has no reason to download a design review, and because this is a review surface
 * rather than a screen anybody is meant to find.
 *
 * WHAT THIS PAGE IS FOR. §11's phase 1 asks for "a genuinely interactive React preview with the clean
 * transparent robot", with controls for each cue, and for the demo states to be explicitly labelled
 * with no patient data and no live-service claims. So the page is a stage, a control per cue, and a
 * written account of what each control did — because the whole value of a motion review is being
 * able to fire two things in the wrong order and see which one the face obeyed.
 *
 * WHAT IT IS NOT. There is no conversation controller, no knowledge adapter, no model, no server and
 * no voice adapter: §08's other six modules are phases 2 to 4, and each of those phases is gated on a
 * decision — a pinned model checkpoint, a speech provider, a clinical review of care content — that
 * MyThuso has not made. Nothing here reaches the network at all. Two cues from the document's own
 * tables are refused rather than drawn, and the reasons are on the page under "What this phase will
 * not do", where a reviewer looking for the missing states will find them.
 *
 * THIS IS THE PREVIEW, NOT THE LIVE ASSISTANT. The shipped GilbertOne is
 * packages/catalog/assistant.json's matcher, its descriptor line and its founder-decided voice
 * policy, and nothing on this page touches, reads or stands in for any of it. Preview and live are
 * kept apart on every line for exactly the reason the descriptor carries its own disclosure: a
 * demonstrator read as the product is a promise nobody made. */

/* The ground behind the stage, and the reason it is a control rather than a background. AT01 asks a
   reviewer to confirm the character is genuinely transparent — no panel, no neon cloud — and the only
   way to confirm that is to put it on more than one ground and watch nothing change about it. */
const GROUNDS = [
 { id: 'light', label: 'Light ground' },
 { id: 'dark', label: 'Dark ground' },
 { id: 'checked', label: 'Chequered ground' }
] as const;
type Ground = typeof GROUNDS[number]['id'];

/* The words A10's mouth runs against. They are the caption, they are shown while the mouth moves, and
   they say what they are: there is no audio here to follow, and none is implied. */
const CAPTION = 'This is a demonstration caption. The mouth follows these written words, because no audio is played and no voice is synthesised.'.split(' ');

/* The stage size. One number, because a rig that changes size when a setting changes is a layout
   jump dressed as a preference. */
const STAGE_SIZE = 240;

const attention = (cue: Cue) => cue.id.startsWith('A0');

export default function GilbertOneDemo() {
 const systemReduced = useReducedMotion();
 const [previewReduced, setPreviewReduced] = useState(false);
 const reduced = systemReduced || previewReduced;
 const [paused, setPaused] = useState(false);
 const rig = useGilbertRig({ reduced, paused });

 const [ground, setGround] = useState<Ground>('light');
 const [playful, setPlayful] = useState(false);
 const [typing, setTyping] = useState(false);
 const [open, setOpen] = useState(false);
 const [unavailable, setUnavailable] = useState(false);
 const [failRig, setFailRig] = useState(false);
 const [caption, setCaption] = useState<readonly string[] | null>(null);
 const [lastYawn, setLastYawn] = useState(0);
 const [now, setNow] = useState(() => Date.now());

 /* One second's tick, and only while a cooldown is actually running. A countdown that keeps
    counting after it has reached zero is a timer nobody switched off. */
 const cooling = lastYawn > 0 && now - lastYawn < YAWN_COOLDOWN_MS;
 useEffect(() => {
  if (!cooling) return;
  const timer = window.setInterval(() => setNow(Date.now()), 1000);
  return () => window.clearInterval(timer);
 }, [cooling]);

 const timers = useRef<number[]>([]);
 useEffect(() => () => { for (const timer of timers.current) window.clearTimeout(timer); }, []);
 const later = (ms: number, run: () => void) => { timers.current.push(window.setTimeout(run, ms)); };

 const yawn = useMemo(() => mayYawn({ playful, running: rig.running, typing, sinceCooldown: lastYawn ? now - lastYawn : YAWN_COOLDOWN_MS, reduced }),
  [playful, rig.running, typing, lastYawn, now, reduced]);

 /* One control, one cue — except for the three the manifest treats differently. A02 is ambient and
    the control returns to it rather than playing it; A03 is an articulation rather than a cue; A14
    asks its own question first, and is refused in words when the answer is no. */
 const fire = (cue: Cue) => {
  setNow(Date.now());
  if (cue.id === 'A02') return rig.rest();
  if (cue.id === 'A03') return rig.blink(false, true);
  if (cue.id === 'A14') {
   if (!yawn.allowed) return;
   setLastYawn(Date.now());
   return rig.play('A14');
  }
  if (cue.id === 'A10') {
   setCaption(CAPTION);
   rig.play('A10', { caption: CAPTION });
   /* The caption leaves when the mouth closes, so there is never a caption on the screen for words
      that are not being shaped. */
   return later(CAPTION.length * 240 + 400, () => setCaption(null));
  }
  rig.play(cue.id);
 };

 /* AT05, made pressable. A turn is minted, a newer trigger takes the face, and then the older one is
    delivered late — which is the case the document says must never restart the mouth or change the
    face. The status line reports which landed and why the other did not. */
 const staleTurn = () => {
  const stale = rig.mintTurn();
  rig.play('A09');
  later(320, () => rig.play('A12', { turn: stale }));
 };

 const badge = t('shell.previewBadge', 'en-ZA');

 return <div className="go-demo" data-ground={ground}>
  <header className="go-demo-head">
   <p className="demo-pill" role="note"><span className="status-dot"/>{badge}</p>
   <p className="eyebrow">GilbertOne · Phase 1 of 4</p>
   <h1>Character demonstrator</h1>
   <p className="go-lede">
    A rig, a widget shell and a control for every cue in the scope document's animation tables. There is no model
    behind it, no server, no speech and no conversation: this page exists so the motion can be reviewed before any of
    those decisions are made. Nothing here is a MyThuso service, nothing is sent anywhere, and nothing is kept.
   </p>
   <p className="helper"><ShieldX size={15} aria-hidden="true"/><span>
    This is a preview of GilbertOne's presentation, not GilbertOne itself. It previews look and animation only: the
    live GilbertOne's matcher, voice and handover are unchanged, and this page is wired to none of them.
   </span></p>
  </header>

  <main id="main" tabIndex={-1} className="go-demo-grid">
   <section className="go-stage-panel panel" aria-labelledby="go-stage-title">
    <h2 id="go-stage-title">The character</h2>
    {/* The alpha canvas, on whichever ground the reviewer chooses. Nothing is drawn behind the
        character at any size: the grounds belong to this panel, not to the artwork. */}
    <div className="go-stage" data-ground={ground}>
     <GilbertAvatar pose={rig.pose} size={STAGE_SIZE} blend={rig.blend}/>
    </div>
    <fieldset className="chip-set go-grounds">
     <legend><Contrast size={14} aria-hidden="true"/> Ground behind the character</legend>
     {GROUNDS.map(option => <label key={option.id} className={`chip${ground === option.id ? ' is-on' : ''}`}>
      <input type="radio" name="go-ground" checked={ground === option.id} onChange={() => setGround(option.id)}/>
      {option.label}
     </label>)}
    </fieldset>
    <p className="helper">The character has a genuine alpha background — no panel, no glow cloud, no orbit rings, no
     glitter — and one soft contact shadow. Change the ground and nothing about it should change but the shadow.</p>

    {/* The one place the rig speaks, and it speaks in words. Nothing on this page is said by motion
        or by colour alone, which is what §10 asks for and what a status line is for. */}
    <div className="go-status" role="status" aria-live="polite">
     <p className="go-status-note">{rig.note}</p>
     <p className="helper">
      {rig.running ? `Running ${rig.running.id} ${rig.running.name} · ${TRACK_WORDS[rig.running.track]}` : 'Nothing running · idle'}
      {' · '}turn {rig.state.turn}
      {rig.hidden && ' · this tab is hidden, so every timer has stopped'}
     </p>
    </div>
   </section>

   <section className="go-controls" aria-labelledby="go-controls-title">
    <h2 id="go-controls-title">Controls</h2>

    {/* Accessibility first, and pinned, because §10 asks for a persistent pause and a reader who
        wants stillness should not have to scroll past eighteen animation buttons to ask for it. */}
    <div className="panel go-access">
     <h3>Motion and access</h3>
     <div className="go-access-row">
      <button type="button" className="secondary go-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)}>
       {paused ? <Play size={16}/> : <Pause size={16}/>}{paused ? 'Play animation' : 'Pause animation'}
      </button>
      <button type="button" className="secondary go-toggle" aria-pressed={previewReduced} onClick={() => setPreviewReduced(!previewReduced)}>
       Reduced motion: {previewReduced ? 'on' : 'off'}
      </button>
      <button type="button" className="secondary go-toggle" aria-pressed={playful} onClick={() => setPlayful(!playful)}>
       <Sparkles size={16}/>Playful mode: {playful ? 'on' : 'off'}
      </button>
     </div>
     <p className="helper">
      {systemReduced
       ? 'Your system asks for reduced motion, so GilbertOne is already still: the cues set a static expression and say what they are in words instead of moving. The switch above cannot turn that off.'
       : 'The pause control is independent of your system setting and holds for every cue, the blink and the idle drift. Reduced motion here previews what a reader who has asked their system for less motion sees.'}
     </p>
     <p className="helper">Playful mode is off by default, which is the state of a care conversation. It is the only state in
      which GilbertOne yawns.</p>
    </div>

    <CueList title="Attention" lead="The scope document's table A01 to A09. Every timing is inside the range it gives, and A02 is the one that puts the face back: it returns GilbertOne to rest and releases any pose still being held."
             cues={CUES.filter(attention)} fire={fire} reduced={reduced} yawn={yawn}/>
    <CueList title="Expression" lead="Table A10 to A17. Mouth movement, response style and the two events that may not wait."
             cues={CUES.filter(cue => !attention(cue))} fire={fire} reduced={reduced} yawn={yawn}/>

    <div className="panel">
     <h3>Ownership and cancellation</h3>
     <p className="helper">Priority runs {Object.values(TRACK_WORDS).join(' → ').toLowerCase()}. A cue may displace one on its own
      track or a lower one, and never a higher one — which is why no smile, greeting or yawn can land while the urgent pose holds.</p>
     <div className="go-access-row">
      <button type="button" className="secondary" onClick={staleTurn}>Deliver a late trigger from an earlier turn</button>
      <button type="button" className="secondary" onClick={() => { rig.play('A16'); later(250, () => rig.play('A13')); }}>Try to smile during the urgent pose</button>
      <button type="button" className="secondary" onClick={rig.stop}>Stop</button>
      <button type="button" className="secondary" onClick={rig.rest}>Release any held pose</button>
     </div>
     <p className="helper">The first two fire two triggers in a row and leave the reason the second one did or did not land in the
      status line above.</p>
     <p className="helper">Stop is an interruption, and an interruption is below safety: it cancels speech and a stale cue and it
      cannot dismiss the urgent pose. The urgent pose ends when whatever raised it says so — here, the control beside it — because a
      face that relaxes out of an urgent state because somebody pressed stop is a face that says the urgency has passed when nothing
      has happened.</p>
    </div>

    <div className="panel">
     <h3>The widget</h3>
     <p className="helper">The launcher sits in the lower-right corner; opening it greets you once, the text field is read rather
      than answered, and the unavailable state says so plainly instead of inventing a reply.</p>
     <div className="go-access-row">
      <button type="button" className="secondary" aria-pressed={open} onClick={() => setOpen(!open)}>{open ? 'Close the widget' : 'Open the widget'}</button>
      <button type="button" className="secondary" aria-pressed={unavailable} onClick={() => setUnavailable(!unavailable)}>Unavailable state: {unavailable ? 'on' : 'off'}</button>
      <button type="button" className="secondary" aria-pressed={failRig} onClick={() => setFailRig(!failRig)}>Break the character: {failRig ? 'on' : 'off'}</button>
     </div>
     <p className="helper">Breaking the character makes the rig throw. The widget keeps its text, its controls and its transcript,
      and falls back to a still head — which is the whole of what AT12 asks about a failed avatar.</p>
    </div>
   </section>

   <section className="go-refusals panel" aria-labelledby="go-refusals-title">
    <h2 id="go-refusals-title">What this phase will not do</h2>
    <p className="helper">Two cues in the document's tables are declared here and not drawn. They are listed rather than quietly
     left out, so a reviewer looking for the two states about hearing and speaking finds the reason instead of a gap.</p>
    <ul className="go-refusal-list">
     {REFUSED.map(refusal => <li key={refusal.id}>
      <p className="go-refusal-head"><Pill tone="plain">{refusal.id}</Pill><strong>{refusal.name}</strong></p>
      <p className="go-refusal-statement"><TriangleAlert size={16} aria-hidden="true"/><span>{refusal.statement}</span></p>
      <p className="helper">{refusal.why}</p>
     </li>)}
    </ul>
    <NotConnected of="voice"/>
    <h3>The yawn, and everything that stops it</h3>
    <p className="helper">Off by default in a care conversation. In playful mode it may run once after {YAWN_IDLE_MS / 1000} seconds of
     inactivity, with {YAWN_COOLDOWN_MS / 60000} minutes between yawns, and it is suppressed during: {YAWN_SUPPRESSORS.join(', ')}.
     The control above obeys all of that, including when a reviewer is the one pressing it.</p>
    <h3>Not in this phase at all</h3>
    <ul className="go-plain-list">
     <li>No language model, no knowledge retrieval and no server. Nothing on this page makes a network request of any kind.</li>
     <li>No conversation memory, no task state and no recipient context. What you type is held in this browser for as long as the
      page is open, is written to no storage of any kind, and goes nowhere.</li>
     <li>No voice, in either direction: nothing is captured, nothing is synthesised and no permission is requested. No camera is
      requested either, in any state.</li>
     <li>No patient data, no fictional patient record and no clinical content. The transcript holds your own words and the shell's
      replies about itself.</li>
    </ul>
   </section>
  </main>

  <GilbertWidget rig={rig} open={open} setOpen={setOpen} unavailable={unavailable} onTyping={setTyping} failRig={failRig} caption={caption}/>
 </div>;
}

/* One table, one panel, one row per cue — with the document's own trigger and motion wording under
   each control. A reviewer pressing a button should be able to read what the specification asked for
   without leaving the page, because "is this what we asked for" is the only question a motion review
   is actually trying to answer. */
function CueList({ title, lead, cues, fire, reduced, yawn }: {
 title: string; lead: string; cues: readonly Cue[]; fire: (cue: Cue) => void; reduced: boolean;
 yawn: { allowed: boolean; because: string };
}) {
 return <div className="panel go-cues">
  <h3>{title}</h3>
  <p className="helper">{lead}</p>
  <ul className="go-cue-list">
   {cues.map(cue => {
    const isYawn = cue.id === 'A14';
    const blocked = isYawn && !yawn.allowed;
    const stillOnly = reduced && !cue.still;
    return <li key={cue.id} className="go-cue">
     <button type="button" className="secondary go-cue-button" disabled={blocked} onClick={() => fire(cue)}>
      <span className="go-cue-id">{cue.id}</span>
      <span className="go-cue-name">{cue.name}</span>
     </button>
     <div className="go-cue-words">
      <p className="go-cue-meta">{TRACK_WORDS[cue.track]} · {durationOf(cue)} ms</p>
      <p className="helper"><strong>Trigger.</strong> {cue.trigger}</p>
      <p className="helper">{cue.motion}</p>
      {blocked && <p className="go-cue-blocked" role="note">{yawn.because}</p>}
      {stillOnly && !blocked && <p className="go-cue-blocked" role="note">Under reduced motion this cue is movement with nothing still behind it, so it does not play. The status line says what it would have done.</p>}
     </div>
    </li>;
   })}
  </ul>
 </div>;
}
