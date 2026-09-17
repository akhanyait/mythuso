import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/* GilbertOne, phase 1: the acceptance tests the scope document's §12 asks of a character
   demonstrator, as far as this phase reaches — AT01, AT02, AT03, AT04 in part, AT05, AT07 in part
   and AT12 in part. The rest of §12 is about a conversation, a model and an app action, none of
   which exist here, so there is nothing to test and nothing is asserted about them.

   §07'S VOICE IS REAL ON THIS PAGE from 17 September 2026, and that changed the shape of this file.
   Until then most of its voice assertions were assertions that something was absent: the control was
   not drawn and nothing reached for a way of hearing. AT03 is not, and never was, "the APIs are never
   reached" — it is "the state where the microphone is open appears only after capture starts". That
   is what is asserted below, precisely: nothing is reached by loading the page or by pressing
   anything unrelated to the microphone, and the word for an open microphone is never on the screen
   before the recogniser says it is open.

   THE RECOGNISER AND THE SYNTHESISER ARE STAND-INS, installed before the page loads. Headless
   Chromium ships the Web Speech API's surface but no recogniser behind it — a real `start()` ends in
   a `network` or `not-allowed` error rather than in words — so a suite that depended on one would be
   a suite that failed differently on every machine. The stand-ins are driven from the test, which is
   what makes a final transcript, a refused permission and a word-boundary stream all assertable. */

const DEMO = '/app/?preview=gilbertone';
const status = (page: Page) => page.locator('.go-status-note');
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const micState = (page: Page) => page.locator('.go-mic-state');
/* The one microphone control on the page. It is located by its class rather than by its label,
   because the label is the state — "Stop" while the microphone is open — and the ownership panel
   beside it has a Stop of its own for the rig. */
const mic = (page: Page) => page.locator('.go-mic-button');

/* The contracts, read here rather than retyped, so a reworded sentence fails this spec instead of
   quietly leaving the page saying something the product no longer says. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const gilbert = json('../packages/catalog/assistant.json');
const voiceCapability = json('../packages/catalog/capabilities.json').capabilities.find((c: { id: string }) => c.id === 'voice');
const gilbertRefusal = (id: string) => gilbert.refusals.find((r: { id: string }) => r.id === id).statement;
const webPoc = gilbert.voice.webPoc;
const seconds = (text: string) => text.replace('{seconds}', String(webPoc.maxListeningSeconds));

/** What the page reached for, and what the stand-ins were told to do. */
type VoiceHarness = {
 reached: string[];
 spoken: string[];
 boundaries: boolean;
 say(text: string, isFinal: boolean): void;
 finish(): void;
 fail(code: string): void;
};
const harness = (page: Page) => page.evaluate(() => (window as unknown as { __voice: VoiceHarness }).__voice);
const reached = (page: Page) => page.evaluate(() => (window as unknown as { __voice: VoiceHarness }).__voice.reached);
const drive = (page: Page, run: (voice: VoiceHarness) => void) =>
 page.evaluate(`(${run.toString()})(window.__voice)`);

/* The stand-ins, and the refusals that are still refusals. Recording is refused outright — nothing on
   this page may capture, buffer or keep a sample of audio, and the surest way to assert that is to
   fail if anything reaches for an API that could. A camera is refused the same way. */
