import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Ban, Check, Pause, Play } from 'lucide-react';
import { Alert, Badge, Button, Select } from '../ui';
import { noticeFor } from '../lib/capabilities';
import { intervalText } from '../lib/devices';
import { devicesSettingsNow } from '../lib/settings';
import devicesContract from '../../../../packages/catalog/devices.json' with { type: 'json' };
import {
 agoWords, deviceProvenance, fill, formatValue, historyAt, notStreamed, pace, rangeNote, rangePlace, refusals, scenarios, seedOf,
 simulatedClass, simulatedMark, streams, streamsLive, words, type LiveReading, type LiveStream
} from '../../../../packages/engines/src/devices/live-vitals.ts';
import './live-vitals.css';

/* The patient's devices, live — the founder's ask of 1 October 2026: the Lovable export's live triage
 * page, every device streaming, on the doctor's Triage page and beside the doctor's consultation.
 *
 * WHAT IS TAKEN FROM THE EXPORT. Its arrangement: a strip saying which devices and how recently, a tile per
 * reading with its value, its unit and a trend line under it, and the panels below — a device triage, an
 * early-warning score, an interpretation, an alarm centre and a heatmap. What is not taken is any of those
 * panels' claims. Each stands where it stood, as packages/catalog/live-vitals.json's sentence saying what is
 * not drawn and why, because no triage protocol is ratified and a simulated reading carries no clinical
 * weight. A tile says where its value stands against the record's indicative range in words, from the
 * record's own numbers — never a red, an amber or a green, and never a ranking.
 *
 * WHAT IS LIVE. A reading every two seconds from packages/engines/src/devices/live-vitals.ts, a pure
 * function of the scenario, the patient and the reading's number; this screen holds that number, when the
 * last one arrived and whether it is paused, and nothing else. Nothing is stored anywhere — the readings
 * are worked out again from the number every time — and the one timer is cleared when the board goes.
 *
 * MOTION. None. The values change and nothing pulses, blinks or slides: a board a doctor reads during a
 * consultation does not move on its own beyond the numbers it exists to show. The status says in words
 * whether the simulation is running, and Pause stops it.
 *
 * Every component here arrives behind a dynamic import, from the doctor's pages, the call and the
 * consultation record, so none of it is on a patient's first view. */

type Level = 'h2' | 'h3' | 'h4';

function useLiveVitals() {
 const [presetId, setPresetId] = useState(pace.defaultPreset);
 const [tick, setTick] = useState(0);
 const [running, setRunning] = useState(true);
 const [startedAt, setStartedAt] = useState(() => Date.now());
 const [receivedAt, setReceivedAt] = useState(() => Date.now());
 const [now, setNow] = useState(() => Date.now());
 const live = streamsLive(presetId);
 /* One interval while the board is on screen. Paused, it still moves the clock, so "how long ago" keeps
    growing — a paused board that went on saying "just now" would be telling the doctor something false. */
 useEffect(() => {
  const timer = setInterval(() => {
   const at = Date.now();
   setNow(at);
   if (running && live) { setTick(t => t + 1); setReceivedAt(at); }
  }, pace.tickMs);
  return () => clearInterval(timer);
 }, [running, live]);
 const choose = (id: string) => { const at = Date.now(); setPresetId(id); setTick(0); setStartedAt(at); setReceivedAt(at); setNow(at); };
 return { presetId, choose, tick, running, toggle: () => setRunning(r => !r), live, startedAt, receivedAt, now };
}
type Live = ReturnType<typeof useLiveVitals>;

/* The trend line: the last readings, newest at the right edge, over the record's range as a band of the muted
   ground. Full width on the board, a fixed small size in the compact rows. The line is drawn with a stroke
   that does not stretch with the box, so it stays a hairline however wide the tile is. */
