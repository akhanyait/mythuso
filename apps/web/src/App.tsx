import { Suspense, lazy, useEffect, useState } from 'react';
import type { Hold } from '../../../packages/engines/src/access/domain/booking.ts';
import type { Thread } from '../../../packages/engines/src/access/domain/thread.ts';
import { ArrowRight, LogOut, ShieldCheck, X } from 'lucide-react';
import { AssistantLauncher } from './components/AssistantLauncher';
import { Modal, Pill } from './components/UI';
import { NotConnected } from './components/NotConnected';
import { PATIENT_SURFACE as SURFACE, PatientShell, patientSections } from './shells/PatientShell';
import { Dashboard } from './features/Dashboard';
/* Booking, moving and cancelling arrive on a dynamic import the moment somebody opens one. None of
   them is on the patient's first view, and since Wave 3 booking carries the person step and the
   Access domain behind it — code a patient reading their visits on metered data has no reason to
   download. The Suspense fallbacks sit inside the dialog, so the dialog opens at once and says so. */
const BookingFlow = lazy(() => import('./features/Booking').then(m => ({ default: m.Booking })));
const RescheduleFlow = lazy(() => import('./features/Booking').then(m => ({ default: m.Reschedule })));
const CancelFlow = lazy(() => import('./features/Booking').then(m => ({ default: m.CancelVisit })));
/* Choosing who collects a medicine carries the Medicines domain and its contract. A patient opens it from the
   prescription page, never on the first view, so it arrives on its own dynamic import like booking. */
const AuthoriseCollectorFlow = lazy(() => import('./features/Medicines').then(m => ({ default: m.AuthoriseCollector })));
/* The door check and the complaint form, from Verify, on a dynamic import too: neither is on the first view. */
const DoorCheckPage = lazy(() => import('./features/VerifyInService').then(m => ({ default: m.DoorCheck })));
const ComplaintPage = lazy(() => import('./features/VerifyInService').then(m => ({ default: m.ComplaintForm })));
/* Health Passport P1: share links, the emergency card and who opened the record. Behind a dynamic import, because
   between them they carry four contracts and a QR encoder, and the patient's first view needs none of them. */
const ShareLinksPage = lazy(() => import('./features/PassportSharing').then(m => ({ default: m.ShareLinks })));
const EmergencyCardPage = lazy(() => import('./features/PassportSharing').then(m => ({ default: m.EmergencyCard })));
const PassportLogPage = lazy(() => import('./features/PassportSharing').then(m => ({ default: m.PassportAccessLog })));
import { nurseOfVisit } from './lib/arrival';
import { capability } from './lib/capabilities';
import {
 Explore, Family, FamilyProfile, MoreHub, Notifications, Passport, PlanDetail, Plans, Privacy,
 Services, SponsorCare, TopUpWallet, VisitDetail, Visits, WalletPage, rowFor, sampleVisitRows,
 type VisitAction, type VisitRow
} from './features/Pages';
/* The household record, the health summary and the sponsor's statement, on dynamic imports since Wave 6:
   between them they carry the records contract, packages/catalog/household.json, the programmes contract and
   the Access domain behind the roster. Each is opened from a dialog or a page and none of them is on a
   patient's first view, so a patient reading her visits on metered data downloads none of it. */
const HouseholdRecordPage = lazy(() => import('./features/Household').then(m => ({ default: m.HouseholdRecord })));
const HealthSummaryPage = lazy(() => import('./features/Household').then(m => ({ default: m.HealthSummary })));
import {
 CareTeam, CareTimeline, DevicePermission, HealthTrends, MedicalCertificate, PrescriptionJourney,
 ReadingsExplained, type Integration
} from './features/Passport';
import { PastVisit } from './features/VisitSummary';
import { Arrival } from './features/Arrival';
import { LiveWell } from './features/Wellbeing';
import { GettingHelp } from './features/Help';
const SponsoredCarePage = lazy(() => import('./features/Sponsor').then(m => ({ default: m.SponsoredCare })));
const BillSplitPage = lazy(() => import('./features/BillSplit').then(m => ({ default: m.BillSplit })));
import { stateOf } from './lib/cancelling';
import { dateOf } from './lib/passport';
import { nextFirst } from './lib/scheduling';
import { Onboarding, SignIn } from './features/Onboarding';
import { RolePanel, useRole } from './features/DemoLogin';
import { sectionFromSearch } from './lib/roles';
import type { RoleId } from './lib/roles';
/* Thuso SOS and the next-of-kin settings arrive on a dynamic import. Neither is on a patient's first view, and a patient
   on metered data should not download the pathway, its routing and its engine rules to read their visits. The emergency
   numbers are not allowed to wait for that download, so the fallback is the one block the pathway puts first, read by
   name from sos.json so that only that block rides on the first load. */
import { emergency as sosEmergency } from '../../../packages/catalog/sos.json';
const ThusoSos = lazy(() => import('./features/Sos').then(m => ({ default: m.ThusoSos })));
const NextOfKinSettings = lazy(() => import('./features/NextOfKin').then(m => ({ default: m.NextOfKinSettings })));
/* Group payers and claims, on dynamic imports for the reason everything else here is: between them they carry two
   contracts, Money's ledger and every engine's settings through lib/settings, and a patient reading her visits on
   metered data opens none of them. */
const GroupAdminPage = lazy(() => import('./features/Groups').then(m => ({ default: m.GroupAdmin })));
const GroupMembershipPage = lazy(() => import('./features/Groups').then(m => ({ default: m.GroupMembership })));
const ClaimsPage = lazy(() => import('./features/Claims').then(m => ({ default: m.ClaimsOnRecord })));
/* Gift a visit, on its own dynamic import for the same reason: a giver's screen and a beneficiary's, both driven
   by Money's ledger, and neither is anything a patient reading her visits needs on her first load. */
