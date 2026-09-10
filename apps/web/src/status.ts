import { capabilities, connectedCount, simulatedCount, rule } from './lib/capabilities';
import './surface/core.css';
import './surface/status.css';
/* The fifth entry, and the smallest one on purpose — with no React in it.
 *
 * This is the page somebody opens when they suspect nothing works: a funder doing due diligence, a
 * partner deciding whether to sign, a reader who has just been told by a screen that it does not
 * book a visit and wants to know what else that is true of. They are as likely to be on a metered
 * connection in a car park as at a desk.
 *
 * It was first written as a React component, and 93% of what it shipped was react-dom — 65 kB
 * gzipped to render a list that never changes after it is drawn. On the one page whose job is to
 * load when everything else is failing, that is the wrong trade, so this builds the DOM directly
 * and ships about four. Nothing here is interactive; there is nothing for a framework to do.
 *
 * It renders packages/catalog/capabilities.json and nothing else. Nobody edits this page when an
 * integration lands — the boolean in the contract changes and the row changes with it, which is the
 * only version of a status page that stays true past the week it was written.
 *
 * Every sentence with a full stop in it comes from the contract and is rendered word for word. What
 * is written here is furniture: a heading, a label, a link. */

const el = <K extends keyof HTMLElementTagNameMap>(
 tag: K, className?: string, text?: string
): HTMLElementTagNameMap[K] => {
 const node = document.createElement(tag);
 if (className) node.className = className;
 if (text !== undefined) node.textContent = text;
 return node;
};

const total = capabilities.length;
const evidenceRule = rule('connected-needs-evidence');
const simulationRule = rule('simulated-is-not-connected');
const root = document.getElementById('root')!;
const page = el('div', 'status-page');

const banner = el('header', 'status-banner');
const bannerInner = el('div', 'status-banner-inner');
bannerInner.append(
 el('p', 'status-brand', 'MyThuso'),
 el('h1', undefined, 'What is switched on'),
 el('p', 'status-lede',
  'MyThuso is being built. This page lists every capability the product has a screen for, whether '
  + 'that screen is connected to anything real, and what each one is waiting on. It is drawn from '
  + 'the same file the web, iOS and Android apps read, so a screen and this page cannot disagree '
  + 'about what works.')
);
const count = el('p', 'status-count');
count.append(el('strong', undefined, String(connectedCount)), el('span', undefined, `of ${total} capabilities are connected`));
bannerInner.append(count);
/* Derived rather than declared: this reads "none of them" only for as long as that is what the
   array says. A sentence typed here would go on being printed after it stopped being true, which is
   how a page like this turns into the thing it was built to replace. */
if (connectedCount === 0) {
 bannerInner.append(el('p', 'status-none',
  'Not one of them has been connected to a real service. No visit is booked, no payment is taken, '
  + 'no clinical decision is issued and no device is contacted.'));
}
/* The sentence this page exists to get right.
 *
 * Fourteen simulated suppliers now stand behind the product so the whole journey can be walked, and
 * a page that mentioned the walking without the standing-in would be the readiness claim this page
 * was built to prevent — worse than the version with nothing behind it at all, because a
 * demonstration is more convincing than a screenshot. So the count above stays the connected count,
 * it stays zero, and the simulation is reported underneath it as what it is. Both numbers are
 * derived, so neither can go on being printed after it stops being true. */
if (simulatedCount > 0) {
 bannerInner.append(el('p', 'status-simulated',
  `${simulatedCount} of ${total} have a simulated supplier standing in, so the product can be walked from `
  + 'end to end before anything is signed. A simulation is not a connection. Every screen it stands '
  + 'behind says so, and each one below lists what its simulation refuses to do.'));
}
banner.append(bannerInner);

const main = el('main', 'status-main');
main.id = 'main';
const list = el('ol', 'status-list');
capabilities.forEach((c, i) => {
 const row = el('li', 'status-row');
 row.id = c.id;
 const index = el('p', 'status-index', String(i + 1).padStart(2, '0'));
 index.setAttribute('aria-hidden', 'true');
 const detail = el('div', 'status-detail');
 const head = el('div', 'status-row-head');
 /* Three states and three chips, and the middle one is deliberately not a shade of the first.
    "Simulated" reading as a nearly-connected thing is the whole failure mode of this page. */
 const stateClass = c.connected ? 'status-state on' : c.state === 'simulated' ? 'status-state sim' : 'status-state';
 const stateWord = c.connected ? 'Connected' : c.state === 'simulated' ? 'Simulated' : 'Not connected';
 head.append(el('h2', undefined, c.name), el('span', stateClass, stateWord));
 detail.append(head);
 if (c.connected) {
  detail.append(el('p', 'status-notice', 'Connected. Nothing is added to the screens that use it.'));
 } else {
  detail.append(el('p', 'status-label', 'What a person is told on the screen'));
  /* The sentence a person actually reads, which for a simulated capability is the simulation's and
     not the absent one. Rendering `c.notice` here was wrong the moment the third state existed: this
     page would have quoted a screen as saying "not switched on yet" while that screen said
     "simulated", and a status page that misquotes the product is worse than one that says less. */
  detail.append(el('p', 'status-notice', c.simulation ? c.simulation.notice : c.notice));
 }
 if (c.simulation) {
  detail.append(el('p', 'status-label', 'What is standing in for it'));
  detail.append(el('p', 'status-notice', c.simulation.supplier));
  /* The refusals, on the funder-facing page rather than only in the source. They are the reason a
     simulation is honest work rather than a demonstration wearing a product's clothes, and a reader
     deciding whether to believe this page should be able to read them without opening a file. */
  detail.append(el('p', 'status-label', 'What the simulation will not do'));
  const refuses = el('ul', 'status-blockers');
  c.simulation.refuses.forEach(r => refuses.append(el('li', undefined, r)));
  detail.append(refuses);
 }
 if (c.blockedBy.length > 0) {
  detail.append(el('p', 'status-label', 'What is standing in the way'));
  const blockers = el('ul', 'status-blockers');
  c.blockedBy.forEach(b => blockers.append(el('li', undefined, b)));
  detail.append(blockers);
 }
 row.append(index, detail);
 list.append(row);
});
main.append(list);

const foot = el('footer', 'status-foot');
const footInner = el('div', 'status-foot-inner');
footInner.append(
 el('h2', undefined, 'How a row here becomes “Connected”'),
 el('p', undefined, evidenceRule.statement),
 el('p', undefined, evidenceRule.why),
 el('h2', undefined, 'Why “Simulated” is not most of the way there'),
 el('p', undefined, simulationRule.statement),
 el('p', undefined, simulationRule.why)
);
const source = el('p', 'status-source');
source.append(
 document.createTextNode('This page renders '),
 el('code', undefined, 'packages/catalog/capabilities.json'),
 document.createTextNode(' and nothing else. Turning one of these on is a change to that file, reviewed like any other.')
);
const about = el('p');
const link = el('a', undefined, 'About MyThuso');
link.href = '/landing.html';
about.append(link);
footInner.append(source, about);
foot.append(footInner);

page.append(banner, main, foot);
root.append(page);
