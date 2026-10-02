import { citationOf } from "../knowledge-provenance.ts";
import {
  authEnvName,
  federationSource,
  isSourceActive,
  outgoingTerm,
  type AdapterDeps,
  type AdapterOutcome,
  type FederatedResult,
  type SourceConfig,
} from "./config.ts";
import { rateGateFor } from "./rate-gate.ts";

/* The WHO ICD-11 adapter — dark by default, like every external source (packages/catalog/
   knowledge/federation.json).

   WHAT IT WOULD DO WHEN ACTIVE. Ask the WHO's ICD-11 MMS search for a topic and return the
   classification entities that match, each carrying its ICD-11 code as a terminology enrichment
   attached to the source's own title — never a diagnosis, never a definition rewritten. The
   source's config fixes what it is for ("Validating and enriching the terminology codes the
   catalogue maps to its own entries") and what it is not for (answering a person's question on its
   own), and this adapter adds nothing to either list.

   DARK MEANS DARK. The first thing searchIcd11() does is read its config and refuse when the
   source is not explicitly active — before credentials are read, before the rate gate is asked,
   before any URL is built. The refusal is an outcome ("dark"), not an exception, because the merge
   layer must be able to report per-source posture without a try/catch of its own.

   THE SHAPE OF THE CALLS, WRITTEN BUT UNSPENT. WHO's ICD API authenticates with OAuth2 client
   credentials (ICD11_CLIENT_ID / ICD11_CLIENT_SECRET in the deployment environment, never in this
   repository) and searches over id.who.int; the request and response shapes below follow WHO's own
   documentation. While the source is dark these code paths can only run under an injected test
   config — the deployment path stops at the dark refusal — so the live shapes are re-verified at
   activation, which is exactly what the config's own activation note requires. */

const SOURCE_ID = "icd11-who";
const TIMEOUT_MS = 4000;
const MAX_RESULTS = 5;
/* A query this long has stopped being a topic; the same ceiling the literature tool holds. */
const MAX_QUERY_LENGTH = 200;

type Icd11Entity = {
  id?: string;
  title?: string;
  theCode?: string;
  score?: number;
};

type Icd11Body = {
  destinationEntities?: Icd11Entity[];
};

/* Entity titles arrive with WHO's own <em> highlight markup; the title a person would read is the
   text without it. */
const deTag = (value: string): string =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/* A code is attached only when it is shaped like an ICD-11 MMS code. Full validation (the
   catalogue's own codes) runs in scripts/knowledge-codes.mjs on every build; this is the adapter's
   smaller duty: never hand the merge layer something that is obviously not a code. */
const codeShaped = (value: unknown): string =>
  typeof value === "string" && /^[0-9A-Z]{3,7}(\.[0-9A-Z]{1,4})?$/.test(value.trim()) ? value.trim() : "";

const entityIdOf = (entity: Icd11Entity, index: number, code: string): string => {
  if (code) return `${SOURCE_ID}:${code}`;
  const tail = typeof entity.id === "string" ? entity.id.split("/").filter(Boolean).pop() : "";
  return `${SOURCE_ID}:${tail || `entity-${index + 1}`}`;
};

const browseUrlOf = (entity: Icd11Entity): string | undefined =>
  typeof entity.id === "string" && /^https?:\/\//.test(entity.id) ? entity.id : undefined;

/* One OAuth2 client-credentials round trip. Returns the access token, or a reason it could not be
   had — never throws, never echoes a credential. */
