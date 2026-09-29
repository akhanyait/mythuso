import { Suspense, lazy, useId, useState } from 'react';
import { ClipboardCheck, FolderOpen, PenLine, ShieldAlert, Stethoscope } from 'lucide-react';
import { useCases, words as caseWords } from '../lib/case';
import {
 OUTSIDE_PROTOCOL, UNDER_PROTOCOL, episodesNow, fill, frame, frameConsultation, giveGuidance, guidanceOutcomes, inboxNow, listOf, missingIn, notTriaged,
 promDaysNow, promRefusal, protocolName, roleNames, signOffConsultation, signReview, signingModes, startTriage, timeOf, dayOf, triageStages, useClinical, words
} from '../lib/clinical';
import { reviewStateAt, settingsScreen, useSettingsHistories, useSettingsReviews } from '../lib/settings';
import { whoIs } from '../lib/roles';
import { DOCTOR, useMedicines } from '../lib/medicines';
import { Alert, Badge, Button, MetricCard, MyThusoResultsIcon, MyThusoVisitIcon, Textarea } from '../ui';
import './clinical-intelligence.css';

/* Clinical Intelligence's screens in the clinical workspace: the doctor's inbox, the consultation frame, the answers a
 * nurse or a doctor is given when they start triage or Home Guidance, and outcome questions on a patient's record.
 *
 * EVERY WORD IS A CONTRACT'S. The headings, the signing modes and the sentence each signature carries are
 * packages/catalog/clinical.json's; every refusal is the route's own sentence, asked of the Clinical domain through
 * lib/clinical.ts; who may confirm and the days outcome questions are asked on are the settings in force, through
 * lib/settings.ts, each marked not clinically reviewed while it waits. Nothing here types a role, a day or a refusal.
 *
 * NOTHING IS DONE FOR ANYBODY. A review has one button for each way it may be signed, and nothing is chosen until the
 * doctor presses one: a control that arrived set to "signed under a ratified protocol" would be a choice made for her.
 * Triage answers not triaged and says who decides; guidance answers no ratified script for each outcome; neither
 * guesses. And none of it is on a patient's first load: the clinical workspace is a dynamic import.
 *
 * THE INBOX IS THE DOCTOR'S COMMAND VIEW (the identity of 28 September 2026, the Lovable handoff). Three
 * figures head it and every one is counted, never typed: the visits in this inbox with no signature yet,
 * the ones signed today by a press on this screen, and the laboratory results the doctor ordered that
 * nobody has acknowledged, read from the Medicines store the results screen writes to. A figure a reader
 * cannot check against a list is the typed-figure problem this workspace was rebuilt to remove, so each
 * one is the length of a list somebody can open. The rows under them arrive one after another on the
 * tokens, and not at all for a reader who asked for stillness.
 */

/* A case a nurse handed over (29 September 2026) is a row in this inbox like any visit, named under the
   draft pathway, and opens the case file — fetched on a dynamic import, since it carries the composer. */
const DoctorCase = lazy(() => import('./CaseFile').then(m => ({ default: m.DoctorCase })));
const isCase = (appointmentRef: string) => appointmentRef.startsWith('CASE-');

const ReviewMarker = ({ setting }: { setting: string }) => {
 useSettingsHistories();
 useSettingsReviews();
 const state = reviewStateAt('clinical', setting);
 return state.required && !state.reviewed ? <span className="pill cf-review is-unreviewed"><ShieldAlert size={15} aria-hidden="true"/>{settingsScreen.notReviewed}</span> : null;
};

