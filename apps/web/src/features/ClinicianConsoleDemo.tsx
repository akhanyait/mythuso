import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
 Activity, BarChart3, Bell, FileCheck, FileText, Heart, Maximize2, Mic, MicOff, MoreHorizontal,
 PhoneOff, ShieldCheck, Thermometer, Video, VideoOff, Wind
} from 'lucide-react';
import { NursePortrait, PatientPortrait } from '../components/Portraits';
import { useReducedMotion } from '../lib/motion';
import './clinician-console-demo.css';

/* A funder demo of the clinician's side of a video consult (Wednesday demo, mock 03).
 *
 * The call is simulated. There is no camera, no microphone and no network media: the two tiles are
 * the illustrated portraits the rest of the product already uses, and a timer stands in for a call
 * clock. Leaving ends that timer. It does not hang up anything, because nothing was connected.
 *
 * Triage is the nurse's. The priority chips are a note she can set for herself. Nothing on this
 * screen produces a diagnosis, and the helper under the chips says so in the words the demo keeps.
 *
 * The vitals are a deterministic sample, drawn again from the epoch so a refresh is a replay. They
 * live in memory, reset on a one-minute timer, and are discarded when the screen unmounts. The axis
 * labels are the demo chart's scale, not a reference range — those live in records.json, and a
 * second copy here would be a number in two places. The status words ("Trending", "Stable") are the
 * sample's labels, not a calculation: a wiggle in a demo series is not a change in a patient.
 *
 * Notes stay in component state. Nothing is written to storage of any kind. */

const START_SECONDS = 8 * 60 + 20;
const POINTS = 13;
const RESET_MS = 60_000;
const COUNT_MS = 600;

type Priority = 'low' | 'medium' | 'high';

