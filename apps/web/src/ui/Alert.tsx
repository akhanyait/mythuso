import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cx } from './cx';
import './ui.css';

/* Feedback that stays on screen. Every variant pairs its Lucide icon and a title in words with its
   colour, so no alert is told apart by colour alone, and a danger alert is role="alert" — announced the
   moment it appears — while the rest are role="status" and wait their turn.

   Two of the handoff's icon colours cannot be seen on a light card: its warning is the brand lime at
   1.21:1 and its danger the brand orange at 2.99:1, both under the 3:1 a meaningful graphic needs. On a
   light ground those two icons are drawn in the replacements tokens.json#contrast.knownFailures names
   (#92400e and #b42318, already the build's --mango-ink and --danger); on a dark ground in the handoff's
   own colours, which clear it. */
const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle };
export type AlertVariant = keyof typeof icons;

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
 variant?: AlertVariant;
 title: string;
 icon?: ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(({ variant = 'info', title, icon, children, className, ...props }, ref) => {
 const Icon = icons[variant];
 return <div ref={ref} role={variant === 'danger' ? 'alert' : 'status'} className={cx('ui-alert', `ui-alert--${variant}`, className)} {...props}>
  <span className="ui-alert__icon">{icon ?? <Icon aria-hidden="true"/>}</span>
  <div className="ui-alert__body">
   <p className="ui-alert__title">{title}</p>
   {children && <div className="ui-alert__text">{children}</div>}
  </div>
 </div>;
});
Alert.displayName = 'Alert';
