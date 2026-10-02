/* The doctor's medical certificate — 2 October 2026. The founder asked for "creation of doctors notes and
   sick notes and referrals" for the consultation; the certificate is built as a composer that refuses what
   rule 16 and section 23 refuse and issues nothing. This holds it to that, and is a module of its own so each
   check can be proven to fire by handing it a broken file through `read` (scripts/prove-sick-note.mjs does
   exactly that). scripts/check-boundaries.mjs calls it with the same `read` and `existsSync` it uses
   everywhere else, and with the web's own rules module, so the fixtures are replayed against the code that
   draws the screen rather than against a second copy of it here.

   WHAT IS HELD.
   1. The contract: who decided it and when, that nobody has reviewed it, the sources it cites (rule 16 and
      section 23 among them), its two limits as whole numbers with a reason each, its consultations as day
      offsets and never dates, a sentence for every refusal or a source the generator resolves, and the
      call-only refusal still the consultation contract's own while that contract refuses a certificate.
   2. Nobody but a vetted doctor signs. The capability is on the vetting register and granted to the doctor
      alone; every platform asks the register's `can` for the contract's capability; the nurse's refusal is
      the sentence she already reads on her assessment, and its three typed copies say it word for word.
   3. No identity number is carried: not a field, not a key, not a line on any platform's certificate.
   4. The illness is described only with the patient's agreement, on every platform, and the replayed
      certificate prints the withheld sentence when the agreement is not there.
   5. No date or limit is typed: each platform reads both limits from the generated data and none writes a
      date literal, and no platform types the not-issued notice instead of reading it — which every one shows.
   6. The fixtures replay through the web's rules exactly as the contract expects.
   7. Registered everywhere: the generator, the Xcode project, Android's route, the web section on its own
      dynamic import and nowhere on the patient's first view, the Passport reading session memory only, the
      journey on both viewports and the feature map's row. */

const SN = "packages/catalog/sick-note.json";
const WEB_LIB = "apps/web/src/lib/sick-note.ts";
const WEB_SCREEN = "apps/web/src/features/SickNote.tsx";
const WEB_SHEET = "apps/web/src/features/SickNoteCertificate.tsx";
const IOS_MODEL = "apps/ios/MyThuso/Models/SickNote.swift";
const IOS_VIEW = "apps/ios/MyThuso/Features/SickNoteView.swift";
const ANDROID_MODEL = "apps/android/app/src/main/java/za/co/mythuso/model/SickNote.kt";
const ANDROID_SCREEN = "apps/android/app/src/main/java/za/co/mythuso/ui/SickNoteScreens.kt";
const SPEC = "tests/sick-note.spec.ts";
const ID_NUMBER = /\b(id[-_ ]?number|identity[-_ ]?number|idNumber|identityNumber|nationalId|saIdNumber|said_number)\b/i;
const ISO_DATE = /\b20\d\d-\d\d-\d\d\b/;

