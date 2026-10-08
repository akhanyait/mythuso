#!/usr/bin/env node
// The founder's way into the four-agent team, from a terminal inside the gilbertone container:
//
//   node team.mjs ask "…"            the Project Manager takes it and hands work to the others
//   node team.mjs as Lerato "…"      talk to one directly: Thandi (pm), Lerato (designer),
//                                    Sipho (developer) or GilbertTwo (admin)
//   node team.mjs roles              who is on the team and what each may do
//   node team.mjs pending            commands and emails waiting for approval
//   node team.mjs approve 3          show approval 3, and run it only if you type yes
//   node team.mjs reject 3
//   node team.mjs check              is Qwen answering, and how fast
//
// Approval is a person at this terminal typing "yes" after reading the command. There is no flag
// that skips it, because the point of the gate is that nothing the model writes runs unread.

import { createInterface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  settings, loadRoles, ask, listApprovals, saveApproval, runApprovedCommand, chat, MAILBOX_STUB,
} from "./agents.mjs";

const cfg = settings();
const team = await loadRoles();
const [command, ...rest] = process.argv.slice(2);

const shortName = (role) => role.name;
const minutes = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`);

function progress(transcript) {
  return (role, kind, text) => {
    const line =
      kind === "start" ? `\n▶ ${shortName(role)} starts: ${text.split("\n")[0].slice(0, 140)}`
      : kind === "model" ? `  · ${shortName(role)} thought for ${text}`
      : kind === "tool" ? `  · ${shortName(role)} uses ${text}`
      : `✔ ${shortName(role)} reports back.`;
    console.log(line);
    transcript.push(kind === "report" ? `### ${role.title} reports\n\n${text}\n` : line.trim());
  };
}

async function runAsk(roleId, text) {
  if (!text) throw new Error('Give the ask in quotes, e.g. node team.mjs ask "Plan the shop launch email"');
  const transcript = [`# Ask, ${new Date().toISOString()}\n\n> ${text}\n`];
  const started = Date.now();
  console.log(`Qwen answers one request at a time on this server's CPUs, so this takes minutes, not seconds.`);
  const result = await ask(cfg, team, text, { as: roleId, log: progress(transcript) });
  const took = minutes(Date.now() - started);
  const runs = join(cfg.home, "runs");
  await mkdir(runs, { recursive: true });
  const file = join(runs, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  await writeFile(file, `${transcript.join("\n")}\n\nTook ${took}.\n`);
  console.log(`\n────────\n${result.report}\n────────`);
  if (result.drafts.length) console.log(`Drafts (nothing in the work folder changed):\n${result.drafts.map((d) => `  ${join(cfg.home, d)}`).join("\n")}`);
  if (result.approvals.length) console.log(`Waiting for your approval: ${result.approvals.join(", ")}. Read one with: node team.mjs approve <number>`);
  console.log(`Took ${took}. The whole run is saved at ${file}`);
}

async function approve(id) {
  const record = (await listApprovals(cfg)).find((a) => a.id === Number(id));
  if (!record) throw new Error(`There is no approval ${id}. See: node team.mjs pending`);
  if (record.status !== "waiting") throw new Error(`Approval ${id} is already ${record.status}.`);
  if (record.kind === "email") {
    console.log(`Email from ${record.by} to ${record.to}\nSubject: ${record.subject}\n\n${record.body}\n`);
    console.log(MAILBOX_STUB);
    console.log("It stays waiting; copy it into your own mail if you want it sent.");
    return;
  }
  console.log(`${record.by} wants to run, inside the gilbertone container:\n\n  ${record.command}\n\nWhy: ${record.reason}\n`);
  if (!process.stdin.isTTY) throw new Error("Approving needs you at a terminal to type yes.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Type "yes" to run it, anything else to leave it waiting: ')).trim();
  rl.close();
  if (answer !== "yes") return console.log("Left waiting. Nothing ran.");
  const result = await runApprovedCommand(record.command, cfg.workdir);
  Object.assign(record, { status: "ran", ranAt: new Date().toISOString(), exitCode: result.code, output: result.output });
  await saveApproval(cfg, record);
  console.log(`${result.output}\nExit code ${result.code ?? result.signal}. Saved with approval ${id}.`);
}

async function main() {
  switch (command) {
    case "ask":
      return runAsk(team.lead, rest.join(" "));
    case "as":
      return runAsk(rest[0], rest.slice(1).join(" "));
    case "roles":
      for (const role of team.roles) {
        const boss = role.reportsTo === "founder" ? team.founder : team.byId.get(role.reportsTo).name;
        console.log(`\n${role.name} (${role.id}): ${role.title}\n  reports to ${boss}\n  tools: ${role.tools.join(", ")}`);
        for (const r of role.refuses) console.log(`  · ${r}`);
      }
      return;
    case "pending": {
      const waiting = (await listApprovals(cfg)).filter((a) => a.status === "waiting");
      if (!waiting.length) return console.log("Nothing is waiting for approval.");
      for (const a of waiting) {
        console.log(`${a.id}. ${a.kind} from ${a.by}: ${a.kind === "command" ? a.command : `to ${a.to}, "${a.subject}"`}`);
      }
      return;
    }
    case "approve":
      return approve(rest[0]);
    case "reject": {
      const record = (await listApprovals(cfg)).find((a) => a.id === Number(rest[0]));
      if (!record || record.status !== "waiting") throw new Error(`There is no waiting approval ${rest[0]}.`);
      await saveApproval(cfg, { ...record, status: "rejected", rejectedAt: new Date().toISOString() });
      return console.log(`Approval ${record.id} rejected. Nothing ran.`);
    }
    case "check": {
      const started = Date.now();
      const reply = await chat(cfg, [{ role: "user", content: "Say ready in one word." }], []);
      return console.log(`${cfg.model} at ${cfg.ollamaUrl} answered "${reply.content.trim()}" in ${minutes(Date.now() - started)}.`);
    }
    default:
      console.log('Usage: node team.mjs ask "…" | as <Thandi|Lerato|Sipho|GilbertTwo> "…" | roles | pending | approve <n> | reject <n> | check');
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exitCode = 1;
});
