import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, controlSweep } from './audit';
import { goPortal } from './nav';

/* Governance · Knowledge sources, on both viewports (founder's asks of 27 September and 1 October 2026).
 *
 * What is held is what the screen refuses. Every source in packages/catalog/knowledge/federation.json is
 * drawn with its licence verdict and the two signatures it waits on, and its Switch on is disabled and
 * described by the contract's own sentences for what is missing. A pasted https link becomes a proposed
 * source — not assessed, signed by nobody, never switched on — and is gone when the screen is left. A link
 * that is not a link, not https, already listed, already turned away, or carrying a person's detail is
 * refused with the contract's sentence. The link is never fetched: no request leaves for its host. And
 * the GilbertOne Knowledge screen draws the same verdict and signatures beside every source.
 *
 * Since 2 October 2026 the founder's demonstration override (packages/catalog/demonstration-override.json)
 * opens the sources whose licences permit a commercial service's use, without their signatures. Every such
 * source shows the override's disclaimer word for word, the override's own record is drawn with what it
 * does not open and why, a source the licence keeps off says so, and a pasted proposal stays off.
 *
 * Every sentence asserted is read from the contracts, never typed here. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const federation = json('../packages/catalog/knowledge/federation.json');
type Refusal = { id: string; statement: string; why: string };
type Source = { id: string; name: string; endpoint: string; hosts: string[]; active: boolean; licensing: { verdict: string; licence: string }; signOff: Record<string, unknown> };
type Role = { id: string; label: string; appointed: boolean };
const words = federation.governance.words as Record<string, string>;
const refusals = federation.governance.refusals as Refusal[];
const refusal = (id: string) => refusals.find(r => r.id === id)!.statement;
const sources = federation.sources as Source[];
const roles = federation.governance.signatures as Role[];
const verdicts = federation.licenceVerdicts as Record<string, { label: string; sentence: string; mayActivate: boolean }>;
const notAdmitted = federation.assessedNotAdmitted as { id: string; name: string; hosts: string[]; reason: string; verdict: string }[];
const override = json('../packages/catalog/demonstration-override.json');
const dw = override.words as Record<string, string>;
const gateOf = (s: Source) => (override.gates as { id: string; state: string; waitingFor?: string }[]).find(g => g.id === `knowledge-source:${s.id}`);
/* Opened by the override: listed, and under a verdict that may activate without written permission. */
const openedState = (s: Source) => {
 const v = verdicts[s.licensing.verdict] as { mayActivate: boolean; requiresPermissionRecord?: boolean };
 const gate = gateOf(s);
 return override.inForce && gate && v.mayActivate && !v.requiresPermissionRecord ? gate.state : null;
};
const opened = sources.filter(s => openedState(s)).length;

const panel = (page: Page) => page.locator('#pt-subpanel');
const linkField = (page: Page) => panel(page).getByLabel(words.linkLabel, { exact: true });
async function open(page: Page) {
 await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true } }));
 await page.goto('/app/?role=back-office&category=governance&tab=knowledge-sources');
 await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 await expect(page.getByRole('heading', { level: 1, name: 'Knowledge sources', exact: true })).toBeVisible();
}
async function paste(page: Page, link: string) {
 await linkField(page).fill(link);
 await panel(page).getByRole('button', { name: words.proposeButton, exact: true }).click();
}

