import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Award, Bluetooth, Check, ChevronRight, Gift, Info, Keyboard, Minus, Package, Plus, ShieldCheck, ShoppingBasket, Stethoscope, Trash2, Truck, User, UserRound } from 'lucide-react';
import { CENTS_PER_POINT, productById as commerceProduct, refusal, rewards, shop, tierFor, type Command } from '../../../../packages/commerce/index.ts';
import { useCommerce } from '../lib/commerce';
import { calibrationMonths, caveatsOf, categoryName, connection, imageFor, kitById, kitCents, kitsWith, ownDeviceMark, productById, rands, rangeSentence, readingChips, regulatoryClass, seen, validationOf, welcome, welcomeProduct, type Audience, type Kit, type Product } from '../lib/shop-catalogue';
import { NotConnected } from '../components/NotConnected';
import './shop.css';

/* The storefront. Every sentence it refuses with comes out of the contract by id, and every fact it
   states about a reading comes out of the contract that owns that fact — lib/shop-catalogue.ts says
   which. Nothing here is paraphrased, because the same words are rendered on iOS and Android from
   generated copies of the same files, and a shop is the surface where a reassuring rewrite is most
   tempting.

   Hierarchy, in the order a person arrives with: is this real (the two banners, above anything for
   sale), what is on offer (the welcome monitor, then the shelf), what would a thing do for me (the
   detail view's three columns — what you, your nurse and your doctor see), and what it costs. The
   honest notices are part of the shelf rather than a block above it, because a notice nobody reads
   is a notice that was placed for the build rather than for the reader. */

type View = { kind: 'shelf' } | { kind: 'product'; id: string } | { kind: 'kit'; id: string };
/* The open product lives in the address, so the back button closes it and a link to a monitor opens
   the monitor. The hash, because the shop is one static page on nginx and a path would need a route. */
const viewFromHash = (): View => {
 const [, kind, id] = window.location.hash.match(/^#(product|kit)\/([a-z0-9-]+)$/) ?? [];
 if (kind === 'product' && productById(id)) return { kind: 'product', id };
 if (kind === 'kit' && kitById(id)) return { kind: 'kit', id };
 return { kind: 'shelf' };
};

function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
 return <p className={`shop-banner ${tone}`} role="note">
  {tone === 'warn' ? <AlertTriangle size={16} aria-hidden="true"/> : <Info size={16} aria-hidden="true"/>}<span>{children}</span>
 </p>;
}

/* Every picture is generated, so every picture says so where it is drawn — not in a footnote. */
function Picture({ id, alt, sizes, eager = false }: { id: string; alt: string; sizes: string; eager?: boolean }) {
 const img = imageFor(id);
 return <figure className="shop-picture">
  <img src={img.src} srcSet={img.srcSet} sizes={sizes} width={img.width} height={img.height} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async"/>
  <figcaption className="shop-illustrative">{shop.images.label}</figcaption>
 </figure>;
}

function ReadingChips({ product }: { product: Product }) {
 const chips = readingChips(product);
 const how = connection(product);
 if (!chips.length) return null;
 return <ul className="shop-readings" aria-label="Readings it takes">
  {chips.map(c => <li key={c.id} className={c.inRecord ? '' : 'outside'}>{c.label}</li>)}
  {how && <li className="how">{how === 'bluetooth' ? <><Bluetooth size={13} aria-hidden="true"/>Bluetooth</> : <><Keyboard size={13} aria-hidden="true"/>Typed in</>}</li>}
 </ul>;
}

