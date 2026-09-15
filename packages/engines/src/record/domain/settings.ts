/* The Record engine's settings, over the shared settings shape: five questions about links that became admin
 * settings.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings. How long a share link
 * lasts, how often it opens, what it opens when the patient does not choose, and how long an emergency card lasts
 * and how often it opens are the settings block of packages/catalog/passport-sharing.json, in the shape
 * packages/catalog/settings.json gives every setting. Every rule a change obeys is ../../settings/shape.ts's;
 * this file only names which setting is which term a link is made with.
 *
 * WHO READS THEM. The engine runtime answers GET /v1/record/settings@1 and POST /v1/record/setting-changes@1
 * from its own store. The Health Passport P0 (apps/passport) reads the values in force through sharingInForce()
 * when a link is made, and the web preview through apps/web/src/lib/settings.ts. The Passport P0 is handed a
 * history rather than reaching the runtime's store: the two are separate services, and the authenticated call
 * between them does not exist, so in development it reads the contract's defaults unless a test hands it more.
 *
 * WHAT KEEPS WHAT IT STARTED WITH. A link reads these once, when it is made, and keeps the end, the uses and the
 * settings version it read. A change afterwards reaches the next link and never one already made.
 */
import contract from '../../../../catalog/passport-sharing.json' with { type: 'json' };
import api from '../../../../catalog/apis/record.json' with { type: 'json' };
import { snapshotOf, type Change, type Refusal, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export type DefaultScope = 'emergency-summary' | 'whole-grant';

export const recordBlock = { engine: 'record', ...contract.settings } as unknown as SettingsBlock;

const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/record/setting-changes' && route.version === 1);
if (!changeRoute) throw new Error('packages/catalog/apis/record.json has lost POST /v1/record/setting-changes@1, whose refusals the Record engine\'s settings answer with.');

export const recordSettings: SettingsEngine = Object.freeze({ block: recordBlock, refusals: changeRoute.refusals as readonly Refusal[] });

/** The values in force, named as a link is made with them, and the version that holds them. */
export type SharingInForce = {
 readonly settingsVersion: number;
 readonly linkLifetimeDays: number;
 readonly linkMaxUses: number;
 readonly linkDefaultScope: DefaultScope;
 readonly cardLifetimeDays: number;
 readonly cardMaxUses: number;
};

export const sharingSettingsOf = (snapshot: Snapshot): SharingInForce => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 linkLifetimeDays: snapshot.values['share-link-lifetime-days'] as number,
 linkMaxUses: snapshot.values['share-link-max-uses'] as number,
 linkDefaultScope: snapshot.values['share-link-default-scope'] as DefaultScope,
 cardLifetimeDays: snapshot.values['emergency-card-lifetime-days'] as number,
 cardMaxUses: snapshot.values['emergency-card-max-uses'] as number
});

/** The settings in force after a history of accepted changes. An empty history is the contract's defaults. */
export const sharingInForce = (history: readonly Change[]): SharingInForce => sharingSettingsOf(snapshotOf(recordBlock, history));

/* The HL7 v2 bridge's two, Wave 5. A message reads them once, when it arrives: the skew it is judged against, and
   — if it is quarantined — how long its record is kept, which the quarantine row keeps with the settings version,
   so a change afterwards moves no deletion day already given. */
export type InboundInForce = {
 readonly settingsVersion: number;
 readonly quarantineRetentionDays: number;
 readonly clockSkewMinutes: number;
};

export const inboundSettingsOf = (snapshot: Snapshot): InboundInForce => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 quarantineRetentionDays: snapshot.values['hl7-quarantine-retention-days'] as number,
 clockSkewMinutes: snapshot.values['hl7-clock-skew-minutes'] as number
});

export const inboundInForce = (history: readonly Change[]): InboundInForce => inboundSettingsOf(snapshotOf(recordBlock, history));
