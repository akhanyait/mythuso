import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, BadgeCheck, Check, ClipboardList, Clock3, KeyRound, Route, ShieldAlert, ShieldCheck } from 'lucide-react';
import protocolsContract from '../../../../packages/catalog/protocols.json' with { type: 'json' };
import { NotConnected } from '../components/NotConnected';
import { CalibrationTag, ProvenanceTag } from '../components/Provenance';
import { CodeInput } from '../components/Steps';
import { LiveMap, type MapMarker } from '../map/LiveMap';
import { services } from '../lib/catalog';
import { zoneById } from '../lib/geography';
import { nurseById } from '../lib/roster';
import { timezone } from '../lib/scheduling';
import type { Capture } from '../lib/capture';
import {
 accept, attachReadings, complete, decline, goTo, handOver, markerFor, notClinicallyReviewed, preview, scopeNotReviewedFor, sentences, stages, start, tick, useCareVisit,
 type CareView
} from '../lib/care-visit';
import { Alert, Badge, Button, Card, MyThusoHealthIcon, MyThusoVisitIcon } from '../ui';
import { CashAtTheDoor } from './CashCode';
import { useVisitQueue } from './VisitQueue';
import './care-visit.css';
import '../surface/nurse-identity.css';

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

/* Where a device reading came from, how good the sample was and whether it carries clinical weight, from the
   Devices registry — behind a dynamic import for the reason Thuso Kit gives: the registry carries every
   engine's settings, and nothing on the nurse's day needs it until she reaches the readings. */
const CaptureSource = lazy(() => import('./Devices').then(m => ({ default: m.CaptureSource })));

const clock = (iso: string) =>
 new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const statusName = (id: string) => protocolsContract.statuses.find(status => status.id === id)?.name ?? id;
const service = services.find(s => s.id === preview.serviceId)!;
const visitZone = zoneById(preview.zone)!;
type Visit = NonNullable<CareView['visit']>;

/* The day's own tick: an offer lapses on the clock, and the minutes left on the card move with it.
   Fifteen seconds is the schedule's refresh already; a countdown that ticked every second would be a
   number animating for no decision anybody makes in a second. */
function useCareTick() {
 useEffect(() => { const timer = window.setInterval(tick, 15_000); return () => window.clearInterval(timer); }, []);
}

/* WAVE 4B, ON THE IDENTITY. The offer is a white Card on her day with the visit's own mark, the facts in
   three real columns, and one aqua action — accepting is the decision the card is for. The visit is the
   handoff's field-visit screen, built only from what the build holds:
     the booked time — a fill from the moment the code opened the visit, against the service's booked
       duration in services.json, with the minutes in words beside it;
     the stages — a progress rail, aqua behind her, the current stage ringed, each named;
     the map — the schematic LiveMap already draws, dressed with the handoff's ground, and its straight
       dashed line, which is still a measurement and never a road route;
     the readings — the ones this visit's signed assessment holds on the phone, each with where it came
       from and, for an instrument's, whether it carries clinical weight in the Devices contract's words;
     the patient — what the visit knows about them, and a trend only when the record holds two or more
       readings of one measure for this visit. It does not in this preview, and the card says so rather
       than drawing a line through one point. */

