import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit } from './audit';

/* Founder access in the Control Tower, on both viewports (packages/catalog/founder-access.json).
 *
 * The service is answered here by a mock that behaves as apps/assistant-api/src/lib/founder-access.ts
 * does — dark, or a session that must be signed in to, and a reveal that needs a code — so the journeys
 * hold what the screen does with each answer: the dark refusal drawn in the contract's words; a sign-in
 * whose fields are cleared the moment they are sent and never put in an address; metadata that is never
 * the key; a revealed key drawn masked until the eye is pressed; and the key wiped after the contract's
 * thirty seconds with the clock controlled, when the tab is hidden and on sign-out. The service's own
 * refusals are held by apps/assistant-api/src/founder-access.test.ts.
 *
 * The key is a synthetic token and every sentence is read from the contracts, never typed here. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const founder = json('../packages/catalog/founder-access.json');
const registry = json('../packages/catalog/api-registry.json');
const assistant = json('../packages/catalog/apis/assistant.json');
const words = founder.words;
const refusal = (id: string) => {
 for (const route of assistant.routes) for (const r of route.refusals) if (r.id === id) return r as { id: string; status: number; statement: string };
 throw new Error(`no refusal ${id}`);
};
const KEY = 'fixture-openai-key-not-real-7d3e';
const LAST_FOUR = KEY.slice(-4);
const FINGERPRINT = 'f1f2f3f4a5a6a7a8';
const PASSWORD = 'a synthetic passphrase for the mock';
const CODE = '246810';
const NEXT_CODE = '135791';
const masked = (lastFour: string) => registry.keyMetadata.maskedDisplay.replace('{lastFour}', lastFour);

type Mock = { dark?: boolean; requests: Request[] };
async function mockService(page: Page, mock: Mock) {
 let signedIn = false;
 const refuse = (id: string) => ({ status: refusal(id).status, json: { error: id.replace(/-/g, '_'), refusalId: id, message: refusal(id).statement } });
 const keys = () => ({ keys: [
  { name: founder.keys[0].name, present: true, lastFour: LAST_FOUR, fingerprint: FINGERPRINT },
  { name: founder.keys[1].name, present: false, lastFour: null, fingerprint: null }
 ], expiresAt: new Date(Date.now() + founder.session.lifetimeSeconds * 1000).toISOString() });
 await page.route('**/assistant/v1/founder/**', async route => {
  const request = route.request();
  mock.requests.push(request);
  if (request.headers()[founder.request.header.toLowerCase()] !== founder.request.headerValue) return route.fulfill(refuse('founder-request-cross-site'));
  if (mock.dark) return route.fulfill(refuse('founder-access-dark'));
  const path = new URL(request.url()).pathname;
  const body = request.postDataJSON?.() as Record<string, string> | null;
  if (path.endsWith('/session') && request.method() === 'POST') {
   if (body?.password !== PASSWORD || body?.code !== CODE) return route.fulfill(refuse('founder-credentials-refused'));
   signedIn = true;
   return route.fulfill({ status: 200, json: { signedIn: true, expiresAt: keys().expiresAt } });
  }
  if (path.endsWith('/session') && request.method() === 'DELETE') { signedIn = false; return route.fulfill({ status: 200, json: { signedIn: false } }); }
  if (!signedIn) return route.fulfill(refuse('founder-no-session'));
  if (path.endsWith('/keys')) return route.fulfill({ status: 200, json: keys() });
  if (path.endsWith('/reveal')) {
   if (body?.code !== NEXT_CODE) return route.fulfill(refuse('founder-code-refused'));
   return route.fulfill({ status: 200, headers: { 'cache-control': 'no-store', pragma: 'no-cache' }, json: { name: body.name, revealedKey: KEY, lastFour: LAST_FOUR, fingerprint: FINGERPRINT } });
  }
  return route.fulfill({ status: 404, json: {} });
 });
 await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true, activated: true } }));
 await page.route('**/assistant/v1/status', route => route.fulfill({ json: { ok: true, activated: true } }));
}

const panel = (page: Page) => page.locator('#pt-subpanel .g1-founder');
async function open(page: Page, tab = 'model-providers') {
 await page.goto(`/app/?role=back-office&category=gilbertone&tab=${tab}`);
 await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 /* The panel arrives on a dynamic import of its own, after the tab's; a cold dev server compiles it on
    first ask, so the wait for it is the one generous timeout here. */
 await expect(page.locator('#pt-subpanel .g1-founder').first()).toBeAttached({ timeout: 30_000 });
}
async function signIn(page: Page, root: Locator = panel(page)) {
 const form = root.getByRole('form', { name: words.signInHeading });
 await form.getByLabel(words.passwordLabel, { exact: true }).fill(PASSWORD);
 await form.getByLabel(words.codeLabel, { exact: true }).fill(CODE);
 await form.getByRole('button', { name: words.signIn }).click();
 await expect(root.getByRole('button', { name: words.signOut })).toBeVisible();
}
async function revealFirst(page: Page) {
 const row = panel(page).getByRole('article', { name: founder.keys[0].label });
 await row.getByLabel(words.revealCodeLabel).fill(NEXT_CODE);
 await row.getByRole('button', { name: words.reveal, exact: true }).click();
 await expect(row.locator('.g1-founder-secret')).toBeVisible();
 return row;
}

test('dark: every founder route refuses, and the panel says so in the contract\'s words', async ({ page }) => {
 const mock: Mock = { dark: true, requests: [] };
 await mockService(page, mock);
 await open(page);
 await expect(panel(page)).toContainText(refusal('founder-access-dark').statement);
 await expect(panel(page).locator('input, button')).toHaveCount(0);
 expect(mock.requests.every(r => r.headers()[founder.request.header.toLowerCase()] === founder.request.headerValue)).toBe(true);
});

