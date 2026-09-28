import { useId, useState } from 'react';
import { Ban, Siren, Undo2 } from 'lucide-react';
import { clockOf, fill, type Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { areaSharingEndsAt, notSentSentence, sosEngine, standDownReasons, statusLabel } from '../../../../packages/engines/src/safety/domain/sos.ts';
import { zones } from '../lib/geography';
import { nameOf, pressSos, standDownPress, useSosDesk } from '../lib/sos-desk';
import type { Answers } from '../lib/sos';
import { Button, Card } from '../ui';
import './sos-press.css';

/* Pressing SOS, once the answers point at a door, and what the press did and did not do.
 *
 * It sits under the emergency numbers and under the door the answers pointed to, never above either: the numbers are
 * the first thing on the screen whatever happens here. Pressing records the press on the Safety engine's rules — the
 * door, the area chosen from the list for its window, next of kin recorded as would-be told — and says, in the
 * contract's sentence, that no ambulance partner is connected and nobody is on the way because of it.
 *
 * What it will not say is as deliberate as what it does. A next of kin is never shown as told, because nothing can tell
 * them: each attempt says not sent, and why. A visit is never shown as coming, because nothing has accepted it. And
 * standing it down takes one of the reasons on the screen and nothing typed. */
const say = sosEngine.raised;
const routed = say.routed as Readonly<Record<string, string>>;
const reasonLabel = (id: string) => standDownReasons.find(r => r.id === id)?.label ?? id;

export function PressSos({ answers }: { answers: Answers }) {
 const s = useSosDesk();
 const id = useId();
 const [pressedRef, setPressedRef] = useState<string | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const pressed = pressedRef ? s.presses.find(p => p.sosRef === pressedRef) : undefined;

 if (!pressed) {
  const press = () => {
   const zoneId = answers.area ? zones.find(zone => zone.name === answers.area)?.id ?? null : null;
   const result = pressSos({ conditionTicked: answers.flagged.length > 0, zoneId, callbackAvailable: answers.canAnswerAPhone === true });
   if (result.ok) { setPressedRef(result.sos.sosRef); setRefused(null); } else setRefused(result.refusal);
  };
  return <Card padding="md" className="sos-press">
   <div><Button variant="destructive" className="sos-press-button" onClick={press} leadingIcon={<Siren aria-hidden="true"/>}>{say.press}</Button></div>
   <p className="sos-help">{say.pressHelp}</p>
   {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
  </Card>;
 }

 const attempts = s.attempts.filter(a => a.sosRef === pressed.sosRef);
 const areaEnds = areaSharingEndsAt(pressed);
 return <Card padding="md" className="sos-raised" role="region" aria-labelledby={id + '-head'}>
  <h3 id={id + '-head'}>{say.heading}</h3>
  <p role="status">{fill(say.recorded, { at: clockOf(pressed.raisedAt) })} {routed[pressed.routedTo]}</p>
  <p className="sos-partner"><Ban aria-hidden="true"/>{sosEngine.partner.notConnected}</p>
  {!pressed.stoodDown && <p className="sos-help">{areaEnds === null ? say.areaNotShared : fill(say.areaShared, { ends: clockOf(areaEnds) })}</p>}
  <div className="sos-nok">
   <strong>{say.nextOfKinHeading}</strong>
   {attempts.length === 0 ? <p>{say.noNextOfKin}</p>
    : attempts.map(a => <p key={a.notificationRef}><span className="sos-nok-name">{nameOf(s, a.nominationRef)}</span> · {statusLabel(a.statusCode)}. {notSentSentence(a.reasonCode)}</p>)}
  </div>
  {pressed.stoodDown
   ? <p className="sos-stood" role="status"><Undo2 aria-hidden="true"/>{fill(say.stoodDown, { at: clockOf(pressed.stoodDown.at), reason: reasonLabel(pressed.stoodDown.reasonCode) })}</p>
   : <div className="sos-press-reasons" role="group" aria-label={say.standDown}>
     <span className="sos-help">{say.standDown}</span>
     {standDownReasons.map(r => <Button key={r.id} variant="secondary" onClick={() => setRefused(standDownPress(pressed.sosRef, r.id))}>{r.label}</Button>)}
    </div>}
  <p className="sos-help">{sosEngine.priority.statement}</p>
  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
 </Card>;
}
