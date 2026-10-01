import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audit, controlSweep, zoomedTo200 } from './audit';
import { chooseRole, goPortal } from './nav';
import { fill, say, settingsContract } from './safety-settings';

/* GilbertOne API Administration's seven sub-screens, on both viewports (docs/PROMPT-CONTROL-TOWER-UI.md
 * §7, Phase 4; the Voice screen folded into Speech settings on 28 September 2026).
 *
 * What is held here is what the screens refuse, because the assistant they administer is live in
 * production and nothing on them may act on it — with the exceptions the founder decided on 27 and 28
 * September 2026, held here as tightly as the refusals around them. Every sub-screen is reached by
 * the keyboard alone. Every gated action is disabled, and its gate's sentence is on the screen and tied
 * to it; the live actions are enabled beside the founder's own sentence; the founder's own actions are
 * disabled here, because nobody is signed in (tests/founder-access.spec.ts signs in and holds them); and
 * nothing else is enabled. No password field is drawn anywhere, and nothing key-shaped is ever drawn —
 * not even when the health route is made to answer with a planted field it should not have. On the
 * Speech settings screen a register card chooses a provider and one of the contract's two voice labels
 * and saves them as settings with a reason, which the Configuration tab leaves to this screen alone; the
 * knobs are saved a group at a time; a locked row, in the fold, offers nothing to choose and nothing to
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
 /* A screen's cards arrive on a translate that interpolates through fractional pixels, and a chip's label
    measured at 43.9995px mid-arrival once put its 42px inner radio on the audit's list. The audit measures a
    screen at rest, so the arrival — the tokens' enter duration plus its two staggers, under a second — is let
    finish first. A wait on the animations' own finished promises hung on ones that never settle, so this is a
    plain wait for longer than the arrival takes; under reduced motion there is nothing to wait for. */
 await page.waitForTimeout(900);
}
async function start(page: Page, sub = subScreens[0]!.label) {
 await answering(page);
 await page.goto('/app/?role=back-office&category=gilbertone');
 await expect(tablist(page)).toBeVisible();
 if (sub !== subScreens[0]!.label) await openSub(page, sub);
 else await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
}

/* Every sub-screen's controls: none enabled but a live action's, every gated one described by a
   sentence the contract holds, every founder one — disabled, since nobody is signed in — by the founder
   words, and every live one by the founder's record; no password field drawn; and nothing key-shaped
   anywhere in what is drawn. Founder access's panel (.g1-founder, packages/catalog/founder-access.json)
   is the one exception — its sign-in and reveal are live when the service answers, and
   tests/founder-access.spec.ts holds them — so it alone is left out of the three control counts. The
   key-shape sweep still reads the whole screen. */
