import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/* Hands-free conversation with GilbertOne — the founder's brief of 28 September 2026: "when you have
 * spoken to it and you pause, it must respond automatically, just like Siri — not answering on top of
 * you. I don't have to press a button to respond."
 *
 * What is held here is the brief on a real page, in the contract's own words and never retyped: one
 * tap starts it behind the session's consent; words and then a pause become a turn with no click;
 * the reply is read and when the voice finishes the microphone reopens on its own; words arriving
 * while the voice reads cut it and become the next turn; an emergency answer closes the microphone
 * and its sentence says so; Stop ends everything; two quiet windows close the microphone with the
 * sleeping sentence; and a spoken "I have a headache" then "yes" walks the same intake a typed one
 * does, through the panel's one send path.
 *
 * The browser's recogniser and voice are both replaced before the app runs: a stand-in recogniser the
 * test feeds words and endings, and a stand-in synthesiser that records what it was asked and whose
 * end the test fires — so the turn hand-back is proved from the utterance's own end event and never
 * from a timer. Headless Chromium's own synthesiser would stall input delivery on a cancel. */
const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const gilbert = json("../packages/catalog/assistant.json");
const chat = json("../packages/catalog/conversation-mode.json");
const intake = json("../packages/catalog/symptom-intake.json");
const sentences: Record<string, string> = chat.sentences;
const endpointMs: number = chat.proposedSettings.items.find(
  (s: { key: string }) => s.key === chat.endpoint.settingKey,
).default.value;
const idleRounds: number = chat.proposedSettings.items.find(
  (s: { key: string }) => s.key === chat.sleep.settingKey,
).default.value;

type Result = { transcript: string; final: boolean };
type MicControl = {
  calls: string[];
  instance: {
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onresult: ((event: unknown) => void) | null;
  } | null;
  settled: boolean;
};
type SpeechControl = { calls: string[]; spoken: string[]; finish(): void };

const giveVoiceAndSpeech = (page: Page) =>
  page.addInitScript(() => {
    const scope = window as unknown as Record<string, unknown>;
    const mic: MicControl = { calls: [], instance: null, settled: false };
    class StandInRecogniser {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      constructor() {
        mic.calls.push("new");
      }
      start() {
        mic.calls.push("start");
        mic.settled = false;
        mic.instance = this as unknown as MicControl["instance"];
        const me = this as unknown as MicControl["instance"];
        setTimeout(() => {
          if (!mic.settled && mic.instance === me) this.onstart?.();
        }, 20);
      }
      stop() {
        mic.calls.push("stop");
        mic.settled = true;
        const me = this as unknown as MicControl["instance"];
        setTimeout(() => {
          if (mic.instance === me) {
            mic.instance = null;
            me?.onend?.();
          }
        }, 5);
      }
      abort() {
        mic.calls.push("abort");
        mic.settled = true;
        mic.instance = null;
      }
    }
    scope.SpeechRecognition = StandInRecogniser;
    scope.webkitSpeechRecognition = StandInRecogniser;
    scope.__mic = mic;

    class StandInUtterance {
      lang = "";
      text: string;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onboundary: ((event: unknown) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    let last: StandInUtterance | null = null;
    const speech: SpeechControl = {
      calls: [],
      spoken: [],
      finish() {
        speech.calls.push("fire:end");
        const done = last;
        last = null;
        done?.onend?.();
      },
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak(utterance: StandInUtterance) {
          speech.calls.push("speak");
          speech.spoken.push(utterance.text);
          last = utterance;
          setTimeout(() => {
            if (last === utterance) utterance.onstart?.();
          }, 10);
        },
        cancel() {
          speech.calls.push("cancel");
          last = null;
        },
        getVoices() {
          return [];
        },
        pause() {},
        resume() {},
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: StandInUtterance,
    });
    scope.__speech = speech;
  });

const mic = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mic: MicControl }).__mic.calls);
const speechCalls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __speech: SpeechControl }).__speech.calls,
  );
const spoken = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __speech: SpeechControl }).__speech.spoken,
  );
