import { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowLeftRight, Ban, CheckCheck, CircleAlert, GitMerge, History, Inbox, Lock, Radio, Send, ShieldCheck, ShieldX, Undo2, UserCheck } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { CalibrationTag, ProvenanceLegend, ProvenanceTag } from '../components/Provenance';
import { KitCapture, type CaptureField } from './KitCapture';
/* Straight from the contract's own module, not through Clinical.tsx, which re-exports it.
   Thuso Kit is one of the few screens both a patient and a nurse open, so an import here is an
   import into the patient's bundle: that one convenience edge pulled the doctor's review, the
   visit assessment, the consultation composer and the offline queue onto a handset whose owner
   will never see any of them. Where a module is shared across audiences, it takes the shortest
   path to a value it needs. */
import { observations } from '../lib/observations';
import {
 ageText, calibrationOf, captureStateById, clockTime, conflictById, deviceById, instrumentBySerial,
 kit, nextCaptureId, receive, rules, skewText,
 type Capture, type CaptureStateId
} from '../lib/capture';
import { inMemoryAdmission, reportInstrumentQueue } from '../lib/visit-queue';
import { can, formatEventTime, type VettingSubject } from '../lib/vetting';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';

/* Thuso Kit, and the half of it that is not about instruments at all.

   A nurse in a house in Ivory Park with no signal has done her work. The platform's job from that
   moment is to not lose it and to not pretend it has been filed. Everything below is the design of
   that: six capture states, four conflicts, two clocks that disagree, and one queue that is honest
   about what it does not survive.

   Fictional patients, invented readings, nothing sent anywhere. */

/* Loaded when it is drawn, and only this screen needs to do that. Thuso Kit is one of the few screens
   a patient opens as well as a nurse, so a static import of the clinical deck — or of this screen's
   own stylesheet — would put both into the patient's entry, the download CLAUDE.md measures so that
   it never grows. KitDeck carries the two together. On a clinical screen they are already in the
   workspace chunk and nothing extra is fetched; a patient fetches them once, when she opens this
   screen and not before. The figures and their labels travel with it for the same reason. */
const KitDeck = lazy(() => import('./KitDeck'));

const HOURS = 3_600_000;
const nurses = subjectsByRole('nurse').filter(n => ['N-205', 'N-201', 'N-204'].includes(n.id));
/* Everybody who could take responsibility for somebody else's reading. A doctor whose registration
   has lapsed is left in the list on purpose: a countersignature offered by a clinician who may not
   sign is a refusal a reviewer should be able to watch happen. */
const countersigners: VettingSubject[] = [...subjectsByRole('doctor'), ...subjectsByRole('nurse').filter(n => n.id === 'N-205')];

/* Two of the eight things the kit measures are not among the assessment's seven observations, and
   scripts/check-boundaries.mjs names both: a weight has no indicative range worth flagging against,
   and a single-lead trace is not a number at all. They are captured all the same. */
const extraFields: CaptureField[] = [{ id: 'weight', label: 'Weight', unit: 'kg' }, { id: 'ecg', label: 'Single-lead ECG', unit: 'trace' }];
export const kitFields: CaptureField[] = [...observations.map(o => ({ id: o.id as string, label: o.label as string, unit: o.unit as string })), ...extraFields];

/* The queue as it is found on opening: three readings taken in a home with no signal, and one that
   reached the record two days ago. The dates are relative, which is what makes the fourth conflict
   real rather than staged — Sister Ayanda Dube's police clearance lapsed nine days ago and the
   reading below was taken twelve days ago, so she was cleared when she took it and is not cleared
   now. Nobody set a flag to arrange that. It is arithmetic on two dates. */
