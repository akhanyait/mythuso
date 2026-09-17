import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Contrast, Mic, MicOff, Pause, Play, Repeat, ShieldX, Sparkles, SquarePen, TriangleAlert } from 'lucide-react';
import { GilbertAvatar, useGilbertRig } from './GilbertAvatar';
import { GilbertWidget } from './GilbertWidget';
import { NotConnected } from '../components/NotConnected';
import { Pill } from '../components/UI';
import { useReducedMotion } from '../lib/motion';
import { t } from '../lib/i18n';
import {
 CUES, REFUSED, SPOKEN_ANSWERS, TRACK_WORDS, TRANSCRIPT_REVIEW, VOICE_NEVER_SOFTEN, VOICE_SENTENCES, VOICE_STATES,
 VOICE_TABLE, VOICE_WEB_POC_SCOPE, YAWN_COOLDOWN_MS, YAWN_IDLE_MS, YAWN_SUPPRESSORS, durationOf, mayYawn, type Cue
} from '../lib/gilbertone';
import { BEFORE_PERMISSION, FAILURE_SENTENCES, useVoiceAdapter } from '../lib/voice';
import { voice as voicePolicy } from '../../../../packages/catalog/assistant.json';
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
 * WHAT IT IS NOT. There is no conversation controller, no knowledge adapter, no model and no server:
 * §08's other modules are phases 2 to 4, and each of those phases is gated on a decision — a pinned
 * model checkpoint, hosting, a clinical review of care content — that MyThuso has not made. Nothing
 * here reaches the network at all. What is still refused is on the page under "What this phase will
 * not do", where a reviewer looking for a missing thing will find the reason instead of a gap.
 *
 * §07'S VOICE IS REAL HERE, AND ONLY HERE, from 17 September 2026. The founder asked for the
 * browser's own recogniser behind a push-to-talk control and the browser's own voice reading the
 * demonstration answer out, so that the four microphone states, the transcript review and a mouth
 * running against real playback could be judged rather than described. The decision is on file as
 * `voice.webPoc` in packages/catalog/assistant.json; the machinery is lib/voice.ts and nothing else;
 * and every other screen on the web is still typed to, because a browser's recognition may hand what
 * somebody said to the company that makes the browser and a patient asking about her own health has
 * not chosen that the way a reviewer opening a demonstrator has.
 *
 * IT IS ON THE DEPLOYED SITE from 17 September 2026, having been development-only until then, and
 * that is the reason the disclosure before the first tap matters more here than it would behind a
 * dev server: a reviewer with the address can open it, and so can anybody else who is given one.
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

/* The words A10 speaks, and the caption shown while it speaks them — one list, so the two cannot
   disagree. They say what they are: a fixed sentence, not an answer to anything. */
