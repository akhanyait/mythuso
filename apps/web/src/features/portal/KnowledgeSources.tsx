import { useId, useState, type FormEvent } from 'react';
import federation from '../../../../../packages/catalog/knowledge/federation.json' with { type: 'json' };
import {
 activationRefusals, governance, notAdmitted, propose, refusalOf, refusals, signatureOf, signatureRoles, sources, verdictOf,
 type Proposal, type ProposalOutcome, type Signature
} from '../../lib/knowledge-sources';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Input } from '../../ui/Input';
import { Empty, Region, RovingList } from './Parts';

/* Governance · Knowledge sources: every source GilbertOne could ever ask, and the two signatures each
 * one waits on (founder's asks of 27 September and 1 October 2026).
 *
 * Read from packages/catalog/knowledge/federation.json and from nothing else: each source's licence and
 * the verdict on it, where it is hosted, who it is for, and its two signatures — none of which exists,
 * because neither the clinical reviewer nor the Information Officer has been appointed. Below them, the
 * sources that were assessed and turned away, with the reason, so nobody proposes them again without
 * new terms.
 *
 * The founder may paste a link. It becomes a PROPOSED source in this screen's memory — not fetched, not
 * opened, not stored, not sent — with no licence verdict and no signature, and it is gone when the
 * screen is left. Writing it into the contract is a person's reviewed commit. Every "Switch on" is
 * disabled and says which condition is missing, in the contract's own words: this screen switches
 * nothing on, whatever the state of a source, and there is no handler that could. */

function Signatures({ holder }: { holder: { signOff?: Record<string, Signature> } }) {
 return <ul className="ks-signatures">{signatureRoles.map(role => {
  const signed = signatureOf(holder, role.id);
  return <li key={role.id}>
   <strong>{role.label}</strong>{' '}
   <span>{signed ? `${governance.words.signedBy} ${signed.signedBy}, ${signed.signedOn}` : role.appointed ? governance.words.notSigned : governance.words.notAppointed}</span>
  </li>;
 })}</ul>;
}

/* Disabled, and described by every condition it is still missing. There is no onClick on purpose. */
function SwitchOn({ holder, name }: { holder: Parameters<typeof activationRefusals>[0]; name: string }) {
 const id = useId();
 const missing = activationRefusals(holder);
 return <div className="ks-switch">
  <Button variant="secondary" size="sm" disabled aria-label={`${governance.words.switchOn}: ${name}`} aria-describedby={id}>{governance.words.switchOn}</Button>
  <p id={id} className="helper">{missing.map(r => refusalOf(r).statement).join(' ')}</p>
 </div>;
}

