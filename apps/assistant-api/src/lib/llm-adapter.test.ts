import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  AzureOpenAIProvider,
  embedWithAzure,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_REPLY_LIMIT,
  llmSystemPrompt,
  OllamaProvider,
  probeOllama,
} from "./llm-adapter.ts";
import sos from "../../../../packages/catalog/sos.json" with { type: "json" };

/* The adapter's own tests, recast on 22 September 2026 when the unreachable plain chat door —
   askModel and the providers' complete() methods — was removed after the orchestrator tier took
   its seat: what remains to hold here is the surface the live tiers actually read. The
   availability flags are facts about configuration, never probes; the probe itself is one fast
   touch with a defined answer; the system prompt reads the catalog's own sentence; the
   embeddings door redacts before sending and answers null to mean "fall back"; and the token
   ceiling stays derived from the reply cap rather than typed beside it. The chat path's own
   request bodies and timeouts are tested where they live now: orchestrator.test.ts and
   routes/turn.test.ts. */

const ENV_KEYS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_MODEL",
  "OLLAMA_URL",
  "OLLAMA_MODEL",
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
  for (const [key, value] of Object.entries(values))
    if (value) process.env[key] = value;
  try {
    return await body();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("with no credentials the tier is dark: one probe of the default URL and no availability", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("this test intends no network at all");
  }) as unknown as typeof fetch;
  try {
    await withEnv({}, async () => {
      assert.equal(new AzureOpenAIProvider().available, false);
      assert.equal(new OllamaProvider().available, false);
      assert.equal(await probeOllama(), false);
    });
    /* The single allowed touch of a never-configured deployment is the probe of the default Ollama
     URL — and here even that is refused by the stub, which is exactly the shape of a machine with
     nothing listening: the flags stay false and the probe answers false. */
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an operator-said Ollama URL is availability, without a probe", async () => {
  /* Availability is a fact about configuration, and constructing the provider is the whole test:
    the URL is a local address nothing listens on, and the flag must still be true — the operator
    said where Ollama is. No network is touched. */
  await withEnv({ OLLAMA_URL: "http://127.0.0.1:9" }, async () => {
    assert.equal(new OllamaProvider().available, true);
  });
});

test("the system prompt carries the contract’s safety rules and sos.json’s numbers", () => {
  const prompt = llmSystemPrompt();
  assert.ok(
    prompt.includes("You never diagnose a condition"),
    "never diagnosing is a rule",
  );
  assert.ok(
    prompt.includes("you never prescribe a medication"),
    "never prescribing is a rule",
  );
  assert.ok(
    prompt.includes(
      "You always recommend consulting a healthcare professional",
    ),
    "the referral rule is what every answer defers to",
  );
  assert.ok(
    prompt.includes(
      "You are warm, empathetic and respond in the same language the user wrote in",
    ),
    "the multi-language directive of 23 September 2026: the answer is composed in the person's own language rather than always in English",
  );
  assert.ok(
    prompt.includes("the platform handles disclosure separately"),
    "the model is told not to write its own disclaimer, so the contract's own disclosure stays the only one a person reads",
  );
  assert.ok(
    prompt.includes("You do not store or remember personal health information"),
  );
  /* The numbers are sos.json's own, by id, never typed here or in the catalog — the same source
    the emergency screen fills its tokens from, so the prompt and the screen cannot drift apart. */
  for (const entry of sos.emergency.numbers)
    assert.ok(
      prompt.includes(entry.number),
      `${entry.id} (${entry.number}) should be in the prompt`,
    );
  assert.equal(
    /\{[a-zA-Z]+\}/.test(prompt),
    false,
    "no token may survive unfilled",
  );
});

