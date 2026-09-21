import { z } from "zod";
import { tool } from "@langchain/core/tools";

/* The literature-search tool: a live call to Europe PMC's free, keyless search API
   (https://europepmc.org/RestfulWebService), returned as titled, dated, identified citations and
   nothing else. It answers one question only — "here is a real, published paper that discusses
   X" — and every result it can return carries the identifier (a PMID, and where indexed a PMCID
   or DOI) that makes it independently checkable on europepmc.org or PubMed. It never answers "is
   this true", "does this paper say I should" or "what does this mean for me": it does not
   summarise a paper's conclusion beyond the one line the API itself indexes as an abstract, it
   never combines what several papers say into a recommendation, and nothing it returns may be
   used elsewhere in this pipeline to justify a diagnosis or a treatment suggestion — that reading
   of the literature belongs to a nurse, doctor or pharmacist, the same as every other tool in this
   directory hands its own decision back to one.

   WHY EUROPE PMC. It needs no API key and no rate-limit registration, unlike PubMed's own
   E-utilities — so this tool carries no credential for this codebase to hold, rotate or leak,
   the same reasoning that keeps every other external call in this tier dark by default. A search
   that cannot be reached fails exactly like the two other external calls in this tier (the model
   providers in llm-adapter.ts, the Qdrant and embedding calls in knowledge.ts): a short timeout,
   a caught failure, and an honest "could not be reached" answer — never a hang, never an
   unhandled rejection, and never a paper invented to fill the silence. An empty result set is
   reported as empty, not padded with anything that looks like a citation but was not returned by
   the API. */

const EUROPE_PMC_TIMEOUT_MS = 4000; // the same ceiling knowledge.ts holds its own external calls to (QDRANT_TIMEOUT_MS, EMBEDDING_TIMEOUT_MS)
const EUROPE_PMC_SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
/* A query this long has stopped being a topic and started being a paragraph; Europe PMC's own
   query language does not need more to find good matches, and a shorter query is a cheaper,
   faster call. */
const MAX_QUERY_LENGTH = 200;
/* Matches knowledge-search's own ceiling of a handful of results — enough to be useful, small
   enough that the model reads titles rather than skimming past them. */
const MAX_RESULTS = 5;
/* "Reasonably short", per the task this tool was built to: an author list past this length is
   truncated rather than dropped, so the citation still names somebody. */
const MAX_AUTHOR_LENGTH = 120;
const ABSTRACT_SNIPPET_LENGTH = 220;

type EuropePmcResult = {
  id?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  journalTitle?: string;
  abstractText?: string;
};

type EuropePmcResponse = {
  resultList?: { result?: EuropePmcResult[] };
};

/* The one identifier a result is shown by, in the order that makes it easiest to check: a PMID is
   how PubMed itself is searched, a PMCID reaches free full text directly, and a DOI is the
   fallback for the record types that carry neither. A result with none of the three is not shown
   as a citation at all — see searchLiterature below. */
const identifierOf = (result: EuropePmcResult): string | null => {
  if (result.pmid) return `PMID:${result.pmid}`;
  if (result.pmcid) return result.pmcid;
  if (result.doi) return `DOI:${result.doi}`;
  return null;
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;

/* One printable line per result: title, year, journal, authors (short or truncated), the
   identifier that makes it checkable, and — only when Europe PMC itself indexed one — the
   opening of its own abstract, never a rewritten summary of it. */
const formatResult = (result: EuropePmcResult, identifier: string): string => {
  const year = result.pubYear ?? "year not indexed";
  const journal = result.journalTitle ? `, ${result.journalTitle}` : "";
  const authors = result.authorString
    ? truncate(result.authorString, MAX_AUTHOR_LENGTH)
    : "authors not indexed";
  const abstract = (result.abstractText ?? "").trim();
  const snippet = abstract ? `\n   ${truncate(abstract, ABSTRACT_SNIPPET_LENGTH)}` : "";
  return `${result.title ?? "(title not indexed)"} (${year}${journal}). ${authors}. ${identifier}.${snippet}`;
};

export async function searchLiterature(query: string): Promise<string> {
  const trimmed = (query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed)
    return (
      "Name a topic, condition or treatment and I will look for real published papers about it on Europe PMC.\n" +
      "Sources: Europe PMC (europepmc.org) — no query given."
    );

  let body: EuropePmcResponse;
  try {
    const url = `${EUROPE_PMC_SEARCH_URL}?query=${encodeURIComponent(trimmed)}&format=json&pageSize=${MAX_RESULTS}&resultType=core`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(EUROPE_PMC_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`europepmc answered ${response.status}`);
    body = (await response.json()) as EuropePmcResponse;
  } catch {
    /* A provider that timed out, refused or answered nothing is not a topic with no literature —
       it is a search that did not run, and the two must never be said the same way. */
    return (
      `Europe PMC could not be reached to search for "${trimmed}" just now.\n` +
      "That says nothing about whether literature exists — try again shortly, or ask a nurse, doctor or pharmacist to search directly.\n" +
      "Sources: Europe PMC (europepmc.org) — unreachable."
    );
  }

  const withIdentifiers = (body.resultList?.result ?? [])
    .slice(0, MAX_RESULTS)
    .map((result) => ({ result, identifier: identifierOf(result) }))
    /* A citation with nothing to check it against is not a citation this tool will hand over —
       the whole point of a real source is that it can be traced. */
    .filter((entry): entry is { result: EuropePmcResult; identifier: string } => entry.identifier !== null);

  if (!withIdentifiers.length)
    return (
      `No papers with a checkable identifier were found on Europe PMC for "${trimmed}".\n` +
      "That is a statement about this search, not about the topic — try it in different words, or ask a nurse, doctor or pharmacist.\n" +
      "Sources: Europe PMC (europepmc.org)."
    );

  const lines = withIdentifiers.map(
    ({ result, identifier }, i) => `${i + 1}. ${formatResult(result, identifier)}`,
  );

  return [
    `Real, published papers from Europe PMC for "${trimmed}" — titles and identifiers only, never a conclusion drawn from them:`,
    ...lines,
    "Each identifier can be checked directly at europepmc.org or pubmed.ncbi.nlm.nih.gov. Finding a paper is not a medical opinion about it and is not a reason to change anything — a nurse, doctor or pharmacist is who weighs published research against a person's own care.",
    "Sources: Europe PMC (europepmc.org), live search.",
  ].join("\n");
}

export const literatureSearchTool = tool(
  async ({ query }) => searchLiterature(query),
  {
    name: "literature_search",
    description:
      "Search Europe PMC — a free, keyless biomedical literature database covering PubMed/MEDLINE and more — for real, published papers on a topic, and return each one's title, authors, year and identifier (PMID/PMCID/DOI) so it can be checked independently. Use when a message asks for research, evidence, studies, a source, or 'what does the literature say' about a topic. Every paper named is a live Europe PMC result, never invented, and this tool never summarises what a paper concludes beyond its own indexed abstract opening — it finds citations, it does not form or support a medical opinion.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "The topic, condition or treatment to search published literature for, in a few plain words — e.g. 'gestational diabetes home monitoring'",
        ),
    }),
  },
);
