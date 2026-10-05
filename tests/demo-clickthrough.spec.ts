import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { goSection, confirmBooking, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* Funder-demo click-through (Wednesday 7 Oct 2026). Open GilbertOne by clicking the launcher —
   `?open=assistant` is known-broken until the panel fix lands. Screenshots land under
   /workspace/mythuso-demo-qa/<short-sha>/ so every build leaves a visible trail. */

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../packages/catalog/${path}`, import.meta.url), 'utf8'));

const gilbert = read('assistant.json');
const sos = read('sos.json');
const capabilities = read('capabilities.json');
const devices = read('devices.json');
/* Prefer the short commit when HEAD is a ref. */
function demoSha(): string {
  try {
    const head = readFileSync(new URL('../.git/HEAD', import.meta.url), 'utf8').trim();
    if (head.startsWith('ref:')) {
      const ref = head.slice(5).trim();
      return readFileSync(new URL(`../.git/${ref}`, import.meta.url), 'utf8').trim().slice(0, 8);
    }
    return head.slice(0, 8);
  } catch {
    return 'e90d3ae7';
  }
}
const SHA = demoSha();
const SHOT_DIR = `/workspace/mythuso-demo-qa/${SHA}`;
mkdirSync(SHOT_DIR, { recursive: true });

const ambulance = (sos.emergency.numbers as { id: string; number: string }[]).find(n => n.id === 'ambulance')!;
const mobile = (sos.emergency.numbers as { id: string; number: string }[]).find(n => n.id === 'mobile')!;
const clinicalReferral = (gilbert.refusalPolicies.policies as { id: string; statement: string }[])
  .find(p => p.id === 'clinical-referral')!;
const modelLabel: string = gilbert.answers.service.heading;
const simulatedMark = (devices.marks as { id: string; label: string }[]).find(m => m.id === 'simulated')!;
const handoverLabel: string = gilbert.answers.unmatched.handoverLabel;

const shot = async (page: Page, name: string) => {
  await page.screenshot({
    path: join(SHOT_DIR, `${test.info().project.name}-${name}.png`),
    fullPage: true,
  });
};

const consoleBag: { errors: string[]; failed: string[] } = { errors: [], failed: [] };

test.beforeEach(async ({ page }) => {
  consoleBag.errors = [];
  consoleBag.failed = [];
  page.on('pageerror', err => consoleBag.errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    /* Vite proxies /health and /assistant/* to a dark loopback API in this checkout. */
    if (/127\.0\.0\.1:(8787|8791)|\/assistant\/|\/health\b|Failed to load resource:.*500/.test(text)) return;
    consoleBag.errors.push(text);
  });
  page.on('response', res => {
    const url = res.url();
    if (res.status() >= 500 && !/:(8787|8791)\b|\/assistant\/|\/health\b/.test(url)) {
      consoleBag.failed.push(`${res.status()} ${url}`);
    }
  });
});

/** Open GilbertOne by launcher click (not ?open=assistant), clear BeforeWeStart, return the panel. */
const openGilbertOne = async (page: Page) => {
  await page.getByRole('button', { name: gilbert.identity.callToAction, exact: true }).click();
  const gate = page.getByRole('dialog', { name: 'Before we start' });
  const panel = page.getByRole('dialog', { name: gilbert.identity.name });
  await expect(gate.or(panel)).toBeVisible();
  if (await gate.isVisible()) {
    await gate.getByRole('checkbox', { name: 'I understand' }).check();
    await gate.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
};

const askTyped = async (panel: Locator, words: string) => {
  await panel.getByLabel(gilbert.conversation.inputLabel).fill(words);
  await panel.getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
  const turn = panel.locator('.as-turn').last();
  await expect(turn).toBeVisible();
  /* Outcome lives on the reply node inside the turn (Assistant.tsx), not on the <li>. */
  const reply = turn.locator('[data-outcome]').first();
  await expect(reply).toBeVisible();
  return { turn, reply };
};

/* -------------------------------------------------------------------------- */
/* (a) Home                                                                   */
/* -------------------------------------------------------------------------- */
test('demo · Home loads clean with key panels and no fake live claims', async ({ page }) => {
  await page.goto('/app/');
  await expect(page).toHaveTitle(/Overview/);
  await expect(page.locator('.pd-hero')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Quick actions' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your care team' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'If something is wrong now' })).toBeVisible();
  /* Anything that looks like a live reading or triage must say it is simulated. */
  const liveish = page.getByText(/bpm|mmHg|SpO2|triage|priority/i);
  if (await liveish.count()) {
    await expect(page.getByText(new RegExp(`${simulatedMark.label}|Demo data|example`, 'i')).first()).toBeVisible();
  }
  /* Home must not claim a live booking or payment. */
  await expect(page.getByText(/payment (was )?taken|card (has been )?charged|nurse is on the way right now/i)).toHaveCount(0);
  await shot(page, '01-home');
  expect(consoleBag.errors, `console errors on Home: ${consoleBag.errors.join(' | ')}`).toEqual([]);
  expect(consoleBag.failed, `failed requests on Home: ${consoleBag.failed.join(' | ')}`).toEqual([]);
});

/* -------------------------------------------------------------------------- */
/* (b) Book care                                                              */
/* -------------------------------------------------------------------------- */
test('demo · Book care walks the six steps and never claims a live booking or payment', async ({ page }) => {
  await page.goto('/app/');
  await page.locator('.shortcut-row').filter({ hasText: 'Vitals & chronic check' }).click();
  const bookingDlg = page.getByRole('dialog');
  await expect(bookingDlg.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await shot(page, '02-book-who');
  for (let step = 0; step < 5; step++) {
    await bookingDlg.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await shot(page, '03-book-review');
  await bookingDlg.getByRole('checkbox').check();
  await confirmBooking(bookingDlg);
  await expect(bookingDlg).toContainText(noticeFor('payments'));
  await expect(bookingDlg).toContainText(/simulated|preview|no (real )?visit|nobody is dispatched/i);
  /* Must not claim a live charge or dispatch. */
  await expect(bookingDlg.getByText(/card has been charged|money has left|nurse has been dispatched to your door/i)).toHaveCount(0);
  await shot(page, '04-book-confirmed');
});

test('demo · Book care catalogue page says the preview does not book a real visit', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Book a nurse');
  await expect(page).toHaveTitle(/Book a nurse/);
  await expect(page.locator('main')).toContainText(/Preview|No real visit is booked/i);
  await shot(page, '05-book-catalogue');
});

/* -------------------------------------------------------------------------- */
/* (c) GilbertOne — typed only, never voice                                   */
/* -------------------------------------------------------------------------- */
test('demo · GilbertOne typed conversation: greeting, emergency, nurse, dosing refusal', async ({ page }) => {
  await page.goto('/app/');
  const panel = await openGilbertOne(page);
  await shot(page, '06-gilbertone-open');

  /* No voice control is used on this path — the demo is typed. */
  await expect(panel.getByRole('button', { name: /microphone|listen|Talk to GilbertOne/i })).toHaveCount(0);

  /* Greeting / identity. */
  const identity = await askTyped(panel, 'What are you?');
  await expect(identity.reply).toHaveAttribute('data-outcome', 'answer');
  /* TODO(GilbertOne): replace with the exact expected greeting/identity wording once the developer sends it. */
  await expect(identity.turn).toContainText(/GilbertOne|approved answers|not a doctor/i);
  await expect(panel.getByText(modelLabel, { exact: true })).toHaveCount(0);

  /* Heartburn is left out of the demo on purpose: no reviewed answer exists yet, so it falls back to "can't assess". */

  /* Emergency phrase — numbers as text and tel: links.
     TODO(Ful Stack): numbers inside the answer are becoming tap-to-call; assert tel: links in the turn once that build lands. */
  const emergency = await askTyped(panel, "I've got chest pain and I'm sweating a lot");
  await expect(emergency.reply).toHaveAttribute('data-outcome', 'emergency');
  await expect(emergency.turn).toContainText(ambulance.number);
  await expect(emergency.turn).toContainText(mobile.number);
  /* Numbers in the emergency answer list are printed (Lines); tap-to-call lives on the panel footer (EmergencyLinks). */
  await expect(panel.locator(`a[href="tel:${ambulance.number}"]`).first()).toBeVisible();
  await expect(panel.locator(`a[href="tel:${mobile.number}"]`).first()).toBeVisible();
  await expect(panel.getByText(modelLabel, { exact: true })).toHaveCount(0);
  await shot(page, '08-gilbertone-emergency');

  /* Talk to a nurse — handover door. */
  const nurse = await askTyped(panel, 'Can I talk to a nurse?');
  /* TODO(GilbertOne): exact expected nurse-handover wording once the developer sends it. */
  await expect(nurse.turn).toContainText(new RegExp(handoverLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|nurse queue|structured summary', 'i'));
  await expect(panel.getByText(modelLabel, { exact: true })).toHaveCount(0);
  await shot(page, '09-gilbertone-nurse');

  /* Dosing refusal — must never reach the model label. */
  const dosing = await askTyped(panel, 'How many paracetamol can I take?');
  await expect(dosing.reply).toHaveAttribute('data-outcome', 'refusal');
  await expect(dosing.turn).toContainText(clinicalReferral.statement);
  await expect(panel.getByText(modelLabel, { exact: true })).toHaveCount(0);
  await shot(page, '10-gilbertone-dosing-refusal');
});

/* -------------------------------------------------------------------------- */
/* (d) Video consult simulation — new screens land tomorrow; fixme until then */
/* -------------------------------------------------------------------------- */
test.describe('demo · Video consult simulation (Wed design package)', () => {
  /* Screens from /workspace/mythuso-wed-demo-mocks/ + MOTION.md. Not on main yet. */

  test.fixme('patient consent (Booklet 10) locks Join until I understand — see 01-patient-consent.jpg', async ({ page }) => {
    /* Expected once built: /app/ route for patient video consult consent.
       - Badge: "Demo simulation"
       - Heading: "Before you join" / "Booklet 10 consent checklist"
       - Checkbox "I understand" unlocks "Join call" (padlock clears, 200ms)
       - Join stays disabled until checked. */
    await page.goto('/app/?demo=video-consent');
    const sheet = page.getByRole('region', { name: /Before you join|Video consult/i });
    await expect(sheet.getByText(/Demo simulation/i)).toBeVisible();
    const join = sheet.getByRole('button', { name: /Join call/i });
    await expect(join).toBeDisabled();
    await sheet.getByRole('checkbox', { name: /I understand/i }).check();
    await expect(join).toBeEnabled();
    await shot(page, '11-video-consent');
  });

  test.fixme('patient simulated call — Mute / Camera / Leave only, Demo data vitals — see 02-patient-call.jpg', async ({ page }) => {
    /* Expected: "Demo simulation • not a live call", controls Mute / Camera / Leave,
       vitals panel labelled Demo data, clinician marked simulated. */
    await page.goto('/app/?demo=video-call');
    await expect(page.getByText(/Demo simulation.*not a live call/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mute$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Camera$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Leave$/i })).toBeVisible();
    await expect(page.getByText(/Demo data/i).first()).toBeVisible();
    await shot(page, '12-video-call');
  });

  test.fixme('clinician nurse-led console with Demo data triage and vitals — see 03-clinician-console.jpg', async ({ page }) => {
    /* Expected: "Demo data" badge, "nurse-led" triage board (Priority Low/Medium/High),
       "Vitals (live) • Simulated stream", notes nurse-led. Triage is nurse-led, never doctor-first. */
    await page.goto('/app/?role=doctor&demo=clinician-console');
    await expect(page.getByText(/Demo data/i).first()).toBeVisible();
    await expect(page.getByText(/nurse-led/i).first()).toBeVisible();
    await expect(page.getByText(/Simulated stream|Simulated consult/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Priority (Low|Medium|High)/i }).first()).toBeVisible();
    await shot(page, '13-clinician-console');
  });
});

test('demo · today\'s teleconsult still page and simulated staff room exist', async ({ page }) => {
  /* What is on main today: doctor Teleconsultation — simulated call, waiting room, CallSummary
     with LiveVitals marked Simulated. GilbertStill is the quiet face inside GilbertOne. */
  await page.goto('/app/');
  await openWorkspace(page, 'Doctor');
  await goSection(page, 'Teleconsultation');
  const main = page.locator('main');
  await expect(main).toContainText(noticeFor('teleconsultation'));
  await shot(page, '14-teleconsult-roster');

  /* Walk into the simulated waiting room / call. */
  await main.locator('label.checkbox').filter({ hasText: /see you and treat you/ }).locator('input').check();
  await main.locator('label.checkbox').filter({ hasText: /May she stay/ }).locator('input').check();
  await main.getByRole('button', { name: /Check identity/ }).click();
  await main.getByLabel('Visit code, digit 1 of 6').fill('482190');
  await main.getByRole('button', { name: /Confirm and continue/ }).click();
  await main.getByRole('button', { name: /Open the call/ }).click();
  await main.getByRole('button', { name: /Skip the wait/ }).click();
  await expect(main).toContainText(new RegExp(`${simulatedMark.label}|ThusoIQ sandbox|simulated`, 'i'));
  await shot(page, '15-teleconsult-simulated-room');

  /* GilbertStill — open GilbertOne and confirm the quiet face is present (not a live video). */
  await page.goto('/app/');
  const panel = await openGilbertOne(page);
  await expect(panel.locator('.go-rig, .as-rig, svg').first()).toBeVisible();
  await shot(page, '16-gilbertone-still');
});

/* -------------------------------------------------------------------------- */
/* (e) Offline resilience                                                     */
/* -------------------------------------------------------------------------- */
test('demo · offline: typed GilbertOne still answers and emergency numbers still show', async ({ page, context }) => {
  await page.goto('/app/');
  const panel = await openGilbertOne(page);
  await context.setOffline(true);
  const emergency = await askTyped(panel, "I've got chest pain and I'm sweating a lot");
  await expect(emergency.reply).toHaveAttribute('data-outcome', 'emergency');
  await expect(emergency.turn).toContainText(ambulance.number);
  await expect(panel.locator(`a[href="tel:${ambulance.number}"]`).first()).toBeVisible();
  const dosing = await askTyped(panel, 'How many paracetamol can I take?');
  await expect(dosing.reply).toHaveAttribute('data-outcome', 'refusal');
  await expect(panel.getByText(modelLabel, { exact: true })).toHaveCount(0);
  await shot(page, '17-offline-emergency');
  await context.setOffline(false);
});

/* -------------------------------------------------------------------------- */
/* (3) Don't-claim pass — catalog /status is the truth                        */
/* -------------------------------------------------------------------------- */
test('demo · don\'t-claim: /status and demo path never present listed capabilities as live', async ({ page }) => {
  const claimedLive = [
    { id: 'booking', phrase: /live booking|real nurse has (been )?dispatched|visit is confirmed with a nurse who agreed/i },
    { id: 'payments', phrase: /card has been charged|money (has )?moved|real payment taken/i },
    { id: 'dispatch', phrase: /live dispatch|SOS has reached a responder|ambulance has been sent by MyThuso/i },
    { id: 'teleconsultation', phrase: /live (video )?call|Jitsi|camera and microphone are open/i },
    { id: 'doctor-review', phrase: /doctor has reviewed this|signed clinical opinion from a MyThuso doctor/i },
    { id: 'laboratory-results', phrase: /lab (result|report) (is|has been) verified|sample was analysed/i },
    { id: 'credential-verification', phrase: /credential (has been )?confirmed with SANC|HPCSA has verified/i },
    { id: 'devices', phrase: /device is paired|Bluetooth session is open|live instrument reading/i },
    { id: 'scheme-claims', phrase: /claim (was|has been) submitted to (the )?scheme/i },
  ];

  await page.goto('/status/');
  await expect(page.locator('body')).toContainText(/connected|simulated|absent/i);
  await shot(page, '18-status');

  for (const { id } of claimedLive) {
    const cap = (capabilities.capabilities as { id: string; connected: boolean }[]).find(c => c.id === id);
    expect(cap, `capability ${id} missing from catalog`).toBeTruthy();
    expect(cap!.connected, `${id} must not be connected for the funder demo`).toBe(false);
  }

  /* Governed Azure / language-model tier must not be presented as the default on the patient path. */
  await page.goto('/app/');
  const panel = await openGilbertOne(page);
  await askTyped(panel, 'What are you?');
  await askTyped(panel, 'How many paracetamol can I take?');
  await expect(panel.getByText(modelLabel, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/governed Azure|production language model is answering/i)).toHaveCount(0);

  /* Walk home + book surfaces for banned live phrases. */
  await page.goto('/app/');
  const homeText = await page.locator('body').innerText();
  for (const { id, phrase } of claimedLive) {
    expect(homeText, `Home must not claim live ${id}`).not.toMatch(phrase);
  }
});
