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
 * WHAT IT DELIBERATELY HAS NOT GOT. No model, no network, no conversation state — those are phases 2
 * to 4, gated on decisions (a pinned checkpoint, a hosted service, a clinical review) this repository
 * has not made. See REFUSED for what is still absent and why.
 *
 * WHAT IT GOT ON 17 SEPTEMBER 2026. §07's voice, both halves, for real and on this page only: the
 * browser's own recogniser behind a push-to-talk control, and the browser's own voice reading the
 * demonstration answer out. The founder asked for it so that the four microphone states, the
 * transcript review and a mouth running against real playback could be judged rather than described,
 * and the decision is on file as `voice.webPoc` in packages/catalog/assistant.json. It reaches this
 * page and nothing else: the live assistant on the web is still typed to, for the reason it always
 * was — a browser's recognition may hand what somebody said to the company that makes the browser,
 * and a patient asking about her own health has not chosen that route the way a reviewer opening a
 * demonstrator has. apps/web/src/lib/voice.ts is the whole of the machinery, and
 * scripts/check-boundaries.mjs allows it there and refuses it in every other file on the web.
 *
 * A10's mouth is therefore driven by playback now, and approximately. The browser's word-boundary
 * events are what drive it where they fire; where they do not, the timed caption track below still
 * does. §07 says in as many words that boundary events are not a portable viseme stream and must not
 * be sold as production lip-sync — they are not sold as one here, and the caption is beside the mouth
 * the whole time either way.
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
  /* The motion note below is the document's own, restored to it on 17 September 2026. Until then its
     last clause carried a substitution: no file under apps/web/src could write the word for an open
     microphone, because nothing on the web had one and scripts/check-boundaries.mjs failed the build
     on the word so that a screen could not drift back towards it a sentence at a time. That check
     still stands for every other file on the web. This page now genuinely listens, so the word is
     true here and is written, and the rule the clause states matters more rather than less: a face
     that looks as though it is hearing something while the microphone is shut is exactly the thing
     the voice capability's note forbids. */
  motion: 'Subtle thinking glance and a small status indicator. It must never look as though the widget is listening when it is only waiting.',
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
  /* The trigger is the document's and it is now literally true: the cue is fired from the utterance's
     own start event, not from the tap that asked for it. Where the browser reports word boundaries
     each word is played as it is spoken; where it does not, the timed track built by `captionSteps`
     runs instead. AT04 asks that the mouth never move during silence, and it is the utterance ending
     — not a timer — that closes it. These two steps are only the opening and the close. */
  steps: [
   { pose: { mouth: 'ajar', jaw: 0.3 }, ms: 140 },
   { pose: { mouth: 'closed', jaw: 0 }, ms: 140 }
  ],
  still: { mouth: 'neutral' },
  says: 'GilbertOne is speaking the demonstration answer, and the caption beside it is the same words.'
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

/* ---- What this phase still refuses ------------------------------------------------------------
 *
 * Three things, each declared with its reason rather than quietly left out — a demonstrator that
 * silently drops what it has not built is a demonstrator whose reviewer never notices it is missing.
 *
 * A07, A10's audio half, and §07's two voice rows were on this list until 17 September 2026, when
 * the founder asked for the browser's microphone and the browser's voice on this page. They are
 * built now, so they are gone from here: a refusal kept after the thing is built is the same kind of
 * untrue sentence as a claim made before it. What remains is what genuinely is not built, and each
 * of the three has a reason that is not "nobody got to it yet".
 *
 * Two of the three are §07's own. The third is the whole of phases 2 to 4, and it is first because
 * it is the thing a reviewer is most likely to assume from a page that now talks back. */
