/* Embeds the 250 catalog entries apps/assistant-api/src/lib/knowledge.ts already indexes for
   keyword search, and upserts them into Qdrant as vectors — so the same product can find an entry
   by meaning as well as by shared words, once an operator has stood up Qdrant and pointed this
   script at it. Every point's payload carries the entry's own id, title, source and file, the
   fields knowledge.ts's KnowledgeResult already carries for a keyword hit, so a vector hit can be
   traced back to exactly the same catalog entry the same way.

   WHY THIS SCRIPT IS NOT scripts/emit-*.mjs, THOUGH IT FOLLOWS THEIR SHAPE. Every emit-*.mjs turns
   catalog JSON into checked-in source, and scripts/check-boundaries.mjs compares what it returns
   against what is on disk so a stale generated file fails the build. This script has no disk output
   to compare — its output is a side effect in a service an operator stood up outside this repo — so
   there is nothing to diff, it is not part of `npm run generate`, and check-boundaries.mjs does not
   know about it. An operator runs it once after standing up Qdrant, and again whenever the
   knowledge catalog changes.

   ONE ENTRY, ONE CHUNK. The catalog's entries are already the size a chunk should be — a condition,
   a medicine, a first-aid procedure, each a few hundred words at most. Splitting one into several
   pieces would separate a drug's name from its own dosage; joining several into one would blur a
   query for one condition onto the neighbour it happened to share a chunk with. So "chunking" here
   is knowledgeChunks() in knowledge.ts turning one catalog record into one embeddable record, not
   paragraph-splitting a document — the same shape the keyword index already reads each entry in.

   LOUD WHEN MISCONFIGURED, THE OPPOSITE OF THE QUERY PATH. retrieveKnowledge() at query time must
   never fail a person's question over an unreachable Qdrant — it falls back to the keyword floor
   and says nothing louder than a log line, because the floor cannot be removed from under a
   question. This script is the opposite case: an operator asked it, on purpose, to populate a store
   the product will then trust, so a missing credential, a failed embedding call or a rejected
   upsert exits non-zero and says what went wrong, rather than leaving Qdrant half-seeded and
   looking like it succeeded. */

import { createHash } from "node:crypto";
import { embedWithAzure } from "../apps/assistant-api/src/lib/llm-adapter.ts";
import { knowledgeChunks } from "../apps/assistant-api/src/lib/knowledge.ts";

const QDRANT_DEFAULT_COLLECTION = "gilbertone-knowledge";
/* Upserts and collection creation are administrative calls the operator is watching, not a
   per-request path a person is waiting on — generous compared with the 4s ceiling retrieveKnowledge
   holds itself to at query time, but still a ceiling, so a stalled Qdrant fails this run rather than
   hanging it forever. */
const QDRANT_TIMEOUT_MS = 15_000;
const EMBED_TIMEOUT_MS = 15_000;
/* How many entries embed at once. Azure OpenAI's embeddings endpoint takes one request per call
   here (no batching in the request body, to keep the request shape identical to the one
   embedWithAzure() sends for a single query), so concurrency is what keeps 250 entries from taking
   250 sequential round trips; small enough that a modest account's rate limit does not reject the
   run outright. */
const EMBED_CONCURRENCY = 4;
/* Points per Qdrant upsert call — comfortably under any reasonable request-size limit, and small
   enough that a rejected batch names a fifth of the catalog rather than all of it. */
const UPSERT_BATCH_SIZE = 50;

/* Qdrant point ids must be an unsigned integer or a UUID — an arbitrary string like "cond-001" is
   rejected. A version-5 UUID (SHA-1 of a namespace-free name, laid out with the version and variant
   bits it must carry) turns the catalog's own id into one deterministically: the same catalog id
   always maps to the same point id, so re-running this script overwrites the entry that changed
   instead of leaving the old vector beside a new one under a different id. */
export function pointIdFor(catalogId) {
  const hash = createHash("sha1").update(catalogId).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/* Groups items into fixed-size slices, in order, dropping nothing and duplicating nothing — used
   both for the embedding concurrency pool and for the Qdrant upsert batches below. */
export function batches(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* One chunk plus its vector, turned into the point Qdrant stores — the payload is exactly the
   fields retrieveKnowledge()'s qdrantSearch() reads back in knowledge.ts, so a hit returns as a
   KnowledgeResult the same shape a keyword hit does. */
export function pointFor(chunk, vector) {
  return {
    id: pointIdFor(chunk.id),
    vector,
    payload: {
      id: chunk.id,
      title: chunk.title,
      source: chunk.source,
      file: chunk.file,
      snippet: chunk.snippet,
    },
  };
}

/* Runs `worker` over `items` with at most `limit` in flight at once, preserving result order — a
   concurrency pool without a dependency, since nothing else in this codebase pulls one in for it. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return results;
}

async function ensureCollection(url, collection, size) {
  const existing = await fetch(`${url}/collections/${collection}`, {
    signal: AbortSignal.timeout(QDRANT_TIMEOUT_MS),
  });
  if (existing.ok) return;
  const created = await fetch(`${url}/collections/${collection}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vectors: { size, distance: "Cosine" } }),
    signal: AbortSignal.timeout(QDRANT_TIMEOUT_MS),
  });
  if (!created.ok)
    throw new Error(
      `could not create Qdrant collection "${collection}": ${created.status} ${await created.text()}`,
    );
}

async function upsertBatch(url, collection, points) {
  const response = await fetch(`${url}/collections/${collection}/points?wait=true`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(QDRANT_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(
      `Qdrant rejected a batch of ${points.length} points: ${response.status} ${await response.text()}`,
    );
}

async function main() {
  const url = (process.env.QDRANT_URL ?? "").trim().replace(/\/+$/, "");
  if (!url) {
    console.error(
      "QDRANT_URL is not set. This script populates a Qdrant instance — point it at one, the " +
        "same way retrieveKnowledge() in apps/assistant-api/src/lib/knowledge.ts is told to search it.",
    );
    process.exitCode = 1;
    return;
  }
  const collection = (process.env.QDRANT_COLLECTION ?? "").trim() || QDRANT_DEFAULT_COLLECTION;

  const chunks = knowledgeChunks();
  console.log(`embedding ${chunks.length} knowledge entries through Azure OpenAI…`);

  const embedded = await mapWithConcurrency(chunks, EMBED_CONCURRENCY, async (chunk) => {
    const vector = await embedWithAzure(chunk.text, EMBED_TIMEOUT_MS);
    if (!vector)
      throw new Error(
        `embedding failed for ${chunk.id} ("${chunk.title}") — check AZURE_OPENAI_ENDPOINT, ` +
          "AZURE_OPENAI_KEY (or AZURE_OPENAI_API_KEY) and, if the account's deployment is not " +
          "named text-embedding-3-small, AZURE_OPENAI_EMBEDDING_MODEL.",
      );
    return { chunk, vector };
  });

  const size = embedded[0].vector.length;
  await ensureCollection(url, collection, size);

  const points = embedded.map(({ chunk, vector }) => pointFor(chunk, vector));
  let done = 0;
  for (const batch of batches(points, UPSERT_BATCH_SIZE)) {
    await upsertBatch(url, collection, batch);
    done += batch.length;
    console.log(`upserted ${done}/${points.length} points into "${collection}"`);
  }

  console.log(`done: ${points.length} entries embedded and upserted into "${collection}" at ${url}.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
