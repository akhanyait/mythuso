import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The field safety settings on the back office's Configuration tab, for the journeys that change them:
   the admin's own, and the nurse's, which changes a setting in the back office and then goes back to a
   visit already running. Every word is read from the contracts — the screen's from
   packages/catalog/settings.json, each timing's from packages/catalog/field-safety.json — so the helpers
   move with the contracts rather than carrying a copy of either. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
export const fieldSafety = json('../packages/catalog/field-safety.json');
export const settingsContract = json('../packages/catalog/settings.json');
export const say = settingsContract.screen as Record<string, string> & { editors: Record<string, string>; values: Record<string, string> };
export type Bound = { value: number; decidedBy: string | null; decidedOn?: string; proposedBy?: string };
export type TimingRow = {
  key: string; label: string; help: string; type: 'minutes' | 'list' | 'boolean' | 'roleList'; of?: string; unit: string | null; appliesTo: string;
  default: Omit<Bound, 'value'> & { value: number | number[] | boolean | string[] }; bounds: { lowest: Bound; highest: Bound };
  items?: { lowest: Bound; highest: Bound }; guardrail?: { statement: string };
  allowed?: (Omit<Bound, 'value'> & { value: boolean | string; label: string })[]; allowedRoles?: { roles: string[] };
  reviewRequired?: string;
};
export const timingRows = fieldSafety.settings.items as TimingRow[];
export const timingRow = (key: string) => timingRows.find(row => row.key === key)!;
export const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
/* "30 min", and a list of minutes as "10, 20, 30 min": the unit once, as the screen draws it. */
export const minutesText = (value: number | number[]) => fill(say.values.minutes, { value: Array.isArray(value) ? value.join(', ') : String(value) });
export const editorLabel = (row: { type: string; unit: string | null }) => fill(row.type === 'list' ? say.editors.list : say.editors[row.type], { unit: row.unit ?? '' });

/* The Configuration tab of a console that is already open, by the tab's own name on either viewport. */
export async function openConfiguration(page: Page) {
  await page.getByRole('button', { name: say.tab, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: say.tab })).toBeVisible();
}

export async function openSettingsPanel(page: Page): Promise<Locator> {
  await openConfiguration(page);
  const panel = page.getByRole('region', { name: fieldSafety.settings.heading });
  await expect(panel).toBeVisible();
  return panel;
}

export const timingItem = (panel: Locator, row: { label: string }) =>
  panel.locator('.ss-timing').filter({ has: panel.page().locator('strong', { hasText: new RegExp(`^${row.label}$`) }) });

export async function openChangeForm(panel: Locator, row: { label: string }): Promise<Locator> {
  const item = timingItem(panel, row);
  await item.getByRole('button', { name: `${say.change} ${row.label}` }).click();
  const form = item.getByRole('form', { name: `${say.change} ${row.label}` });
  await expect(form).toBeVisible();
  return form;
}

/* Review, then confirm: the only way through the screen, so the journeys walk it rather than a shortcut. */
export async function changeTiming(panel: Locator, row: TimingRow, from: number | number[] | boolean | string[], to: number | number[], reason: string) {
  const form = await openChangeForm(panel, row);
  await form.getByLabel(editorLabel(row), { exact: true }).fill(Array.isArray(to) ? to.join(', ') : String(to));
  await form.getByLabel(say.reason, { exact: true }).fill(reason);
  await form.getByRole('button', { name: say.review }).click();
  const confirm = form.getByRole('group', { name: fill(say.confirmQuestion, { setting: row.label, from: minutesText(from as number | number[]), to: minutesText(to) }) });
  await expect(confirm).toContainText(row.appliesTo);
  await confirm.getByRole('button', { name: say.confirm }).click();
  await expect(timingItem(panel, row).locator('.ss-in-force')).toContainText(minutesText(to));
}
