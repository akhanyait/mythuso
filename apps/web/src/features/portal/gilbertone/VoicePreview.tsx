import { useEffect, useId, useRef, useState } from 'react';
import '../fields.css';
import voice from '../../../../../../packages/catalog/voice.json' with { type: 'json' };
import { containsPHI } from '../../../../../../packages/gilbertone/src/phi.ts';
import { g1, previewProvider, previewSpeech, voiceChoicesOf, type VoiceLabel } from '../../../lib/gilbertone-admin';
import { fill } from '../../../lib/portal';
import { presentationVoiceNow, settingsScreen } from '../../../lib/settings';
import { LiveButton, LiveSentence } from './Controls';
import { platformVoiceOf, spokenLanguagesOf, useAssistantVoice } from './useAssistantVoice';
import { useVoiceSaving } from './useVoiceSaving';

/* The voice preview panel (§7.3.1), one component with two placements: the Voice screen, and every
 * text-to-speech card in the API Registry.
 *
 * It answers the plan's five questions by doing what it can and saying what it cannot, and it holds
 * the panel's refusals as behaviour rather than as copy:
 *
 *   It rejects anything that looks like a person's details, as the administrator types, using
 *   packages/gilbertone's own detector — the one the assistant service runs on every turn — so the
 *   preview and the service cannot disagree about what an identifier looks like. A refused sentence
 *   is never sent.
 *
 *   It shows the estimated cost before the Play button — the sentence's characters against the list
 *   price recorded by hand on the provider's card in packages/catalog/api-registry.json — and keeps a
 *   running total for the session in this component's state. No storage, and no figure that was not
 *   read from the card: nothing has been timed, and the panel says so rather than showing a speed.
 *
 *   It never offers Save as default on the emergency, refusal or escalation register. The row is read
 *   from the class's own previewMaySaveAsDefault, never from its name; on a locked register the voice
 *   chooser — a pair of radio chips on a presentation register — is one chip in a disabled fieldset,
 *   the platform's default from assistant.json, because that is the voice
 *   the register is read in whatever any setting says, and Play sends exactly that.
 *
 * Play is live since the founder's decision of 27 September 2026. It asks the assistant service's own
 * speak route — through lib/gilbertone-admin.ts's one request, at the path the contract names — with
 * the sentence, the language and the contract's voice name for it, and plays the answer through an
 * audio element made here and revoked here. It never imports the patient panel's client and never
 * reaches for the browser's own synthesiser. A language the cloud has no voice for is not offered; a
 * provider that is not the configured one gets no Play, in the contract's sentence. */

const cost = (characters: number, price: { perMillionCharactersUsd: number; unitCharacters: number }) =>
 (characters / price.unitCharacters) * price.perMillionCharactersUsd;

