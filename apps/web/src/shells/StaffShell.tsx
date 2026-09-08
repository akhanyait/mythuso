import { useEffect, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Bluetooth, BookOpen, CalendarDays, ClipboardPlus, CreditCard, FileText, FlaskConical, LogOut, Package, Radar, Repeat, ShieldAlert, ShieldCheck, Siren, Truck, Video } from 'lucide-react';
import { Modal, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { NurseSchedule, ReviewQueue, roleExtras, sectionDoor, sectionWorkflow } from '../features/Pages';
import { DispatchBoard, IncidentBoard } from '../features/Dispatch';
import { FulfilmentQueue } from '../features/Orders';
import { VisitAssessment, DoctorReview } from '../features/Clinical';
import { ThusoKit } from '../features/Kit';
import { Earnings } from '../features/Earnings';
import { Dispensing } from '../features/Dispensing';
import { Programmes } from '../features/Programmes';
import { Teleconsult } from '../features/Teleconsult';
import { ConsultationRecord } from '../features/Consultation';
import { PatientFile } from '../features/PatientFile';
import { LabOrderDetail, PrescriptionDetail } from '../features/Orders';
import { IncidentDetail, NurseVetting } from '../features/Dispatch';
import { VettingApplication } from '../features/Vetting';
import { t } from '../lib/i18n';
import { probe, startSignIn, verifyCode, endSession } from '../lib/auth';
import { EXPIRY_WARNING_DAYS, roleById, subjectStatusLabels, summarise } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';

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

/* "Sister Naledi Mokoena" initials to NM, not SN. A form of address is not part of a name, and an
   avatar that reads SN for every sister on the register identifies nobody. */
const HONORIFICS = /^(sister|brother|dr|mr|mrs|ms|prof)\b\.?$/i;
export function initialsOf(name: string) {
 const words = name.split(/\s+/).filter(w => !HONORIFICS.test(w));
 return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
}
/* The register entry behind the person, and the sentence the sidebar shows about it. Derived from
   the same summarise() the vetting console decides with, so a workspace cannot look cleared here
   while the console has suspended it.
   A countdown is only news inside the window the contract warns on. "SANC registration renews in
   243 days" is a number nobody can act on taking up the one line the sidebar has for something a
   clinician might need to do today, so outside EXPIRY_WARNING_DAYS it says what is passing instead. */
export function whoIs(subjectId: string, withdrawn: string) {
 const subject = subjectById(subjectId)!;
 const state = summarise(subject);
 const due = state.nextDue && state.nextDue.days >= 0 && state.nextDue.days <= EXPIRY_WARNING_DAYS ? state.nextDue : null;
 const credential = state.status === 'suspended' || state.status === 'declined'
  ? `${subjectStatusLabels[state.status]}. ${withdrawn}`
  : due ? `${due.check.name} renews in ${due.days} days.`
   : `${state.passed} of ${state.total} checks passing on the register.`;
 return { subject, roleName: roleById(subject.roleId)?.name ?? '', state, credential, initials: initialsOf(subject.name),
  stopped: state.status === 'suspended' || state.status === 'declined' };
}
const signedInAs = (role: StaffRole) => whoIs(workspaces[role].subjectId, 'Dispatch is withdrawn until this is put right.');

export default function StaffApp() {
 const [role, setRole] = useState<StaffRole | null>(null);
 /* Signing out returns to the door rather than to a different workspace, which is the whole
    difference between an account and a picker. */
 return role ? <StaffWorkspace role={role} onSignOut={() => setRole(null)}/> : <StaffSignIn onOpen={setRole}/>;
}

/* ---- The door ---------------------------------------------------------------------------------
 *
 * The identity service is installed and deliberately switched off until DNS, TLS and an SMS
 * provider exist, so this screen has to work with nothing behind it and say so rather than draw a
 * password box that goes nowhere. With a service answering it is a real one-time code. Without one
 * there are no accounts, and therefore no role for an account to carry — so the workspace is chosen
 * here, once, on the only screen in the application that admits it is choosing.
 */
function StaffSignIn({ onOpen }: { onOpen: (role: StaffRole) => void }) {
 const [live, setLive] = useState(false);
 const [phone, setPhone] = useState('');
 const [challenge, setChallenge] = useState<string | null>(null);
 const [code, setCode] = useState('');
 const [person, setPerson] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 useEffect(() => { document.title = 'Sign in · MyThuso for clinicians'; }, []);
 useEffect(() => { let cancelled = false; void probe().then(ok => { if (!cancelled) setLive(ok); }); return () => { cancelled = true; }; }, []);
 const phoneOk = /^0\d{9}$/.test(phone.replace(/\s/g, ''));
 const request = async () => {
  setBusy(true); setError('');
  const started = await startSignIn(phone);
  setBusy(false);
  if (!started.ok) return setError(started.message);
  setChallenge(started.challengeId); setCode('');
 };
 const verify = async () => {
  if (!challenge) return;
  setBusy(true); setError('');
  const verified = await verifyCode(challenge, code);
  setBusy(false);
  if (!verified.ok) return setError(verified.message);
  setPerson(verified.person.name ?? verified.person.phone);
 };
 return <div className="onboarding">
  <div className="onboard-panel">
   <img src="/logo.svg" alt="MyThuso — Help. Health. Home." className="onboard-brand"/>
   <h2>MyThuso for clinicians.</h2>
   <p className="muted">The workspace a nurse, a doctor, a pharmacy partner and the Control Tower sign in to. Patients and families sign in to a different application at a different address.</p>
   <div className="onboard-note"><ShieldCheck size={17}/>Nothing opened from here reaches a patient, a record, a payment or a device.</div>
  </div>
  <div className="onboard-form"><div className="onboard-body">
   <h1>Sign in to your workspace</h1>
   <NotConnected of="accounts"/>
   {live && !person ? <>
    <p className="muted">We’ll send a one-time code to the number on your staff record. There is no password to remember, and none to lose.</p>
    {!challenge ? <>
     <label>Mobile number<div className="phone-field"><span>+27</span>
      <input inputMode="numeric" autoFocus value={phone} onChange={e => { setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12)); setError(''); }} placeholder="082 000 0000"/>
     </div></label>
     <button className="primary full" disabled={!phoneOk || busy} onClick={request}>{busy ? 'Sending…' : 'Send my code'}<ArrowRight size={16}/></button>
    </> : <>
     <label>The six digits we sent you<input inputMode="numeric" autoFocus value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="000000"/></label>
     <button className="primary full" disabled={code.length < 6 || busy} onClick={verify}>{busy ? 'Checking…' : 'Sign in'}<ArrowRight size={16}/></button>
    </>}
    {error && <p className="helper" role="alert">{error}</p>}
   </> : null}
   {/* Why a person is being asked to pick, in both states, before they are asked to pick. A screen
       that offers a choice it has not explained is a screen that is hiding what it is doing. */}
   <p className="muted">{person
    ? `You are signed in as ${person}. The identity service holds identity and nothing else — it does not yet carry a clinical role — so the workspace is still chosen here rather than granted by your account.`
    : 'There are no accounts to sign in to yet, and so no role for an account to carry. Choose the workspace you need to see. Everybody in it is a fictional party from the vetting register.'}</p>
   <div className="staff-signin-roles">{staffRoles.map(r => {
    const who = signedInAs(r);
    return <button className="record-row" key={r} onClick={() => onOpen(r)}>
     <span className="avatar small">{who.initials}</span>
     <span><strong>{r}</strong><small>{who.subject.name} · {who.roleName} · {who.subject.reference}</small></span>
     <ArrowRight size={17}/>
    </button>;
   })}</div>
  </div></div>
 </div>;
}

