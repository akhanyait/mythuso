/* Thuso Kit's command view, its figures and its stylesheets, as one module that is only ever loaded on demand.
 *
 * Thuso Kit is the one screen here a patient opens as well as a nurse, and App.tsx imports it
 * statically, so every module and every stylesheet Kit imports is in the patient's entry. Measured on
 * the wire against the committed tree, the kit redesign put 4.1 kB gzipped onto what a patient on a
 * metered phone downloads before she has opened anything at all — the deck, its sheet, the vetting
 * console's styles that rode in with nurse-tools.css, and the words on the deck itself. Everything
 * here is behind the one dynamic import Kit makes, so a patient who never opens the kit pays for none
 * of it, and a nurse finds all of it already in the workspace chunk. The shared components and their
 * sheet come in the same way, which is why this file may import them and Kit.tsx may not.
 *
 * Kit keeps what it hands over — the entries, the connection, when this device last wrote its copy of
 * the record and who is capturing — so the view counts the same rows the sheet below it draws and
 * cannot keep a second list of its own.
 *
 * THE HANDOFF'S COMMAND VIEW, WHERE THE BUILD HAS THE DATA FOR IT (wave 4b). Three instruments:
 *   Readiness — a ring, and it is two rings of segments rather than a percentage: one arc per check on
 *     the vetting register for the person capturing, lit while it passes, and one arc per instrument in
 *     the kit, lit while its calibration is in date. The words beside it are the counts and the capability
 *     decision itself. Nothing is averaged into a score, because "87% ready" is a number nobody measured.
 *   Workload — the readings still on this phone, one bar each, the longest wait longest, each bar carrying
 *     the reading it is.
 *   The queue's figures — how long the oldest has waited and how old this device's copy is — and what
 *     reached the record, drawn as the readiness ring is: one arc per reading on this device, lit once it
 *     is stored, and the two counts beside it in words. Never a share of anything, for the same reason.
 * An overdue calibration marks the readings and never refuses one (devices.json), so the ring never says
 * "not ready": it says which arc is dark and why, and the capability line is the only gate. */
import { useContext, type CSSProperties } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { calibrationOf, deviceById, kit, type Capture } from '../lib/capture';
import { can, passingStates, summarise } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';
import { Badge, Button, Card, MyThusoHealthIcon } from '../ui';
import { DeckTitleLevel } from './ClinicalDeck';
import './nurse-kit.css';
import '../surface/nurse-identity.css';

/* How long a reading has been sitting on this phone, short enough to set as a figure.
   `ageText` says the same thing in a sentence and is still what every row carries; a numeral needs
   the number and its unit apart, and inventing a second clock to get them would be a second place
   the age can be wrong. Both read the same timestamp and the same `Date.now()`. */
function heldFor(iso: string, now = Date.now()) {
 const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
 if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? 'min' : 'mins' };
 const hours = Math.round(minutes / 60);
 if (hours < 48) return { value: String(hours), unit: hours === 1 ? 'hour' : 'hours' };
 return { value: String(Math.round(hours / 24)), unit: 'days' };
}

/* A ring of equal arcs with a gap between each, drawn from the top clockwise. Each arc is its own path
   with pathLength 1, so it can draw itself once on arrival and rest drawn; `on` arcs are solid and the
   rest are the thin track, so lit and unlit differ by weight as well as by colour. */
function arcs(count: number, radius: number) {
 const gap = count > 1 ? 0.09 : 0;
 return Array.from({ length: count }, (_, i) => {
  const from = (i / count) * Math.PI * 2 + gap / 2 - Math.PI / 2;
  const to = ((i + 1) / count) * Math.PI * 2 - gap / 2 - Math.PI / 2;
  const [x1, y1, x2, y2] = [Math.cos(from), Math.sin(from), Math.cos(to), Math.sin(to)].map(v => 50 + v * radius);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
 });
}

