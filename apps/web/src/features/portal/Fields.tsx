import type { CSSProperties, ReactNode } from 'react';
import { Checkbox } from '../../ui/Checkbox';
import { Select as SharedSelect } from '../../ui/Select';
import { cx } from '../../ui/cx';
import './fields.css';

/* The portal's form controls, drawn once so every category and the Configuration editors wear the same
 * ones: a range slider, a switch, choice chips, a select — and, since 28 September 2026, the two shapes
 * every settings page is built from: a field row (label, help, the control, the value in force under it)
 * and the save bar (the reason, the Save, and the sentence that says when saving is not open).
 *
 * Every one of them is the native element underneath — an <input type="range">, an <input
 * type="checkbox" role="switch">, radios and checkboxes inside their labels — restyled from the tokens
 * rather than rebuilt from divs. A div pretending to be a slider has to reimplement the arrow keys,
 * Home and End, Page Up and Down, the value a screen reader announces and the form it belongs to, and
 * every one it forgets is a person who cannot set the value. The native element already does all of it.
 *
 * Since the Lovable identity (28 September 2026, wave 4e) this file is a thin layer over the shared
 * components of apps/web/src/ui: the select is the shared Select, the switch is the shared Checkbox, a row
 * wears the shared Field's label and message, and fields.css draws the slider and the chips — which the
 * handoff has no component for — on the same tokens, so they read as one family with the rest.
 *
 * The stylesheet beside this file travels with it, so the legacy back office that still draws
 * Configuration.tsx for the cutover's parallel run gets the same controls as the portal, and neither
 * reaches the patient's first load: this module is imported by screens that are dynamic imports.
 *
 * What this file will not draw is a field that takes text. A reason or a number is typed into a textarea or
 * an input the screen draws itself, inside a FieldRow or a SaveBar, where scripts/check-boundaries.mjs reads
 * it — a shared text field would be a field a key could arrive in on a screen whose sweep cannot see it. */

/* A slider with its track filled to the value and the value in a chip that follows the thumb. The
   chip is aria-hidden because the input already announces the same words as its aria-valuetext; a
   second copy would be read twice. The fill and the chip are placed by one ratio handed to the sheet,
   so nothing measures the thumb in script and nothing moves but the thumb and the chip.

   Marks are ticks on the track at values the caller names — Configuration names the two bounds and the
   default — each with its words under it. They are aria-hidden for the chip's reason: the bounds are in
   the slider's own name and the default is in the setting's card, so a screen reader already has them.
   The ends' words sit at the ends of the row and any other mark's words on a line of their own under its
   tick, because a default a step from a bound would otherwise print on top of the bound's words. */
export type Mark = { readonly value: number; readonly label: string };
export function RangeSlider({ id, label, min, max, step = 1, value, valueText, onChange, disabled = false, describedBy, tone = 'paper', marks = [] }: {
 id?: string; label: string; min: number; max: number; step?: number; value: number; valueText: string;
 onChange: (value: number) => void; disabled?: boolean; describedBy?: string; tone?: 'paper' | 'night' | 'bare'; marks?: readonly Mark[];
}) {
 const span = max - min;
 const ratioOf = (v: number) => span > 0 ? (Math.min(max, Math.max(min, v)) - min) / span : 0;
 const at = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
 const ratio = ratioOf(at);
 const ends = marks.filter(m => m.value <= min || m.value >= max);
 const inner = marks.filter(m => m.value > min && m.value < max);
 return <div className={`fc-range is-${tone}`} style={{ '--fc-ratio': ratio } as CSSProperties}>
  {tone !== 'bare' && <span className="fc-range-chip" aria-hidden="true">{valueText}</span>}
  <input type="range" id={id} min={min} max={max} step={step} value={at} disabled={disabled}
   aria-label={label} aria-valuetext={valueText} aria-describedby={describedBy}
   onChange={event => onChange(Number(event.target.value))}/>
  {marks.length > 0 && <div className="fc-marks" aria-hidden="true">
   {marks.map(m => <i key={`tick-${m.value}`} className={`fc-tick${m.value > min && m.value < max ? ' is-inner' : ''}`} style={{ '--fc-at': ratioOf(m.value) } as CSSProperties}/>)}
   <span className="fc-mark-ends">{ends.map(m => <span key={m.value}>{m.label}</span>)}</span>
   {inner.map(m => <span key={m.value} className="fc-mark-inner" style={{ '--fc-at': ratioOf(m.value) } as CSSProperties}>{m.label}</span>)}
  </div>}
 </div>;
}

