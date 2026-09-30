import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';
/* The existing patient screens rearranged to the Lovable export's layouts (30 September 2026): Privacy &
 * settings as one tabbed page, and whatever else of the slice has a layout worth holding. What is held is
 * what a restyle would most easily undo — the profile tab stays a notice rather than a form, the sentences
 * are the contracts', and nothing is wider than the phone. Both viewports. */
const read = (name: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${name}`, import.meta.url), 'utf8'));
const capabilities = read('capabilities.json').capabilities as { id: string; blockedBy: string[] }[];

const noSidewaysScroll = async (page: Page) => page.evaluate(() =>
  [document.documentElement, ...document.querySelectorAll('main')]
    .filter(el => el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`));

test('privacy and settings is one page in four tabs, and the profile is the notice rather than a form', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Privacy & settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Your data. Your choices.' })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Settings' });
  await expect(tabs.getByRole('tab')).toHaveText(['Profile', 'Preferences', 'Privacy', 'Language & access']);
  await expect(tabs.getByRole('tab', { name: 'Privacy' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^View access history/ })).toBeVisible();

  await tabs.getByRole('tab', { name: 'Profile' }).click();
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText(noticeFor('accounts'))).toBeVisible();
  for (const reason of capabilities.find(c => c.id === 'accounts')!.blockedBy) await expect(panel).toContainText(reason);
  /* No form, no photo, no Save, no SMS switch: the identity service is off and no SMS provider exists. */
  await expect(panel.getByRole('textbox')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /save|change photo|upload/i })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /sms/i })).toHaveCount(0);

  await tabs.getByRole('tab', { name: 'Preferences' }).click();
  await expect(page.getByRole('switch', { name: 'Care reminders' })).toHaveAttribute('aria-checked', 'true');
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('language and access is the settings page with its own tab chosen, under one h1', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Language & access');
  const tabs = page.getByRole('tablist', { name: 'Settings' });
  await expect(tabs.getByRole('tab', { name: 'Language & access' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 2, name: /Twelve official languages/ })).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(1);
  /* And back to the privacy rows from the same page, without leaving it. */
  await tabs.getByRole('tab', { name: 'Privacy' }).click();
  await expect(page.getByRole('button', { name: /^View access history/ })).toBeVisible();
});

/* Share part of your record in the export's two columns: building the link beside an aside that lists what a
   copy leaves out and every export format, built or not, each with the contract's reason. Nothing in the aside
   is a control — a format that is not built is a sentence, not a disabled button. */
test('sharing is two columns, and its formats are the contract’s, built and not built, each with its reason', async ({ page }) => {
  const sharing = read('passport-sharing.json');
  await page.goto('/app/?open=share-part-of-your-record');
  const aside = page.getByRole('complementary', { name: 'What a copy of your record leaves out' });
  await expect(aside).toBeVisible();
  for (const rule of sharing.export.exclusions) await expect(aside).toContainText(rule.sentence);
  const formats = aside.locator('.ps-formats li');
  await expect(formats).toHaveCount(sharing.export.formats.length);
  for (const [i, format] of (sharing.export.formats as { built: boolean; why: string }[]).entries()) {
    await expect(formats.nth(i)).toContainText(format.why);
    await expect(formats.nth(i)).toContainText(format.built ? 'Built' : 'Not built');
  }
  await expect(aside.getByRole('button').filter({ hasText: /PDF|Patient Summary|FHIR|download|export/i })).toHaveCount(0);
  const main = page.locator('.ps-main');
  const [m, a] = [await main.boundingBox(), await aside.boundingBox()];
  if ((page.viewportSize()?.width ?? 0) >= 1000) expect(a!.x).toBeGreaterThan(m!.x + m!.width - 1);
  else expect(a!.y).toBeGreaterThan(m!.y);
  expect(await noSidewaysScroll(page)).toEqual([]);
});

/* The emergency card as the aside, beside who may be told if you press SOS — a door to the next-of-kin sheet in
   Safety's words. No blood group, allergy or condition is typed into this screen: the card names categories. */
test('the emergency card is the aside, beside a door to next of kin', async ({ page }) => {
  const sharing = read('passport-sharing.json');
  const press = read('sos-press.json');
  await page.goto('/app/?open=your-emergency-card');
  const aside = page.getByRole('complementary', { name: sharing.screens.card.title });
  await aside.getByRole('button', { name: sharing.screens.card.make }).click();
  await expect(aside.locator('.emergency-card')).toBeVisible();
  await expect(page.locator('.ps-main')).toContainText(press.nextOfKin.intro);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.locator('.ps-main').getByRole('button', { name: press.nextOfKin.heading }).click();
  await expect(page.getByRole('dialog')).toContainText(press.nextOfKin.consent.wording);
  expect(await noSidewaysScroll(page)).toEqual([]);
});

/* Live well as the export's wellness hub: four doors to pages that exist, named in patient-pages.json's own
   words, and a banner whose one control opens the care tips — above the journal, which stays. Nothing here is a
   mood scale, a "talk to a professional" or a typed crisis number, and the export's slogan is not drawn. */
test('live well opens with four doors to real pages and a banner to the care tips, above the journal', async ({ page }) => {
  const pages = read('patient-pages.json').screens;
  await page.goto('/app/?open=live-well');
  const doors = page.getByRole('navigation', { name: 'More for your wellbeing' }).getByRole('button');
  await expect(doors).toHaveCount(4);
  for (const [i, id] of ['mental-health', 'health-library', 'community', 'activity'].entries()) await expect(doors.nth(i)).toContainText(pages[id].opens);
  await expect(page.getByText(/Progress, not perfection|mood check-in|talk to a professional/i)).toHaveCount(0);
  await expect(page.locator('.wb-banner img')).toHaveAttribute('alt', '');
  await expect(page.locator('.wb-banner')).toContainText('AI-generated illustrative image');
  /* The journal is still the screen: the banner and the doors sit above its composer. */
  const [banner, composer] = [await page.locator('.wb-banner').boundingBox(), await page.getByRole('button', { name: 'Write this down' }).boundingBox()];
  expect(banner!.y).toBeLessThan(composer!.y);
  expect(await noSidewaysScroll(page)).toEqual([]);
  await doors.nth(0).click();
  await expect(page.getByRole('heading', { name: pages['mental-health'].heading })).toBeVisible();
  await page.goto('/app/?open=live-well');
  await page.locator('.wb-banner').getByRole('button').click();
  await expect(page).toHaveTitle(/^Care tips/);
});