export type Refusal = { readonly id: string; readonly name: string; readonly statement: string; readonly why: string };
export const REFUSED: readonly Refusal[] = [
 {
  id: 'M01', name: 'An answer. Any answer.',
  statement: 'Not built and not reached for. Nothing on this page understands what you say to it: there is no model, no knowledge retrieval, no server and no network request of any kind.',
  why: 'The microphone is real now and the voice is real, which makes this the easiest thing on the page to misread: a reviewer who speaks and hears a reply may reasonably assume something understood them. Nothing did. What is caught is shown back for correction and put into a transcript in this browser; what is spoken is a fixed demonstration sentence this page already had. The model, its hosting and the clinical review that would have to precede either are phases 2 to 4, and none of those decisions has been made.'
 },
 {
  id: 'V03', name: '§07\'s voice selection, and any promise about which voice speaks',
  statement: 'Not built. There is no voice list and no chooser: the browser speaks in whatever voice it would use for this page\'s language, and no South African voice is promised, implied or looked for.',
  why: '§07 asks for explicit playback choice and voice selection, and says in the same row not to guarantee a South African voice is installed. The playback choice is built — the switch beside the replay control is it. The selection is not, because §07 also asks that a voice be chosen by review rather than by a locale setting, and no such review has happened. A picker offering whatever the machine happened to have installed would be the locale-setting promise wearing a control.'
 },
 {
  id: 'V04', name: 'A meter or a waveform driven by the sound of your voice',
  statement: 'Not built, and the APIs it would need are refused in every file on the web. Nothing here reads an audio level, draws a waveform or animates anything from the sound in the room.',
  why: '§07 allows a meter from local audio level once capture has begun, and asks in the next breath that nothing animate a microphone while nobody is being recorded. Reading a level means putting the microphone stream through the page itself, and this page takes no audio at all: the recogniser hears you and hands back words, and no sample of what you said passes through anything written here. The open state is said in words and shown by the control that opened it, which is the honest version of the same information and cannot be running when the microphone is shut.'
 }
];

/* ---- §07's voice, built ------------------------------------------------------------------------
 *
 * §07 asks for five things: push-to-talk input with four clear states and a final transcript shown
 * for review; the browser's speech for the output; mouth movement driven by playback; timing that
 * closes the mouth the moment anything stops; and a position on retained audio. All five are built
 * here as of 17 September 2026, on this page and on no other page of the web product.
 *
 * WHY THE SENTENCES ARE READ AND NOT TYPED. VOICE_SENTENCES is the contract's own copy — the phone's,
 * decided by the founder on 14 September, and this page's, decided on 17 September — rendered word
 * for word. A demonstrator that retyped either would put another version of a sentence that is
 * supposed to exist once in front of the one person whose job is to check it, and the copy somebody
 * types at eleven at night is always the softer one.
 *
 * THE DOCUMENT'S OWN WORDS ARE QUOTED WHOLE NOW. Until this change the Input row substituted a word
 * in §07's quotation, because no file under apps/web/src could write the name of the state where a
 * microphone is open and scripts/check-boundaries.mjs failed the build on it. That check still
 * stands for every other file on the web, and it is narrowed to exempt this page and the three files
 * beside it — where the word is true. */

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
  poc: 'Push-to-talk; final transcript shown for review; clear microphone-off, starting, listening and error states.',
  here: 'Built. One control, tapped to start and tapped to stop, with the four states named in words beside it and never carried by colour alone. What the recogniser catches lands in the review field — editable, with Send and Discard — at the foot of the widget\'s transcript.'
 },
 {
  id: 'output', capability: 'Output',
  poc: 'Browser speech where supported; explicit playback choice and voice selection. Do not guarantee a South African voice is installed.',
  here: 'Built, except the selection — V03. The browser reads the demonstration answer out in whatever voice it has, the switch beside Replay is §07\'s explicit playback choice, and the caption is on the screen for as long as the voice is speaking.'
 },
 {
  id: 'mouth', capability: 'Mouth movement',
  poc: 'Use playback start/end and supported word-boundary events for approximate articulation. Fallback to a restrained speaking indicator when synchronisation is unreliable.',
  here: 'Built, and approximate on purpose. Where the browser fires word-boundary events the mouth shapes each word as it is spoken; where it does not, the timed caption track runs instead and the panel says which of the two you are watching. Neither is a viseme stream and §07 says not to sell one as such.'
 },
 {
  id: 'timing', capability: 'Timing',
  poc: 'Close the mouth immediately on pause, cancel, error or end. Never move it simply because a response is being generated.',
  here: 'The end of the utterance, Stop, a failure, the pause control, reduced motion and a hidden tab each close the mouth. A08 moves the eyes and never the mouth, because waiting for something is not saying anything.'
 },
 {
  id: 'privacy', capability: 'Privacy',
  poc: 'No retained raw audio by the widget by default. Provider processing and retention must be stated separately.',
  here: 'No audio is captured, buffered or kept by this page at all — the APIs that could are refused in every file on the web, including the adapter. The provider is your browser, its route is stated before the first tap, and what it does with the sound is its own to answer for.'
 }
];

