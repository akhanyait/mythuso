import { test } from "node:test";
import assert from "node:assert/strict";
import { clearCursorAgents, finishReply, isQwenChoice, listCursorModels, modelsFromCatalog, writeCursorReply } from "./cursor-models.mjs";

test("the catalog becomes picker rows, and a Qwen id is left out", () => {
  const models = modelsFromCatalog({
    items: [
      {
        id: "composer-2.5",
        displayName: "Composer 2.5",
        variants: [
          { params: [{ id: "fast", value: "false" }], displayName: "Composer 2.5" },
          { params: [{ id: "fast", value: "true" }], displayName: "Composer 2.5", isDefault: true },
        ],
      },
      { id: "qwen3.6", displayName: "Qwen" },
      { id: "default", displayName: "Auto", variants: [{ params: [], displayName: "Auto", isDefault: true }] },
    ],
  });
  assert.deepEqual(models, [
    { id: "composer-2.5", displayName: "Composer 2.5", params: [{ id: "fast", value: "true" }] },
    { id: "default", displayName: "Auto", params: [] },
  ]);
  assert.equal(isQwenChoice("qwen"), true);
  assert.equal(isQwenChoice("gilbertone-qwen"), true);
  assert.equal(isQwenChoice("composer-2.5"), false);
});

test("a reply names the model and keeps the held sentence", () => {
  const named = finishReply("The card can wait.", { id: "composer-2.5", displayName: "Composer 2.5" }, "Noted on this board.");
  assert.match(named, /Written by Composer 2.5/);
  assert.match(named, /Noted on this board/);
  const already = finishReply("Composer 2.5 wrote this. Noted on this board.", { id: "composer-2.5", displayName: "Composer 2.5" }, "Noted on this board.");
  assert.equal(already.includes("Written by"), false);
});

test("a failed list does not repeat the key", async () => {
  const secret = "cursor-test-key-must-not-leak";
  await assert.rejects(
    () => listCursorModels({ CURSOR_API_KEY: secret }, async () => {
      throw new Error(`socket reset ${secret}`);
    }),
    (error) => {
      assert.equal(String(error.message).includes(secret), false);
      assert.equal(error.statusCode, 502);
      return true;
    },
  );
  assert.deepEqual(await listCursorModels({ CURSOR_API_KEY: "" }, async () => {
    throw new Error("should not be called");
  }), []);
});

test("a usage limit is not turned into a reply, and a finished run names the model", async () => {
  clearCursorAgents();
  const secret = "cursor-test-key-must-not-leak";
  const limited = [];
  await assert.rejects(
    () => writeCursorReply(
      { CURSOR_API_KEY: secret },
      async (url) => {
        limited.push(String(url));
        return new Response(JSON.stringify({ error: { code: "usage_limit_exceeded" } }), { status: 400 });
      },
      { id: "gpt-5-mini", displayName: "GPT-5 Mini", params: [] },
      { speakerName: "Sipho", speakerTitle: "Engineer", duty: "Hold the card.", held: "Held." },
    ),
    (error) => {
      assert.equal(error.message, "GPT-5 Mini is not available to this key.");
      assert.equal(String(error.message).includes(secret), false);
      return true;
    },
  );
  assert.deepEqual(limited, ["https://api.cursor.com/v1/agents?limit=50"]);

  const seen = [];
  let follows = 0;
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    const method = init.method || "GET";
    seen.push(`${method} ${href}`);
    if (href.includes("qwen") || href.includes("/api/tags")) throw new Error("qwen was called");
    if (method === "GET" && href.includes("/v1/agents?")) {
      return new Response(JSON.stringify({
        items: [{ id: "bc-1", name: "Work-team reply", status: "IDLE" }],
      }), { status: 200 });
    }
    if (method === "POST" && href.endsWith("/v1/agents")) {
      throw new Error("a new agent was started");
    }
    if (method === "POST" && href.endsWith("/runs")) {
      follows += 1;
      return new Response(JSON.stringify({ run: { id: `run-${follows}`, status: "CREATING" } }), { status: 201 });
    }
    if (method === "POST" && href.endsWith("/unarchive")) {
      return new Response(JSON.stringify({ id: "bc-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "FINISHED", result: "Noted." }), { status: 200 });
  };
  const ask = (duty) => writeCursorReply(
    { CURSOR_API_KEY: secret },
    fetchImpl,
    { id: "default", displayName: "Auto", params: [] },
    { speakerName: "Thandi", speakerTitle: "Project Manager", duty, held: "Noted on this board." },
  );
  const text = await ask("Hello");
  assert.match(text, /Written by Auto/);
  assert.match(text, /Noted on this board/);
  assert.equal(text.includes(secret), false);
  const again = await ask("And the next one.");
  assert.match(again, /Written by Auto/);
  assert.equal(seen.some((line) => line.startsWith("POST ") && line.endsWith("/v1/agents")), false);
  assert.deepEqual(seen, [
    "GET https://api.cursor.com/v1/agents?limit=50",
    "POST https://api.cursor.com/v1/agents/bc-1/runs",
    "GET https://api.cursor.com/v1/agents/bc-1/runs/run-1",
    "POST https://api.cursor.com/v1/agents/bc-1/runs",
    "GET https://api.cursor.com/v1/agents/bc-1/runs/run-2",
  ]);
});
