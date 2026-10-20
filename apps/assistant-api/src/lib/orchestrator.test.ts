import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { orchestrate, orchestratorTimeoutFrom } from './orchestrator.ts';
import { LLM_MAX_OUTPUT_TOKENS, LLM_REPLY_LIMIT } from './llm-adapter.ts';
import { demonstrationDisclaimer } from './demonstration-override.ts';

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
 /* modelTierAllowed() (./activation.ts), added the same day as this file, reads these two as well
    — without them here, a shell or CI runner that already exports NODE_ENV=production fails every
    test in this file that expects the model tier to run, for a reason no assertion here names. */
 'NODE_ENV',
 'MYTHUSO_ASSISTANT_PRODUCTION',
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

/* The NER pre-pass (./ner/extract.ts) runs one bounded model call BEFORE the ReAct loop, so every
   orchestration that reaches a provider spends its first request on extraction. This is that first
   response: a well-formed extraction with no entities, which yields no escalation and no tool hints,
   so the loop after it runs exactly as it did before the pre-pass existed. The scripts below prepend
   it and count it as request one. */
const nerEmpty = assistantAnswer(
 '{"medications":[],"symptoms":[],"vitals_mentioned":[],"time_references":[]}',
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
  nerEmpty,
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
   /* Three requests — the NER pre-pass, the tool call, then the answer — and the third carries the
      tool's result back to the model: the loop's whole contract in one body. */
   assert.equal(provider.bodies.length, 3);
   const toolMessages = wireMessages(provider.bodies[2]).filter(
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

test('with the demonstration override off, reference sources are not asked and the answer carries no disclaimer', async () => {
 /* Going live set inForce false. A model that still calls reference_sources gets the switched-off
    tool result, and nothing is appended: the disclaimer belongs only to sources opened for
    demonstration. The stub fetch would record any host that was asked. */
 const provider = await scriptedProvider([
  nerEmpty,
  assistantToolCall('reference_sources', { query: 'sunburn' }),
  assistantAnswer(`MedlinePlus, from the US National Library of Medicine, says sunburn is a sign of skin damage. ${'Stay out of the midday sun. '.repeat(60)}`),
 ]);
 const originalFetch = globalThis.fetch;
 const asked: string[] = [];
 globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.hostname === '127.0.0.1') return originalFetch(input as Parameters<typeof fetch>[0], init);
  asked.push(url.hostname);
  return new Response('{}', { status: 503 });
 }) as unknown as typeof fetch;
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('what does medlineplus say about sunburn');
   assert.equal(result.degraded, false);
   assert.deepEqual(result.toolsUsed, ['reference_sources']);
   assert.ok(result.answer.startsWith('MedlinePlus, from the US National Library of Medicine'));
   assert.equal(result.answer.includes(demonstrationDisclaimer()), false, 'a closed override adds no disclaimer');
   assert.ok(result.answer.length <= LLM_REPLY_LIMIT, 'and the answer still fits the cap');
   assert.equal(asked.length, 0, 'a closed override asks no external host');
  });
 } finally {
  globalThis.fetch = originalFetch;
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
  nerEmpty,
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
    provider.bodies[2].includes('No tool named') &&
     provider.bodies[2].includes('crystal_ball'),
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
   one constant for all four model calls this service can make. The field name differs by
   provider, the same way it does in llm-adapter.ts: Ollama's OpenAI-compatible surface takes the
   pinned LangChain version's own maxTokens option, which reaches the wire as max_tokens; Azure's
   gpt-4.1 family on this API version does not, so the Azure branch carries the ceiling through
   modelKwargs as max_completion_tokens instead. The scripted provider's request body is where
   each must land, by its own name. */

test('the Ollama LangChain client sends the output ceiling on the wire', async () => {
 const provider = await scriptedProvider([
  nerEmpty,
  assistantAnswer('Ask the clinic nurse to check the card.'),
 ]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('what immunisation does my baby need');
   assert.equal(result.degraded, false);
   assert.equal(result.provider, 'ollama');
  });
  assert.equal(provider.bodies.length, 2, 'the NER pre-pass and the loop step, both on the one client');
  const parsed = JSON.parse(provider.bodies[1]) as { max_tokens?: number };
  assert.equal(
   parsed.max_tokens,
   LLM_MAX_OUTPUT_TOKENS,
   'the ceiling reaches the wire as max_tokens — maxTokens is the option that carries it there',
  );
 } finally {
  await provider.close();
 }
});