export function Shop() {
 const { state, execute, executeAll, shopperId, balance } = useCommerce();
 const [category, setCategory] = useState<string>('all');
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const [spend, setSpend] = useState(0);
 const [tab, setTab] = useState<'shop' | 'points'>('shop');
 const [view, setView] = useState<View>(viewFromHash);

 useEffect(() => {
  const follow = () => { setView(viewFromHash()); window.scrollTo({ top: 0 }); };
  window.addEventListener('hashchange', follow);
  return () => window.removeEventListener('hashchange', follow);
 }, []);

 const household = balance('household');
 const recognition = balance('recognition');
 const basket = state.baskets.find(b => b.shopperId === shopperId)?.lines ?? [];
 const orders = state.orders.filter(o => o.shopperId === shopperId);
 const goodsCents = basket.reduce((sum, l) => sum + commerceProduct(l.productId).price * 100 * l.quantity, 0);
 const tier = tierFor(household.points);
 const deliveryCents = tier.id !== 'green' || goodsCents >= shop.delivery.freeAbove * 100 ? 0 : shop.delivery.fee * 100;
 const maxSpend = Math.min(household.points, Math.floor(goodsCents / CENTS_PER_POINT));
 const items = basket.reduce((n, l) => n + l.quantity, 0);

 const run = (command: Command, message: string) => {
  try { execute(command); setError(''); setNotice(message); return true; }
  catch (e) { setNotice(''); setError(e instanceof Error ? e.message : 'That could not be done.'); return false; }
 };
 const add = (p: Product) => run({ type: 'basket.add', shopperId, productId: p.id, quantity: 1 }, `${p.name} added to the basket.`);
 const addMany = (ids: string[], what: string) => {
  try { executeAll(ids.map(productId => ({ type: 'basket.add', shopperId, productId, quantity: 1 }))); setError(''); setNotice(`${what} added to the basket.`); }
  catch (e) { setNotice(''); setError(e instanceof Error ? e.message : 'That could not be done.'); }
 };
 const stockOf = (id: string) => state.stock[id] ?? 0;

 const basketPanel = <section className="shop-basket" id="basket" aria-label="Basket">
  <h2><ShoppingBasket size={18} aria-hidden="true"/> Basket{items > 0 && <span className="count">{items}</span>}</h2>
  {basket.length === 0 ? <p className="shop-empty">Nothing in it yet. What you add is held in this page only, and is gone when you close it.</p> : <>
   <ul>
    {basket.map(line => { const p = commerceProduct(line.productId); return <li key={line.productId}>
     <span className="name">{p.name}</span>
     <span className="qty">
      <button aria-label={`One fewer ${p.name}`} onClick={() => run({ type: 'basket.set', shopperId, productId: p.id, quantity: line.quantity - 1 }, 'Basket updated.')}><Minus size={14}/></button>
      <span aria-label={`${line.quantity} in the basket`}>{line.quantity}</span>
      <button aria-label={`One more ${p.name}`} onClick={() => run({ type: 'basket.add', shopperId, productId: p.id, quantity: 1 }, 'Basket updated.')}><Plus size={14}/></button>
     </span>
     <strong>{rands(p.price * 100 * line.quantity)}</strong>
     <button className="icon" aria-label={`Remove ${p.name}`} onClick={() => run({ type: 'basket.remove', shopperId, productId: p.id }, `${p.name} removed.`)}><Trash2 size={15}/></button>
    </li>; })}
   </ul>
   <dl className="shop-total">
    <div><dt>Goods</dt><dd>{rands(goodsCents)}</dd></div>
    <div><dt><Truck size={14} aria-hidden="true"/> Delivery{deliveryCents === 0 ? ' — none to pay' : ''}</dt><dd>{rands(deliveryCents)}</dd></div>
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
  {orders.length > 0 && <div className="shop-orders" aria-label="Quotes">
   <h3>Quotes</h3>
   {orders.map(o => <article key={o.id} className={o.status === 'cancelled' ? 'cancelled' : ''}>
    <div><strong>{o.id}</strong><span className="shop-chip">{shop.orderStates.find(s => s.id === o.status)?.name ?? o.status}</span></div>
    <p>{o.lines.map(l => `${commerceProduct(l.productId).name} ×${l.quantity}`).join(', ')}</p>
    <p>{rands(o.totalCents)}{o.pointsApplied > 0 && ` · ${rands(o.pointsApplied)} paid with points`}</p>
    {o.status !== 'cancelled' && <button className="secondary" onClick={() => run({ type: 'order.cancel', shopperId, orderId: o.id }, 'Cancelled. Stock and points are back.')}>Cancel</button>}
   </article>)}
  </div>}
 </section>;

 return <div className="shop-page">
  <header className="shop-head">
   <div>
    <span className="shop-eyebrow"><Package size={16} aria-hidden="true"/> MYTHUSO SHOP</span>
    <h1>For the days between visits.</h1>
    <p>Measuring devices, care supplies and the things a household keeps in the cupboard — each one with the readings it takes, and who sees them.</p>
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
  <div className="shop-banners">
   <Banner tone="warn">{refusal('no-payment')}</Banner>
   <Banner>{refusal('no-medicine')}</Banner>
  </div>

  <nav className="shop-tabs" role="tablist" aria-label="Shop or points">
   <button role="tab" aria-selected={tab === 'shop'} onClick={() => setTab('shop')}><ShoppingBasket size={16} aria-hidden="true"/> Shop</button>
   <button role="tab" aria-selected={tab === 'points'} onClick={() => setTab('points')}><Award size={16} aria-hidden="true"/> Points</button>
   {items > 0 && tab === 'shop' && <a className="shop-jump" href="#basket">Basket · {items} · {rands(goodsCents)}</a>}
  </nav>

  {tab === 'shop' && <div className="shop-layout">
   <main className="shop-main" aria-live="off">
    {view.kind === 'product' ? <ProductDetail product={productById(view.id)!} stock={stockOf(view.id)} onAdd={add}/>
     : view.kind === 'kit' ? <KitDetail kit={kitById(view.id)!} stockOf={stockOf} onAdd={addMany}/>
     : <Shelf category={category} setCategory={setCategory} stockOf={stockOf} onAdd={add} onAddKit={addMany}/>}
   </main>
   <aside className="shop-aside">{basketPanel}</aside>
  </div>}

  {tab === 'points' && <Points/>}

  {error && <p className="shop-message error" role="alert">{error}</p>}
  {notice && <p className="shop-message" role="status">{notice}</p>}

  <footer className="shop-foot">
   <h2>What this shop will not do</h2>
   <ul>{[...shop.refusals, ...rewards.refusals].map(r => <li key={r.id}><Check size={15} aria-hidden="true"/><span>{r.sentence}</span></li>)}</ul>
   <p className="muted">Recognition points on this device: {recognition.points}. They are not money and cannot be spent.</p>
  </footer>
 </div>;
}

/* ─── The shelf ─────────────────────────────────────────────────────────────────────────────── */

function Shelf({ category, setCategory, stockOf, onAdd, onAddKit }: {
 category: string; setCategory: (c: string) => void; stockOf: (id: string) => number;
 onAdd: (p: Product) => void; onAddKit: (ids: string[], what: string) => void;
}) {
 const products = shop.products.filter(p => category === 'all' || p.category === category) as Product[];
 const showKits = category === 'all' || category === 'kits';
 return <>
  {category === 'all' && <WelcomeOffer/>}

  {/* Four facts about every listing, set beside the shelf rather than above it: each is short, each is
      true of everything below it, and none of them is a reason not to look. */}
  <ul className="shop-honest" aria-label="How this shop works">
   <li><ShieldCheck size={16} aria-hidden="true"/><span>{refusal('no-device-licence')}</span></li>
   <li><Package size={16} aria-hidden="true"/><span>{refusal('unbranded')}</span></li>
   <li><Info size={16} aria-hidden="true"/><span>{refusal('illustrative-image')}</span></li>
   <li><Bluetooth size={16} aria-hidden="true"/><span>{refusal('pairing-simulated')}</span></li>
  </ul>

  <div className="shop-filters" role="group" aria-label="Categories">
   <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Everything <span>{shop.products.length}</span></button>
   {shop.categories.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
    {c.name} <span>{shop.products.filter(p => p.category === c.id).length}</span></button>)}
   <button aria-pressed={category === 'kits'} onClick={() => setCategory('kits')}>Kits <span>{shop.kits.length}</span></button>
  </div>
  {category !== 'all' && category !== 'kits' && <p className="shop-blurb">{shop.categories.find(c => c.id === category)?.blurb}</p>}

  {category !== 'kits' && <div className="shop-grid">
   {products.map(p => {
    const left = stockOf(p.id);
    return <article key={p.id} className="shop-card">
     <a className="shop-card-media" href={`#product/${p.id}`} aria-label={`${p.name}: what it reads and who sees it`} tabIndex={-1}>
      <Picture id={p.id} alt={p.image.alt} sizes="(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 300px"/>
     </a>
     <div className="shop-card-body">
      <span className="shop-cat">{categoryName(p.category)}</span>
      <h2><a href={`#product/${p.id}`}>{p.name}</a></h2>
      <ReadingChips product={p}/>
      <p className="does">{p.does}</p>
      {/* Any product that produces a number carries the sentence saying a number is not a
          diagnosis. It is attached to the product, not to the page, so it cannot be scrolled past. */}
      {p.needsReading && <p className="shop-caveat">{refusal('reading-is-not-advice')}</p>}
      <footer>
       <div><strong>{rands(p.price * 100)}</strong><span className={left > 0 ? 'in-stock' : 'out'}>{left > 0 ? `${left} in stock` : 'None left'}</span></div>
       <a href={`#product/${p.id}`} aria-label={`Details of ${p.name}`}>Details<ChevronRight size={15} aria-hidden="true"/></a>
      </footer>
      <div className="shop-card-actions">
       <button className="primary" disabled={left === 0} onClick={() => onAdd(p)}><Plus size={15} aria-hidden="true"/> Add to basket</button>
      </div>
     </div>
    </article>;
   })}
  </div>}

  {showKits && <section className="shop-kits" aria-labelledby="kits-heading">
   <div className="shop-section-head">
    <h2 id="kits-heading">Kits</h2>
    <p>A kit is the things that go together, priced as the sum of them. Leave out what you already have.</p>
   </div>
   <div className="shop-kit-grid">
    {shop.kits.map(k => <KitBuilder key={k.id} kit={k} stockOf={stockOf} onAdd={onAddKit}/>)}
   </div>
  </section>}
 </>;
}

