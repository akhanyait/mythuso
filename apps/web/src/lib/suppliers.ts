import registerJson from '../../../../packages/catalog/suppliers.json' with { type: 'json' };
import shop from '../../../../packages/catalog/shop.json' with { type: 'json' };

/* The OEM and supplier register, as the Control Tower reads it (the founder's ask of 2 October 2026: "lets
   have this on the OEM/Supplier so that we know who these are from").

   packages/catalog/suppliers.json holds what the founder's sourcing catalogue states about forty-odd
   Alibaba suppliers and their fifty offers, and what selling each in South Africa would need. This file is
   the reasoning over it, and every function takes the contract as its first argument so that
   scripts/check-suppliers.mjs asks the very same function the screen does — a rule that lived twice would
   be a filter and a check that could disagree. What it will not do is the point of it:

   - It decides nothing about a supplier. An offer's South African fit is worked out from what the contract
     records (its class, its radios, where its readings go, the claims flagged on it), never typed, and
     every record stays unverified whatever is tried: no function here can return anything else.
   - It builds an Alibaba address from the contract's one pattern and a public product ID, and nothing
     more. It never fetches, never opens a window, never sends an enquiry. A link is followed only when a
     person presses it.
   - It reads the shop and the shop never reads it. The shop is unbranded on purpose and never imports this
     file; this file borrows the shop's class vocabulary and product names so a candidate names a real
     listing. */

/* The contract's shape, written once here because fifty heterogeneous records infer as a union nobody can
   read; scripts/check-suppliers.mjs holds the file to it field by field. */
type Labelled = { readonly id: string; readonly label: string };
export type Claim = { readonly claim: string; readonly severity: string; readonly why: string };
export type Check = { readonly attempt: string; readonly outcome: string; readonly found?: string; readonly source?: string };
export type Verification = { readonly verdict: 'unverified'; readonly status: string; readonly checkedOn: string | null; readonly checks: readonly Check[] };
export type Scope =
 | { readonly id: 'shop'; readonly shopProduct: string; readonly mismatch: string }
 | { readonly id: 'nurse-kit'; readonly use: string }
 | { readonly id: 'out-of-scope' | 'supplements-not-stocked'; readonly why: string };
export type Offer = {
 readonly number: number; readonly title: string; readonly brands?: readonly string[]; readonly kind: 'device' | 'supplement';
 readonly category: string; readonly specs: string; readonly wireless?: readonly string[];
 readonly dosageForm?: string; readonly oemOdm?: string; readonly targetFunction?: string;
 readonly priceUsd: { readonly low: number; readonly high: number; readonly per: string };
 readonly moq: { readonly quantity: number; readonly unit: string };
 readonly certificationsClaimed: readonly string[]; readonly productId: string;
 readonly saFit: { readonly sahpraClass: string | null; readonly classWhy?: string; readonly uploads: string | null; readonly uploadsStated?: string; readonly claims: readonly Claim[]; readonly alsoNeeds: readonly string[] };
 readonly scope: Scope; readonly verification: Verification;
};
export type Supplier = {
 readonly id: string; readonly legalName: string; readonly shortName: string;
 readonly place: { readonly city: string | null; readonly province: string | null; readonly country: string; readonly from: string };
 readonly platform: string; readonly yearsOnPlatform: number; readonly badges: readonly string[];
 readonly rating: { readonly score: number; readonly reviews: number; readonly sold: number | null } | null; readonly ratingNote?: string;
 readonly statedIn: string; readonly statedOn: string; readonly type: 'manufacturer' | 'trading-firm' | 'not-stated'; readonly typeWhy: string;
 readonly distinctFrom?: { readonly supplier: string; readonly why: string }; readonly note?: string;
 readonly verification: Verification; readonly offers: readonly Offer[];
};
export type Requirement = { readonly id: string; readonly label: string; readonly appliesWhen: string; readonly authority: string; readonly instrument: string; readonly what: string; readonly inPlace: boolean; readonly missing: string; readonly source: string; readonly confidence: string };
type Sentence = Labelled & { readonly sentence: string };
type Toned = Sentence & { readonly tone: string };
export type Register = Omit<typeof registerJson, 'suppliers' | 'requirements' | 'scopes' | 'saFitLevels' | 'claimSeverities' | 'radios' | 'uploads' | 'verification' | 'refusals'> & {
 readonly suppliers: readonly Supplier[]; readonly requirements: readonly Requirement[];
 readonly scopes: readonly Toned[]; readonly saFitLevels: readonly Toned[];
 readonly claimSeverities: readonly (Sentence & { readonly blocksAsOffered: boolean })[];
 readonly radios: readonly (Labelled & { readonly matches: readonly string[]; readonly needs: readonly string[] })[];
 readonly uploads: readonly (Labelled & { readonly flag: boolean })[];
 readonly verification: { readonly status: string; readonly attempts: readonly { readonly id: string; readonly on: string; readonly method: string; readonly result: string; readonly outcome: string }[]; readonly outcomes: readonly Labelled[] };
 readonly refusals: readonly { readonly id: string; readonly statement: string; readonly why: string }[];
};
const register = registerJson as unknown as Register;

const one = <T extends { id: string }>(list: readonly T[], id: string, where: string): T => {
 const found = list.find(item => item.id === id);
 if (!found) throw new Error(`packages/catalog/suppliers.json#${where} has no "${id}".`);
 return found;
};

