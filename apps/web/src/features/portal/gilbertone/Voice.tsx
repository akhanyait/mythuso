import { useId } from 'react';
import voice from '../../../../../../packages/catalog/voice.json' with { type: 'json' };
import prefs from '../../../../../../packages/catalog/user-preferences.json' with { type: 'json' };
import { cardOf, g1 } from '../../../lib/gilbertone-admin';
import { BuildWord, Empty, Loading, Region, RovingList } from '../Parts';
import { CardStatusWord, GatedButton, GatedRefusal, Locked } from './Controls';
import { VoicePreview } from './VoicePreview';
import { useAssistantVoice } from './useAssistantVoice';

/* GilbertOne · Voice (§7.3): the query-to-voice mapping, where the clinical boundary is enforced.
 *
 * Every row is packages/catalog/voice.json's. Emergency, refusal and escalation are the clinical-
 * delivery zone: locked to a neutral register, answered at level 0, changed only through the Clinician
 * Review Queue — and so drawn as a sentence with no control at all. Whether a row may offer Save as
 * default is the class's own previewMaySaveAsDefault, read here and held by the build, never decided by
 * its label. The presentation rows offer it disabled, held by G29, because no tenant exists to save a
 * voice for and nobody has approved one.
 *
 * No voice is named in this file. The voices are packages/catalog/assistant.json's, per language, and
 * a language with no voice is shown as not available with the contract's own notice rather than hidden
 * (§07's V03, in user-preferences.json's and voice.json's words — read from the contracts rather than
 * from the demonstrator's lib/gilbertone.ts, whose import would split that module into a chunk of its own
 * and add its name to what the patient's first load carries). Push-to-talk and the caption rule are locked settings, drawn as text. The wake-word
 * question is drawn as what it is: open, and the founder's. */

const zoneWord = (configurable: string) =>
 configurable === 'locked' ? g1.voice.lockedWord : configurable === 'clinician-only' ? g1.voice.clinicianOnlyWord : g1.voice.tenantWord;

export function VoiceScreen() {
 const words = g1.voice;
 const zone = (id: string) => voice.zones.find(z => z.id === id)!;
 const locked = voice.lockedSettings;
 const saveRefusal = useId();
 const assistantVoice = useAssistantVoice();
 return <>
  <Locked title={zone('clinical-delivery').label}>{voice.refusals.find(r => r.id === 'clinical-delivery-voice-is-not-configurable')!.statement} {voice.clinicalDeliveryRegister.sentence}</Locked>

  <Region title={words.zonesHeading} count={voice.zones.length}>
   <RovingList label={`${voice.zones.length} zones`} rows={voice.zones.map(z => ({
    key: z.id,
    content: <><strong>{z.label}</strong><span className="g1-tag">{zoneWord(z.configurable)}</span><span>{z.sentence}</span></>
   }))}/>
  </Region>

  <Region title={words.mappingHeading} count={voice.queryClasses.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{voice.reads.why}</caption>
    <thead><tr><th scope="col">Class</th><th scope="col">Zone</th><th scope="col">Register</th><th scope="col">Voice</th></tr></thead>
    <tbody>{voice.queryClasses.map(c => {
     const z = zone(c.zone);
     return <tr key={c.id}>
      <th scope="row">{c.label}</th>
      <td>{z.label} · <span className="g1-tag">{zoneWord(z.configurable)}</span></td>
      <td>{c.register}</td>
      <td>{c.previewMaySaveAsDefault
       ? <GatedButton id="voice-save-as-default" name={`Save as default: ${c.label}`} describedBy={saveRefusal}/>
       : <span className="g1-locked-cell">{words.lockedRowSentence}</span>}</td>
     </tr>;
    })}</tbody>
   </table></div>
   <GatedRefusal id="voice-save-as-default" refusalId={saveRefusal}/>
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
