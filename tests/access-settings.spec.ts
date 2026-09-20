import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openAdminConsole } from './nav';
import { editorLabel, fill, openChangeForm, openConfiguration, say, timingItem } from './safety-settings';

/* Access's settings, changed on the back office and met where a patient meets them, on both viewports.

   The founder instructed on 15 September 2026 that open questions become admin settings. These journeys
   check that an Access setting an admin changes is the one a patient's screen reads, in the same tab and
   without a reload: the thread composer counts and refuses at the longest message in force, and GilbertOne,
   asked for a nurse when the handover desk's hours in force say nobody is there, says so first, gives the
   emergency numbers from sos.json and offers a call back when the desk opens. What they check is what makes
   that safe: the numbers are said whatever the hours are, and nothing typed here is a limit or an hour the
   contracts do not hold. Every sentence is read from packages/catalog. */

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const booking = json('../packages/catalog/booking.json');
const access = json('../packages/catalog/apis/access.json');
const sos = json('../packages/catalog/sos.json');
const vetting = json('../packages/catalog/vetting.json');
const gilbert = json('../packages/catalog/assistant.json');
type Row = { key: string; label: string; unit: string | null; type: 'count' | 'schedule'; default: { value: unknown }; bounds?: { lowest: { value: number }; highest: { value: number } } };
const setting = (key: string) => booking.settings.items.find((s: { key: string }) => s.key === key) as Row;
const number = (id: string) => sos.emergency.numbers.find((n: { id: string }) => n.id === id).number;
const writeRoute = access.routes.find((r: { path: string }) => r.path === '/v1/access/visit-threads/{bookingRef}/messages');
const tooLong = writeRoute.refusals.find((r: { id: string }) => r.id === 'message-too-long').statement;
const roleName = (id: string) => vetting.roles.find((r: { id: string }) => r.id === id).name;

/* 08:00 on a Tuesday in Johannesburg, inside the desk's default hours. */
const START = new Date('2026-09-15T08:00:00+02:00');
const accessPanel = (page: Page) => page.getByRole('region', { name: booking.settings.heading });

/* The consent gate stands between opening the assistant and the conversation, since 20 September 2026.
   These journeys are about what the handover desk says, so each one consents the way a patient does
   before it asks anything, and reads the gate's words from the same contract the panel reads. */
const consent = async (page: Page) => {
  const panel = page.getByRole('dialog', { name: gilbert.identity.name });
  await panel.getByRole('checkbox', { name: gilbert.consent.checkboxDoctor }).check();
  await panel.getByRole('checkbox', { name: gilbert.consent.checkboxEmergency }).check();
  await panel.getByRole('button', { name: gilbert.consent.accept }).click();
};

async function confirmChange(page: Page, row: Row, edit: (form: ReturnType<Page['locator']>) => Promise<void>, reason: string) {
  const form = await openChangeForm(accessPanel(page), row);
  await edit(form);
  await form.getByLabel(say.reason, { exact: true }).fill(reason);
  await form.getByRole('button', { name: say.review }).click();
  await form.getByRole('button', { name: say.confirm }).click();
  await expect(form).toHaveCount(0);
}

test('an admin shortens the longest thread message, and the patient’s composer counts and refuses at the length in force', async ({ page }) => {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  await openConfiguration(page);
  const longest = setting('visit-thread-max-characters');
  const shorter = longest.bounds!.lowest.value * 3;
  await confirmChange(page, longest, form => form.getByLabel(editorLabel(longest), { exact: true }).fill(String(shorter)),
    'Directions to a gate fit in a few sentences, and a longer message is a history in the wrong place.');
  await expect(timingItem(accessPanel(page), longest).locator('.ss-in-force')).toContainText(fill(say.values.count, { value: String(shorter), unit: longest.unit! }));

  /* The same tab, as the patient: the thread about an upcoming visit reads the length in force. */
  await chooseRole(page, 'Patient');
  await goSection(page, 'My visits');
  await page.locator('main .visit-actions').first().getByRole('button', { name: 'View details' }).click();
  const visit = page.getByRole('dialog');
  await visit.getByRole('button', { name: new RegExp(booking.thread.openLabel) }).click();
  const field = visit.getByLabel(booking.thread.inputLabel);
  await field.fill('a'.repeat(shorter + 1));
  await expect(visit.locator('.thread-count')).toHaveText(`${shorter + 1} / ${shorter}`);
  await visit.getByRole('button', { name: booking.thread.sendLabel }).click();
  await expect(visit.getByRole('alert')).toHaveText(tooLong);
  await expect(visit.locator('.thread-message')).toHaveCount(0);
  await field.fill('b'.repeat(shorter));
  await visit.getByRole('button', { name: booking.thread.sendLabel }).click();
  await expect(visit.locator('.thread-message')).toHaveCount(1);
  /* The rule no setting reaches: nobody watches this thread, with the numbers, above the field. */
  await expect(visit.locator('.thread-urgent')).toContainText(booking.thread.nobodyWatches.replace('{ambulance}', number('ambulance')).replace('{mobile}', number('mobile')));
  await expect(visit.locator('.thread-photos')).toHaveText(booking.thread.wordsOnly);
});

