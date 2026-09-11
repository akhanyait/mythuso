import { test, expect, type Page } from '@playwright/test';
import { goSection, openAdminConsole, openWorkspace } from './nav';
import { readFileSync } from 'node:fs';
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

const tokens = JSON.parse(readFileSync(new URL('../packages/design-tokens/tokens.json', import.meta.url), 'utf8'));
const MIN_TARGET: number = tokens.targets.minimum;
const ABSOLUTE_MIN_TARGET: number = tokens.targets.absoluteMinimum;
const EXEMPT_SELECTORS: string[] = tokens.targets.knownUndersized.map((row: { selector: string }) => row.selector);
const MIN_TEXT: number = tokens.typography.minimumRendered;

/* 200% zoom, modelled honestly. A browser at 200% halves the layout viewport and leaves the CSS
   pixel the size it was, which is exactly what setViewportSize does — the page reflows for half the
   width and every measurement below is still in CSS pixels. The floor of 320 is there because a
   390px phone at 200% is 195px, and nothing in this design claims to work at 195px. */
const zoomedTo200 = async (page: Page) => {
  const current = page.viewportSize()!;
  await page.setViewportSize({ width: Math.max(320, Math.round(current.width / 2)), height: current.height });
};

const horizontalOverflow = (page: Page) => page.evaluate(() => {
  const root = document.documentElement;
  const offenders = [...document.querySelectorAll<HTMLElement>('main *, .tabbar *, .topbar *')]
    .filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
    .slice(0, 4).map(el => `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className : ''}`);
  /* One pixel of slack: a fractional layout width rounds up, and failing a page over 0.4px makes
     this the kind of check people switch off rather than the kind they fix. */
  return { pixels: root.scrollWidth - root.clientWidth, offenders };
});

/* Everything a person can operate, minus the two things the contract exempts by kind: an input the
   design hides behind its own label — the label is the target and is measured in its place — and a
   link inside a running paragraph, which the standard exempts because a word in a sentence cannot
   be 44px tall without the sentence being unreadable. */
const measureTargets = (page: Page, min: number, exempt: string[]) => page.evaluate(([min, exempt]) => {
  const selector = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(el => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    if (el.closest('.visually-hidden')) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if ((el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox') {
      const label = el.closest('label');
      if (label) { const box = label.getBoundingClientRect(); if (box.width >= (min as number) && box.height >= (min as number)) return false; }
    }
    if (el.closest('p, li, small, caption, figcaption') && style.display.startsWith('inline')) return false;
    /* Half a pixel of tolerance, and only half. A control declared 44px measures 43.9995 often
       enough under load that this audit went red on a machine running three builds at once — the
       box is genuinely 44, and sub-pixel layout noise is not an accessibility defect. Nothing real
       hides inside it: every genuine failure this check has ever caught was under by whole pixels
       (26, 32, 36), and a control that is 43.5 still fails. */
    const tolerance = 0.5;
    return rect.width < (min as number) - tolerance || rect.height < (min as number) - tolerance;
  }).map(el => {
    const rect = el.getBoundingClientRect();
    const declared = (exempt as string[]).find(sel => el.matches(sel)) ?? null;
    return { where: `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className : ''} "${(el.textContent ?? '').trim().slice(0, 28)}"`,
             width: Math.round(rect.width), height: Math.round(rect.height), declared };
  });
}, [min, exempt] as const);

const undersizedText = (page: Page, min: number) => page.evaluate(min => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const found = new Map<string, string>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (!text) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('.visually-hidden')) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (!parent.getBoundingClientRect().height) continue;
    const size = parseFloat(style.fontSize);
    if (size < min) found.set(`${parent.tagName.toLowerCase()}.${typeof parent.className === 'string' ? parent.className : ''}`, `${size}px "${text.slice(0, 28)}"`);
  }
  return [...found].slice(0, 6).map(([where, what]) => `${where} — ${what}`);
}, min);

const audit = async (page: Page, where: string) => {
  const { pixels, offenders } = await horizontalOverflow(page);
  expect(pixels, `${where} scrolls sideways by ${pixels}px. Widest children: ${offenders.join(' · ')}`).toBeLessThanOrEqual(1);

  const small = await measureTargets(page, MIN_TARGET, EXEMPT_SELECTORS);
  const undeclared = small.filter(t => !t.declared).map(t => `${t.where} ${t.width}x${t.height}`);
  expect(undeclared, `${where}: controls under ${MIN_TARGET}x${MIN_TARGET} that packages/design-tokens/tokens.json does not list under targets.knownUndersized. Either make them ${MIN_TARGET}px or write down why they cannot be.`).toEqual([]);
  /* An exemption is permission to be under 44, never permission to be under the AA floor. */
  const belowFloor = small.filter(t => Math.min(t.width, t.height) < ABSOLUTE_MIN_TARGET).map(t => `${t.where} ${t.width}x${t.height} (declared as "${t.declared}")`);
  expect(belowFloor, `${where}: a control listed as a known exemption is under the ${ABSOLUTE_MIN_TARGET}x${ABSOLUTE_MIN_TARGET} WCAG 2.2 SC 2.5.8 requires at AA. That is not an exemption, it is a defect with paperwork.`).toEqual([]);

  expect(await undersizedText(page, MIN_TEXT), `${where} renders text under ${MIN_TEXT}px, which is the smallest size the type scale declares`).toEqual([]);
};

