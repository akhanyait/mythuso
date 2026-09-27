/* The assistant engine on the development runtime: its settings, and nothing else.
 *
 * GilbertOne's runtime is apps/assistant-api — its own process on the loopback, bundled by npm run
 * assistant-runtime, live in production since 21 September 2026. Nothing of it is moved here: no turn, no speech,
 * no knowledge search, no founder route, and this module is not a second assistant. What lives here is the
 * settings history for the four presentation voice registers in packages/catalog/voice.json and the two routes
 * that read and change it, bound through packages/engines/src/settings exactly as every other engine binds its
 * own, so an admin changes them on one Configuration screen with every other engine's and the history is in
 * this engine's own store. No review route: none of the four waits on a clinical review, and the settings
 * contract refuses a review route nobody needs.
 *
 * WHAT DOES NOT REACH THE SERVICE. apps/assistant-api has no authenticated way to ask this runtime and reads
 * nothing from it yet: POST /assistant/v1/speak reads with the cloud pair in packages/catalog/assistant.json
 * whatever is in force here. In the web preview the panel reads the same rules from the tab's memory through
 * apps/web/src/lib/settings.ts, so a change reaches the next spoken routine answer there, and the service's own
 * answers only on the day the call between the two exists. That is said here and in ./domain/settings.ts rather
 * than hidden.
 *
 * HEARD: nothing. The assistant subscribes to no event and emits none from here.
 */
import { defineEngine } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsRoutes } from '../settings/routes.ts';
import { assistantSettings } from './domain/settings.ts';

export const engine = defineEngine({
 id: 'assistant',
 store: { schema: SETTINGS_SCHEMA },
 subscriptions: {},
 routes: {
  ...settingsRoutes(assistantSettings, { read: 'GET /v1/assistant/settings@1', change: 'POST /v1/assistant/setting-changes@1' })
 }
});
