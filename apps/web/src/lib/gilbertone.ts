import { voice as voicePolicy, refusals as gilbertRefusals, conversation as gilbertConversation } from '../../../../packages/catalog/assistant.json';
import { neverSoftenOf } from './capability-rules';
/* GilbertOne's motion manifest and the reducer that owns the face.
 *
 * THIS IS A PREVIEW, NOT THE LIVE ASSISTANT. GilbertOne is the assistant this product ships — a
 * deterministic matcher over approved sentences, named, described and governed by
 * packages/catalog/assistant.json — and nothing in this module may touch it. What lives here is the
 * character demonstrator from docs/GilbertOne_Developer_Scope_v1.md, phase 1 of four: a rig, a widget
 * shell and a control panel that fires each cue, so that motion can be reviewed before a single
 * clinical decision rests on it. Preview and live are kept apart on every screen for the same reason
 * the descriptor line carries its own disclosure — a demonstrator read as the product is a promise
 * nobody made.
 *
 * WHAT THIS FILE IS. §09 of the scope asks for a motion manifest: cue names, durations, cooldowns,
 * interruptions and reduced-motion alternatives. CUES below is that manifest, as data, with the
 * document's own trigger and motion wording beside each id so a reviewer can read the specification
 * and the implementation in one place. §03's renderer recommendation asks for a deterministic state
 * reducer over a layered rig, and `reduce` is it: every visible property of the face is a number or
 * a named shape in `Pose`, and nothing else may move the character.
 *
 * WHAT IT DELIBERATELY HAS NOT GOT. No model, no network, no conversation state, no capture and no
 * playback — those are phases 2 to 4, gated on decisions (a pinned checkpoint, a speech provider, a
 * clinical review) this repository has not made. Two cues in the document's tables are therefore
 * declared here and refused rather than drawn: A07, whose trigger is "Actual microphone capture
 * begins", and A10's audio half. §07's push-to-talk control and its browser voice are refused beside
 * them, and what §07 asks for that can be shown without either is built. See REFUSED, and the voice
 * section under it.
 *
 * PRIORITY AND CANCELLATION are the two rules that make the rest safe. A cue's track decides what it
 * may displace; a turn id decides which trigger owns the face. A late trigger from an earlier turn
 * changes nothing, which is §04's rule and AT05's test. */

export type MouthShape = 'closed' | 'neutral' | 'smile' | 'warm' | 'flat' | 'ajar' | 'wide' | 'round' | 'yawn';

/** Every independently controllable part of the rig, as numbers. §09's named groups — shell, visor,
 *  eyes, lids, brows, mouth, neck — are the SVG's; this is what the reducer may move on them. */
export type Pose = {
 /** Eye direction, −1 (left, up) to 1 (right, down). Independent of the head, per §03. */
 readonly lookX: number;
 readonly lookY: number;
 /** Head yaw in degrees. §03 A06 caps this at 6–8; `clampPose` holds it there. */
 readonly yaw: number;
 /** Head pitch in degrees: positive looks down, negative lifts the chin. */
 readonly pitch: number;
 /** Neck tilt in degrees — the sideways lean A11 and A12 ask for. */
 readonly tilt: number;
 /** Head lift in rig units, for A01's small lift and A09's nod. */
 readonly lift: number;
 /** Eyelids, 0 fully open to 1 closed. 0.4–0.6 is the narrowing A14 asks for. */
 readonly lid: number;
 /** Brows, −1 lowered to 1 raised. A12 lifts them; nothing here ever frowns at a person. */
 readonly brow: number;
 readonly mouth: MouthShape;
 /** How far an open mouth is open, 0 to 1. Line shapes ignore it. */
 readonly jaw: number;
};

export const NEUTRAL: Pose = { lookX: 0, lookY: 0, yaw: 0, pitch: 0, tilt: 0, lift: 0, lid: 0, brow: 0, mouth: 'neutral', jaw: 0 };

const MAX_YAW = 8, MAX_PITCH = 7, MAX_TILT = 6, MAX_LIFT = 5;
const hold = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const unit = (value: number) => Math.max(-1, Math.min(1, value));
/* The head's travel is clamped here rather than trusted to each cue. §03 A06 limits yaw to 6–8
   degrees and warns against exaggerated swivelling; a limit written once cannot be forgotten by the
   eighteenth cue somebody adds. */
export const clampPose = (pose: Pose): Pose => ({
 ...pose,
 lookX: unit(pose.lookX), lookY: unit(pose.lookY), brow: unit(pose.brow), jaw: Math.max(0, Math.min(1, pose.jaw)),
 lid: Math.max(0, Math.min(1, pose.lid)),
 yaw: hold(pose.yaw, MAX_YAW), pitch: hold(pose.pitch, MAX_PITCH), tilt: hold(pose.tilt, MAX_TILT), lift: hold(pose.lift, MAX_LIFT)
});

/* ---- Tracks, in the order §04 resolves them --------------------------------------------------
 *
 * "safety override → privacy/error state → interruption → listening/speaking/task activity →
 * response-style gesture → idle", word for word from the document. Index is rank: lower wins. An
 * incoming cue lands when its rank is at least as good as the running cue's, so a gesture never
 * covers an urgent face and idle never covers anything at all. */
