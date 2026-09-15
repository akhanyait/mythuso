import { Check, Circle, X } from 'lucide-react';
import type { BookingState } from '../../../../packages/engines/src/access/domain/booking.ts';
import { acceptedBy, asapStaysRequested, bookingStates, statusHeading, statusWords } from '../lib/booking';
import './booking-access.css';

/* Where a booking stands, as the three states the contract draws and nothing in between.

   A timeline rather than a badge, because the question a person has is not only whether it is booked but
   what has happened and what is still waiting on somebody. Every state says in words whether it is done,
   is where the booking is now, or has not happened yet, and a reached state carries the time it was
   reached; the filled mark only repeats that. Cancelled is drawn only when it happened, because a visit
   that was never called off does not need a step reminding its patient that it could be. */

export type StatusHistory = readonly { readonly state: BookingState; readonly at: string }[];

const timeOf = (instant: string) =>
 new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));

export function BookingStatus({ history, asap }: { history: StatusHistory; asap: boolean }) {
 const current = history[history.length - 1]?.state ?? 'requested';
 const shown = bookingStates.filter(s => (s.id !== 'cancelled' || current === 'cancelled')
  && !(current === 'cancelled' && s.id === 'confirmed' && !history.some(h => h.state === 'confirmed')));
 return <section className="booking-status" aria-labelledby="booking-status-title">
  <h3 id="booking-status-title">{statusHeading}</h3>
  <ol className="status-timeline">
   {shown.map(state => {
    const reached = history.find(h => h.state === state.id);
    const now = current === state.id;
    return <li key={state.id} className={`${reached ? 'reached' : 'waiting'}${state.id === 'cancelled' ? ' is-cancelled' : ''}`} aria-current={now ? 'step' : undefined} data-state={state.id}>
     <span className="status-mark" aria-hidden="true">{reached ? (state.id === 'cancelled' ? <X size={14}/> : <Check size={14}/>) : <Circle size={12}/>}</span>
     <div>
      <p className="status-name">
       <strong>{state.name}</strong>
       <span className="status-standing">{now ? statusWords.current : reached ? statusWords.reached : statusWords.waiting}</span>
       {reached && <time dateTime={reached.at}>{timeOf(reached.at)}</time>}
      </p>
      <p className="status-words">{state.patientWords}</p>
     </div>
    </li>;
   })}
  </ol>
  {current === 'confirmed' && <p className="helper">{acceptedBy}</p>}
  {current === 'requested' && asap && <p className="helper">{asapStaysRequested}</p>}
 </section>;
}
