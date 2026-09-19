import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { noticeFor } from "./notices";
import { confirmBooking, goSection } from "./nav";
/* GilbertOne on the web.

   What is held here, in the order a person meets it.

   The orb floats on every patient page and is fetched lazily: the panel's code is requested only
   when somebody opens it, so the journey watches the request rather than trusting the build. On a
   phone the orb sits above the tab bar and covers none of its buttons; on a wide screen it leaves
   the footer's help link alone.

   The panel behaves like a dialog. It opens by click or keyboard, closes by Escape, its close button
   or the backdrop, keeps focus inside and gives it back to the orb, and the conversation survives
   closing.

   And it has room to be read, which is measured rather than eyeballed. The head and the composer are
   both fixed, so what they may spend is held: the name never prints into the controls, the composer
   stays inside the sheet, and the scroll keeps enough of it to show the contract notice that opens
   the conversation. On a phone that was the difference between a notice cut mid-sentence at the
   composer's top edge and a notice a person can read.

   It says the contract's words. The voice notice verbatim; the sentence that GilbertOne not recognising
   an emergency does not mean there is not one, beside the conversation before anything is asked; and
   answers built from assistant.json, records.json and sos.json.

   The matcher, typed into. A question in a person's own words gets the contract's answer. A sentence
   with an emergency word in it is an emergency whatever else it asked. Anything nobody wrote an
   answer for gets "I can't assess that", the ambulance numbers, Thuso SOS and a way to a nurse — and
   the nurse handover shows what would be sent and says it was not.

   Listening, since the founder's decision of 18 September 2026. The composer is still a text box that
   works on its own, and exactly one control on this screen offers to hear — the button carrying the
   contract's own label, with the disclosure about the browser's recognition on the page before the
   first tap. Nothing reaches for a recogniser until that tap, and no way of recording or speaking is
   reached for at all. What the browser caught is a draft the patient reads, edits and sends herself,
   and it is an emergency when she sends it in the same words that would have made it one typed. A
   browser with no speech recognition is told so and given no control that cannot hear.

   Motion stops rather than slows. */

const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const gilbert = json("../packages/catalog/assistant.json");
const voice = json("../packages/catalog/capabilities.json").capabilities.find(
  (c: { id: string }) => c.id === "voice",
);
const sos = json("../packages/catalog/sos.json");
const laboratory = json("../packages/catalog/records.json").records.find(
  (r: { id: string }) => r.id === "laboratory",
).name;
const number = (id: string) =>
  sos.emergency.numbers.find((n: { id: string }) => n.id === id).number;
const say = (text: string) =>
  text
    .replace("{ambulance}", number("ambulance"))
    .replace("{mobile}", number("mobile"))
    .replace("{seconds}", String(gilbert.voice.maxListeningSeconds));
const cue = (id: string) =>
  gilbert.states.find((s: { id: string }) => s.id === id).cue;
const condition = (id: string) =>
  sos.redFlags.conditions.find((c: { id: string }) => c.id === id).name;
/* With nothing booked, GilbertOne says what the home card says about nothing booked, in scheduling.json's words. */
const schedulingLabels = json("../packages/catalog/scheduling.json").labels;
const nothingBooked = {
  name: gilbert.visitStates.none.name.replace(
    "{noUpcoming}",
    schedulingLabels.noUpcoming,
  ),
  sentence: gilbert.visitStates.none.sentence.replace(
    "{noUpcomingDetail}",
    schedulingLabels.noUpcomingDetail,
  ),
};

const launcher = (page: Page) =>
  page.getByRole("button", {
    name: gilbert.identity.callToAction,
    exact: true,
  });
const panel = (page: Page) =>
  page.getByRole("dialog", { name: gilbert.identity.name });
const log = (page: Page) =>
  panel(page).getByRole("log", { name: gilbert.conversation.logLabel });
const field = (page: Page) =>
  panel(page).getByLabel(gilbert.conversation.inputLabel);
const ask = async (page: Page, words: string) => {
  await field(page).fill(words);
  await panel(page)
    .getByRole("button", { name: gilbert.conversation.sendLabel, exact: true })
    .click();
};

/* Before the app's own code runs, so a reach for any way of keeping a sample, or of answering in a
   voice, from anywhere on this screen counts. The browser's recogniser is NOT in this list: since the
   founder's decision of 18 September 2026 the assistant's microphone may open it, and a refusal here
   would only defeat the tests below that drive it on purpose. */
const watchForRecording = (page: Page) =>
  page.addInitScript(() => {
    const tally = window as unknown as { __heard: string[] } & Record<
      string,
      unknown
    >;
    tally.__heard = [];
    const count = (name: string) =>
      function () {
        tally.__heard.push(name);
        throw new Error("Refused by the assistant spec");
      };
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        tally.__heard.push("getUserMedia");
        return Promise.reject(new Error("Refused by the assistant spec"));
      };
    for (const name of [
      "MediaRecorder",
      "AudioContext",
      "webkitAudioContext",
      "SpeechSynthesisUtterance",
      "speechSynthesis",
    ]) {
      Object.defineProperty(window, name, {
        configurable: true,
        value: count(name),
      });
    }
  });

/* The microphone stand-in, and the four things a test can do to it. */
type MicControl = {
  calls: string[];
  instance: Record<string, ((event?: unknown) => void) | null> | null;
  /* Whether this recogniser has already ended, errored or been aborted. A real one fires nothing
     after that — not even an open event already queued — and the stand-in owes the app the same
     silence, or a refusal can be answered by a microphone announcing itself open. */
  settled: boolean;
};
const giveVoice = (page: Page) =>
  page.addInitScript(() => {
    const scope = window as unknown as {
      SpeechRecognition: unknown;
      webkitSpeechRecognition: unknown;
      __mic: MicControl;
    };
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
        /* A real recogniser is open a moment after it is asked for, never in the same tick. That gap is
      the whole of the "starting" state, so the stand-in keeps one — in the event alone. The
      instance is reachable from the moment it is asked for, because the app holds its own
      reference from that moment, and a test driving the same moment must be able to reach the
      recogniser too: under load the timer below can be delayed past the test's own turn, and a
      take-back or a refusal that found no instance was a silent no-op. The open event, though,
      waits for the gap — and never arrives at all once this recogniser has settled or been
      replaced, which is the order a real browser keeps. */
        mic.settled = false;
        mic.instance = this as unknown as MicControl["instance"];
        const recogniser = this as unknown as MicControl["instance"];
        setTimeout(() => {
          if (!mic.settled && mic.instance === recogniser) this.onstart?.();
        }, 20);
      }
      stop() {
        mic.calls.push("stop");
        mic.settled = true;
        const recogniser = this as unknown as MicControl["instance"];
        setTimeout(() => {
          if (mic.instance === recogniser) mic.instance?.onend?.();
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
  });
const micCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mic: MicControl }).__mic.calls);
/* Words the way a real recogniser reports them: a result list whose first alternative of the first
   result carries the transcript, which is what the app reads its review line off. */
