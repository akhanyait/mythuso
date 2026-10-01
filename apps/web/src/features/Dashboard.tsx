import '../surface/approved-care.css';
import '../surface/patient-identity.css';
import { Suspense, lazy, useId, useState } from 'react';
import { ArrowRight, BadgeCheck, ChevronDown, ChevronRight, Clock3, Handshake, Library, MapPin, NotebookPen, Plus, Salad, Search, ShieldCheck, Siren, Zap } from 'lucide-react';
import { ServiceIcon } from '../components/UI';
import {
 Badge, Button, Card, Input, MetricCard, Tab, TabsList, MyThusoFamilyIcon, MyThusoHealthIcon, MyThusoMedicationIcon, MyThusoMessagesIcon,
 MyThusoResultsIcon, MyThusoVisitIcon
} from '../ui';
import { liveServices, money, type Service } from '../lib/catalog';
import { labels as scheduling, shortDateOf, shortWhenText, visitEnds, weekdayOf } from '../lib/scheduling';
import type { DemoVisit } from './Booking';
import { useT } from '../lib/i18n';
import { assignedNurse, nurseOfVisit } from '../lib/arrival';
import { formatValue, headlineMeasures, isInRange, labelOf, lastReview, latestSet, measureSpec, onRecord, readingSets, reviewer, seriesFor, type MeasureId } from '../lib/passport';
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
/* The trends a person watches, as peer views of one record. Systolic and diastolic are one reading taken
   once, so they are one tab with two lines; the tab's name is the part of the contract's label the two
   share ("Blood pressure — systolic" → "Blood pressure"), so nothing is typed that records.json says. */
const trendTabs: { id: string; measures: MeasureId[] }[] = [
 { id: 'pressure', measures: headlineMeasures.filter(m => m === 'systolic' || m === 'diastolic') },
 ...headlineMeasures.filter(m => m !== 'systolic' && m !== 'diastolic').map(m => ({ id: m, measures: [m] }))
];
const tabName = (measures: MeasureId[]) => measureSpec(measures[0]).label.split(' — ')[0];
const pressure = `${formatValue('systolic', latestSet.values.systolic!)}/${formatValue('diastolic', latestSet.values.diastolic!)}`;
const pressureInRange = isInRange('systolic', latestSet.values.systolic!) && isInRange('diastolic', latestSet.values.diastolic!);
const glucoseInRange = isInRange('glucose', latestSet.values.glucose!);

/* A reading's shape over the four visits, small enough to sit beside its figure. Decorative: the figure and
   its word beside it are what is read, so the drawing is hidden from assistive technology. */
