import federation from "../../../../../packages/catalog/knowledge/federation.json" with { type: "json" };
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
  attributionRequired?: boolean;
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
};

export const federationManifest = (): FederationManifest => federation as FederationManifest;

export const federationSources = (): SourceConfig[] => {
  const sources = federationManifest().sources;
  return Array.isArray(sources) ? sources.filter((source) => source && typeof source.id === "string") : [];
};

export const federationSource = (id: string): SourceConfig | null =>
  federationSources().find((source) => source.id === id) ?? null;

/* The one question every adapter asks first. Anything but an explicit true is dark. */
export const isSourceActive = (source: SourceConfig | null): boolean => source?.active === true;

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
