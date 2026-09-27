import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Apple,
  ArrowRight,
  Bandage,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  Heart,
  House,
  IdCard,
  Leaf,
  Lock,
  MapPin,
  Menu,
  MessagesSquare,
  Moon,
  PersonStanding,
  ShieldCheck,
  Stethoscope,
  UserRoundPlus,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { ServiceIcon } from "../components/UI";
import { businessModel, liveServices, money, services } from "../lib/catalog";
import { isTiered, monthlyPrices, tiers as momTiers } from "../lib/mom-plans";
import { capabilities, connectedCount } from "../lib/capabilities";
import { capabilityById, roleById } from "../lib/vetting";
import { MotionPause } from "../components/MotionPause";
import {
  useAmbientVisibility,
  useDecor,
  useReveal,
  useScrollProgress,
} from "../lib/motion";
import { searchForSection } from "../lib/roles";
import {
  figureFor,
  priceLine,
  roleFor,
  sectionFor,
  slides,
  standing,
  type HeroDestination,
  type HeroIcon,
} from "../lib/hero";
/* Seven seconds. Long enough to read a sentence of banner copy, short enough that a reader who
   wants the next one does not reach for the arrow — and it only ever runs while the page's
   decorative-motion flag is up, so a reader who has stopped motion, or asked their system for
   less of it, is never moved on at all. */
/* Public content and role dashboards share the main address. A role selects a fictional
   preview workspace; real authentication remains the identity service's responsibility. */
const appHref = "/?role=patient";
const LoginPanel = lazy(() => import("./LoginPanel"));
const PublicAssistant = lazy(() => import("./PublicAssistant"));
const nurseHref = "/?role=nurse";
const homeHref = "/";
/* And the status page, in the directory form nginx serves. Linking to the bare .html would
   take a reader through a redirect on a metered connection. */
const statusHref = "/status/";
const sections = [
  ["how", "How it works"],
  ["services", "Services"],
  ["plans", "Care plans"],
  ["nurses", "For nurses"],
  ["safety", "Safety"],
] as const;
/* The four in the hero's dark bar, derived from the list above rather than restated: everything
   except "How it works", which has its own control in the hero already. An icon per section is the
   only thing typed here, and an icon is a picture of a word that is already on the row — it is
   never the only thing saying which section this is. */
const barIcons: Record<string, React.ReactNode> = {
  services: <Stethoscope size={20} />,
  plans: <Heart size={20} />,
  nurses: <Users size={20} />,
  safety: <ShieldCheck size={20} />,
};
const barSections = sections.filter(([id]) => id in barIcons);

/* Not one figure on this page is typed. A marketing page is exactly where a price quietly drifts
   away from the price the app charges, so every number below is read out of packages/catalog at
   build time and rendered from there. The one deliberate exception is the nurse's per-visit range
   further down, which scripts/check-boundaries.mjs reads out of this file by pattern and compares
   against the catalogue — a literal that fails the build the moment it stops being true. */
const fromPrice = Math.min(...liveServices.map((s) => s.price));
const serviceCategories = [
  "All care",
  ...new Set(liveServices.map((s) => s.category)),
];
const nurseShare = Math.round(
  (1 - businessModel.unitEconomics.platformShare) * 100,
);
/* A plan is on the page when it has a price to show and arrives by phase 3. MyThuso for Mom has three
   prices and no single one, so "has a price" is asked of lib/mom-plans.ts rather than of the row. */
const plans = businessModel.subscriptions.filter(
  (s) => monthlyPrices(s).length && s.phase <= 3,
);
const fromPlan = Math.min(...plans.flatMap(monthlyPrices));
const momPhases = [...new Set(momTiers.map((t) => t.phase))].join("–");
const nurseRole = roleById("nurse")!;
/* The checks a nurse passes before a first visit, taken from the vetting contract rather than
   described in adjectives. If a check is added to the contract it appears here; if one is removed,
   the page stops claiming it. */
const nurseChecks = nurseRole.checks;
const renewal = (months: number | null) =>
  months === null ? "At onboarding" : `Every ${months} months`;

/* What the platform refuses, in the contract's own words. These sentences are rendered word for
   word on all three platforms; quoting them here rather than paraphrasing them is the point. */
