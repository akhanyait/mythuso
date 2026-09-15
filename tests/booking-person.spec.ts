import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { confirmBooking, goSection } from './nav';

/* Choosing who comes, as a patient meets it.

   The person step sits between where and when, and what is asserted here is what it will not do. It
   never offers a nurse without a current badge, and the nurses it refuses are named with the booking
   capability's own sentence rather than filtered away. Asking for somebody by name keeps or takes away
   "as soon as someone is free" as Access's named-nurse fallback in force says, and says what happens if
   she cannot take the visit — asked, or in the rule's own sentence — so no booking ends with no nurse
   and no message. An hour already held with her is not drawn. And the review names her, the price from the
   catalogue and the way out from cancellation.json before the button that books.

   Every sentence looked for is read from packages/catalog, never typed here. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const booking = json('../packages/catalog/booking.json');
const capabilities = json('../packages/catalog/capabilities.json');
const cancellation = json('../packages/catalog/cancellation.json');
const roster = json('../packages/catalog/roster.json');
const geography = json('../packages/catalog/geography.json');
const scheduling = json('../packages/catalog/scheduling.json');
const trust = json('../packages/catalog/trust.json');

const slug = (sentence: string) => sentence.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const refuses: string[] = capabilities.capabilities.find((c: { id: string }) => c.id === 'booking').simulation.refuses;
const refusal = (id: string) => refuses.find(sentence => slug(sentence) === id)!;
const zoneNames = new Set(geography.zones.map((z: { name: string }) => z.name));
type RosterRow = { name: string; zone: string; checks?: Record<string, { expiresInDays?: number }> };
const lapsed = (roster.nurses as RosterRow[]).find(n => Object.values(n.checks ?? {}).some(c => (c.expiresInDays ?? 0) < 0))!;
const outside = (roster.nurses as RosterRow[]).find(n => !zoneNames.has(n.zone))!;
const badge = trust.tiers.find((t: { id: string }) => t.id === booking.person.badge.tier);
const option = (id: string) => booking.person.options.find((o: { id: string }) => o.id === id);
const fill = (text: string, values: Record<string, string>) => text.replace(/\{([a-z]+)\}/gi, (token, key) => values[key] ?? token);
const care = json('../packages/catalog/care.json');
/* A setting untouched in this tab is its contract's default: Access's named-nurse fallback, Care's offer window. */
const settingDefault = (contract: { settings: { items: { key: string; default: { value: unknown } }[] } }, key: string) =>
  contract.settings.items.find(s => s.key === key)!.default.value;

async function toNurseStep(page: Page, service = /Wound care/) {
  await page.goto('/app/');
  await goSection(page, 'Book a nurse');
  await page.getByRole('button', { name: service }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Continue' }).click(); // who
  await d.getByRole('button', { name: 'Continue' }).click(); // where
  await expect(d.getByRole('heading', { name: booking.person.heading })).toBeVisible();
  return d;
}

test('only nurses whose badge is current are offered, and the rest are named with the reason', async ({ page }) => {
  const d = await toNurseStep(page);
  await expect(d.getByRole('radio', { name: new RegExp(option('nearest').name) })).toBeChecked();
  await expect(d.getByText(booking.person.continuity)).toBeVisible();

  const offered = d.locator('.nurse-list .nurse-option');
  expect(await offered.count()).toBeGreaterThan(0);
  const names = await offered.locator('strong').allInnerTexts();
  expect(names).not.toContain(lapsed.name);
  expect(names).not.toContain(outside.name);
  /* The badge in words on every row, not a colour alone. */
  for (const row of await offered.all()) await expect(row).toContainText(badge.name);
  await expect(d.locator('.nurse-badge-key')).toContainText(badge.sentence);

  const refused = d.locator('.nurse-refused li');
  await expect(refused.filter({ hasText: lapsed.name })).toContainText(refusal('offer-a-nurse-whose-simulated-vetting-has-lapsed'));
  await expect(refused.filter({ hasText: outside.name })).toContainText(refusal('book-outside-a-zone-dispatch-can-reach'));

  /* Nothing on this step scrolls sideways, at the phone width or inside the dialog. */
  const overflow = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]') as HTMLElement | null;
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 0 };
  });
  expect(overflow.page).toBeLessThanOrEqual(1);
  expect(overflow.dialog).toBeLessThanOrEqual(1);
});

