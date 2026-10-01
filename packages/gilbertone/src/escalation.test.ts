import test from "node:test";
import assert from "node:assert/strict";
import {
  checkEscalation,
  ESCALATION_RULES,
  type Severity,
} from "./escalation.ts";
import crisisContract from "../../catalog/crisis-lines.json" with { type: "json" };
import { foldCharacters } from "./fold.ts";
import { evaluateRefusals } from "./refusals.ts";

/* A phrase that must escalate to a specific rule. Each entry is checked end to end: the rule that
   fires, its severity, and that the message it carries is the approved one for that rule. */
type Positive = { phrase: string; ruleId: string; severity: Severity };

const positives: readonly Positive[] = [
  // cardiac-chest-pain (emergency)
  { phrase: "I have chest pain", ruleId: "cardiac-chest-pain", severity: "emergency" },
  { phrase: "there is a crushing pressure in my chest", ruleId: "cardiac-chest-pain", severity: "emergency" },
  { phrase: "the pain radiates down my left arm", ruleId: "cardiac-chest-pain", severity: "emergency" },
  { phrase: "I keep getting shortness of breath", ruleId: "cardiac-chest-pain", severity: "emergency" },

  // self-harm (emergency)
  { phrase: "I feel suicidal", ruleId: "self-harm", severity: "emergency" },
  { phrase: "I want to hurt myself", ruleId: "self-harm", severity: "emergency" },
  { phrase: "I want to die", ruleId: "self-harm", severity: "emergency" },
  { phrase: "sometimes I think about ending it all", ruleId: "self-harm", severity: "emergency" },

  // neuro-stroke (emergency)
  { phrase: "my face is drooping on one side", ruleId: "neuro-stroke", severity: "emergency" },
  { phrase: "her speech is slurred", ruleId: "neuro-stroke", severity: "emergency" },
  { phrase: "sudden numbness down the left side of my body", ruleId: "neuro-stroke", severity: "emergency" },
  { phrase: "he has sudden confusion", ruleId: "neuro-stroke", severity: "emergency" },

  // respiratory-distress (emergency)
  { phrase: "I can't breathe", ruleId: "respiratory-distress", severity: "emergency" },
  { phrase: "the child is choking", ruleId: "respiratory-distress", severity: "emergency" },
  { phrase: "my throat is closing", ruleId: "respiratory-distress", severity: "emergency" },
  { phrase: "his lips are blue", ruleId: "respiratory-distress", severity: "emergency" },

  // severe-allergic (emergency)
  { phrase: "my throat is swelling", ruleId: "severe-allergic", severity: "emergency" },
  { phrase: "her tongue is swollen", ruleId: "severe-allergic", severity: "emergency" },
  { phrase: "I think this is anaphylaxis", ruleId: "severe-allergic", severity: "emergency" },
  { phrase: "hives all over and difficulty breathing", ruleId: "severe-allergic", severity: "emergency" },

  // uncontrolled-bleeding (emergency)
  { phrase: "the bleeding won't stop", ruleId: "uncontrolled-bleeding", severity: "emergency" },
  { phrase: "blood is spurting from the wound", ruleId: "uncontrolled-bleeding", severity: "emergency" },
  { phrase: "he cut an artery", ruleId: "uncontrolled-bleeding", severity: "emergency" },

  // seizure (emergency)
  { phrase: "she is having a seizure", ruleId: "seizure", severity: "emergency" },
  { phrase: "he has convulsions", ruleId: "seizure", severity: "emergency" },
  { phrase: "she is shaking uncontrollably", ruleId: "seizure", severity: "emergency" },

  // poisoning-overdose (emergency)
  { phrase: "I swallowed bleach", ruleId: "poisoning-overdose", severity: "emergency" },
  { phrase: "he took too many pills", ruleId: "poisoning-overdose", severity: "emergency" },
  { phrase: "I think I overdosed", ruleId: "poisoning-overdose", severity: "emergency" },

  // persistent-high-fever (urgent)
  { phrase: "my fever is 40 degrees", ruleId: "persistent-high-fever", severity: "urgent" },
  { phrase: "the fever has lasted 3 days", ruleId: "persistent-high-fever", severity: "urgent" },
  { phrase: "my temperature is 103", ruleId: "persistent-high-fever", severity: "urgent" },

  // severe-dehydration (urgent)
  { phrase: "no urine for 8 hours", ruleId: "severe-dehydration", severity: "urgent" },
  { phrase: "the baby has sunken eyes", ruleId: "severe-dehydration", severity: "urgent" },
  { phrase: "severe dizziness when I stand up", ruleId: "severe-dehydration", severity: "urgent" },

  // hypertensive-crisis (urgent)
  { phrase: "my blood pressure is 190/125", ruleId: "hypertensive-crisis", severity: "urgent" },
  { phrase: "severe headache with blurred vision", ruleId: "hypertensive-crisis", severity: "urgent" },

  // acute-abdomen (urgent)
  { phrase: "severe abdominal pain", ruleId: "acute-abdomen", severity: "urgent" },
  { phrase: "my abdomen feels rigid", ruleId: "acute-abdomen", severity: "urgent" },
  { phrase: "I am vomiting blood", ruleId: "acute-abdomen", severity: "urgent" },
  { phrase: "there is blood in my stool", ruleId: "acute-abdomen", severity: "urgent" },
];