async function installVoice(page: Page) {
 await page.addInitScript(() => {
  const control = {
   reached: [] as string[],
   spoken: [] as string[],
   boundaries: true,
   instance: null as null | Record<string, ((event?: unknown) => void) | null>,
   say(text: string, isFinal: boolean) {
    const listener = control.instance;
    if (!listener?.onresult) return;
    listener.onresult({ resultIndex: 0, results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } } });
   },
   finish() {
    const listener = control.instance;
    control.instance = null;
    listener?.onend?.();
   },
   /* A real recogniser fires `end` after `error`, always. The stand-in does too, because an adapter
      that only let go of its listener on one of the two would look fine here and need two taps in a
      browser. */
   fail(code: string) { control.instance?.onerror?.({ error: code }); control.finish(); }
  };
  (window as unknown as { __voice: typeof control }).__voice = control;

  /* Nothing here may record. These stay refused whatever the microphone is doing. */
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
  for (const name of ['getUserMedia', 'getDisplayMedia'] as const) {
   Object.defineProperty(navigator.mediaDevices, name, {
    configurable: true, value: () => { control.reached.push(name); return Promise.reject(new Error('refused by the test')); }
   });
  }
  for (const name of ['MediaRecorder', 'AudioContext', 'webkitAudioContext']) {
   Object.defineProperty(window, name, {
    configurable: true, value: function () { control.reached.push(name); throw new Error('refused by the test'); }
   });
  }
  const ask = navigator.permissions?.query?.bind(navigator.permissions);
  if (ask) navigator.permissions.query = (descriptor: PermissionDescriptor) => { control.reached.push(`permission:${descriptor.name}`); return ask(descriptor); };

  class StandInRecogniser {
   lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
   onstart: (() => void) | null = null;
   onend: (() => void) | null = null;
   onerror: ((event: unknown) => void) | null = null;
   onresult: ((event: unknown) => void) | null = null;
   constructor() { control.reached.push('new SpeechRecognition'); }
   start() {
    control.reached.push('SpeechRecognition.start');
    control.instance = this as unknown as Record<string, ((event?: unknown) => void) | null>;
    /* A real recogniser is open a moment after it is asked for, never in the same tick. The gap is
       the whole of the "starting" state, so the stand-in has one too. */
    setTimeout(() => { if (control.instance === (this as unknown as object)) this.onstart?.(); }, 30);
   }
   stop() { control.reached.push('SpeechRecognition.stop'); setTimeout(() => control.finish(), 5); }
   abort() { control.reached.push('SpeechRecognition.abort'); control.instance = null; }
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: StandInRecogniser });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: StandInRecogniser });

  class StandInUtterance {
   lang = '';
   onstart: (() => void) | null = null;
   onend: (() => void) | null = null;
   onerror: (() => void) | null = null;
   onboundary: ((event: { name: string; charIndex: number; charLength: number }) => void) | null = null;
   constructor(public text: string) {}
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: StandInUtterance });
  Object.defineProperty(window, 'speechSynthesis', {
   configurable: true,
   value: {
    speak(utterance: StandInUtterance) {
     control.reached.push('speechSynthesis.speak');
     control.spoken.push(utterance.text);
     setTimeout(() => {
      utterance.onstart?.();
      const words = utterance.text.split(' ');
      let at = 0, when = 40;
      for (const word of words) {
       const charIndex = at;
       if (control.boundaries) setTimeout(() => utterance.onboundary?.({ name: 'word', charIndex, charLength: word.length }), when);
       at += word.length + 1;
       when += 60;
      }
      setTimeout(() => utterance.onend?.(), when + 400);
     }, 10);
    },
    cancel() { control.reached.push('speechSynthesis.cancel'); },
    getVoices() { control.reached.push('speechSynthesis.getVoices'); return []; },
    pause() {}, resume() {}
   }
  });
 });
}

test.beforeEach(async ({ page }) => {
 await installVoice(page);
 await page.goto(DEMO);
 await expect(page.getByRole('heading', { name: 'Character demonstrator' })).toBeVisible();
});

