import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXPLORE_LABEL } from './nav';
import { noticeFor } from './notices';

/* The patient screens the Lovable export draws and the live app did not have, on both viewports: connected
 * devices, messages, test results, mental health, activity, the consultation's waiting room and the vaccination
 * record's booking.
 *
 * Each is reached the way a person reaches it — the sidebar on a wide screen, the More hub on a phone — and
 * each is held to what it carries and to what it refuses: the capability's notice word for word, a figure only
 * where it is a count of the rows under it, no battery, sync, unread dot, call, "Normal" badge, mood scale or
 * "Available now", and the crisis lines only after the door to the emergency screen. Every sentence asserted is
 * read from its contract. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${path}`, import.meta.url), 'utf8'));
const pages = json('patient-pages.json');
const capture = json('capture.json');
const devices = json('devices.json');
const passport = json('passport.json');
const booking = json('booking.json');
const sos = json('sos.json');
const records = json('records.json');
const wellbeing = json('wellbeing.json');
const crisisLines = json('crisis-lines.json');
const services = json('services.json');
const teleconsult = json('teleconsult.json');

/* A row by its exact title: a looser match finds "activity" inside the wallet's line and "messages" inside the
   notifications'. */
async function reach(page: Page, name: string) {
 await page.goto('/app/');
 const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
 await expect(sidebar.or(page.locator('.tabbar')).first()).toBeVisible();
 if (await sidebar.isVisible()) {
  await sidebar.getByRole('button', { name, exact: true }).click();
  return;
 }
 await page.locator('.tabbar button').last().click();
 const row = page.locator('.menu-row').filter({ has: page.locator('strong').getByText(name, { exact: true }) });
 await expect(page.locator('.menu-row').first()).toBeVisible();
 if (await row.count()) { await row.first().click(); return; }
 /* Since 5 October the hub folds My Health, Wellness and Devices into its one Explore MyThuso row,
    whose page lists those rows first under the same names — so a page that is not in the hub is one
    step further in, not one screen away. This is the same step nav.ts#goSection takes, and it is
    written here rather than reached through that helper only because this one matches a row by its
    exact title: a contained match finds "activity" inside the wallet's line. */
 const explore = page.locator('.menu-row').filter({ has: page.locator('strong').getByText(EXPLORE_LABEL, { exact: true }) });
 if (await explore.count()) {
  await explore.first().click();
  await expect(row.first()).toBeVisible();
  await row.first().click();
  return;
 }
 /* The rest of Your health's pages are the hub's shortcuts, one row further in. */
 await page.locator('.menu-row').filter({ has: page.locator('strong').getByText(pages.hub.opens, { exact: true }) }).first().click();
 await page.locator('.pp-shortcut').filter({ has: page.locator('strong').getByText(name, { exact: true }) }).first().click();
}

const nothingSideways = (page: Page) => page.evaluate(() =>
 [document.documentElement, ...document.querySelectorAll('main, .ps-screen, .pp-screen, .ps-inbox, .ps-panel')]
  .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className));

test('connected devices: the kit and the phone stores, each in the contract’s words, with nothing that is not there', async ({ page }) => {
 await reach(page, 'Connected devices');
 await expect(page.getByRole('heading', { level: 1, name: 'Connected devices' })).toBeVisible();
 await expect(page.locator('.not-connected').first()).toContainText(noticeFor('devices'));
 await expect(page.getByText(noticeFor('wearables'))).toBeVisible();

 /* One card per instrument capture.json names and per platform devices.json names, and the one figure on the
    page is the count of the first. */
 const cards = page.locator('.ps-device');
 await expect(cards).toHaveCount(capture.devices.length + devices.wearableLinks.platforms.length);
 await expect(page.locator('.ps-stat').first()).toContainText(String(capture.devices.length));
 for (const instrument of capture.devices) {
  const card = cards.filter({ hasText: instrument.name });
  await expect(card).toContainText(`Every ${instrument.calibrateEveryMonths} months`);
  await expect(card).toContainText(devices.health.states.find((s: { id: string }) => s.id === 'never-synced').label);
 }

 /* What stays refused: no battery, no latest reading, no sync time, no Pair and no Sync now. */
 await expect(page.getByText(/battery|synced \d|minutes ago/i)).toHaveCount(0);
 await expect(page.getByRole('button', { name: /^(pair|sync|reconnect|connect)\b/i })).toHaveCount(0);
 expect(await nothingSideways(page)).toEqual([]);

 /* The one action on a phone store is the permission sheet, where the link request has always lived. */
 const platform = devices.wearableLinks.platforms[0];
 await cards.filter({ hasText: platform.name }).getByRole('button').click();
 const dialog = page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('heading', { name: `${platform.name} access` })).toBeVisible();
});

