import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openWorkspace } from './nav';
import { noticeFor } from './notices';

/* A visit offered to a nurse, and walked from her day to its completion.
 *
 * What these journeys hold is not that the screens render. It is that each refusal the Care engine
 * makes is on the screen, beside the control it refused, in the contract's own words: the offer says
 * how far and never where; a decline and a lapse pass it on; the code opens and closes the visit; the
 * checklist runs under no draft protocol; a visit is not handed over before the encounter is signed;
 * and once the visit is done the patient is no longer shown where the nurse is.
 *
 * Every sentence looked for is read from packages/catalog, never typed here. A spec with its own copy
 * passes for ever after the contract has been reworded.
 *
 * Set CARE_SHOTS to a directory to have each journey leave the screenshots a reviewer looks at. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../packages/catalog/${path}`, import.meta.url), 'utf8'));
const care = json('care.json');
const api = json('apis/care.json');
const protocols = json('protocols.json');
const service = json('services.json').find((s: { id: string }) => s.id === care.preview.serviceId);
const zoneName: string = json('geography.json').zones.find((z: { id: string }) => z.id === care.preview.zone).name;
const refusal = (path: string, id: string): string =>
  api.routes.find((r: { method: string; path: string }) => r.method === 'POST' && r.path === path)
    .refusals.find((x: { id: string }) => x.id === id).statement;
const engineRefusal = (id: string): string => api.refusals.find((x: { id: string }) => x.id === id).statement;
const previousMarker: string = care.offers.order.find((o: { id: string }) => o.id === 'previous').marker;

const shoot = async (page: Page, name: string, info: TestInfo) => {
  if (process.env.CARE_SHOTS) await page.screenshot({ path: `${process.env.CARE_SHOTS}/${name}-${info.project.name}.png` });
};
/* Inside the dialog and inside main as well as on the page: a box that scrolls vertically also
   scrolls sideways, and an overflow can hide in either where a page-level check cannot see it. */
const noOverflow = (page: Page) => page.evaluate(() =>
  [document.documentElement, document.querySelector('main'), document.querySelector('dialog[open]')]
    .filter((el): el is HTMLElement => Boolean(el))
    .every(el => el.scrollWidth <= el.clientWidth + 1));

const offerCard = (page: Page) => page.locator('.care-offer');
const slot = (page: Page) => page.locator('.care-slot');

async function acceptAndOpen(page: Page) {
  await openWorkspace(page, 'Nurse');
  await offerCard(page).getByRole('button', { name: 'Accept this visit' }).click();
  await expect(slot(page)).toContainText(zoneName);
  await slot(page).getByRole('button', { name: 'Continue this visit' }).click();
  return page.getByRole('dialog');
}

test('the offer on a nurse’s day says how far and until when, not where, and a decline passes it on', async ({ page }, info) => {
  await openWorkspace(page, 'Nurse');
  const card = offerCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: service.name })).toBeVisible();
  await expect(card).toContainText(previousMarker);
  await expect(card).toContainText(care.offers.distanceBasis);
  await expect(card).toContainText(noticeFor('booking'));
  /* The suburb is released with the acceptance, not with the offer. */
  await expect(card).not.toContainText(zoneName);
  await card.scrollIntoViewIfNeeded();
  await shoot(page, 'offer', info);
  expect(await noOverflow(page)).toBe(true);

  await card.getByRole('button', { name: 'Decline' }).click();
  await expect(slot(page)).toContainText(care.offers.declined);
  await expect(offerCard(page)).toHaveCount(0);
  await shoot(page, 'declined', info);
});

test('an unanswered offer lapses on the clock and passes on', async ({ page }, info) => {
  await page.clock.install();
  await openWorkspace(page, 'Nurse');
  await expect(offerCard(page)).toBeVisible();
  const expiry: number = care.settings.items.find((s: { key: string }) => s.key === 'offer-expiry').default.value;
  await page.clock.fastForward((expiry * 60 + 20) * 1000);
  await expect(slot(page)).toContainText(care.offers.lapsed);
  await expect(offerCard(page)).toHaveCount(0);
  await shoot(page, 'lapsed', info);
});

