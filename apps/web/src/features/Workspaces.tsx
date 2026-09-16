import { useState } from 'react';
import { BadgeCheck, ChevronRight, ClipboardList, ClipboardPlus, MapPin } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { EmptyState } from '../components/States';
import { services, money, type Service } from '../lib/catalog';
import { endTime, isoIn, longDateOf } from '../lib/scheduling';
import { signOffFor, type Part } from '../lib/visit-queue';
import { useVisitQueue } from './VisitQueue';
import { formatEventTime } from '../lib/vetting';
import { CareOfferSlot } from './CareVisit';
import medicines from '../../../../packages/catalog/medicines.json' with { type: 'json' };
import { NurseDoorCode } from './VerifyInService';

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
/* Medicines & Labs arrives as More tools rather than as sections: each is one piece of a chain the four workspaces
   share, and a sixth tab on a nurse's or a doctor's phone would push the work she opened the app for off the bar.
   The names are the contract's own headings, so the link and the dialog it opens cannot drift. */
/* The HL7 quarantine's heading, typed rather than imported (Wave 5): importing packages/catalog/hl7v2-inbound.json here
   would split it into a chunk the patient's first load names in its preload list. scripts/check-boundaries.mjs holds
   this to the contract's screens.quarantine.heading word for word, as it holds App.tsx's P1 route names. */
export const HL7_QUARANTINE_HEADING = 'HL7 quarantine (development)';
export const roleExtras: Record<string,string[]> = {
 Nurse:['Locum shifts','Academy',medicines.screen.handover.heading],
 Doctor:['Clinical protocols','Referral pathway','Per-case fees','Claim draft',medicines.screen.prescribe.heading,medicines.screen.results.heading],
 Partner:['Prescription RX-0081','Laboratory order LAB-0023',medicines.screen.pharmacy.heading],
 /* The HL7 quarantine is a development operator's view (Wave 5), under its contract heading, which says so. */
 'Control Tower':['Nurse onboarding & vetting','Employer programmes',HL7_QUARANTINE_HEADING]
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
/** What a doctor is waiting on, longest first — because that is the order the queue is worked.

    Four fields where there were two. `what` was "Vitals assessment · Lerato Molefe" and `from` was
    "Sister Naledi Mokoena · 2 of 4 readings flagged": two sentences with a middle dot in each,
    which a row can only ever render as two lines of running text. They are the same words, split at
    the dots they were already split at, so the row can weight them — the case and the patient
    large, the nurse who sent it quiet, and what she found as a chip a doctor can scan down a column
    of. No word here is new. */
type Review = { ref: string; kind: string; patient: string; from: string; found: string; waited: string; minutes: number; flag: string };
const reviewQueue: Review[] = [
 { ref: 'TH-2048', kind: 'Vitals assessment', patient: 'Lerato Molefe', from: 'Sister Naledi Mokoena', found: '2 of 4 readings flagged', waited: '3 h 20 m', minutes: 200, flag: 'Out of range' },
 { ref: 'TH-2041', kind: 'Prescription request', patient: 'Thabo Molefe', from: 'Sister Palesa Khumalo', found: 'Repeat, last issued 28 August', waited: '1 h 05 m', minutes: 65, flag: 'Out of range' },
 { ref: 'TH-2045', kind: 'Wound follow-up', patient: 'Nomsa Molefe', from: 'Sister Naledi Mokoena', found: 'Day 6, photograph attached', waited: '22 m', minutes: 22, flag: '' }
];
/** Somebody's initials, for the disc at the head of a row. It is drawn from the name beside it and
    is aria-hidden everywhere it appears: a screen reader that reads "L M Lerato Molefe" has been
    given the name twice, once as noise. */
const initialsOf = (name: string) => name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2);

/* The reference each row on the day opens its assessment under. The first is the workspace's own
   worked example; the rest carry their time, because StaffShell reads the time back out of the
   modal name to decide whose visit it is. One rule, in one place, so the schedule and the queue
   agree about which visit was signed. */
