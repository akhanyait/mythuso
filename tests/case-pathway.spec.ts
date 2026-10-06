import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection } from './nav';

/* The case pathway — the founder's demonstration of 28–29 September 2026, walked exactly as
 * docs/governance/CASE-PATHWAY-DEMO.md scripts it, on both viewports and in one tab, because the case
 * lives in this tab's memory and a page load would forget it.
 *
 * A patient says "I have a headache", answers the chips, enters a home-cuff pair, and asks for a nurse;
 * the nurse opens Cases, reads the findings in the consistent-with form under the draft banner, confirms
 * the home visit the pathway suggested, repeats the reading on the kit's cuff and asks the doctor; the
 * doctor opens the case from the inbox, writes the consultation with the diagnosis field that is hers
 * alone, records the outcome and signs; the patient reads the plan in the doctor's words, and GilbertOne
 * reads it back on "What did the doctor say?".
 *
 * What is held: every sentence is a contract's; the patient's card never carries a finding or the
 * suggestion; a home cuff never carries clinical weight and a kit instrument does; a different setting
 * needs a reason, in the route's own refusal; and the doctor's sign-off is refused until the outcome is
 * recorded. The browser's own voice is stood down first: a live utterance stalls clicks in headless
 * Chromium (assistant-polish.spec.ts). */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const gilbert = json('../packages/catalog/assistant.json');