test('the Azure LangChain client sends the same ceiling on the wire, as max_completion_tokens', async () => {
 const provider = await scriptedProvider([
  nerEmpty,
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
  assert.equal(provider.bodies.length, 2, 'the NER pre-pass and the loop step, both on the one client');
  const parsed = JSON.parse(provider.bodies[1]) as {
   max_tokens?: number;
   max_completion_tokens?: number;
  };
  assert.equal(
   parsed.max_completion_tokens,
   LLM_MAX_OUTPUT_TOKENS,
   'one constant for both tiers and both providers — the ceiling cannot drift between them',
  );
  assert.equal(
   parsed.max_tokens,
   undefined,
   'max_tokens must not reach the wire here — this API version wants max_completion_tokens for the gpt-4.1 family, the same fact llm-adapter.ts already carries',
  );
 } finally {
  await provider.close();
 }
});

test('two conversations orchestrated at once each reach the model with their own context and never the other’s', async () => {
 /* 1 October 2026. The context used to reach the graph through a module-level variable set just
    before it ran; a second call arriving while the first awaited its provider overwrote it, and the
    first patient's prompt was composed from the second patient's words. Every request body the model
    receives is read for both markers. */
 const provider = await scriptedProvider([assistantAnswer('Please speak to the clinic nurse about that.')]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const results = await Promise.all([
    orchestrate('how do I look after a cut', { lines: ['Patient said: alpha-context-marker'], language: 'en' }),
    orchestrate('how do I look after a burn', { lines: ['Patient said: beta-context-marker'], language: 'af' }),
   ]);
   assert.ok(results.every((r) => r.degraded === false));
   const prompts = provider.bodies.filter((body) => body.includes('context-marker'));
   assert.ok(prompts.some((body) => body.includes('alpha-context-marker')), 'the first conversation reached the model with its own context');
   assert.ok(prompts.some((body) => body.includes('beta-context-marker')), 'and so did the second');
   for (const body of prompts) {
    assert.equal(body.includes('alpha-context-marker') && body.includes('beta-context-marker'), false, 'no prompt carries both');
    if (body.includes('alpha-context-marker')) assert.ok(body.includes('a cut') && !body.includes('a burn'), 'the first context travels with the first message');
    if (body.includes('beta-context-marker')) assert.ok(body.includes('a burn') && !body.includes('a cut'), 'the second context travels with the second message');
   }
  });
 } finally {
  await provider.close();
 }
});

/* The escalate node is the safety net behind the turn route, and it reads the ruleset — whose
   patterns are written for straight apostrophes and plain spaces. Typed on a phone with smart
   punctuation, "I can’t catch my breath" arrives with U+2019, and before the node folded its input
   the net let it through to the model. Folded, it short-circuits with the rule's own sentence and
   the model is never asked. */
test('a curly-apostrophe emergency is escalated by the graph before any model is asked', async () => {
 const provider = await scriptedProvider([nerEmpty, assistantAnswer('this must never be read')]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   const result = await orchestrate('I can’t catch my breath');
   assert.equal(result.confidence, 1, 'the escalation sentence carries the deterministic weight');
   assert.ok(!result.answer.includes('this must never be read'));
   assert.ok(result.answer.length > 0);
   assert.equal(provider.bodies.length, 0, 'no request reached the model');
  });
 } finally {
  await provider.close();
 }
});

test('the orchestration ceiling stays 15 seconds unless a host asks, and a host may ask only within 5 to 120', () => {
 assert.equal(orchestratorTimeoutFrom({}), 15_000);
 assert.equal(orchestratorTimeoutFrom({ GILBERTONE_ORCHESTRATOR_TIMEOUT_MS: 'nonsense' }), 15_000);
 assert.equal(orchestratorTimeoutFrom({ GILBERTONE_ORCHESTRATOR_TIMEOUT_MS: '60000' }), 60_000);
 assert.equal(orchestratorTimeoutFrom({ GILBERTONE_ORCHESTRATOR_TIMEOUT_MS: '1' }), 5_000);
 assert.equal(orchestratorTimeoutFrom({ GILBERTONE_ORCHESTRATOR_TIMEOUT_MS: '999999' }), 120_000);
});

test('every Ollama call turns thinking off, or a Qwen 3 model reasons past the ceiling', async () => {
 const provider = await scriptedProvider([nerEmpty, assistantAnswer('Ask the clinic nurse to check the card.')]);
 try {
  await withEnv({ OLLAMA_URL: provider.url }, async () => {
   await orchestrate('what immunisation does my baby need');
  });
  assert.ok(provider.bodies.length > 0);
  for (const body of provider.bodies) assert.equal(JSON.parse(body).reasoning_effort, 'none');
 } finally {
  await provider.close();
 }
});
