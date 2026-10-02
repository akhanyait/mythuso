/* Proves each rule in scripts/check-photo-reading.mjs fires, by handing the module a broken copy of one file
   through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-photo-reading.mjs`; it is not part of the build, because a proof that ran on every build
   would be the build proving itself. Nothing on disk is changed. */
import { existsSync, readFileSync } from "node:fs";
import { checkPhotoReading } from "./check-photo-reading.mjs";

const readDisk = (f) => readFileSync(f, "utf8");
const run = (patch) => checkPhotoReading({ read: (f) => (patch[f] !== undefined ? patch[f] : readDisk(f)), existsSync: (f) => (patch[f] === null ? false : existsSync(f)) });
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const SKIN = "packages/catalog/skin-check.json";
const APIS = "packages/catalog/apis/assistant.json";
const OVERRIDE = "packages/catalog/demonstration-override.json";
const SERVICE = "apps/assistant-api/src/lib/photo-reading.ts";
const SERVER = "apps/assistant-api/src/server.ts";
const SHARED = "packages/gilbertone/src/skin-photo-reading.ts";
const LIB = "apps/web/src/lib/photo-reading.ts";
const SCREEN = "apps/web/src/features/SkinCheck.tsx";
const JOURNEY = "tests/skin-check.spec.ts";
const postRoute = (d) => d.routes.find((r) => r.method === "POST" && r.path === "/v1/photo-reading");

