import { useState } from 'react';
import { ArrowRight, Ban, History, KeyRound, Link2, Printer, ShieldCheck } from 'lucide-react';
import { Pill } from '../components/UI';
import { isoIn, longDateOf } from '../lib/scheduling';
import { qrCode, qrPath, QR_QUIET_ZONE } from '../lib/qr';
import {
 actionLabel, cardGrant, categoriesSaid, categoryName, defaultScopeNow, emergencyCategories, fill, grants, isSealed, logOf,
 makeLink, openLink, outcomeLabel, payersSaid, qrTextFor, refusalOf, revokeLink, roleLabel, say, logWords, scopeName, useSharing, wouldBe,
 type Grant, type Link
} from '../lib/share-links';
import { recordSettingsNow } from '../lib/settings';
import './passport-sharing.css';

/* Three screens of the Health Passport's P1: making a share link, the emergency card, and who opened the record.
 *
 * Every rule is packages/engines/src/record/domain/links.ts's, asked through lib/share-links.ts, and every end and
 * number of opens a screen shows is what that function worked out from the Record settings in force — no screen
 * here types how long a link lasts or how often it opens. Every sentence is a contract's: the refusals the
 * gateway's, the words passport-sharing.json's. Each screen says it is a preview before anything else, because a
 * card with a QR code on it is exactly the thing somebody could mistake for the real one.
 *
 * All three are behind a dynamic import from App.tsx: none is on the patient's first view, and between them they
 * carry four contracts and a QR encoder a patient on metered data should not download to see their overview. */

const when = (at: number) => longDateOf(isoIn(new Date(at)));
const clock = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

function PreviewNote({ text }: { text: string }) {
 return <p className="not-connected block ps-preview" role="note"><ShieldCheck size={17} aria-hidden="true"/><span>{text}</span></p>;
}

/* ---- Share links ------------------------------------------------------------------------------- */

