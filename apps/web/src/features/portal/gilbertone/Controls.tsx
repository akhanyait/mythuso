import { useId, type CSSProperties, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { actionOf, cardStatusOf, gateIsOpen, gateOf, liveOf, refusalFor, type Action } from '../../../lib/gilbertone-admin';

/* The only way a GilbertOne administration screen draws something that would change anything.
 *
 * Every button and key field on these seven screens comes from here, named by an action in
 * packages/catalog/control-tower-portal.json#gilbertone.actions. A gated action is disabled with the
 * gate's sentence beside it and tied to it by aria-describedby, with no `disabled={false}` path and no
 * handler: while the vault, the key registry, the health-check runner, the tenant and the kill switch
 * are all named-but-absent there is nothing for a handler to call, and the assistant these screens
 * administer is answering patients in production. scripts/check-boundaries.mjs fails the build if a
 * GilbertOne screen draws a control any other way, or if a gate one of these names stops being open
 * while the control still has nothing behind it.
 *
 * Since the founder's decision of 27 September 2026 there is a second path, and only one: <LiveButton/>
 * draws an action the contract records as live — gate null, decided by the founder on a day, with a
 * sentence saying what it does and what it never does — enabled, with a handler, and described by that
 * sentence. Two actions are live today, the Voice screen's Save as default and Play, and the build
 * refuses a live button for an action whose record is missing any of the three, exactly as it refuses a
 * gated button for a gate that has closed.
 *
 * Why disabled buttons at all, when docs/control-tower-accessibility.md prefers a sentence to a
 * disabled control: these are not locked settings, they are the plan's controls waiting on a gate, and
 * an administrator should see what will be here and what it waits on. The sentence is always drawn as
 * text, so a screen reader that skips the disabled button still reads why. Locked settings — push-to-
 * talk, captions, the clinical register, the clinical corpus — are <Locked/> below: text, no control. */

const assertOpen = (action: Action) => {
 if (action.gate === null)
  throw new Error(`"${action.id}" is a live action, and a gated control is being drawn for it. Draw it with LiveButton, or record the gate that holds it.`);
 if (!gateIsOpen(action.gate))
  throw new Error(`"${action.id}" is held by ${action.gate}, and ${action.gate} is no longer open. Build what the action does before drawing it enabled.`);
};

/* The one enabled control on these screens: a live action, with its handler and the founder's sentence
   tied to it. It may be disabled by its caller for a moment — nothing typed to play, a reading already
   in flight, a choice that is already the one in force — and then it is described by the caller's own
   reason, never left mute. liveOf throws before anything is drawn when the record is not complete. */
export function LiveButton({ id, name, describedBy, onClick, disabled = false }: {
 id: string; name?: string; describedBy: string; onClick: () => void; disabled?: boolean;
}) {
 const action = actionOf(id);
 liveOf(action);
 return <button type="button" className="primary g1-live" onClick={onClick} disabled={disabled} aria-describedby={describedBy}>{name ?? action.label}</button>;
}
/* A live action's record, drawn once beside its button: who decided it, when, and the sentence. */
export function LiveSentence({ id, sentenceId }: { id: string; sentenceId: string }) {
 const live = liveOf(actionOf(id));
 return <p id={sentenceId} className="g1-live-why"><strong>Live since {live.since}, decided by the {live.decidedBy}.</strong> {live.sentence}</p>;
}

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

/* The plan's level selector (§7.5), drawn as a slider and held by its gate. It is not an <input>:
   a range with no value would rest at its midpoint and read as a level nobody set, and a field on
   these screens is never given a value while no vault exists. So the thumb is placed by a ratio of
   the caller's own contract numbers, handed to the sheet as a custom property that turns it into the
   percentage there — a GilbertOne screen types no digit but a 0 or a 1 — the whole thing is
   aria-disabled, and it moves nothing: it shows where the selector sits and what holds it, described
   by the gate's sentence like every other control here. Every number is the caller's contract's.
   The value's chip rides above the thumb on the same ratio, as the portal's live slider's does
   (Fields.tsx), so the two read as one control — one that moves and one that is held. */
export function GatedSlider({ id, label, min, max, value, valueText, ticks }: {
 id: string; label: string; min: number; max: number; value: number; valueText: string; ticks: readonly number[];
}) {
 const why = useId();
 const action = actionOf(id);
 assertOpen(action);
 const span = max - min;
 const ratio = span === 0 ? 0 : (value - min) / span;
 return <div className="g1-action">
  <div className="pt-slider" style={{ '--pt-ratio': ratio } as CSSProperties}>
   <div className="pt-slider-top">
    <span className="g1-tag">{gateOf(action.gate).label}</span>
   </div>
   <div className="pt-slider-rail"><span className="pt-slider-chip">{valueText}</span></div>
   <div className="pt-range" role="slider" aria-label={label} aria-disabled="true"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText} aria-describedby={why}>
    <span className="pt-range-track">
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
  <input type={kind} disabled autoComplete="off" className="fc-text" aria-describedby={hint ? hintId : undefined}/>
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