/* ---- The workspace ----------------------------------------------------------------------------- */
function StaffWorkspace({ role, onSignOut }: { role: StaffRole; onSignOut: () => void }) {
 const { sections } = workspaces[role];
 const [section, setSection] = useState<string>(sections[0].id);
 const [modal, setModal] = useState<string | null>(null);
 const who = signedInAs(role);
 const go = (id: string) => { setSection(id); window.scrollTo({ top: 0, behavior: 'instant' }); };
 const home = () => go(sections[0].id);
 useEffect(() => { document.title = `${section} · ${role} · MyThuso`; }, [section, role]);
 const signOut = () => { void endSession(); onSignOut(); };
 /* Suspended is not a badge here, it is the first thing on the screen. A clinician whose clearance
    lapsed overnight needs to be told before she reads a schedule she is no longer dispatchable
    against — the arithmetic is in lib/vetting, and this is where it becomes a sentence. */
 const stopped = who.stopped;
 return <div className="app-shell">
  <a href="#main" className="skip-link">{t('shell.skip', 'en-ZA')}</a>
  <aside className="sidebar">
   <button className="brand" onClick={home}><img src="/logo.svg" alt="MyThuso — Help. Health. Home."/></button>
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
   <nav aria-label="Main navigation">{sections.map(({ id, icon: Icon }) =>
    <button key={id} aria-current={section === id ? 'page' : undefined} className={section === id ? 'active' : ''} onClick={() => go(id)}>
     <Icon size={19} strokeWidth={1.8}/><span>{id}</span>
    </button>)}</nav>
   <div className="sidebar-bottom">
    {/* No help card, no wallet, no language picker. The shell strings a picker would switch are the
        patient's navigation, and clinical wording is never translated at all — lib/i18n.ts is where
        that rule lives. A control that changes nothing while claiming access is worse than none. */}
    <button className="settings-link" onClick={signOut}><LogOut size={18}/>Sign out</button>
   </div>
  </aside>
  <div className="workspace">
   <header className="topbar staff-topbar">
    <div className="staff-who">
     <span className="avatar small">{who.initials}</span>
     <span><strong>{who.subject.name}</strong><small>{who.roleName} · {who.subject.reference}</small></span>
    </div>
    <div className="breadcrumb">{role}<span>/</span><strong>{section}</strong></div>
    <div className="topbar-actions">
     <button className="icon-button" aria-label="Sign out of this workspace" onClick={signOut}><LogOut size={19}/></button>
    </div>
   </header>
   {/* Not a button any more. It opened a menu of workspaces to preview, which is a development
       affordance; the sentence it carried is not, so the sentence stays and the affordance goes. */}
   <p className="demo-pill" role="note"><span className="status-dot"/>{t('shell.previewBadge', 'en-ZA')}</p>
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
  {modal && <Modal title={staffModalTitle(modal)} onClose={() => setModal(null)}>{staffModalBody(modal, () => setModal(null))}</Modal>}
 </div>;
}

