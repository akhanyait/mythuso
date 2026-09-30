import { useState } from 'react';
import { ArrowRight, Ban, Check, History, KeyRound, Link2, Printer, ShieldCheck, Users, X } from 'lucide-react';
import { Pill } from '../components/UI';
import { isoIn, longDateOf } from '../lib/scheduling';
import { qrCode, qrPath, QR_QUIET_ZONE } from '../lib/qr';
import { Badge, Button, Card } from '../ui';
import { nextOfKin } from '../../../../packages/catalog/sos-press.json';
import {
 actionLabel, cardGrant, categoriesSaid, categoryName, defaultScopeNow, emergencyCategories, exportContract, fill, grants, isSealed, logOf,
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
  {/* The export's two columns: building the link on the left, and on the right what stays private and the
      formats a record could leave in, as a read-only list — built and not built, each with its reason. */}
  <div className="ps-columns"><div className="ps-main">
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
   <Button leadingIcon={<Link2 aria-hidden="true"/>} onClick={make} disabled={!scope.length}>{say.sharing.make}</Button>
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
      <Button variant="secondary" size="sm" leadingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => open(link)}>{fill(say.sharing.openAs, { recipient: link.grant.recipientName })}</Button>
      {link.revokedAt === null && <Button variant="secondary" size="sm" leadingIcon={<Ban aria-hidden="true"/>} onClick={() => revokeLink(link.ref)}>{say.sharing.revoke}</Button>}
     </div>
    </li>)}
   </ul>}
   {opened && <p className="ps-made" role="status">{opened}</p>}
  </section>
  </div>
  <aside className="ps-aside" aria-label="What a copy of your record leaves out">
   <Card padding="md" className="ps-aside-card">
    <h2>What a copy of your record leaves out</h2>
    <ul className="ps-excluded">{exportContract.exclusions.map(rule => <li key={rule.id}><ShieldCheck size={16} aria-hidden="true"/><span>{rule.sentence}</span></li>)}</ul>
   </Card>
   <Card padding="md" className="ps-aside-card">
    <h2>The formats a copy could take</h2>
    <p>{exportContract.why}</p>
    <ul className="ps-formats">{exportContract.formats.map(format => <li key={format.id}>
     <span className="ps-format-head"><strong>{formatName[format.id] ?? format.id}</strong>
      <Badge size="sm" variant={format.built ? 'success' : 'neutral'}>{format.built ? <><Check size={12} aria-hidden="true"/>Built</> : <><X size={12} aria-hidden="true"/>Not built</>}</Badge></span>
     <small>{format.why}</small>
    </li>)}</ul>
   </Card>
   <div className="shortcut-list">
    <button className="shortcut-row" onClick={() => navigate(say.log.route)}><span className="service-icon"><History size={20}/></span><span className="shortcut-text"><strong>{say.sharing.logLink}</strong></span><ArrowRight size={17}/></button>
    <button className="shortcut-row" onClick={() => navigate(say.card.route)}><span className="service-icon"><ShieldCheck size={20}/></span><span className="shortcut-text"><strong>{say.sharing.cardLink}</strong></span><ArrowRight size={17}/></button>
   </div>
  </aside></div>
 </>;
}

/* What each export format is called. passport-sharing.json names a format by id and says in its reason what
   it is; the name a reader scans for is written once here, and an id this map does not know is shown as the
   id rather than dropped. */
const formatName: Record<string, string> = { 'fhir-bundle': 'FHIR R4 bundle', ips: 'International Patient Summary', pdf: 'PDF' };

/* ---- The emergency card -------------------------------------------------------------------------- */

/* The export's emergency information: two columns, with the card as the aside. Its form of blood group,
   allergies and conditions is not here — the card names categories and never carries values, and nothing on
   this screen stores health information — so the column beside the card is who may be told if you press SOS,
   a door to the next-of-kin sheet, in Safety's own words. */
export function EmergencyCard({ navigate, open }: { navigate: (page: string) => void; open?: (modal: string) => void }) {
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
  <div className="ps-columns ps-columns--card"><div className="ps-main">
   <Card padding="md" className="ps-aside-card">
    <h2>{nextOfKin.heading}</h2>
    <p>{nextOfKin.intro}</p>
    {open && <Button variant="secondary" leadingIcon={<Users aria-hidden="true"/>} trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => open('Next of kin')}>{nextOfKin.heading}</Button>}
   </Card>
   <div className="shortcut-list">
    <button className="shortcut-row" onClick={() => navigate(say.log.route)}><span className="service-icon"><History size={20}/></span><span className="shortcut-text"><strong>{say.sharing.logLink}</strong></span><ArrowRight size={17}/></button>
   </div>
  </div>
  <aside className="ps-aside" aria-label={say.card.title}>
  {!cardGrant ? <p className="muted">{say.card.noGrant}</p> : !card ? <section className="panel ps-panel">
   <p>{fill(say.card.ridesOn, { recipient: cardGrant.recipientName, when: when(cardGrant.expiresAt) })}</p>
   <p className="helper">{fill(say.card.opensOnly, { categories: categoriesSaid(emergencyCategories) })}</p>
   <Button leadingIcon={<ShieldCheck aria-hidden="true"/>} onClick={make}>{say.card.make}</Button>
   {refused && <p className="ps-refusal" role="alert">{refused}</p>}
  </section> : <CardFace card={card}/>}
  </aside></div>
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
  <Button variant="secondary" className="ps-print" leadingIcon={<Printer aria-hidden="true"/>} onClick={() => window.print()}>{say.card.print}</Button>
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
