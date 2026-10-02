import federation from "../../../../../packages/catalog/knowledge/federation.json" with { type: "json" };
import { redactPHI } from "../../../../../packages/gilbertone/src/phi.ts";
import { demonstrationOverride, overrideOpens, type DemonstrationOverride } from "../demonstration-override.ts";
import type { KnowledgeCode, SourceCitation } from "../knowledge-provenance.ts";
import type { RateGate } from "./rate-gate.ts";

/* The federation's own contract, read once: packages/catalog/knowledge/federation.json is the
   single place that says which external sources exist, what they may be used for, what their
   licence and rate limits are, and — the fact everything else here turns on — that every one of
   them starts dark ("active": false). Added on 22 September 2026 with the governed federation
   work; the adapters beside this file read their own config from here and refuse to operate while
   their source is dark.

   The types below describe the JSON loosely on purpose. The JSON is the authority (and
   scripts/check-boundaries.mjs validates its dark-by-default state on every build); these types
   exist so the TypeScript side reads it the same way twice, never so it can second-guess a missing
   field — a misspelt key here must degrade to a refusal, not to a crash. */

export type SourceRateLimit = {
  requestsPerMinute?: number;
  requestsPerDay?: number;
  maxConcurrent?: number;
  basis?: string;
};

export type SourceLicensing = {
  licence?: string;
  verdict?: string;
  attributionRequired?: boolean;
  attribution?: string;
  notes?: string;
};

export type SourceResidency = {
  hostedIn?: string;
  patientDataShared?: boolean;
  crossBorderTransferApproved?: boolean;
  notes?: string;
};

export type SourceConfig = {
  id: string;
  name?: string;
  authority?: string;
  role?: string;
  jurisdiction?: string;
  active?: boolean;
  activation?: string;
  endpoint?: string;
  auth?: Record<string, unknown>;
  rateLimit?: SourceRateLimit;
  licensing?: SourceLicensing;
  dataResidency?: SourceResidency;
  useFor?: string;
  notFor?: string;
  audience?: string;
};

export type FederationManifest = {
  version?: number;
  name?: string;
  compiledOn?: string;
  reviewHorizonMonths?: number;
  policy?: {
    darkByDefault?: boolean;
    statement?: string;
    activationRequires?: string;
    popiaNote?: string;
  };
  evidenceGrades?: Record<string, string>;
  licenceVerdicts?: Record<string, { mayActivate?: boolean; requiresPermissionRecord?: boolean }>;
  abstention?: Record<string, string>;
  scope?: { approved?: string[]; excluded?: string[]; statement?: string };
  sources?: SourceConfig[];
};

/* One external search hit, as the federation's merge step consumes it: the source's own text plus
   the provenance the adapter attached — never a bare string a caller could mistake for local
   catalogue text. */
export type FederatedResult = {
  id: string;
  title: string;
  snippet: string;
  score: number;
  codes: KnowledgeCode;
  citation: SourceCitation;
  sourceId: string;
};

/* What one adapter call answers. An outcome is a fact, not an error: "dark" is the designed state
   of every source today, "rate-limited" and "unavailable" are the two ways a live source can
   decline without the caller guessing, and "ok" carries results that may honestly be empty. No
   adapter ever throws — the merge layer must be able to say what happened, per source, without a
   try/catch of its own. */
export type AdapterOutcome =
  | { status: "dark"; sourceId: string; detail: string }
  | { status: "rate-limited"; sourceId: string; retryAfterMs: number; detail: string }
  | { status: "unavailable"; sourceId: string; detail: string }
  | { status: "ok"; sourceId: string; results: FederatedResult[] };

/* What every adapter accepts besides its query. Production passes nothing: the real config, the
   real fetch, the real clock and the shared rate gate. Tests inject an activated copy of the
   config, a stub fetch and a small gate — the same dependency-injection seam knowledge.ts keeps
   for Qdrant, so the dark path every deployment takes is the one that runs when nobody overrides
   anything. */
export type AdapterDeps = {
  config?: SourceConfig;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  gate?: RateGate;
  env?: { [key: string]: string | undefined };
  /* The founder's demonstration override (packages/catalog/demonstration-override.json). Production
     passes nothing and reads the contract; a test passes a closed copy to prove the go-live path. */
  override?: DemonstrationOverride;
};

export const federationManifest = (): FederationManifest => federation as FederationManifest;

export const federationSources = (): SourceConfig[] => {
  const sources = federationManifest().sources;
  return Array.isArray(sources) ? sources.filter((source) => source && typeof source.id === "string") : [];
};

