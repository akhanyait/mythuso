/* What a share link may be, worked out once, for the Health Passport P0 and the web preview alike.
 *
 * A share link is a consent grant made narrower. It is never a grant of its own, and every rule here follows
 * from that: its recipient is the grant's, its purpose is the grant's, its scope sits inside the grant's, it
 * opens a sealed category only where the grant ticked one in and the link ticks it again by name, and it ends
 * when the grant ends, or when the setting in force says, or at the founder's grant ceiling — whichever comes
 * first. apps/passport/src/gateway.ts stores links and opens records; this file only decides, from terms it is
 * handed, so the gateway and the preview cannot disagree about a rule. Every refusal is an id whose sentence is
 * packages/catalog/passport-gateway.json's.
 *
 * THE ORDER A LINK IS ASKED IN. A payer first, before any grant is looked at: a link for a scheme, an insurer or
 * an employer is refused whatever grant is named, so the refusal says nothing about which grants exist. Then the
 * kind, the grant's own standing, whose the link is, and what it opens. The end last, because an end that is
 * too late is only worth saying about a link that would otherwise be made.
 *
 * THE POLICY IS HANDED IN, NOT IMPORTED. The founder's grant ceiling and what each grant role may read are
 * packages/catalog/consent.json's, read out of it by policyOf() below and nowhere else. The Passport P0 and the
 * build hand it their own import of the contract. The web preview reads the contract as text in the lazy chunk
 * these screens load in: the patient's first load already carries consent.json for the consent screen, and an
 * import from here would keep its grant roles in that first-load chunk, which a patient on metered data would pay
 * for without opening a single link.
 *
 * WHAT IS NOT DECIDED HERE. Whether the grant belongs to the person asking — that is the gateway's, against the
 * patient's session, so a probe of somebody else's grant is written into their log. And the grant's own scope,
 * which the gateway already held to its role when the grant was made; a link inside it inherits that.
 *
 * Time is epoch milliseconds handed in by the caller, so a test is a clock. No enums, no namespaces.
 */
import gateway from '../../../../catalog/passport-gateway.json' with { type: 'json' };
import records from '../../../../catalog/records.json' with { type: 'json' };
import sharing from '../../../../catalog/passport-sharing.json' with { type: 'json' };
import type { SharingInForce } from './settings.ts';

const DAY = 86_400_000;

/* The one category an emergency card opens: the one that opens the emergency summary at the gateway. */
export const EMERGENCY_SCOPE: readonly string[] = Object.freeze([gateway.emergencySummary.openedBy]);

export type LinkRole = { readonly id: string; readonly reads: string; readonly identifiable: boolean };
export type LinkPolicy = { readonly ceilingDays: number; readonly roles: readonly LinkRole[] };
type ConsentContract = {
 readonly grants: {
  readonly maximumExpiryDays: number;
  readonly recipientRoles: readonly { readonly id: string; readonly identifiable?: boolean; readonly gateway: { readonly reads: string } }[];
 };
};

/* The founder's ceiling on every grant and what each grant role reads, out of consent.json and never restated. */
export const policyOf = (consent: ConsentContract): LinkPolicy => Object.freeze({
 ceilingDays: consent.grants.maximumExpiryDays,
 roles: Object.freeze(consent.grants.recipientRoles.map(role => Object.freeze({ id: role.id, reads: role.gateway.reads, identifiable: role.identifiable !== false })))
});

export type LinkKindId = 'share-link' | 'emergency-card';
export type LinkRefusalId =
 | 'link-to-a-payer' | 'link-kind-unknown' | 'revoked' | 'expired' | 'link-recipient-not-the-grants' | 'emergency-only'
 | 'unknown-category' | 'emergency-card-beyond-the-summary' | 'link-wider-than-grant' | 'sealed-tick-names-nothing'
 | 'sealed-not-ticked' | 'link-expired' | 'link-beyond-the-ceiling' | 'link-longer-than-allowed' | 'link-outlives-its-grant';
