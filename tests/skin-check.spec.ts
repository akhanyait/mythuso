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
 * A short clip, since the founder's decision of 2 October 2026, is held the same way and its sound is
 * never played: the element is muted, has no controls attribute and mutes itself again when anything
 * turns it up, and a clip over the contract's cap is let go with the contract's sentence.
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
/* Two clips, made the same way: a sixteen-pixel square of skin colour with a tone under it, so there is a
   sound for the check to refuse to play, and one a second longer than the cap with no sound at all.
     ffmpeg -f lavfi -i color=c=0xc0705a:s=16x16:r=2 -f lavfi -i sine=frequency=440:sample_rate=8000 -t 1 \
       -c:v libvpx -b:v 4k -c:a libopus -b:a 6k -ac 1 short.webm
     ffmpeg -f lavfi -i color=c=0xc0705a:s=16x16:r=1 -t 16 -c:v libvpx -b:v 2k long.webm */
const CLIP = Buffer.from(
  [
    "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAcOEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTb",
    "uMU6uEElTDZ1OsggGkTbuMU6uEHFO7a1Osggb47AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS",
    "4xMDJEiYhAj4AAAAAAABZUrmtAyK4BAAAAAAAATteBAXPFiPA2JNW48rWMnIEAIrWcg3VuZIiBAIaFVl9WUDiDgQEj44OEHc1lAOCQsIEQuoEQ",
    "moECVbCEVbmBAVXugQDsAQAAAAAAAAIAAK4BAAAAAAAAaNeBAnPFiJV0L4f/8iiVnIEAIrWcg3VuZIiBAIaGQV9PUFVTVqqDYy6gVruEBMS0AI",
    "OBAiPjg4QBMS0A4ZGfgQG1iEC/QAAAAAAAYmSBEFXugQBjopNPcHVzSGVhZAEBOAFAHwAAAAAAElTDZ0DTc3OfY8CAZ8iZRaOHRU5DT0RFUkSH",
    "jExhdmY2My4xLjEwMnNz1WPAi2PFiPA2JNW48rWMZ8igRaOHRU5DT0RFUkSHk0xhdmM2My4xLjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkz",
    "AwOjAwOjAxLjAwMDAwMDAwMABzc9ZjwItjxYiVdC+H//IolWfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDIgbGlib3B1c2fIoUWjiERVUkFU",
    "SU9ORIeTMDA6MDA6MDEuMDA4MDAwMDAwAB9DtnVEdeeBAKORggAAgAiDyiTjwiBoNB6qTeiju4EAAICwAgCdASoQABAAAEcIhYWIhYSIAgICda",
    "oD+AIM/uAA/sDP/6yv5lfzK/3yP/xIX4kL8SF/4fwAo5uCABWACKcaXYqYLl9aylEr1T75KdeosRClK4Cjk4IAKYAIoS8Q5F373Aba+2KY0ayj",
    "lIIAPYAIoTjQdzKqXEurkLjPsyGIo5SCAFGACKE40Hcyql6P1UdSBUuTbqOUggBlgAihONB3L0eIFVlr7FsPwW6jmIIAeYAIoS8Q5F37hwfmle",
    "HYJ4EszkSCjaOUggCNgAihONB3MqpeTaylU5PM4/Cjk4IAoYAIoTjQdy9HiA2WilwN5iCjlIIAtYAIoTjQdzKqW/C7/UcBansso5WCAMmACKFI",
    "A0bVUl56ahy7P9urMICjk4IA3YAIoTjQdzKqVptrwdJjx2CjkoIA8YAIoS8Q5F373AbPT3c1E6OXggEFgAihONB3MqpWlhl5J7GL81yZs3CjlI",
    "IBGYAIoTjQdzKqXlKTIFZtffzSo5eCAS2ACKFIA0bVUn3J4rwP28RLZOjnoKOVggFBgAihONB3MqpWvrkT1QeqSNzFo5SCAVWACKE40Hcyqmb2",
    "g6pa5jKywKOUggFpgAihONB3MqpXO3B3BwUzFYGjk4IBfYAIoTjQdy9HeEasCL8juOCjkIIBkYAIoS8Q5F373812cK+jkoIBpYAIoTjQdzKqVr",
    "mI/BnCaKOTggG5gAihONB3Mqpm9oOdZcwHJKOSggHNgAiii4Sx5bMh3dkU0NP4o5KCAeGACKKBLvwCMxUfoa6fQ2CjkYIB9YAIoouEseWzIuJG",
    "wflMo5WBAfQAsQEAARAQABgAGFgv9AAIAACjk4ICCYAIoouEsbsCkITV+orL54Cjk4ICHYAIoouEseWzIO11WnXcDDSjk4ICMYAIoouEseWzIO",
    "1uPYRkNECjkYICRYAIooEu/AIzGDi/Kx5co5CCAlmACDqURZ4xPOsUCEnSo5KCAm2ACDquAmrKg53jqLhkTGCjkIICgYAIO2S1njE4n7Q+EPij",
    "j4IClYAIO2S1njEwRs3C86ORggKpgAg7ZLWeLzFFRdGaV2ijkIICvYAIO2S1ni8bkR7YW7GjkIIC0YAIOpEGop51v7wn59qjkYIC5YAIOpRFnj",
    "E4n8IVxoZAo5CCAvmACDqURZ4xOKCz4xM4o5GCAw2ACDqURZ4vMEkMQqULaKORggMhgAg6lEWeL1jmh0g3UICjkoIDNYAIOpEGop5oFdM1EB+B",
    "6KOPggNJgAg6lEWeMTzO39Bjo5KCA12ACDqURZ4xML7nOMLWjsCjkoIDcYAIOpRFni8xbbfQgum9gKORggOFgAg6lEWeL1pZy3APRv+jkoIDmY",
    "AIOpEGop5LXyaP71bisKOPggOtgAg6lEWeMTi6iG9wo5GCA8GACDqURZ4xMF2IjWUeQKOQggPVgAg6lEWeLzBGo8nrQKCdoZGCA+kACAZN/kEu",
    "T+c5jAcs6JuBB3WihADN/mAcU7trkbuPs4EAt4r3gQHxggJ98IEW",
  ].join(""),
  "base64",
);
const LONG_CLIP = Buffer.from(
  [
    "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAATTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTb",
    "uMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggS97AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS",
    "4xMDJEiYhAz0AAAAAAABZUrmvXrgEAAAAAAABO14EBc8WIYC2GhNWraUicgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4Q7msoA4JCwgRC6gRCa",
    "gQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/pzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAyc3PVY8CLY8WIYC2GhNWraUhnyK",
    "BFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MTYuMDAwMDAwMDAwAB9DtnVBJueBAKO7gQAA",
    "gLACAJ0BKhAAEAAARwiFhYiZhIgCAgJ1qgP4Agz9+wD+1jH/69H89H89H+f7/+FNfCmvhTX/CBCjrIED6ACxAQABEBAAGAAwP/QMAO8A/tYx/+",
    "vR/PR/PR/n+//hTXwpr4U1/wgQo6yBB9AAsQEAARAQABgAMD/0DADvAP7WMf/r0fz0fz0f5/v/4U18Ka+FNf8IEKOsgQu4ALEBAAEQEAAYADA/",
    "9AwA7wD+1jH/69H89H89H+f7/+FNfCmvhTX/CBCjrIEPoACxAQABEBAAGAAwP/QMAO8A/tYx/+vR/PR/PR/n+//hTXwpr4U1/wgQo6yBE4gAsQ",
    "EAARAQABgAMD/0DADvAP7WMf/r0fz0fz0f5/v/4U18Ka+FNf8IEB9DtnVBGOeCF3CjrIEAAACxAQABEBAAGAAwP/QMAO8A/tYx/+vR/PR/PR/n",
    "+//hTXwpr4U1/wgQo6yBA+gAsQEAARAQFGAAwP/QMAO8AP7WMf/r0fz0fz0f5/v/4U18Ka+FNf8IEKOsgQfQALEBAAEQEAAYADA/9AwA7wD+1j",
    "H/69H89H89H+f7/+FNfCmvhTX/CBCjrIELuACxAQABEBAAGAAwP/QMAO8A/tYx/+vR/PR/PR/n+//hTXwpr4U1/wgQo6yBD6AAsQEAARAQABgA",
    "MD/0DADvAP7WMf/r0fz0fz0f5/v/4U18Ka+FNf8IEKOsgROIALEBAAEQEAAYADA/9AwA7wD+1jH/69H89H89H+f7/+FNfCmvhTX/CBAfQ7Z1QL",
    "zngi7go6yBAAAAsQEAARAQABgAMD/0DADvAP7WMf/r0fz0fz0f5/v/4U18Ka+FNf8IEKOsgQPoALEBAAEQEAAYADA/9AwA7wD+1jH/69H89H89",
    "H+f7/+FNfCmvhTX/CBCjrIEH0ACxAQABEBAUYADA/9AwA7wA/tYx/+vR/PR/PR/n+//hTXwpr4U1/wgQo6yBC7gAsQEAARAQABgAMD/0DADvAP",
    "7WMf/r0fz0fz0f5/v/4U18Ka+FNf8IEBxTu2uRu4+zgQC3iveBAfGCAbHwgQM=",
  ].join(""),
  "base64",
);

