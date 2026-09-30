import { expect, test, type Page } from '@playwright/test';
import { goSection } from './nav';

/* The patient's shell in the Lovable export's arrangement (30 September 2026): the sidebar's labelled groups
 * that fold, the top bar's search and profile chip, Log out at the sidebar's foot, the footer's Privacy, and
 * the bell's ring that plays once. What is held is the behaviour and the refusals, never the look — and the
 * two promises every other journey in this suite leans on: Overview is the first button in the navigation and
 * Explore MyThuso the last, and every section that existed before the groups is still reached by goSection on
 * both viewports. */

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const isWide = async (page: Page) => sidebar(page).isVisible();

/* Every destination the flat sidebar and its foot carried before the groups, plus Help & support, which was
   the help card's. Each one's screen sets the document's title to its own name (App.tsx), which is what is
   asserted — a heading would differ screen by screen. */
const before = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'Live well', 'My family', 'Care plans',
 'Thuso Wallet', 'Your health', 'Explore MyThuso', 'Privacy & settings', 'Language & access', 'Help & support'];

test('every section that existed before the groups is still reachable by name', async ({ page }) => {
 test.setTimeout(90_000);
 await page.goto('/app/');
 for (const name of before) {
  await goSection(page, name);
  await expect(page).toHaveTitle(`${name} · MyThuso`);
 }
});

test('the navigation starts at Overview and ends at Explore, whatever the language', async ({ page }) => {
 await page.goto('/app/');
 test.skip(!(await isWide(page)), 'The sidebar is drawn from 1000px; a phone has the tab bar and the More hub.');
 const buttons = sidebar(page).getByRole('button');
 await expect(buttons.first()).toHaveAccessibleName('Overview');
 await expect(buttons.last()).toHaveAccessibleName('Explore MyThuso');
 /* The visit count is the only figure on the rows, and it is counted from the visit list. */
 await expect(sidebar(page).getByRole('button', { name: /^My visits \d+$/ })).toBeVisible();
 await expect(sidebar(page).getByRole('button', { name: /Messages \d/ })).toHaveCount(0);
});

test('a group folds and unfolds by keyboard, and the page you are on opens its group again', async ({ page }) => {
 await page.goto('/app/');
 test.skip(!(await isWide(page)), 'The groups are the sidebar\'s; a phone has the tab bar and the More hub.');
 const health = sidebar(page).getByRole('button', { name: 'My Health' });
 const trends = sidebar(page).getByRole('button', { name: 'Health trends', exact: true });
 /* Every group starts open, so no destination is behind a heading nobody has pressed. */
 for (const toggle of await sidebar(page).locator('[aria-expanded]').all()) await expect(toggle).toHaveAttribute('aria-expanded', 'true');
 await expect(trends).toBeVisible();

 await health.focus();
 await page.keyboard.press('Enter');
 await expect(health).toHaveAttribute('aria-expanded', 'false');
 await expect(trends).toBeHidden();
 await page.keyboard.press('Space');
 await expect(health).toHaveAttribute('aria-expanded', 'true');
 await expect(trends).toBeVisible();

 /* Folded, then arrived at from somewhere else: the group holding the page opens itself. */
 await health.click();
 await expect(trends).toBeHidden();
 await page.getByRole('region', { name: 'Your health over time' }).getByRole('button', { name: 'Every reading, as charts and tables' }).click();
 await expect(page).toHaveTitle('Health trends · MyThuso');
 await expect(health).toHaveAttribute('aria-expanded', 'true');
 await expect(trends).toHaveAttribute('aria-current', 'page');
});

test('the top bar searches the catalogue, and a phone is not given a field it cannot fit', async ({ page }) => {
 await page.goto('/app/');
 const search = page.getByRole('searchbox', { name: 'Search care and services' });
 if (!(await page.getByRole('search', { name: 'Search care' }).isVisible())) {
  await expect(search).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  return;
 }
 await search.fill('wound');
 /* One query: the home's own field reads the same one. */
 await expect(page.getByRole('textbox', { name: 'Search for care' })).toHaveValue('wound');
 await search.press('Enter');
 await expect(page.getByRole('textbox', { name: 'Search services' })).toHaveValue('wound');
 await expect(page.locator('.catalog-grid .service-card')).toHaveCount(1);
 await expect(page.locator('.catalog-grid .service-card').first()).toContainText('Wound care');
});

test('the profile chip names who is signed in and opens the profile', async ({ page }) => {
 await page.goto('/app/');
 const button = page.getByRole('button', { name: 'Your profile', exact: true });
 await expect(button).toHaveCount(1);
 const box = (await button.boundingBox())!;
 expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
 expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
 if (await isWide(page)) {
  const chip = page.locator('.psb-profile');
  await expect(chip).toContainText('Lerato Molefe');
  /* The whole chip is the target: pressing where the name is drawn opens the profile too. The button's hit
     area lies over the caption, so the press is made by position rather than on the caption itself. */
  const name = (await chip.getByText('Lerato Molefe').boundingBox())!;
  await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
 } else await button.click();
 await expect(page.getByRole('dialog').getByRole('heading', { name: 'Lerato Molefe' })).toBeVisible();
});

test('Log out at the foot of the sidebar signs out', async ({ page }) => {
 await page.goto('/app/');
 test.skip(!(await isWide(page)), 'On a phone Log out is the More hub\'s last row, which admin-and-session.spec.ts walks.');
 const foot = page.locator('.sidebar-bottom');
 /* The emergency row and the language stay above it, the language first among the settings links. */
 await expect(foot.getByRole('button', { name: 'Emergency & urgent care' })).toBeVisible();
 await expect(page.locator('button.settings-link').first()).toContainText('Language');
 await foot.getByRole('button', { name: 'Log out' }).click();
 await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
 await expect(sidebar(page)).toBeHidden();
});

test('the footer opens Privacy & settings and Help, and offers no Terms it cannot open', async ({ page }) => {
 await page.goto('/app/');
 test.skip(!(await isWide(page)), 'A phone has the tab bar where the footer would be.');
 const footer = page.locator('.app-footer');
 await expect(footer.getByRole('button', { name: /Terms/ })).toHaveCount(0);
 await footer.getByRole('button', { name: 'Privacy & settings' }).click();
 await expect(page).toHaveTitle('Privacy & settings · MyThuso');
 await footer.getByRole('button', { name: 'Help & support' }).click();
 await expect(page).toHaveTitle('Help & support · MyThuso');
});

test('the bell rings once on arrival and not at all for a reader who asked for stillness', async ({ page }) => {
 await page.goto('/app/');
 const dot = page.locator('.notification-button .psb-ring');
 const rings = () => dot.evaluate(el => el.getAnimations().map(a => String((a.effect as KeyframeEffect).getTiming().iterations)));
 /* Finite: one iteration, never Infinity, and gone once it has played. */
 const first = await rings();
 expect(first.every(n => n === '1')).toBe(true);
 await expect.poll(async () => (await rings()).length, { timeout: 5000 }).toBe(0);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.reload();
 await expect(dot).toBeAttached();
 expect(await rings()).toEqual([]);
});

test('nothing in the chrome scrolls sideways at 320px', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 700 });
 await page.goto('/app/');
 expect(await page.evaluate(() => {
  const main = document.querySelector('main')!;
  return document.documentElement.scrollWidth <= window.innerWidth && main.scrollWidth <= main.clientWidth;
 })).toBe(true);
});
