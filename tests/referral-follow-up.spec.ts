import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* A written referral is owned (the TIA care loop, 29 October 2026), on both viewports.
 *
 * The 28 October TIA decks promise that every referral has an owner, a reason and a documented outcome. The letter
 * already said somebody here still has to find out whether the patient went; this journey holds that writing it now
 * names who, from the concern the closed loop opens, in closed-loop.json's own sentences and the vetting register's
 * own role names, and that it says nothing was paged. Read rather than imported, as the other journeys do. */
const closedLoop = JSON.parse(readFileSync(new URL('../packages/catalog/closed-loop.json', import.meta.url), 'utf8'));
const vetting = JSON.parse(readFileSync(new URL('../packages/catalog/vetting.json', import.meta.url), 'utf8'));
const rule = closedLoop.referralWritten;
const roleName = (id: string) => vetting.roles.find((r: { id: string }) => r.id === id).name as string;

test('writing a referral names who owns finding out whether the patient went, and pages nobody', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  await goSection(page, 'Patient context');
  await page.locator('button.pf-action').filter({ hasText: 'Referral' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Refer to').selectOption({ index: 1 });
  await sheet.getByLabel('What the receiving clinician needs to know').fill('Blood pressure above range on four readings at home.');
  await sheet.getByRole('button', { name: 'Write the referral' }).click();

  await expect(sheet.getByRole('heading', { name: 'The referral is written.' })).toBeVisible();
  const owner = sheet.locator('[data-referral-loop]');
  await expect(owner).toContainText(roleName(rule.ownerRole.value));
  await expect(owner).toContainText(`now owns finding out whether`);
  await expect(owner).toContainText(roleName(rule.fallbackRole.value).toLowerCase());
  const loopRef = await owner.getAttribute('data-referral-loop');
  expect(loopRef, 'the referral opened no concern').toMatch(/^LOOP-REF-\d{4}$/);
  await expect(owner).toContainText(`concern board as ${loopRef}`);
  await expect(owner).toContainText(rule.screen.preview);
});
