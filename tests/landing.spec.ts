import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The landing page is the one screen a stranger reads before anybody explains anything, so what is
   checked here is what it claims. Every figure below is read out of the same contracts the page
   reads, rather than typed into the test: a price that changes in the catalogue changes here and on
   the page together, and a test that had its own copy of R249 would pass while the page lied. */
const contract = (name: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${name}.json`, import.meta.url), 'utf8'));
const services: { price: number; phase: number }[] = contract('services');
const model: { unitEconomics: { platformShare: number }; subscriptions: { price: number | null }[] } = contract('business-model');
const vetting: { roles: { id: string; checks: unknown[] }[] } = contract('vetting');
/* The banner, as its own contract. Four slides of words and the two lines every one of them
   carries — see packages/catalog/hero.json for why a picture of a headline was not good enough. */
const hero: {
  slides: { id: string; eyebrow: string; headline: { lead: string; accent: string }; body: string;
            action: { label: string; goes: string }; marks: { lines: string[] }[];
            cards: { title: string; lines: string[] }[] }[];
  standing: { place: string; photographNote: string; priceLine: string };
} = contract('hero');
const live = services.filter(s => s.phase === 1);
const fromPrice = Math.min(...live.map(s => s.price));
const nurseShare = Math.round((1 - model.unitEconomics.platformShare) * 100);
const nurseChecks = vetting.roles.find(r => r.id === 'nurse')!.checks.length;
const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('the landing page says what MyThuso is, and what it is not', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  /* The heading is the banner's own headline now, in the contract's words rather than the page's.
     Both halves and the space between them: the sentence is split into two tones and an accessible
     name that lost the join would read as two headlines. */
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${hero.slides[0].headline.lead} ${hero.slides[0].headline.accent}`);
  // a health service that is not operating has to say so, above the fold and in the footer
  await expect(page.getByRole('status')).toContainText('MyThuso is in development');
  await expect(page.getByText('This is a preview, not a live service.')).toBeVisible();
  await expect(page.getByText(/People shown are illustrative/)).toBeVisible();
  // and beside the photographs themselves, where a reader forms the impression in the first place
  await expect(page.getByText(hero.standing.photographNote)).toBeVisible();
  expect(errors).toEqual([]);
});

/* The price is on the first screen, under whichever banner is showing, in the contract's own
   sentence with the catalogue's own number in it \u2014 and it is in the services list. Neither is a
   sentence anybody typed. The first-viewport assertion is the point of the line: four reviews of
   this page on 26 September found a stranger could read the whole first screen and not learn what
   this costs, so the line is measured against the viewport rather than merely found. */
test('the price it advertises is still the catalogue\u2019s, and it is on the first screen', async ({ page }) => {
  const line = page.locator('.landing-hero-price');
  await expect(line).toHaveText(hero.standing.priceLine.replace('{price}', money(fromPrice)));
  expect(hero.standing.priceLine).toContain('{price}');
  const box = (await line.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height, 'the price line is below the first screen').toBeLessThanOrEqual(viewport.height);
  await expect(page.locator('.landing-services li').first()).toContainText(money(live[0].price));
});

/* The photograph is the contract's crop, WebP first with the JPEG behind it, and never the 2 MB
   editorial PNGs the page carried until 26 September. Since 28 September the hero stands on its first
   banner, so the first view costs one small picture. */
test('the hero serves the contract\u2019s WebP crop, one picture', async ({ page }) => {
  const sources = page.locator('.landing-portrait .landing-slide picture source');
  await expect(sources).toHaveCount(1);
  await expect(sources.first()).toHaveAttribute('srcset', `/banners/${hero.slides[0].photograph}.webp`);
  await expect(page.locator('.landing-portrait .landing-slide.is-on img')).toHaveAttribute('src', `/banners/${hero.slides[0].photograph}.jpg`);
  expect(await page.locator('img[src*="/editorial/"][src$=".png"]').count()).toBe(0);
});

/* On a slow connection a tap on a link is followed by nothing, and a reader who sees nothing taps
   again. The two primary calls to action say so after 300 ms. The destination is held back here so
   that the label has something to wait for. */
test('a primary call to action says it is opening when the app is slow to arrive', async ({ page }) => {
  /* A navigation that never arrives is modelled by cancelling the link's default in a capturing
     listener: the page's own click handler still runs, nothing leaves, and the label is read from the
     document that is still on screen. Holding the request instead was tried first \u2014 Playwright will
     not read a frame while its navigation is pending, so the test could see nothing at all. */
  await page.evaluate(() => addEventListener('click', e => e.preventDefault(), true));
  const cta = page.locator('.landing-hero-slide.is-on .primary');
  const label = hero.slides[0].action.label;
  await expect(cta).toContainText(label);
  await cta.click();
  await expect(cta).toContainText('Opening\u2026');
  await expect(cta).not.toContainText(label);
});

