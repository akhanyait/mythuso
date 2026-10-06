import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
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
 * Since 28 September 2026 the same mock answers the founder's settings and provider routes — a settings
 * history kept in the mock's memory and validated the way the service validates, a provider table with a key
 * on two cards — so the journeys below hold the founder's three decisions of that day: the merged Speech
 * settings screen saves the founder's voice through the service and the preview's Play asks for it; the
 * Model Providers cards enter a key that is posted once and never echoed and show metadata that is never a
 * value; the API Registry switches a provider off and reads its log. Signed out, every one of those controls
 * is disabled beside the contract's sentence and no key field exists.
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
const voice = json('../packages/catalog/voice.json');
const portal = json('../packages/catalog/control-tower-portal.json');
const assistantContract = json('../packages/catalog/assistant.json');
const g1 = portal.gilbertone;
const founderWords = g1.founder.words as Record<string, string>;
const fill = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => key in values ? String(values[key]) : whole);
/* A new key for the mock's vault, and the cards it holds a slot for — the vault's own cards, from the contract. */
const NEW_KEY = 'fixture-new-provider-key-not-real-a9b8';
const NEW_LAST_FOUR = NEW_KEY.slice(-4);
const NEW_FINGERPRINT = 'a9b8c7d6e5f40312';
const VAULT_CARDS: string[] = founder.vault.cards.map((c: { card: string }) => c.card);
const SHOTS = '/tmp/mythuso-founder-web';
/* A screenshot for the report: the named element scrolled to the top of the pane, the arrival animations
   let finish, the viewport captured. */
