import { Fragment, createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, Clock3, FileText, MapPin, Radio, Ruler, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import { Metric } from '../surface/Surface';
import { useDecor } from '../lib/motion';
import { money } from '../lib/catalog';
import { Card } from '../ui';
import './clinical-deck.css';

/* The instrument deck a nurse and a doctor open the workspace on.
 *
 * SINCE THE IDENTITY OF 28 SEPTEMBER 2026 (the Lovable handoff, wave 4c) IT IS THE HANDOFF'S COMMAND VIEW.
 * A hero that says what the screen is for, and under it one row of white metric cards on the shared
 * Card: compact corners, one shadow, the figure in the display face. The pastel grounds that stood here
 * for one afternoon — a dark lead card, lavender, peach and mint — are retired, because the handoff
 * reserves colour for action, selection and progress and a tint per card had stopped meaning any of
 * them. What still marks the lead is its place and an aqua rule along its top edge, and its lit marks
 * are the only aqua on the row; a flagged figure says so in its chip, in words, in the warning ink.
 * The history below explains the composition the deck grew out of and is kept because every rule it
 * arrived at still holds: what a shape may be, what moves, and which figure leads. Where a paragraph
 * below says "dark glass", "pale panel" or a tint, read "the lead card" and "the last card".
 *
 * WHAT WAS WRONG WITH THE STRIP IT REPLACES. Three figures in a row, one of them on a lime tile,
 * with nothing between them and the list underneath. Every figure the same size, the same weight and
 * the same distance from the next, so the screen said "here are three numbers" rather than "here is
 * the shape of your day". A clinician reads it, learns nothing she could not have learned by
 * counting the rows, and scrolls past.
 *
 * AND WHAT WAS STILL WRONG AFTER THAT. The deck answered it with a lead panel and a pair beside it,
 * and the three of them still sat in one flat band at one elevation, under a 13px eyebrow carrying
 * the most valuable line on the screen. The founder sent a reference — a near-black canvas, an
 * enormous headline with circular glyph badges set inside the sentence, a big figure on dark glass,
 * a pale panel with a chart behind the numeral, and cards that cross the edge of the panel they
 * belong to. What is taken from it is the composition and the depth. What is deliberately not taken
 * is the violet: the secondary accent here is the indigo the token contract already ships, because
 * a violet product is a different company. Since 14 September the deck is drawn in the logo's own
 * colours in the clinical shell, at the founder's word: the lead accent is the logo's green as its
 * reversed lockup draws it on ink, spent once per deck on the figure the screen was opened for, and
 * the logo's lime is the dot — the badge inside the headline and nothing else.
 *
 * WHAT A SHAPE IS ALLOWED TO BE HERE, AND THE ONE RULE THAT GOVERNS ALL OF IT. Every drawing below
 * is built from the same arithmetic as the numeral beside it and carries no fact of its own. The
 * doctor's ring has one arc per row on the queue below and the bright arcs are the rows carrying a
 * badge; the nurse's day is her three visits drawn to the length each one actually takes, out of the
 * same service durations the rows are timed from; the hatched bars on the pale panel are that queue
 * again, one bar per row, each carrying the reference of the row it is — so the figure "the longest
 * wait" names a row a reader can find. Nothing here may introduce a number. The figures are still
 * decided in one place, apps/web/src/shells/StaffShell.tsx's `metricsOf`, which is the block
 * scripts/check-boundaries.mjs reads for a typed digit.
 *
 * WHAT MOVES, AND WHAT IS REFUSED THE RIGHT TO MOVE. The arcs and lines draw themselves on arrival
 * through components/ChartMotion.tsx — the same observer that draws the passport's charts, for the
 * same reason: it settles every animation the moment a reader asks for less motion, and the resting
 * state of every mark is the finished mark, so stillness is the complete picture and never an empty
 * ring. One figure counts up, and it is money rather than anything clinical: a rand total that
 * spends half a second being wrong is a flourish, and a queue length that spends half a second being
 * wrong is a doctor reading the wrong number. The count-up never re-formats the figure either — it
 * asks the catalogue's own formatter for each step, so the number that lands is the number the strip
 * counted, in the shape the strip counted it in.
 *
 * THE THREE GROUNDS. The canvas is the dark ground the ThusoIQ workbench header below already stands
 * on — in the clinical shell that is the logo's ink — so the two dark bands frame the work between
 * them rather than one of them being an exception. On it the lead stands on dark glass, the canvas
 * lifted eight per cent, and the quiet half of the deck stands on a pale panel: a wash of the logo's
 * green, where the reference draws lavender. Every pair is measured beside the rules that use it in
 * clinical-deck.css. The green itself is 3.55 on the ink and so is a mark there at most, never a
 * word; on the pale panel it is the mark and the ink is the word. */

/** A word of the deck's headline, or the circular badge that stands inside the sentence in place of
    one. The badge is decorative — the sentence reads correctly with every badge removed, which is
    what lets it be hidden from a screen reader rather than described. */
/* Nine and no more. Every one names the object a screen is about — the queue's clock, the nurse's
   pin, a file, a range, a register, a wallet, a live instrument, a visit, a person — and a badge
   that stood for nothing in particular would be an ornament set inside a sentence. */
const GLYPHS = { clock: Clock3, pin: MapPin, file: FileText, ruler: Ruler, shield: ShieldCheck, wallet: Wallet, radio: Radio, clipboard: ClipboardList, user: UserRound } as const;
export type DeckGlyph = keyof typeof GLYPHS;
export type DeckHeadline = readonly (string | { glyph: DeckGlyph })[];

/* THE SUB-PAGES OPEN ON THIS DECK TOO, AND THAT IS WHY A DECK CAN NAME ITS PAGE.
   The doctor's queue and the nurse's day draw their <h1> in the workbench below the deck. The
   seven screens behind them — a file, a record, the protocols, an assessment, the kit, earnings,
   vetting — have no workbench, and a second large title above a 42px display line was two
   headlines fighting for one screen. So a deck handed a `title` sets it where the eyebrow is, as
   the heading, and the display sentence stays a paragraph.
   Which heading depends on where the screen is standing, and the screen cannot see that: the same
   earnings screen is a page in the workspace and a dialog opened from a More tools link, and a
   dialog already carries its own <h2>. The shell says so through this context, and anything it
   does not wrap is treated as standing inside something else. */
export const DeckTitleLevel = createContext<'h1' | 'h3'>('h3');

/** The drawing that belongs to one figure. Every field is counted off the rows the figure counts. */
export type DeckShape =
 /** One arc per row. `on` is the row carrying the badge the chip counts — flagged, or signed off. */
 | { kind: 'ring'; segments: readonly boolean[] }
 /** A part of a whole, as a dial. Both numbers are the strip's own. */
 | { kind: 'gauge'; part: number; whole: number }
 /** One bar per row, as long as that row has waited. The longest is the row the figure names, and
     `labels` is what each row is called, so the figure names a row rather than a length. */
 | { kind: 'bars'; values: readonly number[]; labels?: readonly string[]; label?: string }
 /** The working day to scale, and where now sits in it. */
 | { kind: 'day'; spans: readonly { from: number; to: number; signed: boolean }[]; from: number; to: number }
 /** A short series under a headline figure, and the figure it counts up to. */
 | { kind: 'spark'; values: readonly number[]; countTo: number };

export type DeckFigure = {
 label: string; value: string; unit?: string; prefix?: string; chip: string; flagged: boolean;
 shape?: DeckShape;
};

/* ---- Geometry ----------------------------------------------------------------------------------
   Turns rather than degrees or radians, measured clockwise from twelve o'clock, because every arc
   in here is "this many of that many" and a fraction of a circle is what that means. */
const TAU = Math.PI * 2;
const at = (cx: number, cy: number, r: number, turn: number): [number, number] =>
 [cx + r * Math.sin(turn * TAU), cy - r * Math.cos(turn * TAU)];
const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
 const [x1, y1] = at(cx, cy, r, from);
 const [x2, y2] = at(cx, cy, r, to);
 return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes) % 60).padStart(2, '0')}`;

/* ---- The instruments ---------------------------------------------------------------------------
 *
 * Each one is aria-hidden where it restates the chip and the numeral it sits with, and carries a
 * counted label where it says something they do not. A ring of three arcs over the words "3" and
 * "2 out of range" is the same sentence drawn twice, and a screen reader that reads it twice has
 * been given noise; the shape of a day is a fact nothing else on the strip states, so it is read. */

/** The queue, or the day, as arcs — one per row, the marked ones brighter and heavier. Colour is
    never the only difference between the two states: a marked arc is also the thicker one. */
function Ring({ segments }: { segments: readonly boolean[] }) {
 const count = Math.max(segments.length, 1);
 const step = 1 / count;
 /* A gap wide enough to count the arcs across, and never wider than a third of an arc — a ring of
    twelve cases must not dissolve into a dotted line. */
 const gap = Math.min(0.028, step / 3);
 return <svg className="c-plot c-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <circle className="c-ring-track" cx="50" cy="50" r="39"/>
  {segments.map((on, i) =>
   <path key={i} className={`c-mark${on ? ' on' : ''}`} d={arc(50, 50, 39, i * step + gap / 2, (i + 1) * step - gap / 2)}/>)}
 </svg>;
}

/** A part of a whole as a dial: how much of the queue is pressing rather than merely waiting. */
function Gauge({ part, whole }: { part: number; whole: number }) {
 const from = 0.625, sweep = 0.75;
 const filled = whole > 0 ? clamp(part / whole, 0, 1) : 0;
 return <svg className="c-plot c-gauge" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <path className="c-ring-track" d={arc(50, 50, 39, from, from + sweep)}/>
  {filled > 0 && <path className="c-mark on" d={arc(50, 50, 39, from, from + sweep * filled)}/>}
 </svg>;
}

/** One bar per row, as long as that row has waited, and — where the strip hands them over — what
    each row is called. The longest is the row the figure names, and naming it is the difference
    between "the oldest has waited three hours" and "TH-2048 has".

    The captions are siblings of the bars rather than wrappers around them, which looks like an odd
    way to build a two-column list until you remember what the bars are: tests/workspace-counts.spec
    counts `.c-waits > i` against the rows on the queue, and components/ChartMotion.tsx animates the
    same direct children. A wrapper element would have broken both without either of them saying so. */
function Bars({ values, labels, label }: { values: readonly number[]; labels?: readonly string[]; label: string }) {
 const longest = Math.max(...values, 1);
 return <div className="c-bars c-waits" role="img" aria-label={label}>
  {values.map((value, i) => <Fragment key={i}>
   {labels?.[i] && <em>{labels[i]}</em>}
   {/* A floor of four per cent so a case that has only just arrived is still a bar rather than
       nothing at all — a queue with an invisible row in it reads as a shorter queue. */}
   <i className={value === longest ? 'on' : ''} style={{ width: `${clamp(value / longest * 100, 4, 100)}%` }}/>
  </Fragment>)}
 </div>;
}

/** The working day to scale, each visit as long as its service actually takes, and a mark for now.

    The mark is drawn only while now is inside the day. A needle parked at one end of a track from
    seven in the evening would say the last visit is about to start, which is the kind of figure a
    reader can disprove by looking out of the window. */
function Day({ spans, from, to, label }: { spans: readonly { from: number; to: number; signed: boolean }[]; from: number; to: number; label: string }) {
 const [now, setNow] = useState(() => new Date());
 /* Once a minute, and it is freshness rather than motion: a clock that stops when a reader asks for
    less movement is a clock that lies to them instead. The mark travels a third of a pixel a
    minute, touches no control and is not a target. */
 useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
 const span = Math.max(to - from, 1);
 const pct = (minute: number) => (minute - from) / span * 100;
 const minuteNow = now.getHours() * 60 + now.getMinutes();
 const inside = minuteNow >= from && minuteNow <= to;
 return <>
  <div className="c-bars c-day" role="img" aria-label={`${label}${inside ? `. It is ${hhmm(minuteNow)} now` : ''}`}>
   {spans.map((visit, i) =>
    <i key={i} className={`${visit.signed ? 'done' : ''}${i === 0 ? ' on' : ''}`}
       style={{ left: `${pct(visit.from)}%`, width: `${Math.max(pct(visit.to) - pct(visit.from), 3)}%` }}/>)}
   {inside && <span className="c-now" style={{ left: `${clamp(pct(minuteNow), 0, 100)}%` }}/>}
  </div>
  {/* The two ends of the track, so the blocks on it are a day rather than three shapes. The middle
      says where now is only while now is in the day: "before the first visit" is what an empty
      middle already says, and a third state written out in words would be saying it twice. */}
  <div className="c-day-scale" aria-hidden="true">
   <span>{hhmm(from)}</span>
   <span className="c-day-now">{inside ? `now ${hhmm(minuteNow)}` : ''}</span>
   <span>{hhmm(to)}</span>
  </div>
 </>;
}

/** The weeks behind the headline figure. Flat where a week was flat; it invents no trend, and the
    week the figure itself states is not on it — see the note above `weekTotals` in the staff shell. */
function Spark({ values, label }: { values: readonly number[]; label: string }) {
 const high = Math.max(...values), low = Math.min(...values);
 const spread = high - low || 1;
 const x = (i: number) => values.length > 1 ? i / (values.length - 1) * 100 : 50;
 const y = (value: number) => 36 - (value - low) / spread * 28;
 const line = values.map((value, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
 return <>
  <svg className="c-plot c-spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label} focusable="false">
   <path className="c-area c-fade" d={`${line} L 100 40 L 0 40 Z`}/>
   <path className="c-mark on" d={line} vectorEffect="non-scaling-stroke"/>
  </svg>
  {/* What the line is, so nobody reads it as this week's own shape. */}
  <div className="c-day-scale" aria-hidden="true"><span>{values.length} weeks before this one</span></div>
 </>;
}

/* ---- The count-up ------------------------------------------------------------------------------
   Money only, and it lands on the figure the strip worked out rather than on one of its own: each
   step asks the catalogue's formatter, so the last step is the same call the strip made. Refused
   motion is not a shorter count — it is no count, with the figure already there on the first
   painted frame, because a reader who asked for stillness asked to be told the number. */
const RISE = 700;
function useCountUp(target: number, allowed: boolean) {
 const [shown, setShown] = useState(target);
 useEffect(() => {
  if (!allowed) { setShown(target); return; }
  let frame = 0;
  const began = performance.now();
  const step = (stamp: number) => {
   const through = Math.min(1, (stamp - began) / RISE);
   setShown(Math.round(target * (1 - (1 - through) ** 3)));
   if (through < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(frame); setShown(target); };
 }, [target, allowed]);
 return shown;
}
/** The digits of a formatted amount, without the R the strip draws separately. */
const digitsOf = (amount: number) => { const text = money(amount); return text.slice(text.search(/\d/)); };

/* ---- The deck ---------------------------------------------------------------------------------- */
export function ClinicalDeck({ role, figures, eyebrow, headline, note, title, lead: leadNode, panel: panelNode, leadNote, children }: {
 role: string; figures: readonly DeckFigure[]; eyebrow?: string; headline: DeckHeadline; note: string;
 /** The page's own name, set as its heading. See DeckTitleLevel. */
 title?: string;
 /** Something that is not a figure, on the dark glass: the person a file is about. */
 lead?: ReactNode;
 /** Something that is not a figure, on the pale panel: the stages of a visit, whose record it is. */
 panel?: ReactNode;
 /** Under the sentence: the not-connected notice, and a control that changes what the deck counts. */
 children?: ReactNode;
 /** A sentence at the foot of the dark card, about the figure on it — the nurse's share, as the
     settings engine words it. Handed in, never typed here, so the deck cannot state a rule itself. */
 leadNote?: string;
}) {
 const Title = useContext(DeckTitleLevel);
 const { playing } = useDecor();
 /* THE THREE PLACES A FIGURE CAN STAND, and which one it gets is the order of the strip rather than
    a second opinion about which number matters. metricsOf orders every strip urgency-first and has
    done since the strips were written.
      lead   — the first figure, on dark glass under the headline, and the only one spending the accent.
      float  — the middle, on a card that crosses the pale panel's leading edge.
      panel  — the last, which is the quiet half of the deck: a chart with its numeral standing on
               it, drawn large in area and moderate in type so it cannot outrank the lead. */
 /* A screen can hand over a lead or a panel that is not a figure. The rule above still decides the
    rest: whatever figures are left, in strip order, fill the places that are free. */
 const [first, ...others] = figures;
 const rest = leadNode ? figures : others;
 const lead = leadNode ? undefined : first;
 const panel = panelNode ? undefined : rest.length ? rest[rest.length - 1] : undefined;
 const floats = panelNode ? rest : rest.slice(0, -1);
 const spark = figures.find(figure => figure.shape?.kind === 'spark')?.shape;
 const rising = useCountUp(spark?.kind === 'spark' ? spark.countTo : 0, playing);
 /* A deck with nothing on it is not a deck. A screen with no figures yet — an application before a
    role is chosen — still gets the sentence, because the sentence is what the screen is for. */
 if (!lead && !leadNode && !headline.length) return null;
 const draw = (figure: DeckFigure): ReactNode => {
  const shape = figure.shape;
  if (!shape) return undefined;
  if (shape.kind === 'ring') return <Ring segments={shape.segments}/>;
  if (shape.kind === 'gauge') return <Gauge part={shape.part} whole={shape.whole}/>;
  if (shape.kind === 'bars') return <Bars values={shape.values} labels={shape.labels} label={shape.label ?? `${shape.values.length} waiting, the longest of them ${figure.value}`}/>;
  if (shape.kind === 'day') return <Day spans={shape.spans} from={shape.from} to={shape.to}
   label={`${shape.spans.length} visits between ${hhmm(shape.from)} and ${hhmm(shape.to)}, ${shape.spans.filter(visit => visit.signed).length} signed off`}/>;
  return <Spark values={shape.values} label={`The ${shape.values.length} weeks before this one, oldest first: ${shape.values.map(week => money(week)).join(', ')}`}/>;
 };
 /* The figure a count-up owns is re-rendered from the count rather than from the strip's string. It
    is the same string on the last frame: both are money() of the same total. */
 const figureValue = (figure: DeckFigure) =>
  figure.shape?.kind === 'spark' ? digitsOf(rising) : figure.value;
 const instrument = (figure: DeckFigure, isLead: boolean) =>
  <div className={`c-instrument c-instrument-${figure.shape?.kind ?? 'plain'}${isLead ? ' lead' : ''}`} key={figure.label}>
   <Metric label={figure.label} value={figureValue(figure)} unit={figure.unit} prefix={figure.prefix}
           chip={figure.chip} flagged={figure.flagged} visual={draw(figure)}/>
  </div>;
 /* THE ROW, AND WHICH PLACE EACH CARD STANDS IN. The place a figure stands is the strip's order and
    nothing else, and every card is the same white Card; what differs is said in the markup rather than
    in a colour:
      lead   — the figure the screen was opened for: an aqua rule along its top, the larger numeral,
               and the only aqua marks on the row.
      float  — the middle; `is-flagged` when its own chip is the flagged one, which already says so in
               words and in the warning ink, so nothing about the card is told by colour alone.
      panel  — the quiet summary: the weeks behind a total, the queue's waits, a visit's stages.
    The cards are siblings in reading order — lead, floats, panel — so the order a screen reader walks
    is the order the row is drawn in, left to right, and then top to bottom when it wraps.
    `--c-i` is the card's place in that order, which is all the staggered entrance reads. */
 const hasPanel = !!(panel || panelNode);
 let order = 0;
 const card = (place: 'lead' | 'float' | 'panel', flagged: boolean, className: string, body: ReactNode, key: string) =>
  <Card className={`c-card ${className}${flagged ? ' is-flagged' : ''}`} data-place={place} key={key} style={{ ['--c-i' as string]: order++ }}>{body}</Card>;
 return <section className={`c-deck${hasPanel ? '' : ' is-say-only'}`} aria-label={`${role} — the shape of the work below`}>
  {/* The grid is one element in, because the deck is the container its own columns are decided
      against: a query cannot ask about the box it is written on. It is the width of the deck and not
      of the window that decides how the row wraps, which is what lets the same deck stand in a
      1080px work column and in a 560px dialog without either of them being the wrong layout. */}
  <div className="c-deck-grid">
  <div className="c-deck-say">
   {/* What the deck is, not which workspace it is in: the shell's own eyebrow says DOCTOR three
       lines above this one, and a screen that says the same word twice at the top of itself has
       spent its most valuable line saying nothing. */}
   {title
    ? <div className="c-deck-eyebrows"><Title className="c-deck-eyebrow c-deck-title">{title}</Title>{eyebrow && <span className="c-deck-eyebrow-aside">{eyebrow}</span>}</div>
    : <span className="c-deck-eyebrow">{eyebrow}</span>}
   {/* Not a heading element. The section under this deck draws the page's own <h1> — the review
       queue, the nurse's date — and a display line above it marked up as <h2> would put a level two
       in front of the level one and leave a screen reader's outline opening on the wrong rung. It
       is a sentence set large, so it is a paragraph set large.
       The badges are aria-hidden, and the sentence is written so that it reads correctly with every
       one of them removed. The second line is the one that tells a reader what to do if a figure
       looks wrong, which is to count the rows it was counted from. */}
   <p className="c-deck-headline">
    {headline.map((part, i) => <Fragment key={i}>
     {typeof part === 'string' ? part : <Glyph of={part.glyph}/>}{' '}
    </Fragment>)}
    <span className="c-deck-tail">{note}</span>
   </p>
   {children && <div className="c-deck-extra">{children}</div>}
  </div>
  {(lead || leadNode || floats.length > 0 || hasPanel) && <div className="c-deck-cards">
   {lead && card('lead', false, 'c-deck-lead', <>{instrument(lead, true)}{leadNote && <p className="c-card-note">{leadNote}</p>}</>, 'lead')}
   {leadNode && card('lead', false, 'c-deck-lead is-custom', leadNode, 'lead')}
   {floats.map(figure => card('float', figure.flagged, 'c-deck-float', instrument(figure, false), `float-${figure.label}`))}
   {panel && card('panel', false, 'c-deck-panel', <div className="c-deck-panel-figure">{instrument(panel, false)}</div>, 'panel')}
   {panelNode && card('panel', false, 'c-deck-panel', <div className="c-deck-panel-body">{panelNode}</div>, 'panel-body')}
  </div>}
  </div>
 </section>;
}

/** A small badge set inside the headline: the icon in the foreground ink on an aqua tint, a compact
    square rather than the lime disc it was, because the handoff keeps pill shapes for badges and
    statuses and this is neither. Decorative, and hidden from a screen reader. */
function Glyph({ of }: { of: DeckGlyph }) {
 const Icon = GLYPHS[of];
 return <span className="c-deck-glyph" aria-hidden="true"><Icon size={20} strokeWidth={2.1}/></span>;
}