test('the nurse seen last time can be asked for again, and somebody with no earlier visit is told so', async ({ page }) => {
  const d = await toNurseStep(page);
  await expect(d.getByRole('radio', { name: new RegExp(option('previous').name) })).toBeVisible();
  await d.getByRole('button', { name: 'Back' }).click();
  await d.getByRole('button', { name: 'Back' }).click();
  await d.getByLabel('Who is this visit for?').selectOption('Nomsa Molefe');
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.getByText(fill(booking.person.noPrevious, { person: 'Nomsa' }))).toBeVisible();
  await expect(d.getByRole('radio', { name: new RegExp(option('previous').name) })).toHaveCount(0);
});

test('asking for a nurse by name keeps as soon as possible under the fallback in force, asks what happens if she cannot take it, and the review names her, the answer, the price and the way out', async ({ page }) => {
  const d = await toNurseStep(page);
  const first = d.locator('.nurse-list .nurse-option').first();
  const name = (await first.locator('strong').innerText()).trim();
  await first.click();
  await d.getByRole('button', { name: 'Continue' }).click(); // nurse → when

  /* Access's named-nurse fallback, untouched in this tab, is its default; its rule says whether as soon as
     possible stays and whether the patient is asked. The minutes are Care's offer window, untouched too. */
  const rule = booking.person.fallback.rules.find((r: { setting: string }) => r.setting === settingDefault(booking, 'named-nurse-fallback'));
  const minutes = String(settingDefault(care, 'offer-expiry'));
  const asap = scheduling.kinds.find((k: { id: string }) => k.id === 'asap');
  await expect(d.getByRole('radio', { name: new RegExp(asap.name) })).toHaveCount(rule.offersAsap ? 1 : 0);
  await expect(d.getByText(booking.person.asapNeedsNearest)).toHaveCount(rule.offersAsap ? 0 : 1);
  await expect(d.getByLabel('Your booking summary')).toContainText(name);
  const soonest = booking.person.fallback.choices.find((c: { id: string }) => c.id === 'soonest');
  if (rule.asksPatient) {
    await expect(d.getByRole('heading', { name: fill(booking.person.fallback.heading, { nurse: name, minutes }) })).toBeVisible();
    await expect(d.getByText(fill(rule.sentence, { nurse: name, minutes }))).toBeVisible();
    const wait = booking.person.fallback.choices.find((c: { id: string }) => c.id === 'wait');
    await expect(d.getByRole('radio', { name: new RegExp(fill(wait.name, { nurse: name })) })).toBeChecked();
    await d.getByRole('radio', { name: new RegExp(soonest.name) }).check();
  } else {
    await expect(d.getByText(fill(rule.sentence, { nurse: name, minutes }))).toBeVisible();
  }

  await d.getByRole('button', { name: '10:00', exact: true }).click();
  await d.getByRole('button', { name: 'Continue' }).click(); // when → payment
  await d.getByRole('button', { name: 'Continue' }).click(); // payment → review

  /* A review line by its own label rather than by any text in it: the fallback answer speaks of a nurse too. */
  const line = (label: string) => d.locator('.review-line').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) });
  await expect(line(booking.review.nurseLabel)).toContainText(`${name} · ${badge.name}`);
  await expect(line(booking.person.fallback.reviewLabel)).toContainText(rule.asksPatient ? soonest.sentence
    : booking.person.fallback.choices.find((c: { id: string }) => c.id === rule.resolvesTo).sentence);
  await expect(line(booking.review.priceLabel)).toContainText('R 299');
  await expect(line(booking.review.cancellingLabel)).toContainText(cancellation.window.sentence);
  await expect(d.locator('.clinician-profile h3')).toHaveText(name);

  await d.getByRole('checkbox').check();
  await confirmBooking(d);
  await expect(d.locator('.nurse-row strong')).toHaveText(name);
  /* The answer the booking holds, in its own field rather than folded into the slot it was booked against, is
     what the confirmation repeats: the one the patient picked, or the one the rule in force resolves to. */
  const kept = d.locator('.booking-fallback-kept');
  await expect(kept.locator('span')).toHaveText(booking.person.fallback.reviewLabel);
  await expect(kept.locator('strong')).toHaveText(rule.asksPatient ? soonest.sentence
    : booking.person.fallback.choices.find((c: { id: string }) => c.id === rule.resolvesTo).sentence);
  const status = d.locator('.booking-status');
  await expect(status.getByRole('heading', { name: booking.statusHeading })).toBeVisible();
  const requested = booking.states.find((s: { id: string }) => s.id === 'requested');
  const confirmed = booking.states.find((s: { id: string }) => s.id === 'confirmed');
  await expect(status.locator('[data-state="requested"]')).toContainText(booking.statusWords.reached);
  await expect(status.locator('[data-state="confirmed"]')).toContainText(confirmed.name);
  await expect(status.locator('[data-state="confirmed"]')).toContainText(booking.statusWords.current);
  await expect(status.locator('[data-state="requested"]')).toContainText(requested.patientWords);
  await expect(status).toContainText(booking.acceptedBy);
});

