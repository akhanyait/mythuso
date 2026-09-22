/* Terminology-code and provenance validation for the knowledge catalogue, added on
   22 September 2026 with the governed federation work.

   WHAT THIS MODULE IS. One place that answers "is this code a real code shaped like what it
   claims to be" and "is this entry's provenance complete", asked by scripts/check-boundaries.mjs
   on every build and by the catalogue's own tests. It is the structural half of the no-fabrication
   rule: every SNOMED CT identifier must pass the Verhoeff check digit its issuing authority
   defines, every LOINC code must pass the LOINC check digit, every ICD-11 code must match the
   MMS format, and every entry must carry a source object with a truthful, well-formed shape. It
   cannot prove a code means what the entry says it means — that was done once, by hand, against
   the issuing authorities' own browsers (OLS4 for SNOMED CT, WHO and findacode pages for ICD-11,
   loinc.org for LOINC) — but it makes a fabricated or mistyped code fail the build rather than
   reach a person.

   Deliberately plain JavaScript, runnable by node scripts/check-boundaries.mjs without a build
   step, the same as every other script in this directory. */

/* The nine catalogue files. Only the first eight carry terminology codes; the interactions file
   predates the mapping and carries provenance only — a codes key there is a violation, not an
   omission, so that it cannot be added silently later. */
