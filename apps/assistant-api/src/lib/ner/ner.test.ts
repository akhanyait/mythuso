import test from "node:test";
import assert from "node:assert/strict";
import {
  checkEntityEscalation,
  extractEntities,
  NER_TIMEOUT_MS,
  RED_FLAG_SYMPTOMS,
  type Extraction,
  type NerModel,
} from "./extract.ts";
import { entityContextBlock, routeEntities } from "./route-entities.ts";

/* The NER pre-pass's own tests, added with it on 22 September 2026. The model is a scripted stub —
   a plain object with an invoke — because extract.ts takes the model as an argument and reads no
   environment, so nothing here touches the network. What is under test is the layer's two promises:
   it never throws (every failure is a silent null the orchestrator proceeds past), and it never
   invents structure (a partial or malformed response is normalised down to what is well-formed, and
   the red-flag check fires only on a severe symptom that is actually on the list). */

const emptyExtraction = (): Extraction => ({
  medications: [],
  symptoms: [],
  vitals_mentioned: [],
  time_references: [],
});

/* A stub that answers every call with the given content, shaped like a LangChain AIMessage. */
const modelReturning = (content: unknown): NerModel => ({
  invoke: async () => ({ content }),
});

/* A stub that never settles — the hung-provider case the hard timeout exists for. */
const neverResolvingModel: NerModel = {
  invoke: () => new Promise(() => {}),
};

/* ---- extractEntities: the silent-degradation contract ---- */

test("extractEntities returns null when the model never answers inside the timeout", async () => {
  /* A short timeout keeps the test fast; the behaviour is the hard abort, not the 3s default. */
  const result = await extractEntities(
    "I have chest pain and I take warfarin",
    neverResolvingModel,
    20,
  );
  assert.equal(result, null, "a hung model resolves to null, it never hangs the turn");
});

test("extractEntities returns null on a response that is not JSON", async () => {
  const result = await extractEntities(
    "I have chest pain",
    modelReturning("here you go: {not valid json at all}"),
  );
  assert.equal(result, null, "a response that will not parse is a null, not a throw");

  const noObject = await extractEntities(
    "I have chest pain",
    modelReturning("I cannot help with that."),
  );
  assert.equal(noObject, null, "a response with no JSON object in it is a null");
});

test("extractEntities returns null when the model rejects, and on empty or absent input", async () => {
  const rejecting: NerModel = {
    invoke: async () => {
      throw new Error("provider refused");
    },
  };
  assert.equal(await extractEntities("chest pain", rejecting), null);
  assert.equal(await extractEntities("", modelReturning("{}")), null, "empty text extracts nothing");
  assert.equal(
    await extractEntities("chest pain", modelReturning("{}"), 0),
    null,
    "no budget left means no pre-read",
  );
});

test("extractEntities parses a full, well-formed response into typed entities", async () => {
  const model = modelReturning(
    JSON.stringify({
      medications: [
        { name: "warfarin", dose: 5, unit: "mg", frequency: "daily" },
      ],
      symptoms: [
        { name: "chest pain", severity: "severe", duration: "two hours" },
      ],
      vitals_mentioned: [{ type: "blood_pressure", value: 180, unit: "mmHg" }],
      time_references: [{ text: "since this morning", resolved: "today 06:00" }],
    }),
  );
  const result = await extractEntities("warfarin 5mg daily, chest pain for two hours", model);
  assert.ok(result, "a valid response yields an extraction");
  assert.deepEqual(result.medications, [
    { name: "warfarin", dose: 5, unit: "mg", frequency: "daily" },
  ]);
  assert.deepEqual(result.symptoms, [
    { name: "chest pain", severity: "severe", duration: "two hours" },
  ]);
  assert.deepEqual(result.vitals_mentioned, [
    { type: "blood_pressure", value: 180, unit: "mmHg" },
  ]);
  assert.deepEqual(result.time_references, [
    { text: "since this morning", resolved: "today 06:00" },
  ]);
});

test("extractEntities reads JSON out of a markdown code fence", async () => {
  const model = modelReturning(
    '```json\n{"symptoms":[{"name":"fever","severity":"mild"}]}\n```',
  );
  const result = await extractEntities("I have a fever", model);
  assert.ok(result);
  assert.deepEqual(result.symptoms, [{ name: "fever", severity: "mild" }]);
  assert.deepEqual(result.medications, []);
});

test("extractEntities accepts a partial response — one category, the rest empty", async () => {
  const model = modelReturning(
    JSON.stringify({ symptoms: [{ name: "headache", severity: "mild" }] }),
  );
  const result = await extractEntities("I have a headache", model);
  assert.ok(result);
  assert.deepEqual(result.symptoms, [{ name: "headache", severity: "mild" }]);
  assert.deepEqual(result.medications, [], "an unmentioned category is an empty array");
  assert.deepEqual(result.vitals_mentioned, []);
  assert.deepEqual(result.time_references, []);
});

test("extractEntities keeps only well-formed entities and drops invalid enum values", async () => {
  const model = modelReturning(
    JSON.stringify({
      medications: [
        { name: "aspirin", unit: "buckets", frequency: "hourly" },
        { dose: 5 },
      ],
      symptoms: [{ severity: "severe" }, { name: "dizziness", severity: "catastrophic" }],
    }),
  );
  const result = await extractEntities("aspirin and dizziness", model);
  assert.ok(result);
  /* A name survives; an out-of-vocabulary unit and frequency are dropped, not passed through. */
  assert.deepEqual(result.medications, [{ name: "aspirin" }]);
  /* A symptom with no name is dropped; a bad severity is dropped but the name is kept. */
  assert.deepEqual(result.symptoms, [{ name: "dizziness" }]);
});

/* ---- checkEntityEscalation: the entity-level red-flag re-check ---- */

