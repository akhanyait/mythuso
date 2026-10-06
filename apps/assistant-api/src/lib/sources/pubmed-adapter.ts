import { citationOf } from "../knowledge-provenance.ts";
import {
  federationSource,
  isSourceActive,
  outgoingTerm,
  type AdapterDeps,
  type AdapterOutcome,
  type FederatedResult,
} from "./config.ts";
import { rateGateFor } from "./rate-gate.ts";

/* The PubMed / Europe PMC adapter — dark by default, like every external source (packages/catalog/
   knowledge/federation.json).

   WHAT IT DOES. Search Europe PMC's index of PubMed and PMC literature for a topic and return only
   records with a checkable identifier — a PMID, a PMCID or a DOI — each with its title, journal,
   year and the opening of its own indexed abstract, never a rewritten summary and never a conclusion
   drawn from it. It has TWO callers over ONE governed source, which is the reason this file exists:
     - searchPubMed() serves the federation merge layer (provenance-carrying FederatedResult).
     - literatureCitations() serves the live literature_search tool.
   They share askEuropePmc, so they share the dark guard, the rate gate and the PHI redaction. That
   sharing is the whole point: before it, the tool kept its own fetch() to the same endpoint, so two
   paths reached one source and only one respected the 30-per-minute ceiling.

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
  authorString?: string;
  pubYear?: string;
  journalTitle?: string;
  abstractText?: string;
  license?: string;
};

type EuropePmcBody = {
  resultList?: { result?: EuropePmcRecord[] };
};

/* The licence condition federation.json records for this source: each article keeps its own licence,
   and only CC BY and CC0 text may be shown or reworded by a commercial service — CC BY-NC is not for one
   and CC BY-ND may not be adapted, and GilbertOne's answer rewords what it is given. A record under any
   other licence, or none, is handed over by its title and identifier alone. */
const textReusable = (licence: string | undefined): boolean =>
  /^\s*(?:cc[\s-]?by|cc0)\s*$/i.test(licence ?? "");

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

/* One ask of Europe PMC, with every guard in one place. Added 6 October 2026 when the
   literature_search tool was routed through this adapter: until then the tool made its own fetch() to
   this same endpoint, so two roads reached one governed source and only this one respected its
   30-per-minute ceiling, ran the query through outgoingTerm, or asked whether the source was dark at
   all. Both of this file's exported searches now come through here, which is what makes "the guard
   sits before the fetch" true of every road rather than of one.

   The order below is the order the boundary check asserts: config, dark, redaction, endpoint, rate
   gate, and only then a request. An outcome is a fact, never an exception — the caller decides what
   to say about it. */
type AskOutcome =
  | { ok: true; config: SourceConfig; records: EuropePmcRecord[] }
  | { ok: false; outcome: Omit<AdapterOutcome, { status: "ok" }> };

async function askEuropePmc(
  query: string,
  deps: AdapterDeps = {},
): Promise<AskOutcome> {
  const config = deps.config ?? federationSource(SOURCE_ID);
  if (!config)
    return {
      ok: false,
      outcome: {
        status: "unavailable",
        sourceId: SOURCE_ID,
        detail: "no config for this source in federation.json",
      },
    };
  if (!isSourceActive(config, deps.override))
    return {
      ok: false,
      outcome: {
        status: "dark",
        sourceId: config.id,
        detail: `${config.id} is dark (active: false, and the demonstration override does not open it) — activation requires the recorded licence and POPIA review, then a deliberate edit of federation.json`,
      },
    };

  const trimmed = outgoingTerm(query, MAX_QUERY_LENGTH);
  if (!trimmed)
    return {
      ok: false,
      outcome: {
        status: "unavailable",
        sourceId: config.id,
        detail: "no query was given; nothing left the process",
      },
    };

  const endpoint = config.endpoint ?? "";
  if (!endpoint)
    return {
      ok: false,
      outcome: {
        status: "unavailable",
        sourceId: config.id,
        detail: "the config records no endpoint",
      },
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
      ok: false,
      outcome: {
        status: "rate-limited",
        sourceId: config.id,
        retryAfterMs: gate.waitMsUntilAllowed(nowMs),
        detail:
          "the configured rate limit for this source is reached; nothing was sent",
      },
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
        ok: false,
        outcome: {
          status: "unavailable",
          sourceId: config.id,
          detail: `the search answered ${response.status}`,
        },
      };
    body = (await response.json()) as EuropePmcBody;
  } catch (error) {
    return {
      ok: false,
      outcome: {
        status: "unavailable",
        sourceId: config.id,
        detail: `the search call failed (${error instanceof Error ? error.name : "unknown"})`,
      },
    };
  }

  return {
    ok: true,
    config,
    records: Array.isArray(body.resultList?.result)
      ? (body.resultList?.result ?? [])
      : [],
  };
}

