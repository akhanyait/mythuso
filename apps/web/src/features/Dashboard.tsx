import '../surface/approved-care.css';
import { Activity, Ambulance, ArrowRight, ArrowUpRight, CalendarPlus, ChevronDown, ChevronRight, Clock3, Heart, MapPin, Plus, Search, ShieldCheck, Zap } from 'lucide-react';
import { SectionTitle, Pill, ServiceIcon } from '../components/UI';
import { Metric, Metrics } from '../surface/Surface';
import { liveServices, money, type Service } from '../lib/catalog';
import { labels as scheduling, shortWhenText, visitEnds } from '../lib/scheduling';
import type { DemoVisit } from './Booking';
import { useT } from '../lib/i18n';
import { nurseOfVisit } from '../lib/arrival';
import { ClinicalChart } from '../components/Chart';
import { latestSet, formatValue, isInRange, labelOf, measureSpec, seriesFor } from '../lib/passport';

/* A care overview built around the patient, the latest record and the next action. */
type Props = {
 navigate: (s: string) => void;
 book: (s: Service) => void;
 open: (s: string) => void;
 query: string;
 setQuery: (q: string) => void;
 visits: DemoVisit[];
 location: string;
 /** Opens the visit this card is about. It used to hand a formatted string to a dialog that then
     re-derived a visit from it; the visit is the thing, so the visit is what is opened. */
 viewVisit: () => void;
};

/* The care plan's next check-in, written down once. It was in the reminder row's sentence and
   nowhere else, so the figure at the top of the screen and the row half a column below it could not
   have disagreed — because only one of them existed. Now both read this. */
const planDueInDays = 9;
// Use the Passport fixture so opening a reading never changes its value.
const leadReadings = [
 { value: `${formatValue('systolic', latestSet.values.systolic!)}/${formatValue('diastolic', latestSet.values.diastolic!)}`, unit: 'mmHg', label: 'Blood pressure', chip: isInRange('systolic', latestSet.values.systolic!) && isInRange('diastolic', latestSet.values.diastolic!) ? 'In range' : 'Outside range', icon: Heart },
 { value: formatValue('glucose', latestSet.values.glucose!), unit: 'mmol/L', label: 'Blood glucose', chip: isInRange('glucose', latestSet.values.glucose!) ? 'In range' : 'Outside range', icon: Activity }
] as const;

