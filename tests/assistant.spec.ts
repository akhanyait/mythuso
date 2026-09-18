import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noticeFor } from './notices';
import { confirmBooking, goSection } from './nav';
/* GilbertOne on the web.

   What is held here, in the order a person meets it.

   The orb floats on every patient page and is fetched lazily: the panel's code is requested only
   when somebody opens it, so the journey watches the request rather than trusting the build. On a
   phone the orb sits above the tab bar and covers none of its buttons; on a wide screen it leaves
   the footer's help link alone.

   The panel behaves like a dialog. It opens by click or keyboard, closes by Escape, its close button
   or the backdrop, keeps focus inside and gives it back to the orb, and the conversation survives
   closing.

   It says the contract's words. The voice notice verbatim; the sentence that GilbertOne not recognising
   an emergency does not mean there is not one, beside the conversation before anything is asked; and
   answers built from assistant.json, records.json and sos.json.

   The matcher, typed into. A question in a person's own words gets the contract's answer. A sentence
   with an emergency word in it is an emergency whatever else it asked. Anything nobody wrote an
   answer for gets "I can't assess that", the ambulance numbers, Thuso SOS and a way to a nurse — and
   the nurse handover shows what would be sent and says it was not.

   It never offers to listen. No microphone glyph, no listening word on any control, and no call to
   getUserMedia, SpeechRecognition, MediaRecorder or AudioContext. The web has a text box and nothing
   that hears.

   Motion stops rather than slows. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const gilbert = json('../packages/catalog/assistant.json');
const voice = json('../packages/catalog/capabilities.json').capabilities.find((c: { id: string }) => c.id === 'voice');
const sos = json('../packages/catalog/sos.json');
const laboratory = json('../packages/catalog/records.json').records.find((r: { id: string }) => r.id === 'laboratory').name;
const number = (id: string) => sos.emergency.numbers.find((n: { id: string }) => n.id === id).number;
const say = (text: string) => text.replace('{ambulance}', number('ambulance')).replace('{mobile}', number('mobile')).replace('{seconds}', String(gilbert.voice.maxListeningSeconds));
const cue = (id: string) => gilbert.states.find((s: { id: string }) => s.id === id).cue;
const condition = (id: string) => sos.redFlags.conditions.find((c: { id: string }) => c.id === id).name;
/* With nothing booked, GilbertOne says what the home card says about nothing booked, in scheduling.json's words. */
const schedulingLabels = json('../packages/catalog/scheduling.json').labels;
const nothingBooked = { name: gilbert.visitStates.none.name.replace('{noUpcoming}', schedulingLabels.noUpcoming), sentence: gilbert.visitStates.none.sentence.replace('{noUpcomingDetail}', schedulingLabels.noUpcomingDetail) };

const launcher = (page: Page) => page.getByRole('button', { name: gilbert.identity.callToAction, exact: true });
const panel = (page: Page) => page.getByRole('dialog', { name: gilbert.identity.name });
const log = (page: Page) => panel(page).getByRole('log', { name: gilbert.conversation.logLabel });
const field = (page: Page) => panel(page).getByLabel(gilbert.conversation.inputLabel);
const ask = async (page: Page, words: string) => {
 await field(page).fill(words);
 await panel(page).getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
};

/* Before the app's own code runs, so a reach for any way of hearing from anywhere on the page counts. */
const watchForListening = (page: Page) => page.addInitScript(() => {
 const tally = window as unknown as { __heard: string[] } & Record<string, unknown>;
 tally.__heard = [];
 const count = (name: string) => function () { tally.__heard.push(name); throw new Error('Refused by the assistant spec'); };
 if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { tally.__heard.push('getUserMedia'); return Promise.reject(new Error('Refused by the assistant spec')); };
 for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'MediaRecorder', 'AudioContext', 'webkitAudioContext']) {
  Object.defineProperty(window, name, { configurable: true, value: count(name) });
 }
});

