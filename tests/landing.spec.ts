import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('/landing.html'); });
test('the landing page says what MyThuso is, and what it is not', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'Care that comes to you.' })).toBeVisible();
  // a health service that is not operating has to say so, above the fold and in the footer
  await expect(page.getByRole('status')).toContainText('MyThuso is in development');
  await expect(page.getByText('This is a preview, not a live service.')).toBeVisible();
  await expect(page.getByText(/People shown are illustrative/)).toBeVisible();
  expect(errors).toEqual([]);
});
test('it prices honestly from the same catalogue the app uses', async ({ page }) => {
  const services = page.locator('.landing-services article');
  await expect(services).toHaveCount(9);                       // phase one only
  await expect(services.first()).toContainText('From R 249');
  await expect(page.getByText('Chronic Routine')).toBeVisible();
  await expect(page.locator('.landing-plans article').first()).toContainText('R 199');
});
test('the questions answer, and only one at a time', async ({ page }) => {
  const faq = page.locator('.landing-faq > div');
  await expect(faq.first().getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/routine visits that cost you a day in a queue/)).toBeVisible();
  await faq.nth(2).getByRole('button').click();
  await expect(page.getByText(/Visits start at R249/)).toBeVisible();
  await expect(faq.first().getByRole('button')).toHaveAttribute('aria-expanded', 'false');
});
test('every section the nav offers actually exists', async ({ page }) => {
  const links = page.locator('.landing-nav nav a');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const id = (await links.nth(i).getAttribute('href'))!.slice(1);
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});
test('it does not scroll sideways on a phone', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
/* The page animates a lot. Two things have to stay true whatever the motion setting: no section is
   ever left invisible, and a reader who asked for less motion gets none. */
test('sections arrive as you reach them, and none of them can get stuck hidden', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
  const safety = page.getByRole('heading', { name: 'The parts we will not shortcut.' });
  await safety.scrollIntoViewIfNeeded();
  await expect(safety).toBeVisible();
  // including everything the jump to that heading scrolled straight past, which an observer alone
  // would have left invisible above the reader for the rest of the visit
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-reveal]')]
    .filter(el => el.getBoundingClientRect().top < innerHeight && getComputedStyle(el).opacity === '0').length))
    .toBe(0);
});
test.describe('when the reader has asked for less motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('nothing moves, and the page is fully visible without it', async ({ page }) => {
    // the reveal styles are keyed off this flag, so leaving it unset is what keeps the page visible
    expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBeUndefined();
    await expect(page.getByRole('heading', { name: 'The parts we will not shortcut.' })).toBeVisible();
    await expect(page.locator('.landing-strip > div').first()).toContainText('~50 million');
    const moving = await page.evaluate(() => document.getAnimations()
      .filter(a => a.playState === 'running').map(a => (a as CSSAnimation).animationName ?? 'transition'));
    expect(moving).toEqual([]);
  });
});