const CAPTION = 'This is a demonstration answer. Your browser is reading these words out, and nothing on this page understood the question.'.split(' ');

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
 /* §07's "explicit playback choice", and the only choice there is to make here: whether the
    demonstration answer is given at all. There is no switch for the caption itself, because the
    caption is not a subtitle of something else — it is the output. */
 const [spoken, setSpoken] = useState(true);
 const [review, setReview] = useState(false);
 /* What the review field opens on, and where those words came from. A capture fills it; the control
    in the voice panel opens the step on the fixed example instead, so the shape can be inspected
    without speaking. */
 const [reviewSeed, setReviewSeed] = useState<string>(TRANSCRIPT_REVIEW.example);
 const [reviewFromMicrophone, setReviewFromMicrophone] = useState(false);
 const [lastYawn, setLastYawn] = useState(0);
 const [now, setNow] = useState(() => Date.now());

 const voice = useVoiceAdapter();
 const capturing = voice.state === 'starting' || voice.state === 'open';

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

 const yawn = useMemo(() => mayYawn({ playful, running: rig.running, typing, sinceCooldown: lastYawn ? now - lastYawn : YAWN_COOLDOWN_MS, reduced, capturing }),
  [playful, rig.running, typing, lastYawn, now, reduced, capturing]);

 /* The captured words go to §07's review step, and they go there when the microphone closes rather
    than while it is open: a field that rewrites itself under somebody's eyes while they are still
    speaking is not a thing anybody can check. The ref is what makes this happen once per capture —
    the transcript is still in state afterwards, and an effect watching it alone would reopen the
    panel every time anything else on the page changed. */
 const wasCapturing = useRef(false);
 useEffect(() => {
  if (capturing) { wasCapturing.current = true; return; }
  if (!wasCapturing.current) return;
  wasCapturing.current = false;
  const words = voice.transcript.trim();
  if (!words) return;
  setReviewSeed(words);
  setReviewFromMicrophone(true);
  setOpen(true);
  setReview(true);
 }, [capturing, voice.transcript]);

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
   if (!spoken) return;
   return speak();
  }
  /* §04: a stop event cancels current speech as well as stale cues, and a safety override stops
     everything decorative and surfaces the action immediately. The voice is not part of the rig, so
     both of those have to reach it separately — a face that has gone still while a cheerful sentence
     carries on being read out is the failure §04's ordering exists to prevent. */
  if (cue.id === 'A15' || cue.id === 'A16') voice.cancel();
  rig.play(cue.id);
 };

 /* A10, and §07's replay in the same function: the same fixed words are spoken again, and nothing is
    re-run, re-asked or resubmitted to produce them — which is the whole of what §07 asks replay to
    be, and easy to promise here because there was never anything behind them.
    The mouth follows real playback. Where the browser reports word boundaries, each word is shaped as
    it is spoken; where it does not, the timed caption track starts at the utterance's own start event
    and carries on, which is §07's restrained fallback and is said in words beside the caption. The
    caption goes up before the voice does and comes down when it stops, so there is never a caption on
    the screen for words nobody is saying, and never a word said without one. */
 const speak = () => {
  setCaption(CAPTION);
  const sentence = CAPTION.join(' ');
  if (!voice.canSpeak) {
   /* No synthesiser in this browser at all. The cue still runs against the written words, and the
      caption's own label says the timing is the caption's rather than a voice's. */
   rig.play('A10', { caption: CAPTION });
   later(CAPTION.length * 240 + 400, () => setCaption(null));
   return;
  }
  voice.speak(sentence, {
   onStart: () => rig.play('A10', { caption: CAPTION }),
   onWord: word => rig.play('A10', { caption: [word] }),
   /* An empty caption track is one step that closes the mouth — which is what §07 asks for on end,
      on cancel and on failure alike, and this fires for all three. */
   onEnd: () => { rig.play('A10', { caption: [] }); setCaption(null); }
  });
 };

 /* The push-to-talk control, and the whole of what it does. One tap opens, the next closes, and
    nothing else on the page can open it — which is the gesture the contract already chose for the
    phones, for the reason it gives: a hold shuts out VoiceOver, TalkBack and anybody with a tremor. */
 const talk = () => {
  if (voice.state === 'open' || voice.state === 'starting') return voice.stop();
  voice.clearFailure();
  voice.start();
 };

 /* The caption lives in the widget, so the control that plays it from the voice panel opens the
    widget first and lets the greeting land before the words start. A01's trigger is the widget being
    opened; firing both in the same breath puts the caption on the face first and leaves the greeting
    refused by priority, which is correct and reads as a fault. */
 const speakInWidget = () => {
  if (open) return speak();
  setOpen(true);
  later(120, speak);
 };

 /* Why a control is refused, in the one place that knows all the reasons. A refused control says so
    in words in its own row rather than going quietly grey: colour is never the only difference
    between a control that will run and one that will not. */
 const blockedFor = (cue: Cue) => {
  if (cue.id === 'A14' && !yawn.allowed) return yawn.because;
  if (cue.id === 'A10' && !spoken) return SPOKEN_ANSWERS.offReason;
  return null;
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
    A rig, a widget shell and a control for every cue in the scope document's animation tables, with §07's voice built
    for real on this page alone: your browser's microphone behind one push-to-talk control, and your browser's voice
    reading a fixed demonstration answer out. There is no model behind it, no server and no conversation — nothing here
    understands a word you say. Nothing on this page is a MyThuso service, nothing is sent to MyThuso, and nothing is kept.
   </p>
   <p className="helper"><ShieldX size={15} aria-hidden="true"/><span>
    This is a preview of GilbertOne's presentation, not GilbertOne itself. The live GilbertOne's matcher and handover are
    unchanged and this page is wired to neither. {VOICE_WEB_POC_SCOPE}
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
             cues={CUES.filter(attention)} fire={fire} reduced={reduced} blockedFor={blockedFor}/>
    <CueList title="Expression" lead="Table A10 to A17. Mouth movement, response style and the two events that may not wait."
             cues={CUES.filter(cue => !attention(cue))} fire={fire} reduced={reduced} blockedFor={blockedFor}/>

    <div className="panel">
     <h3>Ownership and cancellation</h3>
     <p className="helper">Priority runs {Object.values(TRACK_WORDS).join(' → ').toLowerCase()}. A cue may displace one on its own
      track or a lower one, and never a higher one — which is why no smile, greeting or yawn can land while the urgent pose holds.</p>
     <div className="go-access-row">
      <button type="button" className="secondary" onClick={staleTurn}>Deliver a late trigger from an earlier turn</button>
      <button type="button" className="secondary" onClick={() => { voice.cancel(); rig.play('A16'); later(250, () => rig.play('A13')); }}>Try to smile during the urgent pose</button>
      <button type="button" className="secondary" onClick={() => { voice.cancel(); rig.stop(); }}>Stop</button>
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

   {/* §07, built. The control below opens a real microphone, and the two things that make that
       defensible are both in this panel rather than in a document: the disclosure sits above the
       control and is read before the first tap, and the state is a sentence that only ever says the
       microphone is open when the browser has said so. This page is on the deployed site. */}
   <section className="go-voice panel" aria-labelledby="go-voice-title">
    <h2 id="go-voice-title">Voice · §07, built on this page only</h2>
    <p className="helper">§07 asks for push-to-talk input with four clear states and a transcript shown for review, the
     browser's speech for the output, mouth movement driven by playback, timing that closes the mouth the moment anything
     stops, and a position on retained audio. All of it is built here. None of it is built anywhere else in MyThuso on
     the web, and nothing behind it answers: what your browser catches is shown back to you to correct, and what is
     spoken is a fixed sentence this page already had.</p>

    {/* The disclosure, above the control, always — not once, not behind a link, and not after the
        first tap. §07 asks that the route be disclosed and permission obtained before capture, and a
        page that opens a microphone and then explains has already taken the voice it was explaining
        about. */}
    <p className="go-voice-note" role="note" id="go-mic-disclosure">{BEFORE_PERMISSION}</p>

    <div className="go-mic">
     <button type="button" className="go-mic-button" data-state={voice.state} disabled={!voice.supported}
             aria-describedby="go-mic-disclosure go-mic-state" onClick={talk}>
      {capturing ? <Mic size={18} aria-hidden="true"/> : <MicOff size={18} aria-hidden="true"/>}
      {voice.state === 'open' || voice.state === 'starting' ? voicePolicy.sentences.stopLabel : voicePolicy.sentences.talkLabel}
     </button>
     {/* The state in words, every time, and never by the icon or the colour alone. "Listening" is
         written only in the one state the recogniser has told us the microphone is open in. */}
     <p className="go-mic-state" id="go-mic-state" role="status" aria-live="polite">
      <strong>{voice.supported ? VOICE_STATES.find(state => state.id === voice.state)?.name : 'Not available in this browser'}.</strong>{' '}
      {!voice.supported
       ? FAILURE_SENTENCES.unavailable
       : voice.state === 'off' ? 'The microphone is shut. It opens when you tap, and at no other moment.'
       : voice.state === 'starting' ? 'Asked for, and not open yet. Your browser may be deciding, or asking you.'
       : voice.state === 'open' ? `The microphone is open. It closes when you tap Stop, or after ${voice.maxListeningSeconds} seconds, whichever comes first.`
       : voice.failureSentence}
     </p>
     {voice.transcript && <p className="go-mic-words"><span className="go-mic-words-label">What your browser has sent back so far</span>{voice.transcript}</p>}
    </div>

    <div className="go-voice-grid">
     <div>
      <h3>The capability table, and what is built against each row</h3>
      <dl className="go-voice-table">
       {VOICE_TABLE.map(row => <div key={row.id} className="go-voice-row">
        <dt>{row.capability}</dt>
        <dd>
         <p className="go-voice-poc">{row.poc}</p>
         <p className="helper">{row.here}</p>
        </dd>
       </div>)}
      </dl>
     </div>
     <div>
      <h3>The four input states, on a phone and on this page</h3>
      <ul className="go-voice-states">
       {VOICE_STATES.map(state => <li key={state.id}>
        <p className="go-voice-state"><Pill tone="plain">{state.name}</Pill></p>
        <p className="helper"><strong>On a phone.</strong> {state.onThePhone}</p>
        <p className="helper"><strong>Here.</strong> {state.onTheWeb}</p>
       </li>)}
      </ul>
      <p className="go-voice-note" role="note">All four belong to the one control above, and the control is in exactly
       one of them at a time. The rule that binds them is the voice capability's own, quoted under V04 below: the state
       where the microphone is open is shown only while it is, and the microphone is never opened without it.</p>
     </div>
    </div>

    {/* The contract's own sentences, on the page that renders them. They are read from
        packages/catalog/assistant.json rather than typed here, so what a reviewer reads is what the
        phones and the live assistant render, down to the word — including the sentence saying the
        rest of the web is still typed to. */}
    <div className="go-voice-sentences">
     <p className="go-voice-sentences-lead">What MyThuso says about this, word for word from its own contract:</p>
     <dl>
      {VOICE_SENTENCES.map(sentence => <div key={sentence.id}>
       <dt>{sentence.when}</dt>
       <dd>{sentence.text}</dd>
      </div>)}
     </dl>
    </div>

    <h3>What else you can press</h3>
    <div className="go-access-row">
     <button type="button" className="secondary" onClick={() => { setReviewSeed(TRANSCRIPT_REVIEW.example); setReviewFromMicrophone(false); setOpen(true); setReview(true); }}>
      <SquarePen size={16}/>Show the transcript review
     </button>
     <button type="button" className="secondary go-toggle" aria-pressed={spoken} aria-describedby="go-spoken-note"
             aria-label={`Spoken answers: ${spoken ? 'on' : 'off'} — ${SPOKEN_ANSWERS.label}`}
             onClick={() => setSpoken(!spoken)}>
      <Captions size={16}/>Spoken answers: {spoken ? 'on' : 'off'}
     </button>
     <button type="button" className="secondary" disabled={!spoken} onClick={speakInWidget}>
      <Repeat size={16}/>Replay the spoken answer
     </button>
    </div>
    <p className="helper" id="go-spoken-note">{SPOKEN_ANSWERS.label}. Switching spoken answers off is §07's explicit
     playback choice, and with it off A10 does not run at all: nothing is spoken and the mouth does not move. There is no
     switch for the caption, because §07 asks for captions whenever audio is used and audio is used here — the caption is
     on the screen for as long as the voice is speaking and no longer.</p>
    <p className="helper">Tapping to talk opens the review step on the words your browser sent back. The control above opens
     the same step on a fixed example — “{TRANSCRIPT_REVIEW.example}” — so the shape of it can be inspected without
     speaking, and the two labels beside the field are the phone's own. Replay speaks the same fixed sentence again and
     re-runs, re-asks and resubmits nothing, which is what §07 asks replay to be.</p>
   </section>

   <section className="go-refusals panel" aria-labelledby="go-refusals-title">
    <h2 id="go-refusals-title">What this phase will not do</h2>
    <p className="helper">Three things this page does not do, listed rather than quietly left out, so a reviewer looking
     for one of them finds the reason instead of a gap. A07, A10's audio half and §07's two voice rows were on this list
     until 17 September 2026; they are built now, so they are gone from it.</p>
    <ul className="go-refusal-list">
     {REFUSED.map(refusal => <li key={refusal.id}>
      <p className="go-refusal-head"><Pill tone="plain">{refusal.id}</Pill><strong>{refusal.name}</strong></p>
      <p className="go-refusal-statement"><TriangleAlert size={16} aria-hidden="true"/><span>{refusal.statement}</span></p>
      <p className="helper">{refusal.why}</p>
      {refusal.id === 'V04' && <blockquote className="go-refusal-quote">
       <p>{VOICE_NEVER_SOFTEN}</p>
       <footer>The voice capability's note, in packages/catalog/capabilities.json</footer>
      </blockquote>}
     </li>)}
    </ul>
    <NotConnected of="voice"/>
    <h3>The yawn, and everything that stops it</h3>
    <p className="helper">Off by default in a care conversation. In playful mode it may run once after {YAWN_IDLE_MS / 1000} seconds of
     inactivity, with {YAWN_COOLDOWN_MS / 60000} minutes between yawns, and it is suppressed during: {YAWN_SUPPRESSORS.join(', ')}.
     The control above obeys all of that, including when a reviewer is the one pressing it.</p>
    <h3>Not in this phase at all</h3>
    <ul className="go-plain-list">
     <li>No language model, no knowledge retrieval and no server. Nothing on this page makes a network request of any kind —
      including with what the microphone caught, which goes to the field above it and nowhere else.</li>
     <li>No conversation memory, no task state and no recipient context. What you type and what your browser sent back are held
      in this browser for as long as the page is open, are written to no storage of any kind, and go nowhere.</li>
     <li>No recording, in either direction. This page reads no audio level, draws no waveform, keeps no sample and creates no
      file: your browser hears you and hands back words, and nothing written here touches the sound. No camera is requested
      either, in any state.</li>
     <li>No voice anywhere else in MyThuso on the web. This page is the only one with a microphone on it, and the live
      assistant is still typed to for the reason it always was.</li>
     <li>No patient data, no fictional patient record and no clinical content. The transcript holds your own words and the shell's
      replies about itself.</li>
    </ul>
   </section>
  </main>

  <GilbertWidget rig={rig} open={open} setOpen={setOpen} unavailable={unavailable} onTyping={setTyping} failRig={failRig}
                 caption={caption} captionLabel={voice.boundariesSeen ? SPOKEN_ANSWERS.whileRunning : SPOKEN_ANSWERS.timedFallback}
                 review={review} setReview={setReview} reviewSeed={reviewSeed} reviewFromMicrophone={reviewFromMicrophone}
                 onStop={() => { voice.cancel(); rig.stop(); }}/>
 </div>;
}

