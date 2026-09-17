import { test, expect, type Page } from '@playwright/test';

/* GilbertOne, phase 1: the acceptance tests the scope document's §12 asks of a character
   demonstrator, as far as this phase reaches — AT01, AT02, AT03 in part, AT05, AT07 in part and
   AT12 in part. The rest of §12 is about a conversation, a model, a voice and an app action, none of
   which exist here, so there is nothing to test and nothing is asserted about them.
   The page is development-only (see src/Doorway.tsx) and these run against the dev server, which is
   what the whole suite runs against. */

const DEMO = '/app/?preview=gilbertone';
const status = (page: Page) => page.locator('.go-status-note');
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

/* AT03 in full for the half that applies: nothing here may ask for a camera or a microphone. The
   only way to assert "never asked" is to sit in front of the APIs before the page loads and fail if
   anything reaches for one. */
test.beforeEach(async ({ page }) => {
 await page.addInitScript(() => {
  const reached: string[] = [];
  (window as unknown as { reachedForMedia: string[] }).reachedForMedia = reached;
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
  const devices = navigator.mediaDevices;
  for (const name of ['getUserMedia', 'getDisplayMedia'] as const) {
   Object.defineProperty(devices, name, {
    configurable: true, value: () => { reached.push(name); return Promise.reject(new Error('refused by the test')); }
   });
  }
  const ask = navigator.permissions?.query?.bind(navigator.permissions);
  if (ask) navigator.permissions.query = (descriptor: PermissionDescriptor) => { reached.push(`permission:${descriptor.name}`); return ask(descriptor); };
 });
 await page.goto(DEMO);
 await expect(page.getByRole('heading', { name: 'Character demonstrator' })).toBeVisible();
});

test('AT01 · the character is transparent on every ground, and says it is a preview of nothing connected', async ({ page }) => {
 await expect(page.locator('.demo-pill')).toContainText('Design preview');
 await expect(page.getByText('Connected', { exact: true })).toHaveCount(0);
 const rig = page.locator('.go-stage .go-rig');
 await expect(rig).toHaveAttribute('aria-hidden', 'true');
 /* Nothing is painted behind the character: the only mark under it is the contact shadow, and the
    rig draws no full-bleed shape of its own. */
 const covering = await rig.evaluate(svg => [...svg.querySelectorAll('rect, ellipse, circle, path')]
  .filter(shape => { const box = shape.getBoundingClientRect(); const whole = svg.getBoundingClientRect();
   return box.width > whole.width * 0.95 && box.height > whole.height * 0.95; }).length);
 expect(covering).toBe(0);
 /* No ground of its own and nothing bleeding out of it: a transparent canvas and a contact shadow,
    rather than a panel or a glow that happens to match the page today. */
 expect(await rig.evaluate(el => { const style = getComputedStyle(el); return { background: style.backgroundColor, filter: style.filter }; }))
  .toEqual({ background: 'rgba(0, 0, 0, 0)', filter: 'none' });
 const size = async () => { const box = (await rig.boundingBox())!; return { width: box.width, height: box.height }; };
 const before = await size();
 for (const ground of ['Dark ground', 'Chequered ground']) {
  await page.getByRole('radio', { name: ground }).click();
  await expect(rig).toBeVisible();
  expect(await size()).toEqual(before);
 }
 /* The page's own controls are still reachable with the widget open — it is a floating panel, not a
    modal, and the way out of it is a button rather than a reload. */
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await expect(page.getByRole('button', { name: 'Close GilbertOne' })).toBeVisible();
 await page.getByRole('button', { name: 'Close the widget' }).click();
 await expect(page.getByRole('button', { name: 'Open GilbertOne' })).toBeVisible();
});

test('AT02 · blink, gaze, nod, the supportive pose and the yawn are each demonstrable, and each says so in words', async ({ page }) => {
 for (const [control, said] of [
  ['A03 Blink', 'GilbertOne blinks.'],
  ['A06 Look left', 'GilbertOne looks left.'],
  ['A06R Look right', 'GilbertOne looks right.'],
  ['A09 Acknowledge', 'GilbertOne acknowledges.'],
  ['A11 Support', 'GilbertOne holds a supportive pose.']
 ]) {
  await press(page, control);
  await expect(status(page)).toHaveText(said);
 }
 /* The yawn obeys its own rules against the reviewer as well: off in a care conversation, and a
    five-minute cooldown once it has run. */
 const yawn = page.getByRole('button', { name: 'A14 Yawn', exact: true });
 /* The supportive pose is one of §04's suppressors, so it is the reason first; with the face back at
    rest, the default of a care conversation is. */
 await expect(yawn).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Suppressed while Support is running');
 await press(page, 'A02 Idle');
 await expect(page.locator('.go-cue-blocked')).toContainText('Playful mode is off');
 await page.getByRole('button', { name: /Playful mode/ }).click();
 await expect(yawn).toBeEnabled();
 await yawn.click();
 await expect(status(page)).toHaveText('GilbertOne yawns.');
 await expect(yawn).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Cooling down');
});

