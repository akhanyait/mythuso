import { useState } from 'react';
import { Ambulance, ArrowRight, Ban, BadgeCheck, Check, CircleAlert, Clock3, Info, MapPin, Phone, Radio, Route, ShieldAlert, ShieldCheck, Timer, TriangleAlert, Undo2, Watch, WifiOff } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { PressSos } from './SosPress';
import { money } from '../lib/catalog';
import {
 alert as alertPlan, alertMonthly, coverage, emergency, failureById, failures, record, redFlags,
 outcomeById, refusals, route, routing, ruleById, rules, standDown, target, targetLabel, targetMinutes,
 visitNurseShare, visitPrice, type Answers, type Door
} from '../lib/sos';
import { can } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';
import { nurseById, placeOf } from '../lib/roster';
import { etaFromRoute, noEta, routeUnavailable, straightLineEta, type Eta, type LatLng } from '../../../../packages/geo/index.ts';

/* Thuso SOS — the emergency pathway.
 *
 * Every other screen in this repository is wrong in ways that cost somebody time or money. This one
 * is wrong in ways that cost somebody their life, so it is built out of four refusals and the
 * ordering of the page is the first of them.
 *
 *   MyThuso is not an ambulance service. 10177 is at the top, above anything MyThuso sells, and it
 *   stays there whatever anybody answers. A screen that offered its own service first and the
 *   ambulance underneath would be asking a frightened person to compare the two, and some of them
 *   would choose wrong. Getting that order right is the whole feature; the rest is detail.
 *
 *   Software does not triage. There are three questions and they route rather than assess. One tick
 *   on the first question ends them — no follow-up, no severity slider, no score — because a
 *   question asked after a red flag exists only to talk somebody out of an ambulance. lib/sos.ts
 *   holds the routing and has no arithmetic in it at all, which is the point.
 *
 *   A target is not a promise. The under-45-minute figure is the duration of the `sos` row in the
 *   service catalogue, and the copy calls it a target every time. It is never shown as an arrival
 *   estimate: arrival estimates come from packages/geo, which says it does not know rather than
 *   printing a plausible number, and the two appear as two different things on every row.
 *
 *   Urgency does not relax vetting. The nurse offered here is gated by can(subject, 'take-visit'),
 *   the same call the dispatch board makes, and the refusal is the register's own sentence. The
 *   rota switch below puts a lapsed nurse on the only shift so the refusal can be seen rather than
 *   described. There is no override on this screen because there is no override.
 *
 * Nothing dials. No telephony, no location permission, no dispatch, no ambulance partner, no
 * subscription. The numbers are printed so a person can dial them from their own phone. */

/* Deliberately blunt — three decimal places, about a hundred metres. The suburbs are
   real; nobody lives at these points, and this app has no business being precise about where a
   frightened person is standing. */
const areaPoints: Record<string, LatLng> = {
 Randburg: { lat: -26.099, lng: 28.004 }, Rosebank: { lat: -26.146, lng: 28.042 },
 Parktown: { lat: -26.184, lng: 28.040 }, Melville: { lat: -26.175, lng: 27.999 },
 Soweto: { lat: -26.249, lng: 27.908 }
};
const ELSEWHERE = 'Somewhere else in South Africa';
type OnCall = { id: string; at: LatLng | null };
/* Where an on-call nurse is, from the roster rather than typed beside her id (1 October 2026). The
   rotas held a coordinate of their own for each nurse, a second answer to a question lib/roster.ts's
   placeOf already answers from her suburb — and the one that would have drifted first. A nurse the
   roster will not draw (no position shared, outside coverage, a fix wider than her suburb) is on the
   rota with no position, which is the same thing the dispatch board shows. */
const onCall = (id: string): OnCall => {
 const nurse = nurseById(id);
 const place = nurse ? placeOf(nurse) : null;
 return { id, at: place?.drawn ? place.at : null };
};
/* Two rotas, so the vetting refusal is a thing you can see rather than a paragraph. On the usual
   rota one nurse is sharing no position, which is what a phone in a bag looks like — the roster's
   own N-207, whose phone it says is telling nobody anything. */
