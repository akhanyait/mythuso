/* Clinical's settings, over the shared settings shape: who may confirm a clinical review, and the days after a
 * signed review a patient is asked whether their care helped.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings. Every rule a change
 * obeys is packages/engines/src/settings/shape.ts's; this file adds what only Clinical knows: which setting is
 * which, and the one rule on its list of days — earliest first, each day once — refused in the sentence
 * POST /v1/clinical/setting-changes@1 declares.
 *
 * WHO CONFIRMS IS READ, NOT GRANTED. packages/catalog/vetting.json grants sign-clinical-review to a role, and the
 * identity service answers that grant as it stands. Clinical asks the setting in force instead, whenever a review
 * is read or signed, and only among the roles clinical.json calls clinical: so an admin may name a senior nurse
 * as a confirmer without the register, the identity service or any other engine being told a capability moved.
 *
 * WHATEVER STARTS KEEPS WHAT IT READ. An episode of care reads the days when its review is signed and keeps them;
 * a change reaches the next episode and never one already scheduled. No screen and no handler types a role or a
 * day: they are read from here, which reads the contract and the history.
 */
import clinical from '../../../../catalog/clinical.json' with { type: 'json' };
import api from '../../../../catalog/apis/clinical.json' with { type: 'json' };
import { snapshotOf, type Change, type Check, type Refusal, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export const clinicalBlock = { engine: 'clinical', ...clinical.settings } as unknown as SettingsBlock;

const KEY = { confirmers: clinical.reviews.confirmerSetting, promDays: clinical.proms.scheduleSetting } as const;
for (const key of Object.values(KEY)) if (!clinicalBlock.items.some(s => s.key === key)) throw new Error(`packages/catalog/clinical.json has no setting "${key}", which a review or an episode reads.`);

/* Days that are not earliest first and each once describe a follow-up that runs backwards or asks twice. */
const check: Check = next => {
 const days = next[KEY.promDays];
 return Array.isArray(days) && days.some((day, i) => i > 0 && Number(day) <= Number(days[i - 1])) ? 'prom-days-out-of-order' : null;
};
const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/clinical/setting-changes' && route.version === 1);
if (!changeRoute) throw new Error("packages/catalog/apis/clinical.json has lost POST /v1/clinical/setting-changes@1, whose refusals Clinical's own settings rule answers with.");

export const clinicalSettings: SettingsEngine = Object.freeze({ block: clinicalBlock, refusals: changeRoute.refusals as readonly Refusal[], check });

export type ClinicalInForce = {
 readonly settingsVersion: number;
 /** The roles that may confirm a clinical review. */
 readonly confirmers: readonly string[];
 /** The days after a signed review a patient is asked the outcome questions, earliest first. */
 readonly promDays: readonly number[];
};

export function clinicalInForceOf(snapshot: Snapshot): ClinicalInForce {
 return Object.freeze({
  settingsVersion: snapshot.settingsVersion,
  confirmers: Object.freeze([...(snapshot.values[KEY.confirmers] as readonly string[])]),
  promDays: Object.freeze([...(snapshot.values[KEY.promDays] as readonly number[])])
 });
}
export const clinicalInForce = (history: readonly Change[]): ClinicalInForce => clinicalInForceOf(snapshotOf(clinicalBlock, history));
/** The settings nobody has changed: for a test, or a store with no history yet. */
export const clinicalByDefault: ClinicalInForce = clinicalInForce([]);
