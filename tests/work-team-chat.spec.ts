import { test, expect } from '@playwright/test';
import { mkdtemp, readFileSync, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBoard } from '../deploy/gilbertone-host/agent-team/board.mjs';

/* Gilbert's work-team chat, served by board.mjs, not by the patient app.
   Names come from roles.json. The held sentence comes from status.json.
   The server here is a throwaway, so the founder's work folder stays empty. */

const roles = JSON.parse(readFileSync(new URL('../deploy/gilbertone-host/agent-team/roles.json', import.meta.url), 'utf8')) as {
  roles: { id: string; name: string; title: string }[];
};
const status = JSON.parse(readFileSync(new URL('../deploy/gilbertone-host/agent-team/status.json', import.meta.url), 'utf8')) as {
  held: string;
  people: { id: string; sentence: string }[];
};

let server: Awaited<ReturnType<typeof startBoard>>;
let dir: string;

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'work-team-chat-'));
  server = await startBoard({ port: 0, workdir: dir });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

test('the rail, an @ duty, a group thread, and the mic', async ({ page }) => {
  const port = (server.address() as { port: number }).port;
  await page.goto(`http://127.0.0.1:${port}/status.html`);
  await expect(page.getByText('The host team is not installed.')).toBeVisible();

  for (const role of roles.roles) {
    const person = status.people.find((row) => row.id === role.id);
    const button = page.locator(`button[data-role="${role.id}"]`);
    await expect(button).toBeVisible();
    await expect(button).toContainText(role.name);
    await expect(button).toContainText(person!.sentence.slice(0, 24));
  }
  await expect(page.getByText('Investment Bot')).toHaveCount(0);
  await expect(page.getByText('Hacker and Security')).toHaveCount(0);

  const box = page.getByRole('textbox', { name: 'Duty' });
  await box.click();
  await box.pressSequentially('@Si', { delay: 15 });
  await page.getByRole('option', { name: /^Sipho,/ }).click();
  await box.pressSequentially('Hold the morning-of card.');
  await page.getByRole('button', { name: 'Send duty' }).click();
  await expect(page.getByRole('heading', { name: 'Sipho', exact: true })).toBeVisible();
  await expect(page.getByText('Held for Sipho.')).toBeVisible();
  await expect(page.getByText(status.held)).toBeVisible();
  await expect(page.getByText('Hold the morning-of card.')).toBeVisible();

  await box.click();
  await box.pressSequentially('@Le', { delay: 15 });
  await page.getByRole('option', { name: /^Lerato,/ }).click();
  await box.pressSequentially('@Ka', { delay: 15 });
  await page.getByRole('option', { name: /^Karabo,/ }).click();
  await box.pressSequentially('Share one thread.');
  await page.getByRole('button', { name: 'Send duty' }).click();
  await expect(page.getByRole('heading', { name: 'Lerato and Karabo', exact: true })).toBeVisible();
  await expect(page.getByText('Held for Lerato and Karabo.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Lerato and Karabo/ })).toHaveCount(1);
  await expect(page.getByText('Hold the morning-of card.')).toHaveCount(0);

  await page.locator('button[data-role="engineer"]').click();
  await expect(page.getByRole('heading', { name: 'Sipho', exact: true })).toBeVisible();
  await expect(page.getByText('Specialist Full Stack Engineer')).toBeVisible();
  await expect(page.getByText('Hold the morning-of card.')).toBeVisible();
  await expect(page.getByText('Share one thread.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Whole team' }).click();
  await box.click();
  await box.fill('For the whole team.');
  await page.getByRole('button', { name: 'Send duty' }).click();
  await expect(page.getByRole('heading', { name: 'Whole team', exact: true })).toBeVisible();
  await expect(page.getByText('Held for the whole team.')).toBeVisible();
  await expect(page.getByText(status.held)).toBeVisible();

  await expect(page.getByRole('button', { name: 'Group' })).toBeVisible();
  await page.getByRole('button', { name: 'Group' }).click();
  await page.getByRole('checkbox', { name: /Thandi/ }).check();
  await page.getByRole('button', { name: 'Use this group' }).click();
  await expect(page.getByText('A group needs two or more people.')).toBeVisible();
  await page.getByRole('checkbox', { name: /Kabelo/ }).check();
  await page.getByRole('button', { name: 'Use this group' }).click();
  await expect(page.getByRole('button', { name: 'Remove Thandi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Kabelo' })).toBeVisible();

  const mic = page.getByRole('button', { name: 'Listen' });
  await expect(mic).toBeVisible();
  await expect(page.getByText('The browser may hand the words to its maker.')).toBeVisible();
  await mic.click();
  await expect(page.getByText(/The words have to be typed/)).toBeVisible();
});
