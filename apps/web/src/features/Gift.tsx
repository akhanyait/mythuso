import { useState } from 'react';
import { Ban, Gift as GiftIcon, HandHeart, Info } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { SectionTitle } from '../components/UI';
import { bookGift, giftBooksForThem, giftWords, giveGift, useBeneficiaryGifts, useGiver } from '../lib/gifts';
import { money } from '../lib/catalog';
import './gift.css';

/* Gift a visit, from both sides of it.
 *
 * A GIFT NEVER BOOKS A VISIT. That is the whole reason this screen exists rather than being one more field on
 * the sponsor's wallet: the giver names a visit and a person, and the person books it, in her own account,
 * whenever she is ready. The giver's screen says so before it says anything else, and the beneficiary's screen
 * repeats it in her own words — "book this visit" is a button she presses, not a step the gift took for her.
 *
 * ONE LEDGER, BOTH SCREENS. giveGift and bookGift call the exact functions the engine binds to POST
 * /v1/money/gifts@1 and to the booking Care would otherwise cause, so what a giver sees agreed to and what a
 * beneficiary sees waiting are one answer read twice, never two screens that could disagree. */

export function GiftAVisit() {
 const view = useGiver();
 const words = giftWords.giver;
 const [chosen, setChosen] = useState(view.services[0]?.id ?? '');
 return <div className="gift-screen">
  <div className="page-intro"><div className="eyebrow">THUSO MONEY</div>
   <h1>{words.heading}</h1>
   <p>{words.intro}</p></div>
  <NotConnected of="payments"/>

  <section className="panel">
   <label className="gift-field">
    <span>{words.beneficiaryLabel}</span>
    <strong>{view.beneficiaryName}</strong>
   </label>
   <label className="gift-field">
    <span>{words.serviceLabel}</span>
    <select value={chosen} onChange={e => setChosen(e.target.value)}>
     {view.services.map(s => <option key={s.id} value={s.id}>{s.name} — {money(s.price)}</option>)}
    </select>
   </label>
   <button className="primary full" onClick={() => giveGift(chosen)} disabled={!chosen}>
    <HandHeart size={17} aria-hidden="true"/>{words.give}
   </button>
   {view.said ? <p className="gift-said" role="status"><Info size={15} aria-hidden="true"/>{view.said}</p> : null}
  </section>

  {view.given.length > 0 ? <>
   <SectionTitle title="Given"/>
   <ul className="gift-list">{view.given.map(g => <li key={g.giftRef} className="gift-row">
    <span className="service-icon"><GiftIcon size={20} aria-hidden="true"/></span>
    <span><strong>{g.service}</strong><small>{g.words}</small></span>
   </li>)}</ul>
  </> : null}

  <p className="gift-never" role="note"><Ban size={16} aria-hidden="true"/>{giftBooksForThem} This screen has no way to book one.</p>
  <p className="helper">{giftsPreviewNote}</p>
 </div>;
}

const giftsPreviewNote = 'This is a preview. No gift exists, nobody is named and no visit is booked.';

export function GiftInbox() {
 const view = useBeneficiaryGifts();
 const words = giftWords.beneficiary;
 return <div className="gift-screen">
  <div className="page-intro"><div className="eyebrow">THUSO MONEY</div>
   <h1>{words.heading}</h1>
   <p>{words.intro}</p></div>
  <NotConnected of="payments"/>

  {view.gifts.length === 0 ? <p className="empty-note" role="status">{words.empty}</p> : <ul className="gift-list">
   {view.gifts.map(g => <li key={g.giftRef} className="gift-row">
    <span className="service-icon"><GiftIcon size={20} aria-hidden="true"/></span>
    <span><strong>{g.service}</strong><small>{g.words}</small></span>
    {g.stateCode === 'given' ? <button className="primary" onClick={() => bookGift(g.giftRef)}>{words.book}</button> : <span className="gift-booked-chip">{words.booked}</span>}
   </li>)}
  </ul>}

  {view.said ? <p className="gift-said" role="status"><Info size={15} aria-hidden="true"/>{view.said}</p> : null}

  <SectionTitle title="What a gift never does"/>
  <ul className="gift-never-list">{words.never.map(sentence => <li key={sentence}><Ban size={15} aria-hidden="true"/>{sentence}</li>)}</ul>
  <p className="helper">{giftsPreviewNote}</p>
 </div>;
}
