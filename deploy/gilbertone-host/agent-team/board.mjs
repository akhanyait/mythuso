// The founder's board for the work team. It serves status.html and writes a duty into the
// gitignored work folder. With no model chosen, the reply is written here from roles.json and
// status.json. With a Cursor model chosen, that model writes the reply and the reply names it.
// Qwen on the server stays not connected: this file does not call it. The board key lives in
// the work folder and is never written into the page source. The Cursor key is read from the
// environment and is never written here either.
//
// A duty names role ids from roles.json. One id is one person. Two or more are one shared
// thread, held for each of them. None is the whole team. A greeting or a line of small talk
// with nobody @-named is one person: the trailing name when that person is on the rail,
// otherwise the lead. It does not fan out, and it is not held for the whole team. The
// sentence is never taken from the request, and neither is the line that says who it is held for.
//
//   node board.mjs
//   open http://127.0.0.1:8765/status.html

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ask, loadRoles, probeModel, settings } from "./agents.mjs";
import { isQwenChoice, listCursorModels, writeCursorReply } from "./cursor-models.mjs";
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

export function screenFile(cfg) {
  return join(cfg.workdir, "screen.json");
}

function stringList(value) {
  const seen = [];
  for (const id of value ?? []) {
    if (typeof id === "string" && id && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

export function emptyScreen() {
  return { added: [], hidden: [], pins: {}, done: [], dismissed: [], groups: [], muteDay: "" };
}

// Added people, hidden seed ids, pins, done, dismissed, named groups, the mute day,
// and edited crafts live in the work folder. roles.json is the seed and is not edited.
export function normalScreen(data) {
  const added = [];
  for (const person of data?.added ?? []) {
    if (!person || typeof person.id !== "string" || typeof person.name !== "string" || typeof person.craft !== "string") continue;
    if (!person.id || !person.name.trim() || !person.craft.trim()) continue;
    added.push({ id: person.id, name: person.name.trim(), craft: person.craft.trim() });
  }
  const hidden = stringList(data?.hidden);
  const pins = {};
  if (data?.pins && typeof data.pins === "object") {
    for (const [key, id] of Object.entries(data.pins)) {
      if (typeof key === "string" && key && typeof id === "string" && id) pins[key] = id;
    }
  }
  const groups = [];
  for (const group of data?.groups ?? []) {
    if (!group || typeof group.name !== "string" || !Array.isArray(group.roleIds)) continue;
    const name = group.name.trim();
    const roleIds = stringList(group.roleIds);
    if (!name || roleIds.length < 2 || typeof group.id !== "string" || !group.id) continue;
    groups.push({ id: group.id, name, roleIds });
  }
  const muteDay = typeof data?.muteDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.muteDay) ? data.muteDay : "";
  return { added, hidden, pins, done: stringList(data?.done), dismissed: stringList(data?.dismissed), groups, muteDay };
}

export async function readScreen(file) {
  try {
    return normalScreen(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return emptyScreen();
    throw error;
  }
}

export function johannesburgDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dutyHay(task) {
  const parts = [task?.text, task?.title, task?.heldFor];
  for (const reply of task?.replies ?? []) parts.push(reply?.name, reply?.text);
  return parts.filter((part) => typeof part === "string").join("\n").toLowerCase();
}

export function searchDuties(tasks, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return tasks;
  return tasks.filter((task) => dutyHay(task).includes(needle));
}

export function dayList(tasks, screen, now = new Date()) {
  const day = johannesburgDay(now);
  const done = new Set(screen.done ?? []);
  const dismissed = new Set(screen.dismissed ?? []);
  const lines = [];
  for (const task of tasks) {
    if (!task?.id || dismissed.has(task.id)) continue;
    const at = new Date(task.at);
    if (Number.isNaN(at.getTime()) || johannesburgDay(at) !== day) continue;
    const time = new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
    const who = task.title || "Whole team";
    const text = String(task.text ?? "").split("\n")[0].trim();
    lines.push(`${time} — ${who} — ${text} — ${done.has(task.id) ? "done" : "held"}`);
  }
  return lines.join("\n");
}

export function heldCount(tasks, screen) {
  const done = new Set(screen.done ?? []);
  const dismissed = new Set(screen.dismissed ?? []);
  return tasks.filter((task) => task?.id && !done.has(task.id) && !dismissed.has(task.id)).length;
}

async function writeScreen(file, screen) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(normalScreen(screen), null, 2)}\n`);
}

// The rail: the six, minus anyone he has removed, plus anyone he has added on this screen.
export function screenRoster(roles, screen = { added: [], hidden: [] }) {
  const hidden = new Set(screen.hidden ?? []);
  const people = [];
  for (const role of roles.roles ?? []) {
    if (hidden.has(role.id)) continue;
    people.push({ id: role.id, name: role.name, title: role.title, seed: true });
  }
  for (const person of screen.added ?? []) {
    if (!person || hidden.has(person.id) || people.some((row) => row.id === person.id)) continue;
    people.push({ id: person.id, name: person.name, title: person.craft, seed: false });
  }
  return people;
}

export function addPerson(roles, screen, input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const craft = typeof input?.craft === "string" ? input.craft.trim().replace(/\s+/g, " ") : "";
  if (!name) throw Object.assign(new Error("A person needs a name."), { statusCode: 400 });
  if (!/^[A-Za-z]+$/.test(name)) {
    throw Object.assign(new Error("Use a single word of letters for the name, so @ can find them."), { statusCode: 400 });
  }
  if (!craft) throw Object.assign(new Error("A person needs a one-line craft."), { statusCode: 400 });
  if (craft.length > 160) throw Object.assign(new Error("The craft is longer than 160 characters."), { statusCode: 400 });
  const rail = screenRoster(roles, screen);
  if (rail.some((person) => person.name.toLowerCase() === name.toLowerCase())) {
    throw Object.assign(new Error(`${name} is already on this screen.`), { statusCode: 400 });
  }
  const person = { id: `screen-${randomBytes(4).toString("hex")}`, name, craft };
  return { screen: { ...screen, added: [...(screen.added ?? []), person] }, person };
}

export function removePerson(roles, screen, id) {
  const rail = screenRoster(roles, screen);
  if (!rail.some((person) => person.id === id)) {
    throw Object.assign(new Error("That person is not on this screen."), { statusCode: 400 });
  }
  if ((screen.added ?? []).some((person) => person.id === id)) {
    return { ...screen, added: screen.added.filter((person) => person.id !== id) };
  }
  return { ...screen, hidden: [...(screen.hidden ?? []), id] };
}

export function editCraft(roles, screen, input) {
  const id = typeof input?.id === "string" ? input.id : "";
  const craft = typeof input?.craft === "string" ? input.craft.trim().replace(/\s+/g, " ") : "";
  if ((roles.roles ?? []).some((role) => role.id === id)) {
    throw Object.assign(new Error("The six keep the craft in the roster."), { statusCode: 400 });
  }
  if (!(screen.added ?? []).some((person) => person.id === id)) {
    throw Object.assign(new Error("That person is not on this screen."), { statusCode: 400 });
  }
  if (!craft) throw Object.assign(new Error("A person needs a one-line craft."), { statusCode: 400 });
  if (craft.length > 160) throw Object.assign(new Error("The craft is longer than 160 characters."), { statusCode: 400 });
  return {
    ...screen,
    added: screen.added.map((person) => (person.id === id ? { ...person, craft } : person)),
  };
}

function requireTask(tasks, id) {
  const task = tasks.find((row) => row.id === id);
  if (!task) throw Object.assign(new Error("That duty is not on this screen."), { statusCode: 400 });
  return task;
}

export function pinDuty(tasks, screen, id) {
  const task = requireTask(tasks, id);
  const pins = { ...(screen.pins ?? {}) };
  if (pins[task.threadKey] === id) delete pins[task.threadKey];
  else pins[task.threadKey] = id;
  return { ...screen, pins };
}

export function markDone(tasks, screen, id) {
  requireTask(tasks, id);
  if ((screen.done ?? []).includes(id)) return screen;
  return { ...screen, done: [...(screen.done ?? []), id] };
}

export function dismissDuty(tasks, screen, id) {
  requireTask(tasks, id);
  const pins = { ...(screen.pins ?? {}) };
  for (const [key, pinned] of Object.entries(pins)) {
    if (pinned === id) delete pins[key];
  }
  if ((screen.dismissed ?? []).includes(id)) return { ...screen, pins };
  return { ...screen, pins, dismissed: [...(screen.dismissed ?? []), id] };
}

export function saveGroup(roles, screen, input) {
  const name = typeof input?.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name) throw Object.assign(new Error("A group needs a name."), { statusCode: 400 });
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) {
    throw Object.assign(new Error("Use letters for the group name."), { statusCode: 400 });
  }
  const rail = screenRoster(roles, screen);
  const wanted = new Set(Array.isArray(input?.roleIds) ? input.roleIds : []);
  const roleIds = rail.filter((person) => wanted.has(person.id)).map((person) => person.id);
  if (roleIds.length < 2) throw Object.assign(new Error("A group needs two or more people."), { statusCode: 400 });
  if ((screen.groups ?? []).some((group) => group.name.toLowerCase() === name.toLowerCase())) {
    throw Object.assign(new Error(`${name} is already a group on this screen.`), { statusCode: 400 });
  }
  const group = { id: `group-${randomBytes(3).toString("hex")}`, name, roleIds };
  return { screen: { ...screen, groups: [...(screen.groups ?? []), group] }, group };
}

export function removeGroup(screen, id) {
  if (!(screen.groups ?? []).some((group) => group.id === id)) {
    throw Object.assign(new Error("That group is not on this screen."), { statusCode: 400 });
  }
  return { ...screen, groups: screen.groups.filter((group) => group.id !== id) };
}

export function muteToday(screen, now = new Date()) {
  const day = johannesburgDay(now);
  return { ...screen, muteDay: screen.muteDay === day ? "" : day };
}

// A typed @Name is the assignment the page would have sent as a role id. The match is the
// roster on this screen, case aside. A name that is not there is refused, so the duty does
// not fall through to the whole team.
export function mentionIds(roles, text, screen = { added: [], hidden: [] }) {
  const rail = screenRoster(roles, screen);
  const ids = [];
  const unknown = [];
  const re = /(^|\s)@([A-Za-z]+)/g;
  const source = String(text ?? "");
  let match;
  while ((match = re.exec(source))) {
    const token = match[2];
    const person = rail.find((item) => item.name.toLowerCase() === token.toLowerCase());
    if (!person) {
      if (!unknown.some((item) => item.toLowerCase() === token.toLowerCase())) unknown.push(token);
    } else if (!ids.includes(person.id)) {
      ids.push(person.id);
    }
  }
  return { ids, unknown };
}

// Who a duty is for, in roster order, and the words the thread uses. An id that roles.json
// does not have is refused here, before anything is written. Duplicates collapse: one person
// per mention, however many times the same id arrives.
export function describeDuty(roles, roleIds, screen = { added: [], hidden: [] }) {
  const knownPeople = [
    ...(roles.roles ?? []).map((role) => ({ id: role.id, name: role.name })),
    ...(screen.added ?? []).map((person) => ({ id: person.id, name: person.name })),
  ];
  const known = new Set(knownPeople.map((person) => person.id));
  const ordered = [];
  for (const person of knownPeople) {
    if (roleIds.includes(person.id) && !ordered.some((row) => row.id === person.id)) ordered.push(person);
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

function dutyIds(roles, input, screen = { added: [], hidden: [] }) {
  const raw = Array.isArray(input?.roleIds)
    ? input.roleIds
    : (typeof input?.roleId === "string" && input.roleId !== "" ? [input.roleId] : []);
  // describeDuty throws on an unknown id. Walking the raw list first keeps that error on the
  // id that was sent, including one that is not a string.
  const known = new Set([
    ...(roles.roles ?? []).map((role) => role.id),
    ...(screen.added ?? []).map((person) => person.id),
  ]);
  const rail = new Set(screenRoster(roles, screen).map((person) => person.id));
  const seen = [];
  for (const id of raw) {
    if (typeof id !== "string" || !known.has(id)) {
      const shown = typeof id === "string" && id ? id : "nothing";
      throw Object.assign(new Error(`a task names ${shown}, which roles.json does not have`), { statusCode: 400 });
    }
    if (!rail.has(id)) {
      throw Object.assign(new Error(`a task names ${id}, who is not on this screen`), { statusCode: 400 });
    }
    if (!seen.includes(id)) seen.push(id);
  }
  // role ids and a @Name name the same person. A post that only carries the words, the way
  // a typed message does, still has to land on that person rather than the whole team.
  const mentioned = mentionIds(roles, input?.text, screen);
  if (mentioned.unknown.length) {
    throw Object.assign(new Error(`@${mentioned.unknown[0]} is not on this team.`), { statusCode: 400 });
  }
  for (const id of mentioned.ids) {
    if (!seen.includes(id)) seen.push(id);
  }
  // A greeting with nobody named is still one person's. Leaving it empty is how
  // "how are you?" was stored for the whole team.
  if (!seen.length) {
    const greetingId = greetingRoleId(roles, input?.text, screen);
    if (greetingId && rail.has(greetingId)) seen.push(greetingId);
  }
  return seen;
}

// The words the page must keep. They live in status.json; a reply copies them from there
// and refuses to speak if that sentence no longer contains them.
const HELD_WORDS = "The team is not installed, so nobody is carrying this out";

// A reply may name a role id from roles.json or a person added on this screen. Anything else
// is refused here, before a sentence is written.
function roleForReply(roles, id, screen = { added: [], hidden: [] }) {
  const role = (roles.roles ?? []).find((item) => item.id === id);
  if (role) return { ...role, screenOnly: false };
  const added = (screen.added ?? []).find((item) => item.id === id);
  if (added) return { id: added.id, name: added.name, title: added.craft, screenOnly: true };
  const shown = typeof id === "string" && id ? id : "nothing";
  throw Object.assign(new Error(`a reply names ${shown}, which roles.json does not have`), { statusCode: 400 });
}

function foldedMessage(text) {
  return String(text ?? "").trim().toLowerCase().replace(/['’]/g, "");
}

// Small talk is not a duty. Longest stems first, so "how are you doing" is not
// cut down to "how are you". A trailing name is one word, with or without @.
const GREETING_STEMS = [
  "how are you doing",
  "hows it going",
  "how are you",
  "sawubona",
  "howzit",
  "hello",
  "molo",
  "hey",
  "hi",
];

function greetingWords(text) {
  return foldedMessage(text)
    .replace(/[!.?,]+/g, " ")
    .replace(/(^|\s)@[a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Null when the line is longer than the greeting, so a real ask is not swallowed.
export function parseGreeting(text) {
  const greeting = greetingWords(text);
  for (const stem of GREETING_STEMS) {
    if (greeting === stem) return { stem, name: "" };
    const prefix = `${stem} `;
    if (!greeting.startsWith(prefix)) continue;
    const rest = greeting.slice(prefix.length);
    if (/^[a-z]+$/.test(rest)) return { stem, name: rest };
  }
  return null;
}

// A greeting, a question about the plan, or a piece of work. The words he typed decide which.
export function replyKind(text) {
  if (parseGreeting(text)) return "greeting";
  const folded = foldedMessage(text);
  const asks = folded.includes("?") || /^(what|whats)\b/.test(folded);
  if (asks && /\b(plan|today|held)\b/.test(folded)) return "plan";
  return "work";
}

function assertNotRunning(role, status) {
  if (role.screenOnly) return;
  const person = (status.people ?? []).find((row) => row.id === role.id);
  if (!person || !/not running/i.test(String(person.sentence ?? ""))) {
    throw new Error(`status.json does not say ${role.id} is not running`);
  }
}

export function morningLine(roles, screen, tasks) {
  const names = screenRoster(roles, screen).map((person) => person.name);
  let who = "nobody";
  if (names.length === 1) who = names[0];
  else if (names.length > 1) who = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const count = heldCount(tasks, screen);
  const held = count === 1 ? "1 duty is still held." : count === 0 ? "No duties are still held." : `${count} duties are still held.`;
  return `On the rail: ${who}. ${held}`;
}

function heldDuties(tasks, screen, exceptId) {
  const done = new Set(screen?.done ?? []);
  const dismissed = new Set(screen?.dismissed ?? []);
  return (tasks ?? []).filter((task) => task?.id && task.id !== exceptId && !done.has(task.id) && !dismissed.has(task.id));
}

function planSentences(tasks, screen, exceptId) {
  const rows = heldDuties(tasks, screen, exceptId);
  if (!rows.length) return "Nothing else is still held.";
  const shown = rows.slice(0, 4);
  const lines = shown.map((task) => {
    const at = new Date(task.at);
    const time = Number.isNaN(at.getTime())
      ? "an unknown time"
      : new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "numeric", minute: "2-digit" }).format(at);
    const who = task.title || "the whole team";
    const words = String(task.text ?? "").split("\n")[0].trim();
    return `At ${time}, ${who}: ${words}.`;
  });
  const rest = rows.length - shown.length;
  if (rest === 1) lines.push("1 more is still held.");
  else if (rest > 1) lines.push(`${rest} more are still held.`);
  return lines.join(" ");
}

function greetingName(roles, screen, text) {
  const parsed = parseGreeting(text);
  if (!parsed?.name) return null;
  return screenRoster(roles, screen).find((person) => person.name.toLowerCase() === parsed.name) ?? null;
}

// Nobody @-named: the trailing roster name, or the lead. A word that is not a
// person ("hello there") stays with the lead, rather than the whole team.
export function greetingRoleId(roles, text, screen = { added: [], hidden: [] }) {
  if (!parseGreeting(text)) return null;
  const named = greetingName(roles, screen, text);
  return named?.id ?? roles.lead ?? null;
}

function replyText(role, status, wholeTeam, context = {}) {
  assertNotRunning(role, status);
  const kind = replyKind(context.text);
  const morning = morningLine(context.roles, context.screen, heldDuties(context.tasks, context.screen, context.exceptId));
  if (kind === "greeting") {
    const only = role.screenOnly ? " I am on this screen only." : "";
    return `Hello. I am ${role.name}.${only} ${morning} I am not running, so I have not started any work. ${HELD_WORDS}.`;
  }
  if (kind === "plan") {
    const list = planSentences(context.tasks, context.screen, context.exceptId);
    const only = role.screenOnly ? " I am on this screen only." : "";
    return `I am ${role.name}.${only} ${list} ${HELD_WORDS}.`;
  }
  const asked = String(context.text ?? "").trim().split("\n")[0].trim().slice(0, 180);
  const about = asked ? ` You wrote: ${asked}.` : "";
  if (role.screenOnly) {
    const craft = String(role.title ?? "").trim();
    const craftSentence = /[.!?]$/.test(craft) ? craft : `${craft}.`;
    return `I am ${role.name}. ${craftSentence} I am on this screen only.${about} I am not running and the duty is held, so I have not started it: ${HELD_WORDS}.`;
  }
  const will = wholeTeam ? role.willTeam : role.will;
  if (typeof will !== "string" || will.trim() === "") {
    throw new Error(`roles.json has no answer for ${role.id}`);
  }
  const doing = wholeTeam ? will.trim() : `I will ${will.trim()}`;
  return `I am ${role.name}, ${role.title}, and ${doing}.${about} I am not running and the duty is held, so I have not started it: ${HELD_WORDS}.`;
}

// Up to three other people on the rail. The words are their names, not a second roster.
export function nextMessages(roles, screen, speakerId, dutyText) {
  const text = String(dutyText ?? "").trim();
  return screenRoster(roles, screen)
    .filter((person) => person.id !== speakerId)
    .slice(0, 3)
    .map((person) => {
      const mentioned = `@${person.name} ${text}`.replace(/\s+/g, " ").trim();
      return {
        roleId: person.id,
        name: person.name,
        label: `Hand this to ${person.name}`,
        text: mentioned.slice(0, MAX_TEXT),
      };
    });
}

// One named person answers a piece of work, in roster order. A greeting or a plan question
// is answered by the person named, or by the lead when nobody is named. The words come from
// the duty and from the duties already on the board, not from a model.
export function dutyReplies(roles, status, roleIds, screen = { added: [], hidden: [] }, context = {}) {
  if (!String(status?.held ?? "").includes(HELD_WORDS)) {
    throw new Error("status.json no longer says the team is not carrying this out");
  }
  const ids = Array.isArray(roleIds) ? roleIds : [];
  const kind = replyKind(context.text);
  const speakers = [];
  const named = kind === "greeting" ? greetingName(roles, screen, context.text) : null;
  if (kind === "greeting" || kind === "plan") {
    const speaker = ids.length === 1
      ? roleForReply(roles, ids[0], screen)
      : named
        ? roleForReply(roles, named.id, screen)
        : ids.length > 1
          ? roleForReply(roles, ids[0], screen)
          : roleForReply(roles, roles.lead, screen);
    speakers.push({ role: speaker, wholeTeam: false });
    if (ids.length > 1 && !named) {
      for (const id of ids.slice(1)) roleForReply(roles, id, screen);
    }
  } else if (ids.length === 0) {
    speakers.push({ role: roleForReply(roles, roles.lead, screen), wholeTeam: true });
  } else {
    const wanted = new Set(ids);
    const ordered = [
      ...(roles.roles ?? []),
      ...(screen.added ?? []).map((person) => ({ id: person.id })),
    ];
    for (const role of ordered) {
      if (wanted.has(role.id) && !speakers.some((row) => row.role.id === role.id)) {
        speakers.push({ role: roleForReply(roles, role.id, screen), wholeTeam: false });
      }
    }
    for (const id of ids) roleForReply(roles, id, screen);
  }
  const replyContext = { ...context, roles, screen };
  return speakers.map(({ role, wholeTeam }) => ({
    roleId: role.id,
    name: role.name,
    text: replyText(role, status, wholeTeam, replyContext),
  }));
}

// A Cursor reply is kept word for word, and only when it still names the model that wrote
// it. Anything else is rewritten from the roster, which is what a duty with no model chosen is.
function modelReplies(roles, task, screen) {
  if (task?.writtenByModel !== true) return null;
  const name = typeof task.modelName === "string" ? task.modelName.trim() : "";
  if (!name || !Array.isArray(task.replies) || task.replies.length === 0) return null;
  const replies = [];
  for (const reply of task.replies) {
    const text = typeof reply?.text === "string" ? reply.text : "";
    if (!text.includes(name)) return null;
    replies.push({
      roleId: reply.roleId,
      name: reply.name,
      text,
      suggestions: nextMessages(roles, screen, reply.roleId, task.text),
    });
  }
  return replies;
}

function titleFor(roles, screen, roleId) {
  const seeded = (roles.roles ?? []).find((role) => role.id === roleId);
  if (seeded?.title) return seeded.title;
  const added = (screen.added ?? []).find((person) => person.id === roleId);
  return added?.craft || "a teammate";
}

function presentReplies(roles, status, described, task, screen, tasks = []) {
  // Stored reply text is rewritten from the duty and the board. Pins, done, and dismissed
  // stay on the screen record and are not touched here.
  const replies = dutyReplies(roles, status, described.roleIds, screen, {
    text: typeof task.text === "string" ? task.text : "",
    tasks,
    exceptId: task.id,
  });
  return replies.map((reply) => ({
    ...reply,
    suggestions: nextMessages(roles, screen, reply.roleId, task.text),
  }));
}

// A duty may name role ids from roles.json, or a @Name in the words, which is that person.
// No ids and no mention is the whole team. The text is the founder's words. The sentence
// is never taken from the request: it is the held line,
// because recording a duty does not start anyone. The replies are written here, not copied
// from the request and not written by a model.
export function holdTask(roles, status, tasks, input, screen = { added: [], hidden: [] }) {
  const described = describeDuty(roles, dutyIds(roles, input, screen), screen);
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
    replies: dutyReplies(roles, status, described.roleIds, screen, { text, tasks }),
    at: new Date().toISOString(),
  };
  return { tasks: [...tasks, task], task };
}

// A stored duty is shown only when every id it names is still on the roster. The receipt
// is status.json's held sentence unless a model is connected and the engine wrote a report.
// The sentence is never taken from the request.
export function presentTask(roles, status, task, options = {}) {
  const screen = options.screen ?? { added: [], hidden: [] };
  let raw = Array.isArray(task?.roleIds)
    ? task.roleIds
    : (typeof task?.roleId === "string" && task.roleId ? [task.roleId] : null);
  if (!raw) return null;
  // A greeting stored before this rule still had no ids. The reply is already
  // rewritten on read; the thread follows, and the file is left as it was.
  if (raw.length === 0) {
    const greetingId = greetingRoleId(roles, task?.text, screen);
    if (greetingId && screenRoster(roles, screen).some((person) => person.id === greetingId)) {
      raw = [greetingId];
    }
  }
  try {
    const described = describeDuty(roles, raw, screen);
    const report = options.modelConnected === true
      && task.fromEngine === true
      && typeof task.report === "string"
      ? task.report.trim()
      : "";
    const kept = modelReplies(roles, task, screen);
    return {
      id: task.id,
      ...described,
      text: typeof task.text === "string" ? task.text : "",
      // With OLLAMA_URL unset, the receipt stays status.json's held sentence.
      sentence: report || status.held,
      replies: kept || presentReplies(roles, status, described, task, screen, options.tasks ?? []),
      writtenByModel: Boolean(kept),
      modelName: kept ? task.modelName : undefined,
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

async function readPosted(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch (error) {
    if (error.statusCode) throw error;
    throw Object.assign(new Error("That was not understood."), { statusCode: 400 });
  }
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
        const html = await readFile(pagePath, "utf8");
        send(res, 200, html, "text/html; charset=utf-8", cookie);
        return;
      }
      if (req.method === "GET" && url.pathname === "/models") {
        const models = await listCursorModels(env, fetchImpl);
        send(res, 200, {
          models: models.map((model) => ({ id: model.id, displayName: model.displayName })),
          qwen: { id: "qwen", label: "Qwen on the server", connected: false },
        }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "GET" && url.pathname === "/board") {
        const { roles, status } = readTeamStatus();
        const screen = await readScreen(screenFile(cfg));
        const rawTasks = await readTasks(tasksFile(cfg));
        const tasks = rawTasks
          .map((task) => presentTask(roles, status, task, { modelConnected: false, screen, tasks: rawTasks }))
          .filter(Boolean);
        const lead = (roles.roles ?? []).find((role) => role.id === roles.lead);
        const dismissed = new Set(screen.dismissed ?? []);
        send(res, 200, {
          held: status.held,
          modelConnected: false,
          qwenConnected: false,
          leadId: roles.lead,
          leadName: lead?.name ?? "",
          people: screenRoster(roles, screen),
          pins: screen.pins ?? {},
          done: screen.done ?? [],
          dismissed: screen.dismissed ?? [],
          groups: screen.groups ?? [],
          muteDay: screen.muteDay ?? "",
          heldCount: heldCount(tasks, screen),
          dayList: dayList(tasks, screen),
          tasks: tasks.filter((task) => !dismissed.has(task.id)),
        }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "GET" && url.pathname === "/search") {
        const { roles, status } = readTeamStatus();
        const screen = await readScreen(screenFile(cfg));
        const rawTasks = await readTasks(tasksFile(cfg));
        const tasks = rawTasks
          .map((task) => presentTask(roles, status, task, { screen, tasks: rawTasks }))
          .filter(Boolean);
        send(res, 200, { tasks: searchDuties(tasks, url.searchParams.get("q") || "") }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/people") {
        let input;
        try {
          input = JSON.parse(await readBody(req));
        } catch (error) {
          if (error.statusCode) throw error;
          throw Object.assign(new Error("The person was not understood."), { statusCode: 400 });
        }
        const { roles } = readTeamStatus();
        const file = screenFile(cfg);
        const screen = await readScreen(file);
        const { screen: next, person } = addPerson(roles, screen, input);
        await writeScreen(file, next);
        send(res, 201, { person, people: screenRoster(roles, next) }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/people/remove") {
        let input;
        try {
          input = JSON.parse(await readBody(req));
        } catch (error) {
          if (error.statusCode) throw error;
          throw Object.assign(new Error("The person was not understood."), { statusCode: 400 });
        }
        const { roles } = readTeamStatus();
        const file = screenFile(cfg);
        const screen = await readScreen(file);
        const next = removePerson(roles, screen, typeof input?.id === "string" ? input.id : "");
        await writeScreen(file, next);
        send(res, 200, { people: screenRoster(roles, next) }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/people/craft") {
        const input = await readPosted(req);
        const { roles } = readTeamStatus();
        const file = screenFile(cfg);
        const next = editCraft(roles, await readScreen(file), input);
        await writeScreen(file, next);
        send(res, 200, { people: screenRoster(roles, next) }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && (url.pathname === "/tasks/pin" || url.pathname === "/tasks/done" || url.pathname === "/tasks/dismiss")) {
        const input = await readPosted(req);
        const id = typeof input?.id === "string" ? input.id : "";
        const file = screenFile(cfg);
        const screen = await readScreen(file);
        const tasks = await readTasks(tasksFile(cfg));
        const next = url.pathname === "/tasks/pin"
          ? pinDuty(tasks, screen, id)
          : url.pathname === "/tasks/done"
            ? markDone(tasks, screen, id)
            : dismissDuty(tasks, screen, id);
        await writeScreen(file, next);
        send(res, 200, { pins: next.pins, done: next.done, dismissed: next.dismissed }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/groups") {
        const input = await readPosted(req);
        const { roles } = readTeamStatus();
        const file = screenFile(cfg);
        const { screen: next, group } = saveGroup(roles, await readScreen(file), input);
        await writeScreen(file, next);
        send(res, 201, { group, groups: next.groups }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/groups/remove") {
        const input = await readPosted(req);
        const file = screenFile(cfg);
        const next = removeGroup(await readScreen(file), typeof input?.id === "string" ? input.id : "");
        await writeScreen(file, next);
        send(res, 200, { groups: next.groups }, "application/json; charset=utf-8", cookie);
        return;
      }
      if (req.method === "POST" && url.pathname === "/screen/mute") {
        const file = screenFile(cfg);
        const next = muteToday(await readScreen(file));
        await writeScreen(file, next);
        send(res, 200, { muteDay: next.muteDay }, "application/json; charset=utf-8", cookie);
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
        const screen = await readScreen(screenFile(cfg));
        const file = tasksFile(cfg);
        const existing = await readTasks(file);
        const held = holdTask(roles, status, existing, input, screen);
        let { task } = held;
        let { tasks } = held;
        const chosen = typeof input?.model === "string" ? input.model.trim() : "";
        if (chosen) {
          if (isQwenChoice(chosen)) {
            throw Object.assign(new Error("Qwen on the server is not connected."), { statusCode: 422 });
          }
          const catalog = await listCursorModels(env, fetchImpl);
          const model = catalog.find((item) => item.id === chosen);
          if (!model) {
            throw Object.assign(new Error("That model is not one this key can call."), { statusCode: 400 });
          }
          const replies = [];
          for (const reply of task.replies) {
            const text = await writeCursorReply(env, fetchImpl, model, {
              speakerName: reply.name,
              speakerTitle: titleFor(roles, screen, reply.roleId),
              duty: task.text,
              held: status.held,
            });
            replies.push({ ...reply, text });
          }
          task = { ...task, writtenByModel: true, modelId: model.id, modelName: model.displayName, replies };
          tasks = [...existing, task];
        }
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify({ tasks }, null, 2)}\n`);
        const shown = presentTask(roles, status, task, { screen, tasks });
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
  const server = await startBoard({ port });
  const address = server.address();
  console.log(`Work team board at http://127.0.0.1:${address.port}/status.html`);
  console.log("Qwen on the server is not connected.");
  console.log("Cursor models are in the picker. A reply names the model that wrote it.");
}
