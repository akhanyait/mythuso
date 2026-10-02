import test from "node:test";
import assert from "node:assert/strict";
import { interactionSentences, queryInteractions } from "./openfda-adapter.ts";

/* The openFDA interaction query, on its own. Until 2 October 2026 it asked an endpoint openFDA does
   not publish and encoded its AND as a literal plus; these pin what it asks now — the drug label's
   drug_interactions section, in openFDA's documented search syntax — and what it will not relay.
   Every call is a stubbed fetch passed in deps; nothing here reaches the network. */

const ENABLED = { OPENFDA_ENABLED: "true" };

const label = (generic: string, section: string, id = "label-1") => ({
  id,
  openfda: { generic_name: [generic] },
  drug_interactions: [section],
});

const answering = (...bodies: (object | number)[]) => {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    urls.push(String(input));
    const next = bodies.shift() ?? 404;
    if (typeof next === "number") return new Response("", { status: next });
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
};

test("openFDA interactions: asks the published label index, with AND as openFDA documents it", async () => {
  const { urls, fetchImpl } = answering({
    results: [label("WARFARIN SODIUM", "Fluconazole may increase the anticoagulant effect of warfarin.")],
  });
  const results = await queryInteractions("warfarin", "fluconazole", { fetchImpl, env: ENABLED });
  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(`${url.origin}${url.pathname}`, "https://api.fda.gov/drug/label.json");
  assert.equal(
    url.searchParams.get("search"),
    'openfda.generic_name:"warfarin" AND drug_interactions:"fluconazole"',
  );
  assert.ok(urls[0].includes("+AND+"), "a space-delimited AND reaches openFDA as +AND+");
  assert.equal(urls[0].includes("%2BAND%2B"), false, "never an encoded literal plus");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal(results.length, 1);
  assert.equal(results[0].drug1, "WARFARIN SODIUM");
  assert.equal(results[0].drug2, "fluconazole");
  assert.equal(results[0].severity, "not graded (US label)");
  assert.ok(results[0].effect.includes("may increase the anticoagulant effect"));
  assert.ok(results[0].source.startsWith("openFDA drug label"));
  assert.ok(results[0].recommendation.includes("not South African guidance"));
});

test("openFDA interactions: asks the other medicine's label when the first says nothing", async () => {
  const { urls, fetchImpl } = answering(404, {
    results: [label("FLUCONAZOLE", "Warfarin: fluconazole increases the prothrombin time.")],
  });
  const results = await queryInteractions("warfarin", "fluconazole", { fetchImpl, env: ENABLED });
  assert.equal(urls.length, 2);
  assert.equal(
    new URL(urls[1]).searchParams.get("search"),
    'openfda.generic_name:"fluconazole" AND drug_interactions:"warfarin"',
  );
  assert.equal(results[0].drug1, "FLUCONAZOLE");
  assert.equal(results[0].drug2, "warfarin");
});

test("openFDA interactions: a dose sentence is never relayed, and the label still counts as naming the pair", async () => {
  const { fetchImpl } = answering({
    results: [label("SIMVASTATIN", "Do not exceed 20 mg simvastatin daily with amlodipine. Reduce the dose of amlodipine if needed.")],
  });
  const [result] = await queryInteractions("simvastatin", "amlodipine", { fetchImpl, env: ENABLED });
  assert.ok(result.effect.includes("names amlodipine in its drug-interactions section"));
  assert.ok(result.effect.includes("does not relay"));
  assert.equal(/\bmg\b|dose of/.test(result.effect.replace("about dose", "")), false);
});

test("openFDA interactions: one generic filed by several manufacturers is one finding", async () => {
  const section = "Clarithromycin may raise the level of this medicine.";
  const { fetchImpl } = answering({
    results: [label("COLCHICINE", section, "a"), label("COLCHICINE", section, "b"), label("COLCHICINE", section, "c")],
  });
  const results = await queryInteractions("colchicine", "clarithromycin", { fetchImpl, env: ENABLED });
  assert.equal(results.length, 1);
});

test("openFDA interactions: a label whose section does not name the other medicine is dropped", async () => {
  const { fetchImpl } = answering({ results: [label("ASPIRIN", "Anticoagulants may increase bleeding.")] }, { results: [] });
  assert.deepEqual(await queryInteractions("aspirin", "heparin", { fetchImpl, env: ENABLED }), []);
});

test("openFDA interactions: dark without OPENFDA_ENABLED — nothing leaves the process", async () => {
  const { urls, fetchImpl } = answering({ results: [] });
  assert.deepEqual(await queryInteractions("warfarin", "fluconazole", { fetchImpl, env: {} }), []);
  assert.equal(urls.length, 0);
});

test("openFDA interactions: only plain medicine words leave, never search syntax", async () => {
  const { urls, fetchImpl } = answering(404, 404);
  await queryInteractions('warfarin" OR id:"x', "fluconazole", { fetchImpl, env: ENABLED });
  assert.equal(
    new URL(urls[0]).searchParams.get("search"),
    'openfda.generic_name:"warfarin OR id x" AND drug_interactions:"fluconazole"',
  );
});

test("openFDA interactions: every failure is silent and empty", async () => {
  const failing = (async () => {
    throw new Error("simulated network failure");
  }) as unknown as typeof fetch;
  assert.deepEqual(await queryInteractions("warfarin", "fluconazole", { fetchImpl: failing, env: ENABLED }), []);
  const { fetchImpl } = answering(503, 503);
  assert.deepEqual(await queryInteractions("warfarin", "fluconazole", { fetchImpl, env: ENABLED }), []);
  const malformed = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await queryInteractions("warfarin", "fluconazole", { fetchImpl: malformed, env: ENABLED }), []);
});

test("openFDA interactions: the sentence filter keeps the interaction and drops the dose", () => {
  const section =
    "7.1 Warfarin. Fluconazole may increase the effect of warfarin; monitor INR. Start fluconazole at 50 mg when given with warfarin.";
  assert.deepEqual(interactionSentences(section, "fluconazole"), [
    "Fluconazole may increase the effect of warfarin; monitor INR.",
  ]);
});
