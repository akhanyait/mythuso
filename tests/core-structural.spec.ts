import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* Two of Core's Wave 6 structural routes, previewed rather than called: the protocol registry's read,
 * where every version answers draft with no content because nobody holds medical-director yet, and
 * GET /v1/core/audit-exports@1's own bound, checked in the Control Tower against the audit-export-max-
 * days setting rather than a number typed into the screen. Every sentence is read from
 * packages/catalog/protocols.json and packages/catalog/apis/core.json, so a reworded refusal moves
 * these journeys with it.
 */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const protocols = json('../packages/catalog/protocols.json') as { protocols: { id: string; name: string; version: number; status: string }[] };
const coreApi = json('../packages/catalog/apis/core.json') as { routes: { method: string; path: string; withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const first = protocols.protocols[0]!;
const rangeTooWide = coreApi.routes.find(r => r.method === 'GET' && r.path === '/v1/core/audit-exports' && !r.withdrawn)!.refusals.find(x => x.id === 'range-too-wide')!.statement;

test('a doctor reads a protocol version from the registry and sees it is a draft with no content', async ({ page }) => {
 await openWorkspace(page, 'Doctor');
 await goSection(page, 'Protocols');
 /* The registry is a list of rows since 30 September 2026 (the Lovable export's arrangement), not a select:
    a row is chosen by the version it names, and the read-back it gives is unchanged. Every row reads Draft. */
 const list = page.getByRole('list', { name: 'Protocol versions' });
 await expect(list).toBeVisible();
 await expect(list.getByRole('listitem')).toHaveCount(protocols.protocols.length);
 await list.getByRole('button', { name: new RegExp(`${first.id}@${first.version}`) }).click();
 await expect(page.locator('.pr-result')).toHaveText(`${first.name} — ${first.status}, no content.`);
 await expect(list.getByText('Ratified', { exact: true })).toHaveCount(0);
});

test("the Control Tower's audit export desk accepts a range within the setting's bound and refuses one wider than it", async ({ page }) => {
 await openWorkspace(page, 'Control Tower');
 await goSection(page, 'Audit exports');
 const from = page.locator('.ae-form input[type="date"]').first();
 const to = page.locator('.ae-form input[type="date"]').last();
 const check = page.getByRole('button', { name: 'Check the range' });

 await from.fill('2026-01-01');
 await to.fill('2026-01-05');
 await check.click();
 await expect(page.locator('.ae-result')).toContainText('within the');
 await expect(page.locator('.ae-refusal')).toHaveCount(0);

 await to.fill('2027-01-05');
 await check.click();
 await expect(page.locator('.ae-refusal')).toContainText(rangeTooWide);
});
