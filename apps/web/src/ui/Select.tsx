import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';
import './ui.css';

/* A native <select> with the handoff's chevron drawn over it. The chevron is a sibling that lets the
   pointer through, so the whole field opens the list, and the native element keeps what a rebuilt one
   would have to reimplement: the keyboard, type-ahead, the platform's own picker on a phone. */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { invalid?: boolean }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, invalid, children, ...props }, ref) =>
 <span className="ui-select-wrap">
  <select ref={ref} aria-invalid={invalid || undefined} className={cx('ui-control', 'ui-select', className)} {...props}>{children}</select>
  <ChevronDown className="ui-select__chevron" aria-hidden="true"/>
 </span>);
Select.displayName = 'Select';
