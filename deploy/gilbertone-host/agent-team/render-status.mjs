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

// One drawing each, and none of them is a face or a status. Thandi directs the work out,
// Kabelo draws the structure, Lerato shapes a screen, Sipho builds the web, Karabo builds
// the phones, Nomsa checks. A missing drawing fails the render, so a new role cannot ship
// as a blank card or as somebody else's mark.
const ICONS = {
  pm: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="7" cy="16" r="3.1" fill="currentColor"/><path d="M10.4 16H16M16 16c3.2-5.2 6-6.6 9.4-6.6M16 16h9.6M16 16c3.2 5.2 6 6.6 9.4 6.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="26.2" cy="9.4" r="1.55" fill="currentColor"/><circle cx="26.6" cy="16" r="1.55" fill="currentColor"/><circle cx="26.2" cy="22.6" r="1.55" fill="currentColor"/></svg>`,
  architect: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 26.5V13L16 6.5 27 13v13.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M5 17.5h22M11.5 26.5V17.5M20.5 26.5V17.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="16" cy="13.2" r="1.35" fill="currentColor"/></svg>`,
  designer: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="5.5" width="24" height="17.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.75"/><rect x="7.2" y="8.8" width="9.2" height="6.2" rx="1.2" fill="currentColor"/><rect x="18.2" y="8.8" width="6.4" height="6.2" rx="1.2" fill="currentColor" opacity="0.45"/><rect x="7.2" y="17" width="17.4" height="2.5" rx="1" fill="currentColor" opacity="0.72"/><path d="M12 26.5h8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  engineer: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3.5" y="6" width="25" height="17.5" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M3.5 11.2h25" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="7" cy="8.6" r="0.85" fill="currentColor"/><circle cx="10" cy="8.6" r="0.85" fill="currentColor"/><path d="M12.2 19.6 9.6 16.6 12.2 13.6M19.8 13.6l2.6 3-2.6 3M14.2 20.2l3.4-7.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "engineer-2": `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="16.2" y="8" width="10" height="17.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M19.2 11.2h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><rect x="5.5" y="4.2" width="13" height="23.6" rx="2.3" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 8.2h6M10 24.2h4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  qa: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="4" width="18" height="24" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M11 12.4l1.7 1.7 3.1-3.4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.2 12.2H22M11.5 18.2H22M11.5 23H22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
};

function iconFor(id) {
  const svg = ICONS[id];
  if (!svg) throw new Error(`no icon for ${id}`);
  return svg;
}

