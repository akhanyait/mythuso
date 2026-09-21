import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
 askModel,
 AzureOpenAIProvider,
 LLM_MAX_OUTPUT_TOKENS,
 LLM_REPLY_LIMIT,
 llmSystemPrompt,
} from './llm-adapter.ts';
import sos from '../../../../packages/catalog/sos.json' with { type: 'json' };

/* The second tier's own tests, added with it on 20 September 2026. Three of the four are about a
   tier that fails — with no credentials configured, with a provider that never answers — and how
   that failure is a quiet null the caller falls back from, never an error a patient sees. The
   fourth is about the one thing that must never happen: a person's identity number or phone
   number reaching a model. The system-prompt assertions read the catalog's own sentence, so they
   hold the rules rather than a copy of the wording typed here. */

const ENV_KEYS = [
 'AZURE_OPENAI_ENDPOINT',
 'AZURE_OPENAI_KEY',
 'AZURE_OPENAI_API_KEY',
 'AZURE_OPENAI_MODEL',
 'OLLAMA_URL',
 'OLLAMA_MODEL',
] as const;

/* Run `body` with exactly the given provider environment and nothing else, then put the real
   environment back — the developer's own shell may well have OLLAMA_URL set, and a test that
   leaks it out has changed what the next test is measuring. */
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

test('with no credentials the tier is dark: one probe of the default URL and a null', async () => {
 const originalFetch = globalThis.fetch;
 let calls = 0;
 globalThis.fetch = (async () => {
  calls += 1;
  throw new Error('this test intends no network at all');
 }) as unknown as typeof fetch;
 try {
  await withEnv({}, async () => {
   assert.equal(new AzureOpenAIProvider().available, false);
   const answer = await askModel('hello there', llmSystemPrompt(), undefined, 200);
   assert.equal(answer, null);
  });
  /* The single allowed touch of a never-configured deployment is the probe of the default Ollama
     URL — and here even that is refused by the stub, which is exactly the shape of a machine with
     nothing listening: the provider list stays empty and the answer is null. */
  assert.equal(calls, 1);
 } finally {
  globalThis.fetch = originalFetch;
 }
});

test('the system prompt carries the contract’s safety rules and sos.json’s numbers', () => {
 const prompt = llmSystemPrompt();
 assert.ok(prompt.includes('You never diagnose a condition'), 'never diagnosing is a rule');
 assert.ok(prompt.includes('you never prescribe a medication'), 'never prescribing is a rule');
 assert.ok(
  prompt.includes('You always recommend consulting a healthcare professional'),
  'the referral rule is what every answer defers to',
 );
 assert.ok(prompt.includes('You are warm, empathetic and speak in clear, simple English'));
 assert.ok(prompt.includes('You do not store or remember personal health information'));
 /* The numbers are sos.json's own, by id, never typed here or in the catalog — the same source
    the emergency screen fills its tokens from, so the prompt and the screen cannot drift apart. */
 for (const entry of sos.emergency.numbers)
  assert.ok(
   prompt.includes(entry.number),
   `${entry.id} (${entry.number}) should be in the prompt`,
  );
 assert.equal(/\{[a-zA-Z]+\}/.test(prompt), false, 'no token may survive unfilled');
});

test('the key is accepted under either name an operator may have reached for', async () => {
 /* The portal's screen calls it an "API key", so the variable named after the screen must configure
    the tier exactly as the first spelling does — and an endpoint with no key of either name must
    not. Constructing the provider is enough: availability is a fact about configuration, and this
    test touches no network at all. The endpoint is example.invalid — the reserved TLD for a name
    that is nobody's — because the provider treats it as an opaque string and scripts/
    check-boundaries.mjs holds the whole repository to exactly that: no real resource's URL is
    ever committed, not even as a fixture. */
 await withEnv({ AZURE_OPENAI_ENDPOINT: 'https://example.invalid' }, async () => {
  assert.equal(new AzureOpenAIProvider().available, false, 'an endpoint alone is not credentials');
 });
 await withEnv(
  { AZURE_OPENAI_ENDPOINT: 'https://example.invalid', AZURE_OPENAI_API_KEY: 'a-key' },
  async () => {
   assert.equal(new AzureOpenAIProvider().available, true, 'the portal’s wording configures it');
  },
 );
 await withEnv(
  { AZURE_OPENAI_ENDPOINT: 'https://example.invalid', AZURE_OPENAI_KEY: 'a-key' },
  async () => {
   assert.equal(new AzureOpenAIProvider().available, true, 'and so does the first spelling');
  },
 );
});

test('a provider that never answers fails inside its own timeout, and the caller gets a null', async () => {
 const stalling = createServer(() => {
  /* Accept the connection and send nothing: the shape of a hung provider. The abort signal is
     the only thing that can end the fetch, which is the property under test. */
 });
 await new Promise<void>((resolve) => stalling.listen(0, '127.0.0.1', resolve));
 const address = stalling.address();
 assert.ok(address && typeof address === 'object');
 try {
  await withEnv({ OLLAMA_URL: `http://127.0.0.1:${address.port}` }, async () => {
   const started = Date.now();
   const answer = await askModel('hello there', llmSystemPrompt(), undefined, 200);
   const elapsed = Date.now() - started;
   assert.equal(answer, null);
   assert.ok(elapsed < 5_000, `the timeout should end the wait, and ${elapsed}ms did not`);
  });
 } finally {
  stalling.closeAllConnections();
  await new Promise<void>((resolve) => stalling.close(() => resolve()));
 }
});

