import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openDestination, openWorkspace } from './nav';

/* The staff shell after the Lovable export (30 September 2026), for the nurse and the doctor, on both viewports.
 *
 * The export gives both a sidebar of labelled groups with every destination first-class, a top bar with a search, a
 * bell and a profile chip, and a band above every page. What this proves is the honest form of each:
 *
 *   the navigation   every screen that was a "More tools" dialog is a destination — in its group in the sidebar, or
 *                    on a phone behind a More tab whose hub lists it under the same label — and the foot-of-board
 *                    link navigates to it rather than opening a second presentation of it;
 *   the jump         finds this workspace's screens by name and goes there, by keyboard, and says it searches
 *                    nothing else;
 *   the bell         opens Messages, with no count on it;
 *   the profile      a disclosure holding the credential line and the way out, closed by Escape and by a press
 *                    outside it;
 *   the band         there only while something is actually waiting — a care offer, a visit past its check-out, a
 *                    Sentinel tier raised to this queue — in the contract's own words, and absent otherwise.
 *
 * Every sentence the band is expected to say is read from packages/catalog, not typed here. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const safety = json('../packages/catalog/field-safety.json');
const sentinel = json('../packages/catalog/sentinel.json');
const care = json('../packages/catalog/care.json');
const services = json('../packages/catalog/services.json') as { id: string; name: string; duration: number }[];
const medicines = json('../packages/catalog/medicines.json');
const rung = (toldCode: string) => (sentinel.rungs as { rung: number; label: string; toldCode: string; whoIsTold: string }[]).find(r => r.toldCode === toldCode)!;

/* The screens each role reached only through a "More tools" dialog before this change, and the groups they sit in
   now. 'Clinical protocols' is not among the doctor's: it was a second door into Protocols, which is one destination. */
const promoted = {
  Nurse: { 'Locum shifts': 'Field operations', Team: 'Field operations', Academy: 'Practice', Messages: 'Practice', [medicines.screen.handover.heading]: 'Care delivery' },
  Doctor: { 'Referral pathway': 'Patient care', [medicines.screen.prescribe.heading]: 'Patient care', [medicines.screen.results.heading]: 'Patient care', 'Per-case fees': 'Practice', 'Claim draft': 'Practice', Messages: 'Practice' }
} as const;
const opensOn = { Nurse: 'Schedule', Doctor: 'Review queue' } as const;

const band = (page: Page) => page.getByRole('region', { name: 'Waiting for you' });
const isPhone = async (page: Page) => !(await page.getByRole('navigation', { name: 'Main navigation' }).isVisible());
async function noSidewaysScroll(page: Page) {
  return page.evaluate(() => [document.documentElement, document.querySelector('main'), document.querySelector('.topbar')]
    .filter((el): el is HTMLElement => Boolean(el)).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}`));
}

for (const role of ['Nurse', 'Doctor'] as const) {
  test(`the ${role.toLowerCase()}'s tools are destinations: in labelled groups on a wide screen, behind More on a phone`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await openWorkspace(page, role);
    if (!(await isPhone(page))) {
      const nav = page.getByRole('navigation', { name: 'Main navigation' });
      for (const [name, group] of Object.entries(promoted[role])) {
        await expect(nav.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true })).toBeVisible();
      }
      if (role === 'Doctor') await expect(nav.getByRole('button', { name: 'Clinical protocols' })).toHaveCount(0);
    } else {
      const bar = page.getByRole('navigation', { name: 'Primary' });
      /* Four destinations and More: twelve icons in 390px is twelve icons nobody can tell apart. */
      await expect(bar.getByRole('button')).toHaveCount(5);
      await bar.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
      for (const [name, group] of Object.entries(promoted[role])) {
        await expect(page.getByRole('region', { name: group, exact: true }).locator('.menu-row').filter({ hasText: name })).toBeVisible();
      }
      /* A destination reached through the hub keeps More current, so she can see which tab she is under. */
      await page.locator('.menu-row').filter({ hasText: 'Messages' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
      await expect(bar.getByRole('button', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'page');
      await goSection(page, opensOn[role]);
    }
    /* The link at the foot of the board goes to the same page, not a dialog: one screen, one presentation. */
    await page.locator('.tool-link').filter({ hasText: 'Messages' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await noSidewaysScroll(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`the ${role.toLowerCase()}'s jump finds this workspace's screens by name, by keyboard, and searches nothing else`, async ({ page }) => {
    await openWorkspace(page, role);
    /* On a phone the field lives at the top of the More hub; from 1000px it is in the top bar. */
    if (await isPhone(page)) await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More', exact: true }).click();
    const box = page.getByRole('combobox', { name: 'Jump to a screen in this workspace' });
    await box.click();
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await box.fill('mess');
    const list = page.getByRole('listbox', { name: 'Screens in this workspace' });
    await expect(list.getByRole('option').first()).toHaveText(/Messages/);
    await expect(box.locator('xpath=..').getByText('It does not search patients, records or messages.')).toBeVisible();
    /* Nothing by that name is said in words rather than shown as an empty box. */
    await box.fill('Thando Mokoena');
    await expect(list.getByRole('option')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'No screen in this workspace is called' })).toBeVisible();
    await box.press('Escape');
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await box.fill('');
    const [typed, target] = role === 'Doctor' ? ['claim', 'Claim draft'] : ['acad', 'Academy'];
    await box.pressSequentially(typed);
    await box.press('ArrowDown');
    await expect(list.getByRole('option', { selected: true })).toContainText(target);
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: target })).toBeVisible();
    expect(await noSidewaysScroll(page)).toEqual([]);
  });

  test(`the ${role.toLowerCase()}'s bell opens Messages with no count, and the profile holds the credential and the way out`, async ({ page }) => {
    await openWorkspace(page, role);
    const bell = page.getByRole('button', { name: 'Open Messages' });
    await expect(bell).toHaveText('');
    await bell.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();

    const chip = page.locator('.staff-profile__chip');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    const box = await chip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await chip.click();
    const panel = page.locator('.staff-profile__panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.staff-credential')).toContainText(/checks|register|withdrawn/i);
    /* Escape closes it and hands focus back to the chip. */
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(chip).toBeFocused();
    /* A press anywhere else closes it too. */
    await chip.click();
    await expect(panel).toBeVisible();
    /* In the page's side gutter, which nothing on either viewport draws into. */
    const size = page.viewportSize()!;
    await page.mouse.click(size.width - 6, size.height / 2);
    await expect(panel).toBeHidden();
    /* And leaving from it lands on the patient application, which has no staff chrome at all. */
    await chip.click();
    await panel.getByRole('button', { name: 'Leave this workspace' }).click();
    await expect(page.locator('.staff-topbar')).toHaveCount(0);
    expect(await noSidewaysScroll(page)).toEqual([]);
  });
}

