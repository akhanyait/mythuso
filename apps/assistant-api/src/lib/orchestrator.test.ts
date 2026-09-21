import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { orchestrate } from './orchestrator.ts';
import { LLM_MAX_OUTPUT_TOKENS } from './llm-adapter.ts';

/* The orchestrator tier's own tests, added with it on 21 September 2026. The model behind the
   tier is a scripted server speaking the OpenAI chat protocol on a local port — the same wire
   the real Ollama and Azure providers speak, so the loop that runs here is the loop that runs
   in production, with the model's half of the conversation played back from a script. The openai
   SDK's client does not travel through this file's fetch stubs, so a listening socket is the only
   honest stub there is.

   What is under test is the tier's promises: a tool call is dispatched and its result fed back
   before the model answers; the attribution the tools carry becomes the answer's sources; an
   identity number never reaches the wire and a phone number never comes back on it; and every
   failure — no provider, a refused request, a budget too small to start in — is a quiet
   degradation the caller falls back from, never an error a patient sees. */

const ENV_KEYS = [
 'AZURE_OPENAI_ENDPOINT',
 'AZURE_OPENAI_KEY',
 'AZURE_OPENAI_API_KEY',
 'AZURE_OPENAI_MODEL',
 'AZURE_OPENAI_EMBEDDING_MODEL',
 'OLLAMA_URL',
 'OLLAMA_MODEL',
 'QDRANT_URL',
 'QDRANT_COLLECTION',
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

/* ---- The scripted provider ---- */

const completion = (message: Record<string, unknown>, finishReason: string): string =>
 JSON.stringify({
  id: 'chatcmpl-stub',
  object: 'chat.completion',
  created: 1758000000,
  model: 'stub-model',
  choices: [{ index: 0, message, finish_reason: finishReason }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
 });

const assistantAnswer = (text: string): string =>
 completion({ role: 'assistant', content: text }, 'stop');

const assistantToolCall = (name: string, args: Record<string, unknown>): string =>
 completion(
  {
   role: 'assistant',
   content: null,
   tool_calls: [
    {
     id: 'call-stub-1',
     type: 'function',
     function: { name, arguments: JSON.stringify(args) },
    },
   ],
  },
  'tool_calls',
 );

type Scripted = { server: Server; url: string; bodies: string[]; close: () => Promise<void> };

/* A provider that answers each request with the next line of its script (the last line repeats),
   keeping every request body it was sent — the bodies are the evidence for what reached the
   model. */
const scriptedProvider = async (script: string[], status = 200): Promise<Scripted> => {
 const bodies: string[] = [];
 let step = 0;
 const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
   bodies.push(Buffer.concat(chunks).toString('utf8'));
   const body = script[Math.min(step, script.length - 1)];
   step += 1;
   res.writeHead(status, { 'content-type': 'application/json' });
   res.end(body);
  });
 });
 await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 assert.ok(address && typeof address === 'object');
 return {
  server,
  url: `http://127.0.0.1:${address.port}`,
  bodies,
  close: async () => {
   server.closeAllConnections();
   await new Promise<void>((resolve) => server.close(() => resolve()));
  },
 };
};

const wireMessages = (body: string): { role: string; content: unknown }[] => {
 const parsed = JSON.parse(body) as { messages?: { role: string; content: unknown }[] };
 return parsed.messages ?? [];
};

/* ---- The tests ---- */

test('with no provider configured the tier is dark: a degraded result, never an error', async () => {
 const originalFetch = globalThis.fetch;
 globalThis.fetch = (async () => {
  throw new Error('this test intends no network at all');
 }) as unknown as typeof fetch;
 try {
  await withEnv({}, async () => {
   const result = await orchestrate('what immunisation does my baby need');
   assert.equal(result.degraded, true);
   assert.equal(result.answer, '');
   assert.deepEqual(result.toolsUsed, []);
   assert.equal(result.provider, '');
  });
 } finally {
  globalThis.fetch = originalFetch;
 }
});

test('a tool call is dispatched, its result fed back, and its sources become the answer’s', async () => {
 const provider = await scriptedProvider([
  assistantToolCall('knowledge_search', { query: 'child immunisation schedule' }),
  assistantAnswer(
   'Babies follow the SA EPI schedule: birth doses, then visits at 6, 10 and 14 weeks and 9 months. Ask the clinic nurse to check the card.',
  ),
 ]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('what immunisation does my baby need');
   assert.equal(result.degraded, false);
   assert.equal(result.provider, 'ollama');
   assert.deepEqual(result.toolsUsed, ['knowledge_search']);
   assert.ok(result.answer.includes('SA EPI schedule'));
   assert.equal(result.confidence, 0.9, 'a tool-grounded, sourced answer carries the highest weight');
   assert.ok(
    result.sources.some((source) => source.includes('Expanded Programme on Immunisation')),
    'the EPI attribution the tool carried is the answer’s source',
   );
   assert.ok(result.ms < 15_000);
   /* Two requests — the tool call, then the answer — and the second carries the first's result
      back to the model: the loop's whole contract in one body. */
   assert.equal(provider.bodies.length, 2);
   const toolMessages = wireMessages(provider.bodies[1]).filter(
    (message) => message.role === 'tool',
   );
   assert.equal(toolMessages.length, 1);
   assert.ok(String(toolMessages[0].content).includes('Knowledge base results'));
   assert.ok(String(toolMessages[0].content).includes('Sources: '));
  });
 } finally {
  await provider.close();
 }
});

