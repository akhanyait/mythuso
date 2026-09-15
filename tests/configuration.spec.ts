import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, openAdminConsole, openWorkspace } from './nav';
import { changeTiming, editorLabel, fieldSafety, fill, minutesText, openChangeForm, openConfiguration, openSettingsPanel, say, settingsContract, timingItem, timingRow, type Bound, type TimingRow } from './safety-settings';

/* Configuration, on the back office, on both viewports.
 *
 * The founder instructed on 15 September 2026 that the questions the programme kept asking become admin
 * settings, and this is where an admin changes them. The journeys check what makes that safe rather than
 * what makes it look finished: every engine's settings are drawn from its own contract, each saying what
 * is in force, its default and who decided it, what an admin may set — itself a proposal — what a change
 * reaches and what no value may do; a change is refused in the contract's own sentence when it is nought,
 * out of bounds, the wrong kind of value, unexplained, unchanged, or steps out of order; a confirmed change
 * is added to the setting's history with who and why and is what the next visit, panic or offer reads;
 * and something already under way — a visit, an offer on a nurse's screen — keeps what it started with.
 *
 * This folds in tests/safety-settings.spec.ts, which walked the field safety panel on the Operations tab
 * before the panel moved here, and keeps every one of its assertions. Every sentence, minute and bound is
 * read from the contracts, so a new default or bound moves these journeys with it instead of breaking them.
 *
 * Set CONFIG_SHOTS to a directory to have the journeys leave the screenshots a reviewer looks at. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const care = json('../packages/catalog/care.json');
const services = json('../packages/catalog/services.json') as { duration: number }[];
const safetyApi = json('../packages/catalog/apis/safety.json') as { routes: { path: string; withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const roleName = (id: string): string => (json('../packages/catalog/vetting.json').roles as { id: string; name: string }[]).find(r => r.id === id)!.name;
const visitCode: string = care.preview.visitCode;
const shared = (id: string) => (settingsContract.refusals as { route: string; id: string; statement: string }[]).find(r => r.route === 'change' && r.id === id)!.statement;
const safetyOwn = (id: string) => safetyApi.routes.find(r => r.path === '/v1/safety/setting-changes' && !r.withdrawn)!.refusals.find(r => r.id === id)!.statement;
/* How the screen reads a value of each type these journeys meet. A setting of a type not here fails the first
   journey loudly, so the journey is taught the type rather than passing by skipping it. */
type Window = { post: string; days: string[]; from: string; to: string };
const dayName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
/* A rota reads as each window's post, days and hours, every day when a window names all seven. */
const windowsText = (row: TimingRow, windows: Window[]) => windows.length ? windows.map(w => fill(say.values.window, {
  post: row.posts!.find(post => post.id === w.post)!.label,
  days: w.days.length === settingsContract.days.length ? say.values.everyDay : w.days.map(dayName).join(', '),
  from: w.from, to: w.to
})).join('; ') : say.values.noWindows;
const valueText = (row: TimingRow, value: unknown): string => {
  if (row.type === 'minutes' || (row.type === 'list' && row.of === 'minutes')) return minutesText(value as number | number[]);
  if (row.type === 'count') return fill(say.values.count, { value: String(value), unit: row.unit ?? '' });
  if (row.type === 'boolean') return row.allowed?.find(choice => choice.value === value)?.label ?? (value ? say.values.on : say.values.off);
  if (row.type === 'enum') return row.allowed!.find(choice => choice.value === value)!.label;
  if (row.type === 'roleList') return (value as string[]).map(roleName).join(', ');
  if (row.type === 'schedule') return windowsText(row, value as Window[]);
  throw new Error(`${row.key} is a ${row.type}, which this journey does not read yet.`);
};
/* A bound reads in its own setting's unit: minutes for a timing, characters or hours for a count. */
const limitsTexts = (row: TimingRow): string[] => [
  ...(row.posts ? [fill(say.posts, { posts: row.posts.map(post => post.role === null ? fill(say.postWithoutRole, { post: post.label }) : post.label).join(', ') })] : []),
  ...(row.bounds ? [fill(say.range, { lowest: valueText(row, row.bounds.lowest.value), highest: valueText(row, row.bounds.highest.value) })] : []),
  ...(row.allowed ? [fill(say.choices, { values: row.allowed.map(choice => choice.label).join(', ') })] : []),
  ...(row.allowedRoles ? [fill(say.roles, { roles: row.allowedRoles.roles.map(roleName).join(', ') })] : []),
  ...(row.items ? [fill(say.listLength, { lowest: String(row.items.lowest.value), highest: String(row.items.highest.value) })] : [])
];
const sources = (settingsContract.sources as { engine: string; file: string }[]).map(s => ({ engine: s.engine, block: json(`../${s.file}`).settings as { heading: string; intro: string; items: TimingRow[] } }));
const total = String(sources.reduce((sum, s) => sum + s.block.items.length, 0));
const expiry = (care.settings.items as TimingRow[]).find(s => s.key === 'offer-expiry')!;
const closedLoop = json('../packages/catalog/closed-loop.json');
const escalationRota = (closedLoop.settings.items as TimingRow[]).find(s => s.key === closedLoop.escalation.rotaSetting)!;