export function Dashboard({ navigate, book, open, query, setQuery, visits, location, viewVisit }: Props) {
 const t = useT();
 const next = visits[0];
 const nurse = next ? nurseOfVisit(next) : null;
 return <div className="home approved-home">
  <header className="home-head rise">
   <div>
    <p className="home-eyebrow">YOUR EVERYDAY CARE</p>
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

  <section className="care-next-action" aria-label="Your next care action">
   <span className="care-next-symbol"><CalendarPlus size={24}/></span>
   <div><p className="home-eyebrow">YOUR NEXT STEP</p><h2>{next ? next.status === 'Confirmed' ? 'Get ready for your visit' : 'Review your visit request' : 'Find the care you need'}</h2>
    <p>{next ? `${next.service.name} · ${shortWhenText(next)} · ${next.person}` : 'Compare care options, then choose a time that suits you.'}</p></div>
   <button className="primary" onClick={next ? viewVisit : () => navigate('Book a nurse')}>{next ? next.status === 'Confirmed' ? 'Prepare for my visit' : 'View visit details' : 'Explore care'}<ArrowRight size={17}/></button>
  </section>
  <div className="care-desk">
   <section className="care-cover">
    <img src="/banners/family-panorama.webp" alt=""/>
    <div className="care-cover-copy">
     <span className="home-eyebrow">HELP. HEALTH. HOME.</span>
     <h2>Good care.<br/>Closer to you.</h2>
     <p>Support for you.<br/>And the people you love.</p>
     <button className="primary" onClick={() => navigate('Book a nurse')}>{t('nav.Book a nurse')}<ArrowUpRight size={19}/></button>
    </div>
    <span className="care-photo-note">AI-generated illustrative image</span>
   </section>
   <section className="wellbeing-invite">
    <div className="lunar-art" aria-hidden="true"><i/><span>＋</span></div>
    <span className="home-eyebrow">YOUR EVERYDAY WELLBEING</span>
    <h2>Make room<br/>for you.</h2>
    <p>How have you been feeling?<br/>A quiet space for your own words.</p>
    <button className="secondary" onClick={() => navigate('Live well')}>Open your journal<ArrowUpRight size={17}/></button>
   </section>
   <div className="desk-readings">
  <section className="health-overview" aria-label="Your care at a glance">
   <div className="health-overview-title"><h2>Your care at a glance</h2><span>Sample readings · {labelOf(latestSet.dayOffset)}</span></div>
   <Metrics>
    {leadReadings.map(r => <button className="overview-reading" key={r.label} onClick={() => navigate('Health Passport')}>
     <span className="overview-reading-head"><r.icon size={19}/><ArrowUpRight size={17}/></span>
     <span className="reading-plot" aria-hidden="true">{seriesFor(r.label === 'Blood pressure' ? 'systolic' : 'glucose').map((reading, i) => <i key={i} style={{ height: `${Math.max(12, reading.value / (r.label === 'Blood pressure' ? 160 : 8) * 100)}%` }}/>)}</span>
     <Metric value={r.value} unit={r.unit} label={r.label} chip={r.chip} flagged={r.chip !== 'In range'}/>
    </button>)}
   </Metrics>
  </section>

   </div>
   <div className="desk-visit">
   <section className={`home-appointment rise${next ? '' : ' is-empty'}`}>
    <SectionTitle title={t('shell.nextVisit')} action={t('cta.allVisits')} onClick={() => navigate('My visits')}/>
    {next ? <button className="visit-card glass lead" onClick={viewVisit}>
     <div className="visit-top">
      {/* The one glow on this screen, behind the one object it is about. Never behind a word. */}
      <span className="glow"><span className="service-icon"><ServiceIcon name={next.service.icon}/></span></span>
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
      <span className="avatar nurse-avatar">{nurse?.initials}</span>
      <div><strong>{nurse?.name}</strong><span>{nurse?.role} · Sample assignment</span></div>
      <ChevronRight size={18}/>
     </div>
     <p className="visit-ready-hint">View preparation, clinician details and contact options<ArrowRight size={15}/></p>
    </button> : <div className="panel glass lead empty-visit">
     <span className="glow"><span className="tile-icon"><CalendarPlus size={21}/></span></span>
     <span className="fresh-start-title">A fresh start.</span>
     <strong>{scheduling.noUpcoming}</strong>
     <p>{scheduling.noUpcomingDetail}</p>
     <button className="secondary full" onClick={() => navigate('Book a nurse')}>{t('nav.Book a nurse')}<ArrowRight size={16}/></button>
    </div>}
   </section>

    <button className="plan-note" onClick={() => navigate('Care plans')}>
     <span className="plan-number">{planDueInDays}<small>days</small></span>
     <span><strong>Your next check-in</strong><small>Chronic Routine</small></span><ArrowUpRight size={19}/>
    </button>
   </div>
   <section className="approved-journey" aria-label="How care works">
    <SectionTitle title="Care, made simple."/>
    <ol><li><span>01</span><div><strong>Find your care</strong><p>Understand the options.</p></div></li><li><span>02</span><div><strong>A nurse comes to you</strong><p>Support in a familiar place.</p></div></li><li><span>03</span><div><strong>A doctor reviews</strong><p>The clinician makes the decision.</p></div></li></ol>
    <p className="helper">The intended care journey. This preview does not deliver care.</p>
    <button className="secondary full" onClick={() => navigate('Book a nurse')}>Explore care options<ArrowRight size={16}/></button>
   </section>
   <section className="desk-services">
    <form className="search-field" role="search" onSubmit={e => { e.preventDefault(); navigate('Book a nurse'); }}>
     <Search size={19}/>
     <input aria-label="Search for care" placeholder="What care do you need today?" value={query} onChange={e => setQuery(e.target.value)}/>
     <button className="primary search-go" type="submit" aria-label="Search"><Search size={17}/><span aria-hidden="true">Search</span></button>
    </form>
    <SectionTitle title="Care you can book today"/>
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

   </section>
   <section className="desk-trend">
    <SectionTitle title="Your health over time" action={t('cta.passport')} onClick={() => navigate('Health Passport')}/>
    <div className="home-trend"><ClinicalChart title="Systolic blood pressure" unit={measureSpec('systolic').unit} readings={seriesFor('systolic')} normal={measureSpec('systolic').range as [number, number]}/></div>

    <button className="result-row" onClick={() => navigate('Health Passport')}><span><strong>Full blood count</strong><small>Awaiting doctor review</small></span><Pill tone="amber">With a doctor</Pill></button>
   </section>
   <aside className="desk-family">
    <SectionTitle title="Your circle of care" action="My family" onClick={() => navigate('My family')}/>
    <div className="panel">
     {/* "Sponsored care" used to be a word with nothing behind it: every row on this card went to
         the family list, including the one naming a thing the family list does not answer. It goes
         to the statement now — what has been used, what it cost, and what paying for it does not
         let you see. */}
     {[['NM', 'Nomsa Molefe', 'Mother · Sponsored care', 'peach', 'Care you sponsor'], ['TM', 'Thabo Molefe', 'Your son · 8 years', 'blue', 'My family']].map(([initial, name, detail, tone, target]) =>
      <button className="family-row" key={name} onClick={() => navigate(target)}>
       <span className={`avatar ${tone}`}>{initial}</span>
       <span><strong>{name}</strong><small>{detail}</small></span>
       <ChevronRight size={17}/>
      </button>)}
     <button className="add-family" onClick={() => open('Add a family member')}><Plus size={16}/>Add a family member</button>
    </div>
    {/* Choosing a family member here opens the family screen, which is where the consent and
        record-access questions are actually answered. Nothing on this card opens a record. */}
    <p className="helper"><ShieldCheck size={14}/>Booking for someone opens their booking, never their record. What you may see is decided in My family.</p>

    {/* One tap from the home, on both viewports. The emergency pathway was reachable only from the
        fourteenth card inside the roadmap page — the most complete journey in the build behind the
        most presses in it. It is a quiet row rather than a red button because the screen it opens
        says, in its first line, that MyThuso is not an ambulance service and that the number to dial
        is 10177; a shouting control here would argue with that before it was read. */}
    <SectionTitle title="If something is wrong now"/>
    <button className="panel reminder-row" onClick={() => open('Emergency & urgent care')}>
     <span className="tile-icon amber"><Ambulance size={20}/></span>
     <span><strong>Emergency &amp; urgent care</strong><small>Ambulance numbers first, then what MyThuso can do</small></span>
     <ChevronRight size={17}/>
    </button>
   </aside>
  </div>
 </div>;
}

export function ServicePrice({ service }: { service: Service }) {
 return <span><strong>From {money(service.price)}</strong><ArrowUpRight size={16}/></span>;
}
