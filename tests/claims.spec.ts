import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';
import { noticeFor } from './notices';
/* A claim to a medical scheme, on both viewports: the doctor's draft says no code set is adopted and asking for it to be
 * sent is refused in the route's own sentence, and the patient sees the claim's state on her record in plain words,
 * agrees to send it, and it is still not sent.
 *
 * Every sentence is packages/catalog/claims.json's or packages/catalog/apis/money.json's, read here rather than typed. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const claims = json('packages/catalog/claims.json') as {
  states: { id: string; name: string; patientWords: string; doctorWords: string }[];
  stop: { refusal: string; words: string };
  codeSets: { doctorWords: string; doctorDetail: string; statement: string };
  consent: { notAGrant: string; never: string };
  preauthorisation: { words: string };
  screen: { patient: Record<string, string>; doctor: Record<string, string>; preview: string };
};
const stateOf = (id: string) => claims.states.find(s => s.id === id)!;

test('the doctor\'s claim draft says no adopted code set, and asking for it to be sent is refused in the contract\'s words', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, 'Doctor');
  await page.locator('.tool-link').filter({ hasText: 'Claim draft' }).click();
  const draft = page.getByRole('dialog');
  await expect(draft.locator('.claim-no-code')).toHaveText(claims.codeSets.doctorWords);
  await expect(draft.getByText(claims.codeSets.doctorDetail)).toBeVisible();
  await expect(draft.getByText(noticeFor('scheme-claims')!)).toBeVisible();
  /* Drafted, and the reason it has not been sent is on the screen before anybody presses anything. */
  await expect(draft.locator('.claim-state')).toContainText(stateOf('drafted').doctorWords);
  await expect(draft.locator('.claim-not-sent')).toContainText(claims.stop.words);

  await draft.getByRole('button', { name: claims.screen.doctor.send }).click();
  await expect(draft.locator('.claim-said')).toContainText(claims.stop.words);
  /* A pre-authorisation would stop at the same door, and the draft says so rather than offering one. */
  await expect(draft.getByText(claims.preauthorisation.words)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the patient reads her claim\'s state on her record, agrees to send it, and it is still not sent', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
  await page.getByRole('button', { name: /Claims to your medical scheme/ }).click();
  const screen = page.locator('.claim-screen');
  await expect(screen.getByRole('heading', { name: claims.screen.patient.heading })).toBeVisible();
  await expect(screen.getByText(noticeFor('scheme-claims')!)).toBeVisible();
  await expect(screen.locator('.claim-state')).toContainText(stateOf('drafted').patientWords);
  /* What agreeing is, and what it is not, before the button that does it. */
  await expect(screen.getByText(claims.consent.notAGrant)).toBeVisible();
  await expect(screen.getByText(claims.consent.never)).toBeVisible();

  await screen.getByRole('button', { name: claims.screen.patient.agree }).click();
  await expect(screen.locator('.claim-state')).toContainText(stateOf('consented').patientWords);
  await expect(screen.locator('.claim-not-sent')).toContainText(claims.stop.words);
  /* And no code set is adopted, which the record says as plainly as the doctor's draft does. */
  await expect(screen.getByText(claims.codeSets.statement)).toBeVisible();
});
