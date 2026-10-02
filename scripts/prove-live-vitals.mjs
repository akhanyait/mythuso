/* Proves each rule in scripts/check-live-vitals.mjs fires, by handing the module a broken copy of one file
   through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-live-vitals.mjs`; it is not part of the build, because a proof that ran on every build
   would be the build proving itself. Nothing on disk is changed. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkLiveVitals } from "./check-live-vitals.mjs";

const files = (dir) => { const out = []; const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : out.push(p); } }; if (existsSync(dir)) walk(dir); return out; };
const readDisk = (f) => readFileSync(f, "utf8");
const run = (patch) => checkLiveVitals({ read: (f) => patch[f] !== undefined ? patch[f] : readDisk(f), files: (dir) => [...new Set([...files(dir), ...Object.keys(patch).filter((f) => f.startsWith(`${dir}/`))])] });
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const SOURCE = "packages/catalog/live-vitals.json", SCREEN = "apps/web/src/features/LiveVitals.tsx", ENGINE = "packages/engines/src/devices/live-vitals.ts";
const PRESETS = "packages/catalog/devices/simulator-presets.json";

const proofs = [
  ["a stream on a measure the record does not hold", { [SOURCE]: json(SOURCE, (d) => { d.streams[0].measure = "weight"; }) }, /does not hold/],
  ["a stream on an instrument that does not measure it", { [SOURCE]: json(SOURCE, (d) => { d.streams.find((s) => s.id === "glucose").instrument = "thermometer"; }) }, /capture\.json says it does not/],
  ["a preset reading in another unit", { [PRESETS]: json(PRESETS, (d) => { d.presets[0].readings.find((r) => r.type === "temperature").unit = "°F"; }) }, /in the record's unit|reads it as/],
  ["a stream no preset ever sends", { [SOURCE]: json(SOURCE, (d) => { d.streams[0].presetType = "blood-pressure-mean"; }) }, /no simulator preset sends/],
  ["a default scenario that does not exist", { [SOURCE]: json(SOURCE, (d) => { d.pace.defaultPreset = "sim.none"; }) }, /is not a simulator preset/],
  ["a refusal removed", { [SOURCE]: json(SOURCE, (d) => { d.refusals = d.refusals.filter((r) => r.id !== "early-warning-score"); }) }, /early-warning-score/],
  ["a triage protocol ratified while the refusals stand", { "packages/catalog/clinical.json": json("packages/catalog/clinical.json", (d) => { d.triage.triageProtocols.ids.push("sats"); }) }, /now names a triage protocol/],
  ["a score drawn on the board", { [SCREEN]: text(SCREEN, "<Foot/>", "<Foot/><p>{'Early warning score'}: {score}</p>") }, /carries "score"/],
  ["a severity badge", { [SCREEN]: text(SCREEN, '<Badge size="sm" variant="neutral">', '<Badge size="sm" variant="danger">') }, /draws a "danger" variant/],
  ["the refusals no longer rendered", { [SCREEN]: text(SCREEN, "refusals.map(", "[].map(") }, /no longer renders the contract's refusals/],
  ["a range typed on the screen", { [SCREEN]: text(SCREEN, "const range = `", "const low = 90; const range = `") }, /types a range/],
  ["the arithmetic not reading the record", { [ENGINE]: text(ENGINE, "const measures = records.observations.measures;", "const measures = fixtureMeasures;") }, /no longer reads the ranges/],
  ["the banner dropped", { [SCREEN]: text(SCREEN, "title={words.banner}", "title={words.heading}") }, /simulated banner/],
  ["a random jitter", { [ENGINE]: text(ENGINE, "return x / MOD;", "return Math.random();") }, /random source/],
  ["browser storage", { [SCREEN]: text(SCREEN, "const choose = (id: string) => {", "const choose = (id: string) => { localStorage.setItem('p', id);") }, /names browser storage/],
  ["an interval never cleared", { [SCREEN]: text(SCREEN, "return () => clearInterval(timer);", "return undefined;") }, /not cleared/],
  ["a measured trend animated", { "apps/web/src/features/live-vitals.css": readDisk("apps/web/src/features/live-vitals.css") + "\n.lv-spark-line { animation: lv 1s infinite; }\n" }, /moves something/],
  ["reduced motion ignored", { "apps/web/src/features/live-vitals.css": text("apps/web/src/features/live-vitals.css", "prefers-reduced-motion: reduce", "prefers-color-scheme: dark") }, /must stop decorative/],
  ["paused organs still moving", { [SCREEN]: text(SCREEN, "moving={!!latest && live.live && live.running}", "moving={true}") }, /must stop organ/],
  ["a static import onto a first view", { "apps/web/src/features/Dashboard.tsx": readDisk("apps/web/src/features/Dashboard.tsx") + "\nimport { LiveVitalsBoard } from './LiveVitals';\n" }, /imports the board statically/],
  ["iOS losing the refusals", { "apps/ios/MyThuso/Features/LiveVitalsView.swift": text("apps/ios/MyThuso/Features/LiveVitalsView.swift", "ForEach(LiveVitals.refusals)", "ForEach([LiveRefusalSpec]())") }, /no longer renders LiveVitals\.refusals/],
  ["Android colouring a reading as danger", { "apps/android/app/src/main/java/za/co/mythuso/ui/LiveVitalsScreens.kt": text("apps/android/app/src/main/java/za/co/mythuso/ui/LiveVitalsScreens.kt", "fontWeight = if (outside) FontWeight.SemiBold else FontWeight.Normal, color = theme.foreground", "fontWeight = FontWeight.Normal, color = if (outside) theme.dangerInk else theme.foreground") }, /colours something as danger/]
];

let failed = 0;
for (const [name, patch, expected] of proofs) {
  try { run(patch); console.log(`✗ ${name}: the check did not fire`); failed++; }
  catch (e) { if (expected.test(e.message)) console.log(`✓ ${name}`); else { console.log(`✗ ${name}: fired with the wrong refusal — ${e.message}`); failed++; } }
}
try { console.log(`✓ the unbroken tree: ${run({})}`); } catch (e) { console.log(`✗ the unbroken tree: ${e.message}`); failed++; }
if (failed) { console.error(`${failed} proof(s) failed`); process.exit(1); }