const refusals = (
  [
    ["nurse", "view-clinical-record"],
    ["nurse", "view-protected-record"],
    ["doctor", "sign-clinical-review"],
    ["nurse", "write-clinical-note"],
  ] as const
).map(([roleId, capability]) => ({
  capability,
  title: capabilityById(capability)?.name ?? capability,
  sentence:
    roleById(roleId)?.grants.find((g) => g.capability === capability)
      ?.refusal ?? "",
}));

/* The three steps each carry a tint. It is keyed to a named, ordered thing — step 01, step 02,
   step 03 — rather than to a position in an array, which is the distinction core.css records the
   last tint rotation being deleted for: colouring a service by its index told two readers two
   different things and neither of them anything. Here the colour is a second way of saying what the
   number and the heading already say, it is stable, and it is never the only difference between two
   rows. */
const tints = ["lime", "peach", "lilac"] as const;
const steps = [
  {
    icon: CalendarClock,
    person: "You",
    portrait: "patient",
    title: "You book, with the price upfront",
    body: "Pick the care you need and a time that suits you. See the full price before you confirm, with no call-out fee or surprise extras.",
  },
  {
    icon: House,
    person: "Your nurse",
    portrait: "nurse",
    title: "A registered nurse visits you",
    body: "Your nurse is registered with the South African Nursing Council. They arrive with a connected kit and confirm your visit using a code only you hold.",
  },
  {
    icon: Stethoscope,
    person: "Your doctor",
    portrait: "doctor",
    title: "Your doctor plans the next step",
    body: "A registered doctor reviews your readings and decides what comes next. They may also decide to visit you at home. Their decisions and visit notes stay in your Health Passport.",
  },
];
/* The cost question is first and open by default. It is the question every review of this page
   said a stranger arrives with, and an accordion that opened on "is this instead of my clinic" was
   answering a question nobody had asked yet. "Is this live yet?" is new and answers with the notice
   bar's own words rather than softer ones, because a reader who scrolled past the strip at the top
   has not been told twice. */
const questions: [string, React.ReactNode][] = [
  [
    "What does it cost?",
    <>
      Visits start at {money(fromPrice)} and the price is shown in full before
      you book. Care plans start at {money(fromPlan)} a month. There is no
      membership fee and no call-out charge.
    </>,
  ],
  [
    "Is this live yet?",
    <>
      No. MyThuso is in development. This page describes a service being built
      in Johannesburg, and nothing here books a visit, takes a payment or sends
      a nurse anywhere. The status page lists what is connected —{" "}
      {connectedCount} of {capabilities.length} capabilities today — read from
      the same contract the app is built from.
    </>,
  ],
  [
    "Is this instead of my clinic or my doctor?",
    "No. MyThuso is designed for the routine visits that cost you a day in a queue — an injection, a chronic check, a dressing change, bloods. Anything beyond that is referred, and you are told plainly when something needs a clinic or a hospital.",
  ],
  [
    "Who would actually come to my house?",
    <>
      A nurse registered with the South African Nursing Council, who has passed
      all {nurseChecks.length} of the checks listed under Safety above. You
      would see their name and photograph before they arrived, and they would
      confirm a code with you at the door.
    </>,
  ],
  [
    "Do I need medical aid?",
    "No. MyThuso is being built for the majority of South Africans who have none, and it is priced for that. Payment is by card or cash, and family elsewhere in the country can pay for a visit on someone else’s behalf.",
  ],
  [
    "What would happen to my health information?",
    "It would be yours. Health information is special personal information under POPIA, and the design treats it that way: you decide who sees what, for how long, and you can withdraw that at any time. Nothing on this page collects any.",
  ],
  [
    "Can I book for my mother in another province?",
    "That is one of the reasons MyThuso exists. The design lets you book and pay for a family member anywhere the service runs. Seeing their records stays a separate decision that only they can make.",
  ],
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
  nurse: UserRoundPlus,
  stethoscope: Stethoscope,
  passport: IdCard,
  family: Users,
  message: MessagesSquare,
  plaster: Bandage,
  walking: PersonStanding,
  apple: Apple,
  moon: Moon,
  calendar: CalendarDays,
  clinical: FileText,
  handover: UsersRound,
  home: House,
  lock: Lock,
  leaf: Leaf,
};
function HeroGlyph({ name, size }: { name: HeroIcon; size: number }) {
  const Glyph = glyphs[name];
  return <Glyph size={size} strokeWidth={1.9} aria-hidden="true" />;
}

