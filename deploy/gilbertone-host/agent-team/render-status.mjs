// The founder's work-team page. Names and titles stay in roles.json. What each person has done
// stays in status.json. This script inlines both into status.html so the roster is not typed a
// second time. It fails when the page drifts from those files, when a status names a role the
// roster does not have, or when a roster id has no status.
//
// The page is a dark chat for Gilbert: a rail of the six, a thread, and a composer. It is not a
// patient route. A duty recorded on the page is held by board.mjs in the gitignored work folder.
// Recording it does not start anyone: the notice is status.json's own sentence, and the held line
// is too. The microphone is the browser's own recognition, opened only by a tap.

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

// The rail shows one line. It is the status sentence, cut on a word, never a sentence written
// for the rail. The full sentence stays on the control for anyone who needs it.
export function shortenStatus(sentence, max = 88) {
  const clean = String(sentence).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const space = slice.lastIndexOf(" ");
  const cut = (space > 48 ? slice.slice(0, space) : slice).replace(/[.,;:]+$/, "");
  return `${cut}…`;
}

const BRAND_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="4" width="24" height="24" rx="8" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/><circle cx="20" cy="14" r="1.4" fill="currentColor"/><circle cx="16" cy="20" r="1.4" fill="currentColor"/></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 8v16M8 16h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
const MIC_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="12" y="5" width="8" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M9 15.5a7 7 0 0 0 14 0M16 22.5V27M12 27h8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
const SEND_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 16h14M16 9l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

