import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Apple, ArrowLeft, ArrowRight, Bandage, CalendarClock, CalendarDays, ChevronDown, ClipboardList, Clock3, FileText, Heart, House, IdCard, Leaf, Lock, MapPin, Menu, MessagesSquare, Moon, PersonStanding, ShieldCheck, Stethoscope, UserRoundPlus, Users, UsersRound, Wallet, X } from 'lucide-react';
import { ServiceIcon } from '../components/UI';
import { businessModel, liveServices, money, services } from '../lib/catalog';
import { isTiered, monthlyPrices, tiers as momTiers } from '../lib/mom-plans';
import { capabilities, connectedCount } from '../lib/capabilities';
import { capabilityById, roleById } from '../lib/vetting';
import { MotionPause } from '../components/MotionPause';
import { useAmbientVisibility, useDecor, useReveal, useScrollProgress } from '../lib/motion';
import { searchForSection } from '../lib/roles';
import { roleFor, sectionFor, slides, standing, type HeroDestination, type HeroIcon } from '../lib/hero';
/* Editorial photographs share the hero's natural light and retain the full composition. */
const familyRecord = '/editorial/family-care.png';
const nursingStory = '/editorial/nursing-care.png';
/* Seven seconds. Long enough to read a sentence of banner copy, short enough that a reader who
   wants the next one does not reach for the arrow — and it only ever runs while the page's
   decorative-motion flag is up, so a reader who has stopped motion, or asked their system for
   less of it, is never moved on at all. */
const SLIDE_MS = 7000;
/* Public content and role dashboards share the main address. A role selects a fictional
   preview workspace; real authentication remains the identity service's responsibility. */
const appHref = '/?role=patient';
const LoginPanel = lazy(() => import('./LoginPanel'));
const PublicAssistant = lazy(() => import('./PublicAssistant'));
const nurseHref = '/?role=nurse';
const homeHref = '/';
/* And the status page, in the directory form nginx serves. Linking to the bare .html would
   take a reader through a redirect on a metered connection. */
const statusHref = '/status/';
const sections = [['how', 'How it works'], ['services', 'Services'], ['plans', 'Care plans'], ['nurses', 'For nurses'], ['safety', 'Safety']] as const;
/* The four in the hero's dark bar, derived from the list above rather than restated: everything
   except "How it works", which has its own control in the hero already. An icon per section is the
   only thing typed here, and an icon is a picture of a word that is already on the row — it is
   never the only thing saying which section this is. */
const barIcons: Record<string, React.ReactNode> = {
 services: <Stethoscope size={20}/>, plans: <Heart size={20}/>, nurses: <Users size={20}/>, safety: <ShieldCheck size={20}/>
};
const barSections = sections.filter(([id]) => id in barIcons);

/* Not one figure on this page is typed. A marketing page is exactly where a price quietly drifts
   away from the price the app charges, so every number below is read out of packages/catalog at
   build time and rendered from there. The one deliberate exception is the nurse's per-visit range
   further down, which scripts/check-boundaries.mjs reads out of this file by pattern and compares
   against the catalogue — a literal that fails the build the moment it stops being true. */
const fromPrice = Math.min(...liveServices.map(s => s.price));
const serviceCategories = ['All care', ...new Set(liveServices.map(s => s.category))];
const nurseShare = Math.round((1 - businessModel.unitEconomics.platformShare) * 100);
/* A plan is on the page when it has a price to show and arrives by phase 3. MyThuso for Mom has three
   prices and no single one, so "has a price" is asked of lib/mom-plans.ts rather than of the row. */
const plans = businessModel.subscriptions.filter(s => monthlyPrices(s).length && s.phase <= 3);
const fromPlan = Math.min(...plans.flatMap(monthlyPrices));
const momPhases = [...new Set(momTiers.map(t => t.phase))].join('–');
const nurseRole = roleById('nurse')!;
/* The checks a nurse passes before a first visit, taken from the vetting contract rather than
   described in adjectives. If a check is added to the contract it appears here; if one is removed,
   the page stops claiming it. */
const nurseChecks = nurseRole.checks;
const renewal = (months: number | null) => months === null ? 'At onboarding' : `Every ${months} months`;

/* What the platform refuses, in the contract's own words. These sentences are rendered word for
   word on all three platforms; quoting them here rather than paraphrasing them is the point. */
