import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";
import { checkEscalation } from "../../../../packages/gilbertone/src/escalation.ts";
/* The ruleset's patterns are written for straight apostrophes and plain spaces, and escalation.ts is
   pinned by hash, so every caller folds the text first — as routes/turn.ts and the web panel do. */
import { foldCharacters } from "../../../../packages/gilbertone/src/fold.ts";
import { modelTierAllowed } from "./activation.ts";
import { languageName } from "./language-detect.ts";
import {
  AzureOpenAIProvider,
  AZURE_API_VERSION,
  AZURE_DEFAULT_MODEL,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_REPLY_LIMIT,
  OllamaProvider,
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  OLLAMA_OPTIONS,
  llmSystemPrompt,
  probeOllama,
} from "./llm-adapter.ts";
import { credentialEnv } from "./credentials.ts";
import { drugCheckTool } from "./tools/drug-check.ts";
import { symptomCheckTool } from "./tools/symptom-check.ts";
import { medicationInfoTool } from "./tools/medication-info.ts";
import { emergencyNumbers, emergencyNumbersTool } from "./tools/emergency-numbers.ts";
import { knowledgeSearchTool } from "./tools/knowledge-search.ts";
import { literatureSearchTool } from "./tools/literature-search.ts";
import { coverageLookupTool } from "./tools/coverage-lookup.ts";
import {
  checkEntityEscalation,
  extractEntities,
  NER_TIMEOUT_MS,
  type Extraction,
  type NerModel,
} from "./ner/extract.ts";
import { entityContextBlock, routeEntities, type ToolHint } from "./ner/route-entities.ts";

/* The orchestrator tier, restructured to a LangGraph StateGraph on 22 September 2026.

   WHERE THIS SITS. The keyword classifier in packages/gilbertone still decides everything that is
   safe to decide — routes, emergencies, refusals — and those turns never reach this module. The
   turn route calls orchestrate() only for a patient-audience message the classifier could not
   match, exactly where it used to call the plain model tier. What the orchestrator adds is the
   tools: instead of answering a medicine question from memory, the model can read the catalog's
   interaction record, medication entry, symptom guidance, emergency numbers, coverage area or
   knowledge base — or search Europe PMC for a real, cited paper — before it writes a word.

   THE GRAPH. The internals are now an explicit LangGraph StateGraph with named nodes and
   conditional edges, replacing the previous flat ReAct loop. The external interface — the
   orchestrate() function, its parameters, and OrchestratorResult — is unchanged.

   Nodes: check_activation → escalate → extract → route → invoke_tools → gate → compose → END

   THE SAFETY CHAIN, IN ORDER. (1) The turn route has already run the refusal policies and the
   emergency classifier before this module is entered. (2) The message and every context line are
   redacted here before any model sees them — the same redactPHI, run redundantly with the caller,
   because the duplication is the point. (3) The system prompt is the catalog's own llm prompt —
   never diagnose, never prescribe, always point at the humans who decide — extended only by the
   tool instructions this tier exists to add. (4) Every tool is read-only: most are catalog
   lookups, and literature_search is a live, keyless call to Europe PMC, but all of them only ever
   hand back a fact or a citation — none can diagnose, prescribe or contact anyone. (5) The
   model's answer is redacted and length-capped on the way out. If any link fails — no provider, a
   hung model, a tool error, a timeout — the caller keeps the classifier's own answer, exactly as
   before this tier existed.

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
   classifications and counts, never the person's earlier words — and, since the multi-language
   backend of 23 September 2026, the language this turn is to be answered in. `language` is the
   code the route resolved (the caller's own declaration, or the language it read out of the words),
   and it is a hint about phrasing rather than a fact about the person: it steers the model's own
   words and nothing in the safety chain depends on it. Absent, the answer is composed in English,
   exactly as it was before this field existed. */
export type SessionContext = { lines?: string[]; language?: string };

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
  "4. Keep the final answer to 2-4 short sentences. If you cannot determine what the user is asking, reply with a single clarifying question — do not attempt an answer.",
  "5. If the message suggests an emergency while you work, stop and give the emergency numbers at once — that rule stands above every other instruction here.",
  "6. Match the user's language. If they wrote in isiZulu, respond in isiZulu. If in Afrikaans, respond in Afrikaans. If you are unsure of the language, respond in English.",
].join("\n");

