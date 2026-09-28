import { Suspense, lazy, useEffect, useState } from 'react';
import { Wordmark } from '../components/Wordmark';
import { Activity, ArrowRight, BarChart3, BookOpen, Landmark, LayoutGrid, LogOut, Radar, ScrollText, ShieldAlert, ShieldCheck, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Modal } from '../components/UI';
import { AssistantLauncher } from '../components/AssistantLauncher';
import { AdminConsole, adminTabs, type AdminTab } from '../features/Admin';
import { DemoBar, useRole } from '../features/DemoLogin';
import { DoctorReview } from '../features/Clinical';
import { NurseVetting } from '../features/Dispatch';
import { VettingApplication } from '../features/Vetting';
import { t } from '../lib/i18n';
import { endSession } from '../lib/auth';
import { whoIs, type RoleId } from '../lib/roles';
import { NavigationItem } from '../ui/NavigationItem';
import '../surface/clinical.css';
import '../surface/clinical-screens.css';

/* The back office, as its own bundle behind its own role.
 *
 * The admin console is eight tabs of readiness, finance, catalogue and compliance. It was reachable
 * from a patient's More menu through a workspace picker, which is two problems in one line: it is
 * not a patient's screen, and a picker is not authentication. It is its own lazily-loaded chunk now,
 * reached by choosing Back office on the demo login, and the console keeps its own tab strip — so
 * this shell deliberately has no second navigation beside it. A sidebar listing eight sections it
 * cannot drive is the defect the clinical shell was just cured of, pointing the other way.
 *
 * The bundle argument survived the merge of the entries: nothing here is downloaded until somebody
 * asks for the console, so a patient on a mid-range phone still pays nothing for it.
 */

const ADMIN_SUBJECT = 'A-901';

/* No door in front of this either. The console's sign-in screen said there was no account to sign in
   to and then offered one row to press, which is a menu wearing a wall's clothes; features/DemoLogin
   .tsx is that row now, beside the disclosure, on every surface. The capability's notice moved with
   it — see a-demo-login-is-not-an-account in packages/catalog/capabilities.json. */

/* One icon per console section, so a pill row is recognisable at a glance rather than ten
   identically-shaped words. Nothing here is decorative twice: the icon says what kind of thing the
   section is, and the label says which. Governance takes a document, because what it tracks is five
   documents waiting for signatures — Compliance keeps the chart, because it counts controls. */
const tabIcons: Record<AdminTab, typeof Radar> = {
 Overview: LayoutGrid, Vetting: ShieldCheck, Operations: Radar, Clinical: Activity,
 Catalogue: BookOpen, Growth: TrendingUp, Finance: Landmark, Compliance: BarChart3,
 Governance: ScrollText, Configuration: SlidersHorizontal
};

/* The parallel run's notice, fetched only at ?legacy=1 (docs/control-tower-cutover.md). */
const LegacyNotice = lazy(() => import('../features/portal/LegacyNotice'));

/* `legacy` is the parallel run. The back office is the merged portal now; this shell draws it only at
   ?role=back-office&legacy=1, read-only, for one release cycle — the console's tabs still move, so the
   old place can be checked against the new one, and every control inside a tab is refused beside the
   cutover plan's sentence and a link to the same tab in the portal. */
export default function AdminWorkspace({ audience, legacy = false }: { audience: RoleId; legacy?: boolean }) {
 const [modal, setModal] = useState<string | null>(null);
 const [tab, setTab] = useState<AdminTab>('Overview');
 const { subject, roleName, state, credential, initials, stopped } = whoIs(ADMIN_SUBJECT, 'Console access is withdrawn until this is put right.');
 useEffect(() => { document.title = 'Operations console · MyThuso'; }, []);
 /* Same as the clinical shells: leaving lands on the patient application, which is what this
    address means with no role on it. Nothing here was a session. */
 const { setRole } = useRole();
 const leave = () => { void endSession(); setRole('patient'); };
 const who = <>
  <span className="avatar small">{initials}</span>
  <span><strong>{subject.name}</strong><small>{roleName} · {subject.reference}</small></span>
 </>;
 return <div className="app-shell clinical aurora">
  <a href="#main" className="skip-link">{t('shell.skip', 'en-ZA')}</a>
  <aside className="sidebar">
   <span className="brand"><Wordmark/></span>
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
    return <NavigationItem key={id} icon={<Icon size={20} strokeWidth={1.8}/>} active={tab === id} onClick={() => setTab(id)}>{id}</NavigationItem>;
   })}</nav>
   <div className="sidebar-bottom">
    <button className="settings-link" onClick={leave}><LogOut size={18}/>Leave the console</button>
   </div>
  </aside>
  <div className="workspace surface">
   <header className="topbar staff-topbar">
    <div className="staff-who">{who}</div>
    <div className="breadcrumb">Back office<span>/</span><strong>{tab}</strong></div>
    <div className="topbar-actions">
     <button className="icon-button" aria-label="Leave the console" onClick={leave}><LogOut size={19}/></button>
    </div>
   </header>
   <DemoBar note={t('shell.previewBadge', 'en-ZA')}/>
   <main id="main" tabIndex={-1}>
    {legacy && <Suspense fallback={null}><LegacyNotice surface="back-office" section={tab}/></Suspense>}
    <AdminConsole open={setModal} tab={tab} setTab={setTab} readOnly={legacy}/>
   </main>
   <footer className="app-footer"><span>© 2026 MyThuso · Back office</span><span>{t('shell.tagline', 'en-ZA')}</span></footer>
   {/* The assistant in the back office, for the audience the door chose — the same orb, the same
       lazy panel, this audience's own questions and simulated label. Drawn at the foot of the
       column, the patient shell's own placement on a wide screen, because this shell has no tab
       bar for it to clear: the console keeps its own tab strip and no second navigation stands
       beside it. */}
   <AssistantLauncher visit={null} audience={audience}/>
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
