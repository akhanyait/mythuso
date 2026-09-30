import { test, expect, type Page } from '@playwright/test';
import { noticeFor } from './notices';
import { goSection, openModule, openWorkspace } from './nav';
import { patientScreenRoutes } from '../apps/web/src/lib/patient-screens-routes';
/* Thuso Kit: pairing, capture, the offline queue and the four conflicts a queue actually produces.
   The point of these three journeys is not that the screens render. It is that a reading carries
   where it came from — device, hand or patient — all the way from the instrument to the
   consultation record, and that the queue refuses to merge anything on its own. */
const overflow = (page: Page) => page.evaluate(() => { const el = document.querySelector('main') ?? document.documentElement; return el.scrollWidth <= el.clientWidth; });
/* In the nurse's workspace, where the capture tool belongs. Until 30 September 2026 this journey reached it
   through the patient's roadmap card, which opened the nurse's tool in a dialog — "Capturing as: Nurse" on a
   patient's screen. That card opens Connected devices now (the last journey below), and the tool is the
   nurse's Thuso Kit section: the same component, drawn in her main rather than in a dialog. The journey is
   scoped to that component rather than to main, because her section also carries the kit's registry, whose
   own "Instrument" region a label search would find as well; every assertion it made is still made. */
test('kit surface: pair, capture, queue, all four conflicts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Thuso Kit');
  const d = page.locator('main .kit-surface');
  await expect(d.locator('.not-connected')).toContainText(noticeFor('devices'));
  await expect(d.getByText(/This queue is held in memory/)).toBeVisible();
  // pairing
  await d.getByRole('button', { name: 'Look for instruments' }).click();
  await expect(d.getByText('MT-GL-1157 · Bluetooth Low Energy')).toBeVisible();
  await expect(d.getByText('Calibration overdue').first()).toBeVisible();
  await d.locator('.kit-device').filter({ hasText: 'Glucose meter' }).getByRole('button', { name: 'Pair' }).click();
  // capture: the note is on screen, and the strip lot gates the reading while the calibration does not
  await d.getByLabel('Instrument').selectOption({ index: 1 });
  await expect(d.getByText(/Strips expire separately from the meter/).first()).toBeVisible();
  await expect(d.getByText(/days past its calibration date/).first()).toBeVisible();
  await d.getByLabel('What to measure').selectOption('glucose');
  await expect(d.getByRole('button', { name: 'Take a reading' })).toBeDisabled();
  await d.getByLabel('Which strip lot, and when does it expire?').selectOption('Lot 23K902 · expired Jun 2026');
  await d.getByRole('button', { name: 'Take a reading' }).click();
  await expect(d.getByText('Invented reading · nothing was measured')).toBeVisible();
  await d.getByRole('button', { name: 'Hold it on this device' }).click();
  await d.getByRole('button', { name: /Finish and seal/ }).click();
  await expect(overflow(page)).resolves.toBe(true);
  // send
  await expect(d.getByRole('button', { name: /^Send/ })).toBeDisabled();
  await d.getByRole('button', { name: 'Connection: off' }).click();
  await d.getByRole('button', { name: /^Send/ }).click();
  // in flight first: the send settles on a timer, and asserting the outcome without waiting for the
  // state in between raced the timer under a loaded machine
  await expect(d.getByText('Sending').first()).toBeVisible({ timeout: 5000 });
  await expect(d.getByText('Two readings, one observation').first()).toBeVisible({ timeout: 8000 });
  await expect(d.getByText(/The capturer.s standing lapsed/)).toBeVisible();
  await expect(d.getByText(/The instrument's own clock is|The instrument’s own clock is/).first()).toBeVisible();
  // duplicate: choose one, other superseded
  const dup = d.locator('.kit-conflict').filter({ hasText: 'Two readings, one observation' }).first();
  await dup.locator('.panel').filter({ hasText: 'Arrived from the queue' }).getByRole('button', { name: 'This one stands' }).click();
  await expect(d.getByText(/marked superseded/).first()).toBeVisible();
  // lapsed nurse: refused countersigner, then a cleared one
  const lapsed = d.locator('.kit-conflict').filter({ hasText: /The capturer.s standing lapsed/ });
  await lapsed.getByLabel('Countersigned by').selectOption('D-402');
  await expect(lapsed.getByRole('button', { name: 'Countersign and file' })).toBeDisabled();
  await lapsed.getByLabel('Countersigned by').selectOption('D-401');
  await lapsed.getByRole('button', { name: 'Countersign and file' }).click();
  await expect(d.getByText(/stays on the reading as the person who took it/).first()).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});