/* The two figures a clinician's dashboard leads with, each counted off the list beneath it. The
   founder asked for the dashboards back after they were taken out; what does not come back is the
   pair that was invented — "18 reviewed today" and its "Median 4 m 10 s" had no list to be counted
   from at all, and an invented productivity figure on a clinical screen is the one kind of number
   this product must never carry. Everything below can be disproved by looking at the rows. */
export const reviewQueueCounts = () => ({
 waiting: reviewQueue.length,
 flagged: reviewQueue.filter(review => review.flag).length,
 longest: [...reviewQueue].sort((a, b) => b.minutes - a.minutes)[0].waited,
 /* The queue row by row, so a figure drawn as a ring or a bar is the same arithmetic as the figure
    drawn as a numeral rather than a second opinion about it. A shape a reader cannot check against
    the list underneath is the typed figure problem again wearing a nicer coat: three arcs, three
    rows, and the flagged ones are the ones carrying the badge. */
 rows: reviewQueue.map(review => ({ ref: review.ref, minutes: review.minutes, flagged: Boolean(review.flag) }))
});

/** Minutes since midnight, for a day drawn to scale rather than as three equal blocks. */
export const minuteOfDay = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export const nurseDayCounts = (queue: Part[]) => {
 /* Each visit as the span of the day it actually occupies — its start, and its end worked out from
    the service's own duration. The strip draws the day from these, so the block a reader sees is
    the visit the row underneath describes and is as long as that visit is. */
 const spans = nurseDay.map(shift => ({
  from: minuteOfDay(shift.start),
  to: minuteOfDay(endTime(shift.start, shift.service.duration)),
  signed: Boolean(signOffFor(queue, referenceFor(shift)))
 }));
 const signed = spans.filter(span => span.signed).length;
 /* NEXT MEANS THE NEXT ONE NOT YET SIGNED OFF, and it did not: this returned nurseDay[0].start
    whatever had happened to it, so a nurse who signed 09:00 off at 09:40 was still told her next
    visit was at 09:00 — by the deck at the top of the screen and by the line under the date, while
    the drawing beside them had already turned that block to paper. A figure that contradicts the
    picture drawn from the same rows is the typed-figure defect with the arithmetic done correctly
    and then thrown away. `find` is the whole fix: the first visit the queue holds no sign-off for.
    It is legitimately undefined at the end of a day, and every caller is made to say what it shows
    then rather than being handed a time that is not next and not true. */
 const next = nurseDay.find(shift => !signOffFor(queue, referenceFor(shift)));
 const last = nurseDay[nurseDay.length - 1];
 return {
  visits: nurseDay.length, signed, left: nurseDay.length - signed,
  /** Undefined once every visit is signed off: the day is finished, and nothing is next. One field
      rather than two, so that a caller which has established there is a next visit has established
      where it is as well — two optional fields is two null checks and a `?? ''` on the second. */
  next: next && { start: next.start, where: `${next.suburb} · ${next.service.duration} min` },
  dayStarts: nurseDay[0].start,
  dayEnds: endTime(last.start, last.service.duration),
  earned: nurseDay.reduce((total, shift) => total + shift.service.nurseShare, 0),
  spans, dayFrom: spans[0].from, dayTo: spans[spans.length - 1].to
 };
};

/** The gap between two visits, which is the travel and the turnaround between them. Arithmetic on
    the two rows it sits between — never a journey time somebody typed, because nothing in this
    product knows how long the drive from Rosebank to Parktown takes. */
const gapText = (minutes: number) => {
 const hours = Math.floor(minutes / 60), rest = minutes % 60;
 return hours ? `${hours} h${rest ? ` ${String(rest).padStart(2, '0')} m` : ''}` : `${rest} m`;
};

export const referenceFor = (shift: Shift) => shift === nurseDay[0] ? 'TH-2048' : `TH-2048 · ${shift.start}`;
/** The service a visit on this day is, by the reference it opens under. The field-safety timer runs on the
    service's own duration, so a visit says which service it is rather than how long it thinks it takes. */
