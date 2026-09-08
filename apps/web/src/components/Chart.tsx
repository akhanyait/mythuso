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
 const low = Math.min(...values, ...(normal ?? []));
 const high = Math.max(...values, ...(normal ?? []));
 const pad = (high - low || 1) * 0.25;
 const min = low - pad, max = high + pad;
 const W = 260, H = 78;
 const x = (i: number) => readings.length < 2 ? W / 2 : (i / (readings.length - 1)) * W;
 const y = (v: number) => H - ((v - min) / (max - min)) * H;
 const line = readings.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ');
 const area = `${line} L${W} ${H} L0 ${H} Z`;
 const latest = readings[readings.length - 1], first = readings[0];
 const delta = latest.value - first.value;
 const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
 const direction = delta > 0 ? 'higher than' : delta < 0 ? 'lower than' : 'unchanged from';
 const inRange = !normal || (latest.value >= normal[0] && latest.value <= normal[1]);
 const summary = `${title}. Latest reading ${format(latest.value)} ${unit} on ${latest.label}, ${direction} the first reading of ${format(first.value)} on ${first.label}. ${normal ? `Indicative reference range ${format(normal[0])} to ${format(normal[1])} ${unit}; the latest reading is ${inRange ? 'inside' : 'outside'} that range.` : ''}`;
 return <div className="panel chart-card">
  <div className="chart-head">
   <span className="chart-title">{icon}{title}</span>
   <span className={`chart-flag ${inRange ? '' : 'watch'}`}>{inRange ? 'Within range' : 'Outside range'}</span>
  </div>
  <div className="chart-value"><strong>{format(latest.value)}</strong><small>{unit}</small><span className="chart-trend"><Trend size={14} aria-hidden="true"/>{delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${format(delta)} since ${first.label}`}</span></div>
  <svg className="chart-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
   {normal && <rect x="0" y={y(normal[1])} width={W} height={Math.max(y(normal[0]) - y(normal[1]), 1)} className="chart-band"/>}
   <path d={area} className="chart-area"/>
   <path d={line} className="chart-line"/>
   {readings.map((r, i) => <circle key={r.label} cx={x(i)} cy={y(r.value)} r={i === readings.length - 1 ? 4 : 2.5} className={i === readings.length - 1 ? 'chart-dot latest' : 'chart-dot'}/>)}
  </svg>
  <div className="chart-axis"><span>{first.label}</span><span>{latest.label}</span></div>
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
