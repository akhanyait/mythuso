import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { OPEN_PARAM } from '../lib/roles';
import type { PanelProps } from '../features/Assistant';
import type { Visit } from '../lib/scheduling';

/* The floating way into GilbertOne, bottom right, on every patient page.

   This file is in the patient entry, so it is a button, a CSS orb and a lazy import, and nothing
   more. The panel, the sphere's canvas, the conversation, the contract behind it and their
   stylesheet are a separate chunk, fetched the first time somebody reaches for the orb — on hover
   or focus as a prefetch, or on the press itself. A patient on metered data who never touches it
   never downloads it. Where it sits is the shell's business (the `assistant` slot in
   shells/PatientShell.tsx).

   The name is typed here rather than imported, and that is the one exception to reading
   packages/catalog/assistant.json: importing the contract into the entry would put every sentence
   GilbertOne can say into the first load of every patient. scripts/check-boundaries.mjs holds this
   label to the contract's callToAction instead.

   What the Siri comparison is and is not, on the web. It is presence and placement: a small lit
   thing always in reach. It is not listening. There is no hold-to-talk gesture and no long-press,
   and the orb never reacts to sound — the web has no microphone in this release. A press opens a
   panel with a text box, and that is all a press does. */

const load = () => import('../features/Assistant');
let pending: ReturnType<typeof load> | null = null;
const prefetch = () => (pending ??= load());

export function AssistantLauncher({ openModal, visit }: { openModal: (modal: string) => void; visit: Visit | null }) {
 /* `/app/?open=assistant` opens the panel over the home. Read once, like every `open=` link. */
 const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get(OPEN_PARAM) === 'assistant');
 const [opened, setOpened] = useState(open);
 const [attempt, setAttempt] = useState(0);
 const button = useRef<HTMLButtonElement>(null);
 const wasOpen = useRef(open);
 /* A failed download is said, with a way to ask again, rather than thrown through the app. */
 const Panel = useMemo(() => lazy<ComponentType<PanelProps>>(() => prefetch().catch(() => {
  pending = null;
  return { default: ({ open: showing }: PanelProps) => showing
   ? <p className="al-note" role="alert">GilbertOne could not be downloaded. <button type="button" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
   : null };
 })), [attempt]);

 useEffect(() => {
  if (wasOpen.current && !open) button.current?.focus();
  wasOpen.current = open;
 }, [open]);

 return <div className="al-dock">
  <button ref={button} type="button" className="as-launcher" aria-label="Ask GilbertOne" aria-haspopup="dialog"
   aria-expanded={open} aria-controls={opened ? 'assistant-panel' : undefined}
   onPointerEnter={() => void prefetch()} onFocus={() => void prefetch()}
   onClick={() => { setOpened(true); setOpen(!open); }}>
   <span className="al-glow"/><span className="al-orb"/><span className="al-ring"/><span className="al-spark"><i/></span>
  </button>
  {opened && <Suspense fallback={open ? <p className="al-note" role="status">Opening GilbertOne.</p> : null}>
   <Panel open={open} dismiss={() => setOpen(false)} openModal={modal => { setOpen(false); openModal(modal); }} visit={visit}/>
  </Suspense>}
 </div>;
}