const proofs = [
  /* A. The contract. */
  ["the gate renamed", { [SKIN]: json(SKIN, (d) => { d.photoReading.gate = "photos"; }) }, /not built under the founder's demonstration override/],
  ["a waited-on thing dropped", { [SKIN]: json(SKIN, (d) => { d.photoReading.waitsOn.shift(); }) }, /no longer waits on "protocol"/],
  ["a waited-on thing marked in place", { [SKIN]: json(SKIN, (d) => { d.photoReading.waitsOn[2].inPlace = true; }) }, /marks "information-officer" in place/],
  ["the phones opened", { [SKIN]: json(SKIN, (d) => { d.photoReading.platforms = ["web", "ios"]; }) }, /web's alone/],
  ["a third picture route", { [APIS]: json(APIS, (d) => { d.routes.push({ ...postRoute(d), path: "/v1/skin/look" }); }) }, /no third/],
  ["the young baby's refusal dropped", { [APIS]: json(APIS, (d) => { const r = postRoute(d); r.refusals = r.refusals.filter((x) => x.id !== "photo-of-a-young-baby"); }) }, /no longer declares photo-of-a-young-baby/],
  ["the shut gate in other words", { [APIS]: json(APIS, (d) => { postRoute(d).refusals.find((x) => x.id === "photo-reading-not-open").statement = "Photo reading is off."; }) }, /word for word/],
  ["a free-text field in the answer", { [APIS]: json(APIS, (d) => { postRoute(d).response.push({ field: "description", type: "string", required: false, why: "x" }); }) }, /never a sentence of the model's/],
  ["the clip itself in the request", { [APIS]: json(APIS, (d) => { postRoute(d).request.push({ field: "clipBase64", type: "string", required: false, why: "x" }); }) }, /never a sentence of the model's/],
  ["a processor region abroad", { [SKIN]: json(SKIN, (d) => { d.photoReading.processor.regions.eastus = "East US"; }) }, /South African region/],
  ["the provider moved abroad", { "packages/catalog/model-providers.json": json("packages/catalog/model-providers.json", (d) => { d.providers.find((p) => p.id === "azure-openai").region = "swedencentral"; }) }, /South African region/],
  ["a picture too big for the body ceiling", { [SKIN]: json(SKIN, (d) => { d.photoReading.image.maxBytes = 700000; }) }, /fits inside/],
  ["a PNG sent", { [SKIN]: json(SKIN, (d) => { d.photoReading.image.type = "image/png"; }) }, /A JPEG no longer than/],
  ["the face described", { [SKIN]: json(SKIN, (d) => { d.photoReading.vocabulary.where.except = ["groin", "nappy"]; }) }, /never describes a face or a private area/],
  ["the signs question given to the model", { [SKIN]: json(SKIN, (d) => { d.photoReading.vocabulary.looks.question = "signs"; }) }, /never answers the signs question/],
  ["the override's gate not on", { [OVERRIDE]: json(OVERRIDE, (d) => { d.gates.find((g) => g.id === "photo-reading").state = "opened-when-built"; }) }, /capability that is on/],
  ["the screen not rendering the override", { [OVERRIDE]: json(OVERRIDE, (d) => { d.kinds.capability.renderedAt = [SERVICE]; }) }, /capability that is on, rendered by/],
  ["the picture's flow unrecorded", { "packages/catalog/api-registry.json": json("packages/catalog/api-registry.json", (d) => { d.dataFlows = d.dataFlows.filter((f) => f.route !== "POST /v1/photo-reading"); }) }, /as health information/],
  /* B. The service. */
  ["the override alone", { [SERVICE]: text(SERVICE, 'if (!(signed || overrideOpens("photo-reading", override)))', 'if (!overrideOpens("photo-reading", override))') }, /never the override alone/],
  ["the override asked twice", { [SERVICE]: text(SERVICE, "const demonstration = !signed;", 'const demonstration = overrideOpens("photo-reading", override);') }, /never the override alone/],
  ["signed by any one condition", { [SERVICE]: text(SERVICE, "waitsOn.every((condition) => condition.inPlace === true)", "waitsOn.some((condition) => condition.inPlace === true)") }, /signed from every waited-on thing/],
  ["the model tier not asked", { [SERVICE]: text(SERVICE, "if (!modelTierAllowed(options.processEnv ?? process.env)) return noModel;", "") }, /model tier/],
  ["a deployment that cannot look", { [SERVICE]: text(SERVICE, "if (!photoReading.processor.imageDeployments.includes(deployment)) return noModel;", "") }, /deployment that takes a picture/],
  ["the picture written to disk", { [SERVICE]: text(SERVICE, "/* The skin check's photo reader", 'import { writeFileSync } from "node:fs";\n/* The skin check\'s photo reader') }, /reaches for (from "node:fs|writeFile)/],
  ["the picture logged", { [SERVICE]: text(SERVICE, "  const reading = readingFromText(text);", "  console.log(imageBase64.slice(0, 32));\n  const reading = readingFromText(text);") }, /reaches for console\./],
  ["the picture put in a session", { [SERVICE]: text(SERVICE, 'import { modelTierAllowed } from "./activation.ts";', 'import { modelTierAllowed } from "./activation.ts";\nimport { createSessionStore } from "./session-store.ts";') }, /reaches for session-store/],
  ["the decoded bytes left", { [SERVICE]: text(SERVICE, "  bytes.fill(0);\n", "") }, /zeroes/],
  ["the model's text read raw", { [SERVICE]: text(SERVICE, 'const reading = readingFromText(text);\n  if (!reading) return { ok: false, refusalId: "photo-not-described" };', "const reading = JSON.parse(text);") }, /through the shared validator/],
  ["the validator keeping an extra key", { [SHARED]: text(SHARED, 'keys.join() !== "looks,outcome,where"', '!keys.includes("outcome")') }, /any key but outcome, looks and where/],
  ["the validator keeping an unknown id", { [SHARED]: text(SHARED, "!allowed.includes(id) || ", "") }, /any id the contract does not list/],
  ["the route answering the model's words", { [SERVER]: text(SERVER, "{ looks: read.reading.looks, where: read.reading.where }", "{ ...read.reading }") }, /answers something other than the validated reading/],
  ["the route logging the picture", { [SERVER]: text(SERVER, 'console.error(failureLine("assistant.photo-reading.failed", "/assistant/v1/photo-reading", error));', 'console.error(failureLine("assistant.photo-reading.failed", "/assistant/v1/photo-reading", error));\n        console.log("photo", checked.imageBase64.length);') }, /log something other than one failure line/],
  ["the route reading the body before the gate", { [SERVER]: text(SERVER, "      const gate = photos.gate();\n      if (!gate.open) return refuse(res, cors.headers, gate.refusalId);\n      const body = await readJsonBody(req);", "      const body = await readJsonBody(req);\n      const gate = photos.gate();\n      if (!gate.open) return refuse(res, cors.headers, gate.refusalId);") }, /does not ask the reader's gate first/],
  /* C. The web. */
  ["the clip's file uploaded", { [LIB]: text(LIB, "declare const __ASSISTANT_API_URL__: string;", "declare const __ASSISTANT_API_URL__: string;\nexport const sendClip = (clip: File) => clip.name;") }, /reaches for File/],
  ["the clip recorded", { [LIB]: text(LIB, "declare const __ASSISTANT_API_URL__: string;", "declare const __ASSISTANT_API_URL__: string;\nexport const keep = (v: HTMLVideoElement) => v.captureStream();") }, /reaches for captureStream/],
  ["the still kept", { [LIB]: text(LIB, "declare const __ASSISTANT_API_URL__: string;", "declare const __ASSISTANT_API_URL__: string;\nexport const keep = (s: string) => sessionStorage.setItem(\"still\", s);") }, /reaches for sessionStorage/],
  ["a reader taking more than an element", { [LIB]: text(LIB, "export async function askToLook(element: HTMLImageElement | HTMLVideoElement, who", "export async function askToLook(element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, who") }, /take only the element on the screen/],
  ["a full-size PNG sent", { [LIB]: text(LIB, "canvas.toDataURL(photoReading.image.type, quality)", 'canvas.toDataURL("image/png", quality)') }, /one JPEG no larger than/],
  ["the canvas never emptied", { [LIB]: text(LIB, "    canvas.width = 0;\n", "") }, /empties its canvas/],
  ["the still not made smaller", { [LIB]: text(LIB, "photoReading.image.maxEdge / Math.max(width, height)", "1") }, /one JPEG no larger than/],
  ["her other answers sent with it", { [LIB]: text(LIB, "JSON.stringify({ userConsent: true, who, imageBase64, imageType: photoReading.image.type })", "JSON.stringify({ userConsent: true, who, imageBase64, imageType: photoReading.image.type, typed: who })") }, /sends something other than/],
  ["the answer trusted unchecked", { [LIB]: text(LIB, 'const reading = validateReading({ outcome: "described", looks: record.looks, where: record.where });', "const reading = { looks: record.looks as string[], where: record.where as string[] };") }, /holds the service's answer/],
  ["the screen handing over the clip", { [SCREEN]: text(SCREEN, "askToLook(element, ", "askToLook(clip as never, ") }, /something other than the element on the screen/],
  ["the screen handing over the file", { [SCREEN]: text(SCREEN, "const shownElement = () => (file ? photo.current : video.current);", "const shownElement = () => (file as never);") }, /something other than the element on the screen/],
  ["who not asked first", { [SCREEN]: text(SCREEN, "const refused = askRefusedLocally(answers);", "const refused = null as string | null;") }, /asks who the rash is on/],
  ["a suggestion straight into her answers", { [SCREEN]: text(SCREEN, "setAnswers(confirmReading(answers, suggestion.kept));", "setAnswers({ ...answers, looks: suggestion.offered.looks });") }, /some way other than confirmReading/],
  ["the outcome decided from the reading", { [SCREEN]: text(SCREEN, "const now = skinOutcome(answers, typed);", "const now = skinOutcome(answers, typed, suggestion);") }, /some way other than confirmReading/],
  ["the model's ids shown as they came", { [SCREEN]: text(SCREEN, "{optionLabel(question, id)}", "{id}") }, /other than the contract's own label/],
  ["no disclaimer on the look", { [SCREEN]: text(SCREEN, '{look.demonstration && <p className="sk-demo">{demonstrationDisclaimer}</p>}', "") }, /disclaimer word for word/],
  ["no picture-is-not-an-examination", { [SCREEN]: text(SCREEN, "{r.words.notAnExamination}", "") }, /a picture is not an examination/],
  ["the processor not named", { [SCREEN]: text(SCREEN, "{lookGoes(look.processor, look.region)}", "") }, /who reads the picture and where/],
  ["the look offered without the status route", { [SCREEN]: text(SCREEN, "{look && (file || (clip && clipReady)) && (", "{(file || (clip && clipReady)) && look && (") }, /only when the status route said open/],
  ["the reader imported on the panel", { "apps/web/src/features/Assistant.tsx": text("apps/web/src/features/Assistant.tsx", 'import "./assistant.css";', 'import "./assistant.css";\nimport { askToLook } from "../lib/photo-reading";') }, /imports the photo reader/],
  /* D. The phones. */
  ["iOS naming the route", { "apps/ios/MyThuso/Features/SkinCheckView.swift": readDisk("apps/ios/MyThuso/Features/SkinCheckView.swift") + '\nprivate let look = "/assistant/v1/photo-reading"\n' }, /names the photo reader/],
  ["Android offering the look", { "apps/android/app/src/main/java/za/co/mythuso/ui/SkinCheckScreens.kt": readDisk("apps/android/app/src/main/java/za/co/mythuso/ui/SkinCheckScreens.kt") + "\nprivate fun askToLook() = Unit\n" }, /names the photo reader/],
  /* E. Tests and documents. */
  ["the disk test dropped", { "apps/assistant-api/src/lib/photo-reading.test.ts": readDisk("apps/assistant-api/src/lib/photo-reading.test.ts").replaceAll("nothing was written to the state directory", "fine") }, /no longer proves nothing written to disk/],
  ["the vocabulary test dropped", { "apps/assistant-api/src/lib/photo-reading.test.ts": readDisk("apps/assistant-api/src/lib/photo-reading.test.ts").replaceAll("thrown away whole", "dropped") }, /an answer outside the vocabulary refused/],
  ["the journey not stubbing the reader", { [JOURNEY]: readDisk(JOURNEY).replaceAll('page.route("**/assistant/v1/photo-reading"', 'page.route("**/assistant/v1/other"') }, /no longer stubs the reader's route/],
  ["the journey not holding the clip back", { [JOURNEY]: readDisk(JOURNEY).replaceAll('not.toContain("GkXfo")', 'toBeTruthy()') }, /never the clip/],
  ["the governance record still saying when built", { "docs/governance/DEMONSTRATION-OVERRIDE.md": text("docs/governance/DEMONSTRATION-OVERRIDE.md", "| the four things it waits on | opened |", "| the four things it waits on | opened when built |") }, /does not say it is opened/],
  ["no map row", { "docs/FEATURE-MAP.md": readDisk("docs/FEATURE-MAP.md").replaceAll("skin-check.json#photoReading", "skin-check.json") }, /no row for the photo reader/],
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
