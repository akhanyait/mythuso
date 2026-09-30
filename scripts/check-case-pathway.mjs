/* The case pathway — 29 September 2026. The founder's demonstration: a headache, linked by the knowledge
   base to raised blood pressure, gathered by GilbertOne, suggested for a nurse, confirmed by her, handed to
   a doctor, and the plan read back to the patient in the doctor's words. This holds every piece of it to
   what it is allowed to be — a draft pathway that suggests and a nurse confirms, never triage — and is a
   module of its own so each check can be proven to fire by handing it a broken file through `read`
   (scripts/prove-case-pathway.mjs does exactly that). scripts/check-boundaries.mjs calls it with the same
   `read`, `files`, `stems` and `hasSequence` it uses everywhere else.

   WHAT IS HELD.
   1. The headache questions are derived from the knowledge base: questionsFrom is exactly the entries that
      list headache, every question draws on one of them or says why it is kept with none, every entry is
      drawn on, and no question or option carries an emergency feature or an emergency term.
   2. case.json is under Clinical, decided by the founder, says what it is not, and is keyed nowhere as the
      thing triage decides. Its pathway is a registered draft whose contentRef points back here; its bands
      are citations; its rules name declared settings, mapped one-to-one onto clinical.json's outcomes,
      and the first rule is the emergency words. Every feature is a real option of a real question, word
      for word; every finding names a condition that lists headache and is worded consistent-with.
   3. A home cuff and a simulator never carry weight — by devices.json's own classes — and the web asks the
      Devices domain rather than deciding. The patient's card is drawn from a view with the findings and
      the suggestion removed, and the panel never names either. A nurse's decision is made from her press
      on the case screen and nowhere else. The draft banner is on both clinicians' screens.
   4. The four events, the three routes, the generator, the journey, the demo script and the map row. */

const TRIAGE_KEYS = ["priority", "urgency", "disposition", "diagnosis", "triage", "timeToTreat", "score"];

