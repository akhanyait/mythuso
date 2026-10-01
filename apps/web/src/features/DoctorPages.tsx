import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, BookOpen, CalendarDays, ClipboardList, FileText, Receipt, Route, Search, Send, ShieldCheck, Stethoscope, Video, House } from 'lucide-react';
import { Alert, Badge, Button, Input, MetricCard } from '../ui';
import { useThusoIQ } from '../lib/thusoiq';
import { latestSample, sampleFreshness, thusoiq } from '../../../../packages/thusoiq/index.ts';
import { roleOf, whoIs } from '../lib/roles';
import { dayOf as clinicalDay, inboxNow, notTriaged, triageStages, useClinical } from '../lib/clinical';
import { DOCTOR, fill, labStateOf, outcomeLabel, outcomeReason, scheduleName, stateLabel, stateOf, useMedicines, words as medicinesWords } from '../lib/medicines';
import { ageFrom, canOpen, consultationSections, isProtected, patients, shortDate } from '../lib/records';
import { subjectById } from '../lib/vetting-fixtures';
import { doctorFeesFor } from '../lib/money';
import { doctorFeeNow, useSettingsHistories } from '../lib/settings';
import { initialsOf } from '../lib/names';
import clinicalContract from '../../../../packages/catalog/clinical.json' with { type: 'json' };
import protocolsContract from '../../../../packages/catalog/protocols.json' with { type: 'json' };
import { observations } from '../lib/observations';
import { GuidanceStart, TriageStart } from './ClinicalIntelligence';
import { ApplicationStanding, VettingApplication } from './Vetting';
import { PatientFile } from './PatientFile';
import { DeckTitleLevel } from './ClinicalDeck';
import './doctor-pages.css';
/* Sentinel carries the Safety, Core and Devices domains; it arrives when a doctor opens Triage, not before. */
const SentinelState = lazy(() => import('./Sentinel').then(m => ({ default: m.SentinelState })));

/* The doctor's pages from the Lovable export's arrangement (30 September 2026).
 *
 * The export gives the doctor fifteen destinations, each a title, a strip of three or four figures and a
 * list. The words on most of them were invented — "124 consultations +12%", "RX-5831 Issued", "HbA1c ·
 * 8.2%", "Ratified · version 3", "6 d median wait" — and those are exactly the numbers this product
 * refuses to carry. What is taken is the arrangement: a page that says what it is, a strip counted off
 * the rows under it, and the rows. Every figure below is the length of a list a reader can see, or the
 * sum of a column on it; where the export draws a number nothing holds, the page says in a sentence that
 * nothing holds it.
 *
 * Every row is read from a store or a contract that already exists — the ThusoIQ sandbox, the patient
 * records, the Medicines store, the clinical inbox, the protocol registry, the vetting register — and
 * every refusal is the contract's own sentence. A protected entry is never a row on a list that crosses
 * patients: it is read in the patient's file, by whoever the patient released it to, and nowhere else. */

/* ---- The shared furniture ----------------------------------------------------------------------- */

