import { ArrowRight, ArrowUpRight, CalendarPlus, ChevronDown, ChevronRight, Clock3, MapPin, Plus, Search, ShieldCheck, Stethoscope, Zap } from 'lucide-react';
import { SectionTitle, Pill, ServiceIcon } from '../components/UI';
import { liveServices, money, type Service } from '../lib/catalog';
import { labels as scheduling, shortWhenText, visitEnds } from '../lib/scheduling';
import type { DemoVisit } from './Booking';
import { useT } from '../lib/i18n';

/* The returning patient's home.
 *
 * It used to open with a rotating promotional carousel roughly two thirds of the phone screen tall,
 * a decorative script slogan competing with the greeting, and a photograph printed over the
 * headline and the button. The four service shortcuts began below the fold and the "next visit"
 * card was hard-coded — it said the same Vitals check on 12 September however many visits you had
 * actually booked, and whatever you had booked them for.
 *
 * What a returning patient needs, in the order they need it: who they are and where, what is
 * already arranged, how to arrange the next thing, and then the rest. The promotional card is still
 * here, once, further down, where it is an offer rather than an obstacle. */
type Props = {
 navigate: (s: string) => void;
 book: (s: Service) => void;
 open: (s: string) => void;
 query: string;
 setQuery: (q: string) => void;
 visits: DemoVisit[];
 location: string;
};

export function Dashboard({ navigate, book, open, query, setQuery, visits, location }: Props) {
 const t = useT();
 const next = visits[0];
 return <div className="home">
  <header className="home-head">
   <div>
    <h1>{t('shell.greeting')}</h1>
    <p>{t('shell.greetingSub')}</p>
   </div>
   {/* Location and who the visit is for are the two things that change what everything below
       means, so they sit together at the top rather than being buried in a booking step. */}
   <div className="home-context">
    <button className="context-chip" onClick={() => open('Your location')}>
     <MapPin size={15}/><span>{location}</span><ChevronDown size={14}/>
    </button>
    <button className="context-chip" onClick={() => navigate('My family')}>
     <span className="avatar small">LM</span><span>Lerato Molefe</span><ChevronDown size={14}/>
    </button>
   </div>
  </header>

  <div className="home-columns">
   <div className="home-main">
    <form className="search-field" role="search" onSubmit={e => { e.preventDefault(); navigate('Book a nurse'); }}>
     <Search size={19}/>
     <input aria-label="Search for care" placeholder="What care do you need today?" value={query} onChange={e => setQuery(e.target.value)}/>
     <button className="primary search-go" type="submit" aria-label="Search"><Search size={17}/><span aria-hidden="true">Search</span></button>
    </form>
    <button className="primary full book-cta" onClick={() => navigate('Book a nurse')}>
     <Stethoscope size={19}/>{t('nav.Book a nurse')}<ArrowRight size={17}/>
    </button>

    {/* The action reuses a translated key rather than introducing an English-only one: every locale
        in packages/catalog/locales.json must carry every key, and adding one I cannot translate
        into eleven languages would either fail the build or ship a lie about what is translated. */}
    <SectionTitle title="Care you can book today" action={t('nav.Book a nurse')} onClick={() => navigate('Book a nurse')}/>
    {/* One row per service: one icon, the name, what it is, the price and how long it takes.
        A grid of two made the names wrap to three lines on a narrow phone. */}
    <div className="shortcut-list">
     {liveServices.slice(0, 4).map(service => <button key={service.id} className="shortcut-row" onClick={() => book(service)}>
      <span className="service-icon"><ServiceIcon name={service.icon} size={21}/></span>
      <span className="shortcut-text">
       <strong>{service.name}</strong>
       <small>{service.description}</small>
      </span>
      <span className="shortcut-meta">
       <strong>{money(service.price)}</strong>
       <small>{service.duration} min</small>
      </span>
      <ChevronRight size={17}/>
     </button>)}
    </div>

    <SectionTitle title="Recent results" action={t('cta.passport')} onClick={() => navigate('Health Passport')}/>
    <div className="panel result-list">
     {[['Blood pressure', '118/78 mmHg', 'In range', ''], ['Blood glucose', '5.4 mmol/L', 'In range', ''], ['Full blood count', 'Awaiting doctor review', 'With a doctor', 'amber']].map(([name, value, status, tone]) =>
      <button className="result-row" key={name} onClick={() => navigate('Health Passport')}>
       <span><strong>{name}</strong><small>{value}</small></span>
       <Pill tone={tone}>{status}</Pill>
      </button>)}
    </div>

    <section className="promo-card">
     <div>
      <h2>Your health. One safe place.</h2>
      <p>Every visit, reading and result, in a record you own and control.</p>
      <button className="secondary" onClick={() => navigate('Health Passport')}>{t('cta.passport')}<ArrowRight size={16}/></button>
     </div>
    </section>
   </div>

   <aside className="home-side">
    <SectionTitle title={t('shell.nextVisit')} action={t('cta.allVisits')} onClick={() => navigate('My visits')}/>
    {next ? <button className="visit-card" onClick={() => open(`Visit: ${next.service.name} · ${shortWhenText(next)} · ${next.person} · ${next.address}`)}>
     <div className="visit-top">
      <span className="service-icon"><ServiceIcon name={next.service.icon}/></span>
      <div>
       <strong>{next.service.name}</strong>
       <small>{next.kind === 'asap' ? scheduling.asapPending : `${shortWhenText(next)} – ${visitEnds(next)}`}</small>
      </div>
      <Pill tone={next.kind === 'asap' ? 'amber' : ''}>{next.status}</Pill>
     </div>
     <div className="visit-meta-row">
      {next.kind === 'asap' ? <span><Zap size={14}/>Looking for the nearest nurse</span> : <span><Clock3 size={14}/>{next.service.duration} minutes</span>}
      <span><MapPin size={14}/>{next.address}</span>
     </div>
     <div className="nurse-row">
      <span className="avatar nurse-avatar">SN</span>
      <div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div>
      <ChevronRight size={18}/>
     </div>
    </button> : <div className="panel empty-visit">
     <span className="tile-icon"><CalendarPlus size={21}/></span>
     <strong>{scheduling.noUpcoming}</strong>
     <p>{scheduling.noUpcomingDetail}</p>
     <button className="secondary full" onClick={() => navigate('Book a nurse')}>{t('nav.Book a nurse')}<ArrowRight size={16}/></button>
    </div>}

    <SectionTitle title="Care plan" action="Care plans" onClick={() => navigate('Care plans')}/>
    <button className="panel reminder-row" onClick={() => navigate('Care plans')}>
     <span className="tile-icon amber"><Clock3 size={20}/></span>
     <span><strong>Chronic Routine</strong><small>Monthly check-in · due in 9 days</small></span>
     <ChevronRight size={17}/>
    </button>

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
    {/* Choosing a family member here opens the family screen, which is where the consent and
        record-access questions are actually answered. Nothing on this card opens a record. */}
    <p className="helper"><ShieldCheck size={14}/>Booking for someone opens their booking, never their record. What you may see is decided in My family.</p>
   </aside>
  </div>
 </div>;
}

export function ServicePrice({ service }: { service: Service }) {
 return <span><strong>From {money(service.price)}</strong><ArrowUpRight size={16}/></span>;
}
