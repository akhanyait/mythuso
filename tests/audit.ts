import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The measurements tests/accessibility.spec.ts takes of a screen — sideways overflow, target size and
   text size, against the floors packages/design-tokens/tokens.json declares — in a module of their own,
   so the merged Control Tower's journeys (tests/control-tower-portal.spec.ts) audit each new screen the
   same way rather than keeping a second copy of the method. Moved here unchanged in Phase 3; the reasons
   for each measurement are written above the spec that uses them first. */

export const tokens = JSON.parse(readFileSync(new URL('../packages/design-tokens/tokens.json', import.meta.url), 'utf8'));
export const MIN_TARGET: number = tokens.targets.minimum;
export const ABSOLUTE_MIN_TARGET: number = tokens.targets.absoluteMinimum;
export const EXEMPT_SELECTORS: string[] = tokens.targets.knownUndersized.map((row: { selector: string }) => row.selector);
export const MIN_TEXT: number = tokens.typography.minimumRendered;

/* 200% zoom, modelled honestly. A browser at 200% halves the layout viewport and leaves the CSS
   pixel the size it was, which is exactly what setViewportSize does — the page reflows for half the
   width and every measurement below is still in CSS pixels. The floor of 320 is there because a
   390px phone at 200% is 195px, and nothing in this design claims to work at 195px. */
export const zoomedTo200 = async (page: Page) => {
  const current = page.viewportSize()!;
  await page.setViewportSize({ width: Math.max(320, Math.round(current.width / 2)), height: current.height });
};

export const horizontalOverflow = (page: Page) => page.evaluate(() => {
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
export const measureTargets = (page: Page, min: number, exempt: string[]) => page.evaluate(([min, exempt]) => {
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

export const undersizedText = (page: Page, min: number) => page.evaluate(min => {
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

export const audit = async (page: Page, where: string) => {
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

/* The sweep the merged Control Tower's journeys take of each new screen: every control on it has an
   accessible name, nothing has a positive tabindex, and nothing is animating while reduced motion is
   asked for. Moved here from tests/control-tower-portal.spec.ts in Phase 4 so the GilbertOne
   administration journeys (tests/gilbertone-admin.spec.ts) sweep their seven screens the same way
   rather than keeping a second copy, and widened by two kinds — a textarea and a disclosure's summary —
   because the voice preview and the provider cards are the first portal screens to draw either. */
export const controlSweep = (page: Page) => page.evaluate(() => {
 const nameless = [...document.querySelectorAll<HTMLElement>('#pt-category button, #pt-category a[href], #pt-category input, #pt-category select, #pt-category textarea, #pt-category summary, [role="tab"], [role="treeitem"], .pt-context select')]
  .filter(el => el.getClientRects().length)
  .filter(el => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent?.trim()
   || el.closest('label')?.textContent?.trim() || [...((el as HTMLInputElement).labels ?? [])].some(l => l.textContent?.trim())))
  .map(el => el.outerHTML.slice(0, 80));
 const positive = [...document.querySelectorAll('[tabindex]')].filter(el => Number(el.getAttribute('tabindex')) > 0).length;
 const running = document.getAnimations().filter(a => a.playState === 'running').length;
 return { nameless, positive, running };
});

/* Every word on the screen against the ground actually painted behind it, as the browser composites it:
   each ancestor's background colour laid over the one beneath, from the page down, so a translucent wash
   is measured over what it washes. Any colour the browser can compute — a color-mix, a colour space — is
   read back as sRGB through a canvas. The floor is WCAG 2.2 AA: 4.5, or 3 for large text. Skipped are
   the words nobody sees (hidden, aria-hidden, zero-sized) and a disabled control, which AA exempts.
   Background images are not composited; a word on a photograph is measured on the colour under it.
   `notices` counts the measured words inside the contract's not-connected notices, so a journey can
   say those were among them rather than assume it. First written for tests/dark-theme.spec.ts, where
   the older sheets' inks had been measured on white only. */
export const lowContrast = (page: Page) => page.evaluate(() => {
 const canvas = document.createElement('canvas');
 canvas.width = canvas.height = 1;
 const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
 const rgba = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r / 255, g / 255, b / 255, a / 255]; };
 const over = (top: number[], under: number[]) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
 const lum = (c: number[]) => c.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
 const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
 /* The patient's ground is a fixed pane of its own behind the shell rather than an ancestor of the words. */
 const pane = document.querySelector('.patient-ground');
 const base = over(rgba(getComputedStyle(pane ?? document.documentElement).backgroundColor), over(rgba(getComputedStyle(document.body).backgroundColor), [1, 1, 1]));
 const failures: string[] = [];
 let measured = 0, notices = 0;
 const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
 for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  const el = node.parentElement;
  if (!el || !node.textContent!.trim() || el.closest('[hidden], [aria-hidden="true"], .visually-hidden, .sr-only, :disabled, [aria-disabled="true"]')) continue;
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  if (!box.width || !box.height || style.visibility === 'hidden') continue;
  const chain: Element[] = [];
  for (let at: Element | null = el; at && at !== document.documentElement; at = at.parentElement) chain.unshift(at);
  let ground = base;
  for (const at of chain) { const bg = rgba(getComputedStyle(at).backgroundColor); if (bg[3] > 0) ground = over(bg, ground); }
  const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
  const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
  const r = ratio(over(rgba(style.color), ground), ground);
  measured++;
  if (el.closest('.not-connected')) notices++;
  if (r < floor) failures.push(`"${node.textContent!.trim().slice(0, 48)}" (${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}) ${r.toFixed(2)} < ${floor}`);
 }
 return { failures, measured, notices };
});