const opened = Date.now();
const oximeter = kit.find(i => i.deviceId === 'pulse-oximeter')!;
const cuff = kit.find(i => i.deviceId === 'bp-cuff')!;
const meter = kit.find(i => i.deviceId === 'glucometer')!;
const seed: Capture[] = [
 { id: nextCaptureId(), observationId: 'systolic', label: 'Blood pressure — systolic', unit: 'mmHg', value: '168', provenance: 'device',
   serial: cuff.serial, calibration: calibrationOf(cuff), context: 'Large adult · 35–44 cm',
   by: 'N-204', byName: 'Sister Ayanda Dube', deviceAt: new Date(opened - 12 * 24 * HOURS).toISOString(), state: 'queued' },
 /* Out of calibration and out of date on its strips, and still the only glucose reading anybody
    has. It is queued, it will be stored, and it carries both caveats wherever it goes. */
 { id: nextCaptureId(), observationId: 'glucose', label: 'Blood glucose', unit: 'mmol/L', value: '11.4', provenance: 'device',
   serial: meter.serial, calibration: calibrationOf(meter), context: 'Lot 23K902 · expired Jun 2026',
   by: 'N-205', byName: 'Sister Naledi Mokoena', deviceAt: new Date(opened - 3.7 * HOURS).toISOString(), state: 'queued' },
 /* A retake, typed by hand after a doubtful first reading. It meets the first one on arrival. */
 { id: nextCaptureId(), observationId: 'pulse', label: 'Pulse', unit: 'bpm', value: '96', provenance: 'manual',
   by: 'N-205', byName: 'Sister Naledi Mokoena', deviceAt: new Date(opened - 0.4 * HOURS).toISOString(), state: 'queued' },
 { id: nextCaptureId(), observationId: 'pulse', label: 'Pulse', unit: 'bpm', value: '72', provenance: 'device',
   serial: oximeter.serial, calibration: calibrationOf(oximeter), context: 'Index finger · warm hands, steady trace',
   by: 'N-205', byName: 'Sister Naledi Mokoena', deviceAt: new Date(opened - 50 * HOURS).toISOString(),
   receivedAt: new Date(opened - 49.9 * HOURS).toISOString(), state: 'stored' }
];
/* When this device last wrote its copy of the record. Anything read out of that copy says so, in
   words, wherever it is shown — the whole of offlineNeverServesStaleSilently. */
const localCopyAt = new Date(opened - 5.2 * HOURS).toISOString();

const stateTone: Record<CaptureStateId, string> = {
 captured: 'sky', queued: 'sky', sending: 'sky', stored: '', conflicted: 'amber', refused: 'danger'
};

