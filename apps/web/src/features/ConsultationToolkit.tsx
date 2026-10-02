import { Suspense, lazy, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import {
 Activity, ArrowLeft, ArrowRight, Ban, BookOpen, ClipboardPlus, FilePen, FileSignature, FileText, FolderOpen, House, Lock, NotebookPen,
 PhoneCall, Pill, Route, Send, Stethoscope, TestTube, Video, type LucideIcon
} from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { EmptyNote } from '../components/UI';
import { Alert, Button } from '../ui';
import { subjectById } from '../lib/vetting-fixtures';
import { roleOf } from '../lib/roles';
import { clinicalLimits, media, participants, ruleById } from '../lib/teleconsult';
import { handOver, preview as carePreview, sentences as careSentences, stages as careStages, useCareVisit } from '../lib/care-visit';
import {
 fileOf, fill, gates, refusalsOn, refusedOn, stateOf, stateWord, surfaceById, toolsOf, words,
 type CallState, type SurfaceId, type Tool, type ToolState
} from '../lib/consultation-toolkit';
import { ConsultationComposer, type ConsultationDraft } from './Consultation';
import { DoctorPrescribe, LabResults } from './Medicines';
import { ClinicalProtocols, ReferralLetter, VisitAssessment } from './Clinical';
import { PatientFile } from './PatientFile';
import './consultation-toolkit.css';
/* The board and the cases arrive when their tool is first opened, not with the toolkit. */
const CallSummary = lazy(() => import('./CallSummary').then(m => ({ default: m.CallSummary })));
const LiveVitalsBoard = lazy(() => import('./LiveVitals').then(m => ({ default: m.LiveVitalsBoard })));
const LiveVitalsPanel = lazy(() => import('./LiveVitals').then(m => ({ default: m.LiveVitalsPanel })));
const NurseCases = lazy(() => import('./CaseFile').then(m => ({ default: m.NurseCases })));
/* The sick note is packages/catalog/sick-note.json's own composer, with its own refusals: a nurse, a lapsed
   registration, a call with nobody in the room, a consultation that has not happened, too many days. */
const SickNoteComposer = lazy(() => import('./SickNote').then(m => ({ default: m.SickNoteComposer })));

/* The consultation toolkit — the founder's ask of 2 October 2026: the live devices in front of the nurse and the
 * doctor while they consult, and every tool they need linked on the consultation screen itself, notes, sick
 * notes and referrals among them.
 *
 * WHAT IT IS. One place on the call, the record and the visit where a clinician reaches every tool without
 * leaving: the thing they came to the screen for is first — the call, the record, the visit — and each tool is a
 * panel that opens in its place, with the way back at the top of it. Every tool is the screen that already
 * existed, embedded rather than rebuilt, so each keeps its own refusals and its own capability notice; the order,
 * the names and every sentence here are packages/catalog/consultation-toolkit.json's, and what each tool says to
 * this clinician right now is lib/consultation-toolkit.ts's join of the vetting register and the line.
 *
 * WHY A PANEL IN PLACE, AND KEPT. A tool opens where the call was rather than over it, because the composer and
 * the prescription are wide forms that a 21rem rail cannot hold. Once opened, a tool stays mounted and is hidden
 * rather than unmounted, so a half-written note survives a look back at the call — the call itself never stops,
 * because its state lives in the screen that hosts this one. While a tool is open its head carries the line in
 * words, and a dropped line in a warning, because the countdown is on the call and the doctor is not.
 *
 * WIDE AND NARROW. The layout is decided by the toolkit's own width, not the window's: the nurse's visit is a
 * dialog five hundred pixels wide on any screen. Wide, the tools are a list beside the work with the patient and
 * the devices under them; narrow, the tools are a grid of short names above the work and the devices under it.
 * Both orders are the reading order, so nothing is moved by CSS that a keyboard would meet somewhere else.
 *
 * WHAT IS REFUSED, AND WHERE. A tool the register does not let this clinician use is listed, and opens to the
 * register's own sentence and nothing else — a control that vanished would teach nobody why. A nurse's
 * surface lists no prescription and no sick note at all: the contract says where the doctor's tools would be,
 * in its own sentences, that they are a doctor's on MyThuso. Nothing here sends, books, prescribes or certifies.
 *
 * Behind a dynamic import from the call, the record and the visit, so none of it is on a patient's first view. */

type Level = 'h2' | 'h3' | 'h4';
const icons: Record<string, LucideIcon> = {
 call: PhoneCall, record: FileText, visit: House, devices: Activity, notes: NotebookPen, 'nurse-notes': NotebookPen, prescribe: Pill,
 tests: TestTube, refer: Route, 'sick-note': FileSignature, context: FolderOpen, protocols: BookOpen, assessment: ClipboardPlus,
 case: Stethoscope, 'call-doctor': Video, 'refer-to-doctor': Send
};
const iconOf = (id: string) => icons[id] ?? FilePen;
const alertFor: Record<Exclude<ToolState['kind'], 'open'>, 'info' | 'warning' | 'danger'> = { pending: 'info', withheld: 'danger', closed: 'danger', room: 'danger', waiting: 'warning' };

export type ToolkitProps = {
 surface: SurfaceId;
 /** The clinician on the screen, by vetting register id. Every tool's answer is asked of the register for them. */
 subjectId: string;
 reference: string;
 patient: string;
 /** What the clinician came to the screen to do: the call, the record or the visit. Always first, never unmounted. */
 home: ReactNode;
 /** Beside the work on a wide screen and under it on a narrow one. The patient's devices when nothing is given. */
 aside?: ReactNode;
 /** The call, for the tools that decide something. Null on a record or a visit. */
 call?: CallState | null;
 /** The line in words, and what the doctor sees when it has dropped — carried on every open tool's head. */
 homeStatus?: { text: string; urgent?: string };
 /** What the notes open seeded with, and the line the consultation was held on beside them. */
 seed?: ConsultationDraft;
 line?: ReactNode;
 /** The open tool, when the host needs to choose it — the call's "Write it up" opens the notes. */
 tool?: string;
 onTool?: (id: string) => void;
 level?: Level;
};

export function ConsultationToolkit({ surface: surfaceId, subjectId, reference, patient, home, aside, call = null, homeStatus, seed, line, tool: chosen, onTool, level = 'h2' }: ToolkitProps) {
 const surface = surfaceById(surfaceId);
 const subject = subjectById(subjectId)!;
 const tools = toolsOf(surface);
 const refused = refusedOn(surface);
 const [own, setOwn] = useState(surface.home.id);
 const current = chosen ?? own;
 /* Every tool opened so far stays mounted, hidden while another is in front, so nothing written in one is lost
    by looking at another. */
 const [opened, setOpened] = useState<string[]>([surface.home.id]);
 const [focusOnOpen, setFocusOnOpen] = useState(false);
 const id = useId();
 const Heading = level;
 const homeButton = useRef<HTMLButtonElement>(null);
 useEffect(() => { if (!opened.includes(current)) setOpened(list => [...list, current]); }, [current, opened]);
 const select = (next: string) => {
  setFocusOnOpen(next !== surface.home.id);
  if (onTool) onTool(next); else setOwn(next);
  if (next === surface.home.id) requestAnimationFrame(() => homeButton.current?.focus());
 };
 const back = () => select(surface.home.id);
 const states = new Map(tools.map(t => [t.id, stateOf(t, subject, call)]));

 return <div className="ctk" data-surface={surface.id} data-role={surface.role}>
  <div className="ctk-grid">
   <nav className="ctk-tools" aria-labelledby={`${id}-tools`}>
    <Heading className="ctk-tools-title" id={`${id}-tools`}>{surface.heading}</Heading>
    <ul className="ctk-tool-list">
     <li><ToolButton ref={homeButton} id={surface.home.id} name={surface.home.name} short={surface.home.short} current={current === surface.home.id}
      controls={`${id}-panel-${surface.home.id}`} onClick={() => select(surface.home.id)} home/></li>
     {tools.map(t => <li key={t.id}><ToolButton id={t.id} name={t.name} short={t.short} state={states.get(t.id)!} current={current === t.id}
      controls={`${id}-panel-${t.id}`} onClick={() => select(t.id)}/></li>)}
    </ul>
   </nav>

   <div className="ctk-main">
    <div className="ctk-panel is-home" id={`${id}-panel-${surface.home.id}`} hidden={current !== surface.home.id}>{home}</div>
    {tools.filter(t => opened.includes(t.id) || current === t.id).map(t =>
     <ToolPanel key={t.id} id={`${id}-panel-${t.id}`} tool={t} state={states.get(t.id)!} current={current === t.id} focus={focusOnOpen && current === t.id}
      level={level} homeName={surface.home.name} back={back} reference={reference} patient={patient} subjectName={subject.name} subjectReference={subject.reference} homeStatus={homeStatus}>
      <ToolBody tool={t} state={states.get(t.id)!} surface={surfaceId} subjectId={subjectId} reference={reference} patient={patient} call={call}
       seed={seed} line={line} back={back} select={select} level={level}/>
     </ToolPanel>)}
    <section className="ctk-rules" aria-labelledby={`${id}-rules`}>
     <Heading className="ctk-subhead" id={`${id}-rules`}>{words.rulesHeading}</Heading>
     <ul>{refusalsOn(surface).map(r => <li key={r.id} data-refusal={r.id}><Ban aria-hidden="true"/><p>{r.sentence}</p></li>)}</ul>
    </section>
   </div>

   <div className="ctk-side">
    {/* The devices once, never twice: the aside's panel steps aside while the full board is the open tool, so two
        clocks are never counting the same patient's readings differently on one screen. */}
    {current !== 'devices' && <div className="ctk-aside">{aside ?? <section className="ctk-devices" aria-label={words.summaryHeading}>
     <Suspense fallback={null}><CallSummary patient={patient} rule="" readings={false}/><LiveVitalsPanel subject={patient} level={level === 'h2' ? 'h3' : 'h4'}/></Suspense></section>}</div>}
    {refused.length > 0 && <section className="ctk-refused" aria-labelledby={`${id}-refused`}>
     <Heading className="ctk-subhead" id={`${id}-refused`}>{words.refusedHeading}</Heading>
     <ul>{refused.map(r => <li key={r.tool.id} data-refused={r.tool.id}><Lock aria-hidden="true"/><p><strong>{r.tool.name}.</strong> {r.sentence}</p></li>)}</ul>
    </section>}
   </div>
  </div>
 </div>;
}

/* One tool in the list: its name on a wide toolkit and its short name on a narrow one, the full name always in the
   accessible name so the short one a person sees is a part of what a screen reader says. A tool that is not open
   says why in a word, beside a lock — never by colour alone. */
type ToolButtonProps = { id: string; name: string; short: string; state?: ToolState; current: boolean; controls: string; onClick: () => void; home?: boolean };
const ToolButton = ({ ref, id, name, short, state, current, controls, onClick, home }: ToolButtonProps & { ref?: Ref<HTMLButtonElement> }) => {
 const Icon = iconOf(id);
 const shut = state && state.kind !== 'open';
 return <button ref={ref} type="button" className={`ctk-tool${current ? ' is-current' : ''}${home ? ' is-home' : ''}${shut ? ' is-shut' : ''}`}
  aria-current={current ? 'true' : undefined} aria-controls={controls} data-tool={id} onClick={onClick}>
  <Icon className="ctk-tool-icon" aria-hidden="true"/>
  <span className="ctk-tool-say">
   <span className="ctk-tool-name">{name}</span>
   <span className="ctk-tool-short" aria-hidden="true">{short}</span>
   {shut && <span className="ctk-tool-state"><Lock aria-hidden="true"/><span>{stateWord[state.kind as Exclude<ToolState['kind'], 'open'>]}</span></span>}
  </span>
 </button>;
};

type PanelProps = {
 id: string; tool: Tool; state: ToolState; current: boolean; focus: boolean; level: Level; homeName: string; back: () => void;
 reference: string; patient: string; subjectName: string; subjectReference: string; homeStatus?: { text: string; urgent?: string }; children: ReactNode;
};
function ToolPanel({ id, tool, state, current, focus, level, homeName, back, reference, patient, subjectName, subjectReference, homeStatus, children }: PanelProps) {
 const Heading = level;
 const title = useRef<HTMLHeadingElement>(null);
 const Icon = iconOf(tool.id);
 /* Arriving at a tool moves the reader to its name, so a screen reader hears where it is and a phone scrolls to it. */
 useEffect(() => { if (current && focus) title.current?.focus(); }, [current, focus]);
 const backTo = fill(words.backTo, { home: homeName.charAt(0).toLowerCase() + homeName.slice(1) });
 return <section className="ctk-panel" id={id} hidden={!current} aria-labelledby={`${id}-title`} data-panel={tool.id}>
  <header className="ctk-panel-head">
   <Button variant="secondary" size="sm" className="ctk-back" leadingIcon={<ArrowLeft aria-hidden="true"/>} onClick={back}>{backTo}</Button>
   {homeStatus && <p className="ctk-line"><PhoneCall aria-hidden="true"/><span>{homeStatus.text}</span></p>}
  </header>
  {homeStatus?.urgent && <Alert variant="warning" className="ctk-urgent" title={homeStatus.urgent}/>}
  <div className="ctk-panel-title">
   <span className="ctk-panel-mark" aria-hidden="true"><Icon/></span>
   <div>
    <Heading id={`${id}-title`} ref={title} tabIndex={-1}>{tool.name}</Heading>
    <p className="ctk-panel-for">{fill(words.forPatient, { patient, reference })}</p>
   </div>
  </div>
  <p className="ctk-panel-summary">{tool.summary}</p>
  {tool.capability && <p className="ctk-asked">{fill(words.askedOf, { name: subjectName, reference: subjectReference })}</p>}
  {state.kind !== 'open' && <Alert variant={alertFor[state.kind]} className="ctk-state" title={state.reason}/>}
  {tool.honesty.drawnBy === 'toolkit' && <NotConnected of={tool.honesty.capability} tone="inline"/>}
  {children}
 </section>;
}

type BodyProps = {
 tool: Tool; state: ToolState; surface: SurfaceId; subjectId: string; reference: string; patient: string; call: CallState | null;
 seed?: ConsultationDraft; line?: ReactNode; back: () => void; select: (id: string) => void; level: Level;
};
/* The screen each tool already was. A refused tool draws none of it; a tool waiting for the line keeps what is
   written in it, inert, so the doctor's draft is there when the line comes back. */
function ToolBody(props: BodyProps) {
 const { state } = props;
 if (state.kind !== 'open' && state.kind !== 'waiting') return null;
 return <div className="ctk-panel-body" inert={state.kind === 'waiting'}><Body {...props}/></div>;
}

function Body({ tool, surface, subjectId, reference, patient, call, seed, line, back, select, level }: BodyProps) {
 const subject = subjectById(subjectId)!;
 switch (tool.id) {
  case 'devices': return <Suspense fallback={null}><LiveVitalsBoard subject={patient} patient={patient} level={level === 'h2' ? 'h3' : 'h4'}/></Suspense>;
  case 'notes': return <CallNotes reference={reference} patient={patient} writer={subjectId} seed={seed} line={line} call={call} back={back}/>;
  case 'nurse-notes': return <ConsultationComposer reference={reference} patient={patient} writer={subjectId} onClose={back}/>;
  case 'prescribe': return <DoctorPrescribe/>;
  case 'tests': return <LabResults/>;
  case 'sick-note': return <Suspense fallback={null}><SickNoteComposer reference={reference} patient={patient} writer={subjectId} onClose={back}/></Suspense>;
  case 'refer': return <ReferralLetter reference={reference} patient={patient} doctor={subject.name} registration={subject.reference} reason="" onClose={back}/>;
  case 'context': {
   const file = fileOf(patient);
   /* The file's own actions open this toolkit's tools rather than a dialog over the call: a prescription asked for
      from the file is the Prescribe tool, for the same patient. */
   const opens: Record<string, string> = { 'Consultation record': surface === 'teleconsult' ? 'notes' : 'home', Prescribing: 'prescribe', 'Referral letter': 'refer' };
   return file ? <PatientFile patientId={file.id} open={modal => { const to = opens[modal.split(' · ')[0]]; if (to) select(to === 'home' ? surfaceById(surface).home.id : to); }}/>
    : <><NotConnected of="clinical-records" tone="inline"/><EmptyNote>{fill(gates.notOnFile, { patient })}</EmptyNote></>;
  }
  case 'protocols': return <ClinicalProtocols/>;
  case 'assessment': return <VisitAssessment reference={reference} patient={patient} onClose={back}/>;
  case 'case': return <Suspense fallback={null}><NurseCases/></Suspense>;
  case 'call-doctor': return <CallADoctorIn level={level}/>;
  case 'refer-to-doctor': return <HandToADoctor/>;
  default: return null;
 }
}

/* The doctor's notes on a call: the consultation record, seeded with what the call established, written while
   the line is open and signed only once the call has ended as a consultation. Off a call, it signs as ever. */
function CallNotes({ reference, patient, writer, seed, line, call, back }:
 { reference: string; patient: string; writer: string; seed?: ConsultationDraft; line?: ReactNode; call: CallState | null; back: () => void }) {
 const [refused, setRefused] = useState(false);
 const open = !!call && !call.ended;
 return <>
  {open && <Alert variant={refused ? 'danger' : 'info'} className="ctk-state" title={gates.notesDuringCall}/>}
  <ConsultationComposer reference={reference} patient={patient} writer={writer} seed={seed} line={line} onClose={back}
   onSign={open ? () => { setRefused(true); return false; } : undefined}/>
 </>;
}

/* Calling a doctor into the room, from the nurse's side: where she stands, what she sees and hears, and what a
   doctor may do with her there — the teleconsultation's own words. Nothing here calls anybody, and the
   capability notice above says so. */
function CallADoctorIn({ level }: { level: Level }) {
 const nurse = participants.find(p => p.id === 'nurse')!;
 const Sub = (level === 'h2' ? 'h3' : level === 'h3' ? 'h4' : 'h5') as 'h3' | 'h4' | 'h5';
 return <div className="ctk-call-in">
  <section className="tcx-video-preview" aria-label="Doctor video preview">
   <div className="tcx-video-person"><Video size={36} aria-hidden="true"/><Sub>Doctor consultation</Sub><p>{media.sentence}</p></div>
   <div className="tcx-video-caption">Consultation room · simulated</div>
  </section>
  <dl className="ctk-facts">
   <div><dt>{words.callDoctorWhere}</dt><dd>{nurse.where}</dd></div>
   <div><dt>{words.callDoctorSees}</dt><dd>{nurse.sees}</dd></div>
   <div><dt>{words.callDoctorHears}</dt><dd>{nurse.hears}</dd></div>
  </dl>
  <Sub className="ctk-subhead">{words.callDoctorLimits}</Sub>
  <ul className="ctk-limits">{clinicalLimits.map(l => <li key={l.id}><strong>{l.name}</strong><span>{l.detail}</span></li>)}</ul>
  <p className="ctk-rule">{ruleById('the-nurse-is-the-examination').sentence}</p>
 </div>;
}

/* The visit, handed to the doctors' review queue — the Care engine's own act and refusal, the same one the visit's
   handover stage presses. It opens only at that stage: pressed earlier it would skip the readings the handover is
   made against, so before then it says where the visit is. */
function HandToADoctor() {
 const view = useCareVisit();
 const visit = view.visit;
 const stageName = careStages.find(s => s.id === view.stage)?.name ?? view.stage;
 if (visit?.handover) return <p className="ctk-done" role="status"><Send aria-hidden="true"/>{careSentences.queued}</p>;
 if (view.stage !== 'handover') return <EmptyNote>{fill(gates.notYetAtHandover, { stage: stageName })}</EmptyNote>;
 const refusal = view.refusal?.act === 'handover' ? view.refusal.statement : null;
 return <div className="ctk-hand">
  {refusal && <p className="nurse-refusal" role="alert">{refusal}</p>}
  <div className="button-row"><Button variant="primary" onClick={handOver} trailingIcon={<ArrowRight aria-hidden="true"/>}>{stageName}</Button></div>
 </div>;
}

/* ---- The record, with its tools ----------------------------------------------------------------------------
   The doctor's Consultation records page: the composer is home, the tools beside it, the devices once in the
   toolkit's aside rather than again in the composer's rail. Exported whole so the workspace's hunk is one line. */
export function RecordWithTools({ title, reference = 'TH-2048', patient = 'Lerato Molefe' }: { title?: string; reference?: string; patient?: string }) {
 return <ConsultationToolkit surface="consultation-record" subjectId={roleOf('doctor').subjectId ?? ''} reference={reference} patient={patient}
  home={<ConsultationComposer reference={reference} patient={patient} title={title}/>}/>;
}

/* ---- The visit, with its tools -----------------------------------------------------------------------------
   The nurse's visit from its checklist onwards: her own tools and the patient's devices, and a doctor's tools
   said where they would be. The visit is named by its reference, never by a name the build does not hold. */
export function VisitWithTools({ home }: { home: ReactNode }) {
 return <ConsultationToolkit surface="care-visit" subjectId={carePreview.clinicianRef} reference={carePreview.appointmentRef} patient={carePreview.subjectRef}
  home={home} level="h4"/>;
}