const rotas: Record<string, { label: string; note: string; nurses: OnCall[] }> = {
 usual: {
  label: 'The usual rota',
  note: 'Two nurses on call. One phone is not sharing a position, which is what a phone in a bag looks like.',
  nurses: [onCall('N-205'), onCall('N-207')]
 },
 lapsed: {
  label: 'Only Sister Ayanda Dube is on tonight',
  note: 'Her police clearance lapsed nine days ago. This is the rota that tests whether urgency is allowed to lift a check.',
  nurses: [onCall('N-204')]
 }
};

/* No routing provider is connected, and adding one is a decision about a vendor and a key rather
   than a line of code — so every road route comes back unavailable, which is also what a real
   provider returns when it is down. packages/geo refuses to manufacture geometry or a duration from
   that, and the straight line has to be asked for by name, at this call site, and labelled where
   the reader can see it. On this screen that rule matters more than anywhere else in the app: a
   made-up arrival time is what keeps somebody at a window instead of on the phone to 10177. */
function etaFor(nurse: OnCall, to: LatLng | null): Eta {
 const measured = etaFromRoute(routeUnavailable('No routing provider is connected, so no road route can be drawn or timed.'));
 if (measured.minutes !== null) return measured;
 if (!to) return noEta('No address has been chosen yet, so there is nothing to measure to.');
 if (!nurse.at) return noEta('This nurse’s phone is not sharing a position, so there is nothing to measure from.');
 return straightLineEta(nurse.at, to, { sourceLabel: `sos:${nurse.id}` });
}
/* "Estimating" is a word rather than a dash: an empty cell reads as nothing to a screen reader and
   a dash reads as one. The basis follows on the next line in both cases, so no number appears here
   without the thing it was derived from — and the target never stands in for a missing estimate. */
const arrivalLine = (eta: Eta) => eta.minutes === null ? 'Arrival estimating' : `About ${eta.minutes} min away`;
const basisLine = (eta: Eta) =>
 eta.basis === 'straight-line' ? `Straight line over ${(eta.distanceKm ?? 0).toFixed(1)} km at ${eta.speedKmh} km/h — not a road route, and not a promise.`
  : eta.basis === 'route' ? 'Measured road route.'
   : eta.basis === 'last-known-route' ? `Last measured road route, ${Math.round((eta.ageSeconds ?? 0) / 60)} min old.`
    : eta.reason ?? 'Nothing to estimate from.';

/* Always the first thing on the page, and never conditional on anything. */
function EmergencyFirst({ compact = false }: { compact?: boolean }) {
 return <div className={`sos-emergency${compact ? ' compact' : ''}`}>
  <div className="sos-emergency-head"><Ambulance size={26}/><div>
   <strong>{emergency.headline}</strong>
   <p>{emergency.lead}</p>
  </div></div>
  <ul className="sos-numbers">{emergency.numbers.map(n => <li key={n.id}>
   <span className="sos-number"><Phone size={17}/>{n.number}</span>
   <span><strong>{n.name}</strong><small>{n.detail}</small><small className="sos-when">{n.whenToUse}</small></span>
  </li>)}</ul>
  <p className="sos-not-ambulance"><TriangleAlert size={17}/>{emergency.notAnAmbulance}</p>
  <p className="sos-preview-note"><Ban size={16}/>{emergency.previewNote}</p>
 </div>;
}

