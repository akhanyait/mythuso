import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noticeFor } from './notices';
import { goSection } from './nav';
/* The floating assistant on the web.

   What is held here, in the order a person meets it.

   The orb floats on every patient page and is fetched lazily. The panel's code is requested only
   when somebody opens it, so the journey watches the request rather than trusting the build. On a
   phone the orb sits above the tab bar and covers none of its buttons; on a wide screen it leaves
   the footer's help link alone.

   The panel behaves like a dialog. It opens by click or keyboard and closes by Escape, by its close
   button or by the backdrop. Focus stays inside while it is open and returns to the orb when it
   closes, and the conversation survives closing.

   It says the contract's words: the voice notice verbatim, and answers built from records.json,
   capabilities.json and sos.json. Its emergency answer leads with the ambulance and hands over to
   Thuso SOS.

   It never offers to listen. No microphone glyph, no speech wording on any control, no text box,
   and no call to getUserMedia. The Siri comparison is placement, not hearing.

   Motion stops rather than slows. Under reduced motion neither the orb nor the sphere runs an
   animation and the canvas still holds a frame; a hidden tab stops the orb too. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const voice = json('../packages/catalog/capabilities.json').capabilities.find((c: { id: string }) => c.id === 'voice');
const sos = json('../packages/catalog/sos.json');
const laboratory = json('../packages/catalog/records.json').records.find((r: { id: string }) => r.id === 'laboratory').name;

const launcher = (page: Page) => page.getByRole('button', { name: 'Assistant', exact: true });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Assistant' });
const log = (page: Page) => panel(page).getByRole('log', { name: 'Conversation with the assistant' });

/* Before the app's own code runs, so a reach for the microphone from anywhere on the page counts. */
const watchTheMicrophone = (page: Page) => page.addInitScript(() => {
 const tally = window as unknown as { __mediaAsked: number };
 tally.__mediaAsked = 0;
 if (navigator.mediaDevices) {
  navigator.mediaDevices.getUserMedia = () => { tally.__mediaAsked += 1; return Promise.reject(new Error('Refused by the assistant spec')); };
 }
});

/* Each animation inside an element, described well enough that a failure names what moved. */
const animationsIn = (page: Page, selector: string) => page.evaluate(selector =>
 document.getAnimations().filter(a => {
  const target = (a.effect as KeyframeEffect | null)?.target;
  return target instanceof Element && target.closest(selector);
 }).map(a => {
  const effect = a.effect as KeyframeEffect;
  const name = (a as Animation & { animationName?: string }).animationName ?? '';
  return `${a.playState} ${a.constructor.name}${name ? ` ${name}` : ''} on .${(effect.target as Element).className}${effect.pseudoElement ?? ''}`;
 }), selector);
const runningIn = (described: string[]) => described.filter(d => d.startsWith('running'));

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the orb floats on every patient page, and the assistant is fetched only when it is opened', async ({ page }) => {
 const fetched: string[] = [];
 page.on('request', request => { if (/features\/Assistant|features\/assistant\.css|lib\/assistant/.test(request.url())) fetched.push(request.url()); });
 await page.goto('/app/');
 await expect(page.getByRole('heading', { level: 1, name: 'Hello, Lerato' })).toBeVisible();
 await expect(launcher(page)).toBeVisible();
 await expect(launcher(page)).toHaveAttribute('aria-expanded', 'false');
 await goSection(page, 'My visits');
 await expect(launcher(page)).toBeVisible();
 expect(fetched, 'a patient page fetched the assistant before anybody reached for it').toEqual([]);
 await launcher(page).click();
 await expect(panel(page)).toBeVisible();
 expect(fetched.length).toBeGreaterThan(0);
 await expect(launcher(page)).toHaveAttribute('aria-expanded', 'true');
 // the contract's own sentence, word for word
 await expect(panel(page).locator('.not-connected')).toHaveText(noticeFor('voice'));
 await expect(panel(page).locator('.orb')).toHaveAttribute('aria-hidden', 'true');
 await expect(log(page)).toContainText('Nothing needs you.');
 await expect(panel(page).locator('.as-rule')).toContainText(voice.neverSoften);
});