test('messages: one thread per visit, the notice above them, and nobody watching for emergencies', async ({ page }) => {
 await reach(page, 'Messages');
 await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
 await expect(page.locator('.not-connected').first()).toContainText(noticeFor('messaging'));
 const rows = page.locator('.ps-conversation');
 expect(await rows.count()).toBeGreaterThan(0);

 /* No inbox furniture that would mean something was delivered, and no channel the route refuses. */
 await expect(page.getByRole('button', { name: /call|video|attach/i })).toHaveCount(0);
 await expect(page.locator('.ps-conversation .unread, .ps-conversation [class*="dot"]')).toHaveCount(0);

 /* A phone shows the list first; a wide screen already has the first visit's thread beside it. */
 if (!(await page.locator('.ps-inbox-thread .visit-thread').isVisible())) await rows.first().click();
 const thread = page.locator('.ps-inbox-thread');
 const nobodyWatches = booking.thread.nobodyWatches.replace(/\{(ambulance|mobile)\}/g,
  (_: string, id: string) => sos.emergency.numbers.find((n: { id: string }) => n.id === id).number);
 await expect(thread.locator('.thread-urgent')).toHaveText(nobodyWatches);
 await expect(thread.locator('.not-connected')).toContainText(noticeFor('messaging'));

 /* A word written here is kept with the visit, in memory, and the visit's row says so when you come back. */
 await thread.getByLabel(booking.thread.inputLabel).fill('The gate code is at the guardhouse.');
 await thread.getByRole('button', { name: booking.thread.sendLabel }).click();
 await expect(thread.locator('.thread-text').last()).toHaveText('The gate code is at the guardhouse.');
 await expect(thread.getByText(booking.thread.kept).first()).toBeVisible();
 await expect(page.locator('.ps-conversation-preview').filter({ hasText: 'The gate code is at the guardhouse.' })).toHaveCount(1);
 expect(await nothingSideways(page)).toEqual([]);
});

test('test results: the Passport’s documents, the trend and the explanations, and never a value with a verdict', async ({ page }) => {
 await reach(page, 'Test results');
 await expect(page.getByRole('heading', { level: 1, name: 'Test results' })).toBeVisible();
 await expect(page.locator('.not-connected').first()).toContainText(noticeFor('laboratory-results'));
 const tabs = page.getByRole('tab');
 await expect(tabs).toHaveText(['Latest', 'Trends', 'Explanations']);

 const rows = page.locator('.ps-row');
 await expect(rows).toHaveCount(passport.documents.length);
 for (const doc of passport.documents) await expect(rows.filter({ hasText: doc.name })).toContainText(doc.reviewed ? 'Doctor reviewed' : 'Awaiting review');
 await expect(page.getByText(/^normal$/i)).toHaveCount(0);

 await tabs.nth(1).click();
 const glucose = records.observations.measures.find((m: { id: string }) => m.id === 'glucose');
 await expect(page.locator('.ps-tabpanel')).toContainText(glucose.label);

 await tabs.nth(2).click();
 await expect(page.locator('.ps-explained > div')).toHaveCount(records.explanations.entries.length);
 await expect(page.getByText(records.explanations.provenance.unreviewed)).toBeVisible();
 expect(await nothingSideways(page)).toEqual([]);

 await expect(page.locator('.as-launcher')).toHaveAttribute('aria-expanded', 'false');
 await page.locator('.ps-banner').getByRole('button', { name: 'Ask GilbertOne' }).click();
 await expect(page.locator('.as-launcher')).toHaveAttribute('aria-expanded', 'true');
});

