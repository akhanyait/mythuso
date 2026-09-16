import { useState } from 'react';
import { Ban, Info, Package, ShoppingBasket } from 'lucide-react';
import shop from '../../../../packages/catalog/shop.json' with { type: 'json' };
import medicines from '../../../../packages/catalog/medicines.json' with { type: 'json' };
import { NotConnected } from '../components/NotConnected';
import { SectionTitle } from '../components/UI';
import { orderMethods } from '../lib/money-methods';
import { payForRealOrder, placeRealOrder, type OrderPlaced } from '../lib/market-orders';
import { money } from '../lib/catalog';
import './market-order.css';

/* A real Thuso Market order, through Money's own route — POST /v1/money/market-orders@1, then the existing
 * payments route — rather than the shop's own quote-only kernel at /shop, which stops before anything is
 * charged on purpose. The two live apart: the shop is its own entry so a person pricing a monitor never
 * downloads Money's ledger, and Money's ledger is what this screen needs to place a real order and refuse a
 * medicine. Putting both in the shop's bundle would mean the two entries start sharing code Rollup can only
 * split into a chunk both must preload — including catalogue data neither order needs, at a cost the shop's own
 * separation exists to avoid. So this is here instead: a screen behind its own dynamic import, reachable from
 * the wallet beside Gift a visit, and the shop keeps pointing here for anybody who wants to pay rather than
 * only quote.
 */

export function MarketOrderPreview() {
 const [picked, setPicked] = useState<string[]>([]);
 const [zone, setZone] = useState('Rosebank');
 const [order, setOrder] = useState<OrderPlaced | null>(null);
 const [method, setMethod] = useState<typeof orderMethods[number]['id']>(orderMethods[0]!.id);
 const [paid, setPaid] = useState('');

 const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
 const place = () => { setPaid(''); setOrder(placeRealOrder(picked, zone)); };
 const pay = () => {
  if (!order?.marketOrderRef || order.totalCents === null) return;
  const answer = payForRealOrder(order.marketOrderRef, order.totalCents, method);
  setPaid(answer.stateCode !== null ? `Paid. ${answer.stateCode}.` : (answer.refused ?? ''));
 };

 return <div className="market-order-screen">
  <div className="page-intro"><div className="eyebrow">THUSO MONEY</div>
   <h1>Place a real Thuso Market order</h1>
   <p>The shop's own basket only ever quotes. This places an order through Money's route: it prices the
    catalogue, refuses a scheduled or a listed medicine, and is paid the same way a visit is.</p></div>
  <NotConnected of="payments"/>

  <section className="panel">
   <SectionTitle title="Products"/>
   <ul className="market-order-products">
    {shop.products.map(p => <li key={p.id}>
     <label>
      <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)}/>
      <span><strong>{p.name}</strong><small>{money(p.price)}</small></span>
     </label>
    </li>)}
   </ul>
   <label className="market-order-zone">
    <span>Delivery zone</span>
    <input value={zone} onChange={e => setZone(e.target.value)}/>
   </label>
   <button className="primary full" onClick={place} disabled={picked.length === 0}>
    <ShoppingBasket size={17} aria-hidden="true"/>Place this order
   </button>
  </section>

  {/* What this route refuses, shown rather than only enforced: a formulary entry has no name a scanner would
      catch, so it is picked by its code alone, and the schedule that refuses it is read here from the same
      contract the route reads. */}
  <section className="panel">
   <SectionTitle title="What this route will not sell"/>
   <p className="helper">Section 22 and the shop's own never-sold list: no medicine, of any schedule, however it is named.</p>
   <ul className="market-order-products">
    {medicines.formulary.entries.filter(e => e.scheduleCode !== 'S0').map(e => <li key={e.entryCode}>
     <label>
      <input type="checkbox" checked={picked.includes(e.entryCode)} onChange={() => toggle(e.entryCode)}/>
      <span><strong>{e.entryCode}</strong><small>{e.label} · {e.scheduleCode}</small></span>
     </label>
    </li>)}
   </ul>
  </section>

  {order && (order.refused
   ? <p className="market-order-said" role="alert"><Ban size={15} aria-hidden="true"/>{order.refused}</p>
   : <section className="panel">
      <p className="market-order-said" role="status"><Package size={15} aria-hidden="true"/>Order {order.marketOrderRef} placed. {money((order.totalCents ?? 0) / 100)} owed.</p>
      {paid ? <p className="market-order-said" role="status"><Info size={15} aria-hidden="true"/>{paid}</p> : <div className="button-row">
       <select value={method} onChange={e => setMethod(e.target.value as typeof method)}>
        {orderMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
       </select>
       <button className="primary" onClick={pay}>Pay for this order</button>
      </div>}
     </section>)}
 </div>;
}
