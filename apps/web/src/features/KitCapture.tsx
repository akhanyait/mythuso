import { useState } from 'react';
import { BluetoothSearching, Check, CircleAlert, Plug, Radio, ShieldX, Unplug, Wrench, X } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { Skeleton } from '../components/States';
import { CalibrationCaveat, ProvenanceTag } from '../components/Provenance';
import {
 calibrationOf, contextFor, deviceById, inventReading, kit, nextCaptureId,
 type Capture, type Instrument
} from '../lib/capture';
import { can, type VettingSubject } from '../lib/vetting';

/* Thuso Kit: the pairing surface and the capture flow, and an honest sentence about what they are.
   Nothing connects. There is no navigator.bluetooth call anywhere in this repository and no native
   bridge to one — a browser cannot talk to a BLE medical device without a native shell, and this is
   a browser. Six instruments are read out of packages/catalog/capture.json, a discovery is acted
   out with a timer, and a reading is invented. Every one of those is said on screen rather than
   left for a reviewer to discover by watching nothing arrive.

   What is real is the shape: what has to be true before a reading may be taken, what travels with
   it, and what refuses. Those are the parts that will still be here when the radio is. */

export type CaptureField = { id: string; label: string; unit: string };
const SCAN_MS = 900;

/* `notice` is off where a screen has already said it. The Thuso Kit surface carries the device
   capability's sentence at the top of the page and then embeds this component, which would have
   rendered the same sentence again a hundred pixels below it — one notice per screen means one,
   not one per component that happens to be on it. */