const dictate = (page: Page, words: string) =>
  page.evaluate((words) => {
    const mic = (window as unknown as { __mic: MicControl }).__mic;
    mic.instance?.onresult?.({
      resultIndex: 0,
      results: [{ length: 1, 0: { transcript: words } }],
    });
  }, words);
/* The ending nobody asked for, which is how a browser taking the microphone back looks. Ending
   settles the recogniser: nothing fires after it, not even an open event still queued. */
const takeBack = (page: Page) =>
  page.evaluate(() => {
    const mic = (window as unknown as { __mic: MicControl }).__mic;
    mic.settled = true;
    mic.instance?.onend?.();
  });
const refuseVoice = (page: Page, code: string) =>
  page.evaluate((code) => {
    const mic = (window as unknown as { __mic: MicControl }).__mic;
    mic.settled = true;
    mic.instance?.onerror?.({ error: code });
  }, code);
/* Chromium exposes `webkitSpeechRecognition` even where there is no speech backend behind it, so a
   browser that cannot hear at all has to be simulated rather than assumed from the test browser. */
const withoutVoice = (page: Page) =>
  page.addInitScript(() => {
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(window, name, {
        configurable: true,
        value: undefined,
      });
    }
  });

/* Each animation inside an element, described well enough that a failure names what moved. */
const animationsIn = (page: Page, selector: string) =>
  page.evaluate(
    (selector) =>
      document
        .getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest(selector);
        })
        .map((a) => {
          const effect = a.effect as KeyframeEffect;
          const name =
            (a as Animation & { animationName?: string }).animationName ?? "";
          return `${a.playState} ${a.constructor.name}${name ? ` ${name}` : ""} on .${(effect.target as Element).className}${effect.pseudoElement ?? ""}`;
        }),
    selector,
  );
const runningIn = (described: string[]) =>
  described.filter((d) => d.startsWith("running"));

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test("the orb floats on every patient page, and GilbertOne is fetched only when it is opened", async ({
  page,
}) => {
  const fetched: string[] = [];
  page.on("request", (request) => {
    if (
      /features\/Assistant|features\/assistant\.css|lib\/assistant|catalog\/assistant\.json/.test(
        request.url(),
      )
    )
      fetched.push(request.url());
  });
  await page.goto("/app/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Hello, Lerato" }),
  ).toBeVisible();
  await expect(launcher(page)).toBeVisible();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
  await goSection(page, "My visits");
  await expect(launcher(page)).toBeVisible();
  expect(
    fetched,
    "a patient page fetched GilbertOne before anybody reached for it",
  ).toEqual([]);
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  expect(fetched.length).toBeGreaterThan(0);
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");
  // the descriptor is never shown without the disclosure that goes with it
  await expect(
    panel(page).getByText(gilbert.identity.descriptorLine, { exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByText(gilbert.identity.descriptor, { exact: true }),
  ).toHaveCount(0);
  // the contract's own sentences, word for word
  await expect(panel(page).locator(".not-connected")).toHaveText(
    noticeFor("voice"),
  );
  await expect(panel(page).locator(".as-silence")).toHaveText(
    say(gilbert.silenceIsNotSafety),
  );
  await expect(panel(page).locator(".as-silence")).toBeInViewport();
  /* One footnote slot, and before the first tap the voice disclosure is what stands in it — the
    typing note it borrows the line from comes back once the microphone has been explained. Two
    footnotes would be one the phone has no line for. */
  await expect(panel(page).locator(".as-keyboard")).toHaveCount(1);
  await expect(panel(page).locator(".as-keyboard")).toHaveText(
    say(gilbert.voice.webSentences.beforePermission),
  );
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "idle",
  );
  await expect(panel(page).locator(".as-state")).toHaveText(cue("idle"));
  await expect(log(page)).toContainText("Nothing needs you.");
  for (const refusal of gilbert.refusals)
    await expect(panel(page).locator(".as-rule")).toContainText(
      refusal.statement,
    );
});

test("on a phone the orb sits above the tab bar, clear of every tab", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "The tab bar is the phone’s navigation.");
  await page.goto("/app/");
  await expect(launcher(page)).toBeVisible();
  const orb = (await launcher(page).boundingBox())!;
  const bar = (await page.locator(".tabbar").boundingBox())!;
  expect(
    orb.y + orb.height,
    "the orb reaches down into the tab bar",
  ).toBeLessThanOrEqual(bar.y - 4);
  expect(orb.x + orb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  for (const tab of await page.locator(".tabbar button").all())
    expect(overlaps(orb, (await tab.boundingBox())!)).toBe(false);
  await launcher(page).click();
  await expect
    .poll(async () => {
      const sheet = (await panel(page).boundingBox())!;
      return Math.round(sheet.y + sheet.height);
    })
    .toBe(page.viewportSize()!.height);
  expect(Math.round((await panel(page).boundingBox())!.width)).toBe(
    page.viewportSize()!.width,
  );
  // the composer is at the foot of the sheet, where a thumb is, and inside it
  const compose = (await panel(page).locator(".as-compose").boundingBox())!;
  expect(Math.round(compose.y + compose.height)).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  expect(compose.y).toBeGreaterThan(page.viewportSize()!.height / 2);
});

