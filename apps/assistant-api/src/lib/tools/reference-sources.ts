import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  federatedSearch,
  referencePosture,
  type FederationAdapter,
  type FederationAnswer,
  type FederationDeps,
} from "../knowledge-federation.ts";

type AdapterDeps = NonNullable<FederationDeps["adapterDeps"]>;
import { demonstrationDisclaimer, demonstrationOverride, type DemonstrationOverride } from "../demonstration-override.ts";

/* The reference_sources tool, added on 2 October 2026 with the founder's demonstration override
   (packages/catalog/demonstration-override.json): the one deliberate caller of the knowledge
   federation, and so the one road from GilbertOne's model tier to an external knowledge source.

   WHAT IT DOES. Asks every external source that answers today — signed, or opened by the override with a
   licence that permits it — for the topic words the model hands it, and returns what each source said in
   that source's own title and summary, with the attribution line federation.json records for it and the
   page it can be checked on. The federation decides scope first, so a request for a diagnosis or a dose
   change is answered with the outside-approved-scope abstention and costs no lookup.

   WHAT IT WILL NOT DO. It never asks the local catalogue (knowledge_search does that, first), never
   presents a US page as South African guidance, never turns a crowd-sourced label into a health
   statement, and never sends more than topic words: every adapter passes the term through the same
   redaction every model call gets. It says out loud which sources are on only for demonstration, in the
   override's own disclaimer, and which are opened but waiting for credentials — never an empty answer
   where a source simply could not be asked. With the override switched off and nothing signed, every
   source is dark, and the tool says that instead. */

export const REFERENCE_SOURCES_TOOL = "reference_sources";

export type ReferenceDeps = {
  override?: DemonstrationOverride;
  adapters?: FederationAdapter[];
  adapterDeps?: AdapterDeps;
};

const lineOf = (answer: FederationAnswer): string[] => {
  if (answer.kind === "abstention") return [answer.sentence];
  if (!answer.results.length) return ["None of the switched-on reference sources has anything on this."];
  return answer.results.map((result, i) =>
    [
      `${i + 1}. ${result.title}`,
      `   ${result.snippet}`,
      `   ${result.citation.url ? `Page: ${result.citation.url}` : ""}`.trimEnd(),
    ]
      .filter((line) => line.trim())
      .join("\n"),
  );
};

export function formatReferenceAnswer(answer: FederationAnswer, override: DemonstrationOverride = demonstrationOverride()): string {
  const posture = referencePosture(override);
  const on = posture.filter((source) => source.on);
  if (!on.length)
    return [
      "Every external reference source is switched off: none is signed by an Information Officer and a clinical reviewer, and the demonstration override is not in force.",
      "Answer from MyThuso's own knowledge base, or point to a nurse, doctor or pharmacist.",
      "Sources: none.",
    ].join("\n");

  const answered = new Set(
    answer.kind === "results" ? answer.results.map((result) => result.citation.sourceId ?? "") : [],
  );
  const byId = new Map(posture.map((source) => [source.id, source]));
  const attributions = [...answered].map((id) => byId.get(id)).filter((source) => source !== undefined);
  const waiting = on.filter((source) => source.waitingFor);
  const unreachable = answer.notes.filter((note) => note.status === "rate-limited" || note.status === "unavailable");
  const anyDemonstration = on.some((source) => source.demonstration);

  return [
    `Reference sources for "${answer.query}":`,
    ...lineOf(answer),
    ...attributions.map((source) => `Attribution — ${source.attribution} Written for: ${source.audience}`),
    ...waiting.map((source) => `${source.name}: on for demonstration, waiting for credentials. ${source.waitingFor}`),
    ...unreachable
      .filter((note) => !waiting.some((source) => source.id === note.sourceId))
      .map((note) => `${byId.get(note.sourceId)?.name ?? note.sourceId} could not be asked this time (${note.status}).`),
    anyDemonstration ? demonstrationDisclaimer(override) : "",
    "None of this is South African guidance by itself, a diagnosis or a dose: say who said it, and point to a nurse, doctor or pharmacist.",
    `Sources: ${attributions.length ? attributions.map((source) => source.name).join("; ") : "none answered"}.`,
  ]
    .filter((line) => line.trim())
    .join("\n");
}

/* Whether any source answers only because of the override — what the orchestrator asks before it
   appends the disclaimer to an answer that used this tool. */
export const referenceSourcesOnForDemonstration = (override: DemonstrationOverride = demonstrationOverride()): boolean =>
  referencePosture(override).some((source) => source.demonstration);

export async function searchReferenceSources(query: string, deps: ReferenceDeps = {}): Promise<string> {
  const answer = await federatedSearch(query, {
    /* External only: the local catalogue is knowledge_search's, and asked before this tool. */
    localSearch: async () => [],
    adapters: deps.adapters,
    adapterDeps: { ...deps.adapterDeps, override: deps.override ?? deps.adapterDeps?.override },
  });
  return formatReferenceAnswer(answer, deps.override);
}

export const referenceSourcesTool = tool(async ({ query }) => searchReferenceSources(query), {
  name: REFERENCE_SOURCES_TOOL,
  description:
    "Look a health topic up in the external reference sources switched on for MyThuso — MedlinePlus and CDC (US public-health pages), openFDA (US medicine labels), Europe PMC (published papers) and Wikidata (isiZulu, isiXhosa, Afrikaans and Sesotho labels). Use after knowledge_search when MyThuso's own knowledge base has too little, or when a message asks for a term in a South African language. Returns each source's own words with its attribution — never South African guidance by itself, never a diagnosis or a dose.",
  schema: z.object({
    query: z
      .string()
      .describe("The topic in a few plain words — a condition, a medicine's generic name or a test — never the person's own sentence or anything about them"),
  }),
});
