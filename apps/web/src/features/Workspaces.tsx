import { useState } from 'react';
import { BadgeCheck, ChevronRight, ClipboardList, ClipboardPlus, MapPin } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { EmptyState } from '../components/States';
import { services, money, type Service } from '../lib/catalog';
import { endTime, isoIn, longDateOf } from '../lib/scheduling';
import { signOffFor, type Part } from '../lib/visit-queue';
import { useVisitQueue } from './VisitQueue';
import { formatEventTime } from '../lib/vetting';

/* The four clinical workspaces' own home screens, and the four navigations that reach them.
 *
 * These lived in features/Pages.tsx, beside the patient's catalogue, visit list, passport, wallet
 * and family circle. One file, two audiences — and because App.tsx and StaffShell.tsx both imported
 * it, every patient on a metered connection downloaded a nurse's day list and a doctor's review
 * queue in order to look at their own visits. Splitting the file is the fix: a module belongs to
 * the audience that renders it, and a file that serves two is a file that ships to both.
 *
 * What is still shared is shared on purpose: the service catalogue a nurse's day is priced from is
 * the same catalogue a patient books out of, and there is only one of it. */
/* A clinical workspace is not a shop. The nurse, doctor, partner and Control Tower each get their
   own navigation from StaffShell.tsx; this renders the section that navigation asked for, and leads
   with what the role has to act on rather than with a catalogue of things to buy. */
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
/* The reference each row on the day opens its assessment under. The first is the workspace's own
   worked example; the rest carry their time, because StaffShell reads the time back out of the
   modal name to decide whose visit it is. One rule, in one place, so the schedule and the queue
   agree about which visit was signed. */
export const referenceFor = (shift: Shift) => shift === nurseDay[0] ? 'TH-2048' : `TH-2048 · ${shift.start}`;

/* The numbers the shell's strip shows above this screen. "One to sign off" was typed there and was
   still saying it after she had signed all three — the strip and the list are one claim about one
   day, so they read one source. */
export const nurseDayCounts = (queue: Part[]) => {
 const signed = nurseDay.filter(shift => signOffFor(queue, referenceFor(shift))).length;
 const [first] = nurseDay;
 return {
  visits: nurseDay.length, signed, left: nurseDay.length - signed,
  nextStart: first.start, nextWhere: `${first.suburb} · ${first.service.duration} min`,
  earned: nurseDay.reduce((total, shift) => total + shift.service.nurseShare, 0)
 };
};

export function NurseSchedule({ open }: { open: (s: string) => void }) {
 const [available, setAvailable] = useState(true);
 const [next, ...later] = nurseDay;
 const ends = endTime(next.start, next.service.duration);
 const earned = nurseDay.reduce((total, shift) => total + shift.service.nurseShare, 0);
 const dayEnds = endTime(nurseDay[nurseDay.length - 1].start, nurseDay[nurseDay.length - 1].service.duration);
 /* What she has already done today, read out of the visit queue rather than out of a flag this
    screen sets. A signed visit used to read NEXT with "Start this visit" on it, and starting it
    again opened a blank assessment against a reference somebody had already sealed. */
 const queue = useVisitQueue();
 const signOff = (shift: Shift) => signOffFor(queue, referenceFor(shift));
 const nextSignOff = signOff(next);
 const signedCount = nurseDay.filter(shift => signOff(shift)).length;
 return <>
  {/* Duty state sits with the date rather than beside the section heading below it: whether she is
      taking visits at all is a fact about the whole day, and it is the one control on this screen
      that changes what the rest of it means. */}
  <div className="shift-head">
   <div><h1>{longDateOf(isoIn(new Date()))}</h1><p>{available ? `${nurseDay.length} visits · ${next.start} to ${dayEnds}${signedCount ? ` · ${signedCount} signed` : ''}` : 'You are off duty. Nothing new will be sent to you.'}</p></div>
   <button className="secondary duty-toggle" aria-pressed={available} onClick={() => setAvailable(!available)}><span className={`status-dot ${available ? '' : 'offline'}`}/>{available ? 'Available for visits' : 'Off duty'}</button>
  </div>
  <NotConnected of="dispatch"/>
  {available ? <>
   {/* The next visit, drawn once and drawn large. Time first because that is what decides whether
       she leaves now, then who and where, then the one thing she is walking in knowing. */}
   <article className={`next-visit${nextSignOff ? ' is-signed' : ''}`}>
    <div className="next-when"><span>{nextSignOff ? 'Signed' : 'Next'}</span><strong>{next.start}</strong><span>to {ends}</span></div>
    <div className="next-body">
     <h2>{next.service.name}</h2>
     <p className="next-who">{next.person}</p>
     <p className="next-where"><MapPin size={15}/>{next.suburb} · home visit</p>
     <p className="next-note">{nextSignOff ? `Sealed at ${formatEventTime(nextSignOff.capturedAt)}. ${nextSignOff.summary}` : next.note}</p>
    </div>
    {/* A signed visit is not startable. What she is offered instead is the record it produced —
        the same door the sign-off screen ends on, so arriving back here does not lose it. */}
    <div className="next-actions">
     {nextSignOff
      ? <button className="primary" onClick={() => open('Consultation record')}><ClipboardList size={17}/>Open what this produced</button>
      : <button className="primary" onClick={() => open('Visit assessment')}><ClipboardPlus size={17}/>Start this visit</button>}
     <button className="secondary" onClick={() => open(`Nurse case: TH-2048 · ${next.service.name} · ${next.suburb}`)}>Patient file</button>
    </div>
   </article>
   <SectionTitle title="Later today"/>
   <ol className="day-list">{later.map(shift => { const done = signOff(shift); return <li key={shift.start}>
    <button className="day-row" onClick={() => open(`Nurse case: ${shift.start} · ${shift.service.name} · ${shift.suburb}`)}>
     <span className="day-time"><strong>{shift.start}</strong><small>{endTime(shift.start, shift.service.duration)}</small></span>
     <span className="day-what"><strong>{shift.service.name}</strong><small>{shift.person} · {shift.suburb}</small></span>
     {done && <Pill tone="teal"><BadgeCheck size={13}/> Signed</Pill>}
     <ChevronRight size={18}/>
    </button>
   </li>; })}</ol>
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
   Deleting it is what first kept mapbox-gl out of the patient's bundle: it imported Dispatch and
   Orders, and LiveMap's side-effect CSS import meant Rollup kept the whole chain in every entry
   that could reach that file — which the patient's could. The file this now lives in finishes the
   same job for everything else a clinician renders. */
