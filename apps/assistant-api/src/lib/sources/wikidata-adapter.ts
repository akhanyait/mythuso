import { citationOf } from "../knowledge-provenance.ts";
import {
  federationSource,
  isSourceActive,
  outgoingTerm,
  plainTerm,
  type AdapterDeps,
  type AdapterOutcome,
  type FederatedResult,
} from "./config.ts";
import { rateGateFor } from "./rate-gate.ts";

/* The Wikidata adapter, written on 2 October 2026 when the founder's demonstration override opened the
   source (packages/catalog/demonstration-override.json). Dark whenever neither the source's own
   signatures nor the override open it.

   WHAT IT DOES. Asks Wikidata's query service for the items whose English label matches a term and that
   carry a medical identifier — an ICD-11 foundation id, a SNOMED CT id or a MeSH descriptor — and
   returns each one's labels in isiZulu, isiXhosa, Afrikaans and Sesotho beside those identifiers. That
   is exactly what federation.json records the source as being for: labels, synonyms and
   cross-references.

   WHAT IT WILL NOT DO. Wikidata is crowd-sourced, so nothing it returns is a health statement, and the
   result says that its labels have not been checked by a first-language reviewer. Its identifiers are
   not written into a result's codes: a code the catalogue carries was verified against its issuing
   authority, and a crowd-sourced one is a lead, not a verification, so it rides in the text only. The
   term is reduced to plain words before it is placed in the query, so nothing a person typed is read as
   SPARQL; and the User-Agent names the deployment and a contact address, as Wikimedia's policy requires.

   THE SHAPE OF THE CALL. GET query.wikidata.org/sparql?query=… with the EntitySearch service, answered
   as SPARQL JSON results (checked by hand on 2 October 2026: "diabetes" answered Q12206 with
   "isifo sikashukela", "suikersiekte" and "Lefu la Tswekere"). */

const SOURCE_ID = "wikidata";
const TIMEOUT_MS = 4000;
const MAX_RESULTS = 3;
const MAX_QUERY_LENGTH = 80;
const USER_AGENT = "MyThuso-assistant/0.1 (https://mythuso.co.za; hello@mythuso.co.za) knowledge federation";
const LANGUAGES: readonly (readonly [string, string])[] = [
  ["zu", "isiZulu"],
  ["xh", "isiXhosa"],
  ["af", "Afrikaans"],
  ["st", "Sesotho"],
];
const IDENTIFIERS: readonly (readonly [string, string, string])[] = [
  ["icd11", "P7807", "ICD-11 foundation"],
  ["snomed", "P5806", "SNOMED CT"],
  ["mesh", "P486", "MeSH"],
];

type Binding = Record<string, { value?: string } | undefined>;
type SparqlBody = { results?: { bindings?: Binding[] } };

/* The query, built around a term that is already plain words: no quote, backslash or brace can reach
   the string literal it sits in. */
export const wikidataQuery = (term: string): string =>
  [
    `SELECT ?item ?en ${LANGUAGES.map(([code]) => `?${code}`).join(" ")} ${IDENTIFIERS.map(([name]) => `?${name}`).join(" ")} WHERE {`,
    "  SERVICE wikibase:mwapi {",
    '    bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";',
    `      mwapi:search "${term}"; mwapi:language "en"; mwapi:limit "5".`,
    "    ?item wikibase:apiOutputItem mwapi:item.",
    "  }",
    `  FILTER EXISTS { ?item ${IDENTIFIERS.map(([, property]) => `wdt:${property}`).join("|")} [] }`,
    '  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }',
    ...LANGUAGES.map(([code]) => `  OPTIONAL { ?item rdfs:label ?${code} FILTER(LANG(?${code}) = "${code}") }`),
    ...IDENTIFIERS.map(([name, property]) => `  OPTIONAL { ?item wdt:${property} ?${name} }`),
    "}",
    "LIMIT 30",
  ].join("\n");