test("the name never prints into the controls, and the conversation keeps room to be read", async ({
  page,
}) => {
  test.setTimeout(90_000);
  /* The head and the composer are both fixed, and between them they can spend a whole sheet. Measured
    on 390x844 they were 350px and 259px of 776px, so the notice under the state — the first thing in
    the scroll — was cut mid-sentence at the composer's top edge and read as though the composer were
    lying on top of it; at 320x720 the same notice was down to a line and a half and the composer was
    14px off the bottom of the screen, where it cannot be reached at all. The bar did not fit a 320px
    sheet either: the name is one word, the box around it was allowed to shrink past it, and GilbertOne
    printed 9px into the Pause motion pill in the state where somebody has just described chest pain.

    Held as three things, because these are the three a fixed layout breaks quietly: the name and the
    controls do not overlap, the composer is inside the sheet with the silence sentence readable, and
    the scroll is left enough of the sheet to show the contract notice that opens it. The laptop card
    is in the loop with the phones: at 1440x1100 the same fixed chrome left it 167px for the same
    192px notice, which is the same cut in a different shell.

    Every box below comes out of ONE evaluate, and the sheet is given its entrance to finish first.
    Two boundingBox calls are two layout snapshots: a phone opening mid-animation — the panel slides up
    from translateY(100%) — can hand back a name from one frame and controls from another, and two
    frames compared as though they were one is how this test reported an overlap that was not there. */
  const layout = (page: Page) =>
    page.evaluate(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`${selector} is not on the panel`);
        const r = el.getBoundingClientRect();
        return {
          x: r.left,
          y: r.top,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          right: r.right,
        };
      };
      const h2 = document.querySelector(".as-titles h2") as HTMLElement;
      const scroll = document.querySelector(".as-scroll") as HTMLElement;
      return {
        name: box(".as-titles h2"),
        controls: box(".as-controls"),
        sheet: box("#assistant-panel"),
        compose: box(".as-compose"),
        silence: box(".as-silence"),
        footnote: box(".as-keyboard"),
        input: box(".as-field input"),
        /* The defect itself, in one number: the box around the name was narrower than the name, so the name
      printed past it and into whatever was beside it. */
        nameOverflow: h2.scrollWidth - h2.clientWidth,
        scrollClient: scroll.clientHeight,
        scrollHeight: scroll.scrollHeight,
      };
    });
  for (const [width, height] of [
    [390, 844],
    [320, 720],
    [1440, 1100],
    [1366, 768],
  ] as const) {
    for (const asked of [false, true]) {
      const where = `${width}x${height}${asked ? ", a question asked" : ", nothing asked"}`;
      await page.setViewportSize({ width, height });
      await page.goto("/app/?open=assistant");
      await expect(panel(page)).toBeVisible();
      /* The panel slides up from the sheet edge; measure it once it has arrived, not while it is on its
      way, as the wide-screen layout test above measures its own. */
      await page.waitForTimeout(500);
      if (asked) await ask(page, "my shoulder aches");

      const {
        name,
        controls,
        sheet,
        compose,
        silence,
        footnote,
        input,
        nameOverflow,
        scrollClient,
        scrollHeight,
      } = await layout(page);
      expect(
        overlaps(name, controls),
        `at ${where} the name prints into the controls`,
      ).toBe(false);
      expect(
        nameOverflow,
        `at ${where} the name is wider than the box holding it`,
      ).toBeLessThanOrEqual(1);
      expect(
        name.right,
        `at ${where} the name runs out of the sheet`,
      ).toBeLessThanOrEqual(width);
      expect(
        controls.right,
        `at ${where} the controls run out of the sheet`,
      ).toBeLessThanOrEqual(width);

      expect(
        Math.round(compose.bottom),
        `at ${where} the composer is off the bottom of the sheet`,
      ).toBeLessThanOrEqual(Math.round(sheet.bottom));
      expect(
        compose.y,
        `at ${where} the composer has climbed the sheet`,
      ).toBeGreaterThan(sheet.y + sheet.height / 2);
      /* A contract sentence, and one of the two reasons the composer is as tall as it is. Readable means
      on the screen, not scrolled to: it is a footnote to the field, not part of the conversation. */
      expect(
        silence.bottom,
        `at ${where} the silence sentence is below the fold`,
      ).toBeLessThanOrEqual(height);
      expect(
        silence.y,
        `at ${where} the silence sentence is behind the conversation`,
      ).toBeGreaterThan(compose.y);
      /* The other half of the trade, in the same direction: the disclosure is fixed chrome under the input
      precisely so that it is read before the first tap rather than scrolled to, so the whole footnote
      line is held above the fold, not its first line. */
      expect(
        Math.round(footnote.bottom),
        `at ${where} the voice disclosure is below the fold`,
      ).toBeLessThanOrEqual(height);
      /* And the control that bought the footnote did not buy it out of the box a person types in: it is a
      44px square in the field's row, and the row keeps the field wide enough that its contract
      placeholder reads as cut short rather than as a broken box. */
      expect(
        Math.round(input.width),
        `at ${where} the row leaves the text field ${Math.round(input.width)}px`,
      ).toBeGreaterThanOrEqual(100);

      expect(
        scrollHeight,
        `at ${where} the scroll has nothing to scroll`,
      ).toBeGreaterThan(scrollClient);
      /* Floors, not measurements: 236px at 390, 60px at 320, 226px at 1440 and 146px at 1366, all with
      nothing asked. They came down by about a sentence's worth when the founder's decision of 18
      September fixed the voice disclosure under the input — 134px of it at 390, 168px at 320, over the
      88px typing note it displaces until the first tap — and were paid back from the sphere (148px to
      100px on a phone, 120px to 100px on the card), one type step on the sentences under the box, and
      below 360px the scroll's and the composer's side margins. Every one of them still sits above the
      number this file records as the failure — 168, 40, 167 and 127 — which is the room the fixed chrome
      left when the notice that opens the conversation was cut in half. */
      const floor =
        width >= 1000 ? (height >= 900 ? 210 : 130) : width === 390 ? 220 : 50;
      expect(
        scrollClient,
        `at ${where} the fixed chrome left the conversation ${scrollClient}px`,
      ).toBeGreaterThanOrEqual(floor);
    }
  }
});

test("on a wide screen the orb leaves the footer alone and the panel is anchored bottom right", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "A phone has a sheet, not a panel, and no footer.");
  await page.goto("/app/");
  const orb = (await launcher(page).boundingBox())!;
  for (const link of await page.locator(".app-footer button").all())
    expect(overlaps(orb, (await link.boundingBox())!)).toBe(false);
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(500); // the panel grows out of the orb; measure it once it has
  const box = (await panel(page).boundingBox())!;
  const { width, height } = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(400);
  expect(Math.abs(width - (box.x + box.width) - 24)).toBeLessThanOrEqual(1);
  expect(Math.abs(height - (box.y + box.height) - 24)).toBeLessThanOrEqual(1);
});

test("the panel opens and closes like a dialog, keeps focus inside, and gives it back to the orb", async ({
  page,
}) => {
  await page.goto("/app/");
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: "Close GilbertOne" }),
  ).toBeFocused();
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () =>
          !!document
            .getElementById("assistant-panel")
            ?.contains(document.activeElement),
      ),
      `focus left the panel after ${step + 1} tabs`,
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");

  // by keyboard, and the conversation is still there after closing
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "When is my nurse coming?" })
    .click();
  await panel(page).getByRole("button", { name: "Close GilbertOne" }).click();
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  await launcher(page).click();
  await expect(log(page).locator(".as-said")).toHaveText([
    `${gilbert.conversation.youAsked}: When is my nurse coming?`,
  ]);
});

