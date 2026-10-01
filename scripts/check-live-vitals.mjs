/* The live vitals board — 1 October 2026.
 *
 * The founder asked for the Lovable export's live triage page: every device in the patient's kit streaming,
 * on the doctor's Triage page and beside the doctor's consultation. The export drew a device triage in
 * red-to-green, an early-warning score, an AI summary, an alarm centre and a risk heatmap over the readings.
 * None of those can be honestly drawn — no triage protocol is ratified and a simulated reading carries no
 * clinical weight — so the board keeps the export's arrangement and draws packages/catalog/live-vitals.json's
 * refusal where each of them stood. What this module holds is what would let any of them creep back:
 *
 *   1. The contract joins what exists: every stream's measure is the record's, its instrument capture.json's,
 *      its preset readings in the record's unit, and the default scenario a preset the simulator has.
 *   2. The refusals stand only while they are true. If clinical.json ever names a ratified triage protocol,
 *      the build stops: the sentences saying "no triage protocol is ratified" would then be false.
 *   3. The board draws no judgement: no score, priority, severity or triage-colour word in its code, no badge
 *      but the neutral one, and the contract's refusals rendered.
 *   4. The ranges are read, never typed: no reference number beside a low or a high on the screen or in the
 *      arithmetic, which takes them from records.json.
 *   5. It says it is simulated: the contract's banner and the devices capability's notice over every board.
 *   6. It is pure and leaves nothing behind: no Math.random or clock in the arithmetic, no browser storage in
 *      any of its files, the interval cleared on unmount, nothing animated.
 *   7. It is never on a patient's first view: the screen is reached only through dynamic imports.
 *   8. The phones say the same: both native views render the banner, the notice and the refusals, and their
 *      arithmetic draws no judgement either.
 *
 * Each rule is proven to fire by scripts/prove-live-vitals.mjs, which hands this module broken files. */
