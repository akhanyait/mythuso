import { test, expect, type Page } from '@playwright/test';
import { goSection, openAdminConsole, openWorkspace } from './nav';
import { audit, zoomedTo200 } from './audit';
/* Large text, small screens, and the controls a finger has to hit — measured rather than asserted.
 *
 * Every other spec in this directory checks that a screen says the right thing. This one checks
 * that it can still be read and operated when the reader is not the person who designed it: at a
 * 320px viewport, which is narrower than any phone still sold and is also what a 390px phone does
 * at 125% text; and with the layout viewport halved, which is what 200% browser zoom does to a
 * page. Both run on both project viewports, so a desktop regression and a phone regression are two
 * different failures rather than one.
 *
 * Three measurements, and the reason each is a measurement rather than a screenshot:
 *
 * Horizontal overflow. A page that scrolls sideways at 200% zoom has not merely been squeezed —
 * half of every sentence is off the screen and there is nothing on the screen to say so. The
 * repository already checks this on a handful of journeys; this extends it to the shell, the
 * emergency pathway, the nurse workspace and the language screens, on both widths.
 *
 * Target size. The floor, the absolute floor and the list of controls allowed between the two are
 * read from `targets` in packages/design-tokens/tokens.json rather than written here. That is the
 * point of doing it this way: an exemption is a line in the contract, with a sentence saying why,
 * and the test refuses one that has not cleared the 24x24 WCAG 2.2 SC 2.5.8 requires at AA. A test
 * carrying its own exemption list is a test that gets edited on a Friday.
 *
 * Text size. The floor is typography.minimumRendered from the same file. It is 11px — the caption
 * size — rather than the 13px the same file calls minimumBody, and the token file says out loud
 * that this is a gap rather than a decision. What this catches is drift below the scale entirely:
 * a 9px unread count, a 10px tab-bar label, a 10.5px chart axis, each of which was a number nudged
 * to make a row fit rather than a size anybody chose.
 */


/* The patient screens the home's restructure did not reach. Health Passport was already
   audited below; the other four were not, and Privacy & settings was where that showed — its three
   sharing switches were 50x30, the only controls left in the app under the floor the token file
   sets, on the screen where a person turns data sharing on and off. An audit that visits four of
   five screens is an audit of four screens. */
/* Live well joined them the day it landed, rather than a release later. It is the screen with the
   most text on it per square inch and the one whose controls are newest, which is exactly the
   combination the 320px and 200% sweeps exist for. */
const patientSurfaces = ['Health Passport', 'Live well', 'My family', 'Care plans', 'Thuso Wallet', 'Privacy & settings'] as const;
const openPatientSurface = async (page: Page, name: string) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) {
    const entry = sidebar.getByRole('button', { name, exact: true });
    if (await entry.count()) { await entry.click(); return; }
    await page.locator('button.settings-link').filter({ hasText: name }).first().click();
    return;
  }
  if (name === 'Health Passport') { await page.locator('.tabbar button').nth(3).click(); return; }
  await page.locator('.tabbar button').nth(4).click();
  const row = page.locator('.menu-row').filter({ hasText: name });
  /* My Health, Wellness and Devices fold into Explore MyThuso since 5 October 2026 — those
     rows live on the Explore page, not on the More hub. */
  if (await row.count()) { await row.first().click(); return; }
  const explore = page.locator('.menu-row').filter({ hasText: 'Explore MyThuso' });
  if (await explore.count()) {
    await explore.first().click();
    await page.locator('.menu-row').filter({ hasText: name }).first().click();
    return;
  }
  throw new Error(`No More-hub or Explore row for ${name}`);
};

/* The sidebar on a desktop, the More tab on a phone. Both reach the same page. */
const openLanguageAndAccess = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (!(await sidebar.isVisible())) await page.locator('.tabbar button').nth(4).click();
  await page.getByRole('button', { name: /^Language & access/ }).click();
  /* AccessPage is lazy — wait for OfficeHead, not the Suspense fallback. */
  await expect(page.getByRole('heading', { name: /Twelve official languages/ })).toBeVisible({ timeout: 15_000 });
};

/* The way in, on both sides of the door. The patient sign-in, the one-time code, sign-up and
   recovery are the four screens somebody meets before the shell exists, and until this they were
   audited on neither viewport — the only sign-in this file measured was the clinical one. They live
   outside `main`, so the overflow sweep sees them through the document's own scroll width rather
   than through a widest-child, which is the number that matters at 320 and at 200% anyway. */
