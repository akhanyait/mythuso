import { useId, useState } from 'react';
import {
 ANY, attemptOf, categoryOf, classOf, contract, fill, fitLevelOf, fitOf, linkOf, matches, missingOf, needsOf, offers, outcomeOf,
 popiaFlagged, refusalOf, scopeOf, severityOf, shopProductOf, suppliers, uploadOf, type Filters, type Offer, type Scope, type Supplier
} from '../../lib/suppliers';
import { Badge, type BadgeVariant } from '../../ui/Badge';
import { buttonVariants } from '../../ui/Button';
import { Select } from './Fields';
import { Empty, Region, RovingList } from './Parts';
import './suppliers.css';

/* Catalogue · Suppliers & OEMs: who the products in the founder's sourcing catalogue are from (2 October 2026).
 *
 * Read from packages/catalog/suppliers.json, and from the shop's product names and class words through the
 * lib, so that an offer that could supply a listing names the listing the shop actually has. Every supplier with what the
 * catalogue states about it, every offer with its price, minimum order and claimed certifications as stated,
 * and beside each the part the catalogue left out: what South Africa would need and what is missing (today,
 * all of it), whether its readings would go to the supplier's own cloud, the claims flagged with the reason,
 * where it would fit MyThuso, and what was tried to verify it.
 *
 * What it refuses. Nothing is marked verified, ordered or sent: the screen has three filters held in its
 * own memory and no other control, and its one kind of link opens a public product page in a new tab when
 * pressed, with no referrer and no opener. A flagged claim is drawn only as a flag, never as the product's
 * description. And it is the back office's: the shop never imports it, so a supplier's name cannot reach the
 * unbranded shop through this screen. */

const words = contract.words;
const tones: Record<string, BadgeVariant> = { success: 'success', primary: 'primary', neutral: 'neutral', warning: 'warning', danger: 'danger' };
const toneOf = (tone: string): BadgeVariant => tones[tone] ?? 'neutral';
const usd = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

function SupplierFacts({ s }: { s: Supplier }) {
 const years = s.yearsOnPlatform === 1 ? words.yearOnPlatform : fill(words.yearsOnPlatform, { years: s.yearsOnPlatform });
 const rating = s.rating
  ? `${fill(words.ratingAsStated, { score: s.rating.score.toFixed(1), reviews: s.rating.reviews })}${s.rating.sold !== null ? `, ${fill(words.soldAsStated, { sold: s.rating.sold })}` : ''}`
  : (s.ratingNote ?? words.noRating);
 const twin = s.distinctFrom ?? null;
 return <dl className="pt-facts sp-facts" aria-label={`${words.supplierFacts}: ${s.legalName}`}>
  <div className="g1-fact"><dt>{words.supplierFacts}</dt><dd>{s.platform} · {years} · {s.badges.join(', ')} · {rating}</dd></div>
  <div className="g1-fact"><dt>{words.place}</dt><dd>{[s.place.city, s.place.province, s.place.country].filter(Boolean).join(', ') || words.placeUnknown}. <span className="helper">{s.place.from}</span></dd></div>
  <div className="g1-fact"><dt>{words.type}</dt><dd>{s.typeWhy}</dd></div>
  {twin && <div className="g1-fact"><dt>{words.distinctFrom}</dt><dd>{suppliers.find(t => t.id === twin.supplier)?.legalName}. {twin.why}</dd></div>}
  {s.note && <div className="g1-fact"><dt>{words.supplierFacts}</dt><dd>{s.note}</dd></div>}
  <div className="g1-fact"><dt>{words.verification}</dt><dd>{s.verification.status}{s.verification.checks.map((c, i) =>
   <p key={i} className="helper">{outcomeOf(c.outcome).label}. {c.found} {c.source && <a href={c.source} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{new URL(c.source).hostname}</a>}</p>)}</dd></div>
 </dl>;
}

function ScopeLine({ scope }: { scope: Scope }) {
 if (scope.id === 'shop') return <>{words.shopProduct}: {shopProductOf(scope.shopProduct).name}. {words.mismatch}: {scope.mismatch}</>;
 if (scope.id === 'nurse-kit') return <>{scope.use}</>;
 return <>{scope.why}</>;
}