function Spark({ stream, history, compact }: { stream: LiveStream; history: readonly LiveReading[]; compact?: boolean }) {
 const w = compact ? 64 : 200, h = compact ? 20 : 32;
 if (history.length < 2) return <span className="lv-spark is-empty" aria-hidden="true"/>;
 const values = history.map(r => r.value);
 const lo = Math.min(...values), hi = Math.max(...values);
 const pad = Math.max(stream.step * 2, (hi - lo) * 0.2);
 const min = lo - pad, max = hi + pad;
 const span = (w - 4) / (pace.history - 1);
 const x = (i: number) => 2 + (i + pace.history - history.length) * span;
 const y = (v: number) => h - 2 - ((v - min) / (max - min)) * (h - 4);
 const bandTop = Math.max(0, Math.min(h, y(stream.high))), bandBottom = Math.max(0, Math.min(h, y(stream.low)));
 const points = history.map((r, i) => `${x(i).toFixed(1)},${y(r.value).toFixed(1)}`).join(' ');
 const last = history[history.length - 1];
 return <svg className="lv-spark" viewBox={`0 0 ${w} ${h}`} width={compact ? w : '100%'} height={h} preserveAspectRatio="none" role="img" focusable="false"
  aria-label={fill(words.trend, { n: String(history.length), first: formatValue(stream, history[0].value), last: formatValue(stream, last.value), unit: stream.unit })}>
  {bandBottom > bandTop && <rect className="lv-spark-band" x="0" y={bandTop} width={w} height={bandBottom - bandTop}/>}
  <polyline className="lv-spark-line" points={points} vectorEffect="non-scaling-stroke"/>
 </svg>;
}

const placeIcon = { inside: Check, below: ArrowDown, above: ArrowUp } as const;
function RangeWords({ stream, value }: { stream: LiveStream; value: number }) {
 const place = rangePlace(stream, value);
 const Icon = placeIcon[place];
 /* The range itself never breaks across lines: "90–" at the end of one line and "140 mmHg" on the next reads
    as two numbers. */
 const range = `${stream.low}–${stream.high} ${stream.unit}`;
 const [before, after = ''] = fill(words[place], { low: String(stream.low), high: String(stream.high), unit: stream.unit }).split(range);
 return <p className={`lv-range is-${place}`}><Icon size={14} aria-hidden="true"/>
  <span>{before}<span className="lv-nowrap">{range}</span>{after}</span></p>;
}