test("checkEntityEscalation fires on a severe red-flag symptom", () => {
  const extraction: Extraction = {
    ...emptyExtraction(),
    symptoms: [{ name: "chest pain", severity: "severe" }],
  };
  assert.equal(checkEntityEscalation(extraction), "chest pain");

  const breath: Extraction = {
    ...emptyExtraction(),
    symptoms: [{ name: "shortness of breath", severity: "severe" }],
  };
  assert.equal(checkEntityEscalation(breath), "shortness of breath");
});

test("checkEntityEscalation matches a red flag inside a longer symptom name", () => {
  const extraction: Extraction = {
    ...emptyExtraction(),
    symptoms: [
      { name: "severe chest pain radiating to the left arm", severity: "severe" },
    ],
  };
  assert.equal(
    checkEntityEscalation(extraction),
    "severe chest pain radiating to the left arm",
  );
});

test("checkEntityEscalation does not fire on a mild headache", () => {
  const extraction: Extraction = {
    ...emptyExtraction(),
    symptoms: [{ name: "headache", severity: "mild" }],
  };
  assert.equal(
    checkEntityEscalation(extraction),
    null,
    "a red flag needs the severe marking, not only the name",
  );
});

test("checkEntityEscalation does not fire on a severe symptom that is not a red flag", () => {
  const extraction: Extraction = {
    ...emptyExtraction(),
    symptoms: [{ name: "sneezing", severity: "severe" }],
  };
  assert.equal(checkEntityEscalation(extraction), null);
});

test("checkEntityEscalation ignores an empty or unmarked extraction", () => {
  assert.equal(checkEntityEscalation(emptyExtraction()), null);
  const unknownSeverity: Extraction = {
    ...emptyExtraction(),
    symptoms: [{ name: "chest pain" }],
  };
  assert.equal(
    checkEntityEscalation(unknownSeverity),
    null,
    "a symptom with no severity is not escalated by this layer",
  );
});

test("every red-flag term is a lower-case phrase the matcher can meet", () => {
  for (const flag of RED_FLAG_SYMPTOMS) {
    assert.equal(flag, flag.toLowerCase(), `${flag} must be lower-cased to match case-insensitively`);
    assert.ok(flag.trim().length > 0);
  }
});

/* ---- routeEntities: the entity-to-tool map ---- */

test("routeEntities maps a medication to drug_interaction_check and medication_info", () => {
  const hints = routeEntities({
    ...emptyExtraction(),
    medications: [{ name: "warfarin" }],
  });
  const interaction = hints.find((h) => h.tool === "drug_interaction_check");
  const info = hints.find((h) => h.tool === "medication_info");
  assert.ok(interaction, "a medicine suggests an interaction check");
  assert.deepEqual(interaction.args, { drugA: "warfarin", drugB: "" });
  assert.ok(info, "a medicine suggests a medication-info lookup");
  assert.deepEqual(info.args, { medication: "warfarin" });
  assert.ok(interaction.reason.includes("warfarin"));
});

test("routeEntities maps a symptom to symptom_check and knowledge_search", () => {
  const hints = routeEntities({
    ...emptyExtraction(),
    symptoms: [{ name: "chest pain", severity: "mild" }],
  });
  const symptom = hints.find((h) => h.tool === "symptom_check");
  const knowledge = hints.find((h) => h.tool === "knowledge_search");
  assert.ok(symptom);
  assert.deepEqual(symptom.args, { symptoms: "chest pain" });
  assert.ok(knowledge);
  assert.deepEqual(knowledge.args, { query: "chest pain" });
});

test("routeEntities creates pairwise interaction checks for two or more medicines", () => {
  const hints = routeEntities({
    ...emptyExtraction(),
    medications: [{ name: "warfarin" }, { name: "aspirin" }],
  });
  const pair = hints.find(
    (h) =>
      h.tool === "drug_interaction_check" &&
      h.args.drugA === "warfarin" &&
      h.args.drugB === "aspirin",
  );
  assert.ok(pair, "both medicines named together yield a fully-parameterised pair");
  assert.ok(pair.reason.includes("warfarin") && pair.reason.includes("aspirin"));

  /* Three medicines yield three distinct order-free pairs, and no pair is repeated backwards. */
  const three = routeEntities({
    ...emptyExtraction(),
    medications: [{ name: "a" }, { name: "b" }, { name: "c" }],
  });
  const pairs = three.filter(
    (h) => h.tool === "drug_interaction_check" && h.args.drugB !== "",
  );
  assert.equal(pairs.length, 3, "a-b, a-c and b-c, and only those");
});

test("routeEntities returns an empty array for an empty extraction", () => {
  assert.deepEqual(routeEntities(emptyExtraction()), []);
});

/* ---- entityContextBlock: the guidance the orchestrator injects ---- */

test("entityContextBlock is empty for an empty extraction and worded as a hint otherwise", () => {
  assert.equal(entityContextBlock(emptyExtraction(), []), "");
  assert.equal(entityContextBlock(null, []), "");

  const extraction: Extraction = {
    ...emptyExtraction(),
    medications: [{ name: "warfarin" }],
    symptoms: [{ name: "chest pain", severity: "severe" }],
  };
  const block = entityContextBlock(extraction, routeEntities(extraction));
  assert.ok(block.includes("warfarin"));
  assert.ok(block.includes("chest pain"));
  assert.ok(block.includes("drug_interaction_check"));
  assert.ok(
    block.includes("hints") || block.includes("your choice"),
    "the block reads as guidance the model may decline, never as a command",
  );
});

/* The exported constants the orchestrator and its own budget rely on. */
test("the NER timeout is the documented three seconds", () => {
  assert.equal(NER_TIMEOUT_MS, 3_000);
});
