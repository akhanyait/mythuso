import conditions from "../../../../packages/catalog/knowledge/conditions.json" with { type: "json" };
import medications from "../../../../packages/catalog/knowledge/medications.json" with { type: "json" };
import firstAid from "../../../../packages/catalog/knowledge/first-aid.json" with { type: "json" };
import maternal from "../../../../packages/catalog/knowledge/maternal.json" with { type: "json" };
import chronic from "../../../../packages/catalog/knowledge/chronic.json" with { type: "json" };
import mentalHealth from "../../../../packages/catalog/knowledge/mental-health.json" with { type: "json" };
import saHealthSystem from "../../../../packages/catalog/knowledge/sa-health-system.json" with { type: "json" };
import prevention from "../../../../packages/catalog/knowledge/prevention.json" with { type: "json" };
import interactions from "../../../../packages/catalog/knowledge/interactions.json" with { type: "json" };
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";
import { AZURE_API_VERSION } from "./llm-adapter.ts";

/* The knowledge tier, added on 21 September 2026: the 250 catalog entries under
   packages/catalog/knowledge — conditions, medicines, first aid, maternal care, chronic illness,
   mental health, the SA health system, prevention and drug interactions — made searchable for the
   orchestrator's tools.

   WHAT THIS MODULE IS AND IS NOT. It is a lookup layer: it never decides anything, never ranks a
   condition more likely than another in a clinical sense, and never addresses a person. It puts
   catalog text in front of a model that is itself barred from diagnosing or prescribing. The
   ranking below is term overlap — a reading aid, not a clinical assessment.

   KEYWORD SEARCH, NO EMBEDDINGS, BY DESIGN. Qdrant is not deployed and no embedding model is
   configured in any deployment of this product, so the default path is a plain TF-IDF keyword
   search over an in-memory index built once at startup from static JSON imports — the same way the
   adapter reads assistant.json, so the knowledge this service searches is the knowledge the
   catalog says it has. If an operator sets QDRANT_URL, retrieveKnowledge() will try a vector
   search first (query embedded through the same Azure credentials the chat tier reads, both under
   short timeouts) and fall back to the keyword path on any failure — the keyword path is not a
   degraded mode, it is the floor that cannot be removed from under a person's question. */

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
  source?: string;
  [key: string]: unknown;
};

type IndexedEntry = {
  file: string;
  id: string;
  title: string;
  source: string;
  snippet: string;
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
   symptoms, medications with their dosage, first aid with its steps. id, tags and source are
   excluded — id and source are attribution, not content, and tags are indexed separately at
   their own weight. */
const contentOf = (entry: KnowledgeEntry): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "tags" || key === "source") continue;
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
  return {
    file,
    id: entry.id,
    title,
    source: typeof entry.source === "string" ? entry.source : "MyThuso knowledge base",
    snippet: snippetOf(content),
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
    };
  })
    .filter((result): result is KnowledgeResult => result !== null && result.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, topK));
  return scored;
}

/* ---- The Qdrant path, future-proofing only ---- */

const QDRANT_TIMEOUT_MS = 4000;
const EMBEDDING_TIMEOUT_MS = 4000;
const QDRANT_DEFAULT_COLLECTION = "gilbertone-knowledge";
const EMBEDDING_DEFAULT_MODEL = "text-embedding-3-small";

const qdrantUrl = (): string => (process.env.QDRANT_URL ?? "").trim().replace(/\/+$/, "");
const qdrantCollection = (): string =>
  (process.env.QDRANT_COLLECTION ?? "").trim() || QDRANT_DEFAULT_COLLECTION;

/* The query vector, through the same Azure credentials the chat tier reads. The query is redacted
   first — the same rule that governs every message that leaves this process. Returns null when
   Azure is not configured or anything fails: null is the instruction to use the keyword floor. */
async function embedQuery(query: string): Promise<number[] | null> {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.AZURE_OPENAI_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? "").trim();
  if (!endpoint || !key) return null;
  const model =
    (process.env.AZURE_OPENAI_EMBEDDING_MODEL ?? "").trim() || EMBEDDING_DEFAULT_MODEL;
  try {
    const response = await fetch(
      `${endpoint}/openai/deployments/${model}/embeddings?api-version=${AZURE_API_VERSION}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": key },
        body: JSON.stringify({ input: redactPHI(query) }),
        signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { embedding?: number[] }[] };
    const vector = body.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length ? vector : null;
  } catch {
    return null;
  }
}

type QdrantPayload = {
  id?: unknown;
  title?: unknown;
  snippet?: unknown;
  source?: unknown;
  file?: unknown;
};

/* A plain REST search against Qdrant — no client library, so the future-proofing costs no new
   dependency and a deployment without Qdrant never loads one. Returns null on any failure. */
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
        signal: AbortSignal.timeout(QDRANT_TIMEOUT_MS),
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
        return {
          id: payload.id,
          title: payload.title,
          snippet: typeof payload.snippet === "string" ? payload.snippet : "",
          source:
            typeof payload.source === "string"
              ? payload.source
              : "MyThuso knowledge base",
          score: typeof hit.score === "number" ? hit.score : 0,
          file: typeof payload.file === "string" ? payload.file : "knowledge",
        } satisfies KnowledgeResult;
      })
      .filter((result): result is KnowledgeResult => result !== null);
    return mapped.length ? mapped : null;
  } catch {
    return null;
  }
}

/* The door the tools use. Vector search when an operator has stood up Qdrant, keyword search
   always — and whatever goes wrong on the vector road, the answer is the keyword floor, never an
   error, in exactly the way the chat tier falls back to the classifier. */
export async function retrieveKnowledge(
  query: string,
  topK: number = 4,
): Promise<KnowledgeResult[]> {
  const url = qdrantUrl();
  if (!url) return searchKnowledge(query, topK);
  const vector = await embedQuery(query);
  if (vector) {
    const hits = await qdrantSearch(url, vector, topK);
    if (hits) return hits;
  } else {
    /* No Azure embedding credentials: the vector road is closed for a reason an operator can fix,
       and that is worth one line in the log rather than silence. */
    console.log("[gilbertone:knowledge] qdrant configured but no embedding model; keyword search used");
  }
  return searchKnowledge(query, topK);
}

/* For the audit-minded: what this process actually loaded. */
export const knowledgeStats = (): { entries: number; files: number } => ({
  entries: CORPUS.length,
  files: new Set(CORPUS.map((entry) => entry.file)).size,
});
