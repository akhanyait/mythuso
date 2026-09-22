import test from "node:test";
import assert from "node:assert/strict";
import {
  attributionOf,
  citationLine,
  citationOf,
  codesOf,
  isExpired,
  provenanceOf,
} from "./knowledge-provenance.ts";
import { searchKnowledge } from "./knowledge.ts";

/* knowledge-provenance.ts's own tests, added on 22 September 2026 with the governed federation
   work. Two layers here: the readers' contracts on hand-built inputs (tolerance included — these
   functions run on fixture payloads and Qdrant payloads, not only on validated catalogue JSON), and
   one integration test against the real migrated catalogue, pinning that search results come back
   born with their codes and their structured citation. */

test("provenanceOf accepts the full recorded shape and rejects everything short of it", () => {
  const full = provenanceOf({
    authority: "SA NDoH",
    jurisdiction: "South Africa",
    publishedDate: "2024-06-01",
    retrievedDate: "2026-09-21",
    evidenceGrade: "guideline",
    expiresOrReviewBy: "2027-09-21",
  });
  assert.deepEqual(full, {
    authority: "SA NDoH",
    jurisdiction: "South Africa",
    publishedDate: "2024-06-01",
    retrievedDate: "2026-09-21",
    evidenceGrade: "guideline",
    expiresOrReviewBy: "2027-09-21",
  });

  const minimal = provenanceOf({
    authority: "WHO",
    jurisdiction: "International",
    retrievedDate: "2026-09-21",
  });
  assert.deepEqual(minimal, {
    authority: "WHO",
    jurisdiction: "International",
    retrievedDate: "2026-09-21",
  });

  for (const rejected of [
    null,
    undefined,
    "SA NDoH",
    ["SA NDoH"],
    { authority: "SA NDoH" },
    { authority: "SA NDoH", jurisdiction: "South Africa" },
    {
      authority: "  ",
      jurisdiction: "South Africa",
      retrievedDate: "2026-09-21",
    },
  ])
    assert.equal(provenanceOf(rejected), null);

  const trimmed = provenanceOf({
    authority: "  WHO  ",
    jurisdiction: " International ",
    retrievedDate: "2026-09-21",
    evidenceGrade: "  ",
  });
  assert.deepEqual(
    trimmed,
    {
      authority: "WHO",
      jurisdiction: "International",
      retrievedDate: "2026-09-21",
    },
    "trimmed, and an empty grade is absent, not empty",
  );
});

test("attributionOf reads both shapes and falls back honestly", () => {
  assert.equal(attributionOf("SA NDoH", "fallback"), "SA NDoH");
  assert.equal(attributionOf("  SA NDoH  ", "fallback"), "SA NDoH");
  assert.equal(
    attributionOf(
      {
        authority: "NICD",
        jurisdiction: "South Africa",
        retrievedDate: "2026-09-21",
      },
      "fallback",
    ),
    "NICD",
  );
  assert.equal(
    attributionOf(undefined, "MyThuso knowledge base"),
    "MyThuso knowledge base",
  );
  assert.equal(
    attributionOf("", "MyThuso knowledge base"),
    "MyThuso knowledge base",
  );
  assert.equal(
    attributionOf({ jurisdiction: "South Africa" }, "MyThuso knowledge base"),
    "MyThuso knowledge base",
  );
  assert.equal(
    attributionOf(42, "MyThuso knowledge base"),
    "MyThuso knowledge base",
  );
});

test("codesOf keeps the three vocabularies and drops malformed values", () => {
  assert.deepEqual(
    codesOf({ snomed: "82272006", icd11: "CA00", loinc: "6301-6" }),
    {
      snomed: "82272006",
      icd11: "CA00",
      loinc: "6301-6",
    },
  );
  assert.deepEqual(codesOf({ snomed: " 82272006 " }), { snomed: "82272006" });
  assert.deepEqual(codesOf({ snomed: "", icd11: "   ", loinc: null }), {});
  assert.deepEqual(
    codesOf({ snomed: 42, icd11: ["CA00"] }),
    {},
    "a number or an array is not a code",
  );
  assert.deepEqual(codesOf(undefined), {});
  assert.deepEqual(codesOf("CA00"), {});
});

