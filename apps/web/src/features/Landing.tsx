import { useEffect, useState } from 'react';
import { Apple, ArrowLeft, ArrowRight, Bandage, CalendarClock, CalendarDays, ChevronDown, ClipboardList, Clock3, FileText, Heart, House, IdCard, Leaf, Lock, MapPin, Menu, MessagesSquare, Moon, PersonStanding, ShieldCheck, Stethoscope, UserRoundPlus, Users, UsersRound, Wallet, X } from 'lucide-react';
import { ServiceIcon } from '../components/UI';
import { businessModel, liveServices, money, services } from '../lib/catalog';
import { capabilities, connectedCount } from '../lib/capabilities';
import { capabilityById, roleById } from '../lib/vetting';
import { MotionPause } from '../components/MotionPause';
import { useDecor, useReveal, useScrollProgress } from '../lib/motion';
import { searchForSection } from '../lib/roles';
import { photographJpeg, photographWebp, roleFor, sectionFor, slides, standing, type HeroDestination, type HeroIcon } from '../lib/hero';
/* The two cut-outs the page still uses, which are the splits further down rather than the hero.
   The hero's four photographs are named by packages/catalog/hero.json and turned into addresses by
   lib/hero.ts, so nothing about which picture belongs to which slide is written here any more. */
const family = '/banners/care-that-comes-to-you-cutout.webp';
const elder = '/banners/one-safe-place-cutout.webp';
/* Seven seconds. Long enough to read a sentence of banner copy, short enough that a reader who
   wants the next one does not reach for the arrow — and it only ever runs while the page's
   decorative-motion flag is up, so a reader who has stopped motion, or asked their system for
   less of it, is never moved on at all. */
const SLIDE_MS = 7000;
/* One pair of addresses, dev and production alike. This used to be two — the dev server served the
   app at / and this page at /landing.html, the opposite way round from nginx — and that divergence
   was written up as a debt for weeks because closing it meant moving ninety-one `page.goto('/')`
   calls in the test suite. It is closed: / is the public page everywhere, /app/ is the product
   everywhere, and nothing in this repository is exercised at a path that serves the other one.

   `?role=` is the demo login's own parameter (apps/web/src/lib/roles.ts), so a link from this page
   can open the app already in a workspace — which is what "See the nurse's side" now genuinely
   does, rather than landing a curious reader on a patient's home screen. */
const appHref = '/app/';
const nurseHref = '/app/?role=nurse';
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
const nurseShare = Math.round((1 - businessModel.unitEconomics.platformShare) * 100);
const plans = businessModel.subscriptions.filter(s => s.price && s.phase <= 3);
const fromPlan = Math.min(...plans.map(s => s.price!));
const nurseRole = roleById('nurse')!;
/* The checks a nurse passes before a first visit, taken from the vetting contract rather than
   described in adjectives. If a check is added to the contract it appears here; if one is removed,
   the page stops claiming it. */
const nurseChecks = nurseRole.checks;
const renewal = (months: number | null) => months === null ? 'Verified once, at onboarding' : `Re-checked every ${months} months`;

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
 { icon: CalendarClock, title: 'You book, and see the price first', body: 'Pick what you need and a time that suits you. The full price is on the screen before you confirm — no quote, no call-out fee, nothing added afterwards.' },
 { icon: House, title: 'A registered nurse comes to you', body: 'A nurse registered with the South African Nursing Council arrives with a connected kit, and confirms it is the right house with a code only you hold.' },
 { icon: Stethoscope, title: 'A registered doctor decides', body: 'Readings go to a doctor who reviews them and decides what happens next. Their name is on the decision, and everything lands in your record.' }
];
const passPoints = [
 { icon: ShieldCheck, title: 'Share one visit, not a history', body: 'Access is granted entry by entry, for as long as you say, and withdrawn the moment you withdraw it.' },
 { icon: Users, title: 'Pay for someone without reading their file', body: 'Booking and paying for a family member is one decision. Seeing their record is a different one, and only they can make it.' },
 { icon: ClipboardList, title: 'Take all of it with you', body: 'Every visit, reading, result and document, exported whenever you want it, in a form another clinician can read.' }
];
/* Four figures, each one derived from a contract rather than asserted. A statistic that has to be
   typed into a marketing page is a statistic nothing can hold to account.

   Each one carries the file it was read out of, on the page, in a chip above the numeral. The
   figure was already derived; naming the source turns that from something a reader has to take on
   trust into something they can go and open. The file name is the only part typed here, and a file
   name is a structure rather than a claim — if one moves, the import above it stops compiling. */
