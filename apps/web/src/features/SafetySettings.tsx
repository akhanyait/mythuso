import { useId, useState, type FormEvent } from 'react';
import { CircleAlert, TimerReset } from 'lucide-react';
import { clockOf, fieldSafety, fill, type Refusal } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { defaultTimings, inForce, keyOf, settingsScreen, timingRows, type SettingsChange, type TimingRow, type TimingValue } from '../../../../packages/engines/src/safety/domain/settings.ts';
import { adminOnDuty, previewChange, proposeChange, useSettingsHistory, type Proposal } from '../lib/safety-settings';
import { whoIs } from '../lib/roles';

/* Field safety settings, on the back office's Operations tab.
 *
 * The founder decided on 15 September 2026 that Operations changes the grace and the panic window here
 * rather than in code. The screen is built to be read before it is used: each timing shows what is in
 * force, its default, who decided that default (the founder, or a proposal nobody has decided), and the
 * range an admin may set — itself a proposal, and it says so. The history of every change sits under
 * it, and nothing on this screen edits or removes a row.
 *
 * A CHANGE IS REVIEWED, THEN CONFIRMED. The review asks the engine the same question the change does, so
 * a value out of range, a missing reason or a stale version is refused in the route's own sentence before
 * anybody is asked to confirm anything; the confirmation then says, in the contract's words, that a change
 * does not touch a visit already running or a panic window already open. Every word on the screen is
 * packages/catalog/field-safety.json's, and no minute is typed here.
 *
 * Held in memory by lib/safety-settings.ts and nowhere else. The preview sentence at the foot says what
 * that means: no phone and no desk is told, and a reload puts the defaults back.
 */
