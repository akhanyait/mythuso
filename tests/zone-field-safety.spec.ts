import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openAdminConsole, openWorkspace } from './nav';
import { editorLabel, openChangeForm, openConfiguration, say, timingItem } from './safety-settings';

/* The dispatch map's field-safety overlay, on both viewports.
 *
 * The journeys check the three things field-safety.json#zoneOverlay.rules refuses and the one thing its
 * floor must never do, because those are what makes the panel safe rather than what makes it look
 * finished: a suburb with something open is named with a count and never graded; a proportion is drawn
 * as two integers and only over a group large enough to be an aggregate; the counts are drawn whole
 * whatever the floor is set to, so an open panic in a one-nurse suburb is still an open panic the
 * operator sees; and the panel is drawn for the audience the desk queue's own route admits and for no
 * other — a back office reading a nurse's panic on a funding screen is the failure this exists to stop.
 *
 * Every expected sentence, count and suburb is read from the contracts and computed from the roster the
 * way the overlay computes it, so a changed floor, a changed roster or a reworded sentence moves these
 * tests with it instead of breaking them.
 */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const contract = json('../packages/catalog/field-safety.json');
const overlay = contract.zoneOverlay;
const roster = json('../packages/catalog/roster.json') as { nurses: { id: string; name: string; zone: string }[] };
const geography = json('../packages/catalog/geography.json') as { zones: { name: string }[] };

/* The floor is the contract's own default, never a number typed here. Both viewports run on it because
   nothing changes it: tests/configuration.spec.ts walks the back office that would. */
const floorItem = contract.settings.items.find((s: { key: string }) => s.key === 'zone-share-minimum-nurses');
const floor: number = floorItem.default.value;
const fill = (sentence: string, values: Record<string, string>) =>
  sentence.replace(/\{(\w+)\}/g, (whole: string, key: string) => values[key] ?? whole);

/* Which suburbs the seeded desk lands in, worked out from the same two contracts the preview works it
   out from: the desk's open items are one overdue timer and one open panic, each on a nurse with a zone
   geography.json draws, and a third panic resolved three hours ago that counts towards nothing. */
const drawnZones = new Set(geography.zones.map(z => z.name));
const NURSE_ON_SHIFT = 'N-205';
const withZone = roster.nurses.filter(nurse => drawnZones.has(nurse.zone) && nurse.id !== NURSE_ON_SHIFT);
const [late, pressed] = [withZone[0], withZone[1] ?? withZone[0]];
const rosteredIn = (zone: string) => roster.nurses.filter(nurse => nurse.zone === zone).length;
/* Open items by suburb, as the overlay groups them: the overdue in one nurse's suburb and the open
   panic in another's. At the floor the founder decided on 2 October 2026 — the lowest bound, three —
   the overdue's suburb, Soweto, holds enough nurses to draw its proportion and the panic's, Randburg,
   does not, so the panel shows both sides of the floor at once. At the proposed five it showed neither. */
const openByZone = new Map<string, { panics: number; overdues: number; open: number; holders: Set<string> }>();
for (const [nurse, kind] of [[late, 'overdues'], [pressed, 'panics']] as [typeof late, 'overdues' | 'panics'][]) {
  const found = openByZone.get(nurse.zone) ?? { panics: 0, overdues: 0, open: 0, holders: new Set<string>() };
  found[kind] += 1;
  found.open += 1;
  /* The proportion counts nurses and not items, so a nurse holding both is one of the roster. */
  found.holders.add(nurse.id);
  openByZone.set(nurse.zone, found);
}
const expectedZones = [...openByZone.keys()].sort((a, b) => a.localeCompare(b));

/** The overlay's own panel, and the suburb rows inside it. */
const panel = (page: Page) => page.locator('.zone-safety');
const row = (page: Page, zone: string) => panel(page).locator('.zone-safety__row').filter({ has: page.locator('.zone-safety__zone', { hasText: zone }) });

/** Opens the board the overlay is drawn on, as the Control Tower. */
async function openBoard(page: Page) {
  await openWorkspace(page, 'Control Tower');
  await goSection(page, 'Dispatch');
  await expect(panel(page)).toBeVisible();
}