async function fetchToken(
  config: SourceConfig,
  fetchImpl: typeof fetch,
  env: { [key: string]: string | undefined },
): Promise<{ token: string } | { why: string }> {
  const clientIdEnv = authEnvName(config, "clientIdEnv");
  const clientSecretEnv = authEnvName(config, "clientSecretEnv");
  const clientId = clientIdEnv ? env[clientIdEnv] : "";
  const clientSecret = clientSecretEnv ? env[clientSecretEnv] : "";
  if (!clientId || !clientSecret)
    return {
      why: `credentials are not configured (${clientIdEnv || "ICD11_CLIENT_ID"} and ${clientSecretEnv || "ICD11_CLIENT_SECRET"} are unset)`,
    };
  const tokenEndpoint = config.auth?.tokenEndpoint;
  if (typeof tokenEndpoint !== "string" || !tokenEndpoint)
    return { why: "the config records no token endpoint" };
  try {
    const response = await fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "icdapi_access",
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { why: `the token endpoint answered ${response.status}` };
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token)
      return { why: "the token endpoint answered without a token" };
    return { token: body.access_token };
  } catch (error) {
    return { why: `the token call failed (${error instanceof Error ? error.name : "unknown"})` };
  }
}

export async function searchIcd11(query: string, deps: AdapterDeps = {}): Promise<AdapterOutcome> {
  const config = deps.config ?? federationSource(SOURCE_ID);
  if (!config) return { status: "unavailable", sourceId: SOURCE_ID, detail: "no config for this source in federation.json" };
  if (!isSourceActive(config, deps.override))
    return {
      status: "dark",
      sourceId: config.id,
      detail: `${config.id} is dark (active: false, and the demonstration override does not open it) — activation requires the recorded licence and POPIA review, credentials in the deployment environment, then a deliberate edit of federation.json`,
    };

  const trimmed = outgoingTerm(query, MAX_QUERY_LENGTH);
  if (!trimmed)
    return { status: "unavailable", sourceId: config.id, detail: "no query was given; nothing left the process" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;

  /* The gate is asked before the token round trip, not after: a rate-limited call must send nothing
     at all, and the token call is itself a request to the same authority. */
  const now = deps.now ?? (() => new Date());
  const gate =
    deps.gate ?? rateGateFor(config.id, config.rateLimit?.requestsPerMinute ?? 60, config.rateLimit?.requestsPerDay);
  const nowMs = now().getTime();
  if (!gate.take(nowMs))
    return {
      status: "rate-limited",
      sourceId: config.id,
      retryAfterMs: gate.waitMsUntilAllowed(nowMs),
      detail: "the configured rate limit for this source is reached; nothing was sent",
    };

  const token = await fetchToken(config, fetchImpl, env);
  if ("why" in token) return { status: "unavailable", sourceId: config.id, detail: token.why };

  const endpoint = config.endpoint ?? "";
  if (!endpoint) return { status: "unavailable", sourceId: config.id, detail: "the config records no endpoint" };

  let body: Icd11Body;
  try {
    const url = `${endpoint}?q=${encodeURIComponent(trimmed)}&flatResults=true`;
    const response = await fetchImpl(url, {
      /* WHO's ICD API v2 answers only a request that names its API version and a language. */
      headers: { authorization: `Bearer ${token.token}`, accept: "application/json", "api-version": "v2", "accept-language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unavailable", sourceId: config.id, detail: `the search answered ${response.status}` };
    body = (await response.json()) as Icd11Body;
  } catch (error) {
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: `the search call failed (${error instanceof Error ? error.name : "unknown"})`,
    };
  }

  const entities = Array.isArray(body.destinationEntities) ? body.destinationEntities : [];
  const results: FederatedResult[] = [];
  entities.slice(0, MAX_RESULTS).forEach((entity, index) => {
    const title = deTag(typeof entity.title === "string" ? entity.title : "");
    if (!title) return;
    const code = codeShaped(entity.theCode);
    results.push({
      id: entityIdOf(entity, index, code),
      title,
      snippet: title,
      /* Rank-derived, like every adapter's: the source's own order is the claim, and there is no
         similarity number to pretend to. */
      score: Math.max(0.1, 0.9 - index * 0.15),
      codes: code ? { icd11: code } : {},
      citation: citationOf(
        { authority: config.authority ?? config.name ?? config.id, jurisdiction: config.jurisdiction },
        { licence: config.licensing?.licence, url: browseUrlOf(entity), sourceId: config.id },
      ),
      sourceId: config.id,
    });
  });
  return { status: "ok", sourceId: config.id, results };
}
