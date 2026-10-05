import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Ellipsis, X } from "lucide-react";

/* GilbertOne's quiet chrome: launcher card, disclaimer, chips, composer, and the
   chat chrome. The call screen lives with the live assistant's voice button. */

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
  willNotDo,
}: {
  onContinue: () => void;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
  willNotDo?: ReactNode;
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
        {willNotDo ? <ul className="go-before-list">{willNotDo}</ul> : null}
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