// Outfit and Figtree, the two faces the product already hosts. Inlined so this board,
// which serves one HTML file, does not need a second copy of the files and does not
// ask a font service who is reading the page. Latin covers this screen.
function typeFaces() {
  const dir = join(here, "../../../apps/web/public/fonts");
  const face = (family, file, weight) => {
    const data = readFileSync(join(dir, file)).toString("base64");
    return `@font-face{font-family:"${family}";src:url("data:font/woff2;base64,${data}") format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;
  };
  return [
    face("Outfit", "outfit-latin.woff2", "500 700"),
    face("Figtree", "figtree-latin.woff2", "400 800"),
  ].join("\n");
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
    return `    <article class="person person-${escapeHtml(role.id)}">
      <header class="person-head">
        <span class="mark">${iconFor(role.id)}</span>
        <div>
          <h2>${escapeHtml(role.name)}</h2>
          <p class="title">${escapeHtml(role.title)}</p>
        </div>
      </header>
      <p class="word">${escapeHtml(person.word)}</p>
      <p class="sentence">${escapeHtml(person.sentence)}</p>
      <ul class="tasks" data-role="${escapeHtml(role.id)}"></ul>
    </article>`;
  }).join("\n");
  const founder = typeof roles.founder === "string" && roles.founder.trim() ? roles.founder.trim() : "the founder";
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
<meta name="theme-color" content="#f5f4ef">
<title>${escapeHtml(status.heading)}</title>
<style>
${typeFaces()}
  /* Warm paper (--studio-paper), brand ink, and the accent as a still mark.
     Nobody is running, so nothing here pulses, and green is never a live dot.
     Motion is a short arrival and a small lift: transform and opacity only. */
  :root {
    --ink:#083848; --paper:#f5f4ef; --surface:#ffffff; --text:#022235; --muted:#4e6b7a;
    --line:#e4ddd2; --accent:#189870; --warn-bg:#fff6e8; --warn-ink:#7a3e0b;
    --ease:cubic-bezier(0.22,1,0.36,1);
  }
  * { box-sizing:border-box; }
  html { color-scheme:light; }
  body {
    margin:0; color:var(--text); background:
      radial-gradient(920px 420px at 0% -8%, rgba(159,225,203,.55), transparent 62%),
      radial-gradient(720px 380px at 100% 0%, rgba(244,221,201,.85), transparent 58%),
      var(--paper);
    font:16px/1.5 Figtree,ui-sans-serif,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  main { max-width:1080px; margin:0 auto; padding:40px 24px 72px; }
  .kicker {
    margin:0; color:var(--ink); font-size:13px; font-weight:700; letter-spacing:.08em;
    text-transform:uppercase;
  }
  h1 {
    margin:8px 0 0; color:var(--ink); font-family:Outfit,ui-sans-serif,system-ui,sans-serif;
    font-size:44px; font-weight:600; letter-spacing:-.03em; line-height:1.05; text-wrap:balance;
  }
  .lede { max-width:40rem; margin:14px 0 0; font-size:18px; line-height:1.45; color:#243844; }
  .notice {
    margin:22px 0 0; padding:14px 16px; border:1px solid #f0ddc0; border-radius:12px;
    background:var(--warn-bg); color:var(--warn-ink); font-size:15px; line-height:1.5;
  }
  form {
    margin:22px 0 28px; padding:22px; border:1px solid var(--line); border-radius:16px;
    background:var(--surface); box-shadow:0 8px 24px rgba(2,34,53,.06);
  }
  .composer-title {
    margin:0; font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:22px;
    font-weight:600; letter-spacing:-.02em; color:var(--ink);
  }
  .composer-copy { margin:6px 0 16px; color:var(--muted); font-size:15px; }
  .composer-row { display:grid; grid-template-columns:minmax(18rem,26rem) minmax(0,1fr) auto; gap:12px 14px; align-items:end; }
  label { display:block; margin:0 0 6px; color:var(--ink); font-size:13px; font-weight:700; }
  select, input {
    width:100%; min-height:44px; padding:10px 12px; border:1px solid #d9d1c5; border-radius:8px;
    background:#fffdf9; color:var(--text); font:inherit;
  }
  button {
    min-height:44px; padding:0 18px; border:0; border-radius:8px; background:var(--ink); color:#fff;
    font:inherit; font-weight:650; cursor:pointer;
    transition:transform 160ms var(--ease), opacity 160ms var(--ease);
  }
  button:hover:not(:disabled) { transform:translateY(-1px); }
  button:disabled { opacity:.6; cursor:not-allowed; }
  :focus-visible { outline:3px solid #ffb347; outline-offset:2px; }
  .hint, #empty, #problem { margin:12px 0 0; color:var(--muted); font-size:14px; }
  #problem:empty { display:none; }
  #problem:not(:empty) { color:var(--warn-ink); }
  .roster { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  article {
    display:flex; flex-direction:column; min-width:0; padding:20px 20px 18px; border:1px solid var(--line);
    border-radius:16px; background:
      linear-gradient(var(--stripe), var(--stripe)) 0 0 / 100% 4px no-repeat,
      radial-gradient(140px 90px at 100% 0%, var(--wash), transparent 72%),
      var(--surface);
    box-shadow:0 8px 24px rgba(2,34,53,.05);
    animation:arrive 280ms var(--ease) backwards;
    transition:transform 180ms var(--ease);
  }
  article:nth-child(2) { animation-delay:40ms; }
  article:nth-child(3) { animation-delay:80ms; }
  article:nth-child(4) { animation-delay:120ms; }
  article:nth-child(5) { animation-delay:160ms; }
  article:nth-child(6) { animation-delay:200ms; }
  article:hover { transform:translateY(-2px); }
  @keyframes arrive { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  .person-pm { --stripe:#189870; --wash:rgba(24,152,112,.18); }
  .person-architect { --stripe:#083848; --wash:rgba(8,56,72,.10); }
  .person-designer { --stripe:#e8a07a; --wash:rgba(244,221,201,.95); }
  .person-engineer { --stripe:#189870; --wash:rgba(159,225,203,.7); }
  .person-engineer-2 { --stripe:#ffb347; --wash:rgba(255,179,71,.28); }
  .person-qa { --stripe:#466647; --wash:rgba(178,192,170,.55); }
  .person-head { display:flex; gap:14px; align-items:flex-start; }
  .mark {
    display:grid; place-items:center; width:56px; height:56px; flex:none; border-radius:14px;
  }
  .mark svg { width:30px; height:30px; display:block; }
  .person-pm .mark { background:#083848; color:#9fe1cb; }
  .person-architect .mark { background:#e7eef2; color:#083848; }
  .person-designer .mark { background:#f4ddc9; color:#9a3412; }
  .person-engineer .mark { background:#d7f3ea; color:#0c5c48; }
  .person-engineer-2 .mark { background:#fff1d6; color:#92400e; }
  .person-qa .mark { background:#e7eee4; color:#24382c; }
  article h2 {
    margin:2px 0 0; font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:22px;
    font-weight:600; letter-spacing:-.02em; line-height:1.15; color:var(--ink);
  }
  .title { margin:3px 0 0; color:var(--muted); font-size:14px; line-height:1.35; }
  .word {
    align-self:flex-start; margin:14px 0 0; padding:4px 10px; border-radius:999px;
    background:#eef1f2; color:#3e5160; font-size:13px; font-weight:700;
  }
  .person-architect .word { background:#e7eef2; color:#083848; }
  .person-designer .word { background:#f8efe6; color:#7a3e12; }
  .person-engineer-2 .word { background:#fff4e3; color:#92400e; }
  .person-qa .word { background:#eef3ec; color:#24382c; }
  .sentence { margin:12px 0 0; font-size:15px; line-height:1.55; color:#1c3340; }
  ul.tasks { list-style:none; margin:16px 0 0; padding:0; display:grid; gap:8px; }
  ul.tasks:empty { display:none; }
  ul.tasks li {
    margin:0; padding:12px 14px; border:1px solid #f0e0c8; border-radius:12px; background:#fff8ee;
    animation:arrive 220ms var(--ease) backwards;
  }
  .task-text { margin:0; font-weight:650; }
  .held { margin:4px 0 0; color:var(--warn-ink); font-size:14px; line-height:1.45; }
  footer { margin-top:28px; max-width:44rem; color:var(--muted); font-size:14px; line-height:1.5; }
  @media (max-width:860px) {
    .composer-row { grid-template-columns:1fr; }
    button { width:100%; }
  }
  @media (max-width:800px) {
    main { padding:28px 16px 56px; }
    h1 { font-size:34px; }
    .lede { font-size:17px; }
    .roster { grid-template-columns:1fr; }
    form, article { padding:18px 16px; }
  }
  @media (prefers-reduced-motion:reduce) {
    *, *::before, *::after {
      animation:none !important; transition:none !important;
    }
    article:hover, button:hover:not(:disabled) { transform:none; }
  }
</style>
</head>
<body>
<main>
  <header class="mast">
    <p class="kicker">${escapeHtml(founder)}'s page</p>
    <h1>${escapeHtml(status.heading)}</h1>
    <p class="lede">Six roles on this page, and none of them is running. A task you record stays under that person's name, held, because nobody is carrying it out.</p>
  </header>
  <p class="notice">${escapeHtml(status.notice)}</p>
  <form id="task-form">
    <h2 class="composer-title">Give a task</h2>
    <p class="composer-copy">Choose who it is for, and write it in your own words.</p>
    <div class="composer-row">
      <div>
        <label for="role">Who</label>
        <select id="role" name="roleId" required>
${options}
        </select>
      </div>
      <div>
        <label for="task">Task</label>
        <input id="task" name="text" type="text" required maxlength="2000" autocomplete="off" placeholder="What should be held">
      </div>
      <button type="submit">Record the task</button>
    </div>
    <p class="hint">Recording a task does not start anyone.</p>
    <p id="empty">No tasks yet.</p>
    <p id="problem" role="status"></p>
  </form>
  <div class="roster">
${cards}
  </div>
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