/* A kit's price is worked out here, from its items, every time it is drawn — it has none of its own.
   Unticking an item takes it out of the sum, so the builder is the arithmetic made visible. */
function KitBuilder({ kit, stockOf, onAdd, wide = false }: { kit: Kit; stockOf: (id: string) => number; onAdd: (ids: string[], what: string) => void; wide?: boolean }) {
 const [chosen, setChosen] = useState<string[]>(kit.items);
 const total = kitCents(kit, chosen);
 const short = chosen.filter(id => stockOf(id) === 0);
 return <article className={`shop-kit${wide ? ' wide' : ''}`}>
  {!wide && <a className="shop-card-media" href={`#kit/${kit.id}`} tabIndex={-1} aria-label={`${kit.name}: what is in it`}>
   <Picture id={kit.id} alt={kit.image.alt} sizes="(max-width: 640px) 100vw, 420px"/>
  </a>}
  <div className="shop-kit-body">
   {!wide && <h3><a href={`#kit/${kit.id}`}>{kit.name}</a></h3>}
   {!wide && <p className="does">{kit.does}</p>}
   <fieldset>
    <legend>What goes in it</legend>
    {kit.items.map(id => { const p = productById(id)!; const on = chosen.includes(id); return <label key={id} className={on ? 'on' : ''}>
     <input type="checkbox" checked={on} onChange={() => setChosen(on ? chosen.filter(x => x !== id) : kit.items.filter(x => x === id || chosen.includes(x)))}/>
     <span>{p.name}</span><strong>{rands(p.price * 100)}</strong>
    </label>; })}
   </fieldset>
   <div className="shop-kit-total"><span>{chosen.length === kit.items.length ? 'The kit comes to' : `${chosen.length} of ${kit.items.length} come to`}</span><strong>{rands(total)}</strong></div>
   <button className="primary" disabled={chosen.length === 0 || short.length > 0} onClick={() => onAdd(chosen, chosen.length === kit.items.length ? kit.name : `${chosen.length} items from the ${kit.name.toLowerCase()}`)}>
    <Plus size={15} aria-hidden="true"/> Add {chosen.length === 1 ? 'one item' : `${chosen.length} items`}
   </button>
   {short.length > 0 && <p className="shop-caveat">{short.map(id => productById(id)!.name).join(', ')}: none left. Untick it to add the rest.</p>}
  </div>
 </article>;
}

