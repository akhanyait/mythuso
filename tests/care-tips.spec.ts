import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Care tips, after a visit — the founder's motion reference of 28 September 2026, built as a contract.
 *
 * What is held here is the journey and what the screen refuses, never how it looks: a completed visit
 * has a door to the tips; the stack is read one card at a time, forwards, backwards and by jumping, and
 * thins as it is read; the reviewer notice is on the screen with every tip; every word on it is
 * packages/catalog/care-tips.json's; every control is a 44px target; nothing scrolls sideways; and the
 * card's entrance ends, and does not happen at all for a reader who asked for stillness. Every sentence
 * asserted is read from the contract, so a reworded tip changes this test's expectations rather than
 * breaking it. */
const tips = JSON.parse(readFileSync(new URL('../packages/catalog/care-tips.json', import.meta.url), 'utf8'));
const words = tips.screen;
const category = (id: string) => tips.categories.find((c: { id: string }) => c.id === id);
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
const counter = (i: number) => fill(words.counter, { n: i + 1, total: tips.tips.length });
const jump = (i: number) => fill(words.jumpLabel, { n: i + 1, title: tips.tips[i].title });

const tabIndex: Record<string, number> = { 'My visits': 2 };
async function openVisits(page: Page) {
 const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
 if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: /^My visits/ }).click();
 else await page.locator('.tabbar button').nth(tabIndex['My visits']).click();
}
const card = (page: Page) => page.locator('.ct-card');
const expectTip = async (page: Page, i: number) => {
 const tip = tips.tips[i];
 await expect(card(page).getByRole('heading', { name: tip.title })).toBeVisible();
 await expect(card(page)).toContainText(tip.body);
 await expect(card(page).locator('.ct-tag')).toHaveText(category(tip.category).label);
 await expect(card(page).locator('.ct-count')).toHaveText(counter(i));
 await expect(page.getByRole('button', { name: jump(i) })).toHaveAttribute('aria-current', 'step');
};

test('a completed visit opens the care tips, and the stack is read forwards, backwards and by jumping', async ({ page }) => {
 await page.goto('/app/');
 await openVisits(page);
 await page.getByRole('tablist', { name: 'Visit status' }).getByRole('tab', { name: 'Past' }).click();
 await page.getByRole('button', { name: 'View details' }).first().click();
 const visit = page.getByRole('dialog');
 await expect(visit.getByRole('heading', { name: tips.door.heading })).toBeVisible();
 await visit.getByRole('button', { name: tips.door.action }).click();

 await expect(page.getByRole('heading', { level: 1, name: words.heading })).toBeVisible();
 await expect(page.getByText(tips.review.notice)).toBeVisible();
 await expectTip(page, 0);
 await expect(page.getByRole('button', { name: words.back, exact: true })).toBeDisabled();
 /* The next two peek from behind, and the stack thins as it is read. */
 await expect(page.locator('.ct-peek')).toHaveCount(2);

 for (let i = 1; i < tips.tips.length; i++) {
  await page.getByRole('button', { name: words.next, exact: true }).click();
  await expectTip(page, i);
  await expect(page.locator('.ct-peek')).toHaveCount(Math.min(2, tips.tips.length - 1 - i));
  await expect(page.getByText(tips.review.notice)).toBeVisible();
 }
 /* On the last tip Next becomes Start again, and it does. */
 await expect(page.getByRole('button', { name: words.next, exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: words.back, exact: true }).click();
 await expectTip(page, tips.tips.length - 2);
 await page.getByRole('button', { name: words.next, exact: true }).click();
 await page.getByRole('button', { name: words.startAgain, exact: true }).click();
 await expectTip(page, 0);
 /* Any tip is one press away. */
 await page.getByRole('button', { name: jump(2) }).click();
 await expectTip(page, 2);
});

test('the tips screen says only what the contract says, and every control is a 44px target', async ({ page }) => {
 await page.goto('/app/?open=care-tips');
 await expectTip(page, 0);
 const allowed = new Set<string>([
  words.eyebrow, words.heading, words.lead, words.back, words.next, words.startAgain, words.refusalsHeading, words.emergencyLabel,
  tips.review.notice, ...tips.refusals.map((r: { sentence: string }) => r.sentence),
  ...tips.tips.flatMap((t: { title: string; body: string; category: string }, i: number) => [t.title, t.body, category(t.category).label, counter(i)])
 ]);
 const shown = await page.locator('.ct-screen').evaluate(root => {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent?.trim(); if (t) out.push(t); }
  return out;
 });
 expect(shown.length).toBeGreaterThan(8);
 expect(shown.filter(t => !allowed.has(t))).toEqual([]);

 const targets = page.locator('.ct-progress button, .ct-actions button, .ct-about button');
 for (let i = 0; i < await targets.count(); i++) {
  const box = await targets.nth(i).boundingBox();
  expect(box!.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
 }
 /* Nothing scrolls sideways, on the page or inside the scrollers a page-level check cannot see into. */
 for (let i = 0; i < tips.tips.length; i++) {
  const sideways = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('main, .workspace, .ct-screen, .ct-stack')]
   .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className));
  expect(sideways).toEqual([]);
  if (i < tips.tips.length - 1) await page.getByRole('button', { name: words.next, exact: true }).click();
 }
 /* The last tip is about not waiting, so the emergency numbers are one press from it. */
 await page.getByRole('button', { name: words.emergencyLabel }).click();
 await expect(page.getByRole('dialog').getByText('10177').first()).toBeVisible();
});

test('each tip rises once and settles; under reduced motion it is simply there', async ({ page }) => {
 await page.goto('/app/?open=care-tips');
 await expectTip(page, 0);
 const moving = () => page.evaluate(() => document.getAnimations()
  .filter(a => a.playState === 'running')
  .filter(a => { const t = (a.effect as KeyframeEffect | null)?.target; return t instanceof Element && !!t.closest('.ct-card'); })
  .map(a => (a as Animation & { animationName?: string }).animationName ?? 'script'));
 await page.getByRole('button', { name: words.next, exact: true }).click();
 /* The entrance is transform and opacity, never a blur, and it ends. */
 const properties = await page.evaluate(() => [...new Set(document.getAnimations()
  .filter(a => ['ct-card-in', 'ct-words-in'].includes((a as Animation & { animationName?: string }).animationName ?? ''))
  .flatMap(a => (a.effect as KeyframeEffect).getKeyframes().flatMap(k => Object.keys(k)))
  .filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))]);
 expect(properties.length).toBeGreaterThan(0);
 for (const p of properties) expect(['opacity', 'transform']).toContain(p);
 await expect.poll(moving).toEqual([]);
 expect(await card(page).evaluate(el => getComputedStyle(el).opacity)).toBe('1');

 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto('/app/?open=care-tips');
 await page.getByRole('button', { name: words.next, exact: true }).click();
 await expectTip(page, 1);
 expect(await moving()).toEqual([]);
 expect(await card(page).evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});
