import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* Clinical Intelligence, on both viewports.
 *
 * A doctor signs a nurse's visit from the inbox by her own press: the visit named a draft protocol, so signing it
 * as following that protocol is refused in the route's sentence and signing it as reviewed outside any protocol is
 * accepted, with the sentence saying so; a visit whose record is not complete is refused its signature. A doctor
 * writing a consultation in the frame is refused the sign-off until every required heading has something under it.
 * A nurse starting triage is told it was not triaged, why, and who decides, and every Home Guidance outcome is
 * refused for want of a ratified script.
 *
 * Every sentence, label and heading is read from the contracts, and every refusal is the route's own, so a reworded
 * refusal moves these tests with it rather than breaking them. The preview holds all of it in the tab's memory. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const clinical = json('../packages/catalog/clinical.json');
const records = json('../packages/catalog/records.json');
const protocols = json('../packages/catalog/protocols.json') as { protocols: { id: string; version: number; name: string }[] };
const api = json('../packages/catalog/apis/clinical.json') as { refusals: { id: string; statement: string }[]; routes: { withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const sentence = (id: string): string => {
  const found = [...api.refusals, ...api.routes.filter(r => !r.withdrawn).flatMap(r => r.refusals)].find(r => r.id === id);
  if (!found) throw new Error(`packages/catalog/apis/clinical.json declares no live refusal ${id}`);
  return found.statement;
};
type Mode = { code: string; label: string; sentence: string };
const mode = (code: string): Mode => clinical.reviews.signingModes.find((m: Mode) => m.code === code);
type Seed = { appointmentRef: string; protocolVersionId: string | null; signedOff: boolean };
const inboxWords = clinical.reviews.screen;

test('a doctor signs a visit named under a draft protocol only as reviewed outside any protocol, and a record that is not complete is not signed', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  const inbox = page.getByRole('region', { name: inboxWords.heading, exact: true });
  await expect(inbox).toContainText(inboxWords.preview);
  const under = mode('under-ratified-protocol');
  const outside = mode('outside-any-protocol');

  const draftVisit = (clinical.preview.reviews as Seed[]).find(r => r.protocolVersionId && r.signedOff)!;
  const row = inbox.getByRole('listitem', { name: draftVisit.appointmentRef, exact: true });
  await row.getByRole('button', { name: `${inboxWords.sign}: ${under.label}` }).click();
  await expect(row.getByRole('alert')).toHaveText(sentence('protocol-not-ratified'));
  await row.getByRole('button', { name: `${inboxWords.sign}: ${outside.label}` }).click();
  const named = protocols.protocols.find(p => `${p.id}@${p.version}` === draftVisit.protocolVersionId)!;
  await expect(row.getByRole('status')).toContainText(outside.sentence.replace('{protocol}', `${named.name} (${draftVisit.protocolVersionId})`));
  await expect(row.getByRole('button')).toHaveCount(0);

  const incomplete = (clinical.preview.reviews as Seed[]).find(r => !r.signedOff)!;
  const unfinished = inbox.getByRole('listitem', { name: incomplete.appointmentRef, exact: true });
  await expect(unfinished).toContainText(inboxWords.recordIncomplete);
  await unfinished.getByRole('button', { name: `${inboxWords.sign}: ${outside.label}` }).click();
  await expect(unfinished.getByRole('alert')).toHaveText(sentence('record-incomplete'));
});

test('a consultation is not signed off until every required heading is written', async ({ page }) => {
  await openWorkspace(page, 'Doctor');
  await goSection(page, 'Consultation records');
  const words = clinical.consultation.screen;
  const frame = page.getByRole('region', { name: words.heading, exact: true });
  const headings = records.consultation.soap as { id: string; name: string }[];
  await frame.getByLabel(headings[0]!.name).fill('Synthetic words for the test.');
  await frame.getByRole('button', { name: words.signOff }).click();
  await expect(frame.getByRole('alert')).toContainText(sentence('required-sections-missing'));
  for (const heading of headings.slice(1)) await frame.getByLabel(heading.name).fill('Synthetic words for the test.');
  await frame.getByRole('button', { name: words.signOff }).click();
  await expect(frame.getByRole('alert')).toHaveCount(0);
  await expect(frame.getByRole('status')).toContainText(words.signedOff.split('{at}')[0].trim());
});

test('a nurse starting triage is told it was not triaged, why and who decides, and no guidance is given without a ratified script', async ({ page }) => {
  await openWorkspace(page, 'Nurse');
  await goSection(page, 'Assessments');
  const triage = page.getByRole('region', { name: clinical.triage.screen.heading, exact: true });
  await triage.getByRole('button', { name: clinical.triage.screen.start }).click();
  const answer = triage.getByRole('status');
  await expect(answer).toContainText(clinical.triage.notTriaged.label);
  await expect(answer).toContainText(sentence('triage-without-ratified-protocol'));
  await expect(answer).toContainText(clinical.triage.notTriaged.human);
  await expect(answer).toContainText(clinical.triage.notTriaged.emergencyFirst);

  const guidance = page.getByRole('region', { name: clinical.guidance.screen.heading, exact: true });
  for (const outcome of clinical.guidance.outcomes as { code: string; label: string }[]) {
    await guidance.getByRole('button', { name: clinical.guidance.screen.give.replace('{outcome}', outcome.label) }).click();
  }
  await expect(guidance.getByRole('status')).toHaveCount(clinical.guidance.outcomes.length);
  for (const said of await guidance.getByRole('status').all()) await expect(said).toContainText(sentence('script-not-ratified'));
});