const openTheDoor = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  else await page.locator('.tabbar button').nth(4).click();
  /* The profile dialog's, or the More hub's: the sidebar has its own Log out at its foot since 30 September. */
  await page.getByRole('dialog').or(page.getByRole('main')).getByRole('button', { name: /^Log out/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to MyThuso' })).toBeVisible();
};

const auditTheDoor = async (page: Page, where: string) => {
  await openTheDoor(page);
  await audit(page, `Sign in ${where}`);
  await page.locator('.phone-field input').fill('0820000000');
  await page.getByRole('button', { name: /Send my code/ }).click();
  await expect(page.getByRole('button', { name: 'Ask for a new code' }).first()).toBeVisible();
  await audit(page, `The one-time code ${where}`);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Care that comes to you.' })).toBeVisible();
  await audit(page, `Sign-up ${where}`);
  await page.getByRole('button', { name: 'I’ve lost access to my account' }).click();
  await expect(page.getByRole('heading', { name: 'How can we reach you?' })).toBeVisible();
  await audit(page, `Account recovery ${where}`);
};

test.describe('at a 320px viewport', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('the shell, the language screen and the booking catalogue hold together', async ({ page }) => {
    await page.goto('/app/');
    await audit(page, 'Patient overview at 320px');
    await openLanguageAndAccess(page);
    await audit(page, 'Language & access at 320px');
    await page.locator('.tabbar button').nth(1).click();
    await audit(page, 'Book a nurse at 320px');
    await page.locator('.tabbar button').nth(3).click();
    await audit(page, 'Health Passport at 320px');
  });

  test('the way in holds together', async ({ page }) => {
    await page.goto('/app/');
    await auditTheDoor(page, 'at 320px');
  });

  /* One load, then the shell's own navigation — five reloads of a single-page app to reach five of
     its own pages is five seconds of nothing, and a slow test starves the ones beside it. */
  test('my family, care plans, the wallet and privacy hold together too', async ({ page }) => {
    await page.goto('/app/');
    for (const surface of patientSurfaces) {
      await openPatientSurface(page, surface);
      await audit(page, `${surface} at 320px`);
    }
  });

  test('the passport reads in all seven of its sections', async ({ page }) => {
    await page.goto('/app/');
    await page.locator('.tabbar button').nth(3).click();
    await audit(page, 'Health Passport · Overview at 320px');
    for (const section of ['Vitals', 'Results', 'Medications', 'History', 'Goals', 'Records']) {
      await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: section, exact: true }).click();
      await audit(page, `Health Passport · ${section} at 320px`);
    }
  });

  /* The screens added to close docs/FLOW-COMPLETENESS.md's open rows. Each one is a table, a list
     of long sentences or both — the two shapes that break a 320px column — and the timeline is a
     four-column table of readings, which is the widest thing on the patient side. */
  test('the screens that closed the audit hold together too', async ({ page }) => {
    await page.goto('/app/');
    await page.locator('.tabbar button').nth(4).click();
    await page.locator('.menu-row').filter({ hasText: 'Help & support' }).first().click();
    await audit(page, 'Help & support at 320px');

    await page.locator('.tabbar button').nth(3).click();
    await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'History' }).click();
    /* History stays on the Preview empty state (nothing stored yet); Share links live under Records. */
    await expect(page.getByText(/nothing stored yet/i).first()).toBeVisible();
    await audit(page, 'Care timeline, empty Preview, at 320px');

    await page.locator('.tabbar button').nth(3).click();
    await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Records' }).click();
    await page.locator('.shortcut-row').filter({ hasText: 'Doctors' }).click();
    await audit(page, 'Your care team at 320px');

    /* Medications stays on Preview empty; the prescription journey is under Explore → My Health. */
    await openPatientSurface(page, 'What happens to a prescription');
    await audit(page, 'What happens to a prescription at 320px');
  });

  test('the language dialog says which languages nobody has read, and stays inside the screen', async ({ page }) => {
    await page.goto('/app/');
    await page.locator('.tabbar button').nth(4).click();
    await page.getByRole('button', { name: /^Language Read MyThuso/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Machine-drafted/).first()).toBeVisible();
    await dialog.getByRole('radio', { name: /isiXhosa/ }).check();
    await expect(dialog.getByText(/not yet checked by a person who speaks it/)).toBeVisible();
    /* isiXhosa carries the shell and not the banner, and the dialog says so before the choice
       rather than leaving an English headline to be discovered on the home screen. */
    await expect(dialog.locator('p.helper').first()).toContainText('The hero banner and Workspace entries stay in English');
    /* South African Sign Language is offered, and not as one of the radio buttons above. */
    await expect(dialog.getByRole('radio', { name: /Sign Language/ })).toHaveCount(0);
    await expect(dialog.getByRole('checkbox', { name: /South African Sign Language/ })).toBeVisible();
    await audit(page, 'The language dialog at 320px');
  });

  test('the shell is in the chosen language and the clinical wording is not', async ({ page }) => {
    await page.goto('/app/');
    await page.locator('.tabbar button').nth(4).click();
    await page.getByRole('button', { name: /^Language Read MyThuso/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Xitsonga/ }).check();
    await dialog.getByRole('button', { name: /Done/ }).click();
    /* The tab bar is Xitsonga. */
    await expect(page.locator('.tabbar button').first()).toContainText('Kaya');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ts-ZA');
    /* The nurse assessment's reference ranges are not, and the language screen says why. */
    await page.locator('.tabbar button').nth(4).click();
    await page.getByRole('button', { name: /^Language & access/ }).click();
    await expect(page.getByRole('heading', { name: 'Clinical wording stays in English' })).toBeVisible();
    await audit(page, 'Xitsonga shell at 320px');
  });
});

