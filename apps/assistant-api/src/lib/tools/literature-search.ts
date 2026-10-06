import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { outgoingTerm, type AdapterDeps } from "../sources/config.ts";
import {
  literatureCitations,
  type LiteratureCitation,
  type LiteratureOutcome,
} from "../sources/pubmed-adapter.ts";

/* The literature-search tool: titled, dated, identified citations from Europe PMC's index of PubMed
   and PMC literature, and nothing else. It answers one question only — "here is a real, published
   paper that discusses X" — and every result it can return carries the identifier (a PMID, and where
   indexed a PMCID or DOI) that makes it independently checkable on europepmc.org or PubMed. It never
   answers "is this true", "does this paper say I should" or "what does this mean for me": it does not
    10|   summarise a paper's conclusion beyond the one line the API itself indexes as an abstract, it
   never combines what several papers say into a recommendation, and nothing it returns may be used
   elsewhere in this pipeline to justify a diagnosis or a treatment suggestion — that reading of the
   literature belongs to a nurse, doctor or pharmacist, the same as every other tool in this
   directory hands its own decision back to one.

   ROUTED THROUGH THE GOVERNED ADAPTER, 6 OCTOBER 2026 — AND THIS IS THE POINT OF THE CHANGE. This
   file used to make its own fetch() to https://www.ebi.ac.uk/europepmc/webservices/rest/search,
   which is the very endpoint apps/assistant-api/src/lib/sources/pubmed-adapter.ts governs as the
   federation source `pubmed-europepmc`. Two roads therefore reached one governed source and only
    20|   one of them respected it: the adapter asked isSourceActive before sending anything, ran the
   query through outgoingTerm (the same PHI redaction every model call gets) and took a token from
   the 30-per-minute rate gate; this tool asked nothing, redacted nothing and counted nothing. It
   reached a UK-hosted index from a live production service while federation.json recorded that
   source as "active": false and "crossBorderTransferApproved": false. That is why this file now
   imports the adapter and holds no endpoint, no timeout, no result cap, no truncation length and no
   fetch() of its own: each of those numbers lives in the adapter, once, and a boundary check fails
   the build if a fetch() ever returns here (scripts/check-boundaries.mjs, the egress table).

   WHAT ROUTING IT COSTS, DELIBERATELY. While federation.json says "active": false and the founder's
   demonstration override is not in force, this tool answers that the source is switched off and
    30|   sends nothing. It used to answer whatever Europe PMC answered, because nothing asked. That is
   the intended outcome and not a regression: a source nobody has signed for is a source that stays
   dark, and the sentence below says so rather than reporting a silence as an empty literature.

   WHAT ROUTING IT ADDED. The per-record licence condition. Europe PMC returns each article's own
   licence, and federation.json records that only CC BY and CC0 text may be shown or reworded by a
   commercial service. The adapter withholds an abstract opening under any other licence and this
   tool says why, so a citation is still checkable by its title, authors, identifier and page — and
   MyThuso is no longer reproducing text it has no licence to reproduce.

   EVERY FAILURE IS A FACT, NEVER AN EXCEPTION, AND NEVER A PADDED ANSWER. A provider that timed
    40|   out, a gate that refused, a source that is dark and a search that found nothing are four
   different sentences, because collapsing them is how a governed refusal comes to look like an
   empty literature and an empty literature comes to look like a clinical finding. An empty result
   set is reported as empty, never padded with anything that looks like a citation but was not
   returned by the API. */

/* The echo's own cap, and the only number this file holds. It is not the query cap — the adapter
   owns that, at MAX_QUERY_LENGTH, because it is the adapter that decides what leaves the process.
   This one decides how much of the person's own wording an answer may print back at them, and it
   runs through outgoingTerm so the echo is redacted the same way the outgoing query is: a name or a
   phone number typed into a literature search is not repeated into an answer log. */
const ECHO_MAX_LENGTH = 120;

/* The injection seam the adapters keep and production does not use: a test passes an activated copy
   of the real federation.json row, a stub fetch and a small gate, so the dark path every deployment
   takes is the one that runs when nobody overrides anything. */
export type LiteratureDeps = AdapterDeps;

/* One printable line per citation: title, year, journal, authors (already truncated by the adapter),
   the identifier that makes it checkable, the page it resolves to, and — only when the record's own
   licence permits showing it — the opening of the abstract Europe PMC indexed, never a rewritten
   summary of it. */