const OUTSIDE_FOUNDER = ':not(.g1-founder *)';
async function holdsNothingOpen(page: Page, where: string) {
 await expect(panel(page).locator(`button:not([disabled]):not(.g1-live)${OUTSIDE_FOUNDER}`), `${where}: an enabled button that is not a live action`).toHaveCount(0);
 await expect(page.locator(`input[type="password"]:not([disabled])${OUTSIDE_FOUNDER}`), `${where}: an enabled password field`).toHaveCount(0);
 /* The preview's voice chooser is a group of radio chips, and since 28 September 2026 the Speech settings
    screen's change panel draws the portal's shared chips, ranges and switches — radio, range and checkbox
    inputs, none of which takes text. Those are the enabled inputs; any other still fails here. */
 await expect(panel(page).locator(`input:not([disabled]):not(.g1-voice-chips input[type="radio"]):not(.g1-change input[type="radio"]):not(.g1-change input[type="range"]):not(.g1-change input[type="checkbox"])${OUTSIDE_FOUNDER}`), `${where}: an enabled input`).toHaveCount(0);
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
 const founderWords = Object.values(g1.founder.words as Record<string, string>).map(w => w.split('{')[0]!.trim()).filter(Boolean);
 const sentences = [...(g1.gates as Gate[]).map(g => g.sentence), ...(g1.actions as Action[]).flatMap(a => a.refusal ? [a.refusal] : []), ...founderWords];
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

 test('Speech settings: a register card chooses a provider and a voice and saves them with a reason, a locked row offers nothing, and the preview says the cost, refuses a person\'s details and plays through the contract\'s route in the contract\'s voice', async ({ page }) => {
  const spoken = speakRequests(page);
  await speaking(page);
  await start(page, 'Speech settings');
  const words = g1.voice;
  const speech = g1.speech as Record<string, string>;
  const routine = classes.find(c => c.previewMaySaveAsDefault)!;
  const locked = classes.filter(c => !c.previewMaySaveAsDefault);
  const routineSetting = voiceSettings.find(s => s.key === routine.setting)!;
  const providerSettings = voice.settings.items as { key: string; allowed?: { value: string; label: string }[] }[];
  const change = panel(page).getByRole('region', { name: new RegExp(`^${speech.changeHeading}`) });
  const preview = panel(page).getByRole('region', { name: new RegExp(voice.previewPanel.placements[0]) });
  const fold = panel(page).locator('details.g1-fold');
  /* The founder's order: the change fields, then the preview, then the fold, and the fold starts closed. */
  const order = await page.evaluate(() => {
   const change = document.querySelector('.g1-change');
   const preview = document.querySelector('.g1-preview');
   const fold = document.querySelector('details.g1-fold') as HTMLDetailsElement | null;
   const before = (a: Element | null, b: Element | null) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
   return { changeFirst: before(change, preview), previewBeforeFold: before(preview, fold), foldClosed: !!fold && !fold.open };
  });
  expect(order).toEqual({ changeFirst: true, previewBeforeFold: true, foldClosed: true });
  await expect(panel(page)).toContainText(fill(speech.sourceTab!, { version: '1' }));
  /* Every presentation register is a card: provider chips over the setting's own choices, voice chips over the
     two labels, the platform's default checked, and a live Save that waits while nothing differs. */
  for (const c of classes.filter(x => x.previewMaySaveAsDefault)) {
   const card = change.getByRole('article', { name: c.label, exact: true });
   const providerSetting = providerSettings.find(s => s.key === `presentation-provider-${c.id}`)!;
   const providers = card.getByRole('group', { name: fill(speech.providerLabel!, { register: c.label }) });
   await expect(providers.getByRole('radio')).toHaveCount(providerSetting.allowed!.length);
   await expect(providers.getByRole('radio', { name: providerSetting.allowed![0]!.label, exact: true })).toBeChecked();
   const voices = card.getByRole('group', { name: fill(speech.voiceLabel!, { register: c.label }) });
   const setting = voiceSettings.find(s => s.key === c.setting)!;
   await expect(voices.getByRole('radio')).toHaveCount(setting.allowed.length);
   for (const radio of await voices.getByRole('radio').all()) await expect(radio).toBeEnabled();
   await expect(voices.getByRole('radio', { name: setting.allowed.find(a => a.value === platformLabel)!.label, exact: true })).toBeChecked();
   const save = card.getByRole('button', { name: fill(speech.saveRegister!, { register: c.label }) });
   await expect(save).toBeDisabled();
   await expect(save).toHaveClass(/g1-live/);
  }
  await expect(panel(page)).toContainText(action('voice-save-as-default').live!.sentence);
  await expect(panel(page)).toContainText(action('speech-save-settings').live!.sentence);
  await expect(panel(page)).toContainText(words.sessionSentence);
  /* The locked rows live in the fold, as a sentence with no control at all. */
  await fold.locator('> summary').click();
  await expect(fold).toHaveAttribute('open', '');
  const table = fold.locator('table.g1-voice-table');
  for (const c of locked) {
   const row = table.getByRole('row', { name: new RegExp(`^${c.label}`) });
   await expect(row.getByRole('button'), `${c.label} offers a save`).toHaveCount(0);
   await expect(row.getByRole('radio'), `${c.label} offers a chooser`).toHaveCount(0);
   await expect(row).toContainText(words.lockedRowSentence);
  }
  await expect(fold).toContainText(voice.lockedSettings.pushToTalk.sentence);
  await expect(fold).toContainText(voice.lockedSettings.captions.sentence);
  for (const l of languages.filter(x => !x.ttsAvailable))
   await expect(fold.locator('li').filter({ hasText: l.name })).toContainText(assistant.voice.voiceUnavailableNotice);
  /* Saving without a reason is refused in the shared rules' sentence; with one, the change is recorded and the
     card shows the new value in force. */
  const routineCard = change.getByRole('article', { name: routine.label, exact: true });
  const routineVoices = routineCard.getByRole('group', { name: fill(speech.voiceLabel!, { register: routine.label }) });
  const routineChip = (value: string) => routineVoices.getByRole('radio', { name: routineSetting.allowed.find(a => a.value === value)!.label, exact: true });
  const routineSave = routineCard.getByRole('button', { name: fill(speech.saveRegister!, { register: routine.label }) });
  await routineChip(otherLabel).check();
  await expect(routineSave).toBeEnabled();
  await routineSave.click();
  await expect(change.getByRole('alert')).toHaveText((settingsContract.refusals as { id: string; statement: string }[]).find(r => r.id === 'setting-change-without-reason')!.statement);
  const reason = 'The routine greeting sounded like every other clinic; the founder asked to hear the other voice.';
  await change.getByLabel(say.reason).fill(reason);
  await routineSave.click();
  await expect(change.getByRole('status')).toContainText(fill(say.applied.split('{at}')[0]!, { version: '2' }).trim());
  await expect(routineSave).toBeDisabled();
  await expect(routineCard).toContainText(fill(words.inForceSentence, { label: `${cards.find(c => c.id === providerSettings.find(s => s.key === `presentation-provider-${routine.id}`)!.allowed![0]!.value)!.name}, ${routineSetting.allowed.find(a => a.value === otherLabel)!.label}` }));
  await expect(panel(page)).toContainText(fill(speech.sourceTab!, { version: '2' }));
  /* The other cards are untouched: one setting per class. */
  for (const c of classes.filter(x => x.previewMaySaveAsDefault && x.id !== routine.id)) {
   const setting = voiceSettings.find(s => s.key === c.setting)!;
   await expect(change.getByRole('article', { name: c.label, exact: true }).getByRole('radio', { name: setting.allowed.find(a => a.value === platformLabel)!.label, exact: true })).toBeChecked();
  }

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
  /* The cost is said before Play, from the configured provider's recorded list price, and the session total is nothing yet. */
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
  /* On the presentation register the preview's chooser follows the setting just saved; Play asks the contract's
     route with that label's name for the language. */
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
  /* On a locked register the chooser is disabled on the platform's default alone, no Save is offered, and Play
     asks for the platform's voice whatever the setting says. */
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
  /* And the preview's own Save on a presentation register goes through the same door, and the card follows. */
  await register.selectOption(routine.id);
  const previewSave = preview.getByRole('button', { name: action('voice-save-as-default').label, exact: true });
  await expect(previewSave).toBeDisabled();
  await voiceChip(platformLabel).check();
  await expect(previewSave).toBeEnabled();
  await preview.getByLabel(say.reason).fill('Back to the platform voice: the other one read the booking steps too fast.');
  await previewSave.click();
  await expect(preview.getByRole('status').last()).toContainText(fill(say.applied.split('{at}')[0]!, { version: '3' }).trim());
  await expect(routineChip(platformLabel)).toBeChecked();
  await holdsNothingOpen(page, 'Speech settings');
  expect(spoken.filter(s => !new RegExp(`${words.previewRoute.path}$`).test(s.url)), 'the Speech settings screen asked something other than the preview route to speak').toEqual([]);
  expect(spoken.every(s => classes.some(c => c.id === s.register)), `every preview reading named one of the contract's registers: ${spoken.map(s => s.register).join(', ')}`).toBe(true);
  expect(spoken, 'the Speech settings screen spoke more than it was asked to').toHaveLength(2);

  /* The Configuration tab draws no second copy of these settings — inside the founder's session the two would
     read different histories — and says where they are, with the way back here. */
  await goPortal(page, say.tab);
  await expect(page.getByRole('region', { name: voice.settings.heading })).toHaveCount(0);
  await expect(page.locator('.cf-area')).toContainText(say.assistantNote);
  await page.getByRole('button', { name: say.assistantOpen, exact: true }).click();
  await expect(tablist(page).getByRole('tab', { name: subScreens.find(s => s.id === 'speech')!.label, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page)).toContainText(fill(speech.sourceTab!, { version: '3' }));
 });

 test('Speech settings: a saved presentation voice reaches the patient\'s routine answer in the same tab, and the emergency answer reads in the platform\'s default', async ({ page }) => {
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
  await page.goto('/app/?role=back-office&category=gilbertone&tab=speech');
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
  const speech = g1.speech as Record<string, string>;
  const routine = classes.find(c => c.previewMaySaveAsDefault)!;
  const routineSetting = voiceSettings.find(s => s.key === routine.setting)!;
  const change = panel(page).getByRole('region', { name: new RegExp(`^${speech.changeHeading}`) });
  const card = change.getByRole('article', { name: routine.label, exact: true });
  await card.getByRole('group', { name: fill(speech.voiceLabel!, { register: routine.label }) }).getByRole('radio', { name: routineSetting.allowed.find(a => a.value === otherLabel)!.label, exact: true }).check();
  await change.getByLabel(say.reason).fill('Hearing the other voice on the patient panel before deciding.');
  await card.getByRole('button', { name: fill(speech.saveRegister!, { register: routine.label }) }).click();
  await expect(change.getByRole('status')).toBeVisible();

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

 test('Speech settings: the knobs in three groups saved one group at a time with a reason, the provider in force per register, every built provider\'s card and settings, the locked items and the founder\'s own-voice record in the fold', async ({ page }) => {
  await start(page, 'Speech settings');
  const words = g1.speech as Record<string, string>;
  const change = panel(page).getByRole('region', { name: new RegExp(`^${words.changeHeading}`) });
  const ttsCards = (voice.providers.tts as string[]).map(id => cards.find(c => c.id === id)!).filter(c => c.buildStatus === 'built');
  const azure = ttsCards[0]!;
  const settings = voice.settings.items as { key: string; label: string; help: string; type: string; unit: string | null; appliesTo: string; allowed?: { value: string | boolean; label: string }[]; default: { value: unknown } }[];
  const female = voiceSettings[0]!.allowed.find(a => a.value === platformLabel)!.label;
  const knobKeys = (card: Card) => settings.filter(x => x.key.startsWith(`${card.id.split('-')[0]}-`));
  const shared = settings.filter(x => !x.key.startsWith('presentation-') && !ttsCards.some(c => x.key.startsWith(`${c.id.split('-')[0]}-`)));
  /* Every built speaking card with knobs is a group of its own, and the rest are every provider's. */
  for (const card of ttsCards.filter(c => knobKeys(c).length)) {
   const group = change.getByRole('region', { name: card.name, exact: true });
   await expect(group).toContainText(fill(words.groupWord!, { group: card.name, count: String(knobKeys(card).length) }));
   for (const s of knobKeys(card)) await expect(group).toContainText(s.label);
   await expect(group.getByRole('button', { name: fill(words.saveGroup!, { group: card.name }) })).toBeDisabled();
  }
  const everyProvider = change.getByRole('region', { name: words.everyProviderWord!, exact: true });
  for (const s of shared) await expect(everyProvider).toContainText(s.label);
  /* The Azure speed to ninety by the slider's own keys, refused without a reason, saved with one, and the fold's
     card shows the value in force. */
  const speed = settings.find(s => s.key === 'azure-presentation-speed-percent')!;
  const slider = change.getByRole('slider', { name: speed.label, exact: true });
  await expect(slider).toHaveValue(String(speed.default.value));
  await slider.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('90');
  const azureGroup = change.getByRole('region', { name: azure.name, exact: true });
  const save = azureGroup.getByRole('button', { name: fill(words.saveGroup!, { group: azure.name }) });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(change.getByRole('alert')).toHaveText((settingsContract.refusals as { id: string; statement: string }[]).find(r => r.id === 'setting-change-without-reason')!.statement);
  await change.getByLabel(say.reason).fill('Slower on the routine greeting, so a second-language listener can follow the price.');
  await save.click();
  await expect(change.getByRole('status')).toContainText(fill(say.applied.split('{at}')[0]!, { version: '2' }).trim());
  await expect(save).toBeDisabled();
  await expect(panel(page)).toContainText(fill(words.sourceTab!, { version: '2' }));
  /* The fold: the honest sentence about the service, every register through the platform default in the platform's
     voice with no own voice, every built provider's card with its settings in force, what is not a setting, and the
     founder's own-voice record. */
  const fold = panel(page).locator('details.g1-fold');
  await fold.locator('> summary').click();
  await expect(fold).toContainText(words.serviceReadsDefaults!);
  const inForce = fold.getByRole('region', { name: new RegExp(`^${words.inForceHeading}`) });
  for (const c of classes.filter(x => x.zone === 'presentation'))
   await expect(inForce).toContainText(fill(words.registerSentence!, { register: c.label, provider: azure.name, voice: female }));
  await expect(inForce).not.toContainText(words.ownVoiceOnWord!);
  await expect(inForce).toContainText((voice.refusals as { id: string; statement: string }[]).find(r => r.id === 'no-provider-setting-on-a-clinical-register')!.statement);
  const providers = fold.getByRole('region', { name: new RegExp(`^${words.providersHeading}`) });
  for (const card of ttsCards) {
   const article = providers.getByRole('article', { name: card.name, exact: true });
   await expect(article).toContainText(card.statusToday);
   await expect(article).toContainText((card as { regions?: { southAfricanRegion?: boolean } }).regions?.southAfricanRegion ? words.onshoreSentence! : fill(words.residencySentence!, { default: azure.name }));
   for (const s of knobKeys(card)) await expect(article).toContainText(`${s.label}:`);
  }
  await expect(providers.getByRole('article', { name: azure.name, exact: true })).toContainText(`${speed.label}: 90`);
  const eleven = providers.getByRole('article', { name: cards.find(c => c.id === 'elevenlabs')!.name, exact: true });
  await expect(eleven).toContainText(words.notExercisedSentence!);
  await expect(eleven).toContainText(cards.find(c => c.id === 'elevenlabs')!.buildStatus);
  const everyCard = providers.getByRole('article', { name: words.everyProviderWord!, exact: true });
  for (const s of shared) await expect(everyCard).toContainText(`${s.label}:`);
  const locked = voice.lockedSettings as Record<string, { sentence: string }>;
  for (const key of ['keysAndRegions', 'speakingStyle', 'utteranceCap', 'speechToTextProvider']) await expect(fold).toContainText(locked[key]!.sentence);
  const own = voice.ownVoice as { decidedBy: string; decidedOn: string; sentence: string; consent: { anotherPerson: string } };
  const ownRegion = fold.getByRole('region', { name: words.ownVoiceHeading });
  await expect(ownRegion).toContainText(`Decided by the ${own.decidedBy} on ${own.decidedOn}.`);
  await expect(ownRegion).toContainText(own.sentence);
  await expect(ownRegion).toContainText(own.consent.anotherPerson);
  const ownSetting = settings.find(s => s.key === 'own-voice')!;
  await expect(ownRegion).toContainText(ownSetting.allowed!.find(a => a.value === ownSetting.default.value)!.label);
  /* No password field, nothing key-shaped, and no enabled control but the change fields and the live saves. */
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await holdsNothingOpen(page, 'Speech settings, knobs');
 });

 test('Model Providers: configured only where the contract says so, the founder\'s controls shut with nobody signed in, and no key anywhere', async ({ page }) => {
  await start(page, 'Model Providers');
  const founderWords = g1.founder.words as Record<string, string>;
  for (const p of providers.providers as { id: string; name: string }[]) {
   const card = panel(page).getByRole('article', { name: p.name });
   await expect(card.locator('.g1-card-status').first()).toHaveText(cards.find(c => c.id === p.id)!.statusToday);
   /* The founder's controls are drawn on every card and every one is disabled: no service answers here, so the
      gate is a preview and the founder is signed in nowhere. */
   for (const id of ['provider-show-metadata', 'provider-test', 'provider-rotate-key', 'provider-remove-key'])
    await expect(card.getByRole('button', { name: action(id).label, exact: true })).toBeDisabled();
   await expect(card).toContainText(founderWords.preview!);
  }
  const configured = providers.providers.filter((p: { productionConfigured: boolean }) => p.productionConfigured).length;
  await expect(panel(page).locator('.g1-card .g1-card-status', { hasText: /^configured$/ })).toHaveCount(configured);
  await expect(panel(page)).toContainText(g1.modelProviders.keyRegistryEmpty);
  /* No key field at all while nobody is signed in: the one password field is drawn inside the session, after
     Rotate key, and tests/founder-access.spec.ts holds it. */
  await expect(panel(page).locator('input[type="password"]')).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: action('provider-health-check').label })).toBeDisabled();
  await expect(panel(page)).toContainText(gate('G30').sentence);
  await expect(panel(page)).toContainText(portal.refusals.find((r: { id: string }) => r.id === 'founder-action-only-in-a-founder-session').statement);
  await holdsNothingOpen(page, 'Model Providers');
 });

 test('Intelligence: the five levels and every ceiling read, the selector refused, the invariants said', async ({ page }) => {
  await start(page, 'Intelligence');
  await expect(panel(page)).toContainText(g1.intelligence.founderNote);
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
  await expect(panel(page)).toContainText(g1.compliance.founderNote);
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
    /* Every registry action is on the card: the founder's five disabled because nobody is signed in, and
       Configure scopes disabled behind G32 with the card saying it has no contract. */
    for (const a of (g1.actions as (Action & { registryAction?: string })[]).filter(x => x.registryAction))
     await expect(card.getByRole('button', { name: a.label, exact: true })).toBeDisabled();
    await expect(card).toContainText((g1.founder.words as Record<string, string>).preview!);
    await expect(card).toContainText((g1.founder.words as Record<string, string>).noContract!);
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
