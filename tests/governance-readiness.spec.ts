import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openAdminConsole } from './nav';

/* Governance readiness, on the back office, on both viewports.
 *
 * docs/governance prepares five documents for named, accountable people to read, decide and sign, and says in
 * its own words that signing one changes no code. This tab is the register of what has actually been signed,
 * appointed and decided. The journeys check what makes that honest rather than what makes it look finished:
 * every record is drawn from its contract and starts blank; a change is refused in the contract's own sentence
 * when the evidence and the decision disagree, when a date is not a day or is in the future, when nothing
 * changed and when nobody said why; a confirmed change is added to the register with who, when and why; and —
 * the assertion the whole feature exists for — a record marked done leaves every refusal sentence beside it
 * exactly where it was, because recording a decision here starts nothing.
 *
 * Every sentence, field and state is read from packages/catalog/governance-status.json, so a record added to
 * the contract moves these journeys with it instead of breaking them. */
const contract = JSON.parse(readFileSync(new URL('../packages/catalog/governance-status.json', import.meta.url), 'utf8')) as {
  version: number;
  documents: string;
  recording: { attribution: string };
  records: {
    key: string; label: string; question: string; document: string; decidedBy: string;
    blockedUntil: string; refusedToday: string; refusalLives: string[];
    done: { field: string; is: string | boolean };
    fields: { key: string; label: string; type: string; help: string; blank: string | boolean | null; evidence: boolean; allowed?: { value: string | boolean; label: string; means: string }[] }[];
  }[];
  changesNothing: { statement: string; why: string };
  refusals: { id: string; statement: string }[];
  screen: Record<string, string>;
};
const say = contract.screen;
const fill = (sentence: string, values: Record<string, string>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
/* A field label matched whole rather than as a substring: "Appointed" and "Appointed on" are two
   different fields on the same panel, and a dt found by hasText alone matches both. */
const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const refusal = (id: string) => contract.refusals.find(r => r.id === id)!.statement;
const recordOf = (key: string) => contract.records.find(r => r.key === key)!;
const fieldOf = (key: string, field: string) => recordOf(key).fields.find(f => f.key === field)!;
const dpia = recordOf('dpia');
const officer = recordOf('information-officer');
/* A day the preview's clock is after, so a signing date is in the past and a refused one is not. */
const START = new Date('2026-09-21T09:00:00+02:00');
const SIGNED_ON = '2026-09-20';
const AHEAD = '2026-09-22';
const SIGNATORIES = 'The responsible party and the Information Officer';
const WHY = 'Counsel returned the final version this morning and both signatures are on it.';

const noOverflow = (page: Page) => page.evaluate(() =>
  [document.documentElement, document.querySelector('main')].filter((el): el is HTMLElement => Boolean(el)).every(el => el.scrollWidth <= el.clientWidth + 1));

async function openGovernance(page: Page) {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  /* A category of the merged Control Tower since Phase 3, rather than a button on the back office's strip. */
  await page.getByRole('tablist', { name: 'Categories' }).getByRole('tab', { name: say.tab, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: say.tab })).toBeVisible();
  return page.locator('.gr-area');
}
const panelFor = (page: Page, key: string) => page.getByRole('region', { name: recordOf(key).label });
const rowFor = (page: Page, key: string) => page.locator('.gr-table tbody tr').filter({ has: page.locator('th', { hasText: recordOf(key).label }) });
async function openForm(page: Page, key: string) {
  const panel = panelFor(page, key);
  await panel.getByRole('button', { name: say.record }).click();
  return panel.locator('form');
}
/* A choice is picked by what it means rather than by its label: "Appointed" is inside "Not appointed", and a
   journey that picked the wrong one of those would pass while recording the opposite of what it meant. */
const choose = (form: Locator, record: { fields: { key: string; allowed?: { value: string | boolean; means: string }[] }[] }, field: string, value: string | boolean) =>
  form.locator('.oi-radio').filter({ hasText: record.fields.find(f => f.key === field)!.allowed!.find(c => c.value === value)!.means }).locator('input').check();

