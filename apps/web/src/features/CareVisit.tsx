import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, Check, ClipboardList, Clock3, KeyRound, Route, ShieldCheck } from 'lucide-react';
import protocolsContract from '../../../../packages/catalog/protocols.json' with { type: 'json' };
import { NotConnected } from '../components/NotConnected';
import { CodeInput } from '../components/Steps';
import { LiveMap, type MapMarker } from '../map/LiveMap';
import { services } from '../lib/catalog';
import { zoneById } from '../lib/geography';
import { nurseById } from '../lib/roster';
import { timezone } from '../lib/scheduling';
import {
 accept, attachReadings, complete, decline, goTo, handOver, markerFor, preview, sentences, stages, start, tick, useCareVisit
} from '../lib/care-visit';
import './care-visit.css';

/* A visit offered to a nurse, and the visit itself — the Care engine's domain on the nurse's screen.
 *
 * TWO PLACES, BECAUSE THEY ARE TWO DECISIONS. The offer sits on her day, under the date, because
 * whether to take another visit is a decision about the day: it is read beside the visits already on
 * it. The visit opens as its own screen once she has taken it, because from the door onwards it is the
 * only thing she is doing.
 *
 * WHAT THE OFFER CARD WITHHOLDS. The suburb. An offer goes to a nurse who may decline it, and
 * appointment.offered carries no patient location for exactly that reason, so the card says how far
 * and when — the straight-line distance between suburb centres, labelled as that — and the place
 * arrives with the acceptance. A card that showed the suburb before she said yes would have told every
 * nurse who was asked where a patient lives.
 *
 * WHAT THE VISIT REFUSES, ON THE SCREEN RATHER THAN IN A LOG. The code at both ends, the checklist
 * under a draft protocol, a handover before the encounter is signed, and the patient's view of where
 * the nurse is once the visit is done — each in the route's or the contract's own words, read from
 * lib/care-visit rather than typed here, beside the control that was refused. */

const clock = (iso: string) =>
 new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const statusName = (id: string) => protocolsContract.statuses.find(status => status.id === id)?.name ?? id;
const service = services.find(s => s.id === preview.serviceId)!;
const visitZone = zoneById(preview.zone)!;

/* The day's own tick: an offer lapses on the clock, and the minutes left on the card move with it.
   Fifteen seconds is the schedule's refresh already; a countdown that ticked every second would be a
   number animating for no decision anybody makes in a second. */
function useCareTick() {
 useEffect(() => { const timer = window.setInterval(tick, 15_000); return () => window.clearInterval(timer); }, []);
}

/** The offer, on the nurse's day. Off duty, no new offer is shown; a visit she has already taken still is. */
export function CareOfferSlot({ open, available }: { open: (modal: string) => void; available: boolean }) {
 const view = useCareVisit();
 useCareTick();
 const { offer, visit } = view;

 if (visit?.state === 'completed') return <section className="care-slot is-done" aria-labelledby="care-slot-title">
  <span className="care-eyebrow">Visit {preview.appointmentRef} · complete</span>
  <h2 id="care-slot-title">{service.name}, {visitZone.name}</h2>
  <p className="care-note"><BadgeCheck size={16} aria-hidden="true"/>{sentences.billable}</p>
 </section>;

 if (visit) return <section className="care-slot is-held" aria-labelledby="care-slot-title">
  <div className="care-slot-say">
   <span className="care-eyebrow">You accepted · {preview.appointmentRef}</span>
   <h2 id="care-slot-title">{service.name}, {visitZone.name}</h2>
   <p className="care-when">Today at {clock(visit.scheduledFor)} · {service.duration} min</p>
  </div>
  <button className="primary" onClick={() => open('Care visit')}>Continue this visit<ArrowRight size={16} aria-hidden="true"/></button>
 </section>;

 if (!available) return null;

 if (offer?.state === 'open') {
  const left = Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - view.now) / 60_000));
  const marker = markerFor(offer.continuity);
  return <section className="care-slot care-offer" aria-labelledby="care-slot-title">
   <div className="care-slot-say">
    <span className="care-eyebrow">A visit offered to you</span>
    <h2 id="care-slot-title">{service.name}</h2>
    {marker && <p className="care-marker"><BadgeCheck size={15} aria-hidden="true"/>{marker}</p>}
   </div>
   <dl className="care-facts">
    <div><dt>When</dt><dd>Today, {view.scheduledFor ? clock(view.scheduledFor) : ''}<small>{service.duration} min</small></dd></div>
    <div><dt>How far</dt><dd>{offer.distanceKm.toFixed(1)} km<small>{sentences.distanceBasis}</small></dd></div>
    <div><dt>Lapses</dt><dd>{clock(offer.expiresAt)}<small>{left === 0 ? 'Now' : `In ${left} min`}</small></dd></div>
   </dl>
   <p className="care-note">Where the patient lives is shown to the nurse who accepts, and to nobody else who was asked.</p>
   <NotConnected of="booking" tone="inline"/>
   {view.refusal && <p className="care-refusal" role="alert">{view.refusal.statement}</p>}
   <div className="button-row care-actions">
    <button className="secondary" onClick={decline}>Decline</button>
    <button className="primary" onClick={accept}>Accept this visit<ArrowRight size={16} aria-hidden="true"/></button>
   </div>
  </section>;
 }

 if (offer && (offer.state === 'declined' || offer.state === 'lapsed')) return <section className="care-slot is-quiet" aria-labelledby="care-slot-title">
  <span className="care-eyebrow">{offer.state === 'declined' ? 'You declined' : 'Offer lapsed'} · {service.name}</span>
  <p id="care-slot-title" role="status">{offer.state === 'declined' ? sentences.declined : sentences.lapsed}</p>
 </section>;

 if (view.withheld) return <section className="care-slot is-quiet" aria-labelledby="care-slot-title">
  <span className="care-eyebrow">No visit offered to you</span>
  <p id="care-slot-title">{view.withheld}</p>
  <p className="care-note">{sentences.withheldIsNotLast}</p>
 </section>;

 return null;
}

