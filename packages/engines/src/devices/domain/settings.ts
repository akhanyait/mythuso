/* Devices' settings, over the shared settings shape: how long a device may be silent before it is stale,
 * how early a calibration shows as due, and the deposit recorded against a kit.
 *
 * All three are proposals in packages/catalog/devices.json, in the shape packages/catalog/settings.json
 * gives every setting, and every rule a change obeys is packages/engines/src/settings/shape.ts's. Devices
 * has no rule between its settings, so it adds none.
 *
 * WHAT A CHANGE REACHES. Staleness and a calibration's state are worked out when a device's health is read,
 * with the settings in force at that moment, and stored on nothing. A reading's marks are decided when it is
 * asked for and never by a setting: calibration-overdue is the instrument's cadence against the day it was
 * taken, not the due window. So a change moves what the kit screen shows next and never marks, unmarks or
 * moves a reading. A kit keeps the deposit and the settings version it was issued under. A stale device that
 * was announced keeps the announcement, and the engine announces again only for a later silence.
 */
import devices from '../../../../catalog/devices.json' with { type: 'json' };
import { snapshotOf, type Change, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export const devicesBlock = { engine: 'devices', ...devices.settings } as unknown as SettingsBlock;
export const devicesSettings: SettingsEngine = Object.freeze({ block: devicesBlock });

export type DevicesInForce = {
 readonly settingsVersion: number;
 readonly staleAfterMinutes: number;
 readonly calibrationDueDays: number;
 readonly kitDepositCents: number;
};

export function devicesInForceOf(snapshot: Snapshot): DevicesInForce {
 return Object.freeze({
  settingsVersion: snapshot.settingsVersion,
  staleAfterMinutes: snapshot.values['stale-after-minutes'] as number,
  calibrationDueDays: snapshot.values['calibration-due-days'] as number,
  kitDepositCents: snapshot.values['kit-deposit'] as number
 });
}
export const devicesInForce = (history: readonly Change[]): DevicesInForce => devicesInForceOf(snapshotOf(devicesBlock, history));
/** The settings nobody has changed: for a test, or a registry with no history yet. */
export const devicesByDefault: DevicesInForce = devicesInForce([]);
