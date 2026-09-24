import { useId, useState } from 'react';
import voice from '../../../../../../packages/catalog/voice.json' with { type: 'json' };
import { containsPHI } from '../../../../../../packages/gilbertone/src/phi.ts';
import { g1 } from '../../../lib/gilbertone-admin';
import { GatedAction } from './Controls';

/* The voice preview panel (§7.3.1), one component with two placements: the Voice screen, and every
 * text-to-speech card in the API Registry, so a voice could be heard before its provider is configured.
 *
 * It answers the plan's five questions by saying, for each, what it can and cannot do today, and it
 * holds the panel's three refusals as behaviour rather than as copy:
 *
 *   It rejects anything that looks like a person's details, as the administrator types, using
 *   packages/gilbertone's own detector — the one the assistant service runs on every turn — so the
 *   preview and the service cannot disagree about what an identifier looks like. The sentence stays
 *   in this component's state and nowhere else: no storage, no request.
 *
 *   It shows the cost and the speed before the Play button, and a running total for the session. No
 *   price is recorded and nothing has been measured (voice.json#previewPanel.costAndLatency), so what it
 *   shows is that, not a figure.
 *
 *   It never offers Save as default on the emergency, refusal or escalation register. The row is read
 *   from the class's own previewMaySaveAsDefault, never from its name.
 *
 * And Play is disabled. There is no speak route an administrator signs in to, the patients' route is
 * not this panel's to use, and the cloud voice is not configured for previews. This file makes no
 * request of any kind and asks the browser to speak nothing; scripts/check-boundaries.mjs fails the
 * build if it, or anything under features/portal/gilbertone, names a speak route or a synthesiser. */

export function VoicePreview({ placement }: { placement: string }) {
 const words = g1.voice;
 const panel = voice.previewPanel;
 const [classId, setClassId] = useState(voice.queryClasses[0]!.id);
 const [text, setText] = useState('');
 const classField = useId();
 const textField = useId();
 const verdict = useId();
 const chosen = voice.queryClasses.find(c => c.id === classId)!;
 const refused = text.trim() !== '' && containsPHI(text);
 const lockedRefusal = voice.refusals.find(r => r.id === 'no-save-as-default-on-a-locked-row')!.statement;
 return <section className="g1-preview" aria-label={`${words.previewHeading} — ${placement}`}>
  <ol className="g1-questions">{panel.questions.map(q => <li key={q}>{q}</li>)}</ol>
  <div className="g1-preview-fields">
   <label className="g1-field" htmlFor={classField}>
    <span>{words.previewClassLabel}</span>
    <select id={classField} value={classId} onChange={event => setClassId(event.target.value)}>
     {voice.queryClasses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
   </label>
   <label className="g1-field wide" htmlFor={textField}>
    <span>{words.previewTextLabel}</span>
    <textarea id={textField} value={text} onChange={event => setText(event.target.value)}
     aria-describedby={verdict} aria-invalid={refused || undefined} autoComplete="off" spellCheck={false}/>
    <small>{words.previewTextHint}</small>
   </label>
  </div>
  <p id={verdict} className={refused ? 'g1-rejected' : 'g1-verdict'} role={refused ? 'alert' : undefined}>
   {refused ? panel.rejectsPatientIdentifiers.sentence : text.trim() ? words.previewAccepted : ''}
  </p>
  <dl className="pt-facts g1-cost">
   <div className="g1-fact"><dt>{words.previewCostLabel}</dt><dd>{voice.refusals.find(r => r.id === 'no-billed-preview-without-its-cost')!.statement} {panel.costAndLatency.why}</dd></div>
   <div className="g1-fact"><dt>{words.previewTotalLabel}</dt><dd>{words.previewTotalEmpty}</dd></div>
  </dl>
  <GatedAction id="voice-play"/>
  {chosen.previewMaySaveAsDefault
   ? <GatedAction id="voice-save-as-default"/>
   : <p className="g1-refusal">{lockedRefusal}</p>}
 </section>;
}
