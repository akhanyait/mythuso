/* Proves each rule in scripts/check-skin-check.mjs fires, by handing the module a broken copy of one file
   through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-skin-check.mjs`; it is not part of the build, because a proof that ran on every build
   would be the build proving itself. Nothing on disk is changed. */
import { existsSync, readFileSync } from "node:fs";
import { checkSkinCheck } from "./check-skin-check.mjs";
import { hasSequence, stems } from "../packages/gilbertone/src/stems.ts";

const readDisk = (f) => readFileSync(f, "utf8");
const run = (patch) => checkSkinCheck({ read: (f) => (patch[f] !== undefined ? patch[f] : readDisk(f)), stems, hasSequence, existsSync: (f) => (patch[f] === null ? false : existsSync(f)) });
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const SKIN = "packages/catalog/skin-check.json";
const WEB = "apps/web/src/features/SkinCheck.tsx";
const IOS = "apps/ios/MyThuso/Features/SkinCheckView.swift";
const ANDROID = "apps/android/app/src/main/java/za/co/mythuso/ui/SkinCheckScreens.kt";
const JOURNEY = "tests/skin-check.spec.ts";
const q = (d, id) => d.questions.find((x) => x.id === id);
const rule = (d, id) => d.rules.find((x) => x.id === id);

const proofs = [
  ["a reviewer named who never signed", { [SKIN]: json(SKIN, (d) => { d.review.reviewedBy = "Sr A. Nurse"; }) }, /names a reviewer or has lost its unreviewed sentence/],
  ["a digit addressed to the patient", { [SKIN]: json(SKIN, (d) => { q(d, "who").options[3].label = "On a baby younger than 3 months"; }) }, /carries a digit/],
  ["a sentence telling her what she has", { [SKIN]: json(SKIN, (d) => { d.outcomes["general-information"].lead = "You have eczema, most likely."; }) }, /tells her what she has/],
  ["a clinical.json refused phrase", { [SKIN]: json(SKIN, (d) => { d.screen.lead = "Find out what you are suffering from."; }) }, /Nothing addressed to a patient tells them they have a condition/],
  ["the photo sentence dropped from what it is not", { [SKIN]: json(SKIN, (d) => { d.whatItIsNot.shift(); }) }, /no longer says, on the screen, that nothing looks at the photo/],
  ["an option naming a single entry", { [SKIN]: json(SKIN, (d) => { q(d, "looks").options.find((o) => o.id === "ring").oftenSeenIn = ["cond-030"]; }) }, /never shown a single answer/],
  ["an option naming an entry the base does not have", { [SKIN]: json(SKIN, (d) => { q(d, "looks").options[0].oftenSeenIn.push("cond-999"); }) }, /does not have/],
  ["an emergency rule whose words the terms do not raise", { [SKIN]: json(SKIN, (d) => { q(d, "signs").options.find((o) => o.id === "airway").label = "Swelling of the lips, face or tongue"; }) }, /do not raise/],
  ["an option the terms raise with no emergency rule", { [SKIN]: json(SKIN, (d) => { q(d, "signs").options.find((o) => o.id === "burn").label = "A burn, and trouble breathing"; }) }, /and no emergency rule names it/],
  ["an emergency rule demoted to today", { [SKIN]: json(SKIN, (d) => { const r = rule(d, "glass"); r.outcome = "sister-today"; r.says = "A rash."; }) }, /and no emergency rule names it/],
  ["a rule for today with no entry and no reason", { [SKIN]: json(SKIN, (d) => { delete rule(d, "young-baby").keptBecause; }) }, /draws on no knowledge entry and says nothing about why/],
  ["a rule reaching an outcome that is not one", { [SKIN]: json(SKIN, (d) => { rule(d, "burn").outcome = "general-information"; }) }, /reaches "general-information"/],
  ["self-care from a condition's home care", { [SKIN]: json(SKIN, (d) => { d.selfCare.always.push("cond-028"); }) }, /Care steps come from the first-aid file only/],
  ["the signs question no longer required", { [SKIN]: json(SKIN, (d) => { d.required = ["who"]; }) }, /no longer requires the signs question/],
  ["the swelling-lips fixture dropped", { [SKIN]: json(SKIN, (d) => { d.fixtures.cases = d.fixtures.cases.filter((f) => !/lips are swelling/.test(f.typed ?? "")); }) }, /swelling lips/],
  ["a video type accepted as a photo", { [SKIN]: json(SKIN, (d) => { d.photo.accept.push("video/mp4"); }) }, /A photo is an image/],
  /* The clip, since 2 October 2026. */
  ["a clip decision with no date", { [SKIN]: json(SKIN, (d) => { d.clip.on = "2026-10-01"; }) }, /clip has lost who decided it/],
  ["a clip a minute and a half long", { [SKIN]: json(SKIN, (d) => { d.clip.maxSeconds = 90; }) }, /A clip is short/],
  ["a cap the sentence does not say", { [SKIN]: json(SKIN, (d) => { d.clip.maxSeconds = 20; }) }, /does not say "twenty seconds"/],
  ["an audio file accepted as a clip", { [SKIN]: json(SKIN, (d) => { d.clip.accept.push("audio/mpeg"); }) }, /an audio file is never taken/],
  ["the sound sentence softened", { [SKIN]: json(SKIN, (d) => { d.clip.sound = "The clip plays quietly."; }) }, /not played or used/],
  ["video still refused beside a clip taken", { [SKIN]: json(SKIN, (d) => { d.photo.videoRefused = "Video is not taken here."; }) }, /still carries photo\.videoRefused/],
  ["nothing said about the clip not being read", { [SKIN]: json(SKIN, (d) => { d.whatItIsNot[0] = "GilbertOne does not look at your photo."; }) }, /nothing looks at the clip/],
  ["the web screen listening to the clip", { [WEB]: text(WEB, "const copy = () => {", "const ears = () => new AudioContext();\n  const copy = () => {") }, /reaches for AudioContext/],
  ["the web screen recording the clip again", { [WEB]: text(WEB, "const copy = () => {", "const again = (v: HTMLVideoElement) => new MediaRecorder(v.captureStream());\n  const copy = () => {") }, /reaches for (captureStream|MediaRecorder)/],
  ["the cap typed on the web", { "apps/web/src/lib/skin-check.ts": text("apps/web/src/lib/skin-check.ts", "if (seconds > skinContract.clip.maxSeconds)", "if (seconds > 15 || seconds > skinContract.clip.maxSeconds)") }, /types 15, the clip's cap/],
  ["the clip given the browser's controls", { [WEB]: text(WEB, "                  playsInline\n", "                  playsInline\n                  controls\n") }, /one muted, inline video element/],
  ["the clip not muted", { [WEB]: text(WEB, "                  muted\n", "") }, /one muted, inline video element/],
  ["the clip unmuted by the screen", { [WEB]: text(WEB, "    silence(element);\n    if (element.paused)", "    element.muted = false;\n    if (element.paused)") }, /sets \.muted =/],
  ["the clip's volume left up", { [WEB]: text(WEB, "  video.volume = 0;", "  video.volume = 0.5;") }, /sets \.volume =|silence\(\) no longer/],
  ["the clip not silenced on a volume change", { [WEB]: text(WEB, "onVolumeChange={(event) => silence(event.currentTarget)}", "onVolumeChange={() => undefined}") }, /silences itself on any volume change/],
  ["the clip's URL made outside the hook", { [WEB]: text(WEB, "const clipUrl = useHeldUrl(clip);", "const clipUrl = clip ? String(clip.name) : \"\";") }, /does not take its URL from useHeldUrl/],
  ["an audio type on the input", { [WEB]: text(WEB, 'accept="image/*,video/*"', 'accept="image/*,video/*,audio/*"') }, /one input asking for an image or a video/],
  ["a clip held whatever its length", { [WEB]: text(WEB, "const why = clipLengthProblem(element.duration);", "const why = null;") }, /no longer lets go of a clip longer/],
  ["iOS playing the clip with system controls", { [IOS]: text(IOS, "private func end() {", "private var system: some View { VideoPlayer(player: nil) }\n\n    private func end() {") }, /reaches for VideoPlayer/],
  ["iOS playing the clip's sound track", { [IOS]: text(IOS, "withMediaType: .video).first", "withMediaType: .audio).first") }, /reaches for withMediaType: \.audio/],
  ["iOS unmuting the clip", { [IOS]: text(IOS, "        player.isMuted = true\n        player.volume = 0", "        player.isMuted = false") }, /reaches for isMuted = false/],
  ["iOS asking for the microphone", { [IOS]: text(IOS, "private func end() {", "private let ask = AVAudioSession.sharedInstance()\n\n    private func end() {") }, /reaches for AVAudioSession/],
  ["iOS writing a file outside SkinClipFile", { [IOS]: text(IOS, "private func end() {", "private func keep(_ data: Data) { FileManager.default.createFile(atPath: \"x\", contents: data) }\n\n    private func end() {") }, /reaches for FileManager/],
  ["SkinClipFile moving the picker's file", { [IOS]: text(IOS, "try FileManager.default.copyItem(at: received, to: copy)", "try FileManager.default.moveItem(at: received, to: copy)") }, /SkinClipFile does more/],
  ["iOS ending the check without deleting the copy", { [IOS]: text(IOS, "        picked = nil\n        letGoOfClip()\n", "        picked = nil\n") }, /no longer deletes the clip's temporary copy/],
  ["iOS keeping a refused clip", { [IOS]: text(IOS, "{ SkinClipFile.delete(url); problem = why; return }", "{ problem = why; return }") }, /no longer deletes the clip's temporary copy/],
  ["iOS never sweeping a left copy", { [IOS]: text(IOS, ".onAppear { SkinClipFile.sweep() }", "") }, /no longer deletes the clip's temporary copy/],
  ["iOS choosing photos only", { [IOS]: text(IOS, "matching: .any(of: [.images, .videos])", "matching: .images") }, /no longer chooses the photo or the clip/],
  ["Android choosing photos only", { [ANDROID]: text(ANDROID, "PickVisualMedia.ImageAndVideo", "PickVisualMedia.ImageOnly") }, /reaches for ImageOnly/],
  ["Android asking for the microphone", { [ANDROID]: text(ANDROID, "private fun loadPhoto(", "private val ask = android.Manifest.permission.RECORD_AUDIO\n\nprivate fun loadPhoto(") }, /reaches for (Manifest\.permission\.RECORD_AUDIO|RECORD_AUDIO)/],
  ["Android recording a clip with the camera", { [ANDROID]: text(ANDROID, "private fun loadPhoto(", "private val record = ActivityResultContracts.CaptureVideo()\n\nprivate fun loadPhoto(") }, /reaches for CaptureVideo/],
  ["Android giving the clip a volume bar", { [ANDROID]: text(ANDROID, "setVideoURI(address)", "setVideoURI(address)\n                                setMediaController(android.widget.MediaController(viewContext))") }, /reaches for (MediaController|setMediaController)/],
  ["Android playing the clip's sound", { [ANDROID]: text(ANDROID, "media.setVolume(0f, 0f)", "media.setVolume(1f, 1f)") }, /zero volume/],
  ["Android taking audio focus", { [ANDROID]: text(ANDROID, "setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE)", "setAudioFocusRequest(AudioManager.AUDIOFOCUS_GAIN)") }, /zero volume/],
  ["Android holding a clip whatever its length", { [ANDROID]: text(ANDROID, "val why = SkinCheck.clipProblem(clipLength(context, uri))", "val why: String? = null") }, /no longer refuses a clip over/],
  ["Android keeping the clip after an emergency", { [ANDROID]: text(ANDROID, "fun handOver(words: String) { photo = null; holdClip(null); onEmergency(words) }", "fun handOver(words: String) { photo = null; onEmergency(words) }") }, /no longer refuses a clip over the contract's cap or of unknown length before holding it, or no longer lets it go/],
  ["the journey choosing no clip", { [JOURNEY]: readDisk(JOURNEY).replaceAll('mimeType: "video/webm"', 'mimeType: "image/png"') }, /no longer chooses a clip/],
  ["the photo reader given a route", { [SKIN]: json(SKIN, (d) => { d.photoReading.route = "POST /v1/photo/read"; }) }, /does not declare live/],
  ["a waited-on thing marked in place", { [SKIN]: json(SKIN, (d) => { d.photoReading.waitsOn[1].inPlace = true; }) }, /marks "dpia" in place/],
  ["a photo route declared in the API contract", { "packages/catalog/apis/assistant.json": json("packages/catalog/apis/assistant.json", (d) => { d.routes.push({ method: "POST", path: "/v1/skin/photo", version: 1, status: "proposed" }); }) }, /declares POST \/v1\/skin\/photo/],
  ["an added knowledge entry claiming a review", { "packages/catalog/knowledge/conditions.json": json("packages/catalog/knowledge/conditions.json", (d) => { d.find((c) => c.id === "cond-066").review.reviewedBy = "Dr Somebody"; }) }, /names a reviewer or says it is reviewed/],
  ["an added knowledge entry nothing shows", { "packages/catalog/knowledge/conditions.json": json("packages/catalog/knowledge/conditions.json", (d) => { d.push({ ...d.find((c) => c.id === "cond-066"), id: "cond-998" }); }) }, /never shows it/],
  ["the web screen uploading the photo", { [WEB]: text(WEB, "const copy = () => {", "const send = () => fetch('/x', { method: 'POST', body: file });\n  const copy = () => {") }, /reaches for fetch/],
  ["the web screen keeping the photo", { [WEB]: text(WEB, "const copy = () => {", "const keep = () => sessionStorage.setItem('p', url);\n  const copy = () => {") }, /reaches for sessionStorage/],
  ["the web screen reading the photo's bytes", { [WEB]: text(WEB, "const copy = () => {", "const look = () => new FileReader();\n  const copy = () => {") }, /reaches for FileReader/],
  ["an object URL nobody revokes", { [WEB]: text(WEB, "return () => URL.revokeObjectURL(next);", "return undefined;") }, /revokes 0/],
  ["a capture attribute on the input", { [WEB]: text(WEB, 'accept="image/*,video/*"', 'accept="image/*,video/*"\n              capture="environment"') }, /no capture attribute/],
  ["a sentence typed onto the web screen", { [WEB]: text(WEB, "{c.screen.lead}", "Take a photo of the rash please") }, /types words onto the screen/],
  ["the web screen deciding an outcome itself", { [WEB]: text(WEB, "const now = skinOutcome(answers, typed);", "const now = skinOutcome(answers, typed);\n    const mine = { kind: 'sister-today', rules: [] };") }, /composes an outcome itself/],
  ["the web screen without the review state", { [WEB]: text(WEB, '<p className="sk-review">{skinReviewSentence()}</p>', "") }, /no longer shows the check's review sentence/],
  ["the screen imported statically by the panel", { "apps/web/src/features/Assistant.tsx": text("apps/web/src/features/Assistant.tsx", 'const SkinCheck = lazy(() => import("./SkinCheck"));', 'import SkinCheck from "./SkinCheck";') }, /no longer loads the skin check on its own dynamic import/],
  ["the panel answering an emergency without the conversation", { "apps/web/src/features/Assistant.tsx": text("apps/web/src/features/Assistant.tsx", "moved(emergencyTurn(turns, words));", "moved(turns);") }, /no longer hands the skin check's emergency/],
  ["the patient entry naming the check", { "apps/web/src/App.tsx": readDisk("apps/web/src/App.tsx") + "\n// SkinCheck\n" }, /is not on the patient's first view/],
  ["iOS saving the photo to the library", { [IOS]: text(IOS, "private func end() {", "private func keep(_ image: UIImage) { UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil) }\n\n    private func end() {") }, /reaches for UIImageWriteToSavedPhotosAlbum/],
  ["iOS asking for the camera", { [IOS]: text(IOS, "private func end() {", "private func camera() -> UIImagePickerController { UIImagePickerController() }\n\n    private func end() {") }, /reaches for UIImagePickerController/],
  ["iOS typing a sentence", { [IOS]: text(IOS, "note(SkinCheckData.Photo.held)", 'Text("Your photo is safe with us")') }, /types words onto the check/],
  ["Android writing the photo to a file", { [ANDROID]: text(ANDROID, "private fun loadPhoto(", "private fun keep(context: Context) = java.io.File(context.cacheDir, \"p\")\n\nprivate fun loadPhoto(") }, /reaches for cacheDir/],
  ["Android taking a full photo to a file", { [ANDROID]: text(ANDROID, "ActivityResultContracts.TakePicturePreview()", "ActivityResultContracts.TakePicture()") }, /TakePicture\(\)|in-memory camera preview/],
  ["Android deciding an outcome itself", { [ANDROID]: text(ANDROID, "val shown = outcome is", "val forced = SkinOutcome.SisterToday(emptyList())\n    val shown = outcome is") }, /composes an outcome itself/],
  ["the iOS assistant no longer opening the check", { "apps/ios/MyThuso/Features/AssistantView.swift": text("apps/ios/MyThuso/Features/AssistantView.swift", "SkinCheckView(onEmergency", "SkinCheckScreen(onEmergency") }, /iOS GilbertOne no longer opens the skin check/],
  ["the Android assistant answering an emergency some other way", { "apps/android/app/src/main/java/za/co/mythuso/ui/GilbertScreens.kt": text("apps/android/app/src/main/java/za/co/mythuso/ui/GilbertScreens.kt", "turns = Gilbert.send(words, GilbertChannel.CHOSEN, turns, store.visits.firstOrNull())", "turns = turns") }, /Android GilbertOne no longer opens the skin check/],
  ["a file left out of the Xcode project", { "apps/ios/MyThuso.xcodeproj/project.pbxproj": readDisk("apps/ios/MyThuso.xcodeproj/project.pbxproj").replace(",A11ACCE55B00000000000SK6", "") }, /SkinCheckView\.swift is not registered/],
  ["the generator unregistered", { "package.json": json("package.json", (d) => { delete d.scripts["skin-check"]; }) }, /no longer registers `npm run skin-check`/],
  ["the journey skipping a viewport", { "tests/skin-check.spec.ts": readDisk("tests/skin-check.spec.ts") + "\ntest.skip(true, 'mobile');\n" }, /skips a viewport/],
  ["no map row", { "docs/FEATURE-MAP.md": readDisk("docs/FEATURE-MAP.md").replaceAll("skin-check.json", "skin.json") }, /no row for the (skin check|photo reader)/],
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
