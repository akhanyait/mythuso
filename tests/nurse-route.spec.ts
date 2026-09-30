import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openDestination, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The nurse's route map, on both viewports (30 September 2026).
 *
 * The Lovable export draws a nurse a map of her allocations: patients' initials on the pins, a clinic, an
 * urgent pin, a travel time, a route drawn along the roads and a Directions button. This build draws her own
 * day instead — the schedule's three visits at the centres of their suburbs, numbered, with her base and a
 * dashed straight leg between each — and proves here that what it counts is counted from the list, that the
 * list and the map choose the same stop, and that none of the export's invented parts came with it. */

const geography = JSON.parse(readFileSync(new URL('../packages/catalog/geography.json', import.meta.url), 'utf8')) as {
 marks: { id: string; name: string }[];
};
const care = JSON.parse(readFileSync(new URL('../packages/catalog/care.json', import.meta.url), 'utf8')) as { offers: { distanceBasis: string } };

test('the nurse sees her own day on a map, numbered, counted from the list, with no route and no names', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 const screen = await openDestination(page, 'Route map');

 /* The dispatch notice, word for word, above a map of positions nobody is reporting. */
 await expect(screen).toContainText(noticeFor('dispatch'));
 await expect(screen).toContainText(care.offers.distanceBasis);

 /* The list is the day: three numbered stops, and the counts above it are the list's own. */
 const stops = screen.locator('.nurse-route__stop');
 await expect(stops).toHaveCount(3);
 const counts = screen.locator('.nurse-route__counts');
 await expect(counts.locator('div').filter({ hasText: 'Stops today' }).locator('dd')).toHaveText(String(await stops.count()));
 const signed = await stops.filter({ hasText: 'Signed' }).count();
 await expect(counts.locator('div').filter({ hasText: 'Signed off' }).locator('dd')).toHaveText(String(signed));

 /* Choosing a stop in the list chooses it on the card over the map; the card names the suburb, the time and
    the service and nothing about the person. */
 await stops.nth(1).click();
 await expect(stops.nth(1)).toHaveAttribute('aria-pressed', 'true');
 const card = screen.locator('.nurse-route__card');
 await expect(card).toContainText('Stop 2 of 3');
 await expect(card).toContainText('Parktown');
 await expect(card).toContainText('11:30');

 /* The layer switches are the contract's own key. */
 for (const name of ['Nurse available', 'Assigned']) {
  if (!geography.marks.some(m => m.name === name)) throw new Error(`geography.json no longer names the mark "${name}".`);
  await expect(screen.locator('.livemap-layers')).toContainText(name);
 }

 /* Choosing a pin chooses the row, on the schematic where every pin is an element this test can press. */
 await screen.getByRole('button', { name: 'Hide streets' }).click();
 await screen.getByRole('button', { name: /^Stop 3,/ }).click();
 await expect(stops.nth(2)).toHaveAttribute('aria-pressed', 'true');
 await expect(card).toContainText('Melville');
 /* The legs are dashed straight lines, one per leg, and they can be taken away. */
 await expect(screen.locator('.map-straight')).toHaveCount(2);
 await screen.getByRole('button', { name: 'Hide the straight legs' }).click();
 await expect(screen.locator('.map-straight')).toHaveCount(0);

 /* What stays refused: no Directions, no travel time, no urgency, no patient's name on the screen. */
 await expect(screen.getByRole('button', { name: /directions/i })).toHaveCount(0);
 await expect(screen).toContainText('No routing provider is connected');
 await expect(screen).not.toContainText(/urgent/i);
 await expect(screen).not.toContainText(/\d+\s*min travel/i);
 for (const person of ['Lerato Molefe', 'Thabo Molefe', 'Nomsa Molefe']) await expect(screen).not.toContainText(person);
 /* A pin carries a number and never initials. */
 for (const badge of await screen.locator('.map-pin-badge').allTextContents()) expect(badge).toMatch(/^\d+$/);

 /* The week view is the earnings register's weeks, as bars with their counts. */
 await screen.getByRole('tab', { name: 'Week' }).click();
 await expect(screen.locator('.nurse-route__weeks li').first()).toBeVisible();
 await expect(screen).toContainText('Nothing here is a target or an average.');

 const overflow = await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollWidth - m.clientWidth : 0; });
 expect(overflow).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
