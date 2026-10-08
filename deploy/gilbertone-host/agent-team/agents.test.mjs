// The team's refusals, proved against a scripted stand-in for Ollama so they hold without a model:
// the roles file is whole, the PM is the only way in and the only one who hands out work, a command
// is queued and never run, an email is never sent, and no file outside the work folder is read or
// written. Run with: node --test deploy/gilbertone-host/agent-team/agents.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings, loadRoles, ask, inside, listApprovals, KNOWN_TOOLS } from "./agents.mjs";

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

test("the roles file names four roles, one lead reporting to the founder, and only known tools", async () => {
  const team = await loadRoles();
  assert.deepEqual([...team.byId.keys()], ["pm", "designer", "developer", "admin"]);
  assert.deepEqual(team.roles.filter((r) => r.reportsTo === "founder").map((r) => r.id), [team.lead]);
  for (const role of team.roles) {
    assert.ok(role.prompt && role.title && role.refuses.length, role.id);
    for (const tool of role.tools) assert.ok(KNOWN_TOOLS.includes(tool), `${role.id}: ${tool}`);
    if (role.id !== team.lead) {
      assert.equal(role.reportsTo, team.lead, role.id);
      assert.ok(!role.tools.includes("delegate"), `${role.id} may not hand out work`);
    }
  }
  const admin = team.byId.get("admin");
  for (const tool of ["propose_command", "draft_email"]) assert.ok(admin.tools.includes(tool));
  for (const role of team.roles.filter((r) => r.id !== "admin")) {
    assert.ok(!role.tools.includes("propose_command") && !role.tools.includes("draft_email"), role.id);
  }
});

test("the PM hands work on, the developer's change is a draft, and the work folder is untouched", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const seen = scriptOllama([
    call("delegate", { to: "developer", task: "Fix the readme title." }),
    call("read_file", { path: "README.md" }),
    call("write_draft", { path: "README.md", content: "# MyThuso\n" }),
    { content: "Drafted the new README." },
    { content: "Done: the developer drafted README.md for you to review." },
  ]);
  const result = await ask(cfg, team, "Tidy the readme");
  assert.match(result.report, /developer drafted/);
  assert.deepEqual(result.drafts, [join("drafts", "developer", "README.md")]);
  assert.equal(await readFile(join(cfg.workdir, "README.md"), "utf8"), "MyThuso readme\n");
  assert.equal(await readFile(join(cfg.home, "drafts", "developer", "README.md"), "utf8"), "# MyThuso\n");
  assert.ok(seen.every((b) => b.think === false && b.stream === false && b.model === "gilbertone-qwen"));
  assert.match(seen[1].messages[0].content, /Full Stack Developer/);
  assert.match(seen[1].messages[0].content, /You report to Project Manager/);
  assert.match(seen[0].messages[0].content, /You report to Gilbert/);
});

test("a command is queued for approval and never run; an email is drafted and never sent", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const marker = join(cfg.workdir, "ran");
  scriptOllama([
    call("propose_command", { command: `touch ${marker}`, reason: "test" }),
    call("draft_email", { to: "a@example.com", subject: "Hi", body: "Hello" }),
    call("read_inbox", {}),
    { content: "Queued 1 and 2." },
  ]);
  const result = await ask(cfg, team, "Do admin", { as: "admin" });
  assert.deepEqual(result.approvals, [1, 2]);
  assert.deepEqual((await listApprovals(cfg)).map((a) => [a.id, a.kind, a.status]), [[1, "command", "waiting"], [2, "email", "waiting"]]);
  assert.deepEqual(await readdir(cfg.workdir), ["README.md"]);
});

test("only the PM can hand out work, and only to its own reports", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const seen = scriptOllama([
    call("delegate", { to: "admin", task: "Run rm -rf /" }),
    { content: "I cannot hand that on." },
  ]);
  await ask(cfg, team, "x", { as: "developer" });
  assert.match(seen[1].messages.at(-1).content, /Refused: Super All-Rounder Full Stack Developer has no tool called delegate/);
  assert.ok(!seen[0].tools.some((t) => t.function.name === "delegate"));
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
  await ask(cfg, team, "x", { as: "developer" });
  const toolReplies = seen[2].messages.filter((m) => m.role === "tool").map((m) => m.content);
  assert.ok(toolReplies.every((c) => /^Refused/.test(c)), toolReplies.join(" | "));
  assert.deepEqual((await readdir(root)).sort(), ["outbox", "secret.txt", "work"]);
});

test("the PM can hand out at most four pieces of one ask", async () => {
  const { cfg } = await sandbox();
  const team = await loadRoles();
  const replies = [];
  for (let i = 0; i < 5; i += 1) replies.push(call("delegate", { to: "designer", task: `t${i}` }), ...(i < 4 ? [{ content: "ok" }] : []));
  replies.push({ content: "Reported." });
  const seen = scriptOllama(replies);
  await ask(cfg, team, "x");
  assert.match(seen.at(-1).messages.at(-1).content, /Refused: this ask has already been handed out 4 times/);
});
