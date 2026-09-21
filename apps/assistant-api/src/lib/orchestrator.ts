import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";
import { modelTierAllowed } from "./activation.ts";
import {
  AzureOpenAIProvider,
  AZURE_API_VERSION,
  AZURE_DEFAULT_MODEL,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_REPLY_LIMIT,
  OllamaProvider,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  llmSystemPrompt,
  probeOllama,
} from "./llm-adapter.ts";
import { drugCheckTool } from "./tools/drug-check.ts";
import { symptomCheckTool } from "./tools/symptom-check.ts";
import { medicationInfoTool } from "./tools/medication-info.ts";
import { emergencyNumbersTool } from "./tools/emergency-numbers.ts";
import { knowledgeSearchTool } from "./tools/knowledge-search.ts";
import { literatureSearchTool } from "./tools/literature-search.ts";
import { coverageLookupTool } from "./tools/coverage-lookup.ts";

/* The orchestrator tier, added on 21 September 2026: a LangChain ReAct loop around the same two
   providers the plain model tier uses, with the catalog's own tools between the message and the
   answer.

   WHERE THIS SITS. The keyword classifier in packages/gilbertone still decides everything that is
   safe to decide — routes, emergencies, refusals — and those turns never reach this module. The
   turn route calls orchestrate() only for a patient-audience message the classifier could not
   match, exactly where it used to call the plain model tier. What the orchestrator adds is the
   tools: instead of answering a medicine question from memory, the model can read the catalog's
   interaction record, medication entry, symptom guidance, emergency numbers, coverage area or
   knowledge base — or, since 21 September 2026, search Europe PMC for a real, cited paper —
   before it writes a word.

   THE SAFETY CHAIN, IN ORDER. (1) The turn route has already run the refusal policies and the
   emergency classifier before this module is entered. (2) The message and every context line are
   redacted here before any model sees them — the same redactPHI, run redundantly with the caller,
   because the duplication is the point. (3) The system prompt is the catalog's own llm prompt —
   never diagnose, never prescribe, always point at the humans who decide — extended only by the
   tool instructions this tier exists to add. (4) Every tool is read-only: most are catalog
   lookups, and literature_search is a live, keyless call to Europe PMC, but all of them only ever
   hand back a fact or a citation — none can diagnose, prescribe or contact anyone. (5) The
   model's answer is redacted and length-capped
   on the way out. If any link fails — no provider, a hung model, a tool error, a timeout — the
   caller keeps the classifier's own answer, exactly as before this tier existed.

   ONE CEILING. The whole orchestration — model calls, tool rounds, everything — runs inside a
   15-second budget. A turn that cannot finish inside it is a turn the classifier answers alone. */

export const ORCHESTRATOR_TIMEOUT_MS = 15 * 1000;
/* A ReAct loop needs its steps bounded: each step is a model call, and a model that keeps calling
   tools forever is a model that never answers. Four rounds is enough for a lookup and a follow-up. */
const MAX_STEPS = 4;
/* Never start a step that cannot reasonably finish — the last half-second of the budget belongs
   to the fallback, not to another call. */
const MIN_STEP_BUDGET_MS = 500;

export type OrchestratorResult = {
  /* The model's final answer, redacted and capped. Empty when degraded — which is the caller's
     instruction to keep the classifier's reply. */
  answer: string;
  toolsUsed: string[];
  /* The tier's own usability weight: 0.6 for a model answer, higher when tools grounded it.
     Not a clinical confidence and never shown as one. */
  confidence: number;
  /* The source lines the tools carried, for attribution. */
  sources: string[];
  provider: string;
  ms: number;
  /* True when no model answered — no provider configured, a failure, or the budget ran out. */
  degraded: boolean;
};

/* What the turn route hands over: the context lines it already builds for the plain tier —
   classifications and counts, never the person's earlier words. */
export type SessionContext = { lines?: string[] };

/* ---- The tools this tier carries ---- */

const TOOLS = [
  knowledgeSearchTool,
  drugCheckTool,
  symptomCheckTool,
  medicationInfoTool,
  emergencyNumbersTool,
  coverageLookupTool,
  literatureSearchTool,
] as const;

/* LangChain's tool classes are generic over each schema, so a union of them has no callable
   invoke. The loop dispatches by name at runtime and every tool here takes an object and returns
   text, which is the one shape this map needs. */
type DispatchableTool = {
  name: string;
  invoke: (input: unknown) => Promise<unknown>;
};
const toolByName: ReadonlyMap<string, DispatchableTool> = new Map(
  TOOLS.map(
    (entry) => [entry.name, entry as unknown as DispatchableTool] as const,
  ),
);

/* ---- The prompt: the catalog's own rules, plus the tool instructions ---- */

