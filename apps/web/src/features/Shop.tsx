import { useState, type ReactNode } from 'react';
import { AlertTriangle, Award, Check, Info, Minus, Package, Plus, ShoppingBasket, Trash2, Truck } from 'lucide-react';
import { CENTS_PER_POINT, productById, refusal, rewards, shop, tierFor, type Command } from '../../../../packages/commerce/index.ts';
import { useCommerce } from '../lib/commerce';
import './shop.css';

/* Every sentence this screen refuses with comes out of the contract by id. Nothing here is
   paraphrased, because the same words are rendered on iOS and Android from generated copies of the
   same file, and a shop is the surface where a reassuring rewrite is most tempting. */
/* Whole rands read as whole rands; anything with cents shows both digits, because "R89,8"
   is a number nobody writes down and a reader has to stop and parse. */
const rands = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
 return <p className={`shop-banner ${tone}`} role={tone === 'warn' ? 'alert' : 'note'}>
  {tone === 'warn' ? <AlertTriangle size={16}/> : <Info size={16}/>}<span>{children}</span>
 </p>;
}

export function Shop() {
 const { state, execute, shopperId, balance } = useCommerce();
 const [category, setCategory] = useState<string>('all');
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const [spend, setSpend] = useState(0);
 const [tab, setTab] = useState<'shop' | 'points'>('shop');

 const household = balance('household');
 const recognition = balance('recognition');
 const basket = state.baskets.find(b => b.shopperId === shopperId)?.lines ?? [];
 const orders = state.orders.filter(o => o.shopperId === shopperId);
 const products = shop.products.filter(p => category === 'all' || p.category === category);
 const goodsCents = basket.reduce((sum, l) => sum + productById(l.productId).price * 100 * l.quantity, 0);
 const tier = tierFor(household.points);
 const deliveryCents = tier.id !== 'green' || goodsCents >= shop.delivery.freeAbove * 100 ? 0 : shop.delivery.fee * 100;
 const maxSpend = Math.min(household.points, Math.floor(goodsCents / CENTS_PER_POINT));

 const run = (command: Command, message: string) => {
  try { execute(command); setError(''); setNotice(message); return true; }
  catch (e) { setNotice(''); setError(e instanceof Error ? e.message : 'That could not be done.'); return false; }
 };

 return <div className="shop-page">
  <header className="shop-head">
   <div>
    <span className="shop-eyebrow"><Package size={16}/> MYTHUSO SHOP</span>
    <h1>For the days between visits.</h1>
    <p>Monitors, dressings and the things a household keeps in the cupboard.</p>
   </div>
   <div className="shop-balance">
    <span>Thuso Points</span>
    <strong>{household.points.toLocaleString('en-ZA')}</strong>
    {/* Worth is multiplied out of randPerPoint, never written down here. A boundary check reads
        this file for the literal rate and fails if it finds one. */}
    <small>worth {rands(household.points * CENTS_PER_POINT)} off goods</small>
    <em>{tier.name}</em>
   </div>
  </header>

  {/* The first thing on the page, above anything it sells. */}
  <Banner tone="warn">{refusal('no-payment')}</Banner>
  <Banner>{refusal('no-medicine')}</Banner>

  <nav className="shop-tabs" role="tablist">
   <button role="tab" aria-selected={tab === 'shop'} onClick={() => setTab('shop')}><ShoppingBasket size={16}/> Shop</button>
   <button role="tab" aria-selected={tab === 'points'} onClick={() => setTab('points')}><Award size={16}/> Points</button>
  </nav>

  {tab === 'shop' && <>
   <div className="shop-filters" role="group" aria-label="Categories">
    <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Everything</button>
    {shop.categories.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}
   </div>

   <div className="shop-grid">
    {products.map(p => {
     const left = state.stock[p.id] ?? 0;
     return <article key={p.id} className="shop-card">
      <h2>{p.name}</h2>
      <p className="does">{p.does}</p>
      {/* Any product that produces a number carries the sentence saying a number is not a
          diagnosis. It is attached to the product, not to the page, so it cannot be scrolled past. */}
      {p.needsReading && <p className="shop-caveat">{refusal('reading-is-not-advice')}</p>}
      <footer>
       <strong>{rands(p.price * 100)}</strong>
       <span className={left > 0 ? 'in-stock' : 'out'}>{left > 0 ? `${left} in stock` : 'None left'}</span>
      </footer>
      <button className="primary" disabled={left === 0}
        onClick={() => run({ type: 'basket.add', shopperId, productId: p.id, quantity: 1 }, `${p.name} added to the basket.`)}>
       <Plus size={15}/> Add to basket
      </button>
     </article>;
    })}
   </div>

   <section className="shop-basket" aria-label="Basket">
    <h2><ShoppingBasket size={18}/> Basket</h2>
    {basket.length === 0 ? <p className="muted">Nothing in it yet.</p> : <>
     <ul>
      {basket.map(line => { const p = productById(line.productId); return <li key={line.productId}>
       <span>{p.name}</span>
       <span className="qty">
        <button aria-label={`One fewer ${p.name}`} onClick={() => run({ type: 'basket.set', shopperId, productId: p.id, quantity: line.quantity - 1 }, 'Basket updated.')}><Minus size={14}/></button>
        {line.quantity}
        <button aria-label={`One more ${p.name}`} onClick={() => run({ type: 'basket.add', shopperId, productId: p.id, quantity: 1 }, 'Basket updated.')}><Plus size={14}/></button>
       </span>
       <strong>{rands(p.price * 100 * line.quantity)}</strong>
       <button className="icon" aria-label={`Remove ${p.name}`} onClick={() => run({ type: 'basket.remove', shopperId, productId: p.id }, `${p.name} removed.`)}><Trash2 size={15}/></button>
      </li>; })}
     </ul>
     <dl className="shop-total">
      <div><dt>Goods</dt><dd>{rands(goodsCents)}</dd></div>
      <div><dt><Truck size={14}/> Delivery{deliveryCents === 0 ? ' — none to pay' : ''}</dt><dd>{rands(deliveryCents)}</dd></div>
      {spend > 0 && <div><dt>Points</dt><dd>−{rands(spend * CENTS_PER_POINT)}</dd></div>}
      <div className="grand"><dt>Would come to</dt><dd>{rands(Math.max(0, goodsCents - spend * CENTS_PER_POINT) + deliveryCents)}</dd></div>
     </dl>
     {household.points > 0 && <label className="shop-spend">
      Spend points <input type="range" min={0} max={maxSpend} step={10} value={spend} onChange={e => setSpend(Number(e.target.value))}/>
      <output>{spend.toLocaleString('en-ZA')} of {household.points.toLocaleString('en-ZA')}</output>
     </label>}
     <button className="primary big" onClick={() => { if (run({ type: 'order.reserve', shopperId, spendPoints: spend }, 'Stock held and a quote written. No card was charged.')) setSpend(0); }}>
      Hold stock and quote me
     </button>
     <p className="shop-caveat">{refusal('no-payment')}</p>
    </>}
   </section>

   {orders.length > 0 && <section className="shop-orders" aria-label="Quotes">
    <h2>Quotes</h2>
    {orders.map(o => <article key={o.id} className={o.status === 'cancelled' ? 'cancelled' : ''}>
     <div><strong>{o.id}</strong><span className="shop-chip">{shop.orderStates.find(s => s.id === o.status)?.name ?? o.status}</span></div>
     <p>{o.lines.map(l => `${productById(l.productId).name} ×${l.quantity}`).join(', ')}</p>
     <p>{rands(o.totalCents)}{o.pointsApplied > 0 && ` · ${rands(o.pointsApplied)} paid with points`}</p>
     {o.status !== 'cancelled' && <button className="secondary" onClick={() => run({ type: 'order.cancel', shopperId, orderId: o.id }, 'Cancelled. Stock and points are back.')}>Cancel</button>}
    </article>)}
   </section>}
  </>}

  {tab === 'points' && <Points/>}

  {error && <p className="shop-message error" role="alert">{error}</p>}
  {notice && <p className="shop-message" role="status">{notice}</p>}

  <footer className="shop-foot">
   <h2>What this shop will not do</h2>
   <ul>{[...shop.refusals, ...rewards.refusals].map(r => <li key={r.id}><Check size={15}/><span>{r.sentence}</span></li>)}</ul>
   <p className="muted">Recognition points on this device: {recognition.points}. They are not money and cannot be spent.</p>
  </footer>
 </div>;
}

