import { forwardRef } from 'react';
import type { HTMLAttributes, ImgHTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* A person's or an organisation's identity. Never a decorative image, and never a button on its own — a
   control that opens a profile wraps it in one. The fallback's initials are the handoff's primary on a
   primary tint on a light ground and the handoff's dark accent on a dark one, because its dark primary
   as text on a tint does not clear 4.5:1. */
export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> { size?: 'sm' | 'md' | 'lg' }

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(({ size = 'md', className, ...props }, ref) =>
 <span ref={ref} className={cx('ui-avatar', `ui-avatar--${size}`, className)} {...props}/>);
Avatar.displayName = 'Avatar';

export const AvatarImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(({ className, alt, ...props }, ref) =>
 <img ref={ref} alt={alt} className={cx('ui-avatar__image', className)} {...props}/>);
AvatarImage.displayName = 'AvatarImage';

export interface AvatarFallbackProps extends HTMLAttributes<HTMLSpanElement> { initials: string }

export const AvatarFallback = forwardRef<HTMLSpanElement, AvatarFallbackProps>(({ initials, className, ...props }, ref) =>
 <span ref={ref} className={cx('ui-avatar__fallback', className)} {...props}>{initials}</span>);
AvatarFallback.displayName = 'AvatarFallback';
