import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import './ui.css';

/* Several lines of notes or context, resizable in height only so it can never push a phone's layout
   sideways. The invalid state is aria-invalid, as Input's is. */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) =>
 <textarea ref={ref} aria-invalid={invalid || undefined} className={cx('ui-control', 'ui-textarea', className)} {...props}/>);
Textarea.displayName = 'Textarea';
