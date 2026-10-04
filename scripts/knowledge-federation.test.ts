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
  validateSourceGovernance,
  verhoeffValid,
} from "./knowledge-codes.mjs";

/* The knowledge catalogue's own tests, added on 22 September 2026 with the governed federation
   work. This is the integration half of the no-fabrication rule: the validators in
   knowledge-codes.mjs are exercised against the real migrated JSON in packages/catalog/knowledge —
   all nine files, all 261 entries — and against federation.json's contracted darkness. What a code
   MEANS was verified by hand against the issuing authorities' own browsers before it was written
   down; what this file proves is that nothing mistyped or half-recorded has slipped in since, and
   that nothing can be added without passing the same gates. */

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const federation = readJson("../packages/catalog/knowledge/federation.json");
const SOURCE_IDS = [
  "icd11-who",
  "openfda",
  "pubmed-europepmc",
  "medlineplus-nlm",
  "cdc-content-services",
  "ndoh-stg-eml-phc",
  "sahpra-medicines",
  "snomed-ct-za",
  "loinc-regenstrief",
  "wikidata",
  "westerncape-health",
  "ifrc-first-aid-guidelines",
  "sa-red-cross-first-aid",
  "st-john-sa-first-aid",
];
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
    261,
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
    SOURCE_IDS,
    "the allowlist: the three with adapters first, in the order they are registered, then the sources assessed on 1 October 2026",
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

/* Source governance, added on 1 October 2026 when the allowlist grew past its first three. The real
   file must pass whole; then each rule is broken on a copy, one at a time, and must be named — the
   same proof the boundary check's own mutations give, kept here so it runs on every npm test. */
const copy = () => JSON.parse(JSON.stringify(federation));
const sourceWithVerdict = (draft: typeof federation, verdict: string) =>
  draft.sources.find((source: { licensing: { verdict: string } }) => source.licensing.verdict === verdict);

test("every source carries a licence verdict, a residency note and two unsigned signatures, and the file passes whole", () => {
  assert.deepEqual(validateSourceGovernance(federation), []);
  const verdicts = federation.licenceVerdicts;
  for (const source of federation.sources) {
    assert.equal(source.active, false, `${source.id} ships dark`);
    assert.ok(verdicts[source.licensing.verdict], `${source.id} has a verdict from the vocabulary`);
    assert.equal(typeof source.licensing.commercialUse, "boolean", `${source.id} says whether commercial use is allowed`);
    assert.ok(source.licensing.verifiedFrom.startsWith("https://"), `${source.id} says where its licence was read`);
    assert.ok(source.dataResidency.notes.includes("POPIA"), `${source.id} records its POPIA position`);
    assert.deepEqual(source.signOff, { "clinical-reviewer": null, "information-officer": null }, `${source.id} waits on both signatures`);
  }
  for (const role of federation.governance.signatures)
    assert.equal(role.appointed, false, `${role.id}: nobody is appointed yet, so nothing can be signed`);
  for (const entry of federation.assessedNotAdmitted)
    assert.equal(verdicts[entry.verdict].mayActivate, false, `${entry.id} was turned away under a verdict that never activates`);
});

test("a non-commercial source switched on is named for its licence, not merely its flag", () => {
  const draft = copy();
  const turned = draft.assessedNotAdmitted.find((entry: { verdict: string }) => entry.verdict === "non-commercial-only");
  assert.ok(turned, "the register holds at least one non-commercial source");
  draft.sources.push({
    ...JSON.parse(JSON.stringify(draft.sources[0])),
    id: "non-commercial-probe",
    hosts: ["probe.invalid"],
    active: true,
    licensing: { ...draft.sources[0].licensing, verdict: "non-commercial-only", commercialUse: false },
  });
  const findings = validateSourceGovernance(draft);
  assert.ok(findings.some((finding: string) => finding.includes("never permits")), findings.join("\n"));
  assert.ok(findings.some((finding: string) => finding.includes("without both signatures")), findings.join("\n"));
});

test("a permission-required source cannot open without its permission record, even with both signatures", () => {
  const draft = copy();
  const source = sourceWithVerdict(draft, "permission-required");
  assert.ok(source, "at least one source waits on written permission");
  for (const role of draft.governance.signatures) role.appointed = true;
  source.signOff = {
    "clinical-reviewer": { signedBy: "Probe", signedOn: "2026-10-01", reference: "probe" },
    "information-officer": { signedBy: "Probe", signedOn: "2026-10-01", reference: "probe" },
  };
  source.active = true;
  const findings = validateSourceGovernance(draft);
  assert.ok(findings.some((finding: string) => finding.includes("written permission")), findings.join("\n"));
  source.licensing.permissionRef = "docs/governance/probe.md";
  assert.deepEqual(validateSourceGovernance(draft), [], "with both signatures and the permission recorded, the contract allows the flag");
});

test("a signature recorded before anyone is appointed is named", () => {
  const draft = copy();
  draft.sources[0].signOff["information-officer"] = { signedBy: "Probe", signedOn: "2026-10-01", reference: "probe" };
  assert.ok(validateSourceGovernance(draft).some((finding: string) => finding.includes("nobody has been appointed")));
});

