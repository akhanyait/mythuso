import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Ellipsis, Keyboard, Mic, PhoneOff, X } from "lucide-react";
import { GilbertStill } from "./GilbertAvatar";

/* GilbertOne's quiet chrome: launcher card, disclaimer, chips, composer, and the
   in-card voice screen. Speech itself stays in the panel's existing browser path. */

export const TENDER_CHIPS = [
  { id: "explain-tender", label: "Explain this tender" },
  { id: "what-needed", label: "What do I need" },
  { id: "get-started", label: "Help me get started" },
] as const;

/* The empty-state chips from the chat card. A page is used only when the
   panel already has that route; otherwise the label is sent as the message. */
export const DESIGN_CHIPS = [
  { id: "book-nurse", label: "Book a nurse", page: "Book a nurse" },
  { id: "my-visits", label: "My visits", page: "My visits" },
  { id: "how", label: "How MyThuso works" },
] as const;

export function pageCue() {
  if (typeof window === "undefined") {
    return { tender: false, prompt: "What can I help you with?", title: "" };
  }
  const here = `${window.location.pathname} ${window.location.search} ${window.location.hash} ${document.title}`;
  const tender = /\btender\b/i.test(here);
  return {
    tender,
    prompt: tender
      ? "What would you like to know about this tender?"
      : "What can I help you with?",
    title: document.title.replace(/\s+/g, " ").trim(),
  };
}