/* The photo reader's routes (2 October 2026) are the assistant service's, which these journeys never reach:
   every test starts with the reader shut, in its own refusal's words, and a test about the reader opens it
   with a stub of its own. No request reaches Azure or any network. */
const apis = json("../packages/catalog/apis/assistant.json");
const override = json("../packages/catalog/demonstration-override.json");
const reader = skin.photoReading;
const refusalOf = (id: string) => apis.routes.find((x: { method: string; path: string }) => x.method === "POST" && x.path === "/v1/photo-reading").refusals.find((x: { id: string }) => x.id === id);
const refusing = (id: string) => ({ status: refusalOf(id).status, body: { error: id.replace(/-/g, "_"), refusalId: id, message: refusalOf(id).statement } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const synth = (window as unknown as { speechSynthesis?: { speak: () => void; cancel: () => void } }).speechSynthesis;
    if (synth) {
      synth.speak = () => {};
      synth.cancel = () => {};
    }
  });
  await page.route("**/assistant/v1/photo-reading", (route) => {
    const shut = refusing("photo-reading-not-open");
    return route.fulfill({ status: shut.status, contentType: "application/json", body: JSON.stringify(shut.body) });
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
  for (const sentence of [...skin.whatItIsNot, skin.review.unreviewed, skin.photo.held, skin.photo.noReader, skin.clip.sound, skin.photoReading.sentence])
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

test("a short clip is held beside the photo, plays muted with no control for its sound, is never sent, and goes when the check ends", async ({ page }) => {
  await open(page);
  const screen = check(page);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") sent.push(`${request.method()} ${request.url()}`);
  });
  const input = screen.getByLabel(skin.photo.addLabel, { exact: true });
  await input.setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  await input.setInputFiles({ name: "rash.webm", mimeType: "video/webm", buffer: CLIP });
  await expect(screen.getByRole("img", { name: skin.photo.alt }), "a clip is held beside the photo, not instead of it").toBeVisible();
  const clip = screen.getByLabel(skin.clip.label);
  await expect(clip).toBeVisible();
  const held = () =>
    clip.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, defaultMuted: v.defaultMuted, volume: v.volume, controls: v.hasAttribute("controls"), blob: v.src.startsWith("blob:") }));
  expect(await held()).toEqual({ muted: true, defaultMuted: true, volume: 0, controls: false, blob: true });
  const src = await clip.evaluate((v: HTMLVideoElement) => v.src);

  await screen.getByRole("button", { name: skin.clip.playLabel }).click();
  await expect(screen.getByRole("button", { name: skin.clip.pauseLabel })).toBeVisible();
  /* Whatever turns it up — a script, an extension, the browser's own menu — the element mutes itself again. */
  await clip.evaluate((v: HTMLVideoElement) => {
    v.muted = false;
    v.volume = 1;
  });
  await expect.poll(held).toEqual({ muted: true, defaultMuted: true, volume: 0, controls: false, blob: true });
  await screen.getByRole("button", { name: skin.clip.pauseLabel }).click();

  await press(page, "who", "self");
  await press(page, "signs", "none");
  await see(page);
  const notes = screen.getByRole("region", { name: skin.summary.title });
  await expect(notes).toContainText(skin.summary.photoLine);
  await expect(notes).toContainText(skin.summary.clipLine);

  expect(sent, "nothing but a GET left the page while the clip was held").toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);

  await screen.getByRole("button", { name: skin.screen.endLabel }).click();
  await expect(screen).toContainText(skin.screen.ended);
  await expect(screen.getByLabel(skin.clip.label)).toHaveCount(0);
  expect(await page.evaluate((url) => fetch(url).then(() => "still there", () => "revoked"), src), "the clip's object URL is revoked when the check ends").toBe("revoked");
});

