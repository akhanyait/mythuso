// The founder's four-agent team, run on the GilbertOne host's own Qwen (asked for 8 October 2026).
//
// One engine for all four roles: each role is a system prompt and a list of tools read from
// roles.json, and each turn is one call to Ollama's native /api/chat with tool calling and thinking
// off. Native rather than the OpenAI-compatible /v1 the assistant service uses, because /v1 ignores
// `think` and `options` (found on this host the same day), and a team that waits on a hidden
// reasoning trace on a CPU-only model waits minutes for words nobody reads.
//
// The Project Manager is the only role that receives the founder's ask, and the only one that can
// hand work on. Hand-offs run one after another, never side by side: Ollama on this host answers one
// request at a time on shared CPUs, so four agents at once would each get a quarter of the speed and
// finish no sooner.
//
// What the team will not do is the valuable part, so it is enforced here rather than asked for in
// a prompt:
//   - It changes no file it can read. Reads are confined to the work folder; every write is a draft
//     under the team's own outbox, for the founder to take or leave.
//   - A server command is queued, never run. It runs only when the founder approves it by number at
//     the terminal (team.mjs approve), inside this container, where it cannot reach the host or any
//     other server.
//   - An email is a draft. No mailbox is connected, so even an approved email is not sent; the stub
//     says what account access sending would need.
// No dependencies: node: modules and fetch only, so it runs on the container's Node 22 as copied.

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));

export function settings(env = process.env) {
  return {
    ollamaUrl: (env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    // gilbertone-qwen is the served Qwen with this container's thread count baked in (bootstrap.sh).
    model: env.AGENT_TEAM_MODEL || "gilbertone-qwen",
    home: resolve(env.AGENT_TEAM_HOME || join(here, "outbox")),
    workdir: resolve(env.AGENT_TEAM_WORKDIR || join(here, "work")),
    // Unset keeps the context window baked into the model, so the team never forces a reload.
    numCtx: env.AGENT_TEAM_NUM_CTX ? Number(env.AGENT_TEAM_NUM_CTX) : undefined,
    callTimeoutMs: Number(env.AGENT_TEAM_CALL_TIMEOUT_MS || 300_000),
  };
}

export async function loadRoles(path = join(here, "roles.json")) {
  const team = JSON.parse(await readFile(path, "utf8"));
  // A role answers to its id or its name, so `as GilbertTwo` and `as admin` are the same agent.
  const byId = new Map(team.roles.map((r) => [r.id, r]));
  for (const r of team.roles) byId.set(r.name.toLowerCase(), r);
  return { ...team, byId };
}

// Limits that keep one ask from running for an hour on a CPU model.
export const MAX_STEPS = 8; // model calls per agent per task
export const MAX_DELEGATIONS = 4; // hand-offs per ask
const MAX_TOOL_TEXT = 6000; // characters of any one tool result shown back to the model
const MAX_LIST = 200;
const MAX_SEARCH_HITS = 40;
const COMMAND_TIMEOUT_MS = 120_000;

const clip = (text, n = MAX_TOOL_TEXT) =>
  text.length <= n ? text : `${text.slice(0, n)}\n[… ${text.length - n} more characters not shown]`;

// A path the model gives is only ever inside `root`; anything else is refused, not resolved.
export function inside(root, given) {
  const full = resolve(root, String(given ?? ".").replace(/^\/+/, ""));
  const rel = relative(root, full);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === rel) {
    throw new Error(`Refused: ${given} is outside the folder this team may use.`);
  }
  return full;
}