/** The four input states §07 asks for: named, and true in both columns — on a phone, and on this page
 *  since 17 September 2026. Each one is a state the control actually reaches. */
export type VoiceState = { readonly id: string; readonly name: string; readonly onThePhone: string; readonly onTheWeb: string };
export const VOICE_STATES: readonly VoiceState[] = [
 {
  id: 'off', name: 'Microphone off',
  onThePhone: 'The resting state, and the only one the phone is in until somebody taps. The tap is the whole of the model: nothing opens on its own, and nothing opens without the button.',
  onTheWeb: 'The same, and the state this page is in when you arrive. Nothing opens on load, on focus, on hover or on a keystroke — only on the tap.'
 },
 {
  id: 'starting', name: 'Starting',
  onThePhone: fillSeconds('Between the tap and the first sound. The phone may ask for the microphone and the recogniser here, after MyThuso has explained in its own words why, and a refusal is answered rather than asked again.'),
  onTheWeb: 'Between the tap and the browser saying the microphone is open. The browser may ask for permission here, after the disclosure above has been read, and a refusal is answered in words rather than asked again.'
 },
 {
  id: 'open', name: 'Listening',
  onThePhone: fillSeconds('The one state the phone announces, for exactly as long as the microphone is open — until Stop, or {seconds} seconds, whichever comes first.'),
  onTheWeb: fillSeconds('Shown from the moment the browser says the microphone is open, and never a moment before — not on the tap, not while permission is being decided. It ends on Stop or after {seconds} seconds, whichever comes first, and the cap closing it is said in words rather than left to be noticed.')
 },
 {
  id: 'error', name: 'Error',
  onThePhone: 'Four failures and four sentences, none of them an apology and none of them a retry loop: the phone has no English recogniser of its own, permission is off, nothing was caught, or the phone took its microphone back.',
  onTheWeb: 'The same four, in this page\'s own words: this browser has no recogniser, permission is off for this site, nothing was caught, or the microphone closed before you asked it to. A17 draws the face and the sentence says what happened.'
 }
];

/* THE RULE THIS SECTION RESTS ON is GilbertOne's own refusal that the state is shown only while the
   microphone is open, and that the microphone is never opened without it. It is quoted from the
   contract below rather than restated, and it binds this page in both directions now that the page
   genuinely has one: the control may not say it is open before the recogniser says so, and it may
   not stay open without saying so. */

/** The product's own sentences, read from the contract: the phone's, and this page's. */
export type VoiceSentence = { readonly id: string; readonly when: string; readonly text: string };
export const VOICE_SENTENCES: readonly VoiceSentence[] = [
 { id: 'web-poc-before', when: 'On this page, before the browser is asked for the microphone', text: fillSeconds(voicePolicy.webPoc.sentences.beforePermission) },
 { id: 'web-poc-unavailable', when: 'In a browser with no speech recognition at all', text: voicePolicy.webPoc.sentences.unavailable },
 { id: 'web-poc-refused', when: 'In a browser where permission is switched off for this site', text: voicePolicy.webPoc.sentences.refused },
 { id: 'web-poc-failed', when: 'On this page, when nothing was caught', text: voicePolicy.webPoc.sentences.failed },
 { id: 'web-poc-interrupted', when: 'On this page, when the microphone closed before you asked', text: voicePolicy.webPoc.sentences.interrupted },
 { id: 'web', when: 'Everywhere else on the web, where GilbertOne still does not listen', text: voicePolicy.sentences.web },
 { id: 'keyboard', when: 'About the dictation key on your own keyboard', text: gilbertConversation.webKeyboardNote },
 { id: 'before', when: 'On a phone, before it asks for the microphone', text: voicePolicy.sentences.beforePermission },
 { id: 'unavailable', when: 'On a phone with no English recogniser of its own', text: voicePolicy.sentences.unavailable },
 { id: 'refused', when: 'On a phone where permission is switched off', text: voicePolicy.sentences.refused },
 { id: 'failed', when: 'On a phone, when nothing was caught', text: voicePolicy.sentences.failed },
 { id: 'no-audio-kept', when: 'The refusal about what is kept', text: gilbertRefusal('no-audio-kept').statement }
];

