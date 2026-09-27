import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* GilbertOne's motion, measured rather than watched — the founder's brief of 28 September 2026.
 *
 * What is held here is what the motion refuses, not how it looks: the ambulance numbers arrive with
 * no entrance in front of them; the held safety face stands every decorative movement on the panel
 * still; the robot on the landing page does not move at rest; the panel grows out of the launcher and
 * does nothing of the kind for a reader who asked for stillness; and an answer that did rise is
 * complete once it has. The face each answer wears is read from the contract, never from here.
 *
 * Every journey stands the browser's own voice down before the app runs: a reply is read aloud, and in
 * headless Chromium a cancel on a live utterance stalls input delivery (see assistant-polish.spec.ts). */
const gilbert = JSON.parse(readFileSync(new URL('../packages/catalog/assistant.json', import.meta.url), 'utf8'));
const safetyCue: string = gilbert.affect.answers.emergency.cue;

test.beforeEach(async ({ page }) => {
 await page.addInitScript(() => {
  const synth = (window as unknown as { speechSynthesis?: { speak: () => void; cancel: () => void } }).speechSynthesis;
  if (synth) { synth.speak = () => {}; synth.cancel = () => {}; }
 });
});

const panel = (page: Page) => page.getByRole('dialog', { name: gilbert.identity.name });
const consent = async (page: Page) => {
 const sheet = panel(page);
 await sheet.getByRole('checkbox', { name: gilbert.consent.checkboxDoctor }).check();
 await sheet.getByRole('checkbox', { name: gilbert.consent.checkboxEmergency }).check();
 await sheet.getByRole('button', { name: gilbert.consent.accept }).click();
};
const ask = async (page: Page, words: string) => {
 await panel(page).getByLabel(gilbert.conversation.inputLabel).fill(words);
 await panel(page).getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
};
/** Everything that moves on an element or inside it: a named animation, a script animation, or a
    transition of transform or opacity. A colour transition is not movement, and under reduced motion
    core.css gives every property a 0.01ms transition, so a scroller turning ink would otherwise count. */
const movingIn = (page: Page, selector: string) => page.evaluate(selector => {
 const root = document.querySelector(selector);
 if (!root) return ['absent'];
 return document.getAnimations()
  .filter(a => a.playState === 'running')
  .filter(a => { const t = (a.effect as KeyframeEffect | null)?.target; return t instanceof Element && (t === root || root.contains(t)); })
  .map(a => (a as Animation & { animationName?: string; transitionProperty?: string }).animationName ?? (a as Animation & { transitionProperty?: string }).transitionProperty ?? 'script')
  .filter(name => !/color|shadow|background|border|outline|fill|stroke/.test(name));
}, selector);

test('the emergency answer arrives with nothing in front of the ambulance numbers, and the safety face stills the panel', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await consent(page);
 await ask(page, 'Are my results back?');
 await ask(page, 'someone has collapsed and is not breathing');
 const reply = panel(page).locator('.as-turn').last().locator('.as-reply');
 await expect(reply).toHaveClass(/as-reply-emergency/);
 /* On the frame it lands: no entrance on the answer or anything in it, fully opaque, 10177 first. */
 expect(await movingIn(page, '.as-turn:last-child .as-reply')).toEqual([]);
 expect(Number(await reply.evaluate(el => getComputedStyle(el).opacity))).toBe(1);
 await expect(reply.locator('.as-numbers li').first()).toContainText('10177');
 /* The safety face holds, and the panel's own decorative motion stands still while it does. */
 await expect(panel(page).locator('.as-rig')).toHaveAttribute('data-cue', safetyCue);
 await expect(panel(page)).toHaveAttribute('data-safety', 'held');
 await expect.poll(async () => (await movingIn(page, '.as-rig svg')).filter(name => name === 'go-float')).toEqual([]);
 /* A later, calmer answer lowers nothing: it too arrives without an entrance while the face holds. */
 await ask(page, 'Are my results back?');
 await expect(panel(page).locator('.as-turn')).toHaveCount(4);
 expect((await movingIn(page, '.as-turn:last-child')).filter(name => name.startsWith('as-'))).toEqual([]);
 /* Start again, the patient's own reset, releases it. */
 await panel(page).getByRole('button', { name: gilbert.conversation.startAgainLabel }).click();
 await expect(panel(page)).not.toHaveAttribute('data-safety', 'held');
});

