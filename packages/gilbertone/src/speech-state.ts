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
   machine drop one — the escalation message is spoken verbatim. */

/** Speech conversation states. `refusal` is transient: a transition never rests there. */
export type SpeechPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "prompt_continue"
  | "refusal";

/** Events that drive transitions. Every one is raised by the host, never invented here. */
export type SpeechEvent =
  | { type: "wake_word_detected" }
  | { type: "vad_endpoint"; silenceMs: number }
  | { type: "utterance_cap_reached"; durationMs: number }
  | { type: "transcript_ready"; text: string }
  | { type: "transcript_failed"; reason: string }
  | { type: "response_ready"; text: string }
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
}

export interface TransitionResult {
  state: SpeechState;
  effects: SpeechEffect[];
}

/** Per-utterance cap from the founder amendment (45 seconds). */
export const PER_UTTERANCE_CAP_MS = 45_000;

/** VAD silence threshold for endpointing (800ms feels natural). */
export const VAD_SILENCE_THRESHOLD_MS = 800;

/** Maximum utterances before requiring explicit continue. */
export const MAX_UTTERANCES_PER_EXCHANGE = 5;

/** Create the initial idle state. `now` is host-provided so nothing here reads the clock. */
export function initialSpeechState(now = 0): SpeechState {
  return {
    phase: "idle",
    transcriptBuffer: "",
    speakingText: null,
    utteranceCount: 0,
    lastTransitionAt: now,
    echoCancellationActive: false,
  };
}

/** A fresh idle state stamped at `at` — every reset path lands here. */
function idle(at: number): SpeechState {
  return {
    phase: "idle",
    transcriptBuffer: "",
    speakingText: null,
    utteranceCount: 0,
    lastTransitionAt: at,
    echoCancellationActive: false,
  };
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
      state: phaseState(state, "listening", at, {
        transcriptBuffer: "",
        speakingText: null,
        utteranceCount: 1,
      }),
      effects: [{ type: "stop_wake_word_detection" }, { type: "start_listening" }],
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
    case "cancel":
      return {
        state: idle(at),
        effects: [{ type: "stop_listening" }, { type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at),
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
        state: idle(at),
        effects: [{ type: "cancel_transcription" }, { type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at),
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
      return {
        state: phaseState(state, "speaking", at, { speakingText: event.text }),
        effects: [{ type: "start_speaking", text: event.text }],
      };
    case "escalation_fire":
      // Passes through the transient `refusal` phase and comes straight out speaking the approved
      // message, verbatim. Affect never softens it and this machine never drops it.
      return {
        state: phaseState(state, "speaking", at, { speakingText: event.message }),
        effects: [{ type: "start_speaking", text: event.message }],
      };
    case "cancel":
      return {
        state: idle(at),
        effects: [
          { type: "signal_error", source: "conversation", reason: "cancelled" },
          { type: "return_to_idle" },
        ],
      };
    case "error":
      return {
        state: idle(at),
        effects: [
          { type: "signal_error", source: event.source, reason: event.reason },
          { type: "return_to_idle" },
        ],
      };
    default:
      return hold(state);
  }
}

function fromSpeaking(state: SpeechState, event: SpeechEvent, at: number): TransitionResult {
  switch (event.type) {
    case "tts_finished":
      return {
        state: idle(at),
        effects: [{ type: "start_wake_word_detection" }, { type: "return_to_idle" }],
      };
    case "barge_in":
      // Without echo cancellation the machine would hear its own voice as a barge-in, so ignore it.
      if (!state.echoCancellationActive) return hold(state);
      // Barge-in continues the exchange: the transcript so far is kept, only the speech is cut.
      return {
        state: phaseState(state, "listening", at, { speakingText: null }),
        effects: [{ type: "cancel_speech" }, { type: "start_listening" }],
      };
    case "tts_failed":
      return {
        state: idle(at),
        effects: [
          { type: "signal_error", source: "tts", reason: event.reason },
          { type: "start_wake_word_detection" },
          { type: "return_to_idle" },
        ],
      };
    case "cancel":
      return {
        state: idle(at),
        effects: [
          { type: "cancel_speech" },
          { type: "start_wake_word_detection" },
          { type: "return_to_idle" },
        ],
      };
    case "error":
      return {
        state: idle(at),
        effects: [
          { type: "cancel_speech" },
          { type: "signal_error", source: event.source, reason: event.reason },
          { type: "start_wake_word_detection" },
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
          state: idle(at),
          effects: [{ type: "start_wake_word_detection" }, { type: "return_to_idle" }],
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
        state: idle(at),
        effects: [{ type: "start_wake_word_detection" }, { type: "return_to_idle" }],
      };
    case "cancel":
      return {
        state: idle(at),
        effects: [{ type: "return_to_idle" }],
      };
    case "error":
      return {
        state: idle(at),
        effects: [
          { type: "signal_error", source: event.source, reason: event.reason },
          { type: "start_wake_word_detection" },
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
