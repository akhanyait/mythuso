import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
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
  /* The body is the shape apps/api's own GET /health answers, not a bare 200: since 787d397 probe()
     checks for it, because nginx's single-page fallback answers any GET with a 200 and a page. A stub
     that says only {"ok":true} is, to the app, that fallback — and the log then reads "not connected"
     where this file needs "the service is up and the log itself failed". */
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, environment: 'test', holds: 'identity and workforce vetting, no health information' }) }));
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
  await page.goto('/app/');
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
  await page.goto('/app/');

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
  await page.goto('/app/');

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
  await page.goto('/app/');

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
 * The map library is 1.8 MB. It was in the patient's bundle; taking it out put it in the staff
 * bundle, which is worse rather than better — a patient opens this app a few times a month, usually
 * on wifi, and a nurse has it open all day in the field on a prepaid bundle she is paying for out of
 * the visit fee. This asserts the shape that fixed it: the map is a dynamic import, so a session
 * that never opens a map never requests it.
 *
 * The pattern is wider than it was rather than narrower. It named mapbox-gl, and the library is
 * MapLibre now; mapbox stays in it anyway, because a change that puts the old one back is precisely
 * what this test is for. Added to it: maplibre, and the tile host out of the contract. A tile
 * request is not a bundle, but it is the other thing a session that opens no map must never make,
 * and it is the one that leaks a viewport rather than a megabyte.
 *
 * It watches the network rather than the bundle report, because what matters is what the handset
 * actually asks for. */
const geography = JSON.parse(readFileSync(new URL('../packages/catalog/geography.json', import.meta.url), 'utf8'));
const mapTraffic = new RegExp(`mapbox|maplibre|TileMap|${geography.rendering.source.host.replace(/\./g, '\\.')}`, 'i');

test('a nurse downloads no map she is never shown', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', r => { if (mapTraffic.test(r.url())) asked.push(r.url()); });
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Earnings & payouts');
  expect(asked, `a nurse's session fetched the map bundle without ever opening a map: ${asked.join(', ')}`).toEqual([]);
});

test('and the controller who is shown one still gets it', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', r => { if (mapTraffic.test(r.url())) asked.push(r.url()); });
  await openWorkspace(page, 'Control Tower');
  /* Streets are off until somebody asks for them, so the schematic is what a controller is handed —
     from the same coordinates, with no network at all. The board is never empty for want of a
     provider, and opening it has told no tile server that a dispatch board in Johannesburg is
     open. */
  await expect(page.locator('.livemap-canvas.schematic')).toBeVisible();
  await expect(page.locator('.map-pin').first()).toBeVisible();
  expect(asked, `the dispatch board fetched a map nobody asked it for: ${asked.join(', ')}`).toEqual([]);
});

/* What a patient downloads, and what a clinician downloads.
 *
 * mapbox-gl was the first thing taken out of the patient's bundle, and the test above holds it by
 * watching the network rather than by reading a build report — because what matters is what the
 * handset asks for. This is the same assertion for the rest of the split.
 *
 * The patient entry and the staff entry used to share a 384 kB chunk. Not React and not the
 * contracts: feature modules. features/Pages.tsx held the patient's catalogue, visit list, passport,
 * wallet and family circle *and* the nurse's day and the doctor's queue; features/Orders.tsx held
 * the prescription a patient reads *and* the pharmacy partner's three boards; and features/Kit.tsx
 * imported `observations` from features/Clinical.tsx, which only re-exports it — one convenience
 * edge that pulled the doctor's review, the visit assessment, the consultation composer and the
 * offline queue onto the phone of everybody who ever opened Thuso Kit. Splitting the two files and
 * taking the shortest path to that one value moved fourteen modules off the patient's side.
 *
 * The assertion is not "the patient fetches none of those fourteen", because that list rots the
 * moment somebody adds a fifteenth. It is that the *intersection* of the two audiences is exactly
 * the set below — so a module that becomes shared has to be added here by somebody who has decided
 * it should be, and a module that stops being shared has to be taken out. Both directions fail.
 *
 * Only features/, shells/ and map/ are counted: those are the modules that belong to an audience.
 * components/ is the design system and is shared by construction, so a rule about it would say
 * nothing. Four of the five below are shared on purpose — Thuso Kit and its capture sheet are one
 * screen a patient and a nurse both open, the prescription a pharmacist verifies is the same
 * document a patient reads in the Health Passport, and the map draws both an arrival and a dispatch
 * board. The fifth is the demo login, which is now the way into all of them.
 *
 * WHAT CHANGED WHEN THE ENTRIES BECAME ONE, AND IT IS A COST RATHER THAN A SAVING. There were two
 * HTML entries and a sign-in screen each; there is one entry and a role in the query string. The
 * patient application is what that address means with no role on it, so it is imported statically —
 * which means a clinician opening /app/?role=nurse downloads it too. Measured against the built
 * bundle, gzipped: a patient's first load went from 287.2 kB to 286.6 kB, and a nurse's from 278.2
 * kB to 365.8 kB and the back office's from 285.3 kB to 340.8 kB.
 *
 * That is a promise to nurses partly given back, so it is recorded here in the number rather than
 * deleted from the assertions. The half that still holds is the one that started this work and the
 * one this file was written for: a patient still downloads no clinical module. The half that does
 * not is asserted in the opposite direction below — the ratchet is the *list*, so a clinician
 * picking up a patient module nobody expected still fails. Making the patient application lazy as
 * well closes it, at 292.1 kB for the patient and a fallback on every patient load, which is the
 * wrong way round for the audience this product is for. Splitting the patient's own screens behind
 * their own dynamic imports closes it for both, and is the fix worth making. */
