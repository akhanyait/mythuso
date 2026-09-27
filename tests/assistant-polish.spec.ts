import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('transparent robot blinks, offers one dismissible greeting, and stops with reduced motion', async ({ page }) => {
 await page.goto('/app/');
 const launcher = page.getByRole('button', { name: 'Ask GilbertOne', exact: true });
 await expect(launcher).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
 await expect(launcher).toHaveCSS('width', '104px');
 /* The G1 icon since a314ad8e (23 September 2026), which replaced gilbert-robot-v2.webp on the launcher. */
 await expect(launcher.locator('.al-orb')).toHaveCSS('background-image', /gilbert-icon\.webp/);
 await expect.poll(() => launcher.locator('.al-orb').evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('al-blink');
 const greeting = page.locator('.assistant-greeting');
 await expect(greeting).toBeVisible({ timeout: 7000 });
 await expect(greeting).toContainText('Need help?');
 await page.clock.install();
 await page.clock.fastForward(20000);
 await expect(greeting).toBeVisible();
 await page.screenshot({ path: `/tmp/mythuso-robot-launcher-${test.info().project.name}.png` });
 await greeting.getByRole('button', { name: 'Dismiss GilbertOne’s greeting' }).click();
 await launcher.click();
 await page.getByRole('button', { name: 'Close GilbertOne', exact: true }).click();
 await expect(greeting).toHaveCount(0);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect.poll(() => launcher.locator('.al-orb').evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none');
});

test('the patient conversation leads with a greeting and has a labelled microphone with disclosure before use', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 const panel = page.locator('#assistant-panel');
 await expect(panel).toBeVisible();
 /* The conversation is behind the consent gate, since 20 September 2026. */
 await panel.getByRole('checkbox', { name: 'I understand GilbertOne is not a doctor.' }).check();
 await panel.getByRole('checkbox', { name: 'I know what to do in an emergency.' }).check();
 await panel.getByRole('button', { name: 'I Accept and Continue' }).click();
 await expect(panel.locator('.as-welcome-hero')).toBeVisible();
 await expect(panel.locator('#as-input')).toBeFocused();
 await expect(panel.getByRole('button', { name: 'How do I book a nurse?' })).toBeVisible();
 await expect(panel.getByRole('button', { name: 'Minimise GilbertOne' })).toBeVisible();
 const mic = panel.locator('.as-voice');
 await expect(mic).toContainText('Tap to talk');
 await expect(panel.locator('#as-keyboard')).toContainText('microphone');
 await page.waitForTimeout(500);
 const input = (await panel.locator('#as-input').boundingBox())!;
 const microphone = (await mic.boundingBox())!;
 /* This used to hold the microphone strictly below the field. It was the wrong way to say it: on a
    phone that stacking cost the composer a whole 44px row of its own, and the composer is fixed
    chrome the conversation pays for — at 390x844 the answers had 261px while the microphone's bar,
    its line and its disclosure had 212. Since 21 September 2026 the control shares the composer's
    label row below 560px and keeps its own row above it. What the assertion was protecting is kept,
    and said directly: the microphone never lies on the box a person types in, and it never squeezes
    that box narrower than its own placeholder needs. */
 const clear = microphone.y >= input.y + input.height || input.y >= microphone.y + microphone.height;
 expect(clear, 'the microphone is printing over the text field').toBe(true);
 expect(Math.round(input.width), 'the microphone squeezed the text field').toBeGreaterThanOrEqual(100);
 await page.waitForTimeout(500);
 await page.screenshot({ path: `/tmp/mythuso-polish-${test.info().project.name}.png` });
});

test('the signed-out greeting opens the website guide and the robot background is transparent', async ({ page }) => {
 await page.goto('/landing.html');
 await expect(page.locator('.public-assistant-launcher')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
 const hello = page.locator('.assistant-greeting button').first();
 await expect(hello).toBeVisible({ timeout: 7000 });
 await hello.click();
 await expect(page.getByRole('dialog', { name: 'GilbertOne' })).toBeVisible();
 await expect(page.locator('.assistant-greeting')).toHaveCount(0);
});


test('the reference robot keeps neutral eyes on refusals and emergencies', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 const panel = page.locator('#assistant-panel');
 await expect(panel.locator('.go-eye-arc')).toHaveCount(2);
 /* The conversation is behind the consent gate, since 20 September 2026. */
 await panel.getByRole('checkbox', { name: 'I understand GilbertOne is not a doctor.' }).check();
 await panel.getByRole('checkbox', { name: 'I know what to do in an emergency.' }).check();
 await panel.getByRole('button', { name: 'I Accept and Continue' }).click();
 for (const words of ['write a football poem', 'I have chest pain']) {
  await panel.locator('#as-input').fill(words);
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.locator('.go-eye-arc')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(panel.locator('.go-eye-arc')).toHaveCount(0);
 }
});

test('minimising returns to the help bubble and reopening keeps the acknowledged conversation', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 const panel = page.locator('#assistant-panel');
 await panel.getByRole('checkbox', { name: 'I understand GilbertOne is not a doctor.' }).check();
 await panel.getByRole('checkbox', { name: 'I know what to do in an emergency.' }).check();
 await panel.getByRole('button', { name: 'I Accept and Continue' }).click();
 await panel.locator('#as-input').fill('Hello');
 await panel.getByRole('button', { name: 'Send', exact: true }).click();
 await panel.getByRole('button', { name: 'Minimise GilbertOne' }).click();
 await expect(panel).toBeHidden();
 const bubble = page.locator('.assistant-greeting');
 await expect(bubble).toBeVisible();
 await bubble.getByRole('button', { name: 'Need help? Ask GilbertOne' }).click();
 await expect(panel.locator('.as-said')).toHaveText('You asked: Hello');
 await expect(panel.locator('.as-gate')).toHaveCount(0);
});

