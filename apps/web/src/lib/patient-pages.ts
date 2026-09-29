import contract from "../../../../packages/catalog/patient-pages.json" with { type: "json" };
import conditions from "../../../../packages/catalog/knowledge/conditions.json" with { type: "json" };
import prevention from "../../../../packages/catalog/knowledge/prevention.json" with { type: "json" };
import chronic from "../../../../packages/catalog/knowledge/chronic.json" with { type: "json" };
import mentalHealth from "../../../../packages/catalog/knowledge/mental-health.json" with { type: "json" };
import maternal from "../../../../packages/catalog/knowledge/maternal.json" with { type: "json" };
import saHealthSystem from "../../../../packages/catalog/knowledge/sa-health-system.json" with { type: "json" };

/* The eight patient pages and their hub, as the screens read them.
 *
 * Every word a page shows is packages/catalog/patient-pages.json's, or an entry of the governed
 * knowledge base that contract names in `derivations` and scripts/check-boundaries.mjs holds the two
 * to each other. This module is the only place that joins a derivation to the file it comes from, so
 * a screen never reaches into a knowledge JSON itself and never types a sentence.
 *
 * Nothing on the patient's first load imports this module or the six knowledge files behind it: a
 * JSON module imported by the entry is kept whole in the entry bundle. The router reads only the two
 * strings per page from patient-pages-routes.generated.ts, and the hub and its screens arrive on a
 * dynamic import, so the knowledge base rides in that chunk and not on the first view. */

type Source = {
  authority: string;
  jurisdiction: string;
  retrievedDate: string;
};
type Raw = {
  id: string;
  title: string;
  category?: string;
  tags?: readonly string[];
  source: Source;
} & Record<string, unknown>;

export type LibraryField = { label: string; items: readonly string[] };
export type LibraryEntry = {
  id: string;
  title: string;
  category: string;
  sourceText: string;
  haystack: string;
  fields: LibraryField[];
};
export type LibraryTab = { id: string; label: string; entries: LibraryEntry[] };

/* The knowledge files are top-level arrays; a future one may wrap them in `entries`. Read either. */
const asEntries = (file: unknown): Raw[] =>
  (Array.isArray(file)
    ? file
    : ((file as { entries?: Raw[] }).entries ?? [])) as Raw[];

export const pageContract = contract;
export const hub = contract.hub;
export const review = contract.review;
export const aside = contract.aside;
export const screens = contract.screens;
export const refusals = contract.refusals.map((r) => r.sentence);

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/* The source line every knowledge card carries, filled from the entry's own provenance. */
export const sourceLine = (source: Source) =>
  fill(contract.screens["health-library"].sourceLine, {
    authority: source.authority,
    jurisdiction: source.jurisdiction,
    retrievedDate: source.retrievedDate,
  });

const fieldLabels = contract.screens["health-library"]
  .fieldLabels as unknown as Record<string, string>;

const itemsOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? [value]
      : [];

/* One knowledge entry as a card: the contract's label beside each field the entry actually carries,
   the source line under it, and a lowercase haystack the search filters on. A field the entry does
   not hold is skipped rather than shown empty. */
const toLibraryEntry = (entry: Raw): LibraryEntry => {
  const fields = Object.keys(fieldLabels)
    .map((key) => ({ label: fieldLabels[key]!, items: itemsOf(entry[key]) }))
    .filter((field) => field.items.length > 0);
  const haystack = [
    entry.title,
    entry.category ?? "",
    ...(entry.tags ?? []),
    ...fields.flatMap((f) => f.items),
  ]
    .join(" ")
    .toLowerCase();
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category ?? "",
    sourceText: sourceLine(entry.source),
    haystack,
    fields,
  };
};

const knowledgeFiles: Record<string, unknown> = {
  "conditions.json": conditions,
  "prevention.json": prevention,
  "chronic.json": chronic,
  "mental-health.json": mentalHealth,
  "maternal.json": maternal,
  "sa-health-system.json": saHealthSystem,
};

/* The library's tabs, each its knowledge file's entries, in the order the contract lists them. */
export const libraryTabs: LibraryTab[] = contract.screens[
  "health-library"
].tabs.map((tab) => ({
  id: tab.id,
  label: tab.label,
  entries: asEntries(knowledgeFiles[tab.file]).map(toLibraryEntry),
}));

/* The immunisation material the vaccination page shows as the general schedule. */
export const vaccinationCards: LibraryEntry[] = asEntries(prevention)
  .filter((entry) => entry.category === "immunisation")
  .map(toLibraryEntry);

/* The nutrition, lifestyle and feeding entries across the three files the contract names, by tag. */
const nutritionTags = new Set<string>(
  contract.derivations.nutritionTopics.tags,
);
export const nutritionCards: LibraryEntry[] = [
  ...asEntries(prevention),
  ...asEntries(maternal),
  ...asEntries(chronic),
]
  .filter((entry) => (entry.tags ?? []).some((tag) => nutritionTags.has(tag)))
  .map(toLibraryEntry);

/* The health system's own navigation material, for the community page's "finding care near you". */
export const communityNavigation: LibraryEntry[] = asEntries(saHealthSystem)
  .filter((entry) => entry.category === "navigation")
  .map(toLibraryEntry);

/* The mental-health entries' South African resources, flattened and capped at the contract's limit.
   These lines are the knowledge base's own, with their numbers; the emergency number is never
   restated here — it is on the emergency screen this page can open. */
const helplineLimit = contract.derivations.communityHelplines.limit;
const helplineSeen = new Set<string>();
export const communityHelplines: string[] = [];
for (const entry of asEntries(mentalHealth)) {
  for (const line of itemsOf(entry.saResources)) {
    if (communityHelplines.length >= helplineLimit) break;
    if (!helplineSeen.has(line)) {
      helplineSeen.add(line);
      communityHelplines.push(line);
    }
  }
  if (communityHelplines.length >= helplineLimit) break;
}

/* The library's search: every typed term must appear in an entry's haystack. Empty query is the
   whole tab, so the search never hides the library before anybody has typed. */
export const searchLibrary = (
  tab: LibraryTab,
  query: string,
): LibraryEntry[] => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return tab.entries;
  return tab.entries.filter((entry) =>
    terms.every((term) => entry.haystack.includes(term)),
  );
};
