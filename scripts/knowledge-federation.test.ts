import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ABSTENTION_KINDS,
  KNOWLEDGE_FILES,
  icd11Valid,
  loincValid,
  validateCatalog,
  validateEntryCodes,
  validateEntrySource,
  verhoeffValid,
} from "./knowledge-codes.mjs";

/* The knowledge catalogue's own tests, added on 22 September 2026 with the governed federation
   work. This is the integration half of the no-fabrication rule: the validators in
   knowledge-codes.mjs are exercised against the real migrated JSON in packages/catalog/knowledge —
   all nine files, all 250 entries — and against federation.json's contracted darkness. What a code
   MEANS was verified by hand against the issuing authorities' own browsers before it was written
   down; what this file proves is that nothing mistyped or half-recorded has slipped in since, and
   that nothing can be added without passing the same gates. */

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const federation = readJson("../packages/catalog/knowledge/federation.json");
const catalog: Record<string, unknown[]> = Object.fromEntries(
  KNOWLEDGE_FILES.map((file) => [
    file,
    readJson(`../packages/catalog/knowledge/${file}.json`),
  ]),
);

test("the migrated catalogue validates whole: every source complete, every code checksum-true", () => {
  assert.deepEqual(
    validateCatalog(catalog, federation),
    [],
    "one finding here means packages/catalog/knowledge has a broken entry: the sentence names which",
  );
  const total = KNOWLEDGE_FILES.reduce(
    (count, file) => count + catalog[file].length,
    0,
  );
  assert.equal(
    total,
    250,
    "every entry of the nine files is covered by this test",
  );
  const coded = KNOWLEDGE_FILES.filter((file) => file !== "interactions")
    .flatMap((file) => catalog[file])
    .filter((entry) => {
      const codes = (entry as { codes?: Record<string, string> }).codes ?? {};
      return Object.values(codes).some(
        (code) => typeof code === "string" && code.length > 0,
      );
    });
  assert.equal(
    coded.length,
    71,
    "71 entries carry at least one verified terminology code",
  );
});

test("the interactions file stays code-free: a codes key there would claim a review that did not happen", () => {
  for (const entry of catalog.interactions)
    assert.equal(
      "codes" in (entry as object),
      false,
      (entry as { id: string }).id,
    );
});

test("the checksum validators accept the real codes and reject a single mistyped digit", () => {
  assert.equal(verhoeffValid("82272006"), true, "common cold's SCTID");
  assert.equal(
    verhoeffValid("82272007"),
    false,
    "one digit moved, and the SCTID is caught",
  );
  assert.equal(verhoeffValid("12345"), false);
  assert.equal(loincValid("6301-6"), true, "INR's LOINC code");
  assert.equal(
    loincValid("6301-7"),
    false,
    "the check digit is arithmetic, not decoration",
  );
  assert.equal(icd11Valid("CA00"), true);
  assert.equal(
    icd11Valid("BD1Z"),
    true,
    "the Y/Z endings ICD-11 uses for 'other' and 'unspecified'",
  );
  assert.equal(icd11Valid("ca00"), false);
  assert.equal(icd11Valid("CA0"), false);
});

test("an entry whose codes fail a validator is named by a finding, not waved through", () => {
  assert.deepEqual(
    validateEntryCodes({}),
    [],
    "an empty object is honest silence, not a violation",
  );
  assert.deepEqual(
    validateEntryCodes({ snomed: "82272006", icd11: "CA00" }),
    [],
  );
  assert.equal(
    validateEntryCodes(undefined).length,
    1,
    "the codes object itself is required outside interactions",
  );
  assert.ok(
    validateEntryCodes({ snomed: "11111111" }).some((finding: string) =>
      finding.includes("Verhoeff"),
    ),
  );
  assert.ok(
    validateEntryCodes({ loinc: "6301-7" }).some((finding: string) =>
      finding.includes("LOINC"),
    ),
  );
  assert.ok(
    validateEntryCodes({ icd11: "not-a-code" }).some((finding: string) =>
      finding.includes("ICD-11"),
    ),
  );
  assert.ok(
    validateEntryCodes({ rxnorm: "12345" }).some((finding: string) =>
      finding.includes("unknown key"),
    ),
  );
});

