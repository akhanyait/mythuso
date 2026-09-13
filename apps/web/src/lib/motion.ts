import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
/* The web's motion. Three rules hold everywhere in here:

   1. Nothing animates that a reader has asked not to animate. Every hook checks the reduced-motion
      query first and then does nothing, and the stylesheet neutralises the same rules again.
   2. Nothing is hidden by CSS that JavaScript is responsible for showing. The reveal styles are
      scoped to a data-motion flag this file sets, so a page whose script never runs is a page that
      simply arrives already visible rather than a blank one.
   3. Only transform and opacity are animated, so the compositor does the work and scrolling on a
      cheap Android phone stays smooth. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keep ambient artwork still outside the viewport; content and controls never depend on it. */
export function useAmbientVisibility() {
 useEffect(() => {
  const regions = document.querySelectorAll<HTMLElement>('[data-ambient]');
  if (typeof IntersectionObserver !== 'function') {
   for (const region of regions) region.dataset.ambient = 'visible';
   return;
  }
  const observer = new IntersectionObserver(entries => {
   for (const entry of entries) (entry.target as HTMLElement).dataset.ambient = entry.isIntersecting ? 'visible' : 'paused';
  }, { threshold: 0 });
  for (const region of regions) observer.observe(region);
  return () => observer.disconnect();
 }, []);
}

/* Sections arrive as you reach them, in the order they are written. Each element is released once
   and then forgotten, so scrolling back up does not replay the page at you. */
export function useReveal() {
 useLayoutEffect(() => {
  if (reducedMotion() || typeof IntersectionObserver !== 'function') return;
  const root = document.documentElement;
  root.dataset.motion = 'on';
  const waiting = new Set(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const seen = new IntersectionObserver(entries => {
   for (const entry of entries) if (entry.isIntersecting) release(entry.target as HTMLElement);
  }, { rootMargin: '0px 0px -8%', threshold: 0.06 });
  const release = (el: HTMLElement) => { el.dataset.reveal = 'shown'; waiting.delete(el); seen.unobserve(el); };
  /* Anchor jumps and late image layout can skip an intersection. Release anything whose start
     the reader has passed, and recheck after layout changes as well as scrolling. */
  let frame = 0;
  const sweep = () => { frame = 0; for (const el of waiting) if (el.getBoundingClientRect().top < 0) release(el); };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(sweep); };
  for (const el of waiting) seen.observe(el);
  const layout = typeof ResizeObserver === 'function' ? new ResizeObserver(onScroll) : null;
  layout?.observe(document.body);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  sweep();
  return () => { seen.disconnect(); layout?.disconnect(); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(frame); delete root.dataset.motion; };
 }, []);
}

/* How far down the page we are, as 0–1, plus the raw offset. Read once per frame rather than once
   per scroll event, which on a trackpad is the difference between one calculation and forty. */
