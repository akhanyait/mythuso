import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noticeFor } from './nav';

/* Somebody paying for somebody else's care, from the payer's side.
 *
 * Two halves, and the second one is the feature. A sponsor sees that care happened, when, and what
 * it cost. They never see why the visit happened, what was found, or whether anything needs
 * following up — and whether the line even names the service is the recipient's switch, not
 * theirs. This walks the statement and then asserts, one by one, the four things the contract says
 * a sponsor never sees, because those are the sentences a tidy-up removes first.
 *
 * Not one amount is typed on the screen or in this file. A statement line names a service; what it
 * cost is that service's price in services.json, which is what the recipient would have been quoted
 * if she were paying herself. The figures below are computed here the same way, so a screen that
 * started carrying its own numbers would fail rather than merely disagree. */

const catalogue = JSON.parse(readFileSync(new URL('../packages/catalog/services.json', import.meta.url), 'utf8'));
const programmes = JSON.parse(readFileSync(new URL('../packages/catalog/programmes.json', import.meta.url), 'utf8'));
const statement = programmes.statement;
const priceOf = (id: string) => catalogue.find((s: { id: string }) => s.id === id).price;
const spent: number = statement.lines.reduce((total: number, line: { service: string }) => total + priceOf(line.service), 0);
const remaining: number = statement.setAside - spent;
/* Grouped digits with whatever space the browser's formatter chose — a narrow no-break space on one
   platform and an ordinary one on another. \s matches both, so the assertion is about the number. */
const rand = (n: number) => new RegExp(`R\\s*${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s*')}`);

const noSidewaysScroll = async (page: Page) => page.evaluate(() =>
  [document.documentElement, ...document.querySelectorAll('main, dialog.modal, .workspace')]
    .filter(el => el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`));

const openSponsorship = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'My family', exact: true }).click();
  else {
    await page.locator('.tabbar button').last().click();
    await page.locator('.menu-row').filter({ hasText: 'My family' }).first().click();
  }
  await page.getByRole('button', { name: /Care you sponsor/ }).click();
  await expect(page.getByRole('heading', { name: 'Care you pay for.' })).toBeVisible();
};

test('a sponsor can see what was set aside, what has been used and what is left', async ({ page }) => {
  await page.goto('/');
  await openSponsorship(page);
  await expect(page.getByText(noticeFor('payments')!)).toBeVisible();

  const lead = page.locator('.sponsor-lead');
  await expect(lead.locator('.s-metric').filter({ hasText: 'You set aside' })).toContainText(rand(statement.setAside));
  await expect(lead.locator('.s-metric').filter({ hasText: 'Used so far' })).toContainText(rand(spent));
  await expect(lead.locator('.s-metric').filter({ hasText: 'Left to draw on' })).toContainText(rand(remaining));

  /* One row per line, each carrying the price of the service it names. The screen has nowhere to
     type an amount, and neither has the contract. */
  const rows = page.locator('.sponsor-statement tbody tr');
  await expect(rows).toHaveCount(statement.lines.length);
  for (const line of statement.lines as { service: string }[]) {
    const service = catalogue.find((s: { id: string }) => s.id === line.service);
    await expect(page.locator('.sponsor-statement tbody').getByText(service.name).first()).toBeVisible();
  }
  await expect(page.locator('.sponsor-statement tfoot')).toContainText(rand(spent));
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('and cannot see any of the four things paying for care does not buy', async ({ page }) => {
  await page.goto('/');
  await openSponsorship(page);
  const never = page.locator('.sponsor-never');
  for (const item of programmes.sponsor.neverSees as { what: string; why: string }[]) {
    await expect(never.getByText(item.what, { exact: true })).toBeVisible();
    await expect(never.getByText(item.why, { exact: true })).toBeVisible();
  }
  /* The refusal that answers the obvious next move — asking for the detail as a condition of
     paying. It is refused whatever the relationship, and the sentence is the contract's. */
  await expect(page.getByText(programmes.refusals.find((r: { id: string }) => r.id === 'require-the-detail').sentence)).toBeVisible();
  await expect(page.getByText(programmes.rules.find((r: { id: string }) => r.id === 'paying-is-not-permission').sentence)).toBeVisible();
});

test('whether the service is named is the recipient’s switch, and there is no control here for it', async ({ page }) => {
  await page.goto('/');
  await openSponsorship(page);
  /* The back office has a checkbox for this so a reader can see what it does to a statement. The
     sponsor's own screen must not: a disabled toggle says the sponsor is the sort of person who
     might be allowed to turn it on. */
  await expect(page.locator('.sponsor-switch')).toContainText(programmes.sponsor.lineDetail.find((d: { id: string }) => d.id === 'service-named').detail);
  await expect(page.locator('.sponsor-switch input')).toHaveCount(0);
  await expect(page.getByText(/It is not a setting on this screen and there is no way to ask for it/)).toBeVisible();
  /* And how it stops: hers to end, without a reason, without ending care already given. */
  await expect(page.getByText(programmes.sponsor.consent.withdrawal)).toBeVisible();
});
