import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openDestination, openWorkspace } from './nav';
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
const moneyApi = json('packages/catalog/apis/money.json') as { routes: { path: string; version: number; refusals: { id: string; statement: string }[] }[] };
const stateOf = (id: string) => claims.states.find(s => s.id === id)!;
/* What a claim nobody has agreed to is answered with. The doctor's draft says this until the patient agrees; the
   switching partner is the reason only once she has, which is what the patient's journey below sees. */
const withoutConsent = moneyApi.routes.find(r => r.path === '/v1/money/claims/{claimRef}/submit' && r.version === 1)!
  .refusals.find(r => r.id === 'claim-without-consent')!.statement;

test('the doctor\'s claim draft says no adopted code set, and asking for it to be sent is refused in the contract\'s words', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, 'Doctor');
  /* A destination in the doctor's Practice group since 30 September, where it was a More tool opening a dialog. */
  const draft = await openDestination(page, 'Claim draft');
  await expect(draft.locator('.claim-no-code')).toHaveText(claims.codeSets.doctorWords);
  await expect(draft.getByText(claims.codeSets.doctorDetail)).toBeVisible();
  await expect(draft.getByText(noticeFor('scheme-claims')!)).toBeVisible();
  /* Drafted, and the reason it has not been sent is on the screen before anybody presses anything. Until the patient
     agrees that reason is her agreement, not the switching partner: the gates are asked in the contract's order, and
     the first one missing is the one she is told about. */
  await expect(draft.locator('.claim-state')).toContainText(stateOf('drafted').doctorWords);
  await expect(draft.locator('.claim-not-sent')).toContainText(withoutConsent);

  await draft.getByRole('button', { name: claims.screen.doctor.send }).click();
  await expect(draft.locator('.claim-said')).toContainText(withoutConsent);
  /* A pre-authorisation would stop at the same door, and the draft says so rather than offering one. */
  await expect(draft.getByText(claims.preauthorisation.words)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the patient reads her claim\'s state on her record, agrees to send it, and it is still not sent', async ({ page }) => {
  await page.goto('/app/');
  await goSection(page, 'Health Passport');
  /* The Passport is tabbed since 30 September (the patient shell's Lovable build), and its doors to the rest of the
     record are under Records. */
  await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Records' }).click();
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