test("a clip longer than the cap is refused in the contract's words, and removing a clip lets it go", async ({ page }) => {
  await open(page);
  const screen = check(page);
  const input = screen.getByLabel(skin.photo.addLabel, { exact: true });
  await input.setInputFiles({ name: "long.webm", mimeType: "video/webm", buffer: LONG_CLIP });
  await expect(screen.getByRole("alert")).toHaveText(skin.clip.tooLong);
  await expect(screen.getByLabel(skin.clip.label)).toHaveCount(0);

  await input.setInputFiles({ name: "rash.webm", mimeType: "video/webm", buffer: CLIP });
  const clip = screen.getByLabel(skin.clip.label);
  await expect(clip).toBeVisible();
  await expect(screen.getByRole("alert")).toHaveCount(0);
  const src = await clip.evaluate((v: HTMLVideoElement) => v.src);
  await screen.getByRole("button", { name: skin.clip.removeLabel }).click();
  await expect(screen.getByLabel(skin.clip.label)).toHaveCount(0);
  expect(await page.evaluate((url) => fetch(url).then(() => "still there", () => "revoked"), src), "a removed clip's object URL is revoked").toBe("revoked");
});

/* ---- The photo reader, under the founder's demonstration override (2 October 2026) -------------------- */

type Sent = { userConsent: boolean; who: string; imageBase64: string; imageType: string };
/* The reader opened by a stub: the status route says who reads the picture where, and each look is
   answered by `answer`. Every body the page sent is kept for the test to read. */