/* Words the way a real recogniser reports them, interim unless said otherwise. */
const hear = (page: Page, words: string, final = false) =>
  page.evaluate(
    ({ words, final }: Result) => {
      const control = (window as unknown as { __mic: MicControl }).__mic;
      control.instance?.onresult?.({
        resultIndex: 0,
        results: [{ length: 1, isFinal: final, 0: { transcript: words } }],
      });
    },
    { transcript: words, final, words } as Result & { words: string },
  );
/* The browser ending a window in which nothing was said. */
const quiet = (page: Page) =>
  page.evaluate(() => {
    const control = (window as unknown as { __mic: MicControl }).__mic;
    control.settled = true;
    const ended = control.instance;
    control.instance = null;
    ended?.onend?.();
  });
const endSpeech = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __speech: SpeechControl }).__speech.finish(),
  );
const micOpen = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __mic: MicControl }).__mic.instance !== null,
  );

const panel = (page: Page) =>
  page.getByRole("dialog", { name: gilbert.identity.name });
const status = (page: Page) => panel(page).locator(".as-voice-state");
const hot = (page: Page) => panel(page).locator("[data-mic-hot]");
const micButton = (page: Page) => panel(page).locator(".as-voice");
const pill = (page: Page) => panel(page).locator(".as-convo");
const lastSaid = (page: Page) =>
  panel(page).locator(".as-turn").last().locator(".as-said");
const lastReply = (page: Page) =>
  panel(page).locator(".as-turn").last().locator(".as-reply");
const consent = async (page: Page) => {
  const sheet = panel(page);
  await sheet
    .getByRole("checkbox", { name: gilbert.consent.checkboxDoctor })
    .check();
  await sheet
    .getByRole("checkbox", { name: gilbert.consent.checkboxEmergency })
    .check();
  await sheet.getByRole("button", { name: gilbert.consent.accept }).click();
};
/* One tap on the pill, then the session's own consent — the same two agreements push-to-talk asks
   for — and the conversation is running. */
const startTalking = async (page: Page) => {
  await pill(page).click();
  await panel(page)
    .getByRole("button", {
      name: gilbert.voice.session.consent.confirmLabel,
      exact: true,
    })
    .click();
  await expect(pill(page)).toHaveText(sentences.stopLabel);
  await expect(status(page)).toHaveText(sentences.listening);
  await expect(hot(page)).toHaveText(sentences.micHot);
  await expect(micButton(page)).toHaveAttribute("data-hot", "true");
};
/* Say something and pause for the contract's endpoint: the turn is sent with no click. */
const sayAndPause = async (page: Page, words: string) => {
  await hear(page, words);
  await expect(lastSaid(page)).toContainText(words, {
    timeout: endpointMs + 4000,
  });
};

test.beforeEach(async ({ page }) => {
  await giveVoiceAndSpeech(page);
  await page.goto("/app/?open=assistant");
  await consent(page);
});

test("the pill says the contract's words before a conversation, and nothing opens before consent", async ({
  page,
}) => {
  await expect(pill(page)).toHaveText(sentences.startLabel);
  /* Its words say which way it is, so neither it nor the microphone carries a pressed state beside them: a
     toggle whose name also flips is read as two answers to one question. */
  await expect(pill(page)).not.toHaveAttribute("aria-pressed", /.*/);
  await expect(micButton(page)).not.toHaveAttribute("aria-pressed", /.*/);
  expect(await mic(page)).toEqual([]);
  await pill(page).click();
  /* The consent sheet is on the screen and the microphone is still shut. */
  await expect(
    panel(page).getByRole("button", {
      name: gilbert.voice.session.consent.confirmLabel,
      exact: true,
    }),
  ).toBeVisible();
  expect(await mic(page)).toEqual([]);
  await expect(hot(page)).toHaveCount(0);
});

