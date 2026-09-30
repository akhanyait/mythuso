import { Component, createContext, lazy, Suspense, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { Ambulance, ArrowRight, ArrowUpRight, Ban, Bell, BookOpen, CalendarClock, Check, ChevronRight, CircleHelp, Clock3, CreditCard, Eye, FileCheck, FileText, Globe, HandCoins, HeartHandshake, History, Languages, LayoutGrid, LockKeyhole, LogOut, MapPin, Navigation, NotebookPen, PenLine, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Stethoscope, Trash2, TriangleAlert, UserPlus, Users, Wallet, Zap, MessageSquare, FlaskConical, Bluetooth, LifeBuoy, Footprints, Video } from 'lucide-react';
import { Pill, SectionTitle, ServiceIcon, tintOf } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { EmptyState, Skeleton, StateBlock, useOffline, type LoadState } from '../components/States';
import { InvitationList, scopes, type Invitation } from './Guardian';
import { BroughtToTheVisit } from './Wellbeing';
import type { Entry as WellbeingEntry } from '../lib/wellbeing';
import { Metric, Metrics } from '../surface/Surface';
import { HeroCarousel } from '../components/HeroCarousel';
import { FamilyScene, PatientPortrait } from '../components/Portraits';
import { modules, services, money, type Service } from '../lib/catalog';
import { patientPageRoutes, patientPagesHubRoute } from '../lib/patient-pages-routes.generated';
import { patientScreenRoutes } from '../lib/patient-screens-routes';
import type { DemoVisit } from './Booking';
import { endTime, isoIn, labels as schedulingLabels, longDateOf, shortDateOf, slots, visitEnds, weekdayOf } from '../lib/scheduling';
import { holdStatus } from '../lib/interpreting';
import { activity as walletActivity, balance as walletBalance, topUpAmounts } from '../lib/wallet';
import type { CancelState } from '../lib/cancelling';
import { dateOf, latestSet } from '../lib/passport';
import { CancelledVisit, PastVisit } from './VisitSummary';
import { nurseOfVisit } from '../lib/arrival';
import type { Thread } from '../../../../packages/engines/src/access/domain/thread.ts';
import { ClinicianProfile } from '../components/ClinicianProfile';
import { Button, Tab, TabsList } from '../ui';
import { Access } from './Access';
import { capability } from '../lib/capabilities';
import { HealthPanel, type PassportTab } from './Passport';
import businessModel from '../../../../packages/catalog/business-model.json';
import { OPEN_PARAM, slugOfSection } from '../lib/roles';
/* Verify's complaint entry arrives on a dynamic import with its own words, so a past visit does not carry them. */
const ComplaintEntry = lazy(() => import('./VerifyInService').then(m => ({ default: m.ComplaintEntry })));
/* One service, one card, one symbol.
 *
 * Each card used to carry the service's icon twice — once in a tinted tile at the top left and
 * again, three times the size, inside a pastel corner block whose colour came from the card's
 * index in the array. Four colours rotating across fifteen cards is not a code a reader can learn;
 * it is decoration that looks like one, and on a health catalogue it is exactly what makes a
 * serious product read as a toy. The corner block is gone and the tile is the only mark.
 *
 * The footer is a row of two columns rather than whatever fitted: what it costs, and how long it
 * takes. Both are the same two facts on every card, in the same two places, so a person comparing
 * four services reads down a column instead of hunting each card. */
/* Since 28 September a live card wears its category's tint (UI.tsx#tintOf) — the same tint the home's tile
   for that service wears — and its price is the card's figure. A planned card stays on the page's own
   paper, untinted and dashed, so what can be booked today is seen before it is read. */
function ServiceCard({service,onOpen}:{service:Service;onOpen:()=>void}) {
 const live=service.phase===1;
 return <button className={`service-card${live?'':' later'}`} data-tint={live?tintOf(service.category):undefined} onClick={onOpen}>
  <span className="service-icon"><ServiceIcon name={service.icon} size={21}/></span>
  <h3>{service.name}</h3>
  <p>{service.description}</p>
  <div>{live
   ?<><strong><small>From</small> {money(service.price)}</strong><span>{service.duration} min<ChevronRight size={16}/></span></>
   :<><strong className="later-price">{money(service.price)} planned</strong><span>Phase {service.phase}<ChevronRight size={16}/></span></>}</div>
 </button>;
}
export function Services({book,open,navigate,query='',forPerson,clearPerson}:{book:(s:Service)=>void;open:(s:string)=>void;navigate:(s:string)=>void;query?:string;forPerson?:string|null;clearPerson?:()=>void}) {
 const [category,setCategory]=useState('All services');
 const [search,setSearch]=useState(query);
 const clearFilters=()=>{setSearch('');setCategory('All services');};
 const filtered=services.filter(s=>(category==='All services'||s.category===category)&&`${s.name} ${s.description}`.toLowerCase().includes(search.trim().toLowerCase()));
 const bookable=filtered.filter(s=>s.phase===1);
 const planned=filtered.filter(s=>s.phase!==1);
 return <div className="approved-catalog">
  <header className="approved-catalog-hero"><img src="/banners/support-at-home.webp" alt=""/><div className="approved-catalog-copy"><div className="eyebrow">CARE, AT YOUR OWN PACE</div><p className="approved-support-title">Find a little support.</p><h1>Professional care at your door</h1><p>For your everyday. And your unexpected.</p><span className="approved-preview-note">Preview · No real visit is booked here</span></div><span className="care-photo-note">AI-generated illustrative image</span></header>
  <div className="approved-catalog-sheet">
  {/* Who the catalogue was opened for, said out loud and reversible in one press. A booking that
      arrives at the review step with somebody else's name on it is the one mistake this journey can
      make that nobody would notice until a nurse knocked. */}
  {forPerson&&<p className="booking-for" role="status"><Users size={16}/>Booking for <strong>{forPerson}</strong>{clearPerson&&<button className="text-button" onClick={clearPerson}>Book for myself instead</button>}</p>}
  <div className="catalog-tools"><label className="search-box"><Search size={18}/><input aria-label="Search services" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a service…"/></label><span className="helper catalog-count">{/* The share the sentence beside it states, as a ring (surface/motion.css); aria-hidden, because the words say it. */}<i className="m-ring" aria-hidden="true" style={{ '--m-share': filtered.length ? bookable.length / filtered.length : 0 } as CSSProperties}/>{bookable.length} bookable now · {filtered.length} in the catalogue</span></div>
  <div className="tabs" role="group" aria-label="Service categories">{['All services','Everyday care','Family health','Recovery','Tests & screening'].map(c=><button key={c} className={category===c?'selected':''} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
  {(search || category!=='All services')&&<div className="catalog-filter-summary"><span role="status">{filtered.length} {filtered.length===1?'service':'services'} found{search.trim()?` for “${search.trim()}”`:''}</span><button className="text-button" onClick={clearFilters}>Clear filters</button></div>}
  {/* Bookable and planned are two groups, not one grid with a quieter twelfth card. The only
      difference used to be a word in the footer — "R 449 planned · Phase 2" — set at the same
      weight, in the same white card, in the same grid, so the answer to "what can I actually get
      today" was there to be read rather than seen. It is a heading now, and the planned cards are
      drawn as what they are: a plan, on the page's own ground, without the surface a live card
      sits on. */}
  {bookable.length>0&&<><SectionTitle title={`Bookable now · ${bookable.length}`}/>
   <div className="catalog-grid">{bookable.map(s=><ServiceCard key={s.id} service={s} onOpen={()=>book(s)}/>)}</div></>}
  {planned.length>0&&<><SectionTitle title={`In the plan · ${planned.length}`}/>
   <div className="catalog-grid">{planned.map(s=><ServiceCard key={s.id} service={s} onOpen={()=>open(`${s.name} · Phase ${s.phase}`)}/>)}</div></>}
  {!filtered.length&&<EmptyState title="No matching care" body="No services match your search. Try another name or category." action="Show all services" onAction={clearFilters}/>}
  {/* This used to open the four-step booking modal for the first service in the catalogue, which
      answered "I don't know what I need" with a confident booking for a chronic check. It goes to
      the help screen now: there is no care-team chat, and the honest close is a screen that says so
      and hands over the three things that do exist. */}
  <button className="menu-row panel space-top" onClick={()=>navigate('Help & support')}><span className="tile-icon"><CircleHelp size={19}/></span><span><strong>Not sure what you need?</strong><small>What MyThuso can answer today, and what it cannot</small></span><ChevronRight size={17}/></button>
  <div className="privacy-note space-top"><ShieldCheck size={19}/>Only phase-one services can be booked. Later-phase services are shown so the plan is visible, not because a nurse can be sent for one today.</div>
 </div></div>}
/* A row is built from a visit, not typed beside one. The date block and the time both come from
   the same ISO date and start, so the weekday shown can never disagree with the day it names —
   which it did, in three different places, before this.
 *
 * The rows used to be built inside this component, which meant a visit could be looked at and never
 * changed: reschedule opened a dialog about the roadmap and there was no cancel at all. They live in
 * App.tsx now, so moving one moves it and standing one down moves it into Cancelled with its reason
 * — the journey finishes rather than stopping at the first screen that could act. */
export type VisitGroup='upcoming'|'past'|'cancelled';
/* `dayOffset` is kept on the row as well as inside the visit's ISO date, because the readings taken
   at a visit are looked up by the day the visit happened. Two representations of one day sound like
   a copy; they are not — the ISO date is derived from the offset, so they cannot disagree.
   `cancelledState` and `cancelledOn` are recorded when a visit is stood down, never worked out
   afterwards: which side of the window a visit fell on is a fact about the moment somebody pressed
   cancel, and a visit whose date has since passed would compute the wrong answer forever. */
export type VisitRow={id:string;visit:DemoVisit;status:string;tone:string;group:VisitGroup;reason?:string;booked?:boolean;dayOffset?:number;cancelledState?:CancelState;cancelledOn?:string};
export type VisitAction='reschedule'|'cancel';
const sample=(id:string,service:Service,person:string,address:string,dayOffset:number,start:string,status:string,tone:string,group:VisitGroup,reason?:string,cancelledState?:CancelState,cancelledOn?:number):VisitRow=>({
 id,group,reason,dayOffset,cancelledState,
 cancelledOn:cancelledOn===undefined?undefined:dateOf(cancelledOn),
 visit:{service,person,address,kind:'scheduled',payment:'Card',status:'Confirmed',
  date:isoIn(new Date(Date.now()+dayOffset*86_400_000)),start},
 status,tone});
/* A held visit is not a confirmed one and does not read like one here either: it carries the
   contract's own word and the amber tone the pending states use. */
export const rowFor=(visit:DemoVisit,id:string):VisitRow=>
 ({id,visit,status:visit.status,tone:visit.status===holdStatus||visit.kind==='asap'?'amber':'',group:'upcoming',booked:true});
/* The completed visit takes its day from the last set of readings in the record rather than from a
   number of its own, so "what was measured at this visit" is a lookup and not a coincidence. It was
   -3 here and 4 September in the passport, which agreed with nothing. */
/* The suburbs are the coverage contract's own zones now, and the first visit is today.
   Sandton and Rivonia were typed here and are not places packages/catalog/geography.json says
   MyThuso works in — which meant the arrival view could not draw a single one of these visits, and
   was right not to: an app that takes a booking outside phase one has moved the disappointment to
   the patient's front door. And a visit list where nothing is ever today is a list where the one
   screen a person opens on the morning of their visit can never be seen. */
/* The next slot the offer still has room for today, or the first one tomorrow. Derived rather than
   typed, because a fixed time is only in the future for part of the day. */
const nextSlot=()=>{
 const now=new Date();
 const minutes=now.getHours()*60+now.getMinutes();
 const ahead=slots.find(t=>{const [h,m]=t.split(':').map(Number);return h*60+m>minutes+60;});
 return ahead?{dayOffset:0,start:ahead}:{dayOffset:1,start:slots[0]!};
};
export const sampleVisitRows=():VisitRow[]=>[
 /* The one visit that is genuinely still ahead. It was today at 09:00, which is upcoming for nine
    hours a day and a visit that has already happened for the other fifteen — and since a started
    visit now refuses to be cancelled, the cancel journey stopped working every evening. The slot is
    the next one the offer actually has room for, and the day moves to tomorrow once none is left,
    so "upcoming" is true whenever anybody looks. */
 sample('VIS-0051',services[0],'Lerato Molefe','Home visit · Melville',nextSlot().dayOffset,nextSlot().start,'Confirmed','','upcoming'),
 sample('VIS-0052',services[1],'Lerato Molefe','Home visit · Melville',17,'10:00','Pending','amber','upcoming'),
 sample('VIS-0053',services[2],'Thabo Molefe','Home visit · Randburg',29,'14:00','Scheduled','sky','upcoming'),
 sample('VIS-0044',services[1],'Lerato Molefe','Home visit · Melville',latestSet.dayOffset,'10:00','Completed','','past'),
 sample('VIS-0039',services[3],'Nomsa Molefe','Home visit · Soweto',-12,'08:00','Cancelled','amber','cancelled','I no longer need this visit','before-window',-16)
];
export function Visits({rows:all,book,manage,view,track}:{rows:VisitRow[];open:(s:string)=>void;book:()=>void;manage:(id:string,action:VisitAction)=>void;view:(id:string)=>void;track:(id:string)=>void}) {
 const [tab,setTab]=useState('Upcoming');
 /* The only one of the five states anything on this screen can honestly be in today. Nothing
    fetches a visit list yet, so error and permission-denied would be a picker wearing a hat; the
    phone knows whether it has a signal without asking anybody. */
 const state:LoadState=useOffline()?'offline':'ready';
 const group:VisitGroup=tab==='Upcoming'?'upcoming':tab==='Past'?'past':'cancelled';
 const rows=all.filter(r=>r.group===group);
 return <>
  {/* The export's "Book new", in the heading where the page's one action belongs; booking used to be offered
      only by the empty state and the banner at the foot of the list. */}
  <PageHeading eyebrow="THUSO VISITS" title="Your visits" description="View, book, reschedule or cancel your visits." action={<Button leadingIcon={<Plus aria-hidden="true"/>} onClick={book}>Book new</Button>}/>
  <TabsList aria-label="Visit status">{['Upcoming','Past','Cancelled'].map(t=><Tab key={t} id={`visits-tab-${t}`} aria-controls="visits-panel" active={tab===t} onClick={()=>setTab(t)}>{t}</Tab>)}</TabsList>
  <NotConnected of="booking"/>
  <div id="visits-panel" role="tabpanel" aria-labelledby={`visits-tab-${tab}`}>
  <StateBlock state={state} subject="Your visit list" permission="notifications">
   {rows.length?<div className="form-stack">{rows.map(({id,visit:v,status,tone,reason},i)=><div className={`panel${i===0&&group==='upcoming'?' glass lead':''}`} key={id}>
    <div className="visit-row">
     {v.date?<span className="date-block"><span>{weekdayOf(v.date)}</span><strong>{shortDateOf(v.date).split(' ')[0]}</strong><span>{shortDateOf(v.date).split(' ')[1]}</span></span>
      :<span className="date-block asap"><Zap size={17}/><span>Now</span></span>}
     <div className="visit-body">
      <div><h3>{v.service.name}</h3><Pill tone={tone}>{status}</Pill></div>
      <div className="visit-meta"><Clock3 size={14}/>{v.start?`${v.start} – ${visitEnds(v)}`:schedulingLabels.asapPending}</div>
      <div className="visit-meta"><MapPin size={14}/>{v.address} · {v.person}</div>
      {reason&&<div className="visit-meta"><Ban size={14}/>{reason}</div>}
     </div>
    </div>
    {/* Every upcoming visit can be moved or stood down, not only the first one. The actions used to
        sit on row one alone, so a person looking at the visit they actually wanted to change was
        shown a card with nothing on it they could press. */}
    {group==='upcoming'&&<>
     {/* Who is coming to *this* address. It was one nurse named on every row whatever the suburb,
         which is the same person walking into three houses in three suburbs at the same hour. */}
     {i===0&&<div className="nurse-row"><span className="avatar nurse-avatar">{nurseOfVisit(v).initials}</span><div><strong>{nurseOfVisit(v).name}</strong><span>{nurseOfVisit(v).role}</span></div></div>}
     {/* On every upcoming visit and not only the one that is today. The answer for a visit a
         fortnight away is "nobody is on the way yet, and here is why you cannot watch her before
         the day" — which is an answer, and hiding the control until the morning would leave a
         person hunting for it on the one day they are in a hurry. */}
     <div className="visit-actions">
      <Button variant="secondary" onClick={()=>manage(id,'reschedule')}>Reschedule</Button>
      <Button variant="secondary" onClick={()=>manage(id,'cancel')}>Cancel</Button>
      <Button variant="secondary" onClick={()=>track(id)}>Where is my nurse?</Button>
      <Button onClick={()=>view(id)}>View details</Button>
     </div>
    </>}
    {group==='past'&&<div className="visit-actions">
     <Button variant="secondary" onClick={()=>view(id)}>View details</Button>
     <Button onClick={book}>Book this again</Button>
    </div>}
    {group==='cancelled'&&<div className="visit-actions">
     <Button variant="secondary" onClick={()=>view(id)}>View details</Button>
     <Button onClick={book}>Book another visit</Button>
    </div>}
   </div>)}</div>
   :<EmptyState title={`No ${tab.toLowerCase()} visits`} body={tab==='Cancelled'?'A visit you cancel stays here with the reason you gave, rather than disappearing.':'When you book a visit it appears here, with the nurse’s name and what to have ready.'} action="Book a nurse" onAction={book}/>}
  </StateBlock>
  </div>
  {/* Not under a failure. A banner selling another visit, directly beneath "we couldn't load this
      just now", is the app talking over the person it has just let down. It belongs to the state
      where the list actually loaded. */}
  {state==='ready'&&<section className="promo-dark">
   <h2>Care that fits your life.</h2>
   <p>Easy booking. Trusted professionals. Better health, at home.</p>
   <button onClick={book}>Book another visit<ArrowRight size={16}/></button>
   <div className="promo-art"><FamilyScene/></div>
  </section>}
 </>}
/* The patient's page heading. The icon tile and the "Back to {parent}" link the export adds live once, in
   PatientHeader.tsx, which the sub-pages behind a dynamic import use; this one is on the first load, so it
   carries only the page's one action beside the words (My visits' "Book new") and nothing of that sheet. */
export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}) {return <div className={`page-intro${action?' page-intro--action':''}`}><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action&&<div className="page-intro__action">{action}</div>}</div>;}
/* One visit, opened.
 *
 * This dialog used to be a fixed sentence — "Vitals & chronic check", Sister Naledi, "arrival
 * updates, secure messaging and rescheduling will be connected in the functionality phase" — printed
 * over whatever visit you had actually pressed, with one button that went to the Health Passport. It
 * is the visit now, and the two things a person opens a visit to do are on it. */
