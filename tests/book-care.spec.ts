import { expect, test, type Locator, type Page } from '@playwright/test';

/* The Wednesday demo's Book care: six questions, one screen each, reached from the home and from
   the address. The existing booking dialog is a different door and is not walked here. */

const launcher = (page: Page) => page.getByRole('button', { name: 'Ask GilbertOne', exact: true });

/* The orb used to cover the right of Next on a phone. Standing it down is what makes the
   button the thing a tap hits, at the centre and near the right edge, on every step. */
async function nextIsUncovered(page: Page, button: Locator, isMobile: boolean) {
 await expect(launcher(page)).toBeHidden();
 if (!isMobile) return;
 await button.scrollIntoViewIfNeeded();
 const owns = await button.evaluate(el => {
  const rect = el.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const probe = (x: number) => {
   const hit = document.elementFromPoint(x, y);
   return hit instanceof Element && (hit === el || el.contains(hit));
  };
  return [probe(rect.left + rect.width / 2), probe(rect.right - 8)];
 });
 expect(owns).toEqual([true, true]);
}

const openFromHome = async (page: Page) => {
 await page.goto('/app/');
 await page.getByRole('region', { name: 'Care you can book today' }).getByRole('button', { name: 'Book care', exact: true }).click();
};

test('six steps, one question each, then a simulated confirmation', async ({ page, isMobile }) => {
 await openFromHome(page);
 const main = page.locator('#main');

 await expect(main.getByRole('heading', { name: 'Who is this care for?' })).toBeVisible();
 await expect(main.getByText('Step 1 of 6').first()).toBeVisible();
 const next = main.getByRole('button', { name: 'Next' });
 await expect(next).toBeDisabled();
 await nextIsUncovered(page, next, isMobile);
 await main.getByRole('radio', { name: 'Myself', exact: true }).check();
 await expect(next).toBeEnabled();
 await next.click();

 await expect(main.getByRole('heading', { name: 'What do you need?' })).toBeVisible();
 await expect(main.getByText('A nurse comes to you')).toBeVisible();
 await expect(main.getByText('Talk with a professional online')).toBeVisible();
 await expect(main.getByText('Schedule a check-in')).toBeVisible();
 await nextIsUncovered(page, next, isMobile);
 const homeVisit = main.getByRole('radio', { name: /Home visit/ });
 await homeVisit.check();
 await expect(homeVisit).toHaveAttribute('aria-checked', 'true');
 await expect(main.locator('.bc-card', { hasText: 'Home visit' }).locator('.bc-check')).toBeVisible();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'When suits you?' })).toBeVisible();
 await nextIsUncovered(page, next, isMobile);
 await main.getByRole('button', { name: 'Back', exact: true }).click();
 await expect(main.getByRole('heading', { name: 'What do you need?' })).toBeVisible();
 await expect(homeVisit).toBeChecked();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'When suits you?' })).toBeVisible();
 await main.getByRole('radio').first().check();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'Where should care happen?' })).toBeVisible();
 await nextIsUncovered(page, next, isMobile);
 await main.getByRole('radio', { name: /At home/ }).check();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'Anything your nurse should know?' })).toBeVisible();
 await expect(main.getByRole('button', { name: 'Next' })).toBeEnabled();
 await nextIsUncovered(page, next, isMobile);
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
 const summary = main.locator('.bc-summary');
 await expect(summary).toContainText('Myself');
 await expect(summary).toContainText('Home visit');
 await expect(summary).toContainText('At home');
 await expect(summary).toContainText('Melville');
 await expect(summary).toContainText(/\d{2}:\d{2}/);
 await expect(main.getByText('This is a simulated booking. Nothing is booked and no payment is taken.')).toBeVisible();
 const confirm = main.getByRole('button', { name: 'Confirm booking' });
 await nextIsUncovered(page, confirm, isMobile);
 await confirm.click();
 await expect(main.getByRole('heading', { name: 'Visit confirmed (simulated)' })).toBeVisible();
 await expect(launcher(page)).toBeHidden();
 await expect(page.getByText('POPIA compliant')).toHaveCount(0);
 await main.locator('.bc-done').getByRole('button', { name: 'Back to home' }).click();
 await expect(page.getByRole('region', { name: 'Care you can book today' })).toBeVisible();
 await expect(launcher(page)).toBeVisible();
});

test('the direct address opens Book care on the first question', async ({ page }) => {
 await page.goto('/app/?open=book-care');
 await expect(page).toHaveTitle('Book care · MyThuso');
 await expect(page.getByRole('heading', { name: 'Who is this care for?' })).toBeVisible();
 await expect(page.getByText('Step 1 of 6').first()).toBeVisible();
});

test('changing what drops a where answer that no longer fits', async ({ page }) => {
 await page.goto('/app/?open=book-care');
 const main = page.locator('#main');
 await main.getByRole('radio', { name: 'Myself', exact: true }).check();
 await main.getByRole('button', { name: 'Next' }).click();
 await main.getByRole('radio', { name: /Home visit/ }).check();
 await main.getByRole('button', { name: 'Next' }).click();
 await main.getByRole('radio').first().check();
 await main.getByRole('button', { name: 'Next' }).click();
 await main.getByRole('radio', { name: /At home/ }).check();
 await main.getByRole('button', { name: 'Back', exact: true }).click();
 await main.getByRole('button', { name: 'Back', exact: true }).click();
 await main.getByRole('radio', { name: /Online consult/ }).check();
 await main.getByRole('button', { name: 'Next' }).click();
 await main.getByRole('button', { name: 'Next' }).click();
 await expect(main.getByRole('heading', { name: 'Where should care happen?' })).toBeVisible();
 await expect(main.getByRole('radio', { name: /^Online/ })).toBeChecked();
 await expect(main.getByRole('radio', { name: /At home/ })).toHaveCount(0);
});
