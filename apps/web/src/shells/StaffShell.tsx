import { ClinicalWorkbench } from '../features/ClinicalWorkbench';
import framing from '../../../../packages/catalog/framing.json' with { type: 'json' };
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Bluetooth, BookOpen, CalendarDays, ClipboardPlus, CreditCard, FileText, FlaskConical, LogOut, Package, Radar, Repeat, ShieldAlert, ShieldCheck, Siren, Truck, Video } from 'lucide-react';
import { Modal, SectionTitle } from '../components/UI';
import { Metric, Metrics, NavRow } from '../surface/Surface';
import '../surface/clinical.css';
/* The clinical feature screens' own sheet. It used to be imported by the staff and admin entries,
   which no longer exist: this shell is reached by a dynamic import now, so both sheets travel in
   that chunk and a patient never downloads either. */
import '../surface/clinical-screens.css';
import { NurseSchedule, ReviewQueue, nurseDayCounts, reviewQueueCounts, roleExtras, sectionDoor, sectionWorkflow } from '../features/Workspaces';
import { SettingReviews } from '../features/SettingReviews';
import { useVisitQueue } from '../features/VisitQueue';
import type { Part } from '../lib/visit-queue';
import { cycle, weeks } from '../lib/earnings';
import { ClinicalDeck, DeckTitleLevel, type DeckFigure, type DeckHeadline } from '../features/ClinicalDeck';
import { earningsSummary, rand } from '../features/Earnings';
import { DispatchBoard, IncidentBoard, QualityBoard, controlTowerCounts } from '../features/Dispatch';
import { FulfilmentQueue, partnerCounts } from '../features/Fulfilment';
import { ClinicalProtocols, ReferralLetter, ReferralPathway, VisitAssessment, DoctorReview } from '../features/Clinical';
import { CareVisit } from '../features/CareVisit';
import { preview as carePreview } from '../lib/care-visit';
import { Academy, LocumShifts } from '../features/NurseTools';
import { ThusoKit } from '../features/Kit';
import { Earnings } from '../features/Earnings';
import { DoctorFees } from '../features/DoctorFees';
import { Dispensing } from '../features/Dispensing';
import { Programmes } from '../features/Programmes';
import { Teleconsult } from '../features/Teleconsult';
import { ConsultationComposer, ConsultationRecord } from '../features/Consultation';
import { PatientFile, PrescribingRoute, UploadDocument } from '../features/PatientFile';
import { LabOrderDetail, PrescriptionDetail } from '../features/Orders';
import { IncidentDetail, NurseVetting } from '../features/Dispatch';
import { SafetyDesk } from '../features/FieldSafety';
/* The desk's held cash payments sit under the incident register: the desk opens this screen for a panic, and a
   held payment is a phone call that can wait below it. */
import { HeldCashPayments } from '../features/CashCode';
import { ConcernBoard } from '../features/ConcernBoard';
/* Thuso Kit's registry arrives when a nurse opens her kit or the Control Tower opens its incidents, and not
   before: it carries the Devices contract and every engine's settings through lib/settings. */
