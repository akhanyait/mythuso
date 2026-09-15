/* Care's settings, over the shared settings shape: today, how long an offer lasts.
 *
 * The founder decided ten minutes on 15 September 2026, and on the same day instructed that open
 * questions become admin settings. So the expiry is the setting offer-expiry in packages/catalog/care.json,
 * in the shape packages/catalog/settings.json gives every setting, and an admin changes it within bounds
 * that are themselves proposals. Every rule a change obeys is packages/engines/src/settings/shape.ts's;
 * Care has no rule between settings of its own, so it adds none.
 *
 * AN OFFER KEEPS THE EXPIRY IT WAS MADE WITH. The offer desk asks for the expiry in force when it makes
 * an offer, writes the instant it lapses and the settings version onto the offer, and never asks again
 * for that offer. So a change reaches the next offer and nothing already made: a nurse told she has until
 * 16:10 has until 16:10 whatever an admin does at 16:05. There is no default exported for the desk to
 * fall back on; it is handed the expiry by whoever holds the history — the engine's store or the preview's memory. */
import care from '../../../../catalog/care.json' with { type: 'json' };
import { snapshotOf, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export const careBlock = { engine: 'care', ...care.settings } as unknown as SettingsBlock;
export const careSettings: SettingsEngine = Object.freeze({ block: careBlock });

/** How long an offer made now lasts, and the settings version that says so. */
export type OfferExpiry = { readonly minutes: number; readonly settingsVersion: number };
export const offerExpiryOf = (snapshot: Snapshot): OfferExpiry => ({ minutes: snapshot.values['offer-expiry'] as number, settingsVersion: snapshot.settingsVersion });
/** The expiry nobody has changed: for a test, or a desk with no history yet. */
export const offerExpiryByDefault: OfferExpiry = offerExpiryOf(snapshotOf(careBlock, []));
