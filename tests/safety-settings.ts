import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The field safety settings panel, for the two journeys that use it: the admin's own, and the nurse's,
   which changes a setting in the back office and then goes back to a visit already running. Every word
   is read from packages/catalog/field-safety.json, so the helpers move with the contract. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
export const fieldSafety = json('../packages/catalog/field-safety.json');
export const say = fieldSafety.settings.screen as Record<string, string>;
export type TimingRow = { id: string; label: string; defaultFrom: string; shape: 'minutes' | 'steps'; lowest: { value: number }; highest: { value: number } };
export const timingRows = fieldSafety.settings.timings as TimingRow[];
export const timingRow = (id: string) => timingRows.find(row => row.id === id)!;
export const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const minutesText = (value: number | number[]) => fill(say.minutes, { minutes: Array.isArray(value) ? value.join(', ') : String(value) });

/* The Operations tab of a console that is already open. */
export async function openSettingsPanel(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
  const panel = page.getByRole('region', { name: say.heading });
  await expect(panel).toBeVisible();
  return panel;
}

export const timingItem = (panel: Locator, row: TimingRow) =>
  panel.locator('.ss-timing').filter({ has: panel.page().locator('strong', { hasText: new RegExp(`^${row.label}$`) }) });

export async function openChangeForm(panel: Locator, row: TimingRow): Promise<Locator> {
  const item = timingItem(panel, row);
  await item.getByRole('button', { name: `${say.change} ${row.label}` }).click();
  const form = item.getByRole('form', { name: `${say.change} ${row.label}` });
  await expect(form).toBeVisible();
  return form;
}

/* Review, then confirm: the only way through the panel, so the journeys walk it rather than a shortcut. */
export async function changeTiming(panel: Locator, row: TimingRow, from: number | number[], to: number | number[], reason: string) {
  const form = await openChangeForm(panel, row);
  await form.getByLabel(row.shape === 'steps' ? say.newSteps : say.newMinutes).fill(Array.isArray(to) ? to.join(', ') : String(to));
  await form.getByLabel(say.reason).fill(reason);
  await form.getByRole('button', { name: say.review }).click();
  const confirm = form.getByRole('group', { name: fill(say.confirmQuestion, { setting: row.label, from: minutesText(from), to: minutesText(to) }) });
  await expect(confirm).toContainText(say.appliesFrom);
  await confirm.getByRole('button', { name: say.confirm }).click();
  await expect(timingItem(panel, row).locator('.ss-in-force')).toContainText(minutesText(to));
}