test('on a phone the orb sits above the tab bar, clear of every tab', async ({ page, isMobile }) => {
 test.skip(!isMobile, 'The tab bar is the phone’s navigation.');
 await page.goto('/app/');
 await expect(launcher(page)).toBeVisible();
 const orb = (await launcher(page).boundingBox())!;
 const bar = (await page.locator('.tabbar').boundingBox())!;
 expect(orb.y + orb.height, 'the orb reaches down into the tab bar').toBeLessThanOrEqual(bar.y - 4);
 expect(orb.x + orb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 for (const tab of await page.locator('.tabbar button').all()) expect(overlaps(orb, (await tab.boundingBox())!)).toBe(false);
 // opened, it is a sheet from the bottom edge across the whole width
 await launcher(page).click();
 // measured once it has finished rising from the bottom edge
 await expect.poll(async () => { const sheet = (await panel(page).boundingBox())!; return Math.round(sheet.y + sheet.height); }).toBe(page.viewportSize()!.height);
 expect(Math.round((await panel(page).boundingBox())!.width)).toBe(page.viewportSize()!.width);
});

test('on a wide screen the orb leaves the footer alone and the panel is anchored bottom right', async ({ page, isMobile }) => {
 test.skip(isMobile, 'A phone has a sheet, not a panel, and no footer.');
 await page.goto('/app/');
 const orb = (await launcher(page).boundingBox())!;
 for (const link of await page.locator('.app-footer button').all()) expect(overlaps(orb, (await link.boundingBox())!)).toBe(false);
 await launcher(page).click();
 await expect(panel(page)).toBeVisible();
 await page.waitForTimeout(500); // the panel grows out of the orb; measure it once it has
 const box = (await panel(page).boundingBox())!;
 const { width, height } = page.viewportSize()!;
 expect(Math.round(box.width)).toBe(400);
 expect(Math.abs(width - (box.x + box.width) - 24)).toBeLessThanOrEqual(1);
 expect(Math.abs(height - (box.y + box.height) - 24)).toBeLessThanOrEqual(1);
});

test('the panel opens and closes like a dialog, keeps focus inside, and gives it back to the orb', async ({ page }) => {
 await page.goto('/app/');
 await launcher(page).click();
 await expect(panel(page)).toBeVisible();
 await expect(panel(page).getByRole('button', { name: 'Close the assistant' })).toBeFocused();
 for (let step = 0; step < 24; step++) {
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.getElementById('assistant-panel')?.contains(document.activeElement)), `focus left the panel after ${step + 1} tabs`).toBe(true);
 }
 await page.keyboard.press('Escape');
 await expect(panel(page)).toBeHidden();
 await expect(launcher(page)).toBeFocused();
 await expect(launcher(page)).toHaveAttribute('aria-expanded', 'false');

 // by keyboard, and the conversation is still there after closing
 await page.keyboard.press('Enter');
 await expect(panel(page)).toBeVisible();
 await panel(page).getByRole('button', { name: 'When is my nurse coming?' }).click();
 await panel(page).getByRole('button', { name: 'Close the assistant' }).click();
 await expect(panel(page)).toBeHidden();
 await expect(launcher(page)).toBeFocused();
 await launcher(page).click();
 await expect(log(page).locator('.as-said')).toHaveText(['You asked: When is my nurse coming?']);
});

test('a suggested question gets the contract’s answer, and the emergency answer hands over to Thuso SOS', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await expect(panel(page)).toBeVisible();
 await panel(page).getByRole('button', { name: 'Are my results back?' }).click();
 await expect(log(page)).toContainText(`${laboratory} results have been released to your record.`);
 await expect(panel(page).locator('.as-name')).toHaveText('Result ready');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-depth', '2');

 await panel(page).getByRole('button', { name: 'Is everyone on my team registered?' }).click();
 await expect(panel(page).locator('.as-figure')).toContainText('45');

 await panel(page).getByRole('button', { name: /Why can.t you listen\?/ }).click();
 for (const reason of voice.blockedBy) await expect(log(page)).toContainText(reason);

 await panel(page).getByRole('button', { name: 'What if it cannot wait?' }).click();
 const answer = log(page).locator('.as-reply').last();
 await expect(answer).toContainText(sos.emergency.headline);
 await expect(answer.locator('.as-numbers li').first()).toContainText('10177');
 await expect(panel(page).locator('.as-figure')).toHaveText('10177');
 await answer.getByRole('button', { name: /Open Thuso SOS/ }).click();
 await expect(panel(page)).toBeHidden();
 await expect(page.getByRole('dialog', { name: 'Thuso SOS' })).toBeVisible();
});

