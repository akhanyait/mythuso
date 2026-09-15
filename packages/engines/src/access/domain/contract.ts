/* What the Access engine's domain reads, and the shapes every one of its answers takes.

   ── Why this lives under packages/engines and has no dependencies ────────────────────────────────

   The Runtime lead is building packages/engines. Until its interface lands, Access's reasoning is
   written as pure functions over plain data: a ledger in, a new ledger and the events out, and the
   clock passed in rather than read. That is what lets the same arithmetic run in node:test, behind a
   route handler once the runtime exists, and in the browser today — the web's booking screens import
   these files rather than a copy of them. Node's type stripping runs them as written, so there are no
   enums, no namespaces and no constructor parameter properties anywhere in this directory.

   ── Why every refusal is looked up rather than typed ─────────────────────────────────────────────

   A route's refusal sentence is the route's, in packages/catalog/apis/access.json. A refusal typed a
   second time here is the one that stays the same when the contract is reworded, so every refusal
   this domain answers with is found by route and id, and a missing one throws instead of refusing in
   words nobody declared. The few refusals that belong to no route — an acceptance that arrives after
   a cancellation, say — are packages/catalog/booking.json's, found the same way. */
import access from '../../../../catalog/apis/access.json' with { type: 'json' };
import apis from '../../../../catalog/apis.json' with { type: 'json' };
import booking from '../../../../catalog/booking.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };

/* ---- Time, in the one timezone the product names ------------------------------------------------
   Here rather than in booking.ts so that the thread and the handover can stamp a time without pulling
   the roster and the booking contract into whatever imports them — Gilbert's panel, on a phone on
   metered data, among others. */

/** The ISO date of a moment in Johannesburg, not in whatever zone the device is set to. */
export const isoIn = (at: Date) =>
 new Intl.DateTimeFormat('en-CA', { timeZone: scheduling.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
/* The offset asked of the timezone rather than typed. South Africa does not move its clocks, which is
   exactly the circumstance in which a hard-coded +02:00 is never noticed until a device elsewhere
   shifts a nurse's arrival by two hours. */
export const offsetIn = (at: Date) => {
 const named = new Intl.DateTimeFormat('en-GB', { timeZone: scheduling.timezone, timeZoneName: 'longOffset' })
  .formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
 return named.replace('GMT', '') || '+00:00';
};
export const instantOf = (iso: string, hhmm: string, at: Date) => `${iso}T${hhmm}:00${offsetIn(at)}`;
export const nowInstant = (at: Date) => `${isoIn(at)}T${new Intl.DateTimeFormat('en-GB', { timeZone: scheduling.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(at)}${offsetIn(at)}`;

export type Refusal = {
 readonly refused: true;
 /** `METHOD /path@version`, or null for a refusal that answers no route. */
 readonly route: string | null;
 readonly id: string;
 /** The route's HTTP status, or null when no route is being answered. */
 readonly status: number | null;
 readonly statement: string;
};

/* The envelope fields a publisher knows. The runtime adds the event id, the owner and the time it was
   put on the bus; these are the facts only the act itself can supply. No name, no address, no words. */
export type AccessEvent =
 | { readonly type: 'booking.requested'; readonly version: 1; readonly actorRole: string; readonly subjectRef: string; readonly occurredAt: string;
     readonly payload: { readonly bookingRef: string; readonly serviceId: string; readonly mode: string; readonly requestedFor: string } }
 | { readonly type: 'booking.confirmed'; readonly version: 1; readonly actorRole: string; readonly subjectRef: string; readonly occurredAt: string;
     readonly payload: { readonly bookingRef: string; readonly scheduledFor: string } }
 | { readonly type: 'booking.cancelled'; readonly version: 1; readonly actorRole: string; readonly subjectRef: string; readonly occurredAt: string;
     readonly payload: { readonly bookingRef: string; readonly cancelledByRole: string; readonly reasonCode: string } }
 | { readonly type: 'conversation.handover'; readonly version: 1; readonly actorRole: string; readonly subjectRef: string; readonly occurredAt: string;
     readonly payload: { readonly conversationRef: string; readonly summaryEntryRef: string; readonly urgencyCode: string } };

export type Accepted<T> = { readonly refused: false; readonly value: T; readonly events: readonly AccessEvent[] };
export type Outcome<T> = Refusal | Accepted<T>;

export const accept = <T>(value: T, events: readonly AccessEvent[] = []): Accepted<T> => ({ refused: false, value, events });

type DeclaredRefusal = { id: string; status: number; statement: string };
type DeclaredRoute = { method: string; path: string; version: number; refusals: DeclaredRefusal[] };
const routes = access.routes as DeclaredRoute[];
export const routeKeyOf = (route: DeclaredRoute) => `${route.method} ${route.path}@${route.version}`;

/** A route's own refusal, in the route's words. Throws when the contract does not declare it. */
export function routeRefusal(route: string, id: string): Refusal {
 const declared = routes.find(r => routeKeyOf(r) === route);
 if (!declared) throw new Error(`packages/catalog/apis/access.json declares no route ${route}.`);
 const found = declared.refusals.find(r => r.id === id) ?? (apis.sharedRefusals as DeclaredRefusal[]).find(r => r.id === id);
 if (!found) throw new Error(`${route} declares no refusal "${id}", and no route inherits one by that name.`);
 return { refused: true, route, id, status: found.status, statement: found.statement };
}

/** A refusal that answers no route: booking.json's own. */
export function bookingRefusal(id: string): Refusal {
 const found = booking.refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/booking.json declares no refusal "${id}".`);
 return { refused: true, route: null, id, status: null, statement: found.sentence };
}

export const ROUTES = {
 book: 'POST /v1/access/bookings@1',
 read: 'GET /v1/access/bookings/{bookingRef}@1',
 cancel: 'POST /v1/access/bookings/{bookingRef}/cancel@1',
 readThread: 'GET /v1/access/visit-threads/{bookingRef}@1',
 write: 'POST /v1/access/visit-threads/{bookingRef}/messages@1',
 handover: 'POST /v1/access/conversations/{conversationRef}/handover@1'
} as const;

/* A reference that says it is simulated. The same rule the payment simulator follows for a receipt: a
   reference is read away from the screen that explains it — in a screenshot, over the phone — and one
   that looks real is the one somebody acts on. FNV-1a, because it is the same on every machine, needs
   nothing from node:crypto and runs unchanged in a browser. It identifies; it protects nothing. */
export function simulatedRef(prefix: string, seed: string): string {
 let hash = 0x811c9dc5;
 for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
 let second = hash ^ 0x5bd1e995;
 for (let i = seed.length - 1; i >= 0; i--) { second ^= seed.charCodeAt(i); second = Math.imul(second, 0x01000193) >>> 0; }
 return `SIM-${prefix}-${hash.toString(16).padStart(8, '0').slice(0, 6).toUpperCase()}${second.toString(16).padStart(8, '0').slice(0, 2).toUpperCase()}`;
}
