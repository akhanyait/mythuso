// The founder's board for the work team. It serves status.html and writes a duty into the
// gitignored work folder. A duty is handed to the local team engine only when OLLAMA_URL
// is set and that host's GET /api/tags succeeds. Otherwise it is held with status.json's
// own sentence, and nobody is invented a reply. The board key lives in the work folder
// and is never written into the page source.
//
// A duty names role ids from roles.json. One id is one person. Two or more are one shared
// thread, held for each of them. None is the whole team. The sentence is never taken from
// the request, and neither is the line that says who it is held for.
//
//   node board.mjs
//   open http://127.0.0.1:8765/status.html

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ask, loadRoles, probeModel, settings } from "./agents.mjs";
import { readTeamStatus } from "./render-status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = join(here, "status.html");
const MAX_TEXT = 2000;
const MAX_BODY = 16_384;

export function tasksFile(cfg) {
  return join(cfg.workdir, "tasks.json");
}

export async function readTasks(file) {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

// Who a duty is for, in roster order, and the words the thread uses. An id that roles.json
// does not have is refused here, before anything is written. Duplicates collapse: one person
// per mention, however many times the same id arrives.
export function describeDuty(roles, roleIds) {
  const known = new Set((roles.roles ?? []).map((role) => role.id));
  const ordered = [];
  for (const role of roles.roles ?? []) {
    if (roleIds.includes(role.id)) ordered.push(role);
  }
  for (const id of roleIds) {
    if (!known.has(id)) {
      const shown = typeof id === "string" && id ? id : "nothing";
      throw Object.assign(new Error(`a task names ${shown}, which roles.json does not have`), { statusCode: 400 });
    }
  }
  const names = ordered.map((role) => role.name);
  let title = "Whole team";
  let heldFor = "Held for the whole team.";
  if (names.length === 1) {
    title = names[0];
    heldFor = `Held for ${names[0]}.`;
  } else if (names.length === 2) {
    title = `${names[0]} and ${names[1]}`;
    heldFor = `Held for ${title}.`;
  } else if (names.length > 2) {
    title = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    heldFor = `Held for ${title}.`;
  }
  const audience = names.length === 0 ? "team" : names.length === 1 ? "person" : "group";
  const ids = ordered.map((role) => role.id);
  return {
    roleIds: ids,
    audience,
    threadKey: audience === "team" ? "team" : ids.join("+"),
    title,
    heldFor,
    ...(ids.length === 1 ? { roleId: ids[0] } : {}),
  };
}

function dutyIds(roles, input) {
  const raw = Array.isArray(input?.roleIds)
    ? input.roleIds
    : (typeof input?.roleId === "string" && input.roleId !== "" ? [input.roleId] : []);
  // describeDuty throws on an unknown id. Walking the raw list first keeps that error on the
  // id that was sent, including one that is not a string.
  const known = new Set((roles.roles ?? []).map((role) => role.id));
  const seen = [];
  for (const id of raw) {
    if (typeof id !== "string" || !known.has(id)) {
      const shown = typeof id === "string" && id ? id : "nothing";
      throw Object.assign(new Error(`a task names ${shown}, which roles.json does not have`), { statusCode: 400 });
    }
    if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}

// A duty may name only role ids from roles.json. No ids means the whole team. The text is
// the founder's words. The sentence is never taken from the request: it is the held line,
// because recording a duty does not start anyone.
export function holdTask(roles, status, tasks, input) {
  const described = describeDuty(roles, dutyIds(roles, input));
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (!text) throw Object.assign(new Error("a task has no words"), { statusCode: 400 });
  if (text.length > MAX_TEXT) {
    throw Object.assign(new Error("a task is longer than 2000 characters"), { statusCode: 400 });
  }
  const task = {
    id: randomUUID(),
    ...described,
    text,
    sentence: status.held,
    at: new Date().toISOString(),
  };
  return { tasks: [...tasks, task], task };
}

// A stored duty is shown only when every id it names is still on the roster. The receipt
// is status.json's held sentence unless a model is connected and the engine wrote a report.
// The sentence is never taken from the request.
export function presentTask(roles, status, task, options = {}) {
  const raw = Array.isArray(task?.roleIds)
    ? task.roleIds
    : (typeof task?.roleId === "string" && task.roleId ? [task.roleId] : null);
  if (!raw) return null;
  try {
    const described = describeDuty(roles, raw);
    const report = options.modelConnected === true
      && task.fromEngine === true
      && typeof task.report === "string"
      ? task.report.trim()
      : "";
    return {
      id: task.id,
      ...described,
      text: typeof task.text === "string" ? task.text : "",
      // With OLLAMA_URL unset, the receipt stays status.json's held sentence.
      sentence: report || status.held,
      at: task.at,
    };
  } catch {
    return null;
  }
}

// The key is a file in the gitignored work directory. A missing file is created here.
// An empty file is replaced. The value is never printed by the board.
export async function loadBoardKey(file) {
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing) return existing;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function keysMatch(expected, presented) {
  if (typeof expected !== "string" || typeof presented !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// The page is opened with ?k=. After that, the session cookie carries the same key,
// and a Bearer header is accepted for a client that does not keep the query.
export function presentedKey(req, url) {
  const fromQuery = url.searchParams.get("k");
  if (typeof fromQuery === "string" && fromQuery !== "") return fromQuery;
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const bearer = authorization.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }
  const cookie = req.headers.cookie;
  if (typeof cookie === "string") {
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "board_key" && rest.length) {
        try {
          const value = decodeURIComponent(rest.join("="));
          if (value) return value;
        } catch {
          return "";
        }
      }
    }
  }
  return "";
}

const REFUSAL_PAGE = `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Closed</title>
</head>
<body>
<p>This board needs its key.</p>
</body>
</html>
`;

// Hands the duty to the team engine only after /api/tags has succeeded. A failed call
// leaves the held task as it was: no report is written, because a missing answer is
// not a reply from anyone on the roster.
export async function carryDuty(cfg, env, task, fetchImpl = globalThis.fetch) {
  const probe = await probeModel(env, fetchImpl);
  if (!probe.connected) return { connected: false, task };
  try {
    const team = await loadRoles();
    const as = task.roleIds.length === 1 ? task.roleIds[0] : team.lead;
    const result = await ask({ ...cfg, ollamaUrl: probe.url, fetchImpl }, team, task.text, { as });
    const report = typeof result?.report === "string" ? result.report.trim() : "";
    if (!report || report === "(no report)") return { connected: true, task };
    return { connected: true, task: { ...task, fromEngine: true, report } };
  } catch {
    return { connected: true, task };
  }
}

function send(res, statusCode, body, type = "application/json; charset=utf-8", extra = {}) {
  const payload = type.startsWith("application/json") ? JSON.stringify(body) : body;
  res.writeHead(statusCode, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(payload);
}

function sessionCookie(token) {
  return {
    "set-cookie": `board_key=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`,
    "referrer-policy": "no-referrer",
  };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("That task is too large."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createBoard(cfg = settings(), options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const token = options.token;
  return createServer(async (req, res) => {
    let allowed = false;
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (!token || !keysMatch(token, presentedKey(req, url))) {
        send(res, 401, REFUSAL_PAGE, "text/html; charset=utf-8", { "referrer-policy": "no-referrer" });
        return;
      }
      allowed = true;
      const cookie = sessionCookie(token);
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/status.html")) {
        let html = await readFile(pagePath, "utf8");
        const probe = await probeModel(env, fetchImpl);
        if (probe.connected) {
          html = html.replace(
            '<p class="model-line" id="model-line">A model is not connected.</p>',
            '<p class="model-line" id="model-line">A model is connected.</p>',
          );
        }
        send(res, 200, html, "text/html; charset=utf-8", cookie);
        return;
      }
      if (req.method === "GET" && url.pathname === "/board") {
        const { roles, status } = readTeamStatus();
        const probe = await probeModel(env, fetchImpl);
        const tasks = (await readTasks(tasksFile(cfg)))
          .map((task) => presentTask(roles, status, task, { modelConnected: probe.connected }))
          .filter(Boolean);
        send(res, 200, { held: status.held, modelConnected: probe.connected, tasks }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/tasks") {
        let input;
        try {
          input = JSON.parse(await readBody(req));
        } catch (error) {
          if (error.statusCode) throw error;
          throw Object.assign(new Error("The task was not understood."), { statusCode: 400 });
        }
        const { roles, status } = readTeamStatus();
        const file = tasksFile(cfg);
        const existing = await readTasks(file);
        const { tasks, task } = holdTask(roles, status, existing, input);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify({ tasks }, null, 2)}\n`);
        const outcome = await carryDuty(cfg, env, task, fetchImpl);
        if (outcome.task !== task) {
          const updated = tasks.map((row) => (row.id === task.id ? outcome.task : row));
          await writeFile(file, `${JSON.stringify({ tasks: updated }, null, 2)}\n`);
        }
        const shown = presentTask(roles, status, outcome.task, { modelConnected: outcome.connected });
        send(res, 201, shown, "application/json; charset=utf-8", cookie);
        return;
      }
      send(res, 404, { error: "That page is not on this board." }, "application/json; charset=utf-8", cookie);
    } catch (error) {
      const cookie = allowed ? sessionCookie(token) : { "referrer-policy": "no-referrer" };
      send(res, error.statusCode || 500, { error: error.statusCode ? error.message : "The board could not record that." }, "application/json; charset=utf-8", cookie);
    }
  });
}

export async function startBoard({ port = 8765, workdir, token, env, fetchImpl } = {}) {
  const boardEnv = env || workdir ? { ...process.env, ...(env || {}) } : process.env;
  if (workdir) boardEnv.AGENT_TEAM_WORKDIR = workdir;
  // settings() reads local.json only when handed the process environment. A test workdir
  // is a copy, so it does not pick up a developer's local.json.
  const cfg = settings(boardEnv === process.env ? process.env : boardEnv);
  const key = token ?? await loadBoardKey(join(cfg.workdir, "board.key"));
  const server = createBoard(cfg, { token: key, env: boardEnv, fetchImpl });
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    // The founder's browser reaches this process through a forward, and a loopback-only listen is invisible to that forward.
    server.listen(port, "0.0.0.0", () => resolveListen(server));
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg === -1 ? 8765 : Number(process.argv[portArg + 1]);
  const probe = await probeModel(process.env);
  const server = await startBoard({ port });
  const address = server.address();
  console.log(`Work team board at http://127.0.0.1:${address.port}/status.html`);
  console.log(probe.connected ? "A model is connected." : "A model is not connected.");
  console.log("The host team is not installed. A duty is held unless OLLAMA_URL is set and that host answers /api/tags.");
}
