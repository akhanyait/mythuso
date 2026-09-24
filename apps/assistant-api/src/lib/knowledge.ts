import conditions from "../../../../packages/catalog/knowledge/conditions.json" with { type: "json" };
import medications from "../../../../packages/catalog/knowledge/medications.json" with { type: "json" };
import firstAid from "../../../../packages/catalog/knowledge/first-aid.json" with { type: "json" };
import maternal from "../../../../packages/catalog/knowledge/maternal.json" with { type: "json" };
import chronic from "../../../../packages/catalog/knowledge/chronic.json" with { type: "json" };
import mentalHealth from "../../../../packages/catalog/knowledge/mental-health.json" with { type: "json" };
import saHealthSystem from "../../../../packages/catalog/knowledge/sa-health-system.json" with { type: "json" };
import prevention from "../../../../packages/catalog/knowledge/prevention.json" with { type: "json" };
import interactions from "../../../../packages/catalog/knowledge/interactions.json" with { type: "json" };
import { azureCredentials, embedWithAzure } from "./llm-adapter.ts";
import {
  attributionOf,
  citationOf,
  codesOf,
  provenanceOf,
  type KnowledgeCode,
  type SourceCitation,
} from "./knowledge-provenance.ts";

/* The knowledge tier, added on 21 September 2026: the 250 catalog entries under
   packages/catalog/knowledge — conditions, medicines, first aid, maternal care, chronic illness,
   mental health, the SA health system, prevention and drug interactions — made searchable for the
   orchestrator's tools.

   CODES AND CITATIONS, added on 22 September 2026 with the governed federation work. Every result
   now carries two things beyond its text: the verified terminology codes of the entry it came from
   (SNOMED CT, ICD-11, LOINC — {} where none was verified) and a structured citation built from the
   entry's source object by knowledge-provenance.ts. Both are pass-through facts about the catalog,
   never inferences: the codes are read from the JSON and the citation restates the recorded
   authority, jurisdiction and dates. This module stays local-only — federated search, where a
   result can come from an external source, lives one layer up in knowledge-federation.ts.

   WHAT THIS MODULE IS AND IS NOT. It is a lookup layer: it never decides anything, never ranks a
   condition more likely than another in a clinical sense, and never addresses a person. It puts
   catalog text in front of a model that is itself barred from diagnosing or prescribing. The
   ranking below is term overlap — a reading aid, not a clinical assessment.

   KEYWORD SEARCH IS THE FLOOR, ALWAYS BUILT. No deployment of this product has stood up Qdrant
   yet, so the path every deployment actually takes today is a plain TF-IDF keyword search over an
   in-memory index built once at startup from static JSON imports — the same way the adapter reads
   assistant.json, so the knowledge this service searches is the knowledge the catalog says it has.
   This is not a stand-in for a vector search that does not exist: an operator who sets QDRANT_URL
   gets a real one. retrieveKnowledge() then embeds the query through embedWithAzure() in
   llm-adapter.ts (the same Azure credentials, and now the same function, the chat tier reads) and
   asks Qdrant first, under a short timeout, falling back to the keyword path on any failure —
   missing credentials, a timeout, an unreachable Qdrant, an empty collection, all the same "use the
   floor" instruction. The floor is not a degraded mode either way: it is what runs when nobody has
   configured anything, and what a broken vector road falls back to when someone has. Populating
   Qdrant is a separate, deliberate step — see scripts/ingest-knowledge-embeddings.mjs and the
   comment above the Qdrant section below for how an operator actually turns this on. */

