/* The full duplex speech conversation, as a pure state machine.

   This is the architecture contract that the real speech stack plugs into: Porcupine raises the
   wake word, Silero raises the voice-activity endpoints, faster-whisper turns audio into text, and
   Piper turns text back into audio. None of that lives here. This module holds no microphone, no
   network, no clock and no timers — it is `(state, event) -> { state, effects[] }`, deterministic
   and side-effect free, so the host runtime can drive it from any platform and the whole
   conversation can be replayed or compared turn for turn.

   The host owns the clock: every transition takes `now` as a parameter and stamps it onto the new
   state, so nothing here ever calls Date.now(). The host also owns the hardware: it executes the
   effects this module returns, and it reports back what happened as the next event.

   The refusal path is deliberately folded into speech: an escalation that fires while the machine
   is thinking passes through the transient `refusal` phase and comes straight out speaking the
   approved message. Affect may never soften a refusal or an emergency, and neither may this
   machine drop one — the escalation message is spoken verbatim.

   TWO MODES, SINCE 28 SEPTEMBER 2026. `single` is the machine as it was: a wake word or a tap opens
   one exchange, and when the answer has been spoken the machine rests and re-arms the wake word.
   `conversation` is the founder's brief of that day — "when you have spoken to it and you pause, it
   must respond automatically, just like Siri — not answering on top of you" — so a finished answer
   reopens the microphone with a `your_turn` effect instead of resting, a listening window that hears
   nothing is an idle round, and past the contract's idle rounds the microphone closes on its own with
   a `sleep` effect. Two things are the same in both modes and are the point of the design: a barge-in
   cuts the voice and listens, and an emergency answer closes the microphone even in conversation
   mode, because the next thing after an emergency answer is a phone call and not another turn.
   Conversation mode never emits a wake-word effect — there is no wake word on the web — and the
   numbers it runs on (the endpoint pause, the utterance cap, the utterance count, the idle rounds)
   are read from packages/catalog/conversation-mode.json rather than typed here. */

import conversationMode from "../../catalog/conversation-mode.json" with { type: "json" };

/** Speech conversation states. `refusal` is transient: a transition never rests there. */
export type SpeechPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "prompt_continue"
  | "refusal";

/** How the machine behaves once an answer has been spoken: rest, or reopen the microphone. */
export type SpeechMode = "single" | "conversation";

/** What is being spoken. An `answer` hands the turn back; anything else closes the microphone. */
export type SpeakingKind = "answer" | "emergency" | "escalation";

/** Why the microphone closed on its own — the contract's endsOn ids that are the machine's to raise. */
export type SleepReason = "idle-rounds-exhausted" | "emergency-answer";

/** Events that drive transitions. Every one is raised by the host, never invented here. */
export type SpeechEvent =
  | { type: "wake_word_detected" }
  | { type: "session_start"; mode?: SpeechMode }
  | { type: "vad_endpoint"; silenceMs: number }
  | { type: "listening_timeout" }
  | { type: "utterance_cap_reached"; durationMs: number }
  | { type: "transcript_ready"; text: string }
  | { type: "transcript_failed"; reason: string }
  | { type: "response_ready"; text: string; kind?: SpeakingKind }
  | { type: "escalation_fire"; ruleId: string; message: string }
  | { type: "tts_finished" }
  | { type: "tts_failed"; reason: string }
  | { type: "barge_in" }
  | { type: "user_continues" }
  | { type: "user_dismisses" }
  | { type: "cancel" }
  | { type: "error"; source: string; reason: string };

/** Effects the host runtime must execute. This module returns them; it never performs them. */
export type SpeechEffect =
  | { type: "start_wake_word_detection" }
  | { type: "stop_wake_word_detection" }
  | { type: "start_listening" }
  | { type: "stop_listening" }
  | { type: "start_transcription" }
  | { type: "cancel_transcription" }
  | { type: "start_thinking"; text: string }
  | { type: "start_speaking"; text: string }
  | { type: "cancel_speech" }
  | { type: "prompt_continue" }
  | { type: "your_turn" }
  | { type: "sleep"; reason: SleepReason }
  | { type: "return_to_idle" }
  | { type: "signal_error"; source: string; reason: string };

export interface SpeechState {
  phase: SpeechPhase;
  /** Accumulated transcript in multi-utterance exchanges. */
  transcriptBuffer: string;
  /** The text currently being spoken. */
  speakingText: string | null;
  /** Number of consecutive utterances in this exchange. */
  utteranceCount: number;
  /** Timestamp of last state change (host-provided, not Date.now()). */
  lastTransitionAt: number;
  /** Whether echo cancellation is active (needed for barge-in). */
  echoCancellationActive: boolean;
  /** Rest after an answer, or reopen the microphone for the next turn. */
  mode: SpeechMode;
  /** What the voice is reading, while it reads: an answer hands the turn back, an emergency or an
   *  escalation closes the microphone. Null outside `speaking`. */
  speakingKind: SpeakingKind | null;
  /** Listening windows in a row that heard nothing, in conversation mode. Reset by every answer. */
  idleRounds: number;
}

