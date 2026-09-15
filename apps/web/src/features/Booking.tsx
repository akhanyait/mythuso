import { useEffect, useMemo, useRef, useState } from 'react';
import { useOffline } from '../components/States';
import { ClinicianProfile } from '../components/ClinicianProfile';
import { ArrowLeft, ArrowRight, Ban, Banknote, CalendarDays, CalendarClock, Check, CircleAlert, Clock3, CreditCard, Hourglass, MapPin, ShieldCheck, Undo2, X, Zap } from 'lucide-react';
import { type Service, money } from '../lib/catalog';
import { SectionTitle, ServiceIcon } from '../components/UI';
import { StepHead } from '../components/Steps';
import { NotConnected } from '../components/NotConnected';
import { endTime, kinds, labels, longDateOf, offeredDays, ruleById, slots, type Visit } from '../lib/scheduling';
import {
 cancellation, cost, estimate, hold, isHeld, labels as interpreting, modes as interpreterModes,
 resolve, statusFor, useSaslRequirement, waitSentence
} from '../lib/interpreting';
import { mayCancel, reasons, refusalById, reschedule, stateById, stateOf, windowSentence, wordsFor } from '../lib/cancelling';
/* No payment provider is contracted, so the money on this screen goes through Thuso Money's own
   ledger, with the simulated provider standing behind its locked door. It holds no card — it refuses
   to be handed one, even a fictional one — it prices the visit from the catalogue rather than from
   whatever the screen thought it was, keys every attempt so pressing Confirm twice is one payment, and
   roughly one attempt in five is declined, because a booking flow that has only ever seen an
   authorisation has no screen for the other answer. */
import { visitReference } from '../lib/simulation';
import { bookingLedger, methodByName, notOffered, payForVisit, visitMethods, type PaymentView } from '../lib/money';
import { areaOf, HOME_SUBURB, nurseFor } from '../lib/arrival';
import { offersFor } from '../lib/roster';
import { simulationOf } from '../lib/capabilities';
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
const stepLabels = ['Who', 'Where', 'When', 'Payment', 'Review'];

/* `person` is who the catalogue was opened for. A family profile's "Book a visit for Nomsa" reached
   this screen with the account holder selected, so the row promised the one thing the flow did not
   do. It is still a select — the choice is never taken away — it just starts on the right person. */
