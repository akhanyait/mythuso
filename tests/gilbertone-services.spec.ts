import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/* The connected-capability region on the live patient panel, since 22 September 2026.

   The panel's conversation is held by tests/assistant.spec.ts. What is held here is the region that
   sits beside the transcript and reaches the GilbertOne service's versioned routes through
   lib/gilbertone-service.ts: capability status, the sources an answer may stand on, the guided
   assessment, the device prompt and the clinician handover. Every one of those routes is either
   connected or gated, and the whole point of this file is to prove the panel tells the truth about
   which — that a gated triage renders the contract's own refusal sentence and offers a nurse door
   beside it, that a prepared handover shows the pack for review and a submission that reaches no
   clinician says so in the contract's words, that a device reading is an explanation and never a
   simulated number, and that the sources an answer stands on carry their attribution.

   Nothing here invents a capability. The refusal sentences are read from the same contract the
   service reads them from — packages/catalog/apis/assistant.json — and the panel's own words from
   the lazy web catalogue, packages/catalog/assistant-chat-ui.json, so a test that disagrees with the
   panel disagrees with the catalogue too. The routes are stubbed at the versioned addresses the
   client calls, because the assistant API is not one of playwright's web servers: a journey decides
   whether a route answers with a pack or with its own refusal, and asserts the panel renders exactly
   what came back. */

const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const ui = json("../packages/catalog/assistant-chat-ui.json");
const copy = ui.service;
const gilbert = json("../packages/catalog/assistant.json");
const apis = json("../packages/catalog/apis/assistant.json");

/* A refusal's own sentence, read from the contract the service reads it from rather than retyped
   here. The refusals live both in the engine's top-level list and beside the route that answers
   them, so this walks the whole contract for the first statement carrying the id. */
const refusalStatement = (id: string): string => {
  let found: string | null = null;
  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.id === id && typeof record.statement === "string") {
      found = record.statement;
      return;
    }
    Object.values(record).forEach(walk);
  };
  walk(apis);
  if (!found) throw new Error(`No refusal "${id}" in packages/catalog/apis/assistant.json`);
  return found;
};

const panel = (page: Page) =>
  page.getByRole("dialog", { name: gilbert.identity.name });
const field = (page: Page) =>
  panel(page).getByLabel(gilbert.conversation.inputLabel);
const ask = async (page: Page, words: string) => {
  await field(page).fill(words);
  await panel(page)
    .getByRole("button", { name: gilbert.conversation.sendLabel, exact: true })
    .click();
};
/* The patient's own door in, the way every conversation journey in assistant.spec.ts walks it. */
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

/* The region itself, and one of its collapsible blocks opened by the words on its summary. */
const region = (page: Page) => panel(page).locator(".gos-region");
const openBlock = async (page: Page, heading: string) => {
  const block = region(page)
    .locator("details.gos-block")
    .filter({ hasText: heading });
  await block.locator("summary").click();
  return block;
};

/* The turn route is stubbed to refuse so the panel settles on the local contract's own answer for
   "I have a headache" — the unmatched reply — which is the deterministic read the region keys the
   guided-assessment offer on. Nothing here depends on a live orchestrator. */
const stubTurnRefused = (page: Page) =>
  page.route("**/assistant/v1/turn", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );

/* A handover pack the service would assemble for review: a summary, an urgency that is a label and
   never a score, the symptoms discussed, the sources an answer stood on, and no device readings —
   because a real reading is gated on a data protection assessment, so an honest pack has none and
   the panel shows the "connect a device" explanation in the space the readings would occupy. */
const PACK = {
  handoverRef: "handover-spec-0001",
  preparedAt: "2026-09-22T06:15:00.000Z",
  pack: {
    summary: "Two-day headache with poor sleep, discussed in this conversation.",
    urgency: "same-day-review",
    symptoms: ["headache", "poor sleep"],
    vitals: [],
    sources: ["headache-self-care"],
  },
};
const packJson = () =>
  JSON.stringify({
    handoverRef: PACK.handoverRef,
    preparedAt: PACK.preparedAt,
    pack: { ...PACK.pack },
  });

