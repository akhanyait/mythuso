import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, controlSweep, zoomedTo200 } from './audit';
import { chooseRole, goPortal } from './nav';
import { fill, say, settingsContract, timingItem } from './safety-settings';

/* GilbertOne API Administration's seven sub-screens, on both viewports (docs/PROMPT-CONTROL-TOWER-UI.md
 * §7, Phase 4).
 *
 * What is held here is what the screens refuse, because the assistant they administer is live in
 * production and nothing on them may act on it — with the two exceptions the founder decided on
 * 27 September 2026, held here as tightly as the refusals around them. Every sub-screen is reached by
 * the keyboard alone. Every gated action is disabled, and its gate's sentence is on the screen and tied
 * to it; the two live actions are enabled beside the founder's own sentence, and nothing else is. No
 * password field is enabled anywhere, and nothing key-shaped is ever drawn — not even when the health
 * route is made to answer with a planted field it should not have. On the Voice screen a presentation
 * row chooses one of the contract's two labels and saves it as a setting with a reason, which the
 * Configuration tab then shows in its history; a locked row offers nothing to choose and nothing to
 * save; the preview refuses a person's details, says the cost before Play, asks the contract's speak
 * route with the contract's voice name — the platform's default on a locked register whatever the
 * setting says — and asks nothing else to speak. In the patient's own panel, in the same tab, a routine
 * answer reads in the voice the administrator chose and the emergency answer in the platform's default.
 * A provider is configured only where its contract says so. And the accessibility measurements and
 * sweep of tests/audit.ts are taken on every one of the seven.
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
const sos = json('../packages/catalog/sos.json');

type Gate = { id: string; label: string; sentence: string };
type Action = { id: string; screen: string; label: string; gate: string | null; refusal?: string; live?: { since: string; decidedBy: string; sentence: string } };
type Card = { id: string; name: string; category: string; statusToday: string; buildStatus: string; environment?: string[]; gate?: string; serves?: string[]; pricing?: { perMillionCharactersUsd: number | null; unitCharacters: number; recordedOn: string } };
type QueryClass = { id: string; label: string; zone: string; previewMaySaveAsDefault: boolean; setting?: string };
type Language = { id: string; name: string; ttsAvailable: boolean; ttsVoices?: Record<string, string> };
const g1 = portal.gilbertone;
const CATEGORY = 'GilbertOne API Administration';
const subScreens = g1.subScreens as { id: string; label: string }[];
const tabs = (portal.categories as { id: string; tabs: { id: string; label: string; heading?: string }[] }[]).find(c => c.id === 'gilbertone')!.tabs;
const gate = (id: string) => (g1.gates as Gate[]).find(g => g.id === id)!;
const action = (id: string) => (g1.actions as Action[]).find(a => a.id === id)!;
const refusalOf = (a: Action) => a.refusal ?? gate(a.gate!).sentence;
const cards = registry.cards as Card[];
const classes = voice.queryClasses as QueryClass[];
const languages = assistant.voice.languages as Language[];
const english = languages[0]!;
/* The platform's default label and the other one, from the contract; the voice NAMES are read from the
   language's own list and never typed here — scripts/check-boundaries.mjs sweeps this file for one. */
const platformLabel = assistant.voice.cloud.defaultVoice as string;
const otherLabel = Object.keys(assistant.voice.cloud.voices).find(label => label !== platformLabel)!;
const voiceSettings = (voice.settings.items as { key: string; label: string; allowed: { value: string; label: string }[] }[]);
const liveActions = (g1.actions as Action[]).filter(a => a.live);

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
/* Anything that would make the browser speak or send a sentence to be spoken is recorded — the address
   and, for the speak route, the voice asked for — so a test can say none was made, or exactly which. */
type Spoken = { url: string; voice: string | null; text: string | null; register: string | null };
function speakRequests(page: Page) {
 const seen: Spoken[] = [];
 page.on('request', request => {
  if (!/\/speak\b|\/listen\b|\/turn\b/.test(request.url())) return;
  const body = request.postDataJSON() as { voice?: string; text?: string; register?: string } | null;
  seen.push({ url: request.url(), voice: body?.voice ?? null, text: body?.text ?? null, register: body?.register ?? null });
 });
 return seen;
}
const zoneOf = (classId: string | null) => classes.find(c => c.id === classId)?.zone ?? null;
/* The speak route, answered with a small fake reading that names the voice it was asked for. The bytes
   are not audio, so the browser will not play them; what the journeys assert is what was asked and what
   the screen said, never that a sound came out. */