export function Booking({ service, person: forPerson, onComplete }: { service: Service; person?: string; onComplete: (visit: DemoVisit) => void }) {
 const [step, setStep] = useState(0);
 const offline = useOffline();
 const stepFocus = useRef<HTMLDivElement>(null);
 const previousStep = useRef(0);
 useEffect(() => { if (previousStep.current !== step) { stepFocus.current?.focus({ preventScroll: true }); const dialog = stepFocus.current?.closest('dialog'); if (dialog) dialog.scrollTop = 0; previousStep.current = step; } }, [step]);
 const [person, setPerson] = useState(forPerson ?? 'Lerato Molefe');
 /* A suburb the coverage contract actually names. It was Sandton, which packages/catalog/geography.json
    does not list, so a booking made here produced a visit no map in the product could draw. */
 const [address, setAddress] = useState(`Home visit · ${HOME_SUBURB}`);
 const [kind, setKind] = useState<'scheduled' | 'asap'>('scheduled');
 /* Computed once per booking rather than per render, so the strip cannot shift under somebody
    who opened the app just before midnight. */
 const days = useMemo(() => offeredDays(), []);
 const [date, setDate] = useState(days[0].iso);
 const [slot, setSlot] = useState('09:00');
 /* The ways to pay are packages/catalog/money.json's, by the name a person reads. */
 const [payment, setPayment] = useState(visitMethods[0].name);
 const [consent, setConsent] = useState(false);
 useEffect(() => { setConsent(false); }, [person, address, kind, date, slot, payment]);
 const [done, setDone] = useState<Visit | null>(null);
 const [cancelled, setCancelled] = useState(false);
 /* Not asked here. The requirement lives on the account, set once in the language dialog, because a
    Deaf patient does not re-declare themselves at every booking. */
 const [saslRequired] = useSaslRequirement();
 const [mode, setMode] = useState(interpreterModes[0].id);
 /* What the ledger said about this visit, and how many times it has been asked. A decline is a real
    answer rather than an error, so it lives beside the booking rather than in a catch: nothing is
    booked until money is authorised or cash is owed, and the screen has to be able to say that. The
    ledger is this booking's own and lives as long as the dialog, which is the whole of what the
    preview keeps. */
 const ledger = useMemo(() => bookingLedger(), []);
 const [paid, setPaid] = useState<PaymentView | null>(null);
 const [payAttempt, setPayAttempt] = useState(0);
 const ends = endTime(slot, service.duration);
 const scheduled = kind === 'scheduled';
 /* Who this visit would be booked against. The roster is asked for the suburb the address names, and
    it answers with everybody it would offer and everybody it would not — the refusals travel beside
    the offers rather than being filtered out of them. */
 const booked = nurseFor(address);
 const { refused } = offersFor(areaOf(address));
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

 /* Every way to pay goes through the ledger, cash included. Card and EFT are answered by the simulated
    provider through the payment-result door. Cash waits, with a code for the patient, and is recorded
    as paid only when the nurse enters it after the visit — so the visit is booked with money owed,
    which is more honest than booking it as though nothing were. */
 const method = methodByName(payment) ?? visitMethods[0];
 const reference = visitReference(visit);
 const confirm = () => {
  if (offline) return;
  const attempt = payAttempt + 1;
  setPayAttempt(attempt);
  const result = payForVisit(ledger, reference, service.id, method.id, attempt);
  setPaid(result);
  /* Booked on an authorisation, or on cash waiting for its code. A visit confirmed over a declined
     payment is the one outcome a booking screen must not produce: a nurse dispatched against nothing. */
  if (result.refused === undefined && (result.state === 'succeeded' || (result.method === 'cash-otp' && result.state === 'pending'))) setDone(visit);
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
  <h3>Your visit is booked.</h3>
  <p>{service.name} for {person.split(' ')[0]}</p>
  <p className="success-when">{done.kind === 'scheduled' ? <>{longDateOf(done.date!)}<br/>{done.start} – {endTime(done.start!, service.duration)}</> : labels.asapPending}</p>
  {done.interpreter?.name && <p className="helper">Interpreting: {done.interpreter.name}. {cost.sentence}</p>}
  <p className="helper">{kinds.find(k => k.id === done.kind)!.confirmation}</p>
  {/* What the ledger answered, as a record rather than as a tick: the payment's state in the contract's
      words, and then either the provider's receipt — which begins SIM-, because the simulator refuses
      to produce one that does not say it is simulated — or the cash code the nurse will ask for. */}
  {paid && paid.refused === undefined ? <>
   <SectionTitle title={paid.method === 'cash-otp' ? 'What is owed' : 'What was paid'}/>
   <div className="review-line pay-status"><span>Payment</span><strong>{paid.stateName}</strong></div>
   <p className="helper pay-words">{paid.words}</p>
   {paid.method === 'cash-otp' ? <>
    <div className="review-line"><span>Owed at the door</span><strong>{money(paid.amount)}</strong></div>
    <div className="review-line cash-code"><span>Your cash code</span><strong>{paid.cashCode}</strong></div>
   </> : <>
    <div className="review-line"><span>Authorised</span><strong>{money(paid.amount)}</strong></div>
    <div className="review-line"><span>Receipt</span><strong>{paid.receipt}</strong></div>
   </>}
   <div className="review-line"><span>{paid.method === 'cash-otp' ? 'To be paid by' : 'Paid by'}</span><strong>{done.payment}</strong></div>
   <div className="review-line"><span>Visit reference</span><strong>{reference}</strong></div>
  </> : null}
  <NotConnected of="payments"/>
  <div className="nurse-row"><span className="avatar nurse-avatar">{booked.initials}</span><div><strong>{booked.name}</strong><span>{booked.role} · {booked.area}</span></div></div>
  <NotConnected of="booking"/>
  <button className="primary full space-top" onClick={() => onComplete(done)}>View my visits<ArrowRight size={17}/></button>
 </div>;

 return <>
  <aside className="journey-summary" aria-label="Your booking summary">
   <span className="service-icon"><ServiceIcon name={service.icon}/></span>
   <div><strong>{service.name}</strong><small>{person.split(' ')[0]} · {service.duration} min{step > 2 ? ` · ${scheduled ? `${slot}, ${longDateOf(date)}` : 'As soon as available'}` : ''}</small></div>
   <strong>{money(service.price)}</strong>
  </aside>
  <div ref={stepFocus} tabIndex={-1} className="journey-step-focus"><StepHead step={step + 1} total={5} label={stepLabels[step]}/></div>
  {offline && <div className="journey-connection" role="status"><CircleAlert size={19}/><span>You’re offline. Your choices stay here while this booking is open. Reconnect to confirm; you can continue reviewing your details.</span></div>}
  {step === 0 ? <div className="form-stack">
   <div className="booking-summary"><span className="service-icon"><ServiceIcon name={service.icon}/></span><div><h3>{service.name}</h3><p>{service.duration} min · Registered nurse</p></div><strong>{money(service.price)}</strong></div>
   <label>Who is this visit for?<select value={person} onChange={e => setPerson(e.target.value)}><option>Lerato Molefe</option><option>Nomsa Molefe</option><option>Thabo Molefe</option></select></label>
   <p className="helper">Choose the person receiving care. Their record stays separate from yours.</p>
   <button className="primary full" onClick={() => setStep(1)}>Continue<ArrowRight size={17}/></button>
  </div> : step === 1 ? <div className="form-stack">
   <h3>Where should the visit take place?</h3>
   <label>Visit location<input value={address} onChange={e => setAddress(e.target.value)} maxLength={160} required/></label>
   <p className="helper">Sample availability and proposal pricing. Tests, medicines and prescriptions may require separate arrangements.</p>
   <div className="button-row"><button className="secondary" onClick={() => setStep(0)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={address.trim().length < 5} onClick={() => setStep(2)}>Continue<ArrowRight size={17}/></button></div>
  </div> : step === 2 ? <div className="form-stack">
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
   </> : <p className="eta-note" role="status"><Zap size={15}/>We look for the nearest nurse who is free and cleared for this service.</p>}
   {/* The interpreter, asked about here rather than after the payment step, because it decides
       whether there is a visit at all and a person should not find that out after their card. */}
   {outcome && <div className="interp-booking">
    <h3 className="space-top">{interpreting.chooseMode}</h3>
    {/* The interpreting capability names `booking` as one of its surfaces, and this block is where
        it appears: a named person, on a mode, at an hour. The screen's own notice is about booking a
        visit and says nothing about the interpreter, and a simulation that is quieter than an
        absence is the disclosure failure the contract's `a-simulation-says-so` rule is written
        against. Inline, inside this card, because one notice per screen means one per thing. */}
    <NotConnected of="interpreting" tone="inline"/>
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
   <div className="button-row"><button className="secondary" onClick={() => setStep(1)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStep(3)}>Continue<ArrowRight size={16}/></button></div>
  </div> : step === 3 ? <div className="form-stack">
   <h3>How would you like to pay?</h3>
   {/* Named and described by the contract. No card is shown here, not even the last four digits of a
       made-up one: a fragment of a card number on a screen is a fragment in a screenshot, and the
       payment-result door refuses the same fragment by name. */}
   <div className="choice-list">{visitMethods.map(m => <label key={m.id} className={`choice-row ${payment === m.name ? 'selected' : ''}`}>
    <input type="radio" name="payment" checked={payment === m.name} onChange={() => setPayment(m.name)}/>
    <span className="service-icon">{m.id === 'cash-otp' ? <Banknote size={20}/> : <CreditCard size={20}/>}</span><span><strong>{m.name}</strong><small>{m.detail}</small></span>
   </label>)}</div>
   {notOffered.map(m => <p className="helper not-offered" key={m.id}><Ban size={13}/><span>{m.name}: {m.notOfferedBecause}</span></p>)}
   {/* The sentence about what happens to money comes from the payments capability rather than from
       this screen. It used to be typed here — "no payment is taken" — and it went on being typed
       here after a simulated provider started answering, which is the failure the third state was
       introduced to prevent: a screen that stops being accurate without stopping speaking. */}
   <NotConnected of="payments"/>
   <div className="privacy-note"><ShieldCheck size={19}/>No card is stored, here or anywhere else in MyThuso. Production payments run through a regulated provider, never through MyThuso directly.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(2)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStep(4)}>Continue<ArrowRight size={16}/></button></div>
  </div> : <div className="form-stack">
   <div className="review-line"><span><CalendarDays size={15}/> Date</span><strong>{scheduled ? longDateOf(date) : kinds.find(k => k.id === 'asap')!.name}</strong></div>
   {scheduled ? <div className="review-line"><span><Clock3 size={15}/> Time</span><strong>{slot} – {ends}</strong></div> : null}
   <div className="review-line"><span><MapPin size={15}/> Location</span><strong>{address}</strong></div>
   <div className="review-line"><span>Patient</span><strong>{person}</strong></div>
   {/* The reference, before the money rather than only after it. It was on the receipt alone, which
       meant a person deciding whether to pay could not quote the thing they were paying for, and a
       declined payment showed no reference at all — the one moment somebody most wants one to give
       over the phone. It is worked out from the visit rather than issued, so it exists here already. */}
   <div className="review-line"><span>Visit reference</span><strong>{reference}</strong></div>
   {outcome && <>
    <div className="review-line"><span>Interpreter</span><strong>{outcome.found ? `${outcome.found.interpreter.name} · ${interpreterModes.find(m => m.id === mode)!.name}` : interpreting.noneFree}</strong></div>
    <div className="review-line"><span>Status when booked</span><strong>{visit.status}</strong></div>
    {isHeld(outcome) && <p className="helper">{hold.whyNotDispatched}</p>}
   </>}
   <div className="journey-edit-links"><button className="text-button" onClick={() => setStep(0)}>Change person</button><button className="text-button" onClick={() => setStep(1)}>Change location</button><button className="text-button" onClick={() => setStep(2)}>{labels.changeDate}</button></div>
   {/* Somebody the roster would actually offer for this suburb, rather than one name printed on
       every booking in Johannesburg. She is the simulated roster's answer, gated by the same vetting
       the console decides with — and the people it will not offer are named underneath with the
       reason, because a list that quietly drops a suspended nurse cannot tell a patient why the
       person she saw last time is missing.

       What is gone from this row is a rating: "★ 4.9 (128 visits)" was invented, on the screen where
       a person decides whether to let somebody into their house, about a nurse who does not exist.
       Where she works is a fact the roster actually holds. */}
   <ClinicianProfile subject={booked.roster.subject} name={booked.name} role={booked.role} reference={booked.roster.reference} detail={`Working in ${booked.area}. This is the sample nurse offered for this visit.`}/>
   <p className="helper">{simulationOf('booking')!.supplier} {refused.length === 1 ? 'One nurse on it is not being offered:' : `${refused.length} nurses on it are not being offered:`}</p>
   <ul className="landing-list">{refused.map(({ nurse, refusal }) => <li key={nurse.id}><Ban size={16}/>{nurse.name} · {nurse.zoneName} — {refusal}</li>)}</ul>
   <div className="pay-row"><span className="service-icon">{method.id === 'cash-otp' ? <Banknote size={20}/> : <CreditCard size={20}/>}</span><span>{method.name}</span><button className="text-button" onClick={() => setStep(3)}>Change</button></div>
   {/* A real gate on a real step: the address and the person are what a nurse is sent to, and
       neither is worth getting wrong. It is not where this screen says what is connected — that
       sentence comes from the contract, above. */}
   <label className="checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>The address and the person above are correct, and I agree to the visit terms.</span></label>
   {/* A declined payment, in the words a person reads: the provider's reason, then the contract's
       sentence for a payment that did not go through. It is a state of this screen rather than a
       dialog, because the thing they now have to decide — pay another way, or try the same one
       again — is on this screen and nowhere else. */}
   {paid?.refused !== undefined ? <div className="privacy-note pay-refused"><CircleAlert size={19}/>{paid.refused}</div>
    : paid && paid.state === 'failed' ? <div className="privacy-note pay-declined" role="status">
      <CircleAlert size={19}/><span>{paid.declineReason} {paid.words}</span></div>
    : null}
   <NotConnected of="booking"/>
   <button className="primary full" disabled={!consent || offline} onClick={confirm}>{paid && paid.refused === undefined && paid.state === 'failed' ? <>Try the payment again<ArrowRight size={16}/></> : <>Confirm &amp; book<ArrowRight size={16}/></>}</button>
   <p className="helper">{ruleById('everything-survives-the-booking').sentence}</p>
   <button className="text-button" onClick={() => setStep(3)}><ArrowLeft size={15}/>Back</button>
  </div>}
 </>;
}

/* Moving a visit, and standing one down. Two screens that did not exist.
 *
 * "Reschedule" opened a dialog saying the workflow was on the roadmap, and there was no way to
 * cancel at all — on the one screen in the patient app where a person is most likely to need both.
 * A journey that can only be started is not a journey, and a visit you cannot get out of is worse
 * than one you never booked.
 *
 * Both are built from the pieces booking already uses: the offered days come from the device clock
 * in Africa/Johannesburg, the hours come from the contract's slots, and the end is arithmetic on the
 * service's own duration. Nothing about when a visit happens is typed twice. */
export function Reschedule({ visit, onMove }: { visit: DemoVisit; onMove: (date: string, slot: string) => void }) {
 const days = useMemo(() => offeredDays(), []);
 const [date, setDate] = useState(days[0].iso);
 const [slot, setSlot] = useState(visit.start ?? slots[0]);
 const [moved, setMoved] = useState<{ date: string; slot: string } | null>(null);
 const ends = endTime(slot, visit.service.duration);
 const unchanged = date === visit.date && slot === visit.start;

 if (moved) return <div className="success">
  <div className="success-icon"><CalendarClock size={30}/></div>
  <h3>Your visit has moved.</h3>
  <p>{visit.service.name} for {visit.person.split(' ')[0]}</p>
  <p className="success-when">{longDateOf(moved.date)}<br/>{moved.slot} – {endTime(moved.slot, visit.service.duration)}</p>
  {visit.date && visit.start && <p className="helper">It was {longDateOf(visit.date)} at {visit.start}. That hour is given back.</p>}
  <p className="helper">{ruleById('everything-survives-the-booking').sentence}</p>
  <NotConnected of="booking"/>
  <button className="primary full space-top" onClick={() => onMove(moved.date, moved.slot)}>View my visits<ArrowRight size={17}/></button>
 </div>;

 return <div className="form-stack">
  <div className="booking-summary"><span className="service-icon"><ServiceIcon name={visit.service.icon}/></span><div><h3>{visit.service.name}</h3><p>{visit.person} · {visit.address}</p></div><strong>{money(visit.service.price)}</strong></div>
  <div className="review-line"><span><Clock3 size={15}/> Booked for</span><strong>{visit.date && visit.start ? `${longDateOf(visit.date)} · ${visit.start}` : labels.asapPending}</strong></div>
  <h3 className="space-top">{labels.scheduledHeading}</h3>
  <div className="date-strip" role="group" aria-label="Choose a new date">
   {days.map(entry => <button key={entry.iso} type="button" aria-pressed={date === entry.iso}
    aria-label={`${entry.weekday} ${entry.day} ${entry.month}`}
    className={`date-chip ${date === entry.iso ? 'selected' : ''}`} onClick={() => setDate(entry.iso)}>
    <span>{entry.weekday}</span><strong>{entry.day}</strong><span>{entry.month}</span>
   </button>)}
  </div>
  <div className="time-grid" role="group" aria-label="Choose a new time">
   {slots.map(t => <button key={t} type="button" aria-pressed={slot === t} className={`time-chip ${slot === t ? 'selected' : ''}`} onClick={() => setSlot(t)}>{t}</button>)}
  </div>
  <p className="helper" role="status">{longDateOf(date)} · {slot} – {ends} ({visit.service.duration} minutes)</p>
  {/* A nurse is cleared for an hour, not attached to a person, so moving the hour is a new
      assignment. Saying so here is the difference between a reschedule and a promise nobody made. */}
  <div className="privacy-note"><ShieldCheck size={19}/>Moving a visit asks for a nurse who is free at the new hour. It may not be the same nurse, and you are told who is coming before anybody sets off.</div>
  <NotConnected of="booking"/>
  <button className="primary full" disabled={unchanged} onClick={() => setMoved({ date, slot })}>{unchanged ? 'Choose a different day or hour' : <>Move this visit<ArrowRight size={17}/></>}</button>
 </div>;
}

/* The reasons, the window and every sentence below come from packages/catalog/cancellation.json.
   They were the component's own words until this evening, which was the third different version of
   a cancellation right across three platforms — both native apps promised a window and offered no
   control, and this screen offered the control and never mentioned the window. */
const cancelReasons = reasons.map(r => r.text);
export function CancelVisit({ visit, onCancel }: { visit: DemoVisit; onCancel: (reason: string) => void }) {
 const [reason, setReason] = useState<string>(cancelReasons[0]);
 const [done, setDone] = useState<string | null>(null);
 const state = stateOf(visit.date, visit.start);
 /* The contract refuses one of the three states, and the screen has to refuse it too. A visit that
    has already started is a clinical event happening in somebody's house — a booking screen cannot
    end it, and offering the button anyway is how a person taps cancel while a nurse is standing in
    front of them and then does not know what has happened. This became reachable rather than
    theoretical when the sample visits moved to today. */
 if (!mayCancel(state)) {
  const refused = stateById(state);
  return <div className="form-stack">
   <div className="booking-summary"><span className="service-icon"><ServiceIcon name={visit.service.icon}/></span>
    <div><h3>{visit.service.name}</h3><p>{visit.person} · {visit.address}</p></div></div>
   <h3>{refused.name}</h3>
   <p>{refused.patientWords}</p>
   <p className="helper">{refused.detail}</p>
   <NotConnected of="booking"/>
  </div>;
 }

 if (done) return <div className="success">
  <div className="success-icon"><Undo2 size={30}/></div>
  <h3>This visit is cancelled.</h3>
  <p>{visit.service.name} for {visit.person.split(' ')[0]}</p>
  <p className="success-when">{visit.date && visit.start ? <>{longDateOf(visit.date)}<br/>{visit.start}</> : labels.asapPending}</p>
  <div className="review-line"><span>Reason recorded</span><strong>{done}</strong></div>
  <div className="review-line"><span>What was to be paid</span><strong>{money(visit.service.price)} · {visit.payment}</strong></div>
  <p className="helper">{wordsFor(state)}</p>
  <p className="helper">A cancelled visit is not deleted. It stays under Cancelled with the reason you gave, because a visit that vanishes is one nobody can ask about afterwards.</p>
  <NotConnected of="booking"/>
  <NotConnected of="payments"/>
  <button className="primary full space-top" onClick={() => onCancel(done)}>View my visits<ArrowRight size={17}/></button>
 </div>;

 return <div className="form-stack">
  <div className="booking-summary"><span className="service-icon"><ServiceIcon name={visit.service.icon}/></span><div><h3>{visit.service.name}</h3><p>{visit.person} · {visit.address}</p></div><strong>{money(visit.service.price)}</strong></div>
  <div className="review-line"><span><Clock3 size={15}/> Booked for</span><strong>{visit.date && visit.start ? `${longDateOf(visit.date)} · ${visit.start}` : labels.asapPending}</strong></div>
  {/* Which side of the window this visit is on, worked out from its own date and time. A late
      cancellation is never refused — the alternative to letting somebody cancel late is a nurse
      arriving at a door nobody opens — but it is named, because a nurse may already be travelling. */}
  <div className="privacy-note"><Clock3 size={19}/>{windowSentence}{state === 'inside-window' && <> {stateById('inside-window').detail}</>}</div>
  <h3>Why are you cancelling?</h3>
  <p className="muted">{refusalById('no-reason-required').sentence}</p>
  <div className="choice-list" role="radiogroup" aria-label="Why are you cancelling?">
   {cancelReasons.map(r => <label key={r} className={`choice-row ${reason === r ? 'selected' : ''}`}>
    <input type="radio" name="cancel-reason" checked={reason === r} onChange={() => setReason(r)}/>
    <span><strong>{r}</strong></span>
   </label>)}
  </div>
  {/* "What happens to the money" is the question a person actually has here, and it gets a heading
      rather than a footnote. The answer is two facts and no invention: what this visit was going to
      cost, how it was going to be paid, and the payments contract's own sentence about whether any
      of it has happened. When a provider is connected that sentence disappears from here and from
      every other screen at the same moment, which is the only way this stays true. */}
  <SectionTitle title="What happens to the money"/>
  <div className="review-line"><span>This visit</span><strong>{money(visit.service.price)}</strong></div>
  <div className="review-line"><span>Was to be paid by</span><strong>{visit.payment}</strong></div>
  <NotConnected of="payments"/>
  {/* Moving is offered before cancelling, once, because a person who wanted a different day and was
      shown nothing but a cancel button cancels. */}
  <p className="helper"><CalendarClock size={15}/>{reschedule.sentence} Close this and choose Reschedule.</p>
  <NotConnected of="booking"/>
  <button className="secondary full sign-out" onClick={() => setDone(reason)}><X size={16}/>Cancel this visit</button>
 </div>;
}