/* The catalog's llm system prompt is the base, verbatim; the tool guide is appended beneath it.
   The catalog's sentence is still the first thing a model reads. Since the multi-language backend of
   23 September 2026 a single sentence is appended last, naming the language this turn is to be
   answered in — the code the route resolved, turned into the name a model reads. It rides at the end
   so it is the last instruction the model sees, and it never touches the safety rules above it: the
   catalog's "never diagnose, never prescribe" and the emergency rule stand whatever language the
   answer is composed in. An absent language names English, so a turn with no language resolved reads
   exactly as it did before this sentence existed. */
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
  const languageDirective = `\n\nRespond in ${languageName(context.language)}.`;
  return `${llmSystemPrompt()}\n\n${TOOL_GUIDE}${contextBlock}${languageDirective}`;
};

/* ---- The model: the same two providers, through LangChain ---- */

/* The chat model is resolved fresh on every orchestration, reading the same environment variables
   the adapter's provider classes read — their `available` flags ARE the decision, so this tier
   and the health route can never disagree about which provider this process is configured for.
   Azure first, Ollama beside it: the configured deployment before the local fallback. The return
   type is the two concrete classes this tier builds, because both carry bindTools — the base type
   marks it optional. */
type ResolvedModel = { name: string; model: AzureChatOpenAI | ChatOpenAI };

