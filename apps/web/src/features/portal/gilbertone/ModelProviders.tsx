import { Suspense, lazy } from 'react';
import providers from '../../../../../../packages/catalog/model-providers.json' with { type: 'json' };
import registry from '../../../../../../packages/catalog/api-registry.json' with { type: 'json' };
import founder from '../../../../../../packages/catalog/founder-access.json' with { type: 'json' };
import { cardOf, g1, modelProviders } from '../../../lib/gilbertone-admin';
import { portalRefusal } from '../../../lib/portal';
import { BuildWord, Empty, Loading, Region, RovingList } from '../Parts';
import { CardStatusWord, GatedAction, GatedActions, GatedCheckbox, ShapeField } from './Controls';

/* GilbertOne · Model Providers (§7.4), read from packages/catalog/model-providers.json.
 *
 * A provider's state is its api-registry.json card's statusToday and nothing else — the same word the
 * API Registry screen shows, so the two cannot disagree — and "configured" there means credentials are
 * present, not that the provider answers (the contract's configured-is-not-healthy refusal). Azure
 * OpenAI shows its production deployment and the region Azure itself reported, both read off the server
 * and recorded in the contract; Ollama is dark; the three providers the plan adds are proposed and are
 * shown with no key, no balance and no usage, because none exists.
 *
 * The key controls are the plan's shapes, drawn and disabled behind G30: there is no vault, so there
 * is no key to enter, rotate, test or describe. The one key field is a disabled password field, and
 * this file holds no key, no fragment of one and no endpoint — scripts/check-boundaries.mjs sweeps it
 * for their shapes. There is no key metadata to show because no key registry exists, and the screen
 * says so rather than drawing the wireframe's masked fragments.
 *
 * The one exception, on the founder's decision of 24 September 2026, is founder access: a panel in its
 * own file (./founder/FounderAccess.tsx), loaded only when this screen is, through which the founder —
 * and nobody else, and only while the service has it switched on by hand — may read the two Azure
 * keys' metadata and reveal either with a fresh authenticator code. This file draws the region it
 * sits in and nothing of it. */

/* Founder access (packages/catalog/founder-access.json), the one exception to "no key on this screen":
   the founder, signed in with two factors, may reveal the two Azure keys with a fresh code each time.
   It arrives on a dynamic import of its own, so opening this tab without it costs nothing, and every
   control on it is the service's to refuse. */
const FounderAccessPanel = lazy(() => import('./founder/FounderAccess').then(m => ({ default: m.FounderAccessPanel })));

const tierLabel = (id: string | null) => id === null ? g1.modelProviders.residencyUnassigned : providers.residencyTiers.find(t => t.id === id)?.label ?? id;

export function ModelProvidersScreen() {
 const words = g1.modelProviders;
 const keyRefusals = providers.refusals.filter(r => r.id.includes('key'));
 return <>
  <Empty heading={portalRefusal('no-key-on-an-admin-screen')}>{words.keyRegistryEmpty}</Empty>

  <Region title="Providers" count={modelProviders.length}>
   <RovingList label={`${modelProviders.length} model providers`} className="g1-cards" rows={modelProviders.map(p => {
    const card = cardOf(p.id);
    return { key: p.id, content: <article className="pt-card g1-card" aria-label={p.name}>
     <h3>{p.name} <CardStatusWord id={card.statusToday} withSentence/> <BuildWord id={p.buildStatus}/></h3>
     <dl className="pt-facts">
      {p.models.productionDeployment && <div className="g1-fact"><dt>Production deployment</dt><dd><code>{p.models.productionDeployment}</code></dd></div>}
      <div className="g1-fact"><dt>Models</dt><dd>{p.models.from ?? 'No adapter, so no model list.'}</dd></div>
      {p.region && <div className="g1-fact"><dt>Region</dt><dd><code>{p.region}</code></dd></div>}
      {p.candidateRegions && <div className="g1-fact"><dt>Candidate regions</dt><dd><ul className="pt-bullets">{p.candidateRegions.map(c => <li key={c.region}>{c.region} — proposed {tierLabel(c.proposedTier)}, gate {c.gate}</li>)}</ul></dd></div>}
      <div className="g1-fact"><dt>Residency tier</dt><dd>{tierLabel(p.residency.tier)}. {p.residencyWhy}</dd></div>
      {p.darkWhy && <div className="g1-fact"><dt>Why dark</dt><dd>{p.darkWhy}</dd></div>}
      <div className="g1-fact"><dt>Health, usage and balance</dt><dd>{providers.panels.health.why}</dd></div>
      <div className="g1-fact"><dt>Key</dt><dd>{words.keyRegistryEmpty}</dd></div>
     </dl>
     <GatedActions ids={['provider-test', 'provider-rotate-key']} label={`${p.name} key actions`}/>
    </article> };
   })}/>
   <p className="helper">{providers.residencyToday.sentence}</p>
  </Region>

  <Region title={founder.words.heading}>
   <Suspense fallback={<Loading/>}><FounderAccessPanel/></Suspense>
  </Region>

  <Region title={words.keyEntryHeading}>
   <p>{registry.keyMetadata.entry.sentence}</p>
   <div className="g1-form" role="group" aria-label={words.keyEntryHeading}>
    <ShapeField label={words.keyFieldLabel} kind="password" hint={registry.keyMetadata.entry.why}/>
    <GatedAction id="provider-enter-key"/>
   </div>
   <p className="pt-label">What the screen would show of a key, once the vault exists</p>
   <ul className="pt-fields">{registry.keyMetadata.fields.map(f => <li key={f.field}><code>{f.field}</code> <span>{f.type}</span></li>)}</ul>
   <p className="helper">{registry.keyMetadata.showMetadataToggle.sentence}</p>
   <GatedCheckbox id="provider-show-metadata"/>
   <ul className="pt-refusals">{keyRefusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>

  <Region title={words.routingHeading}>
   <p>{providers.routing.platformOrderToday.sentence}</p>
   <ol className="pt-bullets">{providers.routing.platformOrderToday.order.map(id => <li key={id}>{cardOf(id).name}</li>)}</ol>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{providers.routing._perTenantWhy}</caption>
    <thead><tr><th scope="col">Slot</th><th scope="col">Provider and model</th><th scope="col">Why</th></tr></thead>
    <tbody>{([['Default', providers.routing.defaultModel], ['Fallback', providers.routing.fallbackModel], ['Clinical evaluation', providers.routing.clinicalEvaluationModel]] as const).map(([slot, m]) =>
     <tr key={slot}><th scope="row">{slot}</th><td>{m.providerRef ? `${m.providerRef} ${m.modelRef ?? ''}` : 'Empty'}</td><td>{m.why}</td></tr>)}</tbody>
   </table></div>
  </Region>

  <Region title={words.localAgentHeading}>
   <p>{providers.localAgent.why}</p>
   <p className="helper">Its address is the loopback default in {providers.localAgent.endpointFrom}; this screen does not draw it.</p>
   <GatedAction id="local-agent-test"/>
  </Region>

  <Region title={words.panelsHeading}>
   <ul className="pt-refusals">{Object.entries(providers.panels).map(([id, panel]) => <li key={id}><strong>{id}</strong> <span>{panel.why}</span></li>)}</ul>
   <GatedAction id="provider-health-check"/>
  </Region>

  <Region title="What this screen refuses" count={providers.refusals.length}>
   <ul className="pt-refusals">{providers.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