test('with the handover desk’s hours moved so nobody is there now, GilbertOne says so, gives the emergency numbers and offers a call back when it opens', async ({ page }) => {
  await page.clock.install({ time: START });
  const launcher = page.getByRole('button', { name: gilbert.identity.callToAction, exact: true });
  const panel = page.getByRole('dialog', { name: gilbert.identity.name });
  const handOver = async () => {
    await panel.getByLabel(gilbert.conversation.inputLabel).fill('My knee has been sore since Tuesday');
    await panel.getByLabel(gilbert.conversation.inputLabel).press('Enter');
    await panel.getByRole('log', { name: gilbert.conversation.logLabel }).locator('.as-reply').last().getByRole('button', { name: gilbert.answers.unmatched.handoverLabel }).click();
    return panel.getByRole('log', { name: gilbert.conversation.logLabel }).locator('.as-reply').last();
  };
  const hours = setting('handover-hours');
  const window = (hours.default.value as { from: string; to: string }[])[0]!;

  /* Inside the hours in force: nobody is said to be absent, and who answers is the setting's role. */
  await page.goto('/app/?open=assistant');
  await consent(page);
  const inHours = await handOver();
  await expect(inHours.locator('.as-headline').first()).toHaveText(gilbert.answers.handover.title);
  await expect(inHours.locator('.as-desk')).toHaveCount(0);
  await expect(inHours.locator('.as-answered-by')).toContainText((setting('handover-answered-by').default.value as string[]).map(roleName).join(', '));

  /* The back office moves the opening to the evening, so eight in the morning is out of hours. */
  const opens = '18:00';
  await openAdminConsole(page);
  await openConfiguration(page);
  await confirmChange(page, hours, form => form.getByLabel(say.editors.from, { exact: true }).fill(opens),
    'Nobody staffs the handover desk before the evening shift this week.');
  await expect(timingItem(accessPanel(page), hours).locator('.ss-in-force')).toContainText(`${opens}–${window.to}`);

  await chooseRole(page, 'Patient');
  await launcher.click();
  /* The role switch mounts a fresh patient app, so the gate stands again. */
  await consent(page);
  const shut = await handOver();
  const desk = shut.locator('.as-desk');
  await expect(desk.locator('.as-desk-nobody')).toHaveText(booking.handover.outOfHours);
  await expect(desk.locator('.as-desk-numbers')).toHaveText(booking.handover.outOfHoursNumbers.replace('{ambulance}', number('ambulance')).replace('{mobile}', number('mobile')));
  await expect(desk.locator('.as-desk-callback')).toHaveText(fill(booking.handover.callback, { when: fill(booking.handover.opensToday, { time: opens }) }));
  /* The numbers come before the offer of a call back, and the summary still goes only when pressed. */
  const order = await desk.locator('p').allInnerTexts();
  expect(order.findIndex(t => t.includes(number('ambulance')))).toBeLessThan(order.findIndex(t => t === fill(booking.handover.callback, { when: fill(booking.handover.opensToday, { time: opens }) })));
  await expect(shut.locator('.as-notsent')).toHaveText(gilbert.answers.handover.notSent);
});

test('after the desk’s hours in force have closed for the night, an emergency handed over says nobody is there and the numbers first, offers tomorrow’s call back, and stays an emergency', async ({ page }) => {
  /* An hour after the default rota's last window closes, on the same evening in Johannesburg — worked out from the
     setting rather than typed, so a changed default moves the moment with it. */
  const hours = setting('handover-hours');
  const window = (hours.default.value as { from: string; to: string }[])[0]!;
  const nightHour = String((Number(window.to.slice(0, 2)) + 1) % 24).padStart(2, '0');
  await page.clock.install({ time: new Date(`2026-09-15T${nightHour}:${window.to.slice(3)}:00+02:00`) });
  await page.goto('/app/?open=assistant');
  await consent(page);
  const panel = page.getByRole('dialog', { name: gilbert.identity.name });
  const log = panel.getByRole('log', { name: gilbert.conversation.logLabel });
  const ask = async (words: string) => {
    await panel.getByLabel(gilbert.conversation.inputLabel).fill(words);
    await panel.getByLabel(gilbert.conversation.inputLabel).press('Enter');
  };
  const h = gilbert.answers.handover;
  const emergency = h.urgency.find((u: { id: string }) => u.id === 'emergency');

  await ask('My chest hurts and I feel sick');
  await expect(log.locator('.as-reply').last().locator('.as-numbers li').first()).toContainText(number('ambulance'));
  await ask('can I talk to a nurse');
  const handover = log.locator('.as-reply').last();
  const desk = handover.locator('.as-desk');
  /* Nobody, then the numbers, then tomorrow's call back — in that order, before anything about the summary. */
  await expect(desk.locator('p')).toHaveText([
    booking.handover.outOfHours,
    booking.handover.outOfHoursNumbers.replace('{ambulance}', number('ambulance')).replace('{mobile}', number('mobile')),
    fill(booking.handover.callback, { when: fill(booking.handover.opensTomorrow, { time: window.from }) })
  ]);
  /* Out of hours changes who is there, never how urgent it is: the emergency stays an emergency. */
  await expect(handover.locator('.as-summary > div').nth(2)).toContainText(emergency.name);
  await expect(handover).toContainText(h.neverLowered);
  await handover.getByRole('button', { name: h.sendLabel }).click();
  await expect(handover.locator('.as-sent .as-headline')).toHaveText(h.sentTitle);

  await ask('can I talk to a nurse');
  const again = log.locator('.as-reply').last();
  await expect(again.locator('.as-desk .as-desk-numbers')).toContainText(number('ambulance'));
  await expect(again.locator('.as-summary > div').nth(2)).toContainText(emergency.name);
  await again.getByRole('button', { name: h.sendLabel }).click();
  await expect(again.locator('.as-sent .as-headline')).toHaveText(h.alreadySent);
});
