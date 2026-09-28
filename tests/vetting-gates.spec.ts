import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goConsole, openAdminConsole } from './nav';

/* The seven gates, as a reviewer reads them.

   Every expectation is read out of packages/catalog/vetting.json rather than typed, so the journey
   proves the screen renders the contract's own sentences word for word — and a fail rule reworded in
   the contract is a rule this test follows rather than one it starts refusing. */
const vetting = JSON.parse(readFileSync(new URL('../packages/catalog/vetting.json', import.meta.url), 'utf8'));
type Gate = { id: string; order: number; name: string; failRule: string };
const gate = (id: string): Gate => vetting.gates.find((candidate: Gate) => candidate.id === id);
const status = (id: string) => vetting.gateRules.status
 .replace('{order}', String(gate(id).order)).replace('{total}', String(vetting.gates.length)).replace('{name}', gate(id).name);

async function openParty(page: import('@playwright/test').Page, name: RegExp) {
 await page.getByRole('button', { name }).click();
 return page.locator('.vetting-grid > *').last();
}

test.beforeEach(async ({ page }) => {
 await openAdminConsole(page);
 await goConsole(page, 'Vetting');
});

test('a cleared nurse stands at gate 7, activated, with no rule to read', async ({ page }) => {
 const detail = await openParty(page, /Sister Palesa Khumalo/);
 await expect(detail.locator('.gate-progress')).toContainText(status('activate'));
 await expect(detail.locator('.gate-rule')).toHaveCount(0);
});

test('a reference that could not be confirmed stops a nurse at gate 4, in the fail rule word for word', async ({ page }) => {
 const detail = await openParty(page, /Sister Zanele Mkhize/);
 await expect(detail.locator('.gate-progress')).toContainText(status('background'));
 await expect(detail.locator('.gate-rule')).toHaveText(gate('background').failRule);
});

test('a lapsed clearance holds a nurse at her gate with the lapse sentence, never with the bar', async ({ page }) => {
 const detail = await openParty(page, /Sister Ayanda Dube/);
 await expect(detail.locator('.gate-progress')).toContainText(status('background'));
 await expect(detail.locator('.gate-rule')).toHaveText(vetting.gateRules.lapse);
 await expect(detail).not.toContainText(gate('background').failRule);
});

test('an application with checks still in review sits at the first gate that has not passed', async ({ page }) => {
 const detail = await openParty(page, /Sister Boitumelo Nkosi/);
 await expect(detail.locator('.gate-progress')).toContainText(status('background'));
 await detail.locator('.vetting-check').filter({ hasText: 'Two clinical references' }).getByRole('button', { name: 'Verify' }).click();
 const clearance = detail.locator('.vetting-check').filter({ hasText: 'Police clearance' });
 await clearance.getByRole('button', { name: 'Verify' }).click();
 // one reviewer's word does not pass a hard-stop gate: the clearance is high-risk and needs a second
 await expect(detail.locator('.gate-progress')).toContainText(status('background'));
 await page.getByLabel('Signed in as').selectOption('T. van Wyk · Compliance');
 await clearance.getByRole('button', { name: 'Second it' }).click();
 // and the gate moves, because it is arithmetic over the checks rather than a number somebody wrote down
 await expect(detail.locator('.gate-progress')).toContainText(status('train'));
});
