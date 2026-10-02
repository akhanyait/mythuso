import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The consultation toolkit (2 October 2026), on both viewports.
 *
 * What these journeys hold is the founder's ask and what it refuses. The doctor on a call reaches every tool —
 * the patient's devices, the notes, a prescription, a test, a referral, the sick note, the patient's file and the
 * protocols — without leaving the call, and comes back to it with the call where it was. Each tool keeps its own
 * capability notice. A decision waits for a line that allows one, and a medicine is not started for a patient
 * nobody in the room has examined, in the teleconsultation's own words. The nurse in a visit sees the patient's
 * devices, live and simulated, once the code has opened the visit, beside her own tools — and sees no
 * prescription and no sick note, only the contract's sentence saying they are a doctor's.
 *
 * Every name and sentence is read from packages/catalog, never typed here. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${path}`, import.meta.url), 'utf8'));
const kit = json('consultation-toolkit.json');
const live = json('live-vitals.json');
const care = json('care.json');
const tele = json('teleconsult.json');
const sick = json('sick-note.json');
type Tool = { id: string; name: string; short: string; capability: string | null; honesty: { capability: string; drawnBy: string }; pending?: boolean };
type Surface = { id: string; heading: string; home: { id: string; name: string }; tools: string[]; refused?: { tool: string; sentence: string }[] };
const tool = (id: string): Tool => kit.tools.find((t: Tool) => t.id === id);
const surface = (id: string): Surface => kit.surfaces.find((s: Surface) => s.id === id);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (w, k) => v[k] ?? w);
const backTo = (home: string) => fill(kit.words.backTo, { home: home.charAt(0).toLowerCase() + home.slice(1) });
const shots = 'test-results-consult-toolkit/screens';

/* A box that scrolls vertically also scrolls sideways, so the page, main and any open dialog are each asked. */
const noOverflow = (page: Page) => page.evaluate(() =>
  [document.documentElement, document.querySelector('main'), document.querySelector('dialog[open]')]
    .filter((el): el is HTMLElement => Boolean(el))
    .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.tagName));
const values = (board: Locator) => board.locator('.lv-tile[data-stream] .lv-value strong').allTextContents();

/* GilbertOne speaks through speechSynthesis, and a headless browser's stalls a click (tests/assistant.spec.ts). */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak() {}, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {} } });
  });
});

async function intoTheCall(page: Page) {
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
  return d;
}
const toolButton = (scope: Locator, id: string) => scope.locator(`.ctk-tools button[data-tool="${id}"]`);
const panel = (scope: Locator, id: string) => scope.locator(`.ctk-panel[data-panel="${id}"]`);

test.describe('the doctor on a call', () => {
  test('every tool opens beside the call, keeps its own notice, and the way back is the call as it was', async ({ page }) => {
    test.setTimeout(120_000);
    const d = await intoTheCall(page);
    const call = surface('teleconsult');
    const nav = d.getByRole('navigation', { name: call.heading });
    await expect(nav).toBeVisible();
    // the call first, then the tools in the contract's order, each named in full for a screen reader
    const ids = await nav.locator('button[data-tool]').evaluateAll(els => els.map(e => e.getAttribute('data-tool')));
    expect(ids).toEqual([call.home.id, ...call.tools]);
    for (const id of call.tools) await expect(toolButton(d, id)).toContainText(tool(id).name);
    await expect(toolButton(d, call.home.id)).toHaveAttribute('aria-current', 'true');
    await expect(d.locator('.tcx-aside .lv-panel')).toBeVisible();
    await page.screenshot({ path: `${shots}/call-${test.info().project.name}.png`, fullPage: true });

    for (const id of call.tools) {
      const t = tool(id);
      await toolButton(d, id).click();
      const p = panel(d, id);
      await expect(p.getByRole('heading', { name: t.name, exact: true })).toBeVisible();
      await expect(p.getByRole('heading', { name: t.name, exact: true })).toBeFocused();
      await expect(p).toContainText(fill(kit.words.forPatient, { patient: 'Lerato Molefe', reference: 'TH-2048' }));
      // the call goes on behind the tool: its line is on the tool's head, and the call's own screen is hidden, not gone
      await expect(p.locator('.ctk-line')).toContainText(/in the room/);
      await expect(d.locator('section[aria-label="The line and what it allows"]')).toBeHidden();
      if (t.pending) await expect(p).toContainText(kit.gates.beingBuilt);
      else await expect(p.locator(id === 'devices' ? '.lv-banner' : '.not-connected').first()).toContainText(noticeFor(t.honesty.capability));
      if (id === 'devices') {
        // the full board, live; the rail's panel steps aside so two clocks never count one patient
        const board = p.locator('.lv-board');
        await expect(board.locator('.lv-banner')).toContainText(live.board.banner);
        const first = (await values(board)).join(' ');
        await expect.poll(async () => (await values(board)).join(' '), { timeout: 12_000 }).not.toBe(first);
        await expect(d.locator('.tcx-aside')).toHaveCount(0);
      }
      if (id === 'notes') {
        await expect(p.locator('.ctk-state')).toContainText(kit.gates.notesDuringCall);
        await expect(p.getByLabel('Reason for visit')).toHaveValue(/Teleconsultation · TH-2048/);
        await p.getByLabel('Reason for visit').fill('Teleconsultation · TH-2048 · follow-up of a dressing');
      }
      if (id === 'context') await expect(p).toContainText(fill(kit.gates.notOnFile, { patient: 'Lerato Molefe' }));
      // the sick note is sick-note.json's own composer, saying it issues nothing, for this consultation
      if (id === 'sick-note') { await expect(p.locator('.sn-banner')).toContainText(sick.notIssued); await expect(p).toContainText('TH-2048'); }
      if (id === 'prescribe' || id === 'notes' || id === 'sick-note') await page.screenshot({ path: `${shots}/tool-${id}-${test.info().project.name}.png`, fullPage: true });
      expect(await noOverflow(page)).toEqual([]);
      await p.getByRole('button', { name: backTo(call.home.name) }).first().click();
      await expect(d.locator('section[aria-label="The line and what it allows"]')).toBeVisible();
      await expect(toolButton(d, call.home.id)).toBeFocused();
    }
    // a note begun during the call is still there when the doctor looks back at it
    await toolButton(d, 'notes').click();
    await expect(panel(d, 'notes').getByLabel('Reason for visit')).toHaveValue(/follow-up of a dressing/);
  });

  test('a decision waits for the line, and nothing is started for a patient nobody in the room examined', async ({ page }) => {
    const d = await intoTheCall(page);
    await d.locator('.tc-switch label').filter({ hasText: 'The call dropped' }).click();
    await toolButton(d, 'prescribe').click();
    const p = panel(d, 'prescribe');
    await expect(p.locator('.ctk-state')).toContainText(fill(kit.gates.lineDoesNotAllow, { tool: tool('prescribe').name }));
    // the doctor is told the line dropped on the tool itself, because the countdown is on the call
    const dropped = tele.connection.find((s: { id: string }) => s.id === 'dropped');
    await expect(p.locator('.ctk-urgent')).toContainText(dropped.doctorSees);
    await expect(p.locator('.ctk-panel-body')).toHaveAttribute('inert', '');
    await expect(toolButton(d, 'prescribe')).toContainText(kit.words.waiting);
    await page.screenshot({ path: `${shots}/waiting-${test.info().project.name}.png`, fullPage: true });

    await p.getByRole('button', { name: backTo('The call') }).first().click();
    await d.locator('.tc-switch label').filter({ hasText: 'Video and sound' }).click();
    await d.getByRole('button', { name: 'Ask to step out' }).first().click();
    await toolButton(d, 'prescribe').click();
    const unseen = tele.refusals.find((r: { id: string }) => r.id === 'first-prescription-unseen').sentence;
    await expect(p.locator('.ctk-state')).toContainText(unseen);
    await expect(p.locator('.ctk-panel-body')).toHaveCount(0);
    // and no certificate from a call alone, in the teleconsultation's own words
    await p.getByRole('button', { name: backTo('The call') }).first().click();
    await toolButton(d, 'sick-note').click();
    const certificate = tele.refusals.find((r: { id: string }) => r.id === 'certificate-from-a-call').sentence;
    await expect(panel(d, 'sick-note').locator('.ctk-state')).toContainText(certificate);
    await expect(panel(d, 'sick-note').locator('.sn')).toHaveCount(0);
  });

  test('a call that did not count as a consultation writes nothing up, and decides nothing from its tools', async ({ page }) => {
    const d = await intoTheCall(page);
    await d.locator('.tc-switch label').filter({ hasText: 'The call dropped' }).click();
    await d.getByRole('button', { name: /End without a decision/ }).click();
    await expect(d.getByRole('heading', { name: 'Interrupted and not resumed' })).toBeVisible();
    for (const id of ['notes', 'prescribe', 'refer']) {
      await toolButton(d, id).click();
      await expect(panel(d, id).locator('.ctk-state')).toContainText(fill(kit.gates.notAConsultation, { tool: tool(id).name }));
      await panel(d, id).getByRole('button', { name: backTo('The call') }).first().click();
    }
  });

  test('the record’s tools stand beside it on Consultation records', async ({ page }) => {
    await openWorkspace(page, 'Doctor');
    await goSection(page, 'Consultation records');
    const record = surface('consultation-record');
    const nav = page.getByRole('navigation', { name: record.heading });
    await expect(nav).toBeVisible();
    const ids = await nav.locator('button[data-tool]').evaluateAll(els => els.map(e => e.getAttribute('data-tool')));
    expect(ids).toEqual([record.home.id, ...record.tools]);
    await expect(page.locator('main .ctk-aside .lv-panel')).toBeVisible();
    await toolButton(page.locator('main'), 'refer').click();
    await expect(panel(page.locator('main'), 'refer').getByLabel('Refer to')).toBeVisible();
    await page.screenshot({ path: `${shots}/record-${test.info().project.name}.png`, fullPage: true });
    expect(await noOverflow(page)).toEqual([]);
  });
});

test.describe('the nurse in a visit', () => {
  test('the patient’s devices are live beside the visit once the code opens it, with her tools and none of a doctor’s', async ({ page }) => {
    test.setTimeout(90_000);
    await openWorkspace(page, 'Nurse');
    await page.locator('.care-offer').getByRole('button', { name: 'Accept this visit' }).click();
    await page.locator('.care-slot').getByRole('button', { name: 'Continue this visit' }).click();
    const d = page.getByRole('dialog');
    const visit = surface('care-visit');
    // on the road there are no tools and no devices: she reads them in the house she was let into
    await expect(d.getByRole('button', { name: 'I am at the door' })).toBeVisible();
    await expect(d.locator('.ctk')).toHaveCount(0);
    await expect(d.locator('.lv-panel')).toHaveCount(0);
    await d.getByRole('button', { name: 'I am at the door' }).click();
    await d.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
    await d.getByRole('button', { name: 'Start the visit' }).click();

    const nav = d.getByRole('navigation', { name: visit.heading });
    await expect(nav).toBeVisible();
    const ids = await nav.locator('button[data-tool]').evaluateAll(els => els.map(e => e.getAttribute('data-tool')));
    expect(ids).toEqual([visit.home.id, ...visit.tools]);
    // no prescription and no sick note to press — the contract's sentence where they would be
    for (const id of ['prescribe', 'sick-note', 'tests', 'refer']) await expect(toolButton(d, id)).toHaveCount(0);
    for (const r of visit.refused!) await expect(d.locator(`.ctk-refused [data-refused="${r.tool}"]`)).toContainText(r.sentence);
    await expect(d).toContainText(kit.refusals.find((r: { id: string }) => r.id === 'devices-from-the-door').sentence);

    // the same live panel the doctor has: the synthetic banner, the devices notice, readings that move, no score
    const devices = d.locator('.ctk-aside .lv-panel');
    await expect(devices.locator('.lv-banner')).toContainText(live.board.banner);
    await expect(devices.locator('.lv-banner')).toContainText(noticeFor('devices'));
    const first = (await values(devices)).join(' ');
    await expect.poll(async () => (await values(devices)).join(' '), { timeout: 12_000 }).not.toBe(first);
    for (const r of live.refusals) await expect(devices.locator(`.lv-refusal[data-refusal="${r.id}"]`)).toContainText(r.sentence);
    await expect(devices.locator('.ui-badge--danger, .ui-badge--warning, .ui-badge--success')).toHaveCount(0);
    await page.screenshot({ path: `${shots}/visit-${test.info().project.name}.png` });
    expect(await noOverflow(page)).toEqual([]);

    for (const id of visit.tools) {
      const t = tool(id);
      await toolButton(d, id).click();
      const p = panel(d, id);
      await expect(p.getByRole('heading', { name: t.name, exact: true })).toBeVisible();
      await expect(p.locator(id === 'devices' ? '.lv-banner' : '.not-connected').first()).toContainText(noticeFor(t.honesty.capability));
      if (id === 'refer-to-doctor') await expect(p).toContainText(fill(kit.gates.notYetAtHandover, { stage: care.stages.find((s: { id: string }) => s.id === 'checklist').name }));
      if (id === 'call-doctor') await expect(p).toContainText(tele.participants.find((x: { id: string }) => x.id === 'nurse').where);
      if (id === 'nurse-notes') await expect(p.getByLabel('Diagnosis')).toHaveCount(0);
      if (id === 'devices') await page.screenshot({ path: `${shots}/visit-devices-${test.info().project.name}.png` });
      expect(await noOverflow(page)).toEqual([]);
      await p.getByRole('button', { name: backTo(visit.home.name) }).first().click();
      await expect(d.getByRole('heading', { name: 'Checklist' })).toBeVisible();
    }
  });
});
