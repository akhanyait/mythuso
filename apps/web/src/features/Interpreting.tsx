import { useMemo, useState } from 'react';
import { Ban, CalendarClock, Check, CircleAlert, Hand, Hourglass, ShieldCheck, UserCheck, X } from 'lucide-react';
import { EmptyNote, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { longDateOf, offeredDays, slots } from '../lib/scheduling';
import {
 accreditation, availability, cancellation, cost, hold, estimate, interpreterRole, labels, modes,
 notYetBuilt, refusals, resolve, roster, rules, ruleById, useSaslRequirement, waitSentence
} from '../lib/interpreting';
import { authorityById } from '../lib/vetting';
/* Interpreters, as a screen.
 *
 * The guidance for this already existed and was rendered on all three platforms; what did not exist
 * was any of it working. So the three parts of this screen are the three things that were missing,
 * in the order somebody would meet them.
 *
 * The roster, and the arithmetic on it. Four interpreters with real-shaped availability,
 * and one control that asks the only question that matters: if I ask for this hour, what happens?
 * The answer is one of three, and the third is the one worth building a screen for — nobody is free
 * and nobody can say when one will be. That state prints the contract's sentence rather than a
 * number, because there is no number, and printing the day that was asked for or a cheerful "soon"
 * is how a person ends up taking a morning off work for a visit that was never going to happen.
 *
 * The hold. A visit that needs an interpreter and has not got one is not confirmed and is not
 * dispatched — it waits, and it says on the face of it that it is waiting. And the way out of the
 * wait is free, at any point, with no notice period: the wait is not something the patient did, and
 * the cancellation is recorded against MyThuso rather than against them. That last sentence is the
 * one that is easy to leave out and is the difference between a service that can see its own
 * failures and one whose figures say nobody wanted the appointment.
 *
 * The refusals. A family member is never the interpreter and a child never is at all, and the
 * screen says why rather than merely making the option absent — an absent option teaches nobody,
 * and the person who needs the reason is the relative standing in the room offering to help.
 *
 * Nothing here contacts an interpreter, holds a real visit or books anybody's time. Every person on
 * the roster is fictional, and the accreditation route in the vetting table is drafted rather than
 * confirmed with the body it names. */
export function Interpreting() {
 const [required, setRequired] = useSaslRequirement();
 const [mode, setMode] = useState(modes[0].id);
 const days = useMemo(() => offeredDays(), []);
 const [iso, setIso] = useState(days[0].iso);
 const [slot, setSlot] = useState('09:00');
 const [cancelled, setCancelled] = useState(false);
 const outcome = resolve(mode, iso, slot);
 const free = availability(mode);
 const role = interpreterRole();
 const held = outcome.kind !== 'matched';

 return <section className="panel interpreting">
  <SectionTitle title={labels.heading}/>
  <p className="muted">{ruleById('one-roster').sentence}</p>

  <div className="setting-row">
   <span><strong>{labels.requirementOn}</strong><small>{ruleById('requirement-travels').sentence}</small></span>
   <button role="switch" aria-checked={required} aria-label={labels.requirementOn} className={`switch ${required ? 'on' : ''}`} onClick={() => { setRequired(!required); setCancelled(false); }}><span/></button>
  </div>
  <div className="privacy-note"><ShieldCheck size={21}/>{cost.sentence}</div>

  <SectionTitle title={labels.chooseMode}/>
  <fieldset className="tc-switch"><legend className="visually-hidden">{labels.chooseMode}</legend>
   {modes.map(m => <label key={m.id} className={mode === m.id ? 'selected' : ''}>
    <input type="radio" name="interpreting-mode" checked={mode === m.id} onChange={() => { setMode(m.id); setCancelled(false); }}/><span>{m.name}</span></label>)}
  </fieldset>
  <p className="helper">{modes.find(m => m.id === mode)!.detail} {modes.find(m => m.id === mode)!.note}</p>

  <SectionTitle title={labels.rosterHeading}/>
  <div className="interp-roster">
   {roster.filter(person => person.mode === mode).map(person => {
    const hours = free.filter(f => f.interpreter.id === person.id);
    return <div className="interp-person" key={person.id}>
     <span className="tc-avatar"><Hand size={18}/></span>
     <div>
      <strong>{person.name}<em>{accreditation.short} {person.reference}</em></strong>
      <small>{person.area} · {person.settings.join(', ')}</small>
      <small>{hours.length
       ? `Free ${hours.map(h => `${longDateOf(h.iso).replace(/,.*$/, '')} ${h.slot}`).join(' · ')}`
       : labels.modeUnavailable}</small>
     </div>
    </div>;
   })}
  </div>
  <p className="helper"><CalendarClock size={13}/>{estimate.horizonNote}</p>

  <SectionTitle title="Ask for an hour"/>
  <div className="date-strip" role="group" aria-label="Choose a date">
   {days.map(day => <button key={day.iso} type="button" aria-pressed={iso === day.iso}
    aria-label={`${day.weekday} ${day.day} ${day.month}`}
    className={`date-chip ${iso === day.iso ? 'selected' : ''}`} onClick={() => { setIso(day.iso); setCancelled(false); }}>
    <span>{day.weekday}</span><strong>{day.day}</strong><span>{day.month}</span>
   </button>)}
  </div>
  <div className="time-grid" role="group" aria-label="Choose a time">
   {slots.map(t => <button key={t} type="button" aria-pressed={slot === t} className={`time-chip ${slot === t ? 'selected' : ''}`} onClick={() => { setSlot(t); setCancelled(false); }}>{t}</button>)}
  </div>

  {/* Three outcomes and no fourth. The unknown one is a state with its own words rather than an
      empty version of the other two, because "we cannot say" is an answer and a blank is not. */}
  <div className={`interp-outcome ${outcome.kind}`} role="status">
   {outcome.kind === 'matched' ? <>
    <span className="tc-avatar"><Check size={20}/></span>
    <div><strong>{labels.matched}</strong>
     <p>{waitSentence(outcome, longDateOf)}</p>
     <p className="helper">The visit is confirmed with {outcome.found.interpreter.name} named on it.</p></div>
   </> : outcome.kind === 'held' ? <>
    <span className="tc-avatar"><Hourglass size={20}/></span>
    <div><strong>{labels.noneFree} — {labels.heldBadge}</strong>
     <p>{waitSentence(outcome, longDateOf)}</p>
     <p>{hold.sentence}</p>
     <p className="helper">{hold.whatHappensNext}</p></div>
   </> : <>
    <span className="tc-avatar"><CircleAlert size={20}/></span>
    <div><strong>{labels.noneFree} — {labels.heldBadge}</strong>
     <p className="interp-unknown">{estimate.unknown}</p>
     <p className="helper">{estimate.unknownDetail}</p></div>
   </>}
  </div>
  {held && <div className="tc-refusal"><Ban size={19}/><p>{hold.whyNotDispatched}</p></div>}

  {/* Free, at any point, and ours. Both halves are on the screen before the button rather than in
      a confirmation afterwards. */}
  {held && <div className="interp-cancel">
   <div className="review-line"><span>Cancelling costs</span><strong>R{cancellation.fee.toFixed(2)}</strong></div>
   <p className="helper">{cancellation.sentence}</p>
   <p className="helper">{cancellation.notThePatientsChoice}</p>
   <p className="helper">{cancellation.keepsTheRequirement}</p>
   <button className="secondary full" onClick={() => setCancelled(true)} disabled={cancelled}>
    <X size={16}/>{cancellation.label}</button>
   {cancelled && <p className="helper" role="status">Recorded against {cancellation.attributedTo}, not against the patient.</p>}
  </div>}

  <SectionTitle title={labels.vettingHeading}/>
  <p className="muted">{ruleById('vetted-like-anybody-else').sentence}</p>
  <div className="table-scroll">
   <table className="admin-table">
    <caption className="visually-hidden">Every check a SASL interpreter passes before they are on a roster</caption>
    <thead><tr><th scope="col">Check</th><th scope="col">Verified with</th><th scope="col">Renewed</th></tr></thead>
    <tbody>{(role?.checks ?? []).map(check => <tr key={check.id}>
     <th scope="row">{check.name}<small className="muted"> {check.detail}</small></th>
     <td>{authorityById(check.authority)?.short ?? check.authority}</td>
     <td>{check.renewMonths ? `Every ${check.renewMonths} months` : 'Once'}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <div className="privacy-note"><UserCheck size={21}/>{role?.grants[0].refusal}</div>
  {/* Drafted, and said so on the screen rather than in a commit message. The same rule the locale
      table is held to: a claim that something was checked needs a name, an organisation and a day. */}
  <div className="access-rule never"><CircleAlert size={19}/><span>
   <strong>{accreditation.body} ({accreditation.short}) — drafted, not confirmed</strong>
   {accreditation.route} {accreditation.uncertainty} {accreditation.whatWouldMakeItTrue}</span></div>

  <SectionTitle title={labels.refusalsHeading}/>
  {refusals.map(refusal => <div className="access-rule never" key={refusal.id}>
   <Ban size={19}/><span><strong>{refusal.title}</strong>{refusal.sentence}</span></div>)}

  <SectionTitle title="The rules this screen is built out of"/>
  {rules.map(rule => <div className="access-rule" key={rule.id}>
   <ShieldCheck size={19}/><span><strong>{rule.title}</strong>{rule.sentence}</span></div>)}

  <NotConnected of="interpreting"/>
  <EmptyNote>{notYetBuilt}</EmptyNote>
 </section>;
}