test("a suggested question gets the contract’s answer, and the emergency answer hands over to Thuso SOS", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await expect(panel(page)).toBeVisible();
  await panel(page)
    .getByRole("button", { name: "Are my results back?" })
    .click();
  await expect(log(page)).toContainText(
    `${laboratory} results have been released to your record.`,
  );
  await expect(panel(page).locator(".as-name")).toHaveText("Result ready");
  /* Depth retired with the sphere — it was only a rim-light gradient. What the face means is asserted
    instead: the reply is guiding, and the turn bought A09's nod (a gesture, brief by design, so the
    assertion is made at once). */
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-cue",
    "A09",
  );
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "guiding",
  );

  await panel(page)
    .getByRole("button", { name: "Is everyone on my team registered?" })
    .click();
  await expect(panel(page).locator(".as-figure")).toContainText("45");

  await panel(page).getByRole("button", { name: "What are you?" }).click();
  await expect(log(page).locator(".as-reply").last()).toContainText(
    gilbert.identity.whatItIsNot,
  );

  await panel(page)
    .getByRole("button", { name: "What happens to what I say?" })
    .click();
  await expect(log(page).locator(".as-reply").last()).toContainText(
    gilbert.voice.sentences.web,
  );

  await panel(page)
    .getByRole("button", { name: "What if it cannot wait?" })
    .click();
  const answer = log(page).locator(".as-reply").last();
  await expect(answer).toContainText(sos.emergency.headline);
  await expect(answer.locator(".as-numbers li").first()).toContainText("10177");
  await expect(panel(page).locator(".as-figure")).toHaveText("10177");
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "escalate",
  );
  // and the face holds urgent support: A16 does not relax on a timer
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-cue",
    "A16",
  );
  await answer.getByRole("button", { name: /Open Thuso SOS/ }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Thuso SOS" })).toBeVisible();
});

test("a typed question in a person’s own words gets the same contract answer", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await ask(page, "hi, when’s my nurse coming??");
  // "nurse coming" is a trigger and every other word is filler, so the visit answer arrives on its own —
  // and with nothing booked on the web, it is the home card's own sentence for nothing booked
  await expect(log(page).locator(".as-said").last()).toContainText(
    "hi, when’s my nurse coming??",
  );
  await expect(log(page).locator(".as-reply").last()).toContainText(
    nothingBooked.sentence,
  );
  await expect(log(page).locator(".as-reply").last()).toHaveAttribute(
    "data-outcome",
    "answer",
  );
  await expect(panel(page).locator(".as-name")).toHaveText(nothingBooked.name);
  await expect(panel(page).locator(".as-state")).toHaveText(cue("guiding"));
  await expect(field(page)).toHaveValue("");
  // an empty message sends nothing
  await panel(page)
    .getByRole("button", { name: gilbert.conversation.sendLabel, exact: true })
    .click();
  await expect(log(page).locator(".as-said")).toHaveCount(1);
});

test("anything GilbertOne cannot match is told so, with the ambulance, Thuso SOS and a nurse — and the handover goes to a simulated queue without their words", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  const words = "My knee has been sore since Tuesday";
  await ask(page, words);
  const answer = log(page).locator(".as-reply").last();
  await expect(answer.locator(".as-headline")).toHaveText(
    gilbert.answers.unmatched.sentence,
  );
  await expect(answer).toContainText(gilbert.answers.unmatched.detail);
  await expect(answer).toContainText(say(gilbert.answers.unmatched.ifUrgent));
  await expect(answer.locator(".as-numbers li")).toHaveCount(2);
  await expect(answer.locator(".as-numbers li").nth(0)).toContainText("10177");
  await expect(answer.locator(".as-numbers li").nth(1)).toContainText("112");
  await expect(
    answer.getByRole("button", { name: gilbert.answers.unmatched.sosLabel }),
  ).toBeVisible();
  // unmatched is Guiding rather than Escalate: amber on every unrecognised sentence teaches people to ignore amber
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "guiding",
  );

  await answer
    .getByRole("button", { name: gilbert.answers.unmatched.handoverLabel })
    .click();
  const handover = log(page).locator(".as-reply").last();
  const h = gilbert.answers.handover;
  await expect(handover.locator(".as-headline").first()).toHaveText(h.title);
  /* The structured summary: how they asked, what matched and an urgency that is never calm. Their words
    are not in it, and what does not go is said before anything goes. */
  const rows = handover.locator(".as-summary > div");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(h.channelTyped);
  await expect(rows.nth(1)).toContainText(h.nothingMatched);
  await expect(rows.nth(2)).toContainText(
    h.urgency.find((u: { id: string }) => u.id === "not-assessed").name,
  );
  await expect(handover.locator(".as-summary")).not.toContainText(words);
  for (const item of h.notCarried)
    await expect(handover).toContainText(item.sentence);
  await expect(handover.locator(".as-notsent")).toHaveText(h.notSent);
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "handover",
  );
  // the handover holds A11's attentive pose while the summary is read
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-cue",
    "A11",
  );
  await expect(panel(page).locator(".as-state")).toHaveText(cue("handover"));

  /* Handed to the simulated queue: a reference that says it is simulated, no nurse, and the ambulance
    numbers after it, because a queue nobody reads must not be the last thing an urgent person sees. */
  await handover.getByRole("button", { name: h.sendLabel }).click();
  const sent = handover.locator(".as-sent");
  await expect(sent.locator(".as-headline")).toHaveText(h.sentTitle);
  await expect(sent).toContainText(h.sent);
  await expect(sent.locator(".as-ref")).toHaveText(/^SIM-HO-/);
  await expect(sent).toContainText(h.stillUrgent);
  await expect(sent.locator(".as-numbers li").first()).toContainText("10177");
  await expect(handover.getByRole("button", { name: h.sendLabel })).toHaveCount(
    0,
  );
});

