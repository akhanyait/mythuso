import { useId, useState } from 'react';
import voice from '../../../../../../packages/catalog/voice.json' with { type: 'json' };
import prefs from '../../../../../../packages/catalog/user-preferences.json' with { type: 'json' };
import { cardOf, g1, voiceChoicesOf, type VoiceLabel } from '../../../lib/gilbertone-admin';
import { fill } from '../../../lib/portal';
import { presentationVoiceNow, settingsScreen } from '../../../lib/settings';
import { BuildWord, Empty, Loading, Region, RovingList } from '../Parts';
import { CardStatusWord, LiveButton, LiveSentence, Locked } from './Controls';
import { VoicePreview } from './VoicePreview';
import { useAssistantVoice } from './useAssistantVoice';
import { useVoiceSaving } from './useVoiceSaving';

/* GilbertOne · Voice (§7.3): the query-to-voice mapping, where the clinical boundary is enforced.
 *
 * Every row is packages/catalog/voice.json's. Emergency, refusal and escalation are the clinical-
 * delivery zone: locked to a neutral register, answered at level 0, changed only through the Clinician
 * Review Queue — and so drawn as a sentence with no control at all. Whether a row may offer a voice to
 * choose and save is the class's own previewMaySaveAsDefault, read here and held by the build, never
 * decided by its label.
 *
 * Since the founder's decision of 27 September 2026 the four presentation rows are live: each draws a
 * select of the two labels the class's setting allows, showing the value in force from lib/settings.ts,
 * and a Save as default that records the choice as a setting with a reason — the same door, the same
 * rules and the same words as the Configuration tab, where the same four settings are also drawn. The
 * value saved is a label, never a voice name: whoever speaks resolves it per language against
 * assistant.json, and an emergency, a refusal or an escalation never asks it. What this preview keeps is
 * said on the screen in the contract's sentence: this tab's memory for the session, the shipped default
 * being the contract's.
 *
 * No voice is named in this file. The voices are packages/catalog/assistant.json's, per language, and
 * a language with no voice is shown as not available with the contract's own notice rather than hidden
 * (§07's V03, in user-preferences.json's and voice.json's words — read from the contracts rather than
 * from the demonstrator's lib/gilbertone.ts, whose import would split that module into a chunk of its own
 * and add its name to what the patient's first load carries). Push-to-talk and the caption rule are locked
 * settings, drawn as text. The wake-word question is drawn as what it is: open, and the founder's. */

const zoneWord = (configurable: string) =>
 configurable === 'locked' ? g1.voice.lockedWord : configurable === 'clinician-only' ? g1.voice.clinicianOnlyWord : g1.voice.tenantWord;

