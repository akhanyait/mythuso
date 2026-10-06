import { useEffect, useLayoutEffect, useState } from 'react';
import {
 Activity, ChevronLeft, Droplets, Heart, Lock, Mic, MicOff, PhoneOff,
 Shield, ShieldCheck, UserRound, Users, Video, VideoOff,
} from 'lucide-react';
import { Checkbox } from '../ui';
import { PatientPortrait } from '../components/Portraits';
import { Wordmark } from '../components/Wordmark';
import { patientScreenRoutes } from '../lib/patient-screens-routes';
import './video-consult-demo.css';

/* A simulated video consult for the funder demo.
 *
 * Nothing on this screen is a call. The remote picture is a placeholder, the self-view is an
 * illustration, and the timer is a clock in memory. There is no camera, no microphone and no
 * network media, because a preview that asked for either would be a preview a patient could
 * mistake for care. Booklet 10 is a gate for this visit to the screen only: the tick is not
 * stored, so leaving and coming back asks again. Join stays disabled until it is ticked, and
 * the handler refuses as well, so a styling change cannot open the call on its own.
 *
 * Danger red is the Leave control and nothing else. The required asterisk is teal for the
 * same reason — red on a consent form would read as the control that ends the call. */

const CONSULTATION = patientScreenRoutes.consultation.opens;

const CHECKLIST = [
 { title: 'Who is on the call', detail: 'You, a healthcare provider, and possibly a nurse.', icon: 'people' },
 { title: 'No recording in this preview', detail: 'This call is not recorded or stored.', icon: 'off' },
 { title: 'Nurse may be present', detail: 'A nurse may join to support your care.', icon: 'nurse' },
] as const;

