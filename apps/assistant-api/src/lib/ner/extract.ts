import { HumanMessage, SystemMessage } from "@langchain/core/messages";

/* The NER (named-entity recognition) pre-pass, added on 22 September 2026.

   WHERE THIS SITS. This module runs BEFORE the orchestrator's ReAct loop, not inside it. The loop
   still decides everything; what this layer adds is a typed reading of the message — the medicines,
   symptoms, vitals and time references it names — so a tool can be handed a structured argument
   instead of being left to parse raw prose, and so a red-flag symptom the keyword classifier did
   not catch is escalated on the entities alone.

   THE ONE RULE THIS MODULE NEVER BREAKS: it degrades silently. Extraction is a single model call
   inside a hard timeout, and ANY failure — no model, a timeout, a response that is not JSON, a
   shape that does not parse — returns null rather than throwing. The orchestrator treats null as
   "no pre-read happened" and proceeds exactly as it did before this layer existed. A convenience
   that reads the message must never become the reason a patient's turn fails, so this file has no
   throw path at all: every branch that could fault resolves to null instead.

   This directory is a leaf: it imports the LangChain message classes (already a dependency of this
   service) and nothing else, takes the model as an argument rather than resolving one, and reads no
   environment. That is what makes it testable against a scripted model with no network. */

/* The shape the extraction is asked for, as a plain JSON-schema object. It is embedded verbatim in
   the system prompt below so the model reads the exact contract, and it is the shape the loose
   validator normalises a response back to. `as const` keeps the literal enums as literals. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    medications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dose: { type: "number" },
          unit: {
            type: "string",
            enum: ["mg", "mcg", "g", "ml", "IU", "tablet", "unknown"],
          },
          frequency: {
            type: "string",
            enum: ["daily", "twice_daily", "weekly", "as_needed", "unknown"],
          },
        },
        required: ["name"],
      },
    },
    symptoms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          duration: { type: "string" },
          severity: {
            type: "string",
            enum: ["mild", "moderate", "severe", "unknown"],
          },
        },
        required: ["name"],
      },
    },
    vitals_mentioned: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          value: { type: "number" },
          unit: { type: "string" },
        },
        required: ["type"],
      },
    },
    time_references: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          resolved: { type: "string" },
        },
        required: ["text"],
      },
    },
  },
} as const;

export interface MedicationEntity {
  name: string;
  dose?: number;
  unit?: string;
  frequency?: string;
}
export interface SymptomEntity {
  name: string;
  duration?: string;
  severity?: string;
}
export interface VitalEntity {
  type: string;
  value?: number;
  unit?: string;
}
export interface TimeEntity {
  text: string;
  resolved?: string;
}

export interface Extraction {
  medications: MedicationEntity[];
  symptoms: SymptomEntity[];
  vitals_mentioned: VitalEntity[];
  time_references: TimeEntity[];
}

/* The minimal model surface this layer needs: something with a LangChain-shaped invoke. The
   orchestrator hands over the chat model it already resolved (through a cast, because LangChain's
   own invoke signature is narrower than this); the tests hand over a scripted stub. */
export interface NerModel {
  invoke(messages: unknown[], options?: unknown): Promise<unknown>;
}

/** Timeout for NER extraction — 3 seconds, hard abort. */
export const NER_TIMEOUT_MS = 3_000;

/** Red-flag symptoms that trigger entity-level escalation when severity is "severe". */
export const RED_FLAG_SYMPTOMS: readonly string[] = [
  "chest pain",
  "difficulty breathing",
  "shortness of breath",
  "facial drooping",
  "slurred speech",
  "sudden weakness",
  "suicidal",
  "self-harm",
  "uncontrolled bleeding",
  "seizure",
  "loss of consciousness",
  "severe headache",
];

/* The instruction the model reads. It is asked for JSON and for nothing else, told to extract only
   what the message actually says, and told that an absent category is an empty array rather than a
   guess. The schema is embedded verbatim so the contract cannot drift between the prompt and the
   validator below. */
const NER_SYSTEM_PROMPT = [
  "You are a medical named-entity extractor. Read the user's message and return ONLY a JSON object, with no prose, no markdown and no code fence, matching exactly this schema:",
  JSON.stringify(EXTRACTION_SCHEMA),
  "",
  "Rules:",
  "- Extract only entities the message actually states. Never infer or invent one.",
  '- Use an empty array [] for any category the message does not mention.',
  '- For an enum field, use the exact enum value or "unknown" when the message does not say.',
  "- Keep each name in the person's own words, lower-cased where natural.",
  "- The message may already be redacted ([ID REDACTED], [PHONE REDACTED]); treat those as noise, not entities.",
  "- Output must parse with JSON.parse. Nothing but the JSON object.",
].join("\n");

