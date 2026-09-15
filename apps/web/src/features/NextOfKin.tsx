import { useState } from 'react';
import { UserMinus, UserPlus } from 'lucide-react';
import scheduling from '../../../../packages/catalog/scheduling.json';
import { NotConnected } from '../components/NotConnected';
import { clockOf, fill, type Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { nextOfKin, nominationStateOf } from '../../../../packages/engines/src/safety/domain/sos.ts';
import { nominateNextOfKin, patientNominations, useSosDesk, withdrawNextOfKin } from '../lib/sos-desk';
import { sosSettingsNow, useSettingsHistories } from '../lib/settings';
import './sos-press.css';

/* Next of kin, in the patient's privacy settings: nominate somebody with consent to the wording on this screen, and
 * withdraw them in one action.
 *
 * CONSENT IS TO THE WORDS SHOWN. The wording is packages/catalog/sos-press.json's, at its version, and the tick is the
 * patient's; without it the nomination is refused in the route's own sentence, which is shown rather than a disabled
 * button that explains nothing. What a next of kin would be told, and what they never would, is said before anybody is
 * named.
 *
 * THE TRIES AND THE WINDOW ARE THE SETTINGS IN FORCE. How many more times the desk may try, and for how long after a
 * press, are read from lib/settings.ts when the screen is drawn, never typed.
 *
 * A GUARDIAN IS REFUSED, AND THE REFUSAL IS SHOWN. Acting for somebody else is offered as its own button so that the
 * sentence a guardian is given can be read, because D-10 is open and no guardian authority is proven.
 *
 * Nothing is sent to anybody and no number is kept: the name stays in this tab's memory. */
const day = (at: number) => new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: scheduling.timezone });

export function NextOfKinSettings() {
 const s = useSosDesk();
 useSettingsHistories();
 const settings = sosSettingsNow();
 const [name, setName] = useState('');
 const [consented, setConsented] = useState(false);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const mine = patientNominations(s);
 const nominateAs = (asGuardian: boolean) => {
  const refusal = nominateNextOfKin({ name, consentGiven: consented, asGuardian });
  setRefused(refusal);
  if (!refusal) { setName(''); setConsented(false); }
 };
 return <div className="nok-settings">
  <p className="muted">{nextOfKin.intro}</p>
  <NotConnected of="messaging" tone="inline"/>
  <form className="form-stack" onSubmit={event => { event.preventDefault(); nominateAs(false); }}>
   <label>{nextOfKin.name}<input value={name} onChange={event => setName(event.target.value)} autoComplete="off"/></label>
   <p className="helper">{nextOfKin.nameHelp}</p>
   <blockquote className="nok-wording">{nextOfKin.consent.wording}</blockquote>
   <label className="nok-consent"><input type="checkbox" checked={consented} onChange={() => setConsented(!consented)}/><span>{nextOfKin.consent.tick}</span></label>
   <p className="helper">{fill(nextOfKin.tries, { retries: String(settings.alertRetries), minutes: String(settings.alertWindowMinutes) })}</p>
   <div className="button-row">
    <button className="primary" type="submit" disabled={!name.trim()}><UserPlus size={16} aria-hidden="true"/>{nextOfKin.nominate}</button>
    <button className="secondary" type="button" disabled={!name.trim()} onClick={() => nominateAs(true)}>{nextOfKin.asGuardian}</button>
   </div>
  </form>
  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
  <ul className="nok-list">{mine.map(n => {
   const withdrawn = nominationStateOf(n, s.now) === 'withdrawn';
   return <li key={n.nominationRef} className={withdrawn ? 'is-withdrawn' : ''}>
    <strong>{s.names[n.contactRef]}</strong>
    <small>{withdrawn ? fill(nextOfKin.withdrawn, { at: clockOf(n.withdrawnAt!) }) : fill(nextOfKin.nominated, { at: clockOf(n.nominatedAt), expires: day(n.expiresAt) })}</small>
    {!withdrawn && <button className="secondary" onClick={() => setRefused(withdrawNextOfKin(n.nominationRef))}><UserMinus size={15} aria-hidden="true"/>{nextOfKin.withdraw}</button>}
   </li>;
  })}</ul>
 </div>;
}
