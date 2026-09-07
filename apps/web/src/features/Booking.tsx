import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleAlert, Clock3, CreditCard, Hourglass, MapPin, ShieldCheck, X, Zap } from 'lucide-react';
import { type Service, money } from '../lib/catalog';
import { Pill, ServiceIcon } from '../components/UI';
import { StepHead } from '../components/Steps';
import { endTime, kinds, labels, longDateOf, offeredDays, ruleById, slots, type Visit } from '../lib/scheduling';
import {
 cancellation, cost, estimate, hold, isHeld, labels as interpreting, modes as interpreterModes,
 resolve, statusFor, useSaslRequirement, waitSentence
} from '../lib/interpreting';
/* Booking, and the four things it used to lose.
 *
 * The date strip was five hand-typed labels starting "Fri 12 Sep" — a weekday that had not matched
 * its date since the day it was written. The visit ended an hour after it started whatever the
 * service catalogue said it lasted. The confirmation handed on a time and dropped the date
 * entirely, so "my visits" knew when in the day but not which day. And an arrival estimate sat
 * under a date picker, answering a question nobody who is choosing next Thursday has asked.
 *
 * The days now come from the device clock in Africa/Johannesburg and the weekday is asked of its
 * own date. The end comes from service.duration. The whole choice travels in one Visit. And the
 * estimate belongs to the one kind of booking it describes.
 *
 * The fifth thing it did not do at all: a Deaf patient could book an hour at which no interpreter
 * existed, and the booking would confirm. It cannot now. When the account records the SASL
 * requirement, the hour chosen is resolved against the interpreter roster before anything is
 * confirmed, and a visit with nobody to interpret it is held rather than dispatched — because a
 * nurse arriving at a door where nothing can be said is not a visit that half worked. The wait is
 * shown when there is one and admitted when there is not, and the way out of it costs nothing and
 * is recorded against MyThuso rather than against the patient. */
export type DemoVisit = Visit;
const payments = [['Card', 'Visa ending 4242', CreditCard], ['Cash', 'Pay the nurse after the visit', CreditCard], ['Thuso Wallet', 'Demo balance R500.00', CreditCard]] as const;
const stepLabels = ['Who & where', 'When', 'Payment', 'Review'];

