/* Proves each rule in scripts/check-sick-note.mjs fires, by handing the module a broken copy of one file
   through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-sick-note.mjs`; it is not part of the build, because a proof that ran on every build
   would be the build proving itself. Nothing on disk is changed.

   The fixtures are replayed through the web's real rules module. A break to the rules themselves is proven
   by handing the check a module whose answer differs — the same module the build imports, wrapped. */
import { existsSync, readFileSync } from "node:fs";
import { checkSickNote } from "./check-sick-note.mjs";

const rules = await import("../apps/web/src/lib/sick-note.ts");
const readDisk = (f) => readFileSync(f, "utf8");
const run = (patch, ruleSet = rules) => checkSickNote({ read: (f) => (patch[f] !== undefined ? patch[f] : readDisk(f)), existsSync: (f) => (patch[f] === null ? false : existsSync(f)), rules: ruleSet });
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const SN = "packages/catalog/sick-note.json";
const VET = "packages/catalog/vetting.json";
const LIB = "apps/web/src/lib/sick-note.ts";
const WEB = "apps/web/src/features/SickNote.tsx";
const SHEET = "apps/web/src/features/SickNoteCertificate.tsx";
const IOS_M = "apps/ios/MyThuso/Models/SickNote.swift";
const IOS_V = "apps/ios/MyThuso/Features/SickNoteView.swift";
const AND_M = "apps/android/app/src/main/java/za/co/mythuso/model/SickNote.kt";
const AND_S = "apps/android/app/src/main/java/za/co/mythuso/ui/SickNoteScreens.kt";
const refusal = (d, id) => d.refusals.find((r) => r.id === id);