export function KnowledgeSourcesScreen() {
 const words = governance.words;
 const inputId = useId();
 const [link, setLink] = useState('');
 const [held, setHeld] = useState<readonly Proposal[]>([]);
 const [sequence, setSequence] = useState(1);
 const [outcome, setOutcome] = useState<ProposalOutcome | null>(null);
 const submit = (event: FormEvent) => {
  event.preventDefault();
  const result = propose(link, held, sequence);
  setOutcome(result);
  if (result.ok) { setHeld([...held, result.proposal]); setSequence(sequence + 1); setLink(''); }
 };
 const withdraw = (id: string) => { setHeld(held.filter(p => p.id !== id)); setOutcome(null); };
 const error = outcome && !outcome.ok ? `${outcome.refusal.statement}${outcome.detail ? ` ${outcome.detail}` : ''}` : undefined;

 return <>
  <Empty heading={refusalOf('no-activation-without-two-signatures').statement}>{federation.policy.statement}</Empty>

  <Region title={words.signersHeading} count={signatureRoles.length}>
   <RovingList label={`${signatureRoles.length} signatures every source needs`} rows={signatureRoles.map(role => ({
    key: role.id,
    content: <><strong>{role.label}</strong><Badge size="sm" variant="warning">{role.appointed ? words.appointed : words.notAppointed}</Badge><span>{role.signs}</span></>
   }))}/>
   <p className="helper">{refusalOf('no-signature-without-an-appointee').statement}</p>
  </Region>

  <Region title={words.sourcesHeading} count={sources.length}>
   <p>{federation.policy.activationRequires}</p>
   <RovingList label={`${sources.length} sources in the contract, none switched on`} className="g1-cards" rows={sources.map(s => {
    const verdict = verdictOf(s.licensing.verdict);
    return {
     key: s.id,
     content: <article className="pt-card g1-card ks-card" aria-label={s.name}>
      <h3>{s.name} <Badge size="sm" variant="warning">{words.awaiting}</Badge></h3>
      <dl className="pt-facts">
       <div className="g1-fact"><dt>{words.authority}</dt><dd>{s.authority} · {s.jurisdiction}</dd></div>
       <div className="g1-fact"><dt>{words.licence}</dt><dd>{s.licensing.licence}. {s.licensing.notes}</dd></div>
       <div className="g1-fact"><dt>{words.verdict}</dt><dd><Badge size="sm" variant={verdict.mayActivate ? 'neutral' : 'danger'}>{verdict.label}</Badge> {verdict.sentence}</dd></div>
       <div className="g1-fact"><dt>{words.residency}</dt><dd>{s.dataResidency.hostedIn}. {s.dataResidency.notes}</dd></div>
       <div className="g1-fact"><dt>{words.audience}</dt><dd>{s.audience}</dd></div>
       <div className="g1-fact"><dt>{words.languages}</dt><dd>{s.languages.join(', ')}</dd></div>
       <div className="g1-fact"><dt>{words.useFor}</dt><dd>{s.useFor}</dd></div>
       <div className="g1-fact"><dt>{words.notFor}</dt><dd>{s.notFor}</dd></div>
       <div className="g1-fact"><dt>{words.signatures}</dt><dd><Signatures holder={s as { signOff?: Record<string, Signature> }}/></dd></div>
      </dl>
      <SwitchOn holder={s as Parameters<typeof activationRefusals>[0]} name={s.name}/>
     </article>
    };
   })}/>
  </Region>

  <Region title={words.proposeHeading}>
   <p>{refusalOf('a-link-is-not-knowledge').statement}</p>
   <form className="ks-propose" onSubmit={submit} aria-label={words.proposeHeading} noValidate>
    <Field label={words.linkLabel} htmlFor={inputId} hint={words.linkHint} error={error}>
     <Input id={inputId} type="url" inputMode="url" autoComplete="off" spellCheck={false} value={link} onChange={event => setLink(event.target.value)}/>
    </Field>
    <Button type="submit" variant="primary">{words.proposeButton}</Button>
   </form>
   <p className="helper">{refusalOf('proposal-kept-in-this-screen-only').statement}</p>
   <div role="status" className="visually-hidden">{outcome?.ok ? words.proposedNow : ''}</div>
   {held.length === 0
    ? <p className="helper">{words.noProposals}</p>
    : <RovingList label={`${held.length} proposed in this screen`} className="g1-cards" rows={held.map(p => ({
     key: p.id,
     content: <article className="pt-card g1-card ks-card ks-proposal" aria-label={p.link}>
      <h3><span className="ks-link">{p.host}</span> <Badge size="sm" variant="warning">{words.proposed}</Badge></h3>
      <dl className="pt-facts">
       <div className="g1-fact"><dt>{words.link}</dt><dd><code>{p.link}</code></dd></div>
       <div className="g1-fact"><dt>{words.verdict}</dt><dd><Badge size="sm" variant="danger">{verdictOf(p.licensing.verdict).label}</Badge> {verdictOf(p.licensing.verdict).sentence}</dd></div>
       <div className="g1-fact"><dt>{words.signatures}</dt><dd><Signatures holder={p}/></dd></div>
      </dl>
      <SwitchOn holder={p} name={p.host}/>
      <Button variant="ghost" size="sm" aria-label={`${words.withdraw}: ${p.link}`} onClick={() => withdraw(p.id)}>{words.withdraw}</Button>
     </article>
    }))}/>}
  </Region>

  <Region title={words.notAdmittedHeading} count={notAdmitted.length}>
   <RovingList label={`${notAdmitted.length} assessed and not admitted`} rows={notAdmitted.map(n => ({
    key: n.id,
    content: <><strong>{n.name}</strong><Badge size="sm" variant="danger">{verdictOf(n.verdict).label}</Badge><span>{n.licence}. {n.reason}</span></>
   }))}/>
  </Region>

  <Region title={words.refusalsHeading} count={refusals.length}>
   <ul className="pt-refusals">{refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
