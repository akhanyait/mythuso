/* Proves each rule in scripts/check-case-pathway.mjs fires, by handing the module a broken copy of one
   file through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-case-pathway.mjs`; it is not part of the build, because a proof that ran on every
   build would be the build proving itself. Nothing on disk is changed. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkCasePathway } from "./check-case-pathway.mjs";
import { hasSequence, stems } from "../packages/gilbertone/src/stems.ts";

const files = (dir) => { const out = []; const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : out.push(p); } }; if (existsSync(dir)) walk(dir); return out; };
const readDisk = (f) => readFileSync(f, "utf8");
const run = (patch) => checkCasePathway({ read: (f) => patch[f] !== undefined ? patch[f] : readDisk(f), files, stems, hasSequence, existsSync });
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const CASE = "packages/catalog/case.json", INTAKE = "packages/catalog/symptom-intake.json";
const headache = (d) => d.groups.find((g) => g.id === "headache");

const proofs = [
  ["a headache question with no source and no keptBecause", { [INTAKE]: json(INTAKE, (d) => { const q = headache(d).questions.find((q) => q.id === "dizzy"); delete q.drawsOn; }) }, /names no source condition/],
  ["a headache condition nothing draws on", { [INTAKE]: json(INTAKE, (d) => { for (const q of headache(d).questions) q.drawsOn = q.drawsOn?.filter((id) => id !== "cond-062"); }) }, /no question draws on it/],
  ["questionsFrom missing an entry that lists headache", { [INTAKE]: json(INTAKE, (d) => { headache(d).questionsFrom = headache(d).questionsFrom.filter((id) => id !== "cond-062"); }) }, /derived from every entry that lists the complaint/],
  ["an emergency feature offered as an option", { [INTAKE]: json(INTAKE, (d) => { headache(d).questions.find((q) => q.id === "sick").options.push("Stiff neck"); }) }, /carries the emergency feature/],
  ["an emergency term in a question", { [INTAKE]: json(INTAKE, (d) => { headache(d).questions.find((q) => q.id === "where").ask = "Is it the worst headache you have had?"; }) }, /carries the emergency feature/],
  ["a key named priority", { [CASE]: json(CASE, (d) => { d.pathway.priority = "high"; }) }, /keyed as a priority/],
  ["a pathway registered as ratified", { "packages/catalog/protocols.json": json("packages/catalog/protocols.json", (d) => { d.protocols.find((p) => p.id === "headache-raised-blood-pressure-pathway").status = "ratified"; }) }, /refuses a seeded sign-off/],
  ["the pathway named as a triage protocol", { "packages/catalog/clinical.json": json("packages/catalog/clinical.json", (d) => { d.triage.triageProtocols.ids.push("headache-raised-blood-pressure-pathway"); }) }, /may never be borrowed as one/],
  ["a very-high band that types its line", { [CASE]: json(CASE, (d) => { d.pathway.bands["very-high"].from = "180/120"; }) }, /very-high band cites/],
  ["a setting mapped onto no outcome", { [CASE]: json(CASE, (d) => { d.settings.kinds[1].guidanceOutcomeCode = "see-a-nurse"; }) }, /Each setting is one outcome/],
  ["a first rule that is not the emergency words", { [CASE]: json(CASE, (d) => { d.pathway.rules.order.reverse(); }) }, /first rule is not the emergency words/],
  ["a rule with a number in its reason", { [CASE]: json(CASE, (d) => { d.pathway.rules.order[2].reason = "Above 140 over 90."; }) }, /types a number in its reason/],
  ["a feature set by words no chip says", { [CASE]: json(CASE, (d) => { d.features.list.find((f) => f.id === "dizzy").options = ["dizzy"]; }) }, /not an option of "dizzy" word for word/],
  ["a finding naming a condition that does not list headache", { [CASE]: json(CASE, (d) => { d.findings.rules[0].conditionIds = ["cond-001"]; }) }, /does not list headache/],
  ["a findings sentence that is not consistent-with", { [CASE]: json(CASE, (d) => { d.findings.sentence = "You have {pattern} ({features})."; }) }, /consistent-with form/],
  ["a you-have phrase anywhere in the contract", { [CASE]: json(CASE, (d) => { d.screens.patient.opened = "You have been diagnosed with something."; }) }, /Nothing addressed to a patient/],
  ["a patient sentence carrying a digit", { [CASE]: json(CASE, (d) => { d.screens.patient.readingAsk = "Type it like 120/80."; }) }, /carries a digit/],
  ["a patient allowed to name the kit instrument as a source", { [CASE]: json(CASE, (d) => { d.readings.sources.patient.push("kit-instrument"); }) }, /whose class carries clinical weight/],
  ["a home cuff given the certified class", { [CASE]: json(CASE, (d) => { d.readings.classBySource["own-device"] = "certified"; }) }, /does not allow for it/],
  ["an event owned by another engine", { [CASE]: json(CASE, (d) => { d.events[0].owner = "care"; }) }, /the case is Clinical's/],
  ["the setting route open to a doctor", { "packages/catalog/apis/clinical.json": json("packages/catalog/apis/clinical.json", (d) => { d.routes.find((r) => r.path === "/v1/clinical/cases/{caseRef}/setting").callers.push("doctor"); }) }, /somebody other than a nurse/],
  ["the web deciding weight itself", { "apps/web/src/lib/case.ts": text("apps/web/src/lib/case.ts", "weight: clinicalUseOf(", "weight: 'clinical' as ClinicalUseCode, unused: clinicalUseOf(") }, /decides a reading's weight itself/],
  ["the panel reaching a finding", { "apps/web/src/features/Assistant.tsx": text("apps/web/src/features/Assistant.tsx", "{caseScreens.opened}", "{caseScreens.opened}{String(view?.stateCode)}{(view as {findings?: unknown[]}).findings}") }, /names a finding/],
  ["a second place deciding the setting", { "apps/web/src/features/Dashboard.tsx": readDisk("apps/web/src/features/Dashboard.tsx") + "\n// decideSetting('x', 'y')\ndecideSetting('x', 'y');\n" }, /decideSetting\(\) is called from/],
  ["a typed contract sentence on the screen", { "apps/web/src/features/CaseFile.tsx": text("apps/web/src/features/CaseFile.tsx", "{nurse.findingsNone}", '{"The notes match none of the pathway\'s patterns."}') }, /types "The notes match none/],
  ["the draft banner dropped from the case file", { "apps/web/src/features/CaseFile.tsx": text("apps/web/src/features/CaseFile.tsx", "  <DraftBanner/>\n", "") }, /no longer draws the draft banner/],
  ["the case file imported statically", { "apps/web/src/shells/StaffShell.tsx": text("apps/web/src/shells/StaffShell.tsx", "lazy(() => import('../features/CaseFile')", "lazy(() => import('../features/CaseFileX')") }, /arrives on a dynamic import/],
  ["a native file naming the case", { "apps/ios/MyThuso/Models/Assistant.swift": readDisk("apps/ios/MyThuso/Models/Assistant.swift") + "\n// CaseFile\n" }, /names the case pathway/],
  ["a patient sentence saying a visit was arranged", { [CASE]: json(CASE, (d) => { d.screens.patient.who["home-visit"] = "{nurse} has your case and has arranged a home visit today."; }) }, /arranged, booked or is on its way/],
  ["a patient sentence saying a nurse is on her way", { [CASE]: json(CASE, (d) => { d.screens.patient.who.online = "{nurse} is on her way."; }) }, /arranged, booked or is on its way/],
  ["the preview line dropped from the contract", { [CASE]: json(CASE, (d) => { delete d.screens.patient.preview; }) }, /lost its preview line/],
  ["the preview line dropped from the card", { "apps/web/src/features/Assistant.tsx": text("apps/web/src/features/Assistant.tsx", "{caseScreens.preview}", "") }, /preview line beside who has the case/],
  ["a feature kind no rule reads", { [CASE]: json(CASE, (d) => { d.pathway.rules.order.find((r) => r.id === "injury-or-fever-cluster").when.anyFeatureKind = "at-the-door"; }) }, /"fever", which no rule reads/],
  ["the pathway no longer saying it awaits review", { [CASE]: json(CASE, (d) => { delete d.pathway.rules.awaitingReview; }) }, /awaits clinical review/],
  ["the very-high line differing from its sentence silently", { [CASE]: json(CASE, (d) => { delete d.pathway.bands["very-high"].reviewerNote; }) }, /for the clinical reviewer/],
  ["an emergency suggestion opening the case in emergency", { "apps/web/src/lib/case.ts": text("apps/web/src/lib/case.ts", "stateCode: emergency ? 'emergency' : 'opened'", "stateCode: suggestion.settingCode === 'emergency' ? 'emergency' : 'opened'") }, /opens a case in the emergency state/],
  ["a repeat with no state check", { "apps/web/src/lib/case.ts": text("apps/web/src/lib/case.ts", " if (!repeatable(c)) return caseRefused('reading-not-with-a-nurse');\n", "") }, /repeats a reading on a case that is not with a nurse/],
  ["the repeat offered before the case is taken", { "apps/web/src/features/CaseFile.tsx": text("apps/web/src/features/CaseFile.tsx", "{repeatable(c) && <>", "{c.stateCode !== 'closed' && <>") }, /offers the repeat where the lib would refuse it/],
  ["a case closed twice", { "apps/web/src/lib/case.ts": text("apps/web/src/lib/case.ts", " if (!closable(c)) return caseRefused('case-not-with-a-doctor');\n", "") }, /closes one twice/],
  ["the journey without the doctor", { "tests/case-pathway.spec.ts": text("tests/case-pathway.spec.ts", "chooseRole(page, 'Doctor')", "chooseRole(page, 'Doktor')") }, /walk the nurse and the doctor/],
];
let failed = 0;
for (const [name, patch, expected] of proofs) {
  let message = null;
  try { run(patch); } catch (e) { message = e.message; }
  if (!message || !expected.test(message)) { failed++; console.log(`NOT PROVEN  ${name}\n  got: ${message ?? "no refusal"}`); }
  else console.log(`proven      ${name}`);
}
console.log(run({}));
if (failed) { console.error(`${failed} not proven`); process.exit(1); }
