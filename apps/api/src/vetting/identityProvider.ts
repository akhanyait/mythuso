/**
 * Identity, through an accredited provider. The one adapter built as far as it can be built.
 *
 * ── Why this one and not the other eleven ────────────────────────────────────────────────────
 *
 * Home Affairs is the only authority in packages/catalog/vetting.json with a genuine commercial
 * path. The National Population Register is not sold to a company of this size directly, but a
 * market of accredited verification providers exists, they are contracted per query, and the shape
 * they all present is the same one: an HMAC-signed request that opens a session, a hosted flow the
 * person completes with their own face and their own identity number, and a signed callback
 * carrying the answer. So this adapter is written to that shape, in full, and the only things
 * missing when it lands in production are a contract and a key.
 *
 * Everything else in this file exists because "we will wire the provider later" is how a signature
 * check, an idempotency guard and a replay window get skipped — each of them individually small,
 * and each of them the whole of the security of a webhook that flips a nurse to identity-confirmed.
 *
 * ── What is real here ────────────────────────────────────────────────────────────────────────
 *
 *  · **The request is signed.** HMAC-SHA256 over timestamp, partner id and the provider's fixed
 *    request tag, keyed on the API key, hex. That is the provider's own scheme; it is implemented
 *    on node:crypto because this service has no dependencies and does not intend to acquire one for
 *    thirty bytes of HMAC.
 *  · **The callback's signature is verified, and compared in constant time.** A webhook that only
 *    checks that the JSON parsed is an endpoint on the public internet that marks people
 *    identity-confirmed on request.
 *  · **The callback is idempotent.** A provider retries. A session that has already been answered is
 *    acknowledged and changes nothing — enforced by the store returning false on the second write
 *    rather than by this file remembering, because a guard held in memory is a guard that a restart
 *    hands back.
 *  · **A replay window.** A correct signature over an old timestamp is still a correct signature.
 *    Fifteen minutes is long enough for a provider's own retry schedule and short enough that a
 *    captured callback is not a standing key to a session that has not been answered yet.
 *  · **Sandbox runs without secrets, and production refuses to.** With no partner id and no key,
 *    development gets a session that goes nowhere and answers only when a test says so — which is
 *    what lets the whole flow be exercised. Production will not construct this adapter at all under
 *    those conditions: it throws at start-up. A service that quietly sandboxes in production is a
 *    service that reports identities as confirmed by Home Affairs on the strength of nothing.
 *
 * The structural part of that last one is worth stating: whether a callback needs a signature is
 * decided by the *session's own recorded mode*, not by a flag read at the time the callback
 * arrives. Sandbox sessions can only be opened by a sandbox adapter, a sandbox adapter cannot be
 * constructed in production, and so there is no arrangement of environment variables that produces
 * a signature-free callback on a production server.
 *
 * ── What is not real, and will not be until there is a contract ──────────────────────────────
 *
 * No provider has been contracted, no key exists, and this has never spoken to one. The endpoint
 * path, the request fields and the result codes below are the published shape of a provider of this
 * kind; every one of them must be checked against the contracted provider's own documentation
 * before this is switched on, and the mapping in `outcomeFor` is where that check lands. Until then
 * the registry in authority.ts serves Home Affairs from a not-integrated stub, so a service with
 * nothing configured says "not integrated" rather than "sandbox".
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { answer, enquiryReference, type AuthorityAnswer, type AuthorityOutcome, type AuthorityVerifier, type Credential, type IntegrationStanding } from './authority.ts';

/** Sandbox is a mode a session is opened in and carries for ever, not a flag read later. */
export const IDENTITY_MODES = ['sandbox', 'live'] as const;
export type IdentityMode = typeof IDENTITY_MODES[number];
/* A closed set, validated when a session is written and again when one is read. A stored value that
   is neither — `Live`, `staging`, an empty string from a hand-edited row — is not quietly read as a
   sandbox: it is read as unknown, and a callback against it is refused. */
