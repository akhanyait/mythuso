import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* Live availability, said in words: `label` is required and is the thing a reader reads, and the dot
   beside it is decoration hidden from assistive technology. The dot differs by shape as well as colour —
   offline is a hollow ring — so the three states survive a greyscale screen. Busy is the measured amber
   ink on a light ground, because the handoff's lime dot measures 1.21:1 on white and cannot be seen. */
export type Status = 'online' | 'busy' | 'offline';

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
 status?: Status;
 label: string;
}

export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(({ status = 'online', label, className, ...props }, ref) =>
 <span ref={ref} className={cx('ui-status', `ui-status--${status}`, className)} data-status={status} {...props}>
  <span className="ui-status__dot" aria-hidden="true"/>
  {label}
 </span>);
StatusIndicator.displayName = 'StatusIndicator';
