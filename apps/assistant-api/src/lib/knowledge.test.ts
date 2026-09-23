import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  clearKnowledgeCache,
  knowledgeStats,
  retrieveKnowledge,
  searchKnowledge,
  tokenize,
} from "./knowledge.ts";

/* The knowledge tier's own tests, added with it on 21 September 2026. The corpus assertions pin
   the loader to the catalog's own counts — 250 entries across the nine files the catalog ships —
   so a file that stops loading fails here rather than quietly shrinking what the tools can find.
   The search assertions are about the shape of an honest answer: ranked, attributed, and silent
   rather than guessing. The Qdrant tests cover both halves of the future-proofing: a configured
   vector store is asked first, and anything that goes wrong on that road lands on the keyword
   floor rather than an error. */

const ENV_KEYS = [
  "QDRANT_URL",
  "QDRANT_COLLECTION",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_EMBEDDING_MODEL",
] as const;

const withEnv = async <T>(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  body: () => Promise<T>,
): Promise<T> => {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values))
    if (value) process.env[key] = value;
  /* retrieveKnowledge now answers a repeated (query, topK) from its LRU cache, so each env-scoped
     test starts from an empty one: a question an earlier test asked would otherwise be served from
     memory and never reach the embedding or Qdrant call these tests count. */
  clearKnowledgeCache();
  try {
    return await body();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("the whole catalog loads once: 250 entries across the nine knowledge files", () => {
  const stats = knowledgeStats();
  assert.equal(stats.entries, 250);
  assert.equal(stats.files, 9);
});

test("a question about immunisation finds the EPI entries, ranked and attributed", () => {
  const results = searchKnowledge("child immunisation schedule");
  assert.ok(
    results.length >= 2,
    "the corpus carries two immunisation schedules",
  );
  assert.ok(
    results[0].title.toLowerCase().includes("immunisation"),
    `the strongest hit should be an immunisation entry, not "${results[0].title}"`,
  );
  for (const result of results) {
    assert.ok(result.id.length > 0, "every result carries the entry id");
    assert.ok(result.title.length > 0);
    assert.ok(result.snippet.length > 0);
    assert.ok(result.source.length > 0, "attribution is not optional");
    assert.ok(result.score > 0 && result.score <= 1);
  }
  for (let i = 1; i < results.length; i += 1)
    assert.ok(
      results[i - 1].score >= results[i].score,
      "results are ranked strongest first",
    );
  assert.ok(
    results.some((result) => result.source.includes("Immunisation")),
    "an EPI entry is among the hits, with its source",
  );
});

test("topK is a ceiling on the answer, not a suggestion", () => {
  const two = searchKnowledge("child immunisation schedule", 2);
  assert.equal(two.length, 2);
});

test("a question with no footing in the corpus is silence, not a guess", () => {
  assert.deepEqual(searchKnowledge("zzz qqq nothing here"), []);
});

test("a question made only of stopwords has nothing to search with", () => {
  assert.deepEqual(searchKnowledge("the and of"), []);
});

test("the tokenizer stems the safe endings, drops function words, keeps the rest", () => {
  assert.deepEqual(tokenize("Babies have symptoms: runny noses"), [
    "baby",
    "symptom",
    "runny",
    "nose",
  ]);
  /* Words a blunt stemmer would mangle are left whole — "illness" must stay findable. */
  assert.deepEqual(tokenize("illness virus"), ["illness", "virus"]);
});

test("without QDRANT_URL the door is the keyword search, result for result", async () => {
  await withEnv({}, async () => {
    const throughTheDoor = await retrieveKnowledge(
      "child immunisation schedule",
      2,
    );
    const direct = searchKnowledge("child immunisation schedule", 2);
    assert.deepEqual(throughTheDoor, direct);
  });
});

test("a Qdrant an operator stood up is asked first, and its hits come back attributed", async () => {
  const embeddingsBodies: string[] = [];
  const qdrantBodies: string[] = [];
  /* One stub, two roads: the embeddings call the Azure shape answers, the points search the
    Qdrant shape. Both captured, because what leaves this process is the thing under test. */
  const stub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "content-type": "application/json" });
      if (req.url?.includes("/embeddings")) {
        embeddingsBodies.push(body);
        res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
        return;
      }
      qdrantBodies.push(body);
      res.end(
        JSON.stringify({
          result: [
            {
              score: 0.95,
              payload: {
                id: "stub-001",
                title: "Stub entry",
                snippet: "Stub snippet",
                source: "Stub source",
                file: "prevention",
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const address = stub.address();
  assert.ok(address && typeof address === "object");
  try {
    await withEnv(
      {
        QDRANT_URL: `http://127.0.0.1:${address.port}`,
        AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${address.port}`,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        const results = await retrieveKnowledge(
          "my id number is 8001015009087",
        );
        /* The vector road answered, so the keyword floor is not what returned. */
        assert.equal(results.length, 1);
        assert.equal(results[0].id, "stub-001");
        assert.equal(results[0].title, "Stub entry");
        assert.equal(results[0].source, "Stub source");
        assert.equal(results[0].file, "prevention");
      },
    );
  } finally {
    stub.closeAllConnections();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
  }
  assert.equal(embeddingsBodies.length, 1, "one embedding call");
  assert.equal(qdrantBodies.length, 1, "one vector search");
  /* The query is redacted before it leaves for embedding — the same rule every message out
    of this process follows. */
  assert.ok(embeddingsBodies[0].includes("[ID REDACTED]"));
  assert.equal(embeddingsBodies[0].includes("8001015009087"), false);
  const search = JSON.parse(qdrantBodies[0]) as {
    limit?: number;
    with_payload?: boolean;
  };
  assert.equal(search.limit, 4, "topK travels to the vector store");
  assert.equal(
    search.with_payload,
    true,
    "payloads come back, or there is nothing to attribute",
  );
});

test("Qdrant configured but nothing to embed with lands on the keyword floor", async () => {
  await withEnv({ QDRANT_URL: "http://127.0.0.1:9" }, async () => {
    const throughTheDoor = await retrieveKnowledge(
      "child immunisation schedule",
      2,
    );
    assert.deepEqual(
      throughTheDoor,
      searchKnowledge("child immunisation schedule", 2),
    );
  });
});

test("the embedding succeeds but Qdrant itself is unreachable: still the keyword floor", async () => {
  /* Azure answers (a real deployment, a real key) and the vector road still fails, because nothing
    is listening at QDRANT_URL — the fetch to Qdrant itself throws. That must land in exactly the
    same place a missing credential does. */
  const azureStub = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
  });
  await new Promise<void>((resolve) =>
    azureStub.listen(0, "127.0.0.1", resolve),
  );
  const address = azureStub.address();
  assert.ok(address && typeof address === "object");
  try {
    await withEnv(
      {
        QDRANT_URL: "http://127.0.0.1:9",
        AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${address.port}`,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        const throughTheDoor = await retrieveKnowledge(
          "child immunisation schedule",
          2,
        );
        assert.deepEqual(
          throughTheDoor,
          searchKnowledge("child immunisation schedule", 2),
        );
      },
    );
  } finally {
    azureStub.closeAllConnections();
    await new Promise<void>((resolve) => azureStub.close(() => resolve()));
  }
});

test("Qdrant answers with an error status: still the keyword floor, not an error a patient sees", async () => {
  const qdrantBodies: string[] = [];
  const stub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (req.url?.includes("/embeddings")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
        return;
      }
      qdrantBodies.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: { error: "collection not found" } }));
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const address = stub.address();
  assert.ok(address && typeof address === "object");
  try {
    await withEnv(
      {
        QDRANT_URL: `http://127.0.0.1:${address.port}`,
        AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${address.port}`,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        const throughTheDoor = await retrieveKnowledge(
          "child immunisation schedule",
          2,
        );
        assert.deepEqual(
          throughTheDoor,
          searchKnowledge("child immunisation schedule", 2),
        );
      },
    );
  } finally {
    stub.closeAllConnections();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
  }
  assert.equal(
    qdrantBodies.length,
    1,
    "the vector store was asked, and it answered badly",
  );
});

test("Qdrant times out: the keyword floor answers instead of a hung request", async () => {
  const azureStub = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
  });
  /* Accepts the connection and never answers — the shape of a hung Qdrant, distinct from an
    unreachable one (which fails the connection outright) and from an error status (which answers
    fast but badly). All three must reach the same keyword floor. */
  const stallingQdrant = createServer(() => {});
  await new Promise<void>((resolve) =>
    azureStub.listen(0, "127.0.0.1", resolve),
  );
  await new Promise<void>((resolve) =>
    stallingQdrant.listen(0, "127.0.0.1", resolve),
  );
  const azureAddress = azureStub.address();
  const qdrantAddress = stallingQdrant.address();
  assert.ok(azureAddress && typeof azureAddress === "object");
  assert.ok(qdrantAddress && typeof qdrantAddress === "object");
  try {
    await withEnv(
      {
        QDRANT_URL: `http://127.0.0.1:${qdrantAddress.port}`,
        AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${azureAddress.port}`,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        const started = Date.now();
        const throughTheDoor = await retrieveKnowledge(
          "child immunisation schedule",
          2,
        );
        const elapsed = Date.now() - started;
        assert.deepEqual(
          throughTheDoor,
          searchKnowledge("child immunisation schedule", 2),
        );
        assert.ok(
          elapsed < 8_000,
          `the timeout should end the wait, and ${elapsed}ms did not`,
        );
      },
    );
  } finally {
    azureStub.closeAllConnections();
    stallingQdrant.closeAllConnections();
    await new Promise<void>((resolve) => azureStub.close(() => resolve()));
    await new Promise<void>((resolve) => stallingQdrant.close(() => resolve()));
  }
});

/* ---- The retrieval cache ----

   Added with the speed pass of 23 September 2026. These three hold the LRU in knowledge.ts to its
   own promise: a repeated question is answered from memory rather than re-queried, the cache is
   bounded at 200 entries and evicts oldest-first, and clearKnowledgeCache() empties it. Each runs
   against a counting stub on the vector road, because a cache hit is only observable as a network
   call that did not happen — the keyword floor returns identical results whether or not it ran. */

/* One stub wearing both Azure's embedding shape and Qdrant's search shape, counting the embedding
   calls it answers: the count is the observable fact these tests read. */
const countingVectorStub = async (): Promise<{
  url: string;
  embeddings: () => number;
  close: () => Promise<void>;
}> => {
  let embeddingCalls = 0;
  const stub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      if (req.url?.includes("/embeddings")) {
        embeddingCalls += 1;
        res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
        return;
      }
      res.end(
        JSON.stringify({
          result: [
            {
              score: 0.9,
              payload: {
                id: "stub-001",
                title: "Stub entry",
                snippet: "Stub snippet",
                source: "Stub source",
                file: "prevention",
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const address = stub.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    embeddings: () => embeddingCalls,
    close: async () => {
      stub.closeAllConnections();
      await new Promise<void>((resolve) => stub.close(() => resolve()));
    },
  };
};

test("a repeated question is answered from the cache, not re-queried", async () => {
  const stub = await countingVectorStub();
  try {
    await withEnv(
      {
        QDRANT_URL: stub.url,
        AZURE_OPENAI_ENDPOINT: stub.url,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        const first = await retrieveKnowledge("child immunisation schedule", 4);
        const afterFirst = stub.embeddings();
        assert.equal(afterFirst, 1, "the first ask embeds and searches once");

        /* The same words, differing only in case and spacing, are the one question: the normalized
           key means this is a hit, so no second embedding call reaches the stub. */
        const second = await retrieveKnowledge(
          "  Child   Immunisation SCHEDULE ",
          4,
        );
        assert.equal(
          stub.embeddings(),
          afterFirst,
          "a repeated question is served from memory, with nothing on the network",
        );
        assert.deepEqual(second, first, "the cached array is the one the first call built");
      },
    );
  } finally {
    await stub.close();
  }
});

test("the cache is bounded at 200 entries and evicts the oldest first", async () => {
  const stub = await countingVectorStub();
  try {
    await withEnv(
      {
        QDRANT_URL: stub.url,
        AZURE_OPENAI_ENDPOINT: stub.url,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        /* Fill past the ceiling: q0 is written first, then q1..q200 push the cache over 200 and
           evict q0 as the oldest. Each is a distinct normalized key, so each is its own entry. */
        for (let i = 0; i <= 200; i += 1)
          await retrieveKnowledge(`distinct query number q${i}`, 4);

        const before = stub.embeddings();
        /* q0 was evicted, so asking it again is a miss and reaches the wire. */
        await retrieveKnowledge("distinct query number q0", 4);
        assert.equal(
          stub.embeddings(),
          before + 1,
          "the oldest entry was evicted, so it is queried again rather than served from memory",
        );
        /* q200 is the most recent, so it is still cached and asking it is a hit. */
        const afterQ0 = stub.embeddings();
        await retrieveKnowledge("distinct query number q200", 4);
        assert.equal(
          stub.embeddings(),
          afterQ0,
          "a recent entry is still cached, so it is not re-queried",
        );
      },
    );
  } finally {
    await stub.close();
  }
});

test("clearKnowledgeCache() empties the cache, so the next ask is a miss", async () => {
  const stub = await countingVectorStub();
  try {
    await withEnv(
      {
        QDRANT_URL: stub.url,
        AZURE_OPENAI_ENDPOINT: stub.url,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        await retrieveKnowledge("maternal antenatal care", 4);
        const before = stub.embeddings();
        assert.equal(before, 1);

        /* withEnv cleared the cache on entry; clearing it again mid-test must make the repeat a
           miss rather than a hit. */
        clearKnowledgeCache();
        await retrieveKnowledge("maternal antenatal care", 4);
        assert.equal(
          stub.embeddings(),
          before + 1,
          "after a clear the same question is queried again",
        );
      },
    );
  } finally {
    await stub.close();
  }
});
