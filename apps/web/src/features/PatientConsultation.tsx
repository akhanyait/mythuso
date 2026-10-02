import liveVitals from '../../../../packages/catalog/live-vitals.json';
import { lazy, Suspense } from 'react';
import { ArrowRight, CameraOff, Clock3, Video } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Button, Card } from '../ui';
import { maximumWaitMinutes, media, participants, recording, waitingRoom } from '../lib/teleconsult';
import { PatientHeader } from './PatientHeader';

const LiveVitalsPanel = lazy(() => import('./LiveVitals').then(m => ({ default: m.LiveVitalsPanel })));

/* The online consultation from the patient's side — the export's page (patient-space.tsx, OnlineConsultation)
 * as a waiting room, because a waiting room is the part of it this build can say truthfully.
 *
 * The export draws a live call: an "Encrypted connection" pill, a running timer, a doctor on video speaking in
 * captions, a self-view, seven controls, live vitals, notes and shared files. None of it exists. The
 * consultation capability is simulated, neither app declares a camera or a microphone, and packages/catalog/
 * teleconsult.json says so in a sentence written for exactly this place. So the stage keeps its place in the
 * arrangement as a still panel carrying that sentence, and nothing on it moves, counts or connects.
 *
 * Everything else is teleconsult.json's words for the patient, which it already held: who would be on the
 * call and the question each of them is asked about, what the wait says at each step and that the wait has
 * an end, and that there is no recording to switch on. A consultation is asked for by the nurse at a visit,
 * never booked from here, so the page's only actions are the Health Passport, where a finished consultation
 * would be read, and the visits it would happen during. */

/* A state's words for the patient carry the doctor's name as a token, filled from the vetting record on the
   day; with no doctor on the call there is no name to fill, so that state says why the name matters instead. */
const shown = (state: typeof waitingRoom[number]) =>
 /\{\w+\}/.test(state.patientWords) ? state.why ?? state.name : state.patientWords;

export function PatientConsultation({ navigate }: { navigate: (page: string) => void }) {
 const never = media.states.find(state => state.id === media.state) ?? media.states[0]!;
 return <div className="ps-screen">
  <PatientHeader icon={<Video size={22} strokeWidth={1.8}/>} eyebrow="Your care" title="Online consultation"
   lead="When your nurse asks a doctor to join a visit, this is where you would wait, and what you would be asked first. There is no call in this preview."
   back={{ label: 'Back to your visits', go: () => navigate('My visits') }}/>
  <NotConnected of="teleconsultation"/>

  <div className="ps-consult">
   <div className="ps-consult-main">
    {/* The stage, still. Where the export has a video, this has the sentence that says there is none. */}
    <div className="ps-stage" role="note">
     <CameraOff size={28} strokeWidth={1.6} aria-hidden="true"/>
     <p>{media.sentence}</p>
     <dl className="ps-stage-state">
      <dt>{never.name}</dt>
      <dd>{never.detail}</dd>
     </dl>
    </div>

    <Card padding="md" className="ps-panel">
     <div className="ps-panel-head"><div><h2>While you wait</h2><p>What the screen would say at each step, in the order they happen. The wait has an end: after {maximumWaitMinutes} minutes it becomes a different plan rather than a longer wait.</p></div></div>
     <ol className="ps-steps">
      {waitingRoom.map(state => <li key={state.id}>
       <Clock3 size={18} aria-hidden="true"/>
       <div><strong>{state.name}</strong><p>{shown(state)}</p></div>
      </li>)}
     </ol>
    </Card>
   </div>

   <div className="ps-consult-rail">
  <Card padding="md" className="ps-panel"><h2>{liveVitals.board.patientHeading}</h2><p>{liveVitals.board.patientIntro}</p><Suspense fallback={<p>Opening readings…</p>}><LiveVitalsPanel subject="patient-preview"/></Suspense></Card>
    <Card padding="md" className="ps-panel">
     <div className="ps-panel-head"><div><h2>Who would be on the call</h2><p>And the question you would be asked about each of them before the call opens.</p></div></div>
     <ul className="ps-people">
      {participants.map(person => <li key={person.id}>
       <strong>{person.name}</strong>
       <small>{person.where}</small>
       {'consentQuestion' in person && person.consentQuestion && <p className="ps-question">{person.consentQuestion}</p>}
      </li>)}
     </ul>
    </Card>
    <Card padding="md" className="ps-panel">
     <div className="ps-panel-head"><div><h2>Recording</h2><p>{recording.decision}</p></div></div>
    </Card>
   </div>
  </div>

  <div className="ps-banner">
   <span className="ps-tile" aria-hidden="true"><Video size={20} strokeWidth={1.8}/></span>
   <div><strong>After a consultation</strong><p>{recording.instead[2]}</p></div>
   <Button variant="primary" className="ps-wrap" onClick={() => navigate('Health Passport')} trailingIcon={<ArrowRight size={16}/>}>Open your Health Passport</Button>
  </div>
 </div>;
}
