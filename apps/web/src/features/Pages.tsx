import { useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Bell, Bluetooth, Check, ChevronRight, CircleHelp, ClipboardPlus, Clock3, CreditCard, Download, Droplets, Eye, FileCheck, FileText, Globe, Heart, HeartHandshake, History, Languages, LayoutGrid, LockKeyhole, LogOut, MapPin, PenLine, Plus, Search, Settings2, Share2, ShieldCheck, Sparkles, Stethoscope, Trash2, Users, UserPlus, Wallet, Zap } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle, ServiceIcon } from '../components/UI';
import { ClinicalChart } from '../components/Chart';
import { EmptyState, Skeleton, StateBlock, StatePicker, loadStates, stateLabels, type LoadState } from '../components/States';
import { InvitationList, type Invitation } from './Guardian';
import { DispatchBoard, IncidentBoard } from './Dispatch';
import { HeroCarousel } from '../components/HeroCarousel';
import { FulfilmentQueue } from './Orders';
import { CardArt, FamilyScene, PatientPortrait } from '../components/Portraits';
import { modules, services, money, type Service } from '../lib/catalog';
import type { DemoVisit } from './Booking';
import { isoIn, labels as schedulingLabels, shortDateOf, shortWhenText, visitEnds, weekdayOf } from '../lib/scheduling';
import { holdStatus } from '../lib/interpreting';
export function Services({book,open,query=''}:{book:(s:Service)=>void;open:(s:string)=>void;query?:string}) {
 const [category,setCategory]=useState('All services');
 const [search,setSearch]=useState(query);
 const filtered=services.filter(s=>(category==='All services'||s.category===category)&&`${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
 return <>
  <div className="page-intro"><div className="eyebrow">Care, on your terms</div><h1>Professional care at your door</h1><p>Choose a service and we’ll match you with the nearest qualified nurse.</p></div>
  <div className="catalog-tools"><label className="search-box"><Search size={18}/><input aria-label="Search services" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a service…"/></label><span className="helper">{filtered.filter(s=>s.phase===1).length} bookable now · {filtered.length} in the catalogue</span></div>
  <div className="tabs" aria-label="Service categories">{['All services','Everyday care','Family health','Recovery','Tests & screening'].map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
  <div className="catalog-grid">{filtered.map((s,i)=>{
   const live=s.phase===1;
   return <button className={`service-card tint-${i%4} ${live?'':'later'}`} key={s.id} onClick={()=>live?book(s):open(`${s.name} · Phase ${s.phase}`)}>
    <CardArt index={i}><ServiceIcon name={s.icon} size={30}/></CardArt>
    <span className="service-icon"><ServiceIcon name={s.icon} size={21}/></span>
    <h3>{s.name}</h3><p>{s.description}</p>
    <div>{live?<><strong>From {money(s.price)}</strong><span>{s.duration} min <ChevronRight size={16}/></span></>
     :<><strong className="later-price">{money(s.price)} planned</strong><span>Phase {s.phase} <ChevronRight size={16}/></span></>}</div>
   </button>;})}</div>
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
 const [state,setState]=useState<LoadState>('ready');
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
  <StatePicker label="Preview how this list behaves when the network or service is unavailable" value={state} onChange={setState}/>
  <StateBlock state={state} subject="Your visit list" permission="notifications" onRetry={()=>setState('ready')}>
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
  <section className="promo-dark">
   <h2>Care that fits your life.</h2>
   <p>Easy booking. Trusted professionals. Better health, at home.</p>
   <button onClick={book}>Book another visit<ArrowRight size={16}/></button>
   <div className="promo-art"><FamilyScene/></div>
  </section>
 </>}
export function PageHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}) {return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>;}
export function Passport({open}:{open:(s:string)=>void}) {
 const [tab,setTab]=useState('Overview');
 const [deviceState,setDeviceState]=useState<LoadState>('denied');
 return <>
  <div className="page-intro"><h1>Health Passport</h1></div>
  <section className="passport-hero">
   <Pill tone="light">Thuso Pass</Pill>
   <h2>Your health.<br/>Your story.</h2>
   <p><strong>Lerato Molefe</strong>ID: TH-2048-3920</p>
   <span className="passport-portrait"><PatientPortrait/></span>
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
    <button className="shortcut-row" onClick={()=>{const blob=new Blob([JSON.stringify({demo:true,patient:'Lerato Molefe',readings:[{bloodPressure:'118/78',heartRate:72,glucose:5.2}],notice:'Fictional data. Not a medical record.'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mythuso-demo-passport.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><span className="service-icon"><Download size={20}/></span><span className="shortcut-text"><strong>Export sample passport</strong><small>Downloads a fictional JSON file. It is not a medical record.</small></span><ChevronRight size={17}/></button>
    <button className="shortcut-row" onClick={()=>open('Your care team')}><span className="service-icon"><Users size={20}/></span><span className="shortcut-text"><strong>Doctors</strong><small>The clinicians who have reviewed what is on your record.</small></span><ChevronRight size={17}/></button>
   </div>
   <SectionTitle title="Your care timeline"/>
   <div className="panel">{['Wound care visit · 4 September','Doctor review completed · 4 September','Vitals recorded · 28 August'].map(t=><button className="record-row" key={t} onClick={()=>open(t)}><span className="service-icon"><FileText size={20}/></span><span><strong>{t}</strong><small>Sample record · Clinical details available in preview</small></span><ChevronRight size={18}/></button>)}</div>
  </>:tab==='Records'?<>
   <SectionTitle title="Your documents"/>
   <div className="panel document-list">{['Visit summary','Laboratory results','Medical certificate'].map(t=><button className="record-row" key={t} onClick={()=>open(t==='Laboratory results'?'Laboratory order LAB-0023':t)}><span className="service-icon"><FileText size={20}/></span><span><strong>{t}</strong><small>Fictional document · 4 September</small></span><Pill>Doctor reviewed</Pill><ChevronRight size={17}/></button>)}</div>
   <p className="helper"><ShieldCheck size={14}/>Every document says who issued it, when, and whether a registered doctor has reviewed it. A document with no review status is not a reviewed document.</p>
  </>
  /* An absence of prescriptions is an ordinary state, not a footnote, so it uses the same empty
     state as every other list rather than a tinted note of its own. */
  :tab==='Medications'?<>
   <SectionTitle title="Your prescriptions"/>
   <EmptyState title="No active prescriptions" body="Prescriptions appear here once a registered doctor has issued them. Nothing in this preview is a prescription." action="Preview a sample prescription" onAction={()=>open('Prescription RX-0081')}/>
   <button className="text-button space-top" onClick={()=>open('Thuso Pharmacy')}>Explore pharmacy fulfilment<ArrowRight size={16}/></button>
  </>
  :<><SectionTitle title="Connected devices"/><StatePicker label="Preview the device permission state" value={deviceState} onChange={setDeviceState}/><StateBlock state={deviceState} subject="Readings from your connected devices" permission="Apple Health or Health Connect access" onRetry={()=>setDeviceState('ready')}><div className="catalog-grid">{['Apple Health','Health Connect','Thuso Kit'].map(t=><div className="panel module-card" key={t}><span className="tile-icon"><Bluetooth size={20}/></span><h3>{t}</h3><p>Choose exactly which readings you share. Native integration planned.</p><button className="secondary full" onClick={()=>open(`${t} connection`)}>Preview connection<ArrowRight size={16}/></button></div>)}</div></StateBlock></>}
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
const relationOf=(i:number)=>i===0?'You':i===1?'Mother':i===2?'Child · 8 years':'Invitation preview';
export function Family({open,members,invitations,onRevoke}:{open:(s:string)=>void;members:string[];invitations:Invitation[];onRevoke:(id:string)=>void}) {return <><PageHeading eyebrow="THUSO FAMILY" title="Care for your whole circle." description="Be there for the people you love, wherever you are."/>
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
export function Plans({open}:{open:(s:string)=>void}) {return <><PageHeading eyebrow="THUSO ROUTINE" title="A healthier rhythm." description="Care that keeps showing up. For every chapter of life."/><div className="catalog-grid plan-grid">{plans.map(([n,p,d],i)=><div className={`panel plan-card ${i===0?'featured':''}`} key={n}><span className="service-icon"><Heart size={20}/></span><Pill tone="plain">{i<2?'PHASE 2 PREVIEW':'PHASE 3 PREVIEW'}</Pill><h2>{n}</h2><p>{d}</p><strong className="plan-price">{p==='Custom'?p:`R${p}`}<small>{p==='Custom'?' pricing':' / month'}</small></strong><button className="secondary" onClick={()=>open(n)}>Explore plan<ArrowRight size={17}/></button></div>)}</div><p className="helper"><ShieldCheck size={14}/>Proposal prices and benefits are indicative. No subscription can be purchased in this preview, and no plan is active on this account.</p></>}
/* Seven rights, seven identical shields. The icon was the same on every row, so it carried no
   information at all and the list had to be read word by word to be used. Each row now has the
   icon of the thing it does and a line saying what is behind it, in the settings-row pattern the
   More hub already uses — one row idiom on both screens rather than two that nearly match. */
const rights=[['Who can see my records','Verified professionals, and for how long',Eye,'Share my passport'],['Guardians and shared access','People you have invited, and exactly what they see',UserPlus,'Invite a guardian'],['My consents, and how to withdraw them','Every purpose you agreed to, and the wording you agreed to',FileCheck,'Your consents'],['View access history','Who opened your record — and who was refused',History,'Access history'],['Request a correction','Ask for inaccurate information about you to be fixed',PenLine,'Request a correction'],['Request account deletion','What can be deleted, and what a retention schedule keeps',Trash2,'Request account deletion'],['Information Officer','Your privacy contact under POPIA',ShieldCheck,'Contact privacy team']] as const;
export function Privacy({open}:{open:(s:string)=>void}) {const [choices,setChoices]=useState<Record<string,boolean>>({'Care reminders':true,'Wearable readings':false,'Product updates':false});return <><PageHeading eyebrow="YOUR PRIVACY MATTERS" title="Your data. Your choices." description="Clear choices about how your information is used."/><div className="two-column"><section className="panel"><SectionTitle title="Sharing preferences"/><p className="muted">Demo preferences reset when you reload. Clinical processing will have a separate purpose and lawful-basis explanation.</p>{Object.entries(choices).map(([k,v])=><div className="setting-row" key={k}><span><strong>{k}</strong><small>{k==='Care reminders'?'Visit and care-plan reminders':k==='Wearable readings'?'Optional health trends from your devices':'Optional news and offers'}</small></span><button role="switch" aria-checked={v} aria-label={k} className={`switch ${v?'on':''}`} onClick={()=>setChoices({...choices,[k]:!v})}><span/></button></div>)}</section><section className="panel"><SectionTitle title="You’re in control"/>{rights.map(([label,detail,Icon,target])=><button className="menu-row" key={label} onClick={()=>open(target)}><span className="tile-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={17}/></button>)}</section></div><div className="privacy-note"><LockKeyhole size={19}/>This UI demonstrates privacy controls. Production POPIA compliance also requires governance, contracts, lawful processing and verified technical safeguards.</div></>}
/* Money that does not exist, said out loud. The activity list goes through the same StateBlock as
   every other list that will one day be answered by a service somebody else operates — a payment
   provider being down is an ordinary Tuesday, and it is better designed now than improvised then. */
const walletActivity=[['Family care credit','+ R500','8 September'],['Vitals & chronic check','− R249','28 August']] as const;
export function WalletPage({open}:{open:(s:string)=>void}){
 const [state,setState]=useState<LoadState>('ready');
 return <><PageHeading eyebrow="THUSO WALLET" title="A little care, set aside." description="Support your own care or give someone a helping hand."/>
 <div className="wallet-hero"><Wallet size={26}/><span>Demo balance</span><h2>R500<span>.00</span></h2><div className="button-row"><button className="secondary" onClick={()=>open('Top up wallet')}><Plus size={17}/>Top up</button><button className="secondary" onClick={()=>open('Sponsor care')}><Users size={17}/>Sponsor care</button></div></div>
 <SectionTitle title="Recent activity"/>
 <StatePicker label="Preview how this list behaves when the payment service is unavailable" value={state} onChange={setState}/>
 <StateBlock state={state} subject="Your wallet activity" permission="your payment provider" onRetry={()=>setState('ready')}>
  {walletActivity.length?<div className="panel">{walletActivity.map(([n,p,d])=><div className="record-row static" key={n}><span className="service-icon"><Wallet size={20}/></span><span><strong>{n}</strong><small>{d} · Sample transaction</small></span><strong className="ledger">{p}</strong></div>)}</div>
   :<EmptyState title="Nothing has moved yet" body="Top-ups, sponsored visits and refunds appear here, each with the date and what it was for."/>}
 </StateBlock>
 <div className="privacy-note"><ShieldCheck size={19}/>No money is held, moved or owed here. Top-ups and sponsored care will run through a regulated payment provider, and no card details are collected in this preview.</div>
 </>}
export function Explore({open,onOnboarding,navigate}:{open:(s:string)=>void;onOnboarding:()=>void;navigate:(s:string)=>void}){return <>
 <div className="page-intro"><div className="eyebrow">The MyThuso family</div><h1>More ways to be cared for.</h1><p>Explore the complete vision. Availability follows the proposal’s phased roadmap.</p></div>
 {/* The highlights carousel lives here rather than on the home. Rotating promotion is what this
     page is for; on a returning patient's home it stood between them and the thing they came to do,
     and WCAG 2.2.2 is satisfied either way by the pause control it carries. */}
 <HeroCarousel navigate={navigate}/>
 <div className="catalog-grid module-grid">
  <button className="panel module-card highlight" onClick={onOnboarding}><Pill tone="plain">Design review</Pill><h3>First-run &amp; recovery<ArrowUpRight size={17}/></h3><p>Sign-up, one-time code, identity, recovery setup and the lost-access routes.</p><small>Full-screen flow</small></button>
  <button className="panel module-card highlight" onClick={()=>open('System states')}><Pill tone="plain">Design review</Pill><h3>System states<ArrowUpRight size={17}/></h3><p>Loading, error, offline, permission-denied and empty states for every integration.</p><small>State gallery</small></button>
  {modules.map(([n,d,p])=><button className="panel module-card" key={n} onClick={()=>open(n)}><Pill tone="plain">{p}</Pill><h3>{n}<ArrowUpRight size={17}/></h3><p>{d}</p><small>Design preview</small></button>)}
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
  <div className="trust-footer"><span>MyThuso · Design preview</span><span>Help. Health. Home.</span></div>
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
export function Workspace({role,page,open}:{role:string;page:string;open:(s:string)=>void}) {
 const nurse=role==='Nurse';const doctor=role==='Doctor';const partner=role==='Partner';
 const [available,setAvailable]=useState(true);
 const section=roleSections[role]?.includes(page)?page:roleSections[role]?.[0]??'Schedule';
 const rows=nurse?['09:00 · Vitals & chronic check · Rosebank','11:30 · Wound care · Parktown','14:00 · Mother & baby · Melville']:doctor?['TH-2048 · Vitals assessment · Awaiting review','TH-2045 · Wound follow-up · Routine review','TH-2041 · Prescription request · Awaiting review']:[];
 /* Urgency first: what is waiting, how long it has waited, and what to do about it. */
 const metrics=nurse?[['Next visit','09:00','Rosebank · in 40 minutes'],['Today’s visits','3','One awaiting sign-off'],['This week so far','R 598','Pays Wednesday']]
  :doctor?[['Awaiting review','12','Longest waiting 3 h 20 m'],['Priority reviews','2','Flagged out of range'],['Reviewed today','18','Median 4 m 10 s']]
  :partner?[['Open orders','8','2 past their collection window'],['Scheduled collections','4','Next 11:15'],['Ready for release','3','Awaiting a clinician']]
  :[['Active visits','24','3 running late'],['Available nurses','18','4 off duty'],['Open incidents','3','1 severity high']];
 return <><PageHeading eyebrow={`${role.toUpperCase()} WORKSPACE · DEMO`} title={section} description="Fictional workspace. Role switching is for design review, not authentication."/>
 <div className="metric-grid">{metrics.map(([k,v,note])=><div className="panel metric" key={k}><span>{k}</span><strong>{v}</strong><small>{note}</small></div>)}</div>
 {section==='Schedule'||section==='Review queue'?<>
  <div className="section-title"><h2>{nurse?'Your visit schedule':'Clinical review queue'}</h2>{nurse&&<button className="secondary" onClick={()=>setAvailable(!available)}><span className={`status-dot ${available?'':'offline'}`}/>{available?'Available for visits':'Off duty'}</button>}</div>
  <div className="panel">{rows.map(t=><button className="record-row" key={t} onClick={()=>open(doctor?`Doctor review: ${t.split(' · ')[0]}`:`${role} case: ${t}`)}><span className="service-icon">{doctor?<FileText size={22}/>:<Activity size={22}/>}</span><span><strong>{t}</strong><small>{doctor?'AI support only · Clinician sign-off required':'Demonstration record · No live actions'}</small></span><ChevronRight size={18}/></button>)}</div>
  {nurse&&<><SectionTitle title="Start a visit"/><div className="panel"><button className="record-row" onClick={()=>open('Visit assessment')}><span className="service-icon"><ClipboardPlus size={22}/></span><span><strong>Visit assessment · TH-2048</strong><small>Identity check, consent, observations, findings and sign-off</small></span><ArrowRight size={18}/></button></div></>}
 </>:section==='Dispatch'?<DispatchBoard/>
 :section==='Incidents'?<><SectionTitle title="Open incidents"/><IncidentBoard open={open}/></>
 :section==='Orders'||section==='Collections'||section==='Results'?<FulfilmentQueue open={open}/>
 :<div className="panel"><button className="record-row" onClick={()=>open(sectionWorkflow[section]??section)}><span className="service-icon"><ShieldCheck size={22}/></span><span><strong>{section}</strong><small>Open this workflow</small></span><ArrowRight size={18}/></button></div>}
 <SectionTitle title="More tools"/>
 <div className="catalog-grid">{(roleExtras[role]??[]).map(t=><button className="panel module-card" key={t} onClick={()=>open(t)}><ShieldCheck size={23}/><h3>{t}<ArrowUpRight size={17}/></h3><p>Explore the workflow preview</p></button>)}</div></>}
export function Notifications(){return <div className="notification-list">{[[Check,'Your visit is confirmed','Sister Naledi is scheduled for Saturday, 09:00.'],[FileText,'Your visit summary is ready','A sample record has been added to your Passport.'],[Sparkles,'A little reminder','Explore regular check-ins with Thuso Routine.'],[Bell,'Someone asked for access','Kagiso asked to help with your bookings. Review what he would see.']].map(([Icon,title,body])=>{const I=Icon as typeof Bell;return <div className="record-row" key={String(title)}><I size={21}/><span><strong>{String(title)}</strong><small>{String(body)}</small></span></div>;})}<p className="helper">Sample notifications only.</p></div>}
