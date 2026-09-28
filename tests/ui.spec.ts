import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The shared components — the design handoff's library rebuilt on the tokens (apps/web/src/ui, 28 September 2026).
 *
 * What is held here is what the source cannot show: that the gallery at `?open=ui` (development builds only)
 * draws every component the handoff's catalogue names on both themes; that a keyboard reaches a component and
 * sees the one ring; that tabs say which is selected and move with the arrows; that a status is words and not a
 * dot; that a disabled button cannot be pressed; that a control is 44 to a finger even where its face is smaller;
 * that nothing pushes the page sideways; that every word painted in either theme clears its contrast floor as
 * the browser actually composites it; and that nothing in the library moves forever. Expectations are read from
 * the catalogue and tokens.json, so a component or a colour changed there is asserted here rather than broken. */
const catalogue = JSON.parse(readFileSync(new URL('../packages/brand/lovable-handoff/handoff/docs/component-catalog.json', import.meta.url), 'utf8')) as { components: { name: string }[] };
const tokens = JSON.parse(readFileSync(new URL('../packages/design-tokens/tokens.json', import.meta.url), 'utf8')) as {
 semantic: Record<'light' | 'dark', Record<string, { hex: string }>>;
 targets: { minimum: number };
};
/* The handoff's animated GilbertOne is not rebuilt as a shared component; scripts/check-boundaries.mjs says why. */
const NOT_REBUILT = new Set(['GilbertOne']);
const MODES = ['light', 'dark'] as const;
const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

async function openGallery(page: Page) {
 await page.goto('/app/?open=ui');
 const gallery = page.locator('[data-ui-gallery]');
 await expect(gallery.getByRole('heading', { level: 1, name: 'Shared components' })).toBeVisible();
 return gallery;
}

test('the gallery draws every component the handoff catalogues, on the light theme and the dark', async ({ page }) => {
 const gallery = await openGallery(page);
 const names = catalogue.components.map(c => c.name).filter(n => !NOT_REBUILT.has(n));
 expect(names.length).toBeGreaterThanOrEqual(18);
 for (const mode of MODES) {
  const pane = gallery.locator(`[data-theme-pane="${mode}"]`);
  await expect(pane).toHaveAttribute('data-theme', mode);
  /* The pane carries its theme's own ground from tokens.json, whatever the operating system prefers. */
  await expect(pane).toHaveCSS('background-color', rgbOf(tokens.semantic[mode].background.hex));
  for (const name of names) await expect(pane.locator(`[data-component="${name}"]`).first(), `${name} in ${mode}`).toBeVisible();
  for (const variant of ['primary', 'accent', 'secondary', 'ghost', 'destructive'])
   await expect(pane.locator(`.ui-button--${variant}`).first()).toBeVisible();
  for (const variant of ['info', 'success', 'warning', 'danger'])
   await expect(pane.locator(`.ui-alert--${variant} svg`)).toBeVisible();
 }
 await expect(gallery.getByRole('alert')).toHaveCount(2);
 await expect(gallery.getByRole('button', { name: 'Search' })).toHaveCount(6);
});

test('a keyboard reaches a component and sees the ring', async ({ page }) => {
 const gallery = await openGallery(page);
 for (const mode of MODES) {
  const pane = gallery.locator(`[data-theme-pane="${mode}"]`);
  const target = pane.locator('[data-component="Button"] [data-state="default"] button').first();
  /* Arrive by Tab, so the focus is a keyboard's rather than a script's. */
  await target.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS('outline-style', 'solid');
  await expect(target).toHaveCSS('outline-width', '2px');
  await expect(target).toHaveCSS('outline-offset', '2px');
  await expect(target).toHaveCSS('outline-color', rgbOf(tokens.semantic[mode].ring.hex));
  /* One shadow at most — core.css's second focus ring is not stacked on it. */
  await expect(target).toHaveCSS('box-shadow', 'none');
  const field = pane.getByLabel('Street address');
  await field.focus();
  await expect(field).toHaveCSS('outline-color', rgbOf(tokens.semantic[mode].ring.hex));
  await expect(field).toHaveCSS('border-top-color', rgbOf(tokens.semantic[mode].ring.hex));
 }
});