test('AT01 · the character is transparent on every ground, and says it is a preview of nothing connected', async ({ page }) => {
 await expect(page.locator('.demo-pill')).toContainText('Design preview');
 await expect(page.getByText('Connected', { exact: true })).toHaveCount(0);
 const rig = page.locator('.go-stage .go-rig');
 await expect(rig).toHaveAttribute('aria-hidden', 'true');
 /* Nothing is painted behind the character: the only mark under it is the contact shadow, and the
    rig draws no full-bleed shape of its own. */
 const covering = await rig.evaluate(svg => [...svg.querySelectorAll('rect, ellipse, circle, path')]
  .filter(shape => { const box = shape.getBoundingClientRect(); const whole = svg.getBoundingClientRect();
   return box.width > whole.width * 0.95 && box.height > whole.height * 0.95; }).length);
 expect(covering).toBe(0);
 /* No ground of its own and nothing bleeding out of it: a transparent canvas and a contact shadow,
    rather than a panel or a glow that happens to match the page today. */
 expect(await rig.evaluate(el => { const style = getComputedStyle(el); return { background: style.backgroundColor, filter: style.filter }; }))
  .toEqual({ background: 'rgba(0, 0, 0, 0)', filter: 'none' });
 const size = async () => { const box = (await rig.boundingBox())!; return { width: box.width, height: box.height }; };
 const before = await size();
 for (const ground of ['Dark ground', 'Chequered ground']) {
  await page.getByRole('radio', { name: ground }).click();
  await expect(rig).toBeVisible();
  expect(await size()).toEqual(before);
 }
 /* The page's own controls are still reachable with the widget open — it is a floating panel, not a
    modal, and the way out of it is a button rather than a reload. */
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await expect(page.getByRole('button', { name: 'Close GilbertOne' })).toBeVisible();
 await page.getByRole('button', { name: 'Close the widget' }).click();
 await expect(page.getByRole('button', { name: 'Open GilbertOne' })).toBeVisible();
});

test('AT02 · blink, gaze, nod, the supportive pose and the yawn are each demonstrable, and each says so in words', async ({ page }) => {
 for (const [control, said] of [
  ['A03 Blink', 'GilbertOne blinks.'],
  ['A06 Look left', 'GilbertOne looks left.'],
  ['A06R Look right', 'GilbertOne looks right.'],
  ['A09 Acknowledge', 'GilbertOne acknowledges.'],
  ['A11 Support', 'GilbertOne holds a supportive pose.']
 ]) {
  await press(page, control);
  await expect(status(page)).toHaveText(said);
 }
 /* The yawn obeys its own rules against the reviewer as well: off in a care conversation, and a
    five-minute cooldown once it has run. */
 const yawn = page.getByRole('button', { name: 'A14 Yawn', exact: true });
 /* The supportive pose is one of §04's suppressors, so it is the reason first; with the face back at
    rest, the default of a care conversation is. */
 await expect(yawn).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Suppressed while Support is running');
 await press(page, 'A02 Idle');
 await expect(page.locator('.go-cue-blocked')).toContainText('Playful mode is off');
 await page.getByRole('button', { name: /Playful mode/ }).click();
 await expect(yawn).toBeEnabled();
 await yawn.click();
 await expect(status(page)).toHaveText('GilbertOne yawns.');
 await expect(yawn).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Cooling down');
});

test('AT02 · reduced motion and the pause control each stop nonessential movement and keep saying what the face is doing', async ({ page }) => {
 await page.getByRole('button', { name: 'Pause animation' }).click();
 await press(page, 'A03 Blink');
 await expect(status(page)).toContainText('paused');
 await press(page, 'A11 Support');
 await expect(status(page)).toHaveText('GilbertOne holds a supportive pose.');
 /* Paused means still: the rig holds one pose rather than walking a cue, so no transition is left
    running on the character. */
 expect(await page.locator('.go-stage .go-head').evaluate(el => el.getAnimations().length)).toBe(0);
 await page.getByRole('button', { name: 'Play animation' }).click();

 await page.emulateMedia({ reducedMotion: 'reduce' });
 await press(page, 'A03 Blink');
 await expect(status(page)).toContainText('Reduced motion is on');
 await expect(page.getByRole('button', { name: 'A14 Yawn', exact: true })).toBeDisabled();
 await press(page, 'A09 Acknowledge');
 await expect(status(page)).toHaveText('GilbertOne acknowledges.');
});

