import { citationOf } from "../knowledge-provenance.ts";
import {
  authEnvName,
  federationSource,
  isSourceActive,
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
  if (!isSourceActive(config))
    return {
      status: "dark",
      sourceId: config.id,
      detail: `${config.id} is dark (active: false) — activation requires the recorded licence and POPIA review, and a deliberate edit of federation.json`,
    };

  const trimmed = (query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
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
    /* The quoted phrase searches the label corpus for the term as written; `limit` caps the response
       where openFDA allows it, and the optional key rides the query string exactly as openFDA's
       documentation specifies. */
    const params = new URLSearchParams({
      search: `"${trimmed}"`,
      limit: String(MAX_RESULTS),
    });
    if (apiKey) params.set("api_key", apiKey);
    const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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
    const snippetSource =
      firstString(record.boxed_warning) ||
      firstString(record.warnings) ||
      firstString(record.indications_and_usage) ||
      firstString(record.dosage_and_administration);
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

   The interaction endpoint is a separate call from the label search above. It queries openFDA's
   adverse-event-report index for reports where two named medicines appear together, and returns
   what the reports record — never a clinical judgement.

   DARK BY DEFAULT, LIKE EVERYTHING ELSE. queryInteractions() reads openFdaInteractionConfig(),
   which gates on OPENFDA_ENABLED === 'true'. When the env var is unset (every deployment today),
   the function returns an empty array without touching the network.

   SILENT ON EVERY FAILURE. Network error, timeout, non-200, malformed JSON, missing fields —
   all return an empty array. The drug-check tool treats an empty array as "OpenFDA had nothing",
   which is honest: the tool's own local pairs still stand, and the "no record is never safe"
   invariant is preserved by the caller, not by this adapter. */

export type InteractionResult = {
  drug1: string;
  drug2: string;
  severity: string;
  effect: string;
  recommendation: string;
  source: string;
};

type OpenFdaInteractionReport = {
  patient?: {
    drug?: {
      medicinalproduct?: string;
      openfda?: { pharm_class_epc?: unknown };
    }[];
    reaction?: { reactionmeddrapt?: string }[];
  };
};

type OpenFdaInteractionBody = {
  results?: OpenFdaInteractionReport[];
};

const INTERACTION_MAX_RESULTS = 5;
const INTERACTION_GATE_ID = "openfda-interaction";

/* Pull the first string out of a pharm_class_epc array (openFDA returns it as string[]). */
const firstPharmClass = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value)
      if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
};

export async function queryInteractions(
  drugA: string,
  drugB: string,
): Promise<InteractionResult[]> {
  const config = openFdaInteractionConfig();
  if (!config.active) return [];

  const a = (drugA ?? "").trim();
  const b = (drugB ?? "").trim();
  if (!a || !b) return [];

  /* Rate-limit through the shared gate. The gate ID is separate from the label-search gate so
     the two endpoints' budgets do not interfere with each other. */
  const gate = rateGateFor(INTERACTION_GATE_ID, config.rateLimitPerMinute);
  const nowMs = Date.now();
  if (!gate.take(nowMs)) return [];

  const params = new URLSearchParams();
  params.set("search", `${a}+AND+${b}`);
  params.set("limit", String(INTERACTION_MAX_RESULTS));
  if (config.apiKey) params.set("api_key", config.apiKey);

  const url = `${config.baseUrl}/drug/interaction.json?${params.toString()}`;

  let body: OpenFdaInteractionBody;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) return [];
    body = (await response.json()) as OpenFdaInteractionBody;
  } catch {
    return [];
  }

  const reports = Array.isArray(body.results) ? body.results : [];
  const results: InteractionResult[] = [];

  for (const report of reports.slice(0, INTERACTION_MAX_RESULTS)) {
    const patient = report.patient;
    if (!patient) continue;

    /* Collect the drug names the report actually records, so the result names the pair the
       report is about rather than echoing back whatever the caller typed. */
    const drugs = patient.drug ?? [];
    const names = drugs
      .map((d) => (d.medicinalproduct ?? "").trim())
      .filter(Boolean)
      .slice(0, 2);
    if (names.length < 2) continue;

    /* The reaction text is what the adverse-event report recorded — it is a reported outcome,
       never a clinical prediction. */
    const reactions = (patient.reaction ?? [])
      .map((r) => (r.reactionmeddrapt ?? "").trim())
      .filter(Boolean);
    const effect = reactions.length
      ? `Adverse event report: ${reactions.join(", ")}`
      : "Adverse event report recorded";

    /* The pharm class from the first drug that carries one — context for the report, not a
       severity grading. */
    const pharmClass = drugs
      .map((d) => firstPharmClass(d.openfda?.pharm_class_epc))
      .find(Boolean) ?? "";

    const severity = pharmClass ? "REPORTED" : "REPORTED";
    const description = pharmClass
      ? `${effect} (pharmacological class: ${pharmClass})`
      : effect;

    results.push({
      drug1: names[0],
      drug2: names[1],
      severity,
      effect: description,
      recommendation:
        "This is an adverse event report from the US FDA database, not clinical guidance. " +
        "A pharmacist, nurse or doctor should be consulted before combining these medicines.",
      source: "openfda.gov/drug/interaction",
    });
  }

  return results;
}