export async function searchPubMed(
  query: string,
  deps: AdapterDeps = {},
): Promise<AdapterOutcome> {
  const asked = await askEuropePmc(query, deps);
  if (!asked.ok) return asked.outcome;
  const { config, records } = asked;

  const results: FederatedResult[] = [];
  records.slice(0, MAX_RESULTS).forEach((record, index) => {
    const identifier = identifierOf(record);
    if (!identifier) return;
    const title = (record.title ?? "").trim() || "(title not indexed)";
    const year = (record.pubYear ?? "").trim() || "year not indexed";
    const journal = (record.journalTitle ?? "").trim();
    const abstract = textReusable(record.license) ? (record.abstractText ?? "").trim() : "";
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

/* ── The citation query the literature_search tool asks ────────────────────────────────────────

   Added 6 October 2026 with that tool's move onto this adapter. searchPubMed above answers the
   federation, which merges hits with local catalogue entries and so carries one flattened `snippet`;
   the tool answers a person asking what the literature says, and its whole promise is a citation you
   can go and check — title, authors, year, journal, identifier, and the page the identifier resolves
   to. Flattening those into a snippet to reuse searchPubMed would have cost the tool its authors, so
   this is the same ask, mapped to the fields a citation is made of.

   WHAT IT ADDS THAT THE TOOL DID NOT HAVE. The licence condition. The tool used to print any abstract
   opening Europe PMC indexed; federation.json records that each article keeps its own licence and that
   only CC BY and CC0 text may be shown or reworded by a commercial service, and textReusable() below
   is the one place that asks. A record under any other licence is handed over by its title, authors
   and identifier alone — still a real, checkable citation, and no longer text MyThuso had no licence
   to reproduce.

   DARK MEANS DARK HERE TOO, AND THAT IS THE POINT. This shares askEuropePmc, so while
   federation.json says "active": false and the demonstration override is not in force, the tool
   answers that the source is dark and sends nothing. It used to answer whatever Europe PMC answered,
   because nothing asked. That is the defect this function exists to end, not a regression. */

export type LiteratureCitation = {
  identifier: string;
  url: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  /* The abstract's own opening, and only when the record's licence permits showing it. Empty
     otherwise — never a placeholder that reads like the paper said nothing. */
  abstractOpening: string;
  licence: string;
};

export type LiteratureOutcome =
  | { status: "ok"; sourceId: string; citations: LiteratureCitation[] }
  | { status: "dark"; sourceId: string; detail: string }
  | { status: "rate-limited"; sourceId: string; retryAfterMs: number; detail: string }
  | { status: "unavailable"; sourceId: string; detail: string };

export async function literatureCitations(
  query: string,
  deps: AdapterDeps = {},
): Promise<LiteratureOutcome> {
  const asked = await askEuropePmc(query, deps);
  if (!asked.ok) return asked.outcome;
  const { config, records } = asked;

  const citations: LiteratureCitation[] = [];
  for (const record of records.slice(0, MAX_RESULTS)) {
    const identifier = identifierOf(record);
    /* A citation with nothing to check it against is not a citation this adapter hands over. */
    if (!identifier) continue;
    citations.push({
      identifier: identifier.id,
      url: identifier.url,
      title: (record.title ?? "").trim() || "(title not indexed)",
      authors: truncate((record.authorString ?? "").trim(), MAX_AUTHOR_LENGTH) ||
        "authors not indexed",
      year: (record.pubYear ?? "").trim() || "year not indexed",
      journal: (record.journalTitle ?? "").trim(),
      abstractOpening: textReusable(record.license)
        ? truncate((record.abstractText ?? "").trim(), ABSTRACT_SNIPPET_LENGTH)
        : "",
      licence: (record.license ?? "").trim() || "licence not indexed",
    });
  }
  return { status: "ok", sourceId: config.id, citations };
}
