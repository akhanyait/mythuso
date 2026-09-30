import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { confirmBooking, goSection } from './nav';
import { noticeFor } from './notices';

/* The home in the Lovable export's arrangement (30 September 2026): the next visit as the primary-coloured hero,
 * quick actions, the care team, the medicine, the doctor's words, the wellbeing tiles and the care tips — each
 * figure asserted against the contract it is read from, never against a copy typed here — and the entrance that
 * was dead until this change. What the export draws there and this home refuses is asserted absent: adherence
 * ticks, a "daily insight", invented messages. */
const read = (path: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${path}`, import.meta.url), 'utf8'));
const passport = read('passport.json');
const dispensing = read('dispensing.json');
const tips = read('care-tips.json');
const scheduling = read('scheduling.json');

const region = (page: Page, name: string) => page.getByRole('region', { name });

test('with nothing booked, the hero says so and offers the booking', async ({ page }) => {
 await page.goto('/app/');
 const hero = page.locator('.pd-hero');
 await expect(hero.getByRole('heading', { name: scheduling.labels.noUpcoming })).toBeVisible();
 await expect(hero).toContainText(scheduling.labels.noUpcomingDetail);
 await expect(hero.getByRole('button', { name: /Join/ })).toHaveCount(0);
 await hero.getByRole('button', { name: 'Book a nurse' }).click();
 await expect(page).toHaveTitle('Book a nurse · MyThuso');
});

test('a booked visit leads the home, and Reschedule moves that visit', async ({ page }) => {
 await page.goto('/app/');
 await page.locator('.shortcut-row').filter({ hasText: 'Vitals & chronic check' }).click();
 const booking = page.getByRole('dialog');
 for (let step = 0; step < 5; step++) await booking.getByRole('button', { name: 'Continue', exact: true }).click();
 await booking.getByRole('checkbox').check();
 await confirmBooking(booking);
 await booking.getByRole('button', { name: 'View my visits' }).click();
 await goSection(page, 'Overview');

 const hero = page.locator('.pd-hero');
 await expect(hero.getByRole('heading', { name: 'Vitals & chronic check' })).toBeVisible();
 /* The nurse is drawn as initials — there is no photograph of anybody — and is the nurse the visit's own
    detail names. */
 await expect(hero.locator('img')).toHaveCount(0);
 const nurse = (await hero.locator('.pd-hero__who strong').textContent())!.trim();
 await hero.getByRole('button', { name: 'Prepare for my visit' }).click();
 await expect(page.getByRole('dialog')).toContainText(nurse);
 await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();

 await hero.getByRole('button', { name: 'Reschedule' }).click();
 await expect(page.getByRole('dialog').getByRole('heading', { name: 'Move this visit' })).toBeVisible();
});

test('the care team, the medicine and the doctor\'s words are the contracts\' own', async ({ page }) => {
 await page.goto('/app/');
 const team = region(page, 'Your care team');
 await expect(team).toContainText(passport.reviewer.name);
 await expect(team).toContainText(passport.reviewer.registration);
 /* Two people, because the record names two. The export's clinic row has no clinic behind it. */
 await expect(team.locator('.pd-row')).toHaveCount(2);

 const medicine = region(page, 'Your medicine');
 const auth = dispensing.authorisation;
 await expect(medicine).toContainText(auth.reference);
 await expect(medicine.locator('.pd-facts')).toContainText(`${auth.repeatsAuthorised - auth.repeatsUsed} of ${auth.repeatsAuthorised}`);
 await expect(medicine).toContainText(noticeFor('dispensing'));
 await expect(medicine.getByRole('button', { name: /Take now/ })).toHaveCount(0);

 const said = region(page, 'What your doctor said');
 await expect(said).toContainText(passport.lastReview.assessment);
 await expect(said).toContainText(passport.reviewer.name);
 await expect(page.getByText(/Daily insight|You are trending well/)).toHaveCount(0);

 await team.getByRole('button', { name: 'See who' }).click();
 await expect(page).toHaveTitle('Your care team · MyThuso');
});

test('the care tips row carries each tip\'s tag and title and the reviewer notice, and opens the tips', async ({ page }) => {
 await page.goto('/app/');
 const row = page.locator('.pd-tips');
 await expect(row.getByRole('heading', { name: tips.door.heading })).toBeVisible();
 await expect(row.locator('.pd-tip')).toHaveCount(tips.tips.length);
 for (const tip of tips.tips) {
  const tag = tips.categories.find((c: { id: string }) => c.id === tip.category).label;
  await expect(row.locator('.pd-tip').filter({ hasText: tip.title })).toContainText(tag);
 }
 await expect(row).toContainText(tips.review.notice);
 /* The title only: a tip's advice is read on its own screen, beside its refusals. */
 await expect(row).not.toContainText(tips.tips[0].body);
 await row.locator('.pd-tip').first().click();
 await expect(page.getByRole('heading', { level: 1, name: tips.screen.heading })).toBeVisible();
});

test('quick actions and the wellbeing tiles each open the screen they name', async ({ page }) => {
 test.setTimeout(60_000);
 await page.goto('/app/');
 const actions = region(page, 'Quick actions');
 const names = (await actions.locator('.pd-actions__list .pd-row strong').allTextContents()).map(s => s.trim());
 expect(names.length).toBe(5);
 for (const name of names) {
  await goSection(page, 'Overview');
  await region(page, 'Quick actions').locator('.pd-actions__list .pd-row').filter({ hasText: name }).click();
  await expect(page).toHaveTitle(`${name} · MyThuso`);
 }
 await goSection(page, 'Overview');
 const tiles = page.locator('.pd-wellbeing__tile');
 await expect(tiles).toHaveCount(4);
 for (let i = 0; i < 4; i++) {
  await goSection(page, 'Overview');
  const tile = page.locator('.pd-wellbeing__tile').nth(i);
  const box = (await tile.boundingBox())!;
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  await tile.click();
  await expect(page).not.toHaveTitle('Overview · MyThuso');
 }
});

test('the home arrives in steps, once, and is still for a reader who asked for stillness', async ({ page }) => {
 await page.goto('/app/');
 const home = page.locator('main .home');
 await expect(home).toHaveClass(/m-stagger/);
 /* Read from the computed style rather than the running animations: the entrance is over in half a second,
    often before a journey can look, and its name stays on the element once it has played. */
 const moving = () => home.evaluate(el => [...el.children].map(c => getComputedStyle(c).animationName).filter(n => n !== 'none'));
 await expect.poll(async () => (await moving()).length).toBeGreaterThanOrEqual(3);
 expect(new Set(await moving())).toEqual(new Set(['m-arrive']));
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.reload();
 await expect(home).toBeVisible();
 expect(await moving()).toEqual([]);
 /* Nothing is left at opacity 0 for the reader who asked for stillness. */
 expect(await home.evaluate(el => [...el.children].every(c => getComputedStyle(c).opacity === '1'))).toBe(true);
});
