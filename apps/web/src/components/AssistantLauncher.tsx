import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { OPEN_PARAM } from '../lib/roles';
import type { PanelProps } from '../features/Assistant';

/* The floating way into the assistant, bottom right, on every patient page.

   This file is in the patient entry, so it is a button, a CSS orb and a lazy import, and nothing
   more. The panel, the sphere's canvas, the conversation and their stylesheet are a separate chunk,
   fetched the first time somebody reaches for the orb. That happens on hover or focus, as a
   prefetch, or on the press itself. A patient on metered data who never touches it never downloads
   it. Where it sits is the shell's business (see the `assistant` slot in shells/PatientShell.tsx),
   which is why there is no measuring here.

   What the Siri comparison is and is not. It is presence and placement: a small lit thing that is
   always in reach. It is not listening. There is no hold-to-talk gesture and no long-press, and the
   orb never reacts to sound, because `voice` in packages/catalog/capabilities.json is not connected
   and its neverSoften rule forbids any microphone affordance, decorative ones included. A press
   opens a panel of questions, and that is all a press does. */

const load = () => import('../features/Assistant');
let pending: ReturnType<typeof load> | null = null;
const prefetch = () => (pending ??= load());

export function AssistantLauncher({ openModal }: { openModal: (modal: string) => void }) {
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
   ? <p className="al-note" role="alert">The assistant could not be downloaded. <button type="button" onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
   : null };
 })), [attempt]);

 useEffect(() => {
  if (wasOpen.current && !open) button.current?.focus();
  wasOpen.current = open;
 }, [open]);

 return <div className="al-dock">
  <button ref={button} type="button" className="as-launcher" aria-label="Assistant" aria-haspopup="dialog"
   aria-expanded={open} aria-controls={opened ? 'assistant-panel' : undefined}
   onPointerEnter={() => void prefetch()} onFocus={() => void prefetch()}
   onClick={() => { setOpened(true); setOpen(!open); }}>
   <span className="al-glow"/><span className="al-orb"/><span className="al-ring"/><span className="al-spark"><i/></span>
  </button>
  {opened && <Suspense fallback={open ? <p className="al-note" role="status">Opening the assistant.</p> : null}>
   <Panel open={open} dismiss={() => setOpen(false)} openModal={modal => { setOpen(false); openModal(modal); }}/>
  </Suspense>}
 </div>;
}
