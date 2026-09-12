import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/* The landing page is the one screen a stranger reads before anybody explains anything, so what is
   checked here is what it claims. Every figure below is read out of the same contracts the page
   reads, rather than typed into the test: a price that changes in the catalogue changes here and on
   the page together, and a test that had its own copy of R249 would pass while the page lied. */
const contract = (name: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${name}.json`, import.meta.url), 'utf8'));
const services: { price: number; phase: number }[] = contract('services');
const model: { unitEconomics: { platformShare: number }; subscriptions: { price: number | null }[] } = contract('business-model');
const vetting: { roles: { id: string; checks: unknown[] }[] } = contract('vetting');
const live = services.filter(s => s.phase === 1);
const fromPrice = Math.min(...live.map(s => s.price));
const nurseShare = Math.round((1 - model.unitEconomics.platformShare) * 100);
const nurseChecks = vetting.roles.find(r => r.id === 'nurse')!.checks.length;
const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('the landing page says what MyThuso is, and what it is not', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // the proposition in one breath: who comes, and what it costs, in the heading itself
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A registered nurse at your door');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(money(fromPrice));
  // a health service that is not operating has to say so, above the fold and in the footer
  await expect(page.getByRole('status')).toContainText('MyThuso is in development');
  await expect(page.getByText('This is a preview, not a live service.')).toBeVisible();
  await expect(page.getByText(/People shown are illustrative/)).toBeVisible();
  // and beside the photographs themselves, where a reader forms the impression in the first place
  await expect(page.getByText(/Illustrative photograph\. Not a MyThuso nurse/)).toBeVisible();
  expect(errors).toEqual([]);
});

/* One primary action above the fold. The nav offers the same one, and everything else on the page
   is a link or a section — four competing calls to action is how a marketing page stops persuading
   anybody of anything. */
test('the hero asks for one thing', async ({ page }) => {
  await expect(page.locator('.landing-hero .primary')).toHaveCount(1);
});

test('it prices honestly from the same catalogue the app uses', async ({ page }) => {
  const listed = page.locator('.landing-services li');
  await expect(listed).toHaveCount(live.length);                // phase one only
  await expect(listed.first()).toContainText(`From ${money(live[0].price)}`);
  await expect(page.getByText('Chronic Routine')).toBeVisible();
  await expect(page.locator('.landing-plans li').first()).toContainText(money(model.subscriptions[0].price!));
});

/* The figures band is the page's evidence, so it is held to the contracts rather than to itself.
   A number that can be typed into a marketing page is a number nothing can hold to account. */
test('every figure it quotes comes from a contract', async ({ page }) => {
  const band = page.locator('.landing-figures > div');
  await expect(band.nth(0)).toContainText(money(fromPrice));
  await expect(band.nth(1)).toContainText(`${nurseShare}%`);
  await expect(band.nth(2)).toContainText(String(live.length));
  await expect(band.nth(3)).toContainText(String(nurseChecks));
  // and the vetting contract's own check names are on the page, not a paraphrase of them
  await expect(page.locator('.landing-checks li')).toHaveCount(nurseChecks);
  await expect(page.locator('.landing-checks li').first()).toContainText('SANC registration');
  // including what the platform refuses, word for word out of the contract
  await expect(page.getByText('It is not a directory a nurse may browse.')).toBeVisible();
});

/* The band now prints the contract file each figure was read out of, in a chip above the numeral.
   That is a claim a reader can go and check, which makes it worth more than the sentence next to it
   — and worth nothing at all if a chip can name a file that is not there. So the chip is resolved
   against the catalogue directory rather than compared to a string typed here: rename a contract
   and this fails, which is exactly when the page has started citing something that does not exist. */
test('each figure names a contract file that exists', async ({ page }) => {
  const chips = page.locator('.landing-figures .landing-figure-source');
  await expect(chips).toHaveCount(4);
  for (const named of await chips.allInnerTexts()) {
    expect(existsSync(new URL(`../packages/catalog/${named.trim()}`, import.meta.url)), `the figures band cites packages/catalog/${named.trim()}, which is not there`).toBe(true);
  }
});

test('the questions answer, and only one at a time', async ({ page }) => {
  const faq = page.locator('.landing-faq > div');
  await expect(faq.first().getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/routine visits that cost you a day in a queue/)).toBeVisible();
  await faq.nth(2).getByRole('button').click();
  await expect(page.getByText(/Visits start at R.?249/)).toBeVisible();
  await expect(faq.first().getByRole('button')).toHaveAttribute('aria-expanded', 'false');
});

test('every section the nav offers actually exists', async ({ page }) => {
  const links = page.locator('.landing-nav nav a');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const id = (await links.nth(i).getAttribute('href'))!.slice(1);
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});

test('it does not scroll sideways on a phone', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

/* tests/accessibility.spec.ts audits the app's screens at 320px and at 200% zoom and never visits
   this page, which is the one a stranger reads first and the one most likely to be opened on the
   cheapest phone in the house. The same three measurements are made here, against the same floors
   in packages/design-tokens/tokens.json, so an exemption stays a line in the contract rather than
   becoming a line in a test. */
const tokens = JSON.parse(readFileSync(new URL('../packages/design-tokens/tokens.json', import.meta.url), 'utf8'));
const MIN_TARGET: number = tokens.targets.minimum;
const EXEMPT: string[] = tokens.targets.knownUndersized.map((r: { selector: string }) => r.selector);
const MIN_TEXT: number = tokens.typography.minimumRendered;

const auditLanding = async (page: import('@playwright/test').Page, where: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: the landing page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);

  const small = await page.evaluate(([min, exempt]) => [...document.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || el.closest('.visually-hidden')) return false;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      // the standard's own exemption: a word inside a running sentence cannot be 44px tall
      if (el.closest('p, li, small, figcaption') && style.display.startsWith('inline')) return false;
      return rect.width < (min as number) || rect.height < (min as number);
    })
    .filter(el => !(exempt as string[]).some(sel => el.matches(sel)))
    .map(el => `${el.tagName.toLowerCase()}.${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
    [MIN_TARGET, EXEMPT] as const);
  expect(small, `${where}: controls under ${MIN_TARGET}x${MIN_TARGET} that the token contract does not exempt`).toEqual([]);

  const tiny = await page.evaluate(min => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found = new Set<string>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!(node.textContent ?? '').trim() || !parent || parent.closest('.visually-hidden')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || !parent.getBoundingClientRect().height) continue;
      if (parseFloat(style.fontSize) < min) found.add(`${parent.tagName.toLowerCase()}.${parent.className} ${style.fontSize}`);
    }
    return [...found];
  }, MIN_TEXT);
  expect(tiny, `${where} renders text under ${MIN_TEXT}px`).toEqual([]);
};