export const TRACKS = ['safety', 'error', 'interrupt', 'activity', 'gesture', 'idle'] as const;
export type Track = typeof TRACKS[number];
export const rankOf = (track: Track) => TRACKS.indexOf(track);

export const TRACK_WORDS: Record<Track, string> = {
 safety: 'Safety override',
 error: 'Privacy or error state',
 interrupt: 'Interruption',
 activity: 'Task activity',
 gesture: 'Response-style gesture',
 idle: 'Idle'
};

/* ---- Blends ---------------------------------------------------------------------------------
 * §04: "Blend normal transitions over 150–300 ms; safety and stop events do not wait for the
 * previous animation to finish." So there are two numbers and no others: one inside the range, and
 * nothing at all for the two kinds of event that may not wait. */
export const BLEND_MS = 220;
export const BLEND_INSTANT_MS = 0;

export type Step = {
 /** What changes. Anything left out holds its current value, so a cue moves only what it is about. */
 readonly pose: Partial<Pose>;
 /** How long this step holds before the next one, in milliseconds. */
 readonly ms: number;
 /** Override the blend into this step. Used by the two tracks that may not wait. */
 readonly blend?: number;
};

export type Cue = {
 /** The document's own id: A01 to A17. */
 readonly id: string;
 readonly name: string;
 readonly track: Track;
 /** §03/§04's trigger column, so the rule and the code cannot drift apart. */
 readonly trigger: string;
 /** §03/§04's motion column. */
 readonly motion: string;
 readonly steps: readonly Step[];
 /** §10: in reduced-motion mode a cue shows a static expression instead of moving. This is it.
     A cue whose whole content is movement has `null` here and does not play at all. */
 readonly still: Partial<Pose> | null;
 /** What the status line says while it runs. Text, because §10 forbids saying anything by motion
     or colour alone. */
 readonly says: string;
 /** A cue that holds its last step until something displaces it, rather than settling back. */
 readonly holds?: boolean;
};

const totalMs = (cue: Cue) => cue.steps.reduce((sum, step) => sum + step.ms, 0);
export const durationOf = totalMs;

/* ---- The manifest ---------------------------------------------------------------------------
 * Every timing below sits inside the range §03 and §04 give, and the range is in the comment beside
 * it. They are starting values for design review, which is what the document asks for: "tune them on
 * the actual widget size and target devices". */
