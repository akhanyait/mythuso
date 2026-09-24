import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, controlSweep, zoomedTo200 } from './audit';
import { goPortal } from './nav';

/* GilbertOne API Administration's seven sub-screens, on both viewports (docs/PROMPT-CONTROL-TOWER-UI.md
 * §7, Phase 4).
 *
 * What is held here is what the screens refuse, because the assistant they administer is live in
 * production and nothing on them may act on it. Every sub-screen is reached by the keyboard alone. Every
 * action is disabled, and its gate's sentence is on the screen and tied to it. No password field is
 * enabled anywhere, and nothing key-shaped is ever drawn — not even when the health route is made to
 * answer with a planted field it should not have. The locked voice rows offer nothing to save; the
 * preview refuses a person's details and never asks anything to speak. A provider is configured only
 * where its contract says so. And the accessibility measurements and sweep of tests/audit.ts are taken
 * on every one of the seven.
 *
 * Every sentence and every figure asserted is read from the contracts, never typed here. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const portal = json('../packages/catalog/control-tower-portal.json');
const overview = json('../packages/catalog/control-tower-overview.json');
const voice = json('../packages/catalog/voice.json');
const providers = json('../packages/catalog/model-providers.json');
const levels = json('../packages/catalog/intelligence-levels.json');
const corpus = json('../packages/catalog/knowledge-corpus-tiers.json');
const federation = json('../packages/catalog/knowledge/federation.json');
const pack = json('../packages/catalog/compliance-pack.json');
const registry = json('../packages/catalog/api-registry.json');
const assistant = json('../packages/catalog/assistant.json');

type Gate = { id: string; label: string; sentence: string };
type Action = { id: string; screen: string; label: string; gate: string; refusal?: string };
type Card = { id: string; name: string; category: string; statusToday: string; serves?: string[] };
const g1 = portal.gilbertone;
const CATEGORY = 'GilbertOne API Administration';
const subScreens = g1.subScreens as { id: string; label: string }[];
const tabs = (portal.categories as { id: string; tabs: { id: string; label: string; heading?: string }[] }[]).find(c => c.id === 'gilbertone')!.tabs;
const gate = (id: string) => (g1.gates as Gate[]).find(g => g.id === id)!;
const action = (id: string) => (g1.actions as Action[]).find(a => a.id === id)!;
const refusalOf = (a: Action) => a.refusal ?? gate(a.gate).sentence;
const cards = registry.cards as Card[];

const panel = (page: Page) => page.locator('#pt-subpanel');
const tablist = (page: Page) => page.getByRole('tablist', { name: `${CATEGORY} tabs` });

/* The service's two self-describing routes, answered here so the journeys do not depend on whether a
   service is listening on the machine. The answer is production's shape on 24 September 2026 —
   activated, with the cloud voice's credentials refused as malformed — plus two planted fields no
   contract declares, which must never reach a screen. They are plainly not credentials. */
const PLANTED = 'planted-field-that-must-not-render';
const answer = { ok: true, mode: 'service', azure: true, ollama: false, production: true, activated: true, speech: false, region: PLANTED, endpoint: PLANTED };
async function answering(page: Page) {
 await page.route('**/assistant/health', route => route.fulfill({ json: answer }));
 await page.route('**/assistant/v1/status', route => route.fulfill({ json: answer }));
}
/* Anything that would make the browser speak or send a sentence to be spoken is recorded, so a test
   can say none was made. */
function speakRequests(page: Page) {
 const seen: string[] = [];
 page.on('request', request => { if (/\/speak\b|\/listen\b|\/turn\b/.test(request.url())) seen.push(request.url()); });
 return seen;
}
async function openSub(page: Page, label: string) {
 await goPortal(page, CATEGORY, label);
 await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 const tab = tabs.find(t => t.label === label)!;
 await expect(page.getByRole('heading', { level: 1, name: tab.heading ?? tab.label, exact: true })).toBeVisible();
}
async function start(page: Page, sub = subScreens[0]!.label) {
 await answering(page);
 await page.goto('/app/?role=back-office&category=gilbertone');
 await expect(tablist(page)).toBeVisible();
 if (sub !== subScreens[0]!.label) await openSub(page, sub);
 else await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
}

