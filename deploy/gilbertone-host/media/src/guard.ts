/* The gate every request passes before any model sees it, and again after Qwen has restated it in
   English. Deterministic, like packages/gilbertone: the model can be talked into drawing anything,
   a regular expression over the contract's list cannot.

   Why twice. The patterns are English, and GilbertOne is asked things in isiXhosa, isiZulu, Sesotho
   and Afrikaans. Rather than type word lists in languages nobody here has reviewed, the service asks
   Qwen for a one-sentence English restatement first and runs the same gate over that too. A request
   that is refused in either form is refused. The restatement is never shown and never drawn from on
   its own; the original words are what the drawing is made of.

   Order matters and is fixed: an emergency is answered as an emergency before anything else is said
   about the request, then personal details (we keep nothing we should not have been given), then the
   refusals about what may be depicted. */
import { checkEscalation } from "../../../../packages/gilbertone/src/escalation.ts";
import { containsPHI } from "../../../../packages/gilbertone/src/phi.ts";
import { contract, kind, refusal, type Kind } from "./contract.ts";

export type Verdict = { ok: true } | { ok: false; refusal: string; sentence: string };

const compiled = new Map<string, RegExp[]>(
  contract.refusals.map((r) => [r.id, (r.patterns ?? []).map((p) => new RegExp(p, "i"))]),
);

function refuse(id: string, after = ""): Verdict {
  return { ok: false, refusal: id, sentence: after ? `${refusal(id).sentence} ${after}` : refusal(id).sentence };
}

export function gate(k: Kind, text: string): Verdict {
  if (text.length > kind(k).maxPromptCharacters) return refuse("too-long");
  const escalation = checkEscalation(text);
  if (escalation && escalation.rule.severity === "emergency") return refuse("emergency", escalation.rule.message);
  if (containsPHI(text)) return refuse("personal-details");
  for (const r of contract.refusals) {
    if (!r.appliesTo.includes(k)) continue;
    const patterns = compiled.get(r.id) ?? [];
    if (!patterns.some((p) => p.test(text))) continue;
    return refuse(r.id);
  }
  return { ok: true };
}
