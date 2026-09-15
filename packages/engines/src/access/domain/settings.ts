/* Access's settings, over the shared settings shape: six questions that became admin settings.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings. Access had six,
 * and they are the settings block of packages/catalog/booking.json, in the shape
 * packages/catalog/settings.json gives every setting: what happens when a nurse asked for by name cannot
 * take the visit, the longest thread message, whether a photo may one day travel in a thread, how long a
 * thread stays open after its visit, who answers a Gilbert handover, and when. Every rule a change obeys
 * is packages/engines/src/settings/shape.ts's. This file adds what only Access knows: which setting is
 * which field of what a booking, a thread and a handover are handed, and one rule of its own.
 *
 * WHY THE SETTINGS LIVE HERE. apps/api is the identity service and holds identity only; these are policy
 * about bookings, threads and handovers, which the Access engine on the runtime answers. So they live
 * with the engine that owns the booking and thread routes, in its own store.
 *
 * THE ONE RULE OF ITS OWN. A handover rota with no window at all is refused. settings.json's mustCover is
 * deliberately not used — out of hours has its own answer, the emergency numbers and a call back when the
 * desk opens, so an admin may shorten the hours — but a desk that never opens offers a call back that
 * never comes, and the shared rules cannot refuse an empty rota without mustCover.
 *
 * WHAT KEEPS WHAT IT STARTED WITH. A booking keeps the fallback in the slot it was booked against. A
 * message is measured against the length in force when it is written. A thread keeps the hours that were
 * in force when its visit was completed — accessInForceAt() replays the history up to that instant — so a
 * change afterwards neither reopens a closed thread nor cuts an open one short.
 */
import contract from '../../../../catalog/booking.json' with { type: 'json' };
import api from '../../../../catalog/apis/access.json' with { type: 'json' };
import ussd from '../../../../catalog/ussd.json' with { type: 'json' };
import { snapshotOf, type Change, type Check, type Refusal, type SettingsBlock, type SettingsEngine, type Snapshot, type Window } from '../../settings/shape.ts';

export type NamedNurseFallback = 'patient-chooses' | 'wait-for-named' | 'soonest-automatically';

export const accessBlock = { engine: 'access', ...contract.settings } as unknown as SettingsBlock;

const check: Check = next => (next['handover-hours'] as readonly Window[]).length === 0 ? 'handover-hours-never-open' : null;
const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/access/setting-changes' && route.version === 1);
if (!changeRoute) throw new Error('packages/catalog/apis/access.json has lost POST /v1/access/setting-changes@1, whose refusals Access\'s own settings rule answers with.');

export const accessSettings: SettingsEngine = Object.freeze({ block: accessBlock, refusals: changeRoute.refusals as readonly Refusal[], check });

/** The values in force, named as the booking, the thread and the handover read them, and the version that holds them. */
export type AccessSettingsInForce = {
 readonly settingsVersion: number;
 readonly namedNurseFallback: NamedNurseFallback;
 readonly threadMaxCharacters: number;
 readonly threadPhotos: boolean;
 readonly threadOpenHoursAfterVisit: number;
 readonly handoverAnsweredBy: readonly string[];
 readonly handoverHours: readonly Window[];
 /** How long a USSD session waits for a reply, from packages/catalog/ussd.json's timeout setting. A session keeps what it was dialled with. */
 readonly ussdSessionSeconds: number;
};

export const accessSettingsOf = (snapshot: Snapshot): AccessSettingsInForce => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 namedNurseFallback: snapshot.values['named-nurse-fallback'] as NamedNurseFallback,
 threadMaxCharacters: snapshot.values['visit-thread-max-characters'] as number,
 threadPhotos: snapshot.values['visit-thread-photos'] as boolean,
 threadOpenHoursAfterVisit: snapshot.values['visit-thread-open-hours-after-visit'] as number,
 handoverAnsweredBy: snapshot.values['handover-answered-by'] as readonly string[],
 handoverHours: snapshot.values['handover-hours'] as readonly Window[],
 ussdSessionSeconds: snapshot.values[ussd.session.timeoutSetting] as number
});

/** The settings in force after a history of accepted changes. */
export const accessInForce = (history: readonly Change[]): AccessSettingsInForce => accessSettingsOf(snapshotOf(accessBlock, history));

/* What was in force at an instant. A history is appended in time order, so the changes made by then are a
   prefix of it and replay without a gap. A thread completed at nine keeps what nine held. */
export const accessInForceAt = (history: readonly Change[], at: number): AccessSettingsInForce => accessInForce(history.filter(change => change.at <= at));