const toBring=['Your identity document, so the nurse can confirm the right patient at the door','Every medicine you are taking, boxes and all','A chair and a light in a room you can close'] as const;
/* The visit's booking status and its thread with the nurse arrive on a dynamic import the first time a
   visit is opened. The thread itself is held in App.tsx, so closing the visit and opening it again keeps
   what was written; nothing is written anywhere else. */
const VisitAccess=lazy(()=>import('./VisitAccess'));
export function VisitDetail({row,manage,navigate,rebook,track,notes=[],thread,onThread}:{row:VisitRow;manage:(id:string,action:VisitAction)=>void;navigate:(s:string)=>void;rebook:()=>void;track:(id:string)=>void;notes?:WellbeingEntry[];thread?:Thread;onThread?:(next:Thread)=>void}){
 const {visit:v,status,tone,group,reason}=row;
 const [talking,setTalking]=useState(false);
 const access=<Suspense fallback={null}><VisitAccess row={row} held={thread} onThread={onThread??(()=>{})} talking={talking} setTalking={setTalking}/></Suspense>;
 /* Reading or writing in the thread replaces the visit inside the same dialog, with the way back at its top. */
 if(talking) return access;
 /* Three visits, three screens. A completed visit and a cancelled one used to render this one — a
    price, a nurse, and three things to have ready for a visit that had already happened or had been
    stood down a fortnight before. Neither of them owes a person any of that; what each owes is in
    VisitSummary.tsx — and the thread, closed, with what was said still readable. */
 const shape={id:row.id,service:v.service,person:v.person,address:v.address,date:v.date,start:v.start,payment:v.payment};
 if(group==='past') return <><PastVisit row={shape} dayOffset={row.dayOffset} rebook={rebook} navigate={navigate}/>{access}<Suspense fallback={null}><ComplaintEntry onOpen={()=>navigate(`Complaint · ${row.id}`)}/></Suspense></>;
 if(group==='cancelled') return <><CancelledVisit row={shape} reason={reason} state={row.cancelledState??'before-window'} cancelledOn={row.cancelledOn} rebook={rebook} navigate={navigate}/>{access}</>;
 const coming=nurseOfVisit(v);
 return <div className="form-stack">
  <NotConnected of="booking"/>
  <div className="booking-summary"><span className="service-icon"><ServiceIcon name={v.service.icon}/></span><div><h3>{v.service.name}</h3><p>{v.service.duration} min · Registered nurse</p></div><strong>{money(v.service.price)}</strong></div>
  <div className="review-line"><span>Reference</span><strong>{row.id}</strong></div>
  <div className="review-line"><span><Clock3 size={15}/> When</span><strong>{v.date&&v.start?`${longDateOf(v.date)} · ${v.start} – ${endTime(v.start,v.service.duration)}`:schedulingLabels.asapPending}</strong></div>
  <div className="review-line"><span><MapPin size={15}/> Where</span><strong>{v.address}</strong></div>
  <div className="review-line"><span>Patient</span><strong>{v.person}</strong></div>
  <div className="review-line"><span>Status</span><strong><Pill tone={tone}>{status}</Pill></strong></div>
  {reason&&<div className="review-line"><span>Reason given</span><strong>{reason}</strong></div>}
  {/* Who is coming — the nurse asked for at booking when there was one — and the one thing a person
      waiting at home actually wants from this screen. */}
  <button className="nurse-row nurse-track" onClick={()=>track(row.id)}>
   <span className="avatar nurse-avatar">{coming.initials}</span>
   <div><strong>{coming.name}</strong><span>{coming.role}</span></div>
   <span className="nurse-track-cta"><Navigation size={16}/>Where is she?</span>
  </button>
  <ClinicianProfile subject={coming.roster.subject} name={coming.name} role={coming.role} reference={coming.roster.reference}/>
  {access}
  <SectionTitle title="Have this ready"/>
  <div className="panel">{toBring.map(line=><div className="record-row static" key={line}><span className="service-icon"><Check size={20}/></span><span><strong>{line}</strong></span></div>)}</div>
  {/* The other half of "bring this to your next visit". It is here rather than being sent anywhere:
      nothing written in Live well is copied into the record until a clinician records it as part of
      the visit, so what this screen can honestly offer is the words themselves, in front of the
      person who is about to read them out. */}
  <BroughtToTheVisit entries={notes}/>
  <section className="visit-support"><h3>Need help before your visit?</h3><p>See the contact options currently available. Direct clinician messaging is not connected in this preview.</p><button className="secondary full" onClick={()=>navigate('Help & support')}>Contact options<ArrowRight size={17}/></button></section>
  <p className="helper">A reviewing doctor may decide that a home visit is appropriate. Any further visit would need to be arranged separately; it is not included in this nurse booking.</p>
  <div className="button-row"><button className="secondary" onClick={()=>manage(row.id,'reschedule')}><CalendarClock size={16}/>Reschedule</button><button className="secondary" onClick={()=>manage(row.id,'cancel')}><Ban size={16}/>Cancel</button></div>
  <button className="primary full" onClick={()=>navigate('Health Passport')}>Open my Health Passport<ArrowRight size={17}/></button>
 </div>;
}
/* The Health Passport as the export's "My Health": a welcome, the credential, and the record as seven peer
   views on the shared Tabs — Overview, Vitals, Results, Medications, History and Goals as the export has them,
   and Records for the documents, sharing and devices it keeps on a page of its own. The tab bar and the
   choice are here; the panel arrives with the Passport's own screens on a dynamic import (Passport.tsx), so
   none of its charts, figures or the dispensing contract are on a patient's first load. */
