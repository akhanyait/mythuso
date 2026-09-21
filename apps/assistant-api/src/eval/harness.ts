import { handleTurn } from "../routes/turn.ts";
import { checkSymptoms } from "../lib/tools/symptom-check.ts";
import { checkDrugInteraction } from "../lib/tools/drug-check.ts";
import { lookupMedication } from "../lib/tools/medication-info.ts";
import { emergencyNumbers } from "../lib/tools/emergency-numbers.ts";
import { searchKnowledgeBase } from "../lib/tools/knowledge-search.ts";
import type { EvalCase, EvalOutcome, EvalCheckResult } from "./cases.ts";

/* The harness that turns one EvalCase into one EvalOutcome, and the outcome into a verdict.

   THE `turn` SUBJECT IS DELIBERATELY MODEL-FREE. A case whose subject is "turn" exercises the same
   entry point a request hits (handleTurn, in ../routes/turn.ts) — refusals, the keyword classifier
   and the session — but never the orchestrator tier: the environment variables a provider reads are
   cleared, and OLLAMA_URL is pointed at a closed local port, the same trick orchestrator.test.ts and
   turn.test.ts already use to force a fast, deterministic "no provider answered" fall-through rather
   than either a slow probe of a default Ollama port or, worse, actually reaching a model that
   happens to be running on the machine this eval runs on. That is a feature, not a shortcut: this
   eval is a test of the deterministic safety net — refusals, the classifier, the tools' own
   templates — not of what an LLM says, which is exactly the part this repository does not pin to an
   exact string anywhere else either. See run-eval.ts's header comment for what that does and does
   not prove. */

const MODEL_ENV_KEYS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_MODEL",
  "OLLAMA_URL",
  "OLLAMA_MODEL",
  "QDRANT_URL",
  "QDRANT_COLLECTION",
  "NODE_ENV",
  "MYTHUSO_ASSISTANT_PRODUCTION",
] as const;

async function withNoModelConfigured<T>(body: () => Promise<T>): Promise<T> {
  const saved = MODEL_ENV_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of MODEL_ENV_KEYS) delete process.env[key];
  /* A closed local port: OllamaProvider.available becomes true (a URL is configured), so
     resolveChatModel skips the 800ms default-port probe, and the first request fails immediately
     with ECONNREFUSED — orchestrate() treats that exactly like any other failed provider and
     returns its degraded result, leaving the classifier's own reply standing. */
  process.env.OLLAMA_URL = "http://127.0.0.1:9";
  try {
    return await body();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function runSubject(evalCase: EvalCase): Promise<EvalOutcome> {
  switch (evalCase.subject) {
    case "turn": {
      return withNoModelConfigured(async () => {
        const result = await handleTurn({
          text: evalCase.input,
          userConsent: evalCase.consent ?? true,
          audience: evalCase.audience,
        });
        return {
          reply: result.reply,
          refusalId: result.refusalId,
          route: result.route,
          classification: result.classification,
          confidence: result.confidence,
        };
      });
    }
    case "symptom-check":
      return { reply: checkSymptoms(evalCase.input) };
    case "drug-check":
      return { reply: checkDrugInteraction(evalCase.input, evalCase.drugB ?? "") };
    case "medication-info":
      return { reply: lookupMedication(evalCase.input) };
    case "emergency-numbers":
      return { reply: emergencyNumbers(evalCase.input) };
    case "knowledge-search":
      return { reply: await searchKnowledgeBase(evalCase.input) };
    default: {
      const exhaustive: never = evalCase.subject;
      throw new Error(`unhandled eval subject: ${String(exhaustive)}`);
    }
  }
}

export type CaseResult = {
  case: EvalCase;
  outcome: EvalOutcome;
  result: EvalCheckResult;
};

export async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  const outcome = await runSubject(evalCase);
  const result = evalCase.check(outcome);
  return { case: evalCase, outcome, result };
}
