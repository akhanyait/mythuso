import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createAssistantServer, liveClinicalFlows } from "../server.ts";
import type { SpeechSeam } from "./speech.ts";
import { openFounderState } from "./founder-state.ts";
import { openSettingsHistory } from "./settings-history.ts";
import { openVault } from "./provider-vault.ts";
import { createFounderAccess } from "./founder-access.ts";
import { overrideClosed } from "./demonstration-override.ts";
import {
  checkPhotoRequest,
  photoReadingGate,
  readPhoto,
  type PhotoModel,
  type PhotoReaderSeam,
} from "./photo-reading.ts";
import {
  confirmReading,
  readingFromText,
  readingVocabulary,
  validateReading,
} from "../../../../packages/gilbertone/src/skin-photo-reading.ts";
import skin from "../../../../packages/catalog/skin-check.json" with { type: "json" };
import override from "../../../../packages/catalog/demonstration-override.json" with { type: "json" };
import assistantContract from "../../../../packages/catalog/apis/assistant.json" with { type: "json" };

/* The skin check's photo reader, 2 October 2026. What these hold is what the reader refuses: a shut gate
   reads nothing and says the skin check's own sentence; the model's answer reaches a caller only as the
   contract's option ids, and an answer with one word outside them is thrown away whole; a picture over the
   contract's size is a 413, anything but a JPEG a 415, a baby younger than three months a 422 before any
   model is asked; and nothing is written — no file in the state directory, no log line on success, and on a
   failure one line carrying an error's type name and never the picture or what the model said.

   No network, ever: every model here is a stub, and a test that did not hand one in gets a model that
   throws if it is reached. */

const ENV = {
  AZURE_OPENAI_ENDPOINT: "https://fixture-account.openai.azure.invalid",
  AZURE_OPENAI_KEY: "fixture-secret-9f4c2b7e1a",
  AZURE_OPENAI_MODEL: "gpt-4.1-mini",
};
const DEV = {};
/* A tiny real JPEG's first bytes and some padding: what the check reads is the size and the signature. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF fixture picture of skin, not anybody's")]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const ask = (extra: Record<string, unknown> = {}) => ({
  userConsent: true,
  who: "self",
  imageBase64: JPEG.toString("base64"),
  imageType: "image/jpeg",
  ...extra,
});
const statement = (id: string) => {
  for (const route of assistantContract.routes) for (const refusal of route.refusals) if (refusal.id === id) return refusal.statement;
  throw new Error(`no refusal ${id}`);
};
const notSpeaking: SpeechSeam = {
  configured: () => false,
  recognize: async () => {
    throw new Error("never");
  },
  synthesize: async () => {
    throw new Error("never");
  },
};
const mustNotRead: PhotoModel = async () => {
  throw new Error("a test that did not hand in a model must never reach one");
};
const answering = (text: string, seen: { calls: number; image?: string; instructions?: string; deployment?: string } = { calls: 0 }): PhotoModel =>
  async ({ imageBase64, instructions, deployment }) => {
    seen.calls += 1;
    seen.image = imageBase64;
    seen.instructions = instructions;
    seen.deployment = deployment;
    return text;
  };
const overrideOn = { ...override, inForce: true as const };
const openSeam = (model: PhotoModel, gateOptions = {}): PhotoReaderSeam => ({
  gate: () => photoReadingGate({ override: overrideOn, env: ENV, processEnv: DEV, ...gateOptions }),
  read: (image, deployment) => readPhoto(image, deployment, model),
});

/* Every file under a directory, with its size: what "nothing was written" is compared on. */
const listing = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: false })
    .map(String)
    .sort()
    .map((name) => `${name} ${statSync(join(dir, name)).size}`);

