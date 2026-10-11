// Cursor models for the work-team board. The list is whatever GET /v1/models returns for the
// key already in the environment. The first reply for a model starts one no-repo agent. Later
// replies for that same model are follow-ups on the agent already running, so they do not wait
// for another machine to boot. The key is read here and sent as a header. It is never written
// into a file, a log line, an error message, or the page.
//
// Qwen is not a Cursor model. This file does not know the Qwen host and does not call it.

const API = "https://api.cursor.com";
const TERMINAL = new Set(["FINISHED", "ERROR", "CANCELLED", "EXPIRED"]);

export function isQwenChoice(modelId) {
  const id = String(modelId ?? "").trim().toLowerCase();
  return id === "qwen" || id.includes("qwen");
}

function keyFrom(env) {
  const raw = env?.CURSOR_API_KEY;
  return typeof raw === "string" ? raw.trim() : "";
}

function quiet(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

// The default variant is the one the catalog marks, otherwise the first. Params travel with
// the call so a model that requires them is asked the way the catalog describes.
export function modelsFromCatalog(catalog) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const models = [];
  for (const item of items) {
    if (typeof item?.id !== "string" || item.id.trim() === "") continue;
    if (typeof item?.displayName !== "string" || item.displayName.trim() === "") continue;
    if (isQwenChoice(item.id)) continue;
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const chosen = variants.find((variant) => variant?.isDefault) || variants[0] || {};
    const params = Array.isArray(chosen.params) ? chosen.params.filter((param) =>
      param && typeof param.id === "string" && typeof param.value === "string"
    ) : [];
    models.push({
      id: item.id.trim(),
      displayName: item.displayName.trim(),
      params: params.map((param) => ({ id: param.id, value: param.value })),
    });
  }
  return models;
}

// The model's own words stay. The display name is added when the model did not say it,
// because a reply has to name the model that wrote it. The held sentence stays on the end
// so the board still says the duty is not being carried out.
export function finishReply(text, model, held) {
  let body = String(text ?? "").trim();
  if (!body) return "";
  const name = String(model?.displayName ?? "").trim();
  if (name && !body.toLowerCase().includes(name.toLowerCase())) {
    body = `${body}\n\nWritten by ${name}.`;
  }
  const sentence = String(held ?? "").trim();
  if (sentence && !body.includes(sentence)) body = `${body}\n\n${sentence}`;
  return body;
}

async function cursorRequest(fetchImpl, key, method, path, body) {
  const auth = `Basic ${Buffer.from(`${key}:`, "utf8").toString("base64")}`;
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw quiet(502, "Cursor could not be reached.");
  }
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) {
    const code = typeof parsed?.error?.code === "string"
      ? parsed.error.code
      : (typeof parsed?.error === "string" ? parsed.error : "");
    throw Object.assign(quiet(response.status, "Cursor refused the request."), { code });
  }
  return parsed || {};
}

export async function listCursorModels(env = process.env, fetchImpl = globalThis.fetch) {
  const key = keyFrom(env);
  if (!key) return [];
  const catalog = await cursorRequest(fetchImpl, key, "GET", "/v1/models");
  return modelsFromCatalog(catalog);
}

// One agent per model, kept after the reply, so the next message is a follow-up.
const agentsByModel = new Map();
const lanes = new Map();

export function clearCursorAgents() {
  agentsByModel.clear();
  lanes.clear();
}

