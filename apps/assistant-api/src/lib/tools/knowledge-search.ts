import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { retrieveKnowledge, type KnowledgeResult } from "../knowledge.ts";
import { citationLine } from "../knowledge-provenance.ts";

/* The knowledge-search tool: the 250-entry catalog knowledge base, retrieved by the knowledge
   module's search (vector when an operator stands up Qdrant, keyword always) and handed to the
   model as titled, sourced excerpts. The tool's whole job is to make an answer attributable —
   every result carries the source line the catalog recorded plus its structured citation
   (authority, jurisdiction, evidence grade, review horizon), so the reply can say where its facts
   came from instead of asking to be trusted. */

export function formatKnowledgeResults(
  query: string,
  results: KnowledgeResult[],
): string {
  if (!results.length)
    return [
      `Nothing in MyThuso's knowledge base matches "${query}".`,
      "Say the question in different words, or ask a nurse — the knowledge base is a small, curated list, and its silence is not a medical opinion.",
    ].join("\n") + "\nSources: MyThuso knowledge base (250 entries).";

  const lines = results.map((result, i) =>
    [
      `${i + 1}. ${result.title} (relevance ${(result.score * 100).toFixed(0)}%, ${result.file})`,
      `   ${result.snippet}`,
      `   Source: ${result.source}`,
      `   Citation: ${citationLine(result.citation)}`,
    ].join("\n"),
  );
  return [
    `Knowledge base results for "${query}":`,
    ...lines,
    "Excerpts only — the entries carry more detail than shown, and none of it is a diagnosis or a prescription.",
    `Sources: ${[...new Set(results.map((result) => result.source))].join("; ")}.`,
  ].join("\n");
}

export async function searchKnowledgeBase(query: string): Promise<string> {
  return formatKnowledgeResults(query, await retrieveKnowledge(query, 4));
}

export const knowledgeSearchTool = tool(
  async ({ query }) => searchKnowledgeBase(query),
  {
    name: "knowledge_search",
    description:
      "Search MyThuso's curated South African health knowledge base (250 entries: conditions, medicines, first aid, maternal care, chronic illness, mental health, the public health system, prevention and drug interactions) and return titled excerpts with their sources. Use for any general health question, 'what is', 'how do I', or 'where do I' question before answering from memory. Answers nothing by itself — it grounds the answer.",
    schema: z.object({
      query: z
        .string()
        .describe("The question or topic to look up, in plain words — e.g. 'child immunisation schedule'"),
    }),
  },
);
