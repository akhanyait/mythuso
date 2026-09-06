import { useEffect, useLayoutEffect, useRef, useState } from 'react';
/* Motion for the public page. Three rules hold everywhere in here:

   1. Nothing animates that a reader has asked not to animate. Every hook checks the reduced-motion
      query first and then does nothing, and the stylesheet neutralises the same rules again.
   2. Nothing is hidden by CSS that JavaScript is responsible for showing. The reveal styles are
      scoped to a data-motion flag this file sets, so a page whose script never runs is a page that
      simply arrives already visible rather than a blank one.
   3. Only transform and opacity are animated, so the compositor does the work and scrolling on a
      cheap Android phone stays smooth. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  /* Jumping clean past a section — an anchor link, the End key, a restored scroll position — never
     changes its intersection state, so an observer on its own would leave it invisible above you
     for the rest of the visit. Anything the page has scrolled entirely past is simply released. */
  let frame = 0;
  const sweep = () => { frame = 0; for (const el of waiting) if (el.getBoundingClientRect().bottom < 0) release(el); };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(sweep); };
  for (const el of waiting) seen.observe(el);
  addEventListener('scroll', onScroll, { passive: true });
  return () => { seen.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); delete root.dataset.motion; };
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

/* A number that counts up the first time you see it. The label around it is written out in full in
   the markup, so a reader on a screen reader or with motion turned off gets the finished figure
   rather than a number climbing under them. */
export function useCountUp(to: number, duration = 1100) {
 const ref = useRef<HTMLSpanElement>(null);
 const [value, setValue] = useState(to);
 useLayoutEffect(() => {
  const el = ref.current;
  if (!el || reducedMotion() || typeof IntersectionObserver !== 'function') return;
  setValue(0);
  let frame = 0;
  const observer = new IntersectionObserver(entries => {
   if (!entries.some(e => e.isIntersecting)) return;
   observer.disconnect();
   const start = performance.now();
   const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    setValue(Math.round(to * eased));
    if (t < 1) frame = requestAnimationFrame(step);
   };
   frame = requestAnimationFrame(step);
  }, { threshold: 0.4 });
  observer.observe(el);
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
 }, [to, duration]);
 return [value, ref] as const;
}

/* The card under the pointer lights up from where the pointer actually is. One listener on the grid
   rather than one per card, and it writes custom properties instead of re-rendering React. */
export function useSpotlight<T extends HTMLElement>() {
 const ref = useRef<T>(null);
 useEffect(() => {
  const grid = ref.current;
  if (!grid || reducedMotion() || !matchMedia('(hover: hover)').matches) return;
  const onMove = (event: PointerEvent) => {
   const card = (event.target as HTMLElement).closest<HTMLElement>('article, .spotlit');
   if (!card || !grid.contains(card)) return;
   const box = card.getBoundingClientRect();
   card.style.setProperty('--mx', `${event.clientX - box.left}px`);
   card.style.setProperty('--my', `${event.clientY - box.top}px`);
  };
  grid.addEventListener('pointermove', onMove);
  return () => grid.removeEventListener('pointermove', onMove);
 }, []);
 return ref;
}
