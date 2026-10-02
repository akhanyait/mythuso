/* The skin check's photo reader — 2 October 2026, under the founder's demonstration override. The founder's
   ask: "take picture or video then GilbertOne gives information and then can suggest if this must be
   escalated to sister or give recommendations on how to sort it out", and the same day: switch on, for
   demonstration with a disclaimer, everything waiting on the Information Officer. Built so that the model
   describes and the rules decide. This holds every piece of that to what it is allowed to be, and is a
   module of its own so each rule can be proven to fire by handing it a broken file through `read`
   (scripts/prove-photo-reading.mjs). scripts/check-skin-check.mjs calls it, so the boundary check runs it
   wherever it runs the skin check.

   WHAT IS HELD.
   A. The contract: built under the override and nothing wider — the four things it waits on still not in
      place, the web its only platform, two routes declared and built, every refusal it promises declared
      with the shut gate saying the skin check's own sentence, a request that carries one still and an
      answer that carries only option ids, a processor in a South African region, a JPEG whose size fits the
      service's own ceiling, a vocabulary without the signs question, the face or a private area, the
      override's gate on and rendered, and the picture's flow to the processor in the registry.
   B. The service: the gate asks the signatures or the override, never the override alone, and the model
      tier; the model's text reaches a caller only through the shared validator; and nothing is kept — no
      file system, no store, no session, no log line but a failure's type name.
   C. The web: one module sends one still drawn from an element, never a file, a blob or a clip; the
      screen hands it what is on the screen, asks who and where first, shows the disclaimer, the processor
      and "a picture is not an examination", shows a suggestion only as the contract's own labels, and
      reaches her answers only through confirmReading, which skinOutcome then reads as it reads any press.
   D. The phones say nothing new: no route, no button, no processor.
   E. The tests and the two documents. */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIN = "packages/catalog/skin-check.json";
const APIS = "packages/catalog/apis/assistant.json";
const OVERRIDE = "packages/catalog/demonstration-override.json";
const REGISTRY = "packages/catalog/api-registry.json";
const PROVIDERS = "packages/catalog/model-providers.json";
const SERVICE = "apps/assistant-api/src/lib/photo-reading.ts";
const SERVICE_TEST = "apps/assistant-api/src/lib/photo-reading.test.ts";
const SERVER = "apps/assistant-api/src/server.ts";
const SHARED = "packages/gilbertone/src/skin-photo-reading.ts";
const WEB_LIB = "apps/web/src/lib/photo-reading.ts";
const SCREEN = "apps/web/src/features/SkinCheck.tsx";
const JOURNEY = "tests/skin-check.spec.ts";
const MAP = "docs/FEATURE-MAP.md";
const OVERRIDE_DOC = "docs/governance/DEMONSTRATION-OVERRIDE.md";
export const PHOTO_READING_FILES = [SERVICE, SHARED, WEB_LIB];

const REFUSES = [
  "photo-reading-not-open",
  "photo-reading-has-no-model",
  "photo-reading-needs-consent",
  "photo-of-a-young-baby",
  "photo-not-a-jpeg",
  "payload-too-large",
  "invalid-request",
  "photo-shows-a-face-or-private-area",
  "photo-is-not-skin",
  "photo-not-clear",
  "photo-not-described",
  "internal-error",
];
const WAITS_ON = ["protocol", "dpia", "information-officer", "processor"];

const walk = (dir) => {
  let out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(walk(path));
    else out.push(path);
  }
  return out;
};