test('the overlay names each suburb with a count, in the contract\'s words, and grades none of them', async ({ page }) => {
  await openBoard(page);
  /* One row per suburb with something open, by name and not by count: a sort on the counts is a ranking
     with the heading taken off, and the order a controller needs on a map is where the suburb is. */
  const rows = panel(page).locator('.zone-safety__row');
  await expect(rows).toHaveCount(expectedZones.length);
  await expect(rows.locator('.zone-safety__zone').allInnerTexts()).resolves.toEqual(expectedZones);

  for (const zone of expectedZones) {
    const counts = openByZone.get(zone)!;
    /* The sentence is the contract's, with the panic plural filled in. */
    await expect(row(page, zone).locator('.zone-safety__counts'))
      .toHaveText(fill(overlay.countSentence, { zone, open: String(counts.open), panics: String(counts.panics), overdues: String(counts.overdues), panicPlural: counts.panics === 1 ? '' : 's' }));
    await expect(row(page, zone).locator('.zone-safety__kinds'))
      .toHaveText(fill(overlay.kindsSentence, { zone, open: String(counts.open), panics: String(counts.panics), overdues: String(counts.overdues), panicPlural: counts.panics === 1 ? '' : 's' }));
  }

  /* A suburb is named with a count and never graded. The words a sentence uses are what an operator
     repeats, so none of them may say a place is safe or dangerous — the same question the domain test
     asks of the proportion, asked here of everything the panel draws. */
  const text = await panel(page).innerText();
  expect(text.toLowerCase(), 'a-zone-is-not-a-verdict').not.toMatch(/\b(high risk|low risk|unsafe|dangerous|danger zone|crime)\b/);

  /* The counts are counts of what is open now, and never a percentage: a percentage is what makes three
     data points look like a measurement, and the honest form of one of three is the two numbers. */
  expect(text, 'no figure on the overlay is a percentage').not.toContain('%');

  /* A panic leads its row's own words rather than sitting in a colour alone, so a controller scanning
     for it finds it in the sentence and not in a swatch she has to look up. */
  for (const zone of expectedZones) {
    const hasPanic = openByZone.get(zone)!.panics > 0;
    await expect(row(page, zone)).toHaveClass(hasPanic ? /has-panic/ : /^(?!.*has-panic)/);
  }
});

test('a suburb below the floor draws its counts whole and says why it draws no proportion', async ({ page }) => {
  await openBoard(page);
  /* Most suburbs on this roster hold fewer nurses than any floor, so this is the panel's ordinary state
     rather than a corner of it. What is asserted is the whole of the floor's purpose: the
     proportion is withheld, the count is not, and the sentence says what was withheld rather than
     leaving a gap a reader fills in with the number she feared. */
  const below = expectedZones.filter(zone => rosteredIn(zone) < floor);
  expect(below.length, 'the seeded roster leaves at least one suburb below the floor').toBeGreaterThan(0);

  for (const zone of below) {
    const rostered = rosteredIn(zone);
    const counts = openByZone.get(zone)!;
    const proportion = row(page, zone).locator('.zone-safety__proportion');
    await expect(proportion).toHaveText(fill(overlay.share.suppressedSentence, {
      zone, open: String(counts.open), rostered: String(rostered), nursePlural: rostered === 1 ? '' : 's'
    }));
    /* Suppressed is not hidden: the same row still draws its counts, and the mark on the proportion is
       the contract's own sentence rather than an empty cell. */
    await expect(proportion).toHaveClass(/is-suppressed/);
    await expect(row(page, zone).locator('.zone-safety__counts')).toContainText(`${counts.open} open`);
    /* No token left unfilled, which is what a sentence read from the wrong place looks like on a screen. */
    await expect(proportion).not.toContainText('{');
  }

  /* A suburb at or above the floor draws two integers. The founder set the default to the lowest bound so
     that one does on this roster — at five, none did and the setting governed nothing an operator saw — so
     at least one is asserted, from the roster and the contract rather than a suburb typed here. */
  const atOrAbove = expectedZones.filter(z => rosteredIn(z) >= floor);
  expect(atOrAbove.length, `at the default floor of ${floor} the seeded desk draws a proportion over at least one suburb`).toBeGreaterThan(0);
  for (const zone of atOrAbove) {
    const counts = openByZone.get(zone)!;
    await expect(row(page, zone).locator('.zone-safety__proportion'))
      .toHaveText(fill(overlay.share.sentence, { zone, holders: String(counts.holders.size), rostered: String(rosteredIn(zone)), nursePlural: '' }));
  }

  /* The note under the list is the setting's own label and help and the contract's sentence about what
     the floor governs, so the panel and the Configuration tab cannot be two documents. */
  await expect(panel(page).locator('.zone-safety__floor')).toContainText(floorItem.label);
  await expect(panel(page).locator('.zone-safety__floor')).toContainText(overlay.whyCountsAreNeverFloored);
});

test('the overlay counts the desk queue it is drawn from, and a resolved panic counts towards nothing', async ({ page }) => {
  await openBoard(page);
  /* The map and the desk are the same arithmetic on the same timers and panics, so the panel's totals
     are the desk's own rows grouped by suburb and cannot disagree with them. The seeded desk also holds
     a panic resolved three hours ago; it is on no row here, which is what "open" means. */
  const totalOpen = [...openByZone.values()].reduce((sum, counts) => sum + counts.open, 0);
  await expect(panel(page).locator('.zone-safety__head')).toContainText(
    fill(overlay.totalSentence, { open: String(totalOpen), zones: String(expectedZones.length), zonePlural: expectedZones.length === 1 ? '' : 's' })
  );
  /* The resolved panic's suburb is drawn once, for the overdue timer in it, and not twice. */
  await expect(panel(page).locator('.zone-safety__zone', { hasText: late.zone })).toHaveCount(1);
});

