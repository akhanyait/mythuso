import { useId, type CSSProperties, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { actionOf, cardStatusOf, gateIsOpen, gateOf, refusalFor, type Action } from '../../../lib/gilbertone-admin';

/* The only way a GilbertOne administration screen draws something that would change anything.
 *
 * Every button, checkbox and key field on these seven screens comes from here, named by an action in
 * packages/catalog/control-tower-portal.json#gilbertone.actions, and every one is disabled with the
 * gate's sentence beside it and tied to it by aria-describedby. There is no `disabled={false}` path and
 * no handler: while the vault, the key registry, the health-check runner, the tenant and the kill
 * switch are all named-but-absent there is nothing for a handler to call, and the assistant these
 * screens administer is answering patients in production. scripts/check-boundaries.mjs fails the build
 * if a GilbertOne screen draws a control any other way, or if a gate one of these names stops being
 * open while the control still has nothing behind it.
 *
 * Why disabled buttons at all, when docs/control-tower-accessibility.md prefers a sentence to a
 * disabled control: these are not locked settings, they are the plan's controls waiting on a gate, and
 * an administrator should see what will be here and what it waits on. The sentence is always drawn as
 * text, so a screen reader that skips the disabled button still reads why. Locked settings — push-to-
 * talk, captions, the clinical register, the clinical corpus — are <Locked/> below: text, no control. */

const assertOpen = (action: Action) => {
 if (!gateIsOpen(action.gate))
  throw new Error(`"${action.id}" is held by ${action.gate}, and ${action.gate} is no longer open. Build what the action does before drawing it enabled.`);
};

/* One action and its refusal. */
export function GatedAction({ id, name }: { id: string; name?: string }) {
 const why = useId();
 const action = actionOf(id);
 assertOpen(action);
 return <div className="g1-action">
  <button type="button" className="secondary g1-disabled" disabled aria-describedby={why}>{name ?? action.label}</button>
  <p id={why} className="g1-refusal"><strong>{gateOf(action.gate).label}.</strong> {refusalFor(action)}</p>
 </div>;
}

/* Several actions held by one gate, with the gate's sentence once — a provider card's six actions are
   one refusal, not six copies of it. Each button is still described by the sentence. */
export function GatedActions({ ids, label }: { ids: readonly string[]; label: string }) {
 const why = useId();
 const actions = ids.map(actionOf);
 actions.forEach(assertOpen);
 const gates = [...new Set(actions.map(a => a.gate))];
 if (gates.length !== 1) throw new Error(`The actions ${ids.join(', ')} are held by different gates and cannot share one refusal.`);
 return <div className="g1-actions" role="group" aria-label={label}>
  <div className="g1-action-row">{actions.map(a =>
   <button key={a.id} type="button" className="secondary g1-disabled" disabled aria-describedby={why}>{a.label}</button>)}</div>
  <p id={why} className="g1-refusal"><strong>{gateOf(gates[0]!).label}.</strong> {refusalFor(actions[0]!)}</p>
 </div>;
}

/* One action drawn in several places — the Save as default on each presentation row of the voice
   table — with its refusal written once, below them, by <GatedRefusal/>. Each button names the sentence
   it is held by, so a screen reader on any row hears why. */
export function GatedButton({ id, name, describedBy }: { id: string; name: string; describedBy: string }) {
 const action = actionOf(id);
 assertOpen(action);
 return <button type="button" className="secondary g1-disabled" disabled aria-describedby={describedBy}>{name}</button>;
}
export function GatedRefusal({ id, refusalId }: { id: string; refusalId: string }) {
 const action = actionOf(id);
 assertOpen(action);
 return <p id={refusalId} className="g1-refusal"><strong>{gateOf(action.gate).label}.</strong> {refusalFor(action)}</p>;
}

/* The plan's Show metadata checkbox (§7.4), drawn and disabled: no key registry exists, so there is
   no last four and no fingerprint for it to switch between. */
export function GatedCheckbox({ id }: { id: string }) {
 const why = useId();
 const action = actionOf(id);
 assertOpen(action);
 return <div className="g1-action">
  <label className="g1-check"><input type="checkbox" disabled aria-describedby={why}/><span>{action.label}</span></label>
  <p id={why} className="g1-refusal"><strong>{gateOf(action.gate).label}.</strong> {refusalFor(action)}</p>
 </div>;
}

/* The plan's level selector (§7.5), drawn as a slider and held by its gate. It is not an <input>:
   a range with no value would rest at its midpoint and read as a level nobody set, and a field on
   these screens is never given a value while no vault exists. So the thumb is placed by a ratio of
   the caller's own contract numbers, handed to the sheet as a custom property that turns it into the
   percentage there — a GilbertOne screen types no digit but a 0 or a 1 — the whole thing is
   aria-disabled, and it moves nothing: it shows where the selector sits and what holds it, described
   by the gate's sentence like every other control here. Every number is the caller's contract's. */
export function GatedSlider({ id, label, min, max, value, valueText, ticks }: {
 id: string; label: string; min: number; max: number; value: number; valueText: string; ticks: readonly number[];
}) {
 const why = useId();
 const action = actionOf(id);
 assertOpen(action);
 const span = max - min;
 const ratio = span === 0 ? 0 : (value - min) / span;
 return <div className="g1-action">
  <div className="pt-slider">
   <div className="pt-slider-top">
    <span className="pt-slider-chip">{valueText}</span>
    <span className="g1-tag">{gateOf(action.gate).label}</span>
   </div>
   <div className="pt-range" role="slider" aria-label={label} aria-disabled="true"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText} aria-describedby={why}>
    <span className="pt-range-track" style={{ '--pt-ratio': ratio } as CSSProperties}>
     <span className="pt-range-fill"/>
     <span className="pt-range-thumb"/>
    </span>
   </div>
   <div className="pt-slider-ticks" aria-hidden="true">
    {ticks.map(t => <span key={t} className="pt-slider-tick">{t}</span>)}
   </div>
  </div>
  <p id={why} className="g1-refusal"><strong>{gateOf(action.gate).label}.</strong> {refusalFor(action)}</p>
 </div>;
}

/* A field of a form the contract describes and no screen may submit: the add-a-provider form and the
   key entry. Disabled, empty, and never given a value; the key field is a password field so the shape
   is the plan's, and it can hold nothing because it can be typed into by nobody. */
export function ShapeField({ label, hint, kind = 'text' }: { label: string; hint?: string; kind?: 'text' | 'password' }) {
 const hintId = useId();
 return <label className="g1-field">
  <span>{label}</span>
  <input type={kind} disabled autoComplete="off" aria-describedby={hint ? hintId : undefined}/>
  {hint && <small id={hintId}>{hint}</small>}
 </label>;
}

/* A locked setting: a sentence with its reason, never a control (docs/control-tower-accessibility.md,
   Actions). */
export function Locked({ title, children }: { title: string; children: ReactNode }) {
 return <div className="g1-locked" role="note">
  <Lock aria-hidden="true"/>
  <div><strong>{title}</strong><p>{children}</p></div>
 </div>;
}

/* A provider card's state, in api-registry.json's own card vocabulary: the word first, its sentence
   beside it, the colour a second channel. */
export function CardStatusWord({ id, withSentence = false }: { id: string; withSentence?: boolean }) {
 const word = cardStatusOf(id);
 return <span className="pt-status-wrap">
  <span className={`pt-status g1-card-status is-${word.id}`}>{word.id}</span>
  {withSentence && <span className="pt-status-sentence">{word.sentence}</span>}
 </span>;
}