test("an incomplete or invented entry source is named by a finding, not waved through", () => {
  const grades = federation.evidenceGrades;
  assert.deepEqual(
    validateEntrySource(
      {
        authority: "SA NDoH",
        jurisdiction: "South Africa",
        retrievedDate: "2026-09-21",
        evidenceGrade: "guideline",
      },
      grades,
    ),
    [],
  );
  assert.equal(
    validateEntrySource("SA NDoH", grades).length,
    1,
    "a bare string is the shape that predates the migration",
  );
  assert.ok(
    validateEntrySource(
      { authority: "SA NDoH", jurisdiction: "", retrievedDate: "2026-09-21" },
      grades,
    ).some((finding: string) => finding.includes("jurisdiction")),
  );
  assert.ok(
    validateEntrySource(
      {
        authority: "SA NDoH",
        jurisdiction: "South Africa",
        retrievedDate: "September",
      },
      grades,
    ).some((finding: string) => finding.includes("retrievedDate")),
  );
  assert.ok(
    validateEntrySource(
      {
        authority: "SA NDoH",
        jurisdiction: "South Africa",
        retrievedDate: "2026-09-21",
        evidenceGrade: "very strong",
      },
      grades,
    ).some((finding: string) => finding.includes("vocabulary")),
  );
  assert.ok(
    validateEntrySource(
      {
        authority: "SA NDoH",
        jurisdiction: "South Africa",
        retrievedDate: "2026-09-21",
        confidence: 0.9,
      },
      grades,
    ).some((finding: string) => finding.includes("unknown key")),
  );
});

test("federation.json ships dark and complete: every source off, every field a reviewer needs on", () => {
  assert.equal(federation.policy.darkByDefault, true);
  const sources = federation.sources;
  assert.deepEqual(
    sources.map((source: { id: string }) => source.id),
    ["icd11-who", "openfda", "pubmed-europepmc"],
    "the allowlist, in the order the adapters are registered",
  );
  for (const source of sources) {
    assert.equal(
      source.active,
      false,
      `${source.id} must ship "active": false`,
    );
    assert.ok(
      source.endpoint?.startsWith("https://"),
      `${source.id} records its endpoint`,
    );
    assert.ok(source.role, `${source.id} records what it is for`);
    assert.ok(source.licensing?.licence, `${source.id} records its licence`);
    assert.ok(
      source.rateLimit?.requestsPerMinute > 0,
      `${source.id} records its rate limit`,
    );
    assert.ok(
      source.rateLimit?.basis,
      `${source.id} records why that limit is the limit`,
    );
    assert.ok(
      source.dataResidency?.hostedIn,
      `${source.id} records where the data lives`,
    );
    assert.equal(
      source.dataResidency?.crossBorderTransferApproved,
      false,
      `${source.id} has not been cleared to cross the border`,
    );
    assert.ok(
      source.dataResidency?.notes?.includes("POPIA"),
      `${source.id} records the position it waits on`,
    );
    assert.ok(source.useFor, `${source.id} records what it may be used for`);
    assert.ok(source.notFor, `${source.id} records what it may not`);
    assert.ok(
      source.activation,
      `${source.id} records what activation requires`,
    );
  }
});

test("every abstention kind has its sentence, and the scope says what is out", () => {
  for (const kind of ABSTENTION_KINDS) {
    assert.ok(
      typeof federation.abstention[kind] === "string" &&
        federation.abstention[kind].length > 0,
      kind,
    );
  }
  assert.ok(federation.scope.approved.length > 0);
  assert.ok(
    federation.scope.excluded.some((item: string) =>
      item.includes("diagnosis"),
    ),
  );
  assert.ok(
    federation.scope.excluded.some((item: string) =>
      item.includes("prescribing"),
    ),
  );
  for (const grade of ["guideline", "regulatory-label", "not-assessed"])
    assert.ok(federation.evidenceGrades[grade], grade);
  assert.equal(
    federation.reviewHorizonMonths,
    12,
    "the horizon the catalogue's review dates were computed from",
  );
});
