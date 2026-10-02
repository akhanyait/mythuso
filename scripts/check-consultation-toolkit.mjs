/* The consultation toolkit — 2 October 2026.
 *
 * The founder asked for the live devices in front of the nurse and the doctor while they consult, and for every
 * tool they need — notes, a prescription, a test, a referral, a sick note, the patient's file, the protocols —
 * linked on the consultation screen itself. packages/catalog/consultation-toolkit.json says which tools each role
 * reaches, in what order, and what is said where a tool is refused. What this module holds is what would let
 * the toolkit start saying something untrue:
 *
 *   1. The contract joins what exists: every capability is the vetting register's, every notice capabilities.json's,
 *      every clinical limit and call refusal teleconsult.json's, every surface's tool a tool.
 *   2. A role is offered only what it is granted. A surface lists no tool its role is never granted, and a refused
 *      tool is one its role is never granted — so the sentence saying "a nurse does not" stays true.
 *   3. A nurse never gets a prescription or a sick note: no nurse surface lists either, and both stand in its
 *      refusals, on every platform.
 *   4. A medicine is not started and a certificate is not written on a call for a patient nobody in the room has
 *      examined: the prescription and the sick note carry the teleconsultation's own refusal for an empty room.
 *   5. Every tool is honest: its capability notice is drawn — by the screen it opens where the contract says so,
 *      and by the toolkit otherwise — and its evidence names a screen that exists.
 *   6. A short name is part of the full one, so what a person sees on a tile is in what a screen reader says.
 *   7. The nurse sees the patient's devices: live-vitals.json names her visit, her surface lists the devices, and
 *      the toolkit draws the live panel — the one with the simulated banner — beside her visit.
 *   8. It is never on a patient's first view: reached only through dynamic imports, from the call, the record and
 *      the visit. No browser storage, and nothing on it moves.
 *   9. A sentence lives in one place: no contract sentence is typed into a screen on any platform.
 *  10. The phones say the same: both native toolkits read the surfaces, the refused sentences and the gates from
 *      the generated data, and both nurse visits draw the live panel.
 *
 * Each rule is proven to fire by scripts/prove-consultation-toolkit.mjs, which hands this module broken files. */