export function ThusoKit({ onClose }: { onClose?: () => void }) {
 const [capturerId, setCapturerId] = useState('N-205');
 const [online, setOnline] = useState(false);
 const [signed, setSigned] = useState(false);
 const [entries, setEntries] = useState<Capture[]>(seed);
 const [sending, setSending] = useState(false);
 const [notice, setNotice] = useState('');
 const capturer = subjectById(capturerId)!;
 const mayCapture = can(capturer, 'write-clinical-note');
 const held = entries.filter(e => e.state === 'captured');
 const queued = entries.filter(e => e.state === 'queued');
 const inFlight = entries.filter(e => e.state === 'sending');
 const needsDecision = entries.filter(e => e.state === 'conflicted');
 const stored = entries.filter(e => e.state === 'stored');
 const patch = (id: string, next: Partial<Capture>) => setEntries(list => list.map(e => e.id === id ? { ...e, ...next } : e));
 /* A nurse does not have two queues, so she must not be shown two counts. This screen keeps its own
    reading-level list — its subject is one instrument and one reading at a time — and publishes how
    much of it has not left the phone, so that "what is waiting" is one number wherever she reads it. */
 const onDevice = held.length + queued.length + inFlight.length;
 useEffect(() => { reportInstrumentQueue(onDevice); }, [onDevice]);

 /* Sending is deliberately two steps with a pause between them, because “in flight” is a state a
    nurse can watch fail. An interrupted send puts the entry back in the queue rather than anywhere
    else, which is the contract's own sentence about that state. */
 const send = () => {
  setSending(true);
  setEntries(list => list.map(e => e.state === 'queued' ? { ...e, state: 'sending' } : e));
  window.setTimeout(() => setEntries(list => {
   if (!list.some(e => e.state === 'sending')) return list;           // interrupted while in flight
   const now = new Date().toISOString();
   /* Each entry is answered against everything the record already holds, including whatever landed
      a moment earlier in this same sync. A duplicate that arrives beside its twin is still a
      duplicate. */
   const settled: Capture[] = [];
   const already = list.filter(e => e.state !== 'sending');
   for (const entry of list.filter(e => e.state === 'sending')) {
    const subject = subjectById(entry.by)!;
    const decision = can(subject, 'write-clinical-note');
    settled.push(receive(entry, { now, stored: [...already, ...settled], capturerAllowed: decision.allowed, capturerReason: decision.reason, recordSigned: signed }));
   }
   return list.map(e => settled.find(s => s.id === e.id) ?? e);
  }), 1100);
  window.setTimeout(() => setSending(false), 1150);
 };
 const interrupt = () => { setEntries(list => list.map(e => e.state === 'sending' ? { ...e, state: 'queued', note: 'The send was interrupted. The entry went back to the queue rather than anywhere else.' } : e)); setSending(false); };

 return <div className="kit-surface nt-screen c-page">
  {/* The whole screen waits for its deck and its sheet together, so nobody sees the queue drawn
      without its styles for a moment. While it waits, the capability's sentence is already on the
      screen: a disclosure that appears after the thing it qualifies is, for that moment, none. */}
  <Suspense fallback={<NotConnected of="devices"/>}>
  <KitDeck entries={entries} online={online} onToggle={() => setOnline(!online)} localCopyAt={localCopyAt}/>

  <div className="c-sheet form-stack">
  <SectionTitle title="Four origins, and none of them a lesser version of another"/>
  <div className="panel nt-origins">
   <ProvenanceLegend/>
   <p className="helper"><CircleAlert size={13}/><span>{rules.provenanceIsRequired}</span></p>
  </div>

  <SectionTitle title="Capturing as"/>
  <div className="panel form-stack nt-capturer">
   <label>Nurse<select value={capturerId} onChange={e => setCapturerId(e.target.value)}>
    {nurses.map(n => <option key={n.id} value={n.id}>{n.name} · {n.reference}</option>)}
   </select></label>
   {mayCapture.allowed
    ? <p className="helper" role="status"><ShieldCheck size={13}/><span>Cleared to write to a record today. Taking a reading is writing to a record, so it asks the same capability a clinical note asks.</span></p>
    : <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayCapture.reason}</div>}
  </div>

  <KitCapture fields={kitFields} capturer={capturer} verb="Hold it on this device" notice={false}
    onCapture={c => { setEntries(list => [c, ...list]); setNotice(`${c.label} captured. It is held on this device and exists nowhere else.`); }}/>

   <SectionTitle title="Waiting to send"/>
   <div className="panel form-stack nt-queue">
    <div className="kit-switches">
     <label className="checkbox"><input type="checkbox" checked={signed} onChange={e => setSigned(e.target.checked)}/><span>A doctor has signed this visit</span></label>
    </div>

    {/* The rule this preview owes and does not meet, said in the one place a reader would
        otherwise assume it did. */}
    {/* Written once in lib/visit-queue.ts and rendered here and on the visit assessment's own
        queue. Two screens each wording their own admission is how two admissions start disagreeing
        about what is being admitted. */}
    <div className="privacy-note alert"><Inbox size={19}/><span><strong>{inMemoryAdmission.headline}</strong> {inMemoryAdmission.before} <code>{inMemoryAdmission.script}</code> {inMemoryAdmission.after} “{inMemoryAdmission.owed}” — {inMemoryAdmission.close}</span></div>

    {held.length > 0 && <>
     {held.map(entry => <QueueRow key={entry.id} entry={entry}/>)}
     <button className="secondary full" onClick={() => { setEntries(list => list.map(e => e.state === 'captured' ? { ...e, state: 'queued' } : e)); setNotice('Sealed. The reading is finished, and from here it is the platform’s problem rather than the nurse’s.'); }}>
      <Lock size={16}/>Finish and seal {held.length} {held.length === 1 ? 'reading' : 'readings'}
     </button>
     <p className="helper">Sealing is the nurse saying she is done with the reading. Until she does, it is held on the device it was taken on and exists nowhere else.</p>
    </>}

    {queued.length + inFlight.length ? <>
     {[...inFlight, ...queued].map(entry => <QueueRow key={entry.id} entry={entry}/>)}
     <div className="button-row">
      {sending
       ? <button className="secondary" onClick={interrupt}><Undo2 size={16}/>Interrupt the send</button>
       : <button className="primary" disabled={!online || !queued.length} onClick={send}><Send size={16}/>Send {queued.length} {queued.length === 1 ? 'entry' : 'entries'}</button>}
     </div>
     {!online && <p className="helper">Sending needs a connection. Nothing is dropped to make a sync succeed, and nothing is retried behind your back.</p>}
    </> : held.length ? null : <EmptyNote>Nothing is waiting. An empty queue means every reading taken on this device has been answered for — stored, or standing below with a decision against it.</EmptyNote>}
    <p className="helper" role="status">{notice}</p>
   </div>

   {needsDecision.length > 0 && <>
    <SectionTitle title="Needs a decision"/>
    <div className="privacy-note"><GitMerge size={19}/>{rules.conflictsAreNotMerged}</div>
    {needsDecision.map(entry => <Resolution key={entry.id} entry={entry} stored={stored} patch={patch} setNotice={setNotice}/>)}
   </>}

   <SectionTitle title="This device’s copy of the record"/>
   <div className="panel form-stack">
    <p className="helper"><History size={13}/><span>Read from this device’s own store, {ageText(localCopyAt)}. It is served with its age rather than instead of a request for a fresher one, and the age is in words rather than a timestamp for somebody standing in a kitchen to do arithmetic on.</span></p>
    {stored.length ? stored.map(entry => <QueueRow key={entry.id} entry={entry}/>)
     : <EmptyNote>Nothing has reached the record from this device.</EmptyNote>}
   </div>

   <SectionTitle title="The six states a reading passes through"/>
   <div className="panel nt-states">
    {/* Six stations in the order a reading passes through them, each carrying the count it holds
        right now. A count of nothing is drawn as nothing rather than as a nought in a filled pill:
        an empty state is a state that has not happened, and colouring it the same as a state that
        has would put four false alarms on the screen. */}
    <ol className="nt-state-board">
     {(['captured', 'queued', 'sending', 'stored', 'conflicted', 'refused'] as CaptureStateId[]).map(id => {
      const spec = captureStateById(id);
      const count = entries.filter(e => e.state === id).length;
      return <li className={`nt-state${count ? ` holds tone-${stateTone[id] || 'stored'}` : ' empty'}`} key={id}>
       <span className="nt-state-count">{count}</span>
       <strong className="kit-state-name">{spec.name}</strong>
       <small>{spec.detail}</small>
      </li>;
     })}
    </ol>
    {/* An empty state is worth explaining rather than filling. */}
    <p className="helper"><Ban size={13}/><span>Nothing here produces a server refusal, and one has not been invented to fill the row. The refusals designed here happen earlier — a reading whose cuff nobody recorded is never taken, a nurse who is not cleared never captures — or they are put in front of a clinician instead of being thrown back. A server refuses for reasons nothing on this device can produce: a visit that no longer exists, a payload it cannot read, a version it does not support. The state is designed and left at zero.</span></p>
   </div>

  <div className="privacy-note"><Radio size={19}/>The instruments, their calibration cadences, the six states and the four conflicts are read from <code>packages/catalog/capture.json</code>, so web, iOS and Android cannot quietly disagree about what a reading is.</div>
  {onClose && <button className="primary full" onClick={onClose}>Close</button>}
  </div>
  </Suspense>
 </div>;
}