const passportTabs:PassportTab[]=['Overview','Vitals','Results','Medications','History','Goals','Records'];
export function Passport({open,navigate,next,view,manage}:{open:(s:string)=>void;navigate:(s:string)=>void;next?:VisitRow;view?:(id:string)=>void;manage?:(id:string,action:VisitAction)=>void}) {
 const [tab,setTab]=useState<PassportTab>('Overview');
 return <div className="pd hp">
  <header className="pd-welcome">
   <span className="pd-welcome__mountain pd-welcome__mountain--one" aria-hidden="true"/>
   <span className="pd-welcome__mountain pd-welcome__mountain--two" aria-hidden="true"/>
   <div><p className="pd-eyebrow">THUSO PASSPORT</p><h1>Health Passport</h1><p className="pd-welcome__sub">Your health. Your story. Every visit, reading and result, in one place.</p></div>
  </header>
  <NotConnected of="clinical-records"/>
  {/* A credential, composed as one: the holder's name leads, the reference is a labelled field in tabular
      figures so it can be read out over a phone, and the face is the monogram the rest of the app uses. */}
  <section className="passport-hero">
   <span className="passport-portrait" aria-hidden="true">LM</span>
   <div className="passport-identity">
    <Pill tone="light">Thuso Pass</Pill>
    <h2>Lerato Molefe</h2>
    <dl><div><dt>Passport ID</dt><dd>TH-2048-3920</dd></div><div><dt>Issued</dt><dd>Akhanya IT Innovations</dd></div></dl>
   </div>
  </section>
  <TabsList className="hp-tabs" aria-label="Passport sections">{passportTabs.map(t=><Tab key={t} id={`hp-tab-${t}`} aria-controls="hp-panel" active={tab===t} onClick={()=>setTab(t)}>{t}</Tab>)}</TabsList>
  <HealthPanel tab={tab} go={setTab} navigate={navigate} open={open} panelId="hp-panel" labelledBy={`hp-tab-${tab}`} next={next} view={view} manage={manage}/>
 </div>}