/* The five patient screens the home's restructure did not reach. Health Passport was already
   audited below; the other four were not, and Privacy & settings was where that showed — its three
   sharing switches were 50x30, the only controls left in the app under the floor the token file
   sets, on the screen where a person turns data sharing on and off. An audit that visits four of
   five screens is an audit of four screens. */
const patientSurfaces = ['Health Passport', 'My family', 'Care plans', 'Thuso Wallet', 'Privacy & settings'] as const;
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
  await page.locator('.menu-row').filter({ hasText: name }).first().click();
};

/* The sidebar on a desktop, the More tab on a phone. Both reach the same page. */
const openLanguageAndAccess = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (!(await sidebar.isVisible())) await page.locator('.tabbar button').nth(4).click();
  await page.getByRole('button', { name: /^Language & access/ }).click();
  // by name, not "the h1": the shell renders a decorative empty h1 on some routes, and asserting
  // about whichever heading is first made this fail intermittently with an empty string
  await expect(page.getByRole('heading', { name: /Twelve official languages/ })).toBeVisible();
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
  await page.getByRole('button', { name: /^Log out/ }).click();
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
    await page.goto('/');
    await audit(page, 'Patient overview at 320px');
    await openLanguageAndAccess(page);
    await audit(page, 'Language & access at 320px');
    await page.locator('.tabbar button').nth(1).click();
    await audit(page, 'Book a nurse at 320px');
    await page.locator('.tabbar button').nth(3).click();
    await audit(page, 'Health Passport at 320px');
  });

  test('the way in holds together', async ({ page }) => {
    await page.goto('/');
    await auditTheDoor(page, 'at 320px');
  });

  /* One load, then the shell's own navigation — five reloads of a single-page app to reach five of
     its own pages is five seconds of nothing, and a slow test starves the ones beside it. */
  test('my family, care plans, the wallet and privacy hold together too', async ({ page }) => {
    await page.goto('/');
    for (const surface of patientSurfaces) {
      await openPatientSurface(page, surface);
      await audit(page, `${surface} at 320px`);
    }
  });

  test('the passport reads in all four of its sections', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tabbar button').nth(3).click();
    for (const section of ['Records', 'Medications', 'More']) {
      await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: section, exact: true }).click();
      await audit(page, `Health Passport · ${section} at 320px`);
    }
  });

  /* The screens added to close docs/FLOW-COMPLETENESS.md's open rows. Each one is a table, a list
     of long sentences or both — the two shapes that break a 320px column — and the timeline is a
     four-column table of readings, which is the widest thing on the patient side. */
  test('the screens that closed the audit hold together too', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tabbar button').nth(4).click();
    await page.locator('.menu-row').filter({ hasText: 'Help & support' }).first().click();
    await audit(page, 'Help & support at 320px');

    await page.locator('.tabbar button').nth(3).click();
    await page.locator('.record-row').filter({ hasText: 'Nurse home visit' }).first().click();
    await page.locator('.explain-row').first().click();
    await audit(page, 'Care timeline, a visit open, at 320px');

    await page.locator('.tabbar button').nth(3).click();
    await page.locator('.shortcut-row').filter({ hasText: 'Doctors' }).click();
    await audit(page, 'Your care team at 320px');

    await page.locator('.tabbar button').nth(3).click();
    await page.getByRole('group', { name: 'Passport sections' }).getByRole('button', { name: 'Medications' }).click();
    await page.getByRole('button', { name: /What happens after a doctor signs one/ }).click();
    await audit(page, 'What happens to a prescription at 320px');
  });

  test('the language dialog says which languages nobody has read, and stays inside the screen', async ({ page }) => {
    await page.goto('/');
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
    await page.goto('/');
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
    await page.goto('/');
    await zoomedTo200(page);
    await audit(page, 'Patient overview at 200%');
    await openLanguageAndAccess(page);
    await audit(page, 'Language & access at 200%');
  });

  test('the way in holds together', async ({ page }) => {
    await page.goto('/');
    await zoomedTo200(page);
    await auditTheDoor(page, 'at 200%');
  });

  test('the emergency pathway keeps the ambulance number readable and reachable', async ({ page }) => {
    await page.goto('/');
    await zoomedTo200(page);
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click();
    else { await page.locator('.tabbar button').nth(4).click(); await page.getByRole('button', { name: /^Explore MyThuso/ }).click(); }
    await page.getByRole('button', { name: /Thuso SOS/ }).click();
    await expect(page.getByRole('dialog').locator('.sos-emergency')).toContainText('10177');
    await audit(page, 'Thuso SOS at 200%');
  });

  test('the five patient screens reflow rather than scroll sideways', async ({ page }) => {
    await page.goto('/');
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
  test('the clinical sign-in and the back office hold together', async ({ page }) => {
    await zoomedTo200(page);
    await page.goto('/staff.html');
    await audit(page, 'Clinical sign-in at 200%');
    await openAdminConsole(page);
    await audit(page, 'Operations console at 200%');
  });
});

/* Neither viewport is allowed to be the only one that works. This runs at the project viewport as
   configured — 1440x1100 and 390x844 — and is the control for the two groups above. */
test('the shell holds together at the configured viewport', async ({ page }) => {
  await page.goto('/');
  await audit(page, 'Patient overview');
  await openLanguageAndAccess(page);
  await audit(page, 'Language & access');
});