export function ShareLinks({ navigate }: { navigate: (page: string) => void }) {
 const { links } = useSharing();
 const [grantRef, setGrantRef] = useState(grants[0]?.ref ?? '');
 const grant = grants.find(candidate => candidate.ref === grantRef) ?? null;
 const [scope, setScope] = useState<string[]>(() => (grant ? defaultScopeNow(grant, 'share-link') : []));
 const [made, setMade] = useState<string>('');
 const [opened, setOpened] = useState<string>('');
 const choose = (next: Grant) => { setGrantRef(next.ref); setScope(defaultScopeNow(next, 'share-link')); setMade(''); };
 const toggle = (category: string) => setScope(scope.includes(category) ? scope.filter(c => c !== category) : [...scope, category]);
 const sealedIncluded = scope.some(isSealed);
 const terms = grant && scope.length ? wouldBe(grant, 'share-link', scope, sealedIncluded) : null;
 const make = () => {
  if (!grant) return;
  const result = makeLink(grant, 'share-link', scope, sealedIncluded);
  setMade(result.ok ? fill(say.sharing.made, { code: result.link.code }) : result.refusal);
 };
 const open = (link: Link) => {
  const result = openLink(link.ref);
  setOpened(result.ok ? fill(say.sharing.opened, { categories: categoriesSaid(result.categories), recipient: link.grant.recipientName }) : result.refusal);
 };
 const defaultInForce = recordSettingsNow().linkDefaultScope;
 return <>
  <div className="page-intro"><div className="eyebrow">{say.sharing.eyebrow}</div><h1>{say.sharing.title}</h1><p>{say.sharing.intro}</p></div>
  <PreviewNote text={say.sharing.preview}/>
  <section className="panel ps-panel" aria-labelledby="ps-grants">
   <h2 id="ps-grants">{say.sharing.grantsHeading}</h2>
   <div className="ps-grants" role="radiogroup" aria-labelledby="ps-grants">
    {grants.map(candidate => <label key={candidate.ref} className={`ps-grant${candidate.ref === grantRef ? ' is-chosen' : ''}`}>
     <input type="radio" name="ps-grant" checked={candidate.ref === grantRef} onChange={() => choose(candidate)}/>
     <span><strong>{candidate.recipientName}</strong>
      <small>{fill(say.sharing.grantEnds, { when: when(candidate.expiresAt) })}</small>
      <small>{fill(say.sharing.grantOpens, { categories: categoriesSaid(candidate.scope) })}</small></span>
    </label>)}
   </div>
  </section>
  {grant && <section className="panel ps-panel" aria-labelledby="ps-scope">
   <h2 id="ps-scope">{say.sharing.scopeHeading}</h2>
   <p className="helper">{fill(say.sharing.defaultScope, { scope: scopeName(defaultInForce) })}</p>
   <div className="ps-scope">
    {grant.scope.map(category => <label key={category} className="ps-check">
     <input type="checkbox" checked={scope.includes(category)} onChange={() => toggle(category)}/>
     <span>{isSealed(category) ? fill(say.sharing.sealedTick, { category: categoryName(category) }) : categoryName(category)}</span>
    </label>)}
   </div>
   {terms && (terms.ok
    ? <p className="ps-terms">{fill(say.sharing.lifetime, { when: when(terms.value.expiresAt), uses: terms.value.usesAllowed })}</p>
    : <p className="ps-refusal" role="alert"><Ban size={16} aria-hidden="true"/>{refusalOf(terms.refusal)}</p>)}
   <p className="helper">{say.sharing.lifetimeWhy}</p>
   <p className="helper">{fill(say.sharing.neverTo, { payers: payersSaid })}</p>
   <button className="primary" onClick={make} disabled={!scope.length}><Link2 size={17} aria-hidden="true"/>{say.sharing.make}</button>
   {made && <p className="ps-made" role="status"><KeyRound size={16} aria-hidden="true"/>{made}</p>}
  </section>}
  <section className="panel ps-panel" aria-labelledby="ps-links">
   <h2 id="ps-links">{say.sharing.linksHeading}</h2>
   {links.filter(link => link.terms.kindCode === 'share-link').length === 0 ? <p className="muted">{say.sharing.noLinks}</p> : <ul className="ps-links">
    {links.filter(link => link.terms.kindCode === 'share-link').map(link => <li key={link.ref} className="ps-link">
     <div><strong>{link.grant.recipientName}</strong><small>{categoriesSaid(link.terms.scope)}</small>
      <small>{fill(say.sharing.ends, { when: when(link.terms.expiresAt) })} · {fill(say.sharing.usesLeft, { uses: link.terms.usesAllowed - link.uses })}</small></div>
     {link.revokedAt !== null ? <Pill tone="amber">{say.sharing.revoked}</Pill> : null}
     <div className="ps-actions">
      <button className="secondary" onClick={() => open(link)}><ArrowRight size={16} aria-hidden="true"/>{fill(say.sharing.openAs, { recipient: link.grant.recipientName })}</button>
      {link.revokedAt === null && <button className="secondary" onClick={() => revokeLink(link.ref)}><Ban size={16} aria-hidden="true"/>{say.sharing.revoke}</button>}
     </div>
    </li>)}
   </ul>}
   {opened && <p className="ps-made" role="status">{opened}</p>}
  </section>
  <div className="shortcut-list">
   <button className="shortcut-row" onClick={() => navigate(say.log.route)}><span className="service-icon"><History size={20}/></span><span className="shortcut-text"><strong>{say.sharing.logLink}</strong></span><ArrowRight size={17}/></button>
   <button className="shortcut-row" onClick={() => navigate(say.card.route)}><span className="service-icon"><ShieldCheck size={20}/></span><span className="shortcut-text"><strong>{say.sharing.cardLink}</strong></span><ArrowRight size={17}/></button>
  </div>
 </>;
}

/* ---- The emergency card -------------------------------------------------------------------------- */

export function EmergencyCard({ navigate }: { navigate: (page: string) => void }) {
 const { links } = useSharing();
 const [refused, setRefused] = useState('');
 const card = links.find(link => link.terms.kindCode === 'emergency-card' && link.revokedAt === null) ?? null;
 const make = () => {
  if (!cardGrant) return;
  const result = makeLink(cardGrant, 'emergency-card');
  setRefused(result.ok ? '' : result.refusal);
 };
 return <>
  <div className="page-intro"><div className="eyebrow">{say.card.eyebrow}</div><h1>{say.card.title}</h1><p>{say.card.intro}</p></div>
  <PreviewNote text={say.card.preview}/>
  {!cardGrant ? <p className="muted">{say.card.noGrant}</p> : !card ? <section className="panel ps-panel">
   <p>{fill(say.card.ridesOn, { recipient: cardGrant.recipientName, when: when(cardGrant.expiresAt) })}</p>
   <p className="helper">{fill(say.card.opensOnly, { categories: categoriesSaid(emergencyCategories) })}</p>
   <button className="primary" onClick={make}><ShieldCheck size={17} aria-hidden="true"/>{say.card.make}</button>
   {refused && <p className="ps-refusal" role="alert">{refused}</p>}
  </section> : <CardFace card={card}/>}
  <div className="shortcut-list">
   <button className="shortcut-row" onClick={() => navigate(say.log.route)}><span className="service-icon"><History size={20}/></span><span className="shortcut-text"><strong>{say.sharing.logLink}</strong></span><ArrowRight size={17}/></button>
  </div>
 </>;
}