export function VoiceScreen() {
 const words = g1.voice;
 const zone = (id: string) => voice.zones.find(z => z.id === id)!;
 const locked = voice.lockedSettings;
 const saving = useVoiceSaving();
 const saveWhy = useId();
 const reasonField = useId();
 const outcomeId = useId();
 const assistantVoice = useAssistantVoice();
 /* Each presentation row's chosen-but-unsaved label, keyed by class and by the settings version it was
    chosen against: a choice made before the value in force moved — the preview below saved, or the
    Configuration tab did in the same session — is dropped rather than shown as if it were still pending
    over a value it was never compared with. A row with no choice shows the value in force; Save is
    described by nothingToSave while the two are the same. */
 const now = presentationVoiceNow();
 const [choices, setChoices] = useState<{ version: number; byClass: Readonly<Record<string, VoiceLabel>> }>({ version: now.settingsVersion, byClass: {} });
 const chosen = choices.version === now.settingsVersion ? choices.byClass : {};
 const setChosen = (byClass: Readonly<Record<string, VoiceLabel>>) => setChoices({ version: now.settingsVersion, byClass });
 const inForce = now.byClass as Readonly<Record<string, VoiceLabel>>;
 return <>
  <Locked title={zone('clinical-delivery').label}>{voice.refusals.find(r => r.id === 'clinical-delivery-voice-is-not-configurable')!.statement} {voice.clinicalDeliveryRegister.sentence}</Locked>

  <Region title={words.zonesHeading} count={voice.zones.length}>
   <RovingList label={`${voice.zones.length} zones`} rows={voice.zones.map(z => ({
    key: z.id,
    content: <><strong>{z.label}</strong><span className="g1-tag">{zoneWord(z.configurable)}</span><span>{z.sentence}</span></>
   }))}/>
  </Region>

  <Region title={words.mappingHeading} count={voice.queryClasses.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table g1-voice-table">
    <caption>{voice.reads.why}</caption>
    <thead><tr><th scope="col">Class</th><th scope="col">Zone</th><th scope="col">Register</th><th scope="col">Voice</th></tr></thead>
    <tbody>{voice.queryClasses.map(c => {
     const z = zone(c.zone);
     const shown = chosen[c.id] ?? inForce[c.id];
     const unchanged = shown === inForce[c.id];
     return <tr key={c.id}>
      <th scope="row">{c.label}</th>
      <td>{z.label} · <span className="g1-tag">{zoneWord(z.configurable)}</span></td>
      <td>{c.register}</td>
      <td>{c.previewMaySaveAsDefault
       ? <div className="g1-voice-cell">
        <select aria-label={fill(words.voiceSelectLabel, { class: c.label })} value={shown} onChange={event => { setChosen({ ...chosen, [c.id]: event.target.value as VoiceLabel }); saving.clear(); }}>
         {voiceChoicesOf(c.id).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <LiveButton id="voice-save-as-default" name={`Save as default: ${c.label}`} describedBy={saving.gate.locked ? `${saveWhy}-gate` : unchanged ? `${saveWhy}-same` : saveWhy} disabled={unchanged || saving.gate.locked} onClick={() => saving.save(c.id, shown!)}/>
        <small>{fill(words.inForceSentence, { label: voiceChoicesOf(c.id).find(o => o.value === inForce[c.id])?.label ?? inForce[c.id]! })}</small>
       </div>
       : <span className="g1-locked-cell">{words.lockedRowSentence}</span>}</td>
     </tr>;
    })}</tbody>
   </table></div>
   <div className="g1-save" role="group" aria-label={words.saveHeading}>
    <label className="g1-field" htmlFor={reasonField}>
     <span>{settingsScreen.reason}</span>
     <textarea id={reasonField} value={saving.reason} onChange={event => { saving.setReason(event.target.value); saving.clear(); }} aria-describedby={`${reasonField}-help`} autoComplete="off" spellCheck={false}/>
     <small id={`${reasonField}-help`}>{settingsScreen.reasonHelp}</small>
    </label>
    <LiveSentence id="voice-save-as-default" sentenceId={saveWhy}/>
    <p id={`${saveWhy}-same`} className="g1-refusal">{words.nothingToSave}</p>
    <p id={`${saveWhy}-gate`} className={saving.gate.locked ? 'g1-refusal' : 'helper'}>{saving.gate.sentence}</p>
    <p className="helper">{words.sessionSentence}</p>
    {saving.sentence && <p id={outcomeId} className={saving.outcome?.ok ? 'g1-verdict' : 'g1-rejected'} role={saving.outcome?.ok ? 'status' : 'alert'}>{saving.sentence}</p>}
   </div>
   <p className="helper">{voice.clinicalDeliveryRegister._reviewedByWhy}</p>
  </Region>

  <Region title={words.lockedSettingsHeading}>
   <Locked title="Push-to-talk">{locked.pushToTalk.sentence}</Locked>
   <Locked title="The written words">{locked.captions.sentence}</Locked>
   <Empty heading={`The wake word · ${locked.wakeWordQuestion.state} · ${locked.wakeWordQuestion.owner}`}>{locked.wakeWordQuestion.sentence} {locked.wakeWordQuestion.discrepancy}</Empty>
  </Region>

  <Region title={words.providersHeading}>
   {(['tts', 'stt'] as const).map(kind => <div key={kind} className="g1-subregion">
    <h3>{kind === 'tts' ? 'Text to speech' : 'Speech to text'}</h3>
    <RovingList label={`${voice.providers[kind].length} ${kind === 'tts' ? 'text-to-speech' : 'speech-to-text'} providers`} rows={voice.providers[kind].map(id => {
     const card = cardOf(id);
     return { key: id, content: <><strong>{card.name}</strong><CardStatusWord id={card.statusToday}/><BuildWord id={card.buildStatus}/>
      {card.prohibitedFor && <span>Prohibited for {card.prohibitedFor}.</span>}</> };
    })}/>
   </div>)}
   <p className="helper">{voice.providers._perTenantWhy} {voice.providers.onDeviceConversationMode}</p>
  </Region>

  <Region title={words.voicesHeading} count={assistantVoice?.languages.length}>
   {assistantVoice ? <RovingList label={`${assistantVoice.languages.length} languages`} rows={assistantVoice.languages.map(l => ({
    key: l.id,
    content: <><strong>{l.name}</strong>
     {l.ttsAvailable && l.ttsVoices
      ? <span>{Object.values(l.ttsVoices).map(v => <code key={v} className="g1-inline">{v}</code>)}</span>
      : <span><span className="g1-tag">{words.notAvailableWord}</span> {assistantVoice.voiceUnavailableNotice}</span>}</>
   }))}/> : <Loading/>}
   <p className="helper">{voice.languages.sentence}</p>
   <Empty heading={prefs.refusals.find(r => r.id === 'no-voice-chooser-for-a-person')!.statement}>{prefs.voiceChoice.sentence} {prefs.voiceChoice.why} {voice.languages.why}</Empty>
  </Region>

  <Region title={words.parametersHeading} count={voice.parameters.tts.length + voice.parameters.stt.length}>
   {/* Each parameter as its own gated card: what it is, who may set it, and — where the contract holds
       no range — the axis's own "not decided" reason in a notice. No slider and no number is drawn,
       because user-preferences.json's rate and pitch axes hold bounds:null on purpose: a range nobody
       has listened at the edges is a figure nobody tested. The cards read as a configurator's shape
       while staying exactly as honest as the list they replace. */}
   <div className="g1-grid">
    {voice.parameters.tts.map(p => {
     const axis = p.boundsFrom ? prefs.axes.find(a => a.id === p.id) : undefined;
     const undecided = axis !== undefined && 'bounds' in axis && axis.bounds === null;
     return <article key={p.id} className="g1-card g1-param">
      <h3>{p.id}{undecided && <span className="g1-tag">{words.notDecided}</span>}</h3>
      <p className="g1-param-who">{p.who}</p>
      {axis !== undefined && '_boundsWhy' in axis && <p className="g1-param-range">{axis._boundsWhy}</p>}
      <p>{p.why}</p>
     </article>;
    })}
    {voice.parameters.stt.map(p => {
     const undecided = 'value' in p && p.value === null;
     return <article key={p.id} className="g1-card g1-param">
      <h3>{p.id}{undecided && <span className="g1-tag">{words.notDecided}</span>}</h3>
      {'from' in p && <p className="g1-param-who">{p.from}</p>}
      <p>{p.why}</p>
     </article>;
    })}
   </div>
   <p className="helper">{prefs.persistence.sentence}</p>
  </Region>

  <Region title={words.previewHeading}>
   <VoicePreview placement="the Voice screen"/>
  </Region>

  <Region title="What this screen refuses" count={voice.refusals.length}>
   <ul className="pt-refusals">{voice.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
