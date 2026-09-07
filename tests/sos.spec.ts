import { test, expect, type Page } from '@playwright/test';
/* Thuso SOS — the emergency pathway.
 *
 * These journeys check the four things that make this screen safe rather than impressive: that the
 * real ambulance number is above everything MyThuso sells and stays there, that one tick on the
 * first question ends the questions and sends somebody to an ambulance, that "under 45 minutes" is
 * shown as a target and never as an arrival estimate the app cannot work out, and that a nurse
 * whose clearance lapsed is refused even here.
 *
 * Nothing dials, so the last assertion in the first journey is that the screen says so. */
/* The sidebar on a desktop, the More tab on a phone — the same two taps a patient takes to reach
   the roadmap, on both viewports. */
const openSos = async (page: Page) => {
  await page.goto('/');
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click();
  else {
    await page.locator('.tabbar button').nth(4).click();
    await page.getByRole('button', { name: /^Explore MyThuso/ }).click();
  }
  await page.getByRole('button', { name: /Thuso SOS/ }).click();
  return page.getByRole('dialog');
};
/* The controls are labels wrapping a hidden input, so the label is what a person clicks. */
type Dialog = ReturnType<Page['getByRole']>;
const tick = (d: Dialog, text: string) => d.locator('.sos-flags label').filter({ hasText: text }).click();
const choose = (d: Dialog, text: string) => d.locator('.sos label').filter({ hasText: text }).first().click();
/* Ticking "None of these" is the only way past the first question, which is the design. */
const sayNoDanger = (d: Dialog) => tick(d, 'None of these');
/* Rosebank, someone can answer a phone: the one set of answers that reaches an offer. */
const askForAVisit = async (d: Dialog, area = 'Rosebank') => {
  await sayNoDanger(d);
  await d.getByLabel('Where is the person now?').selectOption(area);
  await choose(d, 'Yes');
};

test('the ambulance number is above everything MyThuso sells, and nothing dials', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const d = await openSos(page);
  const emergency = d.locator('.sos-emergency');
  await expect(emergency).toContainText('10177');
  await expect(emergency).toContainText('112');
  await expect(emergency).toContainText('10111');
  await expect(emergency).toContainText('MyThuso is not an ambulance service');
  await expect(emergency).toContainText('pressing a button on this screen does not call');
  // the emergency block is the first thing in the screen, before any MyThuso offer
  const order = await d.evaluate(root => {
    const sos = root.querySelector('.sos')!;
    return Array.from(sos.children).findIndex(child => child.classList.contains('sos-emergency'));
  });
  expect(order).toBeLessThanOrEqual(1);
  // no link, anywhere on this screen, tries to place a call
  expect(await d.locator('a[href^="tel:"]').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('one red flag ends the questions and sends you to an ambulance', async ({ page }) => {
  const d = await openSos(page);
  await tick(d, 'Chest pain or pressure');
  const outcome = d.locator('.sos-outcome.emergency');
  await expect(outcome).toContainText('Call an ambulance now');
  await expect(outcome).toContainText('There is no second screen');
  await expect(outcome.locator('.sos-dial')).toContainText('10177');
  // the routing questions never appear: nothing is asked after a red flag
  await expect(d.getByLabel('Where is the person now?')).toHaveCount(0);
  await expect(d.getByText(/These questions are routing, not triage/)).toBeVisible();
  await expect(d.getByText(/MyThuso does not decide who is sick/).first()).toBeVisible();
});

test('45 minutes is a target, and an arrival it cannot work out says so', async ({ page }) => {
  const d = await openSos(page);
  await askForAVisit(d);
  const target = d.locator('.sos-target');
  await expect(target).toContainText('Under 45 minutes · target');
  await expect(target).toContainText('It is not a guarantee');
  await expect(target).toContainText('never shown as one');
  // one nurse is measurable from a straight line and says so; the other is not and says that
  const rows = d.locator('.record-row.static');
  await expect(rows.filter({ hasText: 'Sister Naledi Mokoena' })).toContainText('not a road route, and not a promise');
  const estimating = rows.filter({ hasText: 'Sister Refilwe Sithole' });
  await expect(estimating).toContainText('Arrival estimating');
  await expect(estimating).toContainText('not sharing a position');
  // and the target is never printed as the estimate
  await expect(rows.filter({ hasText: 'About 45 min away' })).toHaveCount(0);
});

test('urgency does not lift a lapsed clearance', async ({ page }) => {
  const d = await openSos(page);
  await askForAVisit(d, 'Soweto');
  await choose(d, 'Only Sister Ayanda Dube');
  const refused = d.locator('.sos-outcome.refused');
  await expect(refused).toContainText('MyThuso cannot reach this');
  await expect(refused).toContainText('The nearest nurse is not cleared');
  await expect(refused).toContainText(/Police clearance lapsed/);
  await expect(refused.locator('.sos-dial')).toContainText('10177');
  await expect(d.getByText(/There is no override for a lapsed check/)).toBeVisible();
});

test('outside the hours and outside the coverage area each say what to do instead', async ({ page }) => {
  const d = await openSos(page);
  await askForAVisit(d);
  await choose(d, '02:10 · outside the hours');
  await expect(d.locator('.sos-outcome.refused')).toContainText('There is no urgent-visit rota running');
  await expect(d.locator('.sos-outcome.refused')).toContainText('Emergency services run all night');
  await choose(d, 'Now · inside the hours');
  await d.getByLabel('Where is the person now?').selectOption('Somewhere else in South Africa');
  await expect(d.locator('.sos-outcome.refused')).toContainText('outside the areas MyThuso can reach');
  await expect(d.locator('.sos-outcome.refused')).toContainText('reaches an ambulance anywhere in South Africa');
});

test('standing down is free, and an unanswered phone is not a cancellation', async ({ page }) => {
  const d = await openSos(page);
  await askForAVisit(d);
  await d.getByRole('button', { name: 'Ask her to come' }).first().click();
  const stand = d.locator('.sos-stand-down');
  await expect(stand).toContainText('A button that might charge you is a button that gets pressed too late');
  await stand.locator('label.sos-unanswered').click();
  await expect(stand.locator('.sos-holding')).toContainText('Silence is not a cancellation');
  await stand.getByRole('button', { name: 'I pressed it by mistake' }).click();
  await expect(stand.locator('.sos-stood-down')).toContainText('Do not travel');
  await expect(stand.locator('.sos-stood-down')).toContainText("Nothing about anybody's health");
});

test('every way this fails says what to do instead', async ({ page }) => {
  const d = await openSos(page);
  const cards = d.locator('.sos-failures .sos-failure');
  await expect(cards).toHaveCount(6);
  await expect(cards.filter({ hasText: 'No signal' })).toContainText('does not need airtime');
  await expect(cards.filter({ hasText: 'No nurse in range' })).toContainText('not a queue and you are not on a waiting list');
  // Thuso Alert is described and refused rather than sold
  await expect(d.locator('.sos-alert')).toContainText('Not built');
  await expect(d.locator('.sos-alert')).toContainText('not medical cover');
  await expect(d.getByText(/will not put a scoring algorithm between a frightened person and an ambulance/)).toBeVisible();
  await expect(d.getByText(/Nobody is asked for a card/)).toBeVisible();
});