export interface TransitionResult {
  state: SpeechState;
  effects: SpeechEffect[];
}

/* The numbers this machine runs on, every one read from the contract. A proposed setting's default is
   found by its key, and a key the contract no longer carries stops the module from loading rather than
   letting a pause or a round count quietly become undefined. */
function settingDefault(key: string): number {
  const item = conversationMode.proposedSettings.items.find((s) => s.key === key);
  if (!item) throw new Error(`packages/catalog/conversation-mode.json has no proposed setting "${key}".`);
  return item.default.value;
}

/** Per-utterance cap from the founder amendment, in milliseconds; the contract holds it in seconds. */
export const PER_UTTERANCE_CAP_MS = conversationMode.utteranceCapSeconds * 1000;

/** The pause that means "your turn": a VAD endpoint shorter than this is a breath and is ignored. */
export const VAD_SILENCE_THRESHOLD_MS = settingDefault(conversationMode.endpoint.settingKey);

/** Maximum utterances before requiring explicit continue. */
export const MAX_UTTERANCES_PER_EXCHANGE = conversationMode.maxUtterancesPerExchange;

/** Listening windows that hear nothing before the microphone closes on its own, in conversation mode. */
export const IDLE_ROUNDS_BEFORE_SLEEP = settingDefault(conversationMode.sleep.settingKey);

/** Create the initial idle state. `now` is host-provided so nothing here reads the clock. The mode
 *  defaults to `single` so that every host built before conversation mode behaves exactly as it did. */
export function initialSpeechState(now = 0, mode: SpeechMode = "single"): SpeechState {
  return idle(now, mode);
}

/** A fresh idle state stamped at `at` — every reset path lands here. The mode survives a reset: a
 *  conversation that has closed is still a conversation-mode machine waiting for its next tap. */
function idle(at: number, mode: SpeechMode): SpeechState {
  return {
    phase: "idle",
    transcriptBuffer: "",
    speakingText: null,
    utteranceCount: 0,
    lastTransitionAt: at,
    echoCancellationActive: false,
    mode,
    speakingKind: null,
    idleRounds: 0,
  };
}

/** The effects that re-arm the machine after a rest. Single mode listens for its wake word again;
 *  conversation mode has no wake word — on the web there is none to arm — so it re-arms nothing, and
 *  the next conversation starts with the next tap. */
function rearm(state: SpeechState): SpeechEffect[] {
  return state.mode === "single" ? [{ type: "start_wake_word_detection" }] : [];
}

/** Open the microphone for a fresh turn: an empty buffer, the first utterance of a new exchange, and
 *  the idle rounds cleared — something has just been said or answered. */
function freshListening(state: SpeechState, at: number): SpeechState {
  return phaseState(state, "listening", at, {
    transcriptBuffer: "",
    speakingText: null,
    utteranceCount: 1,
    idleRounds: 0,
  });
}

/**
 * Build the next state from `base`, moving to `phase` at time `at`. Echo cancellation is modelled
 * as engaged exactly while the machine is speaking (that is when its own voice can leak into the
 * mic); `patch` overrides any carried field. Nothing mutates `base`.
 */
function phaseState(
  base: SpeechState,
  phase: SpeechPhase,
  at: number,
  patch: Partial<SpeechState> = {},
): SpeechState {
  return {
    phase,
    transcriptBuffer: base.transcriptBuffer,
    speakingText: null,
    utteranceCount: base.utteranceCount,
    lastTransitionAt: at,
    echoCancellationActive: phase === "speaking",
    mode: base.mode,
    speakingKind: null,
    idleRounds: base.idleRounds,
    ...patch,
  };
}

/** The no-op result: the same state object back, nothing for the host to do. */
function hold(state: SpeechState): TransitionResult {
  return { state, effects: [] };
}

/** Join an incoming transcript onto what has already been said in this exchange. */
function appendTranscript(existing: string, text: string): string {
  if (existing.length === 0) return text;
  if (text.length === 0) return existing;
  return `${existing} ${text}`;
}

