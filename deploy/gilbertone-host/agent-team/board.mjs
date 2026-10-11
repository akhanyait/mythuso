// The founder's board for the work team. It serves status.html and writes a duty into the
// gitignored work folder. It does not call the model, queue a command, or start a role.
// The host team is not installed, so every duty is held with status.json's own sentence.
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
// is status.json's held sentence, not whatever the file happens to say.
export function presentTask(roles, status, task) {
  const raw = Array.isArray(task?.roleIds)
    ? task.roleIds
    : (typeof task?.roleId === "string" && task.roleId ? [task.roleId] : null);
  if (!raw) return null;
  try {
    const described = describeDuty(roles, raw);
    return {
      id: task.id,
      ...described,
      text: typeof task.text === "string" ? task.text : "",
      sentence: status.held,
      at: task.at,
    };
  } catch {
    return null;
  }
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
        const tasks = (await readTasks(tasksFile(cfg)))
          .map((task) => presentTask(roles, status, task))
          .filter(Boolean);
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
    // The founder's browser reaches this process through a forward, and a loopback-only listen is invisible to that forward.
    server.listen(port, "0.0.0.0", () => resolveListen(server));
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
