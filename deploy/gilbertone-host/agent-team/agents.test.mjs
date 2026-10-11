// The team's refusals, proved against a scripted stand-in for Ollama so they hold without a model:
// the roles file is the roster that was asked for, the PM is the only way in and the only one who
// hands out work, a command is queued and never run, an email cannot be sent by anyone on the
// roster, and no file outside the work folder is read or written.
// Run with: node --test deploy/gilbertone-host/agent-team/agents.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings, loadRoles, ask, inside, listApprovals, delegationCap, KNOWN_TOOLS } from "./agents.mjs";
import { readTeamStatus, statusProblems, checkStatusPage, shortenStatus } from "./render-status.mjs";
import { startBoard } from "./board.mjs";

// The model stand-in replaces global fetch and does not put it back. The board test talks to
// its own server, so it keeps the fetch this file was loaded with.
const realFetch = globalThis.fetch;

const ROSTER = [
  ["pm", "Thandi", "Project Manager"],
  ["architect", "Kabelo", "Enterprise Architect"],
  ["designer", "Lerato", "Specialist Creative Designer, Senior UI/UX"],
  ["engineer", "Sipho", "Specialist Full Stack Engineer"],
  ["engineer-2", "Karabo", "Specialist Full Stack Engineer"],
  ["qa", "Nomsa", "QA and Tester"],
];

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "agent-team-"));
  const workdir = join(root, "work");
  await mkdir(workdir);
  await writeFile(join(workdir, "README.md"), "MyThuso readme\n");
  await writeFile(join(root, "secret.txt"), "not yours\n");
  return { root, cfg: settings({ AGENT_TEAM_HOME: join(root, "outbox"), AGENT_TEAM_WORKDIR: workdir }) };
}

// Each entry answers one /api/chat call, in order, and records what was asked.
function scriptOllama(replies) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    const next = replies.shift();
    assert.ok(next, `unexpected extra model call from: ${body.messages[0].content.slice(0, 80)}`);
    return new Response(JSON.stringify({ message: { role: "assistant", ...next } }));
  };
  return seen;
}
const call = (name, args) => ({ content: "", tool_calls: [{ function: { name, arguments: args } }] });

test("the roles file is the six-person roster, one lead, and only known tools", async () => {
  const team = await loadRoles();
  assert.deepEqual(
    team.roles.map((r) => [r.id, r.name, r.title]),
    ROSTER,
  );
  assert.equal(team.byId.get("karabo"), team.byId.get("engineer-2"));
  assert.equal(team.byId.get("nomsa"), team.byId.get("qa"));
  assert.equal(team.byId.get("kabelo"), team.byId.get("architect"));
  assert.deepEqual(team.roles.filter((r) => r.reportsTo === "founder").map((r) => r.id), [team.lead]);
  assert.equal(delegationCap(team), 5);
  for (const role of team.roles) {
    assert.ok(role.prompt && role.title && role.refuses.length, role.id);
    for (const tool of role.tools) assert.ok(KNOWN_TOOLS.includes(tool), `${role.id}: ${tool}`);
    if (role.id !== team.lead) {
      assert.equal(role.reportsTo, team.lead, role.id);
      assert.ok(!role.tools.includes("delegate"), `${role.id} may not hand out work`);
    }
  }
  const qa = team.byId.get("qa");
  assert.ok(qa.tools.includes("propose_command"));
  for (const role of team.roles.filter((r) => r.id !== "qa")) {
    assert.ok(!role.tools.includes("propose_command"), role.id);
  }
  for (const role of team.roles) {
    assert.ok(!role.tools.includes("draft_email") && !role.tools.includes("read_inbox"), role.id);
  }
  assert.equal(team.roles.filter((r) => r.title === "Specialist Full Stack Engineer").length, 2);
});

