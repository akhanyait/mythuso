import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  knowledgeStats,
  retrieveKnowledge,
  searchKnowledge,
  tokenize,
} from './knowledge.ts';

/* The knowledge tier's own tests, added with it on 21 September 2026. The corpus assertions pin
   the loader to the catalog's own counts — 250 entries across the nine files the catalog ships —
   so a file that stops loading fails here rather than quietly shrinking what the tools can find.
   The search assertions are about the shape of an honest answer: ranked, attributed, and silent
   rather than guessing. The Qdrant tests cover both halves of the future-proofing: a configured
   vector store is asked first, and anything that goes wrong on that road lands on the keyword
   floor rather than an error. */

const ENV_KEYS = [
 'QDRANT_URL',
 'QDRANT_COLLECTION',
 'AZURE_OPENAI_ENDPOINT',
 'AZURE_OPENAI_KEY',
 'AZURE_OPENAI_API_KEY',
 'AZURE_OPENAI_EMBEDDING_MODEL',
] as const;

const withEnv = async <T>(
 values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
 body: () => Promise<T>,
): Promise<T> => {
 const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
 for (const key of ENV_KEYS) delete process.env[key];
 for (const [key, value] of Object.entries(values)) if (value) process.env[key] = value;
 try {
  return await body();
 } finally {
  for (const [key, value] of saved) {
   if (value === undefined) delete process.env[key];
   else process.env[key] = value;
  }
 }
};

test('the whole catalog loads once: 250 entries across the nine knowledge files', () => {
 const stats = knowledgeStats();
 assert.equal(stats.entries, 250);
 assert.equal(stats.files, 9);
});

test('a question about immunisation finds the EPI entries, ranked and attributed', () => {
 const results = searchKnowledge('child immunisation schedule');
 assert.ok(results.length >= 2, 'the corpus carries two immunisation schedules');
 assert.ok(
  results[0].title.toLowerCase().includes('immunisation'),
  `the strongest hit should be an immunisation entry, not "${results[0].title}"`,
 );
 for (const result of results) {
  assert.ok(result.id.length > 0, 'every result carries the entry id');
  assert.ok(result.title.length > 0);
  assert.ok(result.snippet.length > 0);
  assert.ok(result.source.length > 0, 'attribution is not optional');
  assert.ok(result.score > 0 && result.score <= 1);
 }
 for (let i = 1; i < results.length; i += 1)
  assert.ok(
   results[i - 1].score >= results[i].score,
   'results are ranked strongest first',
  );
 assert.ok(
  results.some((result) => result.source.includes('Immunisation')),
  'an EPI entry is among the hits, with its source',
 );
});

test('topK is a ceiling on the answer, not a suggestion', () => {
 const two = searchKnowledge('child immunisation schedule', 2);
 assert.equal(two.length, 2);
});

test('a question with no footing in the corpus is silence, not a guess', () => {
 assert.deepEqual(searchKnowledge('zzz qqq nothing here'), []);
});

test('a question made only of stopwords has nothing to search with', () => {
 assert.deepEqual(searchKnowledge('the and of'), []);
});

test('the tokenizer stems the safe endings, drops function words, keeps the rest', () => {
 assert.deepEqual(tokenize('Babies have symptoms: runny noses'), [
  'baby',
  'symptom',
  'runny',
  'nose',
 ]);
 /* Words a blunt stemmer would mangle are left whole — "illness" must stay findable. */
 assert.deepEqual(tokenize('illness virus'), ['illness', 'virus']);
});

test('without QDRANT_URL the door is the keyword search, result for result', async () => {
 await withEnv({}, async () => {
  const throughTheDoor = await retrieveKnowledge('child immunisation schedule', 2);
  const direct = searchKnowledge('child immunisation schedule', 2);
  assert.deepEqual(throughTheDoor, direct);
 });
});

test('a Qdrant an operator stood up is asked first, and its hits come back attributed', async () => {
 const embeddingsBodies: string[] = [];
 const qdrantBodies: string[] = [];
 /* One stub, two roads: the embeddings call the Azure shape answers, the points search the
    Qdrant shape. Both captured, because what leaves this process is the thing under test. */
 const stub = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
   const body = Buffer.concat(chunks).toString('utf8');
   res.writeHead(200, { 'content-type': 'application/json' });
   if (req.url?.includes('/embeddings')) {
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
        id: 'stub-001',
        title: 'Stub entry',
        snippet: 'Stub snippet',
        source: 'Stub source',
        file: 'prevention',
       },
      },
     ],
    }),
   );
  });
 });
 await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
 const address = stub.address();
 assert.ok(address && typeof address === 'object');
 try {
  await withEnv(
   {
    QDRANT_URL: `http://127.0.0.1:${address.port}`,
    AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${address.port}`,
    AZURE_OPENAI_KEY: 'a-key',
   },
   async () => {
    const results = await retrieveKnowledge('my id number is 8001015009087');
    /* The vector road answered, so the keyword floor is not what returned. */
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'stub-001');
    assert.equal(results[0].title, 'Stub entry');
    assert.equal(results[0].source, 'Stub source');
    assert.equal(results[0].file, 'prevention');
   },
  );
 } finally {
  stub.closeAllConnections();
  await new Promise<void>((resolve) => stub.close(() => resolve()));
 }
 assert.equal(embeddingsBodies.length, 1, 'one embedding call');
 assert.equal(qdrantBodies.length, 1, 'one vector search');
 /* The query is redacted before it leaves for embedding — the same rule every message out
    of this process follows. */
 assert.ok(embeddingsBodies[0].includes('[ID REDACTED]'));
 assert.equal(embeddingsBodies[0].includes('8001015009087'), false);
 const search = JSON.parse(qdrantBodies[0]) as { limit?: number; with_payload?: boolean };
 assert.equal(search.limit, 4, 'topK travels to the vector store');
 assert.equal(search.with_payload, true, 'payloads come back, or there is nothing to attribute');
});

test('Qdrant configured but nothing to embed with lands on the keyword floor', async () => {
 await withEnv({ QDRANT_URL: 'http://127.0.0.1:9' }, async () => {
  const throughTheDoor = await retrieveKnowledge('child immunisation schedule', 2);
  assert.deepEqual(throughTheDoor, searchKnowledge('child immunisation schedule', 2));
 });
});
