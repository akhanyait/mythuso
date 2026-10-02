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

/* The CDC Content Services adapter, written on 2 October 2026 when the founder's demonstration override
   opened the source (packages/catalog/demonstration-override.json). Dark whenever neither the source's
   own signatures nor the override open it.

   WHAT IT DOES. Asks CDC's public Content Services API for English web pages that match a topic and
   returns each page's own title, its own one-line description and its address — public-health
   background, attributed.

   WHAT IT WILL NOT DO. CDC's conditions (federation.json, cdc-content-services) forbid changing the
   substance of what is carried and exclude third parties' material. So an item is carried only when CDC
   itself is its source and its page is on cdc.gov; its title and description are handed over exactly
   as CDC wrote them — a description too long to carry whole is left out rather than cut, and the item
   is then named by its title and page alone — and every result carries the attribution CDC asks for,
   which federation.json records once and the reference tool prints. CDC's logos are never carried.
   Nothing about a person is sent: the term passes through outgoingTerm().

   THE SHAPE OF THE CALL. GET tools.cdc.gov/api/v2/resources/media?q=…&max=…&mediatype=html&
   language=english, answered in JSON with results[].name, description, sourceUrl and source.acronym
   (checked by hand on 2 October 2026). The API publishes no key and no rate limit; the ceiling in
   federation.json is self-imposed. */

const SOURCE_ID = "cdc-content-services";
const TIMEOUT_MS = 4000;
const MAX_RESULTS = 3;
/* Ask for more than are kept: items from third parties or off cdc.gov are dropped after the answer. */
const REQUESTED = 8;
const MAX_QUERY_LENGTH = 120;
const DESCRIPTION_CARRIED_WHOLE = 400;
const USER_AGENT = "MyThuso-assistant/0.1 (knowledge federation; contact: hello@mythuso.co.za)";

type CdcItem = {
  id?: number | string;
  name?: string;
  description?: string;
  sourceUrl?: string;
  targetUrl?: string;
  source?: { acronym?: string; name?: string };
};

type CdcBody = { results?: CdcItem[] };

const onCdcGov = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "cdc.gov" || parsed.hostname.endsWith(".cdc.gov"));
  } catch {
    return false;
  }
};

export async function searchCdc(query: string, deps: AdapterDeps = {}): Promise<AdapterOutcome> {
  const config = deps.config ?? federationSource(SOURCE_ID);
  if (!config) return { status: "unavailable", sourceId: SOURCE_ID, detail: "no config for this source in federation.json" };
  if (!isSourceActive(config, deps.override))
    return {
      status: "dark",
      sourceId: config.id,
      detail: `${config.id} is dark (active: false, and the demonstration override does not open it) — activation requires both signatures, an item-by-item check that what is carried is CDC's own, and a recorded POPIA review`,
    };

  const trimmed = outgoingTerm(query, MAX_QUERY_LENGTH);
  if (!trimmed) return { status: "unavailable", sourceId: config.id, detail: "no query was given; nothing left the process" };
  const endpoint = config.endpoint ?? "";
  if (!endpoint) return { status: "unavailable", sourceId: config.id, detail: "the config records no endpoint" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const gate = deps.gate ?? rateGateFor(config.id, config.rateLimit?.requestsPerMinute ?? 30, config.rateLimit?.requestsPerDay);
  const nowMs = now().getTime();
  if (!gate.take(nowMs))
    return {
      status: "rate-limited",
      sourceId: config.id,
      retryAfterMs: gate.waitMsUntilAllowed(nowMs),
      detail: "the configured rate limit for this source is reached; nothing was sent",
    };

  let body: CdcBody;
  try {
    const params = new URLSearchParams({ q: trimmed, max: String(REQUESTED), mediatype: "html", language: "english" });
    const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unavailable", sourceId: config.id, detail: `the search answered ${response.status}` };
    body = (await response.json()) as CdcBody;
  } catch (error) {
    return {
      status: "unavailable",
      sourceId: config.id,
      detail: `the search call failed (${error instanceof Error ? error.name : "unknown"})`,
    };
  }

  const results: FederatedResult[] = [];
  for (const item of Array.isArray(body.results) ? body.results : []) {
    if (results.length >= MAX_RESULTS) break;
    /* CDC's own material only: a contractor's, grantee's, state's or licensed third party's item is not
       in the public domain, so it is not carried at all. */
    if ((item.source?.acronym ?? "").trim() !== "CDC") continue;
    const url = (item.sourceUrl ?? item.targetUrl ?? "").trim();
    const title = (item.name ?? "").trim();
    if (!title || !onCdcGov(url)) continue;
    const description = (item.description ?? "").trim();
    const whole = description && description.length <= DESCRIPTION_CARRIED_WHOLE ? description : "";
    results.push({
      id: `${SOURCE_ID}:${item.id ?? results.length + 1}`,
      title,
      snippet: whole || title,
      score: Math.max(0.1, 0.8 - results.length * 0.15),
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
