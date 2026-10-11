import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
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
const BOARD_KEY = 'playwright-board-key';

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'work-team-chat-'));
  server = await startBoard({
    port: 0,
    workdir: dir,
    token: BOARD_KEY,
    env: { CURSOR_API_KEY: 'playwright-test-key', OLLAMA_URL: '' },
    fetchImpl: async (url: string, init: { method?: string } = {}) => {
      const href = String(url);
      if (!href.startsWith('https://api.cursor.com/')) throw new Error(`refused ${href}`);
      if (href.endsWith('/v1/models')) {
        return new Response(JSON.stringify({
          items: [{
            id: 'composer-2.5',
            displayName: 'Composer 2.5',
            variants: [{ isDefault: true, displayName: 'Composer 2.5', params: [{ id: 'fast', value: 'true' }] }],
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init.method === 'POST' && href.endsWith('/v1/agents')) {
        return new Response(JSON.stringify({
          agent: { id: 'bc-test', latestRunId: 'run-test' },
          run: { id: 'run-test', status: 'CREATING' },
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (init.method === 'GET' && href.includes('/runs/')) {
        return new Response(JSON.stringify({
          status: 'FINISHED',
          result: 'I have the duty. Composer 2.5 wrote this reply.',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init.method === 'DELETE') return new Response('{}', { status: 200 });
      return new Response('{}', { status: 404 });
    },
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

test('the rail, an @ duty, a group thread, and the mic', async ({ page }) => {
  const port = (server.address() as { port: number }).port;
  await page.goto(`http://127.0.0.1:${port}/status.html?k=${BOARD_KEY}`);
  await expect(page.getByText('The six answer through the model in the picker.', { exact: true })).toBeVisible();
  await expect(page.getByText(/not installed/)).toHaveCount(0);
  await expect(page.locator('#model-line')).toHaveText('Qwen on the server is not connected.');
  await expect(page.locator('#model-picker')).toHaveValue('composer-2.5', { timeout: 10000 });
  await expect(page.locator('#model-picker option[value="qwen"]')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#model-picker option[value="qwen"]')).toHaveText('Qwen on the server — not connected');

  for (const role of roles.roles) {
    const button = page.locator(`button[data-role="${role.id}"]`);
    await expect(button).toBeVisible();
    await expect(button).toContainText(role.name);
    await expect(button).toContainText(role.title);
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
  await expect(page.locator('#thread-sub')).toHaveText('Specialist Full Stack Engineer');
  await expect(page.getByText(status.held)).toBeVisible();
  await expect(page.locator('.reply-text')).toContainText('Composer 2.5');
  await expect(page.locator('#bubbles').getByText('Hold the morning-of card.')).toBeVisible();

  await box.click();
  await box.pressSequentially('@Le', { delay: 15 });
  await page.getByRole('option', { name: /^Lerato,/ }).click();
  await box.pressSequentially('@Ka', { delay: 15 });
  await page.getByRole('option', { name: /^Karabo,/ }).click();
  await box.pressSequentially('Share one thread.');
  await page.getByRole('button', { name: 'Send duty' }).click();
  const conversation = page.getByRole('region', { name: 'Conversation' });
  await expect(page.getByRole('heading', { name: 'Lerato and Karabo', exact: true })).toBeVisible();
  await expect(page.locator('#thread-sub')).toHaveText('One thread, shared. The duty is held for each of them.');
  await expect(page.getByRole('button', { name: /Lerato and Karabo/ })).toContainText('Held for Lerato and Karabo.');
  await expect(conversation.getByText(status.held).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Lerato and Karabo/ })).toHaveCount(1);
  await expect(page.locator('#bubbles').getByText('Hold the morning-of card.')).toHaveCount(0);

  await page.locator('button[data-role="engineer"]').click();
  await expect(page.getByRole('heading', { name: 'Sipho', exact: true })).toBeVisible();
  await expect(page.locator('#thread-sub')).toHaveText('Specialist Full Stack Engineer');
  await expect(page.locator('#bubbles').getByText('Hold the morning-of card.')).toBeVisible();
  await expect(page.locator('#bubbles').getByText('Share one thread.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Whole team' }).click();
  await box.click();
  await box.fill('For the whole team.');
  await page.getByRole('button', { name: 'Send duty' }).click();
  await expect(page.getByRole('heading', { name: 'Whole team', exact: true })).toBeVisible();
  await expect(page.locator('#thread-sub')).toHaveText('A message with nobody named is held here for the whole team.');
  await expect(page.getByText(status.held).first()).toBeVisible();

  await expect(page.getByRole('button', { name: 'Group' })).toBeVisible();
  await page.getByRole('button', { name: 'Group' }).click();
  await page.getByRole('checkbox', { name: /Thandi/ }).check();
  await page.getByRole('button', { name: 'Use this group' }).click();
  await expect(page.getByText('A group needs two or more people.')).toBeVisible();
  await page.getByRole('checkbox', { name: /Kabelo/ }).check();
  await page.getByRole('button', { name: 'Use this group' }).click();
  await expect(page.locator('button.chip[aria-label="Remove Thandi"]')).toBeVisible();
  await expect(page.locator('button.chip[aria-label="Remove Kabelo"]')).toBeVisible();

  const mic = page.getByRole('button', { name: 'Listen' });
  await expect(mic).toBeVisible();
  await expect(page.getByText('The browser may hand the words to its maker.')).toBeVisible();
  // A browser with no recognition must not invent words. Playwright's Chromium may have the
  // API, so this removes it and checks the honest line.
  await page.evaluate(() => {
    const host = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    delete host.SpeechRecognition;
    delete host.webkitSpeechRecognition;
  });
  await mic.click();
  await expect(page.getByText('This browser has no speech recognition. The words have to be typed.')).toBeVisible();
  await expect(page.locator('#listen')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Duty' })).toHaveValue('');

  await page.evaluate(() => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() { this.onend?.(); }
    }
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
  });
  await page.getByRole('button', { name: 'Listen' }).click();
  await expect(page.getByText('Listening', { exact: true })).toBeVisible();
  await expect(page.locator('#mic')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await expect(page.locator('#listen')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Duty' })).toHaveValue('');
});