test('compact composer reveals microphone privacy and keeps attachments local', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 const panel = page.locator('#assistant-panel');
 await panel.getByRole('checkbox', { name: 'I understand GilbertOne is not a doctor.' }).check();
 await panel.getByRole('checkbox', { name: 'I know what to do in an emergency.' }).check();
 await panel.getByRole('button', { name: 'I Accept and Continue' }).click();
 const details = panel.locator('.as-mic-details');
 await expect(details).not.toHaveAttribute('open');
 await expect(panel.locator('#as-keyboard')).toBeHidden();
 await details.locator('summary').click();
 await expect(panel.locator('#as-keyboard')).toBeVisible();
 await expect(panel.locator('#as-keyboard')).toContainText('browser');
 await details.locator('summary').click();
 await expect(panel.getByRole('button', { name: 'Add a photo', exact: true })).toBeVisible();
 const transfers: string[] = [];
 page.on('request', request => { if (request.method() === 'POST') transfers.push(request.url()); });
 await panel.locator('input[type=file]:not([capture])').setInputFiles({ name: 'example.txt', mimeType: 'text/plain', buffer: Buffer.from('Example only') });
 await expect(panel.locator('.as-attachment-preview')).toContainText('Nothing is uploaded');
 await expect(panel.locator('.as-attachment-file')).toContainText('example.txt');
 await panel.getByRole('button', { name: 'Remove attachment' }).click();
 await expect(panel.locator('.as-attachment-preview')).toHaveCount(0);
 expect(transfers).toEqual([]);
});

