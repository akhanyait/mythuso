import framing from '../../../../packages/catalog/framing.json' with { type: 'json' };
import { useEffect, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Bluetooth, BookOpen, CalendarDays, ClipboardPlus, CreditCard, FileText, FlaskConical, LogOut, Package, Radar, Repeat, ShieldAlert, ShieldCheck, Siren, Truck, Video } from 'lucide-react';
import { Modal, SectionTitle } from '../components/UI';
import { Metric, Metrics, NavRow } from '../surface/Surface';
import '../surface/clinical.css';
/* The clinical feature screens' own sheet. It used to be imported by the staff and admin entries,
   which no longer exist: this shell is reached by a dynamic import now, so both sheets travel in
   that chunk and a patient never downloads either. */
import '../surface/clinical-screens.css';
import { NurseSchedule, ReviewQueue, nurseDayCounts, reviewQueueCounts, roleExtras, sectionDoor, sectionWorkflow } from '../features/Workspaces';
import { useVisitQueue } from '../features/VisitQueue';
import type { Part } from '../lib/visit-queue';
import { DispatchBoard, IncidentBoard, QualityBoard, controlTowerCounts } from '../features/Dispatch';
import { FulfilmentQueue, partnerCounts } from '../features/Fulfilment';
import { ClinicalProtocols, ReferralLetter, ReferralPathway, VisitAssessment, DoctorReview } from '../features/Clinical';
import { Academy, LocumShifts } from '../features/NurseTools';
import { ThusoKit } from '../features/Kit';
import { Earnings, earningsSummary, rand } from '../features/Earnings';
import { Dispensing } from '../features/Dispensing';
import { Programmes } from '../features/Programmes';
import { Teleconsult } from '../features/Teleconsult';
import { ConsultationComposer, ConsultationRecord } from '../features/Consultation';
import { PatientFile, PrescribingRoute, UploadDocument } from '../features/PatientFile';
import { LabOrderDetail, PrescriptionDetail } from '../features/Orders';
import { IncidentDetail, NurseVetting } from '../features/Dispatch';
import { VettingApplication, VettingQueue } from '../features/Vetting';
import { t } from '../lib/i18n';
import { endSession } from '../lib/auth';
import { subjectsByRole } from '../lib/vetting-fixtures';
import { scrollToTop } from '../lib/scroll';
import { cycle } from '../lib/earnings';

/* MyThuso for clinicians — its own application, not the patient app with different navigation.
 *
 * The nurse's schedule used to render inside the patient shell: her sections in the patient's
 * sidebar, above the patient's help card, under the patient's location picker, beside a profile
 * button that said Lerato Molefe. It read as broken because it was broken — a clinician was looking
 * at somebody else's chrome. Splitting it into its own entry is what fixes the appearance, and the
 * appearance was only ever the visible half: a patient on a mid-range phone was also downloading
 * the dispatch board and the vetting queue to look at their own visits.
 *
 * Three things this shell does that the old one could not:
 *
 * It knows who is signed in. The name, the register and the registration number in the sidebar come
 * from the vetting fixtures, so the credential state beside them is arithmetic against the same
 * record the dispatch board gates on rather than a label somebody typed.
 *
 * It has no workspace switcher. A role is what an account carries; the only way out of a workspace
 * is to sign out of it.
 *
 * It has no patient chrome. No location picker, no help card, no wallet, no breadcrumb reading
 * "Your care", nothing addressed to somebody booking a visit.
 */

type Section = { readonly id: string; readonly short: string; readonly icon: typeof CalendarDays };
type WorkspaceDef = { readonly subjectId: string; readonly sections: readonly Section[] };

/* Each role's first section is the thing it opens the app to do. A nurse opens it for today's
   visits; the Control Tower opens it for the board. Nothing here leads with a catalogue. */
