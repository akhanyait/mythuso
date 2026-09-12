import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* The public status page, checked against the file it claims to render.
 *
 * Everything here reads packages/catalog/capabilities.json rather than repeating any of it. That is
 * the whole point of the page and therefore the whole point of the test: if somebody adds a
 * sixteenth capability, softens a notice, or marks one connected, this spec follows the contract to
 * wherever it went and only fails if the page did not. A test carrying its own copy of the fifteen
 * sentences would be a sixteenth place for them to drift.
 *
 * Two of these assertions are about what the page must never do. A status page is the one surface
 * where the temptation to write a reassuring sentence is strongest — it is read by funders and
 * partners — and a health service that overstates its readiness is not a marketing problem. */

const contract = JSON.parse(readFileSync(new URL('../packages/catalog/capabilities.json', import.meta.url), 'utf8')) as {
  capabilities: {
    id: string; name: string; connected: boolean; notice: string; blockedBy: string[];
    state: 'absent' | 'simulated' | 'connected';
    simulation?: { supplier: string; notice: string; refuses: string[] };
  }[];
  rules: { id: string; statement: string; why: string }[];
};
const { capabilities } = contract;
const connected = capabilities.filter(c => c.connected);
const notConnected = capabilities.filter(c => !c.connected);
/* Three states, and the page has to tell the middle one apart. A simulated capability is not
   connected — the boolean stays false and the contract's own rule refuses to let the two disagree —
   but it is also not a screen with nothing behind it, and a reader deciding whether to trust this
   needs the difference. The sentence it shows is its simulation's, not its absent one. */
const simulated = capabilities.filter(c => c.state === 'simulated');
const absent = notConnected.filter(c => c.state !== 'simulated');
const noticeFor = (c: typeof capabilities[number]) => c.connected ? null : c.simulation ? c.simulation.notice : c.notice;

test.beforeEach(async ({ page }) => { await page.goto('/status/'); });

test('lists every capability in the contract, once each', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'What is switched on', level: 1 })).toBeVisible();
  await expect(page.locator('.status-row')).toHaveCount(capabilities.length);
  for (const c of capabilities) {
    const row = page.locator(`#${c.id}`);
    await expect(row, `${c.id} has no row on the status page`).toHaveCount(1);
    await expect(row.getByRole('heading', { name: c.name, level: 2 })).toBeVisible();
  }
});

test('says how many are connected, and the figure is the contract’s arithmetic', async ({ page }) => {
  await expect(page.locator('.status-count strong')).toHaveText(String(connected.length));
  await expect(page.locator('.status-count')).toContainText(`of ${capabilities.length} capabilities are connected`);
  await expect(page.locator('.status-state').filter({ hasText: /^Not connected$/ })).toHaveCount(absent.length);
  await expect(page.locator('.status-state').filter({ hasText: /^Simulated$/ })).toHaveCount(simulated.length);
  await expect(page.locator('.status-state.on')).toHaveCount(connected.length);
  /* Simulated is stated as its own count too, and the sentence is derived rather than typed — a
     figure a reader could mistake for progress is not left to be totalled off fifteen chips. */
  if (simulated.length) await expect(page.locator('.status-simulated')).toContainText(`${simulated.length} of them are simulated`);
});

/* The assertion this page exists for, now that there are simulators behind it.
 *
 * A demonstration is more convincing than a screenshot, so the moment fourteen suppliers could be
 * walked end to end was the moment this page became easiest to get wrong: the headline count is the
 * one number a funder reads, and rolling the simulated ones into it would have been a single
 * plausible edit. The count stays the connected count. The simulation is reported underneath it, as
 * what it is, and it never borrows the word. */
test('counts a simulation as a simulation and never as a connection', async ({ page }) => {
  await expect(page.locator('.status-count strong')).toHaveText('0');
  const simulatedLine = page.locator('.status-simulated');
  await expect(simulatedLine).toContainText(`${simulated.length} of them are simulated`);
  /* The two sentences that stop the line above being a boast. Asserted here rather than left to a
     reviewer, because a simulation count on a funder's page reads as progress unless something on
     the same line says what it costs and what it does not buy. */
  await expect(simulatedLine).toContainText('No supplier is contracted');
  await expect(simulatedLine).toContainText('nothing below is less blocked for having one');
  for (const c of simulated) {
    const row = page.locator(`#${c.id}`);
    await expect(row.locator('.status-state'), `${c.id} must not read Connected`).toHaveText('Simulated');
    /* A simulator unblocks nothing. The SMS provider is unsigned on the day the simulated one works
       perfectly, so the blockers stay on the row and this is where somebody would quietly drop them. */
    expect(c.blockedBy.length, `${c.id} is simulated and lists nothing blocking it`).toBeGreaterThan(0);
    for (const blocker of c.blockedBy) {
      await expect(row.locator('.status-blockers li').filter({ hasText: blocker })).toHaveCount(1);
    }
    /* And the refusals reach the page, not just the source. They are the reason a simulation is
       honest work rather than a demonstration in a product's clothes, and a reader deciding whether
       to believe any of this should not have to open a file to find them. */
    for (const refusal of c.simulation!.refuses) {
      await expect(row.locator('.status-refuses li').filter({ hasText: refusal }),
        `${c.id} does not show that it refuses to ${refusal}`).toHaveCount(1);
    }
    /* And they are their own list. A refusal folded in among the blockers would read as one more
       thing waiting on a supplier, when it is the opposite: a thing that stays true after one signs. */
    await expect(row.locator('.status-refuses li')).toHaveCount(c.simulation!.refuses.length);
  }
});