type Figure = { label: string; value: string; trend: string };
function Strip({ figures, label }: { figures: readonly Figure[]; label: string }) {
 return <div className="dp-strip" aria-label={label}>{figures.map((f, i) =>
  <MetricCard key={f.label} className={i === 0 ? 'is-lead' : undefined} label={f.label} value={f.value} trend={f.trend}/>)}</div>;
}
function Head({ title, intro, children, level = 'h1' }: { title: string; intro?: ReactNode; children?: ReactNode; level?: 'h1' | 'h2' }) {
 const Title = level;
 return <div className="dp-head"><div><Title>{title}</Title>{intro && <p>{intro}</p>}</div>{children}</div>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
 return <p className="dp-empty"><strong>{title}</strong>{children}</p>;
}
const minutesText = (minutes: number) => { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`; };
const ZONE = 'Africa/Johannesburg';
const dayKey = (at: Date | string) => new Date(at).toLocaleDateString('en-CA', { timeZone: ZONE });
const clock = (at: string | number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });
const longDay = (at: Date) => at.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONE });
/* The doctor this workspace signs in as, from the role's own subject rather than typed. */
const DOCTOR_ID = roleOf('doctor').subjectId ?? 'D-401';
const SANDBOX = 'ThusoIQ connection: sandbox adapter. These visits and patients are an in-memory workflow sandbox, and no clinical service is delivered here.';
const viewer = () => subjectById(DOCTOR_ID)!;
/* A row on a list that crosses patients: open to this doctor, and never in a protected category. */
const listable = <T extends Parameters<typeof isProtected>[0]>(item: T) => !isProtected(item) && canOpen(viewer(), item).allowed;
const PROTECTED_LEFT_OUT = 'An entry in a protected category is never a row on a list across patients. It is read in the patient’s file, by the person the patient released it to, and this sentence stands whether or not anything is held back.';

/* ---- Schedule ------------------------------------------------------------------------------------
   The export's day plan, from the ThusoIQ sandbox's appointments for this doctor. Day only: nothing holds
   a doctor's week or month, and a Week tab over the same two rows would be a view of nothing. */
export function DoctorSchedule() {
 const { state } = useThusoIQ();
 const [now] = useState(() => new Date());
 const today = dayKey(now);
 const modes = thusoiq.appointments.modes, states = thusoiq.appointments.states;
 const rows = state.appointments.filter(a => a.clinicianId === DOCTOR_ID && dayKey(a.startsAt) === today)
  .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
 const patientName = (id: string) => state.patients.find(p => p.id === id)?.name ?? id;
 const live = rows.filter(a => !states.find(s => s.id === a.status)?.terminal);
 const byMode = (id: string) => rows.filter(a => a.mode === id).length;
 return <section className="dp-page" aria-labelledby="dp-schedule">
  <div className="dp-head"><div><h1 id="dp-schedule">Schedule</h1><p>{longDay(now)}. Your visits in the ThusoIQ sandbox, in the order they happen.</p></div>
   <Badge variant="neutral" dot>Day · Fictional sandbox</Badge></div>
  {/* No capability in packages/catalog/capabilities.json is this sandbox — booking's notice is about a
      patient's visit and a nurse roster — so the page says what the workbench footer says it is. */}
  <p className="dp-sandbox" role="note"><Activity size={16} aria-hidden="true"/>{SANDBOX}</p>
  <Strip label="Your day, counted" figures={[
   { label: 'Visits today', value: String(rows.length), trend: modes.map(m => `${byMode(m.id)} ${m.name.toLowerCase()}`).join(' · ') },
   { label: 'Still to happen', value: String(live.length), trend: live.length ? `Next at ${clock(live[0].startsAt)}` : 'Nothing is left on the day' },
   { label: 'Booked time', value: minutesText(rows.reduce((sum, a) => sum + a.minutes, 0)), trend: `The sum of the ${rows.length} visits below` }
  ]}/>
  <div className="dp-panel">
   <div className="dp-panel-head"><h2>Day plan</h2><span>{rows.length} {rows.length === 1 ? 'visit' : 'visits'}</span></div>
   {rows.length ? <ol className="dp-list">{rows.map(a => {
    const mode = modes.find(m => m.id === a.mode);
    const Icon = a.mode === 'video' ? Video : House;
    return <li key={a.id} className="dp-row">
     <span className="dp-row-mark is-time">{clock(a.startsAt)}</span>
     <span className="dp-row-what"><strong>{patientName(a.patientId)}</strong>
      <small><Icon size={13} aria-hidden="true"/> {mode?.name ?? a.mode} · {a.minutes} minutes · {a.id}</small></span>
     <span className="dp-row-state"><Badge variant={a.status === 'arrived' ? 'accent' : a.status === 'completed' ? 'success' : 'neutral'}>{states.find(s => s.id === a.status)?.name ?? a.status}</Badge></span>
    </li>;
   })}</ol> : <Empty title="Nothing is on today">A visit arranged for you in the ThusoIQ workspace on the review queue appears here on the day it happens.</Empty>}
   <p className="dp-note">A week or a month is not drawn: nothing holds more of your time than the visits on this sandbox, and a calendar of empty days would be a view of nothing.</p>
  </div>
 </section>;
}

/* ---- Patient context -----------------------------------------------------------------------------
   The export's searchable list with the file beside it, in place of the file's own select. A condition
   on a row passes the file header's own rule — a protected condition is never a chip, not for anybody —
   and the search reads only what a row shows, so typing a protected condition's name finds nobody rather
   than finding the one patient who has it. No Stable, Review or Due: nothing decides one. The row says
   when the patient was last seen instead, which the record holds. */
export function DoctorPatients({ open }: { open: (s: string) => void }) {
 const [chosen, setChosen] = useState(patients[0].id);
 const [query, setQuery] = useState('');
 const shown = (p: typeof patients[number]) => p.conditions.filter(c => !isProtected(c)).map(c => c.name);
 const q = query.trim().toLowerCase();
 const rows = patients.filter(p => !q || [p.name, p.id, ...shown(p)].some(text => text.toLowerCase().includes(q)));
 return <div className="dp-split">
  <section className="dp-master" aria-labelledby="dp-patients">
   <Head title="Patient context" intro="Your patients, and the file of the one you choose."/>
   <div className="dp-search">
    <label htmlFor="dp-patient-search"><Search size={14} aria-hidden="true"/> Search patients</label>
    <Input id="dp-patient-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, reference or condition"/>
   </div>
   <p className="visually-hidden" role="status" aria-live="polite">{rows.length} of {patients.length} patients shown.</p>
   {rows.length ? <ol className="dp-list" aria-label="Patients">{rows.map(p => <li key={p.id}>
    <button className="dp-row" aria-pressed={p.id === chosen} onClick={() => setChosen(p.id)}>
     <span className="dp-row-mark" aria-hidden="true">{initialsOf(p.name)}</span>
     <span className="dp-row-what"><strong>{p.name}</strong>
      <small>{p.id} · {ageFrom(p.dob)} years{shown(p).length ? ` · ${shown(p).join(' · ')}` : ''}</small>
      <small>Last seen {shortDate(p.lastVisit.at)}</small></span>
    </button>
   </li>)}</ol> : <Empty title="Nobody matches">The search reads a patient’s name, reference and the conditions their header shows. Clear it to see all {patients.length}.</Empty>}
  </section>
  <div className="dp-detail"><DeckTitleLevel.Provider value="h2"><PatientFile key={chosen} open={open} patientId={chosen}/></DeckTitleLevel.Provider></div>
 </div>;
}

/* ---- Consultation records ----------------------------------------------------------------------------
   The export's records list and its clinical-notes list are one list here: a note is a section of a
   record, not a second document. Two sources, each labelled — the records on the patients' files, and
   the ThusoIQ sandbox's encounters — with the state each one is actually in, and the figures above them
   counted off the rows. "98% complete" is not drawn; sections recorded of the sections there are is. */
export function DoctorRecordsList() {
 const { state } = useThusoIQ();
 const filed = patients.flatMap(p => p.consultations.filter(listable).map(c => ({ c, patient: p }))).sort((a, b) => b.c.at.localeCompare(a.c.at));
 const sandbox = state.consultations;
 const soapKeys = ['subjective', 'objective', 'assessment', 'plan'] as const;
 const soapWritten = (notes: Record<string, string>) => soapKeys.filter(k => notes[k]?.trim()).length;
 const encounterWord: Record<string, string> = { draft: 'Draft', 'awaiting-doctor': 'Awaiting doctor review', signed: 'Signed' };
 const sectionsOn = filed.reduce((sum, { c }) => sum + consultationSections.filter(s => c.sections.includes(s.id)).length, 0);
 const waiting = sandbox.filter(c => c.status !== 'signed').length;
 return <section className="dp-page" aria-labelledby="dp-records">
  <Head title="Consultation records" intro="Every record you may read, across your patients, and the sandbox encounters still open. A new record is written in the frame below."/>
  <Strip label="The records, counted" figures={[
   { label: 'Records on this list', value: String(filed.length + sandbox.length), trend: `${filed.length} on file · ${sandbox.length} in the sandbox` },
   { label: 'Sections recorded', value: String(sectionsOn), trend: `Of ${filed.length * consultationSections.length} across the ${filed.length} records on file` },
   { label: 'Not yet signed', value: String(waiting), trend: waiting ? 'Sandbox encounters, draft or awaiting review' : 'Every sandbox encounter is signed' }
  ]}/>
  <div className="dp-panel">
   <div className="dp-panel-head"><h2>On your patients’ files</h2><span>{filed.length}</span></div>
   {filed.length ? <ol className="dp-list">{filed.map(({ c, patient }) => {
    const filled = consultationSections.filter(s => c.sections.includes(s.id)).length;
    return <li key={c.id} className="dp-row">
     <span className="dp-row-mark" aria-hidden="true"><ClipboardList size={18}/></span>
     <span className="dp-row-what"><span className="dp-row-ref">{c.id} · {shortDate(c.at)}</span><strong>{patient.name}</strong><small>{c.kind} · {c.by}</small></span>
     <span className="dp-row-state"><Badge variant="neutral">{filled} of {consultationSections.length} sections</Badge></span>
    </li>;
   })}</ol> : <Empty title="No record on file is open to you">Records exist; you are not one of the people who may read them.</Empty>}
   <div className="dp-panel-head"><h2>In the ThusoIQ sandbox</h2><span>{sandbox.length}</span></div>
   {sandbox.length ? <ol className="dp-list">{sandbox.map(c => <li key={c.id} className="dp-row">
    <span className="dp-row-mark" aria-hidden="true"><Stethoscope size={18}/></span>
    <span className="dp-row-what"><span className="dp-row-ref">{c.id}</span><strong>{state.patients.find(p => p.id === c.patientId)?.name ?? c.patientId}</strong><small>{soapWritten(c.notes)} of {soapKeys.length} SOAP sections written</small></span>
    <span className="dp-row-state"><Badge variant={c.status === 'signed' ? 'success' : 'warning'}>{encounterWord[c.status] ?? c.status}</Badge></span>
   </li>)}</ol> : <Empty title="No sandbox encounter is open">An encounter opens from a visit somebody has arrived at, in the ThusoIQ workspace on the review queue, so a record never describes a visit that had not started.</Empty>}
   <p className="dp-note">{PROTECTED_LEFT_OUT}</p>
  </div>
 </section>;
}

/* ---- Credentials ---------------------------------------------------------------------------------
   The export's settings page was an editable profile with a Save button and a one-time code. Nothing
   here is editable and nothing is saved: a registration is the register's, and a screen that let a doctor
   type her own HPCSA number over it would be a credential she issued herself. What is drawn is what the
   register holds, the eight checks with their state, and the application walk for anybody who wants to
   see what a doctor is asked for. */
export function DoctorCredentials() {
 const who = whoIs(DOCTOR_ID, 'Dispatch is withdrawn until this is put right.');
 const [walk, setWalk] = useState(false);
 return <section className="dp-page" aria-labelledby="dp-credentials">
  <div className="dp-head"><div><h1 id="dp-credentials">Credentials</h1><p>What the register holds about you. Nothing on this page is edited, and nothing is saved.</p></div></div>
  <div className="dp-panel">
   <h2>On the register</h2>
   <dl className="dp-facts">
    <div><dt>Name</dt><dd>{who.subject.name}</dd></div>
    <div><dt>Register</dt><dd>{who.roleName}</dd></div>
    <div><dt>Registration</dt><dd>{who.subject.reference}</dd></div>
    <div><dt>Standing</dt><dd>{who.credential}</dd></div>
   </dl>
  </div>
  <ApplicationStanding subjectId={DOCTOR_ID}/>
  {walk ? <VettingApplication roleId="doctor" onClose={() => setWalk(false)}/>
   : <Button variant="secondary" onClick={() => setWalk(true)} trailingIcon={<ArrowRight aria-hidden="true"/>}>See what a doctor is asked for</Button>}
 </section>;
}

/* ---- Triage ------------------------------------------------------------------------------------------
   The export's live triage page — live vitals, three triage layers, an early-warning score, a heatmap, a
   device-versus-nurse table — in the only form this product can honestly draw: the patients in the
   ThusoIQ sandbox, how fresh each wearable reading is and nothing about what it means, the triage stages
   and the answer that nothing was triaged, the guidance answers, and Sentinel's hand-raised tier. No
   severity badge, no score, no heatmap and no interpretation: no protocol is a ratified triage protocol,
   and no engine reads a sample and concludes anything. */
export function DoctorTriage() {
 const { state } = useThusoIQ();
 const [patientId, setPatientId] = useState(state.patients[0]?.id ?? '');
 const [now] = useState(() => new Date().toISOString());
 const patient = state.patients.find(p => p.id === patientId);
 const freshness = { missing: 'No reading yet', recent: 'Recent', stale: 'Stale' } as const;
 return <section className="dp-page" aria-labelledby="dp-triage">
  <div className="dp-head"><div><h1 id="dp-triage">Triage</h1><p>{clinicalContract.triage.triageProtocols.why}</p></div>
   <Badge variant="neutral">{notTriaged.label}</Badge></div>
  <Alert variant="warning" title={notTriaged.human}>{thusoiq.wearables.neverInferred}</Alert>
  <div className="dp-panel">
   <div className="dp-panel-head"><h2>Patients in the sandbox</h2><span>{state.patients.length}</span></div>
   <div className="dp-chips" role="group" aria-label="Choose a patient">{state.patients.map(p =>
    <button key={p.id} className="dp-chip" aria-pressed={p.id === patientId} onClick={() => setPatientId(p.id)}>{p.name}</button>)}</div>
   {patient && <>
    <p className="dp-note">{patient.name} · {patient.reason}</p>
    <ul className="dp-tiles" aria-label={`How fresh ${patient.name}’s readings are`}>{thusoiq.wearables.metrics.map(metric => {
     const latest = latestSample(state.samples, patient.id, metric.id as 'heart-rate');
     const fresh = sampleFreshness(latest, now);
     return <li key={metric.id} className={`dp-tile is-${fresh}`}>
      <span className="dp-tile-label">{metric.name}</span>
      <strong>{freshness[fresh]}</strong>
      <small>{latest ? `Measured ${clock(latest.measuredAt)}` : 'Nothing has been received for this patient.'}</small>
     </li>;
    })}</ul>
    <p className="dp-note">Freshness only. A reading is read, with its value and where it came from, in the Wearables tool of the ThusoIQ workspace, and never judged here.</p>
   </>}
  </div>
  <TriageStart/>
  <GuidanceStart/>
  <Suspense fallback={null}><SentinelState workspace="doctor"/></Suspense>
 </section>;
}

/* ---- Prescriptions -------------------------------------------------------------------------------
   The export's list of named drugs marked "Issued", with "0 interactions — no active alerts". Neither is
   drawn. The rows are the prescriptions this session wrote, by reference, schedule and the state the
   Medicines domain gives them; the check is shown as not checked in the contract's words, beside its
   reason, because "0 interactions" would be a finding nobody made. */
export function DoctorPrescriptionsList() {
 const s = useMedicines();
 const mine = s.prescriptions.filter(p => p.prescriberRef === DOCTOR);
 const unchecked = mine.filter(p => p.prescribeCheckOutcomeCode === 'not-checked').length;
 return <section className="dp-page" aria-labelledby="dp-prescriptions">
  <Head title={medicinesWords.prescribe.heading} intro="What you have prescribed in this session, by reference and state, and the prescription you write next."/>
  <Strip label="Your prescriptions, counted" figures={[
   { label: 'Prescribed this session', value: String(mine.length), trend: mine.length ? `${mine.filter(p => stateOf(p) === 'prescribed').length} waiting for a pharmacist` : 'None yet' },
   { label: 'Verified by a pharmacist', value: String(mine.filter(p => p.verifiedAt !== null).length), trend: 'By a pharmacist who is not you' },
   /* Named by its outcome, so the numeral counts prescriptions whose check compared nothing and can never be
      read as a count of interactions found. */
   { label: fill(medicinesWords.prescribe.checkResult, { outcome: outcomeLabel('not-checked') }), value: String(unchecked), trend: `Of ${mine.length} prescribed · nothing was compared` }
  ]}/>
  <div className="dp-panel">
   <div className="dp-panel-head"><h2>Prescribed</h2><span>{mine.length}</span></div>
   {mine.length ? <ol className="dp-list">{mine.map(p => <li key={p.prescriptionRef} className="dp-row">
    <span className="dp-row-mark" aria-hidden="true"><FileText size={18}/></span>
    <span className="dp-row-what"><span className="dp-row-ref">{p.prescriptionRef} · {p.medicationRequestRef}</span><strong>{scheduleName(p.scheduleCode)}</strong>
     <small>{fill(medicinesWords.prescribe.checkResult, { outcome: outcomeLabel(p.prescribeCheckOutcomeCode) })}</small></span>
    <span className="dp-row-state"><Badge variant={stateOf(p) === 'prescribed' ? 'warning' : 'neutral'}>{stateLabel(stateOf(p))}</Badge></span>
   </li>)}</ol> : <Empty title="Nothing prescribed in this session">A prescription written below is listed here by its reference and its state. It is never listed as issued: a pharmacist who is not you verifies it next.</Empty>}
   <p className="dp-note">{outcomeReason('not-checked')}</p>
  </div>
 </section>;
}

/* ---- Test results ----------------------------------------------------------------------------------
   The strip the export draws above its results inbox, counted off the Medicines store the results screen
   below writes to. No value: a result is a reference here, and read in the Health Passport. */
export function DoctorResultsStrip() {
 const s = useMedicines();
 const mine = s.results.filter(r => r.responsibleRef === DOCTOR);
 const open = s.orders.filter(o => labStateOf(o) !== 'closed');
 return <>
  <Head title={medicinesWords.results.heading} intro={medicinesWords.results.intro}/>
  <Strip label="Your results, counted" figures={[
   { label: 'To acknowledge', value: String(mine.filter(r => r.acknowledgedAt === null).length), trend: 'Ordered by you, not yet acknowledged' },
   { label: 'Acknowledged', value: String(mine.filter(r => r.acknowledgedAt !== null).length), trend: 'By your own press, on this screen' },
   { label: 'Orders open', value: String(open.length), trend: `Of ${s.orders.length} ordered in this session` }
  ]}/>
 </>;
}

/* ---- Referrals ----------------------------------------------------------------------------------------
   Across patients, open to this doctor and never protected. The export's "median wait" and "response
   due" are not drawn: a referral here holds the day it was written and a status, and no day it was
   answered, so there is no wait to work out. */
export function DoctorReferralsList() {
 const rows = patients.flatMap(p => p.referrals.filter(listable).map(r => ({ r, patient: p })));
 const accepted = rows.filter(({ r }) => r.status.startsWith('Accepted')).length;
 return <section className="dp-page" aria-labelledby="dp-referrals">
  <Head title="Referrals" intro="Every referral on your patients’ files, and where a case can go from here."/>
  <Strip label="The referrals, counted" figures={[
   { label: 'Referrals on file', value: String(rows.length), trend: `Across ${new Set(rows.map(({ patient }) => patient.id)).size} of ${patients.length} files` },
   { label: 'Accepted', value: String(accepted), trend: `${rows.length - accepted} not accepted yet` },
   { label: 'Routine', value: String(rows.filter(({ r }) => r.urgency === 'Routine').length), trend: `${rows.filter(({ r }) => r.urgency !== 'Routine').length} marked otherwise` }
  ]}/>
  <div className="dp-panel">
   <div className="dp-panel-head"><h2>On file</h2><span>{rows.length}</span></div>
   {rows.length ? <ol className="dp-list">{rows.map(({ r, patient }) => <li key={r.id} className="dp-row">
    <span className="dp-row-mark" aria-hidden="true"><Send size={18}/></span>
    <span className="dp-row-what"><span className="dp-row-ref">{r.id} · {shortDate(r.at)}</span><strong>{patient.name} → {r.to}</strong><small>{r.reason} · {r.urgency} · {r.by}</small></span>
    <span className="dp-row-state"><Badge variant={r.status.startsWith('Accepted') ? 'success' : 'neutral'}>{r.status}</Badge></span>
   </li>)}</ol> : <Empty title="No referral is open to you">Referrals exist on these files; none of them is one you may read.</Empty>}
   <p className="dp-note">No waiting time is worked out. A referral here holds the day it was written and where it went, and not the day it was answered.</p>
   <p className="dp-note">{PROTECTED_LEFT_OUT}</p>
  </div>
 </section>;
}

/* ---- Reports and Resources ------------------------------------------------------------------------
   Two index pages. The export's reports were productivity figures nobody counted ("78% follow-up
   adherence") and its resources were dated guides that do not exist; what is drawn is what can be
   counted and the doors to where it lives. */
type Door = { id: string; label: string; says: string; icon: typeof ArrowRight };
function Doors({ doors, go }: { doors: readonly Door[]; go?: (id: string) => void }) {
 return <ol className="dp-list">{doors.map(d => <li key={d.id}>
  <button className="dp-row" onClick={() => go?.(d.id)} disabled={!go}>
   <span className="dp-row-mark" aria-hidden="true"><d.icon size={18}/></span>
   <span className="dp-row-what"><strong>{d.label}</strong><small>{d.says}</small></span>
   <span className="dp-row-state"><ArrowRight size={18} aria-hidden="true"/></span>
  </button>
 </li>)}</ol>;
}

export function DoctorReports({ go }: { go?: (id: string) => void }) {
 useClinical();
 const histories = useSettingsHistories();
 const fees = useMemo(() => doctorFeesFor(DOCTOR_ID, doctorFeeNow), [histories]);
 const inbox = inboxNow();
 const today = clinicalDay(Date.now());
 const signedToday = inbox.ok ? inbox.rows.filter(r => r.signedAt !== null && r.signedAt !== undefined && clinicalDay(r.signedAt) === today).length : 0;
 const filed = patients.flatMap(p => p.consultations.filter(listable)).length;
 return <section className="dp-page" aria-labelledby="dp-reports">
  <Head title="Reports" intro="What can be counted about your work, and where each count lives. Nothing here is a rate, a percentage or a comparison with anybody."/>
  <Strip label="Your work, counted" figures={[
   { label: 'Cases recorded for a fee', value: String(fees.cases.length), trend: 'The rows on Per-case fees' },
   { label: 'Reviews signed today', value: String(signedToday), trend: `Of ${inbox.ok ? inbox.rows.length : 0} in the clinical inbox` },
   { label: 'Records on file', value: String(filed), trend: 'On your patients’ files, on Consultation records' }
  ]}/>
  <Doors go={go} doors={[
   { id: 'Per-case fees', label: 'Per-case fees', says: `${fees.cases.length} cases, and the fee each was signed under`, icon: Receipt },
   { id: 'Claim draft', label: 'Claim draft', says: 'A claim for a visit whose review you signed, stopped before it is sent', icon: FileText },
   { id: 'Consultation records', label: 'Consultation records', says: 'Every record you may read, and the sections each one holds', icon: ClipboardList }
  ]}/>
  <p className="dp-note">No follow-up adherence, completion rate or monthly total is drawn. Nothing in this preview counts one, and a percentage nobody can check against a list is the one kind of figure a clinical screen must not carry.</p>
 </section>;
}

export function DoctorResources({ go }: { go?: (id: string) => void }) {
 const drafts = protocolsContract.protocols.filter(p => p.status === 'draft');
 /* A preview pathway is a draft that cites a contract section (protocols.json _previewPathways), so "with no
    content" is said of the drafts whose contentRef is null and of no others. */
 const empty = drafts.filter(p => p.contentRef === null).length;
 const citing = drafts.length - empty;
 return <section className="dp-page" aria-labelledby="dp-resources">
  <Head title="Resources" intro="The reference material this workspace holds, and where each piece is read."/>
  <Strip label="The references, counted" figures={[
   { label: 'Protocols in the registry', value: String(protocolsContract.protocols.length), trend: citing ? `${drafts.length} of them draft: ${empty} with no content, ${citing} a preview pathway citing a contract` : `${drafts.length} of them draft, with no content` },
   { label: 'Reference ranges', value: String(observations.length), trend: 'Indicative adult ranges, one copy of each' },
   { label: 'Triage stages', value: String(triageStages.length), trend: 'Named, and none of them run' }
  ]}/>
  <Doors go={go} doors={[
   { id: 'Protocols', label: 'The protocol registry and the reference ranges', says: `${protocolsContract.protocols.length} protocols and ${observations.length} ranges, on the Protocols page`, icon: BookOpen },
   { id: 'Referral pathway', label: 'Where a case can go', says: 'The referral pathway and the referrals on your patients’ files', icon: Route },
   { id: 'Triage', label: 'Triage and guidance', says: `${triageStages.length} stages, and the answer given while none is ratified`, icon: ShieldCheck },
   { id: 'Schedule', label: 'Your day', says: 'The visits the sandbox holds for you today', icon: CalendarDays }
  ]}/>
  <p className="dp-note">No guide, patient leaflet or learning module is listed. None has been written and reviewed, and a list of titles with dates on them would say otherwise.</p>
 </section>;
}