const workspaces = {
 Nurse: { subjectId: 'N-205', sections: [
  { id: 'Schedule', short: 'Schedule', icon: CalendarDays },
  { id: 'Assessments', short: 'Assess', icon: ClipboardPlus },
  { id: 'Thuso Kit', short: 'Kit', icon: Bluetooth },
  { id: 'Earnings & payouts', short: 'Earnings', icon: CreditCard },
  { id: 'Vetting', short: 'Vetting', icon: ShieldCheck }
 ] },
 Doctor: { subjectId: 'D-401', sections: [
  { id: 'Review queue', short: 'Queue', icon: FileText },
  { id: 'Teleconsultation', short: 'Consult', icon: Video },
  { id: 'Patient context', short: 'Patient', icon: Activity },
  { id: 'Consultation records', short: 'Records', icon: ClipboardPlus },
  { id: 'Protocols', short: 'Protocols', icon: BookOpen }
 ] },
 Partner: { subjectId: 'P-501', sections: [
  { id: 'Orders', short: 'Orders', icon: Package },
  { id: 'Substitution & repeats', short: 'Repeats', icon: Repeat },
  { id: 'Collections', short: 'Collections', icon: Truck },
  { id: 'Results', short: 'Results', icon: FlaskConical }
 ] },
 'Control Tower': { subjectId: 'O-801', sections: [
  { id: 'Dispatch', short: 'Dispatch', icon: Radar },
  { id: 'Incidents', short: 'Incidents', icon: Siren },
  { id: 'Vetting queue', short: 'Vetting', icon: ShieldCheck },
  /* Employer programmes is not a fifth entry: features/Pages.tsx already lists it among this
     role's More tools, and two doors into one screen is how a navigation starts disagreeing with
     itself about what the sections are. */
  { id: 'Quality', short: 'Quality', icon: BarChart3 }
 ] }
} as const satisfies Record<string, WorkspaceDef>;

export type StaffRole = keyof typeof workspaces;
export const staffRoles = Object.keys(workspaces) as StaffRole[];

/* How a name is shortened is a rule about names rather than about this sidebar, and lib/roster.ts
   needs the same one. It moved to lib/names.ts, re-exported here so every existing reader keeps
   working — a module in lib importing this shell closed the import graph and left the dispatch board
   reading a roster that had not been built yet. `whoIs` went the same way, to lib/roles.ts, for the
   same reason wearing different clothes: the back office imported it from here, so opening a finance
   console downloaded a dispatch board. */
import { initialsOf } from '../lib/names';
import { openingLine, whoIs, type ClinicalWorkspaceId } from '../lib/roles';
import { DemoBar, useRole } from '../features/DemoLogin';
/* The door in lib/roles.ts names these four as well, and cannot import this file to check — doing so
   would pull the clinical bundle into the entry that exists to defer it. So the agreement is checked
   here instead, at compile time and in both directions: a fifth workspace added above, or a name
   changed on either side, stops the build rather than producing a role the door cannot open. */
const _workspacesMatchTheDoor: Record<ClinicalWorkspaceId, WorkspaceDef> = workspaces;
const _theDoorMatchesTheWorkspaces: Record<StaffRole, unknown> = _workspacesMatchTheDoor;
void _theDoorMatchesTheWorkspaces;
export { initialsOf };
const signedInAs = (role: StaffRole) => whoIs(workspaces[role].subjectId, 'Dispatch is withdrawn until this is put right.');

/* There is no door in front of this any more.
 *
 * There used to be: a sign-in screen that said there are no accounts to sign in to, and then asked
 * which of four workspaces you wanted anyway. It was honest and it was a wall drawn on a doorway.
 * The choice is the door now — features/DemoLogin.tsx, in the bar at the top of every shell — and
 * the sentence that screen carried moved there with it rather than being dropped, because a screen
 * that stops speaking is the disclosure failure capabilities.json exists to refuse.
 *
 * What this module exports is therefore a workspace and not an application: the role is decided
 * above it, and this file's whole job is to draw one. */