test('it holds together at 320px, and at 200% zoom', async ({ page }) => {
  /* At its own width first. The narrow audits below hide the desktop navigation behind the menu
     button, so auditing only at 320px would never measure the section links or the header call to
     action at all — which is exactly how a 30px nav link gets shipped. */
  await auditLanding(page, 'at the configured viewport');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await auditLanding(page, 'at 320px');
  /* 200% browser zoom halves the layout viewport and leaves the CSS pixel the size it was, which is
     what setViewportSize does. The floor of 320 is there because nothing here claims to work at
     195px, which is a 390px phone halved. */
  const current = page.viewportSize()!;
  await page.setViewportSize({ width: Math.max(320, Math.round(current.width / 2)), height: current.height });
  await auditLanding(page, 'at 200% zoom');
});

/* Every focusable thing has to show where the focus is. The indicator is the shared one — two rings
   from styles.css, one light and one dark, so whichever ground a control lands on one of them is
   legible — and what is checked here is that nothing on this page has quietly removed it. */
test('everything focusable shows a focus indicator', async ({ page }) => {
  const focusables = page.locator('.landing button, .landing a[href]');
  const count = await focusables.count();
  expect(count).toBeGreaterThan(8);
  const missing: string[] = [];
  for (let i = 0; i < count; i++) {
    const el = focusables.nth(i);
    if (!(await el.isVisible())) continue;
    await el.focus();
    const ring = await el.evaluate(node => {
      const style = getComputedStyle(node);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, shadow: style.boxShadow };
    });
    if (!(ring.width >= 2 && ring.style !== 'none') && ring.shadow === 'none') {
      missing.push(await el.evaluate(node => `${node.tagName.toLowerCase()}.${node.className}`));
    }
  }
  expect(missing).toEqual([]);
});

