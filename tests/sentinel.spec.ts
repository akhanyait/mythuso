import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openWorkspace } from './nav';

/* Sentinel tiers one to three and safeguarding reports, on both viewports.
 *
 * What these journeys hold is what makes Sentinel safe rather than finished: the nurse is told, in the contract's
 * sentence, that nothing is evaluated because no rule is ratified; the baseline the stale glucometer gave a reading to is
 * suspended and the recalled oximeter's readings have left; tier four is not offered and says why; a tier three the nurse
 * raises by hand reaches the Control Tower's board as a concern owned by a doctor; and a safeguarding concern the desk
 * records is open, held for an officer nobody holds yet, not sent, and never shows its kind on the desk's list.
 *
 * Every expected sentence and label is read from packages/catalog/sentinel.json, packages/catalog/apis/safety.json,
 * packages/catalog/closed-loop.json, packages/catalog/records.json and packages/catalog/vetting.json, so a reworded
 * sentence moves these tests with it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sentinel = json('../packages/catalog/sentinel.json');
const api = json('../packages/catalog/apis/safety.json') as { routes: { withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const closedLoop = json('../packages/catalog/closed-loop.json');
const records = json('../packages/catalog/records.json') as { observations: { measures: { id: string; label: string }[] } };
const vetting = json('../packages/catalog/vetting.json') as { roles: { id: string; name: string }[] };
const say = sentinel.screens.sentinel;
const report = sentinel.screens.report;
const desk = sentinel.screens.desk;
const safeguarding = sentinel.safeguarding;
const statement = (id: string) => api.routes.filter(r => !r.withdrawn).flatMap(r => r.refusals).find(r => r.id === id)!.statement;
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const measure = (id: string) => records.observations.measures.find(m => m.id === id)!.label;
const stateLabel = (id: string) => (sentinel.baselines.states as { id: string; label: string }[]).find(s => s.id === id)!.label;
const coreLoopRung = (sentinel.rungs as { rung: number; label: string; toldCode: string; whoIsTold: string }[]).find(r => r.toldCode === 'core-loop')!;

async function noSidewaysScroll(page: Page) {
 return page.evaluate(() => [document.documentElement, document.querySelector('main')]
  .filter((el): el is HTMLElement => Boolean(el)).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.tagName.toLowerCase()} ${el.scrollWidth}`));
}

test('the nurse is told Sentinel is not evaluated and why, sees a suspended baseline and readings a recall took out, and is not offered tier four', async ({ page }) => {
 await openWorkspace(page, 'Nurse');
 await goSection(page, 'Thuso Kit');
 const region = page.getByRole('region', { name: say.heading, exact: true });
 await expect(region).toBeVisible();
 await expect(region.getByText(say.evaluation, { exact: true }).first()).toBeVisible();
 await expect(region).toContainText(sentinel.evaluation.reasons.find((r: { id: string }) => r.id === 'no-ratified-rule').sentence);

 /* The glucometer the kit screen shows as stale gave its baseline a reading, so that baseline is suspended. */
 await expect(region.getByRole('listitem', { name: measure('glucose'), exact: true })).toContainText(stateLabel('suspended'));
 /* Every reading from the recalled oximeter left its baseline, and was not deleted. */
 await expect(region.getByRole('listitem', { name: measure('oxygen'), exact: true })).toContainText(fill(say.leftByRecall, { count: '1' }));
 /* The thermometer's poor sample carried no weight, so it opened no baseline. */
 await expect(region.getByRole('listitem', { name: measure('temperature'), exact: true })).toHaveCount(0);

 await expect(region.getByRole('radio')).toHaveCount(sentinel.rungs.length);
 await expect(region.getByRole('note').filter({ hasText: say.tierFourHeading })).toContainText(statement(sentinel.tierFour.refusal));
 expect(await noSidewaysScroll(page)).toEqual([]);
});

test('a tier three a nurse raises by hand reaches the Control Tower as a concern owned by a doctor', async ({ page }) => {
 await openWorkspace(page, 'Control Tower');
 await goSection(page, 'Incidents');
 const board = page.getByRole('region', { name: closedLoop.screen.heading });
 await expect(board).toBeVisible();
 const before = await board.locator('.cl-row').count();

 await chooseRole(page, 'Nurse');
 await goSection(page, 'Thuso Kit');
 const region = page.getByRole('region', { name: say.heading, exact: true });
 const form = region.locator('form.sn-raise');
 /* Nothing chosen is not a tier raised. */
 await expect(form.getByRole('button', { name: say.raise })).toBeDisabled();
 await form.locator('select').selectOption({ index: 1 });
 await form.getByRole('radio', { name: new RegExp(coreLoopRung.label) }).check();
 await form.getByRole('button', { name: say.raise }).click();
 await expect(form.getByRole('status')).toContainText(coreLoopRung.whoIsTold);
 await expect(region.locator('.sn-raised')).toContainText(coreLoopRung.label);

 await chooseRole(page, 'Control Tower');
 await goSection(page, 'Incidents');
 await expect(board.locator('.cl-row')).toHaveCount(before + 1);
 const doctor = vetting.roles.find(role => role.id === closedLoop.sentinel.ownerRole.value)!.name;
 await expect(board.locator('.cl-row').filter({ hasText: fill(closedLoop.screen.from, { engine: 'Safety' }) }).filter({ hasText: doctor }).first()).toBeVisible();
});

test('a safeguarding concern the desk records is refused without a choice, then open, held for the officer and not sent, and the desk list never shows its kind', async ({ page }) => {
 await openWorkspace(page, 'Control Tower');
 await goSection(page, 'Incidents');
 const section = page.getByRole('region', { name: report.heading });
 await expect(section).toBeVisible();
 await section.getByRole('button', { name: report.record }).click();
 await expect(section.getByRole('alert')).toContainText(statement('safeguarding-group-not-declared'));

 const group = safeguarding.groups[1];
 const category = safeguarding.categories[0];
 await section.locator('select').nth(0).selectOption({ label: group.label });
 await section.locator('select').nth(1).selectOption({ label: category.label });
 await section.getByRole('button', { name: report.record }).click();
 const recorded = section.getByRole('status');
 await expect(recorded).toContainText(safeguarding.statutory.notSent);
 await expect(recorded).toContainText(safeguarding.officer.heldFor);
 await expect(recorded).toContainText(safeguarding.neverAutoCloses);
 await expect(recorded).toContainText(safeguarding.statutory.mayApply.find((m: { group: string }) => m.group === group.id).sentence);
 await expect(recorded).not.toContainText(category.label);

 const list = page.getByRole('region', { name: desk.heading });
 const row = list.locator('.sg-desk-row').first();
 await expect(row).toContainText(group.label);
 await expect(row).toContainText(safeguarding.statutory.notSent);
 await expect(list).not.toContainText(category.label);
 expect(await noSidewaysScroll(page)).toEqual([]);
});