test('AT03 · nothing is reached by loading the page or pressing anything else, and the microphone is open only when it is', async ({ page }) => {
 /* Loading the page reaches for nothing. This is the half of AT03 that survived the voice landing,
    and it is the half that mattered: a page that opens a microphone to draw itself has taken a
    decision away from the person reading it. */
 expect(await reached(page)).toEqual([]);

 /* Neither does pressing things that have nothing to do with the microphone. */
 await press(page, 'A08 Process');
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await page.getByRole('textbox').fill('Can you hear me?');
 await page.getByRole('button', { name: /^Send this message/ }).click();
 await expect(page.locator('.go-shell-turn').last()).toContainText('No answering engine is connected');
 expect(await reached(page)).toEqual([]);

 /* And the state says the microphone is shut, in words, while it is. The word for the open state is
    nowhere on the page before capture starts — which is AT03 itself. */
 await expect(micState(page)).toContainText('Microphone off');
 await expect(page.locator('.go-mic')).not.toContainText('Listening.');

 /* The disclosure is above the control and readable before the first tap, because §07 asks for the
    route to be disclosed before capture rather than explained after it. */
 await expect(page.locator('#go-mic-disclosure')).toHaveText(seconds(webPoc.sentences.beforePermission));
 await expect(page.locator('#go-mic-disclosure')).toContainText('the company that makes the browser');

 /* Now the tap. Starting is not open: the state changes to the open one only when the recogniser
    says the microphone is open, which the stand-in does a moment later. */
 await mic(page).click();
 await expect(micState(page)).toContainText('Listening');
 await expect(micState(page)).toContainText(`after ${webPoc.maxListeningSeconds} seconds`);
 expect(await reached(page)).toEqual(['new SpeechRecognition', 'SpeechRecognition.start']);

 /* The control is a Stop while it is open, which is the contract's own label and the gesture it
    chose. Closing it puts the state back and leaves nothing open. */
 await mic(page).click();
 await expect(micState(page)).toContainText('Microphone off');
 await expect(page.locator('audio, video')).toHaveCount(0);
});

test('AT05 · a late trigger from an earlier turn changes nothing, and a lower track never displaces a higher one', async ({ page }) => {
 await press(page, 'Deliver a late trigger from an earlier turn');
 await expect(status(page)).toContainText('A late trigger from an earlier turn never restarts the mouth');
 await expect(status(page)).toContainText('A12 Clarify did not run');
});

test('AT07 · nothing playful can land while the urgent pose holds', async ({ page }) => {
 await page.getByRole('button', { name: /Playful mode/ }).click();
 await press(page, 'A16 Urgent support');
 await expect(status(page)).toContainText('steady, neutral face');
 await expect(page.getByRole('button', { name: 'A14 Yawn', exact: true })).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Suppressed while Urgent support is running');
 await press(page, 'A13 Appreciate');
 await expect(status(page)).toContainText('A13 Appreciate did not run');
 await expect(status(page)).toContainText('may not displace Safety override');
 /* Stop is an interruption, and an interruption is below safety: it may not dismiss the urgent face
    either. Only the thing that raised it lets it go. */
 await press(page, 'Stop');
 await expect(status(page)).toContainText('A15 Interrupt did not run');
 await press(page, 'Release any held pose');
 await expect(status(page)).toContainText('neutral pose');
});

test('AT07 · the yawn is suppressed while the microphone is open, which is §04\'s own suppressor', async ({ page }) => {
 await page.getByRole('button', { name: /Playful mode/ }).click();
 await expect(page.getByRole('button', { name: 'A14 Yawn', exact: true })).toBeEnabled();
 await mic(page).click();
 await expect(micState(page)).toContainText('Listening');
 await expect(page.getByRole('button', { name: 'A14 Yawn', exact: true })).toBeDisabled();
 await expect(page.locator('.go-cue-blocked')).toContainText('Suppressed while the microphone is open');
});

test('AT05/AT07 · Stop and the safety override each cancel the voice as well as the face', async ({ page }) => {
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 for (const [control, why] of [
  ['Stop', '§04: a stop event cancels current speech and stale cues'],
  ['A16 Urgent support', '§04: a safety override stops decorative motion and surfaces the action immediately']
 ]) {
  await page.getByRole('button', { name: /^Replay the spoken answer/ }).click();
  await expect(page.locator('.go-caption')).toBeVisible();
  await press(page, control);
  /* The synthesiser was told to stop, and the caption went with it. A face that has gone still while
     a cheerful sentence carries on being read out is the failure that ordering exists to prevent. */
  expect((await reached(page)).filter(name => name === 'speechSynthesis.cancel').length, why).toBeGreaterThan(0);
  await press(page, 'Release any held pose');
 }
});