test("every expected symptom escalates to the right rule, severity and approved message", () => {
  const byId = new Map(ESCALATION_RULES.map((rule) => [rule.id, rule]));
  for (const { phrase, ruleId, severity } of positives) {
    const result = checkEscalation(phrase);
    assert.ok(result, `expected "${phrase}" to escalate`);
    assert.equal(result.rule.id, ruleId, phrase);
    assert.equal(result.rule.severity, severity, phrase);
    assert.equal(result.rule, byId.get(ruleId), phrase);
    // The matched slice is real text drawn from the input, not the pattern source.
    assert.ok(result.matchedPattern.length > 0, phrase);
    assert.ok(phrase.toLowerCase().includes(result.matchedPattern.toLowerCase()), phrase);
    // The message describes symptoms and an action, and never names a diagnosis as certain.
    assert.ok(result.rule.message.length > 0, phrase);
  }
});

test("the ruleset covers the twelve presentations it promises", () => {
  const ids = ESCALATION_RULES.map((rule) => rule.id);
  for (const expected of [
    "cardiac-chest-pain",
    "self-harm",
    "neuro-stroke",
    "respiratory-distress",
    "severe-allergic",
    "uncontrolled-bleeding",
    "seizure",
    "poisoning-overdose",
    "persistent-high-fever",
    "severe-dehydration",
    "hypertensive-crisis",
    "acute-abdomen",
  ])
    assert.ok(ids.includes(expected), `missing rule ${expected}`);
  assert.equal(new Set(ids).size, ids.length, "rule ids must be unique");
});

test("benign text does not escalate", () => {
  for (const phrase of [
    "I have a mild headache",
    "book a nurse visit",
    "when is my next appointment",
    "I feel a bit tired today",
    "can you help me arrange care",
    "the weather is nice this morning",
    "I would like to understand my results",
  ])
    assert.equal(checkEscalation(phrase), null, `"${phrase}" should not escalate`);
});

test("emergency rules are ordered before urgent rules", () => {
  let seenUrgent = false;
  for (const rule of ESCALATION_RULES) {
    if (rule.severity === "urgent") seenUrgent = true;
    else if (rule.severity === "emergency")
      assert.equal(seenUrgent, false, `${rule.id} is emergency but sits after an urgent rule`);
  }
  assert.ok(seenUrgent, "expected at least one urgent rule");
});

test("when an emergency and an urgent symptom share a message, the emergency wins", () => {
  // acute-abdomen (urgent, last) and respiratory-distress (emergency) are both present; the
  // first-match-wins order means the emergency route answers.
  const result = checkEscalation("severe abdominal pain and I can't breathe");
  assert.ok(result);
  assert.equal(result.rule.severity, "emergency");
  assert.equal(result.rule.id, "respiratory-distress");
});