/* Each animation inside an element, described well enough that a failure names what moved. */
const animationsIn = (page: Page, selector: string) => page.evaluate(selector =>
 document.getAnimations().filter(a => {
  const target = (a.effect as KeyframeEffect | null)?.target;
  return target instanceof Element && target.closest(selector);
 }).map(a => {
  const effect = a.effect as KeyframeEffect;
  const name = (a as Animation & { animationName?: string }).animationName ?? '';
  return `${a.playState} ${a.constructor.name}${name ? ` ${name}` : ''} on .${(effect.target as Element).className}${effect.pseudoElement ?? ''}`;
 }), selector);
const runningIn = (described: string[]) => described.filter(d => d.startsWith('running'));

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the orb floats on every patient page, and GilbertOne is fetched only when it is opened', async ({ page }) => {
 const fetched: string[] = [];
 page.on('request', request => { if (/features\/Assistant|features\/assistant\.css|lib\/assistant|catalog\/assistant\.json/.test(request.url())) fetched.push(request.url()); });
 await page.goto('/app/');
 await expect(page.getByRole('heading', { level: 1, name: 'Hello, Lerato' })).toBeVisible();
 await expect(launcher(page)).toBeVisible();
 await expect(launcher(page)).toHaveAttribute('aria-expanded', 'false');
 await goSection(page, 'My visits');
 await expect(launcher(page)).toBeVisible();
 expect(fetched, 'a patient page fetched GilbertOne before anybody reached for it').toEqual([]);
 await launcher(page).click();
 await expect(panel(page)).toBeVisible();
 expect(fetched.length).toBeGreaterThan(0);
 await expect(launcher(page)).toHaveAttribute('aria-expanded', 'true');
 // the descriptor is never shown without the disclosure that goes with it
 await expect(panel(page).getByText(gilbert.identity.descriptorLine, { exact: true })).toBeVisible();
 await expect(panel(page).getByText(gilbert.identity.descriptor, { exact: true })).toHaveCount(0);
 // the contract's own sentences, word for word
 await expect(panel(page).locator('.not-connected')).toHaveText(noticeFor('voice'));
 await expect(panel(page).locator('.as-silence')).toHaveText(say(gilbert.silenceIsNotSafety));
 await expect(panel(page).locator('.as-silence')).toBeInViewport();
 await expect(panel(page).locator('.as-keyboard')).toHaveText(gilbert.conversation.webKeyboardNote);
 await expect(panel(page).locator('.orb')).toHaveAttribute('aria-hidden', 'true');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'idle');
 await expect(panel(page).locator('.as-state')).toHaveText(cue('idle'));
 await expect(log(page)).toContainText('Nothing needs you.');
 for (const refusal of gilbert.refusals) await expect(panel(page).locator('.as-rule')).toContainText(refusal.statement);
});

