/* Deliberately standalone: this review kit never calls a service or enters a production bundle. */
const {
  tokens,
  portal,
  overview,
  visits,
  services,
  vitalTypes,
  measures,
  observationsNote,
  explainEntries,
  provenance,
  readingSets,
  readingSetsNote,
  fiction,
} = window.KIT;
let motionEnabled = !matchMedia("(prefers-reduced-motion: reduce)").matches;
function syncMotion() {
  document.documentElement.dataset.motion = motionEnabled ? "on" : "off";
  const b = document.getElementById("motion-toggle");
  b.textContent = motionEnabled ? "Motion on" : "Motion off";
  b.setAttribute("aria-pressed", String(motionEnabled));
}
syncMotion();
document.getElementById("motion-toggle").addEventListener("click", () => {
  motionEnabled = !motionEnabled;
  syncMotion();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  (e) => {
    if (e.matches) {
      motionEnabled = false;
      syncMotion();
    }
  },
);
for (const [name, value] of Object.entries(tokens.typography.scale))
  document.documentElement.style.setProperty(`--type-${name}`, `${value}px`);
const asset = "../../../apps/web/public/";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const logo = `<img class="logo" src="${asset}brand/mythuso-wordmark.svg" alt="MyThuso">`;
const chip = (s, c = "") => `<span class="chip ${c}">${s}</span>`;
const button = (s, action, kind = "") =>
  `<button class="button ${kind}" data-action="${action}">${s}<span aria-hidden="true">↗</span></button>`;
const notice = `<div class="notice"><strong>Design concept · Simulated experience.</strong> No care is booked, no payment is taken and no clinical decision is made.</div>`;
const head = (eye, title, sub, extra = "") =>
  `<header class="page-head"><div><span class="eyebrow">${eye}</span><h1>${title}</h1><p>${sub}</p></div>${extra}</header>`;
const row = (icon, title, desc, status = "") =>
  `<div class="row"><span class="line-icon" aria-hidden="true">${icon}</span><div class="row-copy"><h3>${title}</h3><p>${desc}</p></div>${status}</div>`;
const footer = `<footer class="site-footer"><span>MyThuso · Help. Health. Home.</span><span>Review prototype · No service connection</span></footer>`;
const icons = [
  "◫",
  "◎",
  "◇",
  "▥",
  "◷",
  "▧",
  "G₁",
  "☷",
  "▤",
  "◈",
  "▱",
  "♡",
  "▦",
  "↗",
];
function sidebar(kind) {
  const isTower = ["tower", "dispatch"].includes(kind);
  return `<aside class="sidebar">${logo}<div class="workspace"><strong>${isTower ? "Control Tower" : "Your everyday care"}</strong><small>${isTower ? "Workspace design · No authenticated role" : "A little support. A familiar place."}</small></div><nav aria-label="${isTower ? "Control Tower categories" : "Patient navigation"}">${
    isTower
      ? portal.categories
          .map(
            (c, i) =>
              `<button data-category="${esc(c.id)}" class="${(kind === "tower" && i === 0) || (kind === "dispatch" && i === 1) ? "selected" : ""}"><span class="nav-icon" aria-hidden="true">${icons[i]}</span>${esc(c.label)}</button>`,
          )
          .join("")
      : [
          ["patient", "◫", "Overview"],
          ["care", "♡", "Explore care"],
          ["visits", "◷", "My visits"],
          ["passport", "▤", "Health Passport"],
          ["wellbeing", "✳", "Live well"],
          ["family", "♧", "My family"],
          ["gilbert", "G₁", "GilbertOne"],
        ]
          .map(
            ([id, ic, label]) =>
              `<button data-action="${id}" class="${id === kind ? "selected" : ""}"><span class="nav-icon" aria-hidden="true">${ic}</span>${label}</button>`,
          )
          .join("")
  }</nav><div class="side-footer"><strong>${isTower ? "Clarity at every level." : "Here to help you understand."}</strong><p>${isTower ? "A service state always includes its reason. Preview access grants no permissions." : "GilbertOne can explain MyThuso. It is not a person, and not a doctor."}</p></div></aside>`;
}
function shell(kind, content) {
  return `<div class="shell">${sidebar(kind)}<main id="main" tabindex="-1"><div class="topline"><span>${["tower", "dispatch"].includes(kind) ? "Workspace / Control Tower" : "MyThuso / Your care"}</span><div class="top-actions"><span class="pill">South Africa · English</span><span class="avatar" aria-label="Design preview">M</span></div></div>${notice}${["tower", "dispatch"].includes(kind) ? `<label class="mobile-category" for="category-select">Workspace category<select id="category-select">${portal.categories.map((c) => `<option value="${c.id}" ${(kind === "tower" && c.id === "overview") || (kind === "dispatch" && c.id === "dispatch") ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>` : ""}<div class="screen">${content}</div>${footer}</main></div>`;
}
function chart() {
  const values = visits.visits.map((x) => x.count),
    max = Math.max(...values);
  const points = values.map((v, i) => [20 + i * 86, 180 - (v / max) * 150]);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return `<svg class="chart" viewBox="0 0 556 205" role="img" aria-label="Illustrative visits by day; exact values in the expandable table below"><defs><linearGradient id="chart-fill" x2="0" y2="1"><stop stop-color="var(--brand-mint)"/><stop offset="1" stop-color="var(--surface)"/></linearGradient></defs><path d="${path} L536 190 L20 190 Z" fill="url(#chart-fill)"/><path d="M20 190H536 M20 110H536 M20 30H536" stroke="var(--stone)" stroke-dasharray="3 6"/><path class="chart-trace" pathLength="1" d="${path}" stroke="var(--teal-ink)" stroke-width="3" fill="none"/>${points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5" fill="var(--teal-ink)"><title>${visits.visits[i].date}: ${values[i]} illustrative visits</title></circle>`).join("")}</svg><div class="axis">${visits.visits.map((v) => `<span>${new Date(v.date + "T12:00:00Z").toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" })}</span>`).join("")}</div><details><summary>View chart values and source ↗</summary><p class="small">${esc(visits._demoWhy)}</p><table><thead><tr><th scope="col">Date</th><th scope="col">Illustrative visits</th></tr></thead><tbody>${visits.visits.map((v) => `<tr><td>${v.date}</td><td>${v.count}</td></tr>`).join("")}</tbody></table></details>`;
}
function weekDistribution() {
  const total = visits.visits.reduce((a, v) => a + v.count, 0);
  const weekend = visits.visits
    .filter((v) => [0, 6].includes(new Date(v.date + "T12:00:00Z").getUTCDay()))
    .reduce((a, v) => a + v.count, 0);
  const weekday = total - weekend;
  const share = total ? (weekday / total) * 100 : 0;
  return `<section class="n-distribution"><div class="n-distribution-title"><span class="eyebrow">SAMPLE VISIT MIX</span><h2>A balanced view.</h2><p>How the sample week is shared.</p></div><div class="n-ring" role="img" aria-label="Sample visits: ${weekday} weekdays, ${weekend} weekend, ${total} total"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-base" cx="60" cy="60" r="48"/><circle class="ring-value" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${share} 100"/></svg><div><strong>${total}</strong><span>sample visits</span></div></div><div class="n-ring-legend"><div><i></i><span>Weekdays<small>${share.toFixed(1)}% of sample visits</small></span><strong>${weekday}</strong></div><div><i></i><span>Weekend<small>${(100 - share).toFixed(1)}% of sample visits</small></span><strong>${weekend}</strong></div><p>Distribution, not a care or recovery score.</p></div></section>`;
}
function tower() {
  return shell(
    "tower",
    head(
      "THE BIG PICTURE",
      "A clearer view of care.",
      "Start with what needs attention. See the detail when you need it.",
      chip("Overview · Concept"),
    ) +
      `<div class="grid metrics"><section class="card ink"><div class="card-top"><span>Visits in the sample week</span>${chip("Illustrative data")}</div><div class="number">${visits.visits.reduce((a, v) => a + v.count, 0)} <small>visits</small></div><p class="small">${visits.period.from} → ${visits.period.to}</p><div class="metric-decoration" aria-hidden="true">${visits.visits.map((v) => `<i style="height:${(v.count / Math.max(...visits.visits.map((x) => x.count))) * 36}px"></i>`).join("")}</div></section><section class="card mint"><div class="card-top"><span>One place to focus</span><span aria-hidden="true">↗</span></div><h2>People first.<br>Queues second.</h2><p class="small" style="margin:var(--space-16) 0">Review the dispatch layout and its clear next actions.</p>${button("Open dispatch", "dispatch", "light")}</section><section class="card"><div class="card-top"><span>Service truth</span>${chip("Not checked", "amber")}</div><h2>Know what<br>is connected.</h2><p class="small" style="margin-top:var(--space-16)">This kit does not query live health. An unknown state is never a green light.</p></section></div><div class="grid columns"><div class="stack"><section class="card"><div class="card-top"><div><h2>The rhythm of the week</h2><p class="small">Illustrative visits · Fixed sample period</p></div><a class="pill" href="#activity">Weekly review ↗</a></div>${chart()}</section><section class="card"><div class="card-top"><h2>Where to focus next</h2>${chip("Design walkthrough")}</div>${row("◎", "Dispatch & Incidents", "Visit context, queue and next action in one place.", button("Review", "dispatch", "light"))}${row("G₁", "GilbertOne API Administration", "Separate engine, explicit gates, clear availability.", button("Inspect", "engine", "light"))}</section></div><div class="stack">${weekDistribution()}<section class="card lilac assistant-invite"><img class="gilbert-mini" src="${asset}brand/gilbert-hero.webp" alt="GilbertOne"><span class="eyebrow">MEET GILBERTONE</span><h2 style="margin:var(--space-16) 0">Less searching.<br>More understanding.</h2><p>Keep important changes together, each with a source and a next step.</p><div class="step"><b>1</b><div><h3>Read the state</h3><p>Unknown, unavailable and gated are distinct.</p></div></div><div class="step"><b>2</b><div><h3>Understand the reason</h3><p>A blocked action explains what must happen next.</p></div></div>${button("Meet GilbertOne", "gilbert", "light")}</section><section class="card"><h2>Access, explained</h2><p style="margin-top:var(--space-12)">This is a design preview. Navigation is not authentication.</p><details><summary>Read the access boundary</summary><p class="small">${esc(portal.previewPicker.sentence)}</p></details></section></div></div>`,
  );
}
function careIcon(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 5h3m4 0h3"/>',
    passport:
      '<rect x="5" y="3" width="15" height="18" rx="3"/><path d="M5 7H2m3 5H2m3 5H2m8-9h5m-5 4h5m-5 4h3"/>',
    family:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m2 11v-3a6 6 0 0 0-2-4"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    spark:
      '<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01"/>',
    shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-4 10 3 3 5-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
}
function patient() {
  return `<div class="p-shell"><aside class="p-sidebar">${logo}<span class="eyebrow">YOUR EVERYDAY CARE</span><nav aria-label="MyThuso workspace"><a href="#patient" aria-current="page">${careIcon("home")}Home</a><button data-action="care">${careIcon("heart")}Explore care</button><button data-action="visits">${careIcon("calendar")}My visits</button><button data-action="passport">${careIcon("passport")}Health Passport</button><button data-action="family">${careIcon("family")}My family</button><a href="#gilbert"><img src="${asset}brand/gilbert-icon.webp" alt="">GilbertOne</a></nav><div class="p-sidebar-note">${careIcon("shield")}<strong>Care starts with trust.</strong><p>Clear choices.<br>A little more peace of mind.</p></div><button class="p-help" data-action="journey">${careIcon("help")}How MyThuso works</button></aside><main class="p-main" id="main" tabindex="-1"><header class="p-header"><div><p>Your day, a little lighter.</p><h1>Hello, how are you?</h1></div><button class="p-account" data-action="family" aria-label="Explore family care">${careIcon("family")}</button></header><div class="p-disclosure"><span class="p-preview-dot" aria-hidden="true"></span><span>Design preview · No booking or payment is connected.</span></div><div class="p-grid"><section class="p-care-hero"><div class="p-hero-copy"><span class="p-kicker">HELP. HEALTH. HOME.</span><h2>Good care.<br>Closer to <em>you.</em></h2><p>Support for you.<br>And the people you love.</p><button class="p-primary-button" data-action="care">Find your care ${careIcon("arrow")}</button></div><div class="p-hero-art"><div class="p-halo" aria-hidden="true"></div><div class="p-banner-light" aria-hidden="true"></div><svg class="p-banner-lines" viewBox="0 0 400 400" fill="none" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<path d="M${80 + i * 19} -20 Q ${130 + i * 12} 160 ${390 + i * 10} 280"/>`).join("")}</svg><img src="assets/family-panorama-v1.png" alt="AI-generated mother and child sharing a moment"><span class="p-image-note">AI-generated illustration</span></div></section><div class="p-primary"><section class="p-shortcuts" aria-label="Your care shortcuts">${[
    ["calendar", "visits", "My visits", "Your next step"],
    ["passport", "passport", "Passport", "Your health record"],
    ["family", "family", "Family", "Care, together"],
  ]
    .map(
      ([icon, id, title, sub]) =>
        `<button data-action="${id}"><span class="p-shortcut-icon">${careIcon(icon)}</span><strong>${title}</strong><span>${sub}</span></button>`,
    )
    .join(
      "",
    )}</section><section class="p-companion"><div class="p-companion-picture"><img src="${asset}brand/gilbert-icon.webp" alt="GilbertOne"></div><div><span class="p-kicker">MEET GILBERTONE</span><h2>A question on your mind?</h2><p>Let’s make the next step clearer.</p></div><a href="#gilbert" aria-label="Ask GilbertOne">${careIcon("arrow")}</a></section><section class="p-discover"><header><div><span class="p-kicker">AT YOUR OWN PACE</span><h2>A little space for you.</h2></div>${careIcon("sun")}</header><div class="p-wellbeing"><div><h3>What would help today?</h3><p>Choose a starting point for this preview.</p></div><div class="p-choice-group" aria-label="Choose your starting point"><button data-care-choice="understand" aria-pressed="true">Understand my care</button><button data-care-choice="family" aria-pressed="false">Support my family</button></div><div id="care-choice-copy" class="p-choice-copy" role="status">Get familiar with how a nurse-led visit would work.</div><button class="p-text-button" id="care-choice-action" data-action="journey">Explore the care journey ${careIcon("arrow")}</button></div></section><section class="p-journey"><div class="p-section-heading"><h2>Care, made simple.</h2>${careIcon("spark")}</div><ol><li><span>01</span><div><strong>Find your care</strong><p>Understand the options.</p></div></li><li><span>02</span><div><strong>A nurse comes to you</strong><p>Support in a familiar place.</p></div></li><li><span>03</span><div><strong>A doctor reviews</strong><p>The clinician makes the decision.</p></div></li></ol><button class="p-text-button" data-action="journey">See how it works ${careIcon("arrow")}</button><p class="p-journey-note">An illustrative journey. Care delivery is not connected.</p></section></div><aside class="p-secondary" aria-label="Your next steps"><section class="p-visit"><div class="p-section-heading"><h2>Your next visit</h2><span class="p-tiny-icon">${careIcon("calendar")}</span></div><div class="p-visit-empty"><div class="p-calendar-art" aria-hidden="true">${careIcon("calendar")}<span>＋</span></div><h3>A fresh start.</h3><p>No visit booked yet. <br>We’ll keep your next step here.</p></div><button class="p-outline-button" data-action="care">Explore care options ${careIcon("arrow")}</button></section><div class="p-fresh-links" aria-label="Fresh start options">${[
    ["heart", "care", "Explore care", "Find your starting point"],
    ["passport", "passport", "Health Passport", "Understand your record"],
    ["family", "family", "Family support", "For the people you love"],
  ]
    .map(
      ([icon, id, title, desc]) =>
        `<button data-action="${id}"><span>${careIcon(icon)}</span><span><strong>${title}</strong><small>${desc}</small></span>${careIcon("arrow")}</button>`,
    )
    .join(
      "",
    )}</div><div class="p-safety-note">${careIcon("shield")}<p>Your choices matter.<br><strong>Your care stays human.</strong></p></div></aside></div><footer class="p-footer"><span>MyThuso · Help. Health. Home.</span><button data-action="journey">About this preview ${careIcon("arrow")}</button></footer><nav class="p-bottom-nav" aria-label="MyThuso phone navigation"><a href="#patient" aria-current="page">${careIcon("home")}<span>Home</span></a><button data-action="care">${careIcon("heart")}<span>Care</span></button><a href="#gilbert"><img src="${asset}brand/gilbert-icon.webp" alt=""><span>GilbertOne</span></a><button data-action="family">${careIcon("family")}<span>Family</span></button></nav></main></div>`;
}

function gilbert() {
  return `<div class="g-workspace"><aside class="g-rail">${logo}<div class="g-product"><span class="g-monogram">G<span>1</span></span><div><strong>GilbertOne</strong><small>Your MyThuso guide</small></div></div><button class="button g-new" data-action="new-conversation">＋ New conversation</button><nav aria-label="GilbertOne workspace"><a href="#gilbert" aria-current="page"><span aria-hidden="true">◌</span> Conversation</a><a href="#patient"><span aria-hidden="true">♡</span> Explore MyThuso</a><button data-action="passport"><span aria-hidden="true">▤</span> Health Passport</button></nav><div class="g-history"><span class="eyebrow">A FRESH START</span><p>Your conversation stays in this preview. Nothing is saved between screens.</p></div><div class="g-rail-foot"><span class="g-lock" aria-hidden="true">◇</span><p>Built around your trust.<br><strong>You choose what to share.</strong></p></div></aside><main id="main" class="g-main" tabindex="-1"><header class="g-top"><div><strong>GilbertOne</strong><span class="g-divider">/</span><span>Conversation</span></div>${chip("Design preview")}</header><div class="g-stage screen"><div class="g-welcome"><div class="g-character"><img src="${asset}brand/gilbert-icon.webp" alt="GilbertOne’s friendly face"><span class="g-spark" aria-hidden="true">✳</span></div><span class="eyebrow">A LITTLE SUPPORT GOES A LONG WAY</span><h1>What’s on your mind?</h1><p>Let’s make the next step a little clearer.</p></div><div id="answer" class="answer g-answer" role="status" aria-live="polite"></div><form id="composer" class="g-composer"><label for="question">Ask GilbertOne</label><textarea id="question" rows="2" placeholder="What would you like to understand?" maxlength="500" autocomplete="off"></textarea><div class="g-composer-bottom"><span>Text preview <span aria-hidden="true">·</span> Voice unavailable</span><button class="g-send" type="submit" aria-label="Send preview message"><span aria-hidden="true">↑</span></button></div></form><div class="g-start-label"><span>Not sure where to start?</span><span class="g-line"></span></div><div class="g-prompts"><button data-prompt="care"><span class="g-prompt-icon mint" aria-hidden="true">♡</span><strong>Care, closer to home</strong><span>How does care at home work?</span><span class="g-prompt-arrow" aria-hidden="true">↗</span></button><button data-prompt="passport"><span class="g-prompt-icon lilac" aria-hidden="true">▤</span><strong>Your health, together</strong><span>What is a Health Passport?</span><span class="g-prompt-arrow" aria-hidden="true">↗</span></button><button data-prompt="availability"><span class="g-prompt-icon peach" aria-hidden="true">✳</span><strong>A clearer next step</strong><span>What can I use today?</span><span class="g-prompt-arrow" aria-hidden="true">↗</span></button></div><div class="g-boundary"><span aria-hidden="true">◇</span><p>Scripted preview. No AI or care service is connected here.<br>Nothing you type is sent or saved.</p></div></div><footer class="g-footer"><p>Your Thuso AI Doctor · not a person, and not a doctor</p><p>Medical decisions stay with a qualified clinician.</p></footer></main></div>`;
}

function dispatch() {
  return shell(
    "dispatch",
    head(
      "DISPATCH & INCIDENTS",
      "The next step, in focus.",
      "A calm workspace for a complex day.",
      chip("Schematic · No live locations", "amber"),
    ) +
      `<div class="grid columns"><section class="card"><div class="card-top"><h2>Care in context</h2>${chip("No location feed")}</div><div class="map"><svg viewBox="0 0 620 280" aria-hidden="true"><path d="M0 60L620 220M80 0L240 280M370 0L210 280M0 200L620 70M0 130L620 130M460 0L420 280" stroke="var(--surface)" stroke-width="18" fill="none"/><path d="M0 60L620 220M80 0L240 280M370 0L210 280M0 200L620 70M460 0L420 280" stroke="var(--stone)" stroke-width="2" fill="none"/><circle cx="310" cy="130" r="63" fill="var(--brand-mint)" stroke="var(--teal-ink)" stroke-dasharray="5 6"/><circle cx="310" cy="130" r="12" fill="var(--brand-ink)"/></svg><span class="chip map-label">Illustrative service area</span><span class="chip map-note">No actual geography</span></div><div class="section-label"><h2>Visit workspace</h2>${chip("Empty state")}</div><p>No connected visit queue. When available, this view should pair the selected visit with its permitted next action.</p><div class="step"><b>1</b><div><h3>Choose a visit</h3><p>Who needs help, what was requested and where it stands.</p></div></div><div class="step"><b>2</b><div><h3>Review eligibility</h3><p>Make the reason for a refusal visible at the action.</p></div></div><div class="step"><b>3</b><div><h3>Confirm the permitted action</h3><p>Review first; no optimistic success before confirmation.</p></div></div></section><div class="stack"><section class="card"><div class="card-top"><h2>Work queue</h2>${chip("Not connected", "amber")}</div><div class="segmented" aria-label="Preview queue filter"><button aria-pressed="true" data-filter="visits">Visits</button><button aria-pressed="false" data-filter="incidents">Incidents</button></div><div id="queue-state" style="padding:var(--space-24) 0"><h3>No visits to show</h3><p>No visit feed is connected to this prototype.</p></div>${button("Understand this state", "queue", "light")}</section><section class="card ink"><span class="eyebrow">DESIGNED FOR THE NEXT ACTION</span><h2 style="margin:var(--space-16) 0">The reason travels<br>with the status.</h2><p>A status badge needs context. Explain who can act, what is missing and what happens next.</p></section><section class="card mango"><h3>Clinical urgency stays clinical.</h3><p style="margin-top:var(--space-12)">The interface does not infer urgency from sentiment, visual scores or decorative gauges.</p></section></div></div>`,
  );
}
function landing() {
  return `<div class="landing"><main id="main" tabindex="-1"><nav class="public-nav" aria-label="Public site">${logo}<div><a href="#patient">Explore care</a><a href="#gilbert">Meet GilbertOne</a>${button("Explore the preview", "patient")}</div></nav>${notice}<section class="hero"><div class="hero-copy"><span class="eyebrow">MYTHUSO · SOUTH AFRICA</span><h1>Closer to home.<br>Closer to care.</h1><p>Nurse-led healthcare, designed around<br>the place you feel most comfortable.</p>${button("Explore care at home", "care", "lime")}<p class="small" style="margin-top:var(--space-16)">Service preview. Booking is not connected.</p></div><img src="${asset}editorial/step-nurse.jpg" alt="Illustrative nurse image"><span class="chip image-note">Illustrative image</span></section><div class="section-label"><h2>A familiar place. A clear next step.</h2></div><div class="grid care-grid"><section class="card"><span class="eyebrow">01 / EXPLORE</span><h2>Find the care<br>that fits.</h2><p>Understand the service before choosing your next step.</p>${button("See care options", "care", "light")}</section><section class="card mint"><span class="eyebrow">02 / UNDERSTAND</span><h2>Questions are<br>always welcome.</h2><p>GilbertOne helps explain MyThuso in clear language.</p>${button("Meet GilbertOne", "gilbert", "light")}</section><section class="card lilac"><span class="eyebrow">03 / FEEL INFORMED</span><h2>Know what<br>happens next.</h2><p>A nurse visits; a registered doctor reviews what the nurse found. This journey is a preview.</p>${button("Explore the journey", "journey", "light")}</section></div>${footer}</main></div>`;
}
function kit() {
  return `<main id="main" tabindex="-1">${head("LIFE, CONSIDERED / UI–UX SYSTEM", "One family. Different rhythms.", "Warm for people. Focused for operations. Recognisably MyThuso.")}<section class="card"><div class="card-top"><h2>01 · A purposeful palette</h2>${chip("Existing product tokens")}</div><div class="swatches">${["brandInk", "brandGreen", "brandLime", "brandMint", "studioLilac", "studioPeach"].map((n) => `<div><div class="swatch-color" style="background:${tokens.color[n]}"></div><strong class="small">${n}</strong><p class="small">${tokens.color[n]}</p></div>`).join("")}</div><p class="small" style="margin-top:var(--space-16)">Ink anchors the interface. Mint and lilac create warmth. Lime highlights a primary invitation. Semantic colours keep their meaning.</p></section><div class="grid kit-grid" style="margin-top:var(--space-20)"><section class="card"><h2>02 · Type & spacing</h2><div style="font-size:var(--type-metricLarge);line-height:1.2;letter-spacing:-.05em">Care has a human side.</div><p>Inter. Clear hierarchy. Light numerals. Comfortable line lengths.</p><div class="token-list">${Object.entries(
    tokens.typography.scale,
  )
    .map(([k, v]) => chip(`${k} / ${v}`))
    .join("")}</div><p class="small">Space: ${
    Object.values(tokens.space || tokens.spacing || {})
      .filter((x) => typeof x === "number")
      .join(" · ") || "See shared token source"
  }. System fonts on native. No new font dependency.</p></section><section class="card"><h2>03 · Actions & navigation</h2><div class="token-list">${button("Primary action", "sample")}${button("Secondary action", "sample", "light")}</div><div class="segmented" aria-label="Component density"><button aria-pressed="true" data-density="Comfortable">Comfortable</button><button aria-pressed="false" data-density="Compact">Compact</button></div><p id="density-note" class="small">Comfortable: spacious reading and touch interaction.</p><p class="small">Minimum touch area: 44 × 44. A two-ring focus indicator. Labels stay visible alongside icons.</p></section><section class="card"><h2>04 · Form feedback</h2><label class="field" for="sample-name">Name for this preview<input id="sample-name" placeholder="Enter an example name" autocomplete="off"></label><label class="field" for="sample-error">Example reference<input id="sample-error" class="error-field" aria-invalid="true" aria-describedby="field-error" value="EXAMPLE" readonly></label><p id="field-error" class="small danger-copy">Example error: check the reference and try again.</p><p class="small">Labels persist. Errors explain the correction. No placeholder-only forms.</p></section><section class="card"><h2>05 · Service states</h2>${overview.statusVocabulary.map((s) => `<div><span class="chip ${["gated", "not-configured"].includes(s.id) ? "amber" : s.id === "disconnected" ? "red" : ""}">${esc(s.id)}</span><p class="small">${esc(s.sentence)}</p></div>`).join("")}</section><section class="card"><h2>06 · Empty & loading</h2><h3>No visits to show</h3><p>Explain whether there is no data, no connection or an active filter.</p><div aria-label="Static loading skeleton example"><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></div><p class="small">Loading example · Keep the layout stable. Reduced motion removes animation completely.</p></section><section class="card mango"><h2>07 · Unavailable & safety</h2><h3>Voice is unavailable in this prototype.</h3><p>Use the text walkthrough to explore the conversation layout.</p>${button("Open text walkthrough", "gilbert", "light")}<p class="small">No false success. No clinical meaning assigned to decorative rings. Emergency and refusal wording comes from the contract.</p></section><section class="card"><h2>08 · Motion with a purpose</h2><p>One quiet entrance. Feedback on deliberate interaction. No endlessly pulsing metrics or moving controls.</p><div class="token-list">${chip("Quick · " + tokens.motion.quickMs + " ms")}${chip("Shared motion tokens")}</div>${button("Replay entrance", "replay", "light")}<p class="small">System reduced-motion preference is respected.</p></section><section class="card lilac"><h2>09 · Platform handoff</h2><p>Web: responsive semantic HTML and keyboard navigation.</p><p>iOS: SwiftUI, Dynamic Type, native sheets and controls.</p><p>Android: Compose, system font scale, native back navigation.</p><p class="small">This is an HTML review kit. Native implementation and platform accessibility validation are separate work.</p></section></div>${footer}</main>`;
}
const modal = document.getElementById("detail");
const sceneLines = `<svg class="scene-lines" viewBox="0 0 600 250" aria-hidden="true" fill="none">${Array.from({ length: 12 }, (_, i) => `<path d="M${180 + i * 18} -20 Q ${210 + i * 12} 140 ${480 + i * 22} 245"/>`).join("")}</svg>`;
function care() {
  return shell(
    "care",
    `<section class="n-scene"><header class="n-scene-head n-support-head"><div class="n-support-copy">${sceneLines}<a class="n-back" href="#patient">← MyThuso home</a><span class="eyebrow">CARE, AT YOUR OWN PACE</span><h1>Find a little support.</h1><p>For your everyday. And your unexpected.</p><span class="n-availability">Service catalogue preview · Booking unavailable</span></div><div class="n-support-photo"><img src="assets/support-at-home-v1.png" alt="AI-generated illustration of a home-care nurse listening to an older woman"><span class="p-image-note">AI-generated illustration</span></div></header><div class="n-sheet"><div class="n-sheet-heading"><div><span class="eyebrow">NURSE-LED CARE</span><h2>What can we help with?</h2></div><span class="n-flower" aria-hidden="true">✳</span></div><label class="n-search" for="care-search">${careIcon("help")}<input id="care-search" type="search" placeholder="Search care, recovery or family…" autocomplete="off"><span class="sr-label">Search care services</span></label><div class="n-filters" aria-label="Care categories">${["All care", "Everyday care", "Family health", "Recovery", "Tests & screening"].map((label, i) => `<button data-service-filter="${label}" aria-pressed="${i === 0}">${label}</button>`).join("")}</div><p class="n-result-count" id="care-result-count" role="status"></p><div class="n-service-list" id="care-service-list"></div><div class="n-boundary">${careIcon("shield")}<p>Choose with confidence.<br><strong>This preview explains services. It cannot book care.</strong></p></div></div></section>`,
  );
}
let careFilter = "All care";
function fillCare() {
  const list = document.getElementById("care-service-list");
  if (!list) return;
  const query = document
    .getElementById("care-search")
    .value.toLowerCase()
    .trim();
  const results = services.filter(
    (s) =>
      s.phase === 1 &&
      (careFilter === "All care" || s.category === careFilter) &&
      `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(query),
  );
  document.getElementById("care-result-count").textContent =
    `${results.length} catalogue ${results.length === 1 ? "service" : "services"} · Preview pricing`;
  list.innerHTML = results.length
    ? results
        .map(
          (s, i) =>
            `<button class="n-service-row" data-service-id="${esc(s.id)}" style="--row-order:${i}"><span class="n-service-icon">${careIcon(s.category === "Family health" ? "family" : s.category === "Recovery" ? "shield" : s.category === "Tests & screening" ? "passport" : "heart")}</span><span class="n-service-copy"><strong>${esc(s.name)}</strong><span>${esc(s.description)}</span><small>${esc(s.category)} · ${s.duration} min</small></span><span class="n-service-price">R${s.price}<span>Preview</span></span>${careIcon("arrow")}</button>`,
        )
        .join("")
    : '<div class="n-empty"><h3>No matching services</h3><p>Try a different search or select All care.</p></div>';
}
function weekBars() {
  const max = Math.max(...visits.visits.map((v) => v.count));
  return `<div class="n-bars" role="img" aria-label="Sample visits by day: ${visits.visits.map((v) => v.date + ": " + v.count).join(", ")}">${visits.visits.map((v, i) => `<div class="n-bar-column"><strong>${v.count}</strong><div class="n-bar-track"><i style="--bar-height:${(v.count / max) * 100}%;--row-order:${i}"></i></div><span>${new Date(v.date + "T12:00:00Z").toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" })}</span></div>`).join("")}</div><p class="small">Illustrative visits · ${visits.period.from} — ${visits.period.to}</p><details><summary>View chart values and source ↗</summary><p class="small">${esc(visits._demoWhy)}</p><table><thead><tr><th scope="col">Date</th><th scope="col">Sample visits</th></tr></thead><tbody>${visits.visits.map((v) => `<tr><td>${v.date}</td><td>${v.count}</td></tr>`).join("")}</tbody></table></details>`;
}
function activity() {
  const total = visits.visits.reduce((a, v) => a + v.count, 0);
  const peak = visits.visits.reduce((a, b) => (a.count > b.count ? a : b));
  return shell(
    "tower",
    `<section class="n-scene n-operations"><header class="n-scene-head">${sceneLines}<a class="n-back" href="#tower">← ControlTower overview</a><span class="eyebrow">CONTROL TOWER / WEEKLY REVIEW</span><h1>The week, at a glance.</h1><p>A clear view of the pattern. A source behind every number.</p><span class="n-availability">Demonstration data · ${visits.period.from} — ${visits.period.to}</span></header><div class="n-sheet"><div class="n-week-metrics"><div><span>Total sample visits</span><strong>${total}</strong><small>Illustrative figures</small></div><div><span>Daily average</span><strong>${(total / visits.visits.length).toFixed(1)}</strong><small>Across the sample week</small></div><div><span>Highest sample day</span><strong>${peak.count}</strong><small>${peak.date}</small></div></div>${weekDistribution()}<div class="n-week-grid"><section class="n-week-chart"><div class="n-sheet-heading"><div><span class="eyebrow">THE PATTERN</span><h2>Visits through the week</h2></div>${chip("Sample data")}</div>${weekBars()}</section><section class="n-week-days"><div class="n-sheet-heading"><h2>Day by day</h2>${chip("Visits")}</div>${visits.visits.map((v, i) => `<div class="n-day-row" style="--row-order:${i}"><span class="n-day-date"><strong>${new Date(v.date + "T12:00:00Z").toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" })}</strong><small>${v.date}</small></span><div class="n-day-track" aria-hidden="true"><i style="--day-width:${(v.count / peak.count) * 100}%"></i></div><strong>${v.count}</strong></div>`).join("")}</section></div><div class="n-boundary">${careIcon("shield")}<p>${esc(visits._demoWhy)}<br><strong>These figures do not describe live care activity.</strong></p></div></div></section>`,
  );
}
/* Vital-card concept: the reference's clean cards, but every number is the passport fixture and every range is indicative, never a score. */
const vLatest = readingSets[readingSets.length - 1];
const vPrev = readingSets[readingSets.length - 2];
const mById = (id) => measures.find((m) => m.id === id);
const vTypeMap = {
  pulse: "heart-rate",
  systolic: "systolic-blood-pressure",
  diastolic: "diastolic-blood-pressure",
  oxygen: "oxygen-saturation",
  temperature: "body-temperature",
};
const vWithin = (set, id) => {
  const m = mById(id);
  return set.values[id] >= m.low && set.values[id] <= m.high;
};
const vDayLabel = (off) => (off === 0 ? "today" : `${Math.abs(off)}d ago`);
const vDate = (off) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
};
function vIcon(name) {
  const paths = {
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    drop: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z"/>',
    oxygen:
      '<circle cx="9" cy="8" r="3"/><circle cx="15.5" cy="14" r="4"/><circle cx="7.5" cy="16" r="2"/>',
    temp: '<path d="M14 13.8V5a2 2 0 0 0-4 0v8.8a4 4 0 1 0 4 0Z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
}
function vPoints(values, w, h, pad, lo, hi) {
  const span = hi - lo || 1;
  return values.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (values.length - 1),
    pad + (1 - (v - lo) / span) * (h - 2 * pad),
  ]);
}
function vPathD(pts) {
  return pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}
