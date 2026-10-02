import { citationOf } from "../knowledge-provenance.ts";
import {
  authEnvName,
  federationSource,
  isSourceActive,
  outgoingTerm,
  plainTerm,
  openFdaInteractionConfig,
  type AdapterDeps,
  type AdapterOutcome,
  type FederatedResult,
} from "./config.ts";
import { rateGateFor } from "./rate-gate.ts";

/* The openFDA adapter — dark by default, like every external source (packages/catalog/knowledge/
   federation.json).

   WHAT IT WOULD DO WHEN ACTIVE. Look a medicine's name up in openFDA's drug-label index and return
   the US regulator's own label records, each attributed to openFDA and paired — by the federation's
   own notFor rule — with the understanding that US label wording never stands alone as SA guidance.
   The results carry no terminology codes: openFDA label records are not coded with SNOMED CT,
   ICD-11 or LOINC, and inventing a mapping from a brand name to a code is precisely the fabrication
   the catalogue's codes field is built to prevent.

   DARK MEANS DARK. searchOpenFda() reads its config and refuses when the source is not explicitly
   active — before the rate gate, before the URL, before the optional API key is read. An unset
   OPENFDA_API_KEY never blocks activation (openFDA needs none), and a set one is appended to the
   request URL at call time and never logged.

   THE SHAPE OF THE CALL, WRITTEN BUT UNSPENT. The endpoint, its search syntax and the response
   shape below follow openFDA's own documentation; the request URL additionally carries `limit` and,
   when configured, `api_key`. While the source is dark this path can only run under an injected
   test config, and the live shape is re-verified at activation — recorded in the config's own
   activation note. */

const SOURCE_ID = "openfda";
const TIMEOUT_MS = 4000;
const MAX_RESULTS = 5;
const MAX_QUERY_LENGTH = 200;
const SNIPPET_LENGTH = 240;

type OpenFdaRecord = {
  id?: string;
  set_id?: string;
  openfda?: { brand_name?: unknown; generic_name?: unknown };
  indications_and_usage?: unknown;
  warnings?: unknown;
  boxed_warning?: unknown;
  dosage_and_administration?: unknown;
};

type OpenFdaBody = {
  results?: OpenFdaRecord[];
};

const firstString = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value)
      if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;

export async function searchOpenFda(
  query: string,
  deps: AdapterDeps = {},
): Promise<AdapterOutcome> {
  const config = deps.config ?? federationSource(SOURCE_ID);
  if (!config)
    return {
      status: "unavailable",
      sourceId: SOURCE_ID,
      detail: "no config for this source in federation.json",
    };
  if (!isSourceActive(config, deps.override))
    return {
      status: "dark",
      sourceId: config.id,
      detail: `${config.id} is dark (active: false, and the demonstration override does not open it) — activation requires the recorded licence and POPIA review, and a deliberate edit of federation.json`,
    };

  const trimmed = outgoingTerm(query, MAX_QUERY_LENGTH);
  if (!trimmed)
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: "no query was given; nothing left the process",
    };

  const endpoint = config.endpoint ?? "";
  if (!endpoint)
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: "the config records no endpoint",
    };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const gate =
    deps.gate ??
    rateGateFor(
      config.id,
      config.rateLimit?.requestsPerMinute ?? 240,
      config.rateLimit?.requestsPerDay,
    );
  const nowMs = now().getTime();
  if (!gate.take(nowMs))
    return {
      status: "rate-limited",
      sourceId: config.id,
      retryAfterMs: gate.waitMsUntilAllowed(nowMs),
      detail:
        "the configured rate limit for this source is reached; nothing was sent",
    };

  const apiKeyEnv = authEnvName(config, "apiKeyEnv");
  const apiKey = apiKeyEnv ? (env[apiKeyEnv] ?? "") : "";

  let body: OpenFdaBody;
  try {
    /* The term is searched as a medicine's generic or brand name — openFDA reads a space between two
       clauses as OR — because a bare phrase matches every label whose warnings merely mention it (asked
       for ibuprofen, it answered with naproxen's label on 2 October 2026). The term is reduced to plain
       words first, so nothing in it is read as search syntax; `limit` caps the response, and the
       optional key rides the query string exactly as openFDA's documentation specifies. */
    const term = plainTerm(trimmed);
    if (!term)
      return { status: "unavailable", sourceId: config.id, detail: "the term carried no plain words; nothing left the process" };
    const params = new URLSearchParams({
      search: `openfda.generic_name:"${term}" openfda.brand_name:"${term}"`,
      limit: String(MAX_RESULTS),
    });
    if (apiKey) params.set("api_key", apiKey);
    const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    /* openFDA answers a search that matched nothing with 404 NOT_FOUND: an honest empty answer, not an
       outage. */
    if (response.status === 404) return { status: "ok", sourceId: config.id, results: [] };
    if (!response.ok)
      return {
        status: "unavailable",
        sourceId: config.id,
        detail: `the search answered ${response.status}`,
      };
    body = (await response.json()) as OpenFdaBody;
  } catch (error) {
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: `the search call failed (${error instanceof Error ? error.name : "unknown"})`,
    };
  }

  const records = Array.isArray(body.results) ? body.results : [];
  const results: FederatedResult[] = [];
  records.slice(0, MAX_RESULTS).forEach((record, index) => {
    const generic = firstString(record.openfda?.generic_name);
    const brand = firstString(record.openfda?.brand_name);
    const title = generic || brand;
    if (!title) return;
    /* Never the label's dosage section: federation.json's notFor for this source refuses any dose
       answer, and a US dose read to a South African patient is the harm that line exists to stop. */
    const snippetSource =
      firstString(record.boxed_warning) ||
      firstString(record.warnings) ||
      firstString(record.indications_and_usage);
    const recordId =
      typeof record.id === "string" && record.id ? record.id : "";
    results.push({
      id: `${SOURCE_ID}:${recordId || `label-${index + 1}`}`,
      title:
        brand && generic && brand !== generic ? `${generic} (${brand})` : title,
      snippet: truncate(snippetSource || title, SNIPPET_LENGTH),
      score: Math.max(0.1, 0.85 - index * 0.15),
      /* Deliberately empty: a US label record maps to no SNOMED CT, ICD-11 or LOINC code, and this
         adapter will not invent one. */
      codes: {},
      citation: citationOf(
        {
          authority: config.authority ?? config.name ?? config.id,
          jurisdiction: config.jurisdiction,
        },
        {
          licence: config.licensing?.licence,
          url: recordId
            ? `${endpoint}?search=${encodeURIComponent(`id:"${recordId}"`)}`
            : undefined,
          sourceId: config.id,
        },
      ),
      sourceId: config.id,
    });
  });
  return { status: "ok", sourceId: config.id, results };
}