export const CUES: readonly Cue[] = [
 {
  id: 'A01', name: 'Greet', track: 'gesture',
  trigger: 'User opens widget.',
  motion: 'A small head lift and single nod; settle within 600–900 ms. A gentle smile, no bounce sequence and no repeated spoken introduction.',
  /* 750 ms all told, inside 600–900. One lift, one nod, settle — and no second bounce, which is the
     difference between a greeting and a mascot. */
  steps: [
   { pose: { lift: 3, pitch: -2, mouth: 'smile' }, ms: 220 },
   { pose: { lift: 1, pitch: 3 }, ms: 240 },
   { pose: { lift: 0, pitch: 0 }, ms: 290 }
  ],
  still: { mouth: 'smile' },
  says: 'GilbertOne greets you.'
 },
 {
  id: 'A02', name: 'Idle', track: 'idle',
  trigger: 'Open, no active turn.',
  motion: 'Nearly still. Optional 1–2 px slow drift over 5–7 s. Pause when the tab is hidden, the avatar is offscreen or motion is disabled.',
  /* Two rig units up and back over six seconds: the drift is meant to be noticed only in its
     absence. It stops on a hidden tab, under reduced motion and under the pause control. */
  steps: [
   { pose: { lift: 2 }, ms: 3000 },
   { pose: { lift: 0 }, ms: 3000 }
  ],
  still: {},
  says: 'GilbertOne is idle.'
 },
 {
  id: 'A03', name: 'Blink', track: 'gesture',
  trigger: 'Idle or normal interaction.',
  motion: 'Irregular blink spacing around 4–8 s; eyelids close and reopen in 120–180 ms. Occasional double blink, never a repetitive flashing effect.',
  /* 150 ms shut and open, inside 120–180. The spacing is irregular and lives in the rig, not here:
     an interval is scheduling rather than a pose. */
  steps: [
   { pose: { lid: 1 }, ms: 75, blend: 60 },
   { pose: { lid: 0 }, ms: 75, blend: 90 }
  ],
  still: null,
  says: 'GilbertOne blinks.'
 },
 {
  id: 'A04', name: 'Look at input', track: 'activity',
  trigger: 'Input receives focus.',
  motion: 'Move the eye group down towards the input. Smooth 200–350 ms ease; no access to camera or gaze tracking.',
  steps: [{ pose: { lookY: 0.75, lookX: 0, pitch: 2 }, ms: 280 }],
  still: { lookY: 0.75 },
  says: 'GilbertOne looks towards the text field.',
  holds: true
 },
 {
  id: 'A05', name: 'Read a message', track: 'activity',
  trigger: 'A submitted message appears.',
  motion: 'Look briefly towards its bubble. Use bounded UI coordinates, not the perceived emotion of every typed keystroke.',
  /* Bounded coordinates: the bubble is up and to the reading side, and the eyes come back. Nothing
     here watches a keystroke. */
  steps: [
   { pose: { lookX: 0.5, lookY: -0.35 }, ms: 300 },
   { pose: { lookX: 0.35, lookY: -0.2 }, ms: 420 },
   { pose: { lookX: 0, lookY: 0 }, ms: 280 }
  ],
  still: { lookX: 0.35, lookY: -0.2 },
  says: 'GilbertOne reads the message.'
 },
 {
  id: 'A06', name: 'Look left', track: 'gesture',
  trigger: 'Action card or new bubble appears.',
  motion: 'Small eye shift; head yaw limited to about 6–8 degrees. Return to a relaxed central pose. No exaggerated swivelling.',
  steps: [
   { pose: { lookX: -0.8, yaw: -7 }, ms: 260 },
   { pose: { lookX: -0.6, yaw: -6 }, ms: 400 },
   { pose: { lookX: 0, yaw: 0 }, ms: 260 }
  ],
  still: { lookX: -0.6, yaw: -6 },
  says: 'GilbertOne looks left.'
 },
 {
  id: 'A06R', name: 'Look right', track: 'gesture',
  trigger: 'Action card or new bubble appears.',
  motion: 'Small eye shift; head yaw limited to about 6–8 degrees. Return to a relaxed central pose. No exaggerated swivelling.',
  steps: [
   { pose: { lookX: 0.8, yaw: 7 }, ms: 260 },
   { pose: { lookX: 0.6, yaw: 6 }, ms: 400 },
   { pose: { lookX: 0, yaw: 0 }, ms: 260 }
  ],
  still: { lookX: 0.6, yaw: 6 },
  says: 'GilbertOne looks right.'
 },
 {
  id: 'A08', name: 'Process', track: 'activity',
  trigger: 'Request is being processed.',
  /* The motion note below is the document's, except for its last clause. The original names the
     state about hearing, and no file under apps/web/src may carry that word in a string: the founder
     decided the web has no microphone, packages/catalog/capabilities.json's voice entry refuses any
     affordance for one in any state, and scripts/check-boundaries.mjs fails the build on the word
     itself so that a screen cannot drift back towards it a sentence at a time. The rule the clause
     states is kept whole; only its wording is MyThuso's. See REFUSED, A07. */
  motion: 'Subtle thinking glance and a small status indicator. It must never look as though the widget is hearing something when it is only waiting.',
  /* The status indicator is the widget's, in words, beside the face — a glance alone says nothing
     to a screen reader, and §10 forbids saying anything by motion alone. */
  steps: [
   { pose: { lookX: 0.45, lookY: -0.5, brow: 0.2, mouth: 'closed' }, ms: 420 },
   { pose: { lookX: -0.3, lookY: -0.45 }, ms: 480 },
   { pose: { lookX: 0.2, lookY: -0.3 }, ms: 420 },
   { pose: { lookX: 0, lookY: 0, brow: 0, mouth: 'neutral' }, ms: 260 }
  ],
  still: { lookY: -0.4, brow: 0.2 },
  says: 'GilbertOne is working on a demonstration step. Nothing is being sent anywhere.'
 },
 {
  id: 'A09', name: 'Acknowledge', track: 'gesture',
  trigger: 'A normal turn or confirmed action completes.',
  motion: 'One 400–650 ms nod. Nod to acknowledge the message, not to imply that an unsafe or false statement is correct.',
  /* 520 ms, inside 400–650, and exactly one. */
  steps: [
   { pose: { pitch: 5, lift: -1 }, ms: 200 },
   { pose: { pitch: -1, lift: 1 }, ms: 180 },
   { pose: { pitch: 0, lift: 0 }, ms: 140 }
  ],
  still: {},
  says: 'GilbertOne acknowledges.'
 },
 {
  id: 'A10', name: 'Speak', track: 'activity',
  trigger: 'Audio playback actually starts.',
  motion: 'Use speech-aligned mouth shapes. Mouth closes for pauses and at playback end. Head and eyes make restrained supporting movements.',
  /* There is no audio in phase 1 and none is faked. The mouth shapes here run against the written
     caption the widget shows at the same time, word by word, and the caption says so. AT04 asks that
     the mouth never moves during silence; the caption is what is being said, so it does not. The
     shapes are built by `captionCues` — these steps are only the opening and the close. */
  steps: [
   { pose: { mouth: 'ajar', jaw: 0.3 }, ms: 140 },
   { pose: { mouth: 'closed', jaw: 0 }, ms: 140 }
  ],
  still: { mouth: 'neutral' },
  says: 'GilbertOne shapes the words of the demonstration caption. No audio is played.'
 },
 {
  id: 'A11', name: 'Support', track: 'gesture',
  trigger: 'User explicitly describes worry, sadness or frustration.',
  motion: 'A smaller smile or neutral mouth, soft attentive eyes, slight head tilt. No fake tears, alarmed face or exaggerated pity.',
  steps: [{ pose: { tilt: 5, lid: 0.2, brow: 0.1, mouth: 'smile', lookY: 0.1 }, ms: 320 }],
  still: { tilt: 5, lid: 0.2, mouth: 'smile' },
  says: 'GilbertOne holds a supportive pose.',
  holds: true
 },
 {
  id: 'A12', name: 'Clarify', track: 'gesture',
  trigger: 'A reference or request is ambiguous.',
  motion: 'A small brow lift and 4–6 degree tilt; settle while asking one specific question. Avoid a permanently confused expression.',
  /* 5 degrees, inside 4–6, and it settles rather than staying puzzled: the last step takes the tilt
     most of the way back, so a reviewer never finds a permanently confused face. */
  steps: [
   { pose: { brow: 0.8, tilt: 5, mouth: 'neutral' }, ms: 300 },
   { pose: { brow: 0.45, tilt: 3 }, ms: 520 },
   { pose: { brow: 0.15, tilt: 1 }, ms: 300 }
  ],
  still: { brow: 0.45, tilt: 3 },
  says: 'GilbertOne asks for one specific clarification.'
 },
 {
  id: 'A13', name: 'Appreciate', track: 'gesture',
  trigger: 'Thanks or genuinely positive news.',
  motion: 'A brief warm smile and small nod, typically under 900 ms. Do not celebrate a serious medical result or a failed transaction.',
  /* 820 ms, under the 900 the document asks for. */
  steps: [
   { pose: { mouth: 'warm', pitch: 4, lid: 0.15 }, ms: 260 },
   { pose: { pitch: 0, lid: 0.05 }, ms: 280 },
   { pose: { mouth: 'smile', lid: 0 }, ms: 280 }
  ],
  still: { mouth: 'warm' },
  says: 'GilbertOne gives a brief warm smile.'
 },
 {
  id: 'A14', name: 'Yawn', track: 'gesture',
  trigger: 'Explicit "show me a yawn" or optional playful idle mode.',
  motion: 'Eyes narrow, mouth opens gradually, head tilts back slightly, then resets; 1.8–2.4 s. No sound required.',
  /* 2,100 ms, inside 1.8–2.4 s. Gradually is the whole of it: the jaw arrives over two steps rather
     than one, because a mouth that snaps open reads as a shout. */
  steps: [
   { pose: { lid: 0.45, mouth: 'yawn', jaw: 0.35, pitch: -2 }, ms: 420 },
   { pose: { lid: 0.62, jaw: 1, pitch: -5 }, ms: 620 },
   { pose: { lid: 0.5, jaw: 0.6, pitch: -3 }, ms: 520 },
   { pose: { lid: 0, mouth: 'neutral', jaw: 0, pitch: 0 }, ms: 540 }
  ],
  still: null,
  says: 'GilbertOne yawns.'
 },
 {
  id: 'A15', name: 'Interrupt', track: 'interrupt',
  trigger: 'Stop, new submitted turn, cancellation or urgent override.',
  motion: 'Cancel current speech and stale cues; close mouth and return to attentive pose. Target stop response below 200 ms on supported devices.',
  /* No blend at all, so the stop is the next frame rather than 220 ms later. §04: stop events do not
     wait for the previous animation to finish. */
  steps: [{ pose: { mouth: 'closed', jaw: 0, lid: 0, brow: 0, tilt: 0, yaw: 0, pitch: 0, lookX: 0, lookY: 0 }, ms: 160, blend: BLEND_INSTANT_MS }],
  still: { mouth: 'closed' },
  says: 'GilbertOne stops and returns to an attentive pose.'
 },
 {
  id: 'A16', name: 'Urgent support', track: 'safety',
  trigger: 'Approved safety logic flags a potentially urgent situation.',
  motion: 'Stable, neutral-attentive face. Stop yawns, smiles and decorative motion. Surface the approved action immediately.',
  /* The only cue on the safety track, and the only one that may not be displaced by anything but
     itself. It holds: a face that relaxes out of an urgent state on a timer is a face that says the
     urgency has passed when nothing has happened. */
  steps: [{ pose: { mouth: 'flat', lid: 0, brow: 0, tilt: 0, yaw: 0, pitch: 0, lookX: 0, lookY: 0, lift: 0, jaw: 0 }, ms: 400, blend: BLEND_INSTANT_MS }],
  still: { mouth: 'flat' },
  says: 'GilbertOne holds a steady, neutral face and the action comes first.',
  holds: true
 },
 {
  id: 'A17', name: 'Error or reconnect', track: 'error',
  trigger: 'Voice, model or app request fails.',
  motion: 'Brief neutral pause, then useful error text. No distressed robot, guilt language or endless thinking loop.',
  /* A pause and then words. The face does not apologise; the text says what failed and what to do,
     and there is no loop to watch while nothing happens. */
  steps: [
   { pose: { mouth: 'flat', lookX: 0, lookY: 0, brow: 0 }, ms: 400 },
   { pose: { mouth: 'neutral' }, ms: 200 }
  ],
  still: { mouth: 'flat' },
  says: 'Something did not work, and the words below say what.'
 }
];

