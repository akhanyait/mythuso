import { capabilities, connectedCount, noticeFor, simulatedCount, simulationOf, stateOf } from './lib/capabilities';
import { rule } from './lib/capability-rules';
import openSource from '../../../packages/catalog/open-source.json' with { type: 'json' };
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
/* Derived, like the sentence above it. A simulator is the one thing on this page that could be
   mistaken for an integration — somebody who has watched a payment go through end to end is one
   edit away from believing a payment provider exists — so the count of them is stated where the
   count of connected ones is, and each row says what its stand-in refuses to do. */
if (simulatedCount > 0) {
 bannerInner.append(el('p', 'status-simulated',
  `${simulatedCount} of them are simulated. Something answers, and what answers is a stand-in `
  + 'running on the machine you are reading this on. No supplier is contracted and nothing below is '
  + 'less blocked for having one.'));
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
 /* Three states, three chips. `simulated` is deliberately not folded into "Not connected": a reader
    deciding whether to trust this needs to know the difference between a screen with nothing behind
    it and a screen with a fixture behind it, and folding them would hide the more interesting one. */
 const state = stateOf(c.id);
 head.append(
  el('h2', undefined, c.name),
  el('span', `status-state${c.connected ? ' on' : state === 'simulated' ? ' sim' : ''}`,
   c.connected ? 'Connected' : state === 'simulated' ? 'Simulated' : 'Not connected')
 );
 detail.append(head);
 if (c.connected) {
  detail.append(el('p', 'status-notice', 'Connected. Nothing is added to the screens that use it.'));
 } else {
  detail.append(el('p', 'status-label', 'What a person is told on the screen'));
  /* `noticeFor`, never `notice`. A simulated capability that showed the absent sentence would be
     telling a funder nothing is connected while a stand-in answers, which is the disclosure failure
     the third state exists to prevent — and this is the page that failure would be read on. */
  detail.append(el('p', 'status-notice', noticeFor(c.id)!));
  const simulation = simulationOf(c.id);
  if (simulation) {
   /* Who the stand-in is standing in for, before what it refuses. A reader who has just been told
      something answers will ask what, and a page that goes straight to the refusals has answered the
      second question without answering the first. */
   detail.append(el('p', 'status-label', 'What is standing in for it'));
   detail.append(el('p', 'status-notice', simulation.supplier));
   detail.append(el('p', 'status-label', 'What the stand-in refuses to do'));
   const refuses = el('ul', 'status-refuses');
   simulation.refuses.forEach(r => refuses.append(el('li', undefined, r)));
   detail.append(refuses);
  }
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

/* The register of what the specification names from outside — open-source modules, standards,
   open-weights models and speech providers — with the decision it made for each and whether any of
   them has been adopted. It is here because this is the page somebody reads to find out what is
   real, and "we use HAPI FHIR" is exactly the sentence a funder might have been told. It renders
   packages/catalog/open-source.json; the count is counted and the two sentences are the contract's.
   A decision and a status per row and nothing more: the licences, links and blockers are in
   docs/OPEN-SOURCE.md, and a status page that grew into the register would stop loading quickly on
   the connection it was built for. */
const registerSection = el('section', 'oss-register');
registerSection.setAttribute('aria-labelledby', 'oss-heading');
const registerHeading = el('h2', undefined, 'What the specification names from outside');
registerHeading.id = 'oss-heading';
const adoptedCount = openSource.components.filter(c => c.adoption.status === 'adopted').length;
const notAdoptedRule = openSource.rules.find(r => r.id === 'open-source-is-not-production-approved')!;
const registerCount = el('p', 'oss-count');
registerCount.append(el('strong', undefined, String(adoptedCount)), el('span', undefined, `of ${openSource.components.length} registered components are adopted`));
registerSection.append(registerHeading, registerCount, el('p', 'status-notice', notAdoptedRule.statement), el('p', 'oss-why', notAdoptedRule.why));
for (const decision of openSource.decisions) {
 const group = openSource.components.filter(c => c.specDecision === decision.id);
 if (!group.length) continue;
 registerSection.append(el('h3', 'oss-decision', decision.id));
 const rows = el('ul', 'oss-list');
 for (const c of group) {
  const row = el('li', 'oss-row');
  row.id = `oss-${c.id}`;
  const licence = c.kind === 'refused' ? 'Declined' : c.source.licence ? c.source.licence : c.kind === 'standard' ? 'A published standard' : 'Licence not verified';
  row.append(
   el('span', 'oss-name', c.name),
   el('span', 'oss-licence', licence),
   el('span', `oss-state${c.adoption.status === 'adopted' ? ' on' : ''}`, c.adoption.status === 'adopted' ? 'Adopted' : 'Not adopted')
  );
  rows.append(row);
 }
 registerSection.append(rows);
}
const registerSource = el('p', 'status-source');
registerSource.append(
 document.createTextNode('This section renders '),
 el('code', undefined, 'packages/catalog/open-source.json'),
 document.createTextNode('. Licences, what each would plug into and what stands in its way are in '),
 el('code', undefined, 'docs/OPEN-SOURCE.md'),
 document.createTextNode('.')
);
registerSection.append(registerSource);
main.append(registerSection);

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
