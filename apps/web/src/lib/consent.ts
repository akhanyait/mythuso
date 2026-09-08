import contract from '../../../../packages/catalog/consent.json';
import { probe } from './auth';

/**
 * Consent, and the log of who opened a record — the reasoning, held apart from the screen.
 *
 * Everything a person is shown comes out of `packages/catalog/consent.json`: the purposes, their
 * versions, the required/optional split, the refusal sentences, the withdrawal sentences and the
 * retention statements. The same file is read by `apps/api/src/consent`, so the words on the screen
 * and the words the server records a fingerprint of are one set of words. `scripts/check-boundaries.mjs`
 * fails the build if any of them are typed out here as well.
 *
 * Nothing here is a compliance control. It is the design of one. With the identity service running,
 * the screens read and write the real register; without it they run on the fixtures below, held in
 * the tab and gone on reload — this preview persists nothing in the browser, and the boundary check
 * that scans every file under apps/web/src is what keeps that true.
 */

export type PurposeKind = 'consent' | 'acknowledgement';
/* Written out rather than derived from the JSON with `typeof`. TypeScript widens a heterogeneous
   array of object literals into a union, so a version that happens to carry `supersededBecause` and
   one that does not become two different types and neither can be read. The contract's own loader in
   apps/api/src/consent/contract.ts checks the shape at start-up, which is where that belongs. */
export type ConsentVersion = {
 version: number; effectiveDays: number; wording: string; withdrawalWording: string;
 change: string; carriesOver: boolean; supersededBecause?: string; reconsent?: string; note?: string;
};
export type RetainedStatement = { what: string; because: string; basis: string };
export type ConsentPurpose = {
 id: string; name: string; kind: PurposeKind; required: boolean; requiredBecause?: string;
 lawfulBasis: string; alsoRestsOn?: string; degradesCare: boolean; ifRefused: string;
 withdrawal: string; withdrawable?: boolean; retainedOnWithdrawal: RetainedStatement[];
 versions: ConsentVersion[];
};
export type LawfulBasis = { id: string; name: string; authority: string; detail: string };

export const why = contract.why;
export const notAdvice = contract.notAdvice;
export const rules = contract.rules;
export const routes = contract.routes;
export const lawfulBases: LawfulBasis[] = contract.lawfulBases;
export const purposes: ConsentPurpose[] = contract.purposes as ConsentPurpose[];
export const accessLog = contract.accessLog;

export const requiredPurposes = purposes.filter(purpose => purpose.required);
export const optionalPurposes = purposes.filter(purpose => !purpose.required);
export const purposeById = (id: string) => purposes.find(purpose => purpose.id === id);
export const basisById = (id: string) => lawfulBases.find(basis => basis.id === id);
export const basisName = (id: string) => basisById(id)?.name ?? id;
/** The version in force. The contract's own check keeps them in ascending order. */
export const currentVersion = (purpose: ConsentPurpose): ConsentVersion => purpose.versions[purpose.versions.length - 1]!;
export const versionOf = (purpose: ConsentPurpose, version: number) => purpose.versions.find(candidate => candidate.version === version);

/** Day offsets, so the preview never goes stale. Same rule the rest of the catalogue follows. */
export const effectiveOn = (version: ConsentVersion, from = Date.now()) => new Date(from + version.effectiveDays * 86_400_000);
export const asDate = (at: number | Date) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }).format(at);
export const asMoment = (at: number) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(at);

/**
 * Where somebody stands on a purpose, resolved rather than stored.
 *
 * `held-on-superseded-version` is the state that makes versioning real: a consent given to wording
 * that has since changed is still a consent — to those words — and it is not a consent to these
 * ones. The server refuses to act on it and the screen has to say why.
 */
export type PurposeState = 'never-asked' | 'held' | 'held-on-superseded-version' | 'withdrawn' | 'refused';
export type Decision = { decision: 'given' | 'withdrawn' | 'refused'; version: number; at: number; route: string; locale: string };
export type Standing = { purposeId: string; state: PurposeState; heldVersion: number | null; decidedAt: number | null; history: Decision[] };

export const stateOf = (history: Decision[], purpose: ConsentPurpose): PurposeState => {
 const last = history[history.length - 1];
 if (!last) return 'never-asked';
 if (last.decision === 'withdrawn') return 'withdrawn';
 if (last.decision === 'refused') return 'refused';
 return last.version === currentVersion(purpose).version ? 'held' : 'held-on-superseded-version';
};
/** Only a consent on the wording in force authorises anything. That is the whole point. */
export const authorises = (standing: Standing) => standing.state === 'held';

