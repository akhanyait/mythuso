import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import './surface.css';
/* The dashboard language, as components.
 *
 * The founder chose a reference and the palette alone did not get us there, because what makes that
 * reference recognisable is not its colours — it is a handful of specific shapes. A metric with the
 * status chip *above* a large thin numeral. A navigation row that is a pill with a circular arrow at
 * its trailing edge. A card separated by a hairline rather than a shadow. They are here so that
 * every screen gets the same ones, rather than twenty screens each approximating them.
 *
 * Nothing in this file knows anything about health. It is shape only: what a figure looks like, not
 * what any figure means. */

/** A number with its status above it and its name below — the reference's signature, and the
    inversion of what this product did everywhere, which was a small label above a bold figure. */
export function Metric({ value, unit, prefix, label, chip, flagged = false, lead = false, visual }: {
 value: string;
 /** Trailing: BPM, %, kg. */
 unit?: string;
 /** Leading, for the one case where a unit is written first: R 598, never 598 R. */
 prefix?: string;
 label: string;
 /** "Normal", "Excellent", "3 waiting". Floats above the figure. */
 chip?: string;
 /** Fills the chip charcoal. For the one value on a screen that is out of range. */
 flagged?: boolean;
 /** The one figure in a strip that the screen is about, on a lime tile. At most one per strip: a
     second one is a strip with two leads, which is a strip with none. It carries no clinical
     meaning and must not be given one — a reading highlighted in colour reads as a verdict on that
     reading, and nothing in this product may issue one. Use it on the figure a person came to
     act on, not on the figure that happens to be interesting. */
 lead?: boolean;
 /** A drawing of the same arithmetic the figure states — a ring of the rows it counts, a gauge of
     the proportion, the shape of a day. It is presentation and never a second number: whatever is
     handed in here is built from the value beside it, so a reader who distrusts the picture can
     read the numeral, and a reader who distrusts the numeral can count the picture. It renders in
     the same box as the value, which is what lets a surface put the numeral inside a ring without
     every screen rearranging its own markup. */
 visual?: ReactNode;
}) {
 /* The chip sits on a line of its own whether or not this metric has one. A strip where some
    figures carry a chip and some do not was drawing them at two different heights — the back
    office's own overview had 12 and 3 side by side, twenty-nine pixels apart, which is the one
    thing a row of numerals must never do. The line only reserves height when a sibling in the same
    strip actually has a chip, so a strip with none pays nothing for the rule. */
 return (
  <div className={`s-metric${lead ? ' lead' : ''}`}>
   <span className="s-metric-chip-line">
    {chip && <span className={`s-metric-chip${flagged ? ' flagged' : ''}`}>{chip}</span>}
   </span>
   {visual
    ? <span className="s-metric-figure">{visual}<span className="s-metric-value">{prefix && <small>{prefix}</small>}{value}{unit && <small>{unit}</small>}</span></span>
    : <span className="s-metric-value">{prefix && <small>{prefix}</small>}{value}{unit && <small>{unit}</small>}</span>}
   <span className="s-metric-label">{label}</span>
  </div>
 );
}

export const Metrics = ({ children }: { children: ReactNode }) => <div className="s-metrics">{children}</div>;

/** A navigation row: icon, label, trailing circle. The circle inverts on the active row, which is
    what makes it read as where you are rather than as something else you could press. */
export function NavRow({ icon, label, current = false, onClick }: {
 icon: ReactNode; label: string; current?: boolean; onClick: () => void;
}) {
 return (
  <button className="s-nav-row" aria-current={current ? 'page' : undefined} onClick={onClick}>
   {icon}<span>{label}</span><i aria-hidden="true"><ArrowRight size={17}/></i>
  </button>
 );
}

/** A card. `lead` is the one thing a screen is about and takes the sage ground; `quiet` recedes. */
export function Panel({ tone = 'plain', children }: { tone?: 'plain' | 'quiet' | 'lead'; children: ReactNode }) {
 return <section className={`s-panel${tone === 'plain' ? '' : ` ${tone}`}`}>{children}</section>;
}

export function PanelHead({ title, note, onOpen, openLabel }: {
 title: string; note?: string; onOpen?: () => void; openLabel?: string;
}) {
 return (
  <div className="s-panel-head">
   <div><h3>{title}</h3>{note && <p>{note}</p>}</div>
   {onOpen && <button className="s-open" onClick={onOpen} aria-label={openLabel ?? `Open ${title}`}><ArrowUpRight size={18}/></button>}
  </div>
 );
}

/* Segments rather than one continuous bar. A bar invites a reader to measure a proportion; segments
   say "these many, of these many", which is what a count of visits or checks actually is. */
export function Segments({ total, done, now }: { total: number; done: number; now?: number }) {
 return (
  <div className="s-segments" role="img" aria-label={`${done} of ${total} complete`}>
   {Array.from({ length: total }, (_, i) =>
    <i key={i} className={i === now ? 'now' : i < done ? 'on' : ''}/>)}
  </div>
 );
}