export const isIdentityMode = (value: unknown): value is IdentityMode => (IDENTITY_MODES as readonly unknown[]).includes(value);

/** One verification session, from the moment it is opened to the moment it is answered. */
export type IdentitySession = {
 /** Our own job identity, sent to the provider and echoed back on the callback. */
 reference: string;
 evidenceId: string;
 partyId: string;
 /** Null where the stored value is not a mode at all. Nothing is accepted against such a session. */
 mode: IdentityMode | null;
 /** Null while the person has not finished. Terminal once set, which is what makes retries safe. */
 outcome: AuthorityOutcome | null;
 detail: string | null;
 openedAt: number;
 answeredAt: number | null;
};

/** The narrow store this needs. Three reads and two writes; nothing here can update an answer. */
export interface IdentitySessionStore {
 openIdentitySession(session: IdentitySession): void;
 findIdentitySession(reference: string): IdentitySession | null;
 latestIdentitySession(evidenceId: string): IdentitySession | null;
 /** False where the session has already been answered. That refusal is the idempotency guard. */
 answerIdentitySession(reference: string, at: number, outcome: AuthorityOutcome, detail: string): boolean;
}

/** Refusal to build the adapter at all. Its own type: it is a start-up fault, not a request fault. */
export class IdentityProviderRefused extends Error {}

export type IdentityConfig = {
 environment: 'development' | 'production';
 /** Empty means the provider is not configured, and Home Affairs stays a not-integrated stub. */
 identityProvider: string;
 identityPartnerId: string;
 identityApiKey: string;
 identitySandbox: boolean;
 identityCallbackUrl: string;
 /* MYTHUSO_ENV said development in so many words. Optional so an older caller that does not know
    about it gets the fail-closed answer — absent is not explicit. */
 explicitDevelopment?: boolean;
};

/** What the provider POSTs back. Everything is optional because nothing arriving is trusted. */
export type IdentityCallback = {
 reference?: string;
 SmileJobID?: string;
 ResultCode?: number | string;
 ResultText?: string;
 signature?: string;
 timestamp?: string;
 [key: string]: unknown;
};

export type CallbackVerdict =
 | { ok: true; session: IdentitySession; outcome: AuthorityOutcome; detail: string; repeated: boolean }
 | { ok: false; reason: string; reference: string | null; flagged?: true };

export interface IdentityProvider extends AuthorityVerifier {
 readonly mode: IdentityMode;
 /** Opens a session for one evidence record. The person completes it; the answer arrives later. */
 openSession(request: { evidenceId: string; partyId: string }, at: number):
  Promise<{ ok: true; reference: string; url: string; mode: IdentityMode } | { ok: false; reason: string }>;
 /** Takes a callback, or refuses it. Never throws on bad input: a webhook is untrusted by nature. */
 acceptCallback(payload: IdentityCallback, at: number): CallbackVerdict;
}

/* The provider's fixed request tag, and its job type for a selfie matched against the Home Affairs
   record. Named rather than inlined so the two places they are used cannot drift apart. */
const REQUEST_TAG = 'sid_request';
const BIOMETRIC_KYC = 4;
/** How old a signed callback may be. See the note on replay in the header. */
export const CALLBACK_WINDOW_MS = 15 * 60_000;

const hex = (key: string, data: string): string => createHmac('sha256', key).update(data).digest('hex');

/** The signature the provider expects on a request, and the one it puts on a callback. Same scheme. */
export const signIdentityRequest = (apiKey: string, timestamp: string, partnerId: string): string =>
 hex(apiKey, `${timestamp}${partnerId}${REQUEST_TAG}`);

/** Constant time, and length-checked first because timingSafeEqual throws on a length mismatch. */
export function signatureMatches(presented: string, expected: string): boolean {
 const a = Buffer.from(presented, 'utf8');
 const b = Buffer.from(expected, 'utf8');
 if (a.length !== b.length) return false;
 return timingSafeEqual(a, b);
}

