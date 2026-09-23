import test from "node:test";
import assert from "node:assert/strict";
import {
  initialSpeechState,
  transition,
  isMicActive,
  canBargeIn,
  PER_UTTERANCE_CAP_MS,
  VAD_SILENCE_THRESHOLD_MS,
  MAX_UTTERANCES_PER_EXCHANGE,
  type SpeechState,
  type SpeechEffect,
} from "./speech-state.ts";

/* A clock the tests advance by hand — the machine never reads a real one. */
let clock = 0;
const tick = (ms = 1): number => (clock += ms);

const effectTypes = (effects: readonly SpeechEffect[]): string[] =>
  effects.map((effect) => effect.type);

/* Drive the machine from idle up to a speaking exchange with echo cancellation engaged, the state
   a barge-in would interrupt. Returns the state after `response_ready`. */
function speakingState(text = "here is your answer"): SpeechState {
  let s = initialSpeechState(tick());
  s = transition(s, { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  s = transition(s, { type: "transcript_ready", text: "what are my results" }, tick()).state;
  s = transition(s, { type: "response_ready", text }, tick()).state;
  return s;
}

test("initial state is idle with empty buffers", () => {
  const state = initialSpeechState(1000);
  assert.equal(state.phase, "idle");
  assert.equal(state.transcriptBuffer, "");
  assert.equal(state.speakingText, null);
  assert.equal(state.utteranceCount, 0);
  assert.equal(state.lastTransitionAt, 1000);
  assert.equal(state.echoCancellationActive, false);
});

test("initial state defaults its timestamp to zero when the host gives none", () => {
  assert.equal(initialSpeechState().lastTransitionAt, 0);
});

test("happy path: idle -> wake -> listen -> endpoint -> transcribe -> think -> speak -> idle", () => {
  let s = initialSpeechState(tick());

  // wake word opens the exchange and drops wake detection while the mic is hot
  let r = transition(s, { type: "wake_word_detected" }, tick());
  assert.equal(r.state.phase, "listening");
  assert.equal(r.state.utteranceCount, 1);
  assert.deepEqual(effectTypes(r.effects), ["stop_wake_word_detection", "start_listening"]);
  s = r.state;

  // a real endpoint (silence at the threshold) moves to transcription
  r = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick());
  assert.equal(r.state.phase, "transcribing");
  assert.deepEqual(effectTypes(r.effects), ["stop_listening", "start_transcription"]);
  s = r.state;

  // transcript accumulates and thinking starts on the whole buffer
  r = transition(s, { type: "transcript_ready", text: "book a nurse visit" }, tick());
  assert.equal(r.state.phase, "thinking");
  assert.equal(r.state.transcriptBuffer, "book a nurse visit");
  assert.deepEqual(effectTypes(r.effects), ["cancel_transcription", "start_thinking"]);
  assert.deepEqual(r.effects[1], { type: "start_thinking", text: "book a nurse visit" });
  s = r.state;

  // the answer is spoken, echo cancellation engaged for barge-in
  r = transition(s, { type: "response_ready", text: "I can help with that" }, tick());
  assert.equal(r.state.phase, "speaking");
  assert.equal(r.state.speakingText, "I can help with that");
  assert.equal(r.state.echoCancellationActive, true);
  assert.deepEqual(effectTypes(r.effects), ["start_speaking"]);
  s = r.state;

  // finishing speech resets everything and re-arms the wake word
  r = transition(s, { type: "tts_finished" }, tick());
  assert.equal(r.state.phase, "idle");
  assert.equal(r.state.transcriptBuffer, "");
  assert.equal(r.state.speakingText, null);
  assert.equal(r.state.utteranceCount, 0);
  assert.equal(r.state.echoCancellationActive, false);
  assert.deepEqual(effectTypes(r.effects), ["start_wake_word_detection", "return_to_idle"]);
});

test("a sub-threshold VAD endpoint is ignored and stays listening", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  const r = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS - 1 }, tick());
  assert.equal(r.state.phase, "listening");
  assert.deepEqual(r.effects, []);
  assert.equal(r.state, s);
});

test("barge-in with echo cancellation returns to listening and keeps the transcript", () => {
  const speaking = speakingState();
  assert.equal(speaking.echoCancellationActive, true);

  const r = transition(speaking, { type: "barge_in" }, tick());
  assert.equal(r.state.phase, "listening");
  assert.equal(r.state.speakingText, null);
  // the exchange continues, so what was already said is not thrown away
  assert.equal(r.state.transcriptBuffer, "what are my results");
  assert.deepEqual(effectTypes(r.effects), ["cancel_speech", "start_listening"]);
});

test("barge-in is ignored when echo cancellation is not active", () => {
  const speaking = { ...speakingState(), echoCancellationActive: false };
  const r = transition(speaking, { type: "barge_in" }, tick());
  assert.equal(r.state.phase, "speaking");
  assert.deepEqual(r.effects, []);
  assert.equal(r.state, speaking);
});