/* What a person may see of somebody else is a status, not a paragraph.
 *
 * These were cards in a two-up grid, which on a 390px phone wrapped "Thabo Molefe" onto two lines,
 * "View care profile" onto two more, and left four cards of four different heights with their
 * buttons at four different places — the same defect the home's service grid had. They are rows
 * now, one per line, in the shortcut row the home already uses.
 *
 * And each one carries the access boundary as a badge beside the name rather than only as prose
 * underneath it. Choosing somebody here opens their *booking*: the sentence that used to be buried
 * in the card body is now a word a person can see without reading, on every row where it applies. */
const relationOf=(i:number)=>i===0?'You':i===1?'Mother':i===2?'Child · 8 years':'Added by you';
export function Family({open,navigate,members,invitations,onRevoke}:{open:(s:string)=>void;navigate:(s:string)=>void;members:string[];invitations:Invitation[];onRevoke:(id:string)=>void}) {return <><PageHeading eyebrow="THUSO FAMILY" title="Care for your whole circle." description="Be there for the people you love, wherever you are."/>
 <NotConnected of="messaging"/>
 <SectionTitle title="Your circle"/>
 <div className="shortcut-list">{['Lerato Molefe','Nomsa Molefe','Thabo Molefe',...members].map((n,i)=>
  <button className="shortcut-row family-member" key={`${n}-${i}`} onClick={()=>open(`Family profile: ${n}`)}>
   <span className={`avatar ${i===0?'':i%2?'peach':'blue'}`}>{n.split(' ').map(s=>s[0]).slice(0,2).join('')}</span>
   <span className="shortcut-text"><h3>{n}</h3><small>{relationOf(i)}</small></span>
   <Pill tone={i===0?'teal':'sky'}>{i===0?'Your own record':'Booking only'}</Pill>
   <ChevronRight size={17}/>
  </button>)}
  <button className="shortcut-row add-member" onClick={()=>open('Add a family member')}><span className="tile-icon"><Plus size={20}/></span><span className="shortcut-text"><strong>Add a family member</strong><small>Grow your circle of care</small></span><ChevronRight size={17}/></button>
 </div>
 <p className="helper"><LockKeyhole size={14}/>Choosing somebody here opens their booking, never their record. Record access is a separate decision, made below and reviewed on their side.</p>
 {/* "Sponsored care" has been a word under a name on the home screen with nothing behind it. It is
     a section of its own rather than a badge on a row, because paying for somebody's care and being
     allowed to see it are two different questions and this list is about the second one. */}
 <SectionTitle title="Care you pay for"/>
 <div className="shortcut-list">
  <button className="shortcut-row" onClick={()=>navigate('Care you sponsor')}>
   <span className="service-icon"><HandCoins size={20}/></span>
   <span className="shortcut-text"><strong>Care you sponsor</strong><small>What has been used, what it cost, and what paying for it does not let you see.</small></span>
   <ChevronRight size={17}/>
  </button>
 </div>
 <div className="section-title space-top"><h2>Guardians and shared access</h2><button className="secondary" onClick={()=>open('Invite a guardian')}><UserPlus size={16}/>Invite someone</button></div>
 {invitations.length?<InvitationList invitations={invitations} onRevoke={onRevoke}/>:<EmptyState title="Nobody else has access" body="When you invite a guardian or a family member, their access appears here with exactly what they can see and when it ends." action="Invite someone" onAction={()=>open('Invite a guardian')}/>}
 <div className="privacy-note"><LockKeyhole size={19}/>Paying for a family member’s care does not automatically grant access to their health records.</div>
 {/* The export's photo banner, as decoration and nothing else: no caption about anybody, lazy so it is fetched
     only by a reader who scrolls this far, and marked for what it is. The members above stay rows by decision. */}
 <figure className="family-banner"><img src="/banners/family-panorama.webp" alt="" loading="lazy"/><span className="care-photo-note">AI-generated illustrative image</span></figure></>}
/* MyThuso for Mom arrives when Care plans is opened, not with the patient's first load.
   Imported directly, the panel, its contract and its stylesheet added 3.4 kB gzipped to what every
   patient downloads to open the app, on metered data, for a screen most of them will not open that
   day. So it is its own chunk, and while it arrives the space shows the shared skeleton.

   If it never arrives (one bar of signal, a clinic's wifi answering with a sign-in page) a rejected
   import must not unmount the screen, so a boundary catches it and the rest of Care plans stays. What
   the boundary cannot do is try again in place: the browser keeps a module that failed to fetch
   failed, so a second import of the same chunk is refused without asking the network. A "Try again"
   that re-ran the import was a dead control, and the journey test caught it. The retry that works is
   a fresh load of this screen, and the message says so, including what that clears, rather than
   borrowing the shared error copy's promise that nothing entered is lost. Offline, it offers nothing:
   there is nothing a button could fetch, and the shared offline sentence is true as written. */
const MomPlansChunk = lazy(() => import('./MomPlans').then(m => ({ default: m.MomPlans })));
/* Who in the household would ask for a parent's plan, and for whom. Worked out by App.tsx, which knows who each person
   is to the account holder, and handed to the panel through context so the panel is still drawn as <MomPlansPanel/>,
   the element the build holds this screen to when it checks that plan prices are read from the contracts. */
export type PlanFamily = { sponsor: string; parents: readonly string[] };
const PlanFamilyContext = createContext<PlanFamily | undefined>(undefined);
class MomPlansBoundary extends Component<{ onFailed: () => void; children: ReactNode }, { failed: boolean }> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 componentDidCatch() { this.props.onFailed(); }
 render() { return this.state.failed ? null : this.props.children; }
}
/* Every other parameter is kept, so a role or anything else the address carried survives the reload;
   only the section is set, and it is set to the screen the reader was already on. */
const reopenCarePlans = () => {
 const search = new URLSearchParams(window.location.search);
 search.set(OPEN_PARAM, slugOfSection('Care plans'));
 window.location.assign(window.location.pathname + '?' + search.toString());
};
function MomPlansPanel() {
 const family = useContext(PlanFamilyContext);
 const [failed, setFailed] = useState(false);
 const offline = useOffline();
 if (failed && offline) return <StateBlock state="offline" subject="MyThuso for Mom">{null}</StateBlock>;
 if (failed) return <div className="state-block error" role="alert">
  <span className="state-icon"><TriangleAlert size={24}/></span>
  <div><h3>MyThuso for Mom did not load</h3><p>The rest of Care plans is still here. Loading it again opens this screen afresh, which clears anything you have tried elsewhere in this preview; none of it was kept anyway.</p></div>
  <button className="secondary" onClick={reopenCarePlans}><RefreshCw size={15}/>Load it again</button>
 </div>;
 return <MomPlansBoundary onFailed={() => setFailed(true)}>
  <Suspense fallback={<div className="panel mom-plan-pending"><Skeleton rows={3}/></div>}><MomPlansChunk family={family}/></Suspense>
 </MomPlansBoundary>;
}
/* No plan here can be bought. That is why none of them has a primary button any more: a solid call
   to action on a card marked "PHASE 2" reads as the one you may sign up for today, and the honest
   answer for all of them is the same. The tint that used to mark the first card has moved to the
   tier a reader chooses inside MyThuso for Mom — one tinted thing per screen. One column on a phone:
   at two-up the names wrapped to two lines and the buttons landed at different heights. */
/* The five plans a patient can see, derived rather than typed. The prices used to be written here —
   199, 99, 249, 699 — beside the same five numbers in packages/catalog/business-model.json, which is
   where the funding proposal's commercial model actually lives. Two copies of a subscription price
   is how a landing page ends up advertising one figure while the app charges another. The
   description is the product's own words for a patient; the money is the contract's. */
/* MyThuso for Mom is not in this list. It has three prices rather than one, it is the plan the
   Blueprint leads with, and MomPlans draws it above these four from its own contract. The phase is
   the business model's too; it used to be worked out from a card's position in this array, which was
   right only until somebody reordered it. */
