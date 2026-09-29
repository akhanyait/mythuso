import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/* The symptom intake — the founder's ask of 28 September 2026. "I have a headache" is offered the
 * contract's set questions for a headache instead of "I can't assess that", one per turn, and the
 * answers become a card for the nurse. What is held here is what the flow refuses: no waiting dots
 * ever appear for a complaint the groups know (nothing is asked of the service); the stop word ends
 * it where it is; an emergency phrase typed as an answer gets the emergency answer and the intake
 * is over; and every sentence on the screen is packages/catalog/symptom-intake.json's, never typed.
 *
 * The browser's own voice is stood down before the app runs: a reply is read aloud, and in headless
 * Chromium a cancel on a live utterance stalls input delivery (see assistant-polish.spec.ts). */
const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const gilbert = json("../packages/catalog/assistant.json");
const intake = json("../packages/catalog/symptom-intake.json");
/* The case pathway (29 September 2026): the notes on a group derived from the knowledge base go on to
   offer a reading and a nurse, in packages/catalog/case.json's patient sentences and devices.json's
   source labels. They are allowed on the card, and nothing else is. */
const caseContract = json("../packages/catalog/case.json");
const devices = json("../packages/catalog/devices.json");
const sos = json("../packages/catalog/sos.json");
const ambulance: string = sos.emergency.numbers.find(
  (n: { id: string }) => n.id === "ambulance",
).number;

type Question = {
  id: string;
  ask: string;
  kind: "chips" | "text";
  options?: string[];
};
type Group = { id: string; name: string; questions: Question[] };
const groupOf = (id: string): Group =>
  intake.groups.find((g: Group) => g.id === id);
const questionsFor = (id: string): Question[] => [
  ...intake.common.questions,
  ...groupOf(id).questions,
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const synth = (
      window as unknown as {
        speechSynthesis?: { speak: () => void; cancel: () => void };
      }
    ).speechSynthesis;
    if (synth) {
      synth.speak = () => {};
      synth.cancel = () => {};
    }
  });
});

const panel = (page: Page) =>
  page.getByRole("dialog", { name: gilbert.identity.name });
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
const ask = async (page: Page, words: string) => {
  await panel(page).getByLabel(gilbert.conversation.inputLabel).fill(words);
  await panel(page)
    .getByRole("button", { name: gilbert.conversation.sendLabel, exact: true })
    .click();
};
const lastReply = (page: Page) =>
  panel(page).locator(".as-turn").last().locator(".as-reply");
const noDots = (page: Page) =>
  expect(panel(page).locator(".as-pending")).toHaveCount(0);

/* A chip is a 44-pixel target or it is mis-pressed on a phone. */
const press = async (page: Page, name: string) => {
  const button = lastReply(page).getByRole("button", { name, exact: true });
  const box = await button.boundingBox();
  expect(box, name).not.toBeNull();
  /* Rounded: a 44px box can measure 43.99997 in a fractional layout. */
  expect(Math.round(box!.height), `${name} is a 44px target`).toBeGreaterThanOrEqual(44);
  await button.click();
};

