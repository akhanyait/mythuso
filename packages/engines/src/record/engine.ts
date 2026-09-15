/* The Record engine on the development runtime: its settings, and the lab orders it hears placed.

   The Record engine's other routes are the Health Passport's, and the Passport is its own service — its own
   store, its own keys, a consent gateway in front of every read — in apps/passport, which answers them in
   development on loopback. It is not moved onto this runtime, because a store that holds health information
   does not share a process, a file or a key with engines that hold none. What lives here is policy about links
   rather than anything in a record: how long a share link or an emergency card lasts and how often it opens,
   and what a link opens by default. They live on the runtime with every other engine's settings so an admin
   changes them on one Configuration screen, through packages/engines/src/settings, with the history in this
   engine's own store.

   ── What is bound ────────────────────────────────────────────────────────────────────────────────

   GET /v1/record/settings@1 and POST /v1/record/setting-changes@1. No review route: none of the seven waits on a
   clinical review, and the settings contract refuses a review route nobody needs. Every other record route is
   answered by apps/passport or, where it is proposed, by the contract mock.

   ── What it hears (Wave 5) ───────────────────────────────────────────────────────────────────────

   lab.order.placed@1, and it keeps which order was placed for which patient: a reference and a subject token, and
   never what was ordered. That register is what the HL7 bridge's rule asks — a laboratory's result for an order
   nobody placed, or for somebody else's, is refused — and it is what justifies Record calling
   POST /v1/medicines/lab-results@1 with a result it filed. packages/catalog/hl7v2-inbound.json says why a result
   is handed to Medicines rather than announced by Record.

   ── What does not reach the Passport ─────────────────────────────────────────────────────────────

   A change recorded here is not read by the Passport P0, which has no authenticated way to ask this runtime and
   reads the contract's defaults. Nor is a placed order: the Passport is handed the orders it may match a result
   to rather than reaching this store. That is written down in packages/engines/src/record/domain/settings.ts, in
   packages/catalog/hl7v2-inbound.json and in docs/FEATURE-MAP.md rather than hidden: in the web preview both reach
   the next link and the next result at once, and in the Passport P0 they reach nothing until the call between the
   two services exists. */
import { defineEngine } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsRoutes } from '../settings/routes.ts';
import { recordSettings } from './domain/settings.ts';

const PLACED = 'CREATE TABLE IF NOT EXISTS placed_lab_orders (lab_order_ref TEXT PRIMARY KEY, subject_ref TEXT NOT NULL, heard_at TEXT NOT NULL);';

export const engine = defineEngine({
 id: 'record',
 store: { schema: `${SETTINGS_SCHEMA}\n${PLACED}` },
 subscriptions: {
  'lab.order.placed@1': (event, ctx) => {
   const labOrderRef = typeof event.payload['labOrderRef'] === 'string' ? event.payload['labOrderRef'] : '';
   if (labOrderRef) ctx.store.prepare('INSERT OR IGNORE INTO placed_lab_orders (lab_order_ref, subject_ref, heard_at) VALUES (?, ?, ?)').run(labOrderRef, event.subjectRef, ctx.clock.iso());
  }
 },
 routes: {
  ...settingsRoutes(recordSettings, { read: 'GET /v1/record/settings@1', change: 'POST /v1/record/setting-changes@1' })
 }
});
