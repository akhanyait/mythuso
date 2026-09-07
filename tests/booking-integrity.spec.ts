import { test, expect, type Page } from '@playwright/test';
/* The booking journey, and the six defects it used to carry.
 *
 * These are written against behaviour a person can observe — a weekday that matches its date, a
 * date that survives a confirmation — rather than against the implementation that produces it. Each
 * one failed before the fix; none of them mirrors the code that now passes it. */

/** The days the app offers, worked out the same way a reader would: from a calendar. */
function expectedDays(count = 5, firstOffset = 1) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.now() + (firstOffset + i) * 86_400_000);
    const inZa = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric' });
    const parts = inZa.formatToParts(date);
    days.push({
      weekday: parts.find(p => p.type === 'weekday')!.value.toUpperCase(),
      day: parts.find(p => p.type === 'day')!.value
    });
  }
  return days;
}

/* The shell is a sidebar from 1000px and a tab bar below it, so these journeys navigate through
   whichever one this project actually renders rather than assuming either. */
const tabOrder = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'More'];
async function go(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name, exact: true }).click(); return; }
  await page.locator('.tabbar button').nth(tabOrder.indexOf(name)).click();
}

const openService = async (page: Page, name: RegExp) => {
  await page.goto('/');
  await page.getByRole('button', { name }).first().click();
  return page.getByRole('dialog');
};

test('every weekday in the date strip belongs to the date beside it', async ({ page }) => {
  const d = await openService(page, /Vitals & chronic check/);
  await d.getByRole('button', { name: 'Continue' }).click();
  const chips = await d.locator('.date-chip').allInnerTexts();
  expect(chips).toHaveLength(5);
  // the strip used to read "Fri 12 Sep" whatever the calendar said; 12 September 2026 is a Saturday
  chips.forEach((chip, i) => {
    const [weekday, day] = chip.split('\n');
    expect(`${weekday} ${day}`).toBe(`${expectedDays()[i].weekday} ${expectedDays()[i].day}`);
  });
});

test('a visit ends its own duration after it starts, not an hour later', async ({ page }) => {
  // vitals is 30 minutes in the catalogue, so 09:00 ends at 09:30
  const vitals = await openService(page, /Vitals & chronic check/);
  await vitals.getByRole('button', { name: 'Continue' }).click();
  await expect(vitals.getByText(/09:00 – 09:30 \(30 minutes\)/)).toBeVisible();
  // wound care is 40, and the same 09:00 slot ends at 09:40
  await page.goto('/');
  const wound = await openService(page, /Wound care/);
  await wound.getByRole('button', { name: 'Continue' }).click();
  await expect(wound.getByText(/09:00 – 09:40 \(40 minutes\)/)).toBeVisible();
});

test('the date chosen survives the confirmation and reaches the visit list', async ({ page }) => {
  const d = await openService(page, /Mother & baby/);
  await d.getByLabel('Who is this visit for?').selectOption('Nomsa Molefe');
  await d.getByRole('button', { name: 'Continue' }).click();
  // pick the third day offered, which is not the default
  const third = expectedDays()[2];
  await d.locator('.date-chip').nth(2).click();
  await d.getByRole('button', { name: '14:00', exact: true }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  // the review states the full date, not just a time
  await expect(d.getByText(new RegExp(`${third.day} September 2026`))).toBeVisible();
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm & book' }).click();
  await expect(d.getByText(new RegExp(`${third.day} September 2026`))).toBeVisible();
  await expect(d.getByText('14:00 – 14:45')).toBeVisible();
  await d.getByRole('button', { name: 'View my visits' }).click();
  // and the list shows that day, not a hard-coded one
  const first = page.locator('.panel').first();
  await expect(first).toContainText(new RegExp(third.weekday, 'i'));
  await expect(first).toContainText('14:00 – 14:45');
  await expect(first).toContainText('Nomsa Molefe');
});

test('the home visit card is the visit you booked, not a fixture', async ({ page }) => {
  await page.goto('/');
  // with nothing booked it offers a way to book rather than inventing an appointment
  await expect(page.getByText('Nothing booked yet')).toBeVisible();
  await expect(page.getByText('Vitals & chronic check · 12 September')).toHaveCount(0);
  // elderly care is not one of the four shortcuts, so it is reached through the catalogue
  await go(page, 'Book a nurse');
  await page.getByRole('button', { name: /Elderly care/ }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm & book' }).click();
  await d.getByRole('button', { name: 'View my visits' }).click();
  await go(page, 'Overview');
  const card = page.locator('.visit-card');
  await expect(card).toContainText('Elderly care');
  await expect(card).toContainText('09:00');
});

test('an arrival estimate belongs to care asked for now, not to an appointment', async ({ page }) => {
  const d = await openService(page, /Vitals & chronic check/);
  await d.getByRole('button', { name: 'Continue' }).click();
  // choosing a date and hour: no estimate, because "when will somebody arrive" is already answered
  await expect(d.getByText(/Average arrival time/)).toHaveCount(0);
  await expect(d.locator('.eta-note')).toHaveCount(0);
  await d.getByRole('radio', { name: /As soon as someone is free/ }).check();
  // and now there is no date strip to contradict, and the estimate has a question to answer
  await expect(d.locator('.date-chip')).toHaveCount(0);
  await expect(d.locator('.eta-note')).toBeVisible();
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('button', { name: 'Continue' }).click();
  await expect(d.getByText('As soon as someone is free')).toBeVisible();
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm & book' }).click();
  await expect(d.locator('.success-when')).toHaveText('Looking for a nurse');
});

test('each shortcut on the home opens the service it names', async ({ page }) => {
  for (const [name, price] of [['Vitals & chronic check', 'R 249'], ['Wound care', 'R 299'], ['Mother & baby', 'R 349'], ['Blood tests', 'R 299']] as const) {
    await page.goto('/');
    await page.locator('.shortcut-row').filter({ hasText: name }).click();
    const d = page.getByRole('dialog');
    await expect(d.locator('.booking-summary')).toContainText(name);
    await expect(d.locator('.booking-summary')).toContainText(price);
    await d.getByRole('button', { name: 'Close dialog' }).click();
  }
});

test('the search field carries its query into the service list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search for care' }).fill('wound');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search services' })).toHaveValue('wound');
  await expect(page.locator('.catalog-grid .service-card')).toHaveCount(1);
  await expect(page.locator('.catalog-grid .service-card').first()).toContainText('Wound care');
});

test('a clinical workspace navigates as itself, not as the patient shop', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const bar = page.locator('.tabbar');
  const entries = async () => (await nav.isVisible() ? nav : bar).locator('button').allInnerTexts();
  const patient = await entries();
  expect(patient.join(' ')).toMatch(/Book/);
  for (const [role, first, expected] of [
    ['Nurse', 'Schedule', 'Earnings & payouts'],
    ['Doctor', 'Review queue', 'Teleconsultation'],
    ['Partner', 'Orders', 'Collections'],
    ['Control Tower', 'Dispatch', 'Incidents']] as const) {
    await page.locator('button.demo-pill').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Preview workspaces/ }).click();
    await page.getByRole('dialog').getByRole('button').filter({ has: page.getByText(role, { exact: true }) }).click();
    const shown = (await entries()).join(' ');
    expect(shown, `${role} should navigate by its own work`).toContain(expected);
    // and none of the patient's shopping stays behind
    expect(shown).not.toContain('Thuso Wallet');
    expect(shown).not.toContain('Care plans');
    // switching lands on that role's own first section rather than leaving a patient page behind
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(first);
  }
});