const refusals = ([['nurse', 'view-clinical-record'], ['nurse', 'view-protected-record'], ['doctor', 'sign-clinical-review'], ['nurse', 'write-clinical-note']] as const)
 .map(([roleId, capability]) => ({
  capability,
  title: capabilityById(capability)?.name ?? capability,
  sentence: roleById(roleId)?.grants.find(g => g.capability === capability)?.refusal ?? ''
 }));

/* The three steps and the three Thuso Pass points each carry a tint. It is keyed to a named, ordered
   thing — step 01, step 02, step 03 — rather than to a position in an array, which is the
   distinction core.css records the last tint rotation being deleted for: colouring a service by its
   index told two readers two different things and neither of them anything. Here the colour is a
   second way of saying what the number and the heading already say, it is stable, and it is never
   the only difference between two rows. */
const tints = ['lime', 'peach', 'lilac'] as const;
const steps = [
 { icon: CalendarClock, person: 'You', portrait: 'patient', title: 'You book, with the price upfront', body: 'Pick the care you need and a time that suits you. See the full price before you confirm, with no call-out fee or surprise extras.' },
 { icon: House, person: 'Your nurse', portrait: 'nurse', title: 'A registered nurse visits you', body: 'Your nurse is registered with the South African Nursing Council. They arrive with a connected kit and confirm your visit using a code only you hold.' },
 { icon: Stethoscope, person: 'Your doctor', portrait: 'doctor', title: 'Your doctor plans the next step', body: 'A registered doctor reviews your readings and decides what comes next. They may also decide to visit you at home. Their decisions and visit notes stay in your Health Passport.' }
];
const passPoints = [
 { icon: ShieldCheck, title: 'Share one visit, not a history', body: 'Access is granted entry by entry, for as long as you say, and withdrawn the moment you withdraw it.' },
 { icon: Users, title: 'Pay for someone without reading their file', body: 'Booking and paying for a family member is one decision. Seeing their record is a different one, and only they can make it.' },
 { icon: ClipboardList, title: 'Take all of it with you', body: 'Every visit, reading, result and document, exported whenever you want it, in a form another clinician can read.' }
];
/* Prices and counts are derived from the service contracts; labels use patient-facing language.
   Each card carries a named tint for its corner wash and its status dot — the same ordered set the
   steps use, keyed to the figure rather than to its position, so the colour is stable and never the
   only difference between two cards. */
const figureTints = ['mint', 'peach', 'lime', 'lilac'] as const;
const figures = [
 { source: 'Clear pricing', contract: 'services.json', value: money(fromPrice), unit: 'Starting price · per visit', label: 'Know the full price before you confirm.', tint: figureTints[0] },
 { source: 'For our nurses', contract: 'business-model.json', value: `${nurseShare}%`, unit: 'Of each launch visit fee', label: 'Paid to the nurse who cares for you.', tint: figureTints[1] },
 { source: 'Care at home', contract: 'services.json', value: String(liveServices.length), unit: 'Services at launch', label: `Available for home visits, from a catalogue of ${services.length}.`, tint: figureTints[2] },
 { source: 'Carefully checked', contract: 'vetting.json', value: String(nurseChecks.length), unit: 'Required checks', label: 'Must pass before a nurse’s first visit.', tint: figureTints[3] }
];
/* The equalizer under each figure is decoration rather than data: the same seven heights on every
   card, tinted to the card, rendered as empty elements hidden from assistive technology. It borrows
   the dashboard look without claiming a measurement the catalogue does not hold. */
const figureBars = [38, 62, 46, 78, 56, 88, 66];

function FigureValue({ value }: { value: string }) {
 return <strong className="landing-figure-value">
  <span className="visually-hidden">{value}</span>
  <span className="figure-value-visual" aria-hidden="true">{Array.from(value).map((character, index) =>
   <span key={index} className={`figure-character${/\d/.test(character) ? ' is-digit' : ' is-affix'}`}>
    <span className="figure-character-ink" style={{ ['--digit-order' as string]: index }}>{character === ' ' ? '\u00a0' : character}</span>
   </span>)}</span>
 </strong>;
}

