import { test, expect } from '@playwright/test';
import { openDestination, openWorkspace } from './nav';

/* The nurse's patients and appointments, on both viewports (30 September 2026).
 *
 * The Lovable export's patient screen draws photographs, risk badges, a vitals grid and a trend, and its
 * appointments list rooms and conditions. This build counts the ThusoIQ sandbox instead: the tiles above
 * the care queue are the queue's own arithmetic, the search narrows the queue, the next care action is the
 * sandbox's soonest unfinished visit, and the appointments list is the sandbox's visits by day. */

test('the care queue is counted, searchable, and led by the next care action', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 const summary = page.locator('.nurse-patients');
 await expect(summary).toBeVisible();
 const queue = page.getByRole('complementary', { name: 'Clinical patients' });
 const people = queue.locator('button[aria-pressed]');
 await expect(summary.locator('.nurse-tile').filter({ hasText: 'On the care queue' }).locator('.nurse-tile__value')).toHaveText(String(await people.count()));
 await expect(summary).toContainText('Next care action');
 /* No photograph, no risk badge, no invented reading. */
 await expect(summary.locator('img')).toHaveCount(0);
 await expect(summary).not.toContainText(/high bp|mmHg|bpm|risk/i);

 const search = queue.getByRole('searchbox', { name: 'Search the care queue' });
 await search.fill('Thabo');
 await expect(people).toHaveCount(1);
 await search.fill('nobody-called-this');
 await expect(people).toHaveCount(0);
 await expect(queue).toContainText('Nobody on the care queue matches');
 await search.fill('');
 await expect(people).toHaveCount(3);
 expect(errors).toEqual([]);
});

test('Appointments lists the sandbox visits by day, and says when a day has none', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 const screen = await openDestination(page, 'Appointments');
 await expect(screen).toContainText('Fictional sandbox');
 await screen.getByRole('tab', { name: 'This week' }).click();
 const rows = screen.locator('.nurse-appointments__list li');
 await expect(rows).toHaveCount(3);
 /* No rooms and no conditions: a visit is at home or by video. */
 await expect(screen.locator('.nurse-appointments__list')).not.toContainText(/room/i);
 await screen.getByRole('tab', { name: 'Tomorrow' }).click();
 await expect(rows).toHaveCount(0);
 await expect(screen).toContainText('Nothing is booked for tomorrow.');
 const overflow = await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollWidth - m.clientWidth : 0; });
 expect(overflow).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