async function withPhotoServer(
  photos: PhotoReaderSeam,
  body: (base: string) => Promise<void>,
): Promise<{ lines: string[]; written: [string[], string[]] }> {
  const dir = mkdtempSync(join(tmpdir(), "photo-reading-"));
  const state = openFounderState(dir);
  const lines: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const name of ["log", "error", "warn", "info"] as const)
    console[name] = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const server = createAssistantServer(
    undefined,
    (async () => []) as never,
    notSpeaking,
    liveClinicalFlows(),
    undefined,
    createFounderAccess({}),
    state,
    openSettingsHistory(state),
    openVault(state, {}),
    Date.now,
    photos,
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const before = listing(dir);
  try {
    await body(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    Object.assign(console, original);
  }
  const after = listing(dir);
  rmSync(dir, { recursive: true, force: true });
  return { lines, written: [before, after] };
}
const post = (base: string, body: unknown) =>
  fetch(`${base}/assistant/v1/photo-reading`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/* ---- The vocabulary ---------------------------------------------------------------------------------- */

test("a reading in the contract's own ids is kept, and the vocabulary is the skin check's options less what it refuses", () => {
  assert.deepEqual(readingFromText('{"outcome":"described","looks":["ring","scaly"],"where":["arms"]}'), {
    outcome: "described",
    looks: ["ring", "scaly"],
    where: ["arms"],
  });
  assert.ok(!readingVocabulary.looks.includes("other"), "something else is not a thing a model can see");
  for (const id of ["face", "groin", "nappy"]) assert.ok(!readingVocabulary.where.includes(id), `${id} is refused, never described`);
  assert.ok(!(readingVocabulary.looks as readonly string[]).some((id) => skin.questions.find((q) => q.id === "signs")!.options!.some((o) => o.id === id)), "the signs question is never in the model's vocabulary");
});

test("an answer with anything outside the vocabulary is thrown away whole, never trimmed", () => {
  for (const [why, text] of [
    ["a condition's name among the looks", '{"outcome":"described","looks":["ring","ringworm"],"where":[]}'],
    ["a key of its own", '{"outcome":"described","looks":["ring"],"where":[],"condition":"tinea"}'],
    ["free text", "It looks like ringworm to me."],
    ["a where the check refuses", '{"outcome":"described","looks":["ring"],"where":["face"]}'],
    ["an outcome nobody declared", '{"outcome":"emergency","looks":[],"where":[]}'],
    ["described with nothing seen", '{"outcome":"described","looks":[],"where":["arms"]}'],
    ["a refusing outcome that still saw something", '{"outcome":"private-or-face","looks":["ring"],"where":[]}'],
    ["the same look twice", '{"outcome":"described","looks":["ring","ring"],"where":[]}'],
    ["more looks than the contract allows", JSON.stringify({ outcome: "described", looks: readingVocabulary.looks.slice(0, skin.photoReading.vocabulary.maxLooks + 1), where: [] })],
    ["a list where an object belongs", '[{"outcome":"described","looks":["ring"],"where":[]}]'],
  ])
    assert.equal(readingFromText(text), null, why);
  assert.equal(validateReading(null), null);
});

test("only confirmed ids reach her answers, beside what she had already chosen", () => {
  const answers = confirmReading({ who: ["self"], looks: ["blisters"] }, { looks: ["ring", "made-up"], where: ["arms", "face"] });
  assert.deepEqual(answers.looks, ["blisters", "ring"]);
  assert.deepEqual(answers.where, ["arms"]);
  assert.deepEqual(answers.signs, undefined, "a reading never answers the signs question");
});

/* ---- The gate ---------------------------------------------------------------------------------------- */

test("the gate opens on the signatures or the override, never with the override off, and only with a model that can look in South Africa", () => {
  assert.equal(override.inForce, false, "the founder's override is switched off");
  assert.deepEqual(photoReadingGate({ env: ENV, processEnv: DEV }), { open: false, refusalId: "photo-reading-not-open" }, "the file's inForce false closes it");
  const open = photoReadingGate({ override: overrideOn, env: ENV, processEnv: DEV });
  assert.ok(open.open);
  if (open.open) {
    assert.equal(open.demonstration, true);
    assert.equal(open.disclaimer, override.disclaimer.sentence, "the disclaimer word for word");
    assert.equal(open.processor, "Azure OpenAI");
    assert.equal(open.region, "South Africa North");
    assert.equal(open.deployment, "gpt-4.1-mini");
  }
  assert.deepEqual(photoReadingGate({ override: overrideClosed, env: ENV, processEnv: DEV }), { open: false, refusalId: "photo-reading-not-open" }, "inForce false closes it");
  const signed = photoReadingGate({ override: overrideClosed, signed: true, env: ENV, processEnv: DEV });
  assert.ok(signed.open && signed.demonstration === false && signed.disclaimer === null, "the signatures are still what opens it at go-live");
  const noModel = { open: false, refusalId: "photo-reading-has-no-model" };
  assert.deepEqual(photoReadingGate({ override: overrideOn, env: ENV, processEnv: { NODE_ENV: "production" } }), noModel, "production without the acknowledgement");
  assert.ok(photoReadingGate({ override: overrideOn, env: ENV, processEnv: { NODE_ENV: "production", MYTHUSO_ASSISTANT_PRODUCTION: "acknowledged" } }).open, "production with it");
  assert.deepEqual(photoReadingGate({ override: overrideOn, env: {}, processEnv: DEV }), noModel, "no Azure configured");
  assert.deepEqual(photoReadingGate({ override: overrideOn, env: { ...ENV, AZURE_OPENAI_MODEL: "text-embedding-3-small" }, processEnv: DEV }), noModel, "a deployment that cannot look at a picture");
  assert.ok(photoReadingGate({ override: overrideOn, env: { ...ENV, AZURE_OPENAI_MODEL: "" }, processEnv: DEV }).open, "the adapter's default deployment takes a picture");
});

/* ---- The request ------------------------------------------------------------------------------------- */

test("a request is refused for its agreement, its who, its type and its size before any model is asked", () => {
  assert.deepEqual(checkPhotoRequest(ask({ userConsent: "yes" })), { ok: false, refusalId: "photo-reading-needs-consent" });
  assert.deepEqual(checkPhotoRequest(ask({ who: "young-baby" })), { ok: false, refusalId: "photo-of-a-young-baby" });
  assert.deepEqual(checkPhotoRequest(ask({ who: "my sister" })), { ok: false, refusalId: "invalid-request" });
  assert.deepEqual(checkPhotoRequest(ask({ imageType: "video/webm" })), { ok: false, refusalId: "photo-not-a-jpeg" });
  assert.deepEqual(checkPhotoRequest(ask({ imageBase64: PNG.toString("base64") })), { ok: false, refusalId: "photo-not-a-jpeg" }, "a PNG that says it is a JPEG");
  const big = Buffer.alloc(skin.photoReading.image.maxBytes + 1, 0xff);
  assert.deepEqual(checkPhotoRequest(ask({ imageBase64: big.toString("base64") })), { ok: false, refusalId: "payload-too-large" });
  assert.deepEqual(checkPhotoRequest(ask()), { ok: true, imageBase64: JPEG.toString("base64") });
});

/* ---- The routes -------------------------------------------------------------------------------------- */

test("the routes: open says who reads it where; a valid answer is ids; everything else is the contract's refusal; nothing is written and nothing logged", async () => {
  const seen = { calls: 0 } as { calls: number; image?: string; instructions?: string; deployment?: string };
  const { lines, written } = await withPhotoServer(openSeam(answering('{"outcome":"described","looks":["ring","scaly"],"where":["arms"]}', seen)), async (base) => {
    const status = await fetch(`${base}/assistant/v1/photo-reading`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { processor: "Azure OpenAI", region: "South Africa North", demonstration: true, disclaimer: override.disclaimer.sentence });

    const read = await post(base, ask());
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { looks: ["ring", "scaly"], where: ["arms"] });
    assert.equal(seen.calls, 1);
    assert.equal(seen.image, JPEG.toString("base64"), "the picture goes to the model as it came");
    assert.equal(seen.deployment, "gpt-4.1-mini");
    assert.ok(seen.instructions!.includes("ring (Ring-shaped)") && !seen.instructions!.includes("{looks}"), "the contract's brief, its lists filled");

    for (const [body, status, id] of [
      [ask({ userConsent: false }), 403, "photo-reading-needs-consent"],
      [ask({ who: "young-baby" }), 422, "photo-of-a-young-baby"],
      [ask({ imageBase64: PNG.toString("base64") }), 415, "photo-not-a-jpeg"],
      [ask({ imageBase64: Buffer.alloc(skin.photoReading.image.maxBytes + 10, 0xff).toString("base64") }), 413, "payload-too-large"],
      [ask({ who: undefined }), 400, "invalid-request"],
    ] as const) {
      const refused = await post(base, body);
      assert.equal(refused.status, status, id);
      assert.deepEqual(await refused.json(), { error: id.replace(/-/g, "_"), refusalId: id, message: statement(id) });
    }
    assert.equal(seen.calls, 1, "no refused request reached the model");

    const huge = await fetch(`${base}/assistant/v1/photo-reading`, { method: "POST", body: "x".repeat(800 * 1024) });
    assert.equal(huge.status, 413, "a body over the service's ceiling");
  });
  assert.deepEqual(written[1], written[0], "nothing was written to the state directory");
  assert.deepEqual(lines, [], "a reading writes no log line at all");
});

test("the model's refusing outcomes and an answer outside the vocabulary are refusals, with nothing it saw", async () => {
  for (const [text, id] of [
    ['{"outcome":"private-or-face","looks":[],"where":[]}', "photo-shows-a-face-or-private-area"],
    ['{"outcome":"not-skin","looks":[],"where":[]}', "photo-is-not-skin"],
    ['{"outcome":"unclear","looks":[],"where":[]}', "photo-not-clear"],
    ['{"outcome":"described","looks":["ring"],"where":[],"likely":"ringworm"}', "photo-not-described"],
    ["Ringworm, most likely.", "photo-not-described"],
  ] as const) {
    await withPhotoServer(openSeam(answering(text)), async (base) => {
      const refused = await post(base, ask());
      assert.equal(refused.status, 422, id);
      const body = (await refused.json()) as Record<string, unknown>;
      assert.deepEqual(body, { error: id.replace(/-/g, "_"), refusalId: id, message: statement(id) });
      assert.ok(!JSON.stringify(body).includes("ring"), "nothing the model said comes back");
    });
  }
});

test("a shut gate reads nothing and says the skin check's own sentence, on both routes", async () => {
  const { lines } = await withPhotoServer(openSeam(mustNotRead, { override: overrideClosed }), async (base) => {
    for (const response of [await fetch(`${base}/assistant/v1/photo-reading`), await post(base, ask())]) {
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "photo_reading_not_open", refusalId: "photo-reading-not-open", message: skin.photoReading.sentence });
    }
  });
  assert.deepEqual(lines, []);
  await withPhotoServer(openSeam(mustNotRead, { env: {} }), async (base) => {
    const response = await post(base, ask());
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { refusalId: string }).refusalId, "photo-reading-has-no-model");
  });
});