export const cueById = (id: string): Cue => {
 const found = CUES.find(cue => cue.id === id);
 /* Loud rather than a silent no-op: a control wired to a cue nobody wrote would otherwise be a
    button that does nothing, which is indistinguishable from a rig that has stopped working. */
 if (!found) throw new Error(`No cue "${id}" in the GilbertOne manifest.`);
 return found;
};

/* ---- What this phase refuses: two cues, and the two halves of §07's voice --------------------
 *
 * None of the four may be drawn here, so each is declared with its reason rather than quietly left
 * out — a demonstrator that silently drops the states about capture and playback is a demonstrator
 * whose reviewer never notices they are missing.
 *
 * A07's trigger is "Actual microphone capture begins", and AT03 says the state may appear only
 * after capture starts. Nothing in apps/web captures anything: the founder's decision of
 * 14 September is that the web has no microphone, packages/catalog/capabilities.json's voice entry
 * refuses any affordance for it in any state, and scripts/check-boundaries.mjs fails the build on
 * the word. So the pose is not built, and this row says so where a reviewer is looking for it.
 *
 * A10's audio half is refused for the same shape of reason: there is no speech provider, so there is
 * no playback for a mouth to follow. The mouth shapes that remain run against a written caption and
 * the widget says which.
 *
 * V01 and V02 are §07's, and they are declared here rather than in the voice section below because a
 * reviewer reads one list to find out what is missing, not two. */