/* Points get their own panel rather than a badge, because the things worth saying about a loyalty
   scheme — what it will not do, what expires and when — do not fit in a badge. */
function Points() {
 const { state, execute, shopperId, balance } = useCommerce();
 const household = balance('household');
 const entries = state.ledger.filter(e => e.shopperId === shopperId).slice(-15).reverse();
 return <section className="shop-points">
  <h2>Thuso Points</h2>
  <p>Ten points to the rand, off anything in this shop. Earned for looking after yourself, and for what you buy.</p>
  {household.expiringSoon > 0 && <Banner tone="warn">{household.expiringSoon.toLocaleString('en-ZA')} points expire within {rewards.warnBeforeExpiryDays} days.</Banner>}
  <div className="shop-earn">
   {rewards.earnReasons.filter(r => r.track === 'household').map(r => <article key={r.id}>
    <strong>{r.name}</strong>
    <span>{typeof r.points === 'number' ? `${r.points} points` : `${r.perRand} point per rand`}{r.cap ? ` · up to ${r.cap} a ${r.capPeriod}` : ''}</span>
    {/* What the ledger row will say, shown before it is written. */}
    <small>Recorded as: {r.discloses}. Never {r.never}.</small>
    {typeof r.points === 'number' && <button className="secondary" onClick={() => { try { execute({ type: 'rewards.accrue', shopperId, reason: r.id }); } catch { /* the ledger below shows what landed */ } }}>Simulate</button>}
   </article>)}
  </div>
  <h3>Your points history</h3>
  <table><thead><tr><th>What</th><th>Recorded as</th><th>Points</th></tr></thead>
   <tbody>{entries.length === 0 ? <tr><td colSpan={3}>Nothing yet.</td></tr> : entries.map(e => <tr key={e.sequence}>
    <td>{rewards.earnReasons.find(r => r.id === e.reason)?.name ?? e.reason}</td><td>{e.note}</td><td>{e.points > 0 ? `+${e.points}` : e.points}</td>
   </tr>)}</tbody></table>
  <p className="shop-caveat">{refusal('ledger-holds-nothing-clinical')}</p>
 </section>;
}