// The page asks the local board for duties and posts a new one back. It has no other request.
// Opened as a file, the request fails and the empty line stays, because a file cannot write
// the work folder and must not pretend it stored anything. The key, when the address has one,
// is read from that address for the fetches on this page. Nothing is written into browser storage.
// A recorded duty asks once for a notification and is also listed under Notices, so a phone
// that refuses the notification still shows who it was for.
//
// The microphone is the browser's own speech recognition, and only after a tap. There is no
// wake word. A single listen stops at 45 seconds and leaves the words in the box. If the
// browser has no recognition, the mic says the words have to be typed. It does not call a
// cloud voice API.
const PAGE_SCRIPT = `
var roster = JSON.parse(document.getElementById("roster").textContent);
var duties = [];
var openKey = "team";
var groupIds = [];
var mentionIndex = 0;
var lastHits = [];
var box = document.getElementById("task");
var form = document.getElementById("task-form");
var problem = document.getElementById("problem");
var micNote = document.getElementById("mic-state");
var listenEl = document.getElementById("listen");
var mic = document.getElementById("mic");
var hot = false;
var rec = null;
var listenTimer = null;
var baseText = "";
var LISTEN_MS = 45000;
var notificationAsked = false;

function authed(path) {
  var key = new URLSearchParams(location.search).get("k");
  if (!key) return path;
  return path + "?k=" + encodeURIComponent(key);
}

function personById(id) {
  return roster.people.find(function (person) { return person.id === id; });
}

function parseMentions(text) {
  var ids = [];
  var unknown = [];
  var re = /(^|\\s)@([A-Za-z]+)/g;
  var match;
  while ((match = re.exec(text))) {
    var name = match[2].toLowerCase();
    var person = roster.people.find(function (item) { return item.name.toLowerCase() === name; });
    if (!person) unknown.push(match[2]);
    else if (ids.indexOf(person.id) === -1) ids.push(person.id);
  }
  return { ids: ids, unknown: unknown };
}

function currentIds() {
  var ids = groupIds.slice();
  parseMentions(box.value).ids.forEach(function (id) {
    if (ids.indexOf(id) === -1) ids.push(id);
  });
  return ids;
}

function mentionQuery() {
  var pos = box.selectionStart || 0;
  var head = box.value.slice(0, pos);
  var match = /(?:^|\\s)@([A-Za-z]*)$/.exec(head);
  if (!match) return null;
  return { query: match[1], start: pos - match[1].length - 1 };
}

function renderChips() {
  var host = document.getElementById("chips");
  host.replaceChildren();
  var ids = currentIds();
  ids.forEach(function (id) {
    var person = personById(id);
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = "@" + person.name;
    chip.setAttribute("aria-label", "Remove " + person.name);
    chip.addEventListener("click", function () { removePerson(id); });
    host.append(chip);
  });
  var narrow = window.matchMedia("(max-width: 760px)").matches;
  if (ids.length === 0) box.placeholder = narrow ? "Type @ to duty" : "Message the whole team, or type @ to duty someone";
  else if (ids.length === 1) box.placeholder = "Duty for " + personById(ids[0]).name;
  else box.placeholder = "Duty for this group";
}

function removePerson(id) {
  groupIds = groupIds.filter(function (item) { return item !== id; });
  var person = personById(id);
  var pattern = new RegExp("(^|\\\\s)@" + person.name + "(?=$|\\\\s)", "ig");
  box.value = box.value.replace(pattern, "$1").replace(/[ \\t]{2,}/g, " ").replace(/^ /, "");
  renderChips();
  showMentionMenu();
}

function showMentionMenu() {
  var menu = document.getElementById("mentions");
  var found = mentionQuery();
  menu.replaceChildren();
  lastHits = [];
  if (!found) { menu.hidden = true; return; }
  var query = found.query.toLowerCase();
  var taken = currentIds();
  lastHits = roster.people.filter(function (person) {
    return person.name.toLowerCase().indexOf(query) === 0 && taken.indexOf(person.id) === -1;
  });
  if (!lastHits.length) { menu.hidden = true; mentionIndex = 0; return; }
  if (mentionIndex >= lastHits.length) mentionIndex = 0;
  lastHits.forEach(function (person, index) {
    var option = document.createElement("button");
    option.type = "button";
    option.className = "mention" + (index === mentionIndex ? " is-active" : "");
    option.setAttribute("role", "option");
    option.setAttribute("data-name", person.name);
    option.textContent = person.name + ", " + person.title;
    option.addEventListener("mousedown", function (event) { event.preventDefault(); });
    option.addEventListener("click", function () { choose(person); });
    menu.append(option);
  });
  menu.hidden = false;
}

function choose(person) {
  var found = mentionQuery();
  if (!found) return;
  var pos = box.selectionStart || box.value.length;
  var insert = "@" + person.name + " ";
  box.value = box.value.slice(0, found.start) + insert + box.value.slice(pos);
  var caret = found.start + insert.length;
  box.focus();
  box.setSelectionRange(caret, caret);
  mentionIndex = 0;
  showMentionMenu();
  renderChips();
}

function whenLabel(iso) {
  var date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  var time = date.toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Johannesburg" });
  var today = new Date();
  var day = date.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" });
  var todayKey = today.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" });
  var yesterday = new Date(today.getTime() - 86400000);
  var yesterdayKey = yesterday.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" });
  if (day === todayKey) return "Today " + time;
  if (day === yesterdayKey) return "Yesterday " + time;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "Africa/Johannesburg" }) + " " + time;
}

function threadMeta() {
  if (openKey === "team") {
    return { title: "Whole team", sub: "A message with nobody named is held here for the whole team." };
  }
  var person = personById(openKey);
  if (person) return { title: person.name, sub: person.title };
  var duty = duties.find(function (item) { return item.threadKey === openKey; });
  if (duty) return { title: duty.title, sub: "One thread, shared. The duty is held for each of them." };
  return { title: "Whole team", sub: "A message with nobody named is held here for the whole team." };
}

function renderThreads() {
  var list = document.getElementById("thread-list");
  list.replaceChildren();
  var keys = [{ key: "team", title: "Whole team", snippet: "Nobody named" }];
  var seen = {};
  duties.forEach(function (duty) {
    if (duty.audience !== "group" || seen[duty.threadKey]) return;
    seen[duty.threadKey] = true;
    keys.push({ key: duty.threadKey, title: duty.title, snippet: duty.heldFor });
  });
  keys.forEach(function (item) {
    var li = document.createElement("li");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "thread";
    button.setAttribute("data-thread", item.key);
    if (item.key === openKey) button.setAttribute("aria-current", "true");
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = item.title;
    var snippet = document.createElement("span");
    snippet.className = "snippet";
    snippet.textContent = item.snippet;
    button.append(name, snippet);
    button.addEventListener("click", function () { openThread(item.key); });
    li.append(button);
    list.append(li);
  });
}

function renderPeople() {
  document.querySelectorAll(".people .person").forEach(function (button) {
    if (button.getAttribute("data-thread") === openKey) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
}

function renderLog() {
  var host = document.getElementById("bubbles");
  host.replaceChildren();
  var rows = duties.filter(function (duty) { return duty.threadKey === openKey; });
  document.getElementById("empty").hidden = rows.length > 0;
  rows.forEach(function (duty) {
    var time = document.createElement("p");
    time.className = "when";
    time.textContent = whenLabel(duty.at);
    var mine = document.createElement("div");
    mine.className = "bubble mine";
    var mineCard = document.createElement("div");
    mineCard.className = "card";
    var mineText = document.createElement("p");
    mineText.className = "duty-text";
    mineText.textContent = duty.text;
    mineCard.append(mineText);
    mine.append(mineCard);
    host.append(time, mine);
    var replies = Array.isArray(duty.replies) ? duty.replies : [];
    if (!replies.length) {
      var receipt = document.createElement("div");
      receipt.className = "bubble receipt";
      var card = document.createElement("div");
      card.className = "card";
      var kicker = document.createElement("p");
      kicker.className = "held-for";
      kicker.textContent = duty.heldFor || "";
      var sentence = document.createElement("p");
      sentence.className = "held";
      sentence.textContent = duty.sentence;
      card.append(kicker, sentence);
      receipt.append(card);
      host.append(receipt);
      return;
    }
    replies.forEach(function (reply) { host.append(renderReply(reply)); });
  });
  var log = document.getElementById("log");
  log.scrollTop = log.scrollHeight;
}

function renderReply(reply) {
  var row = document.createElement("div");
  row.className = "bubble reply";
  var person = document.createElement("div");
  person.className = "reply-person person-" + (reply.roleId || "");
  var mark = document.createElement("span");
  mark.className = "mark";
  var source = document.querySelector('.people .person[data-role="' + reply.roleId + '"] .mark');
  if (source) {
    Array.prototype.forEach.call(source.childNodes, function (node) {
      mark.appendChild(node.cloneNode(true));
    });
  }
  var card = document.createElement("div");
  card.className = "card";
  var who = document.createElement("p");
  who.className = "reply-name";
  who.textContent = reply.name || "";
  var text = document.createElement("p");
  text.className = "reply-text";
  text.textContent = reply.text || "";
  card.append(who, text);
  person.append(mark, card);
  row.append(person);
  return row;
}

function firstLine(text) {
  return String(text || "").split("\\n")[0].trim();
}

function renderNotices() {
  var list = document.getElementById("notice-list");
  var empty = document.getElementById("notices-empty");
  list.replaceChildren();
  empty.hidden = duties.length > 0;
  duties.slice().reverse().forEach(function (duty) {
    var li = document.createElement("li");
    var time = document.createElement("time");
    time.dateTime = duty.at || "";
    time.textContent = whenLabel(duty.at);
    var who = document.createElement("span");
    who.className = "notice-who";
    who.textContent = duty.title || "Whole team";
    var line = document.createElement("span");
    line.className = "notice-line";
    line.textContent = firstLine(duty.text);
    li.append(time, who, line);
    list.append(li);
  });
}

function showModel(connected) {
  var line = document.getElementById("model-line");
  line.textContent = connected ? "A model is connected." : "A model is not connected.";
}

function raiseHeld(duty) {
  var who = duty.title || "Whole team";
  if (typeof Notification !== "function") return;
  function send() {
    try { new Notification(who, { body: "It is held." }); }
    catch (error) { /* The notices list still shows the duty. */ }
  }
  if (Notification.permission === "granted") { send(); return; }
  if (Notification.permission !== "default" || notificationAsked) return;
  notificationAsked = true;
  Notification.requestPermission().then(function (result) {
    if (result === "granted") send();
  }).catch(function () {});
}

function render() {
  var meta = threadMeta();
  document.getElementById("thread-title").textContent = meta.title;
  document.getElementById("thread-sub").textContent = meta.sub;
  renderPeople();
  renderThreads();
  renderLog();
  renderNotices();
  renderChips();
}

function openThread(key) {
  openKey = key;
  render();
}

function showMentionMenuFromInput() {
  mentionIndex = 0;
  showMentionMenu();
  renderChips();
}

function setHot(on) {
  hot = on;
  mic.classList.toggle("is-hot", on);
  mic.setAttribute("aria-pressed", on ? "true" : "false");
  mic.setAttribute("aria-label", on ? "Stop listening" : "Listen");
  listenEl.hidden = !on;
}

function stopListen() {
  setHot(false);
  if (listenTimer) { clearTimeout(listenTimer); listenTimer = null; }
  if (rec) {
    var current = rec;
    rec = null;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try { current.stop(); } catch (error) { /* already stopped */ }
  }
}

function wordsMustBeTyped(sentence) {
  stopListen();
  micNote.textContent = sentence || "The words have to be typed.";
}

mic.addEventListener("click", function () {
  if (hot) { stopListen(); return; }
  var Recogniser = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recogniser) {
    wordsMustBeTyped("This browser has no speech recognition. The words have to be typed.");
    return;
  }
  micNote.textContent = "";
  try { rec = new Recogniser(); }
  catch (error) {
    wordsMustBeTyped("This browser has no speech recognition. The words have to be typed.");
    return;
  }
  rec.lang = "en-ZA";
  rec.continuous = true;
  rec.interimResults = true;
  baseText = box.value;
  rec.onresult = function (event) {
    if (!hot) return;
    var said = "";
    for (var i = 0; i < event.results.length; i += 1) said += event.results[i][0].transcript;
    var gap = baseText && !/\\s$/.test(baseText) ? " " : "";
    box.value = (baseText + gap + said).slice(0, 2000);
    renderChips();
  };
  rec.onerror = function () { wordsMustBeTyped("The words have to be typed."); };
  rec.onend = function () { if (hot) stopListen(); };
  try { rec.start(); }
  catch (error) {
    wordsMustBeTyped("The words have to be typed.");
    return;
  }
  setHot(true);
  listenTimer = setTimeout(function () {
    stopListen();
    micNote.textContent = "Listening stopped after 45 seconds. The words are in the box for you to send.";
  }, LISTEN_MS);
});

document.querySelectorAll(".people .person").forEach(function (button) {
  button.addEventListener("click", function () {
    openThread(button.getAttribute("data-thread"));
  });
});

document.getElementById("find").addEventListener("input", function (event) {
  var query = event.currentTarget.value.trim().toLowerCase();
  document.querySelectorAll(".people .person").forEach(function (button) {
    var hay = (button.getAttribute("data-name") + " " + button.getAttribute("data-title")).toLowerCase();
    button.parentElement.hidden = query !== "" && hay.indexOf(query) === -1;
  });
});

box.addEventListener("input", showMentionMenuFromInput);
box.addEventListener("click", showMentionMenu);
box.addEventListener("keyup", function (event) {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") showMentionMenu();
});
box.addEventListener("keydown", function (event) {
  if (!document.getElementById("mentions").hidden) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      mentionIndex = (mentionIndex + 1) % lastHits.length;
      showMentionMenu();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      mentionIndex = (mentionIndex - 1 + lastHits.length) % lastHits.length;
      showMentionMenu();
      return;
    }
    if (event.key === "Enter" && lastHits[mentionIndex]) {
      event.preventDefault();
      choose(lastHits[mentionIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      document.getElementById("mentions").hidden = true;
      return;
    }
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

var dialog = document.getElementById("group-dialog");
var picks = document.getElementById("group-picks");
roster.people.forEach(function (person) {
  var label = document.createElement("label");
  label.className = "pick";
  var input = document.createElement("input");
  input.type = "checkbox";
  input.value = person.id;
  var text = document.createElement("span");
  text.textContent = person.name + ", " + person.title;
  label.append(input, text);
  picks.append(label);
});
document.getElementById("group").addEventListener("click", function () {
  picks.querySelectorAll("input").forEach(function (input) {
    input.checked = groupIds.indexOf(input.value) !== -1;
  });
  document.getElementById("group-problem").textContent = "";
  dialog.showModal();
});
document.getElementById("group-cancel").addEventListener("click", function () { dialog.close(); });
document.getElementById("group-form").addEventListener("submit", function (event) {
  event.preventDefault();
  var checked = Array.prototype.map.call(picks.querySelectorAll("input:checked"), function (input) { return input.value; });
  if (checked.length < 2) {
    document.getElementById("group-problem").textContent = "A group needs two or more people.";
    return;
  }
  groupIds = checked;
  dialog.close();
  renderChips();
  box.focus();
});

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  var text = box.value.trim();
  var button = form.querySelector("button[type='submit']");
  problem.textContent = "";
  if (!text) {
    problem.textContent = "Write the duty before you send it.";
    return;
  }
  var parsed = parseMentions(text);
  if (parsed.unknown.length) {
    problem.textContent = "@" + parsed.unknown[0] + " is not on this team.";
    return;
  }
  var ids = [];
  groupIds.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
  parsed.ids.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
  button.disabled = true;
  stopListen();
  try {
    var response = await fetch(authed("/tasks"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleIds: ids, text: text }),
    });
    var body = await response.json();
    if (!response.ok) {
      problem.textContent = body.error || "The duty was not recorded.";
      return;
    }
    duties.push(body);
    raiseHeld(body);
    box.value = "";
    groupIds = [];
    openThread(body.threadKey);
  } catch (error) {
    problem.textContent = "Run node board.mjs in this folder, then open the address it prints. This file cannot store a duty by itself.";
  } finally {
    button.disabled = false;
  }
});

async function loadBoard() {
  try {
    var response = await fetch(authed("/board"));
    if (!response.ok) return;
    var board = await response.json();
    duties = board.tasks || [];
    showModel(board.modelConnected === true);
    render();
  } catch (error) {
    // Opened as a file, or the board is not running. The empty line stays.
  }
}
render();
loadBoard();
`;

