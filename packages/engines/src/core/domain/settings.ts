/* Core's settings, over the shared settings shape: the escalation rota and the minutes at each rung of it.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings, and "who comes
 * after the fallback" was the one the closed loop answered with a null rota. So the rota and its minutes
 * are the settings escalation-rota and escalation-minutes in packages/catalog/closed-loop.json, in the shape
 * packages/catalog/settings.json gives every setting, and an admin changes them within bounds that are
 * themselves proposals. Every rule a change obeys is packages/engines/src/settings/shape.ts's, and Core adds
 * none of its own: that no hour of the week is left without a post is the rota's mustCover, and that there
 * is a time for every post but the last is the list's length, both asked by the shared rules.
 *
 * A CONCERN KEEPS THE ROTA IT WAS OPENED UNDER. rotaOf() turns the settings in force into the rota a concern
 * carries — the posts, their windows, the time each post holds it and the settings version — and Core asks
 * once, when it opens a concern, raises an alert or hears a panic, and never again for that concern. There
 * is no default rota exported for anything to fall back on; it is handed the settings by whoever holds the
 * history — the engine's store or the preview's memory. */
import closedLoop from '../../../../catalog/closed-loop.json' with { type: 'json' };
import type { Setting, SettingsBlock, SettingsEngine, Snapshot, Window } from '../../settings/shape.ts';
import { MINUTE_MS, type KeptRota } from './loops.ts';

export const coreBlock = { engine: 'core', ...closedLoop.settings } as unknown as SettingsBlock;
export const coreSettings: SettingsEngine = Object.freeze({ block: coreBlock });

const settingNamed = (key: string): Setting => {
 const found = coreBlock.items.find(setting => setting.key === key);
 if (!found) throw new Error(`packages/catalog/closed-loop.json has no setting "${key}", which its escalation block names.`);
 return found;
};
const ROTA = settingNamed(closedLoop.escalation.rotaSetting);
const MINUTES = settingNamed(closedLoop.escalation.minutesSetting);
if (ROTA.type !== 'schedule' || !ROTA.posts?.length || MINUTES.type !== 'list' || MINUTES.of !== 'minutes') {
 throw new Error('packages/catalog/closed-loop.json has lost the escalation rota as a schedule of posts, or the minutes at each rung as a list of minutes.');
}
const POSTS = ROTA.posts;

/** The rota a concern that starts now carries, from the settings in force now. */
export const rotaOf = (snapshot: Snapshot): KeptRota => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 posts: POSTS,
 windows: snapshot.values[ROTA.key] as readonly Window[],
 stepsMs: (snapshot.values[MINUTES.key] as readonly number[]).map(minutes => minutes * MINUTE_MS)
});

/* GET /v1/core/audit-exports@1 (Wave 6) refuses a range wider than a bound, and the bound is a setting
   rather than a number typed into the route: "auditExportMaxDaysNow" was an open question — how wide is
   too wide — and the founder's instruction of 15 September 2026 turns exactly that kind of question into
   an admin setting with a proposed default, never one this file decides for itself. */
const AUDIT_EXPORT_MAX_DAYS = settingNamed(closedLoop.auditExport.maxDaysSetting);
if (AUDIT_EXPORT_MAX_DAYS.type !== 'count') throw new Error('packages/catalog/closed-loop.json has lost the audit export bound as a count of days.');

/** How many days wide an export asked for now may be, from the setting in force. */
export const auditExportMaxDaysOf = (snapshot: Snapshot): number => snapshot.values[AUDIT_EXPORT_MAX_DAYS.key] as number;