/* The welcome monitor. Drawn as a plan, because it is one: the label is the contract's, sign-up's own
   notice sits inside it, and the refusal says no device is given from this page. */
function WelcomeOffer({ compact = false }: { compact?: boolean }) {
 const [wide] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 821px)').matches);
 return <section className={`shop-welcome${compact ? ' compact' : ''}`} aria-labelledby="welcome-heading">
  {!compact && <div className="shop-welcome-media"><Picture id={welcomeProduct.id} alt={welcomeProduct.image.alt} sizes="(max-width: 640px) 100vw, 420px" eager/></div>}
  <div className="shop-welcome-body">
   <span className="shop-tag planned"><Gift size={14} aria-hidden="true"/> {welcome.label}</span>
   <h2 id="welcome-heading">{welcome.headline}</h2>
   <p className="lede">{welcome.intro}</p>
   {/* On a phone the five lines are folded under their heading, so the shelf starts on the second
       screen rather than the fourth; on a wide screen they are simply open and the heading is not drawn. */}
   {!compact && <details className="shop-covers-wrap" open={wide}>
    <summary>What it covers on MyThuso</summary>
    <ul className="shop-covers">{welcome.covers.map(c => <li key={c.id}><Check size={16} aria-hidden="true"/><span>{c.text}</span></li>)}</ul>
   </details>}
   <details className="shop-conditions">
    <summary>The conditions, and why this device</summary>
    <ul>{welcome.conditions.map(c => <li key={c.id}>{c.text}</li>)}</ul>
    <p>{welcome.why.text} It was found in {welcome.why.women}% of women and {welcome.why.men}% of men aged {welcome.why.ages} — {welcome.why.measure}. <a href={welcome.why.url} rel="noreferrer">{welcome.why.source}</a></p>
   </details>
   <p className="shop-welcome-refusal">{refusal('welcome-not-live')}</p>
   <NotConnected of="accounts" tone="inline"/>
   {!compact && <a className="secondary" href={`#product/${welcomeProduct.id}`}>What the monitor reads, and who sees it<ChevronRight size={15} aria-hidden="true"/></a>}
  </div>
 </section>;
}