/** Why the rest of the web is still typed to, in the contract's own words. */
export const VOICE_WEB_POC_SCOPE = voicePolicy.webPoc.scope;

/** The capability contract's own note about when an affordance may be drawn at all. */
export const VOICE_NEVER_SOFTEN = neverSoftenOf('voice') ?? '';

/* §07: "final transcript shown for review", and §06: a review step before anything is committed. The
   words in the field are the recogniser's now, and the step around them is unchanged: a person reads
   what a machine thought they said, corrects it, and then decides whether it goes anywhere at all.
   The two labels are the contract's, because they are what a person actually reads on the phone. */
export const TRANSCRIPT_REVIEW = {
 /* What stands in the field when the review is opened without having captured anything — from the
    demonstrator's own control, which is how a reviewer inspects the step without speaking. */
 example: 'Demonstration transcript — nothing was captured',
 correctLabel: voicePolicy.sentences.correctLabel,
 discardLabel: voicePolicy.sentences.discardLabel,
 sendLabel: 'Send the corrected words',
 discarded: 'Discarded. Nothing was kept — not the words, and not the sound they were made from.',
 sent: 'On a phone this is where the corrected words would go to GilbertOne. Here they went into this transcript and nowhere else: nothing understood them, and nothing left this browser.',
 /* The words arrived from the browser's recogniser rather than from this page, and the person doing
    the correcting should know which. */
 fromMicrophone: 'These are the words your browser sent back. Check them — a recogniser is often wrong about a name, a number or a date — and correct them before they go anywhere.'
} as const;

/* §07 again: "Show captions whenever audio is used". Audio is used here now, so the caption is not
   optional and there is no control that turns it off: the switch below chooses whether the
   demonstration answer is given at all. With it off A10 does not run and nothing is spoken. */
export const SPOKEN_ANSWERS = {
 label: 'Demonstration answer, spoken by your browser and captioned at the same time',
 whileRunning: 'Speaking these words',
 /* The restrained fallback §07 asks for when synchronisation cannot be trusted — which is what is
    running whenever the browser fires no word-boundary events. */
 timedFallback: 'Speaking these words · this browser sends no word timings, so the mouth is running on the caption\'s own timing rather than on the voice',
 offReason: 'Spoken answers are switched off, so A10 does not run and nothing is spoken. The mouth never moves without the words it is shaping on the screen beside it.'
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
/** Which running cues stand for one of those situations. Speech capture has no cue of its own — the
 *  microphone is not a pose — so it is passed in instead, and it is the first thing asked. */
const SUPPRESSING_CUES = new Set(['A05', 'A08', 'A10', 'A11', 'A16', 'A17']);

export type YawnRefusal = { readonly allowed: boolean; readonly because: string };
export function mayYawn(args: { playful: boolean; running: Cue | null; typing: boolean; sinceCooldown: number; reduced: boolean; capturing?: boolean }): YawnRefusal {
 if (args.reduced) return { allowed: false, because: 'Reduced motion is on, and a yawn is nonessential movement.' };
 /* §04 names speech capture among the suppressors, and it means it: a character that yawns at
    somebody in the middle of their sentence is the whole of what that list is protecting against. */
 if (args.capturing) return { allowed: false, because: 'Suppressed while the microphone is open. Yawning at somebody who is speaking is the thing §04\'s suppressor list exists to prevent.' };
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