test('on a phone the orb sits above the tab bar, clear of every tab', async ({ page, isMobile }) => {
 test.skip(!isMobile, 'The tab bar is the phone’s navigation.');
 await page.goto('/app/');
 await expect(launcher(page)).toBeVisible();
 const orb = (await launcher(page).boundingBox())!;
 const bar = (await page.locator('.tabbar').boundingBox())!;
 expect(orb.y + orb.height, 'the orb reaches down into the tab bar').toBeLessThanOrEqual(bar.y - 4);
 expect(orb.x + orb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 for (const tab of await page.locator('.tabbar button').all()) expect(overlaps(orb, (await tab.boundingBox())!)).toBe(false);
 await launcher(page).click();
 await expect.poll(async () => { const sheet = (await panel(page).boundingBox())!; return Math.round(sheet.y + sheet.height); }).toBe(page.viewportSize()!.height);
 expect(Math.round((await panel(page).boundingBox())!.width)).toBe(page.viewportSize()!.width);
 // the composer is at the foot of the sheet, where a thumb is, and inside it
 const compose = (await panel(page).locator('.as-compose').boundingBox())!;
 expect(Math.round(compose.y + compose.height)).toBeLessThanOrEqual(page.viewportSize()!.height);
 expect(compose.y).toBeGreaterThan(page.viewportSize()!.height / 2);
});

test('on a wide screen the orb leaves the footer alone and the panel is anchored bottom right', async ({ page, isMobile }) => {
 test.skip(isMobile, 'A phone has a sheet, not a panel, and no footer.');
 await page.goto('/app/');
 const orb = (await launcher(page).boundingBox())!;
 for (const link of await page.locator('.app-footer button').all()) expect(overlaps(orb, (await link.boundingBox())!)).toBe(false);
 await launcher(page).click();
 await expect(panel(page)).toBeVisible();
 await page.waitForTimeout(500); // the panel grows out of the orb; measure it once it has
 const box = (await panel(page).boundingBox())!;
 const { width, height } = page.viewportSize()!;
 expect(Math.round(box.width)).toBe(400);
 expect(Math.abs(width - (box.x + box.width) - 24)).toBeLessThanOrEqual(1);
 expect(Math.abs(height - (box.y + box.height) - 24)).toBeLessThanOrEqual(1);
});

test('the panel opens and closes like a dialog, keeps focus inside, and gives it back to the orb', async ({ page }) => {
 await page.goto('/app/');
 await launcher(page).click();
 await expect(panel(page)).toBeVisible();
 await expect(panel(page).getByRole('button', { name: 'Close GilbertOne' })).toBeFocused();
 for (let step = 0; step < 30; step++) {
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.getElementById('assistant-panel')?.contains(document.activeElement)), `focus left the panel after ${step + 1} tabs`).toBe(true);
 }
 await page.keyboard.press('Escape');
 await expect(panel(page)).toBeHidden();
 await expect(launcher(page)).toBeFocused();
 await expect(launcher(page)).toHaveAttribute('aria-expanded', 'false');

 // by keyboard, and the conversation is still there after closing
 await page.keyboard.press('Enter');
 await expect(panel(page)).toBeVisible();
 await panel(page).getByRole('button', { name: 'When is my nurse coming?' }).click();
 await panel(page).getByRole('button', { name: 'Close GilbertOne' }).click();
 await expect(panel(page)).toBeHidden();
 await expect(launcher(page)).toBeFocused();
 await launcher(page).click();
 await expect(log(page).locator('.as-said')).toHaveText([`${gilbert.conversation.youAsked}: When is my nurse coming?`]);
});

test('a suggested question gets the contract’s answer, and the emergency answer hands over to Thuso SOS', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await expect(panel(page)).toBeVisible();
 await panel(page).getByRole('button', { name: 'Are my results back?' }).click();
 await expect(log(page)).toContainText(`${laboratory} results have been released to your record.`);
 await expect(panel(page).locator('.as-name')).toHaveText('Result ready');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-depth', '2');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'guiding');

 await panel(page).getByRole('button', { name: 'Is everyone on my team registered?' }).click();
 await expect(panel(page).locator('.as-figure')).toContainText('45');

 await panel(page).getByRole('button', { name: 'What are you?' }).click();
 await expect(log(page).locator('.as-reply').last()).toContainText(gilbert.identity.whatItIsNot);

 await panel(page).getByRole('button', { name: 'What happens to what I say?' }).click();
 await expect(log(page).locator('.as-reply').last()).toContainText(gilbert.voice.sentences.web);

 await panel(page).getByRole('button', { name: 'What if it cannot wait?' }).click();
 const answer = log(page).locator('.as-reply').last();
 await expect(answer).toContainText(sos.emergency.headline);
 await expect(answer.locator('.as-numbers li').first()).toContainText('10177');
 await expect(panel(page).locator('.as-figure')).toHaveText('10177');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'escalate');
 await answer.getByRole('button', { name: /Open Thuso SOS/ }).click();
 await expect(panel(page)).toBeHidden();
 await expect(page.getByRole('dialog', { name: 'Thuso SOS' })).toBeVisible();
});

test('a typed question in a person’s own words gets the same contract answer', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await ask(page, 'hi, when’s my nurse coming??');
 // "nurse coming" is a trigger and every other word is filler, so the visit answer arrives on its own —
 // and with nothing booked on the web, it is the home card's own sentence for nothing booked
 await expect(log(page).locator('.as-said').last()).toContainText('hi, when’s my nurse coming??');
 await expect(log(page).locator('.as-reply').last()).toContainText(nothingBooked.sentence);
 await expect(log(page).locator('.as-reply').last()).toHaveAttribute('data-outcome', 'answer');
 await expect(panel(page).locator('.as-name')).toHaveText(nothingBooked.name);
 await expect(panel(page).locator('.as-state')).toHaveText(cue('guiding'));
 await expect(field(page)).toHaveValue('');
 // an empty message sends nothing
 await panel(page).getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
 await expect(log(page).locator('.as-said')).toHaveCount(1);
});

