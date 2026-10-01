import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/* Show GilbertOne a rash — the founder's ask of 1 October 2026. A patient chooses a photo, answers the set
 * questions and reads one of three outcomes the contract's rules decide. What is held here is what the
 * check refuses: the photo is shown back from an object URL and never sent (no request but a GET leaves
 * the page while it is held, nothing is stored) and the URL stops working the moment the check ends; a
 * sign the emergency terms raise is answered by the conversation's own emergency answer, at once, as is
 * a rash with swelling lips typed into the notes; general information names more than one thing, says
 * only a nurse or doctor who sees it can say, and says nobody has reviewed it; and every sentence on the
 * screen is packages/catalog/skin-check.json's or a knowledge entry's.
 *
 * The browser's own voice is stood down before the app runs: a reply is read aloud, and in headless
 * Chromium a cancel on a live utterance stalls input delivery (see assistant-polish.spec.ts). */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const gilbert = json("../packages/catalog/assistant.json");
const skin = json("../packages/catalog/skin-check.json");
const conditions = json("../packages/catalog/knowledge/conditions.json");
const firstAid = json("../packages/catalog/knowledge/first-aid.json");
const sos = json("../packages/catalog/sos.json");
const ambulance: string = sos.emergency.numbers.find((n: { id: string }) => n.id === "ambulance").number;

type Option = { id: string; label: string };
type Question = { id: string; ask: string; options?: Option[] };
const question = (id: string): Question => skin.questions.find((q: Question) => q.id === id);
const label = (q: string, o: string) => question(q).options!.find((x) => x.id === o)!.label;
const titleOf = (id: string) => [...conditions, ...firstAid].find((e: { id: string }) => e.id === id).title;
/* A one-pixel PNG, made here rather than read from a fixture file: the photo is never anybody's. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const synth = (window as unknown as { speechSynthesis?: { speak: () => void; cancel: () => void } }).speechSynthesis;
    if (synth) {
      synth.speak = () => {};
      synth.cancel = () => {};
    }
  });
});

const panel = (page: Page) => page.getByRole("dialog", { name: gilbert.identity.name });
const check = (page: Page) => panel(page).locator(".sk");
const open = async (page: Page) => {
  await page.goto("/app/?open=assistant");
  const sheet = panel(page);
  await sheet.getByRole("checkbox", { name: gilbert.consent.checkboxDoctor }).check();
  await sheet.getByRole("checkbox", { name: gilbert.consent.checkboxEmergency }).check();
  await sheet.getByRole("button", { name: gilbert.consent.accept }).click();
  await sheet.getByRole("button", { name: skin.entry.chipLabel }).click();
  await expect(check(page).getByRole("heading", { name: skin.screen.title })).toBeVisible();
};
/* A chip is a 44-pixel target or it is mis-pressed on a phone. */
const press = async (page: Page, q: string, o: string) => {
  const button = check(page).getByRole("group", { name: question(q).ask }).getByRole("button", { name: label(q, o), exact: true });
  const box = await button.boundingBox();
  expect(box, label(q, o)).not.toBeNull();
  expect(Math.round(box!.height), `${label(q, o)} is a 44px target`).toBeGreaterThanOrEqual(44);
  await button.click();
};
const see = (page: Page) => check(page).getByRole("button", { name: skin.screen.seeLabel }).click();
const lastReply = (page: Page) => panel(page).locator(".as-turn").last().locator(".as-reply");

