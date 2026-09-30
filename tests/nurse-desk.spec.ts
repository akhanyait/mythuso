import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openDestination, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The nurse's Reports, Clinical resources and Settings, and the two-pane Messages and two-column Academy,
 * on both viewports (30 September 2026).
 *
 * The Lovable export draws these with patient totals, percentages, a satisfaction score and export buttons;
 * guidelines with years and authorities and a referral form to download; an editable profile and a "Settings
 * saved"; an inbox with a reply box; and a course catalogue with "18 / 30" CPD points. The journeys prove the
 * arrangement arrived without any of that: every figure on Reports is the earnings register's or the
 * schedule's arithmetic, worked out again here from the contract; Resources lists the protocol register
 * under its own governance line and the knowledge base the patient reads; Settings reads and edits nothing;
 * and neither Messages nor the Academy has anything to type into or start. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const earnings = json('../packages/catalog/earnings.json');
const protocols = json('../packages/catalog/protocols.json');
const library = json('../packages/catalog/patient-pages.json').screens['health-library'];
type Line = { kind: string; service?: string };
const weeks: { state: string; lines: Line[] }[] = earnings.weeks;
const visitsOf = (lines: Line[]) => lines.filter(line => line.service).length;

test('Reports counts her own records and invents nothing', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 const screen = await openDestination(page, 'Reports');
 const tile = (label: string) => screen.locator('.nurse-tile').filter({ hasText: label });
 await expect(tile('Visits this week')).toContainText(String(visitsOf(weeks.find(w => w.state === 'accruing')!.lines)));
 await expect(tile('Visits on the register')).toContainText(String(weeks.reduce((sum, w) => sum + visitsOf(w.lines), 0)));
 await expect(tile('Visits on the register')).toContainText(`Across its ${weeks.length} weeks`);
 await expect(tile('Reversed lines')).toContainText(String(weeks.flatMap(w => w.lines).filter(l => l.kind === 'reversal').length));
 /* Today's schedule has three stops and none is signed at the start of a run. */
 await expect(tile('Signed off today')).toContainText('0 of 3');
 /* One bar per week on the register. */
 await expect(screen.locator('.nurse-route__weeks li')).toHaveCount(weeks.length);
 /* What the export draws and nothing here records. */
 await expect(screen).not.toContainText(/%|satisfaction|vaccination/i);
 await expect(screen.getByRole('button', { name: /export|pdf|download/i })).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('Clinical resources lists the protocol register and the knowledge base under their own words', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 const screen = await openDestination(page, 'Clinical resources');
 await expect(screen).toContainText(protocols.governance.ratificationProcess.note);
 await expect(screen).toContainText(library.lead);

 await screen.getByRole('tab', { name: 'Protocols' }).click();
 const rows = screen.locator('#nurse-resources-list li');
 await expect(rows).toHaveCount(protocols.protocols.length);
 /* Every protocol is a draft, and its badge says so in the register's word. */
 const draft = protocols.statuses.find((s: { id: string }) => s.id === 'draft');
 await expect(rows.first()).toContainText(draft.name);
 await expect(screen).toContainText(draft.detail);

 /* The search narrows the list and the count is the list's length. */
 await screen.getByRole('searchbox').fill('wound');
 const wound = protocols.protocols.filter((p: { name: string }) => p.name.toLowerCase().includes('wound')).length;
 await expect(rows).toHaveCount(wound);
 await expect(screen.getByRole('status')).toContainText(`${wound} ${wound === 1 ? 'entry' : 'entries'}`);
 await screen.getByRole('searchbox').fill('');

 /* A library entry opens in place, with its source beside it. */
 await screen.getByRole('tab', { name: 'Health library' }).click();
 await screen.getByRole('button', { name: 'Read' }).first().click();
 await expect(screen.locator('.nurse-desk__entry')).toHaveCount(1);
 await expect(screen.locator('#nurse-resources-list li').first()).toContainText('Source:');

 /* Forms is an empty state, and nothing on the screen downloads. */
 await screen.getByRole('tab', { name: 'Forms' }).click();
 await expect(screen).toContainText('There are no forms in this preview');
 await expect(screen.getByRole('button', { name: /download|view/i })).toHaveCount(0);
 await expect(screen.getByRole('link', { name: /download|pdf/i })).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('Settings reads her profile and edits nothing; Messages and the Academy keep their honest panes', async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 let screen = await openDestination(page, 'Settings');
 await expect(screen).toContainText(noticeFor('credential-verification'));
 await expect(screen).toContainText(noticeFor('messaging'));
 await expect(screen).toContainText('Sister Naledi Mokoena');
 await expect(screen).toContainText('SANC 20016688');
 await expect(screen.getByRole('textbox')).toHaveCount(0);
 await expect(screen.getByRole('checkbox')).toHaveCount(0);
 await expect(screen.getByRole('button', { name: /save/i })).toHaveCount(0);

 screen = await openDestination(page, 'Messages');
 await expect(screen.getByRole('heading', { name: 'Conversations' })).toBeVisible();
 await expect(screen).toContainText('No conversations.');
 await expect(screen.getByRole('textbox')).toHaveCount(0);

 screen = await openDestination(page, 'Academy');
 await expect(screen.getByRole('heading', { name: 'CPD record' })).toBeVisible();
 await expect(screen).toContainText('Nothing is recorded.');
 await expect(screen.getByRole('button', { name: /start|continue|certificate/i })).toHaveCount(0);
 await expect(screen).not.toContainText(/\d+\s*\/\s*\d+/);
 expect(errors).toEqual([]);
});