function RedFlagQuestion({ flagged, none, onFlag, onNone }: {
 flagged: string[]; none: boolean; onFlag: (id: string) => void; onNone: () => void;
}) {
 return <fieldset className="panel sos-flags">
  <legend>{redFlags.prompt}</legend>
  <p className="helper">{redFlags.help}</p>
  {redFlags.conditions.map(c => <label key={c.id} className={flagged.includes(c.id) ? 'selected' : ''}>
   <input type="checkbox" checked={flagged.includes(c.id)} onChange={() => onFlag(c.id)}/>
   <span><strong>{c.name}</strong><small>{c.detail}</small></span>
  </label>)}
  <label className={`sos-none${none ? ' selected' : ''}`}>
   <input type="checkbox" checked={none} onChange={onNone}/>
   <span><strong>{redFlags.noneLabel}</strong></span>
  </label>
  <p className="helper"><Info size={15}/>{routing.isNotTriage}</p>
 </fieldset>;
}

/* The two questions that are about reach rather than about the person. Neither of them asks how ill
   anybody is, and there is nowhere on this screen that does. */
function ReachQuestions({ answers, setAnswers }: { answers: Answers; setAnswers: (a: Answers) => void }) {
 const [, where, reach] = routing.questions;
 return <div className="panel sos-reach">
  <label>{where.prompt}
   <select value={answers.area ?? ''} onChange={e => setAnswers({ ...answers, area: e.target.value || null })}>
    <option value="">Choose an area</option>
    {coverage.areas.map(a => <option key={a} value={a}>{a}</option>)}
    <option value={ELSEWHERE}>{ELSEWHERE}</option>
   </select>
  </label>
  <p className="helper">{where.help}</p>
  <fieldset className="sos-yesno">
   <legend>{reach.prompt}</legend>
   <label className={answers.canAnswerAPhone === true ? 'selected' : ''}>
    <input type="radio" name="sos-phone" checked={answers.canAnswerAPhone === true} onChange={() => setAnswers({ ...answers, canAnswerAPhone: true })}/><span>Yes</span></label>
   <label className={answers.canAnswerAPhone === false ? 'selected' : ''}>
    <input type="radio" name="sos-phone" checked={answers.canAnswerAPhone === false} onChange={() => setAnswers({ ...answers, canAnswerAPhone: false })}/><span>No</span></label>
  </fieldset>
  <p className="helper">{reach.help}</p>
 </div>;
}

function FailureCard({ id, tone = 'panel' }: { id: string; tone?: string }) {
 const f = failureById(id);
 return <div className={`${tone} sos-failure`}>
  <div className="sos-failure-head"><CircleAlert size={20}/><strong>{f.name}</strong></div>
  <p>{f.what}</p>
  <p className="sos-instead"><ArrowRight size={15}/>{f.instead}</p>
 </div>;
}