/** The offer, on the nurse's day. Off duty, no new offer is shown; a visit she has already taken still is. */
export function CareOfferSlot({ open, available }: { open: (modal: string) => void; available: boolean }) {
 const view = useCareVisit();
 useCareTick();
 const { offer, visit } = view;

 if (visit?.state === 'completed') return <Card role="region" aria-labelledby="care-slot-title" className="care-slot nurse-offer is-done nurse-ui">
  <span className="nurse-eyebrow">Visit {preview.appointmentRef} · complete</span>
  <h2 id="care-slot-title" className="nurse-offer__name">{service.name}, {visitZone.name}</h2>
  <p className="nurse-offer__fact"><BadgeCheck aria-hidden="true"/>{sentences.billable}</p>
 </Card>;

 if (visit) return <Card role="region" aria-labelledby="care-slot-title" className="care-slot nurse-offer is-held nurse-ui">
  <span className="nurse-offer__icon" aria-hidden="true"><MyThusoVisitIcon/></span>
  <div className="nurse-offer__say">
   <span className="nurse-eyebrow">You accepted · {preview.appointmentRef}</span>
   <h2 id="care-slot-title" className="nurse-offer__name">{service.name}, {visitZone.name}</h2>
   <p className="nurse-offer__when">Today at {clock(visit.scheduledFor)} · {service.duration} min</p>
  </div>
  <Button variant="accent" onClick={() => open('Care visit')} trailingIcon={<ArrowRight aria-hidden="true"/>}>Continue this visit</Button>
 </Card>;

 if (!available) return null;

 if (offer?.state === 'open') {
  const left = Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - view.now) / 60_000));
  const marker = markerFor(offer.continuity);
  return <Card role="region" aria-labelledby="care-slot-title" className="care-slot care-offer nurse-offer nurse-ui">
   <div className="nurse-offer__top">
    <span className="nurse-offer__icon" aria-hidden="true"><MyThusoVisitIcon animated/></span>
    <div className="nurse-offer__say">
     <span className="nurse-eyebrow">A visit offered to you</span>
     <h2 id="care-slot-title" className="nurse-offer__name">{service.name}</h2>
     <div className="nurse-offer__markers">
      {marker && <Badge variant="success"><BadgeCheck aria-hidden="true"/>{marker}</Badge>}
      {/* Who may be offered this service is a setting nobody has clinically reviewed yet. Said beside the
          offer, and never a reason the offer is withheld. */}
      {scopeNotReviewedFor(offer) && <Badge variant="warning"><ShieldAlert aria-hidden="true"/>{notClinicallyReviewed}</Badge>}
     </div>
    </div>
   </div>
   <dl className="care-facts nurse-offer__facts">
    <div><dt>When</dt><dd>Today, {view.scheduledFor ? clock(view.scheduledFor) : ''}<small>{service.duration} min</small></dd></div>
    <div><dt>How far</dt><dd>{offer.distanceKm.toFixed(1)} km<small>{sentences.distanceBasis}</small></dd></div>
    <div><dt>Lapses</dt><dd>{clock(offer.expiresAt)}<small>{left === 0 ? 'Now' : `In ${left} min`}</small></dd></div>
   </dl>
   <p className="nurse-offer__note">Where the patient lives is shown to the nurse who accepts, and to nobody else who was asked.</p>
   <NotConnected of="booking" tone="inline"/>
   {view.refusal && <p className="nurse-refusal" role="alert">{view.refusal.statement}</p>}
   <div className="nurse-actions">
    <Button variant="secondary" onClick={decline}>Decline</Button>
    <Button variant="accent" onClick={accept} trailingIcon={<ArrowRight aria-hidden="true"/>}>Accept this visit</Button>
   </div>
  </Card>;
 }

 if (offer && (offer.state === 'declined' || offer.state === 'lapsed')) return <section className="care-slot nurse-offer is-quiet" aria-labelledby="care-slot-title">
  <span className="nurse-eyebrow">{offer.state === 'declined' ? 'You declined' : 'Offer lapsed'} · {service.name}</span>
  <p id="care-slot-title" role="status">{offer.state === 'declined' ? sentences.declined : sentences.lapsed}</p>
 </section>;

 if (view.withheld) return <section className="care-slot nurse-offer is-quiet" aria-labelledby="care-slot-title">
  <span className="nurse-eyebrow">No visit offered to you</span>
  <p id="care-slot-title">{view.withheld}</p>
  <p className="nurse-offer__note">{sentences.withheldIsNotLast}</p>
 </section>;

 return null;
}

/* The booked time, filled from the moment the code opened the visit. Arithmetic on two instants the Care
   engine holds and the service's booked duration — nothing here is a timer of its own, and the fill moves
   on the screen's fifteen-second tick like everything else on it. Past the booked time the fill is full
   and the words say by how much, because a bar that silently stops is a bar that has stopped telling her. */
function BookedTime({ visit, now }: { visit: Visit; now: number }) {
 const booked = service.duration;
 const started = visit.startedAt ? Date.parse(visit.startedAt) : null;
 const ended = visit.completedAt ? Date.parse(visit.completedAt) : null;
 const minutes = started === null ? 0 : Math.max(0, Math.floor(((ended ?? now) - started) / 60_000));
 const over = minutes - booked;
 const words = started === null ? `Not started · booked for ${booked} min from ${clock(visit.scheduledFor)}`
  : `Started ${clock(visit.startedAt!)} · ${ended ? `finished after ${minutes}` : minutes} of ${booked} booked minutes${over > 0 ? ` · ${over} min past the booked time` : ''}`;
 return <div className={`nurse-booked${over > 0 ? ' is-over' : ''}`}>
  <div className="nurse-booked__say"><span className="nurse-eyebrow">Booked time</span><span className="nurse-booked__words">{words}</span></div>
  <span className="nurse-booked__track" aria-hidden="true"><i style={{ '--share': Math.min(1, minutes / booked) } as CSSProperties}/></span>
 </div>;
}

