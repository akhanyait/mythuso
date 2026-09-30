import { test, expect } from '@playwright/test';

/* A reverse proxy that has not been told to carry /api/ yet does not refuse it: nginx's own
   single-page-app fallback answers a GET to any unmatched path with the landing page and a 200, and
   a POST to the same path with a 405 and an HTML body. That is exactly what mythuso.co.za did while
   its /api/ block sat commented out — the identity service switched off, as CLAUDE.md requires, but
   `probe()` saw a 200 on GET /api/health and told the app a real service was answering.

   The chain that broke a fresh visit: App.tsx's effect calls `probe()`, and only when it says a
   service is live does it go on to call `currentPerson()` — which hits the same fallback, fails to
   parse the HTML as JSON, and returns null. `setLive(true); setSignedIn(person !== null)` then signs
   a person out who was never signed in anywhere. Every fresh visitor got the sign-in screen, in its
   live-branch guise, with nothing behind it that could answer a POST — "Could not reach MyThuso" on
   the one screen built to work with no backend at all.

   Neither test below talks to a real identity service. Both play the fallback's own answers back at
   the app to prove the fix holds the whole chain, not just the symptom on screen. */

const fallback = async (page: import('@playwright/test').Page) => {
 await page.route('**/api/health', route => route.fulfill({
  status: 200, contentType: 'text/html', body: '<!doctype html><title>MyThuso</title>'
 }));
 await page.route('**/api/auth/**', route => route.fulfill({
  status: 405, contentType: 'text/html', body: '<html><body>405 Not Allowed</body></html>'
 }));
};

test('a fallback 200 that is not the identity service`s health shape signs nobody out', async ({ page }) => {
 await fallback(page);
 await page.goto('/app/');
 // the false-positive used to call /api/auth/session, parse its HTML as JSON, and sign a fresh
 // visitor out on the spot — the preview must instead keep its in-memory session, exactly as it
 // does with no backend at all.
 await expect(page.locator('.patient-surface.app-shell')).toBeVisible();
 await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toHaveCount(0);
});

test('signing out under the same fallback offers the simulated flow, not a call it cannot complete', async ({ page }) => {
 await fallback(page);
 await page.goto('/app/');
 await page.getByRole('button', { name: 'Your profile', exact: true }).click();
 /* The profile dialog's, or the More hub's: the sidebar has its own Log out at its foot since 30 September. */
 await page.getByRole('dialog').or(page.getByRole('main')).getByRole('button', { name: /^Log out/ }).click();
 await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
 // the chip that only a genuinely answering service earns must not appear
 await expect(page.getByText('Identity service is answering on this machine')).toHaveCount(0);
 // and the simulated flow — the one built to need no backend — must be what is actually offered
 await expect(page.getByText(/identity service is not switched on/)).toBeVisible();
 await page.getByLabel('Mobile number').fill('0824445555');
 await page.getByRole('button', { name: 'Send my code' }).click();
 await expect(page.getByText(/Your code is/)).toBeVisible();
});