/* ─── A product ─────────────────────────────────────────────────────────────────────────────── */

const audiences: { id: Audience; heading: string; icon: ReactNode; none: string }[] = [
 { id: 'patient', heading: 'What you see', icon: <User size={18} aria-hidden="true"/>, none: 'Nothing on a screen. What it does, it does in your hands.' },
 { id: 'nurse', heading: 'What your nurse sees', icon: <UserRound size={18} aria-hidden="true"/>, none: 'Nothing through MyThuso from this device. Tell her at the visit, or show her your notebook.' },
 { id: 'doctor', heading: 'What your doctor sees', icon: <Stethoscope size={18} aria-hidden="true"/>, none: 'Nothing through MyThuso from this device.' }
];

function ProductDetail({ product: p, stock, onAdd }: { product: Product; stock: number; onAdd: (p: Product) => void }) {
 const chips = readingChips(p);
 const validation = validationOf(p);
 const caveats = caveatsOf(p);
 const kits = kitsWith(p.id);
 const [shown, setShown] = useState(p.id);
 const gallery = useMemo(() => [{ id: p.id, alt: p.image.alt }, ...kits.map(k => ({ id: k.id, alt: k.image.alt }))], [p, kits]);
 useEffect(() => setShown(p.id), [p.id]);
 const current = gallery.find(g => g.id === shown) ?? gallery[0];
 const reg = regulatoryClass(p.sahpra);
 const months = calibrationMonths(p);
 const how = connection(p);
 const outside = chips.filter(c => !c.inRecord);
 return <article className="shop-detail" aria-labelledby="detail-heading">
  <a className="shop-back" href="#"><ArrowLeft size={16} aria-hidden="true"/> Back to the shop</a>
  <div className="shop-detail-top">
   <div className="shop-gallery">
    <Picture id={current.id} alt={current.alt} sizes="(max-width: 900px) 100vw, 560px" eager/>
    {gallery.length > 1 && <div className="shop-thumbs" role="group" aria-label="Pictures">
     {gallery.map(g => <button key={g.id} aria-pressed={g.id === current.id} onClick={() => setShown(g.id)} aria-label={g.id === p.id ? `${p.name} on its own` : `In the ${kitById(g.id)!.name.toLowerCase()}`}>
      <img src={imageFor(g.id).small} alt="" width={96} height={72}/>
     </button>)}
    </div>}
   </div>
   <div className="shop-buy">
    <span className="shop-cat">{categoryName(p.category)}</span>
    <h1 id="detail-heading">{p.name}</h1>
    <p className="lede">{p.does}</p>
    <div className="shop-price">
     <strong>{rands(p.price * 100)}</strong>
     <span className={stock > 0 ? 'in-stock' : 'out'}>{stock > 0 ? `${stock} in stock` : 'None left'}</span>
    </div>
    <p className="shop-reference">Reference price {rands(p.reference.low * 100)}–{rands(p.reference.high * 100)} at {p.reference.from}, checked {new Date(p.reference.checked).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    <button className="primary big" disabled={stock === 0} onClick={() => onAdd(p)}><Plus size={16} aria-hidden="true"/> Add to basket</button>
    <ul className="shop-facts">
     {reg && <li><ShieldCheck size={16} aria-hidden="true"/><span><strong>{reg.label}.</strong> {reg.meaning} {p.sahpra !== 'none' && shop.regulatory.sentence}</span></li>}
     {how === 'bluetooth' && <li><Bluetooth size={16} aria-hidden="true"/><span><strong>Bluetooth to the Thuso app.</strong> {refusal('pairing-simulated')}</span></li>}
     {how === 'typed' && <li><Keyboard size={16} aria-hidden="true"/><span><strong>No Bluetooth.</strong> You type the reading into the app, and it is filed as reported by you.</span></li>}
     {validation && <li><Check size={16} aria-hidden="true"/><span><strong>{validation.label}.</strong> {validation.sentence} <a href={validation.url} rel="noreferrer">{validation.list}</a></span></li>}
    </ul>
   </div>
  </div>

  {chips.length > 0 && <section className="shop-section" aria-labelledby="reads-heading">
   <h2 id="reads-heading">The readings it takes</h2>
   <dl className="shop-reads">
    {chips.map(c => <div key={c.id} className={c.inRecord ? '' : 'outside'}><dt>{c.label}{c.unit && <span> · {c.unit}</span>}</dt><dd>{rangeSentence(c)}</dd></div>)}
   </dl>
   {p.needsReading && <p className="shop-caveat">{refusal('reading-is-not-advice')}</p>}
  </section>}

  {'sees' in p && p.sees && <section className="shop-section" aria-labelledby="sees-heading">
   <h2 id="sees-heading">Who sees what</h2>
   <div className="shop-sees">
    {audiences.map(a => { const lines = seen(p, a.id); return <div key={a.id} className="shop-see">
     <h3>{a.icon}{a.heading}</h3>
     {lines.length === 0 ? <p className="shop-empty">{outside.length && a.id !== 'patient' ? outside.map(c => rangeSentence(c)).join(' ') : a.none}</p>
      : <ul>{lines.map(l => <li key={l.text}><span>{l.text}</span><span className={`shop-tag ${l.planned ? 'later' : 'now'}`}>{l.planned ? 'Planned' : 'In this preview'}</span></li>)}</ul>}
    </div>; })}
   </div>
   {how === 'bluetooth' && <div className="shop-record-note">
    <p><strong>How your record treats it.</strong> {ownDeviceMark.sentence}{months ? ` An instrument like this is recalibrated every ${months} months; its calibration date travels with each reading.` : ''}</p>
    <NotConnected of="devices" tone="inline"/>
   </div>}
  </section>}

  {'sosLink' in p && p.sosLink && <section className="shop-section"><h2>How it links to Thuso SOS</h2><p>{p.sosLink}</p><NotConnected of="emergency" tone="inline"/></section>}

  {caveats.map(c => <section key={c.id} className="shop-section shop-warning" aria-label={c.heading}>
   <h2><AlertTriangle size={18} aria-hidden="true"/>{c.heading}</h2>
   <p>{c.text}</p>
   <p className="sources">{c.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} rel="noreferrer">{s.name}</a></span>)}</p>
  </section>)}

  {'welcome' in p && p.welcome && <WelcomeOffer compact/>}
  <div className="shop-columns">
   <section className="shop-section"><h2>What it has</h2><ul className="shop-list">{p.features.map(f => <li key={f}>{f}</li>)}</ul></section>
   <section className="shop-section"><h2>Who it is for</h2><p>{p.forWhom}</p></section>
   <section className="shop-section"><h2>What it is not</h2><ul className="shop-list">{p.whatItIsNot.map(f => <li key={f}>{f}</li>)}</ul><p className="shop-small">{refusal('no-claim')}</p></section>
  </div>

  {kits.length > 0 && <section className="shop-section" aria-labelledby="in-kits">
   <h2 id="in-kits">In a kit</h2>
   <ul className="shop-kit-links">{kits.map(k => <li key={k.id}><a href={`#kit/${k.id}`}>{k.name}<span>{k.items.length} items · {rands(kitCents(k))}</span><ChevronRight size={15} aria-hidden="true"/></a></li>)}</ul>
  </section>}
 </article>;
}

