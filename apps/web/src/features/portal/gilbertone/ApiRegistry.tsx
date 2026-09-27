import { Suspense, lazy } from 'react';
import registry from '../../../../../../packages/catalog/api-registry.json' with { type: 'json' };
import founder from '../../../../../../packages/catalog/founder-access.json' with { type: 'json' };
import providers from '../../../../../../packages/catalog/model-providers.json' with { type: 'json' };
import { noticeFor } from '../../../lib/capabilities';
import { cardsByCategory, founderRegistryActions, g1, gatedRegistryActions, type Card } from '../../../lib/gilbertone-admin';
import { BuildWord, Empty, Region, RovingList } from '../Parts';
import { CardStatusWord, GatedAction, GatedActions, ShapeField } from './Controls';
import { VoicePreview } from './VoicePreview';

/* GilbertOne · API Registry (§7.8): every external API the platform talks to, or has been asked to,
 * as a card, grouped by the registry's own categories — packages/catalog/api-registry.json.
 *
 * Each card's state is its statusToday, in the registry's own card vocabulary, and nothing else: only
 * the cards the registry records as configured are drawn as configured (Azure OpenAI, Azure Speech, and
 * the keyless map tiles the browser already asks for), the adapters that exist and are off are dark,
 * and every provider the plan lists that nothing can call is not-configured. A card that names a
 * capability shows that capability's own not-connected sentence from packages/catalog/capabilities.json,
 * never a sentence of its own. There is no health, usage or balance reading for any card, and the card
 * says so instead of drawing the wireframe's figures.
 *
 * Five of the six card actions are the founder's since the instruction of 28 September 2026 — "API
 * Registry … I cannot set them. I need to be able to control all these aspects, I am the owner": Enable,
 * Disable, Rotate key, Test and View logs are drawn by ./founder/FounderActions.tsx on a dynamic import,
 * enabled only while the assistant service says the founder is signed in, each asking the service's founder
 * routes for the card; what the card then shows — a key on the box or not, its last four, its fingerprint,
 * whether it is switched on, its log — is what the service answered. Configure scopes and the add-a-provider
 * form have no contract behind them and stay drawn disabled behind G32, and the card says so; the form's
 * key field is a disabled password field. A text-to-speech card carries the voice preview panel, the same
 * component the Speech settings screen uses. Since 27 September 2026 it plays — through the one
 * text-to-speech provider that is built and configured, and only on that provider's card: on any other
 * card the panel says so in the contract's sentence and offers no Play, because a preview that called
 * a provider the registry records as proposed would be the call its refusal exists to stop. */

const isTts = (card: Card) => (card.serves ?? []).includes('tts');
/* The two cards whose key founder access can reveal, read from its contract: the panel is drawn on
   those and on no other, behind its own dynamic import. */
const founderCard = (card: Card) => founder.keys.some(k => k.card === card.id);
const FounderAccessPanel = lazy(() => import('./founder/FounderAccess').then(m => ({ default: m.FounderAccessPanel })));
const FounderCardControls = lazy(() => import('./founder/FounderActions').then(m => ({ default: m.FounderCardControls })));

export function ApiRegistryScreen() {
 const words = g1.apiRegistry;
 const groups = cardsByCategory();
 const founderActions = founderRegistryActions();
 const gated = gatedRegistryActions();
 const refusal = (id: string) => registry.refusals.find(r => r.id === id)!.statement;
 return <>
  <Empty heading={refusal('no-balance-or-usage-without-a-reading')}>{registry.usageAndBalance.usage.why} {registry.usageAndBalance.balance.why}</Empty>
  <details className="pt-legend"><summary>What each card state means</summary>
   <dl>{registry.cardStatuses.map(s => <div key={s.id}><dt><CardStatusWord id={s.id}/></dt><dd>{s.sentence}</dd></div>)}</dl>
  </details>

  {groups.map(group => <Region key={group.id} title={group.label} count={group.cards.length}>
   <RovingList label={`${group.cards.length} ${group.label} cards`} className="g1-cards" rows={group.cards.map(card => {
    const notice = card.capabilityRef ? noticeFor(card.capabilityRef) : null;
    return { key: card.id, content: <article className="pt-card g1-card" aria-label={card.name}>
     <h3>{card.name} <CardStatusWord id={card.statusToday}/> <BuildWord id={card.buildStatus}/></h3>
     <p>{card.why}</p>
     {notice && <p className="g1-notice">{notice}</p>}
     <dl className="pt-facts">
      {card.gate && <div className="g1-fact"><dt>Gate</dt><dd>{card.gate}</dd></div>}
      {card.environment.length > 0 && <div className="g1-fact"><dt>Environment</dt><dd>{card.environment.join(', ')}</dd></div>}
      {card.prohibitedFor && <div className="g1-fact"><dt>Prohibited for</dt><dd>{card.prohibitedFor}</dd></div>}
      {card.calledFrom && <div className="g1-fact"><dt>Called from</dt><dd>{card.calledFrom}</dd></div>}
      <div className="g1-fact"><dt>Health check</dt><dd>{providers.panels.health.why}</dd></div>
      <div className="g1-fact"><dt>Key</dt><dd>{card.keyRequired === false ? words.noKey : g1.modelProviders.keyRegistryEmpty}</dd></div>
     </dl>
     <Suspense fallback={<p className="helper">{g1.founder.words.checking}</p>}><FounderCardControls card={card.id} actions={founderActions}/></Suspense>
     <GatedActions ids={gated} label={`${card.name} gated actions`}/>
     <p className="helper">{g1.founder.words.noContract}</p>
     {founderCard(card) && <details className="g1-founder-details"><summary>{founder.words.heading}</summary>
      <Suspense fallback={<p className="helper">{founder.words.checking}</p>}><FounderAccessPanel cardId={card.id}/></Suspense></details>}
     {isTts(card) && <details className="g1-details"><summary>{words.previewSummary}</summary><VoicePreview placement={card.name} cardId={card.id}/></details>}
    </article> };
   })}/>
  </Region>)}

  <Region title={words.addHeading}>
   <Empty heading={refusal('a-region-is-not-a-section-72-determination')}>{registry.addProvider.residencySelector.sentence}</Empty>
   <div className="g1-form" role="group" aria-label={words.addHeading}>
    {registry.addProvider.fields.map(f => <ShapeField key={f.field} label={f.field} hint={f.why}/>)}
    <ShapeField label={g1.modelProviders.keyFieldLabel} kind="password" hint={registry.keyMetadata.entry.sentence}/>
    <GatedAction id="registry-add-provider"/>
   </div>
  </Region>

  <Region title="What this screen refuses" count={registry.refusals.length}>
   <ul className="pt-refusals">{registry.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