test('an hour already held with a nurse is not offered for her again, and still is for whoever is nearest', async ({ page }) => {
  const d = await toNurseStep(page);
  const first = d.locator('.nurse-list .nurse-option').first();
  const name = (await first.locator('strong').innerText()).trim();
  await first.click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: '10:00', exact: true }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('checkbox').check();
  await confirmBooking(d);
  await d.getByRole('button', { name: 'View my visits' }).click();

  await goSection(page, 'Book a nurse');
  await page.getByRole('button', { name: /Wound care/ }).first().click();
  const again = page.getByRole('dialog');
  await again.getByRole('button', { name: 'Continue' }).click();
  await again.getByRole('button', { name: 'Continue' }).click();
  await again.locator('.nurse-list .nurse-option').filter({ hasText: name }).click();
  await again.getByRole('button', { name: 'Continue' }).click();
  await expect(again.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0);
  await expect(again.getByText(fill(booking.time.fewerHours, { nurse: name }))).toBeVisible();

  await again.getByRole('button', { name: 'Back' }).click();
  await again.getByRole('radio', { name: new RegExp(option('nearest').name) }).check();
  await again.getByRole('button', { name: 'Continue' }).click();
  await expect(again.getByRole('button', { name: '10:00', exact: true })).toBeVisible();
});

test('a visit asked for as soon as possible stays asked for, and says why nobody is on the way', async ({ page }) => {
  const d = await toNurseStep(page);
  await d.getByRole('button', { name: 'Continue' }).click(); // nearest → when
  const asap = scheduling.kinds.find((k: { id: string }) => k.id === 'asap');
  await d.getByRole('radio', { name: new RegExp(asap.name) }).check();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.locator('.review-line').filter({ hasText: booking.review.nurseLabel })).toContainText(booking.review.nearestValue);
  await d.getByRole('checkbox').check();
  await confirmBooking(d);
  const status = d.locator('.booking-status');
  await expect(status.locator('[data-state="requested"]')).toContainText(booking.statusWords.current);
  await expect(status.locator('[data-state="confirmed"]')).toContainText(booking.statusWords.waiting);
  await expect(status).toContainText(booking.asapStaysRequested);
  /* Nobody is named above a sentence saying nobody is looking for a nurse. */
  await expect(d.locator('.nurse-row')).toHaveCount(0);
});