test('the three records are drawn from the contract, every sign-off field blank, each beside what is still refused', async ({ page }) => {
  const area = await openGovernance(page);
  await expect(area).toContainText(say.intro);
  await expect(area).toContainText(say.preview);
  await expect(area.locator('.gr-count')).toHaveText(`${fill(say.summary, { done: '0', total: String(contract.records.length) })} · ${fill(say.version, { version: String(contract.version) })}`);
  await expect(area).toContainText(fill(say.documentsLink, { folder: contract.documents }));
  /* The guardrail, said on the screen and not only in a comment. */
  await expect(area).toContainText(contract.changesNothing.statement);
  await expect(area).toContainText(contract.changesNothing.why);
  await expect(area).toContainText(contract.recording.attribution);

  for (const record of contract.records) {
    const row = rowFor(page, record.key);
    await expect(row).toContainText(say.notDone);
    await expect(row).toContainText(record.blockedUntil);
    await expect(row).toContainText(record.refusedToday);
    for (const path of record.refusalLives) await expect(row).toContainText(path);

    const panel = panelFor(page, record.key);
    await expect(panel).toContainText(record.question);
    await expect(panel).toContainText(record.decidedBy);
    await expect(panel).toContainText(record.document);
    await expect(panel).toContainText(say.neverRecorded);
    await expect(panel.locator('summary')).toHaveText(`${say.historyHeading} (0)`);
    for (const field of record.fields) {
      await expect(panel).toContainText(field.help);
      const shown = field.allowed ? field.allowed.find(choice => choice.value === field.blank)!.label : say.blank;
      await expect(panel.locator('.gr-values > div').filter({ has: page.locator('dt', { hasText: exactly(field.label) }) }).locator('dd')).toHaveText(shown);
    }
  }
  expect(await noOverflow(page), 'the governance register scrolls sideways').toBe(true);
});

test('a change is refused in the contract’s words: done with no evidence, evidence with no decision, a date that is not a day, a date ahead of today, nothing changed, nothing said', async ({ page }) => {
  await openGovernance(page);
  const form = await openForm(page, 'dpia');
  const signedBy = form.getByLabel(fieldOf('dpia', 'signedBy').label, { exact: true });
  const signedOn = form.getByLabel(fieldOf('dpia', 'signedOn').label, { exact: true });
  const documentRef = form.getByLabel(fieldOf('dpia', 'documentRef').label, { exact: true });
  const reason = form.getByLabel(say.reason, { exact: true });
  const review = () => form.getByRole('button', { name: say.review }).click();

  await reason.fill(WHY);
  await review();
  await expect(form.getByRole('alert')).toHaveText(refusal('governance-unchanged'));

  await choose(form, dpia, 'status', 'signed');
  await review();
  await expect(form.getByRole('alert')).toHaveText(refusal('governance-done-without-evidence'));

  await choose(form, dpia, 'status', dpia.fields[0]!.blank as string);
  await signedBy.fill(SIGNATORIES);
  await review();
  await expect(form.getByRole('alert')).toHaveText(refusal('governance-evidence-without-the-decision'));

  await choose(form, dpia, 'status', 'signed');
  await signedOn.fill('20 September');
  await documentRef.fill(dpia.document);
  await review();
  await expect(form.getByRole('alert')).toHaveText(refusal('governance-day-not-a-day'));

  await signedOn.fill(AHEAD);
  await review();
  await expect(form.getByRole('alert')).toHaveText(refusal('governance-dated-ahead'));

  await signedOn.fill(SIGNED_ON);
  await reason.fill('   ');
  await review();
  await expect(form.getByRole('alert')).toHaveText(refusal('governance-change-without-reason'));

  /* Nothing was recorded by any of that. */
  await expect(panelFor(page, 'dpia').locator('summary')).toHaveText(`${say.historyHeading} (0)`);
  await expect(rowFor(page, 'dpia')).toContainText(say.notDone);
});