export function checkConsultationToolkit({ read, files, exists }) {
  const fail = (why) => { throw new Error(`Consultation toolkit: ${why}`); };
  const SOURCE = "packages/catalog/consultation-toolkit.json";
  const SCREEN = "apps/web/src/features/ConsultationToolkit.tsx";
  const LIB = "apps/web/src/lib/consultation-toolkit.ts";
  const CSS = "apps/web/src/features/consultation-toolkit.css";
  const IOS_VIEW = "apps/ios/MyThuso/Features/ConsultationToolkitView.swift";
  const IOS_VISIT = "apps/ios/MyThuso/Features/CareVisitView.swift";
  const IOS_MODEL = "apps/ios/MyThuso/Models/ConsultationToolkit.swift";
  const KT_MODEL = "apps/android/app/src/main/java/za/co/mythuso/model/ConsultationToolkit.kt";
  const KT_VIEW = "apps/android/app/src/main/java/za/co/mythuso/ui/ConsultationToolkitScreens.kt";
  const KT_VISIT = "apps/android/app/src/main/java/za/co/mythuso/ui/CareVisitScreens.kt";
  const contract = JSON.parse(read(SOURCE));
  const vetting = JSON.parse(read("packages/catalog/vetting.json"));
  const capabilities = JSON.parse(read("packages/catalog/capabilities.json")).capabilities;
  const tele = JSON.parse(read("packages/catalog/teleconsult.json"));
  const live = JSON.parse(read("packages/catalog/live-vitals.json"));
  const uncommented = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/([^:])\/\/.*$/gm, "$1");
  const tool = (id) => contract.tools.find((t) => t.id === id);
  const grants = (roleId) => new Set((vetting.roles.find((r) => r.id === roleId)?.grants ?? []).map((g) => g.capability));

  /* 1. The joins. */
  for (const t of contract.tools) {
    if (t.capability !== null && !vetting.capabilities.some((c) => c.id === t.capability)) fail(`the tool "${t.id}" asks for the capability "${t.capability}", which vetting.json does not hold.`);
    if (!capabilities.some((c) => c.id === t.honesty.capability)) fail(`the tool "${t.id}" draws the notice of "${t.honesty.capability}", which capabilities.json does not hold.`);
    for (const g of t.onCall ?? []) {
      if (!tele.clinicalLimits.some((l) => l.id === g.limit)) fail(`the tool "${t.id}" waits on the clinical limit "${g.limit}", which teleconsult.json does not hold.`);
      if (!tele.refusals.some((r) => r.id === g.refusal)) fail(`the tool "${t.id}" says the call refusal "${g.refusal}", which teleconsult.json does not hold.`);
    }
    if (!t.summary?.trim()) fail(`the tool "${t.id}" says nothing about what it is.`);
  }
  for (const s of contract.surfaces) {
    if (!vetting.roles.some((r) => r.id === s.role)) fail(`the surface "${s.id}" is for "${s.role}", which is not a vetting role.`);
    for (const id of [...s.tools, ...(s.refused ?? []).map((r) => r.tool)]) if (!tool(id)) fail(`the surface "${s.id}" names the tool "${id}", which the contract does not hold.`);
    if (new Set(s.tools).size !== s.tools.length) fail(`the surface "${s.id}" lists a tool twice.`);
  }

  /* 2. A role is offered only what it is granted, and refused only what it is never granted. */
  for (const s of contract.surfaces) {
    const held = grants(s.role);
    for (const id of s.tools) { const t = tool(id); if (t.capability && !held.has(t.capability)) fail(`the ${s.role}'s surface "${s.id}" lists "${t.name}", whose capability "${t.capability}" vetting.json never grants a ${s.role}. It would be refused on every visit.`); }
    for (const r of s.refused ?? []) {
      const t = tool(r.tool);
      if (t.capability && held.has(t.capability)) fail(`the ${s.role}'s surface "${s.id}" says "${t.name}" is not theirs, and vetting.json grants a ${s.role} "${t.capability}". The sentence would be false.`);
      if (!r.sentence?.trim()) fail(`the ${s.role}'s refusal of "${t.name}" has no sentence.`);
      if (s.tools.includes(r.tool)) fail(`the surface "${s.id}" both lists and refuses "${t.name}".`);
    }
  }

  /* 3. A nurse never gets a prescription or a sick note. */
  for (const s of contract.surfaces.filter((x) => x.role === "nurse")) {
    for (const id of ["prescribe", "sick-note"]) {
      if (s.tools.includes(id)) fail(`the nurse's surface "${s.id}" lists "${tool(id).name}". On MyThuso a ${tool(id).name.toLowerCase()} is a doctor's.`);
      if (!(s.refused ?? []).some((r) => r.tool === id)) fail(`the nurse's surface "${s.id}" no longer says, where the doctor's tools would be, that "${tool(id).name}" is a doctor's.`);
    }
  }

  /* 4. Nothing started, nothing certified, for a patient nobody in the room examined. */
  for (const [id, refusal] of [["prescribe", "first-prescription-unseen"], ["sick-note", "certificate-from-a-call"]]) {
    const t = tool(id);
    if (!t?.decision) fail(`"${id}" is no longer marked a decision, so a dropped line would not hold it.`);
    const gate = (t.onCall ?? []).find((g) => g.refusal === refusal);
    const limit = gate && tele.clinicalLimits.find((l) => l.id === gate.limit);
    if (!limit || limit.needs !== "nurse") fail(`"${t.name}" on a call no longer waits for the nurse in the room with teleconsult.json's "${refusal}". ${tele.refusals.find((r) => r.id === refusal)?.sentence ?? ""}`);
  }

  /* 5. Honest, and evidenced. */
  const screen = uncommented(read(SCREEN));
  const nameOf = (evidence) => evidence.split("#");
  for (const t of contract.tools) {
    for (const [platform, evidence] of Object.entries(t.screens)) {
      if (evidence === null) continue;
      const [file, name] = nameOf(evidence);
      if (!exists(file)) fail(`the tool "${t.id}" names ${file} as its ${platform} screen, and there is no such file.`);
      const code = read(file);
      const declared = platform === "web" ? new RegExp(`export function ${name}\\b`) : platform === "ios" ? new RegExp(`struct ${name}\\b`) : new RegExp(`fun ${name}\\(`);
      if (!declared.test(code)) fail(`${file} declares no ${name}, which "${t.id}" names as its ${platform} screen.`);
      if (platform === "web" && t.honesty.drawnBy === "tool" && !(code.includes(`of="${t.honesty.capability}"`) || code.includes(`noticeFor('${t.honesty.capability}')`)))
        fail(`"${t.name}" says its screen draws the ${t.honesty.capability} notice, and ${file} draws none. Draw it, or say the toolkit draws it.`);
    }
    if (t.screens.web === null && !t.pending && t.honesty.drawnBy !== "toolkit") fail(`"${t.name}" opens no web screen and is not drawn by the toolkit or pending, so it would open to nothing.`);
    if (t.pending && t.honesty.drawnBy !== "toolkit") fail(`"${t.name}" is being built, so its own screen cannot draw its notice; the toolkit must.`);
    if (!t.pending && !new RegExp(`case '${t.id}'`).test(screen)) fail(`${SCREEN} opens nothing for "${t.id}".`);
  }
  if (!/drawnBy === 'toolkit' && <NotConnected of=\{tool\.honesty\.capability\}/.test(screen)) fail(`${SCREEN} no longer draws the notice of a tool whose own screen does not.`);
  if (!/stateOf\(/.test(screen) || !/state\.reason/.test(screen)) fail(`${SCREEN} no longer says why a shut tool is shut.`);

  /* 6. The short name is in the long one. */
  for (const item of [...contract.tools, ...contract.surfaces.map((s) => s.home)])
    if (!item.name.toLowerCase().includes(item.short.toLowerCase())) fail(`"${item.short}" is shown for "${item.name}", and is not part of it — a voice-control user saying what they see would not reach it.`);

  /* 7. The nurse sees the devices. */
  const liveSurfaces = live.surfaces ?? [];
  for (const s of contract.surfaces) {
    if (!s.tools.includes("devices")) fail(`the ${s.role}'s surface "${s.id}" does not list the patient's devices.`);
    if (!liveSurfaces.some((l) => l.id === s.id && l.role === s.role)) fail(`live-vitals.json does not name "${s.id}" among the places the ${s.role} sees the patient's devices.`);
  }
  if (!/<LiveVitalsPanel subject=\{patient\}/.test(screen)) fail(`${SCREEN} no longer draws the live panel beside the work when it is handed no other aside.`);
  if (!/import\(['"]\.\/LiveVitals['"]\)/.test(screen)) fail(`${SCREEN} no longer reaches the live board behind its dynamic import.`);
  const careVisit = uncommented(read("apps/web/src/features/CareVisit.tsx"));
  if (!/import\(['"]\.\/ConsultationToolkit['"]\)\.then\(m => \(\{ default: m\.VisitWithTools \}\)\)/.test(careVisit) || !/<VisitWithTools home=/.test(careVisit))
    fail(`apps/web/src/features/CareVisit.tsx no longer opens the nurse's toolkit beside her visit.`);
  if (!/surfaceFrom\('care-visit'\)/.test(careVisit)) fail(`apps/web/src/features/CareVisit.tsx no longer waits for the stage the contract names before showing the patient's devices.`);

  /* 8. Off the patient's first view, nothing stored, nothing moving. */
  for (const f of files("apps/web/src").filter((f) => /\.tsx?$/.test(f) && f !== SCREEN)) {
    const code = uncommented(read(f));
    if (/from\s+['"][./]*(?:features\/)?ConsultationToolkit['"]/.test(code)) fail(`${f} imports the toolkit statically. It arrives behind import('./ConsultationToolkit') only.`);
  }
  const importers = files("apps/web/src").filter((f) => /\.tsx?$/.test(f) && /import\(['"](?:\.\/|\.\.\/features\/)ConsultationToolkit['"]\)/.test(read(f)));
  if (importers.length < 3) fail(`the toolkit is reached from ${importers.length} dynamic imports; the call, the record and the visit each ask for it.`);
  for (const file of [SCREEN, LIB]) if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(read(file))) fail(`${file} names browser storage. The toolkit keeps nothing.`);
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, " ");
  const moving = css.match(/@keyframes|animation\s*:|transition\s*:/);
  if (moving) fail(`${CSS} moves something (${moving[0]}). A panel replaces the one before it; nothing slides in over a consultation.`);

  /* 9. One copy of each sentence. */
  const sentences = [...Object.values(contract.gates), ...Object.values(contract.words).filter((w) => w.length >= 20), ...contract.refusals.map((r) => r.sentence), ...contract.surfaces.flatMap((s) => (s.refused ?? []).map((r) => r.sentence)), ...contract.tools.map((t) => t.summary)];
  const readers = [SCREEN, LIB, "apps/web/src/features/Teleconsult.tsx", "apps/web/src/features/CareVisit.tsx", IOS_VIEW, KT_VIEW, IOS_MODEL, KT_MODEL].filter(exists);
  for (const file of readers) {
    const code = read(file);
    for (const s of sentences) { const head = s.slice(0, 48); if (code.includes(head)) fail(`${file} types "${head}…", a sentence ${SOURCE} holds. Read it from the contract.`); }
  }

  /* 10. The phones say the same. */
  for (const [file, needs] of [[IOS_VIEW, ["Toolkit.surface(surfaceId)", "surface.refused", "Gates.notOnThisPhone", "CapabilityNotice(of: tool.honesty)", "Words.rulesHeading"]], [KT_VIEW, ["ConsultationToolkit.surface(surfaceId)", "surface.refused", "Gates.notOnThisPhone", "NotConnected(tool.honesty)", "Words.rulesHeading"]]]) {
    if (!exists(file)) fail(`${file} is missing; the phones draw the same toolkit.`);
    const code = read(file);
    for (const w of needs) if (!code.includes(w)) fail(`${file} no longer reads ${w}.`);
  }
  for (const file of [IOS_VISIT, KT_VISIT]) {
    const code = uncommented(read(file));
    if (!/LiveVitalsPanel\(subject/.test(code)) fail(`${file} no longer shows the nurse the patient's devices in her visit.`);
    if (!/care-visit/.test(code)) fail(`${file} no longer opens the nurse's toolkit.`);
  }

  return `The consultation toolkit · ${contract.tools.length} tools on ${contract.surfaces.length} surfaces, each capability the register's and each notice drawn by its screen or the toolkit; no role offered what it is never granted and none refused what it holds; no nurse surface with a prescription or a sick note, both said to be a doctor's; neither started on a call for a patient nobody in the room examined; every short name inside its long one; the devices on every surface and the live panel beside the nurse's visit; behind ${importers.length} dynamic imports, nothing stored, nothing moving, no sentence typed twice; both phones reading the same contract.`;
}