export function KitCapture({ fields, capturer, verb = 'Add to the assessment', notice = true, onCapture }:
 { fields: CaptureField[]; capturer: VettingSubject; verb?: string; notice?: boolean; onCapture: (capture: Capture) => void }) {
 const [scan, setScan] = useState<'idle' | 'scanning' | 'done'>('idle');
 const [paired, setPaired] = useState<string[]>([]);
 const [serial, setSerial] = useState('');
 const [measure, setMeasure] = useState('');
 const [context, setContext] = useState('');
 const [taken, setTaken] = useState<Capture | null>(null);
 const [added, setAdded] = useState('');
 /* Capturing is writing to a record. It is gated on the capability that writes one rather than on
    a kit-specific permission invented here, because an instrument does not confer authority — the
    person holding it does, and vetting is where that is decided. */
 const mayWrite = can(capturer, 'write-clinical-note');
 const instrument = kit.find(i => i.serial === serial);
 const device = instrument ? deviceById(instrument.deviceId)! : undefined;
 const calibration = instrument ? calibrationOf(instrument) : undefined;
 const prompt = instrument ? contextFor[instrument.deviceId] : undefined;
 /* Only what this surface is collecting. The scale and the single-lead ECG measure real things the
    seven-observation assessment does not hold, so inside a visit assessment their instruments pair
    and offer nothing — which is more honest than hiding them and implying the kit is smaller than
    it is. */
 const offers = (i: Instrument) => deviceById(i.deviceId)!.measures.filter(m => fields.some(f => f.id === m));
 const field = fields.find(f => f.id === measure);

 const choose = (next: string) => { setSerial(next); setMeasure(''); setContext(''); setTaken(null); };
 const take = () => {
  if (!instrument || !field || !calibration) return;
  setTaken({
   id: nextCaptureId(), observationId: field.id, label: field.label, unit: field.unit,
   value: inventReading(field.id), provenance: 'device', serial: instrument.serial, calibration, context,
   by: capturer.id, byName: capturer.name, deviceAt: new Date().toISOString(), state: 'captured'
  });
 };

 return <div className="form-stack kit">
  {notice && <NotConnected of="devices"/>}

  {!mayWrite.allowed ? <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayWrite.reason} An instrument does not carry authority — the person holding it does, so capture is refused here rather than at the moment of filing, when the patient has already been put through it.</div> : <>

   {scan === 'idle' ? <button className="secondary full" onClick={() => { setScan('scanning'); window.setTimeout(() => setScan('done'), SCAN_MS); }}><BluetoothSearching size={17}/>Look for instruments</button>
    : scan === 'scanning' ? <><Skeleton rows={3}/><p className="helper" role="status">Looking for instruments in range.</p></>
     : <div className="form-stack">
      <p className="helper"><Radio size={13}/><span>{kit.length} instruments in the kit, {paired.length} paired. Pairing is remembered until you close this dialog and nowhere else.</span></p>
      {kit.map(item => {
       const spec = deviceById(item.deviceId)!;
       const state = calibrationOf(item);
       const on = paired.includes(item.serial);
       const usable = offers(item);
       return <div className={`panel kit-device ${on ? 'paired' : ''}`} key={item.serial}>
        <div className="kit-device-head">
         <span className="service-icon"><Radio size={21}/></span>
         <div><strong>{spec.name}</strong><small>{item.serial} · {spec.transport}</small></div>
         <Pill tone={state.state === 'overdue' ? 'danger' : state.state === 'due' ? 'amber' : ''}>{state.state === 'overdue' ? 'Calibration overdue' : state.state === 'due' ? 'Calibration due' : 'Calibration in date'}</Pill>
        </div>
        <div className="review-line"><span>Measures</span><strong>{spec.measures.join(' · ')}</strong></div>
        <div className="review-line"><span>Calibrated every</span><strong>{spec.calibrateEveryMonths} months</strong></div>
        <p className={`helper calib-line ${state.state}`}><Wrench size={13}/><span>{state.text}</span></p>
        <p className="helper kit-note"><CircleAlert size={13}/><span>{spec.note}</span></p>
        {on && !usable.length && <p className="helper"><X size={13}/>Paired, and measuring nothing this screen collects. {spec.measures.join(' and ')} belongs in the record, not in these fields.</p>}
        <button className={on ? 'secondary full' : 'primary full'} onClick={() => { setPaired(on ? paired.filter(s => s !== item.serial) : [...paired, item.serial]); if (on && serial === item.serial) choose(''); }}>
         {on ? <><Unplug size={16}/>Unpair</> : <><Plug size={16}/>Pair</>}
        </button>
       </div>;
      })}
     </div>}

   {paired.length > 0 && <div className="panel form-stack">
    <h3>Take a reading</h3>
    <label>Instrument<select value={serial} onChange={e => choose(e.target.value)}>
     <option value="">Choose a paired instrument…</option>
     {kit.filter(i => paired.includes(i.serial)).map(i => <option key={i.serial} value={i.serial} disabled={!offers(i).length}>{deviceById(i.deviceId)!.name} · {i.serial}{offers(i).length ? '' : ' — measures nothing on this screen'}</option>)}
    </select></label>
    {instrument && device && calibration && <>
     {/* The instrument's own limitation, at the moment of use rather than in a manual. The person
         who can still act on it is the one holding the thing. */}
     <div className="privacy-note"><CircleAlert size={19}/><span><strong>{device.name}.</strong> {device.note}</span></div>
     <CalibrationCaveat source={{ provenance: 'device', serial: instrument.serial, calibration }}/>
     <label>What to measure<select value={measure} onChange={e => { setMeasure(e.target.value); setTaken(null); }}>
      <option value="">Choose…</option>
      {offers(instrument).map(m => <option key={m} value={m}>{fields.find(f => f.id === m)!.label}</option>)}
     </select></label>
     {prompt && <label>{prompt.question}<select value={context} onChange={e => { setContext(e.target.value); setTaken(null); }}>
      <option value="">Choose…</option>{prompt.options.map(o => <option key={o} value={o}>{o}</option>)}
     </select></label>}
     {/* Two refusals that look alike and are not. The calibration date never stops a reading — the
         nurse in a home with one instrument still needs the number. The cuff, the site, the strip
         lot and the position do, because they are answers she has in front of her and the reading
         is not interpretable without them. */}
     <p className="helper">{prompt && !context ? `${prompt.label} has to be recorded with the reading, so it is asked before the reading and not after it. An out-of-date calibration is the opposite case: it marks the reading and never blocks it.` : 'The calibration state, the instrument and its serial are attached to the reading as it is taken.'}</p>
     <button className="primary full" disabled={!measure || (!!prompt && !context)} onClick={take}><Radio size={17}/>Take a reading</button>
    </>}
    {taken && field && <div className="panel kit-reading">
     <Pill tone="plain">Invented reading · nothing was measured</Pill>
     <div className="kit-reading-value"><strong>{taken.value}</strong><small>{taken.unit}</small></div>
     <div className="review-line"><span>{taken.label}</span><ProvenanceTag source={{ provenance: 'device', serial: taken.serial }}/></div>
     {taken.context && <div className="review-line"><span>{prompt?.label}</span><strong>{taken.context}</strong></div>}
     <div className="review-line"><span>The instrument’s clock said</span><strong>{new Date(taken.deviceAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</strong></div>
     <p className="helper">That is what the instrument believed, and it is never shown as the time this happened. The time it happened is fixed when a server receives it.</p>
     <CalibrationCaveat source={{ provenance: 'device', serial: taken.serial, calibration: taken.calibration }}/>
     <div className="button-row">
      <button className="secondary" onClick={() => setTaken(null)}><X size={16}/>Discard</button>
      <button className="primary" onClick={() => { onCapture(taken); setAdded(`${taken.label} ${taken.value} ${taken.unit} added, measured by ${deviceById(instrument!.deviceId)!.name.toLowerCase()} ${taken.serial}.`); setTaken(null); setMeasure(''); setContext(''); }}><Check size={16}/>{verb}</button>
     </div>
    </div>}
    <p className="helper" role="status">{added}</p>
   </div>}
  </>}
 </div>;
}