test("an emergency word raises the answer, whatever else the message asked", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  // a question GilbertOne can answer, and a chest pain in the same breath: the chest pain wins
  await ask(page, "When is my nurse coming? My chest hurts and I feel sick");
  const answer = log(page).locator(".as-reply").last();
  await expect(answer).not.toContainText("A nurse is expected on");
  await expect(answer.locator(".as-noticed")).toContainText(
    gilbert.answers.emergency.noticed,
  );
  await expect(answer.locator(".as-noticed li")).toHaveText([
    condition("chest-pain"),
  ]);
  await expect(answer).toContainText(sos.emergency.headline);
  await expect(answer.locator(".as-numbers li").first()).toContainText("10177");
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "escalate",
  );
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-cue",
    "A16",
  );
  await expect(panel(page).locator(".as-state")).toHaveText(cue("escalate"));
  await expect(panel(page).locator(".as-figure")).toHaveText("10177");

  // a crisis is never left to GilbertOne: no sos condition, still the numbers
  await ask(page, "i dont want to be here, i want to die");
  await expect(
    log(page).locator(".as-reply").last().locator(".as-numbers li").first(),
  ).toContainText("10177");
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "escalate",
  );

  /* And the nurse handover says an emergency was raised — whether, never which — and nothing asked
    afterwards lowers it: asking again with nothing more urgent sends nothing new. */
  const h = gilbert.answers.handover;
  await ask(page, "can I talk to a nurse");
  const handover = log(page).locator(".as-reply").last();
  const rows = handover.locator(".as-summary > div");
  await expect(rows.nth(1)).toContainText(h.matchedEmergency);
  await expect(rows.nth(2)).toContainText(
    h.urgency.find((u: { id: string }) => u.id === "emergency").name,
  );
  await expect(handover).toContainText(h.neverLowered);
  await expect(handover.locator(".as-summary")).not.toContainText(
    condition("chest-pain"),
  );
  /* And the face does not soften either: the handover's supportive pose is refused while A16 holds,
    so the character keeps the steady face the words keep. */
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-cue",
    "A16",
  );
  await handover.getByRole("button", { name: h.sendLabel }).click();
  await expect(handover.locator(".as-sent .as-headline")).toHaveText(
    h.sentTitle,
  );
  await ask(page, "can I talk to a nurse");
  const again = log(page).locator(".as-reply").last();
  await expect(again.locator(".as-summary > div").nth(2)).toContainText(
    h.urgency.find((u: { id: string }) => u.id === "emergency").name,
  );
  await again.getByRole("button", { name: h.sendLabel }).click();
  await expect(again.locator(".as-sent .as-headline")).toHaveText(
    h.alreadySent,
  );
});

/* The GilbertOne English engine (packages/gilbertone) makes the first emergency/handover
   decision and hands the web renderer a fixed trigger phrase to force its presentation — see
   apps/web/src/lib/gilbertone-bridge.ts. That phrase must never be what the person reads back
   as their own words, and an emergency it forces must still say which condition it noticed
   when the real, richer matcher agrees on one. */
test("the GilbertOne engine bridge echoes what was actually typed, not its own trigger phrase", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await ask(page, "I have chest pain");
  const emergencyTurn = log(page).locator(".as-turn").last();
  await expect(emergencyTurn.locator(".as-said")).toContainText(
    "I have chest pain",
  );
  await expect(emergencyTurn.locator(".as-said")).not.toContainText(
    "What if it cannot wait",
  );
  await expect(emergencyTurn.locator(".as-reply")).toHaveAttribute(
    "data-outcome",
    "emergency",
  );
  await expect(emergencyTurn.locator(".as-noticed li")).toHaveText([
    condition("chest-pain"),
  ]);
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "escalate",
  );

  // an emergency word beside a handover request is still an emergency, not a handover
  await ask(page, "I have chest pain, please get me a nurse");
  const both = log(page).locator(".as-turn").last();
  await expect(both.locator(".as-said")).toContainText(
    "I have chest pain, please get me a nurse",
  );
  await expect(both.locator(".as-reply")).toHaveAttribute(
    "data-outcome",
    "emergency",
  );

  await ask(page, "I want to talk to a nurse");
  const handoverTurn = log(page).locator(".as-turn").last();
  await expect(handoverTurn.locator(".as-said")).toContainText(
    "I want to talk to a nurse",
  );
  await expect(handoverTurn.locator(".as-said")).not.toContainText(
    "Can I talk to a nurse",
  );
  await expect(handoverTurn.locator(".as-reply")).toHaveClass(
    /as-reply-handover/,
  );
});

test("starting again clears the conversation back to its opening", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await panel(page)
    .getByRole("button", { name: "When is my nurse coming?" })
    .click();
  await expect(log(page).locator(".as-said")).toHaveCount(1);
  await panel(page)
    .getByRole("button", { name: gilbert.conversation.startAgainLabel })
    .click();
  await expect(log(page).locator(".as-said")).toHaveCount(0);
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "idle",
  );
  // and the face is released with the conversation: no cue owns it, so the idle drift is all that moves
  await expect(panel(page).locator(".as-rig")).not.toHaveAttribute("data-cue");
});

test("the composer is a text box, and nothing hears before the patient taps the one control that offers it", async ({
  page,
}) => {
  await watchForRecording(page);
  await giveVoice(page);
  await page.goto("/app/?open=assistant");
  const mic = panel(page).getByRole("button", {
    name: gilbert.voice.sentences.talkLabel,
    exact: true,
  });
  await expect(mic).toBeVisible();
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  /* The disclosure is on the page before the first tap, in the contract's own words, with the cap read
    into the sentence rather than typed beside it. It sits in the composer's one footnote slot, which
    is also what the field is described by. A page that opens a microphone and then explains has
    already taken the voice it was about to explain about. */
  const note = panel(page).locator("#as-keyboard");
  await expect(note).toHaveText(
    say(gilbert.voice.webSentences.beforePermission),
  );
  await expect(note).toContainText(
    `${gilbert.voice.maxListeningSeconds} seconds`,
  );
  await expect(field(page)).toHaveAttribute("aria-describedby", "as-keyboard");
  // and the state line is not there to say the same thing twice on a phone that has no line to spare
  await expect(panel(page).locator(".as-voice-state")).toHaveCount(0);
  // the icon carries no meaning of its own; the control's name is the contract's label
  await expect(mic.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  // asking the page whether it can hear now gets an answer that is true
  await ask(page, "can you hear me");
  await expect(log(page).locator(".as-reply").last()).toContainText(/tap/i);
  // and nothing was heard to answer it with
  expect(await micCalls(page), voice.neverSoften).toEqual([]);
  // one text box, and it is a text box that hands nothing to the browser's own services
  await expect(
    panel(page).locator('input, textarea, [contenteditable="true"]'),
  ).toHaveCount(1);
  await expect(field(page)).toHaveAttribute("type", "text");
  await expect(field(page)).toHaveAttribute("spellcheck", "false");
  await expect(field(page)).toHaveAttribute("autocorrect", "off");
  await expect(field(page)).toHaveAttribute("autocomplete", "off");
  await expect(field(page)).toHaveAttribute("autocapitalize", "off");
  await expect(field(page)).toHaveAttribute("aria-describedby", "as-keyboard");
  await expect(
    page.locator(
      'input[capture], input[accept*="audio"], input[accept*="video"], audio',
    ),
  ).toHaveCount(0);
  // exactly one control offers to hear, and what it offers is the contract's own words for it
  const names = await panel(page)
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((b) =>
        `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`.trim(),
      ),
    );
  const offers = names.filter((name) =>
    /microphone|\bmic\b|voice input|dictat|speak now|(tap|hold|press) to (speak|talk)|start listening|listening|record/i.test(
      name,
    ),
  );
  expect(offers, voice.neverSoften).toHaveLength(1);
  expect(offers[0]).toContain(gilbert.voice.sentences.talkLabel);
  // the character is not the microphone, and never says that it is
  await expect(panel(page).locator(".as-rig")).not.toHaveAttribute(
    "data-pulse",
    /listening|thinking/,
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __heard: string[] }).__heard,
    ),
  ).toEqual([]);
});

