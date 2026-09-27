import { test, expect, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit } from './audit';

/* The founder's door (packages/catalog/founder-access.json#door), on both viewports.
 *
 * In production the Control Tower and the back office stand behind the founder's two-factor sign-in, and
 * the portal is drawn only while the assistant service says the founder's session is live. The dev server
 * is not production, so the journeys draw the door with the contract's own parameter (gate=founder) and
 * answer the service with the same mock tests/founder-access.spec.ts uses — dark, silent, or a session that
 * must be signed in to. What is held: the door fails closed on dark and on silence, in the contract's
 * sentence, with nothing of the portal in the tree; a wrong code is refused in the contract's words and
 * clears the fields; the right one draws the portal; sign-out and the session's own end put the door back;
 * and without the parameter, outside production, nothing changed. The demo login's buttons open the same
 * door the address does, and that is proved against the built app (docs/FEATURE-MAP.md), where PROD holds.
 * Every sentence is read from the contracts, never typed here. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const founder = json('../packages/catalog/founder-access.json');
const assistant = json('../packages/catalog/apis/assistant.json');
const words = founder.words;
const door = founder.door;
const refusal = (id: string) => {
 for (const route of assistant.routes) for (const r of route.refusals) if (r.id === id) return r as { id: string; status: number; statement: string };
 throw new Error(`no refusal ${id}`);
};
const PASSWORD = 'a synthetic passphrase for the mock';
const CODE = '246810';

type Mock = { dark?: boolean; silent?: boolean; sessionMs?: number; requests: Request[] };
async function mockService(page: Page, mock: Mock) {
 let signedIn = false;
 let expiresAt = 0;
 const refuse = (id: string) => ({ status: refusal(id).status, json: { error: id.replace(/-/g, '_'), refusalId: id, message: refusal(id).statement } });
 const keys = () => ({ keys: [
  { name: founder.keys[0].name, present: true, lastFour: '7d3e', fingerprint: 'f1f2f3f4a5a6a7a8' },
  { name: founder.keys[1].name, present: false, lastFour: null, fingerprint: null }
 ], expiresAt: new Date(expiresAt).toISOString() });
 await page.route('**/assistant/v1/founder/**', async route => {
  const request = route.request();
  mock.requests.push(request);
  if (mock.silent) return route.abort('connectionrefused');
  if (request.headers()[founder.request.header.toLowerCase()] !== founder.request.headerValue) return route.fulfill(refuse('founder-request-cross-site'));
  if (mock.dark) return route.fulfill(refuse('founder-access-dark'));
  const path = new URL(request.url()).pathname;
  const body = request.postDataJSON?.() as Record<string, string> | null;
  if (path.endsWith('/session') && request.method() === 'POST') {
   if (body?.password !== PASSWORD || body?.code !== CODE) return route.fulfill(refuse('founder-credentials-refused'));
   signedIn = true;
   expiresAt = Date.now() + (mock.sessionMs ?? founder.session.lifetimeSeconds * 1000);
   return route.fulfill({ status: 200, json: { signedIn: true, expiresAt: keys().expiresAt } });
  }
  if (path.endsWith('/session') && request.method() === 'DELETE') { signedIn = false; return route.fulfill({ status: 200, json: { signedIn: false } }); }
  /* The service's own clock ends a session; a door that asks after that hears there is none. */
  if (!signedIn || Date.now() > expiresAt) return route.fulfill(refuse('founder-no-session'));
  if (path.endsWith('/keys')) return route.fulfill({ status: 200, json: keys() });
  return route.fulfill({ status: 404, json: {} });
 });
 await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true, activated: true } }));
 await page.route('**/assistant/v1/status', route => route.fulfill({ json: { ok: true, activated: true } }));
}

const gate = (page: Page) => page.locator('.founder-gate');
const portal = (page: Page) => page.locator('.app-shell.portal');
const address = (role: string, more = '') => `/app/?role=${role}&${door.param}=${door.value}${more}`;
/* The form arrives on a dynamic import of the reveal panel's module; a cold dev server compiles it on
   first ask, so the wait for it is the one generous timeout here. */
const form = (page: Page) => gate(page).getByRole('form', { name: words.signInHeading });
async function openDoor(page: Page, role: string, more = '') {
 await page.goto(address(role, more));
 await expect(gate(page)).toBeVisible();
 await expect(gate(page)).toContainText(door.words.heading);
 await expect(gate(page)).toContainText(door.words.sentence);
}
async function signInAtDoor(page: Page, code = CODE) {
 const f = form(page);
 await expect(f).toBeAttached({ timeout: 30_000 });
 await f.getByLabel(words.passwordLabel, { exact: true }).fill(PASSWORD);
 await f.getByLabel(words.codeLabel, { exact: true }).fill(code);
 await f.getByRole('button', { name: words.signIn, exact: true }).click();
}
/* Nothing of the Control Tower in the tree: not the shell, not a category, not a navigation, not the demo
   bar. A door that hid the portal with CSS would fail this; it has to be not rendered. */
/* The card's one entrance has to finish before a screenshot, or the shot is of a card at half opacity. */
const settled = (page: Page) => gate(page).evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)).then(() => undefined));
async function nothingOfThePortal(page: Page) {
 await expect(portal(page)).toHaveCount(0);
 await expect(page.locator('#pt-category, .pt-side-nav, .pt-strip-nav, .demo-bar, .staff-topbar')).toHaveCount(0);
}