export type KnowledgeResult = {
  /* The catalog entry's own id (cond-001, med-001, ...), so a caller can point back at exactly
     which entry the text came from. */
  id: string;
  title: string;
  /* A short slice of the entry's content, enough for the model to decide it has what it needs. */
  snippet: string;
  /* The entry's recorded source — the attribution a patient-facing answer must carry. */
  source: string;
  /* 0 to 1: how much of the query's term weight this entry carries. Overlap, not clinical
     likelihood. */
  score: number;
  /* Which knowledge file the entry lives in, e.g. "conditions" or "medications". */
  file: string;
  /* The entry's verified terminology codes — {} when none was verified, which is silence and
     never a claim that no code exists. */
  codes: KnowledgeCode;
  /* The structured citation a surface renders: authority, jurisdiction, evidence grade and the
     recorded dates, taken from the entry's own source object. */
  citation: SourceCitation;
};

/* One catalog entry, seen loosely: the files agree on having an id and a source, and differ on
     everything else, so the loader reads them as records and picks out the fields it knows. */
type KnowledgeEntry = {
  id: string;
  title?: string;
  name?: string;
  genericName?: string;
  drug1?: string;
  drug2?: string;
  tags?: unknown;
  /* The attribution as stored: the source object (authority, jurisdiction, dates) the migration
     gave every entry, or — in fixtures and older payloads — a plain string. Read through
     attributionOf() / provenanceOf() in knowledge-provenance.ts. */
  source?: unknown;
  /* The terminology codes as stored: { snomed?, icd11?, loinc? }, or absent entirely in
     interactions (whose records are pairs of medicines, not diseases). Read through codesOf(). */
  codes?: unknown;
  [key: string]: unknown;
};

type IndexedEntry = {
  file: string;
  id: string;
  title: string;
  source: string;
  /* Carried through from the entry so every result is born with its codes and citation; neither
     takes part in ranking. */
  codes: KnowledgeCode;
  citation: SourceCitation;
  snippet: string;
  /* The entry's full flattened prose, untruncated — snippet exists for the panel, this exists for
     embedding, where cutting an entry off at 240 characters would throw away half of what makes it
     findable by meaning rather than by keyword. */
  content: string;
  /* term -> weighted frequency: a hit in a title/name counts 3, a tag 2, body text 1. */
  terms: Map<string, number>;
};

/* English function words and question words that carry no retrieval meaning here. Kept small and
   local: a longer list starts removing words a health question actually turns on ("my", "how"). */
const STOPWORDS = new Set([
  "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "been", "being", "but", "can",
  "cannot", "did", "do", "does", "for", "from", "get", "got", "had", "has", "have", "how", "i",
  "if", "in", "into", "is", "it", "its", "just", "me", "much", "my", "no", "not", "of", "on",
  "or", "other", "own", "same", "should", "so", "some", "such", "than", "that", "the", "their",
  "them", "then", "there", "they", "this", "to", "too", "very", "was", "we", "were", "what",
  "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/* Lowercase, split on anything that is not a letter or digit, drop the stopwords, and strip
   English endings where it is safe ("symptoms" -> "symptom", "babies" -> "baby") while leaving
   words it would mangle alone ("illness", "virus"). Both sides of a comparison take the same
   rule, so derived forms still meet their base. */
export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const terms: string[] = [];
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue;
    let term = word;
    if (term.length > 4 && term.endsWith("ies")) term = `${term.slice(0, -3)}y`;
    else if (
      term.length > 3 &&
      term.endsWith("s") &&
      !term.endsWith("ss") &&
      !term.endsWith("us") &&
      !term.endsWith("is")
    )
      term = term.slice(0, -1);
    if (term.length >= 2) terms.push(term);
  }
  return terms;
}

/* The entry's prose, flattened in the catalog's own field order: conditions lead with their
   symptoms, medications with their dosage, first aid with its steps. id, tags, codes and source
   are excluded — id, codes and source are attribution, not content, and tags are indexed
   separately at their own weight. */
const contentOf = (entry: KnowledgeEntry): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "tags" || key === "source" || key === "codes") continue;
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    else if (Array.isArray(value)) {
      const joined = value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .join("; ");
      if (joined) parts.push(joined);
    }
  }
  return parts.join(". ");
};

const snippetOf = (content: string): string => {
  if (content.length <= 240) return content;
  const cut = content.slice(0, 240);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 100 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
};