/* The one rule the whole visual language rests on: **the accent is a fill and never a label.**

   It was sage when this test was written, and the sentence it was written to survives the change of
   palette word for word: on the Care Studio generation the accent is studioLime, which measures
   1.05:1 as text on studioPaper. Lilac and peach are 1.4 and 1.6. All three are allowed to be an
   icon tile, a chip and a wash behind a photograph and nothing else — everything a person reads is
   studioInk or --body. That is the third palette this product has had and the third time the same
   rule has been arrived at, because it is a fact about accents rather than a taste: a colour bright
   enough to draw the eye on paper is never dark enough to be read on it.

   That cannot be checked by reading the stylesheet, because a colour arrives at a word by
   inheritance far more often than by being written next to it: one `color` on a container is all it
   takes for a section of prose to turn lime without a single rule looking wrong. So it is checked
   where it actually matters, on the rendered text, against the values in the token contract rather
   than copies of them typed here.

   The sage ramp stays in the list beside them. The web no longer renders a sage — the four tokens
   are re-pointed onto studio washes in apps/web/src/surface/studio.css — so those three assertions
   are vacuous today and cost nothing, and on the day somebody points a stylesheet back at the old
   ramp they are not vacuous at all.

   The ground is asserted in the same breath. Paper rather than white is the decision every other
   surface on this page is a consequence of — the cards are only readable as cards because the page
   behind them is darker — and a stray `background:#fff` would undo the lot while every one of the
   assertions above went on passing. */
