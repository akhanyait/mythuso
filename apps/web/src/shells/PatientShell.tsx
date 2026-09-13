import type { ReactNode } from 'react';
import { Activity, Ambulance, ArrowRight, Bell, CalendarDays, ChevronDown, CircleHelp, CreditCard, Globe, HeartHandshake, House, Languages, LayoutGrid, MapPin, MessageCircle, NotebookPen, Settings2, Stethoscope, Users } from 'lucide-react';
import { DemoBar } from '../features/DemoLogin';
import { locales, useT, type LocaleCode } from '../lib/i18n';

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
/* The classes a dialog opened from this surface has to carry, in the one place that knows them.
   A dialog is rendered into the browser's top layer rather than inside the shell that opened it, so
   it cannot inherit the patient surface — it is told; `glass` gives it the same frosted material as
   the sidebar and the top bar it opened from. Every caller passed them by hand, which was fine while
   App.tsx was the only caller and stopped being fine when the demo login became a second. */
export const PATIENT_SURFACE = 'patient-surface glass';

const navigation = [
 ['Overview', House], ['Book a nurse', Stethoscope], ['My visits', CalendarDays], ['Health Passport', Activity],
 ['Live well', NotebookPen], ['My family', Users], ['Care plans', HeartHandshake], ['Thuso Wallet', CreditCard],
 ['Explore MyThuso', LayoutGrid]
] as const;
/* The sections a link may open. `?open=` on the product's address is how the landing page's hero
   sends a reader to the screen its call to action named, and it is validated against this list
   rather than against a second copy of it — a slug nothing here answers to opens the overview. */
export const patientSections = navigation.map(([page]) => page);
const tabs = [
 ['Overview', 'Home', House], ['Book a nurse', 'Book care', Stethoscope], ['My visits', 'Visits', CalendarDays],
 ['Health Passport', 'Passport', Activity], ['More', 'More', LayoutGrid]
] as const;

type Props = {
 page: string;
 navigate: (page: string) => void;
 open: (modal: string) => void;
 locale: LocaleCode;
 location: string;
 visitCount: number;
 children: ReactNode;
};

export function PatientShell({ page, navigate, open, locale, location, visitCount, children }: Props) {
 const t = useT();
 return <div className="app-shell patient-surface">
  {/* The luminous ground, behind everything and going nowhere. See surface/patient.css for why it is
      a pane of its own rather than a background on the shell.

      `m-light` puts the pointer-following light here and only here. That is the whole safety
      argument for it: this pane is fixed, empty, aria-hidden and behind every panel, so a light
      moving across it can never be a light moving under a word. It is white, so it can only lift
      the ground and never lower it, which is what keeps --glass-floor true. */}
  <div className="patient-ground aurora m-light" aria-hidden="true"/>
  <a href="#main" className="skip-link">{t('shell.skip')}</a>
  <aside className="sidebar glass">
   <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview'); }}><img src="/brand/mythuso-logo.svg" alt="MyThuso"/></a>
   <div className="nav-label">{t('nav.section')}</div>
   {/* Icon, label, and a circular arrow at the trailing edge — the reference's own navigation shape.
       The circle is decorative on an inactive row and inverts on the active one, which is what makes
       where-you-are read as a place rather than as one more thing to press. */}
   <nav aria-label="Main navigation">{navigation.map(([label, Icon]) =>
    <button key={label} aria-current={page === label ? 'page' : undefined} className={page === label ? 'active' : ''} onClick={() => navigate(label)}>
     <Icon size={19} strokeWidth={1.8}/><span>{t(`nav.${label}`)}</span>
     {label === 'My visits' && <span className="nav-count">{visitCount}</span>}
     {label === 'Care plans' && <span className="new-dot"/>}
     <i aria-hidden="true"><ArrowRight size={16}/></i>
    </button>)}</nav>
   <div className="sidebar-bottom">
    <div className="help-card">
     <span className="help-symbol"><MessageCircle size={19}/></span>
     {/* "Let's talk" opened a dialog with a search box and a sentence about live support. There
         is nobody to talk to — `messaging` is not connected — so the card offers what the screen
         behind it actually is: an account of what MyThuso can answer without anybody being
         reachable. */}
     <h3>A helping hand?</h3><p>What we can answer without anybody to write to.</p>
     <button onClick={() => navigate('Help & support')}>See what is here<ArrowRight size={15}/></button>
    </div>
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
    <button className="settings-link" onClick={() => navigate('Language & access')}><Languages size={18}/>{t('nav.Language & access')}</button>
    <button className="settings-link" onClick={() => navigate('Privacy & settings')}><Settings2 size={18}/>{t('nav.Privacy & settings')}</button>
    <button className="profile" onClick={() => open('Your profile')}><span className="avatar small">LM</span><span><strong>Lerato Molefe</strong><small>{t('shell.personal')}</small></span><ChevronDown size={15}/></button>
   </div>
  </aside>
  <div className={`workspace ${page === 'Overview' ? 'is-home' : ''}`}>
   <header className="topbar glass">
    {/* The mark, not the lockup. The sidebar gives logo.svg 168 points of width and the wordmark
        reads there; this bar gives it about a hundred, and on a phone the tagline under it lands
        below two points — the same defect the iOS toolbar had and the sign-in door had, in its third
        place. icon.svg is the icon out of that same artwork. */}
    <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Overview'); }}><img src="/brand/mythuso-mark.svg" alt="MyThuso"/></a>
    <div className="breadcrumb">{t('shell.breadcrumb')}<span>/</span><strong>{t(`nav.${page}`)}</strong></div>
    <div className="topbar-actions">
     <button className="location-button" onClick={() => open('Your location')}><MapPin size={16}/><span>{location}</span><ChevronDown size={13}/></button>
     <span className="topbar-divider"/>
     <button className="icon-button notification-button" aria-label="Notifications" onClick={() => open('Notifications')}><Bell size={19}/><i/></button>
     <button className="avatar small" aria-label="Your profile" onClick={() => open('Your profile')}>LM</button>
    </div>
   </header>
   {/* The disclosure sits outside the action cluster because on a phone it cannot share a row with
       the wordmark and two controls — at 390px the profile button was drawn ten pixels off the
       right edge, and the first thing a squeezed top bar loses is the sentence saying none of this
       is real. It becomes a full-width band under the bar instead, which also survives the six
       locales where "Design preview" is three words long.

       Beside it now, in the same band, is the way into the other five workspaces. The band was the
       right home for it: it is already the strip that says this is a preview, and the switcher is
       the one control in the product that is only there because it is one. */}
   <DemoBar note={t('shell.previewBadge')} surface={PATIENT_SURFACE}/>
   <main id="main" tabIndex={-1}>{children}</main>
   <footer className="app-footer">
    <span>© 2026 MyThuso. {t('shell.tagline')}</span>
    <button onClick={() => navigate('Help & support')}><CircleHelp size={14}/>{t('shell.help')}</button>
   </footer>
   <nav className="tabbar glass" aria-label="Primary">{tabs.map(([target, label, Icon]) =>
    <button key={target} aria-current={page === target ? 'page' : undefined} className={page === target ? 'active' : ''} onClick={() => navigate(target)}>
     <span className="tab-icon"><Icon size={21} strokeWidth={1.9}/>{target === 'My visits' && <span className="nav-count">{visitCount}</span>}</span>
     {t(`tab.${label}`)}
    </button>)}</nav>
  </div>
 </div>;
}