/* ---- One entry ------------------------------------------------------------------------------
   Two clocks on every row, always both, never merged. The instrument's time is labelled as what the
   instrument believed; the server's receipt is labelled as the thing everything is ordered by. A
   row that showed only the first would be presenting a guess as the time something happened. */
function QueueRow({ entry }: { entry: Capture }) {
 const spec = captureStateById(entry.state);
 const conflict = entry.conflictId ? conflictById(entry.conflictId) : undefined;
 const instrument = entry.serial ? instrumentBySerial(entry.serial) : undefined;
 const skewed = entry.receivedAt && Math.abs(new Date(entry.receivedAt).getTime() - new Date(entry.deviceAt).getTime()) > 5 * 60_000;
 /* The reading itself is the biggest thing on the row and the label is the quiet thing above it.
    It was the other way round, which made twelve rows of identical bold labels with the one number
    on each of them set smaller than its own caption. */
 return <div className={`panel kit-entry nt-entry tone-${stateTone[entry.state] || 'stored'} ${entry.supersededBy ? 'superseded' : ''}`}>
  <div className="kit-entry-head nt-entry-head">
   <div className="nt-entry-value">
    <small>{entry.label}</small>
    <strong>{entry.value}<i>{entry.unit}</i></strong>
   </div>
   <Pill tone={stateTone[entry.state]}>{spec.name}</Pill>
  </div>
  <div className="kit-tags">
   <ProvenanceTag source={{ provenance: entry.provenance, serial: entry.serial, by: entry.byName, saidBy: entry.saidBy, inputs: entry.inputs }}/>
   <CalibrationTag source={{ provenance: entry.provenance, serial: entry.serial, calibration: entry.calibration }}/>
  </div>
  <dl className="nt-facts">
   {entry.context && instrument && <div><dt>{deviceById(instrument.deviceId)!.name}</dt><dd>{entry.context}</dd></div>}
   <div><dt>Captured by</dt><dd>{entry.byName}</dd></div>
   {/* Two clocks, always both, side by side rather than stacked — the whole point of the pair is
       that a reader can see them disagree, and a disagreement read down a column is arithmetic. */}
   <div><dt>The instrument’s clock said</dt><dd className="nt-clock">{clockTime(entry.deviceAt)}</dd></div>
   <div><dt>Server receipt · what this is ordered by</dt><dd className="nt-clock">{entry.receivedAt ? formatEventTime(entry.receivedAt) : 'Not received. Nothing has ordered this yet.'}</dd></div>
  </dl>
  <p className="helper"><History size={13}/>Held on the device, {ageText(entry.deviceAt)}.</p>
  {skewed && <p className="helper" role="status"><ArrowLeftRight size={13}/><span>{skewText(entry.deviceAt, entry.receivedAt!)}</span></p>}
  {conflict && entry.state === 'stored' && conflict.resolution === 'server' &&
   <p className="helper" role="status"><CheckCheck size={13}/><span>Resolved by the server rather than by a clinician — the one of the four the contract does not put in front of a person, because the only thing it decided was the order.</span></p>}
  {entry.countersignedBy && <p className="helper" role="status"><UserCheck size={13}/><span>Filed under {entry.countersignedBy}, who took responsibility for it. {entry.byName} stays on the reading as the person who took it.</span></p>}
  {entry.supersededBy && <p className="helper" role="status"><Ban size={13}/><span>Superseded by another reading of the same observation, and kept. It is not deleted and it is not hidden.</span></p>}
 </div>;
}