const fillsOnly: string[] = ['studioLime', 'studioLilac', 'studioPeach', 'sageSlate', 'mutedSage', 'softSage', 'paleSage'].map(name => {
  const hex: string = tokens.color[name];
  return `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
});
const ground: string = tokens.color.studioPaper;

test('the accent fills and never labels, on the page ground the language is built on', async ({ page }) => {
  expect(await page.locator('.landing').evaluate(el => getComputedStyle(el).backgroundColor))
    .toBe(`rgb(${[1, 3, 5].map(i => parseInt(ground.slice(i, i + 2), 16)).join(', ')})`);

  const carrying = await page.evaluate(ramp => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found = new Set<string>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!(node.textContent ?? '').trim() || !parent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (ramp.includes(style.color)) found.add(`${parent.tagName.toLowerCase()}.${parent.className}: ${(node.textContent ?? '').trim().slice(0, 40)}`);
    }
    return [...found];
  }, fillsOnly);
  expect(carrying, 'text is being carried by an accent fill, and studioLime measures 1.05:1 on studioPaper').toEqual([]);
});

/* The page animates. Two things have to stay true whatever the motion setting: no section is ever
   left invisible, and a reader who asked for less motion gets none. */
test('sections arrive as you reach them, and none of them can get stuck hidden', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('on');
  const safety = page.getByRole('heading', { name: 'The parts we will not shortcut.' });
  await safety.scrollIntoViewIfNeeded();
  await expect(safety).toBeVisible();
  /* Two separate guarantees, because they fail for different reasons.

     The first is the one that has actually caught a bug: anything the jump to that heading scrolled
     clean past. An IntersectionObserver never fires for those, so on its own it would leave them
     invisible above the reader for the rest of the visit, and only the scroll sweep in
     apps/web/src/lib/motion.ts saves them. Nothing above the fold may be hidden, ever.

     The second is everything now in view, and it is measured a fifth of the way up from the bottom
     rather than at the very edge. motion.ts releases an element once 6% of it has crossed a line 8%
     above the viewport bottom, so a section whose first two pixels are showing has not been passed
     over — it simply has not arrived yet, and asserting on the edge only tested whether a section
     happened to land clear of that band. Anything with a fifth of itself on screen is comfortably
     inside what the observer guarantees, so this still fails loudly if a whole section is left
     invisible in front of the reader. */
  const hidden = (line: number) => page.evaluate(l => [...document.querySelectorAll('[data-reveal]')]
    .filter(el => el.getBoundingClientRect().top < l * innerHeight && getComputedStyle(el).opacity === '0')
    .map(el => el.className || el.tagName), line);
  await expect.poll(() => hidden(0)).toEqual([]);
  await expect.poll(() => hidden(0.8)).toEqual([]);
});

test.describe('when the reader has asked for less motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('nothing moves, and the page is fully visible without it', async ({ page }) => {
    // the reveal styles are keyed off this flag, so leaving it unset is what keeps the page visible
    expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBeUndefined();
    await expect(page.getByRole('heading', { name: 'The parts we will not shortcut.' })).toBeVisible();
    await expect(page.locator('.landing-figures > div').first()).toContainText(money(fromPrice));
    const moving = await page.evaluate(() => document.getAnimations()
      .filter(a => a.playState === 'running').map(a => (a as CSSAnimation).animationName ?? 'transition'));
    expect(moving).toEqual([]);
  });
});

/* ---- The hero's three pictures ----

   This is the second carousel this page has had, and the first one cost an afternoon: nine SVG
   bubbles on an infinite loop behind a screen that had stopped rendering them, and four specs that
   failed on whichever click happened to land while something was in flight. So what is asserted
   here is not that it looks right — it is the three properties that make a thing which moves by
   itself safe to put in front of somebody, each of them driven rather than read out of the source.

   The words come out of packages/catalog/locales.json, like every other figure in this file. The
   slides are the founder's own banner copy and they are already translated into every locale that
   claims the hero set; a test that typed "Care that comes to you." would pass while the page had
   started showing something else entirely. */
const locales: { keys: { id: string }[]; strings: Record<string, Record<string, string>> } = contract('locales');
const heroSlides = locales.keys.filter(k => /^slide\d+\.title$/.test(k.id));
const slideTitle = (n: number) => locales.strings['en-ZA'][`slide${n}.title`].replace('|', ' ');
const showing = (page: import('@playwright/test').Page) => page.locator('.landing-slide.is-on .landing-slide-card i').innerText();
/* The rotation the page is written to. Nothing waits for exactly this — the two assertions below
   poll, so a shorter one passes sooner and a longer one is given twenty seconds — but the two
   pauses that have to prove nothing happened need a length to be longer than. */
const SLIDE_MS = 7000;

test('the hero shows three pictures, and only the one showing is on the page', async ({ page }) => {
  await expect(page.locator('.landing-slide')).toHaveCount(heroSlides.length);
  await expect(page.locator('.landing-slide.is-on')).toHaveCount(1);
  await expect(page.getByText(slideTitle(1))).toBeVisible();
  // the other two are inert and hidden, so neither a keyboard nor a screen reader reaches them
  await expect(page.getByText(slideTitle(2))).toBeHidden();
  // the disclosure belongs to the figure rather than to a slide, so it is on all three at once
  await expect(page.locator('.landing-portrait figcaption').first()).toContainText('Not a MyThuso nurse');
  await page.getByRole('button', { name: `Show the next picture: ${slideTitle(2)}` }).click();
  await expect(page.getByText(slideTitle(2))).toBeVisible();
  await expect(page.locator('.landing-portrait figcaption').first()).toContainText('Not a MyThuso nurse');
  // and the arrows wrap in both directions rather than dead-ending on the third picture
  await page.getByRole('button', { name: `Show the previous picture: ${slideTitle(1)}` }).click();
  await expect(page.getByText(slideTitle(1))).toBeVisible();
});

/* WCAG 2.2.2, which is the defect this page has already fixed once. Anything that moves by itself
   for more than five seconds needs a mechanism to pause it, and the mechanism here is the page's
   one pause control rather than a second one belonging to the carousel — so pressing it has to
   stop the pictures as well as the two drifts. Both halves are asserted, because a pause control
   on something that never moved would prove nothing. */
test('the hero rotates on its own, and the page’s pause control stops it', async ({ page }) => {
  test.setTimeout(90_000);
  const first = await showing(page);
  await expect.poll(() => showing(page), { timeout: 20_000 }).not.toBe(first);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  const held = await showing(page);
  /* The flag every decorative animation on this page is gated on is down, and none of them is
     running. Keyframe animations only: a transition still settling is a state change the reader
     just caused with that very press, and stopping the page's motion does not mean the button they
     pressed may not finish colouring. What must be gone is the endless kind. */
  expect(await page.evaluate(() => document.documentElement.dataset.decor)).toBeUndefined();
  expect(await page.evaluate(() => document.getAnimations()
    .filter(a => a.playState === 'running' && (a as CSSAnimation).animationName)
    .map(a => (a as CSSAnimation).animationName))).toEqual([]);
  await page.waitForTimeout(SLIDE_MS * 1.6);
  expect(await showing(page), 'the hero moved on after the reader had stopped the motion').toBe(held);
  await page.getByRole('button', { name: 'Play motion' }).click();
  await expect.poll(() => showing(page), { timeout: 20_000 }).not.toBe(held);
});

test.describe('when the reader has asked for less motion, the hero', () => {
  test.use({ reducedMotion: 'reduce' });
  test('does not rotate, offers no pause control, and can still be walked by hand', async ({ page }) => {
    test.setTimeout(60_000);
    const first = await showing(page);
    // nothing to pause, so nothing offering to. A disabled button explaining an absence is worse
    await expect(page.locator('.m-pause')).toHaveCount(0);
    await page.waitForTimeout(SLIDE_MS * 1.6);
    expect(await showing(page), 'the hero rotated for a reader who had asked for stillness').toBe(first);
    expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
    // removing the motion may not remove the pictures: the arrows are how they are reached
    await page.getByRole('button', { name: /Show the next picture/ }).click();
    expect(await showing(page)).not.toBe(first);
  });
});