test("the key is accepted under either name an operator may have reached for", async () => {
  /* The portal's screen calls it an "API key", so the variable named after the screen must configure
    the tier exactly as the first spelling does — and an endpoint with no key of either name must
    not. Constructing the provider is enough: availability is a fact about configuration, and this
    test touches no network at all. The endpoint is example.invalid — the reserved TLD for a name
    that is nobody's — because the provider treats it as an opaque string and scripts/
    check-boundaries.mjs holds the whole repository to exactly that: no real resource's URL is
    ever committed, not even as a fixture. */
  await withEnv(
    { AZURE_OPENAI_ENDPOINT: "https://example.invalid" },
    async () => {
      assert.equal(
        new AzureOpenAIProvider().available,
        false,
        "an endpoint alone is not credentials",
      );
    },
  );
  await withEnv(
    {
      AZURE_OPENAI_ENDPOINT: "https://example.invalid",
      AZURE_OPENAI_API_KEY: "a-key",
    },
    async () => {
      assert.equal(
        new AzureOpenAIProvider().available,
        true,
        "the portal’s wording configures it",
      );
    },
  );
  await withEnv(
    {
      AZURE_OPENAI_ENDPOINT: "https://example.invalid",
      AZURE_OPENAI_KEY: "a-key",
    },
    async () => {
      assert.equal(
        new AzureOpenAIProvider().available,
        true,
        "and so does the first spelling",
      );
    },
  );
});

test("the embeddings door redacts an identity number before it leaves, and returns the vector", async () => {
  const bodies: string[] = [];
  const provider = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ embedding: [0.125, -0.5, 0.25] }] }));
    });
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  const address = provider.address();
  assert.ok(address && typeof address === "object");
  try {
    await withEnv(
      {
        AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${address.port}`,
        AZURE_OPENAI_KEY: "a-key",
      },
      async () => {
        const vector = await embedWithAzure("my id number is 8001015009087");
        assert.deepEqual(
          vector,
          [0.125, -0.5, 0.25],
          "the stub’s vector comes back as-is",
        );
      },
    );
  } finally {
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  }
  assert.equal(
    bodies.length,
    1,
    "one request, whose body is the thing under test",
  );
  const body = bodies[0];
  assert.ok(body.includes("[ID REDACTED]"), "the identity number is gone");
  assert.equal(body.includes("8001015009087"), false);
  const parsed = JSON.parse(body) as { input: string };
  assert.equal(parsed.input, "my id number is [ID REDACTED]");
});

test("with no credentials the embeddings door answers null — the instruction to fall back", async () => {
  /* No endpoint, no key: embedWithAzure must not construct a request at all, and null is the
    knowledge tier's instruction to keep the keyword floor rather than an error to surface. */
  await withEnv({}, async () => {
    assert.equal(await embedWithAzure("hello there"), null);
  });
});

/* ── The output ceiling ─────────────────────────────────────────────────────────────────────────

   Added with the CodeReview fixes of 21 September 2026: every request a model tier sends must
   carry an explicit output-token ceiling, calibrated to LLM_REPLY_LIMIT and held in one exported
   constant — the orchestrator's LangChain clients send it as max_completion_tokens to Azure's
   pinned version and as max_tokens to Ollama's OpenAI-compatible surface, and orchestrator.test.ts
   is where those request bodies are read back. The derivation itself is pinned here, because the
   derivation is what keeps the cap and the ceiling from drifting. */

test("the token ceiling is derived from the reply cap, so the two cannot drift", () => {
  assert.equal(
    LLM_MAX_OUTPUT_TOKENS,
    Math.ceil(LLM_REPLY_LIMIT / 4),
    "the token ceiling is computed from the character cap, never typed beside it",
  );
  assert.ok(
    LLM_MAX_OUTPUT_TOKENS * 4 >= LLM_REPLY_LIMIT,
    "four characters per token at the conservative end — a reply that fills the character cap must fit inside the ceiling",
  );
  assert.ok(
    LLM_MAX_OUTPUT_TOKENS * 2 <= LLM_REPLY_LIMIT,
    "and the ceiling stays calibrated: anything looser is no ceiling at all",
  );
});
