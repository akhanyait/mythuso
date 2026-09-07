import { useState } from 'react';
import { ArrowRight, BadgeCheck, CalendarClock, ChevronDown, ClipboardList, Clock3, Heart, House, Menu, Quote, ShieldCheck, Sparkles, Stethoscope, Tag, Users, Wallet, X } from 'lucide-react';
import { Texture } from '../components/HeroCarousel';
import { ServiceIcon } from '../components/UI';
import { businessModel, liveServices, money, services } from '../lib/catalog';
import { useCountUp, useReveal, useScrollProgress, useSpotlight } from '../lib/motion';
const nurse = '/banners/feel-better-cutout.webp';
const family = '/banners/care-that-comes-to-you-cutout.webp';
const elder = '/banners/one-safe-place-cutout.webp';
/* In development Vite serves the app at / and this page at /landing.html. In production nginx puts
   the public page at / and the app at /app, which is the right way round for a marketing site. */
const appHref = import.meta.env.DEV ? '/' : '/app';
const homeHref = import.meta.env.DEV ? '/landing.html' : '/';
const sections = [['how', 'How it works'], ['services', 'Services'], ['plans', 'Care plans'], ['nurses', 'For nurses'], ['safety', 'Safety']] as const;
const headline = [['Care', 'that', 'comes'], ['to', 'you.']];
/* Four figures, each one a single number so it can count itself up, and each one traceable to the
   proposal. A statistic that has to be fudged to animate is a statistic that should not animate. */
const figures = [
 { to: 50, prefix: '~', suffix: ' million', label: 'South Africans with no medical aid at all' },
 { to: 60, suffix: ' min', label: 'What we are building, against a four-to-six hour clinic queue' },
 { to: 75, suffix: '%', label: 'Of every visit fee paid straight to the nurse who did the visit' },
 { to: 249, prefix: 'R', label: 'Where a visit starts, shown in full before you confirm' }
];
const steps = [
 { icon: CalendarClock, title: 'Book in the app', body: 'Pick what you need and a time that suits you. The price is fixed before you confirm — no quote, no surprise.' },
 { icon: House, title: 'A nurse comes to you', body: 'A SANC-registered nurse arrives with a connected kit and confirms it is you with a code only you have.' },
 { icon: Stethoscope, title: 'A doctor reviews it', body: 'Readings go to a registered doctor who decides what happens next. Everything lands in your Health Passport.' }
];
const promises = [
 { icon: BadgeCheck, title: 'Registered nurses', body: 'SANC registration, identity, police clearance and references — checked before a first visit and re-checked on a schedule.' },
 { icon: Tag, title: 'One fixed price', body: 'You see the price before you book. No call-out fee, no per-kilometre charge, no bill afterwards you did not expect.' },
 { icon: Stethoscope, title: 'A doctor decides', body: 'Software can flag something. Only a registered doctor diagnoses, prescribes or signs a certificate.' },
 { icon: ShieldCheck, title: 'Your record is yours', body: 'You choose who sees what, and for how long. Paying for someone’s care never grants access to their records.' }
];
const questions = [
 ['Is this instead of my clinic or my doctor?', 'No. MyThuso handles the routine visits that cost you a day in a queue — an injection, a chronic check, a dressing change, bloods. Anything beyond that is referred, and we will tell you plainly when it needs a clinic or a hospital.'],
 ['Who actually comes to my house?', 'A nurse registered with the South African Nursing Council, whose registration, identity and police clearance we have verified. You see their name and photo before they arrive, and they confirm a code with you at the door.'],
 ['What does it cost?', 'Visits start at R249 and the price is shown before you book. Care plans start at R99 a month. There is no membership fee to use MyThuso.'],
 ['Do I need medical aid?', 'No. MyThuso was built for the roughly 50 million South Africans without it. You can pay by card or cash, and family anywhere in the country can pay for a visit on your behalf.'],
 ['What happens to my health information?', 'It is yours. You decide who sees it and for how long, and you can withdraw that at any time. Health information is special personal information under POPIA and we treat it that way.'],
 ['Can I book for my mother in another province?', 'That is one of the reasons MyThuso exists. You can book and pay for a visit for a family member anywhere we operate. Seeing their records is a separate decision that only they can make.']
];
/* Each figure keeps its finished value in the markup for anyone not watching it animate, and the
   digits are laid out with tabular numerals so the band does not twitch as they climb. */
function Figure({ to, prefix, suffix, label }: typeof figures[number]) {
 const [value, ref] = useCountUp(to);
 return <div data-reveal>
  <strong><span aria-hidden="true" ref={ref}>{prefix}{value.toLocaleString('en-ZA')}{suffix}</span>
   <span className="visually-hidden">{prefix}{to.toLocaleString('en-ZA')}{suffix}</span></strong>
  <span>{label}</span>
 </div>;
}
function Head({ index, eyebrow, title, body }: { index: string; eyebrow: string; title: string; body?: string }) {
 return <div className="landing-head" data-reveal>
  <div className="eyebrow"><i>{index}</i>{eyebrow}</div>
  <h2>{title}</h2>{body ? <p>{body}</p> : null}
 </div>;
}
/* The public page. It is honest about what MyThuso is today: a service being built, not one you can
   summon tonight. A health service that overstates its readiness is not a marketing problem. */