export const serviceIdFor = (reference: string) => (nurseDay.find(shift => referenceFor(shift) === reference) ?? nurseDay[0]).service.id;

export function NurseSchedule({ open }: { open: (s: string) => void }) {
 const [available, setAvailable] = useState(true);
 /* What she has already done today, read out of the visit queue rather than out of a flag this
    screen sets. A signed visit used to read NEXT with "Start this visit" on it, and starting it
    again opened a blank assessment against a reference somebody had already sealed. */
 const queue = useVisitQueue();
 const signOff = (shift: Shift) => signOffFor(queue, referenceFor(shift));
 /* The same arithmetic the deck at the top of the screen is counted from, read once here rather
    than done again. It was done again — this screen worked out its own day end and its own total
    while nurseDayCounts worked out both a second time — and two answers to "when does the day end"
    is how a header comes to disagree with the strip above it. */
 const day = nurseDayCounts(queue);
 const [lead, ...later] = nurseDay;
 const leadSignOff = signOff(lead);
 const ends = endTime(lead.start, lead.service.duration);
 /* One line under the date, and it says what is actually left. It said "09:00 to 14:45" all day,
    including after 09:00 had been signed off; it opens on the next visit that has not been. When
    there is no such visit it says so in the only words that are still true at the end of a day —
    the hours the day ran, and that every one of them is signed off. */
 const standing = !available ? 'You are off duty. Nothing new will be sent to you.'
  : day.next ? `${day.next.start} to ${day.dayEnds}${day.signed ? ` · ${day.signed} signed` : ''}`
   : `${day.dayStarts} to ${day.dayEnds} · every visit signed off`;
 return <>
  {/* Duty state sits with the date rather than beside the section heading below it: whether she is
      taking visits at all is a fact about the whole day, and it is the one control on this screen
      that changes what the rest of it means. */}
  <div className="shift-head">
   <div><h1>{longDateOf(isoIn(new Date()))}</h1><p>{standing}</p></div>
   <button className="secondary duty-toggle" aria-pressed={available} onClick={() => setAvailable(!available)}><span className={`status-dot ${available ? '' : 'offline'}`}/>{available ? 'Available for visits' : 'Off duty'}</button>
  </div>
  <NotConnected of="dispatch"/>
  {/* An offer is a decision about the day, so it is read under the date and above the day it would
      join. Off duty it shows nothing new; a visit she has already taken still shows. */}
  <CareOfferSlot open={open} available={available}/>
  {/* The code she shows at a door, from Verify. On duty only: off duty she is at nobody's door. */}
  {available && <NurseDoorCode/>}
  {available ? <div className="nday">
   {/* THE DAY AS ONE RAIL RATHER THAN A CARD AND TWO ROWS.
       It was a lime card, a section heading, two grey rows in a white box and a hairline total —
       four objects with nothing running between them, so the one question a schedule is read for
       ("what does my day look like") had to be answered by reading three times and subtracting.
       Everything below now hangs off one gutter: the time on the left, the rail beside it, the
       visit to the right of that. The rail is solid through a visit and dashed through the gap
       between two, and the gap says how long it is and which suburb it ends in — both of which are
       arithmetic on the rows either side of it rather than a journey time anybody typed. */}
   {/* The visit in hand, drawn once and drawn large. Time first because that is what decides
       whether she leaves now, then who and where, then the one thing she is walking in knowing. */}
   <article className={`next-visit${leadSignOff ? ' is-signed' : ''}`}>
    <div className="next-when">
     <span>{leadSignOff ? 'Signed' : 'Next'}</span><strong>{lead.start}</strong><span>to {ends}</span>
    </div>
    <span className="nday-node" aria-hidden="true"/>
    <div className="next-body">
     <h2>{lead.service.name}</h2>
     <p className="next-who">{lead.person}</p>
     <p className="next-where"><MapPin size={15}/>{lead.suburb} · home visit</p>
     <p className="next-note">{leadSignOff ? `Sealed at ${formatEventTime(leadSignOff.capturedAt)}. ${leadSignOff.summary}` : lead.note}</p>
    </div>
    {/* A signed visit is not startable. What she is offered instead is the record it produced —
        the same door the sign-off screen ends on, so arriving back here does not lose it. */}
    <div className="next-actions">
     {leadSignOff
      ? <button className="primary" onClick={() => open('Consultation record')}><ClipboardList size={17}/>Open what this produced</button>
      : <button className="primary" onClick={() => open('Visit assessment')}><ClipboardPlus size={17}/>Start this visit</button>}
     <button className="secondary" onClick={() => open(`Nurse case: TH-2048 · ${lead.service.name} · ${lead.suburb}`)}>Patient file</button>
    </div>
   </article>
   <ol className="day-list">{later.map((shift, index) => {
    const done = signOff(shift);
    const before = nurseDay[index];
    /* The visit she should be doing next, marked on the rail rather than moved to the top of it.
       It is only ever somebody other than the card above while that card has been signed off, so a
       day that has not started yet carries no second marker and no second primary action — which
       is also why this is a badge and not a button. One thing to press per screen. */
    const isNext = !done && day.next?.start === shift.start;
    return <li key={shift.start}>
     <p className="nday-gap">
      <span className="nday-gap-rail" aria-hidden="true"/>
      <span className="nday-gap-dur">{gapText(minuteOfDay(shift.start) - minuteOfDay(endTime(before.start, before.service.duration)))}</span>
      <span>to travel and turn around · {before.suburb} to {shift.suburb}</span>
     </p>
     <button className={`day-row${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`} onClick={() => open(`Nurse case: ${shift.start} · ${shift.service.name} · ${shift.suburb}`)}>
      <span className="day-time"><strong>{shift.start}</strong><small>{endTime(shift.start, shift.service.duration)}</small></span>
      <span className="nday-node" aria-hidden="true"/>
      <span className="day-what">
       <strong>{shift.service.name}</strong>
       <small>{shift.person}</small>
       <small className="day-where"><MapPin size={13}/>{shift.suburb} · {shift.service.duration} min</small>
      </span>
      <span className="day-meta">
       {done ? <Pill tone="teal"><BadgeCheck size={13}/> Signed</Pill> : isNext ? <Pill tone="amber">Next</Pill> : null}
       <span className="day-go" aria-hidden="true"><ChevronRight size={18}/></span>
      </span>
     </button>
    </li>;
   })}</ol>
   {/* The end of the rail, and the one line a total belongs on: after the work, in the place a
       person checks rather than plans from. It carries the shape of the day beside the money so
       that the last thing on the screen is still the day rather than a number about it. */}
   <div className="day-total">
    <span className="nday-node is-end" aria-hidden="true"/>
    <strong className="day-total-end">{day.dayEnds}</strong>
    <span className="day-total-say">
     <strong>Your day ends</strong>
     <small>{day.signed === day.visits ? `Every visit signed off · ${day.visits} today`
      : day.signed ? `${day.signed} of ${day.visits} signed off`
       : `${day.visits} visits, none signed off yet`}</small>
    </span>
    <span className="day-total-money">
     <small>Your share of today, at the catalogue&rsquo;s rates</small>
     <strong>{money(day.earned)}</strong>
    </span>
   </div>
  </div> : <EmptyState title="You are off duty" body="Nothing is sent to a nurse who is off duty, and going off duty never cancels a visit you have already accepted. Turn availability back on when you are ready." action="Go available" onAction={() => setAvailable(true)}/>}
 </>;
}
export function ReviewQueue({ open }: { open: (s: string) => void }) {
 const [flaggedOnly, setFlaggedOnly] = useState(false);
 const rows = flaggedOnly ? reviewQueue.filter(r => r.flag) : reviewQueue;
 /* Longest first is what the doctor is told, so the longest is taken by comparing minutes rather
    than by trusting the order the list happens to be written in — and it is taken from the rows
    actually on the screen, so switching to Flagged cannot leave the sentence describing a case the
    filter has hidden. */
 const longest = [...rows].sort((a, b) => b.minutes - a.minutes)[0];
 /* The same bars the deck above draws, one per row, on the row they describe. The queue is worked
    longest first and the words at the top of the screen say so; this is that sentence drawn, so a
    doctor scanning down sees the gap between a case that has waited three hours and one that has
    waited twenty minutes rather than reading two numbers and subtracting. It is decoration of a
    figure already written on the row — aria-hidden, never a target, and it carries no number of its
    own: the divisor is the longest row on the screen, so the filter narrowing the list rescales the
    bars with it rather than leaving them measured against a case nobody can see. */
 const longestWait = longest?.minutes ?? 1;
 return <>
  <div className="shift-head">
   {/* The one line, and it carries the figures now. There used to be a strip of three summary tiles
       above this screen saying how many were waiting, how many were out of range and — invented,
       with nothing on the queue to count it from — how many had been reviewed today at what median.
       A clinician opens this to work a queue rather than to read a report on herself. What is worth
       saying is what is in front of her, counted off the rows underneath, and then who may sign. */}
   <div><h1>Review queue</h1><p>{longest ? `${rows.length} waiting, longest first — the oldest for ${longest.waited}. ` : ''}Decision support may draft; only a registered doctor signs.</p></div>
   <div className="tabs queue-filter" role="group" aria-label="Filter the queue">
    <button className={flaggedOnly ? '' : 'selected'} aria-pressed={!flaggedOnly} onClick={() => setFlaggedOnly(false)}>Everything</button>
    <button className={flaggedOnly ? 'selected' : ''} aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(true)}>Flagged</button>
   </div>
  </div>
  <NotConnected of="screening"/>
  {/* A ROW WITH SOMEBODY ON IT. This was a reference, two lines of running text and a time, three
      times over, on one white card — a spreadsheet under an instrument deck. What is on it now is
      the same six facts given the weight each one is worked in: the person it is about at the head
      of the row, the case and the reference under that, what the nurse found as a chip, and the
      wait set large in the column the queue is ordered by with its own bar under it, so the three
      bars read down the list as the pressure the deck draws at the top of the screen.
      Colour is spent once and only on the badge that means something: out of range is mango, and
      it is also a rail down the left edge of the row, because a state told in colour alone is a
      state a colour-blind reader is not told. Waiting time is tabular and right-aligned — a queue
      you cannot read down is a queue you work in the order it was drawn. */}
  {rows.length ? <ol className="review-list">{rows.map(review => <li key={review.ref}>
   <button className={`review-row${review.flag ? ' is-flagged' : ''}`} onClick={() => open(`Doctor review: ${review.ref}`)}>
    <span className="review-face" aria-hidden="true">{initialsOf(review.patient)}</span>
    <span className="review-what">
     <span className="review-ref">{review.ref}</span>
     <strong>{review.kind} · {review.patient}</strong>
     {/* What the case is and who sent it. This line used to repeat "a registered doctor signs this
         off" under every row — true, and said once at the top of the screen, where a sentence that
         is the same on every row belongs. */}
     <small>{review.from}</small>
     <span className="review-found">{review.found}</span>
    </span>
    <span className="review-meta">
     <span className="review-flag">{review.flag ? <Pill tone="amber">{review.flag}</Pill> : <span className="review-routine">Routine</span>}</span>
     <span className="review-wait">
      <strong className="review-waited">{review.waited}</strong>
      <small>waiting</small>
      <span className="c-bars review-pressure" aria-hidden="true">
       <i style={{ width: `${Math.max(4, review.minutes / longestWait * 100)}%` }}/>
      </span>
     </span>
     <span className="review-go" aria-hidden="true"><ChevronRight size={18}/></span>
    </span>
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
