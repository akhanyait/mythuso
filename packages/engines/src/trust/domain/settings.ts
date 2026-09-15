/* The Verify in service settings, read the way a shift start, a door code and a complaint need them.
 *
 * Four answers that would otherwise have been questions to the founder are settings in
 * packages/catalog/verify-in-service.json, in the shape packages/catalog/settings.json gives every setting: what
 * an unmatched shift start does to dispatch, how long a door code lasts, how many tries a patient has, and how
 * soon a complaint is reviewed. Every rule a change obeys is packages/engines/src/settings/shape.ts's. This file
 * adds only which setting is which field of what a shift, a code and a complaint are handed.
 *
 * A CHANGE NEVER REACHES BACK. A shift keeps the dispatch rule it started under, a code keeps its expiry and its
 * tries, and a complaint keeps the review window it arrived under — each takes a copy of what is in force when it
 * starts and nothing already started reads this again. So a window made longer never makes a late review on
 * time, and a lifetime made shorter never kills a code a patient is typing.
 */
import contract from '../../../../catalog/verify-in-service.json' with { type: 'json' };
import api from '../../../../catalog/apis/trust.json' with { type: 'json' };
import { proposeChange, snapshotOf, type Change, type ChangeRequest, type Refusal, type Result, type SettingsBlock, type SettingsEngine, type Snapshot } from '../../settings/shape.ts';

export type DispatchRule = 'withhold' | 'offer-with-desk-flag';
export type TrustInForce = {
 readonly settingsVersion: number;
 readonly dispatchRule: DispatchRule;
 readonly doorCodeMinutes: number;
 readonly doorCodeAttempts: number;
 readonly complaintReviewHours: number;
};

export const trustBlock = { engine: 'trust', ...contract.settings } as unknown as SettingsBlock;
const changeRoute = api.routes.find(route => route.method === 'POST' && route.path === '/v1/trust/setting-changes' && route.version === 1);
if (!changeRoute) throw new Error('packages/catalog/apis/trust.json has lost POST /v1/trust/setting-changes@1, whose refusals a Verify setting change answers with.');
export const trustSettings: SettingsEngine = Object.freeze({ block: trustBlock, refusals: changeRoute.refusals as readonly Refusal[] });

const inForceOf = (snapshot: Snapshot): TrustInForce => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 dispatchRule: snapshot.values['unmatched-shift-start-dispatch'] as DispatchRule,
 doorCodeMinutes: snapshot.values['door-code-lifetime'] as number,
 doorCodeAttempts: snapshot.values['door-code-attempts'] as number,
 complaintReviewHours: snapshot.values['complaint-review-hours'] as number
});

/** What is in force after a history of accepted changes. */
export const trustInForce = (history: readonly Change[]): TrustInForce => inForceOf(snapshotOf(trustBlock, history));

export function changeTrustSetting(history: readonly Change[], request: ChangeRequest, now: number): Result<{ readonly change: Change; readonly inForce: TrustInForce }> {
 const result = proposeChange(trustSettings, history, request, now);
 if (!result.ok) return result;
 return { ok: true, value: { change: result.value.change, inForce: inForceOf(result.value.snapshot) } };
}