test("speak, pause, and GilbertOne answers by itself, reads it, and then listens again", async ({
  page,
}) => {
  await startTalking(page);
  const before = (await mic(page)).filter((c) => c === "start").length;
  await sayAndPause(page, "Are my results back?");
  /* The turn was sent by the pause alone — Send was never pressed — and answered. */
  await expect(lastReply(page)).toBeVisible();
  /* The reply is read aloud, and while it reads the recogniser is open again as the barge-in
     watcher: the indicator stays, and the words say what starting to talk will do. */
  await expect.poll(() => speechCalls(page)).toContain("speak");
  await expect(status(page)).toHaveText(sentences.bargeInNote);
  await expect(hot(page)).toHaveText(sentences.micHot);
  await expect.poll(() => mic(page).then((c) => c.filter((x) => x === "start").length)).toBeGreaterThan(before);
  /* The voice finishes: the microphone is hers again, and the panel says so. */
  await endSpeech(page);
  await expect(status(page)).toHaveText(sentences.yourTurn);
  await expect(hot(page)).toHaveText(sentences.micHot);
  await expect(pill(page)).toHaveText(sentences.stopLabel);
  /* Nothing was handed to the composer: the words were sent, not drafted. */
  await expect(panel(page).getByLabel(gilbert.conversation.inputLabel)).toHaveValue("");
});

test("starting to talk while GilbertOne reads stops the voice, and the words become the next turn", async ({
  page,
}) => {
  await startTalking(page);
  await sayAndPause(page, "Are my results back?");
  await expect.poll(() => speechCalls(page)).toContain("speak");
  await expect(status(page)).toHaveText(sentences.bargeInNote);
  const cancelsBefore = (await speechCalls(page)).filter((c) => c === "cancel").length;
  /* Two words over more than the contract's minimum: somebody talking, not a cough. */
  await hear(page, "what does");
  await page.waitForTimeout(chat.bargeIn.minSpeechMs + 100);
  await hear(page, "what does a visit include");
  await expect
    .poll(() => speechCalls(page).then((c) => c.filter((x) => x === "cancel").length))
    .toBeGreaterThan(cancelsBefore);
  /* The interruption is the next turn: a pause sends it. */
  await expect(lastSaid(page)).toContainText("what does a visit include", {
    timeout: endpointMs + 4000,
  });
  await expect(pill(page)).toHaveText(sentences.stopLabel);
});

/* The founder's listening cap, as the contract's web conversation reads it (conversation-mode.json
   web.listeningCapFrom), closes every window — and the window the microphone reopens into when the
   voice finishes is a window of its own. The watcher that listened over a long reading must not hand
   its spent cap to the patient's turn: she would get the few seconds left of it, and a quiet window
   cut short would count towards sleep. The page's clock is driven so thirty seconds pass at once. */
const capSeconds: number = gilbert.voice.maxListeningSeconds;
test("after a long reading the microphone gives her a whole listening window, not what the reading left", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/app/?open=assistant");
  await consent(page);
  await startTalking(page);
  await sayAndPause(page, "Are my results back?");
  await expect.poll(() => speechCalls(page)).toContain("speak");
  await expect(status(page)).toHaveText(sentences.bargeInNote);
  await expect.poll(() => micOpen(page)).toBe(true);
  /* A reading that runs most of the cap, with the watcher open over all of it. */
  await page.clock.fastForward((capSeconds - 5) * 1000);
  await endSpeech(page);
  await expect(status(page)).toHaveText(sentences.yourTurn);
  const stops = (await mic(page)).filter((c) => c === "stop").length;
  const starts = (await mic(page)).filter((c) => c === "start").length;
  /* Past the moment the watcher's cap would have fallen, and well inside a window of her own: still hers. */
  await page.clock.fastForward(10_000);
  await page.waitForTimeout(100);
  expect((await mic(page)).filter((c) => c === "stop").length).toBe(stops);
  await expect(status(page)).toHaveText(sentences.yourTurn);
  /* A whole cap later the window closes as a quiet round, and the microphone opens for another. */
  await page.clock.fastForward(capSeconds * 1000);
  await expect.poll(() => mic(page).then((c) => c.filter((x) => x === "stop").length)).toBeGreaterThan(stops);
  await expect.poll(() => mic(page).then((c) => c.filter((x) => x === "start").length)).toBeGreaterThan(starts);
  await expect(pill(page)).toHaveText(sentences.stopLabel);
});

