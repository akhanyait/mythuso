import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };
import sos from "../../../../packages/catalog/sos.json" with { type: "json" };
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";

/* The language-model tier, as one small module: two providers, a system prompt read from the
   contract, and the rules that keep a model out of every decision that matters.

   WHY THIS EXISTS AND WHAT IT MAY NOT DO. The keyword classifier in packages/gilbertone decides
   everything that is safe to decide — it routes, it raises emergencies, and the refusal policies
   run before it. This module is consulted by the turn route only where that classifier found
   nothing it knows; what a model writes replaces the classifier's reply only under the
   answers.service heading the panel draws around it, and any failure in here is a quiet fall
   back to the classifier's answer rather than an error a patient sees. A model is never asked
   about an emergency, never asked about a message a refusal policy answered, and never decides a
   route, a classification or a handover.

   ZERO DEPENDENCIES, NATIVE FETCH, AND NOTHING UNREDACTED LEAVES. Every provider speaks to its
   service over the platform's own fetch() under an AbortSignal timeout, so a provider that hangs
   is a provider that fails and not a request that sits. The message and every context line pass
   through redactPHI inside complete() before they are placed in a request body — the caller
   redacts as well, and the duplication is the point: an identity number, a phone number, an
   email address or a medical aid number is stripped before a model ever sees it, whatever the
   caller forgot.

   DARK BY DEFAULT. No deployment configures anything: with no environment variables set, Azure
   reports unavailable, Ollama falls back to probing its default URL once per call, and on a
   machine with nothing listening that probe is an immediate connection refusal. The single
   network touch a never-configured deployment sees is that probe — GET localhost:11434 with an
   800ms ceiling — which is the price of "if Ollama is running on this machine, use it" without
   an operator having to say so. */

export const LLM_TIMEOUT_MS = 10 * 1000;
/* How long the default-URL probe may take. Ollama answering on localhost answers at once; this
   ceiling exists so a filtered port cannot turn every unmatched turn into a two-minute wait. */
const DEFAULT_PROBE_TIMEOUT_MS = 800;
/* Pinned, as it has always been, rather than a moving 'latest' — but moved: the classic GA surface
   2024-10-21 predates the gpt-4.1 family, and a gpt-4.1 deployment answers only from
   2025-01-01-preview onward, which is the earliest dated version that serves it.

   The two Azure facts and the two Ollama defaults are exported since the orchestrator tier of
   21 September 2026, which builds its LangChain models from the same connection facts this adapter
   reads — one set of constants, so the two tiers can never point at different defaults. Exporting
   them changes no behaviour. */
export const AZURE_API_VERSION = "2025-01-01-preview";
export const AZURE_DEFAULT_MODEL = "gpt-4.1-mini";
/* The embeddings deployment, alongside the chat one above. text-embedding-3-small is Azure's
   current small embedding model — cheap enough to run once per catalog entry at ingestion time
   and once per question at query time, which is the whole load this deployment ever carries. */
export const AZURE_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
/* llama3.1:8b, the tag this machine's Ollama actually carries — the bare name 'llama3.1' is not
   resolvable there ('model not found'), and med42-v2 was never installed. An operator who has a
   different model sets OLLAMA_MODEL and this default never runs. */
export const OLLAMA_DEFAULT_MODEL = "llama3.1:8b";
/* The adapter's own word for a reply a model wrote — not one of the engine's classifications.
   The engine's taxonomy stays the engine's: a model can never claim 'emergency'. */
const MODEL_CLASSIFICATION = "model";
/* A ceiling on what a model may put in one reply, so a runaway answer cannot bloat the session
   store or the panel. A normal answer is a few sentences; this is roughly two hundred words. */
export const LLM_REPLY_LIMIT = 1200;
/* The same ceiling in the units a provider counts in. The cap above is characters; every request
   this module sends now also carries an explicit output-token ceiling, and four characters per
   token is the conservative reading of English — so a quarter of the character cap is the
   smallest token budget that cannot cut a reply short before the cap is reached. One constant,
   read by both provider bodies here and by the orchestrator's LangChain clients, so the tiers
   cannot drift apart. */
export const LLM_MAX_OUTPUT_TOKENS = Math.ceil(LLM_REPLY_LIMIT / 4);

/* What a provider answers with. `classification` is this module's constant and `confidence` its
   own usability weight — 1 when there is text, because there either is an answer or there is
   not — and neither is a claim about medicine or about the engine's confidence. */
export interface LLMResponse {
  text: string;
  classification: string;
  confidence: number;
}

