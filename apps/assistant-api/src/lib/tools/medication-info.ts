import { z } from "zod";
import { tool } from "@langchain/core/tools";
import medications from "../../../../../packages/catalog/knowledge/medications.json" with { type: "json" };
import { attributionOf } from "../knowledge-provenance.ts";

/* The medication-information tool: the catalog's own record for a medicine — dosage the record
   states, side effects it lists, contraindications it carries — read back in full. It does not
   recommend, compare or adjust: a person's dose is the one their clinician prescribed, and the
   closing line of every lookup says so. */

type MedicationEntry = {
  id: string;
  name: string;
  genericName?: string;
  category?: string;
  commonDosage: string;
  sideEffects: string[];
  contraindications: string[];
  pregnancyCategory?: string;
  saEmlLevel?: string;
  /* The entry's attribution as stored: the source object the 22 September 2026 migration gave it
     (or, in an older copy, a plain string). Read through attributionOf(). */
  source?: unknown;
};

const MEDICATIONS = medications as MedicationEntry[];

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const baseName = (value: string): string => normalise(value).split(" ")[0] ?? "";

/* Every way a person's name for a medicine can meet the catalog's: an exact match on the full
   name or generic name, a match on the generic word once qualifiers are dropped ("aspirin" with
   "Aspirin (low-dose)"), or a containment either way for hyphenated combinations. */
const matchesMedication = (query: string, entry: MedicationEntry): boolean => {
  const q = normalise(query);
  if (!q) return false;
  const name = normalise(entry.name);
  const generic = entry.genericName ? normalise(entry.genericName) : "";
  if (q === name || (generic && q === generic)) return true;
  const qBase = baseName(query);
  if (qBase && (qBase === baseName(entry.name) || (generic && qBase === baseName(generic))))
    return true;
  return (name.includes(q) || (generic !== "" && generic.includes(q))) && q.length >= 4;
};

export function lookupMedication(name: string): string {
  const query = (name ?? "").trim();
  if (!query)
    return "Name a medicine and I will read back what MyThuso's record carries for it.\nSources: MyThuso medication list (50 entries).";

  /* Exact and base-name matches first, so "aspirin" lands on the aspirin record rather than a
     list of candidates. */
  const exact = MEDICATIONS.filter((entry) => matchesMedication(query, entry));
  if (exact.length === 1) {
    const entry = exact[0];
    const lines = [
      `${entry.name}${entry.genericName ? ` (${entry.genericName})` : ""}${entry.category ? ` — ${entry.category}` : ""}:`,
      `Usual dosage on the record: ${entry.commonDosage}`,
      `Side effects listed: ${entry.sideEffects.join("; ")}`,
      `Cautions and contraindications: ${entry.contraindications.join("; ")}`,
    ];
    if (entry.pregnancyCategory) lines.push(`Pregnancy: ${entry.pregnancyCategory}`);
    if (entry.saEmlLevel) lines.push(`SA Essential Medicines List level: ${entry.saEmlLevel}`);
    lines.push(
      "This is the catalog's general record, not a prescription. Take a medicine only as the clinician who prescribed it directed, and ask them or a pharmacist before changing anything.",
      `Sources: ${attributionOf(entry.source, "MyThuso medication list")}.`,
    );
    return lines.join("\n");
  }

  /* More than one record answers to the name: the honest answer is the list, not a guess. */
  if (exact.length > 1) {
    const names = exact.slice(0, 6).map((entry) => entry.name).join("; ");
    return [
      `More than one medicine answers to "${query}": ${names}.`,
      "Name the exact one and I will read its record.",
      "Sources: MyThuso medication list (50 entries).",
    ].join("\n");
  }

  /* Nothing exact: try a leading fragment ("amox" for Amoxicillin) before giving up. */
  const fragment = normalise(query);
  const partial = fragment.length >= 3
    ? MEDICATIONS.filter((entry) => {
        const name = normalise(entry.name);
        const generic = entry.genericName ? normalise(entry.genericName) : "";
        return name.startsWith(fragment) || (generic && generic.startsWith(fragment));
      })
    : [];
  if (partial.length) {
    const names = partial.slice(0, 6).map((entry) => entry.name).join("; ");
    return [
      `"${query}" matches no record exactly. Did you mean: ${names}?`,
      "Name the exact one and I will read its record.",
      "Sources: MyThuso medication list (50 entries).",
    ].join("\n");
  }

  return [
    `"${query}" is not in MyThuso's medication list (50 common South African medicines).`,
    "A nurse, doctor or pharmacist can tell you about a medicine this list does not carry — and if a clinician prescribed it, the prescribing label and their instructions come first.",
    "Sources: MyThuso medication list (50 entries).",
  ].join("\n");
}

export const medicationInfoTool = tool(
  async ({ medication }) => lookupMedication(medication),
  {
    name: "medication_info",
    description:
      "Read back MyThuso's catalog record for one named medicine: the usual dosage it states, side effects it lists, contraindications it carries, and pregnancy notes. Use when a message names one medicine and asks what it is, what it does, its dose or its side effects. Not found and ambiguous names are answered as such. Never recommends starting, stopping or changing a medicine.",
    schema: z.object({
      medication: z.string().describe("The single medicine's name, exactly as the person wrote it"),
    }),
  },
);
