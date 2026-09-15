import { useState } from 'react';
import { BedDouble, Building2, CircleAlert, ClipboardCheck, Info, MapPin, Phone, Radio, ShieldX } from 'lucide-react';
import { EmptyNote, Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { numberById } from '../lib/sos';
import { movementSettingsNow } from '../lib/settings';
import {
 RESPONDER_REF, acceptAsResponder, emergencySummarySaid, bedCategories, checklist, clinicianRefOf, declineAsResponder, declineReasons, decisions, directory, facilities, facilityOf,
 handOverAsResponder, informationAsked, labelIn, offeredToResponder, p2Reasons, packetFor, packetStateFor, presentationOf, priorities, receivingPoints,
 receivingRoles, requestAdmissionAs, requestTripAs, responderTrips, sendPacketFor, simulateArrival, simulateDecision, simulateHandover,
 simulateMoreInformation, summaryOpenFor, tripStates, tripsRequestedBy, useMovement, windowClosesFor, words, zones,
 type Admission, type ClinicianRole, type Refusal, type Trip
} from '../lib/movement';
import './movement.css';

/* Thuso Ride and admissions on the web: the clinician requesting a trip, and the Control Tower's desk — every trip,
 * the responder's phone as the desk sees it, admissions and the facility directory.
 *
 * WHAT A PERSON OPENS THIS FOR, AND WHAT LEADS. A clinician opens it to get a patient to a facility, so the request
 * leads and a refusal lands beside the button that caused it. The desk reads trips first, because a trip has a
 * responder on the road; admissions and the directory follow. A P1 refusal puts the emergency numbers above the
 * refusal's sentence, as every emergency surface here does.
 *
 * WHAT NO SCREEN HERE DOES. It never calls Thuso Ride an ambulance, never shows a pending admission as anything but
 * pending — every admission's words come from presentationOf(), the domain's one reader of the contract's states —
 * never shows the responder the emergency summary outside the trip, and types no heartbeat interval or window: the
 * interval is the setting in force, and a window is the trip's own arithmetic.
 *
 * Every sentence is packages/catalog/movement.json's or packages/catalog/apis/movement.json's, rendered word for
 * word. This module arrives on a dynamic import, so none of it is on a patient's first load. */

const say = words.screens;
const fill = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));
const when = (at: number) => new Date(at).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const zoneName = (id: string) => labelIn(zones, id);
const facilityName = (ref: string) => facilityOf(ref)?.name ?? ref;
const priorityLabel = (id: string) => labelIn(priorities, id);

/* When a pick-up or an arrival is asked for, as choices a person picks rather than a time typed. These are how far
   ahead a request is made, not a setting: nothing here is how long a window stays open. */
const AHEAD = [
 { id: 'hour', label: 'In an hour', minutes: 60 },
 { id: 'three-hours', label: 'In three hours', minutes: 180 },
 { id: 'tomorrow', label: 'Tomorrow at this time', minutes: 1440 }
];

function Refused({ refusal }: { refusal: Refusal }) {
 const p1 = refusal.id === 'p1-refused-no-ambulance-partner';
 return <div className={`mv-refused${p1 ? ' mv-p1' : ''}`} role="alert">
  {p1 && <>
   <strong className="mv-p1-heading">{say.clinician.p1Heading}</strong>
   <p className="mv-p1-call"><Phone size={17} aria-hidden="true"/><span>{fill(say.clinician.p1Call, { ambulance: numberById('ambulance').number, mobile: numberById('mobile').number })}</span></p>
  </>}
  <p><ShieldX size={17} aria-hidden="true"/><span>{refusal.statement}</span></p>
 </div>;
}

function TripState({ trip }: { trip: Trip }) {
 const tone = trip.stateCode === 'handed-over' ? 'plain' : trip.stateCode === 'accepted' ? 'teal' : 'amber';
 return <Pill tone={tone}>{labelIn(tripStates, trip.stateCode)}</Pill>;
}

