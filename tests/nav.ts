import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* The shell is a sidebar from 1000px and a tab bar below it, and since the workspaces got their own
   navigation both carry role sections rather than the patient's tabs. Journeys go through whichever
   one the viewport actually renders.

   Both are matched by accessible name rather than by visible text: a clinical tab shows a short
   label — "Earnings", "Repeats", "Consult" — under an accessible name that is the whole section, so
   a journey can name the section once and reach it on either viewport. */
export async function goSection(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) {
    const entry = sidebar.getByRole('button', { name, exact: true });
    if (await entry.count()) { await entry.click(); return; }
    /* Not every destination is a nav row. Privacy & settings and Language & access sit in the
       sidebar's foot as settings links, and a helper that only knew about the navigation landmark
       sent every caller into a thirty-second wait for a button that was never going to be there. */
    await page.locator('button.settings-link').filter({ hasText: name }).first().click();
    return;
  }
  /* By accessible name rather than visible text: a clinical tab shows a short label and carries the
     whole section name for a screen reader, so "Earnings & payouts" is never what is drawn. */
  const tab = page.locator('.tabbar').getByRole('button', { name, exact: true });
  if (await tab.count()) { await tab.first().click(); return; }
  /* And on a phone the rest of the patient's sections live behind More. */
  await page.locator('.tabbar button').last().click();
  const row = page.locator('.menu-row').filter({ hasText: name });
  await expect(row.first()).toBeVisible();
  await row.first().click();
}

/* The three applications, each at its own entry.
 *
 * There is no workspace picker inside the product any more — a role is what an account carries, and
 * the only reason a journey gets to choose one here is that the identity service is switched off,
 * which is exactly what the signed-out staff screen says on itself. */
export async function openWorkspace(page: Page, role: string) {
  await page.goto('/staff.html');
  await page.locator('.staff-signin-roles .record-row').filter({ has: page.getByText(role, { exact: true }) }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('navigation', { name: 'Main navigation' })).first()).toBeVisible();
}
export async function openAdminConsole(page: Page) {
  await page.goto('/admin.html');
  await page.locator('.staff-signin-roles .record-row').click();
  await expect(page.getByRole('heading', { name: 'Operations console' })).toBeVisible();
}

/* Explore MyThuso is the patient's roadmap page and the door to the first-run flow, the state
   gallery and the module previews. It is a sidebar entry on a wide screen and lives behind More on
   a phone, which is why it needs a helper of its own rather than goSection. */
export async function goExplore(page: Page) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click(); return; }
  await page.locator('.tabbar button').nth(4).click();
  await page.locator('.menu-row').filter({ hasText: 'Explore MyThuso' }).first().click();
}
export async function openFirstRun(page: Page) {
  await goExplore(page);
  /* The design-review card called "First-run & recovery" is gone with the rest of the scaffolding.
     Sign-up is reached the way a person reaches it: the highlighted card that offers to set the
     account up. */
  await page.locator('.module-card').filter({ hasText: 'Set up your account' }).click();
}
export async function openModule(page: Page, name: string) {
  await goExplore(page);
  await page.locator('.module-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
}

/* The sentence a screen shows for a capability, chosen the way the app chooses it.
 *
 * Read from packages/catalog/capabilities.json rather than typed into a spec, because that is
 * exactly the drift these tests were caught by: five of them asserted "No payment is taken" — the
 * sentence for a capability with nothing behind it — and went on asserting it after the contract
 * grew a third state and a simulator started answering. A test carrying its own copy of a notice is
 * one more place for the notice to be wrong, and the least likely one to be noticed.
 *
 * Null when the capability is connected, because then no notice renders at all. */
const capabilityContract = JSON.parse(readFileSync(new URL('../packages/catalog/capabilities.json', import.meta.url), 'utf8')) as {
  capabilities: { id: string; connected: boolean; state: string; notice: string; simulation?: { notice: string; refuses: string[] } }[];
};
export const capabilityOf = (id: string) => {
  const found = capabilityContract.capabilities.find(c => c.id === id);
  if (!found) throw new Error(`No capability "${id}" in packages/catalog/capabilities.json`);
  return found;
};
export const noticeFor = (id: string): string | null => {
  const found = capabilityOf(id);
  return found.connected ? null : found.simulation ? found.simulation.notice : found.notice;
};

/* Confirming a booking, now that there is a payment behind the button.
 *
 * The simulated provider declines roughly one attempt in five, deterministically per visit, and a
 * declined payment does not book a visit — dispatching a nurse to a house against money that was
 * refused is the one outcome this screen must not produce. So a journey that means to end up with a
 * booking has to do what a person does: try again. The retry is a new attempt at the provider
 * rather than the same one replayed, which is why the answer can change.
 *
 * Written here rather than in each spec so that the six journeys that book a visit say what they
 * mean — "book this" — instead of each carrying its own loop. */
export async function confirmBooking(scope: Locator) {
  const retry = scope.getByRole('button', { name: 'Try the payment again' });
  const onwards = scope.getByRole('button', { name: 'View my visits' });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await scope.getByRole('button', { name: attempt === 0 ? 'Confirm & book' : 'Try the payment again' }).click();
    /* Settled one way or the other before the next look: either the flow has moved on and offers
       the visit list, or the decline is on the screen with the button that tries again. */
    await expect(retry.or(onwards).first()).toBeVisible();
    if (!(await retry.isVisible())) return;
  }
  throw new Error('Eight simulated payment attempts on one visit and every one of them was declined. The provider declines about one in five, so this is a seed that has stopped varying rather than a run of bad luck.');
}
