import { useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Bell, Bluetooth, Check, ChevronRight, CircleHelp, ClipboardPlus, Clock3, CreditCard, Download, Droplets, Eye, FileCheck, FileText, Globe, Heart, HeartHandshake, History, Languages, LayoutGrid, LockKeyhole, LogOut, MapPin, PenLine, Plus, Search, Settings2, Share2, ShieldCheck, Sparkles, Stethoscope, Trash2, Users, UserPlus, Wallet, Zap } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle, ServiceIcon } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { ClinicalChart } from '../components/Chart';
import { EmptyState, Skeleton, StateBlock, loadStates, stateLabels, useOffline, type LoadState } from '../components/States';
import { InvitationList, type Invitation } from './Guardian';
import { DispatchBoard, IncidentBoard } from './Dispatch';
import { HeroCarousel } from '../components/HeroCarousel';
import { FulfilmentQueue } from './Orders';
import { FamilyScene, PatientPortrait } from '../components/Portraits';
import { modules, services, money, type Service } from '../lib/catalog';
import type { DemoVisit } from './Booking';
import { endTime, isoIn, labels as schedulingLabels, longDateOf, shortDateOf, shortWhenText, visitEnds, weekdayOf } from '../lib/scheduling';
import { holdStatus } from '../lib/interpreting';
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
   which it did, in three different places, before this. */
type VisitRow={visit:DemoVisit;status:string;tone:string};
const sample=(service:Service,person:string,address:string,dayOffset:number,start:string,status:string,tone:string):VisitRow=>({
 visit:{service,person,address,kind:'scheduled',payment:'Card',status:'Confirmed',
  date:isoIn(new Date(Date.now()+dayOffset*86_400_000)),start},
 status,tone});