/* ---- The workspace ----------------------------------------------------------------------------- */
export default function StaffWorkspace({ role }: { role: StaffRole }) {
 const { sections } = workspaces[role];
 const [section, setSection] = useState<string>(sections[0].id);
 const [modal, setModal] = useState<string | null>(null);
 const who = signedInAs(role);
 const go = (id: string) => { setSection(id); scrollToTop(); };
 const home = () => go(sections[0].id);
 useEffect(() => { document.title = `${section} · ${role} · MyThuso`; }, [section, role]);
 /* Leaving a workspace lands on the patient application, because that is what this address means
    without a role on it. It is not a sign-out — there was never a session to end beyond whatever the
    identity service holds, which is identity and never a role — so it does not say one. */
 const { setRole } = useRole();
 const leave = () => { void endSession(); setRole('patient'); };
 /* Suspended is not a badge here, it is the first thing on the screen. A clinician whose clearance
    lapsed overnight needs to be told before she reads a schedule she is no longer dispatchable
    against — the arithmetic is in lib/vetting, and this is where it becomes a sentence. */
 const stopped = who.stopped;
 return <div className="app-shell clinical aurora">
  <a href="#main" className="skip-link">{t('shell.skip', 'en-ZA')}</a>
  <aside className="sidebar">
   <button className="brand" onClick={home}><img src="/brand/mythuso-logo.svg" alt="MyThuso"/></button>
   <div className="staff-id">
    <span className="avatar small">{who.initials}</span>
    <span><strong>{who.subject.name}</strong><small>{who.roleName} · {who.subject.reference}</small></span>
   </div>
   <p className={`staff-credential ${stopped ? 'stop' : who.state.status === 'expiring' ? 'due' : ''}`}>
    {stopped ? <ShieldAlert size={15}/> : <ShieldCheck size={15}/>}<span>{who.credential}</span>
   </p>
   {/* Not the role name: the identity block above already says which register this person is on,
       and the heading in the main column says it again. Three of the same word on one screen is
       what a label costs when it is chosen for symmetry rather than for a reader. */}
   <div className="nav-label">WORKSPACE</div>
   {/* Pill rows, and the one you are on is a filled charcoal pill with the trailing circle
       inverted. A plain list of rows with a tinted active state told a reader which entry was
       selected; the pill tells them where they are, which is the thing a workspace has to say
       before anything else on the screen means anything. */}
   <nav className="s-nav" aria-label="Main navigation">{sections.map(({ id, icon: Icon }) =>
    <NavRow key={id} icon={<Icon size={19} strokeWidth={1.8}/>} label={id} current={section === id} onClick={() => go(id)}/>)}</nav>
   <div className="sidebar-bottom">
    {/* No help card, no wallet, no language picker. The shell strings a picker would switch are the
        patient's navigation, and clinical wording is never translated at all — lib/i18n.ts is where
        that rule lives. A control that changes nothing while claiming access is worse than none. */}
    <button className="settings-link" onClick={leave}><LogOut size={18}/>Leave this workspace</button>
   </div>
  </aside>
  <div className="workspace surface">
   <header className="topbar staff-topbar">
    <div className="staff-who">
     <span className="avatar small">{who.initials}</span>
     <span><strong>{who.subject.name}</strong><small>{who.roleName} · {who.subject.reference}</small></span>
    </div>
    <div className="breadcrumb">{role}<span>/</span><strong>{section}</strong></div>
    <div className="topbar-actions">
     <button className="icon-button" aria-label="Leave this workspace" onClick={leave}><LogOut size={19}/></button>
    </div>
   </header>
   {/* The disclosure, and beside it the door. The sentence is the same one every shell shows; the
       switcher beside it is the way a person gets to another workspace now that no screen in front
       of this one asks which. */}
   <DemoBar note={t('shell.previewBadge', 'en-ZA')}/>
   <main id="main" tabIndex={-1}>{renderSection(role, section, setModal, home)}</main>
   <footer className="app-footer"><span>© 2026 MyThuso · {role} workspace</span><span>{t('shell.tagline', 'en-ZA')}</span></footer>
   {/* The visible label is the short one and the accessible name is the whole section. Both point
       at the same thing and the short one is a prefix of the long one, so WCAG 2.5.3 is satisfied
       while a screen-reader user hears "Earnings and payouts" rather than "Earnings". */}
   <nav className="tabbar staff" aria-label="Primary">{sections.map(({ id, short, icon: Icon }) =>
    <button key={id} aria-label={id} aria-current={section === id ? 'page' : undefined} className={section === id ? 'active' : ''} onClick={() => go(id)}>
     <span className="tab-icon"><Icon size={21} strokeWidth={1.9}/></span><span className="tab-label">{short}</span>
    </button>)}</nav>
  </div>
  {modal && <Modal title={staffModalTitle(modal)} onClose={() => setModal(null)}>{staffModalBody(modal, () => setModal(null), setModal)}</Modal>}
 </div>;
}

