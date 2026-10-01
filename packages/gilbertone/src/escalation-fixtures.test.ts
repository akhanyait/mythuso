import test from "node:test";
import assert from "node:assert/strict";
import assistant from "../../catalog/assistant.json" with { type: "json" };
import { checkEscalation } from "./escalation.ts";
import { foldCharacters } from "./fold.ts";

/* fixtures.escalation in packages/catalog/assistant.json, against escalation.ts itself. Since 2 October
   2026 the ruleset is generated into both phones (scripts/emit-escalation.mjs), and iOS (Escalation.selfTest)
   and Android (EscalationFixturesTest) replay this same list against their own regular-expression engines.
   This is the web's half: the list says what the ruleset finds, folded the way every caller folds it, and
   a line that disagrees here is a fixture that is wrong, not a phone. */
test("the escalation ruleset finds what the shared fixtures say, on the folded text", () => {
  const fixtures: readonly { says: string; rule: string | null }[] = assistant.fixtures.escalation;
  assert.ok(fixtures.length > 0);
  for (const { says, rule } of fixtures)
    assert.equal(checkEscalation(foldCharacters(says))?.rule.id ?? null, rule, JSON.stringify(says));
});