/* One primary action above the fold. The nav offers the same one, and everything else on the page
   is a link or a section — four competing calls to action is how a marketing page stops persuading
   anybody of anything. */
test('the hero asks for one thing', async ({ page }) => {
  /* Four banners means four calls to action in the document and exactly one a reader can see or
     reach: the three that are not showing are visibility:hidden and inert. Both halves are
     asserted, because "one visible" on its own would pass just as happily if the other three were
     merely off-screen and still in the tab order. */
  await expect(page.locator('.landing-hero .primary')).toHaveCount(1);
  await expect(page.locator('.landing-hero .primary:visible')).toHaveCount(1);
  await expect(page.locator('.landing-hero h1:visible')).toHaveCount(1);
});

/* Every call to action goes somewhere, and two of the four name a section of the product rather
   than its front door. A banner that offers "Explore family care" and opens a home screen has not
   done the one thing it offered, so each destination is followed. */
test('the banner\u2019s call to action opens what it says it opens', async ({ page }) => {
  const pages: Record<string, string> = { 'My family': 'My family', 'Live well': 'Live well' };
  /* One banner stands on the page since 28 September; the other three stay in the contract, unshown,
     and their destinations are held by lib/hero.ts's own tests rather than walked here. */
  for (let i = 0; i < 1; i += 1) {
    const slide = hero.slides[i];
    const action = page.getByRole('link', { name: new RegExp(slide.action.label) });
    const href = await action.getAttribute('href');
    expect(href, `${slide.id} has no destination`).toMatch(/^\/\?role=/);
    if (slide.action.goes === 'nurse') expect(href).toContain('role=nurse');
    if (slide.action.goes === 'family') expect(href).toContain('open=my-family');
    if (slide.action.goes === 'live-well') expect(href).toContain('open=live-well');
    void pages;
  }
});

test('it prices honestly from the same catalogue the app uses', async ({ page }) => {
  const listed = page.locator('.landing-services li');
  await expect(listed).toHaveCount(live.length);                // phase one only
  await expect(listed.first()).toContainText(`From ${money(live[0].price)}`);
  await expect(page.getByText('Chronic Routine')).toBeVisible();
  await expect(page.locator('.landing-plans li').first()).toContainText(money(model.subscriptions[0].price!));
});

/* Every number the page quotes comes from a contract. The figures band that used to carry four of
   them in a row is gone — it was the fourth place the same four numbers appeared — so each is now
   held where it lives: the share in the nurses' heading, the checks in Safety, the services in the
   footer. A number that can be typed into a marketing page is a number nothing can hold to account. */
test('every figure it quotes comes from a contract', async ({ page }) => {
  await expect(page.locator('#nurses h2')).toContainText(`${nurseShare}%`);
  await expect(page.locator('.landing-footer')).toContainText(`${live.length} of them at launch`);
  await expect(page.locator('.safety-standard')).toContainText(`All ${nurseChecks} nurse checks`);
  // and the vetting contract's own check names are on the page, not a paraphrase of them
  await expect(page.locator('.landing-checks li')).toHaveCount(nurseChecks);
  await expect(page.locator('.landing-checks li').first()).toContainText('SANC registration');
  // including what the platform refuses, word for word out of the contract
  await expect(page.getByText('It is not a directory a nurse may browse.')).toBeVisible();
  // and nothing on the page names a contract file to a reader
  expect(await page.locator('.landing').innerText()).not.toMatch(/\w+\.json/);
});

/* The cost question opens first, because it is the question a stranger arrives with; the new one
   after it answers "is this live yet?" with the notice bar's own words rather than softer ones. */
test('the questions answer, and only one at a time', async ({ page }) => {
  const faq = page.locator('.landing-faq > div');
  await expect(faq.first().getByRole('button')).toHaveText(/What does it cost/);
  await expect(faq.first().getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(new RegExp(`Visits start at ${money(fromPrice).replace(/\\s/g, '\\s?')}`))).toBeVisible();
  await faq.nth(1).getByRole('button').click();
  await expect(faq.nth(1).getByRole('button')).toHaveText(/Is this live yet/);
  await expect(page.locator('.landing-faq').getByText(/nothing here books a visit, takes a payment or sends a nurse anywhere/)).toBeVisible();
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
  const safety = page.getByRole('heading', { name: 'Safety is a condition of care.' });
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
    await expect(page.getByRole('heading', { name: 'Safety is a condition of care.' })).toBeVisible();
    await expect(page.locator('.landing-hero-price')).toContainText(money(fromPrice));
    const moving = await page.evaluate(() => document.getAnimations()
      .filter(a => a.playState === 'running').map(a => (a as CSSAnimation).animationName ?? 'transition'));
    expect(moving).toEqual([]);
  });
});

