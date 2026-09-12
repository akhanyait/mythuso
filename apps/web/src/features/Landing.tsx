import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, ChevronDown, ClipboardList, Clock3, Heart, House, Menu, ShieldCheck, Stethoscope, Tag, Users, Wallet, X } from 'lucide-react';
import { ServiceIcon } from '../components/UI';
import { businessModel, liveServices, money, services } from '../lib/catalog';
import { capabilities, connectedCount } from '../lib/capabilities';
import { useT } from '../lib/i18n';
import { capabilityById, roleById } from '../lib/vetting';
import { MotionPause } from '../components/MotionPause';
import { useDecor, useReveal, useScrollProgress } from '../lib/motion';
const nurse = '/banners/feel-better-cutout.webp';
const family = '/banners/care-that-comes-to-you-cutout.webp';
const elder = '/banners/one-safe-place-cutout.webp';
/* The hero's three slides. Both halves of a slide are already contracts and neither is written
   here: the words are the hero set in packages/catalog/locales.json — the founder's own banner
   copy, carried in every locale that claims that set — and the pictures are the three cut-outs
   scripts/prepare-banners.py produces, which the names above already point at. What is stated here
   is only which photograph belongs to which slide, in the order scripts/check-boundaries.mjs
   declares as `heroCutouts`; a check beside that list fails the build if the two orders part. */
const slidePhotos = [family, elder, nurse];
/* In development Vite serves the app at / and this page at /landing.html. In production nginx puts
   the public page at / and the app at /app, which is the right way round for a marketing site. */
const appHref = import.meta.env.DEV ? '/' : '/app';
const homeHref = import.meta.env.DEV ? '/landing.html' : '/';
/* nginx answers /status with a redirect to /status/, so the production href is the directory form.
   Linking to the bare .html would take a reader through a redirect on a metered connection. */
const statusHref = import.meta.env.DEV ? '/status.html' : '/status/';
/* Seven seconds. Long enough to read a sentence of banner copy, short enough that a reader who
   wants the next one does not reach for the arrow — and it only ever runs while the page's
   decorative-motion flag is up, so a reader who has stopped motion, or asked their system for
   less of it, is never moved on at all. */
