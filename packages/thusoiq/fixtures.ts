import type { State } from './types.ts';
export function sandboxState(now = new Date().toISOString()): State {
 const after = (minutes: number) => new Date(Date.parse(now) + minutes * 60_000).toISOString();
 /* The three visits are "today" whatever the clock says (1 October 2026). They were now + 30, 90 and 180
    minutes, so after about 21:00 two of them fell into tomorrow and every screen that reads the sandbox
    by day — the nurse's appointments, the doctor's day plan, "Visits today" — told a different story in
    the evening from the morning. They now count from now or from 20:00 local, whichever is earlier, so the
    last one starts by 23:00 on the same day; before 20:00 nothing moves, after it the visits may already
    have begun, which a sandbox's day is allowed to say. Stock expiry stays relative to now. */
 const anchor = Math.min(Date.parse(now), new Date(Date.parse(now)).setHours(20, 0, 0, 0));
 const visit = (minutes: number) => new Date(anchor + minutes * 60_000).toISOString();
 return {
  revision: 0,
  patients: [
   { id:'demo-lerato',name:'Lerato Molefe',reason:'Chronic care follow-up',consent:true,allergies:'No known allergies reported in this fictional record',allergiesReviewed:true },
   { id:'demo-thabo',name:'Thabo Molefe',reason:'Wound review',consent:true,allergies:'Allergy reconciliation outstanding',allergiesReviewed:false },
   { id:'demo-nomsa',name:'Nomsa Molefe',reason:'Family care consultation',consent:false,allergies:'Not yet recorded',allergiesReviewed:false }
  ],
  appointments: [
   {id:'AP-DEMO-1',patientId:'demo-lerato',clinicianId:'D-401',startsAt:visit(30),minutes:30,mode:'video',status:'arrived'},
   {id:'AP-DEMO-2',patientId:'demo-thabo',clinicianId:'N-205',startsAt:visit(90),minutes:40,mode:'home',status:'scheduled'},
   {id:'AP-DEMO-3',patientId:'demo-nomsa',clinicianId:'D-401',startsAt:visit(180),minutes:30,mode:'home',status:'scheduled'}
  ],
  consultations:[{id:'CO-DEMO-1',patientId:'demo-lerato',appointmentId:'AP-DEMO-1',status:'draft',notes:{subjective:'Fictional follow-up encounter. Patient history requires review.',objective:'No examination has been completed in this sandbox.',assessment:'',plan:''}}],
  assessments:[],medicationRequests:[],
  stock:[{id:'BATCH-DEMO-1',item:'Fictional prescription item A',quantity:60,expiresAt:after(60*24*90)}],
  wearableConnections:['demo-lerato','demo-thabo','demo-nomsa'].map(patientId=>({patientId,enabled:false,consent:false})),
  samples:[],events:[]
 };
}
