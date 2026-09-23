import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };
import sos from "../../../../packages/catalog/sos.json" with { type: "json" };
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";

/* The language-model tier's shared facts, as one small module: the two providers' availability
   flags, the system prompt read from the contract, the Ollama probe, the credentials reader and
   the embeddings door — what the model tiers must agree on, read in one place so they cannot
   disagree about it.

   WHO ASKS THE MODEL. Since 21 September 2026 the chat tier lives in orchestrator.ts, a LangChain
   loop around these same two providers. The plain askModel door this module used to carry — and
   the providers' complete() methods beneath it — were removed on 22 September 2026 once nothing
   called them, because a second chat door that must answer the same questions is one door too
   many. The keyword classifier in packages/gilbertone still decides everything that is safe to
   decide — it routes, it raises emergencies, and the refusal policies run before it. A model is
   asked only where that classifier found nothing it knows; it is never asked about an emergency,
   never asked about a message a refusal policy answered, and never decides a route, a
   classification or a handover.

   THE AVAILABILITY FLAGS ARE THE DECISION. `available` is a fact about configuration, not a
   health claim: true means an operator has told this process where the model is. The
   orchestrator and the health route both read exactly these flags, so every part of the service
   agrees about which provider this process is configured for.

   ZERO DEPENDENCIES, NATIVE FETCH, AND NOTHING UNREDACTED LEAVES. The network calls that remain
   in here — the Ollama probe and the embeddings call — speak to their service over the
   platform's own fetch() under an AbortSignal timeout, so a hop that hangs is a hop that fails
   and not a request that sits. embedWithAzure passes its text through redactPHI before it is
   placed in a request body: an identity number, a phone number, an email address or a medical
   aid number is stripped before a model ever sees it, whatever the caller forgot. On the chat
   path the turn route and orchestrator each redact again, the same redundancy by design.

   DARK BY DEFAULT. No deployment configures anything: with no environment variables set, Azure
   reports unavailable, and Ollama's callers see the default-URL probe — see probeOllama below
   for why a probe rather than a promise; on a machine with nothing listening it is an immediate
   connection refusal. */

export const LLM_TIMEOUT_MS = 10 * 1000;
/* How long the default-URL probe may take. Ollama answering on localhost answers at once; this
   ceiling exists so a filtered port cannot turn every unmatched turn into a two-minute wait. */
const DEFAULT_PROBE_TIMEOUT_MS = 800;
/* Pinned, as it has always been, rather than a moving 'latest' — but moved: the classic GA surface
   2024-10-21 predates the gpt-4.1 family, and a gpt-4.1 deployment answers only from
   2025-01-01-preview onward, which is the earliest dated version that serves it.

   The two Azure facts and the two Ollama defaults are exported since the orchestrator tier of
   21 September 2026, which builds its LangChain models from the same connection facts this module
   carries — one set of constants, so every resolver reads the same defaults. Exporting them
   changes no behaviour. */
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
/* Inference options for the local provider, added with the speed pass of 23 September 2026 and
   carried here beside the Ollama defaults so every resolver reads the same numbers rather than
   each typing its own. They are hints the orchestrator's LangChain client passes through to
   Ollama's OpenAI-compatible surface in the request body's `options` field, and Ollama applies
   what the loaded model supports and ignores the rest — so they tune a local inference without
   ever being a promise this service can break.

   num_ctx is halved from Ollama's 8192 default to 4096: this tier's whole prompt — the catalog's
   system rules, the tool guide, a few context lines and one short question — fits well inside it,
   and a smaller context window is a materially faster and lighter inference on constrained
   hardware. num_gpu asks Ollama to offload layers to a GPU when one is present; num_thread bounds
   the CPU threads it may use when there is not, so one inference cannot take a whole box.

   Recommended for production: `ollama pull llama3.1:8b-q4_K_M`.
   4-bit quantization: ~4.7 GB VRAM, ~2x faster inference than the 8b default.
   The full llama3.1:8b (~8 GB) works but is slower on constrained hardware. The quantized tag is
   an operator's choice, set through OLLAMA_MODEL; these options help whichever tag is loaded. */
export const OLLAMA_OPTIONS = {
  num_ctx: 4096,
  num_gpu: 1,
  num_thread: 4,
} as const;
/* A ceiling on what a model may put in one reply, so a runaway answer cannot bloat the session
   store or the panel. A normal answer is a few sentences; this is roughly two hundred words. */
export const LLM_REPLY_LIMIT = 1200;
/* The same ceiling in the units a provider counts in. The cap above is characters; four
   characters per token is the conservative reading of English — so a quarter of the character
   cap is the smallest token budget that cannot cut a reply short before the cap is reached. One
   constant, read by the orchestrator's LangChain clients, so every request a model tier sends
   carries the same explicit output-token ceiling. */
export const LLM_MAX_OUTPUT_TOKENS = Math.ceil(LLM_REPLY_LIMIT / 4);

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

/* The endpoint and key an operator has set for Azure OpenAI, read the one way rather than twice:
   the embeddings call below and the knowledge tier's query-time search are different readers of
   the same account, so both read credentials through this function instead of each keeping its
   own copy of "trim, drop a trailing slash, accept either spelling of the key" to drift out of
   step. The key is read as AZURE_OPENAI_KEY or AZURE_OPENAI_API_KEY — the portal's own screen
   says "API key", and an operator who named the variable after what the screen called it has
   still configured it. */
export function azureCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { endpoint: string; key: string } | null {
  const endpoint = (env.AZURE_OPENAI_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const key = (env.AZURE_OPENAI_KEY ?? env.AZURE_OPENAI_API_KEY ?? "").trim();
  return endpoint && key ? { endpoint, key } : null;
}

/* Azure OpenAI, when the operator has set both the endpoint and the key. The class's remaining
   job is its `available` flag — the fact the orchestrator and the health route both read — and
   its name, so a log line about 'azure-openai' means the same provider everywhere. The
   deployment name, the api-version and the max_completion_tokens ceiling are read by the
   orchestrator's LangChain clients directly from this module's constants. */
export class AzureOpenAIProvider {
  name = "azure-openai";
  available: boolean;
  constructor() {
    this.available = Boolean(azureCredentials(process.env));
  }
}

/* The embeddings call, alongside the chat call above: same account, same api-version, a different
   deployment and a different shape of answer. Exported for the knowledge tier's query-time vector
   search and for scripts/ingest-knowledge-embeddings.mjs, which is this same request run once per
   catalog entry instead of once per question — one function, so the two could never read the
   endpoint, the key or the api-version differently. Redacts before sending: whatever the caller
   forgot, an identity number or a phone number does not leave this process, even though the
   ingestion script's own input is public catalog text with nothing to redact. Returns null on
   missing credentials or any failure — null is the instruction to fall back, never an error to
   surface, matching every other door this adapter opens. */
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
   provider is available immediately; without one, the tier that asks — orchestrator.ts — probes
   the default URL once — see probeOllama below for why a probe rather than a promise. The class
   itself carries only the same availability fact AzureOpenAIProvider does. */
export class OllamaProvider {
  name = "ollama";
  available: boolean;
  constructor() {
    this.available = Boolean((process.env.OLLAMA_URL ?? "").trim());
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
