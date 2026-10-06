import { expect, test, type Page } from '@playwright/test';
import { goSection } from './nav';

/* The Wednesday demo's simulated consult, on both viewports.
 *
 * Booklet 10 is a gate: Join is disabled until "I understand" is ticked, and unticking locks it
 * again. The call that follows is a placeholder and a clock. This file stubs getUserMedia before
 * any page script runs and holds the count at zero, because a green journey that had asked for a
 * camera would be the failure the screen exists to refuse. */

async function armMedia(page: Page) {
 await page.addInitScript(() => {
  const holder = window as Window & { __mythusoMediaCalls?: string[] };
  holder.__mythusoMediaCalls = [];
  const record = () => {
   holder.__mythusoMediaCalls!.push('getUserMedia');
   return Promise.reject(new Error('This preview does not use a camera or a microphone.'));
  };
  const devices = navigator.mediaDevices;
  if (devices) devices.getUserMedia = record;
 });
}

function mediaCalls(page: Page) {
 return page.evaluate(() => (window as Window & { __mythusoMediaCalls?: string[] }).__mythusoMediaCalls ?? ['stub-missing']);
}

async function secondsOf(page: Page) {
 const text = await page.getByRole('timer').first().innerText();
 const match = text.match(/(\d{2}):(\d{2})/);
 if (!match) throw new Error(`Timer did not read mm:ss ("${text}").`);
 return Number(match[1]) * 60 + Number(match[2]);
}

const launcher = (page: Page) => page.getByRole('button', { name: 'Ask GilbertOne', exact: true });

test('Booklet 10 gates a simulated consult, and the call never asks for a camera', async ({ page, isMobile }) => {
 await armMedia(page);
 await page.goto('/app/');
 await goSection(page, 'Online consultation');
 await page.getByRole('button', { name: 'Start video consult' }).click();

 await expect(page.getByRole('heading', { name: 'Before you join' })).toBeVisible();
 await expect(page.getByText('Booklet 10 consent checklist')).toBeVisible();
 /* The orb floats over the bottom of a phone, which is where Leave sits. It stands down for the gate. */
 await expect(launcher(page)).toBeHidden();
 for (const title of ['Who is on the call', 'No recording in this preview', 'Nurse may be present'])
  await expect(page.getByText(title, { exact: true })).toBeVisible();

 const join = page.getByRole('button', { name: 'Join call' });
 const understand = page.getByRole('checkbox', { name: /I understand/ });
 await expect(join).toBeDisabled();
 await understand.check();
 await expect(join).toBeEnabled();
 await understand.uncheck();
 await expect(join).toBeDisabled();

 /* Leaving the screen forgets the tick. A consent that survived the trip would be one the patient did not give this time. */
 await understand.check();
 await page.getByRole('button', { name: 'Back to Online consultation' }).click();
 await expect(page.getByRole('heading', { level: 1, name: 'Online consultation' })).toBeVisible();
 await expect(launcher(page)).toBeVisible();
 await page.getByRole('button', { name: 'Start video consult' }).click();
 await expect(understand).not.toBeChecked();
 await expect(join).toBeDisabled();

 await understand.check();
 await join.click();

 await expect(page.getByRole('heading', { name: 'Dr. Naidoo · simulated' })).toBeVisible();
 await expect(page.getByText('Demo simulation · not a live call')).toBeVisible();
 await expect(page.getByText('Demo data', { exact: true })).toBeVisible();
 const started = await secondsOf(page);
 expect(started).toBeLessThan(5);
 await expect.poll(() => secondsOf(page), { timeout: 5000 }).toBeGreaterThan(started);

 const controls = page.getByRole('group', { name: 'Call controls' });
 await expect(controls.getByRole('button')).toHaveCount(3);
 const mute = controls.getByRole('button', { name: 'Mute', exact: true });
 const camera = controls.getByRole('button', { name: 'Camera', exact: true });
 const leave = controls.getByRole('button', { name: 'Leave', exact: true });
 await expect(leave).toBeVisible();
 await expect(launcher(page)).toBeHidden();
 /* A tap in the centre of Leave ended the call on a desktop and opened GilbertOne on a phone. */
 if (isMobile) {
  await leave.scrollIntoViewIfNeeded();
  const hit = await leave.evaluate(button => {
   const rect = button.getBoundingClientRect();
   const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
   return (el instanceof Element && (el === button || button.contains(el))) ? 'Leave' : (el?.closest('button')?.getAttribute('aria-label') ?? el?.closest('button')?.textContent ?? 'nothing');
  });
  expect(hit).toBe('Leave');
 }
 await expect(mute).toHaveAttribute('aria-pressed', 'false');
 await mute.click();
 await expect(mute).toHaveAttribute('aria-pressed', 'true');
 await expect(camera).toHaveAttribute('aria-pressed', 'false');
 await camera.click();
 await expect(camera).toHaveAttribute('aria-pressed', 'true');
 await expect(page.getByText('Camera off', { exact: true })).toBeVisible();

 await leave.click();
 await expect(page.getByRole('heading', { name: 'Call ended' })).toBeVisible();
 await expect(page.getByText('This was a simulated call. Nothing was recorded or stored.')).toBeVisible();
 await expect(launcher(page)).toBeVisible();
 await page.getByRole('button', { name: 'Back to MyThuso' }).click();
 await expect(page.getByRole('heading', { level: 1, name: 'Online consultation' })).toBeVisible();

 expect(await mediaCalls(page)).toEqual([]);
});

test('the direct address opens the same consent gate', async ({ page }) => {
 await armMedia(page);
 await page.goto('/app/?open=video-consult');
 await expect(page.getByRole('heading', { level: 1, name: 'Video consult' })).toBeVisible();
 await expect(page.getByRole('heading', { name: 'Before you join' })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Join call' })).toBeDisabled();
 await page.getByRole('checkbox', { name: /I understand/ }).check();
 await page.getByRole('button', { name: 'Join call' }).click();
 await expect(page.getByText('Demo simulation · not a live call')).toBeVisible();
 expect(await mediaCalls(page)).toEqual([]);
});