/* The one entry the clinical shell loads. It is on the patient's first load as a lazy import, so one loader with a
   word for where it stands costs a patient fewer bytes than one loader per screen. The desk sits under the dispatch
   board, which already renders the dispatch capability's notice: one notice per screen. */
export function MovementSurface({ of }: { of: ClinicianRole | 'desk' }) {
 return of === 'desk' ? <ThusoRideDesk notice={false}/> : <TripBooking role={of}/>;
}

/* ---- The clinician requests a trip ------------------------------------------------------------- */

export function TripBooking({ role }: { role: ClinicianRole }) {
 const movement = useMovement();
 const [priorityClass, setPriority] = useState('P3');
 const [reason, setReason] = useState('');
 const [zoneId, setZone] = useState(zones[0]?.id ?? '');
 const [ahead, setAhead] = useState(AHEAD[0]!.id);
 const [facilityRef, setFacility] = useState(facilities[0]?.ref ?? '');
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const [requested, setRequested] = useState('');
 const mine = tripsRequestedBy(role, movement);
 const p2 = priorities.find(p => p.id === priorityClass)?.needsReason === true;
 const submit = () => {
  const made = requestTripAs(role, { priorityClass, zoneId, facilityRef, pickupInMinutes: AHEAD.find(a => a.id === ahead)!.minutes, priorityReasonCode: p2 ? reason : undefined });
  setRefusal(made.ok ? null : made.refusal);
  setRequested(made.ok ? fill(say.clinician.requested, { ref: made.value.tripRef }) : '');
 };
 return <section className="mv-booking form-stack" aria-labelledby={`mv-booking-${role}`}>
  <h2 id={`mv-booking-${role}`} className="section-title">{say.clinician.heading}</h2>
  <p className="helper">{say.clinician.intro}</p>
  <NotConnected of="dispatch"/>
  <p className="mv-not-ambulance"><Info size={16} aria-hidden="true"/><span>{words.notAnAmbulance.sentence}</span></p>
  <form className="panel form-stack mv-form" onSubmit={e => { e.preventDefault(); submit(); }}>
   <div className="review-line"><span>{say.clinician.patient}</span><strong>{words.preview.patientRef}</strong></div>
   <div className="mv-fields">
    <label>{say.clinician.priority}<select value={priorityClass} onChange={e => { setPriority(e.target.value); setRefusal(null); }}>
     {priorities.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select></label>
    {p2 && <label>{say.clinician.reason}<select value={reason} onChange={e => setReason(e.target.value)}>
     <option value="">Choose…</option>{p2Reasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select></label>}
    <label>{say.clinician.zone}<select value={zoneId} onChange={e => setZone(e.target.value)}>
     {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
    </select></label>
    <label>{say.clinician.when}<select value={ahead} onChange={e => setAhead(e.target.value)}>
     {AHEAD.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
    </select></label>
    <label>{say.clinician.destination}<select value={facilityRef} onChange={e => setFacility(e.target.value)}>
     {facilities.map(f => <option key={f.ref} value={f.ref}>{f.name}</option>)}
    </select></label>
   </div>
   <p className="helper">{priorities.find(p => p.id === priorityClass)?.sentence}</p>
   {p2 && <p className="helper">{fill(say.clinician.setBy, { clinician: clinicianRefOf(role) })}</p>}
   {refusal && <Refused refusal={refusal}/>}
   <button className="primary">{say.clinician.request}</button>
   <p className="helper" role="status">{requested}</p>
  </form>
  <h3>{say.clinician.tripsHeading}</h3>
  {mine.length ? <ul className="mv-list">{mine.map(trip => <li key={trip.tripRef} className="mv-row" aria-label={trip.tripRef}>
   <div className="mv-row-head"><strong>{trip.tripRef}</strong><Pill tone="plain">{priorityLabel(trip.priorityClass)}</Pill><TripState trip={trip}/></div>
   <p className="helper">{fill(say.responder.pickup, { zone: zoneName(trip.zoneId), when: when(trip.pickupWindowStart) })} · {fill(say.responder.destination, { facility: facilityName(trip.facilityRef) })}</p>
  </li>)}</ul> : <EmptyNote>{say.clinician.noTrips}</EmptyNote>}
  <p className="helper"><Radio size={13} aria-hidden="true"/><span>{say.preview}</span></p>
 </section>;
}

/* ---- The Control Tower's desk ------------------------------------------------------------------ */

/* notice is off where the screen around it already renders the dispatch capability's sentence: one notice per screen. */
export function ThusoRideDesk({ notice = true }: { notice?: boolean }) {
 const movement = useMovement();
 return <section className="mv-desk form-stack" aria-labelledby="mv-desk-heading">
  <h2 id="mv-desk-heading" className="section-title">{say.desk.heading}</h2>
  <p className="helper">{say.desk.intro}</p>
  {notice && <NotConnected of="dispatch"/>}
  <p className="mv-not-ambulance"><Info size={16} aria-hidden="true"/><span>{words.notAnAmbulance.sentence}</span></p>
  <div className="mv-desk-grid">
   <div className="mv-trips form-stack">
    {movement.trips.length ? <div className="table-scroll mv-table-scroll">
     <table className="chart-table mv-table">
      <caption className="visually-hidden">{say.desk.heading}</caption>
      <thead><tr><th scope="col">Trip</th><th scope="col">Priority</th><th scope="col">Pick-up</th><th scope="col">Destination</th><th scope="col">State</th></tr></thead>
      <tbody>{movement.trips.map(trip => <tr key={trip.tripRef}>
       <th scope="row">{trip.tripRef}<small>{trip.admissionRef ?? ''}</small></th>
       <td>{priorityLabel(trip.priorityClass)}</td>
       <td>{zoneName(trip.zoneId)}<small>{when(trip.pickupWindowStart)}</small></td>
       <td>{facilityName(trip.facilityRef)}</td>
       <td><TripState trip={trip}/>{trip.stateCode === 'accepted' && <small>{fill(say.desk.windowCloses, { when: when(windowClosesFor(trip)) })}</small>}</td>
      </tr>)}</tbody>
     </table>
    </div> : <EmptyNote>{say.desk.noTrips}</EmptyNote>}
   </div>
   <ResponderPhone/>
  </div>
  <AdmissionsDesk/>
  <FacilityDirectory/>
  <p className="helper"><Radio size={13} aria-hidden="true"/><span>{say.preview}</span></p>
 </section>;
}

/* What the responder's phone shows, drawn at the desk so the desk and the phone read one trip. */
export function ResponderPhone() {
 const movement = useMovement();
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const [status, setStatus] = useState('');
 const offers = offeredToResponder(movement);
 const mine = responderTrips(movement);
 const underWay = mine.find(t => t.stateCode === 'accepted');
 const handed = [...mine].reverse().find(t => t.stateCode === 'handed-over');
 const answer = (result: { ok: true } | { ok: false; refusal: Refusal }, said = '') => { setRefusal(result.ok ? null : result.refusal); setStatus(result.ok ? said : ''); };
 const interval = movementSettingsNow().heartbeatIntervalSeconds;
 return <section className="panel form-stack mv-phone" aria-labelledby="mv-phone-heading">
  <h3 id="mv-phone-heading">{say.desk.responderHeading}</h3>
  <p className="helper">{fill(say.desk.responderIntro, { responder: RESPONDER_REF })}</p>
  <p className="helper">{fill(say.desk.responderSynthetic, { responder: RESPONDER_REF })}</p>
  <h4>{say.responder.heading}</h4>
  <p className="helper">{say.responder.intro}</p>
  <p className="helper">{fill(say.responder.heartbeat, { interval: `${interval} seconds` })}</p>
  <h5>{say.responder.offered}</h5>
  {offers.length ? <ul className="mv-list">{offers.map(trip => <li key={trip.tripRef} className="mv-row" aria-label={`${say.responder.offered}: ${trip.tripRef}`}>
   <div className="mv-row-head"><strong>{trip.tripRef}</strong><Pill tone="plain">{priorityLabel(trip.priorityClass)}</Pill></div>
   <p className="helper"><MapPin size={13} aria-hidden="true"/><span>{fill(say.responder.pickup, { zone: zoneName(trip.zoneId), when: when(trip.pickupWindowStart) })}</span></p>
   <p className="helper"><Building2 size={13} aria-hidden="true"/><span>{fill(say.responder.destination, { facility: facilityName(trip.facilityRef) })}</span></p>
   <div className="button-row">
    <button className="secondary" onClick={() => answer(declineAsResponder(trip.tripRef), say.responder.declined)}>{say.responder.decline}</button>
    <button className="primary" onClick={() => answer(acceptAsResponder(trip.tripRef))}>{say.responder.accept}</button>
   </div>
  </li>)}</ul> : <EmptyNote>{say.responder.noOffers}</EmptyNote>}
  <div className="mv-summary" role="group" aria-label={say.responder.summaryHeading}>
   <h5>{say.responder.summaryHeading}</h5>
   <p>{underWay && summaryOpenFor(underWay)
    ? fill(say.responder.summaryOpen, { categories: emergencySummarySaid })
    : handed && !underWay ? say.responder.summaryClosed : say.responder.summaryNotYet}</p>
  </div>
  {underWay && <HandoverForm trip={underWay} onAnswer={answer}/>}
  {refusal && <Refused refusal={refusal}/>}
  <p className="helper" role="status">{status || (handed && !underWay && handed.handedOverAt !== null ? fill(say.responder.handedOver, { when: when(handed.handedOverAt) }) : '')}</p>
 </section>;
}

function HandoverForm({ trip, onAnswer }: { trip: Trip; onAnswer: (result: { ok: true } | { ok: false; refusal: Refusal }) => void }) {
 const [receivingRole, setReceivingRole] = useState('');
 const [ticked, setTicked] = useState<string[]>([]);
 return <form className="form-stack mv-handover" aria-labelledby="mv-handover-heading" onSubmit={e => { e.preventDefault(); onAnswer(handOverAsResponder(trip.tripRef, receivingRole, ticked.length === checklist.length)); }}>
  <h5 id="mv-handover-heading">{say.responder.handoverHeading} · {trip.tripRef}</h5>
  <label>{say.responder.receivingRole}<select value={receivingRole} onChange={e => setReceivingRole(e.target.value)}>
   <option value="">Choose…</option>{receivingRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
  </select></label>
  <fieldset className="mv-checklist"><legend>{say.responder.checklistHeading}</legend>
   {checklist.map(line => <label key={line} className="checkbox"><input type="checkbox" checked={ticked.includes(line)} onChange={() => setTicked(ticked.includes(line) ? ticked.filter(t => t !== line) : [...ticked, line])}/><span>{line}</span></label>)}
  </fieldset>
  <button className="primary"><ClipboardCheck size={16} aria-hidden="true"/>{say.responder.handover}</button>
 </form>;
}

/* ---- Admissions -------------------------------------------------------------------------------- */

export function AdmissionsDesk() {
 const movement = useMovement();
 const [facilityRef, setFacility] = useState(facilities[0]?.ref ?? '');
 const [bedCategory, setBed] = useState(bedCategories[0]?.id ?? '');
 const [priorityCode, setPriority] = useState('P3');
 const [ahead, setAhead] = useState(AHEAD[1]!.id);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const submit = () => {
  const made = requestAdmissionAs({ facilityRef, bedCategory, priorityCode, arrivalInMinutes: AHEAD.find(a => a.id === ahead)!.minutes });
  setRefusal(made.ok ? null : made.refusal);
 };
 return <section className="mv-admissions form-stack" aria-labelledby="mv-admissions-heading">
  <h2 id="mv-admissions-heading" className="section-title">{say.admissions.heading}</h2>
  <p className="helper">{say.admissions.intro}</p>
  <form className="panel form-stack mv-form" aria-label={say.admissions.request} onSubmit={e => { e.preventDefault(); submit(); }}>
   <div className="mv-fields">
    <label>{say.admissions.facility}<select value={facilityRef} onChange={e => setFacility(e.target.value)}>{facilities.map(f => <option key={f.ref} value={f.ref}>{f.name}</option>)}</select></label>
    <label>{say.admissions.bedCategory}<select value={bedCategory} onChange={e => setBed(e.target.value)}>{bedCategories.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
    <label>{say.admissions.priority}<select value={priorityCode} onChange={e => setPriority(e.target.value)}>{priorities.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <label>{say.admissions.arrival}<select value={ahead} onChange={e => setAhead(e.target.value)}>{AHEAD.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   </div>
   {refusal && <Refused refusal={refusal}/>}
   <button className="primary"><BedDouble size={16} aria-hidden="true"/>{say.admissions.request}</button>
  </form>
  <h3>{say.admissions.statusHeading}</h3>
  {movement.admissions.length ? <ul className="mv-list">{movement.admissions.map(a => <AdmissionRow key={a.admissionRef} admission={a}/>)}</ul>
   : <EmptyNote>{say.admissions.noRequests}</EmptyNote>}
 </section>;
}

function AdmissionRow({ admission }: { admission: Admission }) {
 const movement = useMovement();
 const shown = presentationOf(admission.stateCode);
 const [refusal, setRefusal] = useState<Refusal | null>(null);
 const [receivingPoint, setReceivingPoint] = useState('');
 const [reasonCode, setReason] = useState('');
 const [alternative, setAlternative] = useState(false);
 const [informationCode, setInformation] = useState('');
 const [agreed, setAgreed] = useState(true);
 const [receivingRole, setReceivingRole] = useState('');
 const answer = (result: { ok: true } | { ok: false; refusal: Refusal }) => setRefusal(result.ok ? null : result.refusal);
 const packet = packetFor(movement, admission.admissionRef);
 const packetState = packetStateFor(movement, admission);
 const facility = facilityName(admission.facilityRef);
 return <li className={`mv-row mv-admission${shown.pending ? ' mv-pending' : ''}`} aria-label={`${admission.admissionRef} ${facility}`}>
  <div className="mv-row-head">
   <strong>{admission.admissionRef}</strong>
   <span className="mv-state">{shown.label}</span>
   {shown.pending && <Pill tone="amber">{say.admissions.pending}</Pill>}
   {shown.destinationConfirmed && <Pill tone="teal">{say.admissions.destinationConfirmed}</Pill>}
   {admission.decisionSimulated && <Pill tone="plain">{say.admissions.simulated}</Pill>}
  </div>
  <p className="helper">{facility} · {labelIn(bedCategories, admission.bedCategory)} · {priorityLabel(admission.priorityCode)}</p>
  <p>{shown.sentence}</p>
  {shown.destinationConfirmed && admission.receivingPoint && <p className="helper">{say.admissions.receivingPoint}: {labelIn(receivingPoints, admission.receivingPoint)}</p>}
  <div className="mv-packet">
   <strong>{say.admissions.packetHeading}</strong>
   <span className="helper">{packetState === 'none' ? say.admissions.packetNone
    : packetState === 'ended' ? say.admissions.packetEnded
    : `${fill(say.admissions.packetSent, { when: when(packet!.linkEndsAt) })}${packet!.openedAt !== null ? ` ${fill(say.admissions.packetOpened, { when: when(packet!.openedAt) })}` : ''}`}</span>
   {admission.stateCode !== 'handed-over' && <button className="secondary" onClick={() => answer(sendPacketFor(admission.admissionRef))}>{say.admissions.packetSend}</button>}
  </div>
  {admission.stateCode !== 'handed-over' && !['declined', 'alternative-offered'].includes(admission.stateCode) && <details className="mv-simulate">
   <summary>{say.admissions.simulateHeading}</summary>
   <p className="helper">{say.admissions.simulateNote}</p>
   {shown.pending && <div className="form-stack">
    <div className="mv-fields">
     <label>{say.admissions.receivingPoint}<select value={receivingPoint} onChange={e => setReceivingPoint(e.target.value)}><option value="">Choose…</option>{receivingPoints.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
     <label>{say.admissions.declineReason}<select value={reasonCode} onChange={e => setReason(e.target.value)}><option value="">Choose…</option>{declineReasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
     <label>{say.admissions.askedFor}<select value={informationCode} onChange={e => setInformation(e.target.value)}><option value="">Choose…</option>{informationAsked.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    </div>
    <label className="checkbox"><input type="checkbox" checked={alternative} onChange={() => setAlternative(!alternative)}/><span>{say.admissions.alternative}</span></label>
    <div className="button-row mv-answers">
     <button className="secondary" onClick={() => answer(simulateDecision(admission.admissionRef, { decisionCode: 'accepted', receivingPoint, alternativeOffered: false }))}>{labelIn(decisions,'accepted')}</button>
     <button className="secondary" onClick={() => answer(simulateDecision(admission.admissionRef, { decisionCode: 'waitlisted', alternativeOffered: false }))}>{labelIn(decisions,'waitlisted')}</button>
     <button className="secondary" onClick={() => answer(simulateDecision(admission.admissionRef, { decisionCode: 'declined', reasonCode, alternativeOffered: alternative }))}>{labelIn(decisions,'declined')}</button>
     <button className="secondary" onClick={() => answer(simulateMoreInformation(admission.admissionRef, informationCode))}>{say.admissions.askedFor}</button>
    </div>
   </div>}
   {admission.stateCode === 'accepted' && <div className="form-stack">
    <label>{say.admissions.receivingPoint}<select value={receivingPoint} onChange={e => setReceivingPoint(e.target.value)}><option value="">Choose…</option>{receivingPoints.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    <label className="checkbox"><input type="checkbox" checked={agreed} onChange={() => setAgreed(!agreed)}/><span>{say.admissions.agreed}</span></label>
    <button className="secondary" onClick={() => answer(simulateArrival(admission.admissionRef, receivingPoint, agreed))}>{say.admissions.arrive}</button>
   </div>}
   {admission.stateCode === 'arrived' && <div className="form-stack">
    <label>{say.responder.receivingRole}<select value={receivingRole} onChange={e => setReceivingRole(e.target.value)}><option value="">Choose…</option>{receivingRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    <button className="secondary" onClick={() => answer(simulateHandover(admission.admissionRef, receivingRole))}>{say.admissions.handover}</button>
   </div>}
  </details>}
  {refusal && <Refused refusal={refusal}/>}
 </li>;
}

/* ---- The facility directory -------------------------------------------------------------------- */

export function FacilityDirectory() {
 const [zoneId, setZone] = useState('');
 const [bedCategory, setBed] = useState('');
 const found = directory(zoneId, bedCategory);
 const list = found.ok ? found.value : [];
 return <section className="mv-directory form-stack" aria-labelledby="mv-directory-heading">
  <h2 id="mv-directory-heading" className="section-title">{say.directory.heading}</h2>
  <p className="helper">{say.directory.intro}</p>
  <p className="mv-not-ambulance"><CircleAlert size={16} aria-hidden="true"/><span>{words.facilities.sentence}</span></p>
  <div className="mv-fields">
   <label>{say.directory.zone}<select value={zoneId} onChange={e => setZone(e.target.value)}><option value="">{say.directory.everyZone}</option>{zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}</select></label>
   <label>{say.directory.bedCategory}<select value={bedCategory} onChange={e => setBed(e.target.value)}><option value="">{say.directory.everyCategory}</option>{bedCategories.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
  </div>
  {list.length ? <ul className="mv-list mv-facilities">{list.map(f => <li key={f.ref} className="mv-row" aria-label={f.name}>
   <div className="mv-row-head"><Building2 size={18} aria-hidden="true"/><strong>{f.name}</strong></div>
   <p className="helper">{zoneName(f.zoneId)} · {say.directory.hours}: {f.hours}</p>
   <p className="helper">{f.bedCategories.map(id => labelIn(bedCategories, id)).join(', ')}</p>
  </li>)}</ul> : <EmptyNote>{say.directory.none}</EmptyNote>}
  <p className="helper">{words.facilities.noNumber}</p>
 </section>;
}