/* Weighted-frequency index of one entry. Name-ish fields (title, name, genericName, drug1, drug2)
   are the strongest matchers — a query naming "warfarin" should land on the interaction whose
   drug pair carries it, not merely on an entry that mentions it once in passing. */
const indexEntry = (file: string, entry: KnowledgeEntry): IndexedEntry => {
  /* Interaction entries carry no title of their own; their identity is the pair they describe. */
  const title =
    entry.title ??
    entry.name ??
    (typeof entry.drug1 === "string" && typeof entry.drug2 === "string"
      ? `${entry.drug1} + ${entry.drug2}`
      : entry.id);
  const terms = new Map<string, number>();
  const add = (text: string, weight: number): void => {
    for (const term of tokenize(text))
      terms.set(term, (terms.get(term) ?? 0) + weight);
  };
  add(title, 3);
  for (const field of [entry.genericName, entry.drug1, entry.drug2])
    if (typeof field === "string" && field.trim()) add(field, 3);
  if (Array.isArray(entry.tags))
    for (const tag of entry.tags) if (typeof tag === "string") add(tag, 2);
  const content = contentOf(entry);
  add(content, 1);
  const source = attributionOf(entry.source, "MyThuso knowledge base");
  const provenance = provenanceOf(entry.source);
  return {
    file,
    id: entry.id,
    title,
    source,
    codes: codesOf(entry.codes),
    citation: citationOf(provenance ?? source),
    snippet: snippetOf(content),
    content,
    terms,
  };
};

const loadCorpus = (): IndexedEntry[] => {
  const files: [string, unknown[]][] = [
    ["conditions", conditions],
    ["medications", medications],
    ["first-aid", firstAid],
    ["maternal", maternal],
    ["chronic", chronic],
    ["mental-health", mentalHealth],
    ["sa-health-system", saHealthSystem],
    ["prevention", prevention],
    ["interactions", interactions],
  ];
  const corpus: IndexedEntry[] = [];
  for (const [file, entries] of files)
    for (const entry of entries as KnowledgeEntry[])
      if (entry && typeof entry.id === "string") corpus.push(indexEntry(file, entry));
  return corpus;
};

/* Built once, at module load: the whole knowledge tier is a startup fact, and no search ever
   re-reads a file. */
const CORPUS = loadCorpus();
/* Same entries, by id — how the Qdrant road re-attaches provenance: a payload carries only
   id/title/snippet/source/file, so codes and citation come from the catalog entry the id names.
   An id the corpus does not know (a stale collection, a test fixture) simply gets none. */
const CORPUS_BY_ID = new Map(CORPUS.map((entry) => [entry.id, entry]));
const DOCUMENT_COUNT = CORPUS.length;

/* Document frequency per term, for the inverse side of TF-IDF: a term every entry carries ranks
   entries far less than one only the right entries carry. */
