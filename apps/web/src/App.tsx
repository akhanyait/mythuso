import { useEffect, useState } from 'react';
import { ArrowRight, LogOut, Search, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { Modal, Pill } from './components/UI';
import { PatientShell } from './shells/PatientShell';
import { Dashboard } from './features/Dashboard';
import { Booking, type DemoVisit } from './features/Booking';
import { Explore, Family, MoreHub, Notifications, Passport, Plans, Privacy, Services, SystemStates, Visits, WalletPage } from './features/Pages';
import { HouseholdRecord, HealthSummary } from './features/Household';
import { Onboarding, SignIn } from './features/Onboarding';
import { ThusoKit } from './features/Kit';
import { ThusoSos } from './features/Sos';
import { LabOrderDetail, PrescriptionDetail } from './features/Orders';
import { AccessHistory, ConsentCentre } from './features/Consent';
import { InviteGuardian, sampleInvitations, type Invitation } from './features/Guardian';
import { Access } from './features/Access';
import { LocaleContext, locales, clinicalRule, signLanguage, missingSets, type LocaleCode } from './lib/i18n';
import { useSaslRequirement } from './lib/interpreting';
import { currentPerson, endSession, probe } from './lib/auth';
import { type Service } from './lib/catalog';

/* MyThuso for patients and families. One audience, one bundle.
 *
 * This file used to hold a `role` state and render five other audiences inside the patient's own
 * sidebar. It no longer knows they exist: the clinical workspaces live at /staff and the back
 * office at /admin, each its own entry with its own shell and its own bundle. What that buys, apart
 * from a nurse's schedule that stops looking like a patient app with the wrong menu, is the thing
 * that matters on a mid-range phone on metered data — a person opening their own visits no longer
 * downloads a dispatch board, a vetting queue and an operations console to do it.
 *
 * Two screens that were only ever reachable through the design-review menu have real doors now
 * rather than being deleted with it: the household record opens from a family member, and the
 * shareable health summary from Thuso Pass. */

export default function App() {
 const [locale, setLocale] = useState<LocaleCode>('en-ZA');
 return <LocaleContext.Provider value={locale}><PatientApp locale={locale} setLocale={setLocale}/></LocaleContext.Provider>;
}

function PatientApp({ locale, setLocale }: { locale: LocaleCode; setLocale: (l: LocaleCode) => void }) {
 const [page, setPage] = useState('Overview');
 const [modal, setModal] = useState<string | null>(null);
 const [booking, setBooking] = useState<Service | null>(null);
 const [visits, setVisits] = useState<DemoVisit[]>([]);
 const [members, setMembers] = useState<string[]>([]);
 const [invitations, setInvitations] = useState<Invitation[]>(sampleInvitations);
 const [query, setQuery] = useState('');
 const [location, setLocation] = useState('Rosebank, Johannesburg');
 const [onboarding, setOnboarding] = useState(false);
 const [signedIn, setSignedIn] = useState(true);
 const [live, setLive] = useState(false);
 const navigate = (p: string) => { setPage(p); window.scrollTo({ top: 0, behavior: 'instant' }); };
 useEffect(() => { document.title = `${page} · MyThuso`; }, [page]);
 useEffect(() => { document.documentElement.lang = locale; }, [locale]);
 /* If an identity service is answering, the preview stops pretending: you are signed in only if it
    says so. With no service the app keeps its in-memory session, which is what a design review and
    the test suite run against. */
 useEffect(() => { let cancelled = false;
  (async () => { const connected = await probe(); if (cancelled || !connected) return;
   const person = await currentPerson(); if (cancelled) return;
   setLive(true); setSignedIn(person !== null); })();
  return () => { cancelled = true; }; }, []);
 const signOut = () => { if (live) void endSession(); setSignedIn(false); setOnboarding(false); setModal(null); navigate('Overview'); };
 if (onboarding) return <Onboarding locale={locale} setLocale={setLocale} onDone={() => { setOnboarding(false); setSignedIn(true); navigate('Overview'); }} onSkip={() => { setOnboarding(false); setSignedIn(true); navigate('Overview'); }}/>;
 if (!signedIn) return <SignIn live={live} onSignIn={() => setSignedIn(true)} onCreate={() => setOnboarding(true)} onRecover={() => setOnboarding(true)}/>;
 return <>
  <PatientShell page={page} navigate={navigate} open={setModal} locale={locale} location={location} visitCount={visits.length + 1}>
   {page === 'Overview' ? <Dashboard navigate={navigate} book={setBooking} open={setModal} query={query} setQuery={setQuery} visits={visits} location={location}/>
    : page === 'Book a nurse' ? <Services book={setBooking} open={setModal} query={query}/>
     : page === 'My visits' ? <Visits visits={visits} open={setModal} book={() => navigate('Book a nurse')}/>
      : page === 'Health Passport' ? <Passport open={setModal}/>
       : page === 'My family' ? <Family members={members} invitations={invitations} onRevoke={id => setInvitations(invitations.map(i => i.id === id ? { ...i, status: 'Revoked' } : i))} open={setModal}/>
        : page === 'Care plans' ? <Plans open={setModal}/>
         : page === 'Thuso Wallet' ? <WalletPage open={setModal}/>
          : page === 'Privacy & settings' ? <Privacy open={setModal}/>
           : page === 'Language & access' ? <Access/>
            : page === 'Explore MyThuso' ? <Explore open={setModal} onOnboarding={() => setOnboarding(true)} navigate={navigate}/>
             : <MoreHub navigate={navigate} open={setModal} onSignOut={signOut}/>}
  </PatientShell>
  {booking && <Modal title="A nurse, at your door." onClose={() => setBooking(null)}><Booking service={booking} onComplete={v => { setVisits([v, ...visits]); setBooking(null); navigate('My visits'); }}/></Modal>}
  {modal && <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>{modalBody({ modal, close: () => setModal(null), navigate: (p: string) => { navigate(p); setModal(null); }, openOnboarding: () => { setModal(null); setOnboarding(true); }, reopen: (m: string) => setModal(m), locale, setLocale, query, setQuery, location, setLocation, addMember: (n: string) => { setMembers([...members, n]); setModal(null); navigate('My family'); }, addInvitation: (i: Invitation) => { setInvitations([...invitations, i]); setModal(null); navigate('My family'); }, signOut })}</Modal>}
 </>;
}
/* Four doors into the same surface: the passport's device tab, the roadmap tile, the connection
   card and the kit's own name. They are one screen because they are one question — where did this
   reading come from — and four copies of it would drift. */
const isKit = (modal: string) => modal === 'Diagnostic kit' || modal === 'Thuso Kit' || modal === 'Thuso Kit connection';
function modalTitle(modal: string) {
 if (modal.startsWith('Visit:')) return 'Your visit';
 if (modal.startsWith('Prescription ')) return 'Prescription';
 if (modal.startsWith('Laboratory order ')) return 'Laboratory order';
 if (isKit(modal)) return 'Thuso Kit';
 if (modal === 'Thuso SOS' || modal === 'Emergency & urgent care') return 'Thuso SOS';
 if (modal === 'Your consents') return 'Your consents';
 if (modal === 'Access history') return 'Who opened your record';
 if (modal === 'Thuso Family') return 'Household record';
 if (modal === 'Thuso Pass') return 'Health summary';
 if (modal === 'Switch workspace') return 'MyThuso for clinicians';
 return modal;
}
type BodyProps = { modal: string; close: () => void; navigate: (s: string) => void; openOnboarding: () => void; reopen: (s: string) => void; locale: LocaleCode; setLocale: (l: LocaleCode) => void; query: string; setQuery: (q: string) => void; location: string; setLocation: (l: string) => void; addMember: (n: string) => void; addInvitation: (i: Invitation) => void; signOut: () => void };
function modalBody(p: BodyProps) {
 const { modal } = p;
 if (modal === 'Notifications') return <Notifications/>;
 if (modal === 'System states') return <SystemStates/>;
 if (modal === 'Language') return <LanguageChoice locale={p.locale} setLocale={p.setLocale} close={p.close}/>;
 if (modal === 'Invite a guardian') return <InviteGuardian onInvite={p.addInvitation} onClose={p.close}/>;
 if (modal === 'Add a family member') return <FamilyForm onAdd={p.addMember}/>;
 if (modal === 'Share my passport') return <Sharing/>;
 if (modal.startsWith('Prescription ') || modal === 'Pharmacy orders') return <PrescriptionDetail reference={modal.replace('Prescription ', '')}/>;
 if (modal.startsWith('Laboratory order ') || modal === 'Laboratory results') return <LabOrderDetail reference={modal.replace('Laboratory order ', '')}/>;
 if (isKit(modal)) return <ThusoKit onClose={p.close}/>;
 if (modal === 'Thuso SOS' || modal === 'Emergency & urgent care') return <ThusoSos/>;
 /* The household record and the shareable summary were reachable only from a design-review menu,
    which is another way of saying they were finished screens with no door. A family member is
    exactly the question the household record answers — what may each of us see of the others — and
    Thuso Pass is the product name for the summary, so both now open from where a patient would
    look for them. */
 if (modal === 'Thuso Family') return <HouseholdRecord/>;
 if (modal === 'Thuso Pass') return <HealthSummary/>;
 if (modal === 'Your consents') return <ConsentCentre/>;
 /* Replaces the two-line sample that used to live in Detail: a real access log, refusals included. */
 if (modal === 'Access history') return <AccessHistory/>;
 /* This used to be a menu that switched the patient's shell into a nurse's, a doctor's or the
    Control Tower's. A role is not something a patient account can put on; it belongs to a different
    application at a different address, which is what this says instead. */
 if (modal === 'Switch workspace') return <div className="form-stack">
  <p className="muted">Nurses, doctors, pharmacy partners and the Control Tower work in a different application, at a different address. It is not something a patient account can open, and signing in there does not sign you in here.</p>
  <a className="primary full" href="/staff.html"><Stethoscope size={17}/>Open MyThuso for clinicians</a>
  <div className="privacy-note"><ShieldCheck size={20}/>Nothing about this account grants access to a clinical workspace.</div>
 </div>;
 if (modal === 'Your location') return <form className="form-stack" onSubmit={e => { e.preventDefault(); p.close(); }}><p className="muted">Choose a demo care area. No GPS access is requested.</p><label>Care area<select value={p.location} onChange={e => p.setLocation(e.target.value)}><option>Rosebank, Johannesburg</option><option>Soweto, Johannesburg</option><option>Randburg, Johannesburg</option></select></label><button className="primary">Save location<ArrowRight size={16}/></button></form>;
 if (modal === 'How can we help?') return <div className="form-stack"><p className="muted">Explore services or get help with your care journey.</p><form className="search-box" onSubmit={e => { e.preventDefault(); p.navigate('Book a nurse'); }}><Search size={18}/><input aria-label="Search for care" placeholder="What care are you looking for?" value={p.query} onChange={e => p.setQuery(e.target.value)}/><button className="icon-button" aria-label="Search"><ArrowRight size={18}/></button></form><div className="empty-note">Live support and emergency dispatch are not connected in this design preview.</div></div>;
 return <Detail title={modal} close={p.close} navigate={p.navigate} signOut={p.signOut}/>;
}
/* Eleven written languages and one that is not written. Two things this dialog does that a language
   picker normally does not, and both are the point of it.

   It says, on every option, whether a person who speaks the language has read it. None of them has.
   Saying so on the option itself rather than in a footnote is the difference between offering
   somebody a draft and passing one off as finished, and in a health app that difference is the
   whole thing. The sentence comes from the contract, so a locale cannot be presented as reviewed
   here while the contract says it is not — scripts/check-boundaries.mjs fails the build on it.

   And South African Sign Language is not in the list. It is an official language and it is a visual
   one: there is no written SASL for a radio button to switch the interface into, so offering it
   beside Afrikaans would be a toggle that changes nothing while claiming access. It is a
   communication requirement on the account instead, and the written language stays a separate
   choice — because a Deaf patient reads a written language too, and it is not English by default.

   It lives in this file rather than beside the shells because the patient app is the only surface
   that offers a written language at all: the shell strings are the patient's navigation, and
   clinical wording is never translated by any of them. */
export function LanguageChoice({ locale, setLocale, close }: { locale: LocaleCode; setLocale: (l: LocaleCode) => void; close: () => void }) {
 /* Not local state: the requirement travels with the account, so it is set here and read by
    booking, the call roster and the access screen out of lib/interpreting.ts. */
 const [sasl, setSasl] = useSaslRequirement();
 const chosen = locales.find(l => l.code === locale);
 const absent = missingSets(locale);
 return <div className="form-stack"><p className="muted">{clinicalRule.sentence}</p>
 <fieldset className="locale-choice"><legend>Choose your language</legend>{locales.map(l => <label key={l.code} className={locale === l.code ? 'selected' : ''}><input type="radio" name="app-locale" checked={locale === l.code} onChange={() => setLocale(l.code)}/><span><strong>{l.native}</strong><small className={l.reviewed ? '' : 'unreviewed'}>{l.reviewLabel}</small></span></label>)}</fieldset>
 {chosen?.reviewNotice && <div className="privacy-note" role="status"><ShieldCheck size={21}/>{chosen.reviewNotice}</div>}
 {absent.length > 0 && <p className="helper">{chosen?.native} covers {'the shell — navigation, the tab bar and the main actions'}. {absent.map(s => s.name).join(' and ')} {absent.length > 1 ? 'stay' : 'stays'} in English.</p>}
 <fieldset className="locale-choice"><legend>{signLanguage.name}</legend>
  <label className={sasl ? 'selected' : ''}><input type="checkbox" checked={sasl} onChange={() => setSasl(!sasl)}/><span><strong>{signLanguage.requirement.label}</strong><small>{signLanguage.requirement.detail}</small></span></label></fieldset>
 <p className="helper">{signLanguage.whyNotInTheList}</p>
 {sasl && <div className="privacy-note" role="status"><ShieldCheck size={21}/>{signLanguage.notYetBuilt}</div>}
 <button className="primary full" onClick={close}>Done<ArrowRight size={16}/></button></div>;
}
function FamilyForm({ onAdd }: { onAdd: (n: string) => void }) { const [name, setName] = useState(''); const [relation, setRelation] = useState('Parent'); return <form className="form-stack" onSubmit={e => { e.preventDefault(); if (name.trim()) onAdd(name.trim()); }}><p className="muted">Add a fictional family member to explore the experience.</p><label>Display name<input autoFocus required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aunt Thandi"/></label><label>Relationship<select value={relation} onChange={e => setRelation(e.target.value)}><option>Parent</option><option>Child</option><option>Partner</option><option>Other family member</option></select></label><div className="privacy-note"><ShieldCheck size={21}/>Production access will require identity, consent and guardian checks. Adding a person will not unlock their records.</div><button className="primary" disabled={!name.trim()}>Add demo member<ArrowRight size={16}/></button></form> }
function Sharing() { const [shared, setShared] = useState(false); return <div className="form-stack"><Pill>Sharing preview</Pill><p>Allow a verified care professional to see a limited visit summary for a defined period.</p><label>Recipient<select><option>Dr. A. Dlamini · Demo care team</option></select></label><label>Access expires<select><option>After 24 hours</option><option>After this visit</option></select></label><div className="privacy-note"><ShieldCheck size={20}/>No real link or access token is created.</div><button className={shared ? 'secondary' : 'primary'} onClick={() => setShared(!shared)}>{shared ? <><X size={17}/>Revoke demo access</> : <>Preview limited sharing<ArrowRight size={17}/></>}</button><p role="status" className="muted">{shared ? 'Demo access active. You can revoke it at any time.' : 'No active shares.'}</p></div> }
function Detail({ title, close, navigate, signOut }: { title: string; close: () => void; navigate: (s: string) => void; signOut: () => void }) {
 const [done, setDone] = useState(false);
 const visit = title === 'Visit details' || title.startsWith('Visit:');
 const isRequest = title.startsWith('Request');
 return <div className="form-stack"><Pill>Design preview</Pill>{visit ? <><h3>{title.startsWith('Visit:') ? title.slice(7) : 'Vitals & chronic check'}</h3><p>Sister Naledi Mokoena · Registered nurse</p><div className="review-line"><span>Visit status</span><strong>Confirmed · Demo</strong></div><div className="review-line"><span>Preparation</span><strong>Have your medication list ready</strong></div><p className="muted">Arrival updates, secure messaging and rescheduling will be connected in the functionality phase.</p><button className="primary" onClick={() => navigate('Health Passport')}>View Health Passport<ArrowRight size={17}/></button></> : title === 'Your profile' ? <><div className="profile-summary"><span className="avatar">LM</span><div><h3>Lerato Molefe</h3><p>Fictional patient · Personal account</p></div></div><button className="secondary full" onClick={() => navigate('Privacy & settings')}>Manage privacy & preferences<ArrowRight size={17}/></button><button className="secondary full sign-out" onClick={signOut}><LogOut size={16}/>Log out</button></> : isRequest ? <><p>{title.includes('deletion') ? 'Request account deletion. Some clinical records may need to be retained under an applicable retention schedule.' : 'Ask for inaccurate personal information to be corrected.'}</p><label>Reason (fictional information only)<textarea aria-label="Request reason" placeholder="Describe your request…" maxLength={500}/></label><button className="primary" onClick={() => setDone(true)} disabled={done}>{done ? 'Demo request recorded' : 'Preview request'}</button><p className="helper" role="status">{done ? 'Nothing has been submitted. This previews the acknowledgement state.' : 'No real request will be sent.'}</p></> : <><h3>{detailCopy(title)[0]}</h3><p className="muted">{detailCopy(title)[1]}</p><div className="empty-note">This feature is a UI preview. No clinical service, payment, permission or device connection is activated.</div><button className="primary" onClick={close}>Got it<ArrowRight size={16}/></button></>}</div>
}
function detailCopy(t: string): [string, string] { if (t.includes('connection')) return ['Choose what you share', 'Native device permissions will let you select individual reading types and withdraw access. Nothing is connected yet.']; if (t.includes('wallet') || t === 'Sponsor care') return ['Care credits, on your terms', 'Choose an amount, review the recipient and confirm through a regulated payment provider. No financial details are collected in this preview.']; if (t.includes('doctor') || t === 'Teleconsultation' || t === 'Thuso Doctor') return ['A doctor’s expertise, closer to home', 'A registered doctor reviews your case and can join a secure consultation. Scheduling, identity verification and clinical consent will come before any live consultation.']; if (t === 'Contact privacy team') return ['Your privacy contact', 'The Information Officer’s verified contact details and request tracking will be configured before launch.']; if (t.startsWith('Family profile')) return ['Care without crossing boundaries', 'Book and sponsor a visit for your loved one. Their clinical information remains private unless appropriate access is verified.']; if (t.includes('summary') || t.includes('certificate')) return ['Your care document', 'The production record will show the issuing clinician, date, review status and a secure download. This preview contains no real document.']; return ['Connected to your care journey', `${t} is included in the MyThuso feature roadmap. Its dedicated workflow will connect to the relevant clinical, operational or partner services in the functionality phase.`]; }