test('the partner has no bell, because it has no Messages to open', async ({ page }) => {
  await openWorkspace(page, 'Partner');
  await expect(page.getByRole('button', { name: 'Open Messages' })).toHaveCount(0);
});

test('the nurse sees a waiting care offer above every page but her day, and nothing once she has answered it', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  /* On her day the offer card is the thing itself, so the band does not repeat it — and nothing else is waiting. */
  await expect(band(page)).toHaveCount(0);
  await goSection(page, 'Academy');
  const service = services.find(s => s.id === care.preview.serviceId)!;
  await expect(band(page)).toContainText('A visit offered to you');
  await expect(band(page)).toContainText(service.name);
  await band(page).getByRole('button', { name: 'Go to Schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Where you are going/ }).or(page.locator('.care-offer')).first()).toBeVisible();
  await page.locator('.care-offer').getByRole('button', { name: 'Decline' }).click();
  await goSection(page, 'Academy');
  await expect(page.getByRole('heading', { level: 1, name: 'Academy' })).toBeVisible();
  await expect(band(page)).toHaveCount(0);
});

test('the nurse is told on every page when her own visit is past its check-out, in the contract\'s words, until she checks out', async ({ page }) => {
  const START = new Date('2026-09-15T08:00:00+02:00');
  const grace = safety.settings.items.find((s: { key: string }) => s.key === 'grace').default.value as number;
  const clock = (d: Date) => d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
  const visitMinutes = services[0].duration;
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(band(page).filter({ hasText: safety.nurse.heading })).toHaveCount(0);

  await page.clock.fastForward((visitMinutes + grace + 1) * 60_000);
  const overdue = safety.states.timer.find((s: { id: string }) => s.id === 'overdue').label;
  const due = new Date(START.getTime() + (visitMinutes + grace) * 60_000);
  const item = page.getByRole('alert').filter({ hasText: `${safety.nurse.heading} · ${overdue}` });
  await expect(item).toContainText(safety.nurse.overdue.replace('{since}', clock(due)));
  await goSection(page, 'Team');
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Go to Schedule' }).click();

  await page.getByRole('button', { name: 'Start this visit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: safety.nurse.checkOut }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('alert').filter({ hasText: safety.nurse.heading })).toHaveCount(0);
});

test('a Sentinel tier raised by hand is in the band of the queue it reaches, and in no other', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  await expect(band(page)).toHaveCount(0);

  await chooseRole(page, 'Nurse');
  await goSection(page, 'Thuso Kit');
  const region = page.getByRole('region', { name: sentinel.screens.sentinel.heading, exact: true });
  const form = region.locator('form.sn-raise');
  for (const toldCode of ['nurse-queue', 'core-loop']) {
    await form.locator('select').selectOption({ index: 1 });
    await form.getByRole('radio', { name: new RegExp(rung(toldCode).label) }).check();
    await form.getByRole('button', { name: sentinel.screens.sentinel.raise }).click();
    await expect(form.getByRole('status')).toContainText(rung(toldCode).whoIsTold);
  }
  /* Where she raised it, the list is the thing itself; anywhere else, the band. Tier three is Core's concern, owned by
     a doctor, so it is not in hers. */
  await goSection(page, 'Academy');
  await expect(band(page)).toContainText(rung('nurse-queue').label);
  await expect(band(page)).toContainText(rung('nurse-queue').whoIsTold);
  await expect(band(page)).not.toContainText(rung('core-loop').label);

  await chooseRole(page, 'Doctor');
  await expect(band(page)).toContainText(rung('core-loop').label);
  await expect(band(page)).not.toContainText(rung('nurse-queue').label);
  await band(page).getByRole('button', { name: 'Go to Patient context' }).click();
  await expect(band(page)).toHaveCount(0);
});

test('with many destinations the sidebar\'s navigation scrolls inside itself and the way out stays on the screen', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'The sidebar is a wide-screen layout.');
  await page.setViewportSize({ width: 1440, height: 720 });
  await openWorkspace(page, 'Doctor');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const scrolls = await nav.evaluate(el => el.scrollHeight > el.clientHeight);
  expect(scrolls).toBe(true);
  await expect(page.locator('.sidebar .settings-link').filter({ hasText: 'Leave this workspace' })).toBeInViewport();
  await expect(page.locator('.sidebar .staff-id')).toBeInViewport();
  /* The last destination is reachable by scrolling the list, not the page. */
  const last = nav.getByRole('button').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await openDestination(page, 'Claim draft');
});
