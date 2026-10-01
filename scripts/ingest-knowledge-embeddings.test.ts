import test from "node:test";
import assert from "node:assert/strict";
import { batches, pointFor, pointIdFor } from "./ingest-knowledge-embeddings.mjs";
import { knowledgeChunks } from "../apps/assistant-api/src/lib/knowledge.ts";

/* The ingestion script's own tests, added with the Qdrant path it fills on 21 September 2026.
   Nothing here touches a network — embedWithAzure() and the Qdrant HTTP calls are exercised by
   apps/assistant-api/src/lib/knowledge.test.ts and llm-adapter.test.ts against local stub servers,
   the same convention this codebase already uses. What is specific to this script and worth its
   own tests is the chunking: one catalog entry becomes exactly one embeddable record, a stable id,
   and a payload a vector hit can be traced back through. */

test("the catalog chunks one-to-one: every entry becomes one embeddable record", () => {
  const chunks = knowledgeChunks();
  assert.equal(chunks.length, 261, "the whole catalog, the same count knowledge.test.ts pins");
  for (const chunk of chunks) {
    assert.ok(chunk.id.length > 0);
    assert.ok(chunk.title.length > 0);
    assert.ok(chunk.source.length > 0);
    assert.ok(chunk.file.length > 0);
    assert.ok(
      chunk.text.startsWith(chunk.title),
      `the embedded text leads with the entry's own title ("${chunk.title}")`,
    );
    assert.ok(
      chunk.text.length >= chunk.snippet.length,
      "the embedded text carries at least as much as the 240-character display snippet — " +
        "embedding the truncated snippet instead would throw away what makes the entry findable",
    );
  }
});

test("catalog ids map to well-formed, collision-free point ids", () => {
  const chunks = knowledgeChunks();
  const ids = chunks.map((chunk) => pointIdFor(chunk.id));
  assert.equal(
    new Set(ids).size,
    ids.length,
    "every one of the 261 catalog ids maps to a distinct Qdrant point id",
  );
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      "a version-5 UUID, which is what Qdrant accepts as a point id — an arbitrary string like " +
        `"cond-001" is not (got "${id}")`,
    );
});

test("the same catalog id always maps to the same point id, so a re-run overwrites rather than duplicates", () => {
  assert.equal(pointIdFor("cond-001"), pointIdFor("cond-001"));
  assert.notEqual(pointIdFor("cond-001"), pointIdFor("cond-002"));
});

test("batching groups items in order, without dropping or duplicating any", () => {
  const items = Array.from({ length: 47 }, (_, i) => i);
  const grouped = batches(items, 20);
  assert.equal(grouped.length, 3);
  assert.deepEqual(
    grouped.map((batch) => batch.length),
    [20, 20, 7],
  );
  assert.deepEqual(grouped.flat(), items, "every item appears exactly once, in its original order");
});

test("batching a set that divides evenly does not add an empty trailing batch", () => {
  const items = Array.from({ length: 40 }, (_, i) => i);
  const grouped = batches(items, 20);
  assert.equal(grouped.length, 2);
});

test("a point carries exactly what a vector hit needs to trace back to its catalog entry", () => {
  const [chunk] = knowledgeChunks();
  const point = pointFor(chunk, [0.1, 0.2, 0.3]);
  assert.equal(point.id, pointIdFor(chunk.id));
  assert.deepEqual(point.vector, [0.1, 0.2, 0.3]);
  assert.deepEqual(
    point.payload,
    {
      id: chunk.id,
      title: chunk.title,
      source: chunk.source,
      file: chunk.file,
      snippet: chunk.snippet,
    },
    "exactly the fields retrieveKnowledge()'s qdrantSearch() reads back as a KnowledgeResult — " +
      "the embedded text itself is not payload, only what attributes the hit",
  );
});
