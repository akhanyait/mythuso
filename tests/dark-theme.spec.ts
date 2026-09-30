import { test, expect, type Page } from '@playwright/test';
import { lowContrast } from './audit';
import { goPortal, goSection } from './nav';

/* The dark theme on the older sheets, and the wordmark that follows the page (30 September 2026).
 *
 * Every screen older than the Lovable handoff is written in --charcoal, --faint, --surface and their
 * siblings, which had one value each, measured on white. In the dark theme that drew dark headings on
 * the dark ground, white panels under pale words and a not-connected notice nobody could read, on every
 * staff page and most of the patient's. shells/shells.css now answers those names for the dark theme as
 * aliases of the --color-* roles; what is held here is what the source cannot show — that every word on a
 * representative set of screens per role, the headings, the body, the notices and the panels, clears its
 * AA floor against the ground the browser actually paints behind it, on both viewports.
 *
 * And the wordmark: the reversed lockup for [data-theme="dark"], the ink one for "light" and for no
 * attribute — the three states the tokens answer, where no attribute is light because the page never
 * follows the operating system (lib/theme.ts). A dark OS must not change it. */

const dark = async (page: Page) => {
 await page.getByRole('button', { name: 'Dark theme' }).first().click();
 await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
};

/* Read the whole screen, and say which words fell short if any did. */
const clears = async (page: Page, where: string, { notice = false } = {}) => {
 await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
 const { failures, measured, notices } = await lowContrast(page);
 expect(measured, `${where}: nothing was measured, so nothing was proved`).toBeGreaterThan(10);
 if (notice) expect(notices, `${where}: the not-connected notice was not among the words measured`).toBeGreaterThan(0);
 expect(failures, `${where}, in the dark theme: words under their contrast floor`).toEqual([]);
};

test.beforeEach(async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 /* Headless speech stalls a second click (tests/assistant.spec.ts); nothing here speaks, but the shell loads it. */
 await page.addInitScript(() => { try { Object.defineProperty(window, 'speechSynthesis', { value: { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} } }); } catch { /* already defined */ } });
});

test('the patient: every word clears its floor on the dark ground', async ({ page }) => {
 await page.goto('/app/');
 await dark(page);
 await clears(page, 'Overview');
 for (const [name, notice] of [['My visits', true], ['Book a nurse', false], ['Thuso Wallet', true], ['Your health', false],
  ['Live well', false], ['My family', false], ['Arrival', true], ['Privacy & settings', false]] as const) {
  await goSection(page, name);
  await clears(page, name, { notice });
 }
 await goSection(page, 'Health Passport');
 await clears(page, 'Health Passport', { notice: true });
 for (const tab of ['Vitals', 'Results', 'Medications', 'Records']) {
  await page.locator('main').getByRole('tab', { name: tab, exact: true }).click();
  await expect(page.locator('main').getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
  await clears(page, `Health Passport · ${tab}`);
 }
 /* A dialog is drawn on the dark ground too: the emergency screen is the one it matters most on. */
 await page.goto('/app/');
 await dark(page);
 const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
 if (await sidebar.isVisible()) await page.locator('.sos-link').click();
 else await goSection(page, 'Emergency & urgent care');
 const sos = page.locator('dialog.modal[open]');
 await expect(sos).toBeVisible();
 await expect(sos).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
 await expect(sos.getByText('10177').first()).toBeVisible();
 const { failures } = await lowContrast(page);
 expect(failures, 'the emergency dialog, in the dark theme').toEqual([]);
});

test('the nurse: headings, notices and panels clear their floor on the dark ground', async ({ page }) => {
 await page.goto('/app/?role=nurse');
 await dark(page);
 await clears(page, 'Schedule');
 for (const name of ['Team', 'Earnings & payouts', 'Thuso Kit', 'Academy', 'Messages']) {
  await goSection(page, name);
  await clears(page, name, { notice: true });
 }
 /* "Who the roster carries" stood on the page ground in the ink it was given for a white panel. */
 await goSection(page, 'Team');
 await expect(page.locator('main').getByRole('heading', { name: 'Who the roster carries' })).toBeVisible();
});

test('the doctor and the partner clear their floor on the dark ground', async ({ page }) => {
 await page.goto('/app/?role=doctor');
 await dark(page);
 await clears(page, 'Review queue');
 for (const name of ['Patient context', 'Per-case fees']) {
  await goSection(page, name);
  await clears(page, name);
 }
 await page.goto('/app/?role=partner');
 await dark(page);
 await clears(page, 'Orders', { notice: true });
 await goSection(page, 'Collections');
 await clears(page, 'Collections');
});

test('the Control Tower’s first two categories clear their floor on the dark ground', async ({ page }) => {
 await page.goto('/app/?role=control-tower');
 await dark(page);
 for (const category of ['Overview', 'Dispatch & Incidents']) {
  await goPortal(page, category);
  await clears(page, category);
 }
});

/* The lockup a page draws is the one whose image is displayed; the other is display:none, which also
   keeps it out of the accessibility tree, so exactly one "MyThuso" is ever announced per place. */
const drawn = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.wordmark img')]
 .filter(img => getComputedStyle(img).display !== 'none').map(img => new URL(img.src).pathname));
const lockups = (page: Page) => page.evaluate(() => document.querySelectorAll('.wordmark').length);

for (const path of ['/landing.html', '/app/', '/app/?role=nurse']) {
 test(`${path}: the wordmark follows the page's theme, never the system's`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const reversedAsked: string[] = [];
  page.on('request', request => { if (request.url().includes('mythuso-logo-reversed.svg')) reversedAsked.push(request.url()); });
  await page.goto(path);
  await expect(page.locator('.wordmark').first()).toBeAttached();
  const places = await lockups(page);
  /* No attribute: light, whatever the operating system prefers. */
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await drawn(page)).toEqual(Array(places).fill('/brand/mythuso-logo.svg'));
  /* A page that stays light never asks for the lockup it is not drawing. */
  expect(reversedAsked).toEqual([]);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  expect(await drawn(page)).toEqual(Array(places).fill('/brand/mythuso-logo.svg'));
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await dark(page);
  expect(await drawn(page)).toEqual(Array(places).fill('/brand/mythuso-logo-reversed.svg'));
  const visible = page.locator('.wordmark img:visible').first();
  if (await visible.count()) {
   await expect(visible).toHaveAttribute('src', '/brand/mythuso-logo-reversed.svg');
   await expect(visible).toHaveJSProperty('complete', true);
   expect(await visible.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: 'Light theme' }).first().click();
  expect(await drawn(page)).toEqual(Array(places).fill('/brand/mythuso-logo.svg'));
 });
}
