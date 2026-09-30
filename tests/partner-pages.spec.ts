import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The partner's boards in the Lovable export's arrangement (30 September 2026, builder S3), on both
 * viewports: the fourth tile, Orders as master and detail, a track on every result, the repeats summary
 * and the sealed bags to hand over. What stays refused: no patient on a pharmacy's board (medicines.json's
 * partnerQueue.neverCarries), no Approve or Decline on a substitution, no invented handover time. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const medicines = json('../packages/catalog/medicines.json');
const main = (page: Page) => page.locator('main .cl-chapter');
/* The fixture patients' names — none may appear on the partner's boards. */
const names = ['Lerato Molefe', 'Thabo Molefe', 'Nomsa Molefe'];

test.beforeEach(async ({ page }) => { await openWorkspace(page, 'Partner'); });

test('Orders counts what is yours, and a row chooses the order its chain stands beside', async ({ page }) => {
  const yours = main(page).locator('.fulfil-row').filter({ hasText: 'Yours' });
  const tile = main(page).locator('.s-metric').filter({ hasText: 'Yours to act on' });
  await expect(tile.locator('.s-metric-value')).toHaveText(String(await yours.count()));
  const panel = main(page).locator('.rq-case');
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('RX-0081');
  await expect(panel.getByRole('list', { name: /Where RX-0081 is/ }).getByRole('listitem')).toHaveCount(3);
  await main(page).locator('.fulfil-row').filter({ hasText: 'LAB-0019' }).click();
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('LAB-0019');
  await panel.getByRole('button', { name: 'Open the laboratory order' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  for (const name of names) await expect(main(page).locator('.dp-split')).not.toContainText(name);
  await expect(panel).toContainText(medicines.partnerQueue.why.split('. ')[0]);
});

test('Results carries a track on every row and names no patient', async ({ page }) => {
  await goSection(page, 'Results');
  const rows = main(page).locator('.fulfil-row');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(main(page).locator('.fo-track')).toHaveCount(await rows.count());
  for (const name of names) await expect(main(page).locator('.fulfil-list')).not.toContainText(name);
});

test('Substitution & repeats opens on a summary that reads and does not approve', async ({ page }) => {
  await goSection(page, 'Substitution & repeats');
  const summary = main(page).getByRole('list', { name: 'Items on the script' });
  expect(await summary.getByRole('listitem').count()).toBeGreaterThan(1);
  await expect(main(page).locator('.dp-page').getByRole('button', { name: /Approve|Decline/ })).toHaveCount(0);
});

test('Collections lists sealed bags by custody state and says nothing is collected', async ({ page }) => {
  await goSection(page, 'Collections');
  const bags = main(page).getByRole('region', { name: 'Sealed bags to hand over' });
  await expect(bags).toContainText(noticeFor('medicine-collection'));
  await expect(bags).toContainText(medicines.custody.states[0].label.toLowerCase());
  await expect(bags.getByRole('button', { name: /hand over/i })).toHaveCount(0);
});