const TOOL_GUIDE = [
  "Tools you may call, and when:",
  "- knowledge_search: any general health question ('what is', 'how do I', 'where do I') about conditions, first aid, maternal care, chronic illness, mental health, the SA health system, prevention. Search before you answer from memory.",
  "- drug_interaction_check: when two medicines are named together, or a message asks about mixing or combining medicines.",
  "- symptom_check: when a message describes how someone feels, to return the catalog's own 'when to see a doctor' guidance.",
  "- medication_info: when one medicine is named and the question is what it is, its usual dose, side effects or cautions.",
  "- emergency_numbers: when a message asks who to call, or names a crisis of any kind.",
  "- coverage_lookup: when a message asks to find a clinic, pharmacy or nearby facility, or names a suburb and asks if MyThuso reaches it. It answers coverage only — MyThuso holds no directory of real facilities — so say that plainly rather than implying a result names a place to go.",
  "- literature_search: when a message asks for research, evidence, a study or 'what does the literature say' about a topic. It returns real, cited papers from Europe PMC (title, authors, year, identifier) — never a conclusion. Report what it found as citations to check, never as a finding you endorse or a reason to change anything.",
  "",
  "How to work:",
  "1. Call a tool when one fits; call at most one tool per step, and wait for its result.",
  "2. When a tool answers, use its facts in your own words and say where they came from (the source the tool carried).",
  "3. If a tool finds nothing, say plainly that the knowledge base has nothing, and point to a clinic, nurse or pharmacist.",
  "4. Keep the final answer to a few short sentences, in the same warm, simple English as always.",
  "5. If the message suggests an emergency while you work, stop and give the emergency numbers at once — that rule stands above every other instruction here.",
].join("\n");

/* The catalog's llm system prompt is the base, verbatim; the tool guide is appended beneath it.
   The catalog's sentence is still the first thing a model reads. */
const orchestratorSystemPrompt = (context: SessionContext): string => {
  const lines = (context.lines ?? [])
    .map((line) => redactPHI(line))
    .filter((line) => line.trim().length > 0);
  /* Since 21 September 2026 this block may include the literal text of earlier turns, not only
     classifications — see turn.ts's contextLines. The heading says what that history is for: it
     keeps the thread of a conversation legible across turns, and it is not a second, cumulative
     input to reason over. The "never diagnose, never prescribe" rule above is stated once and
     applies to every turn alike; a follow-up question is still a fresh question. */
  const contextBlock = lines.length
    ? `\n\nWhat is already known about this conversation, for keeping the thread only — never as evidence to add to this turn's:\n${lines.map((line) => `- ${line}`).join("\n")}`
    : "";
  return `${llmSystemPrompt()}\n\n${TOOL_GUIDE}${contextBlock}`;
};

/* ---- The model: the same two providers, through LangChain ---- */

/* The chat model is resolved fresh on every orchestration, reading the same environment variables
   the adapter's provider classes read — their `available` flags ARE the decision, so the two tiers
   can never disagree about which provider this process is configured for. Azure first, Ollama
   beside it, exactly as askModel orders them. The return type is the two concrete classes this
   tier builds, because both carry bindTools — the base type marks it optional. */
type ResolvedModel = { name: string; model: AzureChatOpenAI | ChatOpenAI };

async function resolveChatModel(): Promise<ResolvedModel | null> {
  const env = process.env;

  const azure = new AzureOpenAIProvider();
  if (azure.available) {
    const endpoint = (env.AZURE_OPENAI_ENDPOINT ?? "")
      .trim()
      .replace(/\/+$/, "");
    const key = (env.AZURE_OPENAI_KEY ?? env.AZURE_OPENAI_API_KEY ?? "").trim();
    const deployment =
      (env.AZURE_OPENAI_MODEL ?? "").trim() || AZURE_DEFAULT_MODEL;
    return {
      name: "azure-openai",
      model: new AzureChatOpenAI({
        azureOpenAIApiKey: key,
        azureOpenAIBasePath: `${endpoint}/openai/deployments`,
        azureOpenAIApiDeploymentName: deployment,
        azureOpenAIApiVersion: AZURE_API_VERSION,
        temperature: 0.2,
        maxRetries: 0,
        /* The output ceiling, the same constant the native adapter sends — but not as maxTokens.
           In the pinned LangChain version that option reaches the wire as max_tokens, and
           llm-adapter.ts's own Azure branch carries the reason that field is wrong here: this API
           version requires max_completion_tokens for the gpt-4.1 family, the same fact that made
           the native adapter stop sending max_tokens. modelKwargs is spread last into the request
           body, so it is where a field LangChain has no first-class option for gets said; leaving
           maxTokens unset keeps max_tokens itself out of the body rather than sending both. */
        modelKwargs: { max_completion_tokens: LLM_MAX_OUTPUT_TOKENS },
      }),
    };
  }

  /* The adapter's own probe decides whether an unconfigured Ollama is running: the same question,
     the same 800ms ceiling, the same answer. */
  const ollama = new OllamaProvider();
  if (ollama.available || (await probeOllama())) {
    const url = ((env.OLLAMA_URL ?? "").trim() || OLLAMA_DEFAULT_URL).replace(
      /\/+$/,
      "",
    );
    const model = (env.OLLAMA_MODEL ?? "").trim() || OLLAMA_DEFAULT_MODEL;
    return {
      name: "ollama",
      /* Ollama speaks the OpenAI chat protocol on /v1, so the OpenAI chat model points at it —
         one protocol, both providers. */
      model: new ChatOpenAI({
        model,
        apiKey: "ollama",
        configuration: { baseURL: `${url}/v1` },
        temperature: 0.2,
        maxRetries: 0,
        /* The same ceiling as the Azure branch above — one constant, both providers. */
        maxTokens: LLM_MAX_OUTPUT_TOKENS,
      }),
    };
  }

  return null;
}

