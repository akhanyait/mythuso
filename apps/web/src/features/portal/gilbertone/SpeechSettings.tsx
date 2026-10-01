import { Suspense, lazy, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import voice from '../../../../../../packages/catalog/voice.json' with { type: 'json' };
import prefs from '../../../../../../packages/catalog/user-preferences.json' with { type: 'json' };
import { defaultValueOf, valueText } from '../../Configuration';
import { cardOf, g1, providersInForce, settingOfClass, voiceChoicesOf } from '../../../lib/gilbertone-admin';
import { fill, portalContract } from '../../../lib/portal';
import { historyOf, settingsEngineOf, settingsScreen, speechKeys, type Change, type Setting, type SettingValue } from '../../../lib/settings';
import { ChoiceChips, RangeSlider, Switch } from '../Fields';
/* The settings page's two shapes, on a line of their own: the line above is the one the build holds this
   screen's controls to, word for word. */
import { FieldRow, SaveBar } from '../Fields';
import { lastChangedText } from '../../Configuration';
import { BuildWord, Empty, Loading, Region, RovingList } from '../Parts';
import { CardStatusWord, LiveButton, LiveSentence, Locked } from './Controls';
import { VoicePreview } from './VoicePreview';
import { useAssistantVoice } from './useAssistantVoice';
import { useVoiceSaving, type SettingChange } from './useVoiceSaving';
import { Badge } from '../../../ui/Badge';

/* GilbertOne · Speech settings: the Voice screen (§7.3) and the Speech settings screen of 28 September 2026 as
 * one screen, on the founder's instruction of the same day — "put the change fields on top; they are too at
 * the bottom. Voice and Speech settings are duplicated; collapse them into one place, Speech settings."
 *
 * THE ORDER IS THE FOUNDER'S. First the founder's gate, then one sentence saying where what is shown came
 * from, then the change fields: a panel with a card per presentation
 * register — its provider and its voice as chips, what is in force, and its own Save as default — and under
 * them the knobs in three groups — Azure Speech's, ElevenLabs', and the ceilings, timeouts, fallback and own
 * voice every provider shares — as sliders, chips and switches, each group with its own Save — and the reason
 * once, in the save bar held at the panel's foot (28 September 2026: one settings page across the portal). Then the
 * preview panel. Then, folded under one disclosure that starts closed, everything read-only that the two old
 * screens drew: the zones, the query-to-voice table with the locked clinical rows, what is not a setting, the
 * providers, the languages and their voices, the parameters, the own-voice record and the refusals. Nothing
 * locked becomes a control: a clinical-delivery row keeps the contract's sentence and nothing else.
 *
 * EVERY FIELD IS THE PORTAL'S SHARED ONE (features/portal/Fields.tsx): a radio chip, a range or a switch, none
 * of which can take a key; the one thing typed here is the reason, in a textarea. Which setting a register's
 * chips change is voice.json's to say (the class names its voice setting; the engine's speech keys, through
 * lib/settings.ts, name its provider setting), and every register card is drawn under the class's own previewMaySaveAsDefault,
 * never by name. A change goes through useVoiceSaving() — this tab's history as a preview, the assistant
 * service's own inside the founder's session — so the founder's saved voice reaches the preview's Play and
 * the service's next spoken answer, and the refusal for a missing reason, a stale version or an unchanged
 * value is the shared rules' sentence. A choice made before the value in force moved is dropped rather than
 * shown as pending over a value it was never compared with.
 *
 * No voice is named in this file. The voices are packages/catalog/assistant.json's, per language, read over a
 * dynamic import; a language with no voice is shown as not available in the contract's notice. */

/* The founder's sign-in, drawn where the change fields would be while the gate is shut, on a dynamic import so
   nobody who does not open a settings screen downloads it. */
const FounderGatePanel = lazy(() => import('./founder/FounderAccess').then(m => ({ default: m.FounderGatePanel })));

const zoneWord = (configurable: string) =>
 configurable === 'locked' ? g1.voice.lockedWord : configurable === 'clinician-only' ? g1.voice.clinicianOnlyWord : g1.voice.tenantWord;
const providerWordOf = (cardId: string) => cardId.split('-')[0]!;
const NUMBERS = new Set(['count', 'percentage']);

/* One knob, drawn by its type with the shared control: a slider between the contract's bounds with the
   default marked, chips over the allowed choices, or a switch for a bare boolean. Every word on it is the
   setting's own, through the Configuration screen's valueText, so the value reads here as it does there. */
function Knob({ setting, value, disabled, inForce, onChange }: { setting: Setting; value: SettingValue; disabled: boolean; inForce: string; onChange: (next: SettingValue) => void }) {
 const id = useId();
 if (NUMBERS.has(setting.type) && setting.bounds && typeof value === 'number') {
  const { lowest, highest } = setting.bounds;
  const shipped = defaultValueOf(setting);
  const byDefault = typeof shipped === 'number' ? shipped : null;
  const marks = [
   { value: lowest.value, label: valueText(setting, lowest.value) },
   ...(byDefault !== null && byDefault > lowest.value && byDefault < highest.value ? [{ value: byDefault, label: fill(settingsScreen.defaultIs, { value: valueText(setting, byDefault) }) }] : []),
   { value: highest.value, label: valueText(setting, highest.value) }
  ];
  return <FieldRow className="g1-knob" label={setting.label} help={setting.help} htmlFor={id} inForce={inForce}>
   <RangeSlider id={id} label={setting.label} min={lowest.value} max={highest.value} step="fit" value={value} valueText={valueText(setting, value)} marks={marks} disabled={disabled} onChange={onChange}/>
  </FieldRow>;
 }
 if (setting.type === 'boolean' && !setting.allowed) {
  return <FieldRow className="g1-knob" inForce={inForce}>
   <Switch label={<><strong>{setting.label}</strong><span>{setting.help}</span></>} checked={value === true} disabled={disabled} stateText={value === true ? settingsScreen.values.on : settingsScreen.values.off} onChange={onChange}/>
  </FieldRow>;
 }
 return <FieldRow className="g1-knob" inForce={inForce}>
  <ChoiceChips legend={<><strong>{setting.label}</strong><span>{setting.help}</span></>} name={id} disabled={disabled} className="g1-knob-chips"
   chips={(setting.allowed ?? []).map(choice => ({ key: String(choice.value), label: choice.label, checked: value === choice.value, onChange: () => onChange(choice.value) }))}/>
 </FieldRow>;
}

/* A block of the folded half: a region under its own heading, so a closed fold is still a set of landmarks a
   screen reader can find by name once it is opened. */
function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
 return <Region title={title} count={count}>{children}</Region>;
}