/* The four destinations, as addresses. lib/hero.ts decides which section of the product each one
   means and lib/roles.ts writes it into the address, so neither a page name nor a parameter is
   typed here — and a call to action cannot promise a screen that does not exist. */
const heroHref = (goes: HeroDestination) => {
  if (roleFor(goes)) return nurseHref;
  const section = sectionFor(goes);
  return section ? `${appHref}&${searchForSection(section).slice(1)}` : appHref;
};

/* The two primary calls to action say "Opening…" when the page they lead to has not arrived within
   300 ms of the press. On the connections this is built for a tap on a link is followed by nothing
   for a second or more, and a reader who sees nothing taps again. A modifier click opens a new tab
   and leaves this page where it is, so it is not counted; and a page restored from the back-forward
   cache gets its label back, because "Opening…" on a link nobody is pressing is a lie. */
function useOpening() {
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const restore = () => setOpening(false);
    addEventListener("pageshow", restore);
    return () => removeEventListener("pageshow", restore);
  }, []);
  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    setTimeout(() => setOpening(true), 300);
  };
  return { opening, onClick };
}

/* Editorial cover, since 28 September 2026: the banner's words on the left, and its people as a
   cut-out standing on the brand's pale ground on the right — above them on a phone — with the two
   contract cards drawn by the page beside them and nothing baked into a pixel. The founder called the
   photographs it replaced "cut and low quality", and they were: narrow crops of compositions whose
   right third is under baked cards, cropped again by object-fit and upscaled on a desk. The cut-out
   is never cropped by the page; it is sized whole, at its own aspect, from width and height the build
   holds to the file.

   It stands on the first banner of packages/catalog/hero.json. On 27 September the founder asked for
   the strip beneath it — the trust marks, the counter, the pause pill and the arrows — to go, and a
   picture that rotates by itself with no control to stop it is what WCAG 2.2.2 refuses, so the
   rotation went with the controls. The other three banners stay in the contract, unshown, and their
   figures are published, for the day a rotation with a control comes back. The page's one pause
   control sits in the top bar and stops the two ambient drifts.

   The lime price panel that stood in the ledge went on the founder's word the next day: the price
   stands under the headline, in the contract's sentence, and on every service card. What is left in
   the ledge is the dark strip of sections, pulled up over the foot of the hero. */
