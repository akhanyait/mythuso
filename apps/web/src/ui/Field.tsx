import { Children, cloneElement, forwardRef, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cx } from './cx';
import './ui.css';

/* A label, its control, and the hint or the error beneath it, tied together by ids.

   The handoff's Field prints the message under an id and leaves the control to point at it, which means
   every caller has to remember aria-describedby and some will not. Here Field does the pointing: its one
   control child is handed aria-describedby (added to any the caller already gave), aria-invalid while
   there is an error, and aria-required when the field is required. The asterisk is hidden from assistive
   technology because aria-required already says the same thing in words.

   An error replaces the hint rather than sitting beside it, as in the handoff — two sentences under one
   field is one more than a person reads. */
export interface FieldProps {
 label: string;
 htmlFor: string;
 hint?: string;
 error?: string;
 required?: boolean;
 children: ReactNode;
 className?: string;
}

type Describable = { 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false'; 'aria-required'?: boolean };

export const Field = forwardRef<HTMLDivElement, FieldProps>(({ label, htmlFor, hint, error, required, children, className }, ref) => {
 const descriptionId = `${htmlFor}-description`;
 const message = error ?? hint;
 const only = Children.count(children) === 1 && isValidElement(children) ? children as ReactElement<Describable> : null;
 const control = only ? cloneElement(only, {
  'aria-describedby': [only.props['aria-describedby'], message ? descriptionId : undefined].filter(Boolean).join(' ') || undefined,
  'aria-invalid': error ? true : only.props['aria-invalid'],
  'aria-required': required || only.props['aria-required'],
 }) : children;
 return <div ref={ref} className={cx('ui-field', className)}>
  <label htmlFor={htmlFor} className="ui-field__label">{label}{required && <span className="ui-field__required" aria-hidden="true">*</span>}</label>
  {control}
  {message && <p id={descriptionId} className={cx('ui-field__message', error ? 'ui-field__message--error' : undefined)}>{message}</p>}
 </div>;
});
Field.displayName = 'Field';