const DF = (() => {
  const df = new Map<string, number>();
  for (const entry of CORPUS) for (const term of entry.terms.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  return df;
})();

const idf = (term: string): number =>
  Math.log(1 + DOCUMENT_COUNT / Math.max(1, DF.get(term) ?? 0));

/* Below this a match is noise — one weakly-weighted term out of a long question — and tools
   would rather report "nothing found" than dress up an accident. */
const MIN_SCORE = 0.08;

/* The strongest frequency a query term can claim in an entry: an exact term takes it outright;
   otherwise a shared prefix of at least four letters lets a base form meet its derived forms
   ("sleep" with "sleeping", "pain" with "painkiller") — never shorter, because a three-letter
   prefix matches whole families of unrelated words. */
const frequencyOf = (entry: IndexedEntry, queryTerm: string): number => {
  const exact = entry.terms.get(queryTerm);
  if (exact) return exact;
  if (queryTerm.length < 4) return 0;
  let best = 0;
  for (const [docTerm, frequency] of entry.terms) {
    if (docTerm.length < 4) continue;
    if (docTerm.startsWith(queryTerm) || queryTerm.startsWith(docTerm))
      best = Math.max(best, frequency);
  }
  return best;
};

export function searchKnowledge(query: string, topK: number = 4): KnowledgeResult[] {
  const terms = [...new Set(tokenize(query ?? ""))];
  if (!terms.length || !DOCUMENT_COUNT) return [];
  const weights = terms.map((term) => idf(term));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return [];
  /* An entry must carry at least half the question's terms: one accidental hit in a long
     question is not a match, it is a coincidence wearing one. */
  const minMatches = Math.ceil(terms.length / 2);

  const scored: KnowledgeResult[] = CORPUS.map((entry) => {
    let carried = 0;
    let matches = 0;
    terms.forEach((term, i) => {
      const frequency = frequencyOf(entry, term);
      if (!frequency) return;
      matches += 1;
      /* A single title or tag hit earns full credit for the term; body text needs two mentions
         to get there. */
      const normalized = Math.min(1, frequency / 2);
      carried += normalized * weights[i];
    });
    if (matches < minMatches) return null;
    return {
      id: entry.id,
      title: entry.title,
      snippet: entry.snippet,
      source: entry.source,
      score: carried / weightTotal,
      file: entry.file,
      codes: entry.codes,
      citation: entry.citation,
    };
  })
    .filter((result): result is KnowledgeResult => result !== null && result.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, topK));
  return scored;
}

/* ---- The Qdrant path ----

   HOW AN OPERATOR ACTUALLY TURNS THIS ON. Three things, in order. First, the two Azure OpenAI
   variables the chat tier already reads — AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY (or
   AZURE_OPENAI_API_KEY) — plus, only if the account's embeddings deployment is not named
   text-embedding-3-small, AZURE_OPENAI_EMBEDDING_MODEL. Second, a Qdrant instance somewhere this
   process can reach, named by QDRANT_URL (QDRANT_COLLECTION defaults to "gilbertone-knowledge" if
   left unset). Third, running `node scripts/ingest-knowledge-embeddings.mjs` once, with those same
   variables set, to actually populate that collection — standing up Qdrant does not, by itself,
   put anything in it. From then on retrieveKnowledge() below asks it first on every call and this
   whole knowledge module needs nothing further.

   THE ASYMMETRY BETWEEN THE TWO SIDES. At query time, below, an empty or unreachable Qdrant is
   silently fine — the whole point of the keyword floor is that it cannot be removed from under a
   person's question, so a wrong QDRANT_URL, a Qdrant that is down, or a collection nobody has
   populated yet all fall back to the keyword path with nothing worse than a log line. The ingestion
   script is the opposite: an operator ran it on purpose to populate a store the product will then
   trust, so it fails loudly — non-zero exit, a message that names what is missing — on a missing
   credential, a failed embedding call or a rejected upsert, rather than leaving Qdrant half-seeded
   and looking like it worked. */

/* Shared by both steps of the vector road — the embedding call and the Qdrant search — because a
   question this module is asked to answer must resolve fast either way: a slow vector road is not
   better than the keyword floor, it is worse, and this ceiling is what turns "slow" into "fall
   back" before a person notices the wait. */
const VECTOR_STEP_TIMEOUT_MS = 4000;
const QDRANT_DEFAULT_COLLECTION = "gilbertone-knowledge";

const qdrantUrl = (): string => (process.env.QDRANT_URL ?? "").trim().replace(/\/+$/, "");
const qdrantCollection = (): string =>
  (process.env.QDRANT_COLLECTION ?? "").trim() || QDRANT_DEFAULT_COLLECTION;

type QdrantPayload = {
  id?: unknown;
  title?: unknown;
  snippet?: unknown;
  source?: unknown;
  file?: unknown;
};

/* A plain REST search against Qdrant — no client library, so a deployment without Qdrant never
   loads one and there is nothing here for a deployment with Qdrant to depend on beyond the network
   call itself. Returns null on any failure. */
