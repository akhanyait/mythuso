import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

/* The parallel run's read-only wrapper, for the two old surfaces kept behind ?legacy=1 while the merged
 * Control Tower becomes the screen of record (docs/control-tower-cutover.md).
 *
 * Two halves, because one is not enough. A disabled fieldset disables every native control inside it
 * — a button, an input, a select — and says so to a screen reader. It does not reach the controls a
 * screen draws for itself: the dispatch board's map pins are SVG groups with role="button", and a
 * fieldset leaves them working. So a press or an Enter that reaches anything inside is stopped here,
 * before the screen under it hears of it. The content stays readable and focusable — comparing the old
 * place with the new one is the point of keeping it — and nothing in it acts. */
const stop = (event: MouseEvent | KeyboardEvent) => { event.preventDefault(); event.stopPropagation(); };
export function ReadOnly({ children }: { children: ReactNode }) {
 return <fieldset disabled className="legacy-readonly" onClickCapture={stop}
  onKeyDownCapture={event => { if (event.key === 'Enter' || event.key === ' ') stop(event); }}>
  <legend className="visually-hidden">Read-only</legend>
  {children}
 </fieldset>;
}