function renderSection(role: StaffRole, section: string, open: (m: string) => void, home: () => void) {
 if (role === 'Nurse') {
  if (section === 'Assessments') return <VisitAssessment onClose={home}/>;
  if (section === 'Thuso Kit') return <ThusoKit/>;
  if (section === 'Earnings & payouts') return <Earnings/>;
  if (section === 'Vetting') return <VettingApplication roleId="nurse" onClose={home}/>;
 }
 if (role === 'Doctor') {
  if (section === 'Teleconsultation') return <Teleconsult/>;
  if (section === 'Patient context') return <PatientFile open={open}/>;
  if (section === 'Consultation records') return <ConsultationRecord/>;
 }
 if (role === 'Partner' && section === 'Substitution & repeats') return <Dispensing/>;
 if (role === 'Control Tower') {
  if (section === 'Vetting queue') return <NurseVetting onClose={home}/>;
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

/* What each section is for, in the words a person doing the job would use. The four door sections
   keep the sentences the contract-adjacent table in features/Pages.tsx already wrote for them
   rather than a second set that would drift. */
const sectionBlurb: Record<string, string> = {
 Schedule: 'Today’s visits, in the order you will do them, and the one still waiting for your sign-off.',
 'Review queue': 'Cases waiting to be read. Decision support may draft; only a registered doctor signs.',
 Dispatch: 'Where every visit is, which nurses are free, and what is running late.',
 Incidents: 'What went wrong, how severe it is, and who is holding it.',
 Orders: 'Prescriptions and laboratory orders routed to this partner, and what each is waiting on.',
 Collections: 'Sample collections booked against this partner, and the windows they have to be inside.',
 Results: 'Results this partner has produced, and what is holding each one back from release.',
 Protocols: sectionDoor.Protocols,
 Quality: sectionDoor.Quality
};
/* Urgency first: what is waiting, how long it has waited, and what to do about it. Counted only on
   the sections that are a board — a strip of a nurse's earnings above a page about protocols is
   three numbers with nothing to do with the screen under them. */
const metricsFor: Record<StaffRole, readonly (readonly [string, string, string])[]> = {
 Nurse: [['Next visit', '09:00', 'Rosebank · in 40 minutes'], ['Today’s visits', '3', 'One awaiting sign-off'], ['This week so far', 'R 598', 'Pays Wednesday']],
 Doctor: [['Awaiting review', '12', 'Longest waiting 3 h 20 m'], ['Priority reviews', '2', 'Flagged out of range'], ['Reviewed today', '18', 'Median 4 m 10 s']],
 Partner: [['Open orders', '8', '2 past their collection window'], ['Scheduled collections', '4', 'Next 11:15'], ['Ready for release', '3', 'Awaiting a clinician']],
 'Control Tower': [['Active visits', '24', '3 running late'], ['Available nurses', '18', '4 off duty'], ['Open incidents', '3', '1 severity high']]
};
/* Three columns rather than one bold string with two middle dots in it. A reference, what the case
   is, and what state it is in are three different questions, and a reader scanning a queue answers
   the third one first — so it is a badge in its own column at the end of the row, aligned down the
   list, instead of the last few words of a sentence. */
const BOARDS = ['Schedule', 'Review queue', 'Dispatch', 'Incidents', 'Orders', 'Collections', 'Results'];

function StaffSection({ role, section, open }: { role: StaffRole; section: string; open: (m: string) => void }) {
 const board = BOARDS.includes(section);
 /* The sections rendered by a feature component that draws its own <h1>. */
 const headsItself = section === 'Dispatch' || section === 'Orders' || section === 'Collections'
  || section === 'Results' || section === 'Schedule' || section === 'Review queue';
 return <>
  {/* Two sections head themselves, and better than this can: the dispatch board and the fulfilment
      queue carry a live subtitle counting what is actually waiting. The shell gives them the role
      eyebrow and gets out of the way, because two h1 elements on one page is not a heading, it is a
      reader having to guess which one is the page. */}
  <div className="page-intro"><div><div className="eyebrow">{role.toUpperCase()}</div>
   {headsItself ? null : <><h1>{section}</h1><p>{sectionBlurb[section] ?? sectionDoor[section] ?? ''}</p></>}</div></div>
  {board && <div className="metric-grid">{metricsFor[role].map(([k, v, note]) =>
   <div className="panel metric" key={k}><span>{k}</span><strong>{v}</strong><small>{note}</small></div>)}</div>}
  {section === 'Schedule' ? <NurseSchedule open={open}/>
   : section === 'Review queue' ? <ReviewQueue open={open}/>
: section === 'Dispatch' ? <DispatchBoard/>
   : section === 'Incidents' ? <><SectionTitle title="Open incidents"/><IncidentBoard open={open}/></>
    : section === 'Orders' || section === 'Collections' || section === 'Results' ? <FulfilmentQueue open={open}/>
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
function staffModalBody(modal: string, close: () => void) {
 if (modal === 'Visit assessment' || modal.startsWith('Nurse case:')) return <VisitAssessment onClose={close}/>;
 if (modal.startsWith('Doctor review') || modal.startsWith('Doctor case:')) return <DoctorReview onClose={close}/>;
 if (modal.startsWith('Prescription ') || modal === 'Pharmacy orders') return <PrescriptionDetail reference={modal.replace('Prescription ', '')}/>;
 if (modal.startsWith('Laboratory order ') || modal === 'Laboratory results') return <LabOrderDetail reference={modal.replace('Laboratory order ', '')}/>;
 if (modal.startsWith('Incident ') || modal === 'Incident management') return <IncidentDetail reference={modal.replace('Incident ', '')} onClose={close}/>;
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return <NurseVetting onClose={close}/>;
 if (modal === 'Vetting application') return <VettingApplication onClose={close}/>;
 if (modal === 'Thuso Kit' || modal === 'Thuso Kit connection' || modal === 'Diagnostic kit') return <ThusoKit onClose={close}/>;
 if (modal === 'Weekly payouts' || modal === 'Earnings & payouts') return <Earnings/>;
 if (modal === 'Employer programmes' || modal === 'Programme administration') return <Programmes/>;
 if (modal === 'Consultation record') return <ConsultationRecord onClose={close}/>;
 if (modal === 'Teleconsultation' || modal === 'Teleconsultation call') return <Teleconsult onClose={close}/>;
 return <StaffDetail title={modal} close={close}/>;
}
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
