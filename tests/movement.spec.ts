import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection, openWorkspace } from './nav';

/* Thuso Ride and admissions, on both viewports.
 *
 * What these journeys hold is what makes a transport screen safe rather than finished: a clinician's P3 trip waits
 * for a responder and says nothing about an ambulance; a P1 is refused with the emergency numbers above the
 * refusal's own sentence and becomes no trip; an admission is pending, in the contract's words and never as booked,
 * until a simulated answer decides it; and the responder's phone opens the emergency summary only while the trip is
 * under way, refuses a hand-over to nobody or without the checklist, and closes the summary at the hand-over.
 *
 * Every expected sentence and label is read from packages/catalog/movement.json, packages/catalog/apis/movement.json,
 * packages/catalog/sos.json and the records the emergency summary opens, so a reworded sentence or a new default
 * moves these tests with it. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const movement = json('../packages/catalog/movement.json');
const api = json('../packages/catalog/apis/movement.json') as { refusals: { id: string; statement: string }[]; routes: { withdrawn?: unknown; refusals: { id: string; statement: string }[] }[] };
const sos = json('../packages/catalog/sos.json') as { emergency: { numbers: { id: string; number: string }[] } };
const gateway = json('../packages/catalog/passport-gateway.json') as { emergencySummary: { categories: string[] } };
const records = json('../packages/catalog/records.json') as { records: { id: string; name: string }[] };
const say = movement.screens;
const fill = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));
const statement = (id: string) => [...api.refusals, ...api.routes.filter(r => !r.withdrawn).flatMap(r => r.refusals)].find(r => r.id === id)!.statement;
const labelOf = (list: { id: string; label: string }[], id: string) => list.find(x => x.id === id)!.label;
const priority = (id: string) => (movement.priorities as { id: string; label: string }[]).find(p => p.id === id)!.label;
const facilityName = (ref: string) => (movement.facilities.entries as { ref: string; name: string }[]).find(f => f.ref === ref)!.name;
const admissionState = (id: string) => (movement.admissions.states as { id: string; label: string; sentence: string }[]).find(s => s.id === id)!;
const number = (id: string) => sos.emergency.numbers.find(n => n.id === id)!.number;
const heartbeatDefault: number = movement.settings.items.find((s: { key: string }) => s.key === 'heartbeat-interval-seconds').default.value;
const summaryCategories = gateway.emergencySummary.categories.map(id => records.records.find(r => r.id === id)!.name).join(', ');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* The document and the workspace's main, which scrolls on its own: a page can stay inside the phone while its main
   scrolls sideways, and a table on the desk is exactly the thing that does it. */