/**
 * The provider's result codes, mapped onto the closed set of outcomes.
 *
 * Two rules run through it. Anything short of a match is not a confirmation — a partial match is
 * `mismatch` and not a pending state somebody eventually reads as fine. And a code this adapter
 * does not recognise is `unavailable` rather than a guess: an answer that cannot be interpreted has
 * not been received, whatever arrived over the wire.
 *
 * Every line of this must be checked against the contracted provider's own documentation before it
 * is switched on. It is written from the published shape of a provider of this kind and has never
 * been exercised against one.
 */
export function outcomeFor(code: number): { outcome: AuthorityOutcome; detail: string } {
 if (code === 0 || code === 1) return { outcome: 'confirmed', detail: 'The provider matched the selfie to the Home Affairs record for that identity number.' };
 if (code === 1011 || code === 1012) return { outcome: 'mismatch', detail: 'The provider returned a partial match. A partial match is not a confirmation, and it is not recorded as one — a reviewer looks at it.' };
 if (code === 1013 || code === 1014) return { outcome: 'not-found', detail: 'Home Affairs holds no record for that identity number.' };
 if (code === 1015) return { outcome: 'expired', detail: 'Home Affairs holds the record and the document presented against it has expired.' };
 return { outcome: 'unavailable', detail: `The provider returned result code ${code}, which this adapter does not interpret. An answer that cannot be read is not an answer, so nothing has been confirmed.` };
}

const STANDING: IntegrationStanding = {
 integrated: true,
 body: 'Department of Home Affairs, through an accredited verification provider',
 route: 'accredited-provider',
 needs: 'A signed contract with the accredited provider, a partner id and an API key in the service environment, and a callback URL the provider can reach.',
 latency: 'Seconds to minutes for the provider, plus however long the person takes over the selfie. The answer arrives on a callback, so nothing here blocks on it.',
 holds: 'The partner id and API key, held in the environment and never in the database. The identity number is entered by the person into the provider\'s own hosted flow and never passes through this service.',
 note: 'Built and unexercised. No provider has been contracted and this adapter has never spoken to one; the endpoint path, the request fields and the result-code mapping are the published shape of a provider of this kind and must be checked against the contracted provider\'s documentation before it is switched on.'
};

/**
 * Build the adapter, or refuse to.
 *
 * Returns null where the provider is simply not configured — which is not a fault, it is today, and
 * the registry then serves Home Affairs from the not-integrated stub in authority.ts. It throws
 * where the configuration is a lie: a provider named in production with no credentials behind it,
 * or a production service asked to run in sandbox. Both of those end with the platform reporting
 * identities as confirmed by Home Affairs when nothing has been confirmed by anybody.
 */