/* The refusal body a gated route answers with: the contract's own id and sentence, which is what the
   client reads off the response and the panel renders verbatim. */
const refusalBody = (id: string, status: number) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({
    error: id.replace(/-/g, "_"),
    refusalId: id,
    message: refusalStatement(id),
  }),
});

/* Open the panel on the region, the way a patient reaches it: consent, then a health concern the
   classifier could not place, which is what makes the region render and the assessment offer appear.
   Since the symptom intake of 28 September 2026 a headache is placed — it opens the notes for the
   nurse — so the concern here is one no intake group claims. */
const openRegion = async (page: Page) => {
  await stubTurnRefused(page);
  await page.goto("/app/?open=assistant");
  await consent(page);
  await ask(page, "I have a toothache");
  await expect(region(page)).toBeVisible();
};

test("a health concern offers a structured assessment, and the gated triage refuses in the contract's own words with a nurse door beside it", async ({
  page,
}) => {
  await page.route("**/assistant/v1/triage/start", (route) =>
    route.fulfill(refusalBody("triage-not-ratified", 503)),
  );
  await page.route("**/assistant/v1/handover/prepare", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: packJson(),
    }),
  );
  await openRegion(page);

  const assessment = region(page).locator(".gos-assessment");
  /* The offer, and only for a concern the classifier could not place — never an invented question. */
  await expect(assessment.getByText(copy.triageOfferHeading)).toBeVisible();
  await assessment
    .getByRole("button", { name: copy.triageAccept, exact: true })
    .click();

  /* The gate answers before any question exists: the panel shows the contract's own sentence and no
     fabricated assessment, then offers the nurse door the refusal promises. */
  await expect(assessment.getByText(copy.triageRefusedHeading)).toBeVisible();
  await expect(
    assessment.getByText(refusalStatement("triage-not-ratified")),
  ).toBeVisible();
  await assessment
    .getByRole("button", { name: copy.nurseOfferButton, exact: true })
    .click();

  /* The nurse door prepares the pack for review — nothing is sent by preparing it. */
  await expect(assessment.getByText(PACK.pack.summary)).toBeVisible();
  await expect(assessment.getByText(PACK.pack.urgency)).toBeVisible();
  await expect(assessment.getByText(PACK.handoverRef)).toBeVisible();
  /* No reading was ever taken, so the pack says a device is not connected rather than showing one. */
  await expect(assessment.getByText(copy.vitalsConnectHeading)).toBeVisible();
  await expect(assessment.getByText(copy.vitalsConnectBody)).toBeVisible();
});

test("a prepared handover shows the pack for review, and a submission that reaches no clinician says so in the contract's own words", async ({
  page,
}) => {
  await page.route("**/assistant/v1/handover/prepare", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: packJson(),
    }),
  );
  await page.route("**/assistant/v1/handover/submit", (route) =>
    route.fulfill(refusalBody("clinician-routing-not-built", 503)),
  );
  await openRegion(page);

  const block = await openBlock(page, copy.handoverHeading);
  await block
    .getByRole("button", { name: copy.handoverPrepareButton, exact: true })
    .click();

  /* The pack the person reviews before anything is sent: what was discussed, the urgency label, the
     symptoms and the sources, and the reference this pack is known by. */
  await expect(block.getByText(copy.handoverReviewLead)).toBeVisible();
  await expect(block.getByText(PACK.pack.summary)).toBeVisible();
  await expect(block.getByText(PACK.pack.urgency)).toBeVisible();
  await expect(block.getByText("poor sleep", { exact: true })).toBeVisible();
  await expect(block.getByText("headache-self-care", { exact: true })).toBeVisible();
  await expect(block.getByText(PACK.handoverRef)).toBeVisible();

  await block
    .getByRole("button", { name: copy.handoverSubmitButton, exact: true })
    .click();

  /* The submit route is built as a refusal and nothing else: the panel shows the contract's own
     clinician-routing sentence rather than acknowledging a handover into nothing. */
  await expect(block.getByText(copy.handoverSubmittedHeading)).toBeVisible();
  await expect(
    block.getByText(refusalStatement("clinician-routing-not-built")),
  ).toBeVisible();
});