/* Two providers, one shape. `available` is a fact about configuration, not a health claim:
   true means an operator has told this process where the model is. */
export interface LLMProvider {
  name: string;
  available: boolean;
  complete(
    message: string,
    systemPrompt: string,
    context?: string[],
  ): Promise<LLMResponse>;
}

/* The instructions the model is given, read from packages/catalog/assistant.json's llm section
   and never typed here — the sentence that tells a model what it may not do is a sentence the
   accountable people can read in advance. The {ambulance}, {police} and {mobile} tokens are
   filled from sos.json by number id, so the numbers in the prompt and the numbers on the
   emergency screen cannot drift apart. */
const sosNumbers: ReadonlyMap<string, string> = new Map(
  sos.emergency.numbers.map((entry) => [entry.id, entry.number] as const),
);
export function llmSystemPrompt(): string {
  const prompt = String(assistant.llm?.systemPrompt ?? "");
  return prompt.replace(
    /\{([a-zA-Z]+)\}/g,
    (token, id) => sosNumbers.get(id) ?? token,
  );
}

/* What is handed over about the conversation: classifications and counts, never the person's
   earlier words. The caller builds these lines from the session context alone. */
const withContext = (systemPrompt: string, context?: string[]): string => {
  const lines = (context ?? [])
    .map((line) => redactPHI(line))
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return systemPrompt;
  return `${systemPrompt}\n\nWhat is already known about this conversation, and nothing else:\n${lines
    .map((line) => `- ${line}`)
    .join("\n")}`;
};

type ChatMessage = { role: "system" | "user"; content: string };

const messagesFor = (
  systemPrompt: string,
  context: string[] | undefined,
  message: string,
): ChatMessage[] => [
  { role: "system", content: withContext(systemPrompt, context) },
  { role: "user", content: redactPHI(message) },
];

const answerOf = (text: string): LLMResponse => {
  const trimmed = text.trim().slice(0, LLM_REPLY_LIMIT);
  return {
    text: trimmed,
    classification: MODEL_CLASSIFICATION,
    confidence: trimmed ? 1 : 0,
  };
};

/* The endpoint and key an operator has set for Azure OpenAI, read the one way rather than twice:
   the chat tier's deployment and the embeddings deployment below are different deployments on the
   same account, so both read credentials through this function instead of each keeping its own
   copy of "trim, drop a trailing slash, accept either spelling of the key" to drift out of step.
   The key is read as AZURE_OPENAI_KEY or AZURE_OPENAI_API_KEY — the portal's own screen says "API
   key", and an operator who named the variable after what the screen called it has still
   configured it. */