function Hero() {
  const slide = slides[0];
  const figure = figureFor(slide);
  const { opening, onClick: opened } = useOpening();
  return (
    <section
      className="landing-hero editorial-hero"
      aria-label="MyThuso"
      data-ambient="paused"
    >
      <div className="hero-stage">
        {/* The words come first in the document, so a screen reader meets the headline before a
        picture it is told nothing about; on a phone the figure is drawn above them by the grid,
        and it holds nothing focusable, so the tab order and the visual order still agree. */}
        <div className="landing-hero-copy">
          {[slide].map((slide) => (
            <article key={slide.id} className="landing-hero-slide is-on">
              <div className="editorial-heading">
                <p className="landing-hero-eyebrow">
                  <span /> {slide.eyebrow}
                </p>
                {/* Each half of the headline is a line inside a clipped box, so the entrance can lift it up
          from under its own baseline. The nesting is what makes the mask possible; the space
          between the two halves stays in the markup, so the accessible name is still one
          sentence. */}
                <h1>
                  <span className="h1-line">
                    <span>{slide.headline.lead}</span>
                  </span>{" "}
                  <span className="h1-line landing-h1-accent">
                    <span>{slide.headline.accent}</span>
                  </span>
                </h1>
              </div>
              <div className="editorial-intro">
                <p className="landing-hero-lede">{slide.body}</p>
                <a
                  className="primary m-press"
                  href={heroHref(slide.action.goes)}
                  onClick={opened}
                >
                  {opening ? "Opening…" : slide.action.label}
                  <ArrowRight size={18} />
                </a>
              </div>
            </article>
          ))}
          {/* The third standing line. Under whichever banner is showing, never rotated away, and the
          only sentence on the first screen that says both who comes and what it costs. The words
          are the contract's; the number is the catalogue's. */}
          <p className="landing-hero-price">{priceLine(money(fromPrice))}</p>
        </div>

        {/* The figure. A tinted panel behind the lower part of it, the cut-out standing in front
        with its head above the panel's top edge, and its three cut edges — the sides and the foot,
        where the supplied cut-outs meet the edge of their own frame — laid exactly on the panel's,
        which is why the picture is always its own width and never cropped: a cut-out narrower than
        its panel shows a shoulder ending in a straight line in mid-air. */}
        <figure
          className="landing-portrait"
          data-figure={figure.cutout ? "cutout" : "photograph"}
        >
          <div className="landing-portrait-frame">
            {[slide].map((slide) => (
              <div key={slide.id} className="landing-slide is-on">
                <div className="editorial-photo-visual">
                  <picture>
                    <source
                      srcSet={figure.srcSet}
                      sizes="(min-width: 900px) 528px, min(54vw, 260px)"
                      type="image/webp"
                    />
                    <img
                      src={figure.fallback}
                      alt=""
                      aria-hidden="true"
                      width={figure.width}
                      height={figure.height}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                    />
                  </picture>
                </div>
                {slide.cards.map((card) => (
                  <div
                    key={card.title}
                    className={`landing-hero-card at-${card.at}`}
                  >
                    <span className={`landing-hero-disc tint-${card.tint}`}>
                      <HeroGlyph name={card.icon} size={20} />
                    </span>
                    <span>
                      <i>{card.title}</i>
                      {card.lines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* The figure's two standing lines, together at its foot: where the service is being
          built, and that the people shown are illustrative. Neither belongs to a slide, and the
          second is a refusal a rotation may never carry off the screen. */}
          <p className="landing-portrait-place">
            <MapPin size={15} aria-hidden="true" />
            {standing.place}
          </p>
          <figcaption>{standing.photographNote}</figcaption>
        </figure>
      </div>

      {/* The ledge: the dark strip of sections, lifted over the foot of the hero so the two read as
      one piece, and the soft glow behind it that is one of the page's two ambient drifts. */}
      <div className="hero-ledge">
        <nav className="studio-bar-wrap" aria-label="Jump to a section">
          <ul className="studio-bar">
            {barSections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>
                  {barIcons[id]}
                  <span>{label}</span>
                  <i aria-hidden="true">
                    <ArrowRight size={17} />
                  </i>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

function Head({
  index,
  eyebrow,
  title,
  body,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body?: React.ReactNode;
}) {
  return (
    <div className="landing-head" data-reveal>
      <p className="landing-eyebrow">
        <i>{index}</i>
        {eyebrow}
      </p>
      <h2>{title}</h2>
      {body ? <p className="landing-lede">{body}</p> : null}
    </div>
  );
}

/* The public page. It is honest about what MyThuso is today: a service being built, not one you can
   summon tonight. A health service that overstates its readiness is not a marketing problem, so the
   three statements to that effect — the banner, the caption under the photograph and the footer —
   are part of the layout rather than something tucked under it. */
export function Landing() {
  const [menu, setMenu] = useState(false);
  const [login, setLogin] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const [serviceQuery, setServiceQuery] = useState("");
  const [serviceCategory, setServiceCategory] = useState("All care");
  const serviceSearch = useRef<HTMLInputElement>(null);
  const { opening, onClick: opened } = useOpening();
  const query = serviceQuery.trim().toLocaleLowerCase();
  const matchingServices = liveServices.filter(
    (s) =>
      (serviceCategory === "All care" || s.category === serviceCategory) &&
      `${s.name} ${s.description} ${s.category}`
        .toLocaleLowerCase()
        .includes(query),
  );
  const resetServices = () => {
    setServiceQuery("");
    setServiceCategory("All care");
    serviceSearch.current?.focus();
  };
  useReveal();
  useAmbientVisibility();
  /* This page has motion that starts on its own, so it says so. Nothing endless runs until the flag
    is up, which means a reader whose script never loaded gets a still page rather than a moving one
    with no way to stop it. */
  useDecor();
  const { y, progress } = useScrollProgress();
  return (
    <div className="landing" style={{ ["--scroll" as string]: progress }}>
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
        <span className="status-dot" />
        <p>
          <strong>MyThuso is in development.</strong> This page describes a
          service being built in Johannesburg. Nothing here books a visit, takes
          a payment or sends a nurse anywhere.
        </p>
        <a href={statusHref}>
          What is connected: {connectedCount} of {capabilities.length}
          <ArrowRight size={14} />
        </a>
      </div>

      <header className={`landing-nav${y > 24 ? " is-condensed" : ""}`}>
        <a className="landing-brand" href={homeHref}>
          <img src="/brand/mythuso-logo.svg" alt="MyThuso" />
        </a>
        <nav className={menu ? "is-open" : ""} aria-label="Sections">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
        </nav>
        <MotionPause className="landing-nav-pause" />
        <button
          className="primary landing-cta"
          type="button"
          aria-haspopup="dialog"
          onClick={() => setLogin(true)}
        >
          Log in
          <ArrowRight size={16} />
        </button>
        <button
          className="icon-button landing-menu"
          aria-label={menu ? "Close menu" : "Open menu"}
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          {menu ? <X size={20} /> : <Menu size={20} />}
        </button>
        <i className="landing-progress" aria-hidden="true" />
      </header>

      {login && (
        <Suspense fallback={<p role="status">Opening login…</p>}>
          <LoginPanel onClose={() => setLogin(false)} />
        </Suspense>
      )}
      <Hero />

      {/* No figures band between the hero and the steps any more. Its four numbers were the fourth
      place on this page the same four numbers appeared, and every one of them is still here: the
      price is under the headline and on every service, the checks are counted in Safety, the share
      is the nurses' heading and the services are counted in the footer. */}
      <section id="how" className="landing-section">
        <Head
          index="01"
          eyebrow="How it works"
          title="Your care. A team around you."
          body="Your nurse and doctor work together around your needs, including a doctor’s home visit when they decide it is needed. Software supports the team; it never diagnoses or prescribes."
        />
        {/* The connector between the three cards is drawn by the stylesheet and fills once, left to
        right, as each card arrives — the one orienting movement this section has, in place of the
        three rings that used to turn behind each portrait for as long as the page was open. */}
        <ol className="landing-steps">
          {steps.map((s, i) => (
            <li key={s.title} data-reveal style={{ ["--i" as string]: i }}>
              <div className="landing-step-top">
                <span className="landing-step-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="landing-step-person-label">
                  <s.icon size={16} aria-hidden="true" />
                  {s.person}
                </span>
              </div>
              <div
                className="step-person-orbit"
                data-tint={tints[i]}
                aria-hidden="true"
              >
                <img
                  src={`/editorial/step-${s.portrait}.jpg`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width="144"
                  height="144"
                />
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="step-portrait-note">Illustrative portraits.</p>
        <p className="landing-note" data-reveal>
          The target being built to is under an hour from booking to arrival, in
          the areas MyThuso opens in. It is a target, not a promise, and nothing
          on this page dispatches anybody.
        </p>
      </section>

      <section id="services" className="landing-section tinted">
        <Head
          index="02"
          eyebrow="What a nurse is sent to do"
          title="The visits that should not cost you a day."
          body={
            <>
              At launch a nurse can be dispatched to {liveServices.length} of
              the {services.length} services in the catalogue. Each price below
              is the price paid: no call-out fee, no charge per kilometre, and
              no bill afterwards that nobody mentioned.
            </>
          }
        />
        <div className="landing-service-finder">
          <label
            className="landing-service-search"
            htmlFor="landing-service-search"
          >
            <span>Find the care you need</span>
            <input
              ref={serviceSearch}
              id="landing-service-search"
              type="search"
              placeholder="Try blood tests or wound care"
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
              aria-controls="landing-service-results"
            />
          </label>
          <div
            className="landing-service-categories"
            role="group"
            aria-label="Filter services by category"
          >
            {serviceCategories.map((category) => (
              <button
                type="button"
                key={category}
                aria-pressed={serviceCategory === category}
                onClick={() => setServiceCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="landing-service-result-note">
            <p aria-live="polite" aria-atomic="true">
              {matchingServices.length}{" "}
              {matchingServices.length === 1 ? "service" : "services"}
              {serviceCategory !== "All care"
                ? ` in ${serviceCategory.toLocaleLowerCase()}`
                : " at launch"}
            </p>
            {(serviceQuery || serviceCategory !== "All care") && (
              <button type="button" onClick={resetServices}>
                Reset filters
              </button>
            )}
          </div>
        </div>
        {/* Keyed to the filter, so a search or a category that resolves remounts the list and its
        short settle runs once — the reader sees the result land rather than the cards silently
        swapping under the cursor. */}
        <ul
          id="landing-service-results"
          className="landing-services"
          key={`${serviceCategory}|${query}`}
        >
          {matchingServices.map((s, i) => (
            <li
              key={s.id}
              data-reveal="shown"
              style={{ ["--i" as string]: i % 3 }}
            >
              <span className="service-icon" aria-hidden="true">
                <ServiceIcon name={s.icon} size={20} />
              </span>
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <p className="landing-price">
                <strong>From {money(s.price)}</strong>
                <span>{s.duration} min</span>
              </p>
            </li>
          ))}
        </ul>
        {matchingServices.length === 0 && (
          <div className="landing-service-empty">
            <h3>No services match your search.</h3>
            <p>Try a shorter search or choose another category.</p>
            <button type="button" onClick={resetServices}>
              Show all launch services
              <ArrowRight size={18} />
            </button>
          </div>
        )}
        <p className="landing-note" data-reveal>
          Later-phase services — screening bundles, men&rsquo;s health,
          mental-health check-ins and allied health — appear in the app marked
          with the phase they arrive in. None of them can be booked, here or
          there.
        </p>
      </section>

      {/* The "Thuso Pass" split that stood here is gone with its 2.2 MB photograph. What it said —
      that a record is the patient's, entry by entry, and that paying for someone is not the same
      as reading their file — is said in Safety's boundaries below, in the contract's own words. */}
      <section id="plans" className="landing-section tinted">
        <Head
          index="03"
          eyebrow="Thuso Routine"
          title="Care that keeps showing up."
          body={
            <>
              A chronic condition is not managed in a single visit. A plan is
              designed to cover the visit, the doctor review, the script and the
              medicine together, from {money(fromPlan)} a month.
            </>
          }
        />
        {/* No plan is flagged as the popular one. Nobody has subscribed to any of these, so the phase
       each arrives in is the only thing there is to say about it that is true. */}
        {/* MyThuso for Mom has three prices, and the card shows the lowest and the highest rather than
       only the lowest: "R 399 a month" beside a plan whose Premium is R 1 299 is a figure somebody
       would reasonably expect to pay for everything the plan is known for. */}
        <ul className="landing-plans">
          {plans.map((s, i) => {
            const prices = monthlyPrices(s);
            return (
              <li key={s.id} data-reveal style={{ ["--i" as string]: i }}>
                <span className="landing-phase">
                  Phase {isTiered(s) ? momPhases : s.phase}
                </span>
                <span className="tile-icon">
                  <Heart size={19} />
                </span>
                <h3>{s.name}</h3>
                <p className="landing-price">
                  <strong>{money(Math.min(...prices))}</strong>
                  <span>
                    {prices.length > 1
                      ? `to ${money(Math.max(...prices))} a month`
                      : "a month"}
                  </span>
                </p>
                <p>{s.includes}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* One strip rather than a split with a photograph: the share, the range and the door. The
      three bullets that used to follow described a kit, a rota and an escalation route that the
      nurse's own workspace shows properly, behind the link. */}
      <section id="nurses" className="landing-section landing-nurses">
        <div data-reveal>
          <p className="landing-eyebrow">
            <i>04</i>For nurses
          </p>
          {/* The share is the catalogue's, and it is said about the services this page lists — the ones a
        nurse can be sent to at launch. Some later services pay a smaller share, so "of every fee" would
        be a promise the catalogue does not keep; scripts/check-boundaries.mjs holds the words to it. */}
          <h2>
            Your registration. Your hours. {nurseShare}% of every launch visit.
          </h2>
          <p className="landing-lede">
            Thousands of qualified South African nurses are unemployed or on
            short contracts. MyThuso is designed as a marketplace rather than an
            agency: you would choose when you work, keep {nurseShare}% of the
            fee for every service offered at launch, and be paid weekly.
          </p>
          {/* The range below is written as two literals on purpose. scripts/check-boundaries.mjs reads
        this exact pattern out of this file and compares it against every phase-one nurse share in
        the catalogue, so the claim cannot outlive the prices it is made about. */}
          <div className="landing-nurse-row">
            <p className="landing-nurse-range">
              <Wallet size={18} aria-hidden="true" />
              <span>
                <strong>
                  {money(187)}–{money(299)} a visit
                </strong>
                The nurse&rsquo;s share of each launch price, paid out weekly.
              </span>
            </p>
            <a className="secondary landing-secondary" href={nurseHref}>
              See the nurse's side
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <section
        id="safety"
        className="landing-section safety-section"
        aria-labelledby="safety-title"
      >
        <div className="safety-heading">
          <header>
            <p className="landing-eyebrow">
              <i>05</i>Patient safety
            </p>
            <h2 id="safety-title">Safety is a condition of care.</h2>
            <p className="safety-intro">
              Professional registration, identity and clinical readiness must be
              checked before care begins. These are the nurse verification
              requirements for our planned launch, with review schedules shown
              for each check.
            </p>
          </header>
          <aside className="safety-standard">
            <ShieldCheck size={32} strokeWidth={1.5} aria-hidden="true" />
            <h3>Verification is mandatory</h3>
            <p>
              All {nurseChecks.length} nurse checks must pass before a first
              visit can be accepted.
            </p>
          </aside>
        </div>
        <div className="safety-register-title">
          <h3>Nurse verification requirements</h3>
          <span>{nurseChecks.length} required checks</span>
        </div>
        <div className="safety-register-columns" aria-hidden="true">
          <span>Requirement</span>
          <span>How it is checked</span>
          <span>Review schedule</span>
        </div>
        <ul className="landing-checks">
          {nurseChecks.map((c, i) => (
            <li key={c.id}>
              <div className="safety-check-heading">
                <span className="safety-check-number" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{c.name}</h3>
              </div>
              <p className="safety-check-detail">{c.detail}</p>
              <p className="landing-cadence">
                <Clock3 size={15} aria-hidden="true" />
                <span>
                  <span className="safety-review-label">Review schedule</span>
                  {renewal(c.renewMonths)}
                </span>
              </p>
            </li>
          ))}
        </ul>
        <div className="landing-refusals">
          <h3>Access and clinical boundaries</h3>
          <p className="safety-boundaries-intro">
            Rules that protect your records and keep clinical decisions with
            authorised professionals.
          </p>
          <ul>
            {refusals.map((r) => (
              <li key={r.capability}>
                <strong>{r.title}</strong>
                <p>{r.sentence}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-section landing-questions">
        <Head
          index="06"
          eyebrow="Questions"
          title="The things people actually ask."
        />
        <div className="landing-faq" data-reveal>
          {questions.map(([q, a], i) => (
            <div key={q} className={open === i ? "is-open" : ""}>
              <h3>
                <button
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {q}
                  <ChevronDown size={19} />
                </button>
              </h3>
              <div className="landing-answer" inert={open !== i}>
                <div>
                  <p>{a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <div data-reveal>
          <h2>Help. Health. Home.</h2>
          <p>
            A nurse at your door, a doctor on the screen, your record in your
            pocket. Being built in Johannesburg, for South Africa.
          </p>
          <a className="primary m-press" href={appHref} onClick={opened}>
            {opening ? "Opening…" : "Open the app"}
            <ArrowRight size={17} />
          </a>
          <p className="landing-final-note">
            Nothing is booked and nothing is charged until the service opens.
            Every screen says what it is not yet connected to.
          </p>
        </div>
      </section>

      <Suspense fallback={null}>
        <PublicAssistant />
      </Suspense>
      <footer className="landing-footer">
        <div>
          <img src="/brand/mythuso-logo.svg" alt="MyThuso" />
          <p>
            MyThuso is a product of Akhanya IT Innovations (Pty) Ltd,
            Johannesburg. {services.length} services in the catalogue,{" "}
            {liveServices.length} of them at launch.
          </p>
        </div>
        <div className="landing-footer-note">
          <p>
            <strong>This is a preview, not a live service.</strong> No visit can
            be booked, no payment taken and no clinical service provided. People
            shown are illustrative and are not MyThuso nurses or patients.
          </p>
          <p>© 2026 MyThuso · Help. Health. Home.</p>
        </div>
      </footer>
    </div>
  );
}