test("what the browser caught is a draft the patient sends herself, and an emergency when she does", async ({
  page,
}) => {
  await watchForRecording(page);
  await giveVoice(page);
  await page.goto("/app/?open=assistant");
  const mic = panel(page).getByRole("button", {
    name: gilbert.voice.sentences.talkLabel,
    exact: true,
  });
  await mic.click();
  // one recogniser, constructed at the tap and at no other moment
  expect(await micCalls(page)).toEqual(["new", "start"]);
  const stop = panel(page).getByRole("button", {
    name: gilbert.voice.sentences.stopLabel,
    exact: true,
  });
  await expect(stop).toHaveCount(1);
  await expect(panel(page).locator(".as-voice-state")).toHaveText(
    say(gilbert.voice.webSentences.states.open),
  );
  /* Even now the character says nothing of the kind: the microphone is the button, and the button is
    the only thing on this screen allowed to claim it. */
  await expect(panel(page).locator(".as-rig")).not.toHaveAttribute(
    "data-pulse",
    /listening|thinking/,
  );
  await dictate(page, "I have chest");
  await expect(panel(page).locator(".as-voice-heard")).toContainText(
    "I have chest",
  );
  // reviewed while it is still hearing, and nothing has been sent or kept
  await expect(log(page).locator(".as-said")).toHaveCount(0);
  await stop.click();
  await expect(field(page)).toHaveValue("I have chest");
  await expect(panel(page).locator(".as-voice-heard")).toHaveCount(0);
  await expect(panel(page).locator(".as-voice-state")).toHaveText(
    say(gilbert.voice.webSentences.states.off),
  );
  // she finishes the sentence, and sending it is her own act
  await field(page).fill("I have chest pain");
  await panel(page)
    .getByRole("button", { name: gilbert.conversation.sendLabel, exact: true })
    .click();
  const turn = log(page).locator(".as-turn").last();
  await expect(turn.locator(".as-said")).toContainText("I have chest pain");
  await expect(turn.locator(".as-reply")).toHaveAttribute(
    "data-outcome",
    "emergency",
  );
  await expect(turn.locator(".as-noticed li")).toHaveText([
    condition("chest-pain"),
  ]);
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "escalate",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __heard: string[] }).__heard,
    ),
  ).toEqual([]);
  /* The refused, failed and interrupted sentences each say nothing was kept, and the keeping this app could
    do by itself is the keeping a person cannot see: a draft written to either storage outlives the tab,
    which the browser's own route does not promise to. So both stores are read back empty after a capture
    that was dictated, edited and sent. */
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("a microphone the browser took back says so, and leaves its words where its own sentence promised", async ({
  page,
}) => {
  await watchForRecording(page);
  await giveVoice(page);
  await page.goto("/app/?open=assistant");
  await panel(page)
    .getByRole("button", {
      name: gilbert.voice.sentences.talkLabel,
      exact: true,
    })
    .click();
  await dictate(page, "my arm is bleeding");
  await takeBack(page);
  /* The contract's `interrupted` tells the patient that whatever was caught is in the field below. It
    lands in error, not off, so this is the one ending a hand-over written only for `off` would break. */
  await expect(panel(page).locator(".as-voice-state")).toHaveText(
    say(gilbert.voice.webSentences.interrupted),
  );
  await expect(field(page)).toHaveValue("my arm is bleeding");
  await expect(log(page).locator(".as-said")).toHaveCount(0);
  // the app never stopped it and never kept it: the browser closed, and that is all that happened
  expect(await micCalls(page)).toEqual(["new", "start"]);
  expect(
    await page.evaluate(
      () => (window as unknown as { __heard: string[] }).__heard,
    ),
  ).toEqual([]);
});

test("a microphone the patient refused is said in the contract's words and leaves a control that taps again", async ({
  page,
}) => {
  await watchForRecording(page);
  await giveVoice(page);
  await page.goto("/app/?open=assistant");
  const mic = panel(page).getByRole("button", {
    name: gilbert.voice.sentences.talkLabel,
    exact: true,
  });
  await mic.click();
  await refuseVoice(page, "not-allowed");
  await expect(panel(page).locator(".as-voice-state")).toHaveText(
    gilbert.voice.webSentences.refused,
  );
  /* The disclosure had its say before the first tap and is gone from the slot now, because the state
    line above is saying what the microphone is doing and a phone has no spare line for both. The
    typing note, which the disclosure borrowed the slot from, is back. */
  await expect(panel(page).locator("#as-keyboard")).toHaveText(
    gilbert.conversation.webKeyboardNote,
  );
  await expect(panel(page).locator("#as-keyboard")).not.toContainText(
    say(gilbert.voice.webSentences.beforePermission),
  );
  /* A refusal is not a microphone left open. The control goes back to being a tap that starts one,
    rather than a Stop for something that already stopped, which would be a button needing two
    presses and saying nothing about why. */
  await expect(mic).toHaveCount(1);
  expect(await micCalls(page)).toEqual(["new", "start"]);
  await mic.click();
  expect(await micCalls(page)).toEqual(["new", "start", "new", "start"]);
  // and typing was never taken away
  await ask(page, "my shoulder aches");
  await expect(log(page).locator(".as-said")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => (window as unknown as { __heard: string[] }).__heard,
    ),
  ).toEqual([]);
});