export function createIdentityProvider(deps: {
 config: IdentityConfig;
 store: IdentitySessionStore;
 /* Injected so a test can drive the live path without a network, and so nothing here reaches for a
    global. The signature is fetch's own, narrowed to what is used. */
 fetch?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}): IdentityProvider | null {
 const { config, store } = deps;
 if (!config.identityProvider.trim()) return null;

 const production = config.environment === 'production';
 const explicitDevelopment = config.environment === 'development' && config.explicitDevelopment === true;
 const credentialled = Boolean(config.identityPartnerId.trim() && config.identityApiKey.trim());
 if (production && !credentialled) {
  throw new IdentityProviderRefused(`MYTHUSO_IDENTITY_PROVIDER names "${config.identityProvider}" and there is no partner id or API key behind it. In production this refuses to start rather than falling back to a sandbox: a sandboxed identity check reports a person as verified against Home Affairs when Home Affairs has never been asked.`);
 }
 if (production && config.identitySandbox) {
  throw new IdentityProviderRefused('MYTHUSO_IDENTITY_SANDBOX cannot be enabled in production. A sandbox session answers whatever it is told to, and the answer it writes is indistinguishable afterwards from one Home Affairs gave.');
 }
 const mode: IdentityMode = credentialled && !config.identitySandbox ? 'live' : 'sandbox';
 const base = config.identitySandbox || !credentialled
  ? 'https://testapi.smileidentity.com'
  : 'https://api.smileidentity.com';
 const call = deps.fetch ?? ((url, init) => fetch(url, init) as unknown as Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>);

 const openSession: IdentityProvider['openSession'] = async (request, at) => {
  const reference = enquiryReference('dha');
  if (mode === 'sandbox') {
   /* No network, no secret, and a URL that cannot resolve. RFC 2606 `.invalid` is the same choice
      erasure.ts makes for a tombstone, and for the same reason: something that looks like an
      address and provably is not one cannot be mistaken for a live flow in a screenshot. */
   store.openIdentitySession({ reference, evidenceId: request.evidenceId, partyId: request.partyId, mode, outcome: null, detail: null, openedAt: at, answeredAt: null });
   return { ok: true, reference, url: `https://identity.sandbox.invalid/session/${reference}`, mode };
  }
  const timestamp = new Date(at).toISOString();
  try {
   const response = await call(`${base}/v2/smart-selfie-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     partner_id: config.identityPartnerId,
     signature: signIdentityRequest(config.identityApiKey, timestamp, config.identityPartnerId),
     timestamp,
     /* The evidence record, not the person. The provider is told which check this is for and needs
        nothing else from us: the identity number is typed by the person into the provider's own
        flow, so this service never holds it and never sends it. */
     user_id: request.partyId,
     job_id: reference,
     job_type: BIOMETRIC_KYC,
     callback_url: config.identityCallbackUrl
    })
   });
   const body = await response.json().catch(() => ({})) as { url?: string; token?: string };
   if (!response.ok) return { ok: false, reason: `The identity provider refused to open a session (HTTP ${response.status}). Nothing has been recorded and nothing has been confirmed.` };
   const url = body.url ?? (body.token ? `https://hosted.smileidentity.com/?token=${body.token}` : null);
   if (!url) return { ok: false, reason: 'The identity provider opened a session and returned no URL to send the person to. Nothing has been recorded.' };
   store.openIdentitySession({ reference, evidenceId: request.evidenceId, partyId: request.partyId, mode, outcome: null, detail: null, openedAt: at, answeredAt: null });
   return { ok: true, reference, url, mode };
  } catch (error) {
   /* Fail closed, and say which of the two it was. A provider that could not be reached is not a
      provider that said no, and the difference is what a reviewer needs in order to know whether
      to try again or to ask the person for something else. */
   return { ok: false, reason: `The identity provider could not be reached: ${error instanceof Error ? error.message : 'the request failed'}. Nothing has been recorded and nothing has been confirmed.` };
  }
 };

 const acceptCallback: IdentityProvider['acceptCallback'] = (payload, at) => {
  const reference = typeof payload.reference === 'string' ? payload.reference
   : typeof payload.SmileJobID === 'string' ? payload.SmileJobID : null;
  if (!reference) return { ok: false, reason: 'The callback names no session. There is nothing to match it to.', reference: null };
  const session = store.findIdentitySession(reference);
  if (!session) return { ok: false, reason: 'No identity verification session was opened under that reference by this service.', reference };

  /* Fail closed, in three steps.
     A session whose stored mode is not a mode is refused outright: it is not a sandbox by default.
     A sandbox session on a service not running in explicit development is refused and flagged — a
     database that was opened in development and is now being served somewhere else is exactly the
     arrangement in which a rehearsal answer could become somebody's identity confirmation.
     And a signature is required unless all three hold at once: the session was opened as a sandbox,
     MYTHUSO_ENV says development in so many words, and no provider credentials are configured. The
     mode alone never decides it — the first version checked the signature only for sessions whose
     stored mode was exactly live, so any other stored value took the unsigned path, and
     scripts/check-boundaries.mjs now fails the build if the branch is conditioned on the mode alone. */
  if (session.mode === null) {
   return { ok: false, reason: 'The session this callback names was recorded with a mode that is neither sandbox nor live. A mode nobody can read is not a sandbox, so nothing is accepted against it.', reference };
  }
  if (session.mode === 'sandbox' && !explicitDevelopment) {
   return { ok: false, flagged: true, reason: 'A sandbox identity session was found on a service that is not running in explicit development. A rehearsal session in this database is refused and flagged: its answer would read afterwards as a Home Affairs confirmation that never happened.', reference };
  }
  const unsignedAllowed = session.mode === 'sandbox' && explicitDevelopment && !credentialled;
  if (!unsignedAllowed) {
   if (!credentialled) {
    return { ok: false, reason: 'This callback must be signed, and no partner key is configured to verify a signature. Nothing has been recorded.', reference };
   }
   const { signature, timestamp } = payload;
   if (typeof signature !== 'string' || typeof timestamp !== 'string') {
    return { ok: false, reason: 'The callback carries no signature. An unsigned callback is an open endpoint for marking people identity-confirmed.', reference };
   }
   const signedAt = Date.parse(timestamp);
   if (!Number.isFinite(signedAt) || Math.abs(at - signedAt) > CALLBACK_WINDOW_MS) {
    return { ok: false, reason: `The callback's signature is over a timestamp outside the ${CALLBACK_WINDOW_MS / 60_000}-minute window. A correct signature over an old timestamp is still a correct signature, which is what makes replaying one worth refusing.`, reference };
   }
   if (!signatureMatches(signature, signIdentityRequest(config.identityApiKey, timestamp, config.identityPartnerId))) {
    return { ok: false, reason: 'The callback signature does not verify against the partner key. Nothing has been recorded.', reference };
   }
  }

  const code = Number(payload.ResultCode ?? NaN);
  if (!Number.isFinite(code)) return { ok: false, reason: 'The callback carries no result code, so it says nothing about the person it is about.', reference };
  const { outcome, detail } = outcomeFor(code);
  const said = typeof payload.ResultText === 'string' && payload.ResultText.trim() ? `${detail} The provider said: ${payload.ResultText.trim()}` : detail;

  /* Idempotency, decided by the store rather than by this function. A provider retries, and a
     retry that re-ran the mapping would be a second authority answer recorded for one enquiry. */
  const first = store.answerIdentitySession(reference, at, outcome, said);
  const settled = first ? { ...session, outcome, detail: said, answeredAt: at } : store.findIdentitySession(reference)!;
  return {
   ok: true, session: settled,
   outcome: settled.outcome ?? outcome, detail: settled.detail ?? said,
   repeated: !first
  };
 };

 return {
  authority: 'dha',
  standing: mode === 'sandbox'
   ? { ...STANDING, note: `SANDBOX. ${STANDING.note} This process is running without provider credentials, so every session it opens is a rehearsal and every answer it records was written by whoever drove the rehearsal. Nothing on this service has been confirmed by Home Affairs.` }
   : STANDING,
  mode,
  openSession,
  acceptCallback,
  /**
   * What can be answered without the person present, which is: what the last session said.
   *
   * A biometric identity check cannot be re-run unattended. There is no query MyThuso can make on a
   * Tuesday night that re-confirms a nurse's identity without her face, so this reads back the last
   * answer rather than inventing a fresh one — with the date it was actually given, never today's.
   * A sweep that found a confirmation from two years ago and stamped it with tonight's date would
   * be laundering an old answer, and the re-verification schedule exists precisely to notice that
   * it is old.
   */
  check: async (credential: Credential, at: number): Promise<AuthorityAnswer> => {
   const latest = store.latestIdentitySession(credential.evidenceId);
   if (!latest) {
    return answer('dha', 'unavailable', at, 'No identity verification session has been opened for this check. Identity is confirmed by the person completing a session with the provider; it cannot be asked for on their behalf.');
   }
   if (latest.outcome === null) {
    return answer('dha', 'unavailable', at, `A verification session was opened on ${new Date(latest.openedAt).toISOString().slice(0, 10)} and the person has not completed it. An unfinished session confirms nothing.`, { reference: latest.reference });
   }
   return answer('dha', latest.outcome, latest.answeredAt ?? latest.openedAt, latest.detail ?? '', { reference: latest.reference });
  }
 };
}
