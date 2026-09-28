import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* Compact metadata — a category, a non-urgent state. Never a button: it has no press and no focus.

   Both sizes set their words at 13, the smallest size this product renders; the handoff's 11 and 12 are
   below it, so sm and md differ by their padding. The danger badge's words are the measured replacement
   (#b42318 on light, the handoff's orange on dark) because the brand orange as text measures 2.99:1, and
   the primary badge's words on dark are the handoff's dark accent, because its dark primary as text on a
   tint measures under 4.5:1. */
export type BadgeVariant = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

export function badgeVariants({ variant = 'neutral', size = 'md' }: { variant?: BadgeVariant | null; size?: BadgeSize | null } = {}): string {
 return cx('ui-badge', `ui-badge--${variant ?? 'neutral'}`, `ui-badge--${size ?? 'md'}`);
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
 variant?: BadgeVariant | null;
 size?: BadgeSize | null;
 dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, size, dot, children, ...props }, ref) =>
 <span ref={ref} className={cx(badgeVariants({ variant, size }), className)} {...props}>
  {dot && <span aria-hidden="true" className="ui-badge__dot"/>}
  {children}
 </span>);
Badge.displayName = 'Badge';