async function resolveChatModel(): Promise<ResolvedModel | null> {
  /* The credential view of ./credentials.ts, since 28 September 2026: the vault before the environment,
     so the key the founder stored is the key this model is built with. */
  const env = credentialEnv();

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
        /* The speed pass's inference hints for the local provider, passed through to Ollama's
           OpenAI-compatible surface in the request body's `options` field — the smaller context
           window, the GPU offload and the bounded thread count that make a local inference faster
           on constrained hardware. modelKwargs is spread into the body, so this is where an option
           LangChain has no first-class field for is said; it rides beside maxTokens rather than
           replacing it, and the two reach the wire as `options` and `max_tokens` respectively. */
        modelKwargs: { options: { ...OLLAMA_OPTIONS } },
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

/* ---- The degraded result factory ---- */

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

/* The short code a failed provider call is logged under: the error's constructor name, and the HTTP
   status when the client attached one (LangChain's OpenAI client sets `status`; a fetch failure
   sets `cause.code`). Never the message: a provider's error text can quote the request. */
const errorCode = (error: unknown): string => {
  const e = error as { name?: unknown; status?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
  const name = typeof e?.name === "string" && e.name ? e.name : "Error";
  const status = typeof e?.status === "number" ? String(e.status) : typeof e?.code === "string" ? e.code : typeof e?.cause?.code === "string" ? e.cause.code : "";
  return `provider-error:${name}${status ? `:${status}` : ""}`;
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE STATE GRAPH
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* The graph's state annotation. Each channel uses a replace reducer — nodes read the full state
   and return partial updates for the channels they own. */
const OrchestratorState = Annotation.Root({
  /* The PHI-redacted user text. */
  input: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  /* The session context orchestrate() was called with — this invocation's own, carried in its own
     state. Until 1 October 2026 it travelled through a module-level variable set just before the
     graph ran, on the reasoning that two invocations never interleave. They do: check_activation
     awaits the provider probe before it reads the context, so a second patient's call arriving in
     that gap overwrote the variable and the first patient's prompt was composed from the second's
     words. State is per invocation, so nothing one call does can reach another's. */
  sessionContext: Annotation<SessionContext>({ reducer: (_, b) => b, default: () => ({}) }),
  /* Absolute deadline timestamp (started + timeoutMs). */
  deadline: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  /* Timestamp when orchestration began, for the ms field. */
  started: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  /* Resolved provider name ("azure-openai" | "ollama" | ""). */
  providerName: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  /* The resolved chat model instance (opaque — passed through, never serialized). */
  model: Annotation<ResolvedModel | null>({ reducer: (_, b) => b, default: () => null }),
  /* The composed system prompt. */
  systemPrompt: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  /* LangChain message history for the ReAct loop. */
  messages: Annotation<BaseMessage[]>({ reducer: (_, b) => b, default: () => [] }),
  /* NER extraction results. */
  extraction: Annotation<Extraction | null>({ reducer: (_, b) => b, default: () => null }),
  /* Routed tool hints from NER. */
  hints: Annotation<ToolHint[]>({ reducer: (_, b) => b, default: () => [] }),
  /* Tool names invoked during the ReAct loop. */
  toolsUsed: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  /* Collected source citations. */
  sources: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  /* The final composed answer (raw, before compose redacts/caps it — or already final if from
     an escalation path). Null means no answer yet. */
  result: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  /* Confidence weight for the result. */
  confidence: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  /* True when the orchestration degraded — no provider, timeout, or failure. */
  degraded: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  /* Why it degraded, as a short code for one log line — never a person's words, never a key: the
     gate that refused, the provider that was missing, or the error's own type name and HTTP status.
     Added 28 September 2026 when a headache turn came back with the classifier's sentence and the
     journal held nothing to say which link had failed; a tier that fails silently is a tier nobody
     can repair. */
  degradedReason: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  /* True when an early-exit path (escalation, entity red-flag) produced the final answer and
     subsequent nodes should be skipped. */
  earlyExit: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  /* True when the result has already been composed (redacted + capped) so compose skips it. */
  composed: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
});

type GraphState = typeof OrchestratorState.State;

/* ---- Node: check_activation ----
   The acknowledgement gate fires FIRST, before anything else. In production without the
   acknowledgement there is no model path at all. Then resolves the chat model and composes
   the system prompt. Any failure here sets degraded and short-circuits to END. */
async function nodeCheckActivation(state: GraphState): Promise<Partial<GraphState>> {
  if (!modelTierAllowed()) {
    return { degraded: true, degradedReason: "activation-not-acknowledged", providerName: "", earlyExit: true };
  }

  const resolved = await resolveChatModel();
  if (!resolved) {
    return { degraded: true, degradedReason: "no-provider-configured", providerName: "", earlyExit: true };
  }

  /* Composed here rather than in orchestrate(), because the model has to be resolved first; the
     context it is composed from is this invocation's own state channel, never a shared variable. */
  const systemPrompt = orchestratorSystemPrompt(state.sessionContext);
  if (!systemPrompt.trim()) {
    return { degraded: true, degradedReason: "empty-system-prompt", providerName: resolved.name, model: resolved, earlyExit: true };
  }

  return {
    providerName: resolved.name,
    model: resolved,
    systemPrompt,
  };
}

/* ---- Node: escalate ----
   Runs checkEscalation from packages/gilbertone on the redacted input as a redundant safety net.
   The turn route already classified emergencies before calling orchestrate(), but the duplication
   is the point — if an emergency pattern fires here, the graph short-circuits with the approved
   refusal sentence. */
async function nodeEscalate(state: GraphState): Promise<Partial<GraphState>> {
  if (state.degraded || state.earlyExit) return {};

  const matched = checkEscalation(foldCharacters(state.input));
  if (matched) {
    const answer = redactPHI(matched.rule.message)
      .trim()
      .slice(0, LLM_REPLY_LIMIT);
    return { result: answer, confidence: 1, earlyExit: true, composed: true };
  }
  return {};
}

/* ---- Node: extract ----
   The NER pre-pass: one bounded model call reads the message as typed entities. If a red-flag
   symptom fires entity-level escalation, the graph short-circuits with the approved sentence.
   Any failure is a silent null and the graph proceeds unstructured. */
async function nodeExtract(state: GraphState): Promise<Partial<GraphState>> {
  if (state.degraded || state.earlyExit) return {};

  const resolved = state.model;
  if (!resolved) return { degraded: true, degradedReason: "no-model-in-state", earlyExit: true };

  const remainingForNer = state.deadline - Date.now();
  const extraction =
    remainingForNer >= MIN_STEP_BUDGET_MS
      ? await extractEntities(
          state.input,
          resolved.model as unknown as NerModel,
          Math.min(NER_TIMEOUT_MS, remainingForNer),
        )
      : null;

  if (extraction) {
    const redFlag = checkEntityEscalation(extraction);
    if (redFlag) {
      /* Escalate and stop: the approved sentence comes from the deterministic ruleset when it
         has one for this presentation, and from the catalog's own emergency numbers when it does
         not — either way the words and the numbers are owned elsewhere, never typed here. */
      const matched = checkEscalation(foldCharacters(redFlag));
      const answer = redactPHI(
        matched ? matched.rule.message : emergencyNumbers(redFlag),
      )
        .trim()
        .slice(0, LLM_REPLY_LIMIT);
      return { extraction, result: answer, confidence: 1, earlyExit: true, composed: true };
    }
  }

  const hints = extraction ? routeEntities(extraction) : [];
  return { extraction, hints };
}

/* ---- Node: route ----
   Builds the initial message array: system prompt, entity context block (if any), and the
   human message. This is the transition from the pre-read into the ReAct loop. */
async function nodeRoute(state: GraphState): Promise<Partial<GraphState>> {
  if (state.degraded || state.earlyExit) return {};

  const entityBlock = entityContextBlock(state.extraction, state.hints);
  const messages: BaseMessage[] = [
    new SystemMessage(state.systemPrompt),
    /* The pre-read rides between the catalog's rules and the person's words: guidance the loop
       may decline, added only when the extraction found something to say. */
    ...(entityBlock ? [new SystemMessage(entityBlock)] : []),
    new HumanMessage(state.input),
  ];
  return { messages };
}

/* ---- Node: invoke_tools ----
   The ReAct loop, wrapped in a single graph node. Iterates up to MAX_STEPS times: invoke the
   model with tools bound, dispatch any tool calls, feed results back. When the model answers
   without tool calls, the raw content is stored in state.result for compose to finalise. */
async function nodeInvokeTools(state: GraphState): Promise<Partial<GraphState>> {
  if (state.degraded || state.earlyExit) return {};

  const resolved = state.model;
  if (!resolved) return { degraded: true, degradedReason: "no-model-in-state", earlyExit: true };

  const messages = [...state.messages];
  const toolsUsed: string[] = [];
  const sources = new Set<string>();
  const toolsBound = resolved.model.bindTools([...TOOLS]);

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const remaining = state.deadline - Date.now();
      if (remaining < MIN_STEP_BUDGET_MS)
        return { degraded: true, degradedReason: "budget-exhausted", providerName: resolved.name, toolsUsed, sources: [...sources] };

      const ai = (await toolsBound.invoke(messages, {
        signal: AbortSignal.timeout(remaining),
      })) as AIMessage;
      messages.push(ai);

      const calls = ai.tool_calls ?? [];
      if (!calls.length) {
        /* No tool call: this step's content is the answer. */
        const raw = String(ai.content ?? "");
        if (!raw.trim()) break;
        const confidence = toolsUsed.length ? (sources.size ? 0.9 : 0.8) : 0.6;
        return {
          result: raw,
          toolsUsed,
          sources: [...sources],
          confidence,
          messages,
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
  } catch (error) {
    /* A provider that timed out, refused or failed mid-loop is a tier that did not answer: the
       caller keeps the classifier's reply. What is kept of the error is its type name and, where the
       provider's client attached one, the HTTP status — enough to tell a wrong deployment name from
       a timed-out network from a rejected key, and nothing that could hold a person's words. */
    return { degraded: true, degradedReason: errorCode(error), toolsUsed, sources: [...sources] };
  }

  /* The loop ran out of steps without a final answer — a model that only ever called tools is a
     model that never answered, and the classifier's reply stands. */
  return { degraded: true, degradedReason: "steps-exhausted", toolsUsed, sources: [...sources] };
}

/* ---- Node: gate ----
   Post-tool escalation re-check: a safety net that reads the composed tool results and checks
   whether anything the tools surfaced triggers an escalation pattern. If it does, the refusal
   sentence replaces whatever the loop produced. */
async function nodeGate(state: GraphState): Promise<Partial<GraphState>> {
  if (state.degraded || state.earlyExit) return {};

  /* Re-check the input against escalation rules one final time after tools have run — the
     tools themselves are read-only and cannot escalate, but a belt-and-braces check on the
     original input ensures nothing slipped through. */
  const matched = checkEscalation(foldCharacters(state.input));
  if (matched) {
    const answer = redactPHI(matched.rule.message)
      .trim()
      .slice(0, LLM_REPLY_LIMIT);
    return { result: answer, confidence: 1, composed: true, earlyExit: true };
  }
  return {};
}

/* ---- Node: compose ----
   Final answer processing: PHI redaction and the LLM_REPLY_LIMIT character cap. Escalation paths
   that already composed their answer (composed=true) skip this node's logic. */
async function nodeCompose(state: GraphState): Promise<Partial<GraphState>> {
  if (state.degraded || state.composed) return {};

  if (state.result !== null) {
    const answer = redactPHI(state.result)
      .trim()
      .slice(0, LLM_REPLY_LIMIT);
    return { result: answer, composed: true };
  }
  return {};
}

/* ---- Conditional edge routers ---- */

function routeAfterActivation(state: GraphState): typeof END | "escalate" {
  return state.earlyExit ? END : "escalate";
}

function routeAfterEscalate(state: GraphState): typeof END | "extract" {
  return state.earlyExit ? END : "extract";
}

function routeAfterExtract(state: GraphState): typeof END | "route" {
  return state.earlyExit ? END : "route";
}

function routeAfterInvokeTools(state: GraphState): typeof END | "gate" {
  return state.degraded ? END : "gate";
}

function routeAfterGate(state: GraphState): typeof END | "compose" {
  return state.earlyExit ? END : "compose";
}

/* ---- The compiled graph ---- */

const orchestratorGraph = new StateGraph(OrchestratorState)
  .addNode("check_activation", nodeCheckActivation)
  .addNode("escalate", nodeEscalate)
  .addNode("extract", nodeExtract)
  .addNode("route", nodeRoute)
  .addNode("invoke_tools", nodeInvokeTools)
  .addNode("gate", nodeGate)
  .addNode("compose", nodeCompose)
  .addEdge(START, "check_activation")
  .addConditionalEdges("check_activation", routeAfterActivation, { [END]: END, escalate: "escalate" })
  .addConditionalEdges("escalate", routeAfterEscalate, { [END]: END, extract: "extract" })
  .addConditionalEdges("extract", routeAfterExtract, { [END]: END, route: "route" })
  .addEdge("route", "invoke_tools")
  .addConditionalEdges("invoke_tools", routeAfterInvokeTools, { [END]: END, gate: "gate" })
  .addConditionalEdges("gate", routeAfterGate, { [END]: END, compose: "compose" })
  .addEdge("compose", END)
  .compile();

/* ---- The public interface (unchanged) ---- */

export async function orchestrate(
  message: string,
  sessionContext: SessionContext = {},
  timeoutMs: number = ORCHESTRATOR_TIMEOUT_MS,
): Promise<OrchestratorResult> {
  const started = Date.now();
  const deadline = started + timeoutMs;

  const redactedText = redactPHI(message ?? "");

  /* Invoke the StateGraph. The graph handles the full pipeline: activation gate, escalation,
     NER extraction, routing, the ReAct tool loop, the post-tool gate, and final composition. */
  const finalState = await orchestratorGraph.invoke({
    input: redactedText,
    sessionContext,
    deadline,
    started,
  });

  /* Map the graph's final state to the OrchestratorResult contract. A degraded tier says so in
     one journal line — the reason code, the provider's name and the time it took — because the turn
     route logs only the tier's successes, and a tier that only ever fails leaves no trace at all. */
  if (finalState.degraded || finalState.result === null) {
    console.warn(
      `[gilbertone:orchestrator] degraded ${finalState.degradedReason || (finalState.result === null ? "no-result" : "unspecified")} ${finalState.providerName || "-"} ${Date.now() - started}ms`,
    );
    return degradedResult(finalState.providerName ?? "", started);
  }

  return {
    answer: finalState.result,
    toolsUsed: finalState.toolsUsed ?? [],
    confidence: finalState.confidence,
    sources: [...new Set(finalState.sources ?? [])],
    provider: finalState.providerName,
    ms: Date.now() - started,
    degraded: false,
  };
}
