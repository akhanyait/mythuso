/* Medicines' settings, over the shared settings shape: how long a hand-over PIN works, how many wrong PINs a
 * collector may enter, how long a collection may take, and the rung an unacknowledged result is raised on.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings. Every rule a change obeys
 * is packages/engines/src/settings/shape.ts's; this file adds what only Medicines knows: which setting is which part
 * of a collection's terms, and the one rule between two of them, that a PIN never works for longer than the
 * collection it opens, refused in the sentence POST /v1/medicines/setting-changes@1 declares.
 *
 * WHATEVER STARTS KEEPS WHAT IT READ. A collection's terms are read when the patient authorises it and kept on the
 * authorisation; a result's rung is read when the result arrives and kept on the order. No screen and no handler
 * types a minute or a count: they are read from here, which reads the contract and the history.
 */
import contract from '../../../../catalog/medicines.json' with { type: 'json' };
import api from '../../../../catalog/apis/medicines.json' with { type: 'json' };
import { snapshotOf, type Check, type Refusal, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';
import { MINUTE } from './contract.ts';
import type { Terms } from './collections.ts';

export const medicinesBlock = { engine: 'medicines', ...contract.settings } as unknown as SettingsBlock;

const KEY = { pinLifetime: 'pin-lifetime', pinAttempts: 'pin-attempts', window: 'collection-window', rung: 'result-alert-rung' } as const;
for (const key of Object.values(KEY)) if (!medicinesBlock.items.some(s => s.key === key)) throw new Error(`packages/catalog/medicines.json has no setting "${key}", which a collection or a result reads.`);

const check: Check = next => (next[KEY.pinLifetime] as number) > (next[KEY.window] as number) ? 'pin-outlives-the-window' : null;
const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/medicines/setting-changes' && route.version === 1);
if (!changeRoute) throw new Error("packages/catalog/apis/medicines.json has lost POST /v1/medicines/setting-changes@1, whose refusals Medicines' own settings rule answers with.");

export const medicinesSettings: SettingsEngine = Object.freeze({ block: medicinesBlock, refusals: changeRoute.refusals as readonly Refusal[], check });

/** The settings nobody has changed. */
export const medicinesDefaults: Snapshot = snapshotOf(medicinesBlock, []);

/** A collection's terms, read once when a patient authorises it. */
export const termsOf = (snapshot: Snapshot): Terms => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 pinLifetimeMs: (snapshot.values[KEY.pinLifetime] as number) * MINUTE,
 windowMs: (snapshot.values[KEY.window] as number) * MINUTE,
 pinAttempts: snapshot.values[KEY.pinAttempts] as number
});

/** The rung a result arriving now is raised on, and the version that set it. */
export const resultRungOf = (snapshot: Snapshot): { readonly rung: number; readonly settingsVersion: number } =>
 Object.freeze({ rung: snapshot.values[KEY.rung] as number, settingsVersion: snapshot.settingsVersion });
