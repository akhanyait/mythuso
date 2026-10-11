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
  const named = finishReply("The card can wait.", { id: "composer-2.5", displayName: "Composer 2.5" }, "Held. The team is not installed, so nobody is carrying this out.");
  assert.match(named, /Written by Composer 2.5/);
  assert.match(named, /nobody is carrying this out/);
  const already = finishReply("Composer 2.5 wrote this. Held. The team is not installed, so nobody is carrying this out.", { id: "composer-2.5", displayName: "Composer 2.5" }, "Held. The team is not installed, so nobody is carrying this out.");
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
  assert.deepEqual(limited, ["https://api.cursor.com/v1/agents"]);

  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    seen.push(`${init.method || "GET"} ${href}`);
    if (href.includes("qwen") || href.includes("/api/tags")) throw new Error("qwen was called");
    if (init.method === "POST" && href.endsWith("/v1/agents")) {
      return new Response(JSON.stringify({ agent: { id: "bc-1", latestRunId: "run-1" }, run: { id: "run-1" } }), { status: 201 });
    }
    if (init.method === "POST" && href.endsWith("/runs")) {
      return new Response(JSON.stringify({ run: { id: "run-2", status: "CREATING" } }), { status: 201 });
    }
    return new Response(JSON.stringify({ status: "FINISHED", result: "Noted." }), { status: 200 });
  };
  const ask = (duty) => writeCursorReply(
    { CURSOR_API_KEY: secret },
    fetchImpl,
    { id: "default", displayName: "Auto", params: [] },
    { speakerName: "Thandi", speakerTitle: "Project Manager", duty, held: "Held. The team is not installed, so nobody is carrying this out." },
  );
  const text = await ask("Hello");
  assert.match(text, /Written by Auto/);
  assert.match(text, /nobody is carrying this out/);
  assert.equal(text.includes(secret), false);
  const again = await ask("And the next one.");
  assert.match(again, /Written by Auto/);
  assert.deepEqual(seen, [
    "POST https://api.cursor.com/v1/agents",
    "GET https://api.cursor.com/v1/agents/bc-1/runs/run-1",
    "POST https://api.cursor.com/v1/agents/bc-1/runs",
    "GET https://api.cursor.com/v1/agents/bc-1/runs/run-2",
  ]);
});