export type UseRefusalId = 'link-revoked' | 'link-expired' | 'revoked' | 'expired' | 'link-used-up';

/* The statuses the routes in packages/catalog/apis/record.json declare for each. */
const STATUS: Readonly<Record<LinkRefusalId | UseRefusalId, number>> = Object.freeze({
 'link-to-a-payer': 403, 'link-kind-unknown': 400, revoked: 403, expired: 403, 'link-recipient-not-the-grants': 403, 'emergency-only': 403,
 'unknown-category': 400, 'emergency-card-beyond-the-summary': 403, 'link-wider-than-grant': 403, 'sealed-tick-names-nothing': 403,
 'sealed-not-ticked': 403, 'link-expired': 403, 'link-beyond-the-ceiling': 403, 'link-longer-than-allowed': 403, 'link-outlives-its-grant': 403,
 'link-revoked': 403, 'link-used-up': 403
});
export const statusOf = (id: LinkRefusalId | UseRefusalId): number => STATUS[id];

/** What the gateway holds about the grant a link rides on. */
export type GrantTerms = {
 readonly recipientRole: string;
 readonly scope: readonly string[];
 readonly purpose: string;
 readonly sealedIncluded: boolean;
 readonly expiresAt: number;
 readonly revokedAt: number | null;
};
/** What the patient asked for, unread. */
export type LinkRequest = {
 readonly recipientRole?: unknown;
 readonly kindCode?: unknown;
 readonly scope?: unknown;
 readonly sealedIncluded?: unknown;
 readonly expiresAt?: unknown;
};
/** What a link is made with, and keeps. */
export type LinkTerms = {
 readonly kindCode: LinkKindId;
 readonly recipientRole: string;
 readonly purpose: string;
 readonly scope: readonly string[];
 readonly sealedIncluded: boolean;
 readonly expiresAt: number;
 readonly usesAllowed: number;
 readonly settingsVersion: number;
};

const SENSITIVITY = new Map(records.records.map(record => [record.id, record.sensitivity] as const));
const knownCategory = (category: unknown): category is string => typeof category === 'string' && SENSITIVITY.has(category);
export const isSealedCategory = (category: string): boolean => SENSITIVITY.get(category) === gateway.sealed.sensitivity;

/* A payer is a party named in passport-sharing.json's neverTo, or a grant role that reads aggregates and names
   nobody. Both, because the grant role list could one day gain an insurer under another name, and the neverTo
   list is where somebody reading the contract looks. */
export function payerRefusal(recipient: unknown, policy: LinkPolicy): 'link-to-a-payer' | null {
 const id = typeof recipient === 'string' ? recipient : '';
 if (sharing.links.neverTo.some(payer => payer.id === id)) return 'link-to-a-payer';
 const role = policy.roles.find(candidate => candidate.id === id);
 return role && (role.reads === 'aggregate' || !role.identifiable) ? 'link-to-a-payer' : null;
}

export const kindOf = (id: unknown) => sharing.links.kinds.find(kind => kind.id === id) ?? null;

/* What a link opens when the patient does not choose. An emergency card always opens the summary; a share link
   opens the default in force — the summary, or the grant's own scope with every sealed category left out, because
   a sealed category is only ever ticked in by name. */
export function defaultScopeFor(kindCode: LinkKindId, grant: GrantTerms, inForce: SharingInForce): string[] {
 if (kindCode === 'emergency-card' || inForce.linkDefaultScope === 'emergency-summary') return [...EMERGENCY_SCOPE];
 return grant.scope.filter(category => !isSealedCategory(category));
}

export type Decided<T, R> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: R };
const no = <R>(refusal: R): { ok: false; refusal: R } => ({ ok: false, refusal });

