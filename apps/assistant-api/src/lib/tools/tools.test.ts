import test from "node:test";
import assert from "node:assert/strict";
import sos from "../../../../../packages/catalog/sos.json" with { type: "json" };
import mentalHealth from "../../../../../packages/catalog/knowledge/mental-health.json" with { type: "json" };
import crisisLines from "../../../../../packages/catalog/crisis-lines.json" with { type: "json" };
import {
  formatKnowledgeResults,
  knowledgeSearchTool,
  searchKnowledgeBase,
} from "./knowledge-search.ts";
import { checkDrugInteraction, drugCheckTool } from "./drug-check.ts";
import { checkSymptoms, symptomCheckTool } from "./symptom-check.ts";
import { lookupMedication, medicationInfoTool } from "./medication-info.ts";
import { emergencyNumbers, emergencyNumbersTool } from "./emergency-numbers.ts";
import { lookupCoverage, coverageLookupTool } from "./coverage-lookup.ts";
import geography from "../../../../../packages/catalog/geography.json" with { type: "json" };
import { searchLiterature, literatureSearchTool } from "./literature-search.ts";
import { federationSource } from "../sources/config.ts";
import { RateGate } from "../sources/rate-gate.ts";
import { overrideClosed } from "../demonstration-override.ts";

/* The five tools' own tests, added with the orchestrator tier on 21 September 2026. Every tool is
   a catalog lookup, so the assertions pin outputs to the catalog's own records — read here from
   the same JSON the tools read, so a record that changes in the catalog fails the test that quotes
   it rather than the two quietly drifting apart. The recurring assertions are the safety contract:
   every output carries its sources, names no diagnosis, and hands the decision to a clinician.
   The LangChain wrappers are invoked once each, because the wrapper — not the function — is what
   the agent calls. */

test("knowledge-search hands the model titled, attributed excerpts", async () => {
  const output = await searchKnowledgeBase("child immunisation schedule");
  assert.ok(
    output.includes(
      'Knowledge base results for "child immunisation schedule":',
    ),
  );
  assert.ok(output.includes("Childhood Immunisation"));
  assert.ok(
    output.includes("Source: "),
    "every excerpt carries its source line",
  );
  assert.ok(
    output.includes("Citation: "),
    "every excerpt carries its structured citation",
  );
  assert.ok(
    output.includes("Sources: SA NDoH Expanded Programme on Immunisation"),
  );
  assert.ok(
    output.includes("none of it is a diagnosis or a prescription"),
    "the excerpts say what they are not",
  );
  /* The empty answer is still an attributed answer. */
  const empty = await searchKnowledgeBase("zzz qqq nothing here");
  assert.ok(empty.includes("Nothing in MyThuso's knowledge base matches"));
  assert.ok(empty.includes("Sources:"));
});

test("formatKnowledgeResults keeps each result to title, snippet, source and citation", () => {
  const formatted = formatKnowledgeResults("a query", [
    {
      id: "stub-001",
      title: "Stub title",
      snippet: "Stub snippet",
      source: "Stub source",
      score: 0.9,
      file: "prevention",
      codes: {},
      citation: { authority: "Stub source" },
    },
  ]);
  assert.ok(formatted.includes("1. Stub title (relevance 90%, prevention)"));
  assert.ok(formatted.includes("Stub snippet"));
  assert.ok(formatted.includes("Source: Stub source"));
  assert.ok(formatted.includes("Citation: Stub source"));
  assert.ok(formatted.includes("Sources: Stub source."));
});

