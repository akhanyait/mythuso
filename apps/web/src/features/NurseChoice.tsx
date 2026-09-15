import { Ban, History, ShieldCheck, Users } from 'lucide-react';
import type { PersonChoice, PersonOptions } from '../../../../packages/engines/src/access/domain/booking.ts';
import { initialsOf } from '../lib/names';
import { badge, fill, optionWords, person } from '../lib/booking';
import './booking-access.css';

/* The step where a patient says which nurse they would like at the door.

   The ways of answering come first and read as one choice. The nurses who may be asked for by name are
   the second thing. The nurses who are not offered are last, drawn in full with the reason beside each
   name: a list that quietly drops the nurse somebody saw last month cannot tell them why she is missing.

   Nobody is offered without a current badge. That is the domain's refusal in personOptions, not a filter
   in this file. The badge is explained once above the list and named in words on each row, so its colour
   is never the only thing that says it.

   The nurse seen last time is asked for through the same radio group as anybody else. When she is not
   offered, her row becomes a sentence saying so and why, because continuity is a preference and never
   outranks a clearance that has lapsed. */

type Props = {
 options: PersonOptions;
 personName: string;
 choice: PersonChoice;
 onChoose: (next: PersonChoice) => void;
};

const firstNameOf = (name: string) => name.split(' ')[0] ?? name;

export function NurseChoice({ options, personName, choice, onChoose }: Props) {
 const first = firstNameOf(personName);
 const is = (kind: PersonChoice['kind'], nurseRef?: string) =>
  choice.kind === kind && (choice.kind === 'nearest' || choice.nurseRef === nurseRef);
 const nearest = optionWords('nearest');
 const previous = optionWords('previous');
 const named = optionWords('named');
 const earlier = options.previous;
 return <div className="form-stack nurse-choice">
  <div className="nurse-choice-head">
   <h3 id="nurse-choice-title">{person.heading}</h3>
   <p className="muted">{person.lead}</p>
  </div>

  <div className="choice-list" role="radiogroup" aria-labelledby="nurse-choice-title">
   <label className={`choice-row ${is('nearest') ? 'selected' : ''}`}>
    <input type="radio" name="booking-nurse" checked={is('nearest')} onChange={() => onChoose({ kind: 'nearest' })}/>
    <span className="service-icon"><Users size={20} aria-hidden="true"/></span>
    <span><strong>{nearest.name}</strong><small>{nearest.detail}</small></span>
   </label>
   {earlier?.offered
    ? <label className={`choice-row ${is('previous', earlier.candidate.nurseRef) ? 'selected' : ''}`}>
     <input type="radio" name="booking-nurse" checked={is('previous', earlier.candidate.nurseRef)}
      onChange={() => onChoose({ kind: 'previous', nurseRef: earlier.candidate.nurseRef })}/>
     <span className="service-icon"><History size={20} aria-hidden="true"/></span>
     <span><strong>{previous.name}</strong><small>{earlier.candidate.name} · {fill(person.worksIn, { zone: earlier.candidate.zone })}. {previous.detail}</small></span>
    </label>
    : <div className="choice-row nurse-previous-refused" role="note">
     <span className="service-icon"><History size={20} aria-hidden="true"/></span>
     <span><strong>{previous.name}</strong>
      <small>{earlier
       ? fill(person.previousNotOffered, { person: first, reason: earlier.candidate.notOfferedBecause ?? '' })
       : fill(person.noPrevious, { person: first })}</small></span>
    </div>}
  </div>

  <section className="nurse-named" aria-labelledby="nurse-named-title">
   <h4 id="nurse-named-title">{person.namedHeading}</h4>
   <p className="nurse-badge-key"><ShieldCheck size={16} aria-hidden="true"/><span><strong>{badge.name}.</strong> {badge.sentence}</span></p>
   <p className="helper">{named.detail}</p>
   <ul className="nurse-list" role="radiogroup" aria-labelledby="nurse-named-title">
    {options.offered.map(nurse => <li key={nurse.nurseRef}>
     <label className={`nurse-option ${is('named', nurse.nurseRef) ? 'selected' : ''}`}>
      <input type="radio" name="booking-nurse" checked={is('named', nurse.nurseRef)} onChange={() => onChoose({ kind: 'named', nurseRef: nurse.nurseRef })}/>
      <span className="avatar nurse-avatar" aria-hidden="true">{initialsOf(nurse.name)}</span>
      <span className="nurse-option-text"><strong>{nurse.name}</strong><small>{fill(person.worksIn, { zone: nurse.zone })}</small></span>
      <span className="nurse-option-badge"><ShieldCheck size={15} aria-hidden="true"/>{badge.name}</span>
     </label>
    </li>)}
   </ul>
   <p className="helper">{person.continuity}</p>
  </section>

  {options.notOffered.length > 0 && <section className="nurse-refused" aria-labelledby="nurse-refused-title">
   <h4 id="nurse-refused-title">{person.notOfferedHeading}</h4>
   <ul>{options.notOffered.map(nurse => <li key={nurse.nurseRef}>
    <Ban size={16} aria-hidden="true"/>
    <span><strong>{nurse.name}</strong> · {nurse.zone}<small>{nurse.notOfferedBecause}</small></span>
   </li>)}</ul>
  </section>}
 </div>;
}