test('anything GilbertOne cannot match is told so, with the ambulance, Thuso SOS and a nurse — and the handover goes to a simulated queue without their words', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 const words = 'My knee has been sore since Tuesday';
 await ask(page, words);
 const answer = log(page).locator('.as-reply').last();
 await expect(answer.locator('.as-headline')).toHaveText(gilbert.answers.unmatched.sentence);
 await expect(answer).toContainText(gilbert.answers.unmatched.detail);
 await expect(answer).toContainText(say(gilbert.answers.unmatched.ifUrgent));
 await expect(answer.locator('.as-numbers li')).toHaveCount(2);
 await expect(answer.locator('.as-numbers li').nth(0)).toContainText('10177');
 await expect(answer.locator('.as-numbers li').nth(1)).toContainText('112');
 await expect(answer.getByRole('button', { name: gilbert.answers.unmatched.sosLabel })).toBeVisible();
 // unmatched is Guiding rather than Escalate: amber on every unrecognised sentence teaches people to ignore amber
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'guiding');

 await answer.getByRole('button', { name: gilbert.answers.unmatched.handoverLabel }).click();
 const handover = log(page).locator('.as-reply').last();
 const h = gilbert.answers.handover;
 await expect(handover.locator('.as-headline').first()).toHaveText(h.title);
 /* The structured summary: how they asked, what matched and an urgency that is never calm. Their words
    are not in it, and what does not go is said before anything goes. */
 const rows = handover.locator('.as-summary > div');
 await expect(rows).toHaveCount(3);
 await expect(rows.nth(0)).toContainText(h.channelTyped);
 await expect(rows.nth(1)).toContainText(h.nothingMatched);
 await expect(rows.nth(2)).toContainText(h.urgency.find((u: { id: string }) => u.id === 'not-assessed').name);
 await expect(handover.locator('.as-summary')).not.toContainText(words);
 for (const item of h.notCarried) await expect(handover).toContainText(item.sentence);
 await expect(handover.locator('.as-notsent')).toHaveText(h.notSent);
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'handover');
 await expect(panel(page).locator('.as-state')).toHaveText(cue('handover'));

 /* Handed to the simulated queue: a reference that says it is simulated, no nurse, and the ambulance
    numbers after it, because a queue nobody reads must not be the last thing an urgent person sees. */
 await handover.getByRole('button', { name: h.sendLabel }).click();
 const sent = handover.locator('.as-sent');
 await expect(sent.locator('.as-headline')).toHaveText(h.sentTitle);
 await expect(sent).toContainText(h.sent);
 await expect(sent.locator('.as-ref')).toHaveText(/^SIM-HO-/);
 await expect(sent).toContainText(h.stillUrgent);
 await expect(sent.locator('.as-numbers li').first()).toContainText('10177');
 await expect(handover.getByRole('button', { name: h.sendLabel })).toHaveCount(0);
});