/** Whether care can be arranged, and what is missing. Only required purposes can ever reach it. */
export function careStanding(standings: Standing[]) {
 const missing = requiredPurposes.filter(purpose => {
  const standing = standings.find(candidate => candidate.purposeId === purpose.id);
  return !standing || !authorises(standing);
 });
 return {
  mayReceiveCare: missing.length === 0,
  missing,
  sentence: missing.length
   ? `MyThuso cannot arrange care until ${missing.map(purpose => purpose.name.toLowerCase()).join(' and ')} ${missing.length === 1 ? 'is' : 'are'} settled. Nothing optional is being asked for here.`
   : 'Everything MyThuso needs to arrange care is on your record, on the wording currently in force.'
 };
}

export const stateLabel: Record<PurposeState, string> = {
 'never-asked': 'Not yet answered',
 held: 'Agreed',
 'held-on-superseded-version': 'Needs answering again',
 withdrawn: 'Withdrawn',
 refused: 'Declined'
};

/**
 * The fingerprint of what was shown, computed the same way the server computes it.
 *
 * Over the wording *and* the withdrawal sentence, with the purpose and version in the digest, so
 * the same sentence under two purposes does not produce one proof that fits both. It is shown to
 * the person because a proof they cannot see is a proof they have to take on trust.
 *
 * The line building `input` below has to stay identical to the one in
 * apps/api/src/consent/contract.ts: a fingerprint the browser shows and the server does not hold is
 * worse than showing none. scripts/check-boundaries.mjs compares the two rather than trusting this.
 */