/* A heading, for the sections that are a whole feature rather than a board the shell composes.
   Six of them had none at all — the nurse's assessment, her earnings, her vetting, the doctor's
   consultation room and his record, and the partner's substitution register. A reader landed on a
   status chip or a form label with nothing anywhere on the page saying which screen it was, and a
   screen reader's heading list opened at h2. The eyebrow says which workspace, the heading says
   which section; the sentence explaining the screen is left to the screen, because all six already
   carry one and a second would be the shell talking over them. */
const SectionHead = ({ role, section }: { role: StaffRole; section: string }) =>
 <div className="page-intro"><div><div className="eyebrow">{role.toUpperCase()}</div><h1>{section}</h1></div></div>;

function renderSection(role: StaffRole, section: string, open: (m: string) => void, home: () => void) {
 const head = <SectionHead role={role} section={section}/>;
 if (role === 'Nurse') {
  if (section === 'Assessments') return <>{head}<VisitAssessment onClose={home}/></>;
  if (section === 'Thuso Kit') return <ThusoKit/>;
  if (section === 'Earnings & payouts') return <>{head}<Earnings/></>;
  if (section === 'Vetting') return <>{head}<VettingApplication roleId="nurse" onClose={home}/></>;
 }
 if (role === 'Doctor') {
  if (section === 'Protocols') return <ClinicalProtocols/>;
  if (section === 'Teleconsultation') return <>{head}<Teleconsult/></>;
  if (section === 'Patient context') return <PatientFile open={open}/>;
  if (section === 'Consultation records') return <>{head}<ConsultationRecord/></>;
 }
 if (role === 'Partner' && section === 'Substitution & repeats') return <>{head}<Dispensing/></>;
 if (role === 'Control Tower') {
  if (section === 'Vetting queue') return <VettingQueue open={open}/>;
  if (section === 'Quality') return <QualityBoard open={open}/>;
 }
 return <StaffSection role={role} section={section} open={open}/>;
}

/* ---- The sections this shell draws itself -------------------------------------------------------
 *
 * The boards, the queues and the two doors used to come from features/Pages.tsx's Workspace, which
 * headed every one of them "NURSE WORKSPACE · DEMO / Fictional workspace. Role switching is for
 * design review, not authentication." Both halves of that sentence stopped being true the moment
 * roles stopped being switchable: there is no role switching left to disclaim, and a heading that
 * shouts DEMO over a nurse's 07:00 schedule is the design-preview furniture this work exists to
 * remove. The shell composes the same fictional rows under a heading that says what the section is
 * for instead, and the disclosure lives once, in the band above, where it is read.
 *
 * The boards themselves — dispatch, incidents, fulfilment — are still the feature components. Only
 * the heading, the counts strip and the two queues that were inline in Workspace are here. */

/* What each section is for, in the words a person doing the job would use.

   Seven of the nine are packages/catalog/framing.json's now, and none of them is typed here. Four
   are a role's opening line, read back through `openingLine` so the door somebody signs in through
   and the screen behind it cannot describe one job differently — that much was already true. The
   other three were typed here and, word for word, in apps/ios/MyThuso/Features/WorkspaceView.swift,
   whose comment above them said they were this file's. A TypeScript module is a home two of the
   three applications cannot read, so the sentences moved to the contract and both phones now read
   the generated FramingData.

   Protocols and Quality keep the door sentences from features/Pages.tsx: they are not a section any
   role opens the app at, and inventing a contract entry for a screen that is still a door would be
   writing the sentence twice in order to say it once. */