test("a browser with no speech recognition is told so, and is handed no control that cannot hear", async ({
  page,
}) => {
  await watchForRecording(page);
  await withoutVoice(page);
  await page.goto("/app/?open=assistant");
  /* The sentence waits for the panel, so what follows it counts something. A count checked before the
     panel has opened passes vacuously — and once it opened, a microphone-hunting regex met "Can I talk
     to a nurse?" and failed a page that was right. The controls that can hear are named by the
     contract, so those two names, exactly, are what must not be here. */
  await expect(panel(page).locator(".as-voice-state")).toHaveText(
    gilbert.voice.webSentences.unavailable,
  );
  await expect(
    panel(page).getByRole("button", {
      name: gilbert.voice.sentences.talkLabel,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    panel(page).getByRole("button", {
      name: gilbert.voice.sentences.stopLabel,
      exact: true,
    }),
  ).toHaveCount(0);
  // told what is true rather than shown an icon that cannot do the thing
  await expect(
    panel(page).locator('svg[class*="mic"], [class*="waveform"], audio, video'),
  ).toHaveCount(0);
  /* Nothing here is a microphone waiting to be explained, so the pre-permission disclosure never
    appears: a page that warns about a permission no control can ask for is teaching a patient to
    fear a button that does nothing. The slot carries the typing note, which is the one thing here
    that is true. */
  await expect(panel(page)).not.toContainText(
    say(gilbert.voice.webSentences.beforePermission),
  );
  await expect(panel(page).locator("#as-keyboard")).toHaveText(
    gilbert.conversation.webKeyboardNote,
  );
  await ask(page, "my shoulder aches");
  await expect(log(page).locator(".as-said")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => (window as unknown as { __heard: string[] }).__heard,
    ),
  ).toEqual([]);
});

test("the orb and the character move, and Pause motion stops both", async ({
  page,
}) => {
  await page.goto("/app/");
  await expect
    .poll(
      async () => runningIn(await animationsIn(page, ".as-launcher")).length,
    )
    .toBeGreaterThan(0);
  await launcher(page).click();
  const rig = panel(page).locator(".as-rig");
  await expect(rig).toHaveAttribute("data-motion", "running");
  /* The character moves by transitions rather than loops — the greeting's walk when the panel
     opens, the idle drift and a blink once it has let go of the face — so a moment of motion is
     polled for rather than expected to be always on. */
  await expect
    .poll(async () => runningIn(await animationsIn(page, ".as-rig")).length)
    .toBeGreaterThan(0);
  await panel(page).getByRole("button", { name: "Pause motion" }).click();
  await expect(rig).toHaveAttribute("data-motion", "paused");
  await expect
    .poll(async () => runningIn(await animationsIn(page, ".as-rig")))
    .toEqual([]);
  await expect
    .poll(async () => runningIn(await animationsIn(page, ".as-launcher")))
    .toEqual([]);
  await panel(page).getByRole("button", { name: "Play motion" }).click();
  await expect(rig).toHaveAttribute("data-motion", "running");
});

test("a hidden tab stops the orb", async ({ page }) => {
  await page.goto("/app/");
  await expect
    .poll(
      async () => runningIn(await animationsIn(page, ".as-launcher")).length,
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(async () => runningIn(await animationsIn(page, ".as-launcher")))
    .toEqual([]);
});

test("under reduced motion the orb and the character are still, complete frames, in every state", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/");
  await expect(launcher(page)).toBeVisible();
  expect(await animationsIn(page, ".as-launcher")).toEqual([]);
  await launcher(page).click();
  const rig = panel(page).locator(".as-rig");
  await expect(rig).toHaveAttribute("data-motion", "still");
  await expect(
    panel(page).getByRole("button", { name: /Pause motion|Play motion/ }),
  ).toHaveCount(0);
  await panel(page)
    .getByRole("button", { name: "Are my results back?" })
    .click();
  await expect(panel(page).locator(".as-name")).toHaveText("Result ready");
  await ask(page, "someone has collapsed");
  await expect(rig).toHaveAttribute("data-pulse", "escalate");
  /* A16 holds even here, because its reduced-motion form is an expression rather than a movement:
     a still face can still be an urgent one, which is the safety invariant carried whole. */
  await expect(rig).toHaveAttribute("data-cue", "A16");
  // a cue is its still pose set at once, and a state change — even the escalation — starts nothing
  expect(await animationsIn(page, ".as-rig")).toEqual([]);
  const box = await panel(page).locator(".as-rig svg").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(60);
  /* A still frame is a complete one: the parts a face is read from — shell, visor, eyes, mouth —
     are drawn at full size, not a blank or a dot. */
  const drawn = await panel(page)
    .locator(".as-rig")
    .evaluate((element) =>
      [".go-shell", ".go-visor", ".go-eye", ".go-mouth"].every((part) => {
        const box = element.querySelector(part)?.getBoundingClientRect();
        return !!box && box.width > 0 && box.height > 0;
      }),
    );
  expect(drawn).toBe(true);
});

test("the open panel does not scroll sideways at 320px, with a long word typed and a handover open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/?open=assistant");
  await panel(page)
    .getByRole("button", { name: "What if it cannot wait?" })
    .click();
  await ask(
    page,
    "Pneumonoultramicroscopicsilicovolcanoconiosisandsomemoreletters",
  );
  await log(page)
    .locator(".as-reply")
    .last()
    .getByRole("button", { name: gilbert.answers.unmatched.handoverLabel })
    .click();
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement!;
    const scroller = document.querySelector(".as-scroll")!;
    const compose = document.querySelector(".as-compose")!;
    return {
      page: root.scrollWidth - root.clientWidth,
      panel: scroller.scrollWidth - scroller.clientWidth,
      compose: compose.scrollWidth - compose.clientWidth,
    };
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
  ["When is my nurse coming? I have chest pains", "chest-pain"],
  ["my visit today, my chest feels tight", "chest-pain"],
  ["are my results back, I had seizures last night", "seizure"],
  ["nurse coming, my baby is having convulsions", "seizure"],
  ["any updates, my dad stopped breathing", "breathing"],
  ["my visit — she bled a lot", "bleeding"],
  ["he keeps passing out", "unresponsive"],
  ["she blacked out", "unresponsive"],
  ["difficulty breathing", "breathing"],
  ["trouble breathing since this morning", "breathing"],
  ["the contractions have started", "obstetric"],
  ["I think he is overdosing", "crisis"],
  ["she has fits", "seizure"],
  ["hæmorrhage after the birth", "bleeding"],
  ["my visit, call an ambulans", "general"],
];