test("a single stray word while GilbertOne reads does not stop it", async ({ page }) => {
  await startTalking(page);
  await sayAndPause(page, "Are my results back?");
  await expect.poll(() => speechCalls(page)).toContain("speak");
  const cancelsBefore = (await speechCalls(page)).filter((c) => c === "cancel").length;
  await hear(page, "ahem");
  await page.waitForTimeout(chat.bargeIn.minSpeechMs + 200);
  expect((await speechCalls(page)).filter((c) => c === "cancel").length).toBe(cancelsBefore);
  await expect(status(page)).toHaveText(sentences.bargeInNote);
});

test("an emergency answer closes the microphone, and the numbers stay on the screen", async ({
  page,
}) => {
  await startTalking(page);
  await sayAndPause(page, "someone has collapsed and is not breathing");
  await expect(lastReply(page)).toHaveClass(/as-reply-emergency/);
  await expect.poll(() => speechCalls(page)).toContain("speak");
  await endSpeech(page);
  await expect(status(page)).toHaveText(sentences.emergencyClosed);
  await expect(pill(page)).toHaveText(sentences.startLabel);
  await expect(hot(page)).toHaveCount(0);
  await expect.poll(() => micOpen(page)).toBe(false);
  await expect(lastReply(page)).toHaveClass(/as-reply-emergency/);
});

test("Stop ends everything at once, and the words caught go nowhere", async ({ page }) => {
  await startTalking(page);
  await hear(page, "I was about to ask");
  await pill(page).click();
  await expect(pill(page)).toHaveText(sentences.startLabel);
  await expect(hot(page)).toHaveCount(0);
  await expect.poll(() => micOpen(page)).toBe(false);
  await page.waitForTimeout(endpointMs + 200);
  /* Nothing was sent and nothing was drafted. */
  await expect(panel(page).locator(".as-turn")).toHaveCount(1);
  await expect(panel(page).getByLabel(gilbert.conversation.inputLabel)).toHaveValue("");
});

test("every tap of the microphone while a conversation runs is its Stop", async ({ page }) => {
  await startTalking(page);
  await expect(micButton(page)).toHaveAttribute("aria-label", sentences.stopLabel);
  await micButton(page).click();
  await expect(pill(page)).toHaveText(sentences.startLabel);
  await expect.poll(() => micOpen(page)).toBe(false);
});

test("quiet windows close the microphone on their own, with the contract's sentence", async ({
  page,
}) => {
  await startTalking(page);
  for (let round = 1; round < idleRounds; round += 1) {
    const starts = (await mic(page)).filter((c) => c === "start").length;
    await quiet(page);
    /* One quiet window reopens the microphone for another. */
    await expect.poll(() => mic(page).then((c) => c.filter((x) => x === "start").length)).toBeGreaterThan(starts);
    await expect(status(page)).toHaveText(sentences.listening);
  }
  await quiet(page);
  await expect(status(page)).toHaveText(sentences.sleeping);
  await expect(pill(page)).toHaveText(sentences.startLabel);
  await expect(hot(page)).toHaveCount(0);
});

test("a spoken headache opens the intake offer, and a spoken yes answers it, through the same send path", async ({
  page,
}) => {
  await startTalking(page);
  await sayAndPause(page, "I have a headache");
  await expect(lastReply(page)).toHaveClass(/as-reply-intake/);
  await expect(lastReply(page)).toContainText(intake.answer.opening);
  await expect.poll(() => speechCalls(page)).toContain("speak");
  await endSpeech(page);
  await expect(status(page)).toHaveText(sentences.yourTurn);
  await sayAndPause(page, "yes");
  await expect(lastReply(page).locator(".as-headline")).toHaveText(
    intake.common.questions[0].ask,
  );
});

test("closing the panel ends the conversation", async ({ page }) => {
  await startTalking(page);
  await page.keyboard.press("Escape");
  await expect.poll(() => micOpen(page)).toBe(false);
  await expect(panel(page)).toBeHidden();
});

test("every sentence the panel shows about the conversation is the contract's", async ({
  page,
}) => {
  await startTalking(page);
  const shown = [await status(page).textContent(), await hot(page).textContent(), await pill(page).textContent()];
  for (const text of shown) expect(Object.values(sentences)).toContain(text?.trim());
  await sayAndPause(page, "Are my results back?");
  await expect.poll(() => spoken(page)).not.toEqual([]);
  expect(Object.values(sentences)).toContain((await status(page).textContent())?.trim());
});
