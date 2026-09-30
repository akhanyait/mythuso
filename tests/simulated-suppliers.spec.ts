import { test, expect, type Page } from '@playwright/test';
import { capabilityOf, confirmBooking, goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';
import { cardAndEft } from '../apps/api/src/simulation/payments.ts';
import { isRefusal } from '../apps/api/src/simulation/index.ts';
/* The money and the identity seams, walked end to end against a stand-in.
 *
 * Nothing here asserts that a simulator works. It asserts the two things a simulator is worth
 * having for, and they are both about what it will not do:
 *
 *   **The screen never goes quiet.** A simulated capability is not a connected one. Every screen
 *   below still says, in the contract's own words, that what answered it is a fixture — and the
 *   sentence is read from packages/catalog/capabilities.json rather than typed here, because a spec
 *   carrying its own copy of a notice is one more place for the notice to be wrong.
 *
 *   **The failures are reachable.** A code that does not arrive, a payment that is declined, a
 *   payout the bank sends back, an account nothing can verify. Each of those is a state somebody
 *   has to have drawn a screen for, and a preview in which none of them ever happens is a preview
 *   that has quietly agreed suppliers always work.
 *
 * Both viewports, because a person who cannot sign in is more likely to be on the phone.
 */

/* The patient's catalogue, on either shell. The tab bar labels its entries more shortly than the
   sidebar names them, so it is reached by position there — the same helper booking-integrity uses,
   for the same reason. */
const patientTabs = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'More'];
const openCatalogue = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Book a nurse', exact: true }).click();
  else await page.locator('.tabbar button').nth(patientTabs.indexOf('Book a nurse')).click();
};

const signOut = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  else await page.locator('.tabbar button').nth(4).click();
  /* The profile dialog's, or the More hub's: the sidebar has its own Log out at its foot since 30 September. */
  await page.getByRole('dialog').or(page.getByRole('main')).getByRole('button', { name: /^Log out/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
};

test('signing in receives a code that was made here, and handles the one that never arrives', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/');
  await signOut(page);

  /* The screen says what is behind it before it asks for anything. */
  await expect(page.locator('.not-connected')).toContainText(noticeFor('accounts')!);
  await page.getByLabel('Mobile number').fill('0820000000');
  await expect(page.getByText(/The simulator is never told where to send/)).toBeVisible();

  /* Ask until both states have been seen: a message that arrived, and one that did not. A delivery
     fails about one time in eight and which asks land on which side of it is a fact about the seed,
     so a handful of asks reaches both — and if fourteen do not, the state the seam exists for has
     become unreachable, which is a defect rather than a flake. */
  const lost = page.getByText(/^Your code did not arrive\./);
  const shown = page.locator('.privacy-note').filter({ hasText: /^Your code is/ });
  let delivered: string | null = null;
  let seenAFailure = false;
  for (let ask = 0; ask < 14; ask += 1) {
    await page.getByRole('button', { name: ask === 0 ? /Send my code/ : 'Ask for a new code' }).first().click();
    if (await lost.isVisible()) {
      seenAFailure = true;
      delivered = null;
      /* The code is withheld when the message was not delivered. A person whose message never
         arrived does not have one, and a preview that showed it anyway would be demonstrating a
         channel that always works. */
      await expect(shown).toHaveCount(0);
      continue;
    }
    delivered = /(\d{6})/.exec((await shown.first().textContent()) ?? '')?.[1] ?? null;
    if (seenAFailure) break;
  }
  expect(delivered, 'fourteen simulated sends and the last of them did not arrive').not.toBeNull();
  expect(seenAFailure, 'fourteen simulated sends and not one of them failed — the state the seam exists for is unreachable').toBe(true);

  /* A code it did not produce is refused in the capability's own words. */
  const refuses = capabilityOf('accounts').simulation!.refuses;
  const wrong = delivered === '000000' ? '111111' : '000000';
  for (const [index, digit] of [...wrong].entries()) await page.getByLabel(`Verification code, digit ${index + 1} of 6`).fill(digit);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText(refuses.find(r => /did not itself produce/.test(r))!)).toBeVisible();

  /* And the one it did produce signs you in. */
  for (const [index, digit] of [...delivered!].entries()) await page.getByLabel(`Verification code, digit ${index + 1} of 6`).fill(digit);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lerato' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('paying for a visit answers with a receipt that says it is simulated, or a decline in words', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: /Vitals & chronic check/ }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Continue' }).click(); // Who → Where
  await d.getByRole('button', { name: 'Continue' }).click(); // Where → Nurse
  await d.getByRole('button', { name: 'Continue' }).click(); // Nurse → When
  await d.getByRole('button', { name: 'Continue' }).click(); // When → Payment

  /* The payment step says what is behind it, out of the contract, rather than a sentence of its
     own — which is what it carried until a simulator started answering. */
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payments')! })).toHaveCount(1);
  await d.getByRole('button', { name: 'Continue' }).click();
  await d.getByRole('checkbox').check();
  await confirmBooking(d);

  await expect(d.getByText('Your visit is booked.')).toBeVisible();
  await expect(d.getByText('What was paid')).toBeVisible();
  /* R249 is the catalogue's price for a vitals check, and the amount came from there rather than
     from the screen. The receipt begins SIM- because the provider refuses to produce one that does
     not say it is simulated: a receipt is read in a screenshot, away from the notice below it. */
  const paid = d.locator('.review-line').filter({ hasText: 'Authorised' });
  await expect(paid).toContainText('R 249');
  await expect(d.locator('.review-line').filter({ hasText: 'Receipt' })).toContainText(/SIM-PAY-\d{6}/);
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payments')! })).toHaveCount(1);
});

