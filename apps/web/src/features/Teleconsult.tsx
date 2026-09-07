import { useEffect, useState } from 'react';
import {
 ArrowLeft, ArrowRight, BadgeCheck, Ban, Check, CircleAlert, CircleSlash, ClipboardList, DoorOpen,
 Hourglass, Info, KeyRound, Lock, MicOff, PhoneCall, PhoneOff, ShieldX, SignalLow, Users, VideoOff, WifiOff
} from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { CodeInput, StepHead } from '../components/Steps';
import { ConsultationComposer } from './Consultation';
import { demoVisitCode } from './Clinical';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';
import { type VettingSubject } from '../lib/vetting';
import {
 clinicalLimits, connectionById, connectionStates, consentItems, identity, mayConclude, mayConsult,
 media, nameOf, outcomeOf, participants, permitted, recording, reconnect, refusalById, refusals,
 ruleById, sectionsFor, withdrawn, type Attempt, type Participant
} from '../lib/teleconsult';
import {
 participantId as interpreterParticipant, refusalById as interpreterRefusal,
 useSaslRequirement, withdrawal as interpreterWithdrawal
} from '../lib/interpreting';

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
 * Recording. This preview does not offer it, and does not offer a switch for it either. The reason
 * is written into the contract and rendered on its own screen: this build has no microphone
 * permission, no camera permission and nowhere to put a recording, so a recording control here would
 * be a control that cannot do what it says — and a patient taught to tick it in a preview has been
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
 * Nothing connects. No WebRTC, no camera, no microphone, no permission requested and none declared.
 * Every doctor, nurse and patient here is fictional. */

const doctors = subjectsByRole('doctor').filter(d => ['D-401', 'D-402'].includes(d.id));
const stages = ['Who is in the room', 'Identity', 'Recording', 'The call', 'Afterwards'] as const;
/* The parties who might be in the room besides the two ends of the call. Which of them actually are
   is a fact about this appointment, so it is set up before the roster rather than assumed. */
const optional = participants.filter(p => !p.essential);
const subjectFor = (participant: Participant): VettingSubject | undefined =>
 participant.id === 'nurse' ? subjectById('N-205') : participant.id === 'guardian' ? subjectById('G-032') : undefined;

/* Everyone who can hear the patient, with the vetting register's name against the contract's role.
   A guardian's authority and a nurse's clearance are the register's business; whether they may be in
   this room is the patient's. */