test('mental health: four doors, the emergency screen before the crisis lines, no session and no mood scale', async ({ page }) => {
 const words = pages.screens['mental-health'];
 await reach(page, words.opens);
 await expect(page.getByRole('heading', { level: 1, name: words.heading })).toBeVisible();
 await expect(page.locator('.pp-door-card')).toHaveCount(words.doors.length);

 /* The emergency door is the crisis card's first control, and the lines come after it. */
 const card = page.locator('.pp-crisis');
 await expect(card.getByRole('button').first()).toHaveText(words.crisis.action);
 const order = await card.evaluate(el => {
  const button = el.querySelector('button')!;
  const lines = el.querySelector('.pp-helplines')!;
  return button.compareDocumentPosition(lines) & Node.DOCUMENT_POSITION_FOLLOWING;
 });
 expect(order).toBeTruthy();
 for (const line of crisisLines.lines) await expect(card).toContainText(line.number);

 /* What the export drew and this page refuses. */
 await expect(page.getByText(/available now|book a session/i)).toHaveCount(0);
 await expect(page.getByRole('button', { name: /^(great|good|okay|low|struggling)$/i })).toHaveCount(0);
 await expect(page.getByText(wellbeing.refusals.find((r: { id: string }) => r.id === 'no-weight-score').sentence)).toBeVisible();
 const counselling = services.find((s: { id: string }) => s.id === 'mental');
 await page.getByRole('button', { name: words.session.action }).click();
 await expect(page.getByRole('dialog')).toContainText(`Phase ${counselling.phase}`);
 await page.keyboard.press('Escape');

 await card.getByRole('button', { name: words.crisis.action }).click();
 await expect(page.getByRole('dialog').getByText(sos.emergency.numbers[0].number).first()).toBeVisible();
 await page.keyboard.press('Escape');

 /* The library door opens the library on its mental-health tab. */
 await page.locator('.pp-door-card').filter({ hasText: words.doors[0].title }).click();
 const library = pages.screens['health-library'];
 await expect(page.getByRole('heading', { level: 1, name: library.heading })).toBeVisible();
 const tab = library.tabs.find((t: { id: string }) => t.id === words.doors[0].tab);
 await expect(page.getByRole('group', { name: library.sectionsLabel }).getByRole('button', { name: tab.label, exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('activity: written tiles, the journal’s Moving entries counted, and no step, minute or bar', async ({ page }) => {
 const words = pages.screens.activity;
 await reach(page, words.opens);
 await expect(page.getByRole('heading', { level: 1, name: words.heading })).toBeVisible();
 await expect(page.getByText(wellbeing.refusals.find((r: { id: string }) => r.id === 'no-device').sentence)).toBeVisible();
 /* The one figure is the count of the entries listed under it: disprovable by counting. */
 const tiles = page.locator('.pp-tile');
 await expect(tiles).toHaveCount(words.tiles.length);
 const items = page.locator('.pp-timeline-item');
 expect(await items.count()).toBeGreaterThan(0);
 await expect(tiles.filter({ hasText: words.tiles.find((t: { value: string }) => t.value === 'count').label }).locator('.pp-tile-value')).toHaveText(String(await items.count()));
 for (const tile of words.tiles.filter((t: { value: string }) => t.value !== 'count'))
  await expect(tiles.filter({ hasText: tile.label }).locator('.pp-tile-value')).toHaveText(tile.value);
 await expect(page.getByText(/\d[\d ]* steps|\d+ min\b/i)).toHaveCount(0);
 expect(await nothingSideways(page)).toEqual([]);

 await page.getByRole('button', { name: words.wearable.action }).click();
 await expect(page.getByRole('heading', { level: 1, name: 'Connected devices' })).toBeVisible();
});

test('online consultation: a waiting room in the contract’s words, the stage a still panel, and no call', async ({ page }) => {
 await reach(page, 'Online consultation');
 await expect(page.getByRole('heading', { level: 1, name: 'Online consultation' })).toBeVisible();
 await expect(page.locator('.not-connected').first()).toContainText(noticeFor('teleconsultation'));

 /* Where the export has a video, the sentence that says no camera or microphone was ever asked for. */
 await expect(page.locator('.ps-stage')).toContainText(teleconsult.media.sentence);
 await expect(page.locator('.ps-steps li')).toHaveCount(teleconsult.waitingRoom.states.length);
 for (const person of teleconsult.participants.filter((p: { consentQuestion?: string }) => p.consentQuestion))
  await expect(page.locator('.ps-people')).toContainText(person.consentQuestion);
 await expect(page.getByText(teleconsult.recording.decision)).toBeVisible();

 /* What stays refused: no call controls, no recording switch, no claim of a secure line, no live figure. Held
    to the page rather than the whole window, because the shell around it has a "Share part of your record".
    The one button the pattern matches is the door to the simulated consult, which opens on its own screen. */
 const screen = page.locator('.ps-screen');
 const callish = screen.getByRole('button', { name: /join|start|camera|microphone|mute|end call|share screen|record/i });
 await expect(callish).toHaveCount(1);
 await expect(callish).toHaveAccessibleName('Start video consult');
 await expect(screen.getByRole('checkbox').or(screen.getByRole('switch'))).toHaveCount(0);
 await expect(screen.getByText(/encrypted connection|\d{1,2}:\d{2}/i)).toHaveCount(0);
 expect(await nothingSideways(page)).toEqual([]);

 await page.locator('.ps-banner').getByRole('button', { name: 'Open your Health Passport' }).click();
 await expect(page).toHaveTitle(/^Health Passport ·/);
});

test('the vaccination record books the injection-and-vaccination visit', async ({ page }) => {
 const words = pages.screens.vaccinations;
 await reach(page, words.opens);
 await expect(page.getByRole('heading', { level: 1, name: words.heading })).toBeVisible();
 await page.getByRole('button', { name: words.record.book.label }).click();
 const service = services.find((s: { id: string }) => s.id === words.record.book.service);
 const dialog = page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText(service.name);
});

test('patients can review animated synthetic readings in devices and beside their consultation', async ({ page }) => {
 await reach(page, 'Connected devices');
 const board = page.locator('.lv-board');
 await expect(board).toBeVisible();
 await expect(board.locator('.lv-tile')).toHaveCount(json('live-vitals.json').streams.length);
 await expect(board.locator('.lv-banner')).toContainText(json('live-vitals.json').board.banner);
 await reach(page, 'Online consultation');
 await expect(page.locator('.ps-consult-rail .lv-panel')).toBeVisible();
 expect(await nothingSideways(page)).toEqual([]);
});
