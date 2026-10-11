// Cursor models for the work-team board. The list is whatever GET /v1/models returns for the
// key already in the environment. A reply is one no-repo cloud agent run, then the agent is
// deleted. The key is read here and sent as a header. It is never written into a file, a log
// line, an error message, or the page.
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

async function deleteAgent(fetchImpl, key, agentId) {
  if (!agentId) return;
  try {
    await cursorRequest(fetchImpl, key, "DELETE", `/v1/agents/${agentId}`);
  } catch {
    // The reply is already in hand. A leftover agent is not a second call to Qwen.
  }
}

export async function writeCursorReply(env, fetchImpl, model, { speakerName, speakerTitle, duty, held, timeoutMs = 120_000 } = {}) {
  const key = keyFrom(env);
  if (!key) throw quiet(503, "No Cursor key is available.");
  const name = String(model?.displayName ?? "").trim();
  const id = String(model?.id ?? "").trim();
  if (!id || !name) throw quiet(400, "That model is not one this key can call.");
  if (isQwenChoice(id)) throw quiet(422, "Qwen on the server is not connected.");
  const prompt = [
    `You are writing one short reply on a work-team board, as ${speakerName}, ${speakerTitle}.`,
    `The duty is: ${String(duty ?? "").trim()}`,
    "Write at most four sentences.",
    `Name the model that wrote this reply. That model is ${name}.`,
    "Do not use tools. Do not read or change any file. Do not open a pull request.",
    "Do not say the duty has been carried out.",
    String(held ?? "").trim(),
  ].filter(Boolean).join("\n");
  const selection = { id };
  if (Array.isArray(model.params) && model.params.length) selection.params = model.params;
  let created;
  try {
    created = await cursorRequest(fetchImpl, key, "POST", "/v1/agents", {
      name: "Work-team reply",
      prompt: { text: prompt },
      model: selection,
      autoCreatePR: false,
    });
  } catch (error) {
    if (error.code === "usage_limit_exceeded") {
      throw quiet(422, `${name} is not available to this key.`);
    }
    throw quiet(error.statusCode || 502, `${name} did not write a reply.`);
  }
  const agentId = created.agent?.id;
  const runId = created.run?.id || created.agent?.latestRunId;
  if (!agentId || !runId) throw quiet(502, `${name} did not write a reply.`);
  try {
    const started = Date.now();
    let run = null;
    while (Date.now() - started <= timeoutMs) {
      run = await cursorRequest(fetchImpl, key, "GET", `/v1/agents/${agentId}/runs/${runId}`);
      if (TERMINAL.has(run.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    const result = typeof run?.result === "string" ? run.result.trim() : "";
    if (run?.status !== "FINISHED" || !result) throw quiet(502, `${name} did not write a reply.`);
    const finished = finishReply(result, model, held);
    if (!finished.toLowerCase().includes(name.toLowerCase())) {
      throw quiet(502, `${name} did not write a reply.`);
    }
    return finished;
  } finally {
    await deleteAgent(fetchImpl, key, agentId);
  }
}
