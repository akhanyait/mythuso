import { useState } from 'react';
import { CircleAlert, Clock, Radio, ShieldAlert, ShieldX } from 'lucide-react';
import { EmptyNote, Pill } from '../components/UI';
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
const stateTone: Record<string, string> = { forming: 'plain', formed: '', suspended: 'amber' };
const toldTone: Record<string, string> = { 'sentinel-record': 'plain', 'nurse-queue': 'amber', 'core-loop': 'danger' };
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
 if (!patient || !state) return <section className="sn-state form-stack" aria-labelledby="sn-state-heading">
  <h2 id="sn-state-heading" className="section-title">{say.heading}</h2>
  <EmptyNote>{sentinelRefusal('baselines', 'nothing-heard-for-that-patient').statement}</EmptyNote>
 </section>;
 const raise = () => {
  if (!who || rung === null) return;
  const result = raiseTier(patient, entry, rung, who.role, who.ref);
  if (!result.ok) { setRefused(result.refusal); return; }
  setRefused(null);
  setNotice(`${fill(say.raised, { rung: String(result.value.rung), time: when(result.value.raisedAt) })} ${rungOf(result.value.rung)?.whoIsTold ?? ''}`);
  setEntry(''); setRung(null);
 };
 return <section className="sn-state form-stack" aria-labelledby="sn-state-heading">
  <h2 id="sn-state-heading" className="section-title">{say.heading}</h2>
  <p className="helper">{say.intro}</p>
  <p className="sn-patient">{fill(say.patient, { patient })}</p>
  <div className="panel sn-evaluation" role="status">
   <Pill tone="plain">{say.evaluation}</Pill>
   <p>{state.evaluation.sentence}</p>
  </div>
  <ul className="sn-baselines">{state.baselines.map(b => <li key={b.metric} className={`panel sn-baseline sn-${b.stateCode}`} aria-label={measureLabel(b.metric)}>
   <div className="sn-baseline-head"><strong>{measureLabel(b.metric)}</strong><Pill tone={stateTone[b.stateCode]}>{stateOf(b.stateCode)?.label}</Pill></div>
   <p>{fill(say.counted, { counted: String(b.countedSoFar), needed: String(b.neededToForm), days: String(b.windowDays) })}</p>
   <p className="helper">{stateOf(b.stateCode)?.sentence}</p>
   {b.suspendedSince !== null && <p className="helper sn-suspended"><Clock size={13}/><span>{fill(say.suspendedSince, { time: when(b.suspendedSince) })}</span></p>}
   {b.leftByRecall > 0 && <p className="helper"><ShieldX size={13}/><span>{fill(say.leftByRecall, { count: String(b.leftByRecall) })}</span></p>}
   <small>{fill(say.openedUnder, { version: String(b.settingsVersion) })}</small>
  </li>)}</ul>
  <p className="helper"><Clock size={13}/><span>{baselinesSay.suspendedMeans}</span></p>
  <p className="helper"><ShieldX size={13}/><span>{baselinesSay.recalledMeans}</span></p>
  <p className="helper"><Radio size={13}/><span>{fill(say.staleFrom, { interval: staleIntervalText() })}</span></p>

  {who && <form className="panel form-stack sn-raise" aria-labelledby={`sn-raise-heading-${workspace}`} onSubmit={e => { e.preventDefault(); raise(); }}>
   <h3 id={`sn-raise-heading-${workspace}`}>{say.raiseHeading}</h3>
   <p className="helper">{say.raiseIntro}</p>
   <label>{say.entry}<select value={entry} onChange={e => { setEntry(e.target.value); setRefused(null); }}>
    <option value="">Choose…</option>
    {entriesFor(patient).map(r => <option key={r.recordEntryRef} value={r.recordEntryRef}>{measureLabel(r.metric)} · {when(r.heardAt)}</option>)}
   </select></label>
   <fieldset className="sn-rungs"><legend>{say.rung}</legend>
    {rungs.map(r => <label key={r.rung} className="sn-rung">
     <input type="radio" name={`sn-rung-${workspace}`} checked={rung === r.rung} onChange={() => { setRung(r.rung); setRefused(null); }}/>
     <span><strong>{r.label}</strong><small>{r.whoIsTold}</small></span>
    </label>)}
   </fieldset>
   <button className="primary" disabled={!entry || rung === null}>{say.raise}</button>
   {refused && <div className="privacy-note alert" role="alert"><ShieldX size={19}/>{refused.statement}</div>}
   <p className="helper" role="status">{notice}</p>
  </form>}

  <div className="panel sn-refused-tier" role="note" aria-labelledby={`sn-refused-tier-${workspace}`}>
   <h3 id={`sn-refused-tier-${workspace}`}>{say.tierFourHeading}</h3>
   <p>{sentinelRefusal('raise', tierFour.refusal).statement}</p>
   <ul>{tierFour.needs.map(n => <li key={n.id}>{n.sentence}</li>)}</ul>
  </div>

  <h3>{say.raisedList}</h3>
  {state.raised.length ? <ul className="sn-raised">{state.raised.map(d => <li key={d.deviationRef}>
   <Pill tone={toldTone[d.toldCode]}>{rungOf(d.rung)?.label}</Pill>
   <span>{fill(say.raised, { rung: String(d.rung), time: when(d.raisedAt) })} {rungOf(d.rung)?.whoIsTold}</span>
  </li>)}</ul> : <EmptyNote>{say.noneRaised}</EmptyNote>}
  <p className="helper"><Radio size={13}/><span>{sentinelContract.screens.preview}</span></p>
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
 return <section className="sg-report form-stack" aria-labelledby={heading}>
  <h2 id={heading} className="section-title">{report.heading}</h2>
  <p className="helper">{report.intro}</p>
  <p className="sn-patient">{fill(report.patient, { patient })}</p>
  <form className="panel form-stack" onSubmit={e => { e.preventDefault(); record(); }}>
   <label>{report.group}<select value={group} onChange={e => setGroup(e.target.value)}>
    <option value="">Choose…</option>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
   </select></label>
   <label>{report.category}<select value={category} onChange={e => setCategory(e.target.value)}>
    <option value="">Choose…</option>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
   </select></label>
   <p className="helper">{safeguarding.categoryIsProtected}</p>
   <p className="helper">{safeguarding.noNarrative}</p>
   <button className="primary">{report.record}</button>
  </form>
  {refused && <div className="privacy-note alert" role="alert"><ShieldX size={19}/>{refused.statement}</div>}
  {recorded && <div className="panel form-stack sg-recorded" role="status">
   <p><strong>{fill(report.recorded, { time: when(recorded.recordedAt) })}</strong></p>
   <p className="sg-not-sent"><ShieldAlert size={15}/><span>{safeguarding.statutory.notSent}</span></p>
   <p>{safeguarding.statutory.mayApply.find(m => m.group === recorded.groupCode)?.sentence}</p>
   <p>{safeguarding.officer.heldFor}</p>
   <p className="helper">{safeguarding.neverAutoCloses}</p>
   <p className="helper">{safeguarding.reporterNeverShown}</p>
  </div>}
 </section>;
}

