import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The cash code at the door and the desk that releases a held payment.
 *
 * What these journeys hold is the half of the feature worth holding: the code is asked for only on a completed
 * visit; a wrong code is refused in the route's own sentence and the patient's code is not shown twice; the
 * limit holds the payment and even the right code is refused while it is held; and the desk cannot lift a hold
 * without a reason, and says who lifted it, when and why. Every sentence and figure is read from
 * packages/catalog — the refusals from packages/catalog/apis/money.json, the price from services.json — never
 * typed here. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${path}`, import.meta.url), 'utf8'));
const care = json('care.json');
const money = json('money.json');
const api = json('apis/money.json');
const services = json('services.json') as { id: string; name: string; price: number }[];
const nurse = money.cash.nurse as Record<string, string>;
const desk = money.cash.desk as Record<string, string>;
const limit: number = money.cash.attemptLimit;
const said = (path: string, version: number, id: string): string =>
  api.routes.find((r: { method: string; path: string; version: number }) => r.method === 'POST' && r.path === path && r.version === version)
    .refusals.find((x: { id: string }) => x.id === id).statement;
const ENTRY = '/v1/money/payments/{paymentRef}/cash-code';
const RELEASE = '/v1/money/payments/{paymentRef}/release';
/* No word boundary after the figure: a desk row sets the amount directly beside the nurse's reference, and "R 299N-205"
   has none. What matters is that no further digit follows, so R 299 is never read as R 2990. */
const rand = (n: number) => new RegExp(`R\\s?${n}(?!\\d)`);
const digitOne = `${nurse.codeLabel}, digit 1 of ${money.cash.codeLength}`;
/* A code certainly not the one issued: every digit moved on by one. */
const notThe = (code: string) => code.split('').map(d => String((Number(d) + 1) % 10)).join('');

/* The nurse's preview visit, walked to completion the way tests/care-visit.spec.ts walks it. */
async function completeThePreviewVisit(page: Page) {
  await openWorkspace(page, 'Nurse');
  await page.locator('.care-offer').getByRole('button', { name: 'Accept this visit' }).click();
  await page.locator('.care-slot').getByRole('button', { name: 'Continue this visit' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'I am at the door' }).click();
  await expect(d.getByRole('heading', { name: 'Confirm you are at the right door' })).toBeVisible();
  await d.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await d.getByRole('button', { name: 'Start the visit' }).click();
  await expect(d.getByRole('heading', { name: 'Checklist' })).toBeVisible();
  await d.getByRole('button', { name: 'Continue to readings and sign-off' }).click();
  await expect(d.getByRole('heading', { name: 'Readings and sign-off' })).toBeVisible();
  await d.getByRole('button', { name: 'Open the visit assessment' }).click();
  await d.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Confirm identity' }).click();
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Start observations' }).click();
  await d.getByLabel('Blood pressure — systolic').fill('132');
  await d.getByRole('button', { name: 'Record findings' }).click();
  await d.getByLabel('Next step').selectOption('Refer for doctor review today');
  await d.getByRole('button', { name: 'Review sign-off' }).click();
  await d.getByRole('button', { name: 'Sign assessment' }).click();
  await d.getByRole('button', { name: /Back to the workspace/ }).click();
  const visit = page.getByRole('dialog');
  await expect(visit).toContainText('Signed off on this device.');
  await visit.getByRole('button', { name: 'Continue to handover' }).click();
  await visit.getByRole('button', { name: 'Hand to a doctor' }).click();
  await expect(visit).toContainText(care.handover.queued);
  await visit.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await visit.getByRole('button', { name: 'Complete the visit' }).click();
  await expect(visit).toContainText(care.complete.billable);
  const door = visit.locator('.cash-door');
  await expect(door.getByRole('heading', { name: nurse.heading })).toBeVisible();
  await door.scrollIntoViewIfNeeded();
  const code = ((await door.locator('.cash-phone-code').textContent()) ?? '').trim();
  expect(code).toMatch(new RegExp(`^\\d{${money.cash.codeLength}}$`));
  return { door, code };
}

async function enter(door: ReturnType<Page['locator']>, code: string) {
  await door.getByLabel(digitOne).fill(code);
  await door.getByRole('button', { name: nurse.enter }).click();
}

test('at completion a wrong cash code is refused in the route’s words, the patient’s code is not shown again, and the right one records the cash', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const { door, code } = await completeThePreviewVisit(page);
  const service = services.find(s => s.id === care.preview.serviceId)!;
  await expect(door.locator('.cash-door-owed')).toContainText(rand(service.price));
  await expect(door).toContainText(nurse.shownOnce);
  await expect(door).toContainText(noticeFor('payments')!);

  await enter(door, notThe(code));
  await expect(door.locator('.cash-door-said')).toHaveText(said(ENTRY, 2, 'cash-without-otp'));
  await expect(door.locator('.cash-phone-code')).toHaveCount(0);
  await expect(door).toContainText(nurse.shownAlready);

  await enter(door, code);
  await expect(door.locator('.cash-door-recorded')).toHaveText(nurse.recorded);
  await expect(door.locator('.cash-door-owed')).toContainText(money.states.find((s: { id: string }) => s.id === 'succeeded').name);
  await expect(door.getByRole('button', { name: nurse.enter })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('wrong cash codes to the limit hold the payment for the desk, and the right code is refused while it is held', async ({ page }) => {
  test.setTimeout(150_000);
  const { door, code } = await completeThePreviewVisit(page);
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    await enter(door, notThe(code));
    await expect(door.locator('.cash-door-said')).toHaveText(said(ENTRY, 2, attempt < limit ? 'cash-without-otp' : 'cash-code-held'));
  }
  await enter(door, code);
  await expect(door.locator('.cash-door-said')).toHaveText(said(ENTRY, 2, 'cash-code-held'));
  await expect(door.locator('.cash-door-recorded')).toHaveCount(0);
});

test('the desk is refused a release without a reason, and releases a held cash payment with one, saying who, when and why', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Incidents');
  const panel = page.locator('.cash-desk');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByRole('heading', { name: desk.heading })).toBeVisible();
  await expect(panel).toContainText(desk.intro);
  const rows = panel.locator('.cash-desk-row');
  await expect(rows).toHaveCount(money.cash.deskPreview.length);

  const first = rows.first();
  const service = services.find(s => s.id === money.cash.deskPreview[0].serviceId)!;
  await expect(first).toContainText(service.name);
  await expect(first).toContainText(rand(service.price));
  await expect(first).toContainText(desk.wrongCodes.replace('{count}', String(limit)));

  await first.getByRole('button', { name: desk.release }).click();
  await expect(first.locator('.cash-desk-refusal')).toHaveText(said(RELEASE, 2, 'release-without-a-reason'));

  const reason = money.cash.releaseReasons[0] as { text: string };
  await first.getByLabel(reason.text).check();
  await first.getByRole('button', { name: desk.release }).click();
  const released = first.locator('.cash-desk-released');
  await expect(released).toContainText(desk.released);
  await expect(released).toContainText(reason.text);
  await expect(released).toContainText('O-801');
  /* The other held payment is untouched by this release. */
  await expect(rows.nth(1).getByRole('button', { name: desk.release })).toBeVisible();
  await expect(panel).toContainText(noticeFor('payments')!);
  expect(errors).toEqual([]);
});