/* ---- Attribution ---- */

/* Every tool output ends with a "Sources:" line — that convention is this tier's attribution
   contract, and this reader is the other half of it. */
const sourcesOf = (toolOutput: string): string[] => {
  const found: string[] = [];
  for (const match of toolOutput.matchAll(/^Sources?:\s*(.+)$/gm)) {
    for (const piece of match[1].split(";"))
      if (piece.trim().replace(/\.$/, ""))
        found.push(piece.trim().replace(/\.$/, ""));
  }
  return [...new Set(found)];
};

/* ---- The loop ---- */

const degradedResult = (
  provider: string,
  started: number,
): OrchestratorResult => ({
  answer: "",
  toolsUsed: [],
  confidence: 0,
  sources: [],
  provider,
  ms: Date.now() - started,
  degraded: true,
});

export async function orchestrate(
  message: string,
  sessionContext: SessionContext = {},
  timeoutMs: number = ORCHESTRATOR_TIMEOUT_MS,
): Promise<OrchestratorResult> {
  const started = Date.now();
  const deadline = started + timeoutMs;

  /* The acknowledgement gate, before anything else this function does: in production without the
     acknowledgement there is no model path at all — not the Azure provider, not the Ollama probe
     below, which is the one way a model could otherwise appear with no credential configured
     anywhere. The caller keeps the classifier's reply, which is exactly what a deployment that has
     not taken the production decision should say. See ./activation.ts. */
  if (!modelTierAllowed()) return degradedResult("", started);

  const resolved = await resolveChatModel();
  if (!resolved) return degradedResult("", started);

  /* The catalog prompt is the tier's licence to run: no rules, no model — the same rule the plain
     tier enforces, for the same reason. */
  const systemPrompt = orchestratorSystemPrompt(sessionContext);
  if (!systemPrompt.trim()) return degradedResult(resolved.name, started);

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(redactPHI(message ?? "")),
  ];

  const toolsUsed: string[] = [];
  const sources = new Set<string>();
  const toolsBound = resolved.model.bindTools([...TOOLS]);

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_STEP_BUDGET_MS)
        return degradedResult(resolved.name, started);

      const ai = (await toolsBound.invoke(messages, {
        signal: AbortSignal.timeout(remaining),
      })) as AIMessage;
      messages.push(ai);

      const calls = ai.tool_calls ?? [];
      if (!calls.length) {
        /* No tool call: this step's content is the answer. */
        const answer = redactPHI(String(ai.content ?? ""))
          .trim()
          .slice(0, LLM_REPLY_LIMIT);
        if (!answer) break;
        const confidence = toolsUsed.length ? (sources.size ? 0.9 : 0.8) : 0.6;
        return {
          answer,
          toolsUsed,
          confidence,
          sources: [...sources],
          provider: resolved.name,
          ms: Date.now() - started,
          degraded: false,
        };
      }

      for (const call of calls) {
        toolsUsed.push(call.name);
        const chosen = toolByName.get(call.name);
        if (!chosen) {
          messages.push(
            new ToolMessage({
              tool_call_id: call.id ?? "unknown",
              content: `No tool named "${call.name}" exists. Answer with the tools available, or say you cannot.`,
            }),
          );
          continue;
        }
        try {
          const output = await chosen.invoke(
            call.args as Record<string, unknown>,
          );
          const text =
            typeof output === "string" ? output : JSON.stringify(output);
          for (const source of sourcesOf(text)) sources.add(source);
          messages.push(
            new ToolMessage({
              tool_call_id: call.id ?? "unknown",
              content: text,
            }),
          );
        } catch {
          /* A tool that fails must not take the turn with it: the model is told the tool could not
             answer and can fall back to its own caution. */
          messages.push(
            new ToolMessage({
              tool_call_id: call.id ?? "unknown",
              content:
                "The tool could not complete. Do not invent its answer — say what you can from the safety rules, and point to a nurse, doctor or pharmacist.",
            }),
          );
        }
      }
    }
  } catch {
    /* A provider that timed out, refused or failed mid-loop is a tier that did not answer: the
       caller keeps the classifier's reply. */
    return degradedResult(resolved.name, started);
  }

  /* The loop ran out of steps without a final answer — a model that only ever called tools is a
     model that never answered, and the classifier's reply stands. */
  return degradedResult(resolved.name, started);
}
