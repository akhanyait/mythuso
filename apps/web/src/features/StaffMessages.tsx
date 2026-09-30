import { ArrowRight, Ban, MessageCircle, ShieldX } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { Button } from '../ui';
import { blockedBy, simulationOf } from '../lib/capabilities';

/* The nurse's and the doctor's "Messages", and the reason it is not the export's.
 *
 * The full Lovable export draws a messages inbox for both clinical roles: a list of threads with
 * invented bodies — a doctor's reads "TH-2048 is ready for review. Two blood-pressure readings are
 * above the documented range." — and a working reply box that appends whatever you type to the
 * thread. Every word of that is a fiction. There is no thread and no colleague on the other end,
 * `messaging` is not connected, and a reply box that appears to send is the one control this product
 * must not draw: the 25 September ruling is that nothing simulated is presented as real and no
 * clinical number is invented, and a made-up blood-pressure message somebody can "reply" to is both
 * at once. So the inbox is not lifted. This is the honest screen wearing the new look.
 *
 * It is built the way Academy and Locum shifts are, and for the same reason: it reads the `messaging`
 * capability rather than typing a word of its truth. The notice at the top, what stands between the
 * channel and being real, and the three things a simulation refuses are all
 * packages/catalog/capabilities.json's, through lib/capabilities.ts — the one place that knows, so
 * the day a supplier is signed the notice disappears here and on the patient's Notifications screen
 * together. What is typed here is only the framing a screen of its own carries: what a
 * colleague-to-colleague channel would be, plainly enough that a clinician can tell what they are
 * without. There is no thread list, no message body and no send box, because there is nothing to
 * list, nothing has been written and nothing here sends.
 *
 * It is a More tool rather than a section for the reason Medicines & Labs are: a nurse's bar already
 * carries six sections, and a simulated inbox is the last thing that should push the work she opened
 * the app for off it. */

export function StaffMessages({ onClose }: { onClose: () => void }) {
 /* The simulation's own three refusals, addressed by the capability rather than written down here a
    second time. Empty only if the contract ever stops simulating messaging — and then the notice
    above has gone with it, because both read the same boolean. */
 const refuses = simulationOf('messaging')?.refuses ?? [];
 return <div className="form-stack">
  <NotConnected of="messaging"/>
  <p className="muted">There is no staff messaging channel. A nurse cannot write to the doctor who reviews her visit, a doctor cannot write to the pharmacy or the laboratory an order went to, and the desk cannot write to a nurse already in the field from here. Nothing on this screen is delivered.</p>

  <SectionTitle title="What it would be"/>
  <div className="panel"><dl className="stated">
   <div><dt>One colleague to another, about a case</dt><dd>The question that used to be a phone call, on the record it is about — a nurse writing to the doctor who reviews her visit, a doctor to the pharmacy filling a prescription, the desk to a nurse in the field.</dd></div>
   <div><dt>Delivered to a handset, and answered for</dt><dd>A message that reaches an inbox, a phone or a push notification, and says whether it arrived. A receipt produced on the screen that asked for one is not a delivery, and this screen does not claim it as one.</dd></div>
   <div><dt>Filed with the visit it is about</dt><dd>So the next clinician to open the case reads what was already asked and what was already answered, rather than asking somebody to repeat it.</dd></div>
  </dl></div>

  {/* The refusal is the feature, and it is the contract's own three sentences rather than a paraphrase
      of them — the same arrangement the locum register and the Academy hold their refusals in. */}
  <SectionTitle title="What it will not do"/>
  <div className="panel">{refuses.map(refusal => <div className="record-row static" key={refusal}>
   <span className="service-icon check-declined"><Ban size={20}/></span>
   <span><small>{refusal}</small></span>
  </div>)}</div>

  {/* Why nothing is sent, from the capability contract rather than from a sentence of this screen's
      own. It is a supplier and not a design decision, which is worth a clinician knowing because it
      says what would have to change before this screen could carry a real inbox. */}
  <div className="privacy-note alert"><ShieldX size={19}/>None of that is built. {blockedBy('messaging').join(' ')} Nothing here opens a conversation, joins a thread or tells anybody you were here.</div>
  <div className="privacy-note"><MessageCircle size={19}/>When messaging is connected this becomes an inbox a clinician can write from, and every sentence on it is the contract's own rather than a description of one. Until it does, it stays a screen that says what is missing — which is the only version of it that is not a fiction.</div>
  <Button variant="primary" className="full" onClick={onClose} trailingIcon={<ArrowRight aria-hidden="true"/>}>Close</Button>
 </div>;
}