export function azureCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { endpoint: string; key: string } | null {
  const endpoint = (env.AZURE_OPENAI_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const key = (env.AZURE_OPENAI_KEY ?? env.AZURE_OPENAI_API_KEY ?? "").trim();
  return endpoint && key ? { endpoint, key } : null;
}

/* Azure OpenAI, when the operator has set both the endpoint and the key. The deployment name is
   the model, as Azure names them; the API version is pinned rather than a moving 'latest'. */
export class AzureOpenAIProvider implements LLMProvider {
  name = "azure-openai";
  available: boolean;
  readonly #endpoint: string;
  readonly #key: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  /* Written out rather than constructor parameter properties: Node runs these files by stripping
     types, and stripping cannot rewrite a parameter property into a field. */
  constructor(timeoutMs: number = LLM_TIMEOUT_MS) {
    const env = process.env;
    const creds = azureCredentials(env);
    this.#endpoint = creds?.endpoint ?? "";
    this.#key = creds?.key ?? "";
    this.#model = (env.AZURE_OPENAI_MODEL ?? "").trim() || AZURE_DEFAULT_MODEL;
    this.#timeoutMs = timeoutMs;
    this.available = Boolean(creds);
  }
  async complete(
    message: string,
    systemPrompt: string,
    context?: string[],
  ): Promise<LLMResponse> {
    const url = `${this.#endpoint}/openai/deployments/${this.#model}/chat/completions?api-version=${AZURE_API_VERSION}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": this.#key },
      body: JSON.stringify({
        messages: messagesFor(systemPrompt, context, message),
        /* max_completion_tokens, not max_tokens: that is the field this API version — pinned above
           at 2025-01-01-preview — documents for the gpt-4.1 family, and the older name is the
           deprecated one on this surface. */
        max_completion_tokens: LLM_MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok)
      throw new Error(`azure-openai answered ${response.status}`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return answerOf(body.choices?.[0]?.message?.content ?? "");
  }
}

/* The embeddings call, alongside the chat call above: same account, same api-version, a different
   deployment and a different shape of answer. Exported for the knowledge tier's query-time vector
   search and for scripts/ingest-knowledge-embeddings.mjs, which is this same request run once per
   catalog entry instead of once per question — one function, so the two could never read the
   endpoint, the key or the api-version differently. Redacts before sending for the same reason
   complete() does: whatever the caller forgot, an identity number or a phone number does not leave
   this process, even though the ingestion script's own input is public catalog text with nothing
   to redact. Returns null on missing credentials or any failure — null is the instruction to fall
   back, never an error to surface, matching every other door this adapter opens. */
export async function embedWithAzure(
  text: string,
  timeoutMs: number = LLM_TIMEOUT_MS,
): Promise<number[] | null> {
  const creds = azureCredentials();
  if (!creds) return null;
  const model =
    (process.env.AZURE_OPENAI_EMBEDDING_MODEL ?? "").trim() ||
    AZURE_DEFAULT_EMBEDDING_MODEL;
  try {
    const response = await fetch(
      `${creds.endpoint}/openai/deployments/${model}/embeddings?api-version=${AZURE_API_VERSION}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": creds.key },
        body: JSON.stringify({ input: redactPHI(text) }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { embedding?: number[] }[];
    };
    const vector = body.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length ? vector : null;
  } catch {
    return null;
  }
}

/* Ollama, local by default. An operator who sets OLLAMA_URL has said Ollama is there and the
   provider is available immediately; without one, askModel probes the default URL once — see
   probeOllama below for why a probe rather than a promise. */
export class OllamaProvider implements LLMProvider {
  name = "ollama";
  available: boolean;
  readonly #url: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  constructor(timeoutMs: number = LLM_TIMEOUT_MS) {
    const env = process.env;
    const configured = (env.OLLAMA_URL ?? "").trim();
    this.#url = (configured || OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
    this.#model = (env.OLLAMA_MODEL ?? "").trim() || OLLAMA_DEFAULT_MODEL;
    this.#timeoutMs = timeoutMs;
    this.available = Boolean(configured);
  }
  async complete(
    message: string,
    systemPrompt: string,
    context?: string[],
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.#url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.#model,
        messages: messagesFor(systemPrompt, context, message),
        stream: false,
        /* This provider speaks Ollama's native /api/chat, where the ceiling lives under options as
           num_predict; the OpenAI-compatible face of the same server calls it max_tokens. */
        options: { num_predict: LLM_MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`ollama answered ${response.status}`);
    const body = (await response.json()) as { message?: { content?: string } };
    return answerOf(body.message?.content ?? "");
  }
}

/* Whether Ollama is answering on its default URL. The probe is a fact asked for and not a
   promise kept: a machine that starts Ollama after this process does is picked up on the next
   turn, and a machine that never has it pays one fast connection refusal. Exported with the
   orchestrator tier, which resolves its LangChain models through the same probe. */
export async function probeOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_DEFAULT_URL}/api/version`, {
      signal: AbortSignal.timeout(DEFAULT_PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type ModelAnswer = { provider: string; text: string; ms: number };

/* The tier's one door. Returns null when no provider is configured or every provider failed —
   which is the caller's instruction to keep the classifier's answer, never an error. `ms` is
   wall time for the winning attempt, for the usage line the turn route writes. */
export async function askModel(
  message: string,
  systemPrompt: string,
  context?: string[],
  timeoutMs: number = LLM_TIMEOUT_MS,
): Promise<ModelAnswer | null> {
  /* No rules, no model: an empty system prompt means the catalog lost its llm section, and a
     model asked to improvise its own safety rules is not a tier this product ships. */
  if (!systemPrompt.trim()) return null;

  const providers: LLMProvider[] = [];
  const azure = new AzureOpenAIProvider(timeoutMs);
  if (azure.available) providers.push(azure);
  const ollama = new OllamaProvider(timeoutMs);
  if (ollama.available || (await probeOllama())) providers.push(ollama);

  for (const provider of providers) {
    const started = Date.now();
    try {
      const answer = await provider.complete(message, systemPrompt, context);
      if (answer.text.length)
        return {
          provider: provider.name,
          text: answer.text,
          ms: Date.now() - started,
        };
    } catch {
      /* A provider that timed out, refused or answered nothing is simply not this turn's tier;
         the caller keeps the classifier's answer. The next provider in the list is still tried,
         because a broken Azure deployment should not hide a working Ollama beside it. */
    }
  }
  return null;
}