test('the welcome screen names the six capabilities from the catalogue and gives way once a conversation starts', async ({ page }) => {
 const ui = JSON.parse(readFileSync(new URL('../packages/catalog/assistant-chat-ui.json', import.meta.url), 'utf8'));
 const copy = ui.service;
 await page.goto('/app/?open=assistant');
 const panel = page.locator('#assistant-panel');
 await panel.getByRole('checkbox', { name: 'I understand GilbertOne is not a doctor.' }).check();
 await panel.getByRole('checkbox', { name: 'I know what to do in an emergency.' }).check();
 await panel.getByRole('button', { name: 'I Accept and Continue' }).click();
 /* The welcome list and the conversation's own capability region share one accessible name and are
    never on the screen together, so the list is found by its own class: after a message, the other
    region arrives lazily under the same name and must not be mistaken for the list staying put. */
 const region = panel.locator('section.gos-capabilities');
 await expect(region).toBeVisible();
 await expect(region).toHaveAttribute('aria-label', copy.regionLabel);
 await expect(region.locator('.gos-capability')).toHaveCount(6);
 /* Every heading is the catalogue's own sentence, never one typed into the screen. */
 for (const heading of [copy.statusHeading, copy.triageRefusedHeading, copy.handoverHeading, copy.vitalsConnectHeading, copy.knowledgeHeading, ui.voiceDetails])
  await expect(region.locator('.gos-capability-heading', { hasText: heading })).toHaveCount(1);
 /* The status check is a button the person presses, and nothing is asked of the service before it. */
 await expect(region.getByRole('button', { name: copy.statusButton })).toBeVisible();
 await panel.locator('#as-input').fill('Hello');
 await panel.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(region).toHaveCount(0);
});

test('patient suggestions answer the six navigation questions and keep extra symptoms on the safety path', async ({ page }) => {
 const ui = JSON.parse(readFileSync(new URL('../packages/catalog/assistant-chat-ui.json', import.meta.url), 'utf8'));
 /* The browser's own voice is stood down, as tests/assistant.spec.ts stands it down. Each chip's reply
    is read aloud, and the next chip cancels that reading; in headless Chromium (the 1243 build
    installed on 27 September 2026) a cancel on a live utterance stalls input delivery, so the second
    click never returned and the assertion read an empty reply. What this journey measures is the
    words each chip answers with, not the voice — which the voice specs cover with a stand-in of
    their own. */
 await page.addInitScript(() => {
  const synth = (window as unknown as { speechSynthesis?: { speak: () => void; cancel: () => void } }).speechSynthesis;
  if (synth) { synth.speak = () => {}; synth.cancel = () => {}; }
 });
 await page.goto('/app/?open=assistant');
 const panel = page.locator('#assistant-panel');
 await panel.getByRole('checkbox', { name: 'I understand GilbertOne is not a doctor.' }).check();
 await panel.getByRole('checkbox', { name: 'I know what to do in an emergency.' }).check();
 await panel.getByRole('button', { name: 'I Accept and Continue' }).click();
 /* The six navigation questions, plus the two contract questions offered on every open since
    28 September 2026 — the reading explanation and the medicine-list read-back — and, since the
    symptom intake of the same day, the offer to take notes for the nurse; the pre-visit one is
    offered only while a visit is booked, and this demo patient has none. Each of the six is still
    walked by name below, so the count is a guard against a chip quietly vanishing, not the point. */
 await expect(panel.locator('.as-chips .as-ask')).toHaveCount(ui.patientQuestions.length + 3);
 for (const question of ui.patientQuestions) {
   await panel.getByRole('button', { name: question.asks, exact: true }).click();
   await expect(panel.locator('.as-reply').last()).toContainText(question.answer);
   await panel.locator('#as-input').fill(question.asks);
   await panel.getByRole('button', { name: 'Send', exact: true }).click();
   await expect(panel.locator('.as-reply').last()).toContainText(question.answer);
 }
 await panel.locator('#as-input').fill('How do I book a nurse? I have chest pain');
 await panel.getByRole('button', { name: 'Send', exact: true }).click();
 await expect(panel.locator('.as-reply').last()).toHaveClass(/as-reply-emergency/);
 await expect(panel.locator('.as-silence')).toBeVisible();
});
