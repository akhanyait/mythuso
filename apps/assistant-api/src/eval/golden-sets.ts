import goldenSets from "../../../../packages/catalog/assistant-golden-sets.json" with { type: "json" };
import assistant from "../../../../packages/catalog/assistant.json" with { type: "json" };
import {
  emergencyTerms,
  normalizeText,
} from "../../../../packages/gilbertone/src/engine.ts";
import { detectLanguage } from "../lib/language-detect.ts";
import { runCase } from "./harness.ts";
import type { EvalCase, EvalCheckResult, EvalOutcome } from "./cases.ts";

/* The golden-set runner: packages/catalog/assistant-golden-sets.json, one set per language, run
   through exactly the path the hard evals use — harness.ts's `turn` subject, which is handleTurn
   with no model configured — so the numbers here measure the deterministic layer the phones also
   carry and never a model's free text. Asked for by the founder on 27 September 2026 so that every
   model change is measured in the languages patients use.

   WHY THE SET DECIDES THE SEVERITY. The existing eval set marks each case hard or soft by hand,
   because each case restates a rule the code already promises. A golden sentence in isiZulu makes
   no such promise until a first-language clinician has read it: the sentence may be unnatural, or
   the route the draft expects may be wrong. So the severity is the set's, not the case's — a set
   with reviewedBy null is reported and never required, and a set a clinician has signed is
   required, every case. The build cannot demand that the service pass sentences nobody has
   verified are correct.

   THE ONE EXCEPTION, THE EMERGENCY. A case expecting the emergency route that the service missed
   is a finding worth failing on before review — but only when the message, normalised the way the
   engine normalises it, contains a term gilbert-emergency-terms.json already lists. Then the miss
   is the matcher's fault, not the sentence's: whatever a clinician later says about the isiZulu
   around it, the listed English term was there and the service did not raise. A miss on a sentence
   with no listed term is a finding for the terms list (which changes only through its own
   changelog) or for the matcher's reach, and is reported, not failed. Today the service's matcher
   is a substring one over the same normalisation, so the exception is close to tautological; the
   day the service adopts the phones' stem-and-gap matcher, or the audience or ordering in turn.ts
   changes, it stops being. */

export const KNOWN_ROUTES = ["emergency", "handover", "in-scope", "unmatched"] as const;
export const REFUSAL_PREFIX = "refusal:";

const refusalIds: readonly string[] = assistant.refusalPolicies.policies.map((policy) => policy.id);

export type GoldenCase = {
  id: string;
  message: string;
  expect: { route: string; language: string };
  why: string;
  draftedBy?: string;
  reviewedBy?: string;
};

export type GoldenSet = {
  language: string;
  name: string;
  reviewedBy: string | null;
  reviewedOn: string | null;
  reviewerRole: string;
  cases: GoldenCase[];
};

export const sets: readonly GoldenSet[] = goldenSets.sets;

export const isKnownRoute = (route: string): boolean =>
  (KNOWN_ROUTES as readonly string[]).includes(route) ||
  (route.startsWith(REFUSAL_PREFIX) && refusalIds.includes(route.slice(REFUSAL_PREFIX.length)));

/* What each expected route means in terms of the turn response, one predicate per route, in the
   words the contract's own `routes` section uses. A refusal routes "unknown" with its id; the
   emergency and handover routes are their own; in-scope is "let through to be answered" — the
   classifier's own standard answer or the model's — and unmatched is stricter: the deterministic
   layer said nothing at all. */
export function checkFor(route: string): (outcome: EvalOutcome) => EvalCheckResult {
  const took = (o: EvalOutcome) =>
    `took route=${o.route} classification=${o.classification} refusalId=${o.refusalId ?? "none"}`;
  if (route.startsWith(REFUSAL_PREFIX)) {
    const id = route.slice(REFUSAL_PREFIX.length);
    return (o) => (o.refusalId === id ? { pass: true } : { pass: false, note: took(o) });
  }
  switch (route) {
    case "emergency":
      return (o) =>
        o.route === "emergency" && o.refusalId === undefined
          ? { pass: true }
          : { pass: false, note: took(o) };
    case "handover":
      return (o) =>
        o.route === "handover" && o.refusalId === undefined
          ? { pass: true }
          : { pass: false, note: took(o) };
    case "in-scope":
      return (o) =>
        o.refusalId === undefined && (o.route === "standard" || o.route === "unknown" || o.route === "clarify")
          ? { pass: true }
          : { pass: false, note: took(o) };
    case "unmatched":
      return (o) =>
        o.refusalId === undefined && o.route === "unknown" && o.classification === "unknown"
          ? { pass: true }
          : { pass: false, note: took(o) };
    default:
      throw new Error(`golden set expects a route this harness does not know: ${route}`);
  }
}