/** Pure transition function — the core of the state machine. */
export function transition(
  state: SpeechState,
  event: SpeechEvent,
  now?: number,
): TransitionResult {
  const at = now ?? state.lastTransitionAt;

  switch (state.phase) {
    case "idle":
      return fromIdle(state, event, at);
    case "listening":
      return fromListening(state, event, at);
    case "transcribing":
      return fromTranscribing(state, event, at);
    case "thinking":
      return fromThinking(state, event, at);
    case "speaking":
    case "refusal":
      // `refusal` is transient and never rests, but if a caller hands one back it behaves as speech.
      return fromSpeaking(state, event, at);
    case "prompt_continue":
      return fromPromptContinue(state, event, at);
    default:
      return hold(state);
  }
}

function fromIdle(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  if (event.type === "wake_word_detected") {
    return {
      state: freshListening(state, at),
      effects: [{ type: "stop_wake_word_detection" }, { type: "start_listening" }],
    };
  }
  if (event.type === "session_start") {
    // The tap. It opens the microphone with no wake word to stop, and it may set the mode — a tap on
    // the conversation control starts a conversation, a tap on push-to-talk starts a single exchange.
    return {
      state: freshListening({ ...state, mode: event.mode ?? state.mode }, at),
      effects: [{ type: "start_listening" }],
    };
  }
  // idle ignores everything else — there is no live exchange to drive.
  return hold(state);
}

