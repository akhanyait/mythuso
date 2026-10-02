import corpus from '../../../../../../packages/catalog/knowledge-corpus-tiers.json' with { type: 'json' };
import federation from '../../../../../../packages/catalog/knowledge/federation.json' with { type: 'json' };
import { g1 } from '../../../lib/gilbertone-admin';
import { Empty, Region, RovingList } from '../Parts';
import { Locked } from './Controls';
import { Badge } from '../../../ui/Badge';
import { demonstrationStateOf, governance, signatureRoles, verdictOf, waitingForOf } from '../../../lib/knowledge-sources';
import { demonstration, demonstrationDisclaimer, demonstrationWords } from '../../../lib/demonstration-override';

/* GilbertOne · Knowledge (§7.6): the clinical and non-clinical corpora and the external sources.
 *
 * The split is packages/catalog/knowledge-corpus-tiers.json's proposal, and the screen says plainly
 * that it is not enforced yet: every refresh still re-embeds the whole undivided corpus, and the
 * contract's own refusal says nothing may claim otherwise. The clinical-corpus lock is drawn as a
 * locked setting — a refresh of the clinical half happens only through a ratified Clinician Review
 * Queue entry — with no control beside it. The federation sources are packages/catalog/knowledge/
 * federation.json's, every one of them not active, each with its licence, the verdict on it, its rate
 * limit, where it is hosted, what it is for and not for, and the two signatures it waits on. Their
 * addresses are not drawn. Proposing a source and reading what each signature covers is Governance's
 * (features/portal/KnowledgeSources.tsx), so this screen keeps no control.
 *
 * Since 2 October 2026 the founder's demonstration override opens the sources whose licences permit it,
 * without their signatures: each such source says so beside its name, the override's disclaimer stands
 * above the list word for word, and the sentence about its address says who asks it and with what. */

export function KnowledgeScreen() {
 const words = g1.knowledge;
 const signOff = governance.words;
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
   {demonstration.inForce && <p className="helper" role="note"><strong>{demonstration.disclaimer.label}.</strong> {demonstrationDisclaimer}</p>}
   <RovingList label={`${federation.sources.length} external sources, ${federation.sources.filter(s => demonstrationStateOf(s)).length} on for demonstration`} className="g1-cards" rows={federation.sources.map(s => ({
    key: s.id,
    content: <article className="pt-card g1-card" aria-label={s.name}>
     <h3>{s.name} {demonstrationStateOf(s)
      ? <Badge size="sm" variant="success" className="g1-tag">{demonstrationStateOf(s) === 'on' ? demonstration.disclaimer.label : demonstrationWords.waitingForCredentials}</Badge>
      : !s.active && <Badge size="sm" className="g1-tag">{words.inactiveWord}</Badge>}</h3>
     <dl className="pt-facts">
      <div className="g1-fact"><dt>Authority</dt><dd>{s.authority} · {s.jurisdiction}</dd></div>
      <div className="g1-fact"><dt>Licence</dt><dd>{s.licensing.licence}. {s.licensing.notes}</dd></div>
      <div className="g1-fact"><dt>{signOff.verdict}</dt><dd>{verdictOf(s.licensing.verdict).label}. {verdictOf(s.licensing.verdict).sentence}</dd></div>
      <div className="g1-fact"><dt>{signOff.signatures}</dt><dd>{signOff.awaiting}. {signatureRoles.map(r => `${r.label}: ${r.appointed ? signOff.notSigned : signOff.notAppointed}`).join(' · ')}</dd></div>
      <div className="g1-fact"><dt>Rate limit</dt><dd>{s.rateLimit.requestsPerMinute} a minute. {s.rateLimit.basis}</dd></div>
      <div className="g1-fact"><dt>Residency</dt><dd>{s.dataResidency.hostedIn}. {s.dataResidency.notes}</dd></div>
      <div className="g1-fact"><dt>Use for</dt><dd>{s.useFor}</dd></div>
      <div className="g1-fact"><dt>Never for</dt><dd>{s.notFor}</dd></div>
      <div className="g1-fact"><dt>Address</dt><dd>{demonstrationStateOf(s) ? `${demonstrationWords.calledBy}${demonstrationStateOf(s) === 'waiting-for-credentials' ? ` ${waitingForOf(s)}` : ''}` : words.endpointSentence}</dd></div>
     </dl>
    </article>
   }))}/>
   <p className="helper">{federation.policy.activationRequires}</p>
   <p className="helper">{signOff.whereProposed}</p>
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