/* ---- The hero's banner ----

   This is the fourth hero this page has had. The third rotated four banners with a counter, a pause
   pill and two arrows beneath; on 28 September 2026 the founder asked for that strip to go, and a
   picture that rotates by itself with no control to stop it is what WCAG 2.2.2 refuses, so the hero
   now stands on the contract's first banner and the page's one pause control lives in the top bar.
   Every word still comes out of packages/catalog/hero.json, like every figure in this file comes out
   of the contract it belongs to. */
const slideTitle = (n: number) => `${hero.slides[n - 1].headline.lead} ${hero.slides[n - 1].headline.accent}`;
const showing = async (page: import('@playwright/test').Page) => (await page.locator('.landing-hero-slide.is-on h1').innerText()).replace(/\s+/g, ' ').trim();

test('the hero stands on the first banner, with no strip beneath it', async ({ page }) => {
  await expect(page.locator('.landing-hero-slide')).toHaveCount(1);
  await expect(page.locator('.landing-portrait .landing-slide.is-on')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: slideTitle(1) })).toBeVisible();
  await expect(page.getByText(hero.slides[1].body)).toHaveCount(0);
  /* The two standing lines belong to the figure: a sentence saying nobody in these photographs is a
     MyThuso nurse is on the page whatever else is. */
  await expect(page.locator('.landing-portrait figcaption').first()).toHaveText(hero.standing.photographNote);
  await expect(page.locator('.landing-portrait-place')).toContainText(hero.standing.place);
  /* The strip the founder asked to remove: no trust marks, no counter, no arrows, and the hero holds no
     pause pill of its own. */
  await expect(page.locator('.landing-hero-marks')).toHaveCount(0);
  await expect(page.locator('.landing-slide-index')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Show the (next|previous) banner/ })).toHaveCount(0);
  await expect(page.locator('.landing-hero .m-pause')).toHaveCount(0);
  await page.waitForTimeout(8_000);
  expect(await showing(page), 'the hero moved on with nothing to stop it').toBe(slideTitle(1));
});

/* Every word on the banner comes from packages/catalog/hero.json, which is the whole reason the
   four supplied compositions were taken apart. A slide rendering its own copy would pass every
   assertion above; this one walks the contract and asks the page for each piece. */
test('every word on the banner is the contract\u2019s', async ({ page }) => {
  const slide = hero.slides[0];
  const on = page.locator('.landing-hero-slide.is-on');
  await expect(on).toContainText(slide.eyebrow);
  await expect(on).toContainText(slide.body);
  await expect(on.getByRole('link', { name: new RegExp(slide.action.label) })).toBeVisible();
  const figure = page.locator('.landing-portrait .landing-slide.is-on');
  for (const card of slide.cards) {
    await expect(figure).toContainText(card.title);
    for (const line of card.lines) await expect(figure).toContainText(line);
  }
});

/* WCAG 2.2.2, which is the defect this page has already fixed once. Anything that moves by itself
   for more than five seconds needs a mechanism to pause it. The hero no longer moves; the two ambient
   drifts still do, and the page's one pause control — in the top bar since 28 September — stops them. */
test('the page\u2019s pause control, in the top bar, stops the ambient motion', async ({ page }) => {
  const pause = page.locator('.landing-nav .m-pause');
  await expect(pause).toHaveCount(1);
  /* The entrance animations are one-shot and finish on their own; what the control must stop is the
     endless kind, so they are given their moment before the press. */
  await page.waitForTimeout(3_000);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  /* The flag every decorative animation on this page is gated on is down, and none of them is
     running. Keyframe animations only: a transition still settling is a state change the reader
     just caused with that very press. */
  expect(await page.evaluate(() => document.documentElement.dataset.decor)).toBeUndefined();
  expect(await page.evaluate(() => document.getAnimations()
    .filter(a => a.playState === 'running' && (a as CSSAnimation).animationName)
    .map(a => (a as CSSAnimation).animationName))).toEqual([]);
  await expect(page.getByRole('button', { name: 'Play motion' })).toBeVisible();
});

test.describe('when the reader has asked for less motion, the hero', () => {
  test.use({ reducedMotion: 'reduce' });
  test('offers no pause control and nothing runs', async ({ page }) => {
    // nothing to pause, so nothing offering to. A disabled button explaining an absence is worse
    await expect(page.locator('.m-pause')).toHaveCount(0);
    expect(await showing(page)).toBe(slideTitle(1));
    expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  });
});