/* One reading this visit's assessment holds. The value is the largest thing on the row; where it came from
   is the line under it — the provenance, the calibration caveat when there is one, and, for an instrument's
   reading, the Devices registry's source, sample and clinical weight. */
function ReadingRow({ reading }: { reading: Capture }) {
 return <li className="nurse-reading">
  <div className="nurse-reading__value"><small>{reading.label}</small><strong>{reading.value}<i>{reading.unit}</i></strong></div>
  <div className="nurse-reading__tags">
   <ProvenanceTag source={{ provenance: reading.provenance, serial: reading.serial, by: reading.byName, saidBy: reading.saidBy, inputs: reading.inputs }}/>
   <CalibrationTag source={{ provenance: reading.provenance, serial: reading.serial, calibration: reading.calibration }}/>
   {reading.provenance === 'device' && <Suspense fallback={null}><CaptureSource serial={reading.serial} quality={reading.quality} simulated={false} takenAt={reading.deviceAt}/></Suspense>}
  </div>
 </li>;
}

/* A line through the readings of one measure, oldest first, scaled to its own range. Drawn only from two
   or more readings the record holds; one reading is a point, not a trend. */
function Trend({ label, unit, values }: { label: string; unit: string; values: number[] }) {
 const low = Math.min(...values), high = Math.max(...values);
 const span = high - low || 1;
 const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - low) / span) * 32}`).join(' ');
 return <figure className="nurse-trend">
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${label}, ${values.length} readings on record, oldest first: ${values.map(v => `${v} ${unit}`).join(', ')}`}>
   <polyline points={points} pathLength={1}/>
  </svg>
  <figcaption><span>{label}</span><span>{values[0]} → {values[values.length - 1]} {unit}</span></figcaption>
 </figure>;
}

/* The patient, as far as this visit knows them: the reference, where, what for, and whether this nurse has
   seen them before. Never a name the build does not hold. */
function PatientCard({ marker, readings }: { marker: string | null; readings: Capture[] }) {
 const byMeasure = new Map<string, Capture[]>();
 for (const reading of readings) byMeasure.set(reading.observationId, [...(byMeasure.get(reading.observationId) ?? []), reading]);
 const trends = [...byMeasure.values()].filter(list => list.length > 1 && list.every(r => Number.isFinite(Number(r.value))));
 return <Card padding="md" className="nurse-patient">
  <div className="nurse-patient__head">
   <span className="nurse-patient__icon" aria-hidden="true"><MyThusoHealthIcon/></span>
   <p className="nurse-patient__title">The patient</p>
  </div>
  <dl className="nurse-facts">
   <div><dt>Visit</dt><dd>{preview.appointmentRef}</dd></div>
   <div><dt>For</dt><dd>{service.name}</dd></div>
   <div><dt>Where</dt><dd>{visitZone.name}</dd></div>
   {marker && <div><dt>Before</dt><dd>{marker}</dd></div>}
  </dl>
  {trends.length
   ? trends.map(list => <Trend key={list[0].observationId} label={list[0].label} unit={list[0].unit}
      values={[...list].sort((a, b) => Date.parse(a.receivedAt ?? a.deviceAt) - Date.parse(b.receivedAt ?? b.deviceAt)).map(r => Number(r.value))}/>)
   : <p className="nurse-patient__empty">No trend. A trend is drawn from two or more readings of one measure in the record, and the record holds {readings.length === 0 ? 'none' : readings.length === 1 ? 'one' : readings.length} from this visit.</p>}
 </Card>;
}