export type Refusal = { readonly id: string; readonly name: string; readonly statement: string; readonly why: string };
export const REFUSED: readonly Refusal[] = [
 {
  id: 'A07', name: 'The attentive pose for captured speech',
  statement: 'Not built. This page cannot hear you, and nothing on it may suggest otherwise — not an enabled control, not a disabled one, not a decorative one.',
  why: 'The cue\'s trigger in the scope document is actual microphone capture, and AT03 allows the state only after capture starts. MyThuso on the web has no microphone at all: a browser\'s speech recognition sends a voice to the company that makes the browser, which is why the founder decided the web is typed to. A demonstrator drawing the pose anyway would be the first place anybody saw MyThuso appear to listen.'
 },
 {
  id: 'A10', name: 'Speech-aligned mouth shapes against audio',
  statement: 'Half built. The mouth shapes are here; the audio is not, and none is synthesised, played or implied.',
  why: 'The cue\'s trigger is audio playback actually starting, and no speech provider is chosen — that is a phase 3 decision. So the shapes run against the written caption shown at the same moment, which is what is being said, and the caption says the audio is absent rather than letting a moving mouth imply it.'
 },
 /* The two below are §07's rather than §03's and §04's, and they are the reason the panel is called
    what this phase will not do rather than which cues are missing. §07 asks for a push-to-talk
    control and for the browser's own voice to read the answer out. Neither may be drawn or reached
    for on the web, and the reasons are not the same reason: the first is the founder's decision and
    the capability contract's note, the second is that there is no provider and no page here may make
    a sound. Both are declared so that a reviewer who has the document open finds the answer where
    the missing thing should have been. */
 {
  id: 'V01', name: '§07\'s push-to-talk control, and its four states, on the web',
  statement: 'Not drawn, in any state. The four states are written out in words on this page, and not one of them is given a control, a pose or a pulse.',
  why: '§07 asks for push-to-talk with clear microphone-off, starting, open-microphone and error states, and on a phone all four are real: the founder gave GilbertOne push-to-talk on 14 September, recognised by the phone itself, with nothing kept. On the web there is no microphone to be in any of those states, and the voice capability\'s note refuses the affordance in every state a control has. The document agrees with it twice over: A07 allows a waveform only from captured audio levels and never an invented live signal, and §07 asks that nothing animate a microphone while nobody is being recorded. A pulse driven by a reviewer\'s button is that invented signal, and this page is on the deployed site.'
 },
 {
  id: 'V02', name: '§07\'s "browser speech where supported", for reading the answer out',
  statement: 'Not built and not reached for. This page makes no sound at all: no browser voice is asked for, listed, chosen or spoken, and the answer is a caption.',
  why: 'A browser\'s voice belongs to the browser\'s maker, which is the same route the founder refused in the other direction, and no speech provider is chosen — that is a phase 3 decision. §07 also warns that a browser\'s word-boundary events are not a portable viseme stream and must not be sold as production lip-sync. So the caption is the output rather than a stand-in for one: the mouth shapes run against written words that are on the screen while they run, and no control on this page can produce audio.'
 }
];

/* ---- §07's voice prompts, as words rather than as controls ------------------------------------
 *
 * §07 asks for five things: push-to-talk input with four clear states and a final transcript shown
 * for review; the browser's speech for the output; mouth movement driven by playback; timing that
 * closes the mouth the moment anything stops; and a position on retained audio. Four of the five can
 * be reviewed honestly on a page that cannot hear and cannot speak, and they are, below and in the
 * widget. The fifth — the control itself — is refused above, and what stands where it would have
 * been is this: the four states named, with what is true of each one on a phone and on the web.
 *
 * WHY THE SENTENCES ARE READ AND NOT TYPED. VOICE_SENTENCES is the live GilbertOne's own copy,
 * decided by the founder on 14 September and rendered word for word by all three platforms. A
 * demonstrator that retyped it would put a fourth version of a sentence that is supposed to exist
 * once in front of the one person whose job is to check it, and the copy somebody types at eleven at
 * night is always the softer one.
 *
 * ONE WORD IS SUBSTITUTED, in the Input row's quotation and nowhere else, for the same reason A08's
 * motion wording carries a substitution: no file under apps/web/src may carry the document's word
 * for the state about hearing, because scripts/check-boundaries.mjs fails the build on it so that a
 * screen cannot drift back towards it a sentence at a time. The rule the row states is kept whole;
 * "open-microphone" stands where the document's own word for that state would be. */

const fillSeconds = (text: string) => text.replace('{seconds}', String(voicePolicy.maxListeningSeconds));
const gilbertRefusal = (id: string) => {
 const found = gilbertRefusals.find(refusal => refusal.id === id);
 if (!found) throw new Error(`No GilbertOne refusal "${id}" in packages/catalog/assistant.json.`);
 return found;
};