const MINUTE = 60_000;
const START = new Date('2026-09-15T08:00:00+02:00');
const later = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);
const dayOf = (on: string) => new Date(`${on}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
const clock = (date: Date) => date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });
/* The offer card's own clock, as apps/web/src/features/CareVisit.tsx draws it. */
const offerClock = (date: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
const provenance = (p: Omit<Bound, 'value'>) => p.decidedBy && p.decidedOn ? fill(say.decided, { who: p.decidedBy, on: dayOf(p.decidedOn) }) : say.undecided;
const group = (page: Page, heading: string) => page.getByRole('region', { name: heading });
const shoot = async (page: Page, name: string, info: TestInfo) => {
  if (process.env.CONFIG_SHOTS) await page.screenshot({ path: `${process.env.CONFIG_SHOTS}/${name}-${info.project.name}.png`, fullPage: true });
};
const noOverflow = (page: Page) => page.evaluate(() =>
  [document.documentElement, document.querySelector('main')].filter((el): el is HTMLElement => Boolean(el)).every(el => el.scrollWidth <= el.clientWidth + 1));

async function openSettings(page: Page) {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  await openConfiguration(page);
  return page.locator('.cf-area');
}

test('every engine’s settings are drawn from its contract: in force, the default and who decided it, what an admin may set, what a change reaches and what no value may do', async ({ page }, info) => {
  const area = await openSettings(page);
  await expect(area).toContainText(say.intro);
  await expect(area).toContainText(say.preview);
  await expect(area.locator(':scope > .ss-version')).toHaveText(fill(say.shown, { shown: total, total }));
  for (const { block } of sources) {
    const panel = group(page, block.heading);
    await expect(panel).toContainText(block.intro);
    await expect(panel).toContainText(fill(say.version, { version: '1' }));
    for (const row of block.items) {
      const item = timingItem(panel, row);
      await expect(item.locator('.ss-in-force')).toContainText(valueText(row, row.default.value));
      await expect(item).toContainText(row.help);
      await expect(item).toContainText(fill(say.defaultIs, { value: valueText(row, row.default.value) }));
      await expect(item).toContainText(provenance(row.default));
      for (const limit of limitsTexts(row)) await expect(item).toContainText(limit);
      /* Only limits that carry a provenance are said to be proposals; a rota's posts carry none and are said to be neither. */
      const carriesProvenance = Boolean(row.bounds || row.allowed || row.allowedRoles || row.items || (row as { maxLength?: unknown }).maxLength);
      if (carriesProvenance) await expect(item).toContainText(say.limitsAreProposals);
      else await expect(item).not.toContainText(say.limitsDecided);
      await expect(item).toContainText(row.appliesTo);
      if (row.guardrail) await expect(item).toContainText(row.guardrail.statement);
      await expect(item).toContainText(say.neverChanged);
      await expect(item.locator('summary')).toHaveText(`${say.historyHeading} (0)`);
      /* A default that waits on a clinical review and names no reviewer is shown as not reviewed from the first
         load, because nobody has reviewed it; everything else never says it. */
      if (row.reviewRequired && !row.default.reviewedBy) await expect(item).toContainText(say.notReviewed);
      else await expect(item).not.toContainText(say.notReviewed);
    }
  }
  expect(await noOverflow(page), 'the Configuration area scrolls sideways').toBe(true);
  await shoot(page, 'configuration', info);
});

test('a search or an engine narrows the settings, and it says so when nothing matches', async ({ page }) => {
  const area = await openSettings(page);
  const status = area.locator(':scope > .ss-version');
  const search = area.getByLabel(say.search, { exact: true });
  const grace = timingRow('grace');
  await search.fill(grace.label);
  await expect(status).toHaveText(fill(say.shown, { shown: '1', total }));
  await expect(timingItem(group(page, fieldSafety.settings.heading), grace)).toBeVisible();
  await expect(group(page, care.settings.heading)).toHaveCount(0);

  await search.fill('');
  await area.getByLabel(say.engine, { exact: true }).selectOption({ label: care.settings.heading });
  await expect(group(page, fieldSafety.settings.heading)).toHaveCount(0);
  await expect(timingItem(group(page, care.settings.heading), expiry)).toBeVisible();
  await search.fill('a setting nobody has made');
  await expect(area).toContainText(say.noMatch);
});

test('a change is refused in the contract’s words: out of bounds, nought, the wrong kind of value, no reason, no change, steps out of order', async ({ page }, info) => {
  await openSettings(page);
  const panel = group(page, fieldSafety.settings.heading);
  const grace = timingRow('grace');
  const form = await openChangeForm(panel, grace);
  const value = form.getByLabel(editorLabel(grace), { exact: true });
  const reason = form.getByLabel(say.reason, { exact: true });
  const review = () => form.getByRole('button', { name: say.review }).click();
  await value.fill(String(grace.bounds.lowest.value - 1));
  await reason.fill('Trying a shorter wait than the bounds allow.');
  await review();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-out-of-range'));
  await shoot(page, 'configuration-refused', info);
  await value.fill('0');
  await review();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-not-above-zero'));
  await value.fill('soon');
  await review();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-value-wrong-type'));
  await value.fill(String(grace.bounds.highest.value));
  await reason.fill('');
  await review();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-change-without-reason'));
  await value.fill(String(grace.default.value));
  await reason.fill('Putting it back as it was.');
  await review();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-unchanged'));
  await form.getByRole('button', { name: say.cancel }).click();

  const steps = timingRow('extension-steps');
  const stepsForm = await openChangeForm(panel, steps);
  await stepsForm.getByLabel(editorLabel(steps), { exact: true }).fill(`${steps.bounds.highest.value}, ${steps.bounds.lowest.value}`);
  await stepsForm.getByLabel(say.reason, { exact: true }).fill('Largest first.');
  await stepsForm.getByRole('button', { name: say.review }).click();
  await expect(stepsForm.getByRole('alert')).toHaveText(safetyOwn('extension-steps-not-rising'));

  await expect(timingItem(panel, grace).locator('summary')).toHaveText(`${say.historyHeading} (0)`);
  await expect(panel).toContainText(fill(say.version, { version: '1' }));
});

test('a confirmed change is recorded with who and why, and the next visit a nurse starts reads it', async ({ page }, info) => {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  const panel = await openSettingsPanel(page);
  const grace = timingRow('grace');
  const from = grace.default.value as number;
  const to = grace.bounds.lowest.value;
  const reason = 'Dressings are finishing inside the booked time, so the desk can look for a nurse sooner.';
  await changeTiming(panel, grace, from, to, reason);

  await expect(panel).toContainText(fill(say.version, { version: '2' }));
  await expect(panel).toContainText(fill(say.applied, { version: '2', at: clock(START) }));
  const item = timingItem(panel, grace);
  await item.locator('summary').click();
  const history = item.locator('table tbody tr');
  await expect(history).toHaveCount(1);
  for (const cell of [minutesText(from), minutesText(to), reason]) await expect(history.first()).toContainText(cell);
  await expect(history.first().locator('td').nth(1)).not.toBeEmpty();
  await expect(item).toContainText(say.historyNeverEdited);
  await expect(item).toContainText(fill(say.defaultIs, { value: minutesText(from) }));
  await expect(item).not.toContainText(say.neverChanged);
  /* An opened history's table scrolls inside the setting rather than widening it past the screen. */
  expect(await item.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'an opened history widens the setting past its card').toBe(true);
  expect(await noOverflow(page), 'an opened history scrolls the page sideways').toBe(true);
  await shoot(page, 'configuration-history', info);

  /* The same tab, as the nurse: the visit she starts now is timed by the grace in force. */
  await chooseRole(page, 'Nurse');
  await page.getByRole('button', { name: 'Start this visit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Visit code, digit 1 of 6').fill(visitCode);
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Confirm identity' }).click();
  const strip = dialog.getByRole('region', { name: new RegExp(`^${fieldSafety.nurse.heading}`) });
  await expect(strip).toContainText(fill(fieldSafety.nurse.due, { due: clock(later(services[0].duration + to)) }));
});

test('an offer already on a nurse’s screen keeps the expiry it was made with when an admin changes it', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Nurse');
  const card = page.locator('.care-offer');
  const made = offerClock(later(expiry.default.value as number));
  await expect(card).toContainText(made);

  await chooseRole(page, 'Back office');
  await openConfiguration(page);
  const longer = expiry.bounds.highest.value;
  await changeTiming(group(page, care.settings.heading), expiry, expiry.default.value, longer, 'Nurses in the outer suburbs need longer to read an offer.');

  await chooseRole(page, 'Nurse');
  await expect(card).toContainText(made);
  await expect(card).not.toContainText(offerClock(later(longer)));
});

test('the next offer made reads the expiry in force', async ({ page }) => {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  await openConfiguration(page);
  const longer = expiry.bounds.highest.value;
  await changeTiming(group(page, care.settings.heading), expiry, expiry.default.value, longer, 'Nurses in the outer suburbs need longer to read an offer.');
  await chooseRole(page, 'Nurse');
  await expect(page.locator('.care-offer')).toContainText(offerClock(later(longer)));
});

test('the Operations tab keeps the way to the field safety settings, and opens Configuration on them alone', async ({ page }) => {
  await openAdminConsole(page);
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  await expect(page.locator('#main')).toContainText(say.operationsNote);
  await page.getByRole('button', { name: say.operationsOpen }).click();
  await expect(page.getByRole('heading', { level: 1, name: say.tab })).toBeVisible();
  await expect(group(page, fieldSafety.settings.heading)).toBeVisible();
  await expect(group(page, care.settings.heading)).toHaveCount(0);
  await expect(page.getByLabel(say.engine, { exact: true })).toHaveValue('safety');
});

test('the escalation rota is edited window by window: a gap is refused in the contract’s words, a post nobody holds is never offered, and a moved shift is confirmed', async ({ page }, info) => {
  await openSettings(page);
  const panel = group(page, closedLoop.settings.heading);
  const from = escalationRota.default.value as unknown as Window[];
  const form = await openChangeForm(panel, escalationRota);
  const editor = form.getByRole('group', { name: say.editors.schedule, exact: true });
  const reason = form.getByLabel(say.reason, { exact: true });
  const unheld = escalationRota.posts!.filter(post => post.role === null);
  for (const post of unheld) await expect(editor.getByRole('option', { name: post.label, exact: true })).toHaveCount(0);

  /* The second window is the desk's afternoon: without it, the desk is empty from two to ten. */
  await editor.getByRole('button', { name: say.editors.removeWindow }).nth(1).click();
  await reason.fill('One long desk shift instead of two.');
  await form.getByRole('button', { name: say.review }).click();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-schedule-leaves-a-gap'));
  await form.getByRole('button', { name: say.cancel }).click();

  const again = await openChangeForm(panel, escalationRota);
  const until = again.getByRole('group', { name: say.editors.schedule, exact: true }).getByLabel(say.editors.to, { exact: true }).first();
  const to = from.map((w, i) => i === 0 ? { ...w, to: '15:00' } : w);
  await until.fill('15:00');
  await again.getByLabel(say.reason, { exact: true }).fill('The morning desk stays an hour into the afternoon shift for the handover.');
  await again.getByRole('button', { name: say.review }).click();
  const confirm = again.getByRole('group', { name: fill(say.confirmQuestion, { setting: escalationRota.label, from: windowsText(escalationRota, from), to: windowsText(escalationRota, to) }) });
  await expect(confirm).toContainText(escalationRota.appliesTo);
  await shoot(page, 'configuration-rota', info);
  await confirm.getByRole('button', { name: say.confirm }).click();
  await expect(timingItem(panel, escalationRota).locator('.ss-in-force')).toContainText(windowsText(escalationRota, to));
  await expect(panel).toContainText(fill(say.version, { version: '2' }));
  expect(await noOverflow(page), 'the rota editor scrolls the page sideways').toBe(true);
});

test('who changes the field safety settings, and which window a stale panic opens, are changed in their own editors and refused in the contract’s words', async ({ page }, info) => {
  await openSettings(page);
  const panel = group(page, fieldSafety.settings.heading);
  const changers = timingRow('settings-changed-by');
  const form = await openChangeForm(panel, changers);
  const roles = form.getByRole('group', { name: say.editors.roleList });
  const reason = form.getByLabel(say.reason, { exact: true });
  await roles.getByRole('checkbox', { name: roleName('admin'), exact: true }).uncheck();
  await reason.fill('Nobody should hold these.');
  await form.getByRole('button', { name: say.review }).click();
  await expect(form.getByRole('alert')).toHaveText(shared('setting-out-of-range'));
  await roles.getByRole('checkbox', { name: roleName('admin'), exact: true }).check();
  await roles.getByRole('checkbox', { name: roleName('operator'), exact: true }).check();
  await reason.fill('The Control Tower operator holds the desk overnight.');
  await form.getByRole('button', { name: say.review }).click();
  const both = `${roleName('admin')}, ${roleName('operator')}`;
  const confirmRoles = form.getByRole('group', { name: fill(say.confirmQuestion, { setting: changers.label, from: roleName('admin'), to: both }) });
  await expect(confirmRoles).toContainText(changers.appliesTo);
  await shoot(page, 'configuration-roles', info);
  await confirmRoles.getByRole('button', { name: say.confirm }).click();
  await expect(timingItem(panel, changers).locator('.ss-in-force')).toContainText(both);

  const stale = timingRow('stale-panic-window-uses-window-in-force');
  const on = stale.allowed!.find(choice => choice.value === true)!;
  const off = stale.allowed!.find(choice => choice.value === false)!;
  const staleForm = await openChangeForm(panel, stale);
  await staleForm.getByRole('radio', { name: off.label, exact: true }).check();
  await staleForm.getByLabel(say.reason, { exact: true }).fill('Nurses are told a window before they press, and should get it.');
  await staleForm.getByRole('button', { name: say.review }).click();
  const confirmStale = staleForm.getByRole('group', { name: fill(say.confirmQuestion, { setting: stale.label, from: on.label, to: off.label }) });
  await confirmStale.getByRole('button', { name: say.confirm }).click();
  await expect(timingItem(panel, stale).locator('.ss-in-force')).toContainText(off.label);
  await expect(panel).toContainText(fill(say.version, { version: '3' }));
  expect(await noOverflow(page), 'the roles and choice editors scroll the page sideways').toBe(true);
});

/* Clinical scope. Who may be offered an injection is an admin setting that waits on a clinical review: the
   admin's change is in force at once and says it is not clinically reviewed, a doctor confirms that exact
   value from her review queue — refused without a reason, in the contract's sentence — and only that
   setting stops saying it. Every word is the contracts'. */
const reviewRefusal = (id: string) => (settingsContract.refusals as { route: string; id: string; statement: string }[]).find(r => r.route === 'review' && r.id === id)!.statement;
const REVIEW_PANEL = 'Settings waiting for clinical review';

test('an admin narrows who may be offered an injection, Configuration says it is not clinically reviewed, and a doctor confirms it', async ({ page }, info) => {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  await openConfiguration(page);
  const careItems = care.settings.items as TimingRow[];
  const injections = careItems.find(s => s.key === 'injection-roles')!;
  const planning = careItems.find(s => s.key === 'family-planning-roles')!;
  const panel = group(page, care.settings.heading);
  const item = timingItem(panel, injections);
  await expect(item).toContainText(say.notReviewed);

  const from = valueText(injections, injections.default.value);
  const to = roleName('nurse');
  const reason = 'Locum indemnity does not yet name injections.';
  const form = await openChangeForm(panel, injections);
  await form.getByRole('group', { name: say.editors.roleList }).getByRole('checkbox', { name: roleName('locum'), exact: true }).uncheck();
  await form.getByLabel(say.reason, { exact: true }).fill(reason);
  await form.getByRole('button', { name: say.review }).click();
  const confirm = form.getByRole('group', { name: fill(say.confirmQuestion, { setting: injections.label, from, to }) });
  await expect(confirm).toContainText(say.notReviewed);
  await confirm.getByRole('button', { name: say.confirm }).click();
  await expect(item.locator('.ss-in-force')).toContainText(to);
  await expect(item).toContainText(say.notReviewed);
  await shoot(page, 'configuration-not-reviewed', info);

  await chooseRole(page, 'Doctor');
  const reviews = page.getByRole('region', { name: REVIEW_PANEL });
  const card = reviews.locator('.sr-item').filter({ has: page.locator('strong', { hasText: new RegExp(`^${injections.label}$`) }) });
  await expect(card).toContainText(say.notReviewed);
  for (const text of [from, to, reason, fill(say.version, { version: '2' })]) await expect(card).toContainText(text);
  const confirmReview = card.getByRole('button', { name: `Confirm the clinical review of ${injections.label}` });
  await confirmReview.click();
  await expect(card.getByRole('alert')).toHaveText(reviewRefusal('setting-review-without-reason'));
  await card.getByLabel('Why this value is clinically safe', { exact: true }).fill('Inside a registered nurse’s general scope while locum indemnity is confirmed.');
  await confirmReview.click();
  await expect(card).toHaveCount(0);
  await expect(reviews.getByRole('status')).toContainText(injections.label);
  await expect(reviews.locator('.sr-item').filter({ has: page.locator('strong', { hasText: new RegExp(`^${planning.label}$`) }) })).toContainText(say.notReviewed);
  expect(await noOverflow(page), 'the review panel scrolls the page sideways').toBe(true);
  await shoot(page, 'doctor-setting-reviews', info);

  await chooseRole(page, 'Back office');
  await openConfiguration(page);
  const reviewed = timingItem(group(page, care.settings.heading), injections);
  await expect(reviewed).not.toContainText(say.notReviewed);
  await expect(reviewed.locator('.cf-review')).toContainText('D-401');
  await expect(timingItem(group(page, care.settings.heading), planning)).toContainText(say.notReviewed);
});
