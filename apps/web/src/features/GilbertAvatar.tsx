import { useCallback, useId, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
 BLEND_INSTANT_MS, BLEND_MS, NEUTRAL, START, captionSteps, clampPose, cueById, reduce,
 type Cue, type MouthShape, type Pose, type RigState
} from '../lib/gilbertone';
import './gilbert-avatar.css';

/* GilbertOne's rig and its motion controller — §08's GilbertAvatar.tsx.
 *
 * A layered 2.5D SVG animated with transforms, which is the renderer §08 recommends for the phase 1
 * demonstrator: it needs no generated video per message, it scales from a 60px launcher to a 260px
 * stage without a second asset, and every group it names — shell, visor, left and right eye, left and
 * right lid, brows, mouth, neck — is the group §09 asks a character designer to hand over. When the
 * artwork arrives it replaces the paths in this file and nothing else: the controller knows poses,
 * not paths.
 *
 * THREE TRACKS, as §04 asks for: interaction state and response style go through the reducer in
 * lib/gilbertone.ts, which owns priority and cancellation; facial articulation (the blink) and the
 * idle drift are their own channels, added at render. That separation is the reason a blink during a
 * supportive pose does not steal the face and a drift never has to be given a priority at all.
 *
 * NOTHING HERE IS DECORATIVE BY ACCIDENT. Every channel stops under prefers-reduced-motion, under the
 * widget's own pause control and when the tab is hidden — §10's three cases, and the last of them is
 * why the timers are effects with cleanups rather than intervals held in refs.
 *
 * THE CHARACTER IS NOT CONTENT. The SVG carries aria-hidden and no text at all; what GilbertOne is
 * doing is said in words, in HTML, by whatever renders the rig. A screen reader that meets a robot
 * head gets nothing from it, which is the point — it gets the sentence instead. */

export type Rig = ReturnType<typeof useGilbertRig>;

/* Blink spacing, in the range §03 A03 gives, and a double blink now and then rather than on a
   pattern. Randomness lives here — in scheduling — and never in the reducer, so the same trigger on
   the same state always produces the same face. */
const BLINK_MIN_MS = 4000, BLINK_MAX_MS = 8000, BLINK_SHUT_MS = 150, DOUBLE_BLINK_CHANCE = 0.18;
/* §03 A02: 1–2 rig units of drift over 5–7 seconds. Six, split in two. */
const DRIFT_MS = 3000, DRIFT_UNITS = 2;

export type PlayOptions = {
 /** A turn minted earlier with `mintTurn`. Left out, the play mints its own. */
 readonly turn?: number;
 /** A10 only: the words the mouth shapes run against, so the caption and the mouth are one thing. */
 readonly caption?: readonly string[];
};

/** Whether the document is hidden, watched rather than asked once — §10 asks that timers and
 *  rendering stop when hidden, and a tab that was backgrounded after load must stop too. */
function useHidden() {
 const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
 useEffect(() => {
  const update = () => setHidden(document.hidden);
  document.addEventListener('visibilitychange', update);
  update();
  return () => document.removeEventListener('visibilitychange', update);
 }, []);
 return hidden;
}

