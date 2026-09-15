import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';
/* MyThuso for Mom Essential, end to end, on both viewports: a daughter asks for it for her mother, the mother agrees as
 * herself, a voucher pays the first month, the mother books the visit the month includes, and the daughter sees what the
 * mother chose to let her see — the day and "Care was given" by default, the service and a shared summary only when the
 * mother says so.
 *
 * Every sentence, name and state is read from the contracts: packages/catalog/mom-essential.json, the plan's names from
 * Money's settings defaults, programmes.json's lists, vouchers.json's words and the accept route's refusal. The
 * household's first names are the preview household's, as the sponsor spec reads them. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const essential = json('packages/catalog/mom-essential.json');
const money = json('packages/catalog/money.json');
const programmes = json('packages/catalog/programmes.json');
const vouchers = json('packages/catalog/vouchers.json');
const services = json('packages/catalog/services.json') as { id: string; name: string }[];
const moneyApi = json('packages/catalog/apis/money.json') as { routes: { path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const byDefault = (key: string) => (money.settings.items as { key: string; default: { value: unknown } }[]).find(s => s.key === key)!.default.value as string;
const momPlans = json('packages/catalog/mom-plans.json') as { nameFrom: string; tiers: { id: string; nameFrom: string }[] };
/* The plan and tier names as Money's settings default them, which is what the journey reads when nobody has changed them. */
const planName = `${byDefault(momPlans.nameFrom)} ${byDefault(momPlans.tiers.find(t => t.id === essential.planCode)!.nameFrom)}`;
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const words = { plan: planName, parent: 'Nomsa', sponsor: 'Lerato' };
const say = (text: string) => fill(text, words);
const stateOf = (id: string) => (essential.states as { id: string; name: string; sponsorWords: string; parentWords: string }[]).find(s => s.id === id)!;
const onlyTheParent = moneyApi.routes.find(r => r.path === '/v1/money/plan-subscriptions/{subscriptionRef}/accept' && r.version === 1)!.refusals.find(r => r.id === essential.agreement.refusal)!.statement;
const includedService = services.find(s => s.id === (essential.included as { serviceId?: string }[]).find(i => i.serviceId)!.serviceId)!;

const noSidewaysScroll = async (page: Page) => page.evaluate(() =>
  [document.documentElement, ...document.querySelectorAll('main, section.me')]
    .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`));

/* Care plans, the journey opened under the plan, asked for, agreed to as the mother, and paid with the plan voucher. */
async function startedPlan(page: Page, choose: { named: boolean; share: boolean }) {
  await page.goto('/app/');
  await goSection(page, 'Care plans');
  await page.getByRole('button', { name: fill(essential.screen.open, { plan: planName }) }).click();
  const journey = page.locator('section.me');
  await expect(journey.getByRole('heading', { name: say(essential.screen.sponsor.heading) })).toBeVisible();
  await expect(journey.getByText(say(essential.screen.actingSponsor))).toBeVisible();
  await expect(journey.getByText(noticeFor('payments'))).toBeVisible();

  await journey.getByRole('button', { name: say(essential.screen.sponsor.ask) }).click();
  await expect(journey.getByText(say(stateOf('awaiting-parent').sponsorWords))).toBeVisible();
  /* A sponsor has no control for agreeing: the route's refusal stands where the button would be. */
  await expect(journey.getByText(onlyTheParent)).toBeVisible();
  await expect(journey.getByRole('button', { name: say(essential.screen.parent.agree) })).toHaveCount(0);

  await journey.getByRole('button', { name: say(essential.screen.sponsor.openAsParent) }).click();
  await expect(journey.getByText(say(essential.screen.actingParent))).toBeVisible();
  await expect(journey.getByText(say(stateOf('awaiting-parent').parentWords))).toBeVisible();
  const named = (programmes.sponsor.lineDetail as { id: string; name: string }[]).find(d => d.id === 'service-named')!;
  if (choose.named) await journey.getByRole('radio', { name: named.name }).check();
  if (choose.share) await journey.getByRole('checkbox', { name: say(essential.sharing.summaries.label) }).check();
  await journey.getByRole('button', { name: say(essential.screen.parent.agree) }).click();
  await journey.getByRole('button', { name: say(essential.screen.parent.backToSponsor) }).click();
  await expect(journey.getByText(say(stateOf('awaiting-payment').sponsorWords))).toBeVisible();

  /* The first month, with the voucher a simulated shop issued towards the plan. */
  await journey.getByRole('radio', { name: say(essential.screen.sponsor.voucher) }).check();
  await expect(journey.getByText(vouchers.screen.issuedInPreview.split('{code}')[0].trim(), { exact: false })).toBeVisible();
  await journey.getByRole('button', { name: essential.screen.sponsor.pay }).click();
  await expect(journey.getByText(vouchers.screen.covered)).toBeVisible();
  await expect(journey.locator('.me-state-name')).toHaveText(stateOf('active').name);
  await expect(journey.getByRole('heading', { name: say(essential.screen.sponsor.view) })).toBeVisible();

  /* The mother books the visit the month includes. */
  await journey.getByRole('button', { name: say(essential.screen.sponsor.openAsParent) }).click();
  await journey.getByRole('button', { name: essential.screen.parent.book }).click();
  await expect(journey.getByText(essential.screen.parent.booked.split('{hour}')[1], { exact: false })).toBeVisible();
  await journey.getByRole('button', { name: say(essential.screen.parent.backToSponsor) }).click();
  return journey;
}

test('a sponsor asks for Essential for her mother, the mother agrees as herself, a voucher pays the month, and the sponsor sees only the day', async ({ page }) => {
  const journey = await startedPlan(page, { named: false, share: false });
  await expect(journey.locator('.me-lines td')).toHaveText(essential.screen.sponsor.careGiven);
  await expect(journey).not.toContainText(includedService.name);
  await expect(journey.getByText(say(essential.sharing.summaries.none))).toBeVisible();
  for (const never of programmes.sponsor.neverSees as { what: string }[]) await expect(journey.getByText(never.what, { exact: true })).toBeVisible();
  await expect(journey.getByText(essential.notBuilt)).toBeVisible();
  expect(await noSidewaysScroll(page)).toEqual([]);
});

test('with the mother\'s choice and her grant, the sponsor sees which service it was and that her summaries are shared, and still no summary', async ({ page }) => {
  const journey = await startedPlan(page, { named: true, share: true });
  await expect(journey.locator('.me-lines td')).toHaveText(includedService.name);
  await expect(journey.getByText(essential.sharing.summaries.shared.split('{until}')[0].replace('{parent}', words.parent).trim(), { exact: false })).toBeVisible();
  await expect(journey.getByText(say(essential.sharing.summaries.none))).toHaveCount(0);
  expect(await noSidewaysScroll(page)).toEqual([]);
});