export function Visits({visits,open,book}:{visits:DemoVisit[];open:(s:string)=>void;book:()=>void}) {
 const [tab,setTab]=useState('Upcoming');
 /* The only one of the five states anything on this screen can honestly be in today. Nothing
    fetches a visit list yet, so error and permission-denied would be a picker wearing a hat; the
    phone knows whether it has a signal without asking anybody. */
 const state:LoadState=useOffline()?'offline':'ready';
 /* What the person actually booked comes first, in the order they booked it. */
 /* A held visit is not a confirmed one and does not read like one here either: it carries the
    contract's own word and the amber tone the pending states use. */
 const upcoming:VisitRow[]=[...visits.map(v=>({visit:v,status:v.status,tone:v.status===holdStatus||v.kind==='asap'?'amber':''})),
  sample(services[0],'Lerato Molefe','Home visit · Sandton',5,'09:00','Confirmed',''),
  sample(services[1],'Lerato Molefe','Home visit · Sandton',17,'10:00','Pending','amber'),
  sample(services[2],'Thabo Molefe','Home visit · Rivonia',29,'14:00','Scheduled','sky')];
 const past:VisitRow[]=[sample(services[1],'Lerato Molefe','Home visit · Sandton',-3,'10:00','Completed','')];
 const cancelled:VisitRow[]=[sample(services[3],'Nomsa Molefe','Home visit · Soweto',-12,'08:00','Cancelled','amber')];
 const rows=tab==='Upcoming'?upcoming:tab==='Past'?past:cancelled;
 return <>
  <div className="page-intro"><h1>Your visits</h1></div>
  <div className="underline-tabs" role="group" aria-label="Visit status">{['Upcoming','Past','Cancelled'].map(t=><button key={t} className={tab===t?'selected':''} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
  <NotConnected of="booking"/>
  <StateBlock state={state} subject="Your visit list" permission="notifications">
   {rows.length?<div className="form-stack">{rows.map(({visit:v,status,tone},i)=><div className="panel" key={i}>
    <div className="visit-row">
     {v.date?<span className="date-block"><span>{weekdayOf(v.date)}</span><strong>{shortDateOf(v.date).split(' ')[0]}</strong><span>{shortDateOf(v.date).split(' ')[1]}</span></span>
      :<span className="date-block asap"><Zap size={17}/><span>Now</span></span>}
     <div className="visit-body">
      <div><h3>{v.service.name}</h3><Pill tone={tone}>{status}</Pill></div>
      <div className="visit-meta"><Clock3 size={14}/>{v.start?`${v.start} – ${visitEnds(v)}`:schedulingLabels.asapPending}</div>
      <div className="visit-meta"><MapPin size={14}/>{v.address} · {v.person}</div>
     </div>
    </div>
    {i===0&&tab==='Upcoming'&&<>
     <div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div></div>
     <div className="visit-actions"><button className="secondary" onClick={()=>open('Reschedule visit')}>Reschedule</button><button className="primary" onClick={()=>open(`Visit: ${v.service.name} · ${shortWhenText(v)} · ${v.person} · ${v.address}`)}>View details</button></div>
    </>}
   </div>)}</div>
   :<EmptyState title={`No ${tab.toLowerCase()} visits`} body={tab==='Cancelled'?'Visits you cancel appear here with the reason and any refund.':'When you book a visit it appears here, with the nurse’s name and what to have ready.'} action="Book a nurse" onAction={book}/>}
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
const plans=[['Chronic Routine','199','Monthly check-ins, doctor review and adherence support.'],['Family Planning Plan','99','Scheduled injection visits and discreet reminders.'],['Thuso Mom','249','Support through pregnancy and baby’s first year.'],['Thuso Senior','699','Weekly visits, medication support and family reports.'],['Thuso Recover','Custom','A personal care plan for your recovery at home.']] as const;
/* Five plans, and the reader is comparing two things across them: what it includes and what it
   costs a month. Both used to land wherever the description happened to end, so R199 on the first
   card sat twenty pixels below R249 on the third and the prices could not be read as a column. The
   card is a fixed set of rows now — phase, name, description, price, action — and each row starts
   on the same line across all five. The heart tile is gone with them: it was the same glyph five
   times, which told a reader nothing except that somebody had a spare icon. */
export function Plans({open}:{open:(s:string)=>void}) {return <><PageHeading eyebrow="THUSO ROUTINE" title="A healthier rhythm." description="Care that keeps showing up. For every chapter of life."/><div className="catalog-grid plan-grid">{plans.map(([n,p,d],i)=><div className={`panel plan-card ${i===0?'featured':''}`} key={n}><Pill tone="plain">{i<2?'PHASE 2':'PHASE 3'}</Pill><h2>{n}</h2><p>{d}</p><strong className="plan-price">{p==='Custom'?p:`R${p}`}<small>{p==='Custom'?' pricing':' / month'}</small></strong><button className="secondary" onClick={()=>open(n)}>Explore plan<ArrowRight size={17}/></button></div>)}</div><NotConnected of="payments"/></>}
/* Seven rights, seven identical shields. The icon was the same on every row, so it carried no
   information at all and the list had to be read word by word to be used. Each row now has the
   icon of the thing it does and a line saying what is behind it, in the settings-row pattern the
   More hub already uses — one row idiom on both screens rather than two that nearly match. */
const rights=[['Who can see my records','Verified professionals, and for how long',Eye,'Share my passport'],['Guardians and shared access','People you have invited, and exactly what they see',UserPlus,'Invite a guardian'],['My consents, and how to withdraw them','Every purpose you agreed to, and the wording you agreed to',FileCheck,'Your consents'],['View access history','Who opened your record — and who was refused',History,'Access history'],['Request a correction','Ask for inaccurate information about you to be fixed',PenLine,'Request a correction'],['Request account deletion','What can be deleted, and what a retention schedule keeps',Trash2,'Request account deletion'],['Information Officer','Your privacy contact under POPIA',ShieldCheck,'Contact privacy team']] as const;
export function Privacy({open}:{open:(s:string)=>void}) {const [choices,setChoices]=useState<Record<string,boolean>>({'Care reminders':true,'Wearable readings':false,'Product updates':false});return <><PageHeading eyebrow="YOUR PRIVACY MATTERS" title="Your data. Your choices." description="Clear choices about how your information is used."/><div className="two-column"><section className="panel"><SectionTitle title="Sharing preferences"/><p className="muted">Clinical processing is a separate purpose with its own lawful basis, and it is not switched by anything on this card.</p>{Object.entries(choices).map(([k,v])=><div className="setting-row" key={k}><span><strong>{k}</strong><small>{k==='Care reminders'?'Visit and care-plan reminders':k==='Wearable readings'?'Optional health trends from your devices':'Optional news and offers'}</small></span><button role="switch" aria-checked={v} aria-label={k} className={`switch ${v?'on':''}`} onClick={()=>setChoices({...choices,[k]:!v})}><span/></button></div>)}</section><section className="panel"><SectionTitle title="You’re in control"/>{rights.map(([label,detail,Icon,target])=><button className="menu-row" key={label} onClick={()=>open(target)}><span className="tile-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={17}/></button>)}</section></div><div className="privacy-note"><LockKeyhole size={19}/>Controls on a screen are not compliance. POPIA also asks for governance, contracts, a lawful basis for each purpose and technical safeguards somebody has verified.</div></>}
/* Money that does not exist, said out loud. The activity list goes through the same StateBlock as
   every other list that will one day be answered by a service somebody else operates — a payment
   provider being down is an ordinary Tuesday, and it is better designed now than improvised then. */
const walletActivity=[['Family care credit','+ R500','8 September'],['Vitals & chronic check','− R249','28 August']] as const;
export function WalletPage({open}:{open:(s:string)=>void}){
 const state:LoadState=useOffline()?'offline':'ready';
 return <><PageHeading eyebrow="THUSO WALLET" title="A little care, set aside." description="Support your own care or give someone a helping hand."/>
 <div className="wallet-hero"><Wallet size={26}/><span>Balance</span><h2>R500<span>.00</span></h2><div className="button-row"><button className="secondary" onClick={()=>open('Top up wallet')}><Plus size={17}/>Top up</button><button className="secondary" onClick={()=>open('Sponsor care')}><Users size={17}/>Sponsor care</button></div></div>
 <SectionTitle title="Recent activity"/>
 <StateBlock state={state} subject="Your wallet activity" permission="your payment provider">
  {walletActivity.length?<div className="panel">{walletActivity.map(([n,p,d])=><div className="record-row static" key={n}><span className="service-icon"><Wallet size={20}/></span><span><strong>{n}</strong><small>{d}</small></span><strong className="ledger">{p}</strong></div>)}</div>
   :<EmptyState title="Nothing has moved yet" body="Top-ups, sponsored visits and refunds appear here, each with the date and what it was for."/>}
 </StateBlock>
 <NotConnected of="payments"/>
 </>}
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
 [['Explore MyThuso','The full 21-module roadmap',LayoutGrid,'Explore MyThuso'],['Help & support','Chat, FAQs and emergency',CircleHelp,'@How can we help?'],['Preview workspaces','Nurse, doctor, partner and Control Tower',Stethoscope,'@Switch workspace']]
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
export function SystemStates(){
 const [state,setState]=useState<LoadState>('loading');
 return <div className="form-stack">
  <Pill>State gallery</Pill>
  <p className="muted">Every screen that will talk to a clinical, payment, partner or device integration needs these designed up front. Pick a state to see the shared components that carry it.</p>
  <div className="tabs" role="group" aria-label="Choose a state">{loadStates.map(s=><button key={s} className={state===s?'selected':''} aria-pressed={state===s} onClick={()=>setState(s)}>{stateLabels[s]}</button>)}</div>
  <div className="panel">
   {state==='ready'?<div className="record-row static"><span className="service-icon"><Check size={20}/></span><span><strong>Loaded</strong><small>The real content, with nothing standing in for it.</small></span></div>
   :<StateBlock state={state} subject="Your laboratory results" permission="Health Connect access" onRetry={()=>setState('ready')}><span/></StateBlock>}
  </div>
  <h3>Skeleton while care information loads</h3>
  <div className="panel"><Skeleton rows={3}/></div>
  <h3>Nothing here yet</h3>
  <EmptyState title="No visits yet" body="When you book your first visit it appears here, with the nurse’s name and what to have ready." action="Book a nurse"/>
  <div className="privacy-note"><ShieldCheck size={19}/>An error state never blames the patient, never loses what they typed, and always says what happens next.</div>
 </div>;
}
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
function NurseSchedule({ open }: { open: (s: string) => void }) {
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
function ReviewQueue({ open }: { open: (s: string) => void }) {
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
export function Workspace({role,page,open}:{role:string;page:string;open:(s:string)=>void}) {
 const section=roleSections[role]?.includes(page)?page:roleSections[role]?.[0]??'Schedule';
 return <>
 {section==='Schedule'?<NurseSchedule open={open}/>
 :section==='Review queue'?<ReviewQueue open={open}/>
 :section==='Dispatch'?<DispatchBoard/>
 :section==='Incidents'?<><SectionTitle title="Open incidents"/><IncidentBoard open={open}/></>
 :section==='Orders'||section==='Collections'||section==='Results'?<FulfilmentQueue open={open}/>
 :<div className="panel workflow-door">
  <span className="tile-icon"><ShieldCheck size={22}/></span>
  <h2>{section}</h2>
  <p>{sectionDoor[section]??'This workflow is drawn but not yet a screen of its own.'}</p>
  {/* The section keeps its own capitalisation: these are the names of screens, and "open vetting"
      reads as an instruction to vet somebody rather than as the name of the thing behind the door. */}
  <button className="primary" onClick={() => open(sectionWorkflow[section]??section)}>Open {section}<ArrowRight size={17}/></button>
 </div>}
 {/* Secondary by construction. These were two cards with the same shield on them, the same white
     surface and the same shadow as the queue above — so a screen whose entire purpose is the queue
     ended on two equally-weighted boxes. A list of links is what they are. */}
 <SectionTitle title="More tools"/>
 <div className="tool-links">{(roleExtras[role]??[]).map(t=><button className="tool-link" key={t} onClick={()=>open(t)}>{t}<ArrowUpRight size={16}/></button>)}</div></>}
export function Notifications(){return <div className="notification-list">{[[Check,'Your visit is confirmed','Sister Naledi is scheduled for Saturday, 09:00.'],[FileText,'Your visit summary is ready','Sister Naledi\u2019s notes and the doctor\u2019s review are on your Passport.'],[Sparkles,'A little reminder','Explore regular check-ins with Thuso Routine.'],[Bell,'Someone asked for access','Kagiso asked to help with your bookings. Review what he would see.']].map(([Icon,title,body])=>{const I=Icon as typeof Bell;return <div className="record-row" key={String(title)}><I size={21}/><span><strong>{String(title)}</strong><small>{String(body)}</small></span></div>;})}<NotConnected of="messaging"/></div>}