function Controls({ live, compact }: { live: Live; compact?: boolean }) {
 const stale = !live.live;
 return <div className="lv-controls">
  <label className="lv-scenario"><span>{words.scenario}</span>
   <Select value={live.presetId} onChange={e => live.choose(e.currentTarget.value)}>
    {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
   </Select></label>
  <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled={stale} aria-pressed={!live.running}
   leadingIcon={live.running ? <Pause aria-hidden="true"/> : <Play aria-hidden="true"/>} onClick={live.toggle}>
   {live.running ? words.pause : words.resume}</Button>
 </div>;
}

/* Only the running-or-paused sentence is a live region. The count and the tiles change every two seconds,
   and a screen reader made to announce them would be talking over the consultation they sit beside. */
function Status({ live }: { live: Live }) {
 const sending = streams.filter((_, i) => historyAt(live.presetId, 0, i, 0).length).length;
 const text = !live.live ? fill(devicesContract.screens.nurse.staleSince, { interval: intervalText(devicesSettingsNow().staleAfterMinutes) })
  : live.running ? fill(words.running, { seconds: String(pace.tickMs / 1000) }) : words.paused;
 return <div className="lv-status">
  <Badge size="sm" variant="neutral">{simulatedMark.label}</Badge>
  <span role="status">{text}</span>
  {live.live && <span className="lv-count">{fill(words.received, { count: String((live.tick + 1) * sending) })}</span>}
 </div>;
}

function Tile({ live, seed, index, compact }: { live: Live; seed: number; index: number; compact?: boolean }) {
 const stream = streams[index];
 const history = historyAt(live.presetId, seed, index, live.tick);
 const latest = history[history.length - 1];
 const at = latest ? (live.live ? live.receivedAt : live.startedAt + latest.atOffsetMs) : 0;
 return <li className={`lv-tile${latest ? '' : ' is-silent'}`} data-stream={stream.id}>
  <div className="lv-tile-head">
   <span className="lv-tile-label">{stream.label}</span>
   <span className="lv-tile-device">{simulatedClass.label} · {fill(words.standsFor, { instrument: stream.instrument })}</span>
  </div>
  {latest ? <>
   <p className="lv-value"><strong>{formatValue(stream, latest.value)}</strong><small>{stream.unit}</small></p>
   <Spark stream={stream} history={history} compact={compact}/>
   <RangeWords stream={stream} value={latest.value}/>
   <p className="lv-prov">{deviceProvenance.name} · {simulatedMark.label} · <span className="lv-ago">{agoWords(live.now - at)}</span></p>
  </> : <p className="lv-silent">{words.nothing}</p>}
 </li>;
}

function Refusals({ level, compact }: { level: Level; compact?: boolean }) {
 const Heading = level;
 return <section className={`lv-refusals${compact ? ' is-compact' : ''}`} aria-label={words.refusalsHeading}>
  <Heading className="lv-subhead">{words.refusalsHeading}</Heading>
  <ul>{refusals.map(r => <li key={r.id} className="lv-refusal" data-refusal={r.id}>
   <Ban size={16} aria-hidden="true"/>
   <p><strong>{r.heading}</strong> <span>{r.sentence}</span></p>
  </li>)}</ul>
 </section>;
}

/* What the kit holds that cannot stream, beneath the tiles rather than among them: a list of three sentences
   in the grid made every tile in its row as tall as the list. */
function NotStreamed({ level }: { level: Level }) {
 const Heading = level;
 return <section className="lv-notstreamed" aria-label={words.notStreamedHeading}>
  <Heading className="lv-subhead">{words.notStreamedHeading}</Heading>
  <ul className="lv-absent">{notStreamed.map(line => <li key={line}>{line}</li>)}</ul>
 </section>;
}

function Banner({ compact }: { compact?: boolean }) {
 return <Alert variant="warning" className={`lv-banner${compact ? ' is-compact' : ''}`} title={words.banner}>{noticeFor('devices')}</Alert>;
}

function Foot() {
 return <p className="lv-foot">{simulatedMark.sentence} {rangeNote}</p>;
}

/** The whole board, for the doctor's Triage page: the export's arrangement, honestly. */
export function LiveVitalsBoard({ subject, patient, level = 'h2' }: { subject: string; patient: string; level?: Level }) {
 const live = useLiveVitals();
 const seed = seedOf(subject);
 const Heading = level;
 const sub = (level === 'h2' ? 'h3' : 'h4') as Level;
 return <section className="lv-board" aria-label={fill(words.heading, { patient })}>
  <div className="lv-board-head">
   <div><Heading>{fill(words.heading, { patient })}</Heading><p>{words.intro}</p></div>
   <Controls live={live}/>
  </div>
  <Banner/>
  <Status live={live}/>
  <ul className="lv-tiles">
   {streams.map((s, i) => <Tile key={s.id} live={live} seed={seed} index={i}/>)}
  </ul>
  <NotStreamed level={sub}/>
  <Foot/>
  <Refusals level={sub}/>
 </section>;
}

/** The compact panel beside a consultation: the same streams, the same refusals, in a rail's width. */
export function LiveVitalsPanel({ subject, level = 'h3', children }: { subject: string; level?: Level; children?: ReactNode }) {
 const live = useLiveVitals();
 const seed = seedOf(subject);
 const Heading = level;
 const sub = (level === 'h2' ? 'h3' : 'h4') as Level;
 return <section className="lv-panel" aria-label={words.compactHeading}>
  <Heading className="lv-panel-title">{words.compactHeading}</Heading>
  {children}
  <Banner compact/>
  <Controls live={live} compact/>
  <Status live={live}/>
  <ul className="lv-tiles is-compact">{streams.map((s, i) => <Tile key={s.id} live={live} seed={seed} index={i} compact/>)}</ul>
  <NotStreamed level={sub}/>
  <Foot/>
  <Refusals level={sub} compact/>
 </section>;
}
