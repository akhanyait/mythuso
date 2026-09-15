import { useState } from 'react';
import { fillHl7, hl7Words, previewQuarantine, retentionDaysNow, whenOf } from '../lib/hl7-inbound';
import './medicines.css';
import './hl7-quarantine.css';

/* The HL7 v2 quarantine, as a development operator reads it (Wave 5).
 *
 * WHAT IT SHOWS AND WHAT IT CANNOT. Who sent each message the Passport could not file, what kind it was, the refusal's
 * sentence and when its record is deleted. Nothing a message said, because the quarantine keeps nothing a message
 * said: no identifier, no name, no visit or order number, no value and no control ID. There is no button to release a
 * message into a record, and the screen says why rather than leaving a gap where one would be.
 *
 * NO NUMBER IS TYPED. The retention sentence is the Record setting in force, and each deletion day is the one its
 * record was given when it arrived. Both come through lib/hl7-inbound.ts from the contracts and the settings.
 *
 * It opens from the Control Tower's tools, behind its own dynamic import, and it is not on the patient's first load.
 */
export function Hl7Quarantine() {
 const [now] = useState(() => Date.now());
 const items = previewQuarantine(now);
 const q = hl7Words.quarantine;
 return <div className="md-screen"><section className="md-panel hq">
  <div className="md-head"><p>{q.intro}</p></div>
  <p className="md-notice" role="note">{q.preview}</p>
  <p className="hq-retention">{fillHl7(q.retention, { days: retentionDaysNow() })}</p>
  {items.length === 0 ? <p className="md-empty">{q.empty}</p> : <ol className="md-rows hq-rows">{items.map(item =>
   <li key={item.ref} className="md-row hq-row">
    <dl className="hq-facts">
     <div><dt>{q.facility}</dt><dd>{item.facility}</dd></div>
     <div><dt>{q.kind}</dt><dd>{item.kind ?? '—'}</dd></div>
     <div><dt>{q.received}</dt><dd>{whenOf(item.receivedAt)}</dd></div>
    </dl>
    <p className="hq-reason"><span>{q.reason}</span> {item.reason}</p>
    <small className="hq-deleted">{fillHl7(q.deleted, { when: whenOf(item.purgeAfter) })}</small>
   </li>)}</ol>}
  <p className="hq-no-release">{q.noRelease}</p>
 </section></div>;
}
