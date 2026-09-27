import { useId, type ReactNode } from 'react';
import voice from '../../../../../../packages/catalog/voice.json' with { type: 'json' };
import { Configuration as Settings, valueText } from '../../Configuration';
import { cardOf, g1, providersInForce, voiceChoicesOf } from '../../../lib/gilbertone-admin';
import { useWideLayout } from '../../../lib/layout';
import { fill } from '../../../lib/portal';
import { presentationVoiceNow, settingsEngineOf, snapshotNow, speechSettingsNow, useSettingsHistories } from '../../../lib/settings';
import { BuildWord, Empty, Region, RovingList } from '../Parts';
import { CardStatusWord, Locked } from './Controls';

/* GilbertOne · Speech settings, the eighth sub-screen, on the founder's approval of 28 September 2026.
 *
 * What an administrator sees first is what they can change: the editor, straight under the sentence
 * saying the service reads the contract's defaults (the founder, 28 September 2026 — "the editor is the
 * first thing seen"). What is in force sits beside it on a wide screen and under it, folded, on a narrow
 * one: for each presentation register, the provider the setting names and the voice label the Voice
 * screen chose, read from lib/settings.ts and the registry card, never typed. Then each built
 * text-to-speech provider as a card — its state from the registry, where it processes and what that
 * means in production, its recorded price or the sentence saying it has none, whether its shapes were
 * ever tried live — with the settings that belong to it and their values in force, grouped by the card
 * the setting's key names. Then what is not a setting and why, the administrator's own voice with the
 * consent the contract records, and what the screen refuses.
 *
 * Each of those is a disclosure under its own heading, open where there is a column for it and closed on
 * a phone, where five closed headings under the editor are one press each from everything they hold and
 * the editor is not pushed a screen's length down by them. Nothing is dropped or reworded to fit: the
 * sentences are the contract's, and moved rather than shortened.
 *
 * THE EDITOR IS THE CONFIGURATION TAB'S, EMBEDDED. Nothing on this screen changes a value itself: the
 * Configuration screen is drawn here fixed to the assistant engine, so a change goes through exactly
 * the review-then-confirm form, the shared rules and the history the Configuration tab has, and a
 * refusal is the contract's sentence. This file draws no control, no field and no handler of its own,
 * which is what lets scripts/check-boundaries.mjs hold it as it holds every other GilbertOne file.
 *
 * SAID PLAINLY: the assistant service reads these settings from the contract's defaults, because it
 * keeps no settings history yet. A change here reaches the web preview — the next spoken answer in
 * this tab, the preview panel's cost and ceiling — and the service's own answers only on the day the
 * service keeps the history too. The screen says so in the contract's words at the top. */

const providerWordOf = (cardId: string) => cardId.split('-')[0]!;

/* One block of what is in force: a region named by its heading, the heading the disclosure's summary, so a
   closed block is still a landmark a screen reader can find by name and a heading it can read. */
function InForce({ title, count, open, children }: { title: string; count?: number; open: boolean; children: ReactNode }) {
 const id = useId();
 return <section className="pt-region g1-side" aria-labelledby={id}>
  <details open={open}>
   <summary><h2 id={id}>{title}{count !== undefined && <span className="pt-count"> · {count}</span>}</h2></summary>
   <div className="g1-side-body">{children}</div>
  </details>
 </section>;
}

