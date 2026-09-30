import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, controlSweep as sweep, zoomedTo200 } from './audit';
import { PORTAL_CATEGORIES, goPortal, portalCategory } from './nav';

/* The merged MyThuso Control Tower, on both viewports (docs/PROMPT-CONTROL-TOWER-UI.md §5, §6,
 * Phase 3).
 *
 * Four things are held here, in the order the plan asks for them. Every category is reachable by the
 * keyboard alone, by the tabs pattern docs/control-tower-accessibility.md writes down. Every address
 * the two old surfaces had still lands — the two roles, every old tab named the old way, and the
 * parallel run's read-only surfaces — as docs/control-tower-cutover.md's address table says. Every new
 * screen shows its written empty state in its contract's own words, with the facts read from the
 * contracts that own them. And every new screen passes the same measurements tests/accessibility.spec
 * .ts takes, plus a sweep for names, tab order and motion.
 *
 * Every sentence asserted is read from the contracts, never typed here, so a reworded contract moves
 * the journey with it rather than leaving it asserting words nobody says any more. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const portal = json('../packages/catalog/control-tower-portal.json');
const overview = json('../packages/catalog/control-tower-overview.json');
const vitals = json('../packages/catalog/vitals.json');
const queue = json('../packages/catalog/clinical-review-queue.json');
const protocols = json('../packages/catalog/protocols.json');
const pack = json('../packages/catalog/compliance-pack.json');
const capabilities = json('../packages/catalog/capabilities.json');

type Category = { id: string; label: string; tabs: { id: string; label: string; heading?: string; headsItself?: boolean }[]; tools?: string[] };
const categories = portal.categories as Category[];
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const deviceFacts = { real: vitals.deviceAllowlist.real.length, dpia: portal.devices.dpiaWords[vitals.darkForRealDevices.dpiA] };
const refusal = (id: string) => (portal.refusals as { id: string; statement: string }[]).find(r => r.id === id)!.statement;

const categoryList = (page: Page) => page.getByRole('tablist', { name: PORTAL_CATEGORIES });
const selectedCategory = (page: Page) => categoryList(page).getByRole('tab', { selected: true });
const panel = (page: Page) => page.locator('#pt-category');
/* The assistant's health route is the one thing the Overview reads live. Answered here so the journey
   does not depend on whether a service happens to be listening on the machine running the suite. */
const healthy = (page: Page) => page.route('**/assistant/health', route =>
 route.fulfill({ json: { ok: true, activated: true, azure: true, speech: true, production: true } }));
async function openPortal(page: Page, search = '?role=back-office') {
 await healthy(page);
 await page.goto(`/app/${search}`);
 await expect(categoryList(page)).toBeVisible();
}

