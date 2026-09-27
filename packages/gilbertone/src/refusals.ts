import { classifyMessage, type Audience } from "./engine.ts";
import type { ConversationContext } from "./conversation.ts";
import { containsPHI } from "./phi.ts";
import { checkEscalation, type EscalationResult } from "./escalation.ts";
import assistant from "../../catalog/assistant.json" with { type: "json" };

/* The refusal policy engine: four rules the engine asks before it classifies anything.

   A refusal is not a classification. It is a decision that this message will not be matched at
   all, and it carries the sentence the person reads instead — read from the refusalPolicies
   section of packages/catalog/assistant.json, never typed here, so the words that refuse a
   message are the same words the accountable people can read in advance. This module holds the
   ids and the order; the catalog holds the sentences.

   THE ORDER, AND THE ONE EXCEPTION. The emergency terms are asked first, before consent and before
   the other three policies: a message carrying an emergency word is never refused, because the
   contract's own rule is that no answer lowers an emergency, and a refusal is an answer. This is the
   one exception that outranks consent itself — a person in danger who has not confirmed, or who
   confirmed and then withdrew it, still gets the emergency route, numbers first, because withholding
   it would lower the emergency. Only after a message is known not to be an emergency is consent
   asked: until the person has confirmed, a non-emergency message is not read beyond the check itself,
   and the sentence says so. After that: a message asking for a diagnosis or a medicine is the
   clinical-referral refusal; a message claiming a role is the role-spoofing refusal, because a role
   here is declared and never authenticated; a message carrying an identity number, a phone number, an
   email address or a medical aid number is the soft phi-detected refusal, which asks for the person's
   own words instead.

   The context parameter is accepted so a caller can hand this module the same state object it
   holds, and is deliberately not consulted: these four rules are context-free on purpose. A
   refusal that could be talked out of itself by earlier turns is the first step to one that can. */

export type RefusalSeverity = "hard" | "soft";

export interface RefusalResult {
  refused: boolean;
  refusalId?: string;
  sentence?: string;
  severity?: RefusalSeverity;
  /* Set when the deterministic escalation ruleset (escalation.ts) matched a symptom in this message.
     It rides alongside the refusal decision so a caller can surface the approved symptom message
     without the shape of RefusalResult changing for anyone who does not read it: an
     emergency-severity match is never refused (it bypasses consent exactly like the emergency
     classifier above it), and an urgent-severity match respects consent and is attached to whatever
     the rest of the chain decided. */
  escalation?: EscalationResult;
}

type CatalogPolicy = { id: string; severity: string; statement: string };

const policies: readonly CatalogPolicy[] = assistant.refusalPolicies.policies;

/* A refusal whose sentence is missing is refused here rather than defaulted: the engine would
   otherwise return a refusal a person cannot read, which is worse than a build that stops. */
const policyFor = (id: string): CatalogPolicy => {
  const policy = policies.find((entry) => entry.id === id);
  if (!policy)
    throw new Error(
      `packages/catalog/assistant.json refusalPolicies has no "${id}", so this refusal would carry no sentence. Run: npm run assistant after the rule and the sentence are written down together.`,
    );
  return policy;
};

const refuse = (id: string): RefusalResult => {
  const policy = policyFor(id);
  return {
    refused: true,
    refusalId: id,
    sentence: policy.statement,
    severity: policy.severity === "soft" ? "soft" : "hard",
  };
};

/* The contract's patterns, as written down in the Phase A decision: asking for a diagnosis or a
   medicine, and claiming a role. Both are made lowercase-unfriendly on purpose — matching runs
   against the message as typed, and "Should I take" is the same question.

   A dosing question is its own pattern rather than a fourth phrase folded into medicalAdvice: "how
   much Panado should I give my toddler" names no medicine problem in medicalAdvice's own words, so
   it reached the classifier unrefused until the eval set of 21 September found the gap. Nothing in
   the fallback answer invented a dose either way, so it was not unsafe — but a dosing question
   belongs behind clinical-referral like every other request for medical advice, not past it. */
const medicalAdvice =
  /should i take|do i have|am i sick|what medicine|diagnos/i;
/* "should I give" was the only modal this knew until 28 September 2026, and the first golden set
   (packages/catalog/assistant-golden-sets.json) found the gap in one sentence: "How much Panado can I
   give my child?" was answered rather than refused. A dose is asked with can, could, may, must, do,
   or with no modal at all — "how much Panado to give" — and every one of them is the same question. */
const dosingQuestion =
  /how much .+ (should|can|could|may|must|do) i (give|take)|how much .+ to (give|take)|what('s| is) the (dose|dosage)|how many (mg|milligrams|tablets|ml)\b/i;
const roleSpoofing = /i am a doctor|i am a nurse|treat me as|act as if i/i;

export function evaluateRefusals(
  input: string,
  audience: Audience,
  consent: boolean,
  _context?: ConversationContext,
): RefusalResult {
  /* The exception the contract promised, asked before anything else — including consent: an
     emergency word is an emergency whatever came with it, and no policy here may lower it. A
     withheld or absent consent does not stand between a person in danger and the emergency route,
     because refusing one is an answer that lowers it. The engine's emergency route answers instead. */
  if (classifyMessage(input, audience) === "emergency")
    return { refused: false };
  /* The escalation ruleset is asked next, before consent. It is defense-in-depth beside the
     emergency classifier above: a specific symptom presentation caught by pattern matching rather
     than by the model. An emergency-severity match is treated exactly like the emergency
     classification — never refused, and never held behind consent, because withholding the
     ambulance route would lower an emergency. */
  const escalation = checkEscalation(input);
  if (escalation?.rule.severity === "emergency")
    return { refused: false, escalation };
  /* Consent next, whatever else a non-emergency message says. Nothing below this line has been read
     yet when this fires, and the sentence says so. */
  if (consent === false) return refuse("consent-required");
  /* An urgent-severity match respects consent, so it is only reached once consent is present. It
     does not refuse on its own: it rides along with whatever the policies below decide, carrying its
     approved message so the caller can surface "be seen today" beside the answer. */
  const decided: RefusalResult =
    medicalAdvice.test(input) || dosingQuestion.test(input)
      ? refuse("clinical-referral")
      : roleSpoofing.test(input)
        ? refuse("role-spoofing")
        : containsPHI(input)
          ? refuse("phi-detected")
          : { refused: false };
  if (escalation?.rule.severity === "urgent") return { ...decided, escalation };
  return decided;
}