/* ---- The desk's list ------------------------------------------------------------------------------ */

export function SafeguardingDesk() {
 useSentinel();
 const rows = safeguardingRowsNow();
 return <section className="sg-desk" aria-labelledby="sg-desk-title">
  <div className="fs-desk-head">
   <h2 id="sg-desk-title">{desk.heading}</h2>
   <p>{desk.intro}</p>
  </div>
  {rows.length === 0 ? <p className="fs-desk-empty">{desk.empty}</p> : <ol className="sg-desk-list">{rows.map(row => <li key={row.reportRef} className="sg-desk-row">
   <div className="fs-row-line">
    <span className="fs-row-kind"><CircleAlert size={13} aria-hidden="true"/>{labelIn(safeguarding.states, row.stateCode)}</span>
    <span className="fs-row-ref">{row.reportRef}</span>
    <span className="fs-row-who"><strong>{labelIn(groups, row.groupCode)}</strong><small>{fill(desk.recordedAgo, { age: String(row.ageMinutes) })}</small></span>
   </div>
   <p className="fs-row-note">{safeguarding.officer.heldFor}</p>
   <p className="fs-row-note sg-not-sent">{safeguarding.statutory.notSent}</p>
  </li>)}</ol>}
  <p className="helper">{safeguarding.guardian}</p>
  <p className="helper"><Radio size={13}/><span>{sentinelContract.screens.preview}</span></p>
 </section>;
}