/** §07's own capability table, and what this phase does with each row. */
export type VoiceRow = { readonly id: string; readonly capability: string; readonly poc: string; readonly here: string };
export const VOICE_TABLE: readonly VoiceRow[] = [
 {
  id: 'input', capability: 'Input',
  poc: 'Push-to-talk; final transcript shown for review; clear microphone-off, starting, open-microphone and error states.',
  here: 'The review half is built and pressable: an example transcript, an editable field, Send and Discard, at the foot of the widget\'s transcript and above its composer. The control and its four states are refused — V01.'
 },
 {
  id: 'output', capability: 'Output',
  poc: 'Browser speech where supported; explicit playback choice and voice selection. Do not guarantee a South African voice is installed.',
  here: 'No audio, no voice list and no browser voice. The explicit choice is built as a caption switch, and the caption is the whole of the output — V02.'
 },
 {
  id: 'mouth', capability: 'Mouth movement',
  poc: 'Use playback start/end and supported word-boundary events for approximate articulation. Fallback to a restrained speaking indicator when synchronisation is unreliable.',
  here: 'The shapes run against the caption\'s own words, one word at a time, with the mouth shut between them. The indicator beside the caption is that restrained fallback, and here it is the only thing there is.'
 },
 {
  id: 'timing', capability: 'Timing',
  poc: 'Close the mouth immediately on pause, cancel, error or end. Never move it simply because a response is being generated.',
  here: 'Stop, the pause control, reduced motion and a hidden tab each close the mouth. A08 moves the eyes and never the mouth, because waiting for something is not saying anything.'
 },
 {
  id: 'privacy', capability: 'Privacy',
  poc: 'No retained raw audio by the widget by default. Provider processing and retention must be stated separately.',
  here: 'Nothing is captured, so there is nothing to retain, and no provider, so there is nothing to state. The phone\'s position — that no recording is made at all — is the contract sentence beside A07.'
 }
];

/** The four input states §07 asks for: named, and true in both columns. Neither column is a control. */
export type VoiceState = { readonly id: string; readonly name: string; readonly onThePhone: string; readonly onTheWeb: string };
export const VOICE_STATES: readonly VoiceState[] = [
 {
  id: 'off', name: 'Microphone off',
  onThePhone: 'The resting state, and the only one the phone is in until somebody taps. The tap is the whole of the model: nothing opens on its own, and nothing opens without the button.',
  onTheWeb: 'There is no microphone to be off. The web has a text field, and what is typed into this one stays in this browser.'
 },
 {
  id: 'starting', name: 'Starting',
  onThePhone: fillSeconds('Between the tap and the first sound. The phone may ask for the microphone and the recogniser here, after MyThuso has explained in its own words why, and a refusal is answered rather than asked again.'),
  onTheWeb: 'Nothing starts. No permission of any kind is asked for by this page, and the journeys sit in front of the browser\'s media and permission APIs before the page loads to prove that nothing reached for one.'
 },
 {
  id: 'open', name: 'Microphone open',
  onThePhone: fillSeconds('The one state the phone announces, for exactly as long as the microphone is open — until Stop, or {seconds} seconds, whichever comes first. The capability\'s own note under V01 is what binds the two together, in both directions.'),
  onTheWeb: 'Never. Not enabled, not disabled, not decorative.'
 },
 {
  id: 'error', name: 'Error',
  onThePhone: 'Four failures and four sentences, none of them an apology and none of them a retry loop: the phone has no English recogniser of its own, permission is off, nothing was caught, or the phone took its microphone back.',
  onTheWeb: 'A17 draws the face and the widget\'s unavailable state says the words. Nothing here can fail in this way, because nothing is attempted.'
 }
];

/* ONE CONTRACT REFUSAL IS POINTED AT RATHER THAN QUOTED HERE. GilbertOne's refusal that the state is
   shown only while the microphone is open, and the microphone never opened without it, is the rule
   this whole section rests on — and its id in assistant.json is that state's name, which no file
   under apps/web/src may carry. Assembling the id out of pieces to get past the check would be worse
   than either writing it or not needing it, and it is not needed: the voice capability's own note,
   rendered under V01 from packages/catalog/capabilities.json, states the same rule in the same
   breath as the refusal to draw the control, which is where a reviewer is looking for it. */

/** The product's own sentences about why the web has no microphone, read from the contract. */
export type VoiceSentence = { readonly id: string; readonly when: string; readonly text: string };
export const VOICE_SENTENCES: readonly VoiceSentence[] = [
 { id: 'web', when: 'On the web, in every state', text: voicePolicy.sentences.web },
 { id: 'keyboard', when: 'About the dictation key on your own keyboard', text: gilbertConversation.webKeyboardNote },
 { id: 'before', when: 'On a phone, before it asks for the microphone', text: voicePolicy.sentences.beforePermission },
 { id: 'unavailable', when: 'On a phone with no English recogniser of its own', text: voicePolicy.sentences.unavailable },
 { id: 'refused', when: 'On a phone where permission is switched off', text: voicePolicy.sentences.refused },
 { id: 'failed', when: 'On a phone, when nothing was caught', text: voicePolicy.sentences.failed },
 { id: 'no-audio-kept', when: 'The refusal about what is kept', text: gilbertRefusal('no-audio-kept').statement }
];