export function checkCasePathway({ read, files, stems, hasSequence, existsSync }) {
  const fail = (why) => { throw new Error(`Case pathway: ${why}`); };
  const CASE = "packages/catalog/case.json";
  const INTAKE = "packages/catalog/symptom-intake.json";
  const contract = JSON.parse(read(CASE));
  const intake = JSON.parse(read(INTAKE));
  const conditions = JSON.parse(read("packages/catalog/knowledge/conditions.json"));
  const clinical = JSON.parse(read("packages/catalog/clinical.json"));
  const devices = JSON.parse(read("packages/catalog/devices.json"));
  const protocols = JSON.parse(read("packages/catalog/protocols.json"));
  const records = JSON.parse(read("packages/catalog/records.json"));
  const events = JSON.parse(read("packages/catalog/events.json"));
  const api = JSON.parse(read("packages/catalog/apis/clinical.json"));
  const terms = JSON.parse(read("packages/catalog/gilbert-emergency-terms.json"));
  const lower = (s) => String(s).toLowerCase();

  /* ---- 1. The knowledge-linked questions ------------------------------------------------------------- */
  const groups = intake.groups.filter((g) => g.questionsFrom !== undefined);
  if (groups.length !== 1 || groups[0].id !== "headache")
    fail(`${INTAKE} derives ${groups.map((g) => g.id).join(", ") || "no group"} from the knowledge base; the headache group is the one pathway, and only it carries questionsFrom.`);
  const headache = groups[0];
  if (!headache.questionsFromWhy) fail(`${INTAKE}'s headache group has lost questionsFromWhy.`);
  /* An entry lists headache when its symptoms, its title or its tags say so: tension headache names it in
     the title and the tags and describes it as band-like pressure in the symptoms. */
  const listsHeadache = conditions.filter((c) => [c.title, ...(c.symptoms ?? []), ...(c.tags ?? [])].some((s) => /headache/i.test(s))).map((c) => c.id).sort();
  if (JSON.stringify([...headache.questionsFrom].sort()) !== JSON.stringify(listsHeadache))
    fail(`${INTAKE}'s headache questionsFrom is [${headache.questionsFrom.join(", ")}] and the entries in conditions.json that list headache are [${listsHeadache.join(", ")}]. The questions are derived from every entry that lists the complaint, and from no other.`);
  const drawnOn = new Set();
  for (const q of headache.questions) {
    const draws = Array.isArray(q.drawsOn) ? q.drawsOn : null;
    if (draws && draws.length) {
      for (const id of draws) {
        if (!headache.questionsFrom.includes(id)) fail(`${INTAKE}'s headache question "${q.id}" draws on ${id}, which questionsFrom does not name.`);
        drawnOn.add(id);
      }
      if (q.keptBecause) fail(`${INTAKE}'s headache question "${q.id}" both draws on an entry and says why it is kept without one.`);
    } else if (typeof q.keptBecause !== "string" || q.keptBecause.length < 40)
      fail(`${INTAKE}'s headache question "${q.id}" names no source condition. Every derived question names the entries it draws on, or says in keptBecause why the base has none — for the reviewer, who is asked whether it stays.`);
  }
  for (const id of headache.questionsFrom)
    if (!drawnOn.has(id)) fail(`${INTAKE}'s headache group names ${id} in questionsFrom and no question draws on it. A source no question distinguishes is a citation, not a derivation.`);
  /* Never questions: the case contract's emergency features and the emergency terms, as stems in sequence. */
  const forbidden = [
    ...contract.findings.emergencyFeatures.list.map((f) => stems(f)),
    ...terms.groups.flatMap((g) => g.words.map((w) => stems(w))),
  ].filter((s) => s.length);
  for (const q of headache.questions)
    for (const text of [q.ask, ...(q.options ?? [])]) {
      const said = stems(text);
      const hit = forbidden.find((f) => hasSequence(said, f, 0));
      if (hit) fail(`${INTAKE}'s headache question "${q.id}" says "${text}", which carries the emergency feature "${hit.join(" ")}". Emergency features are never questions: an answer that names one is answered by the emergency words before the intake reads it.`);
    }
  if (!Array.isArray(contract.findings.emergencyFeatures.list) || contract.findings.emergencyFeatures.list.length < 5)
    fail(`${CASE} lists fewer than five emergency features (stiff neck, a rash that does not fade, weakness on one side, confusion, the worst headache ever).`);

  /* ---- 2. The contract ---------------------------------------------------------------------------------- */
  if (contract.engine !== "clinical" || !/founder/i.test(String(contract.decidedBy)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(contract.on)) || !contract.why)
    fail(`${CASE} has lost its engine, who decided it, when, or why.`);
  if (!Array.isArray(contract.whatItIsNot) || contract.whatItIsNot.length < 4 || !contract.whatItIsNot.some((s) => /not triage/i.test(s)))
    fail(`${CASE} no longer says what it is not, starting with triage.`);
  const walk = (node, path) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === "object")
      for (const [key, value] of Object.entries(node)) {
        if (TRIAGE_KEYS.some((k) => k.toLowerCase() === key.toLowerCase()))
          fail(`${CASE} carries a key named "${key}" at ${path}. A case suggests and a nurse decides: nothing in it is keyed as a priority, an urgency, a disposition, a diagnosis, a triage or a score.`);
        walk(value, `${path}.${key}`);
      }
  };
  walk(contract, "case");
  /* The pathway is a registered draft whose contentRef points back here, and the banner names it. */
  const [pathwayId, pathwayVersion] = String(contract.pathway.protocolVersionId).split("@");
  const row = protocols.protocols.find((p) => p.id === pathwayId && String(p.version) === pathwayVersion);
  if (!row) fail(`${CASE}'s pathway names ${contract.pathway.protocolVersionId}, which packages/catalog/protocols.json does not register.`);
  if (row.status !== "draft" || row.contentRef !== `${CASE}#pathway` || row.engine !== "clinical")
    fail(`${CASE}'s pathway ${contract.pathway.protocolVersionId} is registered as "${row.status}" on ${row.engine} with contentRef ${JSON.stringify(row.contentRef)}. It is a Clinical draft whose contentRef is ${CASE}#pathway, and nothing else: protocols.json refuses a seeded sign-off.`);
  if (clinical.triage.triageProtocols.ids.includes(pathwayId)) fail(`clinical.json names ${pathwayId} as a triage protocol. The pathway is not triage and may never be borrowed as one.`);
  if (!/\{protocol\}/.test(contract.banner.draft) || !/draft/i.test(contract.banner.draft) || !/nurse decides/i.test(contract.banner.draft))
    fail(`${CASE}'s draft banner has lost its {protocol} token, the word draft, or the sentence that a nurse decides.`);
  /* The bands cite. */
  const bands = contract.pathway.bands;
  if (bands["in-range"]?.from !== "packages/catalog/records.json#observations.measures" || JSON.stringify(bands["in-range"].measures) !== JSON.stringify(["systolic", "diastolic"]))
    fail(`${CASE}'s in-range band no longer cites records.json#observations.measures for systolic and diastolic.`);
  const cited = String(bands["very-high"]?.from ?? "");
  const veryHigh = /^packages\/catalog\/knowledge\/conditions\.json#(cond-\d{3})\.whenToSeeDoctor$/.exec(cited);
  if (!veryHigh || !headache.questionsFrom.includes(veryHigh[1])) fail(`${CASE}'s very-high band cites "${cited}", which is not a whenToSeeDoctor sentence of an entry the headache questions draw on.`);
  const sentence = conditions.find((c) => c.id === veryHigh[1])?.whenToSeeDoctor ?? "";
  if ((sentence.match(/(?<![a-z0-9])\d{2,3}\s*\/\s*\d{2,3}(?![a-z0-9])/gi) ?? []).length !== 1)
    fail(`${veryHigh[1]}'s whenToSeeDoctor no longer carries exactly one top-over-bottom pair, so the very-high line cannot be read out of it.`);
  for (const id of ["systolic", "diastolic"]) if (!records.observations.measures.some((m) => m.id === id)) fail(`records.json has no observation "${id}".`);
  /* The settings map one-to-one onto clinical.json's outcomes; the rules name them and the features' kinds. */
  const settings = contract.settings.kinds.map((k) => k.code);
  const outcomes = clinical.guidance.outcomes.map((o) => o.code);
  const mapped = contract.settings.kinds.map((k) => k.guidanceOutcomeCode);
  if (JSON.stringify([...mapped].sort()) !== JSON.stringify([...outcomes].sort()))
    fail(`${CASE}'s settings map onto [${mapped.join(", ")}]; clinical.json's four outcomes are [${outcomes.join(", ")}]. Each setting is one outcome and every outcome is reached.`);
  const kinds = new Set(contract.features.list.flatMap((f) => f.kinds));
  const featureIds = new Set(contract.features.list.map((f) => f.id));
  const rules = contract.pathway.rules.order;
  if (!rules.length || rules[0].when?.emergency !== true || rules[0].settingCode !== "emergency")
    fail(`${CASE}'s first rule is not the emergency words. The emergency answer was given first and nothing after it may lower it.`);
  for (const rule of [...rules, contract.pathway.rules.fallback]) {
    if (!settings.includes(rule.settingCode)) fail(`${CASE}'s rule "${rule.id}" suggests "${rule.settingCode}", which settings.kinds does not declare.`);
    if (!rule.reason) fail(`${CASE}'s rule "${rule.id}" has no reason in words.`);
    if (/\d/.test(rule.reason)) fail(`${CASE}'s rule "${rule.id}" types a number in its reason.`);
    const when = rule.when ?? {};
    if (when.anyFeatureKind && !kinds.has(when.anyFeatureKind)) fail(`${CASE}'s rule "${rule.id}" asks for the feature kind "${when.anyFeatureKind}", which no feature has.`);
    for (const id of when.allFeatures ?? []) if (!featureIds.has(id)) fail(`${CASE}'s rule "${rule.id}" asks for the feature "${id}", which features.list does not declare.`);
    for (const band of when.band ?? []) if (!["in-range", "above", "below", "very-high", "none"].includes(band)) fail(`${CASE}'s rule "${rule.id}" names the band "${band}".`);
  }
  if (!rules.some((r) => r.settingCode === "home-visit") || !rules.some((r) => r.settingCode === "online") || !rules.some((r) => r.settingCode === "self-care"))
    fail(`${CASE}'s rules no longer reach a home visit, a video consultation and self-care.`);
  /* Every feature is a chips option of a real question, word for word. */
  const questionsById = new Map([...intake.common.questions, ...headache.questions].map((q) => [q.id, q]));
  for (const f of contract.features.list) {
    const q = questionsById.get(f.questionId);
    if (!q || q.kind !== "chips") fail(`${CASE}'s feature "${f.id}" is set by the question "${f.questionId}", which is not a chips question the headache intake asks.`);
    for (const option of f.options) if (!q.options.includes(option)) fail(`${CASE}'s feature "${f.id}" is set by "${option}", which is not an option of "${f.questionId}" word for word. A feature is a chip the patient pressed, never a reading of free text.`);
    if (!f.label || /\d/.test(f.label)) fail(`${CASE}'s feature "${f.id}" has no label in words, or types a number.`);
  }
  if (!contract.features.list.some((f) => f.kinds.includes("red-flag")) || !contract.features.list.some((f) => f.kinds.includes("blood-pressure")) || !contract.features.list.some((f) => f.kinds.includes("pattern")))
    fail(`${CASE}'s features no longer carry a red-flag, a blood-pressure and a pattern kind, which the rules read.`);
  /* Every finding: consistent with, never you have, and only conditions that list headache behind it. */
  if (!/consistent with/i.test(contract.findings.sentence) || !/for a clinician to confirm/i.test(contract.findings.sentence) || !/\{pattern\}/.test(contract.findings.sentence) || !/\{features\}/.test(contract.findings.sentence))
    fail(`${CASE}'s findings sentence is not the consistent-with form with {pattern} and {features}. ${clinical.wording.patientDiagnosis.rule}`);
  for (const rule of contract.findings.rules) {
    if (!rule.conditionIds?.length) fail(`${CASE}'s finding "${rule.id}" names no condition behind it.`);
    for (const id of rule.conditionIds) if (!headache.questionsFrom.includes(id)) fail(`${CASE}'s finding "${rule.id}" names ${id}, which does not list headache in conditions.json.`);
    for (const id of [...rule.anyOf, ...(rule.noneOf ?? [])]) if (!featureIds.has(id)) fail(`${CASE}'s finding "${rule.id}" reads the feature "${id}", which features.list does not declare.`);
    if (!Number.isInteger(rule.atLeast) || rule.atLeast < 1 || rule.atLeast > rule.anyOf.length) fail(`${CASE}'s finding "${rule.id}" needs ${rule.atLeast} of ${rule.anyOf.length} features.`);
    if (/\d/.test(rule.pattern) || /^(you|the patient) (have|has)/i.test(rule.pattern)) fail(`${CASE}'s finding "${rule.id}" is worded "${rule.pattern}".`);
  }
  for (const phrase of clinical.wording.patientDiagnosis.phrases)
    if (lower(JSON.stringify(contract)).includes(phrase)) fail(`${CASE} says "${phrase}". ${clinical.wording.patientDiagnosis.rule}`);
  const patient = contract.screens.patient;
  for (const key of ["heading", "readingOffer", "readingAsk", "readingSourceAsk", "readingUnread", "skipWord", "skipLabel", "askNurseLead", "askNurse", "notNow", "notNowSaid", "opened", "neverShown", "planHeading", "planLead", "planNone", "planNoCase", "planClose"])
    if (typeof patient[key] !== "string" || !patient[key].trim()) fail(`${CASE}'s patient screen has lost "${key}".`);
  for (const state of contract.states.map((s) => s.code).filter((c) => c !== "gathering"))
    if (typeof patient.who[state] !== "string") fail(`${CASE}'s patient screen has no who-has-it sentence for the state "${state}".`);
  for (const [key, value] of Object.entries(patient)) if (typeof value === "string" && /\d/.test(value)) fail(`${CASE}'s patient sentence "${key}" carries a digit.`);
  if (!/not a diagnosis/i.test(patient.neverShown) || !/nurse/i.test(patient.neverShown)) fail(`${CASE}'s neverShown sentence no longer says that what GilbertOne noticed is for the nurse and that a pattern is not a diagnosis.`);
  /* Readings: sources are devices.json's, and the two a patient may name never carry weight by that file's classes. */
  const sourceIds = new Set(devices.sources.map((s) => s.id));
  const classById = new Map(devices.deviceClasses.map((c) => [c.id, c]));
  for (const role of ["patient", "nurse"]) for (const id of contract.readings.sources[role]) if (!sourceIds.has(id)) fail(`${CASE} lets a ${role} name the source "${id}", which devices.json does not declare.`);
  for (const [source, cls] of Object.entries(contract.readings.classBySource)) {
    if (!sourceIds.has(source) || !classById.has(cls)) fail(`${CASE} gives the source "${source}" the class "${cls}", one of which devices.json does not declare.`);
    if (!devices.sources.find((s) => s.id === source).classes.includes(cls)) fail(`${CASE} gives the source "${source}" the class "${cls}", which devices.json does not allow for it.`);
  }
  for (const source of contract.readings.sources.patient)
    if (classById.get(contract.readings.classBySource[source])?.carriesClinicalWeight !== false)
      fail(`${CASE} lets a patient name the source "${source}", whose class carries clinical weight. A patient's own reading, and a simulated one, never do.`);
  if (classById.get(contract.readings.classBySource.simulator)?.carriesClinicalWeight !== false) fail(`${CASE}'s simulator class carries weight.`);
  for (const [source, q] of Object.entries(contract.readings.qualityBySource)) if (!devices.qualities.some((x) => x.id === q)) fail(`${CASE} gives "${source}" the sample quality "${q}", which devices.json does not declare.`);
  for (const [source, u] of Object.entries(contract.readings.intendedUseBySource)) if (!devices.intendedUses.some((x) => x.id === u)) fail(`${CASE} gives "${source}" the intended use "${u}", which devices.json does not declare.`);
  if (!Number.isInteger(contract.readings.trendNeeds) || contract.readings.trendNeeds < 3) fail(`${CASE} draws a trend through fewer than three readings.`);
  /* Events and routes. */
  if (!events.sources.includes(CASE)) fail(`events.json does not list ${CASE} among its sources, so the four case events are declared nowhere the bus reads.`);
  const declaredEvents = contract.events.map((e) => `${e.type}@${e.version}`);
  for (const key of ["case.opened@1", "case.setting_decided@1", "case.handed_over@1", "case.closed@1"])
    if (!declaredEvents.includes(key)) fail(`${CASE} no longer declares ${key}.`);
  for (const e of contract.events) if (e.owner !== "clinical") fail(`${CASE}'s event ${e.type} is owned by ${e.owner}; the case is Clinical's.`);
  const lock = read("packages/catalog/events.lock");
  for (const key of declaredEvents) if (!lock.split("\n").some((l) => l.startsWith(`${key} `))) fail(`${key} has no line in events.lock.`);
  const routes = new Map(api.routes.filter((r) => !r.withdrawn).map((r) => [`${r.method} ${r.path}@${r.version}`, r]));
  for (const key of ["POST /v1/clinical/cases@1", "GET /v1/clinical/cases/{caseRef}@1", "POST /v1/clinical/cases/{caseRef}/setting@1"]) {
    const r = routes.get(key);
    if (!r) fail(`packages/catalog/apis/clinical.json no longer declares ${key}.`);
    if (!r.refusals?.length) fail(`${key} declares no refusal.`);
    if (r.status === "built" && !r.evidence?.file) fail(`${key} says built with no handler as evidence.`);
    if (r.status !== "built" && r.status !== "proposed") fail(`${key} has the status "${r.status}".`);
  }
  if (JSON.stringify(routes.get("POST /v1/clinical/cases/{caseRef}/setting@1").callers) !== JSON.stringify(["nurse"]))
    fail("POST /v1/clinical/cases/{caseRef}/setting@1 is called by somebody other than a nurse. The nurse decides where the patient is seen; software and the patient do not.");
  if (!routes.get("GET /v1/clinical/cases/{caseRef}@1").refusals.some((x) => x.id === "findings-are-a-clinicians"))
    fail("GET /v1/clinical/cases/{caseRef}@1 no longer refuses to return the findings and the suggestion to a patient.");
  if (!routes.get("POST /v1/clinical/cases@1").emits.includes("case.opened@1") || !routes.get("POST /v1/clinical/cases/{caseRef}/setting@1").emits.includes("case.setting_decided@1"))
    fail("The case routes no longer emit case.opened@1 and case.setting_decided@1.");
  if (!api.resources.includes("cases")) fail("packages/catalog/apis/clinical.json does not list cases as a resource.");

  /* ---- 3. The web ---------------------------------------------------------------------------------------- */
  const libFile = "apps/web/src/lib/case.ts";
  const screenFile = "apps/web/src/features/CaseFile.tsx";
  const assistantLib = "apps/web/src/lib/assistant.ts";
  const panelFile = "apps/web/src/features/Assistant.tsx";
  const generated = "apps/web/src/lib/case-pathway.generated.ts";
  for (const f of [libFile, screenFile, generated, "apps/web/src/features/case.css", "scripts/emit-case.mjs"]) if (!existsSync(f)) fail(`${f} is missing.`);
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const lib = strip(read(libFile)); const screen = strip(read(screenFile)); const alib = strip(read(assistantLib)); const panel = strip(read(panelFile));
  if (/knowledge\/conditions\.json/.test(lib + screen + alib + panel)) fail("The web imports the knowledge base. It reads the very-high line and the titles from case-pathway.generated.ts, written by scripts/emit-case.mjs.");
  if (!/from '\.\/case-pathway\.generated'/.test(lib) || !/veryHighLine\.systolic/.test(lib)) fail(`${libFile} no longer reads the very-high line from the generated file.`);
  if (!/clinicalUseOf\(/.test(lib) || /weight:\s*['"]clinical['"]/.test(lib)) fail(`${libFile} decides a reading's weight itself. It asks the Devices domain's clinicalUseOf and never sets weight to clinical.`);
  if (/\b\d{2,3}\s*\/\s*\d{2,3}\b/.test(lib + screen)) fail("The web types a blood-pressure pair.");
  /* The patient's card: drawn from patientView(), and the panel never names a finding or the suggestion. */
  if (!/export function patientView\(/.test(lib) || !/findings: _findings, features: _features, suggestion: _suggestion, \.\.\.rest/.test(lib))
    fail(`${libFile}'s patientView no longer strips the findings, the features and the suggestion.`);
  if (!/patientView,/.test(alib) || /caseById/.test(alib)) fail(`${assistantLib} reaches the case other than through patientView.`);
  if (/\.findings|\.suggestion|\.features|caseById|draftBanner/.test(panel)) fail(`${panelFile} names a finding, a feature, the suggestion or the pathway. The patient sees her answers, her reading and who has the case, and nothing else.`);
  if (!/caseScreens\.neverShown/.test(panel)) fail(`${panelFile} no longer reads the sentence saying what the patient is not shown.`);
  /* The nurse decides from her press, the doctor closes from hers; nothing else calls either. */
  const callers = (name) => files("apps/web/src").filter((f) => /\.tsx?$/.test(f) && strip(read(f)).includes(`${name}(`) && f !== libFile);
  if (JSON.stringify(callers("decideSetting")) !== JSON.stringify([screenFile])) fail(`decideSetting() is called from ${callers("decideSetting").join(", ") || "nowhere"}. A nurse decides where the patient is seen from the case screen, and nothing else decides it.`);
  if (JSON.stringify(callers("closeCase")) !== JSON.stringify([screenFile])) fail(`closeCase() is called from ${callers("closeCase").join(", ") || "nowhere"}. A doctor closes a case by signing on the case screen, and nothing else closes it.`);
  if (JSON.stringify(callers("openCase")) !== JSON.stringify([assistantLib])) fail(`openCase() is called from ${callers("openCase").join(", ") || "nowhere"}. A case opens when the patient asks for a nurse in GilbertOne, and nowhere else.`);
  if (!/said === stems\(caseScreens\.askNurse\)\.join\(" "\)/.test(alib)) fail(`${assistantLib} opens a case on something other than the patient's own "ask a nurse" chip.`);
  if (!/decideSetting\(c\.caseRef, c\.suggestion\.settingCode\)/.test(screen) || !/decideSetting\(c\.caseRef, setting, reason\)/.test(screen)) fail(`${screenFile} no longer confirms and overrides from two presses.`);
  if (!/const DraftBanner = /.test(screen) || (screen.match(/<DraftBanner\/>/g) ?? []).length !== 1 || !/function CaseFileBody/.test(screen) || !/<CaseFileBody c=\{c\}\/>/.test(screen) || !/<CaseFileBody c=\{c\} trend\/>/.test(screen))
    fail(`${screenFile} no longer draws the draft banner on the case file both clinicians read.`);
  if (!/patientWording\.rule/.test(screen)) fail(`${screenFile} no longer shows the wording rule beside the findings.`);
  if (!/kitWords\.carries\b/.test(screen) || !/kitWords\.carriesNot/.test(screen)) fail(`${screenFile} no longer says, in devices.json's words, whether a reading carries clinical weight.`);
  if (/localStorage|sessionStorage|indexedDB/.test(lib + screen)) fail("The case reaches for browser storage.");
  /* Nothing typed: no sentence of the contract in the web files. */
  const sentences = [];
  const collect = (node) => { if (typeof node === "string") { if (node.length > 12 && /[a-z]/.test(node)) sentences.push(node); } else if (node && typeof node === "object") Object.values(node).forEach(collect); };
  collect(contract.screens); collect(contract.banner); sentences.push(contract.findings.sentence, ...contract.pathway.rules.order.map((r) => r.reason));
  for (const [file, source] of [[libFile, lib], [screenFile, screen], [assistantLib, alib], [panelFile, panel]])
    for (const s of sentences) if (source.includes(s)) fail(`${file} types "${s.slice(0, 50)}…", a sentence of ${CASE} it should be reading.`);
  /* The nurse's section, the doctor's door, the platforms. */
  /* Since 30 September 2026 each role's sections are items in labelled groups, so the item is looked for inside the
     nurse's own entry of the table (from `Nurse:` to the next role) — a Cases row under the doctor is not hers — and
     it may carry `tab: true`, which only says a phone's tab bar holds it. */
  const staffShell = read("apps/web/src/shells/StaffShell.tsx");
  const nurseTable = staffShell.match(/\n Nurse: \{ subjectId: [^\n]*groups: \[([\s\S]*?)\n Doctor: \{/)?.[1] ?? "";
  if (!/\{ id: 'Cases', short: 'Cases', icon: FolderOpen(?:, tab: true)? \}/.test(nurseTable) || !/section === 'Cases'/.test(staffShell))
    fail("The nurse's workspace has no Cases section.");
  if (!/lazy\(\(\) => import\('\.\.\/features\/CaseFile'\)/.test(read("apps/web/src/shells/StaffShell.tsx")) || !/lazy\(\(\) => import\('\.\/CaseFile'\)/.test(read("apps/web/src/features/ClinicalIntelligence.tsx")))
    fail("The case file is imported statically into a chunk the patient's first view names. It arrives on a dynamic import, from the nurse's Cases and the doctor's inbox.");
  if (!/isCase\(row\.appointmentRef\)/.test(read("apps/web/src/features/ClinicalIntelligence.tsx"))) fail("The doctor's inbox no longer opens a case from its row.");
  if (JSON.stringify(contract.platforms) !== JSON.stringify(["web"])) fail(`${CASE} lists platforms other than the web while no phone renders a case.`);
  /* The generated event constants name case.json in their banner because it is one of the bus's sources;
     that is the events generator's, not a screen. Anything else on a phone naming the case is refused. */
  for (const dir of ["apps/ios/MyThuso", "apps/android/app/src/main"])
    for (const f of files(dir).filter((f) => /\.(swift|kt)$/.test(f) && !/EventsData\.(swift|kt)$/.test(f)))
      if (/CasePathway|case\.json|CaseFile/.test(read(f))) fail(`${f} names the case pathway, and ${CASE}'s platforms does not list its platform.`);

  /* ---- 4. The journey, the demo script, the review pack and the map ------------------------------------- */
  const spec = "tests/case-pathway.spec.ts";
  if (!existsSync(spec) || !/case\.json/.test(read(spec)) || !/speechSynthesis/.test(read(spec)) || !/chooseRole\(page, 'Nurse'\)/.test(read(spec)) || !/chooseRole\(page, 'Doctor'\)/.test(read(spec)))
    fail(`${spec} is missing, does not read ${CASE}, does not stand the browser's voice down, or does not walk the nurse and the doctor in the same tab.`);
  const demo = "docs/governance/CASE-PATHWAY-DEMO.md";
  if (!existsSync(demo) || !/168 over 104/.test(read(demo)) || !/draft/i.test(read(demo))) fail(`${demo} is missing, or no longer scripts the home-cuff pair or says the pathway is a draft.`);
  if (!/Draws on/.test(read("docs/governance/CLINICAL-REVIEW-PACK.md"))) fail("docs/governance/CLINICAL-REVIEW-PACK.md's F4 no longer prints the derivation. Run: npm run review-pack");
  if (!/case\.json/.test(read("docs/FEATURE-MAP.md")) || !/case-pathway\.spec\.ts/.test(read("docs/FEATURE-MAP.md"))) fail("docs/FEATURE-MAP.md has no row for the case pathway.");

  return `Case pathway · the headache group derived from ${headache.questionsFrom.length} knowledge-base entries, ${headache.questions.length} questions each drawing on one or saying why not, none carrying an emergency feature; ${contract.features.list.length} features that are chips word for word, ${contract.findings.rules.length} findings in the consistent-with form naming only conditions that list headache; ${rules.length} rules onto ${settings.length} settings mapped one-to-one onto clinical.json's outcomes, the emergency words first; ${contract.pathway.protocolVersionId} a registered draft that cites and types no number; a home cuff and the simulator weightless by devices.json's classes; the patient's card from patientView() and the panel naming no finding; a nurse's decision and a doctor's close each from one screen; 4 events, 3 routes, the journey, the demo script and the map row.`;
}