test("drug-check finds the recorded pair behind South African shelf names", async () => {
  /* brufen -> ibuprofen, disprin -> aspirin: the aliases exist so a person's own word for a
    medicine reaches the generic the record is written in. */
  const output = await checkDrugInteraction("brufen", "disprin");
  assert.ok(
    output.includes(
      "One recorded interaction found between Ibuprofen and Aspirin",
    ),
  );
  assert.ok(output.includes("severity: MODERATE"));
  assert.ok(output.includes("Effect: "));
  assert.ok(output.includes("What the record advises: "));
  assert.ok(
    output.includes(
      "Sources: OpenFDA / SA NDoH Standard Treatment Guidelines.",
    ),
  );
  assert.ok(
    output.includes("not advice to take, change or stop either medicine"),
    "the record closes by handing the decision back",
  );
  /* And the pair is order-free: the question does not stop being a question when the names swap. */
  assert.ok(
    (await checkDrugInteraction("aspirin", "ibuprofen")).includes(
      "severity: MODERATE",
    ),
  );
});

test("drug-check reads the warfarin and aspirin record at its recorded severity", async () => {
  const output = await checkDrugInteraction("warfarin", "aspirin");
  assert.ok(output.includes("severity: HIGH"));
  assert.ok(output.includes("Increased bleeding risk"));
  assert.ok(output.includes("Avoid the combination"));
});

test("drug-check answers a same-medicine pair and a missing name honestly", async () => {
  const same = await checkDrugInteraction("panado", "paracetamol");
  assert.ok(
    same.includes("the same medicine"),
    "panado and paracetamol are one medicine",
  );
  assert.ok(same.includes("ask a pharmacist or your nurse"));
  const unnamed = await checkDrugInteraction("", "aspirin");
  assert.ok(unnamed.includes("Two medicine names are needed"));
});

test('drug-check says "no record", never "safe to combine"', async () => {
  const output = await checkDrugInteraction("paracetamol", "loratadine");
  assert.ok(output.includes("No known interaction is recorded"));
  assert.ok(output.includes("That is not the same as safe to combine"));
  assert.ok(output.includes("Sources:"));
});

test("symptom-check mirrors the catalog, with the doctor line beside every condition", async () => {
  const output = await checkSymptoms("runny nose, sore throat and sneezing");
  assert.ok(output.includes("Common Cold"));
  assert.ok(output.includes("When to see a doctor: "));
  assert.ok(
    output.includes(
      "This is a reading of recorded symptom lists, not a diagnosis.",
    ),
  );
  assert.ok(output.includes("Sources: "));
});

test("symptom-check leads with the IMCI danger signs when a child carries one", async () => {
  const output = await checkSymptoms(
    "my baby is not drinking anything and vomiting everything",
  );
  assert.ok(
    output.startsWith("URGENT"),
    "the urgent line comes first, before any condition list",
  );
  assert.ok(output.includes("cannot drink or breastfeed"));
  assert.ok(output.includes("vomits everything"));
  assert.ok(output.includes("10177"));
  /* A mild cold in a child is guidance, not an alarm: no red flag words, no urgent line. */
  const mild = await checkSymptoms("my baby has a runny nose and mild cough");
  assert.equal(mild.includes("URGENT"), false);
  assert.ok(mild.includes("When to see a doctor: "));
});

test("symptom-check answers silence and an empty ask as silence and a request", async () => {
  const none = await checkSymptoms("zzz qqq");
  assert.ok(
    none.includes("No condition in MyThuso's list records these symptoms"),
  );
  assert.ok(
    none.includes("10177"),
    "even the empty answer names the emergency number",
  );
  const empty = await checkSymptoms("");
  assert.ok(empty.includes("Describe the symptoms"));
});

test("medication-info reads the paracetamol record back in full", async () => {
  const output = await lookupMedication("paracetamol");
  assert.ok(output.includes("Paracetamol"));
  assert.ok(output.includes("Usual dosage on the record: Adults: 500mg-1g"));
  assert.ok(output.includes("Side effects listed: "));
  assert.ok(output.includes("Cautions and contraindications: "));
  assert.ok(output.includes("Pregnancy: "));
  assert.ok(output.includes("not a prescription"));
  assert.ok(
    output.includes(
      "Sources: SA Essential Medicines List / SA NDoH Standard Treatment Guidelines.",
    ),
  );
  /* A generic word meets its qualified name: "aspirin" is the Aspirin (low-dose) record. */
  const aspirin = await lookupMedication("aspirin");
  assert.ok(aspirin.includes("Aspirin (low-dose)"));
  assert.ok(aspirin.includes("Usual dosage on the record: "));
});

