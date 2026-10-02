import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
 ArrowLeft, ArrowRight, BadgeCheck, Ban, Check, CircleAlert, CircleSlash, ClipboardList, DoorOpen,
 Hourglass, Info, KeyRound, Lock, MicOff, PhoneCall, PhoneOff, ShieldX, Signal, Users, VideoOff, WifiOff
} from 'lucide-react';
import './consult-file.css';
import { EmptyNote, SectionTitle } from '../components/UI';
import { Badge, Button, StatusIndicator } from '../ui';
import { NotConnected } from '../components/NotConnected';
import { CodeInput, StepHead } from '../components/Steps';
import { CallSummary } from './CallSummary';
import { demoVisitCode } from './Clinical';
import { initialsOf } from '../lib/names';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';
import { type VettingSubject } from '../lib/vetting';
import {
 clinicalLimits, connectionById, connectionStates, consentItems, identity, mayConclude, mayConsult,
 maximumWaitMinutes, media, nameOf, outcomeOf, participants, permitted, recording, reconnect,
 refusalById, refusals, ruleById, sectionsFor, sessionFor, withdrawn, type Attempt, type Participant
} from '../lib/teleconsult';
import { simulationOf } from '../lib/capabilities';
import {
 participantId as interpreterParticipant, refusalById as interpreterRefusal,
 useSaslRequirement, withdrawal as interpreterWithdrawal
} from '../lib/interpreting';
/* Every tool the doctor needs on the call, beside it (2 October 2026): fetched when the call room opens. */
const ConsultationToolkit = lazy(() => import('./ConsultationToolkit').then(m => ({ default: m.ConsultationToolkit })));

/* The teleconsultation call.
 *
 * The doctor's review queue and the consultation record already existed; the encounter between them
 * did not. What follows is the whole of it — before, during and after — and the parts that took the
 * design work are not the ones that look like a video call.
 *
 * Who is in the room. This is not a private doctor's appointment. A MyThuso consultation frequently
 * has a nurse standing in the patient's kitchen, and sometimes a guardian or an interpreter as well.
 * Every one of them is named on the screen before the call opens, with their role, where they are
 * standing and what they can hear, and every one of them is a separate question put to the patient.
 * The patient can ask any of them to leave in the middle of the call without giving a reason, and is
 * told beforehand what leaving costs — asking the nurse out means nothing gets examined, and that is
 * said before the question rather than discovered after it.
 *
 * Recording. This build does not offer it, and does not offer a switch for it either. The reason
 * is written into the contract and rendered on its own screen: this build has no microphone
 * permission, no camera permission and nowhere to put a recording, so a recording control here would
 * be a control that cannot do what it says — and a patient taught to tick it here has been
 * taught to tick it. What the screen does instead is state what a recording would be for, who could
 * open one, how long it would live and how it would be asked for, so the design can be argued with
 * while it is still only a design.
 *
 * A dropped line. The state this whole screen exists for. The encounter stays open, the doctor calls
 * back rather than the patient redialling, both ends count down the same ninety seconds, and a nurse
 * in the room does not leave the house on the assumption that it will come back. If it does not, the
 * encounter is closed as interrupted — and an interrupted encounter has no assessment field, no plan
 * field and no signature block, because a record that cannot tell a finished consultation from an
 * abandoned one is worse than no record.
 *
 * Bandwidth. Sound only is a designed path, not an error toast. What changes on a poor line is not
 * the patient's standing but what the doctor may conclude alone, and the screen says which — held as
 * a set intersection in lib/teleconsult.ts rather than as a judgement taken under pressure.
 *
 * The interpreter. Ordinarily one of the optional parties on the roster, asked about like the
 * others. When the account records the South African Sign Language requirement they stop being
 * optional: the call does not open without them, the checkbox that adds them cannot be unticked,
 * and asking them to step out during the call ends the consultation rather than continuing it. That
 * last one looks harsh written down and is the only honest answer — a consultation the patient
 * cannot follow is not one they can consent to, and consent to treatment is not a nod. It is not a
 * punishment either: nothing is charged, the encounter is written up as interrupted like any other,
 * and the rebooking is on the same screen. There is deliberately no second mechanism for adding an
 * interpreter; it is this participant or nobody.
 *
 * How it connects, now that it does. teleconsultation is simulated rather than absent: a session
 * broker in lib/teleconsult.ts answers with the waiting-room states the contract declares and the
 * rung of the ladder the line opens on, and the screen walks them. What it simulates is a session
 * object and never media — no WebRTC, no camera, no microphone, no permission requested and none
 * declared, on either platform, and the build refuses one. The wait plays out in seconds and the
 * screen says which wait it is standing in for, because a screen that made a person sit through
 * eleven minutes is one nobody could demonstrate and a screen that pretended a doctor answered in
 * four would be lying about the queue this feature exists to be honest about.
 *
 * WHAT THIS PASS CHANGED, AND WHAT IT COULD NOT. Every sentence above was already on the screen and
 * every one of them is still rendered word for word out of the contract. What was wrong was the
 * shape: five stages of a clinical encounter drawn as one long column of white boxes, in which the
 * ladder that decides what a doctor may conclude looked exactly like the paragraph next to it. The
 * ladder is an instrument now — six segments per rung, one per clinical limit, lit where that rung
 * permits it — so a reader sees the monotonicity rather than being told about it: six, four, three,
 * none. The instrument is drawn once per stage on the night ground the rest of this portal already
 * uses, and it draws nothing that a camera or a microphone would be needed for, because there is no
 * camera and no microphone anywhere behind this screen. */