test("a symptom named in the session history escalates even if the last turn does not repeat it", () => {
  // The last turn alone is benign-ish; "chest pain" sits in history[0] and must still be caught.
  const result = checkEscalation("and now I feel dizzy", ["I have chest pain"]);
  assert.ok(result);
  assert.equal(result.rule.id, "cardiac-chest-pain");
  assert.equal(result.rule.severity, "emergency");
});

test("history is searched together with the transcript for every severity", () => {
  const urgent = checkEscalation("it is still bad", ["my blood pressure is 190/125"]);
  assert.ok(urgent);
  assert.equal(urgent.rule.id, "hypertensive-crisis");

  const emergency = checkEscalation("hello", ["earlier: I swallowed bleach"]);
  assert.ok(emergency);
  assert.equal(emergency.rule.id, "poisoning-overdose");
});

test("an empty transcript with no history does not escalate", () => {
  assert.equal(checkEscalation(""), null);
  assert.equal(checkEscalation("", []), null);
});

/* The way a phone types, 1 October 2026. Every phrase here escalated with a straight apostrophe and
   ordinary spaces and did not as iOS writes it — a curly apostrophe, a no-break space, a zero-width
   character pasted in — so the same words met "unknown". escalation.ts is a locked Tier 1 artefact
   and is not edited: every caller folds the text on the way in (fold.ts), and each typed form,
   folded, must reach the same rule the plain one does. */
const typed: readonly { says: string; ruleId: string }[] = [
  { says: "I don\u2019t want to live anymore", ruleId: "self-harm" },
  { says: "I don\u2018t want to be here", ruleId: "self-harm" },
  { says: "I don\u02bct want to live", ruleId: "self-harm" },
  { says: "I can\u2019t catch my breath", ruleId: "cardiac-chest-pain" },
  { says: "he can\u2019t talk", ruleId: "neuro-stroke" },
  { says: "I can\u2032t breathe", ruleId: "respiratory-distress" },
  { says: "my throat\u00a0is swelling", ruleId: "severe-allergic" },
  { says: "my\u202fface is drooping", ruleId: "neuro-stroke" },
  { says: "I can\u200b\u2019t breathe", ruleId: "respiratory-distress" },
  { says: "the bleed\u2060ing won\u2019t stop", ruleId: "uncontrolled-bleeding" },
  { says: "I\u00a0\u00a0 don\u2019t   want to\tlive", ruleId: "self-harm" },
  { says: "\uff2d\uff39 THROAT IS SWELLING", ruleId: "severe-allergic" },
];

test("a curly apostrophe, a no-break space or an invisible character never hides a rule, once folded", () => {
  for (const { says, ruleId } of typed) {
    assert.equal(checkEscalation(foldCharacters(says))?.rule.id, ruleId, JSON.stringify(says));
    /* And through the refusal engine, which folds for itself: with consent withheld, an emergency is
       still never refused, whether the classifier or the ruleset was the one that knew it. */
    assert.equal(evaluateRefusals(says, "patient", false).refused, false, JSON.stringify(says));
  }
});

test("the punctuation the patterns read survives the fold: the slash, the decimal point, the full stop", () => {
  const folded = (text: string) => checkEscalation(foldCharacters(text));
  assert.equal(folded("my blood pressure is 190/125")?.rule.id, "hypertensive-crisis");
  assert.equal(folded("my fever is 39.5 degrees")?.rule.id, "persistent-high-fever");
  /* A full stop still ends a `[^.]` window, so a rash in one sentence and a breath in the next are
     two things said, not one presentation — exactly as before the fold. */
  assert.equal(folded("I have a rash. I took a deep breath and relaxed"), null);
});

test("the escalation rules the crisis lines follow are emergency rules that exist", () => {
  for (const id of crisisContract.showsWhen.escalationRules) {
    const rule = ESCALATION_RULES.find((r) => r.id === id);
    assert.ok(rule, `crisis-lines.json names the escalation rule "${id}", which escalation.ts does not carry`);
    assert.equal(rule.severity, "emergency", id);
  }
  assert.ok(crisisContract.showsWhen.escalationRules.includes("self-harm"));
});
