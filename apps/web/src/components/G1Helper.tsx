import { useId } from 'react';
import states from '../../../../packages/catalog/gilbertone-states.json' with { type: 'json' };
import './g1-helper.css';

/* GilbertOne's v3 character, ported from the MyThuso v3 source Gilbert sent on 29 October 2026 (src/g1.js and
 * src/g1.css): the G1 mark inside a soft peach blob whose silhouette changes for each of six states. The mark is
 * the panel buddy's own drawing — the same G, 1 and eyes on the 104-unit grid as features/GilbertAvatar.tsx — so
 * this is the character the product already has, given the pack's body, not a second creature.
 *
 * THE SHAPE SAYS THE STATE. Each state's base rules are a still pose (squashed for listen, a lumpy outline and an
 * orbit for think, stretched with a halo for found, lifted with happy eyes for success, warm and shrunk for error);
 * the loops only emphasise it. They run only under :root[data-decor="on"], like every other ambient movement in the
 * product, and never under reduced motion, so the still pose is what a reader with less motion or a paused page sees.
 *
 * THE CHARACTER IS NOT CONTENT. The pack gave the svg a role and a label; here it is aria-hidden, because every screen
 * that shows GilbertOne says what it is doing in words beside it, and a second announcement of "GilbertOne, think"
 * would be noise. The gradients carry per-drawing ids, because the pack's fixed ids collide when two are on a page. */
export type G1State = (typeof states.states)[number]['id'];
export const g1States = states.states;
export const g1Rule = states.rule;

const INK = '#141B2D';

export function G1Helper({ state, size = 64, onDark = false, className }: { state: G1State; size?: number; onDark?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <span className={['g1', state, className].filter(Boolean).join(' ')} data-g1={state} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <defs>
          <radialGradient id={`g1grad-${id}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFF7F3"/><stop offset=".65" stopColor="#FFE1D7"/><stop offset="1" stopColor="#F7B9A6"/></radialGradient>
          <radialGradient id={`g1warm-${id}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FFF8EA"/><stop offset="1" stopColor="#F6D9A6"/></radialGradient>
          <clipPath id={`g1cut-${id}`}><path d="M-20 -20H130V33H50.75V68.5L61.75 57.5V130H-20Z"/></clipPath>
        </defs>
        <ellipse className="shadow" cx="50" cy="97" rx="30" ry="3.2" fill={onDark ? '#000' : INK} opacity={onDark ? .35 : .12}/>
        <circle className="halo" cx="50" cy="50" r="46"/><circle className="halo h2" cx="50" cy="50" r="46"/>
        <g className="bod">
          <path className="blob" style={{ fill: `url(#${state === 'error' ? `g1warm-${id}` : `g1grad-${id}`})` }}
            {...(onDark ? { stroke: '#fff', strokeOpacity: .5, strokeWidth: 2 } : {})}
            d="M50 6C75 6 94 25 94 50C94 75 75 94 50 94C25 94 6 75 6 50C6 25 25 6 50 6Z"/>
          <g className="face"><g transform="translate(50 50) scale(.66) translate(-44 -50)">
            <path d="M81.25 50A37.25 37.25 0 1 1 65.895 19.864L56.197 33.213A20.75 20.75 0 1 0 64.75 50Z" fill={INK} clipPath={`url(#g1cut-${id})`}/>
            <g className="one"><path d="M81.25 39L81.25 87.25L64.75 87.25L64.75 51.5L53.75 62.5L53.75 50L64.75 39Z" fill="#E5533F"/></g>
            <g className="eyes">
              <rect className="open" x="28.7" y="45" width="7.6" height="13" rx="3.8" fill={INK}/>
              <rect className="open" x="42.7" y="45" width="7.6" height="13" rx="3.8" fill={INK}/>
              <path className="happy" d="M28.7 53.58Q32.5 43.44 36.3 53.58M42.7 53.58Q46.5 43.44 50.3 53.58" fill="none" stroke={INK} strokeWidth="4.3" strokeLinecap="round"/>
            </g>
          </g></g>
        </g>
        <g className="orbit"><circle cx="50" cy="-1" r="4" fill="#E5533F"/><circle cx="94" cy="72" r="3" fill={INK}/><circle cx="8" cy="74" r="2.4" fill="#F4A93B"/></g>
      </svg>
    </span>
  );
}

/* The v3 pack's helper line: GilbertOne beside one sentence from gilbertone-states.json. A screen names where it is and
   the contract decides the pose and the words, so no screen types a sentence for GilbertOne. It is a note rather than a
   button, because nothing here is a running assistant: the line says what GilbertOne is for, and the panel is opened
   from its own control. */
export type G1HelperAt = keyof typeof states.helpers;
export function G1Help({ at }: { at: G1HelperAt }) {
  const line = states.helpers[at];
  return <aside className="g1-help" aria-label="GilbertOne" data-g1-help={at}>
    <G1Helper state={line.state as G1State} size={46}/>
    <p>{line.text}</p>
  </aside>;
}