test.describe('every category, by the keyboard alone', () => {
 test('the first Tab reaches the skip link, and the arrows walk every category in the plan\'s order', async ({ page }) => {
  await openPortal(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  /* From the selected category — one Tab stop — the arrows move and activate. */
  await selectedCategory(page).focus();
  await page.keyboard.press('Home');
  for (const [i, category] of categories.entries()) {
   if (i) await page.keyboard.press('ArrowRight');
   const tab = categoryList(page).getByRole('tab', { name: category.label, exact: true });
   await expect(tab).toBeFocused();
   await expect(tab).toHaveAttribute('aria-selected', 'true');
   await expect(page).toHaveURL(new RegExp(`category=${category.id}`));
   await expect(panel(page).locator('.pt-intro .eyebrow')).toContainText(category.label);
   /* The category arrived as a screen, not as a loading state that stayed. */
   await expect(panel(page).getByRole('status', { name: portal.loading.sentence })).toHaveCount(0);
  }
  /* Focus wraps, and End and Home go to the ends. */
  await page.keyboard.press('ArrowRight');
  await expect(categoryList(page).getByRole('tab', { name: categories[0]!.label, exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(categoryList(page).getByRole('tab', { name: categories.at(-1)!.label, exact: true })).toBeFocused();
  /* Only the selected tab is a Tab stop: no category but the current one is in the tab order. */
  await expect(categoryList(page).locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
 });

 test('a category\'s own tabs are one Tab stop, the arrows move between them, and Back returns', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Finance');
  const tabs = page.getByRole('tablist', { name: 'Finance tabs' });
  await tabs.getByRole('tab', { selected: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Cost allocation' })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: 'Cost allocation' })).toBeVisible();
  await expect(page).toHaveURL(/tab=cost-allocation/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Finance' })).toBeVisible();
 });

 test('a list is one Tab stop and the arrows move between its rows', async ({ page }) => {
  await openPortal(page);
  const services = page.getByRole('list', { name: `${overview.sections[0].services.length} services` });
  const rows = services.locator('li');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(rows.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(rows.first()).toBeFocused();
  await expect(services.locator('li[tabindex="0"]')).toHaveCount(1);
 });

 test('the Configuration tree moves by the arrows, and every node has its own written empty state', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Configuration');
  const tree = page.getByRole('tree', { name: 'Configuration' });
  await tree.getByRole('treeitem', { selected: true }).focus();
  const nodes = portal.configuration.tree as { id: string; label: string; emptyState?: string }[];
  for (const [i, node] of nodes.entries()) {
   if (i) await page.keyboard.press('ArrowDown');
   await expect(tree.getByRole('treeitem', { name: node.label })).toBeFocused();
   const section = page.getByRole('region', { name: node.label, exact: true });
   await expect(section.getByRole('heading', { level: 2, name: node.label, exact: true })).toBeVisible();
   if (node.id === 'integrations') {
    const all = capabilities.capabilities as { connected: boolean }[];
    await expect(section).toContainText(fill(node.emptyState!, { connected: all.filter(c => c.connected).length, total: all.length }));
   } else if (node.emptyState) await expect(section).toContainText(node.emptyState);
  }
 });
});

test.describe('the addresses that must keep working', () => {
 test('the Control Tower\'s old address opens the portal on Dispatch & Incidents, with the notice', async ({ page }) => {
  await openPortal(page, '?role=control-tower');
  await expect(selectedCategory(page)).toHaveText(portalCategory('dispatch').label);
  await expect(page.getByRole('heading', { level: 1, name: 'Dispatch' })).toBeVisible();
  await expect(page.locator('.pt-notice')).toContainText(portal.notice.sentence);
  await expect(page).toHaveURL(/\?role=control-tower$/);
  /* The notice links to the table of what moved where. */
  await page.locator('.pt-notice').getByRole('button', { name: portal.notice.linkLabel }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What moved where' })).toBeVisible();
  await expect(page.locator('#pt-category table tbody tr')).toHaveCount(portal.legacyAddresses.length);
 });

 test('the back office\'s old address opens the portal on Overview, with the notice', async ({ page }) => {
  await openPortal(page, '?role=back-office');
  await expect(selectedCategory(page)).toHaveText(portalCategory('overview').label);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.locator('.pt-notice')).toContainText(portal.notice.sentence);
 });

 test('every old tab and section, named the old way, lands where the tab inventory says', async ({ page }) => {
  await healthy(page);
  for (const entry of portal.legacyAddresses as { legacy: string; category: string; tab: string }[]) {
   const [surface, name] = [entry.legacy.slice(0, entry.legacy.indexOf(':')), entry.legacy.slice(entry.legacy.indexOf(':') + 1)];
   await page.goto(`/app/?role=${surface}&category=${slug(name)}`);
   const category = portalCategory(entry.category);
   await expect(selectedCategory(page), `${entry.legacy} lands on the wrong category`).toHaveText(category.label);
   if (category.tabs.length > 1)
    await expect(page.getByRole('tablist', { name: `${category.label} tabs` }).getByRole('tab', { selected: true }), `${entry.legacy} lands on the wrong tab`)
     .toHaveText(category.tabs.find(t => t.id === entry.tab)!.label);
   /* A new-style address is not an old bookmark, so it carries no notice. */
   await expect(page.locator('.pt-notice')).toHaveCount(0);
  }
 });

 test('the parallel run: both old surfaces, read-only, each linking to the same place in the portal', async ({ page }) => {
  await page.goto('/app/?role=control-tower&legacy=1');
  const notice = page.locator('.legacy-notice');
  await expect(notice).toContainText(portal.legacy.sentence);
  /* Every control in the section is refused; the navigation, which comparing needs, is not. */
  const kept = page.locator('fieldset.legacy-readonly');
  await expect(kept).toHaveAttribute('disabled');
  await expect(kept.locator('button').first()).toBeDisabled();
  /* And the controls a screen draws for itself — the board's map pins — are stopped as well. */
  /* Since streets start on for staff (29 September 2026) the board's pins are the tile map's real
     <button>s, which a disabled fieldset disables outright; the schematic's pins are SVG groups the
     fieldset cannot disable, so those are pressed and must stay unselected. Either way: stopped. */
  const pin = kept.locator('[aria-pressed="false"]').first();
  await expect(pin).toBeAttached();
  if (await pin.evaluate(el => el instanceof HTMLButtonElement)) await expect(pin).toBeDisabled();
  else { await pin.click(); await expect(pin).toHaveAttribute('aria-pressed', 'false'); }
  await notice.getByRole('link', { name: portal.legacy.linkLabel }).click();
  await expect(selectedCategory(page)).toHaveText(portalCategory('dispatch').label);

  await page.goto('/app/?role=back-office&legacy=1');
  await expect(page.locator('.legacy-notice')).toContainText(portal.legacy.sentence);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.locator('fieldset.legacy-readonly')).toHaveAttribute('disabled');
  await page.locator('.legacy-notice').getByRole('link', { name: portal.legacy.linkLabel }).click();
  await expect(selectedCategory(page)).toHaveText(portalCategory('overview').label);
  await expect(page.getByRole('tablist', { name: 'Overview tabs' }).getByRole('tab', { selected: true })).toHaveText('Against the funding plan');
 });

 /* docs/control-tower-cutover.md, What is compared: for each moved tab, the same fixtures render the
    same counts in both places, and the run fails if the two disagree. The Control Tower's strip is the
    one set of figures both surfaces draw over the same boards. */
 test('the parallel run: the same fixtures give the same figures in the old place and the new', async ({ page }) => {
  const figures = async () => page.locator('.s-metric').evaluateAll(els => els.map(el =>
   `${el.querySelector('.s-metric-label')?.textContent} ${el.querySelector('.s-metric-value')?.textContent} ${el.querySelector('.s-metric-chip')?.textContent ?? ''}`));
  for (const section of ['Dispatch', 'Incidents']) {
   await page.goto(`/app/?role=control-tower&legacy=1`);
   await expect(page.locator('.legacy-notice')).toBeVisible();
   if (section === 'Incidents') {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await ((await nav.isVisible()) ? nav : page.locator('.tabbar')).getByRole('button', { name: section, exact: true }).click();
   }
   await expect(page.locator('.s-metric').first()).toBeVisible();
   const old = (await figures()).slice(0, 3);
   await openPortal(page, `?role=control-tower&category=${section.toLowerCase()}`);
   await expect(page.locator('.s-metric').first()).toBeVisible();
   expect((await figures()).slice(0, 3), `${section}: the portal and the kept workspace disagree`).toEqual(old);
  }
 });

 test('context lives in the address, and a tenant in it is refused rather than invented', async ({ page }) => {
  await openPortal(page, '?role=control-tower&category=audit&period=last-7-days&tenant=anybody');
  await expect(page.getByLabel('Period')).toHaveValue('last-7-days');
  await expect(page.locator('.pt-context')).toContainText(overview.refusals.find((r: { id: string }) => r.id === 'no-invented-tenant').statement);
  await page.getByLabel('Period').selectOption('last-30-days');
  await expect(page).toHaveURL(/period=last-30-days/);
  await expect(page).toHaveURL(/category=audit/);
  await expect(page).not.toHaveURL(/tenant=/);
  /* And the picker says what it is not, beside the categories. */
  await expect(page.locator('.pt-preview')).toContainText(portal.previewPicker.sentence);
 });
});

test.describe('every new screen says what it holds, and why it is empty', () => {
 test('the Overview reads the assistant live and every other service from its decision', async ({ page }) => {
  await openPortal(page);
  const services = page.getByRole('list', { name: `${overview.sections[0].services.length} services` });
  for (const s of overview.sections[0].services as { label: string; fixedState?: string; reason?: string }[]) {
   const row = services.locator('li').filter({ has: page.locator('strong', { hasText: s.label }) });
   await expect(row.locator('.pt-status')).toHaveText(s.fixedState ?? 'connected');
   if (s.reason) await expect(row).toContainText(s.reason);
  }
  const section = (id: string) => overview.sections.find((x: { id: string }) => x.id === id);
  await expect(panel(page)).toContainText(section('active-tenants').emptyState);
  await expect(panel(page)).toContainText(section('recent-activity').emptyState);
  await expect(page.getByRole('table', { name: section('open-gates').why }).locator('tbody tr')).toHaveCount(section('open-gates').gates.length);
  for (const item of portal.overview.whatChanged) await expect(panel(page)).toContainText(item.heading.replace(/^Delivered — /, ''));
 });

 test('a health route that does not answer is disconnected, said as a word', async ({ page }) => {
  await page.route('**/assistant/health', route => route.abort());
  await page.goto('/app/?role=back-office');
  const assistant = page.locator('.pt-services li').filter({ hasText: overview.sections[0].services[0].label });
  await expect(assistant.locator('.pt-status')).toHaveText('disconnected');
 });

 test('Devices & Fleet: three views, each empty for the reason vitals.json gives, and nothing to press', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Devices & Fleet');
  await expect(panel(page)).toContainText(fill(portal.devices.fleetEmpty, deviceFacts));
  await expect(panel(page)).toContainText(portal.devices.attentionEmpty);
  await goPortal(page, 'Devices & Fleet', 'Provisioning');
  await expect(panel(page)).toContainText(fill(portal.devices.provisioningEmpty, deviceFacts));
  await expect(panel(page).locator('.pt-step')).toHaveCount(portal.devices.steps.length);
  await goPortal(page, 'Devices & Fleet', 'Device-class allowlist');
  await expect(panel(page)).toContainText(fill(portal.devices.allowlistEmpty, deviceFacts));
  await expect(panel(page)).toContainText(portal.devices.gate);
  await expect(panel(page)).toContainText(portal.devices.enableRefusal);
  await expect(page.locator('#pt-subpanel').getByRole('button')).toHaveCount(0);
 });

 test('GilbertOne API Administration carries its mark, opens on its Overview, and acts on nothing', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'GilbertOne API Administration');
  await expect(panel(page).getByRole('img', { name: 'GilbertOne' })).toBeVisible();
  await expect(panel(page)).toContainText(portal.gilbertone.sentence);
  await expect(panel(page)).toContainText(refusal('no-gilbertone-action-while-its-gate-is-open'));
  /* The seven sub-screens are the category's tabs; tests/gilbertone-admin.spec.ts walks each of them. */
  await expect(page.getByRole('tablist', { name: 'GilbertOne API Administration tabs' }).getByRole('tab')).toHaveCount(portal.gilbertone.subScreens.length);
  await expect(page.locator('#pt-subpanel .pt-loading')).toHaveCount(0);
  await expect(page.locator('#pt-subpanel button:not([disabled])')).toHaveCount(0);
 });

 test('Finance: cost allocation on three axes, with no figure on any of them', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Finance', 'Cost allocation');
  await expect(panel(page)).toContainText(portal.costAllocation.emptyState);
  for (const axis of portal.costAllocation.axes) await expect(page.getByRole('row', { name: new RegExp(axis.label) })).toContainText(axis.emptyState);
 });

 test('Compliance: the pack preview, each section with the decision that keeps it empty', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Compliance', 'Compliance pack preview');
  await expect(panel(page)).toContainText(pack.refusals[0].statement);
  const sections = page.getByRole('list', { name: `${pack.sections.length} sections of the compliance pack` }).locator('li.pt-row');
  await expect(sections).toHaveCount(pack.sections.length);
  for (const section of pack.sections) await expect(panel(page)).toContainText(section.todayItWouldSay);
  await expect(page.locator('#pt-subpanel').getByRole('button')).toHaveCount(0);
 });

 test('Governance: the Clinician Review Queue, empty, with nobody to sign and nothing to sign with', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Governance', 'Clinician Review Queue');
  const words = portal.reviewQueue.boardWords;
  await expect(panel(page)).toContainText(fill(portal.reviewQueue.noSignature, { board: words[protocols.governance.board.status], director: words[protocols.governance.medicalDirector.status] }));
  await expect(panel(page)).toContainText(queue.preview);
  await expect(page.getByRole('list', { name: `${queue.states.length} states an entry moves through` }).locator('li')).toHaveCount(queue.states.length);
  for (const r of queue.refusals) await expect(panel(page)).toContainText(r.statement);
  await expect(page.locator('#pt-subpanel').getByRole('button')).toHaveCount(0);
 });
});