test("every sentence the review found answered calmly now raises the emergency answer", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/app/?open=assistant");
  for (const [says, group] of reviewScenarios) {
    await ask(page, says);
    const reply = log(page).locator(".as-reply").last();
    await expect(reply, says).toHaveAttribute("data-outcome", "emergency");
    await expect(reply, says).toHaveAttribute(
      "data-groups",
      new RegExp(`\\b${group}\\b`),
    );
    await expect(reply.locator(".as-numbers li").first(), says).toContainText(
      "10177",
    );
    await expect(reply, says).not.toContainText("A nurse is expected on");
    await expect(reply, says).not.toContainText("Nothing needs you");
    await expect(panel(page).locator(".as-rig")).toHaveAttribute(
      "data-pulse",
      "escalate",
    );
  }
});

test("a question with words GilbertOne could not read answers, and then says what it did not read", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await ask(page, "when is my nurse coming, my knee is sore");
  const reply = log(page).locator(".as-reply").last();
  await expect(reply).toHaveAttribute("data-outcome", "answer-and-unread");
  await expect(reply).toContainText(nothingBooked.sentence);
  const unread = reply.locator(".as-unread");
  await expect(unread.locator(".as-headline")).toHaveText(
    gilbert.answers.unread.sentence,
  );
  await expect(unread).toContainText(gilbert.answers.unread.detail);
  await expect(unread.locator(".as-numbers li").nth(0)).toContainText("10177");
  await expect(unread.locator(".as-numbers li").nth(1)).toContainText("112");
  await expect(
    unread.getByRole("button", { name: gilbert.answers.unread.sosLabel }),
  ).toBeVisible();
  await expect(panel(page).locator(".as-rig")).toHaveAttribute(
    "data-pulse",
    "guiding",
  );

  // "Nothing needs you" is never said to a message GilbertOne did not read all of
  await ask(page, "any updates? my knee aches");
  const settled = log(page).locator(".as-reply").last();
  await expect(settled).toHaveAttribute("data-outcome", "unmatched");
  await expect(settled).not.toContainText("Nothing needs you");
  await expect(settled).toContainText(gilbert.answers.unmatched.sentence);

  // and the question alone, in a person's own words, still answers on its own
  await ask(page, "does anything need me");
  await expect(log(page).locator(".as-reply").last()).toHaveAttribute(
    "data-outcome",
    "answer",
  );
  await expect(
    log(page).locator(".as-reply").last().locator(".as-unread"),
  ).toHaveCount(0);
});

/* The shared fixtures in packages/catalog/assistant.json, run against the module the browser actually
   loads. iOS runs the same list in its debug self-test and Android in a JVM test, so the three
   normalisers and matchers are held to one list rather than to each other. */
test("the web matcher agrees with the contract’s shared fixtures", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Arithmetic, not layout: once is enough.");
  await page.goto("/app/");
  const disagreements = await page.evaluate(
    async ({ stemsFixtures, messageFixtures }) => {
      const lib = await import("/src/lib/assistant.ts");
      const found: string[] = [];
      for (const f of stemsFixtures) {
        const got = lib.stems(f.says);
        if (JSON.stringify(got) !== JSON.stringify(f.stems))
          found.push(`stems of "${f.says}" were ${JSON.stringify(got)}`);
      }
      for (const f of messageFixtures) {
        const turn = lib.send(lib.opening(), f.says, null).at(-1);
        const kind = lib.outcomeOf(turn);
        const question = kind.startsWith("answer")
          ? (turn.matched?.id ?? null)
          : null;
        const groups = turn.groups.map((g: { id: string }) => g.id);
        if (
          kind !== f.expect ||
          question !== (f.question ?? null) ||
          JSON.stringify(groups) !== JSON.stringify(f.groups ?? [])
        )
          found.push(
            `"${f.says}" gave ${kind} ${question} ${JSON.stringify(groups)}`,
          );
      }
      return found;
    },
    {
      stemsFixtures: gilbert.fixtures.stems,
      messageFixtures: gilbert.fixtures.messages,
    },
  );
  expect(disagreements).toEqual([]);
});

/* One visit, one day. GilbertOne named the first day the calendar offers while the home card showed the visit
   actually booked. A visit is booked here the way the booking journey books one, the home card's date is
   read off the screen, and GilbertOne's answer must name the same day and time. */
test("GilbertOne names the visit the home card shows, not a day of its own", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/app/");
  await expect(page.getByText(nothingBooked.name).first()).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Main navigation" });
  if (await sidebar.isVisible())
    await sidebar
      .getByRole("button", { name: "Book a nurse", exact: true })
      .click();
  else await page.locator(".tabbar button").nth(1).click();
  await page
    .getByRole("button", { name: /Elderly care/ })
    .first()
    .click();
  const d = page.getByRole("dialog");
  for (let step = 0; step < 5; step++)
    await d.getByRole("button", { name: "Continue" }).click();
  await d.getByRole("checkbox").check();
  await confirmBooking(d);
  await d.getByRole("button", { name: "View my visits" }).click();
  if (await sidebar.isVisible())
    await sidebar
      .getByRole("button", { name: "Overview", exact: true })
      .click();
  else await page.locator(".tabbar button").nth(0).click();
  const card = page.locator(".visit-card small").first();
  await expect(card).toContainText("09:00");
  const cardWhen = (await card.innerText()).split(" – ")[0].trim();
  await launcher(page).click();
  await ask(page, "when is my nurse coming");
  const reply = log(page).locator(".as-reply").last();
  await expect(reply).toHaveAttribute("data-outcome", "answer");
  await expect(reply).toContainText(`A nurse is expected on ${cardWhen}.`);
});

/* The false positives in packages/catalog/gilbert-emergency-terms.json: ordinary sentences the terms raise
   today. Reported as an annotation, never a failure — a list that only ever raises accepts these, and
   tuning one out is a change to that file alone. */
test("false positives in the emergency terms are reported, not blocking", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Arithmetic, not layout: once is enough.");
  await page.goto("/app/");
  const raised = await page.evaluate(async () => {
    const lib = await import("/src/lib/assistant.ts");
    return lib.falsePositives.messages
      .filter((m: { says: string }) => lib.emergencyGroupsIn(m.says).length > 0)
      .map((m: { says: string }) => m.says);
  });
  const total = json("../packages/catalog/gilbert-emergency-terms.json")
    .falsePositives.messages.length;
  test.info().annotations.push({
    type: "gilbert-false-positives",
    description: `${raised.length} of ${total} still raise: ${raised.join(" | ") || "none"}`,
  });
  console.log(
    `GilbertOne emergency terms: ${raised.length} of ${total} false-positive fixtures still raise`,
  );
});