const formatCitation = (citation: LiteratureCitation): string => {
  const journal = citation.journal ? `, ${citation.journal}` : "";
  const lines = [
    `${citation.title} (${citation.year}${journal}). ${citation.authors}. ${citation.identifier}`,
    `   Page: ${citation.url}`,
  ];
  if (citation.abstractOpening)
    lines.push(`   ${citation.abstractOpening}`);
  else
    /* Said rather than left blank. A citation with no abstract looks like a paper with no abstract,
       and the reason here is a licence, which is a fact about MyThuso's permission and not about the
       research. The person can still read it at the page above. */
    lines.push(
      `   No abstract is quoted here: this record's licence (${citation.licence}) does not cover a commercial service reproducing it. The title, authors and identifier are the citation, and the page above is where the abstract can be read.`,
    );
  return lines.join("\n");
};

const render = (asked: string, outcome: LiteratureOutcome): string => {
  switch (outcome.status) {
    case "dark":
      return [
        `Europe PMC is switched off, so no literature search ran for "${asked}".`,
        "That is a statement about MyThuso's own governance, not about the topic: nothing was sent, and nothing was found or not found. The source is opened only once its licence and its POPIA position are recorded and signed.",
        "Ask a nurse, doctor or pharmacist to search the literature directly.",
        "Sources: Europe PMC (europepmc.org) — switched off, nothing sent.",
      ].join("\n");
    case "rate-limited":
      return [
        `Europe PMC's own rate limit for this service is reached, so nothing was sent for "${asked}" just now.`,
        `Try again in about ${Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))} seconds, or ask a nurse, doctor or pharmacist to search directly.`,
        "Sources: Europe PMC (europepmc.org) — rate limit reached, nothing sent.",
      ].join("\n");
    case "unavailable":
      /* A provider that timed out, refused or answered nothing is not a topic with no literature —
         it is a search that did not run, and the two must never be said the same way. */
      return [
        `Europe PMC could not be reached to search for "${asked}" just now.`,
        "That says nothing about whether literature exists — try again shortly, or ask a nurse, doctor or pharmacist to search directly.",
        "Sources: Europe PMC (europepmc.org) — unreachable.",
      ].join("\n");
    case "ok": {
      if (!outcome.citations.length)
        return [
          `No papers with a checkable identifier were found on Europe PMC for "${asked}".`,
          "That is a statement about this search, not about the topic — try it in different words, or ask a nurse, doctor or pharmacist.",
          "Sources: Europe PMC (europepmc.org).",
        ].join("\n");
      return [
        `Real, published papers from Europe PMC for "${asked}" — titles and identifiers only, never a conclusion drawn from them:`,
        ...outcome.citations.map(
          (citation, index) => `${index + 1}. ${formatCitation(citation)}`,
        ),
        "Each identifier can be checked directly at europepmc.org or pubmed.ncbi.nlm.nih.gov. Finding a paper is not a medical opinion about it and is not a reason to change anything — a nurse, doctor or pharmacist is who weighs published research against a person's own care.",
        "Sources: Europe PMC (europepmc.org), live search.",
      ].join("\n");
    }
  }
};

export async function searchLiterature(
  query: string,
  deps: LiteratureDeps = {},
): Promise<string> {
  /* Asked of the echo, and the adapter asks it again of the query: the two are separate questions
     with separate ceilings, and neither trusts the other's answer. A query that redacts to nothing
     — a message that was only a name, or only a number — gets the "name a topic" sentence and never
     reaches the network, which is what the adapter would have done anyway. */
  const asked = outgoingTerm(query ?? "", ECHO_MAX_LENGTH);
  if (!asked)
    return [
      "Name a topic, condition or treatment and I will look for real published papers about it on Europe PMC.",
      "Sources: Europe PMC (europepmc.org) — no query given.",
    ].join("\n");
  return render(asked, await literatureCitations(query ?? "", deps));
}

export const literatureSearchTool = tool(
  async ({ query }) => searchLiterature(query),
  {
    name: "literature_search",
    description:
      "Search Europe PMC — a free, keyless biomedical literature database covering PubMed/MEDLINE and more — for real, published papers on a topic, and return each one's title, authors, year and identifier (PMID/PMCID/DOI) so it can be checked independently. Use when a message asks for research, evidence, studies, a source, or 'what does the literature say' about a topic. Every paper named is a live Europe PMC result, never invented, and this tool never summarises what a paper concludes beyond its own indexed abstract opening — it finds citations, it does not form or support a medical opinion. The source is governed: while it is switched off, or its rate limit is reached, the tool says so and sends nothing, and that answer is about MyThuso's own switch, never a finding that no literature exists.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "The topic, condition or treatment to search published literature for, in a few plain words — e.g. 'gestational diabetes home monitoring'",
        ),
    }),
  },
);
