import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
/* The three family arrangements on both viewports: a roster that grants nothing, a sponsor who is shown
 * billing and nothing else, and a split that has to add up and be accepted a share at a time.
 *
 * Every sentence asserted here is read out of packages/catalog/apis/access.json or
 * packages/catalog/household.json rather than typed, and every amount out of packages/catalog/services.json,
 * because a spec that carries its own copy of a refusal is one more place for the refusal to be wrong. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const access = json('packages/catalog/apis/access.json') as {
  routes: { method: string; path: string; version: number; withdrawn?: unknown; refusals: { id: string; statement: string }[] }[];
};
const household = json('packages/catalog/household.json') as {
  membership: { neverHolds: { field: string }[] };
  screen: { household: Record<string, string>; sponsor: Record<string, string>; split: Record<string, string> & { never: string[] } };
  split: { shareStates: { id: string; name: string; words: string }[] };
  preview: { members: { name: string; subjectRef: string }[]; split: { serviceId: string; shares: unknown[] } };
};
const services = json('packages/catalog/services.json') as { id: string; name: string; price: number }[];
const said = (key: string, id: string) => {
  const route = access.routes.find(r => `${r.method} ${r.path}@${r.version}` === key && !r.withdrawn)!;
  return route.refusals.find(x => x.id === id)!.statement;
};
const shareWords = (id: string) => household.split.shareStates.find(s => s.id === id)!.words;
const priceOf = (id: string) => services.find(s => s.id === id)!.price;

/* Scoped to the family list rather than to the page: the sidebar carries the signed-in person's own name
   at 1440px, so a bare button-by-name reached the account row and never opened a profile at all. */
const toHousehold = async (page: Page) => {
  await page.goto('/app/');
  await goSection(page, 'My family');
  await page.locator('.family-member').filter({ hasText: 'Lerato Molefe' }).first().click();
  await page.getByRole('button', { name: /Open the household record/ }).click();
};

test('adding somebody to a household grants nothing, and asking for a record with them is refused in the route\'s own words', async ({ page }) => {
  await toHousehold(page);
  const roster = page.locator('.panel').filter({ hasText: household.screen.household.heading });
  await expect(roster.getByRole('heading', { name: household.screen.household.heading })).toBeVisible();
  /* The roster is the contract's preview, by first name, and every line says who put them there. */
  for (const member of household.preview.members) await expect(roster.getByText(member.name, { exact: true })).toBeVisible();
  await expect(roster.getByText(household.screen.household.preview)).toBeVisible();

  /* Ticking "also open their record to me" sends a field the route never declared, and is refused. */
  const reference = roster.getByRole('textbox');
  await reference.fill('subj-preview-koketso');
  await roster.getByRole('checkbox').check();
  await roster.getByRole('button', { name: household.screen.household.add }).click();
  await expect(roster.getByRole('status')).toHaveText(said('POST /v1/access/household-memberships@1', 'membership-is-not-consent'));
  await expect(roster.getByText('subj-preview-koketso')).toHaveCount(0);

  /* Untick it and the same request is a roster line, and nothing more. */
  await roster.getByRole('checkbox').uncheck();
  await roster.getByRole('button', { name: household.screen.household.add }).click();
  await expect(roster.getByRole('status')).toHaveText(household.screen.household.added);
  await expect(roster.getByText('subj-preview-koketso', { exact: true })).toBeVisible();
  /* And what a roster never carries is on the screen rather than only in the contract. */
  for (const never of household.membership.neverHolds) await expect(roster.getByText(never.field, { exact: true })).toBeVisible();
});

test('a roster is listed only to the people on it', async ({ page }) => {
  await toHousehold(page);
  /* The visiting nurse is not on this household's roster, whatever the record above lets her open. */
  await page.getByRole('button', { name: 'Sister Palesa Khumalo' }).click();
  const roster = page.locator('.panel').filter({ hasText: household.screen.household.heading });
  await expect(roster.getByText(said('GET /v1/access/households@1', 'not-in-this-household'))).toBeVisible();
  await expect(roster.getByRole('textbox')).toHaveCount(0);
});

test('a sponsor is shown a household reference, a state and billing lines, and nothing about the care', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'My family');
  await page.getByRole('button', { name: /Care you sponsor/ }).click();
  const link = page.locator('.panel').filter({ hasText: household.screen.sponsor.heading });
  await expect(link.getByRole('heading', { name: household.screen.sponsor.heading })).toBeVisible();
  /* The sponsorship names a household and a member of it, by reference. Nobody typed a name into it. */
  await expect(link.getByText(/A member of household SIM-HH-/)).toBeVisible();
  await expect(link.getByText(household.preview.members[0]!.subjectRef, { exact: true })).toBeVisible();
  await expect(link.getByText(household.screen.sponsor.stateLabel)).toBeVisible();

  /* Every statement line is a day and an amount, and the service only because the recipient has switched
     it on. Three columns, and the third is the amount: a fourth would be something a sponsor is not owed. */
  const statement = page.locator('table.sponsor-statement');
  await expect(statement.locator('thead th')).toHaveCount(3);
  await expect(statement.locator('tbody tr')).toHaveCount(3);
  /* The sponsorship panel carries references, a state and a line detail, and nothing else. Asserted on the
     rows themselves rather than on the absence of words, because "what was found" is on this screen —
     in the list of what a sponsor never sees, which is where it belongs. */
  await expect(link.locator('.review-line')).toHaveCount(3);
});

test('a split has to add up, and each payer accepts their own share before any of it is payable', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Thuso Wallet');
  await page.getByRole('button', { name: /Split a visit between you/ }).click();
  await expect(page.getByRole('heading', { name: household.screen.split.heading })).toBeVisible();
  /* The whole is the catalogue's price for the preview's visit, and there is nowhere to type one. */
  await expect(page.getByText(new RegExp(`R\\s?${priceOf(household.preview.split.serviceId)}\\b`)).first()).toBeVisible();

  const lead = page.locator('.sponsor-lead, .lead').first();
  const told = lead.getByRole('status');
  await page.getByRole('button', { name: /does not add up/ }).click();
  await expect(told).toHaveText(said('POST /v1/access/bill-splits@2', 'shares-must-total'));

  await page.getByRole('button', { name: household.screen.split.propose }).click();
  const rows = page.locator('.record-row');
  await expect(rows).toHaveCount(household.preview.split.shares.length);
  await expect(rows.first()).toContainText(shareWords('waiting'));

  await rows.first().getByRole('button').click();
  await expect(told).toHaveText(household.screen.split.accepted);
  await rows.last().getByRole('button').click();
  await expect(told).toHaveText(household.screen.split.allAccepted);
  /* And what a payer never sees is on the screen, in the contract's words. */
  for (const never of household.screen.split.never) await expect(page.getByText(never, { exact: true })).toBeVisible();
});