const sectionBlurb: Record<string, string> = {
 Schedule: openingLine('Schedule'),
 'Review queue': openingLine('Review queue'),
 Dispatch: openingLine('Dispatch'),
 Orders: openingLine('Orders'),
 ...Object.fromEntries(framing.sections.map(s => [s.id, s.blurb])),
 Protocols: sectionDoor.Protocols,
 Quality: sectionDoor.Quality
};
/* Urgency first: what is waiting, how long it has waited, and what to do about it. Counted only on
   the sections that are a board — a strip of a nurse's earnings above a page about protocols is
   three numbers with nothing to do with the screen under them. */
/* label, figure, unit, chip, flagged — the reference's order rather than this product's. The chip
   floats above the figure and says how it is going; the label sits under it and says what it is.
   `flagged` fills the chip charcoal, and exactly one per screen is the point of it. */
type Metric = readonly [string, string, string, string, boolean, string?];
/* Counted from the boards they sit above wherever the board is in this territory, rather than typed
   beside them. They were typed, and they had drifted: the partner's strip said eight open orders
   over a queue of four, and the Control Tower's said one high-severity incident over a board
   listing one critical and one high. A figure a reader can disprove by looking at the screen under
   it is worse than no figure.
   The nurse's and the doctor's still carry typed sample figures, because the schedule and the
   review queue are drawn from features/Pages.tsx, which does not export its rows. What is fixed is
   that they no longer contradict what is on the screen: three visits, three cases waiting, two of
   them flagged. */
const metricsOf = (role: StaffRole, queue: Part[]): readonly Metric[] => {
 if (role === 'Partner') { const c = partnerCounts();
  return [['Open orders', String(c.open), '', c.pastWindow ? `${c.pastWindow} past its window` : 'All inside their windows', c.pastWindow > 0],
          ['Collections', String(c.collections), '', `Next ${c.nextCollection}`, false],
          ['Ready for release', String(c.readyForRelease), '', 'Awaiting a clinician', false]]; }
 if (role === 'Control Tower') { const c = controlTowerCounts();
  return [['Visits on the board', String(c.waiting), '', 'Awaiting a nurse', false],
          ['Nurses on duty', String(c.nurses), '', `${c.offDuty} off duty`, false],
          ['Open incidents', String(c.incidents), '', c.critical ? `${c.critical} critical` : `${c.high} high`, c.critical > 0]]; }
 if (role === 'Doctor') { const q = reviewQueueCounts();
  return [['Awaiting review', String(q.waiting), '', `Longest ${q.longest}`, false],
          ['Priority reviews', String(q.flagged), '', 'Out of range', true],
          ['Reviewed today', '18', '', 'Median 4 m 10 s', false]]; }
 const day = nurseDayCounts(queue);
 /* The week's earnings are the earnings screen's arithmetic and not the schedule's, which is why
    this was typed rather than recomputed here. It does not have to be either: that screen already
    exports its own summary, so the strip reads the one figure instead of keeping a second. */
 const week = earningsSummary();
 return [['Next visit', day.nextStart, '', day.nextWhere, false],
         ['Today’s visits', String(day.visits), '', day.signed ? `${day.signed} signed, ${day.left} to go` : `${day.left} to sign off`, false],
         ['This week', rand(week.thisWeek).value, '', `Pays ${cycle.paysOn}`, false, rand(week.thisWeek).prefix]];
};
/* Three columns rather than one bold string with two middle dots in it. A reference, what the case
   is, and what state it is in are three different questions, and a reader scanning a queue answers
   the third one first — so it is a badge in its own column at the end of the row, aligned down the
   list, instead of the last few words of a sentence. */
