import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
export function StepHead({ step, total, label }: { step: number; total: number; label: string }) {
 return <div className="step-head">
  <span>Step {step} of {total}</span><em>{label}</em>
  <span className="step-dots" role="img" aria-label={`Step ${step} of ${total}: ${label}`}>
   {Array.from({ length: total }, (_, i) => <i key={i} className={i + 1 === step ? 'now' : i + 1 < step ? 'on' : ''}/>)}
  </span>
 </div>;
}
/* One box per digit, as the design asks. Each box is a real input so a password manager, an SMS
   autofill and a screen reader all still work; the group carries the label, not each box. */
export function CodeInput({ value, onChange, length = 6, label, describedBy, invalid, autoFocus }:
 { value: string; onChange: (v: string) => void; length?: number; label: string; describedBy?: string; invalid?: boolean; autoFocus?: boolean }) {
 const boxes = useRef<(HTMLInputElement | null)[]>([]);
 /* Focused without scrolling to it. The native attribute scrolls the nearest scroller until the box
    is in view, and on the nurse's visit that scroller is the work column: the visit's own deck — who
    she is with, which stage she is on — was scrolled off the top of the screen before she had read it.
    The caret still lands in the first box, so a keyboard and a screen reader lose nothing. */
 useEffect(() => { if (autoFocus) boxes.current[0]?.focus({ preventScroll: true }); }, [autoFocus]);
 const set = (index: number, raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) { onChange(value.slice(0, index)); return; }
  const next = (value.slice(0, index) + digits).slice(0, length);
  onChange(next);
  boxes.current[Math.min(next.length, length - 1)]?.focus();
 };
 return <div className="code-input" role="group" aria-label={label} aria-describedby={describedBy}>
  {Array.from({ length }, (_, i) => <input
   key={i} ref={el => { boxes.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
   maxLength={length} value={value[i] ?? ''} aria-label={`${label}, digit ${i + 1} of ${length}`}
   aria-invalid={invalid} className={invalid ? 'field-error' : ''}
   onChange={e => set(i, e.target.value)}
   onKeyDown={e => {
    if (e.key === 'Backspace' && !value[i] && i > 0) { onChange(value.slice(0, i - 1)); boxes.current[i - 1]?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) boxes.current[i + 1]?.focus();
   }}
   onPaste={e => { e.preventDefault(); set(0, e.clipboardData.getData('text')); }}
  />)}
  {value.length === length && !invalid && <span className="code-ok" aria-hidden="true"><Check size={18}/></span>}
 </div>;
}
