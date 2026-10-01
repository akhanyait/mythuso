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

/* ==== Source governance: licence verdicts, residency notes and the two signatures ====
   Added on 1 October 2026, when the founder asked for more first-aid, skin and consumer-health
   sources and the allowlist grew from three to the sources assessed that day. Every source in
   federation.json is a proposal awaiting two signatures — the clinical reviewer's and the
   Information Officer's — and none is switched on. What this function holds is the order of
   things: the record before the flag, the licence before the record, and a person before a
   signature. It returns findings rather than throwing, so the boundary check and the catalogue's
   own tests ask the same question of the real file and of a deliberately broken copy.

     - Every source records a licence verdict from licenceVerdicts, whether commercial reuse and
       adaptation are allowed, the page that verdict was read from, the hosts it lives on, who it
       is for, its languages, and a residency note naming the POPIA position it waits on.
     - A source whose verdict does not permit a commercial service's use can never be switched on,
       and one whose verdict asks for written permission cannot be switched on without its record.
     - Neither signature exists until the person who gives it has been appointed, and no source
       is switched on without both — checked before the dark flag itself, so flipping a
       non-commercial source reports the licence, not merely the flag.
     - A source assessed and turned away stays in assessedNotAdmitted with its reason, and never
       shares a host with a listed source: a licence that forbids commercial use does not become
       acceptable by being proposed again. */
export const SIGNATURE_ROLES = ["clinical-reviewer", "information-officer"];
export const GOVERNANCE_REFUSALS = [
  "no-activation-without-two-signatures",
  "no-signature-without-an-appointee",
  "licence-does-not-permit-activation",
  "permission-required-before-activation",
  "a-link-is-not-knowledge",
  "proposal-kept-in-this-screen-only",
  "proposal-not-a-link",
  "proposal-not-https",
  "proposal-carries-personal-detail",
  "proposal-already-listed",
  "proposal-already-proposed",
  "proposal-assessed-and-not-admitted",
];

const httpsUrl = (value) =>
  typeof value === "string" && /^https:\/\/[^\s/]+/.test(value);
const nonEmptyStrings = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "string" && item.trim().length > 0);