test('an identity number never reaches the wire, and a phone number never comes back on it', async () => {
 const provider = await scriptedProvider([
  assistantAnswer('Call me back on 0821234567 if that helps.'),
 ]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('my id number is 8001015009087');
   assert.equal(result.degraded, false);
   assert.ok(provider.bodies.length >= 1);
   assert.ok(provider.bodies[0].includes('[ID REDACTED]'));
   assert.equal(provider.bodies[0].includes('8001015009087'), false);
   /* The redactor runs on the way out too: the answer a person reads carries no raw number. */
   assert.ok(result.answer.includes('[PHONE REDACTED]'));
   assert.equal(result.answer.includes('0821234567'), false);
  });
 } finally {
  await provider.close();
 }
});

test('a budget too small to start a step in is spent before any request is made', async () => {
 const provider = await scriptedProvider([assistantAnswer('an answer that must never arrive')]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('what immunisation does my baby need', {}, 100);
   assert.equal(result.degraded, true);
   assert.equal(provider.bodies.length, 0, 'the fallback owns the last of the budget, not the model');
  });
 } finally {
  await provider.close();
 }
});

test('a provider that refuses everything is a degradation, not an error', async () => {
 const provider = await scriptedProvider([JSON.stringify({ error: 'nope' })], 500);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('what immunisation does my baby need');
   assert.equal(result.degraded, true);
   assert.equal(result.answer, '');
  });
 } finally {
  await provider.close();
 }
});

test('a tool the agent invents gets the honest no-such-tool answer, and the loop still finishes', async () => {
 const provider = await scriptedProvider([
  assistantToolCall('crystal_ball', { question: 'will I recover' }),
  assistantAnswer('I cannot look into the future, but a nurse can talk it through with you.'),
 ]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('will I recover');
   assert.equal(result.degraded, false);
   assert.deepEqual(result.toolsUsed, ['crystal_ball']);
   assert.ok(result.answer.includes('nurse'));
   assert.ok(
    provider.bodies[1].includes('No tool named') &&
     provider.bodies[1].includes('crystal_ball'),
    'the model is told the tool does not exist, so it cannot quote it',
   );
  });
 } finally {
  await provider.close();
 }
});

/* ── The output ceiling ─────────────────────────────────────────────────────────────────────────

   Added with the CodeReview fixes of 21 September 2026: both LangChain clients this tier builds
   must carry the same output-token ceiling the native adapter sends — LLM_MAX_OUTPUT_TOKENS,
   one constant for all four model calls this service can make. In the pinned LangChain version
   the option is maxTokens, and the scripted provider's request body is where it must land. */

test('the Ollama LangChain client sends the output ceiling on the wire', async () => {
 const provider = await scriptedProvider([
  assistantAnswer('Ask the clinic nurse to check the card.'),
 ]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('what immunisation does my baby need');
   assert.equal(result.degraded, false);
   assert.equal(result.provider, 'ollama');
  });
  assert.equal(provider.bodies.length, 1, 'one request, whose body is the evidence');
  const parsed = JSON.parse(provider.bodies[0]) as { max_tokens?: number };
  assert.equal(
   parsed.max_tokens,
   LLM_MAX_OUTPUT_TOKENS,
   'the ceiling reaches the wire as max_tokens — maxTokens is the option that carries it there',
  );
 } finally {
  await provider.close();
 }
});

test('the Azure LangChain client sends the same ceiling on the wire', async () => {
 const provider = await scriptedProvider([
  assistantAnswer('Ask the clinic nurse to check the card.'),
 ]);
 try {
  /* The Azure branch answers from its own endpoint and deployment facts; the scripted provider
     wears the endpoint's shape so the client's request lands here, whatever path it adds. */
  await withEnv(
   { AZURE_OPENAI_ENDPOINT: provider.url, AZURE_OPENAI_KEY: 'a-key' },
   async () => {
    const result = await orchestrate('what immunisation does my baby need');
    assert.equal(result.degraded, false);
    assert.equal(result.provider, 'azure-openai');
   },
  );
  assert.equal(provider.bodies.length, 1, 'one request, whose body is the evidence');
  const parsed = JSON.parse(provider.bodies[0]) as { max_tokens?: number };
  assert.equal(
   parsed.max_tokens,
   LLM_MAX_OUTPUT_TOKENS,
   'one constant for both tiers and both providers — the ceiling cannot drift between them',
  );
 } finally {
  await provider.close();
 }
});