export async function searchWikidata(query: string, deps: AdapterDeps = {}): Promise<AdapterOutcome> {
  const config = deps.config ?? federationSource(SOURCE_ID);
  if (!config) return { status: "unavailable", sourceId: SOURCE_ID, detail: "no config for this source in federation.json" };
  if (!isSourceActive(config, deps.override))
    return {
      status: "dark",
      sourceId: config.id,
      detail: `${config.id} is dark (active: false, and the demonstration override does not open it) — activation requires both signatures and a recorded POPIA review or a local copy of the data`,
    };

  const term = plainTerm(outgoingTerm(query, MAX_QUERY_LENGTH));
  if (!term) return { status: "unavailable", sourceId: config.id, detail: "no plain words were given; nothing left the process" };
  const endpoint = config.endpoint ?? "";
  if (!endpoint) return { status: "unavailable", sourceId: config.id, detail: "the config records no endpoint" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const gate = deps.gate ?? rateGateFor(config.id, config.rateLimit?.requestsPerMinute ?? 10, config.rateLimit?.requestsPerDay);
  const nowMs = now().getTime();
  if (!gate.take(nowMs))
    return {
      status: "rate-limited",
      sourceId: config.id,
      retryAfterMs: gate.waitMsUntilAllowed(nowMs),
      detail: "the configured rate limit for this source is reached; nothing was sent",
    };

  let body: SparqlBody;
  try {
    const params = new URLSearchParams({ query: wikidataQuery(term), format: "json" });
    const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
      headers: { accept: "application/sparql-results+json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unavailable", sourceId: config.id, detail: `the query answered ${response.status}` };
    body = (await response.json()) as SparqlBody;
  } catch (error) {
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: `the query call failed (${error instanceof Error ? error.name : "unknown"})`,
    };
  }

  /* One row per combination of optional values: fold them back into one record per item, in the order
     the search ranked the items. */
  const items = new Map<string, { en: string; labels: Map<string, string>; ids: Map<string, Set<string>> }>();
  for (const row of Array.isArray(body.results?.bindings) ? (body.results?.bindings ?? []) : []) {
    const uri = row.item?.value ?? "";
    const qid = /\/(Q\d+)$/.exec(uri)?.[1];
    if (!qid) continue;
    const record = items.get(qid) ?? { en: "", labels: new Map(), ids: new Map() };
    record.en ||= (row.en?.value ?? "").trim();
    for (const [code] of LANGUAGES) {
      const label = (row[code]?.value ?? "").trim();
      if (label && !record.labels.has(code)) record.labels.set(code, label);
    }
    for (const [name] of IDENTIFIERS) {
      const value = (row[name]?.value ?? "").trim();
      if (!value) continue;
      const set = record.ids.get(name) ?? new Set<string>();
      set.add(value);
      record.ids.set(name, set);
    }
    items.set(qid, record);
  }

  const results: FederatedResult[] = [];
  for (const [qid, record] of items) {
    if (results.length >= MAX_RESULTS) break;
    if (!record.en) continue;
    const labels = LANGUAGES.filter(([code]) => record.labels.has(code)).map(([code, language]) => `${language}: ${record.labels.get(code)}`);
    const ids = IDENTIFIERS.filter(([name]) => record.ids.has(name)).map(([name, , label]) => `${label} ${[...record.ids.get(name)!].join(", ")}`);
    results.push({
      id: `${SOURCE_ID}:${qid}`,
      title: `${record.en} (Wikidata ${qid})`,
      snippet: [
        labels.length ? `Labels — ${labels.join("; ")}.` : "No label in isiZulu, isiXhosa, Afrikaans or Sesotho yet.",
        ids.length ? `Cross-references — ${ids.join("; ")}.` : "",
        "Crowd-sourced and not yet checked by a first-language reviewer; a label, never a health statement.",
      ]
        .filter(Boolean)
        .join(" "),
      score: Math.max(0.1, 0.6 - results.length * 0.1),
      /* Deliberately empty: a crowd-sourced identifier is not a verified code (see the header). */
      codes: {},
      citation: citationOf(
        { authority: config.authority ?? config.name ?? config.id, jurisdiction: config.jurisdiction },
        { licence: config.licensing?.licence, url: `https://www.wikidata.org/wiki/${qid}`, sourceId: config.id },
      ),
      sourceId: config.id,
    });
  }
  return { status: "ok", sourceId: config.id, results };
}