export function useScrollProgress() {
 const [state, setState] = useState({ y: 0, progress: 0 });
 useEffect(() => {
  let frame = 0;
  const measure = () => {
   frame = 0;
   const travel = document.documentElement.scrollHeight - innerHeight;
   setState({ y: scrollY, progress: travel > 0 ? Math.min(1, scrollY / travel) : 0 });
  };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
  measure();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  return () => { cancelAnimationFrame(frame); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
 }, []);
 return state;
}

/* ---- Reduced motion, watched rather than asked once -------------------------------------------
   The setting is a switch a reader can reach at any moment — on iOS it is two taps in Control
   Centre — and a page that only asks at load leaves somebody who has just asked for stillness
   watching things move until they think to reload. */
export function useReducedMotion() {
 const [reduced, setReduced] = useState(reducedMotion);
 useEffect(() => {
  if (typeof matchMedia !== 'function') return;
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => setReduced(query.matches);
  onChange();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
 }, []);
 return reduced;
}

/* ---- Decorative motion, and the one flag that governs all of it --------------------------------
 *
 * Everything that moves on its own — an ambient drift, a rotating decoration, the pointer light —
 * is gated in CSS behind `[data-decor='on']` on the document element. Three things follow from
 * putting the flag there rather than on each component that moves:
 *
 *   A page whose script never runs gets no endless motion at all, rather than motion with no way to
 *   stop it. That is the discipline `data-motion` already uses for the landing page's entrances.
 *
 *   One pause control anywhere on a page stops every such animation on it, which is what WCAG 2.2.2
 *   asks for — a mechanism to pause, not a mechanism for each thing that moves.
 *
 *   A reader who has asked their system for less motion never has the flag set at all, so the
 *   stylesheet's removal is the second line of defence rather than the only one.
 *
 * The state is a module-level store rather than component state because the root that declares the
 * page has decorative motion and the control that stops it are two different components, and two
 * copies of "is it playing" is how a button comes to say Pause beside something that has stopped. */
const decor = {
 playing: true,
 /* A count, not a boolean. The root and the pause control both hold the flag up, and whichever
    unmounts first must not put it down on the other's behalf. */
 holders: 0,
 listeners: new Set<() => void>(),
 apply() {
  const root = document.documentElement;
  if (this.holders > 0 && this.playing && !reducedMotion() && !document.hidden) root.dataset.decor = 'on';
  else delete root.dataset.decor;
 },
 set(playing: boolean) { this.playing = playing; this.apply(); for (const notify of [...this.listeners]) notify(); }
};

/** Decorative motion on this page: whether it is running, and the way to stop it. Call it at the
    entry root so the page declares it has some, and again inside the pause control. */
export function useDecor() {
 const reduced = useReducedMotion();
 const [visible, setVisible] = useState(() => !document.hidden);
 const playing = useSyncExternalStore(
  useCallback((notify: () => void) => { decor.listeners.add(notify); return () => { decor.listeners.delete(notify); }; }, []),
  () => decor.playing,
  () => false
 );
 useEffect(() => { decor.holders += 1; decor.apply(); return () => { decor.holders -= 1; decor.apply(); }; }, []);
 useEffect(() => {
  const update = () => { setVisible(!document.hidden); decor.apply(); };
  document.addEventListener('visibilitychange', update);
  return () => document.removeEventListener('visibilitychange', update);
 }, []);
 useEffect(() => { decor.apply(); }, [reduced]);
 return { playing: playing && !reduced && visible, reduced, toggle: useCallback(() => decor.set(!decor.playing), []) };
}

/* ---- The pointer-following light ---------------------------------------------------------------
   Viewport coordinates written onto the document element once per frame; apps/web/src/surface/
   motion.css turns them into a transform on a pane that has no text on it. Two refusals are most of
   the design:

   Only a pointer that genuinely hovers. A touch screen has no cursor to follow, and the pointermove
   a browser synthesises under a finger would leave the light parked wherever that finger last was —
   a stain rather than a light. The hero carousel made the same mistake with hover-to-pause, and the
   fix is the same one: ask whether the input can hover before building anything on the idea it can.

   Nothing until the pointer has actually been somewhere. `data-pointer` is what fades the light in,
   so the first painted frame of a screen is the screen rather than a bright patch in the middle of
   it. */
export function usePointerLight() {
 const reduced = useReducedMotion();
 useEffect(() => {
  if (reduced || typeof matchMedia !== 'function' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const root = document.documentElement;
  let frame = 0, x = 0, y = 0;
  const paint = () => {
   frame = 0;
   root.style.setProperty('--m-x', `${x}px`);
   root.style.setProperty('--m-y', `${y}px`);
   root.dataset.pointer = 'seen';
  };
  const onMove = (event: PointerEvent) => { x = event.clientX; y = event.clientY; if (!frame) frame = requestAnimationFrame(paint); };
  addEventListener('pointermove', onMove, { passive: true });
  return () => {
   cancelAnimationFrame(frame);
   removeEventListener('pointermove', onMove);
   root.style.removeProperty('--m-x');
   root.style.removeProperty('--m-y');
   delete root.dataset.pointer;
  };
 }, [reduced]);
}

/* ---- A chapter entrance -------------------------------------------------------------------------
   A panel whose subject changes — a focus tab, a chosen chapter — is showing genuinely new content
   rather than the same content redrawn, and the entrance is how a reader is told which of the two
   just happened. This returns a key: put it on the element carrying `rise`, and React remounts that
   element so the entrance plays again.

   Under reduced motion the key never changes, so the content is replaced with no animation to
   remove. That is the difference between switching an animation off and never starting it, and here
   it is not pedantry — a remount that plays no animation still throws away focus inside the panel. */
export function useChapter(subject: string | number) {
 return useReducedMotion() ? 'chapter' : `chapter-${subject}`;
}
