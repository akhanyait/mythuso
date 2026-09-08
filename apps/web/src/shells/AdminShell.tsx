import { useEffect, useState } from 'react';
import { Activity, ArrowRight, BarChart3, BookOpen, Landmark, LayoutGrid, LogOut, Radar, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import { Modal } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { AdminConsole, adminTabs, type AdminTab } from '../features/Admin';
import { DoctorReview } from '../features/Clinical';
import { NurseVetting } from '../features/Dispatch';
import { VettingApplication } from '../features/Vetting';
import { t } from '../lib/i18n';
import { probe, endSession } from '../lib/auth';
import { roleById } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';
import { NavRow } from '../surface/Surface';
import { initialsOf, whoIs } from './StaffShell';
import '../surface/clinical.css';

/* The back office, as its own address and its own bundle.
 *
 * The admin console is eight tabs of readiness, finance, catalogue and compliance. It was reachable
 * from a patient's More menu through a workspace picker, which is two problems in one line: it is
 * not a patient's screen, and a picker is not authentication. It is its own entry now, and the
 * console keeps its own tab strip — so this shell deliberately has no second navigation beside it.
 * A sidebar listing eight sections it cannot drive is the defect the clinical shell was just cured
 * of, pointing the other way.
 */

const ADMIN_SUBJECT = 'A-901';

export default function AdminApp() {
 const [signedIn, setSignedIn] = useState(false);
 return signedIn ? <AdminWorkspace onSignOut={() => setSignedIn(false)}/> : <AdminSignIn onOpen={() => setSignedIn(true)}/>;
}

function AdminSignIn({ onOpen }: { onOpen: () => void }) {
 const [live, setLive] = useState(false);
 const subject = subjectById(ADMIN_SUBJECT)!;
 useEffect(() => { document.title = 'Sign in · MyThuso back office'; }, []);
 useEffect(() => { let cancelled = false; void probe().then(ok => { if (!cancelled) setLive(ok); }); return () => { cancelled = true; }; }, []);
 return <div className="onboarding clinical aurora">
  <div className="onboard-panel">
   <img src="/logo.svg" alt="MyThuso — Help. Health. Home." className="onboard-brand"/>
   <h2>MyThuso back office.</h2>
   <p className="muted">Vetting decisions, the service catalogue, growth, finance and what is standing between each capability and being real.</p>
   <div className="onboard-note"><ShieldCheck size={17}/>Health information is never held here. This console reads readiness, not records.</div>
  </div>
  <div className="onboard-form"><div className="onboard-body">
   <h1>Sign in to the console</h1>
   <NotConnected of="accounts"/>
   <p className="muted">{live
    ? 'An identity service is answering, but it holds identity only — it does not yet carry a back-office role, so nothing it can tell us would decide whether you may open this.'
    : 'There is no identity service answering and no account to sign in to. The console opens against a fictional staff record from the vetting register.'}</p>
   <div className="staff-signin-roles">
    <button className="record-row" onClick={onOpen}>
     <span className="avatar small">{initialsOf(subject.name)}</span>
     <span><strong>Operations console</strong><small>{subject.name} · {roleById(subject.roleId)?.name} · {subject.reference}</small></span>
     <ArrowRight size={17}/>
    </button>
   </div>
  </div></div>
 </div>;
}

/* One icon per console section, so a pill row is recognisable at a glance rather than eight
   identically-shaped words. Nothing here is decorative twice: the icon says what kind of thing the
   section is, and the label says which. */
const tabIcons: Record<AdminTab, typeof Radar> = {
 Overview: LayoutGrid, Vetting: ShieldCheck, Operations: Radar, Clinical: Activity,
 Catalogue: BookOpen, Growth: TrendingUp, Finance: Landmark, Compliance: BarChart3
};

function AdminWorkspace({ onSignOut }: { onSignOut: () => void }) {
 const [modal, setModal] = useState<string | null>(null);
 const [tab, setTab] = useState<AdminTab>('Overview');
 const { subject, roleName, state, credential, initials, stopped } = whoIs(ADMIN_SUBJECT, 'Console access is withdrawn until this is put right.');
 useEffect(() => { document.title = 'Operations console · MyThuso'; }, []);
 const signOut = () => { void endSession(); onSignOut(); };
 const who = <>
  <span className="avatar small">{initials}</span>
  <span><strong>{subject.name}</strong><small>{roleName} · {subject.reference}</small></span>
 </>;
 return <div className="app-shell clinical aurora">
  <a href="#main" className="skip-link">{t('shell.skip', 'en-ZA')}</a>
  <aside className="sidebar">
   <span className="brand"><img src="/logo.svg" alt="MyThuso — Help. Health. Home."/></span>
   <div className="staff-id">{who}</div>
   <p className={`staff-credential ${stopped ? 'stop' : state.status === 'expiring' ? 'due' : ''}`}>
    {stopped ? <ShieldAlert size={15}/> : <ShieldCheck size={15}/>}<span>{credential}</span>
   </p>
   <div className="nav-label">BACK OFFICE</div>
   {/* These eight are the console's own sections and they drive it, which is the whole difference
       from the empty column that used to stand here. A sidebar listing what it cannot open is the
       defect this shell was written to avoid; a sidebar holding the one state the screen has is
       navigation. Below 1000px it is display:none and the strip inside the console takes over. */}
   <nav className="s-nav" aria-label="Console sections">{adminTabs.map(id => {
    const Icon = tabIcons[id];
    return <NavRow key={id} icon={<Icon size={19} strokeWidth={1.8}/>} label={id} current={tab === id} onClick={() => setTab(id)}/>;
   })}</nav>
   <div className="sidebar-bottom">
    <button className="settings-link" onClick={signOut}><LogOut size={18}/>Sign out</button>
   </div>
  </aside>
  <div className="workspace surface">
   <header className="topbar staff-topbar">
    <div className="staff-who">{who}</div>
    <div className="breadcrumb">Back office<span>/</span><strong>{tab}</strong></div>
    <div className="topbar-actions">
     <button className="icon-button" aria-label="Sign out of the console" onClick={signOut}><LogOut size={19}/></button>
    </div>
   </header>
   <p className="demo-pill" role="note"><span className="status-dot"/>{t('shell.previewBadge', 'en-ZA')}</p>
   <main id="main" tabIndex={-1}><AdminConsole open={setModal} tab={tab} setTab={setTab}/></main>
   <footer className="app-footer"><span>© 2026 MyThuso · Back office</span><span>{t('shell.tagline', 'en-ZA')}</span></footer>
  </div>
  {modal && <Modal title={adminModalTitle(modal)} onClose={() => setModal(null)}>{adminModalBody(modal, () => setModal(null), setModal)}</Modal>}
 </div>;
}

/* The console's own doors. It opens two kinds of thing: a clinical review, from the queue on its
   clinical tab, and a vetting application from the vetting module it embeds. Everything else it
   names is a heading with a roadmap behind it, and says so once rather than pretending. */
function adminModalTitle(modal: string) {
 if (modal.startsWith('Doctor review')) return 'Clinical review';
 if (modal === 'Vetting application') return 'Apply for vetting';
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return 'Vetting queue';
 return modal;
}
function adminModalBody(modal: string, close: () => void, open: (m: string) => void) {
 if (modal.startsWith('Doctor review') || modal.startsWith('Doctor case:')) return <DoctorReview open={open} onClose={close}/>;
 if (modal === 'Vetting application') return <VettingApplication onClose={close}/>;
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return <NurseVetting onClose={close}/>;
 return <div className="form-stack">
  <div className="staff-blank"><h2>{modal}</h2><p>This part of the console is in the roadmap and is not drawn yet. Nothing behind this name is connected to a record, a payment or a party.</p></div>
  <button className="primary" onClick={close}>Got it<ArrowRight size={16}/></button>
 </div>;
}
