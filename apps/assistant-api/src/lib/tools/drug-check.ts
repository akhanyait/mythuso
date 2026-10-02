import { z } from "zod";
import { tool } from "@langchain/core/tools";
import interactions from "../../../../../packages/catalog/knowledge/interactions.json" with { type: "json" };
import { attributionOf } from "../knowledge-provenance.ts";
import { queryInteractions } from "../sources/openfda-adapter.ts";

/* The drug-interaction tool: the 30 recorded pairs in packages/catalog/knowledge/interactions.json,
   nothing more. It answers "is this pair recorded, and what does the record say" — never "is this
   combination safe", which is a question only a pharmacist, nurse or doctor may answer. Every
   output, found or not, says so in its closing lines. */

type InteractionEntry = {
  id: string;
  drug1: string;
  drug2: string;
  severity: string;
  effect: string;
  recommendation: string;
  /* The entry's attribution as stored: the source object the 22 September 2026 migration gave it
     (or, in an older copy, a plain string). Read through attributionOf(). */
  source?: unknown;
};

const PAIRS = interactions as InteractionEntry[];

/* The comparison key of a drug name: lowercase, parenthetical qualifiers dropped ("Aspirin
   (low-dose)" -> "aspirin"), first remaining word. Interactions speak in generic names, and the
   qualifier in brackets never changes the pair a name belongs to. */
const drugKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] ?? "";

/* Common South African shelf names for the generics the list records. Small on purpose: an alias
   that maps two different medicines to one key would be worse than no alias at all. */
const ALIASES: Readonly<Record<string, string>> = {
  acetaminophen: "paracetamol",
  panado: "paracetamol",
  tylenol: "paracetamol",
  disprin: "aspirin",
  brufen: "ibuprofen",
  advil: "ibuprofen",
  nurofen: "ibuprofen",
  ventolin: "salbutamol",
  glucophage: "metformin",
  amoxil: "amoxicillin",
  augmentin: "amoxicillin-clavulanic",
  zithromax: "azithromycin",
};

const canonicalKey = (name: string): string => {
  const key = drugKey(name);
  return ALIASES[key] ?? key;
};

const capitalise = (value: string): string =>
  value.length ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

export async function checkDrugInteraction(drugA: string, drugB: string): Promise<string> {
  const a = (drugA ?? "").trim();
  const b = (drugB ?? "").trim();
  if (!a || !b)
    return "Two medicine names are needed for an interaction check. Sources: MyThuso interaction list (30 pairs).";

  const keyA = canonicalKey(a);
  const keyB = canonicalKey(b);
  if (keyA && keyA === keyB)
    return `Both names given are the same medicine (${capitalise(keyA)}). An interaction check needs two different medicines — ask a pharmacist or your nurse about the correct dose of a single medicine instead.\nSources: MyThuso interaction list (30 pairs).`;

  const matches = PAIRS.filter((pair) => {
    const one = drugKey(pair.drug1);
    const two = drugKey(pair.drug2);
    return (one === keyA && two === keyB) || (one === keyB && two === keyA);
  });

  /* Local pairs take precedence — they are curated, carry SA-relevant attribution and work
     offline. When the local list has a match, OpenFDA is never called. */
  if (matches.length) {
    const blocks = matches.map((pair) =>
      [
        `${pair.drug1} + ${pair.drug2} — severity: ${pair.severity.toUpperCase()}`,
        `Effect: ${pair.effect}`,
        `What the record advises: ${pair.recommendation}`,
      ].join("\n"),
    );
    const sources = [
      ...new Set(matches.map((pair) => attributionOf(pair.source, "MyThuso interaction list"))),
    ].join("; ");
    return [
      `${matches.length === 1 ? "One recorded interaction" : `${matches.length} recorded interactions`} found between ${capitalise(keyA)} and ${capitalise(keyB)}:`,
      ...blocks,
      "This is a record of known interactions, not advice to take, change or stop either medicine — only a clinician who knows the person's own history may decide that.",
      `Sources: ${sources}.`,
    ].join("\n");
  }

  /* No local match — supplement with openFDA when the deployment has activated it: the US label's
     own drug-interactions section, never a dose (openfda-adapter.ts says why). The adapter returns
     an empty array when dark, rate-limited, timed out or errored: every failure is silent, so the
     tool degrades to its local-only answer without the caller knowing why. */
  const openFdaResults = await queryInteractions(a, b);

  if (openFdaResults.length) {
    const blocks = openFdaResults.map((result) =>
      [
        `${result.drug1} + ${result.drug2} — severity: ${result.severity.toUpperCase()}`,
        `Effect: ${result.effect}`,
        `What the record advises: ${result.recommendation}`,
      ].join("\n"),
    );
    return [
      `${openFdaResults.length === 1 ? "One labelled interaction" : `${openFdaResults.length} labelled interactions`} found between ${capitalise(keyA)} and ${capitalise(keyB)} (from US FDA drug labels):`,
      ...blocks,
      "This is US label wording, not South African guidance, not clinical guidance and not advice to take, change or stop either medicine — only a clinician who knows the person's own history may decide that.",
      `Sources: ${[...new Set(openFdaResults.map((result) => result.source))].join("; ")}.`,
    ].join("\n");
  }

  /* Both sources returned nothing. The invariant holds: "no record" is never "safe". */
  return [
    `No known interaction is recorded between ${a} and ${b} in MyThuso's interaction list.`,
    "That is not the same as safe to combine: the list carries only 30 medicine pairs, and it says nothing about doses, your own conditions or other medicines you take. A pharmacist, nurse or doctor should confirm before the two are taken together.",
  ].join("\n") + "\nSources: MyThuso interaction list (30 pairs).";
}

export const drugCheckTool = tool(
  async ({ drugA, drugB }) => checkDrugInteraction(drugA, drugB),
  {
    name: "drug_interaction_check",
    description:
      "Check whether two medicines have a known recorded interaction (severity, effect and what the record advises). Use whenever a message names two medicines together, or asks about mixing, combining or taking one with another. Returns 'no recorded interaction' when the pair is not in the list — never an assurance of safety.",
    schema: z.object({
      drugA: z.string().describe("The first medicine's name, exactly as the person wrote it"),
      drugB: z.string().describe("The second medicine's name, exactly as the person wrote it"),
    }),
  },
);
