import { test, expect } from '@playwright/test';

test('transparent robot blinks, offers one dismissible greeting, and stops with reduced motion', async ({ page }) => {
 await page.goto('/app/');
 const launcher = page.getByRole('button', { name: 'Ask GilbertOne', exact: true });
 await expect(launcher).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
 await expect(launcher).toHaveCSS('width', '104px');
 await expect(launcher.locator('.al-orb')).toHaveCSS('background-image', /gilbert-robot-v2\.webp/);
 await expect.poll(() => launcher.locator('.al-orb').evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('al-blink');
 const greeting = page.locator('.assistant-greeting');
 await expect(greeting).toBeVisible({ timeout: 7000 });
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
 const first = panel.locator('.as-scroll > *').first();
 await expect(first).toHaveClass('as-log');
 const mic = panel.locator('.as-voice');
 await expect(mic).toContainText('Tap to talk');
 await expect(panel.locator('#as-keyboard')).toContainText('microphone');
 await page.waitForTimeout(500);
 const input = await panel.locator('#as-input').boundingBox();
 const microphone = await mic.boundingBox();
 expect(microphone!.y).toBeGreaterThanOrEqual(input!.y + input!.height);
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
