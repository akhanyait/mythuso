import references from "../../../../packages/catalog/gilbertone-references.json" with { type: "json" };

/* Approved public references GilbertOne may name under a signed-in reply.
   Loaded from the catalog only. No network call. A candidate, or a source
   whose audience is not public, is never returned for a patient caption. */

export type CitedReference = {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly url: string;
};

const citable = (source: (typeof references.sources)[number]) =>
  source.status === "approved" && source.audience === "public";

/* Shelf only. Never passed to the patient caption. */
export const referenceCandidates: readonly CitedReference[] = references.sources
  .filter((source) => !citable(source))
  .map((source) => ({
    id: source.id,
    name: source.name,
    publisher: source.publisher,
    url: source.url,
  }));

const wordsOf = (text: string): ReadonlySet<string> =>
  new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/* A topic matches when each of its words is in the message. Tiny words that
   are not part of a topic are never searched for. Short topic words such as
   hiv or tb match only as a whole word. */
const topicMatches = (topic: string, said: ReadonlySet<string>): boolean => {
  const parts = topic.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return parts.length > 0 && parts.every((part) => said.has(part));
};

export const referencesUsedFor = (message: string): readonly CitedReference[] => {
  const said = wordsOf(message);
  if (!said.size) return [];
  const used: CitedReference[] = [];
  for (const source of references.sources) {
    if (!citable(source)) continue;
    if (!source.topics.some((topic) => topicMatches(topic, said))) continue;
    used.push({
      id: source.id,
      name: source.name,
      publisher: source.publisher,
      url: source.url,
    });
  }
  return used;
};