test('the overlay is drawn for the audience the desk queue admits, and for no other', async ({ page }) => {
  /* The gate is derived from the route's own callers rather than typed, so what is asserted here is the
     consequence of it: the operator sees the panel and the back office does not, on the same board
     component. The refusal is the reason the contract gives, not a panel that failed to load. */
  await openBoard(page);
  await expect(panel(page)).toBeVisible();

  await openAdminConsole(page);
  await goSection(page, 'Operations');
  /* The board is on this screen — the back office draws the same DispatchBoard — and the overlay is not. */
  await expect(page.locator('.oi-map-card, .oi-dispatch').first()).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  /* Nothing about an open panic reaches this screen either: it is a nurse's afternoon and the funding
     view is not the desk. */
  const adminText = await page.locator('main').innerText();
  expect(adminText, 'no nurse\'s suburb is named with an open panic on the back office').not.toContain(overlay.heading);
});

test('a quiet board says so in the contract\'s words rather than drawing an empty list', async ({ page }) => {
  await openBoard(page);
  /* The panel's empty state is the contract's own sentence. It is reached by closing what is open — the
     overdue picked up and closed with a true reason, the panic picked up and resolved with an outcome —
     from the Incidents desk, which is where an operator does it. */
  await goSection(page, 'Incidents');
  const desk = page.getByRole('region', { name: contract.desk.heading });
  const silence = contract.silenceReasons.find((reason: { needsNurseAnswer: boolean }) => !reason.needsNurseAnswer);
  const overdue = desk.locator('.fs-row').filter({ hasText: 'CHK-0412' });
  await overdue.getByRole('button', { name: contract.desk.pickUp }).click();
  await overdue.getByLabel(contract.desk.reasonQuestion).selectOption(silence.id);
  await overdue.getByRole('button', { name: contract.desk.close, exact: true }).click();
  await expect(overdue).toContainText(fill(contract.desk.closedLine, { outcome: silence.label }));

  const panic = desk.locator('.fs-row').filter({ hasText: 'PNC-0088' });
  await panic.getByRole('button', { name: contract.desk.pickUp }).click();
  await panic.getByLabel(contract.desk.outcomeQuestion).selectOption(contract.outcomes[0].id);
  await panic.getByRole('button', { name: contract.desk.resolve }).click();
  await expect(panic).toContainText(fill(contract.desk.closedLine, { outcome: contract.outcomes[0].label }));

  await goSection(page, 'Dispatch');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText(overlay.noZoneSentence);
  /* An empty board draws no suburb rows at all, rather than six suburbs each reading zero. */
  await expect(panel(page).locator('.zone-safety__row')).toHaveCount(0);
});

/* The founder decided on 2 October 2026, "Zone overlay floor — make it a parameter by the admin." So the floor is on
   Configuration in its own plain words, at the default he chose, and an admin who raises it — here to one above the
   largest suburb the seeded desk lands in — changes what the dispatch board draws on its next draw, in the same tab:
   the suburb that drew its proportion now says why it draws none, and its count is still drawn whole. */
test('the admin finds the floor on Configuration and raises it, and the board withholds the proportion it drew', async ({ page }) => {
  await openAdminConsole(page);
  await openConfiguration(page);
  await page.locator('.cf-area').getByLabel(say.search, { exact: true }).fill(floorItem.label);
  const settings = page.getByRole('region', { name: contract.settings.heading });
  const item = timingItem(settings, floorItem);
  await expect(item).toContainText(floorItem.help);
  await expect(item.locator('.ss-in-force')).toContainText(fill(say.values.count, { value: String(floor), unit: floorItem.unit }));
  await expect(item).toContainText(fill(say.decided, { who: 'Founder', on: '2 October 2026' }));
  const drawn = expectedZones.filter(zone => rosteredIn(zone) >= floor);
  const raised = Math.max(...drawn.map(rosteredIn)) + 1;
  const form = await openChangeForm(settings, floorItem);
  await form.getByLabel(editorLabel(floorItem), { exact: true }).fill(String(raised));
  await form.getByLabel(say.reason, { exact: true }).fill('Operations would rather read counts alone until the roster is larger.');
  await form.getByRole('button', { name: say.review }).click();
  await form.getByRole('button', { name: say.confirm }).click();
  await expect(item.locator('.ss-in-force')).toContainText(fill(say.values.count, { value: String(raised), unit: floorItem.unit }));

  await chooseRole(page, 'Control Tower');
  await goSection(page, 'Dispatch');
  await expect(panel(page)).toBeVisible();
  for (const zone of drawn) {
    const counts = openByZone.get(zone)!;
    const rostered = rosteredIn(zone);
    await expect(row(page, zone).locator('.zone-safety__proportion')).toHaveText(fill(overlay.share.suppressedSentence, {
      zone, open: String(counts.open), rostered: String(rostered), nursePlural: rostered === 1 ? '' : 's'
    }));
    await expect(row(page, zone).locator('.zone-safety__counts')).toContainText(`${counts.open} open`);
  }
});
