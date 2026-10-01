/* Show GilbertOne a rash — 1 October 2026. The founder's ask: take a picture of a skin rash, give
   information about what the issue might be, and say whether a sister should see it or how to look after
   it. Built as intake plus general information, because GilbertOne does symptom intake and not triage,
   and because nothing in this build may read a photo of somebody's skin. This holds every piece of it to
   what it is allowed to be, and is a module of its own so each check can be proven to fire by handing it
   a broken file through `read` (scripts/prove-skin-check.mjs does exactly that). scripts/check-boundaries.mjs
   calls it with the same `read`, `stems` and `hasSequence` it uses everywhere else.

   WHAT IS HELD.
   1. The contract says what it is not, has nobody's signature it was not given, and addresses the patient
      with no digit and no sentence that tells her what she has.
   2. The outcomes are decided by the contract's rules and nothing else. An emergency rule names one
      option whose own words the existing emergency terms raise, and no other option or question raises
      them; a rule for today reads the knowledge base back or says why it cannot; general information
      never names a single entry; every entry named exists, and every new one says nobody has reviewed it.
   3. The photo is held and never read or sent: no video, no capture attribute, no storage, no request, no
      reader of its bytes on the web; no save, no file, no camera permission on either phone; every object
      URL revoked. The photo reader is declared and refused everywhere, with no route behind it.
   4. The screens say only the contract's words and show the review state, decide nothing themselves, hand
      an emergency to the conversation's own answer, and arrive on the web behind a dynamic import.
   5. The generator, its registrations, the journey and the map row. */