const planCopy: Record<string, string> = {
 chronic: 'Monthly check-ins, doctor review and adherence support.',
 planning: 'Scheduled injection visits and discreet reminders.',
 senior: 'Weekly visits, medication support and family reports.',
 recover: 'A personal care plan for your recovery at home.'
};
const plans = ['chronic', 'planning', 'senior', 'recover'].map(id => {
 const plan = businessModel.subscriptions.find(s => s.id === id)!;
 /* Thuso Recover has no price in the contract — it is sold per package, to patients and to
    hospitals — and 'Custom' is how that is said on a card rather than a number nobody set. */
 return [plan.name, plan.price === null ? 'Custom' : money(plan.price), planCopy[id], plan.phase] as const;
});
/* What each plan actually contains, and the one thing it is not. "Explore plan" used to open a
   dialog that said the plan was on the roadmap and offered a Got it button — the end of a journey
   that had barely started. A person choosing between five plans wants three answers: what is in it,
   what it costs a month, and what joining would involve. The third is the honest half: none of the
   five can be joined, so the screen shows what joining *would* be rather than a button that lies. */
const planDetail:Record<string,{includes:readonly string[];not:string;who:string}>={
 'Chronic Routine':{includes:['A nurse visit every month, at an hour you choose','Blood pressure and glucose recorded onto your Health Passport','A registered doctor reviews each set of readings','A reminder before every visit, and before a repeat runs out'],not:'It is not a medical aid and it does not pay for medicines, tests or a hospital.',who:'Somebody managing a long-term condition at home.'},
 'Family Planning Plan':{includes:['Scheduled injection visits, at the interval your method needs','A discreet reminder, worded so it says nothing on a lock screen','A nurse who is cleared for this scope, every time'],not:'It is not contraception itself, and nothing here is dispensed without a prescription.',who:'Anybody who would rather not book the same visit over and over.'},
 'Thuso Senior':{includes:['A weekly nurse visit','Medication laid out and checked','A monthly summary sent to the family member you name'],not:'It is not a frail-care facility and it is not a twenty-four-hour carer.',who:'An older person living at home, and the family who worry about them.'},
 'Thuso Recover':{includes:['A plan written around the operation or injury you are recovering from','Wound care and dressing changes at the interval it needs','Progress reviewed by a registered doctor'],not:'It is not physiotherapy or rehabilitation, which are separate services on the roadmap.',who:'Recovering at home after a hospital stay.'}
};
/* Joining a plan is four steps and not one of them can happen yet. Naming all four is the point: a
   person can see the whole journey and where it stops, which is a different thing from a dialog
   saying the feature is coming. */
const joining=['Choose who the plan is for, and the day of the month it runs on','Confirm the monthly amount through a regulated payment provider','A nurse cleared for the plan’s scope is assigned to your area','The first visit is scheduled and appears under My visits'] as const;
export function PlanDetail({name,navigate}:{name:string;navigate:(s:string)=>void}){
 const entry=plans.find(([n])=>n===name);
 const detail=planDetail[name];
 const [interested,setInterested]=useState(false);
 if(!entry||!detail) return null;
 const [,price,description,phase]=entry;
 return <div className="form-stack">
  <div className="booking-summary"><span className="service-icon"><HeartHandshake size={23}/></span><div><h3>{name}</h3><p>{detail.who}</p></div><strong>{price}</strong></div>
  <p className="muted">{description}</p>
  <SectionTitle title="What is in it"/>
  <div className="panel">{detail.includes.map(line=><div className="record-row static" key={line}><span className="service-icon"><Check size={20}/></span><span><strong>{line}</strong></span></div>)}</div>
  <div className="privacy-note"><Ban size={19}/>{detail.not}</div>
  <SectionTitle title="What joining would involve"/>
  <ol className="plan-steps">{joining.map((step,i)=><li key={step}><b>{i+1}</b><span>{step}</span></li>)}</ol>
  <div className="review-line"><span>Monthly</span><strong>{price==='Custom'?'Priced per plan':`${price} / month`}</strong></div>
  <div className="review-line"><span>Available from</span><strong>{`Phase ${phase}`}</strong></div>
  <NotConnected of="payments"/>
  {/* The end of the journey, and it is a real end rather than a Got it. Nothing is sent — the
      messaging capability says so in its own words, from the contract. */}
  {interested?<>
   <div className="empty-note" role="status"><strong>Noted, in this browser only.</strong> Nothing has been sent, and nothing about your account has changed. When {name} opens, it opens for everybody in a care area at once rather than for a waiting list.</div>
   <NotConnected of="messaging"/>
   <button className="secondary full" onClick={()=>navigate('Care plans')}>Back to care plans<ArrowRight size={16}/></button>
  </>:<button className="primary full" onClick={()=>setInterested(true)}>Tell me when {name} opens<ArrowRight size={16}/></button>}
 </div>;
}
/* Four plans, and the reader is comparing two things across them: what it includes and what it
   costs a month. Both used to land wherever the description happened to end, so R199 on the first
   card sat twenty pixels below R249 on the third and the prices could not be read as a column. The
   card is a fixed set of rows now — phase, name, description, price, action — and each row starts
   on the same line across all five. The heart tile is gone with them: it was the same glyph five
   times, which told a reader nothing except that somebody had a spare icon. */
export function Plans({open,family}:{open:(s:string)=>void;family?:PlanFamily}) {return <><PageHeading eyebrow="THUSO ROUTINE" title="A healthier rhythm." description="Care that keeps showing up. For every chapter of life."/>
 {/* Above the prices rather than under the last card: the figures are the thing on this screen a
     person would most reasonably take for something they can pay. */}
 <NotConnected of="payments"/>
 <PlanFamilyContext.Provider value={family}><MomPlansPanel/></PlanFamilyContext.Provider>
 <SectionTitle title="Other plans"/>
 <div className="catalog-grid plan-grid">{plans.map(([n,p,d,phase])=><div className="panel plan-card" key={n}><Pill tone="plain">{`PHASE ${phase}`}</Pill><h2>{n}</h2><p>{d}</p><strong className="plan-price">{p}<small>{p==='Custom'?' pricing':' / month'}</small></strong><button className="secondary" onClick={()=>open(`Care plan: ${n}`)}>Explore plan<ArrowRight size={17}/></button></div>)}</div></>}
/* Seven rights, seven identical shields. The icon was the same on every row, so it carried no
   information at all and the list had to be read word by word to be used. Each row now has the
   icon of the thing it does and a line saying what is behind it, in the settings-row pattern the
   More hub already uses — one row idiom on both screens rather than two that nearly match. */
const rights=[['Who can see my records','Verified professionals, and for how long',Eye,'Share my passport'],['Guardians and shared access','People you have invited, and exactly what they see',UserPlus,'Invite a guardian'],['Next of kin','Who MyThuso may tell, in plain words, that you pressed SOS',Users,'Next of kin'],['My consents, and how to withdraw them','Every purpose you agreed to, and the wording you agreed to',FileCheck,'Your consents'],['View access history','Who opened your record — and who was refused',History,'Access history'],['Request a correction','Ask for inaccurate information about you to be fixed',PenLine,'Request a correction'],['Request account deletion','What can be deleted, and what a retention schedule keeps',Trash2,'Request account deletion'],['Information Officer','Your privacy contact under POPIA',ShieldCheck,'Contact privacy team']] as const;
/* Privacy & settings as one page in the export's tabs: Profile, Preferences, Privacy, and Language & access,
   which was a page of its own and is now reached as this page with its tab chosen. The profile tab is the
   accounts capability's notice and why it is off, and nothing to fill in — there is no identity service
   running, so a form, a photo or a Save would be a promise nothing keeps. No SMS switch: no SMS provider
   exists, and it is one of the reasons sign-in is off. */
