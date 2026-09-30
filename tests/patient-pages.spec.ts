import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The eight patient pages of the full Lovable export's Phase D and their "Your health" hub.
 *
 * What is held here is the journey and what the screens refuse, never how they look: the More hub
 * holds the door on a phone and the address holds it everywhere; every shortcut opens its own page;
 * every page says packages/catalog/patient-pages.json's own words and carries the refusals and the
 * review notice beside them; the symptom checker asks symptom-intake.json's set questions through
 * packages/gilbertone's intake, writes the note the nurse reads, and an emergency word ends it
 * before any note is taken and opens the emergency screen; the library searches what the knowledge
 * base actually carries; the derived pages render their derivations and their empty states say why;
 * every control is a 44px target; nothing scrolls sideways; and the cards' entrance is transform
 * and opacity, ends, and never happens for a reader who asked for stillness. Every sentence
 * asserted is read from the contracts, so a reworded page changes this test's expectations rather
 * than breaking it. */
const contract = JSON.parse(readFileSync(new URL('../packages/catalog/patient-pages.json', import.meta.url), 'utf8'));
const intake = JSON.parse(readFileSync(new URL('../packages/catalog/symptom-intake.json', import.meta.url), 'utf8'));
const emergencyTerms = JSON.parse(readFileSync(new URL('../packages/catalog/gilbert-emergency-terms.json', import.meta.url), 'utf8'));
const conditions = JSON.parse(readFileSync(new URL('../packages/catalog/knowledge/conditions.json', import.meta.url), 'utf8'));

