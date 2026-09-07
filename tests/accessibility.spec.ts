import { test, expect, type Page } from '@playwright/test';
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
    return rect.width < (min as number) || rect.height < (min as number);
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

/* The sidebar on a desktop, the More tab on a phone. Both reach the same page. */
const openLanguageAndAccess = async (page: Page) => {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (!(await sidebar.isVisible())) await page.locator('.tabbar button').nth(4).click();
  await page.getByRole('button', { name: /^Language & access/ }).click();
  // by name, not "the h1": the shell renders a decorative empty h1 on some routes, and asserting
  // about whichever heading is first made this fail intermittently with an empty string
  await expect(page.getByRole('heading', { name: /Twelve official languages/ })).toBeVisible();
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

  test('the nurse workspace holds together', async ({ page }) => {
    await page.goto('/');
    await zoomedTo200(page);
    const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
    if (await sidebar.isVisible()) await page.locator('.account-switch').click();
    else { await page.locator('.tabbar button').nth(4).click(); await page.getByRole('button', { name: /^Preview workspaces/ }).click(); }
    await page.getByRole('dialog').getByRole('button', { name: /^Nurse/ }).click();
    await audit(page, 'Nurse workspace at 200%');
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
