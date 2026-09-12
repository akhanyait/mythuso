import { Pause, Play } from 'lucide-react';
import { useDecor } from '../lib/motion';
/* The control that stops everything decorative on the page.
 *
 * It is a button and not a switch dressed as one: a real <button>, 44 high and never less than 44
 * wide, in the tab order, operated by Enter and Space because that is what a button does, and
 * carrying a written label rather than a glyph and a tooltip. WCAG 2.2.2 asks for a mechanism to
 * pause anything that moves by itself for more than five seconds, and a mechanism a keyboard cannot
 * reach is not one.
 *
 * The name changes rather than an aria-pressed. A toggle can announce itself either way, but not
 * both at once: "Pause motion, pressed" is a sentence nobody can act on. The name says what the
 * press will DO, which is what the icon says too, and the visible text is the accessible name in
 * full — including where the label is visually hidden on a narrow screen, because clipping text is
 * not the same as removing it, and 2.5.3 asks that what is said matches what is shown.
 *
 * It renders nothing to a reader who has asked their system for less motion. There is nothing to
 * pause: the flag it governs is never set, every animation is removed in the stylesheet as well,
 * and a disabled button explaining an absence is worse than the absence. The hero carousel decided
 * the same thing for the same reason. */
export function MotionPause({ className }: { className?: string }) {
 const { playing, reduced, toggle } = useDecor();
 if (reduced) return null;
 return (
  <button type="button" className={`m-pause${className ? ` ${className}` : ''}`} onClick={toggle}>
   {playing ? <Pause size={15}/> : <Play size={15}/>}
   <span>{playing ? 'Pause motion' : 'Play motion'}</span>
  </button>
 );
}
