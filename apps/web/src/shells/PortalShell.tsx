import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Activity, BarChart3, BookOpen, CalendarRange, Cpu, Info, KeyRound, Landmark, LayoutGrid, LogOut, Radar, ScrollText, ShieldAlert, ShieldCheck, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { AssistantLauncher } from '../components/AssistantLauncher';
import { G1Mark } from '../components/G1Mark';
import { MotionPause } from '../components/MotionPause';
import { DemoBar, useRole } from '../features/DemoLogin';
import { useVettingState } from '../features/Vetting';
import { PortalContext, type PortalContextValue } from '../features/portal/context';
import { Loading, Tablist } from '../features/portal/Parts';
import { categories, categoryById, contextParam, headingOf, overviewRefusal, pickerRefusal, placeFromSearch, portalContract, searchForPlace, tabOf, tabsOf, type ContextId, type PortalPlace } from '../lib/portal';
import { t } from '../lib/i18n';
import { endSession } from '../lib/auth';
import { useChapter, useDecor } from '../lib/motion';
import { roleOf, whoIs, type RoleId } from '../lib/roles';
import '../surface/clinical.css';
import '../surface/clinical-screens.css';
import '../features/portal/portal.css';
/* The Control Tower workspace's shell, imported whole rather than on demand. It is the parallel run's
   read-only surface, and it is also what keeps the patient's first load where it was: the portal's
   categories draw the workspace's own screens, and a portal that reached those screens by itself split
   the workspace's chunk into a dozen shared ones, each a file name the first load has to carry in its
   table of what a dynamic import needs. Imported through the workspace, they stay one chunk. */
import LegacyStaff from './StaffShell';

/* The merged MyThuso Control Tower: one portal where the Control Tower workspace and the back office
 * used to be two (docs/PROMPT-CONTROL-TOWER-UI.md §5.1, Phase 3).
 *
 * The categories, their order, their tabs and where every old tab went are packages/catalog/
 * control-tower-portal.json's, and docs/control-tower-tab-inventory.md's verdicts are honoured there
 * rather than argued with here. What this shell owns is the chrome the two old surfaces each drew
 * differently: one navigation (the categories, as a tab list — a column from 1000px, a strip below),
 * one header, the context a reader is in (site, period, and the tenant that does not exist) and the
 * address that carries all of it.
 *
 * Three things it will not do, each of them the reason for a line below:
 *
 *   It will not look like access control. The role picker above it is a preview picker; the portal
 *   says so in the capability's own sentence, beside every category, because a column of categories
 *   is exactly what a reader expects to have been filtered by permission. It has not been.
 *
 *   It will not cost a patient a byte. The shell is a dynamic import from apps/web/src/Doorway.tsx and
 *   every category below is a dynamic import of its own, fetched when the category is opened. The
 *   first load was 283.87 kB across 15 files before this, and tests/states.spec.ts holds it.
 *
 *   It will not keep anything anywhere but the address. The category, the tab, the site and the
 *   period are query parameters, written with pushState so Back walks the tabs, and read again on
 *   popstate. No storage of any kind.
 */

type Category = Parameters<typeof tabsOf>[0];
const lazyCategory = <T extends Record<string, ComponentType>>(load: () => Promise<T>, name: keyof T) =>
 lazy(() => load().then(m => ({ default: m[name] as ComponentType })));