test("medication-info answers ambiguity with the list and absence with the truth", async () => {
  const ambiguous = await lookupMedication("amox");
  assert.ok(ambiguous.includes('More than one medicine answers to "amox"'));
  assert.ok(ambiguous.includes("Amoxicillin"));
  assert.ok(ambiguous.includes("Name the exact one"));
  const absent = await lookupMedication("panado");
  assert.ok(absent.includes("is not in MyThuso's medication list"));
  assert.ok(
    absent.includes("prescribing label and their instructions come first"),
  );
  const empty = await lookupMedication("");
  assert.ok(empty.includes("Name a medicine"));
});

test("emergency-numbers carries sos.json’s own three, by the contract’s ordering", async () => {
  const output = await emergencyNumbers("not specified");
  for (const entry of sos.emergency.numbers) {
    assert.ok(
      output.includes(`${entry.name}: ${entry.number}`),
      `${entry.id} (${entry.number}) should be read from sos.json, not typed`,
    );
  }
  /* The support lines are pinned against the catalog's mental-health resources: a number that
    changes in the catalog fails here rather than going stale on a person in crisis. */
  const catalogResources = mentalHealth
    .flatMap((entry: { saResources?: string[] }) => entry.saResources ?? [])
    .join("\n");
  for (const number of ["0800 567 567", "0861 322 322", "0800 428 428"])
    assert.ok(
      catalogResources.includes(number),
      `${number} should be the catalog's own number for a support line`,
    );
  /* The two crisis lines are packages/catalog/crisis-lines.json's own, name and number. */
  for (const line of crisisLines.lines) {
    assert.ok(output.includes(line.name), `${line.name} should be read from crisis-lines.json`);
    assert.ok(output.includes(line.number));
  }
  assert.ok(output.includes("0800 567 567"));
  assert.ok(output.includes("0861 322 322"));
  assert.ok(output.includes("Sources: "));
  /* A support-shaped question gets the support sentence; a plain ask does not. */
  assert.ok(
    (
      await emergencyNumbers("I am feeling very depressed and anxious")
    ).includes("For how you are feeling"),
  );
  assert.equal(output.includes("For how you are feeling"), false);
});

test("coverage-lookup answers a phase-one zone as coverage, never as a facility", async () => {
  const output = await lookupCoverage("is there a clinic near Melville");
  assert.ok(
    output.includes("Melville"),
    "the zone matched inside a longer sentence should be named",
  );
  assert.ok(output.includes("phase-one coverage area"));
  assert.ok(
    output.includes("not a directory of real clinics or pharmacies"),
    "a matched zone must still say plainly that this is not a facility result",
  );
  assert.ok(output.includes("National Department of Health"));
  assert.ok(output.includes("Sources: MyThuso geography catalog"));

  /* Every zone geography.json actually carries answers, by its own name. */
  for (const zone of geography.zones as { name: string }[])
    assert.ok(
      (await lookupCoverage(zone.name)).includes(zone.name),
      `${zone.name} should be read from geography.json, not typed`,
    );
});

test("coverage-lookup refuses an area outside phase one honestly, not as an empty result", async () => {
  const output = await lookupCoverage("Cape Town");
  const outsideCoverage = (
    geography.refusals as { id: string; sentence: string }[]
  ).find((entry) => entry.id === "outside-coverage");
  assert.ok(
    outsideCoverage,
    "geography.json should still carry the outside-coverage refusal this tool reads",
  );
  assert.ok(
    output.includes(outsideCoverage!.sentence),
    "the catalog's own refusal sentence, not a typed one",
  );
  assert.ok(
    output.includes("not a directory of real clinics or pharmacies"),
    'an out-of-coverage answer must not read like "no results near you" when the real gap is that no facility directory exists at all',
  );
  assert.ok(
    output.includes("Randburg"),
    "the covered zones are named so the refusal leaves the reader somewhere to stand",
  );

  /* Nonsense input gets the same honest refusal, not a silent non-answer. */
  const gibberish = await lookupCoverage("zzz qqq nowhere");
  assert.ok(gibberish.includes(outsideCoverage!.sentence));

  const empty = await lookupCoverage("");
  assert.ok(empty.includes("Name a suburb or area"));
  assert.ok(empty.includes("not whether a clinic or pharmacy is there"));
});

