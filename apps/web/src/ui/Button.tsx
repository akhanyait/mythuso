import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from './cx';
import './ui.css';

/* The handoff's Button, with its cva variants and sizes kept by name so a screen written against the
   handoff's catalogue reads the same here: primary, accent, secondary, ghost and destructive; sm, md, lg
   and icon. The classes are ui.css's and read nothing but token variables.

   Three things differ from the handoff, each for a rule of this build rather than for taste:
   - md and icon are 44 tall rather than 40, and sm keeps its 32-pixel face over a 44-pixel hit area
     (ui.css, "Targets"). A health app is used one-handed in a doorway.
   - The loading glyph turns once as it arrives rather than spinning for as long as the wait lasts: a
     spinner that runs forever is the one piece of motion this codebase refuses outright. The button
     still says it is busy — aria-busy, and it cannot be pressed twice.
   - A button is type="button" unless the caller says otherwise, so a Button dropped into a form does
     not submit it by accident. */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export function buttonVariants({ variant = 'primary', size = 'md' }: { variant?: ButtonVariant | null; size?: ButtonSize | null } = {}): string {
 return cx('ui-button', `ui-button--${variant ?? 'primary'}`, `ui-button--${size ?? 'md'}`);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
 variant?: ButtonVariant | null;
 size?: ButtonSize | null;
 loading?: boolean;
 leadingIcon?: ReactNode;
 trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading = false, leadingIcon, trailingIcon, children, disabled, type = 'button', ...props }, ref) =>
 <button ref={ref} type={type} className={cx(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
  {loading ? <LoaderCircle aria-hidden="true" className="ui-button__spinner"/> : leadingIcon}
  {children}
  {!loading && trailingIcon}
 </button>);
Button.displayName = 'Button';