export function checkPhotoReading({ read, existsSync, list = walk }) {
  const fail = (why) => {
    throw new Error(`Photo reading: ${why}`);
  };
  const strip = (source) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const skin = JSON.parse(read(SKIN));
  const reading = skin.photoReading ?? {};
  const apis = JSON.parse(read(APIS));
  const override = JSON.parse(read(OVERRIDE));

  /* ---- A. The contract ------------------------------------------------------------------------------ */
  if (reading.status !== "built-under-override" || reading.gate !== "photo-reading" || !/founder/i.test(String(reading.decidedBy)) || reading.on !== "2026-10-02")
    fail(`${SKIN}'s photoReading is not built under the founder's demonstration override of 2 October 2026 through its gate photo-reading. It is opened by that decision and by nothing wider.`);
  const waits = reading.waitsOn ?? [];
  for (const id of WAITS_ON) if (!waits.some((w) => w.id === id)) fail(`${SKIN}'s photoReading no longer waits on "${id}". The override stands beside the four things it waits on and never removes one.`);
  const inPlace = waits.find((w) => w.inPlace !== false);
  if (inPlace) fail(`${SKIN}'s photoReading marks "${inPlace.id}" in place. None of the four exists; the day one does, it is recorded with who signed, and this check changes in the same commit.`);
  if (JSON.stringify(reading.platforms) !== JSON.stringify(["web"]))
    fail(`${SKIN}'s photoReading is built for ${JSON.stringify(reading.platforms)}. It is the web's alone until the override is generated to the phones, which keep saying GilbertOne does not read photos.`);
  const route = (key) => {
    const [, method, path, version] = String(key ?? "").match(/^(\w+) (\S+)@(\d+)$/) ?? [];
    return apis.routes.find((r) => r.method === method && r.path === path && r.version === Number(version) && !r.withdrawn);
  };
  const post = route(reading.route), get = route(reading.statusRoute);
  if (reading.route !== "POST /v1/photo-reading@1" || reading.statusRoute !== "GET /v1/photo-reading@1" || !post || !get)
    fail(`${SKIN}'s photoReading names ${reading.statusRoute} and ${reading.route}, which ${APIS} does not declare live. The reader is reached through its two declared routes and no other.`);
  for (const r of [get, post])
    if (r.status !== "built" || r.evidence?.file !== SERVER) fail(`${r.method} ${r.path}@${r.version} is not built in ${SERVER}.`);
  const other = apis.routes.find((r) => !r.withdrawn && r !== post && r !== get && /photo|image|vision|picture|skin/i.test(r.path));
  if (other) fail(`${APIS} declares ${other.method} ${other.path}. A picture of skin reaches the service through the photo reader's two routes and no third.`);
  const declared = new Set(post.refusals.map((x) => x.id));
  const missing = REFUSES.filter((id) => !declared.has(id));
  if (missing.length) fail(`POST /v1/photo-reading@1 no longer declares ${missing.join(", ")}. What the reader refuses is the valuable part, and each is said in the contract's words.`);
  for (const r of [get, post]) {
    const shut = r.refusals.find((x) => x.id === "photo-reading-not-open");
    if (!shut || shut.statement !== reading.sentence || !r.refusals.some((x) => x.id === "photo-reading-has-no-model"))
      fail(`${r.method} ${r.path}@${r.version}'s shut gate does not say ${SKIN}'s photoReading.sentence word for word, or it has lost the refusal for no model that may look. A closed reader says the same thing on every platform.`);
  }
  const fieldsOf = (fields) => fields.map((f) => f.field).sort().join();
  if (fieldsOf(post.request) !== "imageBase64,imageType,userConsent,who" || fieldsOf(post.response) !== "looks,where" || post.response.some((f) => f.type !== "list"))
    fail(`POST /v1/photo-reading@1 carries [${fieldsOf(post.request)}] in and [${fieldsOf(post.response)}] out. In: one still, its type, her agreement and who the rash is on; out: two lists of option ids, and never a sentence of the model's.`);
  const providers = JSON.parse(read(PROVIDERS)).providers;
  const card = providers.find((p) => p.id === reading.processor?.provider);
  const regions = reading.processor?.regions ?? {};
  if (!card || !regions[card.region] || Object.keys(regions).some((id) => !id.startsWith("southafrica")))
    fail(`${SKIN}'s photoReading.processor names "${reading.processor?.provider}" in "${card?.region}", or a region outside South Africa. The override's builder must name the processor and its country, and choose a South African region where one exists.`);
  const image = reading.image ?? {};
  const ceiling = Number((read(SERVER).match(/const MAX_BODY_BYTES = (\d+) \* 1024;/) ?? [])[1]) * 1024;
  if (image.type !== "image/jpeg" || !Number.isInteger(image.maxEdge) || image.maxEdge > 1024 || !(image.maxBytes > 0) || Math.ceil(image.maxBytes / 3) * 4 + 1024 > ceiling)
    fail(`${SKIN}'s photoReading.image is ${JSON.stringify(image)}. A JPEG no longer than 1024 pixels on its longer side, whose largest size in base64 fits inside ${SERVER}'s ${ceiling}-byte body ceiling — so the contract's own size refusal, not the body ceiling, is what a patient's picture meets.`);
  const vocab = reading.vocabulary ?? {};
  if (vocab.looks?.question !== "looks" || vocab.where?.question !== "where" || !vocab.looks.except?.includes("other") || !["face", "groin", "nappy"].every((id) => vocab.where.except?.includes(id)) || JSON.stringify(vocab.outcomes) !== JSON.stringify(["described", "unclear", "not-skin", "private-or-face"]))
    fail(`${SKIN}'s photoReading.vocabulary is not the looks and where options less "something else", the face, the groin and the nappy area, with the four outcomes. The model describes only in the check's own words, never answers the signs question, and never describes a face or a private area.`);
  const gate = (override.gates ?? []).find((g) => g.id === "photo-reading");
  const rendered = override.kinds?.capability?.renderedAt ?? [];
  if (!gate || gate.kind !== "capability" || gate.state !== "on" || !rendered.includes(SCREEN) || !rendered.includes(SERVICE))
    fail(`${OVERRIDE}'s gate photo-reading is not a capability that is on, rendered by ${SCREEN} and ${SERVICE}. The override says so wherever it opens.`);
  const flow = (JSON.parse(read(REGISTRY)).dataFlows ?? []).find((f) => f.route === "POST /v1/photo-reading" && f.field === "imageBase64");
  if (!flow || flow.providerRef !== reading.processor.provider || flow.phi !== true)
    fail(`${REGISTRY} does not record the picture going to ${reading.processor.provider} as health information. A picture of somebody's skin is, and no redaction takes that out of it.`);

  /* ---- B. The service ------------------------------------------------------------------------------- */
  const service = strip(read(SERVICE));
  const asks = service.match(/overrideOpens\(/g) ?? [];
  if (asks.length !== 1 || !/if \(!\(signed \|\| overrideOpens\("photo-reading", override\)\)\) return \{ open: false, refusalId: "photo-reading-not-open" \};/.test(service))
    fail(`${SERVICE} does not ask its gate as signed || overrideOpens("photo-reading") — once, and never the override alone. Going live is inForce false, and the signatures are still what opens it then.`);
  if (!/waitsOn\.every\(\(condition\) => condition\.inPlace === true\)/.test(service) || !/modelTierAllowed\(/.test(service) || !/imageDeployments\.includes\(deployment\)/.test(service) || !/photoReading\.processor\.regions/.test(service))
    fail(`${SERVICE}'s gate no longer reads signed from every waited-on thing in place, or no longer asks the model tier, the deployment that takes a picture and the South African region.`);
  const keeps = service.match(/from "node:fs|from "fs|founder-state|session-store|observations|settings-history|provider-vault|\bconsole\.|writeFile|appendFile|createWriteStream|localStorage/);
  if (keeps) fail(`${SERVICE} reaches for ${keeps[0]}. The picture is held in one request and kept nowhere — no file, no store, no session, no log line.`);
  if (!/bytes\.fill\(0\);/.test(service)) fail(`${SERVICE} no longer zeroes the picture's decoded bytes once they are measured.`);
  if (!/const reading = readingFromText\(text\);\s*if \(!reading\) return \{ ok: false, refusalId: "photo-not-described" \};/.test(service))
    fail(`${SERVICE} no longer holds the model's text to the contract's vocabulary through the shared validator before anything else reads it.`);
  const shared = strip(read(SHARED));
  if (!/keys\.join\(\) !== "looks,outcome,where"/.test(shared) || !/!allowed\.includes\(id\)/.test(shared) || /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|process\.env)\b/.test(shared))
    fail(`${SHARED}'s validator no longer refuses an answer with any key but outcome, looks and where, or any id the contract does not list — or it reaches outside itself.`);
  const server = read(SERVER).replace(/['`]/g, '"');
  const branch = (method) => {
    const at = server.indexOf(`req.method === "${method}" && req.url === "/assistant/v1/photo-reading"`);
    if (at < 0) return "";
    const next = server.slice(at + 1).search(/\n {4}if \(req\.method/);
    return strip(server.slice(at, next < 0 ? undefined : at + 1 + next));
  };
  const getBranch = branch("GET"), postBranch = branch("POST");
  for (const [method, code] of [["GET", getBranch], ["POST", postBranch]]) {
    const first = code.slice(code.indexOf("{") + 1).trim();
    if (!first.startsWith("const gate = photos.gate();") || !/if \(!gate\.open\) return refuse\(res, cors\.headers, gate\.refusalId\);/.test(code))
      fail(`${SERVER}'s ${method} /assistant/v1/photo-reading branch does not ask the reader's gate first and refuse on it. A shut reader reads nothing.`);
  }
  if (!/return send\(res, 200, cors\.headers, \{ looks: read\.reading\.looks, where: read\.reading\.where \}\);/.test(postBranch) || (postBranch.match(/send\(res, 200/g) ?? []).length !== 1)
    fail(`${SERVER}'s POST /assistant/v1/photo-reading branch answers something other than the validated reading's looks and where. The model's words never reach a caller.`);
  const logs = postBranch.match(/console\.\w+\([^;]*;/g) ?? [];
  if (logs.length !== 1 || logs[0] !== 'console.error(failureLine("assistant.photo-reading.failed", "/assistant/v1/photo-reading", error));' || /console\./.test(getBranch) || /\b(state|store|sessions|observations|vault)\./.test(postBranch + getBranch))
    fail(`${SERVER}'s photo-reading branches log something other than one failure line of an error's type name, or reach a store, a session or the state directory. The picture and what was said about it are kept nowhere.`);

  /* ---- C. The web ----------------------------------------------------------------------------------- */
  const lib = strip(read(WEB_LIB));
  const leaks = lib.match(/\b(File|Blob|FileReader|arrayBuffer|createObjectURL|toBlob|MediaRecorder|captureStream|AudioContext|audioTracks|localStorage|sessionStorage|indexedDB|caches|sendBeacon|WebSocket)\b|\.stream\(/);
  if (leaks) fail(`${WEB_LIB} reaches for ${leaks[0]}. It is handed an element and draws what is on it: never a file, a blob, the clip or its sound, and nothing is kept.`);
  if (!/export async function stillOf\(element: HTMLImageElement \| HTMLVideoElement\)/.test(lib) || !/export async function askToLook\(element: HTMLImageElement \| HTMLVideoElement, who: string, signal: AbortSignal\)/.test(lib))
    fail(`${WEB_LIB}'s stillOf and askToLook no longer take only the element on the screen. A clip never uploads; only a still drawn from it does.`);
  if ((lib.match(/toDataURL\(/g) ?? []).length !== 1 || !/canvas\.toDataURL\(photoReading\.image\.type, quality\)/.test(lib) || !/canvas\.width = 0;/.test(lib) || !/photoReading\.image\.maxEdge \/ Math\.max\(width, height\)/.test(lib))
    fail(`${WEB_LIB} no longer makes one JPEG no larger than the contract's maxEdge and empties its canvas.`);
  if ((lib.match(/\bfetch\(/g) ?? []).length !== 1 || !/body: JSON\.stringify\(\{ userConsent: true, who, imageBase64, imageType: photoReading\.image\.type \}\)/.test(lib) || !/photoReading\.route\.replace/.test(lib))
    fail(`${WEB_LIB} sends something other than her agreement, who, one still and its type, to anywhere but the contract's route.`);
  if (!/const reading = validateReading\(\{ outcome: "described", looks: record\.looks, where: record\.where \}\);/.test(lib))
    fail(`${WEB_LIB} no longer holds the service's answer to the contract's vocabulary before the screen sees it.`);
  const screen = strip(read(SCREEN));
  if (!/const shownElement = \(\) => \(file \? photo\.current : video\.current\);/.test(screen) || !/const element = shownElement\(\);/.test(screen) || (screen.match(/askToLook\(/g) ?? []).length !== 1 || !/askToLook\(element, /.test(screen))
    fail(`${SCREEN} hands the reader something other than the element on the screen — the photo's img or the clip's video. The file and the clip are never handed over.`);
  const lookAt = screen.slice(screen.indexOf("const lookAt = async () => {"), screen.indexOf("const keep = ("));
  if (lookAt.indexOf("askRefusedLocally(answers)") < 0 || lookAt.indexOf("askRefusedLocally(answers)") > lookAt.indexOf("askToLook("))
    fail(`${SCREEN} no longer asks who the rash is on and where it is before anything is sent. A picture of a young baby or a private area never leaves the phone.`);
  if ((screen.match(/confirmReading\(/g) ?? []).length !== 1 || !/setAnswers\(confirmReading\(answers, suggestion\.kept\)\);/.test(screen) || /skinOutcome\([^)]*suggest/.test(screen) || /setAnswers\([^)]*answer\./.test(screen))
    fail(`${SCREEN} lets a suggestion reach her answers some way other than confirmReading of what she kept. The rules read only what she confirmed, and skinOutcome decides the outcome from her answers alone.`);
  if (!/suggestion\.offered\[question\]\.map\(\(id\) => \([\s\S]{0,500}?\{optionLabel\(question, id\)\}/.test(screen) || />\s*\{(suggestion|answer)\.[\w.[\]]+\s*\}/.test(screen))
    fail(`${SCREEN} shows something of the reading other than the contract's own label for each id. The model's output never reaches her except as the check's own words.`);
  if (!/\{look\.demonstration && <p className="sk-demo">\{demonstrationDisclaimer\}<\/p>\}/.test(screen) || !/\{r\.words\.notAnExamination\}/.test(screen) || !/\{lookGoes\(look\.processor, look\.region\)\}/.test(screen) || !/\{look && \(file \|\| \(clip && clipReady\)\) && \(/.test(screen))
    fail(`${SCREEN} no longer offers the look only when the status route said open, with the override's disclaimer word for word, who reads the picture and where, and "a picture is not an examination".`);
  for (const file of list("apps/web/src").filter((f) => /\.(ts|tsx)$/.test(f) && f !== SCREEN && f !== WEB_LIB))
    if (/from "[^"]*lib\/photo-reading"|from "\.\/photo-reading"|skin-photo-reading/.test(read(file)))
      fail(`${file} imports the photo reader. It arrives with the skin check, behind the panel's dynamic import, and nowhere else.`);

  /* ---- D. The phones say nothing new ---------------------------------------------------------------- */
  for (const file of [...list("apps/ios/MyThuso"), ...list("apps/android/app/src/main")].filter((f) => /\.(swift|kt)$/.test(f) && !/\/ApisData\.(swift|kt)$/.test(f)))
    if (/\/v1\/photo-reading|PhotoReading|askToLook|lookGoes|notAnExamination|imageBase64/.test(read(file)))
      fail(`${file} names the photo reader. The phones are not opened: the override is not generated to them, and they keep saying GilbertOne does not read photos.`);

  /* ---- E. Tests and documents ----------------------------------------------------------------------- */
  const tests = existsSync(SERVICE_TEST) ? read(SERVICE_TEST) : "";
  for (const [needle, what] of [["nothing was written to the state directory", "nothing written to disk"], ["a reading writes no log line at all", "no log line on a reading"], ["thrown away whole", "an answer outside the vocabulary refused"], ["inForce false closes it", "the override off closing the gate"], ["payload-too-large", "an oversize picture refused"]])
    if (!tests.includes(needle)) fail(`${SERVICE_TEST} no longer proves ${what}.`);
  const journey = read(JOURNEY);
  if (!/page\.route\(\s*"\*\*\/assistant\/v1\/photo-reading"/.test(journey) || !/photo-reading-not-open/.test(journey) || !/startsWith\("\/9j\/"\)/.test(journey) || !/not\.toContain\("GkXfo"\)/.test(journey))
    fail(`${JOURNEY} no longer stubs the reader's route, falls back when it refuses, and holds that what was sent is a JPEG and never the clip.`);
  if (!/skin-check\.json#photoReading/.test(read(MAP)) || !/web only/i.test(read(MAP)))
    fail(`${MAP} has no row for the photo reader saying it is built on the web only.`);
  if (!/\| Photo reading \(`skin-check\.json#photoReading`\) \|[^\n]*\| opened \|/.test(read(OVERRIDE_DOC)))
    fail(`${OVERRIDE_DOC}'s photo-reading row does not say it is opened.`);

  return `Photo reading · built on the web under the founder's override through gate photo-reading, beside ${waits.length} things it waits on, none in place; ${get.method} and ${post.method} ${post.path} built, ${post.refusals.length} refusals on the reading route, the shut gate saying the skin check's own sentence; one still in (a JPEG of at most ${image.maxEdge} pixels and ${image.maxBytes} bytes, inside the service's ${ceiling}-byte ceiling) and only option ids out; the processor ${card.name} in ${regions[card.region]}; the gate signed || overrideOpens and the model tier, never the override alone; the model's text through the shared validator, nothing written, stored or logged but a failure's type name; the web sending a still drawn from the element on the screen, never a file or the clip, after who and where are asked, showing the disclaimer, the processor and "a picture is not an examination", and reaching her answers only through confirmReading; the phones naming nothing new.`;
}