const GiftAVisitPage = lazy(() => import('./features/Gift').then(m => ({ default: m.GiftAVisit })));
const GiftInboxPage = lazy(() => import('./features/Gift').then(m => ({ default: m.GiftInbox })));
/* A real Thuso Market order, on its own dynamic import for the same reason and one more: it carries Money's
   ledger, which the shop's own separate entry (shop.html) deliberately does not, so this stays in the app
   rather than the shop for anybody who wants to place one for real rather than only quote one. */
const MarketOrderPage = lazy(() => import('./features/MarketOrder').then(m => ({ default: m.MarketOrderPreview })));
/* Care tips, opened from a completed visit or by `?open=care-tips`: a screen nobody needs on the first view, so
   it and its contract arrive on their own dynamic import. Only two strings are here, generated from the contract
   on their own — the route's name is the contract's, so the door, the address and the screen cannot name three
   different pages, and not one tip is on the patient's first load. */
const CareTipsPage = lazy(() => import('./features/CareTips').then(m => ({ default: m.CareTips })));
import { careTipsRoute } from './lib/care-tips-route.generated';
/* The eight patient pages of the full Lovable export's Phase D and their "Your health" hub, behind one
   dynamic import for the same reason care tips are: the screens and the six knowledge files they read
   are nothing a patient needs on the first view. Only each page's name and arrival sentence are here,
   generated from packages/catalog/patient-pages.json, so the hub, the address and the screen cannot
   name three different pages, and not one knowledge entry is on the patient's first load. */
const PatientPagesView = lazy(() => import('./features/PatientPages').then(m => ({ default: m.PatientPages })));
import { patientPagesHubRoute, patientPageRoutes } from './lib/patient-pages-routes.generated';
const patientPageNames: string[] = [patientPagesHubRoute.opens, ...Object.values(patientPageRoutes).map(route => route.opens)];
const patientPageOpenings: Record<string, string> = {
 [patientPagesHubRoute.opens]: patientPagesHubRoute.opening,
 ...Object.fromEntries(Object.values(patientPageRoutes).map(route => [route.opens, route.opening])),
};
/* The patient screens the Lovable export draws and the live app did not have — connected devices, messages,
   test results and the consultation's waiting room — each on its own dynamic import, because each carries a
   different contract (the kit and the device registry, the visit threads, the Passport's results and charts,
   the consultation) and a patient opening one has no reason to download the other three. Only the names are
   here, from lib/patient-screens-routes.ts, which the sidebar and the More hub read as well. */
const PatientDevicesPage = lazy(() => import('./features/PatientDevices').then(m => ({ default: m.PatientDevices })));
const PatientMessagesPage = lazy(() => import('./features/PatientMessages').then(m => ({ default: m.PatientMessages })));
const PatientResultsPage = lazy(() => import('./features/PatientResults').then(m => ({ default: m.PatientResults })));
const PatientConsultationPage = lazy(() => import('./features/PatientConsultation').then(m => ({ default: m.PatientConsultation })));
import { patientScreenNames, patientScreenOpenings, patientScreenRoutes } from './lib/patient-screens-routes';
/* The icon family's gallery, at `?open=icons`, in development builds only: every icon of
   packages/catalog/icons.json at two sizes with its signal pulsing, so the family can be looked at and
   tested before a screen wears it. `import.meta.env.DEV` is a constant at build time, so in a production
   build the whole branch folds to null and the dynamic import is never emitted — the patient's first
   view pays nothing for it. No icon is wired into a screen yet; that is a later wave's work. */
const IconGallery = import.meta.env.DEV ? lazy(() => import('./features/IconGallery').then(m => ({ default: m.IconGallery }))) : null;
/* The shared components' gallery, at `?open=ui`, on the same terms: development builds only, behind the same
   constant and its own dynamic import, so neither the gallery nor apps/web/src/ui/ui.css reaches either entry
   until a screen imports a component. */