export function Readiness({ capturerId }: { capturerId: string }) {
 const capturer = subjectById(capturerId)!;
 const register = summarise(capturer);
 const decision = can(capturer, 'write-clinical-note');
 const instruments = kit.map(instrument => ({ instrument, calibration: calibrationOf(instrument), name: deviceById(instrument.deviceId)!.name }));
 const inDate = instruments.filter(i => i.calibration.state !== 'overdue');
 const outOfDate = instruments.filter(i => i.calibration.state !== 'in-date');
 const outer = register.states.map(s => passingStates.includes(s.state));
 const inner = instruments.map(i => i.calibration.state !== 'overdue');
 const ring = (lit: boolean[], radius: number, ring: 'register' | 'kit') => arcs(lit.length, radius).map((d, i) =>
  <path key={`${ring}-${i}`} d={d} pathLength={1} className={`nurse-ring__arc is-${ring}${lit[i] ? ' on' : ''}`} style={{ '--i': i } as CSSProperties}/>);
 return <Card padding="md" className="nurse-command__card nurse-readiness">
  <p className="nurse-eyebrow">Readiness</p>
  <div className="nurse-readiness__body">
   <div className="nurse-ring">
    {/* The ring restates the key beside it and is hidden from assistive technology for that reason: the
        key's two lines are the words, and a label on the drawing would be the same sentence read twice. */}
    <svg viewBox="0 0 100 100" aria-hidden="true">
     {ring(outer, 44, 'register')}
     {ring(inner, 33, 'kit')}
    </svg>
    <span className="nurse-ring__figure" aria-hidden="true"><strong>{register.passed}</strong><small>of {register.total}</small></span>
   </div>
   <dl className="nurse-readiness__key">
    <div><dt><i className="is-register" aria-hidden="true"/>Register</dt><dd>{register.passed} of {register.total} checks passing</dd></div>
    <div><dt><i className="is-kit" aria-hidden="true"/>Instruments</dt><dd>{inDate.length} of {instruments.length} in calibration</dd></div>
    {outOfDate.map(i => <div key={i.instrument.serial} className="nurse-readiness__caveat">
     <dt>{i.name}</dt><dd><Badge size="sm" variant={i.calibration.state === 'overdue' ? 'danger' : 'warning'}>{i.calibration.state === 'overdue' ? 'Calibration overdue' : 'Calibration due'}</Badge></dd>
    </div>)}
   </dl>
  </div>
  {/* The only gate on this screen, in the decision's own words: a reading is a write to a record, so it
      asks what a clinical note asks. The ring beside it gates nothing. */}
  <p className={`nurse-readiness__gate${decision.allowed ? '' : ' is-refused'}`} role="status">
   {decision.allowed ? 'Cleared to write to a record today.' : decision.reason}
  </p>
 </Card>;
}

/* What reached the record, as the readiness ring beside it is drawn: one arc per reading this device holds, the
   stored ones lit and drawn first from the top, so the lit run is the count and the whole ring is the other count.
   The two numbers are in the key in words, and the ring is hidden from assistive technology for the reason the
   readiness ring is. A reading waiting on a decision is not lit — it has not reached the record — and the key
   says how many there are rather than a colour doing it. */
function Reached({ entries }: { entries: readonly Capture[] }) {
 const stored = entries.filter(e => e.state === 'stored');
 const needsDecision = entries.filter(e => e.state === 'conflicted');
 const lit = [...stored.map(() => true), ...entries.filter(e => e.state !== 'stored').map(() => false)];
 return <Card padding="md" className="nurse-command__card nurse-readiness nurse-reached">
  <p className="nurse-eyebrow">Readings that reached the record</p>
  {entries.length
   ? <div className="nurse-readiness__body">
     <div className="nurse-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
       {arcs(lit.length, 44).map((d, i) => <path key={i} d={d} pathLength={1} className={`nurse-ring__arc is-record${lit[i] ? ' on' : ''}`} style={{ '--i': i } as CSSProperties}/>)}
      </svg>
      <span className="nurse-ring__figure" aria-hidden="true"><strong>{stored.length}</strong><small>of {entries.length}</small></span>
     </div>
     <dl className="nurse-readiness__key">
      <div><dt><i className="is-record" aria-hidden="true"/>Reached the record</dt><dd>{stored.length} of {entries.length} on this device</dd></div>
      {needsDecision.length > 0 && <div className="nurse-readiness__caveat">
       <dt>Waiting on a decision</dt><dd><Badge size="sm" variant="warning">{needsDecision.length} {needsDecision.length === 1 ? 'needs' : 'need'} a decision</Badge></dd>
      </div>}
     </dl>
    </div>
   : <p className="nurse-command__empty"><MyThusoHealthIcon/>Nothing has been captured on this device.</p>}
 </Card>;
}

/* One of the queue's figures, on the metric card's own classes. Not MetricCard itself: its trend line is
   drawn in the success ink, and "1 needs a decision" is not good news. The note here is the quiet ink, and
   a flagged note is the warning ink with the words saying why. */
