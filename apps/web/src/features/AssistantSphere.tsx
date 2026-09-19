import { useEffect, useRef, useState } from 'react';
import { useDecor } from '../lib/motion';
import type { Depth, PulseId } from '../lib/assistant';

/* The sphere the assistant is drawn around, and the reason it is a sphere.

   The web port of apps/ios/MyThuso/DesignSystem/AssistantSphere.swift, layer for layer, in the
   logo's colours rather than the iOS sage: a brand-green light inside a brand-ink body, the logo's
   lime dot as the spark, and one faint trace of the roof's orange in a single orbit.

   `voice` in packages/catalog/capabilities.json forbids drawing a microphone affordance of any
   kind. That removes every shape a person expects an assistant to be: the capsule, the bar meter,
   the pulsing ring round a glyph. A sphere is what is left. It has no mouth and no aperture, it is
   lit rather than listening, and nothing on it can be pressed. It is aria-hidden, and everything
   it means is said in words beside it.

   HOW IT IS BUILT, outside in. An ambient bleed with no edge. Three hairline halo rings. Two tilted
   orbits whose brightness travels round the ring, because a rotating ellipse wobbles and a
   travelling arc orbits. The body: a light pool that drifts, an inner glow, a bounce light in the
   shadow, a rim shell, a slow sheen, and one highlight well off centre (centred, it hollows the
   ball into a ring). A rim light that dies away on the shadow side. Then particles, in one canvas.

   WHY CSS AND ONE CANVAS, and not a library. A patient on a mid-range Android phone on metered
   data opens this. Every endless animation below changes transform or opacity, so the compositor
   carries it and nothing is laid out again. The gradients are painted once. The canvas draws
   twenty-eight dots at thirty frames a second, which costs less than the text on the page.

   NOTHING IS RANDOM. Each particle's orbit, size, speed and twinkle comes from its index through
   the golden angle and a few modulo terms, the same arithmetic as iOS. The drawing is the same on
   every run, so a screenshot can be compared.

   STATES, AND NO LEVEL. The panel hands the sphere its Pulse state as `pulse`, and the state is drawn
   in form as well as tone: Escalate brings in the roof's orange as a controlled accent, Handover
   dims the body and holds it behind the summary. The words beside the sphere say which state it is.
   There is no loudness input on the web. The phones drive their spheres from a live microphone
   while Listening; on this surface the composer's microphone is wired to the text box and to nothing
   here, and Listening is not a state the web may be in, so a reactive drawing would be a listening
   affordance with nothing listening — and the code that drew one has been taken out.

   IT STOPS RATHER THAN SLOWING. Under prefers-reduced-motion no animation runs, level is ignored,
   the canvas draws once at a fixed moment, and every layer is still there: a whole sphere, never a
   blank circle. The core stylesheet's reduced-motion rule shortens durations rather than removing
   animations, which for an infinite loop means spinning faster, so this file removes them itself.
   The same pause covers the cheaper cases: off screen, the tab hidden, or the page's motion paused
   by its own control (WCAG 2.2.2 — the sphere moves by itself for longer than five seconds). */

const STILL_MOMENT = 2.35;
const RISE = 0.45;
const HOLD = 1.25;
const SETTLED = 2.45;
const PARTICLES = 28;
const FRAME_MS = 1000 / 30;
/* The body's radius as a fraction of the drawing: 63 per cent across, as on iOS. The particles use
   it to hide what passes behind the ball. */
const BODY_RADIUS = 0.315;

const smooth = (x: number) => x * x * (3 - 2 * x);
/** Rise, hold, fall: 0 to 1 and back over two and a half seconds after something new arrives. */
export function gathering(elapsed: number): number {
 if (elapsed <= 0) return 0;
 if (elapsed < RISE) return smooth(elapsed / RISE);
 if (elapsed < HOLD) return 1;
 if (elapsed < SETTLED) return 1 - smooth((elapsed - HOLD) / (SETTLED - HOLD));
 return 0;
}

type Inks = { mint: string; lime: string };
type Moment = { clock: number; gather: number };

/* One frame of the particle field. The orbital plane is
   squashed to 0.62 so the dots circle the ball rather than haloing it. A dot on the far half of
   that plane that falls inside the body's disc is not drawn at all, which is what makes the orbit
   pass behind the sphere. One dot in seven is lime, the logo's dot: rare enough to read as a
   spark. */
function paint(canvas: HTMLCanvasElement, { clock, gather }: Moment, inks: Inks) {
 const context = canvas.getContext('2d');
 if (!context) return;
 const { width, height } = canvas;
 context.clearRect(0, 0, width, height);
 const extent = Math.min(width, height);
 const cx = width / 2;
 const cy = height / 2;
 const body = extent * BODY_RADIUS;
 for (let index = 0; index < PARTICLES; index++) {
  const drift = 0.05 + (index % 5) * 0.011;
  const angle = index * 2.39996 + clock * drift * (1 + gather * 1.7);
  const orbit = (0.335 + ((index * 0.37) % 1) * 0.19) * (1 - gather * 0.1);
  const wobble = Math.sin(clock * 0.6 + index) * extent * 0.012;
  const reach = extent * orbit + wobble;
  const dx = Math.cos(angle) * reach;
  const dy = Math.sin(angle) * reach * 0.62;
  if (dy < 0 && Math.hypot(dx, dy) < body) continue;
  const twinkle = 0.3 + 0.42 * (0.5 + 0.5 * Math.sin(clock * (1.1 + (index % 3) * 0.4) + index * 1.7));
  const spark = index % 7 === 3;
  const size = extent * (0.006 + ((index * 0.11) % 1) * 0.008);
  context.globalAlpha = Math.min(1, twinkle * (spark ? 1.25 : 0.62 + gather * 0.35));
  context.fillStyle = spark ? inks.lime : inks.mint;
  context.beginPath();
  context.arc(cx + dx, cy + dy, spark ? size * 0.6 : size / 2, 0, Math.PI * 2);
  context.fill();
 }
 context.globalAlpha = 1;
}

