import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cx } from './cx';
import './ui.css';

/* An independent yes-or-no, drawn over the native checkbox so Space, the form and the announced state
   are the browser's. The box is the handoff's sixteen pixels; the label around it is the target and is
   44 tall, which is the exemption tokens.json already writes down for an input a design hides behind its
   own label. Checked differs from unchecked by the drawn tick, never by the fill alone. */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label?: ReactNode }

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, id, ...props }, ref) => {
 const fallback = useId();
 const inputId = id ?? fallback;
 return <label htmlFor={inputId} className="ui-checkbox">
  <span className="ui-checkbox__box">
   <input ref={ref} id={inputId} type="checkbox" className={cx('ui-checkbox__input', className)} {...props}/>
   <Check className="ui-checkbox__check" aria-hidden="true"/>
  </span>
  {label}
 </label>;
});
Checkbox.displayName = 'Checkbox';