test("a headache is offered notes for the nurse, never the waiting dots, and the questions run through to the card", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const flow = intake.fixtures.flow;
  const group = groupOf(flow.group);
  const questions = questionsFor(flow.group);
  await page.goto("/app/?open=assistant");
  await consent(page);
  await ask(page, "I have a headache");
  const offer = lastReply(page);
  await expect(offer).toHaveClass(/as-reply-intake/);
  await expect(offer.locator(".as-headline")).toHaveText(group.name);
  await expect(offer).toContainText(intake.answer.opening);
  for (const sentence of intake.whatItIsNot)
    await expect(offer).toContainText(sentence);
  await expect(offer).toContainText(intake.answer.stop.sentence);
  /* The matcher's own word for a message no question matched — the phones' word for the same
     fixture — and no dots, because the service is never asked for it. */
  await expect(offer).toHaveAttribute("data-outcome", "unmatched");
  await noDots(page);
  await press(page, intake.answer.consent.yesLabel);
  for (const [i, question] of questions.entries()) {
    const reply = lastReply(page);
    await expect(reply.locator(".as-headline")).toHaveText(question.ask);
    await noDots(page);
    const answer = flow.answers[i];
    if (question.kind === "chips") {
      for (const option of question.options ?? [])
        await expect(
          reply.getByRole("button", { name: option, exact: true }),
        ).toBeVisible();
      await press(page, answer);
    } else {
      await expect(reply).toContainText(intake.answer.typeHint);
      await ask(page, answer);
    }
  }
  const notes = lastReply(page);
  await expect(notes).toContainText(intake.summary.title);
  await expect(notes.locator(".as-summary div")).toHaveCount(flow.rows);
  for (const [i, question] of questions.entries()) {
    const row = notes.locator(".as-summary div").nth(i);
    await expect(row.locator("dt")).toHaveText(question.ask);
    await expect(row.locator("dd")).toHaveText(flow.answers[i]);
  }
  await expect(notes).toContainText(intake.answer.closing);
  await expect(notes).toContainText(intake.review.unreviewed);
  await expect(notes).toContainText(intake.answer.arrangeCare);
  /* The question chips are gone; what stays on a headache card since 29 September 2026 are the case
     pathway's three chips — a reading, a nurse, not now — by packages/catalog/case.json's own labels. */
  const caseChips = new Set<string>([caseContract.screens.patient.readingOffer, caseContract.screens.patient.askNurse, caseContract.screens.patient.notNow]);
  for (const label of await notes.locator(".as-intake-chips button").allInnerTexts())
    expect(caseChips.has(label.trim()), `${label} is a case chip`).toBe(true);
  await expect(
    notes.getByRole("button", {
      name: gilbert.answers.unmatched.handoverLabel,
      exact: true,
    }),
  ).toBeVisible();
  await noDots(page);
  /* Copying puts the card's lines on the person's own clipboard; nothing is stored by the app. */
  await notes
    .getByRole("button", { name: intake.summary.copyLabel, exact: true })
    .click();
  await expect(
    notes.getByRole("button", { name: intake.summary.copiedLabel, exact: true }),
  ).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.startsWith(intake.summary.title)).toBe(true);
  expect(clipboard).toContain(
    intake.summary.line
      .replace("{question}", questions[0].ask)
      .replace("{answer}", flow.answers[0]),
  );
  /* Every visible sentence on every intake turn is the contract's, or her own answer. */
  const allowed = new Set<string>([
    gilbert.identity.name,
    gilbert.answers.unmatched.handoverLabel,
    ...intake.whatItIsNot,
    intake.review.unreviewed,
    intake.summary.title,
    intake.summary.copyLabel,
    intake.summary.copiedLabel,
    ...flow.answers,
    ...intake.groups.map((g: Group) => g.name),
    ...intake.groups.flatMap((g: Group) =>
      g.questions.flatMap((q) => [q.ask, ...(q.options ?? [])]),
    ),
    ...intake.common.questions.flatMap((q: Question) => [
      q.ask,
      ...(q.options ?? []),
    ]),
  ]);
  const walk = (node: unknown) => {
    if (typeof node === "string") allowed.add(node);
    else if (node && typeof node === "object")
      for (const value of Object.values(node)) walk(value);
  };
  walk(intake.answer);
  walk(caseContract.screens.patient);
  for (const source of devices.sources) allowed.add(source.label);
  const texts = await panel(page)
    .locator(".as-reply-intake")
    .locator("p, li, dt, dd, button, .as-who")
    .allInnerTexts();
  const strangers = texts
    .map((t) => t.trim())
    .filter((t) => t && !allowed.has(t));
  expect(strangers).toEqual([]);
});

test("the stop word ends the intake where it is and keeps what was answered", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await consent(page);
  await ask(page, "my tummy is sore");
  await expect(lastReply(page).locator(".as-headline")).toHaveText(
    groupOf("stomach").name,
  );
  await press(page, intake.answer.consent.yesLabel);
  const first = intake.common.questions[0];
  await expect(lastReply(page).locator(".as-headline")).toHaveText(first.ask);
  await press(page, first.options[0]);
  await ask(page, intake.answer.stop.word);
  const notes = lastReply(page);
  await expect(notes).toContainText(intake.answer.stop.stopped);
  await expect(notes).not.toContainText(intake.answer.closing);
  await expect(notes.locator(".as-summary div")).toHaveCount(1);
  await expect(notes.locator(".as-summary dd")).toHaveText(first.options[0]);
  await noDots(page);
});

test("an emergency phrase typed as an answer gets the emergency answer, and the intake is over", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await consent(page);
  await ask(page, "I feel dizzy and weak");
  await expect(lastReply(page).locator(".as-headline")).toHaveText(
    groupOf("dizziness").name,
  );
  await press(page, intake.answer.consent.yesLabel);
  await expect(lastReply(page).locator(".as-intake-chips")).toBeVisible();
  const emergency = intake.fixtures.messages.find(
    (f: { expect: string | null }) => f.expect === "emergency",
  );
  await ask(page, emergency.says);
  const reply = lastReply(page);
  await expect(reply).toHaveClass(/as-reply-emergency/);
  await expect(reply).toContainText(ambulance);
  await expect(panel(page).locator(".as-intake-chips")).toHaveCount(0);
  await noDots(page);
});

test("no to the offer writes nothing down, and the chip opens the general group", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await consent(page);
  await ask(page, "I have a headache");
  await press(page, intake.answer.consent.noLabel);
  await expect(lastReply(page)).toHaveText(
    new RegExp(gilbert.identity.name + "\\s*" + intake.answer.consent.declined.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  await expect(panel(page).locator(".as-summary")).toHaveCount(0);
  const chip = gilbert.questions.find(
    (q: { answer: string }) => q.answer === "intake",
  );
  await panel(page).getByRole("button", { name: chip.asks, exact: true }).click();
  await expect(lastReply(page).locator(".as-headline")).toHaveText(
    groupOf(intake.chip.group).name,
  );
  await expect(lastReply(page)).toHaveAttribute("data-outcome", "answer");
  await noDots(page);
});