export function ReviewInbox() {
 useClinical();
 useSettingsHistories();
 useCases();
 const medicines = useMedicines();
 const id = useId();
 const [refused, setRefused] = useState<Record<string, string>>({});
 const [openCase, setOpenCase] = useState<string | null>(null);
 const inbox = inboxNow();
 if (openCase) return <Suspense fallback={null}><DoctorCase caseRef={openCase} onBack={() => setOpenCase(null)}/></Suspense>;
 const press = (reviewRef: string, mode: string) => {
  const answer = signReview(reviewRef, mode);
  setRefused(before => ({ ...before, [reviewRef]: answer.ok ? '' : answer.refusal.statement }));
 };
 /* The three figures, each the length of a list. Signed today is the day the signature carries against
    the day now, in the clinic's own zone, through the same formatter the row prints it with. */
 const rows = inbox.ok ? inbox.rows : [];
 const today = dayOf(Date.now());
 const waiting = rows.filter(row => !row.signedAs).length;
 const signedToday = rows.filter(row => row.signedAt !== null && row.signedAt !== undefined && dayOf(row.signedAt) === today).length;
 const toAcknowledge = medicines.results.filter(result => result.responsibleRef === DOCTOR && result.acknowledgedAt === null).length;
 return <section className="panel ci-panel ci-command" aria-labelledby={id + '-title'}>
  <div className="ci-command-head">
   <div className="section-title"><h2 id={id + '-title'}>{words.inbox.heading}</h2></div>
   <p className="helper">{words.inbox.intro}</p>
  </div>
  <div className="ci-metrics" aria-label="The inbox, counted">
   <MetricCard className="ci-metric is-lead" label="Reviews waiting" value={String(waiting)} icon={<MyThusoVisitIcon/>}
    trend={waiting ? `${waiting} of ${rows.length} in this inbox` : 'Nothing waits for a signature'}/>
   <MetricCard className="ci-metric" label="Signed today" value={String(signedToday)} icon={<ClipboardCheck aria-hidden="true"/>}
    trend="By your own press, on this screen"/>
   <MetricCard className="ci-metric" label="Results to acknowledge" value={String(toAcknowledge)} icon={<MyThusoResultsIcon/>}
    trend={toAcknowledge ? 'Ordered by you, not yet acknowledged' : 'None of yours is waiting'}/>
  </div>
  <p className="helper ci-preview">{words.inbox.preview}</p>
  {!inbox.ok ? <Alert variant="danger" className="fs-refused" title={inbox.refusal.statement}/> : <>
   <p className="ci-meta">{fill(words.inbox.confirmers, { roles: roleNames(inbox.confirmers) })} <ReviewMarker setting="review-confirmer"/></p>
   {inbox.rows.length ? <ol className="ci-list">{inbox.rows.map((row, i) => <li key={row.reviewRef} className={`ci-item${row.signedAs ? ' is-signed' : ''}`} aria-label={row.appointmentRef}
     style={{ ['--ci-i' as string]: Math.min(i, 4) }}>
    <div className="ci-head">
     <strong>{row.appointmentRef}</strong>
     <span className="ss-meta">{fill(words.inbox.patient, { subject: row.subjectRef })}</span>
    </div>
    <ul className="ci-facts">
     <li><Badge size="sm" variant={row.protocolVersionId ? row.protocolRatified ? 'success' : 'warning' : 'neutral'}>
      {row.protocolVersionId ? `${fill(words.inbox.named, { protocol: `${protocolName(row.protocolVersionId)} (${row.protocolVersionId})` })} · ${row.protocolRatified ? words.inbox.ratified : words.inbox.draft}` : words.inbox.namedNone}</Badge></li>
     <li><Badge size="sm" variant={row.recordComplete ? 'neutral' : 'danger'}>{row.recordComplete ? words.inbox.recordComplete : words.inbox.recordIncomplete}</Badge></li>
    </ul>
    {isCase(row.appointmentRef) && <div className="button-row">
     <Button variant="primary" leadingIcon={<FolderOpen aria-hidden="true"/>} onClick={() => setOpenCase(row.appointmentRef)}>{caseWords.screens.doctor.openCase}</Button>
    </div>}
    {row.signedAs ? <div className="ci-signed" role="status">
     <p><ClipboardCheck size={16} aria-hidden="true"/>{row.signedAs}</p>
     <p className="helper">{fill(words.inbox.signed, { who: row.signedByRef ? whoIs(row.signedByRef, '').subject.name : '', at: timeOf(row.signedAt ?? 0) })}</p>
    </div> : <div className="ci-sign">
     <p className="ci-label">{words.inbox.mode}</p>
     <div className="button-row">{signingModes.map(mode =>
      <Button key={mode.code} variant="secondary" leadingIcon={<PenLine aria-hidden="true"/>} onClick={() => press(row.reviewRef, mode.code)}>
       {words.inbox.sign}: {mode.label}
      </Button>)}</div>
     {refused[row.reviewRef] ? <Alert variant="danger" className="fs-refused" title={refused[row.reviewRef]}/> : null}
    </div>}
   </li>)}</ol> : <p className="helper ci-empty">{words.inbox.empty}</p>}
  </>}
 </section>;
}