function Sparkline({ id }: { id: MeasureId }) {
 const values = seriesFor(id).map(r => r.value);
 const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
 const points = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${26 - ((v - low) / span) * 22}`).join(' ');
 return <svg className="pd-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
  <polyline className="pd-draw" points={points}/>
 </svg>;
}

/* One tab's trend, drawn once when the tab is shown. The window is the readings' own with a little
   headroom, and a range edge is let in only where the readings cross it — the reasoning ClinicalChart in
   components/Chart.tsx writes out at length, kept here in its short form so a reading one point outside its
   range still draws above the band rather than inside it. The drawing has a sentence for a screen reader
   and every value is also printed underneath as text, so the picture is never the only way to read it. */
function Trend({ measures }: { measures: MeasureId[] }) {
 const series = measures.map(id => ({ id, spec: measureSpec(id), readings: seriesFor(id) }));
 const all = series.flatMap(s => s.readings.map(r => r.value));
 const spread = Math.max(...all) - Math.min(...all) || 1;
 let low = Math.min(...all) - spread * 0.3, high = Math.max(...all) + spread * 0.3;
 for (const { spec } of series) {
  if (Math.min(...all) < spec.low) low = Math.min(low, spec.low - spread * 0.15);
  if (Math.max(...all) > spec.high) high = Math.max(high, spec.high + spread * 0.15);
 }
 const W = 320, H = 120;
 const x = (i: number, n: number) => (n < 2 ? W / 2 : (i / (n - 1)) * (W - 24) + 12);
 const y = (v: number) => H - 8 - ((v - low) / (high - low)) * (H - 16);
 const clampY = (v: number) => Math.min(Math.max(y(v), 0), H);
 const first = series[0];
 const labels = first.readings.map(r => r.label);
 const summary = series.map(({ spec, readings }) => {
  const latest = readings[readings.length - 1];
  return `${spec.label}: ${readings.map(r => `${formatValue(spec.id, r.value)} on ${r.label}`).join(', ')}. The latest, ${formatValue(spec.id, latest.value)} ${spec.unit}, is ${isInRange(spec.id, latest.value) ? 'inside' : 'outside'} the indicative range of ${spec.low} to ${spec.high}.`;
 }).join(' ');
 return <figure className="pd-trend">
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
   {[0.25, 0.5, 0.75].map(f => <line key={f} className="pd-trend__grid" x1="0" x2={W} y1={H * f} y2={H * f}/>)}
   {/* One measure: its range as a lane. Two measures' lanes overlap and flood the plot, so each is drawn as
       its upper limit instead — the edge a blood pressure reading is actually watched against. */}
   {series.length === 1
    ? <rect className="pd-trend__band" x="0" width={W} y={clampY(first.spec.high)} height={Math.max(clampY(first.spec.low) - clampY(first.spec.high), 0)}/>
    : series.map(({ id, spec }, s) => <line key={`limit-${id}`} className={s ? 'pd-trend__limit pd-trend__limit--second' : 'pd-trend__limit'} x1="0" x2={W} y1={clampY(spec.high)} y2={clampY(spec.high)}/>)}
   {series.map(({ id, readings }, s) => {
    const d = readings.map((r, i) => `${i ? 'L' : 'M'}${x(i, readings.length).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ');
    return <g key={id} className={s ? 'pd-draw pd-trend__series pd-trend__series--second' : 'pd-draw pd-trend__series'}>
     {series.length === 1 && <path className="pd-trend__area" d={`${d} L${x(readings.length - 1, readings.length)} ${H} L${x(0, readings.length)} ${H} Z`}/>}
     <path className="pd-trend__line" d={d}/>
     {readings.map((r, i) => {
      const outside = !isInRange(id, r.value);
      const at = { x1: x(i, readings.length), x2: x(i, readings.length), y1: y(r.value), y2: y(r.value) };
      return <g key={r.label} className={outside ? 'pd-trend__point is-outside' : 'pd-trend__point'}><line {...at}/><line {...at} className="pd-trend__hole"/></g>;
     })}
    </g>;
   })}
  </svg>
  <figcaption className="pd-trend__axis"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></figcaption>
 </figure>;
}