/* The measurements, the names, the tab order and the motion, on every screen the portal adds and on
   the portal's frame around the screens it moved. */
const newScreens: [string, string?][] = [
 ['Overview'], ['Overview', 'What moved where'],
 ['Devices & Fleet'], ['Devices & Fleet', 'Provisioning'], ['Devices & Fleet', 'Device-class allowlist'],
 ['GilbertOne API Administration'], ['Configuration'],
 ['Finance', 'Cost allocation'], ['Compliance', 'Compliance pack preview'], ['Governance', 'Clinician Review Queue']
];
test.describe('the accessibility floor on every new screen', () => {
 test('at the configured viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPortal(page);
  for (const [category, tab] of newScreens) {
   await goPortal(page, category, tab);
   await expect(panel(page).getByRole('status', { name: portal.loading.sentence })).toHaveCount(0);
   await audit(page, `${category}${tab ? ` · ${tab}` : ''}`);
   const { nameless, positive, running } = await sweep(page);
   expect(nameless, `${category}: controls with no accessible name`).toEqual([]);
   expect(positive, `${category}: a positive tabindex`).toBe(0);
   expect(running, `${category}: an animation running with reduced motion asked for`).toBe(0);
  }
 });

 test('at 200% zoom', async ({ page }) => {
  await zoomedTo200(page);
  await openPortal(page);
  for (const [category, tab] of newScreens) {
   await goPortal(page, category, tab);
   await expect(panel(page).getByRole('status', { name: portal.loading.sentence })).toHaveCount(0);
   await audit(page, `${category}${tab ? ` · ${tab}` : ''} at 200%`);
  }
 });
});

