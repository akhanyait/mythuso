import { useState } from 'react';
import { BatteryMedium, CircleAlert, Clock, Cpu, Radio, ShieldX, Watch, Wrench } from 'lucide-react';
import { EmptyNote, Pill } from '../components/UI';
import { Alert, Badge, Button, Card, Select, type BadgeVariant } from '../ui';
import '../surface/nurse-identity.css';
import { NotConnected } from '../components/NotConnected';
import {
 DAY, MINUTE, calibrationStates, healthStates, labelIn, markOf, measures, platforms, qualityOf, recallReasons, sourceOf,
 wearableConsentInForce, wearableConsentWithdrawal, wearableConsentWording, type Refusal
} from '../../../../packages/engines/src/devices/domain/contract.ts';
import type { Device } from '../../../../packages/engines/src/devices/domain/registry.ts';
import type { Reading } from '../../../../packages/engines/src/devices/domain/readings.ts';
import {
 KIT_HOLDER, clinicalUseOf, deviceBySerial, healthNow, lastLinkFor, readingsOf, recallDevice, requestWearableLink,
 staleIntervalText, useRegistry, withdrawWearableLink, words
} from '../lib/devices';
import './devices.css';

/* Thuso Kit's registry on three screens, and the one sentence none of them may soften.
 *
 * The nurse sees each instrument in her kit: whether it is reporting, stale or recalled, its calibration, its
 * battery and firmware, and the readings Devices was asked about with where each came from, how good the sample
 * was and whether it carries clinical weight. The Control Tower sees every registered device and records a
 * recall, which marks the readings taken since it took effect and deletes none. The patient asking to link
 * Apple Health or Health Connect records a request, and is told in the contract's words that nothing is
 * connected and why.
 *
 * Every sentence is packages/catalog/devices.json's or packages/catalog/apis/devices.json's, every number is
 * the settings in force or the registry's arithmetic, and no reading's value is on any of these screens,
 * because Devices never holds one. This module arrives on a dynamic import, so none of it is on a patient's
 * first load. */