test("the PM hands one engineer a change, it is a draft, and the work folder is untouched", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const seen = scriptOllama([
    call("delegate", { to: "engineer", task: "Fix the readme title." }),
    call("read_file", { path: "README.md" }),
    call("write_draft", { path: "README.md", content: "# MyThuso\n" }),
    { content: "Drafted the new README." },
    { content: "Done: Sipho drafted README.md for you to review." },
  ]);
  const result = await ask(cfg, team, "Tidy the readme");
  assert.match(result.report, /Sipho drafted/);
  assert.deepEqual(result.drafts, [join("drafts", "engineer", "README.md")]);
  assert.equal(await readFile(join(cfg.workdir, "README.md"), "utf8"), "MyThuso readme\n");
  assert.equal(await readFile(join(cfg.home, "drafts", "engineer", "README.md"), "utf8"), "# MyThuso\n");
  assert.ok(seen.every((b) => b.think === false && b.stream === false && b.model === "gilbertone-qwen" && !b.options));
  assert.match(seen[1].messages[0].content, /Specialist Full Stack Engineer/);
  assert.match(seen[1].messages[0].content, /Your name is Sipho\.[\s\S]*You report to Thandi, the Project Manager/);
  assert.match(seen[0].messages[0].content, /You report to Gilbert/);
  const delegate = seen[0].tools.find((t) => t.function.name === "delegate");
  assert.deepEqual(delegate.function.parameters.properties.to.enum, ["architect", "designer", "engineer", "engineer-2", "qa"]);
});

test("the two engineers draft into separate folders and neither can queue a command", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const seen = scriptOllama([
    call("delegate", { to: "engineer", task: "Draft the web copy." }),
    call("write_draft", { path: "web.md", content: "web\n" }),
    { content: "Web draft done." },
    call("delegate", { to: "engineer-2", task: "Draft the iOS note." }),
    call("propose_command", { command: "npm test", reason: "not mine" }),
    call("write_draft", { path: "ios.md", content: "ios\n" }),
    { content: "iOS draft done." },
    { content: "Both engineers drafted." },
  ]);
  const result = await ask(cfg, team, "Split the work");
  assert.deepEqual(result.drafts, [join("drafts", "engineer", "web.md"), join("drafts", "engineer-2", "ios.md")]);
  assert.deepEqual(result.approvals, []);
  const toolText = seen.flatMap((body) => body.messages.filter((m) => m.role === "tool").map((m) => m.content)).join("\n");
  assert.match(toolText, /Karabo \(Specialist Full Stack Engineer\) has no tool called propose_command/);
  assert.equal(await readFile(join(cfg.home, "drafts", "engineer-2", "ios.md"), "utf8"), "ios\n");
});

test("QA queues a check and it does not run; nobody on the roster can send email", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const marker = join(cfg.workdir, "ran");
  const seen = scriptOllama([
    call("propose_command", { command: `touch ${marker}`, reason: "the check" }),
    call("draft_email", { to: "a@example.com", subject: "Hi", body: "Hello" }),
    { content: "Queued the check." },
  ]);
  const result = await ask(cfg, team, "Run the check", { as: "Nomsa" });
  assert.deepEqual(result.approvals, [1]);
  assert.deepEqual((await listApprovals(cfg)).map((a) => [a.id, a.kind, a.status]), [[1, "command", "waiting"]]);
  assert.deepEqual(await readdir(cfg.workdir), ["README.md"]);
  assert.match(seen[2].messages.filter((m) => m.role === "tool")[1].content, /Nomsa \(QA and Tester\) has no tool called draft_email/);
  assert.ok(!seen[0].tools.some((t) => t.function.name === "draft_email" || t.function.name === "delegate"));
});

test("the engine still refuses to send an email if a role is later given the tool", async () => {
  const { cfg } = await sandbox();
  const team = structuredClone(await loadRoles());
  team.byId.get("qa").tools.push("draft_email", "read_inbox");
  scriptOllama([
    call("draft_email", { to: "a@example.com", subject: "Hi", body: "Hello" }),
    call("read_inbox", {}),
    { content: "Drafted, not sent." },
  ]);
  const result = await ask(cfg, team, "Mail", { as: "qa" });
  assert.deepEqual(result.approvals, [1]);
  const [email] = await listApprovals(cfg);
  assert.equal(email.kind, "email");
  assert.equal(email.status, "waiting");
  assert.equal(email.to, "a@example.com");
});