test('dark: the door stays shut, says so in the contract\'s words, and draws nothing of the Control Tower', async ({ page }, testInfo) => {
 const mock: Mock = { dark: true, requests: [] };
 await mockService(page, mock);
 await openDoor(page, 'control-tower');
 await expect(gate(page)).toContainText(refusal('founder-access-dark').statement);
 await expect(gate(page)).toContainText(door.words.holding);
 await expect(gate(page).locator('form, input')).toHaveCount(0);
 await nothingOfThePortal(page);
 expect(mock.requests.every(r => r.headers()[founder.request.header.toLowerCase()] === founder.request.headerValue)).toBe(true);
 await audit(page, 'The founder\'s door, dark');
 await settled(page);
 await page.screenshot({ path: testInfo.outputPath('gate-dark.png'), fullPage: true });
 /* The back office is the same door, and the way back from it is the patient app — what the address means
    with no role on it. */
 await openDoor(page, 'back-office');
 await expect(gate(page)).toContainText(refusal('founder-access-dark').statement);
 await nothingOfThePortal(page);
 await gate(page).getByRole('button', { name: door.words.leave, exact: true }).click();
 await expect(gate(page)).toHaveCount(0);
 await expect(page.locator('.demo-bar')).toBeVisible();
});

test('the service not answering: the door stays shut and says so, and never falls through', async ({ page }) => {
 await mockService(page, { silent: true, requests: [] });
 await openDoor(page, 'control-tower');
 await expect(gate(page)).toContainText(words.notAnswered);
 await expect(gate(page)).toContainText(door.words.holding);
 await expect(gate(page).locator('form, input')).toHaveCount(0);
 await nothingOfThePortal(page);
});

test('a wrong code is refused in the contract\'s words and clears the fields; the right one draws the portal; sign-out puts the door back', async ({ page }, testInfo) => {
 const mock: Mock = { requests: [] };
 await mockService(page, mock);
 await openDoor(page, 'control-tower', '&category=gilbertone&tab=model-providers');
 const f = form(page);
 await expect(f).toBeAttached({ timeout: 30_000 });
 await expect(f).toHaveAttribute('method', 'post');
 const password = f.getByLabel(words.passwordLabel, { exact: true });
 const code = f.getByLabel(words.codeLabel, { exact: true });
 await expect(password).toHaveAttribute('type', 'password');
 await expect(password).toHaveAttribute('autocomplete', 'current-password');
 await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
 await expect(code).toHaveAttribute('inputmode', 'numeric');
 await audit(page, 'The founder\'s door, signed out');

 await signInAtDoor(page, '000000');
 await expect(f).toContainText(refusal('founder-credentials-refused').statement);
 await expect(password).toHaveValue('');
 await expect(code).toHaveValue('');
 await nothingOfThePortal(page);
 await settled(page);
 await page.screenshot({ path: testInfo.outputPath('gate-refused.png'), fullPage: true });

 await signInAtDoor(page);
 await expect(portal(page)).toBeVisible();
 await expect(gate(page)).toHaveCount(0);
 await expect(page.getByRole('navigation', { name: 'Control Tower categories' }).first()).toBeVisible();
 await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 await page.screenshot({ path: testInfo.outputPath('gate-signed-in.png') });

 /* Nothing typed reached an address, and every request carried the header. */
 for (const r of mock.requests) {
  expect(r.url()).not.toContain(PASSWORD);
  expect(r.url()).not.toContain(CODE);
  expect(r.headers()[founder.request.header.toLowerCase()]).toBe(founder.request.headerValue);
 }
 expect(page.url()).not.toContain(PASSWORD);
 expect(page.url()).not.toContain(CODE);

 /* The reveal panel on Model Providers reads the same session, so it shows Sign out; pressing it puts the
    door back, with nothing of the portal left in the tree. */
 const panel = page.locator('#pt-subpanel .g1-founder').first();
 await expect(panel).toBeAttached({ timeout: 30_000 });
 await panel.getByRole('button', { name: words.signOut, exact: true }).click();
 await expect(gate(page)).toBeVisible();
 await expect(form(page)).toBeAttached();
 await nothingOfThePortal(page);
});

test('the session ending on the service\'s clock puts the door back without a press', async ({ page }) => {
 await mockService(page, { sessionMs: 2500, requests: [] });
 await openDoor(page, 'back-office');
 await signInAtDoor(page);
 await expect(portal(page)).toBeVisible();
 /* The door asks the service a second after the session's own end, hears founder-no-session, and is a
    door again with the form on it — the ordinary signed-out answer, which lib/founder-access.ts draws
    without a refusal sentence, as it does before any sign-in. */
 await expect(gate(page)).toBeVisible({ timeout: 15_000 });
 await expect(form(page)).toBeAttached();
 await nothingOfThePortal(page);
});

test('without the parameter, outside production, the demo login behaves as it did', async ({ page }) => {
 await mockService(page, { dark: true, requests: [] });
 await page.goto('/app/?role=control-tower');
 await expect(portal(page)).toBeVisible();
 await expect(gate(page)).toHaveCount(0);
 await page.goto('/app/?role=back-office');
 await expect(portal(page)).toBeVisible();
 await expect(gate(page)).toHaveCount(0);
});