const questions: [string, React.ReactNode][] = [
 ['Is this instead of my clinic or my doctor?',
  'No. MyThuso is designed for the routine visits that cost you a day in a queue — an injection, a chronic check, a dressing change, bloods. Anything beyond that is referred, and you are told plainly when something needs a clinic or a hospital.'],
 ['Who would actually come to my house?',
  <>A nurse registered with the South African Nursing Council, who has passed all {nurseChecks.length} of the checks listed under Safety above. You would see their name and photograph before they arrived, and they would confirm a code with you at the door.</>],
 ['What does it cost?',
  <>Visits start at {money(fromPrice)} and the price is shown in full before you book. Care plans start at {money(fromPlan)} a month. There is no membership fee and no call-out charge.</>],
 ['Do I need medical aid?',
  'No. MyThuso is being built for the majority of South Africans who have none, and it is priced for that. Payment is by card or cash, and family elsewhere in the country can pay for a visit on someone else’s behalf.'],
 ['What would happen to my health information?',
  'It would be yours. Health information is special personal information under POPIA, and the design treats it that way: you decide who sees what, for how long, and you can withdraw that at any time. Nothing on this page collects any.'],
 ['Can I book for my mother in another province?',
  'That is one of the reasons MyThuso exists. The design lets you book and pay for a family member anywhere the service runs. Seeing their records stays a separate decision that only they can make.']
];

/* The glyphs the banner's icon names resolve to.
 *
 * packages/catalog/hero.json names an idea — "stethoscope", "handover", "passport" — rather than
 * drawing one, so that iOS and Android each reach for the set they already have instead of a fourth
 * copy of an SVG arriving inside a JSON file. This is the web's answer to those names, and it is
 * exhaustive by type: a name added to the contract with nothing drawing it fails to compile rather
 * than rendering an empty disc.
 *
 * None of them is ever the only thing saying what a mark or a card is. Every one sits beside its own
 * words, which is why an icon here owes SC 1.4.11 nothing — it repeats the line next to it. */
const glyphs: Record<HeroIcon, typeof Stethoscope> = {
 nurse: UserRoundPlus, stethoscope: Stethoscope, passport: IdCard, family: Users, message: MessagesSquare,
 plaster: Bandage, walking: PersonStanding, apple: Apple, moon: Moon, calendar: CalendarDays,
 clinical: FileText, handover: UsersRound, home: House, lock: Lock, leaf: Leaf
};
function HeroGlyph({ name, size }: { name: HeroIcon; size: number }) {
 const Glyph = glyphs[name];
 return <Glyph size={size} strokeWidth={1.9} aria-hidden="true"/>;
}

/* The four destinations, as addresses. lib/hero.ts decides which section of the product each one
   means and lib/roles.ts writes it into the address, so neither a page name nor a parameter is
   typed here — and a call to action cannot promise a screen that does not exist. */
const heroHref = (goes: HeroDestination) => {
 if (roleFor(goes)) return nurseHref;
 const section = sectionFor(goes);
 return section ? `${appHref}&${searchForSection(section).slice(1)}` : appHref;
};

/* Editorial cover: one full-bleed photograph with the banner's words composed on it, and a ledge
   of secondary matter beneath. The four contract-backed stories retain their real destinations and
   accessible controls. */
const editorialPhotos: Record<string, string> = {
 'care-that-comes-to-you': '/editorial/care-at-home.png',
 'for-your-family': '/editorial/family-care.png',
 'everyday-wellbeing': '/editorial/everyday-wellbeing.png',
 'for-the-nurses': '/editorial/nursing-care.png'
};