export type SettingsTab='Profile'|'Preferences'|'Privacy'|'Language & access';
const settingsTabs:SettingsTab[]=['Profile','Preferences','Privacy','Language & access'];
export function Privacy({open,initial='Privacy'}:{open:(s:string)=>void;initial?:SettingsTab}) {const [tab,setTab]=useState<SettingsTab>(initial);const [choices,setChoices]=useState<Record<string,boolean>>({'Care reminders':true,'Wearable readings':false,'Product updates':false});const accounts=capability('accounts');return <><PageHeading eyebrow="YOUR PRIVACY MATTERS" title="Your data. Your choices." description="Clear choices about how your information is used."/>
 <TabsList className="settings-tabs" aria-label="Settings">{settingsTabs.map(t=><Tab key={t} id={`settings-tab-${slugOfSection(t)}`} aria-controls="settings-panel" active={tab===t} onClick={()=>setTab(t)}>{t}</Tab>)}</TabsList>
 <div key={tab} id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${slugOfSection(tab)}`} className="settings-panel m-stagger">
 {tab==='Profile'?<><NotConnected of="accounts"/><section className="panel settings-profile"><div className="profile-summary"><span className="avatar"><PatientPortrait/></span><div><h2>Lerato Molefe</h2><p>Fictional patient · Personal account</p></div></div><SectionTitle title="Why there is nothing to edit here"/><ul className="settings-reasons">{accounts.blockedBy.map(r=><li key={r}>{r}</li>)}</ul></section></>
 :tab==='Preferences'?<section className="panel"><SectionTitle title="Sharing preferences"/><p className="muted">Clinical processing is a separate purpose with its own lawful basis, and it is not switched by anything on this card.</p>{Object.entries(choices).map(([k,v])=><div className="setting-row" key={k}><span><strong>{k}</strong><small>{k==='Care reminders'?'Visit and care-plan reminders':k==='Wearable readings'?'Optional health trends from your devices':'Optional news and offers'}</small></span><button role="switch" aria-checked={v} aria-label={k} className={`switch ${v?'on':''}`} onClick={()=>setChoices({...choices,[k]:!v})}><span/></button></div>)}</section>
 :tab==='Privacy'?<><section className="panel"><SectionTitle title="You’re in control"/>{rights.map(([label,detail,Icon,target])=><button className="menu-row" key={label} onClick={()=>open(target)}><span className="tile-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={17}/></button>)}</section><div className="privacy-note"><LockKeyhole size={19}/>Controls on a screen are not compliance. POPIA also asks for governance, contracts, a lawful basis for each purpose and technical safeguards somebody has verified.</div></>
 :<Access level={2}/>}
 </div></>}
/* Money that does not exist, said out loud. The activity list goes through the same StateBlock as
   every other list that will one day be answered by a service somebody else operates — a payment
   provider being down is an ordinary Tuesday, and it is better designed now than improvised then. */
/* The ledger and the balance both come from lib/wallet.ts. R500.00 used to be typed here and typed
   again in the booking's payment list, and the visit line beside it named its own amount rather than
   the catalogue's. */
export function WalletPage({open,navigate}:{open:(s:string)=>void;navigate:(s:string)=>void}){
 const state:LoadState=useOffline()?'offline':'ready';
 return <><PageHeading eyebrow="THUSO WALLET" title="A little care, set aside." description="Support your own care or give someone a helping hand."/>
 {/* Before the balance, not after it. The number in the hero is the thing on this screen a person
     would most reasonably take for money they have. */}
 <NotConnected of="payments"/>
 {/* The reference's one signature move, on the one figure this screen is about: the amount set large
     and thin with a small label above it, rather than a small label above a heavy number. */}
 <div className="wallet-hero rise"><Wallet size={24}/><span>Balance</span><p className="wallet-figure"><strong>{money(walletBalance)}</strong><small>available</small></p><div className="button-row"><button className="secondary" onClick={()=>open('Top up wallet')}><Plus size={17}/>Top up</button><button className="secondary" onClick={()=>open('Sponsor care')}><Users size={17}/>Sponsor care</button></div></div>
 {/* Group payers, both sides, behind their own dynamic import. A stokvel, a church or an employer pays for a member's
     visits from its own account and holds nothing here, which is why neither row is under the balance above. */}
 <SectionTitle title="Groups"/>
 <div className="shortcut-list">
  <button className="shortcut-row" onClick={()=>navigate('Groups that pay for you')}><span className="service-icon"><Users size={20}/></span><span className="shortcut-text"><strong>Groups that pay for you</strong><small>A stokvel, a church or your employer, if you agree.</small></span><ChevronRight size={17}/></button>
  <button className="shortcut-row" onClick={()=>navigate('A group you pay for')}><span className="service-icon"><Wallet size={20}/></span><span className="shortcut-text"><strong>A group you pay for</strong><small>What it paid, and what it never sees.</small></span><ChevronRight size={17}/></button>
  {/* Splitting one visit between two people in a household. On its own dynamic import for the reason the
      two rows above are: it carries the Access domain, and a patient reading her visits opens none of it. */}
  <button className="shortcut-row" onClick={()=>navigate('Split a visit between you')}><span className="service-icon"><Users size={20}/></span><span className="shortcut-text"><strong>Split a visit between you</strong><small>Each person accepts their own share. Nobody sees what the visit was.</small></span><ChevronRight size={17}/></button>
 </div>
 {/* Gift a visit, both sides, behind their own dynamic import. A gift pays for one visit for one named person; it
     never books it — she does, in her own account. */}
 <SectionTitle title="Gifts"/>
 <div className="shortcut-list">
  <button className="shortcut-row" onClick={()=>navigate('Gift a visit')}><span className="service-icon"><HandCoins size={20}/></span><span className="shortcut-text"><strong>Gift a visit</strong><small>Pay for one visit for somebody. She decides when it happens.</small></span><ChevronRight size={17}/></button>
  <button className="shortcut-row" onClick={()=>navigate('Gifts sent to you')}><span className="service-icon"><HandCoins size={20}/></span><span className="shortcut-text"><strong>Gifts sent to you</strong><small>Visits somebody has paid for. Booking one is yours to decide.</small></span><ChevronRight size={17}/></button>
 </div>
 {/* Thuso Market's shop (/shop) only ever quotes; this places a real order through Money's own route, behind
     its own dynamic import, so the shop's separate entry never carries Money's ledger. */}
 <SectionTitle title="Thuso Market"/>
 <div className="shortcut-list">
  <button className="shortcut-row" onClick={()=>navigate('Place a real market order')}><span className="service-icon"><CreditCard size={20}/></span><span className="shortcut-text"><strong>Place a real market order</strong><small>Prices the shop's catalogue and refuses a medicine, unlike the shop's own quote.</small></span><ChevronRight size={17}/></button>
 </div>
 <SectionTitle title="Recent activity"/>
 <StateBlock state={state} subject="Your wallet activity" permission="your payment provider">
  {walletActivity.length?<div className="panel">{walletActivity.map(line=><div className="record-row static" key={line.name}><span className="service-icon"><Wallet size={20}/></span><span><strong>{line.name}</strong><small>{line.date}</small></span><strong className="ledger">{line.delta>0?'+ ':'− '}{money(Math.abs(line.delta))}</strong></div>)}</div>
   :<EmptyState title="Nothing has moved yet" body="Top-ups, sponsored visits and refunds appear here, each with the date and what it was for."/>}
 </StateBlock>
 </>}
/* Topping up and sponsoring. Both used to open one dialog headed "Care credits, on your terms" with
   a Got it button under it — the same dead end twice, on the two things this screen exists to do.
 *
 * Neither of them takes a payment and neither of them pretends to. What they do instead is show the
 * whole journey: how much, from where, what it would come to, and then an outcome that states in
 * plain words that nothing moved. A person who has walked all four steps knows what the real thing
 * will ask of them, which is the entire value a preview can honestly offer. */
const payFrom=[['Card','A card you enter at the provider, never here'],['Instant EFT','Your own bank’s app confirms it'],['Debit order','The same amount, on the same day each month']] as const;
export function TopUpWallet({navigate}:{navigate:(s:string)=>void}){
 const [amount,setAmount]=useState<number>(topUpAmounts[1]);
 const [method,setMethod]=useState<string>(payFrom[0][0]);
 const [step,setStep]=useState(0);
 if(step===2) return <div className="success">
  <div className="success-icon"><Wallet size={30}/></div>
  <h3>Nothing has moved.</h3>
  <p className="success-when">{money(amount)}<br/>from {method}</p>
  <p className="helper">Your balance is still {money(walletBalance)}. A top-up is a payment, and a payment leaves this app for a regulated provider — this is where it would go, and what it would say when it came back.</p>
  <NotConnected of="payments"/>
  <button className="primary full space-top" onClick={()=>navigate('Thuso Wallet')}>Back to my wallet<ArrowRight size={17}/></button>
 </div>;
 return <div className="form-stack">
  <div className="review-line"><span>Balance now</span><strong>{money(walletBalance)}</strong></div>
  {step===0?<>
   <h3>How much would you like to add?</h3>
   <div className="time-grid" role="group" aria-label="Choose an amount">
    {topUpAmounts.map(a=><button key={a} type="button" aria-pressed={amount===a} className={`time-chip ${amount===a?'selected':''}`} onClick={()=>setAmount(a)}>{money(a)}</button>)}
   </div>
   <p className="helper" role="status">Your balance would become {money(walletBalance+amount)}.</p>
   <div className="privacy-note"><ShieldCheck size={19}/>Money in a wallet is money you have already handed over. It buys visits from the catalogue and it is refundable to the account it came from.</div>
   <button className="primary full" onClick={()=>setStep(1)}>Continue<ArrowRight size={16}/></button>
  </>:<>
   <h3>Where would it come from?</h3>
   <div className="choice-list" role="radiogroup" aria-label="Where would it come from?">
    {payFrom.map(([name,detail])=><label key={name} className={`choice-row ${method===name?'selected':''}`}>
     <input type="radio" name="topup-method" checked={method===name} onChange={()=>setMethod(name)}/>
     <span className="service-icon"><CreditCard size={20}/></span><span><strong>{name}</strong><small>{detail}</small></span></label>)}
   </div>
   <div className="review-line"><span>Adding</span><strong>{money(amount)}</strong></div>
   <div className="review-line"><span>New balance</span><strong>{money(walletBalance+amount)}</strong></div>
   <NotConnected of="payments"/>
   <div className="button-row"><button className="secondary" onClick={()=>setStep(0)}>Back</button><button className="primary" onClick={()=>setStep(2)}>Review the outcome<ArrowRight size={16}/></button></div>
  </>}
 </div>;
}
export function SponsorCare({navigate,people}:{navigate:(s:string)=>void;people:string[]}){
 const [who,setWho]=useState(people[0]);
 const [amount,setAmount]=useState<number>(services[0].price);
 const [sent,setSent]=useState(false);
 if(sent) return <div className="success">
  <div className="success-icon"><HeartHandshake size={30}/></div>
  <h3>Nothing has been sent.</h3>
  <p className="success-when">{money(amount)}<br/>towards {who.split(' ')[0]}’s care</p>
  <p className="helper">In production {who.split(' ')[0]} is told that a credit is waiting and chooses what to spend it on. You are told it was used, and on what date — never on what.</p>
  <div className="privacy-note"><LockKeyhole size={19}/>Paying for somebody’s care never opens their record. What you may see of them is decided under My family, by them.</div>
  <NotConnected of="payments"/>
  <button className="primary full space-top" onClick={()=>navigate('My family')}>Open My family<ArrowRight size={17}/></button>
 </div>;
 return <div className="form-stack">
  <h3>Who is it for?</h3>
  <label>Person<select value={who} onChange={e=>setWho(e.target.value)}>{people.map(p=><option key={p}>{p}</option>)}</select></label>
  <h3 className="space-top">How much?</h3>
  {/* The amounts are the catalogue's own prices, so "enough for a visit" means a visit that exists
      rather than a round number somebody liked. */}
  <div className="time-grid" role="group" aria-label="Choose an amount">
   {services.filter(s=>s.phase===1).slice(0,3).map(s=><button key={s.id} type="button" aria-pressed={amount===s.price} className={`time-chip ${amount===s.price?'selected':''}`} onClick={()=>setAmount(s.price)}>{money(s.price)}</button>)}
  </div>
  <p className="helper" role="status">{money(amount)} covers a {services.filter(s=>s.phase===1).find(s=>s.price===amount)?.name.toLowerCase()} at today’s catalogue price.</p>
  <div className="privacy-note"><LockKeyhole size={19}/>A sponsorship is a payment, not a permission. It never grants access to anybody’s health record.</div>
  <NotConnected of="payments"/>
  <button className="primary full" onClick={()=>setSent(true)}>Review the outcome<ArrowRight size={16}/></button>
 </div>;
}
/* A family member, opened — the whole of it, rather than the boundary in prose.
 *
 * This was a dialog headed "Care without crossing boundaries" with a Got it button, and then a
 * screen that named the boundary and offered three rows, one of which opened the catalogue with
 * nobody selected. The audit's three complaints were all still true afterwards: you could not book
 * for them, you could not see what you had shared, and you could not change it.
 *
 * All three are here now. Booking opens with them already chosen as the patient. What has been
 * shared is the account's own invitation list, filtered to this person, with the scope, the expiry
 * and the way out on each row. And the visits arranged for them are the account's own visit list
 * filtered the same way — because the thing a person opening their mother's profile wants from it
 * is the visit they booked her. */
const scopeTitles=scopes.map(sc=>sc.title);
export function FamilyProfile({name,relation,navigate,open,visits,invitations,onRevoke,book,view}:{
 name:string;relation:string;navigate:(s:string)=>void;open:(s:string)=>void;
 visits:VisitRow[];invitations:Invitation[];onRevoke:(id:string)=>void;book:(person:string)=>void;view:(id:string)=>void
}){
 const first=name.split(' ')[0];
 const own=relation==='You';
 /* Sharing has a direction, and the first draft of this screen got it backwards. An invitation names
    the person it was sent *to*, so an invitation to Nomsa is what Nomsa may see of the account
    holder's record — never what the account holder may see of Nomsa's. There is no invitation in
    the other direction because nobody has sent one, and the honest answer to "what may I see of my
    mother" is therefore the same as it is on the family list: her bookings, and nothing clinical.
    Only an accepted invitation grants anything; one awaiting acceptance or verification is shown as
    what it is and grants nothing, which is the rule the household record already applies. */
 const sharedWithThem=invitations.filter(i=>i.name===name);
 const granted=sharedWithThem.filter(i=>i.status==='Active');
 const seeOfThem=own?'Your own record':scopeTitles[0];
 const mine=visits.filter(r=>r.visit.person===name);
 const upcoming=mine.filter(r=>r.group==='upcoming');
 return <div className="form-stack">
  <NotConnected of="messaging"/>
  {/* Who they are and the two figures a person opens somebody else's profile for, in one panel. It
      was two, which put the person's name on the screen twice — once as the dialog's own title and
      again immediately underneath it. The figures answer "am I on top of my mother's care", which
      is what this screen is for. */}
  <div className="panel glass lead profile-figures">
   <div className="profile-who">
    <span className={`avatar ${own?'':'blue'}`}>{name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span>
    <div><strong>{relation}</strong><small>{name}</small></div>
    <Pill tone={own?'teal':'sky'}>{own?'Your own record':'Booking only'}</Pill>
   </div>
   <Metrics>
    <Metric value={String(mine.length)} label={own?'Visits on this account':`Visits arranged for ${first}`} chip={mine.length?'Arranged':'None yet'}/>
    <Metric value={String(upcoming.length)} label="Still to come" chip={upcoming.length?'Booked':'Nothing booked'}/>
   </Metrics>
  </div>

  <SectionTitle title={own?'Your visits on this account':`Visits you arranged for ${first}`}/>
  {mine.length?<div className="panel">{mine.map(r=><button className="record-row" key={r.id} onClick={()=>view(r.id)}>
   <span className="service-icon"><ServiceIcon name={r.visit.service.icon}/></span>
   <span><strong>{r.visit.service.name}</strong><small>{r.visit.date?`${longDateOf(r.visit.date)} · ${r.visit.start}`:schedulingLabels.asapPending}</small></span>
   <Pill tone={r.tone}>{r.status}</Pill><ChevronRight size={17}/>
  </button>)}</div>
  :<EmptyState title={`No visits for ${first} yet`} body={`Anything you arrange for ${first} appears here with the day, the nurse and what happened.`} action={`Book a visit for ${first}`} onAction={()=>book(name)}/>}

  <SectionTitle title={own?'What you may see of your own record':`What you may see of ${first}`}/>
  <div className="panel"><dl className="stated">
   <div><dt>Today</dt><dd>{seeOfThem}</dd><small>{own?'It is yours, in full.':scopes.find(sc=>sc.title===seeOfThem)?.body??'What this account may open of theirs today.'}</small></div>
   {/* The sentence this screen exists to say, kept word for word from the dialog it replaces: booking
       and paying for somebody is not the same as reading about them. */}
   {!own&&<div><dt>Not on this scope</dt><dd>{first}’s readings, results, medicines and notes.</dd><small>Their clinical information remains private unless appropriate access is verified, and they can withdraw it at any time. Ask {first} below; it is their decision, made on their own phone.</small></div>}
   <div><dt>Never, on any scope</dt><dd>Sexual and reproductive health, mental health and HIV-related entries.</dd><small>Hidden under every scope, including the widest, unless {own?'you release them':`${first} releases them`} one by one.</small></div>
  </dl></div>

  {/* Sharing has a direction and this section is the other one: not what you may see of them, but
      what they may see of you. It was a list under My family that never said who each row was about,
      and it is where a person changes their mind — the revoke is on the row. */}
  <SectionTitle title={own?'What you have shared with other people':`What ${first} may see of your record`}/>
  {sharedWithThem.length?<>
   <InvitationList invitations={sharedWithThem} onRevoke={onRevoke}/>
   {!own&&<p className="helper"><LockKeyhole size={14}/>{granted.length?`${first} can see this much of your record until you withdraw it. Withdrawing takes effect immediately.`:`Nothing is open to ${first} yet. An invitation grants nothing until it is accepted and the person's identity is verified.`}</p>}
  </>
   :<div className="panel"><dl className="stated"><div><dt>Nothing is shared</dt>
    <dd>{own?'Nobody has been given access to your record.':`${first} has not been given access to your record.`}</dd>
    <small>{own?'Anyone you invite appears here with the scope you chose and the day it ends.':'Being in your circle opens nothing, and paying for somebody’s care opens nothing either. Access is a separate decision, made once and withdrawn at any time.'}</small></div></dl></div>}

  <SectionTitle title="What you can do"/>
  <div className="shortcut-list">
   <button className="shortcut-row" onClick={()=>book(name)}><span className="service-icon"><Stethoscope size={20}/></span><span className="shortcut-text"><strong>Book a visit for {first}</strong><small>Opens the catalogue with {first} already chosen as the patient.</small></span><ChevronRight size={17}/></button>
   <button className="shortcut-row" onClick={()=>open('Invite a guardian')}><span className="service-icon"><UserPlus size={20}/></span><span className="shortcut-text"><strong>{own?'Give somebody access to your record':`Ask ${first} for access`}</strong><small>{own?'You choose the scope and how long it lasts, and you can withdraw it at any time.':'They decide the scope and how long it lasts, on their own phone.'}</small></span><ChevronRight size={17}/></button>
   <button className="shortcut-row" onClick={()=>open('Thuso Family')}><span className="service-icon"><Users size={20}/></span><span className="shortcut-text"><strong>Open the household record</strong><small>The same household, seen through each person’s own permissions.</small></span><ChevronRight size={17}/></button>
   <button className="shortcut-row" onClick={()=>navigate('Privacy & settings')}><span className="service-icon"><Eye size={20}/></span><span className="shortcut-text"><strong>Who has opened a record</strong><small>Every access, and every refusal, with the reason it was refused.</small></span><ChevronRight size={17}/></button>
  </div>
  <div className="privacy-note"><LockKeyhole size={19}/>Booking for somebody opens their booking, never their record. Sponsoring their care does not change that.</div>
 </div>;
}
export function Explore({open,onOnboarding,navigate}:{open:(s:string)=>void;onOnboarding:()=>void;navigate:(s:string)=>void}){return <>
 <div className="page-intro"><div className="eyebrow">The MyThuso family</div><h1>More ways to be cared for.</h1><p>Explore the complete vision. Availability follows the proposal’s phased roadmap.</p></div>
 {/* The highlights carousel lives here rather than on the home. Rotating promotion is what this
     page is for; on a returning patient's home it stood between them and the thing they came to do,
     and WCAG 2.2.2 is satisfied either way by the pause control it carries. */}
 <HeroCarousel navigate={navigate}/>
 <div className="catalog-grid module-grid">
  <button className="panel module-card highlight" onClick={onOnboarding}><Pill tone="plain">Phase 1</Pill><h3>Set up your account<ArrowUpRight size={17}/></h3><p>Sign-up, the one-time code, your identity number, and how to get back in if you lose the phone.</p><small>Full-screen flow</small></button>
  {modules.map(([n,d,p])=><button className="panel module-card" key={n} onClick={()=>open(n)}><Pill tone="plain">{p}</Pill><h3>{n}<ArrowUpRight size={17}/></h3><p>{d}</p><small>{p==='Phase 1'?'Being built now':'On the roadmap'}</small></button>)}
 </div></>}
