import { citationOf } from "../knowledge-provenance.ts";
import {
  federationSource,
  isSourceActive,
  type AdapterDeps,
  type AdapterOutcome,
  type FederatedResult,
} from "./config.ts";
import { rateGateFor } from "./rate-gate.ts";

/* The PubMed / Europe PMC adapter — dark by default, like every external source (packages/catalog/
   knowledge/federation.json).

   WHAT IT WOULD DO WHEN ACTIVE. Search Europe PMC's index of PubMed and PMC literature for a topic
   and return only records with a checkable identifier — a PMID, a PMCID or a DOI — each with its
   title, journal, year and the opening of its own indexed abstract, never a rewritten summary and
   never a conclusion drawn from it. This is the same discipline the live literature_search tool
   already practises with the same endpoint; what the adapter adds is the federation's structure: a
   per-source config, a rate gate, provenance on every result, and an outcome the merge layer can
   report instead of an exception. (The tool keeps its own call path unchanged — this adapter is the
   federation's road, and it stays dark until someone deliberately opens it.)

   DARK MEANS DARK. searchPubMed() reads its config and refuses when the source is not explicitly
   active — before the rate gate, before the URL, before any request. No credentials exist for this
   source (Europe PMC is keyless), so there is nothing an environment could arm by accident.

   THE SHAPE OF THE CALL, WRITTEN BUT UNSPENT. The endpoint, query parameters and response shape
   follow Europe PMC's REST documentation and mirror the literature tool's own call; while the
   source is dark this path runs only under an injected test config, and the politeness rules the
   config records (a named User-Agent, a 30-per-minute self-imposed ceiling) apply the day it is
   activated. */

const SOURCE_ID = "pubmed-europepmc";
const TIMEOUT_MS = 4000;
const MAX_RESULTS = 5;
const MAX_QUERY_LENGTH = 200;
const ABSTRACT_SNIPPET_LENGTH = 220;
/* The same politeness the literature tool sends: a caller that names itself is a caller a provider
   can throttle precisely instead of banning broadly. */
const USER_AGENT =
  "MyThuso-assistant/0.1 (knowledge federation; contact: hello@mythuso.co.za)";

type EuropePmcRecord = {
  id?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  pubYear?: string;
  journalTitle?: string;
  abstractText?: string;
};

type EuropePmcBody = {
  resultList?: { result?: EuropePmcRecord[] };
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;

/* The identifier that makes a record checkable, and the stable id and URL built from it. A record
   with none of the three is not a citation this adapter hands over. */
const identifierOf = (
  record: EuropePmcRecord,
): { id: string; url: string } | null => {
  if (typeof record.pmid === "string" && record.pmid)
    return {
      id: `PMID:${record.pmid}`,
      url: `https://europepmc.org/article/MED/${record.pmid}`,
    };
  if (typeof record.pmcid === "string" && record.pmcid)
    return {
      id: record.pmcid,
      url: `https://europepmc.org/article/PMC/${record.pmcid}`,
    };
  if (typeof record.doi === "string" && record.doi)
    return { id: `DOI:${record.doi}`, url: `https://doi.org/${record.doi}` };
  return null;
};

export async function searchPubMed(
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
      detail: `${config.id} is dark (active: false) — activation requires the recorded licence and POPIA review, then a deliberate edit of federation.json`,
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
  const now = deps.now ?? (() => new Date());
  const gate =
    deps.gate ??
    rateGateFor(
      config.id,
      config.rateLimit?.requestsPerMinute ?? 30,
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

  let body: EuropePmcBody;
  try {
    const url = `${endpoint}?query=${encodeURIComponent(trimmed)}&format=json&pageSize=${MAX_RESULTS}&resultType=core`;
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok)
      return {
        status: "unavailable",
        sourceId: config.id,
        detail: `the search answered ${response.status}`,
      };
    body = (await response.json()) as EuropePmcBody;
  } catch (error) {
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: `the search call failed (${error instanceof Error ? error.name : "unknown"})`,
    };
  }

  const records = Array.isArray(body.resultList?.result)
    ? (body.resultList?.result ?? [])
    : [];
  const results: FederatedResult[] = [];
  records.slice(0, MAX_RESULTS).forEach((record, index) => {
    const identifier = identifierOf(record);
    if (!identifier) return;
    const title = (record.title ?? "").trim() || "(title not indexed)";
    const year = (record.pubYear ?? "").trim() || "year not indexed";
    const journal = (record.journalTitle ?? "").trim();
    const abstract = (record.abstractText ?? "").trim();
    results.push({
      id: `${SOURCE_ID}:${identifier.id}`,
      title,
      snippet: truncate(
        abstract
          ? `${abstract} (${year}${journal ? `, ${journal}` : ""}). ${identifier.id}.`
          : `${year}${journal ? `, ${journal}` : ""}. ${identifier.id}.`,
        ABSTRACT_SNIPPET_LENGTH,
      ),
      score: Math.max(0.1, 0.9 - index * 0.15),
      codes: {},
      citation: citationOf(
        {
          authority: config.authority ?? config.name ?? config.id,
          jurisdiction: config.jurisdiction,
        },
        {
          licence: config.licensing?.licence,
          url: identifier.url,
          sourceId: config.id,
        },
      ),
      sourceId: config.id,
    });
  });
  return { status: "ok", sourceId: config.id, results };
}