test('a declined payment books nothing, and says so in the register a person reads', async ({ page }) => {
  /* Walked against the provider, and the provider is asked before the button is pressed.
   *
   * This used to try six services and hope one of them was refused. The simulator is seeded on the
   * visit reference, the reference contains the visit's own date, and so which service declines
   * changes at midnight — the test passed on some days and failed on others for a reason that was
   * nowhere in the diff. It failed this morning, the second date-seeded assertion to cost an hour
   * here, and the first one cost two agents an afternoon each proving it was not theirs.
   *
   * Now it reads the reference the review step has just built, asks the same pure function the app
   * is about to call, and only presses Confirm on a visit it already knows will be refused. Nothing
   * is mocked and the journey is the real one end to end; the test simply looks first. */
  const offered: { id: string; name: RegExp }[] = [
    { id: 'wound', name: /Wound care/ }, { id: 'mother', name: /Mother & baby/ },
    { id: 'blood', name: /Blood tests/ }, { id: 'postop', name: /Post-operative check/ },
    { id: 'planning', name: /Family planning/ }, { id: 'vitals', name: /Vitals & chronic check/ },
    { id: 'injection', name: /Injection & vaccination/ }
  ];
  let refused = false;
  for (const service of offered) {
    await page.goto('/app/');
    await openCatalogue(page);
    await page.getByRole('button', { name: service.name }).first().click();
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'Continue' }).click();   // who
    await d.getByRole('button', { name: 'Continue' }).click();   // where
    await d.getByRole('button', { name: 'Continue' }).click();   // nurse, whoever is nearest
    /* The hour is part of the reference too, so it is part of the search. Seven services against
       one slot each is seven draws at one-in-five, and roughly one morning in eight none of them is
       refused — which is how this assertion has failed twice. Every offered hour of every service is
       forty-odd draws, and the arithmetic stops being interesting. */
    const hours = d.locator('.time-chip');
    const hourCount = Math.min(await hours.count(), 6);
    let picked = false;
    for (let hour = 0; hour < hourCount && !picked; hour += 1) {
      await hours.nth(hour).click();
      const look = await d.getByRole('button', { name: 'Continue' }).all();
      await look[0].click();                                      // when
      await d.getByRole('button', { name: 'Continue' }).click();  // payment
      const reference = (await d.getByText(/^MT-/).first().textContent())?.trim() ?? '';
      expect(reference, 'the review step no longer shows the visit reference the payment is seeded on').toMatch(/^MT-/);
      const answer = cardAndEft.produce({ subject: reference, detail: { service: service.id, attempt: 1 } });
      if (!isRefusal(answer) && answer.payload['outcome'] === 'declined') { picked = true; break; }
      await d.getByRole('button', { name: /Back/ }).first().click();
      await d.getByRole('button', { name: /Back/ }).first().click();
    }
    if (!picked) continue;

    await d.getByRole('checkbox').check();
    await d.getByRole('button', { name: 'Confirm & book' }).click();
    await expect(d.locator('.pay-declined')).toBeVisible();
    await expect(d.locator('.pay-declined')).toContainText(/Nothing has been taken\./);
    await expect(d.locator('.pay-declined')).toContainText(/Nothing is booked\./);
    /* Nothing was booked: the confirmation screen is not on the other side of this. */
    await expect(d.getByText('Your visit is booked.')).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Try the payment again' })).toBeVisible();
    refused = true;
    break;
  }
  expect(refused, 'not one of the seven services is declined on its first attempt today — the decline has stopped being a state this product can reach').toBe(true);
});