/** The visit, from the road to the doctor's queue to its completion. */
export function CareVisit({ open, onClose }: { open: (modal: string) => void; onClose: () => void }) {
 const view = useCareVisit();
 useCareTick();
 const parts = useVisitQueue();
 const [code, setCode] = useState('');
 const visit = view.visit;
 /* A new stage starts at the top of the sheet. The route stage is tall with its map and the code stage
    is short, so a dialog that kept its scroll offset put the nurse half-way down a screen that had just
    changed under her thumb — and on a phone the next tap landed outside the sheet and closed it. */
 useEffect(() => {
  document.querySelector('dialog[open] .care-visit')?.closest('dialog')?.scrollTo({ top: 0 });
 }, [view.stage, visit?.state]);

 if (!visit) return <div className="care-visit nurse-field nurse-ui">
  <p className="nurse-offer__note">There is no visit to continue. An offer is accepted from your day, and the visit opens here once you have.</p>
  <div className="nurse-actions"><Button variant="primary" onClick={onClose}>Back to your day</Button></div>
 </div>;

 const done = visit.state === 'completed';
 const at = stages.findIndex(s => s.id === view.stage);
 const refusalFor = (act: string) => view.refusal?.act === act ? view.refusal.statement : null;
 const nurseBase = nurseById(preview.clinicianRef)?.zone;
 const markers: MapMarker[] = [
  ...(nurseBase ? [{ id: 'you', at: nurseBase.at, kind: 'nurse-busy' as const, label: `You, in ${nurseBase.name}` }] : []),
  { id: 'visit', at: visitZone.at, kind: 'visit-assigned', label: `This visit, in ${visitZone.name}` }
 ];
 /* The readings this visit's assessment holds on the phone, and of them the ones that reached the record —
    the only ones a trend may be drawn through. */
 const held = parts.filter(p => p.visit === preview.appointmentRef && p.kind === 'observations').flatMap(p => p.readings ?? []);
 const onRecord = parts.filter(p => p.visit === preview.appointmentRef && p.kind === 'observations' && p.state === 'stored').flatMap(p => p.readings ?? []);
 const codeStep = (act: 'start' | 'complete', run: (value: string) => void, label: string) => <div className="nurse-code">
  <label id={`care-${act}-label`} className="nurse-code__label"><KeyRound aria-hidden="true"/>Visit code</label>
  <p className="nurse-offer__note" id={`care-${act}-hint`}>Ask the patient for the six-digit code in the MyThuso app. In this preview the code is {preview.visitCode}.</p>
  <CodeInput value={code} onChange={v => setCode(v)} label="Visit code" describedBy={`care-${act}-hint care-${act}-said`} invalid={Boolean(refusalFor(act))}/>
  <p className="nurse-refusal-line" id={`care-${act}-said`} role="status">{refusalFor(act) ?? ''}</p>
  <div className="nurse-actions">
   <Button variant="accent" disabled={code.length < 6} onClick={() => { run(code); setCode(''); }} trailingIcon={<ArrowRight aria-hidden="true"/>}>{label}</Button>
  </div>
 </div>;

 return <div className="care-visit nurse-field nurse-ui">
  <header className="nurse-field__intro">
   <span className="nurse-eyebrow">Visit {preview.appointmentRef} · {visitZone.name}</span>
   <h3 className="nurse-field__title">{service.name}, today at {clock(visit.scheduledFor)}</h3>
   <BookedTime visit={visit} now={view.now}/>
   <NotConnected of="booking" tone="inline"/>
  </header>

  <ol className="nurse-rail" aria-label="Stages of this visit">{stages.map((s, i) => {
   const behind = done || i < at;
   return <li key={s.id} className={behind ? 'is-done' : i === at ? 'is-now' : ''} aria-current={!done && i === at ? 'step' : undefined}>
    <span className="nurse-rail__mark" aria-hidden="true">{behind ? <Check/> : i + 1}</span>
    <span className="nurse-rail__name">{s.name}{behind && <span className="visually-hidden">, done</span>}</span>
   </li>;
  })}</ol>

  <section className="nurse-field__stage" aria-labelledby="care-stage-title">
   {done ? <>
    <h4 id="care-stage-title">The visit is complete</h4>
    <p className="nurse-fact" role="status"><BadgeCheck aria-hidden="true"/>{sentences.billable}</p>
    <p className="nurse-offer__note"><Route aria-hidden="true"/>{view.location.shared ? sentences.whileShared : view.location.statement}</p>
    {/* Cash is recorded only against a completed visit, so the code is asked for here and nowhere earlier. */}
    <CashAtTheDoor/>
    <div className="nurse-actions"><Button variant="primary" onClick={onClose}>Back to your day</Button></div>
   </>

   : view.stage === 'route' ? <>
    <h4 id="care-stage-title">On the way to {visitZone.name}</h4>
    <NotConnected of="dispatch" tone="inline"/>
    {/* The simulated map the build already draws, on the handoff's ground. The blocks and roads behind it
        are texture, drawn nowhere in particular, and the line between the two pins is the straight
        measurement it always was — it crosses the roads rather than following them, which is the point. */}
    <div className="care-map nurse-map-panel">
     <LiveMap markers={markers} height={240} surface="staff" link={nurseBase ? { from: nurseBase.at, to: visitZone.at } : null}
      summary={`Schematic map. ${nurseBase ? `You are drawn at the centre of ${nurseBase.name} and this visit at the centre of ${visitZone.name}, joined by a straight dashed line.` : `This visit is drawn at the centre of ${visitZone.name}.`}`}/>
    </div>
    {view.offer && <p className="nurse-fact"><Route aria-hidden="true"/>{view.offer.distanceKm.toFixed(1)} km · {sentences.distanceBasis}</p>}
    <p className="nurse-offer__note">{view.location.shared ? sentences.whileShared : view.location.statement}</p>
    <div className="nurse-actions"><Button variant="accent" onClick={() => goTo('start')} trailingIcon={<ArrowRight aria-hidden="true"/>}>I am at the door</Button></div>
   </>

   : view.stage === 'start' ? <>
    <h4 id="care-stage-title">Confirm you are at the right door</h4>
    {codeStep('start', start, 'Start the visit')}
   </>

   : view.stage === 'checklist' ? <>
    <h4 id="care-stage-title">Checklist</h4>
    <ul className="nurse-checklist">{view.checklist.protocols.map(p => <li key={p.reference}>
     <span className="nurse-checklist__icon" aria-hidden="true"><ClipboardList/></span>
     <span className="nurse-checklist__name"><strong>{p.name}</strong><small>Version {p.version}</small></span>
     <Badge size="sm" variant={p.status === 'ratified' ? 'success' : p.status === 'draft' ? 'warning' : 'neutral'}>{statusName(p.status)}</Badge>
    </li>)}</ul>
    {view.checklist.refusal && <Alert variant="warning" title={view.checklist.refusal} icon={<ShieldCheck aria-hidden="true"/>} className="nurse-checklist__refusal">
     {view.checklist.why}
    </Alert>}
    <div className="nurse-actions"><Button variant="accent" onClick={() => goTo('record')} trailingIcon={<ArrowRight aria-hidden="true"/>}>Continue to readings and sign-off</Button></div>
   </>

   : view.stage === 'record' ? <>
    <h4 id="care-stage-title">Readings and sign-off</h4>
    <NotConnected of="clinical-records" tone="inline"/>
    <p className="nurse-offer__note">{sentences.record}</p>
    <p className="nurse-fact">{view.signedOff
     ? <><BadgeCheck aria-hidden="true"/>Signed off on this device.</>
     : <><Clock3 aria-hidden="true"/>Not signed off yet.</>}</p>
    <div className="nurse-field__record">
     <Card padding="md" className="nurse-readings">
      <span className="nurse-eyebrow">This visit’s readings</span>
      {held.length
       ? <ul className="nurse-readings__list">{held.map(reading => <ReadingRow key={reading.id} reading={reading}/>)}</ul>
       : <p className="nurse-patient__empty">No readings for this visit are on this phone yet. They are taken in the visit assessment.</p>}
     </Card>
     <PatientCard marker={view.offer ? markerFor(view.offer.continuity) : null} readings={onRecord}/>
    </div>
    <div className="nurse-actions">
     {!view.signedOff && <Button variant="secondary" onClick={() => open('Care assessment')}>Open the visit assessment</Button>}
     <Button variant="accent" onClick={attachReadings} trailingIcon={<ArrowRight aria-hidden="true"/>}>Continue to handover</Button>
    </div>
   </>

   : view.stage === 'handover' ? <>
    <h4 id="care-stage-title">Hand to a doctor</h4>
    <NotConnected of="doctor-review" tone="inline"/>
    {refusalFor('handover') && <p className="nurse-refusal" role="alert">{refusalFor('handover')}</p>}
    <div className="nurse-actions">
     {refusalFor('handover') && <Button variant="secondary" onClick={() => open('Care assessment')}>Open the visit assessment</Button>}
     <Button variant="accent" onClick={handOver} trailingIcon={<ArrowRight aria-hidden="true"/>}>Hand to a doctor</Button>
    </div>
   </>

   : <>
    <h4 id="care-stage-title">Complete with the code</h4>
    {/* "Handed to the doctors' review queue" is only true beside the sentence that says nobody reads it yet. */}
    {visit.handover && <><p className="nurse-fact"><Check aria-hidden="true"/>{sentences.queued}</p><NotConnected of="doctor-review" tone="inline"/></>}
    {codeStep('complete', complete, 'Complete the visit')}
   </>}
  </section>
 </div>;
}
