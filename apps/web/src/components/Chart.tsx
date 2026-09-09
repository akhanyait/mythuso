import { useId, useState, type ReactNode } from 'react';
import { Table2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
export type Reading = { label: string; value: number; note?: string };
type Props = { title: string; unit: string; readings: Reading[]; normal?: [number, number]; format?: (n: number) => string; icon?: ReactNode };
/* An accessible clinical chart. The drawing is decorative-with-a-summary: every value is also
   available as a real table, because a reading a patient cannot read is not a reading. */
export function ClinicalChart({ title, unit, readings, normal, format = n => String(n), icon }: Props) {
 const [showTable, setShowTable] = useState(false);
 const tableId = useId();
 const values = readings.map(r => r.value);
 /* THE Y-WINDOW, AND WHY IT IS NOT THE REFERENCE RANGE.
  *
  * This used to span every reading *and* both ends of the reference range and then pad a quarter
  * around the lot. On the systolic series a patient actually opens — 128, 134, 141, 136 against a
  * 90–140 range — that put the readings into the top sixth of the plot and the band across two
  * thirds of it. A month in which somebody's pressure climbed past the top of its range and came
  * back drew as a flat line inside a wash of sage: the band was legible and the trend was not,
  * which on a health product is exactly the wrong way round. The readings are the subject and the
  * range is the context.
  *
  * So the window is built from the readings, and the range is let in only where it earns the room:
  *
  *   1. Every reading is inside the window with headroom. A point is never pinned to an edge, so
  *      how far a reading sits outside its range is always drawn to scale — which is the whole of
  *      what a person is asking when they look at one.
  *   2. A range edge the readings cross is forced in. This is the line that must never be lost:
  *      141 against a ceiling of 140 has to draw above the band rather than inside it.
  *   3. A range edge the readings come nowhere near is left out and the band runs off the plot,
  *      clipped rather than squeezed. Chasing a floor of 90 for a series that never goes below 128
  *      is what flattened the chart in the first place.
  *
  * A band that runs off the plot still reads correctly — it fills to the edge, which is what "the
  * range carries on past what you can see" looks like — and where a reading is outside the range
  * the card prints the window's own numbers underneath, so the axis is never quietly rescaled. */
 const dataLow = Math.min(...values), dataHigh = Math.max(...values);
 /* A flat series has no spread of its own to scale by, so the window is sized from the magnitude of
    the reading instead. Four identical temperatures otherwise divide by zero. */
 const spread = dataHigh - dataLow || Math.max(Math.abs(dataHigh) * 0.02, 0.1);
 const headroom = spread * 0.35;
 let lowEdge = dataLow - headroom, highEdge = dataHigh + headroom;
 if (normal) {
  /* How far past the readings it is worth travelling to bring a range edge into view. Just under
     one spread: an edge somebody's readings are moving towards is context worth keeping, and one
     they are nowhere near is the thing that flattened this chart. */
  const reach = spread * 0.9;
  if (dataLow < normal[0] || normal[0] > lowEdge - reach) lowEdge = Math.min(lowEdge, normal[0] - headroom * 0.5);
  if (dataHigh > normal[1] || normal[1] < highEdge + reach) highEdge = Math.max(highEdge, normal[1] + headroom * 0.5);
 }
 /* Snapped outwards onto a round step, which only ever widens the window. It is what lets the card
    print "122 to 146 mmHg" rather than "123.45 to 145.55", and it keeps two charts of the same
    measure on the same axis instead of each inventing its own.
    Eight divisions rather than four, and never finer than the readings are written: a step coarser
    than the data undoes the tightening this whole block exists for, and one finer than `format`
    can render would print a bound that is not the bound being drawn. */
 const decimals = Math.max(...readings.map(r => (format(r.value).split('.')[1] ?? '').length));
 const rough = (highEdge - lowEdge) / 8;
 const magnitude = 10 ** Math.floor(Math.log10(rough));
 const step = Math.max((rough / magnitude >= 5 ? 5 : rough / magnitude >= 2 ? 2 : 1) * magnitude, 10 ** -decimals);
 const min = Math.floor(lowEdge / step) * step, max = Math.ceil(highEdge / step) * step;
 const W = 260, H = 78;
 const x = (i: number) => readings.length < 2 ? W / 2 : (i / (readings.length - 1)) * W;
 const y = (v: number) => H - ((v - min) / (max - min)) * H;
 const line = readings.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ');
 const area = `${line} L${W} ${H} L0 ${H} Z`;
 /* The band, clipped to the plot rather than drawn outside it. Clamping here rather than in the
    stylesheet keeps the two ends independent: one may be off the plot while the other is on it,
    and the sentence below has to know which. */
 const bandTop = normal ? Math.min(Math.max(y(normal[1]), 0), H) : 0;
 const bandFoot = normal ? Math.min(Math.max(y(normal[0]), 0), H) : 0;
 const bandHeight = bandFoot - bandTop;
 const runsBelow = !!normal && y(normal[0]) > H, runsAbove = !!normal && y(normal[1]) < 0;
 const latest = readings[readings.length - 1], first = readings[0];
 const delta = latest.value - first.value;
 const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
 const direction = delta > 0 ? 'higher than' : delta < 0 ? 'lower than' : 'unchanged from';
 const inRange = !normal || (latest.value >= normal[0] && latest.value <= normal[1]);
 /* Said in words only where it changes how the picture is read: a reading outside its range is the
    one case where somebody is measuring a distance off the plot, and they are owed the scale they
    are measuring against. A series sitting quietly inside its range has nothing to add — the band
    filling the plot already says the only thing there is to say, and repeating the axis under all
    seven cards on the passport turns a useful sentence into furniture. */
 const anyOutside = !!normal && values.some(v => v < normal[0] || v > normal[1]);
 const windowNote = anyOutside
  ? `Scaled to the readings, ${format(min)} to ${format(max)} ${unit}.${runsBelow && runsAbove ? ' The range runs past this view at both ends.' : runsBelow ? ' The range runs past the bottom of this view.' : runsAbove ? ' The range runs past the top of this view.' : ''}`
  : null;
 const summary = `${title}. Latest reading ${format(latest.value)} ${unit} on ${latest.label}, ${direction} the first reading of ${format(first.value)} on ${first.label}. ${normal ? `Indicative reference range ${format(normal[0])} to ${format(normal[1])} ${unit}; the latest reading is ${inRange ? 'inside' : 'outside'} that range. ` : ''}The plot is scaled to the readings, ${format(min)} to ${format(max)} ${unit}${runsBelow || runsAbove ? ', and the shaded range continues past it' : ''}.`;
 return <div className="panel chart-card">
  <div className="chart-head">
   <span className="chart-title">{icon}{title}</span>
   <span className={`chart-flag ${inRange ? '' : 'watch'}`}>{inRange ? 'Within range' : 'Outside range'}</span>
  </div>
  <div className="chart-value"><strong>{format(latest.value)}</strong><small>{unit}</small><span className="chart-trend"><Trend size={14} aria-hidden="true"/>{delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${format(delta)} since ${first.label}`}</span></div>
  <svg className="chart-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
   {normal && bandHeight > 0 && <rect x="0" y={bandTop} width={W} height={bandHeight} className="chart-band"/>}
   <path d={area} className="chart-area"/>
   <path d={line} className="chart-line"/>
   {/* A reading outside its range is marked on the point rather than left to the geometry. A
       systolic of 141 against a ceiling of 140 is one millimetre of mercury, and a plot that made
       one millimetre look dramatic would be the dishonest one — but a plot where the reader has to
       find it is no better. So the excursion stays drawn to scale and the point that made it is
       named: larger, hollow, and ringed in the same amber the "Outside range" chip already uses,
       so the chip and the dot are one statement rather than two. Not colour alone: it is also the
       largest point on the plot and the only hollow one, and the chip says the word.
       The two tokens are set inline rather than through a class because this mark has to hold the
       same meaning on the patient's surface, the clinical one and the shared app one, and each of
       those sheets re-paints .chart-dot for itself. It belongs in all three; until it is in all
       three, one declaration that none of them can quietly override is the safer place for it. */}
   {readings.map((r, i) => {
    const outsideRange = !!normal && (r.value < normal[0] || r.value > normal[1]);
    const isLatest = i === readings.length - 1;
    return outsideRange
     ? <circle key={r.label} cx={x(i)} cy={y(r.value)} r={4.5} strokeWidth={2.5} vectorEffect="non-scaling-stroke"
        style={{ fill: 'var(--surface)', stroke: 'var(--mango-ink)' }}/>
     : <circle key={r.label} cx={x(i)} cy={y(r.value)} r={isLatest ? 4 : 2.5} className={isLatest ? 'chart-dot latest' : 'chart-dot'}/>;
   })}
  </svg>
  <div className="chart-axis"><span>{first.label}</span><span>{latest.label}</span></div>
  {windowNote && <p className="helper">{windowNote}</p>}
  <button className="text-button" aria-expanded={showTable} aria-controls={tableId} onClick={() => setShowTable(!showTable)}><Table2 size={15}/>{showTable ? 'Hide readings' : 'Show readings as a table'}</button>
  <div id={tableId} hidden={!showTable}>
   <table className="chart-table">
    <caption>{title} readings, oldest first, with the reference range this reading is judged against.</caption>
    <thead><tr><th scope="col">Date</th><th scope="col">{title} ({unit})</th><th scope="col">Note</th></tr></thead>
    <tbody>{readings.map(r => <tr key={r.label}><th scope="row">{r.label}</th><td>{format(r.value)}</td><td>{r.note ?? '—'}</td></tr>)}</tbody>
   </table>
  </div>
 </div>;
}