/* The listed emergency term a message carries after the engine's own normalisation, if any —
   the fact the emergency exception above turns on. */
export const listedTermIn = (message: string): string | undefined => {
  const text = normalizeText(message);
  return emergencyTerms.find((term) => text.includes(term));
};

export type GoldenCaseResult = {
  case: GoldenCase;
  pass: boolean;
  note?: string;
  /* The emergency term the message carries that the terms contract lists, when it does. */
  listedTerm?: string;
  /* Whether the service's own language detector read the message as the set's language. Reported
     beside the route, never a pass criterion: detection steers the words an answer is composed in
     and touches nothing in the safety chain. */
  languageDetected: boolean;
};

export type GoldenSetResult = {
  set: GoldenSet;
  reviewed: boolean;
  results: GoldenCaseResult[];
  passed: number;
  failed: GoldenCaseResult[];
  languageDetected: number;
  /* The failures the exception makes build-breaking whatever the set's review state. */
  emergencyMissesWithListedTerm: GoldenCaseResult[];
};

const asEvalCase = (set: GoldenSet, golden: GoldenCase): EvalCase => ({
  id: golden.id,
  category: `golden:${set.language}`,
  severity: set.reviewedBy ? "hard" : "soft",
  description: golden.why,
  subject: "turn",
  input: golden.message,
  check: checkFor(golden.expect.route),
});

/* Cases run one after another rather than all at once: harness.ts swaps the model environment
   around each turn, and a hundred and forty concurrent swaps restore each other's values. */
export async function runSet(set: GoldenSet): Promise<GoldenSetResult> {
  const results: GoldenCaseResult[] = [];
  for (const golden of set.cases) {
    const { result } = await runCase(asEvalCase(set, golden));
    results.push({
      case: golden,
      pass: result.pass,
      note: result.note,
      listedTerm: listedTermIn(golden.message),
      languageDetected: detectLanguage(golden.message).language === set.language,
    });
  }
  const failed = results.filter((r) => !r.pass);
  return {
    set,
    reviewed: set.reviewedBy !== null,
    results,
    passed: results.length - failed.length,
    failed,
    languageDetected: results.filter((r) => r.languageDetected).length,
    emergencyMissesWithListedTerm: failed.filter(
      (r) => r.case.expect.route === "emergency" && r.listedTerm !== undefined,
    ),
  };
}

export const runAll = async (): Promise<GoldenSetResult[]> => {
  const out: GoldenSetResult[] = [];
  for (const set of sets) out.push(await runSet(set));
  return out;
};

/* The per-language table, as lines: cases, passed, failed, language-detection agreement, the
   review state, and the failing ids with the route each actually took. */
export function tableLines(reports: readonly GoldenSetResult[]): string[] {
  const head = "language | reviewed | cases | passed | failed | detected";
  const lines = [head, "-".repeat(head.length)];
  for (const r of reports) {
    const total = r.results.length;
    const reviewed = r.reviewed ? `${r.set.reviewedBy} (${r.set.reviewedOn})` : "no — reported only";
    lines.push(`${r.set.language.padEnd(8)} | ${reviewed} | ${total} | ${r.passed} | ${r.failed.length} | ${r.languageDetected}/${total}`);
  }
  for (const r of reports) {
    if (!r.failed.length) continue;
    lines.push(`${r.set.language} failing:`);
    for (const f of r.failed)
      lines.push(
        `  ${f.case.id} expected ${f.case.expect.route}, ${f.note ?? "no note"}${f.listedTerm ? ` [lists "${f.listedTerm}"]` : ""}`,
      );
  }
  return lines;
}