async function speaking(page: Page) {
 await page.route('**/assistant/v1/speak', route => {
  const body = route.request().postDataJSON() as { voice?: string; language?: string };
  return route.fulfill({ json: { ok: true, audioBase64: 'AAAA', format: 'audio/mpeg', voice: body.voice ?? '', language: body.language ?? '' } });
 });
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

/* Every sub-screen's controls: none enabled but a live action's, every gated one described by a
   sentence the contract holds and every live one by the founder's, no password field enabled, and
   nothing key-shaped anywhere in what is drawn. Founder access's panel (.g1-founder,
   packages/catalog/founder-access.json) is the one exception — its sign-in and reveal are live when the
   service answers, and tests/founder-access.spec.ts holds them — so it alone is left out of the three
   control counts. The key-shape sweep still reads the whole screen. */
const OUTSIDE_FOUNDER = ':not(.g1-founder *)';
async function holdsNothingOpen(page: Page, where: string) {
 await expect(panel(page).locator(`button:not([disabled]):not(.g1-live)${OUTSIDE_FOUNDER}`), `${where}: an enabled button that is not a live action`).toHaveCount(0);
 await expect(page.locator(`input[type="password"]:not([disabled])${OUTSIDE_FOUNDER}`), `${where}: an enabled password field`).toHaveCount(0);
 /* The preview's voice chooser has been a group of radio chips since 27 September 2026, where it was a
    select this count never read; its radios are the one enabled input, and only on a presentation
    register's chooser, which the Voice test holds. Any other enabled input still fails here. */
 await expect(panel(page).locator(`input:not([disabled]):not(.g1-voice-chips input[type="radio"])${OUTSIDE_FOUNDER}`), `${where}: an enabled input`).toHaveCount(0);
 /* A live button is one of the contract's live actions, by name, and is described by that action's own
    sentence — or, while it waits, by a sentence the screen gives it — never by nothing. */
 const live = await panel(page).locator('button.g1-live').evaluateAll(els => els.map(el => {
  const id = el.getAttribute('aria-describedby');
  return { name: el.textContent?.trim() ?? '', why: id ? document.getElementById(id)?.textContent?.trim() ?? '' : '' };
 }));
 for (const l of live) {
  expect(liveActions.some(a => l.name === a.label || l.name.startsWith(`${a.label}:`)), `${where}: "${l.name}" is enabled and is not a live action`).toBe(true);
  expect(l.why.length > 0, `${where}: "${l.name}" is live and described by nothing`).toBe(true);
 }
 const described = await panel(page).locator('button[disabled]:not(.g1-live), input[disabled][type="checkbox"]').evaluateAll(els => els.map(el => {
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
 test('the arrows walk the eight sub-screens in the contract\'s order, each an address', async ({ page }) => {
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

 test('Voice: a presentation row chooses and saves a voice with a reason, a locked row offers nothing, and the preview says the cost, refuses a person\'s details and plays through the contract\'s route in the contract\'s voice', async ({ page }) => {
  const spoken = speakRequests(page);
  await speaking(page);
  await start(page, 'Voice');
  const table = panel(page).locator('table').first();
  const words = g1.voice;
  const routine = classes.find(c => c.previewMaySaveAsDefault)!;
  const locked = classes.filter(c => !c.previewMaySaveAsDefault);
  /* Every presentation row: a select of the setting's own choices showing the platform's default in
     force, and a live Save that waits while the choice is the one in force. Every locked row: no control
     at all, and the contract's sentence. */
  for (const c of classes) {
   const row = table.getByRole('row', { name: new RegExp(`^${c.label}`) });
   if (c.previewMaySaveAsDefault) {
    const select = row.getByRole('combobox', { name: fill(words.voiceSelectLabel, { class: c.label }) });
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue(platformLabel);
    const setting = voiceSettings.find(s => s.key === c.setting)!;
    await expect(select.locator('option')).toHaveText(setting.allowed.map(a => a.label));
    const save = row.getByRole('button', { name: `${action('voice-save-as-default').label}: ${c.label}` });
    await expect(save).toBeDisabled();
    await expect(save).toHaveClass(/g1-live/);
   } else {
    await expect(row.getByRole('button'), `${c.label} offers a save`).toHaveCount(0);
    await expect(row.getByRole('combobox'), `${c.label} offers a chooser`).toHaveCount(0);
    await expect(row).toContainText(words.lockedRowSentence);
   }
  }
  await expect(panel(page)).toContainText(action('voice-save-as-default').live!.sentence);
  await expect(panel(page)).toContainText(words.sessionSentence);
  /* Saving without a reason is refused in the shared rules' sentence; with one, the change is recorded
     and the row shows the new value in force. */
  const routineRow = table.getByRole('row', { name: new RegExp(`^${routine.label}`) });
  const routineSelect = routineRow.getByRole('combobox');
  const routineSave = routineRow.getByRole('button', { name: `${action('voice-save-as-default').label}: ${routine.label}` });
  await routineSelect.selectOption(otherLabel);
  await expect(routineSave).toBeEnabled();
  await routineSave.click();
  await expect(panel(page).getByRole('alert')).toHaveText((settingsContract.refusals as { id: string; statement: string }[]).find(r => r.id === 'setting-change-without-reason')!.statement);
  const reason = 'The routine greeting sounded like every other clinic; the founder asked to hear the other voice.';
  await panel(page).getByRole('group', { name: words.saveHeading }).getByLabel(say.reason).fill(reason);
  await routineSave.click();
  await expect(panel(page).getByRole('status')).toContainText(fill(say.applied.split('{at}')[0]!, { version: '2' }).trim());
  await expect(routineSave).toBeDisabled();
  const routineSetting = voiceSettings.find(s => s.key === routine.setting)!;
  await expect(routineRow).toContainText(fill(words.inForceSentence, { label: routineSetting.allowed.find(a => a.value === otherLabel)!.label }));
  /* The other presentation rows are untouched: one setting per class. */
  for (const c of classes.filter(x => x.previewMaySaveAsDefault && x.id !== routine.id))
   await expect(table.getByRole('row', { name: new RegExp(`^${c.label}`) }).getByRole('combobox')).toHaveValue(platformLabel);

  await expect(panel(page)).toContainText(voice.lockedSettings.pushToTalk.sentence);
  await expect(panel(page)).toContainText(voice.lockedSettings.captions.sentence);
  for (const l of languages.filter(x => !x.ttsAvailable))
   await expect(panel(page).locator('li').filter({ hasText: l.name })).toContainText(assistant.voice.voiceUnavailableNotice);

  const preview = panel(page).getByRole('region', { name: /the Voice screen/ });
  for (const q of voice.previewPanel.questions) await expect(preview).toContainText(q);
  const play = preview.getByRole('button', { name: action('voice-play').label, exact: true });
  const sentence = preview.getByLabel(words.previewTextLabel);
  await expect(preview).toContainText(words.previewCostEmpty);
  await expect(play).toBeDisabled();
  /* A synthetic phone number: the shape the service's own detector refuses, and Play stays shut. */
  await sentence.fill('Please call me on 082 555 0123 about my results');
  await expect(preview.getByRole('alert')).toHaveText(voice.previewPanel.rejectsPatientIdentifiers.sentence);
  await expect(sentence).toHaveAttribute('aria-invalid', 'true');
  await expect(play).toBeDisabled();
  const text = 'Your nurse is on the way.';
  await sentence.fill(text);
  await expect(preview.getByRole('alert')).toHaveCount(0);
  await expect(preview).toContainText(words.previewAccepted);
  /* The cost is said before Play, from the configured provider's recorded list price, and the session
     total is nothing yet. */
  const provider = cards.find(c => (c.serves ?? []).includes('tts') && c.statusToday === 'configured' && c.pricing)!;
  await expect(preview).toContainText(`${text.length} characters at`);
  await expect(preview).toContainText(provider.pricing!.recordedOn);
  await expect(preview).toContainText(provider.name);
  await expect(preview).toContainText(voice.refusals.find((r: { id: string }) => r.id === 'no-billed-preview-without-its-cost').statement);
  await expect(preview).toContainText(words.previewTotalEmpty);
  await expect(preview).toContainText(action('voice-play').live!.sentence);
  /* The language select offers the languages with a voice, and only those. */
  const language = preview.getByRole('combobox', { name: words.previewLanguageLabel, exact: true });
  await expect(language.locator('option')).toHaveText(languages.filter(l => l.ttsAvailable).map(l => l.name));
  /* On the presentation register the voice chooser — a radio chip per label, since 27 September 2026 a
     group rather than a select — follows the setting just saved; Play asks the contract's route with
     that label's name for the language. */
  const register = preview.getByRole('combobox', { name: words.previewClassLabel, exact: true });
  await register.selectOption(routine.id);
  const voiceChooser = preview.getByRole('group', { name: words.previewVoiceLabel, exact: true });
  const voiceChip = (value: string) => voiceChooser.getByRole('radio', { name: routineSetting.allowed.find(a => a.value === value)!.label, exact: true });
  for (const radio of await voiceChooser.getByRole('radio').all()) await expect(radio).toBeEnabled();
  await expect(voiceChip(otherLabel)).toBeChecked();
  await expect(preview).toContainText(english.ttsVoices![otherLabel]!);
  await expect(play).toBeEnabled();
  await play.click();
  await expect.poll(() => spoken.length).toBe(1);
  expect(spoken[0]!.url).toMatch(new RegExp(`${g1.overview.prefix}${words.previewRoute.path}$`));
  expect(spoken[0]!.voice).toBe(english.ttsVoices![otherLabel]);
  expect(spoken[0]!.text).toBe(text);
  await expect(preview).toContainText(fill(words.previewTotalSentence.split('{cost}')[0]!, { plays: '1' }).trim());
  /* On a locked register the voice chooser is disabled on the platform's default alone, no Save is
     offered, and Play asks for the platform's voice whatever the setting says. */
  for (const c of locked) {
   await register.selectOption(c.id);
   await expect(voiceChooser.getByRole('radio')).toHaveCount(1);
   await expect(voiceChooser.getByRole('radio', { name: words.platformDefaultWord, exact: true })).toBeDisabled();
   await expect(voiceChooser.getByRole('radio', { name: words.platformDefaultWord, exact: true })).toBeChecked();
   await expect(preview).toContainText(words.lockedRowSentence);
   await expect(preview.getByRole('button', { name: action('voice-save-as-default').label })).toHaveCount(0);
   await expect(preview).toContainText(voice.refusals.find((r: { id: string }) => r.id === 'no-save-as-default-on-a-locked-row').statement);
  }
  await play.click();
  await expect.poll(() => spoken.length).toBe(2);
  expect(spoken[1]!.voice).toBe(english.ttsVoices![platformLabel]);
  /* And the preview's own Save on a presentation register goes through the same door. */
  await register.selectOption(routine.id);
  const previewSave = preview.getByRole('button', { name: action('voice-save-as-default').label, exact: true });
  await expect(previewSave).toBeDisabled();
  await voiceChip(platformLabel).check();
  await expect(previewSave).toBeEnabled();
  await preview.getByLabel(say.reason).fill('Back to the platform voice: the other one read the booking steps too fast.');
  await previewSave.click();
  await expect(preview.getByRole('status').last()).toContainText(fill(say.applied.split('{at}')[0]!, { version: '3' }).trim());
  await expect(routineSelect).toHaveValue(platformLabel);
  await holdsNothingOpen(page, 'Voice');
  expect(spoken.filter(s => !new RegExp(`${words.previewRoute.path}$`).test(s.url)), 'the Voice screen asked something other than the preview route to speak').toEqual([]);
  /* Since version four every reading names the register it is read as — the preview's chosen class —
     so the service reads it through that register's provider and tuning, and never a clinical one's. */
  expect(spoken.every(s => classes.some(c => c.id === s.register)), `every preview reading named one of the contract's registers: ${spoken.map(s => s.register).join(', ')}`).toBe(true);
  expect(spoken, 'the Voice screen spoke more than it was asked to').toHaveLength(2);

  /* The Configuration tab shows the same history: two changes on the routine setting, with the reason. */
  await goPortal(page, say.tab);
  const block = page.getByRole('region', { name: voice.settings.heading });
  await expect(block).toContainText(fill(say.version, { version: '3' }));
  const item = timingItem(block, routineSetting);
  await item.locator('summary').click();
  const history = item.locator('table tbody tr');
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText(reason);
 });

 test('Voice: a saved presentation voice reaches the patient\'s routine answer in the same tab, and the emergency answer reads in the platform\'s default', async ({ page }) => {
  /* The cloud voice is configured for this journey, so the panel asks the speak route rather than the
     browser's own voice; the turn route is dark, so every answer is the deterministic layer's. The
     browser's synthesiser is replaced with a silent stand-in before the app runs, as
     tests/assistant.spec.ts does, so no reply depends on what a test browser does on its own. */
  await page.addInitScript(() => {
   class StandInUtterance { text: string; constructor(text: string) { this.text = text; } }
   Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak() {}, cancel() {}, getVoices() { return []; }, pause() {}, resume() {} } });
   Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: StandInUtterance });
  });
  const spoken = speakRequests(page);
  await speaking(page);
  await page.route('**/assistant/v1/turn', route => route.abort());
  await page.route('**/assistant/health', route => route.fulfill({ json: { ...answer, speech: true } }));
  await page.route('**/assistant/v1/status', route => route.fulfill({ json: { ...answer, speech: true } }));
  await page.goto('/app/?role=back-office&category=gilbertone&tab=voice');
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
  const routine = classes.find(c => c.previewMaySaveAsDefault)!;
  const table = panel(page).locator('table').first();
  const row = table.getByRole('row', { name: new RegExp(`^${routine.label}`) });
  await row.getByRole('combobox').selectOption(otherLabel);
  await panel(page).getByRole('group', { name: g1.voice.saveHeading }).getByLabel(say.reason).fill('Hearing the other voice on the patient panel before deciding.');
  await row.getByRole('button', { name: `${action('voice-save-as-default').label}: ${routine.label}` }).click();
  await expect(panel(page).getByRole('status')).toBeVisible();

  /* The patient, in the same tab: the setting is still in this tab's memory. */
  await chooseRole(page, 'Patient');
  const gilbert = assistant;
  await page.getByRole('button', { name: gilbert.identity.callToAction, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: gilbert.identity.name });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('checkbox', { name: gilbert.consent.checkboxDoctor }).check();
  await sheet.getByRole('checkbox', { name: gilbert.consent.checkboxEmergency }).check();
  await sheet.getByRole('button', { name: gilbert.consent.accept }).click();
  const ask = async (words: string) => {
   await sheet.getByLabel(gilbert.conversation.inputLabel).fill(words);
   await sheet.getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
  };
  const log = sheet.getByRole('log', { name: gilbert.conversation.logLabel });
  /* A routine answer — a situation — is asked for in the voice the administrator chose. */
  await ask('Are my results back?');
  await expect.poll(() => spoken.filter(s => /\/speak\b/.test(s.url)).length).toBe(1);
  expect(spoken.filter(s => /\/speak\b/.test(s.url))[0]!.voice).toBe(english.ttsVoices![otherLabel]);
  expect(zoneOf(spoken.filter(s => /\/speak\b/.test(s.url))[0]!.register), 'a routine answer names a presentation register, so the administrator\'s speech settings reach it').toBe('presentation');
  /* The emergency answer is asked for in the platform's default, whatever was saved. */
  await ask('What if it cannot wait?');
  await expect(log.locator('.as-reply').last()).toContainText(sos.emergency.headline);
  await expect.poll(() => spoken.filter(s => /\/speak\b/.test(s.url)).length).toBe(2);
  expect(spoken.filter(s => /\/speak\b/.test(s.url))[1]!.voice).toBe(english.ttsVoices![platformLabel]);
  expect(zoneOf(spoken.filter(s => /\/speak\b/.test(s.url))[1]!.register), 'the emergency answer names a clinical-delivery register, which no speech setting reaches').toBe('clinical-delivery');
 });

 test('Speech settings: the provider in force per register, every built provider\'s card and settings, the locked items, the founder\'s own-voice record, and a setting changed through the shared editor with a reason', async ({ page }) => {
  await start(page, 'Speech settings');
  const words = g1.speech as Record<string, string>;
  const ttsCards = (voice.providers.tts as string[]).map(id => cards.find(c => c.id === id)!).filter(c => c.buildStatus === 'built');
  const azure = ttsCards[0]!;
  const settings = voice.settings.items as { key: string; label: string; help: string; type: string; unit: string | null; appliesTo: string; allowed?: { value: string | boolean; label: string }[]; default: { value: unknown } }[];
  const female = voiceSettings[0]!.allowed.find(a => a.value === platformLabel)!.label;
  /* The honest sentence first: the service reads these from the contract's defaults. */
  await expect(panel(page)).toContainText(words.serviceReadsDefaults!);
  /* Every presentation register reads through the platform default, in the platform's voice, and no own voice. */
  const inForce = panel(page).getByRole('region', { name: words.inForceHeading });
  for (const c of classes.filter(x => x.zone === 'presentation'))
   await expect(inForce).toContainText(fill(words.registerSentence!, { register: c.label, provider: azure.name, voice: female }));
  await expect(inForce).not.toContainText(words.ownVoiceOnWord!);
  await expect(inForce).toContainText((voice.refusals as { id: string; statement: string }[]).find(r => r.id === 'no-provider-setting-on-a-clinical-register')!.statement);
  /* Every built speaking provider is a card with its state, its residency and its own settings. */
  const providers = panel(page).getByRole('region', { name: words.providersHeading });
  for (const card of ttsCards) {
   const article = providers.getByRole('article', { name: card.name });
   await expect(article).toContainText(card.statusToday);
   await expect(article).toContainText((card as { regions?: { southAfricanRegion?: boolean } }).regions?.southAfricanRegion ? words.onshoreSentence! : fill(words.residencySentence!, { default: azure.name }));
   for (const s of settings.filter(x => x.key.startsWith(`${card.id.split('-')[0]}-`))) await expect(article).toContainText(`${s.label}:`);
  }
  const eleven = providers.getByRole('article', { name: cards.find(c => c.id === 'elevenlabs')!.name });
  await expect(eleven).toContainText(words.notExercisedSentence!);
  await expect(eleven).toContainText(cards.find(c => c.id === 'elevenlabs')!.buildStatus);
  const shared = providers.getByRole('article', { name: 'Every provider' });
  for (const s of settings.filter(x => !x.key.startsWith('presentation-voice-') && !ttsCards.some(c => x.key.startsWith(`${c.id.split('-')[0]}-`)))) await expect(shared).toContainText(`${s.label}:`);
  /* What is not a setting, and the founder's own-voice record. */
  const locked = voice.lockedSettings as Record<string, { sentence: string }>;
  for (const key of ['keysAndRegions', 'speakingStyle', 'utteranceCap', 'speechToTextProvider']) await expect(panel(page)).toContainText(locked[key]!.sentence);
  const own = voice.ownVoice as { decidedBy: string; decidedOn: string; sentence: string; consent: { anotherPerson: string } };
  const ownRegion = panel(page).getByRole('region', { name: words.ownVoiceHeading });
  await expect(ownRegion).toContainText(`Decided by the ${own.decidedBy} on ${own.decidedOn}.`);
  await expect(ownRegion).toContainText(own.sentence);
  await expect(ownRegion).toContainText(own.consent.anotherPerson);
  const ownSetting = settings.find(s => s.key === 'own-voice')!;
  await expect(ownRegion).toContainText(ownSetting.allowed!.find(a => a.value === ownSetting.default.value)!.label);
  /* No password field, nothing key-shaped, and the only enabled controls are the shared editor's own. */
  await expect(page.locator('input[type="password"]:not([disabled])')).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\bsk-[A-Za-z0-9._-]{3,}|•{3,}\s*\w{4}|SHA-256\s+[0-9a-f]{4}/);
  expect(text).not.toContain(PLANTED);
  const editor = panel(page).getByRole('region', { name: new RegExp(`^${words.editorHeading}`) });
  await expect(editor.getByRole('combobox', { name: say.engine })).toHaveCount(0);
  await expect(editor.getByRole('heading', { level: 2, name: voice.settings.heading })).toBeVisible();
  /* A change through the embedded editor: the Azure speed to ninety, with a reason, reviewed then
     confirmed in the shared words, and the provider card shows the value in force. */
  const speed = settings.find(s => s.key === 'azure-presentation-speed-percent')!;
  const item = editor.locator('.ss-timing').filter({ has: page.locator('strong', { hasText: new RegExp(`^${speed.label}$`) }) });
  await item.getByRole('button', { name: `${say.change} ${speed.label}` }).click();
  const form = item.getByRole('form', { name: `${say.change} ${speed.label}` });
  await form.getByLabel(fill(say.editors[speed.type]!, { unit: speed.unit ?? '' }), { exact: true }).fill('90');
  await form.getByRole('button', { name: say.review }).click();
  await expect(form.getByRole('alert')).toHaveText((settingsContract.refusals as { id: string; statement: string }[]).find(r => r.id === 'setting-change-without-reason')!.statement);
  await form.getByLabel(say.reason, { exact: true }).fill('Slower on the routine greeting, so a second-language listener can follow the price.');
  await form.getByRole('button', { name: say.review }).click();
  await expect(form.getByRole('group')).toContainText(speed.appliesTo);
  await form.getByRole('button', { name: say.confirm }).click();
  await expect(item.locator('.ss-in-force')).toContainText('90');
  await expect(providers.getByRole('article', { name: azure.name })).toContainText(`${speed.label}: 90`);
  await expect(editor).toContainText(fill(say.version, { version: '2' }));
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
   /* The name and not a longer one: since 28 September 2026 the map also holds the registry's
      Alibaba Qwen-ASR and Qwen-TTS rows, and "Alibaba Qwen" alone would match all three. */
   const row = residency.getByRole('row', { name: new RegExp(`^${p.name.replace(/[()]/g, '\\$&')}(?!-)`) });
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
    /* A card's variables and its gate are drawn from the registry — since 28 September 2026 the three
       speech providers built beside Azure render built · not-configured with theirs. */
    for (const variable of c.environment ?? []) await expect(card).toContainText(variable);
    if (c.gate) await expect(card).toContainText(c.gate);
    for (const a of (g1.actions as (Action & { registryAction?: string })[]).filter(x => x.registryAction))
     await expect(card.getByRole('button', { name: a.label, exact: true })).toBeDisabled();
   }
  }
  await expect(panel(page).locator('article.g1-card .g1-card-status', { hasText: /^configured$/ })).toHaveCount(cards.filter(c => c.statusToday === 'configured').length);
  await expect(panel(page)).toContainText(gate('G32').sentence);
  /* The preview travels with every text-to-speech card. It plays only on the card of the one provider
     that is built and configured; on every other card it says so in the contract's sentence and offers
     no Play, because nothing may call a provider the registry records as proposed. */
  const tts = cards.filter(c => (c.serves ?? []).includes('tts'));
  await expect(panel(page).locator('details.g1-details')).toHaveCount(tts.length);
  const configured = tts.find(c => c.statusToday === 'configured' && typeof c.pricing?.perMillionCharactersUsd === 'number')!;
  const builtOffshore = cards.filter(c => c.category === 'speech' && c.buildStatus === 'built' && c.id !== configured.id);
  expect(builtOffshore.map(c => c.id).sort(), 'the four providers built on 28 September 2026 — Whisper and Qwen in the morning, ElevenLabs in the evening').toEqual(['alibaba-qwen-asr', 'alibaba-qwen-tts', 'elevenlabs', 'openai-whisper']);
  for (const c of builtOffshore) expect(c.statusToday, `${c.id} is configured nowhere`).toBe('not-configured');
  for (const c of tts) {
   const card = panel(page).getByRole('article', { name: c.name, exact: true });
   await card.locator('details.g1-details > summary').click();
   const play = card.getByRole('button', { name: action('voice-play').label, exact: true });
   if (c.id === configured.id) { await expect(play).toHaveCount(1); await expect(play).toBeDisabled(); }
   else {
    await expect(play).toHaveCount(0);
    await expect(card).toContainText(fill(g1.voice.previewOnlyThrough, { provider: configured.name, card: c.name }));
   }
  }
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