function formatClock(total: number) {
 const minutes = Math.floor(total / 60);
 const seconds = total % 60;
 return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/* A small seeded generator. The same epoch always draws the same line, which is what makes the
   sample a fixture rather than a patient. */
function mulberry(seed: number) {
 let s = seed >>> 0;
 return () => {
  s = (Math.imul(1664525, s) + 1013904223) >>> 0;
  return s / 4294967296;
 };
}

function clamp(n: number, lo: number, hi: number) {
 return Math.min(hi, Math.max(lo, Math.round(n)));
}

function endpoint(epoch: number, base: number, lo: number, hi: number, salt: number) {
 if (epoch === 0) return base;
 const rand = mulberry(epoch * 97 + salt);
 return clamp(base + (rand() - 0.5) * 6, lo, hi);
}

function wobble(seed: number, last: number, lo: number, hi: number) {
 const rand = mulberry(seed);
 const values: number[] = [];
 for (let i = 0; i < POINTS; i++) {
  const span = Math.max(2, hi - lo);
  values.push(clamp(last + (rand() - 0.5) * span, lo, hi));
 }
 values[POINTS - 1] = last;
 return values;
}

function sampleAt(epoch: number) {
 const systolic = endpoint(epoch, 128, 120, 130, 1);
 const diastolic = endpoint(epoch, 82, 76, 88, 2);
 const pulse = endpoint(epoch, 88, 85, 92, 3);
 const spo2 = endpoint(epoch, 97, 95, 98, 4);
 return {
  systolic, diastolic, pulse, spo2,
  bp: wobble(1000 + epoch, systolic, 120, 130),
  pulseLine: wobble(2000 + epoch, pulse, 85, 92),
  spo2Line: wobble(3000 + epoch, spo2, 95, 98)
 };
}

function chartPaths(values: number[], min: number, max: number) {
 const w = 100;
 const h = 64;
 const yOf = (v: number) => h - 2 - ((v - min) / (max - min)) * (h - 4);
 const line = values.map((v, i) => {
  const x = (i / (values.length - 1)) * w;
  return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${yOf(v).toFixed(2)}`;
 }).join(' ');
 const grids = [max, (max + min) / 2, min].map(yOf);
 return { line, area: `${line} L${w} ${h} L0 ${h} Z`, grids, w, h };
}

/* Count up once, when the consult opens. A later sample (the one-minute reset) replaces the
   figure directly: counting again would look like the patient had changed, which she has not. */
function useCountUpOnce(target: number, reduced: boolean) {
 const [shown, setShown] = useState(() => (reduced ? target : 0));
 const done = useRef(reduced);
 useEffect(() => {
  if (reduced || done.current) {
   setShown(target);
   done.current = true;
   return;
  }
  const started = performance.now();
  let frame = 0;
  const tick = (now: number) => {
   const p = Math.min(1, (now - started) / COUNT_MS);
   const eased = 1 - (1 - p) ** 3;
   setShown(Math.round(target * eased));
   if (p < 1) frame = requestAnimationFrame(tick);
   else done.current = true;
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
 }, [target, reduced]);
 return shown;
}

function Sparkline({ values, min, max, label, epoch }: { values: number[]; min: number; max: number; label: string; epoch: number }) {
 const reduced = useReducedMotion();
 const lineRef = useRef<SVGPathElement>(null);
 const geometry = useMemo(() => chartPaths(values, min, max), [values, min, max]);
 /* The resting path is the finished line, so a reader with no script, or one who asked for
    stillness, sees the chart rather than an empty box. The draw runs only when motion is allowed. */
 useLayoutEffect(() => {
  const el = lineRef.current;
  if (!el) return;
  if (reduced) {
   el.style.transition = 'none';
   el.style.strokeDasharray = 'none';
   el.style.strokeDashoffset = '0';
   return;
  }
  const len = el.getTotalLength();
  el.style.transition = 'none';
  el.style.strokeDasharray = `${len} ${len}`;
  el.style.strokeDashoffset = `${len}`;
  const frame = requestAnimationFrame(() => {
   el.style.transition = 'stroke-dashoffset 800ms var(--ease-soft)';
   el.style.strokeDashoffset = '0';
  });
  return () => cancelAnimationFrame(frame);
 }, [geometry.line, reduced, epoch]);
 return <svg key={epoch} className="ccd-svg" viewBox={`0 0 ${geometry.w} ${geometry.h}`} preserveAspectRatio="none" role="img" aria-label={label}>
  {geometry.grids.map(y => <line key={y} className="ccd-grid" x1="0" x2={geometry.w} y1={y} y2={y}/>)}
  <path className="ccd-area" d={geometry.area}/>
  <path ref={lineRef} className="ccd-line" d={geometry.line}/>
 </svg>;
}

function VitalCard({ label, value, status, yLabels, values, min, max, epoch }: {
 label: string; value: string; status: string; yLabels: readonly number[]; values: number[]; min: number; max: number; epoch: number;
}) {
 return <article className="ccd-vital">
  <h4>{label}</h4>
  <p className="ccd-value"><strong>{value}</strong> <span className="ccd-status"><i className="ccd-dot" aria-hidden="true"/>{status}</span></p>
  <div className="ccd-plot">
   <div className="ccd-yaxis" aria-hidden="true">{yLabels.map(n => <span key={n}>{n}</span>)}</div>
   <Sparkline values={values} min={min} max={max} epoch={epoch} label={`${label}, demo trend, ending at ${value}. Demo data.`}/>
  </div>
  <div className="ccd-xaxis" aria-hidden="true"><span>08:20</span><span>08:22</span><span>08:24</span></div>
 </article>;
}

function LiveConsult({ onEnd }: { onEnd: (duration: string) => void }) {
 const reduced = useReducedMotion();
 const [epoch, setEpoch] = useState(0);
 const [elapsed, setElapsed] = useState(START_SECONDS);
 const [priority, setPriority] = useState<Priority | null>(null);
 const [muted, setMuted] = useState(false);
 const [cameraOn, setCameraOn] = useState(true);
 const [notes, setNotes] = useState('');
 const [saving, setSaving] = useState(false);
 const [note, setNote] = useState<string | null>(null);
 const saveTimer = useRef<number | null>(null);
 const sample = useMemo(() => sampleAt(epoch), [epoch]);
 const systolic = useCountUpOnce(sample.systolic, reduced);
 const diastolic = useCountUpOnce(sample.diastolic, reduced);
 const pulse = useCountUpOnce(sample.pulse, reduced);
 const spo2 = useCountUpOnce(sample.spo2, reduced);

 useEffect(() => {
  const clock = window.setInterval(() => setElapsed(s => s + 1), 1000);
  const reset = window.setInterval(() => setEpoch(e => e + 1), RESET_MS);
  return () => {
   window.clearInterval(clock);
   window.clearInterval(reset);
   if (saveTimer.current) window.clearTimeout(saveTimer.current);
  };
 }, []);

 const onNotes = (value: string) => {
  setNotes(value);
  setSaving(true);
  if (saveTimer.current) window.clearTimeout(saveTimer.current);
  saveTimer.current = window.setTimeout(() => setSaving(false), 600);
 };
 const demoOnly = (text: string) => setNote(current => current === text ? null : text);
 const choose = (id: Priority) => setPriority(current => current === id ? null : id);

 return <section className="ccd" aria-labelledby="ccd-title">
  <header className="ccd-bar">
   <div className="ccd-title">
    <span className="ccd-mark" aria-hidden="true"><Video size={28}/></span>
    <div>
     <div className="ccd-title-row">
      <h1 id="ccd-title">Video consult</h1>
      <span className="ccd-live" title="Simulated. There is no live video."><i className="ccd-dot" aria-hidden="true"/>Live</span>
     </div>
     <p className="ccd-sub">Simulated consult · {formatClock(elapsed)} elapsed</p>
    </div>
   </div>
   <div className="ccd-bar-actions">
    <p className="ccd-secure" title="Simulated, no live connection">
     <ShieldCheck size={18} aria-hidden="true"/>
     <span>Secure connection (simulated)</span>
    </p>
    <button type="button" className="ccd-iconbtn ccd-bell" aria-label="Notifications" title="Demo only" onClick={() => demoOnly('Demo only. There are no notifications on this simulated consult.')}>
     <Bell size={18} aria-hidden="true"/><i className="ccd-bell-dot" aria-hidden="true"/>
    </button>
    <button type="button" className="ccd-iconbtn ccd-more" aria-label="More" title="Demo only" onClick={() => demoOnly('Demo only. Nothing else is connected on this consult.')}>
     <MoreHorizontal size={18} aria-hidden="true"/>
    </button>
   </div>
  </header>
  {note && <p className="ccd-toast" role="status">{note}</p>}

  <div className="ccd-columns">
   <section className="ccd-card" aria-labelledby="ccd-patient">
    <div className="ccd-card-head">
     <h2 id="ccd-patient">Patient</h2>
     <span className="ccd-demo">Demo data</span>
     <button type="button" className="ccd-iconbtn" aria-label="Expand the patient tile" title="Demo only" onClick={() => demoOnly('Demo only. The tile does not open a larger view.')}>
      <Maximize2 size={16} aria-hidden="true"/>
     </button>
    </div>
    <div className="ccd-tile ccd-tile--patient">
     <PatientPortrait/>
     <p className="ccd-tile-label"><strong>Ms. Dlamini · 54 yrs</strong><span><i className="ccd-dot" aria-hidden="true"/>Stable</span></p>
    </div>
    <div className="ccd-tile ccd-tile--nurse">
     <span className="ccd-nurse-tag">Nurse</span>
     {cameraOn ? <NursePortrait/> : <div className="ccd-cam-off"><VideoOff size={28} aria-hidden="true"/><span>Camera off</span></div>}
     <p className="ccd-tile-label"><strong>Nurse Zinhle</strong><span><i className="ccd-dot" aria-hidden="true"/>On call</span></p>
     <button type="button" className="ccd-tile-expand" aria-label="Expand the nurse tile" title="Demo only" onClick={() => demoOnly('Demo only. The tile does not open a larger view.')}>
      <Maximize2 size={14} aria-hidden="true"/>
     </button>
    </div>
    <div className="ccd-controls" role="group" aria-label="Call controls">
     <button type="button" className="ccd-ctrl ccd-ctrl--teal" aria-pressed={muted} onClick={() => setMuted(m => !m)}>
      {muted ? <MicOff size={18} aria-hidden="true"/> : <Mic size={18} aria-hidden="true"/>}Mute
     </button>
     <button type="button" className="ccd-ctrl ccd-ctrl--teal" aria-pressed={cameraOn} onClick={() => setCameraOn(c => !c)}>
      {cameraOn ? <Video size={18} aria-hidden="true"/> : <VideoOff size={18} aria-hidden="true"/>}Camera
     </button>
     <button type="button" className="ccd-ctrl ccd-ctrl--leave" onClick={() => onEnd(formatClock(elapsed))}>
      <PhoneOff size={18} aria-hidden="true"/>Leave
     </button>
    </div>
   </section>

   <section className="ccd-card ccd-kit" aria-labelledby="ccd-kit">
    <div className="ccd-card-head">
     <h2 id="ccd-kit">Consultation toolkit <span className="ccd-led">· nurse-led</span></h2>
     <span className="ccd-demo ccd-demo--outline"><BarChart3 size={14} aria-hidden="true"/>Demo data</span>
    </div>

    <section className="ccd-block" aria-labelledby="ccd-triage">
     <h3 id="ccd-triage"><Activity size={18} aria-hidden="true"/>Nurse-led triage board</h3>
     <div className="ccd-chips" role="group" aria-label="Nurse-led priority">
      <button type="button" className="ccd-chip ccd-chip--low" aria-pressed={priority === 'low'} onClick={() => choose('low')}>
       <Heart size={18} aria-hidden="true"/>Priority Low
      </button>
      <button type="button" className="ccd-chip ccd-chip--mid" aria-pressed={priority === 'medium'} onClick={() => choose('medium')}>
       <Thermometer size={18} aria-hidden="true"/>Priority Medium
      </button>
      <button type="button" className="ccd-chip ccd-chip--high" aria-pressed={priority === 'high'} onClick={() => choose('high')}>
       <Wind size={18} aria-hidden="true"/>Priority High
      </button>
     </div>
     <p className="ccd-help">Priority is set by the nurse. Suggestions here are notes, not a diagnosis.</p>
    </section>

    <section className="ccd-block" aria-labelledby="ccd-vitals">
     <h3 id="ccd-vitals"><Activity size={18} aria-hidden="true"/>Vitals (live) <span className="ccd-stream"><i className="ccd-dot" aria-hidden="true"/>Simulated stream</span></h3>
     <div className="ccd-vitals">
      <VitalCard label="Blood pressure (mmHg)" value={`${systolic} / ${diastolic}`} status="Trending" yLabels={[140, 120, 100]} values={sample.bp} min={100} max={140} epoch={epoch}/>
      <VitalCard label="Pulse (bpm)" value={String(pulse)} status="Stable" yLabels={[110, 90, 70]} values={sample.pulseLine} min={70} max={110} epoch={epoch}/>
      <VitalCard label="SpO₂ (%)" value={String(spo2)} status="Stable" yLabels={[100, 95, 90]} values={sample.spo2Line} min={90} max={100} epoch={epoch}/>
     </div>
     <p className="ccd-caption">Demo data is auto-generated for training · Resets every 60s.</p>
    </section>

    <section className="ccd-block" aria-labelledby="ccd-notes">
     <h3 id="ccd-notes"><FileText size={18} aria-hidden="true"/>Notes (nurse-led)</h3>
     <div className="ccd-notes">
      <textarea rows={3} aria-labelledby="ccd-notes" placeholder="Add observations, concerns or next steps here..." value={notes} autoComplete="off" onChange={e => onNotes(e.target.value)}/>
      <p className="ccd-save" role="status">{saving ? 'Saving…' : <><FileCheck size={15} aria-hidden="true"/>Saved</>}</p>
     </div>
    </section>
   </section>
  </div>
 </section>;
}

function Ended({ duration, onBack, onAgain }: { duration: string; onBack: () => void; onAgain: () => void }) {
 return <section className="ccd ccd-ended">
  <h1>Video consult</h1>
  <p className="ccd-ended-lead">Consult ended (simulated)</p>
  <p className="ccd-sub">Duration {duration}. No video was connected.</p>
  <div className="ccd-ended-actions">
   <button type="button" className="ccd-textbtn ccd-textbtn--primary" onClick={onBack}>Back to Teleconsultation</button>
   <button type="button" className="ccd-textbtn" onClick={onAgain}>Start again</button>
  </div>
 </section>;
}

export function ClinicianConsoleDemo({ onOpenTeleconsult }: { onOpenTeleconsult: () => void }) {
 const [round, setRound] = useState(0);
 const [ended, setEnded] = useState<string | null>(null);
 if (ended) return <Ended duration={ended} onBack={onOpenTeleconsult} onAgain={() => { setEnded(null); setRound(r => r + 1); }}/>;
 return <LiveConsult key={round} onEnd={setEnded}/>;
}