test.describe('at 200% zoom', () => {
  test('the patient shell and the language screen reflow rather than scroll sideways', async ({ page }) => {
    await page.goto('/app/');
    await zoomedTo200(page);
    await audit(page, 'Patient overview at 200%');
    await openLanguageAndAccess(page);
    await audit(page, 'Language & access at 200%');
  });

  test('the way in holds together', async ({ page }) => {
    await page.goto('/app/');
    await zoomedTo200(page);
    await auditTheDoor(page, 'at 200%');
  });

  test('the emergency pathway keeps the ambulance number readable and reachable', async ({ page }) => {
    await page.goto('/app/');
    await zoomedTo200(page);
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click();
    else { await page.locator('.tabbar button').nth(4).click(); await page.getByRole('button', { name: /^Explore MyThuso/ }).click(); }
    await page.getByRole('button', { name: /Thuso SOS/ }).click();
    await expect(page.getByRole('dialog').locator('.sos-emergency')).toContainText('10177');
    await audit(page, 'Thuso SOS at 200%');
  });

  test('the six patient screens reflow rather than scroll sideways', async ({ page }) => {
    await page.goto('/app/');
    await zoomedTo200(page);
    for (const surface of patientSurfaces) {
      await openPatientSurface(page, surface);
      await audit(page, `${surface} at 200%`);
    }
  });

  /* The screen this whole exercise started from: a nurse's schedule at 07:00, on a phone, at
     twice the text size. It is a separate application at a separate entry now, so the audit opens
     it rather than switching the patient shell into it. */
  test('the nurse workspace holds together', async ({ page }) => {
    await zoomedTo200(page);
    await openWorkspace(page, 'Nurse');
    await audit(page, 'Nurse workspace at 200%');
    /* The schedule was the only nurse screen this audited, which made it an audit of one fifth of
       her application. The two that carry the most furniture per pixel — the queue of work held on
       the phone, and the shift forecast's day strip and nine hour chips — are the two most likely
       to overflow or to shrink a target, so they are opened and measured rather than assumed. */
    await goSection(page, 'Assessments');
    await page.locator('.vq-strip').click();
    await audit(page, 'Visit capture, queue open, at 200%');
    await goSection(page, 'Earnings & payouts');
    for (const hour of ['08:00', '09:00']) await page.locator('.fc').getByRole('button', { name: hour, exact: true }).click();
    await audit(page, 'Earnings and the shift forecast at 200%');
  });
  test('the demo login and the back office hold together', async ({ page }) => {
    await zoomedTo200(page);
    /* The clinical sign-in screen this used to audit is gone: one demo login replaced all four
       doors. What has to survive 200% now is the bar it became, which is harder — it shares a band
       with the sentence saying none of this is real, and at 200% that band is most of the width. */
    await page.goto('/app/');
    await audit(page, 'The demo login at 200%');
    await openAdminConsole(page);
    await audit(page, 'Operations console at 200%');
  });
});

/* Neither viewport is allowed to be the only one that works. This runs at the project viewport as
   configured — 1440x1100 and 390x844 — and is the control for the two groups above. */
test('the shell holds together at the configured viewport', async ({ page }) => {
  await page.goto('/app/');
  await audit(page, 'Patient overview');
  await openLanguageAndAccess(page);
  await audit(page, 'Language & access');
});