/* The gathering gesture: the rings draw in, the halo brightens, the body leans in a little. It is
   played with the Web Animations API on wrapper elements that no endless animation touches, so it
   sits on top of the breathing rather than interrupting it. */
const lean = (rest: Keyframe, held: Keyframe): Keyframe[] => [
 { ...rest, offset: 0, easing: 'ease-in-out' },
 { ...held, offset: RISE / SETTLED },
 { ...held, offset: HOLD / SETTLED, easing: 'ease-in-out' },
 { ...rest, offset: 1 }
];
const GATHER: [string, Keyframe[]][] = [
 ['.orb-g-bleed', lean({ opacity: 0.84 }, { opacity: 1 })],
 ['.orb-g-halo', lean({ transform: 'scale(1)', opacity: 0.72 }, { transform: 'scale(0.95)', opacity: 1 })],
 ['.orb-g-orbits', lean({ transform: 'scale(1)' }, { transform: 'scale(0.94)' })],
 ['.orb-g-body', lean({ transform: 'scale(1)' }, { transform: 'scale(0.978)' })]
];

export function AssistantSphere({ depth, pulse, gatheredAt }: { depth: Depth; pulse: PulseId; gatheredAt: number | null }) {
 const root = useRef<HTMLDivElement>(null);
 const canvas = useRef<HTMLCanvasElement>(null);
 /* The clock survives a pause, so the drawing resumes where it stopped rather than jumping. It
    starts at the still moment, so the first frame anybody sees is the composed one. */
 const clock = useRef(STILL_MOMENT);
 /* `playing` already folds in the page's pause control, reduced motion and a hidden tab. */
 const { playing, reduced } = useDecor();
 const [onScreen, setOnScreen] = useState(true);
 const [box, setBox] = useState(0);
 const running = playing && !reduced && onScreen;

 useEffect(() => {
  const element = root.current;
  if (!element || typeof IntersectionObserver !== 'function') return;
  const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
  observer.observe(element);
  return () => observer.disconnect();
 }, []);

 useEffect(() => {
  const element = canvas.current;
  if (!element) return;
  const measure = () => setBox(element.clientWidth);
  measure();
  if (typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return () => observer.disconnect();
 }, []);

 useEffect(() => {
  const element = root.current;
  if (gatheredAt === null || reduced || !element || typeof element.animate !== 'function') return;
  const played = GATHER.flatMap(([selector, frames]) =>
   [...element.querySelectorAll<HTMLElement>(selector)].map(layer => layer.animate(frames, { duration: SETTLED * 1000 })));
  return () => played.forEach(animation => animation.cancel());
 }, [gatheredAt, reduced]);

 useEffect(() => {
  const element = canvas.current;
  if (!element || !box) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  element.width = Math.round(box * ratio);
  element.height = Math.round(box * ratio);
  const style = getComputedStyle(element);
  const inks = { mint: style.getPropertyValue('--brand-mint').trim(), lime: style.getPropertyValue('--brand-lime').trim() };
  const gatherAt = (now: number) => (reduced || gatheredAt === null ? 0 : gathering((now - gatheredAt) / 1000));
  if (reduced) clock.current = STILL_MOMENT;
  if (!running) { paint(element, { clock: clock.current, gather: gatherAt(performance.now()) }, inks); return; }
  const base = clock.current;
  const epoch = performance.now();
  let frame = 0;
  let last = -Infinity;
  const tick = (now: number) => {
   frame = requestAnimationFrame(tick);
   if (now - last < FRAME_MS) return;
   last = now;
   clock.current = base + (now - epoch) / 1000;
   paint(element, { clock: clock.current, gather: gatherAt(now) }, inks);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
 }, [running, reduced, box, gatheredAt]);

 return <div ref={root} className="orb" data-depth={depth} data-pulse={pulse} data-motion={reduced ? 'still' : running ? 'running' : 'paused'} aria-hidden="true">
  <div className="orb-g orb-g-bleed"><div className="orb-bleed"/></div>
  <div className="orb-g orb-g-halo"><i/><i/><i/></div>
  <div className="orb-g orb-g-orbits">
   <div className="orb-orbit orb-orbit-a"><div className="orb-arc"/></div>
   <div className="orb-orbit orb-orbit-b"><div className="orb-arc"/></div>
  </div>
  <div className="orb-g orb-g-body">
   <div className="orb-breath">
    <div className="orb-body">
     <div className="orb-drift-x"><div className="orb-drift-y"><div className="orb-pool"/></div></div>
     <div className="orb-core"/>
     <div className="orb-bounce"/>
     <div className="orb-rim"/>
     <div className="orb-sheen"><i/></div>
     <div className="orb-specular"><i/><b/></div>
    </div>
    <div className="orb-edge"/>
   </div>
  </div>
  <canvas ref={canvas} className="orb-particles"/>
 </div>;
}
