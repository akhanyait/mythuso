import { Ambulance, ArrowRight, ArrowUpRight, CalendarPlus, ChevronDown, ChevronRight, Clock3, MapPin, Plus, Search, ShieldCheck, Stethoscope, Zap } from 'lucide-react';
import { SectionTitle, Pill, ServiceIcon } from '../components/UI';
import { Metric, Metrics } from '../surface/Surface';
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
 /** Opens the visit this card is about. It used to hand a formatted string to a dialog that then
     re-derived a visit from it; the visit is the thing, so the visit is what is opened. */
 viewVisit: () => void;
};

/* The care plan's next check-in, written down once. It was in the reminder row's sentence and
   nowhere else, so the figure at the top of the screen and the row half a column below it could not
   have disagreed — because only one of them existed. Now both read this. */
const planDueInDays = 9;
/* The three readings the home leads with, as figures rather than as rows.
 *
 * This is the reference's signature and the inversion of what this product did everywhere: a small
 * label above a heavy number becomes a status chip above a large light one, with the name beneath.
 * Two of them are values a nurse recorded; the third is a count of days, which is a figure a person
 * can act on in a way that "your plan is active" is not. The one result that has no number — a full
 * blood count a doctor has not finished with — stays a row underneath, because a reading that is
 * still a sentence should not be drawn as though it were a measurement. */
const leadReadings = [
 { value: '118/78', unit: 'mmHg', label: 'Blood pressure', chip: 'In range' },
 { value: '5.4', unit: 'mmol/L', label: 'Blood glucose', chip: 'In range' }
] as const;

export function Dashboard({ navigate, book, open, query, setQuery, visits, location, viewVisit }: Props) {
 const t = useT();
 const next = visits[0];
 return <div className="home">
  <header className="home-head rise">
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

  {/* The order this file already argued for — who and where, what is already arranged, how to
      arrange the next thing, then the rest — was only true on a wide screen. On a phone the whole
      of the second column came after the whole of the first, so "your next visit" sat about
      fourteen hundred pixels below a greeting that had just asked who the visit was for. The
      appointment is its own area now: top right beside the care column on a wide screen, directly
      under the greeting on a narrow one. */}
  {/* The figures, directly on the ground rather than inside a card. A metric that sits in a box is a
      card of numbers; a metric on the ground with a chip floating above it is the thing the founder
      pointed at, and it is what makes the top of this screen read as calm rather than as busy. */}
  {/* The check-in is the one on the lime tile, and the two readings beside it are not. That is a
      clinical decision rather than a visual one: a reading singled out in colour reads as a verdict
      on that reading, and this product does not issue verdicts — a doctor does, in words, with a
      name against them. A countdown to something the person has to arrange carries no such
      implication, and it is also the only figure on the strip they can act on today. */}
  <Metrics>
   {leadReadings.map(r => <Metric key={r.label} value={r.value} unit={r.unit} label={r.label} chip={r.chip}/>)}
   <Metric value={String(planDueInDays)} unit="days" label="Until your next check-in" chip="Chronic Routine" lead/>
  </Metrics>

  <div className="home-columns">
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
      <span className="avatar nurse-avatar">SN</span>
      <div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div>
      <ChevronRight size={18}/>
     </div>
    </button> : <div className="panel glass lead empty-visit">
     <span className="glow"><span className="tile-icon"><CalendarPlus size={21}/></span></span>
     <strong>{scheduling.noUpcoming}</strong>
     <p>{scheduling.noUpcomingDetail}</p>
     <button className="secondary full" onClick={() => navigate('Book a nurse')}>{t('nav.Book a nurse')}<ArrowRight size={16}/></button>
    </div>}
   </section>

   <div className="home-main rise-2">
    <form className="search-field" role="search" onSubmit={e => { e.preventDefault(); navigate('Book a nurse'); }}>
     <Search size={19}/>
     <input aria-label="Search for care" placeholder="What care do you need today?" value={query} onChange={e => setQuery(e.target.value)}/>
     <button className="primary search-go" type="submit" aria-label="Search"><Search size={17}/><span aria-hidden="true">Search</span></button>
    </form>
    <button className="primary full book-cta" onClick={() => navigate('Book a nurse')}>
     <Stethoscope size={19}/>{t('nav.Book a nurse')}<ArrowRight size={17}/>
    </button>

    {/* No action on this heading. It carried a "Book a nurse" link directly beneath a full-width
        "Book a nurse" button, going to the same screen — three ways to say the same thing inside
        one hundred and twenty pixels, which is how a screen ends up feeling busy without carrying
        anything more. Every row underneath opens booking anyway. */}
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

    {/* What is left of the results panel once the two measurements have moved to the top of the
        screen as figures: the one result that is still a sentence rather than a number. */}
    <SectionTitle title="Waiting on a doctor" action={t('cta.passport')} onClick={() => navigate('Health Passport')}/>
    <div className="panel result-list">
     <button className="result-row" onClick={() => navigate('Health Passport')}>
      <span><strong>Full blood count</strong><small>Awaiting doctor review</small></span>
      <Pill tone="amber">With a doctor</Pill>
     </button>
    </div>

    <section className="promo-card">
     <div>
      <h2>Your health. One safe place.</h2>
      <p>Every visit, reading and result, in a record you own and control.</p>
      <button className="secondary" onClick={() => navigate('Health Passport')}>{t('cta.passport')}<ArrowRight size={16}/></button>
     </div>
    </section>
   </div>

   <aside className="home-side rise-3">
    <SectionTitle title="Care plan" action="Care plans" onClick={() => navigate('Care plans')}/>
    <button className="panel reminder-row" onClick={() => navigate('Care plans')}>
     <span className="tile-icon amber"><Clock3 size={20}/></span>
     <span><strong>Chronic Routine</strong><small>Monthly check-in · due in {planDueInDays} days</small></span>
     <ChevronRight size={17}/>
    </button>

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
