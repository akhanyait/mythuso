// The founder's status page for the work team. Names and titles stay in roles.json. What each
// person has done stays in status.json. This script inlines both into status.html so the roster
// is not typed a second time. It fails when the page drifts from those files, when a status names
// a role the roster does not have, or when a roster id has no status.
//
// The page is not a patient route. A patient on metered data must not download an agent roster.
// A task recorded on the page is held by board.mjs in the gitignored work folder. Recording it
// does not start anyone: the notice is status.json's own sentence, and the held line is too.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The only status words the page will print. "Running" and "active" are not among them,
// because nobody on this team is a live process.
export const STATUS_WORDS = ["not running", "standby", "scoped", "done on this branch"];

// The notice has to keep the decision's own words: the install has not been run, and these
// are not six cloud agents. The page prints that sentence above the names.
const NOTICE_MUST_SAY = [
  "not installed",
  "has not been run",
  "not six cloud agents",
  "not live processes",
  "Nobody is running",
];

export function readTeamStatus(dir = here) {
  const roles = JSON.parse(readFileSync(join(dir, "roles.json"), "utf8"));
  const status = JSON.parse(readFileSync(join(dir, "status.json"), "utf8"));
  return { roles, status };
}

export function statusProblems(roles, status) {
  const problems = [];
  if (!roles || !Array.isArray(roles.roles)) problems.push("roles.json has no roles array");
  if (!status || !Array.isArray(status.people)) problems.push("status.json has no people array");
  const notice = typeof status?.notice === "string" ? status.notice : "";
  for (const phrase of NOTICE_MUST_SAY) {
    if (!notice.includes(phrase)) problems.push(`the notice no longer says "${phrase}"`);
  }
  if (typeof status?.heading === "string" && /\bactive\b/i.test(status.heading)) {
    problems.push("the heading groups the team as active");
  }
  if (typeof status?.held !== "string" || status.held.trim() === "") {
    problems.push("status.json has no held sentence");
  }
  const roster = new Map();
  for (const role of roles?.roles ?? []) {
    if (roster.has(role.id)) problems.push(`roles.json repeats ${role.id}`);
    roster.set(role.id, role);
  }
  const seen = new Set();
  for (const person of status?.people ?? []) {
    if (!roster.has(person.id)) {
      problems.push(`status.json names ${person.id}, which roles.json does not have`);
    }
    if (seen.has(person.id)) problems.push(`status.json names ${person.id} twice`);
    seen.add(person.id);
    if (!STATUS_WORDS.includes(person.word)) {
      problems.push(`${person.id} has status word "${person.word}", which this page does not use`);
    }
    if (typeof person.sentence !== "string" || person.sentence.trim() === "") {
      problems.push(`${person.id} has no sentence`);
    }
  }
  for (const id of roster.keys()) {
    if (!seen.has(id)) problems.push(`roles.json has ${id}, and status.json has no status for it`);
  }
  return problems;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// The page asks the local board for tasks and posts a new one back. It has no other request.
// Opened as a file, the request fails and the empty line stays, because a file cannot write
// the work folder and must not pretend it stored anything.
const PAGE_SCRIPT = `
function showTask(task) {
  var list = document.querySelector("ul.tasks[data-role='" + CSS.escape(task.roleId) + "']");
  if (!list) return;
  var item = document.createElement("li");
  var words = document.createElement("p");
  words.className = "task-text";
  words.textContent = task.text;
  var held = document.createElement("p");
  held.className = "held";
  held.textContent = task.sentence;
  item.append(words, held);
  list.append(item);
  var empty = document.getElementById("empty");
  if (empty) empty.hidden = true;
}
async function loadBoard() {
  try {
    var response = await fetch("/board");
    if (!response.ok) return;
    var board = await response.json();
    (board.tasks || []).forEach(showTask);
  } catch (error) {
    // Opened as a file, or the board is not running. The empty line stays.
  }
}
document.getElementById("task-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  var form = event.currentTarget;
  var button = form.querySelector("button");
  var problem = document.getElementById("problem");
  button.disabled = true;
  problem.textContent = "";
  try {
    var response = await fetch("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: form.roleId.value, text: form.text.value }),
    });
    var body = await response.json();
    if (!response.ok) {
      problem.textContent = body.error || "The task was not recorded.";
      return;
    }
    showTask(body);
    form.text.value = "";
  } catch (error) {
    problem.textContent = "Run node board.mjs in this folder, then open the address it prints. This file cannot store a task by itself.";
  } finally {
    button.disabled = false;
  }
});
loadBoard();
`;

export function renderStatusHtml(roles, status) {
  const problems = statusProblems(roles, status);
  if (problems.length) throw new Error(problems.join("\n"));
  const byId = new Map(status.people.map((person) => [person.id, person]));
  const options = roles.roles.map((role) =>
    `        <option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}, ${escapeHtml(role.title)}</option>`,
  ).join("\n");
  const cards = roles.roles.map((role) => {
    const person = byId.get(role.id);
    return `    <article>
      <h2>${escapeHtml(role.name)}</h2>
      <p class="title">${escapeHtml(role.title)}</p>
      <p class="word">${escapeHtml(person.word)}</p>
      <p class="sentence">${escapeHtml(person.sentence)}</p>
      <ul class="tasks" data-role="${escapeHtml(role.id)}"></ul>
    </article>`;
  }).join("\n");
  return `<!doctype html>
<!--
  Drawn by render-status.mjs from roles.json and status.json. Do not edit the names or the
  sentences here: the check fails when this file drifts. No fetch, no storage, no patient route.
  The host team is not installed, and this page must not say otherwise.
-->
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#083848">
<title>${escapeHtml(status.heading)}</title>
<style>
  :root {
    --ink:#083848; --bg:#eef6f7; --surface:#ffffff; --text:#0f172a; --muted:#51616b;
    --line:#d6e4e7; --warn-bg:#fff6e5; --warn-ink:#8a4b06;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; color:var(--text); background:var(--bg);
    font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  }
  main { max-width:40rem; margin:0 auto; padding:1.5rem 1rem 3rem; }
  h1 { margin:0 0 0.75rem; color:var(--ink); font-size:1.75rem; letter-spacing:-0.02em; }
  .notice {
    margin:0 0 1.25rem; padding:0.85rem 1rem; border-radius:0.75rem;
    background:var(--warn-bg); color:var(--warn-ink);
  }
  article { padding:0.9rem 0; border-top:1px solid var(--line); }
  article h2 { margin:0; font-size:1.15rem; color:var(--ink); }
  .title { margin:0.1rem 0 0; color:var(--muted); }
  .word {
    display:inline-block; margin:0.45rem 0 0; padding:0.1rem 0.65rem;
    border:1px solid var(--line); border-radius:999px; color:var(--muted);
    background:var(--surface); font-size:0.85rem;
  }
  .sentence { margin:0.45rem 0 0; }
  form { margin:0 0 1.25rem; padding:0.9rem 1rem; border-radius:0.75rem; background:var(--surface); border:1px solid var(--line); }
  label { display:block; margin:0.7rem 0 0.25rem; color:var(--muted); font-size:0.9rem; }
  label:first-child { margin-top:0; }
  select, input {
    width:100%; min-height:44px; padding:0.5rem 0.7rem; border:1px solid var(--line); border-radius:0.6rem;
    background:var(--surface); color:var(--text); font:inherit;
  }
  button {
    margin-top:0.85rem; min-height:44px; padding:0 1rem; border:0; border-radius:999px;
    background:var(--ink); color:#fff; font:inherit;
  }
  button:disabled { opacity:0.6; }
  .hint, #empty, #problem { margin:0.6rem 0 0; color:var(--muted); font-size:0.9rem; }
  #problem:empty { display:none; }
  ul.tasks { list-style:none; margin:0.7rem 0 0; padding:0; }
  ul.tasks li { margin:0 0 0.6rem; }
  .task-text { margin:0; }
  .held { margin:0.15rem 0 0; color:var(--warn-ink); }
  footer { margin-top:1.25rem; color:var(--muted); font-size:0.9rem; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(status.heading)}</h1>
  <p class="notice">${escapeHtml(status.notice)}</p>
  <form id="task-form">
    <label for="role">Who</label>
    <select id="role" name="roleId" required>
${options}
    </select>
    <label for="task">Task</label>
    <input id="task" name="text" type="text" required maxlength="2000" autocomplete="off">
    <button type="submit">Record the task</button>
    <p class="hint">Recording a task does not start anyone.</p>
    <p id="empty">No tasks yet.</p>
    <p id="problem" role="status"></p>
  </form>
${cards}
  <footer>Names and titles are roles.json. These sentences are status.json. A recorded task is held in the work folder on this machine. It does not start anyone, and this page is not part of the patient app.</footer>
</main>
<script>
${PAGE_SCRIPT}
</script>
</body>
</html>
`;
}

export function checkStatusPage(dir = here) {
  const { roles, status } = readTeamStatus(dir);
  const html = renderStatusHtml(roles, status);
  const onDisk = readFileSync(join(dir, "status.html"), "utf8");
  if (onDisk !== html) {
    throw new Error("status.html has drifted from roles.json and status.json. Run: node render-status.mjs");
  }
  return html;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  if (check) {
    checkStatusPage();
    console.log("status.html matches roles.json and status.json.");
  } else {
    const { roles, status } = readTeamStatus();
    writeFileSync(join(here, "status.html"), renderStatusHtml(roles, status));
    console.log("Wrote status.html");
  }
}
