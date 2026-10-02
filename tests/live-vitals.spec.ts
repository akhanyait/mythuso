import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The patient's devices, live and simulated (1 October 2026), on both viewports: the doctor's Triage page,
 * the call room and the consultation record. What these journeys hold is that the board is live — the values
 * change while the simulator runs, and stop when it is paused — and that it is honest: the synthetic banner
 * and the devices notice stand over it, each reading's range is the record's, and where the export drew a
 * score, a triage colour, an interpretation, alarms and a heatmap, the contract's refusal stands instead and
 * nothing else on the board draws one. Every sentence is read from the contracts rather than typed. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const live = json('../packages/catalog/live-vitals.json');
const records = json('../packages/catalog/records.json');
const devices = json('../packages/catalog/devices.json');
const presets = json('../packages/catalog/devices/simulator-presets.json').presets as { id: string; name: string }[];
const measure = (id: string) => records.observations.measures.find((m: { id: string }) => m.id === id);
const shots = 'test-results-vitals/screens';

const values = (board: Locator) => board.locator('.lv-tile[data-stream] .lv-value strong').allTextContents();
const noSidewaysScroll = (page: Page, scope: string) => page.evaluate(sel => {
  const out: string[] = [];
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('page');
  for (const el of Array.from(document.querySelectorAll(`${sel} *`)) as HTMLElement[]) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > document.documentElement.clientWidth + 1) out.push(`${el.tagName}.${el.className}`);
  }
  return out.slice(0, 5);
}, scope);

/* Nothing the export drew to rank a patient is drawn anywhere on the board but in its own refusal. */
async function drawsNoJudgement(board: Locator) {
  for (const word of [/early.warning/i, /NEWS2?/, /\bscore\b/i, /heatmap/i, /severity/i, /\btriage\b/i, /\b(Red|Orange|Yellow|Green)\b/, /Very urgent|Emergency|Routine/])
    for (const part of ['.lv-tiles', '.lv-status']) await expect(board.locator(part)).not.toContainText(word);
  await expect(board.locator('.ui-badge--danger, .ui-badge--warning, .ui-badge--success')).toHaveCount(0);
  for (const r of live.refusals) {
    const row = board.locator(`.lv-refusal[data-refusal="${r.id}"]`);
    await expect(row).toContainText(r.heading);
    await expect(row).toContainText(r.sentence);
  }
}

async function bannerStands(board: Locator) {
  const banner = board.locator('.lv-banner');
  await expect(banner).toContainText(live.board.banner);
  await expect(banner).toContainText(noticeFor('devices'));
}

test.describe('the doctor’s Triage page', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page, 'Doctor');
    await goSection(page, 'Triage');
  });

  test('every instrument streams, the values move, and pause stops them', async ({ page }) => {
    const board = page.locator('.lv-board');
    await expect(board).toBeVisible();
    await bannerStands(board);
    await expect(board.locator('.lv-tile[data-stream]')).toHaveCount(live.streams.length);
    /* The default scenario has a reading from every instrument it streams. */
    await expect(board.locator('.lv-tile.is-silent')).toHaveCount(0);
    const heart = board.locator('[data-stream="pulse"] .lv-organ svg');
    const oxygen = board.locator('[data-stream="oxygen"] .lv-organ svg');
    expect(await heart.evaluate(el => getComputedStyle(el).animationName)).toBe('lv-heart');
    expect(await oxygen.evaluate(el => getComputedStyle(el).animationName)).toBe('lv-breathe');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await heart.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const first = await values(board);
    await expect.poll(async () => (await values(board)).join(' '), { timeout: 12_000 }).not.toBe(first.join(' '));
    /* Each tile says where it came from, and that it was simulated. */
    for (const tile of await board.locator('.lv-tile[data-stream]').all()) {
      await expect(tile).toContainText(devices.deviceClasses.find((c: { id: string }) => c.id === 'simulator').label);
      await expect(tile.locator('.lv-prov')).toContainText(devices.marks.find((m: { id: string }) => m.id === 'simulated').label);
      await expect(tile.locator('svg.lv-spark')).toHaveCount(1);
    }
    /* The range is the record's, in words. */
    const sys = measure('systolic');
    await expect(board.locator('.lv-tile[data-stream="systolic"] .lv-range')).toContainText(`${sys.low}–${sys.high} ${sys.unit}`);
    await expect(board.locator('.lv-tile[data-stream="systolic"] .lv-range')).toContainText(/(Inside|Below|Above) the reference range/);
    await page.screenshot({ path: `${shots}/triage-${test.info().project.name}.png`, fullPage: true });

    await board.getByRole('button', { name: live.board.pause }).click();
    await expect(board.locator('.lv-status [role="status"]')).toHaveText(live.board.paused);
    expect(await heart.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    const held = (await values(board)).join(' ');
    await page.waitForTimeout(live.pace.tickMs * 2 + 500);
    expect((await values(board)).join(' ')).toBe(held);
    await board.getByRole('button', { name: live.board.resume }).click();
    await expect.poll(async () => (await values(board)).join(' '), { timeout: 12_000 }).not.toBe(held);
    expect(await noSidewaysScroll(page, '.lv-board')).toEqual([]);
  });

  test('a scenario decides which instruments send, and draws no judgement', async ({ page }) => {
    const board = page.locator('.lv-board');
    await board.getByLabel(live.board.scenario).selectOption(presets.find(p => p.id === 'sim.hypox')!.name);
    /* Progressive hypoxia sends nothing from the glucometer, and the tile says so rather than borrowing. */
    await expect(board.locator('.lv-tile[data-stream="glucose"]')).toContainText(live.board.nothing);
    const ox = measure('oxygen');
    await expect(board.locator('.lv-tile[data-stream="oxygen"] .lv-range')).toContainText(`Below the reference range, ${ox.low}–${ox.high} ${ox.unit}`, { timeout: 15_000 });
    await drawsNoJudgement(board);
    await page.screenshot({ path: `${shots}/triage-hypox-${test.info().project.name}.png`, fullPage: true });

    /* The stale scenario sends nothing live: it says so in the Devices contract's own words, and Pause has nothing to stop. */
    await board.getByLabel(live.board.scenario).selectOption(presets.find(p => p.id === 'sim.stale')!.name);
    await expect(board.locator('.lv-status')).toContainText(devices.screens.nurse.staleSince.split('{interval}')[0].trim());
    await expect(board.getByRole('button', { name: live.board.pause })).toBeDisabled();
    await expect(board.locator('.lv-tile[data-stream="pulse"] .lv-ago')).toContainText(/h ago/);
  });

  test('what cannot be streamed is said, and the record’s caveat stands under the board', async ({ page }) => {
    const board = page.locator('.lv-board');
    await expect(board.locator('.lv-notstreamed')).toContainText(live.board.notStreamedHeading);
    await expect(board.locator('.lv-absent > li')).toHaveCount(3);
    const note = records.consultation.sections.find((s: { id: string }) => s.id === 'observations').note;
    await expect(board.locator('.lv-foot')).toContainText(note);
  });
});