export function SpeechSettingsScreen() {
 const words = g1.speech;
 const voiceWords = g1.voice;
 const saving = useVoiceSaving();
 const source = saving.source;
 const snapshot = source.snapshot;
 const assistantVoice = useAssistantVoice();
 const block = settingsEngineOf('assistant').block;
 const settingOf = (key: string) => {
  const found = block.items.find(s => s.key === key);
  if (!found) throw new Error(`The assistant engine has no setting "${key}".`);
  return found;
 };
 const inForceOf = (key: string): SettingValue => snapshot.values[key]!;
 const shownText = (key: string) => valueText(settingOf(key), inForceOf(key));
 const reasonField = useId();
 const saveWhy = useId();
 const knobsWhy = useId();
 /* What has been chosen and not yet saved, keyed by setting and by the settings version it was chosen against. */
 const [drafts, setDrafts] = useState<{ version: number; byKey: Readonly<Record<string, SettingValue>> }>({ version: snapshot.settingsVersion, byKey: {} });
 const draft = drafts.version === snapshot.settingsVersion ? drafts.byKey : {};
 const shownOf = (key: string): SettingValue => key in draft ? draft[key]! : inForceOf(key);
 const setDraft = (key: string, value: SettingValue) => { setDrafts({ version: snapshot.settingsVersion, byKey: { ...draft, [key]: value } }); saving.clear(); };
 const changesOf = (keys: readonly string[]): SettingChange[] => keys.filter(key => key in draft && draft[key] !== inForceOf(key)).map(key => ({ setting: key, value: draft[key]! }));
 const disabled = !source.canSave || saving.busy;
 /* The history the value in force came from — the service's inside the founder's session, this tab's in the
    preview — so every row's in-force line says who changed it and when, as the Configuration cards do. */
 const history: readonly Change[] = source.phase === 'service' ? source.history : source.phase === 'tab' ? historyOf('assistant') : [];
 const inForceLine = (key: string) => `${settingsScreen.inForce} · ${shownText(key)} · ${lastChangedText(history.filter(c => c.setting === key))}`;
 /* Which card was saved last, and whether an odd or an even time, so the card that took the change settles with one brief
    flash once the version in force moves — and only then, never on a refused save. The parity names the
    flash (fields.css, "One settings page"), so a second save of the same card replays it without a remount. */
 const [pressed, setPressed] = useState<string | null>(null);
 const [flash, setFlash] = useState<{ id: string; odd: boolean } | null>(null);
 const seenVersion = useRef(snapshot.settingsVersion);
 useEffect(() => {
  if (snapshot.settingsVersion === seenVersion.current) return;
  seenVersion.current = snapshot.settingsVersion;
  if (pressed) setFlash(was => ({ id: pressed, odd: !was?.odd }));
 }, [snapshot.settingsVersion, pressed]);
 const savedOf = (id: string) => flash?.id === id ? (flash.odd ? 'odd' : 'even') : undefined;

 /* The registers with a chooser are exactly the classes whose own previewMaySaveAsDefault allows one. */
 const registers = voice.queryClasses.filter(c => c.previewMaySaveAsDefault);
 const providerKeyOf = (classId: string) => {
  const key = speechKeys.providerByClass[classId as keyof typeof speechKeys.providerByClass];
  if (!key) throw new Error(`packages/engines names no provider setting for the presentation class "${classId}".`);
  return key;
 };
 /* The knobs, grouped by the built speaking card whose name their key starts with, and the rest shared. */
 const ttsCards = voice.providers.tts.map(cardOf).filter(c => c.buildStatus === 'built');
 const defaultCard = cardOf(voice.providers.tts[0]!);
 const knobKeysOf = (cardId: string) => block.items.filter(s => s.key.startsWith(`${providerWordOf(cardId)}-`)).map(s => s.key);
 const registerKeys = new Set([...registers.map(c => c.setting!), ...registers.map(c => providerKeyOf(c.id))]);
 const sharedKeys = block.items.filter(s => !registerKeys.has(s.key) && !ttsCards.some(c => s.key.startsWith(`${providerWordOf(c.id)}-`))).map(s => s.key);
 const groups = [...ttsCards.filter(c => knobKeysOf(c.id).length).map(c => ({ id: c.id, label: c.name, keys: knobKeysOf(c.id) })), { id: 'shared', label: words.everyProviderWord, keys: sharedKeys }];

 const zone = (id: string) => voice.zones.find(z => z.id === id)!;
 const locked = voice.lockedSettings;
 const own = voice.ownVoice;
 const refusal = (id: string) => voice.refusals.find(r => r.id === id)!;
 const providers = providersInForce(source.speech);
 const inForceWords = (classId: string) => {
  const card = providers.find(p => p.classId === classId)?.card;
  const label = voiceChoicesOf(classId).find(o => o.value === (source.voices.byClass as Readonly<Record<string, string>>)[classId])?.label ?? '';
  return `${card?.name ?? ''}, ${label}`;
 };

 return <>
  <Suspense fallback={null}><FounderGatePanel sentence={saving.gate.sentence} phase={saving.gate.phase}/></Suspense>
  <p className="g1-source" role="status">{source.sentence}</p>

  <Region title={words.changeHeading} count={registers.length + groups.length}>
   <div className="g1-change">
    <p className="g1-change-intro">{words.changeIntro}</p>
    <LiveSentence id="voice-save-as-default" sentenceId={saveWhy}/>
    <p id={`${saveWhy}-same`} className="helper">{words.nothingChanged}</p>

    <h3 className="g1-change-heading">{words.registersHeading}</h3>
    <div className="g1-registers">
     {registers.map(c => {
      const voiceKey = settingOfClass(c.id).key;
      const providerKey = providerKeyOf(c.id);
      const providerSetting = settingOf(providerKey);
      const changes = changesOf([providerKey, voiceKey]);
      return <article key={c.id} className="g1-register" data-saved={savedOf(c.id)} aria-label={c.label}>
       <h4>{c.label}</h4>
       <p className="g1-register-why">{c.why}</p>
       <ChoiceChips legend={fill(words.providerLabel, { register: c.label })} name={`${saveWhy}-${c.id}-provider`} disabled={disabled} className="g1-register-chips"
        chips={(providerSetting.allowed ?? []).map(o => ({ key: String(o.value), label: o.label, checked: shownOf(providerKey) === o.value, onChange: () => setDraft(providerKey, o.value) }))}/>
       <ChoiceChips legend={fill(words.voiceLabel, { register: c.label })} name={`${saveWhy}-${c.id}-voice`} disabled={disabled} className="g1-register-chips"
        chips={voiceChoicesOf(c.id).map(o => ({ key: o.value, label: o.label, checked: shownOf(voiceKey) === o.value, onChange: () => setDraft(voiceKey, o.value) }))}/>
       <small className="g1-register-inforce">{fill(voiceWords.inForceSentence, { label: inForceWords(c.id) })}</small>
       <LiveButton id="voice-save-as-default" name={fill(words.saveRegister, { register: c.label })} describedBy={!source.canSave ? `${saveWhy}-gate` : changes.length ? saveWhy : `${saveWhy}-same`} disabled={disabled || !changes.length} onClick={() => { setPressed(c.id); void saving.save(changes); }}/>
      </article>;
     })}
    </div>

    <h3 className="g1-change-heading">{words.knobsHeading}</h3>
    <LiveSentence id="speech-save-settings" sentenceId={knobsWhy}/>
    <div className="g1-knob-groups">
     {groups.map(group => {
      const changes = changesOf(group.keys);
      return <section key={group.id} className="g1-knob-group" data-saved={savedOf(group.id)} aria-label={group.label}>
       <h4>{fill(words.groupWord, { group: group.label, count: group.keys.length })}</h4>
       {group.keys.map(key => <Knob key={key} setting={settingOf(key)} value={shownOf(key)} disabled={disabled} inForce={inForceLine(key)} onChange={next => setDraft(key, next)}/>)}
       <LiveButton id="speech-save-settings" name={fill(words.saveGroup, { group: group.label })} describedBy={!source.canSave ? `${saveWhy}-gate` : changes.length ? knobsWhy : `${saveWhy}-same`} disabled={disabled || !changes.length} onClick={() => { setPressed(group.id); void saving.save(changes); }}/>
      </section>;
     })}
    </div>
    <p className="helper">{voiceWords.sessionSentence}</p>
    {/* The save bar every settings page ends in: the one reason every Save above writes beside its change, the
        gate's sentence that says when saving is shut, and the verdict of the last Save — held in view at the
        foot of the panel while the cards scroll, so the reason is never a scroll away from the Save it serves. */}
    <SaveBar label={portalContract.settingsPage.saveBarLabel} className="g1-savebar">
     <label className="g1-field g1-reason" htmlFor={reasonField}>
      <span>{settingsScreen.reason}</span>
      <textarea id={reasonField} className="ui-control ui-textarea" value={saving.reason} disabled={disabled} onChange={event => { saving.setReason(event.target.value); saving.clear(); }} aria-describedby={`${reasonField}-help`} autoComplete="off" spellCheck={false}/>
      <small id={`${reasonField}-help`}>{settingsScreen.reasonHelp}</small>
     </label>
     <p id={`${saveWhy}-gate`} className={source.canSave ? 'helper' : 'g1-refusal'}>{saving.gate.sentence}</p>
     {saving.sentence && <p className={saving.ok ? 'g1-verdict' : 'g1-rejected'} role={saving.ok ? 'status' : 'alert'}>{saving.sentence}</p>}
    </SaveBar>
   </div>
  </Region>

  <Region title={voiceWords.previewHeading}>
   <VoicePreview placement={voice.previewPanel.placements[0]!}/>
  </Region>

  <details className="g1-fold">
   <summary><h2>{words.readOnlyHeading}</h2><span>{words.readOnlyIntro}</span></summary>
   <div className="g1-fold-body">
    {source.phase !== 'service' && <Empty heading={words.serviceReadsDefaults.split(':')[0]!}>{words.serviceReadsDefaults}</Empty>}
    <Locked title={zone('clinical-delivery').label}>{refusal('clinical-delivery-voice-is-not-configurable').statement} {voice.clinicalDeliveryRegister.sentence}</Locked>

    <Block title={voiceWords.zonesHeading} count={voice.zones.length}>
     <RovingList label={`${voice.zones.length} zones`} rows={voice.zones.map(z => ({
      key: z.id,
      content: <><strong>{z.label}</strong><Badge size="sm" className="g1-tag">{zoneWord(z.configurable)}</Badge><span>{z.sentence}</span></>
     }))}/>
    </Block>

    <Block title={voiceWords.mappingHeading} count={voice.queryClasses.length}>
     <div className="table-scroll"><table className="result-table admin-table pt-table g1-voice-table">
      <caption>{voice.reads.why}</caption>
      <thead><tr><th scope="col">Class</th><th scope="col">Zone</th><th scope="col">Register</th><th scope="col">Voice</th></tr></thead>
      <tbody>{voice.queryClasses.map(c => {
       const z = zone(c.zone);
       return <tr key={c.id}>
        <th scope="row">{c.label}</th>
        <td>{z.label} · <Badge size="sm" className="g1-tag">{zoneWord(z.configurable)}</Badge></td>
        <td>{c.register}</td>
        <td>{c.previewMaySaveAsDefault ? fill(voiceWords.inForceSentence, { label: inForceWords(c.id) }) : <span className="g1-locked-cell">{voiceWords.lockedRowSentence}</span>}</td>
       </tr>;
      })}</tbody>
     </table></div>
     <p className="helper">{voice.clinicalDeliveryRegister._reviewedByWhy}</p>
    </Block>

    <Block title={words.inForceHeading} count={providers.length}>
     <RovingList label={words.inForceHeading} rows={providers.map(({ classId, card }) => {
      const c = voice.queryClasses.find(q => q.id === classId)!;
      const ownHere = source.speech.ownVoice === 'every-presentation-register' || (source.speech.ownVoice === 'admin-register' && classId === voice.queryClasses.find(q => q.zone === 'presentation' && q.setting?.endsWith('-admin'))?.id);
      return { key: classId, content: <><strong>{c.label}</strong><CardStatusWord id={card.statusToday}/><span>{fill(words.registerSentence, { register: c.label, provider: card.name, voice: voiceChoicesOf(classId).find(o => o.value === (source.voices.byClass as Readonly<Record<string, string>>)[classId])?.label ?? '' })}{ownHere && <> <Badge size="sm" className="g1-tag">{words.ownVoiceOnWord}</Badge></>}</span></> };
     })}/>
     <p className="helper">{refusal('no-provider-setting-on-a-clinical-register').statement}</p>
    </Block>

    <Block title={words.lockedHeading}>
     <Locked title="Push-to-talk">{locked.pushToTalk.sentence}</Locked>
     <Locked title="The written words">{locked.captions.sentence}</Locked>
     <Locked title="Keys and regions">{locked.keysAndRegions.sentence}</Locked>
     <Locked title="Speaking style">{locked.speakingStyle.sentence}</Locked>
     <Locked title="The capture cap">{locked.utteranceCap.sentence}</Locked>
     <Locked title="Who hears">{locked.speechToTextProvider.sentence}</Locked>
     <Empty heading={`The wake word · ${locked.wakeWordQuestion.state} · ${locked.wakeWordQuestion.owner}`}>{locked.wakeWordQuestion.sentence} {locked.wakeWordQuestion.discrepancy}</Empty>
    </Block>

    <Block title={words.providersHeading} count={ttsCards.length}>
     <div className="g1-grid">
      {ttsCards.map(card => {
       const keys = knobKeysOf(card.id);
       return <article key={card.id} className="pt-card g1-card" aria-label={card.name}>
        <h3>{card.name} <CardStatusWord id={card.statusToday}/> <BuildWord id={card.buildStatus}/></h3>
        <dl className="pt-facts">
         <div className="g1-fact"><dt>Residency</dt><dd>{card.regions?.southAfricanRegion ? words.onshoreSentence : fill(words.residencySentence, { default: defaultCard.name })}</dd></div>
         <div className="g1-fact"><dt>Price</dt><dd>{typeof card.pricing?.perMillionCharactersUsd === 'number' ? card.pricing.why : words.noPriceSentence}</dd></div>
         {card.shapesFrom?.exercisedAgainstLiveApi === false && <div className="g1-fact"><dt>Tried live</dt><dd>{words.notExercisedSentence}</dd></div>}
         {card.prohibitedFor && <div className="g1-fact"><dt>Never for</dt><dd>{card.prohibitedFor}.</dd></div>}
        </dl>
        {keys.length
         ? <ul className="pt-refusals" aria-label={fill(words.settingsOfWord, { count: String(keys.length) })}>{keys.map(key => <li key={key}><strong>{settingOf(key).label}: {shownText(key)}</strong> <span>{settingOf(key).help}</span></li>)}</ul>
         : <p className="helper">{card.why}</p>}
       </article>;
      })}
      <article className="pt-card g1-card" aria-label={words.everyProviderWord}>
       <h3>{words.everyProviderWord}</h3>
       <ul className="pt-refusals" aria-label={fill(words.settingsOfWord, { count: String(sharedKeys.length) })}>{sharedKeys.map(key => <li key={key}><strong>{settingOf(key).label}: {shownText(key)}</strong> <span>{settingOf(key).help}</span></li>)}</ul>
      </article>
     </div>
     {(['tts', 'stt'] as const).map(kind => <div key={kind} className="g1-subregion">
      <h3>{kind === 'tts' ? 'Text to speech' : 'Speech to text'}</h3>
      <RovingList label={`${voice.providers[kind].length} ${kind === 'tts' ? 'text-to-speech' : 'speech-to-text'} providers`} rows={voice.providers[kind].map(id => {
       const card = cardOf(id);
       return { key: id, content: <><strong>{card.name}</strong><CardStatusWord id={card.statusToday}/><BuildWord id={card.buildStatus}/>
        {card.prohibitedFor && <span>Prohibited for {card.prohibitedFor}.</span>}</> };
      })}/>
     </div>)}
     <p className="helper">{voice.providers._perTenantWhy} {voice.providers.onDeviceConversationMode}</p>
    </Block>

    <Block title={voiceWords.voicesHeading} count={assistantVoice?.languages.length}>
     {assistantVoice ? <RovingList label={`${assistantVoice.languages.length} languages`} rows={assistantVoice.languages.map(l => ({
      key: l.id,
      content: <><strong>{l.name}</strong>
       {l.ttsAvailable && l.ttsVoices
        ? <span>{Object.values(l.ttsVoices).map(v => <code key={v} className="g1-inline">{v}</code>)}</span>
        : <span><Badge size="sm" className="g1-tag">{voiceWords.notAvailableWord}</Badge> {assistantVoice.voiceUnavailableNotice}</span>}</>
     }))}/> : <Loading/>}
     <p className="helper">{voice.languages.sentence}</p>
     <Empty heading={prefs.refusals.find(r => r.id === 'no-voice-chooser-for-a-person')!.statement}>{prefs.voiceChoice.sentence} {prefs.voiceChoice.why} {voice.languages.why}</Empty>
    </Block>

    <Block title={voiceWords.parametersHeading} count={voice.parameters.tts.length + voice.parameters.stt.length}>
     {/* Each parameter as its own card: what it is, who may set it, and — where the contract holds no range — the
         axis's own "not decided" reason. No slider and no number is drawn, because user-preferences.json's rate
         and pitch axes hold bounds:null on purpose: a range nobody has listened at the edges is a figure nobody
         tested. The presentation knobs above are a different thing — the administrator's, bounded in voice.json. */}
     <div className="g1-grid">
      {voice.parameters.tts.map(p => {
       const axis = p.boundsFrom ? prefs.axes.find(a => a.id === p.id) : undefined;
       const undecided = axis !== undefined && 'bounds' in axis && axis.bounds === null;
       return <article key={p.id} className="g1-card g1-param">
        <h3>{p.id}{undecided && <Badge size="sm" className="g1-tag">{voiceWords.notDecided}</Badge>}</h3>
        <p className="g1-param-who">{p.who}</p>
        {axis !== undefined && '_boundsWhy' in axis && <p className="g1-param-range">{axis._boundsWhy}</p>}
        <p>{p.why}</p>
       </article>;
      })}
      {voice.parameters.stt.map(p => {
       const undecided = 'value' in p && p.value === null;
       return <article key={p.id} className="g1-card g1-param">
        <h3>{p.id}{undecided && <Badge size="sm" className="g1-tag">{voiceWords.notDecided}</Badge>}</h3>
        {'from' in p && <p className="g1-param-who">{p.from}</p>}
        <p>{p.why}</p>
       </article>;
      })}
     </div>
     <p className="helper">{prefs.persistence.sentence}</p>
    </Block>

    <Block title={words.ownVoiceHeading}>
     <p><strong>Decided by the {own.decidedBy} on {own.decidedOn}.</strong> {own.sentence}</p>
     <dl className="pt-facts g1-facts">
      <div className="g1-fact"><dt>In force</dt><dd>{shownText(speechKeys.ownVoice)}</dd></div>
      <div className="g1-fact"><dt>Whose voice</dt><dd>{own.whoseVoice}</dd></div>
      <div className="g1-fact"><dt>Consent</dt><dd>{own.consent.recordedBy} {own.consent.anotherPerson}</dd></div>
      <div className="g1-fact"><dt>Named where</dt><dd>{own.howItIsNamed}</dd></div>
      <div className="g1-fact"><dt>Never for</dt><dd>{own.neverFor}</dd></div>
     </dl>
     <p className="helper">{refusal('own-voice-is-the-administrators-alone').statement}</p>
    </Block>

    <Block title="What this screen refuses" count={voice.refusals.length}>
     <ul className="pt-refusals">{voice.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
    </Block>
   </div>
  </details>
 </>;
}