test('sign in, read the metadata, reveal masked, and the eye shows and hides the key', async ({ page }) => {
 const mock: Mock = { requests: [] };
 await mockService(page, mock);
 await open(page);
 const form = panel(page).getByRole('form', { name: words.signInHeading });
 const password = form.getByLabel(words.passwordLabel, { exact: true });
 const code = form.getByLabel(words.codeLabel, { exact: true });
 await expect(password).toHaveAttribute('type', 'password');
 await expect(password).toHaveAttribute('autocomplete', 'current-password');
 await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
 await expect(code).toHaveAttribute('inputmode', 'numeric');
 await expect(code).toHaveAttribute('maxlength', String(founder.totp.codeDigits));
 await expect(form).toHaveAttribute('method', 'post');

 /* A refused sign-in says the contract's sentence and clears both fields. */
 await password.fill('not the passphrase');
 await code.fill(CODE);
 await form.getByRole('button', { name: words.signIn }).click();
 await expect(form).toContainText(refusal('founder-credentials-refused').statement);
 await expect(password).toHaveValue('');
 await expect(code).toHaveValue('');

 await signIn(page);
 const row = panel(page).getByRole('article', { name: founder.keys[0].label });
 await expect(row).toContainText(masked(LAST_FOUR));
 await expect(row).toContainText(FINGERPRINT);
 await expect(row).not.toContainText(KEY);
 await expect(panel(page).getByRole('article', { name: founder.keys[1].label })).toContainText(words.absent);

 /* A reused code is refused with the contract's sentence; a fresh one reveals. */
 await row.getByLabel(words.revealCodeLabel).fill(CODE);
 await row.getByRole('button', { name: words.reveal, exact: true }).click();
 await expect(row).toContainText(refusal('founder-code-refused').statement);
 await revealFirst(page);
 const secret = row.locator('.g1-founder-secret');
 await expect(secret).toHaveText(masked(LAST_FOUR));
 const eye = row.getByRole('button', { name: words.show });
 await expect(eye).toHaveAttribute('aria-pressed', 'false');
 await eye.click();
 await expect(secret).toHaveText(KEY);
 await expect(row.getByRole('button', { name: words.hide })).toHaveAttribute('aria-pressed', 'true');
 await row.getByRole('button', { name: words.hide }).click();
 await expect(secret).toHaveText(masked(LAST_FOUR));
 await expect(row.getByRole('button', { name: words.copy })).toBeVisible();
 await audit(page, 'Founder access, a key revealed');

 /* Nothing typed and nothing revealed ever reached an address, and every request carried the header. */
 for (const r of mock.requests) {
  expect(r.url()).not.toContain(PASSWORD);
  expect(r.url()).not.toContain(CODE);
  expect(r.url()).not.toContain(NEXT_CODE);
  expect(r.headers()[founder.request.header.toLowerCase()]).toBe(founder.request.headerValue);
 }
 expect(page.url()).not.toContain(PASSWORD);
 expect(page.url()).not.toContain(KEY);
});

test('the revealed key is wiped after the contract\'s thirty seconds, with the clock controlled', async ({ page }) => {
 await page.clock.install();
 await mockService(page, { requests: [] });
 await open(page);
 await signIn(page);
 const row = await revealFirst(page);
 await row.getByRole('button', { name: words.show }).click();
 await expect(row.locator('.g1-founder-secret')).toHaveText(KEY);
 await page.clock.fastForward(founder.reveal.wipeAfterSeconds * 1000 - 1000);
 await expect(row.locator('.g1-founder-secret')).toHaveText(KEY);
 await page.clock.fastForward(1000);
 await expect(row.locator('.g1-founder-secret')).toHaveCount(0);
 await expect(row).toContainText(words.wiped);
 await expect(page.locator('main')).not.toContainText(KEY);
});

test('the revealed key is wiped when the tab is hidden, and on sign-out', async ({ page }) => {
 await mockService(page, { requests: [] });
 await open(page);
 await signIn(page);
 let row = await revealFirst(page);
 await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(row.locator('.g1-founder-secret')).toHaveCount(0);
 await expect(page.locator('main')).not.toContainText(KEY);
 await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
 });
 row = await revealFirst(page);
 await row.getByRole('button', { name: words.show }).click();
 await panel(page).getByRole('button', { name: words.signOut }).click();
 await expect(panel(page).getByRole('form', { name: words.signInHeading })).toBeVisible();
 await expect(page.locator('main')).not.toContainText(KEY);
});

test('the API Registry carries the panel on the two Azure cards only', async ({ page }) => {
 await mockService(page, { requests: [] });
 await open(page, 'api-registry');
 await expect(page.locator('#pt-subpanel details.g1-founder-details')).toHaveCount(founder.keys.length);
 for (const k of founder.keys) {
  const card = registry.cards.find((c: { id: string }) => c.id === k.card);
  const article = page.locator('#pt-subpanel').getByRole('article', { name: card.name, exact: true });
  await expect(article.locator('details.g1-founder-details')).toHaveCount(1);
 }
 const azure = page.locator('#pt-subpanel').getByRole('article', { name: registry.cards.find((c: { id: string }) => c.id === founder.keys[0].card).name, exact: true });
 await azure.locator('details.g1-founder-details > summary').click();
 await signIn(page, azure.locator('.g1-founder'));
 await expect(azure.locator('.g1-founder').getByRole('article')).toHaveCount(1);
 await expect(azure.locator('.g1-founder')).toContainText(masked(LAST_FOUR));
});