function vChart(card) {
  const W = 300,
    H = 110,
    P = 14;
  let series;
  if (card.id === "bp") {
    const sys = readingSets.map((s) => s.values.systolic),
      dia = readingSets.map((s) => s.values.diastolic);
    series = [
      { values: sys, trace: "v-trace-a", dot: "v-dot-a", name: "Systolic" },
      { values: dia, trace: "v-trace-b", dot: "v-dot-b", name: "Diastolic" },
    ];
  } else {
    const values = readingSets.map((s) => s.values[card.seriesKey]);
    series = [{ values, trace: "v-trace-a", dot: "v-dot-a", name: card.label }];
  }
  const all = series.flatMap((s) => s.values),
    lo = Math.min(...all),
    hi = Math.max(...all);
  const grid = [P, H / 2, H - P].map((y) => `M${P} ${y}H${W - P}`).join(" ");
  return `<svg class="v-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${card.label} across ${readingSets.length} fixture visits, piecewise trend; exact values in the table below"><path class="v-grid" d="${grid}"/>${series
    .map((s) => {
      const pts = vPoints(s.values, W, H, P, lo, hi);
      return (
        `<path class="v-trace ${s.trace}" pathLength="1" d="${vPathD(pts)}"/>` +
        pts
          .map(
            ([x, y], i) =>
              `<circle class="${s.dot}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${vDayLabel(readingSets[i].dayOffset)}: ${s.name} ${s.values[i]}</title></circle>`,
          )
          .join("")
      );
    })
    .join(
      "",
    )}</svg><div class="v-axis">${readingSets.map((s) => `<span>${vDayLabel(s.dayOffset)}</span>`).join("")}</div>`;
}
function vEcg() {
  let d = "M0 40";
  for (let b = 0; b < 4; b++) {
    const x = b * 72;
    d += ` L${x + 16} 40 L${x + 22} 33 L${x + 28} 40 L${x + 38} 40 L${x + 44} 10 L${x + 50} 54 L${x + 56} 40 L${x + 72} 40`;
  }
  return `<div class="v-ecg"><svg class="v-ecg-svg" viewBox="0 0 288 64" role="img" aria-label="Stylised demonstration electrocardiogram trace, not a captured signal"><path class="v-ecg-path" d="${d}"/></svg><span class="v-ecg-note">Demonstration trace — not a captured signal</span></div>`;
}
function vLegend() {
  return `<div class="v-legend"><span><i class="v-swatch-a" aria-hidden="true"></i>This set <strong>${vLatest.values.oxygen}%</strong></span><span><i class="v-swatch-b" aria-hidden="true"></i>Previous set <strong>${vPrev.values.oxygen}%</strong></span><small>Demonstration — two fixture sets compared, not observed history</small></div>`;
}
function vCardTable(card) {
  return `<details><summary>View exact values and source ↗</summary><table><thead><tr><th scope="col">Visit</th>${card.cols.map((c) => `<th scope="col">${c.label}</th>`).join("")}</tr></thead><tbody>${readingSets.map((s) => `<tr><td>${vDayLabel(s.dayOffset)}<span class="small"> ${vDate(s.dayOffset)}</span></td>${card.cols.map((c) => `<td>${s.values[c.key]}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="small">${esc(fiction)}</p><p class="small">${esc(readingSetsNote)}</p></details>`;
}
const vitalCards = [
  {
    id: "pulse",
    label: "Heart rate",
    icon: "heart",
    tone: "teal",
    seriesKey: "pulse",
    measureIds: ["pulse"],
    display: String(vLatest.values.pulse),
    unitLabel: mById("pulse").unit,
    cols: [{ key: "pulse", label: "Pulse" }],
  },
  {
    id: "bp",
    label: "Blood pressure",
    icon: "drop",
    tone: "mango",
    measureIds: ["systolic", "diastolic"],
    display: `${vLatest.values.systolic}/${vLatest.values.diastolic}`,
    unitLabel: mById("systolic").unit,
    cols: [
      { key: "systolic", label: "Systolic" },
      { key: "diastolic", label: "Diastolic" },
    ],
  },
  {
    id: "oxygen",
    label: "Oxygen saturation",
    icon: "oxygen",
    tone: "accent",
    seriesKey: "oxygen",
    measureIds: ["oxygen"],
    display: String(vLatest.values.oxygen),
    unitLabel: mById("oxygen").unit,
    cols: [{ key: "oxygen", label: "Oxygen" }],
  },
  {
    id: "temperature",
    label: "Body temperature",
    icon: "temp",
    tone: "sage",
    seriesKey: "temperature",
    measureIds: ["temperature"],
    display: vLatest.values.temperature.toFixed(1),
    unitLabel: mById("temperature").unit,
    cols: [{ key: "temperature", label: "Temp" }],
  },
];
for (const c of vitalCards) {
  c.within = c.measureIds.every((id) => vWithin(vLatest, id));
  c.status = c.within ? "Within range" : "Outside range";
}
function vCard(card) {
  return `<section class="v-card" aria-label="${card.label}: latest fixture reading and trend"><button class="v-card-hit" data-vital-explain="${card.id}" aria-label="${card.label} ${card.display} ${card.unitLabel}, ${card.status}. Explain what this range means."><span class="v-chip v-chip-${card.tone}">${vIcon(card.icon)}</span><span class="v-head"><span class="v-label">${card.label}</span><span class="v-value">${card.display} <small>${card.unitLabel}</small></span></span><span class="v-pill ${card.within ? "v-within" : "v-outside"}">${card.status}</span></button>${card.id === "pulse" ? vEcg() : ""}<div class="v-chart">${vChart(card)}</div>${card.id === "oxygen" ? vLegend() : ""}${vCardTable(card)}</section>`;
}
function vTable() {
  return `<section class="card v-table-card" aria-label="All four fixture reading sets"><div class="card-top"><div><h2>Four fixture visits</h2><p class="small">Every reading set in the passport fixture, oldest first.</p></div>${chip("Fixture · Not live", "amber")}</div><div class="v-table-scroll" tabindex="0" role="region" aria-label="Reading sets table, scrolls horizontally"><table><thead><tr><th scope="col">Visit</th><th scope="col">Systolic</th><th scope="col">Diastolic</th><th scope="col">Pulse</th><th scope="col">Temp</th><th scope="col">Oxygen</th><th scope="col">Range</th></tr></thead><tbody>${readingSets
    .map((s) => {
      const out = [
        "systolic",
        "diastolic",
        "pulse",
        "temperature",
        "oxygen",
      ].some((id) => !vWithin(s, id));
      return `<tr><td>${vDayLabel(s.dayOffset)}<span class="small"> ${vDate(s.dayOffset)}</span>${s.note ? `<span class="small"> · ${esc(s.note)}</span>` : ""}</td><td>${s.values.systolic}</td><td>${s.values.diastolic}</td><td>${s.values.pulse}</td><td>${s.values.temperature}</td><td>${s.values.oxygen}</td><td><span class="v-pill ${out ? "v-outside" : "v-within"}">${out ? "Outside range" : "Within range"}</span></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><p class="small">${esc(readingSetsNote)}</p><p class="small">${esc(fiction)}</p></section>`;
}
function vitalExplain(id) {
  const card = vitalCards.find((c) => c.id === id);
  const entry = explainEntries.find((e) => e.id === card.measureIds[0]);
  const ranges = card.measureIds
    .map((mid) => {
      const m = mById(mid);
      return `${m.label} ${m.low}–${m.high} ${m.unit}`;
    })
    .join("; ");
  const codes = card.measureIds
    .map((mid) => {
      const t = vitalTypes.find((t) => t.id === vTypeMap[mid]);
      return `${t.name}: LOINC ${t.loinc}, UCUM ${t.unit}, plausible ${t.min}–${t.max}`;
    })
    .join("; ");
  explain(
    card.label,
    `${entry.measures} Indicative adult range — ${ranges}. ${observationsNote} ${provenance.ranges} What to do: ${entry.whatToDo} Observation codes and plausibility bounds, never thresholds: ${codes}. ${fiction}`,
  );
}
function vitals() {
  return shell(
    "patient",
    head(
      "HEALTH PASSPORT / VITALS",
      "Your readings, honestly.",
      "Four vitals from the passport fixture, each against its indicative adult range. Nothing here is a score, a diagnosis or a live capture.",
      chip("Fixture · Not live", "amber"),
    ) +
      `<div class="notice"><strong>No reading here is live.</strong> Every value below is the passport fixture; the ranges are indicative, never thresholds.</div><div class="v-cards">${vitalCards.map(vCard).join("")}</div>${vTable()}<div class="v-boundary">${careIcon("shield")}<p>${esc(fiction)}<br><strong>No reading on this screen is live, captured or connected.</strong></p></div>`,
  );
}
const explanations = {
  care: [
    "Explore care",
    "The proposed journey starts with clear service descriptions, then visit context and a review step. This prototype cannot book a visit. Production service names, prices and refusal text must come from the catalogue.",
  ],
  visits: [
    "Your visits",
    "Empty is a real state. Show no booking rather than a fictional appointment. The next action is to explore care.",
  ],
  passport: [
    "Health Passport",
    "A proposed record overview leads with provenance and the last update. Real health information remains gated. This design kit contains no patient readings.",
  ],
  family: [
    "Care for your family",
    "Household context must remain visible through every step. A family selector does not create permission to read somebody else’s record.",
  ],
  wellbeing: [
    "A moment for you",
    "A warm journal invitation can give the product life. This kit does not collect or save journal entries.",
  ],
  engine: [
    "GilbertOne API Administration",
    "Present the engine’s observed state, timestamp and source together. This prototype does not contact the engine. Its deterministic safety layer remains on each device; native unified API activation is outside this design.",
  ],
  journey: [
    "The care journey",
    "Explore care → review visit details → understand who comes to the home → understand how a doctor reviews the findings. Booking and care delivery are not connected in this kit.",
  ],
  queue: [
    "Why is this queue empty?",
    "No feed is connected to the review prototype. In the product, distinguish a confirmed empty queue from loading, a connection failure, a filtered result and a permission refusal.",
  ],
  sample: [
    "A clear next step",
    "This is a component example. In the application, a primary button uses a specific verb, leads to a review when appropriate, and shows success only after a confirmed result.",
  ],
};
function explain(title, body) {
  document.getElementById("detail-title").textContent = title;
  document.getElementById("detail-body").textContent = body;
  modal.showModal();
}
function render() {
  stopMapReplay();
  let key = location.hash.slice(1) || "gilbert";
  if (
    ![
      "tower",
      "dispatch",
      "patient",
      "gilbert",
      "landing",
      "kit",
      "care",
      "activity",
      "province",
      "vitals",
    ].includes(key)
  )
    key = "tower";
  document.getElementById("app").innerHTML = {
    tower,
    dispatch,
    patient,
    gilbert,
    landing,
    kit,
    care,
    activity,
    province,
    vitals,
  }[key]();
  document.querySelectorAll(".review-bar nav a").forEach((a) => {
    if (a.hash === "#" + key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.documentElement.dataset.view = key;
  document.getElementById("preview-screen").value = key;
  if (key === "care") {
    careFilter = "All care";
    fillCare();
  }
  document.title = `MyThuso · ${key === "kit" ? "UI/UX kit" : key} concept`;
  if (key === "gilbert")
    document.getElementById("composer").addEventListener("submit", (e) => {
      e.preventDefault();
      document.getElementById("answer").textContent =
        "This is a layout demonstration, not a connected assistant. Your text was not sent or saved. Choose a suggested question above to preview a scripted explanation.";
      document.getElementById("question").value = "";
    });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.vitalExplain) {
    vitalExplain(b.dataset.vitalExplain);
    return;
  }
  if (b.dataset.action) {
    const a = b.dataset.action;
    if (a === "new-conversation") {
      document.getElementById("answer").textContent = "";
      document.getElementById("question").value = "";
      document.getElementById("question").focus();
    } else if (
      [
        "tower",
        "dispatch",
        "patient",
        "gilbert",
        "landing",
        "kit",
        "care",
        "activity",
        "province",
        "vitals",
      ].includes(a)
    )
      location.hash = a;
    else if (a === "replay") {
      const main = document.querySelector("main");
      main.classList.remove("screen");
      void main.offsetWidth;
      main.classList.add("screen");
    } else if (explanations[a]) explain(...explanations[a]);
  }
  if (b.dataset.category) {
    const c = portal.categories.find((c) => c.id === b.dataset.category);
    if (c.id === "overview") location.hash = "tower";
    else if (c.id === "dispatch") location.hash = "dispatch";
    else
      explain(
        c.label,
        `The existing category and its address are retained. Its tabs are: ${c.tabs.map((t) => t.label).join(", ")}. This design kit explores the shared shell; these deeper workflows are not implemented here.`,
      );
  }
  if (b.dataset.filter) {
    document
      .querySelectorAll("[data-filter]")
      .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    document.getElementById("queue-state").innerHTML =
      `<h3>No ${b.dataset.filter} to show</h3><p>No ${b.dataset.filter === "visits" ? "visit" : "incident"} feed is connected to this prototype.</p>`;
  }
  if (b.dataset.density) {
    document
      .querySelectorAll("[data-density]")
      .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    document.getElementById("density-note").textContent =
      b.dataset.density === "Compact"
        ? "Compact: reduce spacing in data rows, retaining readable text and 44 px action targets."
        : "Comfortable: spacious reading and touch interaction.";
  }
  if (b.dataset.prompt) {
    const answers = {
      care: "The intended journey is nurse-led care at home, with a registered doctor reviewing what the nurse found. This kit demonstrates the explanation; it does not book care.",
      passport:
        "The Health Passport concept brings records together with clear sources and consent boundaries. Real patient information is not available in this design kit.",
      availability:
        "This is a standalone design prototype. It does not check service availability. The product’s status page is the place to check connected capabilities.",
    };
    document.getElementById("answer").textContent = answers[b.dataset.prompt];
  }
});
window.addEventListener("hashchange", changeScene);
render();

document.addEventListener("change", (e) => {
  if (e.target.id === "category-select") {
    const c = portal.categories.find((c) => c.id === e.target.value);
    if (c.id === "overview") location.hash = "tower";
    else if (c.id === "dispatch") location.hash = "dispatch";
    else
      explain(
        c.label,
        `Category retained. Tabs: ${c.tabs.map((t) => t.label).join(", ")}. These deeper workflows are not implemented in this review kit.`,
      );
  }
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-care-choice]");
  if (!b) return;
  document
    .querySelectorAll("[data-care-choice]")
    .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  const family = b.dataset.careChoice === "family";
  document.getElementById("care-choice-copy").textContent = family
    ? "Explore support for the people you love, with clear consent boundaries."
    : "Get familiar with how a nurse-led visit would work.";
  const action = document.getElementById("care-choice-action");
  action.dataset.action = family ? "family" : "journey";
  action.innerHTML =
    (family ? "Explore family care " : "Explore the care journey ") +
    careIcon("arrow");
});

document.getElementById("preview-screen").addEventListener("change", (e) => {
  location.hash = e.target.value;
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-care-choice]")) return;
  const copy = document.getElementById("care-choice-copy");
  copy.classList.remove("is-changing");
  void copy.offsetWidth;
  copy.classList.add("is-changing");
});

document.addEventListener("input", (e) => {
  if (e.target.id === "care-search") fillCare();
});
document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-service-filter]");
  if (f) {
    careFilter = f.dataset.serviceFilter;
    document
      .querySelectorAll("[data-service-filter]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === f)));
    fillCare();
  }
  const row = e.target.closest("[data-service-id]");
  if (row) {
    const s = services.find((s) => s.id === row.dataset.serviceId);
    explain(
      s.name,
      `${s.description} Catalogue preview: R${s.price}, ${s.duration} minutes. This is not a booking or a live quote. No care is requested and no payment is taken.`,
    );
  }
});
// Short scene snapshots soften between destinations; the real controls remain immediately usable.
let sceneTransition;
function changeScene() {
  const paint = () => {
    render();
    window.scrollTo(0, 0);
    document.querySelector("main").focus({ preventScroll: true });
  };
  sceneTransition?.skipTransition();
  if (
    !motionEnabled ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !document.startViewTransition
  ) {
    paint();
    return;
  }
  document.documentElement.classList.add("scene-navigation");
  sceneTransition = document.startViewTransition(paint);
  sceneTransition.finished.catch(() => {});
}
document.getElementById("motion-toggle").addEventListener("click", () => {
  if (!motionEnabled) sceneTransition?.skipTransition();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  (e) => {
    if (e.matches) sceneTransition?.skipTransition();
  },
);