export function linkTermsFor(request: LinkRequest, grant: GrantTerms, inForce: SharingInForce, now: number, policy: LinkPolicy): Decided<LinkTerms, LinkRefusalId> {
 if (payerRefusal(request.recipientRole, policy)) return no('link-to-a-payer');
 const kind = kindOf(request.kindCode);
 if (!kind) return no('link-kind-unknown');
 if (grant.revokedAt !== null) return no('revoked');
 if (grant.expiresAt <= now) return no('expired');
 if (payerRefusal(grant.recipientRole, policy)) return no('link-to-a-payer');
 if (request.recipientRole !== grant.recipientRole) return no('link-recipient-not-the-grants');
 const kindCode = kind.id as LinkKindId;
 const card = kindCode === 'emergency-card';
 /* A responder's grant reads the emergency summary and nothing else, so the only link it can carry is a card. */
 if (!card && policy.roles.find(role => role.id === grant.recipientRole)?.reads === 'emergency-summary') return no('emergency-only');

 const scope = request.scope === undefined ? defaultScopeFor(kindCode, grant, inForce) : request.scope;
 if (!Array.isArray(scope) || !scope.length || !scope.every(knownCategory) || new Set(scope).size !== scope.length) return no('unknown-category');
 const sealedIncluded = request.sealedIncluded === true;
 if (card && (sealedIncluded || scope.length !== 1 || scope[0] !== EMERGENCY_SCOPE[0])) return no('emergency-card-beyond-the-summary');
 if (!scope.every(category => grant.scope.includes(category)) || (sealedIncluded && !grant.sealedIncluded)) return no('link-wider-than-grant');
 const sealedNamed = scope.some(isSealedCategory);
 if (sealedIncluded && !sealedNamed) return no('sealed-tick-names-nothing');
 if (!sealedIncluded && sealedNamed) return no('sealed-not-ticked');

 /* The end. The setting in force, never past the founder's ceiling, never past the grant. An end the patient asks
    for is refused rather than quietly shortened when it is later than any of the three, so the end they see is
    the end they get, and each refusal says which of the three it ran into. */
 const lifetimeDays = card ? inForce.cardLifetimeDays : inForce.linkLifetimeDays;
 const ceilingAt = now + policy.ceilingDays * DAY;
 const allowedAt = Math.min(now + lifetimeDays * DAY, ceilingAt);
 let expiresAt = Math.min(allowedAt, grant.expiresAt);
 if (request.expiresAt !== undefined) {
  const asked = typeof request.expiresAt === 'string' ? Date.parse(request.expiresAt) : Number.NaN;
  if (!Number.isFinite(asked) || asked <= now) return no('link-expired');
  if (asked > ceilingAt) return no('link-beyond-the-ceiling');
  if (asked > allowedAt) return no('link-longer-than-allowed');
  if (asked > grant.expiresAt) return no('link-outlives-its-grant');
  expiresAt = asked;
 }
 return {
  ok: true,
  value: Object.freeze({
   kindCode, recipientRole: grant.recipientRole, purpose: grant.purpose, scope: Object.freeze([...scope]), sealedIncluded, expiresAt,
   usesAllowed: card ? inForce.cardMaxUses : inForce.linkMaxUses, settingsVersion: inForce.settingsVersion
  })
 };
}

/* Whether a link may be opened now. Its own revocation and end before its grant's, because those are the facts
   about the link the patient decided; the uses last, and not at all for a retry already counted, so a clinic on a
   dropped connection does not use up a link by asking again with the same key. */
export function useRefusal(
 link: { readonly revokedAt: number | null; readonly expiresAt: number; readonly usesAllowed: number },
 usesSoFar: number,
 grant: { readonly revokedAt: number | null; readonly expiresAt: number } | null,
 now: number,
 alreadyCounted = false
): UseRefusalId | null {
 if (link.revokedAt !== null) return 'link-revoked';
 if (link.expiresAt <= now) return 'link-expired';
 if (!grant || grant.revokedAt !== null) return 'revoked';
 if (grant.expiresAt <= now) return 'expired';
 if (!alreadyCounted && usesSoFar >= link.usesAllowed) return 'link-used-up';
 return null;
}