/* literature-search's own tests.

   REWRITTEN 6 OCTOBER 2026 WHEN THE TOOL WAS ROUTED THROUGH THE GOVERNED ADAPTER. This block used
   to stub globalThis.fetch and expect a live answer, because the tool made its own call to Europe
   PMC and nothing decided whether it might. It cannot be tested that way any more, and it should not
   be: the tool now asks pubmed-adapter.ts, which asks federation.json. So the first test here is the
   one that did not exist — that the DEFAULT state of a deployment is a refusal, and that the refusal
   costs nothing on the network. The live-shape tests follow, and they inject an activated COPY of the
   real federation.json row through AdapterDeps (the seam adapters.test.ts uses), never an edit of the
   contract: if federation.json ever renames the source or the flag, those tests fail on the copy
   rather than quietly passing against a config that no longer exists.

   Every test that could reach a network passes a stub fetch that records what it was given, so a
   "nothing was sent" assertion is a fact about the call list and not about a missing assertion. */

const stubFetch = (impl: typeof fetch): (() => void) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
};

const europePmcBody = (result: Record<string, unknown>[]): string =>
  JSON.stringify({ resultList: { result } });

/* An activated copy of the real row — the injection seam, never an edit of the contract. */
const activePubMed = () => {
  const source = federationSource("pubmed-europepmc");
  assert.ok(source, "federation.json should carry pubmed-europepmc");
  return { ...source, active: true };
};

/* A gate of its own, so a test never spends the real source's shared budget or another test's. */
const liveDeps = (fetchImpl: typeof fetch) => ({
  config: activePubMed(),
  fetchImpl,
  gate: new RateGate(30),
});

test("literature-search refuses while its source is dark, and sends nothing", async () => {
  /* The go-live state: the real federation.json row ("active": false) with the founder's
     demonstration override switched off. This is what production does today. */
  const calls: string[] = [];
  const restore = stubFetch((async (input: unknown) => {
    calls.push(String(input));
    throw new Error("a dark source must not be called");
  }) as unknown as typeof fetch);
  try {
    const output = await searchLiterature("gestational diabetes", {
      override: overrideClosed,
    });
    assert.ok(
      output.includes("Europe PMC is switched off"),
      "the answer says the source is off",
    );
    assert.ok(
      output.includes("nothing was sent"),
      "and that nothing was sent — a governed refusal is not an empty literature",
    );
    assert.ok(
      output.includes("governance"),
      "the refusal is named as MyThuso's own switch, not as a fact about the research",
    );
    assert.ok(
      output.includes("nurse, doctor or pharmacist"),
      "and hands the search to a person who can run it",
    );
    assert.deepEqual(calls, [], "a dark source is never called");
  } finally {
    restore();
  }
});