test("utterance cap moves listening to prompt_continue", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  const r = transition(s, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick());
  assert.equal(r.state.phase, "prompt_continue");
  assert.deepEqual(effectTypes(r.effects), ["stop_listening", "prompt_continue"]);
});

test("continuing after the prompt reopens the mic and counts the utterance", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state;
  assert.equal(s.utteranceCount, 1);

  const r = transition(s, { type: "user_continues" }, tick());
  assert.equal(r.state.phase, "listening");
  assert.equal(r.state.utteranceCount, 2);
  assert.deepEqual(effectTypes(r.effects), ["start_listening"]);
});

test("dismissing after the prompt resets everything and re-arms the wake word", () => {
  // build a prompt_continue that carries a transcript from an earlier utterance of the exchange
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  s = transition(s, { type: "transcript_ready", text: "a long story" }, tick()).state;
  s = transition(s, { type: "response_ready", text: "go on" }, tick()).state;
  s = transition(s, { type: "barge_in" }, tick()).state; // back to listening, transcript kept
  s = transition(s, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state;
  assert.equal(s.phase, "prompt_continue");
  assert.equal(s.transcriptBuffer, "a long story");

  const r = transition(s, { type: "user_dismisses" }, tick());
  assert.equal(r.state.phase, "idle");
  assert.equal(r.state.transcriptBuffer, "");
  assert.equal(r.state.utteranceCount, 0);
  assert.deepEqual(effectTypes(r.effects), ["start_wake_word_detection", "return_to_idle"]);
});

test("an escalation during thinking is spoken verbatim and never dropped", () => {
  let s = initialSpeechState(tick());
  s = transition(s, { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  s = transition(s, { type: "transcript_ready", text: "I have chest pain" }, tick()).state;
  assert.equal(s.phase, "thinking");

  const r = transition(
    s,
    { type: "escalation_fire", ruleId: "cardiac-chest-pain", message: "Call 10177 now." },
    tick(),
  );
  // `refusal` is transient — the same call comes out speaking the approved message.
  assert.equal(r.state.phase, "speaking");
  assert.equal(r.state.speakingText, "Call 10177 now.");
  assert.deepEqual(r.effects, [{ type: "start_speaking", text: "Call 10177 now." }]);
});

test("a transcription failure retries from listening", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  assert.equal(s.phase, "transcribing");

  const r = transition(s, { type: "transcript_failed", reason: "no audio" }, tick());
  assert.equal(r.state.phase, "listening");
  assert.deepEqual(effectTypes(r.effects), ["cancel_transcription", "start_listening"]);
});

test("a second transcript accumulates onto the buffer in a multi-utterance exchange", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  s = transition(s, { type: "transcript_ready", text: "first part" }, tick()).state;
  assert.equal(s.transcriptBuffer, "first part");

  // barge back in and add a second utterance
  s = transition(s, { type: "response_ready", text: "mm" }, tick()).state;
  s = transition(s, { type: "barge_in" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  s = transition(s, { type: "transcript_ready", text: "second part" }, tick()).state;
  assert.equal(s.transcriptBuffer, "first part second part");
});

test("cancel from any active state lands on idle with return_to_idle", () => {
  const actives: SpeechState[] = [];

  const listening = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  actives.push(listening);
  actives.push(transition(listening, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state);
  actives.push(transition(listening, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state);
  const thinking = transition(
    transition(listening, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state,
    { type: "transcript_ready", text: "hi" },
    tick(),
  ).state;
  actives.push(thinking);
  actives.push(transition(thinking, { type: "response_ready", text: "hello" }, tick()).state);

  for (const active of actives) {
    const r = transition(active, { type: "cancel" }, tick());
    assert.equal(r.state.phase, "idle", `cancel from ${active.phase} should idle`);
    assert.equal(r.state.transcriptBuffer, "");
    assert.equal(r.state.utteranceCount, 0);
    assert.ok(
      effectTypes(r.effects).includes("return_to_idle"),
      `cancel from ${active.phase} should return_to_idle`,
    );
  }
});

test("cancelling while thinking reports a cancelled signal_error", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  s = transition(s, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  s = transition(s, { type: "transcript_ready", text: "hi" }, tick()).state;
  const r = transition(s, { type: "cancel" }, tick());
  assert.equal(r.state.phase, "idle");
  assert.ok(
    r.effects.some(
      (effect) => effect.type === "signal_error" && effect.reason === "cancelled",
    ),
  );
});

test("error from any active state lands on idle with signal_error", () => {
  const listening = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  const transcribing = transition(listening, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  const thinking = transition(transcribing, { type: "transcript_ready", text: "hi" }, tick()).state;
  const speaking = transition(thinking, { type: "response_ready", text: "hello" }, tick()).state;
  const prompt = transition(listening, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state;

  for (const active of [listening, transcribing, thinking, speaking, prompt]) {
    const r = transition(active, { type: "error", source: "device", reason: "mic lost" }, tick());
    assert.equal(r.state.phase, "idle", `error from ${active.phase} should idle`);
    assert.ok(
      r.effects.some(
        (effect) =>
          effect.type === "signal_error" && effect.source === "device" && effect.reason === "mic lost",
      ),
      `error from ${active.phase} should signal_error`,
    );
    assert.ok(effectTypes(r.effects).includes("return_to_idle"));
  }
});

test("tts failure idles, signals the error and re-arms the wake word", () => {
  const r = transition(speakingState(), { type: "tts_failed", reason: "voice unavailable" }, tick());
  assert.equal(r.state.phase, "idle");
  assert.deepEqual(effectTypes(r.effects), [
    "signal_error",
    "start_wake_word_detection",
    "return_to_idle",
  ]);
});

test("idle ignores every non-wake event with no effects", () => {
  const idleState = initialSpeechState(tick());
  const ignored = [
    { type: "vad_endpoint", silenceMs: 5000 },
    { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS },
    { type: "transcript_ready", text: "hello?" },
    { type: "transcript_failed", reason: "x" },
    { type: "response_ready", text: "hi" },
    { type: "escalation_fire", ruleId: "r", message: "m" },
    { type: "tts_finished" },
    { type: "tts_failed", reason: "x" },
    { type: "barge_in" },
    { type: "user_continues" },
    { type: "user_dismisses" },
    { type: "cancel" },
    { type: "error", source: "s", reason: "r" },
  ] as const;

  for (const event of ignored) {
    const r = transition(idleState, event, tick());
    assert.equal(r.state.phase, "idle", `${event.type} should stay idle`);
    assert.deepEqual(r.effects, [], `${event.type} should produce no effects`);
    assert.equal(r.state, idleState, `${event.type} should return the same state object`);
  }
});

test("after MAX_UTTERANCES_PER_EXCHANGE a continue is refused and the exchange closes", () => {
  let s = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  assert.equal(s.utteranceCount, 1);

  // run continue/cap cycles up to the maximum
  for (let n = 2; n <= MAX_UTTERANCES_PER_EXCHANGE; n += 1) {
    s = transition(s, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state;
    const r = transition(s, { type: "user_continues" }, tick());
    assert.equal(r.state.phase, "listening", `utterance ${n} should reopen the mic`);
    assert.equal(r.state.utteranceCount, n);
    s = r.state;
  }
  assert.equal(s.utteranceCount, MAX_UTTERANCES_PER_EXCHANGE);

  // one more continue, at the cap, is refused: forced back to idle rather than listening
  s = transition(s, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state;
  const refused = transition(s, { type: "user_continues" }, tick());
  assert.equal(refused.state.phase, "idle");
  assert.equal(refused.state.utteranceCount, 0);
  assert.deepEqual(effectTypes(refused.effects), ["start_wake_word_detection", "return_to_idle"]);
});

test("transitions stamp the host-provided time and never read a clock of their own", () => {
  const s = initialSpeechState(0);
  const r = transition(s, { type: "wake_word_detected" }, 4242);
  assert.equal(r.state.lastTransitionAt, 4242);
});

test("a transition with no time given keeps the previous stamp", () => {
  const s = initialSpeechState(777);
  const r = transition(s, { type: "wake_word_detected" });
  assert.equal(r.state.lastTransitionAt, 777);
});

test("isMicActive is true only for listening and transcribing", () => {
  const listening = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  const transcribing = transition(listening, { type: "vad_endpoint", silenceMs: VAD_SILENCE_THRESHOLD_MS }, tick()).state;
  const thinking = transition(transcribing, { type: "transcript_ready", text: "hi" }, tick()).state;
  const speaking = transition(thinking, { type: "response_ready", text: "hello" }, tick()).state;
  const prompt = transition(listening, { type: "utterance_cap_reached", durationMs: PER_UTTERANCE_CAP_MS }, tick()).state;

  assert.equal(isMicActive(listening), true);
  assert.equal(isMicActive(transcribing), true);
  assert.equal(isMicActive(thinking), false);
  assert.equal(isMicActive(speaking), false);
  assert.equal(isMicActive(prompt), false);
  assert.equal(isMicActive(initialSpeechState(tick())), false);
});

test("canBargeIn is true only for speaking with echo cancellation active", () => {
  const speaking = speakingState();
  assert.equal(canBargeIn(speaking), true);
  assert.equal(canBargeIn({ ...speaking, echoCancellationActive: false }), false);
  assert.equal(canBargeIn(initialSpeechState(tick())), false);

  const listening = transition(initialSpeechState(tick()), { type: "wake_word_detected" }, tick()).state;
  assert.equal(canBargeIn(listening), false);
  assert.equal(canBargeIn({ ...listening, echoCancellationActive: true }), false);
});
