import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';
/* Booking by USSD, on both viewports: the simulator says it is a preview and that no code is assigned, walks the menu to
 * a visit the booking rules asked for, refuses a reply about somebody's health in the contract's words and drops it, and
 * every screen it shows fits the handset.
 *
 * Every word is packages/catalog/ussd.json's, the list positions are the catalogues' own orders, the booked state is
 * packages/catalog/booking.json's, and the notice is the capability's. The simulator is not on the first load, so the
 * section's button is what fetches it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const ussd = json('packages/catalog/ussd.json');
const booking = json('packages/catalog/booking.json');
const services = (json('packages/catalog/services.json') as { id: string; phase: number }[]).filter(s => s.phase === 1);
const zones = json('packages/catalog/geography.json').zones as { id: string; name: string }[];
const capabilities = json('packages/catalog/capabilities.json').capabilities as { id: string; name: string }[];
const node = (id: string) => (ussd.menu.nodes as { id: string; text?: string }[]).find(n => n.id === id)!;
const sentence = (id: string) => (ussd.channelRefusals as { id: string; sentence: string }[]).find(r => r.id === id)!.sentence;
const simulator = ussd.simulator;

async function openSimulator(page: Page) {
  await page.goto('/app/');
  await goSection(page, 'Language & access');
  const name = capabilities.find(c => c.id === ussd.capability)!.name;
  await page.getByRole('button', { name: 'Open the USSD simulator' }).click();
  const panel = page.locator('section.ussd');
  await expect(panel.getByRole('heading', { name: simulator.heading })).toBeVisible();
  await expect(panel.getByText(noticeFor(ussd.capability))).toBeVisible();
  await expect(panel.getByText(simulator.noCode)).toBeVisible();
  expect(name.length).toBeGreaterThan(0);
  return panel;
}
const screenOf = (panel: ReturnType<Page['locator']>) => panel.getByTestId('ussd-screen');
async function send(panel: ReturnType<Page['locator']>, typed: string) {
  await panel.getByLabel(simulator.replyLabel).fill(typed);
  await panel.getByRole('button', { name: simulator.send, exact: true }).click();
}
async function fits(panel: ReturnType<Page['locator']>) {
  const text = (await screenOf(panel).textContent()) ?? '';
  expect(text.length).toBeLessThanOrEqual(ussd.screen.maxCharacters);
}

test('the USSD simulator walks the menu to a visit the booking rules asked for, and every screen fits the handset', async ({ page }) => {
  const panel = await openSimulator(page);
  await panel.getByRole('button', { name: simulator.dial }).click();
  await expect(screenOf(panel)).toContainText(node('welcome').text!);
  await fits(panel);

  const serviceKey = String(services.findIndex(s => s.id === 'vitals') + 1);
  const zoneKey = String(zones.findIndex(z => z.id === 'melville') + 1);
  for (const [typed, next] of [['1', 'service'], [serviceKey, 'zone'], [zoneKey, 'day'], ['1', 'hour'], ['1', 'review']] as const) {
    await send(panel, typed);
    const expected = node(next).text!.split('{')[0]!.trim();
    if (expected) await expect(screenOf(panel)).toContainText(expected);
    await fits(panel);
    /* What was typed is cleared at once. */
    await expect(panel.getByLabel(simulator.replyLabel)).toHaveValue('');
  }
  await send(panel, '1');
  await expect(screenOf(panel)).toContainText(node('booked').text!.split('{')[0]!.trim());
  await fits(panel);
  const requested = (booking.states as { id: string; patientWords: string }[]).find(s => s.id === 'requested')!;
  await expect(panel.getByText(requested.patientWords)).toBeVisible();
});

test('a reply about somebody\'s health is refused in the contract\'s words, dropped, and the menu goes back', async ({ page }) => {
  const panel = await openSimulator(page);
  await panel.getByRole('button', { name: simulator.dial }).click();
  await send(panel, 'chest pain since Monday');
  await expect(screenOf(panel)).toContainText(sentence('no-clinical-detail'));
  await expect(screenOf(panel)).not.toContainText('chest pain');
  await fits(panel);
  await send(panel, '8001015009087');
  await expect(screenOf(panel)).toContainText(sentence('no-identity-number'));
  await send(panel, '0');
  await expect(screenOf(panel)).toContainText(node('welcome').text!);
  const overflow = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('main, section.ussd')].filter(el => el.scrollWidth > el.clientWidth + 1).length);
  expect(overflow).toBe(0);
});
