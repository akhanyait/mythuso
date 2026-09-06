import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, CreditCard, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { type Service, money } from '../lib/catalog';
import { Pill, ServiceIcon } from '../components/UI';
import { StepHead } from '../components/Steps';
export type DemoVisit = { service: Service; person: string; time: string; address: string };
const days = [['Fri', '12', 'Sep'], ['Sat', '13', 'Sep'], ['Sun', '14', 'Sep'], ['Mon', '15', 'Sep'], ['Tue', '16', 'Sep']];
const slots = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
const payments = [['Card', 'Visa ending 4242', CreditCard], ['Cash', 'Pay the nurse after the visit', CreditCard], ['Thuso Wallet', 'Demo balance R500.00', CreditCard]] as const;
const labels = ['Who & where', 'Date & time', 'Payment', 'Review'];
export function Booking({ service, onComplete }: { service: Service; onComplete: (visit: DemoVisit) => void }) {
 const [step, setStep] = useState(0);
 const [person, setPerson] = useState('Lerato Molefe');
 const [address, setAddress] = useState('Home visit · Sandton');
 const [day, setDay] = useState(0);
 const [slot, setSlot] = useState('09:00');
 const [payment, setPayment] = useState('Card');
 const [consent, setConsent] = useState(false);
 const [done, setDone] = useState(false);
 const when = `${days[day][0]} ${days[day][1]} ${days[day][2]} · ${slot}`;
 const endTime = `${String(Number(slot.slice(0, 2)) + 1).padStart(2, '0')}:00`;
 if (done) return <div className="success">
  <div className="success-icon"><Check size={30}/></div>
  <h3>Your demo visit is booked.</h3>
  <p>{service.name} for {person.split(' ')[0]}<br/>{when} – {endTime}</p>
  <p className="helper">This is a preview. No nurse has been dispatched and no payment was taken.</p>
  <button className="primary full space-top" onClick={() => onComplete({ service, person, time: `${slot} – ${endTime}`, address })}>View my visits<ArrowRight size={17}/></button>
 </div>;
 return <>
  <StepHead step={step + 1} total={4} label={labels[step]}/>
  {step === 0 ? <div className="form-stack">
   <div className="booking-summary"><span className="service-icon"><ServiceIcon name={service.icon}/></span><div><h3>{service.name}</h3><p>{service.duration} min · Registered nurse</p></div><strong>{money(service.price)}</strong></div>
   <label>Who is this visit for?<select value={person} onChange={e => setPerson(e.target.value)}><option>Lerato Molefe</option><option>Nomsa Molefe</option><option>Thabo Molefe</option></select></label>
   <label>Visit location<input value={address} onChange={e => setAddress(e.target.value)} maxLength={160} required/></label>
   <p className="helper">Sample availability and proposal pricing. Tests, medicines and prescriptions may require separate arrangements.</p>
   <button className="primary full" disabled={address.trim().length < 5} onClick={() => setStep(1)}>Continue<ArrowRight size={17}/></button>
  </div> : step === 1 ? <div className="form-stack">
   <h3>Choose a date and time</h3>
   <div className="date-strip" role="group" aria-label="Choose a date">
    {days.map(([name, date, month], i) => <button key={date} type="button" aria-pressed={day === i} className={`date-chip ${day === i ? 'selected' : ''}`} onClick={() => setDay(i)}>
     <span>{name}</span><strong>{date}</strong><span>{month}</span>
    </button>)}
   </div>
   <div className="time-grid" role="group" aria-label="Choose a time">
    {slots.map(t => <button key={t} type="button" aria-pressed={slot === t} className={`time-chip ${slot === t ? 'selected' : ''}`} onClick={() => setSlot(t)}>{t}</button>)}
   </div>
   <p className="eta-note"><Zap size={15}/>Average arrival time: within 60 minutes</p>
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
   <div className="review-line"><span><CalendarDays size={15}/> Date</span><strong>{days[day].join(' ')} 2026</strong></div>
   <div className="review-line"><span><Clock3 size={15}/> Time</span><strong>{slot} – {endTime}</strong></div>
   <div className="review-line"><span><MapPin size={15}/> Location</span><strong>{address}</strong></div>
   <div className="review-line"><span>Patient</span><strong>{person}</strong></div>
   <div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div><span className="rating">★ <strong>4.9</strong> (128 visits)</span></div>
   <div className="pay-row"><span className="service-icon"><CreditCard size={20}/></span><span>{payment === 'Card' ? '•••• 4242' : payment}</span><button className="text-button" onClick={() => setStep(2)}>Change</button></div>
   <label className="checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I understand this is a UI preview using fictional information.</span></label>
   <Pill>Demo booking · No charge</Pill>
   <button className="primary full" disabled={!consent} onClick={() => setDone(true)}>Confirm &amp; book<ArrowRight size={16}/></button>
   <p className="helper">You can cancel or reschedule up to 2 hours before the visit.</p>
   <button className="text-button" onClick={() => setStep(2)}><ArrowLeft size={15}/>Back</button>
  </div>}
 </>;
}