export function QuietChips({
  chips,
  onPick,
}: {
  chips: readonly { id: string; label: string }[];
  onPick: (label: string) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="go-chips" role="group" aria-label="Suggestions">
      {chips.slice(0, 3).map((chip) => (
        <button
          type="button"
          key={chip.id}
          className="go-chip"
          onClick={() => onPick(chip.label)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function Opening({ prompt, title }: { prompt: string; title: string }) {
  return (
    <div className="go-opening">
      <p className="go-prompt">{prompt}</p>
      {title ? (
        <p className="go-context">
          This follows “{title}”. Say if that is not the page you mean.
        </p>
      ) : null}
    </div>
  );
}

export function QuietMenu({
  onNew,
  onPrivacy,
}: {
  onNew: () => void;
  onPrivacy: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (button.current?.parentElement?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="go-menu">
      <button
        ref={button}
        type="button"
        className="go-icon"
        aria-label="GilbertOne menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} className="go-menu-list" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            New conversation
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPrivacy();
            }}
          >
            Privacy details
          </button>
        </div>
      )}
    </div>
  );
}

export function PrivacyNote({
  paragraphs,
  onClose,
}: {
  paragraphs: readonly string[];
  onClose: () => void;
}) {
  const title = useId();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <div className="go-privacy" role="dialog" aria-labelledby={title}>
      <div className="go-privacy-bar">
        <h3 id={title}>Privacy</h3>
        <button
          ref={close}
          type="button"
          className="go-icon"
          aria-label="Close privacy"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

export function ShowDetails({ children }: { children: ReactNode }) {
  return (
    <details className="go-details">
      <summary>Show details</summary>
      {children}
    </details>
  );
}

export function leadAndRest(text: string) {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 2) return { lead: text, rest: "" };
  return { lead: parts.slice(0, 2).join(" "), rest: parts.slice(2).join(" ") };
}

export function GilbertMark({ size }: { size: number }) {
  return (
    <span className="go-mark" aria-hidden="true">
      <img src="/brand/gilbert-icon.webp" alt="" width={size} height={size} />
    </span>
  );
}

const BEFORE_COPY =
  "GilbertOne is a conversation for general health information and for deciding when to speak to a MyThuso nurse. It is not for diagnosis, treatment, or explaining what a result, vital, or triage score means. A nurse or doctor makes those decisions.";

export function BeforeWeStart({
  onContinue,
  onClose,
  closeRef,
}: {
  onContinue: () => void;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
}) {
  const [understood, setUnderstood] = useState(false);
  return (
    <div className="go-before">
      <header className="go-before-head">
        <GilbertMark size={40} />
        <h2 id="go-before-title">Before we start</h2>
        <button
          ref={closeRef}
          type="button"
          className="go-before-close"
          aria-label="Close GilbertOne"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="go-before-body">
        <p>{BEFORE_COPY}</p>
        <label className="go-check">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>I understand</span>
        </label>
        <button
          type="button"
          className="go-continue"
          disabled={!understood}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export type CallPhase =
  | "disclose"
  | "unavailable"
  | "listening"
  | "thinking"
  | "speaking"
  | "quiet";

export function CallScreen({
  phase,
  disclosure,
  muted,
  note,
  onStart,
  onMute,
  onEnd,
  onText,
  emergency,
}: {
  phase: CallPhase;
  disclosure: string;
  muted: boolean;
  note?: string | null;
  onStart: () => void;
  onMute: () => void;
  onEnd: () => void;
  onText: () => void;
  emergency?: ReactNode;
}) {
  const state =
    phase === "listening"
      ? "Listening"
      : phase === "thinking"
        ? "Thinking"
        : phase === "speaking"
          ? "Speaking"
          : null;
  const live = phase === "listening" || phase === "thinking" || phase === "speaking" || phase === "quiet";
  return (
    <div className="go-call" role="region" aria-label="Talk to GilbertOne.">
      <span className="go-call-mark" aria-hidden="true">
        <GilbertStill size={112} />
      </span>
      {phase === "disclose" && (
        <>
          <p className="go-call-copy">{disclosure}</p>
          <button type="button" className="go-continue" onClick={onStart}>
            Start call
          </button>
        </>
      )}
      {phase === "unavailable" && (
        <p className="go-call-copy">
          Voice isn&apos;t available in this browser. You can keep typing in the same conversation.
        </p>
      )}
      {state && (
        <p className="go-call-state" role="status">
          {state}
        </p>
      )}
      {phase === "quiet" && note ? <p className="go-call-copy">{note}</p> : null}
      {live && (
        <div className="go-call-actions">
          <button type="button" onClick={onMute} aria-pressed={muted}>
            <span className="go-disc">
              <Mic size={20} aria-hidden="true" />
            </span>
            Mute
          </button>
          <button type="button" onClick={onEnd}>
            <span className="go-disc go-disc-end">
              <PhoneOff size={20} aria-hidden="true" />
            </span>
            End call
          </button>
          <button type="button" onClick={onText}>
            <span className="go-disc">
              <Keyboard size={20} aria-hidden="true" />
            </span>
            Use text
          </button>
        </div>
      )}
      {phase === "unavailable" && (
        <div className="go-call-actions">
          <button type="button" onClick={onEnd}>
            <span className="go-disc go-disc-end">
              <PhoneOff size={20} aria-hidden="true" />
            </span>
            End call
          </button>
          <button type="button" onClick={onText}>
            <span className="go-disc">
              <Keyboard size={20} aria-hidden="true" />
            </span>
            Use text
          </button>
        </div>
      )}
      {phase === "listening" && (
        <p className="go-call-note">You can interrupt at any time.</p>
      )}
      {emergency}
    </div>
  );
}

/* A browser call: listen, send the finished words, speak the reply, listen again.
   Listening, Thinking and Speaking are only shown while that step is really happening. */
export function useGilbertCall({
  initial = "closed",
  supported,
  canSpeak,
  state,
  transcript,
  pending,
  reply,
  replyEpoch,
  start,
  cancelListen,
  cancelSpeech,
  speak,
  voiceClass = "routine",
  onWords,
}: {
  initial?: "closed" | "disclose";
  supported: boolean;
  canSpeak: boolean;
  state: string;
  transcript: string;
  pending: boolean;
  reply: string;
  replyEpoch: number;
  start: () => void;
  cancelListen: () => void;
  cancelSpeech: () => void;
  /* The panel's voice adapter. It already selects the Control Tower voice, otherwise
     the contract order en-ZA, en-GB, en-AU, en. This file does not choose a voice. */
  speak: (
    text: string,
    options?: {
      voiceClass?: string;
      onStart?: () => void;
      onEnd?: () => void;
    },
    language?: string,
  ) => void;
  voiceClass?: string;
  onWords: { current: (text: string) => void };
}) {
  const [mode, setMode] = useState<"closed" | "disclose" | "on">(initial);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [synthSpeaking, setSynthSpeaking] = useState(false);
  const sent = useRef("");
  const drop = useRef(false);
  const onWordsRef = onWords;
  const wait = useRef(false);
  const epochAtSend = useRef<number | null>(null);
  const generation = useRef(0);
  const spokeGen = useRef(0);
  const relisten = useRef(false);
  const talking = useRef(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const hush = useCallback(() => {
    talking.current = false;
    setSynthSpeaking(false);
    cancelSpeech();
  }, [cancelSpeech]);

  const show = useCallback(() => {
    drop.current = true;
    cancelListen();
    hush();
    setMuted(false);
    setBlocked(false);
    sent.current = "";
    wait.current = false;
    epochAtSend.current = null;
    generation.current = 0;
    spokeGen.current = 0;
    relisten.current = false;
    setMode("disclose");
  }, [cancelListen, hush]);

  const begin = useCallback(() => {
    if (!supported || !canSpeak) {
      setBlocked(true);
      setMode("on");
      return;
    }
    drop.current = false;
    setBlocked(false);
    setMode("on");
    start();
  }, [supported, canSpeak, start]);

  const end = useCallback(() => {
    drop.current = true;
    cancelListen();
    hush();
    setMode("closed");
    setMuted(false);
    setBlocked(false);
    sent.current = "";
    wait.current = false;
  }, [cancelListen, hush]);

  const mute = useCallback(() => {
    if (!muted) {
      drop.current = true;
      setMuted(true);
      cancelListen();
      hush();
      return;
    }
    setMuted(false);
    drop.current = false;
    if (wait.current || !supported || blocked) return;
    relisten.current = true;
    start();
  }, [muted, supported, blocked, start, cancelListen, hush]);

  useEffect(() => {
    if (mode !== "on" || blocked) return;
    const capturing = state === "starting" || state === "open";
    if (capturing) return;
    const text = transcript.trim();
    if (drop.current || !text || text === sent.current) return;
    sent.current = text;
    generation.current += 1;
    epochAtSend.current = replyEpoch;
    wait.current = true;
    relisten.current = false;
    onWordsRef.current(text);
  }, [mode, blocked, state, transcript, onWordsRef, replyEpoch]);

  useEffect(() => {
    if (mode !== "on" || blocked || muted) return;
    if (state === "open" || state === "starting") return;
    if (pending || synthSpeaking) return;
    if (!sent.current) return;
    if (wait.current) {
      if (replyEpoch === epochAtSend.current || pending || !reply) return;
      wait.current = false;
      const spokenFor = generation.current;
      spokeGen.current = spokenFor;
      relisten.current = false;
      talking.current = true;
      speak(
        reply,
        {
          voiceClass,
          onStart: () => {
            if (spokenFor !== generation.current || mutedRef.current) return;
            setSynthSpeaking(true);
          },
          onEnd: () => {
            if (spokenFor !== generation.current) return;
            talking.current = false;
            setSynthSpeaking(false);
          },
        },
        "en-ZA",
      );
      return;
    }
    if (talking.current || synthSpeaking) return;
    if (spokeGen.current === generation.current && !relisten.current) {
      relisten.current = true;
      start();
    }
  }, [mode, blocked, muted, state, pending, synthSpeaking, reply, replyEpoch, start, speak, voiceClass]);

  const phase: CallPhase =
    mode === "disclose"
      ? "disclose"
      : mode !== "on"
        ? "quiet"
        : blocked
          ? "unavailable"
          : state === "open" && !muted
            ? "listening"
            : synthSpeaking
              ? "speaking"
              : pending
                ? "thinking"
                : "quiet";

  return {
    mode,
    phase: mode === "closed" ? ("quiet" as CallPhase) : phase,
    muted,
    show,
    begin,
    mute,
    end,
    blocked,
  };
}
