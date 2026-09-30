import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';

/* The thread between a patient and the nurse on one visit.

   It is asserted for what it refuses. It says, before anything is typed, that messaging is simulated,
   that these messages are not a health record, and — above the field rather than after a silence — that
   nobody watches it for emergencies. It carries words only: there is no attachment control of any kind.
   A message over the length is refused in the route's own words. A visit that is over or was cancelled
   has a closed thread, with what was said still readable. And what was written survives closing the
   visit and opening it again, while being written nowhere but memory.

   Every sentence looked for is read from packages/catalog. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const booking = json('../packages/catalog/booking.json');
const access = json('../packages/catalog/apis/access.json');
const sos = json('../packages/catalog/sos.json');
const thread = booking.thread;
const number = (id: string) => sos.emergency.numbers.find((n: { id: string }) => n.id === id).number;
const nobodyWatches = thread.nobodyWatches.replace('{ambulance}', number('ambulance')).replace('{mobile}', number('mobile'));
const writeRoute = access.routes.find((r: { path: string }) => r.path === '/v1/access/visit-threads/{bookingRef}/messages');
const routeRefusal = (id: string) => writeRoute.refusals.find((r: { id: string }) => r.id === id).statement;
const closed = (id: string) => thread.closedBecause.find((c: { id: string }) => c.id === id).sentence;

async function openVisit(page: Page, tab: 'Upcoming' | 'Past' | 'Cancelled') {
  await goSection(page, 'My visits');
  if (tab !== 'Upcoming') await page.getByRole('tablist', { name: 'Visit status' }).getByRole('tab', { name: tab, exact: true }).click();
  await page.locator('main .visit-actions').first().getByRole('button', { name: 'View details' }).click();
  return page.getByRole('dialog');
}

test('a visit thread says it is simulated, not a record and not watched, and keeps what was written', async ({ page }) => {
  await page.goto('/app/');
  let visit = await openVisit(page, 'Upcoming');
  await visit.getByRole('button', { name: new RegExp(thread.openLabel) }).click();

  await expect(visit.getByRole('heading', { name: thread.title })).toBeFocused();
  await expect(visit.getByText(noticeFor('messaging')!, { exact: false })).toBeVisible();
  await expect(visit.getByText(thread.notARecord)).toBeVisible();
  const urgent = visit.getByText(nobodyWatches);
  await expect(urgent).toBeVisible();
  const field = visit.getByLabel(thread.inputLabel);
  /* Above the field, so it is read before anything is typed. */
  expect((await urgent.boundingBox())!.y).toBeLessThan((await field.boundingBox())!.y);

  /* Words only: nothing to attach with, anywhere in the thread. */
  await expect(visit.locator('input[type="file"]')).toHaveCount(0);
  await expect(visit.getByRole('button', { name: /attach|photo|image|camera/i })).toHaveCount(0);

  await expect(visit.getByText(thread.empty)).toBeVisible();
  await expect(visit.getByRole('button', { name: thread.sendLabel })).toBeDisabled();
  await field.fill('The gate is the green one on the left.');
  await visit.getByRole('button', { name: thread.sendLabel }).click();
  const message = visit.locator('.thread-message').last();
  await expect(message).toContainText('The gate is the green one on the left.');
  await expect(message).toContainText(thread.you);
  await expect(message).toContainText(thread.kept);
  await expect(field).toHaveValue('');

  /* Closed and opened again: still there, because the preview keeps it in memory for this session. */
  await visit.getByRole('button', { name: 'Close dialog' }).click();
  visit = await openVisit(page, 'Upcoming');
  await expect(visit.locator('.thread-door')).toContainText('The gate is the green one on the left.');
  await visit.getByRole('button', { name: new RegExp(thread.openLabel) }).click();
  await expect(visit.locator('.thread-message')).toHaveCount(1);
});

test('a message longer than the thread allows is refused in the route’s own words', async ({ page }) => {
  await page.goto('/app/');
  const visit = await openVisit(page, 'Upcoming');
  await visit.getByRole('button', { name: new RegExp(thread.openLabel) }).click();
  /* The longest message is Access's setting, and with nothing changed in this tab it is the contract's default. */
  const maxCharacters: number = booking.settings.items.find((s: { key: string }) => s.key === 'visit-thread-max-characters').default.value;
  await visit.getByLabel(thread.inputLabel).fill('a'.repeat(maxCharacters + 1));
  await expect(visit.locator('.thread-count')).toHaveText(`${maxCharacters + 1} / ${maxCharacters}`);
  await visit.getByRole('button', { name: thread.sendLabel }).click();
  await expect(visit.getByRole('alert')).toHaveText(routeRefusal('message-too-long'));
  await expect(visit.locator('.thread-message')).toHaveCount(0);
});

test('a finished visit and a cancelled one have closed threads, and say why', async ({ page }) => {
  await page.goto('/app/');
  let visit = await openVisit(page, 'Past');
  await expect(visit.locator('.thread-door')).toContainText(closed('visit-completed'));
  /* The door's preview line does not wrap, and once pushed the completed visit's dialog sideways. A box
     that scrolls vertically scrolls horizontally too, so the dialog is measured as well as the page. */
  const sideways = () => page.evaluate(() => [document.documentElement, ...document.querySelectorAll('dialog[open]')]
    .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.tagName} ${el.scrollWidth}>${el.clientWidth}`));
  expect(await sideways()).toEqual([]);
  await visit.getByRole('button', { name: new RegExp(thread.openLabel) }).click();
  await expect(visit.getByText(closed('visit-completed'))).toBeVisible();
  await expect(visit.getByLabel(thread.inputLabel)).toHaveCount(0);
  /* No invitation to write on a thread that has nowhere to write. */
  await expect(visit.getByText(thread.empty)).toHaveCount(0);
  await visit.getByRole('button', { name: 'Close dialog' }).click();

  visit = await openVisit(page, 'Cancelled');
  await visit.getByRole('button', { name: new RegExp(thread.openLabel) }).click();
  await expect(visit.getByText(closed('booking-cancelled'))).toBeVisible();
  await expect(visit.getByLabel(thread.inputLabel)).toHaveCount(0);
});