test('every source is drawn with its verdict and two unsigned signatures, and none can be switched on', async ({ page }) => {
 await open(page);
 await expect(panel(page)).toContainText(refusal('no-activation-without-two-signatures'));
 for (const role of roles) await expect(panel(page)).toContainText(role.label);
 const list = panel(page).getByRole('list', { name: `${sources.length} sources in the contract, ${opened} on for demonstration` });
 await expect(list.locator(':scope > li')).toHaveCount(sources.length);
 for (const s of sources) {
  expect(s.active, `${s.id} ships dark`).toBe(false);
  for (const role of roles) expect(s.signOff[role.id], `${s.id} carries no ${role.id} signature`).toBeNull();
  const card = list.getByRole('article', { name: s.name, exact: true });
  await expect(card).toContainText(verdicts[s.licensing.verdict]!.label);
  await expect(card).toContainText(words.awaiting);
  await expect(card).toContainText(words.notAppointed);
  const state = openedState(s);
  if (state) {
   await expect(card).toContainText(override.disclaimer.sentence);
   await expect(card).toContainText(dw.signOffNote);
   await expect(card).toContainText(state === 'waiting-for-credentials' ? dw.waitingForCredentials : override.disclaimer.label);
   if (state === 'waiting-for-credentials') await expect(card).toContainText(gateOf(s)!.waitingFor!);
  } else {
   await expect(card).not.toContainText(override.disclaimer.sentence);
   if (!verdicts[s.licensing.verdict]!.mayActivate || (verdicts[s.licensing.verdict] as { requiresPermissionRecord?: boolean }).requiresPermissionRecord)
    await expect(card).toContainText(dw.licenceKeepsOff);
  }
  const switchOn = card.getByRole('button', { name: `${words.switchOn}: ${s.name}` });
  await expect(switchOn).toBeDisabled();
  await expect(switchOn).toHaveAccessibleDescription(new RegExp(refusal('no-activation-without-two-signatures').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (!verdicts[s.licensing.verdict]!.mayActivate)
   await expect(switchOn).toHaveAccessibleDescription(new RegExp(refusal('licence-does-not-permit-activation').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
 }
 expect(opened, 'the eight sources whose licences permit are opened for demonstration').toBe(8);
 /* The override's own record: its disclaimer, the founder's words, what going live changes, and what it
    does not open, each with why. */
 const record = panel(page).getByRole('region', { name: dw.heading });
 await expect(record.getByRole('note')).toContainText(override.disclaimer.sentence);
 await expect(record).toContainText(override.decided.words);
 await expect(record).toContainText(override.goLive);
 const closed = record.getByRole('list', { name: `${override.notOpened.length} not opened by the override` });
 await expect(closed.locator(':scope > li')).toHaveCount(override.notOpened.length);
 for (const n of override.notOpened as { name: string; why: string }[]) await expect(closed).toContainText(n.why);
 const turnedAway = panel(page).getByRole('list', { name: `${notAdmitted.length} assessed and not admitted` });
 await expect(turnedAway.locator(':scope > li')).toHaveCount(notAdmitted.length);
 for (const n of notAdmitted) await expect(turnedAway).toContainText(n.reason);
 for (const r of refusals) await expect(panel(page)).toContainText(r.statement);
 await audit(page, 'Governance · Knowledge sources');
 const { nameless, positive } = await controlSweep(page);
 expect(nameless).toEqual([]);
 expect(positive).toBe(0);
});

test('a pasted link becomes a proposed source in memory, never fetched, never switched on, gone when the screen is left', async ({ page }) => {
 const proposed = 'https://example.org/first-aid/burns';
 const reached: string[] = [];
 page.on('request', request => { if (new URL(request.url()).hostname.endsWith('example.org')) reached.push(request.url()); });
 await open(page);
 await expect(panel(page)).toContainText(words.noProposals);
 await paste(page, proposed);
 const held = panel(page).getByRole('list', { name: '1 proposed in this screen' });
 const card = held.getByRole('article', { name: proposed });
 await expect(card).toContainText(words.proposed);
 await expect(card).toContainText(verdicts['not-assessed']!.label);
 await expect(card, 'a proposal nobody has assessed stays off, override or not').toContainText(dw.proposalStaysOff);
 await expect(card).not.toContainText(override.disclaimer.sentence);
 for (const role of roles) await expect(card).toContainText(role.label);
 const switchOn = card.getByRole('button', { name: `${words.switchOn}: example.org` });
 await expect(switchOn).toBeDisabled();
 await expect(switchOn).toHaveAccessibleDescription(new RegExp(refusal('no-activation-without-two-signatures').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
 await expect(linkField(page)).toHaveValue('');
 /* The same link twice is the same proposal. */
 await paste(page, proposed);
 await expect(linkField(page)).toHaveAccessibleDescription(refusal('proposal-already-proposed'));
 await expect(held.locator(':scope > li')).toHaveCount(1);
 /* Withdrawn, and gone. */
 await card.getByRole('button', { name: `${words.withdraw}: ${proposed}` }).click();
 await expect(panel(page)).toContainText(words.noProposals);
 /* Kept nowhere: leave the screen and come back, and nothing is held. */
 await paste(page, 'https://example.org/first-aid/choking');
 await expect(panel(page).getByRole('list', { name: '1 proposed in this screen' })).toBeVisible();
 await goPortal(page, 'Governance', 'Clinician Review Queue');
 await goPortal(page, 'Governance', 'Knowledge sources');
 await expect(panel(page)).toContainText(words.noProposals);
 expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
 expect(reached, 'the screen reached for the pasted link').toEqual([]);
});

test('a link that is not a link, not https, already listed, turned away or carrying a person is refused in the contract\'s words', async ({ page }) => {
 await open(page);
 const cases: [string, string, string?][] = [
  ['first aid for burns', 'proposal-not-a-link'],
  ['http://example.org/first-aid', 'proposal-not-https'],
  ['https://example.org/record?id=8001015009087', 'proposal-carries-personal-detail'],
  ['https://example.org/share?to=thandi%40example.org', 'proposal-carries-personal-detail'],
  [`https://${sources[0]!.hosts[0]}/anything`, 'proposal-already-listed', sources[0]!.name],
  [`https://${notAdmitted[0]!.hosts[0]}/topics/eczema`, 'proposal-assessed-and-not-admitted', notAdmitted[0]!.reason],
 ];
 for (const [link, id, detail] of cases) {
  await paste(page, link);
  await expect(linkField(page), link).toHaveAttribute('aria-invalid', 'true');
  await expect(panel(page).locator('.ui-field__message--error'), link).toContainText(refusal(id));
  if (detail) await expect(panel(page).locator('.ui-field__message--error'), link).toContainText(detail);
 }
 await expect(panel(page)).toContainText(words.noProposals);
});

test('the GilbertOne Knowledge screen draws every source\'s verdict and its two signatures, and points to Governance', async ({ page }) => {
 await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true } }));
 await page.route('**/assistant/v1/status', route => route.fulfill({ json: { ok: true } }));
 await page.goto('/app/?role=back-office&category=gilbertone&tab=knowledge');
 await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 const list = panel(page).getByRole('list', { name: `${sources.length} external sources, ${opened} on for demonstration` });
 await expect(panel(page).getByRole('note').filter({ hasText: override.disclaimer.sentence })).toBeVisible();
 for (const s of sources) {
  const card = list.getByRole('article', { name: s.name, exact: true });
  await expect(card).toContainText(verdicts[s.licensing.verdict]!.label);
  await expect(card).toContainText(words.awaiting);
  if (openedState(s)) await expect(card).toContainText(dw.calledBy);
  await expect(panel(page)).not.toContainText(s.endpoint);
 }
 await expect(panel(page)).toContainText(words.whereProposed);
});
