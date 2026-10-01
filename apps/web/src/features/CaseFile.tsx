import { useId, useState } from 'react';
import { ArrowLeft, ClipboardCheck, FolderOpen, PenLine, Repeat, Send, Stethoscope } from 'lucide-react';
import { guidanceOutcomes, patientWording } from '../../../../packages/engines/src/clinical/domain/contract.ts';
import { devicesContract } from '../../../../packages/engines/src/devices/domain/contract.ts';
import { ConsultationComposer, assessmentFields, type ConsultationDraft } from './Consultation';
import { recordConsultationFor, words as clinicalWords } from '../lib/clinical';
import {
 askDoctor, carriesWeight, caseById, caseRefusalStatement, closable, closeCase, conditionTitle, decideSetting, decided, doctorName, draftBanner, encounterRefOf, fill, listOf, nurseName,
 repeatReading, repeatable, settingKinds, settingLabel, sourceLabel, stateLabel, takeCase, timeOf, unit, useCases, words, type Case, type CaseReading, type SourceId
} from '../lib/case';
import { intakeContract } from '../../../../packages/gilbertone/src/intake.ts';
import { observations } from '../lib/observations';
import { roleOf } from '../lib/roles';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '../ui';
import './case.css';

/* The case file, for the nurse and for the doctor (29 September 2026).
 *
 * WHAT A NURSE SEES. The patient's answers in her order — the intake's, common questions first; what the
 * notes are consistent with, each finding in the wording rule's own form with the knowledge-base entries
 * behind it and the rule beside it; the readings with their source and the weight the Devices domain gives
 * each; the draft banner; where the preview pathway suggests the patient is seen, with its reasons in words;
 * and her three acts — confirm or choose differently with a reason, repeat the reading on an instrument she
 * names, ask the doctor. Nothing is decided until she presses — the emergency suggestion included: such a
 * case opens for her to take like any other, with the emergency answer already given to the patient.
 *
 * WHAT A DOCTOR SEES. The same file, the readings as a trend when there are enough, the nurse's decision, the
 * consultation with the diagnosis field that is hers alone, and the outcome she records on the case. The case
 * closes when she signs, and the plan she wrote under P is what the patient reads.
 *
 * EVERY WORD IS A CONTRACT'S. The sentences are packages/catalog/case.json's; the source and weight words are
 * devices.json's; the wording rule is clinical.json's; the outcomes are clinical.json's; the refusals are the
 * routes' own. Nothing here types a role, a setting, a number or a refusal. Fetched with the workspace on a
 * dynamic import, never on a patient's first load. */

const nurse = words.screens.nurse;
const doctor = words.screens.doctor;
const kitWords = devicesContract.screens.nurse;
const NURSE_SOURCES = words.readings.sources.nurse as readonly SourceId[];

/* The measures' own labels, from the record contract, for the trend and the reading lines. */
const measureLabel = (id: string) => observations.find(o => o.id === id)?.label ?? id;
const [TOP, BOTTOM] = words.readings.measureIds;

const DraftBanner = () => {
 const banner = draftBanner();
 return banner ? <Alert variant="warning" className="cs-banner" title={banner}/> : null;
};

/* One reading: the pair in the record's unit, where it came from, and whether it carries clinical weight —
   devices.json's own sentences, decided by the Devices domain's arithmetic and never here. */
function ReadingRow({ reading }: { reading: CaseReading }) {
 const weight = carriesWeight(reading);
 return <li className="cs-reading">
  <strong className="cs-reading-value">{fill(nurse.readingLine, { value: reading.said, unit: unit() })}</strong>
  <span className="cs-reading-facts">
   <Badge size="sm" variant="neutral">{kitWords.readingSource}: {sourceLabel(reading.source)}</Badge>
   <Badge size="sm" variant={weight ? 'success' : 'warning'}>{weight ? kitWords.carries : kitWords.carriesNot}</Badge>
  </span>
  {reading.marks.map(mark => {
   const found = devicesContract.marks.find(m => m.id === mark);
   return found ? <small className="helper" key={mark}>{found.sentence}</small> : null;
  })}
 </li>;
}

/* The readings as a trend, drawn only through three or more (case.json readings.trendNeeds). Two lines, one
   per measure, each labelled in words at its end and every point carrying its value, so the picture says
   nothing the list does not and colour is never the only thing telling the two apart. Still: a chart of a
   patient's pressure is not decoration. */