test('an emergency word raises the answer, whatever else the message asked', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 // a question GilbertOne can answer, and a chest pain in the same breath: the chest pain wins
 await ask(page, 'When is my nurse coming? My chest hurts and I feel sick');
 const answer = log(page).locator('.as-reply').last();
 await expect(answer).not.toContainText('A nurse is expected on');
 await expect(answer.locator('.as-noticed')).toContainText(gilbert.answers.emergency.noticed);
 await expect(answer.locator('.as-noticed li')).toHaveText([condition('chest-pain')]);
 await expect(answer).toContainText(sos.emergency.headline);
 await expect(answer.locator('.as-numbers li').first()).toContainText('10177');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'escalate');
 await expect(panel(page).locator('.as-state')).toHaveText(cue('escalate'));
 await expect(panel(page).locator('.as-figure')).toHaveText('10177');

 // a crisis is never left to GilbertOne: no sos condition, still the numbers
 await ask(page, 'i dont want to be here, i want to die');
 await expect(log(page).locator('.as-reply').last().locator('.as-numbers li').first()).toContainText('10177');
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'escalate');

 /* And the nurse handover says an emergency was raised — whether, never which — and nothing asked
    afterwards lowers it: asking again with nothing more urgent sends nothing new. */
 const h = gilbert.answers.handover;
 await ask(page, 'can I talk to a nurse');
 const handover = log(page).locator('.as-reply').last();
 const rows = handover.locator('.as-summary > div');
 await expect(rows.nth(1)).toContainText(h.matchedEmergency);
 await expect(rows.nth(2)).toContainText(h.urgency.find((u: { id: string }) => u.id === 'emergency').name);
 await expect(handover).toContainText(h.neverLowered);
 await expect(handover.locator('.as-summary')).not.toContainText(condition('chest-pain'));
 await handover.getByRole('button', { name: h.sendLabel }).click();
 await expect(handover.locator('.as-sent .as-headline')).toHaveText(h.sentTitle);
 await ask(page, 'can I talk to a nurse');
 const again = log(page).locator('.as-reply').last();
 await expect(again.locator('.as-summary > div').nth(2)).toContainText(h.urgency.find((u: { id: string }) => u.id === 'emergency').name);
 await again.getByRole('button', { name: h.sendLabel }).click();
 await expect(again.locator('.as-sent .as-headline')).toHaveText(h.alreadySent);
});

/* The GilbertOne English engine (packages/gilbertone) makes the first emergency/handover
   decision and hands the web renderer a fixed trigger phrase to force its presentation — see
   apps/web/src/lib/gilbertone-bridge.ts. That phrase must never be what the person reads back
   as their own words, and an emergency it forces must still say which condition it noticed
   when the real, richer matcher agrees on one. */
test('the GilbertOne engine bridge echoes what was actually typed, not its own trigger phrase', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await ask(page, 'I have chest pain');
 const emergencyTurn = log(page).locator('.as-turn').last();
 await expect(emergencyTurn.locator('.as-said')).toContainText('I have chest pain');
 await expect(emergencyTurn.locator('.as-said')).not.toContainText('What if it cannot wait');
 await expect(emergencyTurn.locator('.as-reply')).toHaveAttribute('data-outcome', 'emergency');
 await expect(emergencyTurn.locator('.as-noticed li')).toHaveText([condition('chest-pain')]);
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'escalate');

 // an emergency word beside a handover request is still an emergency, not a handover
 await ask(page, 'I have chest pain, please get me a nurse');
 const both = log(page).locator('.as-turn').last();
 await expect(both.locator('.as-said')).toContainText('I have chest pain, please get me a nurse');
 await expect(both.locator('.as-reply')).toHaveAttribute('data-outcome', 'emergency');

 await ask(page, 'I want to talk to a nurse');
 const handoverTurn = log(page).locator('.as-turn').last();
 await expect(handoverTurn.locator('.as-said')).toContainText('I want to talk to a nurse');
 await expect(handoverTurn.locator('.as-said')).not.toContainText('Can I talk to a nurse');
 await expect(handoverTurn.locator('.as-reply')).toHaveClass(/as-reply-handover/);
});

test('starting again clears the conversation back to its opening', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await panel(page).getByRole('button', { name: 'When is my nurse coming?' }).click();
 await expect(log(page).locator('.as-said')).toHaveCount(1);
 await panel(page).getByRole('button', { name: gilbert.conversation.startAgainLabel }).click();
 await expect(log(page).locator('.as-said')).toHaveCount(0);
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'idle');
});

