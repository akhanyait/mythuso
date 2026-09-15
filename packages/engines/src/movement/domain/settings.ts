/* Movement's settings, over the shared settings shape: how often a responder's phone sends its position during a
 * trip, how many missed heartbeats make a responder offline, how many responders a trip is offered to at once,
 * how long a trip's position window stays open when nobody hands the patient over, and how long a position is
 * kept after the window closes.
 *
 * All five are proposals in packages/catalog/movement.json, in the shape packages/catalog/settings.json gives
 * every setting, and every rule a change obeys is packages/engines/src/settings/shape.ts's. Movement has no rule
 * between its settings, so it adds none.
 *
 * WHAT A CHANGE REACHES. A trip reads the offers at once, the window and the retention when it is requested and
 * keeps them, with the settings version, so a change never keeps a position longer, or drops it sooner, on a trip
 * already under way. The heartbeat interval and who counts as online are read whenever a heartbeat arrives or an
 * offer is made, because neither is a thing that started: the next answer carries the interval in force.
 */
import movement from '../../../../catalog/movement.json' with { type: 'json' };
import { snapshotOf, type Change, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export const movementBlock = { engine: 'movement', ...movement.settings } as unknown as SettingsBlock;
export const movementSettings: SettingsEngine = Object.freeze({ block: movementBlock });

export type MovementInForce = {
 readonly settingsVersion: number;
 readonly heartbeatIntervalSeconds: number;
 readonly offlineAfterMissedBeats: number;
 readonly offersAtOnce: number;
 readonly tripWindowMinutes: number;
 readonly positionRetentionMinutes: number;
};

export function movementInForceOf(snapshot: Snapshot): MovementInForce {
 return Object.freeze({
  settingsVersion: snapshot.settingsVersion,
  heartbeatIntervalSeconds: snapshot.values['heartbeat-interval-seconds'] as number,
  offlineAfterMissedBeats: snapshot.values['offline-after-missed-beats'] as number,
  offersAtOnce: snapshot.values['offers-at-once'] as number,
  tripWindowMinutes: snapshot.values['trip-window-minutes'] as number,
  positionRetentionMinutes: snapshot.values['position-retention-minutes'] as number
 });
}
export const movementInForce = (history: readonly Change[]): MovementInForce => movementInForceOf(snapshotOf(movementBlock, history));
/** The settings nobody has changed: for a test, or a store with no history yet. */
export const movementByDefault: MovementInForce = movementInForce([]);
