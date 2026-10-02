/* The demonstration override's rules, shared by scripts/check-boundaries.mjs and the catalogue's tests
   (scripts/knowledge-federation.test.ts), added on 2 October 2026 with the founder's decision to switch
   on, for demonstration, what waits on the Information Officer.

   packages/catalog/demonstration-override.json is one switch with a list. What makes it safe to have is
   what it cannot do, and every rule below is one of those:

   - It opens only what it lists, and only while inForce is true. gateOpen() is the one question every
     gate asks beside its own signatures; inForce false answers no to every gate at once, which is the
     whole of going live.
   - It never opens a knowledge source whose licence does not cover a commercial service or waits on its
     owner's written permission — a licence is law, not an internal gate — nor one already turned away.
   - It never lists a thing it records as not opened: the Passport, the identity service in production,
     clinical records, offshore speech, triage, the emergency terms and the rest. The two lists are
     disjoint by construction, so nobody can open one by adding a line to the other.
   - It is not a signature. A source it opens still carries two null signatures and "active": false;
     federation.json's own validator keeps holding that file to its signed rules.

   Plain JavaScript on purpose, like knowledge-codes.mjs beside it: the boundary check imports it with no
   build step, and the TypeScript tests import it too. */

export const GATE_STATES = ["on", "waiting-for-credentials", "opened-when-built"];
export const OVERRIDE_REFUSALS = [
  "override-is-not-a-signature",
  "override-opens-only-what-it-lists",
  "override-never-keeps-personal-information",
  "override-never-cures-a-licence",
  "override-says-so-everywhere",
];
export const NOT_OPENED_CLASSES = [
  "keeps-personal-information",
  "founder-amendment",
  "the-decision-itself",
  "not-only-the-officers",
  "licence",
  "nothing-switched-off",
];
/* What the founder's decision did not reach, by the id the contract records it under. Held here as well
   as in the contract's notOpened list, so deleting a line there does not quietly make it openable. */
export const NEVER_OPENED = [
  "health-passport",
  "identity-service-in-production",
  "clinical-records",
  "offshore-speech-for-health-information",
  "triage",
  "emergency-terms",
];

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

/* The one question. Anything but inForce === true and a listed id is closed. */
export function gateOpen(override, id) {
  return (
    override?.inForce === true &&
    Array.isArray(override.gates) &&
    override.gates.some((gate) => gate && gate.id === id)
  );
}

/* Whether a licence verdict lets the override open a source: one that may activate and needs no
   written permission on file. */
export function licencePermitsDemonstration(federation, source) {
  const verdict = federation?.licenceVerdicts?.[source?.licensing?.verdict];
  return Boolean(verdict && verdict.mayActivate === true && !verdict.requiresPermissionRecord);
}

/* Whether a federation source answers today: signed (its own flag, which federation.json's validator
   allows only with both signatures), or opened by the override in force with a licence that permits it. */
export function sourceOn(override, federation, source) {
  if (!source) return false;
  if (source.active === true) return true;
  return gateOpen(override, `knowledge-source:${source.id}`) && licencePermitsDemonstration(federation, source);
}