const nurse = words.screens.nurse;
const ops = words.screens.ops;
const link = words.wearableLinks;
const fill = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));
const when = (at: number) => new Date(at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const measureLabel = (id: string) => measures.find(m => m.id === id)?.label ?? id;
const stateTone: Record<string, BadgeVariant> = { reporting: 'success', stale: 'warning', recalled: 'danger', 'never-synced': 'neutral' };
const calibrationTone: Record<string, BadgeVariant> = { 'in-date': 'success', due: 'warning', overdue: 'danger', 'not-tracked': 'neutral' };

/* ---- The nurse's kit ------------------------------------------------------------------------------ */

export function KitHealth() {
 const registry = useRegistry();
 const kit = registry.kits.find(k => k.holderRef === KIT_HOLDER && k.closed === null);
 const devices = (kit?.deviceRefs ?? []).map(ref => registry.devices.find(d => d.deviceRef === ref)).filter((d): d is Device => d !== undefined);
 return <section className="dv-health nurse-ui" aria-labelledby="dv-health-heading">
  <div className="dv-health-head">
   <h2 id="dv-health-heading">{nurse.heading}</h2>
   <p>{nurse.intro}</p>
  </div>
  {devices.length ? <ul className="dv-devices">{devices.map(device => <DeviceCard key={device.deviceRef} device={device}/>)}</ul>
   : <EmptyNote>{words.kits.depositRecorded}</EmptyNote>}
  <p className="helper"><CircleAlert size={13}/><span>{words.health.calibrationNeverRefuses}</span></p>
  <p className="helper"><Radio size={13}/><span>{words.screens.preview}</span></p>
 </section>;
}

/* An instrument in her kit, on the identity (wave 4b): a white Card, the device and its serial, its health in
   the contract's word on a Badge, and three facts as white tiles with an edge along the top — aqua where it
   is well, the warning ink where it needs her, the danger ink where it is overdue or recalled, the border
   where there is nothing to judge. The word at the head of each tile is always the state, so the edge is
   never the only thing that says it. A recalled instrument's alert is the Alert's danger shape, its words
   unchanged. The card is a list item named for the device, which is how a screen reader and the journeys
   find it. */
const edgeOf: Record<string, string> = { reporting: 'well', 'in-date': 'well', stale: 'needs', due: 'needs', overdue: 'refused', recalled: 'refused' };
function DeviceCard({ device }: { device: Device }) {
 const health = healthNow(device);
 const calibration = health.calibration;
 const readings = readingsOf(device.deviceRef);
 return <li className={`dv-device dv-${health.stateCode}`} aria-label={`${device.model} ${device.serial}`}>
  <Card padding="md" className="dv-card">
  <div className="dv-device-head">
   <span className="dv-icon" aria-hidden="true"><Cpu/></span>
   <div><strong>{device.model}</strong><small>{device.serial} · {labelIn(words.deviceClasses, device.deviceClass)}</small></div>
   <Badge variant={stateTone[health.stateCode]} dot>{labelIn(healthStates, health.stateCode)}</Badge>
  </div>
  {health.recalled && device.recall && <Alert variant="danger" icon={<ShieldX aria-hidden="true"/>}
   title={fill(nurse.recalledFrom, { when: when(device.recall.effectiveFrom), reason: labelIn(recallReasons, device.recall.reasonCode) })}>{nurse.doNotUse}</Alert>}
  <dl className="dv-facts">
   <div data-edge={edgeOf[health.stateCode] ?? 'none'}><dt><Clock aria-hidden="true"/>{labelIn(healthStates, health.stateCode)}</dt><dd>
    {health.lastSyncAt === null ? nurse.neverSynced : fill(nurse.lastSync, { when: when(health.lastSyncAt) })}
    {health.stale && <span className="dv-stale"> {fill(nurse.staleSince, { interval: staleIntervalText() })}</span>}
   </dd></div>
   <div data-edge={edgeOf[calibration.stateCode] ?? 'none'}><dt><Wrench aria-hidden="true"/>{labelIn(calibrationStates, calibration.stateCode)}</dt><dd>
    {calibration.stateCode === 'not-tracked' ? nurse.calibrationNotTracked
     : fill(calibration.stateCode === 'overdue' ? nurse.calibrationOverdue : calibration.stateCode === 'due' ? nurse.calibrationDue : nurse.calibrationInDate, { on: day(calibration.dueOn!) })}
   </dd></div>
   <div data-edge="none"><dt><BatteryMedium aria-hidden="true"/>{health.batteryPercent === null ? nurse.batteryUnknown : fill(nurse.battery, { percent: health.batteryPercent })}</dt>
    <dd>{fill(nurse.firmware, { version: health.firmware })}</dd></div>
  </dl>
  {readings.length > 0 && <ul className="dv-readings">{readings.map(reading => <li key={reading.readingRef}><ReadingFacts reading={reading}/></li>)}</ul>}
  </Card>
 </li>;
}

/* What Devices knows about one reading, which is everything but the number. */
export function ReadingFacts({ reading }: { reading: Reading }) {
 const carries = clinicalUseOf(reading) === 'clinical';
 return <div className="dv-reading">
  <div className="dv-reading-head"><strong>{measureLabel(reading.metric)}</strong><small>{when(reading.takenAt)}</small></div>
  <dl className="dv-tags">
   <div><dt>{nurse.readingSource}</dt><dd>{sourceOf(reading.source)?.label}</dd></div>
   <div><dt>{nurse.readingQuality}</dt><dd>{qualityOf(reading.quality)?.label}</dd></div>
   <div><dt>{nurse.readingWeight}</dt><dd><Badge size="sm" variant={carries ? 'success' : 'warning'} className={carries ? 'dv-weight' : 'dv-no-weight'}>{carries ? nurse.carries : nurse.carriesNot}</Badge></dd></div>
  </dl>
  {reading.marks.map(id => <p key={id} className="helper dv-mark"><CircleAlert size={13}/><span><strong>{markOf(id).label}.</strong> {markOf(id).sentence}</span></p>)}
 </div>;
}

/* The source, the sample and the clinical weight beside a reading on the kit's own queue and on the visit.
   A reading typed by a clinician, reported by the patient or calculated has no device source, so nothing is
   drawn for it rather than a guess. The weight is the contract's one answer (carriesWeight, through
   clinicalUseOf) asked of what the capture knows: the device's class, the source, the sample, whether the
   device's recall covers the moment it was taken, and the clinical record as its intended use — every
   capture here is taken for the record. It is words, never a tint: "Carries no clinical weight" is the
   whole of the message and it is on the tag. */
export function CaptureSource({ serial, quality, simulated, takenAt }: { serial?: string; quality?: string; simulated: boolean; takenAt?: string }) {
 const device = serial ? deviceBySerial(serial) : undefined;
 if (!device) return null;
 const sourceId = simulated ? 'simulator' : device.deviceClass === 'consumer' ? 'own-device' : 'kit-instrument';
 const source = sourceOf(sourceId);
 const at = takenAt ? Date.parse(takenAt) : Number.NaN;
 const carries = clinicalUseOf({
  deviceClass: device.deviceClass, source: sourceId, quality: quality ?? '', intendedUse: 'clinical',
  marks: device.recall && !Number.isNaN(at) && at >= device.recall.effectiveFrom ? ['recalled'] : []
 }) === 'clinical';
 return <span className="dv-capture-source">
  <Pill tone="plain">{nurse.readingSource}: {source?.label}</Pill>
  <Pill tone={quality === 'poor' ? 'amber' : 'plain'}>{nurse.readingQuality}: {qualityOf(quality)?.label ?? nurse.readingQuality}</Pill>
  <Pill tone={carries ? 'plain' : 'amber'}>{carries ? nurse.carries : nurse.carriesNot}</Pill>
 </span>;
}

/* ---- The Control Tower's registry ----------------------------------------------------------------- */

/* When a recall takes effect from, as choices a person at the desk picks rather than a time typed: a
   manufacturer's notice often reaches back to when a fault began. */
const EFFECTIVE = [
 { id: 'now', label: 'Now', ago: 0 },
 { id: 'hour', label: 'An hour ago', ago: 60 * MINUTE },
 { id: 'day', label: 'A day ago', ago: DAY },
 { id: 'three-days', label: 'Three days ago', ago: 3 * DAY }
];

export function DeviceRegistryDesk() {
 const registry = useRegistry();
 const [recalling, setRecalling] = useState<string | null>(null);
 const [reason, setReason] = useState('');
 const [from, setFrom] = useState('now');
 const [notice, setNotice] = useState('');
 const [refused, setRefused] = useState<Refusal | null>(null);
 const target = registry.devices.find(d => d.deviceRef === recalling);
 const confirm = () => {
  if (!target) return;
  const effective = Date.now() - (EFFECTIVE.find(e => e.id === from)?.ago ?? 0);
  const result = recallDevice(target.deviceRef, reason, effective);
  if (!result.ok) { setRefused(result.refusal); return; }
  setRefused(null);
  setNotice(fill(ops.recorded, { count: result.value.marked, when: when(result.value.effectiveFrom) }));
  setRecalling(null); setReason(''); setFrom('now');
 };
 return <section className="dv-registry form-stack" aria-labelledby="dv-registry-heading">
  <h2 id="dv-registry-heading" className="section-title">{ops.heading}</h2>
  <p className="helper">{ops.intro}</p>
  <div className="table-scroll">
   <table className="chart-table dv-table">
    <caption className="visually-hidden">{ops.heading}</caption>
    <thead><tr><th scope="col">Device</th><th scope="col">Class</th><th scope="col">Health</th><th scope="col">Calibration</th><th scope="col"><span className="visually-hidden">{ops.recall}</span></th></tr></thead>
    <tbody>{registry.devices.map(device => {
     const health = healthNow(device);
     return <tr key={device.deviceRef} aria-label={`${device.model} ${device.serial}`}>
      <th scope="row">{device.model}<small>{device.serial}</small></th>
      <td>{labelIn(words.deviceClasses, device.deviceClass)}</td>
      <td><Badge size="sm" variant={stateTone[health.stateCode]}>{labelIn(healthStates, health.stateCode)}</Badge></td>
      <td><Badge size="sm" variant={calibrationTone[health.calibration.stateCode]}>{labelIn(calibrationStates, health.calibration.stateCode)}</Badge></td>
      <td>{health.recalled ? <small>{fill(nurse.recalledFrom, { when: when(device.recall!.effectiveFrom), reason: labelIn(recallReasons, device.recall!.reasonCode) })}</small>
       : <Button variant="secondary" size="sm" onClick={() => { setRecalling(device.deviceRef); setNotice(''); setRefused(null); }}>{ops.recall}</Button>}</td>
     </tr>;
    })}</tbody>
   </table>
  </div>
  {target && <div className="panel form-stack dv-recall nurse-ui" role="group" aria-label={`${ops.recall}: ${target.model} ${target.serial}`}>
   <h3>{ops.recall}: {target.model} · {target.serial}</h3>
   <label className="dv-field">{ops.reason}<Select value={reason} onChange={e => setReason(e.target.value)}>
    <option value="">Choose…</option>{recallReasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
   </Select></label>
   <label className="dv-field">{ops.effectiveFrom}<Select value={from} onChange={e => setFrom(e.target.value)}>
    {EFFECTIVE.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
   </Select></label>
   <p className="helper">{words.recall.effectiveFrom}</p>
   <p className="helper">{words.recall.neverUndone}</p>
   {refused && <Alert variant="danger" icon={<ShieldX aria-hidden="true"/>} title={refused.statement}/>}
   <div className="nurse-actions">
    <Button variant="secondary" onClick={() => { setRecalling(null); setRefused(null); }}>{ops.cancel}</Button>
    <Button variant="destructive" onClick={confirm}>{ops.confirm}</Button>
   </div>
   {readingsOf(target.deviceRef).length > 0 && <>
    <h4>{ops.readingsHeading}</h4>
    <ul className="dv-readings">{readingsOf(target.deviceRef).map(r => <li key={r.readingRef}><ReadingFacts reading={r}/></li>)}</ul>
   </>}
  </div>}
  <p className="helper" role="status">{notice}</p>
  <details className="dv-marks-mean"><summary>{ops.marksMean}</summary><p>{words.marksMean}</p></details>
  <p className="helper"><Radio size={13}/><span>{words.screens.preview}</span></p>
 </section>;
}

/* ---- The patient's wearable link ------------------------------------------------------------------ */

/* notice is off where the screen around it already renders the wearables capability's sentence: one notice per screen. */
export function WearableLinkRequest({ integration, notice = true }: { integration: string; notice?: boolean }) {
 useRegistry();
 const platform = platforms.find(p => p.name === integration);
 const [chosen, setChosen] = useState<string[]>([]);
 const [agreed, setAgreed] = useState(false);
 const [refused, setRefused] = useState<Refusal | null>(null);
 if (!platform) return null;
 const last = lastLinkFor(platform.id);
 const open = last && last.withdrawnAt === null ? last : undefined;
 const heading = fill(link.heading, { platform: platform.name });
 const request = () => {
  const result = requestWearableLink(platform.id, chosen, wearableConsentInForce);
  setRefused(result.ok ? null : result.refusal);
 };
 return <section className="dv-link form-stack" aria-labelledby="dv-link-heading">
  <h2 id="dv-link-heading" className="section-title">{heading}</h2>
  {notice && <NotConnected of="wearables"/>}
  {open && <div className="booking-summary dv-link-state">
   <span className="service-icon"><Watch size={22}/></span>
   <div><h3>{platform.name}</h3><p>{platform.phone}</p></div>
   <Pill tone="amber">{link.state.label}</Pill>
  </div>}
  <p role="status" className="dv-not-connected"><strong>{link.notConnected}</strong></p>
  <p className="helper">{link.why}</p>
  <p className="helper">{link.notInThisBuild}</p>
  {open ? <div className="panel form-stack">
   <h3>{link.scopeHeading}</h3>
   <ul className="dv-scope">{open.metrics.map(m => <li key={m}>{measureLabel(m)}</li>)}</ul>
   <button className="secondary full" onClick={() => { const result = withdrawWearableLink(open.linkRef); setRefused(result.ok ? null : result.refusal); }}>{link.withdraw}</button>
  </div> : <form className="panel form-stack" onSubmit={e => { e.preventDefault(); request(); }}>
   <fieldset className="dv-scope-choice"><legend>{link.scopeHeading}</legend>
    {measures.map(m => <label key={m.id} className="checkbox"><input type="checkbox" checked={chosen.includes(m.id)}
     onChange={() => setChosen(chosen.includes(m.id) ? chosen.filter(x => x !== m.id) : [...chosen, m.id])}/><span>{m.label}</span></label>)}
   </fieldset>
   <fieldset><legend>{link.consentHeading}</legend>
    <label className="checkbox"><input type="checkbox" checked={agreed} onChange={() => setAgreed(!agreed)}/><span>{wearableConsentWording}</span></label>
    <p className="helper">{wearableConsentWithdrawal}</p>
   </fieldset>
   <button className="primary full" disabled={!agreed || !chosen.length}>{link.request}</button>
  </form>}
  {last?.withdrawnAt != null && <p className="helper" role="status">{link.withdrawn}</p>}
  {refused && <div className="privacy-note alert" role="alert"><ShieldX size={19}/>{refused.statement}</div>}
 </section>;
}