test("a photo is held on the screen and never sent, the answers reach general information, and ending the check lets the photo go", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const screen = check(page);
  for (const sentence of [...skin.whatItIsNot, skin.review.unreviewed, skin.photo.held, skin.photo.noReader, skin.photo.videoRefused, skin.photoReading.sentence])
    await expect(screen).toContainText(sentence);

  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") sent.push(`${request.method()} ${request.url()}`);
  });
  await screen.getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  const photo = screen.getByRole("img", { name: skin.photo.alt });
  await expect(photo).toBeVisible();
  const src = (await photo.getAttribute("src"))!;
  expect(src.startsWith("blob:"), "the photo is shown from an object URL in this page").toBe(true);

  await press(page, "who", "self");
  await press(page, "looks", "welts");
  await press(page, "feels", "itchy");
  await press(page, "signs", "none");
  await see(page);

  const outcome = screen.locator('[data-outcome="general-information"]');
  await expect(outcome.getByRole("heading", { name: skin.outcomes["general-information"].headline })).toBeVisible();
  await expect(outcome).toContainText(skin.outcomes["general-information"].onlyAClinician);
  const fixture = skin.fixtures.cases.find((f: { name: string }) => f.name === "itchy welts on an adult");
  for (const id of fixture.conditions) await expect(outcome.getByRole("article", { name: titleOf(id) })).toBeVisible();
  expect(fixture.conditions.length, "never a single answer").toBeGreaterThanOrEqual(2);
  await expect(outcome.getByRole("article", { name: titleOf(skin.selfCare.always[0]) })).toBeVisible();
  await expect(outcome).toContainText(skin.knowledge.unreviewed);
  await expect(outcome).not.toContainText(/you have/i);

  const notes = screen.getByRole("region", { name: skin.summary.title });
  await expect(notes).toContainText(`${question("who").ask}: ${label("who", "self")}`);
  await expect(notes).toContainText(skin.summary.photoLine);
  await expect(notes).toContainText(skin.summary.sendLead);
  await notes.getByRole("button", { name: skin.summary.copyLabel }).click();
  await expect(notes.getByRole("button", { name: skin.summary.copiedLabel })).toBeVisible();

  /* Held and never sent, nor kept: no request but a GET while the photo was on the screen, and nothing in
     either storage the browser offers. */
  expect(sent, "nothing but a GET left the page while the photo was held").toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);

  await screen.getByRole("button", { name: skin.screen.endLabel }).click();
  await expect(screen).toContainText(skin.screen.ended);
  await expect(screen.getByRole("img", { name: skin.photo.alt })).toHaveCount(0);
  expect(await page.evaluate((url) => fetch(url).then(() => "still there", () => "revoked"), src), "the object URL is revoked when the check ends").toBe("revoked");
});

test("a sign the emergency terms raise is the conversation's emergency answer at once, and the check closes", async ({ page }) => {
  await open(page);
  await check(page).getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  await press(page, "signs", "airway");
  await expect(check(page)).toHaveCount(0);
  const reply = lastReply(page);
  await expect(reply).toHaveClass(/as-reply-emergency/);
  await expect(reply).toContainText(ambulance);
  await expect(panel(page).locator(".as-turn").last().locator(".as-said")).toContainText(label("signs", "airway"));
});

test("a rash with swelling lips typed into the notes reaches the emergency answer before any rule reads it", async ({ page }) => {
  await open(page);
  await press(page, "who", "self");
  await press(page, "signs", "none");
  const typed = skin.fixtures.cases.find((f: { typed?: string }) => /lips are swelling/.test(f.typed ?? "")).typed;
  await check(page).getByRole("textbox", { name: question("new-things").ask }).fill(typed);
  await see(page);
  await expect(check(page)).toHaveCount(0);
  await expect(lastReply(page)).toHaveClass(/as-reply-emergency/);
  await expect(lastReply(page)).toContainText(ambulance);
});

test("a large burn is a sign to show a sister today, read back from the first-aid entry; nothing answered asks for the two questions first", async ({ page }) => {
  await open(page);
  await see(page);
  await expect(check(page).getByRole("alert")).toHaveText(skin.screen.missing);
  await press(page, "who", "self");
  await press(page, "signs", "burn");
  await see(page);
  const outcome = check(page).locator('[data-outcome="sister-today"]');
  await expect(outcome.getByRole("heading", { name: skin.outcomes["sister-today"].headline })).toBeVisible();
  const burn = skin.rules.find((r: { id: string }) => r.id === "burn");
  await expect(outcome).toContainText(burn.says);
  await expect(outcome.getByRole("article", { name: titleOf(burn.drawsOn[0]) })).toBeVisible();
  await expect(outcome).toContainText(skin.outcomes["sister-today"].arrange);
  await expect(outcome).toContainText(skin.knowledge.unreviewed);
  /* Back to the conversation: the composer is where it was. */
  await check(page).getByRole("button", { name: skin.screen.backLabel }).click();
  await expect(check(page)).toHaveCount(0);
  await expect(panel(page).getByLabel(gilbert.conversation.inputLabel)).toBeVisible();
});
