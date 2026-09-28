import { useRef, useState } from 'react';
import { NotConnected } from '../components/NotConnected';
import { emptyLedger, stateWords } from '../../../../packages/engines/src/access/domain/booking.ts';
import { MAX_CHARACTERS, reply, startSession, ussdContract, type Session } from '../../../../packages/engines/src/access/domain/ussd.ts';
import type { Ledger } from '../../../../packages/engines/src/access/domain/booking.ts';
import { accessSettingsNow } from '../lib/settings';
import { subjectRefOf } from '../lib/names';
import { Button, Card, Field, Input } from '../ui';
import './ussd.css';

/* Booking by USSD, drawn because nothing dialled on a phone reaches MyThuso.
 *
 * The screen a feature phone would show, one reply at a time, walked by packages/engines/src/access/domain/ussd.ts —
 * the menu in packages/catalog/ussd.json and the booking rules POST /v1/access/bookings@2 answers with. Every word on
 * the handset is the contract's, every refusal is the contract's sentence for what the reply looked like, and a reply
 * is read once and dropped: nothing on this screen or in the session keeps what was typed.
 *
 * WHAT IT IS NOT. A USSD code: none is assigned, and the simulator says so instead of inventing one. A dialler: the
 * reply box is an ordinary field, and the capability's notice sits above it. A place to type anything about health:
 * the menu takes numbers, and the refusal says why a session is the wrong place for it.
 *
 * THE SCREEN. Set as text in a bordered panel rather than a drawing of a phone, so it reflows at 320px and at 200%
 * zoom and a screen reader reads it as the paragraph it is. The count of characters sits under it, because the limit
 * is the one fact about USSD that decides every sentence above. The session's wait is read once, when it is dialled,
 * from Access's setting in force, and a reply sent after it is refused by the walk, not by a timer on this screen:
 * nothing here counts down, so nothing here moves.
 *
 * Arrives on a dynamic import from Language & access. Nothing is dialled, sent or booked with a nurse.
 */
const words = ussdContract.simulator;
/* The demo patient the preview books as, by her subject reference and never by name, as a session found by the number
   it was dialled from would be. */
const DIALLER = 'Lerato Molefe';

export function UssdSimulator() {
 const [inForce] = useState(() => accessSettingsNow());
 const [session, setSession] = useState<Session | null>(null);
 const [screen, setScreen] = useState('');
 const [typed, setTyped] = useState('');
 const [booked, setBooked] = useState<string | null>(null);
 const ledger = useRef<Ledger>(emptyLedger);
 const replyRef = useRef<HTMLInputElement>(null);

 const dial = () => {
  ledger.current = emptyLedger;
  const step = startSession({ sessionRef: `ussd-preview-${Date.now()}`, subjectRef: subjectRefOf(DIALLER), now: new Date(), timeoutSeconds: inForce.ussdSessionSeconds, namedNurseFallback: inForce.namedNurseFallback });
  setSession(step.session); setScreen(step.screen); setBooked(null); setTyped('');
  replyRef.current?.focus();
 };
 const send = () => {
  if (!session) return;
  const step = reply(session, typed, { now: new Date(), ledger: ledger.current, namedNurseFallback: inForce.namedNurseFallback });
  if (step.booked) { ledger.current = step.booked.ledger; setBooked(step.booked.booking.bookingRef); }
  setSession(step.session); setScreen(step.screen);
  /* Cleared at once: what was typed is not kept, here any more than in the session. */
  setTyped('');
 };
 const end = () => { setSession(null); setScreen(''); setTyped(''); };
 const ended = session?.ended != null;

 return <section className="ussd" aria-labelledby="ussd-title">
  <Card padding="lg" className="ussd-card">
   <header className="ussd-head">
    <h2 id="ussd-title">{words.heading}</h2>
    <p>{words.intro}</p>
   </header>
   <NotConnected of={ussdContract.capability} tone="inline"/>
   <p className="ussd-code">{words.noCode}</p>

   <div className="ussd-body">
    <div className="ussd-handset">
     {session ? <>
      <p className="ussd-screen" role="status" aria-live="polite" data-testid="ussd-screen">{screen}</p>
      <p className="ussd-count">{words.counter.replace('{count}', String(screen.length)).replace('{max}', String(MAX_CHARACTERS))}</p>
     </> : <p className="ussd-idle">{words.waits.replace('{seconds}', String(inForce.ussdSessionSeconds))}</p>}
    </div>

    <form className="ussd-reply" onSubmit={e => { e.preventDefault(); send(); }}>
     <Field label={words.replyLabel} htmlFor="ussd-reply-input" hint={words.notKept}>
      <Input id="ussd-reply-input" ref={replyRef} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" disabled={!session || ended}/>
     </Field>
     {/* Keyed apart. Without keys React reuses the pressed "Start a session" element as "Send", turning it into a
         submit button while the press is still being handled, and the browser then submits an empty reply — so the
         first screen a person saw was "That is not one of the choices". A new element for each is never pressed twice. */}
     <div className="ussd-actions">
      {session && !ended ? <>
       <Button key="send" variant="primary" type="submit">{words.send}</Button>
       <Button key="end" variant="secondary" type="button" onClick={end}>{words.cancel}</Button>
      </> : <Button key="dial" variant="primary" type="button" onClick={dial}>{words.dial}</Button>}
     </div>
    </form>
   </div>

   {booked && <p className="ussd-booked" role="status">{stateWords('requested').patientWords}</p>}
  </Card>
 </section>;
}
