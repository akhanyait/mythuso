// The founder's status page for the work team. Names and titles stay in roles.json. What each
// person has done stays in status.json. This script inlines both into status.html so the page
// opens as a file and never fetches. It fails when the page drifts from those files, when a
// status names a role the roster does not have, or when a roster id has no status.
//
// The page is not a patient route. A patient on metered data must not download an agent roster,
// and nothing here is installed or running: the notice is status.json's own sentence.

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

export function renderStatusHtml(roles, status) {
  const problems = statusProblems(roles, status);
  if (problems.length) throw new Error(problems.join("\n"));
  const byId = new Map(status.people.map((person) => [person.id, person]));
  const cards = roles.roles.map((role) => {
    const person = byId.get(role.id);
    return `    <article>
      <h2>${escapeHtml(role.name)}</h2>
      <p class="title">${escapeHtml(role.title)}</p>
      <p class="word">${escapeHtml(person.word)}</p>
      <p class="sentence">${escapeHtml(person.sentence)}</p>
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
  footer { margin-top:1.25rem; color:var(--muted); font-size:0.9rem; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(status.heading)}</h1>
  <p class="notice">${escapeHtml(status.notice)}</p>
${cards}
  <footer>Names and titles are roles.json. These sentences are status.json. This page does not call the network, and it is not part of the patient app.</footer>
</main>
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