export function validateDemonstrationOverride(override, federation) {
  const findings = [];
  const at = "packages/catalog/demonstration-override.json";
  if (!override || typeof override !== "object") return [`${at}: missing`];
  if (typeof override.inForce !== "boolean")
    findings.push(`${at}: inForce must be true or false — it is the one value going live changes`);
  const decided = override.decided || {};
  if (decided.by !== "founder" || !/^\d{4}-\d{2}-\d{2}$/.test(String(decided.on)) || !nonEmpty(decided.words))
    findings.push(`${at}: decided needs by "founder", the day, and the founder's words — an override nobody can attribute is an override nobody decided`);
  const disclaimer = override.disclaimer || {};
  if (!nonEmpty(disclaimer.label) || !nonEmpty(disclaimer.sentence) || !/demonstration/i.test(disclaimer.sentence) || !/Information Officer/.test(disclaimer.sentence) || !/clinical reviewer/.test(disclaimer.sentence))
    findings.push(`${at}: disclaimer needs a label and a sentence that says it is a demonstration and names the Information Officer and the clinical reviewer`);
  if (!nonEmpty(override.goLive) || !/inForce/.test(override.goLive))
    findings.push(`${at}: goLive must say what going live changes — inForce, and nothing else`);
  const refusals = Array.isArray(override.refusals) ? override.refusals : [];
  for (const id of OVERRIDE_REFUSALS) {
    const refusal = refusals.find((r) => r && r.id === id);
    if (!refusal || !nonEmpty(refusal.statement) || !nonEmpty(refusal.why))
      findings.push(`${at}: refusals "${id}" is missing its statement or its why`);
  }
  const kinds = override.kinds || {};
  for (const [id, kind] of Object.entries(kinds))
    if (!nonEmpty(kind.contract) || !Array.isArray(kind.standsInFor) || !kind.standsInFor.length || !Array.isArray(kind.renderedAt) || !nonEmpty(kind.why))
      findings.push(`${at}: kinds.${id} needs the contract it opens, who it stands in for, where it is rendered and why`);
  const standsInFor = new Set((override.standsInFor || []).map((role) => role.id));
  for (const role of ["information-officer", "clinical-reviewer"])
    if (!standsInFor.has(role)) findings.push(`${at}: standsInFor must say what the override stands in for the ${role} on, and what not`);

  const sources = Array.isArray(federation?.sources) ? federation.sources : [];
  const turnedAway = new Set((federation?.assessedNotAdmitted || []).map((entry) => entry.id));
  const notOpened = Array.isArray(override.notOpened) ? override.notOpened : [];
  const notOpenedIds = new Set(notOpened.map((entry) => entry && entry.id));
  for (const id of NEVER_OPENED)
    if (!notOpenedIds.has(id)) findings.push(`${at}: notOpened no longer records "${id}" and why the override leaves it closed`);
  for (const entry of notOpened)
    if (!entry || !nonEmpty(entry.id) || !nonEmpty(entry.name) || !nonEmpty(entry.where) || !NOT_OPENED_CLASSES.includes(entry.class) || !nonEmpty(entry.why))
      findings.push(`${at}: notOpened "${entry?.id ?? "<no id>"}" needs a name, where, a class from ${NOT_OPENED_CLASSES.join(", ")}, and why`);
  for (const id of NOT_OPENED_CLASSES)
    if (!nonEmpty(override.classes?.[id])) findings.push(`${at}: classes.${id} needs its sentence`);

  const seen = new Set();
  const gates = Array.isArray(override.gates) ? override.gates : [];
  for (const gate of gates) {
    const where = `${at} gate "${gate?.id ?? "<no id>"}"`;
    if (!gate || !nonEmpty(gate.id)) {
      findings.push(`${at}: a gate has no id`);
      continue;
    }
    if (seen.has(gate.id)) findings.push(`${where}: listed twice`);
    seen.add(gate.id);
    if (notOpenedIds.has(gate.id) || NEVER_OPENED.includes(gate.id))
      findings.push(`${where}: is also recorded as not opened — the override cannot open what it says it leaves closed`);
    if (!kinds[gate.kind]) findings.push(`${where}: kind "${gate.kind}" is not one of the override's kinds`);
    if (!GATE_STATES.includes(gate.state)) findings.push(`${where}: state "${gate.state}" is not one of ${GATE_STATES.join(", ")}`);
    if (gate.state === "waiting-for-credentials" && !nonEmpty(gate.waitingFor))
      findings.push(`${where}: waiting for credentials, and does not say which`);
    if (gate.kind === "knowledge-source") {
      if (gate.id !== `knowledge-source:${gate.sourceId}`)
        findings.push(`${where}: a knowledge-source gate's id is knowledge-source:<the source's id>`);
      const source = sources.find((s) => s.id === gate.sourceId);
      if (!source) findings.push(`${where}: names a source federation.json does not list`);
      else {
        if (!licencePermitsDemonstration(federation, source))
          findings.push(`${where}: its licence verdict "${source.licensing?.verdict}" does not permit a commercial service's use without written permission — the override never cures a licence`);
        if (source.active !== false)
          findings.push(`${where}: federation.json's own flag is not false — the override opens a gate beside the flag and never moves it`);
      }
      if (turnedAway.has(gate.sourceId)) findings.push(`${where}: names a publisher assessed and turned away`);
      if (gate.state === "opened-when-built") findings.push(`${where}: a knowledge source is on or waiting for credentials, never opened when built`);
    }
    if (gate.kind === "capability") {
      if (gate.state !== "opened-when-built" && !(kinds.capability?.renderedAt || []).length)
        findings.push(`${where}: built, and rendered nowhere — add each file that shows it to kinds.capability.renderedAt`);
      if (!Array.isArray(gate.opensWaitsOn) || !gate.opensWaitsOn.length || !Array.isArray(gate.builderMust) || !gate.builderMust.length)
        findings.push(`${where}: needs the conditions it opens and what its builder must do`);
    }
  }
  return findings;
}
