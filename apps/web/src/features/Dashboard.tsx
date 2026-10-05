import '../surface/approved-care.css';
import '../surface/patient-identity.css';
import { Suspense, lazy } from 'react';
import { ArrowRight, BadgeCheck, ChevronDown, ChevronRight, Clock3, Handshake, Library, MapPin, NotebookPen, Plus, Salad, Search, ShieldCheck, Siren, Zap } from 'lucide-react';
import { ServiceIcon } from '../components/UI';
import {
 Badge, Button, Card, Input, MyThusoFamilyIcon, MyThusoHealthIcon, MyThusoMedicationIcon, MyThusoMessagesIcon,
 MyThusoResultsIcon, MyThusoVisitIcon
} from '../ui';
import { liveServices, money, type Service } from '../lib/catalog';
import { labels as scheduling, shortDateOf, visitEnds, weekdayOf } from '../lib/scheduling';
import type { DemoVisit } from './Booking';
import { useT } from '../lib/i18n';
import { assignedNurse, nurseOfVisit } from '../lib/arrival';
import { labelOf, lastReview, reviewer } from '../lib/passport';
import { patientPageRoutes } from '../lib/patient-pages-routes.generated';
import { patientScreenRoutes } from '../lib/patient-screens-routes';
/* The medicine panel and the tips row read two contracts the entry does not carry; see HomeReads.tsx. */
const HomeMedicine = lazy(() => import('./HomeReads').then(m => ({ default: m.HomeMedicine })));
const HomeTips = lazy(() => import('./HomeReads').then(m => ({ default: m.HomeTips })));

/* The patient's home, on the design handoff of 28 September 2026: a welcome header that carries the next
   step, a row of figures, the readings as tabs of trends, and what has happened lately. Every figure on it
   is one the build already holds — the visit a person booked, the four reading sets and the doctor's review
   in packages/catalog/passport.json — and nothing is drawn that the record does not contain. The handoff
   also draws health goals with progress bars. No contract here defines a goal, so there is no goal on this
   screen: a progress bar towards a target nobody set is a number invented to fill a card. */
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
 /** Moves the next visit: App.tsx's own manage handler, opened on that visit with the reschedule action. */
 reschedule?: () => void;
};

/* The care plan's next check-in, written down once. It was in the reminder row's sentence and
   nowhere else, so the figure at the top of the screen and the row half a column below it could not
   have disagreed — because only one of them existed. Now both read this. */
const planDueInDays = 9;
/* The quick actions, as the export lists them, pointed at the screens this build has: every row opens a page,
   none opens a promise. The export's "Find a doctor or clinic" and "Talk to someone" have no directory and no
   counsellor behind them here, so they are not rows. */
const quickActions = [
 ['Book a nurse', 'Choose care and a time', Plus],
 ['My visits', 'Move, cancel or follow one', MyThusoVisitIcon],
 [patientScreenRoutes.results.opens, 'Results in your record', MyThusoResultsIcon],
 [patientScreenRoutes.messages.opens, 'A thread for each visit', MyThusoMessagesIcon],
 ['What happens to a prescription', 'From signature to your hand', MyThusoMedicationIcon]
] as const;
/* The export's four wellbeing tiles, as doors to the four screens that answer them without a counsellor. */
const wellbeingTiles = [
 ['Live well', 'Open your journal', 'A quiet space for your own words', NotebookPen],
 [patientPageRoutes['health-library'].opens, patientPageRoutes['health-library'].opens, 'Read about conditions and care', Library],
 [patientPageRoutes.community.opens, patientPageRoutes.community.opens, 'Helplines and where to find people', Handshake],
 [patientPageRoutes.nutrition.opens, patientPageRoutes.nutrition.opens, 'Eating well, in general terms', Salad]
] as const;
/* Initials from a name, without the title: "Dr Lerato Khumalo" is LK. */
const initialsOf = (name: string) => name.split(' ').filter(word => !/^(Dr|Sister|Mr|Ms|Mrs)\.?$/.test(word)).map(word => word[0]).join('').slice(0, 2);