const UiGallery = import.meta.env.DEV ? lazy(() => import('./features/UiGallery').then(m => ({ default: m.UiGallery }))) : null;
const developmentSections = import.meta.env.DEV ? ['Icons', 'UI'] : [];
function EmergencyWhileSosLoads() {
 return <div className="sos"><div className="sos-emergency">
  <div className="sos-emergency-head"><div><strong>{sosEmergency.headline}</strong><p>{sosEmergency.lead}</p></div></div>
  <ul className="sos-numbers">{sosEmergency.numbers.map(n => <li key={n.id}><span className="sos-number">{n.number}</span><span><strong>{n.name}</strong><small>{n.whenToUse}</small></span></li>)}</ul>
  <p className="sos-preview-note">{sosEmergency.previewNote}</p>
 </div></div>;
}
import { LabOrderDetail, PrescriptionDetail } from './features/Orders';
import { AccessHistory, ConsentCentre, InformationOfficer } from './features/Consent';
import { InviteGuardian, sampleInvitations, type Invitation } from './features/Guardian';
import { LocaleContext, locales, clinicalRule, signLanguage, missingSets, type LocaleCode } from './lib/i18n';
import { useSaslRequirement } from './lib/interpreting';
import { currentPerson, endSession, probe } from './lib/auth';
import { modules, money, services, type Service } from './lib/catalog';
import { coverage, zones } from './lib/geography';
import { scrollToTop } from './lib/scroll';
import { sampleEntries, write, type Entry as WellbeingEntry } from './lib/wellbeing';
import { useDecor, usePointerLight } from './lib/motion';

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
 /* The ground's pointer light. It is decorative motion, so it is gated behind the same flag every
    other piece is — but it starts nowhere on its own: it only moves while the reader is moving a
    pointer, and it exists only for an input that can genuinely hover. That is why this surface
    carries no pause control and the landing page does. WCAG 2.2.2 is about motion that begins
    without being asked; a light that stops the instant the cursor does has already stopped. */
 useDecor();
 usePointerLight();
 /* The one thing this application knows about the other five: that a person can leave for one. The
    role itself is held above it, in src/Doorway.tsx, so nothing here imports a workspace. */
 const { setRole } = useRole();
 /* Which screen this started on. The overview, unless a link said otherwise: the landing page's
    hero offers four destinations and two of them are sections rather than the application, so
    `/app/?open=live-well` opens Live well. Read once and never written — see lib/roles.ts for why
    the address stops following a reader the moment they start navigating for themselves. */
 const [page, setPage] = useState(() => sectionFromSearch(window.location.search, [...patientSections, careTipsRoute.opens, ...patientPageNames, ...patientScreenNames, ...developmentSections], 'Overview'));
 const [modal, setModal] = useState<string | null>(null);
 const [booking, setBooking] = useState<Service | null>(null);
 /* Every visit the app knows about, in one list, because a visit you can look at and never change is
    not a visit. It used to be two: the ones a person had booked lived here and the sample ones were
    built inside the visit list itself, which is why Reschedule opened a dialog about the roadmap and
    why there was no way to cancel anything at all. Moving one moves it; standing one down moves it
    into Cancelled with the reason. Nothing is persisted — no storage of any kind on this side. */
 const [rows, setRows] = useState<VisitRow[]>(sampleVisitRows);
 const [managing, setManaging] = useState<{ id: string; action: VisitAction } | null>(null);
 const [viewing, setViewing] = useState<string | null>(null);
 /* Each visit's thread with its nurse, by visit id, held here so closing a visit and opening it again
    keeps what was written. Memory only, like the visits themselves. */
 const [threads, setThreads] = useState<Record<string, Thread>>({});
 /* Who the next booking is for. A family profile's "Book a visit for Nomsa" used to open the
    catalogue with nobody chosen, so the one thing the row promised was the one thing it did not do.
    It is cleared the moment the booking finishes or the person leaves the catalogue — a preselected
    patient that outlives the journey that set it is how somebody books a visit for the wrong
    person. */
 const [forPerson, setForPerson] = useState<string | null>(null);
 /* Which visit the arrival screen is about. It is a page rather than a dialog because it is the one
    screen a person opens on the morning of a visit and stays on, and a modal that has to be held
    open while somebody waits for a knock at the door is a modal in the way. */
 const [tracking, setTracking] = useState<string | null>(null);
 /* What somebody has written in Live well, held here for the same reason the visits are: it has to
    survive walking to another screen and back, and it may not survive anything longer than that.
    Nothing is written to storage of any kind — which is also what the capability notice on that
    screen says, so the sentence and the behaviour cannot drift apart. */
 const [wellbeing, setWellbeing] = useState<WellbeingEntry[]>(sampleEntries);
 const [members, setMembers] = useState<string[]>([]);
 const [invitations, setInvitations] = useState<Invitation[]>(sampleInvitations);
 const [query, setQuery] = useState('');
 const [location, setLocation] = useState('Rosebank, Johannesburg');
 /* Two doors behind one flag: 'first-run' is signing up, 'recovery' is the route back in when the
    phone is gone. They were one — "I've lost access to my account" on the sign-in screen opened
    sign-up, which is the screen a person in that position has already failed at. */
 const [onboarding, setOnboarding] = useState<'' | 'first-run' | 'recovery'>('');
 const [signedIn, setSignedIn] = useState(true);
 const [live, setLive] = useState(false);
 const navigate = (p: string) => { if (p !== 'Book a nurse') setForPerson(null); setPage(p); scrollToTop(); };
 /* A dialog asked for by name, except the kit's: see isKit below for why that one is a page. */
 const openModal = (m: string) => { if (isKit(m)) { setModal(null); navigate(patientScreenRoutes.devices.opens); } else setModal(m); };
 const bookFor = (person: string) => { setForPerson(person); setModal(null); setViewing(null); setPage('Book a nurse'); scrollToTop(); };
 const track = (id: string) => { setViewing(null); setTracking(id); navigate('Arrival'); };
 /* The demo household, in one place. It was built inline inside the dialog props, which meant the
    only screen that could ask who somebody is to the account holder was a dialog. */
 const people = ['Lerato Molefe', 'Nomsa Molefe', 'Thabo Molefe', ...members];
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
 const signOut = () => { if (live) void endSession(); setSignedIn(false); setOnboarding(''); setModal(null); navigate('Overview'); };
 /* What the person actually booked, and only that: the home's "next visit" card answers "what have I
    arranged", which the three sample visits in the list are not an answer to. Soonest first rather than
    newest first — a booking goes on the top of `rows`, so booked[0] was the visit somebody booked last,
    and the home, the Passport and the assistant all read booked[0]. nextFirst puts the visit under way,
    then a come-now request, then the booked hours in order. */
 const booked = nextFirst(rows.filter(row => row.booked && row.group === 'upcoming'), row => row.visit);
 const rowById = (id: string) => rows.find(row => row.id === id);
 const manage = (id: string, action: VisitAction) => { setViewing(null); setManaging({ id, action }); };
 const moveVisit = (id: string, date: string, start: string) =>
  setRows(rows.map(row => row.id === id ? { ...row, status: 'Confirmed', tone: '', visit: { ...row.visit, kind: 'scheduled', status: 'Confirmed', date, start } } : row));
 /* Which side of the cancellation window a visit fell on is decided here, at the moment somebody
    presses cancel, and stored. It is not worked out again when the cancelled visit is opened: the
    visit's own date will have gone past by then, and lib/cancelling.ts would answer "the nurse has
    arrived" about a visit nobody ever arrived at. A state that is true only while the clock has not
    moved is a state that has to be recorded rather than derived. */
 const standDown = (id: string, reason: string) =>
  setRows(rows.map(row => row.id === id
   ? { ...row, group: 'cancelled', status: 'Cancelled', tone: 'amber', reason,
       cancelledState: stateOf(row.visit.date, row.visit.start), cancelledOn: dateOf(0) }
   : row));
 if (onboarding) return <Onboarding locale={locale} setLocale={setLocale} recover={onboarding === 'recovery'} onDone={() => { setOnboarding(''); setSignedIn(true); navigate('Overview'); }} onSkip={() => { setOnboarding(''); setSignedIn(true); navigate('Overview'); }}/>;
 if (!signedIn) return <SignIn live={live} onSignIn={() => setSignedIn(true)} onCreate={() => setOnboarding('first-run')} onRecover={() => setOnboarding('recovery')}/>;
 return <>
  <PatientShell page={page} navigate={navigate} open={setModal} locale={locale} location={location} visitCount={rows.filter(row => row.group === 'upcoming').length}
   signOut={signOut} query={query} setQuery={setQuery}
   /* The floating assistant, on every patient page and only on them: its questions are a patient's,
      and the clinical workspaces get nothing until the assistant's scope says what a nurse or a
      doctor could ask it. It sits inside the shell, ahead of the dialogs below, so when the SOS
      handover closes the panel and opens Thuso SOS, focus returns to the orb first and the SOS
      dialog then takes it. */
   assistant={<AssistantLauncher openModal={setModal} visit={booked[0]?.visit ?? null}/>}>
   {page === 'Overview' ? <Dashboard navigate={navigate} book={setBooking} open={setModal} query={query} setQuery={setQuery} visits={booked.map(row => row.visit)} location={location} viewVisit={() => setViewing(booked[0]?.id ?? null)} reschedule={() => { if (booked[0]) manage(booked[0].id, 'reschedule'); }}/>
    : page === 'Book a nurse' ? <Services book={setBooking} open={setModal} navigate={navigate} query={query} forPerson={forPerson} clearPerson={() => setForPerson(null)}/>
     : page === 'My visits' ? <Visits rows={rows} open={setModal} book={() => navigate('Book a nurse')} manage={manage} view={setViewing} track={track}/>
      : page === 'Health Passport' ? <Passport open={setModal} navigate={navigate} next={booked[0]} view={setViewing} manage={manage}/>
       : page === 'Live well' ? <LiveWell entries={wellbeing} navigate={navigate}
          onWrite={(habit, words) => setWellbeing([write(habit, words), ...wellbeing])}
          onRemove={id => setWellbeing(wellbeing.filter(entry => entry.id !== id))}
          nextVisit={rows.find(row => row.group === 'upcoming')?.id ?? null} viewVisit={setViewing}/>
       : page === 'Health trends' ? <HealthTrends navigate={navigate}/>
       : page === 'Share part of your record' ? <Suspense fallback={<p className="helper" role="status">Opening your share links.</p>}><ShareLinksPage navigate={navigate}/></Suspense>
       : page === 'Your emergency card' ? <Suspense fallback={<p className="helper" role="status">Opening your emergency card.</p>}><EmergencyCardPage navigate={navigate} open={setModal}/></Suspense>
       : page === 'Who opened your record' ? <Suspense fallback={<p className="helper" role="status">Opening who opened your record.</p>}><PassportLogPage navigate={navigate}/></Suspense>
       : page === 'What readings mean' ? <ReadingsExplained navigate={navigate} open={setModal}/>
       : page === 'Care timeline' ? <CareTimeline navigate={navigate} open={setModal}/>
       : page === 'Your care team' ? <CareTeam navigate={navigate} open={setModal}/>
       : page === 'What happens to a prescription' ? <PrescriptionJourney navigate={navigate} open={setModal}/>
       : page === 'Arrival' ? <Arrival row={rows.find(row => row.id === tracking) ?? rows.find(row => row.group === 'upcoming')} navigate={navigate} view={setViewing}/>
       : page === 'Door check' ? <Suspense fallback={<p className="helper" role="status">Opening the door check.</p>}><DoorCheckPage row={rows.find(row => row.id === tracking) ?? rows.find(row => row.group === 'upcoming')} back={() => navigate('Arrival')}/></Suspense>
       : page.startsWith('Complaint · ') ? <Suspense fallback={<p className="helper" role="status">Opening the complaint.</p>}><ComplaintPage row={rows.find(row => row.id === page.slice('Complaint · '.length))} back={() => navigate('My visits')}/></Suspense>
       : page === 'Help & support' ? <GettingHelp navigate={navigate} open={setModal}/>
       : page === 'Care you sponsor' ? <Suspense fallback={<p className="helper" role="status">Opening the care you pay for.</p>}><SponsoredCarePage person={people[1]} relation={relationOf(people[1], people)} navigate={navigate} open={setModal}/></Suspense>
       : page === 'My family' ? <Family members={members} invitations={invitations} onRevoke={id => setInvitations(invitations.map(i => i.id === id ? { ...i, status: 'Revoked' } : i))} open={setModal} navigate={navigate}/>
        : page === 'Care plans' ? <Plans open={setModal} family={{ sponsor: people[0]!, parents: people.filter(p => relationOf(p, people) === 'Mother') }}/>
         /* Group payers and claims: three screens on their own dynamic imports, opened from the wallet and the passport. */
         : page === 'Groups that pay for you' ? <Suspense fallback={<p className="helper" role="status">Opening your groups.</p>}><GroupMembershipPage/></Suspense>
         : page === 'A group you pay for' ? <Suspense fallback={<p className="helper" role="status">Opening your group.</p>}><GroupAdminPage/></Suspense>
         : page === 'Claims to your medical scheme' ? <Suspense fallback={<p className="helper" role="status">Opening your claims.</p>}><ClaimsPage/></Suspense>
         /* Gift a visit: the giver's screen and the beneficiary's, each its own dynamic import, opened from the wallet. */
         : page === 'Gift a visit' ? <Suspense fallback={<p className="helper" role="status">Opening gift a visit.</p>}><GiftAVisitPage/></Suspense>
         : page === 'Gifts sent to you' ? <Suspense fallback={<p className="helper" role="status">Opening your gifts.</p>}><GiftInboxPage/></Suspense>
         : page === 'Place a real market order' ? <Suspense fallback={<p className="helper" role="status">Opening the order.</p>}><MarketOrderPage/></Suspense>
         : page === careTipsRoute.opens ? <Suspense fallback={<p className="helper" role="status">{careTipsRoute.opening}</p>}><CareTipsPage open={setModal}/></Suspense>
         : page === 'Split a visit between you' ? <Suspense fallback={<p className="helper" role="status">Opening the split.</p>}><BillSplitPage/></Suspense>
         : page === 'Thuso Wallet' ? <WalletPage open={setModal} navigate={navigate}/>
          : page === 'Privacy & settings' ? <Privacy key="privacy" open={setModal}/>
           : page === 'Language & access' ? <Privacy key="access" open={setModal} initial="Language & access"/>
            : page === 'Explore MyThuso' ? <Explore open={openModal} onOnboarding={() => setOnboarding('first-run')} navigate={navigate}/>
             : IconGallery && page === 'Icons' ? <Suspense fallback={<p className="helper" role="status">Opening the icon family.</p>}><IconGallery/></Suspense>
             : UiGallery && page === 'UI' ? <Suspense fallback={<p className="helper" role="status">Opening the shared components.</p>}><UiGallery/></Suspense>
              : page === patientScreenRoutes.devices.opens ? <Suspense fallback={<p className="helper" role="status">{patientScreenOpenings[page]}</p>}><PatientDevicesPage navigate={navigate} open={setModal}/></Suspense>
              : page === patientScreenRoutes.messages.opens ? <Suspense fallback={<p className="helper" role="status">{patientScreenOpenings[page]}</p>}><PatientMessagesPage rows={rows} threads={threads} onThread={(id, next) => setThreads(held => ({ ...held, [id]: next }))} view={setViewing} navigate={navigate}/></Suspense>
              : page === patientScreenRoutes.results.opens ? <Suspense fallback={<p className="helper" role="status">{patientScreenOpenings[page]}</p>}><PatientResultsPage navigate={navigate} open={setModal}/></Suspense>
              : page === patientScreenRoutes.consultation.opens ? <Suspense fallback={<p className="helper" role="status">{patientScreenOpenings[page]}</p>}><PatientConsultationPage navigate={navigate}/></Suspense>
              : patientPageNames.includes(page) ? <Suspense fallback={<p className="helper" role="status">{patientPageOpenings[page]}</p>}><PatientPagesView page={page} navigate={navigate} open={setModal} book={setBooking} entries={wellbeing}/></Suspense>
               : <MoreHub navigate={navigate} open={setModal} onSignOut={signOut}/>}
  </PatientShell>
  {booking &&<Modal surface={SURFACE} title="A nurse, at your door." onClose={() => setBooking(null)}><Suspense fallback={<p className="helper" role="status">Opening the booking.</p>}><BookingFlow service={booking} person={forPerson ?? undefined} held={heldHours(rows)} previousNurseFor={person => previousNurseIn(rows, person)} onComplete={v => { setRows([rowFor(v, `VIS-01${rows.length}`), ...rows]); setBooking(null); navigate('My visits'); }}/></Suspense></Modal>}
  {/* Looking at a visit, moving one and standing one down are three screens rather than three
      sentences in a roadmap dialog. Each one closes by going back to the list it came from, so no
      branch of this ends on a dialog with nothing behind it. */}
  {/* Three kinds of visit and three titles. "Your visit" over a summary of what a nurse found, and
      over a visit that was stood down a fortnight ago, was the same sentence doing three jobs. */}
  {viewing && rowById(viewing) && <Modal surface={SURFACE} title={visitTitle(rowById(viewing)!.group)} onClose={() => setViewing(null)}>
   <VisitDetail row={rowById(viewing)!} manage={manage} navigate={p => { navigate(p); setViewing(null); }}
    rebook={() => bookFor(rowById(viewing)!.visit.person)} track={track} notes={wellbeing}
    thread={threads[viewing]} onThread={next => setThreads({ ...threads, [viewing]: next })}/></Modal>}
  {managing && rowById(managing.id) && <Modal surface={SURFACE} title={managing.action === 'reschedule' ? 'Move this visit' : 'Cancel this visit'} onClose={() => setManaging(null)}>
   <Suspense fallback={<p className="helper" role="status">Opening the visit.</p>}>
   {managing.action === 'reschedule'
    ? <RescheduleFlow visit={rowById(managing.id)!.visit} onMove={(date, start) => { moveVisit(managing.id, date, start); setManaging(null); navigate('My visits'); }}/>
    : <CancelFlow visit={rowById(managing.id)!.visit} onCancel={reason => { standDown(managing.id, reason); setManaging(null); navigate('My visits'); }}/>}
   </Suspense>
  </Modal>}
  {modal && <Modal surface={SURFACE} title={modalTitle(modal)} onClose={() => setModal(null)}>{modalBody({ modal, close: () => setModal(null), navigate: (p: string) => { navigate(p); setModal(null); }, openOnboarding: () => { setModal(null); setOnboarding('first-run'); }, reopen: openModal, locale, setLocale, query, setQuery, location, setLocation, people, addMember: (n: string) => { setMembers([...members, n]); setModal(null); navigate('My family'); }, addInvitation: (i: Invitation) => { setInvitations([...invitations, i]); setModal(null); navigate('My family'); }, signOut, rows, invitations, bookFor, viewVisit: (id: string) => { setModal(null); setViewing(id); }, revoke: (id: string) => setInvitations(invitations.map(i => i.id === id ? { ...i, status: 'Revoked' } : i)), openRole: (id: RoleId) => { setModal(null); setRole(id); } })}</Modal>}
 </>;
}
/* The kit's names, which on the patient's side open the Connected devices page rather than the kit.
   They used to open the nurse's capture tool in a dialog — "Capturing as: Nurse", a pairing surface and a
   reading form — handed to a patient from the roadmap's Thuso Kit card, because the kit was one screen
   for everybody. A patient does not capture readings: the nurse brings the kit, and what a patient can ask
   of it is what it would read and where a reading came from, which is what Connected devices answers
   (lib/patient-screens-routes.ts). The capture tool is the nurse's, in her workspace (shells/StaffShell.tsx),
   and it left the patient's first load with this. */
