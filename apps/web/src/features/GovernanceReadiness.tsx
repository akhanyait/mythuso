import { useId, useState, type FormEvent } from 'react';
import { CircleAlert, CircleDashed, FileText, ShieldCheck, ScrollText } from 'lucide-react';
import { Pill } from '../components/UI';
import {
 applyChange, blankOf, governanceContract, governanceRecords, governanceScreen, isDone, labelOf,
 previewChange, registerOf, useGovernanceHistory,
 type Entry, type Field, type FieldValue, type GovernanceRecord, type Refusal, type Register, type Values
} from '../lib/governance';
import { roleOf, whoIs } from '../lib/roles';

/* Governance readiness, on the back office: whether the DPIA, the Information Officer and the residency
 * decision are done, who did them, when — and what goes on being refused either way.
 *
 * WHAT THE READER CAME FOR. Somebody opens this to answer one question: where has the privacy work got to,
 * and what is still blocked. So the three records lead, as the three-row table docs/governance/README.md
 * already keeps — state, what is blocked until it is done, what is refused today, and where in the code
 * that refusal lives — and everything else is under it. The detail a recorder needs is inside each record's
 * own panel, one fold down, because reading the state and writing it down are different jobs.
 *
 * WHAT IT DOES NOT DO, said on the screen rather than only in a comment. Recording a signed DPIA here starts
 * nothing: the Passport still refuses without its development flag, the build still fails if deploy/ names
 * it, and the identity service still refuses production without an Information Officer. That sentence is the
 * contract's, rendered word for word, and lib/governance.ts is the only module that reads the contract —
 * scripts/check-boundaries.mjs refuses any other file, in any tree, to read it at all.
 *
 * Every word here is the contract's: no record name, no field label, no refusal and no state is typed in
 * this file, so a record added to packages/catalog/governance-status.json appears with its question, its
 * document, its evidence rules and its history, and the editors draw themselves from its field types.
 */
