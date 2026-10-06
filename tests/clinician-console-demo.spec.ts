import { test, expect } from '@playwright/test';
import { goSection, openWorkspace } from './nav';

/* The Wednesday funder demo's clinician console. The call is a timer and two portraits: this
   journey stubs getUserMedia and asserts it is never asked for. Priority is a note the nurse
   sets. The only place the word diagnosis appears is the sentence that refuses one. */

test.beforeEach(async ({ page }) => {
 await page.addInitScript(() => {
  const w = window as unknown as { __mythusoGum: number };
  w.__mythusoGum = 0;
  const block = () => {
   w.__mythusoGum += 1;
   return Promise.reject(new Error('simulated consult'));
  };
  const devices = navigator.mediaDevices;
  if (devices) devices.getUserMedia = block;
  else Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: block } });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak() {}, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {} } });
 });
});

test('a doctor opens a simulated consult with a nurse-led toolkit', async ({ page }) => {
 await openWorkspace(page, 'Doctor');
 await goSection(page, 'Video consult');
 const main = page.locator('#main');

 await expect(main.getByRole('heading', { level: 1, name: 'Video consult' })).toBeVisible();
 await expect(main.getByText('Simulated consult')).toBeVisible();
 await expect(main.getByText('Live', { exact: true })).toBeVisible();
 await expect(main.getByText('Secure connection (simulated)')).toBeVisible();
 await expect(main.getByText('Ms. Dlamini · 54 yrs')).toBeVisible();
 await expect(main.getByText('Nurse Zinhle')).toBeVisible();
 expect(await main.getByText('Demo data', { exact: true }).count()).toBeGreaterThanOrEqual(2);

 const low = main.getByRole('button', { name: 'Priority Low' });
 const medium = main.getByRole('button', { name: 'Priority Medium' });
 const high = main.getByRole('button', { name: 'Priority High' });
 await expect(low).toHaveAttribute('aria-pressed', 'false');
 await expect(medium).toHaveAttribute('aria-pressed', 'false');
 await expect(high).toHaveAttribute('aria-pressed', 'false');
 await medium.click();
 await expect(medium).toHaveAttribute('aria-pressed', 'true');
 await expect(low).toHaveAttribute('aria-pressed', 'false');
 await expect(high).toHaveAttribute('aria-pressed', 'false');

 for (const name of ['Blood pressure (mmHg)', 'Pulse (bpm)', 'SpO₂ (%)']) {
  const card = main.locator('.ccd-vital', { hasText: name });
  await expect(card).toBeVisible();
  await expect(card.locator('svg path').first()).toBeVisible();
 }
 await expect(main.getByText('Resets every 60s')).toBeVisible();

 const notes = main.getByRole('textbox', { name: 'Notes (nurse-led)' });
 const save = main.locator('.ccd-save');
 const sawSaving = page.waitForFunction(() => document.querySelector('.ccd-save')?.textContent?.includes('Saving'));
 await notes.pressSequentially('Dressing dry. Recheck tomorrow.', { delay: 20 });
 await sawSaving;
 await expect(save).toHaveText('Saved');

 const text = await main.innerText();
 expect(text).not.toMatch(/Diagnosis:/);
 expect(text).toContain('not a diagnosis');
 expect(text).not.toMatch(/POPIA compliant/i);

 const mute = main.getByRole('button', { name: 'Mute' });
 await expect(mute).toHaveAttribute('aria-pressed', 'false');
 await mute.click();
 await expect(mute).toHaveAttribute('aria-pressed', 'true');
 await mute.click();
 await expect(mute).toHaveAttribute('aria-pressed', 'false');

 const camera = main.getByRole('button', { name: 'Camera' });
 await camera.click();
 await expect(camera).toHaveAttribute('aria-pressed', 'false');
 await expect(main.getByText('Camera off')).toBeVisible();

 await main.getByRole('button', { name: 'Leave' }).click();
 await expect(main.getByText('Consult ended (simulated)')).toBeVisible();
 await expect(main.getByRole('button', { name: 'Back to Teleconsultation' })).toBeVisible();
 await expect(main.getByRole('button', { name: 'Start again' })).toBeVisible();
 const after = await main.innerText();
 expect(after).not.toMatch(/Diagnosis:/);
 expect(after).not.toMatch(/POPIA compliant/i);

 expect(await page.evaluate(() => (window as unknown as { __mythusoGum: number }).__mythusoGum)).toBe(0);
 const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(1);
});