test('AT12 · the page is keyboard operable, the spoken answer is captioned, and a failed character does not break the widget', async ({ page }) => {
 const blink = page.getByRole('button', { name: 'A03 Blink', exact: true });
 await blink.focus();
 await expect(blink).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(status(page)).toHaveText('GilbertOne blinks.');

 /* AT04's half that exists: the mouth follows actual playback, and the caption is on the screen at
    the same time. The widget is opened first, because the caption lives in it and comes down when
    the utterance ends rather than on a timer of its own. */
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await press(page, 'A10 Speak');
 /* Visible, not merely present: the caption lives outside the widget's scrolling body precisely so
    that a long transcript or an open review step cannot push it off the screen while a voice talks. */
 await expect(page.locator('.go-caption')).toBeVisible();
 await expect(page.locator('.go-caption')).toContainText('Speaking these words');
 await expect(page.locator('.go-caption')).toContainText('Your browser is reading these words out');
 expect((await harness(page)).spoken[0]).toContain('nothing on this page understood the question');

 await page.getByRole('button', { name: /Break the character/ }).click();
 await expect(page.locator('.go-rig-failed')).toBeVisible();
 await expect(page.getByRole('button', { name: 'Close GilbertOne' })).toBeVisible();
 await page.getByRole('textbox').fill('The text still works.');
 await page.getByRole('button', { name: /^Send this message/ }).click();
 await expect(page.locator('.go-person-turn').last()).toContainText('The text still works.');
});

test('§07 · the voice prompts are the product\'s own sentences, and the control they describe is drawn on this page alone', async ({ page }) => {
 const voice = page.locator('.go-voice');
 await expect(voice.getByRole('heading', { name: /Voice · §07/ })).toBeVisible();
 /* §07's five capability rows, each with what is built against it. */
 for (const row of ['Input', 'Output', 'Mouth movement', 'Timing', 'Privacy']) {
  await expect(voice.locator('.go-voice-row dt', { hasText: row })).toBeVisible();
 }
 /* The four input states are named in words, and all four belong to the one control. */
 for (const state of ['Microphone off', 'Starting', 'Listening', 'Error']) {
  await expect(voice.locator('.go-voice-state', { hasText: state })).toBeVisible();
 }
 await expect(voice).toContainText('All four belong to the one control above');
 /* One microphone control on the page, and it is this one. A second thing that might or might not be
    open is the affordance the capability's note forbids. */
 await expect(page.getByRole('button', { name: gilbert.voice.sentences.talkLabel })).toHaveCount(1);

 /* The contract's sentences, word for word, including the one saying the rest of the web is still
    typed to and the one saying no recording is kept. */
 for (const sentence of [
  seconds(webPoc.sentences.beforePermission),
  webPoc.sentences.unavailable,
  webPoc.sentences.refused,
  webPoc.sentences.failed,
  webPoc.sentences.interrupted,
  gilbert.voice.sentences.web,
  gilbert.conversation.webKeyboardNote,
  gilbertRefusal('no-audio-kept')
 ]) await expect(voice.locator('.go-voice-sentences')).toContainText(sentence);
 await expect(page.locator('.go-demo-head')).toContainText(webPoc.scope);

 /* What is still refused, and the capability's own note beside the refusal it explains. */
 const refusals = page.locator('.go-refusals');
 await expect(refusals).toContainText('Nothing on this page understands what you say to it');
 await expect(refusals).toContainText('There is no voice list and no chooser');
 await expect(refusals).toContainText('draws a waveform');
 await expect(refusals).toContainText(voiceCapability.neverSoften);
 /* And the capability's own notice, rendered by the component every other screen uses. */
 await expect(refusals.locator('.not-connected')).toContainText(voiceCapability.notice);
});