const menuGroups=[
 /* Live well first in this group, because on a phone this hub is the only door to it — the tab bar
    holds five targets at 320px and the sixth would have come out of the four a person navigates by.
    The sub-line says what the screen is rather than selling it: there is nothing to sell. */
 [['Live well','What you did, in your own words, beside your record',NotebookPen,'Live well'],
  ['My family','Manage your loved ones',Users,'My family'],['Care plans','Ongoing care and subscriptions',HeartHandshake,'Care plans'],['Thuso Wallet','Balance, activity and sponsored care',CreditCard,'Thuso Wallet'],[patientPagesHubRoute.opens,'Symptom checker, health library, vaccinations and more',BookOpen,patientPagesHubRoute.opens],
  /* The screens the Lovable export drew and this build did not have. On a phone this hub is their door, as the
     sidebar is on a wide screen; the names are the router's, and two of the lines are the Your health hub's. */
  [patientScreenRoutes.messages.opens,'One thread for each visit, with the nurse on it',MessageSquare,patientScreenRoutes.messages.opens],
  [patientScreenRoutes.consultation.opens,'When your nurse asks a doctor to join: who, and what you are asked',Video,patientScreenRoutes.consultation.opens],
  [patientScreenRoutes.results.opens,'Your documents, the trend and what readings measure',FlaskConical,patientScreenRoutes.results.opens],
  [patientScreenRoutes.devices.opens,'The kit a nurse brings, and your phone\u2019s health store',Bluetooth,patientScreenRoutes.devices.opens],
  [patientPageRoutes['mental-health'].opens,patientPageRoutes['mental-health'].sub,LifeBuoy,patientPageRoutes['mental-health'].opens],
  [patientPageRoutes.activity.opens,patientPageRoutes.activity.sub,Footprints,patientPageRoutes.activity.opens]],
 [['Care area','Rosebank, Johannesburg',MapPin,'@Your location'],['Notifications','Visit updates and messages',Bell,'@Notifications'],['Privacy & settings','Your data and app preferences',Settings2,'Privacy & settings'],['Language','Read MyThuso your way',Globe,'@Language'],['Language & access','Twelve official languages, and what is honestly offered in each',Languages,'Language & access']],
 /* Emergency first in this group, and in the shell's sidebar as well. It was the fourteenth card
    inside a roadmap page — the most complete journey in the product behind the most clicks in it,
    on the one pathway where a person cannot afford to hunt. */
 [['Emergency & urgent care','The ambulance number first, then what MyThuso can do',Ambulance,'@Emergency & urgent care'],['Explore MyThuso','The full 21-module roadmap',LayoutGrid,'Explore MyThuso'],['Help & support','What MyThuso can answer today, and what it cannot',CircleHelp,'Help & support'],['Demo login','Open MyThuso as a nurse, a doctor, a partner or the back office',Stethoscope,'@Switch workspace']]
] as const;
export function MoreHub({navigate,open,onSignOut}:{navigate:(s:string)=>void;open:(s:string)=>void;onSignOut:()=>void}){
 return <>
  <div className="page-intro"><h1>More</h1></div>
  <button className="profile-row" onClick={()=>open('Your profile')}><span className="avatar"><PatientPortrait/></span><span><strong>Lerato Molefe</strong><small>View and edit your profile</small></span><ChevronRight size={18}/></button>
  {menuGroups.map((group,i)=><div className="menu-list" key={i}>{group.map(([title,sub,Icon,target])=>
   <button className="menu-row" key={title} onClick={()=>target.startsWith('@')?open(target.slice(1)):navigate(target)}>
    <span className="tile-icon"><Icon size={19}/></span><span><strong>{title}</strong><small>{sub}</small></span><ChevronRight size={17}/>
   </button>)}</div>)}
  <div className="menu-list danger"><button className="menu-row" onClick={onSignOut}><span className="tile-icon"><LogOut size={19}/></span><span><strong>Log out</strong><small>Signs you out and returns to the sign-in screen</small></span></button></div>
  <div className="trust-footer"><span>MyThuso · Akhanya IT Innovations</span><span>Help. Health. Home.</span></div>
 </>}