export function checkSickNote({ read, existsSync, rules }) {
  const fail = (why) => { throw new Error(`Medical certificate: ${why}`); };
  const c = JSON.parse(read(SN));
  const vetting = JSON.parse(read("packages/catalog/vetting.json"));
  const teleconsult = JSON.parse(read("packages/catalog/teleconsult.json"));
  const strip = (source) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const code = (file) => strip(read(file));

  /* ---- 1. The contract ------------------------------------------------------------------------------ */
  if (!/founder/i.test(String(c.decidedBy)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.on)))
    fail(`${SN} has lost who decided it or when.`);
  if (c.review?.reviewedBy !== null || c.review?.status !== "awaiting-clinical-review")
    fail(`${SN} names a reviewer. Nobody has reviewed the limits or the wording; a name here is a claim of clinical review the product cannot make, and when one signs, this check changes in the same commit.`);
  if (JSON.stringify(c.platforms) !== JSON.stringify(["web", "ios", "android"]))
    fail(`${SN} says it renders on ${JSON.stringify(c.platforms)}. It is built on all three, and each is held below.`);
  for (const id of ["hpcsa-rule-16", "bcea-s23"]) {
    const source = (c.sources ?? []).find((s) => s.id === id);
    if (!source || !/^https:\/\//.test(source.url ?? "") || !source.holds) fail(`${SN} no longer cites ${id} with a link and what it holds. Every field and limit on a certificate answers to rule 16 or section 23.`);
  }
  if (!/^Not issued\./.test(c.notIssued ?? "") || !/Not issued/.test(c.notIssuedShort ?? "") || !c.memoryOnly)
    fail(`${SN}'s notIssued no longer opens by saying the certificate is not issued. Every screen that draws one says so in these words.`);
  for (const key of ["backdateDays", "maxDays", "defaultDays"]) {
    const n = c.period?.[key];
    if (!Number.isInteger(n) || n < 0 || !c.period?.[`${key}Why`]) fail(`${SN}'s period.${key} is not a whole number with a reason beside it in ${key}Why. A limit on a legal document is a decision somebody has to be able to read.`);
  }
  if (!(c.period.maxDays >= c.period.defaultDays && c.period.defaultDays >= 1)) fail(`${SN} starts a draft longer than one certificate may cover.`);
  if (c.diagnosis?.default !== "withheld" || !c.diagnosis?.withheld) fail(`${SN} no longer withholds the illness by default. Rule 16(1)(f)'s proviso is where a certificate starts.`);
  for (const k of c.consultations ?? []) {
    if (!Number.isInteger(k.dayOffset) || Object.keys(k).some((key) => /date/i.test(key)) || ISO_DATE.test(JSON.stringify(k)))
      fail(`${SN}'s consultation ${k.reference} carries a date. Consultations are day offsets from today, so the preview never goes stale.`);
  }
  if (ISO_DATE.test(JSON.stringify({ ...c, on: null }))) fail(`${SN} carries a typed date outside "on". Every day in it is an offset.`);
  const required = ["no-consultation", "from-a-call", "not-yet-seen", "not-this-patient", "not-a-doctor", "registration", "period-backwards", "starts-after-issue", "backdated-too-far", "period-too-long", "diagnosis-without-consent", "consent-without-description"];
  for (const id of required) {
    const r = c.refusals.find((x) => x.id === id);
    if (!r || (!r.sentence && !r.from)) fail(`${SN} no longer refuses "${id}" in a sentence of its own or a named source. What a certificate will not do is the valuable half of it.`);
  }
  for (const id of ["backdated-too-far", "period-too-long"])
    if (!c.refusals.find((x) => x.id === id).sentence.includes("{days}") || /\d/.test(c.refusals.find((x) => x.id === id).sentence))
      fail(`${SN}'s "${id}" types its number. It says {days}, filled from period, so the sentence and the limit cannot part.`);
  const tCert = teleconsult.issued?.items?.find((d) => d.id === "certificate");
  if (!tCert || tCert.mayIssue !== false) fail("packages/catalog/teleconsult.json no longer refuses a certificate from a call, and this contract reads its refusal from there. Decide both together.");
  if (c.basis?.callOnlyFrom !== "packages/catalog/teleconsult.json#issued.items.certificate.condition" || !tCert.condition)
    fail(`${SN} no longer reads the call-only refusal from the consultation contract. One question, one answer, in one file.`);

  const protocols = JSON.parse(read("packages/catalog/protocols.json"));
  const criteria = protocols.protocols.find((p) => p.id === c.protocol?.id);
  if (!criteria) fail(`${SN}'s protocol.id names ${c.protocol?.id}, which packages/catalog/protocols.json does not hold.`);
  if (criteria.status !== "draft" || !/nobody has ratified/.test(c.protocol.sentence ?? ""))
    fail(`The certificate criteria protocol is ${criteria.status} and ${SN} says ${JSON.stringify(c.protocol.sentence)}. While it is a draft every screen says so; when the board ratifies it, this sentence and this check change together.`);
  for (const [file, pattern] of [[WEB_SCREEN, /\{protocolLine\}/], [IOS_VIEW, /SickNoteData\.protocolLine/], [ANDROID_SCREEN, /SickNoteData\.protocolLine/]])
    if (!pattern.test(code(file))) fail(`${file} no longer names the criteria protocol as the draft it is.`);

  /* ---- 2. Nobody but a vetted doctor ---------------------------------------------------------------- */
  const cap = c.issuer?.capability;
  if (!vetting.capabilities.some((x) => x.id === cap)) fail(`${SN} asks the register for "${cap}", which packages/catalog/vetting.json does not have.`);
  const holders = vetting.roles.filter((r) => r.grants.some((g) => g.capability === cap)).map((r) => r.id);
  if (JSON.stringify(holders) !== JSON.stringify(["doctor"]))
    fail(`"${cap}" is granted to ${holders.join(", ") || "nobody"} on the vetting register. On this register a certificate is a doctor's alone; a nurse would need a diagnostic authorisation the nurse checks do not record (see issuer.notADoctorWhy).`);
  const grant = vetting.roles.find((r) => r.id === "doctor").grants.find((g) => g.capability === cap);
  if (!/registration/i.test(grant.refusal)) fail(`The doctor's refusal for "${cap}" no longer says it hangs on a current registration.`);
  if (!/^A nurse assessment is not a diagnosis\./.test(c.issuer?.notADoctor ?? "")) fail(`${SN}'s notADoctor is no longer the sentence a nurse reads on her assessment.`);
  for (const file of c.issuer.alsoTypedIn ?? []) if (!read(file).includes(c.issuer.notADoctor))
    fail(`${file} no longer says "${c.issuer.notADoctor}" word for word, and ${SN} refuses a nurse in that sentence. Change both together.`);
  if ((c.issuer.alsoTypedIn ?? []).length !== 3) fail(`${SN} names ${(c.issuer.alsoTypedIn ?? []).length} copies of the nurse's sentence. It is typed on the nurse's assessment on all three platforms.`);
  const asksRegister = [
    [WEB_SCREEN, /can\(subject, c\.issuer\.capability\)/],
    [IOS_MODEL, /can\(subject, SickNoteData\.capability\)/],
    [ANDROID_MODEL, /can\(subject, SickNoteData\.capability\)/],
  ];
  for (const [file, pattern] of asksRegister) if (!pattern.test(code(file))) fail(`${file} no longer asks the vetting register's can() for the contract's capability. Who may sign is the register's decision, never the screen's.`);
  const signsOnlyClear = [
    [WEB_SCREEN, /disabled=\{refusals\.length > 0\}/, /if \(refusals\.length\) return;/],
    [IOS_VIEW, /\.disabled\(!refusals\.isEmpty\)/, /guard refusals\.isEmpty else \{ return \}/],
    [ANDROID_SCREEN, /enabled = refusals\.isEmpty\(\)/, /if \(refusals\.isEmpty\(\)\) signed =/],
  ];
  for (const [file, disabled, guarded] of signsOnlyClear) {
    const src = code(file);
    if (!disabled.test(src) || !guarded.test(src)) fail(`${file} lets the sign button act while a refusal stands. It is disabled and its action refuses again.`);
  }

  /* ---- 3. No identity number ----------------------------------------------------------------------- */
  const carried = (c.notCarried ?? []).map((n) => n.id);
  if (!carried.includes("identity-number")) fail(`${SN} no longer says an identity number is not carried.`);
  for (const f of c.fields) if (ID_NUMBER.test(f.id) || /identity|employ/i.test(f.id)) fail(`${SN} carries a "${f.id}" field. No identity number and no employment number is carried.`);
  for (const file of [WEB_LIB, WEB_SCREEN, WEB_SHEET, IOS_MODEL, IOS_VIEW, ANDROID_MODEL, ANDROID_SCREEN])
    if (ID_NUMBER.test(code(file))) fail(`${file} names an identity number. A certificate carries the patient's name and nothing that opens their other records.`);

  /* ---- 4. The illness only with agreement ----------------------------------------------------------- */
  const consentGuards = [
    [WEB_LIB, /draft\.consent && draft\.description\.trim\(\) \? draft\.description\.trim\(\) : contract\.diagnosis\.withheld/],
    [IOS_MODEL, /draft\.consent && !draft\.description[^\n]*\n\s*\? draft\.description[^\n]*: SickNoteData\.Diagnosis\.withheld/],
    [ANDROID_MODEL, /if \(draft\.consent && draft\.description\.isNotBlank\(\)\) draft\.description\.trim\(\) else SickNoteData\.Diagnosis\.withheld/],
  ];
  for (const [file, pattern] of consentGuards) if (!pattern.test(code(file))) fail(`${file} prints the illness without asking whether the patient agreed. Rule 16(1)(f): with consent, or only whether the patient can work.`);
  const clears = [
    [WEB_SCREEN, /description: e\.target\.checked \? draft\.description : ''/],
    [IOS_VIEW, /if !on \{ draft\.description = "" \}/],
    [ANDROID_SCREEN, /description = if \(on\) draft\.description else ""/],
  ];
  for (const [file, pattern] of clears) if (!pattern.test(code(file))) fail(`${file} keeps the words when the agreement is withdrawn. Unticking clears them, so nothing written before the patient changed their mind reaches the certificate.`);

  /* ---- 5. Nothing typed that the contract holds ----------------------------------------------------- */
  const limitsRead = [
    [WEB_LIB, /dayOffset - draft\.fromOffset > contract\.period\.backdateDays/, /daysCovered\(draft\) > contract\.period\.maxDays/],
    [IOS_MODEL, /dayOffset - draft\.fromOffset > SickNoteData\.Period\.backdateDays/, /draft\.daysCovered > SickNoteData\.Period\.maxDays/],
    [ANDROID_MODEL, /dayOffset - draft\.fromOffset > SickNoteData\.Period\.backdateDays/, /draft\.daysCovered > SickNoteData\.Period\.maxDays/],
  ];
  for (const [file, back, max] of limitsRead) {
    const src = code(file);
    if (!back.test(src) || !max.test(src)) fail(`${file} no longer compares the period with both limits from the contract. How far back and how long are packages/catalog/sick-note.json's.`);
    if (new RegExp(`\\b(${c.period.maxDays}|${c.period.maxDays + 1})\\b`).test(src)) fail(`${file} types ${c.period.maxDays}, the longest period. Read it from the contract.`);
  }
  for (const file of [WEB_LIB, WEB_SCREEN, WEB_SHEET, IOS_MODEL, IOS_VIEW, ANDROID_MODEL, ANDROID_SCREEN])
    if (ISO_DATE.test(code(file))) fail(`${file} types a date. Every day on a certificate is an offset from today.`);
  const notice = [
    [WEB_SCREEN, /c\.notIssued\b/], [WEB_SHEET, /sickNote\.notIssued\b/], [WEB_SHEET, /sickNote\.notIssuedShort\b/],
    [IOS_VIEW, /SickNoteData\.notIssued\b/], [IOS_VIEW, /SickNoteData\.notIssuedShort\b/],
    [ANDROID_SCREEN, /SickNoteData\.notIssued\b/], [ANDROID_SCREEN, /SickNoteData\.notIssuedShort\b/],
  ];
  for (const [file, pattern] of notice) if (!pattern.test(code(file))) fail(`${file} no longer shows ${pattern.source.replace(/\\b|\\/g, "")}. Every screen that draws a certificate says it is not issued, in the contract's words.`);
  for (const file of [WEB_SCREEN, WEB_SHEET, IOS_VIEW, ANDROID_SCREEN])
    if (/Not issued|not issued\.|unfit for (work|duty)/i.test(code(file))) fail(`${file} types the notice or a certified statement itself. Every word on a certificate is the contract's.`);

  /* ---- 6. The fixtures, replayed through the web's rules -------------------------------------------- */
  const doctorGrant = grant.refusal;
  const issuers = {
    doctor: { granted: true, allowed: true, reason: "", name: "Dr Ayanda Dlamini", registration: "HPCSA MP0483217" },
    nurse: { granted: false, allowed: false, reason: "", name: "Sister", registration: "SANC" },
    lapsed: { granted: true, allowed: false, reason: `HPCSA registration lapsed. ${doctorGrant}`, name: "Dr Sanjay Naidoo", registration: "HPCSA MP0559104" },
  };
  const cases = c.fixtures?.cases ?? [];
  const covered = new Set(cases.flatMap((f) => f.expect));
  for (const id of required) if (!covered.has(id)) fail(`No fixture in ${SN} expects "${id}". Every refusal is replayed at least once.`);
  if (!cases.some((f) => f.expect.length === 0)) fail(`No fixture in ${SN} passes. A composer that refuses everything is not a composer.`);
  for (const f of cases) {
    const issuer = issuers[f.writer];
    if (!issuer) fail(`${SN}'s fixture "${f.name}" writes as "${f.writer}", which is not doctor, nurse or lapsed.`);
    const got = rules.refusalsFor({ reference: f.reference, patient: f.patient, fromOffset: f.fromOffset, toOffset: f.toOffset, fitness: "unfit", consent: f.consent, description: f.description }, issuer).map((r) => r.id);
    if (JSON.stringify(got) !== JSON.stringify(f.expect)) fail(`the fixture "${f.name}" expects ${JSON.stringify(f.expect)} and ${WEB_LIB} answers ${JSON.stringify(got)}.`);
    const sentences = rules.refusalsFor({ reference: f.reference, patient: f.patient, fromOffset: f.fromOffset, toOffset: f.toOffset, fitness: "unfit", consent: f.consent, description: f.description }, issuer);
    for (const s of sentences) if (!s.sentence || /\{days\}/.test(s.sentence)) fail(`the fixture "${f.name}" is refused with an empty or unfilled sentence for "${s.id}".`);
  }
  const printed = rules.certificateFrom({ reference: "TH-2048", patient: "Lerato Molefe", fromOffset: 0, toOffset: 2, fitness: "unfit", consent: false, description: "A stomach bug" }, issuers.doctor, (o) => `day ${o}`);
  const description = printed.lines.find((l) => l.id === "description")?.value;
  if (description !== c.diagnosis.withheld) fail(`${WEB_LIB}'s certificate prints "${description}" for an illness the patient did not agree to have described.`);
  if (printed.lines.some((l) => ID_NUMBER.test(l.id) || /identity|employ/i.test(l.id))) fail(`${WEB_LIB}'s certificate carries an identity or employment line.`);

  /* ---- 7. Registered everywhere --------------------------------------------------------------------- */
  const pkg = JSON.parse(read("package.json"));
  if (pkg.scripts?.["sick-note"] !== "node scripts/emit-sick-note.mjs" || !/npm run sick-note\b/.test(pkg.scripts?.generate ?? ""))
    fail("package.json no longer registers `npm run sick-note`, or generate no longer runs it.");
  const pbx = read("apps/ios/MyThuso.xcodeproj/project.pbxproj");
  for (const file of ["SickNoteData.swift", "SickNote.swift", "SickNoteView.swift"]) {
    const ref = pbx.match(new RegExp(`(\\w+) = \\{ isa = PBXFileReference;[^\\n]*path = "MyThuso/(?:Models|Features)/${file.replace(".", "\\.")}"`))?.[1];
    const build = ref && pbx.match(new RegExp(`(\\w+) = \\{ isa = PBXBuildFile; fileRef = ${ref}; \\}`))?.[1];
    const group = ref && new RegExp(`isa = PBXGroup;[^\\n]*\\b${ref}\\b`).test(pbx);
    const phase = build && new RegExp(`isa = PBXSourcesBuildPhase;[^\\n]*\\b${build}\\b`).test(pbx);
    if (!ref || !build || !group || !phase) fail(`${file} is not registered in apps/ios/MyThuso.xcodeproj/project.pbxproj (a file reference, a build file, the group's children and the Sources phase).`);
  }
  if (!/SickNoteView\(\)/.test(code("apps/ios/MyThuso/Features/WorkspaceView.swift"))) fail("The iOS doctor's board no longer opens SickNoteView.");
  if (!/title == za\.co\.mythuso\.model\.SickNoteData\.Screen\.deskTitle -> SickNoteScreen\(store\)/.test(code("apps/android/app/src/main/java/za/co/mythuso/ui/AccountScreens.kt")))
    fail("AccountScreens.kt no longer routes the contract's deskTitle to SickNoteScreen.");
  if (!/^export function SickNoteComposer\(\{ reference = [^,]+, patient = [^,]+, writer = [^,]+, onClose, onSign \}/m.test(read(WEB_SCREEN)))
    fail(`${WEB_SCREEN} no longer exports SickNoteComposer({ reference, patient, writer, onClose, onSign }). A consultation embeds it under that name and those props.`);
  const shell = code("apps/web/src/shells/StaffShell.tsx");
  if (!shell.includes(`{ id: '${c.screen.deskTitle}',`) || !shell.includes(`if (section === '${c.screen.deskTitle}') return`))
    fail(`The doctor's section is no longer "${c.screen.deskTitle}", the contract's deskTitle, in StaffShell.tsx's navigation and its renderSection.`);
  if (!/const SickNoteDesk = lazy\(\(\) => import\('\.\.\/features\/SickNote'\)/.test(shell) || /import \{[^}]*SickNote[^}]*\} from '\.\.\/features\/SickNote'/.test(shell))
    fail("StaffShell.tsx no longer loads the certificate on its own dynamic import.");
  for (const file of ["apps/web/src/App.tsx", "apps/web/src/main.tsx", "apps/web/src/shells/PatientShell.tsx", "apps/web/src/features/Passport.tsx"])
    if (existsSync(file) && /SickNote|sick-note/.test(code(file))) fail(`${file} names the certificate. It is not on the patient's first view; the Passport reaches it through its own deferred screens.`);
  const passport = code("apps/web/src/features/PassportScreens.tsx");
  if (!/const WrittenThisSession = lazy\(\(\) => import\('\.\/SickNoteCertificate'\)/.test(passport) || !/<WrittenThisSession\/>/.test(passport))
    fail("The Passport's Medical certificate no longer shows what a doctor signed in this session, on its own dynamic import.");
  const sheet = code(WEB_SHEET);
  if (!/useSyncExternalStore\(subscribeWritten, writtenThisSession/.test(sheet) || !/c\.patient === holder\.name/.test(sheet)) fail(`${WEB_SHEET} reads the session's certificates some other way, or for somebody other than the Passport's holder.`);
  for (const file of [WEB_LIB, WEB_SCREEN, WEB_SHEET]) if (/\b(localStorage|sessionStorage|indexedDB|fetch)\b/.test(code(file))) fail(`${file} reaches for storage or the network. A certificate in the preview lives in memory and goes nowhere.`);
  if (!existsSync(SPEC)) fail(`${SPEC} is missing.`);
  if (/test\.skip|test\.fixme|testInfo\.project\.name\s*===|isMobile\)\s*test\.skip/.test(read(SPEC))) fail(`${SPEC} skips a viewport. The journey runs on both.`);
  if (!/sick-note\.json/.test(read("docs/FEATURE-MAP.md"))) fail("docs/FEATURE-MAP.md has no row for the medical certificate (packages/catalog/sick-note.json).");

  return `Medical certificate · ${c.fields.length} rule 16 items and ${c.notCarried.length} never carried; ${c.refusals.length} refusals, ${cases.length} fixtures replayed through the web's rules; "${cap}" granted to the doctor alone and asked of the register on three platforms; the illness only with agreement; ${c.period.backdateDays} days back and ${c.period.maxDays} long read from the contract; not issued on every screen.`;
}