function HealthTabs({ navigate }: { navigate: (s: string) => void }) {
 const [tab, setTab] = useState(trendTabs[0].id);
 const base = useId();
 const current = trendTabs.find(t => t.id === tab) ?? trendTabs[0];
 return <Card className="pd-health" padding="md" aria-labelledby={`${base}-title`} role="region">
  <div className="pd-card-head">
   <div>
    <h2 id={`${base}-title`} className="pd-card-title">Your health over time</h2>
    <p className="pd-card-lead">{onRecord}</p>
   </div>
   <TabsList aria-label="Readings to show">
    {trendTabs.map(t => <Tab key={t.id} id={`${base}-${t.id}`} aria-controls={`${base}-panel`} active={t.id === tab} onClick={() => setTab(t.id)}>{tabName(t.measures)}</Tab>)}
   </TabsList>
  </div>
  {/* Keyed on the tab, so the panel is mounted afresh and its line draws once each time it is shown. */}
  <div key={current.id} id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${current.id}`} className="pd-health__panel">
   <dl className="pd-health__latest">
    {current.measures.map(id => {
     const value = latestSet.values[id]!;
     const spec = measureSpec(id);
     return <div key={id}>
      <dt>{spec.label}</dt>
      <dd><strong>{formatValue(id, value)}</strong> <span>{spec.unit}</span></dd>
      <dd><Badge size="sm" variant={isInRange(id, value) ? 'success' : 'warning'} dot>{isInRange(id, value) ? 'In range' : 'Outside range'}</Badge></dd>
      <dd className="pd-muted">Indicative range {spec.low}–{spec.high} {spec.unit}</dd>
     </div>;
    })}
   </dl>
   <Trend measures={current.measures}/>
  </div>
  <div className="pd-card-foot">
   <Button variant="ghost" size="sm" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Health trends')}>Every reading, as charts and tables</Button>
  </div>
 </Card>;
}

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
 const [nextDay, nextHour] = next && next.kind !== 'asap' ? shortWhenText(next).split(' · ') : [null, null];
 const [dayNumber, monthName] = next?.date ? shortDateOf(next.date).split(' ') : [null, null];
 /* What happened lately, newest first: each visit that took readings, and the doctor's review of the last
    one on the day it was written. Read from the Passport's contract rather than composed here. */
 const history = [
  { key: 'review', day: lastReview.reviewedDayOffset, title: `${reviewer.name} reviewed your readings`, detail: lastReview.next, badge: 'Reviewed' as const },
  ...readingSets.map(set => ({ key: String(set.dayOffset), day: set.dayOffset, title: 'Home visit · readings taken',
   detail: `Blood pressure ${formatValue('systolic', set.values.systolic!)}/${formatValue('diastolic', set.values.diastolic!)} mmHg${set.note ? ` · ${set.note}` : ''}`,
   badge: isInRange('systolic', set.values.systolic!) && isInRange('diastolic', set.values.diastolic!) ? null : 'Outside range' as const }))
 ].sort((a, b) => b.day - a.day);

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

  {/* The figures, from the record. Two of them are readings and open the record they came from; the other
      two are facts about the account and are not buttons, because nothing is behind them to open. */}
  <section className="pd-metrics" aria-label="Your care at a glance">
   <MetricCard label="Next visit" value={next ? nextHour ?? 'Soon' : 'None'} icon={<MyThusoVisitIcon/>}
    trend={next ? nextDay ?? next.service.name : undefined} className="pd-metric"/>
   <button type="button" className="ui-card ui-card--default ui-card--pad-md ui-metric pd-metric pd-metric--action" onClick={() => navigate('Health Passport')}>
    <span className="ui-metric__head"><span className="ui-metric__label">Blood pressure</span><MyThusoHealthIcon/></span>
    <span className="ui-metric__value">{pressure}<small> mmHg</small></span>
    <span className="pd-metric__foot"><Badge size="sm" variant={pressureInRange ? 'success' : 'warning'} dot>{pressureInRange ? 'In range' : 'Outside range'}</Badge><Sparkline id="systolic"/></span>
   </button>
   <button type="button" className="ui-card ui-card--default ui-card--pad-md ui-metric pd-metric pd-metric--action" onClick={() => navigate('Health Passport')}>
    <span className="ui-metric__head"><span className="ui-metric__label">Blood glucose</span><MyThusoResultsIcon/></span>
    <span className="ui-metric__value">{formatValue('glucose', latestSet.values.glucose!)}<small> {measureSpec('glucose').unit}</small></span>
    <span className="pd-metric__foot"><Badge size="sm" variant={glucoseInRange ? 'success' : 'warning'} dot>{glucoseInRange ? 'In range' : 'Outside range'}</Badge><Sparkline id="glucose"/></span>
   </button>
   <MetricCard label="Doctor's review" value={labelOf(lastReview.reviewedDayOffset)} icon={<MyThusoHealthIcon/>} trend={reviewer.name} className="pd-metric"/>
  </section>

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

    <HealthTabs navigate={navigate}/>

    <Card className="pd-history" padding="md" role="region" aria-labelledby="pd-history-title">
     <div className="pd-card-head">
      <div><h2 id="pd-history-title" className="pd-card-title">Recent care</h2><p className="pd-card-lead">What your nurse recorded, and what the doctor said about it.</p></div>
      <Button variant="ghost" size="sm" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Care timeline')}>Care timeline</Button>
     </div>
     <ol className="pd-history__list">
      {history.map(item => <li key={item.key} className="pd-history__item">
       <button type="button" onClick={() => navigate('Health Passport')}>
        <time>{labelOf(item.day)}</time>
        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
        {item.badge && <Badge size="sm" variant={item.badge === 'Reviewed' ? 'primary' : 'warning'}>{item.badge}</Badge>}
       </button>
      </li>)}
     </ol>
    </Card>

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