async function noSidewaysScroll(page: Page) {
 return page.evaluate(() => [document.documentElement, document.querySelector('main')]
  .filter((el): el is HTMLElement => Boolean(el)).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.tagName.toLowerCase()} ${el.scrollWidth}`));
}

async function openBooking(page: Page): Promise<Locator> {
 await openWorkspace(page, 'Doctor');
 await goSection(page, 'Patient context');
 const booking = page.getByRole('region', { name: say.clinician.heading });
 await expect(booking).toBeVisible();
 return booking;
}
async function openDesk(page: Page): Promise<Locator> {
 await openWorkspace(page, 'Control Tower');
 await goSection(page, 'Dispatch');
 const desk = page.getByRole('region', { name: say.desk.heading });
 await expect(desk).toBeVisible();
 return desk;
}

test('a clinician requests a P3 trip, and it waits for a responder without a word about an ambulance', async ({ page }) => {
 const booking = await openBooking(page);
 await expect(booking.getByText(movement.notAnAmbulance.sentence)).toBeVisible();
 await booking.getByLabel(say.clinician.priority).selectOption({ label: priority('P3') });
 await booking.getByLabel(say.clinician.destination).selectOption({ label: facilityName('facility-synthetic-2') });
 await booking.getByRole('button', { name: say.clinician.request }).click();

 const requested = new RegExp(`^${escape(say.clinician.requested).replace('\\{ref\\}', 'TRIP-\\d{4}')}$`);
 await expect(booking.getByRole('status')).toHaveText(requested);
 const row = booking.getByRole('listitem').filter({ hasText: facilityName('facility-synthetic-2') }).first();
 await expect(row).toContainText(labelOf(movement.trips.states, 'requested'));
 await expect(row).toContainText(priority('P3'));
 await expect(booking.getByRole('alert')).toHaveCount(0);
 await expect(booking).not.toContainText(/Thuso Ride ambulance|ambulance is on the way/i);
 expect(await noSidewaysScroll(page)).toEqual([]);
});

test('a P1 is refused with the emergency numbers above the refusal, and becomes no trip', async ({ page }) => {
 const booking = await openBooking(page);
 const before = await booking.getByRole('listitem').count();
 await booking.getByLabel(say.clinician.priority).selectOption({ label: priority('P1') });
 await booking.getByRole('button', { name: say.clinician.request }).click();

 const refusal = booking.getByRole('alert');
 await expect(refusal).toContainText(say.clinician.p1Heading);
 await expect(refusal).toContainText(fill(say.clinician.p1Call, { ambulance: number('ambulance'), mobile: number('mobile') }));
 await expect(refusal).toContainText(statement('p1-refused-no-ambulance-partner'));
 const text = await refusal.innerText();
 expect(text.indexOf(number('ambulance'))).toBeLessThan(text.indexOf(statement('p1-refused-no-ambulance-partner')));
 await expect(booking.getByRole('status')).toHaveText('');
 await expect(booking.getByRole('listitem')).toHaveCount(before);
 expect(await noSidewaysScroll(page)).toEqual([]);
});

test('an admission is pending in the contract\'s words, never booked, and stays pending when it is wait-listed', async ({ page }) => {
 await openDesk(page);
 const admissions = page.getByRole('region', { name: say.admissions.heading });
 const form = admissions.getByRole('form', { name: say.admissions.request });
 await form.getByLabel(say.admissions.facility).selectOption({ label: facilityName('facility-synthetic-3') });
 await form.getByLabel(say.admissions.bedCategory).selectOption({ label: labelOf(movement.admissions.bedCategories, 'maternity') });
 await form.getByRole('button', { name: say.admissions.request }).click();

 const row = admissions.getByRole('listitem').filter({ hasText: facilityName('facility-synthetic-3') }).first();
 await expect(row).toContainText(admissionState('requesting').label);
 await expect(row).toContainText(admissionState('requesting').sentence);
 await expect(row.getByText(say.admissions.pending, { exact: true })).toBeVisible();
 await expect(row.getByText(say.admissions.destinationConfirmed, { exact: true })).toHaveCount(0);
 for (const word of movement.admissions.pendingNeverSays as string[]) await expect(row).not.toContainText(new RegExp(`\\b${escape(word)}\\b`, 'i'));

 await row.getByText(say.admissions.simulateHeading).click();
 await expect(row.getByText(say.admissions.simulateNote)).toBeVisible();
 await row.getByRole('button', { name: labelOf(movement.admissions.decisions, 'waitlisted') }).click();
 await expect(row).toContainText(admissionState('waitlisted').label);
 await expect(row.getByText(say.admissions.pending, { exact: true })).toBeVisible();
 await expect(row.getByText(say.admissions.simulated, { exact: true })).toBeVisible();
 for (const word of movement.admissions.pendingNeverSays as string[]) await expect(row).not.toContainText(new RegExp(`\\b${escape(word)}\\b`, 'i'));
 expect(await noSidewaysScroll(page)).toEqual([]);
});

test('the responder accepts, reads the emergency summary only during the trip, and hands over by role with the checklist', async ({ page }) => {
 const desk = await openDesk(page);
 const phone = desk.getByRole('region', { name: say.desk.responderHeading });
 await expect(phone).toContainText(fill(say.responder.heartbeat, { interval: `${heartbeatDefault} seconds` }));
 const summary = phone.getByRole('group', { name: say.responder.summaryHeading });
 await expect(summary).toContainText(say.responder.summaryNotYet);

 const offer = phone.getByRole('listitem', { name: `${say.responder.offered}: ${movement.preview.trips[0].ref}` });
 await offer.getByRole('button', { name: say.responder.accept }).click();
 await expect(summary).toContainText(fill(say.responder.summaryOpen, { categories: summaryCategories }));

 const record = phone.getByRole('button', { name: say.responder.handover });
 await record.click();
 await expect(phone.getByRole('alert')).toContainText(statement('unnamed-receiver'));
 await phone.getByLabel(say.responder.receivingRole).selectOption({ label: labelOf(movement.trips.receivingRoles, 'admissions-desk') });
 await record.click();
 await expect(phone.getByRole('alert')).toContainText(statement('checklist-not-followed'));
 for (const line of movement.trips.checklist as string[]) await phone.getByRole('checkbox', { name: line }).check();
 await record.click();

 await expect(phone.getByRole('alert')).toHaveCount(0);
 await expect(summary).toContainText(say.responder.summaryClosed);
 await expect(phone.getByRole('status')).toContainText(new RegExp(escape(say.responder.handedOver).replace('\\{when\\}', '.+')));
 await expect(desk.getByRole('row', { name: new RegExp(movement.preview.trips[0].ref) })).toContainText(labelOf(movement.trips.states, 'handed-over'));
 expect(await noSidewaysScroll(page)).toEqual([]);
});