const figures = [
 { source: 'services.json', value: money(fromPrice), label: 'Where a visit starts. The whole price is shown before you confirm.' },
 { source: 'business-model.json', value: `${nurseShare}%`, label: 'Of every visit fee is paid to the nurse who did the visit.' },
 { source: 'services.json', value: String(liveServices.length), label: `Services a nurse can be dispatched to at launch, from a catalogue of ${services.length}.` },
 { source: 'vetting.json', value: String(nurseChecks.length), label: 'Checks that must pass before a nurse attends a first visit.' }
];

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
 return section ? `${appHref}${searchForSection(section)}` : appHref;
};

/* The hero, which is the founder's four banners drawn rather than shown.
 *
 * He supplied four finished 1774×887 compositions on 13 September and asked for the pieces loose:
 * "strip the images and exact text and other assets to make them loose and apply them dynamically".
 * packages/catalog/hero.json is what came out of taking them apart, and every word below is read
 * from it. Nothing in this function is typed copy — if a sentence is wanted on this banner it goes
 * in the contract, because a picture of a headline is a headline nobody can translate, nobody can
 * tab to and no screen reader can read, and eleven locales carry this product's interface.
 *
 * SO EVERYTHING THAT WAS A PIXEL IS AN ELEMENT. The eyebrow is a pill, the headline is one sentence
 * in two tones, the call to action is a link that genuinely goes somewhere, the three trust marks
 * are tinted discs with their own words beside them, and the two floating cards are boxes over the
 * photograph. The photograph is the only thing left that is a photograph.
 *
 * A CAROUSEL IS THE MOST DANGEROUS THING ON THIS PAGE, and the rules the last one was written to are
 * unchanged — docs/ARCHITECTURE.md records the afternoon the one before that cost.
 *
 *   Nothing moves a box. Both halves of a slide are stacked in one grid cell with every sibling and
 *   cross-fade on opacity, so each column is the height of its tallest slide in every frame of the
 *   change and between changes. There is no track sliding sideways.
 *
 *   Rotation is the page's decorative-motion flag and not a second system. `useDecor()` is the same
 *   hook the hero's drifting lines answer to and the same one `<MotionPause/>` clears, so the one
 *   control below the copy stops the four slides, the lines and the wash behind the photograph
 *   together — which is the mechanism WCAG 2.2.2 asks for rather than three of them.
 *
 *   Reduced motion removes it rather than shortening it. The flag is never set for a reader who has
 *   asked their system for less, so nothing rotates, no pause control is rendered, and the first
 *   slide is simply the banner. The arrows still work.
 *
 *   Only the slide showing exists for a reader. The other three are inert and visibility:hidden in
 *   both columns, so they are out of the tab order, out of the accessibility tree, and out of the
 *   text a page search — or the contrast audit in tests/landing.spec.ts — walks. That is also what
 *   keeps exactly one <h1> and exactly one call to action on the page at a time.
 *
 * THE TWO STANDING LINES ARE NOT PART OF A SLIDE. The place note above the picture and the
 * photography disclosure below it are in the figure itself, where they are on all four at once: a
 * sentence saying nobody in these photographs is a MyThuso nurse is not something a rotation may
 * carry off the screen. Both sit where the founder put them, at the top and bottom right of the
 * picture, rather than in a footnote — that is where somebody looking at a face actually looks. */