function Roster({ present, consented, patient, doctor, onAsk }:
 { present: Record<string, boolean>; consented: Record<string, boolean>; patient: string; doctor: VettingSubject; onAsk?: (id: string) => void }) {
 return <div className="tc-roster">
  {participants.filter(p => p.essential || present[p.id]).map(p => {
   const subject = p.id === 'doctor' ? doctor : subjectFor(p);
   const out = !p.essential && !consented[p.id];
   return <div className={`tc-person${out ? ' is-out' : ''}`} key={p.id}>
    <span className="tc-avatar">{out ? <DoorOpen size={18}/> : <Users size={18}/>}</span>
    <div>
     <strong>{nameOf(p, subject, patient)}<em>{p.name}</em></strong>
     <small>{p.where}</small>
     <small>Can see: {p.sees}</small>
     <small>Can hear: {p.hears}</small>
     {out && <p className="tc-out-note">Not in the room. {p.ifDeclined}</p>}
    </div>
    {onAsk && p.mayBeAskedToLeave && !out
     ? <button className="text-button" onClick={() => onAsk(p.id)}>Ask to step out</button>
     : p.essential && p.id !== 'patient' ? <span className="pill plain">Cannot be asked to leave</span> : null}
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
  <div className="panel"><span className="pill plain">The patient sees</span><p>{state.patientSees}</p></div>
  <div className="panel"><span className="pill plain">The doctor sees</span><p>{state.doctorSees}</p></div>
 </div>;
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
 const [connectionId, setConnectionId] = useState('video');
 const [everDropped, setEverDropped] = useState(false);
 const [resumed, setResumed] = useState(false);
 const [holdLeft, setHoldLeft] = useState(reconnect.holdSeconds);
 const [decisionReached, setDecisionReached] = useState(false);
 const [closed, setClosed] = useState<string | null>(null);
 const [consultation, setConsultation] = useState(false);

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

 if (consultation) {
  /* The encounter ends in the record it produced — the same twelve sections a nurse's visit and a
     doctor's review write into, opened as the doctor who held the call, seeded with what the call
     actually established. Not a parallel structure with the word "teleconsultation" on it. */
  const line = connectionById(connectionId);
  return <ConsultationComposer reference={reference} patient={patient} writer={doctorId} onClose={onClose}
   seed={{
    reason: `Teleconsultation · ${reference}`,
    history: `Held ${line.name.toLowerCase()}. In the room: ${participants.filter(p => p.essential || (present[p.id] && consented[p.id])).map(p => nameOf(p, p.id === 'doctor' ? doctor : subjectFor(p), patient)).join(', ')}.`
     + (everDropped ? ` The line dropped during the consultation and was re-established; identity was confirmed again before continuing.` : ''),
    notes: nursePresent
     ? 'Anything examined during this call was examined by the nurse in the room and is recorded under her registration.'
     : 'No clinician was in the room. Nothing was examined during this call.'
   }}/>;
 }

 return <div className="teleconsult">
  {stage < 4 && <StepHead step={stage + 1} total={stages.length} label={stages[stage]}/>}
  <div className="review-line"><span>Appointment</span><strong>{reference} · {patient}</strong></div>

  {stage === 0 ? <div className="form-stack">
   <Pill>Design preview · nothing connects, and no camera or microphone is requested</Pill>
   <h3>Who will be able to see and hear you.</h3>
   <p className="muted">{ruleById('presence-is-consented').sentence}</p>

   <label>Doctor for this appointment<select value={doctorId} onChange={e => { setDoctorId(e.target.value); setClosed(null); }}>
    {doctors.map(d => <option key={d.id} value={d.id}>{d.name} · {d.reference}</option>)}
   </select></label>
   {/* The same capability the clinical queue asks about, refused in the same words. A doctor told
       one thing by the queue and another by the call is a doctor who trusts neither. */}
   {!consult.allowed && <div className="privacy-note alert" role="status"><ShieldX size={19}/>{consult.reason}</div>}

   <fieldset className="chip-set"><legend>Who else is at the address or on the call</legend>
    {optional.map(p => <label key={p.id} className={present[p.id] ? 'chip selected' : 'chip'}>
     <input type="checkbox" checked={!!present[p.id]} disabled={saslRequired && p.id === interpreterParticipant}
      onChange={e => { setChosen({ ...chosen, [p.id]: e.target.checked }); setConsented({ ...consented, [p.id]: false }); }}/>{p.name}
    </label>)}
   </fieldset>
   {saslRequired && <div className="privacy-note" role="status"><Users size={19}/>{interpreterWithdrawal.sentence} {interpreterWithdrawal.why}</div>}
   {/* The two refusals that belong exactly here, where a relative would otherwise be offered as the
       answer. Said rather than merely made impossible: the person who needs the reason is the
       family member standing in the room. */}
   <div className="tc-refusal"><Ban size={19}/><p><strong>{interpreterRefusal('family-as-interpreter').title}. </strong>{interpreterRefusal('family-as-interpreter').sentence}</p></div>
   <div className="tc-refusal"><Ban size={19}/><p><strong>{interpreterRefusal('child-as-interpreter').title}. </strong>{interpreterRefusal('child-as-interpreter').sentence}</p></div>
   <div className="tc-refusal"><Ban size={19}/><p><strong>{interpreterRefusal('written-english-instead').title}. </strong>{interpreterRefusal('written-english-instead').sentence}</p></div>

   <Roster present={present} consented={consented} patient={patient} doctor={doctor}/>

   <SectionTitle title="Asked one at a time"/>
   <p className="helper">Each of these is a separate answer, and each can be taken back in the middle of the call.</p>
   {participants.filter(p => p.consentQuestion && (p.essential || present[p.id])).map(p => {
    const item = consentItems.find(c => c.participant === p.id)!;
    return <div className="form-stack tc-consent" key={p.id}>
     <label className="checkbox"><input type="checkbox" checked={!!consented[p.id]} onChange={e => setConsented({ ...consented, [p.id]: e.target.checked })}/>
      <span>“{p.consentQuestion}”</span></label>
     {!consented[p.id] && <p className="helper" role="status"><CircleAlert size={13}/>If you say no: {p.ifDeclined}</p>}
     {consented[p.id] && !item.required && <p className="helper"><Info size={13}/>You can change your mind during the call. {item.revokedMidCall}</p>}
    </div>;
   })}

   <div className="tc-refusal"><Ban size={19}/><p>{refusalById('silent-observers').sentence}</p></div>
   <div className="button-row">
    {onClose && <button className="secondary" onClick={onClose}><ArrowLeft size={16}/>Leave</button>}
    {consult.allowed
     ? <button className="primary" disabled={!consented.doctor || !interpreterAgreed} onClick={() => setStage(1)}>Check identity<ArrowRight size={16}/></button>
     : <button className="primary" onClick={() => { setClosed('clinician-refused'); setStage(4); }}>Rebook with a doctor whose registration is current<ArrowRight size={16}/></button>}
   </div>
  </div>

  : stage === 1 ? <div className="form-stack">
   <h3>Both ends, checked.</h3>
   <div className="panel tc-identity">
    <span className="pill plain">What the patient checks</span>
    <div className="review-line"><span>The doctor on this call</span><strong><BadgeCheck size={15}/>{doctor.name}</strong></div>
    <div className="review-line"><span>Council registration</span><strong>{doctor.reference}</strong></div>
    <p className="helper">{identity.patientSideDetail}</p>
   </div>
   <div className="panel tc-identity">
    <span className="pill plain">What the doctor checks</span>
    <p className="helper">{identity.doctorSideDetail} In this preview the code is <strong>{demoVisitCode.slice(0, 4)}</strong>{demoVisitCode.slice(4)}.</p>
    <label id="tc-code-label">Visit code</label>
    <CodeInput value={code} onChange={v => { setCode(v); setCodeError(''); }} label="Visit code" describedBy="tc-code-help" invalid={!!codeError} autoFocus/>
    <p className="helper" id="tc-code-help" role="status">{codeError || 'The code changes for every visit and expires when the visit ends.'}</p>
   </div>
   <div className="privacy-note"><KeyRound size={19}/>{identity.whyOneMechanism}</div>
   <div className="button-row">
    <button className="secondary" onClick={() => setStage(0)}><ArrowLeft size={16}/>Back</button>
    {codeError
     ? <button className="primary" onClick={() => { setClosed('identity-failed'); setStage(4); }}>Close the encounter<ArrowRight size={16}/></button>
     : <button className="primary" disabled={code.length < 6} onClick={() => code === demoVisitCode
        ? (setIdentityConfirmed(true), setStage(2))
        : setCodeError(identity.failure)}>Confirm and continue<ArrowRight size={16}/></button>}
   </div>
  </div>

  : stage === 2 ? <div className="form-stack">
   <h3>Recording is a second question, and the answer here is no.</h3>
   <p className="muted">{ruleById('recording-is-separate').sentence}</p>
   <div className="tc-recording">
    <span className="tc-avatar"><CircleSlash size={20}/></span>
    <div><strong>{recording.decision}</strong><p>{recording.why}</p></div>
   </div>
   <SectionTitle title="What happens instead"/>
   <ul className="landing-list">{recording.instead.map(line => <li key={line}><ClipboardList size={16}/>{line}</li>)}</ul>
   <SectionTitle title="What would be asked, if it existed"/>
   <div className="panel form-stack">
    <div className="review-line"><span>When</span><strong>Its own screen, after consent to the consultation</strong></div>
    <p className="helper">{recording.whenItExists.askedSeparately}</p>
    <div className="review-line"><span>Cost of refusing</span><strong>None</strong></div>
    <p className="helper">{recording.whenItExists.refusingIsCostless}</p>
    <div className="review-line"><span>While it runs</span><strong>Unmistakable, on every screen</strong></div>
    <p className="helper">{recording.whenItExists.whileRecording}</p>
    <div className="review-line"><span>Who could open it</span><strong>Three, and no more</strong></div>
    <ul className="landing-list">{recording.whenItExists.whoMayView.map(who => <li key={who}><Lock size={16}/>{who}</li>)}</ul>
    <div className="review-line"><span>Kept for</span><strong>{recording.whenItExists.keptForDays} days</strong></div>
    <p className="helper">{recording.whenItExists.afterwards}</p>
   </div>
   <div className="tc-refusal"><Ban size={19}/><p>{refusalById('covert-recording').sentence}</p></div>
   <div className="button-row">
    <button className="secondary" onClick={() => setStage(1)}><ArrowLeft size={16}/>Back</button>
    <button className="primary" onClick={() => setStage(3)}>Open the call<ArrowRight size={16}/></button>
   </div>
  </div>

  : stage === 3 ? <div className="form-stack">
   {/* Never asked is not the same fact as refused, and a screen that shows one state for both is
       telling the patient their answer did not matter. Both are here, switchable, so a review can
       see that they are different screens rather than one screen with a different word in it. */}
   <div className="tc-media">
    <span className="tc-avatar">{mediaState === 'granted' ? <PhoneCall size={20}/> : mediaState === 'refused' ? <MicOff size={20}/> : <VideoOff size={20}/>}</span>
    <div>
     <strong>{media.states.find(s => s.id === mediaState)!.name}</strong>
     <p>{media.states.find(s => s.id === mediaState)!.detail}</p>
     <p className="tc-out-note">{media.sentence}</p>
    </div>
   </div>
   <fieldset className="tc-switch"><legend className="visually-hidden">Preview the media permission state</legend>
    {media.states.map(s => <label key={s.id} className={mediaState === s.id ? 'selected' : ''}>
     <input type="radio" name="tc-media" checked={mediaState === s.id} onChange={() => setMediaState(s.id)}/><span>{s.name}</span></label>)}
    <p className="helper">{media.whyTheDistinctionMatters}</p>
   </fieldset>

   <SectionTitle title="In the room"/>
   <Roster present={present} consented={consented} patient={patient} doctor={doctor}
    onAsk={id => {
     setConsented({ ...consented, [id]: false });
     setWithdrawnNote(consentItems.find(c => c.participant === id)!.revokedMidCall);
     /* Withdrawal is one action and no confirmation step, like every other consent here. What is
        different is what it does: an interpreter the patient needs leaving the call ends the
        consultation, because what is left is a conversation the patient cannot follow. */
     if (id === interpreterParticipant && saslRequired && interpreterWithdrawal.endsTheConsultation) finish('interpreter-withdrawn');
    }}/>
   {withdrawnNote && <div className="privacy-note" role="status"><DoorOpen size={19}/>{withdrawnNote}</div>}

   <SectionTitle title="The line"/>
   <fieldset className="tc-switch"><legend className="visually-hidden">Preview the connection state</legend>
    {connectionStates.map(s => <label key={s.id} className={connectionId === s.id ? 'selected' : ''}>
     <input type="radio" name="tc-line" checked={connectionId === s.id} onChange={() => {
      setConnectionId(s.id);
      if (s.id === 'dropped') { setEverDropped(true); setHoldLeft(reconnect.holdSeconds); }
      else if (everDropped) setResumed(true);
     }}/><span>{s.name}</span></label>)}
    <p className="helper">A preview control. In production this is the network's answer, not a choice.</p>
   </fieldset>
   <BothEnds connectionId={connectionId}/>
   <p className="helper"><SignalLow size={13}/>{connectionById(connectionId).note}</p>
   {connectionId === 'audio' && <div className="privacy-note"><Info size={19}/>{ruleById('audio-is-not-lesser').sentence}</div>}

   {dropped && <div className="tc-dropped" role="status">
    <div className="tc-hold"><Hourglass size={22}/><strong>{holdLeft}s</strong><small>of {reconnect.holdSeconds} · up to {reconnect.attempts} attempts</small></div>
    <div>
     <p><strong>{reconnect.whoCallsWhom}</strong></p>
     <p>{reconnect.duringTheHold}</p>
     {nursePresent && <p>{reconnect.nurseInTheRoom}</p>}
     {holdLeft === 0 && <><p>{reconnect.afterTheHold}</p><p>{reconnect.ifUnreachable}</p></>}
     <p className="helper">{reconnect.whyNotLonger}</p>
    </div>
   </div>}

   <SectionTitle title="What this doctor may conclude, right now"/>
   <div className="tc-limits">
    {allowedNow.map(l => <div className="tc-limit ok" key={l.id}><Check size={16}/><div><strong>{l.name}</strong><small>{l.detail}</small></div></div>)}
    {withheldNow.map(l => <div className="tc-limit no" key={l.id}><Ban size={16}/><div><strong>{l.name}</strong>
     <small>{l.needs === 'nurse' && !nursePresent ? 'Nobody is in the room to examine on the doctor’s behalf.' : `Needs ${l.needs === 'video' ? 'a picture good enough to rely on' : 'a working line'}. ${l.detail}`}</small></div></div>)}
   </div>
   <div className="privacy-note"><Users size={19}/>{ruleById('examination-is-attributed').sentence}</div>
   <div className="tc-refusal"><Ban size={19}/><p>{refusalById('diagnose-the-unseen').sentence}</p></div>

   <div className="button-row">
    <button className="secondary" onClick={() => finish('ended')}><PhoneOff size={16}/>End without a decision</button>
    {/* Nothing here can close an encounter as finished while the line is down. That is the button
        this feature exists to not have. */}
    <button className="primary" disabled={!mayConclude(connectionId, nursePresent) || !consented.doctor}
     onClick={() => { setDecisionReached(true); finish('ended'); }}>
     <Check size={16}/>Reach a decision and end the consultation
    </button>
   </div>
   {!mayConclude(connectionId, nursePresent) && <p className="helper" role="status"><WifiOff size={13}/>The line does not currently allow a decision to be reached, so there is no way to close this encounter as a completed consultation.</p>}
   {!consented.doctor && <p className="helper" role="status"><ShieldX size={13}/>Consent to the consultation has been withdrawn. {consentItems.find(c => c.id === 'consult')!.revokedMidCall}</p>}
  </div>

  : <div className="form-stack">
   <div className={outcome.countsAsConsultation ? 'success-icon' : 'tc-outcome-icon'}>
    {outcome.countsAsConsultation ? <BadgeCheck size={30}/> : <CircleAlert size={30}/>}
   </div>
   <h3>{outcome.name}</h3>
   <Pill tone={outcome.countsAsConsultation ? 'teal' : 'amber'}>{outcome.countsAsConsultation ? 'Counts as a consultation' : 'Not a consultation'}</Pill>
   <p className="muted">{outcome.record}</p>
   {closed === 'interpreter-withdrawn' && <div className="privacy-note alert" role="status"><ShieldX size={19}/>{interpreterWithdrawal.sentence} {interpreterWithdrawal.why} {interpreterWithdrawal.notAPunishment}</div>}
   <div className="review-line"><span>Charged</span><strong>{outcome.charged ? 'Yes — a consultation was held' : 'No'}</strong></div>
   {!outcome.charged && <p className="helper">{refusalById('charge-for-a-failure').sentence}</p>}

   <SectionTitle title="What goes into the consultation record"/>
   <p className="helper">The same twelve sections every MyThuso encounter writes into. A section this encounter did not reach is withheld here rather than left empty for somebody to fill in later.</p>
   <table className="admin-table tc-sections">
    <caption className="visually-hidden">Which sections of the consultation record this encounter writes</caption>
    <thead><tr><th scope="col">Section</th><th scope="col">Written</th></tr></thead>
    <tbody>{sectionsFor(outcome).map(({ section, written }) => <tr key={section.id} className={written ? '' : 'negative'}>
     <th scope="row">{section.name}</th>
     <td>{written ? <><Check size={14}/>Yes</> : <><Lock size={14}/>Not reached</>}</td>
    </tr>)}</tbody>
   </table>

   {outcome.countsAsConsultation ? <>
    <p className="helper">{ruleById('dropped-is-not-finished').sentence}</p>
    <button className="secondary full" onClick={() => setConsultation(true)}><ClipboardList size={17}/>Write it up in the consultation record</button>
   </> : <>
    <div className="tc-refusal"><Ban size={19}/><p>{refusalById('half-a-consultation').sentence}</p></div>
    <div className="privacy-note alert"><ShieldX size={19}/>{ruleById('dropped-is-not-finished').sentence} There is no button on this screen that closes this encounter as a completed consultation, for anybody, in any state.</div>
   </>}

   <SectionTitle title="What this screen will not do"/>
   <div className="tc-refusals">{refusals.filter(r => !['half-a-consultation', 'charge-for-a-failure'].includes(r.id)).map(r =>
    <div className="tc-refusal" key={r.id}><Ban size={19}/><p>{r.sentence}</p></div>)}</div>
   <EmptyNote>{ruleById('no-media-in-this-build').sentence} Nothing was transmitted, no encounter was written and no clinician was notified.</EmptyNote>
   <div className="button-row">
    <button className="secondary" onClick={() => { setStage(0); setClosed(null); setDecisionReached(false); setResumed(false); setEverDropped(false); setConnectionId('video'); setCode(''); setCodeError(''); setIdentityConfirmed(false); setConsented({ doctor: false, nurse: false, guardian: false, interpreter: false }); setWithdrawnNote(null); setChosen({ nurse: true, guardian: false, interpreter: false }); }}><ArrowLeft size={16}/>Start again</button>
    {onClose && <button className="primary" onClick={onClose}>Close<Check size={17}/></button>}
   </div>
  </div>}
 </div>;
}

/* Every clinical limit, with what it needs, for a review that wants the ladder without walking the
   call. Read from the contract so there is no second list of them. */
export const teleconsultLimits = clinicalLimits;