const BOARDS = ['Schedule', 'Review queue', 'Dispatch', 'Incidents', 'Orders', 'Collections', 'Results'];
/* The sections that draw their own <h1>. Two h1 elements on one page is not a heading, it is a
   reader having to guess which one is the page.
   Incidents is not one of them and was listed as one, so the Control Tower's incident board opened
   on an eyebrow, three figures and a list, with no heading anywhere on it saying what the screen
   was. A board that heads itself has to actually head itself. */
const HEADS_ITSELF = BOARDS.filter(section => section !== 'Incidents').concat(['Protocols', 'Quality', 'Vetting queue']);

function StaffSection({ role, section, open }: { role: StaffRole; section: string; open: (m: string) => void }) {
 /* Subscribed here as well as inside the schedule, so the strip above the day and the list below it
    cannot disagree about how much of it is done. */
 const queue = useVisitQueue();
 const board = BOARDS.includes(section);
 /* The sections rendered by a feature component that draws its own <h1>. */
 const headsItself = HEADS_ITSELF.includes(section);
 /* Protocols and Quality draw their own page-intro, eyebrow included, because they are whole screens
    rather than boards the shell tops. Everything else keeps the shell's eyebrow — a board that heads
    itself still has to say which workspace it belongs to. */
 const ownsIntro = section === 'Protocols' || section === 'Quality' || section === 'Vetting queue';
 return <>
  {/* Two sections head themselves, and better than this can: the dispatch board and the fulfilment
      queue carry a live subtitle counting what is actually waiting. The shell gives them the role
      eyebrow and gets out of the way, because two h1 elements on one page is not a heading, it is a
      reader having to guess which one is the page. */}
  {!ownsIntro && <div className="page-intro"><div><div className="eyebrow">{role.toUpperCase()}</div>
   {headsItself ? null : <><h1>{section}</h1><p>{sectionBlurb[section] ?? sectionDoor[section] ?? ''}</p></>}</div></div>}
  {/* The first figure in each strip takes the lime tile, and it is the first one because every one
      of these lists is already ordered urgency-first — the comment above metricsOf says so and has
      done since the strips were written. So the tile is a rule rather than six separate opinions
      about which number matters, and it cannot drift out of step with the order of the strip
      because it is the order of the strip. Nothing is typed: the figure inside it is the same
      counted value, from the same board underneath. */}
  {board && <Metrics>{metricsOf(role, queue).map(([label, value, unit, chip, flagged, prefix], i) =>
   <Metric key={label} label={label} value={value} unit={unit || undefined} prefix={prefix} chip={chip} flagged={flagged} lead={i === 0}/>)}</Metrics>}
  {section === 'Schedule' ? <NurseSchedule open={open}/>
   : section === 'Review queue' ? <ReviewQueue open={open}/>
: section === 'Dispatch' ? <DispatchBoard/>
   : section === 'Incidents' ? <IncidentBoard open={open}/>
    : section === 'Orders' || section === 'Collections' || section === 'Results' ? <FulfilmentQueue section={section} open={open}/>
     /* The last fallback. Protocols and Quality used to land here — a card whose only control
        opened a dialog saying nothing happens — and both are screens of their own now. What is left
        is the shape a section takes when it genuinely has nothing behind it, which is worth keeping
        drawn so a reviewer can tell a gap from an oversight. */
     : <div className="panel workflow-door">
      <span className="tile-icon"><ShieldCheck size={22}/></span>
      <h2>{section}</h2>
      <p>{sectionDoor[section] ?? 'This workflow is drawn but not yet a screen of its own.'}</p>
      {/* The section keeps its own capitalisation: these are the names of screens, and "open vetting"
          reads as an instruction to vet somebody rather than as the name of the thing behind the door. */}
      <button className="primary" onClick={() => open(sectionWorkflow[section] ?? section)}>Open {section}<ArrowRight size={17}/></button>
      <p className="helper">It opens as a preview dialog. Nothing in it reaches a nurse, a patient, a device or a record.</p>
     </div>}
  {/* Secondary by construction. These were two cards with the same shield on them, the same white
      surface and the same shadow as the queue above — so a screen whose entire purpose is the queue
      ended on two equally-weighted boxes. A list of links is what they are. */}
  <SectionTitle title="More tools"/>
  <div className="tool-links">{(roleExtras[role] ?? []).map(tool =>
   <button className="tool-link" key={tool} onClick={() => open(tool)}>{tool}<ArrowUpRight size={16}/></button>)}</div>
 </>;
}

