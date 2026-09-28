import corpus from '../../../../../../packages/catalog/knowledge-corpus-tiers.json' with { type: 'json' };
import federation from '../../../../../../packages/catalog/knowledge/federation.json' with { type: 'json' };
import { g1 } from '../../../lib/gilbertone-admin';
import { Empty, Region, RovingList } from '../Parts';
import { Locked } from './Controls';
import { Badge } from '../../../ui/Badge';

/* GilbertOne · Knowledge (§7.6): the clinical and non-clinical corpora and the three external sources.
 *
 * The split is packages/catalog/knowledge-corpus-tiers.json's proposal, and the screen says plainly
 * that it is not enforced yet: every refresh still re-embeds the whole undivided corpus, and the
 * contract's own refusal says nothing may claim otherwise. The clinical-corpus lock is drawn as a
 * locked setting — a refresh of the clinical half happens only through a ratified Clinician Review
 * Queue entry — with no control beside it. The three federation sources are packages/catalog/knowledge/
 * federation.json's, every one of them not active, each with its licence, its rate limit, where it is
 * hosted and what it is for and not for. Their addresses are not drawn: nothing calls them. */

export function KnowledgeScreen() {
 const words = g1.knowledge;
 const refusal = (id: string) => corpus.refusals.find(r => r.id === id)!;
 const lock = refusal('no-clinical-corpus-refresh-outside-the-review-queue');
 const notYet = refusal('no-tier-split-without-the-upstream-schema-change');
 return <>
  <Empty heading={notYet.statement}>{corpus.preview}</Empty>

  <Region title={words.tiersHeading} count={corpus.corpusTiers.length}>
   <RovingList label={`${corpus.corpusTiers.length} corpora`} rows={corpus.corpusTiers.map(t => ({
    key: t.id,
    content: <><strong>{t.label}</strong><Badge size="sm" className="g1-tag">{t.entryCount} of {corpus.corpusToday.entryCount}</Badge><span>{t.sentence} <em>{t.matches}</em></span></>
   }))}/>
   <p className="helper">{corpus.theSeamAlreadyInTheData.whatThisFileProposes}</p>
  </Region>

  <Region title={words.lockHeading}>
   <Locked title={lock.statement}>{lock.why}</Locked>
   <p className="helper">{refusal('evidence-grade-reuse-is-proposed-not-ratified').statement}</p>
  </Region>

  <Region title={words.sourcesHeading} count={federation.sources.length}>
   <p>{federation.policy.statement}</p>
   <RovingList label={`${federation.sources.length} external sources, none active`} className="g1-cards" rows={federation.sources.map(s => ({
    key: s.id,
    content: <article className="pt-card g1-card" aria-label={s.name}>
     <h3>{s.name} {!s.active && <Badge size="sm" className="g1-tag">{words.inactiveWord}</Badge>}</h3>
     <dl className="pt-facts">
      <div className="g1-fact"><dt>Authority</dt><dd>{s.authority} · {s.jurisdiction}</dd></div>
      <div className="g1-fact"><dt>Licence</dt><dd>{s.licensing.licence}. {s.licensing.notes}</dd></div>
      <div className="g1-fact"><dt>Rate limit</dt><dd>{s.rateLimit.requestsPerMinute} a minute. {s.rateLimit.basis}</dd></div>
      <div className="g1-fact"><dt>Residency</dt><dd>{s.dataResidency.hostedIn}. {s.dataResidency.notes}</dd></div>
      <div className="g1-fact"><dt>Use for</dt><dd>{s.useFor}</dd></div>
      <div className="g1-fact"><dt>Never for</dt><dd>{s.notFor}</dd></div>
      <div className="g1-fact"><dt>Address</dt><dd>{words.endpointSentence}</dd></div>
     </dl>
    </article>
   }))}/>
   <p className="helper">{federation.policy.activationRequires}</p>
  </Region>

  <Region title={words.refreshHeading}>
   <Empty>{g1.overview.refreshEmpty} {corpus.corpusToday.vectorIndex}</Empty>
  </Region>

  <Region title="Open for whoever owns the review queue">
   <p>{corpus.queueFitFlag.doesNotYetFit}</p>
   <p className="helper">{corpus.queueFitFlag.notDecidedHere}</p>
  </Region>

  <Region title="What this screen refuses" count={corpus.refusals.length}>
   <ul className="pt-refusals">{corpus.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