export async function wordingHash(purposeId: string, version: ConsentVersion): Promise<string | null> {
 const subtle = globalThis.crypto?.subtle;
 if (!subtle) return null;
 const input = JSON.stringify([purposeId, version.version, version.wording, version.withdrawalWording]);
 const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
 return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/* ---- The preview's own state -------------------------------------------------------------------
   Fixtures, in memory, gone on reload. They are chosen to put every one of the five states on the
   screen at once — including the one that matters most, a consent given to wording that has since
   changed — because a screen that only ever shows "agreed" is a screen nobody has designed the
   difficult half of. */
export const previewStandings = (): Standing[] => {
 const at = (days: number) => Date.now() + days * 86_400_000;
 return [
  { purposeId: 'care-delivery', state: 'held-on-superseded-version', heldVersion: 1, decidedAt: at(-400), history: [{ decision: 'given', version: 1, at: at(-400), route: 'web-account', locale: 'en-ZA' }] },
  { purposeId: 'processing-notice', state: 'held', heldVersion: 1, decidedAt: at(-400), history: [{ decision: 'given', version: 1, at: at(-400), route: 'web-account', locale: 'en-ZA' }] },
  { purposeId: 'product-updates', state: 'withdrawn', heldVersion: 2, decidedAt: at(-9), history: [
   { decision: 'given', version: 2, at: at(-60), route: 'web-account', locale: 'en-ZA' },
   { decision: 'withdrawn', version: 2, at: at(-9), route: 'web-account', locale: 'en-ZA' }
  ] },
  { purposeId: 'wearable-readings', state: 'never-asked', heldVersion: null, decidedAt: null, history: [] },
  { purposeId: 'service-improvement', state: 'refused', heldVersion: 1, decidedAt: at(-60), history: [{ decision: 'refused', version: 1, at: at(-60), route: 'web-account', locale: 'en-ZA' }] }
 ];
};

export type AccessEntry = {
 at: number;
 actorLabel: string | null;
 actorRole: string;
 capability: string;
 purpose: string;
 lawfulBasis: string;
 recordType: string;
 outcome: 'granted' | 'refused';
 refusedBy: string | null;
 reason: string | null;
 consentPurpose: string | null;
 consentVersion: number | null;
 auditId: string | null;
};

/* Two of the six were refused, deliberately. A sample access history in which everything succeeded
   would have designed away the only entry a person actually opens this screen looking for. */
export const previewAccesses = (): AccessEntry[] => {
 const at = (hours: number) => Date.now() + hours * 3_600_000;
 return [
  { at: at(-2), actorLabel: 'You', actorRole: 'subject', capability: 'view-billing', purpose: 'subject-access', lawfulBasis: 's23-subject-access', recordType: 'audit', outcome: 'granted', refusedBy: null, reason: null, consentPurpose: null, consentVersion: null, auditId: 'demo-6' },
  { at: at(-30), actorLabel: 'Unknown sign-in · Bloemfontein', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment', lawfulBasis: 's11a-consent', recordType: 'vitals', outcome: 'refused', refusedBy: 'vetting-standing', reason: 'Nobody by that name has been vetted, so there is no standing to check. The gate refuses rather than assumes.', consentPurpose: 'care-delivery', consentVersion: 2, auditId: 'demo-5' },
  { at: at(-52), actorLabel: 'Dr A. Dlamini · HPCSA MP 0784512', actorRole: 'doctor', capability: 'view-clinical-record', purpose: 'treatment', lawfulBasis: 's11a-consent', recordType: 'consultation', outcome: 'granted', refusedBy: null, reason: null, consentPurpose: 'care-delivery', consentVersion: 2, auditId: 'demo-4' },
  { at: at(-54), actorLabel: 'MyThuso billing', actorRole: 'internal-admin', capability: 'view-billing', purpose: 'billing', lawfulBasis: 's11f-legitimate-interest', recordType: 'invoice', outcome: 'granted', refusedBy: null, reason: null, consentPurpose: null, consentVersion: null, auditId: 'demo-3' },
  { at: at(-55), actorLabel: 'MyThuso billing', actorRole: 'internal-admin', capability: 'view-billing', purpose: 'billing', lawfulBasis: 's11f-legitimate-interest', recordType: 'diagnosis', outcome: 'refused', refusedBy: 'purpose', reason: 'A billing purpose does not reach Diagnosis. A service code and an amount. Finance never sees why the service was needed, and the ceiling says so rather than the invoice template saying so.', consentPurpose: null, consentVersion: null, auditId: 'demo-2' },
  { at: at(-56), actorLabel: 'Sister Naledi Mokoena · SANC 21847', actorRole: 'nurse', capability: 'view-clinical-record', purpose: 'treatment', lawfulBasis: 's11a-consent', recordType: 'vitals', outcome: 'granted', refusedBy: null, reason: null, consentPurpose: 'care-delivery', consentVersion: 2, auditId: 'demo-1' }
 ];
};

/* ---- The service, where one is answering ------------------------------------------------------
   Same shape as lib/auth.ts: the app works without it, and where it is reachable the register is
   real. A failure is never a silent success — the caller is told it fell back to the preview. */
const json = { 'content-type': 'application/json' };

export async function fetchStanding(): Promise<{ standings: Standing[] } | null> {
 try {
  const response = await fetch('/api/consent', { credentials: 'same-origin', signal: AbortSignal.timeout(1500) });
  if (!response.ok) return null;
  const body = await response.json() as { standing: { purposeId: string; state: PurposeState; heldVersion: number | null; decidedAt: number | null; history: Decision[] }[] };
  return { standings: body.standing.map(entry => ({ purposeId: entry.purposeId, state: entry.state, heldVersion: entry.heldVersion, decidedAt: entry.decidedAt, history: entry.history })) };
 } catch { return null; }
}

export async function sendDecision(path: 'give' | 'withdraw', purposeId: string, version?: number): Promise<boolean> {
 try {
  const response = await fetch(`/api/consent/${path}`, {
   method: 'POST', headers: json, credentials: 'same-origin',
   body: JSON.stringify({ purposeId, version, route: 'web-account', locale: 'en-ZA' })
  });
  return response.ok;
 } catch { return false; }
}

/* Four different facts used to leave this function as the same `null`: the device has no signal,
   the service answered badly, the service is not running at all, and the request simply failed.
   The screen showed fixtures for all four as though nothing had happened — which is the one thing a
   log of who opened your health record must never do. It is a discriminated answer now, and the
   access-log screen renders a different state for each.

   `no-service` is deliberately not an error. The identity service is installed and switched off
   until DNS, TLS and an SMS provider exist (deploy/README.md), so a request that cannot find it is
   the expected outcome rather than a failure, and the screen says so with the contract's own
   sentence instead of an alert nobody can act on. */
export type Answer<T> =
 | { kind: 'answered'; value: T }
 | { kind: 'offline' }
 | { kind: 'failed' }
 | { kind: 'no-service' };

export async function fetchAccessLog(): Promise<Answer<AccessEntry[]>> {
 if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' };
 try {
  const response = await fetch('/api/consent/access-log', { credentials: 'same-origin', signal: AbortSignal.timeout(1500) });
  if (!response.ok) return await whyNot();
  return { kind: 'answered', value: (await response.json() as { entries: AccessEntry[] }).entries };
 } catch { return await whyNot(); }
}

/* Is there a service there at all? The same /api/health probe lib/auth.ts uses, asked only after
   something has already gone wrong, so the ordinary path costs one request rather than two. */
const whyNot = async (): Promise<Answer<never>> => (await probe()) ? { kind: 'failed' } : { kind: 'no-service' };