/* The clinical modal router. It is a separate function from the patient app's on purpose: this is
   the list of screens a patient must never be made to download, and keeping the two routers apart
   is what stops one import creeping back and undoing the split. */
function staffModalTitle(modal: string) {
 if (modal.startsWith('Nurse case: TH-')) return 'Patient file';
 if (modal === 'Substitution & repeats' || modal === 'Substitution') return 'Substitution & repeats';
 if (modal.startsWith('Consultation record · ')) return 'New consultation';
 if (modal.startsWith('Referral letter · ')) return 'Referral';
 if (modal.startsWith('Upload a document · ')) return 'Upload a document';
 if (modal.startsWith('Prescribing · ')) return 'Prescribing';
 if (modal.startsWith('Prescription ')) return 'Prescription';
 if (modal.startsWith('Laboratory order ')) return 'Laboratory order';
 if (modal.startsWith('Incident ')) return 'Incident';
 if (modal.startsWith('Doctor review') || modal.startsWith('Doctor case:')) return 'Clinical review';
 if (modal === 'Visit assessment' || modal.startsWith('Nurse case:')) return 'Visit assessment';
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return 'Vetting queue';
 if (modal === 'Weekly payouts' || modal === 'Earnings & payouts') return 'Earnings & payouts';
 if (modal === 'Teleconsultation call') return 'Teleconsultation';
 return modal;
}
/* `open` as well as `close`, because a screen reached from here can produce the next one. A doctor
   who signs "issue a prescription" is offered the prescription; the router that knows what a
   prescription is called is this one, so the door is handed down rather than duplicated inside the
   feature. */