async function qdrantSearch(
  url: string,
  vector: number[],
  topK: number,
): Promise<KnowledgeResult[] | null> {
  try {
    const response = await fetch(
      `${url}/collections/${qdrantCollection()}/points/search`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vector, limit: Math.max(1, topK), with_payload: true }),
        signal: AbortSignal.timeout(VECTOR_STEP_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: { score?: number; payload?: QdrantPayload }[];
    };
    const hits = body.result;
    if (!Array.isArray(hits) || !hits.length) return null;
    const mapped = hits
      .map((hit) => {
        const payload = hit.payload ?? {};
        if (typeof payload.id !== "string" || typeof payload.title !== "string") return null;
        /* Provenance is re-attached from the catalog itself, by id: the payload stores text, not
           codes, and the authoritative shape lives in the JSON this process already loaded. An id
           the corpus does not know keeps the payload's source string and gets no codes. */
        const known = CORPUS_BY_ID.get(payload.id);
        const source =
          known?.source ??
          (typeof payload.source === "string" ? payload.source : "MyThuso knowledge base");
        return {
          id: payload.id,
          title: payload.title,
          snippet: typeof payload.snippet === "string" ? payload.snippet : "",
          source,
          score: typeof hit.score === "number" ? hit.score : 0,
          file: typeof payload.file === "string" ? payload.file : "knowledge",
          codes: known?.codes ?? {},
          citation: known?.citation ?? citationOf(source),
        } satisfies KnowledgeResult;
      })
      .filter((result): result is KnowledgeResult => result !== null);
    return mapped.length ? mapped : null;
  } catch {
    return null;
  }
}

/* ---- The retrieval cache ----

   Added with the speed pass of 23 September 2026: a plain in-memory LRU over retrieveKnowledge's
   results, keyed by the normalized query and the topK it was asked for. It exists because the same
   question is asked more than once in a conversation — a follow-up re-reads the knowledge base the
   turn before it just searched — and both roads through retrieveKnowledge are worth skipping on a
   repeat: the keyword floor re-scores all 250 entries, and the vector road costs an Azure embedding
   call and a Qdrant round-trip under a four-second ceiling. A hit returns the identical array the
   first call built, in constant time, with nothing on the network.

   THE BOUNDS ARE THE POINT. Two hundred entries, evicted oldest-first, and the whole cache is
   process-lifetime only: it dies on restart, holds no PHI beyond the query text a caller already
   sent, touches no disk and reads no environment. It is a Map used as an LRU — insertion order is
   recency, so a read re-inserts to mark itself recent and an eviction drops the first key — with no
   npm dependency, because a cache this small is not a thing to take a library for.

   The key folds case and whitespace so "Child  immunisation" and "child immunisation" are the one
   question they always were, and carries topK beside it because a four-result answer and a
   two-result answer to the same words are different arrays and must not be handed for one another.

   NOT TENANT-KEYED, BECAUSE NOTHING HERE IS TENANT-AWARE YET. Every caller today shares one
   deployment and one knowledge catalog, so a key of query+topK alone leaks nothing. The day a
   tenant concept reaches this service — packages/catalog/gilbertone-inference-isolation.json's
   no-cross-tenant-cache-reuse refusal is written against this exact cache — the key has to gain a
   tenant component before that day, not after: scripts/check-boundaries.mjs fails the build the
   moment a tenant identifier appears anywhere else in apps/assistant-api/src while this file still
   does not, so that moment cannot pass unnoticed. */
const CACHE_MAX = 200;
const cache = new Map<string, { results: KnowledgeResult[]; accessedAt: number }>();

/* A separator no query text carries, so a query ending in a digit cannot collide with the topK. */
const cacheKey = (query: string, topK: number): string =>
  `${query.trim().toLowerCase().replace(/\s+/g, " ")}\u0000${topK}`;

function cacheGet(key: string): KnowledgeResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  /* Re-insert to move this key to the end — the most-recently-used end of the LRU. */
  cache.delete(key);
  cache.set(key, entry);
  return entry.results;
}