/** The capability contract's own note, rendered beside the control this page will not draw. */
export const VOICE_NEVER_SOFTEN = neverSoftenOf('voice') ?? '';

/* §07: "final transcript shown for review", and §06: a review step before anything is committed. The
   interaction shape is reviewable without a recogniser behind it — the field, the correction and the
   discard are the same whether the words arrived by microphone or were put there by this constant —
   so it is built, with the words saying plainly that nothing was captured. The two labels are the
   contract's, because they are what a person actually reads on the phone. */
export const TRANSCRIPT_REVIEW = {
 example: 'Demonstration transcript — nothing was captured',
 correctLabel: voicePolicy.sentences.correctLabel,
 discardLabel: voicePolicy.sentences.discardLabel,
 sendLabel: 'Send the corrected words',
 discarded: 'Discarded. Nothing was kept, and nothing was captured in the first place.',
 sent: 'On a phone this is where the corrected words would go to GilbertOne. Here they went into this transcript and nowhere else: nothing was captured, and nothing was sent.'
} as const;

/* §07 again: "Show captions whenever audio is used". No audio is ever used here, and the caption is
   the whole of the output — so there is no control that turns it off, and the switch below chooses
   whether the demonstration answer is given at all rather than whether it is captioned. With it off
   the mouth does not move: the mouth only ever moves against words that are on the screen. */
export const SPOKEN_ANSWERS = {
 label: 'Demo caption only — no audio is ever produced by this page',
 whileRunning: 'Shaping these words · no audio is played',
 offReason: 'Spoken answers are switched off, so A10 does not run. The mouth never moves without the caption beside it, because the caption is what is being said — and there is no audio for it to follow.'
} as const;

/* ---- Yawn: on a leash, by the document's own numbers ------------------------------------------
 *
 * §04: "Default yawning off in care conversations. In an opt-in playful demo it may occur once after
 * at least 120 seconds of inactivity, with a minimum five-minute cooldown. Suppress it during typing,
 * reading a new message, speech capture, processing, playback, health discussions, support cues and
 * urgent handling."
 *
 * The demonstrator honours all of it, including against its own control: a reviewer pressing the
 * yawn button during an urgent pose is exactly the case AT07 tests, and a control that obeyed a
 * reviewer where it would not obey a timer would prove nothing. */
export const YAWN_IDLE_MS = 120_000;
export const YAWN_COOLDOWN_MS = 300_000;
export const YAWN_SUPPRESSORS: readonly string[] = [
 'typing', 'reading a new message', 'speech capture', 'processing', 'playback', 'health discussions', 'support cues', 'urgent handling'
];
/** Which running cues stand for one of those situations. A07 and playback have no cue to name. */
const SUPPRESSING_CUES = new Set(['A05', 'A08', 'A10', 'A11', 'A16', 'A17']);

export type YawnRefusal = { readonly allowed: boolean; readonly because: string };
export function mayYawn(args: { playful: boolean; running: Cue | null; typing: boolean; sinceCooldown: number; reduced: boolean }): YawnRefusal {
 if (args.reduced) return { allowed: false, because: 'Reduced motion is on, and a yawn is nonessential movement.' };
 if (args.running && SUPPRESSING_CUES.has(args.running.id)) return { allowed: false, because: `Suppressed while ${args.running.name} is running. A yawn belongs to none of these moments.` };
 if (args.typing) return { allowed: false, because: 'Suppressed while somebody is typing. Nothing here implies a person is boring GilbertOne.' };
 if (args.sinceCooldown < YAWN_COOLDOWN_MS) return { allowed: false, because: `Cooling down. The minimum is five minutes between yawns, and ${Math.ceil((YAWN_COOLDOWN_MS - args.sinceCooldown) / 1000)} seconds of it are left.` };
 if (!args.playful) return { allowed: false, because: 'Playful mode is off, which is the default in a care conversation. Switch it on to see the cue.' };
 return { allowed: true, because: 'Playful mode is on, nothing is suppressing it and the cooldown has passed.' };
}

/* ---- The caption track A10's mouth runs against ----------------------------------------------
 * A word at a time, with a shape per word and a closed mouth for the pauses between them, so the
 * mouth is shut whenever nothing is being said. The shape is chosen from the word's own vowels —
 * crude, deterministic and honest about being neither a viseme model nor a speech engine. */
const VOWEL_SHAPE: Record<string, MouthShape> = { a: 'wide', e: 'ajar', i: 'ajar', o: 'round', u: 'round', y: 'ajar' };
export function captionSteps(words: readonly string[]): Step[] {
 const steps: Step[] = [];
 for (const word of words) {
  const vowels = [...word.toLowerCase()].filter(letter => letter in VOWEL_SHAPE);
  const shape = vowels.length ? VOWEL_SHAPE[vowels[0]] : 'ajar';
  const jaw = Math.min(1, 0.35 + vowels.length * 0.2);
  steps.push({ pose: { mouth: shape, jaw }, ms: 150, blend: 90 });
  steps.push({ pose: { mouth: 'closed', jaw: 0 }, ms: 90, blend: 90 });
 }
 steps.push({ pose: { mouth: 'neutral', jaw: 0 }, ms: 200 });
 return steps;
}