function enqueue(modelId, job) {
  const previous = lanes.get(modelId) || Promise.resolve();
  const run = previous.then(job, job);
  lanes.set(modelId, run.then(() => undefined, () => undefined));
  return run;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function replyPrompt(name, speakerName, speakerTitle, duty) {
  return [
    `Reply in two short sentences as ${speakerName}, ${speakerTitle}.`,
    `Message: ${String(duty ?? "").trim()}`,
    `The second sentence must name the model that wrote this reply: ${name}.`,
    "Do not use tools. Do not read or change any file.",
  ].join("\n");
}

async function waitForRun(fetchImpl, key, agentId, runId, timeoutMs) {
  const started = Date.now();
  let pause = 400;
  let run = null;
  while (Date.now() - started <= timeoutMs) {
    run = await cursorRequest(fetchImpl, key, "GET", `/v1/agents/${agentId}/runs/${runId}`);
    if (TERMINAL.has(run.status)) return run;
    await sleep(pause);
    pause = Math.min(1_000, pause + 200);
  }
  return run;
}

async function openRun(fetchImpl, key, model, prompt) {
  const cached = agentsByModel.get(model.id);
  if (cached) {
    try {
      const follow = await cursorRequest(fetchImpl, key, "POST", `/v1/agents/${cached}/runs`, {
        prompt: { text: prompt },
      });
      const runId = follow.run?.id;
      if (runId) return { agentId: cached, runId };
    } catch (error) {
      agentsByModel.delete(model.id);
      if (error.code === "usage_limit_exceeded") throw error;
    }
  }
  const selection = { id: model.id };
  if (Array.isArray(model.params) && model.params.length) selection.params = model.params;
  const created = await cursorRequest(fetchImpl, key, "POST", "/v1/agents", {
    name: "Work-team reply",
    prompt: { text: prompt },
    model: selection,
    autoCreatePR: false,
  });
  const agentId = created.agent?.id;
  const runId = created.run?.id || created.agent?.latestRunId;
  if (agentId) agentsByModel.set(model.id, agentId);
  return { agentId, runId };
}

async function writeOnce(env, fetchImpl, model, options) {
  const key = keyFrom(env);
  if (!key) throw quiet(503, "No Cursor key is available.");
  const name = String(model?.displayName ?? "").trim();
  const id = String(model?.id ?? "").trim();
  if (!id || !name) throw quiet(400, "That model is not one this key can call.");
  if (isQwenChoice(id)) throw quiet(422, "Qwen on the server is not connected.");
  const prompt = replyPrompt(name, options.speakerName, options.speakerTitle, options.duty);
  let opened;
  try {
    opened = await openRun(fetchImpl, key, { ...model, id }, prompt);
  } catch (error) {
    if (error.code === "usage_limit_exceeded") {
      throw quiet(422, `${name} is not available to this key.`);
    }
    throw quiet(error.statusCode || 502, `${name} did not write a reply.`);
  }
  const { agentId, runId } = opened;
  if (!agentId || !runId) throw quiet(502, `${name} did not write a reply.`);
  const run = await waitForRun(fetchImpl, key, agentId, runId, options.timeoutMs ?? 120_000);
  const result = typeof run?.result === "string" ? run.result.trim() : "";
  if (run?.status !== "FINISHED" || !result) {
    agentsByModel.delete(id);
    throw quiet(502, `${name} did not write a reply.`);
  }
  const finished = finishReply(result, { ...model, id, displayName: name }, options.held);
  if (!finished.toLowerCase().includes(name.toLowerCase())) {
    throw quiet(502, `${name} did not write a reply.`);
  }
  return finished;
}

export async function writeCursorReply(env, fetchImpl, model, options = {}) {
  const id = String(model?.id ?? "").trim();
  return enqueue(id || "none", () => writeOnce(env, fetchImpl, model, options));
}

// Starts the picker default in the background so the first message someone sends is a
// follow-up. A failure here changes nothing: the duty still asks the model itself.
export async function warmDefaultModel(env = process.env, fetchImpl = globalThis.fetch) {
  const models = await listCursorModels(env, fetchImpl);
  const model = models.find((item) => item.id === "default") || models[0];
  if (!model || agentsByModel.has(model.id)) return model?.displayName ?? "";
  await writeCursorReply(env, fetchImpl, model, {
    speakerName: "Thandi",
    speakerTitle: "Project Manager",
    duty: "Say ready.",
    held: "",
  });
  return model.displayName;
}