export function ConsultationFrame() {
 useClinical();
 const id = useId();
 const [draft, setDraft] = useState<Record<string, string>>({});
 const [refused, setRefused] = useState<{ statement: string; missing: string[] } | null>(null);
 const signed = frameConsultation();
 const nameOf = (code: string) => frame.find(h => h.code === code)?.name ?? code;
 const signOff = () => {
  const answer = signOffConsultation(draft);
  setRefused(answer.ok ? null : { statement: answer.refusal.statement, missing: missingIn(draft).map(nameOf) });
 };
 const written = frame.filter(heading => (draft[heading.code] ?? '').trim()).length;
 return <section className="panel ci-panel ci-frame-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{words.consultation.heading}</h2></div>
  <p className="helper">{words.consultation.intro}</p>
  <p className="helper">{words.consultation.preview}</p>
  {/* Each heading is a label, its required word a badge beside it and its sentence the hint the field
      is described by — so a screen reader hears what the heading is for as well as what it is called. */}
  <div className="ci-frame">{frame.map(heading => <div key={heading.code} className={`ci-heading${(draft[heading.code] ?? '').trim() ? ' is-written' : ''}`}>
   <label htmlFor={`${id}-${heading.code}`} className="ci-heading-label"><strong>{heading.name}</strong>
    <Badge size="sm" variant={heading.required ? 'primary' : 'neutral'} className="ci-required">{heading.required ? words.consultation.required : words.consultation.optional}</Badge></label>
   <small className="helper" id={`${id}-${heading.code}-detail`}>{heading.detail}</small>
   <Textarea id={`${id}-${heading.code}`} rows={3} value={draft[heading.code] ?? ''} disabled={!!signed?.signedOffAt} aria-describedby={`${id}-${heading.code}-detail`}
    onChange={event => { setDraft(before => ({ ...before, [heading.code]: event.target.value })); setRefused(null); }}/>
  </div>)}</div>
  {refused && <Alert variant="danger" className="fs-refused" title={refused.statement}>{refused.missing.length ? <p>{fill(words.consultation.missing, { headings: listOf(refused.missing) })}</p> : null}</Alert>}
  {signed?.signedOffAt ? <Alert variant="success" className="ci-signed" title={fill(words.consultation.signedOff, { at: timeOf(signed.signedOffAt) })}/>
   : <div className="ci-frame-foot">
    <span className="ci-frame-count">{written} of {frame.length} headings written</span>
    <div className="button-row"><Button variant="primary" onClick={signOff}>{words.consultation.signOff}</Button></div>
   </div>}
 </section>;
}

export function TriageStart() {
 const id = useId();
 const [answer, setAnswer] = useState<string | null>(null);
 return <section className="panel ci-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{words.triage.heading}</h2></div>
  <p className="helper">{words.triage.intro}</p>
  <ol className="ci-stages">{triageStages.map(stage => <li key={stage.code}><strong>{stage.label}</strong><span>{stage.rule}</span></li>)}</ol>
  {answer === null
   ? <div className="button-row"><Button variant="secondary" leadingIcon={<Stethoscope aria-hidden="true"/>} onClick={() => setAnswer(startTriage().statement)}>{words.triage.start}</Button></div>
   : <div className="ci-answer" role="status">
    <p className="ci-not"><strong>{notTriaged.label}</strong></p>
    <p>{answer}</p>
    <p>{notTriaged.human}</p>
    <p className="helper">{notTriaged.emergencyFirst}</p>
    <p className="helper">{fill(words.triage.routedTo, { roles: roleNames(notTriaged.routesTo) })}</p>
   </div>}
 </section>;
}

export function GuidanceStart() {
 const id = useId();
 const [answers, setAnswers] = useState<Record<string, string>>({});
 return <section className="panel ci-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{words.guidance.heading}</h2></div>
  <p className="helper">{words.guidance.intro}</p>
  <ul className="ci-outcomes">{guidanceOutcomes.map(outcome => <li key={outcome.code}>
   {answers[outcome.code]
    ? <div role="status"><strong>{outcome.label} · {words.guidance.noScript}</strong><p>{answers[outcome.code]}</p></div>
    : <Button variant="secondary" onClick={() => setAnswers(before => ({ ...before, [outcome.code]: giveGuidance(outcome.code).statement }))}>{fill(words.guidance.give, { outcome: outcome.label })}</Button>}
  </li>)}</ul>
 </section>;
}

export function PromSchedule() {
 useClinical();
 useSettingsHistories();
 const id = useId();
 const days = promDaysNow();
 const episodes = episodesNow();
 return <section className="panel ci-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{words.proms.heading}</h2></div>
  <p className="helper">{words.proms.intro}</p>
  <p className="ci-meta">{fill(words.proms.schedule, { days: listOf(days.map(String)) })} <ReviewMarker setting="prom-days"/></p>
  {episodes.length ? <ul className="ci-facts">{episodes.map(e => <li key={e.episodeRef}>
   {fill(words.proms.episode, { episode: e.episodeRef, signed: dayOf(e.startedAt), dates: listOf(e.due.map(dayOf)) })}
  </li>)}</ul> : <p className="helper">{words.proms.none}</p>}
  <p className="fs-refused">{promRefusal().statement}</p>
 </section>;
}

/* The two ways a review is signed, exported for the journey that presses them by their contract labels. */
export const signingModeLabels = { under: signingModes.find(m => m.code === UNDER_PROTOCOL)?.label ?? '', outside: signingModes.find(m => m.code === OUTSIDE_PROTOCOL)?.label ?? '' };