const doctors = subjectsByRole('doctor').filter(d => ['D-401', 'D-402'].includes(d.id));
const stages = ['Who is in the room', 'Identity', 'Recording', 'The call', 'Afterwards'] as const;
/* The parties who might be in the room besides the two ends of the call. Which of them actually are
   is a fact about this appointment, so it is set up before the roster rather than assumed. */
const optional = participants.filter(p => !p.essential);
const subjectFor = (participant: Participant): VettingSubject | undefined =>
 participant.id === 'nurse' ? subjectById('N-205') : participant.id === 'guardian' ? subjectById('G-032') : undefined;

/* ---- The marks ----------------------------------------------------------------------------------
 *
 * One geometry helper, shared by everything on this screen that draws rather than writes. The class
 * names are components/ChartMotion.tsx's — `.c-plot` around `.c-mark` paths — so an arc here arrives
 * by drawing itself along its own path and settles to the finished picture the instant a reader asks
 * for less motion. Nothing here moves a value: an arc is as long as the count it stands for before,
 * during and after the drawing. */
const RING = 128;
function arcPath(fromDegrees: number, toDegrees: number, radius = 52) {
 const point = (degrees: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${(RING / 2 + radius * Math.cos(radians)).toFixed(2)} ${(RING / 2 + radius * Math.sin(radians)).toFixed(2)}`;
 };
 return `M${point(fromDegrees)} A${radius} ${radius} 0 ${toDegrees - fromDegrees > 180 ? 1 : 0} 1 ${point(toDegrees)}`;
}
/* A ring of segments, one per thing counted, lit where that thing is available. A count you can
   count: the gap between segments is wider than the stroke, and the cap is butt rather than round
   for the reason clinical-deck.css found out the hard way — a round cap grows half a stroke into
   the gap either side of it and welds a ring of six into one unbroken circle. */
function SegmentRing({ lit }: { lit: boolean[] }) {
 const gap = lit.length > 1 ? 8 : 0;
 const span = 360 / lit.length;
 return <svg className="c-plot c-ring cf-ring" viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true" focusable="false">
  {lit.map((on, i) => <path key={i} className={`c-mark${on ? ' on' : ''}`} d={arcPath(i * span + gap / 2, (i + 1) * span - gap / 2)}/>)}
 </svg>;
}

/* Everyone who can hear the patient, with the vetting register's name against the contract's role.
   A guardian's authority and a nurse's clearance are the register's business; whether they may be in
   this room is the patient's. */
function Roster({ present, consented, patient, doctor, onAsk }:
 { present: Record<string, boolean>; consented: Record<string, boolean>; patient: string; doctor: VettingSubject; onAsk?: (id: string) => void }) {
 return <div className="tc-roster">
  {participants.filter(p => p.essential || present[p.id]).map(p => {
   const subject = p.id === 'doctor' ? doctor : subjectFor(p);
   const out = !p.essential && !consented[p.id];
   const who = nameOf(p, subject, patient);
   return <div className={`tc-person${out ? ' is-out' : ''}`} key={p.id}>
    {/* Initials rather than a repeated glyph. Three identical person icons in a column is a list of
        roles; three sets of initials is a list of people, which is what the contract says this
        roster is. A party who has stepped out keeps their place and loses their disc, because a
        name that vanishes is a person nobody can be asked about afterwards. */}
    <span className="tc-avatar" aria-hidden="true">{out ? <DoorOpen size={18}/> : initialsOf(who)}</span>
    <div className="tc-person-say">
     <strong>{who}<em>{p.name}</em></strong>
     <dl className="tc-person-facts">
      <div><dt>Where</dt><dd>{p.where}</dd></div>
      <div><dt>Can see</dt><dd>{p.sees}</dd></div>
      <div><dt>Can hear</dt><dd>{p.hears}</dd></div>
     </dl>
     {out && <p className="tc-out-note">Not in the room. {p.ifDeclined}</p>}
    </div>
    {onAsk && p.mayBeAskedToLeave && !out
     ? <Button variant="secondary" size="sm" className="tc-person-act" onClick={() => onAsk(p.id)}><DoorOpen size={15}/>Ask to step out</Button>
     : p.essential && p.id !== 'patient' ? <span className="tc-fixed"><Lock size={13}/>Cannot be asked to leave</span> : null}
   </div>;
  })}
 </div>;
}

/* One connection state, both ends at once. Two columns rather than one, because the failure this
   design is written against is a patient staring at a frozen picture while the doctor's screen says
   something else entirely. */
function BothEnds({ connectionId }: { connectionId: string }) {
 const state = connectionById(connectionId);
 return <div className="tc-ends">
  <div className="tc-end"><span className="cf-eyebrow">The patient sees</span><p>{state.patientSees}</p></div>
  <div className="tc-end"><span className="cf-eyebrow">The doctor sees</span><p>{state.doctorSees}</p></div>
 </div>;
}

/* ---- The line, as an instrument ------------------------------------------------------------------
 *
 * The rung the call is on, what that rung allows, and — the part that was a paragraph — the whole
 * ladder underneath it with every rung's allowance drawn to the same scale. The order is the
 * contract's fidelity, highest first, and the segment counts are read from each rung's own permits
 * list, so the one invariant this feature is checked on is the thing a reader sees first: no rung
 * lower down is ever lit wider than the one above it.
 *
 * The nurse is in the arithmetic and not only in the picture. `permitted` intersects the rung with
 * the room, so asking the nurse out puts out a segment on the current rung while the ladder beneath
 * keeps saying what the network alone would allow — which is the difference between "this line
 * cannot" and "nobody here can". */
function LineInstrument({ connectionId, allowed }: { connectionId: string; allowed: { id: string }[] }) {
 const state = connectionById(connectionId);
 const rungs = [...connectionStates].sort((a, b) => b.fidelity - a.fidelity);
 const lit = clinicalLimits.map(limit => allowed.some(a => a.id === limit.id));
 return <section className="cf-night tcx-line" aria-label="The line and what it allows">
  <div className="cf-night-head">
   <span className="cf-eyebrow"><Signal size={15} aria-hidden="true"/>The line</span>
   <span className="cf-standing">{state.name}</span>
  </div>
  <div className="tcx-line-body">
   <div className="cf-figure">
    <div className="cf-dial">
     <SegmentRing lit={lit}/>
     <span className="cf-dial-value">{allowed.length}<small>of {clinicalLimits.length}</small></span>
    </div>
    <p className="cf-figure-label">clinical conclusions this line and this room allow</p>
   </div>
   <ol className="tcx-ladder">
    {rungs.map(rung => {
     const now = rung.id === connectionId;
     return <li key={rung.id} className={`tcx-rung${now ? ' is-now' : ''}`} aria-current={now ? 'true' : undefined}>
      <span className="tcx-rung-name">{rung.name}{now && <em>Now</em>}</span>
      <span className="c-bars tcx-rung-bar" aria-hidden="true">
       {clinicalLimits.map(limit => <i key={limit.id} className={rung.permits.includes(limit.id) ? 'on' : ''}/>)}
      </span>
      <span className="tcx-rung-count">{rung.permits.length}<small>/{clinicalLimits.length}</small></span>
     </li>;
    })}
   </ol>
  </div>
  <BothEnds connectionId={connectionId}/>
  <p className="tcx-line-note">{state.note}</p>
 </section>;
}

/* The ladder alone, for the consultation record's rail: the rung the call ended on and every rung's
   allowance to the same scale, so the record being written says what the line allowed while it is
   written. The same arithmetic as the instrument above, drawn smaller and without the dial. */
export function LineLadder({ connectionId, allowed }: { connectionId: string; allowed: { id: string }[] }) {
 const state = connectionById(connectionId);
 const rungs = [...connectionStates].sort((a, b) => b.fidelity - a.fidelity);
 return <section className="tcx-ladder-card" aria-label="The line this consultation was held on">
  <div className="tcx-ladder-head"><span className="cf-eyebrow"><Signal size={15} aria-hidden="true"/>The line</span>
   <span className="tcx-ladder-now">{state.name} · {allowed.length} of {clinicalLimits.length}</span></div>
  <ol className="tcx-ladder">
   {rungs.map(rung => {
    const now = rung.id === connectionId;
    return <li key={rung.id} className={`tcx-rung${now ? ' is-now' : ''}`} aria-current={now ? 'true' : undefined}>
     <span className="tcx-rung-name">{rung.name}{now && <em>Now</em>}</span>
     <span className="c-bars tcx-rung-bar" aria-hidden="true">
      {clinicalLimits.map(limit => <i key={limit.id} className={rung.permits.includes(limit.id) ? 'on' : ''}/>)}
     </span>
     <span className="tcx-rung-count">{rung.permits.length}<small>/{clinicalLimits.length}</small></span>
    </li>;
   })}
  </ol>
 </section>;
}

export function Teleconsult({ reference = 'TH-2048', patient = 'Lerato Molefe', onClose }:
 { reference?: string; patient?: string; onClose?: () => void }) {
 const [stage, setStage] = useState(0);
 const [doctorId, setDoctorId] = useState(doctors[0].id);
 /* The requirement is not asked about here. It is on the account, and this screen reads it. */
 const [saslRequired] = useSaslRequirement();
 const [chosen, setChosen] = useState<Record<string, boolean>>({ nurse: true, guardian: false, interpreter: false });
 const [consented, setConsented] = useState<Record<string, boolean>>({ doctor: false, nurse: false, guardian: false, interpreter: false });
 const [withdrawnNote, setWithdrawnNote] = useState<string | null>(null);
 const [code, setCode] = useState('');
 const [codeError, setCodeError] = useState('');
 const [identityConfirmed, setIdentityConfirmed] = useState(false);
 const [mediaState, setMediaState] = useState(media.state);
 /* What the broker would have sent for this consultation. Deterministic off the reference, so the
    same call opens on the same rung after the same wait every time it is walked. */
 const session = useMemo(() => sessionFor(reference), [reference]);
 const [connectionId, setConnectionId] = useState(session.connection.id);
 /* Which waiting-room state the call is in on its way to being connected. -1 is connected. */
 const [waitingAt, setWaitingAt] = useState(0);
 const [everDropped, setEverDropped] = useState(false);
 const [resumed, setResumed] = useState(false);
 const [holdLeft, setHoldLeft] = useState(reconnect.holdSeconds);
 const [decisionReached, setDecisionReached] = useState(false);
 const [closed, setClosed] = useState<string | null>(null);
 /* The tool open beside the call. "Write it up" after the call opens the notes rather than a second record, so a
    note begun during the call is the note that is signed. */
 const [tool, setTool] = useState('call');

 /* An interpreter the account requires is present whatever the roster control says. The control is
    disabled rather than hidden, because a control that vanishes teaches nobody why. */
 const present = saslRequired ? { ...chosen, [interpreterParticipant]: true } : chosen;
 const doctor = doctors.find(d => d.id === doctorId)!;
 const consult = mayConsult(doctor);
 /* Essential when required: the call does not open until the interpreter has been agreed to, the
    same gate the doctor's own consent is behind. */
 const interpreterAgreed = !saslRequired || consented[interpreterParticipant];
 const nursePresent = present.nurse && consented.nurse;
 const allowedNow = permitted(connectionId, nursePresent);
 const withheldNow = withdrawn(connectionId, nursePresent);
 const dropped = connectionId === 'dropped';

 /* The waiting room, walked. Each state is the contract's own and the words under it are the
    contract's own; what the screen compresses is only how long each one lasts. */
 useEffect(() => {
  if (stage !== 3 || waitingAt < 0 || waitingAt >= session.steps.length) return;
  const step = setTimeout(() => setWaitingAt(at => (at + 1 >= session.steps.length ? -1 : at + 1)), 1400);
  return () => clearTimeout(step);
 }, [stage, waitingAt, session.steps.length]);

 /* The hold is real seconds, counted on this screen, because a countdown that is a label rather than
    a clock is exactly the reassurance this state must not give. */
 useEffect(() => {
  if (!dropped || holdLeft <= 0) return;
  const tick = setInterval(() => setHoldLeft(left => Math.max(0, left - 1)), 1000);
  return () => clearInterval(tick);
 }, [dropped, holdLeft]);

 const attempt: Attempt = {
  clinicianAllowed: consult.allowed, identityConfirmed, consented: consented.doctor,
  everConnected: identityConfirmed && consented.doctor, lineDropped: everDropped, resumed, decisionReached
 };
 const outcome = outcomeOf({ ...attempt, ...(closed === 'clinician-refused' ? { clinicianAllowed: false } : {}) });
 const finish = (why?: string) => { setClosed(why ?? 'ended'); setStage(4); };

 /* The call room, and what comes after it, carry the toolkit: the call is its first entry and every tool the
    doctor needs is beside it. An encounter that never reached the room — a refused clinician, a failed code —
    has nothing to write up and no tools. The record the notes open is the same twelve sections a nurse's visit
    and a doctor's review write into, seeded with what the call actually established. */
 const roomReached = stage === 3 || closed === 'ended' || closed === 'interpreter-withdrawn';
 const line = connectionById(connectionId);
 const inTheRoom = participants.filter(p => p.essential || (present[p.id] && consented[p.id])).map(p => nameOf(p, p.id === 'doctor' ? doctor : subjectFor(p), patient));
 const withTools = (home: ReactNode) => !roomReached ? home : <Suspense fallback={home}>
  <ConsultationToolkit surface="teleconsult" subjectId={doctorId} reference={reference} patient={patient} home={home} tool={tool} onTool={setTool}
   call={{ connectionId, nursePresent, ended: stage === 4, countsAsConsultation: outcome.countsAsConsultation }}
   homeStatus={{ text: `${line.name} · ${inTheRoom.length} in the room`, urgent: stage === 3 && dropped ? line.doctorSees : undefined }}
   line={<LineLadder connectionId={connectionId} allowed={allowedNow}/>}
   aside={<CallSummary patient={patient} rule={ruleById('dropped-is-not-finished').sentence}/>}
   seed={{
    reason: `Teleconsultation · ${reference}`,
    history: `Held ${line.name.toLowerCase()}. In the room: ${inTheRoom.join(', ')}.`
     + (everDropped ? ` The line dropped during the consultation and was re-established; identity was confirmed again before continuing.` : ''),
    notes: nursePresent
     ? 'Anything examined during this call was examined by the nurse in the room and is recorded under her registration.'
     : 'No clinician was in the room. Nothing was examined during this call.'
   }}/>
 </Suspense>;

 return <div className="teleconsult tcx">
  {/* The appointment, and where in the encounter this reader is. One bar rather than two rows: the
      reference and the patient were a grey key-value line above a step counter, and neither of them
      said which of five screens you were standing on. */}
  <div className="tcx-bar">
   <span className="tcx-bar-disc" aria-hidden="true">{initialsOf(patient)}</span>
   <div className="tcx-bar-say">
    <span className="cf-eyebrow">Appointment {reference}</span>
    <strong>{patient}</strong>
   </div>
   {/* The recording indicator, on every stage of the call, because the contract's design for a
       recording is that it is unmistakable on every screen while it runs — and so, in a build with no
       recording, is its absence. It is words with a hollow mark, not a control. */}
   {stage < 4 && <StatusIndicator status="offline" label="Not recording" className="tcx-recording"/>}
   {stage < 4 && <StepHead step={stage + 1} total={stages.length} label={stages[stage]}/>}
  </div>

  {stage === 0 ? <div className="form-stack tcx-stage">
   <div className="tcx-lede">
    <h2>Who will be able to see and hear you.</h2>
    <p>{ruleById('presence-is-consented').sentence}</p>
   </div>
   <NotConnected of="teleconsultation"/>

   <section className="tcx-card">
    <div className="tcx-card-head"><h3>The doctor on this call</h3><span>Read from the vetting register</span></div>
    <label className="tcx-field">Doctor for this appointment<select value={doctorId} onChange={e => { setDoctorId(e.target.value); setClosed(null); }}>
     {doctors.map(d => <option key={d.id} value={d.id}>{d.name} · {d.reference}</option>)}
    </select></label>
    {/* The same capability the clinical queue asks about, refused in the same words. A doctor told
        one thing by the queue and another by the call is a doctor who trusts neither. */}
    {!consult.allowed && <div className="tcx-stop" role="status"><ShieldX size={19}/><p>{consult.reason}</p></div>}
   </section>

   <section className="tcx-card">
    <div className="tcx-card-head"><h3>Who else is at the address or on the call</h3>
     <span>{participants.filter(p => p.essential || present[p.id]).length} on the roster</span></div>
    <fieldset className="chip-set"><legend className="visually-hidden">Who else is at the address or on the call</legend>
     {optional.map(p => <label key={p.id} className={present[p.id] ? 'chip selected' : 'chip'}>
      <input type="checkbox" checked={!!present[p.id]} disabled={saslRequired && p.id === interpreterParticipant}
       onChange={e => { setChosen({ ...chosen, [p.id]: e.target.checked }); setConsented({ ...consented, [p.id]: false }); }}/>{p.name}
     </label>)}
    </fieldset>
    {/* `teleconsult` is one of the interpreting capability's own surfaces, and this is the part of it
        the interpreter is on. The screen's notice above is about the call, not about who is
        interpreting it, so the interpreting one is rendered here, inline, where the interpreter is
        being put on the roster. */}
    {saslRequired && <NotConnected of="interpreting" tone="inline"/>}
    {saslRequired && <div className="tcx-note" role="status"><Users size={18}/><p>{interpreterWithdrawal.sentence} {interpreterWithdrawal.why}</p></div>}
    <Roster present={present} consented={consented} patient={patient} doctor={doctor}/>
   </section>

   <section className="tcx-card">
    <div className="tcx-card-head"><h3>Asked one at a time</h3><span>Each answer can be taken back mid-call</span></div>
    <p className="tcx-hint">Each of these is a separate answer, and each can be taken back in the middle of the call.</p>
    {participants.filter(p => p.consentQuestion && (p.essential || present[p.id])).map(p => {
     const item = consentItems.find(c => c.participant === p.id)!;
     return <div className="tc-consent" key={p.id}>
      <label className="checkbox"><input type="checkbox" checked={!!consented[p.id]} onChange={e => setConsented({ ...consented, [p.id]: e.target.checked })}/>
       <span>“{p.consentQuestion}”</span></label>
      {!consented[p.id] && <p className="tc-cost" role="status"><CircleAlert size={14}/>If you say no: {p.ifDeclined}</p>}
      {consented[p.id] && !item.required && <p className="tc-cost is-agreed"><Info size={14}/>You can change your mind during the call. {item.revokedMidCall}</p>}
     </div>;
    })}
   </section>

   {/* The refusals that belong exactly here, where a relative would otherwise be offered as the
       answer. Said rather than merely made impossible: the person who needs the reason is the family
       member standing in the room. Four sentences in four heavy boxes filled the screen above the
       roster they are about; they are one list under one rule now, and every word is still here. */}
   <section className="tcx-refuse">
    <div className="tcx-card-head"><h3>What this screen will not do</h3><span>Four refusals</span></div>
    <ul className="tc-refusals">
     {(['family-as-interpreter', 'child-as-interpreter', 'written-english-instead'] as const).map(id =>
      <li className="tc-refusal" key={id}><Ban size={18} aria-hidden="true"/><p><strong>{interpreterRefusal(id).title}. </strong>{interpreterRefusal(id).sentence}</p></li>)}
     <li className="tc-refusal"><Ban size={18} aria-hidden="true"/><p>{refusalById('silent-observers').sentence}</p></li>
    </ul>
   </section>

   <div className="button-row">
    {onClose && <Button variant="secondary" onClick={onClose}><ArrowLeft size={16}/>Leave</Button>}
    {consult.allowed
     ? <Button variant="primary" disabled={!consented.doctor || !interpreterAgreed} onClick={() => setStage(1)}>Check identity<ArrowRight size={16}/></Button>
     : <Button variant="primary" onClick={() => { setClosed('clinician-refused'); setStage(4); }}>Rebook with a doctor whose registration is current<ArrowRight size={16}/></Button>}
   </div>
  </div>

  : stage === 1 ? <div className="form-stack tcx-stage">
   <div className="tcx-lede">
    <h2>Both ends, checked.</h2>
    <p>{identity.whyOneMechanism}</p>
   </div>
   <div className="tcx-pair">
    <section className="tcx-card tc-identity">
     <div className="tcx-card-head"><h3>What the patient checks</h3><span><BadgeCheck size={14} aria-hidden="true"/>Vetting register</span></div>
     <dl className="tcx-facts">
      <div><dt>The doctor on this call</dt><dd>{doctor.name}</dd></div>
      <div><dt>Council registration</dt><dd>{doctor.reference}</dd></div>
     </dl>
     <p className="tcx-hint">{identity.patientSideDetail}</p>
    </section>
    <section className="tcx-card tc-identity is-lead">
     <div className="tcx-card-head"><h3>What the doctor checks</h3><span><KeyRound size={14} aria-hidden="true"/>One mechanism</span></div>
     <p className="tcx-hint">{identity.doctorSideDetail}</p>
     <label id="tc-code-label" className="tcx-code-label">Visit code</label>
     <CodeInput value={code} onChange={v => { setCode(v); setCodeError(''); }} label="Visit code" describedBy="tc-code-help" invalid={!!codeError} autoFocus/>
     <p className={`tcx-hint${codeError ? ' is-error' : ''}`} id="tc-code-help" role="status">{codeError || 'The code changes for every visit and expires when the visit ends.'}</p>
    </section>
   </div>
   <div className="button-row">
    <Button variant="secondary" onClick={() => setStage(0)}><ArrowLeft size={16}/>Back</Button>
    {codeError
     ? <Button variant="primary" onClick={() => { setClosed('identity-failed'); setStage(4); }}>Close the encounter<ArrowRight size={16}/></Button>
     : <Button variant="primary" disabled={code.length < 6} onClick={() => code === demoVisitCode
        ? (setIdentityConfirmed(true), setStage(2))
        : setCodeError(identity.failure)}>Confirm and continue<ArrowRight size={16}/></Button>}
   </div>
  </div>

  : stage === 2 ? <div className="form-stack tcx-stage">
   <div className="tcx-lede">
    <h2>Recording is a second question, and the answer here is no.</h2>
    <p>{ruleById('recording-is-separate').sentence}</p>
   </div>
   {/* The decision is the hero of this stage rather than a tinted strip above a list. There is no
       control anywhere in this block and there is deliberately no place to put one. */}
   <section className="tc-recording">
    <span className="tc-recording-mark" aria-hidden="true"><CircleSlash size={30}/></span>
    <div>
     <strong>{recording.decision}</strong>
     <p>{recording.why}</p>
    </div>
   </section>
   <section className="tcx-card">
    <div className="tcx-card-head"><h3>What happens instead</h3><span>{recording.instead.length} things the record carries</span></div>
    <ul className="tcx-list">{recording.instead.map(line => <li key={line}><ClipboardList size={16} aria-hidden="true"/>{line}</li>)}</ul>
   </section>
   <section className="tcx-card">
    <div className="tcx-card-head"><h3>What would be asked, if it existed</h3><span>A design, not a feature</span></div>
    <dl className="tcx-spec">
     <div><dt>When</dt><dd><strong>Its own screen, after consent to the consultation</strong><span>{recording.whenItExists.askedSeparately}</span></dd></div>
     <div><dt>Cost of refusing</dt><dd><strong>None</strong><span>{recording.whenItExists.refusingIsCostless}</span></dd></div>
     <div><dt>While it runs</dt><dd><strong>Unmistakable, on every screen</strong><span>{recording.whenItExists.whileRecording}</span></dd></div>
     <div><dt>Who could open it</dt><dd><strong>Three, and no more</strong>
      <ul className="tcx-list tight">{recording.whenItExists.whoMayView.map(who => <li key={who}><Lock size={15} aria-hidden="true"/>{who}</li>)}</ul></dd></div>
     <div><dt>Kept for</dt><dd><strong>{recording.whenItExists.keptForDays} days</strong><span>{recording.whenItExists.afterwards}</span></dd></div>
    </dl>
   </section>
   <ul className="tc-refusals">
    <li className="tc-refusal"><Ban size={18} aria-hidden="true"/><p>{refusalById('covert-recording').sentence}</p></li>
   </ul>
   <div className="button-row">
    <Button variant="secondary" onClick={() => setStage(1)}><ArrowLeft size={16}/>Back</Button>
    <Button variant="primary" onClick={() => setStage(3)}>Open the call<ArrowRight size={16}/></Button>
   </div>
  </div>

  : stage === 3 && waitingAt >= 0 ? <div className="form-stack tcx-stage tc-waiting">
   {/* Between asking for a doctor and getting one. The contract is blunt about this on purpose: an
       app that says "connecting…" for eleven minutes has lied for ten of them, so each state says
       what is actually true and the position in the queue and the minutes waited are both shown,
       because either one alone reads as better news than it is. */}
   <NotConnected of="teleconsultation"/>
   <section className="cf-night tcx-wait" aria-label="Waiting for a doctor">
    <div className="cf-night-head">
     <span className="cf-eyebrow"><Hourglass size={15} aria-hidden="true"/>The waiting room</span>
     <span className="cf-standing">Step {waitingAt + 1} of {session.steps.length}</span>
    </div>
    <div className="tcx-wait-body">
     <div className="cf-figure">
      <span className="cf-figure-value">{session.standsForMinutes}<small>min</small></span>
      <p className="cf-figure-label">the wait this is standing in for, played out in seconds</p>
     </div>
     {/* The queue as a queue. Three states down a spine, the one you are standing in lit, the ones
         behind you closed — so a reader can see how much of the wait is left rather than reading a
         sentence that changes every fourteen hundred milliseconds and says nothing about position. */}
     <ol className="tcx-queue">
      {session.steps.map((step, i) => <li key={step.id} className={i < waitingAt ? 'is-done' : i === waitingAt ? 'is-now' : ''}>
       <span className="tcx-queue-mark" aria-hidden="true">{i < waitingAt ? <Check size={14}/> : i + 1}</span>
       <div>
        <strong>{step.name}</strong>
        {i === waitingAt && <p>{step.patientWords.replace('{name}', doctor.name)}</p>}
       </div>
      </li>)}
     </ol>
    </div>
    <p className="tcx-line-note">This is standing in for a {session.standsForMinutes}-minute wait, played out in seconds. A visit waits {maximumWaitMinutes} minutes for a doctor and then goes to the panel as a review instead; the screen shows you the queue rather than making you sit in it.</p>
   </section>
   <p className="tcx-hint" role="status">Step {waitingAt + 1} of {session.steps.length}. The line will open {session.connection.name.toLowerCase()}.</p>
   <div className="button-row">
    <Button variant="secondary" onClick={() => setStage(2)}><ArrowLeft size={16}/>Back</Button>
    <Button variant="primary" onClick={() => setWaitingAt(-1)}>Skip the wait<ArrowRight size={16}/></Button>
   </div>
  </div>

  /* The call room: the stage, with the toolkit beside it and the patient under the tools — the Lovable export's
     arrangement, without its video stage, its vital signs or its notes box (features/CallSummary.tsx). */
  : stage === 3 ? withTools(<div className="form-stack tcx-stage">
   <NotConnected of="teleconsultation"/>

   <section className="tcx-video-preview" aria-label="Consultation video preview">
    <div className="tcx-video-person"><VideoOff size={36} aria-hidden="true"/><h3>{patient}</h3></div>
    <div className="tcx-video-caption"><span>Consultation room · simulated</span><span>{doctor.name}</span></div>
   </section>
   <LineInstrument connectionId={connectionId} allowed={allowedNow}/>

   {/* The line is not a control a doctor has. The rail below is a review device and says so, which
       is why it sits under the instrument rather than looking like the way to fix a bad signal. */}
   <fieldset className="tc-switch tcx-rail"><legend>Set the line, for review</legend>
    {connectionStates.map(s => <label key={s.id} className={connectionId === s.id ? 'selected' : ''}>
     <input type="radio" name="tc-line" checked={connectionId === s.id} onChange={() => {
      setConnectionId(s.id);
      if (s.id === 'dropped') { setEverDropped(true); setHoldLeft(reconnect.holdSeconds); }
      else if (everDropped) setResumed(true);
     }}/><span>{s.name}</span></label>)}
    <p className="tcx-hint">The line is the network's answer rather than anybody's choice. It is shown here so a doctor can see what the patient's end is being told.</p>
   </fieldset>
   {connectionId === 'audio' && <div className="tcx-note"><Info size={18}/><p>{ruleById('audio-is-not-lesser').sentence}</p></div>}

   {dropped && <div className="tc-dropped" role="status">
    {/* The hold, as a clock rather than as a label. The ring is driven by the same second the
        numeral is, so a reader who has asked for less motion gets the ring where it actually
        stands rather than an empty circle — there is no animation on it at all. */}
    <div className="tc-hold">
     <svg className="tc-hold-plot" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <circle className="tc-hold-track" cx="64" cy="64" r="52"/>
      <circle className="tc-hold-arc" cx="64" cy="64" r="52"
       style={{ strokeDasharray: 2 * Math.PI * 52, strokeDashoffset: 2 * Math.PI * 52 * (1 - holdLeft / reconnect.holdSeconds) }}/>
     </svg>
     <strong>{holdLeft}s</strong>
     <small>of {reconnect.holdSeconds} · up to {reconnect.attempts} attempts</small>
    </div>
    <div className="tc-dropped-say">
     <strong>{reconnect.whoCallsWhom}</strong>
     <p>{reconnect.duringTheHold}</p>
     {nursePresent && <p>{reconnect.nurseInTheRoom}</p>}
     {holdLeft === 0 && <><p>{reconnect.afterTheHold}</p><p>{reconnect.ifUnreachable}</p></>}
     <p className="tcx-hint">{reconnect.whyNotLonger}</p>
    </div>
   </div>}

   <section className="tcx-card">
    <div className="tcx-card-head"><h3>In the room</h3><span>{participants.filter(p => p.essential || present[p.id]).length} on the roster</span></div>
    <Roster present={present} consented={consented} patient={patient} doctor={doctor}
     onAsk={id => {
      setConsented({ ...consented, [id]: false });
      setWithdrawnNote(consentItems.find(c => c.participant === id)!.revokedMidCall);
      /* Withdrawal is one action and no confirmation step, like every other consent here. What is
         different is what it does: an interpreter the patient needs leaving the call ends the
         consultation, because what is left is a conversation the patient cannot follow. */
      if (id === interpreterParticipant && saslRequired && interpreterWithdrawal.endsTheConsultation) finish('interpreter-withdrawn');
     }}/>
    {withdrawnNote && <div className="tcx-note" role="status"><DoorOpen size={18}/><p>{withdrawnNote}</p></div>}
   </section>

   {/* Never asked is not the same fact as refused, and a screen that shows one state for both is
       telling the patient their answer did not matter. Both are here, switchable, so a review can
       see that they are different screens rather than one screen with a different word in it. */}
   <section className="tcx-card">
    <div className="tcx-card-head"><h3>What this device has been allowed to use</h3><span>Nothing, on either count</span></div>
    <div className="tc-media">
     <span className="tc-media-mark" aria-hidden="true">{mediaState === 'granted' ? <PhoneCall size={20}/> : mediaState === 'refused' ? <MicOff size={20}/> : <VideoOff size={20}/>}</span>
     <div>
      <strong>{media.states.find(s => s.id === mediaState)!.name}</strong>
      <p>{media.states.find(s => s.id === mediaState)!.detail}</p>
      <p className="tc-out-note">{media.sentence}</p>
     </div>
    </div>
    <fieldset className="tc-switch tcx-rail"><legend className="visually-hidden">What this device has been allowed to use</legend>
     {media.states.map(s => <label key={s.id} className={mediaState === s.id ? 'selected' : ''}>
      <input type="radio" name="tc-media" checked={mediaState === s.id} onChange={() => setMediaState(s.id)}/><span>{s.name}</span></label>)}
     <p className="tcx-hint">{media.whyTheDistinctionMatters}</p>
    </fieldset>
   </section>

   <SectionTitle title="What this doctor may conclude, right now"/>
   <div className="tc-limits">
    {allowedNow.map(l => <div className="tc-limit ok" key={l.id}><span className="tc-limit-mark" aria-hidden="true"><Check size={15}/></span><div><strong>{l.name}</strong><small>{l.detail}</small></div></div>)}
    {withheldNow.map(l => <div className="tc-limit no" key={l.id}><span className="tc-limit-mark" aria-hidden="true"><Ban size={15}/></span><div><strong>{l.name}</strong>
     <small>{l.needs === 'nurse' && !nursePresent ? 'Nobody is in the room to examine on the doctor’s behalf.' : `Needs ${l.needs === 'video' ? 'a picture good enough to rely on' : 'a working line'}. ${l.detail}`}</small></div></div>)}
   </div>
   <div className="tcx-note"><Users size={18}/><p>{ruleById('examination-is-attributed').sentence}</p></div>
   <ul className="tc-refusals">
    <li className="tc-refusal"><Ban size={18} aria-hidden="true"/><p>{refusalById('diagnose-the-unseen').sentence}</p></li>
   </ul>

   <div className="button-row">
    <Button variant="secondary" onClick={() => finish('ended')}><PhoneOff size={16}/>End without a decision</Button>
    {/* Nothing here can close an encounter as finished while the line is down. That is the button
        this feature exists to not have. */}
    <Button variant="primary" disabled={!mayConclude(connectionId, nursePresent) || !consented.doctor} leadingIcon={<Check aria-hidden="true"/>}
     onClick={() => { setDecisionReached(true); finish('ended'); }}>
     Reach a decision and end the consultation
    </Button>
   </div>
   {!mayConclude(connectionId, nursePresent) && <p className="tc-cost" role="status"><WifiOff size={14}/>The line does not currently allow a decision to be reached, so there is no way to close this encounter as a completed consultation.</p>}
   {!consented.doctor && <p className="tc-cost" role="status"><ShieldX size={14}/>Consent to the consultation has been withdrawn. {consentItems.find(c => c.id === 'consult')!.revokedMidCall}</p>}
  </div>)

  : withTools(<div className="form-stack tcx-stage">
   {/* The verdict, as one statement. The outcome, whether it counts, whether it is charged and the
       sentence the contract writes for it were four separate things stacked down the page; a reader
       had to assemble the answer. */}
   <section className={`tcx-verdict${outcome.countsAsConsultation ? ' is-consultation' : ''}`}>
    <span className="tcx-verdict-mark" aria-hidden="true">{outcome.countsAsConsultation ? <BadgeCheck size={28}/> : <CircleAlert size={28}/>}</span>
    <div className="tcx-verdict-say">
     <h2>{outcome.name}</h2>
     <p>{outcome.record}</p>
    </div>
    <div className="tcx-verdict-facts">
     <Badge variant={outcome.countsAsConsultation ? 'success' : 'warning'} dot>{outcome.countsAsConsultation ? 'Counts as a consultation' : 'Not a consultation'}</Badge>
     <div className="review-line"><span>Charged</span><strong>{outcome.charged ? 'Yes — a consultation was held' : 'No'}</strong></div>
    </div>
   </section>
   {closed === 'interpreter-withdrawn' && <div className="tcx-stop" role="status"><ShieldX size={19}/><p>{interpreterWithdrawal.sentence} {interpreterWithdrawal.why} {interpreterWithdrawal.notAPunishment}</p></div>}
   {!outcome.charged && <p className="tcx-hint">{refusalById('charge-for-a-failure').sentence}</p>}

   <section className="tcx-card">
    <div className="tcx-card-head"><h3>What goes into the consultation record</h3>
     <span>{sectionsFor(outcome).filter(s => s.written).length} of {sectionsFor(outcome).length} sections written</span></div>
    <p className="tcx-hint">The same twelve sections every MyThuso encounter writes into. A section this encounter did not reach is withheld here rather than left empty for somebody to fill in later.</p>
    <div className="tcx-table-wrap">
     <table className="admin-table tc-sections">
      <caption className="visually-hidden">Which sections of the consultation record this encounter writes</caption>
      <thead><tr><th scope="col">Section</th><th scope="col">Written</th></tr></thead>
      <tbody>{sectionsFor(outcome).map(({ section, written }) => <tr key={section.id} className={written ? '' : 'negative'}>
       <th scope="row">{section.name}</th>
       <td>{written ? <><Check size={14}/>Yes</> : <><Lock size={14}/>Not reached</>}</td>
      </tr>)}</tbody>
     </table>
    </div>
   </section>

   {outcome.countsAsConsultation ? <>
    <p className="tcx-hint">{ruleById('dropped-is-not-finished').sentence}</p>
    <Button variant="secondary" onClick={() => setTool('notes')}><ClipboardList size={17}/>Write it up in the consultation record</Button>
   </> : <>
    <div className="tcx-stop"><ShieldX size={19}/><p>{ruleById('dropped-is-not-finished').sentence} There is no button on this screen that closes this encounter as a completed consultation, for anybody, in any state.</p></div>
   </>}

   <section className="tcx-refuse">
    <div className="tcx-card-head"><h3>What this screen will not do</h3>
     <span>{refusals.filter(r => !['half-a-consultation', 'charge-for-a-failure'].includes(r.id)).length + (outcome.countsAsConsultation ? 0 : 1) + simulationOf('teleconsultation')!.refuses.length} refusals</span></div>
    <ul className="tc-refusals">
     {!outcome.countsAsConsultation && <li className="tc-refusal"><Ban size={18} aria-hidden="true"/><p>{refusalById('half-a-consultation').sentence}</p></li>}
     {refusals.filter(r => !['half-a-consultation', 'charge-for-a-failure'].includes(r.id)).map(r =>
      <li className="tc-refusal" key={r.id}><Ban size={18} aria-hidden="true"/><p>{r.sentence}</p></li>)}
     {/* And what the thing standing in for a media stack will not do. A screen is never quieter for
         being simulated than it was for being absent, so the simulation's own refusals sit in the
         same list as the feature's rather than being left in a contract nobody opens. */}
     {simulationOf('teleconsultation')!.refuses.map(sentence =>
      <li className="tc-refusal" key={sentence}><Ban size={18} aria-hidden="true"/><p>{sentence}</p></li>)}
    </ul>
   </section>
   <EmptyNote>{ruleById('no-media-in-this-build').sentence} Nothing was transmitted, no encounter was written and no clinician was notified.</EmptyNote>
   <div className="button-row">
    <Button variant="secondary" onClick={() => { setStage(0); setClosed(null); setDecisionReached(false); setResumed(false); setEverDropped(false); setConnectionId(session.connection.id); setWaitingAt(0); setCode(''); setCodeError(''); setIdentityConfirmed(false); setConsented({ doctor: false, nurse: false, guardian: false, interpreter: false }); setWithdrawnNote(null); setChosen({ nurse: true, guardian: false, interpreter: false }); setTool('call'); }}><ArrowLeft size={16}/>Start again</Button>
    {onClose && <Button variant="primary" onClick={onClose}>Close<Check size={17}/></Button>}
   </div>
  </div>)}
 </div>;
}

/* Every clinical limit, with what it needs, for a review that wants the ladder without walking the
   call. Read from the contract so there is no second list of them. */
export const teleconsultLimits = clinicalLimits;