test('AT02 · reduced motion and the pause control each stop nonessential movement and keep saying what the face is doing', async ({ page }) => {
 await page.getByRole('button', { name: 'Pause animation' }).click();
 await press(page, 'A03 Blink');
 await expect(status(page)).toContainText('paused');
 await press(page, 'A11 Support');
 await expect(status(page)).toHaveText('GilbertOne holds a supportive pose.');
 /* Paused means still: the rig holds one pose rather than walking a cue, so no transition is left
    running on the character. */
 expect(await page.locator('.go-stage .go-head').evaluate(el => el.getAnimations().length)).toBe(0);
 await page.getByRole('button', { name: 'Play animation' }).click();

 await page.emulateMedia({ reducedMotion: 'reduce' });
 await press(page, 'A03 Blink');
 await expect(status(page)).toContainText('Reduced motion is on');
 await expect(page.getByRole('button', { name: 'A14 Yawn', exact: true })).toBeDisabled();
 await press(page, 'A09 Acknowledge');
 await expect(status(page)).toHaveText('GilbertOne acknowledges.');
});

test('AT03 · nothing asks for a camera or a microphone, and no state on the page offers to hear you', async ({ page }) => {
 await press(page, 'A08 Process');
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await page.getByRole('textbox').fill('Can you hear me?');
 await page.getByRole('button', { name: /^Send this message/ }).click();
 await expect(page.locator('.go-shell-turn').last()).toContainText('No answering engine is connected');
 /* The voice capability's own sentence, word for word, is the widget's microphone state. */
 await expect(page.locator('.go-widget .not-connected')).toBeVisible();
 await expect(page.locator('.go-refusals')).toContainText('This page cannot hear you');
 expect(await page.evaluate(() => (window as unknown as { reachedForMedia: string[] }).reachedForMedia)).toEqual([]);
 await expect(page.locator('audio, video')).toHaveCount(0);
});

test('AT05 · a late trigger from an earlier turn changes nothing, and a lower track never displaces a higher one', async ({ page }) => {
 await press(page, 'Deliver a late trigger from an earlier turn');
 await expect(status(page)).toContainText('A late trigger from an earlier turn never restarts the mouth');
 await expect(status(page)).toContainText('A12 Clarify did not run');
});

test('AT07 · nothing playful can land while the urgent pose holds', async ({ page }) => {
 await page.getByRole('button', { name: /Playful mode/ }).click();
 await press(page, 'A16 Urgent support');
 await expect(status(page)).toContainText('steady, neutral face');
 await expect(page.getByRole('button', { name: 'A14 Yawn', exact: true })).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Suppressed while Urgent support is running');
 await press(page, 'A13 Appreciate');
 await expect(status(page)).toContainText('A13 Appreciate did not run');
 await expect(status(page)).toContainText('may not displace Safety override');
 /* Stop is an interruption, and an interruption is below safety: it may not dismiss the urgent face
    either. Only the thing that raised it lets it go. */
 await press(page, 'Stop');
 await expect(status(page)).toContainText('A15 Interrupt did not run');
 await press(page, 'Release any held pose');
 await expect(status(page)).toContainText('neutral pose');
});

test('AT12 · the page is keyboard operable, the speech demo is captioned, and a failed character does not break the widget', async ({ page }) => {
 const blink = page.getByRole('button', { name: 'A03 Blink', exact: true });
 await blink.focus();
 await expect(blink).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(status(page)).toHaveText('GilbertOne blinks.');

 await press(page, 'A10 Speak');
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await expect(page.locator('.go-caption')).toContainText('no audio is played');

 await page.getByRole('button', { name: /Break the character/ }).click();
 await expect(page.locator('.go-rig-failed')).toBeVisible();
 await expect(page.getByRole('button', { name: 'Close GilbertOne' })).toBeVisible();
 await page.getByRole('textbox').fill('The text still works.');
 await page.getByRole('button', { name: /^Send this message/ }).click();
 await expect(page.locator('.go-person-turn').last()).toContainText('The text still works.');
});

test('the demonstrator never claims to be the live assistant, a service, or connected to anything', async ({ page }) => {
 const words = await page.locator('body').innerText();
 expect(words).toContain("This is a preview of GilbertOne's presentation, not GilbertOne itself");
 expect(words).not.toMatch(/\bConnected\b/);
 /* Nothing is written to storage of any kind, on a page that holds what somebody types. */
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await page.getByRole('textbox').fill('Something private.');
 await page.getByRole('button', { name: /^Send this message/ }).click();
 expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('the page has no horizontal overflow at 320px, inside its scrolling regions as well as at the page level', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 const overflow = await page.evaluate(() => {
  const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const inside = [...document.querySelectorAll<HTMLElement>('main, .go-body, .go-panel, .go-cue-list')]
   .map(el => el.scrollWidth - el.clientWidth);
  return { page, inside: Math.max(0, ...inside) };
 });
 expect(overflow).toEqual({ page: 0, inside: 0 });
});
