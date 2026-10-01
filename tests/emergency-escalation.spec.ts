import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/* GilbertOne's emergency path, as a phone types it — the review of 1 October 2026. Three things the
 * panel used to answer calmly, held here on both viewports:
 *
 *   - a presentation the escalation ruleset calls an emergency and no emergency term names ("I have a
 *     headache and my tongue is swelling") was offered the intake's questions, because the panel
 *     asked only the terms list before opening a group;
 *   - "I don’t want to live anymore", typed with the curly apostrophe iOS writes, matched nothing;
 *   - "she isn’t breathing" never reached the term "not breathing".
 *
 * Each now meets the one emergency answer — the ambulance number, Thuso SOS, no intake chips and no
 * waiting dots — and a crisis adds the crisis lines. The browser's voice is stood down first: a reply
 * is read aloud, and in headless Chromium a cancel on a live utterance stalls input delivery. */
const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const gilbert = json("../packages/catalog/assistant.json");
const sos = json("../packages/catalog/sos.json");
const crisis = json("../packages/catalog/crisis-lines.json");
const ambulance: string = sos.emergency.numbers.find(
  (n: { id: string }) => n.id === "ambulance",
).number;

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

const isTheEmergencyAnswer = async (page: Page) => {
  const reply = lastReply(page);
  await expect(reply).toHaveClass(/as-reply-emergency/);
  await expect(reply).toHaveAttribute("data-outcome", "emergency");
  await expect(reply).toContainText(ambulance);
  await expect(panel(page).locator(".as-intake-chips")).toHaveCount(0);
  await expect(panel(page).locator(".as-pending")).toHaveCount(0);
};

test("a presentation the escalation ruleset names is the emergency answer, never the intake's questions", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await consent(page);
  for (const words of [
    "I have a headache and my tongue is swelling",
    "sudden weakness on one side",
    "I have a rash and my lips are swelling",
    "hello, my throat is swelling",
  ]) {
    await ask(page, words);
    await isTheEmergencyAnswer(page);
  }
});

test("the way a phone types does not hide an emergency: a curly apostrophe, a negation, a no-break space", async ({
  page,
}) => {
  await page.goto("/app/?open=assistant");
  await consent(page);
  /* A crisis named only by the escalation ruleset is still a crisis: the crisis lines follow the
     ambulance number, exactly as they do for the terms' own crisis words. */
  await ask(page, "I don’t want to live anymore");
  await isTheEmergencyAnswer(page);
  await expect(lastReply(page).locator(".as-crisis")).toContainText(crisis.heading);
  for (const words of [
    "she isn’t breathing",
    "he wasn't responding",
    "my throat\u00a0is swelling",
    "I can\u200b’t catch my breath",
  ]) {
    await ask(page, words);
    await isTheEmergencyAnswer(page);
  }
});

test("a nurse describing a swelling tongue in front of her is shown the emergency answer too", async ({
  page,
}) => {
  await page.goto("/app/?role=nurse");
  await page
    .getByRole("button", { name: gilbert.identity.callToAction, exact: true })
    .click();
  await expect(panel(page)).toHaveAttribute("data-audience", "nurse");
  await ask(page, "the patient's tongue is swelling");
  const reply = lastReply(page);
  await expect(reply).toHaveClass(/as-reply-emergency/);
  await expect(reply).toContainText(ambulance);
});