/* ── Drug-interaction query ─────────────────────────────────────────────────────────────────────

   WHAT openFDA PUBLISHES, AND THEREFORE WHAT THIS ASKS. openFDA has no interaction endpoint: its drug
   APIs are event, label, ndc, enforcement, drugsfda, orangebook and drugshortages
   (open.fda.gov/apis/drug, read 2 October 2026). Until that day this function asked an
   "interaction" path under drug/, which does not exist — every call answered 404, and was silently
   empty — and joined its two names with plus-AND-plus inside URLSearchParams, which encodes the plus
   signs (%2BAND%2B), so even a real endpoint would have read one literal phrase rather than two
   clauses. Co-reported medicines in the adverse-event index would not have been an interaction
   either: two drugs on one report is a coincidence of a patient's list, not a finding.

   The published source for "does the regulator's label say these two interact" is the label's own
   `drug_interactions` section, in the same drug/label index searchOpenFda() reads. So this asks
   drug/label for medicine A's labels whose interactions section names medicine B, and then the other
   way round when A's labels say nothing. AND is written as a space-delimited ` AND `, which
   URLSearchParams encodes as `+AND+` — openFDA's documented syntax (open.fda.gov/apis/query-syntax).

   WHAT IT WILL NOT RELAY. A label's interactions section is full of dose instructions ("reduce the
   dose of…", "do not exceed 10 mg"), and federation.json's notFor for this source refuses any dose
   answer: a US dose read to a South African patient is the harm that line exists to stop. So only the
   sentences that name the other medicine and carry no dosing word are quoted; when every such
   sentence is about dose, the result says the label names the pair and that its wording is not
   relayed. Every result is attributed to openFDA as US labelling, and the label grades no severity,
   so none is invented: it reads "not graded".

   DARK BY DEFAULT, LIKE EVERYTHING ELSE. queryInteractions() reads openFdaInteractionConfig(),
   which gates on OPENFDA_ENABLED === 'true'. When the env var is unset (every deployment today),
   the function returns an empty array without touching the network. Both terms pass through
   outgoingTerm() and plainTerm(), as the label search's does, so only plain medicine words leave.

   SILENT ON EVERY FAILURE. Network error, timeout, non-200 (openFDA answers a search that matched
   nothing with 404), malformed JSON, missing fields — all return an empty array. The drug-check tool
   treats an empty array as "openFDA had nothing", which is honest: the tool's own local pairs still
   stand, and the "no record is never safe" invariant is preserved by the caller, not by this
   adapter. */

export type InteractionResult = {
  drug1: string;
  drug2: string;
  severity: string;
  effect: string;
  recommendation: string;
  source: string;
};