const SKIN = "packages/catalog/skin-check.json";
const WEB_SCREEN = "apps/web/src/features/SkinCheck.tsx";
const WEB_LIB = "apps/web/src/lib/skin-check.ts";
const SHARED = "packages/gilbertone/src/skin-check.ts";
const PANEL = "apps/web/src/features/Assistant.tsx";
const IOS_VIEW = "apps/ios/MyThuso/Features/SkinCheckView.swift";
const IOS_MODEL = "apps/ios/MyThuso/Models/SkinCheck.swift";
const ANDROID_SCREEN = "apps/android/app/src/main/java/za/co/mythuso/ui/SkinCheckScreens.kt";
const ANDROID_MODEL = "apps/android/app/src/main/java/za/co/mythuso/model/SkinCheck.kt";
const TELLS_HER = /\b(you have|you've got|you’ve got|you have got|your (rash|skin) is (a|an)\b|diagnos\w*)/i;

export function checkSkinCheck({ read, stems, hasSequence, existsSync }) {
  const fail = (why) => { throw new Error(`Skin check: ${why}`); };
  const contract = JSON.parse(read(SKIN));
  const conditions = JSON.parse(read("packages/catalog/knowledge/conditions.json"));
  const firstAid = JSON.parse(read("packages/catalog/knowledge/first-aid.json"));
  const terms = JSON.parse(read("packages/catalog/gilbert-emergency-terms.json"));
  const assistant = JSON.parse(read("packages/catalog/assistant.json"));
  const apis = JSON.parse(read("packages/catalog/apis/assistant.json"));
  const strip = (source) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const raises = (text) => {
    const said = stems(text);
    return terms.groups.some((g) => g.words.some((w) => hasSequence(said, stems(w), assistant.matcher.maxGap)));
  };

  /* ---- 1. What the contract is and how it speaks ---------------------------------------------------- */
  if (!/founder/i.test(String(contract.decidedBy)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(contract.on)) || !contract.why)
    fail(`${SKIN} has lost who decided it, when, or why.`);
  if (!Array.isArray(contract.whatItIsNot) || !contract.whatItIsNot.some((s) => /does not look at your photo/i.test(s)) || !contract.whatItIsNot.some((s) => /only a nurse or doctor who sees it/i.test(s)))
    fail(`${SKIN} no longer says, on the screen, that nothing looks at the photo and that only a nurse or doctor who sees it can say what it is.`);
  if (contract.review?.reviewedBy !== null || contract.review?.status !== "awaiting-clinical-review" || !contract.review?.unreviewed)
    fail(`${SKIN} names a reviewer or has lost its unreviewed sentence. No clinician has read these questions, rules or entries; a name here is a claim of clinical review the product cannot make, and when one signs, this check changes in the same commit.`);
  if (JSON.stringify(contract.platforms) !== JSON.stringify(["web", "ios", "android"]))
    fail(`${SKIN} says it renders on ${JSON.stringify(contract.platforms)}. It is built on all three platforms, and each is held below.`);
  /* Everything addressed to the patient, walked: no digit (a number lives in one other place), and nothing
     that tells her what she has. The reasoning, the ids and the references are not addressed to her. */
  const NOT_SAID = new Set(["_note", "why", "rule", "exclusiveWhy", "requiredWhy", "rulesWhy", "maxShownWhy", "tooLargeWhy", "tooLargeFrom", "routeWhy", "sendFrom", "keptBecause", "accept", "platforms", "fixtures", "changelog", "id", "question", "anyOf", "oftenSeenIn", "checkFirst", "drawsOn", "outcome", "kind", "exclusive", "required", "status", "decidedBy", "on", "version", "route", "always", "forCondition", "everywhere", "inPlace", "reviewedBy", "emergencyHandsTo", "why"]);
  const said = [];
  const walk = (node, path) => {
    if (typeof node === "string") said.push([path, node]);
    else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === "object")
      for (const [key, value] of Object.entries(node)) if (!NOT_SAID.has(key)) walk(value, `${path}.${key}`);
  };
  walk(contract, "skin-check");
  for (const [path, text] of said) {
    if (/\d/.test(text)) fail(`${SKIN} says "${text}" at ${path}, which carries a digit. A sentence the patient reads names no number: an age, a size or a telephone number each lives in one other contract or is written in words.`);
    if (TELLS_HER.test(text)) fail(`${SKIN} says "${text}" at ${path}. Nothing addressed to the patient tells her what she has: rashes like hers are often one of several things, and only a nurse or doctor who sees it can say.`);
  }
  /* And clinical.json's own list of phrases the build refuses in any patient-facing sentence, anywhere in the file. */
  const wording = JSON.parse(read("packages/catalog/clinical.json")).wording.patientDiagnosis;
  for (const phrase of wording.phrases)
    if (JSON.stringify(contract).toLowerCase().includes(phrase)) fail(`${SKIN} says "${phrase}". ${wording.rule}`);

  /* ---- 2. The rules decide, and only from what the contract and the knowledge base hold -------------- */
  const questions = new Map(contract.questions.map((q) => [q.id, q]));
  const optionOf = (q, o) => questions.get(q)?.options?.find((x) => x.id === o);
  const condition = (id) => conditions.find((c) => c.id === id);
  const aid = (id) => firstAid.find((f) => f.id === id);
  const entry = (id) => (id.startsWith("fa-") ? aid(id) : condition(id));
  for (const id of contract.required) if (!questions.has(id)) fail(`${SKIN} requires "${id}", which is not one of its questions.`);
  if (!contract.required.includes("signs")) fail(`${SKIN} no longer requires the signs question. General information is shown only once she has said whether any sign is true.`);
  for (const q of contract.questions) {
    if (!["chips", "multi", "text"].includes(q.kind)) fail(`${SKIN}'s question "${q.id}" is of the kind "${q.kind}", which no platform draws.`);
    if (q.exclusive && !optionOf(q.id, q.exclusive)) fail(`${SKIN}'s question "${q.id}" names "${q.exclusive}" as exclusive, which is not one of its options.`);
    for (const o of q.options ?? []) {
      if (o.oftenSeenIn) {
        if (o.oftenSeenIn.length < 2)
          fail(`${SKIN}'s option "${q.id}:${o.id}" names ${o.oftenSeenIn.length} entry. Every option that names entries names at least two, so a person who described anything is never shown a single answer.`);
        for (const id of o.oftenSeenIn) if (!condition(id)) fail(`${SKIN}'s option "${q.id}:${o.id}" names ${id}, which packages/catalog/knowledge/conditions.json does not have.`);
      }
      for (const id of o.checkFirst ?? []) if (!aid(id)) fail(`${SKIN}'s option "${q.id}:${o.id}" names ${id} to check first, which packages/catalog/knowledge/first-aid.json does not have.`);
    }
  }
  if (!(contract.outcomes["general-information"].maxShown >= 2)) fail(`${SKIN} shows fewer than two entries at most. General information names more than one thing a rash like this is often.`);
  for (const id of [...contract.selfCare.always, ...Object.values(contract.selfCare.forCondition)]) if (!aid(id)) fail(`${SKIN}'s self-care names ${id}, which is not a first-aid entry. Care steps come from the first-aid file only.`);
  for (const id of Object.keys(contract.selfCare.forCondition)) if (!condition(id)) fail(`${SKIN}'s self-care maps ${id}, which conditions.json does not have.`);
  const emergencyOptions = new Set();
  for (const rule of contract.rules) {
    if (!["emergency", "sister-today"].includes(rule.outcome)) fail(`${SKIN}'s rule "${rule.id}" reaches "${rule.outcome}". A rule reaches the emergency answer or a sign for today; general information is what is left.`);
    for (const w of rule.when) for (const o of w.anyOf) if (!optionOf(w.question, o)) fail(`${SKIN}'s rule "${rule.id}" names "${w.question}:${o}", which is not an option the contract asks.`);
    for (const id of rule.drawsOn) if (!entry(id)) fail(`${SKIN}'s rule "${rule.id}" draws on ${id}, which the knowledge base does not have.`);
    if (rule.outcome === "emergency") {
      if (rule.when.length !== 1 || rule.when[0].anyOf.length !== 1)
        fail(`${SKIN}'s emergency rule "${rule.id}" names more than one option. An emergency rule hands one option's own words to the conversation, so it names exactly one.`);
      const label = optionOf(rule.when[0].question, rule.when[0].anyOf[0]).label;
      if (!raises(label))
        fail(`${SKIN}'s emergency rule "${rule.id}" hands over "${label}", which the emergency terms in packages/catalog/gilbert-emergency-terms.json do not raise. A rule is not a new emergency word: the emergency answer is the conversation's, for words its own terms already raise, and a term is changed there with a clinical reviewer, never here.`);
      emergencyOptions.add(`${rule.when[0].question}:${rule.when[0].anyOf[0]}`);
    } else {
      if (!rule.says) fail(`${SKIN}'s rule "${rule.id}" has no sentence saying what she said.`);
      if (!rule.drawsOn.length && !(typeof rule.keptBecause === "string" && rule.keptBecause.length > 40))
        fail(`${SKIN}'s rule "${rule.id}" draws on no knowledge entry and says nothing about why it is kept. A sign for today reads the public guidance back to her, or says for the reviewer why the base has none.`);
    }
  }
  /* The converse: words the emergency terms raise are an emergency rule's or nobody's. An option or a
     question that raises them and leads anywhere else would be the check quietly lowering an emergency. */
  for (const q of contract.questions) {
    if (raises(q.ask)) fail(`${SKIN}'s question "${q.id}" asks "${q.ask}", which the emergency terms raise. A question names no emergency; a sign that is one is an option with an emergency rule.`);
    for (const o of q.options ?? [])
      if (raises(o.label) && !emergencyOptions.has(`${q.id}:${o.id}`))
        fail(`${SKIN}'s option "${q.id}:${o.id}" says "${o.label}", which the emergency terms raise, and no emergency rule names it. Words the emergency terms raise reach the emergency answer, never a sign for today or general information.`);
  }
  if (emergencyOptions.size < 2) fail(`${SKIN} has fewer than two emergency rules. A rash that does not fade under a glass and trouble breathing are both answered by the conversation's emergency answer.`);
  const expects = new Set(contract.fixtures.cases.map((f) => f.expect));
  for (const kind of ["emergency", "sister-today", "general-information", "incomplete"]) if (!expects.has(kind)) fail(`${SKIN}'s fixtures never expect "${kind}". Every outcome is held on every platform by at least one.`);
  if (!contract.fixtures.cases.some((f) => f.expect === "emergency" && /lips are swelling/i.test(f.typed ?? "")))
    fail(`${SKIN} has lost the fixture for a rash with swelling lips typed into the notes. It is an emergency through the escalation ruleset, and the fixture is what holds it there.`);
  /* The knowledge entries the check added say nobody has reviewed them, and each is one the check shows. */
  const named = new Set([...contract.questions.flatMap((q) => (q.options ?? []).flatMap((o) => [...(o.oftenSeenIn ?? []), ...(o.checkFirst ?? [])])), ...contract.rules.flatMap((r) => r.drawsOn), ...contract.selfCare.always, ...Object.keys(contract.selfCare.forCondition), ...Object.values(contract.selfCare.forCondition)]);
  for (const e of [...conditions, ...firstAid].filter((x) => x.review)) {
    if (e.review.reviewedBy !== null || e.review.status !== "awaiting-clinical-review")
      fail(`packages/catalog/knowledge entry ${e.id} names a reviewer or says it is reviewed. No clinician has read it; until one signs, its review block says so.`);
    if (e.review.addedFor === SKIN && !named.has(e.id)) fail(`packages/catalog/knowledge entry ${e.id} was added for the skin check and the check never shows it.`);
  }
  for (const id of named) if (!entry(id)?.source?.authority) fail(`${id} has no source authority. Every entry the check shows names where it came from.`);

  /* ---- 3. The photo is held, never read or sent ---------------------------------------------------- */
  if ((contract.photo.accept ?? []).some((t) => !/^image\//.test(t))) fail(`${SKIN} accepts ${contract.photo.accept.join(", ")}. A photo is taken and nothing else: a video carries sound, and this build records none outside push-to-talk.`);
  if (!contract.photo.videoRefused || !contract.photo.noReader || !contract.photo.held) fail(`${SKIN} has lost a sentence saying where the photo is, that nothing reads it, or that video is not taken.`);
  const reading = contract.photoReading;
  if (reading?.status !== "refused" || reading.everywhere !== true || reading.route !== null || !reading.waitsOn?.length || reading.waitsOn.some((w) => w.inPlace !== false))
    fail(`${SKIN}'s photo reader is not refused everywhere with nothing in place and no route. Reading a photo of skin waits on a ratified protocol with a named reviewer, an impact assessment that covers images, an Information Officer and a processor decision; none exists.`);
  if (!/protocol/i.test(reading.sentence) || !/impact assessment/i.test(reading.sentence) || !/Information Officer/.test(reading.sentence) || !/process/i.test(reading.sentence))
    fail(`${SKIN}'s photo-reader sentence no longer names all four things it waits on.`);
  const photoRoute = apis.routes.find((r) => /photo|image|vision|skin/i.test(r.path) && r.status !== "withdrawn");
  if (photoRoute) fail(`packages/catalog/apis/assistant.json declares ${photoRoute.method} ${photoRoute.path}. The skin check sends no photo anywhere; a photo route is proposed only when the four things the reader waits on exist, and the contract's route field changes with it.`);
  const web = strip(read(WEB_SCREEN));
  const webLib = strip(read(WEB_LIB));
  const shared = strip(read(SHARED));
  for (const [file, code] of [[WEB_SCREEN, web], [WEB_LIB, webLib], [SHARED, shared]]) {
    const reach = code.match(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|FormData|FileReader|localStorage|sessionStorage|indexedDB|caches|getContext|createImageBitmap|arrayBuffer|serviceWorker)\b|document\.cookie/);
    if (reach) fail(`${file} reaches for ${reach[0]}. The photo is shown back through an object URL and nothing else: nothing reads its bytes, stores it or sends it.`);
  }
  const creates = (web.match(/URL\.createObjectURL/g) ?? []).length, revokes = (web.match(/URL\.revokeObjectURL/g) ?? []).length;
  if (creates !== 1 || revokes !== 1 || !/return \(\) => URL\.revokeObjectURL\(next\)/.test(web))
    fail(`${WEB_SCREEN} makes ${creates} object URL${creates === 1 ? "" : "s"} and revokes ${revokes}. There is one, made in an effect whose clean-up revokes it, so replacing, removing, ending and closing all let the photo go.`);
  const input = web.match(/<input\b[^>]*>/g) ?? [];
  if (input.length !== 1 || !/type="file"/.test(input[0]) || !/accept="image\/\*"/.test(input[0]) || /\bcapture\b/.test(input[0]))
    fail(`${WEB_SCREEN}'s file input is not one input asking for an image with no capture attribute.`);
  const ios = strip(read(IOS_VIEW)), iosModel = strip(read(IOS_MODEL));
  const iosReach = (ios + iosModel).match(/\b(PHPhotoLibrary|PHAssetCreationRequest|UIImageWriteToSavedPhotosAlbum|UIImagePickerController|AVCaptureDevice|FileManager|URLSession|UserDefaults|NSCameraUsageDescription)\b|\.write\(to:/);
  if (iosReach) fail(`${IOS_VIEW} reaches for ${iosReach[0]}. The photo is chosen with PhotosPicker and held in memory: nothing saves it to the library or a file, sends it, or asks for the camera.`);
  if (!/PhotosPicker\(/.test(ios)) fail(`${IOS_VIEW} no longer chooses the photo with PhotosPicker, the one way in that needs no permission.`);
  const android = strip(read(ANDROID_SCREEN)), androidModel = strip(read(ANDROID_MODEL));
  const androidReach = (android + androidModel).match(/\b(FileOutputStream|openFileOutput|MediaStore|cacheDir|createTempFile|FileProvider|SharedPreferences|HttpURLConnection|OkHttp\w*|Manifest\.permission\.CAMERA|CaptureVideo)\b|TakePicture\(\)/);
  if (androidReach) fail(`${ANDROID_SCREEN} reaches for ${androidReach[0]}. The photo comes from the photo picker or the camera's in-memory preview: no file is written, nothing is sent and no permission is declared.`);
  if (!/PickVisualMedia\.ImageOnly/.test(android) || !/TakePicturePreview\(\)/.test(android)) fail(`${ANDROID_SCREEN} no longer takes the photo from the image-only picker and the in-memory camera preview.`);

  /* ---- 4. The screens say the contract's words and decide nothing ---------------------------------- */
  /* Text between tags that reads like a phrase — two words, none of the punctuation code carries — is a
     sentence typed onto the screen; so is a literal accessible name. */
  const jsxText = [...web.matchAll(/>([^<>{}]*)</g)].map((m) => m[1].trim()).filter((t) => !/[(){};=[\]|&?:]/.test(t) && /[A-Za-z]+\s+[A-Za-z]+/.test(t));
  const typedAttrs = [...web.matchAll(/\b(aria-label|title|alt|placeholder)="([^"]*[A-Za-z][^"]*)"/g)].map((m) => `${m[1]}="${m[2]}"`);
  if (jsxText.length || typedAttrs.length)
    fail(`${WEB_SCREEN} types words onto the screen: ${[...jsxText, ...typedAttrs].map((t) => JSON.stringify(t)).join(", ")}. Every sentence on the check is the contract's or a knowledge entry's.`);
  for (const [file, code, typed] of [[IOS_VIEW, ios, /\b(Text|Label|Button|accessibilityLabel)\(\s*"[^"\\]*[A-Za-z]/], [ANDROID_SCREEN, android, /\b(Text|ThusoButton)\(\s*"[^"$]*[A-Za-z]|contentDescription\s*=\s*"[^"]*[A-Za-z]/]]) {
    const found = code.match(typed);
    if (found) fail(`${file} types words onto the check (${found[0]}). Every sentence there is SkinCheckData's, generated from ${SKIN}.`);
  }
  for (const [file, code, review, entryReview, decide] of [
    [WEB_SCREEN, web, /skinReviewSentence\(\)/, /entryReviewSentence\(/, /skinOutcome\(/],
    [IOS_VIEW, ios, /SkinCheck\.reviewSentence/, /SkinCheck\.entryNote\(/, /SkinCheck\.outcome\(/],
    [ANDROID_SCREEN, android, /SkinCheck\.reviewSentence/, /SkinCheck\.entryNote\(/, /SkinCheck\.outcome\(/],
  ]) {
    if (!review.test(code) || !entryReview.test(code)) fail(`${file} no longer shows the check's review sentence or each entry's. Nobody has reviewed them, and every platform says so beside what it shows.`);
    if (!decide.test(code)) fail(`${file} no longer reaches its outcome through the shared arithmetic.`);
    const composed = code.match(/kind:\s*["'](emergency|sister-today|general-information)["']|SkinOutcome\.(SisterToday|Information|Emergency)\(|\.(sisterToday|information|emergency)\(\[|\.emergency\(says:/);
    if (composed) fail(`${file} composes an outcome itself (${composed[0]}). An outcome is the contract's rules' to decide, through the shared arithmetic, and a screen only draws it.`);
  }
  const panel = strip(read(PANEL));
  if (!/const SkinCheck = lazy\(\(\) => import\("\.\/SkinCheck"\)\)/.test(panel) || /^import [^;]*from "\.\/SkinCheck"/m.test(read(PANEL)) || /skin-check\.json|gilbertone\/src\/skin-check/.test(read(PANEL)))
    fail(`${PANEL} no longer loads the skin check on its own dynamic import, or reads its contract itself. The screen, its contract and the knowledge entries arrive when a patient presses the chip, and the panel carries only the chip's generated label.`);
  if (!/onEmergency=\{skinEmergency\}/.test(panel) || !/const skinEmergency = \(words: string\) => \{[^}]*emergencyTurn\(turns, words\)/.test(panel))
    fail(`${PANEL} no longer hands the skin check's emergency to the conversation's own emergency turn.`);
  for (const entryFile of ["apps/web/src/App.tsx", "apps/web/src/main.tsx", "apps/web/src/components/AssistantLauncher.tsx", "apps/web/src/shells/PatientShell.tsx"])
    if (existsSync(entryFile) && /SkinCheck|skin-check/.test(read(entryFile))) fail(`${entryFile} names the skin check. It is not on the patient's first view; it arrives behind the panel's dynamic import.`);
  if (!/Gilbert\.send\(words, channel: \.chosen/.test(read("apps/ios/MyThuso/Features/AssistantView.swift")) || !/SkinCheckView\(/.test(read("apps/ios/MyThuso/Features/AssistantView.swift")))
    fail("The iOS GilbertOne no longer opens the skin check, or no longer answers its emergency with the conversation's own turn.");
  if (!/Gilbert\.send\(words, GilbertChannel\.CHOSEN/.test(read("apps/android/app/src/main/java/za/co/mythuso/ui/GilbertScreens.kt")) || !/SkinCheckScreen\(/.test(read("apps/android/app/src/main/java/za/co/mythuso/ui/GilbertScreens.kt")))
    fail("The Android GilbertOne no longer opens the skin check, or no longer answers its emergency with the conversation's own turn.");

  /* ---- 5. Generator, registrations, journey, map --------------------------------------------------- */
  const pkg = JSON.parse(read("package.json"));
  if (pkg.scripts["skin-check"] !== "node scripts/emit-skin-check.mjs" || !/npm run skin-check/.test(pkg.scripts.generate))
    fail("package.json no longer registers `npm run skin-check`, or generate no longer runs it.");
  const pbx = read("apps/ios/MyThuso.xcodeproj/project.pbxproj");
  for (const f of ["Models/SkinCheckData.swift", "Models/SkinCheck.swift", "Features/SkinCheckView.swift"]) {
    const ref = pbx.match(new RegExp(`(\\w+) = \\{ isa = PBXFileReference;[^}]*path = "MyThuso/${f.replace(/[./]/g, (c) => `\\${c}`)}"`));
    const build = ref && pbx.match(new RegExp(`(\\w+) = \\{ isa = PBXBuildFile; fileRef = ${ref[1]}; \\}`));
    if (!ref || !build || pbx.split(ref[1]).length < 4 || pbx.split(build[1]).length < 3)
      fail(`MyThuso/${f} is not registered in project.pbxproj as a file reference, a build file, a group child and a source.`);
  }
  const journey = "tests/skin-check.spec.ts";
  if (!existsSync(journey) || !/setInputFiles/.test(read(journey)) || /test\.skip|testInfo\.project/.test(read(journey)))
    fail(`${journey} no longer chooses a photo, or skips a viewport. The journey runs on both.`);
  if (!/skin-check\.json/.test(read("docs/FEATURE-MAP.md"))) fail("docs/FEATURE-MAP.md has no row for the skin check.");

  return `Skin check · ${contract.questions.length} questions and ${contract.rules.length} rules from ${SKIN}, ${emergencyOptions.size} emergency rules each handing the conversation an option its own emergency terms raise and no other option raising them; ${named.size} knowledge entries named, every option that names entries naming at least two, every added entry awaiting clinical review; no digit and no you-have sentence addressed to the patient; the photo held in memory on all three platforms — one object URL revoked by its own clean-up, no capture attribute, no storage, no request and no reader on the web, PhotosPicker and no save on iOS, the picker and the in-memory preview and no file on Android — and the photo reader refused everywhere with no route; the screens type no sentence, show the review state and decide nothing; the web screen behind the panel's dynamic import; generator, project, journey and map row in place.`;
}