const intake = json('../packages/catalog/symptom-intake.json');
const caseContract = json('../packages/catalog/case.json');
const devices = json('../packages/catalog/devices.json');
const clinical = json('../packages/catalog/clinical.json');
const records = json('../packages/catalog/records.json');
const readingQuestions = json('../packages/catalog/reading-questions.json');
const protocols = json('../packages/catalog/protocols.json');
const api = json('../packages/catalog/apis/clinical.json');
const refusal = (id: string): string => {
  const found = api.routes.filter((r: { withdrawn?: unknown }) => !r.withdrawn).flatMap((r: { refusals: { id: string; statement: string }[] }) => r.refusals).find((r: { id: string }) => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/clinical.json declares no live refusal ${id}`);
  return found.statement;
};
const patientWords = caseContract.screens.patient;
const nurseWords = caseContract.screens.nurse;
const doctorWords = caseContract.screens.doctor;
const kitWords = devices.screens.nurse;
const sourceLabel = (id: string): string => devices.sources.find((s: { id: string }) => s.id === id).label;
const pathway = protocols.protocols.find((p: { id: string }) => `${p.id}@${p.version}` === caseContract.pathway.protocolVersionId);
const banner: string = caseContract.banner.draft.replace('{protocol}', `${pathway.name} (${caseContract.pathway.protocolVersionId})`);
const settingLabel = (code: string): string => caseContract.settings.kinds.find((k: { code: string }) => k.code === code).label;

/* The demo's answers, in the intake's order: the common five, then the headache group's ten. */
const answers: Record<string, string> = {
  since: 'A few days', 'how-bad': 'Mild', 'better-worse': 'Worse in the afternoon', used: 'Nothing', conditions: 'None that I know of',
  where: 'One side', 'light-noise': 'Light bothers me', sick: 'Neither', sight: 'No', dizzy: 'Yes', nosebleeds: 'Yes, in the last week',
  'fever-chills': 'None of these', 'malaria-area': 'No', knock: 'No', 'blood-pressure': 'I am on pills for blood pressure'
};
const HOME_CUFF = '168 over 104';
type Question = { id: string; ask: string; kind: 'chips' | 'text' };
const questions: Question[] = [...intake.common.questions, ...intake.groups.find((g: { id: string }) => g.id === 'headache').questions];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const synth = (window as unknown as { speechSynthesis?: { speak: () => void; cancel: () => void } }).speechSynthesis;
    if (synth) { synth.speak = () => {}; synth.cancel = () => {}; }
  });
});

const panel = (page: Page) => page.getByRole('dialog', { name: gilbert.identity.name });
const lastReply = (page: Page) => panel(page).locator('.as-turn').last().locator('.as-reply');
const ask = async (page: Page, words: string) => {
  await panel(page).getByLabel(gilbert.conversation.inputLabel).fill(words);
  await panel(page).getByRole('button', { name: gilbert.conversation.sendLabel, exact: true }).click();
};
const press = async (page: Page, name: string) => {
  const button = lastReply(page).getByRole('button', { name, exact: true });
  const box = await button.boundingBox();
  expect(box, name).not.toBeNull();
  expect(Math.round(box!.height), `${name} is a 44px target`).toBeGreaterThanOrEqual(44);
  await button.click();
};
/* Reopened after a role switch, the panel may put the consent gate up again — its consent lives in the
   panel's own state, which the patient shell re-mounts — so it is accepted again when it is there. */
const openAssistant = async (page: Page) => {
  await page.getByRole('button', { name: gilbert.identity.name }).first().click();
  await expect(panel(page)).toBeVisible();
  const gate = panel(page).getByRole('checkbox', { name: gilbert.consent.checkboxDoctor });
  if (await gate.count()) await consent(page);
};
const consent = async (page: Page) => {
  const sheet = panel(page);
  await sheet.getByRole('checkbox', { name: gilbert.consent.checkboxDoctor }).check();
  await sheet.getByRole('checkbox', { name: gilbert.consent.checkboxEmergency }).check();
  await sheet.getByRole('button', { name: gilbert.consent.accept }).click();
};
/* Set CASE_SHOTS to a directory to leave the screenshots a reviewer looks at: the element named, so the
   assistant's scrolling log and a long case file are captured whole rather than as the viewport. */
const shoot = async (page: Page, name: string, of?: import('@playwright/test').Locator) => {
  const dir = process.env.CASE_SHOTS;
  if (!dir) return;
  const path = `${dir}/${name}-${page.viewportSize()?.width}.png`;
  if (of) await of.screenshot({ path }); else await page.screenshot({ path, fullPage: true });
};

test('a headache becomes a case the nurse decides and the doctor closes, and the patient reads the plan in the doctor\'s words', async ({ page }) => {
  /* Fifteen questions, three roles and a consultation in one tab: a long journey by design. */
  test.setTimeout(300_000);
  /* ---- The patient ---- */
  await page.goto('/app/?open=assistant');
  await consent(page);
  await ask(page, 'I have a headache');
  await press(page, intake.answer.consent.yesLabel);
  for (const question of questions) {
    await expect(lastReply(page).locator('.as-headline')).toHaveText(question.ask);
    if (question.kind === 'chips') await press(page, answers[question.id]!);
    else await ask(page, answers[question.id]!);
  }
  const notes = lastReply(page);
  await expect(notes).toContainText(intake.summary.title);
  /* The lead-in to the chips is the group's accessible name rather than a line of text: the quiet
     panel's redesign moved it out of the bubble so the card does not say twice what its buttons
     already offer. It is still case.json's own sentence, word for word, so it is asserted where it
     now lives — and a screen reader still hears it before the three choices. */
  await expect(notes.getByRole('group', { name: patientWords.askNurseLead })).toBeVisible();
  /* The reading: a pair a home cuff shows, then where it came from. A home cuff carries no weight, and
     the card says so in devices.json's own sentence. */
  await press(page, patientWords.readingOffer);
  await expect(lastReply(page).locator('.as-headline')).toHaveText(patientWords.readingAsk);
  await ask(page, 'my cuff');
  await expect(lastReply(page)).toContainText(patientWords.readingUnread);
  await ask(page, HOME_CUFF);
  await expect(lastReply(page).locator('.as-headline')).toHaveText(patientWords.readingSourceAsk);
  await press(page, sourceLabel('own-device'));
  const withReading = lastReply(page);
  await expect(withReading).toContainText(HOME_CUFF);
  const consumerMark: string = devices.marks.find((m: { id: string }) => m.id === 'consumer-device').sentence;
  await expect(withReading).toContainText(consumerMark);
  await shoot(page, 'patient-notes-and-reading', withReading);
  await press(page, patientWords.askNurse);
  const card = lastReply(page);
  await expect(card).toContainText(patientWords.heading);
  await expect(card).toContainText(patientWords.opened);
  await expect(card).toContainText(patientWords.who.opened);
  /* Nothing is booked from a case, and the card says so every time it is drawn. */
  await expect(card).toContainText(patientWords.preview);
  await expect(card).toContainText(patientWords.neverShown);
  /* Never a finding, never the suggestion, never the pathway: the words that would carry them are absent. */
  const cardText = await card.innerText();
  expect(cardText).not.toContain(caseContract.findings.sentence.split('{')[0].trim());
  expect(cardText).not.toContain(nurseWords.suggestionHeading);
  expect(cardText).not.toContain(pathway.name);
  for (const rule of caseContract.findings.rules) expect(cardText).not.toContain(rule.pattern);
  await shoot(page, 'patient-case-card', card);
  await panel(page).getByRole('button', { name: 'Close GilbertOne' }).click();

  /* ---- The nurse ---- */
  await chooseRole(page, 'Nurse');
  await goSection(page, 'Cases');
  const cases = page.getByRole('region', { name: nurseWords.heading, exact: true });
  await expect(cases).toContainText(nurseWords.preview);
  const row = cases.getByRole('listitem').first();
  await expect(row).toContainText(banner);
  await expect(row).toContainText(clinical.wording.patientDiagnosis.rule);
  const bp = caseContract.findings.rules.find((r: { id: string }) => r.id === 'raised-blood-pressure');
  await expect(row).toContainText(`consistent with ${bp.pattern}`);
  await expect(row).toContainText('(cond-008)');
  await expect(row).toContainText(kitWords.carriesNot);
  await expect(row).toContainText(settingLabel('home-visit'));
  await expect(row).toContainText(nurseWords.suggestionHeading);
  /* The repeat is hers once she has taken the case, and not before. */
  await expect(row.getByRole('button', { name: nurseWords.repeatReading, exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: nurseWords.take, exact: true }).click();
  await expect(row).toContainText(patientWords.who.opened === '' ? '' : caseContract.states.find((s: { code: string }) => s.code === 'with-nurse').label);
  /* A different setting without a reason is refused in the route's own sentence; the suggestion is then confirmed. */
  await row.getByRole('button', { name: nurseWords.override, exact: true }).click();
  await row.getByLabel(nurseWords.overrideChoose).selectOption('online');
  await row.getByRole('button', { name: nurseWords.confirm.replace('{setting}', settingLabel('online')), exact: true }).click();
  await expect(row.getByRole('alert')).toHaveText(refusal('override-without-reason'));
  await row.getByRole('button', { name: nurseWords.keepSuggestion, exact: true }).click();
  await row.getByRole('button', { name: nurseWords.confirm.replace('{setting}', settingLabel('home-visit')), exact: true }).click();
  await expect(row).toContainText(nurseWords.decided.split('{setting}')[1]!.split('{at}')[0]!.trim());
  /* The reading repeated on the kit's cuff carries weight; the pair is typed off the instrument. */
  await row.getByRole('button', { name: nurseWords.repeatReading, exact: true }).click();
  await row.getByLabel(nurseWords.repeatSource).selectOption('kit-instrument');
  await row.getByLabel(nurseWords.repeatTop).fill('166');
  await row.getByLabel(nurseWords.repeatBottom).fill('102');
  await row.getByRole('button', { name: nurseWords.repeatRecord, exact: true }).click();
  await expect(row).toContainText(kitWords.carries);
  await shoot(page, 'nurse-case-file', row);
  await row.getByRole('button', { name: nurseWords.askDoctor, exact: true }).click();
  await expect(row).toContainText(nurseWords.askedDoctor.split('{at}')[0]!.trim());

  /* ---- The doctor ---- */
  await chooseRole(page, 'Doctor');
  const inbox = page.getByRole('region', { name: clinical.reviews.screen.heading, exact: true });
  const inboxRow = inbox.getByRole('listitem', { name: /^CASE-/ }).first();
  await expect(inboxRow).toContainText(clinical.reviews.screen.draft);
  await inboxRow.getByRole('button', { name: doctorWords.openCase, exact: true }).click();
  const file = page.locator('.cs-doctor');
  await expect(file).toContainText(banner);
  await expect(file).toContainText(`consistent with ${bp.pattern}`);
  await expect(file).toContainText(doctorWords.trendNeeds.split('{needs}')[0]!.trim());
  await expect(file).toContainText(doctorWords.nurseDecision.split('{nurse}')[1]!.split('{setting}')[0]!.trim());
  /* The diagnosis field is the doctor's, and the form says so; the assessment is written under her name. */
  await expect(file.getByLabel('Diagnosis')).toBeVisible();
  const outcome = clinical.guidance.outcomes.find((o: { code: string }) => o.code === 'urgent');
  await file.getByLabel('Clinical examination').fill('Synthetic examination words for the demonstration.');
  await file.getByLabel('Assessment — clinical impression').fill('Synthetic assessment words: findings consistent with raised blood pressure, to confirm at the visit.');
  await file.getByLabel('Diagnosis').fill('Synthetic diagnosis words, the doctor\'s alone.');
  const plan = 'Synthetic plan words, in the doctor\'s own voice, for the patient to read.';
  await file.getByLabel('Treatment plan').fill(plan);
  /* Signing before the outcome is recorded is refused in the contract's sentence; nothing closes. */
  await file.getByRole('button', { name: 'Sign consultation' }).click();
  await expect(file.getByRole('alert')).toHaveText(doctorWords.outcomeFirst);
  await file.getByRole('button', { name: new RegExp(`^${outcome.label} `) }).click();
  await file.getByRole('button', { name: 'Sign consultation' }).click();
  await expect(file).toContainText(doctorWords.closed.split('{at}')[0]!.trim());
  await expect(file).toContainText(doctorWords.outcomeRecorded.replace('{outcome}', outcome.label));
  await shoot(page, 'doctor-case', file);
  /* Back in the inbox the record is complete, and a draft pathway is signed only outside any protocol. */
  await file.getByRole('button', { name: doctorWords.back, exact: true }).click();
  await expect(inboxRow).toContainText(clinical.reviews.screen.recordComplete);

  /* ---- The patient again ---- */
  await chooseRole(page, 'Patient');
  await openAssistant(page);
  const planQuestion = gilbert.questions.find((q: { id: string }) => q.id === 'case-plan');
  await ask(page, planQuestion.asks);
  const read = lastReply(page);
  await expect(read.locator('.as-headline')).toHaveText(patientWords.planHeading);
  await expect(read).toContainText(patientWords.planLead);
  await expect(read).toContainText(plan);
  await expect(read).toContainText(patientWords.planClose);
  const readText = await read.innerText();
  expect(readText).not.toContain('Synthetic diagnosis');
  expect(readText).not.toContain('Synthetic assessment');
  await shoot(page, 'patient-plan', read);
  /* The SOAP headings the doctor wrote under are the record contract's own. */
  expect((records.consultation.soap as { id: string }[]).map(s => s.id)).toEqual(['S', 'O', 'A', 'P']);
});

test('with no case open, "what did the doctor say" says so in the contract\'s sentence, and a stomach intake offers no case', async ({ page }) => {
  await page.goto('/app/?open=assistant');
  await consent(page);
  await ask(page, 'what did the doctor say');
  await expect(lastReply(page)).toContainText(patientWords.planNoCase);
  await ask(page, 'my tummy is sore');
  await press(page, intake.answer.consent.yesLabel);
  const stomach = [...intake.common.questions, ...intake.groups.find((g: { id: string }) => g.id === 'stomach').questions] as Question[];
  for (const question of stomach) {
    if (question.kind === 'chips') await press(page, (question as { options: string[] }).options[0]!);
    else await ask(page, 'a few words');
  }
  const notes = lastReply(page);
  await expect(notes).toContainText(intake.summary.title);
  await expect(notes.getByRole('button', { name: patientWords.askNurse, exact: true })).toHaveCount(0);
  await expect(notes.getByRole('button', { name: patientWords.readingOffer, exact: true })).toHaveCount(0);
});

test('a very-high reading with a warning feature is the emergency answer for the patient, and still a case a nurse takes, decides and hands on', async ({ page }) => {
  /* Fifteen questions, then two roles: long by design, as the journey above. */
  test.setTimeout(300_000);
  const sos = json('../packages/catalog/sos.json');
  /* The demo's answers with a severe headache — a red-flag feature in case.json — and a pair at or above the
     very-high line the knowledge base gives, so the pathway's suggestion is the emergency setting. */
  const severe: Record<string, string> = { ...answers, 'how-bad': 'Bad enough to stay in bed' };
  await page.goto('/app/?open=assistant');
  await consent(page);
  await ask(page, 'I have a headache');
  await press(page, intake.answer.consent.yesLabel);
  for (const question of questions) {
    await expect(lastReply(page).locator('.as-headline')).toHaveText(question.ask);
    if (question.kind === 'chips') await press(page, severe[question.id]!);
    else await ask(page, severe[question.id]!);
  }
  await press(page, patientWords.readingOffer);
  /* 2 October 2026: a pair past the far-outside bounds typed at the cuff step is answered there and
     then, with the reading question's own urgent block — the emergency answer's numbers and its Thuso
     SOS door — before its source is asked. Until then 240/140 went onto the card without a word. */
  await ask(page, '240/140');
  const typed = lastReply(page);
  const urgent = typed.locator("[data-urgent='far-outside']");
  await expect(urgent).toHaveCount(1);
  await expect(urgent).toContainText(readingQuestions.answer.farIfUnwell);
  for (const id of gilbert.answers.emergency.numbers)
    await expect(urgent).toContainText(sos.emergency.numbers.find((n: { id: string }) => n.id === id).number);
  await expect(urgent).toContainText('10177');
  await expect(urgent.getByRole('button', { name: gilbert.answers.emergency.sosLabel })).toBeVisible();
  await expect(typed).toContainText(readingQuestions.answer.farOtherwise);
  for (const id of ['systolic', 'diastolic'])
    await expect(typed).not.toContainText(records.explanations.entries.find((e: { id: string }) => e.id === id).above);
  await expect(panel(page).locator('.as-rig')).toHaveAttribute('data-pulse', readingQuestions.farOutside.state);
  /* The intake goes on underneath it, and the reading is recorded as any other. */
  await expect(typed.locator('.as-headline')).toHaveText(patientWords.readingSourceAsk);
  await press(page, sourceLabel('own-device'));
  const notes = lastReply(page);
  await expect(notes).toContainText('240/140');
  /* Answered once, on the step that read it: the notes do not carry a second urgent block. */
  await expect(notes.locator("[data-urgent='far-outside']")).toHaveCount(0);
  await press(page, patientWords.askNurse);
  /* The patient is given the emergency answer, never the suggestion or a case card — the pathway agrees
     with what the cuff step told her. */
  const answer = lastReply(page);
  await expect(answer).toContainText(sos.emergency.headline);
  await expect(answer).not.toContainText(patientWords.heading);
  await panel(page).getByRole('button', { name: 'Close GilbertOne' }).click();

  /* The case is on the nurses' list, opened rather than shut in the emergency state, so she can take it. */
  await chooseRole(page, 'Nurse');
  await goSection(page, 'Cases');
  const cases = page.getByRole('region', { name: nurseWords.heading, exact: true });
  const row = cases.getByRole('listitem').first();
  await expect(row).toContainText(caseContract.states.find((s: { code: string }) => s.code === 'opened').label);
  await expect(row).toContainText(settingLabel('emergency'));
  await row.getByRole('button', { name: nurseWords.take, exact: true }).click();
  await row.getByRole('button', { name: nurseWords.confirm.replace('{setting}', settingLabel('emergency')), exact: true }).click();
  await expect(row).toContainText(nurseWords.decided.replace('{setting}', settingLabel('emergency')).split('{at}')[0]!.trim());
  /* Hers to re-read and to hand on, as the transitions say. */
  await expect(row.getByRole('button', { name: nurseWords.repeatReading, exact: true })).toBeVisible();
  await row.getByRole('button', { name: nurseWords.askDoctor, exact: true }).click();
  await expect(row).toContainText(nurseWords.askedDoctor.split('{at}')[0]!.trim());
  /* Handed over, the repeat is the doctor's file's no longer. */
  await expect(row.getByRole('button', { name: nurseWords.repeatReading, exact: true })).toHaveCount(0);
});