export const federationSource = (id: string): SourceConfig | null =>
  federationSources().find((source) => source.id === id) ?? null;

/* Whether a source's licence lets the demonstration override open it: a verdict that may activate and
   needs no written permission on file. Asked here as well as by the build, so an override that listed a
   permission-required source by mistake would still find it dark — a licence is law, not a gate the
   founder can stand in for. */
export const licencePermitsDemonstration = (source: SourceConfig | null): boolean => {
  const verdict = federationManifest().licenceVerdicts?.[source?.licensing?.verdict ?? ""];
  return verdict?.mayActivate === true && verdict.requiresPermissionRecord !== true;
};

/* The one question every adapter asks first. A source answers when it is signed — its own "active":
   true, which federation.json's validator allows only with both signatures — or when the founder's
   demonstration override of 2 October 2026 lists it, is in force, and its licence permits. Anything
   else is dark. Going live sets the override's inForce to false, and this answers as it did before. */
export const isSourceActive = (
  source: SourceConfig | null,
  override: DemonstrationOverride = demonstrationOverride(),
): boolean =>
  source?.active === true ||
  (source !== null && overrideOpens(`knowledge-source:${source.id}`, override) && licencePermitsDemonstration(source));

/* On, and on only because of the override: what a surface marks with the disclaimer. */
export const openedByDemonstration = (
  source: SourceConfig | null,
  override: DemonstrationOverride = demonstrationOverride(),
): boolean => source?.active !== true && isSourceActive(source, override);

/* What leaves the process for a source: the topic words, through the same redaction every model call
   gets, whitespace folded and capped. Never the person's sentence untouched, even though the tool that
   calls an adapter is handed a topic rather than a message. */
export const outgoingTerm = (query: string, max: number): string =>
  redactPHI(query ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* A term safe to place inside a query language (openFDA's search syntax, SPARQL's string literal):
   letters, digits, spaces, hyphens and apostrophes, and nothing a query language could read as
   syntax. Losing punctuation costs a search nothing; an injected quote costs the query its meaning. */
export const plainTerm = (term: string): string =>
  term.normalize("NFC").replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").trim();

/* The OpenFDA interaction config, read from federation.json but with its `active` flag overridden
   by the OPENFDA_ENABLED env var at runtime. The federation.json entry stays dark ("active": false)
   because the JSON is the governed artefact; the env var is the deployment's own switch, so a
   deployment that has not set it gets the same dark-by-default behaviour the JSON records.

   baseUrl, rateLimitPerMinute and timeoutMs are the interaction-endpoint-specific settings the
   drug-check tool reads through the adapter — separate from the label-search config the existing
   searchOpenFda() function uses, because the interaction endpoint has a different path and the
   deployment may want a different ceiling for it. */
export type OpenFdaInteractionConfig = {
  active: boolean;
  baseUrl: string;
  rateLimitPerMinute: number;
  timeoutMs: number;
  apiKey: string;
};

export function openFdaInteractionConfig(
  env: { [key: string]: string | undefined } = process.env,
): OpenFdaInteractionConfig {
  const source = federationSource("openfda");
  return {
    active: env.OPENFDA_ENABLED === "true" && source !== null,
    baseUrl: "https://api.fda.gov",
    rateLimitPerMinute: 120,
    timeoutMs: 4000,
    apiKey: env.OPENFDA_API_KEY ?? "",
  };
}

/* The abstention sentences, read from the manifest so the surface and the tests quote one text. */
export const abstentionSentence = (kind: string): string =>
  federationManifest().abstention?.[kind] ??
  "MyThuso's knowledge base cannot answer this, and it says so rather than guessing — a nurse or doctor can help.";

/* The env var name a source's auth block records, or "" when it records none. The value itself is
   only ever read at the call site, and never logged, echoed or returned in an outcome detail. */
export const authEnvName = (source: SourceConfig, key: string): string => {
  const name = source.auth?.[key];
  return typeof name === "string" ? name : "";
};

/* A read-only snapshot for surfaces and checks that need to state the federation's posture without
   reaching for the JSON themselves. */
export const federationState = (): {
  darkByDefault: boolean;
  sources: { id: string; active: boolean; role?: string; licence?: string; crossBorderTransferApproved?: boolean }[];
} => ({
  darkByDefault: federationManifest().policy?.darkByDefault === true,
  sources: federationSources().map((source) => ({
    id: source.id,
    active: source.active === true,
    role: source.role,
    licence: source.licensing?.licence,
    crossBorderTransferApproved: source.dataResidency?.crossBorderTransferApproved,
  })),
});