const isKit = (modal: string) => modal === 'Diagnostic kit' || modal === 'Thuso Kit';
/* The three device permission screens, opened from the passport's device tab. "Thuso Kit connection"
   used to be a fourth door into the kit's capture screen, which answers a different question: the
   kit screen is where a reading came from, and this one is what would be read if you said yes. */
const integrations: Integration[] = ['Apple Health', 'Health Connect', 'Thuso Kit'];
const integrationIn = (modal: string) => integrations.find(name => modal === `${name} connection`);
const visitTitle = (group: string) => group === 'past' ? 'What the nurse found' : group === 'cancelled' ? 'A cancelled visit' : 'Your visit';
/* The hours already held against a nurse somebody asked for by name, from the visits this session holds.
   The booking domain takes them away from her offer, so a second visit cannot be booked into an hour she
   is already coming to somebody at. A visit for whoever is nearest holds nobody. */
const heldHours = (rows: VisitRow[]): Hold[] => rows
 .filter(row => row.group === 'upcoming' && row.visit.nurse && row.visit.date && row.visit.start)
 .map(row => ({ nurseRef: row.visit.nurse!.id, date: row.visit.date!, start: row.visit.start!, minutes: row.visit.service.duration }));
/* The nurse on this person's most recent completed visit, which is who "the nurse you saw last time" means. */
const previousNurseIn = (rows: VisitRow[], person: string): string | null => {
 const past = rows.find(row => row.group === 'past' && row.visit.person === person);
 return past ? nurseOfVisit(past.visit).id : null;
};
function modalTitle(modal: string) {
 if (modal.startsWith('Care plan: ')) return modal.replace('Care plan: ', '');
 if (modal.startsWith('Family profile: ')) return modal.replace('Family profile: ', '');
 if (modal === 'Top up wallet') return 'Top up your wallet';
 if (modal === 'Sponsor care') return 'Sponsor somebody’s care';
 if (modal.startsWith('Prescription ')) return 'Prescription';
 if (modal.startsWith('Laboratory order ')) return 'Laboratory order';
 if (integrationIn(modal)) return `${integrationIn(modal)} access`;
 if (modal === 'Thuso SOS' || modal === 'Emergency & urgent care') return 'Thuso SOS';
 if (modal === 'Next of kin') return 'Next of kin';
 if (modal === 'Your consents') return 'Your consents';
 if (modal === 'Contact privacy team') return 'Your privacy contact';
 if (modal === 'Access history') return 'Who opened your record';
 if (modal === 'Thuso Family') return 'Household record';
 if (modal === 'Thuso Pass') return 'Health summary';
 if (modal === 'Visit summary') return 'What the nurse found';
 if (modal === 'Switch workspace') return 'Open MyThuso as';
 /* The capability's own name, so the title needs no copy of the Medicines contract on the first load. */
 if (modal === 'medicine-collection') return capability('medicine-collection').name;
 return modal;
}
type BodyProps = { modal: string; close: () => void; navigate: (s: string) => void; openOnboarding: () => void; reopen: (s: string) => void; locale: LocaleCode; setLocale: (l: LocaleCode) => void; query: string; setQuery: (q: string) => void; location: string; setLocation: (l: string) => void; people: string[]; addMember: (n: string) => void; addInvitation: (i: Invitation) => void; signOut: () => void; rows: VisitRow[]; invitations: Invitation[]; bookFor: (person: string) => void; viewVisit: (id: string) => void; revoke: (id: string) => void; openRole: (id: RoleId) => void };
/* Who each person in the demo household is to the account holder. The family list works this out
   from a row's position; this dialog is opened by name, so it asks by name. */