const TOOL_SPECS = {
  delegate: {
    description: "Hand one piece of work to a teammate and wait for their report.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", enum: ["designer", "developer", "admin"] },
        task: { type: "string", description: "The whole task, standing on its own." },
      },
      required: ["to", "task"],
    },
  },
  list_files: {
    description: "List the files and folders in a folder of the work folder.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: [] },
  },
  read_file: {
    description: "Read a text file in the work folder.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  search_files: {
    description: "Find lines containing some text in the work folder's files.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" }, path: { type: "string" } },
      required: ["text"],
    },
  },
  write_draft: {
    description: "Save a file as a draft for Gilbert to review. It does not change the work folder.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  propose_command: {
    description: "Queue a shell command for Gilbert to approve. It does not run now.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" }, reason: { type: "string" } },
      required: ["command", "reason"],
    },
  },
  draft_email: {
    description: "Draft an email for Gilbert to approve. It is not sent now.",
    parameters: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["to", "subject", "body"],
    },
  },
  read_inbox: {
    description: "Read recent emails from the team's mailbox.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const KNOWN_TOOLS = Object.keys(TOOL_SPECS);

// What connecting a mailbox would take, said wherever email is asked for.
export const MAILBOX_STUB =
  "No mailbox is connected, so nothing can be read or sent yet. Connecting one needs a dedicated " +
  "mailbox for the team (not Gilbert's own), with IMAP to read and SMTP to send and an app password " +
  "kept on the server, or a Google Workspace or Microsoft 365 account with read and send permission.";

async function walk(dir, root, out, limit) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (out.length >= limit) return;
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out, limit);
    else if (entry.isFile()) out.push(full);
  }
}

// Approvals are numbered files under <home>/approvals, so the founder can list, read and approve
// them from the terminal and the record of what was approved survives the run.
export async function queueApproval(cfg, record) {
  const dir = join(cfg.home, "approvals");
  await mkdir(dir, { recursive: true });
  const numbers = (await readdir(dir)).map((f) => Number.parseInt(f, 10)).filter(Number.isFinite);
  const id = (numbers.length ? Math.max(...numbers) : 0) + 1;
  const full = { id, status: "waiting", queuedAt: new Date().toISOString(), ...record };
  await writeFile(join(dir, `${id}.json`), `${JSON.stringify(full, null, 2)}\n`);
  return full;
}

export async function listApprovals(cfg) {
  const dir = join(cfg.home, "approvals");
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    const all = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8"))));
    return all.sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}

