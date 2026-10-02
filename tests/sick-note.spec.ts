import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openDestination, openWorkspace } from './nav';

/* The doctor's medical certificate (2 October 2026), on both viewports. A doctor writes one for the home
 * visit it comes out of and signs it in the preview; the illness is withheld until the patient agrees; a
 * nurse and a doctor whose registration lapsed are refused; a period reaching further back than the
 * contract allows is refused, and so is a call with nobody in the room — and the patient, in the same tab,
 * finds what was written on her Passport, marked not issued. Every sentence is read from the contracts. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const c = json('../packages/catalog/sick-note.json');
const teleconsult = json('../packages/catalog/teleconsult.json');
const vetting = json('../packages/catalog/vetting.json');
const refusal = (id: string) => (c.refusals as { id: string; sentence?: string }[]).find(r => r.id === id)!.sentence!;
const doctorRefusal = (vetting.roles as { id: string; grants: { capability: string; refusal: string }[] }[])
 .find(r => r.id === 'doctor')!.grants.find(g => g.capability === c.issuer.capability)!.refusal;
const callOnly = (teleconsult.issued.items as { id: string; condition: string }[]).find(i => i.id === 'certificate')!.condition;
/* The date input's value for a day offset, against the browser's calendar day, the way the screen works it out. */
const isoOf = (offset: number) => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + offset * 86_400_000).toISOString().slice(0, 10); };

async function openDesk(page: Page): Promise<Locator> {
 await openWorkspace(page, 'Doctor');
 return openDestination(page, c.screen.deskTitle);
}
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('a doctor certifies a home visit with the illness withheld, signs only in the preview, and the patient finds it marked not issued', async ({ page }) => {
 const desk = await openDesk(page);
 await expect(desk.locator('.sn-banner')).toHaveText(c.notIssued);
 const composer = desk.locator('.sn').first();
 await expect(composer.locator('.sn-withheld')).toHaveText(c.diagnosis.withheld);
 await expect(composer.getByRole('textbox', { name: c.diagnosis.descriptionLabel })).toHaveCount(0);
 for (const n of c.notCarried) await expect(composer).toContainText(n.sentence);
 await expect(composer.locator('.sn-ready')).toHaveText(c.screen.readyLine);
 await composer.getByRole('button', { name: c.screen.sign }).click();

 const sheet = desk.locator('.sn-certificate');
 await expect(sheet.locator('.sn-stamp')).toHaveText(c.notIssuedShort);
 await expect(sheet.locator('.sn-not-issued')).toHaveText(c.notIssued);
 await expect(sheet.locator('.sn-line-description dd')).toHaveText(c.diagnosis.withheld);
 await expect(sheet.locator('.sn-line-statement dd')).toHaveText(c.fitness[0].statement);
 await expect(sheet.locator('.sn-line-basis dd')).toHaveText(c.basis.homeVisit);
 await expect(sheet.locator('.sn-line-signature dd')).toContainText(`A. DLAMINI · ${c.screen.unsigned}`);
 await expect(sheet.locator('.sn-line-qualification dd')).toHaveText(c.notHeld);
 /* Rule 16's items and nothing else: no identity number and no employment number. */
 await expect(sheet.locator('.sn-line')).toHaveCount(13);
 await expect(sheet).not.toContainText(/identity number|ID number/i);
 await expect(desk).toContainText(c.memoryOnly);
 expect(await noSidewaysScroll(page)).toBe(true);

 /* The patient, in the same tab: her Passport shows what was written, as she would read it. */
 await chooseRole(page, 'Patient');
 await goSection(page, 'Health Passport');
 await page.getByRole('tablist', { name: 'Passport sections' }).getByRole('tab', { name: 'Records' }).click();
 await page.locator('.record-row').filter({ hasText: 'Medical certificate' }).click();
 const dialog = page.getByRole('dialog');
 const written = dialog.getByRole('region', { name: c.screen.passportHeading });
 await expect(written.locator('.sn-certificate')).toContainText('TH-2048');
 await expect(written.locator('.sn-stamp')).toHaveText(c.notIssuedShort);
 await expect(written).toContainText(c.memoryOnly);
});

