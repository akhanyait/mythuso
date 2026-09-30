import { ArrowRight } from 'lucide-react';
import { Badge, Button, Card } from '../ui';
import { NotConnected } from '../components/NotConnected';
import { authorisation, collectionAnswer, formatDay, nextCollectionOn, repeatsRemaining } from '../lib/dispensing';
import { careTipDoor, careTipReview, careTips } from '../lib/care-tips';
import { careTipsRoute } from '../lib/care-tips-route.generated';

/* Two panels of the home that read contracts the patient's entry does not carry: the chronic authorisation in
 * packages/catalog/dispensing.json and the tips in packages/catalog/care-tips.json. Dashboard.tsx reaches them
 * through a dynamic import, so neither contract is in the entry bundle — a JSON module imported there is kept
 * whole, and dispensing.json alone is several times the size of everything these two panels draw.
 *
 * WHAT THEY WILL NOT DO. The export's "Medication today" ticks a dose as taken and offers "Take now"; nothing
 * here records a dose, so the medicine panel says what the authorisation says — how many repeats are left and
 * the day the next may be collected, both worked out in lib/dispensing.ts — under the dispensing capability's
 * own notice. The export's tips carry photographs and read times; these carry the contract's tag and title,
 * and the reviewer notice that goes beside every tip until a clinician has signed them. */

export function HomeMedicine({ navigate }: { navigate: (page: string) => void }) {
 const answer = collectionAnswer();
 return <Card className="pd-medicine" padding="md" role="region" aria-labelledby="pd-medicine-title">
  <div className="pd-card-head">
   <div><h2 id="pd-medicine-title" className="pd-card-title">Your medicine</h2>
    <p className="pd-card-lead">{authorisation.programme} · {authorisation.reference}</p></div>
   <Badge size="sm" variant={answer.allowed ? 'success' : 'neutral'}>{answer.allowed ? 'Due now' : 'Not due yet'}</Badge>
  </div>
  <dl className="pd-facts">
   <div><dt>Repeats left</dt><dd><strong>{repeatsRemaining}</strong> of {authorisation.repeatsAuthorised}</dd></div>
   <div><dt>The next may be collected</dt><dd><strong>{answer.allowed ? 'Today' : formatDay(nextCollectionOn)}</strong></dd></div>
  </dl>
  <NotConnected of="dispensing" tone="inline"/>
  <div className="pd-card-foot">
   <Button variant="ghost" size="sm" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('What happens to a prescription')}>What happens to a prescription</Button>
  </div>
 </Card>;
}

export function HomeTips({ navigate }: { navigate: (page: string) => void }) {
 return <section className="pd-tips" aria-labelledby="pd-tips-title">
  <div className="pd-section-head">
   <h2 id="pd-tips-title">{careTipDoor.heading}</h2>
   <Button variant="ghost" size="sm" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate(careTipsRoute.opens)}>{careTipDoor.action}</Button>
  </div>
  <ul className="pd-tips__grid">{careTips.map(tip => <li key={tip.id}>
   <button type="button" className="pd-tip" onClick={() => navigate(careTipsRoute.opens)}>
    <Badge size="sm" variant="neutral">{tip.tag}</Badge>
    <strong>{tip.title}</strong>
   </button>
  </li>)}</ul>
  <p className="pd-note">{careTipReview.notice}</p>
 </section>;
}