function cacheSet(key: string, results: KnowledgeResult[]): void {
  if (cache.size >= CACHE_MAX) {
    /* Evict the oldest: a Map iterates in insertion order, so the first key is the least recent. */
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { results, accessedAt: Date.now() });
}

/* Exported for the tests, which must start from an empty cache to hold the network-call counts they
   assert on: retrieveKnowledge now answers a repeat from memory, so a test that counts embedding or
   Qdrant calls has to clear the cache first or a question an earlier test asked would never reach
   the wire. Nothing in the service calls this — the cache is meant to live for the process. */
export function clearKnowledgeCache(): void {
  cache.clear();
}

/* The door the tools use. Vector search when an operator has stood up Qdrant, keyword search
   always — and whatever goes wrong on the vector road, the answer is the keyword floor, never an
   error, in exactly the way the chat tier falls back to the classifier. The query is embedded
   through embedWithAzure() in llm-adapter.ts — the same function, same credentials and same
   redaction the ingestion script uses to embed the catalog it is being searched against, so the
   two sides of the comparison are never built two different ways.

   Since the speed pass of 23 September 2026 the whole lookup is wrapped in the LRU cache above: a
   repeated (query, topK) is answered from memory before either road is taken, and a first ask
   caches whatever the two roads produced — vector hits or the keyword floor alike — so the next one
   is free. The cache sits in front of the fallback logic rather than inside it, so a hit skips the
   embedding call and the Qdrant round-trip too, which is the latency the pass exists to remove. */
export async function retrieveKnowledge(
  query: string,
  topK: number = 4,
): Promise<KnowledgeResult[]> {
  const key = cacheKey(query, topK);
  const cached = cacheGet(key);
  if (cached) return cached;

  const results = await retrieveUncached(query, topK);
  cacheSet(key, results);
  return results;
}

async function retrieveUncached(
  query: string,
  topK: number,
): Promise<KnowledgeResult[]> {
  const url = qdrantUrl();
  if (!url) return searchKnowledge(query, topK);
  const vector = await embedWithAzure(query, VECTOR_STEP_TIMEOUT_MS);
  if (vector) {
    const hits = await qdrantSearch(url, vector, topK);
    if (hits) return hits;
  } else if (!azureCredentials()) {
    /* No Azure embedding credentials: the vector road is closed for a reason an operator can fix,
       and that is worth one line in the log rather than silence. */
    console.log("[gilbertone:knowledge] qdrant configured but no embedding model; keyword search used");
  } else {
    console.log("[gilbertone:knowledge] qdrant configured but the embedding call failed; keyword search used");
  }
  return searchKnowledge(query, topK);
}

/* For the audit-minded: what this process actually loaded. */
export const knowledgeStats = (): { entries: number; files: number } => ({
  entries: CORPUS.length,
  files: new Set(CORPUS.map((entry) => entry.file)).size,
});

/* One catalog entry, one embeddable record — most entries here are already short catalog rows
   (a condition, a medicine, a first-aid procedure), so splitting one into several pieces would
   only separate a drug's name from its own dosage. Exported for
   scripts/ingest-knowledge-embeddings.mjs, which is the single place that turns these into Qdrant
   points, so the text a vector represents and the text the keyword index scores are computed from
   the same corpus rather than two hand-kept copies of "what does this entry mean". `text` embeds
   the full, untruncated content — the display `snippet` is cut to 240 characters for the panel,
   which is too short to embed the entry well. */
export type KnowledgeChunk = {
  id: string;
  title: string;
  source: string;
  file: string;
  snippet: string;
  text: string;
};

export function knowledgeChunks(): KnowledgeChunk[] {
  return CORPUS.map((entry) => ({
    id: entry.id,
    title: entry.title,
    source: entry.source,
    file: entry.file,
    snippet: entry.snippet,
    text: `${entry.title}. ${entry.content}`,
  }));
}