const say = governanceScreen;
const fill = (sentence: string, values: Readonly<Record<string, string>>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const ZONE = 'Africa/Johannesburg';
const whenOf = (at: number) => `${new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: ZONE })}, ${new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE })}`;
/* What a recorded change reads as: the fields that actually moved, each as its label and its value, the way
   the Configuration screen reads a record whose parts change together. A field nobody touched is not news. */
const changedFields = (record: GovernanceRecord, from: Values, to: Values) => record.fields.filter(field => from[field.key] !== to[field.key]);
const sideOf = (fields: readonly Field[], values: Values) => fields.map(field => `${field.label} ${labelOf(field, values[field.key] ?? null)}`).join(' · ');

/* Who the back office is writing as, and whether the vetting register lets them work today. The register's
   reasoning is handed this rather than reaching for it: who is signed in is the shell's knowledge. */
function recorderNow() {
 const id = roleOf('back-office').subjectId;
 if (!id) return { roleId: '', ref: '', cleared: false, name: '' };
 const { subject, state } = whoIs(id, '');
 return { roleId: subject.roleId, ref: subject.reference, cleared: state.cleared, name: subject.name };
}

/* ---- The three rows ------------------------------------------------------------------------------- */

function StateCell({ done }: { done: boolean }) {
 /* Never colour alone: the word is the state and the icon repeats it, so the row reads the same to somebody
    who cannot tell the two pills apart. */
 return <Pill tone={done ? 'teal' : 'plain'}>{done ? <ShieldCheck size={15}/> : <CircleDashed size={15}/>}{done ? say.done : say.notDone}</Pill>;
}

export function GovernanceReadiness() {
 const history = useGovernanceHistory();
 const register = registerOf(history);
 const done = governanceRecords.filter(record => isDone(record, register.values[record.key]!)).length;
 return <div className="gr-area">
  <div className="privacy-note"><ScrollText size={19}/>{say.intro}</div>
  <div className="privacy-note alert"><CircleAlert size={19}/>{say.preview}</div>
  <div className="gr-lead">
   <p className="gr-count" role="status">{fill(say.summary, { done: String(done), total: String(governanceRecords.length) })} · {fill(say.version, { version: String(register.version) })}</p>
   <div className="table-scroll"><table className="result-table admin-table gr-table">
    <caption>{fill(say.documentsLink, { folder: governanceContract.documents })}</caption>
    <thead><tr>
     <th scope="col">{say.document}</th><th scope="col">{say.state}</th><th scope="col">{say.blockedUntil}</th>
     <th scope="col">{say.refusedToday}</th><th scope="col">{say.refusalLives}</th>
    </tr></thead>
    <tbody>{governanceRecords.map(record => <tr key={record.key}>
     <th scope="row">{record.label}</th>
     <td><StateCell done={isDone(record, register.values[record.key]!)}/></td>
     <td>{record.blockedUntil}</td>
     <td>{record.refusedToday}</td>
     <td><ul className="gr-paths">{record.refusalLives.map(path => <li key={path}><code>{path}</code></li>)}</ul></td>
    </tr>)}</tbody>
   </table></div>
  </div>
  {/* The guardrail where the question is asked. Somebody reading "Signed" in the table above wants to know
      what that switched on; the answer is nothing, and it is the contract's sentence rather than a paraphrase. */}
  <section className="panel gr-guardrail" aria-labelledby="gr-guardrail">
   <h2 id="gr-guardrail">{say.changesNothing}</h2>
   <p>{governanceContract.changesNothing.statement}</p>
   <p className="helper">{governanceContract.changesNothing.why}</p>
   <p className="helper">{governanceContract.recording.attribution}</p>
  </section>
  {governanceRecords.map(record => <RecordPanel key={record.key} record={record} register={register}
   history={history.filter(entry => entry.record === record.key)}/>)}
 </div>;
}

function RecordPanel({ record, register, history }: { record: GovernanceRecord; register: Register; history: readonly Entry[] }) {
 const id = useId();
 const [open, setOpen] = useState(false);
 const [recorded, setRecorded] = useState<Entry | null>(null);
 const values = register.values[record.key]!;
 const last = history.at(-1);
 return <section className="panel gr-record" aria-labelledby={id + '-title'}>
  <div className="gr-record-head">
   <h2 id={id + '-title'}>{record.label}</h2>
   <StateCell done={isDone(record, values)}/>
  </div>
  <p className="gr-question">{record.question}</p>
  <dl className="cf-rules">
   <div><dt>{say.whoDecides}</dt><dd>{record.decidedBy}</dd></div>
   <div><dt>{say.document}</dt><dd><code>{record.document}</code></dd></div>
  </dl>
  <dl className="gr-fields">{record.fields.map(field => <div key={field.key}>
   <dt>{field.label}</dt>
   <dd className={values[field.key] === field.blank ? 'is-blank' : ''}>{labelOf(field, values[field.key] ?? null)}</dd>
   <p className="helper">{field.help}</p>
  </div>)}</dl>
  <p className="gr-meta" role="status">
   {last ? fill(say.recordedBy, { who: last.byRef, when: whenOf(last.at) }) : say.neverRecorded}
   {recorded ? ` · ${fill(say.recorded, { version: String(recorded.version), at: whenOf(recorded.at) })}` : ''}
  </p>
  <details className="cf-history">
   <summary>{say.historyHeading} ({history.length})</summary>
   {history.length
    ? <div className="table-scroll"><table className="result-table admin-table ss-history">
      <caption>{say.historyNeverEdited}</caption>
      <thead><tr><th scope="col">{say.when}</th><th scope="col">{say.who}</th><th scope="col">{say.from}</th><th scope="col">{say.to}</th><th scope="col">{say.why}</th></tr></thead>
      <tbody>{history.map(entry => {
       const moved = changedFields(record, entry.from, entry.to);
       return <tr key={entry.version}>
        <td>{whenOf(entry.at)}</td><td>{entry.byRef}</td>
        <td>{sideOf(moved, entry.from)}</td><td>{sideOf(moved, entry.to)}</td><td>{entry.reason}</td>
       </tr>;
      })}</tbody>
     </table></div>
    : <p className="helper">{say.historyEmpty} {say.historyNeverEdited}</p>}
  </details>
  {open
   ? <ChangeForm record={record} from={values} expectedVersion={register.version}
     onClose={() => setOpen(false)} onRecorded={entry => { setRecorded(entry); setOpen(false); }}/>
   : <button className="secondary" onClick={() => { setOpen(true); setRecorded(null); }}>{say.record}<span className="visually-hidden"> — {record.label}</span></button>}
 </section>;
}

/* ---- Recording a change ---------------------------------------------------------------------------- */

/* What the form holds while somebody types: the text of a date rather than a date, so a half-written day
   reaches the rules as what it is and is refused in the contract's sentence, rather than a widget quietly
   deciding what the recorder meant. That is the same reason the Configuration screen keeps raw text. */
type Raw = Readonly<Record<string, FieldValue>>;
const rawOf = (record: GovernanceRecord, values: Values): Raw =>
 Object.fromEntries(record.fields.map(field => [field.key, field.type === 'day' ? (values[field.key] ?? '') : values[field.key]!]));
const valuesOf = (record: GovernanceRecord, raw: Raw): Values =>
 Object.fromEntries(record.fields.map(field => [field.key, field.type === 'day' && raw[field.key] === '' ? null : raw[field.key]!]));

function Editor({ field, raw, onRaw, id, disabled }: { field: Field; raw: FieldValue; onRaw: (value: FieldValue) => void; id: string; disabled: boolean }) {
 if (field.allowed) return <fieldset className="cf-choices" disabled={disabled}>
  <legend>{field.label}</legend>
  {field.allowed.map(choice => <label className="cf-choice" key={String(choice.value)}>
   <input type="radio" name={id} checked={raw === choice.value} onChange={() => onRaw(choice.value)}/>
   <span><strong>{choice.label}</strong><small>{choice.means}</small></span>
  </label>)}
 </fieldset>;
 return <div className="gr-field">
  <label htmlFor={id}>{field.label}</label>
  <input id={id} type="text" value={String(raw ?? '')} disabled={disabled} aria-describedby={id + '-help'}
   inputMode={field.type === 'day' ? 'numeric' : 'text'} onChange={event => onRaw(event.target.value)}/>
  <p className="helper" id={id + '-help'}>{field.help}</p>
 </div>;
}

function ChangeForm({ record, from, expectedVersion, onClose, onRecorded }: {
 record: GovernanceRecord; from: Values; expectedVersion: number; onClose: () => void; onRecorded: (entry: Entry) => void;
}) {
 const id = useId();
 const [raw, setRaw] = useState<Raw>(() => rawOf(record, from));
 const [reason, setReason] = useState('');
 const [review, setReview] = useState<Entry | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const who = recorderNow();
 const request = () => ({ record: record.key, values: valuesOf(record, raw), reason, expectedVersion });
 const check = (event: FormEvent) => {
  event.preventDefault();
  const result = previewChange(request(), who);
  setRefused(result.ok ? null : result.refusal);
  setReview(result.ok ? result.entry : null);
 };
 const confirm = () => {
  const result = applyChange(request(), who);
  if (!result.ok) { setRefused(result.refusal); setReview(null); return; }
  onRecorded(result.entry);
 };
 /* Putting a record back to blank is one press rather than five fields cleared by hand, because leaving one
    behind is exactly the half-filled row governance-evidence-without-the-decision exists to refuse. */
 const clear = () => { setRaw(rawOf(record, blankOf(record))); setRefused(null); };
 return <form className="ss-form gr-form" onSubmit={check} aria-label={`${say.record} — ${record.label}`}>
  {record.fields.map(field => <Editor key={field.key} field={field} raw={raw[field.key] ?? ''} id={`${id}-${field.key}`}
   disabled={!!review} onRaw={value => { setRaw({ ...raw, [field.key]: value }); setRefused(null); }}/>)}
  <button type="button" className="secondary gr-clear" disabled={!!review} onClick={clear}>{say.clearAll}</button>
  <label htmlFor={id + '-reason'}>{say.reason}</label>
  <textarea id={id + '-reason'} value={reason} rows={3} disabled={!!review} aria-describedby={id + '-reason-help'}
   onChange={event => { setReason(event.target.value); setRefused(null); }}/>
  <p className="helper" id={id + '-reason-help'}>{say.reasonHelp}</p>
  {/* Who is writing it down, said before it is written down. The register names the signatory; the history
      names this person, and the two are never assumed to be the same. */}
  <p className="helper gr-recorder"><FileText size={15}/>{fill(say.recorder, { who: `${who.name} · ${who.ref}` })}</p>
  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
  {review
   ? <div className="ss-confirm" role="group" aria-labelledby={id + '-confirm'}>
     <strong id={id + '-confirm'}>{fill(say.confirmQuestion, { record: record.label })}</strong>
     <p>{sideOf(changedFields(record, review.from, review.to), review.from)} → {sideOf(changedFields(record, review.from, review.to), review.to)}</p>
     <p>{governanceContract.changesNothing.statement}</p>
     <div className="button-row">
      <button type="button" className="secondary" onClick={() => setReview(null)}>{say.cancel}</button>
      <button type="button" className="primary" autoFocus onClick={confirm}>{say.confirm}</button>
     </div>
    </div>
   : <div className="button-row">
     <button type="button" className="secondary" onClick={onClose}>{say.cancel}</button>
     <button type="submit" className="primary">{say.review}</button>
    </div>}
 </form>;
}
/* Who may write here, and what a write is held to, is governance-status.json's own
   "governance-record-not-permitted" refusal — read from there rather than restated here. */