const SHARED_BY_BOTH_AUDIENCES = ['DemoLogin', 'Kit', 'KitCapture', 'LiveMap', 'Orders'];
/* What a clinical session picks up from the patient application it now shares an entry with, because
   the patient application is statically imported by the door. Ratcheted: a seventeenth name here
   means somebody added a patient screen to the eager graph, which is the thing to look at. Every one
   of them is reached from features/Pages.tsx, features/Access.tsx or the patient shell, and not one
   of them is drawn on a clinical screen. */
/* Booking left this list in Wave 3, and deliberately: the booking flow grew a person step and the booking
   domain, and it now arrives on a dynamic import from App.tsx the moment somebody opens a service. A
   clinician never opens one, so a clinician no longer downloads it — and neither does a patient who
   only reads their visits. */
/* Thuso SOS left this list in Wave 4, for the same reason: the pathway gained the Safety engine's rules for a press and
   next of kin, and it now arrives on a dynamic import from App.tsx when somebody opens it, with the emergency numbers as
   the fallback so they never wait for the download. */
/* The household record and the sponsor's statement left this list in Wave 6, for the same reason again:
   between them they carry the records contract, packages/catalog/household.json, the programmes contract
   and the Access domain behind the roster, and both are opened from a dialog or a row rather than drawn on
   a patient's first view. They arrive on dynamic imports from App.tsx now, a boundary check fails if either
   is imported statically, and the patient's first load fell 14 kB. A clinician never opens either. */
const CARRIED_BY_THE_ONE_ENTRY = [
  'Access', 'Arrival', 'Consent', 'Dashboard', 'Guardian', 'Help',
  'Interpreting', 'Onboarding', 'Pages', 'Passport', 'PatientShell', 'VisitSummary',
  /* Live well, added the same night as the one entry. It is a patient feature and the patient is
     the default surface, so it loads with the rest of the patient app rather than behind a role —
     which is the cost this list exists to keep visible, not a leak. The ratchet did its job: it
     failed on a sixteenth name and made somebody write this sentence. */
  'Wellbeing'
];

/** Every audience-owned source module a session actually asked the server for, by name. */
async function modulesFetched(page: Page, session: () => Promise<void>) {
  const asked = new Set<string>();
  /* Removed again afterwards. A listener left attached goes on recording into the next session's
     page, which is how this test first "proved" that a patient downloads the dispatch board. */
  const watch = (request: { url(): string }) => {
    const match = request.url().match(/\/src\/(?:features|shells|map)\/([A-Za-z]+)\.tsx/);
    if (match) asked.add(match[1]);
  };
  page.on('request', watch);
  await session();
  page.off('request', watch);
  return asked;
}

/* The patient's own navigation, on either viewport. goSection() in nav.ts matches a tab by its
   accessible name, and the patient's tabs are short labels — "Book care" for Book a nurse — so it
   cannot reach three of these on a phone. The tab bar's order is the shell's own, and everything
   else is behind More. */
const PATIENT_TABS = ['Overview', 'Book a nurse', 'My visits', 'Health Passport'];
async function patientSection(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) {
    const entry = sidebar.getByRole('button', { name, exact: true });
    if (await entry.count()) { await entry.click(); return; }
    const settings = page.locator('button.settings-link').filter({ hasText: name });
    if (await settings.count()) { await settings.first().click(); return; }
    await page.locator('.app-footer button').click();
    return;
  }
  const tab = PATIENT_TABS.indexOf(name);
  if (tab >= 0) { await page.locator('.tabbar button').nth(tab).click(); return; }
  await page.locator('.tabbar button').last().click();
  await page.locator('.menu-row').filter({ hasText: name }).first().click();
}

test('a patient and a clinician share only the modules they are meant to', async ({ page }) => {
  test.setTimeout(90_000);
  /* A patient who has walked every section of their own application and opened the help screen.
     Anything a clinical screen needs would have been requested by now. */
  const patient = await modulesFetched(page, async () => {
    await page.goto('/app/');
    for (const section of ['Book a nurse', 'My visits', 'Health Passport', 'My family', 'Care plans', 'Thuso Wallet', 'Explore MyThuso', 'Privacy & settings', 'Language & access', 'Help & support']) {
      await patientSection(page, section);
      await page.waitForTimeout(120);
    }
    await expect(page.getByRole('heading', { name: 'Not sure what you need?' })).toBeVisible();
  });

  const clinician = await modulesFetched(page, async () => {
    await openWorkspace(page, 'Nurse');
    await goSection(page, 'Earnings & payouts');
    await goSection(page, 'Vetting');
  });

  const both = [...patient].filter(name => clinician.has(name)).sort();
  expect(both, 'the patient and the clinician share a feature module that is neither meant to be shared nor a known cost of the one entry')
    .toEqual([...SHARED_BY_BOTH_AUDIENCES, ...CARRIED_BY_THE_ONE_ENTRY].sort());

  /* And the ones that started this, named, because they are the ones that will come back. This is
     the half of the promise the merge did not touch: whatever a clinician now carries of the
     patient's application, no patient carries a gram of a dispatch board. */
  for (const clinical of ['Clinical', 'StaffShell', 'AdminShell', 'Workspaces', 'Fulfilment', 'Dispatch', 'Vetting', 'PatientFile', 'Teleconsult', 'Earnings', 'Admin']) {
    expect(patient.has(clinical), `a patient session fetched ${clinical}.tsx, which no patient screen renders`).toBe(false);
  }
});