export function Booking({ service, onComplete }: { service: Service; onComplete: (visit: DemoVisit) => void }) {
 const [step, setStep] = useState(0);
 const [person, setPerson] = useState('Lerato Molefe');
 const [address, setAddress] = useState('Home visit · Sandton');
 const [kind, setKind] = useState<'scheduled' | 'asap'>('scheduled');
 /* Computed once per booking rather than per render, so the strip cannot shift under somebody
    who opened the app just before midnight. */
 const days = useMemo(() => offeredDays(), []);
 const [date, setDate] = useState(days[0].iso);
 const [slot, setSlot] = useState('09:00');
 const [payment, setPayment] = useState('Card');
 const [consent, setConsent] = useState(false);
 const [done, setDone] = useState<Visit | null>(null);
 const [cancelled, setCancelled] = useState(false);
 /* Not asked here. The requirement lives on the account, set once in the language dialog, because a
    Deaf patient does not re-declare themselves at every booking. */
 const [saslRequired] = useSaslRequirement();
 const [mode, setMode] = useState(interpreterModes[0].id);
 const ends = endTime(slot, service.duration);
 const scheduled = kind === 'scheduled';
 /* An "as soon as somebody is free" visit has no hour to resolve against, so it is resolved against
    the soonest one the app offers at all. Asking the roster nothing and dispatching anyway is the
    branch this whole block exists to remove. */
 const askDate = scheduled ? date : days[0].iso;
 const askSlot = scheduled ? slot : slots[0];
 const outcome = saslRequired ? resolve(mode, askDate, askSlot) : null;
 const baseStatus: Visit['status'] = scheduled ? 'Confirmed' : 'Looking for a nurse';
 const visit: Visit = {
  service, person, address, kind, payment,
  date: scheduled ? date : undefined,
  start: scheduled ? slot : undefined,
  status: outcome ? statusFor(outcome, baseStatus) : baseStatus,
  interpreter: outcome
   ? { mode, name: outcome.found?.interpreter.name, iso: outcome.found?.iso, slot: outcome.found?.slot }
   : undefined
 };

 /* A held visit does not get the confirmation screen. It says it is waiting, says what for, and
    offers the way out first — free, at any moment, and recorded against MyThuso rather than
    against the person who asked for an accommodation. */
 if (done && done.status === hold.status) return <div className="success interp-held">
  <div className="tc-outcome-icon"><Hourglass size={30}/></div>
  <h3>{hold.title}</h3>
  <p>{service.name} for {person.split(' ')[0]}</p>
  <p className="success-when">{done.date ? <>{longDateOf(done.date)}<br/>{done.start}</> : labels.asapPending}</p>
  <p className="helper">{outcome ? waitSentence(outcome, longDateOf) : estimate.unknown}</p>
  <p className="helper">{hold.sentence}</p>
  <div className="review-line"><span>Cancelling costs</span><strong>R{cancellation.fee.toFixed(2)}</strong></div>
  <p className="helper">{cancellation.sentence}</p>
  <p className="helper">{cancellation.notThePatientsChoice}</p>
  <button className="secondary full space-top" onClick={() => setCancelled(true)} disabled={cancelled}><X size={16}/>{cancellation.label}</button>
  {cancelled && <p className="helper" role="status">Recorded against {cancellation.attributedTo}, not against the patient. {cancellation.keepsTheRequirement}</p>}
  <button className="primary full" onClick={() => onComplete(done)}>View my visits<ArrowRight size={17}/></button>
 </div>;

 if (done) return <div className="success">
  <div className="success-icon"><Check size={30}/></div>
  <h3>Your demo visit is booked.</h3>
  <p>{service.name} for {person.split(' ')[0]}</p>
  <p className="success-when">{done.kind === 'scheduled' ? <>{longDateOf(done.date!)}<br/>{done.start} – {endTime(done.start!, service.duration)}</> : labels.asapPending}</p>
  {done.interpreter?.name && <p className="helper">Interpreting: {done.interpreter.name}. {cost.sentence}</p>}
  <p className="helper">{kinds.find(k => k.id === done.kind)!.confirmation}</p>
  <p className="helper">This is a preview. No nurse has been dispatched and no payment was taken.</p>
  <button className="primary full space-top" onClick={() => onComplete(done)}>View my visits<ArrowRight size={17}/></button>
 </div>;

 return <>
  <StepHead step={step + 1} total={4} label={stepLabels[step]}/>
  {step === 0 ? <div className="form-stack">
   <div className="booking-summary"><span className="service-icon"><ServiceIcon name={service.icon}/></span><div><h3>{service.name}</h3><p>{service.duration} min · Registered nurse</p></div><strong>{money(service.price)}</strong></div>
   <label>Who is this visit for?<select value={person} onChange={e => setPerson(e.target.value)}><option>Lerato Molefe</option><option>Nomsa Molefe</option><option>Thabo Molefe</option></select></label>
   <label>Visit location<input value={address} onChange={e => setAddress(e.target.value)} maxLength={160} required/></label>
   <p className="helper">Sample availability and proposal pricing. Tests, medicines and prescriptions may require separate arrangements.</p>
   <button className="primary full" disabled={address.trim().length < 5} onClick={() => setStep(1)}>Continue<ArrowRight size={17}/></button>
  </div> : step === 1 ? <div className="form-stack">
   <h3>{labels.chooseWhen}</h3>
   {/* Two different promises, chosen deliberately rather than inferred. */}
   <div className="choice-list" role="radiogroup" aria-label={labels.chooseWhen}>
    {kinds.map(option => <label key={option.id} className={`choice-row ${kind === option.id ? 'selected' : ''}`}>
     <input type="radio" name="booking-kind" checked={kind === option.id} onChange={() => setKind(option.id as 'scheduled' | 'asap')}/>
     <span className="service-icon">{option.id === 'asap' ? <Zap size={20}/> : <CalendarDays size={20}/>}</span>
     <span><strong>{option.name}</strong><small>{option.detail}</small></span>
    </label>)}
   </div>
   {scheduled ? <>
    <h3 className="space-top">{labels.scheduledHeading}</h3>
    <div className="date-strip" role="group" aria-label="Choose a date">
     {days.map(entry => <button key={entry.iso} type="button" aria-pressed={date === entry.iso}
      aria-label={`${entry.weekday} ${entry.day} ${entry.month}`}
      className={`date-chip ${date === entry.iso ? 'selected' : ''}`} onClick={() => setDate(entry.iso)}>
      <span>{entry.weekday}</span><strong>{entry.day}</strong><span>{entry.month}</span>
     </button>)}
    </div>
    <div className="time-grid" role="group" aria-label="Choose a time">
     {slots.map(t => <button key={t} type="button" aria-pressed={slot === t} className={`time-chip ${slot === t ? 'selected' : ''}`} onClick={() => setSlot(t)}>{t}</button>)}
    </div>
    <p className="helper" role="status">{longDateOf(date)} · {slot} – {ends} ({service.duration} minutes)</p>
   </> : <p className="eta-note" role="status"><Zap size={15}/>We look for the nearest nurse who is free. Nobody is dispatched in this preview.</p>}
   {/* The interpreter, asked about here rather than after the payment step, because it decides
       whether there is a visit at all and a person should not find that out after their card. */}
   {outcome && <div className="interp-booking">
    <h3 className="space-top">{interpreting.chooseMode}</h3>
    <fieldset className="tc-switch"><legend className="visually-hidden">{interpreting.chooseMode}</legend>
     {interpreterModes.map(m => <label key={m.id} className={mode === m.id ? 'selected' : ''}>
      <input type="radio" name="booking-interpreter-mode" checked={mode === m.id} onChange={() => setMode(m.id)}/><span>{m.name}</span></label>)}
    </fieldset>
    <div className={`interp-outcome ${outcome.kind}`} role="status">
     <span className="tc-avatar">{outcome.kind === 'matched' ? <Check size={20}/> : outcome.kind === 'held' ? <Hourglass size={20}/> : <CircleAlert size={20}/>}</span>
     <div>
      <strong>{outcome.kind === 'matched' ? interpreting.matched : `${interpreting.noneFree} — ${interpreting.heldBadge}`}</strong>
      <p className={outcome.kind === 'held-unknown' ? 'interp-unknown' : undefined}>{waitSentence(outcome, longDateOf)}</p>
      {isHeld(outcome) && <p>{hold.sentence}</p>}
      {outcome.kind === 'held-unknown' && <p className="helper">{estimate.unknownDetail}</p>}
     </div>
    </div>
   </div>}
   <div className="button-row"><button className="secondary" onClick={() => setStep(0)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStep(2)}>Continue<ArrowRight size={16}/></button></div>
  </div> : step === 2 ? <div className="form-stack">
   <h3>How would you like to pay?</h3>
   <div className="choice-list">{payments.map(([name, detail, Icon]) => <label key={name} className={`choice-row ${payment === name ? 'selected' : ''}`}>
    <input type="radio" name="payment" checked={payment === name} onChange={() => setPayment(name)}/>
    <span className="service-icon"><Icon size={20}/></span><span><strong>{name}</strong><small>{detail}</small></span>
   </label>)}</div>
   <div className="privacy-note"><ShieldCheck size={19}/>No card is stored and no payment is taken. Production payments run through a regulated provider, never through MyThuso directly.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(1)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStep(3)}>Continue<ArrowRight size={16}/></button></div>
  </div> : <div className="form-stack">
   <div className="booking-summary"><span className="service-icon"><ServiceIcon name={service.icon}/></span><div><h3>{service.name}</h3><p>{service.duration} min</p></div><strong>{money(service.price)}</strong></div>
   <div className="review-line"><span><CalendarDays size={15}/> Date</span><strong>{scheduled ? longDateOf(date) : kinds.find(k => k.id === 'asap')!.name}</strong></div>
   {scheduled ? <div className="review-line"><span><Clock3 size={15}/> Time</span><strong>{slot} – {ends}</strong></div> : null}
   <div className="review-line"><span><MapPin size={15}/> Location</span><strong>{address}</strong></div>
   <div className="review-line"><span>Patient</span><strong>{person}</strong></div>
   {outcome && <>
    <div className="review-line"><span>Interpreter</span><strong>{outcome.found ? `${outcome.found.interpreter.name} · ${interpreterModes.find(m => m.id === mode)!.name}` : interpreting.noneFree}</strong></div>
    <div className="review-line"><span>Status when booked</span><strong>{visit.status}</strong></div>
    {isHeld(outcome) && <p className="helper">{hold.whyNotDispatched}</p>}
   </>}
   <button className="text-button" onClick={() => setStep(1)}>{labels.changeDate}</button>
   <div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div><span className="rating">★ <strong>4.9</strong> (128 visits)</span></div>
   <div className="pay-row"><span className="service-icon"><CreditCard size={20}/></span><span>{payment === 'Card' ? '•••• 4242' : payment}</span><button className="text-button" onClick={() => setStep(2)}>Change</button></div>
   <label className="checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I understand this is a UI preview using fictional information.</span></label>
   <Pill>Demo booking · No charge</Pill>
   <button className="primary full" disabled={!consent} onClick={() => setDone(visit)}>Confirm &amp; book<ArrowRight size={16}/></button>
   <p className="helper">{ruleById('everything-survives-the-booking').sentence}</p>
   <button className="text-button" onClick={() => setStep(2)}><ArrowLeft size={15}/>Back</button>
  </div>}
 </>;
}