export function ThusoSos() {
 const [answers, setAnswers] = useState<Answers>({ flagged: [], area: null, canAnswerAPhone: null });
 const [none, setNone] = useState(false);
 const [rotaId, setRotaId] = useState('usual');
 const [openNow, setOpenNow] = useState(true);
 /* Which nurse was asked, not merely that somebody was. A boolean here marked every cleared nurse on
    the rota as "Asked" the moment one of them was — on a screen where the whole question is who is
    coming, that is the interface telling a frightened person something untrue about who is on their
    way. */
 const [requested, setRequested] = useState<string | null>(null);
 const [stoodDown, setStoodDown] = useState<string | null>(null);
 const [unanswered, setUnanswered] = useState(false);

 const rota = rotas[rotaId];
 const to = answers.area ? areaPoints[answers.area] ?? null : null;
 /* Vetting is asked before a name is offered, not after. A nurse whose clearance lapsed still
    appears — hiding her would leave a reader wondering where she went — and cannot be sent. */
 const candidates = rota.nurses.map(n => {
  const subject = subjectById(n.id)!;
  return { nurse: n, subject, decision: can(subject, 'take-visit'), eta: etaFor(n, to) };
 }).sort((a, b) => Number(b.decision.allowed) - Number(a.decision.allowed) || (a.eta.minutes ?? Infinity) - (b.eta.minutes ?? Infinity));
 const cleared = candidates.some(c => c.decision.allowed);
 const answered = none || answers.flagged.length > 0;
 const door: Door | null = answered ? route(answers, { openNow, cleared }) : null;
 const ready = door?.kind === 'urgent-visit';

 const flag = (id: string) => {
  setNone(false); setRequested(null); setStoodDown(null); setUnanswered(false);
  setAnswers({ ...answers, flagged: answers.flagged.includes(id) ? answers.flagged.filter(f => f !== id) : [...answers.flagged, id] });
 };
 const pickNone = () => {
  setRequested(null); setStoodDown(null); setUnanswered(false);
  setNone(!none); setAnswers({ ...answers, flagged: [] });
 };

 return <div className="sos">
  {/* First, above everything MyThuso sells, and it does not move. The not-connected notice sits
      under it rather than over it: on this one pathway the ambulance number outranks anything
      MyThuso has to say about itself. */}
  <EmergencyFirst/>
  <NotConnected of="emergency"/>
  <p className="helper sos-why-first"><Info size={15}/>{emergency.whyFirst}</p>

  <SectionTitle title="If it is not that, three questions"/>
  <p className="muted">{routing.noAlgorithm}</p>
  <RedFlagQuestion flagged={answers.flagged} none={none} onFlag={flag} onNone={pickNone}/>

  {answers.flagged.length > 0 && <div className="sos-outcome emergency" role="alert">
   <div className="sos-outcome-head"><Ambulance size={24}/><div>
    <strong>{outcomeById('emergency-services').headline}</strong>
    <p>{outcomeById('emergency-services').detail}</p></div></div>
   <ul className="sos-flagged">{answers.flagged.map(id => <li key={id}>{redFlags.conditions.find(c => c.id === id)!.name}</li>)}</ul>
   <p className="sos-ends">{redFlags.endsTheQuestions}</p>
   <div className="sos-dial"><Phone size={20}/><strong>10177</strong><span>Ambulance · or 112 from a mobile</span></div>
   <p className="sos-preview-note"><Ban size={16}/>{emergency.previewNote}</p>
  </div>}

  {none && <>
   <ReachQuestions answers={answers} setAnswers={setAnswers}/>

   <fieldset className="earn-preview-switch sos-switch">
    <legend className="visually-hidden">Which rota is on</legend>
    {Object.entries(rotas).map(([id, r]) => <label key={id} className={rotaId === id ? 'selected' : ''}>
     <input type="radio" name="sos-rota" checked={rotaId === id} onChange={() => { setRotaId(id); setRequested(null); setStoodDown(null); }}/>
     <span>{r.label}</span></label>)}
    <p className="helper">{rota.note}</p>
   </fieldset>
   <fieldset className="earn-preview-switch sos-switch">
    <legend className="visually-hidden">The time of day</legend>
    <label className={openNow ? 'selected' : ''}><input type="radio" name="sos-hours" checked={openNow} onChange={() => { setOpenNow(true); setRequested(null); }}/><span>Now · inside the hours</span></label>
    <label className={!openNow ? 'selected' : ''}><input type="radio" name="sos-hours" checked={!openNow} onChange={() => { setOpenNow(false); setRequested(null); }}/><span>02:10 · outside the hours</span></label>
    <p className="helper">Thuso SOS runs {coverage.hours.days.toLowerCase()} from {coverage.hours.opensAt} to {coverage.hours.closesAt}. {coverage.hours.note}</p>
   </fieldset>
  </>}

  {door?.kind === 'refused' && <div className="sos-outcome refused" role="status">
   <div className="sos-outcome-head"><ShieldAlert size={24}/><div>
    <strong>{outcomeById('cannot-help').headline}</strong>
    <p>{outcomeById('cannot-help').detail}</p></div></div>
   <FailureCard id={door.failureId} tone="sos-failure-inline"/>
   {door.failureId === 'vetting' && candidates.map(c => !c.decision.allowed &&
    <p className="flagged sos-refusal-line" key={c.subject.id}><ShieldAlert size={15}/>{c.subject.name}: {c.decision.reason}</p>)}
   <div className="sos-dial"><Phone size={20}/><strong>10177</strong><span>Ambulance · or 112 from a mobile</span></div>
  </div>}

  {ready && <>
   <div className="sos-outcome offer">
    <div className="sos-outcome-head"><ShieldCheck size={24}/><div>
     <strong>{outcomeById('urgent-visit').headline}</strong>
     <p>{outcomeById('urgent-visit').detail}</p></div></div>
    <div className="review-line"><span>Thuso SOS urgent visit</span><strong>{money(visitPrice)}</strong></div>
    <div className="review-line"><span>Of that, to the nurse</span><strong>{money(visitNurseShare)}</strong></div>
    <div className="review-line"><span>Where</span><strong><MapPin size={14}/> {answers.area}</strong></div>
   </div>

   <div className="panel sos-target">
    <div className="sos-target-head"><Timer size={20}/><strong>{target.title}</strong><Pill tone="amber">{targetLabel}</Pill></div>
    <p>{target.statement}</p>
    <p className="sos-instead"><ArrowRight size={15}/>{target.whenItCannotBeMet}</p>
    <p className="helper"><Info size={15}/>{target.estimateIsNotTheTarget}</p>
   </div>

   <SectionTitle title="Who could come"/>
   <div className="panel">
    <p className="helper" role="status">{candidates.filter(c => c.decision.allowed).length} cleared for this visit{candidates.filter(c => !c.decision.allowed).length ? `, ${candidates.filter(c => !c.decision.allowed).length} refused by vetting` : ''}{candidates.filter(c => c.eta.minutes === null).length ? `, ${candidates.filter(c => c.eta.minutes === null).length} with no arrival estimate` : ''}.</p>
    {candidates.map(({ subject, decision, eta }) => <div className="record-row static" key={subject.id}>
     <span className={`status-dot ${decision.allowed ? '' : 'offline'}`}/>
     <span><strong>{subject.name}</strong><small>{subject.zone} · {subject.reference} · {arrivalLine(eta)}</small>
      <small>{basisLine(eta)}</small>
      {!decision.allowed && <small className="flagged">{decision.reason}</small>}</span>
     {decision.allowed
      ? <button className={requested ? 'secondary' : 'primary'} disabled={requested !== null} onClick={() => setRequested(subject.id)}>{requested === subject.id ? <><Check size={15}/>Asked</> : requested ? 'Somebody else was asked' : 'Ask her to come'}</button>
      : <button className="secondary" disabled aria-label={`Cannot be sent — ${subject.name}. ${decision.reason}`}>Cannot be sent</button>}
    </div>)}
    <p className="helper"><Info size={15}/>{target.arrivalUnknown}</p>
    <div className="privacy-note"><ShieldCheck size={19}/>{ruleById('urgency-does-not-relax-vetting').sentence}</div>
    <div className="privacy-note"><Route size={19}/>No routing provider is connected, so no road route is measured and no arrival time is claimed from one. The straight-line figures above are asked for by name and labelled as what they are.</div>
   </div>
  </>}

  {/* Pressing SOS comes after the numbers and after the door the answers pointed to, never before either. */}
  {door && <PressSos answers={answers}/>}

  {requested && <>
   <SectionTitle title="Cancelling and standing down"/>
   <div className="panel sos-stand-down">
    <p>{standDown.statement}</p>
    <p className="helper"><Info size={15}/>{standDown.chargeRule}</p>
    {stoodDown === null ? <>
     <div className="button-row sos-reasons">{standDown.reasons.map(r =>
      <button key={r.id} className="secondary" onClick={() => setStoodDown(r.id)}>{r.label}</button>)}</div>
     <label className="sos-unanswered">
      <input type="checkbox" checked={unanswered} onChange={() => setUnanswered(!unanswered)}/>
      <span>Nobody answers the callback</span></label>
     {unanswered && <div className="sos-holding" role="status"><Radio size={19}/><p>{standDown.noAnswerRule}</p></div>}
    </> : <div className="sos-stood-down" role="status">
     {(() => { const r = standDown.reasons.find(x => x.id === stoodDown)!; return <>
      <div className="sos-outcome-head"><Undo2 size={22}/><div><strong>Stood down · {r.label}</strong><p>{standDown.nurseNote}</p></div></div>
      <div className="review-line"><span>What the nurse is told</span><strong>{r.nurseIsTold}</strong></div>
      <div className="review-line"><span>What is recorded</span><strong>{r.recorded}</strong></div>
      <button className="text-button" onClick={() => setStoodDown(null)}><Undo2 size={15}/>Back</button>
     </>; })()}
    </div>}
   </div>
  </>}

  <SectionTitle title="When this does not work"/>
  <p className="muted">Four ways a button like this fails and one way vetting stops it. Each says what to do instead, because a failure screen without one is a dead end wearing an apology.</p>
  <div className="sos-failures">{failures.map(f => <div className="panel sos-failure" key={f.id}>
   <div className="sos-failure-head">{f.id === 'no-signal' ? <WifiOff size={20}/> : f.id === 'outside-hours' ? <Clock3 size={20}/> : f.id === 'outside-coverage' ? <MapPin size={20}/> : f.id === 'vetting' ? <ShieldAlert size={20}/> : <CircleAlert size={20}/>}<strong>{f.name}</strong></div>
   <p>{f.what}</p>
   <p className="sos-instead"><ArrowRight size={15}/>{f.instead}</p>
  </div>)}</div>

  <SectionTitle title="Where and when"/>
  <div className="panel sos-coverage">
   <p>{coverage.statement}</p>
   <ul className="sos-areas">{coverage.areas.map(a => <li key={a}><MapPin size={14}/>{a}</li>)}</ul>
   <div className="review-line"><span>Hours</span><strong><Clock3 size={14}/> {coverage.hours.days}, {coverage.hours.opensAt}–{coverage.hours.closesAt}</strong></div>
   <p className="helper">{coverage.hours.note}</p>
   <p className="helper"><Info size={15}/>{coverage.honestNote}</p>
  </div>

  <SectionTitle title={`${alertPlan.name} · the panic button`}/>
  <div className="panel sos-alert">
   <div className="sos-outcome-head"><Watch size={22}/><div>
    <strong>{alertPlan.name} · {money(alertMonthly)} a month</strong>
    <p>{alertPlan.what}</p></div></div>
   <div className="empty-note">{alertPlan.phaseNote}</div>
   <ul className="sos-honesty">{alertPlan.honesty.map(h => <li key={h.id}><TriangleAlert size={16}/>{h.sentence}</li>)}</ul>
   <p className="earn-rule"><Info size={15}/>{alertPlan.notCover}</p>
  </div>

  <SectionTitle title={record.title}/>
  <div className="panel sos-record">
   <p>{record.statement}</p>
   <ul className="sos-kept">{record.kept.map(k => <li key={k}><BadgeCheck size={16}/>{k}</li>)}</ul>
   <ul className="sos-not-kept">{record.notKept.map(k => <li key={k}><Ban size={16}/>{k}</li>)}</ul>
  </div>

  <SectionTitle title="The promises this screen makes"/>
  <div className="sos-rules">{rules.map(r => <div className="panel sos-rule" key={r.id}>
   <strong>{r.title}</strong><p>{r.sentence}</p></div>)}</div>

  <SectionTitle title="What this screen will not do"/>
  <div className="earn-refusals">{refusals.map(r =>
   <div className="earn-refusal" key={r.id}><Ban size={19}/><p>{r.sentence}</p></div>)}</div>
  <EmptyNote>Nothing here is transmitted, dispatched or dialled. No ambulance partner is contracted, no nurse is paged, no location is read from this device and Thuso Alert does not exist. The target of {targetMinutes} minutes, the price and the nurse's share are the service catalogue's own figures for the {money(visitPrice)} Thuso SOS visit.</EmptyNote>
 </div>;
}