function fromListening(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  switch (event.type) {
    case "vad_endpoint":
      if (event.silenceMs < VAD_SILENCE_THRESHOLD_MS) return hold(state);
      return {
        state: phaseState(state, "transcribing", at),
        effects: [{ type: "stop_listening" }, { type: "start_transcription" }],
      };
    case "utterance_cap_reached":
      return {
        state: phaseState(state, "prompt_continue", at),
        effects: [{ type: "stop_listening" }, { type: "prompt_continue" }],
      };
    case "listening_timeout": {
      // A window that heard nothing. Single mode simply closes — there is no next turn to wait for.
      if (state.mode === "single")
        return {
          state: idle(at, state.mode),
          effects: [{ type: "stop_listening" }, { type: "return_to_idle" }],
        };
      // Conversation mode counts the round and reopens the window, until the contract's rounds are
      // spent: then the microphone closes on its own and says why, because a microphone that waits
      // for ever for somebody who has walked away is an always-listening device.
      const idleRounds = state.idleRounds + 1;
      if (idleRounds >= IDLE_ROUNDS_BEFORE_SLEEP)
        return {
          state: idle(at, state.mode),
          effects: [
            { type: "stop_listening" },
            { type: "sleep", reason: "idle-rounds-exhausted" },
            { type: "return_to_idle" },
          ],
        };
      return {
        state: phaseState(state, "listening", at, { idleRounds }),
        effects: [{ type: "start_listening" }],
      };
    }
    case "cancel":
      return {
        state: idle(at, state.mode),
        effects: [{ type: "stop_listening" }, { type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at, state.mode),
        effects: [
          { type: "stop_listening" },
          { type: "signal_error", source: event.source, reason: event.reason },
          { type: "return_to_idle" },
        ],
      };
    default:
      return hold(state);
  }
}

function fromTranscribing(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  switch (event.type) {
    case "transcript_ready": {
      const buffer = appendTranscript(state.transcriptBuffer, event.text);
      return {
        state: phaseState(state, "thinking", at, { transcriptBuffer: buffer }),
        // cancel_transcription is cleanup for the finished recognizer, then thinking begins on the
        // whole accumulated buffer so a multi-utterance exchange keeps its context.
        effects: [
          { type: "cancel_transcription" },
          { type: "start_thinking", text: buffer },
        ],
      };
    }
    case "transcript_failed":
      // retry: back to the mic rather than dropping the exchange.
      return {
        state: phaseState(state, "listening", at),
        effects: [{ type: "cancel_transcription" }, { type: "start_listening" }],
      };
    case "cancel":
      return {
        state: idle(at, state.mode),
        effects: [{ type: "cancel_transcription" }, { type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at, state.mode),
        effects: [
          { type: "cancel_transcription" },
          { type: "signal_error", source: event.source, reason: event.reason },
          { type: "return_to_idle" },
        ],
      };
    default:
      return hold(state);
  }
}

function fromThinking(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  switch (event.type) {
    case "response_ready":
      // The kind travels with the answer so that `tts_finished` knows whether to hand the turn back
      // or close the microphone: an emergency answer closes it, in every mode.
      return {
        state: phaseState(state, "speaking", at, {
          speakingText: event.text,
          speakingKind: event.kind ?? "answer",
        }),
        effects: [{ type: "start_speaking", text: event.text }],
      };
    case "escalation_fire":
      // Passes through the transient `refusal` phase and comes straight out speaking the approved
      // message, verbatim. Affect never softens it and this machine never drops it.
      return {
        state: phaseState(state, "speaking", at, {
          speakingText: event.message,
          speakingKind: "escalation",
        }),
        effects: [{ type: "start_speaking", text: event.message }],
      };
    case "cancel":
      return {
        state: idle(at, state.mode),
        effects: [
          { type: "signal_error", source: "conversation", reason: "cancelled" },
          { type: "return_to_idle" },
        ],
      };
    case "error":
      return {
        state: idle(at, state.mode),
        effects: [
          { type: "signal_error", source: event.source, reason: event.reason },
          { type: "return_to_idle" },
        ],
      };
    default:
      return hold(state);
  }
}

/** Where a finished reading goes. Single mode rests and re-arms. Conversation mode hands the turn
 *  back — the microphone reopens and the host is told it is the person's turn — unless what was read
 *  was an emergency or an escalation: then the microphone closes, because the next thing that should
 *  happen is a phone call and not another turn with a page, and the words stay on the screen. */
function afterReading(state: SpeechState, at: number, before: SpeechEffect[]): TransitionResult {
  if (state.mode === "conversation" && state.speakingKind === "answer")
    return {
      state: freshListening(state, at),
      effects: [...before, { type: "start_listening" }, { type: "your_turn" }],
    };
  if (state.mode === "conversation")
    return {
      state: idle(at, state.mode),
      effects: [...before, { type: "sleep", reason: "emergency-answer" }, { type: "return_to_idle" }],
    };
  return {
    state: idle(at, state.mode),
    effects: [...before, ...rearm(state), { type: "return_to_idle" }],
  };
}

function fromSpeaking(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  switch (event.type) {
    case "tts_finished":
      return afterReading(state, at, []);
    case "barge_in":
      // Without echo cancellation the machine would hear its own voice as a barge-in, so ignore it.
      if (!state.echoCancellationActive) return hold(state);
      // Barge-in cuts the speech and listens. In single mode it continues the exchange, so the
      // transcript so far is kept; in conversation mode the question being answered was already
      // handed over, so the interruption is a new turn and the buffer starts clean — appending onto
      // a question GilbertOne has already read would ask it twice.
      return {
        state:
          state.mode === "conversation"
            ? freshListening(state, at)
            : phaseState(state, "listening", at, { speakingText: null }),
        effects: [{ type: "cancel_speech" }, { type: "start_listening" }],
      };
    case "tts_failed":
      // The words are on the screen whether or not the voice managed them, so the turn moves on the
      // same way a finished reading does — with the failure signalled first.
      return afterReading(state, at, [
        { type: "signal_error", source: "tts", reason: event.reason },
      ]);
    case "cancel":
      return {
        state: idle(at, state.mode),
        effects: [{ type: "cancel_speech" }, ...rearm(state), { type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at, state.mode),
        effects: [
          { type: "cancel_speech" },
          { type: "signal_error", source: event.source, reason: event.reason },
          ...rearm(state),
          { type: "return_to_idle" },
        ],
      };
    default:
      return hold(state);
  }
}

function fromPromptContinue(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  switch (event.type) {
    case "user_continues":
      // After the maximum number of utterances the exchange is closed rather than extended; the
      // continue is refused by falling back to idle, the same as an explicit dismiss.
      if (state.utteranceCount >= MAX_UTTERANCES_PER_EXCHANGE) {
        return {
          state: idle(at, state.mode),
          effects: [...rearm(state), { type: "return_to_idle" }],
        };
      }
      return {
        state: phaseState(state, "listening", at, {
          utteranceCount: state.utteranceCount + 1,
        }),
        effects: [{ type: "start_listening" }],
      };
    case "user_dismisses":
      return {
        state: idle(at, state.mode),
        effects: [...rearm(state), { type: "return_to_idle" }],
      };
    case "cancel":
      return {
        state: idle(at, state.mode),
        effects: [{ type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at, state.mode),
        effects: [
          { type: "signal_error", source: event.source, reason: event.reason },
          ...rearm(state),
          { type: "return_to_idle" },
        ],
      };
    default:
      return hold(state);
  }
}

/** Whether the machine is in a state where the mic is hot. */
export function isMicActive(state: SpeechState): boolean {
  return state.phase === "listening" || state.phase === "transcribing";
}

/** Whether the machine can accept barge-in. */
export function canBargeIn(state: SpeechState): boolean {
  return state.phase === "speaking" && state.echoCancellationActive;
}

/** Whether a conversation is under way: conversation mode, and not resting. */
export function isConversationActive(state: SpeechState): boolean {
  return state.mode === "conversation" && state.phase !== "idle";
}