test('nothing about GilbertOne on the web offers to listen or reaches for a way to hear', async ({ page }) => {
 await watchForListening(page);
 await page.goto('/app/');
 await launcher(page).click();
 for (const question of ['Does anything need me?', 'What happens to what I say?', 'What if it cannot wait?']) {
  await panel(page).getByRole('button', { name: question }).click();
 }
 await ask(page, 'can you hear me');
 await ask(page, 'my shoulder aches');
 await expect(page.locator('[class*="lucide-mic"], [class*="lucide-audio"], [class*="waveform"], audio')).toHaveCount(0);
 // one text box, and it is a text box that hands nothing to the browser's own services
 await expect(panel(page).locator('input, textarea, [contenteditable="true"]')).toHaveCount(1);
 await expect(field(page)).toHaveAttribute('type', 'text');
 await expect(field(page)).toHaveAttribute('spellcheck', 'false');
 await expect(field(page)).toHaveAttribute('autocorrect', 'off');
 await expect(field(page)).toHaveAttribute('autocomplete', 'off');
 await expect(field(page)).toHaveAttribute('autocapitalize', 'off');
 await expect(field(page)).toHaveAttribute('aria-describedby', 'as-keyboard');
 await expect(page.locator('input[capture], input[accept*="audio"], input[accept*="video"]')).toHaveCount(0);
 const controls = [panel(page).getByRole('button'), launcher(page)];
 const names = (await Promise.all(controls.map(c => c.evaluateAll(buttons => buttons.map(b => `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`.trim()))))).flat();
 const offers = names.filter(name => /microphone|\bmic\b|voice input|dictat|speak now|(tap|hold|press) to (speak|talk)|start listening|listening|record/i.test(name));
 expect(offers, voice.neverSoften).toEqual([]);
 await expect(panel(page).locator('.orb')).not.toHaveAttribute('data-pulse', /listening|thinking/);
 expect(await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard)).toEqual([]);
});

test('the orb and the sphere move, and Pause motion stops both', async ({ page }) => {
 await page.goto('/app/');
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher')).length).toBeGreaterThan(0);
 await launcher(page).click();
 const orb = panel(page).locator('.orb');
 await expect(orb).toHaveAttribute('data-motion', 'running');
 expect(runningIn(await animationsIn(page, '.orb')).length).toBeGreaterThan(0);
 await panel(page).getByRole('button', { name: 'Pause motion' }).click();
 await expect(orb).toHaveAttribute('data-motion', 'paused');
 await expect.poll(async () => runningIn(await animationsIn(page, '.orb'))).toEqual([]);
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher'))).toEqual([]);
 await panel(page).getByRole('button', { name: 'Play motion' }).click();
 await expect(orb).toHaveAttribute('data-motion', 'running');
});

test('a hidden tab stops the orb', async ({ page }) => {
 await page.goto('/app/');
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher')).length).toBeGreaterThan(0);
 await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect.poll(async () => runningIn(await animationsIn(page, '.as-launcher'))).toEqual([]);
});

test('under reduced motion the orb and the sphere are still, complete frames, in every state', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.goto('/app/');
 await expect(launcher(page)).toBeVisible();
 expect(await animationsIn(page, '.as-launcher')).toEqual([]);
 await launcher(page).click();
 const orb = panel(page).locator('.orb');
 await expect(orb).toHaveAttribute('data-motion', 'still');
 await expect(panel(page).getByRole('button', { name: /Pause motion|Play motion/ })).toHaveCount(0);
 await panel(page).getByRole('button', { name: 'Are my results back?' }).click();
 await expect(panel(page).locator('.as-name')).toHaveText('Result ready');
 await ask(page, 'someone has collapsed');
 await expect(orb).toHaveAttribute('data-pulse', 'escalate');
 // the gathering reaction is suppressed as well as the breathing, and a state change starts nothing
 expect(await animationsIn(page, '.orb')).toEqual([]);
 const box = await panel(page).locator('.orb-body').boundingBox();
 expect(box?.width ?? 0).toBeGreaterThan(60);
 const painted = await panel(page).locator('.orb-particles').evaluate((canvas: HTMLCanvasElement) => {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) lit += 1;
  return lit;
 });
 expect(painted).toBeGreaterThan(0);
});