function staffModalBody(modal: string, close: () => void, open: (m: string) => void) {
 /* Two different things used to arrive here under one name. The nurse's schedule opens a visit
    assessment from "Start this visit" and the patient's file from "Patient file", and both were
    routed to the assessment — so the one button on that card that is not about starting the visit
    opened the visit. The visit reference distinguishes them: a case named after a visit is a file,
    a case named after a time is the visit at that time. */
 if (modal.startsWith('Nurse case: TH-')) return <PatientFile open={open}/>;
 if (modal === 'Visit assessment' || modal.startsWith('Nurse case:')) return <VisitAssessment {...visitFrom(modal)} onClose={close}/>;
 if (modal.startsWith('Doctor review') || modal.startsWith('Doctor case:')) return <DoctorReview reference={referenceIn(modal) ?? undefined} open={open} onClose={close}/>;
 if (modal.startsWith('Prescription ') || modal === 'Pharmacy orders') return <PrescriptionDetail reference={referenceIn(modal) ?? undefined} open={open}/>;
 if (modal.startsWith('Laboratory order ') || modal === 'Laboratory results') return <LabOrderDetail reference={referenceIn(modal) ?? undefined}/>;
 if (modal.startsWith('Incident ') || modal === 'Incident management') return <IncidentDetail reference={modal.replace('Incident ', '')} onClose={close}/>;
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return <NurseVetting onClose={close}/>;
 if (modal === 'Vetting application') return <VettingApplication onClose={close}/>;
 if (modal === 'Thuso Kit' || modal === 'Thuso Kit connection' || modal === 'Diagnostic kit') return <ThusoKit onClose={close}/>;
 if (modal === 'Weekly payouts' || modal === 'Earnings & payouts') return <Earnings/>;
 if (modal === 'Substitution & repeats' || modal === 'Substitution') return <Dispensing/>;
 /* "Clinical protocols" is in two roles' More tools and was the roadmap fallback in both. It is a
    screen now, and the same screen — a protocol that differs by which door you came through is two
    protocols. */
 if (modal === 'Clinical protocols') return <ClinicalProtocols/>;
 if (modal === 'Referral pathway') return <ReferralPathway/>;
 /* The nurse's own two More tools. Neither is a workflow and neither pretends to be one; what each
    says instead is what the module is for and the one thing it will not do — which for a shift
    market and a training record is the same thing in two shapes, and the thing a nurse should be
    able to check before she trusts either. */
 if (modal === 'Locum shifts') return <LocumShifts onClose={close}/>;
 if (modal === 'Academy') return <Academy onClose={close}/>;
 if (modal === 'Employer programmes' || modal === 'Programme administration') return <Programmes/>;
 if (modal === 'Consultation record') return <ConsultationRecord onClose={close}/>;
 /* The patient file's four actions. Each one carries the name of the file it was pressed on, so a
    screen opened from Thando Mokoena's file is about Thando Mokoena — the alternative was routing
    "Prescription" to RX-0081 and showing one patient's medicines under another's name. */
 if (modal.startsWith('Consultation record · ')) return <ConsultationComposer patient={personIn(modal)} onClose={close}/>;
 if (modal.startsWith('Referral letter · ')) return <ReferralLetter reference="TH-2048" patient={personIn(modal)} doctor={signingDoctor.name} registration={signingDoctor.reference} reason="" onClose={close}/>;
 if (modal.startsWith('Upload a document · ')) return <UploadDocument patient={personIn(modal)} onClose={close}/>;
 if (modal.startsWith('Prescribing · ')) return <PrescribingRoute patient={personIn(modal)} onClose={close}/>;
 if (modal === 'Teleconsultation' || modal === 'Teleconsultation call') return <Teleconsult onClose={close}/>;
 return <StaffDetail title={modal} close={close}/>;
}
/* "Nurse case: 11:30 · Wound care · Parktown" is a row on the schedule, and the assessment it opens
   used to be the 09:00 one every time — the same patient, the same reference, whichever row was
   pressed. The row already carries what it needs; this reads it rather than inventing a screen. */
const dayPeople: Record<string, string> = { '11:30': 'Thabo Molefe', '14:00': 'Nomsa Molefe' };
function visitFrom(modal: string): { reference?: string; patient?: string } {
 const time = modal.match(/Nurse case: (\d{2}:\d{2})/)?.[1];
 return time ? { reference: `TH-2048 · ${time}`, patient: dayPeople[time] ?? 'Lerato Molefe' } : {};
}
/* A reference is TH- or INC- followed by digits. Pulled out rather than sliced at a fixed offset,
   because "Doctor review: TH-2041" and "Doctor case: TH-2041" are the same case under two names. */
const referenceIn = (modal: string) => modal.match(/\b(TH|INC|RX|LAB)-\d+/)?.[0] ?? null;
/* The name after the separator, for the four screens the patient file opens about a named person. */
const personIn = (modal: string) => modal.split(' · ').slice(1).join(' · ');
/* Who a screen opened from a file is written under. The file has a viewer switcher of its own and
   the doctor at the top of the register is the one this preview signs as, the same one the review
   queue defaults to — read from the vetting register rather than typed. */
const signingDoctor = subjectsByRole('doctor')[0];

/* The fallback, and it says the same thing every time because the same thing is true every time: a
   name on a list is not a screen. It names what the workflow will be for so that a reviewer can
   tell a gap from an oversight. */
function StaffDetail({ title, close }: { title: string; close: () => void }) {
 return <div className="form-stack">
  <div className="staff-blank">
   <h2>{title}</h2>
   <p>This workflow is in the roadmap and is not drawn yet. Nothing behind this name is connected to a nurse, a patient, a record, a payment or a device, and opening it changes nothing.</p>
  </div>
  <button className="primary" onClick={close}>Got it<ArrowRight size={16}/></button>
 </div>;
}
