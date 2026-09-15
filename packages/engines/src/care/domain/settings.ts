/* Care's settings, over the shared settings shape: how long an offer lasts, who may be offered the three
 * visits no named scope covers, and whether an Encounter entry counts as signed.
 *
 * The founder decided ten minutes on 15 September 2026, and on the same day instructed that open
 * questions become admin settings. So the expiry is the setting offer-expiry in packages/catalog/care.json,
 * in the shape packages/catalog/settings.json gives every setting, and an admin changes it within bounds
 * that are themselves proposals. The scope role lists and the encounter rule joined it the same day as the
 * integrator's proposals, each waiting on a clinical review. Every rule a change obeys is
 * packages/engines/src/settings/shape.ts's; Care has no rule between settings of its own, so it adds none.
 *
 * WHAT STARTS KEEPS WHAT IT STARTED WITH. The offer desk reads the settings in force once, as it makes an
 * offer, matches with the role lists they give, and writes the instant the offer lapses, the roles it was
 * made under and the settings version onto the offer; it never asks again for that offer. The visit desk
 * reads them once, as a visit starts, and keeps whether an Encounter entry counts as signed on the visit.
 * So a change reaches the next offer and the next visit and nothing already made: a nurse told she has
 * until 16:10 has until 16:10, and a locum offered an injection keeps the offer she is reading, whatever an
 * admin does at 16:05. There is no default exported for either desk to fall back on; each is handed the
 * settings by whoever holds the history — the engine's store or the preview's memory.
 *
 * A SETTING NOT CLINICALLY REVIEWED IS STILL IN FORCE. Nothing here asks whether a value was reviewed. The
 * value in force is what Care matches and completes by, reviewed or not, because every default is what Care
 * did before the settings existed and a change is an admin's accountable act; refusing visits until a
 * reviewer has read the setting would stop care for patients over a review nobody has been asked for yet.
 * Whether it was reviewed is said wherever it matters — the Configuration tab, a nurse's offer card for
 * those services, the doctor's review queue — and never decides whether a patient is seen. */
import care from '../../../../catalog/care.json' with { type: 'json' };
import { snapshotOf, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export const careBlock = { engine: 'care', ...care.settings } as unknown as SettingsBlock;
export const careSettings: SettingsEngine = Object.freeze({ block: careBlock });

/** The setting keys that hold a service's roles, read from the services that name one. */
export const scopeSettingKeys: readonly string[] = [...new Set(care.services.flatMap(s => ('rolesFromSetting' in s && typeof s.rolesFromSetting === 'string') ? [s.rolesFromSetting] : []))];
const ENCOUNTER_RULE = 'encounter-entry-counts-as-signed';

/** What Care reads from the settings in force when it starts something, and the version that says so. */
export type CareInForce = {
 readonly settingsVersion: number;
 readonly offerExpiryMinutes: number;
 /** Each scope setting's roles, by the setting's key. */
 readonly roles: Readonly<Record<string, readonly string[]>>;
 readonly encounterEntryCountsAsSigned: boolean;
};
export function careInForceOf(snapshot: Snapshot): CareInForce {
 const roles = Object.fromEntries(scopeSettingKeys.map(key => {
  const value = snapshot.values[key];
  /* A service that names a setting Care does not hold would be matched against nobody without saying why. */
  if (!Array.isArray(value)) throw new Error(`packages/catalog/care.json names the setting "${key}" for a service's roles, and Care's settings hold no role list by that name.`);
  return [key, value as readonly string[]];
 }));
 return Object.freeze({
  settingsVersion: snapshot.settingsVersion,
  offerExpiryMinutes: snapshot.values['offer-expiry'] as number,
  roles: Object.freeze(roles),
  encounterEntryCountsAsSigned: snapshot.values[ENCOUNTER_RULE] === true
 });
}
/** The settings nobody has changed: for a test, or a desk with no history yet. */
export const careByDefault: CareInForce = careInForceOf(snapshotOf(careBlock, []));
