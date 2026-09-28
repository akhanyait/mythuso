import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { cx } from './cx';

/* A button that is only an icon, so its name is required rather than hoped for: `label` becomes the
   aria-label a screen reader announces and the title a pointer shows. The icon inside is the caller's and
   is decorative — Lucide marks its own svg aria-hidden. The handoff's three sizes are 32, 40 and 48; here
   md is 44 and sm keeps a 32-pixel face over a 44-pixel hit area, as Button's sizes do. */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'size'> {
 label: string;
 children: ReactNode;
 size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({ label, size = 'md', children, className, ...props }, ref) =>
 <Button ref={ref} aria-label={label} title={label} size="icon" className={cx(size === 'sm' && 'ui-button--icon-sm', size === 'lg' && 'ui-button--icon-lg', className)} {...props}>{children}</Button>);
IconButton.displayName = 'IconButton';