/* One chunk per group of categories that share their screens, fetched when a category in it opens. */
const bodies: Record<string, ComponentType> = {
 overview: lazyCategory(() => import('../features/portal/Overview'), 'OverviewCategory'),
 dispatch: lazyCategory(() => import('../features/portal/Operations'), 'DispatchCategory'),
 vetting: lazyCategory(() => import('../features/portal/Operations'), 'VettingCategory'),
 quality: lazyCategory(() => import('../features/portal/Operations'), 'QualityCategory'),
 audit: lazyCategory(() => import('../features/portal/Operations'), 'AuditCategory'),
 devices: lazyCategory(() => import('../features/portal/Devices'), 'DevicesCategory'),
 gilbertone: lazyCategory(() => import('../features/portal/GilbertOne'), 'GilbertOneCategory'),
 configuration: lazyCategory(() => import('../features/portal/Configuration'), 'ConfigurationCategory'),
 finance: lazyCategory(() => import('../features/portal/BackOffice'), 'FinanceCategory'),
 compliance: lazyCategory(() => import('../features/portal/BackOffice'), 'ComplianceCategory'),
 governance: lazyCategory(() => import('../features/portal/BackOffice'), 'GovernanceCategory'),
 clinical: lazyCategory(() => import('../features/portal/BackOffice'), 'ClinicalCategory'),
 catalogue: lazyCategory(() => import('../features/portal/BackOffice'), 'CatalogueCategory'),
 growth: lazyCategory(() => import('../features/portal/BackOffice'), 'GrowthCategory')
};
/* The dialogs the categories open — an incident, a vetting decision, a doctor's review, the More
   tools — in their own chunk, fetched the first time one is opened. */
const PortalModal = lazy(() => import('../features/portal/Modals'));

/* One icon per category, so a column of fourteen is recognisable at a glance. The words carry it;
   the icon is decoration and is hidden from a screen reader. GilbertOne carries its own mark. */
const icons: Record<string, typeof Radar> = {
 overview: LayoutGrid, dispatch: Radar, vetting: ShieldCheck, quality: BarChart3, audit: CalendarRange,
 devices: Cpu, configuration: SlidersHorizontal, finance: Landmark, compliance: ShieldAlert,
 governance: ScrollText, clinical: Activity, catalogue: BookOpen, growth: TrendingUp
};
const iconFor = (category: Category) => category.id === 'gilbertone'
 ? <G1Mark className="pt-tab-g1"/>
 : (() => { const Icon = icons[category.id] ?? LayoutGrid; return <Icon size={18} strokeWidth={1.8} aria-hidden="true"/>; })();

/* The two old shells, for the parallel run and for a rollback. docs/control-tower-cutover.md: for one
   release cycle ?legacy=1 opens the Control Tower workspace or the back office as they were, read-only;
   and if a critical workflow breaks, lib/roles.ts points these two roles' surface back at 'clinical' and
   'back-office' and this door opens the old shells again with nothing else changed. Each is its own
   chunk, fetched only then. */
const LegacyBackOffice = lazy(() => import('./AdminShell'));

export default function ControlTowerDoor({ audience }: { audience: RoleId }) {
 const { surface, workspace } = roleOf(audience);
 const legacy = new URLSearchParams(window.location.search).get(portalContract.legacy.param) === portalContract.legacy.value;
 if (surface === 'portal' && !legacy) return <PortalShell audience={audience}/>;
 /* Read-only only while the portal is the surface of record. Rolled back, the old shells are the
    surface of record again and act as they did. */
 const readOnly = surface === 'portal';
 return <Suspense fallback={<Loading/>}>
  {workspace ? <LegacyStaff role={workspace} audience={audience} legacy={readOnly}/> : <LegacyBackOffice audience={audience} legacy={readOnly}/>}
 </Suspense>;
}