export function useGilbertRig({ reduced, paused }: { reduced: boolean; paused: boolean }) {
 const [state, dispatch] = useReducer(reduce, START);
 const hidden = useHidden();
 const still = reduced || paused || hidden;
 /* Read inside callbacks that must not be rebuilt every time one of the three changes: a `play` whose
    identity changes on a pause is a `play` in the dependency list of every effect that uses it. */
 const stillRef = useRef(still);
 stillRef.current = still;
 /* The turn counter. It only ever goes up, and it is a ref rather than state because minting a turn
    is not a change to the face — the demonstrator mints one, runs something else, and then delivers
    the stale one to prove it changes nothing. */
 const turns = useRef(0);
 const mintTurn = useCallback(() => ++turns.current, []);
 const [note, setNote] = useState('GilbertOne is ready. Nothing has been triggered yet.');
 const [blinking, setBlinking] = useState(false);
 const [drift, setDrift] = useState(0);

 const play = useCallback((id: string, options: PlayOptions = {}) => {
  const cue = cueById(id);
  const turn = options.turn ?? ++turns.current;
  /* A10 runs the caption track rather than the manifest's two steps: the shapes belong to the words
     being shown, so they are built from them. */
  const steps = options.caption ? captionSteps(options.caption) : undefined;
  /* A pause is treated exactly as reduced motion is: the cue takes its still expression and says what
     it would have done, rather than half-playing and stopping. One behaviour for both is one thing to
     explain to a reviewer and one thing to test. */
  dispatch({ kind: 'play', cue, turn, steps, reduced: stillRef.current });
 }, []);

 const stop = useCallback(() => play('A15'), [play]);
 const rest = useCallback(() => { dispatch({ kind: 'rest' }); setNote('The rig is back at its neutral pose.'); }, []);

 /* One blink, or two. It is an articulation, not a cue: it never takes the face and never displaces
    a pose. The involuntary one says nothing either — a live region that announced every blink would
    be a screen reader interrupted twelve times a minute — so only a blink somebody asked for is
    announced, which is what makes A03 individually demonstrable for AT02. */
 const blinkTimer = useRef(0);
 const blink = useCallback((double = false, announce = false) => {
  if (stillRef.current) {
   if (announce) setNote(reduced
    ? 'Reduced motion is on, so GilbertOne does not blink. The eyes stay open and the face stays still.'
    : 'Animation is paused, so GilbertOne does not blink. Play it again and the eyes work as they did.');
   return;
  }
  if (announce) setNote(cueById('A03').says);
  window.clearTimeout(blinkTimer.current);
  setBlinking(true);
  blinkTimer.current = window.setTimeout(() => {
   setBlinking(false);
   if (double) blinkTimer.current = window.setTimeout(() => blink(false, false), BLINK_SHUT_MS);
  }, BLINK_SHUT_MS);
 }, [reduced]);
 useEffect(() => () => window.clearTimeout(blinkTimer.current), []);

 /* The cue's own clock. One timeout per step, cleared by React whenever the step, the turn or the
    reason to be still changes — so a hidden tab, a pause or a newer trigger ends the old walk
    without anything having to remember to. */
 useEffect(() => {
  if (still || !state.cue || state.step < 0) return;
  const step = state.steps[state.step];
  if (!step) return;
  const timer = window.setTimeout(() => dispatch({ kind: 'advance', turn: state.turn }), step.ms);
  return () => window.clearTimeout(timer);
 }, [still, state.cue, state.step, state.steps, state.turn]);

 /* Anything that says be still settles the running cue rather than freezing it. */
 useEffect(() => { if (still) dispatch({ kind: 'settle' }); }, [still]);

 /* The involuntary blink, on irregular spacing. It stops entirely when anything says be still. */
 useEffect(() => {
  if (still) return;
  let timer = 0;
  const schedule = () => {
   timer = window.setTimeout(() => {
    blink(Math.random() < DOUBLE_BLINK_CHANCE);
    schedule();
   }, BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS));
  };
  schedule();
  return () => window.clearTimeout(timer);
 }, [still, blink]);

 /* The idle drift, which is only ever added while nothing else owns the face. §03 A02's "decorative
    idle movement must yield immediately to user interaction" is this line: a running cue means no
    drift at all, rather than a drift that fades. */
 useEffect(() => {
  if (still || state.cue) { setDrift(0); return; }
  const timer = window.setInterval(() => setDrift(value => (value === 0 ? DRIFT_UNITS : 0)), DRIFT_MS);
  return () => { window.clearInterval(timer); setDrift(0); };
 }, [still, state.cue]);

 /* What just happened, in words. The reducer decides; this only reads it, so the sentence a reader
    hears and the face they see can never disagree. */
 useEffect(() => { if (state.landed) setNote(state.landed.cue.says); }, [state.landed]);
 useEffect(() => { if (state.refused) setNote(`${state.refused.cue.id} ${state.refused.cue.name} did not run. ${state.refused.because}`); }, [state.refused]);

 /* The pose as it is drawn: the reducer's, plus the two additive channels. A blink closes the lids
    over whatever they were doing; the drift lifts the head while nothing else is moving it. */
 const pose = useMemo(() => clampPose({
  ...state.pose,
  lid: blinking ? 1 : state.pose.lid,
  lift: state.pose.lift + drift
 }), [state.pose, blinking, drift]);

 return { state, pose, note, play, stop, rest, blink, mintTurn, running: state.cue, reduced, paused, hidden, blend: state.blend } as const;
}

/* ---- The drawing -------------------------------------------------------------------------------
 *
 * §02: the canvas has an alpha background — no panel, no neon haze, no orbit rings, no glow cloud —
 * and one soft contact shadow. That is why there is no <rect> behind the head in this file and why
 * the only thing under it is an ellipse: the transparency is a property of the artwork, not a filter
 * somebody can switch on.
 *
 * Mouth shapes are two elements rather than one interpolated path: a stroked line for the closed
 * shapes and an ellipse scaled for the open ones. A viseme swap is discrete in any case, and a `d`
 * that morphs between paths with different command counts is the sort of thing that works in one
 * browser and jumps in another. */

const MOUTH_LINE: Record<string, string> = {
 closed: 'M 90 128 H 110',
 neutral: 'M 88 127 Q 100 132 112 127',
 smile: 'M 86 125 Q 100 136 114 125',
 warm: 'M 84 124 Q 100 141 116 124',
 flat: 'M 86 128 H 114'
};
const OPEN: Record<string, readonly [number, number]> = { ajar: [0.9, 0.5], wide: [1.15, 0.62], round: [0.7, 0.72], yawn: [0.85, 1.05] };
const isOpen = (shape: MouthShape) => shape in OPEN;