const openReader = async (page: Page, answer: (sent: Sent, n: number) => { status: number; body: unknown }) => {
  const sent: Sent[] = [];
  await page.route("**/assistant/v1/photo-reading", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ processor: "Azure OpenAI", region: "South Africa North", demonstration: true, disclaimer: override.disclaimer.sentence }),
      });
    const body = route.request().postDataJSON() as Sent;
    sent.push(body);
    const reply = answer(body, sent.length);
    return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  return sent;
};
const lookRegion = (page: Page) => check(page).getByRole("region", { name: reader.words.askLabel });
const askToLook = (page: Page) => lookRegion(page).getByRole("button", { name: reader.words.askLabel }).click();
const chip = (page: Page, q: string, o: string) => check(page).getByRole("group", { name: question(q).ask }).getByRole("button", { name: label(q, o), exact: true });
/* What left the page: one JPEG still, her agreement and who — and nothing else. */
const heldToOneStill = (sent: Sent, who: string) => {
  expect(Object.keys(sent).sort()).toEqual(["imageBase64", "imageType", "userConsent", "who"]);
  expect(sent.userConsent).toBe(true);
  expect(sent.who).toBe(who);
  expect(sent.imageType).toBe("image/jpeg");
  expect(sent.imageBase64.startsWith("/9j/"), "a JPEG, made on the page").toBe(true);
  expect(sent.imageBase64).not.toContain("GkXfo");
  expect(Buffer.from(sent.imageBase64, "base64").length).toBeLessThanOrEqual(reader.image.maxBytes);
};