function Hero() {
 const { playing } = useDecor();
 const [index, setIndex] = useState(0);
 /* Holding still while somebody is actually reading the banner. A pointer that genuinely hovers is
    the only one this listens to: on a touch screen the browser synthesises a mouseenter under a
    finger and never a leave, so hover-to-pause there is a carousel that stops for the rest of the
    visit the first time it is tapped. The pause control and the arrows are what a touch reader
    has, and both work. */
 const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
 const [held, setHeld] = useState(false);
 const rotating = playing && !held;
 /* A timeout rather than an interval, keyed on the slide showing. Pressing an arrow therefore
    restarts the seven seconds instead of inheriting whatever was left of them — a reader who has
    just asked for the next banner should not be moved on again half a second later. */
 useEffect(() => {
  if (!rotating) return;
  const timer = setTimeout(() => setIndex(i => (i + 1) % slides.length), SLIDE_MS);
  return () => clearTimeout(timer);
 }, [rotating, index]);
 const step = (by: number) => (index + by + slides.length) % slides.length;
 const go = (by: number) => setIndex(step(by));
 /* What a slide is called, for an arrow's label and a screen reader's slide name: its own headline,
    both tones, in the contract's words. Nothing here invents a name for a slide. */
 const named = (i: number) => `${slides[i].headline.lead} ${slides[i].headline.accent}`;
 /* Held while the pointer is over something a person is reading — the words or the picture — and
    not while it is over the controls. It used to be the whole section, and that turned pressing
    Play into a control that appeared to do nothing: the cursor that had just pressed it was still
    inside the banner, so the carousel came straight back to a stop. */
 const hold = canHover ? { onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false) } : {};
 return <section className="landing-hero" role="group" aria-roledescription="carousel" aria-label="MyThuso in four pictures">
  <div className="landing-hero-column">
   <div className="landing-hero-copy" {...hold}>
    {slides.map((slide, i) => <article key={slide.id} className={`landing-hero-slide${i === index ? ' is-on' : ''}`}
     aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-hidden={i !== index} inert={i !== index}>
     {/* The eyebrow is a peach pill with the word in ink. It is orange in the supplied art and it
         cannot be here: brandOrange measures 2.67:1 on this ground, and the brand's own rule in
         packages/design-tokens/tokens.json is that it is the chevron and never a word. The tint it
         sat on is kept, so the pill still reads warm; ink on peach at 42% over paper is 11.04. */}
     <p className="landing-hero-eyebrow">{slide.eyebrow}</p>
     {/* One sentence in two tones, split where the contract splits it rather than at a line break —
         a headline coloured by where the text happens to wrap says something different on every
         screen. The accent is the brand green at 3.19:1 on paper, which SC 1.4.3 allows because
         this is large text and nothing smaller on this page is ever set in it. The space between
         the two spans is what keeps the accessible name one sentence. */}
     <h1><span>{slide.headline.lead}</span>{' '}<span className="landing-h1-accent">{slide.headline.accent}</span></h1>
     <p className="landing-hero-lede">{slide.body}</p>
     {/* A real button that navigates, which is the whole argument for taking these apart: in the
         supplied JPEG it is a rectangle that does nothing. Where each destination leads is in
         lib/hero.ts, and two of the four open a section of the app rather than its front door. */}
     <a className="primary" href={heroHref(slide.action.goes)} tabIndex={i === index ? undefined : -1}>
      {slide.action.label}<ArrowRight size={18}/>
     </a>
     {/* The three trust marks. The tint alternates by position — mint, peach, mint — because that
         is rhythm rather than meaning, and it is never the only thing separating two marks: each
         has its own glyph and its own two words. The contract gives the marks no tint of their
         own, which is why this is the one thing on the banner decided here rather than there. */}
     <ul className="landing-hero-marks">
      {slide.marks.map((mark, n) => <li key={mark.icon}>
       <span className={`landing-hero-disc ${n % 2 ? 'tint-peach' : 'tint-mint'}`}><HeroGlyph name={mark.icon} size={21}/></span>
       <span>{mark.lines.map(line => <i key={line}>{line}</i>)}</span>
      </li>)}
     </ul>
    </article>)}
   </div>
   {/* The controls, at the foot of the copy where the supplied art puts the counter: which of four,
       how long this one has left, the page's pause control, and the two arrows. */}
   <div className="landing-hero-foot">
    <p className="landing-slide-index"><span className="visually-hidden">Banner </span>{String(index + 1).padStart(2, '0')}<i aria-hidden="true">/</i><span className="visually-hidden">of </span>{String(slides.length).padStart(2, '0')}</p>
    {/* Segments rather than a bar, which is how docs/DESIGN-LANGUAGE.md draws progress everywhere
        else on this page. The current segment fills over the seven seconds so a reader can see the
        next banner coming instead of being surprised by it — a finite animation, on a child with
        nothing in it, gated on the same flag, and held still while the pointer is. */}
    <span className={`landing-slide-rule${rotating ? '' : ' is-still'}`} aria-hidden="true" style={{ ['--slide-ms' as string]: `${SLIDE_MS}ms` }}>
     {slides.map((slide, i) => <i key={slide.id} className={i === index ? 'is-on' : ''}><b/></i>)}
    </span>
    <MotionPause/>
    {/* The two arrows are one group so that a narrow row wraps them together. Loose, the second one
        dropped onto a line of its own under a 390px phone and sat there as a single orphan. */}
    <span className="landing-slide-steps">
     <button type="button" className="landing-slide-step m-press" onClick={() => go(-1)} aria-label={`Show the previous banner: ${named(step(-1))}`}><ArrowLeft size={18}/></button>
     <button type="button" className="landing-slide-step m-press" onClick={() => go(1)} aria-label={`Show the next banner: ${named(step(1))}`}><ArrowRight size={18}/></button>
    </span>
   </div>
  </div>
  <figure className="landing-portrait" {...hold}>
   <p className="landing-portrait-place"><MapPin size={15} aria-hidden="true"/>{standing.place}</p>
   <div className="landing-portrait-frame">
    {slides.map((slide, i) => <div key={slide.id} className={`landing-slide${i === index ? ' is-on' : ''}`}
     aria-hidden={i !== index} inert={i !== index}>
     {/* WebP first and the same crop as a JPEG behind it, and only the banner showing first is
         fetched eagerly — three more photographs on a metered connection before anybody has asked
         for them is exactly what this product may not do. */}
     <img src={photographWebp(slide)} alt="" aria-hidden="true"
      loading={i ? 'lazy' : 'eager'} fetchPriority={i ? 'low' : 'high'} decoding="async"
      onError={event => { const img = event.currentTarget; if (!img.src.endsWith('.jpg')) img.src = photographJpeg(slide); }}/>
     {slide.cards.map(card => <div key={card.title} className={`landing-hero-card at-${card.at}`}>
      <span className={`landing-hero-disc tint-${card.tint}`}><HeroGlyph name={card.icon} size={20}/></span>
      <span><i>{card.title}</i>{card.lines.map(line => <span key={line}>{line}</span>)}</span>
     </div>)}
    </div>)}
   </div>
   <figcaption>{standing.photographNote}</figcaption>
  </figure>
  {/* The dark bar across the foot of the hero. It is the four sections under this one, taken from
      the same `sections` list the navigation is built from rather than typed again — so a section
      added to the page appears in both places or in neither, and neither can promise a destination
      the other has forgotten. "How it works" is not among them: it already has its own control in
      the navigation above, and one page offering two doors into one section is how a navigation
      starts disagreeing with itself.

      It is a <nav> with a label rather than a decorative strip, because for a reader arriving by
      keyboard it is four links and nothing else. It sits outside the four slides, so it is not
      something a rotation carries away. */}
  <nav className="studio-bar-wrap" aria-label="Jump to a section">
   <ul className="studio-bar">
    {barSections.map(([id, label]) => <li key={id}>
     <a href={`#${id}`}>{barIcons[id]}<span>{label}</span><i aria-hidden="true"><ArrowRight size={17}/></i></a>
    </li>)}
   </ul>
  </nav>
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
 const [open, setOpen] = useState<number | null>(0);
 useReveal();
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
   <a className="primary landing-cta" href={appHref}>Open the app<ArrowRight size={16}/></a>
   <button className="icon-button landing-menu" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(m => !m)}>{menu ? <X size={20}/> : <Menu size={20}/>}</button>
   <i className="landing-progress" aria-hidden="true"/>
  </header>

  <Hero/>

  <section className="landing-figures" aria-label="What the catalogue says">
   {figures.map(f => <div key={f.label} data-reveal>
    <span className="landing-figure-source">{f.source}</span>
    <strong>{f.value}</strong><span>{f.label}</span>
   </div>)}
   <p className="landing-figures-note" data-reveal>Each figure names the contract file it is read from. Not one of them is typed onto this page, so none of them can drift away from what the app charges.</p>
  </section>

  <section id="how" className="landing-section">
   <Head index="01" eyebrow="How it works" title="The nurse is the hands. The doctor is the decision."
    body="Software can flag what a doctor should look at. It never diagnoses, never prescribes and never signs anything. That order is the design of the service rather than a policy that could be relaxed later."/>
   <ol className="landing-steps">{steps.map((s, i) => <li key={s.title} data-reveal style={{ ['--i' as string]: i }}>
    <span className="landing-step-index">{String(i + 1).padStart(2, '0')}</span>
    <span className="tile-icon" data-tint={tints[i]}><s.icon size={20}/></span>
    <h3>{s.title}</h3><p>{s.body}</p>
   </li>)}</ol>
   <p className="landing-note" data-reveal>The target being built to is under an hour from booking to arrival, in the areas MyThuso opens in. It is a target, not a promise, and nothing on this page dispatches anybody.</p>
  </section>

  <section id="services" className="landing-section tinted">
   <Head index="02" eyebrow="What a nurse is sent to do" title="The visits that should not cost you a day."
    body={<>At launch a nurse can be dispatched to {liveServices.length} of the {services.length} services in the catalogue. Each price below is the price paid: no call-out fee, no charge per kilometre, and no bill afterwards that nobody mentioned.</>}/>
   <ul className="landing-services">{liveServices.map((s, i) => <li key={s.id} data-reveal style={{ ['--i' as string]: i % 3 }}>
    <span className="service-icon"><ServiceIcon name={s.icon} size={20}/></span>
    <h3>{s.name}</h3>
    <p>{s.description}</p>
    <p className="landing-price"><strong>From {money(s.price)}</strong><span>{s.duration} min</span></p>
   </li>)}</ul>
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
    <div className="landing-portrait-frame soft"><img src={elder} alt="" aria-hidden="true"/></div>
    <figcaption>Illustrative photograph.</figcaption>
   </figure>
  </section>

  <section id="plans" className="landing-section tinted">
   <Head index="04" eyebrow="Thuso Routine" title="Care that keeps showing up."
    body={<>A chronic condition is not managed in a single visit. A plan is designed to cover the visit, the doctor review, the script and the medicine together, from {money(fromPlan)} a month.</>}/>
   {/* No plan is flagged as the popular one. Nobody has subscribed to any of these, so the phase
       each arrives in is the only thing there is to say about it that is true. */}
   <ul className="landing-plans">{plans.map((s, i) => <li key={s.id} data-reveal style={{ ['--i' as string]: i }}>
    <span className="landing-phase">Phase {s.phase}</span>
    <span className="tile-icon"><Heart size={19}/></span>
    <h3>{s.name}</h3>
    <p className="landing-price"><strong>{money(s.price!)}</strong><span>a month</span></p>
    <p>{s.includes}</p>
   </li>)}</ul>
  </section>

  <section id="nurses" className="landing-split reverse">
   <div data-reveal>
    <p className="landing-eyebrow"><i>05</i>For nurses</p>
    <h2>Your registration. Your hours. Three quarters of the fee.</h2>
    <p className="landing-lede">Thousands of qualified South African nurses are unemployed or on short contracts. MyThuso is designed as a marketplace rather than an agency: you would choose when you work, keep {nurseShare}% of every visit fee, and be paid weekly.</p>
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
    <div className="landing-portrait-frame soft"><img src={family} alt="" aria-hidden="true"/></div>
    <figcaption>Illustrative photograph.</figcaption>
   </figure>
  </section>

  <section id="safety" className="landing-section tinted">
   <Head index="06" eyebrow="Safety" title="The parts we will not shortcut."
    body={<>Home healthcare only works if the governance is heavier than the app. These are the {nurseChecks.length} checks a nurse passes before a first visit, held as a contract the three apps read, and four things the platform refuses outright.</>}/>
   <ul className="landing-checks">{nurseChecks.map((c, i) => <li key={c.id} data-reveal style={{ ['--i' as string]: i % 4 }}>
    <h3>{c.name}</h3>
    <p>{c.detail}</p>
    <p className="landing-cadence">{renewal(c.renewMonths)}</p>
   </li>)}</ul>
   <div className="landing-refusals" data-reveal>
    <h3>And four things it refuses</h3>
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
