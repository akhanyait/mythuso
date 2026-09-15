/* Every engine that has settings, in one place, for the two readers that need all of them: the web
 * preview's Configuration screen and the build. The engine runtime does not read this — each engine binds
 * its own settings in its own engine.ts — so an engine's settings are never answered by another engine.
 *
 * The list is packages/catalog/settings.json's sources, and scripts/check-boundaries.mjs fails when the
 * two disagree or when a contract holds a settings block neither names. Each entry is the engine's own
 * module, which reads its own contract and adds its own rule between settings if it has one. */
import type { SettingsEngine } from './shape.ts';
import { safetySettings } from '../safety/domain/settings.ts';
import { careSettings } from '../care/domain/settings.ts';
import { moneySettings } from '../money/domain/settings.ts';
import { coreSettings } from '../core/domain/settings.ts';
import { accessSettings } from '../access/domain/settings.ts';
import { medicinesSettings } from '../medicines/domain/settings.ts';
import { trustSettings } from '../trust/domain/settings.ts';
import { recordSettings } from '../record/domain/settings.ts';
import { devicesSettings } from '../devices/domain/settings.ts';
import { clinicalSettings } from '../clinical/domain/settings.ts';
import { movementSettings } from '../movement/domain/settings.ts';

export const settingsEngines: Readonly<Record<string, SettingsEngine>> = Object.freeze({
 safety: safetySettings,
 care: careSettings,
 money: moneySettings,
 core: coreSettings,
 access: accessSettings,
 medicines: medicinesSettings,
 trust: trustSettings,
 record: recordSettings,
 devices: devicesSettings,
 clinical: clinicalSettings,
 movement: movementSettings
});
