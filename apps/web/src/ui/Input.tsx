import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* A single line of clinical or account data. `invalid` is aria-invalid, and the stylesheet draws the
   invalid state from that attribute rather than from a class, so the state a screen reader announces and
   the state a reader sees cannot disagree. Its visible label is the caller's — Field, or a <label> of
   their own — because a placeholder is not a label. */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { invalid?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) =>
 <input ref={ref} aria-invalid={invalid || undefined} className={cx('ui-control', 'ui-input', className)} {...props}/>);
Input.displayName = 'Input';
