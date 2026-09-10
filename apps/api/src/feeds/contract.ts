/**
 * packages/catalog/feeds.json, as types.
 *
 * The contract is the authority and this file is a reader of it: nothing here restates a sentence,
 * a field name or a refusal. The one thing it adds is the canonical form used to match a forbidden
 * field, which is computed rather than written down, because a second spelling of a spelling rule
 * is the drift the whole repository is arranged against.
 *
 * Pure: no clock, no database, no HTTP.
 */
import contract from '../../../../packages/catalog/feeds.json' with { type: 'json' };
import capabilities from '../../../../packages/catalog/capabilities.json' with { type: 'json' };

/** The three ways a payload is turned away. There is no fourth and there is no acceptance. */
export const REFUSAL_KINDS = ['forbidden-field', 'wrong-shape', 'not-connected'] as const;
export type RefusalKind = typeof REFUSAL_KINDS[number];

export type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'instant' | 'iso-date' | 'coordinate' | 'list';

export type AcceptedField = { field: string; type: string; required: boolean; why: string };
export type SwitchOnCondition = { id: string; must: string; why: string; met: boolean; evidence: string | null };
export type ForbiddenField = { field: string; refusal: string; why: string; also: string[] };

export type Feed = {
 id: string;
 name: string;
 capabilities: string[];
 supplier: string;
 route: string;
 arrives: string;
 derivedFrom: string[];
 whileAbsent: { noticeFrom: string; sample: string[]; unchanged: string };
 accepts: AcceptedField[];
 beforeSwitchOn: SwitchOnCondition[];
 neverAccepts: ForbiddenField[];
 operator: { becomesAnOperator: boolean; section72: string; determined: boolean };
};

export const FEEDS: Feed[] = contract.feeds as Feed[];
export const FEED_RULES = contract.rules as { id: string; statement: string; why: string }[];
export const NO_SEAM = contract.noSeam as { capability: string; decision: string; why: string }[];
export const REFUSAL_SENTENCES = contract.refusalKinds as { id: string; http: number; sentence: string; why: string }[];

/**
 * The one spelling rule, in one place.
 *
 * Lower-cased, with everything that is not a letter or a digit removed. patientId, patient_id,
 * PATIENT-ID and "Patient Id" are one field, which is the whole point: a tripwire that a vendor's
 * house style walks straight over is not a tripwire. It is deliberately not applied to the accepted
 * fields — see the rule of that name in the contract, which says why the two halves are asymmetric.
 */
export const canonical = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every spelling of a forbidden field, canonicalised, pointing back at the name the contract gave it. */
export function forbiddenIndex(feed: Feed): Map<string, ForbiddenField> {
 const index = new Map<string, ForbiddenField>();
 for (const forbidden of feed.neverAccepts) {
  for (const spelling of [forbidden.field, ...forbidden.also]) index.set(canonical(spelling), forbidden);
 }
 return index;
}

export const feedById = (id: string): Feed | null => FEEDS.find(feed => feed.id === id) ?? null;
export const refusalSentence = (kind: RefusalKind): string => REFUSAL_SENTENCES.find(r => r.id === kind)!.sentence;
export const refusalStatus = (kind: RefusalKind): number => REFUSAL_SENTENCES.find(r => r.id === kind)!.http;

/**
 * The capability's own not-connected sentence, and whether it is connected at all.
 *
 * Read from capabilities.json rather than restated, so that the day a capability is connected the
 * sentence stops being said at this door on the same deployment it stops being said on the screens.
 * `connected` is read too, and it is what the ingestion module refuses on — see index.ts, where a
 * connected capability is a reason to throw rather than a reason to accept, because there is still
 * no adapter behind any of these routes.
 */
export function capabilityFor(feed: Feed): { id: string; notice: string; connected: boolean } {
 const found = capabilities.capabilities.find(c => c.id === feed.whileAbsent.noticeFrom);
 if (!found) throw new Error(`Feed "${feed.id}" names a capability "${feed.whileAbsent.noticeFrom}" that packages/catalog/capabilities.json does not have.`);
 return { id: found.id, notice: found.notice, connected: found.connected };
}
