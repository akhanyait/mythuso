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

/* The MedlinePlus adapter, written on 2 October 2026 when the founder's demonstration override opened
   the source (packages/catalog/demonstration-override.json). Dark whenever neither the source's own
   signatures nor the override open it, like every adapter beside it.

   WHAT IT DOES. Asks the US National Library of Medicine's MedlinePlus Web Service for the health topics
   that match a topic and returns each topic's title, its page and the opening of its own summary — the
   plain-language background federation.json records this source as being for, attributed in the words
   MedlinePlus asks for.

   WHAT IT WILL NOT DO. The licence (federation.json, medlineplus-nlm) lets only the health-topic
   summaries be carried: the A.D.A.M. Medical Encyclopedia and the ASHP drug monographs are copyrighted
   and may only be linked to. So the search is made against the healthTopics database alone, and a
   document whose page is the encyclopedia's (/ency/) or the drug monographs' (/druginfo/) is dropped
   even if the service ever returned one. Nothing about a person is sent: the term passes through
   outgoingTerm(), the redaction every model call gets.

   THE SHAPE OF THE CALL. GET wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=…&retmax=…, answered in
   XML (checked by hand on 2 October 2026). The XML is read with patterns rather than a parser because
   this service carries no dependency for one, and only four fields are wanted; a document without a
   title or a medlineplus.gov page is skipped rather than guessed at. */

const SOURCE_ID = "medlineplus-nlm";
const TIMEOUT_MS = 4000;
const MAX_RESULTS = 3;
const MAX_QUERY_LENGTH = 120;
const SUMMARY_LENGTH = 320;
const USER_AGENT = "MyThuso-assistant/0.1 (knowledge federation; contact: hello@mythuso.co.za)";

const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/* The service's own markup arrives escaped inside the XML: decode, then drop every tag (its search
   highlighting among them), then fold the whitespace. */
const plainText = (value: string): string =>
  decodeEntities(decodeEntities(value))
    .replace(/<\/(?:p|li)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max).replace(/\s+\S*$/, "").trimEnd()}…` : value;

const contentOf = (document: string, name: string): string => {
  const match = new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`).exec(document);
  return match ? plainText(match[1]) : "";
};

/* Only a MedlinePlus health-topic page, never the encyclopedia or the drug monographs it links to. */
const carriable = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "medlineplus.gov" || parsed.hostname.endsWith(".medlineplus.gov")) &&
      !/\/(?:ency|druginfo)\//.test(parsed.pathname)
    );
  } catch {
    return false;
  }
};

export async function searchMedlinePlus(query: string, deps: AdapterDeps = {}): Promise<AdapterOutcome> {
  const config = deps.config ?? federationSource(SOURCE_ID);
  if (!config) return { status: "unavailable", sourceId: SOURCE_ID, detail: "no config for this source in federation.json" };
  if (!isSourceActive(config, deps.override))
    return {
      status: "dark",
      sourceId: config.id,
      detail: `${config.id} is dark (active: false, and the demonstration override does not open it) — activation requires both signatures, the US-to-South-African adaptation layer and a recorded POPIA review`,
    };

  const trimmed = outgoingTerm(query, MAX_QUERY_LENGTH);
  if (!trimmed) return { status: "unavailable", sourceId: config.id, detail: "no query was given; nothing left the process" };
  const endpoint = config.endpoint ?? "";
  if (!endpoint) return { status: "unavailable", sourceId: config.id, detail: "the config records no endpoint" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const gate = deps.gate ?? rateGateFor(config.id, config.rateLimit?.requestsPerMinute ?? 60, config.rateLimit?.requestsPerDay);
  const nowMs = now().getTime();
  if (!gate.take(nowMs))
    return {
      status: "rate-limited",
      sourceId: config.id,
      retryAfterMs: gate.waitMsUntilAllowed(nowMs),
      detail: "the configured rate limit for this source is reached; nothing was sent",
    };

  let body: string;
  try {
    const params = new URLSearchParams({ db: "healthTopics", term: trimmed, retmax: String(MAX_RESULTS) });
    const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
      headers: { accept: "application/xml", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unavailable", sourceId: config.id, detail: `the search answered ${response.status}` };
    body = await response.text();
  } catch (error) {
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: `the search call failed (${error instanceof Error ? error.name : "unknown"})`,
    };
  }

  const results: FederatedResult[] = [];
  const documents = [...body.matchAll(/<document\b[^>]*\burl="([^"]+)"[^>]*>([\s\S]*?)<\/document>/g)];
  for (const [, rawUrl, document] of documents) {
    if (results.length >= MAX_RESULTS) break;
    const url = decodeEntities(rawUrl);
    const title = contentOf(document, "title");
    if (!title || !carriable(url)) continue;
    const summary = contentOf(document, "FullSummary") || contentOf(document, "snippet");
    results.push({
      id: `${SOURCE_ID}:${new URL(url).pathname.replace(/^\/|\.html$/g, "")}`,
      title,
      snippet: truncate(summary || title, SUMMARY_LENGTH),
      score: Math.max(0.1, 0.85 - results.length * 0.15),
      /* MedlinePlus health topics are not coded with SNOMED CT, ICD-11 or LOINC here, and none is
         invented. */
      codes: {},
      citation: citationOf(
        { authority: config.authority ?? config.name ?? config.id, jurisdiction: config.jurisdiction },
        { licence: config.licensing?.licence, url, sourceId: config.id },
      ),
      sourceId: config.id,
    });
  }
  return { status: "ok", sourceId: config.id, results };
}
