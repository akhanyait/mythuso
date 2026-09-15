import { useId, useState } from 'react';
import { ClipboardCheck, ShieldAlert, Stethoscope } from 'lucide-react';
import {
 OUTSIDE_PROTOCOL, UNDER_PROTOCOL, episodesNow, fill, frame, frameConsultation, giveGuidance, guidanceOutcomes, inboxNow, listOf, missingIn, notTriaged,
 promDaysNow, promRefusal, protocolName, roleNames, signOffConsultation, signReview, signingModes, startTriage, timeOf, dayOf, triageStages, useClinical, words
} from '../lib/clinical';
import { reviewStateAt, settingsScreen, useSettingsHistories, useSettingsReviews } from '../lib/settings';
import { whoIs } from '../lib/roles';
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
 */

const ReviewMarker = ({ setting }: { setting: string }) => {
 useSettingsHistories();
 useSettingsReviews();
 const state = reviewStateAt('clinical', setting);
 return state.required && !state.reviewed ? <span className="pill cf-review is-unreviewed"><ShieldAlert size={15} aria-hidden="true"/>{settingsScreen.notReviewed}</span> : null;
};

export function ReviewInbox() {
 useClinical();
 useSettingsHistories();
 const id = useId();
 const [refused, setRefused] = useState<Record<string, string>>({});
 const inbox = inboxNow();
 const press = (reviewRef: string, mode: string) => {
  const answer = signReview(reviewRef, mode);
  setRefused(before => ({ ...before, [reviewRef]: answer.ok ? '' : answer.refusal.statement }));
 };
 return <section className="panel ci-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{words.inbox.heading}</h2></div>
  <p className="helper">{words.inbox.intro}</p>
  <p className="helper">{words.inbox.preview}</p>
  {!inbox.ok ? <p className="fs-refused" role="alert">{inbox.refusal.statement}</p> : <>
   <p className="ci-meta">{fill(words.inbox.confirmers, { roles: roleNames(inbox.confirmers) })} <ReviewMarker setting="review-confirmer"/></p>
   {inbox.rows.length ? <ol className="ci-list">{inbox.rows.map(row => <li key={row.reviewRef} className="ci-item" aria-label={row.appointmentRef}>
    <div className="ci-head"><strong>{row.appointmentRef}</strong><span className="ss-meta">{fill(words.inbox.patient, { subject: row.subjectRef })}</span></div>
    <ul className="ci-facts">
     <li>{row.protocolVersionId ? `${fill(words.inbox.named, { protocol: `${protocolName(row.protocolVersionId)} (${row.protocolVersionId})` })} · ${row.protocolRatified ? words.inbox.ratified : words.inbox.draft}` : words.inbox.namedNone}</li>
     <li>{row.recordComplete ? words.inbox.recordComplete : words.inbox.recordIncomplete}</li>
    </ul>
    {row.signedAs ? <div className="ci-signed" role="status">
     <p><ClipboardCheck size={16} aria-hidden="true"/>{row.signedAs}</p>
     <p className="helper">{fill(words.inbox.signed, { who: row.signedByRef ? whoIs(row.signedByRef, '').subject.name : '', at: timeOf(row.signedAt ?? 0) })}</p>
    </div> : <div className="ci-sign">
     <p className="ci-label">{words.inbox.mode}</p>
     <div className="button-row">{signingModes.map(mode =>
      <button key={mode.code} type="button" className="secondary" onClick={() => press(row.reviewRef, mode.code)}>
       {words.inbox.sign}: {mode.label}
      </button>)}</div>
     {refused[row.reviewRef] ? <p className="fs-refused" role="alert">{refused[row.reviewRef]}</p> : null}
    </div>}
   </li>)}</ol> : <p className="helper">{words.inbox.empty}</p>}
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
 return <section className="panel ci-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{words.consultation.heading}</h2></div>
  <p className="helper">{words.consultation.intro}</p>
  <p className="helper">{words.consultation.preview}</p>
  <div className="ci-frame">{frame.map(heading => <label key={heading.code} className="ci-heading">
   <span><strong>{heading.name}</strong> <em className="ci-required">{heading.required ? words.consultation.required : words.consultation.optional}</em></span>
   <small className="helper">{heading.detail}</small>
   <textarea rows={3} value={draft[heading.code] ?? ''} disabled={!!signed?.signedOffAt}
    onChange={event => { setDraft(before => ({ ...before, [heading.code]: event.target.value })); setRefused(null); }}/>
  </label>)}</div>
  {refused && <div role="alert"><p className="fs-refused">{refused.statement}</p>{refused.missing.length ? <p className="helper">{fill(words.consultation.missing, { headings: listOf(refused.missing) })}</p> : null}</div>}
  {signed?.signedOffAt ? <p className="ci-signed" role="status"><ClipboardCheck size={16} aria-hidden="true"/>{fill(words.consultation.signedOff, { at: timeOf(signed.signedOffAt) })}</p>
   : <div className="button-row"><button type="button" className="primary" onClick={signOff}>{words.consultation.signOff}</button></div>}
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
   ? <div className="button-row"><button type="button" className="secondary" onClick={() => setAnswer(startTriage().statement)}><Stethoscope size={16} aria-hidden="true"/>{words.triage.start}</button></div>
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
    : <button type="button" className="secondary" onClick={() => setAnswers(before => ({ ...before, [outcome.code]: giveGuidance(outcome.code).statement }))}>{fill(words.guidance.give, { outcome: outcome.label })}</button>}
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