function OfferCard({ offer }: { offer: Offer }) {
 const fit = fitLevelOf(fitOf(contract, offer));
 const scope = scopeOf(offer.scope.id);
 const missing = missingOf(contract, offer);
 const needs = needsOf(contract, offer);
 const claims = offer.saFit.claims;
 const flagged = popiaFlagged(contract, offer);
 const cls = offer.saFit.sahpraClass;
 const titleId = useId();
 const v = offer.verification;
 return <article className="pt-card sp-offer" aria-labelledby={titleId}>
  <h4 id={titleId}><span className="sp-number">{fill(words.offerNumber, { number: offer.number })}</span> {categoryOf(offer.category).label}</h4>
  <div className="sp-badges">
   <Badge size="sm" variant={toneOf(fit.tone)}>{fit.label}</Badge>
   <Badge size="sm" variant={toneOf(scope.tone)}>{scope.label}</Badge>
   {flagged && <Badge size="sm" variant="danger">{words.popiaHeading}</Badge>}
   {claims.length > 0 && <Badge size="sm" variant="warning">{words.claimsHeading} · {claims.length}</Badge>}
   <Badge size="sm" variant="neutral">{words.unverified}</Badge>
  </div>
  <dl className="pt-facts sp-facts">
   <div className="g1-fact"><dt>{words.listingTitle}</dt><dd><q>{offer.title}</q></dd></div>
   <div className="g1-fact"><dt>{words.specs}</dt><dd>{offer.specs}</dd></div>
   {offer.wireless && <div className="g1-fact"><dt>{words.wireless}</dt><dd>{offer.wireless.join(', ')}</dd></div>}
   {offer.dosageForm && <>
    <div className="g1-fact"><dt>{words.dosageForm}</dt><dd>{offer.dosageForm}</dd></div>
    <div className="g1-fact"><dt>{words.targetFunction}</dt><dd>{offer.targetFunction}</dd></div>
    <div className="g1-fact"><dt>{words.oemOdm}</dt><dd>{offer.oemOdm}</dd></div>
   </>}
   <div className="g1-fact"><dt>{words.price}</dt><dd>{offer.priceUsd.low === offer.priceUsd.high ? usd(offer.priceUsd.low) : `${usd(offer.priceUsd.low)}–${usd(offer.priceUsd.high)}`} per {offer.priceUsd.per}</dd></div>
   <div className="g1-fact"><dt>{words.moq}</dt><dd>{offer.moq.quantity.toLocaleString('en-GB')} {offer.moq.unit}</dd></div>
   <div className="g1-fact"><dt>{words.certifications}</dt><dd>{offer.certificationsClaimed.length ? offer.certificationsClaimed.join(', ') : words.noCertifications}</dd></div>
   {cls !== null && <div className="g1-fact"><dt>{words.sahpraClass}</dt><dd>{cls === 'none' ? words.notADevice : classOf(cls).label}. {offer.saFit.classWhy}</dd></div>}
   <div className="g1-fact"><dt>{words.checklist}</dt><dd>
    <ul className="sp-checklist" aria-label={`${words.checklist}: ${missing.length} of ${needs.length} ${words.missing.toLowerCase()}`}>{needs.map(r =>
     <li key={r.id}><Badge size="sm" variant={r.inPlace ? 'success' : 'danger'}>{r.inPlace ? r.label : words.missing}</Badge> <span><strong>{r.label}.</strong> {r.missing}</span></li>)}</ul>
   </dd></div>
   {offer.saFit.uploads !== null && <div className="g1-fact"><dt>{words.popiaHeading}</dt><dd>
    <strong>{uploadOf(contract, offer.saFit.uploads).label}.</strong> {offer.saFit.uploadsStated}
    {flagged && <p className="sp-flag" role="note">{contract.popia.flagSentence} {contract.popia.acceptableOnlyIf}</p>}
    {offer.saFit.uploads === 'unstated' && <p className="helper">{contract.popia.unstatedSentence}</p>}
   </dd></div>}
   <div className="g1-fact"><dt>{words.claimsHeading}</dt><dd>{claims.length === 0 ? words.noClaims
    : <ul className="sp-claims">{claims.map((claim, i) => <li key={i}>
     <Badge size="sm" variant={severityOf(contract, claim.severity).blocksAsOffered ? 'danger' : 'warning'}>{severityOf(contract, claim.severity).label}</Badge>{' '}
     <span><q className="sp-claim">{claim.claim}</q> {claim.why}</span></li>)}</ul>}</dd></div>
   <div className="g1-fact"><dt>{words.scope}</dt><dd>
    <strong>{scope.label}.</strong> <ScopeLine scope={offer.scope}/>
   </dd></div>
   <div className="g1-fact"><dt>{words.verification}</dt><dd>{v.status} {v.checkedOn ? fill(words.checked, { on: v.checkedOn }) : words.notChecked}
    {v.checks.length > 0 && <ul className="sp-checks">{v.checks.map((c, i) => <li key={i}>
     <strong>{outcomeOf(c.outcome).label}.</strong> {c.found ?? attemptOf(c.attempt).result}</li>)}</ul>}
   </dd></div>
  </dl>
  <a className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} sp-link`} href={linkOf(contract, offer)} target="_blank" rel="noopener noreferrer"
   referrerPolicy="no-referrer" aria-label={fill(words.linkAria, { id: offer.productId, number: offer.number })}>{fill(words.link, { id: offer.productId })}</a>
 </article>;
}

export function SuppliersScreen() {
 const [filters, setFilters] = useState<Filters>({ category: ANY, fit: ANY, scope: ANY });
 const ids = { category: useId(), fit: useId(), scope: useId() };
 const shown = suppliers.map(s => ({ s, list: s.offers.filter(o => matches(o, filters)) })).filter(x => x.list.length > 0);
 const count = shown.reduce((n, x) => n + x.list.length, 0);
 const set = (key: keyof Filters) => (value: string) => setFilters({ ...filters, [key]: value });
 const filter = (key: keyof Filters, label: string, options: readonly { id: string; label: string }[]) =>
  <div className="sp-filter">
   <label htmlFor={ids[key]}>{label}</label>
   <Select id={ids[key]} value={filters[key]} onChange={set(key)}>
    <option value={ANY}>{words.any}</option>
    {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
   </Select>
  </div>;

 return <>
  <Empty heading={contract.notice.heading}>{contract.notice.sentence} {contract.notice.linkSentence}</Empty>

  <Region title={words.filtersHeading}>
   <div className="sp-filters">
    {filter('category', words.categoryLabel, contract.categories)}
    {filter('fit', words.fitLabel, contract.saFitLevels)}
    {filter('scope', words.scopeLabel, contract.scopes)}
   </div>
   <p className="helper" role="status">{fill(words.showing, { shown: count, total: offers.length, suppliers: shown.length })}</p>
  </Region>

  <Region title={words.suppliersHeading} count={shown.length}>
   {shown.length === 0
    ? <p>{words.noneShown}</p>
    : <RovingList label={fill(words.showing, { shown: count, total: offers.length, suppliers: shown.length })} className="sp-suppliers" rows={shown.map(({ s, list }) => ({
     key: s.id,
     content: <article className="pt-card g1-card sp-supplier" aria-label={s.legalName}>
      <h3>{s.legalName} <Badge size="sm" variant="neutral">{words.unverified}</Badge></h3>
      <SupplierFacts s={s}/>
      <ul className="sp-offers" aria-label={`${list.length} of ${s.offers.length} offers from ${s.legalName}`}>{list.map(o => <li key={o.number}><OfferCard offer={o}/></li>)}</ul>
     </article>
    }))}/>}
  </Region>

  <Region title={words.requirementsHeading} count={contract.requirements.length}>
   <ul className="sp-requirements">{contract.requirements.map(r => <li key={r.id}>
    <Badge size="sm" variant={r.inPlace ? 'success' : 'danger'}>{r.inPlace ? r.label : words.missing}</Badge>{' '}
    <span><strong>{r.label}</strong> — {r.authority}, {r.instrument}. {r.what} {r.missing}{' '}
     <a href={r.source} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{new URL(r.source).hostname}</a></span>
   </li>)}</ul>
  </Region>

  <Region title={words.beforeOrderHeading} count={contract.beforeAnyOrder.length}>
   <ul className="pt-refusals">{contract.beforeAnyOrder.map(b => <li key={b.id}><strong>{b.label}.</strong> <span>{b.sentence}</span></li>)}</ul>
  </Region>

  <Region title={fill(words.attemptsHeading, { on: contract.source.suppliedOn })} count={contract.verification.attempts.length}>
   <p>{contract.verification.status} {refusalOf('nothing-verified-by-reading').why}</p>
   <ul className="pt-refusals">{contract.verification.attempts.map(a => <li key={a.id}><strong>{outcomeOf(a.outcome).label}.</strong> <span>{a.method} {a.result}</span></li>)}</ul>
  </Region>

  <Region title={words.refusalsHeading} count={contract.refusals.length}>
   <ul className="pt-refusals">{contract.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