test('a routine answer rises once and is complete; under reduced motion it simply arrives', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await consent(page);
 await ask(page, 'Are my results back?');
 const reply = panel(page).locator('.as-turn').last().locator('.as-reply');
 await expect(reply).toHaveAttribute('data-outcome', 'answer');
 await expect.poll(() => reply.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
 /* "Complete" is read a frame after the rise ends: under load the finished entrance can still report itself
    running on the frame opacity first reads 1, so this waits for stillness rather than sampling a frame. */
 await expect.poll(() => movingIn(page, '.as-turn:last-child .as-reply')).toEqual([]);

 await page.emulateMedia({ reducedMotion: 'reduce' });
 await ask(page, 'How do I book a nurse?');
 const second = panel(page).locator('.as-turn').last().locator('.as-reply');
 await expect(second).toBeVisible();
 expect(await movingIn(page, '.as-turn:last-child')).toEqual([]);
 expect(await second.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

test('the panel grows out of the launcher, and a reader who asked for stillness gets none of it', async ({ page }) => {
 await page.goto('/app/');
 const launcher = page.getByRole('button', { name: gilbert.identity.callToAction, exact: true });
 /* Fetched on hover first, so the dialog opens on the press rather than after a download. */
 await launcher.hover();
 await page.waitForTimeout(1000);
 await launcher.click();
 await page.waitForFunction(() => (document.querySelector('#assistant-panel') as HTMLDialogElement | null)?.open);
 const growth = await page.evaluate(() => {
  const sheet = document.querySelector('#assistant-panel') as HTMLElement;
  const entrance = sheet.getAnimations().find(a => a.effect instanceof KeyframeEffect && a.effect.getKeyframes()[0]?.transform);
  return { from: entrance ? String((entrance.effect as KeyframeEffect).getKeyframes()[0].transform) : null, scale: Number(sheet.style.getPropertyValue('--as-from-scale')) };
 });
 expect(growth.from).toMatch(/^scale\(0\.\d+\)$/);
 expect(growth.scale).toBeGreaterThan(0);
 expect(growth.scale).toBeLessThan(1);
 /* The close hands focus straight back while the sheet shrinks into him. */
 await panel(page).getByRole('button', { name: 'Close GilbertOne', exact: true }).click();
 await expect(launcher).toBeFocused();
 await expect(panel(page)).toBeHidden();

 await page.emulateMedia({ reducedMotion: 'reduce' });
 await launcher.click();
 await page.waitForFunction(() => (document.querySelector('#assistant-panel') as HTMLDialogElement | null)?.open);
 expect(await movingIn(page, '#assistant-panel')).toEqual([]);
 expect(await panel(page).evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

test('the robot on the landing page is still at rest, and the public emergency answer has no entrance', async ({ page }) => {
 await page.goto('/landing.html');
 const launcher = page.getByRole('button', { name: 'Ask GilbertOne about MyThuso' });
 await expect(launcher).toBeVisible();
 /* Longer than the rig's idle drift (3 s) and its shortest blink spacing (4 s): nothing fires. */
 await page.waitForTimeout(4500);
 expect(await movingIn(page, '.public-assistant-launcher')).toEqual([]);
 await launcher.click();
 const sheet = page.getByRole('dialog', { name: gilbert.identity.name });
 await sheet.getByLabel('Ask about MyThuso', { exact: true }).fill('I have chest pain');
 await sheet.getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
 const last = sheet.locator('ol > li').last();
 await expect(last).toHaveAttribute('data-outcome', 'emergency');
 expect(await movingIn(page, '.public-assistant ol > li:last-child')).toEqual([]);
 await expect(last.locator('li strong').first()).toHaveText('10177');
});