test('assessment carries provenance through to the consultation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirm identity' }).click();
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Start observations' }).click();
  await d.getByLabel('Blood pressure — systolic').fill('165');
  await expect(d.locator('.obs-field').filter({ hasText: 'systolic' }).locator('.prov-manual').first()).toBeVisible();
  await d.getByLabel('Blood pressure — diastolic').fill('95');
  await expect(d.getByText('Mean arterial pressure')).toBeVisible();
  // patient-reported re-attribution
  await d.getByLabel('Blood glucose').fill('12');
  const glucose = d.locator('.obs-field').filter({ hasText: 'Blood glucose' });
  await glucose.getByRole('button', { name: 'She told me this' }).click();
  await expect(glucose.locator('.prov-patient-reported')).toBeVisible();
  // device capture into the assessment
  await d.getByRole('button', { name: 'Take a reading from a paired instrument' }).click();
  await d.getByRole('button', { name: 'Look for instruments' }).click();
  await d.locator('.kit-device').filter({ hasText: 'Pulse oximeter' }).getByRole('button', { name: 'Pair' }).click();
  await d.getByLabel('Instrument').selectOption({ index: 1 });
  await d.getByLabel('What to measure').selectOption('oxygen');
  await d.getByLabel('Where is the probe, and how is the trace?').selectOption({ index: 1 });
  await d.getByRole('button', { name: 'Take a reading' }).click();
  await d.getByRole('button', { name: 'Add to the assessment' }).click();
  const ox = d.locator('.obs-field').filter({ hasText: 'Oxygen saturation' });
  await expect(ox.locator('.prov-device')).toBeVisible();
  await expect(ox.locator('.calib-due')).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  await d.getByRole('button', { name: 'Record findings' }).click();
  await d.getByRole('button', { name: 'Review sign-off' }).click();
  await expect(d.getByText('165 mmHg ⚠')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Sign assessment' })).toBeEnabled();
  await d.getByRole('button', { name: 'Sign assessment' }).click();
  await d.getByRole('button', { name: /Open the consultation record/ }).click();
  await expect(d.getByText('Blood pressure — systolic')).toBeVisible();
  /* The row a reading stands on in the record, whichever shape the record draws it in — a review line, or since
     the consultation record's restyle a list item. What is held is the fact, not the markup: the oxygen saturation
     reached the record still saying a device took it. */
  await expect(d.locator(':is(.review-line, li)').filter({ hasText: 'Oxygen saturation' }).locator('.prov-device').first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('patient file vitals carry origins', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  /* The patient file is the doctor's patient-context section now, not a workspace in the picker. */
  await openWorkspace(page, 'Doctor');
  await goSection(page, 'Patient context');
  await expect(page.locator('.pf-vital').filter({ hasText: 'Blood pressure' }).locator('.prov-device')).toBeVisible();
  await expect(page.locator('.pf-vital').filter({ hasText: 'Weight' }).locator('.prov-patient-reported')).toBeVisible();
  await expect(overflow(page)).resolves.toBe(true);
  expect(errors).toEqual([]);
});

/* The patient's door. The roadmap's Thuso Kit card lands on Connected devices — what the kit would read and
   where a reading came from — and no screen a patient can reach draws the nurse's capture tool. */
test('the patient\'s Thuso Kit card opens Connected devices, never the capture tool', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/');
  await openModule(page, 'Thuso Kit');
  await expect(page).toHaveTitle(`${patientScreenRoutes.devices.opens} · MyThuso`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Capturing as')).toHaveCount(0);
  /* And from the page it lands on, the kit's own button opens what the kit would read, not the tool. */
  await page.getByRole('button', { name: 'What the kit would read' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Capturing as')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* Every destination the patient's navigation offers, each reached the way a person reaches it, and none of
   them draws the capture tool. The names are read from the sidebar the page renders (in the document on a
   phone too, only not displayed), so a row added later is swept without this list being edited. */
test('no screen in the patient\'s navigation renders the capture tool', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app/');
  const names = await page.evaluate(() => [...document.querySelectorAll('.psb-nav .ui-nav-item__label')].map(label => label.textContent ?? ''));
  expect(names.length).toBeGreaterThan(30);
  for (const name of names) {
    await goSection(page, name);
    await expect(page).toHaveTitle(`${name} · MyThuso`);
    await expect(page.getByText('Capturing as'), name).toHaveCount(0);
  }
});

/* What reached the record, on the kit's deck, drawn as the readiness ring beside it is: one arc per reading on this
   device, the stored ones lit, and the two counts in words beside it — never a share. Both counts are held to the
   six-state board further down the same screen, which counts the same entries, before and after a send moves some
   of them; and under reduced motion nothing on the card is animating at all. */
test('the deck draws what reached the record as a ring of two counts, counted off the queue', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const states = (JSON.parse(readFileSync(new URL('../packages/catalog/capture.json', import.meta.url), 'utf8')) as { captureStates: { id: string; name: string }[] }).captureStates;
  const nameOf = (id: string) => states.find(s => s.id === id)!.name;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Thuso Kit');
  const kit = page.locator('main .kit-surface');
  const card = kit.locator('.nurse-reached');
  const board = kit.locator('.nt-state-board .nt-state');
  const counted = async () => {
    await expect(board).toHaveCount(states.length);
    const rows = await board.evaluateAll(els => els.map(el => ({ name: el.querySelector('.kit-state-name')?.textContent ?? '', n: Number(el.querySelector('.nt-state-count')?.textContent ?? 0) })));
    return { stored: rows.find(r => r.name === nameOf('stored'))!.n, deciding: rows.find(r => r.name === nameOf('conflicted'))!.n, total: rows.reduce((sum, r) => sum + r.n, 0) };
  };
  const agrees = async () => {
    const { stored, deciding, total } = await counted();
    await expect(card.locator('.nurse-readiness__key dd').first()).toHaveText(`${stored} of ${total} on this device`);
    await expect(card.locator('.nurse-ring__figure strong')).toHaveText(String(stored));
    await expect(card.locator('.nurse-ring__figure small')).toHaveText(`of ${total}`);
    await expect(card.locator('path.nurse-ring__arc')).toHaveCount(total);
    await expect(card.locator('path.nurse-ring__arc.on')).toHaveCount(stored);
    if (deciding) await expect(card).toContainText(`${deciding} ${deciding === 1 ? 'needs' : 'need'} a decision`);
    await expect(card).not.toContainText('%');
    expect(await card.evaluate(el => el.getAnimations({ subtree: true }).length), 'the ring is still under reduced motion').toBe(0);
    return { stored, total };
  };
  const first = await agrees();
  await kit.getByRole('button', { name: 'Connection: off' }).click();
  await kit.getByRole('button', { name: /^Send/ }).click();
  await expect(kit.getByText('Two readings, one observation').first()).toBeVisible({ timeout: 8000 });
  const second = await agrees();
  expect(second.total).toBe(first.total);
  expect(second.stored).toBeGreaterThan(first.stored);
});