export function checkLiveVitals({ read, files }) {
  const fail = (why) => { throw new Error(`Live vitals board: ${why}`); };
  const SOURCE = "packages/catalog/live-vitals.json";
  const SCREEN = "apps/web/src/features/LiveVitals.tsx";
  const ENGINE = "packages/engines/src/devices/live-vitals.ts";
  const CSS = "apps/web/src/features/live-vitals.css";
  const IOS_MODEL = "apps/ios/MyThuso/Models/LiveVitals.swift";
  const IOS_VIEW = "apps/ios/MyThuso/Features/LiveVitalsView.swift";
  const KT_MODEL = "apps/android/app/src/main/java/za/co/mythuso/model/LiveVitals.kt";
  const KT_VIEW = "apps/android/app/src/main/java/za/co/mythuso/ui/LiveVitalsScreens.kt";
  const contract = JSON.parse(read(SOURCE));
  const records = JSON.parse(read("packages/catalog/records.json"));
  const capture = JSON.parse(read("packages/catalog/capture.json"));
  const clinical = JSON.parse(read("packages/catalog/clinical.json"));
  const presets = JSON.parse(read("packages/catalog/devices/simulator-presets.json")).presets;
  const uncommented = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/([^:])\/\/.*$/gm, "$1");

  /* 1. The join. */
  for (const s of contract.streams) {
    const m = records.observations.measures.find((x) => x.id === s.measure);
    if (!m) fail(`the stream "${s.id}" names the measure "${s.measure}", which records.json#observations does not hold.`);
    if (s.instrument !== null && !capture.devices.some((d) => d.id === s.instrument)) fail(`the stream "${s.id}" names the instrument "${s.instrument}", which capture.json does not hold.`);
    if (s.instrument !== null && !capture.devices.find((d) => d.id === s.instrument).measures.includes(s.measure)) fail(`the stream "${s.id}" says the ${s.instrument} measures ${s.measure}, and capture.json says it does not.`);
    if (!(s.jitter > 0)) fail(`the stream "${s.id}" has no jitter, so it would not be live.`);
    for (const p of presets) for (const r of p.readings.filter((r) => r.type === s.presetType))
      if (r.unit !== m.unit) fail(`${p.id} sends ${r.type} in ${r.unit} and the stream "${s.id}" reads it as ${m.unit}, the record's unit.`);
    if (!presets.some((p) => p.readings.some((r) => r.type === s.presetType))) fail(`no simulator preset sends "${s.presetType}", so the stream "${s.id}" would never show a reading.`);
  }
  if (!presets.some((p) => p.id === contract.pace.defaultPreset)) fail(`the default scenario "${contract.pace.defaultPreset}" is not a simulator preset.`);
  const { modulus, multiplier } = contract.jitter;
  if ((modulus - 1) * multiplier >= 2 ** 53) fail("the jitter's products can pass 2^53, where a JavaScript number, a Swift Int and a Kotlin Long stop agreeing.");

  /* 2. The refusals are true. */
  const needed = ["early-warning-score", "device-triage", "interpretation", "threshold-alarms", "risk-heatmap"];
  for (const id of needed) {
    const r = contract.refusals.find((x) => x.id === id);
    if (!r || !r.heading?.trim() || !r.sentence?.trim()) fail(`the refusal "${id}" is missing or empty. It stands where the export drew that panel.`);
  }
  if (clinical.triage.triageProtocols.ids.length)
    fail(`clinical.json now names a triage protocol (${clinical.triage.triageProtocols.ids.join(", ")}), and the board's refusals say none is ratified. Rewrite them in ${SOURCE} in the same change.`);

  /* 3. No judgement drawn. */
  const screen = uncommented(read(SCREEN));
  const engine = uncommented(read(ENGINE));
  for (const [file, code] of [[SCREEN, screen], [ENGINE, engine]]) {
    const word = code.match(/\b(score|NEWS2?|priority|severity|acuity|triage(?:Level|Category)?|critical|urgent|emergency)\b/i)
      || code.match(/['"`](Red|Orange|Yellow|Green|Very urgent|Routine)['"`]/);
    if (word) fail(`${file} carries "${word[0]}". The board says where a reading stands against its range and nothing about what that means.`);
  }
  for (const m of screen.matchAll(/variant=\{?['"]?(\w+)/g))
    if (!["neutral", "secondary", "warning"].includes(m[1])) fail(`${SCREEN} draws a "${m[1]}" variant. Its only badge is neutral, its button secondary and its one warning the simulated banner.`);
  const warnings = [...screen.matchAll(/variant="warning"/g)].length;
  if (warnings !== 1 || !/<Alert variant="warning"[^>]*title=\{words\.banner\}/.test(screen)) fail(`${SCREEN}'s one warning is the simulated banner, and nothing else on the board is coloured as a warning.`);
  if (!/refusals\.map/.test(screen)) fail(`${SCREEN} no longer renders the contract's refusals where the export drew a score, a triage, an interpretation, alarms and a heatmap.`);

  /* 4. Ranges read, never typed. */
  for (const [file, code] of [[SCREEN, screen], [ENGINE, engine]]) {
    const typed = code.match(/\b(low|high)\s*[:=]\s*\d/) || code.match(/[<>]=?\s*(?:9[05]|1[04]0|36\.1|37\.5|7\.8|50)\b/);
    if (typed) fail(`${file} types a range (${typed[0]}). Each stream's range is records.json#observations', read through ${ENGINE}.`);
  }
  if (!/records\.observations\.measures/.test(engine)) fail(`${ENGINE} no longer reads the ranges from records.json#observations.`);

  /* 5. It says it is simulated. */
  if (!/words\.banner/.test(screen) || !/noticeFor\('devices'\)/.test(screen)) fail(`${SCREEN} lost the simulated banner or the devices capability's notice over it.`);

  /* 6. Pure, and nothing left behind. */
  if (/Math\.random|Date\.now|new Date\(/.test(engine)) fail(`${ENGINE} reads a clock or a random source. A reading is a pure function of scenario, patient, stream and number.`);
  for (const file of [SCREEN, ENGINE]) if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(read(file))) fail(`${file} names browser storage. The board keeps nothing.`);
  if (!/return \(\) => clearInterval\(/.test(screen)) fail(`${SCREEN}'s interval is not cleared when the board goes.`);
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, " ");
  const moving = css.match(/@keyframes|animation\s*:|transition\s*:/);
  if (moving) fail(`${CSS} moves something (${moving[0]}). The numbers change because readings arrive; nothing on the board animates.`);

  /* 7. Never on a patient's first view. */
  for (const f of files("apps/web/src").filter((f) => /\.tsx?$/.test(f) && f !== SCREEN)) {
    const code = uncommented(read(f));
    if (/from\s+['"][./]*(?:features\/)?LiveVitals['"]/.test(code)) fail(`${f} imports the board statically. It arrives behind import('./LiveVitals') only.`);
  }
  const importers = files("apps/web/src").filter((f) => /\.tsx?$/.test(f) && /import\(['"]\.\/LiveVitals['"]\)/.test(read(f)));
  if (importers.length < 3) fail(`the board is reached from ${importers.length} dynamic imports; the Triage page, the call and the consultation record each ask for it.`);

  /* 8. The phones say the same. */
  for (const [file, words] of [[IOS_VIEW, ["W.banner", "W.notice", "LiveVitals.refusals"]], [KT_VIEW, ["w.banner", "w.notice", "LiveVitalsData.refusals"]]]) {
    const code = read(file);
    for (const w of words) if (!code.includes(w)) fail(`${file} no longer renders ${w}.`);
  }
  for (const file of [IOS_MODEL, IOS_VIEW, KT_MODEL, KT_VIEW]) {
    const code = uncommented(read(file));
    const word = code.match(/\b(score|NEWS2?|priority|severity|acuity|critical|urgent)\b/i);
    if (word) fail(`${file} carries "${word[0]}". A phone says where a reading stands against its range and nothing about what that means.`);
    if (/dangerInk|\.danger\b|theme\.danger|ThusoRole\.danger/.test(code)) fail(`${file} colours something as danger. No reading on the panel is coloured by where it stands.`);
  }

  return `The live vitals board · ${contract.streams.length} streams joined to the record's measures and capture.json's instruments, each preset reading in the record's unit; ${needed.length} refusals standing while no triage protocol is ratified; no score, priority or severity word, no badge but the neutral one, no typed range; the simulated banner and the devices notice over it; pure arithmetic, no storage, the interval cleared, nothing animated; behind ${importers.length} dynamic imports and none static; both phones rendering the banner, the notice and the refusals.`;
}