export function Landing() {
 const [menu, setMenu] = useState(false);
 const [open, setOpen] = useState<number | null>(0);
 useReveal();
 const { y, progress } = useScrollProgress();
 const cards = useSpotlight<HTMLDivElement>();
 const promiseCards = useSpotlight<HTMLDivElement>();
 return <div className="landing" style={{ ['--scroll' as string]: progress }}>
  <div className="landing-notice" role="status">
   <span className="status-dot"/><strong>MyThuso is in development.</strong> This page describes a service being built in Johannesburg. Nothing here books a real visit yet.
  </div>
  <header className={`landing-nav${y > 24 ? ' is-condensed' : ''}`}>
   <a className="landing-brand" href={homeHref}><img src="/logo.svg" alt="MyThuso — Help. Health. Home."/></a>
   <nav className={menu ? 'is-open' : ''} aria-label="Sections">
    {sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}
   </nav>
   <a className="primary landing-cta" href={appHref}>Open the app preview<ArrowRight size={16}/></a>
   <button className="icon-button landing-menu" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(m => !m)}>{menu ? <X size={20}/> : <Menu size={20}/>}</button>
   <i className="landing-progress" aria-hidden="true"/>
  </header>

  <section className="landing-hero">
   <div className="landing-aurora" aria-hidden="true"><i/><i/><i/></div>
   <Texture/>
   <div className="landing-hero-copy">
    <div className="eyebrow" data-enter="1"><Sparkles size={13}/>Nurse-led care, at home</div>
    <h1>{headline.map((line, l) => <span className="headline-line" key={l}>
     {line.map((word, w) => <span className="headline-word" key={word} data-enter={2 + l * 3 + w}>{word}{' '}</span>)}
    </span>)}</h1>
    <p data-enter="8">A registered nurse at your door in under an hour, with a doctor reviewing every result. From {money(249)}, no medical aid needed.</p>
    <div className="landing-actions" data-enter="9">
     <a className="primary" href={appHref}>See the app<ArrowRight size={17}/></a>
     <a className="secondary" href="#how">How it works</a>
    </div>
    <ul className="landing-trust" data-enter="10">
     <li><span><BadgeCheck size={16}/></span>Registered nurses</li>
     <li><span><Tag size={16}/></span>Fixed prices</li>
     <li><span><Stethoscope size={16}/></span>Doctor-reviewed</li>
    </ul>
   </div>
   {/* Three layers so each owns one transform: the stage fades in, the wrapper carries the parallax
       the scroll position drives, and the cut-out itself breathes. */}
   <div className="landing-hero-stage" data-enter="6">
    <i className="landing-hero-ring" aria-hidden="true"/>
    <div className="landing-hero-parallax" style={{ ['--parallax' as string]: `${Math.min(y, 700) * 0.06}px` }}>
     <img className="landing-hero-figure" src={nurse} alt="" aria-hidden="true"/>
    </div>
   </div>
  </section>

  <section className="landing-strip">{figures.map(f => <Figure key={f.label} {...f}/>)}</section>

  <section id="how" className="landing-section">
   <Head index="01" eyebrow="How it works" title="Three steps, and the last one is a doctor."
    body="The nurse is the hands. Software is the filter. A registered doctor is the decision — that order does not change."/>
   <div className="landing-steps">{steps.map((s, i) => <article key={s.title} data-reveal style={{ ['--i' as string]: i }}>
    <span className="landing-step-mark">{i + 1}</span>
    <span className="tile-icon"><s.icon size={21}/></span>
    <h3>{s.title}</h3><p>{s.body}</p>
   </article>)}</div>
  </section>

  <div className="landing-ticker" aria-hidden="true">
   <div>{[0, 1].map(pass => <span key={pass}>{liveServices.map(s => <b key={s.id}>{s.name}<i/></b>)}</span>)}</div>
  </div>

  <section id="services" className="landing-section tinted">
   <Head index="02" eyebrow="What we do" title="The visits that should not cost you a day."
    body="Nine services at launch, each at one fixed price. More follow as the service grows."/>
   <div className="landing-services" ref={cards}>{liveServices.map((s, i) => <article key={s.id} className={`tint-${i % 4}`} data-reveal style={{ ['--i' as string]: i % 3 }}>
    <span className="service-icon"><ServiceIcon name={s.icon} size={21}/></span>
    <div>
     <h3>{s.name}</h3><p>{s.description}</p>
    </div>
    <strong>From {money(s.price)}<small> · {s.duration} min</small></strong>
   </article>)}</div>
   <p className="landing-note" data-reveal>Prices are the proposal's. Later-phase services — screening bundles, men's health, mental-health check-ins and allied health — are in the app marked with the phase they arrive in.</p>
  </section>

  <section className="landing-split">
   <div className="landing-split-art" data-reveal><i aria-hidden="true"/><img src={elder} alt="" aria-hidden="true"/></div>
   <div data-reveal>
    <div className="eyebrow"><i>03</i>Thuso Pass</div>
    <h2>Your health, in one place that belongs to you.</h2>
    <p>Every visit, reading, result and document lands in a Health Passport you own. You choose who sees it, exactly how much they see, and for how long — and you can take it back.</p>
    <ul className="landing-list">
     <li><ShieldCheck size={17}/>Share a visit summary without sharing a history</li>
     <li><Users size={17}/>Bookings and payments for family, without their records</li>
     <li><ClipboardList size={17}/>Export everything, whenever you want it</li>
    </ul>
   </div>
  </section>

  <section id="plans" className="landing-section">
   <Head index="04" eyebrow="Thuso Routine" title="Care that keeps showing up."
    body="Chronic conditions are not managed in a single visit. Plans cover the visit, the doctor review, the script and the medicine."/>
   <div className="landing-plans">{businessModel.subscriptions.filter(s => s.price && s.phase <= 3).map((s, i) => <article key={s.id} className={i === 0 ? 'featured' : ''} data-reveal style={{ ['--i' as string]: i }}>
    {i === 0 ? <span className="plan-flag">Where most people start</span> : null}
    <span className="tile-icon"><Heart size={20}/></span>
    <h3>{s.name}</h3>
    <strong>{money(s.price!)}<small> / month</small></strong>
    <p>{s.includes}</p>
   </article>)}</div>
  </section>

  <section id="nurses" className="landing-split reverse tinted">
   <div className="landing-split-art" data-reveal><i aria-hidden="true"/><img src={family} alt="" aria-hidden="true"/></div>
   <div data-reveal>
    <div className="eyebrow"><i>05</i>For nurses</div>
    <h2>Your registration. Your hours. Three quarters of the fee.</h2>
    <p>Thousands of qualified South African nurses are unemployed or on short contracts. MyThuso is a marketplace, not an agency: you choose when you work, you keep 75% of every visit, and you are paid weekly.</p>
    <ul className="landing-list">
     <li><Wallet size={17}/>{money(187)}–{money(299)} a visit, paid out weekly</li>
     <li><Clock3 size={17}/>Work the hours you choose, in the areas you choose</li>
     <li><ClipboardList size={17}/>A connected kit, training, and a doctor to escalate to</li>
    </ul>
    <a className="primary" href={appHref}>Open the nurse preview<ArrowRight size={16}/></a>
   </div>
  </section>

  <section id="safety" className="landing-section">
   <Head index="06" eyebrow="Safety" title="The parts we will not shortcut."
    body="Home healthcare only works if the governance is heavier than the app."/>
   <div className="landing-promises" ref={promiseCards}>{promises.map((p, i) => <article key={p.title} data-reveal style={{ ['--i' as string]: i }}>
    <span className="tile-icon"><p.icon size={21}/></span>
    <h3>{p.title}</h3><p>{p.body}</p>
   </article>)}</div>
   <div className="landing-quote" data-reveal>
    <Quote size={22}/>
    <p>Nothing is diagnosed by software alone. AI flags what a doctor should look at; a registered doctor decides, and their name is on it.</p>
   </div>
  </section>

  <section className="landing-section tinted">
   <Head index="07" eyebrow="Questions" title="The things people actually ask."/>
   <div className="landing-faq" data-reveal>{questions.map(([q, a], i) => <div key={q} className={open === i ? 'is-open' : ''}>
    <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{q}<ChevronDown size={19}/></button>
    <div className="landing-answer" inert={open !== i}><div><p>{a}</p></div></div>
   </div>)}</div>
  </section>

  <section className="landing-final">
   <div className="landing-aurora dark" aria-hidden="true"><i/><i/><i/></div>
   <Texture/>
   <div data-reveal>
    <h2>Help. Health. Home.</h2>
    <p>A nurse at your door, a doctor on the screen, your record in your pocket. Built in Johannesburg, for South Africa.</p>
    <a className="primary" href={appHref}>Open the app preview<ArrowRight size={17}/></a>
   </div>
  </section>

  <footer className="landing-footer">
   <div>
    <img src="/logo.svg" alt="MyThuso"/>
    <p>MyThuso is a product of Akhanya IT Innovations (Pty) Ltd, Johannesburg. {services.length} services across four phases; nine at launch.</p>
   </div>
   <div className="landing-footer-note">
    <p><strong>This is a preview, not a live service.</strong> No visit can be booked, no payment taken and no clinical service provided. People shown are illustrative and are not MyThuso nurses or patients.</p>
    <p>© 2026 MyThuso · Help. Health. Home.</p>
   </div>
  </footer>
 </div>;
}