export const KNOWLEDGE_FILES = [
  "conditions",
  "medications",
  "first-aid",
  "maternal",
  "chronic",
  "mental-health",
  "sa-health-system",
  "prevention",
  "interactions",
];
export const CODE_FILES = KNOWLEDGE_FILES.filter(
  (file) => file !== "interactions",
);
export const ABSTENTION_KINDS = [
  "no-evidence",
  "expired-evidence",
  "conflicting-evidence",
  "outside-approved-scope",
];
const CODE_KEYS = ["snomed", "icd11", "loinc"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ICD11 = /^([0-9][A-Z]|[A-Z][A-Z])[0-9][0-9YZ](\.[0-9A-Z]{1,4})?$/;

/* ---- Verhoeff ----

   SNOMED CT identifiers carry a Verhoeff check digit over the whole identifier, so a single
   mistyped digit is caught arithmetically. The three tables are the algorithm's published ones. */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/* A full SCTID validates to remainder zero when the check digit is included. */
export function verhoeffValid(value) {
  const text = String(value ?? "");
  if (!/^\d{6,18}$/.test(text)) return false;
  let c = 0;
  const digits = text.split("").map(Number).reverse();
  for (let i = 0; i < digits.length; i += 1)
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  return c === 0;
}

/* ---- LOINC ----

   From the numeric part, rightmost digit first: multiply alternately by 2 and 1, sum the digits
   of each product, and the check digit is (10 - sum mod 10) mod 10. */
export function loincValid(value) {
  const match = /^(\d{1,5})-(\d)$/.exec(String(value ?? ""));
  if (!match) return false;
  let sum = 0;
  match[1]
    .split("")
    .map(Number)
    .reverse()
    .forEach((digit, index) => {
      const product = digit * (index % 2 === 0 ? 2 : 1);
      sum += product > 9 ? product - 9 : product;
    });
  return (10 - (sum % 10)) % 10 === Number(match[2]);
}

/* ---- ICD-11 MMS ----

   A stem of two characters (a digit and a letter, or two letters) followed by two more: a digit,
   then a digit or the Y/Z ending ICD-11 uses for "other specified" and "unspecified" categories
   (BD1Z, 1F4Z). An optional postcoordination suffix may follow — e.g. CA00, 5A11, BD1Z, RA01.0. */
export function icd11Valid(value) {
  return ICD11.test(String(value ?? ""));
}

export function isIsoDate(value) {
  return typeof value === "string" && ISO_DATE.test(value);
}

/* ---- The entry-level checks ----

   Each returns a findings array: one plain sentence per violation, addressed to whoever edited
   the catalogue, so a broken build names what broke rather than pointing at a line number. */
export function validateEntrySource(source, evidenceGrades) {
  const findings = [];
  const where = `source of entry`;
  if (
    source === undefined ||
    source === null ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    findings.push(
      `${where}: expected a source object (authority, jurisdiction, retrievedDate, evidenceGrade), found ${JSON.stringify(source)}`,
    );
    return findings;
  }
  if (typeof source.authority !== "string" || !source.authority.trim())
    findings.push(`${where}: authority must be a non-empty string`);
  if (typeof source.jurisdiction !== "string" || !source.jurisdiction.trim())
    findings.push(`${where}: jurisdiction must be a non-empty string`);
  if (!isIsoDate(source.retrievedDate))
    findings.push(`${where}: retrievedDate must be a YYYY-MM-DD date`);
  if (source.publishedDate !== undefined && !isIsoDate(source.publishedDate))
    findings.push(
      `${where}: publishedDate, when present, must be a YYYY-MM-DD date`,
    );
  if (
    source.expiresOrReviewBy !== undefined &&
    !isIsoDate(source.expiresOrReviewBy)
  )
    findings.push(
      `${where}: expiresOrReviewBy, when present, must be a YYYY-MM-DD date`,
    );
  if (
    source.evidenceGrade !== undefined &&
    !(evidenceGrades && source.evidenceGrade in evidenceGrades)
  )
    findings.push(
      `${where}: evidenceGrade "${source.evidenceGrade}" is not in federation.json's vocabulary (${Object.keys(evidenceGrades ?? {}).join(", ")})`,
    );
  for (const key of Object.keys(source))
    if (
      ![
        "authority",
        "jurisdiction",
        "publishedDate",
        "retrievedDate",
        "evidenceGrade",
        "expiresOrReviewBy",
      ].includes(key)
    )
      findings.push(
        `${where}: unknown key "${key}" — the source shape is fixed so every renderer can trust it`,
      );
  return findings;
}

export function validateEntryCodes(codes) {
  const findings = [];
  if (
    codes === undefined ||
    codes === null ||
    typeof codes !== "object" ||
    Array.isArray(codes)
  ) {
    findings.push(
      `codes: expected an object (may be empty), found ${JSON.stringify(codes)}`,
    );
    return findings;
  }
  for (const key of Object.keys(codes)) {
    if (!CODE_KEYS.includes(key)) {
      findings.push(
        `codes: unknown key "${key}" — only snomed, icd11 and loinc are mapped`,
      );
      continue;
    }
    const value = codes[key];
    if (typeof value !== "string" || !value.trim()) {
      findings.push(`codes.${key}: expected a non-empty string`);
      continue;
    }
    if (key === "snomed" && !verhoeffValid(value))
      findings.push(
        `codes.snomed: "${value}" fails the Verhoeff check digit — a mistyped or fabricated SCTID`,
      );
    if (key === "loinc" && !loincValid(value))
      findings.push(
        `codes.loinc: "${value}" fails the LOINC check digit — a mistyped or fabricated LOINC code`,
      );
    if (key === "icd11" && !icd11Valid(value))
      findings.push(
        `codes.icd11: "${value}" is not a well-formed ICD-11 MMS code`,
      );
  }
  return findings;
}

/* The whole catalogue, as the boundary check and the root test both ask it: every entry has a
   complete source object; the eight clinical files carry a codes object (possibly empty, meaning
   honestly unmapped) and the interactions file carries none; every code passes its checksum. */
export function validateCatalog(catalog, federation) {
  const findings = [];
  const evidenceGrades = federation && federation.evidenceGrades;
  for (const file of KNOWLEDGE_FILES) {
    const entries = catalog[file];
    if (!Array.isArray(entries)) {
      findings.push(
        `packages/catalog/knowledge/${file}.json: expected an array of entries`,
      );
      continue;
    }
    if (!entries.length)
      findings.push(
        `packages/catalog/knowledge/${file}.json: no entries at all`,
      );
    for (const entry of entries) {
      const id = entry && typeof entry.id === "string" ? entry.id : "<no id>";
      const at = `packages/catalog/knowledge/${file}.json ${id}`;
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string") {
        findings.push(`${at}: every entry carries a string id`);
        continue;
      }
      for (const finding of validateEntrySource(entry.source, evidenceGrades))
        findings.push(`${at} ${finding}`);
      if (file === "interactions") {
        if ("codes" in entry)
          findings.push(
            `${at}: interactions carry no terminology codes — a codes key here was not reviewed`,
          );
      } else {
        if (!("codes" in entry))
          findings.push(
            `${at}: missing the codes object (use {} when no code is verified)`,
          );
        else
          for (const finding of validateEntryCodes(entry.codes))
            findings.push(`${at} ${finding}`);
      }
    }
  }
  return findings;
}