const relationOf = (name: string, people: string[]) =>
 name === people[0] ? 'You' : name === people[1] ? 'Mother' : name === people[2] ? 'Child · 8 years' : 'Added by you';
function modalBody(p: BodyProps) {
 const { modal } = p;
 if (modal === 'Notifications') return <Notifications open={p.reopen} navigate={p.navigate}/>;
 /* Four journeys that used to end in the same dialog: "Connected to your care journey", a paragraph
    about the roadmap, and a Got it button. Each is a screen now that finishes where a person would
    expect it to — and none of them claims a capability the contract says is not connected. */
 if (modal.startsWith('Care plan: ')) return <PlanDetail name={modal.replace('Care plan: ', '')} navigate={p.navigate}/>;
 if (modal.startsWith('Family profile: ')) { const name = modal.replace('Family profile: ', ''); return <FamilyProfile name={name} relation={relationOf(name, p.people)} navigate={p.navigate} open={p.reopen} visits={p.rows} invitations={p.invitations} onRevoke={p.revoke} book={p.bookFor} view={p.viewVisit}/>; }
 if (modal === 'Top up wallet') return <TopUpWallet navigate={p.navigate}/>;
 if (modal === 'Sponsor care') return <SponsorCare navigate={p.navigate} people={p.people.slice(1)}/>;
 if (modal === 'Language') return <LanguageChoice locale={p.locale} setLocale={p.setLocale} close={p.close}/>;
 if (modal === 'Invite a guardian') return <InviteGuardian onInvite={p.addInvitation} onClose={p.close}/>;
 if (modal === 'Add a family member') return <FamilyForm onAdd={p.addMember}/>;
 if (modal === 'Share my passport') return <Sharing/>;
 if (modal.startsWith('Prescription ') || modal === 'Pharmacy orders') return <PrescriptionDetail reference={modal.replace('Prescription ', '')} partner={false}/>;
 if (modal.startsWith('Laboratory order ') || modal === 'Laboratory results') return <LabOrderDetail reference={modal.replace('Laboratory order ', '')} partner={false}/>;
 if (modal === 'medicine-collection') return <Suspense fallback={<p className="helper" role="status">{capability('medicine-collection').name}</p>}><AuthoriseCollectorFlow/></Suspense>;
 /* Three integrations that could not be opened at all. Each one now says what would be read, what
    would never be, and — from the contract rather than from a paragraph of its own — that no device
    has been contacted and no Bluetooth permission is declared. */
 { const integration = integrationIn(modal); if (integration) return <DevicePermission integration={integration} navigate={p.navigate}/>; }
 if (modal === 'Thuso SOS' || modal === 'Emergency & urgent care') return <Suspense fallback={<EmergencyWhileSosLoads/>}><ThusoSos/></Suspense>;
 if (modal === 'Next of kin') return <Suspense fallback={<p className="helper" role="status">Opening your next of kin.</p>}><NextOfKinSettings/></Suspense>;
 /* The household record and the shareable summary were reachable only from a design-review menu,
    which is another way of saying they were finished screens with no door. A family member is
    exactly the question the household record answers — what may each of us see of the others — and
    Thuso Pass is the product name for the summary, so both now open from where a patient would
    look for them. */
/* Two of the passport's three documents used to end at "The production record will show the issuing
    clinician…" — a sentence about a document, offered in place of one. The visit summary is a screen
    the app already had and had no door to from here; the certificate is the one document in the
    passport with no record type behind it anywhere, so its screen says that rather than drawing a
    certificate nobody issued. */
 if (modal === 'Visit summary') { const past = p.rows.find(row => row.group === 'past'); return past
  ? <PastVisit row={{ id: past.id, service: past.visit.service, person: past.visit.person, address: past.visit.address, date: past.visit.date, start: past.visit.start, payment: past.visit.payment }}
     dayOffset={past.dayOffset} rebook={() => p.bookFor(past.visit.person)} navigate={p.navigate}/>
  : <p className="muted">There is no completed visit on this account yet. A visit summary is written after a nurse has been, so this document appears once one has.</p>; }
 if (modal === 'Medical certificate') return <MedicalCertificate navigate={p.navigate}/>;
 if (modal === 'Thuso Family') return <Suspense fallback={<p className="helper" role="status">Opening the household record.</p>}><HouseholdRecordPage/></Suspense>;
 if (modal === 'Thuso Pass') return <Suspense fallback={<p className="helper" role="status">Opening your health summary.</p>}><HealthSummaryPage/></Suspense>;
 if (modal === 'Your consents') return <ConsentCentre/>;
 /* Replaces the two-line sample that used to live in Detail: a real access log, refusals included. */
 if (modal === 'Access history') return <AccessHistory/>;
 /* The last row on the privacy screen used to open the catch-all: the sign-in capability's notice,
    one sentence about launch, and a button offering the product roadmap. */
 if (modal === 'Contact privacy team') return <InformationOfficer open={p.reopen} navigate={p.navigate}/>;
 /* This was a menu that switched the patient's shell into a nurse's; then it was a paragraph
    explaining that the clinical application lives at another address and a link to it. It is the
    demo login now, on this screen as well as in the band at the top of every shell, because there is
    one door and this is a person standing at it. The rows carry the capability's notice and the
    contract's own sentence about what choosing a role does not grant — features/DemoLogin.tsx. */
 if (modal === 'Switch workspace') return <RolePanel onPick={p.openRole}/>;
 /* The care areas are the coverage contract's own zones. Three of the five were typed here, which is
    how a picker comes to offer a suburb the map cannot draw and the dispatch board does not cover. */
 if (modal === 'Your location') return <form className="form-stack" onSubmit={e => { e.preventDefault(); p.close(); }}><p className="muted">Choose a demo care area. No GPS access is requested.</p><label>Care area<select value={p.location} onChange={e => p.setLocation(e.target.value)}>{zones.map(z => <option key={z.id}>{z.name}, {coverage.city}</option>)}</select></label><p className="helper">{coverage.sentence}</p><button className="primary">Save location<ArrowRight size={16}/></button></form>;
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
/* What is left of the catch-all.
 *
 * It used to answer for a visit, a family member, a wallet top-up, a sponsorship and a care plan as
 * well — five journeys that each ended on the same paragraph about the functionality phase and a Got
 * it button. All five have their own screen now and none of them reaches this. What still arrives
 * here is a roadmap module, which is genuinely a description rather than a workflow, and the two
 * POPIA requests, which are a form. Everything that ends here now ends with somewhere to go. */
function Detail({ title, close, navigate, signOut }: { title: string; close: () => void; navigate: (s: string) => void; signOut: () => void }) {
 const [done, setDone] = useState(false);
 const isRequest = title.startsWith('Request');
 /* One notice, from the contract, and chosen by what this dialog is actually about — a request that
    reaches nobody, or an account nothing signs you into. The pill that used to sit here said the
    same three words on all of them, including the ones whose content is real. */
 /* Three different things arrive here and only two of them are about a capability. A profile is
    about sign-in and a POPIA request is about reaching somebody; a module in the plan is about
    neither, and it was carrying "Sign-in is not switched on yet" on all sixteen roadmap cards —
    the wrong sentence, on the screens where the right one is the paragraph underneath. A notice
    that names a capability the screen does not depend on is worse than no notice: it is the honesty
    machinery pointing at the wrong thing. */
 const isRoadmap = !isRequest && title !== 'Your profile';
 return <div className="form-stack">{isRoadmap ? null : <NotConnected of={isRequest ? 'messaging' : 'accounts'} tone="inline"/>}{title === 'Your profile' ? <><div className="profile-summary"><span className="avatar">LM</span><div><h3>Lerato Molefe</h3><p>Fictional patient · Personal account</p></div></div><button className="secondary full" onClick={() => navigate('Privacy & settings')}>Manage privacy & preferences<ArrowRight size={17}/></button><button className="secondary full sign-out" onClick={signOut}><LogOut size={16}/>Log out</button></> : isRequest ? <><p>{title.includes('deletion') ? 'Request account deletion. Some clinical records may need to be retained under an applicable retention schedule.' : 'Ask for inaccurate personal information to be corrected.'}</p><label>Reason (fictional information only)<textarea aria-label="Request reason" placeholder="Describe your request…" maxLength={500}/></label><button className="primary" onClick={() => setDone(true)} disabled={done}>{done ? 'Request recorded in this tab' : 'Preview request'}</button><p className="helper" role="status">{done ? 'Nothing has been submitted. This previews the acknowledgement state.' : 'Nothing is submitted from here.'}</p></> : <><h3>{detailCopy(title)[0]}</h3><p className="muted">{detailCopy(title)[1]}</p>{/* Even the roadmap has somewhere to go: the module list it came from. */}<div className="button-row"><button className="secondary" onClick={close}>Close</button><button className="primary" onClick={() => navigate('Explore MyThuso')}>See the whole roadmap<ArrowRight size={16}/></button></div></>}</div>
}
/* The last dialog in the patient app, and it used to be pressed twenty-eight times: every roadmap
   card, every care plan, every family member, the wallet's two actions and the visit controls all
   arrived at one paragraph about the functionality phase. Twelve of those now have a screen of their
   own, and what is left is the roadmap itself — where a description is the honest answer.
   So it stops being generic there too: a module opened from Explore shows *its* sentence and *its*
   phase, out of the same catalogue the card was drawn from, rather than its name dropped into a
   template. A planned service does the same from the service catalogue. */
function detailCopy(t: string): [string, string] {
 if (t.includes('connection')) return ['Choose what you share', 'Native device permissions will let you select individual reading types and withdraw access. Nothing is connected yet.'];
 if (t.includes('doctor') || t === 'Teleconsultation' || t === 'Thuso Doctor') return ['A doctor’s expertise, closer to home', 'A registered doctor reviews your case and can join a secure consultation. Scheduling, identity verification and clinical consent will come before any live consultation.'];
 if (t === 'Contact privacy team') return ['Your privacy contact', 'The Information Officer’s verified contact details and request tracking will be configured before launch.'];
 if (t.includes('summary') || t.includes('certificate')) return ['Your care document', 'The production record will show the issuing clinician, date, review status and a secure download. This preview contains no real document.'];
 const module = modules.find(([name]) => name === t);
 /* The catalogue's descriptions do not end in a full stop — they are card subtitles — so the
    sentence after one has to supply it. "Apple Health and Health Connect It is a module" was on
    all sixteen. */
 if (module) return [`${module[0]} · ${module[2]}`, `${module[1]}. It is a module in the plan rather than a screen you can open today, and it arrives in ${module[2].toLowerCase()}.`];
 /* "Elderly care · Phase 3" — the planned services carry their phase in the title they are opened
    with, so the service is found by the half in front of the separator. */
 const planned = services.find(s => t.startsWith(`${s.name} ·`));
 if (planned) return [`${planned.name} · Phase ${planned.phase}`, `${planned.description} It is planned at ${money(planned.price)} for ${planned.duration} minutes, and no nurse can be sent for it until phase ${planned.phase}. Everything in the catalogue marked bookable can be booked today.`];
 return ['On the MyThuso roadmap', `${t} is a module in the plan rather than a screen you can use today. Its workflow connects to the relevant clinical, operational or partner service in the phase it belongs to.`];
}