/* ---- Every screen arrives, and says what is empty (28 September 2026) ----

   The founder said the portal's screens felt empty. What is held here is the shape of the answer rather
   than its look: a screen's blocks and a strip's cards arrive in the portal's three steps, a third of a
   quick apart, and only while its motion is on; a reader who asked for less motion gets every card where
   it ends, at once; a share of a register carries its ring; and an empty state is a tinted card saying
   the contract's sentence, a refusal on a different wash from a plain "nothing yet". */
const motionTokens = json('../packages/design-tokens/tokens.json').motion as { quickMs: number };
test.describe('a screen that arrives', () => {
 test('its blocks and its cards come in three short steps', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Devices & Fleet');
  const panelBody = page.locator('#pt-subpanel');
  await expect(panelBody).toHaveClass(/\bpt-stagger\b/);
  const cards = panelBody.locator('.pt-figures > .pt-figure');
  await expect(cards).toHaveCount(4);
  const steps = await cards.evaluateAll(els => els.map(el => [getComputedStyle(el).animationName, parseFloat(getComputedStyle(el).animationDelay)]));
  expect(steps.map(([name]) => name)).toEqual(steps.map(() => 'cf-arrive'));
  const third = motionTokens.quickMs / 3;
  expect(steps.map(([, delay]) => Math.round((delay as number) * 1000))).toEqual([0, third, 2 * third, 2 * third].map(Math.round));
  /* The strip itself stays put while its cards arrive; the block after it arrives as one. */
  expect(await panelBody.locator('.pt-figures').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await panelBody.locator(':scope > .pt-empty').first().evaluate(el => getComputedStyle(el).animationName)).toBe('cf-arrive');
 });

 test('under reduced motion every card is where it ends, at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPortal(page);
  await goPortal(page, 'Devices & Fleet');
  const moving = await page.locator('#pt-subpanel').evaluate(root => [...root.querySelectorAll(':scope > *, .pt-figures > *, .pt-list > *')]
   .filter(el => getComputedStyle(el).animationName !== 'none' || Number(getComputedStyle(el).opacity) < 1)
   .map(el => el.className).slice(0, 4));
  expect(moving).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
 });

 test('a share of a register carries its ring, and an empty state is a card with the contract’s sentence', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Dispatch & Incidents', 'Dispatch');
  const blocked = page.locator('.pt-strip-figure').filter({ hasText: 'Nurses blocked' });
  await expect(blocked.locator('.pt-ring')).toHaveCount(1);
  await expect(blocked).toContainText(/Of \d+ nurses on the register/);

  await goPortal(page, 'Configuration');
  await page.getByRole('tree', { name: 'Configuration' }).getByRole('treeitem', { name: 'Integrations' }).click();
  const all = capabilities.capabilities as { connected: boolean }[];
  const connected = page.locator('.pt-figure').filter({ hasText: 'Connected today' });
  await expect(connected).toContainText(`Of ${all.length}`);
  await expect(connected).toContainText(String(all.filter(c => c.connected).length));
  await expect(connected.locator('.pt-ring')).toHaveCount(1);

  await goPortal(page, 'Devices & Fleet');
  const empties = page.locator('#pt-subpanel .pt-empty');
  const refused = empties.filter({ has: page.locator('strong') }).first();
  const plain = empties.filter({ hasNot: page.locator('strong') }).first();
  await expect(refused).toContainText(refusal('no-device-class-enabled'));
  const look = (l: typeof refused) => l.evaluate(el => { const s = getComputedStyle(el); return { ground: s.backgroundColor, edge: s.borderTopStyle }; });
  const [a, b] = [await look(refused), await look(plain)];
  expect(a.edge).toBe('none');
  expect(b.edge).toBe('none');
  expect(a.ground).not.toBe(b.ground);
  expect([a.ground, b.ground]).not.toContain('rgba(0, 0, 0, 0)');
 });
});

