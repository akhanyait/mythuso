import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';
/* MyThuso for Mom, the plan a child pays for a parent, at the three prices the founder confirmed on
 * 14 September 2026.
 *
 * Every figure and sentence here is read from packages/catalog/mom-plans.json rather than typed. A spec
 * that carried "R399" would pass on the day the contract said R449 and the screen said R449 too, and
 * the only thing it would have proved is that somebody typed the same number twice.
 *
 * What is asserted is the half of the feature that matters: the panel is not downloaded until somebody
 * opens Care plans, the prices render, every inclusion stands beside the notice of the capability it
 * waits on, the refusals are on the screen word for word, and nothing on the screen offers to take
 * anybody's money. */
type Inclusion = { id: string; text: string; capability: string; undecided?: string };
type Tier = { id: string; name: string; price: number; phase: number; cadence: string; includes: Inclusion[] };
const plan = JSON.parse(readFileSync(new URL('../packages/catalog/mom-plans.json', import.meta.url), 'utf8')) as {
  name: string; tiers: Tier[]; refusals: { id: string; sentence: string }[]; openQuestions: string[];
  addOns: { statement: string; items: { id: string; name: string }[] }; splitting: { statement: string };
};
const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);

async function openPlans(page: Page) {
  await page.goto('/app/');
  await goSection(page, 'Care plans');
}

/* The panel, its contract and its stylesheet are one chunk that a patient downloads only by opening
   Care plans. Watched on the network rather than read off a build report, because what matters is
   what the handset asks for. Two other sections are opened first, so the absence is not just a
   screen that had not finished loading. */
test('the plan panel is not downloaded until Care plans is opened', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', request => { if (/MomPlans|mom-plans/.test(request.url())) asked.push(request.url()); });
  await page.goto('/app/');
  await goSection(page, 'My visits');
  await goSection(page, 'Health Passport');
  await page.waitForLoadState('networkidle');
  expect(asked, 'the patient app fetched the plans panel before anybody opened Care plans').toEqual([]);
  await goSection(page, 'Care plans');
  await expect(page.getByRole('region', { name: plan.name })).toBeVisible();
  expect(asked.some(url => /MomPlans/.test(url)), 'opening Care plans did not fetch the plans panel').toBe(true);
});

/* The chunk that never arrives: one bar of signal, or a clinic's wifi answering with its own sign-in
   page. The screen keeps its payments notice and the other plans and says the plan did not load.
   This test once clicked a "Try again" that re-ran the import and waited for the panel, and it never
   came: the browser keeps a module that failed to fetch failed. So the retry is a fresh load of Care
   plans, and what is asserted is that pressing it, once the network answers, really does bring the
   plan back — on the same screen, not the overview. */
test('if the plan panel does not arrive, the screen says so and loading it again brings it back', async ({ page }) => {
  let blocked = true;
  await page.route(/MomPlans/, route => (blocked ? route.abort() : route.continue()));
  await openPlans(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('alert')).toContainText('MyThuso for Mom did not load');
  await expect(main.locator('.not-connected').first()).toHaveText(noticeFor('payments'));
  await expect(main.locator('.plan-card')).toHaveCount(4);
  blocked = false;
  await main.getByRole('button', { name: 'Load it again' }).click();
  await expect(page).toHaveURL(/[?&]open=care-plans/);
  await expect(page.getByRole('main').getByRole('region', { name: plan.name })).toBeVisible();
  await expect(page.getByRole('main').locator('.plan-card')).toHaveCount(4);
});

test('the three tiers and their prices render from the contract, and one is chosen', async ({ page }) => {
  await openPlans(page);
  const section = page.getByRole('region', { name: plan.name });
  await expect(section).toBeVisible();
  const choices = section.getByRole('group', { name: `${plan.name} plans` }).getByRole('button');
  await expect(choices).toHaveCount(plan.tiers.length);
  for (const [i, tier] of plan.tiers.entries()) {
    await expect(choices.nth(i)).toContainText(tier.name);
    await expect(choices.nth(i)).toContainText(money(tier.price));
    await expect(choices.nth(i)).toContainText(tier.cadence);
  }
  // exactly one chosen at a time, and the choice is said by aria-pressed rather than by a fill alone
  await expect(section.locator('.mom-tier[aria-pressed="true"]')).toHaveCount(1);
  await choices.nth(2).click();
  await expect(choices.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(choices.nth(0)).toHaveAttribute('aria-pressed', 'false');
});

test('every inclusion stands beside the notice of the capability it depends on', async ({ page }) => {
  await openPlans(page);
  const section = page.getByRole('region', { name: plan.name });
  const choices = section.getByRole('group', { name: `${plan.name} plans` }).getByRole('button');
  for (const [i, tier] of plan.tiers.entries()) {
    await choices.nth(i).click();
    await expect(section.getByRole('heading', { name: new RegExp(`What ${tier.name} would bring`) })).toBeVisible();
    await expect(section.locator('.mom-inclusion')).toHaveCount(tier.includes.length);
    for (const inclusion of tier.includes) {
      const row = section.locator(`[data-inclusion="${inclusion.id}"]`);
      await expect(row).toContainText(inclusion.text);
      if (inclusion.undecided) await expect(row).toContainText(inclusion.undecided);
      /* The group this row belongs to carries that capability's own sentence, from capabilities.json.
         The inner locator is built from the page, not from `section`: a `has` locator is resolved
         inside the element it filters, so one that starts at the section looks for the section again
         inside each group and matches none of them. */
      const group = section.locator('.mom-group').filter({ has: page.locator(`[data-inclusion="${inclusion.id}"]`) });
      await expect(group).toHaveAttribute('data-capability', inclusion.capability);
      await expect(group.locator('.not-connected')).toHaveText(noticeFor(inclusion.capability));
    }
  }
});

test('the refusals, the open questions and the unpriced add-ons are on the screen word for word', async ({ page }) => {
  await openPlans(page);
  const section = page.getByRole('region', { name: plan.name });
  for (const refusal of plan.refusals) await expect(section.locator(`[data-refusal="${refusal.id}"]`)).toHaveText(refusal.sentence);
  for (const question of plan.openQuestions) await expect(section.getByText(question, { exact: true })).toBeVisible();
  await expect(section.getByText(plan.addOns.statement, { exact: true })).toBeVisible();
  for (const addOn of plan.addOns.items) await expect(section.getByText(addOn.name, { exact: true })).toBeVisible();
  await expect(section.getByText(plan.splitting.statement, { exact: true })).toBeVisible();
  // an add-on has no price, because none has been set
  await expect(section.locator('.mom-addons')).not.toContainText('R');
});

test('nothing on the care-plans screen can be bought', async ({ page }) => {
  await openPlans(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('region', { name: plan.name })).toBeVisible();
  await expect(main.locator('.not-connected').first()).toHaveText(noticeFor('payments'));
  await expect(main.getByRole('button', { name: /buy|subscribe|join|checkout|pay now|sign up|add to/i })).toHaveCount(0);
  await expect(main.locator('button.primary')).toHaveCount(0);
  // and the R249 plan it replaced is gone from the screen, rather than sitting beside the three
  await expect(main.getByText(/(^|[^y] )Thuso Mom\b/)).toHaveCount(0);
});

test('the public page quotes the same tiers the app does', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.landing-plans li').filter({ hasText: plan.name });
  await expect(card).toHaveCount(1);
  const prices = plan.tiers.map(t => t.price);
  await expect(card).toContainText(money(Math.min(...prices)));
  await expect(card).toContainText(money(Math.max(...prices)));
});
