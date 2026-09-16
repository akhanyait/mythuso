import { useState } from 'react';
import { Ban, Check, HandCoins, LockKeyhole, Users } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { Metric, Metrics } from '../surface/Surface';
import { NotConnected } from '../components/NotConnected';
import './bill-split.css';
import { money } from '../lib/catalog';
import {
 acceptPreviewShare, nameOf, previewPayableCents, previewShares, previewSplitFor, proposePreviewSplit,
 shareStates, splitState, splitStates, splitWords, type Share, type Split
} from '../lib/household';

/* One visit's cost, split between two adult children, and the three things a split is not.
 *
 * The screen is arranged around the acceptance rather than the amounts, because the acceptance is what
 * the arrangement is for. Two people can agree over the phone to split their mother's visit; what neither
 * of them can do is commit the other to an amount. So each row is somebody's own decision, and until every
 * row has been made the split says proposed and offers nothing for payment — the state comes from
 * packages/engines/src/access/domain/bill-split.ts, the module the routes are built on, so a row that looks
 * payable here is payable there.
 *
 * WHAT IS DELIBERATELY ABSENT. The visit. Not its name, not its date, not who it was for beyond the
 * reference the payable carries. A payer is paying, not reading, and the response shape the route declares
 * has no field for any of it — which is why this file has nothing to hide and no guard around a render.
 *
 * The amounts are the payable's, cut into parts by the domain. There is nowhere here to type a rand.
 *
 * No split exists, nobody is asked to accept anything and nothing is charged. */

const waiting = shareStates.find(s => s.id === 'waiting')!;
const accepted = shareStates.find(s => s.id === 'accepted')!;
const standingOf = (id: string) => splitStates.find(s => s.id === id)!;
/* The figure without its symbol, so a metric can set the R small and leading the way the design language
   asks. Derived from money() rather than formatted again — the grouping and the rounding stay the
   catalogue's, exactly as the sponsor's statement does it. */
const figure = (n: number) => money(n).replace(/^R\s*/, '');

export function BillSplit() {
 const whole = previewPayableCents();
 const [split, setSplit] = useState<Split | null>(null);
 const [refusal, setRefusal] = useState('');
 const [status, setStatus] = useState('');
 /* The even split the contract's parts describe, and a deliberately short one beside it. The refusal is
    the point of this screen, so it is something a person can press rather than a sentence about it. */
 const even = previewShares();
 /* One cent short, deliberately. A split that misses by a cent is refused exactly as one that misses by a
    thousand rand, because the comparison is against the payable and not against a tolerance somebody chose. */
 const short = even.map((s, i) => (i === 0 ? { ...s, amountCents: s.amountCents - 1 } : s));

 const propose = (shares: readonly { payerSubjectRef: string; amountCents: number }[], what: string) => {
  const answer = proposePreviewSplit(shares);
  if (answer.refused) { setSplit(null); setRefusal(answer.statement); setStatus(''); return; }
  setSplit(answer.split); setRefusal(''); setStatus(what);
 };
 const accept = (share: Share) => {
  if (!split) return;
  const answer = acceptPreviewShare(split, { bySubjectRef: share.payerSubjectRef, amountCents: share.amountCents });
  if (answer.refused) { setRefusal(answer.statement); return; }
  setSplit(answer.split); setRefusal('');
  setStatus(splitState(answer.split) === 'payable' ? splitWords.allAccepted : splitWords.accepted);
 };

 return <>
  <div className="page-intro"><div className="eyebrow">THUSO FAMILY</div>
   <h1>{splitWords.heading}</h1>
   <p>{splitWords.intro}</p></div>
  <NotConnected of="payments"/>

  {/* The figure first and large, the way every other amount in this product is set, because what is owed
      is the one thing a person opening this screen already knows they are looking for. */}
  <section className="panel glass lead rise-2">
   <Metrics>
    <Metric prefix="R" value={figure(whole / 100)} label={splitWords.wholeLabel} chip={`One visit for ${nameOf(previewSplitFor)}`}/>
   </Metrics>
   {/* Full width and stacked rather than side by side: at 390px two buttons in a row broke both labels over
       three lines each, and a control whose words wrap is a control somebody reads twice. */}
   <button className="primary full" onClick={() => propose(even, `Split evenly between ${even.length} people. Each share is still theirs to accept.`)}><Users size={17}/>{splitWords.propose}</button>
   <button className="secondary full" onClick={() => propose(short, '')}><Ban size={17}/>Try a split that does not add up</button>
   {/* A refusal is not a hint. It is set as an alert when it fires and as quiet helper text otherwise, so
       the sentence a person most needs to read is not the smallest thing on the screen. */}
   {refusal
    ? <div className="privacy-note alert" role="status" aria-live="polite"><Ban size={19}/>{refusal}</div>
    : <p className="helper" role="status" aria-live="polite">{status || splitWords.preview}</p>}
  </section>

  {split && <>
   <SectionTitle title="Each person accepts their own"/>
   <div className="panel">
    {split.shares.map(share => {
     const done = share.stateCode === 'accepted';
     return <div className="record-row static split-share" key={share.payerSubjectRef}>
      <span className="service-icon">{done ? <Check size={20}/> : <HandCoins size={20}/>}</span>
      <span><strong>{splitWords.shareLabel.replace('{who}', nameOf(share.payerSubjectRef))} · {money(share.amountCents / 100)}</strong>
       <small>{done ? accepted.words : waiting.words}</small></span>
      <button className="secondary" disabled={done} onClick={() => accept(share)}>{done ? accepted.name : splitWords.accept}</button>
     </div>;
    })}
    {/* The split's own state, in its own words. A share is waiting or accepted; a split is proposed or
        payable, and the two vocabularies are kept apart because they are two different facts. */}
    <div className="review-line"><span>Where the split stands</span><strong>{standingOf(splitState(split)).name}</strong></div>
    <p className="helper">{standingOf(splitState(split)).words}</p>
   </div>
  </>}

  <SectionTitle title={splitWords.neverHeading}/>
  <ul className="split-never">{splitWords.never.map(line => <li key={line}><Ban size={15} aria-hidden="true"/>{line}</li>)}</ul>
  <div className="privacy-note"><LockKeyhole size={19}/>A payer is paying, not reading. There is no field in what this screen is answered with for the visit, the reason for it or anything a nurse found — so there is nothing here to hide and nothing to ask for.</div>
 </>;
}
