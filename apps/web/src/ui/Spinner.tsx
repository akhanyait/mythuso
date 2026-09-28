import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* An indeterminate wait, announced: role="status" with its label in words for a screen reader.

   The handoff spins it for as long as the wait lasts. This build refuses a spinner that runs forever —
   apps/web/src/surface/app.css says so above the one screen that waits for a chunk — because an endless
   animation is motion nobody asked for and nobody can stop. So the arc turns once as it arrives and then
   rests, and the ring with its one coloured quarter is the familiar mark of a wait without moving. Under
   reduced motion it does not turn at all. */
export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerTone = 'primary' | 'accent' | 'current';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
 size?: SpinnerSize | null;
 tone?: SpinnerTone | null;
 label?: string;
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(({ size, tone, label = 'Loading', className, ...props }, ref) =>
 <span ref={ref} role="status" className={cx('ui-spinner', `ui-spinner--${size ?? 'md'}`, `ui-spinner--${tone ?? 'primary'}`, className)} {...props}>
  <span className="visually-hidden">{label}</span>
 </span>);
Spinner.displayName = 'Spinner';
