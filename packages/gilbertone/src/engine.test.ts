import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMessage,
  classifyWithConfidence,
  emergencyTerms,
  evaluateMessage,
  normalizeText,
} from "./engine.ts";
import type { ConversationContext } from "./conversation.ts";
import assistant from "../../catalog/assistant.json" with { type: "json" };
import emergencyTermsContract from "../../catalog/gilbert-emergency-terms.json" with { type: "json" };

test("normalizes basic input", () => {
  assert.equal(normalizeText("I can't breathe!"), "i cant breathe");
});

test("recognises emergency wording before anything else", () => {
  const result = evaluateMessage("I feel like I might hurt myself");
  assert.equal(result.classification, "emergency");
  assert.equal(result.route, "emergency");
});

test("recognises a request to talk to a nurse", () => {
  const result = evaluateMessage("Can I talk to a nurse?");
  assert.equal(result.classification, "handover");
  assert.equal(result.route, "handover");
});

test("recognises identity questions", () => {
  const result = evaluateMessage("Who are you?");
  assert.equal(result.classification, "identity");
  assert.equal(result.route, "standard");
});

test("recognises care questions", () => {
  const result = evaluateMessage("When is my nurse coming?");
  assert.equal(result.classification, "care");
  assert.equal(result.route, "standard");
});

test("recognises a greeting and answers it from the contract", () => {
  /* The multi-word greetings are the ones beside a hello that matched nothing else: a greeting
     classification is the engine's decision about the whole message — every category that can
     answer sits above the greeting — so "Hello World" is a greeting, not a hello with a remainder
     somebody downstream must refuse (the web's rule since 21 September 2026). */
  for (const input of [
    "hello",
    "howzit",
    "sawubona",
    "good morning",
    "Hello World",
    "Hey there how are you",
    "Good morning everyone",
  ]) {
    const result = evaluateMessage(input);
    assert.equal(result.classification, "greeting", input);
    assert.equal(result.route, "standard", input);
    /* The sentence is the contract's, not this engine's: a warm hello is reworded in
       packages/catalog/assistant.json's answers.greeting and nowhere else. */
    assert.equal(result.reply, assistant.answers.greeting.sentence, input);
  }
});

test("the greeting terms match whole words, not pieces of other ones", () => {
  /* "hi" lives inside "this" and "hey" inside "they": a greeting fired by part of an ordinary word
     would answer the wrong message, which is why the category matches between word edges. */
  assert.equal(classifyMessage("I do not understand this"), "clarify");
  assert.equal(classifyMessage("they are thinking about her results"), "unknown");
});

test("a greeting in front of a real question answers as the question", () => {
  assert.equal(classifyMessage("hello, when is my nurse coming?"), "care");
  assert.equal(classifyMessage("hey, who are you?"), "identity");
  assert.equal(classifyMessage("good evening, can you hear me?"), "voice");
});

test("an emergency word in the same message overrides a greeting", () => {
  /* Both sentences, because both are now the engine's: since the terms were unified around the
     versioned gilbert-emergency-terms.json this engine reads the same list the web reads and the
     emitters write for the phones, so "ambulance" — the counter-example this test's comment once
     ruled out — is a term the engine itself matches. */
  for (const input of ["hello, I can't breathe", "hello, I need an ambulance"]) {
    const result = evaluateMessage(input);
    assert.equal(result.classification, "emergency", input);
    assert.equal(result.route, "emergency", input);
  }
});

test("clarifies when the request is vague", () => {
  const result = evaluateMessage("I do not understand this");
  assert.equal(result.classification, "clarify");
  assert.equal(result.route, "clarify");
});

test("returns an unknown route for other inputs", () => {
  const result = evaluateMessage(
    "I am trying to remember my appointment details",
  );
  assert.equal(
    classifyMessage("I am trying to remember my appointment details"),
    "unknown",
  );
  assert.equal(result.route, "unknown");
});

test("the audience scopes the patient-voiced routes", () => {
  /* The nurse queue a handover offers belongs to a patient's conversation, and the care terms ask
     about the patient's own visit: behind a staff preview the same words are not that request. */
  assert.equal(classifyMessage("Can I talk to a nurse?", "nurse"), "unknown");
  assert.equal(
    classifyMessage("When is my nurse coming?", "doctor"),
    "unknown",
  );
  /* and the patient keeps both. */
  assert.equal(classifyMessage("Can I talk to a nurse?"), "handover");
  assert.equal(classifyMessage("When is my nurse coming?"), "care");
});

test("an emergency is an emergency for every audience", () => {
  const result = evaluateMessage("I have chest pains", "control-tower");
  assert.equal(result.classification, "emergency");
  assert.equal(result.route, "emergency");
});

test("the emergency words are the versioned list, flattened — one list, not a copy", () => {
  /* packages/catalog/gilbert-emergency-terms.json is the list: the web reads it directly and
     scripts/emit-assistant.mjs writes it into the native apps. This asserts the engine's own
     matched words are those words in that order, so a term typed beside this file is drift and
     this is where it shows. */
  assert.deepEqual(
    emergencyTerms,
    emergencyTermsContract.groups.flatMap((group) => group.words),
  );
});