/* SystemStates is gone. A gallery of loading, error, offline, denied and empty is a thing for the
   people building the product, not for somebody looking for a nurse, and it was the last reason a
   demo pill sat on every screen. What it proved is held better now: check-boundaries.mjs asserts at
   source that all five exist and that each still says something a person can act on, and
   tests/states.spec.ts drives offline and a failed request from the real condition. */
/* Four notices that went nowhere. Each one now opens the screen it is about, which is the whole
   point of a notification: it is not news, it is a door. The one that matters most is the last \u2014
   somebody asking for access to a record \u2014 and reading it without being able to act on it is worse
   than not being told. */
const notices=[
 {icon:Check,title:'Your visit is confirmed',body:'Sister Naledi is scheduled for Saturday, 09:00.',go:'My visits',page:true},
 {icon:FileText,title:'Your visit summary is ready',body:'Sister Naledi\u2019s notes and the doctor\u2019s review are on your Passport.',go:'Health Passport',page:true},
 {icon:Sparkles,title:'A little reminder',body:'Explore regular check-ins with Thuso Routine.',go:'Care plan: Chronic Routine',page:false},
 {icon:Bell,title:'Someone asked for access',body:'Kagiso asked to help with your bookings. Review what he would see.',go:'Your consents',page:false}
] as const;
export function Notifications({open,navigate}:{open:(s:string)=>void;navigate:(s:string)=>void}){
 return <div className="notification-list">
  {notices.map(({icon:Icon,title,body,go,page})=><button className="record-row" key={title} onClick={()=>page?navigate(go):open(go)}>
   <Icon size={21}/><span><strong>{title}</strong><small>{body}</small></span><ChevronRight size={17}/>
  </button>)}
  <NotConnected of="messaging"/>
 </div>;
}