test("citationOf builds from a source object, a bare string, or almost nothing", () => {
  const fromObject = citationOf({
    authority: "SA NDoH",
    jurisdiction: "South Africa",
    retrievedDate: "2026-09-21",
    evidenceGrade: "guideline",
  });
  assert.deepEqual(fromObject, {
    authority: "SA NDoH",
    jurisdiction: "South Africa",
    retrievedDate: "2026-09-21",
    evidenceGrade: "guideline",
  });

  const fromString = citationOf("South Africa NDoH");
  assert.deepEqual(fromString, { authority: "South Africa NDoH" });

  assert.equal(citationOf(null).authority, "MyThuso knowledge base");
  assert.equal(citationOf(undefined).authority, "MyThuso knowledge base");

  const withExtras = citationOf(
    { authority: "WHO", jurisdiction: "International" },
    {
      licence: "CC BY-ND 3.0 IGO",
      url: "https://id.who.int/icd/entity/1",
      sourceId: "icd11-who",
    },
  );
  assert.deepEqual(withExtras, {
    authority: "WHO",
    jurisdiction: "International",
    licence: "CC BY-ND 3.0 IGO",
    url: "https://id.who.int/icd/entity/1",
    sourceId: "icd11-who",
  });

  assert.deepEqual(
    citationOf({}, { licence: "", url: "   " }),
    { authority: "MyThuso knowledge base" },
    "empty extras are absent extras",
  );
});

test("citationLine joins the facts with em dashes and invents none", () => {
  assert.equal(
    citationLine({
      authority: "SA NDoH",
      jurisdiction: "South Africa",
      evidenceGrade: "guideline",
      publishedDate: "2024-06-01",
      retrievedDate: "2026-09-21",
      expiresOrReviewBy: "2027-09-21",
      licence: "CC BY-ND 3.0 IGO",
    }),
    "SA NDoH — South Africa — evidence: guideline — published 2024-06-01 — retrieved 2026-09-21 — review by 2027-09-21 — CC BY-ND 3.0 IGO",
  );
  assert.equal(
    citationLine({ authority: "WHO" }),
    "WHO",
    "a citation that knows one fact states one fact",
  );
  const line = citationLine({ authority: "WHO", retrievedDate: "2026-09-22" });
  assert.equal(line.includes("undefined"), false);
  assert.equal(line.includes("null"), false);
});

test("isExpired turns on the first day after the review date, and only then", () => {
  const now = new Date("2026-09-22T09:00:00Z");
  assert.equal(isExpired({ expiresOrReviewBy: "2026-09-21" }, now), true);
  assert.equal(
    isExpired({ expiresOrReviewBy: "2026-09-22" }, now),
    false,
    "the review date itself is still current",
  );
  assert.equal(isExpired({ expiresOrReviewBy: "2026-09-23" }, now), false);
  assert.equal(isExpired({ expiresOrReviewBy: "soon" }, now), false);
  assert.equal(
    isExpired({}, now),
    false,
    "no review date is not a claim of currency, but not a claim of expiry either",
  );
  assert.equal(isExpired(null, now), false);
});

test("search results are born with their codes and their structured citation", () => {
  const results = searchKnowledge("common cold", 4);
  assert.ok(results.length > 0);
  const cold = results.find((result) => result.id === "cond-001");
  assert.ok(cold, "the common cold entry must answer its own name");
  if (!cold) return;
  assert.deepEqual(cold.codes, { snomed: "82272006", icd11: "CA00" });
  assert.equal(
    cold.source,
    "WHO / SA NDoH Standard Treatment Guidelines (PHC)",
    "the authority string the locked route reads",
  );
  assert.equal(
    cold.citation.authority,
    "WHO / SA NDoH Standard Treatment Guidelines (PHC)",
  );
  assert.equal(cold.citation.jurisdiction, "South Africa");
  assert.equal(cold.citation.evidenceGrade, "guideline");
  assert.equal(cold.citation.retrievedDate, "2026-09-21");
  assert.equal(cold.citation.expiresOrReviewBy, "2027-09-21");
  assert.ok(citationLine(cold.citation).includes("evidence: guideline"));
  assert.ok(citationLine(cold.citation).includes("review by 2027-09-21"));
});

test("every search result carries a citation a surface can render, and codes that are an object", () => {
  const results = searchKnowledge("high blood pressure", 4);
  assert.ok(results.length > 0);
  for (const result of results) {
    assert.ok(
      result.citation &&
        typeof result.citation.authority === "string" &&
        result.citation.authority.length > 0,
      result.id,
    );
    assert.equal(typeof result.codes, "object");
    assert.ok(!Array.isArray(result.codes));
    assert.ok(
      citationLine(result.citation).startsWith(result.source),
      `${result.id}: the rendered line opens with the route's authority string`,
    );
  }
});
