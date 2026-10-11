// The founder's board for the work team. It serves status.html and writes a task into the
// gitignored work folder. It does not call the model, queue a command, or start a role.
// The host team is not installed, so every task is held with status.json's own sentence.
//
//   node board.mjs
//   open http://127.0.0.1:8765/status.html

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { settings } from "./agents.mjs";
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

// A task may name only a role id from roles.json. The text is the founder's words.
// The sentence is never taken from the request: it is the held line, because recording
// a task does not start anyone.
export function holdTask(roles, status, tasks, input) {
  const roleId = typeof input?.roleId === "string" ? input.roleId : "";
  const known = new Set((roles.roles ?? []).map((role) => role.id));
  if (!known.has(roleId)) {
    throw Object.assign(new Error(`a task names ${roleId || "nothing"}, which roles.json does not have`), { statusCode: 400 });
  }
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (!text) throw Object.assign(new Error("a task has no words"), { statusCode: 400 });
  if (text.length > MAX_TEXT) {
    throw Object.assign(new Error("a task is longer than 2000 characters"), { statusCode: 400 });
  }
  const task = {
    id: randomUUID(),
    roleId,
    text,
    sentence: status.held,
    at: new Date().toISOString(),
  };
  return { tasks: [...tasks, task], task };
}

function send(res, statusCode, body, type = "application/json; charset=utf-8") {
  const payload = type.startsWith("application/json") ? JSON.stringify(body) : body;
  res.writeHead(statusCode, { "content-type": type, "cache-control": "no-store" });
  res.end(payload);
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

export function createBoard(cfg = settings()) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/status.html")) {
        const html = await readFile(pagePath, "utf8");
        send(res, 200, html, "text/html; charset=utf-8");
        return;
      }
      if (req.method === "GET" && url.pathname === "/board") {
        const { roles, status } = readTeamStatus();
        const known = new Set(roles.roles.map((role) => role.id));
        const tasks = (await readTasks(tasksFile(cfg))).filter((task) => known.has(task.roleId));
        send(res, 200, { held: status.held, tasks });
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
        send(res, 201, task);
        return;
      }
      send(res, 404, { error: "That page is not on this board." });
    } catch (error) {
      send(res, error.statusCode || 500, { error: error.statusCode ? error.message : "The board could not record that." });
    }
  });
}

export function startBoard({ port = 8765, workdir } = {}) {
  const cfg = settings(workdir ? { AGENT_TEAM_WORKDIR: workdir } : process.env);
  const server = createBoard(cfg);
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolveListen(server));
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg === -1 ? 8765 : Number(process.argv[portArg + 1]);
  const server = await startBoard({ port });
  const address = server.address();
  console.log(`Work team board at http://127.0.0.1:${address.port}/status.html`);
  console.log("The host team is not installed. A task recorded here is held, and nobody starts.");
}
