/**
 * The ingestion boundary: one locked door per feed in packages/catalog/feeds.json, and each one
 * says which lock. How many of them there are is written down nowhere, and that is deliberate. It
 * used to be written down — the first line of this file carried a number — and the number stayed
 * the same across every feed added after it, until the count was wrong in eight files and in two
 * error messages a developer would have read at the moment they were debugging something else. A
 * number that lives in prose drifts without failing anything, so
 * scripts/check-boundaries.mjs fails the build when one comes back: see the check
 * `a-door-count-lives-in-the-contract`.
 *
 * ── What this is ─────────────────────────────────────────────────────────────────────────────
 *
 * Every capability is declared and none is connected. Most of them are blocked on something no
 * engineer can produce — an SMS provider, a payment provider, a nurse roster, live device positions,
 * agreements with thirteen credentialing authorities, a pharmacy network, an interpreter service, an
 * ambulance partner, a media stack, an AI licence. Nobody can sign a contract from inside a
 * repository. What can be built before the contracts exist is the seam itself: the shape of what
 * would arrive, and — the half that is actually worth something — the shape of what must not.
 *
 * So there is a route per feed, and every one of them **accepts nothing**. It reads the payload, it
 * refuses it, it records that it refused, and it answers with the capability's own not-connected
 * sentence out of packages/catalog/capabilities.json. That is a real seam with real tests, and it
 * means the first vendor integration starts from a refusal that already works rather than from a
 * blank file.
 *
 * ── Why `decide` cannot return an acceptance ─────────────────────────────────────────────────
 *
 * It returns `FeedRefusal` and there is no second variant of the type. Not a discriminated union
 * with an `ok` case nobody reaches, not an optional — there is no acceptance to construct. A route
 * that could accept under some condition is a route somebody eventually finds the condition for,
 * usually late at night with a vendor on the phone. When an adapter is finally written it will be a
 * new function with a new signature, reviewed as the change it is.
 *
 * ── The order of the three refusals, which is not arbitrary ──────────────────────────────────
 *
 *  1. **Forbidden field.** Checked first, before the shape, and at every depth. A payload carrying a
 *     patient id in a position feed is a more interesting fact than a payload with a missing
 *     timestamp, and if the shape were checked first the interesting one would be lost behind it.
 *  2. **Wrong shape.** The schema is closed: an undeclared field is refused rather than ignored. An
 *     ignored field is a field a vendor believes is being used.
 *  3. **Not connected.** A well-formed payload, refused anyway. This is the answer this service will
 *     give for as long as it is honest, and it is the one a vendor writes their first test against.
 *
 * ── The rule that keeps this from becoming the thing it guards ───────────────────────────────
 *
 * **Nothing a stranger typed is written down.** A key in a JSON object is a string somebody else
 * chose, and `{"bp 180 over 110 mmHg": 1}` is a valid key. A refusal that copied it into a log would
 * be an audit trail holding whatever a vendor typed — which is exactly how a protection module
 * becomes the breach it was built to prevent, and it is the failure the audit chain's own field
 * allowlist exists to stop one level up. So: a forbidden field is reported by **the name the
 * contract gives it**, never by the name that arrived; a field that is simply not in the schema is
 * reported as **a count**, never as a name; and no value from the payload is read, kept, echoed or
 * hashed. `decide` never looks at a value except to ask what type it is.
 *
 * Pure of HTTP and of storage: server.ts decides who is asking and writes the refusal into the
 * chain; this decides what is refused and why.
 */
import {
 canonical, capabilityFor, forbiddenIndex, refusalSentence, refusalStatus,
 type Feed, type ForbiddenField, type RefusalKind
} from './contract.ts';

export {
 FEEDS, FEED_RULES, NO_SEAM, REFUSAL_KINDS, REFUSAL_SENTENCES, canonical, capabilityFor, feedById,
 type Feed, type RefusalKind
} from './contract.ts';

/**
 * How deep a payload may nest before it is refused for its shape alone.
 *
 * The body is already capped at 8 KiB, so this is not about size — it is about the forbidden scan
 * having a bottom. A structure that recurses further than this is not a delivery receipt that has
 * been arranged unusually; it is something else, and refusing it is cheaper than walking it.
 */
export const MAX_DEPTH = 12;

/**
 * Why the payload was turned away, in terms that are safe to write into a log.
 *
 * Every string in here originates in packages/catalog/feeds.json or packages/catalog/capabilities.json.
 * `unknownFields` is a count for the reason in the header. `missing` and `wrongType` hold field
 * names, and they are safe because they are *our* declared names — a field can only appear there by
 * being in the contract already.
 */
