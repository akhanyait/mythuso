import { Check, Circle, X } from 'lucide-react';
import type { BookingState, Refund } from '../../../../packages/engines/src/access/domain/booking.ts';
import { acceptedBy, asapStaysRequested, bookingStates, refundedWords, statusHeading, statusWords } from '../lib/booking';
import { money } from '../lib/catalog';
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

/* A refund is said under a cancelled booking only when payment.refunded@1 recorded one, with Money's amount: a
   cancelled booking that was never paid says nothing about money. The amount is formatted with the patient's own
   rand formatter, never worked out; a refund is the whole payment of a catalogue price, which is whole rand. */
export function BookingStatus({ history, asap, refund }: { history: StatusHistory; asap: boolean; refund?: Refund }) {
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
  {current === 'cancelled' && refund && <p className="helper booking-refunded" role="status"><strong>{refundedWords.name} · {money(refund.amountCents / 100)}</strong> {refundedWords.words}</p>}
  {current === 'confirmed' && <p className="helper">{acceptedBy}</p>}
  {current === 'requested' && asap && <p className="helper">{asapStaysRequested}</p>}
 </section>;
}