/* Every sub-screen's controls: none enabled, every one described by a sentence the contract holds, no
   password field enabled, and nothing key-shaped anywhere in what is drawn. Founder access's panel
   (.g1-founder, packages/catalog/founder-access.json) is the one exception — its sign-in and reveal
   are live when the service answers, and tests/founder-access.spec.ts holds them — so it alone is left
   out of the three control counts. The key-shape sweep still reads the whole screen. */
const OUTSIDE_FOUNDER = ':not(.g1-founder *)';
async function holdsNothingOpen(page: Page, where: string) {
 await expect(panel(page).locator(`button:not([disabled])${OUTSIDE_FOUNDER}`), `${where}: an enabled button`).toHaveCount(0);
 await expect(page.locator(`input[type="password"]:not([disabled])${OUTSIDE_FOUNDER}`), `${where}: an enabled password field`).toHaveCount(0);
 await expect(panel(page).locator(`input:not([disabled])${OUTSIDE_FOUNDER}`), `${where}: an enabled input`).toHaveCount(0);
 const described = await panel(page).locator('button[disabled], input[disabled][type="checkbox"]').evaluateAll(els => els.map(el => {
  const id = el.getAttribute('aria-describedby');
  return { name: el.textContent?.trim() || el.closest('label')?.textContent?.trim() || '', why: id ? document.getElementById(id)?.textContent?.trim() ?? '' : '' };
 }));
 const sentences = [...(g1.gates as Gate[]).map(g => g.sentence), ...(g1.actions as Action[]).flatMap(a => a.refusal ? [a.refusal] : [])];
 for (const d of described)
  expect(sentences.some(s => d.why.includes(s)), `${where}: "${d.name}" is disabled without its gate's sentence`).toBe(true);
 const text = await page.locator('main').innerText();
 expect(text, `${where}: something key-shaped is drawn`).not.toMatch(/\bsk-[A-Za-z0-9._-]{3,}|•{3,}\s*\w{4}|SHA-256\s+[0-9a-f]{4}/);
 expect(text, `${where}: a field the routes should not carry reached the screen`).not.toContain(PLANTED);
}