function Hero() {
 const { playing } = useDecor();
 const [index, setIndex] = useState(0);
 const [held, setHeld] = useState(false);
 const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
 const rotating = playing && !held;
 useEffect(() => {
  if (!rotating) return;
  const timer = setTimeout(() => setIndex(i => (i + 1) % slides.length), SLIDE_MS);
  return () => clearTimeout(timer);
 }, [rotating, index]);
 const step = (by: number) => (index + by + slides.length) % slides.length;
 const named = (i: number) => `${slides[i].headline.lead} ${slides[i].headline.accent}`;
 const hold = canHover ? { onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false) } : {};
 return <section className="landing-hero editorial-hero" role="group" aria-roledescription="carousel" aria-label="MyThuso in four pictures" data-ambient="paused">
  {/* The stage. Edge to edge, and two things in one cell: the photograph as the figure, and the
      banner's own words as a layer over it. Both are the same four slides, cross-faded together.

      The words do not stand on the photograph. They stand on a panel of ink beside it on a wide
      screen and under it on a phone, and the picture keeps its own brightness — which is the whole
      point, because the first attempt at this put the headline straight onto the image and had to
      deepen a scrim until a sunlit portrait arrived as a near-black plate. What each run of type
      measured, and what the photograph's mean luminance did, are written down above .hero-stage in
      surface/revamp.css. A headline has already shipped on this project at 1.28:1; composing type
      over an image is exactly where that happens again if it is left to the eye. */}
  <div className="hero-stage">
   <figure className="landing-portrait" {...hold}>
    <div className="landing-portrait-frame">
     {slides.map((slide, i) => <div key={slide.id} className={`landing-slide${i === index ? ' is-on' : ''}`} aria-hidden={i !== index} inert={i !== index}>
      <div className="editorial-photo-visual">
       <img src={editorialPhotos[slide.id]} alt="" aria-hidden="true"
        loading={i ? 'lazy' : 'eager'} fetchPriority={i ? 'low' : 'high'} decoding="async"
        onError={event => { const img = event.currentTarget; if (!img.src.endsWith('/care-at-home.png')) img.src = '/editorial/care-at-home.png'; }}/>
      </div>
      <div className="editorial-photo-footer">
       <div className="editorial-photo-caption"><span>MYTHUSO / EVERYDAY CARE</span><strong>More life. Less waiting.</strong></div>
      <div className="editorial-photo-cards">{slide.cards.map(card => <div key={card.title} className={`landing-hero-card at-${card.at}`}>
       <span className={`landing-hero-disc tint-${card.tint}`}><HeroGlyph name={card.icon} size={20}/></span>
       <span><i>{card.title}</i>{card.lines.map(line => <span key={line}>{line}</span>)}</span>
      </div>)}</div>
      </div>
     </div>)}
    </div>
    <p className="landing-portrait-place"><MapPin size={15} aria-hidden="true"/>{standing.place}</p>
    <figcaption>{standing.photographNote}</figcaption>
   </figure>
   <div className="landing-hero-copy" {...hold}>
    {slides.map((slide, i) => <article key={slide.id} className={`landing-hero-slide${i === index ? ' is-on' : ''}`}
     aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-hidden={i !== index} inert={i !== index}>
     <div className="editorial-heading">
      <p className="landing-hero-eyebrow"><span/> {slide.eyebrow}</p>
      {/* Each half of the headline is a line inside a clipped box, so the entrance can lift it up
          from under its own baseline. The nesting is what makes the mask possible; the space
          between the two halves stays in the markup, so the accessible name is still one
          sentence. */}
      <h1>
       <span className="h1-line"><span>{slide.headline.lead}</span></span>{' '}
       <span className="h1-line landing-h1-accent"><span>{slide.headline.accent}</span></span>
      </h1>
     </div>
     <div className="editorial-intro">
      <p className="landing-hero-lede">{slide.body}</p>
      <a className="primary" href={heroHref(slide.action.goes)} tabIndex={i === index ? undefined : -1}>{slide.action.label}<ArrowRight size={18}/></a>
     </div>
    </article>)}
   </div>
  </div>

  {/* The ledge. What a reader consults rather than reads first: the price, what the visit includes,
      and the controls for the four banners. It is on paper so the stage above it stays one image,
      and the price panel is lifted into the picture's bottom edge from the width where there is
      room for it to overlap without covering anything. */}
  <div className="hero-ledge">
   <aside className="editorial-care-note">
    <span className="editorial-note-top">CARE, ON YOUR TERMS<House size={22}/></span>
    <div className="care-orbit" aria-hidden="true"><i/><i/><i/><Heart size={45} strokeWidth={1.2}/></div>
    <div><span>Home visits from</span><strong>{money(fromPrice)}<i> / visit</i></strong><p>One clear price.<br/>Care in your own space.</p></div>
    <a href="#services">Find your care<ArrowRight size={20}/></a>
    <small>Planned launch pricing</small>
   </aside>
   <div className="editorial-trust">
    {slides.map((slide, i) => <ul key={slide.id} className="landing-hero-marks" hidden={i !== index}>
     {slide.marks.map(mark => <li key={mark.icon}><span className="landing-hero-disc tint-mint"><HeroGlyph name={mark.icon} size={21}/></span><span>{mark.lines.map(line => <i key={line}>{line}</i>)}</span></li>)}
    </ul>)}
   </div>
   <div className="landing-hero-foot">
    <p className="landing-slide-index"><span className="visually-hidden">Banner </span>{String(index + 1).padStart(2, '0')}<i aria-hidden="true">/</i><span className="visually-hidden">of </span>{String(slides.length).padStart(2, '0')}</p>
    <span className={`landing-slide-rule${rotating ? '' : ' is-still'}`} aria-hidden="true" style={{ ['--slide-ms' as string]: `${SLIDE_MS}ms` }}>
     {slides.map((slide, i) => <i key={slide.id} className={i === index ? 'is-on' : ''}><b/></i>)}
    </span>
    <MotionPause/>
    <span className="landing-slide-steps">
     <button type="button" className="landing-slide-step m-press" onClick={() => setIndex(step(-1))} aria-label={`Show the previous banner: ${named(step(-1))}`}><ArrowLeft size={18}/></button>
     <button type="button" className="landing-slide-step m-press" onClick={() => setIndex(step(1))} aria-label={`Show the next banner: ${named(step(1))}`}><ArrowRight size={18}/></button>
    </span>
   </div>
  </div>

  <nav className="studio-bar-wrap" aria-label="Jump to a section"><ul className="studio-bar">
   {barSections.map(([id, label]) => <li key={id}><a href={`#${id}`}>{barIcons[id]}<span>{label}</span><i aria-hidden="true"><ArrowRight size={17}/></i></a></li>)}
  </ul></nav>
 </section>;
}