const KitHealth = lazy(() => import('../features/Devices').then(m => ({ default: m.KitHealth })));
const DeviceRegistryDesk = lazy(() => import('../features/Devices').then(m => ({ default: m.DeviceRegistryDesk })));
import { VettingApplication, VettingQueue } from '../features/Vetting';
import { t } from '../lib/i18n';
import { endSession } from '../lib/auth';
import { subjectsByRole } from '../lib/vetting-fixtures';
import { scrollToTop } from '../lib/scroll';

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
   {/* Pill rows, and the one you are on is a filled pill in the logo's ink with its trailing circle
       in the logo's reversed green. A plain list of rows with a tinted active state told a reader which entry was
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
   <main id="main" tabIndex={-1}>
    {renderSection(role, section, setModal, home)}
   </main>
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
/* The seven screens that open on the clinical deck name themselves on it, so the shell gives them
   only the role eyebrow — the arrangement the doctor's queue and the nurse's day already have — and
   tells the deck it is standing on a page rather than in a dialog. A large title over a 42px display
   line was two headlines fighting for one screen; see DeckTitleLevel for why the deck cannot work out
   which of the two places it is in for itself. */
const OnDeck = ({ role, children }: { role: StaffRole; children: ReactNode }) =>
 <DeckTitleLevel.Provider value="h1">
  <div className="page-intro"><div><div className="eyebrow">{role.toUpperCase()}</div></div></div>
  {children}
 </DeckTitleLevel.Provider>;

function renderSection(role: StaffRole, section: string, open: (m: string) => void, home: () => void) {
 const head = <SectionHead role={role} section={section}/>;
 if (role === 'Nurse') {
  if (section === 'Assessments') return <OnDeck role={role}><VisitAssessment onClose={home}/></OnDeck>;
  if (section === 'Thuso Kit') return <OnDeck role={role}><ThusoKit/><Suspense fallback={null}><KitHealth/></Suspense></OnDeck>;
  if (section === 'Earnings & payouts') return <OnDeck role={role}><Earnings/></OnDeck>;
  if (section === 'Vetting') return <OnDeck role={role}><VettingApplication roleId="nurse" onClose={home}/></OnDeck>;
 }
 if (role === 'Doctor') {
  if (section === 'Protocols') return <OnDeck role={role}><ClinicalProtocols/></OnDeck>;
  if (section === 'Teleconsultation') return <>{head}<Teleconsult/></>;
  if (section === 'Patient context') return <OnDeck role={role}><PatientFile open={open}/></OnDeck>;
  if (section === 'Consultation records') return <OnDeck role={role}><ConsultationRecord title="Consultation records"/></OnDeck>;
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
/* A figure: what it is called, what it says, the chip that floats above it, and — on the two
   clinical decks — the drawing of the same arithmetic that goes around it. The chip says how it is
   going; the label sits under it and says what it is; `flagged` fills the chip charcoal, and exactly
   one per screen is the point of it.
   It was a six-slot tuple and the seventh thing broke it: `['Longest wait', q.longest, '', 'Oldest
   in the queue', false]` is four positional arguments a reader has to count on their fingers, and a
   shape hung off the end would have made it five. Named fields, same figures, same one place they
   are decided in. */
type Figure = DeckFigure;
/* Counted from the boards they sit above wherever the board is in this territory, rather than typed
   beside them. They were typed, and they had drifted: the partner's strip said eight open orders
   over a queue of four, and the Control Tower's said one high-severity incident over a board
   listing one critical and one high. A figure a reader can disprove by looking at the screen under
   it is worse than no figure.
   Two roles are left. The nurse's, the doctor's and the partner's opening sections are the clinical
   workbench now, and a strip of summary tiles over a work queue is the dashboard a clinician was
   asked not to be shown — so those three went with it. Two of the doctor's figures had no list to
   be counted from at all: "18 reviewed today" and its "Median 4 m 10 s" were invented, and an
   invented productivity figure on a clinical screen is the one kind of number this product must
   never carry. What the two remaining boards say about themselves, each of them still counts. */
/* And the two clinical strips are instruments now rather than three numerals in a row — a ring of
   the queue, a dial of what is pressing, the day drawn to scale. Every shape below is built out of
   the same rows the figure beside it is counted from, and not one of them carries a fact of its own:
   the doctor's ring has one arc per row on the queue underneath and the bright arcs are the rows
   wearing a badge, so a shape that disagreed with the list would be as disprovable by looking as a
   typed figure is. features/ClinicalDeck.tsx draws them and decides nothing. */
const metricsOf = (role: StaffRole, queue: Part[]): readonly Figure[] => {
 if (role === 'Partner') { const c = partnerCounts();
  return [{ label: 'Open orders', value: String(c.open), chip: c.pastWindow ? `${c.pastWindow} past its window` : 'All inside their windows', flagged: c.pastWindow > 0 },
          { label: 'Collections', value: String(c.collections), chip: `Next ${c.nextCollection}`, flagged: false },
          { label: 'Ready for release', value: String(c.readyForRelease), chip: 'Awaiting a clinician', flagged: false }]; }
 if (role === 'Control Tower') { const c = controlTowerCounts();
  return [{ label: 'Visits on the board', value: String(c.waiting), chip: 'Awaiting a nurse', flagged: false },
          { label: 'Nurses on duty', value: String(c.nurses), chip: `${c.offDuty} off duty`, flagged: false },
          { label: 'Open incidents', value: String(c.incidents), chip: c.critical ? `${c.critical} critical` : `${c.high} high`, flagged: c.critical > 0 }]; }
 /* The doctor's third tile used to be "18 reviewed today" over "Median 4 m 10 s". Both were typed,
    neither had a list under it to be counted from, and a productivity figure nobody can check is
    the one number a clinical screen must not carry. The longest wait replaces them: it is the same
    queue, sorted, and a reader can see which row it names — and now the bars beside it are that
    queue, each row as long as it has waited, so the word "longest" is drawn as well as said. */
 if (role === 'Doctor') { const q = reviewQueueCounts();
  return [{ label: 'Awaiting review', value: String(q.waiting), flagged: false,
            chip: q.flagged ? `${q.flagged} out of range` : 'All inside their ranges',
            shape: { kind: 'ring', segments: q.rows.map(row => row.flagged) } },
          { label: 'Priority reviews', value: String(q.flagged), chip: 'Out of range', flagged: q.flagged > 0,
            shape: { kind: 'gauge', part: q.flagged, whole: q.waiting } },
          { label: 'Longest wait', value: q.longest, chip: 'Oldest in the queue', flagged: false,
            /* The bars carry the reference of the row each one is, so "the longest wait" names a
               case a reader can find on the queue below rather than a length they have to match by
               eye. Both halves come off the same rows the numeral is counted from. */
            shape: { kind: 'bars', values: q.rows.map(row => row.minutes), labels: q.rows.map(row => row.ref) } }]; }
 if (role === 'Nurse') { const day = nurseDayCounts(queue);
  /* The week's earnings are the earnings screen's arithmetic rather than the schedule's: that
     screen already exports its summary, so the strip reads the one figure instead of keeping a
     second that could disagree with it. The line under it is the same register's weeks, oldest
     first, so the figure has the four weeks behind it rather than a shape somebody drew. */
  const week = earningsSummary();
  /* "Next visit 09:00" was still on this deck after 09:00 had been signed off, while the drawing
     beside it had already turned that block to paper — see the note above nurseDayCounts. What is
     next is the first visit with no sign-off against it, and at the end of a day there is no such
     visit: the figure then says what is true, which is when the day ended and that nothing is left
     on it. Both readings are the same counted rows; neither is a second opinion about them. */
  return [day.next
           ? { label: 'Next visit', value: day.next.start, chip: day.next.where, flagged: false,
               shape: { kind: 'day', spans: day.spans, from: day.dayFrom, to: day.dayTo } }
           : { label: 'Day finished at', value: day.dayEnds, chip: `${day.signed} of ${day.visits} signed off`, flagged: false,
               shape: { kind: 'day', spans: day.spans, from: day.dayFrom, to: day.dayTo } },
          { label: 'Today’s visits', value: String(day.visits), flagged: false,
            chip: day.signed ? `${day.signed} signed, ${day.left} to go` : `${day.left} to sign off`,
            shape: { kind: 'ring', segments: day.spans.map(visit => visit.signed) } },
          { label: 'This week', value: rand(week.thisWeek).value, prefix: rand(week.thisWeek).prefix,
            chip: `Pays ${cycle.paysOn}`, flagged: false,
            shape: { kind: 'spark', values: weekTotals(), countTo: week.thisWeek } }]; }
 return [];
};
/* The weeks BEHIND this one, oldest first, so a line drawn from them runs the way time does. Sorted
   on each week's own end date rather than on the order the contract happens to list them in — the
   register is written newest first and a series drawn in that order would show every week falling.
   The week in progress is deliberately not the last point on it. It is the figure above the line,
   and a week that is still being added to, drawn as the end of a series, reads as a fall rather than
   as a week that has not finished — the earnings contract says so in its own words, "the figure can
   go down as well as up", and a drawing may not quietly contradict a sentence the product makes. */
const weekTotals = () => weeks.filter(week => week.state !== 'accruing')
 .sort((a, b) => a.ends.localeCompare(b.ends)).map(week => week.total);
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

/* The three sections that open the clinical workbench instead of being a board on their own.
   A nurse's day, a doctor's queue and a partner's orders are the work each of those roles signs in
   to do, and the workbench is where one case of it is actually worked — so the board is folded into
   the top of the workbench rather than drawn above or below it. Before this they were both, one
   after the other, with a strip of summary tiles in between: the same person's work twice over,
   which is what made a clinical screen read as a dashboard. */
const WORKBENCH: Partial<Record<StaffRole, string>> = { Nurse: 'Schedule', Doctor: 'Review queue', Partner: 'Orders' };

/* The two roles whose opening screen is a deck of instruments rather than three numerals in a row.
   Both of them open the application on one list and work it for a shift, which is the case a ring
   and a gauge earn their place in: the shape of that list is the thing they need before the first
   row of it. The partner and the Control Tower read several boards a day and keep the flat strip. */
const DECK: readonly StaffRole[] = ['Nurse', 'Doctor'];
/* What the deck is called, and what to do if a figure on it looks wrong — which is to count the rows
   it was counted from. That second sentence is the one line on a dashboard worth what it costs.
   The eyebrow does not repeat the role. The shell writes NURSE above this already, and a screen that
   spends its most valuable line saying the same word twice has said nothing with it.
   The headline is a sentence with a badge set inside it, and it is the question each of these two
   screens exists to answer: a doctor's is what is waiting and for how long, a nurse's is where she
   is going and when she can leave. The badge is decoration and is hidden from a screen reader, so
   both sentences are written to read correctly without it. */
const deckHead: Partial<Record<StaffRole, { eyebrow: string; headline: DeckHeadline; note: string }>> = {
 Nurse: { eyebrow: 'TODAY AT A GLANCE',
          headline: ['Where you are going,', { glyph: 'pin' }, 'and when you can leave.'],
          note: 'Every figure is counted off the visits below' },
 Doctor: { eyebrow: 'THE QUEUE AT A GLANCE',
           headline: ['What is waiting,', { glyph: 'clock' }, 'and how long it has waited.'],
           note: 'Every figure is counted off the rows below' }
};

function StaffSection({ role, section, open }: { role: StaffRole; section: string; open: (m: string) => void }) {
 const board = BOARDS.includes(section);
 const workbench = WORKBENCH[role] === section;
 /* The nurse's strip counts how many of her visits are signed off, which is the queue's state and
    not the schedule's — so the hook is read here and handed down rather than reached for twice. */
 const queue = useVisitQueue();
 /* The strip leads every board, the workbench sections included. It was taken out of those three
    and the founder asked for it back: a clinician wants the shape of the day before the first row
    of it. What did not come back is any figure that cannot be counted off the list beneath it. */
 const figures = board ? metricsOf(role, queue) : [];
 const deck = DECK.includes(role);
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
  {/* The first figure in each strip leads, and it is the first one because every one of these lists
      is already ordered urgency-first — the comment above metricsOf says so and has done since the
      strips were written. So the lead is a rule rather than six separate opinions about which number
      matters, and it cannot drift out of step with the order of the strip because it is the order of
      the strip. Nothing is typed: the figure inside it is the same counted value, from the same
      board underneath.
      A nurse and a doctor get the instrument deck; the two operational boards keep the flat strip,
      and deliberately so. A controller reads six boards in a shift and a dial on each of them is a
      dashboard rather than a tool — the deck is for the two screens a clinician opens the
      application at and stays on. */}
  {figures.length > 0 && (deck
   ? <ClinicalDeck role={role} figures={figures} eyebrow={deckHead[role]?.eyebrow ?? ''}
                   headline={deckHead[role]?.headline ?? []} note={deckHead[role]?.note ?? ''}/>
   : <Metrics>{figures.map((figure, i) =>
      <Metric key={figure.label} label={figure.label} value={figure.value} unit={figure.unit} prefix={figure.prefix}
              chip={figure.chip} flagged={figure.flagged} lead={i === 0}/>)}</Metrics>)}
  {workbench ? <ClinicalWorkbench role={role as 'Nurse' | 'Doctor' | 'Partner'} worklist={sectionBody(section, open)}/> : sectionBody(section, open)}
  {/* Secondary by construction. These were two cards with the same shield on them, the same white
      surface and the same shadow as the queue above — so a screen whose entire purpose is the queue
      ended on two equally-weighted boxes. A list of links is what they are. */}
  <SectionTitle title="More tools"/>
  <div className="tool-links">{(roleExtras[role] ?? []).map(tool =>
   <button className="tool-link" key={tool} onClick={() => open(tool)}>{tool}<ArrowUpRight size={16}/></button>)}</div>
 </>;
}

/* The board itself, separated from the shell's furniture so that one line above can either draw it
   or hand it to the workbench to draw. */
function sectionBody(section: string, open: (m: string) => void) {
 return section === 'Schedule' ? <NurseSchedule open={open}/>
  : section === 'Review queue' ? <><ReviewQueue open={open}/><SettingReviews/></>
   : section === 'Dispatch' ? <DispatchBoard/>
    : section === 'Incidents' ? <><SafetyDesk/><ConcernBoard/><IncidentBoard open={open} notice={false}/><HeldCashPayments/><Suspense fallback={null}><DeviceRegistryDesk/></Suspense></>
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
      </div>;
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
 if (modal === 'Visit assessment' || modal.startsWith('Nurse case:') || modal === 'Care assessment') return 'Visit assessment';
 if (modal === 'Care visit') return `Visit ${carePreview.appointmentRef}`;
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
 /* The visit a nurse accepted from her day, and the assessment that visit is signed off in. The
    assessment is opened under the visit's own reference, so the sign-off it seals is the one Care's
    handover and completion ask for; closing it returns to the visit rather than to the day. */
 if (modal === 'Care visit') return <CareVisit open={open} onClose={close}/>;
 if (modal === 'Care assessment') return <VisitAssessment reference={carePreview.appointmentRef} onClose={() => open('Care visit')}/>;
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
 /* The doctor's per-case fees: the cases Money has recorded and a fee nobody has decided, with the
    ledger's refusal to schedule a payout shown rather than a button quietly disabled. */
 if (modal === 'Per-case fees') return <DoctorFees/>;
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
