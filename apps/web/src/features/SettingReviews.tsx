import { useId, useState, type FormEvent } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import {
 confirmSettingReview, doctorOnDuty, pendingReviewsNow, settingsEngineOf, settingsScreen, useSettingsHistories, useSettingsReviews,
 type PendingReview, type Review
} from '../lib/settings';
import { whoIs } from '../lib/roles';
import { valueText } from './Configuration';

/* Settings waiting for clinical review, on the doctor's review queue.
 *
 * A setting that decides who may do what to a patient — who may be offered an injection, a family planning
 * or a sick-note visit, whether an Encounter entry counts as signed — is in force the moment an admin
 * changes it, and says it is not clinically reviewed until somebody holding the capability it names
 * confirms the exact value. This is where that confirmation is given: each value waiting on one, who put it
 * in force, from what, to what and why, and a reason the reviewer writes in her own words.
 *
 * WHAT THE PANEL WILL NOT DO. It never confirms a value other than the one on the card: the version is the
 * card's, so a change made after the doctor opened it is refused as not in force rather than confirmed
 * under her name. It never confirms a change the doctor made herself, nor one without a reason, and a
 * doctor whose registration has lapsed is refused as not permitted. Each refusal is the contract's
 * sentence, asked of packages/engines/src/settings through lib/settings.ts; nothing here decides one.
 *
 * It lives in the doctor's workspace, which is fetched only when a doctor opens it, so no patient
 * downloads it. Held in the tab's memory beside the settings it confirms, and the preview sentence says so.
 */
const say = settingsScreen;
const fill = (sentence: string, values: Readonly<Record<string, string>>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const ZONE = 'Africa/Johannesburg';
const whenOf = (at: number) => `${new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: ZONE })}, ${new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE })}`;
const personOf = (ref: string) => `${whoIs(ref, '').subject.name} · ${ref}`;

export function SettingReviews() {
 useSettingsHistories();
 useSettingsReviews();
 const id = useId();
 const [confirmed, setConfirmed] = useState<{ label: string; review: Review } | null>(null);
 const pending = pendingReviewsNow();
 return <section className="panel sr-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>Settings waiting for clinical review</h2></div>
  <p className="helper">A setting that decides who may do what to a patient is in force as soon as an admin changes it, and is shown as not clinically reviewed until a doctor confirms that exact value. Care is not stopped while it waits. A later change needs a review of its own.</p>
  <p className="helper">{say.preview}</p>
  {confirmed && <p className="sr-confirmed" role="status"><ShieldCheck size={16} aria-hidden="true"/>{confirmed.label}: {fill(say.reviewed, { who: personOf(confirmed.review.byRef), on: whenOf(confirmed.review.at) })}.</p>}
  {pending.length
   ? <ol className="sr-list">{pending.map(item => <ReviewItem key={`${item.engine}-${item.setting.key}-${item.settingsVersion}`} item={item}
      onConfirmed={review => setConfirmed({ label: item.setting.label, review })}/>)}</ol>
   : <p className="helper">Nothing is waiting for a clinical review.</p>}
 </section>;
}

function ReviewItem({ item, onConfirmed }: { item: PendingReview; onConfirmed: (review: Review) => void }) {
 const id = useId();
 const [reason, setReason] = useState('');
 const [refused, setRefused] = useState<string | null>(null);
 const { setting, change } = item;
 const confirm = (event: FormEvent) => {
  event.preventDefault();
  const result = confirmSettingReview(item.engine, { setting: setting.key, settingsVersion: item.settingsVersion, reason });
  if (!result.ok) { setRefused(result.refusal.statement); return; }
  onConfirmed(result.review);
 };
 return <li className="sr-item" aria-labelledby={id + '-label'}>
  <div className="sr-head">
   <strong id={id + '-label'}>{setting.label}</strong>
   <span className="pill cf-review is-unreviewed"><ShieldAlert size={15} aria-hidden="true"/>{say.notReviewed}</span>
  </div>
  <p className="ss-meta">{settingsEngineOf(item.engine).block.heading} · {fill(say.version, { version: String(item.settingsVersion) })}</p>
  <dl className="cf-rules sr-facts">
   <div><dt>{say.who}</dt><dd>{change ? `${personOf(change.byRef)}, ${whenOf(change.at)}` : fill(say.proposedBy, { who: setting.default.proposedBy ?? setting.default.decidedBy ?? '' })}</dd></div>
   <div><dt>{say.from}</dt><dd>{change ? valueText(setting, change.from) : say.values.empty}</dd></div>
   <div><dt>{say.to}</dt><dd>{valueText(setting, item.value)}</dd></div>
   <div><dt>{say.why}</dt><dd>{change ? change.reason : setting.default.proposedBecause ?? setting.default.why}</dd></div>
  </dl>
  <form className="ss-form" onSubmit={confirm} aria-label={`Confirm the clinical review of ${setting.label}`}>
   <label htmlFor={id + '-reason'}>Why this value is clinically safe</label>
   <textarea id={id + '-reason'} rows={3} value={reason} aria-describedby={id + '-help'} onChange={event => { setReason(event.target.value); setRefused(null); }}/>
   <p className="helper" id={id + '-help'}>Recorded against {doctorOnDuty() ? personOf(doctorOnDuty()!) : 'you'} and this version only.</p>
   {refused && <p className="fs-refused" role="alert">{refused}</p>}
   <div className="button-row">
    <button type="submit" className="primary">Confirm the clinical review<span className="visually-hidden"> of {setting.label}</span></button>
   </div>
  </form>
 </li>;
}