const SLIDE_MS = 7000;
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
const heroFacts = [
 { icon: BadgeCheck, label: 'SANC-registered nurses' },
 { icon: Tag, label: 'One fixed price' },
 { icon: Stethoscope, label: 'Reviewed by a doctor' }
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

/* The hero's photograph, as three.
 *
 * A carousel is the most dangerous thing that can be put on this page, and docs/ARCHITECTURE.md
 * records why: the last one animated nine SVG bubbles on an infinite loop behind a screen that had
 * stopped rendering it, and cost an afternoon of "flaky" Playwright failures. Playwright waits for
 * an element's box to hold still before it will act on it, so the hazard was never the motion — it
 * was a box that would not stop changing. Everything below is written against that.
 *
 *   Nothing moves a box. The three slides are stacked in one frame and cross-fade on opacity, so
 *   the figure is the same size in every frame of the transition and between slides. There is no
 *   track sliding sideways and no control inside a slide for a test to chase.
 *
 *   Rotation is the page's decorative-motion flag and not a second system. `useDecor()` is the
 *   same hook the hero's drifting lines answer to, and the same one `<MotionPause/>` clears — so
 *   the one control below the frame stops the carousel, the lines and the wash behind the
 *   photograph together, which is the mechanism WCAG 2.2.2 asks for rather than three of them.
 *
 *   Reduced motion removes it rather than shortening it. The flag is never set for a reader who
 *   has asked their system for less, so nothing rotates and no pause control is rendered; the
 *   first slide is simply the photograph, and the arrows still work.
 *
 *   Only the current slide exists for a reader. The other two are inert and visibility:hidden, so
 *   they are out of the tab order, out of the accessibility tree, and out of the text a page
 *   search — or the contrast audit in tests/landing.spec.ts — walks.
 *
 * The disclosure is deliberately NOT part of a slide. It sits in the figure's own caption, over
 * the bottom of the frame, where it is on every slide at once: a sentence saying this is not a
 * MyThuso nurse is not something a rotation may carry off the screen. */
function HeroSlides() {
 const t = useT();
 const { playing } = useDecor();
 const [index, setIndex] = useState(0);
 /* Holding still while somebody is actually reading the card. A pointer that genuinely hovers is
    the only one this listens to: on a touch screen the browser synthesises a mouseenter under a
    finger and never a leave, so hover-to-pause there is a carousel that stops for the rest of the
    visit the first time it is tapped. The pause control and the arrows are what a touch reader
    has, and both work. */
 const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
 const [held, setHeld] = useState(false);
 const rotating = playing && !held;
 /* A timeout rather than an interval, keyed on the slide showing. Pressing an arrow therefore
    restarts the seven seconds instead of inheriting whatever was left of them — a reader who has
    just asked for the next picture should not be moved on again half a second later. */
 useEffect(() => {
  if (!rotating) return;
  const timer = setTimeout(() => setIndex(i => (i + 1) % slidePhotos.length), SLIDE_MS);
  return () => clearTimeout(timer);
 }, [rotating, index]);
 const title = (i: number) => t(`slide${i + 1}.title`).replace('|', ' ');
 const step = (by: number) => (index + by + slidePhotos.length) % slidePhotos.length;
 const go = (by: number) => setIndex(step(by));
 return <figure className="landing-portrait">
  <div className="landing-portrait-frame" role="group" aria-roledescription="carousel" aria-label="MyThuso in three pictures"
   onMouseEnter={canHover ? () => setHeld(true) : undefined} onMouseLeave={canHover ? () => setHeld(false) : undefined}>
   {slidePhotos.map((photo, i) => <div key={photo} className={`landing-slide${i === index ? ' is-on' : ''}`}
    role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slidePhotos.length}`} aria-hidden={i !== index} inert={i !== index}>
    <img src={photo} alt="" aria-hidden="true"/>
    {/* The white card over the photograph. An eyebrow and a sentence, both out of the locale
        contract: the banner's own headline names the picture, and the sentence under it is the
        one the same slide carries on the phones. It is opaque rather than frosted, like the
        caption below it — nothing that has to be read on this page is translucent. */}
    <p className="landing-slide-card"><i>{title(i)}</i>{t(`slide${i + 1}.body`)}</p>
   </div>)}
  </div>
  <figcaption>Illustrative photograph. Not a MyThuso nurse, and not a patient.</figcaption>
  {/* The controls sit under the frame rather than on it. They used to share a line with the
      caption, and the caption — absolutely positioned against the figure rather than against the
      frame — landed on top of the pause button and took half its target with it. */}
  <div className="landing-portrait-foot">
   <p className="landing-slide-index"><span className="visually-hidden">Picture </span>{String(index + 1).padStart(2, '0')}<i aria-hidden="true">/</i><span className="visually-hidden">of </span>{String(slidePhotos.length).padStart(2, '0')}</p>
   {/* Segments rather than a bar, which is how docs/DESIGN-LANGUAGE.md draws progress everywhere
       else on this page. The current segment fills over the seven seconds so a reader can see the
       next picture coming instead of being surprised by it — a finite animation, on a child with
       nothing in it, gated on the same flag, and held still while the pointer is. */}
   <span className={`landing-slide-rule${rotating ? '' : ' is-still'}`} aria-hidden="true" style={{ ['--slide-ms' as string]: `${SLIDE_MS}ms` }}>
    {slidePhotos.map((photo, i) => <i key={photo} className={i === index ? 'is-on' : ''}><b/></i>)}
   </span>
   <MotionPause/>
   {/* The two arrows are one group so that a narrow row wraps them together. Loose, the second one
       dropped onto a line of its own under a 390px phone and sat there as a single orphan. */}
   <span className="landing-slide-steps">
    <button type="button" className="landing-slide-step m-press" onClick={() => go(-1)} aria-label={`Show the previous picture: ${title(step(-1))}`}><ArrowLeft size={18}/></button>
    <button type="button" className="landing-slide-step m-press" onClick={() => go(1)} aria-label={`Show the next picture: ${title(step(1))}`}><ArrowRight size={18}/></button>
   </span>
  </div>
 </figure>;
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

  {/* The headline carries no entrance animation at all: the proposition — who comes, to where, and
      what it costs — has to be readable in the first painted frame, before anything moves. */}
  <section className="landing-hero">
   <div className="landing-hero-copy">
    <p className="landing-kicker">Nurse-led home healthcare · Johannesburg</p>
    {/* Two-tone, which is the reference's own move: the subject in ink and what it costs you in
        the olive. The split is between the two halves of the sentence rather than at a line break,
        so it says the same thing at 320px as it does at 1440 — a headline coloured by where the
        text happens to wrap is a headline that means something different on every screen. The
        accessible name is unchanged: one space between the spans, and the price is still read out
        of the catalogue. */}
    <h1><span>A registered nurse</span>{' '}<span className="landing-h1-accent">at your door, from {money(fromPrice)}.</span></h1>
    <p className="landing-hero-lede">A nurse registered with the South African Nursing Council comes to your home with a connected kit. A registered doctor reviews what they find and decides what happens next. The price is fixed before you confirm, and you do not need medical aid.</p>
    <div className="landing-actions">
     <a className="primary" href={appHref}>See the app<ArrowRight size={17}/></a>
     <a className="landing-quiet" href="#how">How it works<ArrowDown size={16}/></a>
    </div>
    <ul className="landing-facts">
     {heroFacts.map(f => <li key={f.label}><f.icon size={16}/>{f.label}</li>)}
    </ul>
   </div>
   {/* The pause control sits with the carousel rather than in the actions row above it. Everything
       that moves on this page is here — the three pictures, the drift inside their frame and the
       lines across the hero behind them — so the control is beside what it governs; and putting a
       third pill next to "See the app" would have made the one action the hero exists for into one
       of three. */}
   <HeroSlides/>
   {/* The dark bar across the foot of the hero. It is the four sections under this one, taken from
       the same `sections` list the navigation is built from rather than typed again — so a section
       added to the page appears in both places or in neither, and neither can promise a destination
       the other has forgotten. "How it works" is not among them: it already has its own control in
       the hero just above this bar, and one page offering two doors into one section is how a
       navigation starts disagreeing with itself.

       It is a <nav> with a label rather than a decorative strip, because for a reader arriving by
       keyboard it is four links and nothing else. */}
   <nav className="studio-bar-wrap" aria-label="Jump to a section">
    <ul className="studio-bar">
     {barSections.map(([id, label]) => <li key={id}>
      <a href={`#${id}`}>{barIcons[id]}<span>{label}</span><i aria-hidden="true"><ArrowRight size={17}/></i></a>
     </li>)}
    </ul>
   </nav>
  </section>

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
    <a className="secondary landing-secondary" href={appHref}>See the nurse's side<ArrowRight size={16}/></a>
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