function CardFace({ card }: { card: Link }) {
 const code = qrCode(qrTextFor(card.code));
 const extent = code.size + QR_QUIET_ZONE * 2;
 return <section className="emergency-card" aria-labelledby="ps-card-title">
  <div className="ps-card-head">
   <h2 id="ps-card-title">{say.card.title}</h2>
   <Pill tone="amber">{say.card.preview.split('.')[0]}</Pill>
  </div>
  <p className="ps-card-preview">{say.card.preview}</p>
  <div className="ps-card-body">
   <svg className="ps-qr" viewBox={`0 0 ${extent} ${extent}`} role="img" aria-label={say.card.qrLabel} shapeRendering="crispEdges">
    <rect width={extent} height={extent} fill="#fff"/>
    <path d={qrPath(code)} fill="#000"/>
   </svg>
   <dl className="ps-card-facts">
    <div><dt>{say.card.code}</dt><dd className="ps-code">{card.code}</dd></div>
    <div><dt>{fill(say.card.opensOnly, { categories: categoriesSaid(emergencyCategories) })}</dt><dd>{say.card.sealedNever}</dd></div>
    <div><dt>{fill(say.card.ends, { when: when(card.terms.expiresAt) })}</dt><dd>{fill(say.card.opens, { uses: card.terms.usesAllowed })}</dd></div>
    <div><dt>{fill(say.card.ridesOn, { recipient: card.grant.recipientName, when: when(card.grant.expiresAt) })}</dt><dd/></div>
   </dl>
  </div>
  <button className="secondary ps-print" onClick={() => window.print()}><Printer size={17} aria-hidden="true"/>{say.card.print}</button>
 </section>;
}

/* ---- Who opened the record ------------------------------------------------------------------------ */

export function PassportAccessLog({ navigate }: { navigate: (page: string) => void }) {
 const { entries } = useSharing();
 const log = logOf(entries);
 return <>
  <div className="page-intro"><div className="eyebrow">{say.log.eyebrow}</div><h1>{say.log.title}</h1><p>{say.log.intro}</p></div>
  <PreviewNote text={say.log.preview}/>
  <p className="helper">{say.log.chain}</p>
  <section className="panel ps-panel" aria-labelledby="ps-log">
   <h2 id="ps-log">{say.log.newest}</h2>
   {log.length === 0 ? <p className="muted">{say.log.empty}</p> : <ol className="ps-log">
    {log.map(entry => <li key={entry.id} className={`ps-entry is-${entry.outcome}`}>
     <div className="ps-entry-head">
      <strong>{actionLabel(entry.action)}</strong>
      <Pill tone={entry.outcome === 'granted' ? 'teal' : 'amber'}>{outcomeLabel(entry.outcome)}</Pill>
      {entry.breakGlass && <Pill tone="amber">{logWords.breakGlass}</Pill>}
     </div>
     <small>{roleLabel(entry.requesterRole)} · {when(entry.at)} · {clock(entry.at)}{entry.purpose ? ` · ${fill(logWords.purpose, { purpose: entry.purpose })}` : ''}</small>
     <p>{entry.reason}</p>
     {entry.reviewDueAt !== null && <small>{fill(logWords.reviewDue, { when: when(entry.reviewDueAt) })}</small>}
    </li>)}
   </ol>}
  </section>
  <div className="shortcut-list">
   <button className="shortcut-row" onClick={() => navigate(say.sharing.route)}><span className="service-icon"><Link2 size={20}/></span><span className="shortcut-text"><strong>{say.sharing.title}</strong></span><ArrowRight size={17}/></button>
  </div>
 </>;
}