export function renderStatusHtml(roles, status) {
  const problems = statusProblems(roles, status);
  if (problems.length) throw new Error(problems.join("\n"));
  const byId = new Map(status.people.map((person) => [person.id, person]));
  const notice = status.notice;
  const lead = "The host team is not installed.";
  const rest = notice.startsWith(lead) ? notice.slice(lead.length).trim() : notice;
  const rosterJson = JSON.stringify({
    people: roles.roles.map((role) => ({ id: role.id, name: role.name, title: role.title })),
  }).replaceAll("<", "\\u003c");
  const people = roles.roles.map((role) => {
    const person = byId.get(role.id);
    return `        <li>
          <button type="button" class="person person-${escapeHtml(role.id)}" data-role="${escapeHtml(role.id)}" data-thread="${escapeHtml(role.id)}" data-name="${escapeHtml(role.name)}" data-title="${escapeHtml(role.title)}" title="${escapeHtml(person.sentence)}">
            <span class="mark">${iconFor(role.id)}</span>
            <span class="who">
              <span class="name">${escapeHtml(role.name)}</span>
              <span class="snippet">${escapeHtml(shortenStatus(person.sentence))}</span>
              <span class="visually-hidden">${escapeHtml(person.word)}</span>
            </span>
          </button>
        </li>`;
  }).join("\n");
  return `<!doctype html>
<!--
  Drawn by render-status.mjs from roles.json and status.json. Do not edit the names or the
  sentences here: the check fails when this file drifts. The page asks only the local board.
  The host team is not installed, and this page must not say otherwise.
-->
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#0e1013">
<title>${escapeHtml(status.heading)}</title>
<style>
${typeFaces()}
  /* A dark chat for the founder. Colour marks a person. It is not a live light, and nothing pulses. */
  :root {
    --bg:#0e1013; --rail:#12151a; --text:#f2f4f7; --muted:#9aa3b2; --line:rgba(255,255,255,.08);
    --bubble:#1c212b; --mine:#24382f; --composer:#1a1f27; --warn:#e7c98a; --hot:#f3d48a;
  }
  * { box-sizing:border-box; }
  html, body { height:100%; }
  html { color-scheme:dark; }
  body {
    margin:0; color:var(--text); background:var(--bg);
    font:16px/1.45 Figtree,ui-sans-serif,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; overflow:hidden;
  }
  button, input, textarea { font:inherit; color:inherit; }
  button { cursor:pointer; }
  :focus-visible { outline:3px solid var(--hot); outline-offset:2px; }
  .visually-hidden {
    position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
    clip:rect(0,0,0,0); white-space:nowrap; border:0;
  }
  .app {
    display:grid; grid-template-columns:308px minmax(0,1fr); height:100dvh; min-height:0;
  }
  .rail {
    display:flex; flex-direction:column; min-height:0; background:var(--rail);
    border-right:1px solid var(--line);
  }
  .rail-head { display:flex; gap:12px; align-items:center; padding:16px 16px 8px; }
  .brand-mark {
    display:grid; place-items:center; width:40px; height:40px; flex:none; border-radius:12px;
    background:#2a241c; color:var(--hot);
  }
  .brand-mark svg, .mark svg, .icon-button svg { width:22px; height:22px; display:block; }
  .brand { margin:0; font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:18px; font-weight:650; letter-spacing:-.02em; }
  .brand-sub { margin:1px 0 0; color:var(--muted); font-size:12px; }
  .find { display:block; padding:8px 12px 4px; }
  .find input {
    width:100%; min-height:40px; padding:8px 12px; border:1px solid var(--line); border-radius:999px;
    background:#0e1013; color:var(--text);
  }
  .rail-scroll { overflow:auto; min-height:0; padding:4px 8px 16px; }
  .rail-label {
    margin:12px 8px 4px; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.08em;
    text-transform:uppercase;
  }
  .people, .threads { list-style:none; margin:0; padding:0; display:grid; gap:2px; }
  .person, .thread {
    display:flex; gap:10px; align-items:center; width:100%; min-height:48px; padding:7px 8px;
    border:0; border-radius:12px; background:transparent; text-align:left;
  }
  .thread { flex-direction:column; align-items:flex-start; gap:1px; }
  .person:hover, .thread:hover, .person[aria-current="true"], .thread[aria-current="true"] {
    background:rgba(255,255,255,.06);
  }
  .mark {
    display:grid; place-items:center; width:36px; height:36px; flex:none; border-radius:11px; color:#f7f8fa;
  }
  .person-pm .mark { background:#148f77; }
  .person-architect .mark { background:#3c5f8a; }
  .person-designer .mark { background:#c56b86; }
  .person-engineer .mark { background:#d08a3e; }
  .person-engineer-2 .mark { background:#7a6bb5; }
  .person-qa .mark { background:#3e86b0; }
  .who { min-width:0; display:grid; }
  .name {
    font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:15px; font-weight:650;
    letter-spacing:-.01em; line-height:1.2;
  }
  .snippet {
    color:var(--muted); font-size:12.5px; line-height:1.3; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis;
  }
  .conversation {
    display:grid; grid-template-rows:auto minmax(0,1fr) auto; min-width:0; min-height:0;
    background:
      radial-gradient(880px 420px at 100% -10%, rgba(60,95,138,.22), transparent 60%),
      var(--bg);
  }
  .conv-head { padding:16px 28px 8px; }
  .notice-lead { margin:0; color:var(--warn); font-size:14px; font-weight:700; }
  .model-line { margin:6px 0 0; color:var(--warn); font-size:14px; font-weight:700; }
  .notice-rest { margin:6px 0 0; max-width:42rem; color:var(--muted); font-size:13px; line-height:1.45; }
  .notices { margin-top:12px; max-height:28vh; overflow:auto; }
  .notices h2 {
    margin:0; color:var(--muted); font-family:Outfit,ui-sans-serif,system-ui,sans-serif;
    font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  }
  .notices ul { list-style:none; margin:8px 0 0; padding:0; display:grid; gap:6px; }
  .notices li {
    display:grid; gap:2px; padding:8px 10px; border-radius:12px; background:rgba(255,255,255,.04);
  }
  .notices time, .notice-line { color:var(--muted); font-size:13px; }
  .notice-who { font-weight:700; }
  #notices-empty { margin:6px 0 0; color:var(--muted); font-size:13px; }
  #notices-empty[hidden] { display:none; }
  h1 {
    margin:12px 0 0; font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:28px;
    font-weight:650; letter-spacing:-.03em; line-height:1.1;
  }
  .thread-sub { margin:4px 0 0; color:var(--muted); font-size:14px; }
  .log { overflow:auto; padding:8px 28px 12px; }
  #empty { margin:18px 0; color:var(--muted); }
  #empty[hidden] { display:none; }
  .when { margin:16px 0 6px; color:var(--muted); font-size:12px; text-align:center; }
  .bubble { display:flex; margin:6px 0; }
  .bubble.mine { justify-content:flex-end; }
  .card {
    max-width:min(36rem, 82%); padding:10px 14px; border-radius:16px; background:var(--bubble);
  }
  .mine .card { background:var(--mine); border-bottom-right-radius:5px; }
  .receipt .card { border-bottom-left-radius:5px; }
  .bubble.reply { justify-content:flex-start; }
  .reply-person { display:flex; gap:8px; align-items:flex-end; max-width:min(40rem, 100%); }
  .reply-person .card { border-bottom-left-radius:5px; max-width:min(34rem, 100%); }
  .reply-name {
    margin:0 0 4px; font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:13px; font-weight:700;
  }
  .reply-text { margin:0; white-space:pre-wrap; }
  .duty-text, .held, .held-for { margin:0; }
  .duty-text { white-space:pre-wrap; }
  .held-for { margin-bottom:4px; color:var(--warn); font-size:13px; font-weight:700; }
  .held { color:#d5dbe6; font-size:15px; line-height:1.45; }
  .composer { padding:0 16px 14px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; min-height:0; padding:0 8px 8px; }
  .chips:empty { display:none; }
  .chip {
    min-height:32px; padding:0 10px; border:1px solid rgba(243,212,138,.45); border-radius:999px;
    background:rgba(243,212,138,.1); color:var(--hot);
  }
  .mentions {
    display:grid; gap:2px; margin:0 8px 8px; padding:6px; border:1px solid var(--line); border-radius:14px;
    background:#161b22;
  }
  .mentions[hidden] { display:none; }
  .mention {
    min-height:40px; padding:8px 10px; border:0; border-radius:10px; background:transparent; text-align:left;
  }
  .mention.is-active, .mention:hover { background:rgba(255,255,255,.06); }
  .composer-row {
    display:flex; gap:8px; align-items:flex-end; padding:8px; border:1px solid var(--line);
    border-radius:28px; background:var(--composer);
  }
  .composer-row textarea {
    flex:1; min-width:0; max-height:140px; min-height:44px; padding:10px 8px; border:0; resize:none;
    background:transparent; line-height:1.4;
  }
  .icon-button {
    display:grid; place-items:center; width:44px; height:44px; flex:none; border:0; border-radius:999px;
    background:transparent; color:var(--text);
  }
  .icon-button.primary { background:#f2f4f7; color:#12151a; }
  #mic.is-hot { background:var(--hot); color:#1a1408; box-shadow:0 0 0 4px rgba(243,212,138,.28); }
  .composer-meta { padding:8px 12px 0; display:grid; gap:4px; }
  .disclosure, #mic-state, #problem { margin:0; color:var(--muted); font-size:12.5px; line-height:1.4; }
  #mic-state:empty, #problem:empty { display:none; }
  #problem:not(:empty) { color:#f0b4a8; }
  .listen { display:flex; align-items:center; gap:8px; margin:0; color:var(--hot); font-size:13px; font-weight:700; }
  .listen[hidden] { display:none; }
  .listen-mark { width:10px; height:10px; border-radius:2px; background:var(--hot); box-shadow:0 0 0 4px rgba(243,212,138,.25); }
  dialog {
    width:min(28rem, calc(100vw - 32px)); padding:0; border:1px solid var(--line); border-radius:16px;
    background:#161b22; color:var(--text);
  }
  dialog::backdrop { background:rgba(0,0,0,.55); }
  .dialog-body { padding:18px 18px 8px; }
  dialog h2 { margin:0; font-family:Outfit,ui-sans-serif,system-ui,sans-serif; font-size:22px; font-weight:650; }
  dialog p { margin:8px 0 0; color:var(--muted); font-size:14px; }
  .pick { display:flex; gap:10px; align-items:center; min-height:44px; margin-top:8px; }
  .pick input { width:18px; height:18px; }
  #group-problem:empty { display:none; }
  #group-problem:not(:empty) { color:#f0b4a8; }
  .dialog-actions { display:flex; justify-content:flex-end; gap:8px; padding:8px 18px 18px; }
  .dialog-actions button {
    min-height:44px; padding:0 14px; border-radius:10px; border:1px solid var(--line); background:transparent;
  }
  #group-ok { background:#f2f4f7; color:#12151a; border-color:transparent; font-weight:700; }
  @media (max-width:760px) {
    body { overflow:hidden; }
    .app { grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); height:100dvh; overflow:hidden; }
    .rail { border-right:0; border-bottom:1px solid var(--line); }
    .rail-head { padding:10px 12px 4px; }
    .rail-scroll { overflow:visible; padding-bottom:8px; }
    .person, .thread { min-height:44px; padding:4px 8px; }
    .mark { width:32px; height:32px; border-radius:10px; }
    .rail-label { margin-top:8px; }
    .conv-head, .log { padding-left:12px; padding-right:12px; }
    .conv-head { padding-top:8px; padding-bottom:4px; }
    h1 { font-size:22px; margin-top:6px; }
    .notice-rest { display:none; }
    .model-line, .notices { display:block; }
    .log { min-height:88px; }
    .composer { padding:0 8px 8px; }
    .composer-row textarea { min-height:40px; padding-top:8px; padding-bottom:8px; }
    .card { max-width:92%; }
  }
  @media (prefers-reduced-motion:reduce) {
    *, *::before, *::after { animation:none !important; transition:none !important; }
  }
</style>
</head>
<body>
<div class="app">
  <aside class="rail" aria-label="People">
    <header class="rail-head">
      <span class="brand-mark">${BRAND_ICON}</span>
      <div>
        <p class="brand">${escapeHtml(status.heading)}</p>
        <p class="brand-sub">Not installed</p>
      </div>
    </header>
    <label class="find">
      <span class="visually-hidden">Find a person</span>
      <input id="find" type="search" placeholder="Find a person" autocomplete="off">
    </label>
    <div class="rail-scroll">
      <p class="rail-label">People</p>
      <ul class="people">
${people}
      </ul>
      <p class="rail-label">Threads</p>
      <ul class="threads" id="thread-list"></ul>
    </div>
  </aside>
  <section class="conversation" aria-label="Conversation">
    <header class="conv-head">
      <p class="notice-lead">${escapeHtml(lead)}</p>
      <p class="model-line" id="model-line">A model is not connected.</p>
      <p class="notice-rest">${escapeHtml(rest)}</p>
      <section class="notices" aria-label="Notices">
        <h2>Notices</h2>
        <p id="notices-empty">No notices yet.</p>
        <ul id="notice-list"></ul>
      </section>
      <p class="visually-hidden">${escapeHtml(notice)}</p>
      <h1 id="thread-title">Whole team</h1>
      <p class="thread-sub" id="thread-sub">A message with nobody named is held here for the whole team.</p>
    </header>
    <div class="log" id="log">
      <p id="empty">No duties yet.</p>
      <div id="bubbles"></div>
    </div>
    <form id="task-form" class="composer">
      <div id="mentions" class="mentions" role="listbox" aria-label="People" hidden></div>
      <div id="chips" class="chips"></div>
      <div class="composer-row">
        <button type="button" class="icon-button" id="group" aria-label="Group">${PLUS_ICON}</button>
        <label class="visually-hidden" for="task">Duty</label>
        <textarea id="task" name="text" rows="1" maxlength="2000" autocomplete="off" placeholder="Message the whole team, or type @ to duty someone"></textarea>
        <button type="button" class="icon-button" id="mic" aria-pressed="false" aria-label="Listen">${MIC_ICON}</button>
        <button type="submit" class="icon-button primary" aria-label="Send duty">${SEND_ICON}</button>
      </div>
      <div class="composer-meta">
        <p class="disclosure">The browser may hand the words to its maker.</p>
        <p class="listen" id="listen" hidden><span class="listen-mark" aria-hidden="true"></span>Listening</p>
        <p id="mic-state" role="status"></p>
        <p id="problem" role="status"></p>
      </div>
    </form>
  </section>
</div>
<dialog id="group-dialog" aria-labelledby="group-heading">
  <form id="group-form">
    <div class="dialog-body">
      <h2 id="group-heading">Group</h2>
      <p>Choose two or more. One thread is held for each of them.</p>
      <div id="group-picks"></div>
      <p id="group-problem" role="status"></p>
    </div>
    <div class="dialog-actions">
      <button type="button" id="group-cancel">Cancel</button>
      <button type="submit" id="group-ok">Use this group</button>
    </div>
  </form>
</dialog>
<script type="application/json" id="roster">${rosterJson}</script>
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