function Head({ index, eyebrow, title, body }: { index: string; eyebrow: string; title: string; body?: React.ReactNode }) {
 return <div className="landing-head" data-reveal>
  <p className="landing-eyebrow"><i>{index}</i>{eyebrow}</p>
  <h2>{title}</h2>{body ? <p className="landing-lede">{body}</p> : null}
 </div>;
}

/* The public page. It is honest about what MyThuso is today: a service being built, not one you can
   summon tonight. A health service that overstates its readiness is not a marketing problem, so the
   three statements to that effect — the banner, the caption under the photograph and the footer —
   are part of the layout rather than something tucked under it. */
export function Landing() {
 const [menu, setMenu] = useState(false);
 const [login, setLogin] = useState(false);
 const [open, setOpen] = useState<number | null>(0);
 const [serviceQuery, setServiceQuery] = useState('');
 const [serviceCategory, setServiceCategory] = useState('All care');
 const serviceSearch = useRef<HTMLInputElement>(null);
 const query = serviceQuery.trim().toLocaleLowerCase();
 const matchingServices = liveServices.filter(s =>
  (serviceCategory === 'All care' || s.category === serviceCategory) &&
  `${s.name} ${s.description} ${s.category}`.toLocaleLowerCase().includes(query));
 const resetServices = () => { setServiceQuery(''); setServiceCategory('All care'); serviceSearch.current?.focus(); };
 useReveal();
 useAmbientVisibility();
 /* This page has motion that starts on its own, so it says so. Nothing endless runs until the flag
    is up, which means a reader whose script never loaded gets a still page rather than a moving one
    with no way to stop it. */
 useDecor();
 const { y, progress } = useScrollProgress();
 return <div className="landing" style={{ ['--scroll' as string]: progress }}>
  {/* The strip above the navigation. It was already the slim near-black bar the reference puts
      there, carrying the product's name and the fact that it is a prototype; what it did not carry
      was anywhere to go. A reader told "nothing here books a visit" has an obvious next question,
      and the status page answers it capability by capability out of the same contract, so the
      sentence now ends in a door rather than in a full stop. One link and not the reference's two:
      the second would have been "open the app", which the navigation under this strip already
      offers, and a page that opens two doors into one room is a page arguing with itself. The
      count is read from packages/catalog/capabilities.json rather than typed, so the day something
      is genuinely connected this line says so without anybody remembering to edit it. */}
  <div className="landing-notice" role="status">
   <span className="status-dot"/>
   <p><strong>MyThuso is in development.</strong> This page describes a service being built in Johannesburg. Nothing here books a visit, takes a payment or sends a nurse anywhere.</p>
   <a href={statusHref}>What is connected: {connectedCount} of {capabilities.length}<ArrowRight size={14}/></a>
  </div>

  <header className={`landing-nav${y > 24 ? ' is-condensed' : ''}`}>
   <a className="landing-brand" href={homeHref}><img src="/brand/mythuso-logo.svg" alt="MyThuso"/></a>
   <nav className={menu ? 'is-open' : ''} aria-label="Sections">
    {sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}
   </nav>
   <button className="primary landing-cta" type="button" aria-haspopup="dialog" onClick={() => setLogin(true)}>Log in<ArrowRight size={16}/></button>
   <button className="icon-button landing-menu" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(m => !m)}>{menu ? <X size={20}/> : <Menu size={20}/>}</button>
   <i className="landing-progress" aria-hidden="true"/>
  </header>

  {login && <Suspense fallback={<p role="status">Opening login…</p>}><LoginPanel onClose={() => setLogin(false)}/></Suspense>}
  <Hero/>

  <section className="landing-figures" aria-label="Care, clearly explained">
   {figures.map((f, index) => <div key={f.source} className="landing-figure-card" data-tint={f.tint} data-reveal style={{ ['--figure-order' as string]: index }}>
    <span className="landing-figure-source" data-source={f.contract}>{f.source}</span>
    <FigureValue value={f.value}/>
    <p className="landing-figure-unit">{f.unit}</p>
    <span className="landing-figure-detail">{f.label}</span>
    <span className="landing-figure-bars" aria-hidden="true">
     {figureBars.map((height, bar) => <i key={bar} style={{ height: `${height}%`, ['--bar-i' as string]: bar }}/>)}
    </span>
   </div>)}
   <p className="landing-figures-note" data-reveal>Planned launch pricing and services. You will always see the full price before confirming a visit.</p>
  </section>

  <section id="how" className="landing-section" data-ambient="paused">
   <Head index="01" eyebrow="How it works" title="Your care. A team around you."
    body="Your nurse and doctor work together around your needs, including a doctor’s home visit when they decide it is needed. Software supports the team; it never diagnoses or prescribes."/>
   <ol className="landing-steps">{steps.map((s, i) => <li key={s.title} data-reveal style={{ ['--i' as string]: i }}>
    <div className="landing-step-top"><span className="landing-step-index">{String(i + 1).padStart(2, '0')}</span>
     <span className="landing-step-person-label"><s.icon size={16} aria-hidden="true"/>{s.person}</span>
    </div>
    <div className="step-person-orbit" data-tint={tints[i]} aria-hidden="true">
     <i/><i/><i/>
     <img src={`/editorial/step-${s.portrait}.jpg`} alt="" loading="lazy" decoding="async" width="144" height="144"/>
    </div>
    <h3>{s.title}</h3><p>{s.body}</p>
   </li>)}</ol>
   <p className="step-portrait-note">Illustrative portraits.</p>
   <p className="landing-note" data-reveal>The target being built to is under an hour from booking to arrival, in the areas MyThuso opens in. It is a target, not a promise, and nothing on this page dispatches anybody.</p>
  </section>

  <section id="services" className="landing-section tinted" data-ambient="paused">
   <Head index="02" eyebrow="What a nurse is sent to do" title="The visits that should not cost you a day."
    body={<>At launch a nurse can be dispatched to {liveServices.length} of the {services.length} services in the catalogue. Each price below is the price paid: no call-out fee, no charge per kilometre, and no bill afterwards that nobody mentioned.</>}/>
   <div className="landing-service-finder">
    <label className="landing-service-search" htmlFor="landing-service-search">
     <span>Find the care you need</span>
     <input ref={serviceSearch} id="landing-service-search" type="search" placeholder="Try blood tests or wound care" value={serviceQuery} onChange={e => setServiceQuery(e.target.value)} aria-controls="landing-service-results"/>
    </label>
    <div className="landing-service-categories" role="group" aria-label="Filter services by category">
     {serviceCategories.map(category => <button type="button" key={category} aria-pressed={serviceCategory === category} onClick={() => setServiceCategory(category)}>{category}</button>)}
    </div>
    <div className="landing-service-result-note">
     <p aria-live="polite" aria-atomic="true">{matchingServices.length} {matchingServices.length === 1 ? 'service' : 'services'}{serviceCategory !== 'All care' ? ` in ${serviceCategory.toLocaleLowerCase()}` : ' at launch'}</p>
     {(serviceQuery || serviceCategory !== 'All care') && <button type="button" onClick={resetServices}>Reset filters</button>}
    </div>
   </div>
   <ul id="landing-service-results" className="landing-services">{matchingServices.map((s, i) => <li key={s.id} data-reveal="shown" style={{ ['--i' as string]: i % 3 }}>
    <span className="service-icon service-icon-orbit" aria-hidden="true"><i/><i/><i/><ServiceIcon name={s.icon} size={20}/></span>
    <h3>{s.name}</h3>
    <p>{s.description}</p>
    <p className="landing-price"><strong>From {money(s.price)}</strong><span>{s.duration} min</span></p>
   </li>)}</ul>
   {matchingServices.length === 0 && <div className="landing-service-empty">
    <h3>No services match your search.</h3>
    <p>Try a shorter search or choose another category.</p>
    <button type="button" onClick={resetServices}>Show all launch services<ArrowRight size={18}/></button>
   </div>}
   <p className="landing-note" data-reveal>Later-phase services — screening bundles, men&rsquo;s health, mental-health check-ins and allied health — appear in the app marked with the phase they arrive in. None of them can be booked, here or there.</p>
  </section>

  <section className="landing-split">
   <div data-reveal>
    <p className="landing-eyebrow"><i>03</i>Thuso Pass</p>
    <h2>Your record is yours, entry by entry.</h2>
    <p className="landing-lede">Every visit, reading, result and document would land in a Health Passport that belongs to the patient rather than to MyThuso. Access is something granted, not something assumed.</p>
    <ul className="landing-points">{passPoints.map((p, i) => <li key={p.title}>
     <span className="landing-point-tile" data-tint={tints[i]}><p.icon size={18}/></span>
     <span><strong>{p.title}</strong>{p.body}</span>
    </li>)}</ul>
   </div>
   <figure className="landing-portrait" data-reveal>
    <div className="landing-story-photo"><img src={familyRecord} alt="" aria-hidden="true" loading="lazy" width="1792" height="1024"/></div>
    <figcaption>Illustrative photograph.</figcaption>
   </figure>
  </section>

  <section id="plans" className="landing-section tinted">
   <Head index="04" eyebrow="Thuso Routine" title="Care that keeps showing up."
    body={<>A chronic condition is not managed in a single visit. A plan is designed to cover the visit, the doctor review, the script and the medicine together, from {money(fromPlan)} a month.</>}/>
   {/* No plan is flagged as the popular one. Nobody has subscribed to any of these, so the phase
       each arrives in is the only thing there is to say about it that is true. */}
   {/* MyThuso for Mom has three prices, and the card shows the lowest and the highest rather than
       only the lowest: "R 399 a month" beside a plan whose Premium is R 1 299 is a figure somebody
       would reasonably expect to pay for everything the plan is known for. */}
   <ul className="landing-plans">{plans.map((s, i) => { const prices = monthlyPrices(s); return <li key={s.id} data-reveal style={{ ['--i' as string]: i }}>
    <span className="landing-phase">Phase {isTiered(s) ? momPhases : s.phase}</span>
    <span className="tile-icon"><Heart size={19}/></span>
    <h3>{s.name}</h3>
    <p className="landing-price"><strong>{money(Math.min(...prices))}</strong><span>{prices.length > 1 ? `to ${money(Math.max(...prices))} a month` : 'a month'}</span></p>
    <p>{s.includes}</p>
   </li>; })}</ul>
  </section>

  <section id="nurses" className="landing-split reverse">
   <div data-reveal>
    <p className="landing-eyebrow"><i>05</i>For nurses</p>
    {/* The share is the catalogue's, and it is said about the services this page lists — the ones a
        nurse can be sent to at launch. Some later services pay a smaller share, so "of every fee" would
        be a promise the catalogue does not keep; scripts/check-boundaries.mjs holds the words to it. */}
    <h2>Your registration. Your hours. {nurseShare}% of every launch visit.</h2>
    <p className="landing-lede">Thousands of qualified South African nurses are unemployed or on short contracts. MyThuso is designed as a marketplace rather than an agency: you would choose when you work, keep {nurseShare}% of the fee for every service offered at launch, and be paid weekly.</p>
    {/* The range below is written as two literals on purpose. scripts/check-boundaries.mjs reads
        this exact pattern out of this file and compares it against every phase-one nurse share in
        the catalogue, so the claim cannot outlive the prices it is made about. */}
    <ul className="landing-points">
     <li><Wallet size={18}/><span><strong>{money(187)}–{money(299)} a visit</strong>The nurse&rsquo;s share of each catalogue price, paid out weekly.</span></li>
     <li><Clock3 size={18}/><span><strong>The hours and areas you choose</strong>Dispatch never crosses your registered scope of practice, and the Control Tower cannot override that.</span></li>
     <li><ClipboardList size={18}/><span><strong>A kit, training and an escalation route</strong>A connected diagnostic kit, device and protocol training, and a doctor to escalate to.</span></li>
    </ul>
    <a className="secondary landing-secondary" href={nurseHref}>See the nurse's side<ArrowRight size={16}/></a>
   </div>
   <figure className="landing-portrait" data-reveal>
    <div className="landing-story-photo"><img src={nursingStory} alt="" aria-hidden="true" loading="lazy" width="1792" height="1024"/></div>
    <figcaption>Illustrative photograph.</figcaption>
   </figure>
  </section>

  <section id="safety" className="landing-section safety-section" aria-labelledby="safety-title">
   <div className="safety-heading">
    <header>
     <p className="landing-eyebrow"><i>06</i>Patient safety</p>
     <h2 id="safety-title">Safety is a condition of care.</h2>
     <p className="safety-intro">Professional registration, identity and clinical readiness must be checked before care begins. These are the nurse verification requirements for our planned launch, with review schedules shown for each check.</p>
    </header>
    <aside className="safety-standard">
     <ShieldCheck size={32} strokeWidth={1.5} aria-hidden="true"/>
     <h3>Verification is mandatory</h3>
     <p>All {nurseChecks.length} nurse checks must pass before a first visit can be accepted.</p>
    </aside>
   </div>
   <div className="safety-register-title"><h3>Nurse verification requirements</h3><span>{nurseChecks.length} required checks</span></div>
   <div className="safety-register-columns" aria-hidden="true"><span>Requirement</span><span>How it is checked</span><span>Review schedule</span></div>
   <ul className="landing-checks">{nurseChecks.map((c, i) => <li key={c.id}>
    <div className="safety-check-heading"><span className="safety-check-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><h3>{c.name}</h3></div>
    <p className="safety-check-detail">{c.detail}</p>
    <p className="landing-cadence"><Clock3 size={15} aria-hidden="true"/><span><span className="safety-review-label">Review schedule</span>{renewal(c.renewMonths)}</span></p>
   </li>)}</ul>
   <div className="landing-refusals">
    <h3>Access and clinical boundaries</h3>
    <p className="safety-boundaries-intro">Rules that protect your records and keep clinical decisions with authorised professionals.</p>
    <ul>{refusals.map(r => <li key={r.capability}>
     <strong>{r.title}</strong><p>{r.sentence}</p>
    </li>)}</ul>
   </div>
  </section>

  <section className="landing-section landing-questions">
   <Head index="07" eyebrow="Questions" title="The things people actually ask."/>
   <div className="landing-faq" data-reveal>{questions.map(([q, a], i) => <div key={q} className={open === i ? 'is-open' : ''}>
    <h3><button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{q}<ChevronDown size={19}/></button></h3>
    <div className="landing-answer" inert={open !== i}><div><p>{a}</p></div></div>
   </div>)}</div>
  </section>

  <section className="landing-final">
   <div data-reveal>
    <h2>Help. Health. Home.</h2>
    <p>A nurse at your door, a doctor on the screen, your record in your pocket. Being built in Johannesburg, for South Africa.</p>
    <a className="primary" href={appHref}>Open the app<ArrowRight size={17}/></a>
    <p className="landing-final-note">Nothing is booked and nothing is charged until the service opens. Every screen says what it is not yet connected to.</p>
   </div>
  </section>

  <Suspense fallback={null}><PublicAssistant/></Suspense>
  <footer className="landing-footer">
   <div>
    <img src="/brand/mythuso-logo.svg" alt="MyThuso"/>
    <p>MyThuso is a product of Akhanya IT Innovations (Pty) Ltd, Johannesburg. {services.length} services in the catalogue, {liveServices.length} of them at launch.</p>
   </div>
   <div className="landing-footer-note">
    <p><strong>This is a preview, not a live service.</strong> No visit can be booked, no payment taken and no clinical service provided. People shown are illustrative and are not MyThuso nurses or patients.</p>
    <p>© 2026 MyThuso · Help. Health. Home.</p>
   </div>
  </footer>
 </div>;
}