function clock(total: number) {
 const minutes = Math.floor(total / 60);
 const seconds = total % 60;
 return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/* While this is mounted the floating assistant stands down (AssistantLauncher reads the attribute).
   The gate and the call mount it; Call ended does not, so the orb is back once the call is over
   and once the screen itself is left. */
function useStandDownAssistant() {
 useLayoutEffect(() => {
  const root = document.documentElement;
  const mark = (live: boolean) => {
   if (live) root.setAttribute('data-consult-live', '');
   else root.removeAttribute('data-consult-live');
   /* Synchronous, so the launcher's listener runs inside this layout effect and React
      paints the call without the orb. A mutation observer would arrive a frame later. */
   root.dispatchEvent(new Event('mythuso:consult-live'));
  };
  mark(true);
  return () => mark(false);
 }, []);
}

function ChecklistIcon({ kind }: { kind: typeof CHECKLIST[number]['icon'] }) {
 if (kind === 'off') return <span className="vcd-icon-circle"><VideoOff size={16} strokeWidth={1.8} aria-hidden="true"/></span>;
 if (kind === 'nurse') return <UserRound size={22} strokeWidth={1.8} aria-hidden="true"/>;
 return <Users size={22} strokeWidth={1.8} aria-hidden="true"/>;
}

export function VideoConsultDemo({ navigate }: { navigate: (page: string) => void }) {
 const [phase, setPhase] = useState<'gate' | 'call' | 'ended'>('gate');
 const [understood, setUnderstood] = useState(false);
 const [muted, setMuted] = useState(false);
 const [cameraOn, setCameraOn] = useState(true);
 const [elapsed, setElapsed] = useState(0);
 const [endedAt, setEndedAt] = useState(0);
 const back = () => navigate(CONSULTATION);

 /* The clock is the time since Join, not a count of interval ticks, so a delayed timer still
    shows the second the call has actually reached. It stops when the call does. */
 useEffect(() => {
  if (phase !== 'call') return;
  const started = Date.now();
  const id = window.setInterval(() => {
   const whole = Math.floor((Date.now() - started) / 1000);
   setElapsed(current => current === whole ? current : whole);
  }, 250);
  return () => window.clearInterval(id);
 }, [phase]);

 if (phase === 'ended') return <Ended seconds={endedAt} onBack={back}/>;
 if (phase === 'call') return <Call
  muted={muted} cameraOn={cameraOn} elapsed={elapsed}
  onMute={() => setMuted(value => !value)}
  onCamera={() => setCameraOn(value => !value)}
  onLeave={() => { setEndedAt(elapsed); setPhase('ended'); }}
 />;
 return <Gate understood={understood} onUnderstood={setUnderstood} onBack={back} onJoin={() => { if (understood) setPhase('call'); }}/>;
}

function Gate({ understood, onUnderstood, onBack, onJoin }: {
 understood: boolean;
 onUnderstood: (value: boolean) => void;
 onBack: () => void;
 onJoin: () => void;
}) {
 useStandDownAssistant();
 return <section className="vcd vcd-gate">
  <header className="vcd-bar">
   <button type="button" className="vcd-back" onClick={onBack} aria-label="Back to Online consultation">
    <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true"/>
   </button>
   <h1>Video consult</h1>
   <span className="vcd-pill"><Shield size={14} strokeWidth={1.8} aria-hidden="true"/>Demo simulation</span>
  </header>

  <article className="vcd-card">
   <div className="vcd-card-head">
    <span className="vcd-shield" aria-hidden="true"><ShieldCheck size={26} strokeWidth={1.8}/></span>
    <div>
     <h2>Before you join</h2>
     <p className="vcd-kicker">Booklet 10 consent checklist</p>
     <p className="vcd-please">Please review before entering the video call.</p>
    </div>
    <Users className="vcd-card-people" size={22} strokeWidth={1.8} aria-hidden="true"/>
   </div>

   <ul className="vcd-list">
    {CHECKLIST.map(row => <li key={row.title}>
     <ChecklistIcon kind={row.icon}/>
     <div><strong>{row.title}</strong><p>{row.detail}</p></div>
    </li>)}
   </ul>

   <Checkbox
    checked={understood}
    required
    aria-required="true"
    onChange={event => onUnderstood(event.target.checked)}
    label={<span className="vcd-understand">
     <span className="vcd-understand-title">I understand<span className="vcd-asterisk" aria-hidden="true">*</span></span>
     <span className="vcd-understand-hint">Check this box to continue.</span>
    </span>}
   />

   {/* Disabled is what keeps Join off the keyboard. The class is only the paint: pale until
       the tick, then the padlock leaves and the fill becomes the teal that carries white text. */}
   <button type="button" className={understood ? 'vcd-join is-open' : 'vcd-join'} disabled={!understood} aria-disabled={!understood} onClick={onJoin}>
    <span>Join call</span>
    <Lock className="vcd-lock" size={18} strokeWidth={1.8} aria-hidden="true"/>
   </button>
  </article>

  <p className="vcd-comfort"><Shield size={14} strokeWidth={1.8} aria-hidden="true"/>Your privacy and comfort matter.</p>
 </section>;
}

function Call({ muted, cameraOn, elapsed, onMute, onCamera, onLeave }: {
 muted: boolean;
 cameraOn: boolean;
 elapsed: number;
 onMute: () => void;
 onCamera: () => void;
 onLeave: () => void;
}) {
 useStandDownAssistant();
 const shown = clock(elapsed);
 return <section className="vcd vcd-call">
  <header className="vcd-call-bar">
   <Wordmark/>
   <span className="vcd-pill vcd-pill-live"><Shield size={14} strokeWidth={1.8} aria-hidden="true"/>Demo simulation · not a live call</span>
  </header>

  <div className="vcd-stage">
   <div className="vcd-blobs" aria-hidden="true"><span/><span/></div>
   <div className="vcd-remote" aria-hidden="true"><UserRound size={84} strokeWidth={1.5} fill="currentColor"/></div>
   <h1>Dr. Naidoo · simulated</h1>
   <p className="vcd-sim"><span className="vcd-dot" aria-hidden="true"/>simulated</p>

   <div className="vcd-vitals" role="group" aria-label="Demo data. Sample readings, not from a device.">
    <span className="vcd-demo-data">Demo data</span>
    <span className="vcd-vital"><Heart size={18} strokeWidth={1.8} aria-hidden="true"/><span><strong>72</strong><small>bpm</small></span></span>
    <span className="vcd-vrule" aria-hidden="true"/>
    <span className="vcd-vital"><Activity size={18} strokeWidth={1.8} aria-hidden="true"/><span><strong>16</strong><small>rpm</small></span></span>
    <span className="vcd-vrule" aria-hidden="true"/>
    <span className="vcd-vital"><Droplets size={18} strokeWidth={1.8} aria-hidden="true"/><span><strong>118/76</strong><small>mmHg</small></span></span>
   </div>

   <div className={cameraOn ? 'vcd-pip' : 'vcd-pip is-off'} role={cameraOn ? 'img' : undefined} aria-label={cameraOn ? 'Your picture, illustrated. No camera.' : undefined}>
    {cameraOn
     ? <PatientPortrait/>
     : <><VideoOff size={22} strokeWidth={1.8} aria-hidden="true"/><span>Camera off</span></>}
   </div>
  </div>

  <p className="vcd-timer" role="timer" aria-label={`Call duration ${shown}`}>
   <span className="vcd-dot" aria-hidden="true"/>
   <span>{shown}</span>
  </p>

  <div className="vcd-controls" role="group" aria-label="Call controls">
   <button type="button" className="vcd-control" aria-pressed={muted} onClick={onMute}>
    <span className="vcd-control-face">{muted ? <MicOff size={26} strokeWidth={1.8} aria-hidden="true"/> : <Mic size={26} strokeWidth={1.8} aria-hidden="true"/>}</span>
    <span className="vcd-control-label">Mute</span>
   </button>
   <button type="button" className="vcd-control" aria-pressed={!cameraOn} onClick={onCamera}>
    <span className="vcd-control-face">{cameraOn ? <Video size={26} strokeWidth={1.8} aria-hidden="true"/> : <VideoOff size={26} strokeWidth={1.8} aria-hidden="true"/>}</span>
    <span className="vcd-control-label">Camera</span>
   </button>
   <button type="button" className="vcd-control vcd-control-leave" onClick={onLeave}>
    <span className="vcd-control-face"><PhoneOff size={26} strokeWidth={1.8} aria-hidden="true"/></span>
    <span className="vcd-control-label">Leave</span>
   </button>
  </div>
 </section>;
}

function Ended({ seconds, onBack }: { seconds: number; onBack: () => void }) {
 const shown = clock(seconds);
 return <section className="vcd vcd-ended">
  <h1>Call ended</h1>
  <p>This was a simulated call. Nothing was recorded or stored.</p>
  <p className="vcd-ended-time" role="timer" aria-label={`Call duration ${shown}`}>
   <span className="vcd-dot" aria-hidden="true"/>{shown}
  </p>
  <button type="button" className="vcd-return" onClick={onBack}>Back to MyThuso</button>
 </section>;
}
