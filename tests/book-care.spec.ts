import { expect, test, type Page } from '@playwright/test';

/* The Wednesday demo's Book care: six questions, one screen each, reached from the home and from
   the address. The existing booking dialog is a different door and is not walked here. */

const openFromHome = async (page: Page) => {
 await page.goto('/app/');
 await page.getByRole('region', { name: 'Care you can book today' }).getByRole('button', { name: 'Book care', exact: true }).click();
};

test('six steps, one question each, then a simulated confirmation', async ({ page }) => {
 await openFromHome(page);
 const main = page.locator('#main');

 await expect(main.getByRole('heading', { name: 'Who is this care for?' })).toBeVisible();
 await expect(main.getByText('Step 1 of 6').first()).toBeVisible();
 const next = main.getByRole('button', { name: 'Next' });
 await expect(next).toBeDisabled();
 await main.getByRole('radio', { name: 'Myself', exact: true }).check();
 await expect(next).toBeEnabled();
 await next.click();

 await expect(main.getByRole('heading', { name: 'What do you need?' })).toBeVisible();
 await expect(main.getByText('A nurse comes to you')).toBeVisible();
 await expect(main.getByText('Talk with a professional online')).toBeVisible();
 await expect(main.getByText('Schedule a check-in')).toBeVisible();
 const homeVisit = main.getByRole('radio', { name: /Home visit/ });
 await homeVisit.check();
 await expect(homeVisit).toHaveAttribute('aria-checked', 'true');
 await expect(main.locator('.bc-card', { hasText: 'Home visit' }).locator('.bc-check')).toBeVisible();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'When suits you?' })).toBeVisible();
 await main.getByRole('button', { name: 'Back', exact: true }).click();
 await expect(main.getByRole('heading', { name: 'What do you need?' })).toBeVisible();
 await expect(homeVisit).toBeChecked();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'When suits you?' })).toBeVisible();
 await main.getByRole('radio').first().check();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'Where should care happen?' })).toBeVisible();
 await main.getByRole('radio', { name: /At home/ }).check();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'Anything your nurse should know?' })).toBeVisible();
 await expect(main.getByRole('button', { name: 'Next' })).toBeEnabled();
 await main.getByRole('button', { name: 'Next' }).click();

 await expect(main.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
 const summary = main.locator('.bc-summary');
 await expect(summary).toContainText('Myself');
 await expect(summary).toContainText('Home visit');
 await expect(summary).toContainText('At home');
 await expect(summary).toContainText('Melville');
 await expect(summary).toContainText(/\d{2}:\d{2}/);
 await expect(main.getByText('This is a simulated booking. Nothing is booked and no payment is taken.')).toBeVisible();
 await main.getByRole('button', { name: 'Confirm booking' }).click();
 await expect(main.getByRole('heading', { name: 'Visit confirmed (simulated)' })).toBeVisible();
 await expect(page.getByText('POPIA compliant')).toHaveCount(0);
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