test('a nurse is refused in the sentence on her assessment, and a doctor whose registration lapsed in the register\'s words', async ({ page }) => {
 const desk = await openDesk(page);
 const composer = desk.locator('.sn').first();
 const sign = composer.getByRole('button', { name: c.screen.sign });
 await composer.getByLabel(c.screen.writingAs).selectOption('N-205');
 await expect(composer.locator('[data-refusal="not-a-doctor"]')).toHaveText(c.issuer.notADoctor);
 await expect(sign).toBeDisabled();
 await composer.getByLabel(c.screen.writingAs).selectOption('D-402');
 await expect(composer.locator('[data-refusal="registration"]')).toContainText(doctorRefusal);
 await expect(sign).toBeDisabled();
 await composer.getByLabel(c.screen.writingAs).selectOption('D-401');
 await expect(composer.locator('.sn-refusals')).toHaveCount(0);
 await expect(sign).toBeEnabled();
});

test('a period reaching further back than the contract allows is refused, and so is a call with nobody in the room', async ({ page }) => {
 const desk = await openDesk(page);
 let composer = desk.locator('.sn').first();
 const first = composer.getByLabel(c.screen.fromLabel);
 await first.fill(isoOf(-(c.period.backdateDays + 1)));
 await expect(composer.locator('[data-refusal="backdated-too-far"]')).toHaveText(refusal('backdated-too-far').replace('{days}', String(c.period.backdateDays)));
 await expect(composer.getByRole('button', { name: c.screen.sign })).toBeDisabled();
 await first.fill(isoOf(-c.period.backdateDays));
 await expect(composer.locator('[data-refusal="backdated-too-far"]')).toHaveCount(0);
 /* Signed now, the days before the visit say they rest on what the patient reported. */
 await composer.getByRole('button', { name: c.screen.sign }).click();
 await expect(desk.locator('.sn-line-basis dd')).toHaveText(`${c.basis.homeVisit} ${c.basis.backdated}`);

 const call = c.consultations.find((k: { kind: string }) => k.kind === 'video-call');
 await desk.locator('.sn-choice').filter({ hasText: call.reference }).click();
 composer = desk.locator('.sn').first();
 await expect(composer.locator('[data-refusal="from-a-call"]')).toHaveText(callOnly);
 await expect(composer.getByRole('button', { name: c.screen.sign })).toBeDisabled();
 const later = c.consultations.find((k: { dayOffset: number }) => k.dayOffset > 0);
 await desk.locator('.sn-choice').filter({ hasText: later.reference }).click();
 await expect(desk.locator('.sn').first().locator('[data-refusal="not-yet-seen"]')).toHaveText(refusal('not-yet-seen'));
});

test('the illness is described only once the patient agrees, and withdrawing the agreement clears the words', async ({ page }) => {
 const desk = await openDesk(page);
 const composer = desk.locator('.sn').first();
 await composer.getByLabel(c.diagnosis.consentLabel).check();
 await expect(composer.locator('[data-refusal="consent-without-description"]')).toHaveText(refusal('consent-without-description'));
 const words = composer.getByRole('textbox', { name: c.diagnosis.descriptionLabel });
 await words.fill('A stomach bug');
 await expect(composer.locator('.sn-ready')).toBeVisible();
 await composer.getByLabel(c.diagnosis.consentLabel).uncheck();
 await expect(composer.locator('.sn-withheld')).toHaveText(c.diagnosis.withheld);
 await composer.getByLabel(c.diagnosis.consentLabel).check();
 await expect(words).toHaveValue('');
 await words.fill('A stomach bug');
 await composer.getByRole('button', { name: c.screen.sign }).click();
 await expect(desk.locator('.sn-line-description dd')).toHaveText('A stomach bug');
});
