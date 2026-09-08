import { test, expect, type Page } from '@playwright/test';
import { goSection } from './nav';
/* The two states a real condition produces, driven by the condition.
 *
 * loading, error, offline, denied and empty were reachable only through StatePicker — a
 * design-review control that shipped on screens a nurse opens, and the only way a test could see
 * four of the five. The picker is gone. Most of its coverage moved into check-boundaries.mjs, which
 * is stronger for the copy: it asserts that offline still promises what you opened stays available,
 * that denied still says declining never blocks a visit, that error still says nothing was lost.
 *
 * What a source check cannot assert is that anything renders them. That is this file. It exists
 * because a state nothing can reach is a state nobody maintains, and because the same reasoning that
 * removed the picker applies to its replacement: a check that reads States.tsx passes just as
 * happily when every call site is pinned to 'ready' forever.
 *
 * The access log is the surface, and it earned it. fetchAccessLog() returns null for a network
 * error, an offline device, a non-ok response and a service that is not running, and the screen
 * used to show fixtures for all four as though nothing had happened. Four different facts, one
 * silence. Now the condition decides, and /api/health tells "the service failed" apart from "the
 * identity service is deliberately switched off", which is not a failure and must not be dressed as
 * one.
 *
 * Neither driver simulates anything. setOffline is the browser's own offline mode, and the aborted
 * route is a request that genuinely does not arrive.
 */


/* A running service is two answers, not one. Routing /api/health to 200 tells the app a real
   identity service exists; it then asks /api/auth/session, gets nothing, and signs the person out —
   so the shell never renders and the journey below cannot even reach the screen it is about.
   Both tests that need "the service is up" need both. */
const entry = (actorLabel: string, outcome: 'granted' | 'refused') => ({
  at: Date.now() - 3_600_000, actorLabel, actorRole: 'nurse', capability: 'view-clinical-record',
  purpose: 'treatment', lawfulBasis: 'consent', recordType: 'vitals', outcome,
  refusedBy: outcome === 'refused' ? 'vetting' : null, reason: null,
  consentPurpose: 'treatment', consentVersion: 1, auditId: null
});

const serviceIsUp = async (page: Page, log = true) => {
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.route('**/api/auth/session', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ person: { id: 'p-1', phone: '+27821234567', name: 'Lerato Molefe' } }) }));
  if (!log) return;
  await page.route('**/api/consent/access-log', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ entries: [entry('Sister Naledi Mokoena', 'granted'), entry('Dr A. Dlamini', 'refused')] }) }));
};

/* Privacy & settings is in the sidebar on a desktop and behind More on a phone. Both are real
   routes, so this takes whichever one the viewport has — through goSection, which is the one place
   in the suite that knows what the shell looks like. */
