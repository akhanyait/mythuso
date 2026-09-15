import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { confirmBooking, goSection } from './nav';

/* A patient asks for a nurse by name, and Care cannot offer her the visit.

   Access offers every nurse whose badge is current nearby and never asks whether her scope covers the service;
   Care does. So a patient booking a wound dressing can name a cleared nurse who does no wound care, and what
   happens next is their own answer. Asked to wait, Care sends nobody else: the booking stays asked for rather
   than accepted by the simulated roster, and the patient is told she cannot take it. Asked for the soonest nurse,
   the visit goes to the next nurse Care may offer it to, and the patient is told who.

   Every name and sentence looked for is read from packages/catalog. The nurse asked for is found by what the
   contracts say about her — offered by the booking step, and without the wound care scope — never by typing her. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const booking = json('../packages/catalog/booking.json');
const care = json('../packages/catalog/care.json');
const roster = json('../packages/catalog/roster.json');

type Nurse = { id: string; name: string; scope: string[] };
const wound = care.services.find((s: { serviceId: string }) => s.serviceId === 'wound').scope as string;
const fill = (text: string, values: Record<string, string>) => text.replace(/\{([a-z]+)\}/gi, (token, key) => values[key] ?? token);
const told = (id: string) => care.offers.namedFallback.told.find((t: { id: string }) => t.id === id).sentence as string;
const choice = (id: string) => booking.person.fallback.choices.find((c: { id: string }) => c.id === id);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function bookNamed(page: Page, answer: 'wait' | 'soonest') {
  const rule = booking.person.fallback.rules.find((r: { setting: string }) => r.setting === booking.settings.items.find((s: { key: string }) => s.key === 'named-nurse-fallback').default.value);
  test.skip(!rule.asksPatient, 'The named-nurse fallback in force does not ask the patient, so this journey cannot choose an answer.');
  await page.goto('/app/');
  await goSection(page, 'Book a nurse');
  await page.getByRole('button', { name: /Wound care/ }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Continue' }).click(); // who
  await d.getByRole('button', { name: 'Continue' }).click(); // where
  const offered = await d.locator('.nurse-list .nurse-option strong').allInnerTexts();
  const named = (roster.nurses as Nurse[]).find(n => offered.map(o => o.trim()).includes(n.name) && !n.scope.includes(wound));
  expect(named, 'the booking step offers a cleared nurse outside the wound care scope').toBeTruthy();
  await d.locator('.nurse-list .nurse-option').filter({ hasText: named!.name }).click();
  await d.getByRole('button', { name: 'Continue' }).click(); // nurse → when
  await d.getByRole('radio', { name: new RegExp(escape(fill(choice(answer).name, { nurse: named!.name }))) }).check();
  await d.getByRole('button', { name: '10:00', exact: true }).click();
  await d.getByRole('button', { name: 'Continue' }).click(); // when → payment
  await d.getByRole('button', { name: 'Continue' }).click(); // payment → review
  await d.getByRole('checkbox').check();
  await confirmBooking(d);
  return { d, named: named! };
}

test('asked to wait for a nurse Care cannot offer the visit, the patient is told she cannot take it, and nothing accepts it', async ({ page }) => {
  const { d, named } = await bookNamed(page, 'wait');
  await expect(d.locator('.booking-care-told')).toHaveText(fill(told('cannot-take'), { nurse: named.name }));
  const status = d.locator('.booking-status');
  const requested = booking.states.find((s: { id: string }) => s.id === 'requested');
  await expect(status.locator('[data-state="requested"]')).toContainText(requested.name);
  await expect(status.locator('[data-state="requested"]')).toContainText(booking.statusWords.current);
  await expect(status.locator('[data-state="confirmed"]')).toContainText(booking.statusWords.waiting);
  await expect(status).not.toContainText(booking.acceptedBy);
});

test('asked for the soonest nurse instead, the patient is told which nurse Care offered it to, and she does wound care', async ({ page }) => {
  const { d, named } = await bookNamed(page, 'soonest');
  const [before, after] = told('gone-to-soonest').split('{soonest}').map(part => escape(fill(part, { nurse: named.name })));
  const sentence = d.locator('.booking-care-told');
  await expect(sentence).toHaveText(new RegExp(`^${before}(.+)${after}$`));
  const soonest = (await sentence.innerText()).match(new RegExp(`^${before}(.+)${after}$`))![1]!;
  const offeredTo = (roster.nurses as Nurse[]).find(n => n.name === soonest);
  expect(offeredTo?.scope).toContain(wound);
  expect(offeredTo?.id).not.toBe(named.id);
  await expect(d.locator('.booking-status [data-state="confirmed"]')).toContainText(booking.statusWords.current);
});