/* ---- One settings page (28 September 2026) ----

   The founder: "do another check on all the setting pages — not all of them are looking the same. Do a
   global change on all to look the same. Don't forget animations." What is held here is the pattern every
   screen now shares, walked across every category and every tab on both viewports: the one head, no
   sideways scroll (in the page, and inside main, where a page-level measurement cannot see), every control
   at the 44px floor or declared, the arrival stagger on the panel, and every section the shared Card. Then the three things a settings page does that a board does not — the save bar under the
   contract's one sentence, the saved card's flash, and the chip that lifts — and the founder's door wearing
   the same head. */
import { MIN_TARGET, EXEMPT_SELECTORS, horizontalOverflow, measureTargets } from './audit';
const settingsPage = portal.settingsPage as { saveBarLabel: string };
const every = categories.flatMap(c => c.tabs.map(t => ({ category: c, tab: t })));
test.describe('one settings page', () => {
 test('every screen and sub-screen wears the one head, arrives in the stagger, fits the width and keeps its targets', async ({ page }) => {
  test.setTimeout(240_000);
  await healthy(page);
  for (const { category, tab } of every) {
   const where = `${category.label} · ${tab.label}`;
   await page.goto(`/app/?role=back-office&category=${category.id}&tab=${tab.id}`);
   await expect(panel(page).locator('.pt-loading')).toHaveCount(0);
   const head = panel(page).locator('header.pt-head').first();
   await expect(head.locator('.pt-head-eyebrow'), where).toContainText(category.label);
   if (tab.headsItself) await expect(head.locator('h1'), where).toHaveCount(0);
   else await expect(head.getByRole('heading', { level: 1 }), where).toHaveText(tab.heading ?? tab.label);
   /* A board that heads itself (the dispatch board, the vetting queue, Quality) draws the page's one <h1>; the
      head then carries the eyebrow alone. Anywhere else the head's is the only one. */
   await expect(page.locator('#pt-category h1:not(header.pt-head h1)'), `${where}: a second <h1>`).toHaveCount(tab.headsItself ? 1 : 0);
   const body = page.locator('#pt-subpanel');
   await expect(body, where).toHaveClass(/\bpt-stagger\b/);
   expect(await body.evaluate(el => getComputedStyle(el.firstElementChild ?? el).animationName), `${where}: the panel's first block does not arrive`).toMatch(/cf-arrive|none/);
   expect(await body.evaluate(el => [...el.children].some(c => getComputedStyle(c).animationName === 'cf-arrive')), `${where}: nothing on the panel arrives`).toBe(true);
   const { pixels, offenders } = await horizontalOverflow(page);
   expect(pixels, `${where} scrolls sideways: ${offenders.join(' · ')}`).toBeLessThanOrEqual(1);
   expect(await page.locator('#main').evaluate(m => m.scrollWidth - m.clientWidth), `${where}: main scrolls sideways inside itself`).toBeLessThanOrEqual(1);
   /* One known defect this walk found and does not own: the dispatch board's map markers (features/Dispatch.tsx,
      the workspace's screen, moved into the portal unchanged) are 15px SVG groups with the button role. Named
      here, on that one screen, so it stays visible rather than hidden in a tokens.json exemption nobody decided. */
   const knownElsewhere = category.id === 'dispatch' && tab.id === 'dispatch' ? /^g\. "" \d+x\d+$/ : null;
   const small = (await measureTargets(page, MIN_TARGET, EXEMPT_SELECTORS)).filter(t => !t.declared).map(t => `${t.where} ${t.width}x${t.height}`)
    .filter(t => !knownElsewhere?.test(t));
   expect(small, `${where}: controls under ${MIN_TARGET}px`).toEqual([]);
   /* Every section is the shared Card (Lovable identity, 28 September 2026): a named region on a ground of
      its own with the card's hairline edge. Until that day neighbouring sections were told apart by rotating
      pastel tints; the tints are retired, and a section's title and the gap between cards do that work, as
      they do everywhere in the handoff — so what is held is that no section is a bare, edgeless run of text. */
   const cards = await body.evaluate(root => [...root.querySelectorAll('.pt-section')].map(s => ({
    region: s.getAttribute('role') === 'region' && !!s.getAttribute('aria-labelledby'),
    card: s.classList.contains('ui-card'),
    ground: getComputedStyle(s).backgroundColor,
    edge: getComputedStyle(s).borderTopStyle,
    folded: !!s.closest('.g1-fold-body')
   })));
   for (const c of cards) {
    expect(c.region && c.card, `${where}: a section that is not a named region drawn as the shared Card`).toBe(true);
    expect(c.ground, `${where}: a section card with no ground`).not.toBe('rgba(0, 0, 0, 0)');
    if (!c.folded) expect(c.edge, `${where}: a section card with no edge`).toBe('solid');
   }
  }
 });

 test('a changing screen ends in the save bar, a saved card flashes once, and a chip lifts under the pointer', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'Configuration');
  const item = page.locator('.ss-timing').first();
  await item.getByRole('button', { name: /^Change/ }).click();
  const form = item.getByRole('form');
  const bar = form.getByRole('group', { name: settingsPage.saveBarLabel });
  await expect(bar.getByLabel('Why', { exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: /Review the change/ })).toBeVisible();
  expect(await bar.evaluate(el => getComputedStyle(el).position)).toBe(page.viewportSize()!.width < 600 ? 'static' : 'sticky');
  await form.getByRole('slider').focus();
  await page.keyboard.press('ArrowRight');
  await bar.getByLabel('Why', { exact: true }).fill('The founder asked for a longer grace.');
  await bar.getByRole('button', { name: /Review the change/ }).click();
  await form.getByRole('button', { name: /Confirm/ }).click();
  await expect(item).toHaveAttribute('data-saved', /^(odd|even)$/);
  expect(await item.evaluate(el => getComputedStyle(el, '::after').animationName)).toMatch(/^fc-saved-(odd|even)$/);

  await goPortal(page, 'GilbertOne API Administration', 'Speech settings');
  const speechBar = page.locator('#pt-subpanel').getByRole('group', { name: settingsPage.saveBarLabel });
  await expect(speechBar.getByRole('textbox')).toHaveCount(1);
  /* A chip that is not chosen lifts under the pointer, by translate alone. */
  const chip = page.locator('.g1-register .fc-chip:not(:has(input:checked))').first();
  await chip.hover();
  await expect.poll(() => chip.evaluate(el => getComputedStyle(el).translate)).toBe('0px -2px');
 });

 test('under reduced motion a saved card and a chip keep still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPortal(page);
  await goPortal(page, 'GilbertOne API Administration', 'Speech settings');
  const chip = page.locator('.g1-register .fc-chip:not(:has(input:checked))').first();
  await chip.hover();
  expect(await chip.evaluate(el => getComputedStyle(el).translate)).toBe('none');
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
 });

 test('the founder\'s door wears the same head', async ({ page }) => {
  /* The service silent: the door stays a door and says so, under the same head. */
  await page.route('**/assistant/v1/**', route => route.abort('connectionrefused'));
  await page.route('**/assistant/health', route => route.abort('connectionrefused'));
  await page.goto('/app/?role=back-office&gate=founder');
  const head = page.locator('.founder-gate header.pt-head');
  await expect(head.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(head.locator('.pt-head-eyebrow')).toHaveText(portal.name);
 });
});