async function openAccessLog(page: Page) {
  await goSection(page, 'Privacy & settings');
  await expect(page.getByRole('heading', { name: 'Your data. Your choices.' })).toBeVisible();
  await page.getByRole('button', { name: 'View access history' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Who opened your record' })).toBeVisible();
  return dialog;
}

test('losing the connection says so, and does not quietly show yesterday’s log', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await context.setOffline(true);

  const dialog = await openAccessLog(page);
  const block = dialog.locator('.state-block.offline');
  await expect(block).toBeVisible();

  /* The promise, word for word from States.tsx. A person who has lost signal in a taxi needs to know
     the difference between "we cannot reach the service" and "nobody has opened your record",
     because the second is a sentence about their privacy and the first is a sentence about the
     network. */
  await expect(block).toContainText('stays available');
  await expect(block).toContainText('nothing you entered has been lost');

  /* And the fixtures are not underneath it. Showing a cached-looking log while offline is the
     defect this replaced: it reads as current and is not. */
  await expect(dialog.locator('.access-row')).toHaveCount(0);

  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('a request that does not arrive is an error, and says nothing was lost', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  /* The service answers /api/health — so it is running — and then the access log itself fails. That
     is the combination that means error rather than not-connected, and the only one that should
     reach this state. */
  await serviceIsUp(page, false);
  await page.route('**/api/consent/access-log', route => route.abort());
  await page.goto('/');

  const dialog = await openAccessLog(page);
  const block = dialog.locator('.state-block.error');
  await expect(block).toBeVisible();
  await expect(block).toContainText('nothing was lost');
  /* An error state is announced, not merely drawn. States.tsx gives error role="alert" and the
     other two role="status"; a reader who cannot see the panel is told either way. */
  await expect(block).toHaveAttribute('role', 'alert');
  await expect(dialog.locator('.access-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the identity service being switched off is not an error, and is not silence either', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  /* No service at all: /api/health does not answer. The identity service is deliberately off until
     DNS, TLS and an SMS provider exist, so a failed fetch here is expected. Dressing it as an error
     would teach people to ignore the error state, and showing fixtures with no notice would be the
     original defect. It gets the sample data and a sentence saying what is not connected. */
  await page.route('**/api/health', route => route.abort());
  await page.route('**/api/consent/access-log', route => route.abort());
  await page.goto('/');

  const dialog = await openAccessLog(page);
  await expect(dialog.locator('.state-block.error')).toHaveCount(0);
  await expect(dialog.locator('.state-block.offline')).toHaveCount(0);
  await expect(dialog.locator('.not-connected')).toBeVisible();
  /* The fixtures are still there — the screen is useful — but nobody can mistake them for a record
     of who actually opened anything. */
  await expect(dialog.locator('.access-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('signal lost while the log is open is noticed, not waited for', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  /* A service that is running and a log that answers, so the screen starts in the state a person
     actually arrives in: live, with real rows. */
  await serviceIsUp(page);
  await page.goto('/');

  const dialog = await openAccessLog(page);
  await expect(dialog.locator('.access-row').first()).toBeVisible();

  /* Signal goes, and nothing is reloaded and nothing is clicked. This is the case reading
     navigator.onLine at fetch time cannot reach: the request already succeeded, so there is no
     second fetch to notice the failure, and without an offline listener the screen sits showing a
     log that is no longer current while saying nothing about it.

     It is guarded here rather than left to the two drivers above because both of those go offline
     before the page loads, which every implementation passes — including the one that never
     notices. A person in a lift or a taxi meets this one instead. */
  await context.setOffline(true);
  const block = dialog.locator('.state-block.offline');
  await expect(block).toBeVisible();
  await expect(block).toContainText('stays available');
  await expect(dialog.locator('.access-row')).toHaveCount(0);

  /* And it comes back on its own when the signal does. An offline notice that needs a reload to
     clear is a second dead end. */
  await context.setOffline(false);
  await expect(dialog.locator('.state-block.offline')).toHaveCount(0);
  await expect(dialog.locator('.access-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});

/* What a nurse downloads before she can see her first visit.
 *
 * mapbox-gl is 1.8 MB. It was in the patient's bundle; taking it out put it in the staff bundle,
 * which is worse rather than better — a patient opens this app a few times a month, usually on wifi,
 * and a nurse has it open all day in the field on a prepaid bundle she is paying for out of the
 * visit fee. This asserts the shape that fixed it: the map is a dynamic import, so in a build with
 * no tile token — this repository, and every run of this suite — it is never requested at all.
 *
 * It watches the network rather than the bundle report, because what matters is what the handset
 * actually asks for. */
test('a nurse downloads no map she is never shown', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', r => { if (/mapbox|TileMap/i.test(r.url())) asked.push(r.url()); });
  await page.goto('/staff.html');
  await page.locator('.staff-signin-roles .record-row').filter({ has: page.getByText('Nurse', { exact: true }) }).click();
  await goSection(page, 'Earnings & payouts');
  expect(asked, `a nurse's session fetched the map bundle without ever opening a map: ${asked.join(', ')}`).toEqual([]);
});

test('and the controller who is shown one still gets it', async ({ page }) => {
  await page.goto('/staff.html');
  await page.locator('.staff-signin-roles .record-row').filter({ has: page.getByText('Control Tower', { exact: true }) }).click();
  /* No token is committed to this repository, so the schematic is what draws — from the same
     coordinates, with no network at all. The board is never empty for want of a key. */
  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  await expect(page.locator('.map-pin').first()).toBeVisible();
});