function Figure({ label, value, note, flagged = false }: { label: string; value: string; note: string; flagged?: boolean }) {
 return <Card padding="md" className="ui-metric nurse-command__metric">
  <div className="ui-metric__head"><span className="ui-metric__label">{label}</span></div>
  <p className="ui-metric__value">{value}</p>
  <p className={`nurse-command__metric-note${flagged ? ' is-flagged' : ''}`}>{note}</p>
 </Card>;
}

export default function KitDeck({ entries, online, onToggle, localCopyAt, capturerId }: {
 entries: readonly Capture[]; online: boolean; onToggle: () => void; localCopyAt: string; capturerId: string;
}) {
 const Title = useContext(DeckTitleLevel);
 const waiting = entries.filter(e => e.state === 'captured' || e.state === 'queued' || e.state === 'sending');
 /* Everything that has not reached the record, oldest first, measured in minutes. It is the queue
    on the sheet below, measured — nothing is added to it and nothing is left out of it — and each bar
    carries the reading it is, so "the oldest" names a reading rather than a length. */
 const now = Date.now();
 const waitingRows = waiting
  .map(e => ({ id: e.id, age: now - new Date(e.deviceAt).getTime(), label: `${e.value} ${e.unit}`, held: heldFor(e.deviceAt, now) }))
  .sort((a, b) => b.age - a.age);
 const longest = Math.max(1, ...waitingRows.map(row => row.age));
 const oldest = waitingRows[0]?.held;
 const copyAge = heldFor(localCopyAt, now);

 return <section className="nurse-command nurse-ui" aria-label="Thuso Kit — the shape of the work below">
  {/* The capability's own sentence is on the view rather than under it: a screen whose first claim is
      that nothing is paired should not make a reader scroll past an instrument to find that out. */}
  <Card padding="lg" className="nurse-command__hero">
   <Title className="nurse-eyebrow nurse-command__title">Thuso Kit</Title>
   <p className="nurse-command__headline">Connected capture, and what it owes a reading.</p>
   <p className="nurse-command__note">Where a reading came from, which instrument took it, whether that instrument is in calibration, and what becomes of work done in a house with no signal.</p>
   <NotConnected of="devices"/>
   {/* The connection's own sentence, beside the switch that changes it — a control and the thing it
       means are one statement or they are neither. */}
   <div className="nurse-command__switch">
    <Button variant="secondary" className={online ? '' : 'offline'} onClick={onToggle} aria-pressed={online}
     leadingIcon={online ? <Cloud aria-hidden="true"/> : <CloudOff aria-hidden="true"/>}>{online ? 'Connection: on' : 'Connection: off'}</Button>
    <p>{online
     ? 'A connection is available, so the queue can be sent.'
     : 'No connection. A sealed reading goes nowhere, and the nurse has done everything she can do.'}</p>
   </div>
  </Card>

  <div className="nurse-command__grid">
   <Card padding="md" className="nurse-command__card nurse-command__lead">
    <div className="nurse-command__lead-head">
     <p className="nurse-eyebrow">Waiting to leave this phone</p>
     <Badge size="sm" variant={online ? 'success' : 'warning'} dot>{online ? 'A connection is available' : 'No connection'}</Badge>
    </div>
    <p className="nurse-command__figure">{waiting.length}</p>
    {waitingRows.length
     ? <ol className="nurse-bars" aria-label={`${waiting.length} readings still on this device, the oldest of them ${oldest!.value} ${oldest!.unit} old`}>
       {waitingRows.map(row => <li key={row.id}>
        <span className="nurse-bars__label">{row.label}</span>
        <span className="nurse-bars__track" aria-hidden="true"><i style={{ '--share': row.age / longest } as CSSProperties}/></span>
        <span className="nurse-bars__age">{row.held.value} {row.held.unit}</span>
       </li>)}
      </ol>
     : <p className="nurse-command__empty"><MyThusoHealthIcon/>Nothing is waiting.</p>}
   </Card>
   <Readiness capturerId={capturerId}/>
   <div className="nurse-command__figures">
    <Figure label="The oldest of them has waited" value={oldest ? `${oldest.value} ${oldest.unit}` : '—'} note={oldest ? 'Nothing is retried behind your back' : 'Nothing is waiting'}/>
    <Figure label="Since this device wrote its copy of the record" value={`${copyAge.value} ${copyAge.unit}`} note="Served with its age, in words"/>
    <Reached entries={entries}/>
   </div>
  </div>
 </section>;
}
