/* Proves each rule in scripts/check-consultation-toolkit.mjs fires, by handing the module a broken copy of one file
   through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-consultation-toolkit.mjs`; it is not part of the build, because a proof that ran on every
   build would be the build proving itself. Nothing on disk is changed. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkConsultationToolkit } from "./check-consultation-toolkit.mjs";

const files = (dir) => { const out = []; const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : out.push(p); } }; if (existsSync(dir)) walk(dir); return out; };
const readDisk = (f) => readFileSync(f, "utf8");
const run = (patch) => checkConsultationToolkit({
  read: (f) => patch[f] !== undefined ? patch[f] : readDisk(f),
  exists: (f) => patch[f] !== undefined ? patch[f] !== null : existsSync(f),
  files: (dir) => [...new Set([...files(dir), ...Object.keys(patch).filter((f) => f.startsWith(`${dir}/`))])]
});
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const SOURCE = "packages/catalog/consultation-toolkit.json", SCREEN = "apps/web/src/features/ConsultationToolkit.tsx";
const VETTING = "packages/catalog/vetting.json", CARE = "apps/web/src/features/CareVisit.tsx";
const nurse = (d) => d.surfaces.find((s) => s.role === "nurse");

const proofs = [
  ["a capability the register does not hold", { [SOURCE]: json(SOURCE, (d) => { d.tools[0].capability = "read-minds"; }) }, /vetting\.json does not hold/],
  ["a notice nobody declared", { [SOURCE]: json(SOURCE, (d) => { d.tools[0].honesty.capability = "telepathy"; }) }, /capabilities\.json does not hold/],
  ["a call refusal teleconsult.json does not hold", { [SOURCE]: json(SOURCE, (d) => { d.tools.find((t) => t.id === "prescribe").onCall[0].refusal = "nobody-said-this"; }) }, /teleconsult\.json does not hold/],
  ["a nurse offered a test she is never granted", { [SOURCE]: json(SOURCE, (d) => { const s = nurse(d); s.tools.push("tests"); s.refused = s.refused.filter((r) => r.tool !== "tests"); }) }, /never grants a nurse/],
  ["a nurse's refusal made false by the register", { [VETTING]: json(VETTING, (d) => { d.roles.find((r) => r.id === "nurse").grants.push({ capability: "order-test", refusal: "x" }); }) }, /The sentence would be false/],
  /* Granted on the register as well, so the rule that a role is offered only what it holds passes, and the one
     that a nurse never gets a sick note is the one left to fire. */
  ["a sick note on the nurse's surface, even with the register granting it", { [SOURCE]: json(SOURCE, (d) => { const s = nurse(d); s.tools.push("sick-note"); s.refused = s.refused.filter((r) => r.tool !== "sick-note"); }),
    [VETTING]: json(VETTING, (d) => { d.roles.find((r) => r.id === "nurse").grants.push({ capability: "issue-medical-certificate", refusal: "x" }); }) }, /is a doctor's/],
  ["the sick note's refusal dropped for the nurse", { [SOURCE]: json(SOURCE, (d) => { const s = nurse(d); s.refused = s.refused.filter((r) => r.tool !== "sick-note"); }) }, /no longer says, where the doctor's tools would be/],
  ["a prescription started on a call with nobody in the room", { [SOURCE]: json(SOURCE, (d) => { d.tools.find((t) => t.id === "prescribe").onCall = []; }) }, /no longer waits for the nurse in the room/],
  ["a certificate written from a call alone", { [SOURCE]: json(SOURCE, (d) => { d.tools.find((t) => t.id === "sick-note").onCall[0].limit = "conclude"; }) }, /no longer waits for the nurse in the room/],
  ["a screen that does not exist", { [SOURCE]: json(SOURCE, (d) => { d.tools.find((t) => t.id === "tests").screens.web = "apps/web/src/features/Nowhere.tsx#Nothing"; }) }, /there is no such file/],
  ["a screen said to draw a notice it does not", { [SOURCE]: json(SOURCE, (d) => { d.tools.find((t) => t.id === "tests").honesty.capability = "booking"; }) }, /draws none/],
  ["the toolkit no longer drawing a notice for its own tools", { [SCREEN]: text(SCREEN, "tool.honesty.drawnBy === 'toolkit' && <NotConnected of={tool.honesty.capability}", "false && <NotConnected of={tool.honesty.capability}") }, /no longer draws the notice/],
  ["a tool the web opens nothing for", { [SCREEN]: text(SCREEN, "case 'tests':", "case 'tests-retired':") }, /opens nothing for "tests"/],
  ["a short name outside the long one", { [SOURCE]: json(SOURCE, (d) => { d.tools.find((t) => t.id === "case").short = "Cases"; }) }, /is not part of it/],
  ["the nurse's visit missing from the live board's places", { "packages/catalog/live-vitals.json": json("packages/catalog/live-vitals.json", (d) => { d.surfaces = d.surfaces.filter((s) => s.role !== "nurse"); }) }, /does not name "care-visit"/],
  ["the devices dropped from the nurse's tools", { [SOURCE]: json(SOURCE, (d) => { const s = nurse(d); s.tools = s.tools.filter((t) => t !== "devices"); }) }, /does not list the patient's devices/],
  ["the visit no longer opening her toolkit", { [CARE]: text(CARE, "<VisitWithTools home={home}/>", "{home}") }, /no longer opens the nurse's toolkit/],
  ["the devices shown on the road", { [CARE]: text(CARE, "surfaceFrom('care-visit')", "'route'") }, /waits for the stage the contract names/],
  ["a static import onto a first view", { "apps/web/src/features/Dashboard.tsx": readDisk("apps/web/src/features/Dashboard.tsx") + "\nimport { ConsultationToolkit } from './ConsultationToolkit';\n" }, /imports the toolkit statically/],
  ["browser storage", { [SCREEN]: text(SCREEN, "const back = () =>", "localStorage.setItem('tool', 'x'); const back = () =>") }, /names browser storage/],
  ["a panel that slides in", { "apps/web/src/features/consultation-toolkit.css": readDisk("apps/web/src/features/consultation-toolkit.css") + "\n.ctk-panel { transition: opacity 1s; }\n" }, /moves something/],
  ["a sentence typed into the screen", { [SCREEN]: readDisk(SCREEN) + `\nconst typed = ${JSON.stringify(JSON.parse(readDisk(SOURCE)).gates.notOnFile)};\n` }, /types ".*", a sentence/],
  ["a phone that stops reading the refused sentences", { "apps/ios/MyThuso/Features/ConsultationToolkitView.swift": existsSync("apps/ios/MyThuso/Features/ConsultationToolkitView.swift") ? readDisk("apps/ios/MyThuso/Features/ConsultationToolkitView.swift").replaceAll("surface.refused", "surface.retired") : "" }, /no longer reads surface\.refused/],
  ["a phone typing a state word the contract holds", { "apps/android/app/src/main/java/za/co/mythuso/model/ConsultationToolkit.kt": readDisk("apps/android/app/src/main/java/za/co/mythuso/model/ConsultationToolkit.kt").replace("ConsultationToolkitData.Words.stateClosed", JSON.stringify(JSON.parse(readDisk(SOURCE)).words.stateClosed)) }, /types "Closed for this appointment/],
  ["Android's nurse visit without the devices", { "apps/android/app/src/main/java/za/co/mythuso/ui/CareVisitScreens.kt": readDisk("apps/android/app/src/main/java/za/co/mythuso/ui/CareVisitScreens.kt").replaceAll("LiveVitalsPanel(subject", "Nothing(subject") }, /no longer shows the nurse the patient's devices/]
];

let failed = 0;
for (const [name, patch, expected] of proofs) {
  try { run(patch); console.log(`✗ ${name}: the check did not fire`); failed++; }
  catch (e) { if (expected.test(e.message)) console.log(`✓ ${name}`); else { console.log(`✗ ${name}: fired with the wrong refusal — ${e.message}`); failed++; } }
}
try { console.log(`✓ the unbroken tree: ${run({})}`); } catch (e) { console.log(`✗ the unbroken tree: ${e.message}`); failed++; }
if (failed) { console.error(`${failed} proof(s) failed`); process.exit(1); }