test('a recorded sign-off is kept with who, when and why — and every refusal beside it stays exactly where it was', async ({ page }) => {
  const area = await openGovernance(page);
  const before = await rowFor(page, 'dpia').textContent();
  const form = await openForm(page, 'dpia');
  await choose(form, dpia, 'status', 'signed');
  await form.getByLabel(fieldOf('dpia', 'signedBy').label, { exact: true }).fill(SIGNATORIES);
  await form.getByLabel(fieldOf('dpia', 'signedOn').label, { exact: true }).fill(SIGNED_ON);
  await form.getByLabel(fieldOf('dpia', 'documentRef').label, { exact: true }).fill(dpia.document);
  await form.getByLabel(say.reason, { exact: true }).fill(WHY);
  await form.getByRole('button', { name: say.review }).click();

  const confirm = form.getByRole('group', { name: fill(say.confirmQuestion, { record: dpia.label }) });
  /* The confirmation says what recording it does not do, before anybody presses the button. */
  await expect(confirm).toContainText(contract.changesNothing.statement);
  await confirm.getByRole('button', { name: say.confirm }).click();

  const row = rowFor(page, 'dpia');
  await expect(row).toContainText(say.done);
  await expect(area.locator('.gr-count')).toContainText(fill(say.summary, { done: '1', total: String(contract.records.length) }));
  await expect(area.locator('.gr-count')).toContainText(fill(say.version, { version: String(contract.version + 1) }));

  /* THE POINT. A signed DPIA is now recorded, and the row still says the Passport refuses to start, still
     names the files that refuse it, and the screen still says recording it changed nothing. */
  await expect(row).toContainText(dpia.refusedToday);
  for (const path of dpia.refusalLives) await expect(row).toContainText(path);
  await expect(area).toContainText(contract.changesNothing.statement);
  /* And the other two records are untouched: one document signed is not three. */
  for (const key of ['information-officer', 'data-residency']) await expect(rowFor(page, key)).toContainText(say.notDone);

  const panel = panelFor(page, 'dpia');
  await expect(panel).not.toContainText(say.neverRecorded);
  await panel.locator('summary').click();
  const history = panel.locator('table tbody tr');
  await expect(history).toHaveCount(1);
  for (const cell of [SIGNATORIES, SIGNED_ON, dpia.document, WHY]) await expect(history.first()).toContainText(cell);
  await expect(panel).toContainText(say.historyNeverEdited);
  /* Who wrote it down is kept beside what they wrote, and is not the signatory named in the record. */
  await expect(history.first().locator('td').nth(1)).not.toBeEmpty();
  expect(await noOverflow(page), 'an opened history scrolls the page sideways').toBe(true);
});

test('an appointment is recorded as a whole, and putting it back to blank takes its evidence with it', async ({ page }) => {
  await openGovernance(page);
  const form = await openForm(page, 'information-officer');
  await choose(form, officer, 'appointed', true);
  await form.getByLabel(fieldOf('information-officer', 'name').label, { exact: true }).fill('Refilwe Dlamini');
  await form.getByLabel(fieldOf('information-officer', 'appointedOn').label, { exact: true }).fill(SIGNED_ON);
  await form.getByLabel(fieldOf('information-officer', 'registrationRef').label, { exact: true }).fill('IR-0000-SYNTHETIC');
  await form.getByLabel(say.reason, { exact: true }).fill('The appointment letter is signed and the registration was lodged this week.');
  await form.getByRole('button', { name: say.review }).click();
  await form.getByRole('group', { name: fill(say.confirmQuestion, { record: officer.label }) }).getByRole('button', { name: say.confirm }).click();
  await expect(rowFor(page, 'information-officer')).toContainText(say.done);

  /* Recorded in error: one press puts every field back rather than leaving a name behind an appointment
     nobody made, which is the half-filled row the contract refuses. */
  const again = await openForm(page, 'information-officer');
  await again.getByRole('button', { name: say.clearAll }).click();
  await again.getByLabel(say.reason, { exact: true }).fill('Recorded against the wrong person. The appointment has not been made.');
  await again.getByRole('button', { name: say.review }).click();
  await again.getByRole('group', { name: fill(say.confirmQuestion, { record: officer.label }) }).getByRole('button', { name: say.confirm }).click();

  await expect(rowFor(page, 'information-officer')).toContainText(say.notDone);
  const panel = panelFor(page, 'information-officer');
  await panel.locator('summary').click();
  await expect(panel.locator('table tbody tr')).toHaveCount(2);
  /* Nothing was edited or removed: the mistake is still there, with the correction after it. */
  await expect(panel.locator('table tbody tr').first()).toContainText('Refilwe Dlamini');
});