export function Dashboard({ navigate, book, open, query, setQuery, visits, location, viewVisit, reschedule }: Props) {
 const t = useT();
 /* `visits` arrives soonest first (App.tsx orders it with lib/scheduling's nextFirst), so the first is next. */
 const next = visits[0];
 const nurse = next ? nurseOfVisit(next) : null;
 const [dayNumber, monthName] = next?.date ? shortDateOf(next.date).split(' ') : [null, null];
 /* `m-stagger` is motion.css's: the home's children arrive in three steps on the entrance token, once, and
    not at all for a reader who asked for stillness. It was `pd-stagger`, a class no rule matched, so the
    home was the one patient screen that arrived without its entrance. */
 return <div className="home pd m-stagger">
  {/* The welcome, and in it the one thing a person opened the home for: the next step. The mountains are
      the handoff's, at seven per cent of the accent, and are decoration hidden from assistive technology. */}
  <header className="pd-welcome">
   <span className="pd-welcome__mountain pd-welcome__mountain--one" aria-hidden="true"/>
   <span className="pd-welcome__mountain pd-welcome__mountain--two" aria-hidden="true"/>
   <div className="pd-welcome__copy">
    <p className="pd-eyebrow">Your everyday care</p>
    <h1>{t('shell.greeting')}</h1>
    <p className="pd-welcome__sub">{t('shell.greetingSub')}</p>
   </div>
   {/* Location and who the visit is for are the two things that change what everything below
       means, so they sit together at the top rather than being buried in a booking step. */}
   <div className="pd-welcome__context">
    <button className="pd-chip" onClick={() => open('Your location')}>
     <MapPin aria-hidden="true"/><span>{location}</span><ChevronDown aria-hidden="true"/>
    </button>
    <button className="pd-chip" onClick={() => navigate('My family')}>
     <span className="pd-initials" aria-hidden="true">LM</span><span>Lerato Molefe</span><ChevronDown aria-hidden="true"/>
    </button>
   </div>
   {/* The export's handwritten line, drawn with the brand's own tagline rather than a slogan written for
       the page. Decoration, so it is hidden from assistive technology and from a phone. */}
   <p className="pd-welcome__quote" aria-hidden="true">{t('shell.tagline')}</p>
  </header>

  {/* The export's appointment hero in the primary colour, and the one thing a person opened the home for:
      what is arranged next. Its facts are the booked visit's own; the nurse is the one lib/arrival.ts assigns
      to the visit's suburb, drawn as initials because there is no photograph of anybody to draw. The export's
      "Join online" is not here — a home visit is not a call. With nothing booked it says so, and offers the
      booking rather than an empty frame. */}
  <div className="pd-lead">
   <section className={`pd-hero${next ? '' : ' is-empty'}`} aria-labelledby="pd-hero-title">
    {next ? <>
     <div className="pd-hero__who">
      <span className="pd-hero__initials" aria-hidden="true">{nurse?.initials}</span>
      <span><strong>{nurse?.name}</strong><small>{nurse?.role}</small><small>Sample assignment</small></span>
     </div>
     <div className="pd-hero__body">
      <p className="pd-hero__eyebrow">{t('shell.nextVisit')}</p>
      <h2 id="pd-hero-title">{next.service.name}</h2>
      <ul className="pd-hero__facts">
       <li><MapPin aria-hidden="true"/>{next.address}</li>
       <li><MyThusoFamilyIcon/>For {next.person}</li>
       {next.kind === 'asap' ? <li><Zap aria-hidden="true"/>Looking for the nearest nurse</li> : <li><Clock3 aria-hidden="true"/>{next.service.duration} minutes</li>}
      </ul>
      <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={viewVisit}>
       {next.status === 'Confirmed' ? 'Prepare for my visit' : 'View visit details'}
      </Button>
     </div>
     <div className="pd-hero__when">
      {next.date && dayNumber ? <div className="pd-hero__date">
       <span>{weekdayOf(next.date)}</span><strong>{dayNumber}</strong><span>{monthName}</span>
      </div> : <div className="pd-hero__date"><Zap aria-hidden="true"/><span>{scheduling.asapPending}</span></div>}
      {next.start && <p className="pd-hero__time"><Clock3 aria-hidden="true"/>{next.start} – {visitEnds(next)}</p>}
      <Badge size="sm" variant={next.kind === 'asap' ? 'warning' : 'neutral'}>{next.status}</Badge>
      {reschedule && next.kind !== 'asap' && <Button variant="ghost" className="pd-hero__move" onClick={reschedule}>Reschedule</Button>}
     </div>
    </> : <>
     <div className="pd-hero__body">
      <p className="pd-hero__eyebrow">{t('shell.nextVisit')}</p>
      <h2 id="pd-hero-title">{scheduling.noUpcoming}</h2>
      <p className="pd-hero__lead">{scheduling.noUpcomingDetail}</p>
      <div className="pd-hero__actions">
       <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Book a nurse')}>{t('nav.Book a nurse')}</Button>
       <Button variant="ghost" className="pd-hero__move" onClick={() => navigate('My visits')}>{t('cta.allVisits')}</Button>
      </div>
      {/* What booking one would set going, where the empty frame would otherwise be: the intended journey,
          which stood on its own card at the foot of the aside until the hero took the visit's place. */}
      <ol className="pd-hero__journey" aria-label="Care, made simple">
       <li><Search aria-hidden="true"/><span><strong>Find your care</strong><small>Understand the options.</small></span></li>
       <li><MyThusoFamilyIcon/><span><strong>A nurse comes to you</strong><small>Support in a familiar place.</small></span></li>
       <li><MyThusoHealthIcon/><span><strong>A doctor reviews</strong><small>The clinician makes the decision.</small></span></li>
      </ol>
      <p className="pd-hero__note">The intended care journey. This preview does not deliver care.</p>
     </div>
    </>}
   </section>

   <Card className="pd-actions" padding="md" role="region" aria-labelledby="pd-actions-title">
    <h2 id="pd-actions-title" className="pd-card-title">Quick actions</h2>
    <div className="pd-actions__list">{quickActions.map(([target, note, Icon]) =>
     <button type="button" className="pd-row" key={target} onClick={() => navigate(target)}>
      <span className="pd-tile"><Icon/></span>
      <span><strong>{target}</strong><small>{note}</small></span>
      <ArrowRight aria-hidden="true"/>
     </button>)}</div>
    {/* The care plan's next check-in, kept from the visit card this panel replaced. */}
    <button type="button" className="pd-row pd-row--plan" onClick={() => navigate('Care plans')}>
     <span className="pd-row__figure">{planDueInDays}<small>days</small></span>
     <span><strong>Your next check-in</strong><small>Chronic Routine</small></span>
     <ChevronRight aria-hidden="true"/>
    </button>
   </Card>
  </div>

  <div className="pd-columns">
   <div className="pd-main">
    <section className="pd-book" aria-labelledby="pd-book-title">
     <div className="pd-section-head"><h2 id="pd-book-title">Care you can book today</h2></div>
     <form className="pd-search" role="search" onSubmit={e => { e.preventDefault(); navigate('Book a nurse'); }}>
      <Search aria-hidden="true" className="pd-search__icon"/>
      <Input aria-label="Search for care" placeholder="What care do you need today?" value={query} onChange={e => setQuery(e.target.value)}/>
      <Button type="submit" variant="secondary" aria-label="Search">Search</Button>
     </form>
     {/* Four services, one card each: the name, the price as the figure, how long it takes. White, like
         every card here — the category tints they wore until 28 September said nothing a reader could use. */}
     <div className="pd-services">
      {liveServices.slice(0, 4).map(service => <button key={service.id} className="shortcut-row pd-service" onClick={() => book(service)}>
       <span className="pd-tile"><ServiceIcon name={service.icon} size={20}/></span>
       <strong>{service.name}</strong>
       <span className="pd-service__meta"><strong>{money(service.price)}</strong><small>{service.duration} min</small></span>
       <ChevronRight aria-hidden="true" className="pd-service__go"/>
      </button>)}
     </div>
    </section>

    {/* The export's four wellbeing tiles. Each opens a screen that exists; none of them is a session with
        somebody, because there is nobody here to book one with. */}
    <section className="pd-wellbeing" aria-labelledby="pd-wellbeing-title">
     <div className="pd-section-head"><h2 id="pd-wellbeing-title">Make room for you.</h2></div>
     <div className="pd-wellbeing__tiles">{wellbeingTiles.map(([target, title, note, Icon]) =>
      <button type="button" className="pd-row pd-wellbeing__tile" key={target} onClick={() => navigate(target)}>
       <span className="pd-tile"><Icon aria-hidden="true"/></span>
       <span><strong>{title}</strong><small>{note}</small></span>
      </button>)}</div>
    </section>
   </div>

   <div className="pd-aside">
    <Suspense fallback={<Card className="pd-medicine" padding="md"><h2 className="pd-card-title">Your medicine</h2><p className="pd-card-lead" role="status">Opening your medicine.</p></Card>}>
     <HomeMedicine navigate={navigate}/>
    </Suspense>

    {/* The export's care team, from the two people the record already names: the reviewing doctor in
        passport.json and the nurse lib/arrival.ts assigns to the home suburb. The export's third row, a
        clinic, is not drawn — MyThuso has no clinic. */}
    <Card className="pd-team" padding="md" role="region" aria-labelledby="pd-team-title">
     <div className="pd-card-head">
      <h2 id="pd-team-title" className="pd-card-title">Your care team</h2>
      <Button variant="ghost" size="sm" onClick={() => navigate('Your care team')}>See who</Button>
     </div>
     {[[initialsOf(reviewer.name), reviewer.name, `Reviewing doctor · ${reviewer.registration}`], [assignedNurse.initials, assignedNurse.name, assignedNurse.role]].map(([initials, name, detail]) =>
      <button type="button" className="pd-row" key={name} onClick={() => navigate('Your care team')}>
       <span className="pd-initials" aria-hidden="true">{initials}</span>
       <span><strong>{name}</strong><small>{detail}</small></span>
       <ChevronRight aria-hidden="true"/>
      </button>)}
    </Card>

    {/* In the place of the export's "daily insight": not a verdict written by the assistant about the
        readings, but the words the reviewing doctor wrote, with who wrote them and when. */}
    <Card className="pd-said" padding="md" role="region" aria-labelledby="pd-said-title">
     <div className="pd-card-head">
      <h2 id="pd-said-title" className="pd-card-title">What your doctor said</h2>
      <Badge size="sm" variant="primary">Reviewed</Badge>
     </div>
     <blockquote className="pd-said__words"><p>{lastReview.assessment}</p></blockquote>
     <p className="pd-said__who"><BadgeCheck aria-hidden="true"/>{reviewer.name}, {labelOf(lastReview.reviewedDayOffset)} · a sample review</p>
     <div className="pd-card-foot">
      <Button variant="ghost" size="sm" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Health Passport')}>The plan, in your Health Passport</Button>
     </div>
    </Card>

    <Card className="pd-family" padding="md" role="region" aria-labelledby="pd-family-title">
     <div className="pd-card-head">
      <h2 id="pd-family-title" className="pd-card-title">Your circle of care</h2>
      <Button variant="ghost" size="sm" onClick={() => navigate('My family')}>My family</Button>
     </div>
     {/* "Sponsored care" used to be a word with nothing behind it: every row on this card went to
         the family list, including the one naming a thing the family list does not answer. It goes
         to the statement now — what has been used, what it cost, and what paying for it does not
         let you see. */}
     {[['NM', 'Nomsa Molefe', 'Mother · Sponsored care', 'Care you sponsor'], ['TM', 'Thabo Molefe', 'Your son · 8 years', 'My family']].map(([initial, name, detail, target]) =>
      <button className="pd-row" key={name} onClick={() => navigate(target)}>
       <span className="pd-initials" aria-hidden="true">{initial}</span>
       <span><strong>{name}</strong><small>{detail}</small></span>
       <ChevronRight aria-hidden="true"/>
      </button>)}
     <button className="pd-row pd-row--add" onClick={() => open('Add a family member')}><span className="pd-tile"><Plus aria-hidden="true"/></span><span><strong>Add a family member</strong></span></button>
     {/* Choosing a family member here opens the family screen, which is where the consent and
         record-access questions are actually answered. Nothing on this card opens a record. */}
     <p className="pd-note"><ShieldCheck aria-hidden="true"/>Booking for someone opens their booking, never their record. What you may see is decided in My family.</p>
    </Card>

    {/* One tap from the home, on both viewports. The emergency pathway was reachable only from the
        fourteenth card inside the roadmap page — the most complete journey in the build behind the
        most presses in it. It is a quiet row rather than a red button because the screen it opens
        says, in its first line, that MyThuso is not an ambulance service and that the number to dial
        is 10177; a shouting control here would argue with that before it was read. */}
    <Card className="pd-urgent" padding="md" role="region" aria-labelledby="pd-urgent-title">
     <h2 id="pd-urgent-title" className="pd-card-title">If something is wrong now</h2>
     <button className="pd-row" onClick={() => open('Emergency & urgent care')}>
      <span className="pd-tile pd-tile--due"><Siren aria-hidden="true"/></span>
      <span><strong>Emergency &amp; urgent care</strong><small>Ambulance numbers first, then what MyThuso can do</small></span>
      <ChevronRight aria-hidden="true"/>
     </button>
    </Card>

   </div>
  </div>

  {/* The export's tips row: each tip's tag and title, the door to the tips screen, and the reviewer notice. */}
  <Suspense fallback={null}><HomeTips navigate={navigate}/></Suspense>
 </div>;
}