/* A setting that is on or off and nothing else. Until 28 September 2026 this was a drawn switch; the handoff
   has no switch, and its Checkbox is exactly "an independent binary choice", so the setting is now the
   shared Checkbox — the native checkbox under the handoff's box and tick, its whole label the 44-pixel
   target. The tick, not a fill, says it is on, and the state word beside the label ("On", "Off") says it
   again in words; that word is hidden from a screen reader, which already hears "checked". The name stays
   Switch because the build reads every settings screen's import of it by that name.

   A boolean that names its two choices in sentences — "Words only" and "Photos allowed" — is not drawn
   here: which of those is "checked" would be a guess, so those are ChoiceChips. */
export function Switch({ label, checked, onChange, stateText, describedBy, disabled = false }: {
 label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; stateText?: string;
 describedBy?: string; disabled?: boolean; tone?: 'paper' | 'night';
}) {
 return <div className="fc-switch">
  <Checkbox checked={checked} disabled={disabled} aria-describedby={describedBy} onChange={event => onChange(event.target.checked)}
   label={<span className="fc-switch-label">{label}{stateText && <span className="fc-switch-state" aria-hidden="true">{stateText}</span>}</span>}/>
 </div>;
}

/* Choices as the handoff's badge-shaped toggles: radios for one of several, checkboxes for any of several.
   The input fills its pill, so the whole pill is the 44px target and the focus ring is drawn round it; a
   chosen pill takes the aqua the handoff keeps for a selection, with a drawn tick, so the tick — not only
   the fill — says which is chosen. Two radios are a segmented pair on the Tabs' track instead (fields.css).

   The brief of 28 September asked for toggle buttons with aria-pressed. They stay radios and checkboxes:
   a radio group is announced "1 of 3, selected" and moves by the arrow keys, a set of pressed buttons is
   neither, and the build holds these chips to the two input kinds below. The look is the badge's. */
export type Chip = { readonly key: string; readonly label: ReactNode; readonly checked: boolean; readonly onChange: (checked: boolean) => void };
export function ChoiceChips({ legend, name, kind = 'radio', chips, disabled = false, className = '' }: {
 legend: ReactNode; name?: string; kind?: 'radio' | 'checkbox'; chips: readonly Chip[]; disabled?: boolean; className?: string;
}) {
 return <fieldset className={`fc-chips ${className}`} disabled={disabled}>
  <legend>{legend}</legend>
  <div className="fc-chip-row">
   {chips.map(chip => <label className="fc-chip" key={chip.key}>
    <input type={kind} name={kind === 'radio' ? name : undefined} checked={chip.checked} onChange={event => chip.onChange(event.target.checked)}/>
    <span>{chip.label}</span>
   </label>)}
  </div>
 </fieldset>;
}

/* A native select for a choice among more options than chips hold in a row — an engine, a rota's post. The
   caller keeps the <label>; this is the control and nothing else.

   Since 28 September 2026 it is the shared Select (apps/web/src/ui) under the portal's own signature: the
   handoff's field, chevron and focus outline, with the value handed back as a string, which is all a
   settings screen wants from it. The adapter is the whole of the difference, so a settings page and any
   other screen that adopts the shared components draw the same select. It no longer wears fc-select: that
   class stays for the voice preview's two selects, which the GilbertOne sweep keeps out of this file. */
export function Select({ id, value, onChange, children, disabled = false, describedBy }: {
 id: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean; describedBy?: string;
}) {
 return <SharedSelect id={id} value={value} disabled={disabled} aria-describedby={describedBy}
  onChange={event => onChange(event.target.value)}>{children}</SharedSelect>;
}

/* One setting as a row, in the shared Field's shape — the label in the Field's weight, what it decides in the
   Field's message ink, the control, and the value in force beneath it in the settings contract's own words. The label is drawn here only for a control that does not carry its own —
   a slider or a text field; a switch and a set of chips name themselves, so the caller passes them whole. */
export function FieldRow({ label, help, htmlFor, inForce, children, className = '' }: {
 label?: ReactNode; help?: ReactNode; htmlFor?: string; inForce?: ReactNode; children: ReactNode; className?: string;
}) {
 return <div className={cx('fc-row', 'ui-field', className)}>
  {label && <label className="fc-row-label" htmlFor={htmlFor}><strong className="ui-field__label">{label}</strong>{help && <span className="ui-field__message">{help}</span>}</label>}
  {children}
  {inForce && <p className="fc-in-force">{inForce}</p>}
 </div>;
}

/* The save bar: the reason, the Save and the sentence that says why saving is shut, together at the foot of
   whatever is being changed and held in view while it scrolls, identical on every settings page. It is a
   group named by the portal contract's sentence, so a screen reader meets the reason and the Save as one thing. The
   fields and the buttons are the caller's, drawn where the caller's own checks read them. */
export function SaveBar({ label, children, className = '' }: { label?: string; children: ReactNode; className?: string }) {
 return <div className={`fc-savebar ${className}`} role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}
/* Its buttons are the caller's, and since wave 4e every caller draws them as the handoff's Button variants —
   the step forward primary, the step back secondary — so the bar is the same bar wherever it ends a page. */