test('the open panel does not scroll sideways at 320px, with a long word typed and a handover open', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 await page.goto('/app/?open=assistant');
 await panel(page).getByRole('button', { name: 'What if it cannot wait?' }).click();
 await ask(page, 'Pneumonoultramicroscopicsilicovolcanoconiosisandsomemoreletters');
 await log(page).locator('.as-reply').last().getByRole('button', { name: gilbert.answers.unmatched.handoverLabel }).click();
 const overflow = await page.evaluate(() => {
  const root = document.scrollingElement!;
  const scroller = document.querySelector('.as-scroll')!;
  const compose = document.querySelector('.as-compose')!;
  return { page: root.scrollWidth - root.clientWidth, panel: scroller.scrollWidth - scroller.clientWidth, compose: compose.scrollWidth - compose.clientWidth };
 });
 expect(overflow.page).toBeLessThanOrEqual(1);
 expect(overflow.panel).toBeLessThanOrEqual(1);
 expect(overflow.compose).toBeLessThanOrEqual(1);
});

/* ---- The Wave 1 review's findings, each as a journey -------------------------------------------

   The matcher used to match emergency words exactly and then let an ordinary question answer calmly.
   Every sentence below was answered wrongly before the fix — a visit date, "Nothing needs you" — and
   must now raise, or say what it did not read. */
const reviewScenarios: [string, string][] = [
 ['When is my nurse coming? I have chest pains', 'chest-pain'],
 ['my visit today, my chest feels tight', 'chest-pain'],
 ['are my results back, I had seizures last night', 'seizure'],
 ['nurse coming, my baby is having convulsions', 'seizure'],
 ['any updates, my dad stopped breathing', 'breathing'],
 ['my visit — she bled a lot', 'bleeding'],
 ['he keeps passing out', 'unresponsive'],
 ['she blacked out', 'unresponsive'],
 ['difficulty breathing', 'breathing'],
 ['trouble breathing since this morning', 'breathing'],
 ['the contractions have started', 'obstetric'],
 ['I think he is overdosing', 'crisis'],
 ['she has fits', 'seizure'],
 ['hæmorrhage after the birth', 'bleeding'],
 ['my visit, call an ambulans', 'general']
];

test('every sentence the review found answered calmly now raises the emergency answer', async ({ page }) => {
 test.setTimeout(90_000);
 await page.goto('/app/?open=assistant');
 for (const [says, group] of reviewScenarios) {
  await ask(page, says);
  const reply = log(page).locator('.as-reply').last();
  await expect(reply, says).toHaveAttribute('data-outcome', 'emergency');
  await expect(reply, says).toHaveAttribute('data-groups', new RegExp(`\\b${group}\\b`));
  await expect(reply.locator('.as-numbers li').first(), says).toContainText('10177');
  await expect(reply, says).not.toContainText('A nurse is expected on');
  await expect(reply, says).not.toContainText('Nothing needs you');
  await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'escalate');
 }
});

test('a question with words GilbertOne could not read answers, and then says what it did not read', async ({ page }) => {
 await page.goto('/app/?open=assistant');
 await ask(page, 'when is my nurse coming, my knee is sore');
 const reply = log(page).locator('.as-reply').last();
 await expect(reply).toHaveAttribute('data-outcome', 'answer-and-unread');
 await expect(reply).toContainText(nothingBooked.sentence);
 const unread = reply.locator('.as-unread');
 await expect(unread.locator('.as-headline')).toHaveText(gilbert.answers.unread.sentence);
 await expect(unread).toContainText(gilbert.answers.unread.detail);
 await expect(unread.locator('.as-numbers li').nth(0)).toContainText('10177');
 await expect(unread.locator('.as-numbers li').nth(1)).toContainText('112');
 await expect(unread.getByRole('button', { name: gilbert.answers.unread.sosLabel })).toBeVisible();
 await expect(panel(page).locator('.orb')).toHaveAttribute('data-pulse', 'guiding');

 // "Nothing needs you" is never said to a message GilbertOne did not read all of
 await ask(page, 'any updates? my knee aches');
 const settled = log(page).locator('.as-reply').last();
 await expect(settled).toHaveAttribute('data-outcome', 'unmatched');
 await expect(settled).not.toContainText('Nothing needs you');
 await expect(settled).toContainText(gilbert.answers.unmatched.sentence);

 // and the question alone, in a person's own words, still answers on its own
 await ask(page, 'does anything need me');
 await expect(log(page).locator('.as-reply').last()).toHaveAttribute('data-outcome', 'answer');
 await expect(log(page).locator('.as-reply').last().locator('.as-unread')).toHaveCount(0);
});