test("GilbertOne looks only when asked, suggests the check's own words, and only what she confirms reaches the rules", async ({ page }) => {
  const sent = await openReader(page, () => ({ status: 200, body: { looks: ["ring", "scaly"], where: ["arms"] } }));
  await open(page);
  const screen = check(page);
  for (const sentence of [reader.offered.whatItIsNot, reader.offered.held, reader.offered.noReader]) await expect(screen).toContainText(sentence);
  await expect(screen).not.toContainText(reader.sentence);
  await expect(lookRegion(page), "nothing to look at before a picture is held").toHaveCount(0);

  await screen.getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  /* Drawn, not merely laid out: the page's content policy lets it show its own object URL. */
  await expect.poll(() => screen.getByRole("img", { name: skin.photo.alt }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  const look = lookRegion(page);
  for (const sentence of [override.disclaimer.sentence, reader.words.notAnExamination, reader.words.askLead]) await expect(look).toContainText(sentence);
  await expect(look).toContainText(reader.words.goes.replaceAll("{processor}", "Azure OpenAI").replaceAll("{region}", "South Africa North"));

  await askToLook(page);
  await expect(screen.getByRole("status")).toHaveText(reader.local.whoFirst);
  expect(sent, "nothing leaves before she says who the rash is on").toEqual([]);

  await press(page, "who", "self");
  await askToLook(page);
  const thinks = look.getByRole("group", { name: reader.words.thinks });
  for (const [q, o] of [["looks", "ring"], ["looks", "scaly"], ["where", "arms"]])
    await expect(thinks.getByRole("button", { name: label(q, o), exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(look).toContainText(reader.words.isThatRight);
  expect(sent).toHaveLength(1);
  heldToOneStill(sent[0], "self");

  /* Nothing is in her answers until she confirms, and what she takes off never is. */
  await expect(chip(page, "looks", "ring")).toHaveAttribute("aria-pressed", "false");
  await thinks.getByRole("button", { name: label("where", "arms"), exact: true }).click();
  await expect(thinks.getByRole("button", { name: label("where", "arms"), exact: true })).toHaveAttribute("aria-pressed", "false");
  await look.getByRole("button", { name: reader.words.confirmLabel }).click();
  await expect(screen.getByRole("status")).toHaveText(reader.words.confirmed);
  await expect(chip(page, "looks", "ring")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "looks", "scaly")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "where", "arms")).toHaveAttribute("aria-pressed", "false");

  /* The same rules decide, from her answers: the scaly ring's general information. */
  await press(page, "signs", "none");
  await see(page);
  const outcome = screen.locator('[data-outcome="general-information"]');
  const fixture = skin.fixtures.cases.find((f: { name: string }) => f.name === "scaly ring");
  for (const id of fixture.conditions) await expect(outcome.getByRole("article", { name: titleOf(id) })).toBeVisible();
  await expect(outcome).toContainText(skin.outcomes["general-information"].onlyAClinician);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("a reader that is shut, fails or refuses leaves the manual check as it was, and a young baby's picture is never sent", async ({ page }) => {
  /* Shut: the beforeEach's own refusal. No look is offered and the closed sentences stay. */
  await open(page);
  await check(page).getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  await expect(check(page)).toContainText(reader.sentence);
  await expect(check(page)).toContainText(skin.photo.noReader);
  await expect(lookRegion(page)).toHaveCount(0);
  expect(refusing("photo-reading-not-open").body.message, "the shut route says the skin check's own sentence").toBe(reader.sentence);

  /* Open, then a fault, then a refusal with a reason, then a young baby. */
  const sent = await openReader(page, (_, n) => (n === 1 ? refusing("internal-error") : refusing("photo-shows-a-face-or-private-area")));
  await open(page);
  const screen = check(page);
  await screen.getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  await press(page, "who", "adult");
  await askToLook(page);
  await expect(screen.getByRole("status")).toHaveText(reader.words.fellBack);
  await askToLook(page);
  await expect(screen.getByRole("status")).toHaveText(refusalOf("photo-shows-a-face-or-private-area").statement);
  expect(sent).toHaveLength(2);

  await press(page, "who", "young-baby");
  await askToLook(page);
  await expect(screen.getByRole("status")).toHaveText(reader.local.youngBaby);
  expect(sent, "a young baby's picture never leaves the phone").toHaveLength(2);

  await press(page, "looks", "welts");
  await press(page, "signs", "none");
  await see(page);
  await expect(screen.locator('[data-outcome="sister-today"]')).toContainText(skin.rules.find((x: { id: string }) => x.id === "young-baby").says);
});

test("a sign the emergency terms raise still outranks a confirmed reading", async ({ page }) => {
  await openReader(page, () => ({ status: 200, body: { looks: ["welts"], where: [] } }));
  await open(page);
  await check(page).getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.png", mimeType: "image/png", buffer: PNG });
  await press(page, "who", "self");
  await askToLook(page);
  await lookRegion(page).getByRole("button", { name: reader.words.confirmLabel }).click();
  await expect(chip(page, "looks", "welts")).toHaveAttribute("aria-pressed", "true");
  await press(page, "signs", "airway");
  await expect(check(page)).toHaveCount(0);
  await expect(lastReply(page)).toHaveClass(/as-reply-emergency/);
  await expect(lastReply(page)).toContainText(ambulance);
});

test("from a clip, one still frame is sent — never the clip and never its sound", async ({ page }) => {
  const sent = await openReader(page, () => ({ status: 200, body: { looks: ["red-patches"], where: [] } }));
  await open(page);
  const screen = check(page);
  await screen.getByLabel(skin.photo.addLabel, { exact: true }).setInputFiles({ name: "rash.webm", mimeType: "video/webm", buffer: CLIP });
  await expect(screen.getByLabel(skin.clip.label)).toBeVisible();
  await expect(lookRegion(page)).toContainText(reader.words.clipGoes);
  await press(page, "who", "self");
  await askToLook(page);
  await expect(lookRegion(page).getByRole("group", { name: reader.words.thinks })).toBeVisible();
  expect(sent).toHaveLength(1);
  heldToOneStill(sent[0], "self");
  expect(sent[0].imageBase64.length, "a still of a sixteen-pixel frame, not the clip").toBeLessThan(CLIP.toString("base64").length);
  expect(await screen.getByLabel(skin.clip.label).evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
});
