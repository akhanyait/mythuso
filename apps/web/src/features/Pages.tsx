import { useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Bell, Bluetooth, Check, ChevronRight, CircleHelp, ClipboardPlus, Clock3, CreditCard, Download, Droplets, FileText, Globe, Heart, HeartHandshake, LayoutGrid, LockKeyhole, LogOut, MapPin, Plus, Search, Settings2, Share2, ShieldCheck, Sparkles, Stethoscope, Users, UserPlus, Wallet } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle, ServiceIcon } from '../components/UI';
import { ClinicalChart } from '../components/Chart';
import { EmptyState, Skeleton, StateBlock, StatePicker, loadStates, stateLabels, type LoadState } from '../components/States';
import { InvitationList, type Invitation } from './Guardian';
import { DispatchBoard, IncidentBoard } from './Dispatch';
import { FulfilmentQueue } from './Orders';
import { CardArt, FamilyScene, PatientPortrait } from '../components/Portraits';
import { modules, services, money, type Service } from '../lib/catalog';
import type { DemoVisit } from './Booking';
export function Services({book,query=''}:{book:(s:Service)=>void;query?:string}) {
 const [category,setCategory]=useState('All services');
 const [search,setSearch]=useState(query);
 const filtered=services.filter(s=>(category==='All services'||s.category===category)&&`${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
 return <>
  <div className="page-intro"><div className="eyebrow">Care, on your terms</div><h1>Professional care at your door</h1><p>Choose a service and we’ll match you with the nearest qualified nurse.</p></div>
  <div className="catalog-tools"><label className="search-box"><Search size={18}/><input aria-label="Search services" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a service…"/></label><span className="helper">{filtered.length} services · Proposal prices</span></div>
  <div className="tabs" aria-label="Service categories">{['All services','Everyday care','Family health','Recovery','Tests & screening'].map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
  <div className="catalog-grid">{filtered.map((s,i)=><button className={`service-card tint-${i%4}`} key={s.id} onClick={()=>book(s)}>
   <CardArt index={i}><ServiceIcon name={s.icon} size={30}/></CardArt>
   <span className="service-icon"><ServiceIcon name={s.icon} size={21}/></span>
   <h3>{s.name}</h3><p>{s.description}</p>
   <div><strong>From {money(s.price)}</strong><span>{s.duration} min <ChevronRight size={16}/></span></div>
  </button>)}</div>
  {!filtered.length&&<EmptyNote>No services match your search. Try another name or category.</EmptyNote>}
  <button className="menu-row panel space-top" onClick={()=>book(services[0])}><span className="tile-icon"><CircleHelp size={19}/></span><span><strong>Not sure what you need?</strong><small>Chat to our care team</small></span><ChevronRight size={17}/></button>
  <div className="privacy-note space-top"><ShieldCheck size={19}/>All clinical decisions require a registered clinician. Prescription services require a valid prescription.</div>
 </>}
type VisitRow={service:Service;person:string;time:string;address:string;status:string;tone:string;date:[string,string,string]};
export function Visits({visits,open,book}:{visits:DemoVisit[];open:(s:string)=>void;book:()=>void}) {
 const [tab,setTab]=useState('Upcoming');
 const [state,setState]=useState<LoadState>('ready');
 const upcoming:VisitRow[]=[...visits.map(v=>({...v,status:'Confirmed',tone:'',date:['THU','10','SEP'] as [string,string,string]})),
  {service:services[0],person:'Lerato Molefe',time:'09:00 – 10:00',address:'Home visit · Sandton',status:'Confirmed',tone:'',date:['FRI','12','SEP']},
  {service:services[1],person:'Lerato Molefe',time:'10:00 – 11:00',address:'Home visit · Sandton',status:'Pending',tone:'amber',date:['WED','24','SEP']},
  {service:services[2],person:'Thabo Molefe',time:'14:00 – 15:00',address:'Home visit · Rivonia',status:'Scheduled',tone:'sky',date:['MON','6','OCT']}];
 const past:VisitRow[]=[{service:services[1],person:'Lerato Molefe',time:'10:00 – 10:40',address:'Home visit · Sandton',status:'Completed',tone:'',date:['THU','4','SEP']}];
 const cancelled:VisitRow[]=[{service:services[3],person:'Nomsa Molefe',time:'08:00 – 08:30',address:'Home visit · Soweto',status:'Cancelled',tone:'amber',date:['TUE','26','AUG']}];
 const rows=tab==='Upcoming'?upcoming:tab==='Past'?past:cancelled;
 return <>
  <div className="page-intro"><h1>Your visits</h1></div>
  <div className="underline-tabs" role="group" aria-label="Visit status">{['Upcoming','Past','Cancelled'].map(t=><button key={t} className={tab===t?'selected':''} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
  <StatePicker label="Preview how this list behaves when the network or service is unavailable" value={state} onChange={setState}/>
  <StateBlock state={state} subject="Your visit list" permission="notifications" onRetry={()=>setState('ready')}>
   {rows.length?<div className="form-stack">{rows.map((v,i)=><div className="panel" key={i}>
    <div className="visit-row">
     <span className="date-block"><span>{v.date[0]}</span><strong>{v.date[1]}</strong><span>{v.date[2]}</span></span>
     <div className="visit-body">
      <div><h3>{v.service.name}</h3><Pill tone={v.tone}>{v.status}</Pill></div>
      <div className="visit-meta"><Clock3 size={14}/>{v.time}</div>
      <div className="visit-meta"><MapPin size={14}/>{v.address} · {v.person}</div>
     </div>
    </div>
    {i===0&&tab==='Upcoming'&&<>
     <div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div></div>
     <div className="visit-actions"><button className="secondary" onClick={()=>open('Reschedule visit')}>Reschedule</button><button className="primary" onClick={()=>open(`Visit: ${v.service.name} · ${v.time} · ${v.person} · ${v.address}`)}>View details</button></div>
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
   <div className="action-row">
    <button onClick={()=>open('Share my passport')}><Share2 size={20}/>Share record</button>
    <button onClick={()=>{const blob=new Blob([JSON.stringify({demo:true,patient:'Lerato Molefe',readings:[{bloodPressure:'118/78',heartRate:72,glucose:5.2}],notice:'Fictional data. Not a medical record.'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mythuso-demo-passport.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}><Download size={20}/>Export sample passport</button>
    <button onClick={()=>open('Your care team')}><Users size={20}/>Doctors</button>
   </div>
   <SectionTitle title="Your care timeline"/>
   <div className="panel">{['Wound care visit · 4 September','Doctor review completed · 4 September','Vitals recorded · 28 August'].map(t=><button className="record-row" key={t} onClick={()=>open(t)}><span className="service-icon"><FileText size={20}/></span><span><strong>{t}</strong><small>Sample record · Clinical details available in preview</small></span><ChevronRight size={18}/></button>)}</div>
  </>:tab==='Records'?<div className="panel">{['Visit summary','Laboratory results','Medical certificate'].map(t=><button className="record-row" key={t} onClick={()=>open(t==='Laboratory results'?'Laboratory order LAB-0023':t)}><span className="service-icon"><FileText size={20}/></span><span><strong>{t}</strong><small>Fictional document · 4 September</small></span><Pill>Doctor reviewed</Pill><ChevronRight size={17}/></button>)}</div>
  :tab==='Medications'?<div className="panel"><SectionTitle title="Your prescriptions"/><EmptyNote>No active prescriptions in this demo. Prescriptions will appear after a registered doctor issues them.</EmptyNote><button className="secondary full space-top" onClick={()=>open('Prescription RX-0081')}>Preview a sample prescription<ArrowRight size={16}/></button><button className="text-button space-top" onClick={()=>open('Thuso Pharmacy')}>Explore pharmacy fulfilment<ArrowRight size={16}/></button></div>
  :<><StatePicker label="Preview the device permission state" value={deviceState} onChange={setDeviceState}/><StateBlock state={deviceState} subject="Readings from your connected devices" permission="Apple Health or Health Connect access" onRetry={()=>setDeviceState('ready')}><div className="catalog-grid">{['Apple Health','Health Connect','Thuso Kit'].map(t=><div className="panel module-card" key={t}><span className="tile-icon"><Bluetooth size={21}/></span><h3>{t}</h3><p>Choose exactly which readings you share. Native integration planned.</p><button className="secondary full" onClick={()=>open(`${t} connection`)}>Preview connection<ArrowRight size={16}/></button></div>)}</div></StateBlock></>}
 </>}
export function Family({open,members,invitations,onRevoke}:{open:(s:string)=>void;members:string[];invitations:Invitation[];onRevoke:(id:string)=>void}) {return <><PageHeading eyebrow="THUSO FAMILY" title="Care for your whole circle." description="Be there for the people you love, wherever you are."/>
 <div className="catalog-grid">{['Lerato Molefe','Nomsa Molefe','Thabo Molefe',...members].map((n,i)=><div className="panel family-profile" key={`${n}-${i}`}><span className={`avatar ${i%2?'peach':'blue'}`}>{n.split(' ').map(s=>s[0]).slice(0,2).join('')}</span><h3>{n}</h3><Pill>{i===0?'You':i===1?'Mother':i===2?'Child · 8 years':'Invitation preview'}</Pill><p className="muted">{i===0?'Your personal care profile.':'Record access requires verified authority and consent.'}</p><button className="secondary" onClick={()=>open(`Family profile: ${n}`)}>View care profile<ChevronRight size={16}/></button></div>)}
 <button className="panel add-profile" onClick={()=>open('Add a family member')}><Plus size={28}/><strong>Grow your circle of care</strong><span>Add a family member</span></button></div>
 <div className="section-title space-top"><h2>Guardians and shared access</h2><button className="secondary" onClick={()=>open('Invite a guardian')}><UserPlus size={16}/>Invite someone</button></div>
 {invitations.length?<InvitationList invitations={invitations} onRevoke={onRevoke}/>:<EmptyState title="Nobody else has access" body="When you invite a guardian or a family member, their access appears here with exactly what they can see and when it ends." action="Invite someone" onAction={()=>open('Invite a guardian')}/>}
 <div className="privacy-note"><LockKeyhole size={19}/>Paying for a family member’s care does not automatically grant access to their health records.</div></>}
export function Plans({open}:{open:(s:string)=>void}) {return <><PageHeading eyebrow="THUSO ROUTINE" title="A healthier rhythm." description="Care that keeps showing up. For every chapter of life."/><div className="catalog-grid">{[['Chronic Routine','199','Monthly check-ins, doctor review and adherence support.'],['Family Planning Plan','99','Scheduled injection visits and discreet reminders.'],['Thuso Mom','249','Support through pregnancy and baby’s first year.'],['Thuso Senior','699','Weekly visits, medication support and family reports.'],['Thuso Recover','Custom','A personal care plan for your recovery at home.']].map(([n,p,d],i)=><div className={`panel plan-card ${i===0?'featured':''}`} key={n}><span className="service-icon"><Heart size={24}/></span><Pill tone="plain">{i<2?'PHASE 2 PREVIEW':'PHASE 3 PREVIEW'}</Pill><h2>{n}</h2><p>{d}</p><strong className="plan-price">{p==='Custom'?p:`R${p}`}<small>{p==='Custom'?' pricing':' / month'}</small></strong><button className={i===0?'primary':'secondary'} onClick={()=>open(n)}>Explore plan<ArrowRight size={17}/></button></div>)}</div><p className="helper">Proposal prices and benefits are indicative. No subscriptions can be purchased in this preview.</p></>}
export function Privacy({open}:{open:(s:string)=>void}) {const [choices,setChoices]=useState<Record<string,boolean>>({'Care reminders':true,'Wearable readings':false,'Product updates':false});return <><PageHeading eyebrow="YOUR PRIVACY MATTERS" title="Your data. Your choices." description="Clear choices about how your information is used."/><div className="two-column"><section className="panel"><SectionTitle title="Sharing preferences"/><p className="muted">Demo preferences reset when you reload. Clinical processing will have a separate purpose and lawful-basis explanation.</p>{Object.entries(choices).map(([k,v])=><div className="setting-row" key={k}><span><strong>{k}</strong><small>{k==='Care reminders'?'Visit and care-plan reminders':k==='Wearable readings'?'Optional health trends from your devices':'Optional news and offers'}</small></span><button role="switch" aria-checked={v} aria-label={k} className={`switch ${v?'on':''}`} onClick={()=>setChoices({...choices,[k]:!v})}><span/></button></div>)}</section><section className="panel"><SectionTitle title="You’re in control"/>{[['Who can see my records','Share my passport'],['Guardians and shared access','Invite a guardian'],['View access history','Access history'],['Request a correction','Request a correction'],['Request account deletion','Request account deletion'],['Information Officer','Contact privacy team']].map(([label,target])=><button className="record-row" key={label} onClick={()=>open(target)}><ShieldCheck size={19}/><span>{label}</span><ChevronRight size={16}/></button>)}</section></div><div className="privacy-note"><LockKeyhole size={19}/>This UI demonstrates privacy controls. Production POPIA compliance also requires governance, contracts, lawful processing and verified technical safeguards.</div></>}
export function WalletPage({open}:{open:(s:string)=>void}){return <><PageHeading eyebrow="THUSO WALLET" title="A little care, set aside." description="Support your own care or give someone a helping hand."/><div className="wallet-hero"><Wallet size={30}/><span>Demo balance</span><h2>R500<span>.00</span></h2><div className="button-row"><button className="secondary" onClick={()=>open('Top up wallet')}><Plus size={17}/>Top up</button><button className="secondary" onClick={()=>open('Sponsor care')}><Users size={17}/>Sponsor care</button></div></div><SectionTitle title="Recent activity"/><div className="panel">{[['Family care credit','+ R500','8 September'],['Vitals & chronic check','− R249','28 August']].map(([n,p,d])=><div className="record-row" key={n}><Wallet size={20}/><span><strong>{n}</strong><small>{d} · Sample transaction</small></span><strong>{p}</strong></div>)}</div></>}
export function Explore({open,onOnboarding}:{open:(s:string)=>void;onOnboarding:()=>void}){return <>
 <div className="page-intro"><div className="eyebrow">The MyThuso family</div><h1>More ways to be cared for.</h1><p>Explore the complete vision. Availability follows the proposal’s phased roadmap.</p></div>
 <div className="catalog-grid module-grid">
  <button className="panel module-card highlight" onClick={onOnboarding}><Pill tone="plain">Design review</Pill><h3>First-run &amp; recovery<ArrowUpRight size={17}/></h3><p>Sign-up, one-time code, identity, recovery setup and the lost-access routes.</p><small>Full-screen flow</small></button>
  <button className="panel module-card highlight" onClick={()=>open('System states')}><Pill tone="plain">Design review</Pill><h3>System states<ArrowUpRight size={17}/></h3><p>Loading, error, offline, permission-denied and empty states for every integration.</p><small>State gallery</small></button>
  {modules.map(([n,d,p])=><button className="panel module-card" key={n} onClick={()=>open(n)}><Pill tone="plain">{p}</Pill><h3>{n}<ArrowUpRight size={17}/></h3><p>{d}</p><small>Design preview</small></button>)}
 </div></>}
const menuGroups=[
 [['My family','Manage your loved ones',Users,'My family'],['Care plans','Ongoing care and subscriptions',HeartHandshake,'Care plans'],['Payments','Cards, history and refunds',CreditCard,'Thuso Wallet']],
 [['Care area','Rosebank, Johannesburg',MapPin,'@Your location'],['Notifications','Visit updates and messages',Bell,'@Notifications'],['Privacy & settings','Your data and app preferences',Settings2,'Privacy & settings'],['Language','Read MyThuso your way',Globe,'@Language']],
 [['Explore MyThuso','The full 21-module roadmap',LayoutGrid,'Explore MyThuso'],['Help & support','Chat, FAQs and emergency',CircleHelp,'@How can we help?'],['Preview workspaces','Nurse, doctor, partner and Control Tower',Stethoscope,'@Switch workspace']]
] as const;
export function MoreHub({navigate,open,onOnboarding}:{navigate:(s:string)=>void;open:(s:string)=>void;onOnboarding:()=>void}){
 return <>
  <div className="page-intro"><h1>More</h1></div>
  <button className="profile-row" onClick={()=>open('Your profile')}><span className="avatar"><PatientPortrait/></span><span><strong>Lerato Molefe</strong><small>View and edit your profile</small></span><ChevronRight size={18}/></button>
  {menuGroups.map((group,i)=><div className="menu-list" key={i}>{group.map(([title,sub,Icon,target])=>
   <button className="menu-row" key={title} onClick={()=>target.startsWith('@')?open(target.slice(1)):navigate(target)}>
    <span className="tile-icon"><Icon size={19}/></span><span><strong>{title}</strong><small>{sub}</small></span><ChevronRight size={17}/>
   </button>)}</div>)}
  <div className="menu-list danger"><button className="menu-row" onClick={onOnboarding}><span className="tile-icon"><LogOut size={19}/></span><span><strong>Log out</strong><small>Returns to the first-run flow — this preview has no account</small></span></button></div>
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
export function Workspace({role,open}:{role:string;open:(s:string)=>void}) {
 const nurse=role==='Nurse';const doctor=role==='Doctor';const partner=role==='Partner';const tower=role==='Control Tower';
 const [available,setAvailable]=useState(true);
 const rows=nurse?['09:00 · Vitals & chronic check · Rosebank','11:30 · Wound care · Parktown','14:00 · Mother & baby · Melville']:doctor?['TH-2048 · Vitals assessment · Awaiting review','TH-2045 · Wound follow-up · Routine review','TH-2041 · Prescription request · Awaiting review']:[];
 return <><PageHeading eyebrow={`${role.toUpperCase()} WORKSPACE · DEMO`} title={nurse?'Good care starts with you.':doctor?'Expertise, where it matters.':partner?'Connected care, delivered.':'A clear view of care.'} description="Fictional workspace. Role switching is for design review, not authentication."/>
 <div className="metric-grid">{(nurse?[['Today’s visits','3'],['Demo earnings','R637'],['Kit readiness','8 / 8']]:doctor?[['Awaiting review','12'],['Priority reviews','2'],['Reviewed today','18']]:partner?[['Open orders','8'],['Scheduled collections','4'],['Ready for review','3']]:[['Active visits','24'],['Available nurses','18'],['Open incidents','3']]).map(([k,v])=><div className="panel metric" key={k}><span>{k}</span><strong>{v}</strong><small>Sample operational data</small></div>)}</div>
 <div className="section-title"><h2>{nurse?'Your visit schedule':doctor?'Clinical review queue':partner?'Fulfilment queue':'Dispatch overview'}</h2>{nurse&&<button className="secondary" onClick={()=>setAvailable(!available)}><span className={`status-dot ${available?'':'offline'}`}/>{available?'Available for visits':'Off duty'}</button>}</div>
 {tower?<DispatchBoard/>:partner?<FulfilmentQueue open={open}/>:<div className="panel">{rows.map(t=><button className="record-row" key={t} onClick={()=>open(doctor?`Doctor review: ${t.split(' · ')[0]}`:`${role} case: ${t}`)}><span className="service-icon">{doctor?<FileText size={22}/>:<Activity size={22}/>}</span><span><strong>{t}</strong><small>{doctor?'AI support only · Clinician sign-off required':'Demonstration record · No live actions'}</small></span><ChevronRight size={18}/></button>)}</div>}
 {nurse&&<><SectionTitle title="Start a visit"/><div className="panel"><button className="record-row" onClick={()=>open('Visit assessment')}><span className="service-icon"><ClipboardPlus size={22}/></span><span><strong>Visit assessment · TH-2048</strong><small>Identity check, consent, observations, findings and sign-off</small></span><ArrowRight size={18}/></button></div></>}
 {tower&&<><SectionTitle title="Open incidents"/><IncidentBoard open={open}/></>}
 <SectionTitle title="Your tools"/>
 <div className="catalog-grid">{(nurse?['Visit assessment','Nurse onboarding & vetting','Diagnostic kit','Weekly payouts','Locum shifts','Academy']:doctor?['Clinical protocols','Teleconsultation','Referral pathway']:partner?['Prescription RX-0081','Laboratory order LAB-0023','Collection schedule']:['Nurse onboarding & vetting','Incident INC-015','Quality & revenue','Employer programmes']).map(t=><button className="panel module-card" key={t} onClick={()=>open(t)}><ShieldCheck size={23}/><h3>{t}<ArrowUpRight size={17}/></h3><p>Explore the workflow preview</p></button>)}</div></>}
export function Notifications(){return <div className="notification-list">{[[Check,'Your visit is confirmed','Sister Naledi is scheduled for Saturday, 09:00.'],[FileText,'Your visit summary is ready','A sample record has been added to your Passport.'],[Sparkles,'A little reminder','Explore regular check-ins with Thuso Routine.'],[Bell,'Someone asked for access','Kagiso asked to help with your bookings. Review what he would see.']].map(([Icon,title,body])=>{const I=Icon as typeof Bell;return <div className="record-row" key={String(title)}><I size={21}/><span><strong>{String(title)}</strong><small>{String(body)}</small></span></div>;})}<p className="helper">Sample notifications only.</p></div>}
