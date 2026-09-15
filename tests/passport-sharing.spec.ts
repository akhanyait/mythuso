import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';

/* Health Passport P1, as a patient uses it: a share link made on a grant they already hold, opened until it has been
   opened as often as it may be, revoked; the same acts found in the log of who opened the record, beside the synthetic
   break-glass entry; and an emergency card with a QR code, which says before anything else that it is a preview.

   Every sentence is read from the contracts rather than typed here, and so is every count: the number of opens a
   link allows is the Record setting's default, so this journey fails if the screen stops showing the setting. */

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sharing = read('../packages/catalog/passport-sharing.json');
const gateway = read('../packages/catalog/passport-gateway.json');
const consent = read('../packages/catalog/consent.json');
const say = sharing.screens;
const setting = (key: string) => sharing.settings.items.find((item: { key: string }) => item.key === key).default.value as number;
const refusal = (id: string) => gateway.refusals.find((r: { id: string }) => r.id === id).sentence as string;
const roleName = (id: string) => consent.grants.recipientRoles.find((r: { id: string }) => r.id === id).name as string;
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const noOverflow = (page: Page) => page.evaluate(() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; });

async function openPassport(page: Page) {
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
}

test('a share link rides on a grant, opens until its uses are spent, is revoked, and every act is in the log of who opened the record', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPassport(page);
  await page.getByRole('button').filter({ hasText: 'Share links' }).first().click();
  await expect(page.getByRole('heading', { name: say.sharing.title })).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: say.sharing.preview })).toBeVisible();

  const doctor = roleName(sharing.preview.grants[0].recipientRole);
  await expect(page.getByRole('radio', { name: new RegExp(doctor) })).toBeChecked();
  const uses = setting('share-link-max-uses');
  await expect(page.getByText(new RegExp(`and can be opened ${uses} times$`))).toBeVisible();
  await expect(page.getByText(fill(say.sharing.neverTo, { payers: sharing.links.neverTo.map((p: { name: string }) => p.name.toLowerCase()).join(', ') }))).toBeVisible();

  await page.getByRole('button', { name: say.sharing.make }).click();
  await expect(page.getByRole('status').filter({ hasText: /Link made\. Its code is shown once: [A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/ })).toBeVisible();

  const openAs = page.getByRole('button', { name: fill(say.sharing.openAs, { recipient: doctor }) });
  for (let i = 0; i < uses; i++) await openAs.click();
  await expect(page.getByText(fill(say.sharing.usesLeft, { uses: 0 }), { exact: false })).toBeVisible();
  await openAs.click();
  await expect(page.getByRole('status').filter({ hasText: refusal('link-used-up') })).toBeVisible();
  await page.getByRole('button', { name: say.sharing.revoke }).click();
  await expect(page.locator('.ps-link').getByText(say.sharing.revoked)).toBeVisible();
  expect(await noOverflow(page)).toBe(true);

  await page.getByRole('button').filter({ hasText: say.sharing.logLink }).click();
  await expect(page.getByRole('heading', { name: say.log.title })).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: say.log.preview })).toBeVisible();
  const log = page.locator('.ps-log');
  const label = (id: string) => sharing.accessLog.actions.find((a: { id: string }) => a.id === id).label as string;
  await expect(log.locator('.ps-entry').filter({ hasText: label('share.link.create') }).filter({ hasText: gateway.statements.patientSession }).first()).toBeVisible();
  await expect(log.locator('.ps-entry').filter({ hasText: label('share.link.use') }).filter({ hasText: gateway.statements.linkUsed }).first()).toBeVisible();
  await expect(log.locator('.ps-entry.is-refused').filter({ hasText: refusal('link-used-up') }).first()).toBeVisible();
  await expect(log.locator('.ps-entry').filter({ hasText: label('share.link.revoke') }).first()).toBeVisible();
  const glass = log.locator('.ps-entry').filter({ hasText: sharing.accessLog.breakGlass });
  await expect(glass.first()).toBeVisible();
  await expect(glass.first().getByText(gateway.breakGlass.reasons.find((r: { id: string }) => r.id === 'unresponsive').sentence)).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('the emergency card says it is a preview, opens the emergency summary alone, and carries a QR code that reads as a sentence', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPassport(page);
  await page.getByRole('button').filter({ hasText: 'Your emergency card' }).first().click();
  await expect(page.getByRole('heading', { name: say.card.title, level: 1 })).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: say.card.preview })).toBeVisible();

  await page.getByRole('button', { name: say.card.make }).click();
  const card = page.locator('.emergency-card');
  await expect(card.getByText(say.card.preview)).toBeVisible();
  await expect(card.getByRole('img', { name: say.card.qrLabel })).toBeVisible();
  await expect(card.locator('.ps-code')).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(card.getByText(say.card.sealedNever)).toBeVisible();
  await expect(card.getByText(fill(say.card.opens, { uses: setting('emergency-card-max-uses') }))).toBeVisible();
  const summary = gateway.emergencySummary.categories.map((id: string) => read('../packages/catalog/records.json').records.find((r: { id: string }) => r.id === id).name).join(', ');
  await expect(card.getByText(fill(say.card.opensOnly, { categories: summary }))).toBeVisible();
  await expect(card.getByRole('button', { name: say.card.print })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});