function ReadingsTrend({ readings }: { readings: readonly CaseReading[] }) {
 const id = useId();
 const needs = words.readings.trendNeeds;
 if (readings.length < needs) return <p className="helper">{fill(doctor.trendNeeds, { needs: String(needs), count: String(readings.length) })}</p>;
 const W = 320, H = 132, PAD = 18, LEFT = 8, RIGHT = 96;
 const values = readings.flatMap(r => [r.systolic, r.diastolic]);
 const lo = Math.min(...values), hi = Math.max(...values);
 const span = Math.max(hi - lo, 1);
 const x = (i: number) => LEFT + (i * (W - LEFT - RIGHT)) / Math.max(readings.length - 1, 1);
 const y = (v: number) => H - PAD - ((v - lo) * (H - PAD * 2)) / span;
 const line = (pick: (r: CaseReading) => number) => readings.map((r, i) => `${x(i).toFixed(1)},${y(pick(r)).toFixed(1)}`).join(' ');
 return <figure className="cs-trend" aria-labelledby={`${id}-title`}>
  <figcaption id={`${id}-title`} className="cs-trend-title">{doctor.trendHeading}</figcaption>
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${doctor.trendHeading}: ${readings.map(r => r.said).join(', ')}`}>
   <polyline className="cs-trend-line is-top" points={line(r => r.systolic)}/>
   <polyline className="cs-trend-line is-bottom" points={line(r => r.diastolic)}/>
   {readings.map((r, i) => <g key={r.readingRef}>
    <circle className="cs-trend-dot is-top" cx={x(i)} cy={y(r.systolic)} r={3}/>
    <text className="cs-trend-value" x={x(i)} y={y(r.systolic) - 6} textAnchor="middle">{r.systolic}</text>
    <circle className="cs-trend-dot is-bottom" cx={x(i)} cy={y(r.diastolic)} r={3}/>
    <text className="cs-trend-value" x={x(i)} y={y(r.diastolic) + 14} textAnchor="middle">{r.diastolic}</text>
   </g>)}
   <text className="cs-trend-label" x={W - RIGHT + 6} y={y(readings[readings.length - 1]!.systolic) + 4}>{measureLabel(TOP)}</text>
   <text className="cs-trend-label" x={W - RIGHT + 6} y={y(readings[readings.length - 1]!.diastolic) + 4}>{measureLabel(BOTTOM)}</text>
  </svg>
 </figure>;
}

/* The file itself, shared by both roles. The nurse's order is the intake's: the common questions first. */
function CaseFileBody({ c, trend }: { c: Case; trend?: boolean }) {
 return <>
  <DraftBanner/>
  <section className="cs-block" aria-label={nurse.answersHeading}>
   <p className="cs-label">{nurse.answersHeading}</p>
   <dl className="cs-answers">{c.answers.map(a => <div key={a.questionId}><dt>{a.ask}</dt><dd>{a.answer}</dd></div>)}</dl>
  </section>
  <section className="cs-block" aria-label={nurse.findingsHeading}>
   <p className="cs-label">{nurse.findingsHeading}</p>
   {c.findings.length
    ? <ul className="cs-findings">{c.findings.map(f => <li key={f.id}>
      <strong>{f.sentence}</strong>
      <small className="helper">{fill(words.findings.behind, { conditions: listOf(f.conditionIds.map(id => `${conditionTitle(id)} (${id})`)) })}</small>
     </li>)}</ul>
    : <p className="helper">{nurse.findingsNone}</p>}
   <p className="helper cs-rule">{patientWording.rule}</p>
  </section>
  <section className="cs-block" aria-label={nurse.readingsHeading}>
   <p className="cs-label">{nurse.readingsHeading}</p>
   {c.readings.length ? <ul className="cs-readings">{c.readings.map(r => <ReadingRow key={r.readingRef} reading={r}/>)}</ul> : <p className="helper">{nurse.readingsNone}</p>}
   {trend && c.readings.length > 0 && <ReadingsTrend readings={c.readings}/>}
  </section>
  <section className="cs-block cs-suggestion" aria-label={nurse.suggestionHeading}>
   <p className="cs-label">{nurse.suggestionHeading}</p>
   <p className="cs-suggested"><Badge variant="primary">{settingLabel(c.suggestion.settingCode)}</Badge></p>
   <p className="cs-label">{nurse.reasonsHeading}</p>
   <p className="cs-reason">{c.suggestion.reason}</p>
  </section>
 </>;
}

/* The nurse's decision as a sentence, for both roles. */
const decisionOf = (c: Case) => c.decisions.find(d => d.actionCode === 'confirmed' || d.actionCode === 'overrode');

/* ---- The nurse's Cases -------------------------------------------------------------------------------- */

function NurseCase({ c }: { c: Case }) {
 const id = useId();
 const [choosing, setChoosing] = useState(false);
 const [setting, setSetting] = useState<string>(settingKinds.find(k => k.code !== c.suggestion.settingCode)?.code ?? '');
 const [reason, setReason] = useState('');
 const [repeating, setRepeating] = useState(false);
 const [source, setSource] = useState<SourceId>(NURSE_SOURCES[0]!);
 const [top, setTop] = useState('');
 const [bottom, setBottom] = useState('');
 const [refused, setRefused] = useState<string | null>(null);
 const decision = decisionOf(c);
 const handed = c.decisions.find(d => d.actionCode === 'handed-over');
 const took = c.decisions.find(d => d.actionCode === 'took');
 const closed = c.decisions.find(d => d.actionCode === 'closed');
 const act = (result: { ok: true } | { ok: false; refusal: { statement: string } }) => setRefused(result.ok ? null : result.refusal.statement);
 const record = () => {
  const s = Number(top), d = Number(bottom);
  if (!/^\d+$/.test(top) || !/^\d+$/.test(bottom)) { setRefused(nurse.repeatUnread); return; }
  const result = repeatReading(c.caseRef, { systolic: s, diastolic: d, source });
  act(result);
  if (result.ok) { setRepeating(false); setTop(''); setBottom(''); }
 };
 return <li className="ci-item cs-case" aria-label={c.caseRef}>
  <div className="ci-head">
   <strong>{c.caseRef}</strong>
   <Badge size="sm" variant={c.stateCode === 'closed' ? 'success' : c.stateCode === 'emergency' ? 'danger' : 'accent'}>{stateLabel(c.stateCode)}</Badge>
  </div>
  <CaseFileBody c={c}/>
  <div className="cs-acts">
   {took && <p className="helper"><ClipboardCheck size={15} aria-hidden="true"/>{fill(nurse.taken, { at: timeOf(took.at) })}</p>}
   {c.stateCode === 'opened' && <div className="button-row"><Button variant="primary" leadingIcon={<FolderOpen aria-hidden="true"/>} onClick={() => act(takeCase(c.caseRef))}>{nurse.take}</Button></div>}
   {c.stateCode === 'with-nurse' && !choosing && <div className="button-row">
    <Button variant="primary" leadingIcon={<ClipboardCheck aria-hidden="true"/>} onClick={() => act(decideSetting(c.caseRef, c.suggestion.settingCode))}>{fill(nurse.confirm, { setting: settingLabel(c.suggestion.settingCode) })}</Button>
    <Button variant="secondary" onClick={() => setChoosing(true)}>{nurse.override}</Button>
   </div>}
   {c.stateCode === 'with-nurse' && choosing && <div className="cs-override">
    <p className="helper">{nurse.overrideLead}</p>
    <Field label={nurse.overrideChoose} htmlFor={`${id}-setting`}>
     <Select id={`${id}-setting`} value={setting} onChange={e => setSetting(e.target.value)}>
      {settingKinds.map(k => <option key={k.code} value={k.code}>{k.label}</option>)}
     </Select>
    </Field>
    <Field label={nurse.overrideReason} htmlFor={`${id}-reason`} required>
     <Textarea id={`${id}-reason`} rows={2} value={reason} onChange={e => setReason(e.target.value)}/>
    </Field>
    <div className="button-row">
     <Button variant="primary" onClick={() => act(decideSetting(c.caseRef, setting, reason))}>{fill(nurse.confirm, { setting: settingLabel(setting) })}</Button>
     <Button variant="ghost" onClick={() => setChoosing(false)}>{nurse.keepSuggestion}</Button>
    </div>
   </div>}
   {decision && <p className="cs-decided" role="status"><ClipboardCheck size={15} aria-hidden="true"/>{fill(nurse.decided, { setting: settingLabel(decision.settingCode ?? ''), at: timeOf(decision.at) })}</p>}
   {decision?.reason && <p className="helper">{fill(nurse.overrode, { reason: decision.reason })}</p>}
   {/* The repeat is offered only while the case is hers: taken, and not yet handed to a doctor (lib/case.ts repeatable). */}
   {repeatable(c) && <>
    {!repeating
     ? <div className="button-row"><Button variant="secondary" leadingIcon={<Repeat aria-hidden="true"/>} onClick={() => setRepeating(true)}>{nurse.repeatReading}</Button></div>
     : <div className="cs-repeat">
      <p className="helper">{nurse.repeatLead}</p>
      <Field label={nurse.repeatSource} htmlFor={`${id}-source`}>
       <Select id={`${id}-source`} value={source} onChange={e => setSource(e.target.value as SourceId)}>
        {NURSE_SOURCES.map(s => <option key={s} value={s}>{sourceLabel(s)}</option>)}
       </Select>
      </Field>
      <div className="cs-pair">
       <Field label={nurse.repeatTop} htmlFor={`${id}-top`}><Input id={`${id}-top`} inputMode="numeric" value={top} onChange={e => setTop(e.target.value.replace(/[^\d]/g, ''))}/></Field>
       <Field label={nurse.repeatBottom} htmlFor={`${id}-bottom`}><Input id={`${id}-bottom`} inputMode="numeric" value={bottom} onChange={e => setBottom(e.target.value.replace(/[^\d]/g, ''))}/></Field>
      </div>
      <div className="button-row"><Button variant="primary" onClick={record}>{nurse.repeatRecord}</Button></div>
     </div>}
   </>}
   {decided(c) && !handed && c.stateCode !== 'closed' && <>
    <p className="helper">{nurse.askDoctorLead}</p>
    <div className="button-row"><Button variant="primary" leadingIcon={<Send aria-hidden="true"/>} onClick={() => act(askDoctor(c.caseRef))}>{nurse.askDoctor}</Button></div>
   </>}
   {!decided(c) && c.stateCode === 'with-nurse' && <p className="helper">{nurse.decideFirst}</p>}
   {handed && <p className="cs-decided" role="status"><Send size={15} aria-hidden="true"/>{fill(nurse.askedDoctor, { at: timeOf(handed.at) })}</p>}
   {closed && <p className="cs-decided" role="status"><ClipboardCheck size={15} aria-hidden="true"/>{fill(nurse.closedByDoctor, { doctor: doctorName(), at: timeOf(closed.at) })}</p>}
   {refused && <Alert variant="danger" className="fs-refused" title={refused}/>}
   <p className="helper cs-events">{fill(nurse.wouldPublish, { events: c.wouldPublish.join(', ') })}</p>
  </div>
 </li>;
}

export function NurseCases() {
 const id = useId();
 const list = useCases().cases;
 return <section className="panel ci-panel cs-panel" aria-labelledby={`${id}-title`}>
  <div className="section-title"><h2 id={`${id}-title`}>{nurse.heading}</h2></div>
  <p className="helper">{nurse.intro}</p>
  <p className="helper ci-preview">{nurse.preview}</p>
  {list.length ? <ol className="ci-list">{list.map(c => <NurseCase key={c.caseRef} c={c}/>)}</ol> : <p className="helper ci-empty">{nurse.empty}</p>}
 </section>;
}

/* ---- The doctor's case ---------------------------------------------------------------------------------- */

/* Which SOAP headings a draft of the composer's fields has written under, for the domain's completeness gate. */
const soapOf = (record: ConsultationDraft): string[] => {
 const has = (...ids: string[]) => ids.some(f => (record[f] ?? '').trim());
 return [
  ...(has('reason', 'history') ? ['S'] : []),
  ...(has('observations', 'examination') ? ['O'] : []),
  ...(has(assessmentFields.impression, assessmentFields.diagnosis, assessmentFields.nursing) ? ['A'] : []),
  ...(has('plan', 'medication', 'tests', 'referral', 'followup') ? ['P'] : [])
 ];
};

export function DoctorCase({ caseRef, onBack }: { caseRef: string; onBack: () => void }) {
 useCases();
 const id = useId();
 const [outcome, setOutcome] = useState<string | null>(null);
 const [refused, setRefused] = useState<string | null>(null);
 const c = caseById(caseRef);
 if (!c) return null;
 const decision = decisionOf(c);
 const group = intakeContract.groups.find(g => g.id === c.groupId);
 /* The doctor's sign-off, through the domain: the required headings or the route's refusal; the outcome
    first, in the contract's sentence; then the case closes with the plan she wrote. Returns whether the
    composer may show the signature. */
 const sign = (record: ConsultationDraft): boolean => {
  /* The outcome first: a consultation signed off in the domain is not rewritten, so nothing is recorded
     until everything the close needs is there. */
  if (!outcome) { setRefused(doctor.outcomeFirst); return false; }
  /* A case already closed, or never handed over, is refused before a consultation is recorded for it. */
  if (!closable(c)) { setRefused(caseRefusalStatement('case-not-with-a-doctor')); return false; }
  const recorded = recordConsultationFor({ encounterRef: encounterRefOf(c.caseRef), subjectRef: c.subjectRef, sectionsWritten: soapOf(record), signOff: true });
  if (!recorded.ok) { setRefused(recorded.refusal.statement); return false; }
  const plan = ['plan', 'followup'].map(f => (record[f] ?? '').trim()).filter(Boolean).join('\n');
  const closed = closeCase(c.caseRef, { consultationRef: recorded.consultation.consultationRef, outcomeCode: outcome, plan });
  if (!closed.ok) { setRefused(closed.refusal.statement); return false; }
  setRefused(null);
  return true;
 };
 const seed: ConsultationDraft = {
  reason: `${c.caseRef} · ${group?.name ?? c.groupId}`,
  history: c.answers.map(a => fill(intakeContract.summary.line, { question: a.ask, answer: a.answer })).join('\n'),
  observations: c.readings.map(r => `${fill(nurse.readingLine, { value: r.said, unit: unit() })} — ${sourceLabel(r.source)} — ${carriesWeight(r) ? kitWords.carries : kitWords.carriesNot}`).join('\n')
 };
 return <section className="panel ci-panel cs-panel cs-doctor" aria-labelledby={`${id}-title`}>
  <div className="section-title"><h2 id={`${id}-title`}>{fill(doctor.heading, { ref: c.caseRef })}</h2></div>
  <p className="helper">{doctor.intro}</p>
  <div className="button-row"><Button variant="ghost" leadingIcon={<ArrowLeft aria-hidden="true"/>} onClick={onBack}>{doctor.back}</Button></div>
  <CaseFileBody c={c} trend/>
  {decision && <p className="cs-decided" role="status"><Stethoscope size={15} aria-hidden="true"/>{fill(doctor.nurseDecision, { nurse: nurseName(), setting: settingLabel(decision.settingCode ?? '') })}</p>}
  {decision?.reason && <p className="helper">{fill(doctor.nurseOverrode, { nurse: nurseName(), reason: decision.reason })}</p>}
  <section className="cs-block" aria-label={doctor.outcomeHeading}>
   <p className="cs-label">{doctor.outcomeHeading}</p>
   <p className="helper">{doctor.outcomeLead}</p>
   {c.outcomeCode
    ? <p className="cs-decided" role="status"><ClipboardCheck size={15} aria-hidden="true"/>{fill(doctor.outcomeRecorded, { outcome: guidanceOutcomes.find(o => o.code === c.outcomeCode)?.label ?? c.outcomeCode })}</p>
    : <div className="button-row" role="group" aria-label={doctor.outcomeHeading}>{guidanceOutcomes.map(o =>
     <Button key={o.code} variant={outcome === o.code ? 'primary' : 'secondary'} aria-pressed={outcome === o.code} onClick={() => { setOutcome(o.code); setRefused(null); }}>{o.label} · {clinicalWords.guidance.noScript}</Button>)}</div>}
  </section>
  {c.stateCode === 'closed'
   ? <Alert variant="success" className="ci-signed" title={fill(doctor.closed, { at: timeOf(c.decisions.find(d => d.actionCode === 'closed')?.at ?? Date.now()) })}/>
   : <p className="helper"><PenLine size={15} aria-hidden="true"/>{doctor.signLead}</p>}
  {refused && <Alert variant="danger" className="fs-refused" title={refused}/>}
  <Card className="cs-consultation" padding="none">
   <ConsultationComposer reference={c.caseRef} patient={c.subjectRef} writer={roleOf('doctor').subjectId ?? undefined} title={fill(doctor.heading, { ref: c.caseRef })} seed={seed} onSign={sign}/>
  </Card>
 </section>;
}