test("only the PM can hand out work, and only to someone who reports to them", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const seen = scriptOllama([
    call("delegate", { to: "qa", task: "Run rm -rf /" }),
    { content: "I cannot hand that on." },
  ]);
  await ask(cfg, team, "x", { as: "engineer" });
  assert.match(seen[1].messages.at(-1).content, /Refused: Sipho \(Specialist Full Stack Engineer\) has no tool called delegate/);
  assert.ok(!seen[0].tools.some((t) => t.function.name === "delegate"));

  const lead = scriptOllama([
    call("delegate", { to: "pm", task: "loop" }),
    { content: "Refused the loop." },
  ]);
  await ask(cfg, team, "x");
  assert.match(lead[1].messages.at(-1).content, /Refused: pm does not report to you/);
});

test("no path outside the work folder is read, and no draft lands outside the outbox", async () => {
  const { root, cfg } = await sandbox();
  assert.throws(() => inside(cfg.workdir, "../secret.txt"), /Refused/);
  assert.throws(() => inside(cfg.workdir, "a/../../secret.txt"), /Refused/);
  assert.equal(inside(cfg.workdir, "/README.md"), join(cfg.workdir, "README.md"));
  const team = await loadRoles();
  const seen = scriptOllama([
    call("read_file", { path: "../secret.txt" }),
    call("write_draft", { path: "../../../escape.txt", content: "x" }),
    { content: "Both refused." },
  ]);
  await ask(cfg, team, "x", { as: "engineer-2" });
  const toolReplies = seen[2].messages.filter((m) => m.role === "tool").map((m) => m.content);
  assert.ok(toolReplies.every((c) => /^Refused/.test(c)), toolReplies.join(" | "));
  assert.deepEqual((await readdir(root)).sort(), ["outbox", "secret.txt", "work"]);
});

test("the PM can brief each teammate once and no further", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const cap = delegationCap(team);
  const replies = [];
  for (let i = 0; i < cap + 1; i += 1) {
    replies.push(call("delegate", { to: "designer", task: `t${i}` }));
    if (i < cap) replies.push({ content: "ok" });
  }
  replies.push({ content: "Reported." });
  const seen = scriptOllama(replies);
  await ask(cfg, team, "x");
  assert.match(seen.at(-1).messages.at(-1).content, new RegExp(`Refused: this ask has already been handed out ${cap} times`));
});

test("status.json names only roster ids, and every roster id has a status", () => {
  const { roles, status } = readTeamStatus();
  assert.deepEqual(statusProblems(roles, status), []);

  const extra = structuredClone(status);
  extra.people.push({ id: "admin", word: "not running", sentence: "There is no admin on this team." });
  assert.ok(
    statusProblems(roles, extra).some((problem) => problem.includes("status.json names admin, which roles.json does not have")),
    statusProblems(roles, extra).join("\n"),
  );

  const missing = structuredClone(status);
  missing.people = missing.people.filter((person) => person.id !== "qa");
  assert.ok(
    statusProblems(roles, missing).some((problem) => problem.includes("roles.json has qa, and status.json has no status for it")),
    statusProblems(roles, missing).join("\n"),
  );

  const running = structuredClone(status);
  running.people[0].word = "running";
  assert.ok(statusProblems(roles, running).some((problem) => problem.includes("which this page does not use")));
});

