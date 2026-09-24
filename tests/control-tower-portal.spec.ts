import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, zoomedTo200 } from './audit';
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
  const pin = kept.locator('[role="button"][aria-pressed="false"]').first();
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
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
  await expect(page.locator('#pt-category table').first().locator('tbody tr')).toHaveCount(section('open-gates').gates.length);
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

 test('GilbertOne API Administration carries its mark and says it is not built — Phase 4', async ({ page }) => {
  await openPortal(page);
  await goPortal(page, 'GilbertOne API Administration');
  await expect(panel(page).getByRole('img', { name: 'GilbertOne' })).toBeVisible();
  await expect(panel(page)).toContainText(portal.gilbertone.sentence);
  await expect(panel(page)).toContainText(refusal('no-gilbertone-sub-screen-before-phase-4'));
  await expect(panel(page).locator('.pt-list li')).toHaveCount(portal.gilbertone.subScreens.length);
  await expect(page.locator('#pt-subpanel').getByRole('button')).toHaveCount(0);
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
const sweep = (page: Page) => page.evaluate(() => {
 const nameless = [...document.querySelectorAll<HTMLElement>('#pt-category button, #pt-category a[href], #pt-category input, #pt-category select, [role="tab"], [role="treeitem"], .pt-context select')]
  .filter(el => el.getClientRects().length)
  .filter(el => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent?.trim()
   || el.closest('label')?.textContent?.trim() || [...((el as HTMLInputElement).labels ?? [])].some(l => l.textContent?.trim())))
  .map(el => el.outerHTML.slice(0, 80));
 const positive = [...document.querySelectorAll('[tabindex]')].filter(el => Number(el.getAttribute('tabindex')) > 0).length;
 const running = document.getAnimations().filter(a => a.playState === 'running').length;
 return { nameless, positive, running };
});

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
