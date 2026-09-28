import { useState } from 'react';
import { CircleAlert, Clock, Radio, ShieldAlert, ShieldX } from 'lucide-react';
import { Badge, Button, Card, Field, Select, type BadgeVariant } from '../ui';
import { OfficeNote } from '../surface/Office';
import records from '../../../../packages/catalog/records.json' with { type: 'json' };
import type { Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { categories, groups, rungOf, rungs, sentinelContract, sentinelRefusal, tierFour, type Report } from '../../../../packages/engines/src/safety/domain/sentinel.ts';
import { staleIntervalText } from '../lib/devices';
import { roleOf } from '../lib/roles';
import { entriesFor, raiseTier, recordSafeguarding, safeguardingRowsNow, sentinelPatient, sentinelStateNow, useSentinel } from '../lib/sentinel';
import { subjectById } from '../lib/vetting-fixtures';
import './sentinel.css';

/* Sentinel and safeguarding reports on three screens, and what none of them may say.
 *
 * The nurse and the doctor see a patient's Sentinel state: every baseline, what it holds against the window and minimum
 * it was opened under, whether it is suspended or lost readings to a recall, and that nothing is evaluated — in the
 * contract's sentence, word for word. They may raise a tier by hand, one to three, on a reading Sentinel heard; tier
 * four is not offered, and the sentence it is refused in is shown instead. A clinician or the desk records a
 * safeguarding concern by choosing who it is about and the kind, with nothing typed, and is told it is open, held for
 * an officer nobody holds yet, and not sent. The desk's list shows no kind, no patient and no reporter.
 *
 * Every sentence is packages/catalog/sentinel.json's or packages/catalog/apis/safety.json's; every window and minimum
 * is the baseline's own, kept from the settings in force when it opened; the stale interval is Devices' setting in
 * force. Nothing here types a number that decides anything. This module arrives on a dynamic import, so none of it is
 * on a patient's first load. */

type Workspace = 'nurse' | 'doctor' | 'control-tower';
const say = sentinelContract.screens.sentinel;
const report = sentinelContract.screens.report;
const desk = sentinelContract.screens.desk;
const baselinesSay = sentinelContract.baselines;
const safeguarding = sentinelContract.safeguarding;
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const when = (at: number) => new Date(at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
const measureLabel = (id: string) => records.observations.measures.find(m => m.id === id)?.label ?? id;
const stateOf = (id: string) => baselinesSay.states.find(s => s.id === id);
/* A baseline's state and a raised tier's reach are Badges in the contract's own words; the tint only repeats them. */
const stateTone: Record<string, BadgeVariant> = { forming: 'neutral', formed: 'success', suspended: 'warning' };
const toldTone: Record<string, BadgeVariant> = { 'sentinel-record': 'neutral', 'nurse-queue': 'warning', 'core-loop': 'danger' };
const labelIn = (list: readonly { id: string; label: string }[], id: string) => list.find(x => x.id === id)?.label ?? id;

/* The person on this screen, as the workspace signs them in: the party and the role the vetting fixtures give it. */
function actorOf(workspace: Workspace): { role: string; ref: string } | null {
 const party = roleOf(workspace).subjectId;
 const role = party ? subjectById(party)?.roleId ?? null : null;
 return party && role ? { role, ref: party } : null;
}

/* ---- A patient's Sentinel state ------------------------------------------------------------------- */

export function SentinelState({ workspace }: { workspace: Exclude<Workspace, 'control-tower'> }) {
 useSentinel();
 const who = actorOf(workspace);
 const patient = sentinelPatient();
 const [entry, setEntry] = useState('');
 const [rung, setRung] = useState<number | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const [notice, setNotice] = useState('');
 const state = patient ? sentinelStateNow(patient) : null;
 if (!patient || !state) return <section className="oi-section sn-state" aria-labelledby="sn-state-heading">
  <h2 id="sn-state-heading" className="oi-section-title">{say.heading}</h2>
  <OfficeNote icon={<Radio aria-hidden="true"/>}>{sentinelRefusal('baselines', 'nothing-heard-for-that-patient').statement}</OfficeNote>
 </section>;
 const raise = () => {
  if (!who || rung === null) return;
  const result = raiseTier(patient, entry, rung, who.role, who.ref);
  if (!result.ok) { setRefused(result.refusal); return; }
  setRefused(null);
  setNotice(`${fill(say.raised, { rung: String(result.value.rung), time: when(result.value.raisedAt) })} ${rungOf(result.value.rung)?.whoIsTold ?? ''}`);
  setEntry(''); setRung(null);
 };
 return <section className="oi-section sn-state" aria-labelledby="sn-state-heading">
  <div className="oi-head"><h2 id="sn-state-heading" className="oi-section-title">{say.heading}</h2><p className="oi-lead">{say.intro}</p></div>
  <p className="oi-subtitle sn-patient">{fill(say.patient, { patient })}</p>
  <div className="oi-note sn-evaluation" role="status"><Radio aria-hidden="true"/><span className="oi-stack"><span><Badge>{say.evaluation}</Badge></span><span>{state.evaluation.sentence}</span></span></div>
  <ul className="sn-baselines">{state.baselines.map(b => <li key={b.metric} className={`ui-card ui-card--default ui-card--pad-sm sn-baseline sn-${b.stateCode}`} aria-label={measureLabel(b.metric)}>
   <div className="oi-card-head"><p className="oi-row__title">{measureLabel(b.metric)}</p><Badge variant={stateTone[b.stateCode]}>{stateOf(b.stateCode)?.label}</Badge></div>
   <p className="sn-count">{fill(say.counted, { counted: String(b.countedSoFar), needed: String(b.neededToForm), days: String(b.windowDays) })}</p>
   <p className="oi-help">{stateOf(b.stateCode)?.sentence}</p>
   {b.suspendedSince !== null && <p className="oi-help oi-with-icon sn-suspended"><Clock aria-hidden="true"/><span>{fill(say.suspendedSince, { time: when(b.suspendedSince) })}</span></p>}
   {b.leftByRecall > 0 && <p className="oi-help oi-with-icon"><ShieldX aria-hidden="true"/><span>{fill(say.leftByRecall, { count: String(b.leftByRecall) })}</span></p>}
   <span className="oi-row__meta">{fill(say.openedUnder, { version: String(b.settingsVersion) })}</span>
  </li>)}</ul>
  <div className="oi-stack">
   <p className="oi-help oi-with-icon"><Clock aria-hidden="true"/><span>{baselinesSay.suspendedMeans}</span></p>
   <p className="oi-help oi-with-icon"><ShieldX aria-hidden="true"/><span>{baselinesSay.recalledMeans}</span></p>
   <p className="oi-help oi-with-icon"><Radio aria-hidden="true"/><span>{fill(say.staleFrom, { interval: staleIntervalText() })}</span></p>
  </div>

  {who && <form className="ui-card ui-card--default ui-card--pad-md oi-card-body sn-raise" aria-labelledby={`sn-raise-heading-${workspace}`} onSubmit={e => { e.preventDefault(); raise(); }}>
   <div className="oi-stack"><h3 id={`sn-raise-heading-${workspace}`} className="oi-subtitle">{say.raiseHeading}</h3>
    <p className="oi-help">{say.raiseIntro}</p></div>
   <Field label={say.entry} htmlFor={`sn-entry-${workspace}`}><Select id={`sn-entry-${workspace}`} value={entry} onChange={e => { setEntry(e.target.value); setRefused(null); }}>
    <option value="">Choose…</option>
    {entriesFor(patient).map(r => <option key={r.recordEntryRef} value={r.recordEntryRef}>{measureLabel(r.metric)} · {when(r.heardAt)}</option>)}
   </Select></Field>
   <fieldset className="oi-choices sn-rungs"><legend>{say.rung}</legend>
    {rungs.map(r => <label key={r.rung} className="oi-radio sn-rung">
     <input type="radio" name={`sn-rung-${workspace}`} checked={rung === r.rung} onChange={() => { setRung(r.rung); setRefused(null); }}/>
     <span><strong>{r.label}</strong><small>{r.whoIsTold}</small></span>
    </label>)}
   </fieldset>
   <div className="oi-actions"><Button type="submit" variant="primary" disabled={!entry || rung === null}>{say.raise}</Button></div>
   {refused && <OfficeNote refusal role="alert" icon={<ShieldX aria-hidden="true"/>}>{refused.statement}</OfficeNote>}
   <p className="oi-help" role="status">{notice}</p>
  </form>}

  <div className="oi-note oi-note--refusal sn-refused-tier" role="note" aria-labelledby={`sn-refused-tier-${workspace}`}>
   <ShieldX aria-hidden="true"/>
   <div className="oi-stack">
    <h3 id={`sn-refused-tier-${workspace}`} className="oi-subtitle">{say.tierFourHeading}</h3>
    <p>{sentinelRefusal('raise', tierFour.refusal).statement}</p>
    <ul>{tierFour.needs.map(n => <li key={n.id}>{n.sentence}</li>)}</ul>
   </div>
  </div>

  <h3 className="oi-subtitle">{say.raisedList}</h3>
  {state.raised.length ? <Card><ul className="oi-rows sn-raised">{state.raised.map(d => <li key={d.deviationRef}><div className="oi-row">
   <div className="oi-row__body"><span className="oi-row__meta">{fill(say.raised, { rung: String(d.rung), time: when(d.raisedAt) })} {rungOf(d.rung)?.whoIsTold}</span></div>
   <div className="oi-row__aside"><Badge variant={toldTone[d.toldCode]}>{rungOf(d.rung)?.label}</Badge></div>
  </div></li>)}</ul></Card> : <OfficeNote icon={<Radio aria-hidden="true"/>}>{say.noneRaised}</OfficeNote>}
  <p className="oi-help oi-with-icon"><Radio aria-hidden="true"/><span>{sentinelContract.screens.preview}</span></p>
 </section>;
}

/* ---- Recording a safeguarding concern ------------------------------------------------------------- */

export function SafeguardingReport({ workspace }: { workspace: Workspace }) {
 useSentinel();
 const who = actorOf(workspace);
 const patient = sentinelPatient();
 const [group, setGroup] = useState('');
 const [category, setCategory] = useState('');
 const [recorded, setRecorded] = useState<Report | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 if (!who || !patient) return null;
 /* The button is never disabled: a report without who it is about or its kind is refused in the route's own sentence. */
 const record = () => {
  const result = recordSafeguarding(patient, group, category, who.role, who.ref);
  if (!result.ok) { setRefused(result.refusal); return; }
  setRefused(null); setRecorded(result.value); setGroup(''); setCategory('');
 };
 const heading = `sg-report-heading-${workspace}`;
 return <section className="oi-section sg-report" aria-labelledby={heading}>
  <div className="oi-head"><h2 id={heading} className="oi-section-title">{report.heading}</h2><p className="oi-lead">{report.intro}</p></div>
  <p className="oi-subtitle sn-patient">{fill(report.patient, { patient })}</p>
  <form className="ui-card ui-card--default ui-card--pad-md oi-card-body" onSubmit={e => { e.preventDefault(); record(); }}>
   <div className="oi-form-row">
    <Field label={report.group} htmlFor={`${heading}-group`}><Select id={`${heading}-group`} value={group} onChange={e => setGroup(e.target.value)}>
     <option value="">Choose…</option>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
    </Select></Field>
    <Field label={report.category} htmlFor={`${heading}-category`}><Select id={`${heading}-category`} value={category} onChange={e => setCategory(e.target.value)}>
     <option value="">Choose…</option>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
    </Select></Field>
   </div>
   <p className="oi-help">{safeguarding.categoryIsProtected}</p>
   <p className="oi-help">{safeguarding.noNarrative}</p>
   <div className="oi-actions"><Button type="submit" variant="primary">{report.record}</Button></div>
  </form>
  {refused && <OfficeNote refusal role="alert" icon={<ShieldX aria-hidden="true"/>}>{refused.statement}</OfficeNote>}
  {recorded && <div className="ui-card ui-card--default ui-card--pad-md oi-card-body sg-recorded" role="status">
   <p className="oi-subtitle">{fill(report.recorded, { time: when(recorded.recordedAt) })}</p>
   <p className="oi-with-icon sg-not-sent"><ShieldAlert aria-hidden="true"/><span>{safeguarding.statutory.notSent}</span></p>
   <p>{safeguarding.statutory.mayApply.find(m => m.group === recorded.groupCode)?.sentence}</p>
   <p>{safeguarding.officer.heldFor}</p>
   <p className="oi-help">{safeguarding.neverAutoCloses}</p>
   <p className="oi-help">{safeguarding.reporterNeverShown}</p>
  </div>}
 </section>;
}

/* ---- The desk's list ------------------------------------------------------------------------------ */

export function SafeguardingDesk() {
 useSentinel();
 const rows = safeguardingRowsNow();
 return <section className="oi-section sg-desk" aria-labelledby="sg-desk-title">
  <div className="oi-head"><h2 id="sg-desk-title" className="oi-section-title">{desk.heading}</h2><p className="oi-lead">{desk.intro}</p></div>
  {rows.length === 0 ? <OfficeNote icon={<CircleAlert aria-hidden="true"/>} role="status">{desk.empty}</OfficeNote>
   : <Card><ol className="oi-rows sg-desk-list">{rows.map(row => <li key={row.reportRef} className="sg-desk-row"><div className="oi-row">
    <div className="oi-row__body">
     <span className="sos-row-line"><Badge variant="warning">{labelIn(safeguarding.states, row.stateCode)}</Badge><span className="oi-row__meta">{row.reportRef}</span></span>
     <p className="oi-row__title">{labelIn(groups, row.groupCode)}</p>
     <span className="oi-row__meta">{safeguarding.officer.heldFor}</span>
     <span className="oi-row__meta oi-row__meta--refusal sg-not-sent">{safeguarding.statutory.notSent}</span>
    </div>
    <div className="oi-row__aside"><span className="oi-row__figure oi-row__meta">{fill(desk.recordedAgo, { age: String(row.ageMinutes) })}</span></div>
   </div></li>)}</ol></Card>}
  <p className="oi-help">{safeguarding.guardian}</p>
  <p className="oi-help oi-with-icon"><Radio aria-hidden="true"/><span>{sentinelContract.screens.preview}</span></p>
 </section>;
}