const say = settingsScreen;
type Decision = { readonly decidedBy: string | null; readonly decidedOn?: string };
const decisions = fieldSafety as unknown as Record<string, Record<string, Decision>>;
const decisionOf = (row: TimingRow): Decision => {
 const [block, key] = row.defaultFrom.split('.');
 return decisions[block!]![key!]!;
};
const dayOf = (on: string) => new Date(`${on}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
const minutesText = (value: TimingValue) => fill(say.minutes, { minutes: Array.isArray(value) ? value.join(', ') : String(value) });
const labelOf = (id: string) => timingRows.find(row => row.id === id)?.label ?? id;
const nameOf = (ref: string) => ref === adminOnDuty() ? `${whoIs(ref, '').subject.name} · ${ref}` : ref;

export function SafetySettings() {
 const history = useSettingsHistory();
 const id = useId();
 const [open, setOpen] = useState<string | null>(null);
 const [applied, setApplied] = useState<SettingsChange | null>(null);
 const current = inForce(history);
 return <section className="ss-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{say.heading}</h2></div>
  <p className="helper">{say.intro}</p>
  <div className="privacy-note"><TimerReset size={19}/>{say.appliesFrom}</div>
  <p className="ss-version" role="status">{fill(say.version, { version: String(current.settingsVersion) })}{applied ? ` · ${fill(say.applied, { version: String(applied.settingsVersion), at: clockOf(applied.at) })}` : ''}</p>
  <ol className="panel ss-timings">{timingRows.map(row => {
   const decision = decisionOf(row);
   const key = keyOf(row.id);
   return <li className="ss-timing" key={row.id}>
    <div className="ss-timing-head">
     <strong>{row.label}</strong>
     <span className="ss-in-force"><small>{say.inForce}</small><b>{minutesText(current.timings[key])}</b></span>
    </div>
    <p className="ss-meta">{fill(say.defaultIs, { value: minutesText(defaultTimings[key]) })} · {decision.decidedBy && decision.decidedOn
     ? fill(say.decided, { who: decision.decidedBy, on: dayOf(decision.decidedOn) }) : say.undecided}</p>
    <p className="ss-meta">{fill(say.range, { lowest: String(row.lowest.value), highest: String(row.highest.value) })}. {say.rangeIsAProposal}</p>
    {open === row.id
     ? <ChangeForm row={row} expectedVersion={current.settingsVersion} from={current.timings[key]} onClose={() => setOpen(null)} onApplied={change => { setApplied(change); setOpen(null); }}/>
     : <button className="secondary" onClick={() => { setOpen(row.id); setApplied(null); }}>{say.change}<span className="visually-hidden"> {row.label}</span></button>}
   </li>;
  })}</ol>

  <h3 className="ss-history-title">{say.historyHeading}</h3>
  {history.length
   ? <div className="panel table-scroll"><table className="result-table admin-table ss-history">
     <caption>{say.historyNeverEdited}</caption>
     <thead><tr><th scope="col">{say.when}</th><th scope="col">{say.who}</th><th scope="col">{say.setting}</th><th scope="col">{say.from}</th><th scope="col">{say.to}</th><th scope="col">{say.why}</th></tr></thead>
     <tbody>{history.map(change => <tr key={change.settingsVersion}>
      <td>{clockOf(change.at)}</td><td>{nameOf(change.byRef)}</td><th scope="row">{labelOf(change.timing)}</th>
      <td>{minutesText(change.from)}</td><td>{minutesText(change.to)}</td><td>{change.reason}</td>
     </tr>)}</tbody>
    </table></div>
   : <p className="helper">{say.historyEmpty} {say.historyNeverEdited}</p>}
  <div className="privacy-note alert"><CircleAlert size={19}/>{say.preview}</div>
 </section>;
}

function ChangeForm({ row, expectedVersion, from, onClose, onApplied }: {
 row: TimingRow; expectedVersion: number; from: TimingValue; onClose: () => void; onApplied: (change: SettingsChange) => void;
}) {
 const id = useId();
 const [text, setText] = useState('');
 const [reason, setReason] = useState('');
 const [review, setReview] = useState<SettingsChange | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 /* What was typed, as the route would receive it. A blank or a word stays what it is, so the engine
    refuses it in its own sentence rather than this form deciding what the admin meant. */
 const request = (): Proposal => {
  const number = (part: string) => part.trim() === '' ? Number.NaN : Number(part);
  return row.shape === 'steps'
   ? { timing: row.id, stepMinutes: text.split(',').map(number), reason, expectedVersion }
   : { timing: row.id, minutes: text.trim() === '' ? undefined : number(text), reason, expectedVersion };
 };
 const check = (event: FormEvent) => {
  event.preventDefault();
  const result = previewChange(request());
  setRefused(result.ok ? null : result.refusal);
  setReview(result.ok ? result.change : null);
 };
 const confirm = () => {
  const result = proposeChange(request());
  if (!result.ok) { setRefused(result.refusal); setReview(null); return; }
  onApplied(result.change);
 };
 return <form className="ss-form" onSubmit={check} aria-label={`${say.change} ${row.label}`}>
  <label htmlFor={id + '-value'}>{row.shape === 'steps' ? say.newSteps : say.newMinutes}</label>
  <input id={id + '-value'} inputMode={row.shape === 'steps' ? 'text' : 'numeric'} value={text} disabled={!!review}
   onChange={event => { setText(event.target.value); setRefused(null); }}/>
  <label htmlFor={id + '-reason'}>{say.reason}</label>
  <textarea id={id + '-reason'} value={reason} rows={3} disabled={!!review} aria-describedby={id + '-help'}
   onChange={event => { setReason(event.target.value); setRefused(null); }}/>
  <p className="helper" id={id + '-help'}>{say.reasonHelp}</p>
  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
  {review
   ? <div className="ss-confirm" role="group" aria-labelledby={id + '-confirm'}>
     <strong id={id + '-confirm'}>{fill(say.confirmQuestion, { setting: row.label, from: minutesText(from), to: minutesText(review.to) })}</strong>
     <p>{say.appliesFrom}</p>
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