test("a model that fails is one 500 and one line with an error's type name — never the picture or what it said", async () => {
  const picture = ask().imageBase64 as string;
  const failing: PhotoModel = async () => {
    throw new TypeError(`fetch failed for ${picture} with looks ring scaly`);
  };
  const { lines, written } = await withPhotoServer(openSeam(failing), async (base) => {
    const failed = await post(base, ask());
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "internal_error", refusalId: "internal-error", message: statement("internal-error") });
  });
  assert.deepEqual(lines, [JSON.stringify({ event: "assistant.photo-reading.failed", route: "/assistant/v1/photo-reading", kind: "TypeError" })]);
  for (const line of lines) {
    assert.ok(!line.includes(picture.slice(0, 12)), "no picture in a log line");
    assert.ok(!/ring|scaly/.test(line), "no description in a log line");
  }
  assert.deepEqual(written[1], written[0], "nothing was written on a failure either");
});

test("a model that hangs is stopped at the contract's timeout", async () => {
  /* AbortSignal.timeout's timer does not hold the process open, so the hanging model holds it, as a
     socket waiting on a real provider would. */
  const hanging: PhotoModel = ({ signal }) =>
    new Promise((_, reject) => {
      const held = setTimeout(() => undefined, 5_000);
      signal.addEventListener("abort", () => {
        clearTimeout(held);
        reject(new DOMException("timed out", "TimeoutError"));
      });
    });
  await assert.rejects(readPhoto(JPEG.toString("base64"), "gpt-4.1-mini", hanging, 20), /timed out/);
});