test('a nurse’s week is run against the bank, and the bank answers in the contract’s own states', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Earnings & payouts');
  const d = page.locator('main');
  await expect(d.locator('.not-connected').filter({ hasText: noticeFor('payouts')! })).toHaveCount(1);

  /* Every week except the one still accruing can be run, and each answer is one of the states
     earnings.json already draws rather than a word of the simulator's own. A week that came back
     failed is advised on its way again and never paid, which is the feed's own condition: the money
     is still owed and it goes out with the next run.

     Walked by position rather than by "the weeks that offer a run": running one takes its button
     away, so a locator filtered on the button would have moved on to a different week each time. */
  const weeks = d.locator('.earn-week');
  const total = await weeks.count();
  let ran = 0;
  for (let i = 0; i < total; i += 1) {
    const week = weeks.nth(i);
    /* A week that is not open is inert, so it is opened first — the same click a nurse makes to see
       what a week was made of before asking what happened to it. */
    const header = week.getByRole('button', { name: /Week to/ });
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    const button = week.getByRole('button', { name: /Run the Wednesday payment run/ });
    if (!(await button.count())) continue;
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const advice = week.locator('.earn-advice');
    await expect(advice).toBeVisible();
    const state = ((await advice.locator('.pill').first().textContent()) ?? '').trim();
    expect(['On its way', 'Paid', 'Did not go through']).toContain(state);
    /* And a returned run says why in the sentence the contract already renders on three platforms. */
    if (state === 'Did not go through') await expect(advice).toContainText('Your bank sent it back. It is still owed to you');
    ran += 1;
  }
  expect(ran, 'no week on the earnings screen offered a payment run').toBeGreaterThan(0);
});

test('changing where a nurse is paid is refused by the channel, in the channel’s own words', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Earnings & payouts');
  const account = page.locator('.earn-account');
  await account.getByRole('button', { name: 'Change account' }).click();
  await account.getByLabel('One-time code').fill('240924');
  await account.getByRole('button', { name: /Verify and start the wait/ }).click();
  /* The wait is real and the check is not. The screen used to move quietly to "pending", which
     reads as though a bank had confirmed something. */
  await expect(account.getByText('Waiting 48 hours')).toBeVisible();
  await expect(account.getByText(capabilityOf('payouts').simulation!.refuses.find(r => /Verify a real bank account/.test(r))!)).toBeVisible();
});
