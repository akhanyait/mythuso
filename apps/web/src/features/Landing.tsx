import { useState } from 'react';
import { ArrowDown, ArrowRight, BadgeCheck, CalendarClock, ChevronDown, ClipboardList, Clock3, Heart, House, Menu, ShieldCheck, Stethoscope, Tag, Users, Wallet, X } from 'lucide-react';
import { ServiceIcon } from '../components/UI';
import { businessModel, liveServices, money, services } from '../lib/catalog';
import { capabilityById, roleById } from '../lib/vetting';
import { useReveal, useScrollProgress } from '../lib/motion';
const nurse = '/banners/feel-better-cutout.webp';
const family = '/banners/care-that-comes-to-you-cutout.webp';
const elder = '/banners/one-safe-place-cutout.webp';
/* In development Vite serves the app at / and this page at /landing.html. In production nginx puts
   the public page at / and the app at /app, which is the right way round for a marketing site. */
const appHref = import.meta.env.DEV ? '/' : '/app';
const homeHref = import.meta.env.DEV ? '/landing.html' : '/';
const sections = [['how', 'How it works'], ['services', 'Services'], ['plans', 'Care plans'], ['nurses', 'For nurses'], ['safety', 'Safety']] as const;

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
   typed into a marketing page is a statistic nothing can hold to account. */
const figures = [
 { value: money(fromPrice), label: 'Where a visit starts. The whole price is shown before you confirm.' },
 { value: `${nurseShare}%`, label: 'Of every visit fee is paid to the nurse who did the visit.' },
 { value: String(liveServices.length), label: `Services a nurse can be dispatched to at launch, from a catalogue of ${services.length}.` },
 { value: String(nurseChecks.length), label: 'Checks that must pass before a nurse attends a first visit.' }
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
 const { y, progress } = useScrollProgress();
 return <div className="landing" style={{ ['--scroll' as string]: progress }}>
  <div className="landing-notice" role="status">
   <span className="status-dot"/><strong>MyThuso is in development.</strong> This page describes a service being built in Johannesburg. Nothing here books a visit, takes a payment or sends a nurse anywhere.
  </div>

  <header className={`landing-nav${y > 24 ? ' is-condensed' : ''}`}>
   <a className="landing-brand" href={homeHref}><img src="/logo.svg" alt="MyThuso — Help. Health. Home."/></a>
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
    <h1>A registered nurse at your door, from {money(fromPrice)}.</h1>
    <p className="landing-hero-lede">A nurse registered with the South African Nursing Council comes to your home with a connected kit. A registered doctor reviews what they find and decides what happens next. The price is fixed before you confirm, and you do not need medical aid.</p>
    <div className="landing-actions">
     <a className="primary" href={appHref}>See the app<ArrowRight size={17}/></a>
     <a className="landing-quiet" href="#how">How it works<ArrowDown size={16}/></a>
    </div>
    <ul className="landing-facts">
     {heroFacts.map(f => <li key={f.label}><f.icon size={16}/>{f.label}</li>)}
    </ul>
   </div>
   <figure className="landing-portrait">
    <div className="landing-portrait-frame"><img src={nurse} alt="" aria-hidden="true"/></div>
    <figcaption>Illustrative photograph. Not a MyThuso nurse, and not a patient.</figcaption>
   </figure>
  </section>

  <section className="landing-figures" aria-label="What the catalogue says">
   {figures.map(f => <div key={f.label} data-reveal>
    <strong>{f.value}</strong><span>{f.label}</span>
   </div>)}
  </section>

  <section id="how" className="landing-section">
   <Head index="01" eyebrow="How it works" title="The nurse is the hands. The doctor is the decision."
    body="Software can flag what a doctor should look at. It never diagnoses, never prescribes and never signs anything. That order is the design of the service rather than a policy that could be relaxed later."/>
   <ol className="landing-steps">{steps.map((s, i) => <li key={s.title} data-reveal style={{ ['--i' as string]: i }}>
    <span className="landing-step-index">{String(i + 1).padStart(2, '0')}</span>
    <span className="tile-icon"><s.icon size={20}/></span>
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
    <ul className="landing-points">{passPoints.map(p => <li key={p.title}>
     <p.icon size={18}/><span><strong>{p.title}</strong>{p.body}</span>
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

  <section className="landing-section">
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
    <img src="/logo.svg" alt="MyThuso"/>
    <p>MyThuso is a product of Akhanya IT Innovations (Pty) Ltd, Johannesburg. {services.length} services in the catalogue, {liveServices.length} of them at launch.</p>
   </div>
   <div className="landing-footer-note">
    <p><strong>This is a preview, not a live service.</strong> No visit can be booked, no payment taken and no clinical service provided. People shown are illustrative and are not MyThuso nurses or patients.</p>
    <p>© 2026 MyThuso · Help. Health. Home.</p>
   </div>
  </footer>
 </div>;
}
