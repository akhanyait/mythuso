import { useEffect, useLayoutEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { Wordmark } from '../components/Wordmark';
import {
 Ambulance, Apple, BadgeCheck, Bell, BellRing, BookOpen, ChevronDown, CircleHelp, Compass, CreditCard, Ellipsis, Globe, HandCoins,
 Handshake, History, Languages, Library, Lightbulb, LogOut, MapPin, Milestone, Navigation, Repeat, Search, Share2, ShieldAlert,
 ShieldCheck, ShieldPlus, Thermometer, TrendingUp, Bluetooth, Footprints, LifeBuoy, Video
} from 'lucide-react';
/* Only the names the router opens, generated from their contracts; the pages and their words stay behind
   the dynamic imports App.tsx reaches them through. */
import { patientPageRoutes, patientPagesHubRoute } from '../lib/patient-pages-routes.generated';
import { careTipsRoute } from '../lib/care-tips-route.generated';
import { patientScreenRoutes } from '../lib/patient-screens-routes';
/* The shared component and the icon family, imported from their own modules rather than the barrel so
   the patient's entry carries the one component it draws and not the seventeen it does not. */
import { NavigationItem } from '../ui/NavigationItem';
import {
 MyThusoDashboardIcon, MyThusoFamilyIcon, MyThusoHealthIcon, MyThusoMedicationIcon, MyThusoMindIcon, MyThusoQuickIcon,
 MyThusoSettingsIcon, MyThusoVisitIcon, MyThusoMessagesIcon, MyThusoResultsIcon
} from '../ui/icons/MyThusoIcons.generated';
import { locales, signLanguage, useT, type LocaleCode } from '../lib/i18n';
/* The module list the Explore page draws, so the row that opens it counts what it opens. Already on the
   patient's first load — App.tsx and the Dashboard import it statically — so this costs a few bytes. */
import { modules } from '../lib/catalog';
import { reducedMotion } from '../lib/motion';

/* The patient application's chrome, and only the patient's.
 *
 * It used to be everybody's. A nurse, a doctor, a pharmacy partner, the Control Tower and the back
 * office all rendered inside this sidebar, so a nurse reading her schedule was shown a location
 * picker for booking a visit, a help card written for a patient, a profile button carrying another
 * person's initials, and a workspace-switching menu that is a development affordance rather than a
 * product. The clinical and back-office shells are separate applications now, at separate entries,
 * and this file has no idea they exist.
 *
 * What went with them: the account-switch row, whose only job was to open that menu, and the button
 * around the preview notice. The notice itself stays — it is true, and a shipped preview that stops
 * saying it is a preview is the one defect this codebase will not tolerate. */

/* Live well sits between the Passport and the family, which is where the founder's prototype puts
   it — beside Care, Visit, Passport and Family. It is a sidebar row and not a sixth tab on a phone:
   a strip of five 44px targets is what 320px holds, and the sixth would have taken the width from
   the four a person navigates by. Below 1000px it is the first row in the More hub instead.

   Explore MyThuso stays last. tests/deep-journeys.spec.ts reaches it by position, deliberately,
   because that journey has switched the shell into isiZulu and cannot name it. */
/* The class a dialog opened from this surface has to carry, in the one place that knows it. A dialog
   is rendered into the browser's top layer rather than inside the shell that opened it, so it cannot
   inherit the patient surface — it is told. It carried `glass` as well until the Lovable identity of
   28 September 2026, whose guidelines refuse frosted panels: a dialog is now the handoff's white card,
   like the bars it opens from. */
export const PATIENT_SURFACE = 'patient-surface';

/* The MyThuso family for the destinations it draws — the overview, booking (the quick action: the thing a
   patient does most), the visits, the passport, Live well and the family — and Lucide for the four it
   does not: the plans (a repeat, because a plan is the visit that keeps coming), the wallet, the
   health-pages hub (a book, for the library and the eight pages it gathers — a book and not a heart,
   because a heart is the health icon's own neverBeside and the passport beside it already wears the
   family's health mark), and the directory of everything else. One concept, one family: the Lucide
   glyphs are chosen from outside every MyThuso icon's neverBeside list in packages/catalog/icons.json,
   so a heart, a grid or a house
   never stands beside the family's own for the same idea. */
/* The sidebar in the Lovable export's arrangement (30 September 2026): labelled groups that fold, in the
   export's order — Overview, Care, My Health, Wellness, Devices, Family & Safety, Account — holding a row
   for every patient screen that exists and is reachable by name. The export draws twenty-eight rows;
   the ones it draws for a screen this build does not have are not here, and its invented counts
   ("Messages 2", "Devices 1") are not here either — the visit count is, because it is counted from the
   visit list. A group with one row has no heading: a fold around one destination is a second press for
   nothing, which is also why Overview stays the first button in the landmark and Explore the last.

   Every group starts open. The export opens only the group you are in; here a folded group would take
   its rows out of reach of every journey that navigates by the row's name, and a reader arriving from
   a link would meet five closed headings with the thing they came for inside one of them. Folding is
   the reader's choice, held for the session in memory only, and the group holding the current page
   opens itself again when the page changes.

   To add a row: append `[pageName, Icon, line]` to the group's `rows`, where pageName is exactly what
   App.tsx routes on. It becomes a sidebar row, a row in the phone's More hub (Pages.tsx#MoreHub) and a
   `?open=` destination together — one table, so the same patient is not shown two maps of one app.

   The third element is the hub's one line under the name, which a phone has the width for and the
   sidebar does not; the sidebar never draws it. It says what the screen is, never what it promises, and
   it must not contain another row's name: the hub is searched by a row's words (tests/nav.ts), and a line
   that names a later row answers for it. tests/patient-shell.spec.ts fails if one does.

   "Another row's name" means every row in this table, including the ones a phone no longer sees here.
   Since 5 October 2026 the More hub folds My Health, Wellness and Devices into its one Explore MyThuso
   row and draws them on the Explore page instead (Pages.tsx#EXPLORE_FOLDED), and goSection searches the
   hub before it opens Explore — so a folded row is still answered for by a line in a group it is not
   in. That is what happened: the wallet's line said "activity", Activity is in Wellness, and on a phone
   the wallet opened when a journey asked for Activity. A folded row is out of sight, not out of reach. */
type NavRow = readonly [string, ComponentType, string?];
export const navGroups: { id: string; label?: string; rows: NavRow[] }[] = [
 { id: 'overview', rows: [['Overview', MyThusoDashboardIcon]] },
 { id: 'care', label: 'Care', rows: [
  ['Book a nurse', MyThusoQuickIcon], ['My visits', MyThusoVisitIcon], ['Care plans', Repeat, 'Ongoing care and subscriptions'],
  [patientPageRoutes.reminders.opens, BellRing, patientPageRoutes.reminders.sub],
  [patientScreenRoutes.messages.opens, MyThusoMessagesIcon, 'One thread for each visit, with the nurse on it'],
  [patientScreenRoutes.consultation.opens, Video, 'When your nurse asks a doctor to join: who, and what you are asked']
 ] },
 { id: 'health', label: 'My Health', rows: [
  ['Health Passport', MyThusoHealthIcon], [patientPagesHubRoute.opens, BookOpen, 'The health pages, gathered on one screen'],
  [patientScreenRoutes.results.opens, MyThusoResultsIcon, 'Your documents, the trend and what readings measure'],
  ['Health trends', TrendingUp, 'How your readings have changed'], ['Care timeline', History, 'Everything on your record, in order'],
  ['Your care team', BadgeCheck, 'Who has been in your record'], ['What happens to a prescription', MyThusoMedicationIcon, 'Each step after a doctor signs one'],
  [patientPageRoutes['symptom-checker'].opens, Thermometer, patientPageRoutes['symptom-checker'].sub],
  [patientPageRoutes['risk-assessment'].opens, ShieldAlert, patientPageRoutes['risk-assessment'].sub],
  [patientPageRoutes.vaccinations.opens, ShieldPlus, patientPageRoutes.vaccinations.sub],
  [patientPageRoutes['health-timeline'].opens, Milestone, patientPageRoutes['health-timeline'].sub],
  ['Share part of your record', Share2, 'A link that opens part of a grant you made']
 ] },
 { id: 'wellness', label: 'Wellness', rows: [
  ['Live well', MyThusoMindIcon, 'What you did, in your own words, beside your record'], [careTipsRoute.opens, Lightbulb, 'Short, general tips to read between visits'],
  [patientPageRoutes['health-library'].opens, Library, patientPageRoutes['health-library'].sub],
  [patientPageRoutes['mental-health'].opens, LifeBuoy, patientPageRoutes['mental-health'].sub],
  [patientPageRoutes.community.opens, Handshake, patientPageRoutes.community.sub], [patientPageRoutes.nutrition.opens, Apple, patientPageRoutes.nutrition.sub],
  [patientPageRoutes.activity.opens, Footprints, patientPageRoutes.activity.sub]
 ] },
 /* The export's "Nurse visit tracker" is the arrival screen, and the export files it with the devices. */
 { id: 'devices', label: 'Devices', rows: [
  [patientScreenRoutes.devices.opens, Bluetooth, 'The kit a nurse brings, and your phone’s health store'], ['Arrival', Navigation, 'How far along your nurse is by the clock, on the day of a visit']
 ] },
 { id: 'family', label: 'Family & Safety', rows: [
  ['My family', MyThusoFamilyIcon, 'Manage your loved ones'], ['Your emergency card', ShieldCheck, 'Allergies and the medicines you take, to show or print'],
  ['Care you sponsor', HandCoins, 'What has been used, and what it cost']
 ] },
 { id: 'account', label: 'Account', rows: [
  /* "What has moved" and not "activity": the wallet's own ledger says it, and the word "activity"
     answered for the Activity row in Wellness on a phone, where the two are not in one hub. */
  ['Thuso Wallet', CreditCard, 'Balance, what has moved and sponsored care'], ['Privacy & settings', MyThusoSettingsIcon, 'Your data and app preferences'],
  /* Counted from locales.json: its spoken locales, and South African Sign Language, which the contract
     holds apart because it is the twelfth official language and not a language the interface is set in. */
  ['Language & access', Languages, `${locales.length + (signLanguage ? 1 : 0)} official languages, and what is honestly offered in each`],
  ['Help & support', CircleHelp, 'What MyThuso can answer today, and what it cannot']
 ] },
 { id: 'explore', rows: [['Explore MyThuso', Compass, `The full ${modules.length}-module roadmap`]] }
];
/* The sections a link may open. `?open=` on the product's address is how the landing page's hero
   sends a reader to the screen its call to action named, and it is validated against this list
   rather than against a second copy of it — a slug nothing here answers to opens the overview. */
export const patientSections = navGroups.flatMap(group => group.rows.map(([page]) => page));
const tabs = [
 ['Overview', 'Home', MyThusoDashboardIcon], ['Book a nurse', 'Book care', MyThusoQuickIcon], ['My visits', 'Visits', MyThusoVisitIcon],
 ['Health Passport', 'Passport', MyThusoHealthIcon], ['More', 'More', Ellipsis]
] as const;
/* The destinations a phone's tab bar carries, which the More hub leaves out rather than offering twice. */
export const patientTabSections: readonly string[] = tabs.map(([target]) => target).filter(target => target !== 'More');

type Props = {
 page: string;
 navigate: (page: string) => void;
 open: (modal: string) => void;
 locale: LocaleCode;
 location: string;
 visitCount: number;
 children: ReactNode;
 /** The floating assistant. A slot rather than an import, so this shell stays free of it and the
     patient app decides where it lives. It is drawn between the footer and the tab bar: a
     zero-height row whose orb rises from it, so on a phone it always clears the bar at whatever
     height the bar has grown to, with no measuring. */
 assistant?: ReactNode;
 /** Ends the session — App.tsx's own signOut, the one the profile dialog's Log out calls. */
 signOut?: () => void;
 /** The catalogue's search, shared with the home's search field and the service list. */
 query?: string;
 setQuery?: (q: string) => void;
};

export function PatientShell({ page, navigate, open, locale, location, visitCount, children, assistant, signOut, query, setQuery }: Props) {
 const t = useT();
 /* Which groups the reader has folded, for this session and in memory only. Opening a page reopens the
    group it lives in, so where-you-are is never inside a closed heading. */
 const [folded, setFolded] = useState<string[]>([]);
 useEffect(() => {
  const holder = navGroups.find(group => group.rows.some(([name]) => name === page));
  if (holder) setFolded(current => current.includes(holder.id) ? current.filter(id => id !== holder.id) : current);
  /* A row far down the list, opened from a link, is scrolled to inside the navigation's own scroll. */
  document.querySelector('.psb-nav [aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
 }, [page]);
 /* The flag every entrance on this surface is gated on (surface/motion.css). Set in a layout effect, so
    it is on the document before the first frame is painted and nothing visibly jumps from shown to
    hidden; never set for a reader who asked for less motion, so for them nothing starts at opacity 0.
    Taken down when the shell goes, so a workspace opened after it starts from its own rules. */
 useLayoutEffect(() => {
  if (reducedMotion()) return;
  const root = document.documentElement;
  root.dataset.motion = 'on';
  return () => { delete root.dataset.motion; };
 }, []);
 return <div className="app-shell patient-surface">
  {/* The luminous ground, behind everything and going nowhere. See surface/patient.css for why it is
      a pane of its own rather than a background on the shell.

      `m-light` puts the pointer-following light here and only here. That is the whole safety
      argument for it: this pane is fixed, empty, aria-hidden and behind every panel, so a light
      moving across it can never be a light moving under a word. It is white, so it can only lift
      the ground and never lower it, which is what keeps --glass-floor true. */}
  <div className="patient-ground aurora m-light" aria-hidden="true"/>
  <a href="#main" className="skip-link">{t('shell.skip')}</a>
  <aside className="sidebar">
   <div className="psb-brand">
    <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview'); }}><Wordmark/></a>
    <p className="psb-tagline">{t('shell.tagline')}</p>
   </div>
   {/* The handoff's navigation item: the current destination in the accent's tint, its words in the
       ink and a heavier weight, so where-you-are is never told by colour alone. The visits carry their
       count in place of the chevron, as text, so it is read with the name. A group's heading is a real
       button that says whether it is open, and its rows are hidden rather than removed when it is not,
       so aria-controls always names something. */}
   <nav aria-label="Main navigation" className="psb-nav">{navGroups.map(group => {
    const rows = group.rows.map(([label, Icon]) =>
     <NavigationItem key={label} active={page === label} icon={<Icon/>}
      count={label === 'My visits' ? visitCount : undefined} onClick={() => navigate(label)}>
      {t(`nav.${label}`)}
     </NavigationItem>);
    if (!group.label) return <div className="psb-single" key={group.id}>{rows}</div>;
    const open = !folded.includes(group.id);
    return <div className="psb-group" key={group.id}>
     <button type="button" className="psb-group__toggle" aria-expanded={open} aria-controls={`psb-${group.id}`}
      onClick={() => setFolded(open ? [...folded, group.id] : folded.filter(id => id !== group.id))}>
      <span>{t(`nav.${group.label}`)}</span><ChevronDown aria-hidden="true"/>
     </button>
     <div className="psb-group__rows" id={`psb-${group.id}`} hidden={!open}>{rows}</div>
    </div>;
   })}</nav>
   {/* The help card went when the rows came: Help & support is a row under Account now, and the card was
       a second door to it standing between the navigation and the emergency row. */}
   <div className="sidebar-bottom">
    {/* The emergency pathway, in the chrome rather than fourteen cards deep inside a roadmap page.
        It is a quiet row and not a red button on purpose: the screen it opens leads with 10177 and
        says in its first line that MyThuso is not an ambulance service, and a shouting control in
        the shell would contradict that before anybody had read it. What it must be is *findable* —
        an emergency route that is the hardest thing in the app to reach is not a route.

        It carries its own class rather than `settings-link` because it is not a setting: it sits
        above them, it is the one row here that is about care rather than about the account, and it
        is styled to say so. */}
    <button className="sos-link" onClick={() => open('Emergency & urgent care')}><Ambulance size={18}/>Emergency &amp; urgent care</button>
    <button className="settings-link" onClick={() => open('Language')}><Globe size={18}/>{t('shell.language')}: {locales.find(l => l.code === locale)?.native}</button>
    {/* Log out at the foot, where the export pins it, doing what the profile dialog's button does. Who is
        signed in moved to the top bar's profile chip; Language & access and Privacy & settings are rows
        under Account. */}
    {signOut && <button className="settings-link psb-signout" onClick={signOut}><LogOut size={18}/>Log out</button>}
   </div>
  </aside>
  <div className={`workspace ${page === 'Overview' ? 'is-home' : ''}`}>
   <header className="topbar">
    {/* The mark, not the lockup. The sidebar gives logo.svg 168 points of width and the wordmark
        reads there; this bar gives it about a hundred, and on a phone the tagline under it lands
        below two points — the same defect the iOS toolbar had and the sign-in door had, in its third
        place. icon.svg is the icon out of that same artwork. */}
    <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview'); }}><img src="/brand/mythuso-mark.svg" alt="MyThuso"/></a>
    {/* The export's global search, in the place its breadcrumb held — the page's own heading already says
        where you are. It is the catalogue's search: the same query the home's field and the service list
        read, so what it finds is care you can book, and Enter opens the list it has filtered. The export
        promises doctors and clinics as well; there is no directory of either to search. */}
    {setQuery && <form className="psb-search" role="search" aria-label="Search care" onSubmit={e => { e.preventDefault(); navigate('Book a nurse'); }}>
     <Search aria-hidden="true"/>
     <input className="ui-control" type="search" aria-label="Search care and services" placeholder="Search care and services" value={query ?? ''} onChange={e => setQuery(e.target.value)}/>
    </form>}
    <div className="topbar-actions">
     <ThemeToggle className="topbar-theme"/>
     <button className="location-button" onClick={() => open('Your location')}><MapPin size={16}/><span>{location}</span><ChevronDown size={13}/></button>
     <span className="topbar-divider"/>
     {/* No unread dot. The export drew one on every arrival, and nothing here can be unread: messaging is not
         connected (capabilities.json#messaging), the notices are a fixed fictional list, and no state says
         which of them a patient has opened. A dot that is always there says something is waiting when nothing
         is — the overstatement this preview is built against. It comes back drawn off an unread count, the
         day one exists. */}
     <button className="icon-button notification-button" aria-label="Notifications" onClick={() => open('Notifications')}><Bell size={19}/></button>
     {/* The profile chip: the avatar is the button and keeps the name "Your profile"; the name beside it is
         the chip's caption, and the button's hit area is stretched over the whole chip, so pressing the name
         opens the profile too without the button being named something it does not say. */}
     <span className="psb-profile">
      <button className="avatar small" aria-label="Your profile" onClick={() => open('Your profile')}>LM</button>
      <span className="psb-profile__who"><strong>Lerato Molefe</strong><small>{t('shell.personal')}</small></span>
      <ChevronDown aria-hidden="true" className="psb-profile__chevron"/>
     </span>
    </div>
   </header>
   {/* The disclosure sits outside the action cluster because on a phone it cannot share a row with
       the wordmark and two controls — at 390px the profile button was drawn ten pixels off the
       right edge, and the first thing a squeezed top bar loses is the sentence saying none of this
       is real. It becomes a full-width band under the bar instead, which also survives the six
       locales where "Design preview" is three words long. The demo login does not sit in this band:
       a role switch inside patient care read as an account. One notice, and no switcher. */}
   <div className="demo-bar">
    <p className="demo-pill" role="note"><span className="status-dot"/>{t('shell.previewBadge')}</p>
   </div>
   <main id="main" tabIndex={-1}>{children}</main>
   <footer className="app-footer">
    <span>© 2026 MyThuso. {t('shell.tagline')}</span>
    {/* The export's Privacy, Terms and Help Centre, less Terms: there is no terms screen to open. */}
    <span className="psb-footer-links">
     <button onClick={() => navigate('Privacy & settings')}><MyThusoSettingsIcon/>{t('nav.Privacy & settings')}</button>
     <button onClick={() => navigate('Help & support')}><CircleHelp size={14}/>{t('shell.help')}</button>
    </span>
   </footer>
   {assistant}
   <nav className="tabbar" aria-label="Primary" style={{ '--m-tab': tabs.findIndex(([target]) => target === page) } as CSSProperties}>{tabs.map(([target, label, Icon]) =>
    <button key={target} aria-current={page === target ? 'page' : undefined} className={page === target ? 'active' : ''} onClick={() => navigate(target)}>
     <span className="tab-icon"><Icon/>{target === 'My visits' && <span className="nav-count">{visitCount}</span>}</span>
     {t(`tab.${label}`)}
    </button>)}</nav>
  </div>
 </div>;
}