/* ---- Resolution -----------------------------------------------------------------------------
   Three of the four conflicts are a clinician's, and all three offer the same two shapes of answer:
   somebody cleared takes responsibility for it, or it stays on the device until somebody does.
   Neither of those is “discard”, and there is no third button that quietly merges. */
function Resolution({ entry, stored, patch, setNotice }:
 { entry: Capture; stored: Capture[]; patch: (id: string, next: Partial<Capture>) => void; setNotice: (s: string) => void }) {
 const [signer, setSigner] = useState('D-401');
 const conflict = conflictById(entry.conflictId!);
 const clash = stored.find(s => s.observationId === entry.observationId && !s.supersededBy);
 const chosen = countersigners.find(c => c.id === signer)!;
 const decision = can(chosen, 'write-clinical-note');
 const hold = (why: string) => { patch(entry.id, { note: why }); setNotice('Held on the device with a reason against it. Nothing was filed and nothing was thrown away.'); };
 return <div className="panel form-stack kit-conflict">
  <div className="kit-entry-head"><div><strong>{conflict.name}</strong><small>{entry.label} · {entry.value} {entry.unit}</small></div><Pill tone="amber">Needs a decision</Pill></div>
  <p className="helper">{conflict.detail}</p>

  {entry.conflictId === 'duplicate-observation' && clash && <>
   {/* Both readings, at the same size, with everything a clinician would actually use to choose
       between them. A retake after a doubtful first reading is the usual reason this happens, and
       which of the two was doubtful is not something a timestamp knows. */}
   <div className="kit-versus">
    {[clash, entry].map((side, i) => <div className="panel" key={side.id}>
     <Pill tone="plain">{i === 0 ? 'Already in the record' : 'Arrived from the queue'}</Pill>
     <div className="kit-reading-value"><strong>{side.value}</strong><small>{side.unit}</small></div>
     <div className="kit-tags"><ProvenanceTag source={{ provenance: side.provenance, serial: side.serial, by: side.byName }}/><CalibrationTag source={{ provenance: side.provenance, serial: side.serial, calibration: side.calibration }}/></div>
     {side.context && <div className="review-line"><span>Recorded with</span><strong>{side.context}</strong></div>}
     <div className="review-line"><span>Instrument’s clock</span><strong>{clockTime(side.deviceAt)}</strong></div>
     <div className="review-line"><span>Server receipt</span><strong>{side.receivedAt ? formatEventTime(side.receivedAt) : '—'}</strong></div>
     <button className="primary full" onClick={() => {
      const other = i === 0 ? entry : clash;
      patch(side.id, { state: 'stored', receivedAt: side.receivedAt ?? new Date().toISOString(), note: undefined });
      patch(other.id, { state: 'stored', supersededBy: side.id, receivedAt: other.receivedAt ?? new Date().toISOString(), note: undefined });
      setNotice(`${side.value} ${side.unit} stands. The other reading stays in the record beside it, marked superseded — a disagreement a clinician settled, not a row a system deleted.`);
     }}>This one stands</button>
    </div>)}
   </div>
   <p className="helper"><CircleAlert size={13}/><span>Whichever is not chosen stays in the record as superseded. Nothing here deletes a reading a nurse actually took.</span></p>
  </>}

  {entry.conflictId === 'vetting-lapsed' && <>
   {/* The interesting one. She was cleared when she took it, so the reading is good work and is not
       thrown away; she is not cleared now, so it is not filed on her name alone. Somebody who is
       cleared takes responsibility for it, or it waits until somebody does. */}
   <div className="review-line"><span>Taken by</span><strong>{entry.byName}</strong></div>
   <div className="review-line"><span>Taken</span><strong>{ageText(entry.deviceAt)}</strong></div>
   <div className="review-line"><span>Her standing today</span><strong>{can(subjectById(entry.by)!, 'write-clinical-note').reason}</strong></div>
   <label>Countersigned by<select value={signer} onChange={e => setSigner(e.target.value)}>
    {countersigners.map(c => <option key={c.id} value={c.id}>{c.name} · {c.reference}</option>)}
   </select></label>
   {!decision.allowed && <p className="helper" role="status"><ShieldX size={13}/>{decision.reason}</p>}
   <div className="button-row">
    <button className="secondary" onClick={() => hold('Referred to the Control Tower. It stays on this device, unfiled, until somebody decides what to do with it.')}>Refer to the Control Tower</button>
    <button className="primary" disabled={!decision.allowed} onClick={() => {
     patch(entry.id, { state: 'stored', countersignedBy: `${chosen.name} · ${chosen.reference}`, note: undefined });
     setNotice(`Filed under ${chosen.name}, who countersigned it. ${entry.byName} stays on the reading as the person who took it — a countersignature adds a name, it does not replace one.`);
    }}><UserCheck size={16}/>Countersign and file</button>
   </div>
  </>}

  {entry.conflictId === 'stale-write' && <>
   <div className="review-line"><span>The record</span><strong>Signed while this was waiting</strong></div>
   <label>Addendum filed by<select value={signer} onChange={e => setSigner(e.target.value)}>
    {countersigners.map(c => <option key={c.id} value={c.id}>{c.name} · {c.reference}</option>)}
   </select></label>
   {!decision.allowed && <p className="helper" role="status"><ShieldX size={13}/>{decision.reason}</p>}
   <div className="button-row">
    <button className="secondary" onClick={() => hold('Held. The signed record is left as the doctor signed it, and this reading waits for a decision rather than being applied behind the signature.')}>Hold it</button>
    <button className="primary" disabled={!decision.allowed} onClick={() => {
     patch(entry.id, { state: 'stored', countersignedBy: `${chosen.name} · ${chosen.reference}`, note: undefined });
     setNotice('Filed as an addendum — after the signature, and visibly after it. The signed record is not edited.');
    }}>File as an addendum</button>
   </div>
  </>}
  {entry.note && <p className="helper" role="status">{entry.note}</p>}
 </div>;
}