const proofs = [
  /* 1. The contract */
  ["a reviewer named who never signed", { [SN]: json(SN, (d) => { d.review.reviewedBy = "Dr A. Reviewer"; }) }, /names a reviewer/],
  ["rule 16 dropped from the sources", { [SN]: json(SN, (d) => { d.sources = d.sources.filter((s) => s.id !== "hpcsa-rule-16"); }) }, /no longer cites hpcsa-rule-16/],
  ["the not-issued notice softened", { [SN]: json(SN, (d) => { d.notIssued = "A preview of a certificate."; }) }, /no longer opens by saying the certificate is not issued/],
  ["a limit with no reason", { [SN]: json(SN, (d) => { delete d.period.backdateDaysWhy; }) }, /backdateDays is not a whole number with a reason/],
  ["a limit that is not a whole number", { [SN]: json(SN, (d) => { d.period.maxDays = 14.5; }) }, /maxDays is not a whole number/],
  ["the illness described by default", { [SN]: json(SN, (d) => { d.diagnosis.default = "described"; }) }, /no longer withholds the illness by default/],
  ["a consultation with a typed date", { [SN]: json(SN, (d) => { d.consultations[0].date = "2026-10-02"; }) }, /carries a date/],
  ["a refusal with no sentence", { [SN]: json(SN, (d) => { delete refusal(d, "not-yet-seen").sentence; }) }, /no longer refuses "not-yet-seen"/],
  ["a limit typed into its sentence", { [SN]: json(SN, (d) => { refusal(d, "period-too-long").sentence = "One certificate covers at most 14 days."; }) }, /types its number/],
  ["a call allowed to certify", { "packages/catalog/teleconsult.json": json("packages/catalog/teleconsult.json", (d) => { d.issued.items.find((i) => i.id === "certificate").mayIssue = true; }) }, /no longer refuses a certificate from a call/],
  ["the call refusal read from somewhere else", { [SN]: json(SN, (d) => { d.basis.callOnlyFrom = "packages/catalog/sick-note.json#basis.byVideo"; }) }, /no longer reads the call-only refusal/],
  ["the criteria protocol ratified and still called a draft", { "packages/catalog/protocols.json": json("packages/catalog/protocols.json", (d) => { d.protocols.find((p) => p.id === "medical-certificate-criteria").status = "ratified"; }) }, /certificate criteria protocol is ratified/],
  ["a screen that drops the protocol line", { [WEB]: text(WEB, "<p className=\"sn-quiet sn-protocol\">{protocolLine}</p>", "") }, /no longer names the criteria protocol/],
  /* 2. Nobody but a vetted doctor */
  ["the capability granted to a nurse", { [VET]: json(VET, (d) => { d.roles.find((r) => r.id === "nurse").grants.push({ capability: "issue-medical-certificate", refusal: "x" }); }) }, /granted to nurse, doctor|granted to doctor, nurse/],
  ["the capability gone from the register", { [VET]: json(VET, (d) => { d.capabilities = d.capabilities.filter((c) => c.id !== "issue-medical-certificate"); }) }, /does not have/],
  ["a nurse's typed copy drifting", { "apps/web/src/features/Clinical.tsx": text("apps/web/src/features/Clinical.tsx", "Prescriptions, sick notes and referrals need a registered doctor to review and sign.", "Prescriptions and sick notes need a doctor.") }, /no longer says "A nurse assessment is not a diagnosis/],
  ["the web deciding who may sign by role name", { [WEB]: text(WEB, "const decision = can(subject, c.issuer.capability);", "const decision = { allowed: subject.roleId === 'doctor', reason: '' };") }, /no longer asks the vetting register's can\(\)/],
  ["iOS deciding who may sign by itself", { [IOS_M]: text(IOS_M, "let decision = can(subject, SickNoteData.capability)", "let decision = VettingDecision(allowed: true, reason: nil, blockedBy: [])") }, /no longer asks the vetting register's can\(\)/],
  ["Android deciding who may sign by itself", { [AND_M]: text(AND_M, "val decision = can(subject, SickNoteData.capability)", "val decision = VettingDecision(true, null, emptyList())") }, /no longer asks the vetting register's can\(\)/],
  ["the web sign button live through a refusal", { [WEB]: text(WEB, "disabled={refusals.length > 0}", "disabled={false}") }, /lets the sign button act while a refusal stands/],
  ["iOS signing through a refusal", { [IOS_V]: text(IOS_V, "guard refusals.isEmpty else { return }", "") }, /lets the sign button act/],
  ["Android signing through a refusal", { [AND_S]: text(AND_S, "enabled = refusals.isEmpty(),", "enabled = true,") }, /lets the sign button act/],
  /* 3. No identity number */
  ["an identity-number field in the contract", { [SN]: json(SN, (d) => { d.fields.push({ id: "idNumber", label: "ID number", rule: "x", from: "x" }); }) }, /carries a "idNumber" field/],
  ["an identity number on the web certificate", { [LIB]: text(LIB, "{ id: 'patient', label: label('patient'), value: draft.patient },", "{ id: 'patient', label: label('patient'), value: draft.patient },\n  { id: 'idNumber', label: 'ID', value: '' },") }, /names an identity number/],
  ["an identity number on Android", { [AND_S]: text(AND_S, "@Composable private fun Choice(", "private val idNumber = \"\"\n\n@Composable private fun Choice(") }, /names an identity number/],
  /* 4. The illness only with agreement */
  ["the web printing the illness without asking", { [LIB]: text(LIB, "draft.consent && draft.description.trim() ? draft.description.trim() : contract.diagnosis.withheld", "draft.description.trim() || contract.diagnosis.withheld") }, /prints the illness without asking/],
  ["iOS printing the illness without asking", { [IOS_M]: text(IOS_M, "let description = draft.consent && !draft", "let description = !draft") }, /prints the illness without asking/],
  ["Android printing the illness without asking", { [AND_M]: text(AND_M, "if (draft.consent && draft.description.isNotBlank())", "if (draft.description.isNotBlank())") }, /prints the illness without asking/],
  ["the web keeping the words when agreement goes", { [WEB]: text(WEB, "description: e.target.checked ? draft.description : ''", "description: draft.description") }, /keeps the words when the agreement is withdrawn/],
  ["iOS keeping the words when agreement goes", { [IOS_V]: text(IOS_V, "if !on { draft.description = \"\" }", "") }, /keeps the words/],
  /* 5. Nothing typed */
  ["the web typing the longest period", { [LIB]: text(LIB, "if (daysCovered(draft) > contract.period.maxDays)", "if (daysCovered(draft) > 14)") }, /no longer compares the period|types 14/],
  ["iOS typing how far back", { [IOS_M]: text(IOS_M, "seen.dayOffset - draft.fromOffset > SickNoteData.Period.backdateDays {", "seen.dayOffset - draft.fromOffset > 2 {") }, /no longer compares the period/],
  ["a date typed on Android", { [AND_M]: text(AND_M, "fun day(offset: Int): String = LocalDate.now()", "fun day(offset: Int): String = LocalDate.parse(\"2026-10-02\")") }, /types a date/],
  ["the web screen without the not-issued notice", { [WEB]: text(WEB, "<FileText size={16} aria-hidden=\"true\"/>{c.notIssued}", "<FileText size={16} aria-hidden=\"true\"/>") }, /no longer shows c\.notIssued/],
  ["the certificate sheet without its stamp", { [SHEET]: text(SHEET, "{sickNote.notIssuedShort}", "") }, /no longer shows sickNote\.notIssuedShort/],
  ["iOS without the not-issued notice", { [IOS_V]: readDisk(IOS_V).replaceAll("SickNoteData.notIssued)", "SickNoteData.Screen.title)") }, /no longer shows SickNoteData\.notIssued/],
  ["Android typing the notice", { [AND_S]: text(AND_S, "Note(SickNoteData.memoryOnly)", "Note(\"Not issued. A preview.\")") }, /types the notice/],
  /* 6. The fixtures */
  ["a fixture expecting the wrong answer", { [SN]: json(SN, (d) => { d.fixtures.cases[0].expect = ["not-a-doctor"]; }) }, /expects \["not-a-doctor"\] and .* answers \[\]/],
  ["a refusal no fixture reaches", { [SN]: json(SN, (d) => { d.fixtures.cases = d.fixtures.cases.filter((f) => !f.expect.includes("starts-after-issue")); }) }, /No fixture in .* expects "starts-after-issue"/],
  ["the rules letting a nurse through", {}, /expects \["not-a-doctor"\]/, { ...rules, refusalsFor: (d, i) => rules.refusalsFor(d, { ...i, granted: true, allowed: true }) }],
  ["the rules backdating further", {}, /expects \["backdated-too-far"\]/, { ...rules, refusalsFor: (d, i) => rules.refusalsFor(d, i).filter((r) => r.id !== "backdated-too-far") }],
  ["the rules printing the illness", {}, /prints "A stomach bug"/, { ...rules, certificateFrom: (d, i, f) => { const c = rules.certificateFrom(d, i, f); return { ...c, lines: c.lines.map((l) => (l.id === "description" ? { ...l, value: d.description } : l)) }; } }],
  /* 7. Registered everywhere */
  ["the generator unregistered", { "package.json": json("package.json", (d) => { delete d.scripts["sick-note"]; }) }, /no longer registers `npm run sick-note`/],
  ["a Swift file left out of the Xcode project", { "apps/ios/MyThuso.xcodeproj/project.pbxproj": readDisk("apps/ios/MyThuso.xcodeproj/project.pbxproj").replace(",A11ACCE55B00000000000SN6", "") }, /SickNoteView\.swift is not registered/],
  ["the iOS board no longer opening the page", { "apps/ios/MyThuso/Features/WorkspaceView.swift": text("apps/ios/MyThuso/Features/WorkspaceView.swift", "{ SickNoteView() }", "{ EmptyView() }") }, /no longer opens SickNoteView/],
  ["Android no longer routing the page", { "apps/android/app/src/main/java/za/co/mythuso/ui/AccountScreens.kt": text("apps/android/app/src/main/java/za/co/mythuso/ui/AccountScreens.kt", "-> SickNoteScreen(store)", "-> DoctorFeesScreen()") }, /no longer routes the contract's deskTitle/],
  ["the composer's props renamed", { [WEB]: text(WEB, "export function SickNoteComposer({ reference = 'TH-2048', patient = 'Lerato Molefe', writer = 'D-401', onClose, onSign }", "export function SickNoteComposer({ consultation = 'TH-2048', patient = 'Lerato Molefe', writer = 'D-401', onClose, onSign }") }, /no longer exports SickNoteComposer/],
  ["the doctor's section imported statically", { "apps/web/src/shells/StaffShell.tsx": text("apps/web/src/shells/StaffShell.tsx", "const SickNoteDesk = lazy(() => import('../features/SickNote').then(m => ({ default: m.SickNoteDesk })));", "import { SickNoteDesk } from '../features/SickNote';") }, /own dynamic import/],
  ["the doctor's section renamed", { "apps/web/src/shells/StaffShell.tsx": readDisk("apps/web/src/shells/StaffShell.tsx").replaceAll("'Medical certificates'", "'Sick notes'") }, /no longer "Medical certificates"/],
  ["the patient entry naming the certificate", { "apps/web/src/App.tsx": readDisk("apps/web/src/App.tsx") + "\nexport const x = 'SickNote';\n" }, /names the certificate/],
  ["the Passport no longer reading the session", { "apps/web/src/features/PassportScreens.tsx": text("apps/web/src/features/PassportScreens.tsx", "<Suspense fallback={null}><WrittenThisSession/></Suspense>", "") }, /no longer shows what a doctor signed in this session/],
  ["the Passport importing the certificate statically", { "apps/web/src/features/PassportScreens.tsx": text("apps/web/src/features/PassportScreens.tsx", "const WrittenThisSession = lazy(() => import('./SickNoteCertificate').then(m => ({ default: m.WrittenThisSession })));", "import { WrittenThisSession } from './SickNoteCertificate';") }, /on its own dynamic import/],
  ["the Passport showing somebody else's certificate", { [SHEET]: text(SHEET, ".filter(c => c.patient === holder.name)", "") }, /for somebody other than the Passport's holder/],
  ["the web keeping a certificate in storage", { [LIB]: text(LIB, "written = [certificate, ...written];", "written = [certificate, ...written]; sessionStorage.setItem('c', '1');") }, /reaches for storage or the network/],
  ["the journey skipping a viewport", { "tests/sick-note.spec.ts": readDisk("tests/sick-note.spec.ts") + "\ntest.skip(true, 'mobile');\n" }, /skips a viewport/],
  ["no map row", { "docs/FEATURE-MAP.md": readDisk("docs/FEATURE-MAP.md").replaceAll("sick-note.json", "sick.json") }, /no row for the medical certificate/],
];
let failed = 0;
for (const [name, patch, expected, ruleSet] of proofs) {
  let message = null;
  try { run(patch, ruleSet); } catch (e) { message = e.message; }
  if (!message || !expected.test(message)) { failed++; console.log(`NOT PROVEN  ${name}\n  got: ${message ?? "no refusal"}`); }
  else console.log(`proven      ${name}`);
}
console.log(run({}));
if (failed) { console.error(`${failed} not proven`); process.exit(1); }
