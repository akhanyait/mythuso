import { ArrowRight, ArrowUpRight, ChevronRight, Heart, Plus, Search, ShieldCheck } from 'lucide-react';
import { SectionTitle, Pill, ServiceIcon } from '../components/UI';
import { HeroCarousel } from '../components/HeroCarousel';
import { services, money, type Service } from '../lib/catalog';
import { useT } from '../lib/i18n';
type Props = { navigate: (s: string) => void; book: (s: Service) => void; open: (s: string) => void; query: string; setQuery: (q: string) => void };
export function Dashboard({ navigate, book, open, query, setQuery }: Props) {
 const t = useT();
 return <>
  <div className="home-greeting">
   <h1>{t('shell.greeting')} <span className="wave">👋</span></h1>
   <p>{t('shell.greetingSub')}</p>
  </div>
  <HeroCarousel navigate={navigate}/>
  <form className="search-field" onSubmit={e => { e.preventDefault(); navigate('Book a nurse'); }}>
   <Search size={19}/>
   <input aria-label="Search for care" placeholder="What care do you need today?" value={query} onChange={e => setQuery(e.target.value)}/>
  </form>
  <div className="quick-grid">
   {services.slice(0, 4).map((s, i) => <button key={s.id} className={`quick-tile tint-${i}`} onClick={() => book(s)}>
    <span className="tile-icon"><ServiceIcon name={s.icon} size={21}/></span>
    <strong>{s.name}</strong>
   </button>)}
  </div>
  <SectionTitle title={t('shell.nextVisit')} action={t('cta.allVisits')} onClick={() => navigate('My visits')}/>
  <button className="visit-card" onClick={() => open('Visit details')}>
   <div className="visit-top">
    <span className="service-icon"><ServiceIcon name="heart"/></span>
    <div><strong>Vitals &amp; chronic check</strong><small>12 September 2026 · 09:00</small></div>
    <Pill>Confirmed</Pill>
   </div>
   <div className="nurse-row">
    <span className="avatar nurse-avatar">SN</span>
    <div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div>
    <ChevronRight size={18}/>
   </div>
  </button>
  <section className="promo-dark space-top">
   <h2>Your health.<br/>One safe place.</h2>
   <p>Your history, results and care, always together.</p>
   <button onClick={() => navigate('Health Passport')}>{t('cta.passport')}<ArrowRight size={16}/></button>
  </section>
  <SectionTitle title="Your circle of care" action="My family" onClick={() => navigate('My family')}/>
  <div className="panel">
   {[['NM', 'Nomsa Molefe', 'Mother · Sponsored care', 'peach'], ['TM', 'Thabo Molefe', 'Your son · 8 years', 'blue']].map(([initial, name, detail, tone]) =>
    <button className="family-row" key={name} onClick={() => navigate('My family')}>
     <span className={`avatar ${tone}`}>{initial}</span>
     <span><strong>{name}</strong><small>{detail}</small></span>
     <ChevronRight size={17}/>
    </button>)}
   <button className="add-family" onClick={() => open('Add a family member')}><Plus size={16}/>Add a family member</button>
  </div>
  <div className="trust-footer">
   <span><ShieldCheck size={14}/>Designed around your privacy</span>
   <span><Heart size={14}/>Doctor-reviewed care</span>
   <span>{t('shell.tagline')}</span>
  </div>
 </>;
}
export function ServicePrice({ service }: { service: Service }) {
 return <span><strong>From {money(service.price)}</strong><ArrowUpRight size={16}/></span>;
}