test('an identity number and a phone number are redacted before any model sees them', async () => {
 const bodies: string[] = [];
 const provider = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
   bodies.push(Buffer.concat(chunks).toString('utf8'));
   res.writeHead(200, { 'content-type': 'application/json' });
   res.end(JSON.stringify({ message: { content: 'A calm, general answer.' } }));
  });
 });
 await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
 const address = provider.address();
 assert.ok(address && typeof address === 'object');
 try {
  await withEnv({ OLLAMA_URL: `http://127.0.0.1:${address.port}` }, async () => {
   const answer = await askModel(
    'my id number is 8001015009087',
    llmSystemPrompt(),
    ['an earlier message carried the phone number 0821234567'],
    4_000,
   );
   assert.ok(answer, 'the stub answered, so the tier should not be null');
   assert.equal(answer.provider, 'ollama');
   assert.equal(answer.text, 'A calm, general answer.');
  });
 } finally {
  await new Promise<void>((resolve) => provider.close(() => resolve()));
 }
 assert.equal(bodies.length, 1, 'one request, whose body is the thing under test');
 const body = bodies[0];
 assert.ok(body.includes('[ID REDACTED]'), 'the identity number is gone');
 assert.equal(body.includes('8001015009087'), false);
 assert.ok(body.includes('[PHONE REDACTED]'), 'the context line’s phone number is gone');
 assert.equal(body.includes('0821234567'), false);
 const parsed = JSON.parse(body) as { messages: { role: string; content: string }[] };
 assert.equal(parsed.messages[1].content, 'my id number is [ID REDACTED]');
});

/* ── The output ceiling ─────────────────────────────────────────────────────────────────────────

   Added with the CodeReview fixes of 21 September 2026: every request this module sends must
   carry an explicit output-token ceiling, calibrated to LLM_REPLY_LIMIT and held in one exported
   constant, under whatever name the provider's API gives it — max_completion_tokens for Azure's
   pinned version, options.num_predict for Ollama's native API. The stubs below are local servers
   speaking each API's shape back, and the request body they kept is the evidence. */

test('the token ceiling is derived from the reply cap, so the two cannot drift', () => {
 assert.equal(
  LLM_MAX_OUTPUT_TOKENS,
  Math.ceil(LLM_REPLY_LIMIT / 4),
  'the token ceiling is computed from the character cap, never typed beside it',
 );
 assert.ok(
  LLM_MAX_OUTPUT_TOKENS * 4 >= LLM_REPLY_LIMIT,
  'four characters per token at the conservative end — a reply that fills the character cap must fit inside the ceiling',
 );
 assert.ok(
  LLM_MAX_OUTPUT_TOKENS * 2 <= LLM_REPLY_LIMIT,
  'and the ceiling stays calibrated: anything looser is no ceiling at all',
 );
});

test('the Azure request carries the ceiling under max_completion_tokens, not the deprecated field', async () => {
 const bodies: string[] = [];
 const provider = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
   bodies.push(Buffer.concat(chunks).toString('utf8'));
   res.writeHead(200, { 'content-type': 'application/json' });
   res.end(JSON.stringify({ choices: [{ message: { content: 'A calm, general answer.' } }] }));
  });
 });
 await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
 const address = provider.address();
 assert.ok(address && typeof address === 'object');
 try {
  await withEnv(
   {
    AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${address.port}`,
    AZURE_OPENAI_KEY: 'a-key',
    /* Set so the Ollama branch is configured and never probes (or reaches) the machine's own
       Ollama; Azure answers first and the loop returns before the second provider is tried. */
    OLLAMA_URL: 'http://127.0.0.1:9',
   },
   async () => {
    const answer = await askModel(
     'when should I take my tablets',
     llmSystemPrompt(),
     undefined,
     4_000,
    );
    assert.ok(answer, 'the stub answered, so the tier should not be null');
    assert.equal(answer.provider, 'azure-openai');
    assert.equal(answer.text, 'A calm, general answer.');
   },
  );
 } finally {
  await new Promise<void>((resolve) => provider.close(() => resolve()));
 }
 assert.equal(bodies.length, 1, 'one request, whose body is the thing under test');
 const parsed = JSON.parse(bodies[0]) as {
  max_completion_tokens?: number;
  max_tokens?: unknown;
 };
 assert.equal(
  parsed.max_completion_tokens,
  LLM_MAX_OUTPUT_TOKENS,
  'the field this API version documents for the gpt-4.1 family',
 );
 assert.equal(parsed.max_tokens, undefined, 'and the deprecated spelling of it is not what goes out');
});

test('the Ollama request carries the ceiling under options.num_predict', async () => {
 const bodies: string[] = [];
 const provider = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
   bodies.push(Buffer.concat(chunks).toString('utf8'));
   res.writeHead(200, { 'content-type': 'application/json' });
   res.end(JSON.stringify({ message: { content: 'A calm, general answer.' } }));
  });
 });
 await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
 const address = provider.address();
 assert.ok(address && typeof address === 'object');
 try {
  await withEnv({ OLLAMA_URL: `http://127.0.0.1:${address.port}` }, async () => {
   const answer = await askModel(
    'when should I take my tablets',
    llmSystemPrompt(),
    undefined,
    4_000,
   );
   assert.ok(answer, 'the stub answered, so the tier should not be null');
   assert.equal(answer.provider, 'ollama');
  });
 } finally {
  await new Promise<void>((resolve) => provider.close(() => resolve()));
 }
 assert.equal(bodies.length, 1, 'one request, whose body is the thing under test');
 const parsed = JSON.parse(bodies[0]) as {
  options?: { num_predict?: number };
  stream?: unknown;
 };
 assert.equal(
  parsed.options?.num_predict,
  LLM_MAX_OUTPUT_TOKENS,
  'Ollama’s own ceiling, in options where the native /api/chat reads it',
 );
});