test('starting again clears the conversation back to its opening', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await panel(page).getByRole('button', { name: 'When is my nurse coming?' }).click();
 await expect(log(page).locator('.as-said')).toHaveCount(1);
 await panel(page).getByRole('button', { name: 'Start again' }).click();
 await expect(log(page).locator('.as-said')).toHaveCount(0);
 await expect(panel(page).locator('.as-name')).toHaveText('Nothing waiting');
});

test('nothing about the assistant offers to listen', async ({ page }) => {
 await watchTheMicrophone(page);
 await page.goto('/app/');
 await launcher(page).click();
 for (const question of ['Does anything need me?', 'When is my nurse coming?', 'What if it cannot wait?']) {
  await panel(page).getByRole('button', { name: question }).click();
 }
 await expect(page.locator('[class*="lucide-mic"], [class*="lucide-audio"], [class*="waveform"], audio')).toHaveCount(0);
 await expect(panel(page).locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
 const controls = [panel(page).getByRole('button'), launcher(page)];
 const names = (await Promise.all(controls.map(c => c.evaluateAll(buttons => buttons.map(b => `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`.trim()))))).flat();
 const offers = names.filter(name => /microphone|\bmic\b|voice input|dictat|speak now|(tap|hold|press) to (speak|talk)|start listening|listening|record/i.test(name));
 expect(offers, `${voice.neverSoften}`).toEqual([]);
 expect(await page.evaluate(() => (window as unknown as { __mediaAsked: number }).__mediaAsked)).toBe(0);
});

test('the orb and the sphere move, and Pause motion stops both', async ({ page }) => {
 await page.goto('/app/');
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher')).length).toBeGreaterThan(0);
 await launcher(page).click();
 const orb = panel(page).locator('.orb');
 await expect(orb).toHaveAttribute('data-motion', 'running');
 expect(runningIn(await animationsIn(page, '.orb')).length).toBeGreaterThan(0);
 await panel(page).getByRole('button', { name: 'Pause motion' }).click();
 await expect(orb).toHaveAttribute('data-motion', 'paused');
 await expect.poll(async () => runningIn(await animationsIn(page, '.orb'))).toEqual([]);
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher'))).toEqual([]);
 await panel(page).getByRole('button', { name: 'Play motion' }).click();
 await expect(orb).toHaveAttribute('data-motion', 'running');
});

test('a hidden tab stops the orb', async ({ page }) => {
 await page.goto('/app/');
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher')).length).toBeGreaterThan(0);
 await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher'))).toEqual([]);
});

test('under reduced motion the orb and the sphere are still, complete frames', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto('/app/');
 await expect(launcher(page)).toBeVisible();
 expect(await animationsIn(page, '.as-launcher')).toEqual([]);
 await launcher(page).click();
 const orb = panel(page).locator('.orb');
 await expect(orb).toHaveAttribute('data-motion', 'still');
 // nothing to pause, so no control offering to pause it
 await expect(panel(page).getByRole('button', { name: /Pause motion|Play motion/ })).toHaveCount(0);
 await panel(page).getByRole('button', { name: 'Are my results back?' }).click();
 await expect(panel(page).locator('.as-name')).toHaveText('Result ready');
 // the gathering reaction is suppressed as well as the breathing
 expect(await animationsIn(page, '.orb')).toEqual([]);
 const box = await panel(page).locator('.orb-body').boundingBox();
 expect(box?.width ?? 0).toBeGreaterThan(60);
 const painted = await panel(page).locator('.orb-particles').evaluate((canvas: HTMLCanvasElement) => {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) lit += 1;
  return lit;
 });
 expect(painted).toBeGreaterThan(0);
});

test('the open panel does not scroll sideways at 320px', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 await page.goto('/app/?open=assistant');
 await panel(page).getByRole('button', { name: 'What if it cannot wait?' }).click();
 const overflow = await page.evaluate(() => {
  const root = document.scrollingElement!;
  const scroller = document.querySelector('.as-scroll')!;
  return { page: root.scrollWidth - root.clientWidth, panel: scroller.scrollWidth - scroller.clientWidth };
 });
 expect(overflow.page).toBeLessThanOrEqual(1);
 expect(overflow.panel).toBeLessThanOrEqual(1);
});