test("the status page is inlined from the two JSON files and says the team is not installed", () => {
  const html = checkStatusPage();
  const { roles, status } = readTeamStatus();
  assert.equal(html.includes(">Active<"), false);
  assert.equal(html.includes("localStorage"), false);
  assert.equal(html.includes("sessionStorage"), false);
  assert.equal(html.includes("indexedDB"), false);
  const fetches = [...html.matchAll(/fetch\("([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(fetches.sort(), ["/board", "/tasks"]);
  assert.ok(html.includes(status.notice));
  assert.ok(html.includes("The host team is not installed."));
  assert.ok(html.includes("The browser may hand the words to its maker."));
  assert.ok(html.includes("No duties yet."));
  assert.ok(html.includes('id="mic"'));
  assert.ok(html.includes("45000"));
  assert.ok(html.indexOf('class="notice-lead"') < html.indexOf('id="task-form"'));
  assert.equal(status.held, "Held. The team is not installed, so nobody is carrying this out.");
  assert.equal(html.includes("Investment Bot"), false);
  assert.equal(html.includes("Hacker and Security"), false);
  assert.equal(html.includes("Marketing Bot"), false);
  for (const role of roles.roles) {
    const person = status.people.find((row) => row.id === role.id);
    const snippet = shortenStatus(person.sentence);
    const stem = snippet.endsWith("…") ? snippet.slice(0, -1) : snippet;
    assert.ok(html.includes(role.name), role.id);
    assert.ok(html.includes(role.title), role.id);
    assert.ok(html.includes(person.word), role.id);
    assert.ok(html.includes(person.sentence), role.id);
    assert.ok(html.includes(snippet), role.id);
    assert.ok(person.sentence.startsWith(stem), role.id);
    assert.ok(html.includes(`data-role="${role.id}"`), role.id);
    assert.ok(html.includes(`class="person person-${role.id}"`), role.id);
  }
  assert.equal((html.match(/<span class="mark">/g) ?? []).length, roles.roles.length);
  assert.ok(html.includes("prefers-reduced-motion"));
  assert.equal(/@keyframes\s+pulse|animation:\s*pulse/.test(html), false);
  assert.equal(html.includes("live-dot"), false);
});

test("a task that names a role the roster does not have is refused and not stored", async () => {
  const dir = await mkdtemp(join(tmpdir(), "board-"));
  const server = await startBoard({ port: 0, workdir: dir });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  try {
    const refused = await realFetch(`${url}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: "admin", text: "Install the team" }),
    });
    assert.equal(refused.status, 400);
    const problem = await refused.json();
    assert.match(problem.error, /a task names admin, which roles.json does not have/);
    assert.deepEqual((await (await realFetch(`${url}/board`)).json()).tasks, []);

    const held = await realFetch(`${url}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: "engineer", text: "Morning-of card on the web", sentence: "Sipho is running." }),
    });
    assert.equal(held.status, 201);
    const task = await held.json();
    assert.equal(task.roleId, "engineer");
    assert.equal(task.text, "Morning-of card on the web");
    assert.equal(task.sentence, "Held. The team is not installed, so nobody is carrying this out.");
    const board = await (await realFetch(`${url}/board`)).json();
    assert.equal(board.tasks.length, 1);
    assert.equal(board.tasks[0].sentence, task.sentence);
    assert.equal(board.held, task.sentence);

    const group = await realFetch(`${url}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleIds: ["qa", "designer", "designer"], text: "One shared check." }),
    });
    assert.equal(group.status, 201);
    const shared = await group.json();
    assert.equal(shared.audience, "group");
    assert.deepEqual(shared.roleIds, ["designer", "qa"]);
    assert.equal(shared.threadKey, "designer+qa");
    assert.equal(shared.title, "Lerato and Nomsa");
    assert.equal(shared.heldFor, "Held for Lerato and Nomsa.");
    assert.equal(shared.roleId, undefined);
    assert.equal(shared.sentence, task.sentence);

    const teamDuty = await realFetch(`${url}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleIds: [], text: "For everyone." }),
    });
    assert.equal(teamDuty.status, 201);
    const everyone = await teamDuty.json();
    assert.equal(everyone.audience, "team");
    assert.deepEqual(everyone.roleIds, []);
    assert.equal(everyone.heldFor, "Held for the whole team.");
    assert.equal(everyone.sentence, task.sentence);

    const mixed = await realFetch(`${url}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleIds: ["engineer", "admin"], text: "Do not store this." }),
    });
    assert.equal(mixed.status, 400);
    assert.match((await mixed.json()).error, /a task names admin, which roles.json does not have/);
    const after = await (await realFetch(`${url}/board`)).json();
    assert.equal(after.tasks.length, 3);
    assert.ok(after.tasks.every((row) => row.sentence === task.sentence));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a host without gilbertone-qwen runs the served Qwen with its thread count sent on every call", async () => {
  const { cfg: base } = await sandbox();
  const cfg = { ...base, ...settings({ AGENT_TEAM_HOME: base.home, AGENT_TEAM_WORKDIR: base.workdir }, { model: "qwen3.6:35b-a3b-q4_K_M", numThread: 10, numCtx: 8192 }) };
  const team = await loadRoles();
  const seen = scriptOllama([{ content: "Hello." }]);
  await ask(cfg, team, "hi", { as: "Thandi" });
  assert.equal(seen[0].model, "qwen3.6:35b-a3b-q4_K_M");
  assert.deepEqual(seen[0].options, { num_ctx: 8192, num_thread: 10 });
});
