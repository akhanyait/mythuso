import { useState } from 'react';
import { Ban, Clock3, MapPin, Siren } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button, Card } from '../ui';
import { OfficeNote } from '../surface/Office';
import { clockOf, fill, type Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { notSentSentence, sosEngine, standDownReasons, statusLabel, type SosDeskRow } from '../../../../packages/engines/src/safety/domain/sos.ts';
import { failureById, outcomeById } from '../lib/sos';
import { concernOf, deskRowsOf, readArea, tryNextOfKinAgain, useSosDesk, zoneName } from '../lib/sos-desk';
import './sos-desk.css';

/* The desk's view of patients who pressed SOS.
 *
 * WHAT THE DESK SEES IS GET /v1/safety/sos@1, EXACTLY. When SOS was pressed, the door the answers pointed to, whether it
 * was stood down and why, the concern Core holds for it, and whether next of kin could be told. Never who pressed it,
 * never what was ticked or whether anything was, and never a plan: the row has no field for any of them, and this screen
 * reaches for none. The area is not on the row either. It is read by pressing a button, through the one rule that
 * refuses it once its window has closed, so the desk is told it is no longer shared rather than shown where somebody was.
 *
 * NEXT OF KIN ARE NEVER SHOWN AS TOLD. Every attempt says not sent and why, and trying again records another attempt
 * that says the same, inside the window and the tries the press was made under — or is refused in the route's own
 * sentence. The tries are numbers the settings in force gave the press, never typed here. */
const say = sosEngine.desk;
const stateLabel = (id: string) => sosEngine.states.find(s => s.id === id)?.label ?? id;
const reasonLabel = (id: string) => standDownReasons.find(r => r.id === id)?.label ?? id;

export function SosDesk() {
 const s = useSosDesk();
 const rows = deskRowsOf(s);
 return <section className="oi-section sos-desk" aria-labelledby="sos-desk-title">
  <div className="oi-head">
   <h2 id="sos-desk-title" className="oi-section-title">{say.heading}</h2>
   <p className="oi-lead">{say.intro}</p>
  </div>
  {rows.length === 0
   ? <OfficeNote icon={<Siren aria-hidden="true"/>} role="status">{say.empty}</OfficeNote>
   : <Card><ol className="oi-rows sos-desk-list">{rows.map(row => <SosDeskItem key={row.sosRef} row={row}/>)}</ol></Card>}
  {/* The emergency notice is the field-safety desk's, above this one on the same screen: one notice per capability. */}
  <NotConnected of="messaging" tone="inline"/>
 </section>;
}

function SosDeskItem({ row }: { row: SosDeskRow }) {
 const [area, setArea] = useState<string | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const concern = concernOf(row);
 const look = () => {
  const seen = readArea(row.sosRef);
  if (!seen) return;
  if (seen.ok) { setArea(fill(say.area, { area: zoneName(seen.value.zoneId), ends: clockOf(seen.value.sharedUntil) })); setRefused(null); }
  else { setArea(null); setRefused(seen.refusal); }
 };
 /* One press, one row. The state leads as a Badge in the contract's word — filled danger while it is open,
    neutral once stood down — and the age sits at the end where a desk reads down a column of them. Next of
    kin are never drawn as told: every attempt carries its not-sent sentence, and it reads as the refusal it is. */
 return <li className={'sos-desk-row' + (row.stoodDown ? ' is-closed' : '')}>
  <div className="oi-row sos-row">
   <div className="oi-row__body">
    <span className="sos-row-line"><Badge variant={row.stoodDown ? 'neutral' : 'danger'}><Siren aria-hidden="true" className="sos-badge-mark"/>{stateLabel(row.stateCode)}</Badge><span className="oi-row__meta sos-ref">{row.sosRef}</span></span>
    <p className="oi-row__title">{fill(say.routedTo, { outcome: outcomeById(row.routedTo).name })}</p>
    <span className="oi-row__meta">{fill(say.raisedAt, { at: clockOf(row.raisedAt) })}{row.failureCode ? ` · ${failureById(row.failureCode).name}` : ''}</span>
   </div>
   <div className="oi-row__aside"><span className="oi-row__figure sos-age"><Clock3 aria-hidden="true"/>{fill(say.age, { minutes: String(row.ageMinutes) })}</span></div>
   <div className="oi-row__actions sos-detail">
    <p className="oi-help sos-concern">{concern.open
     ? fill(say.concern, { owner: concern.owner, at: clockOf(concern.until), fallback: concern.fallback })
     : fill(say.concernClosed, { outcome: concern.outcome })}</p>
    {row.stoodDown && <p className="oi-help">{fill(say.stoodDown, { at: clockOf(row.stoodDown.at), reason: reasonLabel(row.stoodDown.reasonCode) })}</p>}
    {row.areaSharedUntil !== null && <div className="oi-actions sos-area">
     <Button variant="secondary" onClick={look} leadingIcon={<MapPin aria-hidden="true"/>}>{say.readArea}</Button>
     {area && <span className="sos-area-at" role="status">{area}</span>}
    </div>}
    <div className="sos-nok">
     <p className="oi-subtitle">{say.nextOfKin}</p>
     {row.nextOfKin.length === 0 ? <p className="oi-help">{say.noNextOfKin}</p> : row.nextOfKin.map(n => <div className="sos-nok-row" key={n.nominationRef}>
      <p className="sos-nok-attempt">{fill(say.attempt, { status: statusLabel(n.statusCode), attempt: String(n.attempts), allowed: String(n.attemptsAllowed), ends: clockOf(n.windowEndsAt) })}</p>
      <p className="oi-with-icon oi-refusal-soft"><Ban aria-hidden="true"/>{notSentSentence(n.reasonCode)}</p>
      <div><Button variant="secondary" onClick={() => setRefused(tryNextOfKinAgain(row.sosRef, n.nominationRef))}>{say.tryAgain}</Button></div>
     </div>)}
    </div>
    {refused && <p className="oi-refusal fs-refused" role="alert">{refused.statement}</p>}
   </div>
  </div>
 </li>;
}