/* The shared fixtures in packages/catalog/assistant.json, run against the module the browser actually
   loads. iOS runs the same list in its debug self-test and Android in a JVM test, so the three
   normalisers and matchers are held to one list rather than to each other. */
test('the web matcher agrees with the contract’s shared fixtures', async ({ page, isMobile }) => {
 test.skip(isMobile, 'Arithmetic, not layout: once is enough.');
 await page.goto('/app/');
 const disagreements = await page.evaluate(async ({ stemsFixtures, messageFixtures }) => {
  const lib = await import('/src/lib/assistant.ts');
  const found: string[] = [];
  for (const f of stemsFixtures) {
   const got = lib.stems(f.says);
   if (JSON.stringify(got) !== JSON.stringify(f.stems)) found.push(`stems of "${f.says}" were ${JSON.stringify(got)}`);
  }
  for (const f of messageFixtures) {
   const turn = lib.send(lib.opening(), f.says, null).at(-1);
   const kind = lib.outcomeOf(turn);
   const question = kind.startsWith('answer') ? turn.matched?.id ?? null : null;
   const groups = turn.groups.map((g: { id: string }) => g.id);
   if (kind !== f.expect || question !== (f.question ?? null) || JSON.stringify(groups) !== JSON.stringify(f.groups ?? [])) found.push(`"${f.says}" gave ${kind} ${question} ${JSON.stringify(groups)}`);
  }
  return found;
 }, { stemsFixtures: gilbert.fixtures.stems, messageFixtures: gilbert.fixtures.messages });
 expect(disagreements).toEqual([]);
});

/* One visit, one day. GilbertOne named the first day the calendar offers while the home card showed the visit
   actually booked. A visit is booked here the way the booking journey books one, the home card's date is
   read off the screen, and GilbertOne's answer must name the same day and time. */
test('GilbertOne names the visit the home card shows, not a day of its own', async ({ page }) => {
 test.setTimeout(90_000);
 await page.goto('/app/');
 await expect(page.getByText(nothingBooked.name).first()).toBeVisible();
 const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
 if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Book a nurse', exact: true }).click();
 else await page.locator('.tabbar button').nth(1).click();
 await page.getByRole('button', { name: /Elderly care/ }).first().click();
 const d = page.getByRole('dialog');
 for (let step = 0; step < 5; step++) await d.getByRole('button', { name: 'Continue' }).click();
 await d.getByRole('checkbox').check();
 await confirmBooking(d);
 await d.getByRole('button', { name: 'View my visits' }).click();
 if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Overview', exact: true }).click();
 else await page.locator('.tabbar button').nth(0).click();
 const card = page.locator('.visit-card small').first();
 await expect(card).toContainText('09:00');
 const cardWhen = (await card.innerText()).split(' – ')[0].trim();
 await launcher(page).click();
 await ask(page, 'when is my nurse coming');
 const reply = log(page).locator('.as-reply').last();
 await expect(reply).toHaveAttribute('data-outcome', 'answer');
 await expect(reply).toContainText(`A nurse is expected on ${cardWhen}.`);
});

/* The false positives in packages/catalog/gilbert-emergency-terms.json: ordinary sentences the terms raise
   today. Reported as an annotation, never a failure — a list that only ever raises accepts these, and
   tuning one out is a change to that file alone. */
test('false positives in the emergency terms are reported, not blocking', async ({ page, isMobile }) => {
 test.skip(isMobile, 'Arithmetic, not layout: once is enough.');
 await page.goto('/app/');
 const raised = await page.evaluate(async () => {
  const lib = await import('/src/lib/assistant.ts');
  return lib.falsePositives.messages.filter((m: { says: string }) => lib.emergencyGroupsIn(m.says).length > 0).map((m: { says: string }) => m.says);
 });
 const total = json('../packages/catalog/gilbert-emergency-terms.json').falsePositives.messages.length;
 test.info().annotations.push({ type: 'gilbert-false-positives', description: `${raised.length} of ${total} still raise: ${raised.join(' | ') || 'none'}` });
 console.log(`GilbertOne emergency terms: ${raised.length} of ${total} false-positive fixtures still raise`);
});