test.describe('every sub-screen, by the keyboard alone', () => {
 test('the arrows walk the seven sub-screens in the contract\'s order, each an address', async ({ page }) => {
  await start(page);
  await tablist(page).getByRole('tab', { selected: true }).focus();
  await page.keyboard.press('Home');
  for (const [i, sub] of subScreens.entries()) {
   if (i) await page.keyboard.press('ArrowRight');
   const tab = tablist(page).getByRole('tab', { name: sub.label, exact: true });
   await expect(tab).toBeFocused();
   await expect(tab).toHaveAttribute('aria-selected', 'true');
   await expect(page).toHaveURL(new RegExp(`category=gilbertone&tab=${sub.id}`));
   await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
   const heading = tabs.find(t => t.id === sub.id)!;
   await expect(page.getByRole('heading', { level: 1, name: heading.heading ?? heading.label, exact: true })).toBeVisible();
  }
  await page.keyboard.press('ArrowRight');
  await expect(tablist(page).getByRole('tab', { name: subScreens[0]!.label, exact: true })).toBeFocused();
  await expect(tablist(page).locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  /* Back walks the sub-screens, because each is an address. */
  await page.keyboard.press('End');
  await page.goBack();
  await expect(tablist(page).getByRole('tab', { selected: true })).toHaveText(subScreens[0]!.label);
 });

 test('a sub-screen opened by its address lands on itself', async ({ page }) => {
  await answering(page);
  await page.goto('/app/?role=control-tower&category=gilbertone&tab=api-registry');
  await expect(tablist(page).getByRole('tab', { selected: true })).toHaveText('API Registry');
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
 });
});

test.describe('each sub-screen shows what it holds, and acts on nothing', () => {
 test('Overview: booleans read live, the model and voice from their contracts, usage empty, dark mode refused', async ({ page }) => {
  await start(page);
  const words = g1.overview;
  for (const route of words.routes as { label: string }[]) {
   const card = panel(page).getByRole('article', { name: route.label });
   await expect(card.locator('.pt-status')).toHaveText('connected');
   for (const f of words.fields as { field: string; label: string }[])
    await expect(card.locator('.g1-fact').filter({ has: page.locator('dt', { hasText: f.label }) }).locator('dd'))
     .toHaveText((answer as Record<string, unknown>)[f.field] === true ? words.trueWord : words.falseWord);
  }
  const azure = providers.providers.find((p: { id: string }) => p.id === 'azure-openai');
  await expect(panel(page)).toContainText(azure.models.productionDeployment);
  await expect(panel(page)).toContainText(azure.region);
  for (const v of Object.values(assistant.voice.cloud.voices) as string[]) await expect(panel(page)).toContainText(v);
  for (const t of corpus.corpusTiers) await expect(panel(page)).toContainText(`${t.label}: ${t.entryCount}`);
  await expect(panel(page)).toContainText(overview.sections.find((s: { id: string }) => s.id === 'active-tenants').emptyState);
  await expect(panel(page)).toContainText(registry.usageAndBalance.usage.why);
  await expect(panel(page)).toContainText(words.versionEmpty);
  const darkMode = panel(page).getByRole('button', { name: action('tenant-dark-mode').label });
  await expect(darkMode).toBeDisabled();
  await expect(panel(page)).toContainText(gate('module-8').sentence);
  await holdsNothingOpen(page, 'Overview');
 });

 test('Overview: a service that does not answer is disconnected, and nothing below it is read', async ({ page }) => {
  await page.route('**/assistant/health', route => route.abort());
  await page.route('**/assistant/v1/status', route => route.abort());
  await page.goto('/app/?role=back-office&category=gilbertone');
  for (const route of g1.overview.routes as { label: string }[]) {
   const card = panel(page).getByRole('article', { name: route.label });
   await expect(card.locator('.pt-status')).toHaveText('disconnected');
   await expect(card).toContainText(g1.overview.notAnswered);
  }
 });

 test('Voice: the clinical rows are locked with nothing to save, and the preview refuses a person\'s details and plays nothing', async ({ page }) => {
  const spoken = speakRequests(page);
  await start(page, 'Voice');
  const table = panel(page).locator('table').first();
  for (const c of voice.queryClasses as { id: string; label: string; previewMaySaveAsDefault: boolean }[]) {
   const row = table.getByRole('row', { name: new RegExp(`^${c.label}`) });
   if (c.previewMaySaveAsDefault) await expect(row.getByRole('button')).toBeDisabled();
   else {
    await expect(row.getByRole('button'), `${c.label} offers a save`).toHaveCount(0);
    await expect(row).toContainText(g1.voice.lockedRowSentence);
   }
  }
  await expect(panel(page)).toContainText(voice.lockedSettings.pushToTalk.sentence);
  await expect(panel(page)).toContainText(voice.lockedSettings.captions.sentence);
  for (const l of assistant.voice.languages.filter((x: { ttsAvailable: boolean }) => !x.ttsAvailable))
   await expect(panel(page).locator('li').filter({ hasText: l.name })).toContainText(assistant.voice.voiceUnavailableNotice);

  const preview = panel(page).getByRole('region', { name: /the Voice screen/ });
  for (const q of voice.previewPanel.questions) await expect(preview).toContainText(q);
  const sentence = preview.getByLabel(g1.voice.previewTextLabel);
  /* A synthetic phone number: the shape the service's own detector refuses. */
  await sentence.fill('Please call me on 082 555 0123 about my results');
  await expect(preview.getByRole('alert')).toHaveText(voice.previewPanel.rejectsPatientIdentifiers.sentence);
  await expect(sentence).toHaveAttribute('aria-invalid', 'true');
  await sentence.fill('Your nurse is on the way.');
  await expect(preview.getByRole('alert')).toHaveCount(0);
  await expect(preview).toContainText(g1.voice.previewAccepted);
  /* The cost is said before Play, and Play is refused. */
  await expect(preview).toContainText(voice.previewPanel.costAndLatency.why);
  const play = preview.getByRole('button', { name: action('voice-play').label, exact: true });
  await expect(play).toBeDisabled();
  await expect(preview).toContainText(action('voice-play').refusal!);
  /* The locked register offers no save in the preview; a presentation register offers it disabled. */
  const register = preview.getByLabel(g1.voice.previewClassLabel);
  for (const c of voice.queryClasses as { id: string; previewMaySaveAsDefault: boolean }[]) {
   await register.selectOption(c.id);
   const save = preview.getByRole('button', { name: action('voice-save-as-default').label });
   if (c.previewMaySaveAsDefault) await expect(save).toBeDisabled();
   else { await expect(save).toHaveCount(0); await expect(preview).toContainText(voice.refusals.find((r: { id: string }) => r.id === 'no-save-as-default-on-a-locked-row').statement); }
  }
  await holdsNothingOpen(page, 'Voice');
  expect(spoken, 'the Voice screen asked something to speak').toEqual([]);
 });

 test('Model Providers: configured only where the contract says so, and no key anywhere', async ({ page }) => {
  await start(page, 'Model Providers');
  for (const p of providers.providers as { id: string; name: string }[]) {
   const card = panel(page).getByRole('article', { name: p.name });
   await expect(card.locator('.g1-card-status').first()).toHaveText(cards.find(c => c.id === p.id)!.statusToday);
   await expect(card.getByRole('button', { name: action('provider-rotate-key').label })).toBeDisabled();
  }
  const configured = providers.providers.filter((p: { productionConfigured: boolean }) => p.productionConfigured).length;
  await expect(panel(page).locator('.g1-card .g1-card-status', { hasText: /^configured$/ })).toHaveCount(configured);
  await expect(panel(page)).toContainText(g1.modelProviders.keyRegistryEmpty);
  const key = panel(page).getByLabel(g1.modelProviders.keyFieldLabel);
  await expect(key).toHaveAttribute('type', 'password');
  await expect(key).toBeDisabled();
  await expect(key).toHaveValue('');
  await expect(panel(page).getByRole('checkbox', { name: action('provider-show-metadata').label })).toBeDisabled();
  await expect(panel(page)).toContainText(gate('G30').sentence);
  await holdsNothingOpen(page, 'Model Providers');
 });

 test('Intelligence: the five levels and every ceiling read, the selector refused, the invariants said', async ({ page }) => {
  await start(page, 'Intelligence');
  await expect(panel(page).getByRole('list', { name: `${levels.levels.length} levels` }).locator('li')).toHaveCount(levels.levels.length);
  await expect(panel(page).locator('table tbody tr')).toHaveCount(levels.conversationTypes.length);
  for (const t of levels.conversationTypes) await expect(panel(page).getByRole('row', { name: new RegExp(`^${t.label}`) })).toContainText(t.why);
  await expect(panel(page).getByRole('button', { name: action('set-level').label })).toBeDisabled();
  await expect(panel(page)).toContainText(gate('G31').sentence);
  await expect(panel(page)).toContainText(levels.lockedToLevel0.sentence);
  for (const r of levels.refusals) await expect(panel(page)).toContainText(r.statement);
  await holdsNothingOpen(page, 'Intelligence');
 });

 test('Knowledge: two corpora, three sources none of them active, the clinical lock, and no address drawn', async ({ page }) => {
  await start(page, 'Knowledge');
  for (const t of corpus.corpusTiers) await expect(panel(page)).toContainText(t.sentence);
  const sources = panel(page).getByRole('list', { name: `${federation.sources.length} external sources, none active` });
  await expect(sources.locator('li')).toHaveCount(federation.sources.length);
  for (const s of federation.sources) {
   expect(s.active).toBe(false);
   await expect(sources.getByRole('article', { name: s.name })).toContainText(g1.knowledge.inactiveWord);
   await expect(panel(page)).not.toContainText(s.endpoint);
  }
  await expect(panel(page).locator('.g1-locked')).toContainText(corpus.refusals.find((r: { id: string }) => r.id === 'no-clinical-corpus-refresh-outside-the-review-queue').statement);
  await holdsNothingOpen(page, 'Knowledge');
 });

 test('Compliance: the pack, the audit extract for layer 13 only, the kill switch refused, every tier unassigned', async ({ page }) => {
  await start(page, 'Engine compliance');
  for (const s of pack.sections) await expect(panel(page)).toContainText(s.todayItWouldSay);
  await expect(panel(page)).toContainText(g1.compliance.auditEmpty);
  await expect(panel(page).getByRole('button', { name: action('kill-switch').label })).toBeDisabled();
  await expect(panel(page)).toContainText(gate('module-8').sentence);
  const residency = panel(page).getByRole('region', { name: g1.compliance.residencyHeading });
  for (const p of providers.providers) {
   const row = residency.getByRole('row', { name: new RegExp(`^${p.name.replace(/[()]/g, '\\$&')}`) });
   await expect(row).toContainText(g1.modelProviders.residencyUnassigned);
  }
  await expect(residency).toContainText(providers.providers.find((p: { id: string }) => p.id === 'azure-openai').region);
  await holdsNothingOpen(page, 'Compliance');
 });

 test('API Registry: every card in its group, configured only where the registry says, every action refused', async ({ page }) => {
  const spoken = speakRequests(page);
  await start(page, 'API Registry');
  for (const group of g1.apiRegistry.categories as { id: string; label: string }[]) {
   const members = cards.filter(c => c.category === group.id);
   if (!members.length) continue;
   const region = panel(page).getByRole('region', { name: new RegExp(`^${group.label}`) });
   await expect(region.locator('article.g1-card')).toHaveCount(members.length);
   for (const c of members) {
    const card = region.getByRole('article', { name: c.name, exact: true });
    await expect(card.locator('.g1-card-status').first()).toHaveText(c.statusToday);
    for (const a of (g1.actions as (Action & { registryAction?: string })[]).filter(x => x.registryAction))
     await expect(card.getByRole('button', { name: a.label, exact: true })).toBeDisabled();
   }
  }
  await expect(panel(page).locator('article.g1-card .g1-card-status', { hasText: /^configured$/ })).toHaveCount(cards.filter(c => c.statusToday === 'configured').length);
  await expect(panel(page)).toContainText(gate('G32').sentence);
  /* The preview travels with every text-to-speech card, and plays nothing there either. */
  const tts = cards.filter(c => (c.serves ?? []).includes('tts'));
  await expect(panel(page).locator('details.g1-details')).toHaveCount(tts.length);
  const first = panel(page).getByRole('article', { name: tts[0]!.name, exact: true });
  await first.locator('details.g1-details > summary').click();
  await expect(first.getByRole('button', { name: action('voice-play').label, exact: true })).toBeDisabled();
  /* The add-a-provider form: every field disabled, the key field a disabled, empty password field. */
  const form = panel(page).getByRole('group', { name: g1.apiRegistry.addHeading });
  await expect(form.locator('input')).toHaveCount(registry.addProvider.fields.length + 1);
  await expect(form.locator('input:not([disabled])')).toHaveCount(0);
  await expect(form.getByRole('button', { name: action('registry-add-provider').label })).toBeDisabled();
  await holdsNothingOpen(page, 'API Registry');
  expect(spoken, 'the API Registry asked something to speak').toEqual([]);
 });
});

test.describe('the accessibility floor on every sub-screen', () => {
 test('at the configured viewport, with reduced motion asked for', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  for (const sub of subScreens) {
   await openSub(page, sub.label);
   await audit(page, `GilbertOne · ${sub.label}`);
   const { nameless, positive, running } = await controlSweep(page);
   expect(nameless, `${sub.label}: controls with no accessible name`).toEqual([]);
   expect(positive, `${sub.label}: a positive tabindex`).toBe(0);
   expect(running, `${sub.label}: an animation running with reduced motion asked for`).toBe(0);
  }
 });

 test('at 200% zoom', async ({ page }) => {
  await zoomedTo200(page);
  await start(page);
  for (const sub of subScreens) {
   await openSub(page, sub.label);
   await audit(page, `GilbertOne · ${sub.label} at 200%`);
  }
 });
});