/* The radios an offer carries, read from the catalogue's own words for them by the contract's matches. A
   word is matched whole and case-sensitively after splitting on spaces and slashes ("GSM 4G/LTE" is three
   words), so GPS, a wire or a phrase like "app cloud sync" brings nothing. */
export function radiosOf(c: Register, offer: Offer): readonly string[] {
 const stated = offer.wireless ?? [];
 const words = stated.flatMap(w => w.split(/[\s/]+/));
 return c.radios.filter(radio => radio.matches.some(m => words.includes(m))).map(r => r.id);
}

/* Which South African requirements an offer would have to meet, in the contract's order. A requirement
   says when it applies; radios bring their own; the rest an offer names in alsoNeeds. Nothing here is
   optional because a supplier says it has a CE mark: those are another country's approvals. */
export function needsOf(c: Register, offer: Offer): readonly Requirement[] {
 const fromRadios = new Set(radiosOf(c, offer).flatMap(id => one(c.radios, id, 'radios').needs));
 const named = new Set(offer.saFit.alsoNeeds);
 const device = offer.kind === 'device';
 const medical = device && offer.saFit.sahpraClass !== null && offer.saFit.sahpraClass !== 'none';
 return c.requirements.filter(r => {
  switch (r.appliesWhen) {
   case 'medical-device': return medical;
   case 'device': return device;
   case 'supplement': return offer.kind === 'supplement';
   case 'supplier-cloud': return offer.saFit.uploads === 'supplier-cloud';
   case 'radio': return fromRadios.has(r.id);
   case 'named': return named.has(r.id);
   default: throw new Error(`packages/catalog/suppliers.json's requirement "${r.id}" applies when "${r.appliesWhen}", which this register does not know.`);
  }
 });
}

/* What is missing is every requirement that is not in place — today, all of them. */
export const missingOf = (c: Register, offer: Offer): readonly Requirement[] => needsOf(c, offer).filter(r => !r.inPlace);

export const severityOf = (c: Register, id: string) => one(c.claimSeverities, id, 'claimSeverities');
export const uploadOf = (c: Register, id: string) => one(c.uploads, id, 'uploads');
export const popiaFlagged = (c: Register, offer: Offer): boolean =>
 offer.saFit.uploads !== null && uploadOf(c, offer.saFit.uploads).flag;

/* The South African fit, worked out and never typed (suppliers.json, _saFitLevelsWhy): a claim whose
   severity blocks the offer makes it not as offered; otherwise readings bound for the supplier's cloud, or
   any flagged claim, make it conditional; otherwise it is the paperwork, which is all still to do. */
export function fitOf(c: Register, offer: Offer): string {
 const claims = offer.saFit.claims;
 if (claims.some(claim => severityOf(c, claim.severity).blocksAsOffered)) return 'not-as-offered';
 if (popiaFlagged(c, offer) || claims.length > 0) return 'conditions';
 return 'paperwork';
}

/* The one address an offer has, from the contract's pattern. The ID is digits and nothing else; anything
   else throws rather than become part of a link. */
export function linkOf(c: Register, offer: Offer): string {
 if (!/^\d{8,16}$/.test(offer.productId)) throw new Error(`Offer #${offer.number} has a product ID that is not a run of digits.`);
 return c.source.urlPattern.replace('{productId}', offer.productId);
}

export const fill = (text: string, values: Record<string, string | number>) =>
 text.replace(/\{(\w+)\}/g, (_, name: string) => {
  if (!(name in values)) throw new Error(`"${text}" asks for {${name}}, which was not given.`);
  return String(values[name]);
 });

/* ---- The register as the screen reads it ----------------------------------------------------------- */

export const contract: Register = register;
export const suppliers: readonly Supplier[] = register.suppliers;
export const offers: readonly Offer[] = suppliers.flatMap(s => s.offers);
export const supplierOf = (offer: Offer): Supplier => suppliers.find(s => s.offers.includes(offer))!;
export const categoryOf = (id: string): Labelled => one(register.categories, id, 'categories');
export const scopeOf = (id: string) => one(register.scopes, id, 'scopes');
export const fitLevelOf = (id: string) => one(register.saFitLevels, id, 'saFitLevels');
/* The SAHPRA class vocabulary is the shop's (suppliers.json, deviceClassesFrom), so an offer and the listing
   it could supply are read in the same words. */
export const classOf = (id: string): Labelled => {
 const found = (shop.regulatory.classes as readonly Labelled[]).find(c => c.id === id);
 if (!found) throw new Error(`packages/catalog/shop.json#regulatory.classes has no "${id}".`);
 return found;
};
/* The shop listing an offer could supply, by the id the register maps it to. */
export const shopProductOf = (id: string): { readonly id: string; readonly name: string } => {
 const found = (shop.products as readonly { id: string; name: string }[]).find(p => p.id === id);
 if (!found) throw new Error(`packages/catalog/suppliers.json maps an offer to the shop's "${id}", which packages/catalog/shop.json does not list.`);
 return found;
};
export const outcomeOf = (id: string): Labelled => one(register.verification.outcomes, id, 'verification.outcomes');
export const attemptOf = (id: string) => one(register.verification.attempts, id, 'verification.attempts');
export const refusalOf = (id: string) => one(register.refusals, id, 'refusals');

export type Filters = { readonly category: string; readonly fit: string; readonly scope: string };
export const ANY = 'any';
export const matches = (offer: Offer, f: Filters): boolean =>
 (f.category === ANY || offer.category === f.category)
 && (f.fit === ANY || fitOf(register, offer) === f.fit)
 && (f.scope === ANY || offer.scope.id === f.scope);