export type AvatarProps = {
 readonly pose: Pose;
 /** Rendered width and height in CSS pixels. 56–64 for the launcher, 100–140 for the welcome card,
     56–72 in a conversation header — §02's sizes. */
 readonly size: number;
 /** The blend into the current pose, in milliseconds. 0 for a stop or a safety event. */
 readonly blend?: number;
 /** Demonstrates AT12: the rig throws and the widget's boundary keeps the surface usable. */
 readonly fail?: boolean;
 /** A welcome may smile; neutral reply poses must never acquire a smile from the artwork. */
 readonly friendly?: boolean;
};

export function GilbertAvatar({ pose, size, blend = BLEND_MS, fail = false, friendly = false }: AvatarProps) {
 /* AT12 asks what happens when the avatar fails. The honest way to test it is to be able to make it
    fail on purpose, so the demonstrator can, and the boundary in GilbertWidget.tsx catches it. */
 if (fail) throw new Error('GilbertOne rig: a deliberate failure, fired from the demonstrator to show that the surface around it keeps working.');
 const shellId = useId();
 const [artworkFailed, setArtworkFailed] = useState(false);
 const { lookX, lookY, yaw, pitch, tilt, lift, lid, brow, mouth, jaw } = pose;
 const open = isOpen(mouth);
 const [scaleX, scaleY] = open ? OPEN[mouth] : [1, 1];
 return (
  <svg className="go-rig" viewBox="0 0 200 200" width={size} height={size} aria-hidden="true" focusable="false"
       style={{ '--go-blend': `${blend}ms` } as React.CSSProperties}>
   <defs><radialGradient id={shellId} cx="40%" cy="36%" r="75%">
    <stop offset="0%" stopColor="var(--brand-mint)"/>
    <stop offset="30%" stopColor="var(--brand-green)"/>
    <stop offset="100%" stopColor="var(--brand-ink)"/>
   </radialGradient></defs>
   {/* The only thing beneath the character, and it is a shadow rather than a stage. */}
   <ellipse className="go-shadow" cx="100" cy="188" rx={42 - lift} ry="5.5"/>
   <g className="go-head" style={{ transform: `translate(${yaw * 0.55}px, ${-lift + pitch * 0.35}px) rotate(${tilt}deg)` }}>
    <g className="go-shell">
     {artworkFailed ? <rect x="34" y="24" width="132" height="126" rx="44" style={{ fill: `url(#${shellId})` }}/>
      : <image href="/brand/gilbert-robot.webp" x="0" y="-10" width="200" height="200" onError={() => setArtworkFailed(true)}/>}
    </g>
    <g className="go-face go-visor" style={{ transform: `translate(${yaw * 0.9}px, ${pitch * 0.7}px)` }}>
     <g className="go-brows" style={{ transform: `translate(0px, ${-brow * 4}px)` }}>
      <path className="go-brow" d="M 67 73 Q 78 68 89 70"/>
      <path className="go-brow" d="M 111 70 Q 122 68 133 73"/>
     </g>
     {artworkFailed && <rect x="50" y="64" width="100" height="48" rx="22"/>}
     <g className="go-eyes" style={{ transform: `translate(${lookX * 7}px, ${lookY * 4}px)` }}>
      {mouth === 'flat' || !(friendly || mouth === 'smile' || mouth === 'warm') ? <>
       <ellipse className="go-eye" cx="80" cy="88" rx="7" ry="9"/>
       <ellipse className="go-eye" cx="120" cy="88" rx="7" ry="9"/>
      </> : <>
       <path className="go-eye go-eye-arc" d="M 71 91 Q 80 75 89 91"/>
       <path className="go-eye go-eye-arc" d="M 111 91 Q 120 75 129 91"/>
      </>}
      {/* The lids are the visor's own colour, so a closed eye is the visor rather than a shutter. */}
      <rect className="go-lid" x="69" y="76" width="22" height="26" style={{ transform: `scaleY(${lid})` }}/>
      <rect className="go-lid go-lid-right" x="109" y="76" width="22" height="26" style={{ transform: `scaleY(${lid})` }}/>
     </g>
     <g className="go-mouth">
      <path className="go-mouth-line" d={MOUTH_LINE[mouth] ?? MOUTH_LINE.neutral} style={{ opacity: open ? 0 : 1 }}/>
      <ellipse className="go-mouth-open" cx="100" cy="130" rx="11" ry="9"
               style={{ opacity: open ? 1 : 0, transform: `scale(${scaleX}, ${(0.35 + jaw * 0.7) * scaleY})` }}/>
     </g>
    </g>
   </g>
  </svg>
 );
}

/** The static fallback §09 asks for, at whatever size it is given: the neutral pose with nothing
 *  scheduled against it. It is what the widget draws when the rig has failed, and what a reviewer
 *  sees under reduced motion before anything is triggered. */
export function GilbertStill({ size }: { size: number }) {
 return <GilbertAvatar pose={NEUTRAL} size={size} blend={BLEND_INSTANT_MS}/>;
}

export type { Cue, RigState };