test('tabs say which is selected, keep one Tab stop, and move with the arrows', async ({ page }) => {
 const gallery = await openGallery(page);
 const list = gallery.getByRole('tablist', { name: 'Patient views, light' });
 const tabs = list.getByRole('tab');
 await expect(tabs).toHaveCount(3);
 for (const tab of await tabs.all()) expect(['true', 'false']).toContain(await tab.getAttribute('aria-selected'));
 await expect(list.getByRole('tab', { selected: true })).toHaveText('Summary');
 await expect(list.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
 await list.getByRole('tab', { name: 'Timeline' }).click();
 await expect(list.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
 await expect(list.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'false');
 await page.keyboard.press('ArrowRight');
 await expect(list.getByRole('tab', { name: 'Results' })).toBeFocused();
 await expect(list.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true');
 await page.keyboard.press('Home');
 await expect(list.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
 await expect(list.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
 /* The selected tab differs by its raised face as well as its colour. */
 await expect(list.getByRole('tab', { selected: true })).not.toHaveCSS('box-shadow', 'none');
 /* The current destination in a rail is aria-current, and heavier as well as tinted. */
 const rail = gallery.getByRole('navigation', { name: 'Sample rail, light' });
 await rail.getByRole('button', { name: /My visits/ }).click();
 await expect(rail.getByRole('button', { name: /My visits/ })).toHaveAttribute('aria-current', 'page');
 await expect(rail.getByRole('button', { name: /My visits/ })).toHaveCSS('font-weight', '600');
 await expect(rail.getByRole('button', { name: /Overview/ })).not.toHaveAttribute('aria-current', 'page');
});

test('a status is words, a field points at its message, and an icon button has a name', async ({ page }) => {
 const gallery = await openGallery(page);
 const statuses = gallery.locator('.ui-status');
 await expect(statuses).toHaveCount(6);
 for (const status of await statuses.all()) {
  expect((await status.innerText()).trim().length).toBeGreaterThan(2);
  await expect(status.locator('.ui-status__dot')).toHaveAttribute('aria-hidden', 'true');
 }
 /* Offline differs from online by shape, not by colour alone. */
 const offline = gallery.locator('.ui-status--offline .ui-status__dot').first();
 await expect(offline).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
 await expect(offline).toHaveCSS('border-top-style', 'solid');

 const mobile = gallery.locator('[data-theme-pane="light"]').getByLabel('Mobile number');
 await expect(mobile).toHaveAttribute('aria-invalid', 'true');
 await expect(mobile).toHaveAttribute('aria-required', 'true');
 const describedBy = await mobile.getAttribute('aria-describedby');
 expect(describedBy).toBe('light-mobile-description');
 await expect(page.locator(`#${describedBy}`)).toHaveText('Enter the ten digits of a South African mobile number.');
 await expect(mobile).toHaveAccessibleDescription('Enter the ten digits of a South African mobile number.');
 await expect(gallery.locator('[data-theme-pane="light"]').getByLabel('Street address')).toHaveAccessibleDescription("The nurse's route starts here.");

 for (const name of ['Search', 'Close', 'Download', 'Notifications']) await expect(gallery.getByRole('button', { name }).first()).toBeVisible();
 for (const button of await gallery.locator('.ui-button--icon').all()) expect((await button.getAttribute('aria-label'))?.length).toBeGreaterThan(0);
 /* A spinner announces itself in words. */
 await expect(gallery.getByRole('status').filter({ hasText: 'Loading the visit' }).first()).toBeAttached();
});

test('a disabled or loading button cannot be pressed', async ({ page }) => {
 const gallery = await openGallery(page);
 const disabled = gallery.locator('.ui-button:disabled');
 expect(await disabled.count()).toBeGreaterThanOrEqual(20);
 for (const button of (await disabled.all()).slice(0, 12)) {
  await expect(button).toBeDisabled();
  await button.scrollIntoViewIfNeeded();
  await button.evaluate(el => { (el as HTMLElement & { pressed?: number }).pressed = 0; el.addEventListener('click', () => { (el as HTMLElement & { pressed?: number }).pressed! += 1; }); });
  const box = (await button.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await button.evaluate(el => (el as HTMLElement & { pressed?: number }).pressed)).toBe(0);
 }
 await expect(gallery.locator('.ui-button[aria-busy="true"]').first()).toBeDisabled();
});

test('controls are 44 to a finger: md and above by their face, the compact ones by their hit area', async ({ page }) => {
 const gallery = await openGallery(page);
 const floor = tokens.targets.minimum;
 const full = gallery.locator('.ui-button--md, .ui-button--lg, .ui-button--icon:not(.ui-button--icon-sm), .ui-nav-item, .ui-control, .ui-checkbox');
 expect(await full.count()).toBeGreaterThan(60);
 for (const el of await full.all()) {
  const box = (await el.boundingBox())!;
  expect(box.height, await el.evaluate(e => e.className)).toBeGreaterThanOrEqual(floor - 0.5);
 }
 for (const el of await gallery.locator('.ui-button--icon:not(.ui-button--icon-sm)').all()) expect((await el.boundingBox())!.width).toBeGreaterThanOrEqual(floor - 0.5);
 /* The compact faces — a small button, a small icon button, a tab — are smaller to look at and not to press:
    a point just inside the 44-pixel square centred on each still lands on it. */
 const compact = gallery.locator('.ui-button--sm, .ui-button--icon-sm, .ui-tab:not(:disabled)');
 expect(await compact.count()).toBeGreaterThanOrEqual(8);
 for (const el of await compact.all()) {
  /* Centred in the viewport, so the floating GilbertOne button in a corner never sits over the point probed. */
  await el.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = (await el.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, reach = floor / 2 - 1;
  for (const [x, y] of [[cx, cy - reach], [cx, cy + reach], [cx - reach, cy], [cx + reach, cy]]) {
   const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button')?.outerHTML ?? null, [x, y]);
   expect(hit, `${await el.innerText()} at ${x - cx},${y - cy}`).toBe(await el.evaluate(e => e.outerHTML));
  }
 }
});

test('nothing pushes the page sideways, at this width or at 320', async ({ page }) => {
 const gallery = await openGallery(page);
 const sideways = () => page.evaluate(() => {
  const worst: string[] = [];
  if (document.documentElement.scrollWidth > innerWidth) worst.push(`document ${document.documentElement.scrollWidth} > ${innerWidth}`);
  /* Inside scroll containers too: a box that scrolls vertically also scrolls sideways, where a page-level check cannot see it. */
  for (const el of [document.querySelector('main'), ...document.querySelectorAll('[data-ui-gallery], [data-theme-pane], [data-component]')] as HTMLElement[])
   if (el && el.scrollWidth > el.clientWidth + 1) worst.push(`${el.tagName.toLowerCase()}${el.dataset.component ? `[${el.dataset.component}]` : ''} ${el.scrollWidth} > ${el.clientWidth}`);
  return worst;
 });
 expect(await sideways()).toEqual([]);
 await page.setViewportSize({ width: 320, height: 800 });
 await expect(gallery).toBeVisible();
 expect(await sideways()).toEqual([]);
});

test('every word in both themes clears its floor as the browser paints it', async ({ page }) => {
 await openGallery(page);
 const failures = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  /* Any colour the browser can compute — including a color-mix — read back as sRGB through a canvas. */
  const rgba = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r / 255, g / 255, b / 255, a / 255]; };
  const over = (top: number[], under: number[]) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
  const lum = (c: number[]) => c.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const out: string[] = [];
  let measured = 0;
  for (const pane of document.querySelectorAll<HTMLElement>('[data-theme-pane]')) {
   const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
   for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement!;
    if (!node.textContent!.trim() || el.closest('.visually-hidden, [aria-hidden="true"], :disabled, [aria-disabled="true"], .ui-checkbox:has(:disabled)')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden') continue;
    /* The grounds under the text, composited from the pane down; an ancestor at partial opacity is a
       disabled state, which WCAG exempts, and is skipped above. */
    const chain: HTMLElement[] = [];
    for (let at: HTMLElement | null = el; at && at !== pane.parentElement; at = at.parentElement) chain.unshift(at);
    let ground = [1, 1, 1];
    for (const at of chain) { const bg = rgba(getComputedStyle(at).backgroundColor); if (bg[3] > 0) ground = over(bg, ground); }
    const fg = over(rgba(style.color), ground);
    const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
    const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(fg, ground);
    measured++;
    if (r < floor) out.push(`${pane.dataset.themePane}: "${node.textContent!.trim().slice(0, 40)}" (${el.className}) ${r.toFixed(2)} < ${floor}`);
   }
  }
  return { out, measured };
 });
 expect(failures.measured).toBeGreaterThan(200);
 expect(failures.out).toEqual([]);
});

test('nothing moves forever, and reduced motion removes the one turn the loading arc makes', async ({ page }) => {
 const gallery = await openGallery(page);
 const endless = () => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations === Infinity && (a.effect as KeyframeEffect).target?.closest('[data-ui-gallery]')).length);
 expect(await endless()).toBe(0);
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.reload();
 await expect(gallery.locator('.ui-spinner').first()).toBeVisible();
 expect(await gallery.locator('.ui-spinner').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
 expect(parseFloat(await gallery.locator('.ui-button').first().evaluate(el => getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
});
