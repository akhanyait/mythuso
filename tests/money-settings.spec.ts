import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openAdminConsole } from './nav';
import { fill, openChangeForm, openConfiguration, say, settingsContract } from './safety-settings';

/* Money's settings, changed on the back office and read where they matter, on both viewports.
 *
 * The founder instructed on 15 September 2026 that open questions become admin settings. These journeys
 * hold that a change made on the Configuration tab reaches the screens that read it — the patient's MyThuso
 * for Mom panel, the doctor's per-case fee and the nurse's earnings — in the same tab and without a reload,
 * and that what no value may do is refused in the contract's own sentence before anything is in force:
 * wording that drops the sentence priority SOS must keep, and a nurse's share worded as a fraction.
 *
 * The fee journey holds the rule that matters most: a proposal pays nobody, and a payout is scheduled only
 * once an admin has confirmed the fee. Every label, value and sentence is read from the contracts, so a new
 * default or bound moves these journeys with it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
type Choice = { value: unknown; label: string };
type Row = {
  key: string; label: string; type: string; unit?: string | null; appliesTo: string; default: { value: unknown };
  bounds?: { lowest: { value: number }; highest: { value: number } }; allowed?: Choice[]; parts?: Row[]; mustKeep?: { words: string }[];
};
const money = json('packages/catalog/money.json') as { settings: { heading: string; items: Row[] }; doctorFees: { name: string; confirmed: string }[]; sampleCases: unknown[] };
const moneyApi = json('packages/catalog/apis/money.json') as { routes: { path: string; refusals: { id: string; statement: string }[] }[] };
const plans = json('packages/catalog/mom-plans.json') as { nameFrom: string; callOuts: { counts: string[]; one: string; many: string; per: Record<string, string> } };
const row = (key: string) => money.settings.items.find(s => s.key === key)!;
const shared = (id: string) => (settingsContract.refusals as { route: string; id: string; statement: string }[]).find(r => r.route === 'change' && r.id === id)!.statement;
const own = (id: string) => moneyApi.routes.find(r => r.path === '/v1/money/setting-changes')!.refusals.find(r => r.id === id)!.statement;

/* How the Configuration tab reads each kind of value, and how the doctor's screen formats cents. */
const labelOf = (r: Row, value: unknown) => r.allowed!.find(choice => choice.value === value)!.label;
const quoted = (text: unknown) => `“${String(text)}”`;
const randOnConfiguration = (cents: number) => fill(say.values.moneyCents, { rand: (cents / 100).toFixed(2) });
const randOnScreen = (cents: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
const recordText = (r: Row, value: Record<string, unknown>) => r.parts!.map(part =>
  `${part.label} ${part.type === 'count' ? fill(say.values.count, { value: String(value[part.key]), unit: part.unit ?? '' }) : labelOf(part, value[part.key])}`).join(' · ');
/* "Two urgent nurse call-outs a year", read into mom-plans.json's words as the plan screen reads it. */
const callOutsText = (count: number, period: string) => `${plans.callOuts.counts[count - 1]} ${count === 1 ? plans.callOuts.one : plans.callOuts.many} ${plans.callOuts.per[period]}`;

async function moneySettings(page: Page) {
  await openAdminConsole(page);
  await openConfiguration(page);
  const panel = page.getByRole('region', { name: money.settings.heading });
  await expect(panel).toBeVisible();
  return panel;
}

/* Review, then confirm, as the screen asks: the confirmation names the setting, what it was, what it will be
   and what the change reaches, in the setting's own words. */
async function confirmChange(form: Locator, r: Row, from: string, to: string, reason: string) {
  await form.getByLabel(say.reason, { exact: true }).fill(reason);
  await form.getByRole('button', { name: say.review }).click();
  const confirm = form.getByRole('group', { name: fill(say.confirmQuestion, { setting: r.label, from, to }) });
  await expect(confirm).toContainText(r.appliesTo);
  await confirm.getByRole('button', { name: say.confirm }).click();
  await expect(form).toHaveCount(0);
}

test('Plus’s call-outs, the stacking and a tier’s name changed by an admin reach the plan a patient opens next, and SOS wording without its promise is refused', async ({ page }) => {
  const panel = await moneySettings(page);

  const calls = row('plus-urgent-callouts');
  const [countPart, periodPart] = calls.parts!;
  const before = calls.default.value as { count: number; period: string };
  const after = { count: Math.min(before.count + 1, countPart!.bounds!.highest.value), period: periodPart!.allowed!.find(choice => choice.value !== before.period)!.value as string };
  const callsForm = await openChangeForm(panel, calls);
  const parts = callsForm.getByRole('group', { name: say.editors.record });
  await parts.getByLabel(`${countPart!.label} (${countPart!.unit})`, { exact: true }).fill(String(after.count));
  await parts.getByRole('radio', { name: labelOf(periodPart!, after.period), exact: true }).check();
  await confirmChange(callsForm, calls, recordText(calls, before), recordText(calls, after), 'Families on Plus asked for their call-outs to be counted over the year.');

  const stack = row('tiers-stack');
  const stackForm = await openChangeForm(panel, stack);
  await stackForm.getByRole('radio', { name: labelOf(stack, !stack.default.value), exact: true }).check();
  await confirmChange(stackForm, stack, labelOf(stack, stack.default.value), labelOf(stack, !stack.default.value), 'Each tier should list only what it names while the tiers are being reworded.');

  const plusName = row('tier-name-plus');
  const renamed = `${plusName.default.value} Care`;
  const nameForm = await openChangeForm(panel, plusName);
  await nameForm.getByLabel(say.editors.text, { exact: true }).fill(renamed);
  await confirmChange(nameForm, plusName, quoted(plusName.default.value), quoted(renamed), 'The tier is called by what it brings.');

  /* What priority SOS means may be reworded, and never without the sentence it must keep. */
  const sos = row('priority-sos-wording');
  const sosForm = await openChangeForm(panel, sos);
  await sosForm.getByLabel(say.editors.text, { exact: true }).fill('When you press SOS, you are seen before anybody else.');
  await sosForm.getByLabel(say.reason, { exact: true }).fill('Shorter wording for the plan card.');
  await sosForm.getByRole('button', { name: say.review }).click();
  await expect(sosForm.getByRole('alert')).toHaveText(shared('setting-text-loses-a-guardrail'));
  await sosForm.getByRole('button', { name: say.cancel }).click();

  /* The same tab, as the patient: the plan is read afresh from the settings in force. */
  await chooseRole(page, 'Patient');
  await goSection(page, 'Care plans');
  const planName = String(row(plans.nameFrom).default.value);
  const section = page.getByRole('region', { name: planName });
  const choices = section.getByRole('group', { name: `${planName} plans` }).getByRole('button');
  await expect(choices.nth(1)).toContainText(renamed);
  await choices.nth(1).click();
  await expect(section.getByRole('heading', { name: new RegExp(`What ${renamed} would bring`) })).toBeVisible();
  await expect(section.locator('[data-inclusion="urgent-call-out"]')).toHaveText(callOutsText(after.count, after.period));
  await expect(section.locator('.mom-inherits')).toHaveCount(0);
  await expect(section.locator('[data-inclusion="priority-sos"]')).toHaveCount(0);
  await choices.nth(2).click();
  await expect(section.locator('[data-inclusion="priority-sos"]')).toContainText(String(sos.default.value));
});

test('a fee an admin sets and confirms reaches the doctor’s screen, and a payout is scheduled only then', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const panel = await moneySettings(page);
  const fee = row('doctor-case-fee');
  const to = fee.bounds!.highest.value;
  const feeForm = await openChangeForm(panel, fee);
  await feeForm.getByLabel(say.editors.moneyCents, { exact: true }).fill((to / 100).toFixed(2));
  await confirmChange(feeForm, fee, randOnConfiguration(fee.default.value as number), randOnConfiguration(to), 'The review panel lead agreed the top of the range for the pilot.');

  const confirmed = row('doctor-fee-confirmed');
  const confirmForm = await openChangeForm(panel, confirmed);
  await confirmForm.getByRole('radio', { name: labelOf(confirmed, true), exact: true }).check();
  await confirmChange(confirmForm, confirmed, labelOf(confirmed, false), labelOf(confirmed, true), 'The fee in force is agreed, so doctors may be paid at it.');

  await chooseRole(page, 'Doctor');
  await page.locator('.tool-link').filter({ hasText: 'Per-case fees' }).click();
  const d = page.getByRole('dialog');
  const words = money.doctorFees[0]!;
  await expect(d.locator('.review-line').filter({ hasText: words.name })).toContainText(randOnScreen(to));
  await expect(d.getByText(words.confirmed)).toBeVisible();
  const cases = money.sampleCases.length;
  await expect(d.locator('table tbody tr').filter({ hasText: randOnScreen(to) })).toHaveCount(cases);
  await expect(d.locator('table tbody')).not.toContainText('not confirmed');
  await d.getByRole('button', { name: /Schedule this week’s payout/ }).click();
  await expect(d.locator('.review-line[role="status"]')).toContainText(randOnScreen(to * cases));
  await expect(d.locator('.earn-refusal')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a nurse’s share reworded by an admin reaches her earnings, and wording that states a fraction is refused in Money’s own sentence', async ({ page }) => {
  const panel = await moneySettings(page);
  const share = row('nurse-share-sentence');
  const form = await openChangeForm(panel, share);
  const wording = form.getByLabel(say.editors.text, { exact: true });
  await wording.fill('Your share is three quarters of what the patient paid.');
  await form.getByLabel(say.reason, { exact: true }).fill('Say it the way the landing page does.');
  await form.getByRole('button', { name: say.review }).click();
  await expect(form.getByRole('alert')).toHaveText(own('share-wording-states-a-fraction'));

  const reworded = 'Most of what a patient pays for a visit is yours, and every visit shows it to the rand.';
  await wording.fill(reworded);
  await confirmChange(form, share, quoted(share.default.value), quoted(reworded), 'Nurses asked for the sentence to say who the money is for first.');

  await chooseRole(page, 'Nurse');
  /* The nurse workspace arrives on a dynamic import. goSection picks the sidebar or the tab bar by which one
     is visible, so it is asked only once the workspace has drawn the section it goes to. */
  await expect(page.getByRole('button', { name: 'Earnings & payouts', exact: true }).first()).toBeVisible();
  await goSection(page, 'Earnings & payouts');
  const rule = page.locator('[data-rule="share-is-not-reduced"]');
  await expect(rule).toContainText(reworded);
  await expect(rule).not.toContainText(String(share.default.value));
});
