import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* One coherent object or tool, framed. The handoff's three variants are kept: default sits on the card
   shadow, elevated on the raised one, and interactive answers a pointer with its border — never two
   shadows at once, since elevation is one shadow in this system. An interactive card is still a <div>:
   what a person presses inside it is a Button or a link the caller puts there, because a div that
   pretends to be a button has to reimplement the keyboard and forgets some of it. */
export type CardVariant = 'default' | 'elevated' | 'interactive';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
 variant?: CardVariant | null;
 padding?: CardPadding | null;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, variant, padding, ...props }, ref) =>
 <div ref={ref} className={cx('ui-card', `ui-card--${variant ?? 'default'}`, `ui-card--pad-${padding ?? 'none'}`, className)} {...props}/>);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) =>
 <div ref={ref} className={cx('ui-card__header', className)} {...props}/>);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) =>
 <h3 ref={ref} className={cx('ui-card__title', className)} {...props}/>);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) =>
 <p ref={ref} className={cx('ui-card__description', className)} {...props}/>);
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) =>
 <div ref={ref} className={cx('ui-card__content', className)} {...props}/>);
CardContent.displayName = 'CardContent';