test('the visit starts only with the code, runs no checklist under a draft, and is not handed over unsigned', async ({ page }, info) => {
  const d = await acceptAndOpen(page);
  await expect(d).toContainText(care.position.whileShared);
  await expect(d.locator('.not-connected').first()).toContainText(noticeFor('booking'));
  await shoot(page, 'route', info);
  expect(await noOverflow(page)).toBe(true);

  await d.getByRole('button', { name: 'I am at the door' }).click();
  await d.getByLabel('Visit code, digit 1 of 6').fill('000000');
  await d.getByRole('button', { name: 'Start the visit' }).click();
  await expect(d).toContainText(refusal('/v1/care/visits/{appointmentRef}/start', 'visit-code-wrong'));
  await shoot(page, 'start-refused', info);

  await d.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await d.getByRole('button', { name: 'Start the visit' }).click();
  await expect(d).toContainText(refusal('/v1/care/visits/{appointmentRef}/checklist', 'protocol-not-ratified'));
  await expect(d).toContainText(protocols.refusals.find((r: { id: string }) => r.id === 'a-draft-carries-nothing').statement);
  const named = care.services.find((s: { serviceId: string }) => s.serviceId === care.preview.serviceId).protocolIds as string[];
  for (const id of named) await expect(d).toContainText(protocols.protocols.find((p: { id: string }) => p.id === id).name);
  await shoot(page, 'checklist', info);
  expect(await noOverflow(page)).toBe(true);

  await d.getByRole('button', { name: 'Continue to readings and sign-off' }).click();
  await expect(d).toContainText(care.record.sentence);
  await d.getByRole('button', { name: 'Continue to handover' }).click();
  await d.getByRole('button', { name: 'Hand to a doctor' }).click();
  await expect(d).toContainText(refusal('/v1/care/visits/{appointmentRef}/handover', 'encounter-incomplete'));
  await shoot(page, 'handover-refused', info);
});

test('signed off in the assessment, the visit is handed over, completed with the code, and the position stops being shared', async ({ page }, info) => {
  test.setTimeout(90_000);
  const d = await acceptAndOpen(page);
  await expect(d).toContainText(care.position.whileShared);
  await d.getByRole('button', { name: 'I am at the door' }).click();
  await expect(d.getByRole('heading', { name: 'Confirm you are at the right door' })).toBeVisible();
  await d.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await d.getByRole('button', { name: 'Start the visit' }).click();
  await expect(d).toContainText(refusal('/v1/care/visits/{appointmentRef}/checklist', 'protocol-not-ratified'));
  await d.getByRole('button', { name: 'Continue to readings and sign-off' }).click();
  /* Each stage is a different height, and the sheet returns to its top when one changes, so a click
     sent before the new stage has settled can land on the dialog's own padding — which is outside. */
  await expect(d.getByRole('heading', { name: 'Readings and sign-off' })).toBeVisible();
  await d.getByRole('button', { name: 'Open the visit assessment' }).click();

  /* The assessment the preview's record is: the same five stages the schedule's visit walks, naming the
     visit's own patient — the reference the toolkit beside it names — and never the assessment's default. */
  await expect(d).toContainText(`Ask ${care.preview.subjectRef} for the six-digit code`);
  await expect(d).not.toContainText('Lerato');
  await d.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Confirm identity' }).click();
  await d.getByRole('checkbox').first().check();
  await d.getByRole('button', { name: 'Start observations' }).click();
  await d.getByLabel('Blood pressure — systolic').fill('132');
  await d.getByRole('button', { name: 'Record findings' }).click();
  await d.getByLabel('Next step').selectOption('Refer for doctor review today');
  await d.getByRole('button', { name: 'Review sign-off' }).click();
  await d.getByRole('button', { name: 'Sign assessment' }).click();
  await d.getByRole('button', { name: /Back to the workspace/ }).click();

  const visit = page.getByRole('dialog');
  await expect(visit).toContainText('Signed off on this device.');
  await visit.getByRole('button', { name: 'Continue to handover' }).click();
  await visit.getByRole('button', { name: 'Hand to a doctor' }).click();
  await expect(visit).toContainText(care.handover.queued);
  await expect(visit).toContainText(noticeFor('doctor-review'));

  await visit.getByLabel('Visit code, digit 1 of 6').fill('482191');
  await visit.getByRole('button', { name: 'Complete the visit' }).click();
  await expect(visit).toContainText(refusal('/v1/care/visits/{appointmentRef}/complete', 'visit-code-wrong'));
  await visit.getByLabel('Visit code, digit 1 of 6').fill(care.preview.visitCode);
  await visit.getByRole('button', { name: 'Complete the visit' }).click();
  await expect(visit).toContainText(care.complete.billable);
  await expect(visit).toContainText(engineRefusal('location-beyond-the-visit'));
  await shoot(page, 'complete', info);
  expect(await noOverflow(page)).toBe(true);

  await visit.getByRole('button', { name: 'Back to your day' }).click();
  await expect(slot(page)).toContainText(care.complete.billable);
});