test("a source with no verdict, no residency note or no hosts is named", () => {
  const draft = copy();
  delete draft.sources[1].licensing.verdict;
  draft.sources[2].dataResidency.notes = "Hosted abroad.";
  draft.sources[3].hosts = [];
  const findings = validateSourceGovernance(draft);
  assert.ok(findings.some((finding: string) => finding.includes(`"${draft.sources[1].id}": licensing.verdict`)));
  assert.ok(findings.some((finding: string) => finding.includes(`"${draft.sources[2].id}": dataResidency`)));
  assert.ok(findings.some((finding: string) => finding.includes(`"${draft.sources[3].id}": hosts`)));
});

test("a host cannot be both admitted and turned away, and a turned-away source keeps a verdict that never opens", () => {
  const draft = copy();
  draft.assessedNotAdmitted[0].hosts = [draft.sources[0].hosts[0]];
  draft.assessedNotAdmitted[1].verdict = "reuse-permitted";
  const findings = validateSourceGovernance(draft);
  assert.ok(findings.some((finding: string) => finding.includes("admitted or turned away")));
  assert.ok(findings.some((finding: string) => finding.includes("never activates")));
});

/* The founder's demonstration override of 2 October 2026 (packages/catalog/demonstration-override.json).
   It opens sources beside their flags, never by moving one; the rules live in demonstration-override.mjs,
   shared with the boundary check. The real file must pass whole; going live — inForce false — must close
   every gate at once; and each thing it may never do is tried on a copy and must be named. */
const override = readJson("../packages/catalog/demonstration-override.json");
const overrideCopy = () => JSON.parse(JSON.stringify(override));
const {
  gateOpen,
  sourceOn,
  validateDemonstrationOverride,
} = await import("./demonstration-override.mjs");
const PERMITTED = ["icd11-who", "openfda", "pubmed-europepmc", "medlineplus-nlm", "snomed-ct-za", "loinc-regenstrief", "wikidata", "cdc-content-services"];

test("the demonstration override validates whole, and opens exactly the sources whose licences permit", () => {
  assert.deepEqual(validateDemonstrationOverride(override, federation), []);
  assert.equal(override.inForce, false, "the founder's override is switched off");
  for (const source of federation.sources) assert.equal(sourceOn(override, federation, source), false, `${source.id} is dark while inForce is false`);
  const shown = overrideCopy();
  shown.inForce = true;
  const on = federation.sources.filter((source: { id: string }) => sourceOn(shown, federation, source)).map((source: { id: string }) => source.id);
  assert.deepEqual(on.sort(), [...PERMITTED].sort());
  for (const source of federation.sources) {
    assert.equal(source.active, false, `${source.id}: the override opens a gate beside the flag and never moves it`);
    assert.deepEqual(source.signOff, { "clinical-reviewer": null, "information-officer": null }, `${source.id}: the override is not a signature`);
  }
});

test("going live is inForce false, and nothing stays open", () => {
  const live = { ...overrideCopy(), inForce: false };
  for (const gate of override.gates) assert.equal(gateOpen(live, gate.id), false, gate.id);
  for (const source of federation.sources) assert.equal(sourceOn(live, federation, source), false, source.id);
  assert.equal(gateOpen(override, "photo-reading"), false, "the file's inForce false closes photo reading");
  assert.equal(gateOpen({ ...overrideCopy(), inForce: true }, "photo-reading"), true, "photo reading opens only while the override is in force");
});

test("the override cannot open what it does not list, what the licence forbids, or what it records as left closed", () => {
  assert.equal(gateOpen(override, "health-passport"), false);
  assert.equal(gateOpen(override, "knowledge-source:ndoh-stg-eml-phc"), false);
  const permission = overrideCopy();
  permission.gates.push({ id: "knowledge-source:ndoh-stg-eml-phc", kind: "knowledge-source", sourceId: "ndoh-stg-eml-phc", state: "on" });
  assert.ok(validateDemonstrationOverride(permission, federation).some((f: string) => f.includes("never cures a licence")));
  assert.equal(sourceOn(permission, federation, federation.sources.find((s: { id: string }) => s.id === "ndoh-stg-eml-phc")), false, "listed or not, the licence keeps it off");
  const passport = overrideCopy();
  passport.gates.push({ id: "health-passport", kind: "capability", state: "on", opensWaitsOn: ["dpia"], builderMust: ["x"] });
  assert.ok(validateDemonstrationOverride(passport, federation).some((f: string) => f.includes("also recorded as not opened")));
  const forgotten = overrideCopy();
  forgotten.notOpened = forgotten.notOpened.filter((entry: { id: string }) => entry.id !== "triage");
  assert.ok(validateDemonstrationOverride(forgotten, federation).some((f: string) => f.includes('"triage"')));
  const turned = overrideCopy();
  turned.gates.push({ id: "knowledge-source:nhs-website-content", kind: "knowledge-source", sourceId: "nhs-website-content", state: "on" });
  assert.ok(validateDemonstrationOverride(turned, federation).some((f: string) => f.includes("does not list")));
  const flagged = JSON.parse(JSON.stringify(federation));
  flagged.sources.find((s: { id: string }) => s.id === "openfda").active = true;
  assert.ok(validateDemonstrationOverride(override, flagged).some((f: string) => f.includes("never moves it")));
  const silent = overrideCopy();
  silent.disclaimer.sentence = "On for now.";
  assert.ok(validateDemonstrationOverride(silent, federation).some((f: string) => f.includes("disclaimer")));
});