test('renders each notice and each blocker word for word', async ({ page }) => {
  for (const c of notConnected) {
    const row = page.locator(`#${c.id}`);
    await expect(row.locator('.status-notice').first(), `${c.id} does not show its notice`).toHaveText(noticeFor(c)!);
    for (const blocker of c.blockedBy) await expect(row.locator('.status-blockers li').filter({ hasText: blocker })).toHaveCount(1);
  }
  /* A capability that is connected shows no notice at all — the sentence exists to be shown while
     something is not real, and a leftover one on a working feature is the mirror of the defect this
     contract was written to stop. */
  for (const c of connected) await expect(page.locator(`#${c.id} .status-notice`)).toHaveText(/^Connected\./);
});

test('a simulated capability says what its stand-in refuses to do, word for word', async ({ page }) => {
  /* The half that matters. A simulator's hazard is that it works, and the only thing standing
     between "something answered" and "a supplier exists" is the list of what it will not do. */
  for (const c of simulated) {
    const row = page.locator(`#${c.id}`);
    await expect(row.locator('.status-refuses li'), `${c.id} lists none of what its stand-in refuses`).toHaveCount(c.simulation!.refuses.length);
    for (const refusal of c.simulation!.refuses) {
      await expect(row.locator('.status-refuses li').filter({ hasText: refusal })).toHaveCount(1);
    }
  }
  /* And a capability with nothing behind it has no such list, because there is no stand-in to
     describe — an empty heading would read as one that had refused nothing. */
  for (const c of absent) await expect(page.locator(`#${c.id} .status-refuses`)).toHaveCount(0);
});

test('a simulated capability still lists everything blocking it', async ({ page }) => {
  /* The contract's own simulated-is-not-connected rule: a simulator does not unblock anything, and
     the SMS provider is still unsigned on the day the simulated one works perfectly. */
  for (const c of simulated) {
    if (!c.blockedBy.length) continue;
    for (const blocker of c.blockedBy) {
      await expect(page.locator(`#${c.id} .status-blockers li`).filter({ hasText: blocker })).toHaveCount(1);
    }
  }
});

test('carries the rule that says when a row may read Connected', async ({ page }) => {
  const rule = contract.rules.find(r => r.id === 'connected-needs-evidence')!;
  await expect(page.locator('.status-foot')).toContainText(rule.statement);
  await expect(page.locator('.status-foot')).toContainText(rule.why);
});

test('never claims MyThuso is ready, secure or compliant', async ({ page }) => {
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const claim of ['production-ready', 'production ready', 'popia-compliant', 'popia compliant', 'fully compliant', 'bank-grade', 'enterprise-grade', 'is secure']) {
    expect(text, `The status page says "${claim}". It is the one page that may not.`).not.toContain(claim);
  }
  /* Not a claim about copy: with nothing connected, the page has to say so in a sentence rather
     than leave it to a reader to total fifteen chips. */
  if (connected.length === 0) await expect(page.locator('.status-none')).toBeVisible();
});

test('is a page on its own, not the application wearing a status hat', async ({ page }) => {
  /* No shell. The point of a fifth entry is that somebody who suspects nothing works does not
     download a tab bar, a sidebar and four applications' screens to be told so. */
  for (const shell of ['.tabbar', '.topbar', '.workspace', '.chart-card', '.aurora']) {
    await expect(page.locator(shell), `${shell} reached the status entry — it is pulling the app in behind it`).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'About MyThuso' })).toHaveAttribute('href', '/landing.html');
});

test('holds together at 320px and at 200% zoom', async ({ page }) => {
  const start = page.viewportSize()!;
  for (const width of [320, Math.max(320, Math.round(start.width / 2))]) {
    await page.setViewportSize({ width, height: start.height });
    await page.waitForTimeout(80);
    const pixels = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pixels, `the status page scrolls sideways by ${pixels}px at ${width}px`).toBeLessThanOrEqual(1);
    /* Fifteen rows and their chips still all present at the narrowest width anybody reads this on. */
    await expect(page.locator('.status-row')).toHaveCount(capabilities.length);
  }
});
