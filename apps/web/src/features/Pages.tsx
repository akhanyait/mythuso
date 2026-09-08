import { useState } from 'react';
import { Activity, Ambulance, ArrowRight, ArrowUpRight, Ban, Bell, Bluetooth, CalendarClock, Check, ChevronRight, CircleHelp, ClipboardPlus, Clock3, CreditCard, Download, Droplets, Eye, FileCheck, FileText, Globe, Heart, HeartHandshake, History, Languages, LayoutGrid, LockKeyhole, LogOut, MapPin, PenLine, Plus, Search, Settings2, Share2, ShieldCheck, Sparkles, Stethoscope, Trash2, Users, UserPlus, Wallet, Zap } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle, ServiceIcon } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { ClinicalChart } from '../components/Chart';
import { EmptyState, StateBlock, useOffline, type LoadState } from '../components/States';
import { InvitationList, type Invitation } from './Guardian';
import { HeroCarousel } from '../components/HeroCarousel';
import { FamilyScene, PatientPortrait } from '../components/Portraits';
import { modules, services, money, type Service } from '../lib/catalog';
import type { DemoVisit } from './Booking';
import { endTime, isoIn, labels as schedulingLabels, longDateOf, shortDateOf, visitEnds, weekdayOf } from '../lib/scheduling';
import { holdStatus } from '../lib/interpreting';
import { activity as walletActivity, balance as walletBalance, topUpAmounts } from '../lib/wallet';
import businessModel from '../../../../packages/catalog/business-model.json';
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
function ServiceCard({service,onOpen}:{service:Service;onOpen:()=>void}) {
 const live=service.phase===1;
 return <button className={`service-card${live?'':' later'}`} onClick={onOpen}>
  <span className="service-icon"><ServiceIcon name={service.icon} size={21}/></span>
  <h3>{service.name}</h3>
  <p>{service.description}</p>
  <div>{live
   ?<><strong>From {money(service.price)}</strong><span>{service.duration} min<ChevronRight size={16}/></span></>
   :<><strong className="later-price">{money(service.price)} planned</strong><span>Phase {service.phase}<ChevronRight size={16}/></span></>}</div>
 </button>;
}
export function Services({book,open,query=''}:{book:(s:Service)=>void;open:(s:string)=>void;query?:string}) {
 const [category,setCategory]=useState('All services');
 const [search,setSearch]=useState(query);
 const filtered=services.filter(s=>(category==='All services'||s.category===category)&&`${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
 const bookable=filtered.filter(s=>s.phase===1);
 const planned=filtered.filter(s=>s.phase!==1);
 return <>
  <div className="page-intro"><div className="eyebrow">Care, on your terms</div><h1>Professional care at your door</h1><p>Choose a service and we’ll match you with the nearest qualified nurse.</p></div>
  <div className="catalog-tools"><label className="search-box"><Search size={18}/><input aria-label="Search services" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a service…"/></label><span className="helper">{filtered.filter(s=>s.phase===1).length} bookable now · {filtered.length} in the catalogue</span></div>
  <div className="tabs" aria-label="Service categories">{['All services','Everyday care','Family health','Recovery','Tests & screening'].map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
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
  {!filtered.length&&<EmptyNote>No services match your search. Try another name or category.</EmptyNote>}
  <button className="menu-row panel space-top" onClick={()=>book(services[0])}><span className="tile-icon"><CircleHelp size={19}/></span><span><strong>Not sure what you need?</strong><small>Chat to our care team</small></span><ChevronRight size={17}/></button>
  <div className="privacy-note space-top"><ShieldCheck size={19}/>Only phase-one services can be booked. Later-phase services are shown so the plan is visible, not because a nurse can be sent for one today.</div>
 </>}
/* A row is built from a visit, not typed beside one. The date block and the time both come from
   the same ISO date and start, so the weekday shown can never disagree with the day it names —
   which it did, in three different places, before this.
 *
 * The rows used to be built inside this component, which meant a visit could be looked at and never
 * changed: reschedule opened a dialog about the roadmap and there was no cancel at all. They live in
 * App.tsx now, so moving one moves it and standing one down moves it into Cancelled with its reason
 * — the journey finishes rather than stopping at the first screen that could act. */
export type VisitGroup='upcoming'|'past'|'cancelled';
export type VisitRow={id:string;visit:DemoVisit;status:string;tone:string;group:VisitGroup;reason?:string;booked?:boolean};
export type VisitAction='reschedule'|'cancel';
const sample=(id:string,service:Service,person:string,address:string,dayOffset:number,start:string,status:string,tone:string,group:VisitGroup,reason?:string):VisitRow=>({
 id,group,reason,
 visit:{service,person,address,kind:'scheduled',payment:'Card',status:'Confirmed',
  date:isoIn(new Date(Date.now()+dayOffset*86_400_000)),start},
 status,tone});
/* A held visit is not a confirmed one and does not read like one here either: it carries the
   contract's own word and the amber tone the pending states use. */
export const rowFor=(visit:DemoVisit,id:string):VisitRow=>
 ({id,visit,status:visit.status,tone:visit.status===holdStatus||visit.kind==='asap'?'amber':'',group:'upcoming',booked:true});
export const sampleVisitRows=():VisitRow[]=>[
 sample('VIS-0051',services[0],'Lerato Molefe','Home visit · Sandton',5,'09:00','Confirmed','','upcoming'),
 sample('VIS-0052',services[1],'Lerato Molefe','Home visit · Sandton',17,'10:00','Pending','amber','upcoming'),
 sample('VIS-0053',services[2],'Thabo Molefe','Home visit · Rivonia',29,'14:00','Scheduled','sky','upcoming'),
 sample('VIS-0044',services[1],'Lerato Molefe','Home visit · Sandton',-3,'10:00','Completed','','past'),
 sample('VIS-0039',services[3],'Nomsa Molefe','Home visit · Soweto',-12,'08:00','Cancelled','amber','cancelled','I no longer need this visit')
];
export function Visits({rows:all,book,manage,view}:{rows:VisitRow[];open:(s:string)=>void;book:()=>void;manage:(id:string,action:VisitAction)=>void;view:(id:string)=>void}) {
 const [tab,setTab]=useState('Upcoming');
 /* The only one of the five states anything on this screen can honestly be in today. Nothing
    fetches a visit list yet, so error and permission-denied would be a picker wearing a hat; the
    phone knows whether it has a signal without asking anybody. */
 const state:LoadState=useOffline()?'offline':'ready';
 const group:VisitGroup=tab==='Upcoming'?'upcoming':tab==='Past'?'past':'cancelled';
 const rows=all.filter(r=>r.group===group);
 return <>
  <div className="page-intro"><h1>Your visits</h1></div>
  <div className="underline-tabs" role="group" aria-label="Visit status">{['Upcoming','Past','Cancelled'].map(t=><button key={t} className={tab===t?'selected':''} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
  <NotConnected of="booking"/>
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
     {i===0&&<div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div></div>}
     <div className="visit-actions">
      <button className="secondary" onClick={()=>manage(id,'reschedule')}>Reschedule</button>
      <button className="secondary" onClick={()=>manage(id,'cancel')}>Cancel</button>
      <button className="primary" onClick={()=>view(id)}>View details</button>
     </div>
    </>}
    {group==='past'&&<div className="visit-actions">
     <button className="secondary" onClick={()=>view(id)}>View details</button>
     <button className="primary" onClick={book}>Book this again</button>
    </div>}
    {group==='cancelled'&&<div className="visit-actions">
     <button className="secondary" onClick={()=>view(id)}>View details</button>
     <button className="primary" onClick={book}>Book another visit</button>
    </div>}
   </div>)}</div>
   :<EmptyState title={`No ${tab.toLowerCase()} visits`} body={tab==='Cancelled'?'A visit you cancel stays here with the reason you gave, rather than disappearing.':'When you book a visit it appears here, with the nurse’s name and what to have ready.'} action="Book a nurse" onAction={book}/>}
  </StateBlock>
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
export function PageHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}) {return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>;}
/* One visit, opened.
 *
 * This dialog used to be a fixed sentence — "Vitals & chronic check", Sister Naledi, "arrival
 * updates, secure messaging and rescheduling will be connected in the functionality phase" — printed
 * over whatever visit you had actually pressed, with one button that went to the Health Passport. It
 * is the visit now, and the two things a person opens a visit to do are on it. */
const toBring=['Your identity document, so the nurse can confirm the right patient at the door','Every medicine you are taking, boxes and all','A chair and a light in a room you can close'] as const;
export function VisitDetail({row,manage,navigate}:{row:VisitRow;manage:(id:string,action:VisitAction)=>void;navigate:(s:string)=>void}){
 const {visit:v,status,tone,group,reason}=row;
 return <div className="form-stack">
  <NotConnected of="booking"/>
  <div className="booking-summary"><span className="service-icon"><ServiceIcon name={v.service.icon}/></span><div><h3>{v.service.name}</h3><p>{v.service.duration} min · Registered nurse</p></div><strong>{money(v.service.price)}</strong></div>
  <div className="review-line"><span>Reference</span><strong>{row.id}</strong></div>
  <div className="review-line"><span><Clock3 size={15}/> When</span><strong>{v.date&&v.start?`${longDateOf(v.date)} · ${v.start} – ${endTime(v.start,v.service.duration)}`:schedulingLabels.asapPending}</strong></div>
  <div className="review-line"><span><MapPin size={15}/> Where</span><strong>{v.address}</strong></div>
  <div className="review-line"><span>Patient</span><strong>{v.person}</strong></div>
  <div className="review-line"><span>Status</span><strong><Pill tone={tone}>{status}</Pill></strong></div>
  {reason&&<div className="review-line"><span>Reason given</span><strong>{reason}</strong></div>}
  <div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div></div>
  <SectionTitle title="Have this ready"/>
  <div className="panel">{toBring.map(line=><div className="record-row static" key={line}><span className="service-icon"><Check size={20}/></span><span><strong>{line}</strong></span></div>)}</div>
  {group==='upcoming'
   ?<div className="button-row"><button className="secondary" onClick={()=>manage(row.id,'reschedule')}><CalendarClock size={16}/>Reschedule</button><button className="secondary" onClick={()=>manage(row.id,'cancel')}><Ban size={16}/>Cancel</button></div>
   :<p className="helper">A {group} visit cannot be moved or cancelled. Book another one from My visits.</p>}
  <button className="primary full" onClick={()=>navigate('Health Passport')}>Open my Health Passport<ArrowRight size={17}/></button>
 </div>;
}
export function Passport({open}:{open:(s:string)=>void}) {
 const [tab,setTab]=useState('Overview');
 const [deviceState,setDeviceState]=useState<LoadState>('denied');
 return <>
  <div className="page-intro"><h1>Health Passport</h1><p>Your health. Your story. Every visit, reading and result, in one place.</p></div>
  <NotConnected of="clinical-records"/>
  {/* A credential, composed as one. The largest thing on it used to be the slogan and the smallest
      was the holder's name, with a cartoon face where the photograph goes — which is the single
      element on the patient side that most made this look like a mock-up of a health app rather
      than one. The name leads, the reference number is a labelled field set in tabular figures so
      it can be read out over a phone, and the face is the same monogram the rest of the app uses
      for this person. The slogan keeps its words, in the page heading, where a slogan belongs. */}
  <section className="passport-hero">
   <span className="passport-portrait" aria-hidden="true">LM</span>
   <div className="passport-identity">
    <Pill tone="light">Thuso Pass</Pill>
    <h2>Lerato Molefe</h2>
    <dl><div><dt>Passport ID</dt><dd>TH-2048-3920</dd></div><div><dt>Issued</dt><dd>Akhanya IT Innovations</dd></div></dl>
   </div>
  </section>
  <div className="underline-tabs" role="group" aria-label="Passport sections">{['Overview','Records','Medications','More'].map(t=><button key={t} className={tab===t?'selected':''} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
  {tab==='Overview'?<>
   <SectionTitle title="Health trends" action="See all" onClick={()=>open('Health trends')}/>
   <div className="chart-grid">
    <ClinicalChart title="Blood pressure" unit="mmHg" normal={[90,140]} icon={<Heart size={16}/>} readings={[{label:'12 Aug',value:128},{label:'19 Aug',value:134},{label:'28 Aug',value:141,note:'Missed medication'},{label:'4 Sep',value:136}]}/>
    <ClinicalChart title="Heart rate" unit="bpm" normal={[50,100]} icon={<Activity size={16}/>} readings={[{label:'12 Aug',value:76},{label:'19 Aug',value:74},{label:'28 Aug',value:80},{label:'4 Sep',value:72}]}/>
    <ClinicalChart title="Blood glucose" unit="mmol/L" normal={[4,7.8]} icon={<Droplets size={16}/>} format={n=>n.toFixed(1)} readings={[{label:'12 Aug',value:5.6},{label:'19 Aug',value:6.1},{label:'28 Aug',value:5.4},{label:'4 Sep',value:5.2}]}/>
   </div>
   {/* Three actions that used to be three tall unlabelled tiles in a row of their own, sitting
       directly against the next section's heading. They are the home's shortcut row now: same
       icon tile, same target size, and each one says what it does before you press it — which
       matters most for the middle one, which puts a file on the reader's device. */}
   <SectionTitle title="Your record"/>
   <div className="shortcut-list">
    <button className="shortcut-row" onClick={()=>open('Share my passport')}><span className="service-icon"><Share2 size={20}/></span><span className="shortcut-text"><strong>Share record</strong><small>Let a verified professional see a limited summary, for a period you set.</small></span><ChevronRight size={17}/></button>
    <button className="shortcut-row" onClick={()=>{const blob=new Blob([JSON.stringify({demo:true,patient:'Lerato Molefe',readings:[{bloodPressure:'118/78',heartRate:72,glucose:5.2}],notice:'Fictional data. Not a medical record.'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mythuso-demo-passport.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><span className="service-icon"><Download size={20}/></span><span className="shortcut-text"><strong>Export sample passport</strong><small>Downloads a JSON copy to your device. Nothing is sent anywhere.</small></span><ChevronRight size={17}/></button>
    <button className="shortcut-row" onClick={()=>open('Your care team')}><span className="service-icon"><Users size={20}/></span><span className="shortcut-text"><strong>Doctors</strong><small>The clinicians who have reviewed what is on your record.</small></span><ChevronRight size={17}/></button>
   </div>
   <SectionTitle title="Your care timeline"/>
   <div className="panel">{['Wound care visit · 4 September','Doctor review completed · 4 September','Vitals recorded · 28 August'].map(t=><button className="record-row" key={t} onClick={()=>open(t)}><span className="service-icon"><FileText size={20}/></span><span><strong>{t}</strong><small>Reviewed by Dr N. Khumalo · MP 0741225</small></span><ChevronRight size={18}/></button>)}</div>
  </>:tab==='Records'?<>
   <SectionTitle title="Your documents"/>
   <div className="panel document-list">{['Visit summary','Laboratory results','Medical certificate'].map(t=><button className="record-row" key={t} onClick={()=>open(t==='Laboratory results'?'Laboratory order LAB-0023':t)}><span className="service-icon"><FileText size={20}/></span><span><strong>{t}</strong><small>Issued 4 September</small></span><Pill>Doctor reviewed</Pill><ChevronRight size={17}/></button>)}</div>
   <p className="helper"><ShieldCheck size={14}/>Every document says who issued it, when, and whether a registered doctor has reviewed it. A document with no review status is not a reviewed document.</p>
  </>
  /* An absence of prescriptions is an ordinary state, not a footnote, so it uses the same empty
     state as every other list rather than a tinted note of its own. */
  :tab==='Medications'?<>
   <SectionTitle title="Your prescriptions"/>
   <EmptyState title="No active prescriptions" body="Prescriptions appear here once a registered doctor has issued them, with the pharmacy that may fill them and the date they run out." action="See how a prescription reads" onAction={()=>open('Prescription RX-0081')}/>
   <button className="text-button space-top" onClick={()=>open('Thuso Pharmacy')}>Explore pharmacy fulfilment<ArrowRight size={16}/></button>
  </>
  /* The one state on the patient side that is true rather than staged: nothing in this build has
     asked this device for Health Connect or Apple Health, so the permission genuinely has not been
     granted and the screen says what a person can do about it. It needs no wire because the answer
     is already no. */
  :<><SectionTitle title="Connected devices"/><NotConnected of="devices"/>
   <StateBlock state={deviceState} subject="Readings from your connected devices" permission="Apple Health or Health Connect access" onRetry={()=>setDeviceState('ready')}>
    <div className="catalog-grid">{['Apple Health','Health Connect','Thuso Kit'].map(t=><div className="panel module-card" key={t}><span className="tile-icon"><Bluetooth size={20}/></span><h3>{t}</h3><p>Choose exactly which readings you share, and stop sharing them without losing what is already on your record.</p><button className="secondary full" onClick={()=>open(`${t} connection`)}>How this connects<ArrowRight size={16}/></button></div>)}</div>
   </StateBlock></>}
 </>}
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
export function Family({open,members,invitations,onRevoke}:{open:(s:string)=>void;members:string[];invitations:Invitation[];onRevoke:(id:string)=>void}) {return <><PageHeading eyebrow="THUSO FAMILY" title="Care for your whole circle." description="Be there for the people you love, wherever you are."/>
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
 <div className="section-title space-top"><h2>Guardians and shared access</h2><button className="secondary" onClick={()=>open('Invite a guardian')}><UserPlus size={16}/>Invite someone</button></div>
 {invitations.length?<InvitationList invitations={invitations} onRevoke={onRevoke}/>:<EmptyState title="Nobody else has access" body="When you invite a guardian or a family member, their access appears here with exactly what they can see and when it ends." action="Invite someone" onAction={()=>open('Invite a guardian')}/>}
 <div className="privacy-note"><LockKeyhole size={19}/>Paying for a family member’s care does not automatically grant access to their health records.</div></>}
/* Five plans, none of which can be bought. That is why none of them has a primary button any more:
   a solid teal call to action on a card marked "PHASE 2 PREVIEW" reads as the one you may sign up
   for today, and the honest answer for all five is the same. The first card keeps its tint, which
   marks it without promising it. One column on a phone — at two-up the names wrapped to two lines
   and the buttons landed at five different heights. */
/* The five plans a patient can see, derived rather than typed. The prices used to be written here —
   199, 99, 249, 699 — beside the same five numbers in packages/catalog/business-model.json, which is
   where the funding proposal's commercial model actually lives. Two copies of a subscription price
   is how a landing page ends up advertising one figure while the app charges another. The
   description is the product's own words for a patient; the money is the contract's. */
const planCopy: Record<string, string> = {
 chronic: 'Monthly check-ins, doctor review and adherence support.',
 planning: 'Scheduled injection visits and discreet reminders.',
 mom: 'Support through pregnancy and baby\u2019s first year.',
 senior: 'Weekly visits, medication support and family reports.',
 recover: 'A personal care plan for your recovery at home.'
};
const plans = ['chronic', 'planning', 'mom', 'senior', 'recover'].map(id => {
 const plan = businessModel.subscriptions.find(s => s.id === id)!;
 /* Thuso Recover has no price in the contract — it is sold per package, to patients and to
    hospitals — and 'Custom' is how that is said on a card rather than a number nobody set. */
 return [plan.name, plan.price === null ? 'Custom' : String(plan.price), planCopy[id]] as const;
});
/* What each plan actually contains, and the one thing it is not. "Explore plan" used to open a
   dialog that said the plan was on the roadmap and offered a Got it button — the end of a journey
   that had barely started. A person choosing between five plans wants three answers: what is in it,
   what it costs a month, and what joining would involve. The third is the honest half: none of the
   five can be joined, so the screen shows what joining *would* be rather than a button that lies. */
const planDetail:Record<string,{includes:readonly string[];not:string;who:string}>={
 'Chronic Routine':{includes:['A nurse visit every month, at an hour you choose','Blood pressure and glucose recorded onto your Health Passport','A registered doctor reviews each set of readings','A reminder before every visit, and before a repeat runs out'],not:'It is not a medical aid and it does not pay for medicines, tests or a hospital.',who:'Somebody managing a long-term condition at home.'},
 'Family Planning Plan':{includes:['Scheduled injection visits, at the interval your method needs','A discreet reminder, worded so it says nothing on a lock screen','A nurse who is cleared for this scope, every time'],not:'It is not contraception itself, and nothing here is dispensed without a prescription.',who:'Anybody who would rather not book the same visit over and over.'},
 'Thuso Mom':{includes:['Antenatal checks through pregnancy','A six-week check for you and the baby','Feeding and recovery support in your own home'],not:'It is not antenatal care on its own — it sits beside your clinic or your doctor, never instead of them.',who:'From pregnancy through baby’s first year.'},
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
 const [,price,description]=entry;
 return <div className="form-stack">
  <div className="booking-summary"><span className="service-icon"><HeartHandshake size={23}/></span><div><h3>{name}</h3><p>{detail.who}</p></div><strong>{price==='Custom'?price:`R${price}`}</strong></div>
  <p className="muted">{description}</p>
  <SectionTitle title="What is in it"/>
  <div className="panel">{detail.includes.map(line=><div className="record-row static" key={line}><span className="service-icon"><Check size={20}/></span><span><strong>{line}</strong></span></div>)}</div>
  <div className="privacy-note"><Ban size={19}/>{detail.not}</div>
  <SectionTitle title="What joining would involve"/>
  <ol className="plan-steps">{joining.map((step,i)=><li key={step}><b>{i+1}</b><span>{step}</span></li>)}</ol>
  <div className="review-line"><span>Monthly</span><strong>{price==='Custom'?'Priced per plan':`R${price} / month`}</strong></div>
  <div className="review-line"><span>Available from</span><strong>{plans.findIndex(([n])=>n===name)<2?'Phase 2':'Phase 3'}</strong></div>
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
/* Five plans, and the reader is comparing two things across them: what it includes and what it
   costs a month. Both used to land wherever the description happened to end, so R199 on the first
   card sat twenty pixels below R249 on the third and the prices could not be read as a column. The
   card is a fixed set of rows now — phase, name, description, price, action — and each row starts
   on the same line across all five. The heart tile is gone with them: it was the same glyph five
   times, which told a reader nothing except that somebody had a spare icon. */
export function Plans({open}:{open:(s:string)=>void}) {return <><PageHeading eyebrow="THUSO ROUTINE" title="A healthier rhythm." description="Care that keeps showing up. For every chapter of life."/><div className="catalog-grid plan-grid">{plans.map(([n,p,d],i)=><div className={`panel plan-card ${i===0?'featured':''}`} key={n}><Pill tone="plain">{i<2?'PHASE 2':'PHASE 3'}</Pill><h2>{n}</h2><p>{d}</p><strong className="plan-price">{p==='Custom'?p:`R${p}`}<small>{p==='Custom'?' pricing':' / month'}</small></strong><button className="secondary" onClick={()=>open(`Care plan: ${n}`)}>Explore plan<ArrowRight size={17}/></button></div>)}</div><NotConnected of="payments"/></>}
/* Seven rights, seven identical shields. The icon was the same on every row, so it carried no
   information at all and the list had to be read word by word to be used. Each row now has the
   icon of the thing it does and a line saying what is behind it, in the settings-row pattern the
   More hub already uses — one row idiom on both screens rather than two that nearly match. */
const rights=[['Who can see my records','Verified professionals, and for how long',Eye,'Share my passport'],['Guardians and shared access','People you have invited, and exactly what they see',UserPlus,'Invite a guardian'],['My consents, and how to withdraw them','Every purpose you agreed to, and the wording you agreed to',FileCheck,'Your consents'],['View access history','Who opened your record — and who was refused',History,'Access history'],['Request a correction','Ask for inaccurate information about you to be fixed',PenLine,'Request a correction'],['Request account deletion','What can be deleted, and what a retention schedule keeps',Trash2,'Request account deletion'],['Information Officer','Your privacy contact under POPIA',ShieldCheck,'Contact privacy team']] as const;
export function Privacy({open}:{open:(s:string)=>void}) {const [choices,setChoices]=useState<Record<string,boolean>>({'Care reminders':true,'Wearable readings':false,'Product updates':false});return <><PageHeading eyebrow="YOUR PRIVACY MATTERS" title="Your data. Your choices." description="Clear choices about how your information is used."/><div className="two-column"><section className="panel"><SectionTitle title="Sharing preferences"/><p className="muted">Clinical processing is a separate purpose with its own lawful basis, and it is not switched by anything on this card.</p>{Object.entries(choices).map(([k,v])=><div className="setting-row" key={k}><span><strong>{k}</strong><small>{k==='Care reminders'?'Visit and care-plan reminders':k==='Wearable readings'?'Optional health trends from your devices':'Optional news and offers'}</small></span><button role="switch" aria-checked={v} aria-label={k} className={`switch ${v?'on':''}`} onClick={()=>setChoices({...choices,[k]:!v})}><span/></button></div>)}</section><section className="panel"><SectionTitle title="You’re in control"/>{rights.map(([label,detail,Icon,target])=><button className="menu-row" key={label} onClick={()=>open(target)}><span className="tile-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={17}/></button>)}</section></div><div className="privacy-note"><LockKeyhole size={19}/>Controls on a screen are not compliance. POPIA also asks for governance, contracts, a lawful basis for each purpose and technical safeguards somebody has verified.</div></>}
/* Money that does not exist, said out loud. The activity list goes through the same StateBlock as
   every other list that will one day be answered by a service somebody else operates — a payment
   provider being down is an ordinary Tuesday, and it is better designed now than improvised then. */
/* The ledger and the balance both come from lib/wallet.ts. R500.00 used to be typed here and typed
   again in the booking's payment list, and the visit line beside it named its own amount rather than
   the catalogue's. */
export function WalletPage({open}:{open:(s:string)=>void}){
 const state:LoadState=useOffline()?'offline':'ready';
 return <><PageHeading eyebrow="THUSO WALLET" title="A little care, set aside." description="Support your own care or give someone a helping hand."/>
 {/* Before the balance, not after it. The number in the hero is the thing on this screen a person
     would most reasonably take for money they have. */}
 <NotConnected of="payments"/>
 {/* The reference's one signature move, on the one figure this screen is about: the amount set large
     and thin with a small label above it, rather than a small label above a heavy number. */}
 <div className="wallet-hero rise"><Wallet size={24}/><span>Balance</span><p className="wallet-figure"><strong>{money(walletBalance)}</strong><small>available</small></p><div className="button-row"><button className="secondary" onClick={()=>open('Top up wallet')}><Plus size={17}/>Top up</button><button className="secondary" onClick={()=>open('Sponsor care')}><Users size={17}/>Sponsor care</button></div></div>
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
/* A family member, opened. This was a dialog headed "Care without crossing boundaries" with a Got it
   button — a sentence about a boundary rather than the boundary itself. It is a screen now: who they
   are, what you may and may not see of them, and the three things you can actually do from here. */
export function FamilyProfile({name,relation,navigate,open}:{name:string;relation:string;navigate:(s:string)=>void;open:(s:string)=>void}){
 const first=name.split(' ')[0];
 const own=relation==='You';
 return <div className="form-stack">
  <div className="booking-summary"><span className="avatar">{name.split(' ').map(s=>s[0]).slice(0,2).join('')}</span><div><h3>{name}</h3><p>{relation}</p></div><Pill tone={own?'teal':'sky'}>{own?'Your own record':'Booking only'}</Pill></div>
  <SectionTitle title="What you may see"/>
  <div className="panel">
   <div className="record-row static"><span className="service-icon"><Check size={20}/></span><span><strong>Visits you arranged for {own?'yourself':first}</strong><small>The service, the day and whether it happened.</small></span></div>
   {/* The sentence this screen exists to say, kept word for word from the dialog it replaces: booking
       and paying for somebody is not the same as reading about them. */}
   <div className="record-row static"><span className="service-icon"><Ban size={20}/></span><span><strong>{own?'Nothing is hidden from you on your own record':`${first}’s readings, results, medicines and notes`}</strong><small>{own?'It is yours.':'Their clinical information remains private unless appropriate access is verified, and they can withdraw it at any time.'}</small></span></div>
  </div>
  <SectionTitle title="What you can do"/>
  <div className="shortcut-list">
   <button className="shortcut-row" onClick={()=>navigate('Book a nurse')}><span className="service-icon"><Stethoscope size={20}/></span><span className="shortcut-text"><strong>Book a visit for {first}</strong><small>Opens the catalogue with {first} as the patient.</small></span><ChevronRight size={17}/></button>
   <button className="shortcut-row" onClick={()=>open('Thuso Family')}><span className="service-icon"><Users size={20}/></span><span className="shortcut-text"><strong>Open the household record</strong><small>The same household, seen through each person’s own permissions.</small></span><ChevronRight size={17}/></button>
   {!own&&<button className="shortcut-row" onClick={()=>open('Invite a guardian')}><span className="service-icon"><UserPlus size={20}/></span><span className="shortcut-text"><strong>Ask {first} for access</strong><small>They decide the scope and how long it lasts, on their own phone.</small></span><ChevronRight size={17}/></button>}
  </div>
  <div className="privacy-note"><LockKeyhole size={19}/>Booking for somebody opens their booking, never their record. Sponsoring their care does not change that.</div>
  <NotConnected of="messaging"/>
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
 [['My family','Manage your loved ones',Users,'My family'],['Care plans','Ongoing care and subscriptions',HeartHandshake,'Care plans'],['Thuso Wallet','Balance, activity and sponsored care',CreditCard,'Thuso Wallet']],
 [['Care area','Rosebank, Johannesburg',MapPin,'@Your location'],['Notifications','Visit updates and messages',Bell,'@Notifications'],['Privacy & settings','Your data and app preferences',Settings2,'Privacy & settings'],['Language','Read MyThuso your way',Globe,'@Language'],['Language & access','Twelve official languages, and what is honestly offered in each',Languages,'Language & access']],
 /* Emergency first in this group, and in the shell's sidebar as well. It was the fourteenth card
    inside a roadmap page — the most complete journey in the product behind the most clicks in it,
    on the one pathway where a person cannot afford to hunt. */
 [['Emergency & urgent care','The ambulance number first, then what MyThuso can do',Ambulance,'@Emergency & urgent care'],['Explore MyThuso','The full 21-module roadmap',LayoutGrid,'Explore MyThuso'],['Help & support','Chat, FAQs and emergency',CircleHelp,'@How can we help?'],['Preview workspaces','Nurse, doctor, partner and Control Tower',Stethoscope,'@Switch workspace']]
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
/* A clinical workspace is not a shop. The nurse, doctor, partner and Control Tower each get their
   own navigation from App.tsx; this renders the section that navigation asked for, and leads with
   what the role has to act on rather than with a catalogue of things to buy. */
/* A section's name is what a nurse would call it; the workflow behind it keeps the name the rest
   of the app already knows it by. */
export const sectionWorkflow: Record<string,string> = {
 Vetting:'Nurse onboarding & vetting','Vetting queue':'Nurse vetting',Assessments:'Visit assessment',
 Protocols:'Clinical protocols',Quality:'Quality & revenue',Results:'Laboratory order LAB-0023',
 Collections:'Collection schedule'
};
/* What each of those doors is for, in one sentence. "Open this workflow" told a reader nothing they
   could not see from the heading, which is the definition of a wasted line on a screen that has
   only three. */
export const sectionDoor: Record<string,string> = {
 Vetting:'The six checks a nurse clears before a visit can be sent to her, what each one expires on, and what stops the moment one lapses.',
 'Vetting queue':'Every applicant, the state of each check, and the decision that either clears somebody for dispatch or refuses it in writing.',
 Assessments:'A visit from the doorstep: identity, consent, observations, findings and a sign-off that a nurse may not give herself.',
 Protocols:'The reference a doctor reviews against, and the line at which decision support stops and a registered doctor starts.',
 Quality:'Complaints, incidents, arrival times and the revenue they move — the numbers a board asks for before it asks for anything else.'
};
export const roleExtras: Record<string,string[]> = {
 Nurse:['Locum shifts','Academy'],
 Doctor:['Clinical protocols','Referral pathway'],
 Partner:['Prescription RX-0081','Laboratory order LAB-0023'],
 'Control Tower':['Nurse onboarding & vetting','Employer programmes']
};
export const roleSections: Record<string,string[]> = {
 Nurse:['Schedule','Assessments','Thuso Kit','Earnings & payouts','Vetting'],
 Doctor:['Review queue','Teleconsultation','Patient context','Protocols'],
 Partner:['Orders','Collections','Results'],
 'Control Tower':['Dispatch','Incidents','Vetting queue','Quality']
};
/* A nurse's morning, a doctor's queue, a controller's board and a partner's orders — four screens
 * that each have exactly one thing a person opened them for.
 *
 * All four used to open the same way: a workspace eyebrow shouting DEMO, a paragraph under it
 * saying the same thing, three summary tiles, then the work. On a 390px phone the first visit
 * began below the fold, under three sentences telling her the same thing in three different words.
 * She does not open this to read about the product; she opens it at 07:00 to find out where she is
 * going first and whether she can leave.
 *
 * So the composition is inverted on all four. The single most urgent item is the screen's subject
 * and is drawn as one thing — not as the first row of a list that happens to be at the top. What
 * remains is a list under it, aligned down one column so the gaps read as gaps. The counts are one
 * line at the end, because a total is checked after the work, not planned around before it. */

/** One visit on a nurse's day. The end is arithmetic on the service's own duration, never typed. */
type Shift = { start: string; service: Service; person: string; suburb: string; note: string };
const nurseDay: Shift[] = [
 { start: '09:00', service: services[0], person: 'Lerato Molefe', suburb: 'Rosebank', note: 'Chronic follow-up · blood pressure was 141/88 last visit' },
 { start: '11:30', service: services[1], person: 'Thabo Molefe', suburb: 'Parktown', note: 'Dressing change · day 6' },
 { start: '14:00', service: services[2], person: 'Nomsa Molefe', suburb: 'Melville', note: 'Six-week check · first baby' }
];
/** What a doctor is waiting on, longest first — because that is the order the queue is worked. */
type Review = { ref: string; what: string; from: string; waited: string; minutes: number; flag: string };
const reviewQueue: Review[] = [
 { ref: 'TH-2048', what: 'Vitals assessment · Lerato Molefe', from: 'Sister Naledi Mokoena · 2 of 4 readings flagged', waited: '3 h 20 m', minutes: 200, flag: 'Out of range' },
 { ref: 'TH-2041', what: 'Prescription request · Thabo Molefe', from: 'Sister Palesa Khumalo · repeat, last issued 28 August', waited: '1 h 05 m', minutes: 65, flag: 'Out of range' },
 { ref: 'TH-2045', what: 'Wound follow-up · Nomsa Molefe', from: 'Sister Naledi Mokoena · day 6, photograph attached', waited: '22 m', minutes: 22, flag: '' }
];
export function NurseSchedule({ open }: { open: (s: string) => void }) {
 const [available, setAvailable] = useState(true);
 const [next, ...later] = nurseDay;
 const ends = endTime(next.start, next.service.duration);
 const earned = nurseDay.reduce((total, shift) => total + shift.service.nurseShare, 0);
 const dayEnds = endTime(nurseDay[nurseDay.length - 1].start, nurseDay[nurseDay.length - 1].service.duration);
 return <>
  {/* Duty state sits with the date rather than beside the section heading below it: whether she is
      taking visits at all is a fact about the whole day, and it is the one control on this screen
      that changes what the rest of it means. */}
  <div className="shift-head">
   <div><h1>{longDateOf(isoIn(new Date()))}</h1><p>{available ? `${nurseDay.length} visits · ${next.start} to ${dayEnds}` : 'You are off duty. Nothing new will be sent to you.'}</p></div>
   <button className="secondary duty-toggle" aria-pressed={available} onClick={() => setAvailable(!available)}><span className={`status-dot ${available ? '' : 'offline'}`}/>{available ? 'Available for visits' : 'Off duty'}</button>
  </div>
  <NotConnected of="dispatch"/>
  {available ? <>
   {/* The next visit, drawn once and drawn large. Time first because that is what decides whether
       she leaves now, then who and where, then the one thing she is walking in knowing. */}
   <article className="next-visit">
    <div className="next-when"><span>Next</span><strong>{next.start}</strong><span>to {ends}</span></div>
    <div className="next-body">
     <h2>{next.service.name}</h2>
     <p className="next-who">{next.person}</p>
     <p className="next-where"><MapPin size={15}/>{next.suburb} · home visit</p>
     <p className="next-note">{next.note}</p>
    </div>
    <div className="next-actions">
     <button className="primary" onClick={() => open('Visit assessment')}><ClipboardPlus size={17}/>Start this visit</button>
     <button className="secondary" onClick={() => open(`Nurse case: TH-2048 · ${next.service.name} · ${next.suburb}`)}>Patient file</button>
    </div>
   </article>
   <SectionTitle title="Later today"/>
   <ol className="day-list">{later.map(shift => <li key={shift.start}>
    <button className="day-row" onClick={() => open(`Nurse case: ${shift.start} · ${shift.service.name} · ${shift.suburb}`)}>
     <span className="day-time"><strong>{shift.start}</strong><small>{endTime(shift.start, shift.service.duration)}</small></span>
     <span className="day-what"><strong>{shift.service.name}</strong><small>{shift.person} · {shift.suburb}</small></span>
     <ChevronRight size={18}/>
    </button>
   </li>)}</ol>
   {/* One line, at the end, in the place a person checks rather than plans from. */}
   <p className="day-total"><span>Your share of today, at the catalogue's rates</span><strong>{money(earned)}</strong></p>
  </> : <EmptyState title="You are off duty" body="Nothing is sent to a nurse who is off duty, and going off duty never cancels a visit you have already accepted. Turn availability back on when you are ready." action="Go available" onAction={() => setAvailable(true)}/>}
 </>;
}
export function ReviewQueue({ open }: { open: (s: string) => void }) {
 const [flaggedOnly, setFlaggedOnly] = useState(false);
 const rows = flaggedOnly ? reviewQueue.filter(r => r.flag) : reviewQueue;
 const flagged = reviewQueue.filter(r => r.flag).length;
 const [longest] = reviewQueue;
 return <>
  <div className="shift-head">
   <div><h1>Review queue</h1><p>{reviewQueue.length} waiting · {flagged} outside a reference range · longest {longest.waited}</p></div>
   <div className="tabs queue-filter" role="group" aria-label="Filter the queue">
    <button className={flaggedOnly ? '' : 'selected'} aria-pressed={!flaggedOnly} onClick={() => setFlaggedOnly(false)}>Everything</button>
    <button className={flaggedOnly ? 'selected' : ''} aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(true)}>Flagged</button>
   </div>
  </div>
  <NotConnected of="screening"/>
  {/* Waiting time is the doctor's ordering, so it is the column that is set in tabular figures and
      aligned right — a queue you cannot read down is a queue you work in the order it was drawn. */}
  {rows.length ? <ol className="review-list">{rows.map(review => <li key={review.ref}>
   <button className="review-row" onClick={() => open(`Doctor review: ${review.ref}`)}>
    <span className="review-ref">{review.ref}</span>
    {/* What the case is and who sent it. This line used to repeat "a registered doctor signs this
        off" under every row — true, and said once at the top of the screen, where a sentence that
        is the same on every row belongs. */}
    <span className="review-what"><strong>{review.what}</strong><small>{review.from}</small></span>
    {review.flag ? <Pill tone="amber">{review.flag}</Pill> : <span className="review-routine">Routine</span>}
    <span className="review-waited">{review.waited}</span>
    <ChevronRight size={18}/>
   </button>
  </li>)}</ol>
   : <EmptyState title="Nothing is flagged" body="Every case in the queue is inside its reference range. Switch back to everything to work the queue in the order it arrived." action="Show everything" onAction={() => setFlaggedOnly(false)}/>}
 </>;
}
/* Workspace is gone. It drew all four clinical screens the same way and headed each of them
   "NURSE WORKSPACE · DEMO", and apps/web/src/shells/StaffShell.tsx composes its own sections now.
   Deleting it is also what keeps mapbox-gl out of the patient's bundle: it imported Dispatch and
   Orders, and LiveMap's side-effect CSS import meant Rollup kept the whole chain in every entry
   that could reach this file — which the patient's can. */
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