function KitDetail({ kit, stockOf, onAdd }: { kit: Kit; stockOf: (id: string) => number; onAdd: (ids: string[], what: string) => void }) {
 return <article className="shop-detail" aria-labelledby="detail-heading">
  <a className="shop-back" href="#"><ArrowLeft size={16} aria-hidden="true"/> Back to the shop</a>
  <div className="shop-detail-top">
   <div className="shop-gallery"><Picture id={kit.id} alt={kit.image.alt} sizes="(max-width: 900px) 100vw, 560px" eager/></div>
   <div className="shop-buy">
    <span className="shop-cat">Kit</span>
    <h1 id="detail-heading">{kit.name}</h1>
    <p className="lede">{kit.does}</p>
    <p>{kit.forWhom}</p>
    <KitBuilder kit={kit} stockOf={stockOf} onAdd={onAdd} wide/>
   </div>
  </div>
  <section className="shop-section" aria-labelledby="kit-items">
   <h2 id="kit-items">Each thing in it</h2>
   <ul className="shop-kit-items">{kit.items.map(id => { const p = productById(id)!; return <li key={id}>
    <a href={`#product/${id}`}><img src={imageFor(id).small} alt="" width={120} height={90}/><span><strong>{p.name}</strong><small>{p.does}</small></span><ChevronRight size={16} aria-hidden="true"/></a>
   </li>; })}</ul>
  </section>
 </article>;
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