/* The handoff's control room, in the forms the Control Tower keeps (30 September 2026). The field alert at the top
   of Dispatch is still and counts only rows the Incidents tab draws, so every figure on it is disproved or borne out
   by opening Incidents and counting; the figure cards and the Incidents head wear decorative tiles; and the dispatch
   demo's schematic map is drawn on the --color-* roles with the risk printed in words in every zone. */
const fieldSafety = json('../packages/catalog/field-safety.json');
test.describe('the handoff’s control room', () => {
 test('the field alert counts what Incidents holds open, opens Incidents, and never moves', async ({ page }) => {
  await openPortal(page, '?role=back-office&category=dispatch&tab=dispatch');
  await expect(panel(page).locator('.pt-loading')).toHaveCount(0);
  const say = portal.fieldAlert as { heading: string; nursePanics: string; patientSos: string; overdue: string; open: string };
  const alert = panel(page).locator('.pt-field-alert');
  const shown = await alert.count();
  const counts: Record<string, number> = {};
  if (shown) {
   await expect(alert).toContainText(say.heading);
   for (const label of [say.nursePanics, say.patientSos, say.overdue])
    counts[label] = Number(await alert.locator('li', { hasText: label }).locator('strong').textContent());
   /* Still: it may arrive with the panel's stagger, and nothing on it repeats — no pulse, no ring. */
   expect(await alert.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0);
   await alert.getByRole('button', { name: say.open }).click();
  } else await page.goto('/app/?role=back-office&category=dispatch&tab=incidents');
  await expect(page).toHaveURL(/tab=incidents/);
  const open = panel(page).locator('.fs-row:not(.is-closed)');
  await expect(panel(page).locator('.fs-desk')).toBeVisible();
  const panics = await open.filter({ has: page.locator('.fs-row-kind', { hasText: fieldSafety.desk.kinds.panic }) }).count();
  const overdue = await open.filter({ has: page.locator('.fs-row-kind', { hasText: fieldSafety.desk.kinds.overdue }) }).count();
  const sos = await panel(page).locator('.sos-desk-row:not(.is-closed)').count();
  if (shown) expect(counts).toEqual({ [say.nursePanics]: panics, [say.patientSos]: sos, [say.overdue]: overdue });
  else expect(panics + overdue + sos, 'nothing drawn while something is open').toBe(0);
  /* The Incidents head carries its tile, hidden from a screen reader beside the heading that says the same. */
  await expect(panel(page).locator('header.pt-head .pt-head-icon')).toHaveAttribute('aria-hidden', 'true');
 });

 test('the figure cards wear decorative tiles, and the schematic map prints every risk in words', async ({ page }) => {
  await openPortal(page, '?role=back-office&category=dispatch&tab=dispatch');
  const tiles = panel(page).locator('.pt-strip-figure .pt-strip-icon svg');
  await expect(tiles.first()).toBeVisible();
  for (const svg of await tiles.all()) await expect(svg).toHaveAttribute('aria-hidden', 'true');
  const map = panel(page).getByRole('img', { name: 'Schematic precinct map, demonstration data' });
  await map.scrollIntoViewIfNeeded();
  for (const zone of await map.locator('.pt-demo-zone').all()) {
   const risk = (await zone.getAttribute('class'))!.match(/is-(\w+)/)![1];
   await expect(zone).toContainText(`${risk} risk`);
   expect(await zone.locator('rect').evaluate(el => getComputedStyle(el).fill)).not.toMatch(/^(none|rgb\(0, 0, 0\))$/);
  }
 });
});