/* The router matches `?open=` against lib/roles.ts's slugOfSection, so the address carries the slug. */
const at = (name: string) => `/app/?open=${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const words = contract.screens['symptom-checker'];
const group = intake.groups[0];
const common = intake.common.questions;
const emergencyWord = emergencyTerms.groups.find((g: { id: string }) => g.id === 'unresponsive').words[0];
const hubHeading = () => contract.hub.heading;

/* The More hub is the phone's overflow: below the sidebar breakpoint its "More" tab is the door.
   Above it, the address is the door — the same one the landing page's hero would use. */
async function openHub(page: Page) {
 await page.goto('/app/');
 const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
 if (await sidebar.isVisible()) { await page.goto(at(contract.hub.opens)); return; }
 await page.locator('.tabbar button').last().click();
 await page.locator('.menu-row').filter({ hasText: contract.hub.opens }).first().click();
}

test('the More hub holds the door to Your health, and every shortcut opens its own page', async ({ page }) => {
 await openHub(page);
 await expect(page.getByRole('heading', { level: 1, name: hubHeading() })).toBeVisible();
 await expect(page.getByText(contract.hub.lead)).toBeVisible();
 await expect(page.getByText(contract.review.notice)).toBeVisible();

 const shortcuts = page.locator('.pp-shortcut');
 await expect(shortcuts).toHaveCount(contract.hub.shortcuts.length);
 for (const shortcut of contract.hub.shortcuts) {
  await expect(shortcuts.filter({ hasText: shortcut.title }).first()).toContainText(shortcut.sub);
  const box = await shortcuts.filter({ hasText: shortcut.title }).first().boundingBox();
  expect(Math.round(box!.height), `shortcut ${shortcut.id} height`).toBeGreaterThanOrEqual(44);
 }
 /* Each shortcut opens the page it names, headed with that page's own heading. */
 for (const shortcut of contract.hub.shortcuts) {
  await page.locator('.pp-shortcut').filter({ hasText: shortcut.title }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: contract.screens[shortcut.id].heading })).toBeVisible();
  await openHub(page);
  await expect(page.getByRole('heading', { level: 1, name: hubHeading() })).toBeVisible();
 }
});

test('every page says the contract\u2019s words and carries the refusals and the review notice', async ({ page }) => {
 for (const id of Object.keys(contract.screens)) {
  const screen = contract.screens[id];
  await page.goto(at(screen.opens));
  await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
  await expect(page.locator('.page-intro p').first()).toHaveText(screen.lead);
  /* The aside is the page's honesty: what these pages will not do, and who has not signed them. */
  const aside = page.locator('.pp-about');
  await expect(aside.getByRole('heading', { name: contract.aside.refusalsHeading })).toBeVisible();
  for (const refusal of contract.refusals)
   await expect(aside.locator('.pp-refusals li').filter({ hasText: refusal.sentence })).toHaveCount(1);
  await expect(aside.locator('.pp-review')).toContainText(contract.review.notice);
  /* Nothing scrolls sideways, at either viewport. */
  const sideways = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('main, .pp-screen, .pp-layout, .pp-main')]
   .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className));
  expect(sideways, `${id} scrolls sideways`).toEqual([]);
 }
});

test('the symptom checker asks the intake\u2019s own questions and writes the note the nurse reads', async ({ page }) => {
 await page.goto(at(words.opens));
 await expect(page.locator('.pp-picker-label')).toHaveText(words.pickerLabel);
 const chips = page.locator('.pp-chips .pp-chip');
 await expect(chips).toHaveCount(intake.groups.length);
 for (const control of await page.locator('.pp-chip, .pp-actions button, .pp-stop').all()) {
  const box = await control.boundingBox();
  /* Rounded: a 44px box can measure 43.99997 in a fractional layout. */
  expect(Math.round(box!.height), 'control height').toBeGreaterThanOrEqual(44);
 }

 await chips.filter({ hasText: group.name }).first().click();
 /* The common questions first, exactly as the intake orders them: two chips, then a free answer. */
 await expect(page.locator('.pp-question')).toHaveText(common[0].ask);
 await expect(page.locator('.pp-progress')).toContainText(words.progressLabel);
 await expect(page.locator('.pp-count')).toHaveText(/^\d+\/\d+$/);
 await page.getByRole('button', { name: common[0].options[0], exact: true }).click();
 await expect(page.locator('.pp-question')).toHaveText(common[1].ask);
 await page.getByRole('button', { name: common[1].options[0], exact: true }).click();
 await expect(page.locator('.pp-question')).toHaveText(common[2].ask);
 await page.getByLabel(common[2].ask).fill('Lying down helps');
 await page.getByRole('button', { name: words.sendLabel, exact: true }).click();

 /* Stopping early is a note, not a loss: the answers so far are on the card. */
 await page.getByRole('button', { name: words.stopLabel, exact: true }).click();
 await expect(page.getByRole('heading', { name: words.handover.heading })).toBeVisible();
 await expect(page.getByText(words.handover.detail)).toBeVisible();
 await expect(page.getByText(words.stoppedNote)).toBeVisible();
 const notes = page.locator('.pp-notes > div');
 await expect(notes).toHaveCount(3);
 await expect(notes.first().locator('dt')).toHaveText(common[0].ask);
 await expect(notes.first().locator('dd')).toHaveText(common[0].options[0]);
 await expect(notes.last().locator('dd')).toHaveText('Lying down helps');
 await expect(page.getByRole('button', { name: words.handover.copyLabel })).toBeVisible();
 /* The doors out of the checker: the booking, and GilbertOne himself. */
 await expect(page.getByRole('button', { name: words.actions[0].label })).toBeVisible();
 await page.getByRole('button', { name: words.handover.againLabel, exact: true }).click();
 await expect(page.locator('.pp-picker-label')).toHaveText(words.pickerLabel);
});

test('an emergency word ends the checker before any note and opens the emergency screen', async ({ page }) => {
 await page.goto(at(words.opens));
 await page.locator('.pp-chip').filter({ hasText: group.name }).first().click();
 await page.getByRole('button', { name: common[0].options[0], exact: true }).click();
 await page.getByRole('button', { name: common[1].options[0], exact: true }).click();
 await page.getByLabel(common[2].ask).fill(emergencyWord);
 await page.getByRole('button', { name: words.sendLabel, exact: true }).click();

 const alert = page.locator('.pp-emergency');
 await expect(alert).toBeVisible();
 await expect(alert.getByRole('heading', { name: words.emergency.heading })).toBeVisible();
 await expect(alert).toContainText(words.emergency.detail);
 /* No note was taken: the emergency answer ends the intake with no state at all. */
 await expect(page.locator('.pp-notes')).toHaveCount(0);
 await expect(page.locator('.pp-picker, .pp-ask')).toHaveCount(0);

 await alert.getByRole('button', { name: words.emergency.action }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.getByText('10177').first()).toBeVisible();
});

test('Ask GilbertOne opens the orb without the page holding his state', async ({ page }) => {
 await page.goto(at(words.opens));
 await expect(page.locator('.as-launcher')).toHaveAttribute('aria-expanded', 'false');
 await page.locator('.pp-actions').getByRole('button', { name: words.actions[1].label }).click();
 await expect(page.locator('.as-launcher')).toHaveAttribute('aria-expanded', 'true');
});

test('the library searches what the knowledge base actually carries', async ({ page }) => {
 const library = contract.screens['health-library'];
 await page.goto(at(library.opens));
 const tabs = page.locator('.pp-tab');
 await expect(tabs).toHaveCount(library.tabs.length);
 for (let i = 0; i < library.tabs.length; i++) await expect(tabs.nth(i)).toHaveText(library.tabs[i].label);
 await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
 expect(await page.locator('.pp-entry').count()).toBeGreaterThan(0);
 await expect(page.locator('.pp-source').first()).toContainText('Source:');

 /* The hit is derived from the base's own first entry, never typed from memory. */
 const entries = Array.isArray(conditions) ? conditions : conditions.entries;
 const first = entries[0];
 const word = first.title.split(/\s+/).find((w: string) => w.length > 4).toLowerCase();
 const search = page.locator('.pp-search input');
 await search.fill(word);
 await expect(page.locator('.pp-entry-title').filter({ hasText: first.title }).first()).toBeVisible();
 await search.fill('qqqzzzxxx');
 await expect(page.locator('.pp-empty h3')).toHaveText(library.emptyTitle);
 await expect(page.locator('.pp-empty p')).toHaveText(library.emptyDetail);

 await search.fill('');
 await tabs.nth(3).click();
 await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
 expect(await page.locator('.pp-entry').count()).toBeGreaterThan(0);
});

test('the derived pages render their derivations, and the empty states say why', async ({ page }) => {
 const vaccinations = contract.screens.vaccinations;
 await page.goto(at(vaccinations.opens));
 /* The screens ride a lazy chunk: wait for the page's own heading before counting anything. */
 await expect(page.getByRole('heading', { level: 1, name: vaccinations.heading })).toBeVisible();
 expect(await page.locator('.pp-entry').count()).toBeGreaterThan(0);
 await expect(page.locator('.pp-record')).toContainText(vaccinations.record.emptyTitle);
 await expect(page.locator('.pp-record')).toContainText(vaccinations.record.emptyDetail);
 await expect(page.getByText(vaccinations.roadToHealth)).toBeVisible();

 const community = contract.screens.community;
 await page.goto(at(community.opens));
 await expect(page.getByRole('heading', { level: 1, name: community.heading })).toBeVisible();
 expect(await page.locator('.pp-entry').count()).toBeGreaterThan(0);
 const lines = await page.locator('.pp-helplines li').count();
 expect(lines).toBeGreaterThan(0);
 expect(lines).toBeLessThanOrEqual(contract.derivations.communityHelplines.limit);
 await expect(page.locator('.pp-notconnected')).toContainText(community.notConnected.heading);

 const nutrition = contract.screens.nutrition;
 await page.goto(at(nutrition.opens));
 await expect(page.getByRole('heading', { level: 1, name: nutrition.heading })).toBeVisible();
 expect(await page.locator('.pp-entry').count()).toBeGreaterThan(0);
 await expect(page.locator('.pp-inline-refusals li')).toHaveCount(nutrition.refusals.length);

 const reminders = contract.screens.reminders;
 await page.goto(at(reminders.opens));
 await expect(page.locator('.pp-row')).toHaveCount(reminders.kinds.length);
 await expect(page.locator('.pp-empty h3')).toHaveText(reminders.emptyTitle);

 const timeline = contract.screens['health-timeline'];
 await page.goto(at(timeline.opens));
 await expect(page.locator('.pp-timeline-item')).toHaveCount(timeline.kinds.length);
 await expect(page.locator('.pp-empty h3')).toHaveText(timeline.emptyTitle);

 const risk = contract.screens['risk-assessment'];
 await page.goto(at(risk.opens));
 await expect(page.locator('.pp-blocked')).toContainText(risk.blocked.heading);
 await expect(page.locator('.pp-row')).toHaveCount(risk.wouldCover.rows.length);
});

test('the cards rise once and settle; under reduced motion they are simply there', async ({ page }) => {
 const moving = () => page.evaluate(() => document.getAnimations()
  .filter(a => a.playState === 'running')
  .filter(a => { const t = (a.effect as KeyframeEffect | null)?.target; return t instanceof Element && !!t.closest('.pp-shortcut, .pp-entry, .pp-row, .pp-timeline-item'); })
  .map(a => (a as Animation & { animationName?: string }).animationName ?? 'script'));

 await page.goto(at(contract.hub.opens));
 await expect(page.locator('.pp-shortcut').first()).toBeVisible();
 /* The entrance is transform and opacity, never a blur, and it ends. */
 const properties = await page.evaluate(() => [...new Set(document.getAnimations()
  .filter(a => (a as Animation & { animationName?: string }).animationName === 'pp-in')
  .flatMap(a => (a.effect as KeyframeEffect).getKeyframes().flatMap(k => Object.keys(k)))
  .filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))]);
 expect(properties.length).toBeGreaterThan(0);
 for (const p of properties) expect(['opacity', 'transform']).toContain(p);
 await expect.poll(moving).toEqual([]);
 expect(await page.locator('.pp-shortcut').first().evaluate(el => getComputedStyle(el).opacity)).toBe('1');

 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto(at(contract.hub.opens));
 await expect(page.locator('.pp-shortcut').first()).toBeVisible();
 expect(await moving()).toEqual([]);
 expect(await page.locator('.pp-shortcut').first().evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});


/* The desktop sidebar carries its own door now (Wave 3): a "Your health" row beside the other
   destinations, so on a wide screen the eight pages are reachable by name and not only through the
   address or the phone's More tab — the reason the founder could not see them was that the only
   click-path was the overflow. Clicking the row opens the same hub the address does. Explore MyThuso
   stays the last row, because tests/deep-journeys.spec.ts reaches it by position and cannot name it
   once the shell is in isiZulu. */
test('the desktop sidebar carries a working door to Your health, and Explore stays last', async ({ page }) => {
 await page.goto('/app/');
 const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
 test.skip(!(await sidebar.isVisible()), 'the sidebar is the desktop door; a phone uses the More tab');
 await sidebar.getByRole('button', { name: contract.hub.opens, exact: true }).click();
 await expect(page.getByRole('heading', { level: 1, name: hubHeading() })).toBeVisible();
 await expect(sidebar.getByRole('button').last()).toContainText(/Explore|Hlola/);
});
