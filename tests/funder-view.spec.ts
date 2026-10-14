import { expect, test } from '@playwright/test';
import brief from '../packages/catalog/funder-brief.json' with { type: 'json' };
import kit from '../packages/catalog/pilot-kit.json' with { type: 'json' };

/* The funder view at /app/?preview=funder, on both viewports. What it must never do is show a
 * figure as settled that is not: the budget split is drawn as proposed, every device is drawn as
 * a branding mockup under the DEMO DATA badge, and the emergency line is on the page. */

test('the funder view shows the ask, its proposed split and the pilot kit, and calls none of it settled', async ({ page }) => {
 await page.goto('/app/?preview=funder');
 await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
 const ask = page.locator('#point-ask');
 const askPoint = brief.points.find(p => p.id === 'ask')!;
 for (const f of askPoint.facts) if (f.figure) await expect(ask.getByText(f.figure, { exact: true })).toBeVisible();
 const budget = (askPoint as { budget?: { lines: { label: string }[] } }).budget;
 if (budget) {
  await expect(ask.locator('.fv-budget .fv-chip')).toHaveText('Proposed');
  await expect(ask.locator('.fv-budget li')).toHaveCount(budget.lines.length);
 }

 const section = page.locator('.fv-kit');
 await expect(section.getByText('DEMO DATA')).toBeVisible();
 await expect(section.getByText(kit.status, { exact: false })).toBeVisible();
 await expect(section.locator('.fv-kit-item')).toHaveCount(kit.devices.length);
 for (const d of kit.devices) await expect(section.locator(`[data-device="${d.id}"] svg`)).toBeVisible();
 await expect(section).toContainText('it is not an ambulance');
 await expect(section).not.toContainText(/R ?\d|\$ ?\d/);

 await expect(page.locator('.fv-foot')).toContainText(brief.emergencyLine);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