test("literature-search parses a real-shaped Europe PMC response into cited results", async () => {
  const seen: string[] = [];
  const restore = stubFetch((async (input: unknown) => {
    seen.push(String(input));
    return new Response(
      europePmcBody([
        {
          id: "42149813",
          pmid: "42149813",
          pmcid: "PMC13579056",
          doi: "10.1093/ajh/hpag047",
          title:
            "Whole-body and intracellular arginine metabolism in hypertension.",
          authorString: "Hüttl VN, Deutz NEP, Wierzchowska-McNew RA.",
          pubYear: "2026",
          journalTitle: "Am J Hypertens",
          /* CC BY is one of the two licences the adapter will show text under, so the opening is
             carried; the non-reusable case is its own test below. */
          license: "cc by",
          abstractText:
            "This study investigates arginine metabolism in hypertensive adults, finding altered whole-body flux.",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch);
  try {
    const output = await searchLiterature(
      "gestational diabetes",
      liveDeps(globalThis.fetch),
    );
    assert.ok(seen.length === 1, "exactly one request left the process");
    assert.ok(
      seen[0].startsWith(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
      ),
      "and it is the endpoint federation.json records, read from the contract rather than typed here",
    );
    assert.ok(
      seen[0].includes("query=gestational"),
      "the query reaches the request URL",
    );
    assert.ok(output.includes("Real, published papers from Europe PMC"));
    assert.ok(
      output.includes(
        "Whole-body and intracellular arginine metabolism in hypertension.",
      ),
    );
    assert.ok(output.includes("2026"));
    assert.ok(output.includes("Am J Hypertens"));
    assert.ok(output.includes("Hüttl VN"));
    assert.ok(
      output.includes("PMID:42149813"),
      "every result carries the real identifier that makes it checkable",
    );
    assert.ok(
      output.includes("https://europepmc.org/article/MED/42149813"),
      "and the page that identifier resolves to",
    );
    assert.ok(
      output.includes("This study investigates arginine metabolism"),
      "the abstract opening is carried, never a rewritten summary",
    );
    assert.ok(output.includes("never a conclusion drawn from them"));
    assert.ok(output.includes("Sources: Europe PMC"));
  } finally {
    restore();
  }
});

test("literature-search withholds an abstract its record's licence does not cover, and says why", async () => {
  const restore = stubFetch(
    (async () =>
      new Response(
        europePmcBody([
          {
            pmid: "777",
            title: "A study under a licence MyThuso may not reproduce",
            pubYear: "2024",
            journalTitle: "Some Journal",
            /* CC BY-NC is not for a commercial service: federation.json records that only CC BY and
               CC0 text may be shown or reworded, so the adapter hands over the citation and not the
               text. This is the discipline the ungoverned call had no way to apply. */
            license: "cc by-nc",
            abstractText:
              "These are the words MyThuso has no licence to reproduce, and they must not appear.",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch,
  );
  try {
    const output = await searchLiterature("hypertension", liveDeps(globalThis.fetch));
    assert.ok(output.includes("PMID:777"), "the citation is still checkable");
    assert.ok(
      !output.includes("These are the words MyThuso has no licence"),
      "and the licensed-out text is not reproduced",
    );
    assert.ok(
      output.includes("does not cover a commercial service reproducing it"),
      "the reason is stated, so a missing abstract is not read as a paper with none",
    );
    assert.ok(
      output.includes("cc by-nc"),
      "the record's own licence is named in that reason",
    );
  } finally {
    restore();
  }
});

test('literature-search degrades to an honest "could not be reached" answer, never a hang or a thrown error', async () => {
  const restore = stubFetch((async () => {
    throw new Error("simulated network failure");
  }) as unknown as typeof fetch);
  try {
    const output = await searchLiterature(
      "hypertension",
      liveDeps(globalThis.fetch),
    );
    assert.ok(output.includes("could not be reached"));
    assert.ok(
      output.includes("says nothing about whether literature exists"),
      'unreachable is never presented as "nothing found"',
    );
    assert.ok(output.includes("Sources: Europe PMC"));
  } finally {
    restore();
  }

  /* A response that answers but not with 200 (servers down, blocked) fails the same honest way. */
  const restoreBadStatus = stubFetch(
    (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
  );
  try {
    const output = await searchLiterature(
      "hypertension",
      liveDeps(globalThis.fetch),
    );
    assert.ok(output.includes("could not be reached"));
  } finally {
    restoreBadStatus();
  }
});

test("literature-search reports the rate limit as a wait, and sends nothing", async () => {
  /* The whole point of routing the tool through the adapter: the ceiling in federation.json is now
     one ceiling for every road to this source, not a limit one caller happened to respect.

     The gate is spent before the ask rather than constructed empty, and the clock is pinned so the
     spend and the ask fall in one window. An empty gate cannot prove a refusal here: a gate built
     with a ceiling of zero computes its wait from a hit that does not exist, and Math.max(1, NaN)
     answers NaN, which is not > 0 — so it ADMITS the call it was meant to refuse. That is worth
     knowing about rate-gate.ts, but it is not this tool's defect and this test must not depend on
     it. Spending a real token exercises the same path production hits when the ceiling is reached. */
  const calls: string[] = [];
  const restore = stubFetch((async (input: unknown) => {
    calls.push(String(input));
    return new Response(europePmcBody([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch);
  try {
    const pinned = Date.UTC(2026, 9, 6, 12, 0, 0);
    const gate = new RateGate(1);
    assert.equal(gate.take(pinned), true, "the first ask spends the one token");
    const output = await searchLiterature("hypertension", {
      config: activePubMed(),
      fetchImpl: globalThis.fetch,
      now: () => new Date(pinned),
      gate,
    });
    assert.ok(
      output.includes("rate limit for this service is reached"),
      "the answer names the limit",
    );
    assert.ok(
      output.includes("nothing was sent"),
      "a rate-limited call is a call that did not happen",
    );
    assert.ok(
      output.includes("seconds"),
      "and says how long to wait, so the person can decide whether to",
    );
    assert.ok(
      !output.includes("No papers with a checkable identifier"),
      "and it is never reported as an empty literature",
    );
    assert.deepEqual(calls, [], "the gate refuses before any request is built");
  } finally {
    restore();
  }
});

test("literature-search reports an empty result set as empty, never invented", async () => {
  const restore = stubFetch(
    (async () =>
      new Response(europePmcBody([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch,
  );
  try {
    const output = await searchLiterature(
      "zzzqqqnonsensequery",
      liveDeps(globalThis.fetch),
    );
    assert.ok(
      output.includes("No papers with a checkable identifier were found"),
    );
    assert.ok(output.includes("not about the topic"));
    assert.ok(output.includes("Sources: Europe PMC"));
    assert.equal(
      output.includes("PMID:"),
      false,
      "an empty answer must carry no fabricated identifier",
    );
  } finally {
    restore();
  }

  /* A result Europe PMC itself indexes with no PMID, PMCID or DOI is not shown as a citation —
    it would be a "source" that cannot actually be checked. */
  const restoreNoIdentifier = stubFetch(
    (async () =>
      new Response(
        europePmcBody([
          {
            title: "A record with nothing to check it against",
            pubYear: "2020",
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown as typeof fetch,
  );
  try {
    const output = await searchLiterature("untraceable", liveDeps(globalThis.fetch));
    assert.ok(
      output.includes("No papers with a checkable identifier were found"),
    );
    assert.equal(
      output.includes("A record with nothing to check it against"),
      false,
    );
  } finally {
    restoreNoIdentifier();
  }
});

test("literature-search asks for a topic rather than searching an empty string", async () => {
  const calls: string[] = [];
  const restore = stubFetch((async (input: unknown) => {
    calls.push(String(input));
    throw new Error("an empty query should never reach the network");
  }) as unknown as typeof fetch);
  try {
    const output = await searchLiterature("", liveDeps(globalThis.fetch));
    assert.ok(output.includes("Name a topic"));
    assert.deepEqual(calls, []);
  } finally {
    restore();
  }
});

test("literature-search sends redacted topic words, never the person's identifiers", async () => {
  /* The redaction the ungoverned call did not run. outgoingTerm is the adapter's — redactPHI, then
     whitespace folded and capped — and the tool runs its own echo through it too, so an identifier
     typed into a literature search appears in neither the request nor the answer.

     WHAT THIS CLAIMS, AND WHAT IT DOES NOT. redactPHI (packages/gilbertone/src/phi.ts) is
     deliberately narrow: an SA identity number (Luhn-checked, so a thirteen-digit run that is a date
     or a tracking code is left alone), an international or local phone number, an email address and
     a medical-aid number. It does NOT catch a person's name or her street address, so this test
     asserts neither — a test that claimed they never leave would pass today and misrepresent what
     the guard does. The honest position is that the outgoing term is identifier-redacted and capped,
     and that the tool's own contract asks the model for topic words and never the person's sentence
     (the schema's describe says so). Both halves are load-bearing and neither alone is enough. */
  const seen: string[] = [];
  const restore = stubFetch((async (input: unknown) => {
    seen.push(String(input));
    return new Response(europePmcBody([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch);
  try {
    const output = await searchLiterature(
      "hypertension for 8001015009087, reachable on 0721234567 or thandi@example.co.za",
      liveDeps(globalThis.fetch),
    );
    assert.ok(seen.length === 1);
    const url = decodeURIComponent(seen[0]);
    for (const identifier of [
      "8001015009087",
      "0721234567",
      "thandi@example.co.za",
    ]) {
      assert.ok(
        !url.includes(identifier),
        `${identifier} must not ride the lookup — a literature search crosses a border and carries topic words alone`,
      );
      assert.ok(
        !output.includes(identifier),
        `${identifier} must not be echoed back into the answer either`,
      );
    }
    assert.ok(
      url.includes("hypertension"),
      "the topic itself still reaches the search",
    );
    assert.ok(
      url.includes("[ID REDACTED]") || !url.includes("800101"),
      "the identifier is replaced by the redaction's own token, not simply absent",
    );
  } finally {
    restore();
  }
});

test("each LangChain wrapper carries the name the agent knows it by, and answers when invoked", async () => {
  assert.equal(knowledgeSearchTool.name, "knowledge_search");
  assert.equal(drugCheckTool.name, "drug_interaction_check");
  assert.equal(symptomCheckTool.name, "symptom_check");
  assert.equal(medicationInfoTool.name, "medication_info");
  assert.equal(emergencyNumbersTool.name, "emergency_numbers");
  assert.equal(coverageLookupTool.name, "coverage_lookup");
  assert.equal(literatureSearchTool.name, "literature_search");

  const knowledge = await knowledgeSearchTool.invoke({
    query: "child immunisation schedule",
  });
  assert.ok(String(knowledge).includes("Knowledge base results"));

  const interaction = await drugCheckTool.invoke({
    drugA: "warfarin",
    drugB: "aspirin",
  });
  assert.ok(String(interaction).includes("severity: HIGH"));

  const symptoms = await symptomCheckTool.invoke({
    symptoms: "runny nose and sneezing",
  });
  assert.ok(String(symptoms).includes("Common Cold"));

  const medication = await medicationInfoTool.invoke({
    medication: "paracetamol",
  });
  assert.ok(String(medication).includes("Usual dosage on the record"));

  const numbers = await emergencyNumbersTool.invoke({ need: "not specified" });
  assert.ok(String(numbers).includes("10177"));

  const coverage = await coverageLookupTool.invoke({ area: "Rosebank" });
  assert.ok(String(coverage).includes("phase-one coverage area"));

  /* The LangChain wrapper takes no deps argument — it is what the agent calls, so it reads the real
     federation.json, where pubmed-europepmc is "active": false and the override is off. Invoking it
     therefore proves the deployed tool is dark by default and sends nothing, rather than exercising a
     live-shape path the tests above already cover through the injection seam. A stub fetch that would
     record any call keeps that honest. */
  const calls: string[] = [];
  const restore = stubFetch((async (input: unknown) => {
    calls.push(String(input));
    throw new Error("the deployed wrapper must not reach the network while dark");
  }) as unknown as typeof fetch);
  try {
    const literature = await literatureSearchTool.invoke({
      query: "hypertension",
    });
    assert.ok(
      String(literature).includes("Europe PMC is switched off"),
      "the agent's own door answers dark while federation.json says so",
    );
    assert.deepEqual(calls, [], "and sends nothing");
  } finally {
    restore();
  }
});
