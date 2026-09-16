import { useState } from 'react';
import { Ban, Check, HandCoins, LockKeyhole, Users } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { money } from '../lib/catalog';
import {
 acceptPreviewShare, nameOf, previewPayableCents, previewShares, previewSplitFor, proposePreviewSplit,
 shareStates, splitState, splitWords, type Share, type Split
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

export function BillSplit() {
 const whole = previewPayableCents();
 const [split, setSplit] = useState<Split | null>(null);
 const [refusal, setRefusal] = useState('');
 const [status, setStatus] = useState('');
 /* The even split the contract's parts describe, and a deliberately short one beside it. The refusal is
    the point of this screen, so it is something a person can press rather than a sentence about it. */
 const even = previewShares();
 const short = even.map((s, i) => (i === 0 ? { ...s, amountCents: s.amountCents - 5_000 } : s));

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

  <section className="panel glass lead rise-2">
   <div className="lead-head">
    <div><strong>{splitWords.wholeLabel}</strong><small>For {nameOf(previewSplitFor)}, on one visit</small></div>
    <Pill tone="teal">{money(whole / 100)}</Pill>
   </div>
   <div className="button-row">
    <button className="primary" onClick={() => propose(even, `Split evenly between ${even.length} people. Each share is still theirs to accept.`)}><Users size={17}/>{splitWords.propose}</button>
    <button className="secondary" onClick={() => propose(short, '')}><Ban size={17}/>Try a split that is R50 short</button>
   </div>
   <p className="helper" role="status" aria-live="polite">{refusal || status || splitWords.preview}</p>
  </section>

  {split && <>
   <SectionTitle title="Each person accepts their own"/>
   <div className="panel">
    {split.shares.map(share => {
     const done = share.stateCode === 'accepted';
     return <div className="record-row static" key={share.payerSubjectRef}>
      <span className="service-icon">{done ? <Check size={20}/> : <HandCoins size={20}/>}</span>
      <span><strong>{splitWords.shareLabel.replace('{who}', nameOf(share.payerSubjectRef))} · {money(share.amountCents / 100)}</strong>
       <small>{done ? accepted.words : waiting.words}</small></span>
      <button className="secondary" disabled={done} onClick={() => accept(share)}>{done ? accepted.name : splitWords.accept}</button>
     </div>;
    })}
    <div className="review-line"><span>Where the split stands</span><strong>{splitState(split) === 'payable' ? accepted.name : waiting.name}</strong></div>
   </div>
  </>}

  <SectionTitle title={splitWords.neverHeading}/>
  <div className="panel">
   <dl className="stated">{splitWords.never.map(line => <div key={line}><dt>{line}</dt></div>)}</dl>
   <div className="privacy-note"><LockKeyhole size={19}/>A payer is paying, not reading. There is no field in what this screen is answered with for the visit, the reason for it or anything a nurse found — so there is nothing here to hide and nothing to ask for.</div>
  </div>
 </>;
}
