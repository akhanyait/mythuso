import { useEffect, useState } from 'react';
import overview from '../../../../../../packages/catalog/control-tower-overview.json' with { type: 'json' };
import registry from '../../../../../../packages/catalog/api-registry.json' with { type: 'json' };
import levels from '../../../../../../packages/catalog/intelligence-levels.json' with { type: 'json' };
import corpus from '../../../../../../packages/catalog/knowledge-corpus-tiers.json' with { type: 'json' };
import providers from '../../../../../../packages/catalog/model-providers.json' with { type: 'json' };
import { cardOf, g1, modelProviders, readServiceBooleans, serviceStateOf, type RouteAnswer } from '../../../lib/gilbertone-admin';
import { portalContract } from '../../../lib/portal';
import { Empty, Loading, Region, Status } from '../Parts';
import { CardStatusWord, GatedAction } from './Controls';
import { useAssistantVoice } from './useAssistantVoice';

/* GilbertOne · Overview (§7.2): the engine's state, read — never typed.
 *
 * The two routes the service answers about itself are asked when the screen opens, and what they say
 * is drawn as the words yes and no beside each boolean the contract lists. They carry presence and
 * nothing else, which is the only reason this screen may read them (§7.2: "Show any key, any endpoint,
 * any secret" is what it must not do; "only presence, only booleans, only counts" is what it may). The
 * production deployment and the region are model-providers.json's, read off the server on 24 September
 * and recorded there; the voices are assistant.json's; the corpus sizes are the corpus contract's.
 *
 * Where the contract and the route disagree the screen shows both rather than choosing: the registry
 * records the cloud voice as configured, and the route has answered speech false since its key was
 * found malformed (docs/governance/ASSISTANT-ACTIVATION.md). A reader who sees the two side by side
 * knows exactly what to go and fix; a screen that picked one would be hiding the other.
 *
 * Usage is an empty state because no meter exists, and the per-tenant dark mode (Module 8) is a
 * disabled button with its sentence because no tenant and no kill switch exist. */

type Answers = Readonly<Record<string, RouteAnswer>>;
const words = g1.overview;
const yesNo = (value: boolean | undefined) => value ? words.trueWord : words.falseWord;

export function EngineOverview() {
 const [answers, setAnswers] = useState<Answers | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), portalContract.overview.healthTimeoutMs);
  void Promise.all(words.routes.map(r => readServiceBooleans(r.path, controller.signal).then(a => [r.path, a] as const)))
   .then(pairs => setAnswers(Object.fromEntries(pairs)));
  return () => { window.clearTimeout(timer); controller.abort(); };
 }, []);
 const health = answers?.[words.routes[0]!.path];
 const azure = modelProviders.find(p => p.id === 'azure-openai')!;
 const speech = cardOf('azure-speech');
 const assistantVoice = useAssistantVoice();
 const english = assistantVoice?.languages.find(l => l.id === 'en');
 const tenants = overview.sections.find(s => s.id === 'active-tenants')!;
 return <>
  <Region title="Service state" count={words.routes.length}>
   {!answers ? <Loading label={words.checkingSentence}/> : <div className="g1-grid">
    {words.routes.map(route => {
     const answer = answers[route.path]!;
     return <article key={route.path} className="pt-card g1-card" aria-label={route.label}>
      <h3>{route.label} <Status id={serviceStateOf(answer)}/></h3>
      {answer.answered
       ? <dl className="pt-facts">{words.fields.map(f => <div key={f.field} className="g1-fact"><dt>{f.label}</dt><dd>{yesNo(answer.fields[f.field])}</dd></div>)}</dl>
       : <Empty>{words.notAnswered}</Empty>}
     </article>;
    })}
   </div>}
  </Region>

  <Region title="Version">
   <Empty>{words.versionEmpty}</Empty>
  </Region>

  <Region title={words.tenantsHeading} count={(tenants.tenants ?? []).length}>
   <Empty>{tenants.emptyState}</Empty>
  </Region>

  <Region title={words.modelHeading}>
   <article className="pt-card g1-card" aria-label={azure.name}>
    <h3>{azure.name} <CardStatusWord id={cardOf(azure.id).statusToday} withSentence/></h3>
    <dl className="pt-facts">
     <div className="g1-fact"><dt>{words.deploymentLabel}</dt><dd><code>{azure.models.productionDeployment}</code></dd></div>
     <div className="g1-fact"><dt>{words.regionObservedLabel}</dt><dd><code>{azure.region}</code> — {providers.residencyToday.sentence}</dd></div>
     <div className="g1-fact"><dt>{words.acknowledgedLabel}</dt><dd>{health?.answered ? yesNo(health.fields.activated) : words.checkingSentence} {words.acknowledgedSentence}</dd></div>
    </dl>
   </article>
  </Region>

  <Region title={words.speechHeading}>
   <article className="pt-card g1-card" aria-label={speech.name}>
    <h3>{speech.name} <CardStatusWord id={speech.statusToday} withSentence/></h3>
    <dl className="pt-facts">
     <div className="g1-fact"><dt>{words.fields.find(f => f.field === 'speech')!.label}</dt><dd>{health?.answered ? yesNo(health.fields.speech) : words.checkingSentence}</dd></div>
     {assistantVoice ? <>
      <div className="g1-fact"><dt>Voices</dt><dd>{Object.values(assistantVoice.cloud.voices).map(v => <code key={v} className="g1-inline">{v}</code>)}</dd></div>
      <div className="g1-fact"><dt>Recognition</dt><dd><code>{assistantVoice.cloud.recognitionLocale}</code>{english && <> · {english.name}</>}</dd></div>
     </> : <Loading/>}
     <div className="g1-fact"><dt>Region</dt><dd>{words.speechRegionSentence}</dd></div>
    </dl>
   </article>
  </Region>

  <Region title={words.knowledgeHeading} count={corpus.corpusToday.entryCount}>
   <ul className="pt-refusals">{corpus.corpusTiers.map(t => <li key={t.id}><strong>{t.label}: {t.entryCount}</strong> <span>{t.matches}</span></li>)}</ul>
   <Empty>{words.refreshEmpty}</Empty>
  </Region>

  <Region title={words.usageHeading}>
   <Empty>{registry.usageAndBalance.usage.why} {levels.auditPerTurn.today}</Empty>
  </Region>

  <Region title={words.darkModeHeading}>
   <GatedAction id="tenant-dark-mode"/>
  </Region>
 </>;
}