export function VoicePreview({ placement, cardId }: { placement: string; cardId?: string }) {
 const words = g1.voice;
 const panel = voice.previewPanel;
 const assistantVoice = useAssistantVoice();
 const provider = previewProvider();
 const saving = useVoiceSaving();
 const [classId, setClassId] = useState(voice.queryClasses[0]!.id);
 const [text, setText] = useState('');
 const [languageId, setLanguageId] = useState<string | null>(null);
 /* The label chosen for a presentation register in this panel, with the settings version it was chosen
    against; null means "the one in force", and a choice older than the value in force is dropped. */
 const [choice, setChoice] = useState<{ version: number; label: VoiceLabel | null }>({ version: 0, label: null });
 const [busy, setBusy] = useState(false);
 const [outcome, setOutcome] = useState<string | null>(null);
 const [plays, setPlays] = useState(0);
 const [total, setTotal] = useState(0);
 const classField = useId();
 const textField = useId();
 const languageField = useId();
 const voiceField = useId();
 const verdict = useId();
 const playWhy = useId();
 const saveWhy = useId();
 const reasonField = useId();
 const chosen = voice.queryClasses.find(c => c.id === classId)!;
 const refused = text.trim() !== '' && containsPHI(text);
 const lockedRefusal = voice.refusals.find(r => r.id === 'no-save-as-default-on-a-locked-row')!.statement;
 const costRefusal = voice.refusals.find(r => r.id === 'no-billed-preview-without-its-cost')!.statement;
 /* The request in flight and the element playing, so the panel going away stops both. */
 const inFlight = useRef<AbortController | null>(null);
 const playing = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
 const letGo = () => {
  const current = playing.current;
  playing.current = null;
  if (!current) return;
  current.audio.onended = null;
  current.audio.onerror = null;
  current.audio.pause();
  URL.revokeObjectURL(current.url);
 };
 useEffect(() => () => { inFlight.current?.abort(); letGo(); }, []);

 const languages = assistantVoice ? spokenLanguagesOf(assistantVoice) : [];
 const language = languages.find(l => l.id === languageId) ?? languages[0] ?? null;
 const platform = assistantVoice ? platformVoiceOf(assistantVoice) : null;
 const now = presentationVoiceNow();
 const inForce = chosen.previewMaySaveAsDefault ? (now.byClass as Readonly<Record<string, VoiceLabel>>)[classId]! : null;
 const label = choice.version === now.settingsVersion ? choice.label : null;
 const setLabel = (next: VoiceLabel | null) => setChoice({ version: now.settingsVersion, label: next });
 /* Which label the reading is asked in: a locked register's is the platform's and cannot be chosen; a
    presentation register's is this panel's choice, or the value in force until one is made. */
 const asked: VoiceLabel | null = chosen.previewMaySaveAsDefault ? (label ?? inForce!) : (platform as VoiceLabel | null);
 const voiceName = language && asked ? language.ttsVoices?.[asked] ?? null : null;
 const choices = chosen.previewMaySaveAsDefault ? voiceChoicesOf(classId) : [];
 const onThisProvider = provider !== null && (cardId === undefined || cardId === provider.id);
 const price = provider?.pricing ?? null;
 /* A sentence's cost is a fraction of a cent and is shown to the contract's decimals; the list price it
    comes from is a whole figure and is shown as money usually is. */
 const money = price ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: price.currency, minimumFractionDigits: words.previewCostDecimals, maximumFractionDigits: words.previewCostDecimals }) : null;
 const listPrice = price ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: price.currency }) : null;
 const characters = text.trim().length;
 const estimate = price && characters ? cost(characters, price) : null;
 const canPlay = onThisProvider && !busy && !refused && characters > 0 && voiceName !== null && estimate !== null;

 const play = async () => {
  if (!canPlay || !language || !voiceName || !provider || estimate === null) return;
  inFlight.current?.abort();
  letGo();
  const controller = new AbortController();
  inFlight.current = controller;
  setBusy(true);
  setOutcome(words.previewReading);
  const answer = await previewSpeech(text.trim(), language.id, voiceName, controller.signal);
  if (inFlight.current !== controller) return;
  inFlight.current = null;
  setBusy(false);
  if (!answer.ok) {
   setOutcome(answer.voiceUnavailable && assistantVoice ? assistantVoice.voiceUnavailableNotice : words.previewNotAnswered);
   return;
  }
  /* The provider has read it, so it is billed whether or not the browser plays it: the total moves here. */
  setPlays(n => n + 1);
  setTotal(t => t + estimate);
  let url: string;
  try {
   const binary = atob(answer.audioBase64);
   const bytes = new Uint8Array(binary.length);
   for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
   url = URL.createObjectURL(new Blob([bytes], { type: answer.format }));
  } catch {
   setOutcome(words.previewNotPlayed);
   return;
  }
  const audio = new Audio(url);
  playing.current = { audio, url };
  audio.onended = letGo;
  audio.onerror = () => { letGo(); setOutcome(words.previewNotPlayed); };
  try {
   await audio.play();
   setOutcome(fill(words.previewRead, { voice: answer.voice, language: answer.language }));
  } catch {
   letGo();
   setOutcome(words.previewNotPlayed);
  }
 };

 return <section className="g1-preview" aria-label={`${words.previewHeading} — ${placement}`}>
  <ol className="g1-questions">{panel.questions.map(q => <li key={q}>{q}</li>)}</ol>
  <div className="g1-preview-fields">
   <label className="g1-field" htmlFor={classField}>
    <span>{words.previewClassLabel}</span>
    <select id={classField} value={classId} onChange={event => { setClassId(event.target.value); setLabel(null); saving.clear(); }}>
     {voice.queryClasses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
   </label>
   <label className="g1-field" htmlFor={languageField}>
    <span>{words.previewLanguageLabel}</span>
    <select id={languageField} aria-label={words.previewLanguageLabel} value={language?.id ?? ''} disabled={!assistantVoice} onChange={event => setLanguageId(event.target.value)}>
     {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
   </label>
   <div className="g1-field">
    {chosen.previewMaySaveAsDefault
     ? <fieldset className="fc-chips g1-voice-chips" id={voiceField} aria-describedby={`${voiceField}-locked`}>
      <legend>{words.previewVoiceLabel}</legend>
      <div className="fc-chip-row">{choices.map(o => <label className="fc-chip" key={o.value}>
       <input type="radio" name={voiceField} checked={asked === o.value} onChange={() => { setLabel(o.value as VoiceLabel); saving.clear(); }}/><span>{o.label}</span>
      </label>)}</div>
     </fieldset>
     : <fieldset className="fc-chips g1-voice-chips" id={voiceField} aria-describedby={`${voiceField}-locked`} disabled>
      <legend>{words.previewVoiceLabel}</legend>
      <div className="fc-chip-row">{platform && <label className="fc-chip">
       <input type="radio" name={voiceField} checked readOnly/><span>{words.platformDefaultWord}</span>
      </label>}</div>
     </fieldset>}
    <small id={`${voiceField}-locked`}>{chosen.previewMaySaveAsDefault ? (voiceName ?? '') : words.lockedRowSentence}</small>
   </div>
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
   <div className="g1-fact"><dt>{words.previewCostLabel}</dt><dd>
    {price && provider && money && listPrice && estimate !== null
     ? fill(words.previewCostSentence, { characters, price: listPrice.format(price.perMillionCharactersUsd), unit: price.unitCharacters.toLocaleString('en-ZA'), provider: provider.name, recordedOn: price.recordedOn, cost: money.format(estimate) })
     : words.previewCostEmpty}
    {' '}{costRefusal}</dd></div>
   <div className="g1-fact"><dt>{words.previewTotalLabel}</dt><dd>{plays && money ? fill(words.previewTotalSentence, { plays, cost: money.format(total) }) : words.previewTotalEmpty}</dd></div>
  </dl>
  {price && <p className="helper">{price.why}</p>}
  {onThisProvider
   ? <div className="g1-action">
    <LiveButton id="voice-play" describedBy={playWhy} disabled={!canPlay} onClick={() => { void play(); }}/>
    <LiveSentence id="voice-play" sentenceId={playWhy}/>
    {outcome && <p className="g1-verdict" role="status">{outcome}</p>}
   </div>
   : <p className="g1-refusal">{provider ? fill(words.previewOnlyThrough, { provider: provider.name, card: placement }) : words.previewNotAnswered}</p>}
  {chosen.previewMaySaveAsDefault
   ? <div className="g1-save g1-action" role="group" aria-label={words.saveHeading}>
    <label className="g1-field" htmlFor={reasonField}>
     <span>{settingsScreen.reason}</span>
     <textarea id={reasonField} value={saving.reason} onChange={event => { saving.setReason(event.target.value); saving.clear(); }} aria-describedby={`${reasonField}-help`} autoComplete="off" spellCheck={false}/>
     <small id={`${reasonField}-help`}>{settingsScreen.reasonHelp}</small>
    </label>
    <LiveButton id="voice-save-as-default" describedBy={asked === inForce ? `${saveWhy}-same` : saveWhy} disabled={asked === inForce} onClick={() => { if (asked) saving.save(classId, asked); }}/>
    <LiveSentence id="voice-save-as-default" sentenceId={saveWhy}/>
    <p id={`${saveWhy}-same`} className="g1-refusal">{words.nothingToSave}</p>
    <p className="helper">{words.sessionSentence}</p>
    {saving.sentence && <p className={saving.outcome?.ok ? 'g1-verdict' : 'g1-rejected'} role={saving.outcome?.ok ? 'status' : 'alert'}>{saving.sentence}</p>}
   </div>
   : <p className="g1-refusal">{lockedRefusal}</p>}
 </section>;
}