/* One table, one panel, one row per cue — with the document's own trigger and motion wording under
   each control. A reviewer pressing a button should be able to read what the specification asked for
   without leaving the page, because "is this what we asked for" is the only question a motion review
   is actually trying to answer. */
function CueList({ title, lead, cues, fire, reduced, blockedFor }: {
 title: string; lead: string; cues: readonly Cue[]; fire: (cue: Cue) => void; reduced: boolean;
 blockedFor: (cue: Cue) => string | null;
}) {
 return <div className="panel go-cues">
  <h3>{title}</h3>
  <p className="helper">{lead}</p>
  <ul className="go-cue-list">
   {cues.map(cue => {
    const blocked = blockedFor(cue);
    const stillOnly = reduced && !cue.still;
    return <li key={cue.id} className="go-cue">
     <button type="button" className="secondary go-cue-button" disabled={blocked !== null} onClick={() => fire(cue)}>
      <span className="go-cue-id">{cue.id}</span>
      <span className="go-cue-name">{cue.name}</span>
     </button>
     <div className="go-cue-words">
      <p className="go-cue-meta">{TRACK_WORDS[cue.track]} · {durationOf(cue)} ms</p>
      <p className="helper"><strong>Trigger.</strong> {cue.trigger}</p>
      <p className="helper">{cue.motion}</p>
      {blocked && <p className="go-cue-blocked" role="note">{blocked}</p>}
      {stillOnly && !blocked && <p className="go-cue-blocked" role="note">Under reduced motion this cue is movement with nothing still behind it, so it does not play. The status line says what it would have done.</p>}
     </div>
    </li>;
   })}
  </ul>
 </div>;
}
