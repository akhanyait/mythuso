import { forwardRef } from 'react';
import { ClipboardCheck, FileSignature } from 'lucide-react';
import { fill, inboxNow, protocolName, signingModes, useClinical, words } from '../lib/clinical';
import { Badge, Button } from '../ui';
import './doctor-pages.css';

/* The case beside the queue (30 September 2026, the Lovable export's doctor-case-panel).
 *
 * The export draws the queue as master and detail: a row is chosen, and the case it names stands in a
 * panel beside the list while the doctor reads it. The queue here opened a dialog on every press, so a
 * doctor comparing two cases opened and closed two dialogs to do it. The panel is the reading; the
 * dialog is still where a case is signed, because the review screen is where the signing doctor, her
 * standing, the decision and its rationale are asked for, and a second, lighter way to sign beside it
 * would be a signature given with less in front of her.
 *
 * NOTHING HERE IS NEW. What the panel says about a case is what the queue row and the clinical inbox
 * already say about it, read from the same places — the row's own fields, and lib/clinical's inbox for
 * the protocol the visit named, whether its record is complete and how it may be signed. The export's
 * four vital-sign tiles are not drawn: the declared fixture chart is inside the review, beside the
 * readings' provenance, and four bare numerals in a side panel would be readings without either.
 */
export type ReviewCaseRow = { ref: string; kind: string; patient: string; from: string; found: string; waited: string; flag: string };

export const ReviewCasePanel = forwardRef<HTMLElement, { review: ReviewCaseRow; open: (s: string) => void }>(({ review, open }, ref) => {
 useClinical();
 const inbox = inboxNow();
 /* The inbox is refused to a reader who may not confirm; the panel then says only what the row says,
    and the door to the case is still there, because the review screen is where that refusal is
    explained with the checks behind it. */
 const row = inbox.ok ? inbox.rows.find(r => r.appointmentRef === review.ref) : undefined;
 const named = row?.protocolVersionId ? `${protocolName(row.protocolVersionId)} (${row.protocolVersionId})` : null;
 return <aside ref={ref} className="rq-case" aria-labelledby={`rq-case-${review.ref}`} tabIndex={-1}>
  <div className="rq-case-head">
   <span className="rq-case-ref">{review.ref} · {review.kind}</span>
   <h2 id={`rq-case-${review.ref}`}>{review.patient}</h2>
   <div className="rq-case-standing">
    <Badge variant={review.flag ? 'warning' : 'neutral'}>{review.flag || 'Routine'}</Badge>
    <span>Waiting {review.waited}</span>
   </div>
  </div>
  <dl className="rq-case-facts">
   <div><dt>Handed over by</dt><dd>{review.from}</dd></div>
   <div><dt>What the nurse found</dt><dd>{review.found}</dd></div>
   {row && <>
    <div><dt>Protocol</dt><dd>{named ? `${fill(words.inbox.named, { protocol: named })} · ${row.protocolRatified ? words.inbox.ratified : words.inbox.draft}` : words.inbox.namedNone}</dd></div>
    <div><dt>Record</dt><dd><Badge size="sm" variant={row.recordComplete ? 'neutral' : 'danger'}>{row.recordComplete ? words.inbox.recordComplete : words.inbox.recordIncomplete}</Badge></dd></div>
   </>}
  </dl>
  {row && (row.signedAs
   ? <p className="rq-case-signed" role="status"><ClipboardCheck size={16} aria-hidden="true"/>{row.signedAs}</p>
   : <div className="rq-case-modes">
    <p className="rq-case-label">{words.inbox.mode}</p>
    <ul>{signingModes.map(mode => <li key={mode.code}>{mode.label}</li>)}</ul>
   </div>)}
  <Button variant="primary" className="rq-case-open" leadingIcon={<FileSignature aria-hidden="true"/>} onClick={() => open(`Doctor review: ${review.ref}`)}>Open the case to sign</Button>
  <p className="rq-case-note">The case opens with the readings, the nurse’s notes and the signing doctor’s standing. Nothing is signed from this panel.</p>
 </aside>;
});
ReviewCasePanel.displayName = 'ReviewCasePanel';