async function shot(page: Page, selector: string, name: string) {
 mkdirSync(SHOTS, { recursive: true });
 await page.locator(`#pt-subpanel ${selector}`).first().evaluate(el => el.scrollIntoView({ block: 'start' }));
 await page.waitForTimeout(1200);
 await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

type Mock = { dark?: boolean; requests: Request[]; settingsVersion?: number };
async function mockService(page: Page, mock: Mock) {
 let signedIn = false;
 const refuse = (id: string) => ({ status: refusal(id).status, json: { error: id.replace(/-/g, '_'), refusalId: id, message: refusal(id).statement } });
 const expiresAt = () => new Date(Date.now() + founder.session.lifetimeSeconds * 1000).toISOString();
 const keys = () => ({ keys: [
  { name: founder.keys[0].name, present: true, lastFour: LAST_FOUR, fingerprint: FINGERPRINT },
  { name: founder.keys[1].name, present: false, lastFour: null, fingerprint: null }
 ], expiresAt: expiresAt() });
 /* The settings history the service would keep: the contract's defaults, and every accepted change appended,
    validated as the shared rules validate — a reason, the version in force, a value the setting allows. */
 const items = voice.settings.items as { key: string; default: { value: unknown }; allowed?: { value: unknown }[] }[];
 const values = new Map<string, unknown>(items.map(i => [i.key, i.default.value]));
 const setAt = new Map<string, number>(items.map(i => [i.key, 1]));
 const history: Record<string, unknown>[] = [];
 let version = 1;
 const describe = () => ({
  settingsVersion: version,
  settings: items.map(i => ({ setting: i.key, inForce: values.get(i.key), setAtVersion: setAt.get(i.key) })),
  history, persisted: true, expiresAt: expiresAt()
 });
 /* The providers the vault knows: the two Azure keys set (one from the environment, one from the vault), the rest
    with a slot and no key; every one switched on until the founder switches it off. */
 const providers = new Map<string, { configured: boolean; lastFour: string | null; fingerprintPrefix: string | null; enabled: boolean }>(
  VAULT_CARDS.map(card => [card, card === founder.keys[0].card || card === founder.keys[1].card
   ? { configured: true, lastFour: LAST_FOUR, fingerprintPrefix: FINGERPRINT, enabled: true }
   : { configured: false, lastFour: null, fingerprintPrefix: null, enabled: true }]));
 const providerRow = (card: string) => ({ card, keyVariable: founder.vault.cards.find((c: { card: string }) => c.card === card).keyVariable, source: providers.get(card)!.configured ? 'vault' : null, createdAt: null, lastRotatedAt: null, setBy: null, ...providers.get(card)! });
 const lines: Record<string, unknown>[] = [];
 const freshCode = (code: unknown) => typeof code === 'string' && /^\d{6}$/.test(code) && code !== CODE;
 await page.route('**/assistant/v1/founder/**', async route => {
  const request = route.request();
  mock.requests.push(request);
  if (request.headers()[founder.request.header.toLowerCase()] !== founder.request.headerValue) return route.fulfill(refuse('founder-request-cross-site'));
  if (mock.dark) return route.fulfill(refuse('founder-access-dark'));
  const path = new URL(request.url()).pathname;
  const body = request.postDataJSON?.() as Record<string, unknown> | null;
  if (path.endsWith('/session') && request.method() === 'POST') {
   if (body?.password !== PASSWORD || body?.code !== CODE) return route.fulfill(refuse('founder-credentials-refused'));
   signedIn = true;
   return route.fulfill({ status: 200, json: { signedIn: true, expiresAt: expiresAt() } });
  }
  if (path.endsWith('/session') && request.method() === 'DELETE') { signedIn = false; return route.fulfill({ status: 200, json: { signedIn: false } }); }
  if (!signedIn) return route.fulfill(refuse('founder-no-session'));
  if (path.endsWith('/keys')) return route.fulfill({ status: 200, json: keys() });
  if (path.endsWith('/reveal')) {
   if (body?.code !== NEXT_CODE) return route.fulfill(refuse('founder-code-refused'));
   return route.fulfill({ status: 200, headers: { 'cache-control': 'no-store', pragma: 'no-cache' }, json: { name: body.name, revealedKey: KEY, lastFour: LAST_FOUR, fingerprint: FINGERPRINT } });
  }
  if (path.endsWith('/founder/settings') && request.method() === 'GET') return route.fulfill({ status: 200, json: describe() });
  if (path.endsWith('/founder/settings/changes') && request.method() === 'POST') {
   const setting = items.find(i => i.key === body?.setting);
   if (!setting) return route.fulfill(refuse('setting-not-known'));
   if (typeof body?.reason !== 'string' || !body.reason.trim()) return route.fulfill(refuse('setting-change-without-reason'));
   if (body?.expectedVersion !== version) return route.fulfill(refuse('settings-version-stale'));
   if (setting.allowed && !setting.allowed.some(a => a.value === body?.to)) return route.fulfill(refuse('setting-out-of-range'));
   if (values.get(setting.key) === body?.to) return route.fulfill(refuse('setting-unchanged'));
   version += 1;
   const at = new Date().toISOString();
   history.push({ settingsVersion: version, setting: setting.key, from: values.get(setting.key), to: body.to, reason: body.reason, byRole: founder.settings.byRole, byRef: founder.settings.byRef, at });
   values.set(setting.key, body.to);
   setAt.set(setting.key, version);
   mock.settingsVersion = version;
   return route.fulfill({ status: 200, json: { settingsVersion: version, appliesFrom: at } });
  }
  if (path.endsWith('/founder/providers') && request.method() === 'GET')
   return route.fulfill({ status: 200, json: { providers: VAULT_CARDS.map(providerRow), vaultUnlocked: true, persisted: true, expiresAt: expiresAt() } });
  const perCard = path.match(/\/founder\/providers\/([^/]+)\/(key|enabled|test|logs)$/);
  if (perCard) {
   const card = decodeURIComponent(perCard[1]!);
   const action = perCard[2]!;
   if (!providers.has(card)) return route.fulfill(refuse('founder-card-not-known'));
   const row = providers.get(card)!;
   if (action === 'key' && request.method() === 'PUT') {
    if (!freshCode(body?.code)) return route.fulfill(refuse('founder-code-refused'));
    if (typeof body?.key !== 'string' || body.key.length < founder.vault.keyShape.minimumLength) return route.fulfill(refuse('founder-key-malformed'));
    providers.set(card, { configured: true, lastFour: body.key.slice(-4), fingerprintPrefix: NEW_FINGERPRINT, enabled: row.enabled });
    lines.push({ at: new Date().toISOString(), event: 'founder.provider.key-set', outcome: 'accepted', card });
    return route.fulfill({ status: 200, json: providerRow(card) });
   }
   if (action === 'key' && request.method() === 'DELETE') {
    if (!freshCode(body?.code)) return route.fulfill(refuse('founder-code-refused'));
    providers.set(card, { configured: false, lastFour: null, fingerprintPrefix: null, enabled: row.enabled });
    lines.push({ at: new Date().toISOString(), event: 'founder.provider.key-deleted', outcome: 'accepted', card });
    return route.fulfill({ status: 200, json: providerRow(card) });
   }
   if (action === 'enabled' && request.method() === 'POST') {
    if (!freshCode(body?.code)) return route.fulfill(refuse('founder-code-refused'));
    providers.set(card, { ...row, enabled: body?.enabled === true });
    lines.push({ at: new Date().toISOString(), event: 'founder.provider.enabled', outcome: body?.enabled === true ? 'on' : 'off', card });
    return route.fulfill({ status: 200, json: providerRow(card) });
   }
   if (action === 'test' && request.method() === 'POST') {
    if (!row.configured) return route.fulfill(refuse('founder-provider-not-configured'));
    lines.push({ at: new Date().toISOString(), event: 'founder.provider.test', outcome: 'ok', card });
    return route.fulfill({ status: 200, json: { card, outcome: 'ok', status: 200, latencyMs: 42, testedAt: new Date().toISOString() } });
   }
   if (action === 'logs' && request.method() === 'GET')
    return route.fulfill({ status: 200, json: { card, lines: lines.filter(l => l.card === card), persisted: true } });
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
 /* The words say which way the key is, so the button carries no pressed state beside them. */
 const eye = row.getByRole('button', { name: words.show });
 await expect(eye).not.toHaveAttribute('aria-pressed', /.*/);
 await eye.click();
 await expect(secret).toHaveText(KEY);
 await expect(row.getByRole('button', { name: words.hide })).not.toHaveAttribute('aria-pressed', /.*/);
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
 /* Paused before the reveal, so the only time that passes is the time this test moves: a slow
    machine's real seconds must not count toward the thirty. */
 await page.clock.pauseAt(new Date(Date.now() + 60_000));
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

/* The settings gate, on the founder's amendment of 28 September 2026 (packages/catalog/founder-access.json#gate):
   where the service says founder access is on and nobody is signed in, the Configuration editor offers no
   Change button and draws the sign-in where the editor would be; the same sign-in opens it, and Sign out
   shuts it again; where the service says founder access is dark, the editor is a preview and says so. Every
   sentence is the contract's. The mock is the same one the reveal journeys use. */
test.describe('the settings gate', () => {
 const gate = founder.gate.words as Record<string, string>;
 const minutes = (s: string) => s.replace('{minutes}', String(founder.session.lifetimeSeconds / 60));
 const settingsSay = json('../packages/catalog/settings.json').screen as Record<string, string>;
 const openConfiguration = async (page: Page) => {
  await page.goto('/app/?role=back-office&category=configuration');
  await expect(page.getByRole('heading', { level: 1, name: settingsSay.tab })).toBeVisible();
 };
 test('shut while founder access is on and nobody is signed in; the sign-in opens it; sign out shuts it', async ({ page }) => {
  const mock: Mock = { requests: [] };
  await mockService(page, mock);
  await openConfiguration(page);
  const panel = page.getByRole('region', { name: gate.lockedHeading });
  await expect(panel).toContainText(minutes(gate.lockedSentence));
  await expect(page.getByRole('button', { name: new RegExp(`^${settingsSay.change} `) })).toHaveCount(0);
  await panel.getByLabel(words.passwordLabel, { exact: true }).fill(PASSWORD);
  await panel.getByLabel(words.codeLabel, { exact: true }).fill(CODE);
  await panel.getByRole('button', { name: words.signIn, exact: true }).click();
  await expect(panel).toContainText(minutes(gate.openSentence));
  await expect(page.getByRole('button', { name: new RegExp(`^${settingsSay.change} `) }).first()).toBeVisible();
  await panel.getByRole('button', { name: words.signOut, exact: true }).click();
  await expect(panel).toContainText(minutes(gate.lockedSentence));
  await expect(page.getByRole('button', { name: new RegExp(`^${settingsSay.change} `) })).toHaveCount(0);
  /* Nothing typed went anywhere but the session route's body: no address carries a password or a code. */
  for (const request of mock.requests) expect(request.url()).not.toMatch(new RegExp(`${PASSWORD}|${CODE}`));
 });
 test('a preview where founder access is dark: the editor is open and says so', async ({ page }) => {
  const mock: Mock = { dark: true, requests: [] };
  await mockService(page, mock);
  await openConfiguration(page);
  await expect(page.getByRole('region', { name: gate.lockedHeading })).toContainText(gate.previewSentence);
  await expect(page.getByRole('button', { name: new RegExp(`^${settingsSay.change} `) }).first()).toBeVisible();
 });
 test('the Speech settings screen’s saves wait on the gate too, its fields are disabled, and it says the defaults are what is shown', async ({ page }) => {
  const mock: Mock = { requests: [] };
  await mockService(page, mock);
  await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true, mode: 'service', azure: true, ollama: false, production: true, activated: true, speech: false } }));
  await page.route('**/assistant/v1/status', route => route.fulfill({ json: { ok: true, mode: 'service', azure: true, ollama: false, production: true, activated: true, speech: false } }));
  await page.goto('/app/?role=back-office&category=gilbertone&tab=speech');
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
  const saves = page.locator('button.g1-live', { hasText: /^Save/ });
  await expect(saves.first()).toBeDisabled();
  for (const save of await saves.all()) await expect(save).toBeDisabled();
  await expect(page.locator('#pt-subpanel')).toContainText(minutes(gate.lockedSentence));
  await expect(page.locator('#pt-subpanel')).toContainText((g1.speech as Record<string, string>).sourceLocked!);
  /* A chip's input is disabled through its fieldset, so the browser's own :enabled is asked rather than the attribute. */
  await expect(page.locator('#pt-subpanel .g1-change input:enabled')).toHaveCount(0);
  mkdirSync(SHOTS, { recursive: true });
  await shot(page, '.g1-registers', `speech-settings-signed-out-${test.info().project.name}`);
 });
});

/* The founder's controls, on the founder's instruction of 28 September 2026 (control-tower-portal.json#gilbertone.founder):
   signed in, the merged Speech settings screen reads what is in force from the service and saves through it — so the
   voice the founder saves is the one the preview's Play asks for; the Model Providers cards show a key's metadata and
   take a new key that is posted once and never echoed; the API Registry switches a provider off and reads its log.
   Every sentence is the contract's; the key is a synthetic token. */
test.describe('the founder’s controls', () => {
 const answering = async (page: Page) => {
  await page.route('**/assistant/health', route => route.fulfill({ json: { ok: true, mode: 'service', azure: true, ollama: false, production: true, activated: true, speech: true } }));
  await page.route('**/assistant/v1/status', route => route.fulfill({ json: { ok: true, mode: 'service', azure: true, ollama: false, production: true, activated: true, speech: true } }));
 };
 const speaking = (page: Page, spoken: { voice: string | null; register: string | null }[]) => page.route('**/assistant/v1/speak', route => {
  const body = route.request().postDataJSON() as { voice?: string; language?: string; register?: string };
  spoken.push({ voice: body.voice ?? null, register: body.register ?? null });
  return route.fulfill({ json: { ok: true, audioBase64: 'AAAA', format: 'audio/mpeg', voice: body.voice ?? '', language: body.language ?? '' } });
 });
 const openTab = async (page: Page, tab: string) => {
  await page.goto(`/app/?role=back-office&category=gilbertone&tab=${tab}`);
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 };
 const sub = (page: Page) => page.locator('#pt-subpanel');

 test('Speech settings: signed in, the value in force is the service’s; saving the other voice writes through the service, the chip reads it back from the service, and Play asks for that voice', async ({ page }) => {
  const mock: Mock = { requests: [] };
  await mockService(page, mock);
  await answering(page);
  const spoken: { voice: string | null; register: string | null }[] = [];
  await speaking(page, spoken);
  await openTab(page, 'speech');
  const speech = g1.speech as Record<string, string>;
  const classes = voice.queryClasses as { id: string; label: string; previewMaySaveAsDefault: boolean; setting?: string }[];
  const routine = classes.find(c => c.previewMaySaveAsDefault)!;
  const setting = (voice.settings.items as { key: string; allowed: { value: string; label: string }[]; default: { value: string } }[]).find(s => s.key === routine.setting)!;
  const english = (assistantContract.voice.languages as { id: string; ttsVoices?: Record<string, string> }[])[0]!;
  /* Presentation registers ship male since 4 October 2026 (voice.json defaults). The cloud platform
     default (female) is a different thing — emergency/refusal/escalation — and is not what the
     service returns as in-force for a presentation register. */
  const registerDefaultLabel = setting.default.value;
  const registerOtherLabel = Object.keys(assistantContract.voice.cloud.voices).find(l => l !== registerDefaultLabel)!;
  /* The gate's sign-in sits where the change fields are; signing in there opens them and reads the service. */
  const gatePanel = sub(page).getByRole('region', { name: founder.gate.words.lockedHeading });
  await gatePanel.getByLabel(words.passwordLabel, { exact: true }).fill(PASSWORD);
  await gatePanel.getByLabel(words.codeLabel, { exact: true }).fill(CODE);
  await gatePanel.getByRole('button', { name: words.signIn, exact: true }).click();
  await expect(sub(page)).toContainText(fill(speech.sourceService!, { version: 1 }));
  expect(mock.requests.some(r => r.method() === 'GET' && new URL(r.url()).pathname.endsWith(founder.routes.settings)), 'the settings were read from the service').toBe(true);
  const change = sub(page).getByRole('region', { name: new RegExp(`^${speech.changeHeading}`) });
  const card = change.getByRole('article', { name: routine.label, exact: true });
  const chips = card.getByRole('group', { name: fill(speech.voiceLabel!, { register: routine.label }) });
  const chip = (value: string) => chips.getByRole('radio', { name: setting.allowed.find(a => a.value === value)!.label, exact: true });
  await expect(chip(registerDefaultLabel)).toBeChecked();
  await chip(registerOtherLabel).check();
  const reason = `The founder wants every presentation register read in the ${registerOtherLabel} voice, starting with routine answers.`;
  await change.getByLabel(say.reason).fill(reason);
  await card.getByRole('button', { name: fill(speech.saveRegister!, { register: routine.label }) }).click();
  await expect(change.getByRole('status')).toContainText(fill(say.applied.split('{at}')[0]!, { version: '2' }).trim());
  /* One POST to the service's change route, with the setting, from, to, the reason and the version it was asked
     against — and nothing in any address. */
  const post = mock.requests.find(r => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(founder.routes.settingsChanges))!;
  expect(post).toBeTruthy();
  expect(post.postDataJSON()).toEqual({ setting: routine.setting, from: registerDefaultLabel, to: registerOtherLabel, reason, expectedVersion: 1 });
  for (const r of mock.requests) expect(r.url()).not.toContain(registerOtherLabel);
  /* The chip reads the saved voice back from the mocked GET, and the source sentence says version two. */
  await expect(chip(registerOtherLabel)).toBeChecked();
  await expect(sub(page)).toContainText(fill(speech.sourceService!, { version: 2 }));
  await expect(card).toContainText(setting.allowed.find(a => a.value === registerOtherLabel)!.label);
  /* The preview follows: on the routine register the saved chip is checked and Play sends that voice's name. */
  const preview = sub(page).getByRole('region', { name: new RegExp(voice.previewPanel.placements[0]) });
  await preview.getByRole('combobox', { name: g1.voice.previewClassLabel, exact: true }).selectOption(routine.id);
  const previewChips = preview.getByRole('group', { name: g1.voice.previewVoiceLabel, exact: true });
  await expect(previewChips.getByRole('radio', { name: setting.allowed.find(a => a.value === registerOtherLabel)!.label, exact: true })).toBeChecked();
  await preview.getByLabel(g1.voice.previewTextLabel).fill('Your nurse is on the way.');
  await preview.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => spoken.length).toBe(1);
  expect(spoken[0]!.voice).toBe(english.ttsVoices![registerOtherLabel]);
  expect(spoken[0]!.register).toBe(routine.id);
  await audit(page, 'Speech settings, the founder signed in');
  mkdirSync(SHOTS, { recursive: true });
  await shot(page, '.g1-registers', `speech-settings-signed-in-${test.info().project.name}`);
  await shot(page, '.g1-knob-groups', `speech-settings-signed-in-knobs-${test.info().project.name}`);
 });

 test('Model Providers: signed in, Show metadata shows the last four and the fingerprint and never the key; Rotate key opens one password field that posts once, is cleared as it goes and echoes nothing; Test says what the service said', async ({ page }) => {
  const mock: Mock = { requests: [] };
  await mockService(page, mock);
  await answering(page);
  await openTab(page, 'model-providers');
  await expect(sub(page).locator('.g1-founder').first()).toBeAttached({ timeout: 30_000 });
  /* Signed out, the founder's controls are disabled beside the sentence, and no key field exists. */
  const azure = sub(page).getByRole('article', { name: registry.cards.find((c: { id: string }) => c.id === founder.keys[0].card).name, exact: true });
  const button = (label: string) => azure.getByRole('button', { name: label, exact: true });
  for (const id of ['provider-show-metadata', 'provider-test', 'provider-rotate-key', 'provider-remove-key']) await expect(button(action(id).label)).toBeDisabled();
  await expect(azure).toContainText(founderWords.notSignedIn!);
  await expect(page.locator('input[type="password"]')).toHaveCount(1); /* the sign-in's own */
  await signIn(page);
  for (const id of ['provider-show-metadata', 'provider-test', 'provider-rotate-key', 'provider-remove-key']) await expect(button(action(id).label)).toBeEnabled();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  /* Show metadata: the masked last four and the fingerprint, from the service, and nothing key-shaped beyond them. */
  await button(action('provider-show-metadata').label).click();
  const meta = azure.getByRole('group', { name: `${founderWords.heading}: ${founder.keys[0].card}` });
  await expect(meta).toContainText(masked(LAST_FOUR));
  await expect(meta).toContainText(FINGERPRINT);
  await expect(meta).not.toContainText(KEY);
  await expect(meta).toContainText(action('provider-show-metadata').founder.sentence);
  /* Rotate key opens the one password field; the key and a fresh code go once, in one PUT's body; the field is gone
     with the form and the note says the key was saved; the new last four is shown and the key itself never is. */
  await button(action('provider-rotate-key').label).click();
  const form = azure.getByRole('form', { name: `${action('provider-enter-key').label}: ${founder.keys[0].card}` });
  await expect(form).toHaveAttribute('method', 'post');
  const key = form.getByLabel(founderWords.keyLabel!);
  await expect(key).toHaveAttribute('type', 'password');
  await expect(key).toHaveAttribute('autocomplete', 'off');
  await key.fill(NEW_KEY);
  await form.getByLabel(founderWords.codeLabel!).fill(NEXT_CODE);
  await form.getByRole('button', { name: action('provider-enter-key').label, exact: true }).click();
  await expect(meta).toContainText(founderWords.keySaved!);
  const put = mock.requests.find(r => r.method() === 'PUT')!;
  expect(new URL(put.url()).pathname).toContain(founder.routes.providerKey.replace('{card}', founder.keys[0].card));
  expect(put.postDataJSON()).toEqual({ key: NEW_KEY, code: NEXT_CODE });
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(meta).toContainText(masked(NEW_LAST_FOUR));
  await expect(meta).toContainText(NEW_FINGERPRINT);
  await expect(page.locator('main')).not.toContainText(NEW_KEY);
  for (const r of mock.requests) { expect(r.url()).not.toContain(NEW_KEY); expect(r.url()).not.toContain(NEXT_CODE); }
  expect(page.url()).not.toContain(NEW_KEY);
  /* Test: the service's word for it. */
  await button(action('provider-test').label).click();
  await expect(meta).toContainText(founderWords.testPassed!);
  await expect(meta).toContainText(fill(founderWords.testOutcome!, { outcome: 'ok', latency: 42 }));
  await audit(page, 'Model Providers, a key entered');
  mkdirSync(SHOTS, { recursive: true });
  await shot(page, '.g1-founder-meta', `model-providers-key-entered-${test.info().project.name}`);
 });

 test('API Registry: signed in, a provider is switched off with a fresh code and the service’s answer is what the card shows; its log is read; Configure scopes stays gated and says so', async ({ page }) => {
  const mock: Mock = { requests: [] };
  await mockService(page, mock);
  await answering(page);
  await openTab(page, 'api-registry');
  const speechCard = registry.cards.find((c: { id: string }) => c.id === founder.keys[1].card);
  const card = sub(page).getByRole('article', { name: speechCard.name, exact: true });
  await card.locator('details.g1-founder-details > summary').click();
  await signIn(page, card.locator('.g1-founder'));
  const controls = card.getByRole('group', { name: `${founderWords.heading}: ${speechCard.id}` });
  await expect(controls).toContainText(`${founderWords.enabledLabel}`);
  await expect(controls.getByRole('button', { name: action('registry-disable').label, exact: true })).toBeEnabled();
  await expect(controls.getByRole('button', { name: action('registry-enable').label, exact: true })).toBeDisabled();
  await controls.getByLabel(founderWords.codeLabel!).fill(NEXT_CODE);
  await controls.getByRole('button', { name: action('registry-disable').label, exact: true }).click();
  await expect(controls).toContainText(fill(founderWords.switched!, { state: founderWords.offWord! }));
  const post = mock.requests.find(r => r.method() === 'POST' && new URL(r.url()).pathname.endsWith(founder.routes.providerEnabled.replace('{card}', speechCard.id)))!;
  expect(post.postDataJSON()).toEqual({ enabled: false, code: NEXT_CODE });
  await expect(controls.getByRole('button', { name: action('registry-enable').label, exact: true })).toBeEnabled();
  await expect(controls.getByRole('button', { name: action('registry-disable').label, exact: true })).toBeDisabled();
  await expect(controls.locator('.g1-fact').filter({ has: page.locator('dt', { hasText: founderWords.enabledLabel! }) }).locator('dd')).toHaveText(g1.overview.falseWord);
  /* The card's own state is still the registry's word, not the switch's. */
  await expect(card.locator('.g1-card-status').first()).toHaveText(speechCard.statusToday);
  /* View logs: the switch is in the provider's log, as when, what and how it went. */
  await controls.getByRole('button', { name: action('registry-view-logs').label, exact: true }).click();
  await expect(controls).toContainText(founderWords.logsHeading!);
  await expect(controls.locator('table tbody tr')).toHaveCount(1);
  await expect(controls.locator('table tbody tr').first()).toContainText('founder.provider.enabled');
  /* Configure scopes and the add-a-provider form stay gated, and the card says why in the contract's words. */
  await expect(card.getByRole('button', { name: action('registry-configure-scopes').label, exact: true })).toBeDisabled();
  await expect(card).toContainText(founderWords.noContract!);
  await expect(sub(page).getByRole('button', { name: action('registry-add-provider').label })).toBeDisabled();
  await audit(page, 'API Registry, a provider switched off');
  mkdirSync(SHOTS, { recursive: true });
  await shot(page, '.g1-founder-controls .g1-action-row', `api-registry-provider-disabled-${test.info().project.name}`);
 });
});

const action = (id: string) => (g1.actions as { id: string; label: string; founder?: { sentence: string } }[]).find(a => a.id === id)! as { id: string; label: string; founder: { sentence: string } };
const say = json('../packages/catalog/settings.json').screen as Record<string, string>;