function PortalShell({ audience }: { audience: RoleId }) {
 const [place, setPlace] = useState<PortalPlace>(() => placeFromSearch(window.location.search, audience));
 /* Read once, at the moment the portal opens: an address with no category in it is a bookmark to
    one of the two old surfaces, and the notice is for that reader. Navigating inside the portal does
    not take it away mid-sentence. */
 const [cameByOldAddress] = useState(() => place.fromOldAddress);
 const [modal, setModal] = useState<string | null>(null);
 const [settingsEngine, setSettingsEngine] = useState('');
 const vetting = useVettingState();
 const { setRole } = useRole();
 /* The portal declares it has decorative motion, so the pause control in the topbar governs it and
    the charts later phases add arrive gated on [data-decor='on'] rather than running unstoppable. */
 useDecor();

 /* Back and forward walk the tabs, because every tab is an address. */
 useEffect(() => {
  const onPop = () => setPlace(placeFromSearch(window.location.search, audience));
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
 }, [audience]);

 const category = categoryById(place.category);
 const tab = tabOf(category, place.tab);
 /* A category change is genuinely new content, so the panel replays its entrance — keyed from React
    rather than restarted from CSS. Under reduced motion the key never changes and nothing remounts,
    which is the difference between switching an entrance off and never starting it. */
 const chapter = useChapter(category.id);
 useEffect(() => { document.title = `${headingOf(tab)} · ${category.label} · ${portalContract.name}`; }, [tab, category]);

 const navigate = useCallback((next: PortalPlace) => {
  window.history.pushState(null, '', `${window.location.pathname}${searchForPlace(audience, next)}`);
  setPlace(next);
 }, [audience]);
 const go = useCallback((categoryId: string, tabId?: string) => {
  const target = categoryById(categoryId);
  navigate({ ...place, category: target.id, tab: tabId ?? tabsOf(target)[0]!.id });
 }, [navigate, place]);
 const setContext = (id: ContextId, value: string) => navigate({ ...place, [id]: value });

 const leave = () => { void endSession(); setRole('patient'); };
 /* The founder's own door, one press from anywhere in the Control Tower. The sign-in panel lives inside
    the API Registry tab, folded under the two Azure cards — the founder could not find it on 28
    September 2026 — so the sidebar's foot names it and takes the founder there: the tab first, then,
    once the registry's lazy chunk has drawn the panel, its disclosure is opened and focused. Nothing
    here signs anybody in; the two factors are the panel's and the service's. */
 const founderDoor = () => {
  go('gilbertone', 'api-registry');
  let tries = 0;
  const open = () => {
   const details = document.querySelector<HTMLDetailsElement>('.g1-founder-details');
   if (details) {
    details.open = true;
    details.scrollIntoView({ block: 'start' });
    details.querySelector<HTMLElement>('summary')?.focus();
   } else if (tries++ < 40) setTimeout(open, 50);
  };
  setTimeout(open, 50);
 };
 const person = roleOf(audience).subjectId;
 const who = person ? whoIs(person, 'Everything this role could act on is withdrawn until that is put right.') : null;
 const value: PortalContextValue = useMemo(() => ({ audience, place, go, open: setModal, vetting, settingsEngine, setSettingsEngine }),
  [audience, place, go, vetting, settingsEngine]);
 const Body = bodies[category.id];
 const categoryItems = categories.map(c => ({ id: c.id, label: c.label, icon: iconFor(c) }));
 const identity = who && <>
  <span className="avatar small">{who.initials}</span>
  <span><strong>{who.subject.name}</strong><small>{who.roleName} · {who.subject.reference}</small></span>
 </>;

 return <PortalContext.Provider value={value}>
  <div className="app-shell clinical aurora portal">
   <a href="#main" className="skip-link">{t('shell.skip', 'en-ZA')}</a>
   <aside className="sidebar">
    <span className="brand"><img src="/brand/mythuso-logo.svg" alt="MyThuso"/></span>
    {identity && <div className="staff-id">{identity}</div>}
    <div className="nav-label">CATEGORIES</div>
    <nav aria-label="Control Tower categories" className="pt-side-nav">
     <Tablist label="Categories" items={categoryItems} selected={category.id} onSelect={id => go(id)}
      idPrefix="pt-side" panelId="pt-category" orientation="vertical"/>
    </nav>
    <div className="sidebar-bottom">
     <button className="settings-link" onClick={founderDoor}><KeyRound size={18}/>Founder sign-in · 2FA</button>
     <button className="settings-link" onClick={leave}><LogOut size={18}/>Leave the Control Tower</button>
    </div>
   </aside>
   <div className="workspace surface">
    <header className="topbar staff-topbar pt-top">
     {identity && <div className="staff-who">{identity}</div>}
     <div className="breadcrumb"><span className="pt-name">{portalContract.name}</span><span>/</span>{category.label}<span>/</span><strong>{headingOf(tab)}</strong></div>
     <div className="topbar-actions">
      <MotionPause className="pt-pause"/>
      {/* The same door on a phone, where the sidebar's foot is not drawn. */}
      <button className="icon-button" aria-label="Founder sign-in · 2FA" onClick={founderDoor}><KeyRound size={19}/></button>
      <button className="icon-button" aria-label="Leave the Control Tower" onClick={leave}><LogOut size={19}/></button>
     </div>
    </header>
    <DemoBar note={t('shell.previewBadge', 'en-ZA')}/>
    <main id="main" tabIndex={-1}>
     <div className="pt-body">
      {/* The phone's navigation: the same categories as a strip, because the sidebar is gone below
          1000px. Only one of the two is ever displayed, so a screen reader meets one. */}
      <nav aria-label="Control Tower categories" className="pt-strip-nav">
       <Tablist label="Categories" items={categoryItems} selected={category.id} onSelect={id => go(id)}
        idPrefix="pt-strip" panelId="pt-category"/>
      </nav>
      {/* Not an access control, said where a reader would assume one: the capability's own sentence
          about the switcher, then what that means for a portal of categories. */}
      <p className="pt-preview" role="note"><Info size={17} aria-hidden="true"/><span>{pickerRefusal()} {portalContract.previewPicker.sentence}</span></p>
      <ContextBar place={place} onChange={setContext}/>
      {cameByOldAddress && <p className="pt-notice" role="status">
       <span>{portalContract.notice.sentence}</span>
       <button type="button" className="text-button" onClick={() => go('overview', 'moves')}>{portalContract.notice.linkLabel}</button>
      </p>}
      <div className="pt-category rise" id="pt-category" role="tabpanel" aria-label={category.label} key={chapter}>
       {/* Keyed by category so a category's screen starts from its own first state, and wrapped in
           its own Suspense so the loading state is this panel's, not the page's. */}
       <Suspense key={category.id} fallback={<Loading/>}>{Body ? <Body/> : null}</Suspense>
      </div>
     </div>
    </main>
    <footer className="app-footer"><span>© 2026 MyThuso · {portalContract.name}</span><span>{t('shell.tagline', 'en-ZA')}</span></footer>
    {/* The assistant, for the audience the door chose — unchanged from either old shell. */}
    <AssistantLauncher visit={null} audience={audience}/>
   </div>
   {modal && <Suspense fallback={null}><PortalModal modal={modal} onClose={() => setModal(null)} open={setModal}/></Suspense>}
  </div>
 </PortalContext.Provider>;
}

/* Where the reader is: site, period and tenant, in the address (§5.2). Each says what it does and
   does not change, because two of the three change nothing yet and a control that silently changes
   nothing is a control lying about itself. */
function ContextBar({ place, onChange }: { place: PortalPlace; onChange: (id: ContextId, value: string) => void }) {
 const site = contextParam('site');
 const period = contextParam('period');
 const tenant = contextParam('tenant');
 return <div className="pt-context" role="group" aria-label="Context">
  {([['site', site], ['period', period]] as const).map(([id, p]) =>
   <label key={id} className="pt-context-field">
    <span>{p.label}</span>
    <select value={place[id]} onChange={event => onChange(id, event.target.value)} aria-describedby={`pt-context-${id}`}>
     {p.values.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
    <small id={`pt-context-${id}`}>{p.sentence}</small>
   </label>)}
  <div className="pt-context-field">
   <span>{tenant.label}</span>
   <strong className="pt-context-value">{tenant.sentence}</strong>
   {place.tenantAsked && <small role="note">{overviewRefusal('no-invented-tenant')}</small>}
  </div>
 </div>;
}
