/* The Record engine on the development runtime: its settings, and nothing else.

   The Record engine's other routes are the Health Passport's, and the Passport is its own service — its own
   store, its own keys, a consent gateway in front of every read — in apps/passport, which answers them in
   development on loopback. It is not moved onto this runtime, because a store that holds health information
   does not share a process, a file or a key with engines that hold none. What lives here is policy about links
   rather than anything in a record: how long a share link or an emergency card lasts and how often it opens,
   and what a link opens by default. They live on the runtime with every other engine's settings so an admin
   changes them on one Configuration screen, through packages/engines/src/settings, with the history in this
   engine's own store.

   ── What is bound ────────────────────────────────────────────────────────────────────────────────

   GET /v1/record/settings@1 and POST /v1/record/setting-changes@1. No review route: none of the five waits on a
   clinical review, and the settings contract refuses a review route nobody needs. Every other record route is
   answered by apps/passport or, where it is proposed, by the contract mock.

   ── What does not reach the Passport ─────────────────────────────────────────────────────────────

   A change recorded here is not read by the Passport P0, which has no authenticated way to ask this runtime and
   reads the contract's defaults. That is written down in packages/engines/src/record/domain/settings.ts and in
   docs/FEATURE-MAP.md rather than hidden: in the web preview a change reaches the next link at once, and in the
   Passport P0 it reaches nothing until the call between the two services exists. */
import { defineEngine } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsRoutes } from '../settings/routes.ts';
import { recordSettings } from './domain/settings.ts';

export const engine = defineEngine({
 id: 'record',
 store: { schema: SETTINGS_SCHEMA },
 subscriptions: {},
 routes: {
  ...settingsRoutes(recordSettings, { read: 'GET /v1/record/settings@1', change: 'POST /v1/record/setting-changes@1' })
 }
});