type OpenFdaLabelInteractionRecord = {
  id?: string;
  openfda?: { generic_name?: unknown; brand_name?: unknown };
  drug_interactions?: unknown;
};

type OpenFdaLabelInteractionBody = {
  results?: OpenFdaLabelInteractionRecord[];
};

const INTERACTION_MAX_RESULTS = 5;
const INTERACTION_GATE_ID = "openfda-interaction";
const INTERACTION_TERM_LENGTH = 80;

/* The label grades nothing, so the result says so rather than borrowing a word that sounds like a
   grade. */
export const OPENFDA_LABEL_SEVERITY = "not graded (US label)";
export const OPENFDA_LABEL_SOURCE =
  "openFDA drug label, US Food and Drug Administration (api.fda.gov/drug/label.json) — US labelling, not South African guidance";

/* Any sentence carrying one of these is a dose instruction, and is never quoted. Broad on purpose — a
   sentence wrongly withheld costs a quote, a dose wrongly relayed costs a patient — but not so broad
   that "may increase the effect of" is withheld: that sentence is the interaction itself. */
const DOSING =
  /(?:\b(?:dose|doses|dosage|dosages|dosing|overdosage|mg|mcg|mg\/kg|milligrams?|micrograms?|titrat\w*|units?)\b|µg)/i;

const allStrings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* A medicine's name as a whole word, any case. */
const mentionOf = (term: string): RegExp => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");

/* The sentences of a label's interactions section that name `other` and carry no dosing word. */
export const interactionSentences = (section: string, other: string): string[] => {
  const name = mentionOf(other);
  return section
    .replace(/\s+/g, " ")
    .split(/(?<=[.;])\s+(?=[A-Z(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => name.test(sentence) && !DOSING.test(sentence));
};

export async function queryInteractions(
  drugA: string,
  drugB: string,
  deps: Pick<AdapterDeps, "fetchImpl" | "env" | "now"> = {},
): Promise<InteractionResult[]> {
  const config = openFdaInteractionConfig(deps.env ?? process.env);
  if (!config.active) return [];

  const a = plainTerm(outgoingTerm(drugA ?? "", INTERACTION_TERM_LENGTH));
  const b = plainTerm(outgoingTerm(drugB ?? "", INTERACTION_TERM_LENGTH));
  if (!a || !b) return [];

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  /* Rate-limit through the shared gate. The gate ID is separate from the label-search gate so
     the two callers' budgets do not interfere with each other; each direction is one request. */
  const gate = rateGateFor(INTERACTION_GATE_ID, config.rateLimitPerMinute);

  const ask = async (labelOf: string, naming: string): Promise<InteractionResult[]> => {
    const nowMs = now().getTime();
    if (!gate.take(nowMs)) return [];
    const params = new URLSearchParams({
      search: `openfda.generic_name:"${labelOf}" AND drug_interactions:"${naming}"`,
      limit: String(INTERACTION_MAX_RESULTS),
    });
    if (config.apiKey) params.set("api_key", config.apiKey);

    let body: OpenFdaLabelInteractionBody;
    try {
      const response = await fetchImpl(`${config.baseUrl}/drug/label.json?${params.toString()}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) return [];
      body = (await response.json()) as OpenFdaLabelInteractionBody;
    } catch {
      return [];
    }

    const records = Array.isArray(body?.results) ? body.results : [];
    const results: InteractionResult[] = [];
    const seen = new Set<string>();
    for (const record of records.slice(0, INTERACTION_MAX_RESULTS)) {
      const section = allStrings(record.drug_interactions).join(" ");
      if (!mentionOf(naming).test(section)) continue;
      const labelName = firstString(record.openfda?.generic_name) || labelOf;
      const quoted = interactionSentences(section, naming);
      const effect = quoted.length
        ? `The US label for ${labelName} says: "${truncate(quoted.join(" "), SNIPPET_LENGTH)}"`
        : `The US label for ${labelName} names ${naming} in its drug-interactions section. Its wording there is about dose, which MyThuso does not relay.`;
      /* Many manufacturers file one generic's label; the same words twice are one finding. */
      if (seen.has(effect)) continue;
      seen.add(effect);
      results.push({
        drug1: labelName,
        drug2: naming,
        severity: OPENFDA_LABEL_SEVERITY,
        effect,
        recommendation:
          "This is US FDA label wording, not South African guidance and not clinical advice. " +
          "A pharmacist, nurse or doctor should be consulted before combining these medicines.",
        source: OPENFDA_LABEL_SOURCE,
      });
    }
    return results;
  };

  const forward = await ask(a, b);
  return forward.length ? forward : ask(b, a);
}