export function validateSourceGovernance(federation) {
  const findings = [];
  const at = "packages/catalog/knowledge/federation.json";
  const verdicts = (federation && federation.licenceVerdicts) || {};
  for (const id of ["not-assessed", "non-commercial-only"])
    if (!verdicts[id] || verdicts[id].mayActivate !== false)
      findings.push(
        `${at}: licenceVerdicts.${id} must exist with mayActivate false — a licence nobody read, or one that excludes a commercial service, never opens a source`,
      );
  for (const [id, verdict] of Object.entries(verdicts))
    if (
      typeof verdict.mayActivate !== "boolean" ||
      !verdict.label ||
      !verdict.sentence
    )
      findings.push(
        `${at}: licenceVerdicts.${id} needs a label, a sentence and a boolean mayActivate`,
      );
  const governance = (federation && federation.governance) || {};
  const roles = Array.isArray(governance.signatures)
    ? governance.signatures
    : [];
  if (roles.map((role) => role.id).join() !== SIGNATURE_ROLES.join())
    findings.push(
      `${at}: governance.signatures must be exactly ${SIGNATURE_ROLES.join(" and ")}, in that order — the two people a source waits on`,
    );
  const appointed = new Map(
    roles.map((role) => [role.id, role.appointed === true]),
  );
  for (const role of roles)
    if (!role.label || !role.signs || typeof role.appointed !== "boolean")
      findings.push(
        `${at}: governance.signatures "${role.id}" needs a label, what it signs, and whether its person is appointed`,
      );
  const refusals = Array.isArray(governance.refusals)
    ? governance.refusals
    : [];
  for (const id of GOVERNANCE_REFUSALS) {
    const refusal = refusals.find((r) => r.id === id);
    if (!refusal || !refusal.statement || !refusal.why)
      findings.push(
        `${at}: governance.refusals "${id}" is missing its statement or its why — the screen says a refusal in the contract's words or not at all`,
      );
  }
  const sources = Array.isArray(federation && federation.sources)
    ? federation.sources
    : [];
  const hostOwner = new Map();
  for (const source of sources) {
    const where = `${at} source "${source.id ?? "<no id>"}"`;
    const licensing = source.licensing || {};
    const verdict = verdicts[licensing.verdict];
    if (!verdict)
      findings.push(
        `${where}: licensing.verdict "${licensing.verdict}" is not in licenceVerdicts — every source carries a verdict on its licence`,
      );
    if (typeof licensing.commercialUse !== "boolean")
      findings.push(
        `${where}: licensing.commercialUse must say true or false — MyThuso is a commercial service`,
      );
    if (typeof licensing.adaptation !== "boolean")
      findings.push(
        `${where}: licensing.adaptation must say true or false — an answer rewords what it draws on`,
      );
    if (!httpsUrl(licensing.verifiedFrom))
      findings.push(
        `${where}: licensing.verifiedFrom must be the https page the licence was read from`,
      );
    if (
      licensing.commercialUse === false &&
      verdict &&
      verdict.mayActivate &&
      !verdict.requiresPermissionRecord
    )
      findings.push(
        `${where}: a licence that does not allow commercial use carries the verdict "${licensing.verdict}", which may activate`,
      );
    const residency = source.dataResidency || {};
    if (
      !residency.hostedIn ||
      typeof residency.notes !== "string" ||
      !residency.notes.includes("POPIA")
    )
      findings.push(
        `${where}: dataResidency needs hostedIn and a note naming the POPIA position it waits on`,
      );
    if (!nonEmptyStrings(source.hosts))
      findings.push(
        `${where}: hosts must list the hosts the source lives on, so a pasted link can be recognised`,
      );
    for (const host of source.hosts || []) {
      if (hostOwner.has(host))
        findings.push(
          `${where}: host ${host} is also ${hostOwner.get(host)}'s`,
        );
      hostOwner.set(host, source.id);
    }
    if (!source.audience)
      findings.push(`${where}: audience must say who the source is for`);
    if (!nonEmptyStrings(source.languages))
      findings.push(`${where}: languages must list what it is published in`);
    const signOff = source.signOff;
    if (
      !signOff ||
      typeof signOff !== "object" ||
      Object.keys(signOff).sort().join() !== [...SIGNATURE_ROLES].sort().join()
    ) {
      findings.push(
        `${where}: signOff must hold exactly ${SIGNATURE_ROLES.join(" and ")} (null until signed)`,
      );
      continue;
    }
    for (const role of SIGNATURE_ROLES) {
      const signature = signOff[role];
      if (signature === null) continue;
      if (!appointed.get(role))
        findings.push(
          `${where}: signOff.${role} is recorded and nobody has been appointed to give it — a signature without a signatory is a forgery with good intentions`,
        );
      if (
        !signature ||
        !signature.signedBy ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(signature.signedOn)) ||
        !signature.reference
      )
        findings.push(
          `${where}: signOff.${role} needs signedBy, signedOn (a day) and a reference to the signed record`,
        );
    }
    if (source.active === true) {
      if (!verdict || !verdict.mayActivate)
        findings.push(
          `${where}: switched on under the verdict "${licensing.verdict}", which never permits it — a licence that does not cover a commercial service is not cured by a flag`,
        );
      else if (verdict.requiresPermissionRecord && !licensing.permissionRef)
        findings.push(
          `${where}: switched on without the written permission its verdict requires (licensing.permissionRef)`,
        );
      if (SIGNATURE_ROLES.some((role) => !signOff[role]))
        findings.push(
          `${where}: switched on without both signatures — the clinical reviewer's and the Information Officer's`,
        );
    }
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const turnedAway = Array.isArray(federation && federation.assessedNotAdmitted)
    ? federation.assessedNotAdmitted
    : [];
  for (const entry of turnedAway) {
    const where = `${at} assessedNotAdmitted "${entry.id ?? "<no id>"}"`;
    if (sourceIds.has(entry.id))
      findings.push(`${where}: is also a listed source`);
    if (!entry.name || !entry.licence || !entry.reason)
      findings.push(`${where}: needs a name, the licence read, and the reason`);
    if (!httpsUrl(entry.verifiedFrom))
      findings.push(
        `${where}: verifiedFrom must be the https page the licence was read from`,
      );
    if (!verdicts[entry.verdict] || verdicts[entry.verdict].mayActivate)
      findings.push(
        `${where}: verdict "${entry.verdict}" must be a verdict that never activates — it was turned away`,
      );
    if (!nonEmptyStrings(entry.hosts))
      findings.push(`${where}: hosts must be listed, so a paste is recognised`);
    for (const host of entry.hosts || [])
      if (hostOwner.has(host))
        findings.push(
          `${where}: host ${host} belongs to the listed source ${hostOwner.get(host)} — one host is admitted or turned away, not both`,
        );
  }
  return findings;
}