export type FeedRefusal = {
 feed: string;
 capability: string;
 kind: RefusalKind;
 status: number;
 /** The refusal kind's own sentence. */
 sentence: string;
 /** The capability's not-connected sentence, on every refusal including a malformed one. */
 notice: string;
 /** The contract's name for the forbidden field, and the contract's sentence about it. Never the sender's spelling. */
 forbidden: { field: string; refusal: string } | null;
 /** How many fields arrived that the schema does not declare. A count, never a name. */
 unknownFields: number;
 /** Declared fields that are required and did not arrive. Our names. */
 missing: string[];
 /** Declared fields whose value was not the declared type. Our names, never the value. */
 wrongType: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
 typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The first forbidden field anywhere in the payload, at any depth.
 *
 * Depth-first and it stops at the first one, because the answer is a refusal either way and walking
 * the rest of a payload that has already been refused is work done on behalf of a sender who has
 * already been told no. Arrays are walked as well as objects: a vendor who wraps the record in a
 * list has still sent what they sent.
 */
function firstForbidden(value: unknown, index: Map<string, ForbiddenField>, depth = 0): ForbiddenField | null {
 if (depth > MAX_DEPTH) return null;
 if (Array.isArray(value)) {
  for (const item of value) {
   const found = firstForbidden(item, index, depth + 1);
   if (found) return found;
  }
  return null;
 }
 if (!isObject(value)) return null;
 for (const key of Object.keys(value)) {
  const found = index.get(canonical(key));
  if (found) return found;
 }
 for (const key of Object.keys(value)) {
  const found = firstForbidden(value[key], index, depth + 1);
  if (found) return found;
 }
 return null;
}

function tooDeep(value: unknown, depth = 0): boolean {
 if (depth > MAX_DEPTH) return true;
 if (Array.isArray(value)) return value.some(item => tooDeep(item, depth + 1));
 if (!isObject(value)) return false;
 return Object.keys(value).some(key => tooDeep(value[key], depth + 1));
}

/* An ISO 8601 instant that states its offset, and a calendar date that states nothing else. The
   offset is required rather than defaulted: this product runs in one country with one offset, which
   is precisely the circumstance in which a missing one is never noticed until a supplier runs on
   UTC and every shift ends two hours early. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Is this value the declared type? Asked of the type only — the value itself is never kept. */
function isType(type: string, value: unknown): boolean {
 switch (type) {
  case 'string': return typeof value === 'string' && value.length > 0;
  case 'integer': return typeof value === 'number' && Number.isInteger(value);
  case 'number': case 'coordinate': return typeof value === 'number' && Number.isFinite(value);
  case 'boolean': return typeof value === 'boolean';
  case 'instant': return typeof value === 'string' && INSTANT.test(value);
  case 'iso-date': return typeof value === 'string' && ISO_DATE.test(value);
  case 'list': return Array.isArray(value) && value.every(item => typeof item === 'string');
  default: return false;
 }
}

/**
 * What happens to a payload arriving at one of these doors. Always a refusal.
 *
 * The `connected` guard is the one thing here that throws rather than refuses, and it is deliberate.
 * If somebody marks a capability connected in the contract while these routes are still the whole of
 * the integration, the honest failure is a service that will not answer at all — not one that starts
 * quietly accepting vendor payloads into a product with no adapter behind them. It is the same shape
 * as config.ts refusing to start in production without an SMS provider: a loud absence rather than a
 * silent fallback.
 */
export function decide(feed: Feed, body: unknown): FeedRefusal {
 const capability = capabilityFor(feed);
 if (capability.connected) {
  throw new Error(
   `Capability "${capability.id}" is marked connected in packages/catalog/capabilities.json and the only thing behind ` +
   `POST /feeds/${feed.id} is this refusal. Connecting a capability means writing the adapter, not flipping the flag: ` +
   `until one exists this service must refuse to answer rather than start accepting a supplier's payloads into nothing.`
  );
 }
 const refusal = (kind: RefusalKind, extra: Partial<FeedRefusal> = {}): FeedRefusal => ({
  feed: feed.id,
  capability: capability.id,
  kind,
  status: refusalStatus(kind),
  sentence: refusalSentence(kind),
  notice: capability.notice,
  forbidden: null,
  unknownFields: 0,
  missing: [],
  wrongType: [],
  ...extra
 });

 if (!isObject(body)) return refusal('wrong-shape');
 if (tooDeep(body)) return refusal('wrong-shape');

 const forbidden = firstForbidden(body, forbiddenIndex(feed));
 if (forbidden) return refusal('forbidden-field', { forbidden: { field: forbidden.field, refusal: forbidden.refusal } });

 const declared = new Set(feed.accepts.map(accepted => accepted.field));
 const unknownFields = Object.keys(body).filter(key => !declared.has(key)).length;
 const missing = feed.accepts.filter(accepted => accepted.required && body[accepted.field] === undefined).map(accepted => accepted.field);
 const wrongType = feed.accepts
  .filter(accepted => body[accepted.field] !== undefined && !isType(accepted.type, body[accepted.field]))
  .map(accepted => accepted.field);
 if (unknownFields || missing.length || wrongType.length) return refusal('wrong-shape', { unknownFields, missing, wrongType });

 return refusal('not-connected');
}

/**
 * What a feed looks like to somebody who has to write against it.
 *
 * Answered in full and to anybody, because it is the document a vendor would otherwise be sent as a
 * PDF that goes out of date the week after. It discloses nothing: every word of it is in a file in
 * this repository, and none of it is about a person.
 */
export function describe(feed: Feed) {
 const capability = capabilityFor(feed);
 return {
  id: feed.id,
  name: feed.name,
  route: feed.route,
  arrives: feed.arrives,
  supplier: feed.supplier,
  capabilities: feed.capabilities,
  connected: capability.connected,
  notice: capability.notice,
  whileAbsent: feed.whileAbsent,
  accepts: feed.accepts,
  beforeSwitchOn: feed.beforeSwitchOn,
  neverAccepts: feed.neverAccepts.map(never => ({ field: never.field, refusal: never.refusal, why: never.why })),
  operator: feed.operator
 };
}