test.describe('the doctor’s consultation', () => {
  test('the call room carries the patient’s devices, live, and so does the record it ends in', async ({ page }) => {
    await openWorkspace(page, 'Doctor');
    await goSection(page, 'Teleconsultation');
    const d = page.locator('main');
    await d.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
    await d.locator('label.checkbox').filter({ hasText: /May she stay/ }).locator('input').check();
    await d.getByRole('button', { name: /Check identity/ }).click();
    await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
    await d.getByRole('button', { name: /Confirm and continue/ }).click();
    await d.getByRole('button', { name: /Open the call/ }).click();
    await d.getByRole('button', { name: /Skip the wait/ }).click();

    await expect(d.locator('.tcx-video-preview')).toBeVisible();
    await d.locator('.tcx-context summary').click();
    await expect(d.locator('.tcx-context')).toContainText('Medication requests');
    await d.locator('.tcx-context summary').click();
    const panel = d.locator('.tcx-aside .lv-panel');
    await expect(panel.getByRole('heading', { name: live.board.compactHeading })).toBeVisible();
    await bannerStands(panel);
    await expect(panel.locator('.lv-tile[data-stream]')).toHaveCount(live.streams.length);
    const first = (await values(panel)).join(' ');
    await expect.poll(async () => (await values(panel)).join(' '), { timeout: 12_000 }).not.toBe(first);
    await drawsNoJudgement(panel);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/call-${test.info().project.name}.png`, fullPage: true });
    expect(await noSidewaysScroll(page, '.tcx-aside')).toEqual([]);

    await d.getByRole('button', { name: /Reach a decision and end the consultation/ }).click();
    await d.getByRole('button', { name: /Write it up in the consultation record/ }).click();
    /* The record opens as the call's notes tool, and the devices stay where they were, beside it, rather than
       again in the composer's rail: one panel, one clock (consultation-toolkit.json). */
    const rail = d.locator('.tcx-aside .lv-panel');
    await expect(rail.getByRole('heading', { name: live.board.compactHeading })).toBeVisible();
    await bannerStands(rail);
  });

  test('the consultation records composer carries the patient’s devices beside it', async ({ page }) => {
    await openWorkspace(page, 'Doctor');
    await goSection(page, 'Consultation records');
    /* Beside the record in its toolkit since 2 October 2026, rather than in the composer's own rail. */
    const rail = page.locator('main .ctk-aside .lv-panel');
    await expect(rail.getByRole('heading', { name: live.board.compactHeading })).toBeVisible();
    await bannerStands(rail);
    const first = (await values(rail)).join(' ');
    await expect.poll(async () => (await values(rail)).join(' '), { timeout: 12_000 }).not.toBe(first);
    await drawsNoJudgement(rail);
    await rail.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/record-${test.info().project.name}.png` });
    expect(await noSidewaysScroll(page, '.ctk-aside')).toEqual([]);
  });
});