test('§07 · what the recogniser catches goes to the review step, is corrected there, and is discarded without keeping anything', async ({ page }) => {
 await mic(page).click();
 await expect(micState(page)).toContainText('Listening');
 /* An interim result, then the final one. The field is not rewritten under somebody's eyes while
    they are still speaking: the review opens when the microphone closes. */
 await drive(page, voice => voice.say('book a nurse for my mother on', false));
 await drive(page, voice => voice.say('book a nurse for my mother on Thursday', true));
 await expect(page.locator('.go-mic-words')).toContainText('Thursday');
 await expect(page.locator('.go-review')).toHaveCount(0);

 await mic(page).click();
 const field = page.getByLabel(gilbert.voice.sentences.correctLabel);
 await expect(field).toBeVisible();
 await expect(field).toHaveValue('book a nurse for my mother on Thursday');
 /* The panel opens on the field, because checking and correcting is what §07 asks the person to do,
    and it says where the words came from. */
 await expect(field).toBeFocused();
 await expect(page.locator('.go-review')).toContainText('These are the words your browser sent back');

 /* A correction goes into this transcript and nowhere else. */
 await field.fill('Book a nurse for my mother on Thursday.');
 await page.getByRole('button', { name: /^Send the corrected words/ }).click();
 await expect(page.locator('.go-person-turn').last()).toContainText('Book a nurse for my mother on Thursday.');
 await expect(page.locator('.go-shell-turn').last()).toContainText('nothing understood them, and nothing left this browser');
 await expect(field).toHaveCount(0);

 /* Discard keeps nothing, and the fixed example is what the demonstrator's own control opens on. */
 await page.getByRole('button', { name: 'Show the transcript review' }).click();
 await expect(field).toHaveValue('Demonstration transcript — nothing was captured');
 await page.getByRole('button', { name: gilbert.voice.sentences.discardLabel, exact: true }).click();
 await expect(field).toHaveCount(0);
 await expect(page.locator('.go-shell-turn').last()).toContainText('Discarded. Nothing was kept');
 /* Nothing was recorded at any point in that, and no storage of any kind was written. */
 expect((await reached(page)).filter(name => /MediaRecorder|AudioContext|getUserMedia/.test(name))).toEqual([]);
 expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('§07 · each way the microphone can fail says the contract\'s own sentence, and none of them is a retry loop', async ({ page }) => {
 const talk = mic(page);

 /* Permission switched off for this site. */
 await talk.click();
 await expect(micState(page)).toContainText('Listening');
 await drive(page, voice => voice.fail('not-allowed'));
 await expect(micState(page)).toContainText(webPoc.sentences.refused);
 await expect(micState(page)).toContainText('Error');

 /* Nothing caught. */
 await talk.click();
 await expect(micState(page)).toContainText('Listening');
 await drive(page, voice => voice.fail('no-speech'));
 await expect(micState(page)).toContainText(webPoc.sentences.failed);

 /* The microphone closing before anybody asked it to — the browser taking it back, or the cap
    running out. Both are the same closing and the same sentence. */
 await talk.click();
 await expect(micState(page)).toContainText('Listening');
 await drive(page, voice => voice.finish());
 await expect(micState(page)).toContainText(webPoc.sentences.interrupted);
 /* And it is over: a failure leaves the microphone shut and asks for nothing again on its own. */
 await expect(talk).toBeVisible();
 expect((await reached(page)).filter(name => name === 'SpeechRecognition.start')).toHaveLength(3);
});

test('§07 · a browser with no recogniser says so and offers nothing, rather than drawing a control that cannot work', async ({ page }) => {
 await page.addInitScript(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
 });
 await page.goto(DEMO);
 await expect(micState(page)).toContainText('Not available in this browser');
 await expect(micState(page)).toContainText(webPoc.sentences.unavailable);
 await expect(page.getByRole('button', { name: gilbert.voice.sentences.talkLabel })).toBeDisabled();
 /* And the page carries on being a page: the text field, the review step and the cues all work. */
 await press(page, 'A09 Acknowledge');
 await expect(status(page)).toHaveText('GilbertOne acknowledges.');
 expect(await reached(page)).toEqual([]);
});

test('§07 · the answer is really spoken, the caption is up while it is, and switching it off stops both', async ({ page }) => {
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await page.getByRole('button', { name: /^Replay the spoken answer/ }).click();
 const caption = page.locator('.go-caption');
 await expect(caption).toBeVisible();
 await expect(caption).toContainText('Speaking these words');
 await expect(caption).toContainText('nothing on this page understood the question');
 await expect(status(page)).toContainText('GilbertOne is speaking the demonstration answer');
 /* The synthesiser was actually reached, and with the caption's own words. */
 const spoken = (await harness(page)).spoken;
 expect(spoken.length).toBeGreaterThan(0);
 expect(spoken[spoken.length - 1]).toContain('This is a demonstration answer.');
 /* Word boundaries drive the mouth where the browser reports them, and the caption's label says so
    rather than leaving a reviewer to guess which clock the articulation is on. */
 await expect(caption).not.toContainText('sends no word timings');
 /* The caption comes down when the voice stops, so there is never a caption for words nobody is
    saying. */
 await expect(caption).toHaveCount(0, { timeout: 8000 });

 /* §07's explicit playback choice. With it off the cue does not run at all, and the row says why. */
 const spokenSwitch = page.getByRole('button', { name: /^Spoken answers/ });
 await expect(spokenSwitch).toHaveAttribute('aria-pressed', 'true');
 await spokenSwitch.click();
 await expect(spokenSwitch).toHaveAttribute('aria-pressed', 'false');
 await expect(page.getByRole('button', { name: /^Replay the spoken answer/ })).toBeDisabled();
 const speak = page.getByRole('button', { name: 'A10 Speak', exact: true });
 await expect(speak).toBeDisabled();
 /* Scoped to its own row: the yawn's row is refused as well, by default, and a page with two refused
    controls on it should not make either assertion depend on which one comes first. */
 await expect(page.locator('.go-cue-blocked', { hasText: 'nothing is spoken' })).toBeVisible();
 const before = (await harness(page)).spoken.length;
 await spokenSwitch.click();
 await expect(speak).toBeEnabled();
 expect((await harness(page)).spoken).toHaveLength(before);
});

test('§07 · a browser that reports no word boundaries falls back to the caption\'s own timing, and says which', async ({ page }) => {
 await drive(page, voice => { voice.boundaries = false; });
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await page.getByRole('button', { name: /^Replay the spoken answer/ }).click();
 const caption = page.locator('.go-caption');
 await expect(caption).toBeVisible();
 await expect(caption).toContainText('this browser sends no word timings');
 /* It is a fallback, not a refusal: the answer is still spoken and the caption is still up.
    §07 asks for a restrained speaking indicator here, and this is it, in words. */
 expect((await harness(page)).spoken.length).toBeGreaterThan(0);
 await expect(caption).toContainText('nothing on this page understood the question');
});

test('the demonstrator never claims to be the live assistant, a service, or connected to anything', async ({ page }) => {
 const words = await page.locator('body').innerText();
 expect(words).toContain("This is a preview of GilbertOne's presentation, not GilbertOne itself");
 expect(words).not.toMatch(/\bConnected\b/);
 /* Nothing is written to storage of any kind, on a page that holds what somebody types and what a
    recogniser sent back. */
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 await page.getByRole('textbox').fill('Something private.');
 await page.getByRole('button', { name: /^Send this message/ }).click();
 await mic(page).click();
 await drive(page, voice => voice.say('something else private', true));
 await mic(page).click();
 expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('the page has no horizontal overflow at 320px, inside its scrolling regions as well as at the page level', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 await page.getByRole('button', { name: 'Open GilbertOne' }).click();
 const overflow = await page.evaluate(() => {
  const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const inside = [...document.querySelectorAll<HTMLElement>('main, .go-body, .go-panel, .go-cue-list, .go-mic')]
   .map(el => el.scrollWidth - el.clientWidth);
  return { page, inside: Math.max(0, ...inside) };
 });
 expect(overflow).toEqual({ page: 0, inside: 0 });
});