test("a session with nothing to hand over is refused rather than packed empty", async ({
  page,
}) => {
  await page.route("**/assistant/v1/handover/prepare", (route) =>
    route.fulfill(refusalBody("nothing-to-hand-over", 409)),
  );
  await openRegion(page);

  const block = await openBlock(page, copy.handoverHeading);
  await block
    .getByRole("button", { name: copy.handoverPrepareButton, exact: true })
    .click();

  await expect(
    block.getByText(refusalStatement("nothing-to-hand-over")),
  ).toBeVisible();
  /* The device explanation stays with the handover block whatever the pack did. */
  await expect(block.getByText(copy.vitalsConnectBody)).toBeVisible();
});

test("the sources an answer may stand on are shown with their attribution, and a thin answer says what was withheld", async ({
  page,
}) => {
  await page.route("**/assistant/v1/knowledge/search", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sources: [
          {
            id: "kb-headache",
            title: "Managing a tension headache at home",
            source: "National Department of Health clinical guidance",
          },
          {
            id: "kb-sleep",
            title: "Sleep hygiene for adults",
            source: "National Health Knowledge Library",
          },
        ],
        withheld: 1,
      }),
    }),
  );
  await openRegion(page);

  const block = await openBlock(page, copy.knowledgeHeading);
  await block
    .getByRole("button", { name: copy.knowledgeButton, exact: true })
    .click();

  /* Each source keeps its own title and its attribution — the citation the federation provides and
     the route publishes. Nothing is ranked above another and no grade is invented. */
  await expect(
    block.getByText("Managing a tension headache at home"),
  ).toBeVisible();
  await expect(block.getByText("Sleep hygiene for adults")).toBeVisible();
  await expect(
    block.locator(".gos-source-from", {
      hasText: "National Department of Health clinical guidance",
    }),
  ).toBeVisible();
  /* And a match dropped for want of a source is counted out loud rather than hidden. */
  await expect(
    block.getByText(copy.knowledgeWithheld.replace("{count}", "1")),
  ).toBeVisible();
});

test("the truthful capability status is read from the service's own status route", async ({
  page,
}) => {
  await page.route("**/assistant/v1/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        mode: "phase-2-safe",
        azure: false,
        ollama: false,
        production: false,
        activated: false,
      }),
    }),
  );
  await openRegion(page);

  const block = await openBlock(page, copy.statusHeading);
  await block
    .getByRole("button", { name: copy.statusButton, exact: true })
    .click();

  /* Provider presence, production and the acknowledgement gate's own answer, each named and each
     told truthfully — and the standing note that the gated capabilities are built but refused. */
  await expect(block.getByText(copy.statusAzure)).toBeVisible();
  await expect(block.getByText(copy.statusOllama)).toBeVisible();
  await expect(block.getByText(copy.statusProduction)).toBeVisible();
  await expect(block.getByText(copy.statusActivated)).toBeVisible();
  await expect(block.getByText(copy.statusGated)).toBeVisible();
});

test("the acknowledgment gate carries the external-speech, knowledge-federation and triage-handover disclosures before any chat", async ({
  page,
}) => {
  /* Opened but not accepted: the gate is where every disclosure is read before a person can ask
     anything. All three are the web catalogue's own words, and each is a disclosure rather than a
     capability switched on. */
  await page.goto("/app/?open=assistant");
  const sheet = panel(page);

  for (const entry of copy.consent as { id: string; heading: string; body: string }[]) {
    await expect(
      sheet.getByRole("heading", { name: entry.heading }),
    ).toBeVisible();
    await expect(sheet.getByText(entry.body)).toBeVisible();
  }

  /* The microphone's own moment-of-use consent is unchanged and still the door's two boxes. */
  await expect(
    sheet.getByRole("checkbox", { name: gilbert.consent.checkboxDoctor }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("checkbox", { name: gilbert.consent.checkboxEmergency }),
  ).toBeVisible();
});