export function SpeechSettingsScreen() {
 useSettingsHistories();
 const wide = useWideLayout();
 const words = g1.speech;
 const inForce = speechSettingsNow();
 const voices = presentationVoiceNow();
 const block = settingsEngineOf('assistant').block;
 const settingOf = (key: string) => block.items.find(s => s.key === key)!;
 /* The value in force of one setting, in the Configuration tab's own words for it: the same snapshot the
    typed reading above came from, read by key, so a card's list and the summary cannot disagree. */
 const snapshotValue = (key: string) => valueText(settingOf(key), snapshotNow('assistant').values[key]);
 const providers = providersInForce();
 const ttsCards = voice.providers.tts.map(cardOf).filter(c => c.buildStatus === 'built');
 const defaultCard = cardOf(voice.providers.tts[0]!);
 const settingsOfCard = (cardId: string) => block.items.filter(s => s.key.startsWith(`${providerWordOf(cardId)}-`));
 const shared = block.items.filter(s => !ttsCards.some(c => s.key.startsWith(`${providerWordOf(c.id)}-`)) && !s.key.startsWith('presentation-voice-'));
 const refusal = (id: string) => voice.refusals.find(r => r.id === id)!;
 const locked = voice.lockedSettings;
 const own = voice.ownVoice;
 return <>
  <Empty heading={words.serviceReadsDefaults.split(':')[0]!}>{words.serviceReadsDefaults}</Empty>

  <div className="g1-speech" data-layout={wide ? 'wide' : 'narrow'}>
  <div className="g1-speech-editor">
  <Region title={words.editorHeading} count={block.items.length}>
   <p>{words.editorIntro}</p>
   <Settings engine="assistant" onEngine={() => undefined} fixed/>
  </Region>
  </div>

  <div className="g1-speech-state">
  <InForce title={words.inForceHeading} count={providers.length} open={wide}>
   <RovingList label={words.inForceHeading} rows={providers.map(({ classId, card }) => {
    const c = voice.queryClasses.find(q => q.id === classId)!;
    const label = voiceChoicesOf(classId).find(o => o.value === (voices.byClass as Readonly<Record<string, string>>)[classId])?.label ?? '';
    const ownHere = inForce.ownVoice === 'every-presentation-register' || (inForce.ownVoice === 'admin-register' && classId === voice.queryClasses.find(q => q.zone === 'presentation' && q.setting?.endsWith('-admin'))?.id);
    return { key: classId, content: <><strong>{c.label}</strong><CardStatusWord id={card.statusToday}/><span>{fill(words.registerSentence, { register: c.label, provider: card.name, voice: label })}{ownHere && <> <span className="g1-tag">{words.ownVoiceOnWord}</span></>}</span></> };
   })}/>
   <p className="helper">{refusal('no-provider-setting-on-a-clinical-register').statement}</p>
  </InForce>

  <InForce title={words.providersHeading} count={ttsCards.length} open={wide}>
   <div className="g1-grid">
    {ttsCards.map(card => {
     const own = settingsOfCard(card.id);
     return <article key={card.id} className="pt-card g1-card" aria-label={card.name}>
      <h3>{card.name} <CardStatusWord id={card.statusToday}/> <BuildWord id={card.buildStatus}/></h3>
      <dl className="pt-facts">
       <div className="g1-fact"><dt>Residency</dt><dd>{card.regions?.southAfricanRegion ? words.onshoreSentence : fill(words.residencySentence, { default: defaultCard.name })}</dd></div>
       <div className="g1-fact"><dt>Price</dt><dd>{typeof card.pricing?.perMillionCharactersUsd === 'number' ? card.pricing.why : words.noPriceSentence}</dd></div>
       {card.shapesFrom?.exercisedAgainstLiveApi === false && <div className="g1-fact"><dt>Tried live</dt><dd>{words.notExercisedSentence}</dd></div>}
       {card.prohibitedFor && <div className="g1-fact"><dt>Never for</dt><dd>{card.prohibitedFor}.</dd></div>}
      </dl>
      {own.length
       ? <ul className="pt-refusals" aria-label={fill(words.settingsOfWord, { count: String(own.length) })}>{own.map(s => <li key={s.key}><strong>{s.label}: {snapshotValue(s.key)}</strong> <span>{s.help}</span></li>)}</ul>
       : <p className="helper">{card.why}</p>}
     </article>;
    })}
    <article className="pt-card g1-card" aria-label="Every provider">
     <h3>Every provider</h3>
     <ul className="pt-refusals" aria-label={fill(words.settingsOfWord, { count: String(shared.length) })}>{shared.map(s => <li key={s.key}><strong>{s.label}: {snapshotValue(s.key)}</strong> <span>{s.help}</span></li>)}</ul>
    </article>
   </div>
   <p className="helper">{voice.providers._perTenantWhy}</p>
  </InForce>

  <InForce title={words.lockedHeading} open={wide}>
   <Locked title={voice.zones.find(z => z.id === 'clinical-delivery')!.label}>{refusal('no-provider-setting-on-a-clinical-register').statement} {refusal('no-provider-setting-on-a-clinical-register').why}</Locked>
   <Locked title="Keys and regions">{locked.keysAndRegions.sentence}</Locked>
   <Locked title="Speaking style">{locked.speakingStyle.sentence}</Locked>
   <Locked title="The capture cap">{locked.utteranceCap.sentence}</Locked>
   <Locked title="Who hears">{locked.speechToTextProvider.sentence}</Locked>
  </InForce>

  <InForce title={words.ownVoiceHeading} open={wide}>
   <p><strong>Decided by the {own.decidedBy} on {own.decidedOn}.</strong> {own.sentence}</p>
   <dl className="pt-facts g1-facts">
    <div className="g1-fact"><dt>In force</dt><dd>{snapshotValue('own-voice')}</dd></div>
    <div className="g1-fact"><dt>Whose voice</dt><dd>{own.whoseVoice}</dd></div>
    <div className="g1-fact"><dt>Consent</dt><dd>{own.consent.recordedBy} {own.consent.anotherPerson}</dd></div>
    <div className="g1-fact"><dt>Named where</dt><dd>{own.howItIsNamed}</dd></div>
    <div className="g1-fact"><dt>Never for</dt><dd>{own.neverFor}</dd></div>
   </dl>
   <p className="helper">{refusal('own-voice-is-the-administrators-alone').statement}</p>
  </InForce>

  <InForce title="What this screen refuses" count={voice.refusals.length} open={wide}>
   <ul className="pt-refusals">{voice.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </InForce>
  </div>
  </div>
 </>;
}
