import type { Extraction } from "./extract.ts";

/* The entity-to-tool map, added with the NER pre-pass on 22 September 2026.

   This is the second half of the pre-read: extract.ts turns a message into typed entities, and this
   turns those entities into tool HINTS — a tool name, the arguments it would take, and the reason it
   is suggested. Hints, not instructions. The orchestrator injects them into the system message as
   structured context to guide the model's tool selection; the ReAct loop still decides what to call,
   and a hint the model ignores is not an error. Nothing here calls a tool or touches the network —
   it is a pure map from an Extraction to a list, so it is trivially testable and can never fault a
   turn. */

export interface ToolHint {
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}

/**
 * Map extracted entities to tool hints that the orchestrator can use
 * to pre-select and pre-parameterize tools.
 */
export function routeEntities(extraction: Extraction): ToolHint[] {
  const hints: ToolHint[] = [];
  const medications = extraction?.medications ?? [];
  const symptoms = extraction?.symptoms ?? [];

  for (const med of medications) {
    const name = String(med?.name ?? "").trim();
    if (!name) continue;
    hints.push({
      tool: "drug_interaction_check",
      /* drugB is left empty for the single-medicine case; the pairwise pass below fills both sides
         once a second medicine is known. */
      args: { drugA: name, drugB: "" },
      reason: `medication mentioned: ${name}`,
    });
    hints.push({
      tool: "medication_info",
      args: { medication: name },
      reason: `medication info requested for: ${name}`,
    });
  }

  /* Two or more medicines named together is the shape drug_interaction_check actually answers, so
     every distinct pair gets its own fully-parameterised hint. Order-free pairs only: (a, b) is the
     same interaction as (b, a), and the tool reads the catalog's record either way round. */
  if (medications.length >= 2) {
    const names = medications
      .map((med) => String(med?.name ?? "").trim())
      .filter((name) => name.length > 0);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        hints.push({
          tool: "drug_interaction_check",
          args: { drugA: names[i], drugB: names[j] },
          reason: `interaction check between ${names[i]} and ${names[j]}`,
        });
      }
    }
  }

  for (const symptom of symptoms) {
    const name = String(symptom?.name ?? "").trim();
    if (!name) continue;
    hints.push({
      tool: "symptom_check",
      args: { symptoms: name },
      reason: `symptom mentioned: ${name}`,
    });
    hints.push({
      tool: "knowledge_search",
      args: { query: name },
      reason: `knowledge lookup for: ${name}`,
    });
  }

  return hints;
}

/* The block the orchestrator prepends to the system message when the pre-read found something. It is
   worded as guidance the model may decline: the entities are a machine reading of the message to
   verify against it, never facts to repeat, and the tools are suggestions, not a script. An empty
   extraction produces an empty string, and the orchestrator adds nothing in that case. */
export function entityContextBlock(
  extraction: Extraction | null,
  hints: ToolHint[],
): string {
  if (!extraction || (!hints.length && !hasEntities(extraction))) return "";

  const lines: string[] = [
    "A machine pre-read of the message found the entities below. Treat them as hints to check against the message, never as facts to repeat or a diagnosis:",
  ];
  if (extraction.medications.length)
    lines.push(
      `- Medicines: ${extraction.medications
        .map((m) => describeMedication(m))
        .join("; ")}`,
    );
  if (extraction.symptoms.length)
    lines.push(
      `- Symptoms: ${extraction.symptoms
        .map((s) => describeSymptom(s))
        .join("; ")}`,
    );
  if (extraction.vitals_mentioned.length)
    lines.push(
      `- Vitals mentioned: ${extraction.vitals_mentioned
        .map((v) => describeVital(v))
        .join("; ")}`,
    );
  if (extraction.time_references.length)
    lines.push(
      `- Time references: ${extraction.time_references
        .map((t) => (t.resolved ? `${t.text} (${t.resolved})` : t.text))
        .join("; ")}`,
    );

  if (hints.length) {
    lines.push(
      "",
      "Tools these entities suggest you may consider — your choice, call only what genuinely fits the question:",
    );
    for (const hint of hints)
      lines.push(`- ${hint.tool} ${formatArgs(hint.args)} — ${hint.reason}`);
  }
  return lines.join("\n");
}

function hasEntities(extraction: Extraction): boolean {
  return (
    extraction.medications.length > 0 ||
    extraction.symptoms.length > 0 ||
    extraction.vitals_mentioned.length > 0 ||
    extraction.time_references.length > 0
  );
}

function describeMedication(m: { name: string; dose?: number; unit?: string; frequency?: string }): string {
  const dose =
    m.dose !== undefined ? ` ${m.dose}${m.unit && m.unit !== "unknown" ? m.unit : ""}` : "";
  const frequency =
    m.frequency && m.frequency !== "unknown" ? `, ${m.frequency.replace(/_/g, " ")}` : "";
  return `${m.name}${dose}${frequency}`.trim();
}

function describeSymptom(s: { name: string; duration?: string; severity?: string }): string {
  const severity =
    s.severity && s.severity !== "unknown" ? ` (${s.severity})` : "";
  const duration = s.duration ? ` for ${s.duration}` : "";
  return `${s.name}${severity}${duration}`.trim();
}

function describeVital(v: { type: string; value?: number; unit?: string }): string {
  const reading =
    v.value !== undefined ? ` ${v.value}${v.unit ? ` ${v.unit}` : ""}` : "";
  return `${v.type}${reading}`.trim();
}

function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return parts.length ? `(${parts.join(", ")})` : "";
}