test("every word the service matched before the list was unified still raises", () => {
  /* The hand-typed list this engine carried until the unification, deduplicated — "hurt myself"
     was typed twice. Each of these raised the ambulance answer then and must raise it now: the
     list only ever raises, and the three words the versioned list did not carry (heart pain,
     pass out, self harm) are what its version 2 entry adds. */
  for (const term of [
    "hurt myself",
    "suicide",
    "kill myself",
    "end my life",
    "self harm",
    "self-harm",
    "cant breathe",
    "can't breathe",
    "short of breath",
    "severe bleeding",
    "bleeding heavily",
    "chest pain",
    "heart pain",
    "unconscious",
    "fainting",
    "seizure",
    "overdose",
    "not breathing",
    "trouble breathing",
    "pass out",
  ]) {
    assert.equal(classifyMessage(term), "emergency", term);
  }
});

test("the words version 2 added raise the emergency answer, from their own groups", () => {
  for (const [input, groupId] of [
    ["I keep getting a heart pain when I walk", "chest-pain"],
    ["I think I am going to pass out", "unresponsive"],
    ["I have wanted to self harm", "crisis"],
  ] as const) {
    const result = evaluateMessage(input);
    assert.equal(result.classification, "emergency", input);
    assert.equal(result.route, "emergency", input);
    assert.deepEqual(
      result.suggestedActions,
      ["call_emergency_services", "seek_urgent_help"],
      input,
    );
    const group = emergencyTermsContract.groups.find((g) => g.id === groupId);
    assert.ok(
      group?.words.some((word) => normalizeText(input).includes(word)),
      `no word of the "${groupId}" group raised "${input}"`,
    );
  }
});

test("a staff audience is told the scope, not offered the patient's doors", () => {
  const result = evaluateMessage("can you check the stock levels", "partner");
  assert.equal(result.classification, "unknown");
  assert.equal(result.route, "unknown");
  assert.deepEqual(result.suggestedActions, ["identity", "voice", "emergency"]);
});

test("a message that matches one category is fully that category", () => {
  const result = classifyWithConfidence("Who are you?");
  assert.equal(result.classification, "identity");
  assert.equal(result.confidence, 1);
});

test("a message that is several things at once is divided among them", () => {
  /* Identity is listed above voice, so it wins — at half confidence rather than whichever the
     engine happened to check last. */
  const result = classifyWithConfidence("Who are you, can you hear me?");
  assert.equal(result.classification, "identity");
  assert.equal(result.confidence, 0.5);
});

test("nothing matched is unknown at zero", () => {
  const result = classifyWithConfidence(
    "I am trying to remember my appointment details",
  );
  assert.equal(result.classification, "unknown");
  assert.equal(result.confidence, 0);
  const empty = classifyWithConfidence("");
  assert.equal(empty.classification, "unknown");
  assert.equal(empty.confidence, 0);
});

test("context lifts a match the last two turns already were", () => {
  const context: ConversationContext = {
    recentClassifications: ["identity", "identity"],
    recentExchanges: [],
    activeTask: null,
    turnCount: 2,
  };
  const result = classifyWithConfidence(
    "Who are you, can you hear me?",
    "patient",
    context,
  );
  assert.equal(result.classification, "identity");
  assert.ok(Math.abs(result.confidence - 0.65) < 1e-9);
});

test("one prior turn, a disagreement, or another subject does not lift anything", () => {
  const one: ConversationContext = {
    recentClassifications: ["identity"],
    recentExchanges: [],
    activeTask: null,
    turnCount: 1,
  };
  const disagreed: ConversationContext = {
    recentClassifications: ["identity", "voice"],
    recentExchanges: [],
    activeTask: null,
    turnCount: 2,
  };
  const other: ConversationContext = {
    recentClassifications: ["voice", "voice"],
    recentExchanges: [],
    activeTask: null,
    turnCount: 2,
  };
  assert.equal(
    classifyWithConfidence("Who are you, can you hear me?", "patient", one)
      .confidence,
    0.5,
  );
  assert.equal(
    classifyWithConfidence(
      "Who are you, can you hear me?",
      "patient",
      disagreed,
    ).confidence,
    0.5,
  );
  assert.equal(
    classifyWithConfidence("Who are you, can you hear me?", "patient", other)
      .confidence,
    0.5,
  );
});

test("the boost never carries confidence past one", () => {
  const context: ConversationContext = {
    recentClassifications: ["care", "care"],
    recentExchanges: [],
    activeTask: "care",
    turnCount: 2,
  };
  const result = classifyWithConfidence(
    "When is my nurse coming?",
    "patient",
    context,
  );
  assert.equal(result.classification, "care");
  assert.equal(result.confidence, 1);
});

test("classifyMessage is the classification half of the same answer", () => {
  for (const input of [
    "I have chest pain",
    "Can I talk to a nurse?",
    "Who are you?",
    "I do not understand this",
    "nothing in here matches anything",
  ]) {
    assert.equal(
      classifyMessage(input),
      classifyWithConfidence(input).classification,
      input,
    );
  }
  /* the audience argument still travels the same way */
  assert.equal(
    classifyMessage("When is my nurse coming?", "doctor"),
    classifyWithConfidence("When is my nurse coming?", "doctor").classification,
  );
});

test("evaluateMessage now carries the confidence beside the words", () => {
  const emergency = evaluateMessage("I feel like I might hurt myself");
  assert.equal(emergency.classification, "emergency");
  assert.equal(emergency.confidence, 1);
  const unknown = evaluateMessage(
    "I am trying to remember my appointment details",
  );
  assert.equal(unknown.classification, "unknown");
  assert.equal(unknown.confidence, 0);
});
