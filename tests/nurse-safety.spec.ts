import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openDestination, openWorkspace } from './nav';

/* The nurse's "Safety & alerts", on both viewports (30 September 2026).
 *
 * The Lovable export's alarm centre draws live vitals, severity alarms, recommended responses and an
 * ambulance button. This destination gathers only what exists — her field-safety timer, Sentinel and the
 * kit's health — and says in words what it will not show. The journey proves the empty state before a
 * visit starts, the ring and the strip once the visit code has matched, and that no alarm or dispatch
 * control came with the export's layout. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fieldSafety = json('../packages/catalog/field-safety.json');
const sentinel = json('../packages/catalog/sentinel.json');
const visitCode: string = json('../packages/catalog/care.json').preview.visitCode;
const START = new Date('2026-09-15T08:00:00+02:00');

test('Safety & alerts gathers the timer, Sentinel and the kit, and draws no alarm or dispatch control', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.clock.install({ time: START });
 await openWorkspace(page, 'Nurse');
 let screen = await openDestination(page, 'Safety & alerts');

 /* Before a visit code matches there is nothing to time, and the screen says so rather than drawing a ring of nothing. */
 await expect(screen.getByRole('heading', { name: fieldSafety.nurse.heading })).toBeVisible();
 await expect(screen).toContainText('No timer is running.');
 await expect(screen.locator('.nurse-timer')).toHaveCount(0);
 /* Sentinel's own section, the same component Thuso Kit ends on. */
 await expect(screen.locator('.sn-state')).toBeVisible();
 await expect(screen).toContainText(sentinel.screens.sentinel.heading);

 /* What stays refused, in words and by absence. */
 await expect(screen.getByRole('heading', { name: 'What this screen will not show' })).toBeVisible();
 await expect(screen.getByRole('button', { name: /ambulance|dispatch|acknowledge/i })).toHaveCount(0);
 await expect(screen).not.toContainText(/\bbpm\b|mmHg/);

 /* Start the first visit of the day with the patient's code, then come back: the timer is the visit's. */
 await goSection(page, 'Schedule');
 await page.getByRole('button', { name: 'Start this visit' }).click();
 const dialog = page.getByRole('dialog');
 await dialog.getByLabel('Visit code, digit 1 of 6').fill(visitCode);
 await dialog.getByRole('checkbox').first().check();
 await dialog.getByRole('button', { name: 'Confirm identity' }).click();
 await expect(dialog.getByRole('region', { name: new RegExp(`^${fieldSafety.nurse.heading}`) })).toBeVisible();
 await page.getByRole('button', { name: 'Close dialog' }).click();

 screen = await openDestination(page, 'Safety & alerts');
 await expect(screen.locator('.nurse-timer')).toBeVisible();
 await expect(screen.locator('.nurse-timer__figure')).toContainText('min left');
 const strip = screen.getByRole('region', { name: new RegExp(`^${fieldSafety.nurse.heading}`) });
 await expect(strip.getByRole('button', { name: fieldSafety.nurse.checkIn })).toBeVisible();
 await expect(strip.getByRole('button', { name: fieldSafety.panic.press })).toBeVisible();

 const overflow = await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollWidth - m.clientWidth : 0; });
 expect(overflow).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