/** The visit, from the road to the doctor's queue to its completion. */
export function CareVisit({ open, onClose }: { open: (modal: string) => void; onClose: () => void }) {
 const view = useCareVisit();
 useCareTick();
 const [code, setCode] = useState('');
 const visit = view.visit;
 /* A new stage starts at the top of the sheet. The route stage is tall with its map and the code stage
    is short, so a dialog that kept its scroll offset put the nurse half-way down a screen that had just
    changed under her thumb — and on a phone the next tap landed outside the sheet and closed it. */
 useEffect(() => {
  document.querySelector('dialog[open] .care-visit')?.closest('dialog')?.scrollTo({ top: 0 });
 }, [view.stage, visit?.state]);

 if (!visit) return <div className="care-visit">
  <p className="care-note">There is no visit to continue. An offer is accepted from your day, and the visit opens here once you have.</p>
  <div className="button-row"><button className="primary" onClick={onClose}>Back to your day</button></div>
 </div>;

 const done = visit.state === 'completed';
 const at = stages.findIndex(s => s.id === view.stage);
 const refusalFor = (act: string) => view.refusal?.act === act ? view.refusal.statement : null;
 const nurseBase = nurseById(preview.clinicianRef)?.zone;
 const markers: MapMarker[] = [
  ...(nurseBase ? [{ id: 'you', at: nurseBase.at, kind: 'nurse-busy' as const, label: `You, in ${nurseBase.name}` }] : []),
  { id: 'visit', at: visitZone.at, kind: 'visit-assigned', label: `This visit, in ${visitZone.name}` }
 ];
 const codeStep = (act: 'start' | 'complete', run: (value: string) => void, label: string) => <>
  <label id={`care-${act}-label`} className="care-label"><KeyRound size={15} aria-hidden="true"/>Visit code</label>
  <p className="care-note" id={`care-${act}-hint`}>Ask the patient for the six-digit code in the MyThuso app. In this preview the code is {preview.visitCode}.</p>
  <CodeInput value={code} onChange={v => setCode(v)} label="Visit code" describedBy={`care-${act}-hint care-${act}-said`} invalid={Boolean(refusalFor(act))}/>
  <p className="care-refusal-line" id={`care-${act}-said`} role="status">{refusalFor(act) ?? ''}</p>
  <div className="button-row care-actions">
   <button className="primary" disabled={code.length < 6} onClick={() => { run(code); setCode(''); }}>{label}<ArrowRight size={16} aria-hidden="true"/></button>
  </div>
 </>;

 return <div className="care-visit">
  <header className="care-visit-head">
   <span className="care-eyebrow">Visit {preview.appointmentRef} · {visitZone.name}</span>
   <h3>{service.name}, today at {clock(visit.scheduledFor)}</h3>
   <NotConnected of="booking" tone="inline"/>
  </header>

  <ol className="care-rail" aria-label="Stages of this visit">{stages.map((s, i) => {
   const behind = done || i < at;
   return <li key={s.id} className={behind ? 'is-done' : i === at ? 'is-now' : ''} aria-current={!done && i === at ? 'step' : undefined}>
    <span className="care-rail-mark" aria-hidden="true">{behind ? <Check size={13}/> : i + 1}</span>
    <span className="care-rail-name">{s.name}{behind && <span className="care-vh">, done</span>}</span>
   </li>;
  })}</ol>

  <section className="care-stage" aria-labelledby="care-stage-title">
   {done ? <>
    <h4 id="care-stage-title">The visit is complete</h4>
    <p className="care-fact" role="status"><BadgeCheck size={17} aria-hidden="true"/>{sentences.billable}</p>
    <p className="care-note"><Route size={15} aria-hidden="true"/>{view.location.shared ? sentences.whileShared : view.location.statement}</p>
    <div className="button-row care-actions"><button className="primary" onClick={onClose}>Back to your day</button></div>
   </>

   : view.stage === 'route' ? <>
    <h4 id="care-stage-title">On the way to {visitZone.name}</h4>
    <NotConnected of="dispatch" tone="inline"/>
    <div className="care-map">
     <LiveMap markers={markers} height={220} link={nurseBase ? { from: nurseBase.at, to: visitZone.at } : null}
      summary={`Schematic map. ${nurseBase ? `You are drawn at the centre of ${nurseBase.name} and this visit at the centre of ${visitZone.name}, joined by a straight dashed line.` : `This visit is drawn at the centre of ${visitZone.name}.`}`}/>
    </div>
    {view.offer && <p className="care-fact"><Route size={16} aria-hidden="true"/>{view.offer.distanceKm.toFixed(1)} km · {sentences.distanceBasis}</p>}
    <p className="care-note">{view.location.shared ? sentences.whileShared : view.location.statement}</p>
    <div className="button-row care-actions"><button className="primary" onClick={() => goTo('start')}>I am at the door<ArrowRight size={16} aria-hidden="true"/></button></div>
   </>

   : view.stage === 'start' ? <>
    <h4 id="care-stage-title">Confirm you are at the right door</h4>
    {codeStep('start', start, 'Start the visit')}
   </>

   : view.stage === 'checklist' ? <>
    <h4 id="care-stage-title">Checklist</h4>
    <ul className="care-protocols">{view.checklist.protocols.map(p => <li key={p.reference}>
     <ClipboardList size={17} aria-hidden="true"/>
     <span><strong>{p.name}</strong><small>Version {p.version}</small></span>
     <span className="care-status">{statusName(p.status)}</span>
    </li>)}</ul>
    {view.checklist.refusal && <div className="care-refusal" role="note">
     <ShieldCheck size={18} aria-hidden="true"/>
     <span><strong>{view.checklist.refusal}</strong>{view.checklist.why && <small>{view.checklist.why}</small>}</span>
    </div>}
    <div className="button-row care-actions"><button className="primary" onClick={() => goTo('record')}>Continue to readings and sign-off<ArrowRight size={16} aria-hidden="true"/></button></div>
   </>

   : view.stage === 'record' ? <>
    <h4 id="care-stage-title">Readings and sign-off</h4>
    <NotConnected of="clinical-records" tone="inline"/>
    <p className="care-note">{sentences.record}</p>
    <p className="care-fact">{view.signedOff
     ? <><BadgeCheck size={17} aria-hidden="true"/>Signed off on this device.</>
     : <><Clock3 size={17} aria-hidden="true"/>Not signed off yet.</>}</p>
    <div className="button-row care-actions">
     {!view.signedOff && <button className="secondary" onClick={() => open('Care assessment')}>Open the visit assessment</button>}
     <button className="primary" onClick={attachReadings}>Continue to handover<ArrowRight size={16} aria-hidden="true"/></button>
    </div>
   </>

   : view.stage === 'handover' ? <>
    <h4 id="care-stage-title">Hand to a doctor</h4>
    <NotConnected of="doctor-review" tone="inline"/>
    {refusalFor('handover') && <p className="care-refusal" role="alert">{refusalFor('handover')}</p>}
    <div className="button-row care-actions">
     {refusalFor('handover') && <button className="secondary" onClick={() => open('Care assessment')}>Open the visit assessment</button>}
     <button className="primary" onClick={handOver}>Hand to a doctor<ArrowRight size={16} aria-hidden="true"/></button>
    </div>
   </>

   : <>
    <h4 id="care-stage-title">Complete with the code</h4>
    {/* "Handed to the doctors' review queue" is only true beside the sentence that says nobody reads it yet. */}
    {visit.handover && <><p className="care-fact"><Check size={17} aria-hidden="true"/>{sentences.queued}</p><NotConnected of="doctor-review" tone="inline"/></>}
    {codeStep('complete', complete, 'Complete the visit')}
   </>}
  </section>
 </div>;
}