/* ---- Loose normalisation: accept a partial response, keep only what is well-formed ---- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const oneOf = (value: string | undefined, allowed: readonly string[]): string | undefined =>
  value !== undefined && allowed.includes(value) ? value : undefined;

const MED_UNITS: readonly string[] = ["mg", "mcg", "g", "ml", "IU", "tablet", "unknown"];
const MED_FREQUENCIES: readonly string[] = [
  "daily",
  "twice_daily",
  "weekly",
  "as_needed",
  "unknown",
];
const SEVERITIES: readonly string[] = ["mild", "moderate", "severe", "unknown"];

function normalizeMedication(raw: unknown): MedicationEntity | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  const dose = asNumber(raw.dose);
  const unit = oneOf(asString(raw.unit), MED_UNITS);
  const frequency = oneOf(asString(raw.frequency), MED_FREQUENCIES);
  return {
    name,
    ...(dose !== undefined ? { dose } : {}),
    ...(unit !== undefined ? { unit } : {}),
    ...(frequency !== undefined ? { frequency } : {}),
  };
}

function normalizeSymptom(raw: unknown): SymptomEntity | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  const duration = asString(raw.duration);
  const severity = oneOf(asString(raw.severity), SEVERITIES);
  return {
    name,
    ...(duration !== undefined ? { duration } : {}),
    ...(severity !== undefined ? { severity } : {}),
  };
}

function normalizeVital(raw: unknown): VitalEntity | null {
  if (!isRecord(raw)) return null;
  const type = asString(raw.type);
  if (!type) return null;
  const value = asNumber(raw.value);
  const unit = asString(raw.unit);
  return {
    type,
    ...(value !== undefined ? { value } : {}),
    ...(unit !== undefined ? { unit } : {}),
  };
}

function normalizeTime(raw: unknown): TimeEntity | null {
  if (!isRecord(raw)) return null;
  const text = asString(raw.text);
  if (!text) return null;
  const resolved = asString(raw.resolved);
  return { text, ...(resolved !== undefined ? { resolved } : {}) };
}

const keep = <T>(value: T | null): value is T => value !== null;

/* A model's answer can arrive as a plain string, as an array of content blocks, or wrapped in a
   ```json fence whatever it was told. This reader flattens all three to the JSON text inside. */
function contentToString(response: unknown): string {
  if (typeof response === "string") return response;
  if (!isRecord(response)) return "";
  const { content } = response;
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : isRecord(part) && typeof part.text === "string"
            ? part.text
            : "",
      )
      .join("");
  return "";
}

/* Pull the first JSON object out of a response and normalise it to an Extraction. Returns null when
   there is no object or it will not parse; JSON.parse is allowed to throw here because the caller
   wraps every path in a try/catch that resolves to null. */
function parseExtraction(raw: string): Extraction | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  if (!isRecord(parsed)) return null;
  return {
    medications: asArray(parsed.medications).map(normalizeMedication).filter(keep),
    symptoms: asArray(parsed.symptoms).map(normalizeSymptom).filter(keep),
    vitals_mentioned: asArray(parsed.vitals_mentioned).map(normalizeVital).filter(keep),
    time_references: asArray(parsed.time_references).map(normalizeTime).filter(keep),
  };
}

/**
 * Extract medical entities from text using the LLM's structured output.
 * Returns null on any failure — the orchestrator proceeds unstructured.
 *
 * The timeout is a hard abort two ways over: an AbortSignal on the model call for a provider that
 * honours one, and a Promise.race against a timer for one that does not (a hung socket, a stub that
 * never settles). Whichever fires first wins, and both resolve to null rather than rejecting, so a
 * late rejection from an abandoned call can never surface as an unhandled error.
 */
export async function extractEntities(
  text: string,
  model: NerModel,
  timeoutMs: number = NER_TIMEOUT_MS,
): Promise<Extraction | null> {
  const input = typeof text === "string" ? text.trim() : "";
  if (!input || !model || typeof model.invoke !== "function" || !(timeoutMs > 0))
    return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const messages: unknown[] = [
      new SystemMessage(NER_SYSTEM_PROMPT),
      new HumanMessage(input),
    ];
    const work = (async (): Promise<Extraction | null> => {
      const response = await model.invoke(messages, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return parseExtraction(contentToString(response));
    })().catch(() => null);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([work, timeout]);
  } catch {
    /* Silent degradation is the design: this layer is never the reason a turn fails. */
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Check if extracted entities indicate a red-flag condition.
 * Returns the symptom name if escalation should fire, null otherwise.
 *
 * A red flag needs BOTH halves: the extractor marked the symptom severe, AND its name matches one
 * of the red-flag presentations (case-insensitive, either side a substring of the other, so
 * "chest pain" and "severe chest pain radiating to the arm" both meet the "chest pain" entry). A
 * severe symptom that is not on the list, or a listed symptom the extractor did not call severe,
 * does not fire here — the classifier upstream and the deterministic ruleset beside it are the
 * other layers, and this one only adds a check on the entities themselves.
 */
export function checkEntityEscalation(extraction: Extraction): string | null {
  for (const symptom of extraction.symptoms ?? []) {
    if (!symptom || asString(symptom.severity)?.toLowerCase() !== "severe") continue;
    const name = String(symptom.name ?? "").toLowerCase().trim();
    if (!name) continue;
    const flagged = RED_FLAG_SYMPTOMS.some(
      (flag) => name.includes(flag) || flag.includes(name),
    );
    if (flagged) return symptom.name;
  }
  return null;
}
