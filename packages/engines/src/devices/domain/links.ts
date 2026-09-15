/* A wearable link request: Apple Health or Health Connect, recorded and never connected.
 *
 * WHAT THIS WAVE REFUSES TO DO. There is no HealthKit or Health Connect library, entitlement or permission
 * prompt anywhere in this repository, and this file does not add a way to one. Importing health data from
 * another company's store needs a signed data protection impact assessment and a consent scope a clinical
 * reviewer has read (docs/governance/DPIA-DRAFT.md), and a HealthKit entitlement changes how the iOS app is
 * signed. So a request records the platform, the consent version and the reading types the patient agreed
 * to, and its state is requested-not-connected for as long as this build exists. scripts/check-boundaries.mjs
 * fails if either native app grows an entitlement, a permission or an import for either platform.
 *
 * A WITHDRAWAL IS A CONSENT DECISION. packages/catalog/consent.json: withdrawal stops new readings from the
 * patient's own devices immediately. Devices keeps it on the link and ./readings.ts refuses every later
 * reading from that patient's consumer devices by it.
 */
import { accept, measures, platforms, refuse, wearableConsentInForce, wearableConsentVersions, type Result } from './contract.ts';

export const LINK_STATE = 'requested-not-connected';

export type Link = {
 readonly linkRef: string;
 readonly subjectRef: string;
 readonly platform: string;
 readonly consentVersion: number;
 readonly metrics: readonly string[];
 readonly requestedAt: number;
 readonly withdrawnAt: number | null;
};

export type RequestInput = { readonly linkRef: string; readonly subjectRef: string | null; readonly platform: unknown; readonly consentVersion: unknown; readonly metrics: unknown };

/* An unidentified caller has given nobody's consent, so it is refused as a request without consent rather
   than recorded against nobody. */
export function requestLink(input: RequestInput, existing: readonly Link[], now: number): Result<Link> {
 if (input.subjectRef === null || !wearableConsentVersions.includes(input.consentVersion as number)) return refuse('consent-missing');
 if (input.consentVersion !== wearableConsentInForce) return refuse('consent-version-not-current');
 if (!platforms.some(p => p.id === input.platform)) return refuse('platform-not-declared');
 const metrics = Array.isArray(input.metrics) ? input.metrics : [];
 if (!metrics.length || !metrics.every(m => measures.some(x => x.id === m))) return refuse('metric-not-in-the-scope');
 if (existing.some(l => l.subjectRef === input.subjectRef && l.platform === input.platform && l.withdrawnAt === null)) return refuse('link-already-requested');
 return accept({
  linkRef: input.linkRef, subjectRef: input.subjectRef, platform: String(input.platform), consentVersion: input.consentVersion as number,
  metrics: [...new Set(metrics as string[])], requestedAt: now, withdrawnAt: null
 });
}

export function withdrawLink(link: Link, byRef: string | null, now: number): Result<Link> {
 if (byRef === null || byRef !== link.subjectRef) return refuse('link-held-by-another');
 if (link.withdrawnAt !== null) return refuse('link-already-withdrawn');
 return accept({ ...link, withdrawnAt: now });
}

/** Whether a patient has withdrawn consent to readings from their own devices, at or before a moment. */
export const withdrawnFor = (links: readonly Link[], subjectRef: string, at: number): boolean =>
 links.some(l => l.subjectRef === subjectRef && l.withdrawnAt !== null && l.withdrawnAt <= at);