export async function saveApproval(cfg, record) {
  await writeFile(join(cfg.home, "approvals", `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

// Runs an approved command inside this container. Only team.mjs approve calls it, after the founder
// has typed yes at the terminal; no tool the model can call reaches it.
export function runApprovedCommand(command, cwd) {
  return new Promise((done) => {
    const child = spawn("bash", ["-c", command], { cwd, timeout: COMMAND_TIMEOUT_MS });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code, signal) => done({ code, signal, output: clip(output, 20_000) }));
    child.on("error", (err) => done({ code: null, signal: null, output: String(err) }));
  });
}

function makeTools(cfg, role, ctx) {
  const draftsRoot = join(cfg.home, "drafts", role.id);
  return {
    async delegate({ to, task }) {
      if (ctx.delegations >= MAX_DELEGATIONS) {
        return `Refused: this ask has already been handed out ${MAX_DELEGATIONS} times. Report to Gilbert with what you have.`;
      }
      const mate = ctx.team.byId.get(to);
      if (!mate || mate.reportsTo !== role.id) return `Refused: ${to} does not report to you.`;
      ctx.delegations += 1;
      const report = await runAgent(cfg, ctx.team, mate, task, ctx);
      return clip(`${mate.name} (${mate.title}) reports:\n${report}`, 4000);
    },
    async list_files({ path = "." } = {}) {
      const dir = inside(cfg.workdir, path);
      const files = [];
      await walk(dir, cfg.workdir, files, MAX_LIST);
      if (!files.length) return "The folder is empty.";
      return files.map((f) => relative(cfg.workdir, f)).join("\n") + (files.length >= MAX_LIST ? "\n[list cut short]" : "");
    },
    async read_file({ path }) {
      const file = inside(cfg.workdir, path);
      if ((await stat(file)).size > 2_000_000) return "Refused: that file is too large to read here.";
      return clip(await readFile(file, "utf8"));
    },
    async search_files({ text, path = "." }) {
      const needle = String(text ?? "");
      if (!needle) return "Refused: give some text to search for.";
      const files = [];
      await walk(inside(cfg.workdir, path), cfg.workdir, files, 5000);
      const hits = [];
      for (const file of files) {
        if ((await stat(file)).size > 1_000_000) continue;
        const lines = (await readFile(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (hits.length < MAX_SEARCH_HITS && line.includes(needle)) {
            hits.push(`${relative(cfg.workdir, file)}:${i + 1}: ${line.trim().slice(0, 200)}`);
          }
        });
        if (hits.length >= MAX_SEARCH_HITS) break;
      }
      return hits.length ? hits.join("\n") : "Nothing found.";
    },
    async write_draft({ path, content }) {
      const file = inside(draftsRoot, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, String(content ?? ""));
      ctx.drafts.push(relative(cfg.home, file));
      return `Saved as a draft at ${relative(cfg.home, file)}. The work folder is unchanged.`;
    },
    async propose_command({ command, reason }) {
      const queued = await queueApproval(cfg, { kind: "command", by: role.id, command, reason });
      ctx.approvals.push(queued.id);
      return `Queued as approval ${queued.id}. It has not run; it runs only if Gilbert approves it.`;
    },
    async draft_email({ to, subject, body }) {
      const queued = await queueApproval(cfg, { kind: "email", by: role.id, to, subject, body });
      ctx.approvals.push(queued.id);
      return `Drafted as approval ${queued.id}. It has not been sent. ${MAILBOX_STUB}`;
    },
    async read_inbox() {
      return MAILBOX_STUB;
    },
  };
}

export async function chat(cfg, messages, tools) {
  const body = { model: cfg.model, messages, tools, stream: false, think: false };
  if (cfg.numCtx) body.options = { num_ctx: cfg.numCtx };
  let response;
  try {
    response = await fetch(`${cfg.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.callTimeoutMs),
    });
  } catch (err) {
    throw new Error(`Could not reach Qwen at ${cfg.ollamaUrl} (${err.cause?.code || err.name}). Run the team inside the gilbertone container, where Ollama listens.`);
  }
  if (!response.ok) throw new Error(`Ollama answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()).message ?? { role: "assistant", content: "" };
}

function parseArgs(raw) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

// One agent working one task to a report. `ctx` is shared by the whole ask, so the hand-off limit,
// the drafts and the approvals are counted across all four.
export async function runAgent(cfg, team, role, task, ctx) {
  const tools = makeTools(cfg, role, ctx);
  const allowed = role.tools.filter((t) => TOOL_SPECS[t]);
  const specs = allowed.map((name) => ({ type: "function", function: { name, ...TOOL_SPECS[name] } }));
  const lead = team.byId.get(role.reportsTo);
  const boss = role.reportsTo === "founder" ? team.founder : `${lead?.name}, the ${lead?.title}`;
  const system = [
    team.shared,
    `Your name is ${role.name}.`,
    role.prompt,
    `You report to ${boss}. What you will not do:`,
    ...role.refuses.map((r) => `- ${r}`),
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
  ].join("\n");
  const messages = [{ role: "system", content: system }, { role: "user", content: task }];
  ctx.log(role, "start", task);
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const started = Date.now();
    const reply = await chat(cfg, messages, specs);
    ctx.log(role, "model", `${((Date.now() - started) / 1000).toFixed(1)} s`);
    messages.push(reply);
    const calls = reply.tool_calls ?? [];
    if (!calls.length) {
      const report = (reply.content ?? "").trim() || "(no report)";
      ctx.log(role, "report", report);
      return report;
    }
    for (const call of calls) {
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      let result;
      if (!allowed.includes(name)) result = `Refused: ${role.title} has no tool called ${name}.`;
      else {
        ctx.log(role, "tool", `${name} ${JSON.stringify(args).slice(0, 160)}`);
        try {
          result = await tools[name](args);
        } catch (err) {
          result = String(err.message || err);
        }
      }
      messages.push({ role: "tool", tool_name: name, content: clip(String(result)) });
    }
  }
  const stopped = `Stopped after ${MAX_STEPS} steps without finishing.`;
  ctx.log(role, "report", stopped);
  return stopped;
}

// The founder's ask, given to the lead (the Project Manager) or, with `as`, to one role directly.
export async function ask(cfg, team, text, { as = team.lead, log = () => {} } = {}) {
  const role = team.byId.get(String(as).toLowerCase());
  if (!role) throw new Error(`No one called ${as}. The team: ${team.roles.map((r) => `${r.name} (${r.id})`).join(", ")}`);
  const ctx = { team, delegations: 0, drafts: [], approvals: [], log };
  await mkdir(cfg.home, { recursive: true });
  const report = await runAgent(cfg, team, role, text, ctx);
  return { report, drafts: ctx.drafts, approvals: ctx.approvals };
}