/* ---- The reducer ------------------------------------------------------------------------------
 *
 * Pure, and the only thing that moves the face. Scheduling lives in the rig component: this decides
 * what a trigger or a tick means, never when one happens.
 *
 * `turn` is the cancellation token §04 asks for. Every trigger mints one; every later action carries
 * the turn it belongs to; anything arriving for an older turn is dropped, which is precisely "a late
 * answer from an earlier turn must never restart the mouth, change the face or replace the current
 * action" and what AT05 tests. `landed` and `refused` are kept so the demonstrator can show, in
 * words, which of two triggers won and why. */
export type RigState = {
 readonly pose: Pose;
 readonly cue: Cue | null;
 /** The steps the running cue is actually walking. A10's caption track replaces its manifest steps,
     so the walk has to be held here rather than read back off the cue. */
 readonly steps: readonly Step[];
 readonly step: number;
 readonly turn: number;
 readonly blend: number;
 /** The last trigger that changed the face, and the last one that was turned away. */
 readonly landed: { cue: Cue; turn: number } | null;
 readonly refused: { cue: Cue; turn: number; because: string } | null;
};

export const START: RigState = { pose: NEUTRAL, cue: null, steps: [], step: -1, turn: 0, blend: BLEND_MS, landed: null, refused: null };

export type Action =
 | { kind: 'play'; cue: Cue; turn: number; steps?: readonly Step[]; reduced?: boolean }
 | { kind: 'advance'; turn: number }
 | { kind: 'stop'; turn: number }
 /* Everything stops — a pause, a reduced-motion setting switched on mid-cue, a tab hidden. The cue
    does not freeze half-drawn: it settles onto its own still expression and lets go of the face.
    A cue frozen mid-walk keeps its priority for ever, and the next thing a reviewer presses is
    refused by an animation nobody can see. */
 | { kind: 'settle' }
 | { kind: 'rest' };

/** The steps a play actually runs — a caption track replaces A10's opening pair. */
const stepsOf = (action: Extract<Action, { kind: 'play' }>) => action.steps ?? action.cue.steps;

export function reduce(state: RigState, action: Action): RigState {
 switch (action.kind) {
  case 'play': {
   /* The stale-turn rule, first, before anything else can be decided. A trigger minted before one
      that has already landed changes nothing at all. */
   if (action.turn <= state.turn) return { ...state, refused: { cue: action.cue, turn: action.turn, because: `Turn ${action.turn} arrived after turn ${state.turn} had already taken the face. A late trigger from an earlier turn never restarts the mouth or changes the face.` } };
   const running = state.cue;
   /* Priority. An incoming cue lands when its track is at least as high as the running one's, which
      is what stops a gesture covering an urgent face. A cue that has finished holds nothing. */
   if (running && rankOf(action.cue.track) > rankOf(running.track)) {
    return { ...state, refused: { cue: action.cue, turn: action.turn, because: `${TRACK_WORDS[action.cue.track]} may not displace ${TRACK_WORDS[running.track]}. The order is ${TRACKS.map(t => TRACK_WORDS[t].toLowerCase()).join(' → ')}.` } };
   }
   const steps = stepsOf(action);
   /* Reduced motion: the static expression instead of the movement, and nothing at all for a cue
      that is only movement. §10 asks for static expressions and text states, so the status line
      still changes — the words are how the cue is demonstrated when the face may not move. */
   if (action.reduced) {
    if (!action.cue.still) return { ...state, turn: action.turn, refused: { cue: action.cue, turn: action.turn, because: 'Reduced motion is on and this cue is movement with no still expression behind it, so it does not play.' } };
    return { ...state, pose: clampPose({ ...NEUTRAL, ...action.cue.still }), cue: action.cue.holds ? action.cue : null, steps, step: steps.length - 1, turn: action.turn, blend: BLEND_INSTANT_MS, landed: { cue: action.cue, turn: action.turn }, refused: null };
   }
   const first = steps[0];
   return {
    pose: clampPose({ ...state.pose, ...first.pose }),
    cue: action.cue, steps, step: 0, turn: action.turn,
    blend: first.blend ?? BLEND_MS,
    landed: { cue: action.cue, turn: action.turn }, refused: null
   };
  }
  case 'advance': {
   if (action.turn !== state.turn || !state.cue) return state;
   const next = state.step + 1;
   if (next >= state.steps.length) return state.cue.holds ? state : { ...state, cue: null, step: -1 };
   const step = state.steps[next];
   return { ...state, pose: clampPose({ ...state.pose, ...step.pose }), step: next, blend: step.blend ?? BLEND_MS };
  }
  case 'stop':
   if (action.turn < state.turn) return state;
   return { ...state, cue: null, steps: [], step: -1, turn: action.turn, blend: BLEND_INSTANT_MS };
  case 'settle': {
   if (!state.cue) return state;
   const settled = state.cue.still ? clampPose({ ...state.pose, ...state.cue.still }) : state.pose;
   return { ...state, pose: settled, cue: state.cue.holds ? state.cue : null, steps: state.cue.holds ? state.steps : [], step: state.cue.holds ? state.steps.length - 1 : -1 };
  }
  case 'rest':
   return { ...state, pose: NEUTRAL, cue: null, steps: [], step: -1, blend: BLEND_MS };
 }
}
